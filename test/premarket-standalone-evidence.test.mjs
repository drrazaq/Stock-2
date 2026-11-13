// All holdings, messages, prices and credentials below are invented. Loopback only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import http from 'node:http';
import {spawn} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {marketClock,completedMarketSession,nightlyScanEvidence} from '../market-session.mjs';




const ORIGINAL_NOW=Date.now;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),T=Date.parse('2026-11-09T13:40:00Z'),iso=x=>new Date(x).toISOString();
async function pre(t,{now=T,positions={AAA:{entry:10,stop:8}},signals={session:'2026-11-06',generatedAt:'2026-11-07T01:00:00Z'},actions={sells:[]},rows,fetchAdvance=0,sendAdvance=0,afterReplyAdvance=0,mode='ack',feedStatus=200}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'premarket-evidence-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const f of ['premarket-check.mjs','market-session.mjs','stop-watch.mjs','alpaca-feed.mjs','market-symbol.mjs','signals-read.mjs'])fs.copyFileSync(path.join(root,f),path.join(dir,f));fs.mkdirSync(path.join(dir,'data'),{recursive:true});
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
