// INACTIVE V2 encrypted evidence/state transport. Mandatory injected guard/upload; no credentials or default network.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {sealResearch,openResearch} from './tools/seal-research-artifact.mjs';
import {prepareProposedV2Source,proposeProofReadyFrame,PROOF_READY_PROPOSAL} from './sec-proof-ready-proposal.mjs';
import {nativeRunDigest} from './native-sec-events.mjs';import {readSelectionTelemetry} from './sec-selection-telemetry.mjs';
import {readNativeRun} from './native-sec-events.mjs';
import {immutableRead} from './paper-capture-wrapper.mjs';import {evaluateProposedV2Outcomes} from './sec-v2-outcomes.mjs';
export const V2_EVIDENCE_CAPS=Object.freeze({frames:41,sourceBytes:8*1024*1024,plainBytes:12*1024*1024,sealedBytes:16*1024*1024,totalSealedBytes:64*1024*1024,uploadMs:10000,uploads:41});
const sha=b=>createHash('sha256').update(typeof b==='string'||Buffer.isBuffer(b)?b:JSON.stringify(b)).digest('hex'),need=(x,c)=>{if(!x)throw Error(c);};
const safe=d=>{for(let p=path.resolve(d);;p=path.dirname(p)){if(fs.existsSync(p))need(!fs.lstatSync(p).isSymbolicLink(),'V2_SYMLINK');if(path.dirname(p)===p)break;}};
const context=(scope,sequence)=>({kind:'PROPOSED_V2_ENCRYPTED_EVIDENCE_V1',...scope,sequence,policyApproved:false,primaryAdmission:false});

