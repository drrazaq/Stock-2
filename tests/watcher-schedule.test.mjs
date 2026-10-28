import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nyOffset } from '../ignition-core.mjs';
const workflow=fs.readFileSync(new URL('../.github/workflows/ignition.yml',import.meta.url),'utf8');
const watcher=fs.readFileSync(new URL('../ignition-watch.mjs',import.meta.url),'utf8');
test('NY clock changes from EDT to EST in November 2026',()=>{
 assert.equal(nyOffset('2026-10-28'),-240);
 assert.equal(nyOffset('2026-11-02'),-300);
});
test('both 09:10 UTC schedules and opposite-season guard exist',()=>{
 assert.match(workflow,/cron: '10 13 \* \* 1-5'/);
 assert.match(workflow,/cron: '10 14 \* \* 1-5'/);
 assert.match(workflow,/Opposite DST cron/);
 assert.match(workflow,/steps\.season\.outputs\.run == 'true'/);
});
test('watcher starts duration clock after early wait',()=>{
 const wait=watcher.indexOf('waiting for 9:25');
 const runStart=watcher.indexOf('const RUN_START = Date.now()');
 const loop=watcher.indexOf('while (Date.now() - RUN_START < MAXMS)');
 assert.ok(wait>=0 && runStart>wait && loop>runStart);
});
test('watcher records incomplete session status in daily ledger',()=>{
 assert.match(watcher,/sessionComplete: coverage \? coverage\.completeSession : false/);
 assert.match(watcher,/INCOMPLETE WATCHER SESSION/);
});
