// Seams: squad22-core.mjs (SQUAD 22, 25 Oct 2026: SQ22-CASHCONV, SQ22-SPINOFF count-first, SQ22-NEGLECTED as written; 13D not run).
// The point-in-time cash-conversion check, the V15 pick, the two exits, the neglected-stock conditions, spin-off cases and the idempotent
// library pre-registration. Run: node --test test/squad22-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, TEST_IDS, NOT_RUN, TH, cashConvAt, compactFacts, factsOf, ttm, filingDates, v15Pick, v15Year, exitHold, exitNegl, crashedBase, neglPrice, quietCrashed, quantile, sharesUp, spinCases, preRegister, perYear } from '../squad22-core.mjs';

const Q = ['2021-03-31', '2021-06-30', '2021-09-30', '2021-12-31', '2022-03-31', '2022-06-30', '2022-09-30', '2022-12-31', '2023-03-31', '2023-06-30', '2023-09-30', '2023-12-31'];
const qs = (e) => ({ '03-31': '-01-01', '06-30': '-04-01', '09-30': '-07-01', '12-31': '-10-01' })[e.slice(5)];
const filed = (e) => { const d = new Date(Date.parse(e + 'T00:00:00Z') + 40 * 864e5); return d.toISOString().slice(0, 10); };
const facts = (vals) => vals.map((v, j) => ({ s: Q[j].slice(0, 4) + qs(Q[j]), e: Q[j], v, f: filed(Q[j]) }));
const co = (o = {}) => ({ cfo: { NetCashProvidedByUsedInOperatingActivities: facts(o.cfo || [80, 80, 80, 80, 80, 80, 80, 80, 100, 120, 140, 150]) }, ni: { NetIncomeLoss: facts(o.ni || Array(12).fill(100)) },
  rev: { Revenues: facts(Array(12).fill(1000)) }, gp: { GrossProfit: facts(o.gp || [400, 400, 400, 400, 400, 400, 400, 400, 420, 420, 420, 420]) }, cogs: {}, dil: { WeightedAverageNumberOfDilutedSharesOutstanding: facts(o.dil || Array(12).fill(1000)) } });

test('registry: three tested rules, the 13D not run (duplicate of ANOM-13D), not-testable ideas listed', () => {
  assert.deepEqual(TEST_IDS, ['SQ22-CASHCONV', 'SQ22-SPINOFF', 'SQ22-NEGLECTED']);
  assert.equal(RULES['SQ22-CASHCONV'].hold, 126); assert.equal(RULES['SQ22-NEGLECTED'].hold, 21); assert.equal(RULES['SQ22-NEGLECTED'].block, 21);
  assert.ok(NOT_RUN.find(x => x.id === 'SQ22-13D').why.includes('ANOM-13D'));
  for (const id of ['REV-QUALITY', 'SUPPLIER-ASIA', 'BUYBACK-INSIDER-CASH']) assert.ok(NOT_RUN.some(x => x.id === id), id);
});

test('cash conversion: rising two quarters to 1.0+ on the filing that completes the quarter, point in time', () => {
  const r = cashConvAt(co(), filed('2023-09-30'));
  assert.equal(r.ok, true, r.why); assert.equal(r.E0, '2023-09-30'); assert.deepEqual(r.r, [1.1, 0.95, 0.85]); assert.ok(r.gm[0] > r.gm[1]); assert.equal(r.dil, 0);
  assert.equal(cashConvAt(co(), '2023-11-08').why, 'not a new quarter', 'the day before the filing: the quarter is not known yet');
  assert.equal(cashConvAt(co(), filed('2023-06-30')).why, 'cash conversion under 1', 'Q2: rising but 0.95');
  assert.equal(cashConvAt(co({ cfo: [80, 80, 80, 80, 80, 80, 80, 80, 100, 60, 140, 150] }), filed('2023-09-30')).why, 'cash conversion not rising');
  assert.equal(cashConvAt(co({ gp: Array(12).fill(400) }), filed('2023-09-30')).why, 'gross margin not up');
  assert.equal(cashConvAt(co({ dil: [1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1030, 1030] }), filed('2023-09-30')).why, 'diluted shares up');
  assert.equal(cashConvAt(co({ ni: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, -500, 100] }), filed('2023-09-30')).why, 'net income not positive');
  assert.ok(filingDates(co(), '2023-01-01').includes(filed('2023-09-30')));
  assert.equal(ttm(co().cfo.NetCashProvidedByUsedInOperatingActivities, '2023-12-31').val, 440);
});

test('compact facts keep USD tags and diluted shares, earliest filing per value', () => {
  const j = { facts: { 'us-gaap': { NetIncomeLoss: { units: { USD: [{ start: '2023-01-01', end: '2023-03-31', val: 5, filed: '2023-05-10' }, { start: '2023-01-01', end: '2023-03-31', val: 5, filed: '2024-05-10' }] } },
    WeightedAverageNumberOfDilutedSharesOutstanding: { units: { shares: [{ start: '2023-01-01', end: '2023-03-31', val: 9, filed: '2023-05-10' }] } } } } };
  const c = compactFacts(j); assert.deepEqual(c.NetIncomeLoss, [['2023-01-01', '2023-03-31', 5, '2023-05-10']]); assert.equal(c.WeightedAverageNumberOfDilutedSharesOutstanding.length, 1);
  assert.equal(factsOf(c.NetIncomeLoss)[0].f, '2023-05-10');
});

