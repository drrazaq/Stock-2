import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionCoverage } from '../session-coverage.mjs';
const seq = (a,b) => Array.from({length:b-a},(_,i)=>({m:a+i}));
test('full 09:30-16:00 coverage passes',()=>assert.deepEqual(sessionCoverage(seq(570,960)),{expectedMinutes:390,observedMinutes:390,rate:1,complete:true}));
test('14:30 shutdown is incomplete',()=>{const x=sessionCoverage(seq(570,870));assert.equal(x.complete,false);assert.ok(x.rate<1);});
test('late start is incomplete',()=>assert.equal(sessionCoverage(seq(600,900)).complete,false));
test('duplicate heartbeats do not inflate coverage',()=>assert.equal(sessionCoverage([...seq(570,960),...seq(570,960)]).observedMinutes,390));

test('15:00 shutdown is no longer called a complete market day',()=>assert.equal(sessionCoverage(seq(570,900),'2026-10-29').complete,false));
test('half day expects 210 unique minutes',()=>assert.equal(sessionCoverage(seq(570,780),'2026-11-27').complete,true));
