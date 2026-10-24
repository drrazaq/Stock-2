// Seams: squad16-core.mjs (SQUAD 16, 24 Oct 2026: published winning methods, wide sweep). The methods' measures (magic formula, acquirer's
// multiple, F-score, QVAL pick, rank sums, MSCI quality z / buffer / capped weights, shareholder yield, industry momentum, RS-line blue dot),
// point-in-time fact helpers, sleeves, holdings -> trades, the open/close account and the library pre-registration. Pure functions.
// Run: node --test test/squad16-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BASKET_IDS, NOT_TESTED, pctRank, winsorZ, msciScore, finSic, utilSic, sic2, magicMetrics, magicRank, acqMultiple, fScore, qvalPick, rankSumPick, topBy, earnVar, msciRank, bufferPick, cappedWeights, shYield, indPick,
  rsHighArr, blueDot, annualVals, instantNear, sleeveHeld, episodes, episodeTrade, simAccount2, reviewEnds, MONTHS, preRegister, halfOf } from '../squad16-core.mjs';
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('10 rules, one version each, every one with a source, a claim and deviations', () => {
  assert.equal(IDS.length, 10); assert.equal(BASKET_IDS.length, 9); assert.ok(NOT_TESTED.length >= 8);
  for (const id of IDS) { const r = RULES[id]; assert.ok(r.rule.length > 100, id); assert.ok(r.deviations.length > 20, id); assert.ok(/^https:\/\//.test(r.source.url), id); assert.ok(r.source.claim && r.source.costs && r.source.oos, id); assert.equal(r.block, 63); }
  assert.equal(RULES['SQ16-MAGIC'].target, RULES['SQ16-MAGIC'].sleeveN * RULES['SQ16-MAGIC'].sleeves); assert.equal(RULES['SQ16-RSNH'].hold, 63);
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('sectors and ranks', () => {
  assert.ok(finSic('6022')); assert.ok(!finSic('5961')); assert.ok(utilSic('4911')); assert.ok(!utilSic('4813')); assert.equal(sic2('3674'), '36'); assert.equal(sic2('6770'), null); assert.equal(sic2('9995'), null); assert.equal(sic2(''), null); assert.equal(sic2(737), '07');
  const p = pctRank([{ key: 'a', v: 1 }, { key: 'b', v: 2 }, { key: 'c', v: 2 }, { key: 'd', v: 3 }, { key: 'e', v: null }]);
  assert.equal(p.get('a'), 0); assert.equal(p.get('d'), 1); assert.ok(near(p.get('b'), 0.5)); assert.ok(near(p.get('c'), 0.5)); assert.equal(p.has('e'), false);
  const z = winsorZ([1, 2, 3, 4, 100, null]); assert.equal(z[5], null); assert.ok(z[4] > 0 && z[4] < 2); assert.ok(near(msciScore(1), 2)); assert.ok(near(msciScore(-1), 0.5));
});

test('magic formula: earnings yield, return on capital, rank sum', () => {
  const m = magicMetrics({ ebit: 10, cap: 80, debt: 30, cash: 10, ca: 50, cl: 30, dcur: 5, ppe: 15 });
  assert.ok(near(m.ey, 10 / 100)); assert.ok(near(m.roc, 10 / ((50 - 10) - (30 - 5) + 15)));
  assert.deepEqual(magicMetrics({ ebit: -1, cap: 80 }), { ey: null, roc: null }); assert.equal(magicMetrics({ ebit: 5, cap: 80, debt: 0, cash: 0 }).roc, null);
  const rk = magicRank([{ key: 'a', ey: 0.10, roc: 0.5 }, { key: 'b', ey: 0.20, roc: 0.1 }, { key: 'c', ey: 0.15, roc: 0.3 }, { key: 'd', ey: null, roc: 1 }]);
  assert.deepEqual(rk, ['b', 'c', 'a']);   // sums all 4 -> ties by earnings yield
});
test('magic formula tie order is by earnings yield', () => { assert.deepEqual(magicRank([{ key: 'a', ey: 0.10, roc: 0.5 }, { key: 'b', ey: 0.20, roc: 0.1 }]), ['b', 'a']); });

test('acquirer\'s multiple, F-score and the QVAL pick', () => {
  assert.ok(near(acqMultiple({ ebit: 10, cap: 90, debt: 20, cash: 10 }), 10)); assert.equal(acqMultiple({ ebit: 0, cap: 90 }), null); assert.equal(acqMultiple({ ebit: 10, cap: 5, debt: 0, cash: 10 }), null);
  const all = { ni: 10, cfo: 15, assets: 100, ni0: 5, assets0: 100, ltd: 10, ltd0: 20, ca: 50, cl: 20, ca0: 40, cl0: 20, iss: 0, gp: 40, rev: 100, gp0: 30, rev0: 90 };
  assert.deepEqual(fScore(all), { score: 9, have: 9 }); assert.equal(fScore({ ...all, iss: 5 }).score, 8); assert.equal(fScore({ ni: 1, cfo: 2 }).score, null);
  const rows = Array.from({ length: 40 }, (_, j) => ({ key: 'k' + j, mult: j + 1, f: j % 9 }));
  assert.deepEqual(qvalPick(rows), ['k3', 'k2']);   // cheapest 4 (k0..k3, F 0..3) -> the better half by F
});

test('two-rank composite and top-by', () => {
  const r = rankSumPick([{ key: 'a', a: 1, b: 3, tie: 1 }, { key: 'b', a: 3, b: 1, tie: 2 }, { key: 'c', a: 2, b: 2, tie: 0 }, { key: 'd', a: null, b: 9 }], 2);
  assert.deepEqual(r, ['b', 'a']);
  assert.deepEqual(topBy([{ key: 'x', v: 1, tie: 5 }, { key: 'y', v: 3 }, { key: 'z', v: 1, tie: 9 }, { key: 'w', v: null }], 3), ['y', 'z', 'x']);
});

test('MSCI quality: variability, z composite, buffer, capped weights', () => {
  assert.equal(earnVar([{ v: 1 }, { v: 2 }, { v: 3 }]), null); assert.ok(earnVar([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 3 }]) > 0);
  const rows = Array.from({ length: 30 }, (_, j) => ({ key: j, roe: j / 30, de: 1, ev: 0.1, cap: 1 + j }));
  const rk = msciRank(rows); assert.deepEqual(rk.slice(0, 2).map(x => x.key), [28, 29]);   // both winsorised to the 95th percentile assert.equal(rk.length, 30);
  assert.equal(msciRank([{ key: 1, roe: 0.1, de: null, ev: null, cap: 1 }, { key: 2, roe: 0.2, de: null, ev: null, cap: 1 }, { key: 3, roe: 0.3, de: null, ev: null, cap: 1 }]).length, 0);
  assert.deepEqual(bufferPick(['a', 'b', 'c', 'd', 'e'], new Set(['d']), 2, 4), ['a', 'd']); assert.deepEqual(bufferPick(['a', 'b', 'c', 'd', 'e'], new Set(['e']), 2, 4), ['a', 'b']);
  const w = cappedWeights([{ key: 'a', score: 1, cap: 90 }, ...Array.from({ length: 30 }, (_, j) => ({ key: 'x' + j, score: 1, cap: 1 }))], 0.05);
  assert.ok(near([...w.values()].reduce((a, b) => a + b, 0), 1, 1e-9)); assert.ok(w.get('a') <= 0.05 + 1e-12);
});

test('shareholder yield and industry momentum', () => {
  assert.ok(near(shYield({ div: 2, rep: 3, iss: 1, cap: 100, debt: 40, debt0: 50 }), 0.04 + 0.10)); assert.equal(shYield({ cap: 100 }), null); assert.ok(near(shYield({ div: 2, cap: 100 }), 0.02));
  const rows = [...['a1', 'a2', 'a3', 'a4', 'a5'].map((k, j) => ({ key: k, ind: '36', cap: 1, r: 0.5 })), ...['b1', 'b2', 'b3', 'b4', 'b5'].map(k => ({ key: k, ind: '28', cap: 1, r: 0.1 })), ...['c1', 'c2'].map(k => ({ key: k, ind: '73', cap: 1, r: 9 }))];
  const P = indPick(rows, 1, 5); assert.deepEqual(P.keys, ['a1', 'a2', 'a3', 'a4', 'a5']); assert.equal(P.industries[0].k, '36');
  const W = indPick([{ key: 1, ind: '10', cap: 9, r: 0.1 }, { key: 2, ind: '10', cap: 1, r: 1 }, { key: 3, ind: '20', cap: 1, r: 0.15 }, { key: 4, ind: '20', cap: 1, r: 0.15 }], 1, 2); assert.equal(W.industries[0].k, '10');   // cap-weighted 0.19 vs 0.15
});

test('RS line blue dot: RS at a 52-week high, price not, within 15%, above the 50-day, fresh', () => {
  const n = 300, m = new Array(n).fill(100), c = new Array(n).fill(100); c[100] = 110;   // old price high 110
  for (let t = 260; t < n; t++) m[t] = 80;   // the market falls: RS jumps while the price stays at 100
  const hi = rsHighArr(c, m); assert.equal(hi[260], 1); const s50 = new Array(n).fill(95);
  assert.equal(blueDot(c, hi, s50, 260), true); assert.equal(blueDot(c, hi, s50, 261), false);   // 261: RS equal, not a new high
  const c2 = [...c]; c2[260] = 120; assert.equal(blueDot(c2, rsHighArr(c2, m), s50, 260), false);   // price itself at a new high
  const c3 = [...c]; c3[100] = 200; assert.equal(blueDot(c3, rsHighArr(c3, m), s50, 260), false);   // more than 15% under the high
});

test('point-in-time fact helpers', () => {
  const F = [{ s: '2020-01-01', e: '2020-12-31', v: 10, f: '2021-02-01' }, { s: '2021-01-01', e: '2021-12-31', v: 12, f: '2022-02-01' }, { s: '2021-01-01', e: '2021-12-31', v: 13, f: '2022-05-01' }, { s: '2021-10-01', e: '2021-12-31', v: 3, f: '2022-02-01' }];
  assert.deepEqual(annualVals(F, '2022-03-01'), [{ e: '2020-12-31', v: 10 }, { e: '2021-12-31', v: 12 }]); assert.deepEqual(annualVals(F, '2022-06-01').map(x => x.v), [10, 13]); assert.deepEqual(annualVals(F, '2021-02-01'), []);
  const I = [{ s: '', e: '2021-12-31', v: 5, f: '2022-02-01' }, { s: '', e: '2020-12-31', v: 4, f: '2021-02-01' }];
  assert.deepEqual(instantNear(I, '2022-03-01', '2021-01-05'), { end: '2020-12-31', val: 4 }); assert.equal(instantNear(I, '2021-01-15', '2021-01-05'), null);
});

test('sleeves: one-year holds, re-picks continue, held names are skipped', () => {
  const R = [['a', 'b', 'c'], ['a', 'b', 'c', 'd'], ['c', 'd', 'e'], ['f', 'g'], ['a', 'x']];
  const { picks, held } = sleeveHeld(R, 2, 4);
  assert.deepEqual(picks, [['a', 'b'], ['c', 'd'], ['e'], ['f', 'g'], ['a', 'x']]);
  assert.deepEqual([...held[3]].sort(), ['a', 'b', 'c', 'd', 'e', 'f', 'g']); assert.deepEqual([...held[4]].sort(), ['a', 'c', 'd', 'e', 'f', 'g', 'x']);
  const E = episodes(held); const a = E.find(e => e.key === 'a'), b = E.find(e => e.key === 'b');
  assert.deepEqual([a.a, a.b], [0, null]); assert.deepEqual([b.a, b.b], [0, 4]);
});

test('holdings -> trades: buy the next open, sell the open after the dropping review; gone = last close', () => {
  const o = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21], c = o.map(x => x + 0.5), T = 12;
  const r = episodeTrade({ o, c }, 2, 6, 11, T); assert.equal(r.k, 3); assert.equal(r.x, 7); assert.equal(r.at, 'o'); assert.ok(near(r.g, 17 / 13 - 1)); assert.equal(r.days, 5);
  assert.equal(episodeTrade({ o, c }, 2, null, 11, T).open, true); assert.equal(episodeTrade({ o, c }, 11, null, 11, T).pending, true);
  const g = episodeTrade({ o, c }, 2, 8, 4, T); assert.equal(g.kind, 'gone'); assert.equal(g.x, 4); assert.ok(near(g.px1, 14.5));
  const o2 = [...o]; o2[3] = NaN; assert.equal(episodeTrade({ o: o2, c }, 2, 6, 11, T), null);
});

test('account: exits at the open before buys, costs on both sides', () => {
  const o = [10, 10, 10, 10, 10], c = [10, 10, 10, 10, 10], px = { o: (i, k) => (i ? o : o)[k], c: (i, k) => c[k] };
  const A = simAccount2({ T: 5, start: 1, cands: [{ id: 'a', key: 'a', i: 0, k: 1, x: 3, at: 'o', w: 1 }, { id: 'b', key: 'b', i: 1, k: 3, x: null, at: 'o', w: 0.5 }], px, side: 0.01 });
  assert.deepEqual(A.taken, ['a', 'b']); const afterA = (1 / 1.01) * 0.99; assert.ok(near(A.eq[2], 1 / 1.01, 1e-12)); assert.ok(near(A.eq[3], afterA - (0.5 * (1 / 1.01)) * 0.01, 1e-9));
});

test('review sessions', () => {
  const D = ['2024-03-28', '2024-04-01', '2024-05-31', '2024-06-03', '2024-06-28', '2024-07-01'];
  assert.deepEqual(reviewEnds(D, MONTHS.quarterly), [0, 4]); assert.deepEqual(reviewEnds(D, MONTHS.semiannual), [2]); assert.deepEqual(reviewEnds(D, MONTHS.monthly), [0, 1, 2, 4]);
});

test('library pre-registration: idempotent, append only', () => {
  const LB = { strategies: [{ id: 'X' }] }; assert.equal(preRegister(LB), 10); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, 11);
  const e = LB.strategies.find(x => x.id === 'SQ16-MAGIC'); assert.ok(/pre-registered/.test(e.status)); assert.ok(e.claimed && e.sources.length && e.libraryCheck);
});