const guards=new WeakSet();
export const V2_GUARD_FILES=Object.freeze(['sec-v2-evidence.mjs','sec-v2-outcomes.mjs','sec-proof-ready-proposal.mjs','discovery-paper.mjs','prospective-paper-capture.mjs','capture-approved-binding.mjs','paper-capture-wrapper.mjs']);
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
 need(Buffer.byteLength(JSON.stringify(assets))<=V2_EVIDENCE_CAPS.sourceBytes,'V2_SOURCE_BUDGET');
 return assets.map(a=>({...a,sha256:sha(Buffer.from(a.bodyBase64,'base64'))}));
}
export function openProposedV2EvidenceStore({directory,key,runId,sourceSha,proposalSha256,io=fs}){
 need(typeof key==='string'&&key.length>=16&&/^[A-Za-z0-9_-]{1,80}$/.test(runId||'')&&/^[a-f0-9]{40}$/.test(sourceSha||'')&&/^[a-f0-9]{64}$/.test(proposalSha256||''),'V2_SCOPE');
 safe(directory);io.mkdirSync(directory,{recursive:true,mode:0o700});const scope={runId,sourceSha,proposalSha256};
 const write=(file,bytes)=>{const fd=io.openSync(file,'wx',0o600);try{io.writeFileSync(fd,bytes);io.fsyncSync(fd);}finally{io.closeSync(fd);}};
 const read=(file,max)=>{safe(file);const s=io.lstatSync(file);need(s.isFile()&&!s.isSymbolicLink()&&s.size<=max,'V2_FILE');return io.readFileSync(file);};
 const scoped=(e,seq)=>need(JSON.stringify(e.context)===JSON.stringify(context(scope,seq)),'V2_CONTEXT');
 const snapshot=()=>{
  safe(directory);const names=io.readdirSync(directory);need(names.every(n=>n==='.writer-lock'||/^(checkpoint|ack)-\d{6}\.enc$/.test(n)),'V2_UNEXPECTED_FILE');
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
  return {scope,records,state,chain,total,pending,locked:names.includes('.writer-lock'),automaticResumeAuthorized:false,primaryAdmission:false};
 };
 const append=async(record,{guard,upload,timers={setTimeout,clearTimeout}}={})=>{
  need(guards.has(guard)&&typeof upload==='function','V2_PORTS');guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL});
  const before=snapshot();need(!before.locked&&!before.pending.length,'V2_UNCONFIRMED_OR_INTERRUPTED');need(before.records.length<41,'V2_FRAME_CAP');
  let lock=false;
  try{
   io.mkdirSync(path.join(directory,'.writer-lock'));lock=true;const current=snapshot();need(current.chain===before.chain&&!current.pending.length,'V2_CONCURRENT_ADVANCE');
   const sequence=current.records.length;need(record.sequence===sequence&&record.state?.frames?.length===sequence+1&&record.policyApproved===false&&record.primaryAdmission===false,'V2_RECORD_SCOPE');
   const payload={sequence,previous:current.chain,record,chain:sha(current.chain+JSON.stringify(record))},plain=Buffer.from(JSON.stringify(payload));need(plain.length<=V2_EVIDENCE_CAPS.plainBytes,'V2_PLAIN_BUDGET');
   const bytes=Buffer.from(JSON.stringify(sealResearch(plain,key,context(scope,sequence))));need(bytes.length<=V2_EVIDENCE_CAPS.sealedBytes&&current.total+bytes.length<=V2_EVIDENCE_CAPS.totalSealedBytes,'V2_TOTAL_BUDGET');
   guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL});const name='checkpoint-'+String(sequence).padStart(6,'0')+'.enc';write(path.join(directory,name),bytes);
   let timer,ack;try{ack=await Promise.race([upload({name,bytes,sha256:sha(bytes),sequence,scope}),new Promise((_,reject)=>{timer=timers.setTimeout(()=>reject(Error('V2_UPLOAD_TIMEOUT')),V2_EVIDENCE_CAPS.uploadMs);})]);}finally{timers.clearTimeout(timer);}
   guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL});
   need(ack?.confirmed===true&&ack.contentSha256===sha(bytes)&&Number.isSafeInteger(ack.artifactId)&&ack.artifactId>0,'V2_UPLOAD_UNCONFIRMED');
   const receipt={kind:'CLIENT_ACK_NOT_INDEPENDENT_REMOTE_VERIFICATION',sequence,checkpointSha256:sha(bytes),artifactId:ack.artifactId};
   write(path.join(directory,'ack-'+String(sequence).padStart(6,'0')+'.enc'),Buffer.from(JSON.stringify(sealResearch(Buffer.from(JSON.stringify(receipt)),key,context(scope,sequence)))));
   return {status:'ENCRYPTED_CHECKPOINT_CLIENT_ACKNOWLEDGED',sequence,checkpointSha256:sha(bytes),independentRemoteVerification:false,primaryAdmission:false};
  }finally{if(lock)try{io.rmdirSync(path.join(directory,'.writer-lock'));}catch{}}
 };
 return {snapshot,append,scope};
}
export async function processProposedV2Frame({store,sourceOptions,frame,guard,upload,timers}){
 need(guards.has(guard),'V2_GUARD_REQUIRED');guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL});
 const prior=store.snapshot();need(!prior.pending.length&&!prior.locked,'V2_UNCONFIRMED_OR_INTERRUPTED');
 const old=prior.state||{kind:'PROPOSED_V2_EVIDENCE_STATE_V1',sourceSha:store.scope.sourceSha,runId:store.scope.runId,frames:[],selection:null,pairs:[],ledger:[],assetIndex:{}};
 need(frame.sequence===old.frames.length&&sourceOptions.runId===old.runId&&sourceOptions.sourceSha===old.sourceSha,'V2_FRAME_SCOPE');
 need(readNativeRun({directory:sourceOptions.archiveDirectory,expectedRunId:sourceOptions.runId,expectedSourceSha:sourceOptions.sourceSha}).meta.provenance==='SYNTHETIC_FIXTURE','V2_LIVE_BINDING_NOT_IMPLEMENTED_OR_AUTHORIZED');
 const handle=prepareProposedV2Source({...sourceOptions,now:()=>frame.sourceHandoffAt}),assets=sourceAssets(sourceOptions,handle),deltas=[];
 for(const asset of assets){const priorHash=old.assetIndex[asset.name];need(!priorHash||priorHash===asset.sha256,'V2_IMMUTABLE_ASSET_CHANGED');if(!priorHash)deltas.push(asset);}
 guard.revalidate({mode:'PROPOSAL_ONLY',protocol:PROOF_READY_PROPOSAL});
 const proposed=proposeProofReadyFrame({sourceHandle:handle,frame,state:old.selection}),frames=[...old.frames,frame],pairs=[...old.pairs,...proposed.pairs],ledger=[...old.ledger,...proposed.ledger];
 const state={...old,frames,selection:proposed.state,pairs,ledger,assetIndex:{...old.assetIndex,...Object.fromEntries(assets.map(a=>[a.name,a.sha256]))}};
 const outcome=evaluateProposedV2Outcomes({frames,pairs,ledger,cutoffAt:frame.at});
 const record={sequence:frame.sequence,policyApproved:false,primaryAdmission:false,sourceHandle:handle,sourceAssets:deltas,state,outcome};
 const persisted=await store.append(record,{guard,upload,timers});return {...persisted,state,outcome,proposed,genuineAdmissions:0};
}
