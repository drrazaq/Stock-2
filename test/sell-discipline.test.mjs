// Seam: sellDiscipline(trades) in scan.mjs, shown every Sunday in SCOREBOARD. Owner's measured leak (23 Oct): of 7 closed trades, 3 were
// sold well under their stops (DOCN 100 vs 120.81, AEHR 60.30 vs 65.75, CLS 291.94 vs 297.37): about 24 points lost vs selling at the stop.
// A sale more than 1% under the stop counts as late.
// Run: node test/sell-discipline.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';
const S = await loadScan(); const sd = S.fn('sellDiscipline');
const T = [
  { sym: 'CLS', entry: 335.76, exit: 291.94, stop: 297.37, pct: -0.13851 },
  { sym: 'AEHR', entry: 83, exit: 60.3, stop: 65.75, pct: -0.28149 },
  { sym: 'DOCN', entry: 134, exit: 100, stop: 120.81, pct: -0.26173 },
  { sym: 'OK1', entry: 50, exit: 46, stop: 46, pct: -0.088 },
  { sym: 'WIN', entry: 10, exit: 12, stop: 9, pct: 0.192 },
  { sym: 'NOSTOP', entry: 10, exit: 9, pct: -0.108 } ];
test('counts late sales and what they cost against selling at the stop', () => {
  const r = sd(T);
  assert.equal(r.withStop, 5); assert.equal(r.late, 3);
  assert.equal(Math.round(r.cost * 1000), 237);   // price gap exit vs stop, over entry: 1.6 + 6.6 + 15.5 points (the 26 points said on 23 Oct mixed after-cost results with raw stop levels)
  assert.match(r.line, /^SELL DISCIPLINE: 3 of 5 sales with a stop were made late/);
  assert.match(r.line, /about 24 points \(about 237 USD at 1,000 USD a trade\)/);
});
test('no late sales: says so', () => assert.match(sd([T[3], T[4]]).line, /0 of 2/));
test('no trades: no line', () => assert.equal(sd([]).line, ''));
test('no network was used', () => assert.deepEqual(blocked, []));
