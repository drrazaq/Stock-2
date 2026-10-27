// Seams: squad28-core.mjs (SQUAD 28, 27 Oct 2026: SQ28-SUPDRIFT / SQ28-SUPDRIFT-ANY). Strict customer names, the major-customer sentence
// test (>= 10%), the 10-K cover ticker, point-in-time link activity, the rolling SUE cut-off, the own-report window, the exit, the placebo.
// Run: node --test test/squad28-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ID, VAR, IDS, RULES, TH, LINKS_SHA, aliasesOf, aliasOk, customerQuery, linkSentence, coverTicker, linkActiveOn, sueCut, sueOf, quantile, ownNear, reactionIdx, exitOf,
  placeboPick, mulberry32, sampleOf, quarterKey, precisionOf, perYear, preRegister } from '../squad28-core.mjs';

test('registry and pre-registration', () => {
  assert.deepEqual(IDS, [ID, VAR]); assert.equal(RULES[ID].hold, 20); assert.equal(TH.stop, 0.2); assert.equal(TH.minClose, 3); assert.equal(TH.minDv, 2e6); assert.equal(typeof LINKS_SHA, 'string');
  const LB = { strategies: [] }; assert.equal(preRegister(LB), 2); assert.equal(preRegister(LB), 0, 'idempotent'); assert.deepEqual(LB.strategies.map(x => x.id), [ID, VAR]);
  assert.match(LB.strategies[0].explain, /reaction-session return > 0/); assert.match(LB.strategies[1].explain, /no condition/);
});

test('strict aliases: legal name minus corporate form; no acronyms, no person names', () => {
  assert.deepEqual(aliasesOf('Walmart Inc.'), ['Walmart']);
  assert.deepEqual(aliasesOf('Amazon.com, Inc.'), ['Amazon.com', 'Amazon']);
  assert.deepEqual(aliasesOf('Meta Platforms, Inc. Class A Common Stock'), ['Meta Platforms']);
  assert.deepEqual(aliasesOf('The Home Depot, Inc.'), ['Home Depot']);
  assert.deepEqual(aliasesOf('Taiwan Semiconductor Manufacturing Company Ltd. American Depositary Shares'), ['Taiwan Semiconductor Manufacturing']);
  assert.deepEqual(aliasesOf('NVIDIA Corporation'), ['NVIDIA']);
  assert.deepEqual(aliasesOf('International Business Machines Corporation'), ['International Business Machines']);
  assert.deepEqual(aliasesOf('AT&T Inc.'), [], 'acronym');
  assert.deepEqual(aliasesOf('3M Company'), [], 'acronym');
  assert.deepEqual(aliasesOf('RTX Corporation'), [], 'acronym');
  assert.deepEqual(aliasesOf('HP Inc.'), []);
  assert.deepEqual(aliasesOf('Ralph Lauren Corporation'), [], 'person name');
  assert.deepEqual(aliasesOf('Robert Half Inc.'), [], 'person name');
  assert.equal(aliasOk('Apple'), true); assert.equal(aliasOk('Lowe\'s'), true); assert.equal(aliasOk('CVS Health'), true);
  assert.match(customerQuery(['Walmart']), /"Walmart accounted for" OR "sales to Walmart"/);
});

test('major-customer sentence: alias + revenue + concentration, first percentage after the alias >= 10', () => {
  const A = ['Amazon.com', 'Amazon'], M = ['Microsoft'], W = ['Walmart'];
  assert.equal(linkSentence('In 2023, 2022 and 2021, Amazon accounted for 52.5%, 45.8% and 18.2% of our revenue, respectively.', A).pct, 52.5);
  assert.equal(linkSentence('Sales to Walmart Inc. represented approximately 15 percent of our net sales in fiscal 2023.', W).pct, 15);
  assert.equal(linkSentence('Revenue from Microsoft accounted for approximately 8 percent and 22 percent of our total revenue for 2015 and 2014.', M), null, 'latest year under 10%');
  assert.equal(linkSentence('Microsoft accounted for less than 10% of our revenue in 2023.', M), null, 'less than');
  assert.equal(linkSentence('Our largest customer, Walmart, accounted for 21% of net sales.', W).pct, 21);
  assert.equal(linkSentence('We sell through Amazon Web Services marketplace, which accounted for 30% of revenue.', A), null, 'Amazon Web Services is a further name word');
  assert.equal(linkSentence('Walmart accounted for 35% of our accounts receivable at year end.', W), null, 'receivables only');
  assert.equal(linkSentence('Walmart accounted for 35% of accounts receivable and 22% of net sales.', W).pct, 22, 'receivables then sales');
  assert.equal(linkSentence('We compete with Walmart. Our revenue grew 25%.', W), null, 'two sentences');
  assert.equal(linkSentence('WALMART INC. ACCOUNTED FOR 12% OF NET SALES.', W).pct, 12, 'capitals');
  assert.equal(linkSentence('The Walmartian accounted for 40% of sales.', W), null, 'whole word');
});

test('10-K cover ticker', () => {
  assert.equal(coverTicker('<td><ix:nonNumeric contextRef="c-1" name="dei:TradingSymbol" id="f-1">AAOI</ix:nonNumeric></td>'), 'AAOI');
  assert.equal(coverTicker('<ix:nonNumeric name="dei:TradingSymbol" contextRef="x"><span>brk-b</span></ix:nonNumeric>'), 'BRK.B');
  assert.equal(coverTicker('<p>no xbrl</p>'), null);
});

