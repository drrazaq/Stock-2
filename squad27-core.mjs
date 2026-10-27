// SQUAD 27 CORE (27 Oct 2026; Stock-2): ODD-LOT ISSUER TENDER ARBITRAGE. Pure functions, no network, no files. Used by
// squad27-lab.mjs (history + weekly board) and test/squad27-core.test.mjs. Long only; never places an order; never sends an alert;
// never gives a halal ruling (the ZAD mark is copied from data/halal.json / data/zad-list.json, else "unknown").
//
// WHY: a company buying back its own shares with an issuer tender offer (SEC Schedule TO-I; often a "modified Dutch auction") usually
// accepts in full, with no proration, every tender from a holder of FEWER THAN 100 shares who tenders ALL of them (an "odd lot";
// allowed by Rule 13e-4(f)(3)(i)). When the stock trades under the minimum tender price, a small holder can buy 99 shares and tender
// them. This is NOT the cash tender TARGET spread trade already in the library (RQ-TENDER-3-15, RQ-TENDER-ALL, C-SPEC1 = third-party
// SC TO-T offers, the whole position at risk of proration and deal break). Here the buyer is the company itself and the odd-lot clause
// removes proration.
//
// ================= TEST: SQ27-ODDLOT (PRE-REGISTERED 27 Oct 2026 BEFORE ANY RESULT; run ONCE; first complete result frozen) =================
// FILINGS: every row of the EDGAR quarterly full index (official file /Archives/edgar/full-index/YYYY/QTRn/master.gz) with form type
//   exactly 'SC TO-I' (an original offer) or 'SC TO-I/A' (an amendment), dated 2019-01-01 .. today. One filing = one accession (rows
//   repeated for subject and filer are merged). An amendment belongs to the latest original of the SAME filer CIK filed on or before it
//   (and at most 400 days earlier).
// OFFER DOCUMENT: from the filing index page, the document whose type, stripped of every non-letter/digit, is EX99A1A or EX99A1I (the
//   Offer to Purchase); else the main SC TO-I document if its text holds "offer to purchase"; else a data gap (counted).
// FIELDS (offerFields below; regular expressions fixed here, never tuned on results):
//   ticker   = the quoted symbol next to an exchange name (NYSE / Nasdaq / Cboe / New York Stock Exchange). None -> NOT LISTED (excluded:
//              this is how non-listed funds and REITs drop out; point in time, from the offer itself, no ticker list of today).
//   security = 'common' unless the first 1,500 characters name notes / debentures / warrants / options / preferred, or the document is an
//              offer to EXCHANGE -> 'other' (excluded from the arbitrage).
//   type     = 'dutch' (a price range "not greater than $X nor less than $Y", either order, or "$X to $Y per share") / 'fixed' ("price of
//              $X per share") / 'nav' (net asset value, no dollar price) / 'unknown'. Searched in the first 12,000 characters.
//   oddLot   = a sentence holding "odd lot" (any spacing / hyphen) AND one of: priority / prorat* / fewer than 100 / less than 100 /
//              100 Shares. The first such sentence is quoted (max 600 characters).
//   expiry   = the first date (Month D, YYYY) within 300 characters after the first "expire"/"expiration" that is 5..150 days after the
//              filing date.
//   conditions = financing condition (yes when "financing condition" appears and "not subject to any financing condition" does not),
//              minimum condition (no when "not conditioned upon any minimum number" or similar appears).
// AMENDMENTS (amendmentFields): main SC TO-I/A document + every EX-99 (a)(5) exhibit (press releases), max 3 documents.
//   extension  = in a sentence holding "extend" and "expir", the latest date 1..150 days after the expiry in force; effective from the
//                amendment's FILING date (no look-ahead: an extension filed after the entry is only known after the entry).
//   termination = a past-tense termination / withdrawal OF THE OFFER ("has terminated its ... offer", "offer was terminated", "announced
//                the termination of its ... offer", "decided to terminate the offer") in a sentence without may / right to / reserve / if /
//                in the event / unless. Termination date = that amendment's filing date.
//   completion  = a sentence holding "accepted for purchase" / "accepted for payment" / "has (have) accepted" / "expects to accept"
//                (preliminary) / "final results" / "final count" / "final purchase price" with "$X per share" and WITHOUT range words
//                (not greater / not less / not more / range): the LAST final (else preliminary) amendment gives the final price. A
//                fixed-price offer with an acceptance sentence and no price uses the fixed price.
//   status     = terminated (if any termination) > completed > open (expiry in force not passed) > unknown (a data gap, counted).
// ARBITRAGE (arbTrade), 99 shares, only offers with oddLot, a ticker, security 'common' and type dutch or fixed:
//   ENTRY 'E2' (primary): the close 2 sessions before the expiry in force on the entry day (iterated: an extension filed on or before the
//     candidate entry day moves it). ENTRY 'A1' (reported too): the close of the first session after the original's filing date.
//   GATE: buy only if that close < the minimum price (range minimum, or the fixed price). No gap = no trade (counted).
//   COSTS: 0.8% on the buy; commission COMMISSION = 3 USD (the ZAD stock fee assumed by scan.mjs when none is set; ASSUMPTION);
//     corporate-action fee CA_FEE = 25 USD flat (ZAD fee UNKNOWN; ASSUMPTION), charged on every trade.
//   PAYOUT: completed -> 99 x final price ('actual'; the fixed price for a fixed offer; for a Dutch auction with no final price found
//     'actual' is a data gap) and 99 x the minimum price ('min', the conservative case: the tenderer accepts the clearing price).
//     terminated -> keep the shares, valued at the close 5 sessions after the termination filing date (the same in both cases).
//   CASH DATE: 5 sessions after the final expiry (prompt payment; ASSUMPTION), or the valuation day when terminated.
//   profit = payout - 99 x close x 1.008 - 3 - 25; capital = 99 x close x 1.008 + 3; days = calendar days entry -> cash date;
//   annualised return = profit / capital x 365 / days (per trade; the pool figure = sum profit / sum(capital x days) x 365).
//   HALVES: older = entry before 2024-01-01, newer = from 2024-01-01. Reported per year: n offers, % odd lot, completion rate, n trades,
//   average / median / worst / total profit, average days, annualised return. Prices: Alpaca SIP daily bars, adjustment=raw (Massive
//   daily aggregates unadjusted as the fallback for symbols Alpaca lacks). Missing prices = a data gap (counted, never filled).
// COMPLETE (freeze rule): every quarter index read; >= 97% of originals read; >= 97% of linked amendments read; prices for >= 90% of
//   eligible odd-lot offers. Then firstRun is frozen once and never re-run.
// DATA-INTEGRITY FIXES (27 Oct 2026, after the first COLLECTING run, before any freeze; written down here, not tuned on profit):
//   (1) CURRENCY: an offer whose first 12,000 characters price it in Canadian dollars (Cdn$ / C$ / CAD / "Canadian dollars") is
//       type 'foreign' and excluded: its price cannot be compared with the US-dollar close (Imperial Oil 2023: C$78.50 vs a 54.98 USD
//       close gave a false +2,257 USD). (2) ORDER: the final-price sanity check (0.5x min .. 2x max) now runs BEFORE a completed
//       fixed-price offer falls back to its fixed price (a fixed offer had lost its price). Same rule otherwise.
// BUG SQ27-B1 (found 27 Oct 2026 AFTER the first complete run was frozen; firstRun is NOT touched; the fixed run goes to correctedRun):
//   the ticker reader TICK_A used [^"] between the exchange name and "symbol", so the common wording 'New York Stock Exchange ("NYSE")
//   under the symbol "GME"' never matched: about 50 listed offers (GameStop, DaVita, MGM, MicroStrategy, Marathon Petroleum, Coca-Cola
//   Consolidated, ...) were wrongly counted as NOT LISTED. Fix: any characters (max 200) between the exchange name and the symbol, and
//   an unquoted 'under the symbol XYZ' next to an exchange name. Records read before are re-read once (cache v3). Nothing else changes.
// This is NOT a scan.mjs rule: it is a paper/information lane. Nothing here becomes a TRY SMALL buy.

