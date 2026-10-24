import test from 'node:test';
import assert from 'node:assert/strict';
import { blockedRunnerPolicy, BLOCKED_RUNNER_MIN_N, BLOCKED_RUNNER_FADE_BAR } from '../blocked-runner-policy.mjs';

test('does not infer that safety blocks are correct from a small or missing sample', () => {
  assert.equal(blockedRunnerPolicy({ blockedIsLargest: true, sampleN: 4, fadeShare: 0.75 }).branch, 'BLOCKS_UNRESOLVED');
  assert.equal(blockedRunnerPolicy({ blockedIsLargest: true, sampleN: 40, fadeShare: null }).branch, 'BLOCKS_UNRESOLVED');
});

test('keeps blocks when a sufficiently large matched forward sample meets the preregistered fade bar', () => {
  const r = blockedRunnerPolicy({ blockedIsLargest: true, sampleN: 30, fadeShare: 0.60 });
  assert.equal(r.branch, 'KEEP_BLOCKS');
  assert.match(r.reason, /retain protections/);
});

test('flags block reasons for review when most blocked runners do not fade', () => {
  const r = blockedRunnerPolicy({ blockedIsLargest: true, sampleN: 60, fadeShare: 0.40 });
  assert.equal(r.branch, 'BLOCKS_NEED_REVIEW');
  assert.match(r.reason, /Do not remove protections wholesale/);
});

test('does not apply blocked policy when another category dominates', () => {
  assert.equal(blockedRunnerPolicy({ blockedIsLargest: false, sampleN: 100, fadeShare: 0.9 }).branch, 'NOT_APPLICABLE');
});

assert.equal(BLOCKED_RUNNER_MIN_N, 30);
assert.equal(BLOCKED_RUNNER_FADE_BAR, 0.55);
