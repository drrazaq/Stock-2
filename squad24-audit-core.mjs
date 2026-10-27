// SQUAD 24 AUDIT CORE (27 Oct 2026; Stock-2 label audit): the FIXED counterparty / amount / family extractor for SQ24-MEGADEAL.
// Pure functions, no network, no files. Used by squad24-audit-extract.mjs (evidence, no prices), squad24-audit-label.mjs (hand labels,
// no returns), squad24-lab.mjs MODE=AUDIT (the ONE corrected re-run) and the forward paper lane. Never places an order.
//
// ================= PRE-REGISTERED 27 Oct 2026, WRITTEN BEFORE ANY CORRECTED RETURN WAS COMPUTED OR LOOKED AT =========================
// WHY (an outside reviewer found, the lead confirmed): squad24-core counterpartyMatch took an alias ANYWHERE in the filing and largestUsd
// took the LARGEST dollar amount ANYWHERE in the filing. Confirmed false cases: ATRS 2022-04-13 "Apple" = CEO Robert F. Apple (the deal was
// Halozyme buying Antares); RGNX 2025-01-14 "AMD" = wet AMD, the eye disease (partner Nippon Shinyaku); GRVI 2022-04-20 Amazon with
// 26.54 TRILLION USD (a "$26,540,000 million" unit error, 7,290,256x the company); FBIO AstraZeneca from an "About Fortress ... partnerships
// include" paragraph with the $ from "About Oaktree ... $192 billion AUM"; PCT P&G from forward-looking statements with the $ from
// capital-and-surplus / liquidity text; 146 of 264 trades were banks from credit-agreement boilerplate.
// NOTHING ELSE CHANGES: the event set, the price / dilution / split filters, the entry, exit, costs, yardsticks and every bar are the
// frozen SQ24-MEGADEAL ones (squad24-core.mjs). The fix can only REMOVE events or re-measure their size (a subset of the 272 frozen events:
// the old matcher is a superset of the new one, the old largest amount >= any passage amount).
//
// (a) ENTITY RESOLUTION (rule based; each case has a regression test in test/squad24-audit-core.test.mjs). An alias hit (the old whole-word,
//     case-sensitive, name-must-end test squad24-core nameEnds is kept) counts only if ALL hold:
//   A1 NOT A PERSON: not preceded by a title (Mr / Mrs / Ms / Dr / Prof / Hon) or a single-letter initial ("Robert F. Apple", "R. Apple");
//      and for a SURNAME-LIKE alias (SURNAME list below) not preceded by a capitalised first-name word (+ optional initial) unless that word
//      plus the alias is part of the company's own name ("Eli Lilly", "Walt Disney", "Charles Schwab") or is a title-case verb / connector
//      (TITLE_WORDS list).
//   A2 AMBIGUOUS ALIASES need the FULL legal name somewhere in the same filing (AMBIG map below): AMD (Advanced Micro Devices), IBM, KLA,
//      BHP, TJX, GSK, HSBC, SAP, BP, ASML, Arm, Visa, Merck, Eaton, Abbott, Corning, Janssen, Anthem, Apple, Chubb, Linde, Deere, Schwab,
//      Stryker, Danaher, Dell, Disney, Gilead, Micron, Oracle, Arista, Marvell, Uber, Tesla, Amazon, Google, Shell, Booking, Target, Intel,
//      Optum, Temu, Snap, Sea, Progressive, Seagate, Equinor, Diageo, Unilever, Boeing.
//   A3 NOT BOILERPLATE: the hit is not inside (i) an "About <Name>" section (a block starting "About " + capitalised word, to the next
//      heading block: Item n / About / Forward-looking / Contact / Signature / Exhibit / Source / ###), (ii) a forward-looking / safe-harbor /
//      cautionary / risk-factor section or sentence, (iii) a list ("include(s) / including / such as / among others / partners like" before
//      the alias with a comma between, or the alias inside an "A, B and C" list of 3+ capitalised names), (iv) a credit / financing /
//      adviser sentence (old FIN_RE + capital and surplus, lender, administrative / collateral agent, issuing bank, swingline, arranger,
//      bookrunner, indenture, trustee, underwriter, placement / sales agent, dealer manager, financial / legal adviser or advisor or counsel,
//      fairness opinion, depositary, custodian, transfer / escrow agent, letter of credit, deposit account, notes due), (v) a document whose
//      title zone (first 1,500 characters) names a credit agreement, loan (and security) agreement, indenture, note purchase, underwriting,
//      equity distribution, at-the-market / sales agreement, placement agency, guarantee / pledge / security agreement.
//   A4 NAMED AS A PARTY in the sentence describing THE agreement (sentence = within one text block). One of:
//      P1 "with" (+ up to 4 lower-case words, e.g. "with its partner", "with a subsidiary of") right before the alias, and the sentence
//         before it holds entered into / enter into / signed / executed / amended / agreement / contract / order / arrangement / partnership /
//         collaboration / alliance / deal;
//      P2 "between" / "among" (+ up to 3 lower-case words) right before the alias, or "between" / "among" earlier in the sentence and
//         "and" / "," (+ up to 3 lower-case words) right before the alias;
//      P3 the alias as SUBJECT: within 80 characters after it (no full stop / semicolon) agreed / agrees / has agreed / will purchase / buy /
//         acquire / invest / pay / license / fund / order / deploy / use / purchased / ordered / awarded / selected / invested / committed /
//         exercised / issued a (purchase) order / placed / signed / entered into / executed / granted / licensed / paid / will make;
//      P4 "from" (+ up to 2 lower-case words) right before the alias with order / award / contract / payment / investment / funding / grant /
//         purchase / license / supply in the sentence before it;
//      P5 "to" (+ up to 2 lower-case words) right before the alias with sell / supply / deliver / issue / license / provide / grant / ship
//         earlier in the sentence;
//      P6 "for" (+ up to 2 lower-case words) right before the alias with manufactur / develop / produce / supply / provide / build / design
//         earlier in the sentence.
// (b) THE AMOUNT comes ONLY from the AGREEMENT PASSAGE: the party sentence plus the next 3 sentences of the same block (max 1,500
//     characters). Every dollar amount there (old parsing: $ / US$, thousand / million / billion / trillion units, 100k USD+, "per ..." left
//     out) is classified by the nearest keyword (50 characters before, 40 after): UPFRONT (upfront / up-front / initial payment / signing /
//     non-refundable / one-time payment), CONTINGENT_MILESTONE (milestone / contingent / earn-out / royalt / upon achievement / potential /
//     eligible to receive / could receive), ACQUISITION_CONSIDERATION (merger consideration / purchase price / aggregate consideration /
//     enterprise value / equity value / tender offer / acquisition / acquire), FINANCING (loan / credit / facility / notes / financing /
//     private placement / gross proceeds / invest / warrant / shares / preferred / convertible / subscription), CEILING (up to / maximum /
//     not to exceed / cap / ceiling), COMMITTED_PURCHASE (purchase order / minimum purchase / commit / take-or-pay / firm order / order /
//     contract value / total value / valued at / worth / purchase commitment / minimum annual / guaranteed / contract / award), else UNKNOWN.
//     Any amount over 1 trillion USD, or over 50x the company's market value, becomes UNKNOWN. UNKNOWN is excluded from the >= 20% gate.
//     The size gate (unchanged bar: >= 20% of the market value at the close of f) uses the LARGEST non-UNKNOWN passage amount.
// (c) EVENT FAMILY of the accepted party hit (extractor proposal, keyword order on the passage): CREDIT (financing words with the giant as
//     lender / agent), ACQUISITION (merger / acquire all / tender offer / plan of merger / asset purchase), LICENSE (licen[sc]e /
//     collaboration / co-develop / royalt / option to license), COMMERCIAL_CUSTOMER (supply / purchase order / master services / statement
//     of work / services agreement / offtake / order / distribution / customer / commercial / hosting / deployment / procurement / award /
//     development agreement), EQUITY_INVESTMENT_BY_GIANT (securities / stock purchase / subscription / investment agreement / private
//     placement / warrant / equity investment / invest), INCIDENTAL (the small company BUYS from the giant: purchase / buy / lease / procure
//     ... from <giant> without order / award / contract-from wording; or the giant only as a platform / channel), else UNCLEAR.
// (d) BLIND HAND REVIEW: every case the fixed extractor still accepts is read (evidence sentence + passage; EDGAR text if needed, SEC_UA,
//     cached) and LABELLED in data/squad24-labels.json BEFORE any corrected return is computed, by squad24-audit-label.mjs, which reads only
//     data/squad24-audit-evidence.json (no prices, no trade results). The hand label can only DROP a case or set its family.
//     LABELS_SHA below (SHA-256 of data/squad24-labels.json) is written before the corrected run; the lab refuses any other file.
// THE ONE CORRECTED RUN (squad24-lab.mjs MODE=AUDIT, written to data/squad24-lab.json correctedRun, firstRun never touched): the frozen
//   event set, kept only if extractor-accepted AND hand-accepted AND hand family in COUNTED (COMMERCIAL_CUSTOMER, LICENSE,
//   EQUITY_INVESTMENT_BY_GIANT) AND the new size gate passes; same window as the frozen run; same bars (judgeHold, 2% slippage gate, per year
//   vs SPY). Each family reported separately as INFORMATION with n. Run once; never re-run on the result; the bar is never lowered.
import { nameEnds } from './squad24-core.mjs';