export const ID = 'SQ27-ODDLOT', ID_A1 = 'SQ27-ODDLOT-A1';
export const SHARES = 99, BUY_COST = 0.008, COMMISSION = 3, CA_FEE = 25, PAY_LAG = 5, TERM_LAG = 5, SPLIT = '2024-01-01', FROM = '2019-01-01';
export const COMPLETE = { orig: 0.97, amend: 0.97, px: 0.90 };

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DATE_RE = /(January|February|March|April|May|June|July|August|September|Sept\.?|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/gi;
export const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
export const dayDiff = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const num = (s) => +String(s).replace(/,/g, '');
export const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const r2 = (x) => x === null || x === undefined || !isFinite(x) ? null : Math.round(x * 100) / 100;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : Math.round(x * 1e4) / 1e4;

// ---------- EDGAR files ----------
// master.idx: CIK|Company Name|Form Type|Date Filed|Filename
export function parseMaster(txt, forms = new Set(['SC TO-I', 'SC TO-I/A'])) { const out = [], seen = new Set();
  for (const line of String(txt).split('\n')) { const p = line.split('|'); if (p.length < 5 || !/^\d+$/.test(p[0])) continue; const form = p[2].trim();
    if (!forms.has(form)) continue; const file = p[4].trim(), acc = accOf(file); if (!acc || seen.has(acc)) continue; seen.add(acc);
    out.push({ form, cik: String(+p[0]), name: p[1].trim(), date: p[3].trim(), file, acc }); }
  return out; }
export const accOf = (file) => { const m = String(file).match(/(\d{10}-\d{2}-\d{6})/); return m ? m[1] : null; };
export const indexUrl = (cik, acc) => '/Archives/edgar/data/' + cik + '/' + acc.replace(/-/g, '') + '/' + acc + '-index.htm';
// filing index page -> [{ seq, desc, doc, href, type, size }]
export function parseIndexHtm(html) { const out = [], tbl = String(html).match(/<table[^>]*class="tableFile"[\s\S]*?<\/table>/i); if (!tbl) return out;
  for (const tr of tbl[0].match(/<tr[\s\S]*?<\/tr>/gi) || []) { const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]); if (cells.length < 4) continue;
    const href = (cells[2].match(/href="([^"]+)"/i) || [])[1]; if (!href) continue; const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
    out.push({ seq: strip(cells[0]), desc: strip(cells[1]), doc: strip(cells[2]).split(/\s/)[0], href: href.replace(/^https?:\/\/www\.sec\.gov/i, '').replace(/^\/ix\?doc=/, ''), type: strip(cells[3]), size: +(strip(cells[4] || '').replace(/\D/g, '')) || 0 }); }
  return out; }
