// Seams: squad5-core.mjs (SQUAD 5, 24 Oct 2026: index-style baskets). Size ranking, 12-1 momentum, the index buffer, new entrants,
// quality pick, the Shariah proxy (business + debt / cash screens), the portfolio engine (resets, drift without re-weighting, cash, dead and
// bought-out stocks, costs on turnover, open holdings), path statistics, and the idempotent library pre-registration.
// Run: node test/squad5-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { byCap, topByCap, mom121, bufferSelect, newEntrant, qualityPick, haramSic, shariahOk, debtCashAt, aboveMA, simulate, equalW, capW, pathStats, monthly, monthStarts, monthEnds,
  isQuarterMonth, preRegister, IDS, RULES, MAX_CAP, usCompany, splitRatio, capAt, boardStats, paperReady, periodPieces, periodHold } from '../squad5-core.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
// px helper: closes / opens per stock (arrays), stock "dead" or "gone" flags
const mk = (O, C, { gone = {}, dead = {} } = {}) => { const last = (i) => { let l = -1; C[i].forEach((z, k) => { if (z > 0) l = k; }); return l; };
  return { o: (i, k) => O[i][k], c: (i, k) => C[i][k], last, vanished: (i) => !!(gone[i] || dead[i]), dead: (i) => !!dead[i] }; };

test('size ranking: largest first, bad or missing values out, ties by key', () => {
  const r = byCap([{ key: 3, cap: 10 }, { key: 1, cap: 50 }, { key: 2, cap: null }, { key: 4, cap: MAX_CAP * 2 }, { key: 0, cap: 10 }]);
  assert.deepEqual(r.map(x => x.key), [1, 0, 3]); assert.deepEqual(topByCap([{ key: 1, cap: 1 }, { key: 2, cap: 2 }], 1).map(x => x.key), [2]);
});

test('12-1 momentum skips the last month and needs 252 sessions', () => {
  const c = Array.from({ length: 300 }, (_, k) => 100 + k); assert.equal(mom121(c, 251), null);
  assert.ok(near(mom121(c, 299), c[278] / c[47] - 1));
});

test('index buffer: keep holdings within the top 2N, drop the rest, fill with the best not held', () => {
  const ranked = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const s = bufferSelect(['g', 'h', 'z', 'c'], ranked, 3, 7);   // g rank 6 < 7 kept; h rank 7 dropped; z not ranked dropped
  assert.deepEqual(s.keep, ['g', 'c']); assert.deepEqual(s.drop.sort(), ['h', 'z']); assert.deepEqual(s.add, ['a']);
  const f = bufferSelect([], ranked, 3, 6); assert.deepEqual(f.add, ['a', 'b', 'c']); assert.deepEqual(f.keep, []);
});

test('new entrant: in now and in none of the previous 12; fewer than 12 known -> no', () => {
  assert.equal(newEntrant(true, Array(12).fill(false)), true); assert.equal(newEntrant(true, [...Array(11).fill(false), true]), false);
  assert.equal(newEntrant(true, Array(11).fill(false)), false); assert.equal(newEntrant(false, Array(12).fill(false)), false);
});

test('quality pick: both ROIC and FCF margin positive, average of percentile ranks', () => {
  const rows = [{ key: 'a', roic: 0.5, fcfM: 0.05 }, { key: 'b', roic: 0.3, fcfM: 0.3 }, { key: 'c', roic: 0.1, fcfM: 0.2 }, { key: 'd', roic: -0.1, fcfM: 0.9 }, { key: 'e', roic: 0.2, fcfM: null }];
  assert.deepEqual(qualityPick(rows, 2), ['b', 'a']);   // b (0.5 + 1) / 2 = 0.75, a (1 + 0) / 2 = 0.5, c (0 + 0.5) / 2 = 0.25; d (ROIC < 0) and e (no FCF) out
});

test('Shariah proxy: business screen and both 33% ratios', () => {
  assert.equal(haramSic('6022'), true); assert.equal(haramSic('6798'), true); assert.equal(haramSic('2084'), true); assert.equal(haramSic('7372'), false); assert.equal(haramSic('6500'), false); assert.equal(haramSic('2086'), false);
  assert.equal(shariahOk({ sic: '7372', debt: 10, cash: 10, cap: 100 }).ok, true);
  assert.equal(shariahOk({ sic: '7372', debt: 40, cash: 10, cap: 100 }).ok, false);
  assert.equal(shariahOk({ sic: '7372', debt: 10, cash: 33, cap: 100 }).ok, false);
  assert.equal(shariahOk({ sic: '7372', debt: null, cash: 1, cap: 100 }).why, 'debt unknown');
  assert.match(shariahOk({ sic: '6022', debt: 0, cash: 0, cap: 100 }).why, /business/);
  assert.equal(shariahOk({ sic: null, debt: 0, cash: 0, cap: 100 }).ok, false);
});

