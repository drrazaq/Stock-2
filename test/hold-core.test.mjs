// Seams: hold-core.mjs (HOLD lab, 23 Oct 2026; owner: "test holding, not selling, opening new trades and waiting for the stock to come
// up again, and correcting the average with time"). The get-even exit, the averaging-down average cost, a dead (delisted) stock = loss
// of the remaining value, and the market regime labels known at the time. Pure functions, no network, no files.
// Run: node test/hold-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { series, vanished, isDead, markAt, getEven, avgDown, regimeLabels, volBucket, mulberry32, sampleOf, recoveryStats, dcaVsDip, judgeHold, perYear } from '../hold-core.mjs';

const N = NaN;
// helper: a stock whose open = close = the given prices (NaN = no price that session)
const flat = (px, T = px.length) => series(px, px, T);

test('get-even: sells at the next open after the first close 5% above the buy; nothing earlier', () => {
  //          0    1    2    3    4    5    6    7
  const c = [100, 100, 90, 80, 95, 104, 106, 120];
  const o = [100, 100, 91, 82, 93, 103, 108, 118];
  const r = getEven(series(o, c), 1, { target: 0.05, maxH: 7 });   // buy the open of session 1 at 100
  assert.equal(r.kind, 'target'); assert.equal(r.x, 7); assert.equal(r.at, 'o');   // close 106 on session 6 -> sell the open of 7
  assert.ok(Math.abs(r.g - 0.18) < 1e-9);
  assert.ok(Math.abs(r.worst - -0.20) < 1e-9);   // the worst close on the way (80) = 20% under water
  assert.equal(r.days, 7);                       // sessions 1..7 tied up
});

test('get-even: a close exactly 10% above counts; on the last allowed session it sells at that close', () => {
  const c = [50, 50, 49, 55], r = getEven(flat(c), 1, { target: 0.10, maxH: 3 });
  assert.equal(r.kind, 'target'); assert.equal(r.x, 3); assert.equal(r.at, 'c'); assert.ok(Math.abs(r.g - 0.10) < 1e-9);
});

test('get-even: never recovered -> sold at the close of the last allowed session, still under water', () => {
  const c = [100, 100, 80, 70, 75, 78, 78, 78, 78, 78, 78, 78], r = getEven(flat(c), 1, { target: 0.05, maxH: 5 });
  assert.equal(r.kind, 'max'); assert.equal(r.x, 5); assert.ok(Math.abs(r.g - -0.22) < 1e-9); assert.equal(r.days, 5);
});

test('get-even: a window that runs past the end of the data is not judged (censored)', () => {
  assert.equal(getEven(flat([100, 100, 90, 91]), 1, { target: 0.05, maxH: 5 }), null);
  assert.equal(getEven(series([N, N, 90, 91], [N, N, 90, 91]), 1, { target: 0.05, maxH: 2 }), null);   // no buy price
});

test('get-even with the 35% disaster stop (the yardstick): sells at the next open after a close 35%+ under the buy', () => {
  const c = [100, 100, 70, 64, 60, 90, 120], o = [100, 100, 72, 66, 58, 88, 119];
  const r = getEven(series(o, c), 1, { target: Infinity, stop: 0.35, maxH: 6 });
  assert.equal(r.kind, 'stop'); assert.equal(r.x, 4); assert.ok(Math.abs(r.g - -0.42) < 1e-9);
});

test('delisting: a stock that falls under 3 USD and disappears = the remaining value is lost (-100%)', () => {
  // T = 20 sessions; prices stop after session 6 (last close 1.2 USD, under 3) -> dead
  const px = [10, 10, 8, 5, 3, 2, 1.2, ...Array(13).fill(N)], s = flat(px, 20);
  assert.equal(vanished(s), true); assert.equal(isDead(s), true);
  assert.equal(markAt(s, 5), 2); assert.equal(markAt(s, 10), 0);   // before it vanished: the price; after: nothing left
  const r = getEven(s, 1, { target: 0.05, maxH: 15 });
  assert.equal(r.kind, 'dead'); assert.equal(r.g, -1); assert.equal(r.x, 7);
  const a = avgDown(s, 1, { drops: [0.15, 0.30], target: 0.10, maxH: 15 });
  assert.equal(a.kind, 'dead'); assert.equal(a.n, 3); assert.equal(a.profit, -3); assert.equal(a.gInv, -1); assert.equal(a.gRes, -1);   // all three units lost
});

test('a stock that disappears ABOVE 3 USD (bought out, merged, renamed) is paid out at its last close, not counted as dead', () => {
  const px = [20, 20, 18, 26, 26, ...Array(15).fill(N)], s = flat(px, 20);
  assert.equal(vanished(s), true); assert.equal(isDead(s), false); assert.equal(markAt(s, 12), 26);
  const r = getEven(s, 1, { target: 0.50, maxH: 15 });
  assert.equal(r.kind, 'gone'); assert.ok(Math.abs(r.g - 0.3) < 1e-9); assert.equal(r.x, 4);
});

