import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {LIMITS,validatePlan,requestsFor,runSipDiagnostic,createBoundedSipRequest} from '../sip-access-diagnostic.mjs';
const plan=JSON.parse(fs.readFileSync(new URL('../docs/validation/sip-access-plan.proposed.json',import.meta.url),'utf8'));
const T=Date.parse(plan.t0),stamp=new Date(T-60000).toISOString();
const b={t:stamp,o:10,h:11,l:9,c:10,v:100,n:3,vw:10};
const approval={granted:true,scope:'SIP_ACCESS_SAMPLE_V1'};
function body(id){
 if(id==='snapshots')return {SPY:{latestQuote:{t:stamp}},AAPL:{latestQuote:{t:stamp}}};
 if(id==='quotes')return {quotes:{SPY:{t:stamp,bp:10,ap:11},AAPL:{t:stamp,bp:10,ap:11}}};
 if(id==='trades-latest')return {trades:{SPY:{t:stamp,p:10},AAPL:{t:stamp,p:10}}};
 if(id==='trades-window')return {trades:{AAPL:[{t:stamp,p:10,s:1}]},next_page_token:null};
 return {bars:{SPY:[{...b}],AAPL:[{...b}]},next_page_token:null};
}
const response=(slot,over={})=>({status:200,body:body(slot.id),bytes:100,...over});
function harness({badAt=-1,over={},start=T,waitChange=ms=>ms}={}){
 let time=start;const calls=[],waits=[];
 return {calls,waits,ports:{approval,now:()=>time,wait:async ms=>{waits.push(ms);time+=waitChange(ms);},request:async slot=>{calls.push(slot);return response(slot,calls.length===badAt?over:{});}},set:n=>{time=n;}};
}
test('one fixed plan: seven SIP GET routes, no reference calls, identical five-minute repeat window',()=>{
 const slots=requestsFor(plan);assert.equal(slots.length,7);
 for(const s of slots){const u=new URL(s.url);assert.equal(u.origin,'https://data.alpaca.markets');assert.equal(u.searchParams.get('feed'),'sip');}
 assert.equal(slots[3].url,slots[4].url);assert.equal(slots[4].due,T+90000);
 assert.equal(new URL(slots[3].url).searchParams.get('end'),new Date(T-1).toISOString());
});
test('complete mocked orchestration: exactly seven calls, fixed wait, aggregate-only report',async()=>{
 const h=harness(),r=await runSipDiagnostic(plan,h.ports);
 assert.equal(r.status,'COMPLETE_SAMPLED');assert.equal(r.applicationAttempts,7);assert.deepEqual(h.waits,[90000]);
 assert.equal(r.results[4].changedMinutes,0);assert.equal(r.claims.generalCoverageEstablished,false);
 assert.ok(Buffer.byteLength(JSON.stringify(r))<=LIMITS.reportBytes);
 assert.doesNotMatch(JSON.stringify(r),/"bp"|"ap"|"latestQuote"|"SPY"|"AAPL"|API-KEY|synthetic-secret/);
});
test('approval, plan changes and late/early startup fail before any transport',async()=>{
 for(const change of [{symbols:['SPY','AAPL','ZZQ']},{limits:{...plan.limits,requests:8}},{t0:'2026-11-03T00:00:00Z'},{approved:true}]){
  const h=harness();await assert.rejects(runSipDiagnostic({...plan,...change},h.ports));assert.equal(h.calls.length,0);
 }
 for(const start of [T-1,T+30001]){const h=harness({start});await assert.rejects(runSipDiagnostic(plan,h.ports),/CLOCK/);assert.equal(h.calls.length,0);}
 const h=harness();await assert.rejects(runSipDiagnostic(plan,{...h.ports,approval:{granted:false}}),/APPROVAL_REQUIRED/);assert.equal(h.calls.length,0);
});
test('401/403/429/500 stop with no fallback or retry',async()=>{
 for(const status of [401,403,429,500]){
  const h=harness({badAt:2,over:{status}}),r=await runSipDiagnostic(plan,h.ports);
  assert.equal(r.status,'STOPPED');assert.equal(r.applicationAttempts,2);assert.equal(h.calls.length,2);
  assert.equal(r.reason,status===500?'HTTP_ERROR':'HTTP_'+status);
 }
});
test('pagination, foreign symbols, provider errors and body bounds remain incomplete',async()=>{
 for(const over of [{body:{quotes:{SPY:{t:stamp}},next_page_token:'more'}},{body:{quotes:{ZZQ:{t:stamp}}}},{body:{message:'PRIVATE PROVIDER TEXT'}},{bytes:LIMITS.bodyBytes+1}]){
  const h=harness({badAt:2,over}),r=await runSipDiagnostic(plan,h.ports);assert.equal(r.status,'STOPPED');assert.equal(h.calls.length,2);assert.doesNotMatch(JSON.stringify(r),/PRIVATE PROVIDER TEXT/);
 }
});
test('clock regression and expired deadline stop before more requests',async()=>{
 const h=harness({waitChange:()=>-1000}),r=await runSipDiagnostic(plan,h.ports);assert.equal(r.reason,'CLOCK');assert.equal(h.calls.length,4);
 const x=harness({waitChange:()=>LIMITS.wallMs+1}),q=await runSipDiagnostic(plan,x.ports);assert.equal(q.reason,'DEADLINE');assert.equal(x.calls.length,4);
 assert.equal(q.applicationAttempts,4,'waiting is not a provider attempt');
});
test('every changed bar field is counted in sample revisions; duplicates refuse comparison',async()=>{
 for(const field of ['o','h','l','c','v','n','vw']){
  const h=harness();h.ports.request=async slot=>{h.calls.push(slot);const r=response(slot);if(slot.id==='bars-repeat')r.body.bars.SPY[0][field]+=1;return r;};
  const r=await runSipDiagnostic(plan,h.ports);assert.equal(r.results[4].changedMinutes,1,field);
 }
 const h=harness();h.ports.request=async slot=>{h.calls.push(slot);const r=response(slot);if(slot.id==='bars-repeat')r.body.bars.SPY.push({...b});return r;};
 assert.equal((await runSipDiagnostic(plan,h.ports)).reason,'SCHEMA_ERROR');
});
test('missing, invalid and future quote clocks get no freshness credit',async()=>{
 const h=harness({badAt:2,over:{body:{quotes:{SPY:{t:'not-a-clock'},AAPL:{t:new Date(T+1).toISOString()}}}}}),r=await runSipDiagnostic(plan,h.ports);
 assert.equal(r.results[1].unknownClock,1);assert.equal(r.results[1].future,1);assert.equal(r.results[1].clocked,0);
});
const slot=()=>({...requestsFor(plan)[0],timeoutMs:50,maxBytes:LIMITS.bodyBytes});
const headers={'APCA-API-KEY-ID':'synthetic-key','APCA-API-SECRET-KEY':'synthetic-secret'};
test('real HTTP adapter with mock transport: GET, redirects refused, SIP and bounded parsed output',async()=>{
 let observed;
 const request=createBoundedSipRequest({headers,fetcher:async(url,opts)=>{observed={url,opts};return new Response(JSON.stringify(body('snapshots')),{status:200,headers:{'x-ratelimit-limit':'10000','x-ratelimit-remaining':'untrusted-text'}});}});
 const r=await request(slot());assert.equal(observed.opts.method,'GET');assert.equal(observed.opts.redirect,'error');assert.equal(r.rateLimitSample.limit,10000);assert.equal(r.rateLimitSample.remaining,null);
 assert.equal(observed.opts.signal.aborted,true,'request scope closes after reading');
 await assert.rejects(request({...slot(),url:'https://evil.invalid/v2/stocks/snapshots?feed=sip'}),/TRANSPORT_ERROR/);
});
test('body timeout, ignored abort, invalid JSON and excessive streamed bytes are bounded',async()=>{
 for(const fetcher of [
  async()=>new Promise(()=>{}),
  async()=>({status:200,body:{getReader:()=>({read:()=>new Promise(()=>{}),cancel:async()=>{}})}})
 ]){
  const request=createBoundedSipRequest({headers,fetcher});await assert.rejects(request({...slot(),timeoutMs:10}),/TIMEOUT/);
 }
 await assert.rejects(createBoundedSipRequest({headers,fetcher:async()=>new Response('not json')})(slot()),/INVALID_JSON/);
 await assert.rejects(createBoundedSipRequest({headers,fetcher:async()=>new Response(new Uint8Array(LIMITS.bodyBytes+1))})(slot()),/TOO_LARGE/);
});
test('actual CLI refuses ordinary execution even with synthetic keys; no provider transport is created',()=>{
 const child=spawnSync(process.execPath,['tools/run-sip-access-diagnostic.mjs'],{cwd:new URL('../',import.meta.url),encoding:'utf8',env:{PATH:process.env.PATH,ALPACA_KEY:'synthetic-key',ALPACA_SECRET:'synthetic-secret'}});
 assert.equal(child.status,2);assert.equal(child.stdout.trim(),'BLOCKED_CONTEXT');assert.doesNotMatch(child.stdout+child.stderr,/synthetic-key|synthetic-secret/);
});

test('actual protected runner succeeds only with complete synthetic pins; bad pins and existing partial output fail before transport',async t=>{
 const {realFixture}=await import('./sip-access-real-fixture.mjs'),f=await realFixture(t);
 const good=await f.run();assert.equal(good.code,0,good.stderr+good.stdout);assert.equal(good.stdout,'PASS\n');assert.equal(good.calls.length,7);assert.equal(JSON.parse(good.report).applicationAttempts,7);
 for(const approval of [{planSha256:'0'.repeat(64)},{workflowSha256:'0'.repeat(64)},{sourceSha:'0'.repeat(40)},{sourceHashes:{}},{approvedAt:'2026-02-30T15:00:00Z'}]){const bad=await f.run({approval});assert.equal(bad.code,2,bad.stderr+bad.stdout);assert.equal(bad.calls.length,0);}
 const partial=await f.run({existing:true});assert.equal(partial.code,2);assert.equal(partial.calls.length,0);assert.equal(partial.report,'original partial');
});
