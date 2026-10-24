// Seams: squad6-core.mjs (SQUAD 6, 24 Oct 2026: public-record traders and fund rulebooks). Indicators (Wilder RSI, streak, percent rank,
// ConnorsRSI, ADX, ATR, Clenow regression score), the setups (Radge 20-week high + ROC, three weeks tight, TD buy setup 9, ConnorsRSI
// pullback), the fund selections (MSCI momentum z-scores, QMOM frog-in-the-pan half), the Clenow weekly step, Radge's ratchet stop, the
// trade walkers (next-open exits, resting orders, intraday bracket worst case, stocks that stop trading, data end), the yardstick and the
// idempotent library pre-registration. Pure functions, no network, no files. Run: node test/squad6-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, rsiArr, streakArr, pctRankArr, connorsRsiArr, adxArr, atrPctAt, clenowScore, maxAbsMove, clenowWeight, clenowStep, radgeStop, weeksOf, wednesdays, monthEnds, weekly,
  radgeEntry, threeWeeksTight, tdBuy9, crsiSetup, fip, mtumPick, qmomPick, topN, nextOpen, walkClose, walkFrom, fillOrder, walkBracket, yardOf, shape, newerVsOlder, preRegister, halfOf } from '../squad6-core.mjs';
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const S0 = (c, o = c, h = c, l = c, v = c.map(() => 1e6)) => ({ o: Float64Array.from(o), h: Float64Array.from(h), l: Float64Array.from(l), c: Float64Array.from(c), v: Float64Array.from(v) });

