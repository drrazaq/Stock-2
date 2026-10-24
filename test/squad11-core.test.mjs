// Seams: squad11-core.mjs (SQUAD 11, 24 Oct 2026: buy the dip only in proven leaders). Month ends and the leader month of a session, the
// 12-1 month return and the top-20% leader pick, the six dip setups (first 8% / 12% pullback under the 50-day high above the 200-day, 50-day
// touch from above, third down day, market-wide flush, first close under the 20-day after a 3-month run), the fixed hold (next open ->
// close of the hold session; a stock that stops trading = its last close; data end = open), per-year return of capital, the timing
// comparison, per-year table and the idempotent library pre-registration. Pure functions. Run: node --test test/squad11-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, DIP_IDS, monthEnds, leaderMonthOf, mom121, leaderPick, highClose, pullbackFirst, ma50Touch, down3, flush, first20, dipSignals, holdTrade, perYearOf, timing, byYear, preRegister, smaArr, halfOf } from '../squad11-core.mjs';
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const F = (a) => Float64Array.from(a);

test('7 rules: 6 dip rules with holds fixed at 21 / 63 / 126 and one month-start control', () => {
  assert.equal(IDS.length, 7); assert.equal(DIP_IDS.length, 6); assert.ok(RULES['SQ11-MS63'].control);
  for (const id of IDS) { assert.ok([21, 63, 126].includes(RULES[id].hold), id); assert.ok(RULES[id].block === Math.min(RULES[id].hold, 63), id); assert.ok(RULES[id].rule.length > 50); }
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('month ends need the next session in a later month; leader month = the latest month end strictly before t', () => {
  const D = ['2024-01-30', '2024-01-31', '2024-02-01', '2024-02-29', '2024-03-01', '2024-03-04'];
  assert.deepEqual(monthEnds(D), [1, 3]);   // the last session (March) is not known to be a month end
  const ME = monthEnds(D); assert.equal(leaderMonthOf(ME, 0), -1); assert.equal(leaderMonthOf(ME, 1), -1); assert.equal(leaderMonthOf(ME, 2), 1); assert.equal(leaderMonthOf(ME, 3), 1); assert.equal(leaderMonthOf(ME, 4), 3); assert.equal(leaderMonthOf(ME, 5), 3);
});

test('12-1 month return skips the last 21 sessions; leaders = top 20% (ceil) of those with a return, ties by key', () => {
  const c = new Array(300).fill(10); c[300 - 1 - 252] = 10; c[300 - 1 - 21] = 15; c[299] = 1;   // the last month's crash is ignored
  assert.ok(near(mom121(c, 299), 0.5)); assert.equal(mom121(c, 251), null);
  const rows = Array.from({ length: 11 }, (_, k) => ({ key: k, m: k === 10 ? null : k / 10 }));
  assert.deepEqual(leaderPick(rows), [9, 8]);   // 10 with a return -> ceil(2) ; the one without is left out
  assert.deepEqual(leaderPick([{ key: 3, m: 1 }, { key: 1, m: 1 }, { key: 2, m: 0 }, { key: 4, m: 0 }, { key: 5, m: 0 }, { key: 6, m: 0 }]), [1, 3]);
});

test('pullback: the FIRST close 8% (12%) under the 50-session closing high, above the 200-day', () => {
  const c = [...new Array(60).fill(100), 95, 91.9, 91, 87.9]; const s200 = F(c.map(() => 50)), n = c.length;
  assert.equal(highClose(c, 61, 50), 100);
  assert.equal(pullbackFirst(c, s200, 60, 0.08), false); assert.equal(pullbackFirst(c, s200, 61, 0.08), true);   // 91.9 <= 92: first
  assert.equal(pullbackFirst(c, s200, 62, 0.08), false);   // the second close under: not first
  assert.equal(pullbackFirst(c, s200, 63, 0.12), true);    // 87.9 <= 88
  assert.equal(pullbackFirst(c, F(c.map(() => 95)), 61, 0.08), false);   // under its 200-day: no
  assert.equal(pullbackFirst([...new Array(60).fill(100), 92], s200, 60, 0.08), true);   // exactly 8% counts
  assert.ok(n);
});

test('50-day touch from above: low at or under the 50-day after 10 closes above it', () => {
  const c = F(new Array(20).fill(110)), l = F(new Array(20).fill(108)), s50 = F(new Array(20).fill(100));
  l[15] = 99.5; assert.equal(ma50Touch(c, l, s50, 15), true); l[15] = 100; assert.equal(ma50Touch(c, l, s50, 15), true); l[15] = 100.1; assert.equal(ma50Touch(c, l, s50, 15), false);
  l[15] = 99; c[9] = 99; assert.equal(ma50Touch(c, l, s50, 15), false);   // a close under the 50-day in t-10..t-1: not from above
  c[9] = 110; c[4] = 99; assert.equal(ma50Touch(c, l, s50, 15), true);    // t-11 is outside the 10-close window
});

test('third down close in a row only (not the 4th)', () => {
  assert.equal(down3([10, 11, 10, 9, 8], 4), true); assert.equal(down3([12, 11, 10, 9, 8], 4), false); assert.equal(down3([10, 11, 10, 9, 9], 4), false); assert.equal(down3([10, 10, 10, 9, 8], 4), false);
  assert.equal(down3([10, 10, 9.5, 9, 8], 4), true);   // t-3 equal to t-4: not a down close, so t is the third
});

test('flush: leader -5% on a day SPY -2% (both close to close)', () => {
  assert.equal(flush([100, 95], [100, 98], 1), true); assert.equal(flush([100, 95.1], [100, 98], 1), false); assert.equal(flush([100, 90], [100, 98.1], 1), false); assert.equal(flush([100, 90], [NaN, 98], 1), false);
});

test('first close under the 20-day after a 20%+ 3-month run', () => {
  const c = []; for (let k = 0; k < 90; k++) c.push(100 * Math.pow(1.004, k)); const t = 89; c[t] = c[t - 1] * 0.9; const s20 = smaArr(F(c), 20);
  assert.ok(c[t - 1] / c[t - 64] - 1 >= 0.2); assert.equal(first20(c, s20, t), true);
  const flat = c.map((x, k) => k < 89 ? 100 + (k % 2) : 95), sf = smaArr(F(flat), 20); assert.equal(first20(flat, sf, 89), false);   // no run
  const c2 = [...c]; c2[80] = c2[79] * 0.8; const s2 = smaArr(F(c2), 20); assert.equal(first20(c2, s2, t), false);   // a close under the 20-day in the last 20
});

test('dipSignals lists every rule that fires', () => {
  const c = F([...Array.from({ length: 60 }, (_, k) => 100 + k * 0.01), 91]), A = { c, l: F([...c]), s20: smaArr(c, 20), s50: smaArr(c, 50), s200: F(c.map(() => 50)) }, spy = F([...new Array(60).fill(100), 97]);
  const s = dipSignals(A, spy, 60); assert.ok(s.includes('SQ11-PB8') && !s.includes('SQ11-PB12') && s.includes('SQ11-FLUSH') && s.includes('SQ11-MA50'));
});

test('fixed hold: next open -> close of the hold session; gone = last close; data end = open; no open bar = not bought', () => {
  const o = F([10, 11, 12, 13, 14, 15, 16, 17, 18, 19]), c = F([10, 11.5, 12.5, 13.5, 14.5, 15.5, 16.5, 17.5, 18.5, 19.5]), S = { o, c }, T = 10;
  const r = holdTrade(S, 1, 9, T, 3); assert.deepEqual([r.k, r.x, r.px0, r.px1, r.kind, r.days], [2, 4, 12, 14.5, 'max', 3]); assert.ok(near(r.g, 14.5 / 12 - 1));
  assert.ok(holdTrade(S, 6, 9, T, 5).open); assert.ok(holdTrade(S, 9, 9, T, 5).pending);
  const g = holdTrade(S, 0, 3, 20, 5); assert.equal(g.kind, 'gone'); assert.equal(g.x, 3); assert.equal(g.px1, 13.5);   // stopped trading at 3 (16 sessions before the end)
  const o2 = F([...o]); o2[2] = NaN; assert.equal(holdTrade({ o: o2, c }, 1, 9, T, 3), null);
  const c3 = F([...c]); c3[4] = NaN; assert.equal(holdTrade({ o, c: c3 }, 1, 9, T, 3).px1, 13.5);   // a missing exit close: the last close before it
});

test('per year of capital, timing comparison and per-year table', () => {
  const rows = [{ g: 0.108, spy: 0.05, c: 0.02, twin: 0.05, days: 126, sig: '2023-03-01' }, { g: 0.008, spy: 0.01, c: 0.0, twin: 0.1, days: 126, sig: '2024-05-01' }];
  assert.ok(near(perYearOf(rows, 'g', 0.008), 0.1));   // (0.1 + 0) / 1 year
  assert.ok(near(perYearOf(rows, 'spy', 0), 0.06));
  const tm = timing(rows); assert.equal(tm.n, 2); assert.ok(near(tm.dipMinusFixed, (0.058 - 0.092) / 2, 1e-4)); assert.equal(tm.dipBetterShare, 0.5);
  const by = byYear(rows); assert.deepEqual(Object.keys(by), ['2023', '2024']); assert.equal(by['2023'].beatsSpy, true); assert.equal(by['2024'].beatsSpy, false);
});

test('pre-registration is idempotent and carries the rule text', () => {
  const LB = { strategies: [{ id: 'X' }] }; assert.equal(preRegister(LB), 7); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, 8);
  const e = LB.strategies.find(x => x.id === 'SQ11-PB12'); assert.ok(/12%/.test(e.explain) && /300 largest/.test(e.explain) && e.hold === 126 && /pre-registered/.test(e.status));
});
