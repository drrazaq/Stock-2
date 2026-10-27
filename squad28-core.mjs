// SQUAD 28 CORE (27 Oct 2026; Stock-2): supplier drift after the CUSTOMER's earnings. Pure functions, no network, no files. Used by
// squad28-lab.mjs and test/squad28-core.test.mjs. Long only; no leverage; no shorting; never places an order; never gives a halal ruling.
//
// WHAT WAS ALREADY LEARNED (read before writing this; not repeated):
//   SQ1-CUSTMOM (squad1-core.mjs: MONTHLY customer momentum, ranked suppliers by their customers' last-month return) REJECTED (older half
//   -0.1% a trade, newer edge -1.0%). Its customer map (data/chain-graph.json) is NOT reused: (a) the customers were only the 47 big
//   "demand nodes" of chain-defs.json chosen TODAY (hindsight), (b) the 10% revenue threshold was not enforced (an 8% customer counted),
//   (c) 10-Q text counted too, (d) the supplier's ticker came partly from today's ticker map. N4 (customer momentum with value-chain layers)
//   NOT PROVEN; CHAIN-READ1 (same-layer read-through after a revenue-up + guidance-raise report) REJECTED; ANOM-SUE (the company's OWN
//   surprise, top 10%, hold 60) NOT PROVEN. Squad 1's survivorship bug (companies looked up by TODAY's ticker list) and squad 24's label
//   bug (an alias matched anywhere: a CEO named Apple, boilerplate) are avoided here: companies by CIK, point in time; the customer name
//   must sit in a major-customer revenue sentence with a percentage; a random 50 links are hand-checked BEFORE any return is computed.
//
// HYPOTHESIS: limited attention (Cohen & Frazzini 2008; Menzly & Ozbas 2010). Pandit, Wasley & Zach (2011, Contemporary Accounting Research
// 28(4)): a supplier's return drifts after its major CUSTOMER's earnings announcement in the direction of the customer's surprise. EVENT
// driven (the customer's report), not monthly momentum.
//
// ================= RULE: SQ28-SUPDRIFT (PRE-REGISTERED 27 Oct 2026 BEFORE ANY RESULT; one version; run ONCE under the full standard) =====
// LINKS (point in time; frozen in data/squad28-links.json whose SHA-256 is LINKS_SHA below, written BEFORE any return is computed):
//   CUSTOMER UNIVERSE (where names are searched): every ticker among the 1,000 largest by 20-session average traded value on the first
//     session of any calendar quarter of the price window that is a common stock / ADR (Massive type CS / ADRC / OS; ETFs and funds
//     among the 1,000 are dropped, not replaced); its CIK and
//     legal name from Massive ticker details on that date (the first and the last quarter it appears in, so a renamed company keeps both
//     names). A customer is a US-listed company by construction (it trades in the US price cache and reports to the SEC).
//   ALIAS (strict name matching): the legal name with a leading "The", share-class / security words ("Class A", "Common Stock", "American
//     Depositary ...", "Ordinary Shares") and trailing corporate forms (Inc / Incorporated / Corp / Corporation / Co / Company / Companies /
//     Ltd / Limited / plc / LLC / L.P. / LP / N.V. / S.A. / SE / AG / A/S / ASA / S.p.A. / Holdings Inc stays "X Holdings") removed; a
//     ".com" ending also gives the name without it ("Amazon.com" -> also "Amazon"). LEFT OUT: an alias of 3 characters or fewer, an
//     acronym (a single token of 5 or fewer letters written in capitals in the legal name, e.g. IBM, RTX, AT&T, 3M), an alias whose first
//     word is a common first name (person names: "Ralph Lauren", "Robert Half", "Steven Madden"). No tickers, no hand aliases.
//   SEARCH: EDGAR full-text search, forms 10-K, filed from 430 days before the window's first session to today, for the alias in a
//     customer phrase ("A accounted for" / "sales to A" / "net sales to A" / "revenue(s) from A" / "net revenue(s) from A" / "A represented" /
//     "A comprised" / "A was|is our largest customer" / "A, our largest customer").
//   VERIFICATION (on the hit document's own text, form exactly 10-K): a sentence that holds the alias (case as written or in capitals, a whole
//     word, an optional possessive or corporate form, and NO further capitalised name word after it: "Amazon Web Services" fails "Amazon"),
//     a revenue / sales word, and a concentration word (accounted for / represented / comprised / constituted / % of ... revenue|sales /
//     largest customer); the FIRST percentage after the alias in that sentence (N% / N percent) must be >= 10 and <= 100 and not preceded by
//     "less than / under / below / fewer than / not more than"; in a sentence about receivables the percentage must be the one followed by a
//     revenue / sales word. The supplier is the filer's CIK (never the customer itself).
//   VERIFICATION v2 (27 Oct 2026, added after the FIRST hand check scored 35/50 = 70% < 90%, BEFORE any return was computed; the v1 links
//     and labels are kept in data/squad28-linkcheck-v1.json): in addition, the sentence must not speak of market share / a right of first
//     refusal / revenue a party "retains"; the latest year named in the sentence must be >= the 10-K's filing year - 1 (no stale figures);
//     the text from the alias to the percentage must be <= 150 characters, hold a verb (accounted for / represent / comprise / constitute /
//     were / was / totaled / amounted to / made up), and hold no grouping words (and the / and other / together with / collectively /
//     combined / in the aggregate), no amount with thousands separators and no dollar sign; between the percentage and the revenue / sales
//     word only plain words (of / our / the / total / net / consolidated / Company's / respectively / years / other percentages ...); after
//     the revenue word no "of|from <Name>" and no channel / segment / category / product line / division. A new random 50 (seed 28) is
//     hand-checked on the v2 links before any return.
//   VERIFICATION v3 (27 Oct 2026, added after the SECOND hand check scored 39/50 = 78% < 90%, BEFORE any return; v2 links and labels kept
//     in data/squad28-linkcheck-v2.json): in addition, a customer named in a LIST with other names (before or after it, up to the verb)
//     counts only if the sentence says "respectively" (its own percentage is then the k-th after the verb) or "each"; otherwise the figure
//     is a combined one and the link is dropped; the year attached to the chosen percentage (the first year within 120 characters after
//     it, else the latest year within 60 characters before the name) must be >= the filing year - 1; sentences about vendors / purchases
//     from, or "10% in one or more of the past years", are dropped. A new random 50 (seed 28) is hand-checked on the v3 links.
//   ACTIVE on a session date d: the supplier's LATEST 10-K filed strictly before d (EDGAR quarterly master index, forms 10-K / 10-K405 /
//     10-KT, by CIK) is a verified 10-K for that customer CIK, filed at most 400 days before d. A later 10-K without the sentence ends it.
//   SUPPLIER TICKER on the event date: the SEC Form 3/4/5 issuer-ticker spans of the CIK (squad 4 cache), then the 10-K's own cover ticker
//     (dei:TradingSymbol), then the search's ticker, then today's map; the ticker must have prices around that date.
//   HAND CHECK (before any return): 50 links drawn with a seeded RNG (seed 28) from the frozen file, each read by hand (is the named company
//     really the CIK's company, a real counterparty, and >= 10% of revenue in the latest year of that 10-K?): precision reported. If the
//     precision is under 90% the extractor is fixed and a NEW random 50 checked, still before any return.
// EVENT: a CUSTOMER quarterly report (Nasdaq earnings calendar: date, before / after market, actual EPS, consensus EPS; the customer's
//   ticker on that date -> its CIK by the point-in-time spans, else today's map) with SUE = (actual - consensus) / the customer's close on
//   the session before the reaction session (ANOM-SUE definition; |SUE| > 1 left out), the customer LIQUID on that session (close 5 USD+,
//   20-session average traded value 5M USD+), SUE >= the 70th percentile of the SUE of all liquid reports whose reaction session is in the
//   63 sessions before this one (30+ needed; rolling, point in time) = the top 30% of reports, AND the customer's REACTION-SESSION return
//   (close r / close r-1 - 1) > 0. Reaction session r: a before-market report -> its date's session, otherwise the next session.
// ENTRY: every supplier with a link ACTIVE on D[r] to that customer: buy at the OPEN of r+1 if, at the close of r, the supplier's close is
//   3 USD+ and its 20-session average traded value (close x volume, sessions r-19..r) is 2M USD+, AND it has NOT reported itself in the
//   sessions r-4..r+20 (the 5 sessions up to the customer's reaction session and the 20 sessions of the hold): no Nasdaq calendar row for
//   its ticker with a reaction session in that range AND no 10-Q / 10-K of its CIK (EDGAR master index) filed in that range.
// EXIT: STOP 20% under the entry (a session that opens at or under the stop sells at that open, else a low at or under the stop sells at the
//   stop); else sell at the close of the 20th session (the entry session is session 1). A stock that stops trading: its last close. One
//   open trade per stock (a second event while held is skipped). A trade whose path (r-21 .. exit) holds a whole-ratio 3x-50x one-day jump
//   (an unadjusted split) is left out (squad 4 / 21 / 24 convention).
// COSTS 0.8% a round trip (1.2% stress); every gross return capped at +300% (AUD-1), the yardstick's too.
// JUDGED (the system's standard, never lowered; hold-core judgeHold = value-core judge + the per-year gate): halves = signal session r
//   before / from 2024-01-01; blocks of 20 sessions; in BOTH halves: > 0 after 0.8% and 1.2%, better than THE AVERAGE STOCK of the same
//   universe (close 3 USD+, 20-day traded value 2M USD+ on r, bought the open of r+1, sold the close of the trade's last session), better
//   than the same stock on its other days (windows of the same length, same half, not overlapping its trades), > 0 without its 2 best,
//   20+ trades and 3+ blocks, block t >= 2.5, return per year of capital tied up above SPY on the same days. PROVEN at the league bar.
// PLACEBO (yardstick, reported, not a gate): for each trade, the SAME supplier on a random session u of the same calendar quarter as r
//   (seeded RNG, seed 28, drawn in trade order) that is not within 20 sessions before or after one of its event sessions, in the same
//   universe and passing the same own-report exclusion, bought the open of u+1, same exit. Reported: n, average after cost, edge, and
//   the paired rule-minus-placebo difference per half.
// VARIANT (pre-registered, judged the same way, ONE only): SQ28-SUPDRIFT-ANY = the same rule WITHOUT the reaction-session sign condition
//   (customer SUE in the top 30% whatever its reaction).
// REPORT: case counts per half FIRST; under 20 a half = TOO FEW CASES, said plainly, the rule is NOT widened.
// PAPER LANE (from 28 Oct 2026): weekday evenings, customer reports whose reaction session is the last session -> suppliers to buy at the
//   next open (data/squad28-today.json, scan format) and data/squad28-paper.jsonl (record only). Links for the lane = the frozen file +
//   FORWARD links (the same search and verification on current-year 10-Ks, refreshed every 3 days, data/squad28-links-forward.json),
//   used ONLY for events from the paper start, never by the 5-year test.
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-28', CAP = 3, YEAR = 252, SEED = 28;
export const TH = { custTop: 1000, linkDays: 400, searchBack: 430, minPct: 10, sueWin: 63, sueQ: 0.7, sueMin: 30, custClose: 5, custDv: 5e6,
  minClose: 3, minDv: 2e6, dvSess: 20, ownBefore: 4, ownAfter: 20, hold: 20, block: 20, stop: 0.2, sample: 50, minPrecision: 0.9 };
