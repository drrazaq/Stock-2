// Seams: squad23-core.mjs (SQUAD 23, 25 Oct 2026: a second halal basket next to Basket 1). Candidate picks (no overlap with Basket 1),
// weights, the 70/30 combo, point-in-time gross profitability, the key-test comparison, correlation, whole percentages, the library.
import test from 'node:test';
import assert from 'node:assert/strict';
import { b1Weights, c10, next30Pick, midqPick, momPick, candWeights, comboWeights, overlap, gpaAt, ttmLatest, comboBetter, corr, wholePct, yearReturns, worstYear, preRegister, IDS, RULES, FUND } from '../squad23-core.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e, sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
const rows = (n) => Array.from({ length: n }, (_, j) => ({ key: 'k' + j, cap: 10000 - j * 10, mom: j % 7 === 3 ? null : ((j * 37) % 23) / 10 - 1, gpa: j % 5 === 0 ? null : ((j * 13) % 17) / 10 }));

test('no candidate ever holds a Basket 1 name (Shariah ranks 1-20)', () => {
  const r = rows(520), b1 = b1Weights(r); assert.equal(b1.size, 20); assert.ok(near(sum(b1), 1)); assert.ok(Math.max(...b1.values()) <= 0.15 + 1e-9);
  for (const id of ['SQ23-NEXT30', 'SQ23-MIDQ', 'SQ23-NEXT30-MOM']) { const w = candWeights(id, r); assert.ok(w && w.size === 30, id); assert.ok(near(sum(w), 1), id); assert.deepEqual(overlap(b1, w), [], id); }
});

test('NEXT30 = ranks 21-50, cap-weighted, max 10%', () => {
  const r = rows(60), p = next30Pick(r); assert.equal(p[0].key, 'k20'); assert.equal(p[29].key, 'k49');
  const big = [{ key: 'a', cap: 1000 }, ...Array.from({ length: 29 }, (_, j) => ({ key: 'x' + j, cap: 10 }))], w = c10(big); assert.ok(near(w.get('a'), 0.1)); assert.ok(near(sum(w), 1));
  assert.equal(candWeights('SQ23-NEXT30', rows(49)), null, 'list too short');
});

test('MIDQ: ranks 101-500, the 30 highest GP/A, unknown left out, equal weight', () => {
  const r = rows(520), p = midqPick(r); assert.equal(p.length, 30); assert.ok(p.every(x => +x.key.slice(1) >= 100 && +x.key.slice(1) < 500 && x.gpa !== null));
  const worst = Math.min(...p.map(x => x.gpa)); assert.ok(r.slice(100, 500).filter(x => x.gpa !== null && !p.includes(x)).every(x => x.gpa <= worst));
  const w = candWeights('SQ23-MIDQ', r); for (const v of w.values()) assert.ok(near(v, 1 / 30));
  assert.equal(candWeights('SQ23-MIDQ', rows(499)), null, 'needs the list to 500');
});

test('NEXT30-MOM: ranks 21-100 by 12-1, no history left out, ties to the larger company', () => {
  const r = rows(120), p = momPick(r); assert.equal(p.length, 30); assert.ok(p.every(x => +x.key.slice(1) >= 20 && +x.key.slice(1) < 100 && x.mom !== null));
  const t = momPick([...rows(20), { key: 'small', cap: 1, mom: 0.5 }, { key: 'big', cap: 9, mom: 0.5 }]); assert.equal(t[0].key, 'big');
  const w = candWeights('SQ23-NEXT30-MOM', r); assert.ok(Math.max(...w.values()) <= 0.1 + 1e-9);
});

test('combo: 70% Basket 1 + 30% candidate, sums to 1', () => {
  const c = comboWeights(new Map([['a', 0.6], ['b', 0.4]]), new Map([['GLD', 1]])); assert.ok(near(c.get('a'), 0.42)); assert.ok(near(c.get('GLD'), 0.3)); assert.ok(near(sum(c), 1));
  assert.equal(FUND['SQ23-WORLD'], 'UMMA'); assert.equal(FUND['SQ23-GOLD'], 'GLD');
});

