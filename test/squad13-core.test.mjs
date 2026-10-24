// Seams: squad13-core.mjs (SQUAD 13, 24 Oct 2026: runner pullbacks and industry waves among large caps). Pullback after a runner,
// supply checks, breadth waves with cool-down, leader 52-week highs (plain, first in 63 sessions, above the pre-results high), the
// reaction session of a filing, followers that have not moved, per-year return vs SPY and the idempotent library pre-registration.
// Run: node --test test/squad13-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, TH, sic3, smaArr, pullbackAfter, supplyPass, waveAt, waveSessions, topBy, newHigh, firstHighIn, reactionSession, aboveHighBefore, followers, perYear, byYear, preRegister, halfOf } from '../squad13-core.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('registry: 8 rules SQ13-*, holds 20 / 63, each with rule text, a linked paper and a library check', () => {
  assert.equal(IDS.length, 8);
  for (const id of IDS) { const r = RULES[id]; assert.ok(id.startsWith('SQ13-')); assert.ok([20, 63].includes(r.hold), id); assert.ok(r.rule.length > 80, id); assert.ok(r.papers.some(p => /^https:\/\//.test(p.url)), id); assert.ok(r.lib, id); }
  assert.equal(RULES['SQ13-RPB'].hold, 20); assert.equal(RULES['SQ13-RPB-LARGE'].hold, 63); assert.equal(RULES['SQ13-WAVE-BIG'].hold, 63);
});

test('sic3: first 3 digits of a 4-digit code, padded; blank / zero -> null', () => {
  assert.equal(sic3('3674'), '367'); assert.equal(sic3(2834), '283'); assert.equal(sic3('100'), '010'); assert.equal(sic3(''), null); assert.equal(sic3(null), null); assert.equal(sic3('0000'), null);
});

// a runner at t = 10 (base close 100 at t-10 = 0), then a path
const mk = (after) => { const c = [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 118, ...after]; return c; };
const flatSma = (c, v = 90) => c.map(() => v);
test('pullback: first close 8-15% under the post-run high in sessions t+5..t+15, above base and 20-day average', () => {
  const c = mk([120, 122, 120, 118, 116, 110]);   // H 122 at t+2; t+5 = 116 (4.9% off); t+6 = 110 (9.8% off) -> signal at 16
  const p = pullbackAfter(c, flatSma(c), 10); assert.equal(p.u, 16); assert.equal(p.H, 122); assert.equal(p.base, 100);
  const early = mk([112, 110, 110, 110, 110, 110]);  // 6.8% off at t+1..: in band from t+2 (110/118 = 0.932: no) -> check band
  const p2 = pullbackAfter(mk([118, 108, 108, 108, 108, 108]), flatSma(mk([118, 108, 108, 108, 108, 108])), 10); assert.equal(p2.u, 15, 'a dip inside the band before t+5 waits for t+5');
  assert.equal(pullbackAfter(early, flatSma(early), 10), null, '6.8% off never reaches the band');
});
test('pullback: void when a close breaks 15% off the high or the pre-run base; needs the 20-day average under the close', () => {
  const deep = mk([120, 100, 110, 110, 110, 110]); assert.equal(pullbackAfter(deep, flatSma(deep), 10), null, '100 < 0.85 x 120 = 102 -> void');
  const base = mk([105, 99, 105, 105, 105, 105]); assert.equal(pullbackAfter(base, flatSma(base), 10), null, 'under the pre-run base');
  const c = mk([120, 122, 120, 118, 116, 110]); assert.equal(pullbackAfter(c, flatSma(c, 111), 10), null, 'under the 20-day average -> no signal (then nothing later in range)');
  assert.equal(pullbackAfter(c, flatSma(c), 10, (u) => u !== 16), null, 'not liquid at the pullback session');
  const late = mk([120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 120, 105]); assert.equal(pullbackAfter(late, flatSma(late), 10), null, 't+16 is outside the window');
  const miss = mk([120, NaN, 120]); assert.equal(pullbackAfter(miss, flatSma(miss), 10), null, 'missing close');
});

test('supply: clean = count up at most 1% and no reverse split; buyback = down 2%+ (not below -40%) and no reverse split; unknown -> null', () => {
  assert.equal(supplyPass('SQ13-RPB-CLEAN', 0.01, false), true); assert.equal(supplyPass('SQ13-RPB-CLEAN', 0.011, false), false); assert.equal(supplyPass('SQ13-RPB-CLEAN', -0.1, true), false);
  assert.equal(supplyPass('SQ13-RPB-BUYBACK', -0.02, false), true); assert.equal(supplyPass('SQ13-RPB-BUYBACK', -0.019, false), false); assert.equal(supplyPass('SQ13-RPB-BUYBACK', -0.5, false), false);
  assert.equal(supplyPass('SQ13-RPB-CLEAN', null, false), null); assert.equal(supplyPass('SQ13-RPB-BUYBACK', -0.05, null), null);
});

test('wave: breadth over 60% now and under 40% on a session of the last 21; one wave per 63 sessions', () => {
  const br = new Float32Array(200).fill(NaN); for (let t = 0; t < 200; t++) br[t] = 0.5;
  br[30] = 0.35; br[45] = 0.65;                 // 15 sessions apart -> wave at 45
  br[60] = 0.30; br[61] = 0.70;                 // inside the 63-session cool-down -> skipped
  br[120] = 0.39; br[150] = 0.62;               // 30 sessions apart -> not within 21
  br[170] = 0.20; br[180] = 0.61;               // wave at 180
  assert.equal(waveAt(br, 45), true); assert.equal(waveAt(br, 150), false); assert.equal(waveAt(br, 46), false, '0.5 is not over 60%');
  assert.equal(waveAt(Float32Array.from([0.4, 0.61]), 1), false, 'exactly 40% is not under 40%');
  assert.deepEqual(waveSessions(br), [45, 180]);
});

test('topBy: highest values first, non-finite left out, ties by key', () => {
  assert.deepEqual(topBy([{ key: 1, v: 5 }, { key: 2, v: NaN }, { key: 3, v: 9 }, { key: 0, v: 5 }], 3), [3, 0, 1]);
});

test('52-week highs: plain, first in 63 sessions, and above the pre-results high', () => {
  const c = Array.from({ length: 400 }, (_, k) => 100 + Math.sin(k / 7)); c[300] = 120; c[330] = 121; c[399] = 130;
  assert.equal(newHigh(c, 300), true); assert.equal(firstHighIn(c, 300), true); assert.equal(newHigh(c, 330), true); assert.equal(firstHighIn(c, 330), false, 'a high 30 sessions earlier');
  assert.equal(firstHighIn(c, 399), true); assert.equal(newHigh(c, 200), false);
  const g = [...c]; for (let k = 100; k < 120; k++) g[k] = NaN; assert.equal(newHigh(g, 300), false, 'fewer than 240 closes');
  // pre-results high: r0 = 340, the closes 88..339 hold 121 -> 125 at 341 is above it, 120.5 is not
  const d = [...c]; d[341] = 125; d[342] = 120.5; assert.equal(aboveHighBefore(d, 340, 341), true); assert.equal(aboveHighBefore(d, 340, 342), false);
});

test('reaction session: first session on / after the filing date', () => {
  const D = ['2024-01-02', '2024-01-03', '2024-01-05', '2024-01-08'];
  assert.equal(reactionSession(D, '2024-01-03'), 1); assert.equal(reactionSession(D, '2024-01-04'), 2); assert.equal(reactionSession(D, '2024-01-06'), 3); assert.equal(reactionSession(D, '2024-01-09'), null);
});

test('followers: ranks 2-4 whose return is under +2% (unknown left out)', () => {
  const r = { 10: 0.30, 11: 0.05, 12: 0.019, 13: -0.04, 14: 0 }; assert.deepEqual(followers([10, 11, 12, 13, 14], (k) => r[k]), [12, 13]);
  assert.deepEqual(followers([10, 11], (k) => (k === 11 ? NaN : 0)), []); assert.deepEqual(followers([10], () => 0), []);
});

test('per year of capital: sum of net returns / years tied up; SPY on the same rows without cost; calendar years', () => {
  const rows = [{ g: 0.108, spy: 0.05, days: 126, t: 1 }, { g: -0.008, spy: 0.0, days: 126, t: 2 }];
  assert.ok(near(perYear(rows), (0.1 - 0.016) / 1)); assert.ok(near(perYear(rows, 'spy', 0), 0.05));
  const y = byYear([{ ...rows[0], y: '2022' }, { ...rows[1], y: '2023' }], z => z.y); assert.deepEqual(Object.keys(y), ['2022', '2023']); assert.equal(y['2022'].n, 1); assert.ok(near(y['2022'].perYear, 0.2));
  assert.equal(perYear([]), null); assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('smaArr: NaN until p values, NaN window when one is missing', () => {
  const s = smaArr([1, 2, 3, NaN, 5, 6, 7], 3); assert.ok(isNaN(s[1])); assert.ok(near(s[2], 2)); assert.ok(isNaN(s[3])); assert.ok(isNaN(s[5])); assert.ok(near(s[6], 6));
});

test('library pre-registration: appends the 8 rules once, never edits existing entries', () => {
  const LB = { strategies: [{ id: 'X1', name: 'other' }] };
  assert.equal(preRegister(LB), 8); assert.equal(LB.strategies.length, 9); assert.equal(preRegister(LB), 0);
  const e = LB.strategies.find(x => x.id === 'SQ13-LEADF'); assert.equal(e.hold, 63); assert.ok(/pre-registered/.test(e.status)); assert.ok(e.sources.length >= 2); assert.equal(e.kind, 'buy');
  assert.equal(TH.pbLo, 0.85); assert.equal(TH.pbHi, 0.92); assert.equal(TH.brLow, 0.40); assert.equal(TH.brHigh, 0.60);
});
