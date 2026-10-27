// Seams: research-core.mjs IDEA 3 (daily researcher, 27 Oct 2026): information-shock continuation (C-ISC1, Jiang and Zhu 2017).
// Sigma, the shock test, the 8-K list from SEC submissions columns, the New York reaction date, earnings vs non-earnings, the data rule
// and the library pre-registration. No network. Run: node --test test/research-isc.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, ISC_IDS, ISC, sdOf, isShock, eightKs, reactionDate, isEarnings, newsOk, iscDataRule, preRegister, ONE_OPEN } from '../research-core.mjs';
import { secNY } from '../sec-time.mjs';

test('four ISC rules, all buys, one open trade per stock, holds fixed', () => {
  assert.deepEqual(ISC_IDS, ['RQ-ISC-21', 'RQ-ISC-63', 'RQ-ISC-E-21', 'RQ-ISC-NE-21']);
  for (const id of ISC_IDS) { assert.ok(IDS.includes(id)); assert.equal(RULES[id].kind, 'buy'); assert.ok(ONE_OPEN.has(id)); }
  assert.deepEqual(ISC_IDS.map(id => RULES[id].hold), [21, 63, 21, 21]);
  assert.equal(ISC.k, 4); assert.equal(ISC.minAR, 0.04); assert.equal(ISC.win, 60);
});
test('sigma needs 50 values; shock = AR >= max(4 sigma, 4%)', () => {
  assert.equal(sdOf(Array(49).fill(0.01)), null);
  const a = Array.from({ length: 60 }, (_, j) => (j % 2 ? 0.01 : -0.01)); const s = sdOf(a); assert.ok(Math.abs(s - 0.01008) < 1e-4);
  assert.equal(isShock(0.039, 0.001), false);   // under the 4% floor
  assert.equal(isShock(0.041, 0.01), true);     // 4.1% >= max(4%, 4%)
  assert.equal(isShock(0.07, 0.02), false);     // under 4 sigma (8%)
  assert.equal(isShock(0.08, 0.02), true);
  assert.equal(isShock(-0.2, 0.01), false);     // negative shocks never (long only)
  assert.equal(isShock(0.1, null), false);
});
test('8-K list: original 8-K only, from 2021-09-01, acceptance and items kept', () => {
  const cols = { form: ['8-K', '8-K/A', '10-Q', '8-K', '8-K'], filingDate: ['2024-02-01', '2024-02-02', '2024-02-03', '2021-08-31', '2023-05-04'],
    acceptanceDateTime: ['2024-02-01T21:05:00.000Z', 'x', 'y', 'z', '2023-05-04T12:00:00.000Z'], items: ['2.02,9.01', '', '', '', '1.01,7.01'] };
  assert.deepEqual(eightKs(cols), [['2024-02-01T21:05:00.000Z', '2.02,9.01'], ['2023-05-04T12:00:00.000Z', '1.01,7.01']]);
  assert.deepEqual(eightKs(null), []);
});
test('reaction date on the New York clock: 16:00 or later -> next day', () => {
  assert.equal(reactionDate('2024-02-01T21:05:00.000Z', secNY), '2024-02-02');   // 16:05 New York (EST) -> next day
  assert.equal(reactionDate('2024-02-01T20:59:00.000Z', secNY), '2024-02-01');   // 15:59 -> same day
  assert.equal(reactionDate('2024-07-01T12:00:00.000Z', secNY), '2024-07-01');   // 08:00 EDT pre-market -> same day
  assert.equal(reactionDate('2024-07-01T20:00:00.000Z', secNY), '2024-07-02');   // 16:00 EDT -> next day
  assert.equal(reactionDate('2024-07-01', secNY), '2024-07-01');
  assert.equal(reactionDate('', secNY), null);
});
test('earnings = item 2.02; news filters', () => {
  assert.equal(isEarnings('2.02,9.01'), true); assert.equal(isEarnings('9.01,2.02'), true); assert.equal(isEarnings('1.01,7.01'), false);
  assert.equal(isEarnings('12.02'), false); assert.equal(isEarnings('2.021'), false); assert.equal(isEarnings(''), false);
  assert.equal(newsOk('RQ-ISC-21', [false]), true); assert.equal(newsOk('RQ-ISC-21', []), false);
  assert.equal(newsOk('RQ-ISC-E-21', [false, true]), true); assert.equal(newsOk('RQ-ISC-E-21', [false]), false);
  assert.equal(newsOk('RQ-ISC-NE-21', [false, false]), true); assert.equal(newsOk('RQ-ISC-NE-21', [true]), false);
});
test('data rule: 95% of 8-K lists and 85% mapping', () => {
  assert.equal(iscDataRule({ ciks: 100, subsOk: 95, liqMonths: 100, liqMapped: 85 }).ok, true);
  const r = iscDataRule({ ciks: 100, subsOk: 94, liqMonths: 100, liqMapped: 84 }); assert.equal(r.ok, false); assert.match(r.why, /94\.0%.*84\.0%/);
});
test('pre-registration writes the ISC entries once, with their own text, never over a result', () => {
  const LB = { strategies: [{ id: 'RQ-LAZY-63', result: { verdict: 'REJECTED' } }] };
  const n = preRegister(LB); assert.ok(n >= 4);
  for (const id of ISC_IDS) { const e = LB.strategies.filter(x => x.id === id); assert.equal(e.length, 1); assert.match(e[0].status, /pre-registered 2026-10-27/); assert.match(e[0].explain, /IDEA 3/); assert.doesNotMatch(e[0].explain, /cosine/); }
  assert.equal(preRegister(LB), 0); assert.deepEqual(LB.strategies[0].result, { verdict: 'REJECTED' });
});
