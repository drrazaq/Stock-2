import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {probeAlpacaBatch} from '../tools/alpaca-batch-access-probe.mjs';
const now=Date.parse('2026-10-29T14:00:00Z'),env={ALPACA_KEY:'fixture-key-not-output',ALPACA_SECRET:'fixture-key-not-output'};
const assets=Array.from({length:250},(_,i)=>({symbol:'S'+String(i).padStart(5,'0'),id:'fixture-'+i,status:'active',class:'us_equity',tradable:true}));
test('exactly three bounded GETs test the same200 symbols without orders or retained credentials',async()=>{
 const calls=[];const r=await probeAlpacaBatch({env,now:()=>now,fetcher:async(u,o)=>{assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.ok(o.signal);assert.doesNotMatch(u,/orders|positions|account/);calls.push(u);if(u.includes('/v2/assets'))return new Response(JSON.stringify(assets));const symbols=new URL(u).searchParams.get('symbols').split(',');assert.equal(symbols.length,200);return new Response(JSON.stringify(Object.fromEntries(symbols.map(s=>[s,{latestTrade:{p:10,t:new Date(now-1000).toISOString()},latestQuote:{bp:9.99,ap:10.01,t:new Date(now-1000).toISOString()}}]))));}});
 assert.equal(calls.length,3);assert.equal(r.requests,3);assert.equal(r.results[0].measurements.trade.fresh,200);assert.equal(r.results[1].measurements.quote.fresh,200);assert.equal(r.claims.wholeMarketCoverage,'NOT_ESTABLISHED');assert.doesNotMatch(JSON.stringify(r),/fixture-key-not-output/);assert.equal(new URL(calls[1]).searchParams.get('symbols'),new URL(calls[2]).searchParams.get('symbols'));
});
test('missing credentials, insufficient reference or asset refusal cannot lead to data calls',async()=>{
 let calls=0;assert.equal((await probeAlpacaBatch({now:()=>now,fetcher:()=>{calls++;}})).status,'NOT_CONFIGURED');assert.equal(calls,0);
 for(const response of [()=>new Response('[]'),()=>new Response('{}',{status:403})]){calls=0;const r=await probeAlpacaBatch({env,now:()=>now,fetcher:async()=>{calls++;return response();}});assert.equal(calls,1);assert.equal(r.sampleSize,0);}
});
test('a SIP rate/auth refusal prevents later IEX rather than hidden retries or downgrade',async()=>{
 for(const status of [401,403,429]){let calls=0;const r=await probeAlpacaBatch({env,now:()=>now,fetcher:async()=>{calls++;return calls===1?new Response(JSON.stringify(assets)):new Response('{}',{status});}});assert.equal(calls,2);assert.equal(r.requests,2);assert.equal(r.results.length,1);assert.ok(r.transport.halted);}
});
test('completed batch probe has no automatic trigger or bound provider credentials',()=>{
 const w=fs.readFileSync(new URL('../.github/workflows/alpaca-batch-probe.yml',import.meta.url),'utf8');assert.match(w,/RETIRED/);assert.match(w,/workflow_dispatch:/);assert.doesNotMatch(w,/push:|schedule:|secrets\.|node tools\//);
});
