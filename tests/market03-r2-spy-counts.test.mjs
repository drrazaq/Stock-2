// Review R2 residual (Codex, 2 Nov): SPY aggregates counts and structure (Claude, revision r3). A pure table for spyEnvelope() plus the
// ACTUAL comeback-lab.mjs against a loopback stub: valid zero, valid populated, malformed, partial and source-failure states stay
// distinct, and a retained R3 conflict survives a malformed-count answer. Synthetic only; no network, credentials or messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {spyEnvelope} from '../comeback-provenance.mjs';
import {latestCompletedSession,parseSourceTime} from '../source-contract.mjs';
const fixtureBar=day=>({t:Date.parse(day+'T05:00:00Z'),o:500,c:501});
const root=path.resolve(import.meta.dirname,'..'),day=latestCompletedSession(Date.now()),bar=fixtureBar(day);
const base={status:'OK',ticker:'SPY'};

test('spyEnvelope: every documented field validated; only justified count relationships enforced', () => {
 const M=(j,reason)=>{const r=spyEnvelope(j);assert.equal(r.kind,'MALFORMED',JSON.stringify(j));if(reason)assert.equal(r.reason,reason,JSON.stringify(j));};
 // structure
 for(const j of [null,[],'x',{},{...base,status:'ERROR'},{status:'OK',ticker:'QQQ',results:[bar]},{...base,adjusted:false,results:[bar]},{...base,adjusted:'true',results:[bar]},{...base,results:{0:bar}}])M(j);
 // counts present but invalid: never a missing optional field, never zero
 for(const v of [0.5,-1,'invalid','1',null,true,1e300,Number.MAX_SAFE_INTEGER+2]){M({...base,resultsCount:v,results:[bar]},'INVALID_RESULTSCOUNT');M({...base,queryCount:v,results:[bar]},'INVALID_QUERYCOUNT');}
 // contradictions
 M({...base,queryCount:0,resultsCount:1},'COUNT_WITHOUT_RESULTS');
 M({...base,resultsCount:3},'COUNT_WITHOUT_RESULTS');
 M({...base},'NO_RESULTS_NO_ZERO_EVIDENCE');M({...base,queryCount:2},'NO_RESULTS_NO_ZERO_EVIDENCE');
 M({...base,resultsCount:2,results:[bar]},'RESULTS_COUNT_MISMATCH');M({...base,resultsCount:0,results:[bar]},'RESULTS_COUNT_MISMATCH');
 // valid zero
 for(const j of [{...base,resultsCount:0},{...base,queryCount:0},{...base,queryCount:0,resultsCount:0},{...base,queryCount:4,resultsCount:0},{...base,results:[]},{...base,resultsCount:0,results:[]},{...base,status:'DELAYED',queryCount:0,resultsCount:0}])assert.equal(spyEnvelope(j).kind,'EMPTY',JSON.stringify(j));
 // valid populated: queryCount is not tied to the returned array
 for(const j of [{...base,results:[bar]},{...base,resultsCount:1,results:[bar]},{...base,adjusted:true,queryCount:1,resultsCount:1,results:[bar]},{...base,queryCount:5,resultsCount:1,results:[bar]},{...base,status:'DELAYED',resultsCount:2,results:[bar,bar]}])assert.equal(spyEnvelope(j).kind,'ROWS',JSON.stringify(j));
});

async function producer(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r2c-'));fs.mkdirSync(path.join(dir,'data'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let reply=[200,{}],calls=0;const server=http.createServer((q,s)=>{calls++;s.statusCode=reply[0];s.setHeader('content-type','application/json');s.end(JSON.stringify(reply[1]));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const url='http://127.0.0.1:'+server.address().port;
 const run=async()=>{const before=calls;const c=spawn(process.execPath,[path.join(root,'comeback-lab.mjs')],{cwd:dir,env:{PATH:process.env.PATH,MASSIVE_KEY:'synthetic',MASSIVE_BASE:url}});let log='';c.stdout.on('data',x=>log+=x);c.stderr.on('data',x=>log+=x);
  const code=await new Promise(r=>c.on('close',r));assert.equal(code,0,log);assert.equal(calls-before,1,'one request per run');
  return {spy:JSON.parse(fs.readFileSync(path.join(dir,'data/comeback-today.json'),'utf8')).sourceStatus.SPY_BARS,cache:JSON.parse(fs.readFileSync(path.join(dir,'data/comeback-spy.json'),'utf8'))};};
 return {dir,run,set:(st,body)=>reply=[st,body]};
}

test('actual producer: valid zero, valid populated, malformed, partial and source-failure states stay distinct', async t=>{
 const f=await producer(t);
 const table=[
  [200,{...base,queryCount:0,resultsCount:0},'EMPTY'],[200,{...base,resultsCount:0},'EMPTY'],[200,{...base,results:[]},'EMPTY'],
  [200,{...base,adjusted:true,queryCount:5,resultsCount:1,results:[bar]},'OBSERVED'],[200,{...base,results:[bar]},'OBSERVED'],
  [200,{...base,resultsCount:2,results:[bar,{t:'bad',o:1,c:1}]},'PARTIAL'],
  [200,{...base,queryCount:0,resultsCount:1},'MALFORMED'],[200,{...base,resultsCount:0.5,results:[bar]},'MALFORMED'],[200,{...base,resultsCount:'invalid',results:[bar]},'MALFORMED'],
  [200,{...base,resultsCount:null,results:[bar]},'MALFORMED'],[200,{...base,queryCount:-3,results:[bar]},'MALFORMED'],[200,{...base},'MALFORMED'],
  [503,{},'UNAVAILABLE'],[429,{},'RATE_LIMITED'],[403,{},'REFUSED']];
 for(const [st,body,want] of table){f.set(st,body);const r=await f.run();assert.equal(r.spy.response,want,st+' '+JSON.stringify(body));assert.equal(r.spy.status,want,st+' '+JSON.stringify(body));}
});

test('R3 preserved: a malformed-count answer after a retained conflict keeps CONFLICT; original bar and first record untouched', async t=>{
 const f=await producer(t);fs.writeFileSync(path.join(f.dir,'data/comeback-spy.json'),JSON.stringify({bars:{[day]:{o:500,c:501}}}));
 f.set(200,{...base,results:[{...bar,c:999}]});let r=await f.run();assert.equal(r.spy.status,'CONFLICT');const first=structuredClone(r.cache.conflicts[day]);
 for(const body of [{...base,queryCount:0,resultsCount:1},{...base,resultsCount:0.5,results:[{...bar,c:777}]},{...base,resultsCount:'invalid',results:[{...bar,c:777}]}]){
  f.set(200,body);r=await f.run();assert.equal(r.spy.response,'MALFORMED');assert.equal(r.spy.status,'CONFLICT');assert.equal(r.spy.integrity,'CONFLICT_UNRESOLVED');
  assert.deepEqual(r.cache.bars[day],{o:500,c:501});assert.deepEqual(r.cache.conflicts[day],first);}
 f.set(200,{...base,queryCount:0,resultsCount:0});r=await f.run();assert.equal(r.spy.response,'EMPTY');assert.equal(r.spy.status,'CONFLICT','a valid empty answer resolves nothing');
});

// Test fixture identity is stable across the November clock change; these are synthetic daily bars.
test('synthetic daily-bar fixtures keep their declared New York day in both DST regimes',()=>{
 for(const d of ['2026-10-30','2026-11-02'])assert.equal(parseSourceTime(fixtureBar(d).t,{kind:'epoch_ms',at:'2026-11-03T16:00:00Z'}).nyDay,d);
});
