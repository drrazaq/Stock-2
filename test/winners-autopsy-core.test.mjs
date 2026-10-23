// Seams of the WINNER AUTOPSY (winners-autopsy-core.mjs, pure; winners-autopsy-lab.mjs does the reading and writing):
//   featureSeries(...)        price/volume precursors known at each close (averages, 52-week high, drawdown, tightness, up days, volume, path)
//   flagMask / maskOf         the registered yes/no precursors as a bit mask
//   findEpisodes(...)         winners: 30%+ over a 1-10 session window, start = the session after the lowest close, universe at the base
//   realisticEntry(...)       the first knowable entry (next open after the first +10% close) and what was left of the move
//   pickControls(...)         5 look-alikes: same industry first, nearest price / volatility / market value
//   comboTable / clearlyMoreOften   winners vs controls per flag and per 2-3 flag combination, with counts, lift and z
//   walkExit / ruleTrades     the fixed exits (8% stop + 10-session time exit; 8% then 10% trailing stop, 20 sessions max) and fresh signals
//   boardStats(...)           the paper board numbers and the READY rule (30+ trades, 10+ days, positive after 0.8%)
// Run: node test/winners-autopsy-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { featureSeries, flagMask, maskOf, namesOf, has, findEpisodes, realisticEntry, pickControls, comboTable, clearlyMoreOften, walkExit, ruleTrades, boardStats, countIn, inUniverse, FLAGS, COST } from '../winners-autopsy-core.mjs';

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) < e, a + ' vs ' + b);
const series = (closes, vol = 1e6) => ({ o: closes.slice(), h: closes.map(x => x * 1.01), l: closes.map(x => x * 0.99), c: closes.slice(), v: closes.map(() => vol) });

test('averages, 52-week high, 6-month drawdown: only closes up to the day', () => {
  const c = Array.from({ length: 260 }, (_, t) => 10 + t * 0.1);   // a steady rise 10 -> 35.9
  const F = featureSeries(series(c)), t = 259;
  near(F.d20[t], c[t] / (c.slice(t - 19, t + 1).reduce((a, b) => a + b) / 20) - 1);
  near(F.d200[t], c[t] / (c.slice(t - 199, t + 1).reduce((a, b) => a + b) / 200) - 1);
  near(F.hi52[t], 0); near(F.dd6m[t], 0);
  assert.ok(Number.isNaN(F.d200[100]));                                // not 200 sessions yet
  const c2 = c.slice(); c2[259] = 20;                                  // a fall on the last day
  const F2 = featureSeries(series(c2)); near(F2.hi52[259], 20 / c[258] - 1); near(F2.dd6m[259], 20 / c[258] - 1);
  assert.equal(featureSeries(series(c2)).d50[258], F.d50[258]);        // the last day changes nothing before it
});

test('tightness, up days, volume vs average, volume trend', () => {
  const c = [...Array(30).fill(10), 10.2, 10.1, 10.3, 10.4, 10.2, 10.5, 10.6, 10.5, 10.7, 10.8];   // last 10: range 10.1..10.8
  const v = [...Array(35).fill(100), 300, 300, 300, 300, 400];
  const F = featureSeries({ o: c, h: c, l: c, c, v }), t = 39;
  near(F.tight10[t], (10.8 - 10.1) / 10.8);
  assert.equal(F.up10[t], 7);                                          // sessions 30-39: 10.2 up, 10.1 down, 10.3 up, 10.4 up, 10.2 down, 10.5 up, 10.6 up, 10.5 down, 10.7 up, 10.8 up
  near(F.vRel[t], 400 / ((15 * 100 + 4 * 300 + 100) / 20));           // sessions 19..38: 16 x 100, 4 x 300
  near(F.vTrend[t], ((4 * 300 + 400) / 5) / 100);
});

