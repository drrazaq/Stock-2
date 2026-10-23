// Seams: ml-core.mjs (ML-RANK1 lab, pre-registered 24 Oct 2026 in ml-spec.json). No network, no files except ml-spec.json.
// Checks: the code equals the frozen spec; features read nothing after the decision day; the walk-forward never trains on a label that
// was not known at the retrain close; quarter boundaries; entry / exit / 35% stop and cost math; the tree learner and the ridge model.
// Run: node test/ml-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { HOLD, TOPK, COST, STRESS, STOP, DEV_FROM, SPLIT, HOLDOUT_FROM, GBDT, RIDGE_LAMBDA, FEATURES, NF, FI, MARKET, weekEnds, isoWeek, schedule, labelKnown, periodOf,
  fwdReturn, tradeReturn, net, liquid, stockFeatures, marketFeatures, xsRank, groupRel, winsorize, rng, binEdges, binMatrix, binOf, trainGBDT, predictGBDT, treesToJSON, treesFromJSON,
  trainRidge, predictRidge, topK, spearman, extraGates, knownYear } from '../ml-core.mjs';

const SPEC = JSON.parse(fs.readFileSync(new URL('../ml-spec.json', import.meta.url)));

test('the code is exactly the frozen spec (features, hyper-parameters, dates, strategy numbers)', () => {
  assert.deepEqual(SPEC.features.list.map(x => x[0]), FEATURES);
  assert.equal(NF, 41);
  assert.deepEqual(SPEC.models['ML-RANK1'].hyperParameters, GBDT);
  assert.equal(SPEC.models.LIN.lambda, RIDGE_LAMBDA);
  assert.equal(SPEC.walkForward.development.from, DEV_FROM);
  assert.equal(SPEC.walkForward.holdout.from, HOLDOUT_FROM);
  assert.match(SPEC.walkForward.development.newerHalf, new RegExp('^' + SPLIT));
  assert.deepEqual([HOLD, TOPK, COST, STRESS, STOP], [20, 10, 0.008, 0.012, 0.35]);
  assert.deepEqual(MARKET, FEATURES.slice(-4));
});

// a business-day calendar
const days = (from, n) => { const o = []; let x = Date.parse(from + 'T00:00:00Z'); while (o.length < n) { const d = new Date(x), w = d.getUTCDay(); if (w && w < 6) o.push(d.toISOString().slice(0, 10)); x += 864e5; } return o; };

test('decision dates = the last session of each ISO week; a Friday holiday makes Thursday the week end; the newest day uses the calendar', () => {
  const D = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-27', '2026-11-30', '2026-12-01'];
  const nx = (d) => d === '2026-12-01' ? '2026-12-02' : null;
  assert.deepEqual(weekEnds(D, nx).map(t => D[t]), ['2026-10-23', '2026-10-26', '2026-11-27']);
  assert.deepEqual(weekEnds(['2026-10-22', '2026-10-23'], () => '2026-10-26').map(t => t), [1]);   // Friday 23 Oct with Monday next: a week end
  assert.deepEqual(weekEnds(['2026-10-21', '2026-10-22'], () => '2026-10-23'), []);               // Thursday with Friday next: not yet
  assert.equal(isoWeek('2026-01-01'), '2026-01'); assert.equal(isoWeek('2027-01-01'), '2026-53');
});

