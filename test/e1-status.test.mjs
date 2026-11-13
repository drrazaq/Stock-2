// Actual owner output; synthetic fixture, no strategy retest.
import test from 'node:test';import assert from 'node:assert/strict';
import {loadScan,blocked} from './load-scan.mjs';
test('failed E1 fair test is OFF in ACTIONS, never advertised as an active lane',async()=>{
 const S=await loadScan({files:{'data/earnings-study.json':{verdict:'NOT PROVEN'},'data/settings.json':{focus:true}}});
 const text=await S.fn('actionsText')({session:'2026-11-12',generatedAt:'2026-11-12T23:00:00Z',stocks:[],quick:[],pead:[],peadFunnel:{reports:5,beat:2,passed:1}}, {},null,'SYNTHETIC');
 assert.match(text,/EARNINGS DRIFT: OFF.*NOT PROVEN.*no buys/);assert.doesNotMatch(text,/own lanes \(LEADER DIP, LONGER HOLDS, EARNINGS DRIFT\) active|EARNINGS DRIFT: no buy tonight/);assert.equal(blocked.length,0);
});
