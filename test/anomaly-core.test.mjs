// Seams of the ANOMALY LAB (anomaly-core.mjs, pure; anomaly-lab.mjs does the reading and writing). No network, no files.
//   pickFrac / pctRanks          the decile pick and percentile ranks
//   mom / high52 / volatility / maxRet / residMom / fpBeta / ivol / logSum / hvpWeek / seasonal   price features known at the close
//   monthStarts / weekStarts / preHoliday / tomWindows / nextSession                               calendar
//   reactionIdx / quantile / surge                                                                 earnings
//   insiderType / parseMasterIdx / byFiling / bestIdeas / divInitiations                          events
//   eilIndustryOk / eilStockOk / ownAverage / boardStats / paperReady                              rule gates and yardsticks
// Run: node test/anomaly-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ANOMALIES, NEEDS_DATA, IDS, pickFrac, pctRanks, mom, high52, volatility, maxRet, ols, residMom, fpBeta, ivol, logSum, hvpWeek, seasonal, monthStarts, weekStarts, preHoliday, tomWindows,
  nextSession, reactionIdx, quantile, surge, insiderType, parseMasterIdx, byFiling, bestIdeas, divInitiations, eilIndustryOk, eilStockOk, ownAverage, boardStats, paperReady, halfOf, COST, preRegister } from '../anomaly-core.mjs';
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, a + ' vs ' + b);

test('registry: at least 25 runnable anomalies, each with a rule, hold, papers and a library note; needs-data entries are separate', () => {
  assert.ok(IDS.length >= 25, 'only ' + IDS.length);
  for (const id of IDS) { const a = ANOMALIES[id]; assert.ok(/^ANOM-/.test(id)); assert.ok(a.rule && a.rule.length > 20, id); assert.ok(a.hold >= 1, id); assert.ok(a.papers.length >= 1, id); assert.ok(typeof a.lib === 'string', id); }
  for (const id of Object.keys(NEEDS_DATA)) assert.ok(!IDS.includes(id) && NEEDS_DATA[id].why);
  for (const id of ['ANOM-DAYMOM12', 'ANOM-DAYMOM1', 'ANOM-DAYNIGHT', 'ANOM-EIL20', 'ANOM-EIL60']) assert.ok(IDS.includes(id), id + ' (coordinator addition) missing');
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('decile pick: top / bottom 10%, at least 100 usable rows, NaN ignored', () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ key: i, v: i })); rows.push({ key: 'x', v: NaN });
  assert.deepEqual(pickFrac(rows, 0.1, 'top'), [119, 118, 117, 116, 115, 114, 113, 112, 111, 110, 109, 108]);
  assert.deepEqual(pickFrac(rows, 0.1, 'bottom').slice(0, 3), [0, 1, 2]);
  assert.deepEqual(pickFrac(rows.slice(0, 99), 0.1), []);
  const r = pctRanks([{ key: 'a', v: 1 }, { key: 'b', v: 2 }, { key: 'c', v: 2 }, { key: 'd', v: 3 }]); assert.equal(r.get('a'), 0); assert.equal(r.get('b'), 0.5); assert.equal(r.get('d'), 1);
});

test('momentum, 52-week high, volatility and MAX use only closes up to t', () => {
  const c = Array.from({ length: 300 }, (_, k) => 10 + k * 0.1);
  near(mom(c, 299, 252, 21), c[278] / c[47] - 1);
  assert.equal(mom(c, 100, 252, 21), null);
  near(high52(c, 299), 1); c[250] = 100; near(high52(c, 299), c[299] / 100); assert.equal(high52(c, 200), null);
  const f = [100, 101, 99, 102, 100, 103]; near(maxRet(f, 5, 5), 102 / 99 - 1);
  assert.ok(volatility(f, 5, 5) > 0);
  const flat = [1, 1, 1, 1, NaN, 1]; assert.equal(volatility(flat, 5, 5), null);   // 2 of 5 returns missing (> 10%)
});