export const COUNTED = ['COMMERCIAL_CUSTOMER', 'LICENSE', 'EQUITY_INVESTMENT_BY_GIANT'];
export const FAMILIES = ['COMMERCIAL_CUSTOMER', 'LICENSE', 'EQUITY_INVESTMENT_BY_GIANT', 'ACQUISITION', 'CREDIT', 'INCIDENTAL', 'UNCLEAR'];
export const AMOUNT_CLASSES = ['UPFRONT', 'COMMITTED_PURCHASE', 'CONTINGENT_MILESTONE', 'CEILING', 'FINANCING', 'ACQUISITION_CONSIDERATION', 'UNKNOWN'];
export const MAX_USD = 1e12, MAX_RATIO = 50, SIZE_MIN = 0.20;
// SHA-256 of data/squad24-labels.json (hand labels, written after the evidence run and BEFORE the corrected run); null = not labelled yet
export const LABELS_SHA = '233225c59227b350592df2c58fa749ca8dbadc368ee3f613fd50a33f4f71a43d';

// ---------------- A2: ambiguous aliases -> the full name that must appear in the same filing ----------------
export const AMBIG = {
  AMD: /Advanced Micro Devices/i, IBM: /International Business Machines/i, KLA: /KLA[- ]Tencor|KLA Corp/i, BHP: /BHP Group|BHP Billiton/i, TJX: /TJX Companies/i,
  GSK: /GlaxoSmithKline|GSK plc|GSK Intellectual|GlaxoSmithKline/i, HSBC: /HSBC (?:Bank|Holdings|Securities|USA)/i, 'SAP SE': /SAP SE/, 'SAP America': /SAP America/, 'BP p.l.c.': /BP p\.l\.c\./, 'BP plc': /BP plc/i,
  ASML: /ASML (?:Holding|Netherlands|US)/i, 'Arm Holdings': /Arm Holdings/i, 'Arm Limited': /Arm Limited/i, Visa: /Visa Inc|Visa U\.S\.A|Visa International/i, 'Visa U.S.A.': /Visa U\.S\.A/i,
  Merck: /Merck & Co|Merck Sharp & Dohme|Merck Sharp and Dohme/i, Eaton: /Eaton Corporation/i, Abbott: /Abbott Laboratories/i, Corning: /Corning Incorporated/i,
  Janssen: /Janssen (?:Pharmaceutica|Biotech|Research|Sciences|Pharmaceuticals|Global)|Johnson & Johnson/i, Anthem: /Anthem,? Inc|Elevance Health|Anthem Blue Cross/i, Apple: /Apple Inc/i,
  Chubb: /Chubb Limited|Chubb INA|Chubb Group/i, Linde: /Linde plc|Linde AG|Linde Inc|Linde Gas/i, Deere: /Deere & Company|John Deere/i, Schwab: /Charles Schwab (?:Corporation|& Co)|Schwab Corporation/i,
  'Charles Schwab': /Charles Schwab (?:Corporation|& Co)/i, Stryker: /Stryker Corporation/i, Danaher: /Danaher Corporation/i, Dell: /Dell Technologies|Dell Inc|Dell Products|Dell Marketing/i,
  Disney: /Walt Disney Co|Disney Enterprises|Disney Media|Disney Platform/i, 'Walt Disney': /Walt Disney Co|Walt Disney Pictures|Disney Enterprises/i, Gilead: /Gilead Sciences/i, Micron: /Micron Technology/i,
  Oracle: /Oracle Corporation|Oracle America|Oracle International/i, Arista: /Arista Networks/i, Marvell: /Marvell Technology|Marvell Semiconductor|Marvell International/i,
  Uber: /Uber Technologies/i, Tesla: /Tesla,? Inc|Tesla Motors/i, Amazon: /Amazon\.com|Amazon Technologies|Amazon Logistics|Amazon EU|Amazon Data Services|Amazon Services/i,
  Google: /Google LLC|Google Inc|Alphabet Inc|Google Ireland|Google Cloud/i, 'Shell plc': /Shell plc/i, 'Booking Holdings': /Booking Holdings/i, Intel: /Intel Corporation|Intel Corp/i,
  Optum: /Optum,? Inc|Optum Health|OptumRx|UnitedHealth/i, Temu: /PDD Holdings|Whaleco/i, 'Snap Inc.': /Snap Inc\./, 'Sea Limited': /Sea Limited/, 'Progressive Corporation': /Progressive Corporation/,
  Seagate: /Seagate Technology/i, Equinor: /Equinor ASA|Equinor Energy|Equinor US/i, Diageo: /Diageo plc|Diageo North America/i, Unilever: /Unilever (?:plc|N\.V\.|United States)/i, Boeing: /Boeing Company|The Boeing/i,
  'Target Corporation': /Target Corporation/ };
