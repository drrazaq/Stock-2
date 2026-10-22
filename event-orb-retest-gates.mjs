// Stock-2 gates on top of the EVENT_ORB_RETEST_15D_V1 report (research only). The lane's own rule is not changed; this reads
// its study output (data/event-orb-retest-15d-study.json), the matched non-event control study and SPY minute bars, and
// applies the house gates, pre-registered here and evaluated once (no parameter is tuned after seeing a result):
//   - whole set split into an older and a newer half by entry date (the first half of the distinct entry days is "older");
//   - costs 0.8% (base, scenario "midpoint") and 1.2% (stress, scenario "worst"), per-trade net at 1,000 USD;
//   - yardsticks: (1) the same stock on non-event days with the same mechanical setup (control study: same stock, same New
//     York clock time, nearest clear weekday >= 7 days earlier), (2) the S&P 500 (SPY) over the same minutes, a proxy for
//     the average stock over those minutes, labelled as such;
//   - without the 2 best trades; distinct days and distinct stocks; median and worst day; date-clustered t (one mean per
//     entry day, t over days);
//   - luck bar: t must reach max(3.0, the league bar in data/agent-league.json).
// Coverage floor for any verdict: 30 resolved trades, 10 distinct days, 10 distinct stocks; below that the status is
// "needs data". PASS needs, in BOTH halves at BOTH costs: mean net > 0, t >= bar, positive without the 2 best trades,
// beats SPY over the same minutes, beats the same-stock control (control n >= 10 in that half; thinner controls cap the
// verdict at "needs data"). Anything else is REJECTED. Output: data/event-orb-retest-15d-gates.json.
import fs from 'node:fs';
import { fetchStockDays, budget, save } from './event-orb-retest-bars.mjs';
import { latestBlock } from './first-run.mjs';   // run once: the first complete verdict (PASS or REJECTED) is frozen (22 Oct 2026)
const env = process.env, STUDY = env.EVENT_ORB_STUDY || 'data/event-orb-retest-15d-study.json', CSTUDY = env.EVENT_ORB_CONTROL_STUDY || 'data/event-orb-retest-15d-control-study.json', OUT = env.EVENT_ORB_GATES || 'data/event-orb-retest-15d-gates.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const MIN_N = 30, MIN_DAYS = 10, MIN_STOCKS = 10, MIN_CONTROL = 10, SCEN = { midpoint: 'cost 0.8% (base)', worst: 'cost 1.2% (stress)' };
const league = J('data/agent-league.json', {}), BAR = Math.max(3.0, +(league && league.bar) || 0);
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const dayT = (T) => { const by = new Map(); for (const x of T) (by.get(x.day) || by.set(x.day, []).get(x.day)).push(x.netPct); const dm = [...by.values()].map(mean), m = mean(dm); if (dm.length < 2) return { t: null, dayMeans: dm }; const sd = Math.sqrt(dm.reduce((a, v) => a + (v - m) ** 2, 0) / (dm.length - 1)); return { t: sd > 0 ? m / (sd / Math.sqrt(dm.length)) : null, dayMeans: dm }; };
const tradesOf = (study, scenario) => ((study && study.paperLedger && study.paperLedger.records) || []).map(r => { const o = (r.history || []).find(x => x.type === 'OUTCOME_RESOLVED'); const tr = o && o.outcome && o.outcome.scenarios && o.outcome.scenarios[scenario]; return tr ? { ...tr, eventId: r.plan.event.id, eventKind: r.plan.event.kind } : null; }).filter(Boolean);

const study = J(STUDY, null), cstudy = J(CSTUDY, null);
// RUN ONCE: "every gate here was written before the first run and is evaluated once". The first complete verdict (PASS or REJECTED,
// not 'needs data') is frozen in firstRun; the top level keeps carrying that frozen verdict (event-orb-retest-library.mjs reads it),
// and a later run (other inputs, more events) only fills `latest`, which is MONITORING ONLY. An output written before this freeze
// existed (status PASS/REJECTED, no firstRun) is taken as the first run.
const PREVG = J(OUT, null), strip = (o) => { const { firstRun, latest, ...rest } = o || {}; return rest; };
const PREVFIRST = PREVG && (PREVG.firstRun || (/^(PASS|REJECTED)$/.test(PREVG.status || '') ? { ...strip(PREVG), frozenAt: PREVG.generatedAt || null } : null));
const write = (o0) => { let o = o0;
  if (PREVFIRST) o = { ...strip(PREVFIRST), generatedAt: new Date().toISOString(), firstRun: PREVFIRST, latest: latestBlock(o0) };
  else if (/^(PASS|REJECTED)$/.test(o0.status || '')) o = { ...o0, firstRun: { ...o0, frozenAt: new Date().toISOString() }, latest: null };
  fs.writeFileSync(OUT, JSON.stringify(o, null, 1)); console.log('evr-gates: ' + o.status + (o.why ? ' - ' + o.why : '') + (PREVFIRST ? ' (frozen first run; this run, monitoring only: ' + o0.status + ')' : '')); };
