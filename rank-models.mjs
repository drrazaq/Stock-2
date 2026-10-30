import {RANKING_COHORT_DECISION,primaryRankingDay} from './ranking-cohort.mjs';
// SHADOW RANKING EXPERIMENT (owner approved A/B/C on 28 Oct 2026; D added at the owner's request and FROZEN here the same day, before any
// D candidate existed; R and R0 are no-skill controls). Shadow only: nothing here changes which alert is sent (live ranking stays A,
// first come, until the owner approves a change after a separate confirmation period). Pure functions; shadow-outcomes.mjs runs them.
//
// STREAM E (models A, B, C, R): the research-lead candidates that met trigger EW-ALERT-1 (early-alerts.mjs) AND passed every hard rule
//   (1 USD+, not NOT HALAL, not AVOID, live SEC check with no danger filing) - data/opp-ledger.jsonl rows kind 'lead' whose decision is
//   SENT, LIMIT, MUTED or SEND FAILED - entered at their trigger minute (quote, next minute and +30 minutes from the shadow stream).
//   A  existing      first come, first served (exactly today's live behaviour)
//   B  opportunity-first: catalyst VERIFIED or UNCONFIRMED (fresh SEC filing or fresh headline), spread 1% or less, day move +6% or less,
//                    2M USD+ traded so far; first come among those
//   C  simple baseline: time-of-day volume pace 3x+ and spread 1% or less; first come among those
//   R  random control: 5 a day by a fixed hash of day+symbol (not executable live: it is the no-skill yardstick for A/B/C)
// STREAM F (model D): every 8-K / 6-K filing on the SEC's live feed, accepted 4:00-11:00 New York, joined to the watcher's prices
//   D  fresh company filing BEFORE the move (frozen criteria in dEligible below); first come by decision minute
// STREAM N (control R0): at 9:45 New York, 10 random liquid 1 USD+ stocks that have NOT moved (-3% to +3%), not NOT HALAL, not AVOID:
//   the "no information" yardstick for D (same entry and exit rules)
// RULES FOR ALL: at most 5 picks a day; decided at the candidate's own minute (no look-ahead, except R / R0 which are controls);
//   identical costs and exits (shadow-eval.mjs: ask entry or flagged assumed spread, exit half spread under, 0.6% fees, stress and
//   one-minute-delay variants); horizons 30 min, same-day close, 1 and 5 sessions.
// VERDICT (frozen): only sessions from 2026-10-29 count. After 20 such sessions and 50+ picks, a model is PROMISING only if, at BOTH the
//   same-day and 5-session horizons, its average, median and without-2-best net are all above A's AND above R's (D: above R0's), and its
//   average is above zero. PROMISING leads to a proposal for a separate 20-session confirmation period, never straight to live ranking.
import { score, stats, entryOf } from './shadow-eval.mjs';
import { NEG_ITEMS, DIL_ITEMS, itemsOf } from './early-alerts.mjs';

export const FROZEN = { date: '2026-10-28', evalFrom: '2026-10-29', cap: 5, minSessions: 20, minPicks: 50, controlsPerDay: 10 };
export const spr = (r) => (Number.isFinite(r.bid) && Number.isFinite(r.ask) && r.bid > 0 && r.ask >= r.bid ? (r.ask - r.bid) / (r.ask / 2 + r.bid / 2) : null);
export const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
export const MODELS = {
  A: { stream: 'E', name: 'existing: first come', accept: () => true },
  B: { stream: 'E', name: 'opportunity-first', accept: (r) => (r.cat === 'VERIFIED' || r.cat === 'UNCONFIRMED') && spr(r) !== null && spr(r) <= 0.01 && r.chg <= 0.06 && r.dollarVol >= 2e6 },
  C: { stream: 'E', name: 'simple baseline (volume pace + spread)', accept: (r) => r.rvT >= 3 && spr(r) !== null && spr(r) <= 0.01 },
  R: { stream: 'E', name: 'random control', random: true },
  D: { stream: 'F', name: 'fresh company filing before the move', accept: (r) => r.dEligible === true },
  R0: { stream: 'N', name: 'no-information control', random: true },
};

