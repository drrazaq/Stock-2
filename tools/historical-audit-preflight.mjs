// Credential-free preparation. No market-data transport; only the exact public
// same-ref Actions history read. No environment key lookup on import.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {hash,privateRead} from './historical-audit-custody.mjs';
import {preflight} from './historical-audit-invocation.mjs';import {singleHttpsRequest} from './historical-audit-wire.mjs';
export async function prepareControl({root,authorization,evidence,context,historyReader,now=Date.now(),profile='LIVE'}){
 if(authorization?.executionApproved!==true)throw Error('APPROVAL_REQUIRED');if(evidence?.status!=='OFFICIAL_APPLICABLE_REVIEWED')throw Error('EVIDENCE_REQUIRED');
 const manifest=JSON.parse(privateRead(path.join(root,'docs/historical-audit-invocation/source-manifest.json'),262144)),scope=JSON.parse(privateRead(path.join(root,'docs/intraday-audit-client/scope.proposed.json'),262144));const h=await historyReader();const history={...h,complete:h.total_count===h.workflow_runs?.length&&h.total_count<=100};preflight({root,scope,manifest,authorization,evidence,context,history,now,profile});const control=Buffer.from(JSON.stringify({authorization,evidence,history}));return {control,sha256:hash(control)};
}
export async function preflightMain(env=process.env){try{
 const root=fs.realpathSync(env.AUDIT_SOURCE_ROOT),a=privateRead(env.AUDIT_AUTHORIZATION_FILE,262144),e=privateRead(env.AUDIT_EVIDENCE_FILE,262144);if(hash(a)!==env.AUDIT_AUTHORIZATION_SHA256||hash(e)!==env.AUDIT_EVIDENCE_SHA256)throw Error('CONTROL_PIN');
 const context={repository:env.GITHUB_REPOSITORY,actor:env.GITHUB_ACTOR,repositoryPrivate:JSON.parse(privateRead(env.GITHUB_EVENT_PATH,262144)).repository?.private===true,event:env.GITHUB_EVENT_NAME,ref:env.GITHUB_REF,attempt:Number(env.GITHUB_RUN_ATTEMPT),workflowSHA:env.GITHUB_SHA,sourceSHA:env.AUDIT_SOURCE_SHA,runId:Number(env.GITHUB_RUN_ID)};
 const r=await prepareControl({root,authorization:JSON.parse(a),evidence:JSON.parse(e),context,historyReader:async()=>{const r=await singleHttpsRequest({url:'https://api.github.com/repos/'+encodeURIComponent(env.GITHUB_REPOSITORY.split('/')[0])+'/'+encodeURIComponent(env.GITHUB_REPOSITORY.split('/')[1])+'/actions/workflows/historical-audit-once.yml/runs?event=workflow_dispatch&branch=historical-audit-once-9751a2a0&per_page=100',headers:{'User-Agent':'Stock2HistoricalReadOnly','Accept':'application/vnd.github+json',...(env.GITHUB_TOKEN?{Authorization:'Bearer '+env.GITHUB_TOKEN}:{})},timeoutMs:10000,maxBytes:262144});if(r.status!==200)throw Error('HISTORY');return JSON.parse(r.body);}});
 fs.writeFileSync(env.AUDIT_CONTROL_FILE,r.control,{flag:'wx',mode:0o600});if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,'ready=true\ncontrol_sha256='+r.sha256+'\n');return 'READY';
 }catch{if(env.GITHUB_OUTPUT)fs.appendFileSync(env.GITHUB_OUTPUT,'ready=false\n');return 'BLOCKED';}}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const status=await preflightMain();console.log(status);process.exitCode=status==='READY'?0:3;}
