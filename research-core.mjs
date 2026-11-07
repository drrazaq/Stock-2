// RESEARCH CORE (daily researcher, first build 25 Oct 2026). Pure functions, no network, no files. Used by research-lab.mjs (one 5-year
// run per rule, first complete verdict frozen in data/research-lab.json firstRun, then a forward PAPER lane from Monday 26 Oct 2026) and
// test/research-core.test.mjs. Long only; no leverage; no shorting; never places an order.
//
// Each daily-researcher idea gets RQ-* ids. Conventions are copied from the anomaly / squad labs and are NOT loosened:
//   LIQUID = close 5 USD+ and 20-session average traded value 5M USD+ on the signal session (SPY excluded).
//   EVENT rules: public on the SEC acceptance date (New York clock); buy the OPEN of the first session strictly AFTER that date (an evening
//   filing is bought the next morning; a morning filing one day late: conservative); sell the CLOSE `hold` sessions later (hold counts the
//   entry session). One open trade per stock per rule. The stock must be liquid on the session before entry.
//   COSTS 0.8% a round trip (1.2% stress). Every gross return, the rule's and the yardstick's, is capped at +300% alike (AUD-1).
//   JUDGED with value-core.mjs judge (unchanged): halves = signal before / from 2024-01-01; in BOTH halves > 0 after 0.8% and 1.2%,
//   better than the average liquid stock over the same sessions, better than the same stock on its other days, > 0 without its 2 best
//   trades, 20+ trades and 3+ blocks, block t >= 2.5 -> TRADABLE SMALL; block t >= the proof bar -> PROVEN.
//
// ---------------- IDEA 1 (pre-registered 25 Oct 2026, before any run): LAZY PRICES, 10-K text change ----------------
// Source: Cohen, Malloy and Nguyen, "Lazy Prices", Journal of Finance 75(3), 2020, 1371-1415 (NBER w25084). Firms whose annual report
// barely changes from the year before ("non-changers") outperform firms whose report changes a lot; the market does not read the
// changes, and the returns come over the following ~6 months without reversing. The paper reports 10-K-only results similar to its
// 10-K + 10-Q main result. Long only here: we can only BUY the non-changers; the big changers are tested as an AVOID filter (never a buy).
// Measure (one, fixed now): cosine similarity of the term-frequency vectors of this 10-K's primary document and the company's previous
// 10-K primary document (filed 300-430 days earlier). Text = the HTML with tags removed, lower case, words = runs of letters a-z of 2+
// letters (numbers dropped). Both documents need 10,000+ words (a shorter primary document is a wrapper whose annual report sits in an
// exhibit; left out). Form '10-K' only (no amendments, no 10-KT).
// Rank (point in time): the similarity's percentile among ALL 10-K similarities accepted in the 365 days BEFORE its acceptance date
// (300+ needed, else no signal). Percentile = share of those reference values strictly below it.
//   RQ-LAZY-63    BUY a non-changer (percentile >= 0.80), hold 63 sessions (3 months).
//   RQ-LAZY-126   the same, hold 126 sessions (6 months: the paper's drift horizon).
//   RQ-LAZY-CHG63 AVOID check: a big changer (percentile <= 0.20), 63 sessions, judged with the avoid verdict (never a buy).
// DATA RULE (fixed now): no verdict until (a) 98%+ of the universe's companies have their filing list, (b) 95%+ of the needed 10-K
// documents are read (or are permanently missing at the SEC), (c) 85%+ of liquid stock-months map to an SEC company number. The
// collection may take more than one run (cached); the verdict is computed once, on the first run where the data are complete.
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', CAP = 3;
export const LP = { minWords: 10000, gapMin: 300, gapMax: 430, refDays: 365, minRefs: 300, top: 0.8, bottom: 0.2, fetchFrom: '2019-09-01' };
export const DATA_RULE = { subs: 0.98, docs: 0.95, map: 0.85 };
export const RULES = {
  'RQ-LAZY-63': { kind: 'buy', hold: 63, side: 'top', family: 'lazy', name: 'Lazy prices: the 10-K barely changed from last year (top 20% similarity), hold 3 months',
    rule: 'Buy the next open after a 10-K whose text is among the 20% most similar to the previous 10-K (cosine similarity percentile >= 0.80 vs all 10-K similarities of the prior 365 days), stock liquid; sell the close 63 sessions later.' },
  'RQ-LAZY-126': { kind: 'buy', hold: 126, side: 'top', family: 'lazy', name: 'Lazy prices: the 10-K barely changed from last year (top 20% similarity), hold 6 months',
    rule: 'As RQ-LAZY-63, hold 126 sessions.' },
  'RQ-LAZY-CHG63': { kind: 'avoid', hold: 63, side: 'bottom', family: 'lazy', name: 'AVOID check: the 10-K changed the most from last year (bottom 20% similarity), 63 sessions',
    rule: 'Information only: stocks whose 10-K is among the 20% least similar to the previous one, bought next open, 63 sessions; a valid AVOID filter if they lag the average stock in both halves. Never a buy.' },
};
// ---------------- IDEA 2 (pre-registered 26 Oct 2026, before any run): CASH TENDER OFFERS (part 1 of C-SPEC1) ----------------
// Source: Mitchell and Pulvino, "Characteristics of Risk and Return in Risk Arbitrage", Journal of Finance 56(6), 2001 (4,750 US deals
// 1963-1998: ~4% a year above the market after costs, returns like selling a put: small steady gains, large losses in a falling market);
// Baker and Savasoglu, "Limited arbitrage in mergers and acquisitions", JFE 64, 2002. C-SPEC1 (queued 23 Oct from the owner's sources)
// asks for this exact version. Long only: buy the TARGET of a third-party cash tender offer; no short leg (E11/Z13 noted the price
// stops moving after the offer: the profit is the spread, so the yardstick is the average stock over the SAME sessions).
// EVENT: an original Schedule TO-T (EDGAR form 'SC TO-T', not '/A') filed by a third party; the SUBJECT COMPANY (from the filing
// header) is the stock bought. Public on the header ACCEPTANCE-DATETIME (New York clock). One deal = one trade per stock (ONE_OPEN).
// OFFER PRICE (fixed now, no tuning): in the text of the filing's SC TO-T and EX-99 documents (HTML removed, spaces collapsed), every
// '$X per share/Share ... in cash' with no other '$' in between (80 characters at most from 'per share' to 'in cash'); the most frequent
// amount (ties: the first seen) of 0.50 USD or more. No such amount = not an all-cash offer = no trade. CVR deals count the cash part only.
// SPREAD = offer / close of the filing session (the last session on or before the New York filing date) - 1. Sanity: a spread outside
// -50%..+100% is a parse doubt: no trade (counted). The stock must be liquid (system rule) on that session.
// ENTRY the open of the first session strictly after the filing date. EXIT (whichever first):
//   (a) the deal closed / the stock stopped trading: the last close before a gap of 10+ sessions without any price (dead stocks kept);
//   (b) DEAL BREAK: the first close 10% or more under the filing-session close: sell at that close (reported separately);
//   (c) 120 sessions after entry (C-SPEC1's 120), sell at that close.
//   RQ-TENDER-3-15 spread 3% to 15% (C-SPEC1 exactly).   RQ-TENDER-ALL spread above 0% up to 15% (all positive-spread cash tenders).
// Judged with the same judge as idea 1; blocks of 120 sessions (the longest hold: the conservative choice for variable holds).
// DATA RULE (fixed now): no verdict until (a) 95%+ of the SEC daily index files from 2021-10-01 to the last close are read, (b) 95%+ of
// the original SC TO-T filings that name a universe company are read, (c) 50%+ of the read filings whose subject is a priced liquid stock
// give an offer price (a lower share means the price reader is broken: fix the reader, no verdict). DIAG counts are written every run.
export const TO = { lo315: 0.03, hiAll: 0.15, sane: [-0.5, 1.0], minPx: 0.5, breakDrop: 0.10, maxHold: 120, gap: 10, idxFrom: '2021-10-01' };
export const TO_DATA = { idx: 0.95, read: 0.95, priced: 0.5 };
RULES['RQ-TENDER-3-15'] = { kind: 'buy', hold: TO.maxHold, side: 'tender', family: 'tender', spread: [TO.lo315, TO.hiAll], name: 'Cash tender offer target, spread 3-15%, held to the deal close (max 120 sessions)',
  rule: 'Buy the next open after an original SC TO-T (third-party all-cash tender offer) when offer / filing-day close - 1 is 3% to 15% and the target is liquid; sell at the last close before it stops trading (deal closed), at the first close 10%+ under the filing-day close (deal break), or 120 sessions after entry.' };
RULES['RQ-TENDER-ALL'] = { kind: 'buy', hold: TO.maxHold, side: 'tender', family: 'tender', spread: [0, TO.hiAll], name: 'Cash tender offer target, any positive spread up to 15%, held to the deal close (max 120 sessions)',
  rule: 'As RQ-TENDER-3-15 with a spread above 0% up to 15%.' };
export const IDS = Object.keys(RULES), BUY_IDS = IDS.filter(id => RULES[id].kind === 'buy');
export const LAZY_IDS = IDS.filter(id => RULES[id].family === 'lazy'), TENDER_IDS = IDS.filter(id => RULES[id].family === 'tender');
export const ONE_OPEN = new Set(IDS);

const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), isoMs = (x) => new Date(x).toISOString().slice(0, 10);
export const addDays = (d, n) => isoMs(ms(d) + n * DAY);
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY);

