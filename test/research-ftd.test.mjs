// Seams: research-core.mjs IDEA 18 (daily researcher, 16 Nov 2026): SEC fails-to-deliver as an AVOID check. File list and availability,
// URLs, parser, share counts (raw, split guard), ranking and sides, data rule, pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, ONE_OPEN, FTD, FTD_IDS, ftdFiles, ftdUrls, ftdParse, ftdShares, ftdRank, ftdSide, ftdDataRule, preRegister } from '../research-core.mjs';

test('three ftd rules, all avoid checks, holds fixed, one open trade per stock, never a buy', () => {
  assert.deepEqual(FTD_IDS, ['RQ-FTD-AV21', 'RQ-FTD-AV63', 'RQ-FTD-R25']);
  assert.deepEqual(FTD_IDS.map(id => RULES[id].hold), [21, 63, 21]);
  for (const id of FTD_IDS) { assert.equal(RULES[id].kind, 'avoid'); assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); assert.ok(!BUY_IDS.includes(id)); }
  assert.equal(FTD.top, 0.99); assert.equal(FTD.fixed, 0.025); assert.equal(FTD.minCross, 500); assert.equal(FTD.aDay, 3); assert.equal(FTD.bDay, 18);
});
test('files: a usable from the 3rd of the next month, b from the 18th; only files available by the given day', () => {
  const f = ftdFiles('2021-10-02', '2021-08');
  assert.deepEqual(f.map(x => x.ym + x.h + '@' + x.avail), ['2021-08a@2021-09-03', '2021-08b@2021-09-18']);
  const g = ftdFiles('2021-10-03', '2021-08'); assert.equal(g.length, 3); assert.equal(g[2].avail, '2021-10-03'); assert.equal(g[2].last, '2021-09-15');
  assert.equal(g[1].last, '2021-08-31');
  const dec = ftdFiles('2022-01-18', '2021-12'); assert.deepEqual(dec.map(x => x.avail), ['2022-01-03', '2022-01-18']); assert.equal(dec[1].last, '2021-12-31');
});
test('urls: main folder first, then the other folders', () => {
  const u = ftdUrls('2023-08', 'b');
  assert.equal(u[0], 'https://www.sec.gov/files/data/fails-deliver-data/cnsfails202308b.zip');
  assert.ok(u.includes('https://www.sec.gov/files/data/other/fails-deliver-data/cnsfails202308b_0.zip'));
});
test('parser: max daily quantity per symbol; header, trailer and bad rows skipped', () => {
  const txt = 'SETTLEMENT DATE|CUSIP|SYMBOL|QUANTITY (FAILS)|DESCRIPTION|PRICE\n20211101|037833100|AAPL|5000|APPLE INC|150.1\n20211102|037833100|AAPL|12000|APPLE INC|151\n20211103|037833100|AAPL|300|APPLE INC|.\n20211101|X|brk.b|10|BRK|1\n20211101|X|BAD|abc|B|1\n20211101|X||10|E|1\nTrailer record count 6';
  const m = ftdParse(txt); assert.equal(m.get('AAPL'), 12000); assert.equal(m.get('BRK.B'), 10); assert.ok(!m.has('BAD')); assert.equal(m.size, 2);
  assert.equal(ftdParse(null).size, 0);
});
test('shares: latest raw count 30+ days old; split-shaped change to the next count drops it', () => {
  const rows = [['2021-06-30', 1e6], ['2021-09-30', 1.01e6], ['2021-12-31', 1.02e6]];
  assert.deepEqual(ftdShares(rows, '2021-10-15'), { sh: 1e6, at: '2021-06-30' });
  assert.deepEqual(ftdShares(rows, '2021-10-31'), { sh: 1.01e6, at: '2021-09-30' });
  assert.equal(ftdShares(rows, '2021-07-15'), null);
  assert.deepEqual(ftdShares([['2021-06-30', 1e6], ['2021-09-30', 1e5]], '2021-08-15'), { split: true });
  assert.deepEqual(ftdShares([['2021-06-30', 1e6], ['2021-09-30', 4e6]], '2021-08-15'), { split: true });
  assert.equal(ftdShares([], '2021-08-15'), null);
});
test('rank and sides: 500+ stocks needed; top 1% or the fixed 2.5% cut-off', () => {
  const small = Array.from({ length: 499 }, (_, k) => ({ key: k, s: k })); assert.equal(ftdRank(small).size, 0);
  const L = Array.from({ length: 1000 }, (_, k) => ({ key: k, s: k < 900 ? 0 : k })), R = ftdRank(L);
  assert.ok(R.get(999) >= 0.99 && R.get(989) < 0.99); assert.ok(R.get(0) < 0.5);
  assert.equal(ftdSide('RQ-FTD-AV21', R.get(999), 0.001), true); assert.equal(ftdSide('RQ-FTD-AV21', R.get(950), 0.5), false);
  assert.equal(ftdSide('RQ-FTD-R25', 0.1, 0.025), true); assert.equal(ftdSide('RQ-FTD-R25', 1, 0.0249), false);
});
test('data rule: files 95%, 100 cross-sections, 5,000 matched rows', () => {
  assert.equal(ftdDataRule({ expected: 120, files: 115, crosses: 110, matched: 9000 }).ok, true);
  const b = ftdDataRule({ expected: 120, files: 100, crosses: 90, matched: 10 }); assert.equal(b.ok, false); assert.match(b.why, /95% needed/); assert.match(b.why, /100 needed/); assert.match(b.why, /5,000 needed/);
});
test('pre-registration writes the three entries once', () => {
  const LB = { strategies: [] }; preRegister(LB); const ids = LB.strategies.filter(x => FTD_IDS.includes(x.id));
  assert.equal(ids.length, 3); for (const x of ids) { assert.match(x.status, /pre-registered 2026-11-16/); assert.equal(x.kind, 'avoid'); assert.ok(x.sources.length >= 2); }
  const n = LB.strategies.length; preRegister(LB); assert.equal(LB.strategies.length, n);
});
