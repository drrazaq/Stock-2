import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {producerFixture} from './native-sec-producer-fixture.mjs';import {frameFromSnapshots} from '../prospective-paper-capture.mjs';
import {PROOF_READY_PROPOSAL} from '../sec-proof-ready-proposal.mjs';import {evaluateProposedV2Outcomes} from '../sec-v2-outcomes.mjs';
import {openProposedV2EvidenceStore,processProposedV2Frame,createOfflineV2EvidenceGuard,V2_GUARD_FILES} from '../sec-v2-evidence.mjs';
const sha=b=>createHash('sha256').update(typeof b==='string'||Buffer.isBuffer(b)?b:JSON.stringify(b)).digest('hex'),key='synthetic-v2-artifact-key-only',day='2026-11-05',start=Date.parse(day+'T14:30:00Z'),plan={day,start:new Date(start).toISOString(),end:new Date(start+40*60000).toISOString()};
const universe=['AMD','INTC','NVDA','AMAT','LRCX','KLAC'],metadata=universe.map((symbol,i)=>({symbol,securityId:'SYNTHETIC-ID-'+symbol,issuerCik:String(i+1).padStart(10,'0'),sic:'3674',commonStock:true,zad:'PASS',asOf:day+'T13:00:00Z'}));
function frameAt(sequence,prior=[],change=()=>{}){
 const due=sequence===40?start+40*60000-10000:start+sequence*60000,at=new Date(due+1000).toISOString(),raw={};
 for(const symbol of universe){const bid=sequence>2?(symbol==='INTC'?9.5:10.1):9.99;raw[symbol]={latestQuote:{bp:bid,ap:sequence>2?bid+.02:10.01,bs:1000,as:1000,t:new Date(due+500).toISOString()},latestTrade:{p:10,t:new Date(due+500).toISOString()},prevDailyBar:{c:10,v:1000000,t:'2026-11-04T05:00:00Z'},minuteBar:{l:10,h:10,v:200000,t:new Date(Math.floor(due/60000)*60000-60000).toISOString()}};}
 change(raw);return frameFromSnapshots({sequence,requestedAt:new Date(due).toISOString(),receivedAt:at,sourceHandoffAt:new Date(due).toISOString(),rawResponse:JSON.stringify(raw),metadata,universe,priorFrames:prior});
}
function frames(change=()=>{}){const result=[];for(let i=0;i<41;i++)result.push(frameAt(i,result,b=>change(b,i)));return result;}
const pair=frames=>({entrySequence:2,entryAt:frames[2].at,exitDueAt:new Date(Date.parse(frames[2].at)+1800000).toISOString(),primaryAdmission:false,candidate:{symbol:'INTC',securityId:'SYNTHETIC-ID-INTC',entryAt:frames[2].at,entryAsk:10.01,quantity:99},control:{symbol:'AMD',securityId:'SYNTHETIC-ID-AMD',entryAt:frames[2].at,entryAsk:10.01,quantity:99}});
test('paired30-minute quoted exits retain losing legs, costs once and full denominators',()=>{
 const f=frames(),r=evaluateProposedV2Outcomes({frames:f,pairs:[pair(f)],cutoffAt:f.at(-1).at});
 assert.equal(r.counts.resolved,1);assert.equal(r.captureScheduleComplete,true);assert.equal(r.genuineAdmissions,0);assert.equal(r.cases[0].candidate.exitAt,f[32].at);
 assert.ok(Math.abs(r.cases[0].candidate.netAfterSpreadAndFees-(-56.49/1000))<1e-12);assert.equal(r.costs.spreadDeductedAgain,false);assert.ok(r.cases[0].candidate.stressNet<r.cases[0].candidate.netAfterSpreadAndFees);
});
test('missing paths/size/raw conflicts are unresolved; do not skip an inconvenient first exit',()=>{
 for(const change of [
  (b,i)=>{if(i===32)b.INTC.latestQuote.bs=1;},
  (b,i)=>{if(i===20)delete b.INTC;},
  (b,i)=>{if(i>=32)b.INTC.latestQuote.t='2026-11-05T14:00:00Z';}
 ]){
  const f=frames(change),r=evaluateProposedV2Outcomes({frames:f,pairs:[pair(f)],cutoffAt:f.at(-1).at});assert.equal(r.counts.unresolved,1);assert.equal(r.cases[0].matchedEdge,null);
 }
 const f=frames(),r=evaluateProposedV2Outcomes({frames:f.filter(x=>x.sequence!==10),pairs:[pair(f)],cutoffAt:f.at(-1).at});assert.equal(r.counts.unresolved,1);assert.deepEqual(r.missingSequences,[10]);
 const bad=structuredClone(f);bad[2].rawResponse+=' ';assert.throws(()=>evaluateProposedV2Outcomes({frames:bad,pairs:[pair(f)],cutoffAt:f.at(-1).at}),/FRAME_INTEGRITY/);
});
function guardFixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'v2-pins-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const pins={};
 for(const f of V2_GUARD_FILES){const b=fs.readFileSync(new URL('../'+f,import.meta.url));fs.mkdirSync(path.dirname(path.join(root,f)),{recursive:true});fs.writeFileSync(path.join(root,f),b);pins[f]=sha(b);}
 return {root,pins,guard:createOfflineV2EvidenceGuard({root,sourcePins:pins})};
}
test('guard is offline-only and revalidates the complete source closure',t=>{
 const g=guardFixture(t);assert.throws(()=>createOfflineV2EvidenceGuard({root:g.root,sourcePins:g.pins,mode:'LIVE'}),/OFFLINE_SCOPE/);
 fs.appendFileSync(path.join(g.root,'discovery-paper.mjs'),'\n// synthetic mutation');assert.throws(()=>g.guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL}),/SOURCE_CHANGED/);
});
test('actual native producer prefixes -> guarded V2 -> encrypted ACKs -> restart -> paired exits',async t=>{
 const g=guardFixture(t),f=await producerFixture({long:true,selectionTelemetry:true,symbol:'AMD',peerSymbol:'INTC',syntheticSECOrigin:true,emptyFeedBefore:Date.parse(day+'T14:30:30Z')});t.after(()=>f.close());
 const r=await f.run({shadow:true,epoch:Date.parse(day+'T14:28:00Z'),fakeMin:569}),native=path.join(f.dir,'v2-native'),telemetry=path.join(f.dir,'v2-telemetry'),directory=path.join(f.dir,'v2-sealed');fs.mkdirSync(native);fs.mkdirSync(telemetry);
 const options={directory,key,runId:r.runId,sourceSha:r.sourceSha,proposalSha256:sha('UNADOPTED_V2'),plan};let store=openProposedV2EvidenceStore(options),last;const observed=[],uploads=[];
 const copy=(from,to,name)=>{const b=fs.readFileSync(path.join(from,name)),dest=path.join(to,name);if(fs.existsSync(dest))assert.ok(fs.readFileSync(dest).equals(b));else fs.writeFileSync(dest,b,{flag:'wx'});};
 for(let sequence=0;sequence<41;sequence++){
  const frame=frameAt(sequence,observed),at=Date.parse(frame.sourceHandoffAt);let clock=at;copy(r.archiveDirectory,native,'run.json');copy(r.selectionDirectory,telemetry,'run.json');
  for(const name of fs.readdirSync(r.archiveDirectory).filter(n=>/^response-/.test(n)).sort()){const raw=JSON.parse(fs.readFileSync(path.join(r.archiveDirectory,name)));if(Date.parse(raw.payload.observedAt)<=at)copy(r.archiveDirectory,native,name);}
  for(const name of fs.readdirSync(r.selectionDirectory).filter(n=>/^record-/.test(n)).sort()){const raw=JSON.parse(fs.readFileSync(path.join(r.selectionDirectory,name)));if(Date.parse(raw.at)<=at)copy(r.selectionDirectory,telemetry,name);}
  observed.push(frame);last=await processProposedV2Frame({store,sourceOptions:{archiveDirectory:native,telemetryDirectory:telemetry,runId:r.runId,sourceSha:r.sourceSha,history:{state:'VERIFIED_NO_EARLIER_SAME_DAY_RUN',scope:'MAIN_PRODUCER_SAME_DAY'}},now:()=>new Date(clock).toISOString(),observeFrame:async info=>{assert.equal(info.sourceHandoffAt,frame.sourceHandoffAt);clock=Date.parse(frame.receivedAt);return frame;},guard:g.guard,upload:async x=>{uploads.push(x);assert.doesNotMatch(x.bytes.toString(),/latestQuote|FEED_ENTRY|SYNTHETIC-ID/);return {confirmed:true,contentSha256:sha(x.bytes),artifactId:sequence+1};}});
  if(sequence===12)store=openProposedV2EvidenceStore(options);
 }
 assert.equal(uploads.length,41);assert.equal(last.state.pairs.length,1);assert.equal(last.outcome.counts.resolved,1,JSON.stringify(last.outcome.cases));assert.equal(last.genuineAdmissions,0);
 assert.equal(last.state.pairs[0].entrySequence,2);assert.equal(last.state.pairs[0].candidate.sourceReadyAt,day+'T14:32:00.000Z');assert.ok(Date.parse(last.state.pairs[0].candidate.firstIngestedAt)<Date.parse(last.state.pairs[0].entryAt));
 const recovered=openProposedV2EvidenceStore(options).snapshot();assert.equal(recovered.state.frames.length,41);assert.deepEqual(recovered.pending,[]);assert.equal(recovered.primaryAdmission,false);assert.equal(recovered.automaticResumeAuthorized,false);
 assert.ok(recovered.records[0].sourceAssets.some(x=>x.name==='native:run.json'));assert.equal(recovered.records.at(-1).outcome.genuineAdmissions,0);
 assert.throws(()=>openProposedV2EvidenceStore({...options,key:'wrong-synthetic-key'}).snapshot());
});
test('checkpoint/upload/ACK failures keep original evidence and block blind retry',async t=>{
 const g=guardFixture(t);
 for(const boundary of ['checkpoint','upload','ack','guard']){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v2-fault-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));let failed=false,uploads=0;
  const io={...fs,writeFileSync:(fd,bytes)=>{const paths=fs.readdirSync(directory);if(!failed&&((boundary==='checkpoint'&&paths.some(x=>x.startsWith('checkpoint')))||(boundary==='ack'&&paths.some(x=>x.startsWith('ack'))))){failed=true;fs.writeFileSync(fd,Buffer.from(bytes).subarray(0,12));throw Error('SYNTHETIC_WRITE_FAILURE');}return fs.writeFileSync(fd,bytes);}};
  const options={directory,key,runId:'synthetic',sourceSha:'a'.repeat(40),proposalSha256:sha('proposal'),plan,io};
  const store=openProposedV2EvidenceStore(options),f=frameAt(0),body={protocol:PROOF_READY_PROPOSAL,frames:1,pairs:[],ready:{},used:[]},selection={...body,checksum:sha(body)},record={sequence:0,policyApproved:false,primaryAdmission:false,state:{kind:'PROPOSED_V2_EVIDENCE_STATE_V1',sourceSha:options.sourceSha,runId:options.runId,frames:[f],pairs:[],selection}};
  const call=()=>store.append(record,{guard:g.guard,upload:async x=>{uploads++;if(boundary==='upload')throw Error('SYNTHETIC_UPLOAD_REFUSAL');if(boundary==='guard')fs.appendFileSync(path.join(g.root,'discovery-paper.mjs'),'\n// late source mutation');return {confirmed:true,contentSha256:sha(x.bytes),artifactId:1};}});
  await assert.rejects(call());assert.equal(uploads,boundary==='checkpoint'?0:1);
  const old=new Map(fs.readdirSync(directory).filter(n=>n.endsWith('.enc')).map(n=>[n,fs.readFileSync(path.join(directory,n))]));await assert.rejects(call());assert.equal(uploads,boundary==='checkpoint'?0:1);
  for(const [n,b]of old)assert.ok(fs.readFileSync(path.join(directory,n)).equals(b));
  if(boundary==='guard')break;
 }
});

