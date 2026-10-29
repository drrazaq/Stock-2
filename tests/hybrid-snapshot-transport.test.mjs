import test from 'node:test';
import assert from 'node:assert/strict';
import {createHybridSnapshotTransport} from '../hybrid-snapshot-transport.mjs';
const credentials={key:'fixture-secret-not-logged',secret:'fixture-secret-not-logged'},base=Date.parse('2026-10-29T08:00:00Z');
const good=()=>new Response(JSON.stringify({AAA:{latestTrade:{p:10,t:'2026-10-29T08:00:00Z'}}}));
const make=(extra={})=>createHybridSnapshotTransport({credentials,now:()=>base,fetcher:async()=>good(),...extra});
test('no implicit fetch, destination override or invalid symbol/feed scope',async()=>{
 assert.throws(()=>createHybridSnapshotTransport());for(const origin of ['https://evil.example','https://data.alpaca.markets@evil.example','https://data.alpaca.markets/path'])assert.throws(()=>make({origin}));
 let n=0;const c=make({fetcher:async()=>{n++;return good();}});for(const syms of [[],['AAA','AAA'],['BRK/B'],['aaa'],[null]])assert.equal((await c.snapshots(syms)).status,'INVALID_SCOPE');assert.equal((await c.snapshots(['AAA'],{feed:'delayed_sip'})).status,'INVALID_SCOPE');assert.equal(n,0);
});
test('GET-only whitelisted credentials and explicit feed without secret leakage',async()=>{
 const c=make({fetcher:async(u,o)=>{assert.equal(u,'https://data.alpaca.markets/v2/stocks/snapshots?feed=iex&symbols=AAA');assert.equal(o.method,'GET');assert.equal(o.redirect,'error');assert.ok(o.signal);assert.equal(o.headers['APCA-API-KEY-ID'],credentials.key);return good();}});
 const r=await c.snapshots(['AAA'],{feed:'iex'});assert.equal(r.status,'RESPONSE_OBSERVED');assert.equal(r.feed,'iex');assert.equal(c.report().requests,1);assert.doesNotMatch(JSON.stringify(c.report()),/fixture-secret/);
});
test('HTTP401/403/429 halt every later feed request without fallback or retry',async()=>{
 for(const status of [401,403,429]){let n=0;const c=make({fetcher:async()=>{n++;return new Response('{}',{status});}});assert.equal((await c.snapshots(['AAA'])).status,'HTTP_REFUSED');assert.equal((await c.snapshots(['AAA'],{feed:'iex'})).status,'BLOCKED');assert.equal(n,1);}
});
test('failed network attempts count and finite total request budget cannot be exceeded',async()=>{
 let n=0;const c=make({limits:{maxRequests:2},fetcher:async()=>{n++;throw Error('fixture-secret-not-logged');}});await c.snapshots(['AAA']);await c.snapshots(['AAA']);assert.equal((await c.snapshots(['AAA'])).reason,'REQUEST_BUDGET_EXHAUSTED');assert.equal(c.report().requests,2);assert.equal(n,2);assert.doesNotMatch(JSON.stringify(c.report()),/fixture-secret/);
});
test('fixed-minute pacing makes no request until the next minute; backward clock halts',async()=>{
 let at=base;const c=make({now:()=>at,limits:{requestsPerMinute:1,maxDurationMs:120000}});await c.snapshots(['AAA']);assert.equal((await c.snapshots(['AAA'])).status,'PACED');assert.equal(c.report().requests,1);at+=60000;assert.equal((await c.snapshots(['AAA'])).status,'RESPONSE_OBSERVED');at--;assert.equal((await c.snapshots(['AAA'])).reason,'CLOCK_REGRESSED_OR_INVALID');
});
test('actual streamed bytes enforce per-response and cumulative budgets despite absent length',async()=>{
 const c=make({limits:{maxResponseBytes:10,maxTotalBytes:20}});assert.equal((await c.snapshots(['AAA'])).halted,'RESPONSE_BYTE_BUDGET');assert.equal((await c.snapshots(['AAA'])).status,'BLOCKED');
 const size=Buffer.byteLength(await good().text()),d=make({limits:{maxResponseBytes:size,maxTotalBytes:size+1}});await d.snapshots(['AAA']);assert.equal((await d.snapshots(['AAA'])).halted,'TOTAL_BYTE_BUDGET');
});
test('oversized declared bodies and unsolicited/error-shaped successful maps are refused',async()=>{
 const c=make({limits:{maxResponseBytes:10,maxTotalBytes:20},fetcher:async()=>new Response('{}',{headers:{'content-length':'21'}})});assert.equal((await c.snapshots(['AAA'])).halted,'RESPONSE_BYTE_BUDGET');
 for(const body of [{BBB:{latestTrade:{p:10}}},{message:'fixture-secret'},[],{AAA:{latestTrade:'bad'}}]){const d=make({fetcher:async()=>new Response(JSON.stringify(body))});assert.equal((await d.snapshots(['AAA'])).status,'FAILED');}
});
test('request timeout bounds hung fetchers; parent cancellation and deadline make no later requests',async()=>{
 const c=make({limits:{requestTimeoutMs:10},fetcher:()=>new Promise(()=>{})});assert.equal((await c.snapshots(['AAA'])).reason,'REQUEST_TIMEOUT');assert.equal((await c.snapshots(['AAA'])).status,'BLOCKED');
 const a=new AbortController();a.abort();const d=make();assert.equal((await d.snapshots(['AAA'],{signal:a.signal})).reason,'CANCELLED');assert.equal(d.report().requests,0);
 let at=base;const e=make({now:()=>at});at+=60000;assert.equal((await e.snapshots(['AAA'])).reason,'DEADLINE_EXCEEDED');assert.equal(e.report().requests,0);
});
test('mid-stream cancellation and concurrent caller never create hidden extra attempts',async()=>{
 let release;const wait=new Promise(r=>release=r),a=new AbortController();const c=make({fetcher:async()=>{await wait;return good();}});const pending=c.snapshots(['AAA'],{signal:a.signal});assert.equal((await c.snapshots(['AAA'])).status,'BUSY');a.abort();assert.equal((await pending).reason,'CANCELLED');release();assert.equal(c.report().requests,1);
});
test('explicit client cancellation bounds a hung response body, not only the initial fetch',async()=>{
 let cancelObserved=false;const stream=new ReadableStream({pull:()=>new Promise(()=>{}),cancel:()=>{cancelObserved=true;}}),c=make({fetcher:async()=>new Response(stream)});
 const pending=c.snapshots(['AAA']);await new Promise(r=>setTimeout(r,5));c.cancel();assert.equal((await pending).reason,'CANCELLED');await new Promise(r=>setTimeout(r,0));assert.equal(cancelObserved,true);assert.equal(c.report().requests,1);
});
