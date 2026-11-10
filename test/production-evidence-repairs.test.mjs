// All holdings, messages, prices and credentials below are invented. Loopback only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {marketClock,completedMarketSession,nightlyScanEvidence} from '../market-session.mjs';
import {copyFixtureModuleClosure} from './watcher-contract-profile.mjs';
import {loadScan,blocked} from './load-scan.mjs';
import {sendTelegramMessage,telegramFetch} from '../telegram-delivery.mjs';
import {buildClose,buildMidday,netOf,scoreboard} from '../radar-v3-core.mjs';
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
 assert.match(r.text,/RECORDED CLOSE-BASED EXIT, session 2026-11-06/);assert.match(r.text,/not withdrawn by a later quote/);assert.match(r.text,/PRICE CONTEXT ONLY; the recorded exit above stands/);assert.doesNotMatch(r.text,/HOLD context|: WATCH,/);assert.doesNotMatch(r.text,/SELL at the open \(after the first 15 minutes\)/);assert.match(r.text,/does not change the adopted rule's execution timing/);assert.match(r.text,/No 15-minute stop delay/);
});
test('actual ACTIONS recorded exit also prevents a fresh above-stop HOLD or WATCH',async t=>{
 const r=await pre(t,{actions:{at:'2026-11-07T01:00:00Z',sells:[{sym:'AAA',why:'existing rule exit'}]}});
 assert.match(r.text,/RECORDED ACTIONS EXIT/);assert.match(r.text,/PRICE CONTEXT ONLY; the recorded exit above stands/);assert.doesNotMatch(r.text,/HOLD context|: WATCH,/);
 const stopped=await pre(t,{signals:{session:'2026-11-06',generatedAt:'2026-11-07T01:00:00Z',posVerdict:{AAA:'existing rule exit'}},rows:{AAA:{latestTrade:{p:7,t:iso(T-60000)}}}});
 assert.match(stopped.text,/STOP LEVEL OBSERVED/);assert.doesNotMatch(stopped.text,/HOLD context|: WATCH,/);
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
 assert.equal(nightlyScanEvidence({...current,generatedAt:'2026-11-09T13:00:00Z'},Date.parse('2026-11-10T03:40:00Z')).state,'UNKNOWN');
});
test('shared actual transport callback refuses before fetch and classifies its own exception as local',async()=>{
 let calls=0;const x=await sendTelegramMessage({token:'synthetic',chat:'synthetic',text:'invented',currentEvidence:()=>{throw Error('synthetic');},fetcher:async()=>{calls++;}});
 assert.equal(calls,0);assert.equal(x.reason,'LOCAL_EVIDENCE_REFUSAL');assert.equal(x.definitelyUnsent,true);
});
test('radar report explicitly retains legacy model and 15:00 endpoint limits without rewriting economics',()=>{
 const ledger=[{type:'list',d:'2026-11-09',sym:'ZZZ',panel:'A',px:10},{type:'close',d:'2026-11-09',sym:'ZZZ',px:11,mkt:0}];
 const before=JSON.stringify(ledger),n=netOf(10,11),text=buildClose('2026-11-09',{day:'2026-11-09',missed:[],tally:{},alerts:0},ledger,{});
 assert.equal(netOf(10,11),n);assert.equal(JSON.stringify(ledger),before);assert.match(text,/WATCHER ENDPOINT REVIEW/);assert.doesNotMatch(text,/AFTER THE CLOSE/);assert.match(text,/15:00 New York endpoint, NOT the 16:00 cash close/);assert.match(text,/actual 15:00 trade is not established/);assert.match(text,/legacy MODELED net/);assert.match(text,/corporate-action\/split reconciliation remain UNKNOWN/);assert.match(text,/not executable whole shares/);assert.match(text,/Selected-day gains are not evidence of an edge/);assert.equal(scoreboard(ledger).panels.A.n,1);
});

