// Seams: agent-a-tgt-core.mjs (A-TGT1, Agent A, 25 Oct 2026: targets / trailing / stop exits on SQ11-PB12, SQ6-MTUM, SQ6-QMOM).
// Run: node --test test/agent-a-tgt-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, EXIT_KEYS, BASE_KEYS, targetExit, trailExit, stopExit, applyExit, sameWindow, adoptExit, preRegister, halfOf } from '../agent-a-tgt-core.mjs';
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;

test('registry: 5 exits x 3 bases, holds from the bases', () => {
  assert.equal(IDS.length, 15); assert.equal(EXIT_KEYS.length, 5); assert.equal(BASE_KEYS.length, 3);
  assert.equal(RULES['A-TGT-TGT10-PB12'].hold, 126); assert.equal(RULES['A-TGT-STOP10-QMOM'].hold, 63); assert.ok(RULES['A-TGT-STOP10-MTUM'].papers.length);
  for (const id of IDS) assert.ok(RULES[id].rule.length > 80, id);
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('target: first high at the target sells at the target; a gap over it sells at the open; never past x', () => {
  const S = { o: [10, 10, 10.5, 12, 12], h: [10, 10.4, 11.1, 12.5, 12.5], c: [10, 10.2, 10.8, 12.2, 12.4] };
  const e = targetExit(S, { k: 1, x: 4, px0: 10 }, 0.10); assert.equal(e.q, 2); assert.ok(near(e.px, 11)); assert.equal(e.how, 'target');
  const S2 = { o: [10, 10, 10.5, 12, 12], h: [10, 10.4, 10.9, 12.5, 12.5], c: [10, 10.2, 10.8, 12.2, 12.4] };
  const g = targetExit(S2, { k: 1, x: 4, px0: 10 }, 0.10); assert.equal(g.q, 3); assert.equal(g.px, 12); assert.equal(g.how, 'gap over the target');
  assert.equal(targetExit(S2, { k: 1, x: 2, px0: 10 }, 0.10), null, 'the target is after the planned sale');
  const S3 = { o: [10, 10, 10], h: [NaN, NaN, NaN], c: [10, 10.5, 11.6] }; assert.equal(targetExit(S3, { k: 1, x: 2, px0: 10 }, 0.15).q, 2, 'no high: the close counts');
});

test('trailing 10%: from the highest close (buy counts), sold at the next open; not on the planned sale day', () => {
  const S = { o: [10, 10, 11, 12, 11, 10.5, 10], c: [10, 11, 12, 11.5, 10.7, 10.4, 10] };   // peak 12 at 2; 10.7 <= 10.8 at 4 -> open of 5
  const e = trailExit(S, { k: 1, x: 6, px0: 10 }, 0.10, 6, 7); assert.equal(e.q, 5); assert.equal(e.px, 10.5); assert.equal(e.at, 4);
  assert.equal(trailExit(S, { k: 1, x: 4, px0: 10 }, 0.10, 6, 7), null, 'the trigger close is the planned sale itself');
  const S2 = { o: [10, 10, 9], c: [10, 8.9, 9] }; assert.equal(trailExit(S2, { k: 1, x: 2, px0: 10 }, 0.10, 2, 3).q, 2, 'the buy price is the first high');
});

test('stop 10% from the buy; next open; a gone stock is sold at the trigger close; past the data -> open', () => {
  const S = { o: [10, 10, 9.5, 8.8, 9], c: [10, 9.6, 8.9, 9, 9.2] };
  const e = stopExit(S, { k: 1, x: 4, px0: 10 }, 0.10, 4, 5); assert.equal(e.q, 3); assert.equal(e.px, 8.8);
  const G = { o: [10, 10, 9], c: [10, 9.5, 8.9] }; const g = stopExit(G, { k: 1, x: 3, px0: 10 }, 0.10, 2, 20); assert.deepEqual([g.q, g.px], [2, 8.9]);
  const L = { o: [10, 10, 9], c: [10, 9.5, 8.9] }; assert.ok(stopExit(L, { k: 1, x: 3, px0: 10 }, 0.10, 2, 3).open);
  assert.equal(applyExit(S, { k: 1, x: 4, px0: 10 }, 'STOP10', 4, 5).q, 3);
});

test('same window over all trades and the adoption test', () => {
  const rows = []; for (let j = 0; j < 12; j++) rows.push({ g: 0.10, base: 0.05, fired: true }); rows.push({ g: 0.2, base: 0.2, fired: false });
  const s = sameWindow(rows); assert.equal(s.n, 13); assert.equal(s.fired, 12); assert.ok(near(s.diff, 0.6 / 13, 1e-4)); assert.equal(s.firedBetter, 1);
  const good = adoptExit({ older: s, newer: s }, { older: 0.3, newer: 0.3 }, { older: 0.2, newer: 0.2 }); assert.equal(good.adopt, true);
  const low = adoptExit({ older: s, newer: s }, { older: 0.3, newer: 0.1 }, { older: 0.2, newer: 0.2 }); assert.equal(low.adopt, false); assert.match(low.why, /newer: per year/);
  const few = sameWindow(rows.slice(5)); assert.equal(adoptExit({ older: few, newer: s }, { older: 1, newer: 1 }, { older: 0, newer: 0 }).adopt, false);
  const worse = sameWindow(rows.map(z => ({ ...z, g: z.base - 0.01 }))); assert.equal(adoptExit({ older: worse, newer: s }, { older: 1, newer: 1 }, { older: 0, newer: 0 }).adopt, false);
});

test('pre-registration is idempotent', () => {
  const LB = { strategies: [] }; assert.equal(preRegister(LB), 15); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies[0].agent, 'A'); assert.match(LB.strategies[0].status, /^pre-registered/);
});
