// Secret-free end-to-end lifecycle. Every outbound fetch is confined to one
// localhost server. No workflow dispatch, live feed, order or real Telegram.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const repo=new URL('../',import.meta.url).pathname;
async function fixture(day='2026-10-29') {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-runtime-'));
 fs.mkdirSync(path.join(dir,'data'));
 const state={stale:false,tgStatus:200,dispatchStatus:403,running:true,sends:0,requests:0,pendingObserved:false};
 const baseTime=Date.parse(day+'T19:00:00Z');
 const server=http.createServer((req,res)=>{
  state.requests++;const u=new URL(req.url,'http://localhost');res.setHeader('Content-Type','application/json');
  if(u.pathname.includes('/snapshot/locale/'))return res.end(JSON.stringify({tickers:[{ticker:'AAA',lastTrade:{p:10,t:(baseTime-(state.stale?20*60000:1000))*1e6},prevDay:{c:10,v:1000000},min:{av:1000,t:baseTime-15*60000},day:{o:10,v:1000}}]}));
  if(u.pathname.endsWith('/ignition.yml/runs'))return res.end(JSON.stringify({workflow_runs:state.running?[{id:1,run_attempt:1,status:'in_progress',created_at:day+'T13:10:00Z'}]:[]}));
  if(u.pathname.endsWith('/1/jobs'))return res.end(JSON.stringify({jobs:[{name:'watch',status:'completed',started_at:day+'T13:10:00Z',completed_at:day+'T18:00:00Z'},{name:'close',status:'in_progress',started_at:day+'T18:01:00Z'}]}));
  if(u.pathname.includes('/contents/data/watcher-heartbeats/')){
   const f=path.join(dir,'runtime/watcher-heartbeat.json');
   if(fs.existsSync(f)){const b=JSON.parse(fs.readFileSync(f));if(u.pathname.endsWith('/'+b.runId+'.json'))return res.end(JSON.stringify({content:Buffer.from(JSON.stringify(b)).toString('base64')}));}
  }
  if(u.pathname.endsWith('/dispatches')){
   const s=JSON.parse(fs.readFileSync(path.join(dir,'data/watcher-guard.json')));state.pendingObserved=s.attempts.at(-1).status==='PENDING';
   res.statusCode=state.dispatchStatus;return res.end('{}');
  }
  if(u.pathname.includes('/sendMessage')){state.sends++;res.statusCode=state.tgStatus;return res.end(JSON.stringify(state.tgStatus===200?{ok:true,result:{message_id:state.sends}}:{ok:false,description:'fixture rate limit'}));}
  res.statusCode=403;res.end('{}');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port,preload=path.join(dir,'fixture-preload.mjs');
 fs.writeFileSync(preload,`const D=Date,start=D.now(),at=${baseTime};globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[at+D.now()-start]));}static now(){return at+D.now()-start;}};const f=fetch;globalThis.fetch=(u,o)=>{if(!String(u).startsWith(${JSON.stringify(base+'/')}))throw Error('external fixture request blocked');return f(u,o);};`);
 async function run(script,extra={}) {
  const child=spawn(process.execPath,['--import',preload,path.join(repo,script)],{cwd:dir,env:{PATH:process.env.PATH,GITHUB_ACTIONS:'true',GITHUB_REF_NAME:'Stock2-safety-fixes',GITHUB_SHA:'fixture-code',GITHUB_RUN_ID:'1',GITHUB_RUN_ATTEMPT:'1',IG_DAY:day,IG_NO_RADAR:'1',MASSIVE_KEY:'fixture',ALPACA_KEY:'fixture',ALPACA_SECRET:'fixture',MASSIVE_BASE:base,ALPACA_DATA:base,SEC_BASE:base,TG_BASE:base,...extra},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
  const timer=setTimeout(()=>child.kill('SIGKILL'),30000);let code;
  try{[code]=await once(child,'close');}finally{clearTimeout(timer);}
  assert.equal(code,0,output.slice(-3000));return output;
 }
 return {dir,state,run,guard:extra=>run('watcher-guard.mjs',{GITHUB_REPOSITORY:'fixture/Stock-2',GITHUB_TOKEN:'fixture',GH_BASE:base,GUARD_TEST_NOW:day+'T19:02:00Z',TG_TOKEN:'fixture',TG_CHAT:'fixture',...extra}),read:f=>JSON.parse(fs.readFileSync(path.join(dir,f))),close:async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}};
}
test('two bounded watcher segments preserve 390 minute evidence, checkpoint state and duplicate protection',async()=>{
 const f=await fixture();try{
  await f.run('ignition-watch.mjs',{IG_SEGMENT:'open',IG_FAKE_MIN:'570',IG_FAKE_STEP:'1'});
  assert.equal(f.read('runtime/watcher-checkpoint.json').beat.length,270);
  assert.equal(f.read('data/ignition-live.json').coverage.completeSession,false);
  await f.run('ignition-watch.mjs',{IG_SEGMENT:'close',IG_RESUME:'1',IG_FAKE_MIN:'840',IG_FAKE_STEP:'1'});
  const day=f.read('data/ignition-live.json');assert.equal(day.coverage.observedMinutes,390);assert.equal(day.coverage.completeSession,true);
  assert.equal(day.heartbeat.at(-1).m,959);assert.equal(f.read('runtime/watcher-heartbeat.json').freshPct,100);
  assert.equal(f.read('runtime/watcher-checkpoint.json').state.ANCHOR.minute,900);
  assert.ok(fs.existsSync(path.join(f.dir,'data/ignition-runs/2026-10-29/1-1-open.delivery.json')));
  assert.ok(fs.existsSync(path.join(f.dir,'data/ignition-runs/2026-10-29/1-1-close.shadow.jsonl.gz')));
  const before=fs.readFileSync(path.join(f.dir,'data/ignition-live.json'),'utf8'),count=f.state.requests;
  assert.match(await f.run('ignition-watch.mjs',{IG_SEGMENT:'close',IG_RESUME:'1',IG_FAKE_MIN:'959'}),/session already recorded/);
  assert.equal(f.state.requests,count);assert.equal(fs.readFileSync(path.join(f.dir,'data/ignition-live.json'),'utf8'),before);
 }finally{await f.close();}
});
test('a handoff gap stays incomplete and a missing research endpoint is never replaced by 16:00',async()=>{
 const f=await fixture();try{
  await f.run('ignition-watch.mjs',{IG_SEGMENT:'open',IG_FAKE_MIN:'839',IG_FAKE_STEP:'400'});
  await f.run('ignition-watch.mjs',{IG_SEGMENT:'close',IG_RESUME:'1',IG_FAKE_MIN:'959',IG_FAKE_STEP:'400'});
  const s=f.read('data/ignition-live.json');assert.equal(s.coverage.observedMinutes,2);assert.equal(s.coverage.completeSession,false);
  assert.equal(f.read('runtime/watcher-checkpoint.json').state.ANCHOR.minute,null);
 }finally{await f.close();}
});
test('missing continuation checkpoint permits observation but suppresses outbound trade messages',async()=>{
 const f=await fixture();try{
  const output=await f.run('ignition-watch.mjs',{IG_SEGMENT:'close',IG_RESUME:'1',IG_FAKE_MIN:'959',IG_FAKE_STEP:'400',TG_TOKEN:'fixture',TG_CHAT:'fixture'});
  assert.match(output,/CHECKPOINT_UNAVAILABLE/);assert.equal(f.state.sends,0);assert.equal(f.read('data/ignition-live.json').coverage.completeSession,false);
 }finally{await f.close();}
});
test('half-day watcher observes 210 minutes and stops at the reviewed 13:00 close',async()=>{
 const f=await fixture('2026-11-27');try{
  await f.run('ignition-watch.mjs',{IG_SEGMENT:'open',IG_FAKE_MIN:'570',IG_FAKE_STEP:'1'});
  const s=f.read('data/ignition-live.json');assert.equal(s.coverage.expectedMinutes,210);assert.equal(s.coverage.completeSession,true);assert.equal(s.heartbeat.at(-1).m,779);
 }finally{await f.close();}
});
test('stale cycles preserve last success, guard reads real persisted telemetry and Telegram 429 stays retryable',async()=>{
 const f=await fixture();try{
  await f.run('ignition-watch.mjs',{IG_SEGMENT:'open',IG_FAKE_MIN:'839',IG_FAKE_STEP:'400'});
  const success=f.read('runtime/watcher-heartbeat.json').lastSuccessfulCycle;f.state.stale=true;
  await f.run('ignition-watch.mjs',{IG_SEGMENT:'close',IG_RESUME:'1',IG_FAKE_MIN:'959',IG_FAKE_STEP:'400'});
  const b=f.read('runtime/watcher-heartbeat.json');assert.equal(b.freshPct,0);assert.equal(b.successful,false);assert.equal(b.lastSuccessfulCycle,success);assert.ok(b.errorCount>0);
  f.state.tgStatus=429;await f.guard();let s=f.read('data/watcher-guard.json');assert.equal(s.health.status,'DEGRADED');assert.equal(s.health.freshPct,0);assert.ok(s.notifications.length>0);
  f.state.tgStatus=200;await f.guard();s=f.read('data/watcher-guard.json');assert.equal(s.notifications.length,0);
 }finally{await f.close();}
});
test('real guard persists request intent and refuses to report HTTP 403 as a restart',async()=>{
 const f=await fixture();try{
  f.state.running=false;const output=await f.guard();const s=f.read('data/watcher-guard.json');
  assert.equal(f.state.pendingObserved,true);assert.equal(s.attempts[0].status,'REJECTED');assert.deepEqual(s.dispatched,[]);
  assert.doesNotMatch(output,/started the watcher|started it itself/);assert.equal(s.notifications.length,0);
 }finally{await f.close();}
});