export const normType = (t) => String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const isHtmlish = (d) => /\.(htm|html|txt)$/i.test(d.doc || d.href || '');
export function pickOfferDoc(docs) { const h = docs.filter(isHtmlish);
  const ex = h.find(d => /^EX99A1(A|I)$/.test(normType(d.type))); if (ex) return { doc: ex, how: 'exhibit' };
  const main = h.find(d => /^SCTOI$/.test(normType(d.type))); return main ? { doc: main, how: 'main' } : null; }
export function pickAmendDocs(docs) { const h = docs.filter(isHtmlish), out = [];
  const main = h.find(d => /^SCTOIA$/.test(normType(d.type)) || /^SCTOI$/.test(normType(d.type))); if (main) out.push(main);
  for (const d of h) { if (out.length >= 3) break; const t = normType(d.type); if (d === main) continue; if (/^EX99A5/.test(t) || (/^EX99/.test(t) && /press release/i.test(d.desc || ''))) out.push(d); }
  return out; }

// ---------- text ----------
const ENT = { amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>', ldquo: '"', rdquo: '"', lsquo: "'", rsquo: "'", mdash: '-', ndash: '-', sect: '§', hellip: '...' };
export function html2text(html) { let s = String(html).replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d|td)>/gi, '\n').replace(/<[^>]+>/g, ' ');
  s = s.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? ' ');
  return s.replace(/[“”„‟″]/g, '"').replace(/[‘’′]/g, "'").replace(/[–—‑‐]/g, '-').replace(/[    ​]/g, ' ')
    .replace(/[ \t\r\f\v]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{2,}/g, '\n').trim(); }
