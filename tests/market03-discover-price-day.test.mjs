// MARKET-03 discover.mjs price-day ingress (Claude, 2 Nov 2026): the ACTUAL discover.mjs against a loopback Massive stub that answers
// per date. Failed requests, genuine non-trading days and unavailable data stay distinct, and an older price day is never presented
// as current. Synthetic rows only; no network, credentials or messages (no Telegram secrets: nothing is sent).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {latestCompletedSession} from '../source-contract.mjs';
import {marketSession} from '../market-session.mjs';
const root=path.resolve(import.meta.dirname,'..');
const rows=n=>Array.from({length:n},(_,i)=>({T:'S'+String(i).padStart(4,'0'),c:10+i%50,v:1e6,o:10,h:11,l:9}));
const FULL=[200,{status:'OK',adjusted:true,resultsCount:600,results:rows(600)}];
async function run(t,answer,prev=null){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'disc-'));fs.mkdirSync(path.join(dir,'data'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 if(prev)fs.writeFileSync(path.join(dir,'data/discovery.json'),JSON.stringify(prev));
 const asked=[];const server=http.createServer((q,s)=>{const u=new URL(q.url,'http://x');
  if(u.pathname.startsWith('/v2/aggs/grouped/')){const d=u.pathname.split('/').pop();asked.push(d);const [st,body]=answer(d);s.statusCode=st;return s.end(typeof body==='string'?body:JSON.stringify(body));}
  s.statusCode=404;s.end('{}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const c=spawn(process.execPath,[path.join(root,'discover.mjs')],{cwd:dir,env:{PATH:process.env.PATH,MASSIVE_KEY:'synthetic',MASSIVE_BASE:base,SEC_BASE:base,CT_BASE:base,AV_BASE:base,FH_BASE:base,FMP_BASE:base,TG_BASE:base}});
 let log='';c.stdout.on('data',x=>log+=x);c.stderr.on('data',x=>log+=x);const code=await new Promise(r=>c.on('close',r));
 const f=path.join(dir,'data/discovery.json');return {code,log,asked,doc:fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):null};
}
const LATEST=latestCompletedSession(Date.now());

test('the current price day is the latest completed session, never today\'s unfinished one; closed days are never requested', async t=>{
 const r=await run(t,()=>FULL);assert.equal(r.code,0,r.log);
 assert.equal(r.doc.session,LATEST);assert.equal(r.doc.priceDay.status,'OBSERVED');assert.equal(r.doc.priceDay.expected,LATEST);assert.equal(r.doc.priceDay.lagSessions,0);
 assert.equal(r.asked[0],LATEST,'the first request is the latest completed session');
 for(const d of r.asked){const m=marketSession(d);if(m.known)assert.equal(m.closed,false,'requested a closed day inside the exchange calendar: '+d);}
 assert.equal(r.doc.priceDay.samples.length,12);assert.equal(r.doc.priceDay.samplesComplete,true);
});

for(const [label,reply,status] of [['a failed request (HTTP 500)',[500,'{}'],'FAILED'],['rate limiting that never clears (429)',[429,'{}'],'RATE_LIMITED'],['a plan refusal (403)',[403,'{}'],'REFUSED'],['a malformed answer ({})',[200,{}],'MALFORMED'],
 ['an authenticated empty answer',[200,{status:'OK',adjusted:true,resultsCount:0,queryCount:0}],'EMPTY'],['an incomplete market (100 rows)',[200,{status:'OK',adjusted:true,resultsCount:100,results:rows(100)}],'INCOMPLETE']]){
 test('the latest session gives '+label+': recorded as '+status+'; the previous list keeps its own date; no older day becomes current', async t=>{
  const prev={generatedAt:'2026-10-20T06:00:00.000Z',session:'2026-10-19',candidates:[{sym:'OLD1'}]};
  const r=await run(t,d=>d===LATEST?reply:FULL,prev);
  assert.equal(r.code,1,'the run fails visibly');assert.deepEqual([...new Set(r.asked)],[LATEST],'no fallback request to an older day');
  assert.equal(r.doc.session,'2026-10-19');assert.deepEqual(r.doc.candidates,[{sym:'OLD1'}]);
  assert.equal(r.doc.lastAttempt.priceDay.status,status);assert.equal(r.doc.lastAttempt.priceDay.expected,LATEST);assert.equal(r.doc.lastAttempt.priceDay.session,null);
  assert.match(r.log,/is unchanged and is not presented as current/);
 });
}

test('a failed historical sample falls back only with the fallback recorded; the outcome of every attempt is kept', async t=>{
 const first=await run(t,()=>FULL),m1=first.doc.priceDay.samples[0];
 const failDay=m1.day;const r=await run(t,d=>d===failDay?[500,'{}']:FULL);assert.equal(r.code,0,r.log);
 const s=r.doc.priceDay.samples[0];assert.equal(s.fellBack,true);assert.notEqual(s.day,failDay);assert.deepEqual(s.attempts[0],{day:failDay,outcome:'FAILED'});
 assert.equal(s.outcome,'OBSERVED');assert.ok(s.day<failDay);
});

test('outside the exchange calendar years, samples use the labelled weekday walk and record each outcome', async t=>{
 const r=await run(t,()=>FULL);const outside=r.doc.priceDay.samples.filter(x=>x.calendarBasis==='WEEKDAY_WALK_UNVERIFIED');
 const inside=r.doc.priceDay.samples.filter(x=>x.calendarBasis==='EXCHANGE_CALENDAR');
 assert.ok(inside.length>0);for(const x of outside)assert.equal(marketSession(x.target).known,false);for(const x of inside)assert.equal(marketSession(x.target).known,true);
});

test('unchanged behaviour: the same session already processed exits quietly without a new request beyond the current day', async t=>{
 const prev={generatedAt:'2026-10-31T06:00:00.000Z',session:LATEST,candidates:[{sym:'KEEP'}]};
 const r=await run(t,()=>FULL,prev);assert.equal(r.code,0);assert.match(r.log,/No new session since/);assert.deepEqual(r.asked,[LATEST]);assert.deepEqual(r.doc.candidates,[{sym:'KEEP'}]);
});
