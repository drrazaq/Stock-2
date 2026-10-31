// Candidate real-client interfaces. No global fetch or environment credential lookup.
import {immutableRead} from './paper-capture-wrapper.mjs';
import {providerPort,artifactPort} from './paper-capture-ports.mjs';
const need=(x,c)=>{if(!x)throw Error(c);};
export function boundedSnapshotClient({fetcher,keyId,secret}){
 const raw=providerPort({fetcher,keyId,secret});let calls=0;
 return {stats:()=>({requests:calls,retries:0}),async request(url,options){need(calls<41,'SNAPSHOT_REQUEST_BUDGET');calls++;return raw(url,options);}};
}
export function reviewedArtifactClient({sdk,reviewed}){
 // Binding is blocked until an independently reviewed, immutable SDK shim exists.
 // An opaque stock SDK or a client-supplied retry count is insufficient.
 need(sdk&&typeof sdk.uploadArtifact==='function'&&typeof sdk.installWireGate==='function'&&reviewed?.contract==='PRE_REQUEST_WIRE_GATE_V1'&&Number.isInteger(reviewed.maxWireRequestsPerUpload)&&reviewed.maxWireRequestsPerUpload>0&&reviewed.maxWireRequestsPerUpload<=8&&typeof reviewed.moduleFile==='string'&&immutableRead(reviewed.moduleFile,4*1024*1024).hash===reviewed.packageSha256,'ARTIFACT_PINNED_WIRE_GATE_REQUIRED');
 let uploads=0,wire=0,active=false,current=0;
 sdk.installWireGate(({retry,bytes})=>{need(active&&retry===0&&Number.isInteger(bytes)&&bytes>=0&&bytes<=16*1024*1024&&current<reviewed.maxWireRequestsPerUpload&&wire<41*reviewed.maxWireRequestsPerUpload,'ARTIFACT_PRE_REQUEST_BUDGET');current++;wire++;});
 const port=artifactPort({uploadArtifact:async(...args)=>{need(uploads<41&&!active,'ARTIFACT_CALL_BUDGET');need(immutableRead(reviewed.moduleFile,4*1024*1024).hash===reviewed.packageSha256,'ARTIFACT_CLIENT_CHANGED');uploads++;current=0;active=true;try{const result=await sdk.uploadArtifact(...args);need(current>0,'ARTIFACT_WIRE_GATE_UNUSED');return result;}finally{active=false;}}});
 return {upload:port,stats:()=>({uploads,wireRequests:wire,retries:0})};
}
