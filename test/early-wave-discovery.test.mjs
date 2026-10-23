// Observation-only early-wave lane (outside patch, 23 Oct 2026): stocks +2% to +15% with elevated volume pace, logged with first
// sighting and best move, including sub-$1, to be judged later against matched stocks. Never an alert or a buy.
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreEarlyWaveCandidate, updateEarlyWaveCandidate } from '../early-wave-discovery.mjs';

test('records an early, live, volume-supported move before +10%', () => {
  const x = scoreEarlyWaveCandidate({ change: 0.04, rv: 0.3, rvT: 1.8, live: true, price: 4.2, oneMinuteChange: 0.01 });
  assert.ok(x);
  assert.equal(x.lane, 'OBSERVATION_ONLY_NOT_A_BUY_SIGNAL');
  assert.equal(x.change, 0.04);
  assert.equal(x.under1, false);
});

test('includes sub-$1 candidates for observation, never as an automatic buy', () => {
  const x = scoreEarlyWaveCandidate({ change: 0.06, rv: 0.7, rvT: null, live: true, price: 0.42 });
  assert.ok(x);
  assert.equal(x.under1, true);
  assert.match(x.lane, /OBSERVATION_ONLY/);
});

test('rejects stale prices, weak moves and unsupported volume', () => {
  assert.equal(scoreEarlyWaveCandidate({ change: 0.04, rv: 1, rvT: 2, live: false, price: 4 }), null);
  assert.equal(scoreEarlyWaveCandidate({ change: 0.01, rv: 2, rvT: 2, live: true, price: 4 }), null);
  assert.equal(scoreEarlyWaveCandidate({ change: 0.04, rv: 0.1, rvT: 1.2, live: true, price: 4 }), null);
});

test('candidate ledger preserves first appearance and updates maximum move', () => {
  const book = {};
  const a = scoreEarlyWaveCandidate({ change: 0.03, rv: 0.6, rvT: 1.6, live: true, price: 2 });
  const b = scoreEarlyWaveCandidate({ change: 0.07, rv: 0.8, rvT: 1.9, live: true, price: 2.08 });
  updateEarlyWaveCandidate(book, 'TEST', a, '09:41');
  updateEarlyWaveCandidate(book, 'TEST', b, '09:42');
  assert.equal(book.TEST.firstMinute, '09:41');
  assert.equal(book.TEST.maxChange, 0.07);
  assert.equal(book.TEST.lastMinute, '09:42');
});
