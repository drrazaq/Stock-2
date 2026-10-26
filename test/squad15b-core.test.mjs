// Seams: squad15b-core.mjs (SQ15-PB12-300 v1, forward paper lane of the affordable call, pre-registered 27 Oct 2026 with the owner-review
// corrections: full spread <= 5%, 300 USD all-in, stale / crossed / locked / missing-size quotes rejected). Run: node test/squad15b-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { choose, exitTrigger, exitProblem, callNet, callNetStress, stockNet, dedupe, boardStats, preRegister, preRegisterAll, RULE, RULES, ruleOf } from '../squad15b-core.mjs';
const NOW = Date.parse('2026-10-27T15:00:00Z'), fresh = '2026-10-27T14:55:00Z';
const row = (o) => ({ occ: 'X', exp: '2027-01-15', k: 100, delta: 0.5, ap: 2.5, bp: 2.45, as: 10, bs: 10, qt: fresh, ...o });
test('highest delta within 300 USD all-in, 45-180 days, full spread <= 5%, usable quote; alternatives kept', () => {
  const day = '2026-10-27', rows = [row({ occ: 'A', delta: 0.62, ap: 2.95, bp: 2.9 }), row({ occ: 'B', delta: 0.55, ap: 2.0, bp: 1.96 }), row({ occ: 'C', delta: 0.9, ap: 2.96, bp: 2.95 }),
    row({ occ: 'D', delta: 0.8, ap: 2.0, bp: 1.8 }), row({ occ: 'E', delta: 0.85, ap: 1.0, bp: 0 }), row({ occ: 'F', delta: 0.95, exp: '2026-11-20' }), row({ occ: 'G', delta: 0.96, exp: '2027-06-18' }),
    row({ occ: 'H', delta: 0.97, qt: '2026-10-27T14:30:00Z' }), row({ occ: 'I', delta: 0.97, ap: 2.45 }), row({ occ: 'K', delta: 0.97, bs: 0 })];
  const c = choose(rows, day, NOW);
  assert.equal(c.pick.occ, 'A'); // C 301 all-in; D spread 10.5%; E one-sided; F 24 days; G 234 days; H stale; I locked; K no size
  assert.deepEqual(c.eligible.map(r => r.occ), ['A', 'B']); assert.equal(c.rejected.stale, 1); assert.equal(c.rejected.locked, 1); assert.equal(c.rejected['missing size'], 1);
  assert.equal(c.rejected['spread > 5%'], 1); assert.equal(c.rejected['over 300 USD all-in'], 1); assert.equal(c.dataFailure, false);
  assert.equal(choose([row({ ap: 2.96, bp: 2.95 })], day, NOW).pick, null);
  assert.equal(choose([row({ qt: '2026-10-27T13:00:00Z' }), row({ qt: '2026-10-27T13:00:00Z' }), row({})], day, NOW).dataFailure, true);
});
test('exit trigger = hold-th session from entry or the last session <= expiry - 30, whichever first; exit quote checks', () => {
  const cal = ['2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-11-02'];
  assert.equal(exitTrigger(cal, '2026-10-27', 3, '2027-03-19'), '2026-10-29');
  assert.equal(exitTrigger(cal, '2026-10-27', 63, '2026-11-30'), '2026-10-30');
  assert.equal(exitTrigger(cal, '2026-10-27', 63, '2027-03-19'), null);
  assert.equal(exitProblem({ bp: 1, bs: 3, ap: 1.1, t: fresh }, NOW), null); assert.equal(exitProblem({ bp: 0, bs: 0, ap: 0.05, t: fresh }, NOW), 'no bid');
  assert.equal(exitProblem({ bp: 1, bs: 3, ap: 1.1, t: '2026-10-27T14:00:00Z' }, NOW), 'stale');
});
test('returns, stress and dedupe', () => {
  assert.equal(+callNet(205, 3).toFixed(4), +(295 / 205 - 1).toFixed(4)); assert.equal(callNet(205, 0.03), -1);
  assert.ok(callNetStress(1.9, 2.0, 2.9, 3.0) < 2.9 * 100 / 205 - 1);
  assert.equal(+stockNet(100, 110).toFixed(4), 0.092);
  const d = dedupe([{ sym: 'A', d: 'x' }, { sym: 'A', d: 'x' }, { sym: 'B', d: 'x' }], new Set(['B'])); assert.equal(d.length, 2); assert.equal(d[1].skip, 'SKIP: already holding');
});
test('board: median, losses, drawdown and streak beside the mean', () => {
  const R = [[3, 0.1, '1'], [-1, -0.05, '2'], [-0.6, 0.02, '3'], [-0.3, 0, '4']].map(([net, stock, x]) => ({ net, stock, netStress: net - 0.05, stockStress: stock - 0.004, pnlUSD: net * 200, pnlUSDStress: (net - 0.05) * 200, exitAt: x }));
  const b = boardStats(R);
  assert.equal(b.n, 4); assert.ok(b.mean > 0); assert.ok(b.median < 0); assert.equal(b.lost100, 0.25); assert.equal(b.lost50, 0.5); assert.equal(b.lost25, 0.75);
  assert.equal(b.worst, -1); assert.equal(b.meanWithout2Best, -0.8); assert.equal(b.win, 0.25); assert.equal(b.longestLosingStreak, 3); assert.equal(b.maxDrawdownUSD, -380);
  assert.equal(b.atStress1_5x.n, 4);
});
test('library pre-registration is idempotent', () => { const L = { strategies: [] }; assert.equal(preRegister(L), 1); assert.equal(preRegister(L), 0); assert.equal(L.strategies[0].id, RULE); assert.match(L.strategies[0].status, /forward paper only from 27 Oct 2026/); });
test('SQ15-PB12-2000: 2,000 USD all-in budget, highest delta <= 0.85 (and >= 0.30); same quote/spread/window checks', () => {
  const day = '2026-10-27', R2 = RULES[1]; assert.equal(R2.id, 'SQ15-PB12-2000'); assert.equal(R2.cap, 2000); assert.equal(R2.maxDelta, 0.85); assert.equal(R2.start, '2026-10-28');
  const rows = [row({ occ: 'A', delta: 0.62, ap: 2.95, bp: 2.9 }), row({ occ: 'C', delta: 0.9, ap: 2.96, bp: 2.95 }), row({ occ: 'M', delta: 0.84, ap: 19.95, bp: 19.6 }),
    row({ occ: 'N', delta: 0.85, ap: 19.96, bp: 19.6 }), row({ occ: 'P', delta: 0.851, ap: 10, bp: 9.9 }), row({ occ: 'Q', delta: 0.8, ap: 15, bp: 14 }), row({ occ: 'S', delta: 0.25, ap: 0.5, bp: 0.49 })];
  const c = choose(rows, day, NOW, R2);
  assert.equal(c.pick.occ, 'M'); // N 2,001 all-in; C and P over 0.85; Q spread 6.9%; S under 0.30
  assert.deepEqual(c.eligible.map(r => r.occ), ['M', 'A']); assert.equal(c.pick.allIn, 2000);
  assert.equal(c.rejected['over 2000 USD all-in'], 1); assert.equal(c.rejected['delta > 0.85'], 2); assert.equal(c.rejected['delta < 0.30'], 1); assert.equal(c.rejected['spread > 5%'], 1);
  assert.equal(choose([row({ delta: 0.85, ap: 19.5, bp: 19.4 })], day, NOW, R2).pick.delta, 0.85); // exactly 0.85 is allowed
  // the 300 rule on the same rows is unchanged (default rule): A, with C over 300 and no delta cap
  const c3 = choose(rows, day, NOW); assert.equal(c3.pick.occ, 'A'); assert.equal(c3.rejected['over 300 USD all-in'], 4); assert.equal(c3.rejected['delta > 0.85'], undefined);
  assert.equal(choose(rows, day, NOW, RULES[0]).pick.occ, 'A');
  assert.equal(choose([row({ delta: 0.95, ap: 5, bp: 4.9 })], day, NOW, R2).pick, null);
  assert.equal(ruleOf('SQ15-PB12-2000|NVDA|2026-10-28').id, 'SQ15-PB12-2000'); assert.equal(ruleOf('SQ15-PB12-300|NVDA|2026-10-28').id, 'SQ15-PB12-300');
});
test('both rules pre-registered, idempotent, 2000 status as decided', () => { const L = { strategies: [] }; assert.equal(preRegisterAll(L), 2); assert.equal(preRegisterAll(L), 0);
  const e = L.strategies.find(x => x.id === 'SQ15-PB12-2000'); assert.equal(e.version, 'v1'); assert.equal(e.status, 'forward paper only from 28 Oct 2026; owner decision 27 Oct');
  const L2 = { strategies: [{ id: RULE }] }; assert.equal(preRegisterAll(L2), 1); });
