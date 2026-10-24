// Seams: verify-core.mjs (independent re-implementation of SQ6-MTUM and SQ1-BBAUTH from their written specs). Pure functions, no network.
// Run: node test/verify-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { cap, half, sessionAfter, weekKey, lastSessionsOf, closeOnOrBefore, holdReturn, liquidSeries, tradedValue63, weeklyReturnsUpTo, zOf, msciMomentumPick,
  textOf, authorizedSize, sizeOfCompany, sharesKnownOn, firstPerKey, sameStockOtherDays, compareTrades, frogInPan, quantMomentumPick, splitsAfter, rollingMaxClose, rollingMean, pullbackAt } from '../verify-core.mjs';
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('cap, halves, sessions strictly after a filing date', () => {
  assert.equal(cap(5), 3); assert.equal(cap(-0.9), -0.9); assert.equal(half('2023-12-29'), 'older'); assert.equal(half('2024-01-01'), 'newer');
  const D = ['2024-01-02', '2024-01-03', '2024-01-05'];
  assert.equal(sessionAfter(D, '2024-01-02'), 1, 'a filing on a session day is bought the NEXT session'); assert.equal(sessionAfter(D, '2024-01-04'), 2); assert.equal(sessionAfter(D, '2024-01-05'), 3);
});

test('week keys and month-end formation sessions (only months that are over)', () => {
  assert.equal(weekKey('2024-05-31'), '2024-05-27'); assert.equal(weekKey('2024-06-02'), '2024-05-27');
  const D = ['2024-05-30', '2024-05-31', '2024-06-03', '2024-11-29', '2024-12-02', '2025-05-30'];
  assert.deepEqual(lastSessionsOf(D, [5, 11]), [1, 3], 'the last May session of 2025 is not known to be the last yet');
});

test('hold returns: open of k to close of x; a stock that stops trading = its last close; no open at k = no trade', () => {
  const o = [10, 10, 11, 12, 0, 0], c = [10, 10.5, 11.5, 13, 0, 0];
  const h = holdReturn(o, c, 1, 3); assert.ok(near(h.g, 0.3) && h.exitAt === 3 && h.gone === false);
  const r = holdReturn(o, c, 2, 5); assert.ok(near(r.g, 13 / 11 - 1)); assert.equal(r.exitAt, 3); assert.equal(r.gone, true);
  assert.equal(holdReturn(o, c, 4, 5), null); assert.equal(closeOnOrBefore(c, 5), 13); assert.equal(closeOnOrBefore(c, 5, 1), null);
});

test('liquidity: close 5+ and 20-session average traded value 5M+, a missing session counts 0', () => {
  const c = Array(25).fill(10), v = Array(25).fill(600000); v[22] = 0; const L = liquidSeries(c, v);
  assert.equal(L[18], 0); assert.equal(L[19], 1); assert.equal(L[22], 1, '19 x 6M / 20 = 5.7M'); c[24] = 4.9; assert.equal(liquidSeries(c, v)[24], 0);
  assert.ok(Number.isNaN(tradedValue63(c, v, 30))); assert.equal(tradedValue63(Array(70).fill(10), Array(70).fill(1e6), 69), 1e7);
});

test('weekly returns use only weeks that ended by the formation close', () => {
  const D = ['2024-05-20', '2024-05-24', '2024-05-28', '2024-05-31', '2024-06-03', '2024-06-07'], c = [1, 10, 1, 11, 99, 12];
  assert.deepEqual(weeklyReturnsUpTo(D, c, 3).map(x => +x.toFixed(6)), [0.1]);
  assert.deepEqual(weeklyReturnsUpTo(D, c, 4).map(x => +x.toFixed(6)), [0.1], 'the week of 06-03 is not over at 06-03');
});

test('MSCI momentum pick: risk-adjusted z of 6 and 12 months, 50/50, re-z, positive only, best first', () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ id: i, m6: (i - 15) / 100, m12: (i - 15) / 50, vol: 0.3 }));
  assert.deepEqual(msciMomentumPick(rows, 3), [29, 28, 27]); assert.equal(msciMomentumPick(rows, 100).length, 15, 'only positive combined z (ids 15..29 sit above the mean 14.5)');
  // risk adjustment: the same momentum with half the volatility ranks first
  const r2 = rows.map(x => ({ ...x })); r2[20].vol = 0.05; assert.equal(msciMomentumPick(r2, 1)[0], 20);
  const z = zOf([1, 2, 3, null]); assert.ok(near(z[0], -1) && near(z[2], 1) && z[3] === null);
});

