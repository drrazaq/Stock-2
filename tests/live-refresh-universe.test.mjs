import test from 'node:test';
import assert from 'node:assert/strict';
import {selectLiveRefreshSymbols, MAX_PENNY_RESEARCH_REFRESH} from '../live-refresh-universe.mjs';
const r=(sym,prevC,price,vol)=>({sym,prevC,price,vol});
test('preserves all dollar-plus symbols and adds active pennies for research',()=>{
  assert.deepEqual(selectLiveRefreshSymbols([r('AAA',1,1.2,100),r('PEN',0.5,0.55,1e6),r('LOW',0.02,0.03,1e8),r('NO',0.8,0.9,0)]),['AAA','PEN']);
});
test('caps penny refresh by dollar volume and uses stable tie-breaking',()=>{
  const x=[r('AA',0.8,0.8,100),r('BB',0.8,0.8,300),r('CC',0.8,0.8,200),r('DDD',10,10,1)];
  assert.deepEqual(selectLiveRefreshSymbols(x,2),['DDD','BB','CC']);
  assert.deepEqual(selectLiveRefreshSymbols(x,0),['DDD']);
});
test('never exceeds bounded penny budget or duplicates symbols',()=>{
  const x=Array.from({length:500},(_,i)=>r('P'+i,0.6,0.6,1000+i));
  // Only legitimate uppercase ticker names are eligible; use alphabetic codes.
  const alpha=Array.from({length:500},(_,i)=>r('P'+String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26),0.6,0.6,1000+i));
  assert.equal(selectLiveRefreshSymbols(alpha,500).length,MAX_PENNY_RESEARCH_REFRESH);
  assert.equal(new Set(selectLiveRefreshSymbols(alpha,500)).size,MAX_PENNY_RESEARCH_REFRESH);
  assert.deepEqual(selectLiveRefreshSymbols([...alpha,r('AAA',1,1,1)],-1),['AAA']);
});
test('rejects malformed or non-finite research rows',()=>{
  assert.deepEqual(selectLiveRefreshSymbols([r('AAA',0.5,NaN,100),r('BBB',0.5,0.6,Infinity),r('ccc',0.5,0.6,100),r('GOOD',0.5,0.6,100)]),['GOOD']);
});
