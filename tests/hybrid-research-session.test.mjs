import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeResearchUniverse,planResearchSweeps,hybridSessionState,observeResearchSweep,hybridSessionReport} from '../hybrid-research-session.mjs';
const base=Date.parse('2026-10-29T08:00:00Z'),iso=n=>new Date(n).toISOString();
const asset=(symbol,id=symbol)=>({symbol,id,status:'active',class:'us_equity',tradable:true,exchange:'TEST'});
const universe=(records=[asset('AAA'),asset('BBB')])=>freezeResearchUniverse({records,asOf:iso(base-600000),knownAt:iso(base-600000)});
const payload=(at,p=10)=>({latestTrade:{p,t:iso(at-1000)},latestQuote:{bp:p-.01,ap:p+.01,t:iso(at-1000)},prevDailyBar:{c:10}});
const responses=(plan,at)=>plan.batches.map((symbols,batch)=>({batch,feed:'sip',requestedAt:iso(at-2000),receivedAt:iso(at),httpStatus:200,rows:Object.fromEntries(symbols.map(s=>[s,payload(at)]))}));
test('reference aliases/conflicts are excluded, exact duplicates deduplicated, provenance remains unverified',()=>{
 const u=universe([asset('AAA'),asset('AAA'),asset('BBB','same'),asset('CCC','same'),asset('DDD'),asset('DDD','other'),{...asset('EEE'),tradable:false}]);
 assert.deepEqual(u.rows.map(x=>x.symbol),['AAA']);assert.equal(u.exactDuplicates,1);assert.equal(u.excluded.CONFLICTING_IDENTITY_OR_REFERENCE,3);assert.equal(u.excluded.NOT_DECLARED_TRADABLE,1);assert.match(u.identityStatus,/NOT_AUTHENTICATED/);
 assert.throws(()=>freezeResearchUniverse({records:[asset('AAA')],asOf:iso(base),knownAt:iso(base-1)}));
});
test('actual asset-reference scale cannot fit old420-request or60-per-minute sweep budgets',()=>{
 const u=universe(Array.from({length:13488},(_,i)=>asset('S'+String(i).padStart(5,'0'))));
 const old=planResearchSweeps(u,{maxRequests:420,reservedRequests:0,requestsPerMinute:60});assert.equal(old.batches.length,68);assert.equal(old.status,'BLOCKED');assert.deepEqual(old.errors,['REQUEST_BUDGET_INSUFFICIENT','PACING_CAPACITY_INSUFFICIENT']);
 const proposed=planResearchSweeps(u);assert.equal(proposed.requiredRequests,22940);assert.equal(proposed.liveAuthorized,false);assert.equal(proposed.endpointBatchCapacityVerified,false);
});
test('missing/truncated batches use declared-universe denominator and delayed rows never become live prices',()=>{
 const u=universe(),p=planResearchSweeps(u,{batchSize:1}),s=hybridSessionState(),r=responses(p,base).slice(0,1);
 const out=observeResearchSweep(s,{universe:u,plan:p,cutoff:iso(base),responses:r,delayedRows:[{sym:'BBB',price:100,t:base,prevC:10}]});
 assert.equal(out.metrics.returned,1);assert.equal(out.metrics.missing,1);assert.equal(out.metrics.freshTradePct,50);assert.equal(out.rows.some(x=>x.sym==='BBB'),false);assert.equal(out.lastCompleteSweepAt,null);
});
test('duplicate batches are excluded and future-at-ingestion clocks cannot mature into valid evidence',()=>{
 const u=universe(),p=planResearchSweeps(u,{batchSize:1}),s=hybridSessionState(),r=responses(p,base);r[1].receivedAt=iso(base-5000);r[1].requestedAt=iso(base-6000);r.push({...r[0]});
 const out=observeResearchSweep(s,{universe:u,plan:p,cutoff:iso(base),responses:r});assert.equal(out.metrics.duplicateBatches,1);assert.equal(out.metrics.freshTrades,0);assert.equal(out.metrics.futureTradeClocksAtReceipt,1);assert.equal(out.metrics.futureQuoteClocksAtReceipt,1);
});
test('wrong feed, stale batch receipt, HTTP failures and unsolicited symbols cannot establish coverage',()=>{
 for(const mutate of [r=>r.feed='iex',r=>r.requestedAt=iso(base-70000),r=>r.httpStatus=429,r=>r.rows.EVIL=payload(base)]){
  const u=universe(),p=planResearchSweeps(u),s=hybridSessionState(),r=responses(p,base);mutate(r[0]);const out=observeResearchSweep(s,{universe:u,plan:p,cutoff:iso(base),responses:r});assert.equal(out.metrics.freshTrades,0);assert.equal(out.status,'INCOMPLETE_SWEEP');
 }
});
test('mutated plans, future reference, changed session identity and malformed restart counters fail closed',()=>{
 const u=universe(),p=planResearchSweeps(u),s=hybridSessionState();assert.throws(()=>observeResearchSweep(s,{universe:u,plan:{...p,batches:[['EVIL']]},cutoff:iso(base),responses:[]}));
 assert.throws(()=>observeResearchSweep({...s,cycles:NaN},{universe:u,plan:p,cutoff:iso(base),responses:[]}));
 const altered={...u,rows:[asset('EVIL')]};assert.throws(()=>observeResearchSweep(s,{universe:altered,plan:p,cutoff:iso(base),responses:[]}));
 assert.throws(()=>observeResearchSweep(s,{universe:u,plan:p,cutoff:iso(base-1200000),responses:[]}));
});
test('complete330-minute fixture preserves first discovery, gaps, stale news and restored state truthfully',()=>{
 const u=universe(),p=planResearchSweeps(u);let s=hybridSessionState();
 for(let i=0;i<330;i++){
  const at=base+i*60000,r=responses(p,at);if(i===10)r[0].httpStatus=503;
  r[0].rows.AAA=payload(at,i<20?10:12.5);
  const readText=path=>{if(path==='data/news-log.jsonl')return JSON.stringify({sym:'AAA',h:'fixture catalyst',t:base-60000,at:iso(base-1000),sourceId:'fixture-stable'})+'\n'+JSON.stringify({sym:'BBB',h:'stale fixture',t:base-100*3600000});throw Error('fixture missing');};
  const out=observeResearchSweep(s,{universe:u,plan:p,cutoff:iso(at),responses:r,readText});assert.equal(out.claims.approvedBuy,false);assert.equal(out.claims.orders,false);assert.equal(out.discovery.sources.length,9);
  if(i===10)assert.equal(out.metrics.freshTradePct,0);if(i===100)s=JSON.parse(JSON.stringify(s));
 }
 const obs=Object.values(s.discovery.observations);assert.equal(obs.length,1);assert.equal(obs[0].priceAtDetection,10);assert.equal(obs[0].observedAt,iso(base));assert.equal(s.discovery.crossings.AAA[25].at,iso(base+20*60000));
 const before=JSON.stringify(s),dup=observeResearchSweep(s,{universe:u,plan:p,cutoff:iso(base+329*60000),responses:[]});assert.equal(dup.status,'DUPLICATE_OR_RETROGRADE');assert.equal(JSON.stringify(s),before);
 const report=hybridSessionReport(s,{cutoff:iso(base+329*60000)});assert.equal(report.clockWindowComplete,true);assert.equal(report.allDeclaredSweepsReturned,false);assert.equal(report.telemetry.incompleteSweeps,1);assert.equal(report.telemetry.missingSymbolObservations,2);assert.equal(report.profitability,'NOT_ESTABLISHED');
 assert.equal(observeResearchSweep(s,{universe:u,plan:p,cutoff:iso(base+330*60000),responses:[]}).status,'OUTSIDE_PREMARKET');
});
