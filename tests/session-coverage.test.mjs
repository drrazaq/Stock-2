import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionCoverage } from '../session-coverage.mjs';
const seq = (a,b) => Array.from({length:b-a},(_,i)=>({m:a+i}));
test('full 09:30-15:00 coverage passes',()=>assert.deepEqual(sessionCoverage(seq(570,900)),{expectedMinutes:330,observedMinutes:330,rate:1,complete:true}));
test('14:30 shutdown is incomplete',()=>{const x=sessionCoverage(seq(570,870));assert.equal(x.complete,false);assert.ok(x.rate<1);});
test('late start is incomplete',()=>assert.equal(sessionCoverage(seq(600,900)).complete,false));
test('duplicate heartbeats do not inflate coverage',()=>assert.equal(sessionCoverage([...seq(570,900),...seq(570,900)]).observedMinutes,330));
