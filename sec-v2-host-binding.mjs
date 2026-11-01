// INACTIVE integration: no environment discovery, default transport, workflow or live mode.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {immutableRead,FIXED_UNIVERSE} from './paper-capture-wrapper.mjs';
import {captureJson} from './capture-json.mjs';import {validateReferenceBundle} from './paper-capture-references.mjs';
import {boundedSnapshotClient,reviewedArtifactClient} from './native-sec-bounded-clients.mjs';
import {createArtifactWireClient} from './artifact-wire-client.mjs';import {frameFromSnapshots} from './prospective-paper-capture.mjs';
import {createOfflineV2EvidenceGuard,openProposedV2EvidenceStore,processProposedV2Frame,V2_GUARD_FILES} from './sec-v2-evidence.mjs';
import {startColocatedNativeHost} from './native-sec-colocated-host.mjs';
export const V2_HOST_FILES=Object.freeze([...new Set([...V2_GUARD_FILES,'sec-v2-host-binding.mjs','sec-v2-recovery.mjs','tools/native-sec-v2-capture-worker.mjs','native-sec-colocated-host.mjs','native-sec-host-schedule.mjs','paper-capture-references.mjs'])]);
const need=(x,c)=>{if(!x)throw Error(c);},sha=b=>createHash('sha256').update(b).digest('hex');
export function startInactiveV2Host(options){
 need(options.mode==='INACTIVE_SYNTHETIC_REHEARSAL'&&options.capture?.entry==='tools/native-sec-v2-capture-worker.mjs','V2_HOST_INACTIVE_SCOPE');
 // Reuse only the unchanged calibration transport window/lifecycle, not V1 enrollment or evaluator.
 return startColocatedNativeHost(options);
}
export function prepareInactiveV2Binding(c,{inputFile,inputSha256,historyFile,historySha256}){
 need(c.mode==='INACTIVE_SYNTHETIC_REHEARSAL'&&c.policyApproved===false&&c.protocol==='SEC_PROOF_READY_V2_DRAFT3_REVIEW_ONLY','V2_BINDING_SCOPE');
 for(const target of [c.output,c.receiptDirectory,c.resultFile]){need(path.isAbsolute(target)&&path.resolve(target).startsWith(path.resolve(c.storageRoot)+path.sep),'V2_BINDING_STORAGE_SCOPE');for(let p=path.dirname(target);;p=path.dirname(p)){if(fs.existsSync(p))need(!fs.lstatSync(p).isSymbolicLink(),'V2_BINDING_STORAGE_SYMLINK');if(path.dirname(p)===p)break;}}
 const inputs=new Map(),pin=(file,digest,max=1048576)=>{const p=immutableRead(file,max);need(p.hash===digest,'V2_BINDING_INPUT_PIN');inputs.set(file,{...p,max});return p.bytes;};
 pin(inputFile,inputSha256);const referenceRaw=pin(c.reference.file,c.reference.sha256,2*1024*1024).toString(),references=captureJson(referenceRaw);
 need(references.records.every(r=>['massive','alpaca','sec'].every(k=>captureJson(r[k].raw).synthetic===true)),'V2_BINDING_SYNTHETIC_REFERENCE_REQUIRED');
 const checked=validateReferenceBundle(referenceRaw,c.reference.review),contextAssets=[{name:'context:reference',bytes:Buffer.from(referenceRaw)},{name:'context:reference-review',bytes:Buffer.from(JSON.stringify(c.reference.review))}];
 const history=captureJson(pin(historyFile,historySha256).toString());contextAssets.push({name:'context:history',bytes:inputs.get(historyFile).bytes});
 for(const [i,row]of (history.retainedBundles||[]).entries()){const bytes=pin(row.bundleFile,row.bundleSha256,12*1024*1024);contextAssets.push({name:'context:parent-'+i,bytes});}
 const sources=Object.fromEntries(V2_HOST_FILES.map(name=>{need(c.sourcePins?.[name],'V2_BINDING_CLOSURE_PIN');return[name,c.sourcePins[name]];}));const inner=createOfflineV2EvidenceGuard({root:c.root,sourcePins:sources});
 pin(c.bindingModule.file,c.bindingModule.sha256);for(const [name,digest]of Object.entries(c.bindingModule.runtimeFiles||{})){need(!path.isAbsolute(name)&&!name.split('/').includes('..'),'V2_BINDING_MODULE_DEPENDENCY');pin(path.join(c.root,name),digest,4*1024*1024);}const referenceIngestedAt=null;

 need(c.plan.universe?.join(',')===FIXED_UNIVERSE.join(',')&&c.native.runId&&c.native.sourceSha,'V2_BINDING_PLAN');
 const revalidate=()=>{inner.revalidate({mode:'PROPOSAL_ONLY',protocol:c.protocol});for(const [file,p]of inputs){const b=immutableRead(file,p.max);need(b.hash===p.hash&&b.signature===p.signature,'V2_BINDING_INPUT_CHANGED');}};
 const metadata=checked.metadata.map(r=>{return {...r,sic:r.industry,commonStock:r.instrumentType==='CS'&&r.eligibility==='ELIGIBLE_REQUIRES_SOURCE_AUDIT',asOf:referenceIngestedAt,sourceCapturedAt:r.asOf};});
 revalidate();return {guard:inner,revalidate,history,metadata,contextAssets,referenceIngestedAt};
}
export async function runInactiveV2Capture(c,prepared,bindings){
 need(bindings&&['provider','artifact'].every(k=>typeof bindings.transports?.[k]==='function')&&typeof bindings.now==='function'&&typeof bindings.wait==='function','V2_BINDING_EXPLICIT_CLIENTS');
 const b=prepared,clock=bindings.now,start=Date.parse(c.plan.start),end=Date.parse(c.plan.end);let last=clock(),providerAttempts=0,responseBytes=0,wire,store,reason='NONE',status='INCOMPLETE';const receipts=[];
 const time=()=>{const n=clock();need(Number.isFinite(n)&&n>=last&&n<=end+30000,'V2_BINDING_CLOCK');last=n;return n;};
 const outside=()=>{b.revalidate();need(time()<=end,'V2_BINDING_DEADLINE');};
 // UNKNOWN and earlier-run policy are blocked, without quote requests or key usage.
 if(b.history.state!=='VERIFIED_NO_EARLIER_SAME_DAY_RUN'||b.history.historyVerified!==true||b.history.jobHistoryVerified!==true||b.history.lookupStatus!=='COMPLETE')return {status:'BLOCKED',reason:'HISTORY_NOT_ELIGIBLE',providerAttempts:0,confirmedUploads:0,genuineAdmissions:0};
 need(time()>=start-30000&&time()<=start-10000,'V2_BINDING_START_WINDOW');outside();
 const ingestedAt=new Date(time()).toISOString(),metadata=b.metadata.map(r=>{need(Date.parse(r.sourceCapturedAt)<=time(),'V2_BINDING_REFERENCE_FUTURE');return {...r,asOf:ingestedAt};});b.contextAssets.push({name:'context:input-clocks',bytes:Buffer.from(JSON.stringify({referenceIngestedAt:ingestedAt,referenceSha256:c.reference.sha256}))});
 const checked=fetcher=>async(...args)=>{outside();const value=await fetcher(...args);outside();return value;};
 const provider=boundedSnapshotClient({fetcher:checked(bindings.transports.provider),keyId:bindings.keyId,secret:bindings.secret});
 wire=createArtifactWireClient({fetcher:checked(bindings.transports.artifact),runtimeToken:bindings.runtimeToken,resultsOrigin:c.artifact.resultsOrigin,allowedResultsOrigins:[c.artifact.resultsOrigin],storageOrigins:c.artifact.storageOrigins,now:()=>new Date(time()).toISOString()});
 const uploader=reviewedArtifactClient({sdk:wire,reviewed:{moduleFile:path.join(c.root,'artifact-wire-client.mjs'),packageSha256:c.sourcePins['artifact-wire-client.mjs'],contract:'PRE_REQUEST_WIRE_GATE_V1',maxWireRequestsPerUpload:5}});
 store=openProposedV2EvidenceStore({directory:c.output,key:bindings.encryptionKey,runId:c.native.runId,sourceSha:c.native.sourceSha,proposalSha256:c.proposalSha256,plan:c.plan});
 const initial=store.snapshot();need(initial.records.length===0&&!initial.observing&&!initial.locked&&!initial.observationUnknown,'V2_BINDING_NO_AUTOMATIC_RESUME');
 const upload=async x=>{outside();const file=path.join(c.output,x.name),ack=await uploader.upload({...x,file,retentionDays:3});outside();need(ack.success===true&&ack.fileSha256===x.sha256&&Number.isSafeInteger(ack.artifactId)&&ack.artifactId>0&&!receipts.some(r=>r.artifactId===ack.artifactId)&&ack.archiveBytes>0&&ack.archiveBytes<=16*1024*1024&&/^[a-f0-9]{64}$/.test(ack.archiveSha256),'V2_BINDING_ACK');
  const receipt={sequence:x.sequence,name:x.name,...ack};need(receipts.reduce((n,r)=>n+r.archiveBytes,0)+ack.archiveBytes<=64*1024*1024,'V2_BINDING_ARCHIVE_BUDGET');const raw=JSON.stringify(receipt),target=path.join(c.receiptDirectory,'receipt-'+String(x.sequence).padStart(6,'0')+'.json');const fd=fs.openSync(target,'wx',0o600);try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}receipts.push(receipt);return {confirmed:true,contentSha256:x.sha256,artifactId:ack.artifactId};};
 fs.mkdirSync(c.receiptDirectory,{recursive:true,mode:0o700});let result;
 try{for(let sequence=0;sequence<41;sequence++){
  const due=sequence===40?end-10000:start+sequence*60000;if(time()<due)await bindings.wait(due-time());outside();need(time()<=due+10000,'V2_BINDING_SLOT_EXPIRED');
  result=await processProposedV2Frame({store,sourceOptions:{...c.native,history:{state:b.history.state,scope:'MAIN_PRODUCER_SAME_DAY'},contextAssets:b.contextAssets},now:()=>new Date(time()).toISOString(),guard:b.guard,upload,observeFrame:async info=>{
   outside();const requestedAt=new Date(time()).toISOString();providerAttempts++;const controller=new AbortController();let timer;
   try{const raw=await Promise.race([(async()=>{const r=await provider.request('https://data.alpaca.markets/v2/stocks/snapshots?symbols='+c.plan.universe.join(',')+'&feed=sip',{method:'GET',redirect:'error',signal:controller.signal});need(r.status===200,r.status===429?'V2_BINDING_RATE_LIMIT':'V2_BINDING_PROVIDER');const parts=[];let size=0;const reader=r.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;responseBytes+=value.byteLength;need(size<=65536&&responseBytes<=8388608,'V2_BINDING_RESPONSE_BUDGET');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}return Buffer.concat(parts).toString();})(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('V2_BINDING_REQUEST_TIMEOUT'));},10000);})]);outside();return frameFromSnapshots({sequence,requestedAt,receivedAt:new Date(time()).toISOString(),sourceHandoffAt:info.sourceHandoffAt,rawResponse:raw,metadata,universe:c.plan.universe,priorFrames:store.snapshot().state?.frames||[]});}finally{clearTimeout(timer);controller.abort();}
  }});outside();}status='COMPLETE';
 }catch(e){reason=/^(V2_|PROPOSAL_|TELEMETRY_|ARTIFACT_|SNAPSHOT_)[A-Z_]+$/.test(e.message)?e.message:'V2_BINDING_FAILED';}
 finally{wire.cancelActiveUpload();}
 const manifest={kind:'INACTIVE_V2_RECEIPTS_V1',scope:store.scope,receipts,primaryAdmission:false},raw=JSON.stringify(manifest);const fd=fs.openSync(path.join(c.receiptDirectory,'manifest.json'),'wx',0o600);try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 return {status,reason,providerAttempts,responseBytes,confirmedUploads:receipts.length,wireRequests:wire.stats().requests,receiptManifestSha256:sha(raw),receiptManifest:manifest,outcome:result?.outcome||null,genuineAdmissions:0,primaryAdmission:false,automaticResumeAuthorized:false};
}
