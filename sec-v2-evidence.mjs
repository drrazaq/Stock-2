// INACTIVE V2 encrypted evidence/state transport. Mandatory injected guard/upload; no credentials or default network.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {sealResearch,openResearch} from './tools/seal-research-artifact.mjs';
import {prepareProposedV2Source,proposeProofReadyFrame,PROOF_READY_PROPOSAL} from './sec-proof-ready-proposal.mjs';
import {nativeRunDigest} from './native-sec-events.mjs';import {readSelectionTelemetry} from './sec-selection-telemetry.mjs';
import {marketSession} from './market-session.mjs';
import {readNativeRun} from './native-sec-events.mjs';
import {immutableRead} from './paper-capture-wrapper.mjs';import {evaluateProposedV2Outcomes} from './sec-v2-outcomes.mjs';
export const V2_EVIDENCE_CAPS=Object.freeze({frames:41,sourceBytes:8*1024*1024,plainBytes:12*1024*1024,sealedBytes:16*1024*1024,totalSealedBytes:64*1024*1024,uploadMs:10000,uploads:41});
const sha=b=>createHash('sha256').update(typeof b==='string'||Buffer.isBuffer(b)?b:JSON.stringify(b)).digest('hex'),need=(x,c)=>{if(!x)throw Error(c);};
const safe=d=>{for(let p=path.resolve(d);;p=path.dirname(p)){if(fs.existsSync(p))need(!fs.lstatSync(p).isSymbolicLink(),'V2_SYMLINK');if(path.dirname(p)===p)break;}};
const context=(scope,sequence)=>({kind:'PROPOSED_V2_ENCRYPTED_EVIDENCE_V1',...scope,sequence,policyApproved:false,primaryAdmission:false});

const guards=new WeakSet();
export const V2_GUARD_FILES=Object.freeze(["artifact-wire-client.mjs","capture-approved-binding.mjs","capture-artifact.mjs","capture-json.mjs","discovery-paper.mjs","early-alerts.mjs","edgar-feed.mjs","ignition-execution-contract.mjs","market-session.mjs","native-sec-bounded-clients.mjs","native-sec-colocated-prefix.mjs","native-sec-events.mjs","native-sec-handoff.mjs","native-sec-lineage-history.mjs","native-sec-parent-client.mjs","paper-capture-ports.mjs","paper-capture-references.mjs","paper-capture-wrapper.mjs","prospective-capture-transport.mjs","prospective-paper-capture.mjs","radar-v3-core.mjs","rank-models.mjs","ranking-cohort.mjs","sec-proof-ready-proposal.mjs","sec-selection-telemetry.mjs","sec-v2-evidence.mjs","sec-v2-outcomes.mjs","shadow-eval.mjs","snapshot-fields.mjs","tools/seal-research-artifact.mjs","zad-compliance.mjs"]);
export function createOfflineV2EvidenceGuard({root,sourcePins,mode='OFFLINE_REHEARSAL_V2'}){
 need(mode==='OFFLINE_REHEARSAL_V2'&&root&&sourcePins&&V2_GUARD_FILES.every(p=>/^[a-f0-9]{64}$/.test(sourcePins[p]||'')),'V2_OFFLINE_SCOPE');
 const pins=Object.freeze({...sourcePins}),base=path.resolve(root);
 const guard=Object.freeze({revalidate(context){
  need(context?.mode==='PROPOSAL_ONLY'&&context.protocol===PROOF_READY_PROPOSAL,'V2_GUARD_SCOPE');
  let bytes=0;for(const [name,digest]of Object.entries(pins)){
   need(/^[A-Za-z0-9_./-]+\.mjs$/.test(name)&&!name.split('/').includes('..'),'V2_GUARD_PATH');
   const value=immutableRead(path.join(base,name),1024*1024);bytes+=value.bytes.length;need(value.hash===digest&&bytes<=4*1024*1024,'V2_GUARD_SOURCE_CHANGED');
  }
  return {mode:'OFFLINE_REHEARSAL_V2',policyApproved:false,primaryAdmission:false};
 }});
 guards.add(guard);guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL});return guard;
}

