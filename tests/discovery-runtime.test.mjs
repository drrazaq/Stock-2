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
 const r=collectDiscovery({readText:read(files),cutoff});assert.equal(r.observations.length,1);assert.equal(r.sources.find(s=>s.lane==='NEWS_CATALYST').truncated,1);
});
