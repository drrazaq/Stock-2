// Live use requires a separately installed/manual approved workflow. No default run.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runC0Cycle,validateC0Approval,parseC0Json} from '../c0-diagnostic.mjs';
export const C0_FILES=['c0-diagnostic.mjs','tools/c0-diagnostic.mjs','market-session.mjs','market-symbol.mjs','tools/seal-research-artifact.mjs'];
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function read(file,max){const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>max)throw Error('INPUT_FILE_SCOPE_OR_BUDGET');return fs.readFileSync(file);}
async function main(){
 const args=process.argv.slice(2);
 if(args.length===3&&args[0]==='--fixture'){
  const x=parseC0Json(read(args[1],8*1024*1024).toString());let time=Date.parse(x.approval.start)+(x.offsetMs||0),calls=0;
  const result=await runC0Cycle({approval:x.approval,sourceSha:x.approval.sourceSha,directory:args[2],secret:process.env.C0_ARTIFACT_KEY,cycle:x.cycle||0,runId:'123',previousUploadConfirmed:x.previousUploadConfirmed===true,credentials:{alpacaKey:'synthetic',alpacaSecret:'synthetic',massiveKey:'synthetic'},now:()=>time,wait:async ms=>{time+=ms;},
   fetcher:async(u,o)=>{calls++;const url=new URL(u);if(o.method!=='GET'||o.redirect!=='error')throw Error('FIXTURE_METHOD');const kind=url.hostname==='api.github.com'?'run_guard':url.pathname==='/v2/assets'?'assets':url.pathname==='/v2/stocks/snapshots'?'sip':url.pathname==='/v2/snapshot/locale/us/markets/stocks/tickers'?'massive':null;if(!kind)throw Error('FIXTURE_UNEXPECTED_ENDPOINT');
    const data=kind==='run_guard'?{total_count:1,workflow_runs:[{id:123,run_attempt:1,event:'workflow_dispatch',head_branch:'Stock2-safety-fixes'}]}:kind==='assets'?x.assets:kind==='sip'?Object.fromEntries((url.searchParams.get('symbols')||'').split(',').filter(s=>Object.hasOwn(x.snapshots||{},s)).map(s=>[s,x.snapshots[s]])):x.delayed;
    return new Response(JSON.stringify(data),{status:x.failKind===kind?(x.httpStatus||503):200});}});
  console.log(JSON.stringify({...result,fixtureOnly:true,realProviderRequests:0,simulatedRequests:calls}));process.exitCode=result.status==='LOCAL_COLLECTION_COMPLETE'?0:1;return;
 }
 if(args.length!==6||args[0]!=='--collect-cycle')throw Error('EXPLICIT_APPROVED_MANUAL_WORKFLOW_REQUIRED');
 const [,rawCycle,approvalFile,output,workflowFile,sourceSha]=args,env=process.env;
 if(env.GITHUB_REPOSITORY!=='drrazaq/Stock-2'||env.GITHUB_REF_NAME!=='Stock2-safety-fixes'||env.GITHUB_EVENT_NAME!=='workflow_dispatch'||env.GITHUB_RUN_ATTEMPT!=='1'||env.GITHUB_WORKFLOW!=='Stock-2 C0 diagnostic (manual)'||!/^drrazaq\/Stock-2\/\.github\/workflows\/c0-diagnostic\.yml@refs\/heads\/Stock2-safety-fixes$/.test(env.GITHUB_WORKFLOW_REF||''))throw Error('LIVE_CONTEXT_REQUIRED');
 const a=parseC0Json(read(approvalFile,65536).toString());validateC0Approval(a,sourceSha);
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();if(head!==sourceSha)throw Error('RUNTIME_SOURCE_MISMATCH');
 if(!a.codeFiles||Object.keys(a.codeFiles).sort().join('|')!==[...C0_FILES].sort().join('|'))throw Error('RUNTIME_FILE_SCOPE_MISMATCH');
 for(const file of C0_FILES){const bytes=read(path.join(root,file),128*1024);if(createHash('sha256').update(bytes).digest('hex')!==a.codeFiles[file])throw Error('RUNTIME_BYTES_CHANGED');}
 if(path.resolve(workflowFile)!==path.resolve(root,'../review/.github/workflows/c0-diagnostic.yml')||createHash('sha256').update(read(workflowFile,65536)).digest('hex')!==a.workflowSha256)throw Error('WORKFLOW_BYTES_CHANGED');
 const cycle=Number(rawCycle);if(!/^[012]$/.test(rawCycle))throw Error('INVALID_CYCLE');
 const result=await runC0Cycle({approval:a,sourceSha,directory:output,secret:env.C0_ARTIFACT_KEY,cycle,runId:env.GITHUB_RUN_ID,previousUploadConfirmed:env.C0_PREVIOUS_UPLOAD_CONFIRMED==='true',credentials:{alpacaKey:env.ALPACA_KEY,alpacaSecret:env.ALPACA_SECRET,massiveKey:env.MASSIVE_KEY}});
 // Only aggregate status reaches logs; raw payloads and references remain encrypted.
 console.log(JSON.stringify(result));if(result.status!=='LOCAL_COLLECTION_COMPLETE')process.exitCode=1;
}
try{await main();}catch{console.error('C0 refused: approval/context/source/input/encryption/recovery validation failed; no provider credentials are displayed.');process.exitCode=1;}
