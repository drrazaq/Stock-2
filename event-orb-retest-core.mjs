// EVENT_ORB_RETEST_15D_V1: deterministic research and paper-simulation only.
// It never fetches prices, publishes an eligibility record, sends a signal, or accesses a broker.
import crypto from 'node:crypto';
import { COST_SCENARIOS, DEFAULT_COST, metrics, simulateLong } from './evidence-core.mjs';

const MINUTE = 60_000;
const BAR_MS = 5 * MINUTE;
const BAR_DURATION_MS = BAR_MS;
const NY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', hourCycle: 'h23',
});
const SYMBOL = /^[A-Z.\-]{1,8}$/;
const iso = ms => new Date(ms).toISOString();
const hash = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

export const EVENT_ORB_RETEST_SPEC = Object.freeze({
  id: 'EVENT_ORB_RETEST_15D_V1',
  version: 1,
  barMinutes: 5,
  sourceDelayMinutes: 15,
  session: 'America/New_York regular session 09:30-16:00 weekdays',
  event: {
    requiredVerification: 'VERIFIED_PRIMARY_CONTENT',
    requiredUniverse: true,
    requiredUnblocked: true,
    requiredTimestamps: ['publishedAt', 'capturedAt', 'availableAt'],
  },
  openingRange: { bars: 3, after: 'effective event availability' },
  retest: { triggerTolerancePct: 0.002, confirmation: 'next bar closes above retest high and session VWAP' },
  economics: { rewardRisk: 1.5, maxTriggerPremiumPct: 0.03, maxEntryRiskPct: 0.12, horizonBars: 78 },
  fill: { rule: 'next regular-session bar start after confirmation is observable', bothStopTarget: 'stop_first' },
});
export const EVENT_ORB_RETEST_RULE_HASH = hash(EVENT_ORB_RETEST_SPEC);

function parts(ms) {
  return Object.fromEntries(NY_FORMAT.formatToParts(new Date(ms)).filter(x => x.type !== 'literal').map(x => [x.type, x.value]));
}
function nyDate(ms) {
  const p = parts(ms);
  return `${p.year}-${p.month}-${p.day}`;
}
function nyMinutes(ms) {
  const p = parts(ms);
  return +p.hour * 60 + +p.minute;
}
function parseMs(value, { requireAware = false } = {}) {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return Math.trunc(value);
  if (typeof value !== 'string' || !value.trim()) return null;
  if (requireAware && !/(Z|[+-]\d\d:\d\d)$/i.test(value.trim())) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}
function number(value) { return Number.isFinite(+value) ? +value : null; }
function validBar(raw) {
  if (!raw || !Number.isFinite(+raw.t)) return false;
  const o = number(raw.o), h = number(raw.h), l = number(raw.l), c = number(raw.c), v = number(raw.v);
  return o !== null && h !== null && l !== null && c !== null && v !== null && o > 0 && h > 0 && l > 0 && c > 0 && v >= 0 && l <= h && h >= Math.max(o, c) && l <= Math.min(o, c);
}
function rthBarStart(ms) {
  const p = parts(ms), minutes = +p.hour * 60 + +p.minute;
  return !['Sat', 'Sun'].includes(p.weekday) && minutes >= 570 && minutes < 960 && +p.minute % 5 === 0 && +p.second === 0;
}
function nextRthStart(ms) {
  let candidate = Math.floor(ms / BAR_MS) * BAR_MS + BAR_MS;
  // At most 8 calendar days are needed to cross a weekend or an unexpected missing weekday.
  for (let i = 0; i < 8 * 24 * 12; i++, candidate += BAR_MS) if (rthBarStart(candidate)) return candidate;
  return null;
}
function firstRthStartAtOrAfter(ms) {
  let candidate = Math.ceil(ms / BAR_MS) * BAR_MS;
  for (let i = 0; i < 8 * 24 * 12; i++, candidate += BAR_MS) if (rthBarStart(candidate)) return candidate;
  return null;
}
function firstRthStartStrictAfter(ms) {
  return nextRthStart(Math.floor(ms / BAR_MS) * BAR_MS);
}
function barAvailableAt(t, delayMinutes) { return t + BAR_DURATION_MS + delayMinutes * MINUTE; }
function nextExpectedRth(t) { return nextRthStart(t); }
function weightedVwap(rows) {
  const usable = rows.filter(validBar);
  const vol = usable.reduce((s, b) => s + +b.v, 0);
  if (!(vol > 0)) return null;
  return usable.reduce((s, b) => s + ((Number.isFinite(+b.vw) ? +b.vw : (+b.h + +b.l + +b.c) / 3) * +b.v), 0) / vol;
}
function reject(reason, detail = null) { return { status: 'REJECTED', allowBuy: false, reason, detail }; }