test('debt and cash at the latest balance sheet filed before the day; never reported debt = 0', () => {
  const co = { eq: { StockholdersEquity: [{ e: '2024-03-31', v: 100, f: '2024-05-01' }, { e: '2024-06-30', v: 120, f: '2024-08-01' }] },
    debt: { LongTermDebt: [{ e: '2024-03-31', v: 30, f: '2024-05-01' }, { e: '2024-06-30', v: 25, f: '2024-08-01' }] }, cash: { CashAndCashEquivalentsAtCarryingValue: [{ e: '2024-06-30', v: 7, f: '2024-08-01' }] } };
  assert.deepEqual(debtCashAt(co, '2024-07-15'), { end: '2024-03-31', debt: 30, cash: null });
  assert.deepEqual(debtCashAt(co, '2024-08-02'), { end: '2024-06-30', debt: 25, cash: 7 });
  assert.equal(debtCashAt({ ...co, debt: {} }, '2024-08-02').debt, 0);
  assert.equal(debtCashAt(co, '2024-08-01').end, '2024-03-31', 'filed that day = not yet known');
});

test('trend filter: close above its 200-session average', () => {
  const up = Array.from({ length: 220 }, (_, k) => 100 + k), dn = Array.from({ length: 220 }, (_, k) => 300 - k);
  assert.equal(aboveMA(up, 219), true); assert.equal(aboveMA(dn, 219), false); assert.equal(aboveMA(up, 100), null);
});

test('portfolio: reset to equal weights, costs on every buy and sale, daily marks', () => {
  // two stocks, 4 sessions; buy both at the open of 1 (equal), stock 0 doubles, stock 1 flat; reset at 3 to equal weight
  const O = [[10, 10, 15, 20], [10, 10, 10, 10]], C = [[10, 12, 18, 20], [10, 10, 10, 10]], px = mk(O, C), w = equalW([0, 1]);
  const S = simulate({ T: 4, start: 1, events: new Map([[1, { kind: 'reset', w }], [3, { kind: 'reset', w }]]), px, side: 0.01 });
  // after buys at 1: cash 1 - 2 x 0.5 x... buys scaled to the cash: need = 1 x 1.01 > 1 -> f = 1/1.01
  const v = 1 / 1.01 / 2; assert.ok(near(S.eq[1], v * 12 / 10 + v * 1)); assert.ok(isNaN(S.eq[0]));
  assert.equal(S.trades.length, 2); assert.ok(S.trades.every(z => z.kind === 'open' && z.te === 1));
  assert.ok(S.costPaid > 0.01 && S.traded > 1);
  // no trade is closed by a reset that keeps the stock
  assert.ok(near(S.trades.find(z => z.i === 0).pxOut, 20));
});

test('portfolio: drift keeps winners without re-weighting; freed cash split among new entries', () => {
  const O = [[10, 10, 20, 20, 20], [10, 10, 10, 5, 5], [10, 10, 10, 10, 10]], C = [[10, 10, 20, 20, 20], [10, 10, 10, 5, 5], [10, 10, 10, 10, 10]], px = mk(O, C);
  const S = simulate({ T: 5, start: 1, events: new Map([[1, { kind: 'drift', drop: [], add: [0, 1] }], [4, { kind: 'drift', drop: [1], add: [2] }]]), px, side: 0 });
  // stock 0 doubled and is NOT trimmed; stock 1 sold at 5 (0.25 left), all of it into stock 2
  assert.ok(near(S.eq[4], 1.0 + 0.25)); const t1 = S.trades.find(z => z.i === 1); assert.equal(t1.kind, 'sold'); assert.equal(t1.x, 4); assert.ok(near(t1.pxOut, 5));
  const t2 = S.trades.find(z => z.i === 2); assert.equal(t2.te, 4); assert.equal(t2.kind, 'open');
});

test('portfolio: cash event, dead stock worth 0, bought-out stock paid its last close', () => {
  const O = [[10, 10, 10, NaN, NaN], [10, 10, 10, NaN, NaN], [10, 10, 10, 10, 10]], C = [[10, 10, 2, NaN, NaN], [10, 10, 12, NaN, NaN], [10, 10, 10, 10, 10]];
  const px = mk(O, C, { dead: { 0: 1 }, gone: { 1: 1 } });
  const S = simulate({ T: 5, start: 1, events: new Map([[1, { kind: 'reset', w: equalW([0, 1]) }]]), px, side: 0 });
  assert.ok(near(S.eq[3], 0.5 * 0 + 0.5 * 1.2)); assert.equal(S.trades.find(z => z.i === 0).kind, 'dead'); assert.equal(S.trades.find(z => z.i === 1).kind, 'gone');
  const C2 = simulate({ T: 5, start: 1, events: new Map([[1, { kind: 'reset', w: equalW([2]) }], [3, { kind: 'cash' }]]), px, side: 0.01 });
  assert.equal(C2.trades[0].kind, 'sold'); assert.ok(near(C2.eq[4], C2.eq[3])); assert.ok(C2.eq[4] < 1);
});