export const ID = 'SQ28-SUPDRIFT', VAR = 'SQ28-SUPDRIFT-ANY', IDS = [ID, VAR];
// SHA-256 of the frozen data/squad28-links.json (set after the LINKS build, before any return; the lab refuses to run on any other file)
export const LINKS_SHA = '93ca6a0d65d2bfe0788aef2e2a8ad6897fc11a6f62532db05e4c59f625b5290d';
const PWZ = 'Pandit, Wasley & Zach (2011) Information Externalities along the Supply Chain: The Economic Determinants of Suppliers\' Stock Price Reaction to Their Major Customers\' Earnings Announcements, Contemporary Accounting Research 28(4)';
const CF = 'Cohen & Frazzini (2008) Economic Links and Predictable Returns, Journal of Finance 63(4)', MO = 'Menzly & Ozbas (2010) Market Segmentation and Cross-predictability of Returns, Journal of Finance 65(4)';
export const RULES = {
  [ID]: { kind: 'buy', family: 'event', hold: TH.hold, block: TH.block, name: 'Supplier drift after its major customer\'s strong earnings (SUE top 30%, positive reaction day)',
    papers: [PWZ, CF, MO], sources: ['https://doi.org/10.1111/j.1911-3846.2011.01088.x', 'https://ideas.repec.org/a/bla/jfinan/v63y2008i4p1977-2011.html', 'https://doi.org/10.1111/j.1540-6261.2010.01570.x'] },
  [VAR]: { kind: 'buy', family: 'event', hold: TH.hold, block: TH.block, name: 'Supplier drift after its major customer\'s strong earnings (SUE top 30%, any reaction)', papers: [PWZ, CF], sources: ['https://doi.org/10.1111/j.1911-3846.2011.01088.x'] } };

