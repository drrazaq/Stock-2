// SQUAD 24 CORE (27 Oct 2026; Stock-2): "a small company announces a deal with a giant". Pure functions, no network, no files. Used by
// squad24-lab.mjs and test/squad24-core.test.mjs. Long only; no leverage; no shorting; never places an order; never gives a halal ruling.
//
// WHY: the owner made +93% in one day ~2 years ago on a small company that announced a deal with a big company (possibly SoundHound / SOUN,
// Feb 2024, when Nvidia's 13F showed a stake; unconfirmed). ALREADY TESTED AND REJECTED (not repeated): SQ21-CONTRACT10D (any named
// counterparty in an 8-K 1.01, bought 1-10 sessions later: -1.5% a trade, n ~1,860; the contracts >= 10% of revenue subset also lost),
// DEC2-CONTRACT, CAT-HUNTER-SUB5 (squad 19), same-day jump chasing (squad 19). NEW HERE: the counterparty must be one of the 100 largest
// US-listed companies (a frozen list), the deal must state a dollar value that is LARGE against the small company (>= 20% of its market
// value), the stock must have been quiet before (no 15% day in 21 sessions), and the buy is the open AFTER the reaction session (no chasing
// inside the jump). Squad 1 / 21 pipeline reused: EDGAR full-text search, companies by the filing's own CIK and the SEC Form 3/4/5
// point-in-time ticker spans (never today's ticker list alone).
//
// TASK A (CASE STUDIES, information only, no verdict): SOUN around 14-16 Feb 2024 (Nvidia 13F), Electrovaya ELVA + Amazon (15 Jul 2026,
// GlobeNewswire 15:51 New York, Form 6-K: Electrovaya is a foreign private issuer, so NOT an 8-K and outside the rule), TeraWulf WULF +
// Google (8-K, Aug 2025). For each: SEC acceptance time, prices and volume before, first realistic entry (next minute after public / next
// open), what was left of the move, the next 1-10 sessions. Alpaca SIP minute bars where they exist. -> data/squad24-cases.json
//
// ================= RULE: SQ24-MEGADEAL (PRE-REGISTERED 27 Oct 2026 BEFORE ANY RESULT; one version; run ONCE under the full standard) ======
// MEGA-CAP LIST (frozen BEFORE the run): data/squad24-megacaps.json = for every quarter start from 2021-10-01 to 2026-10-01 the 100 largest
//   US-listed companies by market value on the first session of that quarter (common stock and ADRs; ETFs / funds left out; one entry per
//   company: share classes merged by CIK), market value from Massive ticker details on that date (point in time), else close x the SEC
//   share count known 30 days earlier. Each company: CIK, legal name, up to 2 ALIASES written by hand before the run. Non-listed namesakes
//   (OpenAI, Anthropic, xAI, Samsung, Bosch, Huawei, ByteDance, TikTok, Starlink, Waymo ...) are NOT in the list; SpaceX is in it only from
//   the quarter after its own US listing (2026-07-01), never before. Known gap: Berkshire Hathaway (BRK.A / BRK.B: dotted tickers are not
//   in the price cache) is missing. The file's SHA-256
//   is MEGACAP_SHA below; the lab refuses to run on any other file.
// EVENT: an SEC 8-K (form exactly 8-K, no amendments) whose items list Item 1.01, filed 2021-11-15 .. today, found by EDGAR full-text search
//   of each alias (forms 8-K, case-insensitive search, then the exact test below on the document text). The filer (CIK) is not itself on any
//   quarter's list. COUNTERPARTY TEST (exact, case-sensitive; the alias as written or in CAPITALS): in a document of the filing (the main
//   8-K, an EX-99.x or an EX-10.x) an alias of a company on the list of the latest quarter start on or before the filing date appears
//   (a) as a whole word (no letter or digit right before or after; a possessive 's is allowed), (b) followed only by an optional corporate
//   form (Inc / Incorporated / Corp / Corporation / Co / Company / LLC / L.L.C. / Ltd / Limited / plc / p.l.c. / N.V. / S.A. / SE / AG /
//   L.P. / LP / A/S / ASA / S.p.A. / GmbH / AB / Oyj / K.K. / Pty, up to two, commas allowed) and then by NO further capitalised name word: the next word must be lower case, a connector (and / or / of
//   / the / to / for / by / in / with / as / on / under / pursuant / dated / which / that / its), a bracket or quote, punctuation, or the
//   end ("Amazon Web Services" fails for the alias "Amazon.com"; "Microsoft Ireland Operations Limited" fails; "NVIDIA Corporation (" and
//   "Google LLC," pass), (c) inside a sentence that holds a deal word: agreement / contract / order / supply / licen(s|c)e / collaborat /
//   partnership / statement of work / warrant, and (d) that sentence is NOT a financing sentence (credit agreement / credit facility / loan
//   agreement / loan and security / term loan / revolving / indenture / underwriting / underwriter(s) / sales agent / equity distribution /
//   at-the-market / administrative agent / collateral agent / lender(s)): a giant's bank lending to the company is not a deal with a giant.
// FILING SESSION f (sec-time.mjs, New York clock, from the SEC ACCEPTANCE-DATETIME of the filing's header, Eastern time): accepted before
//   09:30 -> that day's session; 09:30-15:59 -> that day's session; 16:00 or later (or a non-trading day) -> the next session.
// FILTERS at the close of f: close 1-10 USD; 20-session average traded value (close x volume, sessions f-19..f) >= 0.5M USD (dead stocks
//   included: the whole-market cache with the under-3-USD rows); NO close-to-close move of 15%+ UP OR DOWN on any of the 21 sessions
//   f-21..f-1 (the reaction session f itself may move); NO reverse split (data/splits.json, ratio < 1, by the point-in-time ticker) dated
//   in the 60 calendar days ending D[f]; NO Form 424B5 / S-1 / S-1/A / S-3 / S-3/A (EDGAR quarterly master index, by CIK) filed in the
//   20 sessions f-19..f.
// SIZE: the filing must state a dollar value: the LARGEST dollar amount (USD; $ or US$; units thousand / million / billion; 100k USD+;
//   amounts followed by 'per' (per share / unit / hour ...) and amounts in TRILLIONS (market-size talk) ignored) in the main 8-K + every
//   EX-99.x + every EX-10.x document (HTML / text, first 3 MB each) must be >= 20% of the filer's market value at the close of f
//   (close x the share count known 30 days earlier: the SEC share series data/shares.json.gz of the CIK, latest entry dated on or before
//   D[f] - 30 days and not older than 400 days; else Massive ticker details on D[f] - 30 days (weighted / share-class shares); else out).
// TRADE: BUY the open of f+1 (valid that session only: no open = no trade). STOP 25% under the entry: a session that OPENS at or under
//   the stop sells at that open, else a session whose low reaches the stop sells at the stop. Else SELL at the close of the 10th session
//   (the entry session is session 1). A stock that stops trading: its last close. One open trade per stock. A trade whose path (f-21 to
//   the exit) holds a whole-ratio 3x-50x one-day jump (an unadjusted split) is left out (squad 4 / 6 / 21 convention).
// COSTS: 0.8% a round trip (1.2% stress) AND a SLIPPAGE version for small caps: entry x 1.02, exit x 0.98, then 0.8%.
// JUDGED (the system's standard, never lowered): whole market 5 years; halves = signal (f) before / from 2024-01-01; value-core judge via
//   hold-core judgeHold, blocks of 10 sessions: in BOTH halves > 0 after 0.8% and 1.2%, better than THE AVERAGE 1-10 USD STOCK on the same
//   sessions (close 1-10 USD and 20-day traded value >= 0.5M USD on f, bought at the open of f+1, sold at the close of the trade's last
//   session, +300% cap on both: AUD-1), better than the same stock on its other days (windows of the same length, same half), > 0 without
//   its 2 best trades, 20+ trades and 3+ blocks a half, block t >= 2.5, return per year of capital tied up above SPY on the same days;
//   EXTRA GATE: the slippage version > 0 in both halves. Information only: the average LIQUID stock (5 USD+, 5M USD+ a day: the system's
//   usual yardstick) and a FIRST-OPEN variant (buy the first open after the filing became public: the open of f for a filing accepted
//   outside market hours, of f+1 otherwise; same exit length and stop).
// REPORT: case counts per half FIRST; under 20 a half = TOO FEW CASES, said plainly, and EVERY case listed with its result.
//
// ================= ADDENDUM (owner's reviewer, 27 Oct 2026, written WHILE the one-shot was running and BEFORE any of its result was seen) ==
// It changes NOTHING in SQ24-MEGADEAL's entry, exit or verdict. It adds REPORTING (MODE=SIDE, data/squad24-side.json; firstRun untouched):
// H1 deal quality: the rule trades vs (i) the average 1-10 USD stock (the frozen yardstick), (ii) SIZE-MATCHED NO-DEAL stocks: 1-10 USD
//   universe stocks on f whose 20-day traded value is 0.5x-2x the event stock's, with no alias-matched 8-K in sessions f-10..f, bought and
//   sold on the same sessions (20+ needed), (iii) deals that produced NO move (|reaction-session close-to-close| < 5%) vs deals that moved,
//   (iv) the FIRST-OPEN variant (bought before the reaction for filings outside market hours) vs the rule entry (detected only after the
//   reaction). Failed / delisted names stay in (a stock that stops trading is sold at its last close).
// H2 early discoverability (case studies): timeline T-10 / T-5 / T-3 / T-1, earliest verifiable public clue, first formal announcement
//   (SEC acceptance time / wire time, never backdated), first price reaction (first minute >= 5% from the prior close), earliest realistic
//   Stock-2 alert (what its own feeds would have caught), and ONE class of: 1 early and actionable; 2 public evidence existed but Stock-2
//   lacked access; 3 evidence too weak or ambiguous; 4 first actionable evidence too late; 5 no advance public evidence; 6 insufficient data.
// H3 tradable profit: closes 1 / 3 / 5 / 10 sessions after the entry, the max favourable (highest high) and max adverse (lowest low) move
//   over the 10 sessions, with 0.8% / 1.2% costs and 2%-each-way slippage. Options: NO option data is used; no option return is inferred.
// SIDE TESTS (EXPLORATORY ONLY, each alone against the base SQ24-MEGADEAL trades, never stacked, never a verdict, never TRY SMALL):
//   SQ24-SIDE-FIRST: keep a base trade only if the filer had NO earlier 8-K (Item 1.01) since 2020-01-01 naming the SAME mega-cap (same
//     CIK) under the same counterparty test (EDGAR full-text search of the filer's 8-Ks for each alias of that mega-cap, 2020-01-01 to the
//     day before the filing; each hit's submission read and tested).
//   SQ24-SIDE-INSIDER: keep a base trade only if 2+ DIFFERENT insiders (reporting owners) filed Form 4 open-market purchases (code P,
//     acquired) of the filer's stock with Form 4 filing dates in the 10 sessions f-10..f-1 (SEC insider data sets, squad 1's cache).
//   Each reported as n / average after 0.8% / with slippage / edge vs the average 1-10 USD stock, per half, beside the base.
export const COST = 0.008, STRESS = 0.012, SLIP = 0.02, SPLIT = '2024-01-01', PAPER_START = '2026-10-28', CAP = 3, YEAR = 252;
export const EVENT_FROM = '2021-11-15', LIST_FROM = '2021-10-01';
// SHA-256 of data/squad24-megacaps.json (written after the BUILD run, which computes no returns; before the rule run)
export const MEGACAP_SHA = '5530f8200c39cf831750e157cedd32b4f3038b33345a802c152542e5048864da';
export const TH = { minClose: 1, maxClose: 10, minDv: 5e5, dvSess: 20, move: 0.15, moveSess: 21, rsDays: 60, dilSess: 20, sizeMin: 0.20, minUsd: 1e5,
  shareLag: 30, shareMaxAge: 400, hold: 10, stop: 0.25, block: 10, top: 100 };
