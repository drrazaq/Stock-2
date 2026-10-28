// Seams: research-core.mjs IDEA 4 (daily researcher, 28 Oct 2026): order backlog (RPO) growth. Rows from SEC company facts, the
// event rule (new latest period end, timely), the prior-year match, the 5M floor, the data rule and the pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, RPO_IDS, RPO, rpoRows, rpoEvents, rpoDataRule, preRegister, ONE_OPEN, makeRanker, sideOf } from '../research-core.mjs';

const f = (end, val, filed, form = '10-Q', extra = {}) => ({ end, val, filed, form, accn: 'x', ...extra });
test('three RPO rules: two buys, one avoid; holds fixed; one open trade per stock', () => {
  assert.deepEqual(RPO_IDS, ['RQ-RPO-63', 'RQ-RPO-126', 'RQ-RPO-LOW63']);
  assert.deepEqual(RPO_IDS.map(id => RULES[id].hold), [63, 126, 63]);
  assert.deepEqual(RPO_IDS.map(id => RULES[id].kind), ['buy', 'buy', 'avoid']);
  for (const id of RPO_IDS) { assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); }
  assert.ok(BUY_IDS.includes('RQ-RPO-63') && !BUY_IDS.includes('RQ-RPO-LOW63'));
  assert.equal(RPO.minPrior, 5e6); assert.equal(RPO.maxLag, 120);
});
test('rows: instant USD values from original 10-Q/10-K only, deduplicated, sorted by filed', () => {
  const j = { facts: { 'us-gaap': { RevenueRemainingPerformanceObligation: { units: { USD: [
    f('2023-03-31', 100e6, '2023-05-01'), f('2023-03-31', 100e6, '2023-05-01'), f('2023-03-31', 1e6, '2023-05-01', '10-Q/A'), f('2023-03-31', 5e6, '2023-05-01', '8-K'),
    f('2022-12-31', 90e6, '2023-02-20', '10-K'), f('2023-03-31', 7e6, '2023-05-01', '10-Q', { start: '2023-01-01' }), f('2019-03-31', 1e6, '2019-05-01') ] } } } } };
  assert.deepEqual(rpoRows(j), [['2022-12-31', 90e6, '2023-02-20', '10-K'], ['2023-03-31', 100e6, '2023-05-01', '10-Q']]);
  assert.deepEqual(rpoRows({ units: { USD: [f('2023-03-31', 1e7, '2023-05-01')] } }), [['2023-03-31', 1e7, '2023-05-01', '10-Q']]);   // companyconcept shape
  assert.deepEqual(rpoRows(null), []); assert.deepEqual(rpoRows({ facts: {} }), []);
});
test('events: a new latest end, filed within 120 days, growth vs the end about a year before (5M floor)', () => {
  const rows = rpoRows({ units: { USD: [
    f('2022-03-31', 50e6, '2022-05-05'), f('2022-06-30', 55e6, '2022-08-05'),
    f('2023-03-31', 80e6, '2023-05-04'), f('2022-03-31', 50e6, '2023-05-04'),   // the 2023 Q1 10-Q, with a comparative
    f('2023-06-30', 60e6, '2023-12-20'),                                          // late (173 days): no event
    f('2022-12-31', 70e6, '2023-06-01'),                                          // an older end filed later: no event
    f('2024-03-31', 40e6, '2024-05-02') ] } });
  const ev = rpoEvents(rows);
  assert.deepEqual(ev.map(e => [e.d, e.end, e.g]), [['2023-05-04', '2023-03-31', 0.6], ['2024-05-02', '2024-03-31', -0.5]]);
  assert.equal(ev[0].prior, 50e6); assert.equal(ev[1].prior, 80e6);
  assert.deepEqual(rpoEvents(rpoRows({ units: { USD: [f('2022-03-31', 4e6, '2022-05-05'), f('2023-03-31', 9e6, '2023-05-05')] } })), []);   // prior under 5M
  assert.deepEqual(rpoEvents([]), []);
});
test('ranking reuses the point-in-time ranker: 300 refs in the prior 365 days', () => {
  const refs = Array.from({ length: 400 }, (_, k) => ({ d: '2023-0' + (1 + (k % 9)) + '-15', s: k / 400 }));
  const rank = makeRanker(refs); assert.equal(rank('2023-01-15', 0.5), null);   // too few refs before
  const p = rank('2024-01-01', 0.9); assert.ok(p >= 0.8); assert.equal(sideOf(p), 'top'); assert.equal(sideOf(rank('2024-01-01', 0.05)), 'bottom');
});
test('data rule: 95% looked up, 85% mapped, 2,000 events', () => {
  assert.equal(rpoDataRule({ ciks: 100, looked: 96, liqMonths: 100, liqMapped: 90, events: 2500 }).ok, true);
  const r = rpoDataRule({ ciks: 100, looked: 90, liqMonths: 100, liqMapped: 80, events: 10 });
  assert.equal(r.ok, false); assert.match(r.why, /looked up/); assert.match(r.why, /85%/); assert.match(r.why, /2,000/);
});
test('pre-registration writes the three RPO entries once, before any result', () => {
  const LB = { strategies: [] }; preRegister(LB); const e = LB.strategies.filter(x => RPO_IDS.includes(x.id));
  assert.equal(e.length, 3); for (const x of e) { assert.match(x.status, /pre-registered 2026-10-28/); assert.equal(x.result, undefined); assert.ok(x.sources.length >= 2); }
  const n = LB.strategies.length; assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, n);
});
