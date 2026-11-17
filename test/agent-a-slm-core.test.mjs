// A-SLM1 (Agent A, 17 Nov 2026): pre-registered stop-loss momentum rule and judging (agent-a-slm-core.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { slmTrade, halfStats, gates, judgeSlm, preRegister, recordResult, STOP, CAP } from '../agent-a-slm-core.mjs';

test('no stop hit: both books exit at the regular open', () => {
  const z = slmTrade([100, 101, 99, 103], [101, 98, 102, 104], 3);
  assert.equal(z.stopped, false); assert.ok(Math.abs(z.noStop - 0.03) < 1e-9); assert.equal(z.stop, z.noStop);
});

test('a close 10% under the entry open sells at the next open, gap included; the no-stop book holds', () => {
  const z = slmTrade([100, 95, 85, 120], [96, 90, 88, 121], 3);
  assert.equal(z.stopped, true); assert.equal(z.stopJ, 1); assert.ok(Math.abs(z.stop - (-0.15)) < 1e-9); assert.ok(Math.abs(z.noStop - 0.2) < 1e-9);
  assert.equal(STOP, 0.1);
  const edge = slmTrade([100, 95, 90.5], [95, 90.0001, 91], 2); assert.equal(edge.stopped, false);
});

test('a stock that stops trading is valued at its last close in both books', () => {
  const z = slmTrade([100, 80, NaN, NaN], [95, 70, NaN, NaN], 3, 1);
  assert.equal(z.stopped, true); assert.ok(Math.abs(z.stop - (-0.3)) < 1e-9); assert.ok(Math.abs(z.noStop - (-0.3)) < 1e-9);
});

test('returns are capped at +300%; missing regular exit bar drops the trade', () => {
  assert.equal(slmTrade([1, 2, 6], [2, 5, 6], 2).noStop, CAP);
  assert.equal(slmTrade([100, 101, NaN], [100, 101, 102], 2), null);
  assert.equal(slmTrade([NaN, 1, 1], [1, 1, 1], 2), null);
});

const mk = (n, months, f) => { const a = []; for (let m = 0; m < months; m++) for (let k = 0; k < n; k++) a.push(f(m, k)); return a; };
const tr = (m, k, g, g0, c = 0, own = 0, spy = 0.005) => ({ d: '2025-' + String(m % 12 + 1).padStart(2, '0') + '-' + String(10 + (m / 12 | 0)).padStart(2, '0'), s: 'S' + k, g, g0, c, own, spy, stopped: g !== g0, stopDay: g !== g0 ? 'x' + m : null });

test('halfStats counts trades, days, stocks, stops and per-year vs SPY', () => {
  const a = mk(3, 12, (m, k) => tr(m, k, 0.02 + (k - 1) * 0.001 + (m % 2) * 0.003, 0.02));
  const s = halfStats(a, 'g', 0.008);
  assert.equal(s.n, 36); assert.equal(s.days, 12); assert.equal(s.stocks, 3); assert.ok(s.avg > 0.012 && s.avg < 0.015); assert.ok(s.perYear > s.spyPerYear); assert.ok(s.blockT > 2.5);
});

test('judging: a clean winner with a helpful stop is PROVEN only above the luck bar; otherwise REJECTED with reasons', () => {
  const half = (good) => { const a = mk(5, 24, (m, k) => tr(m, k, good ? 0.03 + (k - 2) * 0.002 + (m % 3) * 0.002 : -0.02, good ? 0.025 + (k - 2) * 0.002 + (m % 3) * 0.002 : -0.025, 0, 0));
    return { stop: { base: halfStats(a, 'g', 0.008), stress: halfStats(a, 'g', 0.012) }, noStop: { base: halfStats(a, 'g0', 0.008), stress: halfStats(a, 'g0', 0.012) } }; };
  const good = judgeSlm({ older: half(true), newer: half(true) }, 4.12);
  assert.ok(good.stopHelps);
  assert.ok(['PROVEN', 'tier 2'].includes(good.level));
  const bad = judgeSlm({ older: half(false), newer: half(true) }, 4.12);
  assert.equal(bad.level, 'none'); assert.match(bad.verdict, /^REJECTED/); assert.ok(bad.why.some(w => /older half/.test(w)));
  assert.equal(Object.keys(gates(half(true).stop)).length, 7);
});

test('library hooks: pre-register once, record the frozen result once', () => {
  const LB = { strategies: [{ id: 'A-SLM1', status: 'queued (Agent A)' }] };
  assert.equal(preRegister(LB), 1); assert.equal(preRegister(LB), 0); assert.match(LB.strategies[0].status, /^pre-registered/);
  const first = { 'A-SLM1': { frozenAt: 'x', summary: [], judged: { verdict: 'REJECTED; STOP DOES NOT HELP', level: 'none', why: ['w'], stopHelps: false } } };
  assert.equal(recordResult(LB, first), 1); assert.equal(recordResult(LB, first), 0); assert.equal(LB.strategies[0].status, 'tested: rejected; stop does not help');
});