// ---------------- text ----------------
export function html2text(h) { return String(h || '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<ix:header[\s\S]*?<\/ix:header>/gi, ' ').replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&[a-z]+;/gi, ' '); }
// term frequencies: Map word -> count (letters a-z, 2+ letters, lower case); .total = number of words
export function termFreq(html) { const m = new Map(); let n = 0; const re = /[a-z]{2,}/g, s = html2text(html).toLowerCase(); let x;
  while ((x = re.exec(s)) !== null) { const w = x[0]; m.set(w, (m.get(w) || 0) + 1); n++; } m.total = n; return m; }
export function cosine(a, b) { if (!a || !b || !a.size || !b.size) return null; let dot = 0, na = 0, nb = 0;
  for (const [w, c] of a) { na += c * c; const d = b.get(w); if (d) dot += c * d; } for (const c of b.values()) nb += c * c;
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : null; }

// ---------------- SEC submissions JSON -> the 10-K list ----------------
// cols = filings.recent (or an extra file): parallel arrays. Returns [{ acc, accept (ISO UTC), date (filing date), doc }] for form '10-K' only.
export function tenKs(cols, from = LP.fetchFrom) { const out = []; if (!cols || !Array.isArray(cols.form)) return out;
  for (let j = 0; j < cols.form.length; j++) { if (cols.form[j] !== '10-K') continue; const date = String(cols.filingDate[j] || ''); if (!date || date < from) continue;
    const doc = String((cols.primaryDocument || [])[j] || ''); if (!doc) continue; out.push({ acc: String(cols.accessionNumber[j]), accept: String((cols.acceptanceDateTime || [])[j] || date), date, doc }); }
  return out; }
export const docUrl = (cik, f) => '/Archives/edgar/data/' + (+cik) + '/' + f.acc.replace(/-/g, '') + '/' + f.doc;
// the previous 10-K of each filing (sorted by date) when filed gapMin..gapMax days earlier; else null
export function pairPrev(list) { const a = [...list].sort((x, y) => x.date < y.date ? -1 : x.date > y.date ? 1 : 0), out = new Map();
  for (let j = 0; j < a.length; j++) { let p = null; for (let q = j - 1; q >= 0; q--) { const g = daysBetween(a[q].date, a[j].date); if (g < LP.gapMin) continue; if (g <= LP.gapMax) p = a[q]; break; } out.set(a[j].acc, p ? p.acc : null); }
  return out; }
// similarity of a pair: null unless both have minWords+
export function pairSim(cur, prev) { if (!cur || !prev || !(cur.total >= LP.minWords) || !(prev.total >= LP.minWords)) return null; const s = cosine(cur, prev); return ok(s) ? s : null; }

// ---------------- point-in-time percentile ----------------
// refs: [{ d (acceptance NY date), s (similarity) }] sorted by d. Percentile of s among refs with d in [day-365, day) ; null if < minRefs.
export function makeRanker(refs) { const a = refs.filter(r => r && r.d && ok(r.s)).sort((x, y) => x.d < y.d ? -1 : x.d > y.d ? 1 : 0), D = a.map(r => r.d);
  const lb = (d) => { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
  return (d, s) => { const i0 = lb(addDays(d, -LP.refDays)), i1 = lb(d); if (i1 - i0 < LP.minRefs || !ok(s)) return null; let below = 0; for (let k = i0; k < i1; k++) if (a[k].s < s) below++; return below / (i1 - i0); }; }
export const sideOf = (p) => p === null || p === undefined ? null : p >= LP.top ? 'top' : p <= LP.bottom ? 'bottom' : 'mid';

// ---------------- data completeness (the pre-registered data rule) ----------------
export function dataComplete({ ciks, subsOk, docsNeeded, docsDone, liqMonths, liqMapped }) {
  const r = { subs: ciks ? subsOk / ciks : 0, docs: docsNeeded ? docsDone / docsNeeded : 0, map: liqMonths ? liqMapped / liqMonths : 0 };
  const why = []; if (!(r.subs >= DATA_RULE.subs)) why.push('filing lists ' + (r.subs * 100).toFixed(1) + '% (98% needed)'); if (!(r.docs >= DATA_RULE.docs)) why.push('10-K documents read ' + (r.docs * 100).toFixed(1) + '% (95% needed)');
  if (!(r.map >= DATA_RULE.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), why: why.join('; ') || null }; }

// ---------------- shared helpers (same as squad1-core) ----------------
export function firstAfter(D, d) { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo; }
export const NYSE_HOLIDAYS = new Set(['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);
const nextWeekday = (d) => { let x = ms(d) + DAY; while ([0, 6].includes(new Date(x).getUTCDay())) x += DAY; return isoMs(x); };
export function nextSession(d, hol = NYSE_HOLIDAYS) { let x = nextWeekday(d); while (hol.has(x)) x = nextWeekday(x); return x; }
export function ownAverage({ from, to, len, step = 10, okAt, busy = [], ret }) { const v = []; for (let u = from; u + len - 1 <= to; u += step) { if (!okAt(u)) continue; const x = u + len - 1; if (busy.some(([a, b]) => u <= b && x >= a)) continue; const g = ret(u, x); if (ok(g)) v.push(capG(g)); } return v.length >= 3 ? mean(v) : null; }
export function pitPick(evs, d, maxAfter = 400) { if (!evs || !evs.length) return null; let best = null, bd = '', next = null, nd = '';
  for (const [x, v] of evs) { if (x <= d) { if (x >= bd) { bd = x; best = v; } } else if (!nd || x < nd) { nd = x; next = v; } }
  if (best !== null) return best; return next !== null && daysBetween(d, nd) <= maxAfter ? next : null; }
export function avoidVerdict(R, minN = 20) { const H = ['older', 'newer'].map(k => R[k] || {});
  if (!H.every(r => r.n >= minN && r.blocks >= 3)) return { verdict: 'TOO FEW CASES (REJECTED AS A BUY)', why: 'avoid test: fewer than ' + minN + ' cases or 3 blocks in a half' };
  if (H.every(r => r.edge < 0 && r.tBlock !== null && r.tBlock <= -2.5)) return { verdict: 'AVOID CONFIRMED (REJECTED AS A BUY)', why: 'these stocks lagged the average stock in both halves with block t <= -2.5: a valid AVOID filter, never a buy' };
  if (H.every(r => r.edge < 0)) return { verdict: 'AVOID WEAK (REJECTED AS A BUY)', why: 'these stocks lagged the average stock in both halves, but block t did not reach -2.5 in both: a weak AVOID filter, never a buy' };
  return { verdict: 'AVOID NOT SUPPORTED (REJECTED AS A BUY)', why: 'these stocks did not lag the average stock in both halves: no evidence for this AVOID filter; never a buy' }; }
export function boardStats(rows) { const net = rows.map(r => capG(r.g) - COST), win = net.filter(x => x > 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => capG(r.g) - r.c))) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
export function shapeOf(tr, yearOf) { const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0), by = {};
  tr.forEach((z, i) => { const y = yearOf(z); (by[y] = by[y] || []).push(net[i]); });
  return { trades: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, pf: l.length && sum(l) < 0 ? r4(sum(w) / -sum(l)) : null,
    byYear: Object.fromEntries(Object.keys(by).sort().map(y => [y, { n: by[y].length, avg: r4(mean(by[y])), win: r4(by[y].filter(x => x > 0).length / by[y].length) }])) }; }

// ---------------- library pre-registration (before any run; idempotent; never overwrites a result) ----------------
const SOURCES = { lazy: ['https://onlinelibrary.wiley.com/doi/10.1111/jofi.12885', 'https://www.nber.org/papers/w25084'],
  tender: ['https://www.johnhcochrane.com/s/mitchell-pulvino-characteristics-of-risk-and-return-JF.pdf', 'https://doi.org/10.1111/0022-1082.00402', 'https://doi.org/10.1016/S0304-405X(02)00072-7'] };
const TENDER_NOTE = 'Daily researcher 2026-10-26: part 1 of C-SPEC1 (queued 23 Oct from the owner\'s sources), Mitchell and Pulvino (2001, JF) risk arbitrage. New information source (SEC Schedule TO-T filings and their offer price), not a chart shape. E11 ("not for this system") was never tested; this is its first test. Run once on 5 years incl. dead stocks (delisted targets keep their last close) with the system gates; first complete verdict frozen in data/research-lab.json firstRun; forward paper from 27 Oct 2026. C-SPEC1 part 2 (index additions) is unchanged.';
export function preRegister(LB, date = '2026-10-25') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    if (R.family === 'isc') { ch += preRegisterIsc(LB); continue; }
    if (R.family === 'rpo') { ch += preRegisterRpo(LB); continue; }
    if (R.family === 'eat') { ch += preRegisterEat(LB); continue; }
    if (R.family === 'tax') { ch += preRegisterTax(LB); continue; }
    if (R.family === 'rdi') { ch += preRegisterRdi(LB); continue; }
    if (R.family === 'inv') { ch += preRegisterInv(LB); continue; }
    if (R.family === 'gwi') { ch += preRegisterGwi(LB); continue; }
    if (R.family === 'gpc') { ch += preRegisterGpc(LB); continue; }
    if (R.family === 'dvc') { ch += preRegisterDvc(LB); continue; }
    if (R.family === 'tender') { LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-10-26 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Offer price reader, spread, exits and data rule fixed in research-core.mjs (IDEA 2) before any run.', sources: SOURCES.tender, hold: R.hold, note: TENDER_NOTE }); ch++; continue; }
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered ' + date + ' (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Text measure, ranking and data rule fixed in research-core.mjs before any run (cosine similarity of 10-K word counts vs the previous 10-K; percentile vs the prior 365 days of 10-K similarities; both documents 10,000+ words).',
      sources: SOURCES[R.family] || [], hold: R.hold,
      note: 'Daily researcher ' + date + ': Cohen, Malloy and Nguyen (2020, Journal of Finance) Lazy Prices, 10-K only (the paper reports similar 10-K-only results). New information source (SEC filing text), not a chart shape. Tests the text-change half of C-DIFF1; C-DIFF1 itself is unchanged. Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun; forward paper from 26 Oct 2026.' });
    ch++; }
  return ch; }

// ---------------- IDEA 2 helpers (pure) ----------------
// the EDGAR full submission text -> { subjectCik, accept (YYYYMMDDHHMMSS, New York clock), date (NY date), docs: [{ type, text }] }
export function parseSubmission(txt) { const s = String(txt || ''), hdrEnd = s.search(/<DOCUMENT>/i), hdr = hdrEnd > 0 ? s.slice(0, hdrEnd) : s.slice(0, 20000);
  const sub = /SUBJECT COMPANY:[\s\S]*?CENTRAL INDEX KEY:\s*(\d+)/i.exec(hdr), acc = /<ACCEPTANCE-DATETIME>\s*(\d{14})/i.exec(hdr) || /ACCEPTANCE-DATETIME:\s*(\d{14})/i.exec(hdr);
  const docs = []; const re = /<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi; let m;
  while ((m = re.exec(s)) !== null) { const body = m[1], type = ((/<TYPE>([^\n<]+)/i.exec(body) || [])[1] || '').trim().toUpperCase(); if (!/^(SC TO|EX-99)/.test(type)) continue;
    docs.push({ type, text: body }); }
  const a = acc ? acc[1] : null; return { subjectCik: sub ? String(+sub[1]) : null, accept: a, date: a ? a.slice(0, 4) + '-' + a.slice(4, 6) + '-' + a.slice(6, 8) : null, docs }; }
// the cash offer price: the most frequent '$X per share ... in cash' amount (>= 0.50; ties: first seen); null if none. cvr: a CVR is mentioned.
export function offerPrice(docs) { const cnt = new Map(), first = new Map(); let k = 0, cvr = false;
  for (const d of docs || []) { const t = html2text(d.text).replace(/[\u201c\u201d\u2018\u2019]/g, '"').replace(/\s+/g, ' ').slice(0, 3e6); if (/contingent value right/i.test(t)) cvr = true;
    const re = /\$\s?(\d{1,4}(?:,\d{3})*(?:\.\d{1,4})?)\s*(?:net\s+)?per\s+(?:share|ordinary share|ads|american depositary share|unit)s?\b([^$]{0,80}?)\bin\s+cash\b/gi; let m;
    while ((m = re.exec(t)) !== null) { const v = +m[1].replace(/,/g, ''); if (!(v >= TO.minPx)) continue; cnt.set(v, (cnt.get(v) || 0) + 1); if (!first.has(v)) first.set(v, k++); } }
  if (!cnt.size) return { px: null, n: 0, cvr }; let best = null;
  for (const [v, c] of cnt) if (best === null || c > cnt.get(best) || (c === cnt.get(best) && first.get(v) < first.get(best))) best = v;
  return { px: best, n: cnt.get(best), cvr }; }
export const spreadOf = (offer, close) => offer > 0 && close > 0 ? offer / close - 1 : null;
export const saneSpread = (s) => ok(s) && s >= TO.sane[0] && s <= TO.sane[1];
export const inSpread = (id, s) => { const r = RULES[id]; return ok(s) && s > r.spread[0] - 1e-12 && s <= r.spread[1] + 1e-12 && (r.spread[0] > 0 ? s >= r.spread[0] - 1e-12 : s > 0); };
// exit of one tender trade. px(t) -> a close (or null) of the stock on session t; entry k (open), filing session t0 with close c0, T sessions.
// -> { x, why: 'closed' | 'break' | 'time' } or null when not complete yet (still trading inside the 120 sessions at the last close).
export function tenderExit({ k, c0, T, px, hold = TO.maxHold, gap = TO.gap, drop = TO.breakDrop }) { let last = null, miss = 0;
  for (let t = k; t < T && t <= k + hold - 1; t++) { const c = px(t);
    if (c > 0) { miss = 0; last = t; if (c <= c0 * (1 - drop)) return { x: t, why: 'break' }; continue; }
    if (++miss >= gap) return last === null ? null : { x: last, why: 'closed' }; }
  if (k + hold - 1 <= T - 1) return last === null ? null : { x: k + hold - 1, why: 'time' };
  if (last !== null && T - 1 - last >= gap) return { x: last, why: 'closed' };   // stopped trading close to the data end
  return null; }
export function tenderDataRule({ idxNeed, idxRead, filNeed, filRead, subjPriced, subjOffer }) {
  const r = { idx: idxNeed ? idxRead / idxNeed : 0, read: filNeed ? filRead / filNeed : 0, priced: subjPriced ? subjOffer / subjPriced : 0 }, why = [];
  if (!(r.idx >= TO_DATA.idx)) why.push('daily index files read ' + (r.idx * 100).toFixed(1) + '% (95% needed)');
  if (!(r.read >= TO_DATA.read)) why.push('SC TO-T filings read ' + (r.read * 100).toFixed(1) + '% (95% needed)');
  if (!(r.priced >= TO_DATA.priced)) why.push('offer price found ' + (r.priced * 100).toFixed(1) + '% of priced-target filings (50% needed)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), why: why.join('; ') || null }; }

// ---------------- IDEA 3 (pre-registered 27 Oct 2026, before any run): INFORMATION-SHOCK CONTINUATION (C-ISC1) ----------------
// Source: Jiang and Zhu, "Information Shocks and Short-Term Market Underreaction", Journal of Financial Economics 124(1), 2017, 43-64
// (SSRN 2891216): stocks with a positive price JUMP (a large information shock) keep rising over the next one to three months; the
// effect goes beyond earnings surprises and is linked to limited attention. C-ISC1 (queued 21 Oct) asks for a version where the jump
// day is a VERIFIED company-news day, earnings and non-earnings news apart, and it must add something beyond the lottery rule M15 and
// the jump tests of Squads 19-20 (those were under-5 USD runners and jump filters/exits on other rules; this is liquid stocks, 5 USD+,
// with an SEC 8-K behind the move). Counter-evidence to watch: later papers report overreaction to OVERNIGHT jumps in recent years.
// Long only (positive shocks); no short leg.
// SHOCK on session t (fixed now, no tuning): AR(t) = the stock's close-to-close return minus the average return of all liquid stocks
// that session (liquid on t-1). SIGMA = the sample standard deviation of the stock's AR over the 60 sessions t-60..t-1 (50+ values
// needed). SHOCK = AR(t) >= max(4 x SIGMA, +4%). The stock must be liquid (system rule: close 5 USD+, 20-day traded value 5M USD+) on t.
// NEWS = at least one original form '8-K' (not '8-K/A') of the company whose REACTION SESSION is t: SEC acceptance time (UTC, read on
// the New York clock with sec-time.mjs) before 16:00 -> that date's session (or the next session if that date is not one); 16:00 or
// later -> the next session. EARNINGS news = one of those 8-Ks lists item 2.02 (Results of Operations); NON-EARNINGS = none does.
// ENTRY the open of t+1; EXIT the close `hold` sessions later (hold counts the entry session). One open trade per stock per rule.
//   RQ-ISC-21     any 8-K news shock, hold 21 sessions (one month: the paper's shortest horizon)
//   RQ-ISC-63     any 8-K news shock, hold 63 sessions (three months: the paper's longest horizon)
//   RQ-ISC-E-21   earnings 8-K (item 2.02) shock, hold 21
//   RQ-ISC-NE-21  non-earnings 8-K shock (no item 2.02), hold 21
// Judged with the same judge as ideas 1-2 (blocks = hold). Diagnostic only (not a filter): the share of trades with AR >= 15% (M15's
// lottery jumps).
// DATA RULE (fixed now): no verdict until (a) 95%+ of the universe companies (liquid at a month start, mapped to an SEC number) have
// their 8-K list read from data.sec.gov submissions, (b) 85%+ of liquid stock-months map to an SEC company number.
export const ISC = { k: 4, minAR: 0.04, win: 60, minObs: 50, lottery: 0.15, from: '2021-09-01' };
export const ISC_DATA = { subs: 0.95, map: 0.85 };
RULES['RQ-ISC-21'] = { kind: 'buy', hold: 21, side: 'isc', news: 'any', family: 'isc', name: 'Information shock: a jump of 4+ sigma (and 4%+) above the average stock on an 8-K news day, hold 1 month',
  rule: 'Buy the next open after a session where the stock beat the average liquid stock by max(4 x its own 60-session sigma, 4%) and an original 8-K of the company was accepted for that session (before 16:00 New York, or after the prior close); stock liquid, 5 USD+; sell the close 21 sessions later.' };
RULES['RQ-ISC-63'] = { kind: 'buy', hold: 63, side: 'isc', news: 'any', family: 'isc', name: 'Information shock on an 8-K news day, hold 3 months', rule: 'As RQ-ISC-21, hold 63 sessions.' };
RULES['RQ-ISC-E-21'] = { kind: 'buy', hold: 21, side: 'isc', news: 'E', family: 'isc', name: 'Information shock on an EARNINGS 8-K day (item 2.02), hold 1 month', rule: 'As RQ-ISC-21, but one of the session\'s 8-Ks lists item 2.02 (earnings).' };
RULES['RQ-ISC-NE-21'] = { kind: 'buy', hold: 21, side: 'isc', news: 'NE', family: 'isc', name: 'Information shock on a NON-EARNINGS 8-K day (no item 2.02), hold 1 month', rule: 'As RQ-ISC-21, but none of the session\'s 8-Ks lists item 2.02 (contracts, deals, approvals, guidance, management news...).' };
export const ISC_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'isc');
for (const id of ISC_IDS) { if (!IDS.includes(id)) IDS.push(id); if (!BUY_IDS.includes(id)) BUY_IDS.push(id); ONE_OPEN.add(id); }
// sample standard deviation of the finite values; null if fewer than minObs
export function sdOf(a, minObs = ISC.minObs) { const v = (a || []).filter(ok); if (v.length < minObs) return null; const m = mean(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / (v.length - 1)); }
export const isShock = (ar, sigma) => ok(ar) && ok(sigma) && ar >= Math.max(ISC.k * sigma, ISC.minAR);
// SEC submissions columns -> [[acceptance (ISO, UTC), items string]] for original form '8-K' filed from `from`
export function eightKs(cols, from = ISC.from) { const out = []; if (!cols || !Array.isArray(cols.form)) return out;
  for (let j = 0; j < cols.form.length; j++) { if (cols.form[j] !== '8-K') continue; const date = String((cols.filingDate || [])[j] || ''); if (!date || date < from) continue;
    out.push([String((cols.acceptanceDateTime || [])[j] || date), String((cols.items || [])[j] || '')]); }
  return out; }
// the calendar date whose session (or the next session) reacts to a filing: New York clock, 16:00 or later -> the next day
export function reactionDate(accept, ny) { const x = ny(accept); if (!x) return null; if (!x.hm) return x.d; return x.hm < '16:00' ? x.d : addDays(x.d, 1); }
export const isEarnings = (items) => /(^|[^0-9.])2\.02([^0-9]|$)/.test(String(items || ''));
export const newsOk = (id, kinds) => { const n = RULES[id].news; if (!kinds || !kinds.length) return false; const e = kinds.some(Boolean); return n === 'any' ? true : n === 'E' ? e : !e; };
export function iscDataRule({ ciks, subsOk, liqMonths, liqMapped }) { const r = { subs: ciks ? subsOk / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.subs >= ISC_DATA.subs)) why.push('8-K lists read ' + (r.subs * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= ISC_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), why: why.join('; ') || null }; }
const ISC_SOURCES = ['https://doi.org/10.1016/j.jfineco.2016.06.011', 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2891216', 'https://ideas.repec.org/a/eee/jfinec/v124y2017i1p43-64.html'];
const ISC_NOTE = 'Daily researcher 2026-10-27: C-ISC1 (queued 21 Oct), Jiang and Zhu (2017, JFE) information shocks. New combination of information: an SEC 8-K behind the day\'s move (official data.sec.gov submissions: acceptance time and 8-K items) plus the size of the move against the stock\'s own volatility; not tested before (Squad 19 = under-5 USD runners; Squad 20 = jumps as filters/exits of other rules; M15 = lottery). Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun; forward paper from 28 Oct 2026.';
export function preRegisterIsc(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of ISC_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-10-27 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Shock size, sigma window, news window and data rule fixed in research-core.mjs (IDEA 3) before any run.', sources: ISC_SOURCES, hold: R.hold, note: ISC_NOTE }); ch++; }
  return ch; }

// ---------------- IDEA 4 (pre-registered 28 Oct 2026, before any run): ORDER BACKLOG GROWTH (remaining performance obligations) ----------------
// Sources: Rajgopal, Shevlin and Venkatachalam, "Does the Stock Market Fully Appreciate the Implications of Leading Indicators for Future
// Earnings? Evidence from Order Backlog", Review of Accounting Studies 8(4), 2003, 461-492 (backlog predicts earnings, but the market
// OVERweights it: their hedge is against high-backlog firms); Banker, Barber, Hollie and Park, Review of Quantitative Finance and
// Accounting 62(4), 2024, 1733-1753 (backlog is a leading indicator of earnings, conditional on fundamentals). Practitioners (software and
// industrial investors) call RPO growth "the superior metric". Since ASC 606 (2018) US companies tag their backlog in XBRL as
// us-gaap:RevenueRemainingPerformanceObligation, so the test can use the official SEC company facts. NEW information (contracted future
// revenue), not a chart shape; nothing in the library uses it. The papers point both ways, so the buy test and the avoid check are both
// written now; long only (the avoid check is never a buy).
// MEASURE (fixed now, no tuning): rows of us-gaap:RevenueRemainingPerformanceObligation, unit USD, instant values (no start date), form
// 10-Q or 10-K (no amendments), period end from 2019-06-01. Read in order of the SEC 'filed' date. A filing date F is an EVENT when its
// latest period end E is later than every end the company reported before F, and F - E <= 120 days (a timely report). CURRENT = that
// filing's value for E. PRIOR = the value (the latest filed on or before F) for the end closest to E - 365 days within E-385..E-345.
// GROWTH = CURRENT / PRIOR - 1, only when PRIOR >= 5M USD and CURRENT > 0.
// RANK (point in time, the lazy-prices ranker): GROWTH's percentile among ALL growth events filed in the 365 days before F (300+ needed).
//   RQ-RPO-63     BUY the next open after a filing whose backlog growth is in the top 20% (percentile >= 0.80); sell the close 63 later.
//   RQ-RPO-126    the same, hold 126 sessions (6 months).
//   RQ-RPO-LOW63  AVOID check: bottom 20% backlog growth (percentile <= 0.20), 63 sessions, judged with the avoid verdict (never a buy).
// Public on the 'filed' date (no time in company facts): bought at the OPEN of the first session strictly AFTER that date (conservative).
// The stock must be liquid (system rule) on the session before entry. One open trade per stock per rule.
// DATA RULE (fixed now): no verdict until (a) 95%+ of the universe companies were looked up in the SEC bulk company facts file (absent =
// no XBRL facts = looked up), (b) 85%+ of liquid stock-months map to an SEC company number, (c) 2,000+ growth events from 2021-10-01
// (fewer means the reader is broken: fix it, no verdict).
export const RPO = { tag: 'RevenueRemainingPerformanceObligation', endFrom: '2019-06-01', maxLag: 120, prevLo: 345, prevHi: 385, minPrior: 5e6, eventsFrom: '2021-10-01' };
export const RPO_DATA = { looked: 0.95, map: 0.85, events: 2000 };
RULES['RQ-RPO-63'] = { kind: 'buy', hold: 63, side: 'top', family: 'rpo', name: 'Order backlog (RPO) growth in the top 20%, hold 3 months',
  rule: 'Buy the next open after a 10-Q/10-K whose remaining performance obligations (contracted backlog, SEC XBRL) grew year on year by a top-20% amount (percentile >= 0.80 vs all backlog-growth filings of the prior 365 days; prior-year backlog 5M USD+; filed within 120 days of the quarter end); stock liquid; sell the close 63 sessions later.' };
RULES['RQ-RPO-126'] = { kind: 'buy', hold: 126, side: 'top', family: 'rpo', name: 'Order backlog (RPO) growth in the top 20%, hold 6 months', rule: 'As RQ-RPO-63, hold 126 sessions.' };
RULES['RQ-RPO-LOW63'] = { kind: 'avoid', hold: 63, side: 'bottom', family: 'rpo', name: 'AVOID check: order backlog (RPO) growth in the bottom 20%, 63 sessions',
  rule: 'Information only: stocks whose backlog growth is among the 20% lowest (percentile <= 0.20), bought next open, 63 sessions; a valid AVOID filter if they lag the average stock in both halves. Never a buy.' };
export const RPO_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'rpo');
for (const id of RPO_IDS) { if (!IDS.includes(id)) IDS.push(id); if (RULES[id].kind === 'buy' && !BUY_IDS.includes(id)) BUY_IDS.push(id); ONE_OPEN.add(id); }
// companyfacts JSON (or a companyconcept JSON) -> [[end, val, filed, form]] of the RPO tag, sorted by filed then end
export function rpoRows(j) { const u = j && (j.facts ? j.facts['us-gaap'] && j.facts['us-gaap'][RPO.tag] && j.facts['us-gaap'][RPO.tag].units : j.units);
  const a = u && Array.isArray(u.USD) ? u.USD : []; const out = [], seen = new Set();
  for (const x of a) { if (!x || x.start || !x.end || !x.filed || !ok(x.val) || x.val < 0 || (x.form !== '10-Q' && x.form !== '10-K') || x.end < RPO.endFrom) continue;
    const k = x.end + '|' + x.val + '|' + x.filed; if (seen.has(k)) continue; seen.add(k); out.push([x.end, x.val, x.filed, x.form]); }
  return out.sort((p, q) => p[2] < q[2] ? -1 : p[2] > q[2] ? 1 : p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : 0); }
// rows -> growth events [{ d (filed), end, cur, prior, g, form }]
export function rpoEvents(rows) { const out = [], known = []; let maxEnd = '';
  const byF = new Map(); for (const r of rows || []) (byF.get(r[2]) || byF.set(r[2], []).get(r[2])).push(r);
  for (const F of [...byF.keys()].sort()) { const here = byF.get(F); known.push(...here); const E = here.reduce((m, r) => r[0] > m ? r[0] : m, '');
    if (E > maxEnd && daysBetween(E, F) <= RPO.maxLag && daysBetween(E, F) >= 0) { const cur = here.filter(r => r[0] === E).pop()[1];
      const target = addDays(E, -365); let best = null;
      for (const r of known) { const gap = daysBetween(r[0], E); if (gap < RPO.prevLo || gap > RPO.prevHi) continue;
        if (!best || Math.abs(daysBetween(r[0], target)) < Math.abs(daysBetween(best[0], target)) || (r[0] === best[0] && r[2] >= best[2])) best = r; }
      if (best && best[1] >= RPO.minPrior && cur > 0) out.push({ d: F, end: E, cur, prior: best[1], g: r4(cur / best[1] - 1), form: here.find(r => r[0] === E)[3] }); }
    if (E > maxEnd) maxEnd = E; }
  return out; }
export function rpoDataRule({ ciks, looked, liqMonths, liqMapped, events }) { const r = { looked: ciks ? looked / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.looked >= RPO_DATA.looked)) why.push('company facts looked up ' + (r.looked * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= RPO_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  if (!(events >= RPO_DATA.events)) why.push('backlog growth events ' + events + ' (2,000 needed: reader check)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), events, why: why.join('; ') || null }; }
const RPO_SOURCES = ['https://doi.org/10.1023/A:1027364031775', 'https://ideas.repec.org/a/spr/reaccs/v8y2003i4d10.1023_a1027364031775.html', 'https://doi.org/10.1007/s11156-024-01248-6'];
const RPO_NOTE = 'Daily researcher 2026-10-28: order backlog (remaining performance obligations, ASC 606) from the official SEC XBRL company facts. Rajgopal, Shevlin and Venkatachalam (2003, RAST) find the market OVERweights backlog (hedge against high-backlog firms); practitioners treat RPO growth as a buy signal; both directions written before any run (buy top 20% growth; avoid check bottom 20%). New information family, not in the library. Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen; forward paper from 28 Oct 2026.';
export function preRegisterRpo(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of RPO_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-10-28 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Measure, event timing, ranking and data rule fixed in research-core.mjs (IDEA 4) before any run.', sources: RPO_SOURCES, hold: R.hold, note: RPO_NOTE }); ch++; }
  return ch; }

// ---------------- IDEA 5 (pre-registered 31 Oct 2026, before any run): EARNINGS ANNOUNCEMENT TIMING (advancers vs delayers) ----------------
// Source: Johnson and So, "Time Will Tell: Information in the Timing of Scheduled Earnings News", Journal of Financial and Quantitative
// Analysis 53(6), 2018, 2431-2464 (MIT DSpace 1721.1/122364): firms that report EARLIER than their usual (year-ago) date tend to have good
// news and earn higher returns than firms that report LATER than usual (delayers: bad news); investors under-react to the timing signal.
// Also Bagnoli, Kross and Watts (2002, Journal of Accounting and Economics 33(3)): late announcements carry bad news. NEW information
// (the calendar of a company's own earnings releases, official SEC 8-K item 2.02 filings); nothing in the library uses it (E17, C-PEER1,
// RQ-ISC-E use earnings DAYS, not their timing). Long only: buy the advancers; the delayers are an AVOID check (never a buy).
// MEASURE (fixed now, no tuning): an EARNINGS FILING = an original form '8-K' whose items list 2.02 (Results of Operations), dated by its
// SEC acceptance time on the New York clock (calendar date). Earnings filings of a company are grouped: a filing starts a NEW announcement
// when it is more than 30 days after the start of the previous announcement (later 2.02s within 30 days are the same announcement:
// corrections, slides). An announcement's DATE = its first filing. YEAR-AGO = the company's announcement whose date is closest to
// date - 364 days (52 weeks, the same weekday) within +-30 days (none -> no event). SHIFT = date - (year-ago date + 364), calendar days
// (negative = earlier than usual).
//   RQ-EAT-ADV-21   BUY an ADVANCER (shift <= -7: a week or more earlier than a year before); hold 21 sessions.
//   RQ-EAT-ADV-63   the same, hold 63 sessions.
//   RQ-EAT-DEL-21   AVOID check: a DELAYER (shift >= +7), 21 sessions, judged with the avoid verdict (never a buy).
// TIMING: the REACTION session of the first filing (research-core IDEA 3 reactionDate: New York acceptance before 16:00 -> that date's
// session, or the next session if that date is not one; 16:00 or later -> the next session) = t; the stock must be liquid (system rule) on
// t; ENTRY the open of t+1 (a pre-market release is bought one session late: conservative, and the nightly scan can act on it); EXIT the
// close `hold` sessions later. One open trade per stock per rule. Events from 2021-10-01 (the cached 8-K lists start 2021-09-01, so the
// first events with a year-ago match fall in late 2022; the older half is shorter, stated in the report).
// DATA RULE (fixed now): no verdict until (a) 95%+ of universe companies have their 8-K list (the IDEA 3 cache), (b) 85%+ of liquid
// stock-months map to an SEC number, (c) 5,000+ announcements with a year-ago match (fewer = the reader is broken: fix it, no verdict).
// AVOID JUDGING (fixed now, stricter than ideas 1 and 4): value-core halfStat's edge charges the 0.8% cost to the trade but not to the
// average stock, so ANY random set of stocks shows edge ~ -0.8% and could pass an avoid test (found 31 Oct 2026 on synthetic random
// prices before this run). RQ-EAT-DEL-21 is therefore judged with avoidVerdict on GROSS returns against the GROSS average stock (the trade's
// return before cost), so only a real lag counts.
// Diagnostic only (not a filter; it uses later filings): the share of signals whose announcement had 2+ item-2.02 filings within 30 days.
export const EAT = { gap: 30, year: 364, window: 30, adv: -7, del: 7, from: '2021-10-01' };
export const EAT_DATA = { subs: 0.95, map: 0.85, events: 5000 };
RULES['RQ-EAT-ADV-21'] = { kind: 'buy', hold: 21, side: 'adv', family: 'eat', name: 'Earnings reported a week or more EARLIER than a year before (advancer), hold 1 month',
  rule: 'Buy the open of the session after the reaction session of an earnings 8-K (item 2.02) whose date is 7+ calendar days earlier than the company\'s year-ago announcement date + 364 days (year-ago = closest announcement within +-30 days of date - 364; filings within 30 days = one announcement); stock liquid on the reaction session; sell the close 21 sessions later.' };
RULES['RQ-EAT-ADV-63'] = { kind: 'buy', hold: 63, side: 'adv', family: 'eat', name: 'Earnings reported a week or more EARLIER than a year before (advancer), hold 3 months', rule: 'As RQ-EAT-ADV-21, hold 63 sessions.' };
RULES['RQ-EAT-DEL-21'] = { kind: 'avoid', hold: 21, side: 'del', family: 'eat', name: 'AVOID check: earnings reported a week or more LATER than a year before (delayer), 21 sessions',
  rule: 'Information only: earnings 8-Ks dated 7+ calendar days later than the year-ago date + 364, bought the session after the reaction session, 21 sessions; a valid AVOID filter if they lag the average stock in both halves BEFORE cost (gross vs gross; block t <= -2.5 for CONFIRMED). Never a buy.' };
export const EAT_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'eat');
for (const id of EAT_IDS) { if (!IDS.includes(id)) IDS.push(id); if (RULES[id].kind === 'buy' && !BUY_IDS.includes(id)) BUY_IDS.push(id); ONE_OPEN.add(id); }
// 8-K list [[acceptance, items]] -> announcements [{ d (New York date of the first filing), accept, n (item-2.02 filings in the group) }]
export function eatAnnouncements(list, ny) { const f = [];
  for (const [acc, items] of list || []) { if (!isEarnings(items)) continue; const x = ny(acc); if (!x || !x.d) continue; f.push({ d: x.d, accept: acc }); }
  f.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : String(a.accept) < String(b.accept) ? -1 : 1); const out = [];
  for (const z of f) { const last = out[out.length - 1]; if (last && daysBetween(last.d, z.d) <= EAT.gap) { last.n++; continue; } out.push({ d: z.d, accept: z.accept, n: 1 }); }
  return out; }
// announcements -> timing events [{ d, accept, prev, shift, n, side }] (each announcement with a year-ago match)
export function eatEvents(anns) { const out = [];
  for (const a of anns || []) { const target = addDays(a.d, -EAT.year); let best = null;
    for (const b of anns) { if (b === a || b.d >= a.d) continue; const gap = Math.abs(daysBetween(b.d, target)); if (gap > EAT.window) continue;
      if (!best || gap < Math.abs(daysBetween(best.d, target))) best = b; }
    if (!best) continue; const shift = daysBetween(addDays(best.d, EAT.year), a.d);
    out.push({ d: a.d, accept: a.accept, prev: best.d, shift, n: a.n, side: shift <= EAT.adv ? 'adv' : shift >= EAT.del ? 'del' : null }); }
  return out; }
export function eatDataRule({ ciks, subsOk, liqMonths, liqMapped, events }) { const r = { subs: ciks ? subsOk / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.subs >= EAT_DATA.subs)) why.push('8-K lists read ' + (r.subs * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= EAT_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  if (!(events >= EAT_DATA.events)) why.push('announcements with a year-ago match ' + events + ' (5,000 needed: reader check)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), events, why: why.join('; ') || null }; }
const EAT_SOURCES = ['https://doi.org/10.1017/S0022109018000492', 'https://dspace.mit.edu/handle/1721.1/122364', 'https://doi.org/10.1016/S0165-4101(02)00048-6'];
const EAT_NOTE = 'Daily researcher 2026-10-31: Johnson and So (2018, JFQA) "Time Will Tell": advancers (earnings earlier than usual) beat delayers. New information family (the timing of a company\'s own earnings releases, from official SEC 8-K item 2.02 acceptance times), not in the library. Buy advancers; delayers as an avoid check. Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun; forward paper from 30 Oct 2026.';
export function preRegisterEat(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of EAT_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-10-31 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Grouping, year-ago match, shift thresholds, timing and data rule fixed in research-core.mjs (IDEA 5) before any run.', sources: EAT_SOURCES, hold: R.hold, note: EAT_NOTE }); ch++; }
  return ch; }

// ---------------- IDEA 6 (pre-registered 1 Nov 2026, before any run): TAX EXPENSE MOMENTUM (tax expense surprise) ----------------
// Source: Thomas and Zhang, "Tax Expense Momentum", Journal of Accounting Research 49(3), 2011, 791-821 (doi 10.1111/j.1475-679X.2011.00409.x;
// working paper "Tax expense surprises and future returns", Yale ICF 2531, 2007): dT = tax expense in quarter q minus tax expense in
// quarter q-4, scaled by assets of q-4; the top decile beat the bottom decile by 3.89% over the next three months (1977-2005, t 10.9;
// 2.58% after removing the book-income surprise); strong for two quarters, then gone. Tax expense is a cleaner read of true taxable profit
// (managers manage book income more than tax). NEW information (the tax line of the income statement, official SEC XBRL); nothing in the
// library uses it (SQ12-REVEPS uses revenue and EPS). Long only: buy the top; the bottom is an AVOID check (never a buy).
// MEASURE (fixed now, no tuning): us-gaap:IncomeTaxExpenseBenefit, unit USD, DISCRETE QUARTERS only (start..end 80-100 days), forms 10-Q
// or 10-K (no amendments), period end from 2019-06-01. us-gaap:Assets (instant, USD, 10-Q/10-K). Read in order of the SEC 'filed' date.
// A filing date F is an EVENT when the latest quarter end E it reports is later than every quarter end reported before F and
// 0 <= F - E <= 120 days. CURRENT = that filing's quarter value for E. PRIOR = the quarter value (latest filed on or before F) for the
// quarter end closest to E - 365 within E-385..E-345. ASSETS = total assets (latest filed on or before F) at the instant closest to the
// PRIOR end within +-20 days; ASSETS >= 10M USD. dT = (CURRENT - PRIOR) / ASSETS (totals, not per share: a simplification, stated).
// Q4 is rarely tagged as a discrete quarter in 10-Ks, so most events are Q1-Q3 10-Qs (stated in the report).
// RANK (point in time, the lazy-prices ranker): dT's percentile among ALL events filed in the 365 days before F (300+ needed).
//   RQ-TAX-63     BUY the next open after a filing whose dT is in the top 20% (percentile >= 0.80); sell the close 63 later (the paper's 3 months).
//   RQ-TAX-126    the same, hold 126 sessions (the paper's two quarters).
//   RQ-TAX-LOW63  AVOID check: bottom 20% dT (percentile <= 0.20), 63 sessions; judged GROSS vs GROSS (the 31 Oct method fix). Never a buy.
// Public on the 'filed' date: bought at the OPEN of the first session strictly AFTER it (conservative). Liquid (system rule) on the
// session before entry. One open trade per stock per rule.
// DATA RULE (fixed now): no verdict until (a) 95%+ of universe companies looked up in the SEC bulk company facts file, (b) 85%+ of liquid
// stock-months map to an SEC number, (c) 15,000+ events from 2021-10-01 (fewer = the reader is broken: fix it, no verdict).
export const TAX = { tag: 'IncomeTaxExpenseBenefit', assets: 'Assets', endFrom: '2019-06-01', qLo: 80, qHi: 100, maxLag: 120, prevLo: 345, prevHi: 385, aWin: 20, minAssets: 10e6, eventsFrom: '2021-10-01' };
export const TAX_DATA = { looked: 0.95, map: 0.85, events: 15000 };
RULES['RQ-TAX-63'] = { kind: 'buy', hold: 63, side: 'top', family: 'tax', name: 'Tax expense surprise (tax up vs a year before, per assets) in the top 20%, hold 3 months',
  rule: 'Buy the next open after a 10-Q/10-K whose quarterly income tax expense minus the same quarter a year before, divided by total assets a year before (SEC XBRL), is in the top 20% (percentile >= 0.80 vs all such filings of the prior 365 days; filed within 120 days of the quarter end; assets 10M USD+); stock liquid; sell the close 63 sessions later.' };
RULES['RQ-TAX-126'] = { kind: 'buy', hold: 126, side: 'top', family: 'tax', name: 'Tax expense surprise in the top 20%, hold 6 months', rule: 'As RQ-TAX-63, hold 126 sessions.' };
RULES['RQ-TAX-LOW63'] = { kind: 'avoid', hold: 63, side: 'bottom', family: 'tax', name: 'AVOID check: tax expense surprise in the bottom 20%, 63 sessions',
  rule: 'Information only: stocks whose tax expense change per assets is among the 20% lowest (percentile <= 0.20), bought next open, 63 sessions; a valid AVOID filter if they lag the average stock in both halves BEFORE cost (gross vs gross; block t <= -2.5 for CONFIRMED). Never a buy.' };
export const TAX_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'tax');
for (const id of TAX_IDS) { if (!IDS.includes(id)) IDS.push(id); if (RULES[id].kind === 'buy' && !BUY_IDS.includes(id)) BUY_IDS.push(id); ONE_OPEN.add(id); }
// companyfacts JSON -> { q: [[start, end, val, filed, form]] discrete quarters of tax expense, a: [[end, val, filed]] assets }, sorted by filed
export function taxRows(j) { const g = j && j.facts && j.facts['us-gaap'], uq = g && g[TAX.tag] && g[TAX.tag].units, ua = g && g[TAX.assets] && g[TAX.assets].units;
  const q = [], a = [], sq = new Set(), sa = new Set(), form = (x) => x.form === '10-Q' || x.form === '10-K';
  for (const x of (uq && Array.isArray(uq.USD) ? uq.USD : [])) { if (!x || !x.start || !x.end || !x.filed || !ok(x.val) || !form(x) || x.end < TAX.endFrom) continue;
    const len = daysBetween(x.start, x.end); if (len < TAX.qLo || len > TAX.qHi) continue; const k = x.start + '|' + x.end + '|' + x.val + '|' + x.filed; if (sq.has(k)) continue; sq.add(k); q.push([x.start, x.end, x.val, x.filed, x.form]); }
  for (const x of (ua && Array.isArray(ua.USD) ? ua.USD : [])) { if (!x || x.start || !x.end || !x.filed || !ok(x.val) || x.val <= 0 || !form(x) || x.end < '2018-03-01') continue;
    const k = x.end + '|' + x.val + '|' + x.filed; if (sa.has(k)) continue; sa.add(k); a.push([x.end, x.val, x.filed]); }
  const byF = (i) => (p, r) => p[i] < r[i] ? -1 : p[i] > r[i] ? 1 : 0;
  return { q: q.sort((p, r) => byF(3)(p, r) || byF(1)(p, r)), a: a.sort((p, r) => byF(2)(p, r) || byF(0)(p, r)) }; }
// rows -> events [{ d (filed), end, cur, prior, assets, g (= dT), form }]
export function taxEvents(rows) { const out = [], q = (rows && rows.q) || [], A = (rows && rows.a) || []; let maxEnd = '';
  const byF = new Map(); for (const r of q) (byF.get(r[3]) || byF.set(r[3], []).get(r[3])).push(r);
  const known = [];
  for (const F of [...byF.keys()].sort()) { const here = byF.get(F); known.push(...here); const E = here.reduce((m, r) => r[1] > m ? r[1] : m, '');
    if (E > maxEnd && daysBetween(E, F) >= 0 && daysBetween(E, F) <= TAX.maxLag) { const cur = here.filter(r => r[1] === E).pop()[2], target = addDays(E, -365); let best = null;
      for (const r of known) { const gap = daysBetween(r[1], E); if (gap < TAX.prevLo || gap > TAX.prevHi) continue;
        if (!best || Math.abs(daysBetween(r[1], target)) < Math.abs(daysBetween(best[1], target)) || (r[1] === best[1] && r[3] >= best[3])) best = r; }
      let as = null; if (best) for (const x of A) { if (x[2] > F) break; const gap = Math.abs(daysBetween(x[0], best[1])); if (gap > TAX.aWin) continue;
        if (!as || gap < Math.abs(daysBetween(as[0], best[1])) || (x[0] === as[0] && x[2] >= as[2])) as = x; }
      if (best && as && as[1] >= TAX.minAssets) out.push({ d: F, end: E, cur, prior: best[2], assets: as[1], g: +((cur - best[2]) / as[1]).toFixed(6), form: here.find(r => r[1] === E)[4] }); }
    if (E > maxEnd) maxEnd = E; }
  return out; }
export function taxDataRule({ ciks, looked, liqMonths, liqMapped, events }) { const r = { looked: ciks ? looked / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.looked >= TAX_DATA.looked)) why.push('company facts looked up ' + (r.looked * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= TAX_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  if (!(events >= TAX_DATA.events)) why.push('tax surprise events ' + events + ' (15,000 needed: reader check)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), events, why: why.join('; ') || null }; }
const TAX_SOURCES = ['https://doi.org/10.1111/j.1475-679X.2011.00409.x', 'https://ideas.repec.org/a/bla/joares/v49y2011i3p791-821.html', 'https://repec.som.yale.edu/icfpub/publications/2531.pdf'];
const TAX_NOTE = 'Daily researcher 2026-11-01: Thomas and Zhang (2011, JAR) "Tax Expense Momentum": the year-on-year change in quarterly tax expense, per assets, predicts returns for two quarters (top minus bottom decile 3.89% over 3 months, 1977-2005). New information family (the tax line, official SEC XBRL company facts), not in the library. Buy top 20%; bottom 20% as an avoid check (gross vs gross). Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun; forward paper from 2 Nov 2026.';
export function preRegisterTax(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of TAX_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-11-01 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Measure, quarter filter, year-ago match, assets scaling, ranking and data rule fixed in research-core.mjs (IDEA 6) before any run.', sources: TAX_SOURCES, hold: R.hold, note: TAX_NOTE }); ch++; }
  return ch; }
// ---------------- IDEA 7 (pre-registered 2 Nov 2026, before any run): R&D INCREASES (Eberhart, Maxwell and Siddique 2004) ----------------
// Source: Eberhart, Maxwell and Siddique, "An Examination of Long-Term Abnormal Stock Returns and Operating Performance Following R&D
// Increases", Journal of Finance 59(2), 2004, 623-650 (doi 10.1111/j.1540-6261.2004.00644.x); follow-up "Does the stock market underreact
// to R&D increases?" (JOIM 2008). Firms that raise R&D by a meaningful amount (R&D intensity 5%+, R&D up 5%+ and R&D per assets up 5%+)
// earned positive long-term abnormal returns over the next years: the market under-reacts to the benefit of the extra R&D.
// NEW EVENT: the library has R&D LEVEL (ANOM-RD, rejected) and R&D share of revenue with growth and margins (SQ4-RDCOMP, rejected); no
// rule uses a year-on-year R&D INCREASE event. Long only.
// MEASURE (fixed now, no tuning): us-gaap:ResearchAndDevelopmentExpense (unit USD; a company with no quarter of it uses
// us-gaap:ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost instead), DISCRETE QUARTERS only (80-100 days), forms 10-Q/10-K
// (no amendments), period end from 2019-06-01; us-gaap:Assets (instant, USD). Event timing, quarter matching and the 120-day freshness
// rule exactly as IDEA 6 (taxEvents): an EVENT is a filing date F whose latest quarter end E is new and 0-120 days old; CUR = R&D of E,
// PRIOR = R&D of the quarter ending E-365 (E-385..E-345, latest filed on or before F); A1 = assets at E, A0 = assets at the prior end
// (instant within +-20 days, latest filed on or before F). A0 >= 10M USD, CUR > 0, PRIOR > 0.
// QUALIFIES (the paper's three tests, quarterly year-on-year form): CUR >= 1.05 x PRIOR, CUR/A1 >= 1.05 x PRIOR/A0, 4 x CUR / A1 >= 5%.
// Simplification (stated): the paper also asks R&D/sales >= 5%; not used here (revenue tags vary). The paper is annual; this is the
// same test on each quarter versus the same quarter a year before.
//   RQ-RDI-126  BUY the next open after a qualifying filing (stock liquid on the session before); sell the close 126 sessions later.
//   RQ-RDI-252  the same, hold 252 sessions (one year; the paper's effect is long-term).
// One open trade per stock per rule. No ranking, no tuning.
// DATA RULE (fixed now): no verdict until (a) 95%+ of universe companies looked up in the SEC bulk company facts file, (b) 85%+ of liquid
// stock-months map to an SEC number, (c) 10,000+ R&D year-on-year events (qualifying or not) from 2021-10-01 (fewer = reader broken).
export const RDI = { tags: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'], assets: 'Assets', endFrom: '2019-06-01', qLo: 80, qHi: 100, maxLag: 120, prevLo: 345, prevHi: 385, aWin: 20, minAssets: 10e6, rise: 1.05, intensity: 0.05, eventsFrom: '2021-10-01' };
export const RDI_DATA = { looked: 0.95, map: 0.85, events: 10000 };
RULES['RQ-RDI-126'] = { kind: 'buy', hold: 126, family: 'rdi', name: 'R&D increase (R&D up 5%+ on a year before, per assets up 5%+, R&D 5%+ of assets), hold 6 months',
  rule: 'Buy the next open after a 10-Q/10-K (SEC XBRL) whose quarterly R&D expense is 5%+ above the same quarter a year before, whose R&D per total assets is also 5%+ higher, and whose annualised R&D (4 x quarter) is 5%+ of assets (filed within 120 days of the quarter end; assets 10M USD+); stock liquid; sell the close 126 sessions later.' };
RULES['RQ-RDI-252'] = { kind: 'buy', hold: 252, family: 'rdi', name: 'R&D increase, hold 1 year', rule: 'As RQ-RDI-126, hold 252 sessions.' };
export const RDI_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'rdi');
for (const id of RDI_IDS) { if (!IDS.includes(id)) IDS.push(id); if (!BUY_IDS.includes(id)) BUY_IDS.push(id); ONE_OPEN.add(id); }
// companyfacts JSON -> { q: [[start, end, val, filed, form]] R&D discrete quarters, a: [[end, val, filed]] assets, tag }, sorted by filed
export function rdiRows(j) { const g = j && j.facts && j.facts['us-gaap'], form = (x) => x.form === '10-Q' || x.form === '10-K';
  const quarters = (tag) => { const u = g && g[tag] && g[tag].units, q = [], s = new Set();
    for (const x of (u && Array.isArray(u.USD) ? u.USD : [])) { if (!x || !x.start || !x.end || !x.filed || !ok(x.val) || !form(x) || x.end < RDI.endFrom) continue;
      const len = daysBetween(x.start, x.end); if (len < RDI.qLo || len > RDI.qHi) continue; const k = x.start + '|' + x.end + '|' + x.val + '|' + x.filed; if (s.has(k)) continue; s.add(k); q.push([x.start, x.end, x.val, x.filed, x.form]); }
    return q; };
  let q = quarters(RDI.tags[0]), tag = RDI.tags[0]; if (!q.length) { q = quarters(RDI.tags[1]); tag = q.length ? RDI.tags[1] : null; }
  const ua = g && g[RDI.assets] && g[RDI.assets].units, a = [], sa = new Set();
  for (const x of (ua && Array.isArray(ua.USD) ? ua.USD : [])) { if (!x || x.start || !x.end || !x.filed || !ok(x.val) || x.val <= 0 || !form(x) || x.end < '2018-03-01') continue;
    const k = x.end + '|' + x.val + '|' + x.filed; if (sa.has(k)) continue; sa.add(k); a.push([x.end, x.val, x.filed]); }
  const byF = (i) => (p, r) => p[i] < r[i] ? -1 : p[i] > r[i] ? 1 : 0;
  return { q: q.sort((p, r) => byF(3)(p, r) || byF(1)(p, r)), a: a.sort((p, r) => byF(2)(p, r) || byF(0)(p, r)), tag }; }
const assetsNear = (A, F, end) => { let as = null; for (const x of A) { if (x[2] > F) break; const gap = Math.abs(daysBetween(x[0], end)); if (gap > RDI.aWin) continue;
  if (!as || gap < Math.abs(daysBetween(as[0], end)) || (x[0] === as[0] && x[2] >= as[2])) as = x; } return as; };
// rows -> events [{ d (filed), end, cur, prior, a1, a0, g (= CUR/PRIOR - 1), intensity (4 CUR / A1), qualifies, form }]
export function rdiEvents(rows) { const out = [], q = (rows && rows.q) || [], A = (rows && rows.a) || []; let maxEnd = '';
  const byF = new Map(); for (const r of q) (byF.get(r[3]) || byF.set(r[3], []).get(r[3])).push(r);
  const known = [];
  for (const F of [...byF.keys()].sort()) { const here = byF.get(F); known.push(...here); const E = here.reduce((m, r) => r[1] > m ? r[1] : m, '');
    if (E > maxEnd && daysBetween(E, F) >= 0 && daysBetween(E, F) <= RDI.maxLag) { const cur = here.filter(r => r[1] === E).pop()[2], target = addDays(E, -365); let best = null;
      for (const r of known) { const gap = daysBetween(r[1], E); if (gap < RDI.prevLo || gap > RDI.prevHi) continue;
        if (!best || Math.abs(daysBetween(r[1], target)) < Math.abs(daysBetween(best[1], target)) || (r[1] === best[1] && r[3] >= best[3])) best = r; }
      const a0 = best ? assetsNear(A, F, best[1]) : null, a1 = assetsNear(A, F, E);
      if (best && a0 && a1 && a0[1] >= RDI.minAssets && cur > 0 && best[2] > 0) { const prior = best[2], intensity = 4 * cur / a1[1];
        const qualifies = cur >= RDI.rise * prior - 1e-9 && cur / a1[1] >= RDI.rise * prior / a0[1] - 1e-12 && intensity >= RDI.intensity - 1e-12;
        out.push({ d: F, end: E, cur, prior, a1: a1[1], a0: a0[1], g: +(cur / prior - 1).toFixed(6), intensity: +intensity.toFixed(6), qualifies, form: here.find(r => r[1] === E)[4] }); } }
    if (E > maxEnd) maxEnd = E; }
  return out; }
export function rdiDataRule({ ciks, looked, liqMonths, liqMapped, events }) { const r = { looked: ciks ? looked / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.looked >= RDI_DATA.looked)) why.push('company facts looked up ' + (r.looked * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= RDI_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  if (!(events >= RDI_DATA.events)) why.push('R&D year-on-year events ' + events + ' (10,000 needed: reader check)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), events, why: why.join('; ') || null }; }
const RDI_SOURCES = ['https://doi.org/10.1111/j.1540-6261.2004.00644.x', 'https://papers.ssrn.com/abstract=560043', 'https://papers.ssrn.com/abstract=897385'];
const RDI_NOTE = 'Daily researcher 2026-11-02: Eberhart, Maxwell and Siddique (2004, Journal of Finance) R&D increases: firms that raise R&D meaningfully (intensity 5%+, R&D and R&D/assets up 5%+) earned positive long-term abnormal returns. New event (the year-on-year R&D increase; ANOM-RD tested the level, SQ4-RDCOMP the share of revenue with growth). Quarterly year-on-year version from official SEC XBRL company facts; R&D/sales test left out (stated). Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun; forward paper from 3 Nov 2026.';
export function preRegisterRdi(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of RDI_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-11-02 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Measure, quarter filter, year-ago match, the three increase tests and the data rule fixed in research-core.mjs (IDEA 7) before any run.', sources: RDI_SOURCES, hold: R.hold, note: RDI_NOTE }); ch++; }
  return ch; }
// ---------------- IDEA 8 (pre-registered 3 Nov 2026, before any run): INVENTORY CHANGES (Thomas and Zhang 2002) ----------------
// Source: Thomas and Zhang, "Inventory Changes and Future Returns", Review of Accounting Studies 7, 2002, 163-187 (doi 10.1023/A:1020274002135):
// the accrual anomaly is mostly the inventory part; firms whose inventory rises most (per average assets) earn lower returns over the next
// year and firms whose inventory falls most earn higher returns. NEW information line (the inventory balance, official SEC XBRL); the
// library has total accruals (ANOM-ACC, rejected) and a days-of-inventory screen inside SQ12 (a level, not the change). Long only: buy the
// bottom (inventory cut the most); the top (inventory built the most) is an AVOID check (never a buy).
// MEASURE (fixed now, no tuning): us-gaap:InventoryNet (instant, USD, forms 10-Q/10-K, no amendments, end from 2019-06-01); us-gaap:Assets
// (instant). Only InventoryNet (other inventory tags not used; stated). A filing date F is an EVENT when the latest inventory instant E it
// reports is later than every instant reported before F and 0 <= F - E <= 120 days (10-K year ends included: a balance, not a flow).
// CUR = that filing's inventory at E; PRIOR = inventory at the instant closest to E - 365 within E-385..E-345 (latest filed on or before F);
// PRIOR > 0 (an inventory holder). A1 = assets at E, A0 = assets at the PRIOR instant (+-20 days, latest filed on or before F); A0 >= 10M USD.
// dINV = (CUR - PRIOR) / ((A0 + A1) / 2) (the paper's scaling by average total assets).
// RANK (point in time, the lazy-prices ranker): dINV's percentile among ALL events filed in the 365 days before F (300+ needed).
//   RQ-INV-LOW126  BUY the next open after a filing whose dINV is in the bottom 20% (percentile <= 0.20); sell the close 126 sessions later.
//   RQ-INV-LOW252  the same, hold 252 sessions (the paper's one-year window).
//   RQ-INV-TOP126  AVOID check: top 20% dINV (percentile >= 0.80), 126 sessions; judged GROSS vs GROSS (31 Oct method). Never a buy.
// Public on the 'filed' date: bought at the OPEN of the first session strictly AFTER it. Liquid (system rule) on the session before entry.
// One open trade per stock per rule.
// DATA RULE (fixed now): no verdict until (a) 95%+ of universe companies looked up in the SEC bulk company facts file, (b) 85%+ of liquid
// stock-months map to an SEC number, (c) 10,000+ inventory events from 2021-10-01 (fewer = the reader is broken: fix it, no verdict).
export const INV = { tag: 'InventoryNet', assets: 'Assets', endFrom: '2019-06-01', maxLag: 120, prevLo: 345, prevHi: 385, aWin: 20, minAssets: 10e6, eventsFrom: '2021-10-01' };
export const INV_DATA = { looked: 0.95, map: 0.85, events: 10000 };
RULES['RQ-INV-LOW126'] = { kind: 'buy', hold: 126, side: 'bottom', family: 'inv', name: 'Inventory cut (inventory change vs a year before, per average assets) in the bottom 20%, hold 6 months',
  rule: 'Buy the next open after a 10-Q/10-K whose inventory (us-gaap InventoryNet) minus the inventory a year before, divided by average total assets, is in the bottom 20% (percentile <= 0.20 vs all such filings of the prior 365 days; filed within 120 days of the balance date; year-ago inventory > 0; assets 10M USD+); stock liquid; sell the close 126 sessions later.' };
RULES['RQ-INV-LOW252'] = { kind: 'buy', hold: 252, side: 'bottom', family: 'inv', name: 'Inventory cut in the bottom 20%, hold 1 year', rule: 'As RQ-INV-LOW126, hold 252 sessions.' };
RULES['RQ-INV-TOP126'] = { kind: 'avoid', hold: 126, side: 'top', family: 'inv', name: 'AVOID check: inventory build-up in the top 20%, 126 sessions',
  rule: 'Information only: stocks whose inventory change per average assets is among the 20% highest (percentile >= 0.80), bought next open, 126 sessions; a valid AVOID filter if they lag the average stock in both halves BEFORE cost (gross vs gross; block t <= -2.5 for CONFIRMED). Never a buy.' };
export const INV_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'inv');
for (const id of INV_IDS) { if (!IDS.includes(id)) IDS.push(id); if (RULES[id].kind === 'buy' && !BUY_IDS.includes(id)) BUY_IDS.push(id); ONE_OPEN.add(id); }
// companyfacts JSON -> { v: [[end, val, filed, form]] inventory instants, a: [[end, val, filed]] assets }, sorted by filed
export function invRows(j) { const g = j && j.facts && j.facts['us-gaap'], form = (x) => x.form === '10-Q' || x.form === '10-K';
  const inst = (tag, from, pos) => { const u = g && g[tag] && g[tag].units, o = [], s = new Set();
    for (const x of (u && Array.isArray(u.USD) ? u.USD : [])) { if (!x || x.start || !x.end || !x.filed || !ok(x.val) || x.val < 0 || (pos && x.val <= 0) || !form(x) || x.end < from) continue;
      const k = x.end + '|' + x.val + '|' + x.filed; if (s.has(k)) continue; s.add(k); o.push([x.end, x.val, x.filed, x.form]); }
    return o.sort((p, r) => p[2] < r[2] ? -1 : p[2] > r[2] ? 1 : p[0] < r[0] ? -1 : p[0] > r[0] ? 1 : 0); };
  return { v: inst(INV.tag, '2018-03-01', false), a: inst(INV.assets, '2018-03-01', true).map(x => [x[0], x[1], x[2]]) }; }
const invAssetsNear = (A, F, end) => { let as = null; for (const x of A) { if (x[2] > F) break; const gap = Math.abs(daysBetween(x[0], end)); if (gap > INV.aWin) continue;
  if (!as || gap < Math.abs(daysBetween(as[0], end)) || (x[0] === as[0] && x[2] >= as[2])) as = x; } return as; };
// rows -> events [{ d (filed), end, cur, prior, a0, a1, g (= dINV), form }]
export function invEvents(rows) { const out = [], v = (rows && rows.v) || [], A = (rows && rows.a) || []; let maxEnd = '';
  const byF = new Map(); for (const r of v) (byF.get(r[2]) || byF.set(r[2], []).get(r[2])).push(r);
  const known = [];
  for (const F of [...byF.keys()].sort()) { const here = byF.get(F); known.push(...here); const E = here.reduce((m, r) => r[0] > m ? r[0] : m, '');
    if (E > maxEnd && E >= INV.endFrom && daysBetween(E, F) >= 0 && daysBetween(E, F) <= INV.maxLag) { const cur = here.filter(r => r[0] === E).pop()[1], target = addDays(E, -365); let best = null;
      for (const r of known) { const gap = daysBetween(r[0], E); if (gap < INV.prevLo || gap > INV.prevHi) continue;
        if (!best || Math.abs(daysBetween(r[0], target)) < Math.abs(daysBetween(best[0], target)) || (r[0] === best[0] && r[2] >= best[2])) best = r; }
      const a0 = best ? invAssetsNear(A, F, best[0]) : null, a1 = invAssetsNear(A, F, E);
      if (best && best[1] > 0 && a0 && a1 && a0[1] >= INV.minAssets) out.push({ d: F, end: E, cur, prior: best[1], a0: a0[1], a1: a1[1], g: +((cur - best[1]) / ((a0[1] + a1[1]) / 2)).toFixed(6), form: here.find(r => r[0] === E)[3] }); }
    if (E > maxEnd) maxEnd = E; }
  return out; }
export function invDataRule({ ciks, looked, liqMonths, liqMapped, events }) { const r = { looked: ciks ? looked / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.looked >= INV_DATA.looked)) why.push('company facts looked up ' + (r.looked * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= INV_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  if (!(events >= INV_DATA.events)) why.push('inventory change events ' + events + ' (10,000 needed: reader check)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), events, why: why.join('; ') || null }; }
const INV_SOURCES = ['https://doi.org/10.1023/A:1020274002135', 'https://www3.ntu.edu.sg/home/HuaiZhang/inventory%20paper-RAST.pdf'];
const INV_NOTE = 'Daily researcher 2026-11-03: Thomas and Zhang (2002, Review of Accounting Studies) "Inventory Changes and Future Returns": the year-on-year inventory change per average assets predicts returns (inventory cutters beat inventory builders over the next year; the inventory part drives the accrual anomaly). New line (the inventory balance, official SEC XBRL company facts); ANOM-ACC tested total accruals. Buy bottom 20%; top 20% as an avoid check (gross vs gross). Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun; forward paper from 4 Nov 2026.';
export function preRegisterInv(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of INV_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-11-03 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Measure, event timing, year-ago match, average-assets scaling, ranking and data rule fixed in research-core.mjs (IDEA 8) before any run.', sources: INV_SOURCES, hold: R.hold, note: INV_NOTE }); ch++; }
  return ch; }

// ---------------- IDEA 9 (pre-registered 4 Nov 2026, before any run): GOODWILL IMPAIRMENTS as a SELL / AVOID warning ----------------
// Sources: Hirschey and Richardson, "Investor Underreaction to Goodwill Write-Offs", Financial Analysts Journal 59(6), 2003, 75-84
// (about -11% abnormal return over the year after a goodwill write-off announcement); Gu and Lev, "Overpriced shares, ill-advised
// acquisitions, and goodwill impairment", The Accounting Review 86(6), 2011. NEW information line (us-gaap GoodwillImpairmentLoss, official
// SEC XBRL); the library has no goodwill or impairment test. Long only: this is an AVOID / SELL-warning check, NEVER a buy (like Squad 29).
// MEASURE (fixed now, no tuning): us-gaap:GoodwillImpairmentLoss (DURATION facts, USD, forms 10-Q/10-K, no amendments, val > 0, end from
// 2019-06-01); us-gaap:Assets (instant). A filing date F is an EVENT when the latest duration end E it reports is later than every end
// reported before F and 0 <= F - E <= 120 days. NEW impairment of that period = the largest, over this filing's facts ending E, of
// (val - the latest-ending earlier fact with the SAME start filed before F, or 0 if none) (a 10-K annual minus the 9-month year-to-date
// already reported; a Q2 year-to-date minus Q1). Size s = new impairment / assets at E (+-20 days, latest filed on or before F); assets
// 10M USD+. Companies with no impairment fact simply have no events.
//   RQ-GWI-AV126  AVOID check: s >= 1% of assets; bought next open; 126 sessions; judged GROSS vs GROSS (31 Oct method). Never a buy.
//   RQ-GWI-AV63   the same, 63 sessions.
//   RQ-GWI-BIG126 AVOID check: s >= 5% of assets; 126 sessions.
// Public on the 'filed' date: entry at the OPEN of the first session strictly AFTER it (an earlier 8-K 2.06 or earnings release may have
// told the market first: stated, not adjusted). Liquid on the session before entry. One open trade per stock per rule.
// A valid SELL reason only if AVOID CONFIRMED (lag the average stock in both halves before cost, block t <= -2.5 in both).
// DATA RULE (fixed now): no verdict until (a) 95%+ of universe companies looked up in the SEC bulk company facts file, (b) 85%+ of liquid
// stock-months map to an SEC number, (c) 300+ events with s >= 1% from 2021-10-01 (fewer = the reader is broken: fix it, no verdict).
export const GWI = { tag: 'GoodwillImpairmentLoss', assets: 'Assets', endFrom: '2019-06-01', maxLag: 120, aWin: 20, minAssets: 10e6, eventsFrom: '2021-10-01', small: 0.01, big: 0.05 };
export const GWI_DATA = { looked: 0.95, map: 0.85, events: 300 };
RULES['RQ-GWI-AV126'] = { kind: 'avoid', hold: 126, min: GWI.small, family: 'gwi', name: 'AVOID check: goodwill impairment of 1%+ of assets in a new 10-Q/10-K, 126 sessions',
  rule: 'Information only: a 10-Q/10-K (filed within 120 days of the period end) reports a NEW goodwill impairment (us-gaap GoodwillImpairmentLoss, net of the same-start year-to-date already reported) of 1%+ of total assets (assets 10M USD+); bought next open, 126 sessions; a valid AVOID / SELL filter if these stocks lag the average stock in both halves BEFORE cost (gross vs gross; block t <= -2.5 for CONFIRMED). Never a buy.' };
RULES['RQ-GWI-AV63'] = { kind: 'avoid', hold: 63, min: GWI.small, family: 'gwi', name: 'AVOID check: goodwill impairment of 1%+ of assets, 63 sessions', rule: 'As RQ-GWI-AV126, 63 sessions. Never a buy.' };
RULES['RQ-GWI-BIG126'] = { kind: 'avoid', hold: 126, min: GWI.big, family: 'gwi', name: 'AVOID check: large goodwill impairment (5%+ of assets), 126 sessions', rule: 'As RQ-GWI-AV126 with a new impairment of 5%+ of total assets. Never a buy.' };
export const GWI_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'gwi');
for (const id of GWI_IDS) { if (!IDS.includes(id)) IDS.push(id); ONE_OPEN.add(id); }
// companyfacts JSON -> { f: [[start, end, val, filed, form]] impairment durations, a: [[end, val, filed]] assets }, sorted by filed
export function gwiRows(j) { const g = j && j.facts && j.facts['us-gaap'], form = (x) => x.form === '10-Q' || x.form === '10-K';
  const u = g && g[GWI.tag] && g[GWI.tag].units, f = [], s = new Set();
  for (const x of (u && Array.isArray(u.USD) ? u.USD : [])) { if (!x || !x.start || !x.end || !x.filed || !ok(x.val) || x.val < 0 || !form(x) || x.end < '2018-03-01' || x.start > x.end) continue;
    const k = x.start + '|' + x.end + '|' + x.val + '|' + x.filed; if (s.has(k)) continue; s.add(k); f.push([x.start, x.end, x.val, x.filed, x.form]); }
  f.sort((p, r) => p[3] < r[3] ? -1 : p[3] > r[3] ? 1 : p[1] < r[1] ? -1 : p[1] > r[1] ? 1 : 0);
  const ua = g && g[GWI.assets] && g[GWI.assets].units, a = [], sa = new Set();
  for (const x of (ua && Array.isArray(ua.USD) ? ua.USD : [])) { if (!x || x.start || !x.end || !x.filed || !ok(x.val) || x.val <= 0 || !form(x) || x.end < '2018-03-01') continue;
    const k = x.end + '|' + x.val + '|' + x.filed; if (sa.has(k)) continue; sa.add(k); a.push([x.end, x.val, x.filed]); }
  a.sort((p, r) => p[2] < r[2] ? -1 : p[2] > r[2] ? 1 : p[0] < r[0] ? -1 : p[0] > r[0] ? 1 : 0);
  return { f, a }; }
const gwiAssetsNear = (A, F, end) => { let as = null; for (const x of A) { if (x[2] > F) break; const gap = Math.abs(daysBetween(x[0], end)); if (gap > GWI.aWin) continue;
  if (!as || gap < Math.abs(daysBetween(as[0], end)) || (x[0] === as[0] && x[2] >= as[2])) as = x; } return as; };
// rows -> events [{ d (filed), end, imp (new impairment), a1, s (= imp / a1), form }] (only new impairments > 0)
export function gwiEvents(rows) { const out = [], f = (rows && rows.f) || [], A = (rows && rows.a) || []; let maxEnd = '';
  const byF = new Map(); for (const r of f) (byF.get(r[3]) || byF.set(r[3], []).get(r[3])).push(r);
  const known = [];
  for (const F of [...byF.keys()].sort()) { const here = byF.get(F), E = here.reduce((m, r) => r[1] > m ? r[1] : m, '');
    if (E > maxEnd && E >= GWI.endFrom && daysBetween(E, F) >= 0 && daysBetween(E, F) <= GWI.maxLag) { let imp = 0;
      for (const r of here.filter(x => x[1] === E)) { let prev = null; for (const q of known) if (q[0] === r[0] && q[1] < E && (!prev || q[1] > prev[1] || (q[1] === prev[1] && q[3] >= prev[3]))) prev = q;
        const inc = r[2] - (prev ? prev[2] : 0); if (inc > imp) imp = inc; }
      const a1 = gwiAssetsNear(A, F, E);
      if (imp > 0 && a1 && a1[1] >= GWI.minAssets) out.push({ d: F, end: E, imp, a1: a1[1], s: +(imp / a1[1]).toFixed(6), form: here.find(r => r[1] === E)[4] }); }
    known.push(...here); if (E > maxEnd) maxEnd = E; }
  return out; }
export function gwiDataRule({ ciks, looked, liqMonths, liqMapped, events }) { const r = { looked: ciks ? looked / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.looked >= GWI_DATA.looked)) why.push('company facts looked up ' + (r.looked * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= GWI_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  if (!(events >= GWI_DATA.events)) why.push('goodwill impairment events of 1%+ of assets ' + events + ' (300 needed: reader check)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), events, why: why.join('; ') || null }; }
const GWI_SOURCES = ['https://rpc.cfainstitute.org/research/financial-analysts-journal/2003/investor-underreaction-to-goodwill-write-offs', 'https://ideas.repec.org/a/taf/ufajxx/v59y2003i6p75-84.html', 'https://researchconnect.buffalo.edu/en/publications/overpriced-shares-ill-advised-acquisitions-and-goodwill-impairmen/'];
const GWI_NOTE = 'Daily researcher 2026-11-04: Hirschey and Richardson (2003, FAJ) found investors underreact to goodwill write-offs (about -11% abnormal over the following year); Gu and Lev (2011, The Accounting Review) link impairments to overpriced acquirers. New line (us-gaap GoodwillImpairmentLoss, official SEC XBRL company facts). AVOID / SELL-warning check only (gross vs gross), never a buy. Run once on 5 years incl. dead stocks; first complete verdict frozen in data/research-lab.json firstRun.';
export function preRegisterGwi(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of GWI_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-11-04 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Measure, new-impairment netting, event timing, assets scaling, thresholds and data rule fixed in research-core.mjs (IDEA 9) before any run.', sources: GWI_SOURCES, hold: R.hold, note: GWI_NOTE }); ch++; }
  return ch; }
// ---------------- IDEA 10 (pre-registered 5 Nov 2026, before any run): GROSS PROFITABILITY CHANGE (profitability trend) ----------------
// Source: Akbas, Jiang and Koch, "The Trend in Firm Profitability and the Cross-Section of Stock Returns", The Accounting Review 92(5),
// 2017, 1-32 (doi 10.2308/accr-51708): firms whose gross profitability (gross profit / assets) has been RISING earn higher future returns,
// beyond the level of profitability (Novy-Marx) and beyond earnings surprises. NEW information line in this library: ANOM-GP tested the
// LEVEL of gross profitability (rejected) and SQ12-REVEPS / B-EM1 revenue and EPS surprises; nothing tests the change in gross profit.
// SIMPLIFICATION (stated now): the paper fits a trend over the past 8 quarters; here the trend is read as the year-on-year change in the
// quarter's gross profit per assets (the same event machinery as IDEA 6), one number per filing. Long only: buy the top; bottom = AVOID check.
// MEASURE (fixed now, no tuning): us-gaap:GrossProfit, unit USD, DISCRETE QUARTERS only (start..end 80-100 days), forms 10-Q or 10-K
// (no amendments), period end from 2019-06-01. us-gaap:Assets (instant). Read in order of the SEC 'filed' date. A filing date F is an
// EVENT when the latest quarter end E it reports is later than every quarter end reported before F and 0 <= F - E <= 120 days.
// CURRENT = that filing's gross profit for E; PRIOR = the quarter value (latest filed on or before F) for the quarter end closest to
// E - 365 within E-385..E-345. ASSETS = total assets (latest filed on or before F) at the instant closest to the PRIOR end within +-20
// days; ASSETS >= 10M USD. dGP = (CURRENT - PRIOR) / ASSETS. Only GrossProfit (companies that do not report a gross profit line are not
// in the test; stated). Q4 is rarely tagged as a discrete quarter, so most events are Q1-Q3 10-Qs (stated in the report).
// RANK (point in time, the lazy-prices ranker): dGP's percentile among ALL events filed in the 365 days before F (300+ needed).
//   RQ-GPC-63     BUY the next open after a filing whose dGP is in the top 20% (percentile >= 0.80); sell the close 63 sessions later.
//   RQ-GPC-126    the same, hold 126 sessions.
//   RQ-GPC-LOW63  AVOID check: bottom 20% dGP (percentile <= 0.20), 63 sessions; judged GROSS vs GROSS (31 Oct method). Never a buy.
// Public on the 'filed' date: bought at the OPEN of the first session strictly AFTER it. Liquid (system rule) on the session before entry.
// One open trade per stock per rule. Gates, costs, halves and verdicts: the shared judge of this file (same as IDEAS 6-8).
// DATA RULE (fixed now): no verdict until (a) 95%+ of universe companies looked up in the SEC bulk company facts file, (b) 85%+ of liquid
// stock-months map to an SEC number, (c) 10,000+ events from 2021-10-01 (fewer = the reader is broken: fix it, no verdict).
export const GPC = { tag: 'GrossProfit', assets: 'Assets', endFrom: '2019-06-01', qLo: 80, qHi: 100, maxLag: 120, prevLo: 345, prevHi: 385, aWin: 20, minAssets: 10e6, eventsFrom: '2021-10-01' };
export const GPC_DATA = { looked: 0.95, map: 0.85, events: 10000 };
RULES['RQ-GPC-63'] = { kind: 'buy', hold: 63, side: 'top', family: 'gpc', name: 'Gross profit rising (quarter vs a year before, per assets) in the top 20%, hold 3 months',
  rule: 'Buy the next open after a 10-Q/10-K whose quarterly gross profit (us-gaap GrossProfit) minus the same quarter a year before, divided by total assets a year before (SEC XBRL), is in the top 20% (percentile >= 0.80 vs all such filings of the prior 365 days; filed within 120 days of the quarter end; assets 10M USD+); stock liquid; sell the close 63 sessions later.' };
RULES['RQ-GPC-126'] = { kind: 'buy', hold: 126, side: 'top', family: 'gpc', name: 'Gross profit rising in the top 20%, hold 6 months', rule: 'As RQ-GPC-63, hold 126 sessions.' };
RULES['RQ-GPC-LOW63'] = { kind: 'avoid', hold: 63, side: 'bottom', family: 'gpc', name: 'AVOID check: gross profit falling (bottom 20%), 63 sessions',
  rule: 'Information only: stocks whose gross profit change per assets is among the 20% lowest (percentile <= 0.20), bought next open, 63 sessions; a valid AVOID filter if they lag the average stock in both halves BEFORE cost (gross vs gross; block t <= -2.5 for CONFIRMED). Never a buy.' };
export const GPC_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'gpc');
for (const id of GPC_IDS) { if (!IDS.includes(id)) IDS.push(id); if (RULES[id].kind === 'buy' && !BUY_IDS.includes(id)) BUY_IDS.push(id); ONE_OPEN.add(id); }
// companyfacts JSON -> { q: [[start, end, val, filed, form]] discrete quarters of gross profit, a: [[end, val, filed]] assets }, sorted by filed
export function gpcRows(j) { const g = j && j.facts && j.facts['us-gaap'], uq = g && g[GPC.tag] && g[GPC.tag].units, ua = g && g[GPC.assets] && g[GPC.assets].units;
  const q = [], a = [], sq = new Set(), sa = new Set(), form = (x) => x.form === '10-Q' || x.form === '10-K';
  for (const x of (uq && Array.isArray(uq.USD) ? uq.USD : [])) { if (!x || !x.start || !x.end || !x.filed || !ok(x.val) || !form(x) || x.end < GPC.endFrom) continue;
    const len = daysBetween(x.start, x.end); if (len < GPC.qLo || len > GPC.qHi) continue; const k = x.start + '|' + x.end + '|' + x.val + '|' + x.filed; if (sq.has(k)) continue; sq.add(k); q.push([x.start, x.end, x.val, x.filed, x.form]); }
  for (const x of (ua && Array.isArray(ua.USD) ? ua.USD : [])) { if (!x || x.start || !x.end || !x.filed || !ok(x.val) || x.val <= 0 || !form(x) || x.end < '2018-03-01') continue;
    const k = x.end + '|' + x.val + '|' + x.filed; if (sa.has(k)) continue; sa.add(k); a.push([x.end, x.val, x.filed]); }
  const byF = (i) => (p, r) => p[i] < r[i] ? -1 : p[i] > r[i] ? 1 : 0;
  return { q: q.sort((p, r) => byF(3)(p, r) || byF(1)(p, r)), a: a.sort((p, r) => byF(2)(p, r) || byF(0)(p, r)) }; }
// rows -> events [{ d (filed), end, cur, prior, assets, g (= dGP), form }]
export function gpcEvents(rows) { const out = [], q = (rows && rows.q) || [], A = (rows && rows.a) || []; let maxEnd = '';
  const byF = new Map(); for (const r of q) (byF.get(r[3]) || byF.set(r[3], []).get(r[3])).push(r);
  const known = [];
  for (const F of [...byF.keys()].sort()) { const here = byF.get(F); known.push(...here); const E = here.reduce((m, r) => r[1] > m ? r[1] : m, '');
    if (E > maxEnd && daysBetween(E, F) >= 0 && daysBetween(E, F) <= GPC.maxLag) { const cur = here.filter(r => r[1] === E).pop()[2], target = addDays(E, -365); let best = null;
      for (const r of known) { const gap = daysBetween(r[1], E); if (gap < GPC.prevLo || gap > GPC.prevHi) continue;
        if (!best || Math.abs(daysBetween(r[1], target)) < Math.abs(daysBetween(best[1], target)) || (r[1] === best[1] && r[3] >= best[3])) best = r; }
      let as = null; if (best) for (const x of A) { if (x[2] > F) break; const gap = Math.abs(daysBetween(x[0], best[1])); if (gap > GPC.aWin) continue;
        if (!as || gap < Math.abs(daysBetween(as[0], best[1])) || (x[0] === as[0] && x[2] >= as[2])) as = x; }
      if (best && as && as[1] >= GPC.minAssets) out.push({ d: F, end: E, cur, prior: best[2], assets: as[1], g: +((cur - best[2]) / as[1]).toFixed(6), form: here.find(r => r[1] === E)[4] }); }
    if (E > maxEnd) maxEnd = E; }
  return out; }
export function gpcDataRule({ ciks, looked, liqMonths, liqMapped, events }) { const r = { looked: ciks ? looked / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.looked >= GPC_DATA.looked)) why.push('company facts looked up ' + (r.looked * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= GPC_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  if (!(events >= GPC_DATA.events)) why.push('gross profit change events ' + events + ' (10,000 needed: reader check)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), events, why: why.join('; ') || null }; }
const GPC_SOURCES = ['https://doi.org/10.2308/accr-51708', 'https://alphaarchitect.com/2015/01/predict-stock-returns-using-the-trend-of-profitability/', 'https://www.cxoadvisory.com/fundamental-valuation/profitability-momentum-as-a-stock-return-indicator/'];
const GPC_NOTE = 'Daily researcher 2026-11-05: Akbas, Jiang and Koch (2017, The Accounting Review) "The Trend in Firm Profitability and the Cross-Section of Stock Returns": rising gross profitability predicts higher returns beyond its level. New line (the change in quarterly gross profit, official SEC XBRL company facts); ANOM-GP tested the level only. Simplified to the year-on-year quarterly change per assets (stated). Buy top 20%; bottom 20% as an avoid check (gross vs gross). Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun; forward paper from 5 Nov 2026.';
export function preRegisterGpc(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of GPC_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-11-05 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Measure, quarter filter, year-ago match, assets scaling, ranking and data rule fixed in research-core.mjs (IDEA 10) before any run.', sources: GPC_SOURCES, hold: R.hold, note: GPC_NOTE }); ch++; }
  return ch; }
// ---------------- IDEA 11 (pre-registered 7 Nov 2026, before any run): DIVIDEND CUTS as a SELL / AVOID warning ----------------
// Sources: Michaely, Thaler and Womack, "Price Reactions to Dividend Initiations and Omissions: Overreaction or Drift?", Journal of Finance
// 50(2), 1995, 573-608 (omissions: about -7% at the news and a further drift of about -11% over the following year); Benartzi, Michaely and
// Thaler, "Do Changes in Dividends Signal the Future or the Past?", Journal of Finance 52(3), 1997. NEW information line (dividend per share,
// official SEC XBRL company facts); the library tested dividend hikes (SQ1-DIVHIKE) and initiations (ANOM-DIVINIT), never cuts.
// Long only: AVOID / SELL-warning check, NEVER a buy (like Squad 29 and IDEA 9).
// MEASURE (fixed now, no tuning): dividend per share of a DISCRETE quarter (start..end 80-100 days), unit USD/shares, forms 10-Q or 10-K (no
// amendments), period end from 2019-06-01, tag us-gaap:CommonStockDividendsPerShareDeclared, else (when a company never uses it)
// us-gaap:CommonStockDividendsPerShareCashPaid. A filing date F is an EVENT when the latest quarter end E it reports is later than every
// quarter end reported before F and 0 <= F - E <= 120 days. CUR = that filing's value for E. PRIOR = the value for the quarter end closest
// to E - 365 within E-385..E-345, taken FROM FILING F ITSELF when it reports it (its comparative is restated for splits), else the latest
// filed before F. PRIOR must be > 0. ratio = CUR / PRIOR.
// SPLIT GUARD (fixed now): total common dividends of the same two quarters (us-gaap DividendsCommonStock, else DividendsCommonStockCash, USD,
// discrete quarters, latest filed on or before F). If both totals are known and the total fell less than 10% (total ratio > 0.90), the
// event is dropped (a per-share fall without a cash fall = a split or a share-count change). If the totals are not known and the ratio is
// within 2% of 1/2, 1/3, 1/4 or 1/5 with CUR > 0, the event is dropped (split-shaped; stated).
//   RQ-DIVCUT-AV126  AVOID check: ratio <= 0.75 (cut 25%+, including to zero); bought next open; 126 sessions; judged GROSS vs GROSS.
//   RQ-DIVCUT-AV63   the same, 63 sessions.
//   RQ-DIVCUT-BIG126 AVOID check: ratio <= 0.50 (cut 50%+ or omitted); 126 sessions.
// Public on the 'filed' date: entry at the OPEN of the first session strictly AFTER it. Most cuts are announced earlier in a press release or
// 8-K, so this measures the drift AFTER the 10-Q/10-K, not the news day (stated; conservative). Liquid on the session before entry.
// One open trade per stock per rule. A valid SELL reason only if AVOID CONFIRMED (lag the average stock in both halves before cost, block
// t <= -2.5 in both).
// DATA RULE (fixed now): no verdict until (a) 95%+ of universe companies looked up in the SEC bulk company facts file, (b) 85%+ of liquid
// stock-months map to an SEC number, (c) 150+ cut events (ratio <= 0.75) from 2021-10-01 (fewer = the reader is broken or too few cuts).
export const DVC = { dps: ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid'], tot: ['DividendsCommonStock', 'DividendsCommonStockCash'], endFrom: '2019-06-01', qLo: 80, qHi: 100, maxLag: 120, prevLo: 345, prevHi: 385, cut: 0.75, big: 0.5, totKeep: 0.90, splitTol: 0.02, eventsFrom: '2021-10-01' };
export const DVC_DATA = { looked: 0.95, map: 0.85, events: 150 };
RULES['RQ-DIVCUT-AV126'] = { kind: 'avoid', hold: 126, max: DVC.cut, family: 'dvc', name: 'AVOID check: quarterly dividend per share cut 25%+ vs a year before (new 10-Q/10-K), 126 sessions',
  rule: 'Information only: a 10-Q/10-K (filed within 120 days of the quarter end) reports a quarterly dividend per share (us-gaap CommonStockDividendsPerShareDeclared, else ...CashPaid) at most 75% of the same quarter a year before (including zero; split guard on total dividends); bought next open, 126 sessions; a valid AVOID / SELL filter if these stocks lag the average stock in both halves BEFORE cost (gross vs gross; block t <= -2.5 for CONFIRMED). Never a buy.' };
RULES['RQ-DIVCUT-AV63'] = { kind: 'avoid', hold: 63, max: DVC.cut, family: 'dvc', name: 'AVOID check: dividend cut 25%+, 63 sessions', rule: 'As RQ-DIVCUT-AV126, 63 sessions. Never a buy.' };
RULES['RQ-DIVCUT-BIG126'] = { kind: 'avoid', hold: 126, max: DVC.big, family: 'dvc', name: 'AVOID check: dividend cut 50%+ or omitted, 126 sessions', rule: 'As RQ-DIVCUT-AV126 with the dividend per share at most 50% of a year before (or zero). Never a buy.' };
export const DVC_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'dvc');
for (const id of DVC_IDS) { if (!IDS.includes(id)) IDS.push(id); ONE_OPEN.add(id); }
const dvcForm = (x) => x.form === '10-Q' || x.form === '10-K';
function dvcQuarters(g, tags, unit, allowZero) { for (const tag of tags) { const u = g && g[tag] && g[tag].units, arr = u && Array.isArray(u[unit]) ? u[unit] : null; if (!arr || !arr.length) continue;
    const out = [], s = new Set();
    for (const x of arr) { if (!x || !x.start || !x.end || !x.filed || !ok(x.val) || x.val < 0 || (!allowZero && x.val === 0) || !dvcForm(x) || x.end < '2018-03-01') continue;
      const len = daysBetween(x.start, x.end); if (len < DVC.qLo || len > DVC.qHi) continue; const k = x.start + '|' + x.end + '|' + x.val + '|' + x.filed; if (s.has(k)) continue; s.add(k); out.push([x.start, x.end, x.val, x.filed, x.form]); }
    if (out.length) return out.sort((p, r) => p[3] < r[3] ? -1 : p[3] > r[3] ? 1 : p[1] < r[1] ? -1 : p[1] > r[1] ? 1 : 0); }
  return []; }
// companyfacts JSON -> { q: [[start, end, dps, filed, form]] discrete quarters (first tag used), t: [[start, end, total, filed, form]] }
export function dvcRows(j) { const g = j && j.facts && j.facts['us-gaap']; return { q: dvcQuarters(g, DVC.dps, 'USD/shares', true), t: dvcQuarters(g, DVC.tot, 'USD', true) }; }
const dvcYearAgo = (list, E, F) => { const target = addDays(E, -365), win = list.filter(r => r[3] <= F && daysBetween(r[1], E) >= DVC.prevLo && daysBetween(r[1], E) <= DVC.prevHi);
  const inF = win.filter(r => r[3] === F), pool = inF.length ? inF : win; let best = null;
  for (const r of pool) { const d0 = Math.abs(daysBetween(r[1], target)), d1 = best ? Math.abs(daysBetween(best[1], target)) : 1e9; if (!best || d0 < d1 || (d0 === d1 && r[3] >= best[3])) best = r; }
  return best; };
const dvcAt = (list, end, F) => { let b = null; for (const r of list) { if (r[3] > F) continue; if (r[1] === end && (!b || r[3] >= b[3])) b = r; } return b; };
export const splitShaped = (ratio) => ratio > 0 && [1 / 2, 1 / 3, 1 / 4, 1 / 5].some(k => Math.abs(ratio - k) <= DVC.splitTol * k * 1.0001 + 1e-12);
// rows -> events [{ d (filed), end, cur, prior, ratio, form, tot (total ratio or null), guard (null | 'total' | 'shape') }]
export function dvcEvents(rows) { const out = [], q = (rows && rows.q) || [], tt = (rows && rows.t) || []; let maxEnd = '';
  const byF = new Map(); for (const r of q) (byF.get(r[3]) || byF.set(r[3], []).get(r[3])).push(r);
  for (const F of [...byF.keys()].sort()) { const here = byF.get(F), E = here.reduce((m, r) => r[1] > m ? r[1] : m, '');
    if (E > maxEnd && E >= DVC.endFrom && daysBetween(E, F) >= 0 && daysBetween(E, F) <= DVC.maxLag) { const cur = here.filter(r => r[1] === E).pop()[2], prev = dvcYearAgo(q, E, F);
      if (prev && prev[2] > 0) { const ratio = +(cur / prev[2]).toFixed(6), t1 = dvcAt(tt, E, F), t0 = t1 ? dvcYearAgo(tt, E, F) : null;
        const tot = t1 && t0 && t0[2] > 0 ? +(t1[2] / t0[2]).toFixed(6) : null;
        const guard = ratio <= DVC.cut ? (tot !== null ? (tot > DVC.totKeep ? 'total' : null) : (cur > 0 && splitShaped(ratio) ? 'shape' : null)) : null;
        out.push({ d: F, end: E, cur, prior: prev[2], ratio, form: here.find(r => r[1] === E)[4], tot, guard }); } }
    if (E > maxEnd) maxEnd = E; }
  return out; }
export function dvcDataRule({ ciks, looked, liqMonths, liqMapped, events }) { const r = { looked: ciks ? looked / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.looked >= DVC_DATA.looked)) why.push('company facts looked up ' + (r.looked * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= DVC_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  if (!(events >= DVC_DATA.events)) why.push('dividend cut events ' + events + ' (150 needed)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), events, why: why.join('; ') || null }; }
const DVC_SOURCES = ['https://doi.org/10.1111/j.1540-6261.1995.tb04796.x', 'https://www.nber.org/papers/w4778', 'https://doi.org/10.1111/j.1540-6261.1997.tb04817.x'];
const DVC_NOTE = 'Daily researcher 2026-11-07: Michaely, Thaler and Womack (1995, Journal of Finance) found dividend omissions are followed by a further drift of about -11% over the next year; research queue item 3. New line (quarterly dividend per share, official SEC XBRL company facts); the library tested hikes (SQ1-DIVHIKE) and initiations (ANOM-DIVINIT) only. AVOID / SELL-warning check only (gross vs gross), never a buy. Run once on 5 years incl. dead stocks; first complete verdict frozen in data/research-lab.json firstRun.';
export function preRegisterDvc(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of DVC_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-11-07 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Measure, tag order, year-ago match, split guard, thresholds and data rule fixed in research-core.mjs (IDEA 11) before any run.', sources: DVC_SOURCES, hold: R.hold, note: DVC_NOTE }); ch++; }
  return ch; }