test('link activity: the latest 10-K before the day must show the link, at most 400 days old', () => {
  const tenKs = ['2021-03-01', '2022-03-01', '2023-03-01'], shows = new Set(['2021-03-01', '2022-03-01']);
  assert.equal(linkActiveOn(tenKs, shows, '2021-03-01'), false, 'not before the filing day');
  assert.equal(linkActiveOn(tenKs, shows, '2021-03-02'), true);
  assert.equal(linkActiveOn(tenKs, shows, '2022-12-01'), true);
  assert.equal(linkActiveOn(tenKs, shows, '2023-03-02'), false, 'a later 10-K without the sentence ends it');
  assert.equal(linkActiveOn(['2021-03-01'], new Set(['2021-03-01']), '2022-04-10'), false, 'older than 400 days');
  assert.equal(linkActiveOn([], new Set(['2021-03-01']), '2021-06-01'), true, 'no index row: the verified filing itself');
});

test('SUE: rolling top 30% over the 63 sessions before, 30+ values', () => {
  assert.ok(Math.abs(sueOf(1.1, 1.0, 50) - 0.002) < 1e-12); assert.equal(sueOf(null, 1, 5), null);
  const hist = []; for (let r = 0; r < 100; r++) hist.push([r, r / 100]);
  assert.equal(quantile([1, 2, 3], 0.7), null);
  const c = sueCut(hist, 100); assert.ok(c > 0.36 && c < 0.82); assert.equal(sueCut(hist, 20), null, 'too few values before session 20');
  assert.ok(Math.abs(sueCut(hist, 100) - (37 + 0.7 * 62) / 100) < 1e-9, 'window r0-63..r0-1');
});

test('own report window r-4..r+20 and reaction sessions', () => {
  assert.equal(ownNear([95], 100), false); assert.equal(ownNear([96], 100), true); assert.equal(ownNear([120], 100), true); assert.equal(ownNear([121], 100), false);
  const D = ['2024-01-02', '2024-01-03', '2024-01-04'];
  assert.equal(reactionIdx(D, '2024-01-03', 'bmo'), 1); assert.equal(reactionIdx(D, '2024-01-03', 'amc'), 2); assert.equal(reactionIdx(D, '2024-01-03', null), 2); assert.equal(reactionIdx(D, '2024-01-06', 'amc'), -1);
});

test('exit: 20 sessions, 20% stop, gap through the stop sells at the open', () => {
  const n = 40, o = Array(n).fill(10), l = Array(n).fill(9.5), c = Array(n).fill(10);
  let x = exitOf({ o, l, c }, 1, n); assert.equal(x.kind, 'time'); assert.equal(x.x, 20); assert.equal(x.held, 20);
  const l2 = [...l]; l2[5] = 7.9; x = exitOf({ o, l: l2, c }, 1, n); assert.equal(x.kind, 'stop'); assert.equal(x.px, 8); assert.equal(x.x, 5);
  const o3 = [...o]; o3[4] = 7; const l3 = [...l]; l3[4] = 6.5; x = exitOf({ o: o3, l: l3, c }, 1, n); assert.equal(x.px, 7);
  x = exitOf({ o, l, c }, 30, n); assert.equal(x.open, true);
});

test('placebo: same quarter, not within 20 sessions of an event session, seeded', () => {
  const r1 = mulberry32(28), r2 = mulberry32(28), cand = Array.from({ length: 63 }, (_, k) => 100 + k);
  const a = placeboPick(r1, cand, [110], () => true), b = placeboPick(r2, cand, [110], () => true); assert.equal(a, b, 'seeded');
  for (let k = 0; k < 200; k++) { const u = placeboPick(r1, cand, [110], (u) => u % 2 === 0); assert.ok(!(u >= 90 && u <= 130)); assert.equal(u % 2, 0); }
  assert.equal(placeboPick(mulberry32(1), [5], [5], () => true), null);
  assert.equal(quarterKey('2024-05-31'), '2024Q2'); assert.equal(sampleOf([1, 2, 3, 4, 5], 3, 28).length, 3); assert.deepEqual(sampleOf([1, 2, 3, 4, 5], 5, 28), sampleOf([1, 2, 3, 4, 5], 5, 28));
});

test('stats helpers', () => {
  assert.equal(precisionOf([{ ok: true }, { ok: false }, null, { ok: true }, { ok: true }]), 0.75); assert.equal(precisionOf([]), null);
  assert.ok(Math.abs(perYear([{ g: 0.108, days: 252 }]) - 0.1) < 1e-9);
});

test('v2 extractor: rejects the failure kinds found in the first hand check', () => {
  const W = ['Walmart'], A = ['Amazon.com', 'Amazon'];
  assert.equal(linkSentence('Sales to Walmart represented approximately 28%, 28% and 29%, sales to Lowe\'s represented approximately 24% of our Garden segment\'s net sales in fiscal 2020.', W, 2020), null, 'segment share');
  assert.equal(linkSentence('Sales of our spray via Amazon comprised 67% of total Avenova Spray net revenue during 2023.', A, 2024), null, 'channel / product share');
  assert.equal(linkSentence('Walmart Inc. and the major drug store chains accounted for 66.5% of our gross sales during 2021.', W, 2022), null, 'combined group');
  assert.equal(linkSentence('Amazon accounted for 13% of total revenue for the year ended December 31, 2022.', A, 2025), null, 'stale year');
  assert.equal(linkSentence('Amazon accounted for 13% of total revenue for the year ended December 31, 2024.', A, 2025).pct, 13, 'current year');
  assert.equal(linkSentence('Under the agreement Walmart retains 100% of revenue and reimburses costs.', W, 2025), null, 'retains');
  assert.equal(linkSentence('Products manufactured by Walmart represented approximately 40% of our technology segment net sales.', W, 2023), null, 'segment');
  assert.equal(linkSentence('Sales to Walmart represented 100% of the net revenue of Scilex Pharma in 2020.', W, 2021), null, 'a subsidiary\'s revenue');
});
