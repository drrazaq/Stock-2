// Seam: nightlyStopRaise(P, candles, ind, i) in scan.mjs (the nightly stop raise for the owner's positions, moved out of daily()).
// Guards audit D6 (22 Oct): the tested 35% disaster stops (own: true, set by the 18 Oct stop plan) were raised every night to about
// 2 ATR under the close (APP 204.68 -> 245.32, RELL 13.77 -> 18.43, CCJ 56.30 -> 75.51), against the stop study and the owner's
// broker stops. "A stop you set yourself is yours: it is never moved by the bot."
// Run: node test/stop-raise.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const S = await loadScan();
const raise = S.fn('nightlyStopRaise');
// three sessions after the buy; last close 100, ATR 5, 50-day average 85
const c = [{ d: '2026-10-19', c: 95 }, { d: '2026-10-20', c: 98 }, { d: '2026-10-21', c: 100 }], i = 2;
const ind = { atr: [5, 5, 5], e: { 50: [80, 82, 85] } };
const WHY = 'the tested 35% disaster stop for your own picks (stop study, 18 Oct): tighter stops cost money on 5 years of buys';

test('the owner\'s own 35% disaster stop is never raised', () => {
  const P = { entry: 100, since: '2026-10-18', kind: 'manual', stop: 65, own: true, stopWhy: WHY };
  raise(P, c, ind, i);
  assert.equal(P.stop, 65);
  assert.equal(P.raised, undefined);
});

test('control: a system stop with the same reason is raised to the higher of close - 2 ATR (90) and the 50-day (85)', () => {
  const P = { entry: 100, since: '2026-10-18', kind: 'manual', stop: 65, stopWhy: WHY };
  raise(P, c, ind, i);
  assert.equal(P.stop, 90);
  assert.equal(P.raised, '2026-10-21');
});

test('a stop is never lowered', () => {
  const P = { entry: 100, since: '2026-10-18', kind: 'manual', stop: 95, stopWhy: WHY };
  raise(P, c, ind, i);
  assert.equal(P.stop, 95);
});

// KNOWN GAP (found while writing these tests, not changed): the leader raise (close - 3 ATR) and the trailing-half raise do not check
// `own`, so a stop the owner set with  stop SYM PRICE  on a leader, or on the running half, is still moved. Owner's decision.
test('the owner\'s own stop on a leader position is never raised', { todo: 'leader and trailing raises ignore own (owner to decide)' }, () => {
  const P = { entry: 100, since: '2026-10-18', kind: 'leader', stop: 70, own: true };
  raise(P, c, ind, i);
  assert.equal(P.stop, 70);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
