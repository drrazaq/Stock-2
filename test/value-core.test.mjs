// Seams: value-core.mjs (Agent B value lab, 23 Oct 2026). Point-in-time SEC numbers (trailing twelve months, latest balance sheet,
// quarterly revenue growth), the earnings-beat streak, and the registered tier-2 verdict. Pure functions, no network, no files.
// Run: node test/value-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ttmAt, instantAt, quarterAt, growthRun, beatStreak, halfStat, judge } from '../value-core.mjs';

// a company with a December year: FY2022 = 100, 9-month YTD 2023 = 90 (9-month YTD 2022 = 70) -> TTM to Sep 2023 = 100 + 90 - 70 = 120
const cfo = [
  { s: '2022-01-01', e: '2022-12-31', v: 100, f: '2023-02-20' },
  { s: '2022-01-01', e: '2022-09-30', v: 70, f: '2022-11-01' },
  { s: '2023-01-01', e: '2023-09-30', v: 90, f: '2023-11-02' },
  { s: '2022-01-01', e: '2022-09-30', v: 70, f: '2023-11-02' },   // the same prior-year figure repeated in the 2023 10-Q
];

test('TTM from a 10-Q = this YTD + last full year - last YTD, only from filings public before the day', () => {
  assert.deepEqual(ttmAt(cfo, '2023-11-10'), { end: '2023-09-30', val: 120 });
  assert.deepEqual(ttmAt(cfo, '2023-03-01'), { end: '2022-12-31', val: 100 });   // the 10-K is the latest public filing
  assert.equal(ttmAt(cfo, '2023-02-20'), null);                                     // filed that day: not yet usable (and the 2022 Q3 YTD alone is not a year)
});

test('the year-earlier TTM: same rule, only periods ending a year or more before', () => {
  assert.deepEqual(ttmAt(cfo, '2023-11-10', '2022-10-10'), null);   // 9-month YTD 2022 alone, no FY2021 known: no year-earlier figure
  const more = [...cfo, { s: '2021-01-01', e: '2021-12-31', v: 80, f: '2022-02-20' }, { s: '2021-01-01', e: '2021-09-30', v: 60, f: '2022-11-01' }];
  assert.deepEqual(ttmAt(more, '2023-11-10', '2022-10-10'), { end: '2022-09-30', val: 90 });   // 80 + 70 - 60
});

test('balance sheet: the latest period end known before the day, latest filing of it', () => {
  const eq = [{ e: '2023-06-30', v: 500, f: '2023-08-01' }, { e: '2023-09-30', v: 520, f: '2023-11-02' }, { e: '2023-06-30', v: 510, f: '2023-11-02' }];
  assert.deepEqual(instantAt(eq, '2023-10-01'), { end: '2023-06-30', val: 500 });
  assert.deepEqual(instantAt(eq, '2023-11-03'), { end: '2023-09-30', val: 520 });
  assert.equal(instantAt(eq, '2023-08-01'), null);
});

test('quarter revenue: the 3-month figure, or for the 4th quarter the full year minus the 9-month YTD', () => {
  const rev = [
    { s: '2023-07-01', e: '2023-09-30', v: 30, f: '2023-11-02' }, { s: '2023-01-01', e: '2023-09-30', v: 85, f: '2023-11-02' },
    { s: '2023-01-01', e: '2023-12-31', v: 120, f: '2024-02-20' },
  ];
  assert.equal(quarterAt(rev, '2024-03-01', '2023-09-30'), 30);
  assert.equal(quarterAt(rev, '2024-03-01', '2023-12-31'), 35);
  assert.equal(quarterAt(rev, '2024-02-20', '2023-12-31'), null);   // the 10-K not public yet
});

// quarterly revenue 2022 Q1..Q4 = 100, 100, 100, 100; 2023 Q1..Q3 = 105, 112, 120 -> YoY growth +5%, +12%, +20%: rising 2 quarters running
const q = (s, e, v, f) => ({ s, e, v, f });
const rev2 = [q('2022-01-01', '2022-03-31', 100, '2022-05-01'), q('2022-04-01', '2022-06-30', 100, '2022-08-01'), q('2022-07-01', '2022-09-30', 100, '2022-11-01'),
  q('2022-01-01', '2022-12-31', 400, '2023-02-20'), q('2022-01-01', '2022-09-30', 300, '2022-11-01'),
  q('2023-01-01', '2023-03-31', 105, '2023-05-01'), q('2023-04-01', '2023-06-30', 112, '2023-08-01'), q('2023-07-01', '2023-09-30', 120, '2023-11-01')];

test('revenue growth run: year-on-year growth of the last three quarters known, newest first', () => {
  const g = growthRun(rev2, '2023-11-05');
  assert.equal(g.end, '2023-09-30'); assert.deepEqual(g.g.map(x => +x.toFixed(3)), [0.2, 0.12, 0.05]); assert.equal(g.rising, true);
  const g2 = growthRun(rev2, '2023-08-05');   // only Q1 and Q2 2023 known: two growth figures, not enough for "rising 2 quarters"
  assert.equal(g2.end, '2023-06-30'); assert.equal(g2.rising, false);
  const flat = rev2.map(x => x.e === '2023-09-30' ? { ...x, v: 110 } : x);   // Q3 +10% after Q2 +12%: not rising
  assert.equal(growthRun(flat, '2023-11-05').rising, false);
});

