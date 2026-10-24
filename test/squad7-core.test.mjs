// SQUAD 7 core (winner DNA): pure functions, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { labelSeries, episodeStarts, cellKey, looseKey, pickN, priceFeatures, sectorFeatures, sharesChange, sharesAt, splitFix, earnFeatures, auc, liftTable, quantiles, decileOf,
  bestQuintile, inQ, pairTable, RULES, IDS, ruleOk, preRegister, boardStats, paperReady, halfOf, capG, W20, PRICE_FEATURES } from '../squad7-core.mjs';

const arr = (a) => Float32Array.from(a);
test('labels: +30% close within 20 sessions of the NEXT open; window must be complete; loser and forward return', () => {
  const T = 40, o = new Array(T).fill(10), c = new Array(T).fill(10);
  c[15] = 13.1; o[1] = 10;            // signal t=0: entry open of t=1 = 10, close 13.1 on session 15 (inside 1..20)
  const L = labelSeries(arr(o), arr(c), W20);
  assert.equal(L.win[0], 1); assert.equal(L.known[0], 1); assert.ok(Math.abs(L.fwd[0] - 0) < 1e-6, 'last close of the window (t+20) is 10');
  assert.equal(L.win[15], 0, 'the window of t=15 starts at session 16, after the 13.1 close');
  assert.equal(L.known[T - 20], 0, 'incomplete window is unknown'); assert.equal(L.known[T - 21], 1);
  const o2 = new Array(T).fill(10), c2 = new Array(T).fill(10); c2[5] = 6.9; const L2 = labelSeries(arr(o2), arr(c2), W20); assert.equal(L2.lose[0], 1); assert.equal(L2.win[0], 0);
  // the entry is the next OPEN, not today's close: a gap up to 13 then flat is not a winner
  const o3 = new Array(T).fill(13), c3 = new Array(T).fill(13); c3[0] = 10; assert.equal(labelSeries(arr(o3), arr(c3), W20).win[0], 0);
  // a missing entry open -> unknown
  const o4 = new Array(T).fill(10); o4[1] = NaN; assert.equal(labelSeries(arr(o4), arr(c), W20).known[0], 0);
});

test('episodes: first day of a run of winning days, then a cooldown', () => {
  const w = Uint8Array.from([0, 1, 1, 1, 0, 1, 1, 0, 0, 1]);
  assert.deepEqual(episodeStarts(w, () => true, 3), [1, 5, 9]);
  assert.deepEqual(episodeStarts(w, () => true, 6), [1, 9], 'day 5 is inside the cooldown');
  assert.deepEqual(episodeStarts(w, (t) => t !== 1, 3), [2, 5, 9], 'day 1 not eligible: day 2 starts the episode');
});

test('matching cells and a deterministic pick', () => {
  assert.equal(cellKey(12, 20e6, 0.07, '28'), '1|1|3|28'); assert.equal(looseKey('1|1|3|28'), '1|1|3'); assert.equal(cellKey(4, 1e9, NaN, null), '0|3|9|?');
  const a = Array.from({ length: 50 }, (_, i) => i); assert.deepEqual(pickN(a, 5, 'x'), pickN(a, 5, 'x')); assert.notDeepEqual(pickN(a, 5, 'x'), pickN(a, 5, 'y')); assert.equal(new Set(pickN(a, 5, 'x')).size, 5);
  assert.deepEqual(pickN([1, 2], 5, 'x'), [1, 2]);
});

test('price features use only data up to t', () => {
  const T = 300, c = Array.from({ length: T }, (_, t) => 10 + t * 0.01), o = c.map(x => x), h = c.map(x => x * 1.01), l = c.map(x => x * 0.99), v = new Array(T).fill(1e6); v[T - 1] = 3e6;
  const spy = Array.from({ length: T }, () => 100), F = priceFeatures({ o: arr(o), h: arr(h), l: arr(l), c: arr(c), v: arr(v) }, arr(spy));
  assert.deepEqual(Object.keys(F).sort(), [...PRICE_FEATURES].sort());
  const t = T - 1; assert.ok(Math.abs(F.r5[t] - (c[t] / c[t - 5] - 1)) < 1e-5); assert.ok(Math.abs(F.rs63[t] - F.r63[t]) < 1e-6, 'flat SPY');
  assert.ok(Math.abs(F.hi52[t]) < 1e-6, 'at the high'); assert.ok(Math.abs(F.turn50[t] - 3) < 1e-6); assert.ok(F.dryPop[t] > 2.9);
  // changing a FUTURE bar never changes a feature at t
  const c2 = [...c]; c2[200] = 50; const F2 = priceFeatures({ o: arr(o), h: arr(h), l: arr(l), c: arr(c2), v: arr(v) }, arr(spy));
  for (const k of PRICE_FEATURES) { const a = F[k][150], b = F2[k][150]; assert.ok((isNaN(a) && isNaN(b)) || a === b, k); }
  // base length: a 30% range for the last 40 sessions
  const cb = Array.from({ length: T }, (_, t) => t < 250 ? 5 : 10 + (t % 2)), Fb = priceFeatures({ o: arr(cb), h: arr(cb), l: arr(cb), c: arr(cb), v: arr(v) }, arr(spy));
  assert.equal(Fb.baseLen[T - 1], 49); assert.ok(Fb.ovnShare[T - 1] === 0 || isFinite(Fb.ovnShare[T - 1]));
});