function dailyValues(end){
 const out=[];let ms=Date.parse(end+'T12:00:00Z');while(out.length<300){const d=new Date(ms);if(d.getUTCDay()!==0&&d.getUTCDay()!==6)out.push(d.toISOString().slice(0,10));ms-=864e5;}
 return out.reverse().map((d,i)=>({datetime:d,open:String(10+i*.01),high:String(10.2+i*.01),low:String(9.8+i*.01),close:String(10+i*.01),volume:'1000000'}));
}
async function holdingsFixture(t,{end='2026-11-09',age=60000,dated=true,bars=300,deliveryMode='ack',afterSendAdvance=0}={}){
 const clock={now:Date.parse('2026-11-10T15:00:00Z')},sent=[],requests=[];
 const server=http.createServer((req,res)=>{requests.push(req.url);let b='';req.on('data',x=>b+=x);req.on('end',()=>{
  res.setHeader('Content-Type','application/json');
  if(req.url.includes('/sendMessage')){sent.push(JSON.parse(b).text);clock.now+=afterSendAdvance;if(deliveryMode==='ambiguous'||deliveryMode==='stopAmbiguous'&&sent.at(-1).startsWith('YOUR STOPS')){res.destroy();return;}if(deliveryMode==='stop429'&&sent.at(-1).startsWith('YOUR STOPS')&&sent.filter(x=>x.startsWith('YOUR STOPS')).length===1){clock.now+=5*60000;res.statusCode=429;return res.end(JSON.stringify({ok:false,parameters:{retry_after:0}}));}if(deliveryMode==='429'&&sent.length===1){res.statusCode=429;return res.end(JSON.stringify({ok:false,parameters:{retry_after:0}}));}return res.end(JSON.stringify({ok:true,result:{message_id:sent.length}}));}
  if(req.url.includes('/getUpdates'))return res.end(JSON.stringify({ok:true,result:[]}));
  if(req.url.includes('/time_series'))return res.end(JSON.stringify({values:dailyValues(end).slice(-bars)}));
  if(req.url.includes('/quote?'))return res.end(JSON.stringify({c:7,...(dated?{t:(clock.now-age)/1000}:{})}));
  if(req.url.includes('/stock/split'))return res.end('[]');
  res.end(JSON.stringify({values:[],splits:[],earningsCalendar:[]}));
 });});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());const base='http://127.0.0.1:'+server.address().port,old=Date.now;Date.now=()=>clock.now;t.after(()=>{Date.now=ORIGINAL_NOW;process.chdir(root);});
 const S=await loadScan({files:{'data/settings.json':{focus:false},'data/signals.json':{session:'2026-11-09',generatedAt:'2026-11-09T23:00:00Z'},'data/my-positions.json':{ZZA:{entry:10,stop:8,kind:'quick',q:'gap',since:'2026-11-06'}}},env:{TD_BASE:base,FH_BASE:base,SEC_BASE:base,FINNHUB_KEY:'synthetic',TG_BASE:base,TG_TOKEN:'synthetic',TG_CHAT:'synthetic'}});
 return {S,clock,sent,requests,sig:{session:'2026-11-09',generatedAt:'2026-11-09T23:00:00Z'},pos:{ZZA:{entry:10,stop:8,kind:'quick',q:'gap',since:'2026-11-06'}}};
}
test('actual holdings caller does not turn stale or undated quotes into stop-reached facts',async t=>{
 for(const spec of [{age:3600000},{dated:false}]){
  const f=await holdingsFixture(t,spec);f.pos.ZZA.stop=20;f.S.write('data/my-positions.json',f.pos);const before=f.S.read('data/my-positions.json'),text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC HOLDINGS',false);
  assert.match(text,/close-based 2026-11-09/);assert.match(text,/current stop UNKNOWN/);assert.doesNotMatch(text,/the stop 20.00 is reached|SELL ALL\. the stop/);assert.equal(f.S.read('data/my-positions.json'),before);
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
 assert.match(review,/STOP LEVEL REACHED/);assert.doesNotMatch(review.split('\n')[0],/as of .* close/);assert.match(review,/do not sell again/);assert.match(text,/the stop 8.00 is reached/);assert.doesNotMatch(text,/ZZA[^\n]*: HOLD,/);
});

test('actual when-to-sell caller separates stale quote, dated exit and current stop; send expiry is checked',async t=>{
 for(const spec of [{age:3600000},{dated:false}]){
  const f=await holdingsFixture(t,spec),text=await f.S.fn('sellReply')('ZZA',f.sig,f.pos);
  assert.match(text,/HOLD context as of 2026-11-09 close only/);assert.match(text,/Current stop observation: UNKNOWN/);assert.doesNotMatch(text,/SELL NOW:|stop 8.00 is reached/);
 }
 const f=await holdingsFixture(t),text=await f.S.fn('sellReply')('ZZA',f.sig,f.pos);assert.match(text,/do not sell again/);assert.match(text,/observed/);
 const before=f.S.read('data/my-positions.json');f.clock.now+=4*60000;const r=await f.S.fn('telegram')(text);assert.equal(r.ok,false);assert.equal(f.sent.length,0);assert.equal(f.S.read('data/my-positions.json'),before);
});
test('actual when-to-sell preserves old exits without stale HOLD or fresh-level calculations',async t=>{
 const f=await holdingsFixture(t,{end:'2026-11-06',age:3600000});f.sig.session='2026-11-06';f.sig.posVerdict={ZZA:'existing close-based exit'};
 const before=JSON.stringify(f.pos),text=await f.S.fn('sellReply')('ZZA',f.sig,f.pos);
 assert.match(text,/RECORDED PRIOR EXIT, source session 2026-11-06/);assert.match(text,/does not cancel it or establish a current HOLD/);assert.match(text,/Daily level\/time-exit calculation UNKNOWN or stale/);assert.doesNotMatch(text,/Not yet\. HOLD|IN ONE LINE:/);assert.equal(JSON.stringify(f.pos),before);
});
test('actual scanner sender rechecks holding evidence at retry/multipart boundaries and never replays ambiguous delivery',async t=>{
 for(const deliveryMode of ['429','ack','ambiguous']){
  const f=await holdingsFixture(t,{deliveryMode,afterSendAdvance:4*60000}),text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC HOLDINGS',false);
  const before=f.S.read('data/my-positions.json'),r=await f.S.fn('telegram')(deliveryMode==='ack'?text+'\n'+'SYNTHETIC '.repeat(900):text);
  assert.equal(r.ok,false);assert.equal(f.sent.length,1);assert.equal(r.reason,deliveryMode==='ambiguous'?'NETWORK_ERROR':'PRICE_EVIDENCE_EXPIRED');assert.equal(f.S.read('data/my-positions.json'),before);
 }
});
test('bounded evidence registry never evicts the guard from a previously rendered report',async t=>{
 const f=await holdingsFixture(t),remember=f.S.fn('rememberHoldingEvidence'),check=f.S.fn('holdingSendEvidence');
 const first=remember('SYNTHETIC GUARDED 0',[n=>n<100]);for(let i=1;i<64;i++)remember('SYNTHETIC GUARDED '+i,[()=>true]);
 assert.match(remember('SYNTHETIC GUARDED overflow',[()=>true]),/ASSESSMENT UNAVAILABLE/);assert.equal(check(first,101),false);assert.equal(check(first,99),true);
});


test('actual sell-check uses structured stop evidence rather than its displayed prior close',async t=>{
 const f=await holdingsFixture(t,{age:3600000});f.pos.ZZA.stop=20;f.S.write('data/my-positions.json',f.pos);const text=await f.S.fn('sellCheckText')(f.sig);
 assert.doesNotMatch(text,/TESTED:.*at or under your stop|TESTED:.*stop 20.00 is reached/);assert.match(text,/current stop UNKNOWN/);
 const old=await holdingsFixture(t,{end:'2026-11-06',age:3600000}),unknown=await old.S.fn('sellCheckText')(old.sig);assert.match(unknown,/ASSESSMENT UNKNOWN/);
});
test('actual legacy plan and conclusion callers never treat numeric prices as timestamped holding evidence',async t=>{
 const f=await holdingsFixture(t),stale={...f.sig,session:'2026-11-06',stocks:[],quick:[],leaders:[]},current={...f.sig,stocks:[{sym:'ZZA',last:7,state:'No action'}],quick:[],leaders:[]};
 for(const name of ['planText','conclusion','conclusionLive']){
  const x=f.S.fn(name)(stale,f.pos,{ZZA:7});const text=Array.isArray(x)?x.join('\n'):x;
  assert.match(text,/ZZA: ASSESSMENT UNKNOWN/);assert.doesNotMatch(text,/ZZA: SELL NOW|ZZA \(yours\): HOLD/);
  const y=f.S.fn(name)(current,f.pos,{ZZA:7}),dated=Array.isArray(y)?y.join('\n'):y;assert.match(dated,/saved scan session 2026-11-09 is current, but this interface has no dated stock-specific assessment/);assert.match(dated,/no current HOLD inferred/);assert.match(dated,/current stop\/target observation UNKNOWN/);
 }
});
test('actual rebalancing refuses stale or undated scan basis without record mutation',async t=>{
 const f=await holdingsFixture(t),before=f.S.read('data/my-positions.json');
 for(const sig of [{session:'2026-11-06',generatedAt:'2026-11-07T01:00:00Z'}, {session:'2026-11-09'}, {session:'2026-11-09',generatedAt:'2026-11-09T13:00:00Z'}]){
  assert.match(f.S.fn('rebalanceText')(sig),/REBALANCE ASSESSMENT UNKNOWN/);assert.equal(f.S.read('data/my-positions.json'),before);
 }
});
test('saved-close identity requires dated generation after that source session actually completed',async t=>{
 const f=await holdingsFixture(t),current=f.S.fn('scanCloseCurrent');assert.equal(current(f.sig),true);
 for(const generatedAt of [undefined,'2026-11-09T23:00:00','2026-11-09T13:00:00Z','2026-11-11T00:00:00Z'])assert.equal(current({...f.sig,generatedAt}),false);
});


test('actual scanner sender classifies an evidence-check exception as local unsent, never transport uncertainty',async t=>{
 const f=await holdingsFixture(t),before=f.S.read('data/my-positions.json'),r=await f.S.fn('telegram')('SYNTHETIC LOCAL GUARD',null,()=>{throw Error('synthetic guard failure');});
 assert.equal(r.ok,false);assert.equal(r.reason,'PRICE_EVIDENCE_EXPIRED');assert.equal(r.localEvidenceRefusal,true);assert.equal(r.definitelyUnsentPart,true);assert.equal(f.sent.length,0);assert.equal(f.S.read('data/my-positions.json'),before);
});


test('actual midday report separates raw labels, retained caps and unknown total movers without inventing identities',()=>{
 const snap={day:'2026-11-09',at:'11:15',scanned:12720,live:5160,movers:[],hits:[],early:[],tally:{}},out=buildMidday(snap,{});
 assert.match(out.text,/12720 raw snapshot labels/);assert.match(out.text,/not verified common-stock identities/);assert.match(out.text,/mover population: UNKNOWN; 0 retained, cap 20/);assert.match(out.text,/cap 40/);assert.match(out.text,/headlines are context, not established market causation/);assert.deepEqual(out.rows,[]);
 const known=buildMidday({...snap,moverCount:45},{});assert.match(known.text,/mover population: 45/);
});


test('actual rebalancing retains existing stop exclusion without claiming a saved-close live crossing',async t=>{
 const f=await holdingsFixture(t);process.env.PRIVATE_KEY='SYNTHETIC_TEST_ONLY_NOT_A_CREDENTIAL';assert.equal(f.S.fn('privWrite')({shares:{ZZA:100},buys:[],budget:5000}),true);
 const before=f.S.read('data/my-positions.json'),text=f.S.fn('rebalanceText')({...f.sig,stocks:[{sym:'ZZA',last:7}]});
 assert.match(text,/DATED CLOSE \/ STOP RECONCILIATION: ZZA/);assert.match(text,/excluded from trim\/add calculations under the existing stop safeguard/);assert.doesNotMatch(text,/SELL FIRST|at or under your stop/);assert.equal(f.S.read('data/my-positions.json'),before);
});
test('actual plan and live conclusion preserve existing filing-exit rules while numeric stop claims remain unknown',async t=>{
 const f=await holdingsFixture(t);f.S.write('data/events-study.json',{fam:{X:{warn:true,name:'synthetic warning',drift:{newer:{avg:-.02,n:40,vs:-.03},older:{avg:-.02,vs:-.03}}}}});f.S.write('data/events-recent.json',{events:[{sym:'ZZA',f:'X',p:'2026-11-09T12:00:00Z'}]});
 const sig={...f.sig,stocks:[],quick:[],leaders:[]},plan=f.S.fn('planText')(sig,f.pos,{ZZA:7}),live=f.S.fn('conclusionLive')(sig,f.pos,{ZZA:7}).join('\n');
 for(const text of [plan,live]){assert.match(text,/synthetic warning/);assert.match(text,/Existing filing-based rule/);assert.doesNotMatch(text,/SELL NOW.*stop 8.00/);}
});


test('actual intraday stop fallback checks after earlier messages and at retry, preserving owner records and offsets',async t=>{
 for(const spec of [{afterSendAdvance:5*60000},{deliveryMode:'stop429'}]){
  const f=await holdingsFixture(t,spec);process.env.BOT_ONLY='';f.S.write('data/signals.json',{...f.sig,stocks:[],quick:[],leaders:[]});f.S.write('data/tg-state.json',{offset:42});
  const before=f.S.read('data/my-positions.json');await f.S.fn('intraday')(false);
  const stops=f.sent.filter(x=>x.startsWith('YOUR STOPS'));assert.equal(stops.length,spec.deliveryMode==='stop429'?1:0);
  const state=f.S.readJson('data/alert-state.json');assert.equal(state.sent.ZZAmyst,undefined);assert.equal(state.delivery?.ZZAmyst,undefined,'local refusal before any stop-part ACK remains eligible, not falsely UNKNOWN');
  assert.equal(f.S.read('data/my-positions.json'),before);assert.equal(f.S.readJson('data/tg-state.json').offset,42);
 }
});
test('actual intraday stop fallback keeps ambiguous delivery UNKNOWN without replay or owner-record edits',async t=>{
 const f=await holdingsFixture(t,{deliveryMode:'stopAmbiguous'});process.env.BOT_ONLY='';f.S.write('data/signals.json',{...f.sig,stocks:[],quick:[],leaders:[]});f.S.write('data/tg-state.json',{offset:42});
 const before=f.S.read('data/my-positions.json');await f.S.fn('intraday')(false);
 assert.equal(f.sent.filter(x=>x.startsWith('YOUR STOPS')).length,1);const state=f.S.readJson('data/alert-state.json');assert.equal(state.sent.ZZAmyst,undefined);assert.equal(state.delivery.ZZAmyst.status,'UNKNOWN');assert.equal(f.S.read('data/my-positions.json'),before);assert.equal(f.S.readJson('data/tg-state.json').offset,42);
});


test('actual short-history callers preserve own trade rules and independent current-stop evidence',async t=>{
 const f=await holdingsFixture(t,{bars:5}),text=await f.S.fn('holdingsText')(f.sig,f.pos,'SYNTHETIC SHORT HISTORY',false);
 assert.match(text,/the stop 8.00 is reached/);assert.match(text,/do not sell twice/);
 const old=await holdingsFixture(t,{end:'2026-11-06',age:3600000,bars:5});old.pos.ZZA.exitFlag={d:'2026-11-06',why:'TIME EXIT: SELL at the next open.'};const before=JSON.stringify(old.pos),raw=await old.S.fn('holdingsText')(old.sig,old.pos,null,true);
 assert.match(raw.acts.sell.join('\n'),/RECORDED CLOSE-BASED EXIT dated 2026-11-06: TIME EXIT/);assert.match(raw.acts.unknown.join('\n'),/ASSESSMENT UNKNOWN/);assert.equal(JSON.stringify(old.pos),before);
});


test('actual position save preserves byte-identical no-op input and refuses corrupt original state',async t=>{
 const f=await holdingsFixture(t),raw='{ \n "ZZA" : {"stop":8, "entry":10,"since":"2026-11-06","q":"gap","kind":"quick"}\n}\n';
 f.S.write('data/my-positions.json',raw);const candidate={ZZA:{entry:10,stop:8,kind:'quick',q:'gap',since:'2026-11-06'}};
 f.S.fn('savePos')(candidate);assert.equal(f.S.read('data/my-positions.json'),raw);
 f.S.write('data/my-positions.json','{SYNTHETIC BROKEN ORIGINAL');assert.throws(()=>f.S.fn('savePos')(candidate),/POSITION_STATE_UNREADABLE/);assert.equal(f.S.read('data/my-positions.json'),'{SYNTHETIC BROKEN ORIGINAL');
});


test('actual Telegram caller refuses corrupt positions before polling or advancing offsets',async t=>{
 const f=await holdingsFixture(t),raw='{SYNTHETIC BROKEN ORIGINAL';f.S.write('data/my-positions.json',raw);f.S.write('data/tg-state.json',{offset:42});
 await assert.rejects(f.S.fn('tgCommands')(f.sig),/POSITION_STATE_UNREADABLE/);
 assert.equal(f.requests.length,0);assert.equal(f.sent.length,0);assert.equal(f.S.read('data/my-positions.json'),raw);assert.equal(f.S.readJson('data/tg-state.json').offset,42);
});


test('actual avoid-ledger reader reports the unchanged calendar-date model without claiming gate benefit',async t=>{
 const f=await holdingsFixture(t);f.S.write('data/avoid-ledger.jsonl',[{d:'2026-10-20',sym:'ZZR',why:'lottery',px:10},{d:'2026-10-19',sym:'ZZS',why:'FADE',px:10}]);
 const text=f.S.fn('avoidLedger')([],{ZZR:11,ZZS:9}),rows=f.S.read('data/avoid-ledger.jsonl').trim().split('\n').map(JSON.parse);
 assert.equal(rows[0].pct,.1);assert.equal(rows[1].pct,-.1);assert.match(text,/UTC-date-plus-14-calendar-days rule/);assert.match(text,/raw reference-price moves/);assert.match(text,/do not show whether a restriction helped or harmed/);assert.doesNotMatch(text,/10 sessions later|avoid rules were right|rules are too strict/);
 f.S.write('data/avoid-ledger.jsonl','SYNTHETIC ORIGINAL BROKEN');assert.match(f.S.fn('avoidLedger')([{sym:'ZZR',why:'lottery'}],{ZZR:11}),/UNKNOWN/);assert.equal(f.S.read('data/avoid-ledger.jsonl'),'SYNTHETIC ORIGINAL BROKEN');
});

test('all actual caller requests stayed on loopback',()=>assert.deepEqual(blocked,[]));
