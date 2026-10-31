// Candidate real-client interfaces. No global fetch or environment credential lookup.
import path from 'node:path';
import {captureJson} from './capture-json.mjs';
import {immutableRead} from './paper-capture-wrapper.mjs';
import {providerPort,artifactPort} from './paper-capture-ports.mjs';
const need=(x,c)=>{if(!x)throw Error(c);};
export function boundedSnapshotClient({fetcher,keyId,secret}){
 const raw=providerPort({fetcher,keyId,secret});let calls=0;
 return {stats:()=>({requests:calls,retries:0}),async request(url,options){need(calls<41,'SNAPSHOT_REQUEST_BUDGET');calls++;return raw(url,options);}};
}
function gatedSdk({sdk,reviewed,uploadTimeoutMs=7000},maximumUploads){
 // Binding is blocked until an independently reviewed, immutable SDK shim exists.
 // An opaque stock SDK or a client-supplied retry count is insufficient.
 need(sdk&&typeof sdk.uploadArtifact==='function'&&typeof sdk.installWireGate==='function'&&reviewed?.contract==='PRE_REQUEST_WIRE_GATE_V1'&&Number.isInteger(reviewed.maxWireRequestsPerUpload)&&reviewed.maxWireRequestsPerUpload>0&&reviewed.maxWireRequestsPerUpload<=8&&typeof reviewed.moduleFile==='string'&&immutableRead(reviewed.moduleFile,4*1024*1024).hash===reviewed.packageSha256,'ARTIFACT_PINNED_WIRE_GATE_REQUIRED');
 need(Number.isInteger(uploadTimeoutMs)&&uploadTimeoutMs>0&&uploadTimeoutMs<=7000,'ARTIFACT_TIMEOUT_SCOPE');let uploads=0,wire=0,active=false,current=0,deadline=0;
 sdk.installWireGate(({retry,bytes})=>{need(active&&Date.now()<=deadline&&retry===0&&Number.isInteger(bytes)&&bytes>=0&&bytes<=16*1024*1024&&current<reviewed.maxWireRequestsPerUpload&&wire<maximumUploads*reviewed.maxWireRequestsPerUpload,'ARTIFACT_PRE_REQUEST_BUDGET');current++;wire++;});
 const perform=async(...args)=>{need(uploads<maximumUploads&&!active,'ARTIFACT_CALL_BUDGET');need(immutableRead(reviewed.moduleFile,4*1024*1024).hash===reviewed.packageSha256,'ARTIFACT_CLIENT_CHANGED');uploads++;current=0;active=true;deadline=Date.now()+uploadTimeoutMs;let timer;try{const result=await Promise.race([Promise.resolve().then(()=>sdk.uploadArtifact(...args)),new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('ARTIFACT_UPLOAD_TIMEOUT')),uploadTimeoutMs))]);need(current>0,'ARTIFACT_WIRE_GATE_UNUSED');need(immutableRead(reviewed.moduleFile,4*1024*1024).hash===reviewed.packageSha256,'ARTIFACT_CLIENT_CHANGED');return result;}finally{clearTimeout(timer);active=false;}};
 return {perform,stats:()=>({uploads,wireRequests:wire,retries:0})};
}

export function reviewedArtifactClient(options){const gate=gatedSdk(options,41);return {upload:artifactPort({uploadArtifact:gate.perform}),stats:gate.stats};}
export function reviewedNativeRunPublisher(options){const gate=gatedSdk(options,1);return {stats:gate.stats,async upload({file,expectedRunId,expectedSourceSha}){
 need(path.basename(file)==='native-sec-run.json','NATIVE_PUBLISH_NAME');const original=immutableRead(file,12*1024*1024),bundle=captureJson(original.bytes.toString());if(options.bundleVersion===2){const {validateLineageBundle}=await import('./native-sec-lineage-history.mjs');validateLineageBundle(bundle,{runId:expectedRunId,sourceSha:expectedSourceSha});}else{const {validateCompleteNativeBundle}=await import('./native-sec-parent-client.mjs');validateCompleteNativeBundle(bundle,{expectedRunId,expectedSourceSha});}
 const r=await gate.perform(options.bundleVersion===2?'native-sec-available-run-v2':'native-sec-complete-run-v1',[file],path.dirname(file),{retentionDays:7});need(immutableRead(file,12*1024*1024).hash===original.hash,'NATIVE_PUBLISH_MUTATED');need(Number.isSafeInteger(r.id)&&r.id>0&&Number.isInteger(r.size)&&r.size>0&&r.size<=16*1024*1024&&/^[a-f0-9]{64}$/.test(r.digest||''),'NATIVE_PUBLISH_ACK_UNKNOWN');return {artifactId:r.id,archiveSha256:r.digest,archiveBytes:r.size,fileSha256:original.hash,retentionDays:7,globalHistoryEstablished:false};
 }};}
