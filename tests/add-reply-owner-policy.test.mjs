import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {loadScan} from '../test/load-scan.mjs';
const date=new Date().toISOString().slice(0,10),at=Date.parse('2026-10-29T14:00:00Z'),pos={AAA:{entry:10,stop:8,kind:'entry',since:'2026-10-01'}};
async function fixture(t,mark,{price='11',signal={stocks:[],quick:[],market:{}},list={notHalal:[]}}={}){
 let calls=0;const server=http.createServer((req,res)=>{calls++;req.resume();res.setHeader('content-type','application/json');res.end(JSON.stringify({price}));});t.after(()=>new Promise(r=>server.close(r)));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const S=await loadScan({env:{TD_BASE:base},files:{'data/my-positions.json':pos,'data/halal.json':mark?{AAA:mark}:{},'data/zad-list.json':list,'data/signals.json':signal,'data/settings.json':{focus:false}}});return {S,calls:()=>calls,run:()=>S.fn('addReply')('AAA',pos,at)};
}
test('missing/stale/rejected/third-party owner state blocks add replies before price lookup',async t=>{
 for(const mark of [undefined,{s:'fail',d:date},{s:'ok',d:'2020-01-01'},{s:'ok',d:date,by:'Zoya'}]){const f=await fixture(t,mark),before=f.S.read('data/my-positions.json'),text=await f.run();assert.match(text,/NO ADD APPROVAL/);assert.doesNotMatch(text,/Yes: add|adding is allowed|planned second stage/);assert.equal(f.calls(),0);assert.equal(f.S.read('data/my-positions.json'),before);}
});
test('a current owner yes does not make an absent signal or invalid price into an add',async t=>{
 for(const price of ['11','Infinity','bad']){const f=await fixture(t,{s:'ok',d:date,by:'ZAD (you)'},{price}),text=await f.run();assert.match(text,/RESEARCH ONLY — NO ADD APPROVAL/);assert.doesNotMatch(text,/Yes: add|adding is allowed|planned second stage/);}
});
test('a quarterly exclusion still blocks a current owner mark',async t=>{
 const f=await fixture(t,{s:'ok',d:date,by:'ZAD (you)'},{list:{notHalal:['AAA']}});assert.match(await f.run(),/NO ADD APPROVAL/);assert.equal(f.calls(),0);
});
