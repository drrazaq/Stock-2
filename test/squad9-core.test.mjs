// SQUAD 9 core (YouTube strategy testers): pure functions, no network.
//   indicators (EMA/RMA/ATR/RSI/Supertrend/TSV/KST/MACD/McGinley/WAE/QQE/SSL/pivots/Kalman), the rule signals, the daily-bar trade
//   simulator (stop first on a two-sided day, 1R half + break-even, limit fills, gaps), the stats and the library pre-registration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, SOURCES, sma, ema, rma, atr, rsi, supertrend, tsv, kst, macd, mcginley, wae, qqeMod, sslHlv, isPivotLow, hiddenBullAt, kalmanZ, indicators, signalAt, fibSetup,
  threeLineStrike, bullEngulf, simulate, tradeStats, ownAverage, boardStats, paperReady, preRegister, closeExitFn, capG, halfOf, COST } from '../squad9-core.mjs';
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, a + ' vs ' + b);

test('registry: 8-12 rules, each with a video, a claim, a replication label, a max hold and a library note', () => {
  assert.ok(IDS.length >= 8 && IDS.length <= 12, IDS.length + ' rules');
  for (const id of IDS) { const r = RULES[id]; assert.ok(/^SQ9-/.test(id)); assert.ok(/youtube\.com\/watch\?v=/.test(r.video.url), id); assert.ok(/^\d{4}-\d\d-\d\d$/.test(r.video.date), id);
    assert.ok(/^(faithful|partial|proxy)/.test(r.label), id); assert.ok(r.maxHold >= 1 && r.rule.length > 50 && r.claim.text && r.claim.costs && r.claim.outOfSample, id); assert.ok(typeof r.lib === 'string', id); }
  assert.deepEqual([...new Set(IDS.map(i => RULES[i].channel))].sort(), ['DaviddTech', 'Quant Guild', 'The Moving Average']);
  assert.ok(SOURCES.length >= 5 && SOURCES.every(s => s.url && s.tested));
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('moving averages, ATR and RSI', () => {
  near(sma([1, 2, 3, 4], 2)[3], 3.5); assert.ok(isNaN(sma([1, 2, 3, 4], 2)[0]));
  const e = ema([1, 2, 3, 4, 5], 3); near(e[2], 2); near(e[3], 0.5 * 4 + 0.5 * 2); const r = rma([1, 2, 3, 4], 2); near(r[1], 1.5); near(r[2], 0.5 * 3 + 0.5 * 1.5);
  assert.ok(isNaN(sma([1, NaN, 3, 4, 5], 2)[2]) && sma([1, NaN, 3, 4, 5], 2)[3] === 3.5, 'restarts after a missing bar');
  const c = [10, 11, 12, 13, 14, 15, 16, 17], R = rsi(c, 3); near(R[7], 100); const d = c.map(x => 30 - x), R2 = rsi(d, 3); near(R2[7], 0);
  const A = atr([11, 11, 11], [9, 9, 9], [10, 10, 10], 2); near(A[1], 2);
});

test('supertrend flips green on a breakout; TSV sign; KST / MACD cross under zero', () => {
  const T = 80, c = Array.from({ length: T }, (_, t) => t < 40 ? 100 - t * 0.5 : 80 + (t - 40) * 2), h = c.map(x => x + 1), l = c.map(x => x - 1);
  const s = supertrend(h, l, c, 10, 3); assert.equal(s.trend[35], -1); assert.equal(s.trend[T - 1], 1); assert.ok(s.line[T - 1] < c[T - 1]);
  const v = new Array(T).fill(1000); assert.ok(tsv(c, v)[T - 1] > 0 && tsv(c, v)[30] < 0);
  const k = kst(c); assert.ok(isNaN(k.line[40]) || isFinite(k.line[40])); assert.ok(k.line[T - 1] > 0); const m = macd(c); assert.ok(m.line[T - 1] > 0 && m.line[38] < 0);
});

test('McGinley follows the price; WAE explosion; QQE bars; SSL state', () => {
  const T = 300, c = Array.from({ length: T }, (_, t) => 100 + t * 0.2 + Math.sin(t / 5)), h = c.map(x => x + 1), l = c.map(x => x - 1);
  const g = mcginley(c, 150); assert.ok(g[T - 1] < c[T - 1] && g[T - 1] > c[0]);
  const w = wae(h, l, c); assert.ok(isFinite(w.dead[T - 1]) && w.dead[T - 1] > 0 && isFinite(w.exp[T - 1])); assert.ok(w.up.every(x => isNaN(x) || x >= 0));
  let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, rw = [100]; for (let t = 1; t < T; t++) rw.push(rw[t - 1] * (1 + (rnd() - 0.45) * 0.04));
  const q = qqeMod(rw); assert.ok(q.blue.some(x => x === 1) && q.blue.some((x, t) => t > 60 && x === 0), 'bullish and other bars on a drifting random walk');
  const s = sslHlv(h, l, c, 21); assert.equal(s[T - 1], 1); const d = c.map((x, t) => 400 - x), sd = sslHlv(d.map(x => x + 1), d.map(x => x - 1), d, 21); assert.equal(sd[T - 1], -1);
});

test('pivots and hidden bullish divergence: oscillator lower low, price higher low, confirmed 5 sessions later', () => {
  const osc = new Array(40).fill(5), low = new Array(40).fill(100);
  osc[10] = 1; low[10] = 90;   // first pivot
  osc[25] = 0; low[25] = 95;   // second pivot: lower osc, higher price low
  assert.ok(isPivotLow(osc, 10) && isPivotLow(osc, 25)); assert.equal(isPivotLow(osc, 24), false);
  assert.equal(hiddenBullAt(osc, low, 30), true, 'confirmed at 25 + 5'); assert.equal(hiddenBullAt(osc, low, 29), false, 'not yet confirmed');
  const low2 = [...low]; low2[25] = 85; assert.equal(hiddenBullAt(osc, low2, 30), false, 'price lower low = regular, not hidden');
});

test('Kalman z: a sharp drop under a steady series gives z <= -2; the mean adapts', () => {
  const T = 200, c = Array.from({ length: T }, (_, t) => 100 * Math.exp(0.01 * Math.sin(t))); c[150] = c[149] * 0.9;
  const K = kalmanZ(c); assert.ok(K.z[150] <= -2, 'z ' + K.z[150]); assert.ok(Math.abs(K.z[130]) < 2); assert.ok(isNaN(K.z[100]), 'needs 60 sessions of deviations from the 60-session average');
  // no look-ahead: a later change does not move z at 150
  const c2 = [...c]; c2[180] = 500; near(kalmanZ(c2).z[150], K.z[150]);
});

test('candles: three-line strike and bullish engulfing', () => {
  const o = [10, 10, 9.6, 9.3, 8.9], c = [10, 9.7, 9.4, 9.0, 10.2]; assert.equal(threeLineStrike(o, c, 4), true);
  const c2 = [...c]; c2[4] = 9.8; assert.equal(threeLineStrike(o, c2, 4), false, 'does not close above the first candle\'s open');
  assert.equal(bullEngulf([10, 9.5], [9.6, 10.1], 1), true); assert.equal(bullEngulf([10, 9.7], [9.6, 9.9], 1), false);
});

test('simulator: stop first on a two-sided day; gaps; target; time; limit fills; 1R half with break-even next session', () => {
  const P = (rows) => ({ o: rows.map(r => r[0]), h: rows.map(r => r[1]), l: rows.map(r => r[2]), c: rows.map(r => r[3]) });
  // entry 100 at open of 1, stop 95, target 107.5 (1.5R)
  const plan = { stopDist: 5, tpR: 1.5, maxHold: 40 };
  let r = simulate(P([[100, 100, 100, 100], [100, 101, 99, 100], [100, 108, 94, 100]]), 1, plan); assert.equal(r.why, 'stop'); near(r.exit, 95);
  r = simulate(P([[100, 100, 100, 100], [100, 101, 99, 100], [90, 92, 89, 91]]), 1, plan); near(r.exit, 90, 1e-9); assert.equal(r.why, 'stop');   // gapped through
  r = simulate(P([[100, 100, 100, 100], [100, 101, 99, 100], [101, 108, 100, 107]]), 1, plan); assert.equal(r.why, 'target'); near(r.g, 0.075);
  r = simulate(P([[100, 100, 100, 100], [100, 101, 99, 100], [110, 111, 109, 110]]), 1, plan); near(r.exit, 110); // gapped over the target
  r = simulate(P([[100, 100, 100, 100], [100, 101, 99, 100], [100, 101, 99, 100.5]]), 1, { ...plan, maxHold: 2 }); assert.equal(r.why, 'time'); near(r.exit, 100.5);
  r = simulate(P([[100, 100, 100, 100], [100, 101, 99, 100]]), 1, plan); assert.equal(r.open, true, 'data ends first');
  // 1R half then break-even: day 2 hits 105 (half), day 3 falls to 99 -> rest out at 100 (entry)
  const hp = { stopDist: 5, tp1R: 1, tpR: 2, beAfterTp1: true, maxHold: 40 };
  r = simulate(P([[100, 100, 100, 100], [100, 101, 99, 100], [101, 106, 99.5, 104], [103, 104, 99, 99.5]]), 1, hp); assert.equal(r.why, 'breakeven'); near(r.g, (105 + 100) / 2 / 100 - 1);
  // same session: the half fills, but the break-even stop is NOT active that session (99.5 low stays above the 95 stop)
  r = simulate(P([[100, 100, 100, 100], [100, 106, 99.5, 101], [101, 111, 100.5, 110]]), 1, hp); assert.equal(r.why, 'target'); near(r.g, (105 + 110) / 2 / 100 - 1);
  // limit order: filled at 95 on day 2, stop 90, target 103
  const lp = { limit: 95, stopPx: 90, tpPx: 103, validFor: 3, maxHold: 20 };
  r = simulate(P([[100, 100, 100, 100], [99, 100, 97, 98], [97, 98, 94, 96], [96, 104, 95, 103]]), 1, lp); assert.equal(r.k, 2); near(r.entry, 95); assert.equal(r.why, 'target'); near(r.g, 103 / 95 - 1);
  assert.equal(simulate(P([[100, 100, 100, 100], [99, 100, 97, 98], [97, 98, 96, 96], [96, 99, 96, 97], [97, 98, 96, 97]]), 1, lp), null, 'never filled');
  // close-based exit after the half only (SSL)
  const sp = { stopDist: 5, tp1R: 1, tpR: null, beAfterTp1: true, closeAfterHalf: true, maxHold: 40 };
  r = simulate(P([[100, 100, 100, 100], [100, 101, 99, 100], [100, 101, 99, 100], [100, 106, 100, 104], [104, 105, 102, 103]]), 1, sp, (j) => j >= 2); assert.equal(r.why, 'signal'); assert.equal(r.x, 3); near(r.g, (105 + 104) / 2 / 100 - 1);
});

test('signals never use a future bar (every rule, random walks)', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const T = 700, c = [50]; for (let t = 1; t < T; t++) c.push(c[t - 1] * (1 + (rnd() - 0.5) * 0.06)); const o = c.map((x, t) => t ? c[t - 1] * (1 + (rnd() - 0.5) * 0.01) : x), h = c.map((x, t) => Math.max(x, o[t]) * (1 + rnd() * 0.02)), l = c.map((x, t) => Math.min(x, o[t]) * (1 - rnd() * 0.02)), v = c.map(() => 1e6 * (0.5 + rnd()));
  const P = { o, h, l, c, v }, I = indicators(P); let any = 0;
  const cut = 520, P2 = { o: o.map((x, t) => t > cut ? x * 3 : x), h: h.map((x, t) => t > cut ? x * 3 : x), l: l.map((x, t) => t > cut ? x * 0.2 : x), c: c.map((x, t) => t > cut ? x * 2 : x), v: v.map((x, t) => t > cut ? x * 9 : x) }, I2 = indicators(P2);
  for (const id of IDS) for (let t = 420; t <= cut; t++) { const a = signalAt(id, I, P, t), b = signalAt(id, I2, P2, t); assert.deepEqual(a, b, id + ' at ' + t); if (a) any++; }
  assert.ok(any > 0, 'some signals fire on a random walk');
});

test('fib setup: impulse after a break of structure, untouched 0.618, limit at E', () => {
  const T = 120, h = new Array(T).fill(101), l = new Array(T).fill(99), c = new Array(T).fill(100), o = new Array(T).fill(100);
  for (let t = 90; t <= 100; t++) { const p = 100 + (t - 90) * 3; h[t] = p + 1; l[t] = p - 1; c[t] = p; o[t] = p - 0.5; }   // impulse to 131 at t=100
  for (let t = 101; t <= 103; t++) { h[t] = 128; l[t] = 125; c[t] = 126; o[t] = 127; }
  const I = { atr14: new Array(T).fill(2) }, s = fibSetup({ o, h, l, c }, I, 103); assert.ok(s); near(s.tpPx, 131); near(s.stopPx, 99); near(s.limit, 131 - 0.618 * 32);
  l[102] = 110; assert.equal(fibSetup({ o, h, l, c }, I, 103), null, 'level already touched');
});

test('stats, own-days yardstick, board, close exits, library pre-registration', () => {
  const s = tradeStats([0.05, -0.02, 0.01]); assert.equal(s.n, 3); near(s.avg, ((0.05 + -0.02 + 0.01) - 3 * COST) / 3, 1e-4); assert.ok(s.pf > 0);
  assert.equal(capG(5), 3);
  const oa = ownAverage({ from: 0, to: 99, len: 5, step: 10, okAt: () => true, busy: [[0, 30]], ret: () => 0.01 }); near(oa, 0.01);
  assert.equal(ownAverage({ from: 0, to: 20, len: 5, step: 10, okAt: () => true, ret: () => 0.01 }), null, 'fewer than 3 windows');
  const b = boardStats([{ g: 0.05, c: 0.01, d: 'a' }, { g: -0.01, c: 0, d: 'b' }]); assert.equal(b.n, 2); assert.equal(b.days, 2); assert.equal(paperReady(b), false);
  const I = { ssl: Int8Array.from([1, 1, -1]), kal: { z: [-3, -1, 0.1] } }; assert.equal(closeExitFn({ closeExit: 'ssl' }, I)(2), true); assert.equal(closeExitFn({ closeExit: 'kalman' }, I)(2), true); assert.equal(closeExitFn({}, I)(2), false);
  const LB = { strategies: [{ id: 'X' }] }; assert.equal(preRegister(LB), IDS.length); assert.equal(preRegister(LB), 0, 'idempotent');
  const e = LB.strategies.find(x => x.id === 'SQ9-DT-WQM'); assert.match(e.status, /pre-registered/); assert.ok(e.sources[0].includes('UjY3Zq2-8ic')); assert.match(e.explain, /Claimed/);
});
