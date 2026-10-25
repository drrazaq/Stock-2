// Seams: squad20-core.mjs (SQUAD 20, 25 Oct 2026: use the jump differently). One-day moves (artifacts excluded), the AVOID filter window,
// the jump exit (half / all, buy day from the open), the fixed hold and the 15% stop, the spike second setup and its controls, the
// turnover-momentum pick, adoption tests, reporting and the idempotent library pre-registration. Run: node --test test/squad20-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, A_IDS, B_IDS, TRADE_IDS, BASES, dayMove, jumpBefore, exitDay, exitOverlay, holdFrom, holdStop, spikesOf, halfLevel, spikeSignals, spikeControls,
  stmomPick, turnover, groupReport, paired, perYearOf, byYear, adoptFilter, adoptExit, preRegister, halfOf } from '../squad20-core.mjs';
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('registry: 18 filters, 36 exits, 3 trade rules; holds from the base rules', () => {
  assert.equal(A_IDS.length, 18); assert.equal(B_IDS.length, 36); assert.deepEqual(TRADE_IDS, ['SQ20-SPIKE2', 'SQ20-STMOM-1000', 'SQ20-STMOM-500']);
  assert.equal(IDS.length, 57); for (const id of IDS) { assert.ok(id.startsWith('SQ20-')); assert.ok(RULES[id].rule.length > 60, id); }
  assert.equal(RULES['SQ20-AV40-PB12'].hold, 126); assert.equal(RULES['SQ20-AV25-GOLD'].hold, 20); assert.equal(RULES['SQ20-XA40-SUESURGE'].hold, 60); assert.equal(RULES['SQ20-XH25-QMOM'].part, 0.5);
  assert.equal(Object.keys(BASES).length, 9); assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('dayMove: close over the last close (gaps up to 5 sessions); artifacts and missing closes are not moves', () => {
  const c = [10, 10, 14, NaN, 21, 30];
  assert.ok(near(dayMove(c, 2), 0.4)); assert.equal(dayMove(c, 3), null); assert.ok(near(dayMove(c, 4), 0.5)); assert.equal(dayMove(c, 0), null);
  assert.equal(dayMove(c, 2, new Set([2])), null); assert.equal(dayMove(c, 2, [2]), null);
});

test('AVOID filter: the signal close and the 9 sessions before it; the threshold is inclusive', () => {
  const c = Array.from({ length: 30 }, () => 10); c[5] = 14; for (let q = 6; q < 30; q++) c[q] = 14;   // +40% at session 5
  assert.equal(jumpBefore(c, 14, 0.40).q, 5); assert.equal(jumpBefore(c, 15, 0.40), null, '5 is 11 sessions back from 15');
  assert.equal(jumpBefore(c, 4, 0.40), null, 'not yet happened'); assert.ok(jumpBefore(c, 10, 0.25)); assert.equal(jumpBefore(c, 10, 0.41), null);
});

test('jump exit: first holding close with a +25% move; buy day measured from the open; never on the planned sell day', () => {
  const S = { o: [10, 10, 10, 10, 13, 10], c: [10, 10, 10, 13, 13, 17] };   // k=1, x=5; +30% at 3, +30.8% at 5 (sell day)
  assert.equal(exitDay(S, 1, 5, 0.25), 3); assert.equal(exitDay(S, 4, 5, 0.25), -1, 'the move at x is the planned sale');
  const S2 = { o: [10, 13, 13], c: [10, 13.5, 13.5] };   // gap to 13 at the open of 1, closes 13.5: only +3.8% held on the buy day
  assert.equal(exitDay(S2, 1, 2, 0.25), -1);
  const S3 = { o: [10, 10, 13], c: [10, 13, 13] }; assert.equal(exitDay(S3, 1, 2, 0.25), 1, '+30% from the buy open on the buy day');
  const tr = { k: 1, x: 5, px0: 10, g: 0.7 }, h = exitOverlay(S, tr, 0.25, 0.5), a = exitOverlay(S, tr, 0.25, 1);
  assert.ok(near(h.g, 0.5 * 0.3 + 0.5 * 0.7)); assert.ok(near(a.g, 0.3)); assert.equal(a.q, 3); assert.equal(exitOverlay(S, tr, 0.5, 1), null);
});

test('holdFrom: sell at the close of session hold; gone stocks at their last close; open past the data', () => {
  const S = { o: [10, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], c: [10, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] };
  const r = holdFrom(S, 1, 11, 12, 3); assert.equal(r.x, 3); assert.ok(near(r.g, 0.2)); assert.equal(r.kind, 'max');
  assert.ok(holdFrom(S, 9, 11, 12, 5).open); const g = holdFrom(S, 1, 4, 12, 6); assert.equal(g.kind, 'gone'); assert.equal(g.x, 4);
});

test('holdStop: a close 15% under the buy -> next open; no stop -> the hold; data end -> open', () => {
  const S = { o: [10, 10, 9, 8.4, 8, 8, 8, 8, 8, 8, 8, 8], c: [10, 9.5, 8.6, 8.4, 8, 8, 8, 8, 8, 8, 8, 8] };
  const r = holdStop(S, 1, 11, 12, 6, 0.15); assert.equal(r.kind, 'stop'); assert.equal(r.x, 4, 'close 8.4 at 3 (-16%) -> open of 4'); assert.ok(near(r.g, -0.2));
  const U = { o: Array(12).fill(10), c: Array(12).fill(10.5) }; const u = holdStop(U, 1, 11, 12, 5, 0.15); assert.equal(u.kind, 'max'); assert.equal(u.x, 5);
  const E = { o: Array(12).fill(10), c: [...Array(11).fill(10), 8] }; assert.ok(holdStop(E, 8, 11, 12, 10, 0.15).open);
});

// a spike path: flat 2.00 for 60 sessions (volume 100k), +50% at 60 (3.00), holds 2.6-2.8 quietly, breakout at t
function spikePath(breakAt = 75, holdLow = 2.6) { const n = 110, c = [], l = [], v = [];
  for (let q = 0; q < n; q++) { let x = 2, vol = 1e5; if (q === 60) { x = 3; vol = 2e6; } else if (q > 60) { x = q % 2 ? 2.8 : holdLow; vol = 6e4; }
    if (q === breakAt) { x = 3.2; vol = 6e5; } if (q > breakAt) x = 3.1; c.push(x); l.push(x * 0.99); v.push(vol); }
  return { c, l, v }; }
test('spike second setup: held half, quiet, no lower low, breakout on 1.5x volume at 10-30 sessions; first signal only', () => {
  const S = spikePath(75), sp = spikesOf(S.c); assert.deepEqual(sp, [60]); assert.ok(near(halfLevel(S.c, 60), 2.5));
  const sig = spikeSignals(S, sp, () => true); assert.deepEqual(sig, [{ s: 60, t: 75 }]);
  assert.deepEqual(spikeSignals(spikePath(65), sp, () => true), [], 'breakout before s+10 does not count');
  assert.deepEqual(spikeSignals(spikePath(95), sp, () => true), [], 'after s+30 too late');
  const failed = spikePath(75, 2.4); assert.deepEqual(spikeSignals(failed, spikesOf(failed.c), () => true), [], 'closed under the half-gain level');
  assert.deepEqual(spikeSignals(S, sp, () => false), [], 'eligibility gate');
  const loud = spikePath(75); for (let q = 64; q < 75; q++) loud.v[q] = 3e5; assert.deepEqual(spikeSignals(loud, sp, () => true), [], 'volume did not dry up');
  const ll = spikePath(75); ll.l[72] = 1.9; assert.deepEqual(spikeSignals(ll, sp, () => true), [], 'lower low in the last 10');
  const low = { c: [0.5, 0.5, 0.8, 0.8], l: [], v: [] }; assert.deepEqual(spikesOf(low.c), [], 'prior close under 1 USD');
});

test('spike controls: bought at s+21, held or not', () => {
  const S = spikePath(200), ctl = spikeControls(S.c, [60], () => true); assert.deepEqual(ctl, [{ s: 60, t: 80, held: true }]);
  const F = spikePath(200, 2.4); assert.equal(spikeControls(F.c, [60], () => true)[0].held, false);
  assert.deepEqual(spikeControls(S.c, [60, 70], () => true).length, 1, 'a newer spike before s+20 drops the first');
});

test('stmomPick: in both top deciles; turnover needs shares and 15 volume days', () => {
  const rows = Array.from({ length: 100 }, (_, i) => ({ key: i, r: i / 100, to: i % 2 ? i : 100 - i }));
  // top 10 by r = 90..99; top 10 by to: odd i 91..99 (to = i) and even i small (to = 100 - i): 0, 2, 4, 6, 8 -> to 100, 98, 96, 94, 92; odd 99, 97, 95, 93, 91
  assert.deepEqual(stmomPick(rows), [99, 97, 95, 93, 91]); assert.deepEqual(stmomPick(rows.slice(0, 40)), []);
  const v = Array(30).fill(1000); assert.equal(turnover(v, 0, 20, 10000), 2.1); assert.equal(turnover(v, 0, 10, 10000), null); assert.equal(turnover(v, 0, 20, 0), null);
});

test('reporting and adoption rules', () => {
  const rows = [{ g: 0.1, c: 0.05, spy: 0.02, days: 63, sig: '2022-01-03' }, { g: -0.1, c: 0.0, spy: 0.01, days: 63, sig: '2022-05-02' }, { g: 0.3, c: 0.1, spy: 0.03, days: 63, sig: '2024-02-01' }];
  const g = groupReport(rows); assert.equal(g.n, 3); assert.ok(near(g.avg, 0.1 - 0.008)); assert.ok(near(g.edge, (0.05 - 0.1 + 0.2) / 3, 1e-4));
  assert.ok(near(perYearOf(rows, 'g', 0.008), (0.3 - 0.024) / 0.75)); assert.equal(Object.keys(byYear(rows)).join(), '2022,2024');
  const p = paired([{ g: 0.2, base: 0.1 }, { g: 0.0, base: 0.1 }, { g: 0.3, base: 0.1 }]); assert.equal(p.n, 3); assert.ok(near(p.diff, 0.2 / 3, 1e-4)); assert.ok(near(p.better, 0.6667, 1e-4));
  const R = (n, avg, edge) => ({ n, avg, edge });
  assert.equal(adoptFilter({ older: R(6, -0.05, -0.04), newer: R(8, 0.0, -0.01) }, { older: R(90, 0.1, 0.02), newer: R(200, 0.08, 0.01) }, { older: 0.2, newer: 0.3 }, { older: 0.19, newer: 0.3 }).adopt, true);
  assert.equal(adoptFilter({ older: R(6, -0.05, -0.04), newer: R(8, 0.07, -0.01) }, { older: R(90, 0.1, 0.02), newer: R(200, 0.08, 0.01) }, { older: 0.2, newer: 0.3 }, { older: 0.19, newer: 0.3 }).adopt, false, 'gap under 2 points');
  assert.equal(adoptFilter({ older: R(3, -0.5, -0.4), newer: R(8, -0.1, -0.1) }, { older: R(90, 0.1, 0.02), newer: R(200, 0.08, 0.01) }, { older: 0.2, newer: 0.3 }, { older: 0.19, newer: 0.3 }).adopt, false, 'too few removed');
  assert.equal(adoptFilter({ older: R(6, -0.05, 0.01), newer: R(8, -0.1, -0.1) }, { older: R(90, 0.1, 0.02), newer: R(200, 0.08, 0.01) }, { older: 0.2, newer: 0.3 }, { older: 0.19, newer: 0.3 }).adopt, false, 'removed beat the average stock');
  assert.equal(adoptExit({ older: { n: 12, diff: 0.01 }, newer: { n: 15, diff: 0.02 } }, { older: 0.2, newer: 0.3 }, { older: 0.2, newer: 0.29 }).adopt, true);
  assert.equal(adoptExit({ older: { n: 12, diff: 0.01 }, newer: { n: 15, diff: -0.02 } }, { older: 0.2, newer: 0.3 }, { older: 0.2, newer: 0.29 }).adopt, false);
  assert.equal(adoptExit({ older: { n: 9, diff: 0.01 }, newer: { n: 15, diff: 0.02 } }, { older: 0.2, newer: 0.3 }, { older: 0.2, newer: 0.29 }).adopt, false);
});

test('preRegister: idempotent, every rule once, exits marked as exits', () => {
  const LB = { strategies: [{ id: 'X' }] }; assert.equal(preRegister(LB), 57); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, 58);
  assert.equal(LB.strategies.find(e => e.id === 'SQ20-XA40-PB12').kind, 'exit'); assert.equal(LB.strategies.find(e => e.id === 'SQ20-SPIKE2').kind, 'buy');
  assert.ok(/pre-registered 2026-10-25/.test(LB.strategies.find(e => e.id === 'SQ20-STMOM-500').status));
});
