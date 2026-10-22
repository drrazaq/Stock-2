// Seam: ladder() in scan.mjs, the size ladder that decides how many USD a trade may use (1,000 / 2,500 / 5,000 / 10,000).
// Guards audit D1 + D2 (22 Oct):
//  D1 every sale is stored in data/my-trades.jsonl ALREADY after the 0.8% cost; the ladder took the 0.8% off a second time.
//  D2 half and part sales counted as whole sales (each one pushed the 30-sale gate) and at full weight.
// Run: node test/ladder.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

// pct is net of the 0.8% cost, exactly as the bot stores it (exit / entry - 1 - 0.008)
const trades = [
  { sym: 'AAA', kind: 'manual', out: '2026-09-01', pct: 0.10 },
  { sym: 'BBB', kind: 'quick', out: '2026-09-02', pct: -0.05 },
  { sym: 'CCC', kind: 'manual', out: '2026-09-03', pct: 0.08, half: true },        // half the position: counts 0.5 x +8% = +4%
  { sym: 'DDD', kind: 'entry', out: '2026-09-04', pct: -0.06, part: '2 of 4' },    // 2 of 4 shares: counts 0.5 x -6% = -3%
  { sym: 'EEE', kind: 'manual', out: '2026-09-05', pct: 0.02 },
];
// Worked by hand:
//   total  = +10% - 5% + 4% - 3% + 2%            = +8%
//   gains  = 10 + 4 + 2 = 16;  losses = 5 + 3 = 8 -> profit factor 2.0
//   whole sales = AAA, BBB, EEE = 3, on 3 days
const S = await loadScan({ files: { 'data/my-trades.jsonl': trades } });
const L = S.fn('ladder')();

test('total is the stored after-cost results, weighted by the share of the position sold (no second 0.8% deduction)', () => {
  assert.ok(Math.abs(L.tot - 0.08) < 1e-9, 'total ' + L.tot);
});

test('profit factor uses the weighted results', () => {
  assert.ok(Math.abs(L.pf - 2.0) < 1e-9, 'profit factor ' + L.pf);
});

test('half and part sales do not count as whole sales toward the 30-sale gate', () => {
  assert.equal(L.n, 3);
  assert.equal(L.days, 3);
});

test('with 3 sales the ladder stays at level 1, 1,000 USD a trade', () => {
  assert.equal(L.level, 1);
  assert.equal(L.max, 1000);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