// D criteria (frozen 28 Oct). q: { form, items, atM, decM, chg, price, prevDollarVol, spread, spreadFresh, halalFail, lottery, sec: {known, tags} }
export function dEligible(q) {
  const why = [];
  if (!/^(8-K|6-K)$/.test(q.form)) why.push('not an 8-K / 6-K (amendments excluded)');
  const it = itemsOf(q.items); if (it.some(x => NEG_ITEMS.includes(x))) why.push('negative item ' + it.filter(x => NEG_ITEMS.includes(x)).join(','));
  if (it.some(x => DIL_ITEMS.includes(x))) why.push('financing / dilution item ' + it.filter(x => DIL_ITEMS.includes(x)).join(','));
  if (!(q.atM >= 240 && q.atM <= 660)) why.push('accepted outside 4:00-11:00 New York');
  if (!(q.decM >= 570 && q.decM <= 660)) why.push('no live price between 9:30 and 11:00');
  if (!(q.chg >= -0.03 && q.chg <= 0.03)) why.push(q.chg > 0.03 ? 'already moved over +3%' : 'down over 3%');
  if (!(q.price >= 1)) why.push('under 1 USD'); if (!(q.prevDollarVol >= 1e6)) why.push('under 1M USD traded the day before');
  if (q.spreadFresh && q.spread !== null && q.spread > 0.02) why.push('spread over 2%');
  if (q.halalFail) why.push('NOT HALAL'); if (q.lottery >= 0.15) why.push('AVOID list');
  if(q.sec?.status==='NO_ISSUER_RECORD')why.push('NO_ISSUER_RECORD (not inferred instrument type)');else if(q.sec?.policyExcluded)why.push('instrument policy exclusion');else if(q.sec?.admissionBlocked)why.push('instrument identity UNKNOWN');
  if ((!q.sec || !q.sec.known)&&!q.sec?.policyExcluded&&q.sec?.status!=='NO_ISSUER_RECORD') why.push('SEC check failed'); else if (q.sec.tags && q.sec.tags.length) why.push('SEC danger: ' + q.sec.tags.join(', '));
  return { eligible: why.length === 0, why };
}

