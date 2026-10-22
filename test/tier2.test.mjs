// Seams: swTier(result) (rebuy switch rules) and v15Tier() (LONGER HOLDS, quality.json v15) in scan.mjs: TRADABLE SMALL (tier 2).
// The owner's rule (22 Oct): a rule below the 4.0 league bar may be traded small only if it passed its own test in BOTH halves with
// t >= 2.5, beat its yardstick in both, still makes money without its 2 best trades, the tier2 switch is on, and its own live
// record has not turned negative. Any of these missing must give null (no TRADABLE SMALL line).
// Run: node test/tier2.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

// a switch rule (sell when stretched, buy back 10% lower) that passed in both halves but is below the league bar
const rule = (o = {}, n = {}) => ({ verdict: 'BELOW THE LEAGUE BAR', trigger: 'STRETCH',
  results: { older: { t: 3.0, tBlock: 2.8, adv: 0.010, noTop2: 0.004, ...o }, newer: { t: 2.7, tBlock: 2.6, adv: 0.020, noTop2: 0.006, ...n },
    stress: { t: 2.6, tBlock: 2.5, adv: 0.012, noTop2: 0.004 } } });   // stress (newer half at the stress cost): checked since 22 Oct (review S-13), as rebuy.json writes it
const done = (k, adv, trig = 'STRETCH') => Array.from({ length: k }, (_, i) => ({ sym: 'S' + i, trig, adv }));
// LONGER HOLDS (v15): t 3.1 / 2.6 by month, beat the average stock in 20 of 30 and 18 of 30 months
// plus the trade study row of the same rule (stress cost and without its 2 best: checked since 22 Oct, review S-13), as quality.json writes it
const quality = (t = {}) => ({ v15: { monthly: { '6m': { t: { older: 3.1, newer: 2.6, clearsLeagueBar: false, ...t }, older: { beatAvgStock: 20, months: 30 }, newer: { beatAvgStock: 18, months: 30 } } } },
  results: { 'F-SCORE UPTREND_126': { results: { older: { avg: 0.058, noTop2: 0.055 }, newer: { avg: 0.097, noTop2: 0.090 }, stress: { avg: 0.093, noTop2: 0.086 } } } } });

test('switch rule: passes both halves at t >= 2.5, positive, positive without the top 2 -> small', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { tier2: true } } });
  assert.equal(S.fn('swTier')(rule()), 'small');
});

test('switch rule: tier2 switched off -> null (the system is proven-only exactly as before)', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { tier2: false } } });
  assert.equal(S.fn('swTier')(rule()), null);
});

test('switch rule: one t below 2.5 -> null', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { tier2: true } } });
  assert.equal(S.fn('swTier')(rule({}, { tBlock: 2.4 })), null);
});

test('switch rule: no profit without the 2 best trades in one half -> null', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { tier2: true } } });
  assert.equal(S.fn('swTier')(rule({ noTop2: -0.001 })), null);
});

test('switch rule: live record of 20 finished cases averaging negative switches it off', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { tier2: true }, 'data/switch-paper.json': { open: [], done: done(20, -0.01) } } });
  assert.equal(S.fn('swTier')(rule()), null);
});

test('switch rule: 19 negative cases are not yet a verdict, and other triggers do not count', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { tier2: true }, 'data/switch-paper.json': { open: [], done: [...done(19, -0.01), ...done(5, -0.05, 'SPIKE')] } } });
  assert.equal(S.fn('swTier')(rule()), 'small');
});

test('LONGER HOLDS: passes both halves at t >= 2.5 and beat the average stock in most months -> small', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { tier2: true }, 'data/quality.json': quality() } });
  assert.equal(S.fn('v15Tier')(), 'small');
});

test('LONGER HOLDS: tier2 switched off -> null', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { tier2: false }, 'data/quality.json': quality() } });
  assert.equal(S.fn('v15Tier')(), null);
});

test('LONGER HOLDS: newer-half t 2.4 -> null', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { tier2: true }, 'data/quality.json': quality({ newer: 2.4 }) } });
  assert.equal(S.fn('v15Tier')(), null);
});

test('LONGER HOLDS: a negative live league record (3+ months scored, behind the S&P 500) switches it off', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { tier2: true }, 'data/quality.json': quality(), 'data/agent-league.json': { rows: [{ id: 'B', scored3m: 3, vsSpy3m: -0.02 }] } } });
  assert.equal(S.fn('v15Tier')(), null);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
