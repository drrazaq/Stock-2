// Seams: squad27-core.mjs (SQUAD 27, 27 Oct 2026: SQ27-ODDLOT odd-lot issuer tender arbitrage). Index parsing, offer and amendment
// readers, the timeline, the entry, the gate, the payout and the summaries. Run: node --test test/squad27-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { tickerOfV1, parseMaster, parseIndexHtm, pickOfferDoc, pickAmendDocs, html2text, datesIn, tickerOf, priceTerms, securityOf, oddLotOf, expiryOf, conditionsOf, offerFields,
  amendmentFields, timeline, expiryAsOf, entryIndex, arbTrade, summarize, byHalf, isComplete, halalMark, preRegister, ID, ID_A1 } from '../squad27-core.mjs';

const OFFER = `OFFER TO PURCHASE FOR CASH BY ACME CORP. OF UP TO $50,000,000 OF ITS SHARES OF COMMON STOCK AT A PURCHASE PRICE NOT GREATER THAN $27.00 PER SHARE NOR LESS THAN $24.50 PER SHARE.
THE OFFER, PRORATION PERIOD AND WITHDRAWAL RIGHTS WILL EXPIRE AT 5:00 P.M., NEW YORK CITY TIME, ON MARCH 3, 2022, UNLESS THE OFFER IS EXTENDED.
The Offer is not conditioned upon any minimum number of Shares being tendered. The Offer is not subject to any financing condition.
The Shares are listed and traded on the Nasdaq Global Select Market under the symbol "ACME." On January 28, 2022 the last reported sale price was $23.10.
Upon the terms and subject to the conditions of the Offer, if more than the maximum number of Shares are properly tendered, we will purchase Shares first from all holders of "odd lots" of fewer than 100 Shares who properly tender all of their Shares at or below the Purchase Price, and then on a pro rata basis from all other shareholders.`;

test('master index: SC TO-I rows only, one per accession', () => {
  const txt = 'CIK|Company Name|Form Type|Date Filed|Filename\n--------\n123|ACME CORP|SC TO-I|2022-02-01|edgar/data/123/0001193125-22-012345.txt\n123|ACME CORP|SC TO-I|2022-02-01|edgar/data/123/0001193125-22-012345.txt\n123|ACME CORP|SC TO-I/A|2022-03-04|edgar/data/123/0001193125-22-022222.txt\n9|X|SC TO-T|2022-02-01|edgar/data/9/0000000009-22-000001.txt\n';
  const r = parseMaster(txt); assert.equal(r.length, 2); assert.equal(r[0].acc, '0001193125-22-012345'); assert.equal(r[1].form, 'SC TO-I/A');
});

test('index page: offer exhibit picked; amendment press release picked', () => {
  const row = (seq, desc, doc, type) => `<tr><td scope="row">${seq}</td><td scope="row">${desc}</td><td scope="row"><a href="/Archives/edgar/data/123/000119312522012345/${doc}">${doc}</a></td><td scope="row">${type}</td><td scope="row">1000</td></tr>`;
  const html = '<table class="tableFile" summary="Document Format Files">' + row(1, 'SC TO-I', 'd1.htm', 'SC TO-I') + row(2, 'OFFER TO PURCHASE', 'dex99a1a.htm', 'EX-99.(A)(1)(A)') + row(3, 'LETTER', 'dex99a1b.htm', 'EX-99.(A)(1)(B)') + '</table>';
  const D = parseIndexHtm(html); assert.equal(D.length, 3); assert.equal(pickOfferDoc(D).doc.doc, 'dex99a1a.htm');
  assert.equal(pickOfferDoc(D.filter(d => d.seq !== '2')).how, 'main');
  const A = parseIndexHtm('<table class="tableFile">' + row(1, 'AMENDMENT', 'a.htm', 'SC TO-I/A') + row(2, 'PRESS RELEASE', 'pr.htm', 'EX-99.(A)(5)(C)') + '</table>');
  assert.deepEqual(pickAmendDocs(A).map(d => d.doc), ['a.htm', 'pr.htm']);
});

test('text: entities and curly quotes; dates', () => {
  assert.equal(html2text('<p>symbol &#8220;ACME&#8221;&nbsp;on</p>'), 'symbol "ACME" on');
  assert.deepEqual(datesIn('on MARCH 3, 2022 and Sept. 9, 2021').map(x => x.d), ['2022-03-03', '2021-09-09']);
});

