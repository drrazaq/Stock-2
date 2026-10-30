import test from 'node:test';
import assert from 'node:assert/strict';
import { IG_RULES, EXITS, trigger, simulate, costOf } from '../ignition-core.mjs';
import { isFreshPriceAge } from '../ignition-gates.mjs';
import { paperRecordApproved } from '../paper-gates.mjs';
import { sessionCoverage } from '../session-coverage.mjs';
const R = IG_RULES.find(r => r.id === 'IG1'), X = EXITS.find(x => x.id === 'close');
const goodRecord = {n:60,avg:0.02,stress:0.01,noTop2:0.005,days:35,stocks:24,pf:1.3};
const mk = (m,o,h,l,c,v) => [m,o,h,l,c,v];
function replay(bars, quoteAge, record=goodRecord) {
 const tr=trigger(bars,10,1000,{float:10e6,age:100},R);
 if(!tr) return {reason:'NO_TRIGGER'};
 if(!isFreshPriceAge(quoteAge)) return {reason:'STALE_OR_UNKNOWN'};
 if(!paperRecordApproved(record,false)) return {reason:'UNPROVEN'};
 const fill=simulate(bars,10,tr,R,X);
 return fill ? {reason:'PAPER_ONLY',entry:fill.e,exit:fill.x,net:fill.g-costOf(fill.e),triggerMinute:tr.m} : {reason:'NO_FILL'};
}
const rising=[mk(570,10.2,10.4,10.1,10.3,400),mk(571,10.4,11.1,10.3,11,700),mk(572,11.2,11.5,11.1,11.4,300),mk(573,11.4,11.8,11.3,11.7,300)];
test('minute replay triggers before next-minute entry, after simulated costs',()=>{
 const x=replay(rising,1);assert.equal(x.reason,'PAPER_ONLY');assert.equal(x.triggerMinute,571);assert.equal(x.entry,11.2);assert.equal(x.exit,11.7);assert.ok(x.net < 11.7/11.2-1);
});
test('replay never promotes stale or future quote',()=>{
 for(const age of [-1,null,NaN,4]) assert.equal(replay(rising,age).reason,'STALE_OR_UNKNOWN');
});
test('replay fails closed without positive stress and top-two result',()=>{
 assert.equal(replay(rising,1,{...goodRecord,stress:null}).reason,'UNPROVEN');
 assert.equal(replay(rising,1,{...goodRecord,noTop2:null}).reason,'UNPROVEN');
});
test('no early volume threshold means no signal',()=>{
 const low=rising.map(b=>[...b.slice(0,5),10]);assert.equal(replay(low,1).reason,'NO_TRIGGER');
});
test('gap-through-stop fill is not optimistically priced at stop',()=>{
 const falling=[...rising.slice(0,3),mk(573,9.5,9.6,9.3,9.4,200)];
 const x=replay(falling,1);assert.equal(x.reason,'PAPER_ONLY');assert.equal(x.exit,9.5);assert.ok(x.net<0);
});
test('replay day coverage requires complete session',()=>{
 assert.equal(sessionCoverage(Array.from({length:300},(_,i)=>({m:570+i}))).complete,false);
});