test('8-K text: the authorized size from sentences naming a repurchase AND an authorization', () => {
  const t = textOf('<p>On May 1, the Board of Directors authorized a new share repurchase program of up to $1.5&nbsp;billion of the Company&#8217;s common stock.</p><p>Revenue was $9 billion.</p><p>The Board also approved the repurchase of up to 2,000,000 shares.</p>');
  assert.deepEqual(authorizedSize(t), { usd: 1.5e9, shares: 2e6 });
  assert.deepEqual(authorizedSize('The company repurchased shares for $40 million. Its board approved a dividend of $0.25 per share.'), { usd: null, shares: null }, 'no authorization in the repurchase sentence');
  assert.deepEqual(authorizedSize('The Board authorized the repurchase of up to 5 million shares of its common stock and up to $250,000,000 in total.'), { usd: 2.5e8, shares: 5e6 });
  assert.equal(sizeOfCompany({ usd: 1e8, shares: null }, 1e7, 20), 0.5); assert.equal(sizeOfCompany({ usd: 1e8, shares: 6e6 }, 1e8, 20), 0.06); assert.equal(sizeOfCompany({ usd: null, shares: null }, 1e8, 20), null);
});

test('share counts are known 30 days after their date; first event per company in 180 days', () => {
  const rows = [['2024-01-31', 100], ['2024-04-30', 120]]; assert.equal(sharesKnownOn(rows, '2024-05-29'), 100); assert.equal(sharesKnownOn(rows, '2024-05-30'), 120); assert.equal(sharesKnownOn(rows, '2024-02-29'), null);
  const ev = firstPerKey([{ key: 'A', d: '2024-01-01' }, { key: 'A', d: '2024-06-28' }, { key: 'A', d: '2024-06-29' }, { key: 'B', d: '2024-02-01' }], 180);
  assert.deepEqual(ev.map(e => e.key + e.d), ['A2024-01-01', 'B2024-02-01', 'A2024-06-29']);
});

test('same stock on its other days: capped, non-overlapping, 3+ windows', () => {
  const v = sameStockOtherDays({ from: 0, last: 49, len: 10, step: 10, okStart: () => true, taken: [[10, 19]], ret: (u) => (u === 0 ? 9 : 0.1) });
  assert.ok(near(v, (3 + 0.1 * 3) / 4)); assert.equal(sameStockOtherDays({ from: 0, last: 19, len: 10, okStart: () => true, ret: () => 0.1 }), null);
});

test('trade comparison matches by symbol and signal date', () => {
  const a = [{ s: 'X', sig: '2024-01-02', buy: '2024-01-03', sell: '2024-04-03', net: 0.1, avgStock: 0.02, sameStock: 0.01 }], b = [{ ...a[0], net: 0.1005 }, { s: 'Y', sig: '2024-01-02', net: 0 }];
  const r = compareTrades(a, b); assert.equal(r.matched, 1); assert.equal(r.netWithin, 1); assert.equal(r.sameDates, 1); assert.deepEqual(r.onlyTheirs, ['Y|2024-01-02']);
});

test('QMOM: frog in the pan and the smoother half of the top 10%', () => {
  assert.ok(near(frogInPan([1, 2, 3, 2, 3], 1, 4, 0.5), (1 - 3) / 4)); assert.equal(frogInPan([1, 2, 0, 0, 3], 1, 4, 0.5), null, 'under 90% of days known');
  const rows = Array.from({ length: 200 }, (_, i) => ({ id: i, mom: i / 100, fip: i % 2 ? -0.1 : 0.1 })); const p = quantMomentumPick(rows);
  assert.equal(p.length, 10); assert.ok(p.every(i => i >= 180 && i % 2 === 1), 'top 20 by momentum, the 10 smoothest');
});

test('PB12: split basis, 50-session closing high, 200-session average, FIRST close 12% under the high', () => {
  assert.equal(splitsAfter([{ d: '2022-07-18', r: 20 }, { d: '2024-06-10', r: 10 }], '2022-08-01'), 10);
  const c = [10, 12, 11, 10.5, 10.4, 10]; const hi = rollingMaxClose(c, 3); assert.deepEqual([...hi], [10, 12, 12, 12, 11, 10.5]);
  assert.ok(Number.isNaN(rollingMean(c, 3)[1])); assert.ok(near(rollingMean(c, 3)[2], 11));
  const C = Array(260).fill(100); for (let t = 0; t < 250; t++) C[t] = 50 + t * 0.2; C[250] = 110; C[251] = 87; C[252] = 86;   // high 110, 200-day mean ~ 80
  const H = rollingMaxClose(C, 50), M = rollingMean(C, 200); assert.equal(pullbackAt(C, H, M, 251), true); assert.equal(pullbackAt(C, H, M, 252), false, 'not the first close under');
  const C2 = C.slice(); C2[251] = 70; C2[252] = 70; assert.equal(pullbackAt(C2, rollingMaxClose(C2, 50), rollingMean(C2, 200), 251), false, 'under its 200-day average');
});
