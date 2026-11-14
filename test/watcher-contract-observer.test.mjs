import {spawn} from 'node:child_process';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createContractObserver,OBSERVER_LIMITS} from '../watcher-contract-observer.mjs';
import {alpacaSnapshot,mergeLiveSnapshot} from '../snapshot-fields.mjs';
const day='2026-10-30',now=Date.parse(day+'T13:40:00Z'),sourceSha='a'.repeat(40),runId='synthetic-1';
const fixture=t=>{const directory=fs.mkdtempSync(path.join(os.tmpdir(),'contract-observer-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return {directory,day,runId,sourceSha,enabled:true};};
const row=()=>alpacaSnapshot('ZZQ',{latestTrade:{p:10,t:new Date(now-1000).toISOString()},latestQuote:{bp:9.99,ap:10.01,bs:100,as:200,t:new Date(now-2000).toISOString()},dailyBar:{v:100,t:day+'T04:00:00Z'}},true,now);
test('same-response sizes and units follow accepted quote only; no price/rule mutation',()=>{
 const live=row(),old={price:9,t:now-60000,bid:8,ask:10,qt:now-60000};mergeLiveSnapshot(old,live,now);
 assert.equal(old.quoteAskSizeRaw,200);assert.equal(old.quoteBidSizeRaw,100);assert.equal(old.quoteSizeUnit,'SHARES');
 mergeLiveSnapshot(old,{...live,qt:now-10000,quoteAskSizeRaw:99999},now);assert.equal(old.quoteAskSizeRaw,200);
 const historical=alpacaSnapshot('ZZQ',{latestQuote:{as:2,bs:3,t:'2025-10-31T14:00:00Z'}},true,now);assert.equal(historical.quoteSizeUnit,'ROUND_LOTS_OR_UNKNOWN');
});
test('default off performs no filesystem writes',t=>{const x=fixture(t);fs.rmSync(x.directory,{recursive:true});const a=createContractObserver({...x,enabled:false});assert.equal(a.record({minute:580,rows:[row()],nowMs:now}),false);assert.equal(fs.existsSync(x.directory),false);});
test('read-only summary, idempotency, restart and exact retained bytes',t=>{
 const x=fixture(t),rows=[row()],original=JSON.stringify(rows),a=createContractObserver(x);
 assert.equal(a.record({minute:580,rows,nowMs:now}),true);const f=path.join(x.directory,day,runId+'.contracts','beat-0580.json'),bytes=fs.readFileSync(f);
 assert.equal(a.record({minute:580,rows,nowMs:now}),true);assert.equal(a.health().records,1);assert.equal(JSON.stringify(rows),original);
 const b=createContractObserver(x);assert.equal(b.health().records,1);assert.equal(b.record({minute:580,rows,nowMs:now}),true);assert.ok(fs.readFileSync(f).equals(bytes));
 const r=JSON.parse(bytes).record;assert.equal(r.volumeMeaning,'PROVIDER_FIELD_AS_REPORTED_NOT_TOTAL_TRADED_OR_FRESHNESS_PROOF');assert.equal(r.entryPolicy,'NOT_ADOPTED_NOT_EVALUATED');assert.doesNotMatch(bytes.toString(),/ZZQ|10\.01|securityId/);
});
test('conflicting repeat and partial writes quarantine across restart, preserving original bytes',t=>{
 for(const partial of [false,true]){const x=fixture(t),a=createContractObserver(x);a.record({minute:580,rows:[row()],nowMs:now});const f=path.join(x.directory,day,runId+'.contracts','beat-0580.json');
 if(partial)fs.writeFileSync(f,'{"partial":');const old=fs.readFileSync(f);
 const b=createContractObserver(x);assert.equal(b.record({minute:580,rows:[{...row(),bid:0}],nowMs:now}),false);assert.equal(b.health().state,'QUARANTINED');assert.ok(fs.readFileSync(f).equals(old));assert.equal(createContractObserver(x).health().state,'QUARANTINED');}
});
test('short-write crash preserves incomplete evidence and never throws into watcher',t=>{
 const x=fixture(t);let once=true;const io={...fs,writeSync:(fd,b,o,n)=>{if(once){once=false;fs.writeSync(fd,b,o,Math.min(n,20));throw Error('synthetic interruption');}return fs.writeSync(fd,b,o,n);}};
 const a=createContractObserver({...x,io});assert.doesNotThrow(()=>a.record({minute:580,rows:[row()],nowMs:now}));assert.equal(a.health().state,'QUARANTINED');
 const f=path.join(x.directory,day,runId+'.contracts','beat-0580.json');assert.equal(fs.statSync(f).size,20);assert.equal(createContractObserver(x).health().state,'QUARANTINED');
});
test('known window and file-size arithmetic bound storage; future/missing fields are uncertainty',t=>{
 const x=fixture(t),a=createContractObserver(x);assert.equal(a.record({minute:901,rows:[row()],nowMs:now}),false);
 const rows=[{...row(),t:now+1,qt:now+1,vt:now+1,quoteAskSizeRaw:'200'}];a.record({minute:580,rows,nowMs:now});
 const r=JSON.parse(fs.readFileSync(path.join(x.directory,day,runId+'.contracts','beat-0580.json'))).record;
 assert.equal(r.counts.priceClockFuture,1);assert.equal(r.counts.quoteClockFuture,1);assert.equal(r.counts.sizeUnknown,1);assert.equal(OBSERVER_LIMITS.records*OBSERVER_LIMITS.recordBytes,OBSERVER_LIMITS.maxBytes);assert.ok(OBSERVER_LIMITS.maxBytes<2*1024*1024);
});

test('independent competing processes preserve one immutable heartbeat and fail closed on a race',async t=>{
 const x=fixture(t),source=new URL('../watcher-contract-observer.mjs',import.meta.url).href;
 const script="import {createContractObserver} from "+JSON.stringify(source)+";const a=createContractObserver("+JSON.stringify(x)+");a.record({minute:580,rows:[],nowMs:"+now+"});";
 const run=()=>new Promise((resolve,reject)=>{const p=spawn(process.execPath,['--input-type=module','-e',script],{stdio:'ignore',env:{PATH:process.env.PATH}});p.once('error',reject);p.once('close',resolve);});
 assert.deepEqual(await Promise.all([run(),run()]),[0,0]);const root=path.join(x.directory,day,runId+'.contracts'),names=fs.readdirSync(root).filter(x=>x.endsWith('.json'));assert.equal(names.length,1);
 const raw=fs.readFileSync(path.join(root,names[0]));assert.doesNotThrow(()=>JSON.parse(raw));const before=Buffer.from(raw);createContractObserver(x).record({minute:580,rows:[],nowMs:now});assert.ok(fs.readFileSync(path.join(root,names[0])).equals(before));
});

test('O1 root, ancestor, dangling and leaf symlinks never receive records or quarantine writes',t=>{
 for(const variant of ['root','ancestor','dangling','after-open','marker','record']){
  const x=fixture(t),target=fs.mkdtempSync(path.join(os.tmpdir(),'observer-outside-'));t.after(()=>fs.rmSync(target,{recursive:true,force:true}));const sentinel=path.join(target,'sentinel');fs.writeFileSync(sentinel,'UNCHANGED');const dir=path.join(x.directory,day),root=path.join(dir,runId+'.contracts');fs.mkdirSync(dir,{recursive:true});let a;
  if(variant==='ancestor'){fs.rmdirSync(dir);fs.symlinkSync(target,dir);}
  else if(variant==='root'||variant==='dangling')fs.symlinkSync(variant==='root'?target:path.join(target,'missing'),root);
  else{fs.mkdirSync(root);if(variant==='marker')fs.symlinkSync(sentinel,path.join(root,'QUARANTINED'));if(variant==='record')fs.symlinkSync(sentinel,path.join(root,'beat-0580.json'));if(variant==='after-open'){a=createContractObserver(x);fs.rmdirSync(root);fs.symlinkSync(target,root);}}
  a??=createContractObserver(x);assert.equal(a.record({minute:580,rows:[],nowMs:now}),false);assert.equal(a.health().state,'QUARANTINED');assert.deepEqual(fs.readdirSync(target),['sentinel'],variant);assert.equal(fs.readFileSync(sentinel,'utf8'),'UNCHANGED');
 }
});
test('O1 ancestor replacement at record open and at error handling cannot redirect any write',t=>{
 for(const fail of [false,true]){const x=fixture(t),root=path.join(x.directory,day,runId+'.contracts'),saved=root+'.original',target=fs.mkdtempSync(path.join(os.tmpdir(),'observer-race-'));t.after(()=>fs.rmSync(target,{recursive:true,force:true}));let swapped=false;
  const swap=()=>{fs.renameSync(root,saved);fs.symlinkSync(target,root);swapped=true;};
  const io={...fs,openSync:(file,...args)=>{if(!fail&&!swapped&&String(file).endsWith('/beat-0580.json'))swap();return fs.openSync(file,...args);},writeSync:(...args)=>{if(fail&&!swapped){swap();throw Error('SYNTHETIC_WRITE_FAILURE');}return fs.writeSync(...args);}};
  const a=createContractObserver({...x,io});assert.equal(a.record({minute:580,rows:[],nowMs:now}),false);assert.ok(swapped);assert.equal(a.health().state,'QUARANTINED');assert.deepEqual(fs.readdirSync(target),[]);assert.ok(fs.existsSync(path.join(saved,'beat-0580.json')));
 }
});
test('O1 real read-only directory under a verified non-root uid fails without writes',async t=>{
 const x=fixture(t),root=path.join(x.directory,day,runId+'.contracts');fs.mkdirSync(root,{recursive:true});for(const p of [x.directory,path.dirname(root)])fs.chmodSync(p,0o755);fs.chmodSync(root,0o555);
 if(process.getuid()!==0){try{assert.throws(()=>fs.accessSync(root,fs.constants.W_OK));const a=createContractObserver(x);assert.equal(a.record({minute:580,rows:[],nowMs:now}),false);assert.equal(a.health().state,'QUARANTINED');assert.deepEqual(fs.readdirSync(root),[]);}finally{fs.chmodSync(root,0o755);}return;}
 const script="import fs from 'node:fs';import {createContractObserver} from "+JSON.stringify(new URL('../watcher-contract-observer.mjs',import.meta.url).href)+";if(process.getuid()===0)throw Error('INVALID_ROOT_TEST');let denied=false;try{fs.accessSync("+JSON.stringify(root)+",fs.constants.W_OK);}catch{denied=true;}if(!denied)throw Error('PERMISSION_NOT_ENFORCED');const a=createContractObserver("+JSON.stringify(x)+");const written=a.record({minute:580,rows:[],nowMs:"+now+"});console.log(JSON.stringify({uid:process.getuid(),denied,written,health:a.health().state}));";
 const opts={env:{PATH:process.env.PATH},stdio:['ignore','pipe','pipe'],...(process.getuid()===0?{uid:65534,gid:65534}:{})};let out='',err='';const p=spawn(process.execPath,['--input-type=module','-e',script],opts);p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);const code=await new Promise((resolve,reject)=>{p.once('error',reject);p.once('close',resolve);});fs.chmodSync(root,0o755);assert.equal(code,0,err);const r=JSON.parse(out);assert.notEqual(r.uid,0);assert.equal(r.denied,true);assert.equal(r.written,false);assert.equal(r.health,'QUARANTINED');assert.deepEqual(fs.readdirSync(root),[]);
});
