// agent-a-tp-core.mjs (A-TP1 momentum turning points, A-RMOM1 risk-managed momentum; pre-registered 10 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import { tpBlend, tpRun, tpHalf, judgeTp, rmomWeight, bookPath, pathRets, bookDaily, dailyStats, judgeRmom, preRegister, recordResults, halfOf, COST, STRESS, TARGET_VOL } from '../agent-a-tp-core.mjs';

test('A-TP1 blend: out of the market only when both the 12-month and the 1-month excess returns are negative', () => {
  assert.equal(tpBlend(0.10, 0.04, 0.02, 0.003).inMarket, true);
  assert.equal(tpBlend(0.10, 0.04, -0.02, 0.003).inMarket, true);   // correction: blend 0 -> stay in
  assert.equal(tpBlend(-0.10, 0.04, 0.02, 0.003).inMarket, true);   // rebound: blend 0 -> stay in
  assert.equal(tpBlend(-0.10, 0.04, -0.02, 0.003).inMarket, false);  // bear
  assert.equal(tpBlend(0.03, 0.04, 0.002, 0.003).inMarket, false);   // positive returns below the T-bill count as negative excess
});

test('A-TP1 run: each switch pays half a round trip; holding pays half once at the start', () => {
  const m = [{ d: '2023-01-31', inMarket: true, spy: 0.02, cash: 0.004 }, { d: '2023-02-28', inMarket: false, spy: -0.05, cash: 0.004 }, { d: '2023-03-31', inMarket: false, spy: 0.01, cash: 0.004 }];
  const r = tpRun(m, 0.008);
  assert.equal(r[0].sw, 1); assert.ok(Math.abs(r[0].r - (1.02 * 0.996 - 1)) < 1e-12); assert.ok(Math.abs(r[0].b - (1.02 * 0.996 - 1)) < 1e-12);
  assert.equal(r[1].sw, 1); assert.ok(Math.abs(r[1].r - (1.004 * 0.996 - 1)) < 1e-12); assert.equal(r[1].b, -0.05);
  assert.equal(r[2].sw, 0); assert.equal(r[2].r, 0.004);
  const h = tpHalf(r); assert.equal(h.months, 3); assert.equal(h.out, 2); assert.equal(h.switches, 2); assert.ok(h.rule.maxDD > h.hold.maxDD);
});

test('A-TP1 judging: useful needs both halves at both costs; tier 2 also needs 20+ months and t >= 2.5', () => {
  const half = (rp, hp, rd, hd, n, t) => ({ months: n, rule: { perYear: rp, maxDD: rd }, hold: { perYear: hp, maxDD: hd }, diffT: t });
  const good = { older: half(0.12, 0.10, -0.1, -0.2, 30, 3), newer: half(0.15, 0.14, -0.1, -0.15, 30, 3) };
  assert.equal(judgeTp({ base: good, stress: good }, 4.1).verdict, 'TIER 2');
  assert.equal(judgeTp({ base: good, stress: good }, 2.9).verdict, 'PROVEN');
  const few = { older: half(0.12, 0.10, -0.1, -0.2, 14, 3), newer: good.newer };
  assert.equal(judgeTp({ base: few, stress: few }, 4.1).verdict, 'USEFUL, NOT PROVEN (information only)');
  const bad = { older: half(0.08, 0.10, -0.1, -0.2, 30, 3), newer: good.newer };
  assert.equal(judgeTp({ base: bad, stress: good }, 4.1).verdict, 'REJECTED (does not beat holding)');
});

test('A-RMOM1 weight and book path', () => {
  assert.equal(rmomWeight(null), 1); assert.equal(rmomWeight(0.06), 1); assert.ok(Math.abs(rmomWeight(0.24) - TARGET_VOL / 0.24) < 1e-12);
  const V = bookPath([[10, 11, 12], [20, 18, NaN]]);   // the second stock stops trading: its last price is kept
  assert.deepEqual(V.map(x => +x.toFixed(4)), [1, 1, 1.05]);
  const r = pathRets(V); assert.equal(r.length, 2);
  const d = bookDaily([0.01, 0.0, 0.02], 0.5, COST); assert.ok(Math.abs(d[0] - 0.5 * (1.01 * 0.996 - 1)) < 1e-12); assert.equal(d[1], 0); assert.ok(Math.abs(d[2] - 0.5 * (1.02 * 0.996 - 1)) < 1e-12);
  const s = dailyStats([0.01, -0.02, 0.01]); assert.ok(s.maxDD < 0 && s.sessions === 3);
});

test('A-RMOM1 judging: adopt only with 3+ books a half and higher Sharpe AND shallower drawdown in both halves at both costs', () => {
  const h = (b, ss, sd, us, ud) => ({ books: b, scaled: { sharpe: ss, maxDD: sd }, unscaled: { sharpe: us, maxDD: ud } });
  const ok = { older: h(3, 1.1, -0.1, 1.0, -0.2), newer: h(4, 0.9, -0.1, 0.8, -0.3) };
  assert.equal(judgeRmom({ base: ok, stress: ok }).verdict, 'ADOPT (sizing)');
  const two = { older: h(2, 1.1, -0.1, 1.0, -0.2), newer: ok.newer };
  assert.equal(judgeRmom({ base: two, stress: two }).verdict, 'NOT ADOPTED');
  const lowS = { older: h(3, 0.9, -0.1, 1.0, -0.2), newer: ok.newer };
  assert.equal(judgeRmom({ base: ok, stress: lowS }).verdict, 'NOT ADOPTED');
  assert.ok(STRESS > COST);
});

test('library: judging text added once before the run; results recorded once from firstRun', () => {
  const LB = { strategies: [{ id: 'A-TP1', status: 'queued (Agent A)' }, { id: 'A-RMOM1', status: 'queued (Agent A)' }, { id: 'X', status: 'other' }] };
  assert.equal(preRegister(LB), 2); assert.equal(preRegister(LB), 0); assert.match(LB.strategies[0].status, /pre-registered/); assert.equal(LB.strategies[2].status, 'other');
  const first = { 'A-TP1': { frozenAt: 'z', summary: 's', judged: { verdict: 'REJECTED (does not beat holding)', level: 'none', why: ['x'] } } };
  assert.equal(recordResults(LB, first), 1); assert.equal(LB.strategies[0].status, 'tested: rejected'); assert.equal(recordResults(LB, first), 0);
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-31'), 'newer');
});