function sourceAssets(options,handle){
 safe(options.archiveDirectory);safe(options.telemetryDirectory);
 const native=nativeRunDigest(options.archiveDirectory),telemetry=readSelectionTelemetry(options.telemetryDirectory,options);
 need(native.sha256===handle.nativePrefixSha256&&telemetry.lastHash===handle.telemetryLastHash,'V2_SOURCE_CHANGED');
 const assets=native.files.map(f=>({name:'native:'+f.name,bodyBase64:f.bodyBase64}));
 for(const name of fs.readdirSync(options.telemetryDirectory).sort()){need(name==='run.json'||/^record-\d{6}\.json$/.test(name),'V2_TELEMETRY_PARTIAL');const bytes=immutableRead(path.join(options.telemetryDirectory,name),16384).bytes;assets.push({name:'telemetry:'+name,bodyBase64:bytes.toString('base64')});}
 for(const a of options.contextAssets||[]){need(/^context:(reference|reference-review|input-clocks|runtime-pins|history|parent-[0-3])$/.test(a.name)&&Buffer.isBuffer(a.bytes),'V2_CONTEXT_ASSET');assets.push({name:a.name,bodyBase64:a.bytes.toString('base64')});}
 need(Buffer.byteLength(JSON.stringify(assets))<=V2_EVIDENCE_CAPS.sourceBytes,'V2_SOURCE_BUDGET');
 return assets.map(a=>({...a,sha256:sha(Buffer.from(a.bodyBase64,'base64'))}));
}
export function openProposedV2EvidenceStore({directory,key,runId,sourceSha,proposalSha256,plan,io=fs}){
 need(typeof key==='string'&&key.length>=16&&/^[A-Za-z0-9_-]{1,80}$/.test(runId||'')&&/^[a-f0-9]{40}$/.test(sourceSha||'')&&/^[a-f0-9]{64}$/.test(proposalSha256||''),'V2_SCOPE');
 const start=Date.parse(plan?.start),end=Date.parse(plan?.end),fmt=n=>Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(n)).map(p=>[p.type,p.value]));
 need(Number.isFinite(start)&&Number.isFinite(end)&&end-start===40*60000&&start%60000===0&&marketSession(plan.day).known&&!marketSession(plan.day).closed,'V2_CAPTURE_WINDOW');
 const a=fmt(start),b=fmt(end);need(a.year+'-'+a.month+'-'+a.day===plan.day&&b.year+'-'+b.month+'-'+b.day===plan.day&&a.hour==='09'&&a.minute==='30'&&b.hour==='10'&&b.minute==='10','V2_CAPTURE_WINDOW');
 safe(directory);io.mkdirSync(directory,{recursive:true,mode:0o700});const scope={runId,sourceSha,proposalSha256,window:{day:plan.day,start:plan.start,end:plan.end}};
 let cache=null,signatures=null;
 const signature=file=>{const s=io.lstatSync(file);need(s.isFile()&&!s.isSymbolicLink(),'V2_FILE');return [s.dev,s.ino,s.size,s.mtimeMs,s.ctimeMs].join('|');};
 const remember=value=>{cache=structuredClone(value);signatures=Object.fromEntries(io.readdirSync(directory).filter(n=>n!=='.writer-lock'&&n!=='.observing').map(n=>[n,signature(path.join(directory,n))]));};

 const write=(file,bytes)=>{const fd=io.openSync(file,'wx',0o600);try{io.writeFileSync(fd,bytes);io.fsyncSync(fd);}finally{io.closeSync(fd);}};
 const read=(file,max)=>{safe(file);const s=io.lstatSync(file);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=max,'V2_FILE');return io.readFileSync(file);};
 const scoped=(e,seq)=>need(JSON.stringify(e.context)===JSON.stringify(context(scope,seq)),'V2_CONTEXT');
 const snapshot=()=>{
  safe(directory);const names=io.readdirSync(directory);need(names.every(n=>n==='.writer-lock'||n==='.observing'||n==='.observation-unknown'||/^(checkpoint|ack)-\d{6}\.enc$/.test(n)),'V2_UNEXPECTED_FILE');
  if(cache){const expected=Object.keys(signatures).sort(),actual=names.filter(n=>n!=='.writer-lock'&&n!=='.observing').sort();if(JSON.stringify(expected)===JSON.stringify(actual)&&actual.every(n=>signature(path.join(directory,n))===signatures[n]))return structuredClone({...cache,locked:names.includes('.writer-lock'),observing:names.includes('.observing'),observationUnknown:names.includes('.observation-unknown')});}
  let state=null,chain='0'.repeat(64),total=0;const pending=[],records=[];
  const checkpoints=names.filter(n=>n.startsWith('checkpoint-')).sort();need(checkpoints.length<=41,'V2_FRAME_CAP');
  for(let seq=0;seq<checkpoints.length;seq++){
   const name='checkpoint-'+String(seq).padStart(6,'0')+'.enc';need(checkpoints[seq]===name,'V2_SEQUENCE');
   const bytes=read(path.join(directory,name),V2_EVIDENCE_CAPS.sealedBytes);total+=bytes.length;need(total<=V2_EVIDENCE_CAPS.totalSealedBytes,'V2_TOTAL_BUDGET');const e=JSON.parse(bytes);scoped(e,seq);const raw=openResearch(e,key);need(raw.length<=V2_EVIDENCE_CAPS.plainBytes,'V2_PLAIN_BUDGET');const p=JSON.parse(raw);
   need(p.sequence===seq&&p.previous===chain&&p.chain===sha(chain+JSON.stringify(p.record)),'V2_CHAIN');chain=p.chain;records.push(p.record);
   const ackFile='ack-'+String(seq).padStart(6,'0')+'.enc';if(!names.includes(ackFile)){pending.push(seq);continue;}
   need(!pending.length,'V2_ACK_GAP');const ackEnvelope=JSON.parse(read(path.join(directory,ackFile),4096));scoped(ackEnvelope,seq);const ack=JSON.parse(openResearch(ackEnvelope,key));
   need(ack.kind==='CLIENT_ACK_NOT_INDEPENDENT_REMOTE_VERIFICATION'&&ack.checkpointSha256===sha(bytes)&&ack.sequence===seq&&Number.isSafeInteger(ack.artifactId)&&ack.artifactId>0,'V2_ACK_BINDING');state=p.record.state;
  }
  need(names.filter(n=>n.startsWith('ack-')).length===checkpoints.length-pending.length,'V2_ORPHAN_ACK');
  const result={scope,records,state,chain,total,pending,locked:names.includes('.writer-lock'),observing:names.includes('.observing'),observationUnknown:names.includes('.observation-unknown'),automaticResumeAuthorized:false,primaryAdmission:false};remember(result);return structuredClone(result);
 };
 let activeLease=null;
 const beginObservation=()=>{const prior=snapshot();need(!prior.locked&&!prior.observing&&!prior.observationUnknown&&!prior.pending.length,'V2_OBSERVATION_UNCONFIRMED');io.mkdirSync(path.join(directory,'.observing'));try{const after=snapshot();need(!after.locked&&!after.observationUnknown&&!after.pending.length&&after.chain===prior.chain,'V2_CONCURRENT_OBSERVATION');}catch(e){io.rmdirSync(path.join(directory,'.observing'));throw e;}const lease={prior,release(){if(activeLease===lease){activeLease=null;io.rmdirSync(path.join(directory,'.observing'));}}};activeLease=lease;return lease;};
 const markUnknown=()=>{try{io.writeFileSync(path.join(directory,'.observation-unknown'),'UNCONFIRMED_OBSERVATION',{flag:'wx',mode:0o600});}catch{}};
 const append=async(record,{guard,upload,lease,timers={setTimeout,clearTimeout}}={})=>{
  need(guards.has(guard)&&typeof upload==='function','V2_PORTS');guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL});
  const before=snapshot();need(!before.locked&&!before.observationUnknown&&!before.pending.length&&(!before.observing||lease===activeLease),'V2_UNCONFIRMED_OR_INTERRUPTED');need(before.records.length<41,'V2_FRAME_CAP');
  let lock=false;
  try{
   io.mkdirSync(path.join(directory,'.writer-lock'));lock=true;const current=snapshot();need(current.chain===before.chain&&!current.pending.length&&!current.observationUnknown&&(!current.observing||lease===activeLease),'V2_CONCURRENT_ADVANCE');
   const sequence=current.records.length;need(record.sequence===sequence&&record.state?.frames?.length===sequence+1&&record.policyApproved===false&&record.primaryAdmission===false,'V2_RECORD_SCOPE');
   need(record.state.kind==='PROPOSED_V2_EVIDENCE_STATE_V1'&&record.state.sourceSha===scope.sourceSha&&record.state.runId===scope.runId&&record.state.selection?.frames===sequence+1&&JSON.stringify(record.state.selection.pairs)===JSON.stringify(record.state.pairs),'V2_STATE_BINDING');const {checksum,...selectionBody}=record.state.selection;need(checksum===sha(selectionBody),'V2_SELECTION_HASH');
   const payload={sequence,previous:current.chain,record,chain:sha(current.chain+JSON.stringify(record))},plain=Buffer.from(JSON.stringify(payload));need(plain.length<=V2_EVIDENCE_CAPS.plainBytes,'V2_PLAIN_BUDGET');
   const bytes=Buffer.from(JSON.stringify(sealResearch(plain,key,context(scope,sequence))));need(bytes.length<=V2_EVIDENCE_CAPS.sealedBytes&&current.total+bytes.length<=V2_EVIDENCE_CAPS.totalSealedBytes,'V2_TOTAL_BUDGET');
   guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL});const name='checkpoint-'+String(sequence).padStart(6,'0')+'.enc';write(path.join(directory,name),bytes);
   let timer,ack;try{ack=await Promise.race([upload({name,bytes,sha256:sha(bytes),sequence,scope}),new Promise((_,reject)=>{timer=timers.setTimeout(()=>reject(Error('V2_UPLOAD_TIMEOUT')),V2_EVIDENCE_CAPS.uploadMs);})]);}finally{timers.clearTimeout(timer);}
   guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL});
   need(ack?.confirmed===true&&ack.contentSha256===sha(bytes)&&Number.isSafeInteger(ack.artifactId)&&ack.artifactId>0,'V2_UPLOAD_UNCONFIRMED');
   const receipt={kind:'CLIENT_ACK_NOT_INDEPENDENT_REMOTE_VERIFICATION',sequence,checkpointSha256:sha(bytes),artifactId:ack.artifactId};
   write(path.join(directory,'ack-'+String(sequence).padStart(6,'0')+'.enc'),Buffer.from(JSON.stringify(sealResearch(Buffer.from(JSON.stringify(receipt)),key,context(scope,sequence)))));
   remember({scope,records:[...current.records,JSON.parse(plain).record],state:JSON.parse(plain).record.state,chain:payload.chain,total:current.total+bytes.length,pending:[],locked:false,automaticResumeAuthorized:false,primaryAdmission:false});
   return {status:'ENCRYPTED_CHECKPOINT_CLIENT_ACKNOWLEDGED',sequence,checkpointSha256:sha(bytes),independentRemoteVerification:false,primaryAdmission:false};
  }finally{if(lock)try{io.rmdirSync(path.join(directory,'.writer-lock'));}catch{}}
 };
 return {snapshot,append,scope,beginObservation,markUnknown};
}
export async function processProposedV2Frame({store,sourceOptions,observeFrame,now,guard,upload,timers={setTimeout,clearTimeout}}){
 need(guards.has(guard)&&typeof observeFrame==='function'&&typeof now==='function','V2_GUARD_REQUIRED');guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL});
 const lease=store.beginObservation();let observed=false,committed=false,timeout;
 try{
 const prior=lease.prior;
 const old=prior.state||{kind:'PROPOSED_V2_EVIDENCE_STATE_V1',sourceSha:store.scope.sourceSha,runId:store.scope.runId,frames:[],selection:null,pairs:[],ledger:[],assetIndex:{}};
 const sequence=old.frames.length,w=store.scope.window,start=Date.parse(w.start),end=Date.parse(w.end),due=sequence===40?end-10000:start+sequence*60000;
 need(sequence<41&&sourceOptions.runId===old.runId&&sourceOptions.sourceSha===old.sourceSha,'V2_FRAME_SCOPE');
 need(readNativeRun({directory:sourceOptions.archiveDirectory,expectedRunId:sourceOptions.runId,expectedSourceSha:sourceOptions.sourceSha}).meta.provenance==='SYNTHETIC_FIXTURE','V2_LIVE_BINDING_NOT_IMPLEMENTED_OR_AUTHORIZED');
 // Read original prefixes BEFORE quote observation; immutable encrypted persistence follows the frame. An interruption leaves uncertainty, not an invented durable pre-quote proof.
 const handle=prepareProposedV2Source({...sourceOptions,now}),assets=sourceAssets(sourceOptions,handle),deltas=[];
 for(const asset of assets){const priorHash=old.assetIndex[asset.name];need(!priorHash||priorHash===asset.sha256,'V2_IMMUTABLE_ASSET_CHANGED');if(!priorHash)deltas.push(asset);}
 guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL});observed=true;
 const frame=await Promise.race([observeFrame({sequence,sourceHandoffAt:handle.observedAt,dueAt:new Date(due).toISOString()}),new Promise((_,reject)=>{timeout=timers.setTimeout(()=>reject(Error('V2_OBSERVATION_TIMEOUT')),10000);})]);timers.clearTimeout(timeout);
 guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL});
 need(frame.sequence===sequence&&frame.sourceHandoffAt===handle.observedAt&&Date.parse(frame.at)<=Date.parse(now())&&Date.parse(frame.requestedAt)>=due&&Date.parse(frame.requestedAt)<=due+10000&&Date.parse(frame.at)<=end,'V2_CAPTURE_SCHEDULE');
 const proposed=proposeProofReadyFrame({sourceHandle:handle,frame,state:old.selection}),frames=[...old.frames,frame],pairs=[...old.pairs,...proposed.pairs],ledger=[...old.ledger,...proposed.ledger];
 const state={...old,frames,selection:proposed.state,pairs,ledger,assetIndex:{...old.assetIndex,...Object.fromEntries(assets.map(a=>[a.name,a.sha256]))}};
 const outcome=evaluateProposedV2Outcomes({frames,pairs,ledger,cutoffAt:frame.at});
 const record={sequence,policyApproved:false,primaryAdmission:false,sourceHandle:handle,sourceAssets:deltas,state,outcome};
 const persisted=await store.append(record,{guard,upload,timers,lease});committed=true;return {...persisted,state,outcome,proposed,genuineAdmissions:0};
 }finally{timers.clearTimeout(timeout);if(observed&&!committed)store.markUnknown();lease.release();}
}
