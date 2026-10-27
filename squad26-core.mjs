// SQUAD 26 CORE (27 Oct 2026; Stock-2): "buy in the FIRST MINUTES after a material deal filing with a giant". Pure functions, no network,
// no files. Used by squad26-lab.mjs (the one-shot historical test), squad26-watch.mjs (the forward paper watcher) and
// test/squad26-core.test.mjs. Long only; no leverage; never places an order; never sends an alert; never gives a halal ruling.
//
// WHY: Squad 24 (SQ24-MEGADEAL, REJECTED) bought the open AFTER the reaction session and earned about the average 1-10 USD stock; its
// first-open variant was also flat after slippage. Its case studies showed the money came in the first minutes after the news (SOUN
// +65% from the first after-hours minute to the next close, WULF +38% from the first pre-market minute; ELVA -35% even from the first
// minute). Squad 24 also found 151 of its 264 trades were BANKS named in credit-agreement boilerplate. QUESTION: does buying in the first
// minutes after the SEC acceptance pay, after honest costs?
//
// ================= TEST: SQ26-FIRSTMIN (PRE-REGISTERED 27 Oct 2026 BEFORE ANY RESULT; one version per id; run ONCE) =================
// MEGA-CAP LIST: Squad 24's frozen data/squad24-megacaps.json, reused AS IS; its SHA-256 must equal squad24-core MEGACAP_SHA
//   (5530f8200c39cf831750e157cedd32b4f3038b33345a802c152542e5048864da) or nothing runs. The list in force = the latest quarter start
//   on or before the acceptance date. EXCLUDED COUNTERPARTIES (written now, before any result): banks, brokers, asset managers, card
//   lenders and insurers on that list (EXCLUDED_CP below: JPMorgan, Bank of America, Wells Fargo, Citigroup, Goldman Sachs, Morgan
//   Stanley, Charles Schwab, Capital One, American Express, MUFG, SMFG, Santander, HSBC, UBS, Royal Bank of Canada, Toronto-Dominion,
//   HDFC Bank, BlackRock (both CIKs), Blackstone, KKR, S&P Global, Chubb, Progressive): a deal with a lender is financing, not a customer.
//   The filer itself must not be on any quarter's list.
// EVENT SETS:
//   PRIMARY (set '101'): an SEC 8-K (form exactly 8-K, no amendment) whose items include 1.01, filed 2021-11-15 .. 2026-10-23, found by
//     EDGAR full-text search of every alias (forms 8-K, month by month), then read in full (EDGAR full submission text: the header
//     ACCEPTANCE-DATETIME and every document). The counterparty test must pass in the main 8-K document, an EX-99.x or an EX-10.x.
//   VARIANT (set '801', separate, pre-registered): items include 8.01 and NOT 1.01, the filing has an EX-99.1 (press release), and the
//     counterparty test passes INSIDE that EX-99.1.
// COUNTERPARTY CONTEXT TEST (stricter than Squad 24): an alias of a listed company (not EXCLUDED_CP) appears (a) as a whole word with the
//   same name-end test as Squad 24 (squad24-core nameEnds: an optional corporate form, then no further capitalised name word); (b) the
//   SENTENCE holding it (squad24-core sentenceAt) holds a COMMERCIAL term (COMM_RE: supply / supplier / purchase / license / licence /
//   licensing / collaborat* / customer / order / partner / partnership / distribution / distributor / reseller / statement of work /
//   master services / services agreement / offtake / hosting / commercial / alliance / joint development / co-develop); (c) neither that
//   sentence NOR the 300 characters either side of the name holds a FINANCING term (FIN_RE: credit agreement / credit facility / loan /
//   lender / administrative or collateral agent / indenture / trustee / underwrit* / sales or placement agent / equity distribution /
//   at-the-market / securities, stock, share or note purchase / notes due / senior or convertible notes / revolving / borrow* / guarant* /
//   swap / ISDA / custodian / depositary / escrow / bank / banking / financial advisor / fairness opinion / letter of credit / interest
//   rate / SOFR / LIBOR / prime rate / broker-dealer / bookrunner / dealer manager / warrant agent / transfer agent); (d) the document is
//   not a FINANCING DOCUMENT: an EX-10.x whose first 3,000 characters hold a financing title (DOC_FIN_RE: credit / loan / indenture /
//   underwriting / sales / equity distribution / securities or note purchase / guaranty / security / pledge agreement, at-the-market,
//   forbearance, supplemental indenture) is skipped whole. First passing mention wins.
// TIMESTAMP: the EDGAR header ACCEPTANCE-DATETIME (Eastern clock -> UTC with the New York offset of that day; squad24-core etToIso).
// FILTERS (known before the entry): p = the last session whose 16:00 close is before the acceptance; RAW close of p (Alpaca SIP daily,
//   adjustment=raw) 1-10 USD; 20-session average traded value (raw close x volume, sessions p-19..p, 18+ bars) >= 0.5M USD.
// ENTRY (first minutes): the first Alpaca SIP 1-minute bar (raw) whose START is >= acceptance + 60 s and <= acceptance + 30 min
//   (extended hours 04:00-20:00 New York allowed). Fill = that bar's HIGH x (1 + slip): slip 1% if the bar starts 09:30-15:59 New York
//   on a session day, else 3%. No such bar = no trade (counted: 'no print in 30 minutes').
// SESSION 1 = the first session whose 16:00 close comes after the entry minute (the same day for a pre-market / regular-hours entry; the
//   next session for an after-hours entry).
// EXITS (each pre-registered; slip 1% on a regular-hours exit, 3% on an extended-hours stop fill):
//   (a) 'close' : sell at the close of session 1.
//   (b) '3d'    : sell at the close of session 3 (PRIMARY).
//   (c) '10d'   : sell at the close of session 10, or a 25% STOP under the fill: on session 1 the 1-minute bars after the entry bar up to
//                 16:00 (a bar whose low <= stop sells at min(stop, its open), 3% slip if outside 09:30-15:59); on later sessions a
//                 session that OPENS at or under the stop sells at that open, else one whose low reaches it sells at the stop.
//   A stock with no bar on an exit session sells at its last close before it; one that stops trading (no bar in the last 5 sessions of
//   the data while the window ran) sells at its last close.
// CONTROL (next-open, same events): buy the regular OPEN of the first session that opens at least 1 minute after the acceptance (the same
//   day for an acceptance before 09:29, else the next session), fill open x 1.01; the same three exits counted from that session, 1% slip.
// RETURN: g = exit x (1 - slipOut) / fill - 1 (the fill already holds slipIn), capped at +300% (AUD-1); then 0.8% (1.2% stress) is
//   deducted by the judge on top of the slippage. One open trade per stock per version (an event while the stock is held is skipped).
//   A trade whose window (p-1 .. exit) holds a whole-ratio 3x-50x one-day jump (raw or cache: an unadjusted split) is left out.
// YARDSTICKS (the standard, never lowered): the AVERAGE 1-10 USD STOCK (cache close of p 1-10 USD and 20-day traded value >= 0.5M USD),
//   from the close of p to the close of the exit session (the same window the trade lives in), +300% cap on both (AUD-1), 50+ stocks;
//   the same stock on its other days (windows of the same length, same half, close to close); SPY over the same window (per year of
//   capital tied up).
// JUDGED: halves = acceptance before / from 2024-01-01; value-core judge via hold-core judgeHold, blocks of 10 sessions (session 1
//   index): in BOTH halves > 0 after slippage + 0.8% and + 1.2%, better than the average 1-10 USD stock, better than the same stock on
//   other days, > 0 without its 2 best trades, 20+ trades and 3+ blocks a half, block t >= 2.5, return per year above SPY.
//   ONLY SQ26-FIRSTMIN (set 101, first-minute entry, exit b) can QUALIFY; every other block (exits a / c, set 801, the next-open control)
//   is judged by the same judge and reported for information (multiple looks; no variant can be promoted from this run).
// REPORT: case counts per half FIRST (events, then trades); under 20 a half = TOO FEW CASES, said plainly; every primary case listed.
//
// ================= FORWARD PAPER WATCHER (squad26-watch.mjs; record only) =================
// The EDGAR current-filings Atom feed (type 8-K, count 100) polled every 60 s with SEC_UA; every new 8-K: acceptance time (entry
// <updated>) and DETECTION time (when this poll first saw it) -> the lag; candidate 8-Ks (filer not a mega-cap, ticker known, Alpaca
// raw prior close 1-10 USD and 20-day traded value >= 0.5M USD) are read in full and given the same counterparty test; a qualifying
// event records the Alpaca latest trade + quote at detection, later the first-minute bar the historical rule would have used, and
// Finnhub company news times for that ticker. NO Telegram, NO buy message until the lead turns them on after a pass.
import { nameEnds, sentenceAt, etToIso, listOn, allCiks } from './squad24-core.mjs';
export { etToIso, listOn, allCiks };
export const COST = 0.008, STRESS = 0.012, CAP = 3, SPLIT = '2024-01-01', YEAR = 252, EVENT_FROM = '2021-11-15', EVENT_TO = '2026-10-23', PAPER_START = '2026-10-27';
export const MEGACAP_SHA = '5530f8200c39cf831750e157cedd32b4f3038b33345a802c152542e5048864da';
export const TH = { minClose: 1, maxClose: 10, minDv: 5e5, dvSess: 20, dvMinBars: 18, waitMs: 60e3, maxWaitMs: 30 * 60e3, slipReg: 0.01, slipExt: 0.03, stop: 0.25, block: 10, window: 300, docHead: 3000, minYard: 50 };
export const EXITS = { close: 1, '3d': 3, '10d': 10 };
export const ID = 'SQ26-FIRSTMIN';
export const vid = (set, entry, exit) => set === '101' && entry === 'first' && exit === '3d' ? ID : 'SQ26-V-' + set + '-' + entry + '-' + exit;
export const VERSIONS = [];
for (const set of ['101', '801']) for (const entry of ['first', 'open']) for (const exit of Object.keys(EXITS)) VERSIONS.push({ id: vid(set, entry, exit), set, entry, exit, n: EXITS[exit], primary: set === '101' && entry === 'first' && exit === '3d' });
export const EXCLUDED_CP = new Set(['19617', '70858', '72971', '831001', '886982', '895421', '316709', '927628', '4962', '67088', '1022837', '891478', '1089113', '1610520', '1000275', '947263', '1144967', '1364742', '2012383', '1393818', '1404912', '64040', '896159', '80661']);

// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const median = (a) => { const v = a.filter(ok).sort((x, y) => x - y); return v.length ? (v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null; };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
export function firstOnOrAfter(D, d) { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; }

// ---------------- the counterparty context test ----------------
export const COMM_RE = /\b(?:suppl(?:y|ier|iers|ies)|purchas(?:e|es|ed|ing)|licen[sc](?:e|es|ed|ing|or|ee)|collaborat\w*|customers?|orders?|partners?|partnership|distribut(?:ion|or|ors)|resell(?:er|ers|ing)?|statement of work|master services|services agreement|offtake|off-take|hosting|commercial\w*|alliance|joint development|co-develop\w*)\b/i;
export const FIN_RE = /credit agreement|credit facilit|\bloans?\b|\blenders?\b|administrative agent|collateral agent|indenture|\btrustees?\b|underwrit|sales agent|placement agent|equity distribution|at[- ]the[- ]market|(?:securities|stock|share|note) purchase|notes due|senior notes|convertible notes|revolving|\bborrow|guarant|\bswaps?\b|\bISDA\b|custodian|depositary|escrow|\bbank\b|\bbanking\b|financial advisor|fairness opinion|letter of credit|interest rate|\bSOFR\b|\bLIBOR\b|prime rate|broker-dealer|bookrunner|dealer manager|warrant agent|transfer agent/i;
export const DOC_FIN_RE = /credit agreement|loan agreement|loan and security|indenture|underwriting agreement|sales agreement|equity distribution|(?:securities|note|notes) purchase agreement|guarant(?:y|ee) agreement|security agreement|pledge agreement|at[- ]the[- ]market|forbearance/i;
export const isFinDoc = (type, text) => /^EX-10/i.test(String(type || '')) && DOC_FIN_RE.test(String(text || '').slice(0, TH.docHead));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MATCHERS = new Map();
function matcherOf(companies) { const key = (companies || []).map(c => c.cik + ':' + (c.aliases || []).join('|')).join(';'); if (MATCHERS.has(key)) return MATCHERS.get(key);
  const forms = new Map(); for (const co of companies || []) { if (EXCLUDED_CP.has(String(co.cik))) continue; for (const al of co.aliases || []) { if (!al) continue; for (const f of [al, al.toUpperCase()]) if (!forms.has(f)) forms.set(f, { cik: String(co.cik), alias: al }); } }
  const list = [...forms.keys()].sort((a, b) => b.length - a.length), m = { forms, re: list.length ? new RegExp('(?<![A-Za-z0-9])(?:' + list.map(esc).join('|') + ')', 'g') : null };
  if (MATCHERS.size > 200) MATCHERS.clear(); MATCHERS.set(key, m); return m; }
