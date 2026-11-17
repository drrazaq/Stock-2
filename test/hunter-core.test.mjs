// Hunter lab core (squad 30, 17 Nov 2026): rules, exits, costs, verdict. No network.
import assert from 'node:assert/strict';
import { RULES, sigOf, exitTrade, costOf, stats, verdict, sane } from '../hunter-core.mjs';
let n = 0; const t = (name, f) => { f(); n++; console.log('ok', name); };
const ser = (rows, start = 0) => ({ d: rows.map((_, i) => start + i), o: rows.map(r => r[0]), h: rows.map(r => r[1]), l: rows.map(r => r[2]), c: rows.map(r => r[3]), v: rows.map(r => r[4]) });

t('costs: pennies pay far more than big stocks', () => { const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, a + ' vs ' + b); near(costOf(0.4), 0.046); near(costOf(2), 0.021); near(costOf(50), 0.009); assert.ok(Math.abs(costOf(2, 1.5) - 0.0315) < 1e-12); });
t('gap rule: 1.00 close, opens 1.30 with 400k USD traded -> signal on the gap day; 1.15 open -> none', () => {
  const s = ser([[1, 1.05, 0.95, 1, 400000], [1.3, 1.5, 1.2, 1.4, 900000]]);
  assert.equal(sigOf('PNY-GAP1')(s, 1), 1);
  const s2 = ser([[1, 1.05, 0.95, 1, 400000], [1.15, 1.5, 1.1, 1.4, 900000]]); assert.equal(sigOf('PNY-GAP1')(s2, 1), -1);
});
t('gap rule needs liquidity and consecutive days', () => {
  assert.equal(sigOf('PNY-GAP1')(ser([[1, 1, 1, 1, 100000], [1.3, 1.5, 1.2, 1.4, 9e5]]), 1), -1);
  const s = ser([[1, 1, 1, 1, 400000], [1.3, 1.5, 1.2, 1.4, 9e5]]); s.d = [0, 2]; assert.equal(sigOf('PNY-GAP1')(s, 1), -1);
});
t('reverse split / data error never signals (HZN +4876%)', () => { assert.equal(sane(1, 49.7), false); assert.equal(sigOf('PNY-GAP1')(ser([[1, 1, 1, 1, 5e5], [49, 50, 48, 49.7, 1e6]]), 1), -1); });
t('day-2 rule enters the NEXT open', () => {
  const s = ser([[1, 1, 1, 1, 2e6], [1.1, 1.6, 1.05, 1.55, 2e6], [1.6, 1.7, 1.4, 1.5, 2e6]]);
  assert.equal(sigOf('PNY-RUN2')(s, 1), 2);
});
t('exit: same-day close, stop hit, gap through the stop, stopped trading', () => {
  const s = ser([[1, 1.2, 0.95, 1.1, 1e6], [1.05, 1.1, 0.8, 0.9, 1e6], [0.7, 0.75, 0.6, 0.65, 1e6]]);
  assert.ok(Math.abs(exitTrade(s, 0, 1).gross - 0.1) < 1e-12);
  const x = exitTrade(s, 0, 3, 0.1); assert.equal(x.how, 'stop'); assert.equal(x.days, 2); assert.ok(Math.abs(x.exit - 0.9 * 0.99) < 1e-12);
  const y = exitTrade(ser([[1, 1.1, 0.95, 1, 1e6], [0.5, 0.6, 0.4, 0.45, 1e6]]), 0, 3, 0.1); assert.equal(y.how, 'stop'); assert.ok(Math.abs(y.exit - 0.5 * 0.99) < 1e-12, 'gap through the stop fills at the open');
  const s3 = ser([[1, 1.1, 0.95, 1, 1e6], [1, 1.1, 0.95, 1, 1e6]]); s3.d = [0, 5]; const z = exitTrade(s3, 0, 3); assert.equal(z.how, 'stopped trading'); assert.ok(Math.abs(z.gross - -0.2) < 1e-12);
});
t('verdict: TRY SMALL only when every test passes; average loss = REJECTED; info rule = INFORMATION', () => {
  const mk = (avg, n, spread = 0.05) => Array.from({ length: n }, (_, i) => ({ di: i, net: avg + (i % 2 ? spread : -spread) }));
  const good = stats(mk(0.02, 200, 0.01)); assert.equal(verdict(good, good, good, good).verdict, 'TRY SMALL');
  const bad = stats(mk(-0.01, 200)); assert.equal(verdict(bad, bad, bad, bad).verdict, 'REJECTED');
  const weak = stats(mk(0.002, 200, 0.2)); assert.equal(verdict(weak, weak, weak, weak).verdict, 'NOT PROVEN');
  assert.equal(verdict(good, good, good, good, { info: true }).verdict, 'INFORMATION');
  assert.equal(verdict(stats(mk(0.02, 30)), good, good, good).verdict, 'TOO FEW');
});
t('every rule has text, hold and a signal', () => { for (const [id, r] of Object.entries(RULES)) { assert.ok(r.text && r.hold >= 1, id); assert.equal(typeof sigOf(id), 'function', id); } });
console.log(n + ' hunter core tests passed');
