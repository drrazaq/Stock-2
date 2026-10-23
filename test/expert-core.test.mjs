// Seams: expert-core.mjs (expert lab, 23 Oct 2026). Point-in-time expert ranking (only calls RESOLVED before the day count), analyst
// grade classes, the hold walk with the 35% disaster stop, 13F new / large-add detection (split-safe), clusters, SEC XML readers and the
// eToro new-position diff. Pure functions, no network, no files. Run: node test/expert-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeClass, analystEvent, walkHold, PITRanker, clusterSignals, normName, valueDollars, holdingChanges, topWeights, parse13FXml, parseForm4Xml,
  etoroNewLongs, boardStats, trySmallReady, RULES, midSplit } from '../expert-core.mjs';

test('grade classes: buy-side words, hold words, sell words, unknown', () => {
  for (const g of ['Buy', 'Strong Buy', 'Outperform', 'Overweight', 'Market Outperform', 'Sector Outperform', 'Positive', 'Accumulate', 'Add', 'Top Pick', 'Conviction Buy']) assert.equal(gradeClass(g), 'buy', g);
  for (const g of ['Hold', 'Neutral', 'Equal-Weight', 'Equal Weight', 'Market Perform', 'Sector Perform', 'Peer Perform', 'In-Line', 'Sector Weight']) assert.equal(gradeClass(g), 'hold', g);
  for (const g of ['Sell', 'Underperform', 'Underweight', 'Reduce', 'Strong Sell', 'Negative']) assert.equal(gradeClass(g), 'sell', g);
  assert.equal(gradeClass(''), null); assert.equal(gradeClass(null), null);
});

test('analyst events: an upgrade INTO buy, or an initiation at buy; nothing else', () => {
  assert.equal(analystEvent({ action: 'upgrade', previousGrade: 'Neutral', newGrade: 'Buy' }), 'upgrade');
  assert.equal(analystEvent({ action: 'upgrade', previousGrade: 'Buy', newGrade: 'Strong Buy' }), null);    // already buy: not a new buy call
  assert.equal(analystEvent({ action: 'upgrade', previousGrade: 'Sell', newGrade: 'Hold' }), null);         // upgrade to hold is not a buy
  assert.equal(analystEvent({ action: 'init', previousGrade: '', newGrade: 'Overweight' }), 'init');
  assert.equal(analystEvent({ action: 'initialise', previousGrade: null, newGrade: 'Outperform' }), 'init');
  assert.equal(analystEvent({ action: 'maintain', previousGrade: 'Buy', newGrade: 'Buy' }), null);
  assert.equal(analystEvent({ action: 'downgrade', previousGrade: 'Buy', newGrade: 'Hold' }), null);
});

test('hold walk: buy the open of k, sell the close of k+hold-1, or the next open after a close 35% under the buy', () => {
  const O = [10, 10, 10, 10, 10, 10], C = [10, 11, 12, 13, 14, 15];
  { const r1 = walkHold(O, C, 1, 3, 0.35); assert.equal(r1.x, 3); assert.equal(r1.kind, 'time'); assert.ok(Math.abs(r1.g - 0.3) < 1e-9); }   // 13 / 10 - 1
  assert.equal(walkHold(O, C, 4, 3, 0.35), null);                                                // not resolved yet (needs session 6)
  const O2 = [10, 10, 7, 6, 5, 5], C2 = [10, 8, 6.4, 6, 5, 5];
  const r = walkHold(O2, C2, 1, 5, 0.35); assert.equal(r.kind, 'stop'); assert.equal(r.x, 3); assert.ok(Math.abs(r.g - (6 / 10 - 1)) < 1e-9);   // 6.4 < 6.5 at session 2 -> next open 6
  const C3 = [10, 10, NaN, NaN, 9, 9]; assert.deepEqual(walkHold([10, 10, 10, 10, 10, 10], C3, 1, 3, 0.35), { x: 3, g: 0, kind: 'time' });   // gap: the last known close before the end
  assert.equal(walkHold([10, NaN, 10], [10, 10, 10], 1, 1, 0.35), null);                           // no open on the buy day
});

