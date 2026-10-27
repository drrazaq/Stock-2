// Seams: squad26-core.mjs (SQUAD 26, 27 Oct 2026: SQ26-FIRSTMIN). The counterparty context test, the event sets, the clock, the
// first-minute entry, the prior-session filters, the exits, the Atom parser. Run: node --test test/squad26-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { nyParts } from '../sec-time.mjs';
import { ID, VERSIONS, TH, EXCLUDED_CP, contextMatch, eventOf, isFinDoc, itemNumbers, priorSession, sessionAfter, openSessionAfter, firstEntry, priorStats, passPrior, exitTrade, grossOf, jumpIn, isRegular,
  parseAtom, lagStats, preRegister, etToIso } from '../squad26-core.mjs';

const COS = [{ cik: '1018724', aliases: ['Amazon'] }, { cik: '1045810', aliases: ['NVIDIA', 'Nvidia'] }, { cik: '1652044', aliases: ['Google', 'Alphabet'] }, { cik: '70858', aliases: ['Bank of America'] }, { cik: '789019', aliases: ['Microsoft'] }];

test('registry: one primary, 12 versions, pre-registration idempotent', () => {
  assert.equal(VERSIONS.length, 12); assert.equal(VERSIONS.filter(v => v.primary).length, 1); assert.equal(VERSIONS.find(v => v.primary).id, ID);
  const LB = { strategies: [] }; assert.equal(preRegister(LB), 3); assert.equal(preRegister(LB), 0); assert.ok(EXCLUDED_CP.has('70858'));
});

test('counterparty context: commercial sentence, no financing nearby, lenders excluded, financing documents skipped', () => {
  assert.equal(contextMatch('On May 1 the Company entered into a supply agreement with NVIDIA Corporation for GPUs.', COS).cik, '1045810');
  assert.equal(contextMatch('The Company signed a collaboration with Google LLC to deploy the platform.', COS).alias, 'Google');
  assert.equal(contextMatch('The Company entered into a credit agreement with Bank of America, N.A., as administrative agent.', COS), null, 'lender');
  assert.equal(contextMatch('Bank of America is our customer under a services agreement.', COS), null, 'excluded counterparty');
  assert.equal(contextMatch('The Company entered into a Securities Purchase Agreement with Microsoft for the purchase of shares.', COS), null, 'financing sentence');
  assert.equal(contextMatch('Our software runs on Microsoft Azure.', COS), null, 'extra name word');
  assert.equal(contextMatch('We are pleased with the results. Amazon remains a large company.', COS), null, 'no commercial term');
  assert.equal(contextMatch('The loan was repaid in full. Separately, Amazon became a customer of the Company under a purchase order.', COS), null, 'financing within 300 characters');
  const pad = ' ' + 'Nothing else happened today. '.repeat(15);
  assert.equal(contextMatch('The loan was repaid in full.' + pad + 'Separately, Amazon became a customer of the Company.', COS).cik, '1018724', 'financing far away is fine');
  assert.ok(isFinDoc('EX-10.1', 'CREDIT AGREEMENT dated as of May 1 among ACME and the Lenders'));
  assert.equal(contextMatch('LOAN AND SECURITY AGREEMENT ... Amazon is a customer under the supply terms.', COS, 'EX-10.2'), null, 'financing document');
  assert.equal(isFinDoc('8-K', 'credit agreement'), false, 'only EX-10 documents are skipped whole');
});