test('market model: OLS, residual momentum, shrunk beta, idiosyncratic volatility', () => {
  const f = ols([2, 4, 6, 8], [1, 2, 3, 4]); near(f.b, 2); near(f.a, 0); f.e.forEach(e => near(e, 0));
  // a stock that moves exactly 1.5x the market: beta 1.5 -> shrunk 0.6*1.5+0.4 = 1.3; residuals zero -> ivol 0
  const m = [100], c = [50]; for (let k = 1; k < 300; k++) { const r = Math.sin(k) * 0.01; m.push(m[k - 1] * (1 + r)); c.push(c[k - 1] * (1 + 1.5 * r)); }
  near(fpBeta(c, m, 299), 1.3, 1e-6); near(ivol(c, m, 299, 21), 0, 1e-9);
  // add a steady +0.2% a day of its own: residual momentum strongly positive
  const c2 = c.map((x, k) => x * Math.pow(1.002, k)); assert.ok(residMom(c2, m, 299) > 10);
});

test('overnight vs intraday sums and the high-volume week', () => {
  const o = [10, 11, 11, 12], c = [10, 10.5, 12, 12];   // nights: 11/10, 11/10.5, 12/12 ; days: 10.5/11, 12/11, 12/12
  near(logSum(o, c, 1, 3, 'night'), Math.log(1.1) + Math.log(11 / 10.5) + 0);
  near(logSum(o, c, 1, 3, 'day'), Math.log(10.5 / 11) + Math.log(12 / 11) + 0);
  const v = Array(60).fill(100); assert.equal(hvpWeek(v, 59), false); for (let k = 55; k < 60; k++) v[k] = 200; assert.equal(hvpWeek(v, 59), true);
  v[20] = 1000; assert.equal(hvpWeek(v, 59), false);   // an earlier week was bigger
});

test('seasonality: average of the same calendar month in earlier years only', () => {
  const m = new Map([['2022-03', 0.05], ['2023-03', 0.01], ['2024-03', 0.9], ['2023-04', 0.5]]);
  near(seasonal(m, '2024-03'), 0.03); assert.equal(seasonal(m, '2022-03'), null);
});

test('calendar: month and week starts, pre-holiday, turn of the month, next NYSE session', () => {
  const D = ['2024-06-27', '2024-06-28', '2024-07-01', '2024-07-02', '2024-07-03', '2024-07-05', '2024-07-08'];
  assert.deepEqual(monthStarts(D), [2]); assert.deepEqual(weekStarts(D), [2, 6]);
  assert.equal(preHoliday(D, 4), true);  // 3 July: closed 4 July
  assert.equal(preHoliday(D, 1), false); // Friday -> Monday is normal
  assert.deepEqual(tomWindows(['2024-06-26', ...D]), [{ buy: 1, sell: 5 }]);   // buy the close of 27 June (day -2), sell the close of 3 July (+3)
  assert.equal(nextSession('2026-11-25'), '2026-11-27'); assert.equal(nextSession('2026-10-23'), '2026-10-26');
});

test('earnings: reaction session, rolling quantile, SURGE', () => {
  const D = ['2024-05-01', '2024-05-02', '2024-05-03', '2024-05-06'];
  assert.equal(reactionIdx(D, '2024-05-02', 'bmo'), 1); assert.equal(reactionIdx(D, '2024-05-02', 'amc'), 2); assert.equal(reactionIdx(D, '2024-05-04', null), 3); assert.equal(reactionIdx(D, '2024-05-06', 'amc'), -1);
  assert.equal(quantile([1, 2, 3], 0.9), null); near(quantile(Array.from({ length: 101 }, (_, i) => i), 0.9), 90);
  // revenue growing 10 a quarter (seasonal change 40 each time, sd 0) -> null (sd 0); with noise -> finite, a big jump -> large
  assert.equal(surge([100, 110, 120, 130, 140, 150, 160, 170, 180]), null);
  const r = [100, 110, 120, 130, 141, 149, 161, 169, 260]; assert.ok(surge(r) > 10); assert.equal(surge(r.slice(1)), null);
});

test('insiders: routine = the same month in each of the last 3 years; unclassified without 3 years of history', () => {
  assert.equal(insiderType(new Set(['2021-03', '2022-03', '2023-03']), 2024), 'routine');
  assert.equal(insiderType(new Set(['2021-03', '2022-05', '2023-03']), 2024), 'opportunistic');
  assert.equal(insiderType(new Set(['2022-03', '2023-03']), 2024), null);
});