export function normaliseBars(rows) {
  const bars = new Map();
  const duplicates = new Set();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const t = number(raw?.t);
    if (t === null || t < 0 || t % 1 !== 0) continue;
    if (bars.has(t)) { duplicates.add(t); continue; }
    bars.set(t, { ...raw, t: Math.trunc(t), valid: validBar(raw) });
  }
  for (const t of duplicates) bars.set(t, { t, valid: false, duplicate: true });
  return bars;
}

export function validatePrimaryEvent(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'invalid_event_record' };
  const eventId = typeof raw.eventId === 'string' && raw.eventId.trim() ? raw.eventId.trim() : null;
  const sym = String(raw.sym || raw.symbol || '').trim().toUpperCase();
  if (!eventId) return { ok: false, reason: 'missing_event_id' };
  if (!SYMBOL.test(sym)) return { ok: false, reason: 'missing_symbol' };
  if (typeof raw.sourceUrl !== 'string' || !raw.sourceUrl.startsWith('https://')) return { ok: false, reason: 'missing_primary_source_url' };
  if (raw.verificationStatus !== 'VERIFIED_PRIMARY_CONTENT') return { ok: false, reason: 'verification_not_confirmed_primary_content' };
  if (raw.tradableUniverseVerified !== true) return { ok: false, reason: 'tradable_universe_not_verified' };
  if (raw.blocked !== false) return { ok: false, reason: 'event_blocked' };
  const publishedAt = parseMs(raw.publishedAt, { requireAware: true }), capturedAt = parseMs(raw.capturedAt, { requireAware: true }), availableAt = parseMs(raw.availableAt, { requireAware: true });
  if ([publishedAt, capturedAt, availableAt].some(x => x === null)) return { ok: false, reason: 'missing_or_invalid_event_timestamps' };
  return {
    ok: true,
    event: {
      eventId, sym, kind: String(raw.kind || 'unclassified_primary_event'), sourceUrl: raw.sourceUrl,
      publishedAt, capturedAt, availableAt,
      effectiveAvailableAt: Math.max(publishedAt, capturedAt, availableAt),
      eventDate: nyDate(publishedAt),
    },
  };
}

function required(map, t, asOf, delayMinutes) {
  if (barAvailableAt(t, delayMinutes) > asOf) throw new Error('bar_not_observable_by_as_of');
  const bar = map.get(t);
  if (!bar) throw new Error('bar_gap');
  if (!bar.valid) throw new Error(bar.duplicate ? 'duplicate_or_invalid_bar' : 'invalid_ohlc');
  return bar;
}
function requiredPath(map, start, end, asOf, delayMinutes) {
  const out = [];
  let t = start;
  while (t !== null && t <= end) {
    out.push(required(map, t, asOf, delayMinutes));
    if (t === end) return out;
    t = nextExpectedRth(t);
  }
  throw new Error('bar_path_unresolvable');
}

/**
 * Builds a deterministic research plan only from bars observable at `asOf`.
 * A valid output is not a current executable order: source delay is preserved.
 */
