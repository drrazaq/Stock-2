import test from 'node:test';
import assert from 'node:assert/strict';
import {collectDiscovery,discoveryState,updateDiscovery,discoveryReport,DISCOVERY_SOURCES} from '../discovery-runtime.mjs';
const cutoff='2026-10-29T14:00:00Z',generatedAt='2026-10-29T13:30:00Z';
function sources(){return {
 'data/news-log.jsonl':JSON.stringify({sym:'AAA',h:'Guidance cut',t:Date.parse('2026-10-29T13:00:00Z'),at:generatedAt}),
 'data/events-recent.json':{updated:generatedAt,events:[{sym:'AAA',p:'2026-10-29T13:00:00Z',f:'8-K'}]},
 'data/insider-study.json':{generatedAt,recent:[{sym:'AAA',d:'2026-10-01',n:2}]},
 'data/earnings-recent.json':{updated:generatedAt,reports:[{sym:'AAA',d:'2026-10-29',a:2,e:1,t:'bmo'}]},
 'data/chain-ripple.json':{generatedAt,todayMovers:[{sym:'AAA',chain:'fixture'}]},
 'data/share-supply.json':{generatedAt,now:[{sym:'AAA',filed:'2026-10-28',rule:'S-8 filed'}]},
 'data/discovery2-today.json':{generatedAt,buys:[{sym:'AAA',rule:'unproven'}]},
 'data/comeback-today.json':{generatedAt,methods:{fixture:{newSignals:[{sym:'AAA',d:'2026-10-28'}]}}}
};}
const read=files=>p=>{if(!(p in files))throw Error('missing');return typeof files[p]==='string'?files[p]:JSON.stringify(files[p]);};
const live={symbol:'AAA',lane:'PRE_IGNITION',asOf:generatedAt,observedAt:cutoff,sourceId:'fixture',description:'Snapshot analysis'};
const quote=(t,price=10.1)=>({sym:'AAA',price,prevC:10,t:Date.parse(t)});
test('all nine lanes reach the runtime without pretending derived dates are original disclosure times',()=>{
 const i=collectDiscovery({readText:read(sources()),cutoff,live:[live]});assert.equal(i.sources.length,9);assert.equal(i.observations.length,9);
 const insider=i.observations.find(x=>x.lane==='INSIDER_CLUSTER');assert.equal(insider.asOf,generatedAt);assert.equal(insider.publicationBasis,'DERIVED_OUTPUT_AVAILABLE');assert.match(insider.caveat,/Original public event time unavailable/);
 const s=discoveryState();updateDiscovery(s,{observations:i.observations,rows:[quote(cutoff)],cutoff});const r=discoveryReport(s,{cutoff,sources:i.sources});
 assert.equal(r.candidates[0].laneCount,9);assert.equal(r.candidates[0].status,'NOT AN APPROVED BUY');assert.equal(r.lanes.length,9);
});
test('missing, malformed, stale and future sources remain explicitly unavailable',()=>{
 const files=sources();delete files['data/insider-study.json'];files['data/share-supply.json']='bad';files['data/chain-ripple.json'].generatedAt='2026-01-01T00:00:00Z';files['data/discovery2-today.json'].generatedAt='2026-10-30T00:00:00Z';
 const r=collectDiscovery({readText:read(files),cutoff});for(const status of ['MISSING','MALFORMED','STALE','FUTURE'])assert.ok(r.sources.some(s=>s.status===status));
 const dates=collectDiscovery({readText:read({'data/insider-study.json':{generatedAt:'2026-10-29',recent:[{sym:'AAA',d:'2026-10-01'}]}}),cutoff});assert.equal(dates.observations.length,0);
});
test('prospective timing credits an observed lead, never an already-moved or stale price',()=>{
 const s=discoveryState();updateDiscovery(s,{observations:[live],rows:[quote(cutoff)],cutoff});
 const later='2026-10-29T14:10:00Z';updateDiscovery(s,{observations:[{...live,observedAt:later}],rows:[quote(later,11.2)],cutoff:later});
 const r=discoveryReport(s,{cutoff:later,sources:[]});const lane=r.lanes.find(x=>x.lane==='PRE_IGNITION');assert.equal(lane.symbols,1);assert.equal(lane.beforeObservedPlus10,1);assert.deepEqual(lane.leadMinutes,[10]);
 const late=discoveryState();updateDiscovery(late,{observations:[live],rows:[quote(cutoff,12)],cutoff});assert.equal(discoveryReport(late,{cutoff,sources:[]}).lanes[0].beforeObservedPlus10,0);
 const stale=discoveryState();updateDiscovery(stale,{observations:[live],rows:[quote(generatedAt)],cutoff});updateDiscovery(stale,{observations:[],rows:[quote(later,12)],cutoff:later});assert.equal(discoveryReport(stale,{cutoff:later,sources:[]}).lanes[0].beforeObservedPlus10,0);
});
test('a future observation is rejected and later prices never backfill first detection',()=>{
 const s=discoveryState();assert.equal(updateDiscovery(s,{observations:[{...live,asOf:'2026-10-30T00:00:00Z'}],rows:[],cutoff}).length,0);
 updateDiscovery(s,{observations:[live],rows:[],cutoff});updateDiscovery(s,{observations:[],rows:[quote('2026-10-29T14:10:00Z',12)],cutoff:'2026-10-29T14:10:00Z'});
 assert.equal(Object.values(s.observations)[0].priceAtDetection,null);
 assert.equal(DISCOVERY_SOURCES.length,8);
});
test('bounded news ingestion prioritizes current appended reports over old history',()=>{
 const old={sym:'AAA',h:'old fixture',t:Date.parse('2020-01-01T00:00:00Z'),at:generatedAt};
 const files={'data/news-log.jsonl':[...Array.from({length:500},()=>JSON.stringify(old)),JSON.stringify({...old,h:'current fixture',t:Date.parse(generatedAt)})].join('\n')};
 const r=collectDiscovery({readText:read(files),cutoff});assert.equal(r.observations.length,1);const news=r.sources.find(s=>s.lane==='NEWS_CATALYST');assert.equal(news.truncated,0);assert.equal(news.rejected,500);assert.equal(news.inputRows,501);
});
test('out-of-range news dates reject only the bad row; invalid cycle clocks do not mutate state',()=>{
 const files=sources();files['data/news-log.jsonl']+='\n'+JSON.stringify({sym:'BAD',h:'invalid clock',t:1e100});
 const r=collectDiscovery({readText:read(files),cutoff}),news=r.sources.find(x=>x.lane==='NEWS_CATALYST');
 assert.equal(news.status,'READ');assert.equal(news.accepted,1);assert.equal(news.rejected,1);
 const state=discoveryState(),before=JSON.stringify(state);
 assert.throws(()=>updateDiscovery(state,{observations:[live],rows:[],cutoff:'2026-10-29'}),/timezone/);assert.equal(JSON.stringify(state),before);
});
test('all adapters survive a 04:00–13:00 half-day fixture with outages, stale news and duplicates',()=>{
 const start=Date.parse('2026-11-27T09:00:00Z'),base=new Date(start).toISOString(),state=discoveryState();let ingress;
 for(let m=0;m<=540;m++){
  const cycle=new Date(start+m*60000).toISOString(),files=sources();
  for(const [path,doc] of Object.entries(files))if(typeof doc==='object'){
   doc.generatedAt=base;doc.updated=base;
   if(path==='data/events-recent.json')doc.events[0].p=base;
  }
  files['data/news-log.jsonl']=JSON.stringify({sym:'AAA',h:'fixture headline',t:m>=60&&m<90?start-100*3600000:start,at:base});
  if(m>=120&&m<140)delete files['data/share-supply.json'];
  ingress=collectDiscovery({readText:read(files),cutoff:cycle,live:[{...live,asOf:base,observedAt:cycle}]});
  const rows=m>=300&&m<310?[]:[{sym:'AAA',price:m<400?10.1:11.2,prevC:10,t:start+m*60000}];
  updateDiscovery(state,{...ingress,rows,cutoff:cycle});
 }
 const r=discoveryReport(state,{cutoff:new Date(start+540*60000).toISOString(),sources:ingress.sources,completeSession:true});
 assert.equal(r.priceCoverage.cycles,541);assert.equal(r.priceCoverage.noFreshPriceCycles,10);
 assert.equal(r.sourceReliability.SUPPLY_SHIFT.statusCounts.MISSING,20);
 assert.equal(r.sourceReliability.NEWS_CATALYST.rejectedAttempts,30);
 assert.equal(r.lanes.every(x=>x.beforeObservedPlus10===1),true);assert.ok(r.funnel.duplicates>4000);
 assert.ok(r.detections.every(x=>x.status==='NOT AN APPROVED BUY'));
});

