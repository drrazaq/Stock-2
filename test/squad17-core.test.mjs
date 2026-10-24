// Seams: squad17-core.mjs (SQUAD 17, 24 Oct 2026: which halal core holding - SPUS, the halal top 20, or a mix). Mix weights, momentum
// selection, the 10-month trend switch (no look-ahead), calendar-year returns, return for the drawdown, the owner's answer, the library.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mixWeights, momPick, momWeights, c15, monthEndCloses, trendAt, yearReturns, worstYear, retForDD, bestCore, weightsFor, reviewMonth, periodHold, preRegister, IDS, RULES } from '../squad17-core.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e, sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);
const rows = (n) => Array.from({ length: n }, (_, j) => ({ key: 'k' + j, cap: 1000 - j * 10, mom: j % 7 === 3 ? null : ((j * 37) % 23) / 10 - 1 }));

test('mix: half SPUS, the basket halved, sums to 1', () => {
  const w = mixWeights(new Map([['a', 0.6], ['b', 0.4]]), 'SPUS'); assert.ok(near(w.get('SPUS'), 0.5)); assert.ok(near(w.get('a'), 0.3)); assert.ok(near(sum(w), 1));
  const r = rows(25), m = weightsFor('SQ17-MIX50', r, 'SPUS'); assert.equal(m.size, 21); assert.ok(near(sum(m), 1)); assert.ok(near(m.get('SPUS'), 0.5));
  for (const [k, v] of m) if (k !== 'SPUS') assert.ok(v <= 0.075 + 1e-9, 'each name at most half of 15%');
});

test('momentum: best 30 by 12-1 among the first 100, no history left out, cap-weighted capped 15%', () => {
  const r = rows(120), pick = momPick(r, 100, 30); assert.equal(pick.length, 30); assert.ok(pick.every(x => x.mom !== null));
  assert.ok(pick.every(x => +x.key.slice(1) < 100), 'only the 100 largest'); const worstIn = Math.min(...pick.map(x => x.mom));
  assert.ok(r.slice(0, 100).filter(x => x.mom !== null && !pick.includes(x)).every(x => x.mom <= worstIn));
  const w = momWeights(r); assert.equal(w.size, 30); assert.ok(near(sum(w), 1)); assert.ok(Math.max(...w.values()) <= 0.15 + 1e-9);
  // ties: the larger company first
  const t = momPick([{ key: 'small', cap: 1, mom: 0.5 }, { key: 'big', cap: 9, mom: 0.5 }], 100, 1); assert.equal(t[0].key, 'big');
});

test('SH20-C15 and the pure cap weight yearly', () => {
  const r = [{ key: 'a', cap: 50 }, ...Array.from({ length: 19 }, (_, j) => ({ key: 'x' + j, cap: 2 }))];
  const w = c15(r); assert.ok(near(w.get('a'), 0.15)); assert.ok(near(sum(w), 1));
  const y = weightsFor('SQ17-SH20-CW-Y', r); assert.ok(near(y.get('a'), 50 / 88), 'no cap'); assert.equal(weightsFor('SQ17-SH20-TF10', r).get('a'), w.get('a'));
  assert.equal(reviewMonth('SQ17-SH20-CW-Y', '2024-01-02'), true); assert.equal(reviewMonth('SQ17-SH20-CW-Y', '2024-04-01'), false); assert.equal(reviewMonth('SQ17-MIX50', '2024-04-01'), true);
  assert.equal(periodHold('SQ17-SH20-CW-Y'), 252); assert.equal(periodHold('SQ17-MIX50'), 63);
});

test('10-month trend: month-end closes, average incl. this month, never a later month, needs 10 months', () => {
  const bars = []; for (let m = 1; m <= 12; m++) { const mm = String(m).padStart(2, '0'); bars.push({ d: '2021-' + mm + '-10', c: 999 }, { d: '2021-' + mm + '-28', c: m * 10 }); }
  const me = monthEndCloses(bars); assert.equal(me.length, 12); assert.deepEqual(me[0], ['2021-01', '2021-01-28', 10]);
  assert.equal(trendAt(me, '2021-09-28'), null, 'only 9 month ends');
  const t = trendAt(me, '2021-10-28'); assert.ok(near(t.sma, 55)); assert.equal(t.up, true);
  assert.equal(trendAt(me, '2021-10-15'), null, 'the month close at d must be known');
  const down = monthEndCloses([...bars.slice(0, 22), { d: '2021-12-28', c: 1 }]); assert.equal(trendAt(down, '2021-12-28').up, false);
  // a later month never enters: the 2021-10 answer is the same with or without Nov / Dec
  assert.deepEqual(trendAt(monthEndCloses(bars.slice(0, 20)), '2021-10-28'), t);
});

test('account: calendar-year returns, worst year, return for the drawdown, the owner answer', () => {
  const D = ['2021-12-30', '2022-01-03', '2022-12-30', '2023-01-03', '2023-12-29', '2024-01-02', '2024-03-01'], lv = [1, 1.02, 0.8, 0.82, 1.0, 1.01, 1.1];
  const yr = yearReturns(lv, D, 0); assert.deepEqual(yr.map(x => x.y), ['2022', '2023', '2024']); assert.ok(near(yr[0].r, -0.2)); assert.ok(near(yr[1].r, 0.25)); assert.ok(near(yr[2].r, 0.1));
  assert.equal(worstYear(yr).y, '2022');
  assert.equal(retForDD({ cagr: 0.15, maxDD: -0.3 }), 0.5); assert.equal(retForDD({ cagr: 0.1, maxDD: 0 }), null);
  assert.equal(bestCore([{ id: 'A', cagr: 0.12, maxDD: -0.28 }, { id: 'B', cagr: 0.20, maxDD: -0.33 }, { id: 'C', cagr: 0.14, maxDD: -0.30 }]), 'B');
  assert.equal(bestCore([{ id: 'B', cagr: 0.16, maxDD: -0.33 }, { id: 'C', cagr: 0.14, maxDD: -0.30 }]), 'C', 'B ahead by under 0.05: C has the smaller drawdown');
  assert.equal(bestCore([{ id: 'A', cagr: 0.12, maxDD: -0.25 }, { id: 'B', cagr: 0.13, maxDD: -0.26 }]), 'A', 'within 0.05: the smaller drawdown');
});

test('pre-registration is idempotent and carries the rule text', () => {
  const LB = { strategies: [] }; assert.equal(preRegister(LB), IDS.length); assert.equal(preRegister(LB), 0);
  assert.equal(IDS.length, 4); for (const e of LB.strategies) { assert.match(e.id, /^SQ17-/); assert.ok(e.explain.length > 200); assert.equal(e.agent, 'squad17'); }
  assert.ok(RULES['SQ17-SHMOM30'].mom);
});
