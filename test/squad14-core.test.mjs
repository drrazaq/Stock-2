// Seams: squad14-core.mjs (SQUAD 14, 24 Oct 2026: pre-registered variants of what worked). The MTUM-style inputs (weekly volatility,
// 6 / 12-month momentum, last complete week), SIC 4-digit groups (catch-alls out), the 52-week first-high series, followers, the MTPB add
// leg, the trade-driven account (slots, skips, costs), path stats, the scan.mjs TRY SMALL re-statement and the library pre-registration.
// Pure functions. Run: node --test test/squad14-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, PB_IDS, weeklyVol, mom6_12, lastWeekAt, sic4, groupsBySic, newHigh, firstHighIn, firstHighArr, followers, addSignal, simAccount, pathStats, yearTable, tryWouldQualify, preRegister, halfOf } from '../squad14-core.mjs';
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('6 rules, one version each; holds fixed; two with a portfolio test', () => {
  assert.equal(IDS.length, 6); assert.deepEqual(PB_IDS, ['SQ14-PB12M', 'SQ14-PB15', 'SQ14-PB12P5', 'SQ14-PB12H']);
  for (const id of IDS) { assert.ok([63, 126].includes(RULES[id].hold), id); assert.equal(RULES[id].block, 63); assert.ok(RULES[id].rule.length > 80, id); }
  assert.deepEqual(IDS.filter(id => RULES[id].portfolio), ['SQ14-PB12P5', 'SQ14-MTPB']);
  assert.equal(RULES['SQ14-PB15'].pct, 0.15); assert.equal(RULES['SQ14-PB12M'].leaders, 'mtum');
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('MTUM inputs: weekly volatility needs 52+ returns; momentum skips the last month; last complete week', () => {
  const wc = Array.from({ length: 60 }, (_, w) => 100 * (w % 2 ? 1.01 : 1));
  const v = weeklyVol(wc, 59); assert.ok(v > 0); assert.equal(weeklyVol(wc, 40), null);
  const c = new Array(300).fill(10); c[299 - 21] = 20; c[299 - 126] = 16; c[299 - 252] = 8;
  const m = mom6_12(c, 299); assert.ok(near(m.m6, 0.25)); assert.ok(near(m.m12, 1.5)); assert.equal(mom6_12(c, 200).m12, null);
  const W = [{ s: 0, e: 4 }, { s: 5, e: 9 }, { s: 10, e: 12 }];
  assert.equal(lastWeekAt(W, 9), 1); assert.equal(lastWeekAt(W, 7), 0); assert.equal(lastWeekAt(W, 12), 2);
});

test('industry: SIC 4-digit, catch-alls out, 4+ members, ranked by market value', () => {
  assert.equal(sic4('3674'), '3674'); assert.equal(sic4(737), '0737'); assert.equal(sic4('7389'), null); assert.equal(sic4('6770'), null); assert.equal(sic4(''), null); assert.equal(sic4('0'), null);
  const rows = [{ key: 1, sic: '3674', cap: 5 }, { key: 2, sic: '3674', cap: 9 }, { key: 3, sic: '3674', cap: 7 }, { key: 4, sic: '3674', cap: 1 }, { key: 5, sic: '7372', cap: 3 }, { key: 6, sic: '7389', cap: 1 }, { key: 7, sic: '7389', cap: 1 }, { key: 8, sic: '7389', cap: 1 }, { key: 9, sic: '7389', cap: 1 }];
  const G = groupsBySic(rows); assert.deepEqual([...G.keys()], ['3674']); assert.deepEqual(G.get('3674'), [2, 3, 1, 4]);
});

test('first 52-week high in 63 sessions: series version equals the point version', () => {
  const c = []; let p = 100; for (let t = 0; t < 700; t++) { p *= 1 + (Math.sin(t / 17) * 0.02 + (t % 90 < 3 ? 0.03 : -0.001)); c.push(p); }
  const a = firstHighArr(c); let n = 0; for (let t = 0; t < c.length; t++) { assert.equal(!!a[t], firstHighIn(c, t), 't ' + t); if (a[t]) n++; } assert.ok(n > 0);
  const flat = new Array(300).fill(10); flat[299] = 11; assert.equal(newHigh(flat, 299), true); assert.equal(firstHighIn(flat, 299), true);
});

test('followers: ranks 2-4 that rose under +2%', () => {
  const ret = { a: 0.5, b: 0.01, c: 0.05, d: -0.03, e: 0 }; assert.deepEqual(followers(['a', 'b', 'c', 'd', 'e'], (k) => ret[k]), ['b', 'd']);
  assert.deepEqual(followers(['a', 'b'], (k) => ret[k]), ['b']);
});

test('MTPB add: the first pullback at t with t+1 before the base exit', () => {
  assert.equal(addSignal({ k: 10, x: 20 }, (t) => t >= 15), 15); assert.equal(addSignal({ k: 10, x: 20 }, (t) => t === 19), null); assert.equal(addSignal({ k: 10, x: 20 }, (t) => t === 18), 18);
  assert.equal(addSignal({ k: 10, x: 20 }, (t) => t === 9), null); assert.equal(addSignal(null, () => true), null);
});

test('account: slots, skips when full or held, priority, cost on both sides, marks', () => {
  const T = 10, P = { 1: [10, 10, 10, 10, 10, 20, 20, 20, 20, 20], 2: [10, 10, 10, 10, 10, 10, 10, 10, 10, 10], 3: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5] };
  const px = { o: (i, k) => P[i][k], c: (i, k) => P[i][k] };
  const cands = [{ id: 'a', key: 1, i: 1, k: 1, x: 7, pri: 1, w: 0.5 }, { id: 'b', key: 2, i: 2, k: 1, x: 3, pri: 2, w: 0.5 }, { id: 'c', key: 3, i: 3, k: 1, x: 4, pri: 0, w: 0.5 }, { id: 'd', key: 1, i: 1, k: 2, x: 8, pri: 9, w: 0.5 }];
  const A = simAccount({ T, start: 0, cands, maxOpen: 2, px, side: 0 });
  assert.deepEqual(A.taken, ['b', 'a']); assert.equal(A.skipped.full, 1); assert.equal(A.skipped.held, 1);
  assert.ok(near(A.eq[0], 1)); assert.ok(near(A.eq[4], 1)); assert.ok(near(A.eq[5], 1.5)); assert.ok(near(A.eq[9], 1.5));   // stock 1 doubled on half the account
  const B = simAccount({ T, start: 0, cands: [{ id: 'x', key: 2, i: 2, k: 1, x: 3, w: 1 }], px, side: 0.01 });
  assert.ok(near(B.eq[9], (1 / 1.01) * 0.99)); assert.ok(B.eq[9] < 1);
  const C = simAccount({ T, start: 0, cands: [{ id: 'y', key: 1, i: 1, k: 1, x: null, w: 1 }], px, side: 0 }); assert.ok(near(C.eq[9], 2));   // open at the data end: marked
});

test('path stats and year table', () => {
  const lv = [NaN, 1, 1.1, 0.88, 1.21]; const s = pathStats(lv, 0, 4); assert.ok(near(s.total, 0.21)); assert.ok(near(s.maxDD, -0.2)); assert.equal(pathStats([NaN, 1], 0, 1), null);
  const D = ['2023-12-28', '2023-12-29', '2024-01-02', '2024-12-31', '2025-01-02']; const y = yearTable(D, [1, 1.1, 1.2, 1.32, 1.4], [1, 1, 1, 1, 1], [1, 1, 1, 1, 1], 0);
  assert.ok(near(y['2023'].account, 0.1)); assert.ok(near(y['2024'].account, 0.2)); assert.equal(y['2024'].from, '2023-12-29');
});

test('TRY SMALL re-statement: halves, perYear gate, portfolio gate', () => {
  const h = { avgStress: 0.05, edge: 0.02, noTop2: 0.03, n: 30, blocks: 4 };
  assert.equal(tryWouldQualify({ verdict: 'NOT PROVEN', results: { older: h, newer: h } }).qualifies, true);
  assert.equal(tryWouldQualify({ verdict: 'REJECTED', results: { older: h, newer: h } }).qualifies, false);
  assert.equal(tryWouldQualify({ verdict: 'NOT PROVEN', results: { older: h, newer: { ...h, n: 12 } } }).qualifies, false);
  assert.equal(tryWouldQualify({ verdict: 'NOT PROVEN', results: { older: h, newer: h }, perYear: { older: { rule: 0.1, spy: 0.2 }, newer: { rule: 0.3, spy: 0.2 } } }).qualifies, false);
  assert.equal(tryWouldQualify({ verdict: 'NOT PROVEN', results: { older: h, newer: h }, portfolio: { standard: { halves: { older: { beatsSpy: true }, newer: { beatsSpy: false } } } } }).qualifies, false);
});

test('pre-registration writes each SQ14 rule once (idempotent)', () => {
  const LB = { strategies: [{ id: 'SQ11-PB12' }] }; assert.equal(preRegister(LB), 6); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, 7);
  const e = LB.strategies.find(x => x.id === 'SQ14-PB12P5'); assert.ok(/5 open/.test(e.explain)); assert.ok(/VARIANTS OF A WINNER/.test(e.explain)); assert.equal(e.agent, 'squad14');
});