test('the last few sessions of the data are not a delisting (a stock that simply has no bar yet today is alive)', () => {
  const px = [10, 10, 10, 10, 10, 10, 10, 10, 2, N, N], s = flat(px, 11);   // last price 2 sessions before the end
  assert.equal(vanished(s), false); assert.equal(isDead(s), false); assert.equal(markAt(s, 10), 2);
});

test('averaging down: equal money per unit, average cost = harmonic mean, sell all at average cost +10%', () => {
  //          0    1    2    3    4    5    6    7    8    9
  const c = [100, 100, 84, 84, 69, 70, 75, 76, 81, 90];
  const o = [100, 100, 86, 85, 70, 70, 74, 77, 80, 92];
  const a = avgDown(series(o, c), 1, { drops: [0.15, 0.30], target: 0.10, maxH: 9 });
  // close 84 on session 2 (<= 85) -> unit 2 at the open of 3 (85); close 69 on session 4 (<= 70) -> unit 3 at the open of 5 (70)
  assert.deepEqual(a.units.map(u => [u.k, u.px]), [[1, 100], [3, 85], [5, 70]]);
  const avg = 3 / (1 / 100 + 1 / 85 + 1 / 70);
  assert.ok(Math.abs(a.avgCost - avg) < 1e-9); assert.ok(avg > 83.2 && avg < 83.3);
  // avg x 1.10 = 91.6: no close reaches it by session 9 (90) -> sold at the close of the last session (9)
  assert.equal(a.kind, 'max'); assert.equal(a.x, 9);
  const profit = 90 / 100 + 90 / 85 + 90 / 70 - 3;
  assert.ok(Math.abs(a.profit - profit) < 1e-9); assert.ok(Math.abs(a.gInv - profit / 3) < 1e-9); assert.ok(Math.abs(a.gRes - profit / 3) < 1e-9);
  assert.ok(Math.abs(a.unitYears - (9 + 7 + 5) / 252) < 1e-12);
  // worst point of the combined position: close 69 on session 4 with 2 units in (100, 85)
  assert.ok(Math.abs(a.worstInv - ((69 / 100 + 69 / 85) / 2 - 1)) < 1e-9);
});

test('averaging down: target reached after one add (at the average cost +10%, not the first buy +10%)', () => {
  const c = [100, 100, 84, 95, 102], o = [100, 100, 86, 85, 99];
  const a = avgDown(series(o, c), 1, { drops: [0.15, 0.30], target: 0.10, maxH: 4 });
  // units 100 and 85 -> average 91.89, +10% = 101.08; close 102 on the last allowed session -> sold at that close
  assert.equal(a.n, 2); assert.equal(a.kind, 'target'); assert.equal(a.x, 4); assert.equal(a.at, 'c');
  assert.ok(Math.abs(a.profit - (102 / 100 + 102 / 85 - 2)) < 1e-9);
  assert.ok(Math.abs(a.gRes - a.profit / 3) < 1e-12);   // per dollar of the full 3-unit budget
});

test('averaging down: one close under both levels buys both extra units at the next open; a missing open retries later', () => {
  const c = [100, 100, 65, 66, 60, 60], o = [100, 100, 70, N, 64, 61];
  const a = avgDown(series(o, c), 1, { drops: [0.15, 0.30], target: 0.10, maxH: 5 });
  // close 65 on session 2 -> both levels; open of 3 missing -> the close of 3 (66) triggers again -> both at the open of 4 (64)
  assert.deepEqual(a.units.map(u => [u.k, u.px]), [[1, 100], [4, 64], [4, 64]]);
  assert.equal(a.kind, 'max');
});

test('averaging down against the fund high: levels measured from the running high, not the first buy', () => {
  const c = [110, 100, 99, 98, 88, 90, 95], o = [110, 100, 99, 98, 90, 89, 95];
  const hi = (k) => Math.max(...c.slice(0, k + 1));   // 110
  const a = avgDown(series(o, c), 1, { drops: [0.10, 0.20], target: 0.10, maxH: 6, hi });
  // close 99 <= 110 x 0.9 -> unit 2 at the open of 3; close 88 <= 110 x 0.8 -> unit 3 at the open of 5
  assert.deepEqual(a.units.map(u => [u.k, u.px]), [[1, 100], [3, 98], [5, 89]]);
  const b = avgDown(series(o, c), 1, { drops: [0.15, 0.30], target: 0.10, maxH: 6 });   // from the first buy: 85 / 70 never reached
  assert.equal(b.n, 1);
});

