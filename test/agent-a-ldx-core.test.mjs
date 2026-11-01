// Seams: agent-a-ldx-core.mjs (A-LDX1, Agent A, 1 Nov 2026: exit questions on the live LEADER DIP lane).
// Run: node --test test/agent-a-ldx-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { IDS, VARIANTS, liveExit, halfwayExit, trendExit, smaOf, armStats, compare, adoptLdx, preRegister, halfOf } from '../agent-a-ldx-core.mjs';

test('registry: three pre-registered variants, none of them TGT20 itself', () => {
  assert.deepEqual(IDS, ['LDX-HALF63', 'LDX-T200', 'LDX-TIME189']);
  assert.equal(VARIANTS['LDX-TIME189'].hold, 189); assert.equal(VARIANTS['LDX-HALF63'].check, 63);
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('live exit: +20% limit, else the planned close', () => {
  const S = { o: [10, 10, 11, 11], h: [10, 11, 12.1, 12], c: [10, 10.5, 11.5, 11.8] };
  assert.deepEqual(liveExit(S, { k: 1, x: 3, px0: 10, px1: 11.8, kind: 'max' }), { q: 2, px: 12, how: 'target', atOpen: false });
  const S2 = { o: [10, 10, 10, 10], h: [10, 10.5, 10.5, 10.5], c: [10, 10, 10, 10.2] };
  assert.equal(liveExit(S2, { k: 1, x: 3, px0: 10, px1: 10.2, kind: 'max' }).how, 'max');
});

test('halfway: under the buy at session 63 -> next open; at or above, or target first -> live', () => {
  const n = 130, mk = (v) => ({ o: Array(n).fill(v), h: Array(n).fill(v), c: Array(n).fill(v) });
  const S = mk(9); const tr = { k: 1, x: 126, px0: 10, px1: 9, kind: 'max' }, live = liveExit(S, tr);
  const e = halfwayExit(S, tr, live); assert.equal(e.q, 64); assert.equal(e.how, 'halfway'); assert.equal(e.atOpen, true);   // m = 63, next open 64
  const U = mk(10); assert.equal(halfwayExit(U, { ...tr, px1: 10 }, liveExit(U, { ...tr, px1: 10 })).how, 'max', 'at the buy price is not under it');
  const W = mk(9); W.h[10] = 12.5; const lw = liveExit(W, tr); assert.equal(lw.q, 10); assert.equal(halfwayExit(W, tr, lw).q, 10, 'target before the check');
  assert.equal(halfwayExit(S, { ...tr, x: 63 }, liveExit(S, { ...tr, x: 63 })).q, 63, 'check day is the planned sale');
});

test('200-day average and the trend break', () => {
  const c = Array.from({ length: 205 }, (_, i) => i + 1), s = smaOf(c, 200);
  assert.equal(s[198], null); assert.equal(s[199], 100.5); assert.equal(s[204], 105.5);
  const n = 260, S = { o: Array(n).fill(100), h: Array(n).fill(100), c: Array(n).fill(100) }; for (let q = 220; q < n; q++) S.c[q] = 90;
  const sma = smaOf(S.c, 200), tr = { k: 210, x: 250, px0: 100, px1: 90, kind: 'max' }, e = trendExit(S, tr, liveExit(S, tr), sma);
  assert.equal(e.q, 221); assert.equal(e.how, 'trend');
  assert.equal(trendExit(S, { ...tr, x: 220 }, liveExit(S, { ...tr, x: 220 }), sma).q, 220, 'trigger on the planned sale day: live');
});

test('stats, compare and the adoption test', () => {
  const rows = [{ sym: 'A', sig: 'd1', k: 0, px0: 10, base: { q: 9, px: 11 }, alt: { q: 4, px: 10.5 } }, { sym: 'B', sig: 'd2', k: 0, px0: 10, base: { q: 9, px: 9 }, alt: { q: 9, px: 9 } }];
  const c = compare(rows); assert.equal(c.fired, 1); assert.ok(Math.abs(c.diff - (-0.025)) < 1e-9);
  const a = armStats(rows, 'base'); assert.equal(a.n, 2); assert.equal(a.stocks, 2); assert.equal(a.win, 0.5);
  const good = { fired: 20, diff: 0.01 }, L = { perYear: 0.2 }, X = { perYear: 0.25 }, acc = { cost: { alt: 3500, live: 3400 }, stress: { alt: 3450, live: 3350 } };
  assert.equal(adoptLdx({ older: good, newer: good }, { older: L, newer: L }, { older: X, newer: X }, { older: acc, newer: acc }).adopt, true);
  const bad = adoptLdx({ older: good, newer: good }, { older: L, newer: L }, { older: X, newer: X }, { older: acc, newer: { cost: { alt: 3300, live: 3400 }, stress: acc.stress } });
  assert.equal(bad.adopt, false); assert.match(bad.why, /newer: 3-slot account at 0.8%/);
});

test('library pre-registration is idempotent', () => {
  const LB = { strategies: [] }; assert.equal(preRegister(LB), 3); assert.equal(preRegister(LB), 0);
  assert.ok(LB.strategies.every(e => e.agent === 'A' && e.kind === 'exit' && /pre-registered 2026-11-01/.test(e.status)));
});
