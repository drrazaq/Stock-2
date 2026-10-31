// Inactive host wrapper. External operations are mandatory injected ports: no
// default network client, environment credentials or deployment entry point.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {captureJson} from './capture-json.mjs';
import {sha,validatePlan,checkpointCapture,recoverCapture,finishCapture} from './prospective-paper-capture.mjs';
import {runCalibration} from './prospective-capture-transport.mjs';
import {validateReferenceBundle} from './paper-capture-references.mjs';
import {sealResearch,openResearch} from './tools/seal-research-artifact.mjs';
import {openCaptureZip} from './capture-artifact.mjs';
export const WRAPPER_FILES=Object.freeze(['native-sec-events.mjs','edgar-feed.mjs','capture-json.mjs','capture-artifact.mjs','paper-capture-ports.mjs','paper-capture-references.mjs','paper-capture-wrapper.mjs','prospective-paper-capture.mjs','prospective-capture-transport.mjs','discovery-paper.mjs','market-session.mjs','tools/seal-research-artifact.mjs','tools/run-paper-capture-workflow.mjs','tools/recover-paper-capture.mjs']);
export const FIXED_UNIVERSE=Object.freeze(['AMD','INTC','NVDA','AMAT','LRCX','KLAC']);
export const WRAPPER_CAPS=Object.freeze({uploads:41,sealedBytes:160*1024*1024,archiveBytes:164*1024*1024,historyRows:100,referenceBytes:2*1024*1024});
export const APPROVAL_LIMITS=Object.freeze({providerAttempts:41,perMinute:2,inFlight:1,responseBytes:65536,totalResponseBytes:8388608,frames:41,symbols:6,uploadAttempts:41,sealedBytes:167772160,archiveBytes:171966464,retentionDays:3});
const ok=(x,c)=>{if(!x)throw Error(c);},hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const stamp=x=>typeof x==='string'&&/Z$/.test(x)&&Number.isFinite(Date.parse(x))?Date.parse(x):NaN;
export function immutableRead(file,max){
 const absolute=path.resolve(file);for(let p=absolute;;p=path.dirname(p)){if(fs.lstatSync(p).isSymbolicLink())throw Error('IMMUTABLE_SYMLINK');if(path.dirname(p)===p)break;}
 const fd=fs.openSync(absolute,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const before=fs.fstatSync(fd);ok(before.isFile()&&before.size<=max,'IMMUTABLE_TYPE_OR_BUDGET');const bytes=fs.readFileSync(fd),after=fs.fstatSync(fd),current=fs.lstatSync(file);ok(before.ino===after.ino&&before.size===after.size&&before.mtimeMs===after.mtimeMs&&current.ino===before.ino&&current.dev===before.dev&&bytes.length===before.size,'IMMUTABLE_READ_RACE');return {bytes,signature:JSON.stringify([before.dev,before.ino,before.size,before.mtimeMs,before.ctimeMs]),hash:sha(bytes)};}finally{fs.closeSync(fd);}
}
const git=(root,args)=>execFileSync('git',['--no-replace-objects','-c','protocol.allow=never',...args],{cwd:root,timeout:5000,maxBuffer:1024*1024,stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}}).toString().trim();
export function inputFingerprint(referenceSha256,plan){return sha(JSON.stringify({referenceSha256,rule:plan.rule,cohort:plan.cohort,day:plan.day,start:plan.start,end:plan.end,enrollmentEnd:plan.enrollmentEnd,universe:plan.universe}));}
export function prepareCaptureGuard({root,reviewRoot,approvalFile,referenceFile,context,history,now}){
 const snapshots=new Map(),remember=(f,max)=>{const s=immutableRead(f,max);snapshots.set(path.resolve(f),{...s,max});return s;};
 const approvalRead=remember(approvalFile,65536),a=captureJson(approvalRead.bytes.toString()),p=a.plan;
 ok(a.kind==='PAPER_CAPTURE_GUARDED_APPROVAL_V1'&&a.granted===true&&typeof a.ownerApprovalReference==='string'&&a.ownerApprovalReference.trim().length>0&&a.ownerApprovalReference.length<=200,'DATED_APPROVAL_REQUIRED');
 validatePlan(p);ok(a.limits&&Object.keys(a.limits).sort().join('|')===Object.keys(APPROVAL_LIMITS).sort().join('|')&&Object.entries(APPROVAL_LIMITS).every(([k,v])=>a.limits[k]===v),'EXACT_APPROVED_LIMITS');ok(p.cohort==='CALIBRATION'&&JSON.stringify(p.universe)===JSON.stringify(FIXED_UNIVERSE),'FIXED_CALIBRATION_ONLY');
 ok(a.feed==='sip'&&a.entitlements?.latestSip===true&&a.entitlements?.referenceRetention===true&&a.entitlements?.quoteBarAndConditionsReviewed===true&&hash(a.entitlements?.evidenceSha256)&&a.recoveryProofVerified===true,'OFFICIAL_RIGHTS_OR_RECOVERY_REQUIRED');
 ok(Number.isFinite(stamp(a.approvedAt))&&stamp(a.approvedAt)<=now&&stamp(a.approvedAt)<=Date.parse(p.start)&&Date.parse(p.start)-stamp(a.approvedAt)<=86400000&&a.expires===p.end&&now>=Date.parse(p.start)-10*60000&&now<=Date.parse(p.start),'APPROVAL_OR_START_WINDOW');
 ok(context.repository==='drrazaq/Stock-2'&&context.refName==='Stock2-safety-fixes'&&context.eventName==='workflow_dispatch'&&context.attempt===1&&context.actor==='drrazaq'&&context.workflowRef==='drrazaq/Stock-2/.github/workflows/sec-paper-capture.yml@refs/heads/Stock2-safety-fixes'&&context.permissions?.contents==='read'&&context.permissions?.actions==='read'&&Object.keys(context.permissions).length===2&&Number.isSafeInteger(context.runId)&&context.runId>0,'WORKFLOW_CONTEXT_OR_PERMISSIONS');
 ok(a.workflowCommitSha===context.workflowCommitSha&&git(reviewRoot,['rev-parse','HEAD'])===a.workflowCommitSha,'INSTALLED_WORKFLOW_HEAD');
 const wf=remember(path.join(reviewRoot,'.github/workflows/sec-paper-capture.yml'),65536);ok((wf.bytes.toString().match(/^[ \t]*permissions:/gm)||[]).length===1&&wf.bytes.toString().includes('permissions:\n  contents: read\n  actions: read\n')&&wf.bytes.toString().includes("PAPER_CAPTURE_EXECUTION: INACTIVE_OFFLINE_REHEARSAL")&&!wf.bytes.toString().includes('secrets.')&&wf.bytes.toString().includes('ref: '+p.sourceSha),'WORKFLOW_READ_ONLY_INACTIVE_GUARDS');ok(wf.hash===a.workflowSha256&&sha(execFileSync('git',['--no-replace-objects','-c','protocol.allow=never','show',a.workflowCommitSha+':.github/workflows/sec-paper-capture.yml'],{cwd:reviewRoot,timeout:5000,maxBuffer:65536,stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}}))===wf.hash,'INSTALLED_WORKFLOW_PIN');
 ok(git(root,['rev-parse','HEAD'])===p.sourceSha,'SOURCE_HEAD');
 ok(a.runtimeFiles&&Object.keys(a.runtimeFiles).sort().join('|')===[...WRAPPER_FILES].sort().join('|'),'COMPLETE_DEPENDENCY_SET');
 for(const file of WRAPPER_FILES){const s=remember(path.join(root,file),1024*1024);ok(s.hash===a.runtimeFiles[file],'RUNTIME_FILE_PIN');const blob=execFileSync('git',['--no-replace-objects','-c','protocol.allow=never','show',p.sourceSha+':'+file],{cwd:root,timeout:5000,maxBuffer:1024*1024,stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}});ok(sha(blob)===s.hash,'RUNTIME_GIT_BLOB_PIN');}
 const ref=remember(referenceFile,WRAPPER_CAPS.referenceBytes);ok(ref.hash===a.referenceSha256&&p.enrollmentManifestSha256===inputFingerprint(ref.hash,p),'INPUT_MANIFEST_PIN');
 const references=validateReferenceBundle(ref.bytes.toString(),a);references.inputIngestedAt=new Date(now).toISOString();for(const m of references.metadata){m.sourceCapturedAt=m.asOf;m.asOf=references.inputIngestedAt;}const initialHead=p.sourceSha,workflowHead=a.workflowCommitSha;let historyVerified=false;
 function verifyHistory(h){
 ok(h&&Number.isInteger(h.total_count)&&h.total_count>=1&&h.total_count<=100&&Array.isArray(h.workflow_runs)&&h.total_count===h.workflow_runs.length,'COMPLETE_RUN_HISTORY_REQUIRED');
 const window=h.workflow_runs.filter(r=>r.event==='workflow_dispatch'&&r.head_branch==='Stock2-safety-fixes'&&stamp(r.created_at)>=Date.parse(p.start)-86400000&&stamp(r.created_at)<=now);
 ok(window.length===1&&window[0].id===context.runId&&window[0].run_attempt===1&&window[0].head_sha===a.workflowCommitSha,'SINGLE_AUTHORIZED_ATTEMPT');
  historyVerified=true;revalidate();
 }
 function revalidate(requireHistory=true){
  ok(!requireHistory||historyVerified,'RUN_HISTORY_NOT_VERIFIED');
  ok(git(root,['rev-parse','HEAD'])===initialHead&&git(reviewRoot,['rev-parse','HEAD'])===workflowHead,'FINAL_HEAD_CHANGED');
  for(const [file,s]of snapshots){const current=immutableRead(file,s.max);ok(current.hash===s.hash&&current.signature===s.signature,'FINAL_DEPENDENCY_OR_INPUT_CHANGED');}
 }
 revalidate(false);if(history!==undefined)verifyHistory(history);return {verifyHistory,approval:a,approvalRaw:approvalRead.bytes.toString(),approvalHash:approvalRead.hash,references,context,revalidate};
}
function bounded(promise,ms=10000){let timer;return Promise.race([Promise.resolve(promise),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('PORT_TIMEOUT')),ms);})]).finally(()=>clearTimeout(timer));}
export async function runGuardedCapture({root,reviewRoot,approvalFile,referenceFile,context,output,key,now,wait,ports}){
 // No key operation or provider/upload call until unsecreted guard/provenance checks pass.
 const guard=prepareCaptureGuard({root,reviewRoot,approvalFile,referenceFile,context,now:now()});
 const history=await bounded(ports.history({maxRows:100,timeoutMs:10000}));guard.verifyHistory(history);
 ok(typeof key==='string'&&key.length>=16,'RESEARCH_ENCRYPTION_BINDING_REQUIRED');
 const absolute=path.resolve(output);for(let parent=path.dirname(absolute);;parent=path.dirname(parent)){ok(!fs.lstatSync(parent).isSymbolicLink(),'OUTPUT_PARENT_SYMLINK');if(path.dirname(parent)===parent)break;}ok(!fs.existsSync(absolute),'EXCLUSIVE_OUTPUT_REQUIRED');immutableRead(approvalFile,65536);fs.mkdirSync(absolute,{mode:0o700});
 const receipts=[],pending=[],eventBatches=[];let sealedBytes=0,archiveBytes=0,status='ERROR',failure='NONE';
 const a=guard.approval;
 const report=await runCalibration({plan:a.plan,now,wait,metadata:guard.references.metadata,
  readEvents:async at=>{guard.revalidate();const raw=await bounded(ports.events({at,maxBytes:131072,readOnly:true,identities:guard.references.metadata}));ok(typeof raw==='string'&&Buffer.byteLength(raw)<=131072,'EVENT_SOURCE_BUDGET');const doc=captureJson(raw);ok(Array.isArray(doc.events)&&doc.events.length<=20,'EVENT_SOURCE_SCHEMA');eventBatches.push({at,raw,sha256:sha(raw)});return doc.events;},
  transport:async(url,options)=>{guard.revalidate();return ports.provider(url,options);},
  persist:async state=>{try{
   const sequence=state.frames.length-1,name='checkpoint-'+String(sequence).padStart(3,'0')+'.enc';
   const contextTag={kind:'GUARDED_PAPER_CAPTURE_V1',sourceSha:a.plan.sourceSha,approvalHash:guard.approvalHash,referenceHash:guard.references.sha256,runId:context.runId,cohort:'CALIBRATION',sequence,chain:state.chain};
   const payload=Buffer.from(JSON.stringify({approvalRaw:guard.approvalRaw,referenceRaw:guard.references.raw,inputIngestedAt:guard.references.inputIngestedAt,eventBatches,state}));ok(payload.length<=8*1024*1024,'CHECKPOINT_PLAIN_BUDGET');
   const body=Buffer.from(JSON.stringify(sealResearch(payload,key,contextTag)));
   sealedBytes+=body.length;ok(body.length<=16*1024*1024&&sealedBytes<=WRAPPER_CAPS.sealedBytes&&receipts.length<41,'SEALED_UPLOAD_BUDGET');
   const file=path.join(absolute,name);fs.writeFileSync(file,body,{flag:'wx',mode:0o600});pending.push(name);guard.revalidate();
   const receipt=await bounded(ports.upload({name,file,bytes:body,sha256:sha(body),retentionDays:3,sequence,timeoutMs:10000}),8000);
   ok(receipt&&receipt.success===true&&Number.isSafeInteger(receipt.artifactId)&&receipt.artifactId>0&&!receipts.some(x=>x.artifactId===receipt.artifactId)&&hash(receipt.archiveSha256)&&receipt.fileSha256===sha(body)&&receipt.fileBytes===body.length&&receipt.retentionDays===3&&Number.isSafeInteger(receipt.archiveBytes)&&receipt.archiveBytes>0&&receipt.archiveBytes<=16*1024*1024,'UPLOAD_ACK_INVALID_OR_UNCERTAIN');
   archiveBytes+=receipt.archiveBytes;ok(archiveBytes<=WRAPPER_CAPS.archiveBytes,'ARCHIVE_STORAGE_BUDGET');
   ok(immutableRead(file,16*1024*1024).hash===sha(body),'SEALED_FILE_CHANGED_DURING_UPLOAD');
   receipts.push({success:true,artifactId:receipt.artifactId,archiveSha256:receipt.archiveSha256,archiveBytes:receipt.archiveBytes,fileSha256:receipt.fileSha256,fileBytes:receipt.fileBytes,retentionDays:3,name,sequence});pending.pop();
   fs.writeFileSync(path.join(absolute,'receipt-'+String(sequence).padStart(3,'0')+'.json'),JSON.stringify(receipts.at(-1)),{flag:'wx',mode:0o600});guard.revalidate();return true;
  }catch(e){failure=['CHECKPOINT_PLAIN_BUDGET','SEALED_UPLOAD_BUDGET','UPLOAD_ACK_INVALID_OR_UNCERTAIN','ARCHIVE_STORAGE_BUDGET','SEALED_FILE_CHANGED_DURING_UPLOAD','PORT_TIMEOUT'].includes(e.message)?e.message:'CHECKPOINT_EXTERNAL_OR_IO_ERROR';throw e;}}});
 try{guard.revalidate();status=report.status==='CAPTURE_COMPLETE'?'COMPLETE':'INCOMPLETE';}catch{status='BLOCKED';failure='IMMUTABLE_STATE_CHANGED';}
 const receiptManifest={version:1,sourceSha:a.plan.sourceSha,approvalHash:guard.approvalHash,runId:context.runId,cohort:'CALIBRATION',receipts};
 const receiptBytes=Buffer.from(JSON.stringify(receiptManifest));fs.writeFileSync(path.join(absolute,'receipts.json'),receiptBytes,{flag:'wx',mode:0o600});
 return {status,failure,captureStatus:report.status,providerAttempts:report.providerAttempts,confirmedUploads:receipts.length,pendingFiles:pending.length,sealedBytes,archiveBytes,receiptManifestSha256:sha(receiptBytes),receiptManifest,referenceDecisions:guard.references.reasons,simulationReport:report,genuineAdmissions:0};
}
export function recoverUploadedCapture({archives,receiptRaw,expectedReceiptSha256,expectedApprovalHash,expectedSourceSha,key}){
 ok(Buffer.byteLength(receiptRaw)<=65536&&sha(receiptRaw)===expectedReceiptSha256,'RECEIPT_MANIFEST_PIN');const m=captureJson(receiptRaw);
 ok(m.version===1&&m.sourceSha===expectedSourceSha&&m.approvalHash===expectedApprovalHash&&m.cohort==='CALIBRATION'&&Number.isSafeInteger(m.runId)&&m.runId>0&&Array.isArray(m.receipts)&&m.receipts.length>=1&&m.receipts.length<=41,'RECOVERY_MANIFEST_SCOPE');
 let total=0,last=null,lastPayload=null,previousChain='0'.repeat(64);const seen=new Set();
 for(let i=0;i<m.receipts.length;i++){
  const r=m.receipts[i],name='checkpoint-'+String(i).padStart(3,'0')+'.enc',zip=archives.get(r.artifactId);ok(r.sequence===i&&r.name===name&&!seen.has(r.artifactId)&&r.retentionDays===3&&r.success===true,'RECOVERY_ORDER_OR_RECEIPT');seen.add(r.artifactId);
  ok(Buffer.isBuffer(zip)&&zip.length===r.archiveBytes&&sha(zip)===r.archiveSha256,'DOWNLOADED_ARTIFACT_DIGEST');total+=zip.length;ok(total<=WRAPPER_CAPS.archiveBytes,'RECOVERY_ARCHIVE_BUDGET');
  const bytes=openCaptureZip(zip,name);ok(bytes.length===r.fileBytes&&sha(bytes)===r.fileSha256,'RECOVERY_FILE_PIN');const envelope=captureJson(bytes.toString()),c=envelope.context;
  ok(c?.kind==='GUARDED_PAPER_CAPTURE_V1'&&c.sourceSha===m.sourceSha&&c.approvalHash===m.approvalHash&&c.runId===m.runId&&c.cohort===m.cohort&&c.sequence===i,'RECOVERY_CONTEXT');
  const p=captureJson(openResearch(envelope,key).toString());ok(sha(p.approvalRaw)===m.approvalHash&&sha(p.referenceRaw)===c.referenceHash,'RECOVERY_INPUT_PIN');
  const a=captureJson(p.approvalRaw);validateReferenceBundle(p.referenceRaw,a);ok(a.plan.sourceSha===m.sourceSha&&a.plan.cohort==='CALIBRATION'&&a.plan.enrollmentManifestSha256===inputFingerprint(c.referenceHash,a.plan),'RECOVERY_PLAN');
  const state=recoverCapture(checkpointCapture(p.state,key),key,a.plan);ok(Number.isFinite(stamp(p.inputIngestedAt))&&stamp(p.inputIngestedAt)<=Date.parse(a.plan.start)&&state.frames.every(x=>x.frame.metadata.every(m=>m.asOf===p.inputIngestedAt&&stamp(m.sourceCapturedAt)<=stamp(m.asOf))),'RECOVERY_METADATA_INGESTION_CLOCK');ok(Array.isArray(p.eventBatches)&&p.eventBatches.length===state.frames.length&&p.eventBatches.every((b,j)=>sha(b.raw)===b.sha256&&JSON.stringify(captureJson(b.raw).events)===JSON.stringify(state.frames[j].frame.events)),'RECOVERY_EVENT_SOURCE_BYTES');ok(state.frames.length===i+1&&state.frames[i].previous===previousChain&&state.chain===c.chain,'RECOVERY_CONTIGUOUS_CHAIN');
  if(last)ok(JSON.stringify(state.frames.slice(0,-1))===JSON.stringify(last.frames),'RECOVERY_PREFIX_CHANGED');last=state;lastPayload=p;previousChain=state.chain;
 }
 return {status:last.frames.length===41?'AUTHENTICATED_COMPLETE':'AUTHENTICATED_INCOMPLETE',frames:last.frames.length,state:last,originalInputs:{approvalRaw:lastPayload.approvalRaw,referenceRaw:lastPayload.referenceRaw,eventBatches:lastPayload.eventBatches},report:finishCapture(last),genuineAdmissions:0,automaticResumeAuthorized:false};
}
