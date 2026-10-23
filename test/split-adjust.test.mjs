// Seam: adjustSplits(sym, candles, splits) in scan.mjs, applied to every daily series the nightly scan loads.
// Guards the 23 Oct holdings-brief finding: Twelve Data handed the scan IESC unadjusted for its 2-for-1 split (24 Aug 2026) and GRML
// unadjusted for its 1-for-50 reverse split (24 Aug 2026), so IESC showed a 6-month change of -62% (real about -37%) and GRML +1,151%
// (real about -65%) with "uptrend: true". Same rule as leaders-study.mjs: a split is applied only when the price jump across its date
// matches it, so a series that is already adjusted is never adjusted twice.
// Run: node test/split-adjust.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const S = await loadScan();
const adj = S.fn('adjustSplits');
const bars = (rows) => rows.map(([d, c, v]) => ({ d, o: c, h: c, l: c, c, v: v || 1000 }));

test('IESC 2-for-1: bars before the split are halved and volume doubled', () => {
  const c = bars([['2026-08-20', 440], ['2026-08-21', 444], ['2026-08-24', 221], ['2026-08-25', 225]]);
  const n = adj('IESC', c, [{ s: 'IESC', d: '2026-08-24', r: 2 }]);
  assert.equal(n, 1);
  assert.deepEqual(c.map(x => x.c), [220, 222, 221, 225]);
  assert.equal(c[0].v, 2000); assert.equal(c[2].v, 1000);
});

test('GRML 1-for-50 reverse split: bars before are multiplied by 50', () => {
  const c = bars([['2026-08-21', 0.12], ['2026-08-24', 6.1]]);
  assert.equal(adj('GRML', c, [{ s: 'GRML', d: '2026-08-24', r: 0.02 }]), 1);
  assert.equal(c[0].c, 6); assert.equal(c[0].v, 20);
});

test('a series that is already adjusted is not adjusted again', () => {
  const c = bars([['2026-08-21', 222], ['2026-08-24', 221]]);
  assert.equal(adj('IESC', c, [{ s: 'IESC', d: '2026-08-24', r: 2 }]), 0);
  assert.deepEqual(c.map(x => x.c), [222, 221]);
});

test('future splits and other tickers are ignored', () => {
  const c = bars([['2026-08-21', 440], ['2026-08-24', 221]]);
  assert.equal(adj('IESC', c, [{ s: 'IESC', d: '2026-12-01', r: 2 }, { s: 'GRML', d: '2026-08-24', r: 0.02 }]), 0);
  assert.equal(c[0].c, 440);
});

test('no network was used', () => assert.deepEqual(blocked, []));
