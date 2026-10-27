// Seams: squad24-audit-core.mjs (Stock-2 label audit, 27 Oct 2026). Regression tests for every confirmed false match in SQ24-MEGADEAL
// (ATRS Robert F. Apple, RGNX wet AMD, GRVI 26.54 trillion USD, FBIO About/partnerships boilerplate + Oaktree AUM, PCT forward-looking +
// capital and surplus, bank credit agreements) and for the cases the fixed extractor must still accept.
// Run: node --test test/squad24-audit-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditFiling, toBlocks, submissionDocs, isPerson, partyPattern, inList, inKeywordList, amountsIn, amountClass, gateAmount, sizeOk, familyOf, boilerplateRanges, isCreditDoc, decide,
  AMBIG, COUNTED, LABELS_SHA } from '../squad24-audit-core.mjs';

const CO = {
  apple: { cik: '320193', name: 'Apple Inc.', aliases: ['Apple'] }, amd: { cik: '2488', name: 'Advanced Micro Devices', aliases: ['Advanced Micro Devices', 'AMD'] },
  amzn: { cik: '1018724', name: 'Amazon.Com Inc', aliases: ['Amazon', 'Amazon Web Services'] }, azn: { cik: '901832', name: 'AstraZeneca PLC', aliases: ['AstraZeneca'] },
  pg: { cik: '80424', name: 'Procter & Gamble Company', aliases: ['Procter & Gamble'] }, bac: { cik: '70858', name: 'Bank of America Corporation', aliases: ['Bank of America'] },
  pfe: { cik: '78003', name: 'Pfizer Inc.', aliases: ['Pfizer'] }, nvs: { cik: '1114448', name: 'Novartis AG', aliases: ['Novartis'] }, nvda: { cik: '1045810', name: 'Nvidia Corp', aliases: ['NVIDIA', 'Nvidia'] },
  lly: { cik: '59478', name: 'Eli Lilly & Co.', aliases: ['Eli Lilly'] }, gs: { cik: '886982', name: 'Goldman Sachs Group Inc.', aliases: ['Goldman Sachs'] } };
const ALL = Object.values(CO), CAP = 300e6;
const doc = (type, text) => ({ type, text: toBlocks(text) });

test('registry: counted families, labels sha placeholder, ambiguous aliases', () => {
  assert.deepEqual(COUNTED, ['COMMERCIAL_CUSTOMER', 'LICENSE', 'EQUITY_INVESTMENT_BY_GIANT']); assert.ok(LABELS_SHA === null || /^[0-9a-f]{64}$/.test(LABELS_SHA));
  for (const a of ['AMD', 'IBM', 'Apple', 'Visa', 'Merck', 'Amazon', 'Google']) assert.ok(AMBIG[a], a);
});

test('ATRS 2022-04-13: "Apple" is CEO Robert F. Apple, never Apple Inc.', () => {
  const t = 'Halozyme Therapeutics, Inc. and Antares Pharma, Inc. today announced that they have entered into a definitive agreement under which Halozyme will acquire Antares for $5.60 per share in cash, or approximately $960 million.\n' +
    '"This agreement recognizes the value we have built," said Robert F. Apple, President and Chief Executive Officer of Antares, who signed the agreement with Halozyme.\nMr. Apple will join the combined company.';
  const r = auditFiling([doc('EX-99.1', t)], ALL, CAP); assert.equal(r.accepted.length, 0); assert.ok(r.hits.length >= 2); assert.ok(r.hits.every(h => h.why === 'person name'), JSON.stringify(r.hits));
  const t2 = 'Robert F. Apple'; assert.equal(isPerson(t2, t2.indexOf('Apple'), 'Apple', CO.apple), true);
  const t3 = 'the CEO, Tim Apple, said'; assert.equal(isPerson(t3, t3.indexOf('Apple'), 'Apple', CO.apple), true, 'capitalised first name before a surname-like alias');
  const t4 = 'entered into a supply agreement with Apple Inc.'; assert.equal(isPerson(t4, t4.indexOf('Apple'), 'Apple', CO.apple), false);
  const t5 = 'a collaboration with Eli Lilly and Company'; assert.equal(isPerson(t5, t5.indexOf('Eli Lilly'), 'Eli Lilly', CO.lly), false, 'own name');
  const t6 = 'Halozyme announced. Apple will buy'; assert.equal(isPerson(t6, t6.indexOf('Apple'), 'Apple', CO.apple), false, 'sentence start');
});

