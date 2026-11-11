// Seams: research-core.mjs IDEA 15 (daily researcher, 11 Nov 2026): FINRA daily short sale volume. File parser, week starts, window
// score, cross-section percentile and sides, data rule, pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, ONE_OPEN, SVOL, SVOL_IDS, svolUrl, svolParse, weekStarts, svolScore, svolRank, svolSide, svolDataRule, preRegister } from '../research-core.mjs';

test('three svol rules: two buys and one avoid, holds and windows fixed, one open trade per stock', () => {
  assert.deepEqual(SVOL_IDS, ['RQ-SVOL-LOW21', 'RQ-SVOL-LOW63P', 'RQ-SVOL-HIGH21']);
  assert.deepEqual(SVOL_IDS.map(id => RULES[id].hold), [21, 63, 21]);
  assert.deepEqual(SVOL_IDS.map(id => RULES[id].kind), ['buy', 'buy', 'avoid']);
  assert.deepEqual(SVOL_IDS.map(id => RULES[id].win + '/' + RULES[id].side), ['short/low', 'long/low', 'short/high']);
  for (const id of SVOL_IDS) { assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); }
  assert.ok(BUY_IDS.includes('RQ-SVOL-LOW21') && BUY_IDS.includes('RQ-SVOL-LOW63P') && !BUY_IDS.includes('RQ-SVOL-HIGH21'));
  assert.equal(SVOL.short, 5); assert.equal(SVOL.long, 63); assert.equal(SVOL.low, 0.2); assert.equal(SVOL.high, 0.8); assert.equal(SVOL.minCross, 500);
});
test('url: consolidated file for the session date', () => {
  assert.equal(svolUrl('2021-11-01'), 'https://cdn.finra.org/equity/regsho/daily/CNMSshvol20211101.txt');
});
test('parser: ratio = short / total, header and trailer skipped, zero total skipped, duplicates summed', () => {
  const txt = 'Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market\n20211101|AAPL|400|5|1000|B,Q,N\n20211101|ZERO|0|0|0|Q\n20211101|brk.b|30|0|100|N\n20211101|DUP|10|0|100|Q\n20211101|DUP|30|0|100|N\n20211101|BAD|x|0|100|Q\n20211101|OVER|200|0|100|Q\n1234\r\n';
  const m = svolParse(txt);
  assert.equal(m.get('AAPL'), 0.4); assert.equal(m.get('BRK.B'), 0.3); assert.equal(m.get('DUP'), 0.2);
  assert.ok(!m.has('ZERO') && !m.has('BAD') && !m.has('OVER')); assert.equal(m.size, 3);
  assert.equal(svolParse(null).size, 0);
});
test('week starts: first session of each Monday-based week, holidays handled', () => {
  const D = ['2026-11-02', '2026-11-03', '2026-11-06', '2026-11-10', '2026-11-11', '2026-11-16', '2026-12-31', '2027-01-04'];
  assert.deepEqual(weekStarts(D), [3, 5, 6, 7]);   // Tue 10 Nov after a Monday holiday counts; Thu 31 Dec starts its week
});
test('score: mean of the sessions before k only, minimum count enforced', () => {
  const v = [0.1, 0.2, null, 0.4, 0.5, 0.9];
  assert.equal(svolScore(u => v[u], 5, 5, 4), (0.1 + 0.2 + 0.4 + 0.5) / 4);   // index 5 (session k) is never used
  assert.equal(svolScore(u => v[u], 5, 5, 5), null);
  assert.equal(svolScore(u => v[u], 2, 5, 2), (0.1 + 0.2) / 2);
});
test('rank and sides: 500+ stocks needed; bottom 20% = low, top 20% = high', () => {
  const list = Array.from({ length: 501 }, (_, j) => ({ key: j, s: j / 1000 }));
  const R = svolRank(list); assert.equal(R.size, 501);
  assert.equal(svolSide(R.get(0)), 'low'); assert.equal(svolSide(R.get(100)), 'low'); assert.equal(svolSide(R.get(101)), null);
  assert.equal(svolSide(R.get(500)), 'high'); assert.equal(svolSide(R.get(250)), null); assert.equal(svolSide(null), null);
  assert.equal(svolRank(list.slice(0, 499)).size, 0);
});
test('data rule: files, liquid rows and weeks', () => {
  assert.equal(svolDataRule({ sessions: 1000, files: 980, liqRows: 100, liqWithRow: 90, weeks: 220 }).ok, true);
  const bad = svolDataRule({ sessions: 1000, files: 900, liqRows: 100, liqWithRow: 80, weeks: 150 });
  assert.equal(bad.ok, false); assert.match(bad.why, /FINRA file 90\.0%/); assert.match(bad.why, /FINRA row 80\.0%/); assert.match(bad.why, /weekly cross-sections with 500\+ stocks 150/);
});
test('pre-registration writes the three entries once, with sources', () => {
  const LB = { strategies: [] }; preRegister(LB); const n = LB.strategies.length; const mine = LB.strategies.filter(x => SVOL_IDS.includes(x.id));
  assert.equal(mine.length, 3); assert.ok(mine.every(x => /2026-11-11/.test(x.status) && x.sources.length === 4 && /IDEA 15/.test(x.explain)));
  preRegister(LB); assert.equal(LB.strategies.length, n);
});
