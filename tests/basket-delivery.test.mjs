import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {loadScan} from '../test/load-scan.mjs';
const now=Date.parse('2026-11-02T16:00:00Z'),key='monthly|2026-11';
async function fixture(t,{state,initial='ACK'}={}){
 let mode=initial,calls=0;const server=http.createServer((req,res)=>{calls++;req.resume();res.setHeader('content-type','application/json');if(mode==='400'){res.statusCode=400;res.end(JSON.stringify({ok:false}));}else res.end(JSON.stringify({ok:true,result:mode==='ACK'?{message_id:calls}:true}));});
 t.after(()=>new Promise(r=>server.close(r)));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const files=state===undefined?{}:{'data/basket-state.json':state};const S=await loadScan({files,env:{TG_TOKEN:'fixture',TG_CHAT:'42',TG_BASE:base,TD_BASE:base}});
 return {S,calls:()=>calls,ack:()=>mode='ACK',run:()=>S.fn('basketNotices')(now)};
}
test('definite refusal leaves monthly pending and a confirmed retry advances it',async t=>{
 const f=await fixture(t,{initial:'400'});assert.equal((await f.run()).ok,false);assert.equal(f.S.readJson('data/basket-state.json').monthly,undefined);
 assert.equal(f.S.readJson('data/basket-state.json').noticeDelivery.delivery[key],undefined);f.ack();assert.equal((await f.run()).ok,true);assert.equal(f.calls(),2);assert.equal(f.S.readJson('data/basket-state.json').monthly,'2026-11');await f.run();assert.equal(f.calls(),2);
});
test('ambiguous reply survives restored job state and cannot become sent or replay',async t=>{
 const f=await fixture(t,{initial:'UNKNOWN'});assert.equal((await f.run()).ok,false);const state=f.S.readJson('data/basket-state.json');assert.equal(state.monthly,undefined);assert.equal(state.noticeDelivery.delivery[key].status,'UNKNOWN');
 const restored=await fixture(t,{state});assert.equal((await restored.run()).ok,false);assert.equal(restored.calls(),0);assert.equal(restored.S.readJson('data/basket-state.json').monthly,undefined);
});
test('malformed state and nested delivery state fail before any send and preserve bytes',async t=>{
 for(const state of ['{bad',null,[],{noticeDelivery:{sent:[],delivery:{}}},{noticeDelivery:{sent:{},delivery:{x:{status:'BROKEN'}}}}]){
  const f=await fixture(t,{state}),before=f.S.read('data/basket-state.json');assert.equal((await f.run()).ok,false);assert.equal(f.calls(),0);assert.equal(f.S.read('data/basket-state.json'),before);
 }
});
test('failed durable intent prevents sending; no semantic sent marker is invented',async t=>{
 const f=await fixture(t),rename=fs.renameSync;fs.renameSync=()=>{throw Error('fixture disk failure');};try{assert.equal((await f.run()).ok,false);assert.equal(f.calls(),0);assert.equal(fs.existsSync(f.S.dir+'/data/basket-state.json'),false);}finally{fs.renameSync=rename;}
});
test('durable ACK reconciles a missing semantic marker without resending',async t=>{
 const f=await fixture(t,{state:{noticeDelivery:{sent:{[key]:1},delivery:{[key]:{status:'ACK',at:'2026-11-02T16:00:00Z'}}}}});assert.equal((await f.run()).ok,true);assert.equal(f.calls(),0);assert.equal(f.S.readJson('data/basket-state.json').monthly,'2026-11');
});