test('RGNX 2025-01-14: "AMD" is wet AMD (the eye disease), not Advanced Micro Devices', () => {
  const t = 'REGENXBIO Inc. entered into a strategic partnership agreement with Nippon Shinyaku Co., Ltd. for RGX-121. REGENXBIO will receive an upfront payment of $110 million and up to $700 million in milestone payments.\n' +
    'REGENXBIO is also developing ABBV-RGX-314 under a collaboration agreement with AbbVie for the treatment of wet AMD and diabetic retinopathy.';
  const r = auditFiling([doc('8-K', t)], ALL, CAP); assert.equal(r.accepted.length, 0); assert.equal(r.hits.find(h => h.alias === 'AMD').why, 'ambiguous alias without the full name in the filing');
  const ok = 'Advanced Micro Devices, Inc. ("AMD") and the Company entered into a supply agreement. Under the agreement with AMD, AMD has agreed to purchase $40 million of product.';
  const r2 = auditFiling([doc('8-K', ok)], [CO.amd], CAP); assert.ok(r2.accepted.length >= 1, 'with the full legal name in the filing the alias counts');
});

test('GRVI 2022-04-20: an amount over 1 trillion USD (a "$26,540,000 million" unit error) is UNKNOWN and out of the gate', () => {
  const t = 'On April 20, 2022, the Company entered into a Transaction Agreement with Amazon.com, Inc. Amazon will purchase services valued at $26,540,000 million under the agreement.';
  const r = auditFiling([doc('8-K', t)], [CO.amzn], 0.5e6 * 7.3); assert.ok(r.accepted.length >= 1); for (const a of r.accepted) { assert.ok(a.amounts.every(x => x.cls === 'UNKNOWN')); assert.equal(a.gate, null); assert.equal(sizeOk(a.gate), false); }
  const a = amountsIn('a $26,540,000 million value')[0]; assert.equal(a.usd, 26.54e12); assert.equal(amountClass('a $26,540,000 million value', a, 1e9), 'UNKNOWN');
  const b = amountsIn('an order valued at $400 million')[0]; assert.equal(amountClass('an order valued at $400 million', b, 5e6), 'UNKNOWN', 'over 50x the market value');
  assert.equal(amountClass('an order valued at $400 million', b, 100e6), 'COMMITTED_PURCHASE');
});

test('FBIO: About-Fortress "partnerships include AstraZeneca" and About-Oaktree "$192 billion" are boilerplate', () => {
  const t = 'Fortress Biotech, Inc. announced that its subsidiary entered into a 50 million credit agreement with Oaktree Capital Management.\n' +
    'About Fortress Biotech\nFortress Biotech, Inc. is an innovative biopharmaceutical company. Fortress\' partnerships include AstraZeneca, City of Hope, Fred Hutchinson Cancer Center and others, under license and collaboration agreements.\n' +
    'About Oaktree\nOaktree is a leader among global investment managers with $192 billion in assets under management.\nForward-Looking Statements\nThis release contains forward-looking statements.';
  const d = doc('EX-99.1', t), br = boilerplateRanges(d.text); assert.ok(br.length >= 1);
  const r = auditFiling([d], ALL, CAP); assert.equal(r.accepted.length, 0); assert.equal(r.hits.find(h => h.alias === 'AstraZeneca').why, 'About / forward-looking / risk boilerplate section');
  const s = 'Our partnerships include AstraZeneca, Pfizer and Novartis under license agreements.'; assert.equal(inKeywordList(s, s.indexOf('AstraZeneca')), true);
  const s2 = 'customers such as Amazon have placed orders.'; assert.equal(inList(s2, s2.indexOf('Amazon'), 6), true);
  const s3 = 'the Company entered into a supply agreement with Pfizer Inc.'; assert.equal(inList(s3, s3.indexOf('Pfizer'), 6), false);
});

