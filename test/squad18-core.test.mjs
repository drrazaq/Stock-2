// Seams: squad18-core.mjs (SQUAD 18, 24 Oct 2026: human-behaviour filters and timing). Distribution / accumulation day counts, market
// stress, the shrinking-volume pullback, the Friday leader dip, next-week entry, the calm delay, contribution days, accounts and the monthly
// advantage, the basket value series, the fixed hold from a given buy, pre-holiday / turn-of-month tags, library pre-registration.
// Pure functions. Run: node --test test/squad18-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, TRADE_IDS, CONTRIB_IDS, volDays, distActive, stressAt, accumOk, dryPullback, dayDip, nextWeekStart, monBuy, delayBuy, monthGroups, contribDay, account, advantage, contribVerdict,
  basketNav, holdFrom, preHoliday, inTom, removedReport, paired, preRegister, weekday, halfOf } from '../squad18-core.mjs';
import { holdTrade } from '../squad11-core.mjs';
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('10 rules: 7 trade rules (holds 21 / 63 / 126) and 3 contribution rules', () => {
  assert.equal(IDS.length, 10); assert.equal(TRADE_IDS.length, 7); assert.equal(CONTRIB_IDS.length, 3);
  for (const id of TRADE_IDS) assert.ok([21, 63, 126].includes(RULES[id].hold), id);
  for (const id of IDS) assert.ok(RULES[id].rule.length > 60, id);
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
  assert.equal(weekday('2026-10-23'), 5); assert.equal(weekday('2026-10-26'), 1);
});

test('distribution = 0.2%+ down on higher volume; accumulation = 0.2%+ up on higher volume; last 25 sessions only', () => {
  const c = [100, 99.7, 99.9, 100.2, 100.1, 99], v = [10, 11, 12, 13, 9, 14];
  // day1 -0.3% on 11>10 dist; day2 +0.2% on 12>11 acc; day3 +0.3% acc; day4 -0.1% (too small, lower volume); day5 -1.1% on 14>9 dist
  assert.deepEqual({ ...volDays(c, v, 5), have: undefined }, { dist: 2, acc: 2, have: undefined });
  assert.equal(volDays(c, v, 5, 2).dist, 1);   // only days 4, 5
  assert.equal(accumOk(c, v, 5), true); assert.equal(accumOk(c, v, 1), false);
  const lowerVol = volDays([100, 98], [10, 9], 1); assert.equal(lowerVol.dist, 0);   // a fall on LOWER volume is not distribution
});

test('market stress: SPY -2%, VIXY +15%, or 5+ distribution days', () => {
  const n = 30, c = Array.from({ length: n }, () => 100), v = Array.from({ length: n }, () => 10);
  assert.equal(stressAt(c, v, null, 29).stress, false);
  const c2 = [...c]; c2[29] = 98; assert.equal(stressAt(c2, v, null, 29).spyDrop, true);
  const c3 = [...c]; c3[29] = 98.1; assert.equal(stressAt(c3, v, null, 29).stress, false);   // -1.9%: no
  const vx = Array.from({ length: n }, () => 20); vx[29] = 23; assert.equal(stressAt(c, v, vx, 29).fear, true); vx[29] = 22.9; assert.equal(stressAt(c, v, vx, 29).fear, false);
  const c4 = [], v4 = []; for (let k = 0; k < n; k++) { c4.push(100 - (k % 2 ? 0.5 : 0)); v4.push(k % 2 ? 20 : 10); }   // every other day down 0.5% on higher volume
  const s = stressAt(c4, v4, null, 29); assert.ok(s.nDist >= 5); assert.equal(s.dist, true); assert.equal(s.stress, true);
});

test('active IBD distribution days retire once SPY closes 5%+ above them', () => {
  const c = [100, 99, 100, 102, 103.95, 104], v = [10, 20, 5, 5, 5, 5];   // day 1: distribution (-1% on 20 > 10)
  assert.equal(distActive(c, v, 3), 1); assert.equal(distActive(c, v, 4), 0);   // 103.95 = 99 x 1.05: retired at day 4
  assert.equal(distActive([100, 99, 100, 102, 103.9, 104], v, 4), 1); assert.equal(distActive([100, 99, 100, 102, 103.9, 104], v, 5), 0);
});

