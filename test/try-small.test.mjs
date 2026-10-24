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
  assert.match(L, /- BUY QLYS 1000 USD up to 195\.70.*STOP 161\.50/);
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
  assert.match(L, /- BUY QLYS 1000 USD up to 195\.70\. STOP 123\.50 at your broker \(35%\)\. SELL after about 6 months \(126 sessions\)/);
  assert.match(L, /DEC-FROG/);
  assert.doesNotMatch(L, /TPC/);
  assert.match(L, /MARK HALAL FIRST.*IVZ/);
});

// 23 Oct, night: DEC2-TPS (Connors TPS scale-in) was frozen PROVEN per dollar INVESTED, but it buys in 4 steps and on average only ~half
// of the planned position is ever bought; per dollar of the planned position (data/decoded-check.json "budget") it LOSES after costs
// (-0.25% / -0.13%). A rule whose budget check fails both-halves standard must not reach TRY SMALL.
test('a rule failing its per-budget check is excluded even if its frozen first run qualifies', async () => {
  const good = { verdict: 'PROVEN', results: { older: half(0.0067, 0.0114, 0.0105), newer: half(0.0107, 0.012, 0.014) } };
  const S5 = await loadScan({ files: { ...files, 'data/value-lab.json': { firstRun: {} },
    'data/decoded-history.json': { firstRun: { 'DEC2-TPS': good } },
    'data/decoded-check.json': { label: 'MONITORING CHECK ONLY: not a verdict; DEC2-TPS firstRun stays as frozen', budget: { older: half(-0.0065, 0.0048, -0.0026), newer: half(-0.005, 0.003, -0.001) } },
    'data/decoded-today.json': { generatedAt: now, methods: { 'DEC2-TPS': { newSignals: [{ sym: 'QLYS', close: 190 }] } } } } });
  assert.deepEqual(S5.fn('trySmallLines')({}, { QLYS: 190 }), []);
});

// 23 Oct, night: the anomaly lab (data/anomaly-lab.json, same frozen-first-run format) feeds TRY SMALL too. Qualifying on that night:
// ANOM-52WH (hold 126), ANOM-RESMOM (63), ANOM-SUESURGE (60). Each pick uses its rule's own hold; stop 15% for holds up to ~3 months,
// 35% (the tested disaster stop) for 6-month holds.
test('anomaly-lab rules that meet the standard give buys with their own hold', async () => {
  const S6 = await loadScan({ files: { ...files, 'data/value-lab.json': { firstRun: {} },
    'data/anomaly-lab.json': { firstRun: { 'ANOM-RESMOM': { verdict: 'NOT PROVEN', hold: 63, results: { older: half(0.02, 0.01, 0.015), newer: half(0.04, 0.02, 0.03) } }, 'ANOM-DN': { verdict: 'REJECTED', hold: 21, results: { older: half(-0.01, -0.01, -0.01), newer: half(0.01, 0.01, 0.01) } } } },
    'data/anomaly-today.json': { generatedAt: now, methods: { 'ANOM-RESMOM': { name: 'Residual momentum', hold: 63, newSignals: [{ sym: 'TPC', close: 78 }] }, 'ANOM-DN': { hold: 21, newSignals: [{ sym: 'QLYS', close: 190 }] } } } } });
  const L = S6.fn('trySmallLines')({}, { TPC: 78 }).join('\n');
  assert.match(L, /- BUY TPC 1000 USD up to 80\.34\. STOP 66\.30 at your broker \(15%\)\. SELL after about 3 months \(63 sessions\).*ANOM-RESMOM \(Residual momentum\)/);
  assert.doesNotMatch(L, /QLYS/);
});

// 24 Oct: every standard lab feeds TRY SMALL the same way (frozen first run in data/<lab>-lab.json, picks in data/<lab>-today.json):
// anomaly, expert, confluence, ml, angles. A new lab only has to write those two files.
test('the angles lab (and any standard lab) feeds TRY SMALL by the same standard', async () => {
  const S7 = await loadScan({ files: { ...files, 'data/value-lab.json': { firstRun: {} },
    'data/angles-lab.json': { firstRun: { 'ANG-X': { verdict: 'NOT PROVEN', hold: 20, results: { older: half(0.01, 0.01, 0.01), newer: half(0.02, 0.01, 0.02) } } } },
    'data/angles-today.json': { generatedAt: now, methods: { 'ANG-X': { name: 'Test angle', hold: 20, newSignals: [{ sym: 'TPC', close: 78 }] } } } } });
  const L = S7.fn('trySmallLines')({}, { TPC: 78 }).join('\n');
  assert.match(L, /- BUY TPC 1000 USD .*SELL after about 1 month \(20 sessions\).*ANG-X \(Test angle\)/);
});

// 24 Oct: owner's choice after the portfolio simulation: 1,000 USD a TRY SMALL trade (at 300 USD the 3 + 3 USD fees ate ~2% a trade).
test('TRY SMALL trades are 1,000 USD', () => { assert.equal(S.value('TRY_USD'), 1000); });

