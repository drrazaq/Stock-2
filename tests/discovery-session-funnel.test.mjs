import test from 'node:test';
import assert from 'node:assert/strict';
import {LANES} from '../multi-angle-discovery.mjs';
import {discoveryState,updateDiscovery,discoveryReport} from '../discovery-runtime.mjs';
const start=Date.parse('2026-10-29T13:30:00Z');
const at=m=>new Date(start+m*60000).toISOString();
const quote=(sym,m,price)=>({sym,price,prevC:10,t:start+m*60000,bid:price-.01,ask:price+.01,qt:start+m*60000});
const event=(sym,lane,m,id)=>({symbol:sym,lane,asOf:at(m),observedAt:at(m),sourceId:id,description:'Synthetic session fixture'});
test('390-cycle nine-lane fault session exposes misses, source outages, duplicates and drawdown without fictional fills',()=>{
 const state=discoveryState();
 const events=LANES.map((l,i)=>event('EARLY',l.id,0,'fixture-'+i));
 let sources=[];
 for(let m=0;m<390;m++){
  sources=LANES.map((l,i)=>({lane:l.id,status:m>=120&&m<130?'MISSING':i===1&&m<10?'STALE':'READ',accepted:1}));
  const rows=m>=120&&m<130?[]:[quote('EARLY',m,m<100?10.1:m<200?11.2:9),quote('MISSED',m,m<50?10:12),quote('LATE',m,12)];
  const observations=m===0?[...events,event('LATE','NEWS_CATALYST',0,'late'),event('UNKNOWN','SEC_EVENT',0,'unknown'),event('BAD','SEC_EVENT',400,'future')]:events;
  updateDiscovery(state,{observations,rows,cutoff:at(m),sources});
 }
 const report=discoveryReport(state,{cutoff:at(389),sources,completeSession:true});
 assert.equal(report.lanes.every(l=>l.beforeObservedPlus10===1),true);assert.ok(report.funnel.duplicates>3000);assert.equal(report.funnel.invalid,1);
 assert.equal(report.priceCoverage.cycles,390);assert.equal(report.priceCoverage.noFreshPriceCycles,10);
 assert.equal(report.sourceReliability.NEWS_CATALYST.statusCounts.STALE,10);assert.equal(report.sourceReliability.SEC_EVENT.statusCounts.MISSING,10);
 assert.ok(report.missedCandidates.some(x=>x.symbol==='MISSED'&&x.reason==='NO_DISCOVERY_OBSERVED'));
 assert.ok(report.missedCandidates.some(x=>x.symbol==='LATE'&&x.reason==='DISCOVERY_AT_OR_AFTER_OBSERVED_MOVE'));
 assert.ok(report.suppressionReasons.some(x=>x.reason==='NO_FRESH_PRICE_AT_FIRST_DETECTION'));
 const measured=report.detections.find(x=>x.symbol==='EARLY');assert.ok(measured.followup.maxDrawdown<-.19);assert.equal(measured.priceAtDetection,10.1);assert.equal(measured.quoteAtDetection.bid,10.09);
 assert.equal(report.detections.find(x=>x.symbol==='UNKNOWN').priceAtDetection,null);assert.equal(report.detections.every(x=>x.status==='NOT AN APPROVED BUY'),true);
});
test('stale quote paths cannot create observed crossings or backfill detection prices',()=>{
 const state=discoveryState();updateDiscovery(state,{observations:[event('AAA','SEC_EVENT',10,'fixture')],rows:[quote('AAA',0,10)],cutoff:at(10)});
 updateDiscovery(state,{observations:[],rows:[quote('AAA',20,12)],cutoff:at(20)});
 const r=discoveryReport(state,{cutoff:at(20),sources:[]});assert.equal(r.lanes.find(x=>x.lane==='SEC_EVENT').beforeObservedPlus10,0);assert.equal(r.missedCandidates[0].reason,'NO_FRESH_DETECTION_PRICE');
});