test('PIT ranker: only calls resolved BEFORE the day count; top decile by success rate and average excess; minimums', () => {
  const R = new PITRanker({ minCalls: 2, frac: 0.1, minExperts: 10 });
  // 20 experts; expert e0 is clearly the best; all calls resolve at t = 50 + k
  for (let e = 0; e < 20; e++) for (let k = 0; k < 3; k++) R.add('e' + e, 50 + k, e === 0 ? 0.2 : (e % 2 ? 0.01 : -0.01) * (1 + k) + e * 0.0001);
  assert.equal(R.topAt(50).eligible, 0);           // nothing resolved strictly before 50
  assert.equal(R.topAt(52).eligible, 20);          // resolved at 50 and 51 (< 52): 2 calls each
  const s = R.topAt(53); assert.equal(s.eligible, 20); assert.equal(s.top.size, 2); assert.ok(s.top.has('e0'));
  const R2 = new PITRanker({ minCalls: 2, frac: 0.1, minExperts: 10 }); for (let e = 0; e < 5; e++) { R2.add('e' + e, 1, 0.1); R2.add('e' + e, 2, 0.1); }
  assert.equal(R2.topAt(10).top.size, 0);           // fewer than minExperts eligible: no top set
  assert.throws(() => { R.topAt(40); });             // queries must move forward in time (no look-back mixing)
});

test('PIT ranker lastN: only the latest N resolved calls of an expert count', () => {
  const R = new PITRanker({ minCalls: 2, frac: 0.5, minExperts: 2, lastN: 2 });
  R.add('a', 1, -0.5); R.add('a', 2, 0.1); R.add('a', 3, 0.1); R.add('b', 1, 0.05); R.add('b', 2, 0.05);
  const s = R.topAt(10); assert.ok(s.top.has('a')); assert.equal(s.stats.get('a').n, 2); assert.ok(Math.abs(s.stats.get('a').avg - 0.1) < 1e-12);
});

test('clusters: 2+ DIFFERENT experts on the same stock within the window; fires at the completing call, once per window', () => {
  const ev = [{ sym: 'X', t: 10, who: 'a' }, { sym: 'X', t: 12, who: 'a' }, { sym: 'X', t: 15, who: 'b' }, { sym: 'X', t: 17, who: 'c' }, { sym: 'Y', t: 10, who: 'a' }, { sym: 'Y', t: 30, who: 'b' }];
  const c = clusterSignals(ev, 7, 2); assert.equal(c.length, 1); assert.deepEqual({ sym: c[0].sym, t: c[0].t, n: c[0].who.length }, { sym: 'X', t: 15, n: 2 });
});

test('13F: issuer names normalised; values in dollars (thousands before 3 Jan 2023)', () => {
  assert.equal(normName('APPLE INC'), normName('Apple Inc.')); assert.equal(normName('ALPHABET INC CL A'), 'ALPHABET'); assert.equal(normName('Meta Platforms, Inc.'), 'META PLATFORMS');
  assert.equal(valueDollars(150, '2022-11-14'), 150000); assert.equal(valueDollars(150, '2023-02-14'), 150);
});

test('13F changes: new positions and split-safe large adds (value growth over price growth >= 1.5), weight >= 1%', () => {
  const prev = new Map([['A', { v: 100, px: 10 }], ['B', { v: 100, px: 10 }], ['C', { v: 100, px: 10 }]]);
  const cur = new Map([['A', { v: 300, px: 10 }], ['B', { v: 300, px: 25 }], ['C', { v: 120, px: 10 }], ['D', { v: 100, px: 5 }], ['E', { v: 5, px: 5 }]]);
  const ch = holdingChanges(prev, cur, 0.01); const k = Object.fromEntries(ch.map(x => [x.id, x.kind]));
  assert.equal(k.A, 'add'); assert.equal(k.B, undefined);   // B: value x3 but price x2.5 -> shares x1.2
  assert.equal(k.C, undefined); assert.equal(k.D, 'new'); assert.equal(k.E, undefined);    // E: 5 / 825 = 0.6% weight
  assert.ok(Math.abs(ch.find(x => x.id === 'D').w - 100 / 825) < 1e-12);
  assert.deepEqual(holdingChanges(null, cur, 0.01), []);    // no earlier filing: nothing is 'new' (a first filing is not a decision)
});