test('walk-forward: retrain on the first decision of each quarter from 2023-10-01, predict only that quarter, train only on labels known at the retrain close', () => {
  const D = days('2022-06-01', 1000), dec = weekEnds(D, null), S = schedule(dec, D);
  assert.equal(D[S[0].t0] >= DEV_FROM, true); assert.equal(D[S[0].t0].slice(0, 7), '2023-10');
  for (const q of S) { assert.equal(q.trainMaxT, q.t0 - HOLD);
    for (const t of q.predict) { assert.equal(D[t].slice(0, 4) + 'Q' + (Math.floor((+D[t].slice(5, 7) - 1) / 3) + 1), q.q); assert.ok(t >= q.t0); }
    const before = dec.filter(t => t < q.t0), train = before.filter(t => labelKnown(t, q.t0));
    for (const t of train) assert.ok(t + HOLD <= q.t0);                     // the exit close is at or before the retrain close
    for (const t of before.filter(t => !labelKnown(t, q.t0))) assert.ok(t + HOLD > q.t0);   // the 4 weeks before a retrain are left out
    assert.ok(before.length - train.length >= 3); }
  // every predicted date appears exactly once and nothing before 2023-10-01 is predicted
  const all = S.flatMap(q => q.predict); assert.equal(new Set(all).size, all.length); assert.ok(all.every(t => D[t] >= DEV_FROM));
  assert.deepEqual([periodOf('2023-09-29'), periodOf('2023-10-02'), periodOf('2024-09-30'), periodOf('2024-10-01'), periodOf('2025-09-30'), periodOf('2025-10-01')], ['train', 'older', 'older', 'newer', 'newer', 'holdout']);
});

// a random stock and SPY
function series(T, seed) { const R = rng(seed), o = new Float64Array(T), h = new Float64Array(T), l = new Float64Array(T), c = new Float64Array(T), v = new Float64Array(T); let p = 50;
  for (let t = 0; t < T; t++) { const op = p * (1 + (R() - 0.5) * 0.02); p = op * (1 + (R() - 0.5) * 0.05); o[t] = op; c[t] = p; h[t] = Math.max(op, p) * (1 + R() * 0.01); l[t] = Math.min(op, p) * (1 - R() * 0.01); v[t] = 1e5 + R() * 1e6; }
  return { o, h, l, c, v }; }
const scramble = (s, t, seed) => { const R = rng(seed), out = {}; for (const k of Object.keys(s)) { out[k] = Float64Array.from(s[k]); for (let q = t + 1; q < out[k].length; q++) out[k][q] = R() < 0.3 ? NaN : out[k][q] * (0.2 + R() * 3); } return out; };

test('no look-ahead in the features: changing every price after the decision day changes nothing', () => {
  const T = 400, s = series(T, 7), m = series(T, 8).c;
  for (const t of [100, 260, 300, 380]) { const a = stockFeatures(s, m, t), s2 = scramble(s, t, t), m2 = scramble({ c: m }, t, t + 1).c, b = stockFeatures(s2, m2, t);
    assert.deepEqual(Array.from(a).map(String), Array.from(b).map(String));
    assert.deepEqual(marketFeatures(m, t, 0.4), marketFeatures(m2, t, 0.4)); }
  const f = stockFeatures(s, m, 300); for (const k of ['r5', 'r20', 'r60', 'r126', 'r252', 'mom12_1', 'dist52h', 'vol20', 'vol60', 'adr20', 'upShare252', 'beta60', 'dma200']) assert.ok(isFinite(f[FI[k]]), k);
  assert.ok(Math.abs(f[FI.r20] - (s.c[300] / s.c[280] - 1)) < 1e-12); assert.ok(Math.abs(f[FI.mom12_1] - (s.c[279] / s.c[48] - 1)) < 1e-12);
  assert.ok(!isFinite(stockFeatures(s, m, 200)[FI.r252]));   // not enough history: missing, never filled from later days
});

test('the target and the trade: buy the open of t+1, sell the close of t+20; nothing before t+1 or after t+20 is read', () => {
  const T = 60, s = { o: new Float64Array(T).fill(10), h: new Float64Array(T).fill(10.5), l: new Float64Array(T).fill(9.5), c: new Float64Array(T).fill(10), v: new Float64Array(T).fill(1e6) };
  s.o[11] = 12; s.c[30] = 24; s.c[31] = 999; s.c[10] = 999;
  assert.equal(fwdReturn(s, 10), 24 / 12 - 1); assert.deepEqual(tradeReturn(s, 10), { g: 24 / 12 - 1, stopped: false, x: 30 });
  assert.equal(fwdReturn(s, 40), null);   // exit beyond the data: unknown
  const d = { ...s, c: Float64Array.from(s.c) }; d.c[30] = NaN; d.c[29] = NaN; d.c[28] = 18;   // no price at the exit: the last known close
  assert.equal(fwdReturn(d, 10), 18 / 12 - 1);
});

