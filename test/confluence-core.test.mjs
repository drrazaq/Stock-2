// Seams of the CONFLUENCE LAB (confluence-core.mjs, pure; confluence-lab.mjs does the reading and writing). No network, no files.
//   confluence / oneOpen      matching: 2+ (3+) different families within 5 sessions, shortest hold, stop by hold, one open per stock
//   walk                      the trade walk: time exit, stop at the next open, gaps, still open
//   tradeUsd                  cost math: size x (gross - 0.8%) - 3 USD on the buy - 3 USD on the sale
//   simulate                  portfolio slots: max open, liquidity priority, no second position in a held stock, stop frees the slot at that open
//   curveStats / losingStreak monthly profit, drawdown, streaks
// Run: node test/confluence-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, VERSIONS, TRY_SMALL, confluence, oneOpen, walk, tradeUsd, simulate, curveStats, losingStreak, stopFor, preRegister, halfOf } from '../confluence-core.mjs';
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, a + ' vs ' + b);

test('registry: every input rule has a family and a hold; the TRY SMALL set is the five rules of 24 Oct; two versions', () => {
  for (const [id, r] of Object.entries(RULES)) { assert.ok(['VALUE', 'MOMENTUM', 'EARNINGS', 'PULLBACK', 'SMART MONEY', 'EVENT'].includes(r.family), id); assert.ok(r.hold >= 1, id); }
  assert.deepEqual(Object.keys(TRY_SMALL).sort(), ['ANOM-52WH', 'ANOM-RESMOM', 'ANOM-SUESURGE', 'B-FCF1', 'DEC-FROG']);
  assert.deepEqual(Object.keys(VERSIONS), ['CONF-2', 'CONF-3']);
  assert.equal(stopFor(126), 0.35); assert.equal(stopFor(63), 0.15); assert.equal(stopFor(10), 0.15);
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('matching: two rules of ONE family never fire; two families within 5 sessions fire on the completing signal', () => {
  // 52WH and RESMOM are both MOMENTUM: no fire
  assert.deepEqual(confluence([{ rule: 'ANOM-52WH', sym: 'A', t: 100 }, { rule: 'ANOM-RESMOM', sym: 'A', t: 100 }], { minFam: 2 }), []);
  // MOMENTUM at 100 + VALUE at 105: fires at 105 (window [100, 105]), not at 100
  const f = confluence([{ rule: 'ANOM-52WH', sym: 'A', t: 100 }, { rule: 'B-FCF1', sym: 'A', t: 105 }], { minFam: 2 });
  assert.equal(f.length, 1); assert.equal(f[0].t, 105); assert.deepEqual(f[0].fams, ['MOMENTUM', 'VALUE']);
  // 6 sessions apart: no fire
  assert.deepEqual(confluence([{ rule: 'ANOM-52WH', sym: 'A', t: 100 }, { rule: 'B-FCF1', sym: 'A', t: 106 }], { minFam: 2 }), []);
  // different stocks never combine
  assert.deepEqual(confluence([{ rule: 'ANOM-52WH', sym: 'A', t: 100 }, { rule: 'B-FCF1', sym: 'B', t: 100 }], { minFam: 2 }), []);
  // same day in either order; an unknown rule is ignored
  assert.equal(confluence([{ rule: 'B-FCF1', sym: 'A', t: 50 }, { rule: 'ANOM-SUESURGE', sym: 'A', t: 50 }, { rule: 'X-NOPE', sym: 'A', t: 50 }], { minFam: 2 }).length, 1);
});

test('matching: hold = the shortest contributing hold, stop 35% only for a 126-session hold; 3+ version needs three families', () => {
  const a = confluence([{ rule: 'ANOM-52WH', sym: 'A', t: 10 }, { rule: 'EXP-13F2', sym: 'A', t: 12 }], { minFam: 2 });
  assert.equal(a[0].hold, 126); assert.equal(a[0].stop, 0.35);
  const b = confluence([{ rule: 'ANOM-52WH', sym: 'A', t: 10 }, { rule: 'DEC2-TPS', sym: 'A', t: 12 }], { minFam: 2 });
  assert.equal(b[0].hold, 10); assert.equal(b[0].stop, 0.15); assert.deepEqual(b[0].rules, ['ANOM-52WH', 'DEC2-TPS']);
  // a same-family rule in the window still shortens the hold (RESMOM 63 with 52WH 126 and 13F2 126)
  const c = confluence([{ rule: 'ANOM-52WH', sym: 'A', t: 10 }, { rule: 'ANOM-RESMOM', sym: 'A', t: 10 }, { rule: 'EXP-13F2', sym: 'A', t: 11 }], { minFam: 2 });
  assert.equal(c[0].hold, 63); assert.equal(c[0].stop, 0.15);
  const in3 = [{ rule: 'ANOM-52WH', sym: 'A', t: 10 }, { rule: 'B-FCF1', sym: 'A', t: 12 }];
  assert.deepEqual(confluence(in3, { minFam: 3 }), []);
  const three = confluence([...in3, { rule: 'ANOM-SUESURGE', sym: 'A', t: 15 }], { minFam: 3 });
  assert.equal(three.length, 1); assert.equal(three[0].t, 15); assert.equal(three[0].hold, 60);
});

test('one open trade per stock: a fire while the stock is held is dropped; after the sale it may fire again', () => {
  const cands = [{ sym: 'A', t: 10, hold: 10 }, { sym: 'A', t: 15, hold: 10 }, { sym: 'B', t: 15, hold: 10 }, { sym: 'A', t: 25, hold: 10 }];
  const kept = oneOpen(cands, c => c.t + c.hold);   // exit session = t + hold (bought t + 1, sold t + hold)
  assert.deepEqual(kept.map(c => c.sym + c.t), ['A10', 'B15', 'A25']);
  // a stop that sells early lets the next fire through
  assert.deepEqual(oneOpen(cands, c => c.t === 10 ? 12 : c.t + c.hold).map(c => c.sym + c.t), ['A10', 'A15', 'B15', 'A25']);   // A15 sold at 25, A25 buys at 26
  // a candidate that cannot be walked is skipped and blocks nothing
  assert.deepEqual(oneOpen(cands, c => c.t === 10 ? null : c.t + c.hold).map(c => c.sym + c.t), ['A15', 'B15', 'A25']);
});

test('walk: time exit at the close of k + hold - 1; stop sells at the next open; gaps; still open', () => {
  const O = [10, 10, 10, 10, 10, 10], C = [10, 11, 12, 12, 13, 14];
  const w = walk(O, C, 1, 3, 0.15); assert.equal(w.x, 3); assert.equal(w.kind, 'time'); near(w.g, 0.2);
  const O2 = [10, 10, 9, 7, 8, 8], C2 = [10, 9, 8.4, 7.5, 8, 8];   // close 8.4 < 8.5 at session 2 -> sold at the open of 3 (7)
  const s = walk(O2, C2, 1, 5, 0.15); assert.equal(s.kind, 'stop'); assert.equal(s.x, 3); assert.equal(s.atOpen, true); near(s.g, -0.3);
  const s2 = walk(O2, C2, 1, 2, 0.15); assert.equal(s2.kind, 'stop'); assert.equal(s2.x, 2); assert.equal(s2.atOpen, false);   // stop on the last day: that close
  assert.equal(walk([NaN, 10], [10, 10], 0, 2, 0.15), null);   // no buy-day open
  assert.equal(walk(O, C, 3, 5, 0.15).open, true);              // hold runs past the data
  const Cg = [10, 11, NaN, NaN, NaN, NaN, 9]; const g = walk([10, 10, NaN, NaN, NaN, NaN, NaN], Cg, 1, 4, 0.15); assert.equal(g.kind, 'time'); near(g.g, 0.1);   // stock gone: last known close
});

test('cost math: 300 USD at +10% gross = 300 x 9.2% - 6 = 21.60; 1000 USD flat = -14', () => {
  near(tradeUsd(300, 0.10), 21.6, 1e-9); near(tradeUsd(1000, 0), -14, 1e-9); near(tradeUsd(300, 0.02), -2.4, 1e-9);   // +2% gross is a LOSS at 300 USD: the two fees are 2% of the money
  near(tradeUsd(1000, 0.05, { cost: 0.001, fee: 3 }), 43, 1e-9);
});

test('portfolio: slots, liquidity priority, no double position, stop frees the slot at that open; USD adds up', () => {
  const T = 12, flat = (px) => ({ O: Array(T).fill(px), C: Array(T).fill(px) });
  const S = { A: flat(10), B: flat(10), C: flat(10), D: { O: [10, 10, 10, 8, 8, 8, 8, 8, 8, 8, 8, 8], C: [10, 10, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8] } };
  S.A.C = S.A.C.map((x, i) => i >= 4 ? 11 : 10);   // A +10% by the sale
  const cands = [
    { id: 1, sym: 'A', k: 1, liq: 5, hold: 5, stop: 0.15, rule: 'r' },
    { id: 2, sym: 'B', k: 1, liq: 9, hold: 5, stop: 0.15, rule: 'r' },   // more liquid: taken first
    { id: 3, sym: 'C', k: 1, liq: 1, hold: 5, stop: 0.15, rule: 'r' },   // no slot left
    { id: 4, sym: 'B', k: 2, liq: 99, hold: 3, stop: 0.15, rule: 'r' },  // B already held
    { id: 5, sym: 'D', k: 3, liq: 1, hold: 5, stop: 0.15, rule: 'r' } ];
  const r = simulate({ T, cands, series: (s) => S[s], slots: 2, size: 300 });
  assert.deepEqual(r.trades.map(z => z.id).sort(), [1, 2]); assert.equal(r.skipped, 2);   // C and D found no slot (A and B open until session 5)
  const r2 = simulate({ T, cands: cands.concat([{ id: 6, sym: 'C', k: 6, liq: 1, hold: 2, stop: 0.15, rule: 'r' }]), series: (s) => S[s], slots: 2, size: 300 });
  assert.ok(r2.trades.some(z => z.id === 6), 'a slot frees after the time sale at the close of session 5');
  const usd = r.trades.reduce((a, z) => a + z.usd, 0); near(usd, tradeUsd(300, 0.1) + tradeUsd(300, 0)); near(r.eq[T - 1], usd, 1e-9);
  // stop: D bought at 3 (open 8)... use a fresh case: E falls 20% at the close of 2 -> sold at the open of 3, and F (due at the open of 3) takes the slot
  const E = { O: [10, 10, 10, 7, 7, 7, 7, 7, 7, 7, 7, 7], C: [10, 10, 8, 7, 7, 7, 7, 7, 7, 7, 7, 7] };
  const r3 = simulate({ T, cands: [{ id: 'E', sym: 'E', k: 1, liq: 1, hold: 8, stop: 0.15, rule: 'r' }, { id: 'F', sym: 'F', k: 3, liq: 1, hold: 3, stop: 0.15, rule: 'r' }], series: (s) => s === 'E' ? E : flat(10), slots: 1, size: 1000 });
  assert.deepEqual(r3.trades.map(z => z.id), ['E', 'F']); assert.equal(r3.trades[0].x, 3); assert.equal(r3.trades[0].kind, 'stop'); near(r3.trades[0].usd, tradeUsd(1000, -0.3));
  // mirror: the same dollars in a fund on the same sessions
  const fund = { O: Array.from({ length: T }, (_, i) => 100 + i), C: Array.from({ length: T }, (_, i) => 100 + i) };
  const r4 = simulate({ T, cands: [cands[0]], series: (s) => S[s], slots: 1, size: 300, bench: fund });
  near(r4.trades[0].fundUsd, tradeUsd(300, 105 / 101 - 1, { cost: 0.001 })); near(r4.meq[T - 1], r4.trades[0].fundUsd, 1e-9);
  // a position still running at the last session is marked at its last close (cost of the buy already charged), not sold
  const r5 = simulate({ T, cands: [{ id: 'G', sym: 'A', k: 8, liq: 1, hold: 20, stop: 0.15, rule: 'r' }], series: (s) => S[s], slots: 1, size: 300 });
  assert.equal(r5.trades.length, 0); assert.equal(r5.stillOpen, 1); near(r5.avgOpen, 4 / 4);   // held every session from its buy (8) to the end (11) near(r5.eq[T - 1], 300 * (11 / 10 - 1) - 3 - 300 * 0.004);
});

test('curve stats and losing streak', () => {
  const D = ['2024-01-30', '2024-01-31', '2024-02-01', '2024-02-29', '2024-03-01', '2024-03-28'], eq = [0, 10, 5, -20, -10, 30];
  const s = curveStats(eq, D, 0, 5, 600);
  assert.equal(s.months, 3); assert.equal(s.profit, 30); assert.equal(s.worstMonth, -30); assert.equal(s.maxDrawdown, -30); assert.equal(s.worstLosingMonthsInARow, 1); near(s.returnOnCapital, 0.05);
  const ls = losingStreak([{ k: 0, x: 1, usd: -5 }, { k: 0, x: 2, usd: -6 }, { k: 0, x: 3, usd: 4 }, { k: 0, x: 4, usd: -1 }]); assert.deepEqual(ls, { n: 2, usd: -11 });
});

test('library pre-registration is idempotent and adds CONF-2 and CONF-3 only', () => {
  const LB = { strategies: [{ id: 'X' }] }; assert.equal(preRegister(LB), 2); assert.equal(preRegister(LB), 0);
  assert.deepEqual(LB.strategies.map(e => e.id), ['X', 'CONF-2', 'CONF-3']); assert.ok(/BEFORE any run/.test(LB.strategies[1].note));
});
