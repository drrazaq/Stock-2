// Seam: stop-watch.mjs. Owner's losses of Oct: DOCN fell through its 120.81 stop during 14 Oct and was sold on 20 Oct at 100; AEHR
// fell through 65.75 during 15 Oct and was sold at 60.30. The stop was checked only at the nightly close. Now the live watcher checks
// every held stock each minute. (4 Nov) A crossing is only shown as current on valid, dated, ticker-bound price evidence; otherwise
// STOP CHECK UNKNOWN. Run: node test/stop-watch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { stopHits } from '../stop-watch.mjs';

const NOW = Date.parse('2026-11-05T15:31:00Z');   // 10:31 New York
const q = (sym, price, ageSec = 20) => ({ sym, price, t: NOW - ageSec * 1000, provider: 'ALPACA', feed: 'iex', kind: 'TRADE' });
const pos = { DOCN: { entry: 134, stop: 120.81 }, PR: { entry: 22.4, stop: 23.45 }, NOSTOP: { entry: 10 }, X: { entry: 50, stop: 40 } };
test('price at or below the stop: one STOP LEVEL REACHED message, not repeated', () => {
  const sent = {};
  const a = stopHits(pos, { DOCN: q('DOCN', 119.9), PR: q('PR', 24.4), X: q('X', 45) }, sent, NOW);
  assert.equal(a.length, 1); assert.equal(a[0].sym, 'DOCN'); assert.equal(a[0].kind, 'hit');
  assert.match(a[0].text, /^STOP LEVEL REACHED: DOCN traded at or below your stop 120\.81: last price 119\.90 \(ALPACA IEX, Nov 5 10:30 New York, 20 s old\)/);
  assert.match(a[0].text, /do not sell again/); assert.match(a[0].text, /sold DOCN FILLPRICE/); assert.doesNotMatch(a[0].text, /SELL NOW/);
  assert.equal(stopHits(pos, { DOCN: q('DOCN', 119.5), PR: q('PR', 24.4), X: q('X', 45) }, sent, NOW).length, 0);
});
test('within 2% above the stop: one NEAR STOP warning, then the hit still comes', () => {
  const sent = {}, rest = { DOCN: q('DOCN', 130), X: q('X', 45) };
  const a = stopHits(pos, { ...rest, PR: q('PR', 23.8) }, sent, NOW);
  assert.equal(a.length, 1); assert.equal(a[0].kind, 'near'); assert.match(a[0].text, /^NEAR STOP: PR 23\.80 is 1\.5% above your stop 23\.45 \(ALPACA IEX/);
  assert.equal(stopHits(pos, { ...rest, PR: q('PR', 23.7) }, sent, NOW).length, 0);
  const b = stopHits(pos, { ...rest, PR: q('PR', 23.4) }, sent, NOW); assert.equal(b.length, 1); assert.equal(b[0].kind, 'hit');
});
test('no stop: nothing; no positions: nothing', () => {
  assert.deepEqual(stopHits({ NOSTOP: { entry: 10 } }, { NOSTOP: q('NOSTOP', 1) }, {}, NOW), []);
  assert.deepEqual(stopHits(null, { DOCN: q('DOCN', 1) }, {}, NOW), []);
});
