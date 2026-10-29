import test from 'node:test';
import assert from 'node:assert/strict';
import {paperRequest} from '../paper-transport.mjs';
const order={symbol:'AAA',qty:'1',side:'buy'},base={key:'fixture',secret:'fixture',path:'/v2/orders',method:'POST',body:order};
test('broker writes default disabled and live/redirect/path overrides cannot reach a fetch',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not fetch');};
 for(const args of [{},{base:'https://api.alpaca.markets',enableOrders:true},{base:'https://paper-api.alpaca.markets.evil.test',enableOrders:true},{base:'https://paper-api.alpaca.markets/path',enableOrders:true},{path:'//api.alpaca.markets/v2/orders',enableOrders:true},{path:'/v2/positions/AAA',method:'DELETE',enableOrders:true}])assert.ok((await paperRequest({...base,...args,fetcher})).error);
 assert.equal(calls,0);
});
test('explicit paper-only opt-in uses bounded no-redirect transport and never retries unknown outcomes',async()=>{
 let calls=0;const r=await paperRequest({...base,enableOrders:true,fetcher:async(u,o)=>{calls++;assert.equal(u,'https://paper-api.alpaca.markets/v2/orders');assert.equal(o.redirect,'error');assert.ok(o.signal);throw Error('unknown');}});
 assert.equal(r.error,'BROKER_OUTCOME_UNCONFIRMED');assert.equal(calls,1);
});
test('read-only broker requests remain usable and invalid paper quantities are refused',async()=>{
 let calls=0;const fetcher=async()=>{calls++;return {ok:true,json:async()=>({id:'fixture'})};};
 assert.deepEqual(await paperRequest({...base,path:'/v2/account',method:'GET',body:undefined,fetcher}),{id:'fixture'});
 for(const qty of [null,true,{},'',0,'bad',-1,'Infinity','1e2'])assert.equal((await paperRequest({...base,body:{...order,qty},enableOrders:true,fetcher})).error,'INVALID_PAPER_ORDER');
 assert.equal(calls,1);
});
