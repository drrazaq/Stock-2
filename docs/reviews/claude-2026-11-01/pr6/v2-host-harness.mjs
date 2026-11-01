// Independent harness for PR #6 (inactive V2 host/guard/recovery). Reviewer: Claude.
// Runs the ACTUAL host (startInactiveV2Host), worker, real wire client and recovery of a given tree, using the tree's own
// synthetic fixtures (local child processes only, mock transports, synthetic keys). Nothing leaves the machine; no provider call.
// Usage: node v2-host-harness.mjs <tree> [phase: all|recovery|guards|isolation]   -> prints one JSON object.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';import {pathToFileURL} from 'node:url';import {createHash} from 'node:crypto';
const [tree,phase='all']=process.argv.slice(2),T=p=>pathToFileURL(path.join(path.resolve(tree),p)).href,sha=b=>createHash('sha256').update(b).digest('hex');
const {producerFixture}=await import(T('test/native-sec-producer-fixture.mjs')),{v2HostFixture}=await import(T('test/sec-v2-host-fixture.mjs'));
const {startInactiveV2Host,prepareInactiveV2Binding,runInactiveV2Capture}=await import(T('sec-v2-host-binding.mjs')),{recoverInactiveV2Capture}=await import(T('sec-v2-recovery.mjs'));
const {prepareNativeParentForHost}=await import(T('native-sec-colocated-host.mjs')),{createSameDayLineageClient}=await import(T('native-sec-lineage-history.mjs'));
const {openCaptureZip,fixtureZip}=await import(T('capture-artifact.mjs')),{openResearch,sealResearch}=await import(T('tools/seal-research-artifact.mjs')),{evaluateProposedV2Outcomes}=await import(T('sec-v2-outcomes.mjs'));
const out={tree:path.basename(path.resolve(tree)),node:process.version},cleanups=[];
const code=(f)=>{try{const v=f();return v&&v.status?'RETURNED:'+v.status+'/frames='+v.frames:'RETURNED';}catch(e){return 'THROW:'+String(e.message).slice(0,60);}};

// One actual host run, mirroring the author's integration test; `edit(w)` may replace the pinned binding module first.
async function hostRun(scenario,edit){
 const p=await producerFixture({long:true,snapshotDelayMs:scenario.startsWith('success')?15:1,selectionTelemetry:true,symbol:'AMD',peerSymbol:'INTC',syntheticSECOrigin:true,emptyFeedBefore:Date.parse('2026-11-05T14:30:30Z')}),w=v2HostFixture(p,scenario);cleanups.push(()=>{p.close();w.cleanup();});
 if(edit)edit(w);
 const client=createSameDayLineageClient({token:'SYNTHETIC',storageOrigins:['https://synthetic.blob.core.windows.net'],fetcher:async()=>Response.json({total_count:0,workflow_runs:[]})});
 const parentState=await prepareNativeParentForHost({client,scope:{day:'2026-11-05',before:'2026-11-05T14:29:30Z',currentRunId:900,workflowId:7,allowedSourceShas:[p.sourceSha]},rootDirectory:p.dir,destination:'runtime/native-sec-parents/v2'});let host;
 const result=await p.run({shadow:true,runId:'900',epoch:Date.parse('2026-11-05T14:28:00Z'),fakeMin:569,launch:spec=>{const runtimeFiles=Object.fromEntries(fs.readdirSync(p.dir).filter(n=>n.endsWith('.mjs')||n.endsWith('.js')).map(n=>[n,sha(fs.readFileSync(path.join(p.dir,n)))]));host=startInactiveV2Host({mode:'INACTIVE_SYNTHETIC_REHEARSAL',producer:{...spec,entrySha256:runtimeFiles['ignition-watch.mjs'],runtimeFiles},capture:w.capture,native:w.native,parentState,planPin:w.planPin,clock:{now:()=>Date.parse(w.c.plan.start)-30000,sleep:ms=>new Promise(r=>setTimeout(r,Math.min(ms,1000))),setTimeout,clearTimeout},storageRoot:w.f.dir,healthFile:path.join(w.f.dir,'health.json')});return host.producer;}});
 const health=await host.completion,r=fs.existsSync(w.c.resultFile)?JSON.parse(fs.readFileSync(w.c.resultFile)):null;
 const beats=result.snapshot.heartbeat.map(x=>x.m),fullHeartbeat=beats.length===332&&beats.every((m,i)=>m===569+i);
 return {w,health,r,producer:{exit:health.producerExitCode,cancelled:health.producerCancelled,fullHeartbeat,heartbeatMinutes:beats.length}};
}
// Replace the fixture's binding module with `source`, re-pin it in the frozen input and the capture args.
function rebind(w,source){fs.writeFileSync(w.c.bindingModule.file,source);w.c.bindingModule.sha256=sha(fs.readFileSync(w.c.bindingModule.file));const file=path.join(w.f.dir,'v2-input.json');fs.writeFileSync(file,JSON.stringify(w.c));w.capture.args=[file,sha(fs.readFileSync(file))];}

