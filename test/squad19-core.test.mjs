// Seams: squad19-core.mjs (SQUAD 19, 25 Oct 2026: the same-day jump under 5 USD). Minute-bar facts, base triggers, fills after the
// trigger minute (no fill inside a halt), stops / trail / target, 2% slippage each way, news classes, filters, summaries, the owner's
// daily-bar rules (hold / jump exits, signals) and library pre-registration. Pure functions. Run: node --test test/squad19-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { toNy, dayFacts, trade, after, BASE, BASE_IDS, EXITS, FILTERS, classifyNews, secClass, net, summarize, verdict, haltGaps, commonLike, weekKey, halfOf,
  holdTrade, jumpTrade, legsNet, legsGross, sigEpsLow, sigReverse, bigMove, dSummary, dVerdict, DAILY_IDS, preRegisterDaily, RULES, SLIP } from '../squad19-core.mjs';
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
// prior close 1.00; pre-market 2 bars; regular session from 09:30
const bars = () => [[480, 1.05, 1.08, 1.04, 1.06, 50000], [540, 1.06, 1.12, 1.05, 1.10, 80000],
  [570, 1.11, 1.13, 1.10, 1.12, 100000], [571, 1.12, 1.25, 1.12, 1.24, 200000], [572, 1.30, 1.45, 1.28, 1.44, 300000], [573, 1.44, 1.50, 1.40, 1.42, 250000],
  [574, 1.42, 1.43, 1.20, 1.25, 150000], [575, 1.25, 1.30, 1.24, 1.28, 90000], [959, 1.28, 1.35, 1.27, 1.33, 50000]];

test('toNy keeps 04:00-15:59 New York and sorts', () => {
  const off = -240; const rows = [{ t: '2024-06-03T13:31:00Z', o: 1, h: 1, l: 1, c: 1, v: 5 }, { t: '2024-06-03T08:00:00Z', o: 1, h: 1, l: 1, c: 1, v: 5 }, { t: '2024-06-03T20:00:00Z', o: 1, h: 1, l: 1, c: 1, v: 5 }, { t: '2024-06-03T07:59:00Z', o: 1, h: 1, l: 1, c: 1, v: 5 }];
  assert.deepEqual(toNy(rows, off).map(b => b[0]), [240, 571]);
});

test('dayFacts: gap, pre-market, crosses, reach40, close vs high', () => {
  const f = dayFacts(bars(), { prevC: 1, avgVol: 1e6 });
  assert.ok(near(f.open, 0.11, 1e-4)); assert.ok(near(f.pmHi, 0.12, 1e-4)); assert.equal(f.pmVol, 130000); assert.equal(f.cross[0.1], 570); assert.equal(f.cross[0.2], 571); assert.equal(f.cross[0.4], 572);
  assert.equal(f.reach40, true); assert.equal(f.reach100, false); assert.ok(near(f.hi, 0.5, 1e-4)); assert.ok(near(f.closeVsHi, 1.33 / 1.5 - 1, 1e-4));
});

test('base triggers fire once at the right minute; FAST needs a non-gap open', () => {
  const b = bars();
  assert.equal(b[BASE.GAP10.fn(b, 1)][0], 570); assert.equal(BASE.GAP20.fn(b, 1), -1); assert.equal(b[BASE.X20.fn(b, 1)][0], 571); assert.equal(b[BASE.X40.fn(b, 1)][0], 572);
  assert.equal(BASE.FAST.fn(b, 1), -1, 'opened +11%: not FAST');
  const b2 = b.map(x => [...x]); b2[2][1] = 1.05; assert.equal(b2[BASE.FAST.fn(b2, 1)][0], 571);
  // pre-market highs never trigger a regular-session cross
  const b3 = [[500, 1, 1.5, 1, 1.4, 1000], [570, 1.02, 1.05, 1.0, 1.04, 100]]; assert.equal(BASE.X10.fn(b3, 1), -1);
});

test('trade: fill = next bar open after the trigger, 2% each way, stop 10% at the stop or a gap-through open', () => {
  const b = bars(); const k = 1 + 2;   // trigger at 571 (index 3)
  const t = trade(b, k, EXITS.S10); assert.equal(t.fm, 572); assert.equal(t.e, 1.30);
  // 574 low 1.20 > stop 1.17 -> no stop; close 1.33
  assert.equal(t.why, 'close'); assert.ok(near(t.g, (1.33 * 0.98) / (1.30 * 1.02) - 1));
  const b2 = b.map(x => [...x]); b2[6][3] = 1.10; const t2 = trade(b2, k, EXITS.S10); assert.equal(t2.why, 'stop'); assert.ok(near(t2.x, 1.17));
  const b3 = b.map(x => [...x]); b3[6][1] = 1.00; b3[6][3] = 0.99; const t3 = trade(b3, k, EXITS.S10); assert.ok(near(t3.x, 1.00), 'opens under the stop: fills at the open');
  assert.ok(near(net(1, 1), 0.98 / 1.02 - 1));
});

