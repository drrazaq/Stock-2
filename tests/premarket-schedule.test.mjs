import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=readFileSync(new URL('../.github/workflows/premarket.yml',import.meta.url),'utf8');
test('holdings premarket check has both EDT and EST 08:40 schedules',()=>{
  assert.match(workflow,/cron: '40 12 \* \* 1-5'/);
  assert.match(workflow,/cron: '40 13 \* \* 1-5'/);
  assert.match(workflow,/TZ=America\/New_York date \+%z/);
  assert.match(workflow,/offset.*-0400/);
  assert.match(workflow,/offset.*-0500/);
});
test('wrong-season cron cannot send a second holdings alert',()=>{
  assert.match(workflow,/echo 'run=false'/);
  assert.match(workflow,/steps\.season\.outputs\.run == 'true'/);
  assert.match(workflow,/ref: main/);
});