test('every rule is registered with a source URL, a replication label and its block length', () => {
  assert.equal(IDS.length, 8);
  for (const id of IDS) { const r = RULES[id]; assert.ok(r.sources.length && r.sources.every(s => /^https?:\/\//.test(s.url)), id); assert.ok(['faithful', 'partial', 'proxy'].includes(r.replication), id); assert.ok(r.block > 0 && r.rule && r.deviations, id); }
});

test('Wilder RSI: all up = 100, all down = 0, seeded after p changes, a missing bar restarts it', () => {
  const up = rsiArr([1, 2, 3, 4, 5], 2); assert.ok(Number.isNaN(up[1])); assert.equal(up[2], 100); assert.equal(up[4], 100);
  const dn = rsiArr([5, 4, 3, 2], 2); assert.equal(dn[3], 0);
  const m = rsiArr([10, 11, 10, 11, 10], 2); assert.ok(near(m[2], 50)); // gains 1, losses 1 -> 50
  const g = rsiArr([1, 2, NaN, 3, 4, 5], 2); assert.ok(Number.isNaN(g[3]) && Number.isNaN(g[4])); assert.equal(g[5], 100);
});

test('streak and percent rank as ConnorsRSI defines them', () => {
  assert.deepEqual([...streakArr([1, 2, 3, 3, 2, 1])].slice(1), [1, 2, 0, -1, -2]);
  const c = [100]; for (let k = 1; k <= 101; k++) c.push(c[k - 1] * (1 + (k % 2 ? 0.01 : -0.01))); c.push(c[c.length - 1] * 1.05);   // a +5% day after 100 smaller moves
  const pr = pctRankArr(c, 100); assert.equal(pr[c.length - 1], 100); const pr2 = pctRankArr([...c.slice(0, -1), c[c.length - 2] * 0.9], 100); assert.equal(pr2[c.length - 1], 0);
  const cr = connorsRsiArr(c); assert.ok(cr[c.length - 1] > 70);
});

test('ADX: a steady one-way trend has a high ADX, a choppy series a low one', () => {
  const c = [], h = [], l = []; for (let k = 0; k < 60; k++) { c.push(100 + k); h.push(101 + k); l.push(99 + k); }
  const a = adxArr(h, l, c, 10); assert.ok(a[59] > 60, String(a[59]));
  const c2 = [], h2 = [], l2 = []; for (let k = 0; k < 60; k++) { const z = 100 + (k % 2 ? 1 : -1); c2.push(z); h2.push(z + 1.5); l2.push(z - 1.5); }
  assert.ok(adxArr(h2, l2, c2, 10)[59] < 25);
});

test('Clenow score: a smooth 0.1%-a-day climb scores about 28.6% a year x R2 1; noise lowers R2', () => {
  const c = []; for (let k = 0; k < 120; k++) c.push(100 * Math.exp(0.001 * k));
  assert.ok(near(clenowScore(c, 119, 90), Math.exp(0.252) - 1, 1e-9));
  const z = c.map((x, k) => x * (k % 2 ? 1.03 : 0.97)); assert.ok(clenowScore(z, 119, 90) < clenowScore(c, 119, 90));
  assert.equal(clenowScore(c, 50, 90), null);
  assert.ok(near(maxAbsMove([100, 100, 120, 120], 3, 90), 0.2));
  assert.ok(near(clenowWeight(0.02), 0.05)); assert.equal(clenowWeight(0.001), 0.10);
  assert.ok(near(atrPctAt([11, 11, 11], [9, 9, 9], [10, 10, 10], 2, 2), 0.2));
});

test('Clenow week: sells leavers of the top 20% and filter failures; buys from the top only while the sizes fit and the index is up', () => {
  const ranked = []; for (let k = 0; k < 10; k++) ranked.push({ key: 'S' + k, score: 10 - k, pass: k !== 1, w: 0.6 });
  const held = new Map([['S5', 0.3], ['S0', 0.3]]);
  let st = clenowStep(held, ranked, true); assert.deepEqual(st.sells, ['S5']); assert.deepEqual(st.buys, []);   // top 2 = S0, S1; S1 fails the filter; S0 held
  st = clenowStep(new Map(), ranked, true, 0.5); assert.deepEqual(st.buys.map(b => b.key), ['S0']);   // S0 0.6 fits, S2 0.6 does not -> buying stops
  st = clenowStep(new Map([['S0', 0.3]]), ranked, false); assert.deepEqual(st.buys, []); assert.deepEqual(st.sells, []);
  st = clenowStep(new Map([['GONE', 0.1]]), ranked, true); assert.deepEqual(st.sells, ['GONE']);
});

test('Radge: 20-week closing high with ROC >= 30%; the stop ratchets 40% -> 10% and never falls', () => {
  const wc = []; for (let k = 0; k < 21; k++) wc.push(100); wc[20] = 131; assert.equal(radgeEntry(wc, 20), true);
  wc[20] = 129; assert.equal(radgeEntry(wc, 20), false); wc[20] = 131; wc[10] = 140; assert.equal(radgeEntry(wc, 20), false);
  let s = radgeStop(null, 100, true); assert.equal(s, 60); s = radgeStop(s, 100, false); assert.equal(s, 90); s = radgeStop(s, 110, true); assert.equal(s, 90); s = radgeStop(s, 200, true); assert.equal(s, 120);
});

test('weeks, Wednesdays and month ends from session dates', () => {
  const D = ['2026-03-02', '2026-03-03', '2026-03-04', '2026-03-05', '2026-03-06', '2026-03-09', '2026-03-10', '2026-03-12', '2026-03-31', '2026-04-01'];
  const W = weeksOf(D); assert.deepEqual(W.slice(0, 2), [{ s: 0, e: 4 }, { s: 5, e: 7 }]);
  assert.deepEqual(wednesdays(D), [2, 7, 9]);   // 4 Mar (Wed), 12 Mar (Thu: no Wednesday session that week), 1 Apr (Wed; 31 Mar is a Tuesday of the same week)
  assert.deepEqual(monthEnds(D, [3]), [8]); assert.deepEqual(monthEnds(D, [4]), []);
  const S = S0([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], undefined, [1, 2, 9, 4, 5, 6, 7, 8, 9, 10]); const wk = weekly(S, W); assert.equal(wk.c[0], 5); assert.equal(wk.h[0], 9); assert.equal(wk.l[0], 1);
});

test('three weeks tight: two tight steps after a 20%+ advance', () => {
  const wc = []; for (let k = 0; k < 12; k++) wc.push(100); wc.push(120, 125, 125.5, 126, 125); // weeks 12..16
  assert.equal(threeWeeksTight(wc, 16), true);   // 125.5 -> 126 -> 125, each within 1.5%; 125.5 >= 1.2 x 100
  wc[16] = 128; assert.equal(threeWeeksTight(wc, 16), false);
  const flat = new Array(17).fill(100); assert.equal(threeWeeksTight(flat, 16), false);   // tight, but no advance
});

test('TD buy setup 9: exactly the 9th lower close, perfected by the lows of bars 8/9', () => {
  const c = [50, 50, 50, 50, 50]; for (let k = 0; k < 9; k++) c.push(49 - k); // closes 49..41 at t = 5..13, each under the close 4 earlier
  const l = c.map(x => x - 0.5); l[12] = 39; // bar 8 low under bars 6, 7
  const r = tdBuy9(c, l, 13); assert.ok(r); assert.equal(r.low, 39);
  const l2 = c.map(x => x - 0.5); l2[10] = 30; assert.equal(tdBuy9(c, l2, 13), null);   // not perfected
  const c3 = [...c, 40]; assert.equal(tdBuy9(c3, [...l, 39.5], 14), null);   // bar 10 is not a setup 9
});

test('ConnorsRSI pullback setup gates: ADX, a 4% intraday drop, a close in the bottom quarter, ConnorsRSI < 15, volume', () => {
  const n = 30, c = new Array(n).fill(20), h = new Array(n).fill(20.5), l = new Array(n).fill(19.5), v = new Array(n).fill(300000), o = [...c];
  c[29] = 19.0; h[29] = 20; l[29] = 18.9; const S = S0(c, o, h, l, v), crsi = new Array(n).fill(50), adx = new Array(n).fill(35); crsi[29] = 10;
  assert.equal(crsiSetup(S, 29, crsi, adx), true);
  assert.equal(crsiSetup(S, 29, crsi, adx.map(() => 25)), false);
  assert.equal(crsiSetup(S, 29, crsi.map(() => 20), adx), false);
  assert.equal(crsiSetup(S0(c, o, h, l.map((x, k) => k === 29 ? 19.3 : x), v), 29, crsi, adx), false);   // low only 3.5% under
  assert.equal(crsiSetup(S0(c, o, h, l, v.map(() => 100000)), 29, crsi, adx), false);
});

test('frog in the pan and the QMOM half: top decile by momentum, then the smoothest half', () => {
  assert.ok(near(fip([1, 2, 3, 2, 3], 1, 4, 2), 1 * (1 / 4 - 3 / 4)));
  const rows = []; for (let k = 0; k < 200; k++) rows.push({ key: k, m: k, fip: k % 2 ? -0.5 : 0.1 });
  const p = qmomPick(rows); assert.equal(p.length, 10); assert.ok(p.every(k => k >= 180 && k % 2 === 1));
  assert.deepEqual(qmomPick(rows.slice(0, 50)), []);
});

test('MSCI momentum pick: risk-adjusted, z-scored, positive only, n names', () => {
  const rows = []; for (let k = 0; k < 40; k++) rows.push({ key: k, m6: k / 100, m12: k / 50, vol: 0.3 });
  rows.push({ key: 'volatile', m6: 0.39, m12: 0.78, vol: 3.0 });
  const p = mtumPick(rows, 5); assert.deepEqual(p, [39, 38, 37, 36, 35]);
  assert.ok(mtumPick(rows, 100).length <= 21);   // only positive z
});

test('walkers: next-open exit after the trigger close; max hold sells that close; data end leaves it open', () => {
  const c = [10, 10, 11, 12, 13, 14], o = [10, 10.2, 10.8, 12.5, 13, 14], S = S0(c, o);
  const r = walkClose(S, 0, 5, 6, (j) => c[j] >= 12, 60); assert.equal(r.k, 1); assert.equal(r.x, 4); assert.equal(r.at, 'o'); assert.ok(near(r.g, 13 / 10.2 - 1)); assert.equal(r.kind, 'rule');
  const m = walkClose(S, 0, 5, 6, () => false, 3); assert.equal(m.x, 3); assert.equal(m.at, 'c'); assert.equal(m.kind, 'max');
  assert.equal(walkClose(S, 0, 5, 6, () => false, 60).open, true);
  assert.equal(walkClose(S, 5, 5, 6, () => false, 3).pending, true);
  const f = walkFrom(S, 2, 10.5, 5, 6, (j) => j === 2, 60); assert.equal(f.x, 3); assert.ok(near(f.g, 12.5 / 10.5 - 1));
});

test('walkers: a stock that stops trading leaves at its last close', () => {
  const c = [10, 10, 9, 8, NaN, NaN, NaN], S = S0(c, [10, 10, 9.5, 8.2, NaN, NaN, NaN]);
  const r = walkClose(S, 0, 3, 7, () => false, 60); assert.equal(r.kind, 'gone'); assert.ok(near(r.px1, 8)); assert.ok(near(r.g, 8 / 10 - 1));
  const ex = nextOpen(S, 3, 3, 7); assert.equal(ex.gone, true); assert.equal(ex.px, 8);
});

test('resting orders: limit and buy-stop fills, gaps fill at the open, unfilled -> null, data end -> open', () => {
  const S = S0([10, 10, 10], [10, 9.5, 10.6], [10, 10.1, 11], [10, 9.4, 10.2]);
  assert.deepEqual(fillOrder(S, 0, 2, 3, 'limit', 9.6, 1), { k: 1, px: 9.5 });   // opens under the limit
  assert.deepEqual(fillOrder(S, 0, 2, 3, 'limit', 9.45, 1), { k: 1, px: 9.45 });
  assert.equal(fillOrder(S, 0, 2, 3, 'limit', 9.3, 1), null);
  assert.deepEqual(fillOrder(S, 0, 2, 3, 'stop', 10.5, 5), { k: 2, px: 10.6 });   // gaps over the trigger: the open
  assert.deepEqual(fillOrder(S, 0, 2, 3, 'stop', 10.05, 5), { k: 1, px: 10.05 });
  assert.equal(fillOrder(S, 0, 2, 3, 'stop', 20, 5).open, true);
});

test('bracket: stop and target the same day = stop; a gap under the stop sells at the open; target hit sells at the level', () => {
  const o = [10, 10, 10, 10], h = [10, 10.2, 12.5, 10], l = [10, 9.9, 9.0, 10], c = [10, 10, 11, 10], S = S0(c, o, h, l);
  const a = walkBracket(S, 1, 10, 3, 4, 9.2, 12, 10); assert.equal(a.kind, 'stop'); assert.equal(a.x, 2); assert.ok(near(a.px1, 9.2));
  const b = walkBracket(S0(c, [10, 10, 8.5, 10], h, [10, 9.9, 8.4, 10]), 1, 10, 3, 4, 9.2, null, 10); assert.ok(near(b.px1, 8.5));
  const t = walkBracket(S0(c, o, h, [10, 9.9, 9.5, 10]), 1, 10, 3, 4, 9.2, 12, 10); assert.equal(t.kind, 'target'); assert.ok(near(t.px1, 12));
  const m = walkBracket(S, 1, 10, 3, 4, null, null, 2); assert.equal(m.kind, 'max'); assert.equal(m.x, 2); assert.ok(near(m.g, 0.1));
});

test('yardstick: the average stock bought and sold at the same moments, +300% capped, 50 needed', () => {
  const px = (i, x, at) => i === 0 ? (x === 0 ? 1 : 10) : (x === 0 ? 1 : 1.1);
  const ids = Array.from({ length: 50 }, (_, i) => i); const m = yardOf(ids, 0, 1, 'c', px); assert.ok(near(m, (3 + 49 * 0.1) / 50));
  assert.equal(yardOf(ids.slice(0, 10), 0, 1, 'c', px), null);
});

test('shape, newer-vs-older and helpers', () => {
  const s = shape([{ g: 0.108, days: 3 }, { g: -0.092, days: 5 }, { g: 0.008, days: 1 }]); assert.equal(s.n, 3); assert.ok(near(s.win, 0.3333)); assert.ok(near(s.avgWin, 0.1)); assert.ok(near(s.avgLoss, -0.05)); assert.ok(near(s.worst, -0.1));
  assert.equal(newerVsOlder({ older: { n: 5, avg: 0.01, edge: 0 }, newer: { n: 5, avg: 0.02, edge: 0.01 } }).better, true);
  assert.equal(newerVsOlder({ older: { n: 5, avg: 0.03, edge: 0 }, newer: { n: 5, avg: 0.02, edge: 0.01 } }).better, false);
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
  assert.deepEqual(topN([{ key: 'a', v: 1 }, { key: 'b', v: 3 }, { key: 'c', v: NaN }], 5), ['b', 'a']);
});

test('library pre-registration is idempotent and carries sources and the replication label', () => {
  const LB = { strategies: [{ id: 'T1' }] }; assert.equal(preRegister(LB), 8); assert.equal(preRegister(LB), 0);
  const e = LB.strategies.find(x => x.id === 'SQ6-CRSIPB'); assert.equal(e.replication, 'faithful'); assert.ok(e.sources[0].startsWith('https://')); assert.ok(/pre-registered/.test(e.status));
});