test('EDGAR master index: wanted forms only, amendments out, grouped per filing', () => {
  const txt = 'Description: x\nCIK|Company Name|Form Type|Date Filed|Filename\n----\n1234|TARGET CO|SC 13D|2024-02-01|edgar/data/1234/a.txt\n999|FUND LP|SC 13D|2024-02-01|edgar/data/1234/a.txt\n1234|TARGET CO|SC 13D/A|2024-03-01|edgar/data/1234/b.txt\n55|NEWCO|10-12B|2024-01-05|edgar/data/55/c.txt\n';
  const rows = parseMasterIdx(txt, new Set(['SC 13D', 'SCHEDULE 13D'])); assert.equal(rows.length, 2);
  const f = byFiling(rows); assert.equal(f.length, 1); assert.deepEqual(f[0].ciks, ['1234', '999']);
});

test('13F best idea = largest weight above the aggregate weight, managers with 20-300 positions only', () => {
  const mk = (n, big) => { const m = new Map(); for (let i = 0; i < n; i++) m.set('C' + i, 10); if (big) m.set(big, 100); return m; };
  const f = [{ mgr: 'a', pos: mk(25, 'X') }, { mgr: 'b', pos: mk(25, 'Y') }, { mgr: 'c', pos: mk(5, 'Z') }];
  const b = bestIdeas(f); assert.equal(b.get('X'), 1); assert.equal(b.get('Y'), 1); assert.equal(b.has('Z'), false);
});

test('dividend initiations: first regular cash dividend after 2 dividend-free years', () => {
  const rows = [{ sym: 'A', decl: '2021-05-01', type: 'CD' }, { sym: 'A', decl: '2021-08-01', type: 'CD' }, { sym: 'B', decl: '2019-02-01', type: 'SC' }, { sym: 'B', decl: '2022-06-01', type: 'CD' }, { sym: 'C', decl: '2020-06-01', type: 'CD' }, { sym: 'C', decl: '2022-01-01', type: 'CD' }];
  assert.deepEqual(divInitiations(rows, '2021-01-01'), [{ sym: 'A', d: '2021-05-01' }, { sym: 'B', d: '2022-06-01' }]);
});

test('emerging industry leadership gates', () => {
  assert.equal(eilIndustryOk(0.6, 0.35, 0.2, 0.1), true); assert.equal(eilIndustryOk(0.6, 0.45, 0.2, 0.1), false); assert.equal(eilIndustryOk(0.45, 0.2, 0.2, 0.1), false); assert.equal(eilIndustryOk(0.6, 0.3, 0.1, 0.1), false);
  assert.equal(eilStockOk(0.8, 0.5), true); assert.equal(eilStockOk(0.8, 0.6), false); assert.equal(eilStockOk(0.65, 0.3), false);
});

test('same stock on its other days: windows skip busy spans and failing days; 3 needed', () => {
  const ret = (u, x) => u / 100;
  near(ownAverage({ from: 0, to: 59, len: 10, step: 10, okAt: () => true, busy: [[20, 29]], ret }), (0 + 0.1 + 0.3 + 0.4 + 0.5) / 5);
  assert.equal(ownAverage({ from: 0, to: 29, len: 10, step: 10, okAt: (u) => u !== 10, ret }), null);
});

test('paper board: after 0.8% cost, edge vs the average stock, ready at 30 trades on 10 days with a positive average', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ d: 'd' + (i % 10), sym: 'S' + i, g: 0.02, c: 0.005 })); const s = boardStats(rows);
  near(s.avg, 0.02 - COST, 1e-4); near(s.edge, 0.015, 1e-4); assert.equal(paperReady(s), true); assert.equal(paperReady({ ...s, days: 9 }), false);
});

test('library pre-registration: every ANOM entry once, with its rule and library check; idempotent; existing entries untouched', () => {
  const LB = { strategies: [{ id: 'T1', status: 'tested: not proven' }, { id: 'ANOM-MOM12', status: 'tested: rejected' }] };
  const n = preRegister(LB); assert.equal(n, IDS.length + Object.keys(NEEDS_DATA).length - 1);
  assert.equal(LB.strategies.find(e => e.id === 'ANOM-MOM12').status, 'tested: rejected');
  const e = LB.strategies.find(e => e.id === 'ANOM-52WH'); assert.ok(/pre-registered/.test(e.status) && e.explain.includes('252') && e.libraryCheck.includes('T3'));
  assert.equal(LB.strategies.find(e => e.id === 'ANOM-IDXADD').status, 'needs data');
  assert.equal(preRegister(LB), 0);
});