test('sector features: median includes the stock; breadth counts the others', () => {
  const rows = [0, 1, 2, 3, 4, 5].map(i => ({ i, sec: '28', r63: i / 10, r20: i / 10 })).concat([{ i: 9, sec: '35', r63: 1, r20: 1 }]);
  const m = sectorFeatures(rows, 0.25); assert.ok(Math.abs(m.get(5).rsSec - (0.5 - 0.25)) < 1e-9); assert.equal(m.get(5).breadthSec, 2 / 5); assert.equal(m.get(0).breadthSec, 3 / 5); assert.equal(m.has(9), false, 'sector with 1 member');
});

test('shares 30 days late, a year apart; split repair; earnings known from their date', () => {
  const rows = [['2022-01-31', 100], ['2023-01-31', 120], ['2023-03-31', 150]];
  assert.equal(sharesAt(rows, '2023-03-15'), 120, 'the 31 Mar count is not known yet'); assert.ok(Math.abs(sharesChange(rows, '2023-03-15') - 0.2) < 1e-9);
  assert.deepEqual(splitFix([['a', 100], ['b', 200.5]]).map(x => x[1]), [200.5, 200.5]);
  const reps = [{ d: '2023-01-10', a: 1.2, e: 1.0 }, { d: '2023-04-10', a: 0.5, e: 1.0 }];
  assert.deepEqual(earnFeatures(reps, '2023-04-09'), { earnDays: 89, surprise: 0.19999999999999996 }); assert.equal(earnFeatures(reps, '2023-04-10').earnDays, 0); assert.ok(isNaN(earnFeatures(reps, '2022-12-01').earnDays));
});

test('ranking: AUC, deciles, lift, best quintile and pairs', () => {
  assert.equal(auc([2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [0, 0, 0, 0, 0, 0, 0, 0, 0, 1]), 1); assert.equal(auc([1, 1, 1, 1, 1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), 0.5);
  const q = quantiles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], [0.1, 0.5, 0.9]); assert.deepEqual(q, [2, 6, 10]); assert.equal(decileOf(10, [2, 6, 10]), 3);
  const rows = []; for (let k = 0; k < 1000; k++) rows.push({ y: k % 100 >= 90 ? 1 : 0, f: { a: k % 100, b: (k * 7) % 13 } });
  const pop = rows.map(r => ({ win: r.y, lose: 0, fwd: r.y ? 0.4 : 0, f: r.f }));
  const L = liftTable(rows, pop, ['a', 'b']); assert.equal(L[0].feature, 'a'); assert.equal(L[0].direction, 'high'); assert.equal(L[0].liftTop, 10); assert.equal(L[0].bestDecile.popWin, 1);
  const bq = bestQuintile(rows, 'a', 'high'); assert.equal(bq.side, '>='); assert.ok(inQ(95, bq) && !inQ(10, bq));
  const P = pairTable(rows, pop, [bq, bestQuintile(rows, 'b', 'low')]); assert.equal(P.length, 1);
});

test('rules registry, board, library', () => {
  for (const id of IDS) { const r = RULES[id]; assert.ok(id.startsWith('SQ7-')); assert.ok(r.when.length >= 1 && r.hold >= 5 && r.maxPerDay >= 1 && r.rank.length === 2, id); assert.ok(r.rule.length > 60 && r.evidence && r.lib, id);
    for (const [k, side, cut] of r.when) assert.ok(typeof k === 'string' && (side === '>=' || side === '<=') && isFinite(cut), id); }
  if (IDS.length) { const id = IDS[0]; assert.equal(ruleOk(id, {}), false, 'unknown features never pass'); }
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer'); assert.equal(capG(5), 3);
  const st = boardStats([{ d: 'a', sym: 'X', g: 0.1, c: 0 }, { d: 'b', sym: 'Y', g: -0.05, c: 0 }]); assert.equal(st.n, 2); assert.equal(paperReady(st), false);
  const LB = { strategies: [] }; assert.equal(preRegister(LB), IDS.length); assert.equal(preRegister(LB), 0, 'idempotent');
});