// text of ONE document; companies [{ cik, aliases }]; -> { cik, alias, at, sentence } or null
export function contextMatch(text, companies, docType = '8-K') { const t = String(text || ''); if (isFinDoc(docType, t)) return null; const M = matcherOf(companies); if (!M.re) return null;
  const re = new RegExp(M.re.source, 'g'); let m;
  while ((m = re.exec(t))) { const form = m[0], end = m.index + form.length, who = M.forms.get(form); if (!who) continue; if (!nameEnds(t.slice(end, end + 80))) continue;
    const s = sentenceAt(t, m.index, form.length); if (!COMM_RE.test(s) || FIN_RE.test(s)) continue;
    const w = t.slice(Math.max(0, m.index - TH.window), end + TH.window); if (FIN_RE.test(w)) continue;
    return { cik: who.cik, alias: who.alias, at: m.index, sentence: s.slice(0, 500) }; }
  return null; }
// a parsed filing { items, docs: [{ type, text }] } -> { set: '101' | '801', match, doc } or null
export function eventOf(p, companies) { const items = (p.items || []).map(x => String(x).trim()), has = (it) => items.includes(it) || items.some(x => x.startsWith(it + ' ') || x.startsWith('Item ' + it));
  if (has('1.01')) { for (const d of p.docs || []) { if (!(d.type === '8-K' || /^EX-99/.test(d.type) || /^EX-10/.test(d.type))) continue; const x = contextMatch(d.text, companies, d.type); if (x) return { set: '101', match: x, doc: d.type }; } return null; }
  if (has('8.01')) { const pr = (p.docs || []).find(d => d.type === 'EX-99.1'); if (!pr) return null; const x = contextMatch(pr.text, companies, pr.type); return x ? { set: '801', match: x, doc: 'EX-99.1' } : null; }
  return null; }
