import fs from 'node:fs';import {spawn,execFileSync} from 'node:child_process';
const W='<WORKTREE_E8AC76D7>';const {bridgeFixture}=await import(W+'/test/helper-a-source-bridge.mjs');const {evidenceHash}=await import(W+'/reclaim-research-workflow.mjs');
const out={};const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fx(){const cleanups=[];const t={after:f=>cleanups.push(f)};const x=bridgeFixture(t,{local:true});await x.ready();return {x,done:async()=>{for(const f of cleanups.reverse())try{await f();}catch{}}};}
const spools=x=>x.contexts.map(c=>fs.readdirSync(c.spoolDirectory).filter(n=>n.startsWith('spool-')).length);
const raws=c=>fs.readdirSync(c.directory).filter(f=>f.startsWith('raw-')).length;
const lockFor=(c,sec)=>spawn('flock',['-x',c.directory+'/.a-writer.lock','sleep',String(sec)],{stdio:'ignore'});
// A) contention shorter than retry budget (0.6s): retried inline, completes, no extra GET
for(const [label,hold] of [['A_hold0.6s',0.6],['B_hold4s',4]]){const {x,done}=await fx();try{const cap=x.contexts.find(c=>c.role==='CAPTURE'),get=cap.client.get;let n=0,h;
 cap.client.get=async item=>{const r=await get(item);n++;if(n===3){h=lockFor(cap,hold);await sleep(200);}return r;};
 const r1=await x.run();const g1=x.calls.length;await new Promise(z=>h.exitCode!==null?z():h.on('exit',z));
 const o={first:r1.status+'/'+(r1.reason||''),getsFirst:g1,spoolFiles:spools(x),captureRaw:raws(cap)};
 x.reopen();cap.client.get=get;const r2=await x.run();o.rerun=r2.status+'/'+(r2.reason||'');o.extraGets=x.calls.length-g1;o.captureRawAfter=raws(cap);out[label]=o;}finally{await done();}}
console.log(JSON.stringify(out,null,1));
