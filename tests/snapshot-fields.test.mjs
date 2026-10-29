import test from 'node:test';
import assert from 'node:assert/strict';
import {massiveSnapshot,alpacaSnapshot,mergeLiveSnapshot} from '../snapshot-fields.mjs';
test('Massive prices and aggregate volumes keep their respective clocks',()=>{
 const x=massiveSnapshot({ticker:'ABC',lastTrade:{p:12,t:1800000000000000000},min:{c:11,t:1700000000000,av:500},day:{v:600}});
 assert.equal(x.t,1800000000000);assert.equal(x.vt,1700000000000);assert.equal(x.vol,500);
 const fallback=massiveSnapshot({ticker:'ABC',lastTrade:{t:1800000000000000000},day:{c:11,v:600},updated:1800000000000000000});
 assert.equal(fallback.price,11);assert.equal(fallback.t,0);assert.equal(fallback.vt,0);
});
test('Alpaca daily fallback never inherits a recent trade clock',()=>{
 const row=alpacaSnapshot('ABC',{latestTrade:{t:'2026-10-28T14:30:00Z'},dailyBar:{c:12,v:500,t:'2026-10-28T08:00:00Z'}},true);
 assert.equal(row.t,Date.parse('2026-10-28T08:00:00Z'));assert.equal(row.vt,row.t);
 assert.equal(alpacaSnapshot('ABC',{dailyBar:{c:12,v:500}},true).t,0);
 assert.equal(alpacaSnapshot('ABC',{dailyBar:{c:12,v:500}},false).vol,null);
});
test('live trade refresh cannot make older aggregate volume appear current',()=>{
 const row={price:10,t:10,vol:1000,vt:100,qt:0};
 assert.equal(mergeLiveSnapshot(row,{price:12,t:200,vol:500,vt:50}),true);
 assert.equal(row.price,12);assert.equal(row.vol,1000);assert.equal(row.vt,100);
 assert.equal(mergeLiveSnapshot(row,{price:11,t:150,vol:1500,vt:250}),false);
 assert.equal(row.price,12);assert.equal(row.vol,1500);assert.equal(row.vt,250);
});
test('malformed numeric provider fields are not coerced into evidence',()=>{
 const row=massiveSnapshot({lastTrade:{p:'12',t:Infinity},min:{c:NaN,av:'500'},day:{c:Infinity}});
 assert.equal(row.price,0);assert.equal(row.t,0);assert.equal(row.vol,0);
});
test('a future-dated price cannot pin a symbol against a real current refresh',()=>{
 const now=1800000000000,row={price:20,t:now+60000,vt:0,qt:0};
 assert.equal(mergeLiveSnapshot(row,{price:10,t:now-1000},now),true);
 assert.equal(row.price,10);
 assert.equal(mergeLiveSnapshot(row,{price:30,t:now+120000},now),false);
 assert.equal(row.price,10);
});
