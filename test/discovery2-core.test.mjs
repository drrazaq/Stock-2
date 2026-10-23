// Seams of DISCOVERY ENGINE v2 (discovery2-core.mjs, pure; discovery2.mjs does the reading and writing):
//   luckBar(m)                the t a rule must reach when m rules have been tested in all: max(2.5, zInv(1 - 0.05/m)); rises with m
//   holdReturn(...)           buy the open after the signal, hold h sessions, 15% stop (a gap through the stop fills at the open)
//   judgeNewer(trades, bar)   the TRADABLE SMALL (tier 2) standard on the newer half only, with every gate named when it fails
//   discover(...)             ranks single features and 2-3 feature combinations by how much more common they are among runners
//                             than look-alikes (lift, lower 95% bound), non-redundant, and returns the frozen rule specs
//   nextBatch(...)            the weekly batch: only untested pool entries, and the counter that raises the luck bar
//   costReality(rows)         the same trades' average at 0.8% / 0.4% / 0.2% round-trip cost and whether the sign flips
// Run: node test/discovery2-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { luckBar, zInv, holdReturn, judgeNewer, discover, nextBatch, costReality, ruleText, ruleFires, FEATURES } from '../discovery2-core.mjs';

test('luck bar: 10 rules tested together need t 2.58 (one-sided 0.5%); 1 rule needs the 2.5 floor; it rises with the count', () => {
  assert.equal(luckBar(1), 2.5);
  assert.equal(luckBar(10), 2.58);
  assert.equal(luckBar(100), 3.29);
  assert.ok(luckBar(20) > luckBar(10));
  assert.ok(Math.abs(zInv(0.975) - 1.96) < 0.001);
});

test('hold return: no stop hit -> close of the h-th session over the next open', () => {
  //            t=0  t=1(entry) 2    3
  const O = [10, 10, 10.5, 11], L = [9.8, 9.9, 10.2, 10.8], C = [10, 10.4, 10.9, 12];
  assert.equal(+holdReturn(O, L, C, 0, 0, 3, 0.15).toFixed(4), 0.2);    // 12 / 10 - 1
});

test('hold return: the low touches the 15% stop -> sold at the stop; a gap below the stop -> sold at that open', () => {
  const O = [10, 10, 9, 7], L = [9.8, 9.9, 8.4, 6.5], C = [10, 9.5, 8.6, 7];
  assert.equal(+holdReturn(O, L, C, 0, 0, 3, 0.15).toFixed(4), -0.15);
  const O2 = [10, 10, 8, 7], L2 = [9.8, 9.9, 7.5, 6.5];
  assert.equal(+holdReturn(O2, L2, C, 0, 0, 3, 0.15).toFixed(4), -0.2);  // gapped to 8 under the 8.5 stop
  assert.equal(holdReturn(O, L, C, 0, 0, 5, 0.15), null);                 // the hold runs past the data
});

// trades on many days, each beating the average stock by a steady margin
const mk = (n, g, c, ob, h = 10) => Array.from({ length: n }, (_, k) => ({ t: 100 + k * h, s: 'S' + (k % 7), g: g + (k % 3) * 0.004, c, ob, h }));

test('judgeNewer: a steady winner passes tier 2 (net after 0.8% and 1.2%, beats average and own stock, without the 2 best, day and block t)', () => {
  const r = judgeNewer(mk(60, 0.05, 0.01, 0.015), 2.58);
  assert.equal(r.verdict, 'TRADABLE SMALL'); assert.equal(r.stat.n, 60);
  assert.ok(r.stat.avg > 0 && r.stat.avgStress > 0 && r.stat.edge > 0 && r.stat.vsOwn > 0 && r.stat.noTop2 > 0);
  assert.ok(r.stat.t >= 2.58 && r.stat.tBlock >= 2.58);
});

test('judgeNewer: under 20 trades -> TOO FEW CASES; loses after costs -> each failed gate is named', () => {
  assert.equal(judgeNewer(mk(19, 0.05, 0.01, 0.01), 2.58).verdict, 'TOO FEW CASES');
  const r = judgeNewer(mk(60, 0.002, 0.01, 0.0), 2.58);
  assert.equal(r.verdict, 'REJECTED');
  assert.match(r.why, /lost money after 0\.8% costs/); assert.match(r.why, /1\.2%/); assert.match(r.why, /average stock/);
});

test('judgeNewer: beats the average stock but not its own stock on other days -> NOT PROVEN', () => {
  const r = judgeNewer(mk(60, 0.05, 0.01, 0.08), 2.58);
  assert.equal(r.verdict, 'NOT PROVEN'); assert.match(r.why, /same stock on its other days/);
});

