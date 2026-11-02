// Regressions for Codex's review findings R1-R3 on claude/market03-catalyst03 @ e6a1382c (Claude, revision r2).
// R1 invalid calendar days never throw and one bad row never sinks its neighbours; R2 only the official SPY aggregates envelope
// counts as an answer; R3 a retained SPY revision conflict stays unresolved across reversion, restart and later failure.
// Synthetic inputs, loopback stub only; no network, credentials or messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {parseSourceTime,isDay,nyParts,sessionPhase,latestCompletedSession,closeLagSessions,nextSession,reactionSession} from '../source-contract.mjs';
import {collectDiscovery} from '../discovery-runtime.mjs';
import {withComebackProvenance} from '../comeback-provenance.mjs';
const root=path.resolve(import.meta.dirname,'..'),AT='2026-11-02T16:00:00Z';

// ------------------------------------------------------------------ R1 -----------------------------------------------------------
test('R1: every impossible calendar day is INVALID/false, never a thrown RangeError', () => {
 for(const d of ['2026-13-01','2026-00-10','2026-02-30','2026-04-31','2026-12-32','2026-11-00','9999-99-99','0000-00-00']){
  assert.doesNotThrow(()=>isDay(d),d);assert.equal(isDay(d),false,d);
  assert.equal(parseSourceTime(d,{kind:'date',at:AT}).status,'INVALID',d);
  assert.equal(parseSourceTime(d+'T10:00:00Z',{kind:'iso',at:AT}).status,'INVALID',d);
  assert.equal(nextSession(d),null,d);assert.equal(reactionSession(d,'AMC').status,'INVALID',d);
  assert.equal(closeLagSessions(d,Date.parse(AT)),null,d);}
 assert.equal(isDay('2028-02-29'),true);assert.equal(isDay('2026-02-29'),false);
});

test('R1: out-of-range epochs are INVALID in every formatter, never thrown', () => {
 for(const ms of [1e20,-1e20,8.64e15+1,Infinity,NaN]){
  assert.doesNotThrow(()=>nyParts(ms));assert.equal(sessionPhase(ms).phase,'INVALID');assert.equal(latestCompletedSession(ms),null);}
 assert.throws(()=>parseSourceTime('2026-11-02',{kind:'date',at:1e20}),/observation clock/);   // an impossible clock is a caller error
});

test('R1: the actual discovery consumer keeps valid rows next to rows with impossible days, with truthful counts', () => {
 const cutoff=AT,base={d:'2026-11-02',a:2,e:1,t:'bmo',timing:'BMO',src:'FINNHUB'};
 const earnings={updated:cutoff,sourceStatus:{FINNHUB_CALENDAR:{status:'OBSERVED'}},reports:[{...base,sym:'BAD',publicationDay:'2026-13-01'},{...base,sym:'BAE',publicationDay:'2026-00-10'},{...base,sym:'AAA',publicationDay:'2026-11-02'},{...base,sym:'BAF',publicationDay:'2026-02-30'},{...base,sym:'BBB',publicationDay:'2026-10-30'}]};
 const d2={generatedAt:cutoff,sourceStatus:{SEC_INDEX:{status:'OBSERVED'},PRICE_CACHE:{status:'OBSERVED'}},buys:[{sym:'CCC',rule:'r',lastCloseDay:'2026-13-01'},{sym:'DDD',rule:'r',lastCloseDay:'2026-10-30'},{sym:'EEE',rule:'r',sourceDataDay:'2026-02-30'}]};
 const out=collectDiscovery({cutoff,readText:p=>{if(p==='data/earnings-recent.json')return JSON.stringify(earnings);if(p==='data/discovery2-today.json')return JSON.stringify(d2);throw Error('absent');}});
 const e=out.sources.find(x=>x.lane==='EARNINGS_SURPRISE'),t=out.sources.find(x=>x.lane==='TECHNICAL_BUILDUP');
 assert.equal(e.status,'READ');assert.equal(e.accepted,2);assert.equal(e.rejected,3);
 assert.equal(t.status,'READ');assert.equal(t.accepted,1);assert.equal(t.rejected,2);
 assert.deepEqual(out.observations.map(o=>o.symbol).sort(),['AAA','BBB','DDD']);
});

test('R1: comeback provenance with an impossible lab close day withholds, never throws', () => {
 const doc={generatedAt:AT,methods:{'A-1':{lab:'alpha',newSignals:[{sym:'AAA',close:1}]}}};
 const out=withComebackProvenance(doc,{alpha:{generatedAt:AT,lastClose:'2026-13-01'}},{nowMs:Date.parse(AT)});
 assert.equal(out.methods['A-1'].newSignals.length,0);assert.equal(out.methods['A-1'].retainedSignals[0].withheld,'LAB_TODAY_FILE_UNKNOWN');
});