if (!study || !study.paperLedger) { write({ generatedAt: new Date().toISOString(), status: 'needs data', why: 'no lane study output at ' + STUDY + (study && study.reason ? ' (' + study.reason + ')' : ''), allowBuy: false, bar: BAR }); process.exit(0); }
const base = tradesOf(study, 'midpoint');
if (!base.length) { write({ generatedAt: new Date().toISOString(), status: 'needs data', why: 'the lane resolved 0 trades (coverage ' + JSON.stringify(study.coverage) + ')', allowBuy: false, bar: BAR, laneCoverage: study.coverage, laneRejected: study.coverage && study.coverage.rejected }); process.exit(0); }
// SPY over the same minutes (proxy for the average stock over those minutes)
const spyDays = [...new Set(base.map(x => x.day))].sort();
const spy = await fetchStockDays('SPY', spyDays); save();
const spyAt = new Map(spy.bars.map(b => [b.t, b]));
const spySame = (tr) => { const a = spyAt.get(Date.parse(tr.entryAt)), b = spyAt.get(Date.parse(tr.exitAt)); return a && b && a.o > 0 ? b.c / a.o - 1 : null; };
// halves by entry day (older = first half of the distinct entry days)
const days = [...new Set(base.map(x => x.day))].sort(), cutDay = days[Math.floor(days.length / 2)];
const halfOf = (d) => d < cutDay ? 'older' : 'newer';
// a control belongs to the half of the event it was matched to (by that event's New York publication date), whether or not that event traded
const NYD = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const pairHalf = new Map();
try { for (const line of fs.readFileSync(env.EVENT_ORB_EVENTS || 'data/catalyst-events.jsonl', 'utf8').split('\n').filter(Boolean)) { const e = JSON.parse(line); if (e && e.eventId && e.publishedAt) pairHalf.set(e.eventId, halfOf(NYD.format(new Date(e.publishedAt)))); } } catch (e) {}
for (const x of base) pairHalf.set(x.eventId, halfOf(x.day));
function block(T, C) {
  if (!T.length) return { n: 0 };
  const net = T.map(x => x.netPct), srt = [...net].sort((a, b) => b - a), { t, dayMeans } = dayT(T);
  const sp = T.map(x => ({ n: x.netPct, s: spySame(x) })).filter(x => x.s !== null);
  const ctl = C.map(x => x.netPct);
  return { n: T.length, distinctDays: new Set(T.map(x => x.day)).size, distinctStocks: new Set(T.map(x => x.symbol)).size, meanNet: r4(mean(net)), medianNet: r4(median(net)), winRate: r4(net.filter(x => x > 0).length / net.length), totalNetUsd: +T.reduce((a, x) => a + x.netUsd, 0).toFixed(2), without2Best: r4(srt.length > 2 ? mean(srt.slice(2)) : null), medianDay: r4(median(dayMeans)), worstDay: r4(Math.min(...dayMeans)), bestDay: r4(Math.max(...dayMeans)), dayT: r4(t), exits: T.reduce((o, x) => { o[x.exitReason] = (o[x.exitReason] || 0) + 1; return o; }, {}),
    vsSpySameMinutes: { n: sp.length, meanTradeNet: r4(mean(sp.map(x => x.n))), meanSpy: r4(mean(sp.map(x => x.s))), meanExcess: r4(mean(sp.map(x => x.n - x.s))), label: 'S&P 500 (SPY) gross return over the same minutes, a proxy for the average stock over those minutes' },
    vsSameStockControl: { n: ctl.length, meanControlNet: r4(mean(ctl)), meanExcess: ctl.length ? r4(mean(net) - mean(ctl)) : null, controlPlansResolved: ctl.length, label: 'same stock, same rule, same New York clock time, on a matched non-event day' } };
}
const halves = {}, gates = [], fail = [], thin = [];
for (const sc of Object.keys(SCEN)) {
  const T = tradesOf(study, sc), C = tradesOf(cstudy, sc).map(x => ({ ...x, pairedEventId: String(x.eventId).replace(/^control:/, '').replace(/:\d{4}-\d\d-\d\d$/, '') }));
  halves[sc] = { label: SCEN[sc], whole: block(T, C), older: block(T.filter(x => halfOf(x.day) === 'older'), C.filter(x => pairHalf.get(x.pairedEventId) === 'older')), newer: block(T.filter(x => halfOf(x.day) === 'newer'), C.filter(x => pairHalf.get(x.pairedEventId) === 'newer')) };
}
const whole = halves.midpoint.whole;
const coverageOk = whole.n >= MIN_N && whole.distinctDays >= MIN_DAYS && whole.distinctStocks >= MIN_STOCKS;
if (!coverageOk) thin.push('coverage: ' + whole.n + ' trades on ' + whole.distinctDays + ' days in ' + whole.distinctStocks + ' stocks (needs ' + MIN_N + ' / ' + MIN_DAYS + ' / ' + MIN_STOCKS + ')');
for (const sc of Object.keys(SCEN)) for (const h of ['older', 'newer']) {
  const b = halves[sc][h], tag = h + ' half, ' + SCEN[sc];
  const g = (name, ok, detail) => { gates.push({ gate: name, half: h, scenario: sc, ok: !!ok, detail }); if (!ok) fail.push(name + ' (' + tag + ': ' + detail + ')'); };
  if (!b.n) { g('has trades', false, 'no trades'); continue; }
  g('mean net > 0', b.meanNet > 0, 'mean net ' + b.meanNet);
  g('t >= luck bar', b.dayT !== null && b.dayT >= BAR, 't ' + b.dayT + ' vs ' + BAR.toFixed(2));
  g('positive without the 2 best trades', b.without2Best !== null && b.without2Best > 0, 'without 2 best ' + b.without2Best);
  g('beats SPY over the same minutes', b.vsSpySameMinutes.n > 0 && b.vsSpySameMinutes.meanExcess > 0, 'excess ' + b.vsSpySameMinutes.meanExcess + ' on ' + b.vsSpySameMinutes.n + ' trades');
  if (b.vsSameStockControl.n >= MIN_CONTROL) g('beats the same stock on non-event days', b.vsSameStockControl.meanExcess > 0, 'excess ' + b.vsSameStockControl.meanExcess + ' vs ' + b.vsSameStockControl.n + ' control trades');
  else thin.push('same-stock control thin in the ' + tag + ': ' + b.vsSameStockControl.n + ' control trades (needs ' + MIN_CONTROL + ')');
}
const status = fail.length ? 'REJECTED' : (thin.length ? 'needs data' : 'PASS');
const out = { generatedAt: new Date().toISOString(), status, allowBuy: false, lane: 'EVENT_ORB_RETEST_15D_V1', ruleHash: study.ruleHash || null, asOf: study.asOf || null,
  why: fail.length ? fail.join('; ') : thin.length ? thin.join('; ') : 'every gate passed in both halves at both costs',
  bar: BAR, barSource: league && league.bar ? 'max(3.0, league bar ' + league.bar + ')' : '3.0 (no league bar found)',
  coverageFloor: { trades: MIN_N, distinctDays: MIN_DAYS, distinctStocks: MIN_STOCKS, controlTradesPerHalf: MIN_CONTROL }, split: { method: 'older = the first half of the distinct entry days', cutDay, days: days.length },
  laneCoverage: study.coverage, controlCoverage: cstudy ? cstudy.coverage : null, laneOwnReport: { splits: study.splits && study.splits.method, midpoint: study.midpoint },
  byEventKind: Object.entries(base.reduce((o, x) => { const k = x.eventKind; (o[k] = o[k] || []).push(x.netPct); return o; }, {})).map(([k, v]) => ({ kind: k, n: v.length, meanNet: r4(mean(v)) })),
  results: halves, gates, failed: fail, thin, spy: { days: spyDays.length, barsFound: spy.bars.length, missingDays: spy.missing.length, ...budget() },
  notes: ['Per-trade net at 1,000 USD after the house costs; the lane rule itself (opening range, retest, confirmation, 15-minute delay, stop at the range low, 1.5R target, flat at the close) is unchanged.', 'Every gate here was written before the first run and is evaluated once; nothing is re-run with other settings.', 'This file cannot promote anything: a PASS would only queue a prospective paper period under the existing universal gates.'] };
write(out);
console.log('evr-gates: whole set n ' + whole.n + ', days ' + whole.distinctDays + ', stocks ' + whole.distinctStocks + ', mean net ' + whole.meanNet + ', win ' + whole.winRate + ', t ' + whole.dayT + ' (bar ' + BAR.toFixed(2) + ')');