test('shrinking-volume pullback: last 10 days vs the 50 before', () => {
  const v = [...new Array(50).fill(100), ...new Array(10).fill(50)]; assert.equal(dryPullback(v, 59), true);
  const h = [...new Array(50).fill(100), ...new Array(10).fill(150)]; assert.equal(dryPullback(h, 59), false);
  assert.equal(dryPullback(v, 58), null);   // not enough history
  const gaps = [...v]; for (let k = 0; k < 10; k++) gaps[k] = NaN; assert.equal(dryPullback(gaps, 59), null);   // 80% of the 50: unknown
});

test('Friday leader dip: stock -2%, SPY better than -1%, Friday only', () => {
  const c = [100, 98], spy = [100, 99.5];
  assert.equal(dayDip(c, spy, 1, 5), true); assert.equal(dayDip(c, spy, 1, 4), false); assert.equal(dayDip(c, [100, 99], 1, 5), false);   // SPY -1.0%: not better than -1%
  assert.equal(dayDip([100, 98.1], spy, 1, 5), false); assert.equal(dayDip(c, spy, 1, 2, (w) => w >= 1 && w <= 4), true);
});

test('Thursday / Friday signals are bought at the next week\'s first session (Tuesday after a Monday holiday)', () => {
  const D = ['2025-08-27', '2025-08-28', '2025-08-29', '2025-09-02', '2025-09-03'];   // Wed, Thu, Fri, (Labor Day) Tue, Wed
  assert.equal(nextWeekStart(D, 1), 3); assert.equal(monBuy(D, 1, D.length), 3); assert.equal(monBuy(D, 2, D.length), 3); assert.equal(monBuy(D, 0, D.length), 1);
  assert.equal(monBuy(D, 4, D.length), 5); assert.equal(monBuy(['2026-10-23'], 0, 1), 1);   // data ends: T (pending)
});

test('calm delay: next open when calm; else the open after the first calm close; at most 21 sessions', () => {
  const st = new Set([10, 11, 12]); assert.equal(delayBuy(u => st.has(u), 9), 10); assert.equal(delayBuy(u => st.has(u), 10), 14);
  assert.equal(delayBuy(() => true, 5), 27);
});

test('contribution days: first session, mid-month, last session, after the first 3% dip (else the last session)', () => {
  const D = ['2024-01-31', '2024-02-01', '2024-02-02', '2024-02-14', '2024-02-15', '2024-02-16', '2024-02-29'], G = monthGroups(D);
  assert.equal(G.length, 2); const g = G[1], spy = [100, 101, 97.9, 99, 99, 99, 99];
  assert.equal(contribDay('plain', g, D, spy, 0), 1); assert.equal(contribDay('mid', g, D, spy, 0), 4); assert.equal(contribDay('end', g, D, spy, 0), 6);
  assert.equal(contribDay('dip3', g, D, spy, 0), 3);   // 97.9 <= 101 x 0.97 = 97.97 at index 2 -> buy the open of index 3
  assert.equal(contribDay('dip3', g, D, [100, 100, 99, 99, 99, 99, 90], 0), 6);   // the only dip is on the last session: buy that open anyway
  assert.equal(contribDay('dip3', g, D, [100, 99, 98, 96.9, 99, 99, 99], 0), 4);   // high = the previous month-end close (100)
});

test('accounts per half and the monthly advantage vs plain', () => {
  const navO = [10, 8, 10, 20, 25], navC = [10, 8, 10, 20, 25];
  const plain = [{ ym: '2023-11', t: 0 }, { ym: '2024-01', t: 2 }], cheap = [{ ym: '2023-11', t: 1 }, { ym: '2024-01', t: 2 }];
  const a = account(plain, navO, navC, 3, 4, 0), b = account(cheap, navO, navC, 3, 4, 0);
  assert.ok(near(a.older.value, 2000)); assert.ok(near(b.older.value, 2500)); assert.ok(near(a.newer.value, 2500)); assert.equal(a.older.months, 1);
  const adv = advantage(plain, cheap, navO); assert.ok(near(adv.older.avg, 0.25)); assert.equal(adv.newer.avg, 0); assert.equal(adv.all.months, 2);
  assert.equal(account(plain, navO, navC, 3, 4).older.value, r(2000 * 0.996));
});
const r = (x) => +(+x).toFixed(4);

