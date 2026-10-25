// SQUAD 21 CORE (25 Oct 2026; Stock-2): two rules sent by the owner's outside reviewer. Pure functions, no network, no files. Used by
// squad21-lab.mjs and test/squad21-core.test.mjs. Long only; no leverage; no shorting; never places an order; never gives a halal ruling.
//
// WHAT WAS ALREADY LEARNED (read before writing this; not repeated): DEC2-CONTRACT (8-K 1.01, under 2B USD, +4% close on 2x volume, stop
// the day low, trail the 10-day low) was REJECTED in both halves (-1.3% / -2.0% a trade). C-QK1 (8-K 1.01 then 3 quiet sessions holding the
// filing-day low) REJECTED. CAT-NEWS1 (3+ positive 8-Ks) REJECTED. Squad 1 built the EDGAR full-text pipeline and found the survivorship bug
// (companies looked up by TODAY's ticker list): here every filing is tied to its company by the filing's own CIK and a point-in-time ticker
// (SEC Form 3/4/5 issuer ticker spans), never by today's list alone. Squad 19 found dollar values in filings hard to parse reliably: the
// materiality test is therefore NOT part of the rule, only an information subset.
//
// ================= RULE 1: SQ21-CONTRACT10D (PRE-REGISTERED 25 Oct 2026 BEFORE ANY RESULT; one version; run ONCE under the full standard) =====
// EVENT: an SEC 8-K (form exactly 8-K; amendments left out) whose items list Item 1.01 (entry into a material definitive agreement), found
//   by EDGAR full-text search of the Item 1.01 heading words "Material Definitive Agreement" in 8-Ks (the search's items field must hold
//   1.01). The document read is the main 8-K document (where the Item 1.01 text is). Its text must contain 'agreement with' / 'contract with'
//   / 'order from' / 'purchase order from' (any case; a parenthetical defined term of up to 80 characters may sit between the noun and
//   with/from, e.g. 'agreement (the "Agreement") with') FOLLOWED BY A NAMED COUNTERPARTY: a capitalised name of 1-10 words right after
//   with/from (an optional leading 'the'), which is NOT a generic defined term (the Company / Purchaser / Buyer / Seller / Lenders /
//   Investors / Holders / Agent / Trustee / Borrower / Parent / Executive / Underwriters / Subscribers ...; and any ONE-word name right
//   after 'the', e.g. 'the Customer'), NOT a personal title (Mr. / Ms. / Mrs. / Dr.), and the agreement is NOT a personal one (employment,
//   separation, severance, retention, consulting, indemnification, transition, offer, change in control in the 4 words before the noun).
// COMPANY: the filing's CIK -> the point-in-time ticker (Form 3/4/5 issuer-ticker spans of that CIK covering the date, then the tickers the
//   full-text search shows, then today's SEC list), with prices near the date. FILING SESSION f = the first session on or after the filing date.
// SIGNAL session t = the FIRST session with 1 <= t - f <= 10 at whose close ALL of these hold:
//   a. close >= 2 USD and 20-session average traded value (close x volume) >= 2M USD;
//   b. the SEC share count known on t (30 days late) is up < 5% on the count known 90 calendar days earlier (both must be known);
//   c. no Form 424B5 or S-1 (EDGAR quarterly master index) and no 8-K with Item 3.02 (full-text search of "Unregistered Sales of Equity
//      Securities", items 3.02) filed by the same CIK in sessions t-19..t;
//   d. NO close-to-close rise of +15% or more on any of the 21 sessions t-20..t;
//   e. since the filing no lower low in the last 3 sessions: the lowest low of t-2..t is not below the lowest low of sessions f..t-3
//      (so t >= f + 3);
//   f. average volume of sessions t-9..t >= 1.0 x the average volume of sessions t-29..t-10.
// TRADE: BUY the open of t+1 (valid that session only: no open = no trade). STOP = the low of t: a session that OPENS at or under the stop
//   sells at that open (on the entry session too: gross 0), otherwise a session whose low reaches the stop sells at the stop. EXIT at the
//   next open after a close below the 10-session average close (the last 10 closes incl. that day); else at the close of the 120th session
//   (max hold 120 counting the entry session). A stock that stops trading: its last close. One open trade per stock. A trade whose path
//   (t-29 to the exit) holds a whole-ratio 3x-50x one-day jump (an unadjusted split in the data) is left out (squad 4 / 6 convention).
// MATERIALITY (contract value >= 10% of revenue) is NOT a condition: the reviewer wanted it from data/chain-graph.json, but that graph covers
//   only ~47 big buyers chosen with today's knowledge (survivorship). Reported as INFORMATION only: trades whose sentence names exactly one
//   dollar amount (100k USD+, not a per-share / per-unit price) compared with the company's latest yearly revenue public on the signal day
//   (SEC XBRL frames, 100 days after the year end: quality.mjs's fund cache).
// JUDGED (the system's standard, never lowered): whole market 5 years incl. dead stocks; entry next open; 0.8% round trip (1.2% stress);
//   halves = signal before / from 2024-01-01; value-core judge via hold-core judgeHold: in BOTH halves > 0 after 0.8% and 1.2%, better than
//   the average liquid stock (close 5+, 5M USD+ a day; every second one) over the same sessions, better than the same stock on its other days
//   (windows of the same length), > 0 without its 2 best trades, 20+ trades and 3+ blocks, block t >= 2.5 (blocks of 21 sessions: the exits
//   vary, the max is 120) -> TRADABLE SMALL (>= the proof bar -> PROVEN); return per year of capital tied up above SPY on the same days;
//   AND (the reviewer's yardstick, an extra gate) better than SAME-VOLATILITY stocks WITHOUT a fresh 8-K 1.01: on t, the rule-universe stocks
//   (close 2+, 2M USD+ a day) in the same decile of 20-session volatility (stdev of daily log returns t-19..t) with no Item 1.01 8-K filed in
//   sessions t-10..t, bought and sold over the trade's own sessions (20+ stocks needed). Every gross return, the rule's and every
//   yardstick's, capped at +300% (AUD-1). Also reported: signals per calendar month.
//
// ================= RULE 2: V15-NO35 (FORWARD ONLY; registered 25 Oct 2026; NEVER backtested) ==============================================
// 'V15 F-score uptrend without SIC 35/36/38'. The sector exclusion was chosen BECAUSE machinery / electronics / instruments lost in V15's own
// older-half results (quality.mjs v15 deep check, 20 Oct): a test on the same 5 years cannot validate it (fitted to the result). It is
// therefore judged on UNSEEN data only: from 27 Oct 2026 the lab records, on paper, V15's live pick list (data/quality.json fscoreUpToday:
// F-score 8-9 and close above its own 200-day average, as quality.mjs publishes it and LONGER HOLDS shows it) at a formation on 27 Oct 2026
// and then on the first session of every calendar month, in two versions side by side: V15-REF (every pick, the unchanged rule, reference
// only) and V15-NO35 (picks whose SEC SIC code, read from the SEC submissions file of the pick's CIK, does not start with 35, 36 or 38; a
// pick without an SEC SIC stays in). Each pick is bought at the open of the session after the formation and sold at the close of the 126th
// session (V15's 6-month hold). Result rows carry what the comeback board needs: rule id, signal date (after frozenAt), buy / sell dates,
// gross, net after 0.8%, the average stock and SPY over the same sessions. Judged later by comeback-core (COMEBACK-1) on the forward record
// alone (blocks of 21 sessions = one formation a month). V15-REF has no frozen entry (V15 is already live as LONGER HOLDS): it is a
// side-by-side reference, never a TRY SMALL candidate of this lab.
//
// NOT TESTED (no data): DEC-CONTRACT-10D-WIDE needs a history of capital-spending headlines and Asian supplier exposure; Asian listings
//   are outside the US price data.
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', CAP = 3, YEAR = 252;
export const V15_START = '2026-10-27', V15_FROZEN_AT = '2026-10-26T00:00:00.000Z', V15_HOLD = 126, V15_BLOCK = 21;
export const TH = { minClose: 2, minDv: 2e6, fromS: 1, toS: 10, shareUp: 0.05, shareDays: 90, shareLag: 30, dilSess: 20, jump: 0.15, jumpSess: 21, lowSess: 3,
  volNew: 10, volOld: 20, volRatio: 1.0, maxHold: 120, sma: 10, block: 21, ctlFresh: 10, ctlMin: 20, deciles: 10, volLook: 20, material: 0.10 };
