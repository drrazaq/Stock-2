import test from 'node:test';
import assert from 'node:assert/strict';
import {createResearchCollector} from '../research-collector.mjs';
const start=Date.parse('2026-10-29T08:00:00Z');
const cache=JSON.stringify({sym:'AAA',h:'cached fixture',t:start-60000,at:new Date(start-30000).toISOString(),sourceId:'cached-1'});
const read=p=>{if(p==='data/news-log.jsonl')return cache;throw Error('missing');};
const response=(body,status=200)=>({ok:status===200,status,headers:{get:()=>null},json:async()=>body});
function collector(reply){return createResearchCollector({env:{FINNHUB_KEY:'fixture'},fetcher:reply});}
test('successful empty live news never becomes a cached discovery',async()=>{
 const c=collector(async()=>response([]));const v=await c.cycle({now:start,readText:read});assert.equal(v.discovery.added.length,0);assert.equal(v.discovery.sources.find(x=>x.lane==='NEWS_CATALYST').origin,'LIVE_PROVIDER');assert.equal(c.report(new Date(start).toISOString()).sourceReliability.NEWS_CATALYST.upstreamStatusCounts.RESPONSE_OBSERVED,1);assert.equal(v.claims.approvedBuy,false);
});
for(const [status,reply] of [
 ['HTTP_ERROR',async()=>response({},503)],['RATE_LIMITED',async()=>response({},429)],['INVALID_SCHEMA',async()=>response({error:'fixture'})],['INVALID_JSON',async()=>({ok:true,status:200,json:async()=>{throw Error('fixture');}})],['NETWORK_ERROR',async()=>{throw Error('fixture');}]
])test('cached context retains '+status+' through actual collector report',async()=>{
 const c=collector(reply),v=await c.cycle({now:start,readText:read}),s=v.discovery.sources.find(x=>x.lane==='NEWS_CATALYST');assert.equal(s.status,'READ');assert.equal(s.upstream.status,status);assert.equal(s.origin,'CACHED_FILE');assert.equal(v.discovery.added[0].sourceOrigin,'CACHED_FILE');assert.equal(v.discovery.added[0].upstreamStatus,status);assert.equal(v.discovery.added[0].priceAtDetection,null);
 const r=c.report(new Date(start).toISOString()).sourceReliability.NEWS_CATALYST;assert.equal(r.upstreamStatusCounts[status],1);assert.equal(r.originCounts.CACHED_FILE,1);assert.equal(v.claims.approvedBuy,false);
});
test('rejected live rows do not resurrect unrelated cached stories',async()=>{
 const c=collector(async()=>response([null,{headline:'future',related:'AAA',datetime:start/1000+1}]));const v=await c.cycle({now:start,readText:read});assert.equal(v.discovery.added.length,0);const s=v.discovery.sources.find(x=>x.lane==='NEWS_CATALYST');assert.equal(s.upstream.rejected,2);assert.equal(s.origin,'LIVE_PROVIDER');
});
test('serialized session state retains upstream failures and deduplication on the next caller cycle',async()=>{
 const c=collector(async()=>response({},503));await c.cycle({now:start,readText:read});const saved=JSON.parse(JSON.stringify(c.state));const d=collector(async()=>{throw Error('not due');});Object.assign(d.state,saved);const v=await d.cycle({now:start+60000,readText:read});assert.equal(v.discovery.added.length,0);const r=d.report(new Date(start+60000).toISOString());assert.equal(r.detectionCount,1);assert.equal(r.sourceReliability.NEWS_CATALYST.upstreamStatusCounts.HTTP_ERROR,1);assert.equal(r.sourceReliability.NEWS_CATALYST.upstreamStatusCounts.NOT_DUE,1);assert.equal(r.sourceReliability.NEWS_CATALYST.originCounts.CACHED_FILE,2);assert.equal(r.detections[0].observedAt,new Date(start).toISOString());assert.equal(r.detections[0].status,'NOT AN APPROVED BUY');
});
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {spawnSync} from 'node:child_process';
test('actual fixture CLI persists cached lineage and upstream failure in compressed and final artifacts',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-news-cli-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'data'));fs.writeFileSync(path.join(dir,'data/news-log.jsonl'),cache);fs.writeFileSync(path.join(dir,'fixture.json'),JSON.stringify({cycles:[{at:new Date(start).toISOString(),responses:[{tickers:[]},{error:'fixture'}]}]}));
 const r=spawnSync(process.execPath,[new URL('../tools/research-collector.mjs',import.meta.url).pathname,'--fixture','fixture.json'],{cwd:dir,env:{PATH:process.env.PATH},encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const cycle=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir,'research-output/fixture/000.json.gz'))));assert.equal(cycle.discovery.added[0].upstreamStatus,'INVALID_SCHEMA');assert.equal(cycle.discovery.added[0].sourceOrigin,'CACHED_FILE');assert.equal(cycle.claims.approvedBuy,false);
 const report=JSON.parse(fs.readFileSync(path.join(dir,'research-output/fixture/discovery.json')));assert.equal(report.sourceReliability.NEWS_CATALYST.upstreamStatusCounts.INVALID_SCHEMA,1);assert.equal(report.sourceReliability.NEWS_CATALYST.originCounts.CACHED_FILE,1);assert.equal(report.tradableUniverseCoverage,'UNVERIFIED');assert.equal(fs.readFileSync(path.join(dir,'data/news-log.jsonl'),'utf8'),cache);
});