test('crossing funnel reports +5,+10,+20,+25 without backfilling unknown detection prices',()=>{
 const state=discoveryState();updateDiscovery(state,{observations:[live],rows:[quote(cutoff)],cutoff});
 for(const [m,price]of [[1,10.6],[2,11.1],[3,12.1],[4,12.6]]){const at=new Date(Date.parse(cutoff)+m*60000).toISOString();updateDiscovery(state,{observations:[],rows:[quote(at,price)],cutoff:at});}
 const r=discoveryReport(state,{cutoff:'2026-10-29T14:04:00Z',sources:[]}),thresholds=r.lanes[0].thresholds;
 assert.deepEqual(thresholds.map(x=>x.percent),[5,10,20,25]);assert.deepEqual(thresholds.map(x=>x.detectionsBeforeCrossing),[1,1,1,1]);assert.deepEqual(thresholds.map(x=>x.leadMinutes),[[1],[2],[3],[4]]);
});
test('out-of-order cycles and overflowed relative prices cannot fabricate an early lead',()=>{
 const state=discoveryState(),later='2026-10-29T14:10:00Z';
 updateDiscovery(state,{observations:[],rows:[quote(later,12.6)],cutoff:later});
 updateDiscovery(state,{observations:[live],rows:[quote(cutoff)],cutoff});
 assert.equal(Object.keys(state.observations).length,0);assert.equal(state.rejectedOutOfOrderCycles,1);
 const invalid=discoveryState();updateDiscovery(invalid,{observations:[live],rows:[{...quote(cutoff),price:1e308,prevC:1e-308}],cutoff});
 assert.equal(Object.values(invalid.observations)[0].priceAtDetection,null);assert.deepEqual(invalid.crossings,{});
});
test('one malformed/null news row cannot hide valid headlines or fabricate source completeness',()=>{
 const good={sym:'AAA',h:'valid fixture catalyst',t:Date.parse(generatedAt),at:generatedAt},files={'data/news-log.jsonl':['{broken','null',JSON.stringify(good)].join('\n')};
 const r=collectDiscovery({readText:read(files),cutoff}),news=r.sources.find(x=>x.lane==='NEWS_CATALYST');assert.equal(r.observations.length,1);assert.equal(news.status,'READ');assert.equal(news.accepted,1);assert.equal(news.rejected,2);assert.equal(news.malformedLines,1);assert.equal(news.partial,true);
 const state=discoveryState();updateDiscovery(state,{...r,rows:[quote(cutoff)],cutoff});assert.equal(Object.values(state.observations)[0].observedAt,cutoff);assert.equal(state.sourceReliability.NEWS_CATALYST.rejectedAttempts,2);
});
test('future/stale/malformed stories cannot consume the latest500 eligible slots; ingestion clocks are not backfilled',()=>{
 const good={sym:'AAA',h:'valid fixture',t:Date.parse(generatedAt),at:generatedAt},future={...good,sym:'BAD',t:Date.parse(cutoff)+1000};
 const lines=[...Array.from({length:600},()=>JSON.stringify(future)),JSON.stringify({...good,sym:'BBB',at:'2026-10-30T00:00:00Z'}),JSON.stringify({...good,sym:'CCC',at:'2026-10-01T00:00:00Z'}),JSON.stringify(good)];
 const r=collectDiscovery({readText:read({'data/news-log.jsonl':lines.join('\n')}),cutoff}),news=r.sources.find(x=>x.lane==='NEWS_CATALYST');assert.deepEqual(r.observations.map(x=>x.symbol),['AAA']);assert.equal(news.rejected,602);assert.equal(news.rejectionReasons.FUTURE_PUBLICATION,600);assert.equal(news.rejectionReasons.INVALID_OR_FUTURE_INGESTION_CLOCK,2);
});
test('null derived records do not poison other valid records; oversized input remains explicitly unavailable',()=>{
 const files=sources();files['data/events-recent.json'].events.unshift(null);files['data/insider-study.json'].recent.unshift(null);files['data/earnings-recent.json'].reports.unshift(null);files['data/comeback-today.json'].methods.bad=null;
 const r=collectDiscovery({readText:read(files),cutoff});assert.equal(r.observations.length,8);assert.equal(r.sources.find(x=>x.lane==='SEC_EVENT').rejected,1);assert.equal(r.sources.find(x=>x.lane==='MARKET_DISLOCATION').rejected,1);
 const huge=collectDiscovery({readText:()=> 'x'.repeat(8*1024*1024+1),cutoff});assert.ok(huge.sources.slice(1).every(x=>x.status==='INPUT_BUDGET_OR_TYPE_BLOCKED'));
});
