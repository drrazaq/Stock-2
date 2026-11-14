// Seams: research-core.mjs IDEA 17 (daily researcher, 14 Nov 2026): stock-based compensation intensity (Mohanram, White and Zhao 2020).
// Rows from SEC company facts (annual SBC and sales from 10-Ks), tag order, same-period match, event rule, sales floor, data rule and
// pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, SBC_IDS, SBC, sbcRows, sbcPick, sbcEvents, sbcDataRule, preRegister, ONE_OPEN } from '../research-core.mjs';

const f = (start, end, val, filed, form = '10-K') => ({ start, end, val, filed, form, accn: 'x' });
const cf = (tags) => ({ facts: { 'us-gaap': Object.fromEntries(Object.entries(tags).map(([k, v]) => [k, { units: { USD: v } }])) } });

test('one buy (bottom) and one avoid (top); 126 sessions; one open trade per stock', () => {
  assert.deepEqual(SBC_IDS, ['RQ-SBC-LOW126', 'RQ-SBC-HIGH126']);
  assert.equal(RULES['RQ-SBC-LOW126'].kind, 'buy'); assert.equal(RULES['RQ-SBC-LOW126'].side, 'bottom');
  assert.equal(RULES['RQ-SBC-HIGH126'].kind, 'avoid'); assert.equal(RULES['RQ-SBC-HIGH126'].side, 'top');
  for (const id of SBC_IDS) { assert.equal(RULES[id].hold, 126); assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); }
  assert.ok(BUY_IDS.includes('RQ-SBC-LOW126')); assert.ok(!BUY_IDS.includes('RQ-SBC-HIGH126'));
  assert.equal(SBC.minSales, 10e6); assert.equal(SBC.maxLag, 120);
});
test('rows: annual 10-K durations only, deduplicated, negative values dropped, tag rank kept', () => {
  const r = sbcRows(cf({ ShareBasedCompensation: [f('2022-01-01', '2022-12-31', 5e6, '2023-02-20'), f('2022-01-01', '2022-12-31', 5e6, '2023-02-20'),
      f('2022-10-01', '2022-12-31', 1e6, '2023-02-20'), f('2022-01-01', '2022-12-31', 4e6, '2023-03-01', '10-K/A'), f('2022-01-01', '2022-12-31', -1, '2023-02-20')],
    AllocatedShareBasedCompensationExpense: [f('2022-01-01', '2022-12-31', 6e6, '2023-02-20')],
    Revenues: [f('2022-01-01', '2022-12-31', 100e6, '2023-02-20')] }));
  assert.deepEqual(r.s, [['2022-12-31', 5e6, '2023-02-20', 0], ['2022-12-31', 6e6, '2023-02-20', 1]]);
  assert.deepEqual(r.r, [['2022-12-31', 100e6, '2023-02-20', 0]]);
  assert.deepEqual(sbcRows(null), { s: [], r: [] });
});
test('pick: first tag wins, point in time, end tolerance', () => {
  const rows = [['2022-12-31', 6e6, '2023-02-20', 1], ['2022-12-31', 5e6, '2023-02-20', 0], ['2023-12-31', 7e6, '2024-02-20', 0]].sort((p, q) => p[2] < q[2] ? -1 : 1);
  assert.equal(sbcPick(rows, '2022-12-31', '2023-02-20')[1], 5e6);
  assert.equal(sbcPick(rows, '2023-12-31', '2024-02-19'), null);
  assert.equal(sbcPick([['2023-01-02', 9, '2023-02-20', 0]], '2022-12-31', '2023-03-01', 5)[1], 9);
  assert.equal(sbcPick([['2023-01-09', 9, '2023-02-20', 0]], '2022-12-31', '2023-03-01', 5), null);
});
test('events: new timely year end, SBC / same-year sales, sales floor, later revenue tag used when the first is missing', () => {
  const sbc = [f('2020-01-01', '2020-12-31', 2e6, '2021-02-20'), f('2021-01-01', '2021-12-31', 3e6, '2022-02-20'), f('2022-01-01', '2022-12-31', 1e6, '2023-02-20'),
    f('2023-01-01', '2023-12-31', 0, '2024-02-20'), f('2024-01-01', '2024-12-31', 4e6, '2025-07-01')];
  const ev = sbcEvents(sbcRows(cf({ ShareBasedCompensation: sbc,
    Revenues: [f('2020-01-01', '2020-12-31', 100e6, '2021-02-20'), f('2021-01-01', '2021-12-31', 5e6, '2022-02-20'), f('2024-01-01', '2024-12-31', 100e6, '2025-07-01')],
    RevenueFromContractWithCustomerExcludingAssessedTax: [f('2022-01-01', '2022-12-31', 50e6, '2023-02-20'), f('2023-01-01', '2023-12-31', 80e6, '2024-02-20')] })));
  assert.deepEqual(ev.map(e => e.d), ['2021-02-20', '2023-02-20', '2024-02-20']);   // 2021: sales under 10M; 2024: filed over 120 days late
  assert.equal(ev[0].g, 0.02); assert.equal(ev[1].g, 0.02); assert.equal(ev[2].g, 0);
  // a restated older year in a later 10-K is not a new event
  const re = sbcEvents(sbcRows(cf({ ShareBasedCompensation: [f('2022-01-01', '2022-12-31', 1e6, '2023-02-20'), f('2022-01-01', '2022-12-31', 1e6, '2023-06-01')],
    Revenues: [f('2022-01-01', '2022-12-31', 50e6, '2023-02-20')] })));
  assert.equal(re.length, 1);
  // no sales line -> no event
  assert.equal(sbcEvents(sbcRows(cf({ ShareBasedCompensation: sbc }))).length, 0);
});
test('data rule and pre-registration', () => {
  assert.equal(sbcDataRule({ ciks: 100, looked: 96, liqMonths: 100, liqMapped: 90, events: 5000 }).ok, true);
  const bad = sbcDataRule({ ciks: 100, looked: 90, liqMonths: 100, liqMapped: 80, events: 10 });
  assert.equal(bad.ok, false); assert.match(bad.why, /95%/); assert.match(bad.why, /85%/); assert.match(bad.why, /5,000/);
  const LB = { strategies: [] }; preRegister(LB);
  for (const id of SBC_IDS) { const e = LB.strategies.find(x => x.id === id); assert.ok(e); assert.match(e.status, /pre-registered 2026-11-14/); assert.equal(e.hold, 126); assert.match(e.explain, /IDEA 17/); }
});
