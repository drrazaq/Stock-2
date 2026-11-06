import fs from 'node:fs';import {spawn} from 'node:child_process';
const W='<WORKTREE_E8AC76D7>';const {firstCaptureFixture}=await import(W+'/test/helper-a-first-capture.mjs');const {appendNativeResponse,openNativeRun}=await import(W+'/native-sec-events.mjs');
const out={};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fx(){const cleanups=[];const t={after:f=>cleanups.push(f)};const x=firstCaptureFixture(t,{local:true});await x.ready();return {x,done:async()=>{for(const f of cleanups.reverse())try{await f();}catch{}}};}
const S=(r)=>r.status+(r.reason?'/'+r.reason:'');
// A) followup before decision: refused before transport
{const {x,done}=await fx();try{x.at(x.firstPlan.createdAt);const p=await x.step('prepare');const fu=x.firstPlan.items.find(i=>i.phase==='FOLLOWUP');x.at(fu.notBefore);const g=x.calls.length;const r=await x.step('capture',{itemId:fu.id});out.followupBeforeDecision={prepare:S(p),result:S(r),gets:x.calls.length-g};}finally{await done();}}
// B) evaluation store busy at the decision freeze, longer than the decision window
{const {x,done}=await fx();try{x.at(x.firstPlan.createdAt);await x.step('prepare');for(const i of x.firstPlan.items.filter(i=>i.phase==='ENTRY')){x.at(i.notBefore);await x.step('capture',{itemId:i.id});}
 x.at(x.f.input.asOf);const h=spawn('flock',['-x',x.f.root+'/store/.a-writer.lock','sleep','3'],{stdio:'ignore'});await sleep(200);const r1=await x.step('freeze-decision',{decisionRef:x.f.raw(x.f.input)});await new Promise(z=>h.on('exit',z));
 const r2=await x.step('freeze-decision',{decisionRef:x.f.raw(x.f.input)});x.at(Date.parse(x.firstPlan.decisionDeadline)+1000);const r3=await x.step('freeze-decision',{decisionRef:x.f.raw(x.f.input)});out.busyAtFreeze={duringBusy:S(r1),retrySameClockAfterRelease:S(r2),retryAfterDeadline:S(r3)};}finally{await done();}}
// C) producer appends a later revision after the freeze; evaluation still uses the frozen prefix; changed input refused
{const {x,done}=await fx();try{x.at(x.firstPlan.createdAt);await x.step('prepare');const fr=await x.entry();await x.followups();
 let appended='no';try{const run=openNativeRun({directory:x.f.native.directory,runId:x.f.native.runId,sourceSha:x.f.native.sourceSha,provenance:'SYNTHETIC_FIXTURE'});appendNativeResponse(run,{body:Buffer.from('<feed><entry><title>8-K/A - SYNTHETIC ISSUER (0000000001) (Filer)</title><updated>2026-11-05T12:00:00Z</updated><id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000099</id></entry></feed>'),url:'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom',responseUrl:'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom',redirected:false,httpStatus:200,legacySeen:new Set(),requestStartedAt:'2026-11-05T12:00:01Z',headersReceivedAt:'2026-11-05T12:00:01Z',bodyReceivedAt:'2026-11-05T12:00:01Z',observedAt:'2026-11-05T12:00:01Z'});appended='yes';}catch(e){appended='append failed: '+e.message;}
 const ev=await x.step('evaluate',{requestRef:x.requestRef()});out.producerAppendAfterFreeze={freeze:S(fr),appended,evaluate:S(ev),card:/RESEARCH \/ PAPER ONLY/.test(ev.cases?.[0]?.paperCard||'')?'PAPER':'?' };
 const changed=structuredClone(x.f.input);changed.quote.ask=changed.quote.ask+0.01;out.changedDecisionAfterFreeze=S(await x.step('freeze-decision',{decisionRef:x.f.raw(changed)}));}finally{await done();}}
console.log(JSON.stringify(out,null,1));
