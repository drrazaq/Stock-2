// Seams: squad24-core.mjs (SQUAD 24, 27 Oct 2026: SQ24-MEGADEAL). The counterparty test (alias, name end, deal sentence), the largest
// dollar value, the SEC acceptance time -> filing session, the price / split / dilution filters, share counts, the exit, slippage, the list.
// Run: node --test test/squad24-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { nyParts, secNY } from '../sec-time.mjs';
import { ID, RULES, TH, MEGACAP_SHA, counterpartyMatch, nameEnds, largestUsd, etToIso, filingSession, firstOpenSession, priceFail, reverseSplitNear, dilutedAt, sharesKnown, exitOf, slipped,
  quarterOf, listOn, allCiks, topByCap, preRegister } from '../squad24-core.mjs';

const COS = [{ cik: '1018724', aliases: ['Amazon.com', 'Amazon'] }, { cik: '1045810', aliases: ['NVIDIA', 'Nvidia'] }, { cik: '1652044', aliases: ['Google', 'Alphabet'] }, { cik: '789019', aliases: ['Microsoft'] }];
test('registry and pre-registration', () => {
  assert.equal(RULES[ID].hold, 10); assert.equal(RULES[ID].block, 10); assert.equal(typeof MEGACAP_SHA, 'string');
  const LB = { strategies: [] }; assert.equal(preRegister(LB), 1); assert.equal(preRegister(LB), 0, 'idempotent'); assert.equal(LB.strategies[0].id, ID);
});

test('counterparty: alias + optional corporate form, no further name word, in a deal sentence', () => {
  assert.equal(counterpartyMatch('The Company entered into a Master Services Agreement with Amazon.com Services LLC on May 1.', COS), null, '"Amazon.com Services" is an extra name word');
  assert.equal(counterpartyMatch('On May 1 the Company entered into a supply agreement with NVIDIA Corporation ("NVIDIA").', COS).cik, '1045810');
  assert.equal(counterpartyMatch('entered into a cloud agreement with Google LLC, a subsidiary of Alphabet Inc.', COS).alias, 'Google');
  assert.equal(counterpartyMatch('THIS AGREEMENT is made between ACME CORP and AMAZON.COM, INC. AND ITS AFFILIATES', COS).cik, '1018724', 'capitals and a connector after the form');
  assert.equal(counterpartyMatch('a license agreement with Microsoft Ireland Operations Limited', COS), null, 'a geographic name word after the alias fails');
  assert.equal(counterpartyMatch('a hosting agreement with Amazon Web Services, Inc.', COS), null, 'Amazon Web Services is not the alias');
  assert.equal(counterpartyMatch('Our software runs on Microsoft Azure and we sell to many customers.', COS), null, 'no deal word / product mention');
  assert.equal(counterpartyMatch('We use Microsoft products. The weather was nice.', COS), null);
  assert.equal(counterpartyMatch('entered into a Credit Agreement with Microsoft as lender for $50 million.', COS), null, 'a financing sentence does not count');
  assert.equal(counterpartyMatch('The Amazonian rain forest supply agreement', COS), null, 'whole words only');
  assert.equal(counterpartyMatch("pursuant to Amazon's warrant, Amazon may acquire shares", COS).cik, '1018724', 'possessive allowed');
  assert.equal(nameEnds(' Corporation ("X")'), true); assert.equal(nameEnds(', Inc., a Delaware'), true); assert.equal(nameEnds(' Ireland Ltd'), false); assert.equal(nameEnds('.'), true); assert.equal(nameEnds(''), true);
});

test('largest dollar value: units, US$, per-share and trillions ignored, 100k floor', () => {
  assert.equal(largestUsd('a contract of $12.5 million and an option of $45,000,000.').usd, 45e6);
  assert.equal(largestUsd('purchases of US$280 million over the term').usd, 280e6);
  assert.equal(largestUsd('a $1.2 billion award, at $2.50 per share').usd, 1.2e9);
  assert.equal(largestUsd('at an exercise price of $1,000,000 per unit'), null);
  assert.equal(largestUsd('a $5 trillion market and a $3 million order').usd, 3e6);
  assert.equal(largestUsd('a fee of $50,000'), null); assert.equal(largestUsd('no money'), null);
});

test('acceptance time (Eastern) -> UTC -> filing session', () => {
  assert.equal(etToIso('20250814070512', nyParts), '2025-08-14T11:05:12.000Z', 'summer: UTC-4'); assert.equal(etToIso('20240214161500', nyParts), '2024-02-14T21:15:00.000Z', 'winter: UTC-5');
  const D = ['2024-02-13', '2024-02-14', '2024-02-15', '2024-02-16', '2024-02-20'];
  assert.deepEqual(filingSession(D, secNY('2024-02-14T21:15:00Z')), { f: 2, phase: 'after' }, 'after the close -> next session');
  assert.deepEqual(filingSession(D, secNY('2024-02-14T12:00:00Z')), { f: 1, phase: 'before' }, '07:00 -> that day');
  assert.deepEqual(filingSession(D, secNY('2024-02-14T17:00:00Z')), { f: 1, phase: 'during' });
  assert.deepEqual(filingSession(D, secNY('2024-02-17T17:00:00Z')), { f: 4, phase: 'closed-day' }, 'Saturday -> next session');
  assert.equal(firstOpenSession(2, 'after'), 2); assert.equal(firstOpenSession(1, 'before'), 1); assert.equal(firstOpenSession(1, 'during'), 2);
});

