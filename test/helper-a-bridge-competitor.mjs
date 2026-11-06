// SYNTHETIC process-race harness only. Config contains public lab receipts, never private keys.
import fs from 'node:fs';
import {createAFencedStore} from '../a-fenced-store.mjs';
import {createABoundedResponseClient,runAResponseBoundImport} from '../a-source-acquisition-bridge.mjs';
import {evidenceHash} from '../reclaim-research-workflow.mjs';
const config=JSON.parse(fs.readFileSync(process.argv[2])),actor=process.argv[3];
const wait=file=>{const end=Date.now()+5000;while(!fs.existsSync(file)){if(Date.now()>end)throw Error('SYNTHETIC_BARRIER_TIMEOUT');Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);}};
if(actor==='B')wait(config.barrier+'/A.ready');
const contexts=config.contexts.map(v=>{let active,now=Date.parse(config.plan.createdAt),seen=false;const store=createAFencedStore(v.directory),lookup=store.lookup,append=store.appendImport;
 if(v.role==='CAPTURE'){
  store.lookup=(token,kind,id)=>{const r=lookup(token,kind,id);if(!seen&&id.endsWith(':REQUEST')&&r.status==='NOT_COMMITTED'){seen=true;fs.writeFileSync(config.barrier+'/'+actor+'.ready','SYNTHETIC',{mode:0o600});wait(config.barrier+'/'+(actor==='A'?'B':'A')+'.ready');}return r;};
  store.appendImport=(...args)=>{if(args[3].endsWith(':REQUEST')&&seen){if(actor==='B')wait(config.barrier+'/A.committed');const r=append(...args);fs.writeFileSync(config.barrier+'/'+actor+'.committed','SYNTHETIC',{mode:0o600});if(actor==='A')wait(config.barrier+'/B.committed');seen=false;return r;}return append(...args);};
 }
 const native=createABoundedResponseClient({clock:()=>now,timers:{set:fn=>setTimeout(fn,3000),clear:clearTimeout},fetcher:async(url,options)=>{const r=await fetch(config.local+'/'+v.role+'/'+active.id,options);return {url,status:r.status,redirected:false,body:r.body};},limits:{requests:32,bodyBytes:65536,totalBytes:1048576,timeoutMs:1000}});
 return {...v,store,client:{now:native.now,stats:native.stats,get:item=>{active=item;now=Date.parse(item.notBefore);return native.get(item);}},signReceipt:body=>config.signatures[evidenceHash(body)]};
});
try{const r=await runAResponseBoundImport({store:createAFencedStore(config.evaluationDirectory),token:config.token,request:config.request,originalsDirectory:config.originalsDirectory,plan:config.plan,contexts});console.log(JSON.stringify({status:r.status,reason:r.reason||null,allowBuy:false}));}catch{console.log(JSON.stringify({status:'ERROR'}));process.exitCode=1;}
