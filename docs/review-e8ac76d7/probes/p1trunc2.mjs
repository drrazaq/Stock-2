import fs from 'node:fs';import {spawn} from 'node:child_process';
const W='<WORKTREE_E8AC76D7>';const {bridgeFixture}=await import(W+'/test/helper-a-source-bridge.mjs');const {evidenceHash}=await import(W+'/reclaim-research-workflow.mjs');
const out={};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
for(const mode of ['truncate','delete']){const cleanups=[];const t={after:f=>cleanups.push(f)};try{const x=bridgeFixture(t,{local:true});await x.ready();
 const cap=x.contexts.find(c=>c.role==='CAPTURE'),get=cap.client.get;let n=0,h,third;const scope=evidenceHash(x.plan);
 cap.client.get=async item=>{const r=await get(item);n++;if(n===3){third=item;h=spawn('flock',['-x',cap.directory+'/.a-writer.lock','sleep','4'],{stdio:'ignore'});await sleep(200);}return r;};
 const r1=await x.run();await new Promise(z=>h.exitCode!==null?z():h.on('exit',z));
 const id='A_SOURCE_PAIR:'+scope+':'+third.id,p=cap.spoolDirectory+'/spool-'+evidenceHash({scope,id})+'.json',inStore=(await import(W+'/a-fenced-store.mjs')).createAFencedStore(cap.directory).lookup(cap.token,'ORIGINAL',id+':ENVELOPE').status;
 const b=fs.readFileSync(p);if(mode==='truncate')fs.writeFileSync(p,b.subarray(0,Math.floor(b.length/2)));else fs.unlinkSync(p);
 const g=x.calls.length;x.reopen();cap.client.get=get;const r2=await x.run();
 out[mode]={first:r1.reason,item3InStoreBefore:inStore,rerun:r2.status+'/'+(r2.reason||''),extraGets:x.calls.length-g,redialItem3:x.calls.slice(g).some(z=>z.role==='CAPTURE'&&z.id===third.id),spoolAfter:fs.existsSync(p)?(mode==='truncate'?(fs.readFileSync(p).length===Math.floor(b.length/2)?'UNCHANGED_TRUNCATED':'CHANGED'):'RECREATED'):'ABSENT'};
}finally{for(const f of cleanups.reverse())try{await f();}catch{}}}
console.log(JSON.stringify(out,null,1));