if(phase==='all'||phase==='recovery'){
 // 1. A complete capture (attempts recorded honestly; see finding F1 for the intermittent CAPTURE_FAILED).
 let run,attempts=[];for(let i=0;i<5;i++){run=await hostRun('success');attempts.push(run.health.status+(run.r?'/'+run.r.status:''));if(run.health.status==='CAPTURE_FINISHED')break;}
 out.capture={attempts,producer:run.producer,confirmedUploads:run.r?.confirmedUploads,providerAttempts:run.r?.providerAttempts,wireRequests:run.r?.wireRequests,unreconciled:run.r?.unreconciledRemoteUploads,automaticResumeAuthorized:run.r?.automaticResumeAuthorized};
 if(run.health.status==='CAPTURE_FINISHED'){
  const r=run.r,w=run.w,key='synthetic-v2-artifact-key-only',scope=r.receiptManifest.scope,base=r.receiptManifest;
  const archives=new Map(base.receipts.map(x=>[x.artifactId,fs.readFileSync(path.join(w.c.downloads,x.artifactId+'.zip'))]));
  const onDisk=fs.readFileSync(path.join(w.c.receiptDirectory,'manifest.json'),'utf8');out.capture.manifestOnDiskMatchesResult=onDisk===JSON.stringify(base)&&sha(onDisk)===r.receiptManifestSha256;
  const rec=(m,a=archives,k=key,s=scope)=>{const raw=JSON.stringify(m);return recoverInactiveV2Capture({receiptRaw:raw,receiptSha256:sha(raw),expectedScope:s,archives:a,key:k});};
  const clone=x=>structuredClone(x),ids=base.receipts.map(x=>x.artifactId);
  // Key-holder re-seal: rebuild checkpoint `seq` from a modified plaintext, re-chain all later checkpoints, rebuild ZIPs and receipts.
  const plains=base.receipts.map(x=>{const env=JSON.parse(openCaptureZip(archives.get(x.artifactId),x.archiveEntryName).toString());return JSON.parse(openResearch(env,key).toString());});
  function forge(seq,mutate){const m=clone(base),a=new Map(archives);let chain=seq===0?'0'.repeat(64):plains[seq-1].chain;
   for(let i=seq;i<plains.length;i++){const p=clone(plains[i]);if(i===seq)mutate(p.record);p.previous=chain;p.chain=sha(chain+JSON.stringify(p.record));chain=p.chain;
    const ctx={kind:'PROPOSED_V2_ENCRYPTED_EVIDENCE_V1',...scope,sequence:i,policyApproved:false,primaryAdmission:false},env=sealResearch(Buffer.from(JSON.stringify(p)),key,ctx),bytes=Buffer.from(JSON.stringify(env)),zip=fixtureZip(m.receipts[i].archiveEntryName,bytes);
    a.set(m.receipts[i].artifactId,zip);Object.assign(m.receipts[i],{fileSha256:sha(bytes),fileBytes:bytes.length,archiveSha256:sha(zip),archiveBytes:zip.length});}
   return rec(m,a);}
  const firstNative=plains.findIndex(p=>p.record.sourceAssets.some(x=>x.name.startsWith('native:'))),firstTelemetry=plains.findIndex(p=>p.record.sourceAssets.some(x=>/^telemetry:record-/.test(x.name)));
  out.recovery={
   R00_baseline:code(()=>rec(base)),
   R01_receipt_pin_wrong:code(()=>{const raw=JSON.stringify(base);return recoverInactiveV2Capture({receiptRaw:raw,receiptSha256:'0'.repeat(64),expectedScope:scope,archives,key});}),
   R02_scope_runId_changed:code(()=>rec(base,archives,key,{...scope,runId:'901-1'})),
   R03_wrong_key:code(()=>rec(base,archives,'wrong-synthetic-key-x')),
   R04_archive_missing:code(()=>{const a=new Map(archives);a.delete(ids[7]);return rec(base,a);}),
   R05_archives_swapped:code(()=>{const a=new Map(archives);a.set(ids[3],archives.get(ids[4]));a.set(ids[4],archives.get(ids[3]));return rec(base,a);}),
   R06_byte_flip_receipt_repinned:code(()=>{const m=clone(base),a=new Map(archives),z=Buffer.from(archives.get(ids[5]));z[Math.floor(z.length/2)]^=1;a.set(ids[5],z);Object.assign(m.receipts[5],{archiveSha256:sha(z)});return rec(m,a);}),
   R07_duplicate_artifactId:code(()=>{const m=clone(base);m.receipts[2].artifactId=m.receipts[1].artifactId;return rec(m);}),
   R08_middle_receipt_dropped:code(()=>{const m=clone(base);m.receipts.splice(10,1);return rec(m);}),
   R09_receipts_reordered:code(()=>{const m=clone(base);[m.receipts[0],m.receipts[1]]=[m.receipts[1],m.receipts[0]];return rec(m);}),
   R10_truncated_to_20:code(()=>{const m=clone(base);m.receipts=m.receipts.slice(0,20);return rec(m);}),
   R11_extra_receipt_42:code(()=>{const m=clone(base);m.receipts.push({...m.receipts[40],sequence:41});return rec(m);}),
   R12_primaryAdmission_true:code(()=>{const m=clone(base);m.primaryAdmission=true;return rec(m);}),
   R13_forge_reseal_unchanged:code(()=>forge(40,()=>{})),
   R14_forge_outcome_edited:code(()=>forge(40,rec=>{rec.outcome={...rec.outcome,forged:true};})),
   R15_forge_policyApproved:code(()=>forge(40,rec=>{rec.policyApproved=true;})),
   R16_forge_earlier_frame_rewritten:code(()=>forge(40,rec=>{rec.state.frames[0]={...rec.state.frames[0],forged:true};rec.outcome=evaluateProposedV2Outcomes({frames:rec.state.frames,pairs:rec.state.pairs,ledger:rec.state.ledger,cutoffAt:rec.state.frames.at(-1).at});})),
   R17_forge_last_frame_and_outcome:code(()=>forge(40,rec=>{const f=rec.state.frames.at(-1);rec.state.frames[rec.state.frames.length-1]={...f,forgedField:1};rec.outcome=evaluateProposedV2Outcomes({frames:rec.state.frames,pairs:rec.state.pairs,ledger:rec.state.ledger,cutoffAt:rec.state.frames.at(-1).at});})),
   R18_forge_native_bytes:firstNative<0?'NO_NATIVE_ASSET':code(()=>forge(firstNative,rec=>{const x=rec.sourceAssets.find(x=>x.name.startsWith('native:')),b=Buffer.concat([Buffer.from(x.bodyBase64,'base64'),Buffer.from(' ')]);x.bodyBase64=b.toString('base64');x.sha256=sha(b);})),
   R19b_forge_telemetry_field_stale_hash:firstTelemetry<0?'NO_TELEMETRY_ASSET':code(()=>forge(firstTelemetry,rec=>{const x=rec.sourceAssets.find(x=>/^telemetry:record-/.test(x.name)),o=JSON.parse(Buffer.from(x.bodyBase64,'base64').toString());o.forged=true;const b=Buffer.from(JSON.stringify(o));x.bodyBase64=b.toString('base64');x.sha256=sha(b);})),
   R19a_forge_telemetry_whitespace_only:firstTelemetry<0?'NO_TELEMETRY_ASSET':code(()=>forge(firstTelemetry,rec=>{const x=rec.sourceAssets.find(x=>/^telemetry:record-/.test(x.name)),b=Buffer.concat([Buffer.from(x.bodyBase64,'base64'),Buffer.from(' ')]);x.bodyBase64=b.toString('base64');x.sha256=sha(b);})),
   R20_forge_context_reference_removed:code(()=>forge(0,rec=>{rec.sourceAssets=rec.sourceAssets.filter(x=>x.name!=='context:reference');})),
  };
  out.recovery.notes={firstNativeCheckpoint:firstNative,firstTelemetryCheckpoint:firstTelemetry,contextAssets:plains[0].record.sourceAssets.filter(x=>x.name.startsWith('context:')).map(x=>x.name)};
 }
}