test('equal weights can be capped (new entrants: at most 5% each)', () => {
  const w = equalW([1, 2], 0.05); assert.ok(near(w.get(1), 0.05)); const c = capW([{ key: 1, cap: 3 }, { key: 2, cap: 1 }]); assert.ok(near(c.get(1), 0.75));
});

test('path statistics and monthly returns', () => {
  const lv = [1, 1.1, 0.88, 1.21]; const s = pathStats(lv, 0, 3); assert.ok(near(s.total, 0.21)); assert.ok(near(s.maxDD, -0.2));
  const D = ['2024-01-30', '2024-01-31', '2024-02-29', '2024-03-01'], me = monthEnds(D); assert.deepEqual(me, [1, 2, 3]); assert.deepEqual(monthStarts(D), [2, 3]);
  assert.deepEqual(monthly(lv, me, D).map(x => x.m), ['2024-02', '2024-03']); assert.equal(isQuarterMonth('2024-04-01'), true); assert.equal(isQuarterMonth('2024-05-01'), false);
});

test('library pre-registration is idempotent and carries the rule text', () => {
  const LB = { strategies: [{ id: 'X6' }] }; assert.equal(preRegister(LB), IDS.length); assert.equal(preRegister(LB), 0);
  const e = LB.strategies.find(x => x.id === 'SQ5-MOMBUF'); assert.match(e.explain, /top 40/); assert.match(e.status, /pre-registered/); assert.equal(Object.keys(RULES).length, 8);
});

test('board helpers', () => { const s = boardStats([{ d: 'a', sym: 'X', g: 0.1, c: 0.02 }]); assert.equal(s.n, 1); assert.ok(near(s.avg, 0.092)); assert.equal(paperReady(s), false); });

test('holding periods: a holding is cut at every review it lives through; first / last pieces keep the real entry / exit', () => {
  const P = periodPieces([{ i: 1, te: 10, x: 80, at: 'o', kind: 'sold', pxIn: 5, pxOut: 7 }, { i: 2, te: 40, x: 99, at: 'c', kind: 'open', pxIn: 3, pxOut: 4 }], [10, 40, 80, 99]);
  assert.deepEqual(P.filter(z => z.i === 1).map(z => [z.te, z.x, z.at, z.kind, z.pxIn, z.pxOut]), [[10, 40, 'o', 'period', 5, null], [40, 80, 'o', 'sold', null, 7]]);
  assert.deepEqual(P.filter(z => z.i === 2).map(z => [z.te, z.x, z.at, z.kind]), [[40, 80, 'o', 'period'], [80, 99, 'o', 'period'], [99, 99, 'c', 'open']]);
  assert.equal(periodPieces([{ i: 3, te: 5, x: 30, at: 'o', kind: 'sold', pxIn: 1, pxOut: 2 }], []).length, 1);
  assert.equal(periodHold('SQ5-TOP20'), 63); assert.equal(periodHold('SQ5-MOMBUF'), 21); assert.equal(periodHold('SQ5-NEWIN'), 126);
});

test('data guards: a market value far above its traded value is a unit error; US domicile', () => {
  assert.deepEqual(byCap([{ key: 1, cap: 1e12, dv: 1e9 }, { key: 2, cap: 2e12, dv: 1e7 }]).map(r => r.key), [1]);
  assert.equal(usCompany('CA', ['10-K', '10-Q']), true); assert.equal(usCompany('K3', ['10-K']), false); assert.equal(usCompany('NY', ['20-F']), false); assert.equal(usCompany(null, []), false);
});

test('market value from as-traded numbers: later splits restore the traded price; counts follow splits after their date', () => {
  const splits = [['2024-06-10', 10], ['2025-09-10', 0.1]];   // a 10-for-1 split, later a 1-for-10 reverse split
  assert.equal(splitRatio(splits, '2024-01-01', '2024-12-31'), 10); assert.equal(splitRatio(splits, '2024-06-10', '9999-12-31'), 0.1);
  // on 2024-03-01: adjusted close 50 -> traded 50 x 10 x 0.1 = 50; cover count 1,000 (as of 2024-01-15) -> cap 50,000
  assert.equal(capAt({ adjClose: 50, d: '2024-03-01', splits, cover: [['2024-01-15', 1000]] }).cap, 50000);
  // on 2024-08-01 the count is from before the 10-for-1 split: 1,000 x 10 shares at the traded price 50 x 0.1 = 5
  assert.equal(capAt({ adjClose: 50, d: '2024-08-01', splits, cover: [['2024-05-01', 1000]] }).cap, 50000);
  // a cover count 1000x off is replaced by the statement count
  const r = capAt({ adjClose: 10, d: '2024-03-01', splits: [], cover: [['2024-01-01', 1e9]], alt: [['2024-02-01', '2023-12-31', 1e6]] }); assert.equal(r.cap, 1e7); assert.equal(r.src, 'statements');
  assert.equal(capAt({ adjClose: 10, d: '2024-03-01', splits: [], cover: [['2024-02-15', 5]] }), null, 'cover count under 30 days old is not usable yet');
});
