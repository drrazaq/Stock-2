import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshots,snapshotFeed,feedUsed,feedEvidence,resetFeed} from '../alpaca-feed.mjs';
import {marketSymbol} from '../market-symbol.mjs';
import {alpacaSnapshot} from '../snapshot-fields.mjs';
test('concurrent IEX downgrade and slow SIP response keep per-response provenance',async()=>{
 resetFeed();let release;const slow=new Promise(r=>release=r);
 const a=snapshots('https://fixture',['AAA'],{},async()=>{await slow;return {ok:true,status:200,json:async()=>({AAA:{dailyBar:{v:999}}})};});
 const b=await snapshots('https://fixture',['BBB'],{},async u=>u.includes('feed=sip')?{ok:false,status:403}:{ok:true,status:200,json:async()=>({BBB:{dailyBar:{v:10}}})});
 release();const sip=await a;assert.equal(feedUsed(),'mixed');assert.equal(snapshotFeed(b),'iex');assert.equal(snapshotFeed(sip),'sip');
 assert.equal(alpacaSnapshot('BBB',b.BBB,snapshotFeed(b)==='sip').vol,null);
});
test('422 and 429 do not masquerade as IEX entitlement fallback',async()=>{
 for(const status of [422,429]){resetFeed();let n=0;assert.equal(await snapshots('https://fixture',['AAA'],{},async()=>{n++;return {ok:false,status};}),null);assert.equal(n,1);assert.equal(feedUsed(),'unobserved');assert.equal(feedEvidence().lastFailure,'HTTP_'+status);}
});
test('malformed successful response is not evidence of a working feed',async()=>{
 resetFeed();assert.equal(await snapshots('https://fixture',['AAA'],{},async()=>({ok:true,status:200,json:async()=>({message:'error'})})),null);assert.equal(feedUsed(),'unobserved');
});
test('share classes survive syntax normalization without conflating securities',()=>{
 assert.equal(marketSymbol(' brk.b '),'BRK.B');assert.equal(marketSymbol('BRK-B'),'BRK-B');assert.notEqual(marketSymbol('BRK.B'),marketSymbol('BRK-B'));
 for(const s of ['^SPX','/ES','BTC/USD','A;curl','TOOLONGTICKER'])assert.equal(marketSymbol(s),null);
});
test('a rate-limit response defers later batches instead of retrying a burst',async()=>{
 resetFeed();let calls=0;const f=async()=>{calls++;return {ok:false,status:429,headers:{get:n=>n==='retry-after'?'120':null}};};
 await snapshots('https://fixture',['AAA'],{},f);await snapshots('https://fixture',['BBB'],{},f);assert.equal(calls,1);assert.equal(feedEvidence().lastFailure,'RATE_LIMIT_COOLDOWN');resetFeed();
});
test('malformed huge retry intervals cannot crash the diagnostics clock',async()=>{
 resetFeed();await snapshots('https://fixture',['AAA'],{},async()=>({ok:false,status:429,headers:{get:n=>n==='retry-after'?'99999999999999999999999':null}}));assert.ok(Number.isFinite(Date.parse(feedEvidence().cooldownUntil)));resetFeed();
});