// --------------------------------------------------------------- R2 / R3 ----------------------------------------------------------
async function producer(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'r2r3-'));fs.mkdirSync(path.join(dir,'data'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let reply=[200,{}],calls=0;const server=http.createServer((q,s)=>{calls++;s.statusCode=reply[0];s.setHeader('content-type','application/json');s.end(JSON.stringify(reply[1]));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const run=async()=>{const c=spawn(process.execPath,[path.join(root,'comeback-lab.mjs')],{cwd:dir,env:{PATH:process.env.PATH,MASSIVE_KEY:'synthetic',MASSIVE_BASE:base}});let log='';c.stdout.on('data',x=>log+=x);c.stderr.on('data',x=>log+=x);
  const code=await new Promise(r=>c.on('close',r));assert.equal(code,0,log);return {today:JSON.parse(fs.readFileSync(path.join(dir,'data/comeback-today.json'),'utf8')).sourceStatus.SPY_BARS,cache:JSON.parse(fs.readFileSync(path.join(dir,'data/comeback-spy.json'),'utf8'))};};
 return {dir,run,set:(st,body)=>reply=[st,body],calls:()=>calls};
}
const day=latestCompletedSession(Date.now()),barT=Date.parse(day+'T04:00:00Z');

test('R2: only the official SPY aggregates envelope is an answer; empty is EMPTY, never OBSERVED', async t=>{
 const f=await producer(t);
 const cases=[[{} ,'MALFORMED'],[{status:'OK',results:[]},'MALFORMED'],[{status:'OK',ticker:'QQQ',results:[{t:barT,o:1,c:1}]},'MALFORMED'],[{status:'ERROR',ticker:'SPY',error:'x'},'MALFORMED'],
  [{status:'OK',ticker:'SPY',adjusted:false,results:[{t:barT,o:1,c:1}]},'MALFORMED'],[{status:'OK',ticker:'SPY',resultsCount:2,results:[{t:barT,o:1,c:1}]},'MALFORMED'],
  [{status:'OK',ticker:'SPY',queryCount:0,resultsCount:0},'EMPTY'],[{status:'OK',ticker:'SPY'},'MALFORMED'],[{status:'OK',ticker:'SPY',resultsCount:0,results:[]},'EMPTY'],
  [{status:'DELAYED',ticker:'SPY',adjusted:true,resultsCount:1,results:[{t:barT,o:500,c:501}]},'OBSERVED']];
 for(const [body,want] of cases){f.set(200,body);const r=await f.run();assert.equal(r.today.response,want,JSON.stringify(body));assert.equal(r.today.status,want,JSON.stringify(body));}
 assert.equal(f.calls(),cases.length,'one request per run; endpoint and scope unchanged');
});

test('R3: a retained revision conflict survives reversion, restart and later failure; originals never rewritten', async t=>{
 const f=await producer(t);fs.writeFileSync(path.join(f.dir,'data/comeback-spy.json'),JSON.stringify({bars:{[day]:{o:500,c:501}}}));
 f.set(200,{status:'OK',ticker:'SPY',results:[{t:barT,o:500,c:999}]});let r=await f.run();                              // revision
 assert.equal(r.today.status,'CONFLICT');assert.equal(r.today.integrity,'CONFLICT_UNRESOLVED');assert.equal(r.today.response,'OBSERVED');
 const first=structuredClone(r.cache.conflicts[day]);assert.deepEqual(r.cache.bars[day],{o:500,c:501});
 f.set(200,{status:'OK',ticker:'SPY',results:[{t:barT,o:500,c:501}]});r=await f.run();                                 // reversion
 assert.equal(r.today.status,'CONFLICT');assert.equal(r.today.response,'OBSERVED');assert.equal(r.cache.status,'CONFLICT');
 r=await f.run();                                                                                                     // restart, same answer
 assert.equal(r.today.status,'CONFLICT');assert.equal(r.today.unresolvedConflicts,1);
 f.set(503,{});r=await f.run();                                                                                       // later failure
 assert.equal(r.today.status,'CONFLICT');assert.equal(r.today.response,'UNAVAILABLE');
 assert.deepEqual(r.cache.bars[day],{o:500,c:501},'original bar never rewritten');assert.deepEqual(r.cache.conflicts[day],first,'first conflict record never rewritten');
 f.set(200,{status:'OK',ticker:'SPY',results:[{t:barT,o:500,c:777}]});r=await f.run();                                 // a second, different revision
 assert.deepEqual(r.cache.conflicts[day],first,'the retained record is not replaced by a later revision');assert.equal(r.today.status,'CONFLICT');
});

test('R3: with no retained conflict the lane status is the latest response', async t=>{
 const f=await producer(t);f.set(200,{status:'OK',ticker:'SPY',results:[{t:barT,o:500,c:501}]});let r=await f.run();
 assert.equal(r.today.status,'OBSERVED');assert.equal(r.today.integrity,'CLEAN');
 f.set(503,{});r=await f.run();assert.equal(r.today.status,'UNAVAILABLE');assert.equal(r.cache.bars[day].c,501);
});
