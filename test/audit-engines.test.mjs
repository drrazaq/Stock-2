// ENGINE AUDIT (24 Oct 2026): the bugs the outside reviews pointed at, checked against the code, pinned here.
//   AUD-1  the average-stock yardstick and the "same stock on other days" yardstick DROPPED every stock that gained +300% or more over
//          the window (value-lab ctrl / ownOf, anomaly-lab ctrlSpan / ownAverage, decoded-lab ctrlSpan, macro-lab ctrlSpan) while the
//          strategy's own trades were NOT capped. Same window, same costs, but not the same treatment of big winners: the yardstick was
//          made lower than the real average stock. Fix (yardstick.mjs): mode 'capBoth' caps every gross return at +300% on BOTH sides
//          (winsorised, never dropped); 'asFrozen' reproduces the frozen first runs exactly; 'raw' = no cap on either side (sensitivity).
//   AUD-2  ANOM-SUESURGE: the top-30% revenue-surprise cut-off was taken over the previous 63 sessions' reports INCLUDING reports whose
//          SEC filing (where the revenue surprise comes from) was made AFTER the trade being judged was bought. Fix: surgeCutoff only
//          counts reports whose filing was public by the entry (filing session <= entry session).
//   correctedRun  a corrected verdict is written NEXT TO the frozen firstRun, never over it; effectiveRuns() gives the corrected one
//          where it exists (for TRY SMALL to read).
// Run: node test/audit-engines.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAP, capG, tradeG, yardPush, yardMean } from '../yardstick.mjs';
import { ownAverage, surgeCutoff, quantile } from '../anomaly-core.mjs';
import { halfStat } from '../value-core.mjs';
import { freezeEach, effectiveRuns } from '../first-run.mjs';
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, a + ' vs ' + b);

test('AUD-1: asFrozen reproduces the old yardstick (big winners dropped, trades uncapped)', () => {
  const v = []; for (const g of [0.1, -0.2, 3.5, 4]) yardPush(v, g, 'asFrozen'); assert.deepEqual(v, [0.1, -0.2]);
  assert.equal(tradeG(4, 'asFrozen'), 4);
});

test('AUD-1: capBoth treats the strategy and the yardstick the same way (+300% cap, never dropped)', () => {
  assert.equal(CAP, 3); assert.equal(capG(4), 3); assert.equal(capG(-0.5), -0.5); assert.equal(capG(null), null);
  const v = []; for (const g of [0.1, -0.2, 3.5, 4]) yardPush(v, g, 'capBoth'); assert.deepEqual(v, [0.1, -0.2, 3, 3]);
  assert.equal(tradeG(4, 'capBoth'), 3); assert.equal(tradeG(0.4, 'capBoth'), 0.4);
  const r = []; for (const g of [0.1, 4]) yardPush(r, g, 'raw'); assert.deepEqual(r, [0.1, 4]); assert.equal(tradeG(4, 'raw'), 4);
  assert.equal(yardMean([1, 2], 3), null); near(yardMean([1, 2, 3], 3), 2);
});

test('AUD-1: one +400% stock in both the picks and the market: the old rule shows an edge that is not there', () => {
  // the market: 98 stocks at 0%, one at +400%, one at -50%; the rule bought the +400% one and the -50% one
  const market = [...Array(98).fill(0), 4, -0.5];
  const yard = (mode) => { const v = []; for (const g of market) yardPush(v, g, mode); return yardMean(v, 50); };
  const trades = (mode) => [4, -0.5].map((g, j) => ({ t: j, s: 'X' + j, g: tradeG(g, mode), c: yard(mode) }));
  const old = halfStat(trades('asFrozen'), 1), fixed = halfStat(trades('capBoth'), 1), raw = halfStat(trades('raw'), 1);
  // old: yardstick -0.5/99 (the +400% stock dropped), trades uncapped -> edge inflated by the dropped winner
  assert.ok(old.edge > raw.edge && old.edge > fixed.edge, JSON.stringify([old.edge, fixed.edge, raw.edge]));
  // fixed and raw: the yardstick contains the winner exactly as the trade does
  near(fixed.ctrl + 0.008, (98 * 0 + 3 - 0.5) / 100, 1e-4); near(raw.ctrl + 0.008, (4 - 0.5) / 100, 1e-4);
});

test('AUD-1: ownAverage keeps the old drop by default and caps both ways in capBoth mode', () => {
  const g = { 10: 0.1, 20: 4, 30: -0.1, 40: 0.2 }, args = { from: 10, to: 60, len: 5, step: 10, okAt: () => true, ret: (u) => g[u] ?? null };
  near(ownAverage(args), (0.1 - 0.1 + 0.2) / 3);
  near(ownAverage({ ...args, mode: 'capBoth' }), (0.1 + 3 - 0.1 + 0.2) / 4);
  near(ownAverage({ ...args, mode: 'raw' }), (0.1 + 4 - 0.1 + 0.2) / 4);
});

test('AUD-2: the SURGE cut-off counts only revenue surprises public by the entry session', () => {
  // [reaction session, surprise, filing session]; the trade being judged is bought at session 100
  const H = []; for (let j = 0; j < 40; j++) H.push([50 + j, j / 10, 60 + j]);   // filed at 60..99: all public by 100
  for (let j = 0; j < 20; j++) H.push([95, 100 + j, 101 + j]);                    // huge surprises filed AFTER the buy: must not count
  const cut = surgeCutoff(H, 100, 0.7), clean = quantile(H.slice(0, 40).map(z => z[1]), 0.7);
  near(cut, clean);
  assert.ok(quantile(H.map(z => z[1]), 0.7) > cut, 'the old cut-off used the later filings');
  assert.equal(surgeCutoff(H.slice(0, 10), 100, 0.7), null);   // under 30 known: no cut-off (as quantile)
});

test('correctedRun: written next to firstRun, frozen once, and effectiveRuns prefers it', () => {
  const firstRun = { A: { verdict: 'TRADABLE SMALL', results: { older: { edge: 0.01 } } }, B: { verdict: 'NOT PROVEN' } };
  const c1 = freezeEach(undefined, { A: { verdict: 'REJECTED', bugs: ['AUD-1'], results: { older: { edge: -0.01 } } } });
  const c2 = freezeEach(c1, { A: { verdict: 'PROVEN', bugs: ['AUD-1'] } });   // a later run cannot replace it
  assert.equal(c2.A.verdict, 'REJECTED'); assert.equal(firstRun.A.verdict, 'TRADABLE SMALL');
  const eff = effectiveRuns(firstRun, c2);
  assert.equal(eff.A.verdict, 'REJECTED'); assert.equal(eff.A.corrected, true); assert.equal(eff.B.verdict, 'NOT PROVEN'); assert.equal(eff.B.corrected, undefined);
  assert.deepEqual(effectiveRuns(firstRun, undefined), firstRun);
});
