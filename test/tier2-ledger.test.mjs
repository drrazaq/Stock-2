// Seams: swTier(result), v15Tier() and tier2Resolve(lastPx) in scan.mjs (TRADABLE SMALL, tier 2).
// Guards review S-11, S-12, S-13 (22 Oct):
//  S-11 the ledger's 'switch sell' rows said "after costs" but took none (a sale plus a buy-back is a round trip: 0.8%).
//  S-12 tier 2 never read its OWN ledger (data/tier2-ledger.jsonl) to switch itself off; V15 could not switch off before about Feb 2027.
//       Now 20+ resolved cases of a kind with a negative average after costs switch that kind off.
//  S-13 the stress-cost and without-2-best checks were missing where the study output has them: rebuy.json gives the stress cost
//       for the newer half (results.stress); quality.json gives F-SCORE UPTREND_126 stress (newer half) and noTop2 in both halves.
//       Neither output has a stress figure for the OLDER half, so that check cannot be made (not invented).
// Run: node test/tier2-ledger.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

// a switch rule as rebuy.json writes it: both halves t >= 2.5, positive, positive without the top 2, and the newer half at stress cost
const rule = (st = {}) => ({ verdict: 'BELOW THE LEAGUE BAR', trigger: 'STRETCH', results: { older: { t: 3.0, tBlock: 2.8, adv: 0.010, noTop2: 0.004 },
  newer: { t: 2.7, tBlock: 2.6, adv: 0.020, noTop2: 0.006 }, stress: { t: 2.6, tBlock: 2.5, adv: 0.012, noTop2: 0.004, ...st } } });
// LONGER HOLDS as quality.json writes it: the monthly yardstick (v15) plus the trade study row F-SCORE UPTREND_126
const quality = (o = {}, n = {}, st = {}) => ({ v15: { monthly: { '6m': { t: { older: 3.1, newer: 2.6, clearsLeagueBar: false }, older: { beatAvgStock: 20, months: 30 }, newer: { beatAvgStock: 18, months: 30 } } } },
  results: { 'F-SCORE UPTREND_126': { results: { older: { avg: 0.058, noTop2: 0.055, ...o }, newer: { avg: 0.097, noTop2: 0.090, ...n }, stress: { avg: 0.093, noTop2: 0.086, ...st } } } } });
const day = (k) => new Date(Date.now() - (40 + k) * 864e5).toISOString().slice(0, 10);
const ledger = (kind, k, pct) => Array.from({ length: k }, (_, i) => ({ d: day(i), sym: 'L' + i, kind, px: 10, px1: 10 * (1 + pct), pct, out: day(0) }));
const on = (files = {}) => loadScan({ files: { 'data/settings.json': { tier2: true }, ...files } });

test('control: the switch rule passes every check -> small', async () => {
  assert.equal((await on()).fn('swTier')(rule()), 'small');
});

test('switch: 20 resolved switch cases in its own ledger averaging -1% after costs switch it off', async () => {
  assert.equal((await on({ 'data/tier2-ledger.jsonl': ledger('switch sell', 20, -0.01) })).fn('swTier')(rule()), null);
});

test('switch: 19 resolved negative cases are not yet a verdict, and longer-hold rows do not count for it', async () => {
  const S = await on({ 'data/tier2-ledger.jsonl': [...ledger('switch sell', 19, -0.01), ...ledger('longer hold', 25, -0.05)] });
  assert.equal(S.fn('swTier')(rule()), 'small');
});

test('switch: loses at the stress cost (newer half) -> null', async () => {
  assert.equal((await on()).fn('swTier')(rule({ adv: -0.001 })), null);
});

test('switch: no stress figure in the study output -> null (not shown unverified)', async () => {
  const r = rule(); delete r.results.stress;
  assert.equal((await on()).fn('swTier')(r), null);
});

test('control: LONGER HOLDS passes every check -> small', async () => {
  assert.equal((await on({ 'data/quality.json': quality() })).fn('v15Tier')(), 'small');
});

test('LONGER HOLDS: 20 resolved longer-hold cases in its own ledger averaging -2% after costs switch it off', async () => {
  assert.equal((await on({ 'data/quality.json': quality(), 'data/tier2-ledger.jsonl': ledger('longer hold', 20, -0.02) })).fn('v15Tier')(), null);
});

test('LONGER HOLDS: loses at the stress cost -> null', async () => {
  assert.equal((await on({ 'data/quality.json': quality({}, {}, { avg: -0.001 }) })).fn('v15Tier')(), null);
});

test('LONGER HOLDS: no profit without its 2 best trades in the older half -> null', async () => {
  assert.equal((await on({ 'data/quality.json': quality({ noTop2: -0.002 }) })).fn('v15Tier')(), null);
});

test('LONGER HOLDS: the trade study row missing from quality.json -> null (not shown unverified)', async () => {
  const q = quality(); delete q.results;
  assert.equal((await on({ 'data/quality.json': q })).fn('v15Tier')(), null);
});

test('the ledger takes the round-trip cost from a switch case too: sold at 100, back at 90 -> +11.1% - 0.8% = +10.31%', async () => {
  const d = new Date(Date.now() - 31 * 864e5).toISOString().slice(0, 10);
  const S = await on({ 'data/tier2-ledger.jsonl': [{ d, sym: 'SW', kind: 'switch sell', px: 100 }, { d, sym: 'LH', kind: 'longer hold', px: 100 }] });
  const L = S.fn('tier2Resolve')({ SW: 90, LH: 110 });
  assert.equal(L.find(r => r.sym === 'SW').pct, 0.1031);
  assert.equal(L.find(r => r.sym === 'LH').pct, 0.092);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