const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), isoMs = (x) => new Date(x).toISOString().slice(0, 10);
export const addDays = (d, n) => isoMs(ms(d) + n * DAY);
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
export function firstOnOrAfter(D, d) { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; }
export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export function sampleOf(arr, n, seed = SEED) { const a = [...arr], r = mulberry32(seed); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }

// ---------------- names -> aliases (strict) ----------------
const FIRST_NAMES = new Set(('aaron adam alan albert alex alexander alfred alice allen amy andrew angela ann anna anne anthony arthur barbara benjamin betty bill billy bob bobby '
  + 'brad brian bruce calvin carl carol carolyn catherine charles charlie chris christopher clara claude daniel david dennis diane don donald donna dorothy douglas earl eddie edward elizabeth '
  + 'emily eric ernest estee eugene evelyn frank fred frederick gary george gerald gloria grace gregory harold harry heather helen henry howard jack jacob james jane janet jason jean jeff '
  + 'jeffrey jennifer jerry jesse jim jimmy joan joe john johnny jon jonathan joseph joshua joyce juan judith judy julia julie justin karen katherine keith kelly kenneth kevin kim larry '
  + 'laura lawrence leonard linda lisa louis lucy margaret maria marie mark martha martin mary matthew melissa michael michelle nancy nathan nicholas norman pamela patricia patrick paul '
  + 'peter philip phillip ralph randy raymond rebecca richard robert roger ronald rose roy russell ruth ryan samuel sandra sara sarah scott sharon shirley stephen steve steven susan '
  + 'teresa terry thomas timothy tom tony victor victoria virginia walter wayne william willie').split(' '));