test('regime labels use only closes up to that day: 200-day trend, crash = 15%+ under the 1-year high, 20-day volatility', () => {
  const c = []; for (let k = 0; k < 260; k++) c.push(100 + k * 0.1);   // a calm rise to 125.9
  for (let k = 0; k < 20; k++) c.push(c[c.length - 1] * (k % 2 ? 1.03 : 0.94));   // a violent fall
  const L = regimeLabels(c);
  assert.equal(L.above200[100], null);   // under 200 closes: unknown
  assert.equal(L.above200[259], true); assert.equal(L.crash[259], false); assert.equal(L.vol[259], 'calm');
  const k = c.length - 1; assert.ok(L.dd[k] < -0.15); assert.equal(L.crash[k], true); assert.equal(L.vol[k], 'stressed');
  // the label of day 259 does not change when later days are added (no look-ahead)
  const L2 = regimeLabels(c.slice(0, 260)); assert.equal(L2.dd[259], L.dd[259]); assert.equal(L2.vol20[259], L.vol20[259]);
  assert.equal(volBucket(0.14), 'calm'); assert.equal(volBucket(0.20), 'normal'); assert.equal(volBucket(0.26), 'stressed'); assert.equal(volBucket(null), null);
});

test('deterministic sampling: the same seed gives the same picks, no repeats', () => {
  const a = sampleOf([...Array(100).keys()], 12, 20261023 + 5), b = sampleOf([...Array(100).keys()], 12, 20261023 + 5);
  assert.deepEqual(a, b); assert.equal(new Set(a).size, 12);
  assert.deepEqual(sampleOf([1, 2, 3], 12, 7).sort(), [1, 2, 3]);
  const r = mulberry32(1); const x = r(); assert.ok(x >= 0 && x < 1);
});

test('recovery report: shares recovered / under water / dead, median wait, return per year of capital tied up vs the S&P 500', () => {
  const tr = [
    { kind: 'target', g: 0.06, days: 10, x: 10, spy: 0.01, worst: -0.05 },
    { kind: 'target', g: 0.05, days: 30, x: 30, spy: 0.02, worst: -0.20 },
    { kind: 'max', g: -0.30, days: 252, x: 252, spy: 0.10, worst: -0.50 },
    { kind: 'max', g: 0.02, days: 252, x: 252, spy: 0.10, worst: -0.10 },
    { kind: 'dead', g: -1, days: 100, x: 100, spy: 0.03, worst: -1 },
  ];
  const R = recoveryStats(tr, { cost: 0.008 });
  assert.equal(R.n, 5); assert.equal(R.recovered, 0.4); assert.equal(R.underwaterAtMax, 0.2); assert.equal(R.dead, 0.2); assert.equal(R.gone, 0);
  assert.equal(R.medianDaysToRecover, 20);
  const yrs = (10 + 30 + 252 + 252 + 100) / 252, net = 0.06 + 0.05 - 0.30 + 0.02 - 1 - 5 * 0.008;
  assert.ok(Math.abs(R.perYear - net / yrs) < 1e-4); assert.ok(Math.abs(R.spyPerYear - 0.26 / yrs) < 1e-4);
  assert.equal(perYear([], []), null);
});

test('monthly saving: buying every month vs keeping the cash for a 10% dip from the high', () => {
  // 4 months of 1 session each; the dip saver buys only when the close is 10%+ under the high so far
  const dates = ['2024-01-02', '2024-02-01', '2024-03-01', '2024-04-01', '2024-04-02'], o = [100, 110, 95, 120, 121], c = [100, 110, 98, 120, 121];
  const r = dcaVsDip(dates, o, c, { dip: 0.10, side: 0 });
  // DCA: 1 at 100, 110, 95, 120 -> shares 0.01 + 0.00909 + 0.010526 + 0.008333; value at 121
  const sh = 1 / 100 + 1 / 110 + 1 / 95 + 1 / 120; assert.ok(Math.abs(r.dca.value - sh * 121) < 1e-9); assert.equal(r.dca.invested, 4);
  // dip: close 98 on 2024-03-01 is 10.9% under 110 -> 3 saved units at the next open (120); the April unit stays cash
  assert.ok(Math.abs(r.dip.value - (3 / 120 * 121 + 1)) < 1e-9); assert.equal(r.dip.cash, 1); assert.equal(r.dip.buys, 1);
});

test('judgeHold: the system tier-2 gates, the yardstick named, plus the per-year gate against the S&P 500', () => {
  const half = { n: 100, blocks: 5, avg: 0.05, avgStress: 0.04, edge: 0.01, vsOwn: 0.01, noTop2: 0.04, tBlock: 3 };
  const v = judgeHold({ older: half, newer: half }, { bar: 4, ownName: 'the same buys sold by the 35% stop', perYear: { older: [0.10, 0.12], newer: [0.20, 0.10] } });
  assert.equal(v.verdict, 'NOT PROVEN'); assert.match(v.why, /S&P 500 on the same days in the older half/);
  const w = judgeHold({ older: { ...half, vsOwn: -0.01 }, newer: half }, { bar: 4, ownName: 'the same buys sold by the 35% stop', perYear: { older: [0.2, 0.1], newer: [0.2, 0.1] } });
  assert.match(w.why, /not better than the same buys sold by the 35% stop in the older half/);
  assert.doesNotMatch(w.why, /other days/);
  const ok = judgeHold({ older: half, newer: half }, { bar: 4, ownName: 'x', perYear: { older: [0.2, 0.1], newer: [0.2, 0.1] } });
  assert.equal(ok.verdict, 'TRADABLE SMALL');
});