test('concurrent checkpoint writers cannot duplicate upload or consume an unconfirmed sequence',async t=>{
 const g=guardFixture(t),directory=fs.mkdtempSync(path.join(os.tmpdir(),'v2-concurrent-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const options={directory,key,runId:'synthetic',sourceSha:'a'.repeat(40),proposalSha256:sha('proposal'),plan},store=openProposedV2EvidenceStore(options),other=openProposedV2EvidenceStore(options),body={protocol:PROOF_READY_PROPOSAL,frames:1,pairs:[],ready:{},used:[]},selection={...body,checksum:sha(body)},record={sequence:0,policyApproved:false,primaryAdmission:false,state:{kind:'PROPOSED_V2_EVIDENCE_STATE_V1',sourceSha:options.sourceSha,runId:options.runId,frames:[frameAt(0)],pairs:[],selection}};
 let release,entered;const waiting=new Promise(r=>{release=r;}),started=new Promise(r=>{entered=r;});let uploads=0;
 const first=store.append(record,{guard:g.guard,upload:async x=>{uploads++;entered();await waiting;return {confirmed:true,contentSha256:sha(x.bytes),artifactId:1};}});
 await started;await assert.rejects(other.append(record,{guard:g.guard,upload:async()=>{uploads++;throw Error('must not upload');}}));assert.equal(uploads,1);release();await first;
 assert.equal(other.snapshot().state.frames.length,1);assert.equal(other.snapshot().pending.length,0);assert.equal(other.snapshot().automaticResumeAuthorized,false);
 const lease=store.beginObservation();assert.throws(()=>other.beginObservation());await assert.rejects(other.append(record,{guard:g.guard,upload:async()=>{throw Error('must not upload during observation');}}));lease.release();assert.equal(other.snapshot().observing,false);
});
test('upload timeout and unconfirmed acknowledgments preserve pending bytes and prevent blind retries',async t=>{
 const g=guardFixture(t);
 for(const response of ['timeout','refused','wrong-hash','invalid-id']){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'v2-ack-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));const options={directory,key,runId:'synthetic',sourceSha:'a'.repeat(40),proposalSha256:sha('proposal'),plan},store=openProposedV2EvidenceStore(options);
  const body={protocol:PROOF_READY_PROPOSAL,frames:1,pairs:[],ready:{},used:[]},selection={...body,checksum:sha(body)},record={sequence:0,policyApproved:false,primaryAdmission:false,state:{kind:'PROPOSED_V2_EVIDENCE_STATE_V1',sourceSha:options.sourceSha,runId:options.runId,frames:[frameAt(0)],pairs:[],selection}};let calls=0;
  const upload=async x=>{calls++;if(response==='timeout')return new Promise(()=>{});return {confirmed:response!=='refused',contentSha256:response==='wrong-hash'?'0'.repeat(64):sha(x.bytes),artifactId:response==='invalid-id'?0:1};};
  const timers={setTimeout:(fn)=>setTimeout(fn,10),clearTimeout};await assert.rejects(store.append(record,{guard:g.guard,upload,timers}));assert.equal(calls,1);const b=fs.readFileSync(path.join(directory,'checkpoint-000000.enc'));await assert.rejects(store.append(record,{guard:g.guard,upload,timers}));assert.equal(calls,1);assert.ok(fs.readFileSync(path.join(directory,'checkpoint-000000.enc')).equals(b));assert.equal(openProposedV2EvidenceStore(options).snapshot().pending.length,1);
 }
});

test('bid marks never imply full-size liquidation; global stale quotes and future frames stay visible',()=>{
 const f=frames((b,i)=>{if(i===20)b.INTC.latestQuote.bs=1;if(i===25)b.NVDA.latestQuote.t='2026-11-05T14:00:00Z';});
 const r=evaluateProposedV2Outcomes({frames:f,pairs:[pair(f)],cutoffAt:f.at(-1).at});assert.equal(r.cases[0].candidate.drawdownCapacityVerified,false);assert.deepEqual(r.cases[0].candidate.insufficientMarkDepthSequences,[20]);assert.equal(r.cases[0].candidate.drawdownBasis,'BID_MARK_NOT_A_GUARANTEED_FULL_SIZE_LIQUIDATION');assert.equal(Object.hasOwn(r.cases[0].candidate,'observedLiquidationDrawdown'),false);
 assert.equal(r.quoteEvidenceComplete,false);assert.ok(r.invalidQuoteSymbols.some(x=>x.symbol==='NVDA'&&x.sequence===25));assert.equal(r.genuineAdmissions,0);
 assert.throws(()=>evaluateProposedV2Outcomes({frames:f,pairs:[pair(f)],cutoffAt:f[30].at}),/FRAME_INTEGRITY/);
});