test('trade: a halt pushes the fill to the next real bar; no entry after 15:30', () => {
  const b = [[570, 1.1, 1.2, 1.1, 1.2, 1], [571, 1.2, 1.3, 1.2, 1.3, 1], [580, 1.5, 1.6, 1.45, 1.55, 1], [959, 1.5, 1.5, 1.5, 1.5, 1]];
  const t = trade(b, 1, EXITS.S10); assert.equal(t.fm, 580); assert.equal(t.e, 1.5); const a = after(b, 1, 1); assert.equal(a.wait, 9);
  const late = [[570, 1.1, 1.2, 1.1, 1.2, 1], [931, 1.2, 1.3, 1.2, 1.3, 1], [932, 1.3, 1.3, 1.3, 1.3, 1]]; assert.equal(trade(late, 1, EXITS.S10), null);
});

test('trail and target exits', () => {
  const b = [[570, 1, 1, 1, 1, 1], [571, 1, 1.5, 1, 1.5, 1], [572, 1.5, 1.5, 1.2, 1.25, 1], [959, 1.3, 1.3, 1.3, 1.3, 1]];
  const tr = trade(b, 0, EXITS.TR15); assert.equal(tr.why, 'trail'); assert.ok(near(tr.x, 1.5 * 0.85));
  const tp = trade(b, 0, EXITS.TP20); assert.equal(tp.why, 'target'); assert.ok(near(tp.x, 1.2));
});

test('halt-like gaps need active trading before the silence', () => {
  const b = []; for (let m = 570; m < 580; m++) b.push([m, 1, 1, 1, 1, 1]); b.push([590, 1.2, 1.2, 1.2, 1.2, 1]);
  const g = haltGaps(b); assert.equal(g.length, 1); assert.equal(g[0].from, 580); assert.equal(g[0].up, true);
  assert.equal(haltGaps([[570, 1, 1, 1, 1, 1], [600, 1, 1, 1, 1, 1]]).length, 0);
  assert.equal(b[BASE.HALTUP.fn(b, 0.8)][0], 590);
});

test('news classes: reaction articles are not catalysts; first category wins', () => {
  assert.equal(classifyNews('Why XYZ Shares Are Trading Higher Today'), 'reaction');
  assert.equal(classifyNews('12 Health Care Stocks Moving In Tuesday\'s Pre-Market Session'), 'reaction');
  assert.equal(classifyNews('XYZ Receives FDA Fast Track Designation for ABC-101'), 'fda');
  assert.equal(classifyNews('XYZ Announces Pricing of $5 Million Registered Direct Offering'), 'offering');
  assert.equal(classifyNews('XYZ Signs Definitive Agreement to Be Acquired by Big Co'), 'merger');
  assert.equal(classifyNews('XYZ Wins $12M Purchase Order From Defense Customer'), 'deal');
  assert.equal(classifyNews('XYZ Announces Bitcoin Treasury Strategy'), 'theme');
  assert.equal(secClass('424B5'), 'offer'); assert.equal(secClass('8-K'), 'current'); assert.equal(secClass('4'), null);
  assert.ok(commonLike('ABCD')); assert.ok(!commonLike('ABCDW')); assert.ok(!commonLike('BRK.B'));
});

test('filters read only what is known before the trigger minute', () => {
  const r = { p: 1.5, av: 1e5, news: [[-100, 'fda'], [700, 'deal']], sec: [], f: { pmHi: 0.3, pmRv: 2 } };
  assert.ok(FILTERS.NEWS_PRE.fn(r, { m: 600 })); assert.ok(FILTERS.N_FDA.fn(r, { m: 600 })); assert.ok(!FILTERS.N_DEAL.fn(r, { m: 600 })); assert.ok(FILTERS.N_DEAL.fn(r, { m: 701 }));
  assert.ok(FILTERS.NEWS_LIVE30.fn(r, { m: 720 })); assert.ok(!FILTERS.NEWS_LIVE30.fn(r, { m: 740 })); assert.ok(FILTERS.RV3.fn(r, { m: 600, cv: 3e5 })); assert.ok(FILTERS.P_1_2.fn(r));
});

