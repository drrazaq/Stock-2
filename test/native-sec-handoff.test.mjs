// SYNTHETIC ONLY. No live binding, provider, authority or prospective admission.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {nativeHandoffPort,validateNativeEvidenceAsset,validateNativeEventAssets} from '../native-sec-handoff.mjs';
import {openNativeRun,appendNativeResponse,readNativeRun,nativeRunDigest} from '../native-sec-events.mjs';
import {producerFixture} from './native-sec-producer-fixture.mjs';
import {wrapperFixture,t,fixtureKey} from './capture-wrapper-fixture.mjs';
import {runGuardedCapture,recoverUploadedCapture} from '../paper-capture-wrapper.mjs';
import {fixtureZip} from '../capture-artifact.mjs';import {sha} from '../prospective-paper-capture.mjs';
const source='a'.repeat(40),identities=[{issuerCik:'0000000001',symbol:'AMD',securityId:'synthetic',asOf:t(-2),identityAudit:'DOCUMENTED_SOURCE_REVIEW'}];
function nativeFixture(){const dir=fs.mkdtempSync('/tmp/native-handoff-'),s=openNativeRun({directory:dir,runId:'SYNTHETIC',sourceSha:source,provenance:'SYNTHETIC_FIXTURE'});const append=()=>appendNativeResponse(s,{body:Buffer.from('<feed><entry><title>8-K - SYNTHETIC (0000000001) (Filer)</title><summary>Item 1.01</summary><updated>'+t(-1)+'</updated><id>urn:tag:sec.gov,2008:accession-number=0000000001-26-000001</id></entry></feed>'),url:'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom',responseUrl:'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&output=atom',redirected:false,httpStatus:200,requestStartedAt:t(0),headersReceivedAt:t(0),bodyReceivedAt:t(0),observedAt:t(0),legacySeen:new Set()});return {dir,s,append,port:nativeHandoffPort({directory:dir,expectedRunId:s.runId,expectedSourceSha:source,wait:async()=>{}})};}
test('committed prefix keeps original bytes and rejects altered event claims and partial/locked archives with bounded attempts',async()=>{
 const f=nativeFixture();try{f.append();const x=await f.port({at:t(1),identities});assert.equal(validateNativeEvidenceAsset(x.evidenceAssets[0]).observations[0].firstIngestedAt,t(0));validateNativeEventAssets(x.raw,x.evidenceAssets);const bad=structuredClone(x.evidenceAssets[0]);bad.files[0].bodyBase64+='eA==';assert.throws(()=>validateNativeEvidenceAsset(bad),/HASH/);await assert.rejects(f.port({at:'not-a-time',identities}),/CLOCK/);const doc=JSON.parse(x.raw);doc.events[0].sourceAt=t(-1);assert.throws(()=>validateNativeEventAssets(JSON.stringify(doc),x.evidenceAssets),/JOIN/);
 const original=fs.readFileSync(path.join(f.dir,'response-000000.json'));fs.writeFileSync(path.join(f.dir,'.pending-crash'),'partial');await assert.rejects(f.port({at:t(1),identities}),/INCOMPLETE/);assert.deepEqual(fs.readFileSync(path.join(f.dir,'response-000000.json')),original);fs.unlinkSync(path.join(f.dir,'.pending-crash'));fs.mkdirSync(path.join(f.dir,'.writer-lock'));let waits=0;const locked=nativeHandoffPort({directory:f.dir,expectedRunId:f.s.runId,expectedSourceSha:source,wait:async()=>{waits++;}});await assert.rejects(locked({at:t(1),identities}),/INCOMPLETE/);assert.equal(waits,2);assert.ok(fs.existsSync(path.join(f.dir,'.writer-lock')));
 }finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('actual running production caller hands off archived Atom bytes before submissions response; guarded encryption/upload/recovery retains original evidence',async()=>{
 const producer=await producerFixture(),f=wrapperFixture();try{
 let handoffSeen=false,captureResult,restored,capturePromise;let firstQuote;const firstQuoteSeen=new Promise(r=>firstQuote=r);const runId='SYNTHETIC-TIMELY',directory=path.join(producer.dir,'runtime/native-sec-events',runId+'-1');
 const port=nativeHandoffPort({directory,expectedRunId:runId+'-1',expectedSourceSha:producer.sourceSha});
 producer.state.beforeSubmissions=async()=>{
  if(handoffSeen)return;handoffSeen=true;
  // The watcher is still awaiting this original HTTP response. No after-run backfill.
  let clock=f.nowMs;const archives=new Map();let uploads=0,quotes=0;
  capturePromise=runGuardedCapture({...f,key:fixtureKey,now:()=>clock,wait:async ms=>{clock+=ms;},ports:{history:async()=>f.history,events:async input=>{const x=await port(input);assert.ok(x.evidenceAssets[0].files.some(r=>r.name==='response-000000.json'));return x;},provider:async()=>{quotes++;firstQuote();return new Response(JSON.stringify(Object.fromEntries(f.universe.map(s=>[s,{latestQuote:{t:new Date(clock).toISOString(),bp:9.99,ap:10.01,bs:1000,as:1000},minuteBar:{t:new Date(clock-60000).toISOString(),l:9,h:11,v:250000}}]))));},upload:async x=>{const zip=fixtureZip(x.name,x.bytes),id=++uploads;archives.set(id,zip);return {success:true,artifactId:id,archiveSha256:sha(zip),archiveBytes:zip.length,fileSha256:x.sha256,fileBytes:x.bytes.length,retentionDays:3};}}}).then(result=>{captureResult=result;return result;});
  await firstQuoteSeen;
  // Release the original HTTP response after the first timely quote, not after 41 frames.
  capturePromise=capturePromise.then(()=>{
  assert.equal(captureResult.status,'COMPLETE');assert.equal(quotes,41);assert.equal(uploads,41);assert.equal(captureResult.genuineAdmissions,0);
  const receiptRaw=JSON.stringify(captureResult.receiptManifest);restored=recoverUploadedCapture({archives,receiptRaw,expectedReceiptSha256:sha(receiptRaw),expectedApprovalHash:sha(fs.readFileSync(f.approvalFile)),expectedSourceSha:f.approval.plan.sourceSha,key:fixtureKey});
  });
 };
 const result=await producer.run({shadow:true,runId,epoch:Date.parse(t(0))-1000});await capturePromise;assert.ok(handoffSeen);assert.equal(result.providerTrace.length,5);assert.equal(result.nativeReport.failures,0);assert.equal(restored.status,'AUTHENTICATED_COMPLETE');assert.equal(restored.genuineAdmissions,0);assert.ok(restored.originalInputs.evidenceAssets.length>=1);const archive=validateNativeEvidenceAsset(restored.originalInputs.evidenceAssets[0]);assert.ok(archive.observations.length>0);assert.equal(archive.acceptanceResponses.length,0);assert.equal(archive.observations[0].nativeEvidenceStatus,'FEED_RESPONSE_ORIGIN_UNVERIFIED');assert.equal(archive.observations[0].globalFirstIngestionEstablished,false);assert.equal(restored.originalInputs.eventBatches.length,41);assert.equal(captureResult.simulationReport.evaluation.counts.resolved,0);
 }finally{producer.close();f.cleanup();}
});

test('actual producer restart with pinned original parent preserves first clocks through repeats/revisions; absent parent is UNKNOWN continuity',async()=>{
 const p=await producerFixture();try{
 const first=await p.run({shadow:true,runId:'SYNTHETIC-FIRST'}),before=nativeRunDigest(first.archiveDirectory),old=readNativeRun({directory:first.archiveDirectory,expectedRunId:first.runId,expectedSourceSha:first.sourceSha});
 const parent=path.join(p.dir,'runtime/native-sec-parents/SYNTHETIC-FIRST');fs.mkdirSync(parent,{recursive:true});for(const f of before.files)fs.writeFileSync(path.join(parent,f.name),Buffer.from(f.bodyBase64,'base64'),{flag:'wx'});
 const manifest=JSON.stringify({directory:parent,runId:first.runId,sourceSha:first.sourceSha,sha256:before.sha256}),file=parent+'.parent.json';fs.writeFileSync(file,manifest,{flag:'wx'});
 p.state.revision='2.02';const next=await p.run({shadow:true,runId:'SYNTHETIC-REVISION',epoch:Date.parse(t(1)),parentManifestFile:file,parentManifestSha256:sha(manifest)});assert.equal(next.nativeReport.failures,0);const a=readNativeRun({directory:next.archiveDirectory,expectedRunId:next.runId,expectedSourceSha:next.sourceSha});assert.deepEqual(a.lineageRunIds,[first.runId,next.runId]);assert.equal(a.observations[0].firstIngestedAt,old.observations[0].firstIngestedAt);assert.equal(a.observations[0].revisionCount,2);assert.equal(a.observations[0].globalFirstIngestionEstablished,false);assert.deepEqual(nativeRunDigest(first.archiveDirectory),before);
 const unlinked=await p.run({shadow:true,runId:'SYNTHETIC-UNLINKED',epoch:Date.parse(t(2))}),u=readNativeRun({directory:unlinked.archiveDirectory,expectedRunId:unlinked.runId,expectedSourceSha:unlinked.sourceSha});assert.equal(u.observations[0].lineageContinuity,'PRIOR_RUN_HISTORY_UNKNOWN');assert.notEqual(u.observations[0].firstIngestedAt,old.observations[0].firstIngestedAt);assert.equal(u.observations[0].firstObservationScope,'AVAILABLE_PRODUCER_RUN_LINEAGE_NOT_GLOBAL_HISTORY');assert.equal(u.observations[0].globalFirstIngestionEstablished,false);assert.equal(u.genuineAdmissions,0);
 }finally{p.close();}
});
test('actual watcher partial-write failure preserves legacy decisions and original prefix; guarded source refuses before a quote',async()=>{
 const off=await producerFixture(),on=await producerFixture(),f=wrapperFixture();try{
 const runId='SYNTHETIC-PARTIAL',directory=path.join(on.dir,'runtime/native-sec-events',runId+'-1');let originals;
 on.state.beforeSubmissions=async()=>{originals=fs.readdirSync(directory).filter(n=>/^response-\d{6}\.json$/.test(n)).map(name=>({name,bytes:fs.readFileSync(path.join(directory,name))}));fs.writeFileSync(path.join(directory,'response-000002.json.pending-SYNTHETIC-CRASH'),'SYNTHETIC interrupted bytes',{flag:'wx'});};
 const a=await off.run({runId}),b=await on.run({shadow:true,runId});assert.deepEqual(b.providerTrace,a.providerTrace);assert.deepEqual(b.snapshot,a.snapshot);assert.deepEqual(b.shadowRows,a.shadowRows);assert.equal(b.paper,a.paper);assert.deepEqual(b.days,a.days);assert.ok(b.nativeReport.failures>0);assert.equal(b.nativeReport.status,'UNKNOWN');
 for(const original of originals)assert.deepEqual(fs.readFileSync(path.join(directory,original.name)),original.bytes);assert.equal(readNativeRun({directory,expectedRunId:b.runId,expectedSourceSha:b.sourceSha}).status,'INCOMPLETE');
 let quotes=0,uploads=0;const result=await runGuardedCapture({...f,key:fixtureKey,now:()=>f.nowMs,wait:async()=>{},ports:{history:async()=>f.history,events:nativeHandoffPort({directory,expectedRunId:b.runId,expectedSourceSha:b.sourceSha,wait:async()=>{}}),provider:async()=>{quotes++;throw Error('MUST_NOT_QUOTE');},upload:async()=>{uploads++;throw Error('MUST_NOT_UPLOAD');}}});assert.equal(result.status,'INCOMPLETE');assert.equal(result.captureStatus,'INPUT_OR_CHECKPOINT_ERROR_STOP');assert.equal(result.providerAttempts,0);assert.equal(quotes,0);assert.equal(uploads,0);assert.equal(result.genuineAdmissions,0);assert.equal(fs.readFileSync(path.join(directory,'response-000002.json.pending-SYNTHETIC-CRASH'),'utf8'),'SYNTHETIC interrupted bytes');
 }finally{off.close();on.close();f.cleanup();}
});
