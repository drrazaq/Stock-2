import fs from 'node:fs';import {spawn} from 'node:child_process';
const W='<WORKTREE_E8AC76D7>';const {bridgeFixture}=await import(W+'/test/helper-a-source-bridge.mjs');const {evidenceHash}=await import(W+'/reclaim-research-workflow.mjs');const {createAFencedStore}=await import(W+'/a-fenced-store.mjs');
const out={};const sleep=ms=>new Promise(r=>setTimeout(r,ms));const cleanups=[];const t={after:f=>cleanups.push(f)};
try{const x=bridgeFixture(t,{local:true});await x.ready();const cap=x.contexts.find(c=>c.role==='CAPTURE'),get=cap.client.get;let n=0,h,third;const scope=evidenceHash(x.plan);
 cap.client.get=async item=>{const r=await get(item);n++;if(n===3){third=item;h=spawn('flock',['-x',cap.directory+'/.a-writer.lock','sleep','4'],{stdio:'ignore'});await sleep(200);}return r;};
 const r1=await x.run();await new Promise(z=>h.exitCode!==null?z():h.on('exit',z));
 const st=createAFencedStore(cap.directory);out.headBefore=st.head().head.generation;
 const claimed=(()=>{try{return st.claim({expectedToken:cap.token,owner:'SYNTHETIC_TAKEOVER',at:'2026-11-03T00:00:00Z',boundaryEvidenceHash:'c'.repeat(64)});}catch(e){return {err:e.message};}})();
 out.claim=claimed.err||('generation '+claimed.head.generation);
 if(!claimed.err){cap.token=claimed.token;}
 const g=x.calls.length;x.reopen();cap.client.get=get;const r2=await x.run();out.first=r1.reason;out.rerunAfterTakeover=r2.status+'/'+(r2.reason||'');out.extraGets=x.calls.length-g;out.redialItem3=x.calls.slice(g).some(z=>z.role==='CAPTURE'&&z.id===third.id);
 out.item3SpoolStillPresent=fs.existsSync(cap.spoolDirectory+'/spool-'+evidenceHash({scope,id:'A_SOURCE_PAIR:'+scope+':'+third.id})+'.json');
}finally{for(const f of cleanups.reverse())try{await f();}catch{}}
console.log(JSON.stringify(out,null,1));