export function datesIn(s) { const out = []; for (const m of String(s).matchAll(DATE_RE)) { let mo = m[1].toLowerCase().replace(/\./g, ''); if (mo === 'sept') mo = 'september';
    const k = MONTHS.indexOf(mo), d = +m[2], y = +m[3]; if (k < 0 || d < 1 || d > 31 || y < 1990 || y > 2100) continue;
    out.push({ d: y + '-' + String(k + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0'), at: m.index }); }
  return out; }
export function sentences(text) { return String(text).replace(/\n/g, ' ').split(/(?<=[.;]|[.;]["'])\s+(?=[A-Z("])/); }

// ---------- offer fields ----------
const EXCH = '(?:New York Stock Exchange|NYSE(?: American| Arca| MKT)?|Nasdaq|NASDAQ|Cboe|CBOE|BATS)';
const TICK_A = new RegExp(EXCH + '[^"]{0,200}?(?:symbol|ticker)s?\\s*(?:of\\s*)?"\\s*([A-Z]{1,5}(?:[.\\-][A-Z]{1,2})?)\\.?\\s*,?"', 'i');
const TICK_B = /(?:symbol|ticker)s?\s*"\s*([A-Z]{1,5}(?:[.\-][A-Z]{1,2})?)\.?\s*,?"[^.]{0,120}?(?:New York Stock Exchange|NYSE|Nasdaq|NASDAQ|Cboe|CBOE)/i;
const TICK_A2 = new RegExp(EXCH + '[\\s\\S]{0,200}?(?:symbol|ticker)s?\\s*(?:of\\s*)?"\\s*([A-Z]{1,5}(?:[.\\-][A-Z]{1,2})?)\\.?\\s*,?"', 'i');
const TICK_C = new RegExp(EXCH + '[\\s\\S]{0,200}?(?:under the|trading|ticker) symbol\\s+([A-Z]{1,5}(?:[.\\-][A-Z]{1,2})?)\\b');
export function tickerOfV1(text) { const t = String(text); for (const re of [TICK_A, TICK_B]) { const m = t.match(re); if (m && /^[A-Z]/.test(m[1]) && m[1] === m[1].toUpperCase()) return m[1].replace('-', '.'); } return null; }
export function tickerOf(text) { const t = String(text); for (const re of [TICK_A2, TICK_B, TICK_C]) { const m = t.match(re); if (m && /^[A-Z]/.test(m[1]) && m[1] === m[1].toUpperCase()) return m[1].replace('-', '.'); } return null; }
const P = '\\$\\s*([\\d,]+(?:\\.\\d+)?)';
const R_MAXMIN = new RegExp('not (?:greater|more|higher) than ' + P + '\\s*(?:per share\\s*)?,?\\s*(?:nor|or|and not|and)\\s*(?:less|lower) than ' + P, 'i');
const R_MINMAX = new RegExp('not (?:less|lower) than ' + P + '\\s*(?:per share\\s*)?,?\\s*(?:nor|or|and not|and)\\s*(?:greater|more|higher) than ' + P, 'i');
const R_RANGE = new RegExp('(?:price|range|prices) of ' + P + '\\s*(?:to|and)\\s*' + P + '\\s*per (?:share|Share)', 'i');
const R_FIXED = new RegExp('(?:purchase price|price|cash) of ' + P + '\\s*per (?:share|Share)', 'i'), R_FIXED2 = new RegExp('at ' + P + '\\s*per (?:share|Share),? net to the seller', 'i');
export function priceTerms(text) { const t = String(text).slice(0, 12000).replace(/\n/g, ' '); let m;
  if (/Cdn\s?\$|\bC\$|\bCAD\b|Canadian dollars/.test(t)) return { type: 'foreign', min: null, max: null };
  if ((m = t.match(R_MAXMIN))) { const max = num(m[1]), min = num(m[2]); if (min > 0 && max >= min) return { type: 'dutch', min, max }; }
  if ((m = t.match(R_MINMAX))) { const min = num(m[1]), max = num(m[2]); if (min > 0 && max >= min) return { type: 'dutch', min, max }; }
  if ((m = t.match(R_RANGE))) { const a = num(m[1]), b = num(m[2]); if (a > 0 && b > a) return { type: 'dutch', min: a, max: b }; }
  if ((m = t.match(R_FIXED) || t.match(R_FIXED2))) { const p = num(m[1]); if (p > 0) return { type: 'fixed', min: p, max: p }; }
  if (/net asset value/i.test(t)) return { type: 'nav', min: null, max: null };
  return { type: 'unknown', min: null, max: null }; }
export function securityOf(text) { const t = String(text), head = t.slice(0, 1500);
  if (/offer to exchange|exchange offer/i.test(head)) return 'other';
  if (/\b(notes? due|% (?:senior |convertible )?notes|debentures|warrants|eligible options|stock options|options to purchase|preferred (?:stock|shares))\b/i.test(head)) return 'other';
  return /\b(shares|common stock|ordinary shares|common shares)\b/i.test(t.slice(0, 8000)) ? 'common' : 'other'; }
const ODD = /odd[\s-]*lots?/i, ODD_CTX = /priority|prorat|fewer than (?:100|one hundred)|less than (?:100|one hundred)|100 Shares/i;
export function oddLotOf(text) { for (const s of sentences(text)) if (ODD.test(s) && ODD_CTX.test(s)) return { oddLot: true, quote: s.trim().slice(0, 600) };
  return { oddLot: false, quote: ODD.test(text) ? null : null }; }
export function expiryOf(text, filed) { const t = String(text).replace(/\n/g, ' '), re = /\bexpir(e|es|ation)\b/gi; let m;
  while ((m = re.exec(t))) { for (const x of datesIn(t.slice(m.index, m.index + 300))) { const k = dayDiff(filed, x.d); if (k >= 5 && k <= 150) return x.d; } if (re.lastIndex > 60000) break; }
  return null; }
export function conditionsOf(text) { const t = String(text).replace(/\n/g, ' ');
  const finNo = /not (?:subject to|conditioned (?:up)?on) (?:any |the receipt of )?(?:a )?financing/i.test(t) || /no financing condition/i.test(t);
  const minNo = /not conditioned (?:up)?on (?:any|the) (?:minimum|tender of any minimum)/i.test(t) || /not conditioned (?:up)?on any minimum number/i.test(t) || /no minimum (?:number|condition)/i.test(t);
  const fin = !finNo && /financing condition/i.test(t), minc = !minNo && /minimum (?:tender |number )?condition/i.test(t);
  return { financingCondition: fin, minimumCondition: minc }; }
export function offerFields(text, filed) { const pt = priceTerms(text), ol = oddLotOf(text);
  return { ticker: tickerOf(text), security: securityOf(text), type: pt.type, min: pt.min, max: pt.max, oddLot: ol.oddLot, oddLotQuote: ol.quote, expiry: expiryOf(text, filed), ...conditionsOf(text),
    dutchWords: /dutch auction/i.test(String(text).slice(0, 12000)) }; }

// ---------- amendment fields ----------
const OFW = '(?:its|the) (?:[\\w"-]+ ){0,8}?offer\\b';
const TERM_RE = new RegExp('(?:has|have|had|hereby)\\s+(?:terminated|withdrawn)\\s+' + OFW + '|\\bterminated ' + OFW + '|\\boffer (?:was|has been|had been|is being|is hereby) (?:terminated|withdrawn)\\b|\\b(?:decided|elected) to (?:terminate|withdraw) ' + OFW + '|\\bannounced (?:the )?termination of ' + OFW, 'i');
const COND_RE = /\b(may|might|could|reserves?|right to|if|in the event|unless|whether)\b/i;
const ACC_RE = /accepted for (?:purchase|payment)|(?:has|have) accepted|expects to accept|final results|final count|final purchase price/i, RANGE_RE = /not (?:greater|less|more|lower|higher) than|\brange\b/i;
const PX_RE = new RegExp(P + '\\s*per (?:share|Share)', 'g');
export function amendmentFields(text, filed, expiryNow) { const out = { extendTo: null, terminated: false, accepted: false, finalPrice: null, finalQuote: null, preliminary: false };
  for (const s of sentences(text)) {
    if (/\bextend/i.test(s) && /expir/i.test(s) && expiryNow) for (const x of datesIn(s)) { const k = dayDiff(expiryNow, x.d); if (k >= 1 && k <= 150 && (!out.extendTo || x.d > out.extendTo)) out.extendTo = x.d; }
    if (TERM_RE.test(s) && !COND_RE.test(s) && !/withdrawal rights/i.test(s)) out.terminated = true;
    if (ACC_RE.test(s) && !COND_RE.test(s) && !RANGE_RE.test(s)) { const pre = /preliminary|expects to accept/i.test(s); if (!pre) out.accepted = true; const pxs = [...s.matchAll(PX_RE)].map(m => num(m[1])).filter(x => x > 0);
      if (pxs.length && out.finalPrice === null) { out.finalPrice = pxs[0]; out.finalQuote = s.trim().slice(0, 400); out.preliminary = pre; } else if (pxs.length && out.preliminary && !pre) { out.finalPrice = pxs[0]; out.finalQuote = s.trim().slice(0, 400); out.preliminary = false; } } }
  return out; }
// offer timeline from the original fields + amendments in filing order -> { expiryHist: [{ from, expiry }], finalExpiry, status, finalPrice, termDate }
export function timeline(orig, amends, today) { const hist = [{ from: orig.date, expiry: orig.expiry }]; let exp = orig.expiry, status = null, finalPrice = null, finalQuote = null, termDate = null, accepted = false;
  for (const a of [...amends].sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0)) { const f = a.fields || {};
    if (f.extendTo && exp && f.extendTo > exp) { exp = f.extendTo; hist.push({ from: a.date, expiry: exp }); }
    if (f.terminated && !termDate) termDate = a.date;
    if (f.accepted) accepted = true;
    if (f.finalPrice !== null && f.finalPrice !== undefined && (!f.preliminary || finalPrice === null)) { finalPrice = f.finalPrice; finalQuote = f.finalQuote; } }
  if (termDate) status = 'terminated'; else if (accepted || finalPrice !== null) status = 'completed'; else if (exp && exp >= today) status = 'open'; else status = 'unknown';
  if (finalPrice !== null && orig.min && (finalPrice < orig.min * 0.5 || finalPrice > (orig.max || orig.min) * 2)) finalPrice = null;   // a sentence about another price (sanity)
  if (status === 'completed' && finalPrice === null && orig.type === 'fixed') finalPrice = orig.min;
  return { expiryHist: hist, finalExpiry: exp, status, finalPrice, finalQuote, termDate }; }
export const expiryAsOf = (hist, d) => { let e = hist[0].expiry; for (const h of hist) if (h.from <= d && h.expiry) e = h.expiry; return e; };

// ---------- sessions ----------
export const lastOnOrBefore = (D, d) => { let lo = 0, hi = D.length - 1, r = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (D[m] <= d) { r = m; lo = m + 1; } else hi = m - 1; } return r; };
export const firstAfter = (D, d) => { const k = lastOnOrBefore(D, d); return k + 1 < D.length ? k + 1 : -1; };
// entry session index for 'E2' (2 sessions before the expiry in force on the entry day) or 'A1' (first session after the filing)
export function entryIndex(D, offer, how) { const k0 = firstAfter(D, offer.date); if (k0 < 0) return -1; if (how === 'A1') return k0;
  let E = expiryAsOf(offer.expiryHist, offer.date), e = -1;
  for (let it = 0; it < 8; it++) { if (!E) return -1; const k = lastOnOrBefore(D, E); if (k < 0) return -1; e = Math.max(k - 2, k0); const E2 = expiryAsOf(offer.expiryHist, D[e]); if (E2 === E) break; E = E2; }
  return e; }
// one paper trade. bars: { D: [dates], C: [closes] } raw. Returns null when not tradable (with why).
export function arbTrade(offer, bars, how = 'E2') { const D = bars.D, C = bars.C;
  if (!offer.oddLot || offer.security !== 'common' || !(offer.type === 'dutch' || offer.type === 'fixed') || !(offer.min > 0)) return { skip: 'not eligible' };
  if (offer.status === 'open') return { skip: 'open' }; if (offer.status === 'unknown') return { skip: 'outcome unknown' };
  const e = entryIndex(D, offer, how); if (e < 0 || !(C[e] > 0)) return { skip: 'no entry price' };
  if (offer.finalExpiry && D[e] > offer.finalExpiry) return { skip: 'entry after expiry' };
  if (offer.status === 'terminated' && offer.termDate <= D[e]) return { skip: 'terminated before entry' };
  const c = C[e]; if (!(c < offer.min)) return { skip: 'no gap', close: c };
  const buy = SHARES * c * (1 + BUY_COST), capital = buy + COMMISSION; let x, payA, payM;
  if (offer.status === 'terminated') { const k = lastOnOrBefore(D, offer.termDate); x = k + TERM_LAG; if (k < 0 || x >= D.length || !(C[x] > 0)) return { skip: 'no price after termination' }; payA = payM = SHARES * C[x]; }
  else { const k = lastOnOrBefore(D, offer.finalExpiry); x = Math.min(k + PAY_LAG, D.length - 1); if (k < 0) return { skip: 'no expiry session' };
    payM = SHARES * offer.min; payA = offer.finalPrice > 0 ? SHARES * offer.finalPrice : null; }
  const cashDate = x < D.length ? D[x] : addDays(offer.finalExpiry, 7), days = Math.max(1, dayDiff(D[e], cashDate));
  const pr = (pay) => pay === null ? null : pay - buy - COMMISSION - CA_FEE;
  return { sym: offer.ticker, acc: offer.acc, how, entry: D[e], close: r4(c), min: offer.min, finalPrice: offer.finalPrice, status: offer.status, cashDate, days, capital: r2(capital),
    gap: r4(offer.min / c - 1), profitActual: r2(pr(payA)), profitMin: r2(pr(payM)), annActual: payA === null ? null : r4(pr(payA) / capital * 365 / days), annMin: r4(pr(payM) / capital * 365 / days) }; }

// ---------- summaries ----------
export function summarize(trades, key = 'profitActual') { const T = trades.filter(t => t && typeof t[key] === 'number'), P = T.map(t => t[key]);
  if (!T.length) return { n: 0 };
  const capDays = T.reduce((s, t) => s + t.capital * t.days, 0), years = {};
  for (const t of T) { const y = t.entry.slice(0, 4); (years[y] = years[y] || { n: 0, total: 0 }); years[y].n++; years[y].total = r2(years[y].total + t[key]); }
  return { n: T.length, avg: r2(mean(P)), median: r2(median(P)), worst: r2(Math.min(...P)), best: r2(Math.max(...P)), total: r2(P.reduce((s, x) => s + x, 0)), wins: T.filter(t => t[key] > 0).length,
    avgCapital: r2(mean(T.map(t => t.capital))), avgDays: r2(mean(T.map(t => t.days))), annPool: r4(P.reduce((s, x) => s + x, 0) / capDays * 365), annMedian: r4(median(T.map(t => t[key] / t.capital * 365 / t.days))), years }; }
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export function byHalf(trades, key) { return { older: summarize(trades.filter(t => halfOf(t.entry) === 'older'), key), newer: summarize(trades.filter(t => halfOf(t.entry) === 'newer'), key), all: summarize(trades, key) }; }
export function isComplete(st) { const r = (a, b) => b ? a / b : 1; const ok = st.quartersRead >= st.quartersNeed && r(st.origRead, st.origNeed) >= COMPLETE.orig && r(st.amendRead, st.amendNeed) >= COMPLETE.amend && r(st.pxOk, st.pxNeed) >= COMPLETE.px;
  return { ok, why: ok ? 'complete' : ['quarters ' + st.quartersRead + '/' + st.quartersNeed, 'originals ' + st.origRead + '/' + st.origNeed, 'amendments ' + st.amendRead + '/' + st.amendNeed, 'prices ' + st.pxOk + '/' + st.pxNeed].join(', ') }; }
export function halalMark(sym, HAL, ZBAD) { if (!sym) return 'unknown'; if (ZBAD && ZBAD.has(sym)) return 'fail'; const h = HAL && HAL[sym]; return h && h.s ? h.s : 'unknown'; }

// ---------- library ----------
export function preRegister(LB, date = '2026-10-27') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0; const add = (e) => { if (LB.strategies.some(x => x.id === e.id)) return; LB.strategies.push(e); ch++; };
  const base = { family: 'Squad 27 (odd-lot issuer tender arbitrage)', agent: 'squad27', status: 'pre-registered ' + date + ' (squad 27 lab); one-shot pending; information / paper lane only, not a scan rule',
    sources: ['https://www.sec.gov/Archives/edgar/full-index/ (SC TO-I, SC TO-I/A)', 'https://www.ecfr.gov/current/title-17/section-240.13e-4 (Rule 13e-4(f)(3)(i) odd-lot priority)', 'https://data.alpaca.markets (SIP daily raw)'],
    libraryCheck: 'Different from RQ-TENDER-3-15, RQ-TENDER-ALL and C-SPEC1 (third-party SC TO-T cash tender TARGET spread, whole position, proration and deal-break risk). Here: the company buys its OWN shares (SC TO-I) and the odd-lot clause (fewer than 100 shares, all tendered) removes proration; 99 shares only.' };
  add({ ...base, id: ID, kind: 'buy', hold: 5, name: 'Odd-lot issuer tender arbitrage: buy 99 shares at the close 2 sessions before the expiry when the close is under the minimum tender price; tender all 99 (odd-lot priority)',
    explain: 'RULE (squad27-core.mjs header, exact): every SC TO-I 2019..now (EDGAR quarterly index), Offer to Purchase read for ticker, price or range, odd-lot priority clause, expiry and conditions; amendments for extensions, termination and the final price. 99 shares at the close 2 sessions before the expiry in force, only if that close < the minimum price; 0.8% on the buy, 3 USD commission and a 25 USD corporate-action fee (both ASSUMED); payout 99 x final price (actual) or 99 x range minimum (conservative); terminated = shares valued at the close 5 sessions later. Halves before / from 2024.',
    note: 'Squad 27, 27 Oct 2026. Pre-registered BEFORE any run; run ONCE by squad27-lab.mjs; first complete result frozen in data/squad27-lab.json firstRun; current offers in data/squad27-board.json (weekly, record only).' });
  add({ ...base, id: ID_A1, kind: 'variant', hold: 30, name: 'Same, bought at the close of the first session after the SC TO-I filing (information)', explain: 'Pre-registered variant of SQ27-ODDLOT: the entry is the first session after the original filing; same gate, costs and payout. More days of capital tied up.' });
  if (ch) LB.updated = date; return ch; }