export const SIDE = { first: 'SQ24-SIDE-FIRST', insider: 'SQ24-SIDE-INSIDER', firstFrom: '2020-01-01', insSess: 10, insMin: 2, noMove: 0.05, dvLo: 0.5, dvHi: 2, ctlMin: 20, react: 0.05 };
export const DIL_FORMS = ['424B5', 'S-1', 'S-1/A', 'S-3', 'S-3/A'];
export const ID = 'SQ24-MEGADEAL';
export const RULES = { [ID]: { kind: 'buy', family: 'event', hold: TH.hold, block: TH.block,
  name: 'Small company (1-10 USD) signs a dollar-stated deal >= 20% of its market value with a top-100 US-listed company (8-K 1.01); buy the open after the reaction session, hold 10, 25% stop',
  rule: 'see squad24-core.mjs header RULE (the exact text, pre-registered 27 Oct 2026 before any result)' } };
export const NOT_LISTED = ['SpaceX before 2026-07-01', 'OpenAI', 'Anthropic', 'xAI', 'Samsung', 'Bosch', 'Huawei', 'ByteDance', 'TikTok', 'Starlink', 'Waymo', 'Stripe', 'Databricks'];

// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), isoMs = (x) => new Date(x).toISOString().slice(0, 10);
export const addDays = (d, n) => isoMs(ms(d) + n * DAY);
export function firstOnOrAfter(D, d) { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; }

