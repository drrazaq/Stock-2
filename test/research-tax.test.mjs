// Seams: research-core.mjs IDEA 6 (daily researcher, 1 Nov 2026): tax expense momentum (Thomas and Zhang 2011). Rows from SEC company
// facts (discrete quarters only, assets), the event rule, the year-ago match, the assets scaling and floor, the data rule and the
// pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, TAX_IDS, TAX, taxRows, taxEvents, taxDataRule, preRegister, ONE_OPEN } from '../research-core.mjs';

const q = (start, end, val, filed, form = '10-Q') => ({ start, end, val, filed, form, accn: 'x' });
const a = (end, val, filed, form = '10-Q') => ({ end, val, filed, form, accn: 'x' });
const cf = (tax, assets) => ({ facts: { 'us-gaap': { IncomeTaxExpenseBenefit: { units: { USD: tax } }, Assets: { units: { USD: assets } } } } });
test('three TAX rules: two buys, one avoid; holds fixed; one open trade per stock', () => {
  assert.deepEqual(TAX_IDS, ['RQ-TAX-63', 'RQ-TAX-126', 'RQ-TAX-LOW63']);
  assert.deepEqual(TAX_IDS.map(id => RULES[id].hold), [63, 126, 63]);
  assert.deepEqual(TAX_IDS.map(id => RULES[id].kind), ['buy', 'buy', 'avoid']);
  for (const id of TAX_IDS) { assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); }
  assert.ok(BUY_IDS.includes('RQ-TAX-126') && !BUY_IDS.includes('RQ-TAX-LOW63'));
  assert.equal(TAX.minAssets, 10e6); assert.equal(TAX.maxLag, 120);
});
test('rows: discrete quarters only (80-100 days), original 10-Q/10-K, deduplicated; assets instants', () => {
  const r = taxRows(cf([q('2023-01-01', '2023-03-31', 5e6, '2023-05-01'), q('2023-01-01', '2023-03-31', 5e6, '2023-05-01'), q('2022-07-01', '2023-03-31', 9e6, '2023-05-01'),
    q('2023-01-01', '2023-03-31', 1e6, '2023-05-01', '10-Q/A'), q('2023-01-01', '2023-03-31', 1e6, '2023-05-01', '8-K'), q('2022-01-01', '2022-03-31', -2e6, '2022-05-02')],
    [a('2022-03-31', 100e6, '2022-05-02'), a('2022-03-31', 100e6, '2022-05-02'), { start: '2022-01-01', end: '2022-03-31', val: 1, filed: '2022-05-02', form: '10-Q' }]));
  assert.deepEqual(r.q, [['2022-01-01', '2022-03-31', -2e6, '2022-05-02', '10-Q'], ['2023-01-01', '2023-03-31', 5e6, '2023-05-01', '10-Q']]);
  assert.deepEqual(r.a, [['2022-03-31', 100e6, '2022-05-02']]);
  assert.deepEqual(taxRows(null), { q: [], a: [] });
});
test('events: new latest quarter, timely, (current - year-ago) / year-ago assets, assets floor', () => {
  const rows = taxRows(cf([
    q('2022-01-01', '2022-03-31', 2e6, '2022-05-02'), q('2022-04-01', '2022-06-30', 3e6, '2022-08-03'),
    q('2023-01-01', '2023-03-31', 7e6, '2023-05-04'), q('2022-01-01', '2022-03-31', 2e6, '2023-05-04'),
    q('2023-04-01', '2023-06-30', 4e6, '2023-12-20'),                        // late (173 days): no event
    q('2022-10-01', '2022-12-31', 1e6, '2023-06-01'),                        // an older end filed later: no event
    q('2024-01-01', '2024-03-31', 1e6, '2024-05-02')],
    [a('2022-03-31', 100e6, '2022-05-02'), a('2023-03-31', 200e6, '2023-05-04'), a('2022-06-30', 5e6, '2022-08-03')]));
  const ev = taxEvents(rows);
  assert.deepEqual(ev.map(e => [e.d, e.end, e.g]), [['2023-05-04', '2023-03-31', 0.05], ['2024-05-02', '2024-03-31', -0.03]]);
  assert.equal(ev[0].assets, 100e6); assert.equal(ev[1].prior, 7e6);
  // year-ago assets not known by the filing date -> no event; assets under 10M -> no event
  assert.deepEqual(taxEvents(taxRows(cf([q('2022-01-01', '2022-03-31', 1e6, '2022-05-02'), q('2023-01-01', '2023-03-31', 2e6, '2023-05-02')], [a('2022-03-31', 50e6, '2023-06-01')]))), []);
  assert.deepEqual(taxEvents(taxRows(cf([q('2022-01-01', '2022-03-31', 1e6, '2022-05-02'), q('2023-01-01', '2023-03-31', 2e6, '2023-05-02')], [a('2022-03-31', 9e6, '2022-05-02')]))), []);
  assert.deepEqual(taxEvents({ q: [], a: [] }), []);
});
test('data rule: 95% looked up, 85% mapped, 15,000 events', () => {
  assert.equal(taxDataRule({ ciks: 100, looked: 96, liqMonths: 100, liqMapped: 90, events: 20000 }).ok, true);
  const bad = taxDataRule({ ciks: 100, looked: 90, liqMonths: 100, liqMapped: 80, events: 100 });
  assert.equal(bad.ok, false); assert.match(bad.why, /95% needed/); assert.match(bad.why, /85% needed/); assert.match(bad.why, /15,000/);
});
test('pre-registration writes the three entries once, with sources, before any run', () => {
  const LB = { strategies: [] }; preRegister(LB);
  const mine = LB.strategies.filter(x => TAX_IDS.includes(x.id)); assert.equal(mine.length, 3);
  for (const e of mine) { assert.match(e.status, /pre-registered 2026-11-01/); assert.ok(e.sources.length >= 2); assert.ok(!e.result); }
  const n = LB.strategies.length; preRegister(LB); assert.equal(LB.strategies.length, n);
});