test('the 35% disaster stop: exit at the stop price, or at the open when the stock opens below it; a low just above it does not trigger', () => {
  const T = 40, mk = () => ({ o: new Float64Array(T).fill(100), h: new Float64Array(T).fill(101), l: new Float64Array(T).fill(99), c: new Float64Array(T).fill(100), v: new Float64Array(T).fill(1e6) });
  const a = mk(); a.l[15] = 64.9; assert.deepEqual(tradeReturn(a, 5), { g: 65 / 100 - 1, stopped: true, x: 15 });
  const b = mk(); b.o[15] = 40; b.l[15] = 38; assert.deepEqual(tradeReturn(b, 5), { g: -0.6, stopped: true, x: 15 });
  const c = mk(); c.l[15] = 65.01; assert.equal(tradeReturn(c, 5).stopped, false);
  const e = mk(); e.l[26] = 10; assert.equal(tradeReturn(e, 5).stopped, false);   // after the 20th session: not part of the trade
  assert.ok(Math.abs(net(0.05) - 0.042) < 1e-12); assert.ok(Math.abs(net(0.05, STRESS) - 0.038) < 1e-12); assert.ok(Math.abs(net(-0.35) + 0.358) < 1e-12);
});

test('universe liquidity: close >= 5 and the median of 20 dollar volumes >= 5M, all 20 present', () => {
  const T = 30, c = new Float64Array(T).fill(10), v = new Float64Array(T).fill(600000);   // 6M a day
  assert.equal(liquid(c, v, 25), true); assert.equal(liquid(c, v, 18), false);
  const v2 = Float64Array.from(v); for (let k = 6; k <= 14; k++) v2[k] = 1; assert.equal(liquid(c, v2, 25), true);   // 9 thin days of the 20: the median is still 6M
  v2[15] = 1; assert.equal(liquid(c, v2, 25), false);                                                                   // 10 thin days: the median halves to 3M
  const c2 = Float64Array.from(c); c2[25] = 4.99; assert.equal(liquid(c2, v, 25), false); const c3 = Float64Array.from(c); c3[20] = NaN; assert.equal(liquid(c3, v, 25), false);
});

test('cross-sectional ranks, group-relative strength, winsorizing', () => {
  assert.deepEqual(Array.from(xsRank([3, NaN, 1, 2, 2])).map(String), ['1', 'NaN', '0', '0.5', '0.5']);
  const g = groupRel([1, 2, 3, 4, 5, 10, 7], ['a', 'a', 'a', 'a', 'a', 'b', 'a'], 5); assert.ok(Math.abs(g.rel[0] - (1 - 22 / 6)) < 1e-12); assert.ok(isNaN(g.rel[5]));
  const w = winsorize(Array.from({ length: 101 }, (_, i) => i === 100 ? 1e6 : i)); assert.equal(w[100], 99); assert.equal(w[0], 1);
  assert.deepEqual([knownYear('2024-04-09'), knownYear('2024-04-10')], [2022, 2023]);
});

test('bins come from the training rows only; missing values get bin 0', () => {
  const N = 1000, X = new Float32Array(N * 2); for (let i = 0; i < N; i++) { X[i * 2] = i; X[i * 2 + 1] = i % 7 ? i : NaN; }
  const rows = Array.from({ length: 500 }, (_, i) => i), e = binEdges(X, 2, rows, 32);
  const X2 = Float32Array.from(X); for (let i = 500; i < N; i++) X2[i * 2] = 1e9; assert.deepEqual(binEdges(X2, 2, rows, 32), e);
  assert.ok(e[0][e[0].length - 1] < 500); assert.equal(binOf(e[0], NaN), 0); assert.equal(binOf(e[0], -5), 1); assert.equal(binOf(e[0], 1e9), e[0].length + 1);
});