test('gross profitability is point in time (filed before the day), stale or missing = null, latest tag wins', () => {
  const yr = (e, v, f, s) => ({ s: s || (+e.slice(0, 4) - 1) + e.slice(4, 8) + String(+e.slice(8) + 1).padStart(2, '0'), e, v, f });
  const co = { gp: { GrossProfit: [yr('2022-12-31', 40, '2023-02-20', '2022-01-01')] }, assets: { Assets: [{ s: '', e: '2022-12-31', v: 200, f: '2023-02-20' }] }, rev: {}, cogs: {} };
  assert.equal(gpaAt(co, '2023-02-20'), null, 'filed that day = not yet known'); assert.ok(near(gpaAt(co, '2023-02-21'), 0.2));
  assert.equal(gpaAt(co, '2024-01-15'), null, 'over 300 days old');
  const co2 = { gp: {}, assets: co.assets, rev: { Revenues: [yr('2022-12-31', 100, '2023-02-20', '2022-01-01')] }, cogs: { CostOfRevenue: [yr('2022-12-31', 70, '2023-02-20', '2022-01-01')] } };
  assert.ok(near(gpaAt(co2, '2023-03-01'), 0.15), 'revenue - cost of revenue');
  const tl = ttmLatest({ Old: [yr('2019-12-31', 5, '2020-02-01', '2019-01-01')], New: [yr('2022-12-31', 9, '2023-02-01', '2022-01-01')] }, '2023-03-01'); assert.equal(tl.val, 9);
});

test('key test comparison: return per unit of drawdown, or (a CAGR <= 0) higher CAGR and no deeper fall', () => {
  assert.equal(comboBetter({ cagr: 0.15, maxDD: -0.25 }, { cagr: 0.16, maxDD: -0.33 }), true);
  assert.equal(comboBetter({ cagr: 0.10, maxDD: -0.30 }, { cagr: 0.16, maxDD: -0.33 }), false);
  assert.equal(comboBetter({ cagr: -0.01, maxDD: -0.2 }, { cagr: -0.03, maxDD: -0.3 }), true);
  assert.equal(comboBetter({ cagr: -0.01, maxDD: -0.35 }, { cagr: -0.03, maxDD: -0.3 }), false);
  assert.equal(comboBetter({ cagr: -0.01, maxDD: -0.1 }, { cagr: 0.02, maxDD: -0.3 }), false);
  assert.equal(comboBetter(null, { cagr: 0.1, maxDD: -0.1 }), null);
});

test('correlation of monthly returns', () => {
  const a = [1, 2, 3, 4, 5, 6, 7].map((r, j) => ({ m: '2024-0' + (j + 1), r })), b = a.map(x => ({ m: x.m, r: 2 * x.r + 1 })), c = a.map(x => ({ m: x.m, r: -x.r }));
  assert.equal(corr(a, b), 1); assert.equal(corr(a, c), -1); assert.equal(corr(a.slice(0, 5), b), null);
});

test('whole percentages sum to 100 (largest remainder)', () => {
  const p = wholePct([{ key: 'a', w: 1 / 3 }, { key: 'b', w: 1 / 3 }, { key: 'c', w: 1 / 3 }]); assert.equal(p.reduce((s, x) => s + x.pct, 0), 100); assert.deepEqual(p.map(x => x.pct).sort(), [33, 33, 34]);
  const q = wholePct(Array.from({ length: 30 }, (_, j) => ({ key: 'k' + j, w: 1 + j / 10 }))); assert.equal(q.reduce((s, x) => s + x.pct, 0), 100); assert.ok(q.every(x => Number.isInteger(x.pct)));
  assert.deepEqual(wholePct([]), []);
});

test('calendar years and the worst year', () => {
  const D = ['2023-12-28', '2023-12-29', '2024-01-02', '2024-12-31', '2025-01-02'], lv = [1, 1.1, 1.0, 0.9, 1.2], y = yearReturns(lv, D, 0);
  assert.equal(y[0].y, '2023'); assert.ok(near(y[0].r, 0.1)); assert.ok(near(y[1].r, -0.1818, 1e-4)); assert.equal(worstYear(y).y, '2024');
});

test('library: five SQ23 rules registered once, basket study', () => {
  const LB = { strategies: [] }; assert.equal(preRegister(LB), 5); assert.equal(preRegister(LB), 0); assert.deepEqual(LB.strategies.map(e => e.id), IDS);
  assert.ok(LB.strategies.every(e => /pre-registered/.test(e.status) && /not used for TRY SMALL/.test(e.explain))); assert.ok(/SPWO/.test(RULES['SQ23-WORLD'].short));
});
