// Seams: value-core.mjs quarterFlowAt / fcfNewsAt / niNewsAt / trailingCut (B-FCFN1) and v15Exit (B-V15BE), Agent B 10 Nov 2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import { quarterFlowAt, fcfNewsAt, niNewsAt, trailingCut, v15Exit } from '../value-core.mjs';

// year-to-date cash flows as 10-Qs file them (fiscal year = calendar year)
const ytd = (y, v3, v6, v9, v12, lag = 40) => [
  { s: y + '-01-01', e: y + '-03-31', v: v3, f: y + '-05-10' }, { s: y + '-01-01', e: y + '-06-30', v: v6, f: y + '-08-09' },
  { s: y + '-01-01', e: y + '-09-30', v: v9, f: y + '-11-09' }, { s: y + '-01-01', e: y + '-12-31', v: v12, f: (+y + 1) + '-02-25' }];
const cfo = [...ytd('2022', 10, 25, 45, 70), ...ytd('2023', 20, 50, 90, 140)], capex = [...ytd('2022', 2, 4, 6, 8), ...ytd('2023', 3, 6, 9, 12)];
test('quarterFlowAt: 3-month figure, else YTD minus the same-start YTD 3 months shorter; point in time', () => {
  assert.equal(quarterFlowAt(cfo, '2023-05-11', '2023-03-31'), 20);
  assert.equal(quarterFlowAt(cfo, '2023-08-10', '2023-06-30'), 30);
  assert.equal(quarterFlowAt(cfo, '2023-11-10', '2023-09-30'), 40);
  assert.equal(quarterFlowAt(cfo, '2024-02-26', '2023-12-31'), 50);     // the 10-K year minus 9 months
  assert.equal(quarterFlowAt(cfo, '2023-08-09', '2023-06-30'), null);   // filed that day: not known yet
});
test('fcfNewsAt / niNewsAt: this quarter minus the same quarter a year earlier, over market value', () => {
  const co = { cfo: { NetCashProvidedByUsedInOperatingActivities: cfo }, capex: { PaymentsToAcquirePropertyPlantAndEquipment: capex }, ni: { NetIncomeLoss: cfo } };
  // Q3 2023: FCF 40-3 = 37; Q3 2022: 20-2 = 18; news 19 / 1000
  assert.equal(+fcfNewsAt(co, '2023-11-10', '2023-09-30', 1000).toFixed(6), 0.019);
  assert.equal(+niNewsAt(co, '2023-11-10', '2023-09-30', 1000).toFixed(6), 0.02);
  assert.equal(fcfNewsAt(co, '2023-11-10', '2023-09-30', 10), null);    // 190% of market value: data error
  assert.equal(fcfNewsAt({ ...co, capex: {} }, '2023-11-10', '2023-09-30', 1000), null);
  assert.equal(fcfNewsAt(co, '2022-11-10', '2022-09-30', 1000), null);  // no year-earlier quarter
});
test('trailingCut: the 90th percentile of a pool of 200+, else null', () => {
  const pool = Array.from({ length: 201 }, (_, k) => k);
  assert.equal(trailingCut(pool), 180); assert.equal(trailingCut(pool.slice(0, 199)), null);
});
test('v15Exit: 25% stop, sell with profit at 130% of the 50-day, break-even after +15%, else the 126th close', () => {
  const n = 140, ma = Array(n).fill(100), op = Array(n).fill(100);
  const path = (f) => Array.from({ length: n }, (_, k) => f(k)), R = (o) => o && { ...o, g: +o.g.toFixed(6) };
  assert.deepEqual(R(v15Exit(path(() => 101), op, ma, 1, false)), { x: 126, k: 'c', g: 0.01, why: 'time' });
  const stop = path(k => k === 5 ? 74 : 101); op[6] = 73;
  assert.deepEqual(R(v15Exit(stop, op, ma, 1, false)), { x: 6, k: 'o', g: -0.27, why: 'stop' }); op[6] = 100;
  const up = path(k => k === 4 ? 116 : k === 9 ? 99 : 105);
  assert.equal(v15Exit(up, op, ma, 1, false).why, 'time');
  assert.deepEqual(R(v15Exit(up, op, ma, 1, true)), { x: 10, k: 'o', g: 0, why: 'break-even' });
  const prof = path(k => k === 7 ? 131 : 101); op[8] = 128;
  assert.deepEqual(R(v15Exit(prof, op, ma, 1, true)), { x: 8, k: 'o', g: 0.28, why: 'profit' });
  assert.equal(v15Exit(path(() => 101), op, ma, 20, false), null);       // runs past the data
});
