import test from 'node:test';
import assert from 'node:assert/strict';
import {guardDecide} from '../watcher-guard-core.mjs';
import {dispatchGuard} from '../guard-dispatch.mjs';
const now=Date.parse('2026-10-29T13:12:00Z');
test('decision reserves an attempt without claiming a successful dispatch',()=>{
 const o=guardDecide(now,[],{});assert.equal(o.dispatch,true);assert.deepEqual(o.state.dispatched,[]);assert.equal(o.state.attempts[0].status,'PENDING');
 assert.doesNotMatch(o.alerts.join(' '),/started it itself/);
});
for(const status of [204,200,403,429,500,null])test('dispatch response '+status+' retains truthful durable state',async()=>{
 const o=guardDecide(now,[],{}),saved=[],calls=[];
 await dispatchGuard(o,{url:'http://localhost/fixture',headers:{},persist:async s=>saved.push(structuredClone(s)),fetcher:async(u,opt)=>{calls.push(opt);assert.equal(saved[0].attempts[0].status,'PENDING');if(status===null)throw Error('timeout');return {status};}});
 assert.equal(saved.length,2);assert.equal(calls.length,1);
 assert.equal(o.state.dispatched.length,status===204?1:0);
 assert.equal(o.state.attempts[0].status,status===204?'ACCEPTED':status===null?'UNCONFIRMED':'REJECTED');
 assert.match(o.alerts.at(-1),status===204?/execution and heartbeat are not yet confirmed/:/no restart is confirmed/);
 assert.equal(guardDecide(now+5*60000,[],o.state).dispatch,false);
});
test('failed intent persistence prevents the network action',async()=>{
 let calls=0;await assert.rejects(dispatchGuard(guardDecide(now,[],{}),{persist:()=>{throw Error('disk failed');},fetcher:()=>calls++}));assert.equal(calls,0);
});
test('legacy optimistic dispatches migrate as unconfirmed attempts',()=>{
 const o=guardDecide(now,[],{d:'2026-10-29',started:null,dispatched:[550],alerted:{}});
 assert.equal(o.dispatch,false);assert.deepEqual(o.state.dispatched,[]);assert.equal(o.state.attempts[0].status,'UNCONFIRMED_LEGACY');
});
