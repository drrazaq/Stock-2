// Reconstructed on 2026-10-29. The prior session's unpublished test was unavailable.
import test from 'node:test';
import assert from 'node:assert/strict';
import {collectDiscovery} from '../discovery-runtime.mjs';
import {validSecFilings,validSecArchiveList} from '../sec-filing-schema.mjs';
const cutoff='2026-10-29T14:00:00Z';
const run=doc=>collectDiscovery({cutoff,readText:p=>{if(p!=='data/events-recent.json')throw Error('missing');return JSON.stringify(doc);}});
for(const events of [undefined,null,{},'error',42])test(`SEC missing/invalid event collection: ${JSON.stringify(events)}`,()=>{
 const r=run({updated:cutoff,events});assert.equal(r.observations.length,0);assert.equal(r.sources.find(x=>x.lane==='SEC_EVENT').status,'MALFORMED');
});
for(const error of [{error:'denied'},{errors:['denied']},{ok:false}])test(`SEC error envelope ${JSON.stringify(error)}`,()=>{
 const r=run({updated:cutoff,events:[{sym:'AAA',p:cutoff}],...error});assert.equal(r.observations.length,0);assert.equal(r.sources.find(x=>x.lane==='SEC_EVENT').status,'MALFORMED');
});
test('invalid explicit SEC publication clock cannot become a generated-time observation',()=>{
 const r=run({updated:cutoff,events:[{sym:'BAD',p:'invalid'},{sym:'AAA',p:cutoff}]});assert.deepEqual(r.observations.map(x=>x.symbol),['AAA']);assert.equal(r.sources.find(x=>x.lane==='SEC_EVENT').rejected,1);
});
test('explicit empty event collection is a valid observed empty result',()=>{assert.equal(run({updated:cutoff,events:[]}).sources.find(x=>x.lane==='SEC_EVENT').status,'READ');});
const good={form:['8-K'],accessionNumber:['0001'],acceptanceDateTime:[cutoff],filingDate:['2026-10-29']};
for(const key of Object.keys(good))test(`SEC filing coverage requires aligned ${key}`,()=>{assert.equal(validSecFilings({...good,[key]:[]}),false);assert.equal(validSecFilings({...good,[key]:null}),false);});
test('SEC schemas distinguish valid empty columns and unavailable/error bodies',()=>{assert.equal(validSecFilings(good),true);assert.equal(validSecFilings(Object.fromEntries(Object.keys(good).map(k=>[k,[]]))),true);for(const x of [null,{},[],{error:'denied'}, {...good,error:'denied'}])assert.equal(validSecFilings(x),false);});
test('archive coverage requires an explicit safe page list',()=>{assert.equal(validSecArchiveList([]),true);assert.equal(validSecArchiveList([{name:'CIK0000000001-submissions-001.json',filingTo:'2026-10-29'}]),true);for(const x of [null,{},[null],[{name:'../bad',filingTo:'2026-10-29'}]])assert.equal(validSecArchiveList(x),false);});
import {readNewsSource} from '../news-source.mjs';
for(const status of [403,429,503])test(`news HTTP ${status} remains unavailable`,async()=>{const r=await readNewsSource(async()=>({ok:false,status}),'https://fixture.invalid');assert.equal(r.rows,null);assert.equal(r.status,status===429?'RATE_LIMITED':'HTTP_ERROR');});
for(const body of [null,{}, {error:'rate limited'}])test(`news malformed schema ${JSON.stringify(body)}`,async()=>{const r=await readNewsSource(async()=>({ok:true,json:async()=>body}),'https://fixture.invalid');assert.equal(r.status,'INVALID_SCHEMA');assert.equal(r.rows,null);});
test('news network failure remains UNKNOWN, without retry',async()=>{let n=0;const r=await readNewsSource(async()=>{n++;throw Error('fixture');},'https://fixture.invalid');assert.equal(r.status,'NETWORK_ERROR');assert.equal(r.rows,null);assert.equal(n,1);});
test('news invalid JSON is not an empty result',async()=>{const r=await readNewsSource(async()=>({ok:true,json:async()=>{throw Error();}}),'https://fixture.invalid');assert.equal(r.status,'INVALID_JSON');assert.equal(r.rows,null);});
test('genuine empty news is observed with its own timestamp',async()=>{const r=await readNewsSource(async()=>({ok:true,json:async()=>[]}),'https://fixture.invalid',{observedAt:cutoff});assert.equal(r.status,'OBSERVED');assert.deepEqual(r.rows,[]);assert.equal(r.observedAt,cutoff);});
test('valid news survives malformed siblings and future clocks',async()=>{const good={headline:'fixture',datetime:Date.parse(cutoff)/1000-1};const r=await readNewsSource(async()=>({ok:true,json:async()=>[null,good,{...good,datetime:Date.parse(cutoff)/1000+1}]}),'https://fixture.invalid',{observedAt:cutoff});assert.deepEqual(r.rows,[good]);assert.equal(r.status,'PARTIAL');assert.equal(r.rejected,2);});
test('non-string news headlines cannot poison downstream matching',async()=>{const r=await readNewsSource(async()=>({ok:true,json:async()=>[{headline:{bad:true},datetime:1}]}),'https://fixture.invalid',{observedAt:cutoff});assert.equal(r.status,'PARTIAL');assert.deepEqual(r.rows,[]);});
test('source fetches have bounded timeout and refuse redirects',async()=>{await readNewsSource(async(u,o)=>{assert.equal(o.redirect,'error');assert.ok(o.signal);return {ok:true,json:async()=>[]};},'https://fixture.invalid');});
