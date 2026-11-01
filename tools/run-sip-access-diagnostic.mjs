// INACTIVE guarded runner; no workflow is installed by this package. Never run with real credentials without separate authorization.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {runSipDiagnostic,createBoundedSipRequest,LIMITS} from '../sip-access-diagnostic.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const bad=()=>{throw Error('BLOCKED');};
let kill,reportFd;
try{
 const env=process.env;
 if(env.GITHUB_ACTIONS!=='true'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_RUN_ATTEMPT!=='1'||env.GITHUB_REF_NAME!=='main')bad();
 if(!/^drrazaq\/Stock-2\/\.github\/workflows\/sip-access-diagnostic\.yml@refs\/heads\/main$/.test(env.GITHUB_WORKFLOW_REF||''))bad();
 if(!/^[a-f0-9]{40}$/.test(env.SIP_APPROVED_SOURCE||''))bad();
 const args=process.argv.slice(2);if(args.length!==3||args[0]!=='--approval')bad();
 const readSmall=f=>{const st=fs.lstatSync(f);if(!st.isFile()||st.isSymbolicLink()||st.size>16384)bad();return fs.readFileSync(f);};
 const approval=JSON.parse(readSmall(args[1])),workflow=readSmall(args[2]);
 const codeSha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',timeout:3000}).trim();
 if(approval.granted!==true||approval.scope!=='SIP_ACCESS_SAMPLE_V1'||approval.sourceSha!==env.SIP_APPROVED_SOURCE||codeSha!==approval.sourceSha||hash(workflow)!==approval.workflowSha256)bad();
 const files=['sip-access-diagnostic.mjs','tools/run-sip-access-diagnostic.mjs'];
 if(Object.keys(approval.sourceHashes||{}).sort().join(',')!==files.sort().join(','))bad();
 for(const f of files)if(hash(readSmall(path.join(root,f)))!==approval.sourceHashes[f])bad();
 const planBytes=readSmall(path.join(root,'docs/validation/sip-access-plan.proposed.json'));
 if(hash(planBytes)!==approval.planSha256)bad();
 const plan=JSON.parse(planBytes),at=Date.parse(approval.approvedAt),t0=Date.parse(plan.t0);
 if(typeof approval.approvedAt!=='string'||!/^\d{4}-\d\d-\d\dT[0-2]\d:[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(approval.approvedAt)||!Number.isFinite(at)||new Date(at).toISOString().slice(0,10)!==approval.approvedAt.slice(0,10)||at>t0||t0-at>86400000||Date.now()<t0||Date.now()>t0+30000)bad();
 if(!env.ALPACA_KEY||!env.ALPACA_SECRET||approval.existingBindingsOnly!==true||approval.sampledResponsesOnly!==true)bad();
 const out=path.join(process.env.RUNNER_TEMP||root,'sip-access-report.json');
 reportFd=fs.openSync(out,'wx',0o600); // reserve output BEFORE transport; an existing/partial report is never silently overwritten
 // HTTP and this outer process bound are independent; no retries or collection resumption.
 kill=setTimeout(()=>process.exit(2),LIMITS.wallMs);
 const report=await runSipDiagnostic(plan,{approval,now:()=>Date.now(),wait:ms=>new Promise(resolve=>setTimeout(resolve,ms)),request:createBoundedSipRequest({fetcher:fetch,headers:{'APCA-API-KEY-ID':env.ALPACA_KEY,'APCA-API-SECRET-KEY':env.ALPACA_SECRET}})});
 const payload=JSON.stringify(report)+'\n';if(Buffer.byteLength(payload)>LIMITS.reportBytes)bad();
 fs.writeFileSync(reportFd,payload);fs.fsyncSync(reportFd);fs.closeSync(reportFd);reportFd=undefined;
 console.log(report.status==='COMPLETE_SAMPLED'?'COMPLETE_SAMPLED':'STOPPED');
 if(report.status!=='COMPLETE_SAMPLED')process.exitCode=2;
}catch{console.log('BLOCKED_OR_ERROR');process.exitCode=2;}finally{clearTimeout(kill);if(reportFd!==undefined)try{fs.closeSync(reportFd);}catch{}}
