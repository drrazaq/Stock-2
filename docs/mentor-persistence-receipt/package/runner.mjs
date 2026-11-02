// Shipped CLI is inactive for real repositories. Adding credentials cannot enable it.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {ReceiptSession,observeExistingCycle,publishReceipt} from './receipt.mjs';
import {createGithubReadClient} from './github-read-client.mjs';
export async function runInactiveReceipt(config,{getCredentials=()=>{throw Error('NO_BINDING');}}={}){
 if(config?.mode!=='FIXTURE_REHEARSAL')return{status:'BLOCKED'};
 // A test cannot point this CLI at a production checkout merely by supplying a loopback API or credentials.
 try{
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(config.apiBase)||!path.isAbsolute(config.root))return{status:'ERROR'};
  const marker=path.join(config.root,'.receipt-fixture-only');const fd=fs.openSync(marker,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);let text;try{text=fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}if(text!=='SYNTHETIC_RECEIPT_FIXTURE_ONLY\n')return{status:'BLOCKED'};
  const origin=execFileSync('/usr/bin/git',['-C',config.root,'remote','get-url','origin'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:1000}).trim();if(!path.isAbsolute(origin)&&!origin.startsWith('file:///'))return{status:'BLOCKED'};
  const session=new ReceiptSession(config);await observeExistingCycle(session,{runExistingChild:async()=>{},saveExistingState:async()=>{}});
  const client=createGithubReadClient({repository:config.identity.repository,token:'synthetic-fixture-token',base:config.apiBase,fixture:true,...(config.fixtureLimits||{})});
  const result=await session.finalize(client);if(result.status!=='PASS')return result;return publishReceipt(config.outputDir,config.root,result);
 }catch{return{status:'ERROR'};}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let status='ERROR';try{let config={mode:'INACTIVE'};if(process.argv[2]==='--fixture'&&process.argv.length===4){const fd=fs.openSync(process.argv[3],fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const b=fs.readFileSync(fd);if(b.length>65536)throw Error('LIMIT');config=JSON.parse(b);}finally{fs.closeSync(fd);}}else if(process.argv.length!==2)throw Error('ARGUMENTS');status=(await runInactiveReceipt(config)).status;}catch{status='ERROR';}
 process.stdout.write(status+'\n');process.exitCode=status==='PASS'?0:status==='BLOCKED'?2:1;
}