// A1: aliases that are also common surnames / first-name pairs
export const SURNAME = new Set(['Apple', 'Abbott', 'Chubb', 'Deere', 'Dell', 'Eaton', 'Janssen', 'Stryker', 'Danaher', 'Schwab', 'Merck', 'Tesla', 'Disney', 'Corning', 'Pfizer', 'Linde', 'Boeing',
  'Honeywell', 'Gilead', 'Oracle', 'Intel', 'Marvell', 'Lilly', 'Morgan', 'Nike', 'Target', 'Shell', 'Arm', 'Uber', 'Amgen', 'Visa', 'Micron', 'Sanofi', 'Novartis', 'Moderna', 'Regeneron', 'Medtronic', 'Toyota', 'Starbucks', 'Costco', 'Walmart', 'Chevron', 'Caterpillar']);
const TITLE_WORDS = new Set(['The', 'And', 'With', 'From', 'To', 'By', 'Between', 'For', 'Of', 'In', 'On', 'At', 'Under', 'Pursuant', 'Customer', 'Partner', 'Supplier', 'Licensee', 'Licensor', 'Agreement', 'Inc',
  'Corp', 'Item', 'Announces', 'Signs', 'Enters', 'Expands', 'Extends', 'Receives', 'Completes', 'Selects', 'Partners', 'Joins', 'Wins', 'Secures', 'Collaboration', 'Collaborates', 'Agreement', 'Contract',
  'Deal', 'Purchase', 'Supply', 'License', 'Licenses', 'Signed', 'Awarded', 'Selected', 'Our', 'Its', 'Their', 'This', 'That', 'Such', 'Each', 'Any', 'All', 'Both', 'Neither', 'Either', 'If', 'When', 'As',
  'Upon', 'Including', 'Exhibit', 'Section', 'Schedule', 'Annex', 'Amendment', 'Company', 'Parties', 'Party', 'Buyer', 'Seller', 'Investor', 'Purchaser', 'Holder', 'Lender', 'Borrower', 'Agent', 'Mr', 'Ms',
  'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'US', 'U', 'S', 'New', 'North', 'South', 'Global', 'Strategic']);

// ---------------- text with block breaks ----------------
const ENT = (s) => s.replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&#8217;|&rsquo;|&#x2019;/gi, '\'').replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&#x201[cd];/gi, '"').replace(/&#821[12];|&ndash;|&mdash;/gi, '-')
  .replace(/&#36;|&#x24;/gi, '$').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// HTML or plain text -> text whose '\n' separates blocks (paragraphs / table rows / headings); spaces collapsed inside a block
export function toBlocks(raw) { let s = String(raw || ''); const tags = (s.match(/<[a-zA-Z\/][^>]*>/g) || []).length;
  if (tags >= 5) { s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<\s*(?:br|\/?p|\/?div|\/?tr|\/?li|\/?h[1-6]|\/?table|\/?ul|\/?ol|\/?center|\/?title)\b[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' '); s = ENT(s); }
  else { const out = []; let cur = '';   // plain text: blank lines and short heading-like lines (< 70 chars, no end punctuation) end a block
    for (const line of ENT(s.replace(/\r/g, '')).split('\n')) { const l = line.trim(); if (!l) { if (cur) out.push(cur); cur = ''; continue; }
      if (l.length < 70 && !/[.,;:]$/.test(l)) { if (cur) out.push(cur); out.push(l); cur = ''; continue; } cur = cur ? cur + ' ' + l : l; }
    if (cur) out.push(cur); s = out.join('\n'); }
  return s.replace(/[ \t\f\v\r ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim(); }
// the EDGAR full submission text -> { accept, form, docs: [{ type, file, text }] } with block text (8-K / 6-K main, EX-99.x, EX-10.x)
export function submissionDocs(txt) { const s = String(txt || ''), hdrEnd = s.search(/<DOCUMENT>/i), hdr = hdrEnd > 0 ? s.slice(0, hdrEnd) : s.slice(0, 20000);
  const acc = /<ACCEPTANCE-DATETIME>\s*(\d{14})/i.exec(hdr) || /ACCEPTANCE-DATETIME:\s*(\d{14})/i.exec(hdr), form = /CONFORMED SUBMISSION TYPE:\s*([^\n]+)/i.exec(hdr);
  const docs = []; const re = /<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi; let m;
  while ((m = re.exec(s)) !== null) { const body = m[1], type = ((/<TYPE>([^\n<]+)/i.exec(body) || [])[1] || '').trim().toUpperCase(), file = ((/<FILENAME>([^\n<]+)/i.exec(body) || [])[1] || '').trim();
    if (!(type === '8-K' || type === '6-K' || /^EX-99/.test(type) || /^EX-10/.test(type))) continue; if (/\.(pdf|jpg|jpeg|png|gif|xlsx?|zip)$/i.test(file)) continue;
    const t = /<TEXT>([\s\S]*?)(?:<\/TEXT>|$)/i.exec(body); docs.push({ type, file, text: toBlocks((t ? t[1] : body).slice(0, 3e6)) }); }
  return { accept: acc ? acc[1] : null, form: form ? form[1].trim() : null, docs }; }

// ---------------- sentences inside one block ----------------
const ABBR = /(?:^|[\s(])(?:Inc|Corp|Co|Ltd|L\.P|LP|LLC|N\.A|S\.A|N\.V|B\.V|U\.S|U\.K|Jr|Sr|Mr|Ms|Mrs|Dr|No|St|Nos|approx|e\.g|i\.e|vs|[A-Z])\.$/;
export function blockAt(t, at) { const a = t.lastIndexOf('\n', at - 1) + 1, e = t.indexOf('\n', at), b = e < 0 ? t.length : e; return { a, b }; }
export function sentencesOf(block) { const out = []; let st = 0; for (let i = 0; i < block.length; i++) { const c = block[i];
    if (/[.;!?]/.test(c) && /\s/.test(block[i + 1] || '') && /[A-Z0-9"“(]/.test(block[i + 2] || '') && !(c === '.' && ABBR.test(block.slice(Math.max(0, i - 8), i + 1)))) { out.push([st, i + 1]); st = i + 2; } }
  if (st < block.length) out.push([st, block.length]); return out.filter(([a, b]) => b > a); }
// -> { s (sentence text), pos (alias offset inside s), passage (s + next 3 sentences of the block, <= 1500 chars), blockStart }
export function sentenceInfo(t, at, len) { const { a, b } = blockAt(t, at), blk = t.slice(a, b), rel = at - a, ss = sentencesOf(blk); let j = ss.findIndex(([x, y]) => rel >= x && rel < y); if (j < 0) j = ss.length - 1;
  let [x, y] = ss[j]; if (y - x > 1500) { x = Math.max(x, rel - 700); y = Math.min(y, rel + len + 700); }
  const s = blk.slice(x, y), pe = ss[Math.min(ss.length - 1, j + 3)][1]; const passage = blk.slice(x, Math.min(pe, x + 1500));
  return { s, pos: rel - x, passage, blockStart: a }; }

// ---------------- A3: boilerplate sections and documents ----------------
const HEAD_BOIL = /^(?:About\s+(?:[A-Z][\w&.,'’-]*)|ABOUT\s+[A-Z]|Forward[- ]Looking|FORWARD[- ]LOOKING|Cautionary|CAUTIONARY|Safe Harbor|SAFE HARBOR|Special Note Regarding|SPECIAL NOTE REGARDING|Note Regarding Forward|NOTE REGARDING FORWARD|Risk Factors|RISK FACTORS)/;
const HEAD_ANY = /^(?:Item\s+\d|ITEM\s+\d|About\s+[A-Z]|ABOUT\s+[A-Z]|Forward[- ]Looking|FORWARD[- ]LOOKING|Cautionary|CAUTIONARY|Safe Harbor|SAFE HARBOR|Contacts?\b|CONTACTS?\b|Investor (?:Relations|Contact)|Media (?:Relations|Contact)|SIGNATURES?\b|Signatures?\b|Exhibit\s+\d|EXHIBIT\s+\d|Source:|###)/;
// -> [[start, end)] boilerplate ranges of a block text
export function boilerplateRanges(t) { const out = []; let open = null, i = 0;
  for (const line of t.split('\n')) { const st = i; i += line.length + 1; const head = HEAD_ANY.test(line);
    if (head) { if (open !== null) { out.push([open, st]); open = null; } if (HEAD_BOIL.test(line)) open = st; } }
  if (open !== null) out.push([open, t.length]); return out; }
export const FLS_RE = /forward[- ]looking|safe harbor|Private Securities Litigation Reform Act|cautionary statement|risk factors|could differ materially|undue reliance/i;
export const FIN2_RE = /credit agreement|credit facility|loan agreement|loan and security|term loan|revolving|indenture|underwrit|sales agent|equity distribution|at[- ]the[- ]market|administrative agent|collateral agent|\blenders?\b|capital and surplus|issuing bank|swingline|swing line|arranger|bookrunner|\btrustee\b|placement agent|dealer[- ]manager|financial advis[eo]r|legal (?:advis[eo]r|counsel)|fairness opinion|acted as (?:exclusive )?(?:financial|legal|placement|sole|lead)|depositary|custodian|transfer agent|escrow agent|letter of credit|deposit account|notes due/i;
export const CREDIT_DOC_RE = /\b(?:CREDIT AGREEMENT|Credit Agreement|LOAN AGREEMENT|Loan Agreement|LOAN AND SECURITY AGREEMENT|Loan and Security Agreement|INDENTURE|Indenture|NOTE PURCHASE AGREEMENT|Note Purchase Agreement|UNDERWRITING AGREEMENT|Underwriting Agreement|EQUITY DISTRIBUTION AGREEMENT|Equity Distribution Agreement|AT[- ]THE[- ]MARKET|At[- ]the[- ]Market|AT MARKET ISSUANCE|At Market Issuance|PLACEMENT AGENCY AGREEMENT|Placement Agency Agreement|GUARANTEE AND COLLATERAL|Guarantee and Collateral|PLEDGE AND SECURITY|Pledge and Security|SECURITY AGREEMENT|Security Agreement|FORBEARANCE|Forbearance Agreement)\b/;
export const isCreditDoc = (text, type = 'EX-10') => /^EX-10/.test(String(type || '')) && CREDIT_DOC_RE.test(String(text || '').slice(0, 1500));
const LIST_KW = /\b(?:include|includes|included|including|such as|among others|among them|partners like|customers like|clients like)\b/g;
const CAPN = "[A-Z][\\w&.'’-]*(?:\\s+[A-Z][\\w&.'’-]*){0,3}";
// A3 (iii) keyword list: "include(s) / including / such as ..." before the alias, with no agreement wording between the keyword and the alias
export function inKeywordList(s, pos) { const pre = s.slice(0, pos); let k = -1, m; LIST_KW.lastIndex = 0; while ((m = LIST_KW.exec(pre))) k = m.index + m[0].length;
  if (k < 0) return false; const mid = pre.slice(k); return !/\bwith\b|agreement|contract|\border\b|between|among/i.test(mid); }
// A3 (iii) name list: the alias inside "A, B and C" (3+ capitalised names)
export function inNameList(s, pos, len) { const pre = s.slice(0, pos), post = s.slice(pos + len).replace(/^(?:,?\s*(?:Inc\.?|Corp\.?|LLC|plc|AG|SE|Ltd\.?|Limited|N\.V\.|S\.A\.))+/, '');
  const prevItem = new RegExp(CAPN + ',\\s*(?:and\\s+|or\\s+)?$').test(pre), prev2 = new RegExp(CAPN + ',\\s*' + CAPN + ',\\s*(?:and\\s+|or\\s+)?$').test(pre);
  const nextItem = new RegExp('^\\s*(?:,\\s*(?:and\\s+|or\\s+)?|\\s+(?:and|or)\\s+)' + CAPN).test(post), next2 = new RegExp('^\\s*,\\s*' + CAPN + '\\s*,?\\s*(?:and|or)\\s+[A-Z]').test(post);
  return (prevItem && nextItem) || prev2 || next2; }
export const inList = (s, pos, len) => inKeywordList(s, pos) || inNameList(s, pos, len);

// ---------------- A1: person ----------------
// t = text, at = alias offset; alias string; company = { name, aliases }
export function isPerson(t, at, alias, company) { const pre = t.slice(Math.max(0, at - 60), at);
  if (/\b(?:Mr|Mrs|Ms|Dr|Prof|Hon)\.?\s+(?:[A-Z][a-z]+\s+)?(?:[A-Z]\.\s*)?$/.test(pre)) return true;
  if (/(?:^|[\s,(“"])[A-Z]\.\s*$/.test(pre) && !/\b(?:U\.S|U\.K|N\.A|S\.A|N\.V|B\.V|L\.P|L\.L\.C|Inc|Co|Corp|No)\.\s*$/.test(pre)) return true;
  if (!SURNAME.has(alias)) return false;
  const m = /([A-Z][a-z]{1,15})\s+(?:[A-Z]\.\s+)?$/.exec(pre); if (!m) return false; const w = m[1], wAt = m.index;
  if (wAt > 0 && /[A-Za-z0-9&'’-]/.test(pre[wAt - 1])) return false;
  if (TITLE_WORDS.has(w)) return false; const own = [company && company.name, ...((company && company.aliases) || [])].filter(Boolean).join(' | ');
  if (new RegExp('\\b' + w + '\\s+(?:[A-Z]\\.\\s+)?' + alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(own)) return false;
  const lead = pre.slice(0, wAt).replace(/\s+$/, ''); if (/[.!?:;]$/.test(lead) || /\n$/.test(pre.slice(0, wAt))) return false;   // a sentence / block start capital, not a first name
  return true; }

// ---------------- A4: named as a party in the agreement sentence ----------------
const AGR_RE = /entered into|enter into|signed|executed|amend|agreement|contract|\border|arrangement|partnership|collaboration|alliance|\bdeal\b|memorandum|letter of intent|term sheet|statement of work/i;
const SUBJ_VERB = /^[^.;]{0,80}?\b(?:agreed|agrees|has agreed|have agreed|will (?:purchase|buy|acquire|invest|pay|license|fund|order|deploy|use|make)|purchased|ordered|awarded|selected|invested|committed|exercised|issued (?:a|an) (?:purchase )?order|placed|signed|entered into|executed|granted|licensed|paid)\b/;
// -> the pattern name (P1..P6) or null
export function partyPattern(s, pos, len) { const pre = s.slice(0, pos), post = s.slice(pos + len);
  if (/\bwith\s+(?:[a-z][\w-]*\s+){0,4}$/.test(pre) && AGR_RE.test(pre)) return 'P1';
  if (/\b(?:between|among|amongst)\s+(?:[a-z][\w-]*\s+){0,3}$/.test(pre)) return 'P2';
  if (/\b(?:between|among|amongst)\b/i.test(pre) && /(?:\band|,)\s+(?:[a-z][\w-]*\s+){0,3}$/.test(pre)) return 'P2';
  if (SUBJ_VERB.test(post.replace(/^\s*(?:,?\s*(?:Inc\.?|Corp\.?|Corporation|LLC|plc|AG|SE|Ltd\.?|Limited|N\.V\.|S\.A\.|Co\.?))*\s*(?:\([^)]{0,60}\))?/, ''))) return 'P3';
  if (/\bfrom\s+(?:[a-z][\w-]*\s+){0,2}$/.test(pre) && /order|award|contract|payment|investment|funding|grant|purchase|licen[sc]e|supply/i.test(pre)) return 'P4';
  if (/\bto\s+(?:[a-z][\w-]*\s+){0,2}$/.test(pre) && /\b(?:sell|sale|supply|deliver|issue|issued|license|licen[sc]e|provide|grant|ship)/i.test(pre)) return 'P5';
  if (/\bfor\s+(?:[a-z][\w-]*\s+){0,2}$/.test(pre) && /manufactur|develop|produc|supply|provide|build|design/i.test(pre)) return 'P6';
  return null; }

// ---------------- (b) amounts in the passage ----------------
const UNIT = { thousand: 1e3, k: 1e3, million: 1e6, mm: 1e6, m: 1e6, mln: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12, tn: 1e12 };
export function amountsIn(text) { const t = String(text || ''), out = []; const re = /(?:US\s?)?\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(trillion|billion|million|thousand|bn|mln|mm|tn|m|b|k)\b)?/gi; let m;
  while ((m = re.exec(t))) { const u = (m[2] || '').toLowerCase(), after = t.slice(m.index + m[0].length, m.index + m[0].length + 14); if (/^\s*(?:\)|\.|,)?\s*per\b/i.test(after)) continue;
    const x = +m[1].replace(/,/g, '') * (UNIT[u] || 1); if (!(x >= 1e5) || !isFinite(x)) continue; out.push({ usd: x, at: m.index, len: m[0].length, raw: m[0] }); }
  return out; }
const CLS = [['UPFRONT', /upfront|up-front|initial payment|signing|non-?refundable|one-time payment/gi], ['CONTINGENT_MILESTONE', /milestone|contingent|earn-?out|royalt|upon (?:the )?achievement|potential|eligible to receive|could receive/gi],
  ['ACQUISITION_CONSIDERATION', /merger consideration|purchase price|aggregate consideration|enterprise value|equity value|tender offer|acquisition|acquire/gi],
  ['FINANCING', /\bloans?\b|credit|facility|\bnotes?\b|financing|private placement|gross proceeds|invest|warrant|\bshares\b|preferred|convertible|subscription/gi],
  ['CEILING', /\bup to\b|maximum|not to exceed|\bcap\b|ceiling/gi],
  ['COMMITTED_PURCHASE', /purchase order|minimum purchase|commit|take-or-pay|firm order|\border|contract value|total value|valued at|\bworth\b|purchase commitment|minimum annual|guaranteed|contract|award/gi]];
// class of amount a = { usd, at, len } inside text: the nearest keyword in its own clause (before: back to the previous amount, max 50
// chars; after: up to the next '$', max 40 chars, distance + 15); CEILING with a milestone word in the clause -> CONTINGENT_MILESTONE;
// > 1T USD or > 50x the market value -> UNKNOWN
export function amountClass(text, a, cap) { if (!(a.usd <= MAX_USD) || (cap > 0 && a.usd / cap > MAX_RATIO)) return 'UNKNOWN';
  const t = String(text || ''), prevEnd = (() => { let e = 0; const re = /\$\s?\d[\d,.]*(?:\s*(?:trillion|billion|million|thousand|bn|mln|mm|tn|m|b|k)\b)?/gi; let m; while ((m = re.exec(t)) && m.index < a.at) e = m.index + m[0].length; return e; })();
  const lo = Math.max(prevEnd, a.at - 50), nxt = t.indexOf('$', a.at + a.len), hi = Math.min(a.at + a.len + 40, nxt < 0 ? t.length : nxt), before = t.slice(lo, a.at), after = t.slice(a.at + a.len, hi);
  let best = null, bd = Infinity; const seen = new Set();
  for (const [k, re] of CLS) { re.lastIndex = 0; let m; while ((m = re.exec(before))) { seen.add(k); const d = before.length - (m.index + m[0].length); if (d < bd) { bd = d; best = k; } }
    re.lastIndex = 0; while ((m = re.exec(after))) { seen.add(k); const d = m.index + 15; if (d < bd) { bd = d; best = k; } } }
  if (best === 'CEILING' && seen.has('CONTINGENT_MILESTONE')) return 'CONTINGENT_MILESTONE';
  return best || 'UNKNOWN'; }
// the gate amount: the largest non-UNKNOWN passage amount -> { usd, cls, ratio, raw } or null
export function gateAmount(amounts, cap) { const ok = (amounts || []).filter(x => x.cls && x.cls !== 'UNKNOWN').sort((x, y) => y.usd - x.usd)[0]; if (!ok) return null;
  return { usd: ok.usd, cls: ok.cls, raw: ok.raw, ratio: cap > 0 ? ok.usd / cap : null }; }
export const sizeOk = (g) => !!g && g.ratio !== null && g.ratio >= SIZE_MIN && g.ratio <= MAX_RATIO && g.usd <= MAX_USD;

// ---------------- (c) family ----------------
export function familyOf(passage, s, pos, len) { const p = String(passage || ''), pre = s.slice(0, pos);
  if (FIN2_RE.test(s)) return 'CREDIT';
  if (/\bmerger\b|Merger Agreement|Plan of Merger|acquire all|acquisition of (?:all|substantially all|the Company)|tender offer|asset purchase agreement|purchase all of the outstanding|to be acquired by/i.test(p)) return 'ACQUISITION';
  if (/\b(?:purchase|buy|lease|procure|acquire)\b[^.;]{0,100}\bfrom\s+(?:[a-z][\w-]*\s+){0,2}$/i.test(pre) && !/\border\b|award|contract from|investment from|funding from/i.test(pre)) return 'INCIDENTAL';
  if (/licen[sc]e|collaborat|co-develop|royalt|option to (?:license|acquire rights)|research agreement/i.test(p)) return 'LICENSE';
  if (/supply|purchase order|master services|statement of work|services agreement|offtake|off-take|\border|distribution|customer|commercial|hosting|deployment|procurement|award|development agreement|purchase agreement for|framework agreement|reseller/i.test(p)) return 'COMMERCIAL_CUSTOMER';
  if (/securities purchase|stock purchase|share purchase|subscription agreement|investment agreement|private placement|warrant|equity investment|\binvest/i.test(p)) return 'EQUITY_INVESTMENT_BY_GIANT';
  if (/platform|marketplace|app store|cloud/i.test(p)) return 'INCIDENTAL';
  return 'UNCLEAR'; }

// ---------------- the whole filing ----------------
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// docs: [{ type, text (block text) }]; companies: [{ cik, name, aliases }]; cap: market value at f (for the amount classes)
// -> { hits: [{ cik, alias, doc, status, why, pattern, sentence }], accepted: [{ cik, name, alias, doc, pattern, sentence, passage, amounts, gate, family }], best }
export function auditFiling(docs, companies, cap) { const all = (docs || []).map(d => d.text || '').join('\n'), hits = [], accepted = [];
  const forms = []; for (const co of companies || []) for (const al of co.aliases || []) { if (!al) continue; for (const f of new Set([al, al.toUpperCase()])) forms.push([f, al, co]); }
  forms.sort((a, b) => b[0].length - a[0].length); if (!forms.length) return { hits, accepted, best: null };
  const re = new RegExp('(?<![A-Za-z0-9])(?:' + forms.map(f => esc(f[0])).join('|') + ')', 'g'), byForm = new Map(forms.map(f => [f[0], f]));
  for (const d of docs || []) { const t = d.text || '', credit = isCreditDoc(t, d.type), boil = boilerplateRanges(t); let m; re.lastIndex = 0;
    while ((m = re.exec(t))) { const f = byForm.get(m[0]); if (!f) continue; const [, alias, co] = f, at = m.index, len = m[0].length; if (!nameEnds(t.slice(at + len, at + len + 80))) continue;
      const si = sentenceInfo(t, at, len), h = { cik: String(co.cik), alias, doc: d.type, sentence: si.s.slice(0, 400) }; hits.push(h);
      if (isPerson(t, at, alias, co)) { h.status = 'drop'; h.why = 'person name'; continue; }
      if (AMBIG[alias] && !AMBIG[alias].test(all)) { h.status = 'drop'; h.why = 'ambiguous alias without the full name in the filing'; continue; }
      if (credit) { h.status = 'drop'; h.why = 'credit / financing document'; h.family = 'CREDIT'; continue; }
      if (boil.some(([a, b]) => at >= a && at < b)) { h.status = 'drop'; h.why = 'About / forward-looking / risk boilerplate section'; continue; }
      if (FLS_RE.test(si.s)) { h.status = 'drop'; h.why = 'forward-looking / safe-harbor sentence'; continue; }
      if (FIN2_RE.test(si.s)) { h.status = 'drop'; h.why = 'credit / financing / adviser sentence'; h.family = 'CREDIT'; continue; }
      if (inKeywordList(si.s, si.pos)) { h.status = 'drop'; h.why = 'list of names (include / including / such as)'; continue; }
      if (!AGR_RE.test(si.s) && !/licen[sc]e|supply|purchase|order|warrant|invest/i.test(si.s)) { h.status = 'drop'; h.why = 'no agreement wording in the sentence'; continue; }
      const pat = partyPattern(si.s, si.pos, len); if (!pat) { h.status = 'drop'; h.why = 'not named as a party in the agreement sentence'; continue; }
      if (pat !== 'P1' && pat !== 'P2' && inNameList(si.s, si.pos, len)) { h.status = 'drop'; h.why = 'list of names (A, B and C)'; continue; }
      h.status = 'party'; h.pattern = pat;
      const amounts = amountsIn(si.passage).map(a => ({ usd: a.usd, raw: a.raw, cls: amountClass(si.passage, a, cap), text: si.passage.slice(Math.max(0, a.at - 90), a.at + a.len + 60) }));
      const gate = gateAmount(amounts, cap), family = familyOf(si.passage, si.s, si.pos, len);
      accepted.push({ cik: String(co.cik), name: co.name || null, alias, doc: d.type, pattern: pat, sentence: si.s.slice(0, 700), passage: si.passage.slice(0, 1500), amounts, gate, family }); } }
  // best: a COUNTED-family hit whose gate passes (largest ratio), else any hit with the largest gate, else the first party hit
  const rank = (x) => (COUNTED.includes(x.family) ? 2 : 0) + (sizeOk(x.gate) ? 1 : 0);
  const best = [...accepted].sort((a, b) => rank(b) - rank(a) || ((b.gate && b.gate.usd) || 0) - ((a.gate && a.gate.usd) || 0))[0] || null;
  return { hits, accepted, best }; }
// the final decision for one event: extractor + hand label -> { keep, family, why }
export function decide(best, label) { if (!best) return { keep: false, family: null, why: 'extractor: no party hit' };
  if (!sizeOk(best.gate)) return { keep: false, family: (label && label.family) || best.family, why: 'size gate: no classified passage amount >= 20% of the market value (or > 50x / > 1T USD)' };
  if (!label) return { keep: false, family: best.family, why: 'no hand label' };
  if (!label.accept) return { keep: false, family: label.family, why: 'hand review: ' + (label.note || 'rejected') };
  if (!COUNTED.includes(label.family)) return { keep: false, family: label.family, why: 'family ' + label.family + ' is not counted' };
  return { keep: true, family: label.family, why: 'counted' }; }