// online pick: candidates of one day in time order, accepted while under the cap; random models: by hash
export function pick(dayRows, model, cap = FROZEN.cap) {
  if (model.random) return dayRows.slice().sort((a, b) => hash(a.d + a.sym) - hash(b.d + b.sym)).slice(0, cap);
  const out = []; for (const r of dayRows.slice().sort((a, b) => a.m - b.m || (a.sym < b.sym ? -1 : 1))) { if (out.length >= cap) break; if (model.accept(r)) out.push(r); } return out;
}
const HZ = ['m30', 'day', 'd1', 'd5', 'dayDelayed', 'dayStress', 'd5Stress'];
const scoreRow = (r, outcomes) => score(r.e, outcomes[r.d + '|' + r.sym] || {}, { last: r.last });
function summarizePicks(rows, outcomes) {
  const sc = rows.map(r => ({ r, s: scoreRow(r, outcomes) })), by = {}; for (const h of HZ) by[h] = stats(sc.map(x => x.s[h]));
  const days = {}; for (const x of sc) if (x.s.day !== null) (days[x.r.d] || (days[x.r.d] = [])).push(x.s.day);   // equal-weight daily portfolio of the picks, 1,000 USD each
  let eq = 0, peak = 0, dd = 0; for (const d of Object.keys(days).sort()) { eq += days[d].reduce((a, b) => a + b, 0) * 1000; peak = Math.max(peak, eq); dd = Math.min(dd, eq - peak); }
  const ms = rows.map(r => r.m).sort((a, b) => a - b), cs = rows.map(r => r.chg).filter(Number.isFinite).sort((a, b) => a - b);
  return { picks: rows.length, sessions: Object.keys(days).length, ...by, portfolioUsd: Math.round(eq), maxDrawdownUsd: Math.round(dd), medianMinute: ms.length ? ms[Math.floor(ms.length / 2)] : null, medianMoveAtPick: cs.length ? +cs[Math.floor(cs.length / 2)].toFixed(4) : null,
    assumedSpreadShare: sc.length ? +(sc.filter(x => x.s.assumedSpread).length / sc.length).toFixed(3) : null };
}
// streams: { E: rows, F: rows, N: rows } with r = { d, sym, m, chg, e: {px,bid,ask,qAgeSec,next,px30}, last, ...model inputs }
export function evaluate(streams, outcomes = {}, from = FROZEN.evalFrom, {secondary=false}={}) {
  const out = { frozen: FROZEN,cohort:secondary?'SECONDARY_RECONSTRUCTION':'PRIMARY',admissionDecision:RANKING_COHORT_DECISION, models: {}, streams: {} };
  for (const [k, rows] of Object.entries(streams)) { const rs = rows.filter(r => r.d >= from && (secondary||primaryRankingDay(r.d))); out.streams[k] = { candidates: rs.length, sessions: new Set(rs.map(r => r.d)).size, all: summarizePicks(rs.filter(r => k !== 'F' || r.dEligible), outcomes) }; }
  for (const [id, M] of Object.entries(MODELS)) { const rs = (streams[M.stream] || []).filter(r => r.d >= from && (secondary||primaryRankingDay(r.d))), byDay = {}; for (const r of rs) (byDay[r.d] || (byDay[r.d] = [])).push(r);
    out.models[id] = { name: M.name, stream: M.stream, ...summarizePicks(Object.values(byDay).flatMap(d => pick(d, M)), outcomes) }; }
  // alert-cap opportunity cost (stream E): what A's first five did vs the eligible candidates that arrived after the cap, and a hindsight
  // best five (an upper bound nobody could pick live, shown only to size what first-come gives up)
  { const rs = (streams.E || []).filter(r => r.d >= from && (secondary||primaryRankingDay(r.d))), byDay = {}; for (const r of rs) (byDay[r.d] || (byDay[r.d] = [])).push(r); const first = [], after = [], best = [];
    for (const d of Object.values(byDay)) { const a = pick(d, MODELS.A), set = new Set(a.map(x => x.sym)); first.push(...a); after.push(...d.filter(x => !set.has(x.sym)));
      best.push(...d.map(r => ({ r, v: scoreRow(r, outcomes).day })).filter(x => x.v !== null).sort((x, y) => y.v - x.v).slice(0, FROZEN.cap).map(x => x.r)); }
    out.capCost = { firstFive: summarizePicks(first, outcomes), afterCap: summarizePicks(after, outcomes), hindsightBestFive: summarizePicks(best, outcomes) }; }
  // frozen verdict
  const v = (m, base) => ['day', 'd5'].every(h => m[h].n && base[h].n && m[h].avg > base[h].avg && m[h].median > base[h].median && (m[h].noTop2 ?? -1) > (base[h].noTop2 ?? -1)) && m.day.avg > 0 && m.d5.avg > 0;
  for (const id of ['B', 'C', 'D']) { const m = out.models[id], ref = id === 'D' ? [out.models.R0] : [out.models.A, out.models.R];
    m.verdict = m.sessions < FROZEN.minSessions || m.picks < FROZEN.minPicks ? 'COLLECTING (' + m.sessions + ' of ' + FROZEN.minSessions + ' sessions, ' + m.picks + ' of ' + FROZEN.minPicks + ' picks)'
      : ref.every(b => v(m, b)) ? 'PROMISING: propose a separate 20-session confirmation period' : 'NOT BETTER than ' + (id === 'D' ? 'the no-information control' : 'first come / random'); }
  if(secondary)for(const m of Object.values(out.models))m.verdict='SECONDARY ONLY: no primary or confirmation verdict';
  return out;
}
