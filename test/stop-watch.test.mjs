// Seam: stop-watch.mjs. Owner's losses of Oct: DOCN fell through its 120.81 stop during 14 Oct and was sold on 20 Oct at 100; AEHR
// fell through 65.75 during 15 Oct and was sold at 60.30. The stop was checked only at the nightly close. Now the live watcher checks
// every held stock each minute and sends one SELL NOW message the moment the price is at or under the stop (and one NEAR STOP warning).
// Run: node test/stop-watch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { stopHits } from '../stop-watch.mjs';

const pos = { DOCN: { entry: 134, stop: 120.81 }, PR: { entry: 22.4, stop: 23.45 }, NOSTOP: { entry: 10 }, X: { entry: 50, stop: 40 } };
test('price at or under the stop: one SELL NOW message, not repeated', () => {
  const sent = {};
  const a = stopHits(pos, { DOCN: 119.9, PR: 24.4, X: 45 }, sent);
  assert.equal(a.length, 1); assert.equal(a[0].sym, 'DOCN'); assert.equal(a[0].kind, 'hit');
  assert.match(a[0].text, /^STOP HIT NOW: DOCN 119\.90 is under your stop 120\.81/);
  assert.match(a[0].text, /SELL NOW/);
  assert.match(a[0].text, /sold DOCN PRICE/);
  assert.equal(stopHits(pos, { DOCN: 119.5 }, sent).length, 0);
});
test('within 2% above the stop: one NEAR STOP warning, then the hit still comes', () => {
  const sent = {};
  const a = stopHits(pos, { PR: 23.8 }, sent);
  assert.equal(a.length, 1); assert.equal(a[0].kind, 'near'); assert.match(a[0].text, /^NEAR STOP: PR 23\.80/);
  assert.equal(stopHits(pos, { PR: 23.7 }, sent).length, 0);
  const b = stopHits(pos, { PR: 23.4 }, sent); assert.equal(b.length, 1); assert.equal(b[0].kind, 'hit');
});
test('no stop, no price, or a bad price: nothing', () => {
  assert.deepEqual(stopHits(pos, { NOSTOP: 1, X: 0 }, {}), []);
  assert.deepEqual(stopHits(null, { DOCN: 1 }, {}), []);
});