export function buildEventOrbRetestPlan({ event: rawEvent, bars, asOf, sourceDelayMinutes = EVENT_ORB_RETEST_SPEC.sourceDelayMinutes }) {
  const checked = validatePrimaryEvent(rawEvent);
  if (!checked.ok) return reject(checked.reason);
  const asOfMs = parseMs(asOf, { requireAware: true });
  if (asOfMs === null) return reject('invalid_as_of_timestamp');
  const delay = Number.isFinite(+sourceDelayMinutes) && +sourceDelayMinutes >= 0 ? +sourceDelayMinutes : EVENT_ORB_RETEST_SPEC.sourceDelayMinutes;
  const map = normaliseBars(bars);
  if (!map.size) return reject('missing_symbol_series');
  const event = checked.event;
  if (event.effectiveAvailableAt > asOfMs) return reject('event_not_available_by_as_of');

  try {
    const starts = [];
    let t = firstRthStartStrictAfter(event.effectiveAvailableAt);
    if (t === null) return reject('no_regular_session_after_event');
    for (let i = 0; i < EVENT_ORB_RETEST_SPEC.openingRange.bars; i++) {
      starts.push(t);
      t = nextExpectedRth(t);
      if (t === null && i < EVENT_ORB_RETEST_SPEC.openingRange.bars - 1) return reject('initial_range_crosses_session_boundary');
    }
    if (new Set(starts.map(nyDate)).size !== 1) return reject('initial_range_crosses_session_boundary');
    const opening = starts.map(x => required(map, x, asOfMs, delay));
    const trigger = Math.max(...opening.map(x => +x.h));
    const stop = Math.min(...opening.map(x => +x.l));
    const initialRange = trigger - stop;
    if (!(trigger > stop && stop > 0)) return reject('invalid_initial_range');

    let retest = null, confirm = null, path = [...opening];
    let scanAt = nextExpectedRth(starts.at(-1));
    for (let i = 0; i < 39 && scanAt !== null; i++) {
      const candidate = required(map, scanAt, asOfMs, delay);
      path.push(candidate);
      if (+candidate.l <= stop) return reject('stop_invalidated_before_retest');
      const touchesTrigger = +candidate.l <= trigger * (1 + EVENT_ORB_RETEST_SPEC.retest.triggerTolerancePct);
      if (touchesTrigger && +candidate.c > trigger) {
        const confirmationAt = nextExpectedRth(scanAt);
        if (confirmationAt === null) return reject('confirmation_crosses_session_boundary');
        const next = required(map, confirmationAt, asOfMs, delay);
        const sessionVwap = weightedVwap([...path, next]);
        if (sessionVwap !== null && +next.c > +candidate.h && +next.c > sessionVwap) {
          retest = candidate;
          confirm = { ...next, sessionVwap };
          break;
        }
      }
      scanAt = nextExpectedRth(scanAt);
    }
    if (!retest || !confirm) return reject('no_retest_confirmation');

    const entryAt = firstRthStartAtOrAfter(barAvailableAt(confirm.t, delay));
    if (entryAt === null) return reject('no_regular_entry_bar');
    const entryBar = required(map, entryAt, asOfMs, delay);
    const entryReference = +entryBar.o;
    const target = trigger + EVENT_ORB_RETEST_SPEC.economics.rewardRisk * initialRange;
    if (entryReference < trigger || entryReference > trigger * (1 + EVENT_ORB_RETEST_SPEC.economics.maxTriggerPremiumPct)) return reject('entry_open_outside_trigger_cap');
    const riskPerShare = entryReference - stop;
    if (!(riskPerShare > 0 && target > entryReference && riskPerShare / entryReference <= EVENT_ORB_RETEST_SPEC.economics.maxEntryRiskPct)) return reject('risk_exceeds_12pct');

    const immutable = {
      setupId: EVENT_ORB_RETEST_SPEC.id, ruleHash: EVENT_ORB_RETEST_RULE_HASH, eventId: event.eventId,
      sym: event.sym, eventAvailableAt: iso(event.effectiveAvailableAt), observationBars: starts,
      retestAt: retest.t, confirmationAt: confirm.t, entryAt, trigger, stop, target, entryReference,
    };
    return {
      status: 'PAPER_PLAN_ONLY',
      allowBuy: false,
      setupId: EVENT_ORB_RETEST_SPEC.id,
      ruleHash: EVENT_ORB_RETEST_RULE_HASH,
      planId: `${event.eventId}:${EVENT_ORB_RETEST_SPEC.id}:${confirm.t}`,
      planHash: hash(immutable),
      symbol: event.sym,
      event: { id: event.eventId, kind: event.kind, sourceUrl: event.sourceUrl, publishedAt: iso(event.publishedAt), capturedAt: iso(event.capturedAt), availableAt: iso(event.availableAt), effectiveAvailableAt: iso(event.effectiveAvailableAt) },
      observedAt: iso(asOfMs),
      data: { intervalMinutes: 5, sourceDelayMinutes: delay, completedBarsOnly: true },
      evidence: {
        openingRange: { startAt: iso(starts[0]), endAt: iso(starts.at(-1)), high: trigger, low: stop, initialRange },
        retestAt: iso(retest.t), retestHigh: +retest.h, confirmationAt: iso(confirm.t), confirmationClose: +confirm.c, sessionVwap: confirm.sessionVwap,
      },
      plan: {
        entryReference, entryAt: iso(entryAt), stop, target, riskPerShare,
        targetMultipleR: EVENT_ORB_RETEST_SPEC.economics.rewardRisk,
        cancellationReasons: ['entry opens over 3% above trigger', 'opening-range low breaks before entry', 'primary event is contradicted', 'halt, stale data, or incomplete bar path'],
      },
      executionBoundary: 'Paper fill is measured only after the delayed entry bar is complete. This delayed data lane cannot provide a live executable entry price or issue a BUY.',
      limitations: ['Research and paper simulation only.', 'Primary event verification, Halal status, offering/dilution blocks and all Stock-2 evidence gates remain separate.', 'No broker, ZAD, scanner eligibility or Telegram action is touched.'],
    };
  } catch (error) {
    return reject(error instanceof Error ? error.message : 'unknown_plan_error');
  }
}

