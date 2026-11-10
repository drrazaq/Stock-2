// Synthetic reconciliation fixtures only; no owner holdings, trades or messages.
// Earlier owner-derived examples remain in unchanged Git history; this development
// replacement does not erase those public copies or authorize history cleanup.
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScan,blocked} from './load-scan.mjs';
const S=await loadScan({files:{'data/halal.json':{ZZE:{s:'ok',d:'2026-11-03',by:'you'}}}});
const un=S.fn('unresolvedSells'),gap=S.fn('halalGapLine');
test('a SELL carried from an earlier day is listed with its age and the reference move since',()=>{
 const pos={ZZA:{entry:50,lastAct:{act:'SELL ALL',why:'synthetic prior trend notice',d:'2026-09-23',since:'2026-09-14',px0:28}},ZZB:{entry:40,lastAct:{act:'HOLD',d:'2026-09-23'}}};
 const L=un(pos,{ZZA:26.32},'2026-09-23');assert.equal(L.length,1);assert.match(L[0],/^ZZA: SELL since 2026-09-14 \(9 days\)/);assert.match(L[0],/28\.00 then, 26\.32 saved reference \(source clock not established here; -6\.0% since\)/);
});
test('a SELL first given today is not listed (it is already in SELL)',()=>{
 const pos={ZZC:{entry:40,lastAct:{act:'SELL ALL',d:'2026-09-23',since:'2026-09-23',px0:32}}};assert.deepEqual(un(pos,{ZZC:32},'2026-09-23'),[]);
});
test('an old record without since or price uses its date and leaves the price out',()=>{
 const L=un({ZZD:{entry:80,lastAct:{act:'SELL ALL',d:'2026-09-14'}}},{},'2026-09-23');assert.match(L[0],/^ZZD: SELL since 2026-09-14 \(9 days\)/);assert.doesNotMatch(L[0],/then/);
});
test('holdings without the owner\'s halal mark are named',()=>{const line=gap({ZZE:{},ZZA:{},ZZB:{}});assert.match(line,/ZZA, ZZB/);assert.doesNotMatch(line,/ZZE/);assert.equal(gap({ZZE:{}}),'');});
test('no network was used',()=>assert.deepEqual(blocked,[]));