test('beat streak: consecutive reports with actual EPS above the estimate, ending at this report', () => {
  const R = [{ d: '2023-01-30', a: 1, e: 0.9 }, { d: '2023-04-28', a: 1, e: 1.1 }, { d: '2023-07-28', a: 1.2, e: 1.1 }, { d: '2023-10-27', a: 1.3, e: 1.2 }, { d: '2024-01-29', a: 1.4, e: 1.3 }, { d: '2024-09-30', a: 2, e: 1 }];
  assert.deepEqual(R.map((_, i) => beatStreak(R, i)), [1, 0, 1, 2, 3, 1]);   // a gap of 8 months breaks the run; equal is not a beat
});

// three blocks of 10 sessions per half; edges over the average stock (after 0.8% cost on both... the average stock is gross, the
// rule pays the cost): block edges 2%, 4%, 6% -> mean 4%, sd 2%, block t = 0.04 / (0.02 / sqrt 3) = 3.46
const tr = (t, g, c, own, s = 'S' + t) => ({ t, s, g, c, own, h: 10 });
const half = (t0) => [tr(t0, 0.058, 0.03, 0.01), tr(t0 + 10, 0.078, 0.03, 0.01), tr(t0 + 20, 0.098, 0.03, 0.01)];

test('half statistics: averages after cost, edge over the average stock, block t over blocks of the hold length', () => {
  const h = halfStat(half(0), 10);
  assert.equal(h.n, 3); assert.equal(h.blocks, 3);
  assert.equal(h.avg, 0.07); assert.equal(h.avgStress, 0.066); assert.equal(h.median, 0.07);
  assert.equal(h.edge, 0.04); assert.equal(h.tBlock, 3.46); assert.equal(h.vsOwn, 0.068); assert.equal(h.noTop2, 0.05);
});

test('verdict: every gate in both halves -> TRADABLE SMALL; block t over the proof bar -> PROVEN; an extra gate missed -> NOT PROVEN', () => {
  const R = { older: halfStat(half(0), 10), newer: halfStat(half(100), 10) };
  assert.equal(judge(R, { bar: 4, minN: 3 }).verdict, 'TRADABLE SMALL');
  assert.equal(judge(R, { bar: 3, minN: 3 }).verdict, 'PROVEN');
  const j = judge(R, { bar: 4, minN: 3, extra: ['not better than V15 in the newer half'] });
  assert.equal(j.verdict, 'NOT PROVEN'); assert.match(j.why, /V15/);
  assert.equal(judge(R, { bar: 4 }).verdict, 'TOO FEW CASES');
  const bad = { older: halfStat(half(0).map(x => ({ ...x, c: 0.2 })), 10), newer: R.newer };
  assert.equal(judge(bad, { bar: 4, minN: 3 }).verdict, 'REJECTED');
});

import { fcfCheck } from '../value-core.mjs';
// one company, all from 10-Ks (December years). FY2023: operating cash 120, capex 20 -> FCF 100; revenue 1,200 vs 1,000 (+20%);
// equity 1,000, long-term debt 300 (D/E 0.3); inventory 100 on cost of sales 730 a year -> 50 days. 100 shares at 15 USD = 1,500 -> FCF yield 6.7%.
const y = (yr, v, f) => ({ s: yr + '-01-01', e: yr + '-12-31', v, f }), i = (yr, v, f) => ({ e: yr + '-12-31', v, f });
const co = { cfo: { A: [y(2023, 120, '2024-02-15')] }, capex: { A: [y(2023, 20, '2024-02-15')] }, rev: { A: [y(2022, 1000, '2023-02-15'), y(2023, 1200, '2024-02-15')] },
  cogs: { A: [y(2023, 730, '2024-02-15')] }, inv: { A: [i(2023, 100, '2024-02-15')] }, eq: { A: [i(2023, 1000, '2024-02-15')] }, debt: { LongTermDebt: [i(2023, 300, '2024-02-15')] } };

test('B-FCF1 company check: FCF yield > 5%, revenue +10%, debt/equity < 0.5, inventory days < 60 (point in time)', () => {
  const c = fcfCheck(co, '2024-03-01', 15, 100);
  assert.equal(c.ok, true); assert.equal(+c.fcfy.toFixed(4), 0.0667); assert.equal(+c.growth.toFixed(2), 0.2); assert.equal(c.de, 0.3); assert.equal(+c.dio.toFixed(1), 50);
  assert.equal(fcfCheck(co, '2024-03-01', 25, 100).ok, false);                                                  // 4% yield
  assert.equal(fcfCheck({ ...co, debt: { LongTermDebt: [i(2023, 600, '2024-02-15')] } }, '2024-03-01', 15, 100).ok, false);   // D/E 0.6
  assert.equal(fcfCheck({ ...co, inv: { A: [i(2023, 200, '2024-02-15')] } }, '2024-03-01', 15, 100).ok, false);             // 100 days
  assert.equal(fcfCheck({ ...co, inv: {} }, '2024-03-01', 15, 100).ok, true);                                       // no inventory: no inventory test
  assert.equal(fcfCheck({ ...co, debt: {} }, '2024-03-01', 15, 100).ok, true);                                      // never reported debt: none
  assert.equal(fcfCheck({ ...co, capex: {} }, '2024-03-01', 15, 100).ok, false);                                    // capex unknown: FCF unknown
  assert.equal(fcfCheck(co, '2024-02-15', 15, 100).ok, false);                                                      // the 10-K not public yet
  assert.equal(fcfCheck(co, '2024-12-01', 15, 100).ok, false);                                                      // 11 months old: stale
  assert.equal(fcfCheck(co, '2024-03-01', 2, 100).ok, false);                                                       // 50% yield: a data error (quality.mjs bound)
});