function expectedPath(map, first, count) {
  const bars = [];
  let t = first;
  for (let i = 0; i < count; i++) {
    const b = map.get(t);
    if (!b?.valid) return null;
    bars.push(b);
    t = nextExpectedRth(t);
    if (t === null && i < count - 1) return null;
  }
  return bars;
}

export function resolvePaperOutcome({ plan, bars, asOf, cost = DEFAULT_COST }) {
  if (!plan || plan.status !== 'PAPER_PLAN_ONLY' || !plan.plan?.entryAt) return { status: 'NOT_RESOLVABLE', reason: 'missing_paper_plan' };
  const asOfMs = parseMs(asOf, { requireAware: true });
  if (asOfMs === null) return { status: 'NOT_RESOLVABLE', reason: 'invalid_as_of_timestamp' };
  const map = normaliseBars(bars);
  const delay = +plan.data?.sourceDelayMinutes;
  const entryAt = parseMs(plan.plan.entryAt);
  if (!map.size || entryAt === null || !Number.isFinite(delay)) return { status: 'NOT_RESOLVABLE', reason: 'missing_bars_or_plan_timing' };
  const path = expectedPath(map, entryAt, EVENT_ORB_RETEST_SPEC.economics.horizonBars);
  if (!path) return { status: 'PENDING', reason: 'incomplete_horizon_path' };
  if (barAvailableAt(path.at(-1).t, delay) > asOfMs) return { status: 'PENDING', reason: 'horizon_not_observable_by_as_of' };
  const scenarios = {};
  for (const scenario of Object.keys(COST_SCENARIOS)) {
    const trade = simulateLong({
      symbol: plan.symbol, signalAt: plan.evidence.confirmationAt, entryBar: path[0], futureBars: path.slice(1),
      stop: plan.plan.stop, target: plan.plan.target, maxBars: EVENT_ORB_RETEST_SPEC.economics.horizonBars,
      scenario, tradeUsd: cost.referenceTradeUsd, cost,
      metadata: { setupId: plan.setupId, planId: plan.planId, planHash: plan.planHash, paperOnly: true },
    });
    if (trade) scenarios[scenario] = trade;
  }
  return Object.keys(scenarios).length ? { status: 'RESOLVED', resolvedAt: iso(asOfMs), scenarios } : { status: 'NOT_RESOLVABLE', reason: 'no_valid_scenario_outcome' };
}

/** Preserves each initial plan hash and appends later outcomes rather than rewriting the plan. */
export function appendPaperLedger(existing, plans, barsBySymbol, asOf, cost = DEFAULT_COST) {
  const ledger = existing && typeof existing === 'object' ? structuredClone(existing) : {};
  const records = Array.isArray(ledger.records) ? ledger.records : [];
  const byId = new Map(records.map(x => [x?.plan?.planId, x]));
  for (const plan of plans.filter(x => x?.status === 'PAPER_PLAN_ONLY')) {
    const old = byId.get(plan.planId);
    if (!old) {
      const record = { plan, planHash: plan.planHash, history: [{ type: 'PLAN_RECORDED', at: plan.observedAt, planHash: plan.planHash }] };
      records.push(record); byId.set(plan.planId, record);
    } else if (old.planHash !== plan.planHash) {
      old.history ||= [];
      if (!old.history.some(x => x.type === 'PLAN_HASH_CONFLICT' && x.observedPlanHash === plan.planHash)) old.history.push({ type: 'PLAN_HASH_CONFLICT', at: String(asOf), observedPlanHash: plan.planHash });
    }
  }
  for (const record of records) {
    if (!record?.plan || !record?.planHash || record.plan.planHash !== record.planHash) continue;
    const outcome = resolvePaperOutcome({ plan: record.plan, bars: barsBySymbol?.[record.plan.symbol] || [], asOf, cost });
    record.history ||= [];
    if (outcome.status === 'RESOLVED' && !record.history.some(x => x.type === 'OUTCOME_RESOLVED')) record.history.push({ type: 'OUTCOME_RESOLVED', at: outcome.resolvedAt, outcome });
  }
  const complete = records.map(r => r.history?.find(x => x.type === 'OUTCOME_RESOLVED')?.outcome?.scenarios?.midpoint).filter(Boolean);
  return {
    version: 1, setupId: EVENT_ORB_RETEST_SPEC.id, ruleHash: EVENT_ORB_RETEST_RULE_HASH, generatedAt: new Date().toISOString(),
    status: 'RESEARCH_PAPER_LEDGER_ONLY', allowBuy: false, records: records.sort((a, b) => String(a.plan?.observedAt).localeCompare(String(b.plan?.observedAt))),
    scorecard: metrics(complete),
    promotion: 'This ledger cannot promote itself. It is research-only until the separate historical study and all existing Stock-2 eligibility gates pass.',
  };
}