test('the path of the prior gain: one big jump vs many small steps; median dollar volume counts a missing day as 0', () => {
  const steps = Array.from({ length: 41 }, (_, t) => 10 * Math.pow(1.01, t)), jump = [...Array(30).fill(10), ...Array(11).fill(13)];
  const A = featureSeries(series(steps)), B = featureSeries(series(jump));
  near(A.bigDay20[40], 0.01, 1e-9); near(A.jumpShare[40], 0.05, 1e-6);   // 20 equal steps: each 1/20 of the gain
  near(B.bigDay20[40], 0.3, 1e-9); near(B.jumpShare[40], 1, 1e-9);       // one +30% day (session 30, inside the last 20) made all the gain
  const B1 = featureSeries(series([...Array(10).fill(10), ...Array(31).fill(13)])); near(B1.bigDay20[40], 0, 1e-12);   // the jump is 31 sessions back: outside
  const B2 = featureSeries(series([...Array(30).fill(10), ...Array(5).fill(13)])); near(B2.bigDay20[34], 0.3, 1e-9); near(B2.jumpShare[34], 1, 1e-9);
  const c = Array(20).fill(10); c[5] = NaN; const v = Array(20).fill(300000);   // 3M a day, one day without a bar
  const F = featureSeries({ o: c, h: c, l: c, c, v }); near(F.dvMed20[19], 3e6); assert.equal(inUniverse(10, F.dvMed20[19]), true);
  assert.equal(inUniverse(0.9, 5e6), false); assert.equal(inUniverse(2, 1.9e6), false);
});

test('flags: registered thresholds as bits; unknown values switch a flag off', () => {
  const f = { c: 4, d50: 0.05, d200: -0.3, hi52: -0.5, dd6m: -0.45, tight10: 0.05, up10: 7, vRel: 2.5, vTrend: 1.6, r5: 0.12, r20: 0.2, jumpShare: 0.2, bigDay20: 0.05, vol20: 0.07 };
  const m = flagMask(f, { earnNext5: true, k8: 1, dil: 0, d13: 0, f4: 3, sectorEx: 0.06, mktUp: true, mcap: 2e8 });
  const on = namesOf(m);
  for (const n of ['ABOVE_50', 'BELOW_200_20', 'DEEP_DRAWDOWN', 'TIGHT_10D', 'MANY_UP_DAYS', 'VOLUME_SURGE', 'VOLUME_RISING', 'UP_10PCT_5D', 'SMALL_STEPS', 'EARNINGS_NEXT_5D', 'FILED_8K_10D', 'INSIDER_FORMS_10D', 'SECTOR_HOT', 'MARKET_UP', 'UNDER_5USD', 'MICRO_CAP', 'HIGH_VOLATILITY']) assert.ok(on.includes(n), n);
  for (const n of ['ABOVE_200', 'NEAR_52W_HIGH', 'LOOSE_10D', 'FEW_UP_DAYS', 'BIG_JUMP_20D', 'DILUTION_FILING_30D', 'FILED_13D_30D', 'EARNINGS_LAST_10D', 'SECTOR_COLD']) assert.ok(!on.includes(n), n);
  assert.equal(flagMask({ c: NaN }, {}), 0);
  assert.equal(namesOf(flagMask({ c: 10 }, { mcap: null })).includes('MICRO_CAP'), false);
  const combo = maskOf(['ABOVE_50', 'VOLUME_SURGE']); assert.ok(has(m, combo)); assert.ok(!has(m, maskOf(['ABOVE_200']))); assert.throws(() => maskOf(['NOPE']));
  assert.ok(FLAGS.length <= 31);
  assert.equal(countIn([2, 5, 9, 12], 5, 11), 2); assert.equal(countIn([], 0, 9), 0);
});

test('winner episodes: start after the lowest close, 30%+ within 10 sessions, inside the window, universe at the base, one per 10 sessions', () => {
  //          0   1   2   3   4   5   6   7   8   9  10  11  12  13  14  15  16  17
  const c = [10, 10, 9, 9.5, 10, 11, 12, 12.5, 11, 11, 11, 11, 11, 11, 11, 11, 11, 11];
  const E = findEpisodes(c, 0, 17, () => true);
  assert.equal(E.length, 1); assert.equal(E[0].b, 2); assert.equal(E[0].s, 3); assert.equal(E[0].e, 6); near(E[0].gain, 12.5 / 9 - 1); assert.equal(E[0].peakT, 7);
  assert.equal(findEpisodes(c, 4, 17, () => true).length, 0);          // the move started before the window
  assert.equal(findEpisodes(c, 0, 17, (b) => b !== 2).length, 0);      // not in the universe at the base close
  const slow = Array.from({ length: 30 }, (_, t) => 10 * Math.pow(1.02, t));   // +2% a day: 10 sessions = +21.9%, never 30% in 10
  assert.equal(findEpisodes(slow, 0, 29, () => true).length, 0);
  const two = [10, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 13.5, 18, 18, 18];   // two separate jumps
  assert.deepEqual(findEpisodes(two, 0, 15, () => true).map(x => x.s), [1, 13]);
});

