import fs from 'node:fs';import {spawn} from 'node:child_process';
const W='<WORKTREE_118ED4C5>';const {bridgeFixture}=await import(W+'/test/helper-a-source-bridge.mjs');
const cleanups=[];const t={after:f=>cleanups.push(f)};const out={};
try{const x=bridgeFixture(t,{local:true});await x.ready();
 const cap=x.contexts.find(c=>c.role==='CAPTURE');const get=cap.client.get;let n=0,holder;
 cap.client.get=async item=>{const r=await get(item);n++;if(n===3){holder=spawn('flock',['-x',cap.directory+'/.a-writer.lock','sleep','2'],{stdio:'ignore'});await new Promise(z=>setTimeout(z,300));}return r;};
 const r1=await x.run();out.first={status:r1.status,reason:r1.reason};out.getsAfterFirst=x.calls.length;
 await new Promise(z=>holder.on('exit',z));
 x.reopen();cap.client.get=get;const r2=await x.run();out.retry={status:r2.status,reason:r2.reason};out.getsAfterRetry=x.calls.length;
 const files=fs.readdirSync(cap.directory);out.captureStoreRawFiles=files.filter(f=>f.startsWith('raw-')).length;
 out.thirdItemEnvelopeRetained=cap.store.lookup(cap.token,'ORIGINAL','A_SOURCE_PAIR:'+(await import(W+'/reclaim-research-workflow.mjs')).evidenceHash(x.plan)+':'+[...x.plan.items].sort((a,b)=>Date.parse(a.notBefore)-Date.parse(b.notBefore)||a.id.localeCompare(b.id))[1].id+':ENVELOPE').status;
}finally{for(const f of cleanups.reverse())try{await f();}catch{}}
console.log(JSON.stringify(out,null,1));
