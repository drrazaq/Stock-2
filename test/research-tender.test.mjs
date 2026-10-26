// Seams: research-core.mjs IDEA 2 (daily researcher, 26 Oct 2026): cash tender offers (part 1 of C-SPEC1). The submission header
// (subject company, New York acceptance time), the offer price reader (most frequent '$X per share ... in cash', CVR flag, par value
// ignored, stock-for-stock offers give no price), the spread windows, the exits (deal closed / break / 120 sessions / not complete),
// the data rule and the library pre-registration. No network. Run: node --test test/research-tender.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, LAZY_IDS, TENDER_IDS, TO, parseSubmission, offerPrice, spreadOf, saneSpread, inSpread, tenderExit, tenderDataRule, preRegister } from '../research-core.mjs';

const SUB = `<SEC-HEADER>0001193125-24-100001.hdr.sgml : 20240415
<ACCEPTANCE-DATETIME>20240415163012
ACCESSION NUMBER:		0001193125-24-100001
CONFORMED SUBMISSION TYPE:	SC TO-T
SUBJECT COMPANY:
	COMPANY DATA:
		COMPANY CONFORMED NAME:			TARGET THERAPEUTICS INC
		CENTRAL INDEX KEY:			0001555555
FILED BY:
	COMPANY DATA:
		COMPANY CONFORMED NAME:			BIG PHARMA CO
		CENTRAL INDEX KEY:			0000078003
</SEC-HEADER>
<DOCUMENT>
<TYPE>SC TO-T
<TEXT><html><p>This Tender Offer Statement relates to the offer to purchase all outstanding shares of common stock, par value $0.001 per share (the &#8220;Shares&#8221;), of Target Therapeutics, Inc. at a price of $56.50 per Share, net to the seller in cash, without interest.</p></html></TEXT>
</DOCUMENT>
<DOCUMENT>
<TYPE>EX-99.(A)(1)(A)
<TEXT><html><p>Offer to Purchase for Cash All Outstanding Shares of Common Stock of Target Therapeutics at $56.50 Net Per Share in Cash</p><p>Purchaser is offering $56.50 per Share (the &ldquo;Offer Price&rdquo;), in cash.</p></html></TEXT>
</DOCUMENT>
<DOCUMENT>
<TYPE>GRAPHIC
<TEXT>begin 644 logo.jpg $99.00 per share in cash</TEXT>
</DOCUMENT>`;

test('registry: two tender rules beside the three lazy rules; spreads 3-15% and >0-15%; max hold 120', () => {
  assert.deepEqual(LAZY_IDS, ['RQ-LAZY-63', 'RQ-LAZY-126', 'RQ-LAZY-CHG63']); assert.deepEqual(TENDER_IDS, ['RQ-TENDER-3-15', 'RQ-TENDER-ALL']);
  assert.equal(IDS.length, 5); for (const id of TENDER_IDS) { assert.equal(RULES[id].kind, 'buy'); assert.equal(RULES[id].hold, 120); }
});

test('submission: subject company CIK (not the filer), NY acceptance date, only SC TO / EX-99 documents kept', () => {
  const p = parseSubmission(SUB); assert.equal(p.subjectCik, '1555555'); assert.equal(p.accept, '20240415163012'); assert.equal(p.date, '2024-04-15');
  assert.deepEqual(p.docs.map(d => d.type), ['SC TO-T', 'EX-99.(A)(1)(A)']);
  assert.equal(parseSubmission('nothing').subjectCik, null);
});

test('offer price: the most frequent cash amount; par value and graphics ignored; CVR flagged; stock offers give none', () => {
  const p = offerPrice(parseSubmission(SUB).docs); assert.equal(p.px, 56.5); assert.equal(p.n, 3); assert.equal(p.cvr, false);
  const cvr = offerPrice([{ text: '<p>(i) $12.00 per Share, net to the seller in cash, plus (ii) one non-transferable contingent value right per Share</p>' }]);
  assert.equal(cvr.px, 12); assert.equal(cvr.cvr, true);
  assert.equal(offerPrice([{ text: 'Exchange offer: 0.5 shares of Parent common stock for each share of Target' }]).px, null);
  assert.equal(offerPrice([{ text: '$1,250.00 per share in cash' }]).px, 1250);
  assert.equal(offerPrice([{ text: '$0.10 per share in cash' }]).px, null);   // under 0.50 USD
  // tie: the first seen wins; a $ in between breaks the match
  assert.equal(offerPrice([{ text: '$20.00 per share in cash. Later $21.00 per share in cash.' }]).px, 20);
  assert.equal(offerPrice([{ text: '$5.00 per share, plus $1.00 in cash' }]).px, null);
});