const flat = (n = 40, px = 5) => ({ o: Array(n).fill(px), h: Array(n).fill(px * 1.02), l: Array(n).fill(px * 0.98), c: Array(n).fill(px), v: Array(n).fill(200000) });
test('filters: close 1-10, traded value, no 15% move in the 21 sessions before f (either way); reaction day free', () => {
  const S = flat(); assert.equal(priceFail(S, 30, 1e6), null); assert.equal(priceFail(S, 30, 4e5), 'traded value');
  const hi = flat(40, 11); assert.equal(priceFail(hi, 30, 1e6), 'close'); const lo = flat(40, 0.9); assert.equal(priceFail(lo, 30, 1e6), 'close');
  const up = flat(); up.c[9] = 5.8; assert.equal(priceFail(up, 30, 1e6), 'prior 15% move', 'session f-21 counts'); const up2 = flat(); up2.c[8] = 6; assert.equal(priceFail(up2, 30, 1e6), 'prior 15% move', 'the drop back from f-22 to f-21 counts too');
  const old = flat(); old.c[7] = 5.8; old.c[8] = 5.8; old.c[9] = 5.8; old.c[10] = 5; assert.equal(priceFail(old, 31, 1e6), null, 'moves before f-21 are outside the window');
  const dn = flat(); dn.c[25] = 4.2; assert.equal(priceFail(dn, 30, 1e6), 'prior 15% move', 'a 16% drop counts');
  const r = flat(); r.c[30] = 9; assert.equal(priceFail(r, 30, 1e6), null, 'the reaction session itself may jump');
  assert.equal(reverseSplitNear([{ d: '2024-01-10', r: 0.1 }], '2024-03-01'), true); assert.equal(reverseSplitNear([{ d: '2023-12-01', r: 0.1 }], '2024-03-01'), false); assert.equal(reverseSplitNear([{ d: '2024-02-10', r: 2 }], '2024-03-01'), false);
  const D = ['2024-01-02', '2024-01-03', '2024-01-04'], sessOf = (d) => D.indexOf(d); assert.equal(dilutedAt(['2024-01-03'], 2, sessOf, 2), true); assert.equal(dilutedAt(['2024-01-02'], 2, sessOf, 2), false);
});

test('share count known 30 days late, not older than 400 days', () => {
  const s = [['2023-01-31', 100], ['2023-12-31', 120], ['2024-02-20', 150]];
  assert.equal(sharesKnown(s, '2024-03-01'), 120); assert.equal(sharesKnown(s, '2024-03-25'), 150); assert.equal(sharesKnown([['2022-01-01', 5]], '2024-03-01'), null);
});

test('exit: buy the open, 25% stop (open gap / intraday), else the close of session 10; slippage', () => {
  const S = flat(40, 4); S.o[20] = 4; let x = exitOf(S, 20); assert.equal(x.kind, 'time'); assert.equal(x.x, 29); assert.equal(x.held, 10);
  const G = flat(40, 4); G.o[23] = 2.9; G.l[23] = 2.8; x = exitOf(G, 20); assert.equal(x.kind, 'stop'); assert.equal(x.px, 2.9); assert.equal(x.x, 23);
  const L = flat(40, 4); L.l[22] = 2.5; x = exitOf(L, 20); assert.equal(x.kind, 'stop'); assert.equal(x.px, 3);
  const E = flat(40, 4); E.l[20] = 2.9; x = exitOf(E, 20); assert.equal(x.kind, 'stop', 'the entry session can stop'); assert.equal(x.x, 20);
  const O = flat(25, 4); assert.equal(exitOf(O, 20).open, true); const N = flat(40, 4); N.o[20] = NaN; assert.equal(exitOf(N, 20), null);
  assert.ok(Math.abs(slipped(10, 10) - (0.98 / 1.02 - 1)) < 1e-12);
});

test('the frozen list: quarter of a date, list in force, top by cap merged by CIK', () => {
  assert.equal(quarterOf('2024-02-14'), '2024-01-01'); assert.equal(quarterOf('2025-12-31'), '2025-10-01');
  const MC = { quarters: { '2024-01-01': ['1', '2'], '2024-04-01': ['2', '3'] }, companies: {} };
  assert.deepEqual(listOn(MC, '2024-03-31'), ['1', '2']); assert.deepEqual(listOn(MC, '2024-04-01'), ['2', '3']); assert.deepEqual(listOn(MC, '2023-12-31'), []); assert.equal(allCiks(MC).size, 3);
  const top = topByCap([{ cik: '5', cap: 10, sym: 'GOOGL' }, { cik: '5', cap: 12, sym: 'GOOG' }, { cik: '6', cap: 11 }, { cik: null, cap: 99 }], 2); assert.deepEqual(top.map(r => r.sym || r.cik), ['GOOG', '6']);
});

test('addendum helpers: path stats 1/3/5/10 and max favourable / adverse; insider cluster window f-10..f-1', async () => {
  const { pathStats, insiderCluster } = await import('../squad24-core.mjs');
  const S = flat(40, 4); S.o[20] = 4; S.c[22] = 4.4; S.h[25] = 6; S.l[27] = 3; const p = pathStats(S, 20);
  assert.equal(p.d1, 0); assert.equal(p.d3, 0.1); assert.equal(p.d10, 0); assert.equal(p.mfe, 0.5); assert.equal(p.mae, -0.25);
  const D = Array.from({ length: 30 }, (_, i) => 'd' + String(i).padStart(2, '0')), sessOf = (d) => D.indexOf(d);
  assert.equal(insiderCluster([['d10', 'a'], ['d19', 'b'], ['d19', 'b']], 20, sessOf), 2); assert.equal(insiderCluster([['d09', 'a'], ['d20', 'b']], 20, sessOf), 0, 'outside the window (f itself excluded)');
});
