// Seams: research-core.mjs IDEA 7 (daily researcher, 2 Nov 2026): R&D increases (Eberhart, Maxwell and Siddique 2004). Rows from SEC
// company facts (discrete quarters, fallback tag, assets), the event rule, the three increase tests, the data rule and the
// pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, RDI_IDS, RDI, rdiRows, rdiEvents, rdiDataRule, preRegister, ONE_OPEN } from '../research-core.mjs';

const q = (start, end, val, filed, form = '10-Q') => ({ start, end, val, filed, form });
const a = (end, val, filed, form = '10-Q') => ({ end, val, filed, form });
const cf = (rd, assets, tag = 'ResearchAndDevelopmentExpense') => ({ facts: { 'us-gaap': { [tag]: { units: { USD: rd } }, Assets: { units: { USD: assets } } } } });
test('two RDI buy rules, holds 126 and 252, one open trade per stock', () => {
  assert.deepEqual(RDI_IDS, ['RQ-RDI-126', 'RQ-RDI-252']);
  assert.deepEqual(RDI_IDS.map(id => RULES[id].hold), [126, 252]);
  for (const id of RDI_IDS) { assert.ok(IDS.includes(id) && BUY_IDS.includes(id) && ONE_OPEN.has(id)); assert.equal(RULES[id].kind, 'buy'); }
  assert.equal(RDI.rise, 1.05); assert.equal(RDI.intensity, 0.05); assert.equal(RDI.minAssets, 10e6);
});
test('rows: discrete quarters only, originals only, dedup; fallback tag only when the main tag has no quarter', () => {
  const r = rdiRows(cf([q('2023-01-01', '2023-03-31', 5e6, '2023-05-01'), q('2023-01-01', '2023-03-31', 5e6, '2023-05-01'), q('2022-07-01', '2023-03-31', 9e6, '2023-05-01'), q('2023-01-01', '2023-03-31', 1, '2023-05-01', '10-Q/A')], [a('2023-03-31', 100e6, '2023-05-01')]));
  assert.deepEqual(r.q, [['2023-01-01', '2023-03-31', 5e6, '2023-05-01', '10-Q']]); assert.equal(r.tag, 'ResearchAndDevelopmentExpense');
  const f = rdiRows(cf([q('2023-01-01', '2023-03-31', 7e6, '2023-05-01')], [], 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'));
  assert.equal(f.tag, 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'); assert.equal(f.q.length, 1);
  assert.deepEqual(rdiRows(null), { q: [], a: [], tag: null });
});
const base = (curRd, a1) => cf([q('2022-01-01', '2022-03-31', 2e6, '2022-05-02'), q('2023-01-01', '2023-03-31', curRd, '2023-05-04')],
  [a('2022-03-31', 100e6, '2022-05-02'), a('2023-03-31', a1, '2023-05-04')]);
test('events: the three tests (R&D +5%, R&D/assets +5%, 4 x R&D / assets >= 5%)', () => {
  // R&D 2.0M -> 2.2M (+10%), assets 100M -> 100M, intensity 8.8% -> qualifies
  let e = rdiEvents(rdiRows(base(2.2e6, 100e6))); assert.equal(e.length, 1); assert.equal(e[0].qualifies, true); assert.equal(e[0].g, 0.1); assert.equal(e[0].intensity, 0.088);
  // R&D +3% only -> no
  e = rdiEvents(rdiRows(base(2.06e6, 100e6))); assert.equal(e[0].qualifies, false);
  // R&D +10% but assets +20%: R&D/assets falls -> no
  e = rdiEvents(rdiRows(base(2.2e6, 120e6))); assert.equal(e[0].qualifies, false);
  // intensity under 5%: R&D 2.2M on 200M year-ago... use assets 100M -> 100M with small R&D
  e = rdiEvents(rdiRows(cf([q('2022-01-01', '2022-03-31', 0.5e6, '2022-05-02'), q('2023-01-01', '2023-03-31', 1e6, '2023-05-04')], [a('2022-03-31', 100e6, '2022-05-02'), a('2023-03-31', 100e6, '2023-05-04')])));
  assert.equal(e[0].qualifies, false); assert.equal(e[0].intensity, 0.04);
});
test('events: point in time (assets known by the filing), assets floor, late filings and old quarters skipped, zero prior skipped', () => {
  assert.deepEqual(rdiEvents(rdiRows(cf([q('2022-01-01', '2022-03-31', 2e6, '2022-05-02'), q('2023-01-01', '2023-03-31', 3e6, '2023-05-04')], [a('2022-03-31', 100e6, '2022-05-02'), a('2023-03-31', 100e6, '2023-06-01')]))), []);
  assert.deepEqual(rdiEvents(rdiRows(cf([q('2022-01-01', '2022-03-31', 2e6, '2022-05-02'), q('2023-01-01', '2023-03-31', 3e6, '2023-05-04')], [a('2022-03-31', 9e6, '2022-05-02'), a('2023-03-31', 9e6, '2023-05-04')]))), []);
  assert.deepEqual(rdiEvents(rdiRows(cf([q('2022-01-01', '2022-03-31', 2e6, '2022-05-02'), q('2023-01-01', '2023-03-31', 3e6, '2023-09-30')], [a('2022-03-31', 100e6, '2022-05-02'), a('2023-03-31', 100e6, '2023-09-30')]))), []);
  assert.deepEqual(rdiEvents(rdiRows(cf([q('2022-01-01', '2022-03-31', 0, '2022-05-02'), q('2023-01-01', '2023-03-31', 3e6, '2023-05-04')], [a('2022-03-31', 100e6, '2022-05-02'), a('2023-03-31', 100e6, '2023-05-04')]))), []);
  const e = rdiEvents(rdiRows(cf([q('2022-01-01', '2022-03-31', 2e6, '2022-05-02'), q('2023-01-01', '2023-03-31', 3e6, '2023-05-04'), q('2022-10-01', '2022-12-31', 3e6, '2023-06-01')],
    [a('2022-03-31', 100e6, '2022-05-02'), a('2023-03-31', 100e6, '2023-05-04')])));
  assert.deepEqual(e.map(x => x.d), ['2023-05-04']);
});
test('data rule and pre-registration', () => {
  assert.equal(rdiDataRule({ ciks: 100, looked: 96, liqMonths: 100, liqMapped: 90, events: 10000 }).ok, true);
  const bad = rdiDataRule({ ciks: 100, looked: 90, liqMonths: 100, liqMapped: 80, events: 50 }); assert.equal(bad.ok, false); assert.match(bad.why, /95%.*85%.*10,000/);
  const LB = { strategies: [] }; preRegister(LB); for (const id of RDI_IDS) { const e = LB.strategies.find(x => x.id === id); assert.ok(e); assert.match(e.status, /pre-registered 2026-11-02/); assert.equal(e.hold, RULES[id].hold); }
  assert.equal(preRegister(LB), 0);
});