test('spread windows: 3-15% and >0-15%; sanity -50%..+100%', () => {
  assert.ok(Math.abs(spreadOf(56.5, 50) - 0.13) < 1e-9); assert.equal(spreadOf(null, 50), null);
  assert.equal(inSpread('RQ-TENDER-3-15', 0.03), true); assert.equal(inSpread('RQ-TENDER-3-15', 0.029), false); assert.equal(inSpread('RQ-TENDER-3-15', 0.15), true); assert.equal(inSpread('RQ-TENDER-3-15', 0.151), false);
  assert.equal(inSpread('RQ-TENDER-ALL', 0.001), true); assert.equal(inSpread('RQ-TENDER-ALL', 0), false); assert.equal(inSpread('RQ-TENDER-ALL', -0.01), false);
  assert.equal(saneSpread(1.2), false); assert.equal(saneSpread(-0.6), false); assert.equal(saneSpread(0.05), true);
});

test('exits: deal closed (10-session gap), break (close 10% under the filing-day close), 120 sessions, not complete yet', () => {
  const series = (arr) => (t) => arr[t] ?? null;
  // closed: prices to session 30, then nothing
  const a = Array(200).fill(null); for (let t = 0; t <= 30; t++) a[t] = 50.2;
  assert.deepEqual(tenderExit({ k: 5, c0: 50, T: 200, px: series(a) }), { x: 30, why: 'closed' });
  // break: a close at 45 (10% under 50) on session 12
  const b = Array(200).fill(50.3); b[12] = 45; assert.deepEqual(tenderExit({ k: 5, c0: 50, T: 200, px: series(b) }), { x: 12, why: 'break' });
  // time: trading all along, 120 sessions after entry 5 -> exit 124
  assert.deepEqual(tenderExit({ k: 5, c0: 50, T: 200, px: series(Array(200).fill(50.1)) }), { x: 124, why: 'time' });
  // not complete: still trading at the data end inside the hold
  assert.equal(tenderExit({ k: 150, c0: 50, T: 200, px: series(Array(200).fill(50.1)) }), null);
  // stopped trading near the data end (10+ sessions without prices before the last session): closed
  const c = Array(200).fill(null); for (let t = 150; t <= 180; t++) c[t] = 50; assert.deepEqual(tenderExit({ k: 150, c0: 50, T: 200, px: series(c) }), { x: 180, why: 'closed' });
  // a reused ticker after the gap does not extend the trade
  const d = Array(200).fill(null); for (let t = 0; t <= 20; t++) d[t] = 50; for (let t = 40; t < 200; t++) d[t] = 9; assert.deepEqual(tenderExit({ k: 5, c0: 50, T: 200, px: series(d) }), { x: 20, why: 'closed' });
  assert.equal(TO.breakDrop, 0.1); assert.equal(TO.maxHold, 120);
});

test('data rule: 95% index days, 95% filings read, 50% offer price found among priced targets', () => {
  assert.equal(tenderDataRule({ idxNeed: 100, idxRead: 96, filNeed: 100, filRead: 96, subjPriced: 100, subjOffer: 60 }).ok, true);
  assert.match(tenderDataRule({ idxNeed: 100, idxRead: 90, filNeed: 100, filRead: 96, subjPriced: 100, subjOffer: 60 }).why, /index/);
  assert.match(tenderDataRule({ idxNeed: 100, idxRead: 96, filNeed: 100, filRead: 90, subjPriced: 100, subjOffer: 60 }).why, /filings read/);
  assert.match(tenderDataRule({ idxNeed: 100, idxRead: 96, filNeed: 100, filRead: 96, subjPriced: 100, subjOffer: 40 }).why, /offer price/);
  assert.equal(tenderDataRule({ idxNeed: 0, idxRead: 0, filNeed: 0, filRead: 0, subjPriced: 0, subjOffer: 0 }).ok, false);
});

test('library: the tender entries are added once with their own note and sources; existing lazy entries untouched', () => {
  const LB = { strategies: [{ id: 'RQ-LAZY-63', status: 'tested: rejected' }, { id: 'C-SPEC1', status: 'queued (Agent C)' }] };
  assert.equal(preRegister(LB), 4); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies[0].status, 'tested: rejected');
  const e = LB.strategies.find(x => x.id === 'RQ-TENDER-3-15'); assert.match(e.status, /pre-registered 2026-10-26/); assert.match(e.note, /C-SPEC1/); assert.ok(e.sources.length >= 2); assert.equal(e.hold, 120);
});