// EDGAR "ITEM INFORMATION" lines are text ('Entry into a Material Definitive Agreement'); map them to item numbers
const ITEM_TEXT = [['1.01', /entry into a material definitive agreement/i], ['8.01', /^other events/i], ['1.02', /termination of a material definitive/i], ['2.02', /results of operations/i], ['7.01', /regulation fd/i], ['9.01', /financial statements and exhibits/i]];
export const itemNumbers = (lines) => [...new Set((lines || []).map(l => { const s = String(l).trim(); const n = /^(?:Item\s*)?(\d\.\d\d)\b/i.exec(s); if (n) return n[1]; const h = ITEM_TEXT.find(([, re]) => re.test(s)); return h ? h[0] : s; }))];

// ---------------- the clock ----------------
// nyParts(ms) -> { d, hm }. regular = a minute that starts 09:30-15:59 New York on a session day (isSession(d))
export const isRegular = (p, isSession) => isSession(p.d) && p.hm >= '09:30' && p.hm < '16:00';
// D sorted session dates; the last session whose 16:00 close is before accMs -> index or -1
export function priorSession(D, acc) { const i = firstOnOrAfter(D, acc.d); if (D[i] === acc.d && acc.hm >= '16:00') return i; return i - 1; }
// the first session whose 16:00 close comes after a moment p ({ d, hm }) -> index (D.length if none)
export function sessionAfter(D, p) { const i = firstOnOrAfter(D, p.d); if (D[i] === p.d && p.hm < '16:00') return i; return D[i] === p.d ? i + 1 : i; }
// the first session whose 09:30 open is at least 1 minute after the acceptance -> index
export function openSessionAfter(D, acc) { const i = firstOnOrAfter(D, acc.d); if (D[i] === acc.d && acc.hm < '09:29') return i; return D[i] === acc.d ? i + 1 : i; }

// ---------------- the first-minute entry ----------------
// bars [{ ms (bar start), o, h, l, c, v }] sorted; -> { j, ms, px, slip, high } or null
export function firstEntry(bars, accMs, regularAt) { for (let j = 0; j < (bars || []).length; j++) { const b = bars[j]; if (b.ms < accMs + TH.waitMs) continue; if (b.ms > accMs + TH.maxWaitMs) return null;
    if (!(b.h > 0)) continue; const slip = regularAt(b.ms) ? TH.slipReg : TH.slipExt; return { j, ms: b.ms, high: b.h, px: b.h * (1 + slip), slip }; } return null; }
// 20-session traded value and the close of the prior session from daily bars [{ d, c, v }] (raw) -> { close, dv, n } or null
export function priorStats(daily, pd) { const a = (daily || []).filter(b => b.d <= pd && b.c > 0); if (!a.length || a[a.length - 1].d !== pd) return null; const w = a.slice(-TH.dvSess);
  return { close: a[a.length - 1].c, dv: w.length >= TH.dvMinBars ? mean(w.map(b => b.c * b.v)) : null, n: w.length }; }
