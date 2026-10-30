// Hosted, branch-only artifact round trip. Generated data only; no secrets.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const phase=process.argv[2];assert.ok(['open','close'].includes(phase));
const dir=path.resolve('fixture-state');
if(phase==='open'){assert.equal(fs.existsSync(dir),false);fs.mkdirSync(path.join(dir,'data'),{recursive:true});}
else assert.ok(fs.existsSync(path.join(dir,'runtime/watcher-checkpoint.json')),'artifact did not restore runtime/ checkpoint path');
const parent=phase==='close'?JSON.parse(fs.readFileSync(path.join(dir,'runtime/watcher-checkpoint.json'))):null;
const inheritedClock=parent?Math.max(...[parent.state?.DISCOVERY?.lastCycleAt,parent.state?.DISCOVERY?.paperQuoteEvidence?.lastCycleAt,parent.lastHeartbeat?.completedAt].map(x=>Date.parse(x)).filter(Number.isFinite)):null;
const now=phase==='close'?Math.max(Date.parse('2026-10-29T19:00:00Z'),inheritedClock+60000):Date.parse('2026-10-29T19:00:00Z');
const server=http.createServer((req,res)=>{
 res.setHeader('Content-Type','application/json');
 if(req.url.startsWith('/v2/snapshot/locale/'))res.end(JSON.stringify({tickers:[{ticker:'AAA',lastTrade:{p:10,t:(now-1000)*1e6},prevDay:{c:10,v:1000000},min:{t:now-15*60000,av:1000},day:{o:10,v:1000}}]}));
 else{res.statusCode=403;res.end('{}');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
try{
 const base='http://127.0.0.1:'+server.address().port,preload=path.join(dir,'fixture-preload.mjs');
 fs.writeFileSync(preload,`const D=Date,start=D.now(),at=${now};globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:[at+D.now()-start]));}static now(){return at+D.now()-start;}};const f=fetch;globalThis.fetch=(u,o)=>{if(!String(u).startsWith(${JSON.stringify(base+'/')}))throw Error('external request blocked');return f(u,o)};`);
 const watcher=new URL('../ignition-watch.mjs',import.meta.url).pathname;
 const child=spawn(process.execPath,['--import',preload,watcher],{cwd:dir,env:{PATH:process.env.PATH,
  GIT_DIR:path.join(dir,'disabled-git'),GITHUB_ACTIONS:'true',GITHUB_REF_NAME:'Stock2-safety-fixes',GITHUB_SHA:'fixture-code',GITHUB_RUN_ID:'fixture',GITHUB_RUN_ATTEMPT:'1',
  IG_DAY:'2026-10-29',IG_SEGMENT:phase,IG_FAKE_MIN:phase==='open'?'570':'840',IG_FAKE_STEP:'1',IG_NO_RADAR:'1',...(phase==='close'?{IG_RESUME:'1'}:{}),
  MASSIVE_KEY:'fixture',MASSIVE_BASE:base,ALPACA_DATA:base,SEC_BASE:base,TG_BASE:base},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
 const timer=setTimeout(()=>child.kill('SIGKILL'),30000);let code;
 try{[code]=await once(child,'close');}finally{clearTimeout(timer);}
 assert.equal(code,0,output.slice(-3000));
 const checkpoint=JSON.parse(fs.readFileSync(path.join(dir,'runtime/watcher-checkpoint.json')));
 const snapshot=JSON.parse(fs.readFileSync(path.join(dir,'data/ignition-live.json')));
 if(phase==='open'){assert.equal(checkpoint.beat.length,270);assert.equal(snapshot.coverage.completeSession,false);}
 else{
  assert.match(output,/RESUMED_COMPLETED_CYCLES 270/);assert.equal(snapshot.coverage.observedMinutes,390);assert.equal(snapshot.coverage.completeSession,true);
  assert.equal(snapshot.heartbeat.at(-1).m,960);assert.equal(snapshot.inheritedMinutes,270);
  assert.ok(fs.existsSync(path.join(dir,'data/ignition-runs/2026-10-29/fixture-1-open.json')),'opening attempt archive missing from artifact');
 }
 console.log(JSON.stringify({phase,observed:snapshot.coverage.observedMinutes,complete:snapshot.coverage.completeSession,externalServices:'BLOCKED',secrets:'NONE'}));
}finally{await new Promise(r=>server.close(r));}
