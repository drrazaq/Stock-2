import test from 'node:test';
import assert from 'node:assert/strict';
import { icSignals, parseFinra, isListed, siCheck, dtcCut, settleCandidates, avoidStat, avoidJudge, trySmallBar, spyGate, preRegister, RULE_IDS, SI, IC } from '../agent-c3-core.mjs';

test('C-IC1: cluster and 8-K within 9 sessions; entry after both are public; 60-session gap per stock', () => {
  const clusters = [{ i: 1, Sc: 100, Kc: 101, d: '2024-03-01' }, { i: 1, Sc: 130, Kc: 131, d: '2024-04-01' }, { i: 1, Sc: 200, Kc: 201, d: '2024-07-01' }, { i: 2, Sc: 50, Kc: 51, d: '2022-01-03' }];
  const contracts = [{ i: 1, R: 105, d: '2024-03-08' }, { i: 1, R: 135, d: '2024-04-07' }, { i: 1, R: 220, d: '2024-07-30' }, { i: 2, R: 41, d: '2021-12-20' }, { i: 3, R: 10, d: '2021-11-20' }];
  const s = icSignals(clusters, contracts);
  assert.equal(s.length, 2);
  assert.deepEqual([s[0].i, s[0].k], [2, 51]);             // 8-K 9 sessions before the cluster: entry after the cluster
  assert.deepEqual([s[1].i, s[1].k], [1, 106]);            // 8-K 5 sessions after the cluster: entry R + 1
  assert.equal(s[1].d, '2024-03-08');                      // signal date = the later of the two
  assert.equal(icSignals(clusters, contracts, { gap: 20 }).length, 3);   // the April match counts only with a shorter gap; July is 20 apart (no match)
  assert.equal(icSignals([{ i: 4, Sc: 10, Kc: 11, d: '2022-01-01' }], [{ i: 4, R: 20, d: '2022-01-15' }]).length, 0);   // 10 apart: no match
  assert.equal(IC.matchGap, 9); assert.equal(IC.hold, 20);
});

test('FINRA file: header, listed rows, split flag, DTC', () => {
  const txt = 'accountingYearMonthNumber|symbolCode|issueName|issuerServicesGroupExchangeCode|marketClassCode|currentShortPositionQuantity|previousShortPositionQuantity|stockSplitFlag|averageDailyVolumeQuantity|daysToCoverQuantity|revisionFlag|changePercent|changePreviousNumber|settlementDate\n' +
    '20211130|AAPL|Apple Inc. Common Stock|R|NNM|112598907|99688619||102461927|1.10||12.95|12910288|2021-11-30\n' +
    '20211130|AMC|AMC ENTERTAINMENT HOLDINGS, IN|A|NYSE|83406245|87462304|S|26730397|3.12||-4.64|-4056059|2021-11-30\n' +
    '20211130|ABCD|Some OTC Co|U|OTC|100|0||10|10.00||0|100|2021-11-30\n';
  const p = parseFinra(txt); assert.equal(p.header, true); assert.equal(p.rows.length, 3);
  assert.deepEqual(p.rows[0], { sym: 'AAPL', mkt: 'NNM', short: 112598907, settle: '2021-11-30', split: '', adv: 102461927, dtc: 1.1 });
  assert.equal(p.rows[1].split, 'S');
  assert.equal(p.rows.filter(r => isListed(r.mkt)).length, 2);
  assert.equal(parseFinra('a|b\n1|2').header, false);
});

test('short ratio flag and data errors', () => {
  assert.deepEqual(siCheck(25, 100), { flag: true, ratio: 0.25, why: null });
  assert.equal(siCheck(20, 100).flag, false);               // exactly 20% is not over 20%
  assert.equal(siCheck(150, 100).why, 'dataError');
  assert.equal(siCheck(10, null).why, 'noShares');
  assert.equal(SI.pubLag, 9); assert.equal(SI.minRatio, 0.2);
});

test('DTC top-10% cut needs 200 rows', () => {
  const v = Array.from({ length: 200 }, (_, j) => j + 1);   // 1..200
  assert.equal(dtcCut(v), 181);                             // the 20 largest are 181..200
  assert.equal(dtcCut(v.slice(0, 199)), null);
});

test('settlement candidates walk back from the 15th and the month end', () => {
  const c = settleCandidates('2024-02'); assert.equal(c[0][0], '2024-02-15'); assert.equal(c[0].length, 7); assert.equal(c[1][0], '2024-02-29'); assert.equal(c[1][6], '2024-02-23');
});

test('avoid test: t is the weaker of day t and block t; gates', () => {
  const mk = (n, edge, t0) => Array.from({ length: n }, (_, j) => ({ t: t0 + j * 10, s: 'S' + (j % 7), g: edge + ((j * 37) % 11 - 5) / 500, c: 0, sp: 0, ob: 0 }));
  const R = { older: avoidStat(mk(40, -0.05, 0), 20), newer: avoidStat(mk(40, -0.05, 1000), 20) };
  assert.ok(R.older.edge < 0); assert.ok(Math.abs(R.older.t) <= Math.abs(R.older.tDay) && Math.abs(R.older.t) <= Math.abs(R.older.tBlock));
  const v = avoidJudge(R, 4.1); assert.equal(v.verdict, 'PROVEN AVOID'); assert.equal(v.level, 'PROVEN');
  const R2 = { older: avoidStat(mk(40, -0.05, 0), 20), newer: avoidStat(mk(40, 0.01, 1000), 20) };
  assert.equal(avoidJudge(R2, 4.1).verdict, 'REJECTED');
  assert.equal(avoidJudge({ older: avoidStat(mk(10, -0.05, 0), 20), newer: avoidStat(mk(40, -0.05, 1000), 20) }, 4.1).verdict, 'TOO FEW CASES');
});

test('TRY SMALL bar and S&P gate (same as lab 2)', () => {
  const ok = { n: 25, blocks: 4, avgStress: 0.01, edge: 0.01, noTop2: 0.01 };
  assert.equal(trySmallBar({ older: ok, newer: ok }), true); assert.equal(trySmallBar({ older: ok, newer: { ...ok, n: 19 } }), false);
  assert.deepEqual(spyGate([{ half: 'older', g: 0.05, spy: 0.01 }, { half: 'newer', g: 0.05, spy: 0.01 }]), []);
  assert.equal(spyGate([{ half: 'older', g: 0.01, spy: 0.01 }, { half: 'newer', g: 0.05, spy: 0.01 }]).length, 1);
});

test('library pre-registration is idempotent and covers every rule', () => {
  const LB = { strategies: [{ id: 'C-IC1', status: 'queued (Agent C)' }, { id: 'C-SI1', status: 'queued (Agent C)' }] };
  const n = preRegister(LB); assert.ok(n >= 3); assert.equal(preRegister(LB), 0);
  for (const id of RULE_IDS) { const e = LB.strategies.find(x => x.id === id); assert.ok(e && e.rule && /pre-registered/.test(e.status), id); }
});
