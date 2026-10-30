import fs from 'node:fs';
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

test('future price clocks are counted separately and never lower measured provider age',async()=>{
 const now=Date.parse('2026-10-29T14:00:00Z'),r=await probeProviders({env:{MASSIVE_KEY:'fixture'},now,fetcher:async u=>({ok:true,status:200,json:async()=>String(u).includes('massive')?{tickers:[{ticker:'AAA',lastTrade:{p:10,t:(now+60000)*1e6}},{ticker:'BBB',lastTrade:{p:10,t:(now-60000)*1e6}}]}:{}})});
 const p=r.results.find(x=>x.provider==='MASSIVE_SNAPSHOT');assert.equal(p.futureTimestamp,1);assert.equal(p.fresh,1);assert.equal(p.priceAgeP95Min,1);
});

test('editing diagnostic source cannot automatically activate provider credentials',()=>{
 const workflow=fs.readFileSync(new URL('../.github/workflows/provider-readiness-probe.yml',import.meta.url),'utf8');
 assert.match(workflow,/workflow_dispatch:/);assert.doesNotMatch(workflow,/^\s+push:/m);assert.doesNotMatch(workflow,/^\s+schedule:/m);
});


test('Alpaca diagnostic rejects unsolicited and malformed maps without claiming access',async()=>{
 for(const payload of [{OTHER:{latestTrade:{p:10}}},{AAPL:[]},{AAPL:{latestTrade:'bad'}},[],null]){
  const r=await probeProviders({env:{ALPACA_KEY:'fixture',ALPACA_SECRET:'fixture'},fetcher:async()=>({ok:true,status:200,json:async()=>payload})});
  for(const provider of ['ALPACA_SIP','ALPACA_IEX']){
   const row=r.results.find(x=>x.provider===provider);assert.equal(row.status,'NETWORK_OR_PARSE_ERROR');assert.equal(row.access,undefined);
  }
 }
});
test('empty and partial Alpaca responses retain missing-symbol evidence',async()=>{
 for(const payload of [{},{AAPL:{latestTrade:null}}]){
  const r=await probeProviders({env:{ALPACA_KEY:'fixture',ALPACA_SECRET:'fixture'},fetcher:async()=>({ok:true,status:200,json:async()=>payload})});
  const row=r.results.find(x=>x.provider==='ALPACA_SIP');assert.equal(row.received,Object.keys(payload).length);
  assert.equal(row.missingSymbols.length,3-Object.keys(payload).length);
  assert.equal(row.access,Object.keys(payload).length?'SNAPSHOT_ROWS_OBSERVED':'NO_SNAPSHOT_ROWS');assert.equal(row.fresh,0);
 }
});
test('price, executable BBO and volume freshness never borrow one another clocks',async()=>{
 const now=Date.parse('2026-10-29T14:00:00Z'),at=delta=>new Date(now+delta).toISOString();
 const payload={AAPL:{latestTrade:{p:10,t:at(-60000)},latestQuote:{bp:9,ap:11,t:at(-900000)},dailyBar:{v:100,t:at(60000)}},SPY:{latestTrade:{p:10},latestQuote:{bp:11,ap:9,t:at(-60000)}},'BRK.B':{latestTrade:null}};
 const r=await probeProviders({now,env:{ALPACA_KEY:'fixture',ALPACA_SECRET:'fixture'},fetcher:async()=>({ok:true,status:200,json:async()=>payload})});
 const sip=r.results.find(x=>x.provider==='ALPACA_SIP'),iex=r.results.find(x=>x.provider==='ALPACA_IEX');
 assert.equal(sip.fields.price.fresh,1);assert.equal(sip.fields.price.unknownTimestamp,2);
 assert.equal(sip.fields.bbo.fresh,0);assert.equal(sip.fields.bbo.ageP95Min,15);
 assert.equal(sip.fields.volume.futureTimestamp,1);assert.equal(sip.fields.volume.fresh,0);
 assert.equal(iex.fields.volume.unknownTimestamp,3);assert.equal(iex.fields.volume.fresh,0);
});
test('Massive denominator excludes invalid and duplicate identities and retains raw counts',async()=>{
 const now=Date.parse('2026-10-29T14:00:00Z');
 const r=await probeProviders({now,env:{MASSIVE_KEY:'fixture'},fetcher:async u=>({ok:true,status:200,json:async()=>String(u).includes('massive')?{tickers:[null,{ticker:'bad symbol'},{ticker:'AAPL',lastTrade:{p:10,t:now*1e6}},{ticker:'AAPL',lastTrade:{p:10,t:now*1e6}}]}:{}})});
 const row=r.results.find(x=>x.provider==='MASSIVE_SNAPSHOT');assert.equal(row.receivedRaw,4);assert.equal(row.received,1);assert.equal(row.invalidSymbols,2);assert.equal(row.duplicateSymbols,1);assert.equal(row.fresh,1);
});