test('top weights: the N largest, weights summing to 1', () => {
  const w = topWeights([{ sym: 'A', v: 50 }, { sym: 'B', v: 30 }, { sym: 'C', v: 20 }], 2); assert.deepEqual(w.map(x => x.sym), ['A', 'B']); assert.ok(Math.abs(w[0].w - 0.625) < 1e-12);
});

test('SEC XML readers: 13F information table and Form 4 purchases', () => {
  const x13 = '<informationTable><infoTable><nameOfIssuer>APPLE INC</nameOfIssuer><titleOfClass>COM</titleOfClass><cusip>037833100</cusip><value>1500</value><shrsOrPrnAmt><sshPrnamt>10</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>' +
    '<ns1:infoTable><ns1:nameOfIssuer>X CORP</ns1:nameOfIssuer><ns1:cusip>999999999</ns1:cusip><ns1:value>20</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>5</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt><ns1:putCall>Call</ns1:putCall></ns1:infoTable></informationTable>';
  assert.deepEqual(parse13FXml(x13), [{ name: 'APPLE INC', cusip: '037833100', value: 1500, shares: 10, type: 'SH', putCall: '' }, { name: 'X CORP', cusip: '999999999', value: 20, shares: 5, type: 'SH', putCall: 'Call' }]);
  const f4 = '<ownershipDocument><issuer><issuerTradingSymbol>abc</issuerTradingSymbol></issuer><reportingOwner><reportingOwnerId><rptOwnerCik>0001</rptOwnerCik></reportingOwnerId></reportingOwner><nonDerivativeTable>' +
    '<nonDerivativeTransaction><transactionDate><value>2026-10-20</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>1000</value></transactionShares><transactionPricePerShare><value>12.5</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>' +
    '<nonDerivativeTransaction><transactionCoding><transactionCode>S</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>5</value></transactionShares><transactionPricePerShare><value>1</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument>';
  assert.deepEqual(parseForm4Xml(f4), { sym: 'ABC', owner: '1', buys: [{ shares: 1000, price: 12.5, usd: 12500 }] });
});

test('eToro: new long, unleveraged positions since the last snapshot only', () => {
  const prev = [{ positionId: 1, instrumentId: 1001, isBuy: true, leverage: 1 }];
  const cur = [{ positionId: 1, instrumentId: 1001, isBuy: true, leverage: 1 }, { positionId: 2, instrumentId: 1002, isBuy: true, leverage: 1, openRate: 5, openTimestamp: '2026-10-23T14:00:00Z' },
    { positionId: 3, instrumentId: 1003, isBuy: false, leverage: 1 }, { positionId: 4, instrumentId: 1004, isBuy: true, leverage: 2 }];
  assert.deepEqual(etoroNewLongs(prev, cur).map(p => p.positionId), [2]);
  assert.deepEqual(etoroNewLongs(null, cur), []);    // first snapshot: nothing is new
});

test('board and readiness; rules are registered with holds, stop and data needs', () => {
  const b = boardStats([{ d: '2026-10-26', sym: 'A', g: 0.108 }, { d: '2026-10-27', sym: 'B', g: -0.092 }]);
  assert.equal(b.n, 2); assert.equal(b.win, 0.5); assert.ok(Math.abs(b.avg - 0.0) < 1e-9);
  assert.equal(trySmallReady({ n: 30, days: 10, avg: 0.001 }), true); assert.equal(trySmallReady({ n: 29, days: 10, avg: 0.01 }), false);
  for (const id of ['EXP-AN1', 'EXP-AN2', 'EXP-13F1', 'EXP-13F2', 'EXP-INS1', 'EXP-CONG1', 'EXP-ETORO1']) { assert.ok(RULES[id], id); assert.ok(RULES[id].hold > 0); assert.equal(RULES[id].stop, 0.35); }
});

test('halves: split at the median distinct signal session', () => {
  assert.equal(midSplit([5, 1, 3, 3, 9]), 5); assert.equal(midSplit([]), null);
});