if(phase==='all'||phase==='guards'){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v2-hg-')),w=v2HostFixture({dir,sourceSha:'a'.repeat(40)});cleanups.push(()=>{w.cleanup();fs.rmSync(dir,{recursive:true,force:true});});
 const historyFile=path.join(dir,'history.json');fs.writeFileSync(historyFile,JSON.stringify({day:'2026-11-05',historyEvidence:{scope:{day:'2026-11-05',before:'2026-11-05T14:29:30Z',currentRunId:900,workflowId:7,branch:'main',contract:'SESSION_EXECUTION_HISTORY_V2'}},state:'VERIFIED_NO_EARLIER_SAME_DAY_RUN',lookupStatus:'COMPLETE',historyVerified:true,jobHistoryVerified:true,retainedBundles:[]}));
 const inputFor=c=>{const file=path.join(w.f.dir,'v2-input.json');fs.writeFileSync(file,JSON.stringify(c));return {inputFile:file,inputSha256:sha(fs.readFileSync(file)),historyFile,historySha256:sha(fs.readFileSync(historyFile))};};
 const prep=c=>code(()=>prepareInactiveV2Binding(c,inputFor(c)));
 const refRaw=fs.readFileSync(w.c.reference.file,'utf8'),nonSynthetic=(()=>{const x=JSON.parse(refRaw);x.records[0].alpaca.raw=JSON.stringify({...JSON.parse(x.records[0].alpaca.raw),synthetic:false});return JSON.stringify(x);})();
 const refFile2=path.join(w.f.dir,'reference-nonsynthetic.json');fs.writeFileSync(refFile2,nonSynthetic);
 const missingFlag=(()=>{const x=JSON.parse(refRaw);const o=JSON.parse(x.records[0].sec.raw);delete o.synthetic;x.records[0].sec.raw=JSON.stringify(o);return JSON.stringify(x);})(),refFile3=path.join(w.f.dir,'reference-noflag.json');fs.writeFileSync(refFile3,missingFlag);
 out.guards={
  G00_exact_inactive_inputs:prep(w.c),
  G01_reference_nonsynthetic_repinned:prep({...w.c,reference:{...w.c.reference,file:refFile2,sha256:sha(nonSynthetic)}}),
  G02_reference_flag_missing_repinned:prep({...w.c,reference:{...w.c.reference,file:refFile3,sha256:sha(missingFlag)}}),
  G03_policyApproved_true:prep({...w.c,policyApproved:true}),
  G04_mode_LIVE:prep({...w.c,mode:'LIVE'}),
  G05_protocol_changed:prep({...w.c,protocol:'SEC_PROOF_READY_V2_ADOPTED'}),
  G06_output_outside_storage:prep({...w.c,output:path.join(os.tmpdir(),'v2-outside-sealed')}),
  G07_host_mode_LIVE:code(()=>startInactiveV2Host({mode:'LIVE',capture:{entry:'tools/native-sec-v2-capture-worker.mjs'}})),
  G08_host_other_worker:code(()=>startInactiveV2Host({mode:'INACTIVE_SYNTHETIC_REHEARSAL',capture:{entry:'tools/other-worker.mjs'}})),
 };
 // History not eligible: bindings (credentials) must not be read and no transport called.
 for(const state of ['UNKNOWN_MISSING_OR_AMBIGUOUS_HISTORY','AUTHENTICATED_EARLIER_SAME_DAY_EVIDENCE']){const h=JSON.parse(fs.readFileSync(historyFile));fs.writeFileSync(historyFile,JSON.stringify({...h,state}));const g=prepareInactiveV2Binding(w.c,inputFor(w.c));let reads=0,calls=0;const b={transports:{provider:()=>{calls++;},artifact:()=>{calls++;}},now:()=>Date.parse(w.c.plan.start)-30000,wait:async()=>{}};for(const k of ['keyId','secret','encryptionKey','runtimeToken'])Object.defineProperty(b,k,{get(){reads++;return 'x';}});const res=await runInactiveV2Capture(w.c,g,b);out.guards['G09_history_'+state]={status:res.status,reason:res.reason,credentialReads:reads,transportCalls:calls,outputCreated:fs.existsSync(w.c.output)};fs.writeFileSync(historyFile,JSON.stringify(h));}
 // Start window: capture called outside [start-30s, start-10s] must not read credentials or call transports.
 for(const [label,offset] of [['early_31s',-31000],['late_9s',-9000]]){const g=prepareInactiveV2Binding(w.c,inputFor(w.c));let reads=0,calls=0;const b={transports:{provider:()=>{calls++;},artifact:()=>{calls++;}},now:()=>Date.parse(w.c.plan.start)+offset,wait:async()=>{}};for(const k of ['keyId','secret','encryptionKey','runtimeToken'])Object.defineProperty(b,k,{get(){reads++;return 'x';}});let res;try{res=await runInactiveV2Capture(w.c,g,b);}catch(e){res={status:'THROW:'+e.message};}out.guards['G10_window_'+label]={status:res.status,reason:res.reason,credentialReads:reads,transportCalls:calls,outputCreated:fs.existsSync(w.c.output)};}
}

