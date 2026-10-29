import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createResearchCollector,researchSession} from '../research-collector.mjs';
const start=Date.parse('2026-11-27T09:00:00Z'),at=m=>start+m*60000;
const tick=(now,p=10.1)=>({ticker:'AAA',lastTrade:{p,t:(now-1000)*1e6},prevDay:{c:10,v:1e6},lastQuote:{p:p-.01,P:p+.01,t:(now-1000)*1e6}});
const response=(payload,status=200,retry=null)=>({ok:status===200,status,headers:{get:k=>k==='retry-after'?retry:null},json:async()=>payload});
test('premarket window respects NY timezone, half-day, reviewed calendar and DST',()=>{
 assert.equal(researchSession(start).eligible,true);assert.equal(researchSession(at(330)).eligible,false);
 assert.equal(researchSession(Date.parse('2026-11-26T09:00:00Z')).eligible,false);
 assert.equal(researchSession(Date.parse('2028-01-03T10:00:00Z')).eligible,false);
 assert.equal(researchSession(Date.parse('2026-10-29T08:00:00Z')).minute,240);
});
test('full 330-minute fixture records stale/future prices, duplicate symbols, news and interruptions truthfully',async()=>{
 let now=start;const calls=[];const c=createResearchCollector({env:{MASSIVE_KEY:'fixture',FINNHUB_KEY:'fixture',TG_TOKEN:'must-not-use',ALPACA_KEY:'must-not-use'},fetcher:async(u,o)=>{
  calls.push(u);assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.ok(o.signal);assert.doesNotMatch(u,/alpaca|telegram/);
  if(u.includes('finnhub'))return response([{id:1,headline:'Fixture',related:'AAA',datetime:(start-1000)/1000},{id:2,headline:'Future',related:'AAA',datetime:(at(400))/1000}]);
  if(now>=at(60)&&now<at(70))return response({},503);
  return response({tickers:[tick(now,now<at(200)?10.1:11.2),tick(now-1000000),{ticker:'STALE',lastTrade:{p:10,t:(now-900000)*1e6},prevDay:{c:10}},{ticker:'FUTURE',lastTrade:{p:10,t:(now+10000)*1e6},prevDay:{c:10}},null,{ticker:'bad symbol'}]});}});
 let final;
 for(let m=0;m<330;m++){now=at(m);final=await c.cycle({now});if(m===0){assert.equal(final.metrics.uniqueSymbols,3);assert.equal(final.metrics.duplicateSymbols,1);assert.equal(final.metrics.invalidRows,2);assert.equal(final.metrics.freshPrices,1);assert.equal(final.metrics.futurePriceClocks,1);assert.equal(final.news.length,1);}}
 assert.equal(c.state.minutes.length,330);assert.equal(c.state.requests,396);assert.equal(c.state.sourceCounts['MASSIVE_FULL_SNAPSHOT:HTTP_ERROR'],10);assert.equal(final.claims.approvedBuy,false);
 const r=c.report(new Date(at(329)).toISOString());assert.equal(r.lanes.find(x=>x.lane==='NEWS_CATALYST').beforeObservedPlus10,1);assert.equal(r.priceCoverage.noFreshPriceCycles,10);
 assert.equal(final.discovery.sources[0].status,'NOT_APPLICABLE_PREMARKET');
 const n=calls.length;assert.equal((await c.cycle({now})).status,'DUPLICATE_CYCLE');assert.equal(calls.length,n);
});
test('403 is an error, 429 observes cooldown, and request budgets never become partial whole-market success',async()=>{
 let status=429,calls=0;const c=createResearchCollector({env:{MASSIVE_KEY:'fixture'},maxRequests:2,fetcher:async()=>{calls++;return response({},status,'120');}});
 assert.equal((await c.cycle({now:start})).providers[0].status,'RATE_LIMITED');
 assert.equal((await c.cycle({now:at(1)})).providers[0].status,'RATE_LIMIT_COOLDOWN');assert.equal(calls,1);
 status=403;assert.equal((await c.cycle({now:at(2)})).providers[0].httpStatus,403);
 assert.equal((await c.cycle({now:at(3)})).providers[0].status,'REQUEST_BUDGET_EXHAUSTED');assert.equal(calls,2);
});
test('bad schema, malformed JSON and arbitrary endpoint overrides cannot establish coverage',async()=>{
 assert.throws(()=>createResearchCollector({env:{MASSIVE_BASE:'https://api.alpaca.markets'}}),/BLOCKED/);
 for(const r of [response({message:'denied'}),{ok:true,status:200,json:async()=>{throw Error();}}]){
  const c=createResearchCollector({env:{MASSIVE_KEY:'fixture'},fetcher:async()=>r}),v=await c.cycle({now:start});assert.equal(v.status,'NO_FRESH_PRICES');assert.equal(v.lastSuccessfulCycle,null);
 }
});
test('real collector CLI is fixture-only by default, writes isolated compressed artifacts, and refuses missing live approval',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-collector-')),script=new URL('../tools/research-collector.mjs',import.meta.url).pathname;
 try{
  fs.writeFileSync(path.join(dir,'fixture.json'),JSON.stringify({cycles:[{at:new Date(start).toISOString(),responses:[{tickers:[tick(start)]},[]]}]}));
  const r=spawnSync(process.execPath,[script,'--fixture','fixture.json'],{cwd:dir,env:{PATH:process.env.PATH},encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).cycles,1);assert.equal(fs.existsSync(path.join(dir,'data')),false);assert.ok(fs.existsSync(path.join(dir,'research-output/fixture/000.json.gz')));
  const denied=spawnSync(process.execPath,[script,'--collect','missing.json'],{cwd:dir,env:{PATH:process.env.PATH},encoding:'utf8'});assert.notEqual(denied.status,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
