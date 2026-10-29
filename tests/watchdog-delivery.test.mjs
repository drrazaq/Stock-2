import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {loadScan} from '../test/load-scan.mjs';
const at=Date.parse('2026-10-29T13:00:00Z'),day='2026-10-28',key='watchdog|'+day+'|scan';
async function fixture(t,{state={offset:123},mode='ACK'}={}){
 let current=mode,calls=0;const server=http.createServer((req,res)=>{calls++;req.resume();res.setHeader('content-type','application/json');if(current==='403'){res.statusCode=403;res.end(JSON.stringify({ok:false}));}else res.end(JSON.stringify({ok:true,result:current==='ACK'?{message_id:calls}:true}));});t.after(()=>new Promise(r=>server.close(r)));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const S=await loadScan({env:{TG_TOKEN:'fixture',TG_CHAT:'42',TG_BASE:base,TD_BASE:base},files:{'data/tg-state.json':state,'data/discovery.json':{session:day,candidates:[]},'data/movers-state.json':{session:day}}});
 return {S,calls:()=>calls,ack:()=>current='ACK',run:()=>S.fn('watchdog')({session:'2026-10-27'},at)};
}
test('refused watchdog does not claim warned; confirmed retry advances marker and preserves command offset',async t=>{
 const f=await fixture(t,{mode:'403'});assert.equal((await f.run()).ok,false);let st=f.S.readJson('data/tg-state.json');assert.equal(st.warned.scan,undefined);assert.equal(st.offset,123);f.ack();assert.equal((await f.run()).ok,true);st=f.S.readJson('data/tg-state.json');assert.equal(st.warned.scan,day);assert.equal(st.offset,123);await f.run();assert.equal(f.calls(),2);
});
test('unknown watchdog acknowledgment survives restored state without blind replay or claimed delivery',async t=>{
 const f=await fixture(t,{mode:'UNKNOWN'});await f.run();const st=f.S.readJson('data/tg-state.json');assert.equal(st.watchdogDelivery.delivery[key].status,'UNKNOWN');assert.equal(st.warned.scan,undefined);assert.doesNotMatch(JSON.stringify(st),/nightly scan|In GitHub open Actions|WATCHDOG\n/);
 const restored=await fixture(t,{state:st});assert.equal((await restored.run()).reason,'WATCHDOG_DELIVERY_QUARANTINED');assert.equal(restored.calls(),0);
});
test('malformed command/delivery state and failed intent persistence prevent watchdog sending',async t=>{
 for(const state of ['{broken',null,[],{offset:'123'},{offset:1,watchdogDelivery:{sent:[],delivery:{}}}]){const f=await fixture(t,{state}),before=f.S.read('data/tg-state.json');assert.equal((await f.run()).ok,false);assert.equal(f.calls(),0);assert.equal(f.S.read('data/tg-state.json'),before);}
 const f=await fixture(t),rename=fs.renameSync;fs.renameSync=()=>{throw Error('fixture disk failure');};try{assert.equal((await f.run()).ok,false);assert.equal(f.calls(),0);}finally{fs.renameSync=rename;}
});
test('durable ACK reconciles a missing warned marker without another message',async t=>{
 const f=await fixture(t,{state:{offset:123,watchdogDelivery:{sent:{[key]:1},delivery:{[key]:{status:'ACK',at:new Date(at).toISOString()}}}}});assert.equal((await f.run()).ok,true);assert.equal(f.calls(),0);assert.equal(f.S.readJson('data/tg-state.json').warned.scan,day);
});
