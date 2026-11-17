// Agent A repair, 17 Nov 2026: autolab tests one new-rule batch per price week. On 15 Nov a manual study run and GitHub's
// 7-hour-late scheduled run each tested 60 new rules for week 2026-11-13.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { batchDue, MIN_GAP_MS } from '../autolab-week-guard.mjs';

const at = '2026-11-15T13:21:00.000Z', t0 = Date.parse(at);

test('the 15 Nov duplicate run is skipped (same week, minutes later)', () => {
  assert.equal(batchDue({ week: '2026-11-13' }, at, '2026-11-13', t0 + 15 * 60000, false), false);
});

test('a new price week gets a batch', () => {
  assert.equal(batchDue({ week: '2026-11-13' }, at, '2026-11-20', t0 + 7 * 86400000, false), true);
});

test('a stale price cache does not block a real new week (25 Oct / 1 Nov both read 2026-10-19)', () => {
  assert.equal(batchDue({ week: '2026-10-19' }, '2026-10-25T06:40:00Z', '2026-10-19', Date.parse('2026-11-01T07:00:00Z'), false), true);
  assert.equal(batchDue({ week: 'w' }, at, 'w', t0 + MIN_GAP_MS, false), true);
});

test('first run, missing or bad timestamp, and AUTO_FORCE all allow a batch', () => {
  assert.equal(batchDue(undefined, undefined, '2026-11-13', t0, false), true);
  assert.equal(batchDue({ week: '2026-11-13' }, 'not a date', '2026-11-13', t0, false), true);
  assert.equal(batchDue({ week: '2026-11-13' }, at, '2026-11-13', t0 + 60000, true), true);
});

test('autolab.mjs uses the guard and still scores live paper when the batch is skipped', () => {
  const src = fs.readFileSync(new URL('../autolab.mjs', import.meta.url), 'utf8');
  assert.match(src, /import \{ batchDue \} from '\.\/autolab-week-guard\.mjs'/);
  assert.match(src, /const fresh = DUE \? newRules\(PER_WEEK\) : \[\]/);
  assert.match(src, /if \(DUE\) \{ LAB\.weeks\+\+; LAB\.last = \{ week: D\[T - 1\], at: LAB\.generatedAt/);
  const paper = src.indexOf('// ---- 2. live paper'), guard = src.indexOf('if (DUE) { LAB.weeks++');
  assert.ok(paper > 0 && guard > paper, 'live paper scoring must not sit behind the guard');
});
