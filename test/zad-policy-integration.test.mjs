import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadScan} from './load-scan.mjs';
import {resolveZad} from '../zad-compliance.mjs';
const now=Date.parse('2026-10-29T12:00:00Z'),list={notHalal:[]};
test('owner yes needs strict date, valid source shapes and exclusion precedence',()=>{
 for(const d of [undefined,null,'bad','2026-02-30','2026-10-30','2026-01-01'])assert.notEqual(resolveZad({AAA:{s:'ok',d}},list,now).marks.AAA.s,'ok');
 assert.equal(resolveZad({AAA:{s:'ok',d:'2026-10-29'}},list,now).marks.AAA.s,'ok');
 for(const bad of [null,[],{},'bad',{notHalal:'AAA'},{notHalal:[null]}])assert.notEqual(resolveZad({AAA:{s:'ok',d:'2026-10-29'}},bad,now).marks.AAA.s,'ok');
 assert.equal(resolveZad({AAA:{s:'ok',d:'2026-10-29'}},{notHalal:['AAA']},now).marks.AAA.s,'fail');
 assert.equal(resolveZad({}, {...list,newHalal:['AAA']},now).marks.AAA,undefined);
});
test('rejections survive expiry and missing dates until valid explicit owner recheck',()=>{
 for(const d of ['2026-01-01','invalid',undefined]){const p=resolveZad({AAA:{s:'fail',d}},list,now);assert.equal(p.marks.AAA.s,'fail');assert.equal(p.marks.AAA.requiresRecheck,true);}
 const persisted=JSON.parse(JSON.stringify(resolveZad({AAA:{s:'fail',d:'2026-01-01'}},list,now).marks));
 assert.equal(resolveZad(persisted,list,now+100*86400000).marks.AAA.s,'fail');
 assert.equal(resolveZad({AAA:{s:'ok',d:'2026-10-29'}},list,now).marks.AAA.s,'ok');
});
test('real bot reader fails closed on missing, malformed and future mark files without changing owner data',async()=>{
 const good={AAA:{s:'ok',d:new Date().toISOString().slice(0,10)}};
 const s=await loadScan({files:{'data/halal.json':good}});assert.equal(s.fn('myHalal')('AAA'),'ok');
 const original=s.read('data/halal.json');fs.unlinkSync(s.dir+'/data/zad-list.json');assert.equal(s.fn('myHalal')('AAA'),'unknown');assert.equal(s.read('data/halal.json'),original);
 s.write('data/zad-list.json','{bad');assert.equal(s.fn('myHalal')('AAA'),'unknown');
 s.write('data/zad-list.json',list);s.write('data/halal.json',{AAA:{s:'ok',d:'2099-01-01'}});assert.equal(s.fn('myHalal')('AAA'),'unknown');
 s.write('data/halal.json',{AAA:{s:'fail',d:'2000-01-01'}});assert.equal(s.fn('myHalal')('AAA'),'fail');assert.match(s.fn('gateVerdict')('AAA',{}),/NOT halal/);
 s.write('data/halal.json','null');assert.equal(s.fn('myHalal')('AAA'),'unknown');
});
