// Seams: tipster-core.mjs (TIPSTER lab, 24 Oct 2026; owner: "my tipster said buy NVIDIA at about 90 and forget it, add more every now
// and then; how did he figure it out?"). The position plan (one add at -15%, 35% stop on the TOTAL, dead stock = loss, monthly adds),
// share-count split repair, industry leaders by market cap, and the three rule checks. Pure functions, no network, no files.
// Run: node test/tipster-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { series } from '../hold-core.mjs';
import { runPlan, PLAN, PLANS, splitFix, sharesAt, industryLeaders, largest, dedupeByCompany, dipLeaderOk, themePick, industryGrowth, turnaroundOk, lowBefore, highOf,
  insiderUsdBefore, item302Before, revGrowthTTM, growthOf, weighted, perYearOf, failures, preRegister, IDS, RULES, halfOf } from '../tipster-core.mjs';

const N = NaN, flat = (px, T = px.length) => series(px, px, T), near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('plan: holds to the last session and sells at that close; no add when the price never falls 15%', () => {
  const c = [100, 100, 95, 90, 110, 120], r = runPlan(flat(c), 1, { ...PLAN, maxH: 5 });
  assert.equal(r.kind, 'max'); assert.equal(r.x, 5); assert.equal(r.at, 'c'); assert.equal(r.units.length, 1); assert.ok(near(r.g, 0.20)); assert.ok(near(r.worst, -0.10));
  assert.ok(near(r.unitYears, 5 / 252));
});

test('plan: adds 0.5 unit at the NEXT open after the first close 15% under the first buy, once', () => {
  //          0    1    2   3   4   5   6   7
  const c = [100, 100, 84, 80, 70, 90, 100, 100], o = [100, 100, 86, 82, 72, 88, 99, 100];
  const r = runPlan(series(o, c), 1, { ...PLAN, maxH: 7 });
  assert.equal(r.units.length, 2); assert.equal(r.units[1].k, 3); assert.equal(r.units[1].px, 82); assert.equal(r.units[1].w, 0.5);   // close 84 on session 2 -> open of 3
  assert.equal(r.w, 1.5);
  const val = 1 * 100 / 100 + 0.5 * 100 / 82; assert.ok(near(r.profit, val - 1.5)); assert.ok(near(r.g, (val - 1.5) / 1.5));
  assert.equal(r.kind, 'max');
});

test('plan: the 35% stop is on the TOTAL position (money in), sold at the next open', () => {
  // first buy 100; add at 84's next open 84; total money 1.5; value at close 60 = 0.6 + 0.5 x 60/84 = 0.957 -> 63.8% of 1.5 -> stop
  const c = [100, 100, 84, 70, 60, 50, 40], o = [100, 100, 85, 84, 62, 55, 41];
  const r = runPlan(series(o, c), 1, { ...PLAN, maxH: 6 });
  assert.equal(r.kind, 'stop'); assert.equal(r.x, 5); assert.equal(r.at, 'o'); assert.equal(r.units.length, 2);
  const v = 1 * 55 / 100 + 0.5 * 55 / 84; assert.ok(near(r.g, (v - 1.5) / 1.5));
  // without the add the same path stops one session later? no: 1 unit at 100, close 60 = -40% -> stop at the same close
  const one = runPlan(series(o, c), 1, { ...PLANS.ONCE, maxH: 6 }); assert.equal(one.kind, 'stop'); assert.ok(near(one.g, -0.45));
  // FORGET has no stop: held to the end
  const fg = runPlan(series(o, c), 1, { ...PLANS.FORGET, maxH: 6 }); assert.equal(fg.kind, 'max'); assert.ok(near(fg.g, -0.60));
});

