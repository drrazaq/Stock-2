// Separate, UNINSTALLED V1 calibration binding. No CLI, env lookup, default
// fetch, logging or activation switch. Every external operation is explicit.
import fs from 'node:fs';
import path from 'node:path';
import {prepareApprovedCaptureGuard,runPreparedCapture,immutableRead} from './paper-capture-wrapper.mjs';
import {captureJson} from './capture-json.mjs';
import {sha} from './prospective-paper-capture.mjs';
import {historyPort} from './paper-capture-ports.mjs';
import {boundedSnapshotClient,reviewedArtifactClient} from './native-sec-bounded-clients.mjs';
import {createArtifactWireClient} from './artifact-wire-client.mjs';
import {createSameDayLineageClient,sameDayLineageEventPort,LINEAGE_STATES} from './native-sec-lineage-history.mjs';
import {sealResearch,openResearch} from './tools/seal-research-artifact.mjs';
export const APPROVED_BINDING_CAPS=Object.freeze({parentRequests:256,captureHistoryRequests:1,providerRequests:41,artifactWireRequests:205,retries:0,shutdownMarginMs:30000,storageBytes:400*1024*1024,lineagePlainBytes:12*1024*1024,lineageSealedBytes:16*1024*1024,sourceContextBytes:1024*1024});
export const APPROVED_CONTROL_LIMITS=Object.freeze({historyContract:'SESSION_EXECUTION_HISTORY_V2',parentRequests:256,parentReceivedBytes:67108864,parentTotalMs:120000,parentMaxInFlight:4});
const need=(v,c)=>{if(!v)throw Error(c);};
const defaultClock={now:()=>Date.now(),sleep:ms=>new Promise(r=>setTimeout(r,ms)),setTimeout:(f,ms)=>setTimeout(f,ms),clearTimeout:t=>clearTimeout(t)};
const validSecret=s=>typeof s==='string'&&s.length>=1&&s.length<=32768;
function storageBytes(root){let bytes=0,files=0;const walk=p=>{const s=fs.lstatSync(p);need(!s.isSymbolicLink(),'BINDING_STORAGE');if(s.isDirectory()){for(const n of fs.readdirSync(p)){need(++files<=4096,'BINDING_STORAGE');walk(path.join(p,n));}}else{need(s.isFile(),'BINDING_STORAGE');bytes+=s.size;need(bytes<=APPROVED_BINDING_CAPS.storageBytes,'BINDING_STORAGE');}};if(fs.existsSync(root))walk(root);return bytes;}
function safeDirectory(dir){for(let p=path.resolve(dir);;p=path.dirname(p)){if(fs.existsSync(p))need(!fs.lstatSync(p).isSymbolicLink(),'BINDING_STORAGE');if(path.dirname(p)===p)break;}fs.mkdirSync(dir,{recursive:true,mode:0o700});storageBytes(dir);}
function writeExclusive(file,bytes){const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const dir=fs.openSync(path.dirname(file),fs.constants.O_RDONLY);try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
function httpsOrigin(origin,suffix){const u=new URL(origin);return u.origin===origin&&u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname===suffix||u.hostname.endsWith('.'+suffix));}
// Concrete future host mapping for existing binding identifiers. Merely creating
// this adapter reads no environment values; keys are opened only by the guard.
// Callers supply the environment and native HTTP transport explicitly.
export function approvedEnvironmentClients({environment,fetcher}){
 need(environment&&typeof environment==='object'&&typeof fetcher==='function','BINDING_EXPLICIT_CLIENTS');
 return {transports:{history:fetcher,provider:fetcher,artifact:fetcher},openControlBindings:async()=>({githubToken:environment.GITHUB_TOKEN}),openCaptureBindings:async()=>({keyId:environment.ALPACA_KEY,secret:environment.ALPACA_SECRET,encryptionKey:environment.PRIVATE_KEY,runtimeToken:environment.ACTIONS_RUNTIME_TOKEN})};
}
export function prepareApprovedBinding(options){
 const {root,approvalFile,approvalSha256,entitlementFile,entitlementSha256,context,native,clock=defaultClock}=options;
 const approval=immutableRead(approvalFile,65536);need(approval.hash===approvalSha256,'BINDING_APPROVAL_PIN');const a=captureJson(approval.bytes.toString());
 need(a.bindingReview?.version===1&&a.bindingReview.approved===true&&a.bindingReview.continuityPolicyApproved===false&&a.bindingReview.protocol==='EXISTING_STREAM_SEC_30M_V1'&&a.bindingReview.primaryAdmission==='DISABLED_PENDING_CONTINUITY_REVIEW','BINDING_SEPARATE_REVIEW');
 need(immutableRead(entitlementFile,1024*1024).hash===entitlementSha256&&a.entitlements?.evidenceSha256===entitlementSha256,'BINDING_ENTITLEMENT_PIN');
 need(a.native?.sourceSha===native.expectedSourceSha&&/^[a-f0-9]{40}$/.test(native.expectedSourceSha)&&native.expectedRunId===context.runId+'-1'&&a.native.runId===native.expectedRunId&&a.native.directorySuffix==='runtime/native-sec-events/'+native.expectedRunId&&path.isAbsolute(native.directory)&&native.directory.endsWith(path.sep+a.native.directorySuffix)&&Object.keys(native).sort().join('|')==='directory|expectedRunId|expectedSourceSha'&&Number.isSafeInteger(a.native.workflowId)&&a.native.workflowId>0,'BINDING_NATIVE_SCOPE');
 need(a.controlLimits&&JSON.stringify(Object.entries(a.controlLimits).sort())===JSON.stringify(Object.entries(APPROVED_CONTROL_LIMITS).sort()),'BINDING_CONTROL_LIMITS');
 const s=a.artifactScope;need(s&&httpsOrigin(s.resultsOrigin,'actions.githubusercontent.com')&&Array.isArray(s.storageOrigins)&&s.storageOrigins.length>=1&&s.storageOrigins.length<=4&&new Set(s.storageOrigins).size===s.storageOrigins.length&&s.storageOrigins.every(x=>httpsOrigin(x,'blob.core.windows.net')),'BINDING_ARTIFACT_ORIGINS');
 const guard=prepareApprovedCaptureGuard({root,reviewRoot:options.reviewRoot,approvalFile,referenceFile:options.referenceFile,context,now:clock.now()}),workflow=immutableRead(path.join(options.reviewRoot,'.github/workflows/sec-paper-capture.yml'),65536),timeouts=[...workflow.bytes.toString().matchAll(/^ +timeout-minutes: ([0-9]+) *$/gm)];need(timeouts.length===1&&Number(timeouts[0][1])>=45&&Number(timeouts[0][1])<=360,'BINDING_WORKFLOW_TIME_BUDGET');const extra=immutableRead(entitlementFile,1024*1024);need(guard.approvalHash===approvalSha256&&extra.hash===entitlementSha256,'BINDING_INPUT_CHANGED');const revalidate=guard.revalidate;
 guard.revalidate=(requireHistory=true)=>{revalidate(requireHistory);const b=immutableRead(entitlementFile,1024*1024);need(b.hash===extra.hash&&b.signature===extra.signature,'BINDING_ENTITLEMENT_CHANGED');};
 guard.revalidate(false);
 const output=path.resolve(root,'runtime/paper-capture',context.runId+'-1');for(let p=path.dirname(output);;p=path.dirname(p)){if(fs.existsSync(p))need(!fs.lstatSync(p).isSymbolicLink(),'BINDING_STORAGE');if(path.dirname(p)===p)break;}storageBytes(path.dirname(output));need(!fs.existsSync(output)&&!fs.existsSync(output+'.lineage.enc'),'BINDING_ALREADY_STARTED');
 return {guard,output,approval:a};
}
// A caller cannot inject a prepared guard or substitute individual admission /
// provider/upload ports. Only transports, clock and separately opened bindings.
export async function runApprovedNativeCapture(options){
 try{options={...options,context:structuredClone(options?.context),native:structuredClone(options?.native)};if(options.clock!==undefined)need(options.clock&&['now','sleep','setTimeout','clearTimeout'].every(k=>typeof options.clock[k]==='function'),'BINDING_CLOCK_INTERFACE');}catch{return {status:'BLOCKED',reason:'PREFLIGHT_REJECTED',providerAttempts:0,confirmedUploads:0,genuineAdmissions:0};}
 const {clock=defaultClock,openControlBindings,openCaptureBindings,native}=options;const transports={...options.transports};
 let wire,deadlineTimer,phase='PREFLIGHT',guard,historyVerified=false,closed=false,lastTime,controller=new AbortController(),attempts=0,uploads=0;
 let rejectStop;const stopped=new Promise((_,reject)=>{rejectStop=reject;});stopped.catch(()=>{});
 const stop=()=>{closed=true;controller.abort();wire?.cancelActiveUpload();rejectStop(Error('BINDING_STOPPED'));};
 const race=promise=>Promise.race([Promise.resolve(promise),stopped]);
 const time=()=>{const n=clock.now();need(Number.isFinite(n)&&(lastTime===undefined||n>=lastTime),'BINDING_CLOCK');lastTime=n;return n;};
 try{
  const prepared=prepareApprovedBinding({...options,clock});({guard}=prepared);const a=prepared.approval;
  need(transports&&['history','provider','artifact'].every(k=>typeof transports[k]==='function')&&typeof openControlBindings==='function'&&typeof openCaptureBindings==='function','BINDING_EXPLICIT_CLIENTS');
  const start=Date.parse(a.plan.start),deadline=Date.parse(a.plan.end)+APPROVED_BINDING_CAPS.shutdownMarginMs;time();deadlineTimer=clock.setTimeout(stop,Math.max(0,deadline-time()));
  const checked=fetcher=>async(url,o)=>{guard.revalidate(historyVerified);storageBytes(path.dirname(prepared.output));need(!closed&&time()<=deadline,'BINDING_STOPPED');const signal=o.signal?AbortSignal.any([controller.signal,o.signal]):controller.signal;const r=await race(fetcher(url,{...o,signal}));guard.revalidate(historyVerified);need(!closed&&time()<=deadline,'BINDING_STOPPED');return r;};
  phase='CONTROL';const control=await race(openControlBindings());guard.revalidate(false);need(validSecret(control?.githubToken),'BINDING_CONTROL_BINDING');
  let historyTimer;try{const h=await race(Promise.race([historyPort({fetcher:checked(transports.history),token:control.githubToken})(),new Promise((_,reject)=>historyTimer=clock.setTimeout(()=>{stop();reject(Error('BINDING_HISTORY_TIMEOUT'));},10000))]));guard.verifyHistory(h);historyVerified=true;}finally{clock.clearTimeout(historyTimer);}
  const parents=createSameDayLineageClient({fetcher:checked(transports.history),token:control.githubToken,storageOrigins:a.artifactScope.storageOrigins,now:time});
  const lineage=await race(parents.discover({day:a.plan.day,before:new Date(time()).toISOString(),currentRunId:options.context.runId,workflowId:a.native.workflowId,allowedSourceShas:[a.native.sourceSha]}));
  guard.revalidate();need(!closed&&time()<=start,'BINDING_LATEST_START');
  phase='BINDINGS';const bindings=await race(openCaptureBindings());guard.revalidate();need(validSecret(bindings?.keyId)&&validSecret(bindings?.secret)&&validSecret(bindings?.runtimeToken)&&typeof bindings.encryptionKey==='string'&&bindings.encryptionKey.length>=16,'BINDING_CAPTURE_BINDINGS');
  safeDirectory(path.dirname(prepared.output));const lineageRaw=Buffer.from(JSON.stringify(lineage));need(lineageRaw.length<=APPROVED_BINDING_CAPS.lineagePlainBytes,'BINDING_LINEAGE_BUDGET');
  const lineageContext={kind:'APPROVED_CAPTURE_LINEAGE_RESEARCH_V1',sourceSha:a.plan.sourceSha,approvalSha256:options.approvalSha256,runId:options.context.runId,lineageSha256:sha(lineageRaw),primaryAdmission:false};
  const sealed=Buffer.from(JSON.stringify(sealResearch(lineageRaw,bindings.encryptionKey,lineageContext)));need(sealed.length<=APPROVED_BINDING_CAPS.lineageSealedBytes&&storageBytes(path.dirname(prepared.output))+sealed.length<=APPROVED_BINDING_CAPS.storageBytes,'BINDING_STORAGE');
  writeExclusive(prepared.output+'.lineage.enc',sealed);guard.revalidate();
  if(![LINEAGE_STATES.NONE,LINEAGE_STATES.EARLIER].includes(lineage.state))return {status:'BLOCKED',reason:'LINEAGE_UNKNOWN',providerAttempts:0,confirmedUploads:0,genuineAdmissions:0,lineagePreserved:true};
  const sourceContext={...lineage,retainedBundles:lineage.retainedBundles.map(r=>({runId:r.runId,artifactDigest:r.artifactDigest,coverage:r.coverage,sourceIntegrity:r.sourceIntegrity,sourceCaptureCompleteness:r.sourceCaptureCompleteness})),lineageJournalSha256:sha(sealed)};
  need(Buffer.byteLength(JSON.stringify(sourceContext))<=APPROVED_BINDING_CAPS.sourceContextBytes,'BINDING_LINEAGE_BUDGET');
  need(time()<=start,'BINDING_LATEST_START');const provider=boundedSnapshotClient({fetcher:checked(transports.provider),keyId:bindings.keyId,secret:bindings.secret});
  wire=createArtifactWireClient({fetcher:checked(transports.artifact),runtimeToken:bindings.runtimeToken,resultsOrigin:a.artifactScope.resultsOrigin,allowedResultsOrigins:[a.artifactScope.resultsOrigin],storageOrigins:a.artifactScope.storageOrigins,now:()=>new Date(time()).toISOString()});
  const uploader=reviewedArtifactClient({sdk:wire,reviewed:{contract:'PRE_REQUEST_WIRE_GATE_V1',maxWireRequestsPerUpload:5,moduleFile:path.join(options.root,'artifact-wire-client.mjs'),packageSha256:a.runtimeFiles['artifact-wire-client.mjs']}});
  const events=sameDayLineageEventPort({current:native,history:lineage});phase='CAPTURE';
  const result=await race(runPreparedCapture({approvalFile:options.approvalFile,context:options.context,output:prepared.output,key:bindings.encryptionKey,now:time,wait:ms=>race(clock.sleep(ms)),sourceContext,ports:{events:async x=>{guard.revalidate();need(!closed,'BINDING_STOPPED');return events(x);},provider:async(u,o)=>{need(!closed&&time()<=Date.parse(a.plan.end)-10000,'BINDING_STOPPED');attempts++;return provider.request(u,o);},upload:async x=>{storageBytes(path.dirname(prepared.output));need(!closed,'BINDING_STOPPED');const ack=await uploader.upload(x);uploads++;return ack;}}},guard));
  guard.revalidate();return {status:result.status,reason:result.captureStatus,providerAttempts:result.providerAttempts,confirmedUploads:result.confirmedUploads,pendingFiles:result.pendingFiles,genuineAdmissions:0,primaryAdmission:false,lineagePreserved:true,wireRequests:wire.stats().requests,parentRequests:parents.stats().requests};
 }catch{return {status:phase==='CAPTURE'?'INCOMPLETE':'BLOCKED',reason:closed?'DEADLINE_OR_CANCELLED':phase==='PREFLIGHT'?'PREFLIGHT_REJECTED':phase==='CONTROL'?'CONTROL_REJECTED':phase==='BINDINGS'?'BINDINGS_OR_PERSISTENCE_REJECTED':'CAPTURE_REJECTED',providerAttempts:attempts,confirmedUploads:uploads,genuineAdmissions:0};}
 finally{closed=true;controller.abort();wire?.cancelActiveUpload();clock.clearTimeout(deadlineTimer);}
}
export function recoverApprovedLineage({file,sha256,key,sourceSha,approvalSha256,runId}){
 const b=immutableRead(file,APPROVED_BINDING_CAPS.lineageSealedBytes);need(b.hash===sha256,'BINDING_RECOVERY_PIN');const e=captureJson(b.bytes.toString(),APPROVED_BINDING_CAPS.lineageSealedBytes),c=e.context;
 need(c?.kind==='APPROVED_CAPTURE_LINEAGE_RESEARCH_V1'&&c.sourceSha===sourceSha&&c.approvalSha256===approvalSha256&&c.runId===runId&&c.primaryAdmission===false,'BINDING_RECOVERY_SCOPE');const raw=openResearch(e,key);need(raw.length<=APPROVED_BINDING_CAPS.lineagePlainBytes&&sha(raw)===c.lineageSha256,'BINDING_RECOVERY_HASH');return {lineage:captureJson(raw.toString(),APPROVED_BINDING_CAPS.lineagePlainBytes),automaticResumeAuthorized:false,primaryAdmission:false};
}