const P = (cite, url) => ({ cite, url });
export const RULES = {
  'SQ21-CONTRACT10D': { kind: 'buy', family: 'event', hold: TH.maxHold, block: TH.block, name: 'Fresh 8-K 1.01 contract with a named counterparty, quiet clean base 1-10 sessions later; stop the signal low, exit under the 10-day average',
    papers: [P('Outside reviewer to the owner, 25 Oct 2026 (rule text as given)', null), P('Lerman & Livnat (2010) The new Form 8-K disclosures, Review of Accounting Studies 15(4) (8-K items incl. 1.01 carry news on filing)', null)],
    reported: 'Lerman & Livnat (2010): the new 8-K items, incl. 1.01, move prices and volume on filing; no published drift result for this exact setup (the reviewer\'s design)',
    rule: 'see squad21-core.mjs header RULE 1 (the exact text, pre-registered 25 Oct 2026 before any result)',
    lib: 'DEC2-CONTRACT (1.01 + small cap + +4% on 2x volume: rejected), C-QK1 (1.01 then 3 quiet days: rejected), E15 (Friday-evening 1.01: queued), C-CT1 (contract size vs company: pre-registered). New here: a named counterparty in the text, a clean supply filter (no share growth, no shelf / S-1 / 3.02), NO prior +15% day, a higher-low base 3+ sessions after the filing on rising volume, a 10-day-average exit, 120-session max.' },
  'V15-NO35': { kind: 'forward', family: 'forward-only', hold: V15_HOLD, block: V15_BLOCK, name: 'V15 F-score uptrend without SIC 35/36/38 (forward paper only, never backtested)',
    papers: [P('Piotroski (2000) Value Investing: The Use of Historical Financial Statement Information to Separate Winners from Losers, Journal of Accounting Research 38', 'https://doi.org/10.2307/2672906')],
    reported: 'the sector cut was chosen from V15\'s own older-half shortfall (94% from SIC 35/36/38): a backtest on the same data cannot validate it',
    rule: 'see squad21-core.mjs header RULE 2: V15\'s live picks (data/quality.json fscoreUpToday) recorded on paper from 27 Oct 2026 at a formation that day and on the first session of each month, minus SEC SIC 35xx / 36xx / 38xx; buy next open, hold 126 sessions; judged only by the comeback board on the forward record.',
    lib: 'V15 (F-score uptrend: tradable small, LONGER HOLDS). The sector-excluded version was never run and is never backtested here.' },
};
export const IDS = Object.keys(RULES), TEST_IDS = ['SQ21-CONTRACT10D'];
export const NOT_TESTED = { id: 'DEC-CONTRACT-10D-WIDE', name: 'Contract filing within 10 days, widened by capital-spending headlines and Asian supplier exposure',
  why: 'not tested: needs a history of capital-spending headlines and Asian supplier exposure data; Asian listings are outside the US price data' };

// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), isoMs = (x) => new Date(x).toISOString().slice(0, 10);
export const addDays = (d, n) => isoMs(ms(d) + n * DAY);
// first index of sorted dates D on or after d (D.length if none)
export function firstOnOrAfter(D, d) { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; }

// ---------------- EDGAR full-text search ----------------
// answer -> compact hits [id (adsh:file), adsh, cik, fileDate, items[], fileType, form, tickers[]]
export function eftsHits(j) { const out = []; for (const h of (j && j.hits && j.hits.hits) || []) { const s = h._source || {}, tk = [];
    for (const dn of s.display_names || []) { const m = String(dn).match(/\(([A-Z0-9.,\s-]+)\)\s+\(CIK/); if (m) tk.push(...m[1].split(',').map(x => x.trim()).filter(Boolean)); }
    out.push([h._id, s.adsh, +((s.ciks || [])[0] || 0), s.file_date, (s.items || []).map(String), String(s.file_type || ''), String(s.form || (s.root_forms || [])[0] || ''), tk]); } return out; }
// is this hit the MAIN document of a plain 8-K (not an exhibit, not an amendment)?
export function mainDoc(h) { const file = String(h[0] || '').split(':')[1] || '', ft = h[5], form = h[6];
  if (form && form !== '8-K') return false; if (ft) return /^8-K$/i.test(ft); return !/(^|[^a-z])ex-?\d|exhibit|ex\d{2,}/i.test(file); }
export const hasItem = (h, it) => (h[4] || []).some(x => String(x).trim() === it);

// ---------------- the text test: phrase + named counterparty ----------------
const STOP_FIRST = new Set(['company', 'companies', 'purchaser', 'purchasers', 'buyer', 'buyers', 'seller', 'sellers', 'lender', 'lenders', 'investor', 'investors', 'holder', 'holders',
  'agent', 'agents', 'administrative', 'collateral', 'trustee', 'trustees', 'borrower', 'borrowers', 'parent', 'merger', 'executive', 'executives', 'employee', 'employees', 'underwriter',
  'underwriters', 'placement', 'representative', 'representatives', 'subscriber', 'subscribers', 'selling', 'sponsor', 'guarantor', 'guarantors', 'issuer', 'certain', 'each', 'such', 'its', 'our',
  'their', 'his', 'her', 'mr', 'ms', 'mrs', 'dr', 'one', 'two', 'three', 'several', 'various', 'all', 'any', 'this', 'that', 'these', 'those', 'we', 'us', 'registrant', 'item', 'section',
  'party', 'parties', 'counterparty', 'counterparties', 'customer', 'customers', 'supplier', 'suppliers', 'vendor', 'vendors', 'licensee', 'licensor', 'landlord', 'tenant', 'members', 'member',
  'shareholders', 'stockholders', 'stockholder', 'shareholder', 'directors', 'officers', 'officer', 'director', 'affiliates', 'affiliate', 'subsidiary', 'subsidiaries', 'january', 'february',
  'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'respect', 'regard', 'effect', 'reference', 'exhibit', 'annex', 'schedule', 'note', 'notes',
  'a', 'an', 'no', 'none', 'other', 'others', 'new', 'existing', 'former', 'current', 'prospective', 'potential', 'major', 'leading', 'large']);
const PERSONAL = /\b(employment|separation|severance|retention|consulting|consultancy|indemnification|indemnity|transition|offer|change[\s-]+(?:in|of)[\s-]+control)\b/i;
const CONNECT = new Set(['of', 'and', '&', 'de', 'du', 'la', 'le', 'for', 'the', 'und', 'y', 'des', 'del', 'van', 'von', 'on']);
const PHRASES = [{ name: 'purchase order from', re: /\bpurchase\s+orders?\s*(\([^()]{0,80}\)\s*)?,?\s*from\s+/gi }, { name: 'order from', re: /\borders?\s*(\([^()]{0,80}\)\s*)?,?\s*from\s+/gi },
  { name: 'agreement with', re: /\bagreements?\s*(\([^()]{0,80}\)\s*)?,?\s*with\s+/gi }, { name: 'contract with', re: /\bcontracts?\s*(\([^()]{0,80}\)\s*)?,?\s*with\s+/gi }];
// the capitalised name right after position `at` in text -> { name, the } or null
export function namedAfter(text, at) { const rest = String(text).slice(at, at + 220), toks = rest.split(/\s+/).filter(Boolean); let i = 0, the = false;
  if (toks[0] && /^the$/i.test(toks[0])) { the = true; i = 1; }
  const run = []; for (; i < toks.length && run.length < 10; i++) { let w = toks[i]; if (/^[("“"']/.test(w)) break; const end = /[,;:)"”]$|\.$/.test(w) && !/^([A-Z]\.)+$|^(Inc|Corp|Co|Ltd|L\.P|N\.A|S\.A|N\.V|B\.V|U\.S|Jr|Sr|Mr|Ms|Mrs|Dr|No|St)\.$/i.test(w);
    w = w.replace(/[,;:)"”]+$/, ''); if (end && /\.$/.test(w) && !/^([A-Z]\.)+$|^(Inc|Corp|Co|Ltd|L\.P|N\.A|S\.A|N\.V|B\.V|U\.S)\.$/i.test(w)) w = w.slice(0, -1); const bare = w.replace(/\.$/, '');
    if (!run.length) { if (!/^[A-Z0-9]/.test(bare)) break; } else if (!/^[A-Z0-9&]/.test(bare) && !CONNECT.has(bare.toLowerCase())) break;
    run.push(w); if (end) break; }
  while (run.length && CONNECT.has(run[run.length - 1].replace(/\.$/, '').toLowerCase())) run.pop();
  if (!run.length) return null; const first = run[0].replace(/[^A-Za-z]/g, '').toLowerCase();
  if (STOP_FIRST.has(first) && !/^([A-Z]\.)+$/.test(run[0])) return null; if (/^(mr|ms|mrs|dr|miss|prof)\.?$/i.test(run[0])) return null;
  if (the && run.length === 1 && !/^[A-Z]{2,}[0-9]*$/.test(run[0].replace(/[^A-Za-z0-9]/g, ''))) return null;   // 'the Customer': a defined term (an acronym such as 'the NIH' stays)
  if (/^\d/.test(run[0]) && run.length === 1) return null;
  return { name: run.join(' '), the }; }
// the first phrase match with a named counterparty -> { phrase, counterparty, sentence, at } or null
export function contractMatch(text) { const t = String(text || ''); let best = null;
  for (const P0 of PHRASES) { P0.re.lastIndex = 0; let m; while ((m = P0.re.exec(t))) { const before = t.slice(Math.max(0, m.index - 80), m.index).split(/\s+/).slice(-4).join(' ');
      if (PERSONAL.test(before + ' ' + m[0])) continue; const n = namedAfter(t, m.index + m[0].length); if (!n) continue;
      if (!best || m.index < best.at) best = { phrase: /purchase\s+order/i.test(m[0]) ? 'purchase order from' : P0.name, counterparty: n.name, at: m.index, sentence: sentenceAt(t, m.index) }; break; } }
  return best; }
const ABBR = /(?:^|\s)(?:Inc|Corp|Co|Ltd|L\.P|LP|LLC|N\.A|S\.A|N\.V|B\.V|U\.S|U\.K|Jr|Sr|Mr|Ms|Mrs|Dr|No|St|Nos|approx|e\.g|i\.e|[A-Z])\.$/;
// the sentence around position `at` (a stop . ; ! ? followed by a space and a capital / digit / quote ends it, not after Inc. / U.S. / Mr. ...)
function sentenceAt(t, at) { const isEnd = (i) => /[.;!?]/.test(t[i]) && /\s/.test(t[i + 1] || '') && /[A-Z0-9"“(]/.test(t[i + 2] || '') && !(t[i] === '.' && ABBR.test(t.slice(Math.max(0, i - 8), i + 1)));
  let a = at; while (a > 0 && at - a < 800 && !isEnd(a - 1)) a--; let b = at; while (b < t.length - 1 && b - at < 800 && !isEnd(b)) b++; return t.slice(a, b + 1).trim(); }
export function html2text(h) { return String(h || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
  .replace(/&#8217;|&rsquo;/gi, '\'').replace(/&#8220;|&#8221;|&ldquo;|&rdquo;/gi, '"').replace(/&#821[12];|&ndash;|&mdash;/gi, '-').replace(/&#36;/g, '$').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim(); }
// a RELIABLE dollar value in the sentence: exactly one distinct amount of 100k USD+, not a per-share / per-unit price -> number or null
export function dollarValue(sentence) { const s = String(sentence || ''), v = new Set();
  for (const m of s.matchAll(/\$\s?(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(?:\s*(billion|million|bn|mm|m)\b)?(\s+per\b)?/gi)) { if (m[3]) return null; const n = +m[1].replace(/,/g, ''), u = (m[2] || '').toLowerCase();
    const x = u === 'billion' || u === 'bn' ? n * 1e9 : u === 'million' || u === 'mm' || u === 'm' ? n * 1e6 : n; if (x >= 1e5) v.add(Math.round(x)); }
  return v.size === 1 ? [...v][0] : null; }

// ---------------- prices: the signal test and the exit ----------------
// S = { o, h, l, c, v } arrays (NaN = no bar); dv20(t) = 20-session average traded value or NaN; f = filing session.
// x = { sharesUp(t) -> fraction or null, diluted(t) -> bool } (both point in time). -> the first signal session t or -1
export function priceOk(S, t, f, dv20) { const { h, l, c, v } = S; if (t - f < TH.fromS || t - f > TH.toS || t < 30) return false;
  if (!(c[t] >= TH.minClose) || !(dv20 >= TH.minDv)) return false;
  for (let k = t - TH.jumpSess + 1; k <= t; k++) { if (!(c[k] > 0) || !(c[k - 1] > 0)) return false; if (c[k] / c[k - 1] - 1 >= TH.jump) return false; }
  if (t - TH.lowSess < f) return false; let lo3 = Infinity, loF = Infinity;
  for (let k = t - TH.lowSess + 1; k <= t; k++) { if (!(l[k] > 0)) return false; lo3 = Math.min(lo3, l[k]); } for (let k = f; k <= t - TH.lowSess; k++) { if (!(l[k] > 0)) return false; loF = Math.min(loF, l[k]); }
  if (lo3 < loF) return false;
  let a = 0, b = 0; for (let k = t - TH.volNew + 1; k <= t; k++) { if (!(v[k] >= 0)) return false; a += v[k]; } for (let k = t - TH.volNew - TH.volOld + 1; k <= t - TH.volNew; k++) { if (!(v[k] >= 0)) return false; b += v[k]; }
  return b > 0 && a / TH.volNew >= TH.volRatio * (b / TH.volOld); }
export function signalSession(S, f, dv20Of, x) { for (let t = f + TH.fromS; t <= f + TH.toS && t < S.c.length; t++) {
    if (!priceOk(S, t, f, dv20Of(t))) continue; const up = x.sharesUp(t); if (up === null || !(up < TH.shareUp)) continue; if (x.diluted(t)) continue; return t; } return -1; }
// share count growth: now = count known on d (lag days late), then = count known 90 days earlier -> fraction or null
export function sharesUp(series, d, { days = TH.shareDays, lag = TH.shareLag } = {}) { const at = (x) => { const lim = addDays(x, -lag); let v = null; for (const [e, n] of series || []) if (e <= lim) v = n; return v; };
  const a = at(d), b = at(addDays(d, -days)); return a > 0 && b > 0 ? a / b - 1 : null; }
// any dilution filing (dates) with its session in t-19..t; sessOf(date) -> session index
export function dilutedAt(dates, t, sessOf, n = TH.dilSess) { for (const d of dates || []) { const s = sessOf(d); if (s >= t - n + 1 && s <= t) return true; } return false; }
// the exit of a trade bought at the open of k with stop `stop`; T = sessions in the data. -> { x (exit session), px, kind: stop|ma|max|gone,
// at: 'o'|'s'|'c', held (sessions), lastClose (the session of the last close held, for the yardsticks) } or { open: true, mark, k } when the data
// ends first. A session without a bar is skipped; a stock with no bar for its last 6+ sessions of the data: sold at its last close.
export function exitOf(S, k, stop, T = S.c.length, maxHold = TH.maxHold) { const { o, l, c } = S, e = o[k]; if (!(e > 0)) return null;
  let last = -1; for (let q = T - 1; q >= 0; q--) if (c[q] > 0) { last = q; break; } const gone = last < T - 6;
  if (e <= stop) return { x: k, px: e, kind: 'stop', at: 'o', held: 1, lastClose: k };
  const closes = []; for (let q = Math.max(0, k - 30); q < k; q++) if (c[q] > 0) closes.push(c[q]);
  let pending = false, lastQ = k;
  for (let q = k; q <= k + maxHold - 1; q++) { if (q >= T) return { open: true, k, mark: c[lastQ] > 0 ? c[lastQ] / e - 1 : null, lastQ };
    if (gone && q > last) return { x: last, px: c[last], kind: 'gone', at: 'c', held: last - k + 1, lastClose: last };
    if (!(o[q] > 0) && !(c[q] > 0)) continue;
    if (pending && o[q] > 0) return { x: q, px: o[q], kind: 'ma', at: 'o', held: q - k, lastClose: lastQ };
    if (q > k && o[q] > 0 && o[q] <= stop) return { x: q, px: o[q], kind: 'stop', at: 'o', held: q - k, lastClose: lastQ };
    if (l[q] > 0 && l[q] <= stop) return { x: q, px: stop, kind: 'stop', at: 's', held: q - k + 1, lastClose: q };
    if (!(c[q] > 0)) continue; lastQ = q; closes.push(c[q]);
    if (q === k + maxHold - 1) return { x: q, px: c[q], kind: 'max', at: 'c', held: maxHold, lastClose: q };
    if (closes.length >= TH.sma) { const w = closes.slice(-TH.sma), m = w.reduce((a, b) => a + b, 0) / TH.sma; if (c[q] < m) pending = true; } }
  return { open: true, k, mark: c[lastQ] > 0 ? c[lastQ] / e - 1 : null, lastQ }; }
// 20-session volatility: stdev of daily log returns t-19..t (20 returns, all present) or null
export function vol20(c, t, n = TH.volLook) { if (t - n < 0) return null; const r = []; for (let k = t - n + 1; k <= t; k++) { if (!(c[k] > 0) || !(c[k - 1] > 0)) return null; r.push(Math.log(c[k] / c[k - 1])); }
  const m = mean(r); return Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)); }
// decile (0..9) of each value among rows [{ key, v }] -> Map key -> decile
export function deciles(rows, n = TH.deciles) { const a = rows.filter(r => ok(r.v)).sort((x, y) => x.v - y.v), out = new Map(); a.forEach((r, j) => out.set(r.key, Math.min(n - 1, Math.floor(j * n / a.length)))); return out; }

// ---------------- reporting ----------------
// signals per calendar month over [from, to] (inclusive months) -> { months, mean, median, min, max, zeroMonths, byMonth }
export function perMonth(dates, from, to) { const by = {}; for (let y = +from.slice(0, 4), m = +from.slice(5, 7); y * 12 + m <= +to.slice(0, 4) * 12 + +to.slice(5, 7); m === 12 ? (y++, m = 1) : m++) by[y + '-' + String(m).padStart(2, '0')] = 0;
  for (const d of dates) { const k = d.slice(0, 7); if (k in by) by[k]++; } const v = Object.values(by);
  return { months: v.length, mean: r4(mean(v)), median: median(v), min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null, zeroMonths: v.filter(x => x === 0).length, byMonth: by }; }
// per year of capital tied up: sum of (key - cost) over the sum of years held (days = sessions held)
export function perYear(rows, key = 'g', cost = COST) { const v = rows.filter(z => ok(z[key]) && z.days > 0); const y = v.reduce((a, z) => a + z.days / YEAR, 0); return v.length && y > 0 ? v.reduce((a, z) => a + z[key] - cost, 0) / y : null; }
export function byYear(rows, yearOf) { const by = {}; for (const z of rows) { const y = yearOf(z); (by[y] = by[y] || []).push(z); }
  return Object.fromEntries(Object.keys(by).sort().map(y => [y, { n: by[y].length, avg: r4(mean(by[y].map(z => z.g - COST))), perYear: r4(perYear(by[y])), spyPerYear: r4(perYear(by[y], 'spy', 0)) }])); }
export function shapeOf(tr) { const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0), kinds = {};
  for (const z of tr) kinds[z.kind] = (kinds[z.kind] || 0) + 1;
  return { trades: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, pf: l.length && sum(l) < 0 ? r4(sum(w) / -sum(l)) : null,
    avgHeld: r4(mean(tr.map(z => z.days))), exits: kinds }; }
export function boardStats(rows) { const net = rows.map(r => capG(r.g) - COST), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(net.filter(x => x > 0).length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => capG(r.g) - r.c))) : null,
    perYear: r4(perYear(rows.map(r => ({ g: capG(r.g), days: r.days })))), spyPerYear: r4(perYear(rows.filter(r => ok(r.spy)).map(r => ({ g: r.spy, days: r.days })), 'g', 0)) }; }

// ---------------- V15 forward lane ----------------
export const sic35 = (sic) => /^3[568]\d\d$/.test(String(sic ?? '').trim().padStart(4, '0'));
// the formation key due at session date d (null = none): '2026-10' from 27 Oct 2026 (the start), then one per calendar month
export function v15Key(d, done) { if (!d || d < V15_START) return null; const k = d.slice(0, 7); return done.has(k) ? null : k; }
// the two versions of one formation -> { ref: [sym], no35: [sym] }; sicOf(sym) -> SIC string or null
export function v15Split(picks, sicOf) { const ref = [], no35 = []; for (const p of picks || []) { const s = p && p.sym; if (!s || ref.includes(s)) continue; ref.push(s); if (!sic35(sicOf(s))) no35.push(s); } return { ref, no35 }; }

// ---------------- library (before any run; idempotent, append only) ----------------
export function preRegister(LB, date = '2026-10-25') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  const add = (e) => { if (LB.strategies.some(x => x.id === e.id)) return; LB.strategies.push(e); ch++; };
  add({ id: 'SQ21-CONTRACT10D', family: 'Squad 21 (outside reviewer rules)', name: RULES['SQ21-CONTRACT10D'].name, agent: 'squad21', kind: 'buy', hold: TH.maxHold,
    explain: 'RULE (squad21-core.mjs header RULE 1, exact): an 8-K listing Item 1.01 filed 1-10 sessions before the signal session whose main document says agreement with / contract with / order from / purchase order from followed by a NAMED counterparty; close 2 USD+, 20-day average traded value 2M USD+; SEC share count up < 5% in 90 days (30-day reporting lag); no 424B5 / S-1 / 8-K Item 3.02 by the same CIK in the prior 20 sessions; NO close-to-close +15% day in the prior 21 sessions; since the filing no lower low in the last 3 sessions; average volume t-9..t >= 1.0x t-29..t-10. Buy the next open (valid 1 session); stop = the signal-day low; exit at the next open after a close below the 10-day average; max hold 120 sessions. Materiality (contract >= 10% of revenue) NOT a condition (data/chain-graph.json covers ~47 big buyers chosen with today\'s knowledge: survivorship); reported as information only where one dollar value parses reliably. Yardsticks: the average stock on the same days; same-volatility stocks without a fresh 8-K 1.01 (an extra gate); the same stock on other days; per year vs SPY. Signals per month reported.',
    status: 'pre-registered ' + date + ' (squad 21 lab); 5-year one-shot pending', libraryCheck: RULES['SQ21-CONTRACT10D'].lib, sources: ['https://efts.sec.gov/LATEST/search-index', 'https://www.sec.gov/Archives/edgar/full-index/'],
    note: 'Sent by the owner\'s outside reviewer, 25 Oct 2026. Pre-registered BEFORE any run (one version); run ONCE by squad21-lab.mjs, first complete verdict frozen in data/squad21-lab.json firstRun; forward paper lane (data/squad21-paper.jsonl) from 26 Oct 2026.' });
  add({ id: 'V15-NO35', family: 'Squad 21 (outside reviewer rules)', name: RULES['V15-NO35'].name, agent: 'squad21', kind: 'forward-only', hold: V15_HOLD,
    explain: 'V15 (F-score 8-9 above its 200-day average) WITHOUT SEC SIC 35xx / 36xx / 38xx. FORWARD ONLY: the exclusion was chosen because those sectors lost in V15\'s own older-half results, so a historical test on the same 5 years cannot validate it (fitted to the result) and none is run. From 27 Oct 2026 the squad 21 lab records V15\'s live picks (data/quality.json fscoreUpToday) on paper at a formation that day and on the first session of each month, with (V15-REF) and without (V15-NO35) SIC 35/36/38 side by side (data/squad21-paper.jsonl, data/squad21-board.json); buy next open, hold 126 sessions; the comeback board (COMEBACK-1) judges V15-NO35 on that unseen record only.',
    status: 'forward paper only from 27 Oct 2026 (registered ' + date + '; never backtested)', libraryCheck: RULES['V15-NO35'].lib, sources: [],
    note: 'Outside reviewer, 25 Oct 2026. Not a backtest result and never one: the first possible judgement needs 30+ resolved forward trades on 10+ monthly formation days (the 10th monthly formation is in July 2027; its 126-session hold resolves around January 2028).' });
  add({ id: NOT_TESTED.id, family: 'Squad 21 (outside reviewer rules)', name: NOT_TESTED.name, agent: 'squad21', kind: 'buy', status: 'not tested: needs data', explain: NOT_TESTED.why + '.', sources: [],
    note: 'Outside reviewer, 25 Oct 2026; listed so it is not lost. Needs: a dated history of capital-spending headlines and a supplier-exposure map to Asian companies (and their prices, which the US data does not hold).' });
  if (ch) LB.updated = date; return ch; }