const ORIG0 = { acc: 'a0', date: '2022-02-01', expiry: '2022-03-03' };
test('offer fields: Dutch range, ticker, odd lot, expiry, conditions', () => {
  const f = offerFields(OFFER, '2022-02-01');
  assert.equal(f.type, 'dutch'); assert.equal(f.min, 24.5); assert.equal(f.max, 27); assert.equal(f.ticker, 'ACME'); assert.equal(f.security, 'common');
  assert.equal(f.oddLot, true); assert.match(f.oddLotQuote, /odd lots/); assert.equal(f.expiry, '2022-03-03');
  assert.equal(f.financingCondition, false); assert.equal(f.minimumCondition, false);
  assert.deepEqual(priceTerms('at a price of $12.50 per Share, net to the seller in cash'), { type: 'fixed', min: 12.5, max: 12.5 });
  assert.deepEqual(priceTerms('at a price not less than $10.00 nor greater than $11.50 per Share'), { type: 'dutch', min: 10, max: 11.5 });
  assert.equal(priceTerms('at a price equal to 98% of the net asset value per Share').type, 'nav');
  assert.equal(priceTerms('at a price not greater than Cdn$94.00 nor less than Cdn$78.50 per Share').type, 'foreign');
  assert.equal(timeline({ ...ORIG0, type: 'fixed', min: 6, max: 6 }, [{ date: '2022-03-04', fields: { accepted: true, finalPrice: 600 } }], '2026-10-27').finalPrice, 6, 'insane price then fixed fallback');
  assert.equal(tickerOf('listed on the NYSE under the symbol "XY.B"'), 'XY.B'); assert.equal(tickerOf('a fund not listed on any exchange'), null);
  assert.equal(tickerOf('trades under the symbol "ZZZ" on the New York Stock Exchange'), 'ZZZ');
  const gme = 'Our Class A Common Stock is listed on the New York Stock Exchange ("NYSE") under the symbol "GME."';
  assert.equal(tickerOfV1(gme), null, 'bug SQ27-B1 reproduced'); assert.equal(tickerOf(gme), 'GME', 'bug SQ27-B1 fixed');
  assert.equal(tickerOf('The Shares trade on the Nasdaq Global Select Market under the symbol MSTR.'), 'MSTR');
  const cp = html2text('The Shares are listed on the New York Stock Exchange (\u0093NYSE\u0094) and trade under the symbol \u0093GME.\u0094 On June 7');
  assert.equal(tickerOf(cp), 'GME', 'Windows-1252 quotes (root cause of SQ27-B1)');
  assert.equal(securityOf('OFFER TO EXCHANGE ELIGIBLE OPTIONS FOR NEW OPTIONS'), 'other'); assert.equal(securityOf('Offer to purchase for cash up to $100 million of its 2.5% Convertible Senior Notes due 2026'), 'other');
  assert.equal(oddLotOf('Holders of odd lots are welcome.').oddLot, false, 'no priority context');
  assert.equal(expiryOf('The offer will expire on January 1, 2020.', '2022-02-01'), null, 'date out of window');
  assert.equal(conditionsOf('The Offer is subject to the Financing Condition.').financingCondition, true);
});

test('amendments: extension, termination, final price; conditional sentences ignored', () => {
  const a = amendmentFields('The Offer, previously scheduled to expire on March 3, 2022, has been extended to expire at 5:00 p.m. on March 17, 2022.', '2022-03-02', '2022-03-03');
  assert.equal(a.extendTo, '2022-03-17');
  assert.equal(amendmentFields('The Company has terminated the Offer because the Financing Condition was not satisfied.', '2022-03-04', '2022-03-03').terminated, true);
  assert.equal(amendmentFields('The Company may terminate the Offer if any condition is not satisfied.', '2022-03-04', '2022-03-03').terminated, false);
  const f = amendmentFields('The Company accepted for purchase 1,500,000 Shares at a final purchase price of $25.75 per Share.', '2022-03-08', '2022-03-03');
  assert.equal(f.accepted, true); assert.equal(f.finalPrice, 25.75);
  assert.equal(amendmentFields('Shareholders who have withdrawn their Shares may re-tender them.', '2022-03-04', '2022-03-03').terminated, false, 'withdrawn shares are not a termination');
  assert.equal(amendmentFields('ACME announced the termination of its previously announced modified Dutch auction tender offer.', '2022-03-04', '2022-03-03').terminated, true);
  const r = amendmentFields('The Company has accepted for purchase Shares at a price not greater than $27.00 per Share nor less than $24.50 per Share.', '2022-03-04', '2022-03-03');
  assert.equal(r.finalPrice, null, 'restated range is not a final price');
  const p = amendmentFields('Based on the preliminary count, the Company expects to accept for purchase 1,000,000 Shares at $25.50 per Share. The Company has accepted for purchase 990,000 Shares at a final price of $25.25 per Share.', '2022-03-04', '2022-03-03');
  assert.equal(p.finalPrice, 25.25); assert.equal(p.preliminary, false); assert.equal(p.accepted, true);
});

