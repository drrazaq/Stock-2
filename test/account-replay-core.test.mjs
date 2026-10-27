// Seams: account-replay-core.mjs (27 Oct 2026): the 2-slot TRY SMALL account (slots, 1,000 USD tickets, whole shares, costs, the
// 10-result switch-off, duplicate skip, priority order), buy-and-hold, drawdown, compound return, calendar years, the entry-shift stats.
// Run: node --test test/account-replay-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, MAIN_IDS, liveStopOf, ledgerOff, netOf, sharesFor, simulate, buyHold, maxDrawdown, cagr, calendarYears, shuffleWithin, rng, shiftStats, pct } from '../account-replay-core.mjs';
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const D = Array.from({ length: 30 }, (_, i) => '2024-01-' + String(i + 1).padStart(2, '0'));

test('frozen policy: scan.mjs src order, SUESURGE info only, live stops 35% over hold 100 else 15%', () => {
  assert.deepEqual(MAIN_IDS, ['B-FCF1', 'DEC-FROG', 'ANOM-RESMOM', 'MACRO-GOLD-S20', 'MACRO-USD-E60', 'SQ6-MTUM', 'SQ6-QMOM', 'SQ11-PB12']);
  assert.equal(RULES.find(r => r.id === 'ANOM-SUESURGE').infoOnly, true);
  for (const r of RULES) assert.equal(r.liveStop, liveStopOf(r.hold), r.id);
});

test('ledgerOff: 10+ finished results with a negative average', () => {
  assert.equal(ledgerOff(Array(9).fill(-0.1)), false); assert.equal(ledgerOff(Array(10).fill(-0.1)), true);
  assert.equal(ledgerOff([...Array(9).fill(-0.1), 1]), false);
});

test('cost and whole shares', () => {
  assert.ok(near(netOf(100, 110, 0.008), 110 * 0.996 / (100 * 1.004) - 1)); assert.equal(sharesFor(1000, 100, 0.008), 9); assert.equal(sharesFor(1000, 99, 0), 10); assert.equal(sharesFor(1000, 1500, 0.008), 0);
});

test('account: max 2 open, priority order, full-slot skips, duplicate skip, exits free the slot next session', () => {
  const px = { A: 100, B: 50, C: 20, E: 10 }, closeOf = (s) => px[s];
  const cands = [
    { id: 'R2', sym: 'C', k: 1, x: 5, px0: 20, px1: 22, exitAt: 'c', ord: 0 },
    { id: 'R1', sym: 'A', k: 1, x: 3, px0: 100, px1: 110, exitAt: 'c', ord: 0 },
    { id: 'R1', sym: 'B', k: 1, x: 6, px0: 50, px1: 40, exitAt: 'c', ord: 1 },
    { id: 'R2', sym: 'B', k: 4, x: 8, px0: 50, px1: 60, exitAt: 'c', ord: 0 },   // B still held -> skipped (held)
    { id: 'R2', sym: 'E', k: 3, x: 8, px0: 10, px1: 12, exitAt: 'c', ord: 0 },   // A sells at the close of 3: slot not yet free at the open of 3
    { id: 'R2', sym: 'E', k: 4, x: 9, px0: 10, px1: 12, exitAt: 'c', ord: 0 },   // free at the open of 4
  ];
  const s = simulate({ cands, D, closeOf, start: 0, end: 12, priority: ['R1', 'R2'], cost: 0 });
  assert.equal(s.perRule.R1.taken, 2); assert.equal(s.perRule.R2.taken, 1); assert.equal(s.skipped.fullSlots, 2); assert.equal(s.skipped.held, 1);
  // A: 10 sh x +10 = +100; B: 20 sh x -10 = -200; E: 100 sh x +2 = +200 (the cash after A's sale was 1,100 -> still a 1,000 ticket)
  assert.equal(s.realised, 100); assert.equal(s.v1, 2000 + 100 - 200 + 200); assert.equal(s.closedTrades, 3);
});

