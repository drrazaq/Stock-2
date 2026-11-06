// Synthetic source originals through the existing fenced first-capture caller.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {createHash} from 'node:crypto';
import {firstCaptureFixture} from './helper-a-first-capture.mjs';
import {entryPanelsFixture as fixture} from './helper-a-entry-panels.mjs';
import {evidenceHash} from '../reclaim-research-workflow.mjs';
import {deriveNativeAEntryPanels,sourceHash} from '../a-native-source-join.mjs';
async function capture(x){assert.equal((await x.step('prepare')).status,'FIRST_PLAN_DURABLE');for(const item of x.firstPlan.items.filter(i=>i.phase==='ENTRY')){x.at(item.notBefore);assert.equal((await x.step('capture',{itemId:item.id})).status,'FIRST_RESPONSE_DURABLE');}x.at(x.f.input.asOf);}
const derive=x=>x.step('derive-entry-panels',{decisionRef:x.f.raw(x.f.input)});
function modify(x,which,change){const ref=x.f.bundle.nativeBinding.entryPanels[which],item=x.required.items.find(i=>i.original.sha256===ref.sha256),body=JSON.parse(Buffer.from(item.envelope.bodyBase64,'base64'));change(body);for(const role of ['CAPTURE','WITNESS'])x.overrides.set(role+':'+item.id,{bytes:Buffer.from(JSON.stringify(body))});}
const nativeEntries=x=>x.f.bundle.nativeBinding.entryPanels.map((ref,i)=>({itemId:'ENTRY_PANEL_'+i,envelope:JSON.parse(fs.readFileSync(x.f.directory+'/'+ref.file))}));
function rewriteBody(entry,change){const body=JSON.parse(Buffer.from(entry.envelope.bodyBase64,'base64'));change(body);const bytes=Buffer.from(JSON.stringify(body));entry.envelope.bodyBase64=bytes.toString('base64');entry.envelope.bodySha256=sourceHash(bytes);}
function apply(x,r){for(const k of ['bars','prior20DayDollarVolume','liquidityAsOf','liquidityEvidenceId'])x.f.input[k]=r[k];x.f.refreshDecision();x.f.bundle.outcomes=x.f.seal(x.f.makeTape(x.f.records));x.f.syncWitness(x.f.records);}
test('actual host derives exact opening/reclaim fields, twenty comparable sessions, liquidity and per-field origins; restart never refetches',async t=>{
 const x=fixture(t);await capture(x);const before=x.snapshot(x.f.root+'/store'),calls=x.calls.length,r=await derive(x);assert.equal(r.status,'FIRST_ENTRY_PANELS_DERIVED',JSON.stringify(r));assert.equal(r.inputAssembly,'INCOMPLETE_G2');assert.equal(r.bars.length,3);assert.equal(r.bars[0].prior20SessionMedianVolume,1000);assert.equal(r.bars[1].prior20SessionMedianVolume,1100);assert.equal(r.bars[2].prior20SessionMedianVolume,1200);assert.equal(r.bars[0].dollarVolume,20500);assert.equal(r.prior20DayDollarVolume,1000000);assert.equal(r.originTable.length,7);assert.ok(r.originTable.every(v=>v.bodySha256&&v.envelopeHash&&v.receivedAt));assert.equal(r.allowBuy,false);assert.equal(r.prospectiveAdmissions,0);for(const [file,bytes]of Object.entries(before))assert.deepEqual(fs.readFileSync(x.f.root+'/store/'+file),bytes);assert.equal(x.calls.length,calls);
 // Previously trusted fixture numbers/IDs cannot silently survive native evidence.
 assert.equal((await x.step('freeze-decision',{decisionRef:x.f.raw(x.f.input)})).reason,'FIRST_ENTRY_DERIVED_FIELDS_MISMATCH');
 apply(x,r);const frozen=await x.step('freeze-decision',{decisionRef:x.f.raw(x.f.input)});assert.equal(frozen.status,'FIRST_DECISION_DURABLE',JSON.stringify(frozen));
 const saved=x.f.store.lookup(x.f.token,'ORIGINAL','A_FIRST_CAPTURE_ENTRY_FACTS_V1'),raw=x.f.store.exportSnapshot().files.find(v=>v.file===saved.record.original.file),facts=JSON.parse(Buffer.from(raw.base64,'base64'));assert.deepEqual(facts.panels.bars,r.bars);assert.equal(facts.inputAssembly,'INCOMPLETE_G2');assert.equal(facts.inputHash,evidenceHash(x.f.input));assert.ok(facts.unresolved.includes('CALENDAR_AND_OWNER_PROVENANCE'));
 x.reopen();assert.equal((await x.step('freeze-decision',{decisionRef:x.f.raw(x.f.input)})).status,'FIRST_DECISION_ALREADY_DURABLE');assert.equal(x.calls.length,calls);
 await x.followups();const result=await x.step('evaluate',{requestRef:x.f.raw(x.f.request())});assert.equal(result.status,'OFFLINE_RESEARCH_ONLY',JSON.stringify(result));assert.equal(result.allowBuy,false);assert.equal(result.prospectiveAdmissions,0);assert.ok(result.cases[0].paperCard);
});
for(const [name,which,change,reason]of [
 ['wrong-security',0,b=>b.symbol='OTHER','FIRST_ENTRY_BARS_UNKNOWN'],
 ['missing-current',0,b=>b.bars.splice(1,1),'FIRST_ENTRY_BARS_UNKNOWN'],
 ['duplicate-current',0,b=>b.bars.splice(1,0,b.bars[0]),'FIRST_ENTRY_BARS_UNKNOWN'],
 ['out-of-order',0,b=>b.bars.reverse(),'FIRST_ENTRY_BARS_UNKNOWN'],
 ['partial-page',0,b=>b.next_page_token='MORE','FIRST_ENTRY_BARS_UNKNOWN'],
 ['absent-page-status',0,b=>delete b.next_page_token,'FIRST_ENTRY_BARS_UNKNOWN'],
 ['future-current',0,b=>b.bars[2].t='2026-11-04T14:45:00Z','FIRST_ENTRY_BARS_UNKNOWN'],
 ['impossible-ohlc',0,b=>b.bars[0].l=11,'FIRST_ENTRY_BARS_UNKNOWN'],
 ['invalid-volume',0,b=>b.bars[0].v=-1,'FIRST_ENTRY_BARS_UNKNOWN'],
 ['fractional-volume',0,b=>b.bars[0].v=1.5,'FIRST_ENTRY_BARS_UNKNOWN'],
 ['missing-vwap',0,b=>delete b.bars[0].vw,'FIRST_ENTRY_BARS_UNKNOWN'],
 ['missing-prior-session',1,b=>b.bars.splice(0,3),'FIRST_ENTRY_PANEL_UNKNOWN'],
 ['wrong-prior-offset',1,b=>b.bars[0].t=new Date(Date.parse(b.bars[0].t)+60000).toISOString(),'FIRST_ENTRY_PANEL_UNKNOWN'],
 ['empty-prior-volume',1,b=>b.bars.forEach(r=>r.v=0),'FIRST_ENTRY_PANEL_UNKNOWN'],
 ['missing-daily-session',2,b=>b.bars.pop(),'FIRST_ENTRY_LIQUIDITY_UNKNOWN'],
 ['wrong-daily-date',2,b=>b.bars[0].t='2026-10-01T04:00:00Z','FIRST_ENTRY_BARS_UNKNOWN'],
 ['current-day-liquidity',2,b=>b.bars.at(-1).t='2026-11-04T05:00:00Z','FIRST_ENTRY_BARS_UNKNOWN']
])test((['wrong-security','partial-page','missing-prior-session'].includes(name)?'actual caller captured ':'native parser original ')+name+' remains UNKNOWN',async t=>{const x=fixture(t);if(!['wrong-security','partial-page','missing-prior-session'].includes(name)){const entries=nativeEntries(x);rewriteBody(entries[which],change);assert.throws(()=>deriveNativeAEntryPanels(x.f.input,entries),{message:reason});assert.equal(x.calls.length,0);return;}modify(x,which,change);await capture(x);const calls=x.calls.length,r=await derive(x);assert.equal(r.status,'UNKNOWN',JSON.stringify(r));assert.equal(r.reason,reason);assert.equal(x.f.store.lookup(x.f.token,'ORIGINAL','A_FIRST_CAPTURE_DECISION_V1').status,'NOT_COMMITTED');assert.equal((await x.step('freeze-decision',{decisionRef:x.f.raw(x.f.input)})).status,'UNKNOWN');assert.equal(x.calls.length,calls);});
test('missing native panels stay explicitly unresolved, never derived from supplied positive numbers',async t=>{const x=firstCaptureFixture(t);await capture(x);const r=await derive(x);assert.equal(r.status,'UNKNOWN');assert.equal(r.reason,'NATIVE_BARS_AND_PRIOR_PANELS_MISSING');assert.equal(r.bars,undefined);});
test('role disagreement on revised raw bar is refused and retained through restart',async t=>{const x=fixture(t),item=x.required.items.find(i=>i.url.includes('timeframe=5Min')&&i.url.includes('start=2026-11-04')),body=JSON.parse(Buffer.from(item.envelope.bodyBase64,'base64'));body.bars[0].v++;x.overrides.set('WITNESS:'+item.id,{bytes:Buffer.from(JSON.stringify(body))});await x.step('prepare');for(const slot of x.firstPlan.items.filter(i=>i.phase==='ENTRY')){x.at(slot.notBefore);const r=await x.step('capture',{itemId:slot.id});if(slot.url===item.url){assert.equal(r.reason,'INDEPENDENT_RESPONSE_CONFLICT');const calls=x.calls.length;x.reopen();assert.equal((await x.step('capture',{itemId:slot.id})).reason,'INDEPENDENT_RESPONSE_CONFLICT');assert.equal(x.calls.length,calls);return;}assert.equal(r.status,'FIRST_RESPONSE_DURABLE');}assert.fail('conflicting slot not encountered');});

