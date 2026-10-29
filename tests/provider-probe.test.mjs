import test from 'node:test';
import assert from 'node:assert/strict';
import {probeProviders} from '../tools/provider-readiness-probe.mjs';
test('probe only reads whitelisted endpoints and never emits credentials or raw payloads',async()=>{
 const calls=[];const report=await probeProviders({env:{MASSIVE_KEY:'do-not-print',ALPACA_KEY:'do-not-print',ALPACA_SECRET:'do-not-print',FINNHUB_KEY:'do-not-print'},fetcher:async(u,o)=>{calls.push({u,o});assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.match(new URL(u).hostname,/^(api.massive.com|data.alpaca.markets|finnhub.io|www.sec.gov)$/);return {ok:false,status:403,headers:{get:()=>null}};}});
 assert.equal(calls.length,5);assert.doesNotMatch(JSON.stringify(report),/do-not-print|apiKey=|APCA-API-SECRET/);assert.equal(report.claims.accountPlan,'NOT_INFERRED');
});
test('probe skips unavailable secrets and stops the Alpaca sequence on rate limiting',async()=>{
 const calls=[];const r=await probeProviders({env:{ALPACA_KEY:'fixture',ALPACA_SECRET:'fixture'},fetcher:async u=>{calls.push(u);return {ok:false,status:429,headers:{get:()=>null}};}});
 assert.equal(r.results.find(x=>x.provider==='ALPACA_IEX').status,'SKIPPED_RATE_LIMIT');assert.equal(calls.filter(x=>x.includes('alpaca')).length,1);
 assert.equal(r.results.find(x=>x.provider==='MASSIVE_SNAPSHOT').status,'NOT_CONFIGURED');
});
test('freshness measurements retain regular versus outside-session context',async()=>{
 for(const [at,state] of [['2026-10-29T04:41:00Z','OVERNIGHT'],['2026-10-29T14:00:00Z','REGULAR'],['2026-10-29T22:00:00Z','POSTMARKET']]){
  const r=await probeProviders({now:Date.parse(at),fetcher:async()=>({ok:false,status:403})});assert.equal(r.session.state,state);
 }
});
