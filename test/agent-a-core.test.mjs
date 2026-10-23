// Agent A (23 Oct 2026) pure rules: agent-a-core.mjs. Seams: runRotation (monthly hold-and-switch engine with costs), the
// pre-registered pickers rot1Pick / rot2Pick, monthlyStats, rotationVerdict, switchCase (A-SWR1) and switchVerdict.
// Expected values are worked by hand in the comments, not recomputed the way the code does.
// Run: node test/agent-a-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { runRotation } from '../agent-a-core.mjs';

// sessions: last session of Jan = 2021-01-29, of Feb = 2021-02-26, of Mar = 2021-03-31; trading starts at the next open
const D = ['2021-01-28', '2021-01-29', '2021-02-01', '2021-02-26', '2021-03-01', '2021-03-31', '2021-04-01'];
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, a + ' != ' + b);

test('runRotation: holds from the open after a month end to the open after the next month end, cost 0.4% per side traded', () => {
  // A opens 100 on 1 Feb, 110 on 1 Mar, 99 on 1 Apr. Month 1 (Feb): all in A from cash: +10% gross, cost 0.4% (one side).
  // Month 2 (Mar): still all in A: -10% gross, no trade, no cost.
  const open = { A: [NaN, NaN, 100, NaN, 110, NaN, 99] }, close = { A: [100, 100, 100, 100, 110, 100, 99] };
  const R = runRotation({ D, open, close, side: 0.004, pick: () => ({ A: 1 }) });
  assert.equal(R.months.length, 2);
  assert.equal(R.months[0].from, '2021-02-01'); assert.equal(R.months[0].to, '2021-03-01');
  near(R.months[0].gross, 0.10); near(R.months[0].cost, 0.004); near(R.months[0].net, 0.096);
  near(R.months[1].gross, -0.10); near(R.months[1].cost, 0); near(R.months[1].net, -0.10);
});

test('runRotation: a full switch from one fund to another costs a round trip (0.8%); cash earns 0', () => {
  // Month 1 all in A (+10%), month 2 all in B: sell A, buy B = |0-1| + |1-0| = 2 sides = 0.8%. B opens 50 -> 55 in March: +10%.
  // A third month would need a fourth month end, so 2 months only. Cash month: weights {} -> 0 gross; selling B costs 0.4%.
  const open = { A: [NaN, NaN, 100, NaN, 110, NaN, 99], B: [NaN, NaN, 50, NaN, 50, NaN, 55] }, close = { A: [1, 1, 1, 1, 1, 1, 1], B: [1, 1, 1, 1, 1, 1, 1] };
  const R = runRotation({ D, open, close, side: 0.004, pick: (k) => k === 0 ? { A: 1 } : { B: 1 } });
  near(R.months[1].gross, 0.10); near(R.months[1].cost, 0.008);
  const R2 = runRotation({ D, open, close, side: 0.004, pick: (k) => k === 0 ? { B: 1 } : {} });
  near(R2.months[0].gross, 0); near(R2.months[1].gross, 0); near(R2.months[1].cost, 0.004);
});

import { rot1Pick, rot2Pick } from '../agent-a-core.mjs';
// month-end grid: E[k] = k (every session is a month end for the picker; it only reads close[E[...]] and open[E[k]+1])
const E = Array.from({ length: 14 }, (_, k) => k);
const flat = (v) => Array(15).fill(v);

test('rot1Pick 6m: the 3 funds with the best return from 6 month ends ago, equal weights; fewer than 4 eligible funds -> null', () => {
  // at k=6: A 100->130 (+30%), B 100->120, C 100->90, D 100->125, E has no price 6 month ends ago (not eligible)
  const close = { A: flat(100), B: flat(100), C: flat(100), D: flat(100), E: flat(NaN) }; close.A[6] = 130; close.B[6] = 120; close.C[6] = 90; close.D[6] = 125; close.E[6] = 500;
  const open = Object.fromEntries(Object.keys(close).map(s => [s, flat(10)]));
  assert.deepEqual(rot1Pick({ k: 6, E, close, open, look: '6m' }), { A: 1 / 3, D: 1 / 3, B: 1 / 3 });
  const three = { A: close.A, B: close.B, C: close.C };
  assert.equal(rot1Pick({ k: 6, E, close: three, open, look: '6m' }), null);
  assert.equal(rot1Pick({ k: 5, E, close, open, look: '6m' }), null);   // not 6 month ends of history yet
});