export const passPrior = (s) => !!s && s.close >= TH.minClose && s.close <= TH.maxClose && s.dv >= TH.minDv;

// ---------------- the exits ----------------
// D = session dates; bar = Map(date -> { o, h, l, c }) raw daily for the stock; s1 = session-1 index; n = sessions held; fill = entry px.
// minutes = the 1-minute bars after the entry bar up to 16:00 of session 1 (for the stop; null for an entry at the open: then the
// session-1 daily low counts), regularAt(ms) -> boolean; stop on or off.
// lastData = index of the last session in the data. -> { x, px, slip, kind, held } or { open: true } or null
export function exitTrade({ D, bar, s1, n, fill, stop = false, minutes = null, regularAt, lastData = D.length - 1 }) {
  const end = s1 + n - 1; if (end > lastData) return { open: true }; const sp = fill * (1 - TH.stop);
  let lastBar = -1; for (let q = lastData; q >= Math.max(0, s1 - 30); q--) if (bar.get(D[q])) { lastBar = q; break; }
  let prevClose = null, prevQ = -1;
  for (let q = s1; q <= end; q++) { const b = bar.get(D[q]);
    if (stop && q === s1 && !minutes && b && b.l > 0 && b.l <= sp) return { x: q, px: sp, slip: TH.slipReg, kind: 'stop', held: 1 };   // an entry at the open: the session-1 low
    if (stop && q === s1 && minutes) for (const m of minutes) { if (m.l > 0 && m.l <= sp) { const px = Math.min(sp, m.o > 0 ? m.o : sp); return { x: q, px, slip: regularAt(m.ms) ? TH.slipReg : TH.slipExt, kind: 'stop', held: 1 }; } }
    if (!b) { if (lastBar < q && lastBar < lastData - 4) return prevClose ? { x: prevQ, px: prevClose, slip: TH.slipReg, kind: 'gone', held: Math.max(1, prevQ - s1 + 1) } : null; continue; }
    if (stop && q > s1) { if (b.o > 0 && b.o <= sp) return { x: q, px: b.o, slip: TH.slipReg, kind: 'stop', held: q - s1 + 1 }; if (b.l > 0 && b.l <= sp) return { x: q, px: sp, slip: TH.slipReg, kind: 'stop', held: q - s1 + 1 }; }
    if (b.c > 0) { prevClose = b.c; prevQ = q; } }
  return prevClose ? { x: end, px: prevClose, slip: TH.slipReg, kind: prevQ === end ? 'time' : 'time-last', held: n } : null; }
export const grossOf = (fill, px, slipOut) => capG(px * (1 - slipOut) / fill - 1);
// whole-ratio 3x-50x one-day jump in a close series (an unadjusted split)
export function jumpIn(closes) { let prev = null; for (const z of closes) { if (!(z > 0)) continue; if (prev) { const r = z / prev, R = r >= 1 ? r : 1 / r, w = Math.round(R); if (w >= 3 && w <= 50 && Math.abs(R / w - 1) <= 0.03) return true; } prev = z; } return false; }

// ---------------- the watcher (Atom feed) ----------------
// the EDGAR getcurrent Atom text -> [{ form, name, cik, adsh, updated (ISO with offset), link }]
export function parseAtom(xml) { const out = []; const re = /<entry>([\s\S]*?)<\/entry>/g; let m;
  while ((m = re.exec(String(xml || '')))) { const e = m[1], tit = ((/<title>([\s\S]*?)<\/title>/.exec(e) || [])[1] || '').trim(), upd = ((/<updated>([^<]+)<\/updated>/.exec(e) || [])[1] || '').trim();
    const link = ((/<link[^>]*href="([^"]+)"/.exec(e) || [])[1] || ''), id = ((/<id>([^<]+)<\/id>/.exec(e) || [])[1] || ''), sum = ((/<summary[^>]*>([\s\S]*?)<\/summary>/.exec(e) || [])[1] || '');
    const t = /^(\S+)\s+-\s+(.*?)\s+\((\d{10})\)\s+\(([^)]*)\)\s*$/.exec(tit), adsh = (/accession-number=(\d{10}-\d\d-\d{6})/.exec(id) || /(\d{10}-\d\d-\d{6})/.exec(link + ' ' + id) || [])[1];
    if (!t || !adsh) continue; const items = [...sum.replace(/&lt;/g, '<').replace(/&gt;/g, '>').matchAll(/Item\s+(\d\.\d\d)/gi)].map(x => x[1]);
    out.push({ form: t[1], name: t[2], cik: String(+t[3]), role: t[4], adsh, updated: upd, link: link.replace(/&amp;/g, '&'), items }); }
  return out; }
