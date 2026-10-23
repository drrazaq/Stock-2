// Seams: angles-core.mjs (angles lab, 24 Oct 2026). The pre-registered rules of the untested angles: Russell rank-day predictions,
// the no-news filter, the earnings gap that holds, quality at the 52-week low, the IPO first base and stop, the dividend-raise streak
// (split-safe), interest-bearing debt, FOMC eves, first splits, calendars and the library pre-registration. Pure functions, no network.
// Run: node test/angles-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANGLES, IDS, INFO, SKIPPED, RUSSELL, FOMC, rankByValue, russellAdds, russellDowns, has8k, gapUp, holdsAbove, lowTurn, lowTurnSeries, fscoreOf, knownYear, spacLike, ipoBase,
  stopExit, divStreak, debtAt, fomcTrades, firstSplits, weekEnds, monthEnds, pickBottom, onOrAfter, onOrBefore, preRegister, halfOf, sma } from '../angles-core.mjs';

test('every angle is fully pre-registered: rule, hold, a source with a link, a library check', () => {
  assert.equal(IDS.length, 12);
  for (const id of IDS) { const a = ANGLES[id]; assert.match(id, /^ANG-/); assert.ok(a.rule.length > 60, id); assert.ok(a.hold >= 1, id); assert.ok(a.papers.length && a.papers.every(p => /^https:\/\//.test(p.url)), id); assert.ok(a.lib, id); }
  assert.ok(INFO['ANG-DIP5'] && Object.keys(SKIPPED).length >= 4);
});

test('library pre-registration adds each entry once and never touches others', () => {
  const LB = { strategies: [{ id: 'V15', status: 'tradable small (tier 2)' }] };
  assert.equal(preRegister(LB), IDS.length + 1);
  assert.equal(preRegister(LB), 0);
  assert.equal(LB.strategies[0].status, 'tradable small (tier 2)');
  const e = LB.strategies.find(x => x.id === 'ANG-LCREV-W'); assert.match(e.status, /^pre-registered 2026-10-24/); assert.match(e.note, /BEFORE any run/);
});

test('Russell calendar: published dates, rank day before recon, semi-annual December 2026 marked as estimated', () => {
  for (const r of RUSSELL) assert.ok(r.rank < r.recon && r.small > 0 && r.bp > r.small);
  assert.equal(RUSSELL.find(r => r.y === 2024).rank, '2024-04-30');
  assert.equal(RUSSELL.find(r => r.y === 2022).recon, '2022-06-24');
  assert.ok(RUSSELL[RUSSELL.length - 1].estimated);
});

test('rank by value: largest first, cumulative share of the total', () => {
  const R = rankByValue([{ key: 'a', mv: 10 }, { key: 'b', mv: 30 }, { key: 'c', mv: 60 }, { key: 'd', mv: 0 }]);
  assert.deepEqual(R.map(r => r.key), ['c', 'b', 'a']); assert.equal(R[0].rank, 1); assert.equal(R[2].cum, 1); assert.ok(Math.abs(R[1].cum - 0.9) < 1e-12);
});

test('Russell additions from below: now inside the 2000 range, last rank day under the smallest member', () => {
  const yr = { small: 150e6, bp: 4e9 }, yr0 = { small: 200e6, bp: 4e9 };
  const now = new Map([['UP', 300e6], ['WAS', 300e6], ['BIG', 5e9], ['TINY', 100e6], ['NEW', 300e6]]), prev = new Map([['UP', 120e6], ['WAS', 250e6], ['BIG', 100e6], ['TINY', 50e6]]);
  assert.deepEqual(russellAdds(now, prev, yr, yr0), ['UP']);   // WAS was already a member, BIG goes to the 1000, TINY is too small, NEW did not trade then
});

test('Russell 1000 -> 2000 migrants: only past the 2.5% band, and only former 1000 members', () => {
  // 100 companies worth 1000, 990, ..., 10 (total 50,500); breakpoint 505 -> the last member above it is #50 (cum 0.7475); band edge 0.7725
  // #51 (cum 0.7574) and #52 (0.7671) stay in the 1000 by banding; #53 (0.7766) and #54 are past the band
  const now = new Map(), prev = new Map(); for (let j = 0; j < 100; j++) { now.set('S' + j, 1000 - j * 10); prev.set('S' + j, j >= 50 && j <= 53 ? 600 : 1000 - j * 10); }
  prev.set('S60', 100);
  assert.deepEqual(russellDowns(now, prev, { small: 5, bp: 505 }, { small: 5, bp: 505 }).sort(), ['S52', 'S53']);
  assert.deepEqual(russellDowns(now, prev, { small: 495, bp: 505 }, { small: 5, bp: 505 }), []);   // under the smallest 2000 member: not a migrant
});

test('news filter: an 8-K with item 2.02 or 8.01 inside the window blocks; other items or other days do not', () => {
  const L = [{ d: '2024-03-04', items: '5.02,9.01' }, { d: '2024-03-08', items: '2.02,9.01' }, { d: '2024-02-01', items: '8.01' }];
  assert.equal(has8k(L, '2024-03-04', '2024-03-07'), false); assert.equal(has8k(L, '2024-03-04', '2024-03-08'), true); assert.equal(has8k(L, '2024-01-31', '2024-02-02'), true); assert.equal(has8k([], 'a', 'z'), false);
});

test('earnings gap: 4%+ open gap on 2x volume; holds when each of the next 3 lows stays above the gap-day low', () => {
  const n = 60, o = Array(n).fill(100), c = Array(n).fill(100), v = Array(n).fill(1000); o[55] = 104; v[55] = 2000;
  assert.ok(gapUp(o, c, v, 55)); o[55] = 103.9; assert.equal(gapUp(o, c, v, 55), null); o[55] = 104; v[55] = 1999; assert.equal(gapUp(o, c, v, 55), null);
  const lows = Array(n).fill(99); lows[55] = 102; lows[56] = 103; lows[57] = 102.5; lows[58] = 104; assert.equal(holdsAbove(lows, 55), true);
  lows[57] = 102; assert.equal(holdsAbove(lows, 55), false); lows[57] = NaN; assert.equal(holdsAbove(lows, 55), null);
});

test('quality at the low: the first close above the 20-day after touching within 5% of the 1-year low', () => {
  const c = []; for (let k = 0; k < 300; k++) c.push(100 - k * 0.1); // steady decline to 70.1: every day is the low
  for (let k = 300; k < 320; k++) c.push(70); c[319] = 75; // flat at the low, then a jump above the 20-day
  assert.equal(lowTurn(c, 319), true); assert.equal(lowTurn(c, 318), false);
  const d = c.slice(); d[318] = 76; assert.equal(lowTurn(d, 319), false);   // the day before was already above its average: not the first close above
  const up = []; for (let k = 0; k < 320; k++) up.push(50 + k * 0.2); up[319] = up[318] + 5; assert.equal(lowTurn(up, 319), false);   // nowhere near the low
});

test('the fast series version agrees with the reference rule on a random walk with gaps', () => {
  let x = 100, seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, c = [];
  for (let k = 0; k < 1200; k++) { x *= 1 + (rnd() - 0.5) * 0.06; c.push(rnd() < 0.03 ? NaN : x); }
  const S = lowTurnSeries(c); let hits = 0; for (let t = 0; t < c.length; t++) { const a = lowTurn(c, t) ? 1 : 0; assert.equal(S[t], a, 'session ' + t); hits += a; }
  assert.ok(hits > 0);
});

test('F-score: the quality.mjs checks; a 10-K counts from 10 April', () => {
  const y = { ni: 10, cfo: 15, ltd: 10, acur: 50, lcur: 25, gp: 40, rev: 100, assets: 200 }, b = { ni: 5, cfo: 6, ltd: 20, acur: 40, lcur: 25, gp: 30, rev: 90, assets: 200 }, z = { assets: 200 };
  assert.equal(fscoreOf({ 2022: y, 2021: b, 2020: z }, 2022, 100, 100), 9); assert.equal(fscoreOf({ 2022: y, 2021: b, 2020: z }, 2022, 110, 100), 8); assert.equal(fscoreOf({ 2022: y }, 2022, 1, 1), null);
  assert.equal(knownYear('2024-04-09'), 2022); assert.equal(knownYear('2024-04-10'), 2023);
});

test('IPO first base: 15+ sessions since the base high, 8-40% deep, close within 5% over it on 1.5x volume, 3-24 months old', () => {
  const c = [], v = []; for (let k = 0; k < 200; k++) { c.push(10); v.push(1000); }
  for (let k = 0; k < 100; k++) c[k] = 10 + k * 0.1;       // run-up to 19.9 at k = 99 (the base high)
  for (let k = 100; k < 130; k++) c[k] = 16.5;               // 17% under the high for 30 sessions
  c[130] = 20.3; v[130] = 2000;                              // breakout 2% over the high on 2x volume
  const r = ipoBase(c, v, 0, 130); assert.ok(r); assert.ok(Math.abs(r.depth - (1 - 16.5 / 19.9)) < 1e-9); assert.equal(r.len, 31);
  c[130] = 21.5; assert.equal(ipoBase(c, v, 0, 130), null);  // 8% over the high: extended, out of the buy zone
  c[130] = 20.3; v[130] = 1400; assert.equal(ipoBase(c, v, 0, 130), null);
  v[130] = 2000; assert.equal(ipoBase(c, v, 80, 130), null); // only 50 sessions old
});

test('blank-check detector and the O\'Neil 8% stop', () => {
  assert.equal(spacLike([NaN, 10, 10.02, 9.98, 10, 10.01, 10, 10, 10.03, 9.99, 10], 0), true); assert.equal(spacLike([10, 10, 10, 10, 12, 10, 10, 10, 10, 10], 0), false);
  const o = [0, 100, 0, 0, 0, 0], c = [0, 99, 95, 91.9, 120, 130]; assert.equal(stopExit(o, c, 1, 5, 0.08), 3); assert.equal(stopExit(o, [0, 99, 95, 93, 120, 130], 1, 5, 0.08), 5);
});

test('dividend streak: each year vs the year before in the SAME filing (a split restates both); only public filings count', () => {
  const Y = (y, v, f) => ({ s: y + '-01-01', e: y + '-12-31', v, f });
  const rows = [Y(2017, 1.0, '2018-02-20'), Y(2016, 0.9, '2018-02-20'), Y(2018, 1.1, '2019-02-20'), Y(2017, 1.0, '2019-02-20'), Y(2019, 1.2, '2020-02-20'), Y(2018, 1.1, '2020-02-20'),
    // 2-for-1 split in 2020: the 2020 10-K shows 2020 = 0.65 and 2019 restated = 0.6
    Y(2020, 0.65, '2021-02-20'), Y(2019, 0.6, '2021-02-20'), Y(2021, 0.7, '2022-02-20'), Y(2020, 0.65, '2022-02-20'), Y(2022, 0.75, '2023-02-20'), Y(2021, 0.7, '2023-02-20')];
  assert.deepEqual(divStreak(rows, '2023-03-01'), { streak: 6, last: '2022-12-31' });
  assert.deepEqual(divStreak(rows, '2023-02-20'), { streak: 5, last: '2021-12-31' });   // the 2022 10-K is not public yet (filed that day)
  const cut = [...rows, Y(2023, 0.75, '2024-02-20'), Y(2022, 0.75, '2024-02-20')]; assert.equal(divStreak(cut, '2024-03-01').streak, 0);   // flat = not a raise
  assert.equal(divStreak([{ s: '2022-01-01', e: '2022-03-31', v: 0.2, f: '2022-05-01' }], '2023-01-01'), null);   // quarters only
});

test('interest-bearing debt: total if reported, else the parts; never reported = 0; reported before but not at the latest date = unknown', () => {
  const Dt = { LongTermDebt: [{ e: '2023-12-31', v: 500, f: '2024-02-20' }], ShortTermBorrowings: [{ e: '2023-12-31', v: 50, f: '2024-02-20' }] };
  assert.equal(debtAt(Dt, '2024-03-01'), 550); assert.equal(debtAt(Dt, '2024-02-20'), 0);
  assert.equal(debtAt({ LongTermDebtNoncurrent: [{ e: '2023-12-31', v: 300, f: '2024-02-20' }], LongTermDebtCurrent: [{ e: '2023-12-31', v: 20, f: '2024-02-20' }] }, '2024-03-01'), 320);
  assert.equal(debtAt({}, '2024-03-01'), 0);
});

test('FOMC: statement days from the Fed calendar; eve close to statement close', () => {
  assert.equal(FOMC.length, 48); assert.ok(FOMC.includes('2026-10-28')); assert.deepEqual([...FOMC].sort(), FOMC);
  assert.deepEqual(fomcTrades(['2024-01-29', '2024-01-30', '2024-01-31', '2024-02-01']), [{ t: 1, x: 2 }]);
});

test('first splits: forward only, none of any kind in the 3 years before', () => {
  const S = [{ sym: 'A', d: '2020-06-01', from: 1, to: 4 }, { sym: 'A', d: '2022-06-01', from: 1, to: 2 }, { sym: 'A', d: '2025-07-01', from: 1, to: 3 }, { sym: 'B', d: '2023-01-05', from: 10, to: 1 }, { sym: 'B', d: '2024-01-05', from: 1, to: 2 }, { sym: 'C', d: '2024-02-01', from: 1, to: 10 }];
  assert.deepEqual(firstSplits(S, '2021-01-01').map(x => x.sym + x.d), ['C2024-02-01', 'A2025-07-01']);
});

test('calendars: week and month ends (the newest session uses the NYSE calendar), sorted-date lookups, halves, bottom picks, average', () => {
  const D = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30'];
  assert.deepEqual(weekEnds(D), [4, 9]); assert.deepEqual(monthEnds(D), [9]); assert.deepEqual(monthEnds(D.slice(0, 9)), []);
  assert.equal(onOrAfter(D, '2026-10-24'), 5); assert.equal(onOrBefore(D, '2026-10-24'), 4); assert.equal(onOrBefore(D, '2026-10-01'), -1);
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
  assert.deepEqual(pickBottom([{ key: 'a', v: 3 }, { key: 'b', v: -1 }, { key: 'c', v: NaN }, { key: 'd', v: 0 }], 0.5, 3), ['b', 'd']); assert.deepEqual(pickBottom([{ key: 'a', v: 1 }], 0.1, 3), []);
  assert.equal(sma([1, 2, 3, 4], 3, 2), 3.5); assert.equal(sma([1, 2, NaN, 4], 3, 2), null);
});
