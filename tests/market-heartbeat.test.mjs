import test from 'node:test';
import assert from 'node:assert/strict';
import {marketSession} from '../market-session.mjs';
import {cycleHeartbeat,heartbeatHealth,publishHeartbeat} from '../watcher-heartbeat.mjs';
test('reviewed NYSE regular, holiday, half-day and unknown-year calendars',()=>{
 assert.equal(marketSession('2026-10-29').close,960);
 for(const d of ['2026-11-27','2026-12-24','2027-11-26'])assert.equal(marketSession(d).close,780);
 for(const d of ['2026-11-26','2026-07-03','2027-12-24','2026-10-31','2028-01-03','2026-02-31'])assert.equal(marketSession(d).closed,true);
});
const now=Date.parse('2026-10-29T19:00:00Z');
const cycle=over=>cycleHeartbeat({day:'2026-10-29',runId:'123-1-close',sourceSha:'fixture',startedAt:new Date(now-1000).toISOString(),completedAt:new Date(now).toISOString(),minute:900,received:100,evaluated:80,fresh:40,requests:[{source:'fixture',status:200,ok:true,ms:100}],...over});
test('heartbeat reports actual cycle counts and preserves last successful cycle on stale data',()=>{
 const a=cycle({});assert.equal(a.freshPct,50);assert.equal(a.cycleMs,1000);assert.equal(a.requestP95Ms,100);
 const b=cycle({fresh:0,lastSuccessfulCycle:a.lastSuccessfulCycle,requests:[{source:'fixture',status:500,ok:false,ms:1000}]});
 assert.equal(b.lastSuccessfulCycle,a.lastSuccessfulCycle);assert.equal(b.successful,false);assert.equal(b.errorCount,1);
 assert.equal(heartbeatHealth(b,{day:b.day,now}).status,'DEGRADED');
 assert.equal(heartbeatHealth(a,{day:a.day,now:now+6*60000}).status,'STALLED');
 assert.equal(heartbeatHealth(a,{day:a.day,now:now-1}).status,'UNVERIFIED');
 assert.equal(heartbeatHealth(a,{day:'2026-10-30',now}).status,'UNVERIFIED');
 assert.equal(heartbeatHealth({...a,freshPct:'100'},{day:a.day,now}).status,'UNVERIFIED');
 assert.equal(heartbeatHealth({...a,fresh:1000},{day:a.day,now}).status,'UNVERIFIED');
});
test('heartbeat publishing preserves existing contents SHA and reports refused updates',async()=>{
 const calls=[];const r=await publishHeartbeat(cycle({}),{repo:'fixture/stock',branch:'fixture-branch',token:'fixture',api:'http://localhost',fetcher:async(u,o)=>{calls.push({u,o});return calls.length===1?{ok:true,json:async()=>({sha:'old'})}:{ok:false,status:409};}});
 assert.equal(r.ok,false);assert.equal(r.reason,'WRITE_HTTP_409');
 const body=JSON.parse(calls[1].o.body);assert.equal(body.sha,'old');assert.equal(body.branch,'fixture-branch');
 assert.equal(JSON.parse(Buffer.from(body.content,'base64')).freshPct,50);
});