test('realistic entry: next open after the first +10% close; what was left of the move', () => {
  const c = [10, 10, 10.5, 11.2, 12, 13, 12.5, 12, 12, 12, 12, 12, 12], o = c.map((x, t) => t ? c[t - 1] * 1.01 : x);
  const ep = findEpisodes(c, 0, 12, () => true)[0]; assert.equal(ep.s, 2);
  const r = realisticEntry({ o, c }, ep);
  assert.equal(r.momentum.signalT, 3); assert.equal(r.momentum.te, 4); near(r.momentum.entry, 11.2 * 1.01); near(r.momentum.left, 13 / (11.2 * 1.01) - 1); near(r.momentum.atEnd, 12 / (11.2 * 1.01) - 1);
  const p = realisticEntry({ o, c }, ep, 0); near(p.precursor.left, 13 / o[1] - 1);
});

test('controls: same industry first, nearest price / volatility / market value; others fill a short list', () => {
  const w = { i: 0, px: 10, vol: 0.05, mcap: 5e8, sec: '28' };
  const cands = [{ i: 1, px: 10, vol: 0.05, mcap: 5e8, sec: '28' }, { i: 2, px: 30, vol: 0.05, mcap: 5e8, sec: '28' }, { i: 3, px: 10, vol: 0.05, mcap: 5e8, sec: '73' }, { i: 4, px: 11, vol: 0.06, mcap: null, sec: '28' }, { i: 0, px: 10, vol: 0.05, mcap: 5e8, sec: '28' }];
  const p = pickControls(w, cands, 5);
  assert.deepEqual(p.map(x => x.i), [1, 4, 2, 3]);                    // 3 of the same industry by distance, then one from another
  assert.equal(p[3].sameSector, false); assert.equal(p[0].dist, 0);
  assert.deepEqual(pickControls(w, cands, 2).map(x => x.i), [1, 4]);
});

test('combinations: counted when all flags were on together on one of the 10 days; clearly-more-often needs counts, lift, z and added value', () => {
  const A = maskOf(['VOLUME_SURGE']), B = maskOf(['ABOVE_50']), Cm = maskOf(['TIGHT_10D']);
  const win = [...Array(40).fill({ days: [A | B, 0] }), ...Array(10).fill({ days: [A, B] }), ...Array(50).fill({ days: [Cm] })];
  const ctrl = [...Array(20).fill({ days: [A | B] }), ...Array(80).fill({ days: [A, B] }), ...Array(250).fill({ days: [Cm] }), ...Array(150).fill({ days: [0] })];
  const T = comboTable(win, ctrl, { maxK: 3 }), get = (m) => T.find(r => r.mask === m);
  assert.equal(get(A | B).w, 40); assert.equal(get(A | B).c, 20);    // the 10 winners with A and B on different days do not count
  assert.equal(get(A).w, 50); assert.equal(get(A).c, 100);
  near(get(A | B).lift, 0.4 / (20.5 / 501), 1e-3);
  const sel = clearlyMoreOften(T, { minW: 10 }).map(r => r.flags.join('+'));
  assert.ok(sel.includes('ABOVE_50+VOLUME_SURGE')); assert.ok(sel.includes('VOLUME_SURGE')); assert.ok(!sel.includes('TIGHT_10D'));   // TIGHT: 50% of winners, 50% of controls
});