export function lagStats(lags) { const v = (lags || []).filter(ok).sort((a, b) => a - b); if (!v.length) return { n: 0 }; const q = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { n: v.length, medianSec: Math.round(median(v)), p10Sec: Math.round(q(0.1)), p90Sec: Math.round(q(0.9)), minSec: Math.round(v[0]), maxSec: Math.round(v[v.length - 1]) }; }

// ---------------- library (before any run; idempotent, append only) ----------------
export function preRegister(LB, date = '2026-10-27') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0; const add = (e) => { if (LB.strategies.some(x => x.id === e.id)) return; LB.strategies.push(e); ch++; };
  const base = { family: 'Squad 26 (first minutes after a deal with a giant)', agent: 'squad26', kind: 'buy', status: 'pre-registered ' + date + ' (squad 26 lab); one-shot pending', sources: ['https://efts.sec.gov/LATEST/search-index', 'https://data.alpaca.markets (SIP 1-minute bars)'],
    libraryCheck: 'SQ24-MEGADEAL (open after the reaction session: rejected), its first-open variant (flat after slippage), SQ21-CONTRACT10D, SQ19 jump chasing (rejected). New: entry the first SIP minute bar >= 1 minute after the SEC acceptance (extended hours), filled at that bar\'s HIGH + 1% (regular) / 3% (extended), no size filter, a stricter commercial-context counterparty test and lenders excluded.' };
  add({ ...base, id: ID, hold: 3, name: 'First minute after an 8-K 1.01 naming a top-100 US-listed company as a commercial counterparty (1-10 USD filer): buy the first SIP minute >= 1 min after the SEC acceptance at its high + 1%/3% slippage, sell the close of session 3',
    explain: 'RULE (squad26-core.mjs header, exact): 8-K Item 1.01 (2021-11-15..2026-10-23) whose main document / EX-99 / EX-10 names a company on Squad 24\'s frozen top-100 list (SHA-256 checked; banks, brokers, asset managers and insurers excluded) in a sentence with a commercial term (supply / purchase / license / collaboration / customer / order / partnership / distribution / hosting / commercial ...) and with no financing term in that sentence or 300 characters around it; EX-10 financing documents skipped whole. Prior raw close 1-10 USD, 20-day traded value >= 0.5M USD. Entry: the first Alpaca SIP 1-minute bar starting >= 60 s after the EDGAR acceptance (within 30 min, else skipped), at its HIGH x 1.01 (regular) or x 1.03 (extended hours). Exit: close of session 3 (session 1 = the first close after the entry) x 0.99; then 0.8% / 1.2% costs. Judged in both halves vs the average 1-10 USD stock over the same window, the same stock on other days, no-top-2, block t, SPY per year. Variants (exits close / 10 sessions + 25% stop, the 8.01 + EX-99.1 press-release set, the next-open control) reported for information only.',
    note: 'Squad 24 cases: SOUN +65% and WULF +38% came in the first minutes; ELVA -35%. Pre-registered BEFORE any run; run ONCE by squad26-lab.mjs; first complete verdict frozen in data/squad26-lab.json firstRun; forward paper watcher squad26-watch.mjs (record only, no alerts).' });
  add({ ...base, id: 'SQ26-V-801-first-3d', kind: 'variant', hold: 3, name: 'Same, for an 8-K 8.01 (no 1.01) whose EX-99.1 press release names the giant as a commercial counterparty (information only)', explain: 'Pre-registered variant of SQ26-FIRSTMIN (squad26-core.mjs header): items 8.01 and not 1.01, an EX-99.1, the counterparty context test inside the EX-99.1; same entry and exits. Reported for information; cannot qualify from this run.' });
  add({ ...base, id: 'SQ26-V-101-open-3d', kind: 'control', hold: 3, name: 'Control: the same 8-K 1.01 events bought at the next regular open (+1% slippage), sold at the close of session 3', explain: 'Pre-registered control of SQ26-FIRSTMIN (squad26-core.mjs header): the open of the first session opening >= 1 minute after the acceptance, x 1.01; the same exits counted from that session. Information only.' });
  if (ch) LB.updated = date; return ch; }
