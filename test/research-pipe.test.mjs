// Seams: research-core.mjs IDEA 20 (daily researcher, 21 Nov 2026): 8-K item 3.02 unregistered sales of equity (PIPEs) as an AVOID check.
// Event filter, rules, data rule, pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, ONE_OPEN, PIPE, PIPE_IDS, pipeEvent, isPipe302, pipeWithAgreement, pipeDataRule, preRegister } from '../research-core.mjs';

test('three pipe rules, all avoid checks (21 / 63 / 126); never a buy; one open trade per stock', () => {
  assert.deepEqual(PIPE_IDS, ['RQ-PIPE-AV21', 'RQ-PIPE-AV63', 'RQ-PIPE-AV126']);
  assert.deepEqual(PIPE_IDS.map(id => RULES[id].hold), [21, 63, 126]);
  for (const id of PIPE_IDS) { assert.equal(RULES[id].kind, 'avoid'); assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); assert.ok(!BUY_IDS.includes(id)); }
  assert.equal(PIPE.item, '3.02'); assert.deepEqual(PIPE.skip, ['2.01', '5.01']); assert.equal(PIPE.minFilings, 300);
});
test('event: item 3.02 counts; merger closings (2.01 / 5.01) skipped; no partial-number matches', () => {
  assert.equal(pipeEvent('1.01,3.02,9.01'), true);
  assert.equal(pipeEvent('3.02'), true);
  assert.equal(pipeEvent('3.02,8.01'), true);
  assert.equal(pipeEvent('2.01,3.02,9.01'), false);
  assert.equal(pipeEvent('3.02,5.01'), false);
  assert.equal(pipeEvent('3.03,9.01'), false);
  assert.equal(pipeEvent('13.02'), false); assert.equal(pipeEvent('3.020'), false);
  assert.equal(pipeEvent(''), false); assert.equal(pipeEvent(null), false);
  assert.equal(isPipe302('2.01,3.02'), true);
  assert.equal(pipeWithAgreement('1.01,3.02'), true); assert.equal(pipeWithAgreement('3.02,8.01'), false); assert.equal(pipeWithAgreement('11.01,3.02'), false);
});
test('data rule: needs the 8-K lists and 300+ item-3.02 filings', () => {
  assert.equal(pipeDataRule({ iscOk: true, filings: 300 }).ok, true);
  assert.equal(pipeDataRule({ iscOk: true, filings: 299 }).ok, false);
  const r = pipeDataRule({ iscOk: false, iscWhy: '8-K lists read 90%', filings: 5000 }); assert.equal(r.ok, false); assert.match(r.why, /90%/);
});
test('pre-registration: three entries, idempotent, never overwrites', () => {
  const LB = { strategies: [] }; preRegister(LB);
  const got = LB.strategies.filter(x => PIPE_IDS.includes(x.id)); assert.equal(got.length, 3);
  for (const x of got) { assert.match(x.status, /pre-registered 2026-11-21/); assert.equal(x.hold, RULES[x.id].hold); assert.ok(x.sources.length >= 3); assert.equal(x.kind, 'avoid'); }
  const n = LB.strategies.length; assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, n);
});