test('plan: a dead stock (vanished under 3 USD) loses the rest; a vanished stock above 3 USD is paid out at its last close', () => {
  const T = 20, dead = [10, 10, 8, 6, 2.5, ...Array(15).fill(N)], gone = [10, 10, 11, 12, ...Array(16).fill(N)];
  const d = runPlan(series(dead, dead, T), 1, { ...PLANS.FORGET, maxH: 12 }); assert.equal(d.kind, 'dead'); assert.ok(near(d.g, -1));
  const g = runPlan(series(gone, gone, T), 1, { ...PLANS.FORGET, maxH: 12 }); assert.equal(g.kind, 'gone'); assert.ok(near(g.g, 0.2));
});

test('plan: a window past the end of the data is not judged; no open = no buy', () => {
  assert.equal(runPlan(flat([100, 100, 101]), 1, { ...PLAN, maxH: 5 }), null);
  assert.equal(runPlan(series([N, N, 1, 1, 1], [N, N, 1, 1, 1]), 1, { ...PLAN, maxH: 2 }), null);
});

test('plan partial (paper lane): past the data = open, marked at the newest close; a stop before the newest close is final', () => {
  const r = runPlan(flat([100, 100, 90, 95]), 1, { ...PLAN, maxH: 252, partial: true }); assert.equal(r.kind, 'open'); assert.ok(near(r.g, -0.05)); assert.equal(r.x, 3);
  const c = [100, 100, 60, 50, 55], s = runPlan(series(c, c), 1, { ...PLAN, maxH: 252, partial: true }); assert.equal(s.kind, 'stop'); assert.equal(s.x, 3); assert.equal(s.at, 'o');
  const p = runPlan(flat([100, 100, 95, 60]), 1, { ...PLAN, maxH: 252, partial: true }); assert.equal(p.kind, 'open'); assert.equal(p.stopPending, true);
  assert.equal(runPlan(flat([100, 100, 90, 95]), 1, { ...PLAN, maxH: 252 }), null);
});

test('plan MONTHLY: adds everySize at the open every `every` sessions after the entry, not on the last session', () => {
  const c = Array(12).fill(100); c[5] = 110; c[9] = 120; c[10] = 120; c[11] = 120;
  const r = runPlan(flat(c), 1, { maxH: 10, stop: 0.35, adds: [], every: 4, everySize: 0.1 });   // sessions 1..10; adds at 5 and 9
  assert.deepEqual(r.units.map(u => [u.k, u.w]), [[1, 1], [5, 0.1], [9, 0.1]]);
  const v = 1 * 1.2 + 0.1 * 120 / 110 + 0.1 * 1; assert.ok(near(r.g, (v - 1.2) / 1.2));
});

test('split repair: a 4:1 jump between two share rows scales the older rows; a 30% issuance is left alone', () => {
  const r = splitFix([['2021-05-21', 6.23e9], ['2021-11-12', 25e9], ['2022-03-11', 25.1e9], ['2023-01-01', 32.6e9]]);
  assert.ok(near(r[0][1], 6.23e9 * 25e9 / 6.23e9, 1)); assert.equal(r[3][1], 32.6e9); assert.equal(r[1][1], 25e9);
  const s = splitFix([['2020-01-01', 100], ['2021-01-01', 210]]); assert.equal(s[0][1], 100);   // 2.1x is not within 3% of 2
});

test('shares known on a day: 30 days late, and only for quarterly filers (2+ rows in 400 days)', () => {
  const rows = [['2025-01-31', 100], ['2025-04-30', 110], ['2025-07-31', 120]];
  assert.equal(sharesAt(rows, '2025-05-30'), 110); assert.equal(sharesAt(rows, '2025-05-31'), 110); assert.equal(sharesAt(rows, '2025-05-29'), 100);
  assert.equal(sharesAt([['2024-12-31', 5], ['2025-12-31', 5]], '2026-03-01'), null);   // annual filer: 1 row in the last 400 days
});