test('event sets: 1.01 any doc; 8.01 only inside the EX-99.1, never with 1.01', () => {
  const d = (type, text) => ({ type, text }), s = 'The Company entered into a license agreement with Microsoft Corporation.';
  assert.equal(eventOf({ items: ['1.01', '9.01'], docs: [d('8-K', 'nothing'), d('EX-10.1', s)] }, COS).set, '101');
  assert.equal(eventOf({ items: ['8.01', '9.01'], docs: [d('8-K', s), d('EX-99.1', 'nothing')] }, COS), null, '8.01 needs the press release');
  assert.equal(eventOf({ items: ['8.01'], docs: [d('EX-99.1', s)] }, COS).set, '801');
  assert.equal(eventOf({ items: ['1.01', '8.01'], docs: [d('EX-99.1', 'nothing')] }, COS), null);
  assert.equal(eventOf({ items: ['7.01'], docs: [d('EX-99.1', s)] }, COS), null);
  assert.deepEqual(itemNumbers(['Entry into a Material Definitive Agreement', 'Other Events', 'Financial Statements and Exhibits']), ['1.01', '8.01', '9.01']);
});

const D = ['2024-02-12', '2024-02-13', '2024-02-14', '2024-02-15', '2024-02-16', '2024-02-20', '2024-02-21', '2024-02-22', '2024-02-23', '2024-02-26', '2024-02-27', '2024-02-28', '2024-02-29'];
const ms = (d, hm) => Date.parse(etToIso(d.replace(/-/g, '') + hm.replace(':', '') + '00', nyParts));
test('clock: prior session, session 1, next open (incl. weekend)', () => {
  assert.equal(priorSession(D, { d: '2024-02-14', hm: '16:12' }), 2); assert.equal(priorSession(D, { d: '2024-02-14', hm: '07:18' }), 1); assert.equal(priorSession(D, { d: '2024-02-14', hm: '11:00' }), 1);
  assert.equal(sessionAfter(D, { d: '2024-02-14', hm: '16:14' }), 3); assert.equal(sessionAfter(D, { d: '2024-02-14', hm: '07:20' }), 2); assert.equal(sessionAfter(D, { d: '2024-02-17', hm: '10:00' }), 5, 'Saturday -> Tuesday after the holiday');
  assert.equal(openSessionAfter(D, { d: '2024-02-14', hm: '09:28' }), 2); assert.equal(openSessionAfter(D, { d: '2024-02-14', hm: '09:29' }), 3); assert.equal(openSessionAfter(D, { d: '2024-02-14', hm: '18:00' }), 3);
  assert.equal(etToIso('20240214161200', nyParts), '2024-02-14T21:12:00.000Z');
  assert.equal(isRegular(nyParts(ms('2024-02-14', '09:30')), d => D.includes(d)), true); assert.equal(isRegular(nyParts(ms('2024-02-14', '16:00')), d => D.includes(d)), false);
});

test('first-minute entry: bar start >= acceptance + 60 s, within 30 minutes, high + 1% / 3%', () => {
  const acc = ms('2024-02-14', '16:12') + 37e3, reg = (x) => isRegular(nyParts(x), d => D.includes(d));
  const bars = [{ ms: ms('2024-02-14', '16:13'), o: 2, h: 2.1, l: 2, c: 2 }, { ms: ms('2024-02-14', '16:14'), o: 2.2, h: 2.4, l: 2.2, c: 2.3 }];
  const e = firstEntry(bars, acc, reg); assert.equal(e.j, 1); assert.equal(e.slip, 0.03); assert.ok(Math.abs(e.px - 2.4 * 1.03) < 1e-9, '16:13 starts only 23 s after: too early');
  assert.equal(firstEntry([{ ms: acc + 31 * 60e3, o: 1, h: 1, l: 1, c: 1 }], acc, reg), null, 'nothing within 30 minutes');
  const r = firstEntry([{ ms: ms('2024-02-14', '10:01'), o: 3, h: 3, l: 3, c: 3 }], ms('2024-02-14', '10:00'), reg); assert.equal(r.slip, 0.01);
});

test('prior-session filter: raw close 1-10, 20-day traded value >= 0.5M with 18+ bars', () => {
  const bars = Array.from({ length: 20 }, (_, j) => ({ d: '2024-01-' + String(j + 1).padStart(2, '0'), c: 5, v: 200000 }));
  const s = priorStats(bars, '2024-01-20'); assert.equal(s.close, 5); assert.equal(s.dv, 1e6); assert.ok(passPrior(s));
  assert.equal(priorStats(bars, '2024-01-21'), null, 'no bar on the prior session'); assert.equal(passPrior({ close: 11, dv: 1e7 }), false); assert.equal(passPrior({ close: 5, dv: 4e5 }), false);
  assert.equal(priorStats(bars.slice(0, 10), '2024-01-10').dv, null, 'under 18 bars');
});

