import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

async function verifyRefresh({staleQuote=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-refresh-')),requested=[];
 const now=Date.now(),server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  res.setHeader('Content-Type','application/json');
  if(u.pathname.includes('/snapshot/locale/')) {
   res.end(JSON.stringify({tickers:['AAA','BBB','CCC'].map((ticker,i)=>({ticker,
    lastTrade:{p:10,t:(now-(i===2?20*60000:60000))*1e6},
    lastQuote:{p:9.99,P:10.01,t:(now-(staleQuote&&i===0?20*60000:60000))*1e6},
    prevDay:{c:10,v:1000000},day:{o:10,v:1000},min:{t:now-15*60000,av:1000}}))}));
  }else if(u.pathname==='/v2/stocks/snapshots'){
   requested.push(u.searchParams.get('symbols'));
   res.end(JSON.stringify(Object.fromEntries(u.searchParams.get('symbols').split(',').map(sym=>[sym,{latestTrade:{p:10,t:new Date(now-1000).toISOString()},latestQuote:{bp:9.99,ap:10.01,t:new Date(now-1000).toISOString()},
    dailyBar:{o:10,v:2000,t:new Date(now-6*3600000).toISOString()}}]))));
  }else{res.statusCode=403;res.end('{}');}
 });
 let child;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  fs.mkdirSync(path.join(dir,'data'));
  // Reject every unexpected external request, even if a new watcher path is added.
  const guard=path.join(dir,'fetch-guard.mjs');
  fs.writeFileSync(guard,"const f=globalThis.fetch;globalThis.fetch=(u,o)=>{if(!String(u).startsWith("+JSON.stringify(base+'/')+"))throw new Error('nonfixture fetch blocked');return f(u,o)};");
  child=spawn(process.execPath,['--import',guard,new URL('../ignition-watch.mjs',import.meta.url).pathname],{
   cwd:dir,env:{PATH:process.env.PATH,IG_DAY:'2026-10-29',IG_FAKE_MIN:'620',IG_FAKE_STEP:'400',
    IG_NO_RADAR:'1',MASSIVE_KEY:'fixture',ALPACA_KEY:'fixture',ALPACA_SECRET:'fixture',
    MASSIVE_BASE:base,ALPACA_DATA:base,SEC_BASE:base,TG_BASE:base},stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);
  const timer=setTimeout(()=>child.kill('SIGKILL'),10000);
  let status;try{[status]=await once(child,'close');}finally{clearTimeout(timer);}
  assert.equal(status,0,output);
  assert.deepEqual(requested,[staleQuote?'AAA,CCC':'CCC']);
  const snapshot=JSON.parse(fs.readFileSync(path.join(dir,'data/ignition-live.json'),'utf8'));
  assert.equal(snapshot.heartbeat.length,1);
  assert.equal(snapshot.heartbeat[0].live,3);
  assert.equal(snapshot.heartbeat[0].evaluated,3);
  // The old daily volume clock must not be promoted by that current trade.
  assert.ok(snapshot.heartbeat[0].volAgeP50>=15);
 }finally{
  if(child?.exitCode===null)child.kill('SIGKILL');
  await new Promise(resolve=>server.close(resolve));
  fs.rmSync(dir,{recursive:true,force:true});
 }
}
test('real watcher refreshes a stale minority despite a fresh whole-market median',()=>verifyRefresh());
test('real watcher refreshes stale BBO despite current trade and retains other fresh symbols',()=>verifyRefresh({staleQuote:true}));
