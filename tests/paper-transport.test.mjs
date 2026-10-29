import test from 'node:test';
import assert from 'node:assert/strict';
import {paperRequest} from '../paper-transport.mjs';
const order={symbol:'AAA',qty:'1',side:'buy',type:'limit',limit_price:'10',time_in_force:'day',client_order_id:'fixture-order',order_class:'oto',stop_loss:{stop_price:'9'}},base={key:'fixture',secret:'fixture',path:'/v2/orders',method:'POST',body:order};
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
 let calls=0;const fetcher=async()=>{calls++;return new Response(JSON.stringify({id:'fixture'}));};
 assert.deepEqual(await paperRequest({...base,path:'/v2/account',method:'GET',body:undefined,fetcher}),{id:'fixture'});
 for(const qty of [null,true,{},'',0,'bad',-1,'Infinity','1e2'])assert.equal((await paperRequest({...base,body:{...order,qty},enableOrders:true,fetcher})).error,'INVALID_PAPER_ORDER');
 assert.equal(calls,1);
});
test('truthy opt-in strings/objects, PATCH and misplaced POST IDs cannot create mutations',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not fetch');};
 for(const enableOrders of ['1','true','false',1,{},[]])assert.equal((await paperRequest({...base,enableOrders,fetcher})).error,'ORDER_MUTATIONS_DISABLED');
 for(const args of [{method:'PATCH',path:'/v2/orders/abc'},{path:'/v2/orders/abc'},{method:'DELETE',path:'/v2/orders'},{method:'GET'}])assert.ok((await paperRequest({...base,...args,enableOrders:true,fetcher})).error);assert.equal(calls,0);
});
test('nonfinite prices, overflowing capital, malformed stops and body method overrides fail before fetch',async()=>{
 let calls=0;const fetcher=async()=>{calls++;};for(const patch of [{limit_price:'Infinity'},{limit_price:'-1'},{limit_price:'1'+'0'.repeat(308),qty:'9000000000000000'},{stop_loss:{stop_price:'11'}},{stop_loss:null},{_method:'DELETE'},{qty:'9007199254740992'}])assert.equal((await paperRequest({...base,enableOrders:true,body:{...order,...patch},fetcher})).error,'INVALID_PAPER_ORDER');assert.equal(calls,0);
});
test('DELETE204 is confirmed while ambiguous POST and hanging body remain unknown without retries',async()=>{
 const id='12345678-1234-1234-1234-123456789abc';assert.deepEqual(await paperRequest({...base,method:'DELETE',path:'/v2/orders/'+id,body:undefined,enableOrders:true,fetcher:async()=>new Response(null,{status:204})}),{cancelled:true,id});
 let calls=0;const r=await paperRequest({...base,enableOrders:true,fetcher:async()=>{calls++;return new Response(JSON.stringify({id}));}});assert.equal(r.error,'BROKER_OUTCOME_UNCONFIRMED');assert.equal(calls,1);
 const ack={id,symbol:order.symbol,side:order.side,client_order_id:order.client_order_id};assert.deepEqual(await paperRequest({...base,enableOrders:true,fetcher:async()=>new Response(JSON.stringify(ack))}),ack);
 const pending=await paperRequest({...base,enableOrders:true,timeoutMs:10,fetcher:async()=>new Response(new ReadableStream({pull:()=>new Promise(()=>{})}))});assert.equal(pending.error,'BROKER_OUTCOME_UNCONFIRMED');
});