test('rot1Pick 12-1: return from 12 month ends ago to 1 month end ago (the last month is skipped)', () => {
  // at k=12: scores use close[11]/close[0]. A: 100->110, B: 100->150 but B's last month (close[12]) crashes: still ranked on [11]
  const close = { A: flat(100), B: flat(100), C: flat(100), D: flat(100) }; close.A[11] = 110; close.B[11] = 150; close.B[12] = 50; close.C[11] = 105; close.D[11] = 95;
  const open = Object.fromEntries(Object.keys(close).map(s => [s, flat(10)]));
  assert.deepEqual(rot1Pick({ k: 12, E, close, open, look: '12-1' }), { B: 1 / 3, A: 1 / 3, C: 1 / 3 });
});

test('rot2Pick: the fund above its 10-month average -> fund; else gold above its own 10-month average -> gold; else cash', () => {
  // fund: 9 month ends at 100 then 120 at k=9: average 102 < 120 -> fund
  const f = flat(100); f[9] = 120; const g = flat(100); const open = { F: flat(10), G: flat(10) };
  assert.deepEqual(rot2Pick({ k: 9, E, close: { F: f, G: g }, open, fund: 'F', gold: 'G' }), { F: 1 });
  const f2 = flat(100); f2[9] = 80; const g2 = flat(100); g2[9] = 110;   // fund under (98), gold above (101)
  assert.deepEqual(rot2Pick({ k: 9, E, close: { F: f2, G: g2 }, open, fund: 'F', gold: 'G' }), { G: 1 });
  const g3 = flat(100); g3[9] = 90;                                       // both under: cash
  assert.deepEqual(rot2Pick({ k: 9, E, close: { F: f2, G: g3 }, open, fund: 'F', gold: 'G' }), {});
  assert.equal(rot2Pick({ k: 8, E, close: { F: f, G: g }, open, fund: 'F', gold: 'G' }), null);   // under 10 month ends of history
});

import { monthlyStats, judgeMonthly } from '../agent-a-core.mjs';
test('monthlyStats: CAGR, worst drawdown and monthly win rate of a monthly return series', () => {
  // +10%, -50%, +100%: equity 1.1, 0.55, 1.1 -> CAGR 1.1^(12/3)-1 = 0.4641, worst drawdown 0.55/1.1-1 = -50%, 2 of 3 months up
  const s = monthlyStats([0.1, -0.5, 1.0]);
  near(s.cagr, 0.4641, 1e-4); near(s.maxDD, -0.5, 1e-12); near(s.win, 2 / 3, 1e-12); assert.equal(s.n, 3);
});

// 40 months; the rule beats every yardstick by +4% / -1% alternately (mean +1.5%, sample sd 2.565%, t = 1.5/(2.565/sqrt 20) = 2.62)
const rows = (hi, lo, o = {}) => Array.from({ length: 40 }, (_, i) => { const x = i % 2 ? lo : hi; return { net: 0.01 + x, netStress: 0.008 + x, yard: { SPUS: 0.01, 'S&P 500': 0.01 }, own: 0.01, ...o }; });
test('judgeMonthly: both halves beat every yardstick, t 2.62 per half -> TRADABLE SMALL under a 4.0 bar', () => {
  const J = judgeMonthly(rows(0.04, -0.01), 4.0);
  assert.equal(J.verdict, 'TRADABLE SMALL'); assert.equal(J.results.older.n, 20); near(J.results.older.vs.SPUS.t, 2.62, 0.01);
});
test('judgeMonthly: +3% / -1% (t 2.18) -> NOT PROVEN, and the reason names the t', () => {
  const J = judgeMonthly(rows(0.03, -0.01), 4.0); assert.equal(J.verdict, 'NOT PROVEN'); assert.match(J.why, /t 2\.18/);
});
test('judgeMonthly: loses to the same funds held equally (vsOwn) -> not tier 2', () => {
  const J = judgeMonthly(rows(0.04, -0.01, { own: 0.05 }), 4.0); assert.equal(J.verdict, 'NOT PROVEN'); assert.match(J.why, /same funds/);
});
test('judgeMonthly: fewer than 20 months in a half -> TOO FEW MONTHS', () => {
  assert.equal(judgeMonthly(rows(0.04, -0.01).slice(0, 30), 4.0).verdict, 'TOO FEW MONTHS');
});