// 24 Oct: the macro lab showed tryQualifies would accept a rule frozen as TOO FEW CASES (war -> defense stocks: 2 wars in 2021-23).
// A rule must also have a usable sample in each half: verdict not REJECTED / TOO FEW CASES, 20+ trades and (when reported) 3+ blocks.
test('too few cases, too few trades or too few blocks never qualify', () => {
  const ok = (n, blocks) => ({ ...half(0.02, 0.01, 0.015), n, blocks });
  assert.deepEqual(q({ A: { verdict: 'TOO FEW CASES', results: { older: ok(40, 5), newer: ok(40, 5) } } }), []);
  assert.deepEqual(q({ A: { verdict: 'NOT PROVEN', results: { older: ok(12, 5), newer: ok(40, 5) } } }), []);
  assert.deepEqual(q({ A: { verdict: 'NOT PROVEN', results: { older: ok(40, 2), newer: ok(40, 5) } } }), []);
  assert.deepEqual(q({ A: { verdict: 'NOT PROVEN', results: { older: ok(40, 3), newer: ok(40, 5) } } }), ['A']);
});

// 24 Oct: the engine audit writes corrected re-runs next to the frozen first runs (data/<lab>.json correctedRun[id]; first-run.mjs
// effectiveRuns). TRY SMALL must act on the corrected run when one exists (AUD-1 yardstick cap, AUD-2 SUESURGE look-ahead).
test('a corrected run replaces the frozen first run for TRY SMALL', async () => {
  const bad = { verdict: 'NOT PROVEN', results: { older: half(-0.01, -0.01, -0.01), newer: half(0.02, 0.01, 0.02) } };
  const S8 = await loadScan({ files: { ...files, 'data/value-lab.json': { firstRun: {} },
    'data/anomaly-lab.json': { firstRun: { 'ANOM-X': { verdict: 'NOT PROVEN', hold: 60, results: { older: half(0.02, 0.01, 0.015), newer: half(0.04, 0.02, 0.03) } } }, correctedRun: { 'ANOM-X': bad } },
    'data/anomaly-today.json': { generatedAt: now, methods: { 'ANOM-X': { hold: 60, newSignals: [{ sym: 'TPC', close: 78 }] } } } } });
  assert.deepEqual(S8.fn('trySmallLines')({}, { TPC: 78 }), []);
});
test('ANOM-SUESURGE is paused until its corrected run exists', () => {
  const r = { verdict: 'NOT PROVEN', results: { older: half(0.02, 0.01, 0.015), newer: half(0.04, 0.02, 0.03) } };
  assert.deepEqual(q({ 'ANOM-SUESURGE': r }), []);
  assert.deepEqual(q({ 'ANOM-SUESURGE': { ...r, corrected: true } }), ['ANOM-SUESURGE']);
});
// 24 Oct: Squad 4's SQ4-GROWLEAD passed the per-trade checks but earned less per year than the S&P 500 in both halves (15.3% vs 18.9%,
// 12.1% vs 15.8%). Holding SPUS did better, so TRY SMALL must not buy it. Rules without a per-year measure are unaffected.
test('a rule that loses to the S&P 500 per year does not qualify', () => {
  const r = { verdict: 'NOT PROVEN', results: { older: half(0.02, 0.01, 0.015), newer: half(0.04, 0.02, 0.03) } };
  assert.deepEqual(q({ A: { ...r, perYear: { older: { rule: 0.153, spy: 0.189 }, newer: { rule: 0.121, spy: 0.158 } } } }), []);
  assert.deepEqual(q({ A: { ...r, perYear: { older: { rule: 0.25, spy: 0.189 }, newer: { rule: 0.121, spy: 0.158 } } } }), []);
  assert.deepEqual(q({ A: { ...r, perYear: { older: { rule: 0.25, spy: 0.189 }, newer: { rule: 0.2, spy: 0.158 } } } }), ['A']);
  assert.deepEqual(q({ A: r }), ['A']);
});
test('SQ1-BBAUTH is paused until its corrected run exists (survivorship bug found by the independent re-check)', () => {
  const r = { verdict: 'NOT PROVEN', results: { older: half(0.02, 0.01, 0.015), newer: half(0.04, 0.02, 0.03) } };
  assert.deepEqual(q({ 'SQ1-BBAUTH': r }), []);
});
test('a basket whose whole-portfolio test lagged SPY does not qualify (SQ5-TOP20-TF, 24 Oct)', () => {
  const r = { verdict: 'NOT PROVEN', results: { older: half(0.02, 0.01, 0.015), newer: half(0.04, 0.02, 0.03) } };
  assert.deepEqual(q({ A: { ...r, portfolio: { standard: { halves: { older: { beatsSpy: false }, newer: { beatsSpy: false } } } } } }), []);
  assert.deepEqual(q({ A: { ...r, portfolio: { standard: { halves: { older: { beatsSpy: true }, newer: { beatsSpy: true } } } } } }), ['A']);
});