test('exit S8T10: stop at 8% under the entry open, a gap under it sells at the open, else the 10th close', () => {
  const base = { o: Array(15).fill(10), h: Array(15).fill(10.2), l: Array(15).fill(9.9), c: Array(15).fill(10) };
  const r = walkExit({ ...base, c: base.c.map((x, k) => k === 10 ? 11 : x) }, 1, 'S8T10'); assert.equal(r.x, 10); near(r.g, 0.1); assert.equal(r.why, 'time');
  const s = { ...base, l: base.l.map((x, k) => k === 3 ? 9.1 : x) }; const rs = walkExit(s, 1, 'S8T10'); assert.equal(rs.x, 3); near(rs.g, -0.08); assert.equal(rs.why, 'stop');
  const g = { ...base, o: base.o.map((x, k) => k === 4 ? 8.5 : x), l: base.l.map((x, k) => k === 4 ? 8.4 : x) }; const rg = walkExit(g, 1, 'S8T10'); near(rg.g, -0.15); assert.equal(rg.why, 'gap under stop');
  assert.deepEqual(walkExit(base, 8, 'S8T10').open, true);              // the data ends before the 10th session
  assert.equal(walkExit({ ...base, o: base.o.map((x, k) => k === 1 ? NaN : x) }, 1, 'S8T10'), null);
  const dead = { o: [10, 10, 10, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN, NaN], h: [10, 10, 10, ...Array(10).fill(NaN)], l: [10, 9.9, 9.5, ...Array(10).fill(NaN)], c: [10, 9.9, 9.5, ...Array(10).fill(NaN)] };
  const rd = walkExit(dead, 1, 'S8T10'); near(rd.g, -0.05); assert.equal(rd.x, 2);   // delisted: valued at its last close
});

test('exit TRAIL: the stop follows 10% under the highest close and never falls; at most 20 sessions', () => {
  const c = [10, 10, 11, 12, 13, 12.5, 11.6, 12, 12, 12, ...Array(15).fill(12)], o = c.map((x, k) => k ? c[k - 1] : x), h = c.map(x => x * 1.005), l = c.map((x, k) => k === 6 ? 11.6 : x * 0.995);
  const r = walkExit({ o, h, l, c }, 1, 'TRAIL'); assert.equal(r.x, 6); near(r.g, 13 * 0.9 / 10 - 1, 1e-9); assert.equal(r.why, 'trailing stop');
  const flat = { o: Array(30).fill(10), h: Array(30).fill(10.1), l: Array(30).fill(9.9), c: Array(30).fill(10) };
  const rf = walkExit(flat, 1, 'TRAIL'); assert.equal(rf.x, 20); assert.equal(rf.why, 'time');
});

test('rule trades: only fresh signals, in the universe, one open trade per stock', () => {
  const n = 40, px = { o: Array(n).fill(10), h: Array(n).fill(10.1), l: Array(n).fill(9.9), c: Array(n).fill(10) }, M = maskOf(['VOLUME_SURGE']);
  const masks = new Uint32Array(n); for (const t of [3, 4, 5, 8, 20, 30]) masks[t] = M;
  const tr = ruleTrades(px, masks, (t) => t !== 20, M, 'S8T10', 1, 38);
  assert.deepEqual(tr.map(z => z.t), [3, 30]);                         // 4,5 not fresh; 8 inside the trade from 3 (exit 13); 20 not in the universe
  assert.equal(tr[1].open, true);
});

test('board: n, days, stocks, win rate, average after 0.8%, average win / loss, profit factor; READY at 30+ trades on 10+ days and positive', () => {
  const tr = [{ g: 0.108, day: 'a', sym: 'X' }, { g: -0.042, day: 'a', sym: 'Y' }, { g: 0.008, day: 'b', sym: 'X' }];
  const b = boardStats(tr);
  assert.equal(b.n, 3); assert.equal(b.days, 2); assert.equal(b.stocks, 2); near(b.win, 0.3333, 1e-4); near(b.avg, (0.1 - 0.05 + 0) / 3, 1e-4);
  near(b.avgWin, 0.1); near(b.avgLoss, -0.025); near(b.pf, 0.1 / 0.05); assert.equal(b.ready, false);
  const many = Array.from({ length: 30 }, (_, k) => ({ g: 0.03, day: 'd' + (k % 12), sym: 'S' + k })); assert.equal(boardStats(many).ready, true);
  assert.equal(boardStats(many.map(z => ({ ...z, day: 'd' + (+z.day.slice(1) % 9) }))).ready, false);   // only 9 days
  assert.equal(COST, 0.008);
});
