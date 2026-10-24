// Seams: squad8-core.mjs (SQUAD 8, 24 Oct 2026: path edge and share supply). Runner base, overnight / intraday split, tug-of-war count,
// up/down volume, orderliness, confirmed breakouts, point-in-time share counts (30 days late, stale guard, split guard), reverse splits,
// the ten rule checks and the idempotent library pre-registration. Pure functions, no network, no files.
// Run: node test/squad8-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, TH, HOLD, runnerAt, gainAt, pathSplit, tugCount, upDownVol, orderly, turnover, priorHigh, breakoutAt, breakoutSeries, hold3At, splitFix, sharesKnownAt, shareChange,
  reverseSplitWithin, spacLike, passes, ownAverage, boardStats, paperReady, preRegister, halfOf, capG } from '../squad8-core.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('registry: 10 rules, ids SQ8-*, hold 20, every rule has a rule text, a linked paper and a library check', () => {
  assert.equal(IDS.length, 10); assert.equal(HOLD, 20);
  for (const id of IDS) { const r = RULES[id]; assert.ok(id.startsWith('SQ8-')); assert.ok(r.rule.length > 80, id); assert.ok(r.papers.some(p => /^https:\/\//.test(p.url)), id); assert.ok(r.lib, id); assert.ok(['path', 'shares', 'ipo', 'shares+splits'].includes(r.family), id); }
});

test('runner: first session the 10-session gain crosses +15% (and stays <= +100%), complete data only', () => {
  const c = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 110, 116], o = c.map(x => x);
  assert.equal(runnerAt(c, o, 11), null, '+10%: not yet');
  assert.ok(near(runnerAt(c, o, 12), 0.16));
  const c2 = [...c, 118]; assert.equal(runnerAt(c2, c2, 13), null, 'already a runner the session before');
  const c3 = [...c]; c3[12] = 250; assert.equal(runnerAt(c3, c3, 12), null, 'over +100%: left out');
  const o4 = [...o]; o4[5] = NaN; assert.equal(runnerAt(c, o4, 12), null, 'a missing open');
  assert.equal(gainAt(c, 3), null);
});

test('path split: overnight + regular-hours log returns add up to the close-to-close gain', () => {
  // 10 sessions: each gaps up 2% overnight and closes flat to its open -> all overnight
  const c = [100], o = [100]; for (let u = 1; u <= 10; u++) { o.push(c[u - 1] * 1.02); c.push(o[u]); }
  const p = pathSplit(o, c, 10); assert.ok(near(p.nightShare, 1)); assert.ok(near(p.total, Math.log(c[10] / c[0])));
  // regular hours only: opens at the previous close, closes 2% higher
  const c2 = [100], o2 = [100]; for (let u = 1; u <= 10; u++) { o2.push(c2[u - 1]); c2.push(o2[u] * 1.02); }
  assert.ok(near(pathSplit(o2, c2, 10).nightShare, 0));
  const f = { run: 0.2, nightShare: 0.8 }; assert.equal(passes('SQ8-NIGHTRUN', f), true); assert.equal(passes('SQ8-NIGHTRUN', { run: 0.2, nightShare: 0.7 }), false);
  assert.equal(passes('SQ8-NIGHTRUN', { run: null, nightShare: 0.9 }), null, 'not a runner');
});

test('tug of war: open above the previous close AND close under the open', () => {
  const c = [10], o = [10]; for (let u = 1; u <= 21; u++) { const tug = u % 3 === 0; o.push(c[u - 1] * (tug ? 1.03 : 1.0)); c.push(tug ? o[u] * 0.99 : o[u] * 1.01); }
  assert.equal(tugCount(o, c, 21), 7); assert.equal(passes('SQ8-TUG', { run: 0.2, tug: 7 }), true); assert.equal(passes('SQ8-TUG', { run: 0.2, tug: 6 }), false);
  assert.equal(tugCount(o, c, 10), null, 'not enough history');
});

test('up/down volume: ratio, no down session passes, a flat close counts as neither', () => {
  const c = [10, 11, 10.5, 11, 11, 12, 12.5, 12, 13, 13.5, 14], v = [0, 100, 50, 100, 999, 100, 100, 50, 100, 100, 100];
  const r = upDownVol(c, v, 10); assert.equal(r.up, 700); assert.equal(r.dn, 100); assert.equal(r.ratio, 7);
  const up = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]; assert.equal(upDownVol(up, v, 10).ratio, Infinity);
  assert.equal(passes('SQ8-ACCUM', { run: 0.2, ud: Infinity }), true); assert.equal(passes('SQ8-ACCUM', { run: 0.2, ud: 1.99 }), false);
});

test('orderly: up closes and the largest single session as a share of the gain', () => {
  const c = [100, 102, 104, 106, 108, 110, 112, 114, 116, 118, 120]; const r = orderly(c, 10); assert.equal(r.upDays, 10); assert.ok(r.maxShare < 0.15);
  assert.equal(passes('SQ8-ORDERLY', { run: 0.2, upDays: r.upDays, maxShare: r.maxShare }), true);
  const j = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 120]; const q = orderly(j, 10); assert.ok(near(q.maxShare, 1)); assert.equal(passes('SQ8-ORDERLY', { run: 0.2, upDays: 7, maxShare: q.maxShare }), false);
});