// ---------------- the frozen mega-cap list ----------------
// quarter start on or before d ('YYYY-01-01' / -04- / -07- / -10-)
export const quarterOf = (d) => d.slice(0, 5) + String(Math.floor((+d.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, '0') + '-01';
// MC = { quarters: { 'YYYY-MM-01': [cik, ...] }, companies: { cik: { name, aliases: [..] } } } -> the list in force on d (latest quarter <= d)
export function listOn(MC, d) { const qs = Object.keys((MC && MC.quarters) || {}).sort(); let q = null; for (const x of qs) if (x <= d) q = x; return q ? MC.quarters[q] : []; }
export function allCiks(MC) { const s = new Set(); for (const a of Object.values((MC && MC.quarters) || {})) for (const c of a) s.add(String(c)); return s; }
// rank one quarter: rows [{ cik, cap, name, sym }] -> the top n CIKs by cap (one per CIK, the larger cap kept)
export function topByCap(rows, n = TH.top) { const by = new Map(); for (const r of rows) { if (!r || !r.cik || !(r.cap > 0)) continue; const k = String(+r.cik), o = by.get(k); if (!o || r.cap > o.cap) by.set(k, r); }
  return [...by.values()].sort((a, b) => b.cap - a.cap).slice(0, n); }

// ---------------- the counterparty test ----------------
const FORM = String.raw`(?:Inc\.?|Incorporated|Corp\.?|Corporation|Co\.?|Company|LLC|L\.L\.C\.|Ltd\.?|Limited|plc|PLC|p\.l\.c\.|N\.V\.|S\.A\.|SE|AG|L\.P\.|LP|A\/S|ASA|S\.p\.A\.|GmbH|AB|Oyj|K\.K\.|Pty)`;
const FORM_RE = new RegExp('^(?:,?\\s*' + FORM + '(?![A-Za-z0-9])){0,2}', 'i');
const CONNECT = new Set(['and', 'or', 'of', 'the', 'to', 'for', 'by', 'in', 'with', 'as', 'on', 'under', 'pursuant', 'dated', 'which', 'that', 'its', 'a', 'an', 'at', 'from', 'is', 'will', 'has', 'have', 'was', 'were', 'be', 'shall', 'may']);
export const DEAL_RE = /agreement|contract|\border|supply|licen[sc]e|collaborat|partnership|statement of work|warrant/i;
export const FIN_RE = /credit agreement|credit facility|loan agreement|loan and security|term loan|revolving|indenture|underwrit|sales agent|equity distribution|at[- ]the[- ]market|administrative agent|collateral agent|\blenders?\b/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// does the text right after an alias end the name? -> boolean
export function nameEnds(rest) { let r = String(rest || ''); if (/^[A-Za-z0-9]/.test(r)) return false;
  r = r.replace(/^['’]s\b/, ''); const m = FORM_RE.exec(r); if (m) r = r.slice(m[0].length);
  if (/^[A-Za-z0-9]/.test(r)) return false;   // e.g. 'Amazon.comX'
  const mm = /^(\s+)(\S+)/.exec(r); if (!mm) return true;            // end of text or punctuation right after
  if (!/^\s/.test(r)) return true;                                     // punctuation / bracket / quote right after the name (or form)
  const w = mm[2]; if (/^[("“'‘\[,.;:!?\-–—]/.test(w)) return true;
  if (CONNECT.has(w.replace(/[^A-Za-z]/g, '').toLowerCase())) return true;
  return !/^[A-Z]/.test(w); }
const ABBR = /(?:^|\s)(?:Inc|Corp|Co|Ltd|L\.P|LP|LLC|N\.A|S\.A|N\.V|B\.V|U\.S|U\.K|Jr|Sr|Mr|Ms|Mrs|Dr|No|St|Nos|approx|e\.g|i\.e|[A-Z])\.$/;
export function sentenceAt(t, at, len = 0) { const isEnd = (i) => /[.;!?]/.test(t[i]) && /\s/.test(t[i + 1] || '') && /[A-Z0-9"“(]/.test(t[i + 2] || '') && !(t[i] === '.' && ABBR.test(t.slice(Math.max(0, i - 8), i + 1)));
  let a = at; while (a > 0 && at - a < 800 && !isEnd(a - 1)) a--; let b = at + len; while (b < t.length - 1 && b - at < 800 && !isEnd(b)) b++; return t.slice(a, b + 1).trim(); }
// companies: [{ cik, aliases: [...] }] -> the first match in the text { cik, alias, at, sentence } or null (one combined pattern per list)
const MATCHERS = new Map();
function matcherOf(companies) { const key = (companies || []).map(c => c.cik + ':' + (c.aliases || []).join('|')).join(';'); if (MATCHERS.has(key)) return MATCHERS.get(key);
  const forms = new Map(); for (const co of companies || []) for (const al of co.aliases || []) { if (!al) continue; for (const f of [al, al.toUpperCase()]) if (!forms.has(f)) forms.set(f, { cik: String(co.cik), alias: al }); }
  const list = [...forms.keys()].sort((a, b) => b.length - a.length), m = { forms, re: list.length ? new RegExp('(?<![A-Za-z0-9])(?:' + list.map(esc).join('|') + ')', 'g') : null };
  if (MATCHERS.size > 200) MATCHERS.clear(); MATCHERS.set(key, m); return m; }
export function counterpartyMatch(text, companies) { const t = String(text || ''), M = matcherOf(companies); if (!M.re) return null; const re = new RegExp(M.re.source, 'g'); let m;
  while ((m = re.exec(t))) { const form = m[0], end = m.index + form.length, who = M.forms.get(form); if (!who) continue; if (!nameEnds(t.slice(end, end + 80))) continue;
    const s = sentenceAt(t, m.index, form.length); if (!DEAL_RE.test(s) || FIN_RE.test(s)) continue; return { cik: who.cik, alias: who.alias, at: m.index, sentence: s.slice(0, 500) }; }
  return null; }

// ---------------- the dollar value ----------------
const UNIT = { thousand: 1e3, k: 1e3, million: 1e6, mm: 1e6, m: 1e6, mln: 1e6, billion: 1e9, bn: 1e9, b: 1e9 };
// the largest dollar amount (>= 100k USD) not followed by 'per' and not in trillions -> { usd, snippet } or null
export function largestUsd(text) { const t = String(text || ''); let best = null;
  const re = /(?:US\s?)?\$\s?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s*(trillion|billion|million|thousand|bn|mln|mm|tn|m|b|k)\b)?/gi; let m;
  while ((m = re.exec(t))) { const u = (m[2] || '').toLowerCase(); if (u === 'trillion' || u === 'tn') continue;
    const after = t.slice(m.index + m[0].length, m.index + m[0].length + 14); if (/^\s*(?:\)|\.|,)?\s*per\b/i.test(after)) continue;
    const x = +m[1].replace(/,/g, '') * (UNIT[u] || 1); if (!(x >= TH.minUsd) || !isFinite(x)) continue;
    if (!best || x > best.usd) best = { usd: x, snippet: t.slice(Math.max(0, m.index - 160), m.index + m[0].length + 80) }; }
  return best; }

// ---------------- SEC acceptance time -> the filing session ----------------
// 'YYYYMMDDHHMMSS' (Eastern clock, as in the EDGAR header) -> ISO UTC string, using the New York offset of that day
export function etToIso(s, nyParts) { const m = /^(\d{4})(\d\d)(\d\d)(\d\d)(\d\d)(\d\d)?$/.exec(String(s || '').trim()); if (!m) return null; const d = m[1] + '-' + m[2] + '-' + m[3], hm = m[4] + ':' + m[5];
  for (const off of [4, 5]) { const x = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + off, +m[5], +(m[6] || 0)), p = nyParts(x); if (p.d === d && p.hm === hm) return new Date(x).toISOString(); }
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 5, +m[5])).toISOString(); }
// D sorted session dates; x = secNY(...) { d, hm } -> { f, phase } (f = filing session index, D.length if none)
export function filingSession(D, x) { if (!x) return { f: D.length, phase: null }; const ph = !x.hm ? null : x.hm < '09:30' ? 'before' : x.hm < '16:00' ? 'during' : 'after';
  const i = firstOnOrAfter(D, x.d); if (i >= D.length) return { f: D.length, phase: ph };
  if (D[i] !== x.d) return { f: i, phase: ph === 'during' ? 'closed-day' : ph };   // a weekend / holiday: the next session
  return { f: ph === 'after' || ph === null ? i + 1 : i, phase: ph }; }
// the first realistic open after the filing became public (information variant): the open of f when it was public before f opened
export const firstOpenSession = (f, phase) => phase === 'before' || phase === 'after' || phase === 'closed-day' ? f : f + 1;

// ---------------- the filters at the close of f ----------------
// S = { o, h, l, c, v }; dv20 = 20-session average traded value at f. -> null if it passes, else the reason
export function priceFail(S, f, dv20) { const { c } = S; if (f < TH.moveSess + 1) return 'too early';
  if (!(c[f] >= TH.minClose && c[f] <= TH.maxClose)) return 'close'; if (!(dv20 >= TH.minDv)) return 'traded value';
  for (let k = f - TH.moveSess; k <= f - 1; k++) { if (!(c[k] > 0) || !(c[k - 1] > 0)) return 'missing bar'; if (Math.abs(c[k] / c[k - 1] - 1) >= TH.move) return 'prior 15% move'; }
  return null; }
export const reverseSplitNear = (splits, d, days = TH.rsDays) => (splits || []).some(x => x.r > 0 && x.r < 1 && x.d <= d && x.d >= addDays(d, -days));
export function dilutedAt(dates, f, sessOf, n = TH.dilSess) { for (const d of dates || []) { const s = sessOf(d); if (s >= f - n + 1 && s <= f) return true; } return false; }
// share count known on d: SEC series [[date, n]] latest dated <= d - lag and >= d - maxAge -> n or null
export function sharesKnown(series, d, lag = TH.shareLag, maxAge = TH.shareMaxAge) { const lim = addDays(d, -lag), old = addDays(d, -maxAge); let v = null;
  for (const [e, n] of series || []) if (e <= lim && e >= old && n > 0) v = n; return v; }

// ---------------- the trade ----------------
// buy the open of k, stop = entry x 0.75, sell the close of session k + hold - 1. T = sessions in the data.
// -> { x, px, kind: stop|time|gone, held, lastClose } or { open: true } or null (no open at k)
export function exitOf(S, k, T = S.c.length, hold = TH.hold, stopPct = TH.stop) { const { o, l, c } = S, e = o[k]; if (!(e > 0)) return null; const stop = e * (1 - stopPct);
  let last = -1; for (let q = T - 1; q >= 0; q--) if (c[q] > 0) { last = q; break; } const gone = last < T - 6; let lastQ = k;
  for (let q = k; q <= k + hold - 1; q++) { if (q >= T) return { open: true, k, mark: c[lastQ] > 0 ? c[lastQ] / e - 1 : null };
    if (gone && q > last) return { x: last, px: c[last], kind: 'gone', held: Math.max(1, last - k + 1), lastClose: last };
    if (q > k && o[q] > 0 && o[q] <= stop) return { x: q, px: o[q], kind: 'stop', held: q - k + 1, lastClose: q };
    if (l[q] > 0 && l[q] <= stop) return { x: q, px: stop, kind: 'stop', held: q - k + 1, lastClose: q };
    if (c[q] > 0) lastQ = q;
    if (q === k + hold - 1) { if (!(c[q] > 0)) return { x: lastQ, px: c[lastQ], kind: 'time', held: hold, lastClose: lastQ }; return { x: q, px: c[q], kind: 'time', held: hold, lastClose: q }; } }
  return null; }
// H3: closes 1/3/5/10 sessions after entry k (entry = open of k; session 1 = k) + max favourable / adverse over 10 sessions
export function pathStats(S, k, n = 10) { const e = S.o[k]; if (!(e > 0)) return null; const at = (j) => { const q = k + j - 1; return S.c[q] > 0 ? r4(S.c[q] / e - 1) : null; };
  let hi = -Infinity, lo = Infinity; for (let q = k; q < k + n && q < S.c.length; q++) { if (S.h[q] > 0) hi = Math.max(hi, S.h[q]); if (S.l[q] > 0) lo = Math.min(lo, S.l[q]); }
  return { d1: at(1), d3: at(3), d5: at(5), d10: at(10), mfe: isFinite(hi) ? r4(hi / e - 1) : null, mae: isFinite(lo) ? r4(lo / e - 1) : null }; }
// SIDE-INSIDER: purchases [[filingDate, ownerCik]] -> distinct owners with filing session in f-n..f-1
export function insiderCluster(buys, f, sessOf, n = SIDE.insSess) { const o = new Set(); for (const [d, w] of buys || []) { const s = sessOf(d); if (s >= f - n && s <= f - 1) o.add(String(w)); } return o.size; }
export const slipped = (entry, exit) => (exit * (1 - SLIP)) / (entry * (1 + SLIP)) - 1;

// ---------------- reporting ----------------
export function perYear(rows, key = 'g', cost = COST) { const v = rows.filter(z => ok(z[key]) && z.days > 0); const y = v.reduce((a, z) => a + z.days / YEAR, 0); return v.length && y > 0 ? v.reduce((a, z) => a + z[key] - cost, 0) / y : null; }
export function shapeOf(tr) { const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0), kinds = {};
  for (const z of tr) kinds[z.kind] = (kinds[z.kind] || 0) + 1;
  return { trades: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, pf: l.length && sum(l) < 0 ? r4(sum(w) / -sum(l)) : null, exits: kinds }; }
export function boardStats(rows) { const net = rows.map(r => capG(r.g) - COST);
  return { n: rows.length, win: rows.length ? r4(net.filter(x => x > 0).length / rows.length) : null, avg: rows.length ? r4(mean(net)) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => capG(r.g) - r.c))) : null }; }

