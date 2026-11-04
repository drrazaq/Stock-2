// A local Node20 action starts the pinned CLI and validates stdout WITH the real
// child exit/signal. Child stderr/provider text is never forwarded to public logs.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL} from 'node:url';
import {resultValid} from './historical-audit-invocation.mjs';
const error=()=>({publicResult:{status:'ERROR',reason:'INTERNAL_ERROR',counts:{providerRequests:0,responses:0}},exit:1});
export function launchAuditedChild(file,{env=process.env,deadlineMs=780000}={}){
 return new Promise(resolve=>{let bytes=0,stdout='',bad=false,done=false;const child=spawn(process.execPath,[file],{env,stdio:['ignore','pipe','pipe']});const timer=setTimeout(()=>{bad=true;child.kill('SIGTERM');},deadlineMs);const killer=setTimeout(()=>{bad=true;child.kill('SIGKILL');},deadlineMs+5000);const signal=()=>child.kill('SIGTERM');process.once('SIGTERM',signal);process.once('SIGINT',signal);
 const finish=r=>{if(done)return;done=true;clearTimeout(timer);clearTimeout(killer);process.removeListener('SIGTERM',signal);process.removeListener('SIGINT',signal);resolve(r);};
 child.stdout.on('data',b=>{bytes+=b.length;if(bytes>16384){bad=true;child.kill('SIGTERM');}else stdout+=b;});child.stderr.on('data',b=>{bytes+=b.length;if(bytes>16384){bad=true;child.kill('SIGTERM');}});child.on('error',()=>finish(error()));child.on('close',(code,signal)=>{let r;try{r=JSON.parse(stdout.trim());}catch{return finish(error());}finish(!bad&&!signal&&resultValid(r,code)?{publicResult:r,exit:code}:error());});
 });
}
export function verifyFinalizer(result,exit,outcome){return resultValid(result,exit)&&((exit===0&&outcome==='success')||(exit!==0&&outcome==='failure'));}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=await launchAuditedChild(path.join(path.dirname(process.argv[1]),'historical-audit-action.mjs'));if(process.env.AUDIT_RESULT_FILE)fs.writeFileSync(process.env.AUDIT_RESULT_FILE,JSON.stringify({result:r.publicResult,exit:r.exit}),{flag:'wx',mode:0o600});console.log(JSON.stringify(r.publicResult));process.exitCode=r.exit;}
