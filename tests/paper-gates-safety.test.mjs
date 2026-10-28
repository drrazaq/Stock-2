import test from 'node:test';
import assert from 'node:assert/strict';
import { paperRecordApproved, earlyPaperEligible } from '../paper-gates.mjs';
const good = { n: 60, avg: .02, stress: .01, noTop2: .005, days: 35, stocks: 24, pf: 1.3 };
test('fully measured positive record passes', () => {assert.equal(paperRecordApproved(good,true),true); assert.equal(earlyPaperEligible(good),true);});
test('missing or invalid stress and top-two evidence fail closed', () => {
 for(const key of ['stress','noTop2']) for(const val of [null,undefined,NaN,0,-.01]) {
  const r={...good,[key]:val}; assert.equal(paperRecordApproved(r,true),false);assert.equal(earlyPaperEligible(r),false);
 }
});
test('insufficient sample and live-only breadth fail', () => {
 assert.equal(paperRecordApproved({...good,n:29}),false);
 assert.equal(paperRecordApproved({...good,days:29},true),false);
 assert.equal(paperRecordApproved({...good,stocks:19},true),false);
 assert.equal(paperRecordApproved({...good,pf:1.19},true),false);
});