if(phase==='all'||phase==='isolation'){
 // Local-only HTTP listener, to show what the worker's fetch replacement does and does not block.
 let hits=0;const server=http.createServer((q,s)=>{hits++;s.end('{}');});await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;cleanups.push(()=>server.close());
 const probe=(w)=>path.join(w.f.dir,'probe.json');
 const variants={
  I1_bindings_throw:w=>`export function createV2Bindings(){throw Error('SYNTHETIC_BINDING_CRASH');}`,
  I2_worker_exit_mid_capture:w=>fs.readFileSync(w.c.bindingModule.file,'utf8').replace("if(firstQuote){firstQuote=false;","if(firstQuote){firstQuote=false;process.exit(7);"),
  I3_ambient_vs_core_network:w=>`import http from 'node:http';import fs from 'node:fs';
   export async function createV2Bindings(c){let fetchResult;try{await fetch('http://127.0.0.1:${port}/ambient');fetchResult='ALLOWED';}catch(e){fetchResult=e.message;}
    const core=await new Promise(r=>{const q=http.get('http://127.0.0.1:${port}/core',s=>{s.resume();s.on('end',()=>r('ALLOWED_STATUS_'+s.statusCode));});q.on('error',e=>r('ERR_'+e.code));});
    fs.writeFileSync(${JSON.stringify('PROBE')},JSON.stringify({fetchResult,core}));throw Error('SYNTHETIC_STOP_AFTER_PROBE');}`,
 };
 out.isolation={};
 for(const [name,src] of Object.entries(variants)){const before=hits;const run=await hostRun('success',w=>rebind(w,src(w).replace('"PROBE"',JSON.stringify(probe(w)))));
  out.isolation[name]={host:run.health.status,captureExitSignal:run.health.captureExitSignal,producer:run.producer,result:run.r?{status:run.r.status,reason:run.r.reason,providerAttempts:run.r.providerAttempts}:null,probe:fs.existsSync(probe(run.w))?JSON.parse(fs.readFileSync(probe(run.w))):null,localServerHits:hits-before};}
}
console.log(JSON.stringify(out,null,1));
for(const c of cleanups.reverse()){try{c();}catch{}}
process.exit(0);