const ORIG = { acc: 'a1', date: '2022-02-01', ticker: 'ACME', security: 'common', type: 'dutch', min: 24.5, max: 27, oddLot: true, expiry: '2022-03-03' };
const days = []; for (let d = new Date('2022-01-31T00:00:00Z'); days.length < 60; d = new Date(d.getTime() + 864e5)) if (d.getUTCDay() % 6) days.push(d.toISOString().slice(0, 10));

test('timeline and entry: extension filed before the entry moves the entry; after it does not', () => {
  const tl = timeline(ORIG, [{ date: '2022-02-25', fields: { extendTo: '2022-03-17' } }, { date: '2022-03-21', fields: { accepted: true, finalPrice: 25.75 } }], '2026-10-27');
  assert.equal(tl.status, 'completed'); assert.equal(tl.finalExpiry, '2022-03-17'); assert.equal(tl.finalPrice, 25.75);
  const off = { ...ORIG, ...tl }; assert.equal(expiryAsOf(off.expiryHist, '2022-02-24'), '2022-03-03');
  assert.equal(days[entryIndex(days, off, 'E2')], '2022-03-15');
  const late = { ...ORIG, ...timeline(ORIG, [{ date: '2022-03-02', fields: { extendTo: '2022-03-17' } }, { date: '2022-03-21', fields: { accepted: true, finalPrice: 25 } }], '2026-10-27') };
  assert.equal(days[entryIndex(days, late, 'E2')], '2022-03-01', 'extension filed after the entry day is not known at the entry');
  assert.equal(days[entryIndex(days, off, 'A1')], '2022-02-02');
  assert.equal(timeline(ORIG, [], '2022-02-10').status, 'open'); assert.equal(timeline(ORIG, [], '2026-10-27').status, 'unknown');
  assert.equal(timeline(ORIG, [{ date: '2022-03-01', fields: { terminated: true } }], '2026-10-27').status, 'terminated');
});

test('arbitrage: gate, payout, fees, terminated valuation', () => {
  const C = days.map(() => 24); const bars = { D: days, C };
  const off = { ...ORIG, ...timeline(ORIG, [{ date: '2022-03-04', fields: { accepted: true, finalPrice: 25.75 } }], '2026-10-27') };
  const t = arbTrade(off, bars, 'E2'); assert.equal(t.entry, '2022-03-01');
  const buy = 99 * 24 * 1.008; assert.equal(t.profitActual, Math.round((99 * 25.75 - buy - 28) * 100) / 100); assert.equal(t.profitMin, Math.round((99 * 24.5 - buy - 28) * 100) / 100);
  assert.equal(t.cashDate, days[days.indexOf('2022-03-03') + 5]);
  assert.equal(arbTrade(off, { D: days, C: days.map(() => 24.6) }, 'E2').skip, 'no gap');
  const term = { ...ORIG, ...timeline(ORIG, [{ date: '2022-03-02', fields: { terminated: true } }], '2026-10-27') };
  const Ct = days.map((d) => d > '2022-03-02' ? 20 : 24); const tt = arbTrade(term, { D: days, C: Ct }, 'A1');
  assert.equal(tt.profitActual, tt.profitMin); assert.equal(tt.profitMin, Math.round((99 * 20 - 99 * 24 * 1.008 - 28) * 100) / 100);
  assert.equal(arbTrade({ ...off, oddLot: false }, bars).skip, 'not eligible');
});

test('summaries, completeness, halal mark, pre-registration', () => {
  const T = [{ entry: '2021-05-01', capital: 1000, days: 10, profitActual: 50 }, { entry: '2024-05-01', capital: 1000, days: 10, profitActual: -10 }, { entry: '2024-06-01', capital: 1000, days: 10, profitActual: null }];
  const s = summarize(T); assert.equal(s.n, 2); assert.equal(s.total, 40); assert.equal(s.worst, -10); assert.equal(s.years['2024'].n, 1);
  assert.equal(byHalf(T, 'profitActual').older.n, 1);
  assert.equal(isComplete({ quartersRead: 31, quartersNeed: 31, origRead: 99, origNeed: 100, amendRead: 1, amendNeed: 1, pxOk: 9, pxNeed: 10 }).ok, true);
  assert.equal(isComplete({ quartersRead: 30, quartersNeed: 31, origRead: 1, origNeed: 1, amendRead: 1, amendNeed: 1, pxOk: 1, pxNeed: 1 }).ok, false);
  assert.equal(halalMark('X', { X: { s: 'ok' } }, new Set()), 'ok'); assert.equal(halalMark('Y', {}, new Set(['Y'])), 'fail'); assert.equal(halalMark('Z', {}, new Set()), 'unknown');
  const LB = { strategies: [] }; assert.equal(preRegister(LB), 2); assert.equal(preRegister(LB), 0); assert.ok(LB.strategies.find(e => e.id === ID) && LB.strategies.find(e => e.id === ID_A1));
});