test('contribution verdict: better needs both halves, a bigger account and t >= 2', () => {
  const A = (o, n, t) => ({ older: { avg: o }, newer: { avg: n }, all: { t } }), acc = (o, n) => ({ older: { value: o }, newer: { value: n } });
  assert.equal(contribVerdict(A(0.01, 0.01, 2.5), acc(11, 11), acc(10, 10)), 'BETTER TIMING');
  assert.equal(contribVerdict(A(0.01, 0.01, 1.5), acc(11, 11), acc(10, 10)), 'NO STEADY DIFFERENCE');
  assert.equal(contribVerdict(A(0.01, -0.01, 3), acc(11, 11), acc(10, 10)), 'NO STEADY DIFFERENCE');
  assert.equal(contribVerdict(A(-0.01, -0.002, -3), acc(9, 9), acc(10, 10)), 'WORSE TIMING');
});

test('basket value: weights at each period open, cash after a member is sold, re-spread at the next period', () => {
  // stock 0 doubles in period 1; stock 1 flat; period 2 = stock 1 only
  const O = [[10, 10, 15, 20, 20, 20], [5, 5, 5, 5, 5, 10]], C = [[10, 12, 20, 20, 20, 20], [5, 5, 5, 5, 5, 10]];
  const px = (i, t, at) => (at === 'o' ? O : C)[i][t];
  const P = [{ legs: [{ i: 0, k: 1, x: 2, w: 0.5 }, { i: 1, k: 1, x: 3, w: 0.5 }] }, { legs: [{ i: 1, k: 4, x: 5, w: 1 }] }];
  const { navO, navC } = basketNav(P, 6, px);
  assert.ok(Number.isNaN(navC[0])); assert.ok(near(navO[1], 1)); assert.ok(near(navC[1], 0.5 * 1.2 + 0.5)); assert.ok(near(navC[2], 0.5 * 2 + 0.5));
  assert.ok(near(navC[3], 1.5));   // stock 0 sold at the close of 2: cash
  assert.ok(near(navO[4], 1.5)); assert.ok(near(navC[5], 3));   // period 2: all in stock 1 at its open 5, closes 10
});

test('holdFrom(k = t + 1) equals squad11 holdTrade; a fixed sell session is honoured', () => {
  const S = { o: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], c: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19] };
  assert.deepEqual(holdFrom(S, 2, 9, 10, 3), holdTrade(S, 1, 9, 10, 3));
  const r2 = holdFrom(S, 4, 9, 10, 63, 6); assert.equal(r2.x, 6); assert.ok(near(r2.g, 16 / 14 - 1)); assert.equal(r2.days, 3);
  assert.equal(holdFrom(S, 10, 9, 10, 3).pending, true); assert.equal(holdFrom(S, 8, 9, 10, 5).open, true);
});

test('pre-holiday and turn-of-month tags', () => {
  assert.equal(preHoliday('2025-08-29', '2025-09-02'), true); assert.equal(preHoliday('2025-08-28', '2025-08-29'), false); assert.equal(preHoliday('2025-10-24', '2025-10-27'), false);
  const D = ['2024-01-29', '2024-01-30', '2024-01-31', '2024-02-01', '2024-02-02', '2024-02-05', '2024-02-06'];
  assert.deepEqual(D.map((d, t) => inTom(D, t)), [true, true, true, true, true, true, false].map((x, t) => t === 0 ? true : x));
});

test('removed report and paired comparison', () => {
  const rows = [{ g: 0.5, c: 0.1, spy: 0.05, days: 126 }, { g: -0.3, c: 0, spy: 0.02, days: 126 }];
  const x = removedReport(rows); assert.equal(x.n, 2); assert.equal(x.bigWinners, 1); assert.equal(x.bigLosers, 1); assert.ok(near(x.avg, 0.1 - 0.008));
  const p = paired([{ g: 0.1, base: 0.05 }, { g: 0, base: 0.02 }, { g: 0.1 }]); assert.equal(p.n, 2); assert.ok(near(p.diff, 0.015)); assert.equal(p.better, 0.5);
});

test('library pre-registration is idempotent and written before any result', () => {
  const LB = { strategies: [{ id: 'X' }] }; assert.equal(preRegister(LB), 10); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, 11);
  for (const e of LB.strategies.slice(1)) { assert.ok(/pre-registered/.test(e.status)); assert.equal(e.agent, 'squad18'); assert.ok(!e.result); }
});