test('PCT: P&G from forward-looking statements, $ from capital-and-surplus / liquidity text', () => {
  const t = 'PureCycle Technologies, Inc. entered into a Loan Agreement with the lenders. A Lender must be a commercial bank having capital and surplus of at least $500,000,000.\n' +
    'Cautionary Note Regarding Forward-Looking Statements\nThis release contains forward-looking statements, including the expected benefits of our patent license agreement with Procter & Gamble and our liquidity of $1.2 billion.';
  const r = auditFiling([doc('8-K', t)], ALL, CAP); assert.equal(r.accepted.length, 0); assert.ok(r.hits.find(h => h.alias === 'Procter & Gamble'));
  const s = 'We may be unable to realize the forward-looking benefits of the license agreement with Procter & Gamble.'; const r2 = auditFiling([doc('8-K', s)], [CO.pg], CAP); assert.equal(r2.accepted.length, 0, 'forward-looking sentence');
});

test('banks from credit-agreement boilerplate are never a deal', () => {
  const credit = 'CREDIT AGREEMENT dated as of June 1, 2023 among ACME CORP., as Borrower, the Lenders party hereto and BANK OF AMERICA, N.A., as Administrative Agent.\nThe Borrower has entered into this Agreement with Bank of America for $100 million.';
  assert.equal(isCreditDoc(toBlocks(credit), 'EX-10.1'), true); assert.equal(isCreditDoc(toBlocks(credit), '8-K'), false, 'only an EX-10 is a credit document');
  const r = auditFiling([doc('EX-10.1', credit)], ALL, CAP); assert.equal(r.accepted.length, 0); assert.ok(r.hits.every(h => h.family === 'CREDIT'));
  const s = 'On May 3, the Company entered into a credit agreement with Bank of America, N.A., as lender, for a $50 million revolving facility.'; assert.equal(auditFiling([doc('8-K', s)], [CO.bac], CAP).accepted.length, 0);
  const adv = 'Goldman Sachs acted as exclusive financial advisor to the Company in connection with the merger agreement.'; assert.equal(auditFiling([doc('EX-99.1', adv)], [CO.gs], CAP).accepted.length, 0);
});