// ---------------- library (before any run; idempotent, append only) ----------------
export function preRegister(LB, date = '2026-10-27') { if (!LB || !Array.isArray(LB.strategies)) return 0; if (LB.strategies.some(x => x.id === ID)) return 0;
  LB.strategies.push({ id: ID, family: 'Squad 24 (deal with a giant)', name: RULES[ID].name, agent: 'squad24', kind: 'buy', hold: TH.hold,
    explain: 'RULE (squad24-core.mjs header, exact): an 8-K listing Item 1.01 whose main document / EX-99 / EX-10 names, as a counterparty in a deal sentence that is not a financing sentence (credit / loan / underwriting / sales-agent / lender wording), a company on a FROZEN list of the 100 largest US-listed companies by market value at the latest quarter start (data/squad24-megacaps.json, CIK + legal name + up to 2 hand-written aliases, SHA-256 in the header; never-listed namesakes such as OpenAI excluded, SpaceX only after its own 2026 listing; an alias followed by an extra name word such as a country or "International Ltd" fails). Filing session from the SEC acceptance time (sec-time.mjs: before 16:00 = that day, after = next session). At the close of that session: close 1-10 USD, 20-day average traded value >= 0.5M USD (dead stocks included); no 15%+ close-to-close move up or down in the 21 sessions before; no reverse split in 60 days; no 424B5 / S-1 / S-1/A / S-3 / S-3/A in the 20 sessions to the filing session. The filing must state a dollar value and the LARGEST stated value (not per share / unit; trillions ignored) must be >= 20% of the market value at that close (shares known 30 days earlier). Buy the next open; sell the close of session 10 or at a 25% stop. Costs 0.8% / 1.2% and a 2%-each-way slippage version (an extra gate). Yardsticks: the average 1-10 USD stock on the same days; the same stock on other days; per year vs SPY. Information: the average liquid stock; a first-open variant.',
    status: 'pre-registered ' + date + ' (squad 24 lab); 5-year one-shot pending', sources: ['https://efts.sec.gov/LATEST/search-index', 'https://www.sec.gov/Archives/edgar/full-index/'],
    libraryCheck: 'SQ21-CONTRACT10D (any named counterparty, bought 1-10 sessions later: rejected), DEC2-CONTRACT (rejected), CAT-HUNTER-SUB5 and same-day jump chasing (squad 19: rejected). New: the counterparty must be a top-100 US-listed company, a stated dollar value >= 20% of the filer\'s market value, a quiet stock before, entry the open after the reaction session, 10-session hold.',
    note: 'The owner\'s +93% day (a small company announcing a deal with a big company; possibly SOUN, Feb 2024). Pre-registered BEFORE any run (one version); run ONCE by squad24-lab.mjs, first complete verdict frozen in data/squad24-lab.json firstRun; forward paper lane from 28 Oct 2026.' });
  LB.updated = date; return 1; }