test('exits: close / n sessions / 25% stop (minutes on session 1, daily after), gone, open', () => {
  const bar = new Map([['2024-02-15', { o: 4, h: 4.1, l: 3.1, c: 3.8 }], ['2024-02-16', { o: 3.7, h: 3.9, l: 3.6, c: 3.7 }], ['2024-02-20', { o: 3.5, h: 3.6, l: 2.0, c: 2.5 }]]), reg = () => true;
  const a = exitTrade({ D, bar, s1: 3, n: 1, fill: 4, regularAt: reg }); assert.equal(a.px, 3.8); assert.equal(a.kind, 'time');
  const b = exitTrade({ D, bar, s1: 3, n: 3, fill: 4, regularAt: reg }); assert.equal(b.px, 2.5); assert.equal(b.x, 5);
  const c = exitTrade({ D, bar, s1: 3, n: 3, fill: 4, stop: true, minutes: [], regularAt: reg }); assert.equal(c.kind, 'stop'); assert.equal(c.px, 3); assert.equal(c.x, 5);
  const m = exitTrade({ D, bar, s1: 3, n: 3, fill: 4, stop: true, minutes: [{ ms: 1, o: 2.9, l: 2.8 }], regularAt: () => false }); assert.equal(m.px, 2.9); assert.equal(m.slip, 0.03); assert.equal(m.held, 1);
  const o = exitTrade({ D, bar, s1: 3, n: 3, fill: 4.2, stop: true, minutes: null, regularAt: reg }); assert.equal(o.kind, 'stop'); assert.equal(o.x, 3, 'open entry: the session-1 daily low counts');
  assert.ok(exitTrade({ D, bar, s1: 10, n: 10, fill: 4, regularAt: reg }).open);
  const g = exitTrade({ D, bar, s1: 3, n: 8, fill: 4, regularAt: reg }); assert.equal(g.kind, 'gone'); assert.equal(g.px, 2.5);
  assert.ok(Math.abs(grossOf(4.04, 4.4, 0.01) - (4.4 * 0.99 / 4.04 - 1)) < 1e-12); assert.equal(grossOf(1, 10, 0), 3, 'cap');
  assert.equal(jumpIn([1, 1.1, 11.2]), true); assert.equal(jumpIn([1, 1.6, 2]), false);
});

test('Atom feed parser and lag stats', () => {
  const xml = '<feed><entry><title>8-K - ACME CORP (0001234567) (Filer)</title><link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1234567/000123456726000001/0001234567-26-000001-index.htm"/><summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2026-10-27 &lt;b&gt;AccNo:&lt;/b&gt; 0001234567-26-000001 &lt;b&gt;Size:&lt;/b&gt; 300 KB&lt;br&gt;Item 1.01: Entry into a Material Definitive Agreement&lt;br&gt;Item 9.01: Financial Statements</summary><updated>2026-10-27T07:18:03-04:00</updated><category scheme="https://www.sec.gov/" label="form type" term="8-K"/><id>urn:tag:sec.gov,2008:accession-number=0001234567-26-000001</id></entry></feed>';
  const a = parseAtom(xml); assert.equal(a.length, 1); assert.equal(a[0].cik, '1234567'); assert.equal(a[0].form, '8-K'); assert.equal(a[0].adsh, '0001234567-26-000001'); assert.deepEqual(a[0].items, ['1.01', '9.01']);
  assert.equal(Date.parse(a[0].updated), Date.parse('2026-10-27T11:18:03Z'));
  assert.deepEqual(lagStats([30, 90, 60]).medianSec, 60); assert.equal(lagStats([]).n, 0);
});
