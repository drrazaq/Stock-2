import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditAlpaca,summarizeAlpaca,auditSession,AUDIT_SYMBOLS,AUDIT_LIMITS} from '../tools/alpaca-access-audit.mjs';
const at=Date.parse('2026-10-29T11:50:00Z'),iso=delta=>new Date(at+delta).toISOString();
const snap=(tradeAge=1000,quoteAge=1000)=>({latestTrade:{p:10,t:iso(-tradeAge)},latestQuote:{bp:9.99,ap:10.01,t:iso(-quoteAge)}});
const response=(j,status=200,headers={})=>new Response(JSON.stringify(j),{status,headers});
const env={ALPACA_KEY:'fixture-no-print',ALPACA_SECRET:'fixture-no-print'};
test('trade and BBO clocks are independent; missing symbols remain in denominator',()=>{
 const {summary:s}=summarizeAlpaca({AAPL:snap(1000,900000),SPY:snap(900000,1000)},{now:at,requested:['AAPL','SPY','MSFT']});
 assert.equal(s.trade.fresh,1);assert.equal(s.quote.fresh,1);assert.equal(s.quote.freshPctOfRequested,100/3);assert.deepEqual(s.missingRequested,['MSFT']);assert.ok(s.freshQuoteSpreadP95Bps>0);
});
test('future, unknown, crossed, nonnumeric and unsolicited data never establish freshness',()=>{
 const j={AAPL:snap(-1000,-1000),SPY:{latestTrade:{p:'10',t:iso(-1000)},latestQuote:{bp:11,ap:10,t:iso(-1000)}},MSFT:{latestTrade:{p:10}},EVIL:snap()};
 const s=summarizeAlpaca(j,{now:at,requested:['AAPL','SPY','MSFT']}).summary;
 assert.equal(s.trade.fresh,0);assert.equal(s.quote.fresh,0);assert.equal(s.trade.futureClock,1);assert.equal(s.trade.unknownClock,1);assert.equal(s.unexpectedSymbols,1);
});
test('all audit calls are bounded GETs to fixed data/asset origins; no orders or secrets retained',async()=>{
 const calls=[];const r=await auditAlpaca({env,now:()=>at,fetcher:async(u,o)=>{
  calls.push(u);assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.ok(o.signal);const url=new URL(u);assert.ok(['https://data.alpaca.markets','https://paper-api.alpaca.markets'].includes(url.origin));assert.doesNotMatch(url.pathname,/orders|account|positions/);
  if(url.pathname==='/v2/assets')return response([{symbol:'AAPL',status:'active',class:'us_equity',tradable:true},{symbol:'MSFT',status:'active',class:'us_equity',tradable:true}]);
  if(url.pathname.endsWith('trades/latest'))return response({trades:{AAPL:{p:10,t:iso(-1000)}}});
  if(url.pathname.endsWith('quotes/latest'))return response({quotes:{AAPL:{bp:10,ap:10.01,t:iso(-1000)}}});
  if(url.pathname.endsWith('/trades'))return response({trades:{AAPL:[{p:10,t:iso(-1000)}]},next_page_token:'opaque-do-not-store'});
  if(url.pathname.endsWith('/quotes'))return response({quotes:{SPY:[{bp:10,ap:10.01,t:iso(-1000)}]}});
  return response({AAPL:snap()});
 }});
 assert.equal(calls.length,11);assert.equal(r.budget.requests,11);assert.equal(r.coverage.sip.tradableMissing,1);assert.equal(r.results.find(x=>x.id==='sip_recent_trades').measurements.hasMore,true);
 assert.equal(r.claims.wholeMarketRealTimeDiscovery,'NOT_ESTABLISHED');assert.doesNotMatch(JSON.stringify(r),/fixture-no-print|opaque-do-not-store|APCA-API/);assert.equal(r.session.state,'PREMARKET');
});
test('403 isolates refused feed; 401 and 429 stop subsequent calls without fallback retries',async()=>{
 for(const status of [401,403,429]){
  let calls=0;const r=await auditAlpaca({env,now:()=>at,fetcher:async()=>{calls++;return response({},status);}});
  assert.equal(calls,status===403?3:1);assert.equal(r.results.filter(x=>x.status==='OBSERVED').length,0);assert.equal(r.budget.requests,calls);
 }
});
test('missing credentials make zero requests and cannot imply entitlement',async()=>{
 let calls=0;const r=await auditAlpaca({now:()=>at,fetcher:()=>{calls++;}});assert.equal(calls,0);assert.ok(r.results.every(x=>x.status==='NOT_CONFIGURED'));assert.deepEqual(r.coverage,{});
});
test('response size and global wall budget stop further network attempts',async()=>{
 let calls=0;const r=await auditAlpaca({env,now:()=>at,fetcher:async()=>{calls++;return response({},200,{'content-length':String(AUDIT_LIMITS.responseBytes+1)});}});assert.equal(calls,1);assert.equal(r.stopReason,'BYTE_LIMIT');
 let n=0;const timed=await auditAlpaca({env,now:()=>n++===0?at:at+AUDIT_LIMITS.wallMs,fetcher:()=>{throw Error('must not fetch');}});assert.equal(timed.budget.requests,0);assert.equal(timed.stopReason,'BUDGET_EXHAUSTED');
});
test('malformed or error-shaped successful responses do not establish working endpoints',async()=>{
 const r=await auditAlpaca({env,now:()=>at,fetcher:async()=>response({message:'error fixture-no-print'})});assert.ok(r.results.every(x=>x.status==='FAILED'));assert.deepEqual(r.coverage,{});assert.doesNotMatch(JSON.stringify(r),/fixture-no-print/);
});
test('sample is fixed and quote width arithmetic remains finite for extreme numeric data',()=>{
 assert.equal(AUDIT_SYMBOLS.length,24);const s=summarizeAlpaca({AAPL:{latestQuote:{bp:1,ap:1e308,t:iso(-1)}}},{now:at,requested:['AAPL']}).summary;assert.ok(Number.isFinite(s.freshQuoteSpreadP95Bps));
 assert.equal(auditSession(Date.parse('2026-11-27T18:00:00Z')).state,'POSTMARKET');
});
test('completed diagnostic cannot automatically run or access any credentials',()=>{
 const w=fs.readFileSync(new URL('../.github/workflows/alpaca-access-audit.yml',import.meta.url),'utf8');assert.doesNotMatch(w,/schedule:|push:|contents: write|secrets\.|node tools\//);assert.match(w,/workflow_dispatch:/);assert.match(w,/RETIRED/);assert.match(w,/timeout-minutes: 1/);
});