for(const [name,which,change]of [
 ['adjusted-bars',0,e=>e.url=e.url.replace('adjustment=raw','adjustment=split')],
 ['ambiguous-query',0,e=>e.url+='&timeframe=1Min'],
 ['foreign-route',0,e=>e.url=e.url.replace('/TEST/bars','/OTHER/bars')],
 ['uncompleted-current-window',0,e=>{for(const k of ['requestStartedAt','headersReceivedAt','bodyReceivedAt','observedAt'])e[k]='2026-11-04T14:44:59Z';}],
 ['prior-panel-received-after-open',1,e=>{for(const k of ['requestStartedAt','headersReceivedAt','bodyReceivedAt','observedAt'])e[k]='2026-11-04T14:30:00Z';}],
 ['daily-panel-received-before-last-close',2,e=>{for(const k of ['requestStartedAt','headersReceivedAt','bodyReceivedAt','observedAt'])e[k]='2026-11-03T20:59:00Z';}]
])test('native parser refuses '+name+' metadata',t=>{const x=fixture(t),entries=nativeEntries(x);change(entries[which].envelope);entries[which].envelope.responseUrl=entries[which].envelope.url;assert.throws(()=>deriveNativeAEntryPanels(x.f.input,entries));assert.equal(x.calls.length,0);});

test('additional noncomparable historical bars are retained without replacing required offsets',async t=>{const x=fixture(t);modify(x,1,b=>b.bars.push({...b.bars.at(-1),t:'2026-11-03T15:00:00Z',v:999999}));await capture(x);const r=await derive(x);assert.equal(r.status,'FIRST_ENTRY_PANELS_DERIVED');assert.equal(r.bars[0].prior20SessionMedianVolume,1000);});

test('native nanosecond formatting is preserved while exact millisecond interval starts are compared',async t=>{const x=fixture(t);modify(x,0,b=>b.bars.forEach(r=>r.t=r.t.replace('Z','.000000000Z')));await capture(x);const r=await derive(x);assert.equal(r.status,'FIRST_ENTRY_PANELS_DERIVED');assert.equal(r.originTable[0].nativeTimestamp,'2026-11-04T14:30:00.000000000Z');});