test('summary and verdict: weeks are blocks; too few cases; a clean winner passes', () => {
  assert.equal(weekKey('2024-06-07'), '2024-06-03'); assert.equal(halfOf('2025-06-30'), 'older'); assert.equal(halfOf('2025-07-01'), 'newer');
  const mk = (from, n, g) => Array.from({ length: n }, (_, i) => ({ d: new Date(Date.parse(from) + i * 7 * 864e5).toISOString().slice(0, 10), s: 'S' + i, g2: g + (i % 3) * 0.01, g3: g - 0.02 + (i % 3) * 0.01, c2: -0.02, c3: -0.04 }));
  const o = summarize(mk('2024-01-08', 30, 0.05)), nw = summarize(mk('2025-07-07', 30, 0.05));
  assert.equal(o.n, 30); assert.equal(o.blocks, 30); assert.ok(o.edge > 0); assert.equal(verdict({ older: o, newer: nw }).verdict, 'PASSED (paper alert candidate)');
  assert.equal(verdict({ older: summarize(mk('2024-01-08', 5, 0.05)), newer: nw }).verdict, 'TOO FEW CASES');
  assert.equal(verdict({ older: summarize(mk('2024-01-08', 30, -0.05)), newer: nw }).verdict, 'REJECTED');
});

const arr = (xs) => Float64Array.from(xs);
test('daily holdTrade: stop at the open or the stop, else the close of session N', () => {
  const a = { o: arr([1, 1, 1.1, 1.0, 1.2]), h: arr([1, 1.1, 1.2, 1.1, 1.3]), l: arr([1, 0.95, 1.0, 0.7, 1.1]), c: arr([1, 1.05, 1.1, 0.9, 1.25]), v: arr([1, 1, 1, 1, 1]) };
  const t = holdTrade(a, 1, 2, 0.8); assert.equal(t.why, 'time'); assert.equal(t.exitIdx, 2); assert.ok(near(legsGross(t), 0.1));
  const s = holdTrade(a, 1, 5, 0.8); assert.equal(s.why, 'stop'); assert.equal(s.exitIdx, 3); assert.ok(near(s.legs[0].x, 0.8));
  assert.equal(holdTrade(a, 1, 5, 1.0, true), null, 'opens at the stop: skipped'); assert.ok(near(legsNet(t, 0.02), 1.1 * 0.98 / 1.02 - 1, 1e-4));
});

test('daily jumpTrade: half at the first +20% close, stop to the fill, rest by day 3', () => {
  const a = { o: arr([1, 1, 1.1, 1.25]), h: arr([1, 1.1, 1.3, 1.3]), l: arr([0.9, 0.95, 1.05, 1.2]), c: arr([1, 1.05, 1.25, 1.28]), v: arr([1, 1, 1, 1]) };
  const t = jumpTrade(a, 1, 0.9); assert.equal(t.why, 'day 3'); assert.equal(t.legs.length, 2); assert.ok(near(legsGross(t), 0.5 * 0.25 + 0.5 * 0.28));
});

test('daily EPS-LOW and REVERSE signals', () => {
  const n = 30, base = Array(n).fill(1); const a = { o: arr(base), h: arr(base.map(x => x * 1.02)), l: arr(base.map(x => x * 0.98)), c: arr(base), v: arr(Array(n).fill(1e6)) };
  const g = 22; a.o[g] = 1.10; a.h[g] = 1.15; a.c[g] = 1.12; a.v[g] = 5e6; for (let k = 1; k <= 3; k++) { a.l[g + k] = 1.08; a.v[g + k] = 2e6; }
  const sec = { pre202: new Set([g]), s8k: [], offer: [], offerCat: [] };
  const s = sigEpsLow(a, arr(base), g, sec); assert.equal(s.t, g + 3); assert.ok(near(s.mid, 1.05));
  a.l[g + 2] = 1.04; assert.equal(sigEpsLow(a, arr(base), g, sec), null);
  assert.equal(sigReverse(a, arr(base), 25, { s8k: [] }, []), null); assert.ok(bigMove(arr([1, 1.2]), 1, 1, 0.15, false));
});

test('daily verdict and pre-registration: 4 owner rules, idempotent', () => {
  assert.equal(DAILY_IDS.length, 4); assert.equal(dVerdict({ older: dSummary([]), newer: dSummary([]) }).verdict, 'TOO FEW CASES');
  const LB = { strategies: [] }; assert.equal(preRegisterDaily(LB, '2026-10-25'), 4); assert.equal(preRegisterDaily(LB, '2026-10-25'), 0);
  assert.ok(SLIP === 0.02); assert.ok(typeof RULES === 'object'); assert.ok(BASE_IDS.length >= 10);
});
