// Read-only recovery of actual-format downloaded ZIPs; no network or financial/state writes.
import {createHash} from 'node:crypto';import {openCaptureZip} from './capture-artifact.mjs';import {openResearch} from './tools/seal-research-artifact.mjs';
import {captureJson} from './capture-json.mjs';import {evaluateProposedV2Outcomes} from './sec-v2-outcomes.mjs';
import {validateNativeEvidenceAsset} from './native-sec-handoff.mjs';import {validateLineageBundle} from './native-sec-lineage-history.mjs';
const need=(x,c)=>{if(!x)throw Error(c);},sha=b=>createHash('sha256').update(b).digest('hex');
export function recoverInactiveV2Capture({receiptRaw,receiptSha256,expectedScope,archives,key}){
 need(typeof receiptRaw==='string'&&Buffer.byteLength(receiptRaw)<=65536&&sha(receiptRaw)===receiptSha256,'V2_RECOVERY_RECEIPT_PIN');const m=captureJson(receiptRaw);
 need(m.kind==='INACTIVE_V2_RECEIPTS_V1'&&JSON.stringify(m.scope)===JSON.stringify(expectedScope)&&m.primaryAdmission===false&&Array.isArray(m.receipts)&&m.receipts.length>0&&m.receipts.length<=41,'V2_RECOVERY_SCOPE');
 let chain='0'.repeat(64),total=0,state;const assets=new Map(),ids=new Set(),records=[];
 for(const [sequence,r]of m.receipts.entries()){
  need(r.sequence===sequence&&r.name==='checkpoint-'+String(sequence).padStart(6,'0')+'.enc'&&r.success===true&&r.retentionDays===3&&Number.isSafeInteger(r.artifactId)&&r.artifactId>0&&!ids.has(r.artifactId),'V2_RECOVERY_RECEIPT');ids.add(r.artifactId);
  const zip=archives.get(r.artifactId);need(Buffer.isBuffer(zip)&&zip.length===r.archiveBytes&&sha(zip)===r.archiveSha256,'V2_RECOVERY_ARCHIVE');total+=zip.length;need(total<=64*1024*1024,'V2_RECOVERY_BUDGET');
  const bytes=openCaptureZip(zip,r.name),env=captureJson(bytes.toString(),16*1024*1024);need(bytes.length===r.fileBytes&&sha(bytes)===r.fileSha256&&JSON.stringify(env.context)===JSON.stringify({kind:'PROPOSED_V2_ENCRYPTED_EVIDENCE_V1',...expectedScope,sequence,policyApproved:false,primaryAdmission:false}),'V2_RECOVERY_CONTEXT');
  const plain=openResearch(env,key);need(plain.length<=12*1024*1024,'V2_RECOVERY_PLAIN_BUDGET');const p=captureJson(plain.toString(),12*1024*1024),record=p.record;
  need(p.sequence===sequence&&p.previous===chain&&p.chain===sha(chain+JSON.stringify(record))&&record.sequence===sequence&&record.policyApproved===false&&record.primaryAdmission===false,'V2_RECOVERY_CHAIN');chain=p.chain;
  for(const a of record.sourceAssets){need(/^(native:|telemetry:|context:)/.test(a.name)&&!assets.has(a.name)&&sha(Buffer.from(a.bodyBase64,'base64'))===a.sha256,'V2_RECOVERY_SOURCE_BYTES');assets.set(a.name,a);}
  state=record.state;need(state.frames.length===sequence+1&&state.sourceSha===expectedScope.sourceSha&&state.runId===expectedScope.runId,'V2_RECOVERY_STATE');const {checksum,...body}=state.selection;need(checksum===sha(JSON.stringify(body))&&JSON.stringify(state.pairs)===JSON.stringify(state.selection.pairs),'V2_RECOVERY_SELECTION');
  need(records.every((old,i)=>JSON.stringify(old.state.frames)===JSON.stringify(state.frames.slice(0,i+1))),'V2_RECOVERY_FRAME_REWRITE');
  const outcome=evaluateProposedV2Outcomes({frames:state.frames,pairs:state.pairs,ledger:state.ledger,cutoffAt:state.frames.at(-1).at});need(JSON.stringify(outcome)===JSON.stringify(record.outcome),'V2_RECOVERY_OUTCOME');records.push(record);
 }
 const original=[...assets.values()],native=original.filter(a=>a.name.startsWith('native:')).map(a=>({name:a.name.slice(7),bodyBase64:a.bodyBase64})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
 need(native.length>0,'V2_RECOVERY_NATIVE_MISSING');const digest=sha(JSON.stringify(native)),handle=records.at(-1).sourceHandle;
 validateNativeEvidenceAsset({kind:'NATIVE_SEC_COMMITTED_PREFIX_V1',runId:expectedScope.runId,sourceSha:expectedScope.sourceSha,files:native,sha256:digest});need(digest===handle.nativePrefixSha256,'V2_RECOVERY_NATIVE_PREFIX');
 const telemetry=original.filter(a=>a.name.startsWith('telemetry:')).sort((a,b)=>a.name.localeCompare(b.name));let previous='0'.repeat(64),index=0;
 const meta=telemetry.find(a=>a.name==='telemetry:run.json');need(meta,'V2_RECOVERY_TELEMETRY_META');const info=captureJson(Buffer.from(meta.bodyBase64,'base64').toString());need(info.runId===expectedScope.runId&&info.sourceSha===expectedScope.sourceSha,'V2_RECOVERY_TELEMETRY_SCOPE');
 for(const a of telemetry.filter(a=>a.name!=='telemetry:run.json')){need(a.name==='telemetry:record-'+String(index).padStart(6,'0')+'.json','V2_RECOVERY_TELEMETRY_SEQUENCE');const {hash,...body}=captureJson(Buffer.from(a.bodyBase64,'base64').toString());need(body.sequence===index++&&body.previousHash===previous&&hash===sha(JSON.stringify(body)),'V2_RECOVERY_TELEMETRY_HASH');previous=hash;}
 need(previous===handle.telemetryLastHash,'V2_RECOVERY_TELEMETRY_PREFIX');
 for(const a of original.filter(a=>a.name.startsWith('context:parent-'))){const bundle=captureJson(Buffer.from(a.bodyBase64,'base64').toString(),12*1024*1024);validateLineageBundle(bundle,{runId:bundle.asset.runId,sourceSha:bundle.asset.sourceSha});}
 const contextComplete=['context:reference','context:reference-review','context:history','context:input-clocks'].every(n=>assets.has(n));
 return {status:records.length===41&&contextComplete?'AUTHENTICATED_COMPLETE_CAPTURE':'AUTHENTICATED_PARTIAL_CONTEXT',frames:records.length,state,records,sourceAssets:original,contextComplete,originalClocksPreserved:true,remoteBytesIndependentlyVerified:true,sourceAuthenticity:'NOT_ESTABLISHED_BY_ENCRYPTION',automaticResumeAuthorized:false,policyApproved:false,primaryAdmission:false,genuineAdmissions:0};
}
