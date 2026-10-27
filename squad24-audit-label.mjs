// SQUAD 24 AUDIT HAND LABELS (27 Oct 2026; Stock-2 label audit). BLIND: this script reads ONLY data/squad24-audit-evidence.json (EDGAR text
// evidence; no prices, no returns, no trade results) and writes data/squad24-labels.json. Each label was set by reading the evidence
// sentence and passage of every case the fixed extractor accepted (70 of 272), before any corrected return was computed.
// accept = the giant really is a party to a NEW agreement described in this filing (false: an old agreement recapped in an earnings
// release, a mention, boilerplate, a covenant / financing amendment, or the money is not the giant's). family = squad24-audit-core FAMILIES;
// money flowing FROM the small company TO the giant (in-licensing from the giant, buying assets from the giant) is INCIDENTAL, as the
// pre-registered family definition says. Only COUNTED families (COMMERCIAL_CUSTOMER, LICENSE, EQUITY_INVESTMENT_BY_GIANT) enter the rule.
import fs from 'node:fs';
const H = {
  '0001193125-21-349528': ['INCIDENTAL', false, 'OACB: AbbVie only in a court ruling (litigation), no agreement'],
  '0001193125-21-354540': ['UNCLEAR', false, 'SVFC: SPAC deck table; $405MM is all committed PIPE capital, not Walmart\'s money; Walmart only a pro-forma holder'],
  '0001850079-21-000059': ['LICENSE', true, 'DNAY: research collaboration and license agreement with Pfizer (no amount in the passage)'],
  '0001564590-22-000016': ['INCIDENTAL', true, 'OVID: IN-license from AstraZeneca; Ovid pays AstraZeneca ($5M upfront, shares, milestones): money flows to the giant'],
  '0001831631-22-000025': ['CREDIT', false, 'LDI: intercreditor agreement among banks'],
  '0001193125-22-029612': ['COMMERCIAL_CUSTOMER', true, 'VLDR: Amazon warrant vesting on up to $200M of Amazon purchases from Velodyne'],
  '0001558370-22-001289': ['LICENSE', true, 'IMGN: license to Lilly (no amount in the passage)'],
  '0001831631-22-000105': ['CREDIT', false, 'LDI: master repurchase agreement amendment with Bank of America'],
  '0001213900-22-025411': ['CREDIT', false, 'GOED: security and pledge agreement with Bank of America'],
  '0001717547-22-000094': ['CREDIT', false, 'BRSP: repo facility covenant amendment; $2.105B is a net-worth covenant'],
  '0001193125-22-208709': ['ACQUISITION', true, 'CNSL: Verizon buys the company\'s wireless partnership interests for $490M (asset sale)'],
  '0000950170-22-016833': ['CREDIT', false, 'RLGT: intercreditor agreement'],
  '0001193125-22-238460': ['COMMERCIAL_CUSTOMER', true, 'ADT: Google commits $150M more success funds under the commercial agreement (2% of value)'],
  '0001831631-22-000290': ['CREDIT', false, 'LDI: loan purchase / repurchase amendments with Bank of America'],
  '0001193125-22-275898': ['INCIDENTAL', true, 'FLME: the company BUYS assets from Exxon'],
  '0001558370-22-017297': ['LICENSE', false, 'MGTX: earnings release recapping a 2019 Janssen upfront payment; no new agreement'],
  '0001213900-22-072157': ['CREDIT', false, 'ALTO: loan amendment with Wells Fargo'],
  '0001193125-23-036128': ['LICENSE', false, 'FUSN: results release mention of the existing AstraZeneca collaboration'],
  '0000944809-23-000015': ['LICENSE', true, 'OPK: ModeX licenses an EBV vaccine to Merck: $50M upfront, up to $872.5M milestones'],
  '0001104659-23-076136': ['INCIDENTAL', false, 'IMNM: "Pfizer agreed to purchase Seagen" market commentary'],
  '0001193125-23-183312': ['INCIDENTAL', true, 'BHC: Bausch + Lomb BUYS Xiidra from Novartis'],
  '0001805284-23-000076': ['CREDIT', false, 'RKT: master repurchase agreement amendment'],
  '0001104659-23-109426': ['EQUITY_INVESTMENT_BY_GIANT', true, 'MUX: Rio Tinto\'s Nuton invests $10M in McEwen Copper (2.5% of value)'],
  '0001001082-23-000037': ['UNCLEAR', false, 'DISH: recap of an earlier T-Mobile spectrum purchase agreement'],
  '0001601830-23-000068': ['INCIDENTAL', false, 'RXRX: investor-deck mention of NVIDIA compute'],
  '0001599901-23-000096': ['LICENSE', true, 'RNA: research collaboration and license agreement with BMS (no amount in the passage)'],
  '0001104659-24-000084': ['LICENSE', true, 'VYGR: Novartis collaboration, $80M initial upfront payment'],
  '0000950170-24-002441': ['CREDIT', false, 'CMBM: credit amendment moving deposit services to Bank of America'],
  '0001860782-24-000007': ['LICENSE', false, 'TSVT: strategy headline about the existing BMS Abecma partnership'],
  '0001558370-24-004612': ['CREDIT', false, 'TSE: receivables facility definitions (bank mandate)'],
  '0000950170-24-058187': ['LICENSE', true, 'FULC: Sanofi license, $80M upfront, up to $975M milestones'],
  '0000844965-24-000053': ['CREDIT', false, 'TTI: agency resignation under a credit agreement'],
  '0001860782-24-000089': ['ACQUISITION', true, 'TSVT: Novo Nordisk buys a program (asset purchase, $38M upfront)'],
  '0001558370-24-009853': ['CREDIT', false, 'ACRS: royalty sale to OMERS; Lilly is not a party'],
  '0001437749-24-022919': ['CREDIT', false, 'OPK: notes paid from Pfizer profit-share payments'],
  '0000950170-24-087099': ['UNCLEAR', true, 'MRIN: commercial terms with Google (no amount in the passage)'],
  '0001193125-24-191500': ['INCIDENTAL', true, 'VIR: IN-license from Sanofi; Vir pays Sanofi $100M upfront and milestones: money flows to the giant'],
  '0001193125-24-196505': ['INCIDENTAL', false, 'RXRX: merger deck listing Exscientia partners'],
  '0001717547-24-000080': ['CREDIT', false, 'BRSP: repo facility amendment'],
  '0001104659-24-097152': ['LICENSE', true, 'VYGR: amendment to the Novartis option and license agreement (no amount in the passage)'],
  '0001650664-24-000111': ['CREDIT', false, 'EDIT: sale of Vertex license fees to DRI Healthcare (royalty monetisation); Vertex not a new party'],
  '0000950170-24-117567': ['LICENSE', true, 'GLUE: Novartis license, $150M upfront, up to $2.1B milestones'],
  '0001213900-24-099333': ['LICENSE', true, 'ALDX: extension side letter to the AbbVie option agreement (no amount in the passage)'],
  '0000950103-25-001008': ['COMMERCIAL_CUSTOMER', true, 'PACK: Amazon warrant tied to Amazon purchases (no amount in the passage)'],
  '0001794783-25-000008': ['CREDIT', false, 'SLQT: senior preferred stock bought by a Morgan Stanley investment vehicle: structured financing from a bank'],
  '0000950170-25-022260': ['CREDIT', false, 'RAIL: pledge agreement, Bank of America as agent'],
  '0001558370-25-002859': ['ACQUISITION', false, 'MGTX: earnings release recapping the 2023 asset sale to Janssen'],
  '0001104659-25-039782': ['UNCLEAR', false, 'PLUG: reference to the 2022 Amazon transaction agreement and an earn-out settlement'],
  '0001193125-25-151274': ['CREDIT', false, 'ARRY: convertible notes, Goldman Sachs as initial purchaser'],
  '0000950170-25-098866': ['CREDIT', false, 'ADT: credit agreement definitions (engagement letter banks)'],
  '0001193125-25-174947': ['LICENSE', true, 'RGNX: AbbVie amendment: the $200M milestone restructured into two $100M payments'],
  '0001104659-25-078084': ['EQUITY_INVESTMENT_BY_GIANT', true, 'WULF: Google backstop and warrants (no amount in the passage)'],
  '0001193125-25-202760': ['LICENSE', true, 'GLUE: Novartis license, $120M upfront, up to $5.4B milestones'],
  '0001104659-25-100317': ['LICENSE', false, 'LVTX: merger document referring to existing Pfizer collaborations'],
  '0001193125-25-249438': ['ACQUISITION', true, 'ADVM: Lilly acquires Adverum (merger agreement)'],
  '0001703056-25-000162': ['CREDIT', false, 'ADT: credit agreement definitions'],
  '0001193125-25-263543': ['CREDIT', false, 'TSHA: at-the-market sales agreement amendment, Goldman as agent'],
  '0001104659-25-108804': ['LICENSE', true, 'MGTX: collaboration and license agreement with Lilly (no amount in the passage)'],
  '0001193125-25-277556': ['LICENSE', true, 'KRRO: amendment of the Novo Nordisk collaboration (no amount in the passage)'],
  '0001193125-25-323692': ['INCIDENTAL', false, 'ATHA: Lilly\'s FDA application named in warrant terms'],
  '0001717547-25-000088': ['CREDIT', false, 'BRSP: repo facility covenant text'],
  '0001104659-26-004785': ['LICENSE', true, 'NVAX: license and option agreement with Pfizer (no amount in the passage)'],
  '0001104659-26-034904': ['LICENSE', false, 'MGTX: results release recapping the Lilly deal'],
  '0001140361-26-018699': ['ACQUISITION', false, 'GBTG: shareholders (incl. BlackRock) sign voting agreements for a takeover; BlackRock is a holder, not a counterparty'],
  '0001628280-26-033874': ['INCIDENTAL', false, 'ARVN: Arvinas and Pfizer out-license to Rigel; the payer is Rigel, Pfizer is a co-seller'],
  '0001493152-26-025091': ['INCIDENTAL', false, 'POLA: sales to AT&T named in a loan document'],
  '0001213900-26-075227': ['INCIDENTAL', false, 'ONDS: deck mention of a Palantir platform partnership'],
  '0001628280-26-054383': ['EQUITY_INVESTMENT_BY_GIANT', true, 'SVCO: $10M convertible note bought by Micron, a customer (4% of value)'],
  '0001193125-26-369683': ['INCIDENTAL', false, 'VNCE: license-agreement boilerplate'],
  '0001193125-26-424297': ['CREDIT', false, 'CIFR: underwriting / purchase agreement form, Morgan Stanley as underwriter'] };