test('account: ticket = remaining cash when below 1,000; too expensive is skipped', () => {
  const cands = [{ id: 'R', sym: 'A', k: 0, x: 2, px0: 100, px1: 50, exitAt: 'c' }, { id: 'R', sym: 'B', k: 3, x: 5, px0: 10, px1: 10, exitAt: 'c' }, { id: 'R', sym: 'C', k: 3, x: 5, px0: 10, px1: 10, exitAt: 'c' }, { id: 'R', sym: 'Z', k: 6, x: 8, px0: 5000, px1: 5000, exitAt: 'c' }];
  const s = simulate({ cands, D, closeOf: () => 10, start: 0, end: 9, priority: ['R'], cost: 0 });
  const tr = s.closed; assert.equal(tr[0].pnl, -500); assert.equal(tr[1].shares, 100); assert.equal(tr[2].shares, 50, 'only 500 left'); assert.equal(s.skipped.tooExpensive, 1);
});

test('account: a rule switches off after 10 losing results, stays on otherwise', () => {
  const cands = []; for (let j = 0; j < 12; j++) cands.push({ id: 'L', sym: 'S' + j, k: 2 * j, x: 2 * j, px0: 10, px1: 9, exitAt: 'c' });
  const s = simulate({ cands, D, closeOf: () => 9, start: 0, end: 29, priority: ['L'], cost: 0 });
  assert.equal(s.perRule.L.taken, 10); assert.equal(s.skipped.ruleOff, 2);
});

test('account: a stop sale at the open does not free the slot for that same open', () => {
  const cands = [{ id: 'R', sym: 'A', k: 0, x: 3, px0: 10, px1: 8, exitAt: 'o' }, { id: 'R', sym: 'B', k: 0, x: 9, px0: 10, px1: 10, exitAt: 'c' }, { id: 'R', sym: 'C', k: 3, x: 9, px0: 10, px1: 10, exitAt: 'c' }, { id: 'R', sym: 'E', k: 4, x: 9, px0: 10, px1: 10, exitAt: 'c' }];
  const s = simulate({ cands, D, closeOf: () => 10, start: 0, end: 9, priority: ['R'], cost: 0 });
  assert.equal(s.skipped.fullSlots, 1); assert.deepEqual(s.closed.map(z => z.sym).sort(), ['A', 'B', 'E']);
});

test('open positions at the end are marked at the last close (unrealised)', () => {
  const s = simulate({ cands: [{ id: 'R', sym: 'A', k: 0, x: null, px0: 10, px1: null, exitAt: 'c' }], D, closeOf: () => 12, start: 0, end: 4, priority: ['R'], cost: 0 });
  assert.equal(s.unrealised, 200); assert.equal(s.v1, 2200); assert.equal(s.perRule.R.open, 1);
});

test('buy and hold, drawdown, compound return, calendar years', () => {
  const o = [100, 100, 100], c = [100, 90, 120], b = buyHold({ o, c, D, start: 0, end: 2, cost: 0 });
  assert.equal(b.v1, 2400); assert.ok(near(b.maxDD, -0.1));
  assert.ok(near(maxDrawdown([1, 2, 1, 3, 1.5]), -0.5)); assert.ok(near(cagr(100, 121, 504), 0.1));
  assert.deepEqual(calendarYears([{ d: '2023-12-29', v: 110 }, { d: '2024-01-02', v: 121 }], 100), { 2023: 0.1, 2024: 0.1 });
});

test('shuffleWithin keeps each rule/day group and only reorders it; shiftStats nets after cost', () => {
  const cands = [{ id: 'A', k: 1, sym: 'x' }, { id: 'A', k: 1, sym: 'y' }, { id: 'B', k: 1, sym: 'z' }], s = shuffleWithin(cands, rng(3));
  assert.equal(s.length, 3); assert.deepEqual(s.filter(c => c.id === 'A').map(c => c.ord).sort(), [0, 1]);
  const st = shiftStats([{ g: 0.1 }, { g: -0.1 }], 0.012); assert.equal(st.n, 2); assert.ok(near(st.avg, ((1.1 * 0.994 / 1.006 - 1) + (0.9 * 0.994 / 1.006 - 1)) / 2, 1e-4));
  assert.equal(pct([3, 1, 2], 0.5), 2);
});
