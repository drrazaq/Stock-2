// Seams: macro-core.mjs (macro lab, 24 Oct 2026). World events / macro moves -> US sectors: the pre-registered MACRO-* rules, the dated
// event table, driver momentum flags (top / bottom 20% of the past year), the VIX spike-then-falling trigger, the entry session after a
// dated event, the sector groups by SIC, the monthly driver rotation, price-history stitching and the library pre-registration.
// Pure functions, no network. Run: node test/macro-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, EVENTS, DRIVERS, ROT_MAP, SPDR11, ALL_ETFS, GROUPS, groupOf, entryIdx, retN, driverFlags, vixFlags, topByValue, driverScore, rotPick, worstOf,
  stitch, splitGuard, eventWindow, corrBeta, yardGap, judgeMacro, preRegister, monthEndAfter, halfOf, SPLIT, PAPER_START } from '../macro-core.mjs';

test('every rule is fully pre-registered: id, rule text, hold 20/60 or monthly, sources with links, a library check', () => {
  assert.ok(IDS.length >= 30);
  for (const id of IDS) { const r = RULES[id]; assert.match(id, /^MACRO-/); assert.ok(r.rule.length > 60, id); assert.ok([20, 60, 21].includes(r.hold), id);
    assert.ok(r.sources.length && r.sources.every(p => /^https:\/\//.test(p.url)), id); assert.ok(r.lib && /A-ROT|R4|Z11|CHAIN|ANG|E10|A-VIX1|none/.test(r.lib), id);
    assert.ok(['driver', 'event', 'rotation'].includes(r.family), id); assert.ok(r.target && (r.target.etf || r.target.group || r.target.rotation || r.target.worst), id); }
  for (const id of IDS) if (RULES[id].target.etf) assert.ok(ALL_ETFS.includes(RULES[id].target.etf), id);
  assert.equal(SPLIT, '2024-01-01'); assert.equal(PAPER_START, '2026-10-26');
});

test('event table: fixed dates, a known timing, a source, kinds; events sorted; the owner-named dates are present', () => {
  const ds = EVENTS.map(e => e.d); assert.deepEqual(ds, [...ds].sort());
  for (const e of EVENTS) { assert.match(e.d, /^\d{4}-\d\d-\d\d$/); assert.ok(['pre', 'after'].includes(e.when), e.id); assert.ok(e.src && e.what, e.id); assert.ok(['war', 'peace', 'opec', 'climate', 'fed', 'tariff'].includes(e.kind), e.id); }
  const has = (d, k) => EVENTS.some(e => e.d === d && e.kind === k);
  assert.ok(has('2022-02-24', 'war') && has('2023-10-07', 'war') && has('2024-04-13', 'war') && has('2024-10-01', 'war') && has('2025-06-13', 'war'));
  assert.ok(has('2022-08-16', 'climate') && has('2022-03-16', 'fed') && has('2024-09-18', 'fed') && has('2025-04-02', 'tariff') && has('2022-10-05', 'opec'));
  assert.ok(EVENTS.filter(e => e.kind === 'peace').length >= 5);
});

test('entry session: news before the open -> that session; after the open, or on a weekend -> the next session', () => {
  const D = ['2022-02-22', '2022-02-23', '2022-02-24', '2022-02-25', '2022-02-28'];
  assert.equal(entryIdx(D, { d: '2022-02-24', when: 'pre' }), 2);
  assert.equal(entryIdx(D, { d: '2022-02-24', when: 'after' }), 3);
  assert.equal(entryIdx(D, { d: '2022-02-26', when: 'pre' }), 4);    // Saturday news -> Monday open
  assert.equal(entryIdx(D, { d: '2022-02-26', when: 'after' }), 4);
  assert.equal(entryIdx(D, { d: '2022-03-05', when: 'after' }), -1);  // not in the data yet
});

test('driver momentum: today\'s 20-session return in the top 20% of the past year (only earlier values), bottom 20% for side down', () => {
  const c = []; for (let t = 0; t < 400; t++) c.push(100 * (1 + 0.0005 * t + 0.02 * Math.sin(t / 7)));
  c[399] = c[398] * 1.25;                        // a fresh surge on the last day
  const up = driverFlags(c, { look: 20, n: 252, q: 0.8 }), dn = driverFlags(c, { side: 'down' });
  assert.equal(up[399], 1); assert.equal(dn[399], 0);
  for (let t = 0; t < 272; t++) assert.equal(up[t], 0);   // needs 20 + 252 sessions of history
  const flat = new Array(300).fill(50); assert.equal(driverFlags(flat).reduce((a, b) => a + b, 0), 0);   // ties are never "top"
  const c2 = c.slice(0, 399).concat([c[398] * 0.75]); assert.equal(driverFlags(c2, { side: 'down' })[399], 1);
  const look = c.slice(0, 380); const a = driverFlags(look), b = driverFlags(c); for (let t = 0; t < 380; t++) assert.equal(a[t], b[t]);   // no look-ahead
  assert.ok(Math.abs(retN(c, 399, 20) - (c[399] / c[379] - 1)) < 1e-12);
});

test('VIX: a spike (30%+ over its 60-session average in the last 10 sessions) then a close 15%+ under the 10-session high; first day only', () => {
  const c = new Array(100).fill(20); c[80] = 28; c[81] = 30; c[82] = 29; c[83] = 26; c[84] = 25; c[85] = 24; c[86] = 23;
  const f = vixFlags(c); assert.equal(f[83], 0); assert.equal(f[84], 1); assert.equal(f[85], 0);   // 25 <= 0.85 x 30 = 25.5 first at 84
  const g = vixFlags(new Array(100).fill(20)); assert.equal(g.reduce((a, b) => a + b, 0), 0);
});

test('sector groups by SIC: energy, gold, metals (not gold or uranium), defense; lists for gas producers and clean energy', () => {
  assert.deepEqual(groupOf('1311'), ['energy']); assert.deepEqual(groupOf('2911'), ['energy']); assert.deepEqual(groupOf('1040'), ['gold']);
  assert.deepEqual(groupOf('1000'), ['metals']); assert.deepEqual(groupOf('1094'), []); assert.deepEqual(groupOf('3760'), ['defense']); assert.deepEqual(groupOf('3812'), ['defense']);
  assert.deepEqual(groupOf('7372'), []); assert.deepEqual(groupOf(null), []);
  assert.ok(GROUPS.gas.list.includes('EQT') && GROUPS.clean.list.includes('FSLR'));
});

test('top by traded value: the n largest, ties broken by key, invalid left out', () => {
  assert.deepEqual(topByValue([{ key: 'a', dv: 5 }, { key: 'b', dv: 9 }, { key: 'c', dv: NaN }, { key: 'd', dv: 7 }], 2), ['b', 'd']);
});

test('driver score: 63-session return over the volatility scale; rotation picks the 2 strongest positive scores', () => {
  const c = []; for (let t = 0; t < 400; t++) c.push(100 * Math.exp(0.001 * t + 0.01 * ((t * 7919) % 13 - 6) / 6));
  const s = driverScore(c, 399); assert.ok(s > 0); assert.equal(driverScore(c, 100), null);
  assert.deepEqual(rotPick({ XLE: 1.2, GDX: 0.4, IWM: -0.3, XLK: 2, FCG: null, COPX: 0.1 }), ['XLK', 'XLE']);
  assert.deepEqual(rotPick({ XLE: -1, GDX: 0.4 }), ['GDX']); assert.deepEqual(rotPick({ XLE: -1 }), []);
  assert.equal(Object.keys(ROT_MAP).length, 6); assert.equal(ROT_MAP.UUP.sign, -1);
});

test('worst sector: the lowest finite return', () => { assert.equal(worstOf({ XLE: 0.02, XLK: -0.05, XLU: null, XLB: -0.01 }), 'XLK'); assert.equal(worstOf({}), null); assert.equal(SPDR11.length, 11); });

test('stitching: Nasdaq rows before Massive\'s first day, scaled to Massive at the first common day; a split-sized jump in the old part is repaired', () => {
  const m = [['2021-10-01', 20, 21], ['2021-10-04', 21, 22]], n = [['2021-09-29', 40, 41], ['2021-09-30', 41, 40], ['2021-10-01', 40, 42], ['2021-10-04', 1, 1]];
  const s = stitch(m, n); assert.deepEqual(s.map(r => r[0]), ['2021-09-29', '2021-09-30', '2021-10-01', '2021-10-04']); assert.equal(s[1][2], 20); assert.equal(s[2][2], 21);
  assert.deepEqual(stitch(m, null), m); assert.deepEqual(stitch(null, n).length, 4);
  const g = splitGuard([['a', 10, 10], ['b', 10, 10], ['c', 80, 80], ['d', 81, 82]]);   // a 1-for-8 reverse split
  assert.deepEqual(g.fixed, ['c']); assert.equal(g.rows[0][2], 80); assert.equal(g.rows[3][2], 82);
  assert.deepEqual(splitGuard([['a', 10, 10], ['b', 10, 15]]).fixed, []);   // +50% is a move, not a split
});

test('event window: from the close before the entry session to the close of day 1 / 5 / 20 / 60', () => {
  const c = []; for (let t = 0; t < 100; t++) c.push(100 + t);
  const w = eventWindow(c, 10, [1, 5, 20, 60]); assert.ok(Math.abs(w[1] - (110 / 109 - 1)) < 1e-12); assert.ok(Math.abs(w[60] - (169 / 109 - 1)) < 1e-12);
  assert.equal(eventWindow(c, 90, [20])[20], null);
});

test('correlation and beta of daily returns', () => { const x = [0.01, -0.02, 0.03, 0, 0.01], y = x.map(v => 2 * v); const r = corrBeta(x, y); assert.ok(Math.abs(r.corr - 1) < 1e-9 && Math.abs(r.beta - 2) < 1e-9); });

test('judging: the system gates plus "better than SPY" (and the rotation\'s equal-weight yardstick); too few cases stays too few', () => {
  const H = { n: 40, blocks: 10, avg: 0.02, avgStress: 0.016, edge: 0.01, vsOwn: 0.01, noTop2: 0.01, tBlock: 3 };
  assert.equal(judgeMacro({ older: H, newer: H }, { bar: 4, gaps: { older: { spy: 0.01 }, newer: { spy: 0.01 } } }).verdict, 'TRADABLE SMALL');
  const j = judgeMacro({ older: H, newer: H }, { bar: 4, gaps: { older: { spy: -0.01 }, newer: { spy: 0.01 } } }); assert.equal(j.verdict, 'NOT PROVEN'); assert.match(j.why, /SPY in the older half/);
  const k = judgeMacro({ older: H, newer: H }, { bar: 4, gaps: { older: { spy: 0.01, ew: -0.001 }, newer: { spy: 0.01, ew: 0.01 } } }); assert.match(k.why, /equal weight of the 6 rotation funds in the older half/);
  assert.equal(judgeMacro({ older: { ...H, n: 5 }, newer: H }, { bar: 4, gaps: {} }).verdict, 'TOO FEW CASES');
  assert.equal(yardGap([{ g: 0.05, spy: 0.02 }, { g: 0.01, spy: 0.03 }], 'spy'), 0.005);
});

test('month end after an entry date, on the NYSE calendar', () => { assert.equal(monthEndAfter('2026-11-02'), '2026-11-30'); assert.equal(monthEndAfter('2026-12-01'), '2026-12-31'); assert.equal(monthEndAfter('2027-04-01'), '2027-04-30'); });

test('halves split at 2024-01-01', () => { assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer'); });

test('library pre-registration adds each MACRO entry once and never touches others', () => {
  const LB = { strategies: [{ id: 'A-ROT1', status: 'tested: rejected' }] };
  assert.equal(preRegister(LB), IDS.length); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies[0].status, 'tested: rejected');
  const e = LB.strategies.find(x => x.id === 'MACRO-OIL-E20'); assert.match(e.status, /^pre-registered 2026-10-24/); assert.match(e.note, /BEFORE any run/); assert.ok(e.sources.length);
});
