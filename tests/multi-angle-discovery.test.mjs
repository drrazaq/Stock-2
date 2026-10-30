import test from 'node:test';
import assert from 'node:assert/strict';
import {LANES,assembleMultiAngle} from '../multi-angle-discovery.mjs';
const cutoff='2026-10-28T14:00:00Z';
const ev=(symbol,lane,observedAt='2026-10-28T13:50:00Z',asOf='2026-10-28T13:40:00Z')=>({symbol,lane,observedAt,asOf,sourceId:'fixture-123',description:'Verified research observation'});
test('nine distinct lanes cover unrelated discovery routes',()=>{assert.equal(LANES.length,9);assert.equal(new Set(LANES.map(x=>x.id)).size,9)});
test('two independent observations rank above one and never become BUY',()=>{
 const x=assembleMultiAngle([ev('AAA','NEWS_CATALYST'),ev('AAA','INSIDER_CLUSTER'),ev('BBB','PRE_IGNITION')],{cutoff});
 assert.equal(x.candidates[0].symbol,'AAA');assert.equal(x.candidates[0].independentLanes,2);
 assert.equal(x.candidates[0].status,'NOT AN APPROVED BUY');
});
test('same-lane duplicates do not inflate evidence',()=>{
 const x=assembleMultiAngle([ev('AAA','SEC_EVENT'),ev('AAA','SEC_EVENT','2026-10-28T13:55:00Z')],{cutoff});
 assert.equal(x.candidates[0].independentLanes,1);
 assert.equal(x.candidates[0].evidence[0].observedAt,'2026-10-28T13:55:00Z');
});
test('no lookahead or observation before public disclosure',()=>{
 const x=assembleMultiAngle([ev('AAA','SEC_EVENT','2026-10-28T14:10:00Z'),
 ev('BBB','NEWS_CATALYST','2026-10-28T13:50:00Z','2026-10-28T14:10:00Z'),
 ev('CCC','INSIDER_CLUSTER','2026-10-28T13:30:00Z','2026-10-28T13:40:00Z')],{cutoff});
 assert.equal(x.count,0);assert.equal(x.ignored.future,3);
});
test('missing evidence is not inferred and scores are not forecasts',()=>{
 const x=assembleMultiAngle([{...ev('AAA','INDUSTRY_RIPPLE'),score:Infinity},ev('BBB','MADE_UP_LANE'),{...ev('CCC','SEC_EVENT'),sourceId:''}],{cutoff});
 assert.equal(x.count,1);assert.equal(x.ignored.unknownLane,1);assert.equal(x.ignored.invalid,1);
 assert.equal(x.candidates[0].evidence[0].score,null);
});
test('invalid cutoff rejected',()=>assert.throws(()=>assembleMultiAngle([],{cutoff:'not a date'}),TypeError));