const SEC_WORDS = /\s+(?:Class\s+[A-Z]\b.*|Common\s+Stock.*|Common\s+Shares.*|Ordinary\s+Shares.*|American\s+Depositary.*|American\s+Depository.*|Depositary\s+Shares.*|ADS\b.*|ADR\b.*|Sponsored\b.*|New\s+Common.*|Capital\s+Stock.*|Units?\b.*|Warrants?\b.*)$/i;
const FORM_TAIL = /(?:,?\s+|,)(?:Inc\.?|Incorporated|Corp\.?|Corporation|Co\.?|Company|Companies|Ltd\.?|Limited|plc|PLC|p\.l\.c\.|LLC|L\.L\.C\.|L\.P\.|LP|N\.V\.|NV|S\.A\.|SA|SE|AG|A\/S|ASA|S\.p\.A\.|S\.A\.B\. de C\.V\.|de C\.V\.|Holdings,?\s+Inc\.?)\s*$/i;
export function aliasesOf(name) { let s = String(name || '').replace(/\s+/g, ' ').trim(); if (!s) return [];
  s = s.replace(SEC_WORDS, '').trim(); s = s.replace(/^The\s+/i, '');
  for (let k = 0; k < 4; k++) { const t = s.replace(FORM_TAIL, '').replace(/[,\s]+$/, '').trim(); if (t === s) break; s = t; }
  if (/\bHoldings,?\s+Inc\.?$/i.test(String(name))) s = s.replace(/,?\s+Inc\.?$/i, '');
  const out = []; const add = (a) => { a = a.replace(/[,\s]+$/, '').trim(); if (!a || out.includes(a)) return; if (aliasOk(a)) out.push(a); };
  add(s); if (/\.com$/i.test(s)) add(s.replace(/\.com$/i, '')); return out; }
export function aliasOk(a) { const s = String(a || '').trim(); if (s.replace(/[^A-Za-z0-9]/g, '').length <= 3) return false;
  const toks = s.split(/\s+/); if (toks.length === 1 && s.replace(/[^A-Za-z]/g, '').length <= 5 && s === s.toUpperCase()) return false;   // acronym
  if (toks.length === 1 && /^[A-Z0-9&.\-]+$/.test(s) && s.length <= 5) return false;
  if (toks.length >= 2 && FIRST_NAMES.has(toks[0].toLowerCase().replace(/[^a-z]/g, ''))) return false;                          // person name
  return true; }