test('real deals still pass: party patterns, amount classes, families', () => {
  const sup = 'On May 1, 2024, the Company entered into a Supply Agreement (the "Agreement") with Pfizer Inc. ("Pfizer"). Under the Agreement, Pfizer has committed to purchase a minimum of $50 million of product over three years.';
  const r = auditFiling([doc('8-K', sup)], [CO.pfe], 150e6); assert.ok(r.best); assert.equal(r.best.pattern, 'P1'); assert.equal(r.best.family, 'COMMERCIAL_CUSTOMER'); assert.equal(r.best.gate.usd, 50e6);
  assert.equal(r.best.gate.cls, 'COMMITTED_PURCHASE'); assert.ok(sizeOk(r.best.gate), '50M / 150M = 33%');
  const lic = 'The Company entered into an Exclusive License Agreement with Novartis AG. Novartis will pay the Company an upfront payment of $110 million and up to $700 million in milestone payments.';
  const r2 = auditFiling([doc('8-K', lic)], [CO.nvs], 400e6); assert.equal(r2.best.family, 'LICENSE'); const cls = Object.fromEntries(r2.best.amounts.map(a => [a.usd, a.cls]));
  assert.equal(cls[110e6], 'UPFRONT'); assert.equal(cls[700e6], 'CONTINGENT_MILESTONE'); assert.equal(r2.best.gate.usd, 700e6);
  const pre = 'THIS SUPPLY AGREEMENT is made by and between ACME Inc. and NVIDIA Corporation, a Delaware corporation.'; const r3 = auditFiling([doc('EX-10.1', pre)], [CO.nvda], 1e8); assert.equal(r3.best.pattern, 'P2');
  const eq = 'On July 1, the Company entered into a Securities Purchase Agreement with Amazon.com NV Investment Holdings LLC, under which the investor purchased shares for gross proceeds of $30 million.';
  const r4 = auditFiling([doc('8-K', eq)], [CO.amzn], 1e8); assert.equal(r4.best.family, 'EQUITY_INVESTMENT_BY_GIANT'); assert.equal(r4.best.gate.cls, 'FINANCING');
  const inc = 'Under the supply agreement the Company agreed to purchase GPUs from NVIDIA Corporation for $20 million.'; const r5 = auditFiling([doc('8-K', inc)], [CO.nvda], 1e8); assert.equal(r5.best.family, 'INCIDENTAL');
  const ord = 'The Company received a purchase order from Pfizer Inc. valued at $12 million.'; assert.equal(auditFiling([doc('8-K', ord)], [CO.pfe], 1e8).best.pattern, 'P4');
  const subj = 'Pfizer Inc. ("Pfizer") has agreed to purchase $25 million of the Company\'s product under the agreement.'; assert.equal(auditFiling([doc('8-K', subj)], [CO.pfe], 1e8).best.pattern, 'P3');
  const mention = 'The Company sells its products through retailers and its agreement terms are standard. Pfizer is a large company.'; assert.equal(auditFiling([doc('8-K', mention)], [CO.pfe], 1e8).accepted.length, 0, 'named but not a party');
  assert.equal(partyPattern('a license granted to Novartis AG', 'a license granted to '.length, 8), 'P5');
  assert.equal(familyOf('Agreement and Plan of Merger under which Pfizer will acquire all shares', 'merger agreement with Pfizer', 'merger agreement with '.length, 6), 'ACQUISITION');
});

test('amount helpers and gate', () => {
  assert.deepEqual(amountsIn('at $2.50 per share and $3 million').map(a => a.usd), [3e6]);
  assert.equal(gateAmount([{ usd: 5e6, cls: 'UNKNOWN' }, { usd: 2e6, cls: 'UPFRONT', raw: '$2 million' }], 8e6).usd, 2e6);
  assert.equal(sizeOk({ usd: 2e6, ratio: 0.25 }), true); assert.equal(sizeOk({ usd: 2e6, ratio: 0.1 }), false); assert.equal(sizeOk(null), false);
});

test('submission parsing keeps block breaks; decide() combines extractor, size gate and hand label', () => {
  const sub = '<SEC-HEADER>ACCEPTANCE-DATETIME:20240514160501\nCONFORMED SUBMISSION TYPE:\t8-K\n</SEC-HEADER><DOCUMENT>\n<TYPE>8-K\n<FILENAME>a.htm\n<TEXT><html><body><p>Item 1.01 Entry</p><p>The Company entered into a supply agreement with Pfizer Inc.</p><div>About Pfizer</div><p>Pfizer is big.</p></body></html></TEXT></DOCUMENT>';
  const p = submissionDocs(sub); assert.equal(p.accept, '20240514160501'); assert.equal(p.docs.length, 1); assert.ok(p.docs[0].text.split('\n').length >= 4);
  const best = { gate: { usd: 5e6, ratio: 0.5 }, family: 'LICENSE' };
  assert.equal(decide(null, null).keep, false); assert.equal(decide(best, null).keep, false); assert.equal(decide(best, { accept: false, family: 'LICENSE', note: 'x' }).keep, false);
  assert.equal(decide(best, { accept: true, family: 'ACQUISITION' }).keep, false); assert.equal(decide(best, { accept: true, family: 'LICENSE' }).keep, true);
  assert.equal(decide({ gate: { usd: 5e6, ratio: 0.1 }, family: 'LICENSE' }, { accept: true, family: 'LICENSE' }).keep, false, 'size gate');
});
