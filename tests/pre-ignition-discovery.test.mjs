import test from 'node:test';
import assert from 'node:assert/strict';
import {detectPreIgnition,recordPreIgnition,finishPreIgnition} from '../pre-ignition-discovery.mjs';
const base={change:0.008,rvT:2.4,price:4,live:true,dollarVol:500000,minute:600};
test('detects unusual volume while price remains within 2 percent',()=>{const s=detectPreIgnition(base);assert.ok(s);assert.equal(s.price,4);assert.equal(s.under1,false)});
test('rejects stale, late, low-volume and already extended stocks',()=>{for(const change of [0.021,-0.021])assert.equal(detectPreIgnition({...base,change}),null);assert.equal(detectPreIgnition({...base,live:false}),null);assert.equal(detectPreIgnition({...base,minute:700}),null);assert.equal(detectPreIgnition({...base,rvT:1.7}),null);assert.equal(detectPreIgnition({...base,dollarVol:249999}),null)});
test('penny stocks visible for research without BUY decision',()=>{const s=detectPreIgnition({...base,price:0.45});assert.equal(s.under1,true);assert.equal('decision' in s,false)});
test('first sighting frozen; records intraday follow-through and drawdown',()=>{const b={},s=detectPreIgnition(base);recordPreIgnition(b,'ABCD',s,600,4);recordPreIgnition(b,'ABCD',s,605,4.8);recordPreIgnition(b,'ABCD',null,610,3.8);const row=finishPreIgnition(b)[0];assert.equal(row.firstPrice,4);assert.equal(row.bestAfter,0.2);assert.equal(row.worstAfter,-0.05);assert.equal(row.lastAfter,-0.05)});