// SEC names come in capitals ("WALMART INC."): Massive's cased name is used; this turns an all-capitals name into the case used in 10-Ks
// only when no cased name exists (information; the lab prefers Massive names)
export const casedName = (n) => /[a-z]/.test(String(n || '')) ? String(n) : String(n || '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());

// ---------------- full-text search query ----------------
export function customerQuery(aliases) { const P = []; for (const a of aliases) P.push('"' + a + ' accounted for"', '"sales to ' + a + '"', '"net sales to ' + a + '"', '"revenue from ' + a + '"', '"revenues from ' + a + '"',
  '"net revenue from ' + a + '"', '"net revenues from ' + a + '"', '"' + a + ' represented"', '"' + a + ' comprised"', '"' + a + ' was our largest customer"', '"' + a + ' is our largest customer"', '"' + a + ', our largest customer"');
  return P.join(' OR '); }

// ---------------- verification on the document text ----------------
const CONNECT = new Set(['and', 'or', 'of', 'the', 'to', 'for', 'by', 'in', 'with', 'as', 'on', 'under', 'which', 'that', 'its', 'a', 'an', 'at', 'from', 'is', 'was', 'were', 'has', 'have', 'had', 'accounted', 'represented', 'comprised', 'constituted', 'our', 'we', 'together', 'collectively', 'respectively', 'each', 'during', 'approximately', 'about', 'combined', 'individually', 'were']);
const FORM_AFTER = /^(?:,?\s*(?:Inc\.?|Incorporated|Corp\.?|Corporation|Co\.?|Company|Companies|LLC|L\.L\.C\.|Ltd\.?|Limited|plc|PLC|N\.V\.|S\.A\.|SE|AG|L\.P\.|LP)(?![A-Za-z0-9])){0,2}/i;
export function nameEnds(rest) { let r = String(rest || ''); if (/^[A-Za-z0-9]/.test(r)) return false; r = r.replace(/^['’]s\b/, ''); const m = FORM_AFTER.exec(r); if (m) r = r.slice(m[0].length);
  if (/^[A-Za-z0-9]/.test(r)) return false; const mm = /^(\s+)(\S+)/.exec(r); if (!mm) return true; if (!/^\s/.test(r)) return true; const w = mm[2];
  if (/^[("“'‘\[,.;:!?\-–—]/.test(w)) return true; if (CONNECT.has(w.replace(/[^A-Za-z]/g, '').toLowerCase())) return true; return !/^[A-Z]/.test(w); }
const ABBR = /(?:^|\s)(?:Inc|Corp|Co|Ltd|L\.P|LP|LLC|N\.A|S\.A|N\.V|U\.S|U\.K|Jr|Sr|Mr|Ms|Dr|No|St|approx|e\.g|i\.e|[A-Z])\.$/i;
export function sentenceAt(t, at, len = 0) { const isEnd = (i) => /[.;!?]/.test(t[i]) && /\s/.test(t[i + 1] || '') && /[A-Z0-9"“(]/.test(t[i + 2] || '') && !(t[i] === '.' && ABBR.test(t.slice(Math.max(0, i - 8), i + 1)));
  let a = at; while (a > 0 && at - a < 700 && !isEnd(a - 1)) a--; let b = at + len; while (b < t.length - 1 && b - at < 700 && !isEnd(b)) b++; return { text: t.slice(a, b + 1), start: a }; }
const REV = /\b(?:revenues?|net sales|sales|net revenues?)\b/i, CONC = /accounted for|represented|comprised|constituted|largest customer|%\s*(?:of|or more of)\b[^.]{0,60}\b(?:revenues?|sales)|percent\s+(?:of|or more of)\b[^.]{0,60}\b(?:revenues?|sales)/i;
const PCT = /(\d{1,3}(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)/gi, LESS = /(?:less than|under|below|fewer than|not more than|up to)\s*(?:approximately\s*)?$/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// -> { sentence, pct } for the first qualifying sentence that names the alias, or null
const VERB = /accounted for|represent|comprise|constitut|\bwere\b|\bwas\b|totaled|totalled|amounted to|made up/i, GROUP = /\b(?:and the|and other|together with|collectively|combined|in the aggregate)\b/i;
const BADSENT = /market share|right of first refusal|\bretains?\b/i, BADPOST = /channel|segment|category|product line|division/i;
const WL = new Set(('of our the its total net consolidated companys company annual gross operating and or more respectively approximately about in for each during fiscal year years ended both a an '
  + 'greater than at least over percent per cent to').split(' '));
const gapOk = (gap) => gap.toLowerCase().replace(/[^\x20-\x7e]/g, '').replace(/[(),;:"“”’'\-]/g, ' ').split(/\s+/).filter(Boolean).every(w => WL.has(w.replace(/\.$/, '')) || /^[\d.,%]+$/.test(w) || w.length === 1);
// how many list items (names joined by ", " / " and ") stand right before the alias: 0 = the alias is not a later list item
export function listPos(pre) { let k = 0, p = String(pre || ''); for (let n = 0; n < 10; n++) { const sep = /(?:,\s*and\s+|,\s*|\s+and\s+)$/.exec(p); if (!sep) break; let q = p.slice(0, sep.index).replace(/\s*\([^()]{1,40}\)$/, '');
    const nm = /(?:^|[\s(])((?:[A-Z][\w&.'’-]*)(?:\s+(?:[A-Z][\w&.'’-]*|of|de|&|and its affiliates))*)$/.exec(q); if (!nm || /^(?:In|For|During|As|On|At|By|The|Our|We)$/.test(nm[1])) break; k++; p = q.slice(0, q.length - nm[1].length); } return k; }
const BADSENT3 = /\bvendors?\b|purchased from|purchases from|one or more of the (?:past|last)/i;
const yearAt = (after, pEnd, pre) => { const a = /\b(20\d\d)\b/.exec(after.slice(pEnd, pEnd + 120)); if (a) return +a[1]; const b = [...pre.slice(-60).matchAll(/\b(20\d\d)\b/g)].map(x => +x[1]); return b.length ? Math.max(...b) : null; };
// v3 (27 Oct 2026, after the second hand check scored 78%; written BEFORE any return): -> { sentence, pct } or null. On top of v2: a
// customer named in a LIST with other names counts only if the sentence says "respectively" (then the k-th percentage after the verb is
// its own) or "each"; otherwise the figure is a combined one and the link is dropped. The year attached to the chosen percentage (the
// first year within 120 characters after it, else the latest year within 60 characters before the alias) must be >= filedYear - 1.
// Sentences about vendors / purchases, or "in one or more of the past years", are dropped.
export function linkSentence(text, aliases, filedYear = null) { const t = String(text || ''); const forms = []; for (const a of aliases || []) for (const f of [a, a.toUpperCase()]) if (!forms.includes(f)) forms.push(f);
  if (!forms.length) return null; forms.sort((a, b) => b.length - a.length); const re = new RegExp('(?<![A-Za-z0-9&])(?:' + forms.map(esc).join('|') + ')', 'g'); let m, seen = 0;
  while ((m = re.exec(t)) && seen < 400) { seen++; const end = m.index + m[0].length; if (!nameEnds(t.slice(end, end + 80))) continue;
    const S = sentenceAt(t, m.index, m[0].length), s = S.text, aStart = m.index - S.start, rel = aStart + m[0].length; if (!REV.test(s) || !CONC.test(s) || BADSENT.test(s) || BADSENT3.test(s)) continue;
    if (filedYear) { const ys = [...s.matchAll(/\b(20\d\d)\b/g)].map(x => +x[1]); if (ys.length && Math.max(...ys) < filedYear - 1) continue; }
    const pre = s.slice(0, aStart), after = s.slice(rel), vi = after.search(VERB); if (vi < 0 || vi > 150) continue;
    const preVerb = after.slice(0, vi).replace(/^['’]s\b/, '').replace(FORM_AFTER, '').replace(/\([^()]{0,60}\)/g, ' '), k = listPos(pre), others = /(?:,|\band\b)\s+(?:the\s+)?[A-Z]/.test(preVerb), resp = /\brespectively\b/i.test(s), each = /\beach\b/i.test(after.slice(0, vi + 30));
    if ((k > 0 || others) && !resp && !each) continue;
    PCT.lastIndex = 0; const P = []; let p; while ((p = PCT.exec(after))) if (p.index >= vi) P.push(p); if (!P.length) continue;
    const cand = (k > 0 || others) && resp ? [P[k]].filter(Boolean) : P; let pct = null;
    for (const q of cand) { const between = after.slice(0, q.index); if (between.length > 150 || GROUP.test(between) || /\d{1,3},\d{3}|\$/.test(between)) break;
      const qe = q.index + q[0].length, tail = after.slice(qe, qe + 140), rm = /\b(?:net revenues?|revenues?|net sales|sales)\b/i.exec(tail);
      if (!rm || !gapOk(tail.slice(0, rm.index))) { if ((k > 0 || others) && resp) { const rest = after.slice(qe); const r2 = /\b(?:net revenues?|revenues?|net sales|sales)\b/i.exec(rest); if (!r2 || r2.index > 200) break; } else continue; }
      const post = rm ? tail.slice(rm.index + rm[0].length, rm.index + rm[0].length + 50) : ''; if (/^\s*(?:of|from|to)\s+[A-Z]/.test(post) || BADPOST.test(post)) continue;
      if (filedYear) { const y = yearAt(after, qe, pre); if (y !== null && y < filedYear - 1) break; }
      const pp = after.slice(Math.max(0, q.index - 30), q.index); pct = LESS.test(pp) ? -+q[1] : +q[1]; break; }
    if (pct !== null && pct >= TH.minPct && pct <= 100) return { sentence: s.trim().slice(0, 500), pct }; }
  return null; }
// the 10-K cover page ticker (inline XBRL dei:TradingSymbol), or null
export function coverTicker(html) { const m = /name="dei:TradingSymbol"[^>]*>(?:\s*<[^>]+>)*\s*([A-Z][A-Z0-9.\-]{0,6})\s*</i.exec(String(html || '').slice(0, 3e6)); return m ? m[1].toUpperCase().replace(/-/g, '.') : null; }

// ---------------- link activity ----------------
// tenKs = sorted 10-K filing dates of the supplier (master index); shows = Set of the filing dates whose text verified the link
export function linkActiveOn(tenKs, shows, d, linkDays = TH.linkDays) { let last = null; for (const f of tenKs || []) { if (f < d) last = f; else break; }
  if (last === null) { let s = null; for (const f of shows || []) if (f < d && (s === null || f > s)) s = f; last = s; }
  return last !== null && shows.has(last) && daysBetween(last, d) <= linkDays; }

// ---------------- events ----------------
// rolling SUE cut-off: hist = [[r, sue]] sorted by r; values with r in [r0 - win, r0 - 1]
export function quantile(a, q) { if (a.length < TH.sueMin) return null; const s = [...a].sort((x, y) => x - y), p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); }
export function sueCut(hist, r0, win = TH.sueWin, q = TH.sueQ) { const v = []; for (const [r, s] of hist) if (r >= r0 - win && r < r0) v.push(s); return quantile(v, q); }
export const sueOf = (actual, est, px) => ok(actual) && ok(est) && px > 0 ? ((actual - est) / px) : null;
// own report near: sessions = the supplier's report / filing sessions; r = the customer's reaction session
export const ownNear = (sessions, r) => (sessions || []).some(s => s >= r - TH.ownBefore && s <= r + TH.ownAfter);
export const reactionIdx = (D, d, time) => { const lo = firstOnOrAfter(D, d); if (lo >= D.length) return -1; if (time === 'bmo') return lo; return D[lo] === d ? (lo + 1 < D.length ? lo + 1 : -1) : lo; };

// ---------------- exit (squad 24 exitOf with hold 20, stop 20%) ----------------
export function exitOf(S, k, T = S.c.length, hold = TH.hold, stopPct = TH.stop) { const { o, l, c } = S, e = o[k]; if (!(e > 0)) return null; const stop = e * (1 - stopPct);
  let last = -1; for (let q = T - 1; q >= 0; q--) if (c[q] > 0) { last = q; break; } const gone = last < T - 6; let lastQ = k;
  for (let q = k; q <= k + hold - 1; q++) { if (q >= T) return { open: true, k, mark: c[lastQ] > 0 ? c[lastQ] / e - 1 : null };
    if (gone && q > last) return { x: last, px: c[last], kind: 'gone', held: Math.max(1, last - k + 1), lastClose: last };
    if (q > k && o[q] > 0 && o[q] <= stop) return { x: q, px: o[q], kind: 'stop', held: q - k + 1, lastClose: q };
    if (l[q] > 0 && l[q] <= stop) return { x: q, px: stop, kind: 'stop', held: q - k + 1, lastClose: q };
    if (c[q] > 0) lastQ = q;
    if (q === k + hold - 1) { if (!(c[q] > 0)) return { x: lastQ, px: c[lastQ], kind: 'time', held: hold, lastClose: lastQ }; return { x: q, px: c[q], kind: 'time', held: hold, lastClose: q }; } }
  return null; }

// ---------------- placebo ----------------
// candidates: session indexes of the same calendar quarter; evSess: the supplier's event sessions (none within +-20 sessions); okAt(u) = universe + own-report test
export function placeboPick(rng, candidates, evSess, okAt, after = TH.hold) { const c = candidates.filter(u => !(evSess || []).some(e => u >= e - after && u <= e + after) && okAt(u)); if (!c.length) { rng(); return null; } return c[Math.floor(rng() * c.length)]; }
export const quarterKey = (d) => d.slice(0, 4) + 'Q' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1);

// ---------------- stats ----------------
export function perYear(rows, key = 'g', cost = COST) { const v = rows.filter(z => ok(z[key]) && z.days > 0); const y = v.reduce((a, z) => a + z.days / YEAR, 0); return v.length && y > 0 ? v.reduce((a, z) => a + z[key] - cost, 0) / y : null; }
export function shapeOf(tr) { const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0), kinds = {}, by = {};
  for (const z of tr) { kinds[z.kind] = (kinds[z.kind] || 0) + 1; const y = String(z.d || '').slice(0, 4); (by[y] = by[y] || []).push(z.g - COST); }
  return { trades: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, pf: l.length && sum(l) < 0 ? r4(sum(w) / -sum(l)) : null, exits: kinds,
    byYear: Object.fromEntries(Object.keys(by).sort().map(y => [y, { n: by[y].length, avg: r4(mean(by[y])) }])) }; }
export function boardStats(rows) { const net = rows.map(r => capG(r.g) - COST);
  return { n: rows.length, win: rows.length ? r4(net.filter(x => x > 0).length / rows.length) : null, avg: rows.length ? r4(mean(net)) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => capG(r.g) - r.c))) : null }; }
export const precisionOf = (labels) => { const a = (labels || []).filter(x => x && typeof x.ok === 'boolean'); return a.length ? a.filter(x => x.ok).length / a.length : null; };

// ---------------- library pre-registration (before any computation; idempotent) ----------------
export function preRegister(LB, date = '2026-10-27') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  const common = 'LINKS: a supplier\'s own 10-K (filed before the day, point in time; the supplier\'s latest 10-K must show it, at most 400 days old) names a US-listed customer (one of the 1,000 most traded stocks at a quarter start; its CIK and legal name from Massive) in a major-customer revenue sentence with a first percentage >= 10%; strict names (legal name minus corporate form, no acronyms, no person names, no hand aliases), found by EDGAR full-text search and verified on the document text; 50 random links hand-checked before any return. '
    + 'EVENT: the customer reports (Nasdaq calendar) with SUE = (actual - consensus EPS) / close in the top 30% of liquid reports of the previous 63 sessions (ANOM-SUE definition). ENTRY: the supplier at the next open after the customer\'s reaction session, if close 3 USD+, 20-day traded value 2M USD+, and no own report (Nasdaq calendar or 10-Q/10-K filing) in sessions r-4..r+20. EXIT: 20 sessions, 20% stop. One open trade per stock. Placebo: the same supplier on a random non-event session of the same quarter (seed 28), reported as a yardstick. ';
  const lib = 'SQ1-CUSTMOM (monthly customer momentum; 47 hand-chosen customers, 10% not enforced: rejected), N4 (not proven), CHAIN-READ1 (same-layer read-through: rejected), ANOM-SUE (own surprise: not proven). New: event-driven read-through from the CUSTOMER\'s surprise to its 10%+ suppliers (Pandit, Wasley & Zach 2011).';
  const add = (id, extra) => { if (LB.strategies.some(x => x.id === id)) return; const a = RULES[id];
    LB.strategies.push({ id, family: 'Squad 28 (supplier drift)', name: a.name, agent: 'squad28', kind: 'buy', hold: TH.hold, explain: common + extra + ' Paper(s): ' + a.papers.join('; ') + '.',
      status: 'pre-registered ' + date + ' (squad 28 lab); 5-year one-shot pending', sources: a.sources, libraryCheck: lib,
      note: 'Pre-registered ' + date + ' BEFORE any run (squad28-core.mjs header = the exact rule; one version + one variant). Run ONCE by squad28-lab.mjs, first complete verdict frozen in data/squad28-lab.json firstRun; forward paper lane (data/squad28-paper.jsonl, record only) from ' + PAPER_START + '.' }); ch++; };
  add(ID, 'AND the customer\'s reaction-session return > 0.'); add(VAR, 'VARIANT: no condition on the customer\'s reaction-session return.');
  if (ch) LB.updated = date; return ch; }
