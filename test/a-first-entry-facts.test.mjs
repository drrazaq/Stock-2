// Actual first-capture host, synthetic source originals only. Never prospective evidence.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {firstCaptureFixture} from './helper-a-first-capture.mjs';
import {createAFencedStore} from '../a-fenced-store.mjs';
import {evidenceHash} from '../reclaim-research-workflow.mjs';
const facts='A_FIRST_CAPTURE_ENTRY_FACTS_V1',decision='A_FIRST_CAPTURE_DECISION_V1';
async function entrySources(x){assert.equal((await x.step('prepare')).status,'FIRST_PLAN_DURABLE');for(const i of x.firstPlan.items.filter(v=>v.phase==='ENTRY')){x.at(i.notBefore);const r=await x.step('capture',{itemId:i.id});assert.equal(r.status,'FIRST_RESPONSE_DURABLE',JSON.stringify(r));}x.at(x.f.input.asOf);}
const originals=x=>x.f.store.exportSnapshot().files;
test('source facts through actual host refuse unbound price, acceptance and primary receipts before decision/followups',async t=>{
 const x=firstCaptureFixture(t);await entrySources(x);const count=x.calls.length;
 for(const [change,reason]of [
  [d=>d.quote.ask=9,'FIRST_ENTRY_QUOTE_UNKNOWN'],
  [d=>d.quote.nativeTimestampNs='0','FIRST_ENTRY_QUOTE_UNKNOWN'],
  [d=>d.quote.observedAt='2026-11-04T14:45:04Z','FIRST_ENTRY_QUOTE_UNKNOWN'],
  [d=>d.quote.sourceDelayMs=-1,'FIRST_ENTRY_QUOTE_UNKNOWN'],
  [d=>d.catalyst.publishedAt='2026-11-04T12:59:59Z','FIRST_ENTRY_PRIMARY_UNKNOWN'],
  [d=>d.catalyst.documentHash='b'.repeat(64),'FIRST_ENTRY_PRIMARY_UNKNOWN'],
  [d=>d.catalyst.observedAt='2026-11-04T13:00:00Z','FIRST_ENTRY_PRIMARY_UNKNOWN'],
  [d=>d.issuerId='CIK0000000002','FIRST_ENTRY_IDENTITY_UNKNOWN'],
  [d=>d.instrument='WARRANT','FIRST_ENTRY_IDENTITY_UNKNOWN']
 ]){const d=structuredClone(x.f.input);change(d);const r=await x.step('freeze-decision',{decisionRef:x.f.raw(d)});assert.equal(r.status,'UNKNOWN');assert.equal(r.reason,reason);assert.equal(x.f.store.lookup(x.f.token,'ORIGINAL',decision).status,'NOT_COMMITTED');assert.equal(x.f.store.lookup(x.f.token,'ORIGINAL',facts).status,'NOT_COMMITTED');}
 const next=x.firstPlan.items.find(i=>i.phase==='FOLLOWUP');x.at(next.notBefore);assert.equal((await x.step('capture',{itemId:next.id})).reason,'FIRST_FOLLOWUP_BEFORE_DECISION');assert.equal(x.calls.length,count);x.at(x.f.input.asOf);
 assert.equal((await x.step('freeze-decision',{decisionRef:x.f.raw(x.f.input)})).status,'FIRST_DECISION_DURABLE');const saved=x.f.store.lookup(x.f.token,'ORIGINAL',facts),file=originals(x).find(v=>v.file===saved.record.original.file),value=JSON.parse(Buffer.from(file.base64,'base64'));assert.equal(value.inputHash,evidenceHash(x.f.input));assert.equal(value.sourceFields.acceptanceAt,x.f.input.catalyst.publishedAt);assert.equal(value.sourceFields.responseFeedAuthentication,'NOT_ESTABLISHED_BY_REQUEST_PARAMETER');assert.ok(value.unresolved.includes('NATIVE_BARS_AND_PRIOR_PANELS'));assert.equal(value.prospectiveAdmissions,0);assert.equal(x.f.store.lookup(x.f.token,'ORIGINAL',decision).record.payload.entryFactsHash,evidenceHash(value));
 x.reopen();assert.equal((await x.step('freeze-decision',{decisionRef:x.f.raw(x.f.input)})).status,'FIRST_DECISION_ALREADY_DURABLE');assert.equal(x.calls.length,count);
});
test('actual captured wrong identity is not repaired by a matching ticker or a supplied decision',async t=>{
 const x=firstCaptureFixture(t),item=x.required.items.find(i=>i.url.startsWith('https://api.massive.com/'));
 const body=JSON.parse(Buffer.from(item.envelope.bodyBase64,'base64'));body.results.share_class_figi='BBG000000002';for(const role of ['CAPTURE','WITNESS'])x.overrides.set(role+':'+item.id,{bytes:Buffer.from(JSON.stringify(body))});await entrySources(x);
 assert.equal((await x.step('freeze-decision',{decisionRef:x.f.raw(x.f.input)})).reason,'FIRST_ENTRY_IDENTITY_UNKNOWN');assert.equal(x.f.store.lookup(x.f.token,'ORIGINAL',decision).status,'NOT_COMMITTED');
});
for(const point of ['AFTER_INTENT','AFTER_ORIGINAL','AFTER_RECORD','AFTER_COMMIT'])test('entry-facts durable interruption '+point+' resumes through actual host without source refetch',async t=>{
 const x=firstCaptureFixture(t);await entrySources(x);const count=x.calls.length,before=x.snapshot(x.f.root+'/store'),append=x.f.store.appendImport;let hit=false;
 x.f.store.appendImport=(scope,token,kind,id,payload,bytes)=>{if(!hit&&id===facts){hit=true;return append(scope,token,kind,id,payload,bytes,point);}return append(scope,token,kind,id,payload,bytes);};
 assert.equal((await x.step('freeze-decision',{decisionRef:x.f.raw(x.f.input)})).status,'UNKNOWN');assert.equal(hit,true);const partial=x.snapshot(x.f.root+'/store');x.f.store=createAFencedStore(x.f.root+'/store');assert.equal((await x.step('freeze-decision',{decisionRef:x.f.raw(x.f.input)})).status,'FIRST_DECISION_DURABLE');for(const [file,bytes]of Object.entries({...before,...partial}))assert.deepEqual(fs.readFileSync(x.f.root+'/store/'+file),bytes,file);assert.equal(x.calls.length,count);assert.equal(x.f.store.head().pending,0);
});