test('V15 pick: every 8+, else the 10 best; the fiscal year known from 10 April', () => {
  assert.equal(v15Pick(Array.from({ length: 12 }, (_, k) => ({ key: k, fs: 8 }))).length, 12);
  assert.deepEqual(v15Pick([{ key: 1, fs: 9 }, { key: 2, fs: 5 }, { key: 3, fs: 7 }]), [1, 3, 2]);
  assert.equal(v15Year('2024-04-09'), 2022); assert.equal(v15Year('2024-04-10'), 2023);
});

const flat = (n, px) => ({ o: Array(n).fill(px), h: Array(n).fill(px * 1.01), l: Array(n).fill(px * 0.99), c: Array(n).fill(px), v: Array(n).fill(1000) });
test('exits: 35% stop and 126-session hold; signal-low stop, 10-day average, 21 sessions', () => {
  const S = flat(200, 10); let x = exitHold(S, 10, 0.35, 126); assert.equal(x.kind, 'max'); assert.equal(x.x, 135); assert.equal(x.held, 126);
  S.l[20] = 6.4; x = exitHold(S, 10, 0.35, 126); assert.equal(x.kind, 'stop'); assert.equal(x.px, 6.5); assert.equal(x.x, 20);
  assert.equal(exitHold(flat(50, 10), 10, 0.35, 126).open, true);
  const U = flat(60, 10); for (let q = 10; q < 60; q++) { U.c[q] = 10 + (q - 10) * 0.1; U.o[q] = U.c[q]; U.h[q] = U.c[q] * 1.01; U.l[q] = U.c[q] * 0.99; }
  x = exitNegl(U, 11, 9); assert.equal(x.kind, 'max'); assert.equal(x.held, 21);
  U.c[20] = 10.2; x = exitNegl(U, 11, 9); assert.equal(x.kind, 'ma'); assert.equal(x.x, 21);
  assert.equal(exitNegl(U, 11, 12).kind, 'stop', 'open under the stop sells at the open');
});

// a crashed, quiet stock: 300 sessions falling from 10 to ~2, then a base, then the burst day t = 299
function crashed() { const n = 300, S = { o: [], h: [], l: [], c: [], v: [] };
  for (let k = 0; k < n; k++) { const c = k < 280 ? 10 - 8 * k / 280 : 2.0; S.c.push(c); S.o.push(c); S.h.push(c * 1.01); S.l.push(c * 0.99); S.v.push(100000); }
  const t = n - 1; S.c[t] = 2.1; S.o[t] = 2.0; S.l[t] = 1.99; S.h[t] = 2.12; S.v[t] = 250000; return { S, t }; }
test('neglected: base, price conditions, the 2-3x volume band, quiet yardstick', () => {
  const { S, t } = crashed(); assert.equal(crashedBase(S, t, 0.6e6, 1e6), true); assert.equal(neglPrice(S, t), true);
  assert.equal(crashedBase(S, t, 1.2e6, 1e6), false, 'not in the least-traded third'); assert.equal(crashedBase(S, t, 0.4e6, 1e6), false, 'under 0.5M USD');
  S.v[t] = 300000; assert.equal(neglPrice(S, t), false, '3x volume is out'); S.v[t] = 150000; assert.equal(neglPrice(S, t), false, '1.5x is out'); assert.equal(quietCrashed(S, t), true);
  S.v[t] = 250000; S.c[t] = 2.4; S.h[t] = 2.41; assert.equal(neglPrice(S, t), false, '+20% is out'); S.c[t] = 2.1; S.h[t] = 2.2; assert.equal(neglPrice(S, t), false, 'not in the top quarter of the range');
  S.h[t] = 2.12; S.l[t - 3] = 1.5; assert.equal(neglPrice(S, t), false, 'a lower low in the last 10 sessions');
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.ok(Math.abs(sharesUp([['2024-01-01', 100], ['2024-04-01', 104]], '2024-05-15') - 0.04) < 1e-9);
});

test('spin-off cases: first trade on/after the Form 10, within 400 days, one per CIK, 10-12B and 10-12G only', () => {
  const D = ['2022-01-03', '2022-02-01', '2022-03-01', '2023-06-01'], first = { 1: 1, 2: 0, 3: 3, 4: 2 };
  const c = spinCases([['1', '10-12B', '2022-01-10'], ['1', '10-12B', '2022-01-20'], ['2', '10-12G', '2022-01-10'], ['3', '10-12B', '2022-01-10'], ['4', 'S-1', '2022-01-10']], (cik) => first[cik] ?? -1, D);
  assert.deepEqual(c.map(z => z.cik), ['1']); assert.equal(c[0].filed, '2022-01-10');
});

test('library pre-registration is idempotent and append-only', () => {
  const LB = { strategies: [{ id: 'X' }] }; const n = preRegister(LB); assert.equal(n, TEST_IDS.length + NOT_RUN.length); assert.equal(preRegister(LB), 0);
  assert.equal(LB.strategies[0].id, 'X'); assert.equal(LB.strategies.find(x => x.id === 'SQ22-13D').status.slice(0, 7), 'not run');
  assert.equal(perYear([{ g: 0.108, days: 126 }]), 0.2);
});
