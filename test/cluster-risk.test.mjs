// Seam: clusterRisk(closes, dollars) in scan.mjs, shown once in YOUR STOCKS.
// Guards the 23 Oct holdings review: 7 of 12 holdings (COHR, CIEN, IESC, RELL, RKLB, SYM, CCJ) moved together (correlation about 0.5)
// and fell together, while the daily message showed 12 separate lines. Information only: it never buys or sells.
// Run: node test/cluster-risk.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const S = await loadScan();
const cr = S.fn('clusterRisk');
// a shared driver plus small private noise for A, B, C; D and E have their own unrelated paths
let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
const n = 61, drv = Array.from({ length: n }, rnd), own = () => Array.from({ length: n }, rnd);
const path = (moves) => { let p = 100; return moves.map(m => (p *= 1 + 0.03 * m)); };
const nA = own(), nB = own(), nC = own();
const closes = { A: path(drv.map((x, i) => x + 0.2 * nA[i])), B: path(drv.map((x, i) => x + 0.2 * nB[i])), C: path(drv.map((x, i) => x + 0.2 * nC[i])), D: path(own()), E: path(own()) };

test('finds the group that moves together and its share of the money', () => {
  const r = cr(closes, { A: 3000, B: 2000, C: 1000, D: 2000, E: 2000 });
  assert.deepEqual(r.syms.sort(), ['A', 'B', 'C']);
  assert.ok(r.corr > 0.8);
  assert.equal(Math.round(r.share * 100), 60);
  assert.equal(r.byMoney, true);
  assert.match(r.line, /^MOVE TOGETHER: A, B, C/);
  assert.match(r.line, /60% of your money/);
});

test('without share counts it falls back to counting positions and says so', () => {
  const r = cr(closes, {});
  assert.equal(r.byMoney, false);
  assert.match(r.line, /3 of your 5 stocks/);
});

test('no group of 3 or more: no line', () => {
  assert.equal(cr({ D: closes.D, E: closes.E, A: closes.A }, {}), null);
});

test('no network was used', () => assert.deepEqual(blocked, []));
