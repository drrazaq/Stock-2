// Seams: research-core.mjs IDEA 17 paper lane (daily researcher, 15 Nov 2026): RQ-SBC-LOW126 met the TRY SMALL bar (NOT PROVEN), so the
// pre-registered paper lane is built: each day's 10-K filers, SBC and sales tags read from data.sec.gov companyconcept, merged into a
// company-facts shape and run through the SAME frozen sbcRows / sbcEvents. Build only, no re-test. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SBC, SBC_CONCEPTS, SBC_PAPER_FROM, sbcFromConcepts, sbcRows, sbcEvents } from '../research-core.mjs';

const f = (start, end, val, filed, form = '10-K') => ({ start, end, val, filed, form, accn: 'x' });
const cf = (tags) => ({ facts: { 'us-gaap': Object.fromEntries(Object.entries(tags).map(([k, v]) => [k, { units: { USD: v } }])) } });
const concept = (tag, v) => ({ cik: 1, taxonomy: 'us-gaap', tag, label: tag, units: { USD: v } });

test('paper lane starts forward (Monday 16 Nov 2026) and reads every SBC and sales tag in the frozen order', () => {
  assert.equal(SBC_PAPER_FROM, '2026-11-16');
  assert.deepEqual(SBC_CONCEPTS, [...SBC.tags, ...SBC.sales]);
});
test('companyconcept reads merged = the same events as the bulk company facts file', () => {
  const sbc = [f('2025-10-01', '2026-09-30', 2e6, '2026-11-18')], alt = [f('2025-10-01', '2026-09-30', 9e6, '2026-11-18')],
    rev = [f('2025-10-01', '2026-09-30', 400e6, '2026-11-18')], rev2 = [f('2025-10-01', '2026-09-30', 1e9, '2026-11-18')];
  const bulk = sbcEvents(sbcRows(cf({ ShareBasedCompensation: sbc, AllocatedShareBasedCompensationExpense: alt, RevenueFromContractWithCustomerExcludingAssessedTax: rev, SalesRevenueNet: rev2 })));
  const paper = sbcEvents(sbcRows(sbcFromConcepts({ ShareBasedCompensation: concept('ShareBasedCompensation', sbc), AllocatedShareBasedCompensationExpense: concept('x', alt),
    Revenues: null, RevenueFromContractWithCustomerExcludingAssessedTax: concept('y', rev), SalesRevenueNet: concept('z', rev2) })));
  assert.deepEqual(paper, bulk);
  assert.equal(paper.length, 1); assert.equal(paper[0].g, 0.005); assert.equal(paper[0].d, '2026-11-18');
});
test('missing or broken concepts are ignored; unknown tags are not read', () => {
  assert.deepEqual(sbcFromConcepts(null), { facts: { 'us-gaap': {} } });
  const m = sbcFromConcepts({ ShareBasedCompensation: { units: null }, Revenues: undefined, NetIncomeLoss: concept('NetIncomeLoss', [f('2025-01-01', '2025-12-31', 1, '2026-02-01')]) });
  assert.deepEqual(Object.keys(m.facts['us-gaap']), []);
  assert.deepEqual(sbcEvents(sbcRows(m)), []);
});