test('the tree learner finds a step and an interaction, handles missing values, and is deterministic', () => {
  const N = 6000, nf = 4, R = rng(3), X = new Float32Array(N * nf), y = new Float64Array(N);
  for (let i = 0; i < N; i++) { for (let f = 0; f < nf; f++) X[i * nf + f] = R(); if (i % 10 === 0) X[i * nf + 3] = NaN; y[i] = (X[i * nf] > 0.5 ? 1 : 0) + (X[i * nf + 1] > 0.7 && X[i * nf + 2] < 0.3 ? 1 : 0) + (R() - 0.5) * 0.2; }
  const tr = Array.from({ length: 4000 }, (_, i) => i), te = Array.from({ length: 2000 }, (_, i) => 4000 + i), e = binEdges(X, nf, tr, 32), Btr = binMatrix(X, nf, tr, e), Bte = binMatrix(X, nf, te, e);
  const P = { ...GBDT, trees: 80, minLeaf: 20, learningRate: 0.1 }, m = trainGBDT(Btr, tr.length, nf, Float64Array.from(tr.map(i => y[i])), P), p = predictGBDT(m, Bte, te.length, nf);
  const truth = (i) => (X[i * nf] > 0.5 ? 1 : 0) + (X[i * nf + 1] > 0.7 && X[i * nf + 2] < 0.3 ? 1 : 0), mse = te.reduce((a, i, j) => a + (p[j] - truth(i)) ** 2, 0) / te.length;
  assert.ok(mse < 0.02, 'mse ' + mse); assert.ok(spearman(Array.from(p), te.map(truth)) > 0.8);
  assert.ok(m.gain[0] > m.gain[3] && m.gain[1] > m.gain[3]);
  const m2 = trainGBDT(Btr, tr.length, nf, Float64Array.from(tr.map(i => y[i])), P); assert.deepEqual(Array.from(predictGBDT(m2, Bte, te.length, nf)), Array.from(p));
  const back = treesFromJSON(JSON.parse(JSON.stringify(treesToJSON(m)))), p3 = predictGBDT(back, Bte, te.length, nf); for (let i = 0; i < p.length; i++) assert.ok(Math.abs(p3[i] - p[i]) < 1e-5);
});

test('ridge recovers a linear rule; missing inputs count as the training average', () => {
  const N = 3000, nf = 3, R = rng(5), X = new Float32Array(N * nf), rows = [], y = [];
  for (let i = 0; i < N; i++) { for (let f = 0; f < nf; f++) X[i * nf + f] = R(); rows.push(i); y.push(2 * X[i * nf] - X[i * nf + 1] + 0.5); }
  const m = trainRidge(X, nf, rows, y, 1e-6), Z = new Float32Array([0.2, 0.9, 0.3]); assert.ok(Math.abs(predictRidge(m, Z, nf, 0) - (0.4 - 0.9 + 0.5)) < 1e-3);
  const W = new Float32Array([0.2, NaN, 0.3]); assert.ok(Math.abs(predictRidge(m, W, nf, 0) - (0.4 - m.mu[1] + 0.5)) < 1e-3);
});

test('top 10: highest scores, ties by symbol, unscored left out', () => {
  const c = [{ sym: 'B', score: 1 }, { sym: 'A', score: 1 }, { sym: 'C', score: NaN }, ...Array.from({ length: 12 }, (_, i) => ({ sym: 'Z' + i, score: -i }))];
  const t = topK(c); assert.equal(t.length, 10); assert.deepEqual(t.slice(0, 3).map(x => x.sym), ['A', 'B', 'Z0']); assert.ok(!t.some(x => x.sym === 'C'));
});

test('the extra gates: must beat the momentum baseline in both halves and hold up in the holdout', () => {
  const h = (avg, edge) => ({ avg, edge });
  assert.deepEqual(extraGates({ older: h(0.02, 0.01), newer: h(0.03, 0.02) }, { older: h(0.01, 0.0), newer: h(0.02, 0.01) }, h(0.01, 0.005), h(0.0, -0.01)), []);
  const w = extraGates({ older: h(0.02, 0.01), newer: h(0.01, 0.02) }, { older: h(0.01, 0.0), newer: h(0.02, 0.01) }, h(-0.01, 0.005), h(0.0, -0.01));
  assert.equal(w.length, 3); assert.match(w[0], /newer half/); assert.match(w[1], /holdout: lost money/); assert.match(w[2], /holdout: not better than the momentum/);
});