export function preRegisterSide(LB, date = '2026-10-27') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  const add = (e) => { if (LB.strategies.some(x => x.id === e.id)) return; LB.strategies.push(e); ch++; };
  const base = { family: 'Squad 24 (deal with a giant)', agent: 'squad24', kind: 'exploratory', hold: TH.hold, status: 'pre-registered ' + date + ' as EXPLORATORY side test (never a verdict, never TRY SMALL); written before the SQ24-MEGADEAL result was seen', sources: [] };
  add({ ...base, id: SIDE.first, name: 'SQ24-MEGADEAL trades where it is the first-ever deal with that mega-cap (no earlier 8-K 1.01 naming it since 2020)', explain: 'Side test (owner\'s reviewer, 27 Oct 2026), alone against the base SQ24-MEGADEAL trades, not stacked: keep a trade only if the filer had no earlier 8-K Item 1.01 since 2020-01-01 that passes the same counterparty test for the same mega-cap CIK. Reported as n / average / slippage / edge per half; exploratory only.' });
  add({ ...base, id: SIDE.insider, name: 'SQ24-MEGADEAL trades with 2+ insider buys in the 10 sessions before the filing', explain: 'Side test (owner\'s reviewer, 27 Oct 2026), alone against the base: keep a trade only if 2+ different insiders filed Form 4 open-market purchases (code P) of the filer with filing dates in sessions f-10..f-1. Exploratory only.' });
  if (ch) LB.updated = date; return ch; }
