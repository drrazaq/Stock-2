// Inactive protected diagnostic runner: fixed output codes only; no live workflow installed.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
import {runSipDiagnostic,createBoundedSipRequest,validatePlan,waitDiagnosticStart,LIMITS,DIAGNOSTIC_TIMING} from '../sip-access-diagnostic.mjs';
import {createSingleAttemptHttpsRequest} from '../sip-access-https.mjs';
import {RESULT_EXITS,normalizeSipResult} from '../sip-access-result.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),hash=b=>createHash('sha256').update(b).digest('hex');
const controller=new AbortController(),interrupted=()=>controller.abort('INTERRUPTED');
process.once('SIGTERM',interrupted);process.once('SIGINT',interrupted);
const stop=code=>{throw Object.assign(Error(code),{code});};
let result='ERROR',fd,overallTimer,deadlineTimer;
const read=(f,code)=>{try{const s=fs.lstatSync(f);if(!s.isFile()||s.isSymbolicLink()||s.size>16384)stop(code);return fs.readFileSync(f);}catch{stop(code);}};
const sleep=ms=>new Promise((resolve,reject)=>{let timer;const cancel=()=>{clearTimeout(timer);reject(Object.assign(Error('ERROR_INTERRUPTED'),{code:controller.signal.reason==='DEADLINE'?'ERROR_DEADLINE':'ERROR_INTERRUPTED'}));};if(controller.signal.aborted)return cancel();controller.signal.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>{controller.signal.removeEventListener('abort',cancel);resolve();},ms);});
try{
 const env=process.env;
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_RUN_ATTEMPT!=='1'||env.GITHUB_REF_NAME!=='main'||env.GITHUB_WORKFLOW_REF!=='drrazaq/Stock-2/.github/workflows/sip-access-diagnostic.yml@refs/heads/main')stop('BLOCKED_CONTEXT');
 if(!/^[a-f0-9]{40}$/.test(env.SIP_APPROVED_SOURCE||''))stop('BLOCKED_SOURCE');
 const args=process.argv.slice(2);if(args.length!==3||args[0]!=='--approval')stop('BLOCKED_INPUT');
 let approval;try{approval=JSON.parse(read(args[1],'BLOCKED_APPROVAL'));}catch{stop('BLOCKED_APPROVAL');}
 const workflow=read(args[2],'BLOCKED_SOURCE');
 let codeSha;try{codeSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:3000}).trim();}catch{stop('BLOCKED_SOURCE');}
 if(approval.sourceSha!==env.SIP_APPROVED_SOURCE||codeSha!==approval.sourceSha||hash(workflow)!==approval.workflowSha256)stop('BLOCKED_SOURCE');
 const files=['sip-access-diagnostic.mjs','sip-access-result.mjs','sip-access-https.mjs','tools/run-sip-access-diagnostic.mjs','tools/validate-sip-access-result.mjs'];
 if(Object.keys(approval.sourceHashes||{}).sort().join(',')!==files.sort().join(','))stop('BLOCKED_SOURCE');
 for(const f of files)if(hash(read(path.join(root,f),'BLOCKED_SOURCE'))!==approval.sourceHashes[f])stop('BLOCKED_SOURCE');
 const planBytes=read(path.join(root,'docs/validation/sip-access-plan.proposed.json'),'BLOCKED_INPUT');
 if(hash(planBytes)!==approval.planSha256)stop('BLOCKED_INPUT');
 let plan,schedule;try{plan=JSON.parse(planBytes);schedule=validatePlan(plan);}catch{stop('BLOCKED_INPUT');}
 const at=Date.parse(approval.approvedAt),t0=schedule.t0;
 if(approval.granted!==true||approval.scope!=='SIP_ACCESS_SAMPLE_V1'||approval.existingBindingsOnly!==true||approval.sampledResponsesOnly!==true||typeof approval.approvedAt!=='string'||!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(approval.approvedAt)||!Number.isFinite(at)||new Date(at).toISOString().slice(0,10)!==approval.approvedAt.slice(0,10)||at>t0||t0-at>86400000)stop('BLOCKED_APPROVAL');
 // No credential property is read before the bounded window gate and wait.
 overallTimer=setTimeout(()=>controller.abort('DEADLINE'),DIAGNOSTIC_TIMING.runnerMs);
 try{await waitDiagnosticStart(plan,{now:()=>Date.now(),monotonic:()=>performance.now(),wait:sleep,signal:controller.signal});}
 catch(e){if(e.code==='START_TOO_EARLY')stop('BLOCKED_START_TOO_EARLY');if(e.code==='START_TOO_LATE')stop('BLOCKED_START_TOO_LATE');if(e.code==='CLOCK')stop('ERROR_CLOCK');if(controller.signal.aborted)stop(controller.signal.reason==='DEADLINE'?'ERROR_DEADLINE':'ERROR_INTERRUPTED');stop(e.code==='DEADLINE'?'ERROR_DEADLINE':'ERROR');}
 deadlineTimer=setTimeout(()=>controller.abort('DEADLINE'),Math.max(0,schedule.deadline-Date.now()));
 if(!env.ALPACA_KEY||!env.ALPACA_SECRET)stop('BLOCKED_BINDING');
 const out=path.join(env.RUNNER_TEMP||root,'sip-access-report.json');
 try{fd=fs.openSync(out,'wx',0o600);}catch(e){stop(e.code==='EEXIST'?'BLOCKED_EXISTING_REPORT':'ERROR_STORAGE');}
 const report=await runSipDiagnostic(plan,{approval,signal:controller.signal,now:()=>Date.now(),wait:sleep,request:createBoundedSipRequest({fetcher:createSingleAttemptHttpsRequest(),signal:controller.signal,headers:{'APCA-API-KEY-ID':env.ALPACA_KEY,'APCA-API-SECRET-KEY':env.ALPACA_SECRET}})});
 const payload=JSON.stringify(report)+'\n';if(Buffer.byteLength(payload)>LIMITS.reportBytes)stop('ERROR_STORAGE');
 try{fs.writeFileSync(fd,payload);fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;}catch{stop('ERROR_STORAGE');}
 const reason=report.reason;
 result=controller.signal.aborted?(controller.signal.reason==='DEADLINE'?'ERROR_DEADLINE':'ERROR_INTERRUPTED'):report.status==='COMPLETE_SAMPLED'?'PASS':reason==='CLOCK'?'ERROR_CLOCK':reason==='DEADLINE'?'ERROR_DEADLINE':reason==='INTERRUPTED'?'ERROR_INTERRUPTED':reason==='TIMEOUT'?'ERROR_TIMEOUT':['HTTP_401','HTTP_403','HTTP_429'].includes(reason)?'ERROR_'+reason:reason==='HTTP_ERROR'?'ERROR_HTTP_OTHER':['INVALID_JSON','SCHEMA_ERROR','INCOMPLETE_PAGE','TOO_LARGE'].includes(reason)?'ERROR_RESPONSE':'ERROR';
}catch(e){result=Object.hasOwn(RESULT_EXITS,e?.code)?e.code:controller.signal.aborted?(controller.signal.reason==='DEADLINE'?'ERROR_DEADLINE':'ERROR_INTERRUPTED'):'ERROR';}
finally{clearTimeout(overallTimer);clearTimeout(deadlineTimer);if(fd!==undefined)try{fs.closeSync(fd);}catch{}process.removeListener('SIGTERM',interrupted);process.removeListener('SIGINT',interrupted);}
const checked=normalizeSipResult(result+'\n',RESULT_EXITS[result]??1);console.log(checked.code);process.exitCode=checked.exitCode;