const EV = JSON.parse(fs.readFileSync('data/squad24-audit-evidence.json', 'utf8')), labels = {}, miss = [];
for (const c of EV.cases) { if (!c.extractor) continue; const x = c.extractor, h = H[c.adsh];
  if (x.accepted && !h) miss.push(c.adsh + ' ' + c.sym);
  labels[c.adsh] = { sym: c.sym, extractorAccepted: !!x.accepted, extractorFamily: x.family, counterparty: x.counterparty, cpCik: x.cpCik, gate: x.gate ? { usd: x.gate.usd, cls: x.gate.cls, raw: x.gate.raw } : null,
    oldCounterparty: c.old.counterparty, hand: h ? { family: h[0], accept: h[1], note: h[2] } : null }; }
if (miss.length) { console.log('UNLABELLED extractor-accepted cases: ' + miss.join(', ')); process.exit(1); }
const out = { generatedAt: '2026-10-27', method: 'blind hand review of the evidence file only (squad24-audit-label.mjs); no prices or returns read', evidenceGeneratedAt: EV.generatedAt, labels };
fs.writeFileSync('data/squad24-labels.json', JSON.stringify(out, null, 1) + '\n');
const n = Object.values(labels), acc = n.filter(l => l.hand);
console.log('labels: ' + n.length + ' events, ' + acc.length + ' hand-reviewed; families ' + JSON.stringify(acc.reduce((a, l) => (a[l.hand.family] = (a[l.hand.family] || 0) + 1, a), {})));
