// Seam: lossLineFor(P, px, m50) in scan.mjs: the "SELL if it closes under X" price on every HOLD line.
// Owner's ACTIONS of 23 Oct showed "CCJ (-8.9%): SELL if it closes under 92.60 stop 72.02" with CCJ at 78.93: a sell line ABOVE the price
// on a HOLD, and a second stop number. Cause: a wide stop (under 75% of the price) switched the line to the 50-day average even for
// the tested 35% disaster stop of the owner's own picks (18 Oct stop study: tighter stops cost money). Rules now:
//   own pick with its own/disaster stop -> the stop;  leader -> the higher of 50-day and stop, but only while the 50-day is under the price;
//   a line at or above the price is never shown as a HOLD line (the stop is shown instead).
// Run: node test/loss-line.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';
const S = await loadScan(); const ll = S.fn('lossLineFor');
const DIS = 'the tested 35% disaster stop for your own picks (stop study, 18 Oct): tighter stops cost money on 5 years of buys';
test('CCJ: own pick with the 35% disaster stop -> the stop, never the 50-day above the price', () => {
  assert.equal(ll({ stop: 56.3, stopWhy: DIS }, 78.93, 92.6), 56.3);
});
test('leader with the 50-day under the price -> the 50-day (higher than the stop)', () => {
  assert.equal(ll({ kind: 'leader', stop: 40 }, 60, 55), 55);
});
test('a 50-day above the price is never the HOLD line -> the stop', () => {
  assert.equal(ll({ kind: 'leader', stop: 40 }, 60, 70), 40);
});
test('ordinary stop -> the stop', () => assert.equal(ll({ stop: 12.06 }, 13.16, 13.22), 12.06));
test('no stop and no usable 50-day -> null', () => assert.equal(ll({}, 10, 12), null));
test('no network was used', () => assert.deepEqual(blocked, []));
