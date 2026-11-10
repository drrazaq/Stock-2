// All holdings, messages, prices and credentials below are invented. Loopback only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {marketClock,completedMarketSession,nightlyScanEvidence} from '../market-session.mjs';
import {copyFixtureModuleClosure} from './watcher-contract-profile.mjs';
import {loadScan,blocked} from './load-scan.mjs';
import {sendTelegramMessage,telegramFetch} from '../telegram-delivery.mjs';
import {buildClose,netOf,scoreboard} from '../radar-v3-core.mjs';
const ORIGINAL_NOW=Date.now;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),T=Date.parse('2026-11-09T13:40:00Z'),iso=x=>new Date(x).toISOString();
async function pre(t,{now=T,positions={AAA:{entry:10,stop:8}},signals={session:'2026-11-06',generatedAt:'2026-11-07T01:00:00Z'},actions={sells:[]},rows,fetchAdvance=0,sendAdvance=0,afterReplyAdvance=0,mode='ack',feedStatus=200}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'premarket-evidence-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 copyFixtureModuleClosure(root,dir,'premarket-check.mjs');fs.mkdirSync(path.join(dir,'data'),{recursive:true});
 const original={'data/my-positions.json':JSON.stringify(positions),'data/signals.json':JSON.stringify(signals),'data/actions-sells.json':JSON.stringify(actions),'data/tg-state.json':'{"offset":7}','data/my-trades.jsonl':'{"synthetic":"original trade"}\n','data/private-original-message.txt':'SYNTHETIC ORIGINAL MESSAGE — preserve bytes'};
 for(const [file,body]of Object.entries(original))fs.writeFileSync(path.join(dir,file),body);
 const messages=[],feeds=[];let calls=0;
 const server=http.createServer((req,res)=>{let body='';req.on('data',x=>body+=x);req.on('end',()=>{
  const u=new URL(req.url,'http://loopback');res.setHeader('Content-Type','application/json');
  if(u.pathname==='/v2/stocks/snapshots'){feeds.push(u.searchParams.get('feed'));if(feedStatus!==200&&u.searchParams.get('feed')==='sip'){res.statusCode=feedStatus;return res.end('{}');}return res.end(JSON.stringify(rows||{AAA:{latestTrade:{p:9,t:iso(now-60000)},prevDailyBar:{c:9.5,t:'2026-11-06T05:00:00Z'}}}));}
  assert.equal(u.pathname,'/botsynthetic/sendMessage');calls++;messages.push(JSON.parse(body).text);
  if(mode==='ambiguous'){res.destroy();return;}
  if(mode==='429'&&calls===1){res.statusCode=429;return res.end(JSON.stringify({ok:false,parameters:{retry_after:0}}));}
  res.end(JSON.stringify({ok:true,result:{message_id:calls}}));
 });});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());
 const base='http://127.0.0.1:'+server.address().port;
 const guard=`let clock=${now};const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}};const raw=fetch;globalThis.fetch=async(u,o)=>{const url=String(u);if(!url.startsWith(${JSON.stringify(base+'/')}))throw Error('NO_EXTERNAL_ACCESS');const r=await raw(u,o);if(url.includes('/snapshots?'))clock+=${fetchAdvance};if(url.includes('/sendMessage'))clock+=${afterReplyAdvance};return r;};const log=console.log;console.log=(...v)=>{log(...v);if(String(v[0]).startsWith('premarket report prepared;'))clock+=${sendAdvance};};`;
 fs.writeFileSync(path.join(dir,'guard.mjs'),guard);
 const child=spawn(process.execPath,['--import',path.join(dir,'guard.mjs'),'premarket-check.mjs'],{cwd:dir,env:{PATH:process.env.PATH,ALPACA_DATA_BASE:base,ALPACA_KEY:'synthetic',ALPACA_SECRET:'synthetic',TG_BASE:base,TG_TOKEN:'synthetic',TG_CHAT:'synthetic'},stdio:['ignore','pipe','pipe'],signal:AbortSignal.timeout(30000)});
 let out='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>out+=x);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});assert.equal(code,0,out);
 for(const [file,body]of Object.entries(original))assert.equal(fs.readFileSync(path.join(dir,file),'utf8'),body,'original preserved: '+file);
 assert.doesNotMatch(out,/SYNTHETIC ORIGINAL MESSAGE|^- AAA |you bought at/m,'private body not logged');
 return {out,messages,calls,feeds,text:messages.join('\n')};
}
test('market clock classifies winter, summer, midnight, early close and holiday without guessing the trade zone',()=>{
 assert.equal(marketClock(Date.parse('2026-11-09T22:42:00Z')).phase,'AFTER_HOURS');
 assert.equal(marketClock(Date.parse('2026-11-09T13:40:00Z')).phase,'PRE_MARKET');
 assert.equal(marketClock(Date.parse('2026-10-30T12:40:00Z')).phase,'PRE_MARKET');
 assert.equal(marketClock(Date.parse('2026-11-10T00:30:00Z')).day,'2026-11-09');
 assert.equal(marketClock(Date.parse('2026-11-27T18:00:00Z')).phase,'AFTER_HOURS');
 assert.equal(marketClock(Date.parse('2026-11-26T13:40:00Z')).phase,'CLOSED');
 assert.equal(marketClock(Date.parse('2028-01-03T13:40:00Z')).phase,'UNKNOWN');
});
test('actual late premarket invocation refuses before quote acquisition or send',async t=>{
 for(const now of [Date.parse('2026-11-09T22:42:00Z'),Date.parse('2026-11-10T00:30:00Z'),Date.parse('2026-11-26T13:40:00Z')]){
  const r=await pre(t,{now});assert.equal(r.feeds.length,0);assert.equal(r.calls,0);assert.match(r.out,/skipped outside pre-market/);
 }
});
test('actual winter/summer caller labels original source clock, receipt, render and observed feed',async t=>{
 for(const [now,day,close]of [[T,'2026-11-09','2026-11-06'],[Date.parse('2026-10-30T12:40:00Z'),'2026-10-30','2026-10-29']]){
  const r=await pre(t,{now,signals:{session:close,generatedAt:close+'T22:00:00Z'},rows:{AAA:{latestTrade:{p:9,t:iso(now-60000)},prevDailyBar:{c:9.5,t:close+'T04:00:00Z'}}}});
  assert.match(r.text,new RegExp('PRE-MARKET CHECK '+day));assert.match(r.text,/08:39:00 New York \(PRE_MARKET\)/);assert.match(r.text,/received .*Z/);assert.match(r.text,/Invocation .*fetched .*rendered/);assert.match(r.text,/prices SIP/);assert.match(r.text,/HOLD context based only on this fresh pre-market trade/);
 }
 const iex=await pre(t,{feedStatus:403});assert.deepEqual(iex.feeds,['sip','iex']);assert.match(iex.text,/prices IEX/);
});
test('actual stale, undated, wrong-session and future-at-fetch prices never create current HOLD/stop claims',async t=>{
 const r=await pre(t,{positions:{AAA:{entry:10,stop:8},BBB:{entry:10,stop:8},CCC:{entry:10,stop:8},DDD:{entry:10,stop:8}},rows:{
  AAA:{latestTrade:{p:7,t:iso(T-3600000)}},BBB:{latestTrade:{p:7}},CCC:{latestTrade:{p:7,t:'2026-11-09T08:39:00'}},DDD:{latestTrade:{p:7,t:iso(T+1000)}}},sendAdvance:2000});
 assert.match(r.text,/CURRENT ASSESSMENT UNKNOWN/);assert.doesNotMatch(r.text,/HOLD context based|STOP LEVEL OBSERVED/);assert.match(r.text,/future/);assert.match(r.text,/source trade\/time UNKNOWN/);
});
test('actual prior close exit is not cancelled by an above-stop quote; no first-15-minutes stop rule',async t=>{
 const r=await pre(t,{signals:{session:'2026-11-06',generatedAt:'2026-11-07T01:00:00Z',posVerdict:{AAA:'SELL: existing close-based exit'}}});
 assert.match(r.text,/RECORDED CLOSE-BASED EXIT, session 2026-11-06/);assert.match(r.text,/not withdrawn by a later quote/);assert.doesNotMatch(r.text,/SELL at the open \(after the first 15 minutes\)/);assert.match(r.text,/adds no 15-minute delay/);
});
test('actual provider delay crossing the open and send-time expiry suppress transport',async t=>{
 const late=await pre(t,{fetchAdvance:50*60000});assert.equal(late.calls,0);assert.match(late.out,/session changed before rendering/);
 const expired=await pre(t,{sendAdvance:6*60000});assert.equal(expired.calls,0);assert.match(expired.out,/LOCAL_EVIDENCE_REFUSAL/);
});
test('actual retry and multipart boundaries recheck freshness; ambiguous sends are never blindly replayed',async t=>{
 const limited=await pre(t,{rows:{AAA:{latestTrade:{p:9,t:iso(T-299900)}}},mode:'429',afterReplyAdvance:1000});assert.equal(limited.calls,1);assert.match(limited.out,/LOCAL_EVIDENCE_REFUSAL/);
 const ambiguous=await pre(t,{mode:'ambiguous'});assert.equal(ambiguous.calls,1);assert.match(ambiguous.out,/NETWORK_ERROR/);
 const positions={},rows={};for(let i=0;i<15;i++){const sym='AA'+String.fromCharCode(65+i);positions[sym]={entry:10,stop:8};rows[sym]={latestTrade:{p:9,t:iso(T-60000)}};}
 const partial=await pre(t,{positions,rows,afterReplyAdvance:6*60000});assert.equal(partial.calls,1);assert.match(partial.out,/acknowledged parts 1\//);assert.match(partial.out,/LOCAL_EVIDENCE_REFUSAL/);
});
test('nightly saved-result evidence distinguishes late/unknown from not-due, without dispatch or deadline changes',()=>{
 const old={session:'2026-11-06',generatedAt:'2026-11-07T01:00:32Z'};
 assert.equal(nightlyScanEvidence(old,Date.parse('2026-11-10T03:40:00Z')).state,'LATE');
 assert.equal(nightlyScanEvidence(old,Date.parse('2026-11-09T23:30:00Z')).state,'PENDING');
 const current={session:'2026-11-09',generatedAt:'2026-11-09T23:00:00Z'};
 assert.equal(nightlyScanEvidence(current,Date.parse('2026-11-10T03:40:00Z')).state,'CURRENT');
 assert.equal(nightlyScanEvidence({...current,generatedAt:'2026-11-11T00:00:00Z'},Date.parse('2026-11-10T03:40:00Z')).state,'UNKNOWN');
 assert.equal(nightlyScanEvidence(null,Date.parse('2026-11-10T03:40:00Z')).state,'UNKNOWN');
});
test('shared actual transport callback refuses before fetch and classifies its own exception as local',async()=>{
 let calls=0;const x=await sendTelegramMessage({token:'synthetic',chat:'synthetic',text:'invented',currentEvidence:()=>{throw Error('synthetic');},fetcher:async()=>{calls++;}});
 assert.equal(calls,0);assert.equal(x.reason,'LOCAL_EVIDENCE_REFUSAL');assert.equal(x.definitelyUnsent,true);
});
test('radar report explicitly retains legacy model and 15:00 endpoint limits without rewriting economics',()=>{
 const ledger=[{type:'list',d:'2026-11-09',sym:'ZZZ',panel:'A',px:10},{type:'close',d:'2026-11-09',sym:'ZZZ',px:11,mkt:0}];
 const before=JSON.stringify(ledger),n=netOf(10,11),text=buildClose('2026-11-09',{day:'2026-11-09',missed:[],tally:{},alerts:0},ledger,{});
 assert.equal(netOf(10,11),n);assert.equal(JSON.stringify(ledger),before);assert.match(text,/15:00 New York endpoint, NOT the 16:00 cash close/);assert.match(text,/legacy MODELED net/);assert.match(text,/corporate-action\/split reconciliation remain UNKNOWN/);assert.match(text,/not executable whole shares/);assert.match(text,/Selected-day gains are not evidence of an edge/);assert.equal(scoreboard(ledger).panels.A.n,1);
});

function dailyValues(end){
 const out=[];let ms=Date.parse(end+'T12:00:00Z');while(out.length<300){const d=new Date(ms);if(d.getUTCDay()!==0&&d.getUTCDay()!==6)out.push(d.toISOString().slice(0,10));ms-=864e5;}
 return out.reverse().map((d,i)=>({datetime:d,open:String(10+i*.01),high:String(10.2+i*.01),low:String(9.8+i*.01),close:String(10+i*.01),volume:'1000000'}));
}
async function holdingsFixture(t,{end='2026-11-09',age=60000,dated=true}={}){
 const clock={now:Date.parse('2026-11-10T15:00:00Z')},sent=[];
 const server=http.createServer((req,res)=>{let b='';req.on('data',x=>b+=x);req.on('end',()=>{
  res.setHeader('Content-Type','application/json');
  if(req.url.includes('/sendMessage')){sent.push(JSON.parse(b).text);return res.end(JSON.stringify({ok:true,result:{message_id:sent.length}}));}
  if(req.url.includes('/time_series'))return res.end(JSON.stringify({values:dailyValues(end)}));
  if(req.url.includes('/quote?'))return res.end(JSON.stringify({c:7,...(dated?{t:(clock.now-age)/1000}:{})}));
  if(req.url.includes('/stock/split'))return res.end('[]');
  res.end(JSON.stringify({values:[],splits:[],earningsCalendar:[]}));
 });});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port,old=Date.now;Date.now=()=>clock.now;t.after(()=>{Date.now=ORIGINAL_NOW;process.chdir(root);});
 const S=await loadScan({files:{'data/settings.json':{focus:false},'data/signals.json':{session:'2026-11-09',generatedAt:'2026-11-09T23:00:00Z'},'data/my-positions.json':{ZZA:{entry:10,stop:8,kind:'quick',q:'gap',since:'2026-11-06'}}},env:{TD_BASE:base,FH_BASE:base,SEC_BASE:base,FINNHUB_KEY:'synthetic',TG_BASE:base,TG_TOKEN:'synthetic',TG_CHAT:'synthetic'}});
 return {S,clock,sent,sig:{session:'2026-11-09',generatedAt:'2026-11-09T23:00:00Z'},pos:{ZZA:{entry:10,stop:8,kind:'quick',q:'gap',since:'2026-11-06'}}};
}
test('actual holdings caller does not turn stale or undated quotes into stop-reached facts',async t=>{
 for(const spec of [{age:3600000},{dated:false}]){
  const f=await holdingsFixture(t,spec),text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC HOLDINGS',false);
  assert.match(text,/close-based 2026-11-09/);assert.match(text,/current stop UNKNOWN/);assert.doesNotMatch(text,/the stop 8.00 is reached|SELL ALL\. the stop/);
 }
});
test('actual stale-close caller preserves original position and recorded exit instead of minting a current HOLD',async t=>{
 const f=await holdingsFixture(t,{end:'2026-11-06',age:3600000});f.pos.ZZA.exitFlag={d:'2026-11-06',why:'existing close-based exit'};f.pos.ZZA.lastAct={act:'SELL ALL',d:'2026-11-06',since:'2026-11-06'};const before=JSON.stringify(f.pos);
 const text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC HOLDINGS',false);
 assert.match(text,/ASSESSMENT UNKNOWN/);assert.match(text,/RECORDED CLOSE-BASED EXIT dated 2026-11-06/);assert.match(text,/existing instruction is not cancelled/);assert.equal(JSON.stringify(f.pos),before);assert.doesNotMatch(text,/ZZA[^\n]*: HOLD,/);
});
test('actual fresh stop, send-time expiry and private-body logging boundaries preserve the adopted thresholds',async t=>{
 const f=await holdingsFixture(t),text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC HOLDINGS',false);
 assert.match(text,/the stop 8.00 is reached/);assert.match(text,/do not sell twice/);
 const before=f.S.read('data/my-positions.json');f.clock.now+=4*60000;const r=await f.S.fn('telegram')(text+'\nSYNTHETIC footer');
 assert.equal(r.ok,false);assert.equal(r.reason,'PRICE_EVIDENCE_EXPIRED');assert.equal(f.sent.length,0);assert.equal(f.S.read('data/my-positions.json'),before);
});
test('actual review and holdings keep a fresh stop fact even when the daily assessment is stale',async t=>{
 const f=await holdingsFixture(t,{end:'2026-11-06'}),review=await f.S.fn('reviewReply')('ZZA',f.sig,f.pos),text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC HOLDINGS',false);
 assert.match(review,/STOP LEVEL REACHED/);assert.match(review,/do not sell again/);assert.match(text,/the stop 8.00 is reached/);assert.doesNotMatch(text,/ZZA[^\n]*: HOLD,/);
});
test('all actual caller requests stayed on loopback',()=>assert.deepEqual(blocked,[]));
