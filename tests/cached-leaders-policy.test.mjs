import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScan} from '../test/load-scan.mjs';
test('cached research BUY text cannot bypass current owner ZAD or become a current instruction',async()=>{
 for(const marks of [{},{AAA:{s:'fail',d:new Date().toISOString().slice(0,10)}},{AAA:{s:'ok',d:'2020-01-01'}},{AAA:{s:'ok',d:new Date().toISOString().slice(0,10)}}]){
  const archived={session:'2026-10-23',text:'NEW TO BUY: AAA at 10; BUY NOW. Fake cached claim.',paper:[{sym:'AAA'},{sym:'BAD\nBUY NOW'}]};
  const S=await loadScan({files:{'data/leaders.json':archived,'data/halal.json':marks}});
  const before=S.read('data/leaders.json'),text=S.fn('leadersText')();
  assert.match(text,/RESEARCH ONLY, NOT AN APPROVED BUY/);assert.doesNotMatch(text,/BUY NOW|NEW TO BUY|Fake cached claim|BAD/);assert.equal(S.read('data/leaders.json'),before);
  if(marks.AAA?.s==='fail')assert.match(text,/ZAD BLOCKED/);
 }
});