test('industry leaders: top 3 by cap in industries with 5+ members; small industries have no leaders; largest-N', () => {
  const rows = [...[50, 40, 30, 20, 10].map((cap, k) => ({ key: 'A' + k, ind: '3674', cap })), ...[9, 8, 7, 6].map((cap, k) => ({ key: 'B' + k, ind: '7372', cap }))];
  const L = industryLeaders(rows); assert.deepEqual([...L.leaders].sort(), ['A0', 'A1', 'A2']); assert.equal(L.rankInInd.get('A3'), 4); assert.equal(L.rankInInd.get('B0'), undefined);
  const big = largest(rows, 2); assert.deepEqual([...big.set], ['A0', 'A1']); assert.equal(big.rank.get('B0'), 6);
  assert.deepEqual(dedupeByCompany([{ key: 'GOOGL', cik: 1, dv: 9 }, { key: 'GOOG', cik: 1, dv: 5 }, { key: 'X', cik: 2, dv: 1 }]).map(r => r.key), ['GOOGL', 'X']);
});

test('DIP-LEADER: every condition is needed; the thresholds are inclusive', () => {
  const base = { leader: true, close: 70, hi252: 100, spyClose: 85, spyHi252: 100, revG: 0.01 };
  assert.equal(dipLeaderOk(base), true);
  assert.equal(dipLeaderOk({ ...base, close: 70.5 }), false);       // only 29.5% under the high
  assert.equal(dipLeaderOk({ ...base, spyClose: 86 }), false);      // market only 14% down
  assert.equal(dipLeaderOk({ ...base, leader: false }), false);
  assert.equal(dipLeaderOk({ ...base, revG: 0 }), false); assert.equal(dipLeaderOk({ ...base, revG: null }), false);
});

test('THEME: the accelerating industry with the best 12-month return; a hotter non-accelerating one is skipped', () => {
  const inds = [{ ind: 'A', n: 8, ret12: 0.9, g0: 0.2, g1: 0.3, ng: 5 }, { ind: 'B', n: 6, ret12: 0.5, g0: 0.3, g1: 0.1, ng: 4 }, { ind: 'C', n: 4, ret12: 2, g0: 0.5, g1: 0.1, ng: 4 }, { ind: 'D', n: 9, ret12: 0.4, g0: 0.2, g1: 0.1, ng: 5 }];
  assert.equal(themePick(inds).ind, 'B');
  assert.equal(themePick([{ ind: 'E', n: 9, ret12: 0.4, g0: -0.1, g1: -0.2, ng: 5 }]), null);   // accelerating but shrinking: no theme
  const g = industryGrowth([[0.3, 0.1], [0.1, 0.2], [0.5, null], [0.2, 0.0]]); assert.equal(g.ng, 3); assert.ok(near(g.g0, 0.2)); assert.ok(near(g.g1, 0.1));
});

test('TURNAROUND: former leader near its 3-year low, growth rising, and big insider money or an item 3.02 8-K', () => {
  const base = { formerLeader: true, close: 21, low: 20, lowCover: 1, growth: { rising: true }, insiderUsd: 1e6, item302: false };
  assert.equal(turnaroundOk(base), true);
  assert.equal(turnaroundOk({ ...base, close: 22.5 }), false);                       // 12.5% above the low
  assert.equal(turnaroundOk({ ...base, growth: { rising: false } }), false);
  assert.equal(turnaroundOk({ ...base, insiderUsd: 9e5 }), false);
  assert.equal(turnaroundOk({ ...base, insiderUsd: 0, item302: true }), true);
  assert.equal(turnaroundOk({ ...base, lowCover: 0.5 }), false);                     // not enough history for a 3-year low
});