export function historicalStudy({ events, series, asOf, cost = DEFAULT_COST }) {
  const plans = [], rejected = {};
  const asOfMs = parseMs(asOf, { requireAware: true });
  for (const raw of Array.isArray(events) ? events : []) {
    const symbol = String(raw?.sym || raw?.symbol || '').toUpperCase();
    const plan = buildEventOrbRetestPlan({ event: raw, bars: series?.[symbol] || [], asOf, sourceDelayMinutes: EVENT_ORB_RETEST_SPEC.sourceDelayMinutes });
    if (plan.status === 'PAPER_PLAN_ONLY') plans.push(plan);
    else rejected[plan.reason] = (rejected[plan.reason] || 0) + 1;
  }
  const ledger = appendPaperLedger(null, plans, series, asOf, cost);
  const rows = ledger.records.map(r => ({ plan: r.plan, outcome: r.history.find(x => x.type === 'OUTCOME_RESOLVED')?.outcome || null })).filter(x => x.outcome?.scenarios?.midpoint);
  const dates = [...new Set(rows.map(x => x.plan.event.publishedAt.slice(0, 10)))].sort();
  const first = Math.floor(dates.length * 0.5), second = first + Math.floor(dates.length * 0.3);
  const label = d => dates.indexOf(d) < first ? 'train' : dates.indexOf(d) < second ? 'validation' : 'diagnostic_holdout';
  const scenarioPartitions = Object.fromEntries(Object.keys(COST_SCENARIOS).map(s => [s, { train: [], validation: [], diagnostic_holdout: [] }]));
  for (const row of rows) {
    const split = label(row.plan.event.publishedAt.slice(0, 10));
    for (const scenario of Object.keys(COST_SCENARIOS)) {
      const trade = row.outcome.scenarios[scenario];
      if (trade) scenarioPartitions[scenario][split].push(trade);
    }
  }
  const scenarioMetrics = Object.fromEntries(Object.entries(scenarioPartitions).map(([scenario, partitions]) => [scenario, Object.fromEntries(Object.entries(partitions).map(([split, trades]) => [split, metrics(trades)]))]));
  return {
    generatedAt: new Date().toISOString(), status: 'RESEARCH_ONLY', allowBuy: false,
    setupId: EVENT_ORB_RETEST_SPEC.id, ruleHash: EVENT_ORB_RETEST_RULE_HASH, asOf: asOfMs === null ? null : iso(asOfMs),
    coverage: { suppliedEvents: Array.isArray(events) ? events.length : 0, validPlans: plans.length, resolvedPlans: rows.length, rejected },
    splits: { method: 'Chronological unique event publication dates, 50% train / 30% validation / 20% diagnostic holdout. No parameter optimization is performed.', dates: { train: dates.slice(0, first), validation: dates.slice(first, second), diagnostic_holdout: dates.slice(second) } },
    scenarios: scenarioMetrics,
    midpoint: scenarioMetrics.midpoint,
    paperLedger: ledger,
    limitations: ['Chronological partitions report evidence only and do not authorize a BUY.', 'No matched non-event control is fabricated by this module; add a separately supplied, point-in-time control universe before claiming incremental edge.', 'Delayed five-minute bars make the plan paper research, not a live executable card.'],
  };
}