test('breakout that holds: new 60-session closing high, first in 20 sessions, 3 closes at or above the old high', () => {
  const c = Array(80).fill(10); c[30] = 12; // old high 12 at session 30 (inside the 60 before b)
  c[75] = 12.5; c[76] = 12.2; c[77] = 12.0; c[78] = 12.3; const t = 78;
  assert.equal(priorHigh(c, 75), 12); assert.equal(breakoutAt(c, 75), 12);
  assert.deepEqual(hold3At(c, t), { b: 75, level: 12 }); assert.deepEqual(hold3At(c, t, undefined, breakoutSeries(c)), { b: 75, level: 12 });
  const f = [...c]; f[77] = 11.9; assert.equal(hold3At(f, t), null, 'fell back under the level');
  const e = [...c]; e[60] = 12.1; assert.equal(hold3At(e, t), null, 'an earlier breakout within 20 sessions'); assert.equal(hold3At(e, t, undefined, breakoutSeries(e)), null);
  assert.equal(passes('SQ8-HOLD3', { hold3: true }), true); assert.equal(passes('SQ8-HOLD3', { hold3: false }), false);
});

test('share counts: 30 days late, stale rows ignored, unadjusted splits fixed, yearly change', () => {
  const rows = [['2022-03-31', 100], ['2022-06-30', 100], ['2022-09-30', 99], ['2022-12-31', 97], ['2023-03-31', 96]];
  assert.equal(sharesKnownAt(rows, '2023-04-15'), 97, 'the March count is not known until 30 April');
  assert.equal(sharesKnownAt(rows, '2023-05-01'), 96);
  assert.equal(sharesKnownAt(rows, '2024-06-01'), null, 'stale: last row over 200 days before the cut-off');
  assert.ok(near(shareChange(rows, '2023-05-01'), 96 / 100 - 1));
  assert.equal(passes('SQ8-SHRINK', { run: 0.2, shChg: -0.04 }), true); assert.equal(passes('SQ8-SHRINK', { run: 0.2, shChg: -0.01 }), false); assert.equal(passes('SQ8-SHRINK', { run: 0.2, shChg: -0.5 }), false, 'a data error');
  const sp = splitFix([['2021-12-31', 50], ['2022-03-31', 100.5]]); assert.ok(near(sp[0][1], 100.5), 'a 2-for-1 is not dilution');
  const real = splitFix([['2021-12-31', 100], ['2022-03-31', 130]]); assert.equal(real[0][1], 100, 'real dilution kept');
  assert.ok(near(turnover([0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 10, 100), 0.1)); assert.equal(passes('SQ8-LOWTURN', { run: 0.2, turn: 0.1 }), true); assert.equal(passes('SQ8-LOWTURN', { run: 0.2, turn: 0.2 }), false);
  assert.equal(turnover([1, 1], 1, null), null);
});

test('reverse splits within 3 years, clean supply and the combination rule', () => {
  const s = [{ d: '2021-05-03', from: 10, to: 1 }, { d: '2023-01-10', from: 1, to: 2 }];
  assert.equal(reverseSplitWithin(s, '2024-05-01'), true); assert.equal(reverseSplitWithin(s, '2024-05-04'), false, 'over 1,095 days'); assert.equal(reverseSplitWithin(s, '2021-05-02'), false, 'not yet executed');
  assert.equal(passes('SQ8-CLEAN', { run: 0.2, shChg: 0.02, rs3: false }), true); assert.equal(passes('SQ8-CLEAN', { run: 0.2, shChg: 0.02, rs3: true }), false); assert.equal(passes('SQ8-CLEAN', { run: 0.2, shChg: 0.04, rs3: false }), false);
  assert.equal(passes('SQ8-CLEAN', { run: 0.2, shChg: 0.0, rs3: null }), null, 'unknown split history');
  assert.equal(passes('SQ8-REAL', { run: 0.2, nightShare: 0.5, ud: 1.5, shChg: 0.05 }), true); assert.equal(passes('SQ8-REAL', { run: 0.2, nightShare: 0.49, ud: 3, shChg: 0 }), false);
  assert.equal(passes('SQ8-POSTLOCK', { run: 0.2, ipoDays: 200 }), true); assert.equal(passes('SQ8-POSTLOCK', { run: 0.2, ipoDays: 150 }), false); assert.equal(passes('SQ8-POSTLOCK', { run: 0.2, ipoDays: null }), null);
  assert.equal(spacLike([10, 10.1, 10, 10, 10.02, 10, 10, 10.05, 10, 10], 0), true); assert.equal(spacLike([10, 12, 10, 10, 10, 10, 10, 10, 10, 10], 0), false);
});

test('helpers: halves, cap, same stock on other days (capped), paper readiness', () => {
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer'); assert.equal(capG(5), 3);
  assert.equal(ownAverage({ from: 0, to: 40, len: 5, step: 10, okAt: () => true, ret: () => 9 }), 3);
  assert.equal(ownAverage({ from: 0, to: 12, len: 5, step: 10, okAt: () => true, ret: () => 0.1 }), null, 'fewer than 3 windows');
  const st = boardStats(Array.from({ length: 30 }, (_, k) => ({ d: 'd' + (k % 10), sym: 'S' + k, g: 0.05, c: 0.01 }))); assert.equal(st.n, 30); assert.equal(st.days, 10); assert.ok(paperReady(st));
});

test('library pre-registration is append-only and idempotent', () => {
  const LB = { strategies: [{ id: 'X1' }] }; assert.equal(preRegister(LB), 10); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, 11);
  const e = LB.strategies.find(x => x.id === 'SQ8-TUG'); assert.match(e.status, /pre-registered/); assert.equal(e.hold, 20); assert.equal(e.agent, 'squad8'); assert.ok(e.sources.length);
  assert.ok(TH.nightShare === 0.75 && TH.tugMin === 7 && TH.udMin === 2 && TH.turnMax === 0.2);
});
