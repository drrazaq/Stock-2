// SQUAD 1 core (information edge): pure functions, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, ONE_OPEN, relFlags, isInsider, isTopOfficer, clusterEvents, topOfficerBuys, parseForm4, parseDailyIdx, buybackAmount, buybackSize, html2text,
  firstPerCompany, eftsHits, linkActive, recChange, recUp, divHikes, siKnown, lowShort, avoidVerdict, ownAverage, capG, pickFrac, monthStarts, firstAfter, nextSession, halfOf,
  preRegister, boardStats, paperReady, BUYBACK_PHRASES, GUIDE_PHRASES } from '../squad1-core.mjs';
import { judge } from '../value-core.mjs';

test('registry: 9 buy rules + 1 avoid rule, every rule has a hold, a rule text, a paper with a link and a library check', () => {
  assert.equal(BUY_IDS.length, 9); assert.equal(IDS.length, 10); assert.equal(RULES['SQ1-SIAVOID'].kind, 'avoid');
  for (const id of IDS) { const r = RULES[id]; assert.ok(id.startsWith('SQ1-')); assert.ok(r.hold >= 21 && r.hold <= 126, id); assert.ok(r.rule.length > 80, id); assert.ok(r.papers.some(p => /^https:\/\//.test(p.url)), id); assert.ok(r.lib, id); }
  assert.ok(!ONE_OPEN.has('SQ1-CUSTMOM') && ONE_OPEN.has('SQ1-INSCLU'));
  assert.ok(BUYBACK_PHRASES.length >= 10 && GUIDE_PHRASES.every(p => !/annual/.test(p)), 'no "raises annual" (it matches dividend raises)');
});

test('insider roles: 10%-only owners are not insiders; CEO/CFO titles are recognised', () => {
  assert.deepEqual(relFlags('Director,TenPercentOwner'), { officer: false, director: true, ten: true, other: false });
  assert.equal(isInsider(relFlags('TenPercentOwner')), false); assert.equal(isInsider(relFlags('Officer')), true); assert.equal(isInsider(relFlags('Other')), true);
  for (const t of ['CEO', 'President and CEO', 'Chief Executive Officer', 'EVP, CFO', 'Chief Financial Officer & Treasurer']) assert.equal(isTopOfficer(t), true, t);
  for (const t of ['COO', 'Chief Operating Officer', 'General Counsel', 'Director', '']) assert.equal(isTopOfficer(t), false, t);
});

test('cluster: 3 insiders, 300k USD, an officer, within 30 days fires once on the completing filing date; cooldown blocks a re-fire', () => {
  const b = (who, d, usd, officer = false) => ({ sym: 'AAA', d, who, usd, officer, insider: true });
  const rows = [b('1', '2024-03-01', 100000, true), b('2', '2024-03-10', 100000), b('3', '2024-03-25', 150000), b('4', '2024-04-05', 500000), b('5', '2024-04-28', 500000), b('6', '2024-04-29', 500000, true)];
  const ev = clusterEvents(rows); assert.equal(ev.length, 2); assert.deepEqual(ev[0], { sym: 'AAA', d: '2024-03-25', people: 3, usd: 350000 });
  assert.equal(ev[1].d, '2024-04-29', 'after the 30-day cooldown; 04-28 has only 2 people in its window and no officer');
  // too old: day 1 falls out of the 30-day window
  assert.equal(clusterEvents([b('1', '2024-01-01', 200000, true), b('2', '2024-01-20', 100000), b('3', '2024-01-31', 100000)]).length, 0);
  // no officer
  assert.equal(clusterEvents([b('1', '2024-01-01', 200000), b('2', '2024-01-02', 100000), b('3', '2024-01-03', 100000)]).length, 0);
  // the low-short-interest version: 2 people, 100k, no officer needed
  assert.equal(clusterEvents([b('1', '2024-01-01', 60000), b('2', '2024-01-02', 50000)], { minPeople: 2, minUsd: 100000, needOfficer: false }).length, 1);
  // 10%-only owners are not counted
  assert.equal(clusterEvents([{ ...b('1', '2024-01-01', 9e6, true) }, { ...b('2', '2024-01-02', 9e6), insider: false }, { ...b('3', '2024-01-02', 9e6), insider: false }]).length, 0);
});

test('top-officer purchases are summed per filing and need 100k USD', () => {
  const r = topOfficerBuys([{ sym: 'A', d: '2024-01-02', who: 'x', usd: 60000, top: true }, { sym: 'A', d: '2024-01-02', who: 'x', usd: 50000, top: true }, { sym: 'B', d: '2024-01-02', who: 'y', usd: 99000, top: true }, { sym: 'C', d: '2024-01-02', who: 'z', usd: 900000, top: false }]);
  assert.deepEqual(r, [{ sym: 'A', d: '2024-01-02', who: 'x', usd: 110000 }]);
});

test('Form 4 XML: open-market purchases and owner roles are read; grants and sales are not purchases', () => {
  const xml = `<SEC-DOCUMENT><XML><?xml version="1.0"?><ownershipDocument><issuer><issuerCik>0000123</issuerCik><issuerTradingSymbol>abc</issuerTradingSymbol></issuer>
  <reportingOwner><reportingOwnerId><rptOwnerCik>0000999</rptOwnerCik></reportingOwnerId><reportingOwnerRelationship><isDirector>0</isDirector><isOfficer>1</isOfficer><isTenPercentOwner>0</isTenPercentOwner><officerTitle>Chief Executive Officer</officerTitle></reportingOwnerRelationship></reportingOwner>
  <nonDerivativeTable><nonDerivativeTransaction><transactionDate><value>2026-10-20</value></transactionDate><transactionCoding><transactionCode>P</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>10000</value></transactionShares><transactionPricePerShare><value>12.5</value><footnoteId id="F1"/></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>
  <nonDerivativeTransaction><transactionCoding><transactionCode>A</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>5000</value></transactionShares><transactionPricePerShare><value>0</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>A</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction>
  <nonDerivativeTransaction><transactionCoding><transactionCode>S</transactionCode></transactionCoding><transactionAmounts><transactionShares><value>100</value></transactionShares><transactionPricePerShare><value>13</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>D</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable></ownershipDocument></XML></SEC-DOCUMENT>`;
  const f = parseForm4(xml); assert.equal(f.sym, 'ABC'); assert.equal(f.owners.length, 1); assert.equal(f.owners[0].officer, true); assert.equal(f.owners[0].title, 'Chief Executive Officer');
  assert.equal(f.buys.length, 1); assert.equal(f.buys[0].usd, 125000); assert.equal(parseForm4('<html>no</html>'), null);
});

test('EDGAR daily index: Form 4 rows, one per file, both index layouts', () => {
  const master = 'CIK|Company Name|Form Type|Date Filed|Filename\n--------\n123|ABC CORP|4|20261026|edgar/data/123/0001-26-000001.txt\n999|SMITH JOHN|4|20261026|edgar/data/123/0001-26-000001.txt\n55|XYZ|8-K|20261026|edgar/data/55/x.txt\n';
  assert.deepEqual(parseDailyIdx(master, new Set(['4'])), [{ form: '4', cik: '123', date: '2026-10-26', file: 'edgar/data/123/0001-26-000001.txt' }]);
  const ownerFirst = 'CIK|Company Name|Form Type|Date Filed|Filename\n999|SMITH JOHN|4|20261026|edgar/data/123/0001-26-000001.txt\n123|ABC CORP|4|20261026|edgar/data/123/0001-26-000001.txt\n';
  assert.deepEqual(parseDailyIdx(ownerFirst, new Set(['4']), (r) => r.cik === '123').map(x => x.cik), ['123'], 'the issuer row is kept even when the owner row comes first');
  const form = '4                ABC CORP                                                      123         20261026    edgar/data/123/0001-26-000002.txt\n4/A              ABC CORP                                                      123         20261026    edgar/data/123/0001-26-000003.txt\n';
  assert.deepEqual(parseDailyIdx(form, new Set(['4'])).map(x => x.file), ['edgar/data/123/0001-26-000002.txt']);
});

test('buyback size: dollars and share counts are read only from authorization sentences', () => {
  const t = html2text('<p>Acme Corp. (NYSE: ACM) today announced that its Board of Directors has authorized a new share repurchase program of up to $1.5 billion of common stock.</p><p>During the quarter the company repurchased $40 million of shares. Revenue was $900 million.</p>');
  assert.deepEqual(buybackAmount(t), { usd: 1.5e9, shares: null });
  assert.deepEqual(buybackAmount('The Board approved the repurchase of up to 5,000,000 shares of its common stock.'), { usd: null, shares: 5e6 });
  assert.deepEqual(buybackAmount('The Board authorized the repurchase of up to 2.5 million shares.'), { usd: null, shares: 2.5e6 });
  assert.deepEqual(buybackAmount('Revenue was $900 million. Net income rose.'), { usd: null, shares: null });
  assert.equal(buybackAmount('The Board authorized a $250,000,000 share repurchase program.').usd, 2.5e8);
  assert.equal(buybackSize({ usd: 1e9, shares: null }, 1e8, 100), 0.1); assert.equal(buybackSize({ usd: 1e8, shares: 1e7 }, 1e8, 100), 0.1); assert.equal(buybackSize({ usd: null, shares: null }, 1e8, 10), null);
});

test('first event per company per window; EDGAR full-text hits are compacted with tickers', () => {
  const e = firstPerCompany([{ sym: 'A', d: '2024-01-01' }, { sym: 'A', d: '2024-03-01' }, { sym: 'A', d: '2024-07-15' }, { sym: 'B', d: '2024-01-05' }], 180);
  assert.deepEqual(e.map(x => x.sym + x.d), ['A2024-01-01', 'B2024-01-05', 'A2024-07-15']);
  const h = eftsHits({ hits: { hits: [{ _id: '0001-24-1:ex99.htm', _source: { adsh: '0001-24-1', ciks: ['0000123'], file_date: '2024-02-01', sics: ['3571'], display_names: ['ACME CORP  (ACM, ACMW)  (CIK 0000000123)'] } }] } });
  assert.deepEqual(h, [['0001-24-1:ex99.htm', '0001-24-1', 123, '2024-02-01', '3571', ['ACM', 'ACMW']]]);
});

test('customer link: active from the session after the first filing, until 400 days after the latest filing known that day', () => {
  const L = { first_public_at: '2022-03-01', filings: ['2022-03-01', '2023-03-01'] };
  assert.equal(linkActive(L, '2022-03-01'), false); assert.equal(linkActive(L, '2022-03-02'), true);
  assert.equal(linkActive(L, '2023-02-28'), true, 'within 400 days of 2022-03-01'); assert.equal(linkActive(L, '2024-04-01'), true); assert.equal(linkActive(L, '2024-04-10'), false);
  assert.equal(linkActive({ first_public_at: '2022-03-01' }, '2023-04-20'), false);
});

test('consensus change: only months before the formation month; 5+ analysts; +15 points', () => {
  const rows = [{ period: '2024-04-01', strongBuy: 5, buy: 3, hold: 2, sell: 0, strongSell: 0 }, { period: '2024-01-01', strongBuy: 2, buy: 3, hold: 5, sell: 0, strongSell: 0 }, { period: '2024-05-01', strongBuy: 0, buy: 0, hold: 9, sell: 1, strongSell: 0 }];
  const x = recChange(rows, '2024-05-01'); assert.equal(x.now, 0.8); assert.equal(x.before, 0.5); assert.equal(recUp(x), true, 'the May snapshot is not used for a May formation');
  assert.equal(recChange(rows, '2024-06-03'), null, 'needs months 5 and 2: month 2 missing');
  assert.equal(recUp({ ...x, nNow: 4 }), false);
});

test('dividend hikes: 25%+ on the previous regular dividend of the same frequency, 20-400 days apart, at most 3x', () => {
  const d = (decl, amt, freq = 4, type = 'CD') => ({ sym: 'D', decl, amt, freq, type });
  const ev = divHikes([d('2023-01-10', 0.2), d('2023-04-10', 0.2), d('2023-07-10', 0.26), d('2023-10-10', 0.27), d('2023-11-01', 2.0, 0, 'SC'), d('2024-01-10', 0.9), d('2025-06-01', 1.2)]);
  assert.deepEqual(ev.map(x => x.d), ['2023-07-10'], '0.9 is 3.3x (data error / special) and 2025-06 is 507 days after the previous');
});

test('short interest: known 14 days after settlement; low-short filter; avoid verdicts always say REJECTED AS A BUY', () => {
  const a = [['2024-01-12', 100, 1], ['2024-01-31', 120, 1], ['2024-02-15', 90, 1]];
  assert.deepEqual(siKnown(a, '2024-02-13'), { d: '2024-01-12', q: 100, dtc: 1 }); assert.equal(siKnown(a, '2024-02-14').q, 120); assert.equal(siKnown(a, '2024-03-05', 2).q, 100); assert.equal(siKnown(a, '2024-01-20'), null);
  assert.equal(lowShort({ q: 100 }, { q: 120 }, 10000), true); assert.equal(lowShort({ q: 400 }, { q: 120 }, 10000), false); assert.equal(lowShort({ q: 200 }, { q: 100 }, 10000), false);
  const h = (edge, tBlock) => ({ n: 50, blocks: 8, edge, tBlock });
  assert.match(avoidVerdict({ older: h(-0.02, -3), newer: h(-0.01, -2.6) }).verdict, /^AVOID CONFIRMED \(REJECTED AS A BUY\)$/);
  assert.match(avoidVerdict({ older: h(-0.02, -1), newer: h(-0.01, -2.6) }).verdict, /AVOID WEAK.*REJECTED/);
  assert.match(avoidVerdict({ older: h(0.02, 3), newer: h(0.01, 3) }).verdict, /NOT SUPPORTED.*REJECTED/);
  assert.match(avoidVerdict({ older: { n: 5, blocks: 1 }, newer: h(1, 1) }).verdict, /TOO FEW.*REJECTED/);
});

test('the avoid verdict can never pass the TRY SMALL reader of scan.mjs (it refuses REJECTED)', () => {
  const tryOk = (r) => !/REJECTED|TOO FEW/i.test(r.verdict || '');
  const h = (edge) => ({ n: 50, blocks: 8, edge, tBlock: 3, avgStress: 0.05, noTop2: 0.04 });
  for (const R of [{ older: h(0.02), newer: h(0.01) }, { older: h(-0.02), newer: h(-0.01) }]) assert.equal(tryOk(avoidVerdict(R)), false);
});

test('yardstick and trades capped alike at +300%; same-stock windows need 3+', () => {
  assert.equal(capG(5), 3); assert.equal(capG(-0.5), -0.5);
  const r = ownAverage({ from: 0, to: 100, len: 10, step: 10, okAt: () => true, busy: [[0, 25]], ret: (u) => u === 30 ? 9 : 0.1 });
  assert.ok(Math.abs(r - (3 + 0.1 * 6) / 7) < 1e-12);
  assert.equal(ownAverage({ from: 0, to: 25, len: 10, okAt: () => true, ret: () => 0.1 }), null);
});

test('helpers: picks, month starts, first session after a date, NYSE next session, halves', () => {
  assert.deepEqual(pickFrac([...Array(10)].map((_, i) => ({ key: i, v: i })), 0.2), [9, 8]); assert.deepEqual(pickFrac([{ key: 1, v: 1 }], 0.2), []);
  assert.deepEqual(monthStarts(['2024-01-30', '2024-01-31', '2024-02-01', '2024-02-02', '2024-03-01']), [2, 4]);
  const D = ['2024-01-02', '2024-01-03', '2024-01-05']; assert.equal(firstAfter(D, '2024-01-03'), 2); assert.equal(firstAfter(D, '2024-01-04'), 2); assert.equal(firstAfter(D, '2024-01-05'), 3);
  assert.equal(nextSession('2026-11-25'), '2026-11-27'); assert.equal(nextSession('2026-10-23'), '2026-10-26');
  assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('pre-registration writes every SQ1 rule once, before any result', () => {
  const LB = { strategies: [{ id: 'E3' }] }; assert.equal(preRegister(LB), 10); assert.equal(preRegister(LB), 0);
  const e = LB.strategies.find(x => x.id === 'SQ1-BBAUTH'); assert.match(e.status, /pre-registered 2026-10-24/); assert.equal(e.agent, 'squad1'); assert.ok(e.sources.length >= 2);
});

test('paper board: capped, after cost; ready at 30+ trades on 10+ days with a positive average', () => {
  const rows = [...Array(30)].map((_, i) => ({ d: '2026-11-' + String(1 + (i % 12)).padStart(2, '0'), sym: 'S' + i, g: i === 0 ? 10 : 0.02, c: 0.01 }));
  const s = boardStats(rows); assert.equal(s.n, 30); assert.equal(s.days, 12); assert.ok(Math.abs(s.avg - ((3 - 0.008) + 29 * 0.012) / 30) < 1e-4); assert.equal(paperReady(s), true);
});

test('the standard is the system judge, unchanged: a rule that wins only in one half is not TRADABLE SMALL', () => {
  const good = { n: 40, blocks: 6, avg: 0.03, avgStress: 0.026, edge: 0.02, vsOwn: 0.01, noTop2: 0.02, tBlock: 3.1 };
  assert.equal(judge({ older: good, newer: good }, { bar: 4 }).verdict, 'TRADABLE SMALL');
  assert.notEqual(judge({ older: good, newer: { ...good, edge: -0.01 } }, { bar: 4 }).verdict, 'TRADABLE SMALL');
});
