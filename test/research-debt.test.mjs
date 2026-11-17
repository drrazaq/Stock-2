// Seams: research-core.mjs IDEA 19 (daily researcher, 17 Nov 2026): 8-K item 2.04 debt triggering events. Event filter, rules, data rule,
// pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, ONE_OPEN, DEBT, DEBT_IDS, debtEvent, isDebt204, debtDataRule, reactionDate, preRegister } from '../research-core.mjs';

test('three debt rules: two avoid checks (21 / 63), one buy (126); one open trade per stock', () => {
  assert.deepEqual(DEBT_IDS, ['RQ-DEBT-AV21', 'RQ-DEBT-AV63', 'RQ-DEBT-B126']);
  assert.deepEqual(DEBT_IDS.map(id => RULES[id].hold), [21, 63, 126]);
  assert.deepEqual(DEBT_IDS.map(id => RULES[id].kind), ['avoid', 'avoid', 'buy']);
  for (const id of DEBT_IDS) { assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); }
  assert.ok(BUY_IDS.includes('RQ-DEBT-B126')); assert.ok(!BUY_IDS.includes('RQ-DEBT-AV21'));
  assert.equal(DEBT.item, '2.04'); assert.deepEqual(DEBT.skip, ['2.01', '5.01']); assert.equal(DEBT.minFilings, 100);
});
test('event: item 2.04 counts; merger closings (2.01 / 5.01) skipped; no partial-number matches', () => {
  assert.equal(debtEvent('2.04,9.01'), true);
  assert.equal(debtEvent('1.01,1.03,2.04,9.01'), true);
  assert.equal(debtEvent('2.04'), true);
  assert.equal(debtEvent('2.01,2.04,9.01'), false);
  assert.equal(debtEvent('2.04,5.01'), false);
  assert.equal(debtEvent('2.03,9.01'), false);
  assert.equal(debtEvent('12.04'), false); assert.equal(debtEvent('2.040'), false);
  assert.equal(debtEvent(''), false); assert.equal(debtEvent(null), false);
  assert.equal(isDebt204('2.01,2.04'), true);
});
test('timing: acceptance before 16:00 New York reacts the same day, later the next day', () => {
  const ny = (a) => ({ d: a.slice(0, 10), hm: a.slice(11, 16) });
  assert.equal(reactionDate('2024-03-05T15:59', ny), '2024-03-05');
  assert.equal(reactionDate('2024-03-05T16:01', ny), '2024-03-06');
});
test('data rule: needs the 8-K lists and 100+ item-2.04 filings', () => {
  assert.equal(debtDataRule({ iscOk: true, filings: 100 }).ok, true);
  assert.equal(debtDataRule({ iscOk: true, filings: 99 }).ok, false);
  const r = debtDataRule({ iscOk: false, iscWhy: '8-K lists read 90%', filings: 500 }); assert.equal(r.ok, false); assert.match(r.why, /90%/);
});
test('pre-registration: three entries, idempotent, never overwrites', () => {
  const LB = { strategies: [] }; preRegister(LB);
  const got = LB.strategies.filter(x => DEBT_IDS.includes(x.id)); assert.equal(got.length, 3);
  for (const x of got) { assert.match(x.status, /pre-registered 2026-11-17/); assert.equal(x.hold, RULES[x.id].hold); assert.ok(x.sources.length >= 3); }
  const n = LB.strategies.length; assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, n);
});