import { switchCase } from '../agent-a-core.mjs';
test('switchCase: sold at the next open, bought back 10% lower; the gain is counted in USD of the money at the trigger', () => {
  // trigger t=0; sell at the open of t=1 (100); t=3 trades down to 89 -> filled at the limit 90; close on day 60 = 95.
  // switcher: 0.996^2 * 100/90 = 1.10224 shares-equivalent -> +10.224% on the ratio; in USD of the 100 sold: 0.10224 * 95/100 = +9.713%
  const n = 70, o = Array(n).fill(100), c = Array(n).fill(100), lo = Array(n).fill(99); lo[3] = 89; c[60] = 95;
  const r = switchCase({ o, c, lo, t: 0, H: 60, side: 0.004 });
  assert.equal(r.back, true); assert.equal(r.days, 3); near(r.ratioAdv, 0.10224, 1e-5); near(r.usdAdv, 0.09713, 1e-5);
});
test('switchCase: never came back 10% lower -> bought back at the day-60 close (the live rule), counted at its opportunity cost', () => {
  // no fill; day-60 close 130: switcher ends with 0.996^2*100 = 99.20 USD of stock vs the holder's 130 -> -30.80% of the 100 sold
  const n = 70, o = Array(n).fill(100), c = Array(n).fill(100), lo = Array(n).fill(95); c[60] = 130;
  const r = switchCase({ o, c, lo, t: 0, H: 60, side: 0.004 });
  assert.equal(r.back, false); near(r.usdAdv, -0.30798, 1e-5); near(r.ratioAdv, -0.23691, 1e-5);
  // the same case if the owner never buys back at all (cash, one side of cost): 0.996 - 1.30 = -30.40%
  near(switchCase({ o, c, lo, t: 0, H: 60, side: 0.004, never: true }).usdAdv, -0.304, 1e-9);
});

import { switchVerdict } from '../agent-a-core.mjs';
// 100 switches, one per 20-session block (t = 20 i); +5% / -1% alternately in USD vs holding (mean +2%); stress 0.4 points lower.
// block t at 0.8%: 0.02 / (0.030305 / sqrt 50) = 4.67; at 1.2%: 0.016 / (0.030305 / sqrt 50) = 3.73 -> under a 4.0 bar: TRADABLE SMALL
const sw = (o = {}) => Array.from({ length: 100 }, (_, i) => { const u = i % 2 ? -0.01 : 0.05; return { t: 20 * i, s: 'S' + i, usd: u, usdS: u - 0.004, own: 0, back: i % 2 === 0, ...o }; });
test('switchVerdict: ahead of holding in both halves at both costs, block t 3.73 at worst -> TRADABLE SMALL under a 4.0 bar', () => {
  const V = switchVerdict(sw(), 1000, 4.0);
  assert.equal(V.verdict, 'TRADABLE SMALL'); near(V.results.older.tBlock, 4.67, 0.01); near(V.results.older.tBlockStress, 3.73, 0.01);
  near(V.results.newer.cameBack, 0.5, 1e-9); near(V.results.newer.avgNotBack, -0.01, 1e-9);
});
test('switchVerdict: the same stocks switched on other days do better (the trigger adds nothing) -> NOT PROVEN', () => {
  const V = switchVerdict(sw({ own: 0.03 }), 1000, 4.0); assert.equal(V.verdict, 'NOT PROVEN'); assert.match(V.why, /other days/);
});
test('switchVerdict: behind holding in both halves -> HOLDING WINS', () => {
  const V = switchVerdict(sw().map(x => ({ ...x, usd: -Math.abs(x.usd), usdS: -Math.abs(x.usd) - 0.004 })), 1000, 4.0); assert.equal(V.verdict, 'HOLDING WINS');
});

import { nasdaqReport } from '../agent-a-core.mjs';
test('nasdaqReport: one Nasdaq calendar row -> an E1 report { d, t, a, e } (negative EPS in brackets; no actual -> null)', () => {
  assert.deepEqual(nasdaqReport({ symbol: 'AAPL', eps: '$1.30', epsForecast: '$1', time: 'time-after-hours' }, '2021-07-27'), { sym: 'AAPL', d: '2021-07-27', t: 'amc', a: 1.3, e: 1 });
  assert.deepEqual(nasdaqReport({ symbol: 'XYZ', eps: '($0.12)', epsForecast: '($0.20)', time: 'time-pre-market' }, '2022-02-01'), { sym: 'XYZ', d: '2022-02-01', t: 'bmo', a: -0.12, e: -0.2 });
  assert.equal(nasdaqReport({ symbol: 'Q', eps: '', epsForecast: '$1', time: 'time-not-supplied' }, '2022-02-01'), null);
  assert.equal(nasdaqReport({ symbol: 'BRK/B', eps: '$1', epsForecast: '$1', time: 'time-not-supplied' }, '2022-02-01'), null);
  assert.equal(nasdaqReport({ symbol: 'Z', eps: '$1,234.50', epsForecast: '$1,000', time: 'time-not-supplied' }, '2022-02-01').a, 1234.5);
});
