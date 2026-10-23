// Seam: tryQualifies(firstRun) and trySmallLines(pos, lastPx) in scan.mjs: the TRY SMALL lane (owner's request 23 Oct 2026:
// "find a way to make money ... do it all"). Pre-registered here before any live use:
//   a rule qualifies when its FROZEN first run made money after the 1.2% stress cost in BOTH halves, beat the average stock in both,
//   and stayed positive without its 2 best trades in both. The luck bar is NOT required: that is why it is a separate, smaller lane.
//   300 USD a trade, max 2 open, only stocks with the owner's ZAD halal mark 'ok' (unknown -> "mark halal first"), stop 15% under the
//   buy, sold after about 3 months (63 sessions). Off when settings.trySmall is false, or after 10+ resolved ledger cases average < 0.
// Run: node test/try-small.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const half = (avgStress, edge, noTop2) => ({ avgStress, edge, noTop2, avg: avgStress + 0.004 });
const FR = { 'B-FCF1': { verdict: 'NOT PROVEN', results: { older: half(0.0347, 0.0226, 0.0362), newer: half(0.0532, 0.0289, 0.0474) } },
  'B-EM1': { verdict: 'REJECTED', results: { older: half(-0.009, -0.006, -0.01), newer: half(0.015, 0.006, 0.01) } },
  'B-SIF1': { verdict: 'REJECTED', results: { older: half(0.010, -0.0002, 0.005), newer: half(0.064, 0.035, 0.02) } } };
const now = new Date().toISOString();
const VT = { generatedAt: now, rules: { 'B-FCF1': { picks: [
  { sym: 'QLYS', lastClose: 190.08, blocked: false }, { sym: 'TPC', lastClose: 78.27, blocked: false },
  { sym: 'PRK', lastClose: 177.72, blocked: true }, { sym: 'IVZ', lastClose: 28.29, blocked: false }, { sym: 'BADX', lastClose: 10, blocked: false } ] } } };
const files = { 'data/value-lab.json': { firstRun: FR }, 'data/value-today.json': VT,
  'data/halal.json': { QLYS: { s: 'ok', d: '2026-10-23', by: 'you' }, TPC: { s: 'ok', d: '2026-10-23', by: 'you' }, BADX: { s: 'fail', d: '2026-10-23', by: 'you' } } };

const S = await loadScan({ files });
const q = S.fn('tryQualifies'), lines = S.fn('trySmallLines');

test('only a rule positive after stress cost, ahead of the average stock and positive without its 2 best in BOTH halves qualifies', () => {
  assert.deepEqual(q(FR), ['B-FCF1']);
});

test('halal-ok picks become 300 USD buys with a 15% stop; unknown ones ask for a mark; failed and blocked ones are dropped', () => {
  const L = lines({}, { QLYS: 190, TPC: 78 }).join('\n');
  assert.match(L, /^TRY SMALL/);
  assert.match(L, /- BUY QLYS 300 USD up to 195\.70.*STOP 161\.50/);
  assert.match(L, /- BUY TPC/);
  assert.match(L, /MARK HALAL FIRST.*IVZ/);
  assert.doesNotMatch(L, /PRK|BADX/);
  const led = S.read('data/tier2-ledger.jsonl');
  assert.match(led, /"sym":"QLYS","kind":"try:B-FCF1"/);
});

test('max 2 open: with 2 TRY SMALL positions held, no new buys', () => {
  const pos = { AAA: { src: 'try small' }, BBB: { src: 'try small' } };
  assert.doesNotMatch(lines(pos, { QLYS: 190 }).join('\n'), /- BUY/);
});

test('switched off in settings: nothing shown', async () => {
  const S2 = await loadScan({ files: { ...files, 'data/settings.json': { trySmall: false } } });
  assert.deepEqual(S2.fn('trySmallLines')({}, { QLYS: 190 }), []);
});

test('its own ledger negative after 10+ resolved cases: that rule is off', async () => {
  const bad = Array.from({ length: 10 }, (_, i) => ({ d: '2026-09-0' + (i % 9 + 1), sym: 'X' + i, kind: 'try:B-FCF1', px: 10, out: '2026-10-10', px1: 9, pct: -0.108 }));
  const S3 = await loadScan({ files: { ...files, 'data/tier2-ledger.jsonl': bad } });
  assert.doesNotMatch(S3.fn('trySmallLines')({}, { QLYS: 190 }).join('\n'), /- BUY/);
});

test('no network was used', () => assert.deepEqual(blocked, []));

// 23 Oct, evening: the decoded lab's frozen first runs also qualify under the SAME pre-registered TRY SMALL standard. DEC-FROG (frog in
// the pan) made +5.9% / +10.7% after the 1.2% stress cost, beat the average stock by +5.6% / +3.9%, and stayed positive without its 2
// best, in both halves. It is held 126 sessions by its own rule (no stop in the test); TRY SMALL adds the system's tested 35% disaster
// stop. Picks come from data/decoded-today.json on its monthly formation day.
test('a decoded-lab rule that meets the standard gives buys with its own hold and a 35% stop', async () => {
  const S4 = await loadScan({ files: { ...files, 'data/value-lab.json': { firstRun: {} },
    'data/decoded-history.json': { firstRun: { 'DEC-FROG': { verdict: 'NOT PROVEN', results: { older: half(0.0594, 0.0556, 0.0521), newer: half(0.1069, 0.0394, 0.0964) } }, 'DEC-QBO': { verdict: 'REJECTED', results: { older: half(-0.02, -0.01, -0.03), newer: half(-0.01, -0.01, -0.02) } } } },
    'data/decoded-today.json': { generatedAt: now, methods: { 'DEC-FROG': { newSignals: [{ sym: 'QLYS', close: 190, halal: 'ok' }, { sym: 'IVZ', close: 28 }] }, 'DEC-QBO': { newSignals: [{ sym: 'TPC', close: 78 }] } } } } });
  const L = S4.fn('trySmallLines')({}, { QLYS: 190 }).join('\n');
  assert.match(L, /- BUY QLYS 300 USD up to 195\.70\. STOP 123\.50 at your broker \(35%\)\. SELL after about 6 months \(126 sessions\)/);
  assert.match(L, /DEC-FROG/);
  assert.doesNotMatch(L, /TPC/);
  assert.match(L, /MARK HALAL FIRST.*IVZ/);
});
