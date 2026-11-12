// Seams: research-core.mjs IDEA 16 (daily researcher, 12 Nov 2026): pre-earnings run-up of past winners (Aboody, Lehavy and Trueman 2010).
// 12-month return, cross-section percentile, trade windows, data rule, pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, ONE_OPEN, PRE, PRE_IDS, preMom, preRank, preWindow, preDataRule, preRegister, reactionDate } from '../research-core.mjs';

test('three pre rules: two buys and one avoid, 5-session holds, cut-offs fixed, one open trade per stock', () => {
  assert.deepEqual(PRE_IDS, ['RQ-PRE-W1', 'RQ-PRE-W10', 'RQ-PRE-POST1']);
  assert.deepEqual(PRE_IDS.map(id => RULES[id].hold), [5, 5, 5]);
  assert.deepEqual(PRE_IDS.map(id => RULES[id].kind), ['buy', 'buy', 'avoid']);
  assert.deepEqual(PRE_IDS.map(id => RULES[id].side + '/' + RULES[id].cut), ['pre/0.99', 'pre/0.9', 'post/0.99']);
  for (const id of PRE_IDS) { assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); }
  assert.ok(BUY_IDS.includes('RQ-PRE-W1') && BUY_IDS.includes('RQ-PRE-W10') && !BUY_IDS.includes('RQ-PRE-POST1'));
  assert.equal(PRE.back, 252); assert.equal(PRE.lead, 6); assert.equal(PRE.minCross, 500);
});
test('12-month return: close(t) / close(t-252) - 1; earlier close within 5 sessions; none -> null', () => {
  const px = (u) => u === 300 ? 30 : u === 48 ? 10 : null;
  assert.equal(preMom(px, 300), 2);                 // t-252 = 48
  assert.equal(preMom((u) => u === 300 ? 30 : u === 44 ? 15 : null, 300), 1);   // 4 sessions earlier: allowed
  assert.equal(preMom((u) => u === 300 ? 30 : u === 42 ? 15 : null, 300), null);  // 6 sessions earlier: not allowed
  assert.equal(preMom((u) => u === 300 ? 30 : u === 49 ? 15 : null, 300), null);  // a LATER close is never used
  assert.equal(preMom(px, 100), null);              // no history
  assert.equal(preMom((u) => u === 48 ? 10 : null, 300), null);  // no close at t
});
test('rank: 500+ stocks needed; top 1% and top 10% by percentile', () => {
  const list = Array.from({ length: 1001 }, (_, j) => ({ key: j, s: j }));
  const R = preRank(list); assert.equal(R.size, 1001);
  assert.ok(R.get(1000) >= 0.99 && R.get(990) >= 0.99 && R.get(989) < 0.99);
  assert.ok(R.get(900) >= 0.90 && R.get(899) < 0.90);
  assert.equal(preRank(list.slice(0, 499)).size, 0);
});
test('windows: pre buys the open of r-5, sells the close of r-1, signal at r-6; post r+1..r+5', () => {
  assert.deepEqual(preWindow(100, 'pre', 200), { t: 94, k: 95, x: 99 });
  assert.deepEqual(preWindow(100, 'post', 200), { t: 94, k: 101, x: 105 });
  assert.equal(preWindow(103, 'post', 105).future, true);
  assert.equal(preWindow(6, 'pre', 200), null);   // signal session 0 has no ranking day before
  assert.equal(preWindow(7, 'pre', 200).t, 1);
  assert.equal(preWindow(100, 'x', 200), null);
});
test('reaction timing reused: acceptance before 16:00 -> same day; 16:00+ -> next day', () => {
  const ny = (s) => ({ d: s.slice(0, 10), hm: s.slice(11, 16) });
  assert.equal(reactionDate('2025-01-28T07:30', ny), '2025-01-28');
  assert.equal(reactionDate('2025-01-28T16:05', ny), '2025-01-29');
});
test('data rule: 8-K coverage, mapping and 15,000 ranked announcements', () => {
  assert.equal(preDataRule({ subsOk: 100, ciks: 100, liqMonths: 100, liqMapped: 90, ranked: 15000 }).ok, true);
  const b = preDataRule({ subsOk: 90, ciks: 100, liqMonths: 100, liqMapped: 80, ranked: 100 });
  assert.equal(b.ok, false); assert.match(b.why, /95% needed/); assert.match(b.why, /85% needed/); assert.match(b.why, /15,000 needed/);
});
test('pre-registration writes the three RQ-PRE entries once', () => {
  const LB = { strategies: [] }; preRegister(LB);
  const mine = LB.strategies.filter(x => x.id.startsWith('RQ-PRE-'));
  assert.equal(mine.length, 3); assert.match(mine[0].status, /pre-registered 2026-11-12/); assert.match(mine[0].explain, /IDEA 16/);
  const n = LB.strategies.length; preRegister(LB); assert.equal(LB.strategies.length, n);
});