test('helpers: low before t, 52-week high cover, insider sums and item 3.02 filings in the 90 days before (filed that day = not yet)', () => {
  const c = [5, 4, 6, N, 7, 3]; const l = lowBefore(c, 5, 5); assert.equal(l.low, 4); assert.ok(near(l.cover, 0.8));
  assert.equal(highOf([1, 2, 3, 4], 3, 4), 4); assert.equal(highOf([1, N, 3, 4], 3, 4), null);
  const ins = [['INTC', '2025-03-17', 'a', 25e6, '2025-03-12'], ['INTC', '2025-06-20', 'b', 5e5, '2025-06-18'], ['INTC', '2024-12-01', 'c', 9e9, '2024-12-01']];
  assert.equal(insiderUsdBefore(ins, '2025-04-08'), 25e6); assert.equal(insiderUsdBefore(ins, '2025-03-17'), 0);
  const f = [{ d: '2025-08-25', items: '1.01,3.02,9.01' }, { d: '2025-07-01', items: '2.02,9.01' }, { d: '2025-09-19', items: '13.02' }];
  assert.equal(item302Before(f, '2025-09-01').length, 1); assert.equal(item302Before(f, '2025-08-25').length, 0); assert.equal(item302Before(f, '2025-12-15').length, 0);
});

test('revenue growth point in time: TTM vs a year earlier from 10-K figures; a filing on the day is not yet known', () => {
  const rev = { Revenues: [{ s: '2023-01-01', e: '2023-12-31', v: 100, f: '2024-02-20' }, { s: '2024-01-01', e: '2024-12-31', v: 120, f: '2025-02-20' }] };
  assert.ok(near(revGrowthTTM(rev, '2025-03-01'), 0.2)); assert.equal(revGrowthTTM(rev, '2025-02-20'), null);
  assert.equal(revGrowthTTM(rev, '2025-12-01'), null);   // the latest period ended 335 days before: stale
  const q = []; const qe = ['2024-03-31', '2024-06-30', '2024-09-30', '2025-03-31', '2025-06-30', '2025-09-30'], qv = [10, 10, 10, 10, 11, 12.5];
  qe.forEach((e, k) => q.push({ s: new Date(Date.parse(e) - 89 * 864e5).toISOString().slice(0, 10), e, v: qv[k], f: e.slice(0, 8) + '28' }));
  const g = growthOf({ Revenues: q }, '2025-11-01'); assert.ok(g.rising); assert.ok(near(g.g[0], 0.25)); assert.ok(near(g.g[1], 0.1));
});

test('weights, per year of capital, failures, halves', () => {
  assert.ok(near(weighted([{ k: 1, w: 1 }, { k: 3, w: 0.5 }], 9, 'c', (k) => k === 1 ? 0.3 : 0.6), 0.4));
  assert.equal(weighted([{ k: 1, w: 1 }], 9, 'c', () => null), null);
  const rows = [{ g: 0.108, w: 1, unitYears: 1, kind: 'max', worst: -0.1, endVsFirst: 0.1 }, { g: -0.392, w: 1.5, unitYears: 0.5, kind: 'stop', worst: -0.4, endVsFirst: -0.45 }];
  assert.ok(near(perYearOf(rows), (0.1 * 1 + -0.4 * 1.5) / 1.5));
  const f = failures(rows); assert.equal(f.lost, 0.5); assert.equal(f.lost30, 0.5); assert.equal(f.stopped, 0.5); assert.equal(f.keptFalling, 0.5);
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('library pre-registration: six TIP entries, idempotent, rule text included', () => {
  assert.deepEqual(IDS, ['TIP-DIPLEAD', 'TIP-THEME', 'TIP-TURN', 'TIP-DIPLEAD-100', 'TIP-THEME-100', 'TIP-TURN-100']);
  const LB = { strategies: [{ id: 'X' }] }; assert.equal(preRegister(LB), 6); assert.equal(preRegister(LB), 0);
  const e = LB.strategies.find(x => x.id === 'TIP-DIPLEAD-100'); assert.match(e.explain, /100 largest/); assert.match(e.explain, /35% disaster stop/); assert.ok(RULES['TIP-TURN'].rule.includes('3.02'));
});