test('judgeNewer: one lucky trade carries it -> fails "without the 2 best"', () => {
  const T = mk(40, -0.001, -0.02, -0.02); T[0].g = 3; T[1].g = 2;
  const r = judgeNewer(T, 2.58); assert.match(r.why, /without its 2 best/);
});

// discovery: feature 0 high is 4x more common among runners; feature 1 is noise
const vec = (a, b) => { const v = new Float32Array(FEATURES.length).fill(NaN); v[0] = a; v[1] = b; return v; };
function sample(seed) { let x = seed; const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const R = [], C = []; for (let k = 0; k < 600; k++) R.push(vec(rnd() < 0.6 ? 0.9 : rnd() * 0.5, rnd())); for (let k = 0; k < 1800; k++) C.push(vec(rnd() < 0.15 ? 0.9 : rnd() * 0.5, rnd())); return { R, C }; }

test('discover: ranks the feature that is more common among runners first, freezes its threshold, and writes a plain spec', () => {
  const s = sample(7); const out = discover({ R10: { runners: s.R, controls: s.C, h: 10 } }, { top: 10, pool: 30, minRunners: 40 });
  assert.ok(out.rules.length >= 1 && out.rules.length <= 10);
  const r = out.rules[0]; assert.equal(r.hold, 10); assert.equal(r.stop, 0.15);
  assert.ok(r.conds.some(c => c.f === FEATURES[0].k && c.op === '>='));
  assert.ok(r.lift > 2 && r.liftLow > 1.5, 'lift ' + r.lift);
  assert.match(ruleText(r), /hold 10 sessions, stop 15%/);
  const f0 = new Float32Array(FEATURES.length).fill(NaN); f0[0] = 0.95; f0[1] = 0.5;
  assert.equal(ruleFires(r, f0), true);
  f0[0] = 0.1; assert.equal(ruleFires(r, f0), false);
  // no two frozen rules are the same idea (feature and direction, whatever the threshold), nor one inside the other
  for (const a of out.rules) for (const b of out.rules) if (a !== b && a.def === b.def) { const A = a.conds.map(c => c.f + c.op), B = new Set(b.conds.map(c => c.f + c.op)); assert.ok(!A.every(x => B.has(x))); }
  assert.ok(out.pool.length >= out.rules.length);
});

test('discover: a feature unknown for every runner is never chosen', () => {
  const s = sample(3); for (const v of s.R) v[0] = NaN;
  const out = discover({ R10: { runners: s.R, controls: s.C, h: 10 } }, { top: 10, pool: 30, minRunners: 40 });
  assert.ok(out.rules.every(r => r.conds.every(c => c.f !== FEATURES[0].k)));
});

test('nextBatch: takes only untested pool entries, numbers the counter, and the batch bar uses the new total', () => {
  const pool = Array.from({ length: 25 }, (_, k) => ({ id: 'D2-' + String(k + 1).padStart(3, '0') }));
  const b1 = nextBatch(pool, [], 10); assert.deepEqual(b1.ids, pool.slice(0, 10).map(x => x.id)); assert.equal(b1.testedTotal, 10); assert.equal(b1.bar, luckBar(10));
  const b2 = nextBatch(pool, b1.ids, 10); assert.equal(b2.ids[0], 'D2-011'); assert.equal(b2.testedTotal, 20); assert.equal(b2.bar, luckBar(20));
  const b3 = nextBatch(pool, [...b1.ids, ...b2.ids], 10); assert.equal(b3.ids.length, 5); assert.equal(b3.testedTotal, 25);
  assert.equal(nextBatch(pool, pool.map(x => x.id), 10), null);
});

test('costReality: the same gross trades at 0.8% / 0.4% / 0.2%; a rule whose sign changes is flagged as a flip', () => {
  const rows = costReality([{ source: 's', rule: 'A', gross: [0.01, 0.0, 0.002, 0.006] }, { source: 's', rule: 'B', gross: [0.05, 0.03] }, { source: 's', rule: 'C', avgGross: -0.01, n: 50 }]);
  const A = rows.find(r => r.rule === 'A'), B = rows.find(r => r.rule === 'B'), C = rows.find(r => r.rule === 'C');
  assert.equal(A.n, 4); assert.equal(A.at08, -0.0035); assert.equal(A.at04, 0.0005); assert.equal(A.at02, 0.0025); assert.equal(A.flip, 'loses at 0.8%, wins at 0.4%');
  assert.equal(B.flip, null); assert.equal(C.flip, null); assert.equal(C.at02, -0.012); assert.equal(C.method, 'stored average');
});
