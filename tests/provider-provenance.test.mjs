import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshots,snapshotFeed,feedUsed,feedEvidence,resetFeed} from '../alpaca-feed.mjs';
import {marketSymbol} from '../market-symbol.mjs';
import {alpacaSnapshot} from '../snapshot-fields.mjs';
test('concurrent IEX downgrade and slow SIP response keep per-response provenance',async()=>{
 resetFeed();let release;const slow=new Promise(r=>release=r);
 const a=snapshots('http://127.0.0.1:12345',['AAA'],{},async()=>{await slow;return {ok:true,status:200,json:async()=>({AAA:{dailyBar:{v:999}}})};});
 const b=await snapshots('http://127.0.0.1:12345',['BBB'],{},async u=>u.includes('feed=sip')?{ok:false,status:403}:{ok:true,status:200,json:async()=>({BBB:{dailyBar:{v:10}}})});
 release();const sip=await a;assert.equal(feedUsed(),'mixed');assert.equal(snapshotFeed(b),'iex');assert.equal(snapshotFeed(sip),'sip');
 assert.equal(alpacaSnapshot('BBB',b.BBB,snapshotFeed(b)==='sip').vol,null);
});
test('422 and 429 do not masquerade as IEX entitlement fallback',async()=>{
 for(const status of [422,429]){resetFeed();let n=0;assert.equal(await snapshots('http://127.0.0.1:12345',['AAA'],{},async()=>{n++;return {ok:false,status};}),null);assert.equal(n,1);assert.equal(feedUsed(),'unobserved');assert.equal(feedEvidence().lastFailure,'HTTP_'+status);}
});
test('malformed successful response is not evidence of a working feed',async()=>{
 resetFeed();assert.equal(await snapshots('http://127.0.0.1:12345',['AAA'],{},async()=>({ok:true,status:200,json:async()=>({message:'error'})})),null);assert.equal(feedUsed(),'unobserved');
});
test('share classes survive syntax normalization without conflating securities',()=>{
 assert.equal(marketSymbol(' brk.b '),'BRK.B');assert.equal(marketSymbol('BRK-B'),'BRK-B');assert.notEqual(marketSymbol('BRK.B'),marketSymbol('BRK-B'));
 for(const s of ['^SPX','/ES','BTC/USD','A;curl','TOOLONGTICKER'])assert.equal(marketSymbol(s),null);
});
test('a rate-limit response defers later batches instead of retrying a burst',async()=>{
 resetFeed();let calls=0;const f=async()=>{calls++;return {ok:false,status:429,headers:{get:n=>n==='retry-after'?'120':null}};};
 await snapshots('http://127.0.0.1:12345',['AAA'],{},f);await snapshots('http://127.0.0.1:12345',['BBB'],{},f);assert.equal(calls,1);assert.equal(feedEvidence().lastFailure,'RATE_LIMIT_COOLDOWN');resetFeed();
});
test('malformed huge retry intervals cannot crash the diagnostics clock',async()=>{
 resetFeed();await snapshots('http://127.0.0.1:12345',['AAA'],{},async()=>({ok:false,status:429,headers:{get:n=>n==='retry-after'?'99999999999999999999999':null}}));assert.ok(Number.isFinite(Date.parse(feedEvidence().cooldownUntil)));resetFeed();
});

test('snapshot requests are GET-only, redirect-refusing and count failed network attempts',async()=>{
 resetFeed();let seen;assert.equal(await snapshots('http://127.0.0.1:12345',['AAA'],{method:'POST',redirect:'follow'},async(u,o)=>{seen=o;throw Error('fixture transport timeout');}),null);
 assert.equal(seen.method,'GET');assert.equal(seen.redirect,'error');assert.equal(feedEvidence().requests,1);assert.equal(feedEvidence().statuses['sip:NETWORK_ERROR'],1);assert.equal(feedUsed(),'unobserved');
});
test('untrusted destinations and ambiguous symbols fail before credentials can be sent',async()=>{
 for(const [base,syms]of [['https://untrusted.example',['AAA']],['https://data.alpaca.markets@untrusted.example',['AAA']],['https://data.alpaca.markets/path',['AAA']],['http://127.0.0.1:12345',['BRK/B']],['http://127.0.0.1:12345',[]],['http://127.0.0.1:12345',[null]]]){
  resetFeed();let calls=0;assert.equal(await snapshots(base,syms,{headers:{'APCA-API-SECRET-KEY':'fixture'}},async()=>{calls++;}),null);assert.equal(calls,0);
 }
});
test('successful HTTP cannot authenticate error-shaped or unsolicited symbol snapshots',async()=>{
 for(const body of [{status:'ERROR'},{BBB:{latestTrade:{p:10}}},{AAA:{error:'no access'}}]){
  resetFeed();assert.equal(await snapshots('http://127.0.0.1:12345',['AAA'],{},async()=>({ok:true,status:200,json:async()=>body})),null);assert.equal(feedUsed(),'unobserved');
 }
});

test('invalid symbols are visible but do not poison otherwise valid snapshot requests',async()=>{
 resetFeed();let url;const payload=await snapshots('http://127.0.0.1:12345',['AAA','BRK/B',null,'AAA'],{},async u=>{url=u;return {ok:true,status:200,json:async()=>({AAA:{latestTrade:{p:10}}})};});
 assert.ok(payload.AAA);assert.match(url,/symbols=AAA$/);assert.equal(feedEvidence().invalidSymbolInputs,2);assert.equal(feedEvidence().requestedSymbolAttempts,1);assert.equal(feedEvidence().requests,1);
});
