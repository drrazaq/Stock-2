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
    if (R.family === 'dst') { ch += preRegisterDst(LB); continue; }
    if (R.family === 'oc') { ch += preRegisterOc(LB); continue; }
    if (R.family === 'wiki') { ch += preRegisterWiki(LB); continue; }
    if (R.family === 'svol') { ch += preRegisterSvol(LB); continue; }
    if (R.family === 'pre') { ch += preRegisterPre(LB); continue; }
    if (R.family === 'sbc') { ch += preRegisterSbc(LB); continue; }
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

// ---------------- IDEA 12 (pre-registered 8 Nov 2026, before any run): DISTRESS RISK (failure probability) as a SELL / AVOID warning ----------------
// Source: Campbell, Hilscher and Szilagyi, "In Search of Distress Risk", Journal of Finance 63(6), 2008, 2899-2939 (NBER w12362): a logit
// failure probability built from accounting and market data; the most distressed stocks (top 1-5%) earned anomalously LOW returns.
// NEW information line in this library: Squad 29 tested danger FILINGS (NT 10-K/10-Q, 8-K 3.01), the F-score family tests quality; nothing
// tests the market-based failure probability. Long only: AVOID / SELL-warning check, NEVER a buy (like Squad 29, IDEAS 9 and 11).
// SCORE (fixed now; the paper's 12-month-ahead logit, Table IV): LPFD = -9.164 - 20.264 NIMTAAVG + 1.416 TLMTA - 7.129 EXRETAVG
//   + 1.411 SIGMA - 0.045 RSIZE - 2.132 CASHMTA + 0.075 MB - 0.058 PRICE. Higher LPFD = higher failure probability.
//   ME = close on the session before entry x shares outstanding (data/shares.json.gz split-adjusted cover counts, latest dated 30+ days
//   before; an unadjusted split-shaped jump (x2,3,4,5,8,10,15,20,25,30,40,50 or 1/x, within 2%) between that count and today's = event
//   dropped). TL = us-gaap Liabilities at the quarter end E (else LiabilitiesAndStockholdersEquity - StockholdersEquity incl. NCI, else
//   - StockholdersEquity). MTA = ME + TL. BE = StockholdersEquity at E (else incl. NCI); MB = ME / max(BE + 0.1 (ME - BE), 1 USD).
//   CASH = CashAndCashEquivalentsAtCarryingValue (else ...RestrictedCash...) + ShortTermInvestments at E (when tagged). Instants within
//   5 days of E, latest filed on or before F.
//   NIMTAAVG = sum w_k NI_k / MTA over the 4 quarters ending E, E-91, E-182, E-274 (+-12 days), w = 0.5333, 0.2667, 0.1333, 0.0667;
//   NI = us-gaap NetIncomeLoss (else ProfitLoss), discrete quarter (80-100 days), else fiscal year (350-380) minus the 9 months (260-285)
//   with the same start; quarter E required, 2+ of 4 needed, weights renormalised over those present. SIMPLIFICATION (stated): the
//   current MTA divides all four quarters (the paper uses each quarter's MTA).
//   EXRETAVG = weighted average of monthly (21-session) log excess returns vs SPY over the 6 months before entry, weight 2^(-(m-1)/3);
//   4+ of 6 months needed. SIMPLIFICATION (stated): the paper uses 12 months; the price file starts Oct 2021, and months 1-6 carry 80% of
//   the paper's weight. SIGMA = sd of daily log returns over the 63 sessions before entry x sqrt(252) (40+ returns needed).
//   RSIZE = ln(ME / (SPY close x 8.6e10)) (S&P 500 total value approximated from SPY; a common shift for all stocks on a day).
//   PRICE = ln(min(close, 15)). No winsorising (the test ranks; the paper winsorises at 5/95%).
// EVENT: a filing date F whose latest quarter end E is new and 0-120 days old (as IDEA 11), period end from 2019-06-01, forms 10-Q/10-K.
//   The stock must be liquid on the session before entry and have 126+ sessions of history (so scored events start about April 2022).
// RANK (point in time, the lazy-prices ranker): LPFD percentile among the SCORED LIQUID events of the 365 days before F (300+ needed).
//   RQ-DIST-AV126  AVOID check: percentile >= 0.95 (top 5% failure probability); bought next open; 126 sessions; judged GROSS vs GROSS.
//   RQ-DIST-AV63   the same, 63 sessions.
//   RQ-DIST-T10    AVOID check: percentile >= 0.90 (top 10%), 126 sessions.
// A valid SELL reason only if AVOID CONFIRMED (lag the average stock in both halves before cost, block t <= -2.5 in both).
// DATA RULE (fixed now): no verdict until (a) 95%+ of universe companies looked up in the SEC bulk company facts file, (b) 85%+ of liquid
// stock-months map to an SEC number, (c) 8,000+ scored liquid events from 2021-10-01 and (d) 150+ top-5% events.
export const DST = { coef: { c: -9.164, nimta: -20.264, tlmta: 1.416, exret: -7.129, sigma: 1.411, rsize: -0.045, cashmta: -2.132, mb: 0.075, price: -0.058 },
  qw: [0.5333, 0.2667, 0.1333, 0.0667], qStep: [0, 91, 182, 274], qTol: 12, minQ: 2, iTol: 5, months: 6, mLen: 21, minM: 4, sigN: 63, minSig: 40, priceCap: 15, spxPerSpy: 8.6e10,
  endFrom: '2019-06-01', maxLag: 120, shLag: 30, splitTol: 0.02, splitR: [2, 3, 4, 5, 8, 10, 15, 20, 25, 30, 40, 50], minHist: 126, eventsFrom: '2021-10-01',
  ni: ['NetIncomeLoss', 'ProfitLoss'], inst: { L: 'Liabilities', LSE: 'LiabilitiesAndStockholdersEquity', SE: 'StockholdersEquity', SEN: 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    C1: 'CashAndCashEquivalentsAtCarryingValue', C2: 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents', STI: 'ShortTermInvestments' } };
export const DST_DATA = { looked: 0.95, map: 0.85, scored: 8000, top: 150 };
RULES['RQ-DIST-AV126'] = { kind: 'avoid', hold: 126, min: 0.95, family: 'dst', name: 'AVOID check: failure probability (Campbell-Hilscher-Szilagyi) in the top 5%, 126 sessions',
  rule: 'Information only: after a new 10-Q/10-K, the 12-month failure-probability logit of Campbell, Hilscher and Szilagyi (2008; SEC XBRL net income, liabilities, cash, equity + price, volatility, excess return, size) is in the top 5% of liquid filings of the prior 365 days; bought next open, 126 sessions; a valid AVOID / SELL filter if these stocks lag the average stock in both halves BEFORE cost (gross vs gross; block t <= -2.5 for CONFIRMED). Never a buy.' };
RULES['RQ-DIST-AV63'] = { kind: 'avoid', hold: 63, min: 0.95, family: 'dst', name: 'AVOID check: failure probability top 5%, 63 sessions', rule: 'As RQ-DIST-AV126, 63 sessions. Never a buy.' };
RULES['RQ-DIST-T10'] = { kind: 'avoid', hold: 126, min: 0.90, family: 'dst', name: 'AVOID check: failure probability top 10%, 126 sessions', rule: 'As RQ-DIST-AV126 with the top 10% (percentile >= 0.90). Never a buy.' };
export const DST_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'dst');
for (const id of DST_IDS) { if (!IDS.includes(id)) IDS.push(id); ONE_OPEN.add(id); }
const dstForm = (x) => x.form === '10-Q' || x.form === '10-K';
// companyfacts JSON -> { n: [[start, end, val, filed, form, days]] net income durations (quarter, 9 months, year), i: { key: [[end, val, filed]] } }
export function dstRows(j) { const g = j && j.facts && j.facts['us-gaap'], out = { n: [], i: {} }; if (!g) return out;
  for (const tag of DST.ni) { const u = g[tag] && g[tag].units, arr = u && Array.isArray(u.USD) ? u.USD : null; if (!arr || !arr.length) continue; const s = new Set();
    for (const x of arr) { if (!x || !x.start || !x.end || !x.filed || !ok(x.val) || !dstForm(x) || x.end < '2018-03-01') continue; const len = daysBetween(x.start, x.end);
      if (!((len >= 80 && len <= 100) || (len >= 260 && len <= 285) || (len >= 350 && len <= 380))) continue; const k = x.start + '|' + x.end + '|' + x.val + '|' + x.filed; if (s.has(k)) continue; s.add(k); out.n.push([x.start, x.end, x.val, x.filed, x.form, len]); }
    if (out.n.length) break; }
  out.n.sort((p, r) => p[3] < r[3] ? -1 : p[3] > r[3] ? 1 : p[1] < r[1] ? -1 : p[1] > r[1] ? 1 : 0);
  for (const [key, tag] of Object.entries(DST.inst)) { const u = g[tag] && g[tag].units, arr = u && Array.isArray(u.USD) ? u.USD : null; if (!arr) continue; const rows = [], s = new Set();
    for (const x of arr) { if (!x || x.start || !x.end || !x.filed || !ok(x.val) || !dstForm(x) || x.end < '2018-03-01') continue; const k = x.end + '|' + x.val + '|' + x.filed; if (s.has(k)) continue; s.add(k); rows.push([x.end, x.val, x.filed]); }
    if (rows.length) out.i[key] = rows.sort((p, r) => p[2] < r[2] ? -1 : p[2] > r[2] ? 1 : 0); }
  return out; }
// latest-filed (on or before F) row whose date is closest to `end` within `tol` days
const dstPick = (rows, end, F, tol, dateAt = 0, filedAt = 2) => { let b = null; for (const r of rows || []) { if (r[filedAt] > F) continue; const gap = Math.abs(daysBetween(r[dateAt], end)); if (gap > tol) continue;
  const bg = b ? Math.abs(daysBetween(b[dateAt], end)) : 1e9; if (!b || gap < bg || (gap === bg && r[filedAt] >= b[filedAt])) b = r; } return b; };
export function dstQuarterNI(n, end, F) { const known = n.filter(r => r[3] <= F), tol = DST.qTol;
  const q = dstPick(known.filter(r => r[5] <= 100), end, F, tol, 1, 3); if (q) return q[2];
  const fy = dstPick(known.filter(r => r[5] >= 350), end, F, tol, 1, 3); if (!fy) return null;
  const nm = known.filter(r => r[5] >= 260 && r[5] <= 285 && r[0] === fy[0]).sort((p, r) => p[3] < r[3] ? -1 : 1).pop(); return nm ? fy[2] - nm[2] : null; }
// rows -> events [{ d (filed), end, form, ni: [4 quarters or null], tl, be, cash }] (only events with NI for E, TL, BE and CASH)
export function dstEvents(rows) { const out = [], n = (rows && rows.n) || [], I = (rows && rows.i) || {}; let maxEnd = '';
  const byF = new Map(); for (const r of n) if (r[5] <= 100 || r[5] >= 350) (byF.get(r[3]) || byF.set(r[3], []).get(r[3])).push(r);
  for (const F of [...byF.keys()].sort()) { const here = byF.get(F), E = here.reduce((m, r) => r[1] > m ? r[1] : m, '');
    if (E > maxEnd && E >= DST.endFrom && daysBetween(E, F) >= 0 && daysBetween(E, F) <= DST.maxLag) {
      const ni = DST.qStep.map(s => dstQuarterNI(n, addDays(E, -s), F)), at = (k) => { const r = dstPick(I[k], E, F, DST.iTol); return r ? r[1] : null; };
      const L = at('L'), LSE = at('LSE'), SE = at('SE'), SEN = at('SEN'), C1 = at('C1'), C2 = at('C2'), STI = at('STI');
      const tl = L !== null ? L : LSE !== null && (SEN !== null || SE !== null) ? LSE - (SEN !== null ? SEN : SE) : null, be = SE !== null ? SE : SEN, cash0 = C1 !== null ? C1 : C2;
      if (ni[0] !== null && ni.filter(x => x !== null).length >= DST.minQ && tl !== null && tl >= 0 && be !== null && be !== undefined && cash0 !== null && cash0 !== undefined)
        out.push({ d: F, end: E, form: here.find(r => r[1] === E).at(4), ni, tl, be, cash: cash0 + (STI !== null && STI > 0 ? STI : 0) }); }
    if (E > maxEnd) maxEnd = E; }
  return out; }
// market inputs from closes c[0..t] and SPY closes s[0..t] (NaN / 0 = missing), at the session t before entry
export function dstMarket(c, s, t) { const phi = Math.pow(2, -1 / 3); let sw = 0, sx = 0, m = 0;
  for (let k = 1; k <= DST.months; k++) { const a = t - DST.mLen * k, b = t - DST.mLen * (k - 1); if (a < 0) break; if (!(c[a] > 0 && c[b] > 0 && s[a] > 0 && s[b] > 0)) continue;
    const w = Math.pow(phi, k - 1); sx += w * (Math.log(c[b] / c[a]) - Math.log(s[b] / s[a])); sw += w; m++; }
  const r = []; for (let k = Math.max(1, t - DST.sigN + 1); k <= t; k++) if (c[k] > 0 && c[k - 1] > 0) r.push(Math.log(c[k] / c[k - 1]));
  const mu = r.length ? r.reduce((x, y) => x + y, 0) / r.length : 0, sig = r.length > 1 ? Math.sqrt(r.reduce((x, y) => x + (y - mu) ** 2, 0) / (r.length - 1) * 252) : null;
  return { exret: m >= DST.minM ? sx / sw : null, sigma: r.length >= DST.minSig ? sig : null, months: m, rets: r.length }; }
// accounting event + market inputs -> { lp, parts } or null
export function dstScore({ ni, tl, be, cash, me, exret, sigma, price, spy }) {
  if (!(me > 0) || !(price > 0) || !(spy > 0) || !ok(exret) || !ok(sigma) || !ok(tl) || !ok(be) || !ok(cash) || !Array.isArray(ni) || ni[0] === null) return null;
  const mta = me + tl; let sw = 0, sn = 0; ni.forEach((x, k) => { if (x !== null && ok(x)) { sw += DST.qw[k]; sn += DST.qw[k] * x; } }); if (!(sw > 0)) return null;
  const adjBE = Math.max(be + 0.1 * (me - be), 1), P = { nimta: sn / sw / mta, tlmta: tl / mta, exret, sigma, rsize: Math.log(me / (spy * DST.spxPerSpy)), cashmta: cash / mta, mb: me / adjBE, price: Math.log(Math.min(price, DST.priceCap)) };
  let lp = DST.coef.c; for (const k of Object.keys(P)) lp += DST.coef[k] * P[k]; return { lp: +lp.toFixed(6), parts: Object.fromEntries(Object.entries(P).map(([k, v]) => [k, r4(v)])) }; }
// split-adjusted cover counts [[date, shares]] -> the count usable at day d (dated d-30 or earlier) or null when a split-shaped jump follows it
export function dstShares(rows, d) { if (!Array.isArray(rows) || !rows.length) return null; const lim = addDays(d, -DST.shLag); let ix = -1;
  for (let k = 0; k < rows.length; k++) if (rows[k][0] <= lim && rows[k][1] > 0) ix = k; if (ix < 0) return null;
  for (let k = ix + 1; k < rows.length; k++) { const a = rows[k - 1][1], b = rows[k][1]; if (!(a > 0) || !(b > 0)) continue; const r = b / a;
    if (DST.splitR.some(x => Math.abs(r - x) <= DST.splitTol * x || Math.abs(r - 1 / x) <= DST.splitTol / x)) return { split: true }; }
  return { sh: rows[ix][1], at: rows[ix][0] }; }
export function dstDataRule({ ciks, looked, liqMonths, liqMapped, scored, top }) { const r = { looked: ciks ? looked / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.looked >= DST_DATA.looked)) why.push('company facts looked up ' + (r.looked * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= DST_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  if (!(scored >= DST_DATA.scored)) why.push('scored liquid events ' + scored + ' (8000 needed)');
  if (!(top >= DST_DATA.top)) why.push('top-5% events ' + top + ' (150 needed)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), scored, top, why: why.join('; ') || null }; }
const DST_SOURCES = ['https://doi.org/10.1111/j.1540-6261.2008.01416.x', 'https://www.nber.org/papers/w12362', 'https://econpapers.repec.org/RePEc:bla:jfinan:v:63:y:2008:i:6:p:2899-2939'];
const DST_NOTE = 'Daily researcher 2026-11-08: Campbell, Hilscher and Szilagyi (2008, Journal of Finance) found that stocks with the highest failure probability earn anomalously low returns; research queue item 3. New line (market-based failure probability from SEC XBRL + prices); Squad 29 tested danger filings and the F-score family quality, not this. AVOID / SELL-warning check only (gross vs gross), never a buy. Run once on 5 years incl. dead stocks; first complete verdict frozen in data/research-lab.json firstRun.';
export function preRegisterDst(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of DST_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-11-08 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Score coefficients, inputs, simplifications, ranking and data rule fixed in research-core.mjs (IDEA 12) before any run.', sources: DST_SOURCES, hold: R.hold, note: DST_NOTE }); ch++; }
  return ch; }

// ---------------- IDEA 13 (pre-registered 9 Nov 2026, before any run): ORGANIZATION CAPITAL (capitalised SG&A per assets) ----------------
// Source: Eisfeldt and Papanikolaou, "Organization Capital and the Cross-Section of Expected Returns", Journal of Finance 68(4), 2013,
// 1365-1406: a stock of organization capital built from SG&A by the perpetual-inventory method (depreciation 15%, initial stock
// SG&A_1 / (g + 15%), g = 10%); firms with HIGH organization capital per assets earned about 4.7% a year more than LOW ones (1970-2008).
// NEW information line in this library: nothing tests capitalised SG&A (the SG&A-vs-sales CHANGE variant was dropped on 5 Nov unrun; R&D
// intensity, gross profitability, quality and value levels are tested elsewhere). Long only: buy the top 20%; no avoid check.
// MEASURE (fixed now, no tuning): us-gaap:SellingGeneralAndAdministrativeExpense, unit USD, ANNUAL durations only (start..end 350-380
// days), forms 10-K (no amendments), period end from 2008-01-01. us-gaap:Assets (instant). Point in time: only values filed on or before F.
// EVENT: a filing date F whose latest fiscal-year end E (annual SG&A) is later than every year end reported before F and 0 <= F - E <= 120.
// CHAIN: SG&A for E, then back one year at a time (the year end 330-400 days earlier, closest to 365; latest filed on or before F); stops
// at the first missing year or a value <= 0; 5+ consecutive years needed (E included), at most 20.
// OC: oldest year s1 -> OC = s1 / (0.10 + 0.15); then for every year y oldest..E: OC = 0.85 OC + s_y. SIMPLIFICATIONS (stated now):
// nominal dollars (no CPI deflator: a near-common factor in a cross-section ranked within 365 days); no within-industry sort (the paper
// sorts within 17 industries; SIC history for dead companies is not in the system); banks mostly do not tag SG&A (they drop out; stated).
// SCORE = OC / total assets at E (instant within 5 days of E, latest filed on or before F); assets 10M USD+.
// RANK (point in time, the lazy-prices ranker): percentile among ALL OC events filed in the 365 days before F (300+ needed).
//   RQ-OC-126   BUY the next open after a 10-K whose OC / assets is in the top 20% (percentile >= 0.80); sell the close 126 sessions later.
//   RQ-OC-252   the same, hold 252 sessions (the paper rebalances once a year).
// Public on the 'filed' date: bought at the OPEN of the first session strictly AFTER it. Liquid (system rule) on the session before entry.
// One open trade per stock per rule. Gates, costs, halves and verdicts: the shared judge of this file (same as IDEAS 6-10).
// DATA RULE (fixed now): no verdict until (a) 95%+ of universe companies looked up in the SEC bulk company facts file, (b) 85%+ of liquid
// stock-months map to an SEC number, (c) 3,000+ OC events from 2021-10-01 (fewer = the reader is broken: fix it, no verdict).
export const OC = { tag: 'SellingGeneralAndAdministrativeExpense', assets: 'Assets', from: '2008-01-01', endFrom: '2019-06-01', yLo: 350, yHi: 380, maxLag: 120, back: [330, 400],
  minYears: 5, maxYears: 20, g: 0.10, dep: 0.15, aTol: 5, minAssets: 10e6, eventsFrom: '2021-10-01' };
export const OC_DATA = { looked: 0.95, map: 0.85, events: 3000 };
RULES['RQ-OC-126'] = { kind: 'buy', hold: 126, side: 'top', family: 'oc', name: 'Organization capital (capitalised SG&A per assets) in the top 20%, hold 6 months',
  rule: 'Buy the next open after a 10-K whose organization capital (perpetual inventory of annual SG&A, us-gaap SellingGeneralAndAdministrativeExpense, 15% depreciation, initial stock SG&A / 0.25, 5+ consecutive years) divided by total assets is in the top 20% (percentile >= 0.80 vs all such 10-Ks of the prior 365 days; filed within 120 days of the year end; assets 10M USD+); stock liquid; sell the close 126 sessions later.' };
RULES['RQ-OC-252'] = { kind: 'buy', hold: 252, side: 'top', family: 'oc', name: 'Organization capital in the top 20%, hold 12 months', rule: 'As RQ-OC-126, hold 252 sessions.' };
export const OC_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'oc');
for (const id of OC_IDS) { if (!IDS.includes(id)) IDS.push(id); if (!BUY_IDS.includes(id)) BUY_IDS.push(id); ONE_OPEN.add(id); }
// companyfacts JSON -> { y: [[start, end, val, filed]] annual SG&A, a: [[end, val, filed]] assets }, sorted by filed
export function ocRows(j) { const g = j && j.facts && j.facts['us-gaap'], uy = g && g[OC.tag] && g[OC.tag].units, ua = g && g[OC.assets] && g[OC.assets].units;
  const y = [], a = [], sy = new Set(), sa = new Set();
  for (const x of (uy && Array.isArray(uy.USD) ? uy.USD : [])) { if (!x || !x.start || !x.end || !x.filed || !ok(x.val) || x.form !== '10-K' || x.end < OC.from) continue;
    const len = daysBetween(x.start, x.end); if (len < OC.yLo || len > OC.yHi) continue; const k = x.end + '|' + x.val + '|' + x.filed; if (sy.has(k)) continue; sy.add(k); y.push([x.start, x.end, x.val, x.filed]); }
  for (const x of (ua && Array.isArray(ua.USD) ? ua.USD : [])) { if (!x || x.start || !x.end || !x.filed || !ok(x.val) || x.val <= 0 || !(x.form === '10-K' || x.form === '10-Q') || x.end < OC.from) continue;
    const k = x.end + '|' + x.val + '|' + x.filed; if (sa.has(k)) continue; sa.add(k); a.push([x.end, x.val, x.filed]); }
  const by = (i, j2) => (p, r) => p[i] < r[i] ? -1 : p[i] > r[i] ? 1 : p[j2] < r[j2] ? -1 : p[j2] > r[j2] ? 1 : 0;
  return { y: y.sort(by(3, 1)), a: a.sort(by(2, 0)) }; }
// perpetual inventory over SG&A values oldest..newest -> OC stock (null when fewer than minYears or a value <= 0)
export function ocStock(vals) { if (!Array.isArray(vals) || vals.length < OC.minYears || vals.some(v => !ok(v) || v <= 0)) return null; let oc = vals[0] / (OC.g + OC.dep);
  for (const v of vals) oc = (1 - OC.dep) * oc + v; return oc; }
// latest-filed (on or before F) row closest to `target`, its date within [lo, hi] days before `from` (or within tol of target when lo/hi null)
const ocNear = (rows, target, F, test) => { let b = null; for (const r of rows) { if (r[3] > F || !test(r)) continue; const gap = Math.abs(daysBetween(r[1], target));
  const bg = b ? Math.abs(daysBetween(b[1], target)) : 1e9; if (!b || gap < bg || (gap === bg && r[3] >= b[3])) b = r; } return b; };
// SG&A chain ending at E, as known on F: values oldest..newest (E last)
export function ocChain(yrows, E, F) { const known = yrows.filter(r => r[3] <= F), e0 = ocNear(known, E, F, r => r[1] === E); if (!e0 || !(e0[2] > 0)) return [];
  const out = [e0[2]]; let cur = E;
  while (out.length < OC.maxYears) { const p = ocNear(known, addDays(cur, -365), F, r => { const gp = daysBetween(r[1], cur); return gp >= OC.back[0] && gp <= OC.back[1]; });
    if (!p || !(p[2] > 0)) break; out.unshift(p[2]); cur = p[1]; }
  return out; }
// rows -> events [{ d (filed), end, years, oc, assets, g (= OC / assets) }]
export function ocEvents(rows) { const out = [], Y = (rows && rows.y) || [], A = (rows && rows.a) || []; let maxEnd = '';
  const byF = new Map(); for (const r of Y) (byF.get(r[3]) || byF.set(r[3], []).get(r[3])).push(r);
  for (const F of [...byF.keys()].sort()) { const E = byF.get(F).reduce((m, r) => r[1] > m ? r[1] : m, '');
    if (E > maxEnd && E >= OC.endFrom && daysBetween(E, F) >= 0 && daysBetween(E, F) <= OC.maxLag) { const ch = ocChain(Y, E, F), oc = ocStock(ch);
      let as = null; for (const x of A) { if (x[2] > F) break; const gap = Math.abs(daysBetween(x[0], E)); if (gap > OC.aTol) continue; if (!as || gap < Math.abs(daysBetween(as[0], E)) || (x[0] === as[0] && x[2] >= as[2])) as = x; }
      if (oc !== null && as && as[1] >= OC.minAssets) out.push({ d: F, end: E, years: ch.length, oc: Math.round(oc), assets: as[1], g: +(oc / as[1]).toFixed(6), form: '10-K' }); }
    if (E > maxEnd) maxEnd = E; }
  return out; }
export function ocDataRule({ ciks, looked, liqMonths, liqMapped, events }) { const r = { looked: ciks ? looked / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.looked >= OC_DATA.looked)) why.push('company facts looked up ' + (r.looked * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= OC_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  if (!(events >= OC_DATA.events)) why.push('organization capital events ' + events + ' (3,000 needed: reader check)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), events, why: why.join('; ') || null }; }
const OC_SOURCES = ['https://doi.org/10.1111/jofi.12034', 'https://www.aeaweb.org/conference/2013/retrieve.php?pdfid=51', 'https://mingze-gao.com/posts/estimate-organization-capital/'];
const OC_NOTE = 'Daily researcher 2026-11-09: Eisfeldt and Papanikolaou (2013, Journal of Finance) "Organization Capital and the Cross-Section of Expected Returns": firms with high capitalised SG&A per assets earned about 4.7% a year more (1970-2008). New line (organization capital from annual SG&A, official SEC XBRL company facts); nothing in the library tests it. Nominal dollars and no industry sort (stated simplifications). Buy top 20%. Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun; forward paper from 9 Nov 2026.';
export function preRegisterOc(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of OC_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-11-09 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Measure, chain rule, perpetual inventory, assets scaling, ranking and data rule fixed in research-core.mjs (IDEA 13) before any run.', sources: OC_SOURCES, hold: R.hold, note: OC_NOTE }); ch++; }
  return ch; }

// ---------------- IDEA 14 (pre-registered 10 Nov 2026, before any run): WIKIPEDIA ATTENTION (page-view change and attention spikes) ----------------
// Sources: Pyun, "The Wikipedia effect: Analyzing investor attention for strategic investment decisions", Economics Letters 241 (2024)
// 111836: firms whose English Wikipedia page views INCREASE earn higher returns (high-minus-low significant, not explained by factors).
// Da, Engelberg and Gao, "In Search of Attention", Journal of Finance 66(5), 2011: abnormal attention (Google search) predicts higher
// returns over the next two weeks (and a partial reversal within a year). NEW information line in this library: nothing tests public
// attention data (DEC-SOC / C-SOCMKT1 need licensed social data; Squad 18 tested price behaviour only). Long only; no avoid check.
// DATA (official Wikimedia APIs, free, no key; descriptive User-Agent): (1) Wikidata Query Service (query.wikidata.org/sparql): every item
// with SEC CIK (property P5531) and its English Wikipedia article (sitelink). A CIK with several articles: the alphabetically first title
// (stated). (2) Wikimedia Pageviews REST API, per article, en.wikipedia, all-access, agent=user (no bots), daily, 2021-07-01 to yesterday.
// Days the API omits count as 0 views. STATED LIMITS: titles are today's sitelinks, so an article renamed during the window keeps its older
// views under the old title (a rename looks like a jump from near 0: the minimum-views floors below exclude most such cases); coverage is
// the Wikipedia-covered subset of the universe (better-known companies); dead companies are kept when their Wikidata item has the CIK.
// TIMING: page views are counted per UTC day; a UTC day ends 19:00-20:00 New York, after that day's close, so a signal using day d is
// bought at the OPEN of the first session strictly AFTER d. Liquid (system rule) on the session before entry. One open trade per stock per rule.
//   RQ-WIKI-M21  MONTHLY: at the first session of month M, score = ln(views of month M-1) - ln(views of month M-2), both 1,000+ views, for
//                every mapped liquid stock; percentile within that month's cross-section (300+ stocks needed, else the month is skipped);
//                BUY the top 20% (percentile >= 0.80) at the open of that first session; sell the close 21 sessions later.
//   RQ-WIKI-M63  the same, hold 63 sessions.
//   RQ-WIKI-SPIKE10  DAILY: a UTC day d where the mean views of d-4..d is 3x+ the median of days d-60..d-5 (that median 100+ views a day)
//                and no earlier spike of the same article in the 91 days before d; BUY the next open after d, sell the close 10 sessions later.
// Gates, costs, halves and verdicts: the shared judge of this file (same as IDEAS 6-13).
// DATA RULE (fixed now): no verdict until (a) 1,500+ universe companies have an English Wikipedia article, (b) 95%+ of those articles
// answered by the page-view API (data or a clean 404), (c) 50+ monthly cross-sections from 2021-11 with 300+ ranked stocks, (d) 500+ spikes.
export const WIKI = { from: '2021-07-01', minMonth: 1000, top: 0.80, minCross: 300, signalFrom: '2021-11-01', spikeX: 3, spikeBase: 100, spikeGap: 91, recent: 5, baseLo: 60, baseHi: 5 };
export const WIKI_DATA = { articles: 1500, answered: 0.95, months: 50, spikes: 500 };
RULES['RQ-WIKI-M21'] = { kind: 'buy', hold: 21, side: 'top', family: 'wiki', name: 'Wikipedia page views rising most last month (top 20%), hold 1 month',
  rule: 'At the first session of each month, score every liquid stock with an English Wikipedia article (Wikidata CIK P5531 sitelink) by ln(page views last month) - ln(page views the month before) (Wikimedia Pageviews API, agent=user, both months 1,000+ views); buy the top 20% of that month\'s cross-section (300+ stocks needed) at the open of that session; sell the close 21 sessions later.' };
RULES['RQ-WIKI-M63'] = { kind: 'buy', hold: 63, side: 'top', family: 'wiki', name: 'Wikipedia page views rising most last month (top 20%), hold 3 months', rule: 'As RQ-WIKI-M21, hold 63 sessions.' };
RULES['RQ-WIKI-SPIKE10'] = { kind: 'buy', hold: 10, side: 'spike', family: 'wiki', name: 'Wikipedia attention spike (5-day views 3x the 8-week median), hold 2 weeks',
  rule: 'A UTC day d where the mean English Wikipedia page views (agent=user) of d-4..d are 3x+ the median of days d-60..d-5 (median 100+ views a day), first spike of that article in 91 days; buy the next open after d (stock liquid); sell the close 10 sessions later.' };
export const WIKI_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'wiki');
for (const id of WIKI_IDS) { if (!IDS.includes(id)) IDS.push(id); if (!BUY_IDS.includes(id)) BUY_IDS.push(id); ONE_OPEN.add(id); }
// SPARQL JSON -> { map: { cik: title }, items, dupCiks }
export function wikiMap(j) { const B = j && j.results && Array.isArray(j.results.bindings) ? j.results.bindings : [], all = new Map();
  for (const b of B) { const c = String(+String((b.cik && b.cik.value) || '').replace(/\D/g, '')), u = String((b.article && b.article.value) || '');
    const m = /^https?:\/\/en\.wikipedia\.org\/wiki\/(.+)$/.exec(u); if (!(+c > 0) || !m) continue; let t; try { t = decodeURIComponent(m[1]).replace(/ /g, '_'); } catch (e) { continue; }
    (all.get(c) || all.set(c, new Set()).get(c)).add(t); }
  const map = {}; let dup = 0; for (const [c, s] of all) { const a = [...s].sort(); if (a.length > 1) dup++; map[c] = a[0]; }
  return { map, items: B.length, dupCiks: dup }; }
// Pageviews JSON -> { d0, v } daily from d0 (YYYY-MM-DD), omitted days = 0; null when no items
export function wikiSeries(j, from = null) { const it = j && Array.isArray(j.items) ? j.items : []; const rows = [];
  for (const x of it) { const s = String(x.timestamp || ''); if (!/^\d{8}/.test(s) || !ok(x.views)) continue; rows.push([s.slice(0, 4) + '-' + s.slice(4, 6) + '-' + s.slice(6, 8), x.views]); }
  if (!rows.length) return null; rows.sort((a, b) => a[0] < b[0] ? -1 : 1); const d0 = from && from < rows[0][0] ? from : rows[0][0], n = daysBetween(d0, rows[rows.length - 1][0]) + 1, v = new Array(n).fill(0);
  for (const [d, x] of rows) v[daysBetween(d0, d)] += x; return { d0, v }; }
// append a newer series (overlap: newer wins)
export function wikiAppend(a, b) { if (!a) return b; if (!b) return a; const n = Math.max(a.v.length, daysBetween(a.d0, b.d0) + b.v.length), v = new Array(n).fill(0);
  a.v.forEach((x, k) => { v[k] = x; }); const off = daysBetween(a.d0, b.d0); b.v.forEach((x, k) => { if (off + k >= 0) v[off + k] = x; }); return { d0: a.d0, v }; }
export const wikiEnd = (s) => s ? addDays(s.d0, s.v.length - 1) : null;
// total views of month 'YYYY-MM' (null unless the series covers the whole month)
export function wikiMonth(s, ym) { if (!s) return null; const a = ym + '-01', mo = +ym.slice(5, 7), y = +ym.slice(0, 4), nx = mo === 12 ? (y + 1) + '-01-01' : y + '-' + String(mo + 1).padStart(2, '0') + '-01', b = addDays(nx, -1);
  const i0 = daysBetween(s.d0, a), i1 = daysBetween(s.d0, b); if (i0 < 0 || i1 >= s.v.length) return null; let t = 0; for (let k = i0; k <= i1; k++) t += s.v[k]; return t; }
const prevYm = (ym) => { const y = +ym.slice(0, 4), m = +ym.slice(5, 7); return m === 1 ? (y - 1) + '-12' : y + '-' + String(m - 1).padStart(2, '0'); };
// score for a signal in month M (uses M-1 vs M-2); null when a month is missing or under the floor
export function wikiScore(s, ym) { const a = wikiMonth(s, prevYm(ym)), b = wikiMonth(s, prevYm(prevYm(ym))); if (a === null || b === null || a < WIKI.minMonth || b < WIKI.minMonth) return null; return Math.log(a) - Math.log(b); }
// percentile within a cross-section [{key, s}] -> Map key -> p (ties share the mid rank); empty under minCross
export function wikiRank(list, min = WIKI.minCross) { const a = list.filter(x => ok(x.s)); const out = new Map(); if (a.length < min) return out; const s = a.map(x => x.s).sort((p, q) => p - q), n = s.length;
  const lo = (x) => { let l = 0, h = n; while (l < h) { const m = (l + h) >> 1; if (s[m] < x) l = m + 1; else h = m; } return l; }, hi = (x) => { let l = 0, h = n; while (l < h) { const m = (l + h) >> 1; if (s[m] <= x) l = m + 1; else h = m; } return l; };
  for (const x of a) { const b = lo(x.s), e = hi(x.s); out.set(x.key, ((b + e - 1) / 2) / (n - 1)); } return out; }
// spikes [{ d, ratio, base }]
export function wikiSpikes(s, from = null) { const out = []; if (!s) return out; let last = null; const med = (arr) => { const z = [...arr].sort((p, q) => p - q), n = z.length; return n % 2 ? z[n >> 1] : (z[n / 2 - 1] + z[n / 2]) / 2; };
  for (let k = WIKI.baseLo; k < s.v.length; k++) { const d = addDays(s.d0, k); const base = med(s.v.slice(k - WIKI.baseLo, k - WIKI.baseHi + 1)); if (!(base >= WIKI.spikeBase)) continue;
    let r = 0; for (let q = k - WIKI.recent + 1; q <= k; q++) r += s.v[q]; r /= WIKI.recent; if (!(r >= WIKI.spikeX * base)) continue;
    if (last !== null && daysBetween(last, d) <= WIKI.spikeGap) continue; last = d; if (!from || d >= from) out.push({ d, ratio: +(r / base).toFixed(3), base }); }
  return out; }
export function wikiDataRule({ articles, answered, months, spikes }) { const r = { answered: articles ? answered / articles : 0 }, why = [];
  if (!(articles >= WIKI_DATA.articles)) why.push('universe companies with an English Wikipedia article ' + articles + ' (1,500 needed)');
  if (!(r.answered >= WIKI_DATA.answered)) why.push('articles answered by the page-view API ' + (r.answered * 100).toFixed(1) + '% (95% needed)');
  if (!(months >= WIKI_DATA.months)) why.push('monthly cross-sections with 300+ stocks ' + months + ' (50 needed)');
  if (!(spikes >= WIKI_DATA.spikes)) why.push('attention spikes ' + spikes + ' (500 needed)');
  return { ok: !why.length, ratios: { answered: r4(r.answered) }, articles, months, spikes, why: why.join('; ') || null }; }
export const WIKI_SPARQL = 'SELECT ?cik ?article WHERE { ?item wdt:P5531 ?cik . ?article schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }';
const WIKI_SOURCES = ['https://doi.org/10.1016/j.econlet.2024.111836', 'https://ideas.repec.org/a/eee/ecolet/v241y2024ics0165176524003203.html', 'https://doi.org/10.1111/j.1540-6261.2011.01679.x', 'https://wikimedia.org/api/rest_v1/', 'https://www.wikidata.org/wiki/Property:P5531'];
const WIKI_NOTE = 'Daily researcher 2026-11-10: Pyun (2024, Economics Letters) "The Wikipedia effect": rising Wikipedia page views predict higher returns; Da, Engelberg and Gao (2011, Journal of Finance) abnormal attention predicts higher returns over two weeks. New information line (public attention, official Wikimedia APIs: Wikidata CIK P5531 -> English article; Pageviews API agent=user). Today\'s titles (renames: stated limit). Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun; forward paper from 10 Nov 2026.';
export function preRegisterWiki(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of WIKI_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-11-10 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Article mapping, view counts, score, ranking, spike rule, timing and data rule fixed in research-core.mjs (IDEA 14) before any run.', sources: WIKI_SOURCES, hold: R.hold, note: WIKI_NOTE }); ch++; }
  return ch; }

// ---------------- IDEA 15 (pre-registered 11 Nov 2026, before any run): FINRA DAILY SHORT SALE VOLUME (shorting flows) ----------------
// Sources: Wang, Yan and Zheng, "Shorting flows, public disclosure, and market efficiency", Journal of Financial Economics 135(1), 2020,
// 191-212: with FINRA's daily short volume public in real time (2010-2015), heavily shorted stocks still underperformed lightly shorted
// ones by 12.6% a year (equal weight, t 6.0); stocks sorted each day on the prior 5 days, skip a day, hold 20 days; PERSISTENT shorting
// over a longer window predicts more than a short burst. Diether, Lee and Werner, "Short-Sale Strategies and Return Predictability",
// Review of Financial Studies 22(2), 2009 (Reg SHO 2005): high short-selling activity predicts negative returns. NEW information line in
// this library: nothing tests daily short-sale VOLUME (short INTEREST, twice a month, is ANOM-SI* / SQ1-SIAVOID). Long only: the
// lightly shorted side is the buy; the heavily shorted side is an AVOID check only (never a buy).
// DATA (official, free, no key): FINRA Reg SHO consolidated daily short sale volume files
// cdn.finra.org/equity/regsho/daily/CNMSshvolYYYYMMDD.txt ('Date|Symbol|ShortVolume|ShortExemptVolume|TotalVolume|Market'), one per
// session, 2021-07-01 (in practice: the first session of the 5-year price window) to the last close; published the same evening (about 6 pm New York). Short ratio of a stock on a session =
// ShortVolume / TotalVolume (FINRA-reported volume; TotalVolume > 0). Symbol = the ticker as traded that day, matched to the price
// cache's ticker of the same day (same point-in-time convention as the price data; dead stocks kept). Stored only for stocks LIQUID that
// session (system rule), so a score uses liquid sessions only (stated). STATED LIMITS: FINRA volume is off-exchange (TRF/ADF/ORF) only and
// includes market-maker shorting, so the ratio is noisy (it averages about half); no risk adjustment (the yardstick is the average stock).
// TIMING: weekly. At the FIRST session k of each calendar week (a session whose previous session was in an earlier week), using files of
// sessions before k only (published by the evening of k-1), every stock liquid on k-1 gets a score; percentile within that week's
// cross-section (500+ stocks needed, else the week is skipped); buy at the OPEN of k; sell the CLOSE hold sessions later. One open trade
// per stock per rule.
//   RQ-SVOL-LOW21   score = mean short ratio of the 5 sessions k-5..k-1 (4+ of them with data); BUY the bottom 20% (percentile <= 0.20),
//                   hold 21 sessions (the paper's 20-day hold).
//   RQ-SVOL-LOW63P  PERSISTENT: score = mean short ratio of the 63 sessions k-63..k-1 (50+ with data); BUY the bottom 20%, hold 63 sessions.
//   RQ-SVOL-HIGH21  AVOID check: the TOP 20% of the 5-session score, 21 sessions; judged before costs on both sides (avoid verdict).
// Gates, costs, halves and verdicts: the shared judge of this file (same as IDEAS 6-14).
// DATA RULE (fixed now): no verdict until (a) 97%+ of the sessions from 2021-07-01 to the last close have a FINRA file read, (b) 85%+ of
// liquid stock-sessions from 2021-11-01 have a FINRA row, (c) 200+ weekly cross-sections with 500+ ranked stocks.
export const SVOL = { from: '2021-07-01', signalFrom: '2021-11-01', short: 5, shortMin: 4, long: 63, longMin: 50, low: 0.20, high: 0.80, minCross: 500 };
export const SVOL_DATA = { files: 0.97, rows: 0.85, weeks: 200 };
RULES['RQ-SVOL-LOW21'] = { kind: 'buy', hold: 21, side: 'low', win: 'short', family: 'svol', name: 'Lightly shorted stocks (FINRA daily short volume, bottom 20% of the last 5 days), hold 1 month',
  rule: 'At the first session of each week, score every liquid stock by its mean FINRA short ratio (ShortVolume / TotalVolume, Reg SHO consolidated daily file) of the 5 sessions before (4+ with data); buy the bottom 20% of that week\'s cross-section (500+ stocks needed) at the open of that session; sell the close 21 sessions later.' };
RULES['RQ-SVOL-LOW63P'] = { kind: 'buy', hold: 63, side: 'low', win: 'long', family: 'svol', name: 'Persistently lightly shorted stocks (FINRA short volume, bottom 20% of the last 63 days), hold 3 months',
  rule: 'As RQ-SVOL-LOW21 with the mean short ratio of the 63 sessions before (50+ with data); buy the bottom 20%; sell the close 63 sessions later.' };
RULES['RQ-SVOL-HIGH21'] = { kind: 'avoid', hold: 21, side: 'high', win: 'short', family: 'svol', name: 'AVOID check: heavily shorted stocks (FINRA short volume, top 20% of the last 5 days), 21 sessions',
  rule: 'As RQ-SVOL-LOW21, the TOP 20% of the 5-session score; 21 sessions; judged before costs on both sides against the average stock. Never a buy.' };
export const SVOL_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'svol');
for (const id of SVOL_IDS) { if (!IDS.includes(id)) IDS.push(id); if (RULES[id].kind === 'buy' && !BUY_IDS.includes(id)) BUY_IDS.push(id); ONE_OPEN.add(id); }
export const svolUrl = (d) => 'https://cdn.finra.org/equity/regsho/daily/CNMSshvol' + d.replace(/-/g, '') + '.txt';
// file text -> Map symbol -> ratio (ShortVolume / TotalVolume); header, trailer and bad rows skipped; a symbol listed twice: volumes summed
export function svolParse(text) { const sv = new Map(), tv = new Map(); if (typeof text !== 'string') return new Map();
  for (const line of text.split(/\r?\n/)) { const f = line.split('|'); if (f.length < 5 || !/^\d{8}$/.test(f[0])) continue; const s = f[1].trim().toUpperCase(), a = +f[2], b = +f[4];
    if (!/^[A-Z][A-Z.\-]{0,9}$/.test(s) || !(a >= 0) || !(b > 0)) continue; sv.set(s, (sv.get(s) || 0) + a); tv.set(s, (tv.get(s) || 0) + b); }
  const out = new Map(); for (const [s, b] of tv) { const r = sv.get(s) / b; if (r >= 0 && r <= 1) out.set(s, r); } return out; }
// first session of each calendar week (Monday-based): indexes t >= 1 of sorted session dates D
export function weekStarts(D) { const out = [], wk = (d) => { const ms = Date.parse(d + 'T00:00:00Z'), wd = (new Date(ms).getUTCDay() + 6) % 7; return Math.floor((ms / 864e5 - wd + 3) / 7); };
  for (let t = 1; t < D.length; t++) if (wk(D[t]) !== wk(D[t - 1])) out.push(t); return out; }
// mean of the values at sessions k-n..k-1 (get(u) -> ratio or null/undefined); null unless min+ values
export function svolScore(get, k, n, min) { let s = 0, m = 0; for (let u = k - n; u <= k - 1; u++) { if (u < 0) continue; const r = get(u); if (r === null || r === undefined || !isFinite(r)) continue; s += r; m++; } return m >= min ? s / m : null; }
export const svolRank = (list) => wikiRank(list, SVOL.minCross);
export const svolSide = (p) => p === null || p === undefined ? null : p <= SVOL.low ? 'low' : p >= SVOL.high ? 'high' : null;
export function svolDataRule({ sessions, files, liqRows, liqWithRow, weeks }) { const r = { files: sessions ? files / sessions : 0, rows: liqRows ? liqWithRow / liqRows : 0 }, why = [];
  if (!(r.files >= SVOL_DATA.files)) why.push('sessions with a FINRA file ' + (r.files * 100).toFixed(1) + '% (97% needed)');
  if (!(r.rows >= SVOL_DATA.rows)) why.push('liquid stock-sessions with a FINRA row ' + (r.rows * 100).toFixed(1) + '% (85% needed)');
  if (!(weeks >= SVOL_DATA.weeks)) why.push('weekly cross-sections with 500+ stocks ' + weeks + ' (200 needed)');
  return { ok: !why.length, ratios: { files: r4(r.files), rows: r4(r.rows) }, weeks, why: why.join('; ') || null }; }
const SVOL_SOURCES = ['https://www.sciencedirect.com/science/article/pii/S0304405X19301436', 'https://ideas.repec.org/a/eee/jfinec/v135y2020i1p191-212.html', 'https://doi.org/10.1093/rfs/hhn047', 'https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data/daily-short-sale-volume-files'];
const SVOL_NOTE = 'Daily researcher 2026-11-11: Wang, Yan and Zheng (2020, Journal of Financial Economics) "Shorting flows, public disclosure, and market efficiency": with FINRA daily short volume public, heavily shorted stocks underperformed lightly shorted ones by 12.6% a year (2010-2015), persistent shorting most; Diether, Lee and Werner (2009, RFS). New information line (official FINRA Reg SHO consolidated daily short sale volume files). Long only: lightly shorted = buy; heavily shorted = AVOID check only. Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun; forward paper from 11 Nov 2026.';
export function preRegisterSvol(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of SVOL_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-11-11 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' File source, ratio, weekly timing, windows, ranking, liquidity and data rule fixed in research-core.mjs (IDEA 15) before any run.', sources: SVOL_SOURCES, hold: R.hold, note: SVOL_NOTE }); ch++; }
  return ch; }

// ---------------- IDEA 16 (pre-registered 12 Nov 2026, before any run): PRE-EARNINGS RUN-UP OF PAST WINNERS (limited attention) ----------------
// Source: Aboody, Lehavy and Trueman, "Limited attention and the earnings announcement returns of past stock market winners", Review of
// Accounting Studies 15(2), 2010, 317-344 (doi 10.1007/s11142-009-9104-9): stocks with the strongest prior 12-month returns (top 1%,
// price $5+) earned a market-adjusted +1.58% in the five trading days before their earnings announcements (days -4..0) and -1.86% in the
// five days after (+1..+5), 1971-2005; individual investors' attention is the stated cause; reported significant after transaction costs.
// NOT a repeat: ANOM-EAP (Frazzini-Lamont premium, ALL reports, held THROUGH the report on the Nasdaq calendar) is rejected; this rule is
// conditioned on 12-month winners, sells BEFORE the report, and uses only official SEC data. Cost check (11 Nov): published +1.58% per
// 5-day trade is above the 0.8% cost, so it can pass in principle. Long only: the pre-report run-up is the buy; the post-report window is
// an AVOID check (never a buy, never a short).
// DATA (official): the idea-3 / idea-5 cache of 8-K lists (data.sec.gov submissions; acceptance time + items, from 2021-09-01). An
// ANNOUNCEMENT = the first item-2.02 8-K of a group (later 2.02s within 30 days are the same announcement; research-core eatAnnouncements).
// REACTION session r = research-core reactionDate (New York acceptance before 16:00 -> that date's session or the next; 16:00 or later ->
// the next session). STATED LIMIT: the entry uses the ACTUAL report date, assumed known 6+ sessions ahead (companies publish their
// earnings dates weeks ahead; the same assumption as ANOM-EAP); unscheduled pre-announcements cannot be told apart in the SEC data.
// WINNER (fixed now): at the signal session t = r-6, 12-month return = close(t) / close(t-252) - 1 (close or the dead-stock row; if
// t-252 has no close, the nearest earlier close within 5 sessions; none -> not ranked). Percentile among ALL stocks LIQUID on t (system rule:
// $5+, 20-day average $5M+ traded) with a 12-month return; 500+ needed, else that day is skipped. The stock itself must be liquid on t.
// The price window starts 2021-11-01, so the first rankable signal is about 2022-11 (the older half is ~14 months: stated in the report).
//   RQ-PRE-W1     BUY a top-1% winner (percentile >= 0.99) at the open of r-5; SELL at the close of r-1 (5 sessions; never held through
//                 the report).
//   RQ-PRE-W10    the same for the top 10% (percentile >= 0.90): a broader check that the effect is not just a few names.
//   RQ-PRE-POST1  AVOID check: the top-1% winners from the open of r+1 to the close of r+5 (after the reaction session; the paper's
//                 post window); judged before costs on both sides (avoid verdict). Never a buy.
// One open trade per stock per rule. Gates, costs, halves and verdicts: the shared judge of this file (same as IDEAS 6-15).
// DATA RULE (fixed now): no verdict until (a) the idea-5 8-K data rule holds (95%+ of companies read, 85%+ of liquid stock-months mapped),
// (b) 15,000+ announcements whose signal session is ranked (fewer = the reader is broken: fix it, no verdict).
// PAPER LANE: none at first (future report dates are not in the SEC data); one would be added (official calendar only) if a rule passes.
export const PRE = { back: 252, slack: 5, lead: 6, minCross: 500, w1: 0.99, w10: 0.90, from: '2021-11-01' };
export const PRE_DATA = { ranked: 15000 };
RULES['RQ-PRE-W1'] = { kind: 'buy', hold: 5, side: 'pre', cut: 0.99, family: 'pre', name: 'Top-1% 12-month winners bought 5 sessions before their earnings report, sold the close before it',
  rule: 'At the close 6 sessions before the reaction session r of an earnings 8-K (item 2.02, first of its 30-day group), rank every liquid stock by its 12-month return (close / close 252 sessions earlier - 1; 500+ stocks); if the reporting stock is liquid and in the top 1% (percentile >= 0.99), buy the open of r-5 and sell the close of r-1 (never held through the report).' };
RULES['RQ-PRE-W10'] = { kind: 'buy', hold: 5, side: 'pre', cut: 0.90, family: 'pre', name: 'Top-10% 12-month winners bought 5 sessions before their earnings report, sold the close before it',
  rule: 'As RQ-PRE-W1 with the top 10% (percentile >= 0.90).' };
RULES['RQ-PRE-POST1'] = { kind: 'avoid', hold: 5, side: 'post', cut: 0.99, family: 'pre', name: 'AVOID check: top-1% 12-month winners in the 5 sessions after their earnings reaction',
  rule: 'Same ranking as RQ-PRE-W1 (at r-6, top 1%); bought the open of r+1, sold the close of r+5; judged before costs on both sides against the average stock. Never a buy.' };
export const PRE_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'pre');
for (const id of PRE_IDS) { if (!IDS.includes(id)) IDS.push(id); if (RULES[id].kind === 'buy' && !BUY_IDS.includes(id)) BUY_IDS.push(id); ONE_OPEN.add(id); }
// 12-month return at session t: px(u) -> close or null; earlier close looked up within `slack` sessions before t-back
export function preMom(px, t, back = PRE.back, slack = PRE.slack) { const c = px(t); if (!(c > 0)) return null; const b = t - back; if (b < 0) return null;
  for (let u = b; u >= Math.max(0, b - slack); u--) { const z = px(u); if (z > 0) return c / z - 1; } return null; }
export const preRank = (list) => wikiRank(list, PRE.minCross);
// sessions of a trade for reaction session r: { t (signal), k (entry), x (exit) } or null if out of range
export function preWindow(r, side, T) { if (!(r >= 0)) return null; if (side === 'pre') { const t = r - PRE.lead, k = r - 5, x = r - 1; return t >= 1 ? { t, k, x } : null; }
  if (side === 'post') { const t = r - PRE.lead, k = r + 1, x = r + 5; return t >= 1 && x < T ? { t, k, x } : t >= 1 ? { t, k, x, future: true } : null; } return null; }
export function preDataRule({ subsOk, ciks, liqMonths, liqMapped, ranked }) { const r = { subs: ciks ? subsOk / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.subs >= EAT_DATA.subs)) why.push('8-K lists read ' + (r.subs * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= EAT_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  if (!(ranked >= PRE_DATA.ranked)) why.push('announcements with a ranked signal session ' + ranked + ' (15,000 needed: reader check)');
  return { ok: !why.length, ratios: { subs: r4(r.subs), map: r4(r.map) }, ranked, why: why.join('; ') || null }; }
const PRE_SOURCES = ['https://doi.org/10.1007/s11142-009-9104-9', 'https://ideas.repec.org/a/spr/reaccs/v15y2010i2d10.1007_s11142-009-9104-9.html', 'https://alphaarchitect.com/go-long-make-money-go-short-make-money-all-good/'];
const PRE_NOTE = 'Daily researcher 2026-11-12: Aboody, Lehavy and Trueman (2010, Review of Accounting Studies) "Limited attention and the earnings announcement returns of past stock market winners": top-1% 12-month winners earned +1.58% market-adjusted in the 5 days before earnings and -1.86% in the 5 days after (1971-2005). Different from ANOM-EAP (all reports, held through the report, rejected). Official SEC 8-K item 2.02 dates. Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun.';
export function preRegisterPre(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of PRE_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-11-12 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Announcement grouping, reaction timing, 12-month ranking, cut-offs, windows and data rule fixed in research-core.mjs (IDEA 16) before any run.', sources: PRE_SOURCES, hold: R.hold, note: PRE_NOTE }); ch++; }
  return ch; }
// ---------------- IDEA 17 (pre-registered 14 Nov 2026, before any run): STOCK-BASED COMPENSATION INTENSITY (SBC / sales) ----------------
// Source: Mohanram, White and Zhao, "Stock-based compensation, financial analysts, and equity overvaluation", Review of Accounting Studies
// 25(3), 2020, 1040-1077 (doi 10.1007/s11142-020-09546-2; SSRN 3439089): SBC intensity (SBC / sales) rises with valuation multiples
// (forward P/E 19 -> 28 from the bottom to the top quintile within industry); the TOP quintile has the lowest returns over the next year,
// about 5% below the BOTTOM quintile; analysts and non-GAAP earnings add SBC back, so the market treats it as free.
// NEW information line in this library (nothing tests SBC: checked 14 Nov; net share issuance ANOM-NSI and dilution warnings use the
// share count, not the expense). Long only: BUY the lowest SBC intensity; the highest = AVOID / SELL-warning check (never a short).
// HORIZON CHECK (12 Nov): the paper measures 12 months; the test holds 126 sessions (6 months) so both halves of the 5-year window can be
// judged (stated). COST CHECK (11 Nov): a 5%-a-year quintile spread gives the low side roughly 1%+ over 6 months vs the average stock,
// only just above the 0.8% cost: expected to be marginal (stated before the run).
// MEASURE (fixed now, no tuning): SBC = us-gaap:ShareBasedCompensation (the cash-flow add-back), else us-gaap:AllocatedShareBasedCompensationExpense,
// unit USD, ANNUAL durations (start..end 350-380 days), forms 10-K (no amendments), value >= 0. SALES = the first of us-gaap:Revenues,
// RevenueFromContractWithCustomerExcludingAssessedTax, RevenueFromContractWithCustomerIncludingAssessedTax, SalesRevenueNet that has an
// annual 10-K value for the SAME period (same end within 5 days); SALES >= 10M USD. SCORE = SBC / SALES. Point in time: values filed on or
// before F. Companies that never tag SBC are not in the test (no tag cannot be told from zero; stated).
// SIMPLIFICATION (stated now): no within-industry sort (the paper sorts within industry; SIC history for dead companies is not in the
// system, as IDEA 13). So the low side leans to old-economy sectors and the high side to software / biotech: sector mood can drive it.
// EVENT: a filing date F whose latest fiscal-year end E (annual SBC) is later than every year end reported before F and 0 <= F - E <= 120,
// period end from 2019-06-01.
// RANK (point in time, the lazy-prices ranker): percentile among ALL SBC events filed in the 365 days before F (300+ needed).
//   RQ-SBC-LOW126   BUY the next open after a 10-K whose SBC / sales is in the bottom 20% (percentile <= 0.20); sell the close 126 sessions later.
//   RQ-SBC-HIGH126  AVOID check: top 20% (percentile >= 0.80), 126 sessions; judged GROSS vs GROSS (31 Oct method). Never a buy.
// Public on the 'filed' date: bought at the OPEN of the first session strictly AFTER it. Liquid (system rule) on the session before entry.
// One open trade per stock per rule. Gates, costs, halves and verdicts: the shared judge of this file (same as IDEAS 6-16).
// DATA RULE (fixed now): no verdict until (a) 95%+ of universe companies looked up in the SEC bulk company facts file, (b) 85%+ of liquid
// stock-months map to an SEC number, (c) 5,000+ SBC events from 2021-10-01 (fewer = the reader is broken: fix it, no verdict).
// PAPER LANE: none at first (10-K season is Feb-Mar); one is added (companyconcept reads, as IDEA 13) only if RQ-SBC-LOW126 passes a bar.
export const SBC = { tags: ['ShareBasedCompensation', 'AllocatedShareBasedCompensationExpense'],
  sales: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet'],
  endFrom: '2019-06-01', from: '2018-01-01', yLo: 350, yHi: 380, maxLag: 120, eTol: 5, minSales: 10e6, eventsFrom: '2021-10-01' };
export const SBC_DATA = { looked: 0.95, map: 0.85, events: 5000 };
RULES['RQ-SBC-LOW126'] = { kind: 'buy', hold: 126, side: 'bottom', family: 'sbc', name: 'Lowest stock-based compensation per sales (bottom 20%), hold 6 months',
  rule: 'Buy the next open after a 10-K whose annual stock-based compensation (us-gaap ShareBasedCompensation, else AllocatedShareBasedCompensationExpense) divided by annual sales (Revenues / RevenueFromContractWithCustomer... / SalesRevenueNet, same fiscal year, 10M USD+) is in the bottom 20% (percentile <= 0.20 vs all such 10-Ks of the prior 365 days; filed within 120 days of the year end); stock liquid; sell the close 126 sessions later.' };
RULES['RQ-SBC-HIGH126'] = { kind: 'avoid', hold: 126, side: 'top', family: 'sbc', name: 'AVOID check: highest stock-based compensation per sales (top 20%), 126 sessions',
  rule: 'Information only: stocks whose SBC / sales is among the 20% highest (percentile >= 0.80), bought next open, 126 sessions; a valid AVOID filter if they lag the average stock in both halves BEFORE cost (gross vs gross; block t <= -2.5 for CONFIRMED). Never a buy.' };
export const SBC_IDS = Object.keys(RULES).filter(id => RULES[id].family === 'sbc');
for (const id of SBC_IDS) { if (!IDS.includes(id)) IDS.push(id); if (RULES[id].kind === 'buy' && !BUY_IDS.includes(id)) BUY_IDS.push(id); ONE_OPEN.add(id); }
// companyfacts JSON -> { s: [[end, val, filed, tagRank]] annual SBC, r: [[end, val, filed, tagRank]] annual sales }, sorted by filed then end
export function sbcRows(j) { const g = j && j.facts && j.facts['us-gaap'], s = [], r = [];
  const read = (tags, out, minV) => { const seen = new Set(); tags.forEach((tag, k) => { const u = g && g[tag] && g[tag].units;
    for (const x of (u && Array.isArray(u.USD) ? u.USD : [])) { if (!x || !x.start || !x.end || !x.filed || !ok(x.val) || x.val < minV || x.form !== '10-K' || x.end < SBC.from) continue;
      const len = daysBetween(x.start, x.end); if (len < SBC.yLo || len > SBC.yHi) continue; const key = k + '|' + x.end + '|' + x.val + '|' + x.filed; if (seen.has(key)) continue; seen.add(key); out.push([x.end, x.val, x.filed, k]); } }); };
  read(SBC.tags, s, 0); read(SBC.sales, r, 0);
  const by = (p, q) => p[2] < q[2] ? -1 : p[2] > q[2] ? 1 : p[0] < q[0] ? -1 : p[0] > q[0] ? 1 : p[3] - q[3];
  return { s: s.sort(by), r: r.sort(by) }; }
// best value for period end E known on F: lowest tag rank first, then the end closest to E (within tol), then the latest filed
export function sbcPick(rows, E, F, tol = 0) { let b = null; for (const x of rows) { if (x[2] > F) break; const gap = Math.abs(daysBetween(x[0], E)); if (gap > tol) continue;
  if (!b || x[3] < b[3] || (x[3] === b[3] && (gap < Math.abs(daysBetween(b[0], E)) || (gap === Math.abs(daysBetween(b[0], E)) && x[2] >= b[2])))) b = x; } return b; }
// rows -> events [{ d (filed), end, sbc, sales, g (= SBC / sales), form }]
export function sbcEvents(rows) { const out = [], S = (rows && rows.s) || [], R = (rows && rows.r) || []; let maxEnd = '';
  const byF = new Map(); for (const x of S) (byF.get(x[2]) || byF.set(x[2], []).get(x[2])).push(x);
  for (const F of [...byF.keys()].sort()) { const E = byF.get(F).reduce((m, x) => x[0] > m ? x[0] : m, '');
    if (E > maxEnd && E >= SBC.endFrom && daysBetween(E, F) >= 0 && daysBetween(E, F) <= SBC.maxLag) { const sb = sbcPick(S, E, F, 0), sl = sbcPick(R, E, F, SBC.eTol);
      if (sb && sl && sl[1] >= SBC.minSales) out.push({ d: F, end: E, sbc: sb[1], sales: sl[1], g: +(sb[1] / sl[1]).toFixed(6), form: '10-K' }); }
    if (E > maxEnd) maxEnd = E; }
  return out; }
export function sbcDataRule({ ciks, looked, liqMonths, liqMapped, events }) { const r = { looked: ciks ? looked / ciks : 0, map: liqMonths ? liqMapped / liqMonths : 0 }, why = [];
  if (!(r.looked >= SBC_DATA.looked)) why.push('company facts looked up ' + (r.looked * 100).toFixed(1) + '% of companies (95% needed)');
  if (!(r.map >= SBC_DATA.map)) why.push('liquid stock-months with an SEC number ' + (r.map * 100).toFixed(1) + '% (85% needed)');
  if (!(events >= SBC_DATA.events)) why.push('SBC intensity events ' + events + ' (5,000 needed: reader check)');
  return { ok: !why.length, ratios: Object.fromEntries(Object.entries(r).map(([k, v]) => [k, r4(v)])), events, why: why.join('; ') || null }; }
const SBC_SOURCES = ['https://doi.org/10.1007/s11142-020-09546-2', 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=3439089', 'https://clsbluesky.law.columbia.edu/2019/09/05/stock-based-compensation-financial-analysts-and-equity-overvaluation/'];
const SBC_NOTE = 'Daily researcher 2026-11-14: Mohanram, White and Zhao (2020, Review of Accounting Studies) "Stock-based compensation, financial analysts, and equity overvaluation": the highest SBC / sales quintile earned about 5% less over the next year than the lowest. New line (SBC expense from official SEC XBRL company facts); nothing in the library tests it. 6-month hold (horizon check) and no industry sort (stated). Buy bottom 20%; top 20% as an avoid check (gross vs gross). Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun.';
export function preRegisterSbc(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of SBC_IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered 2026-11-14 (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Measure, tag order, same-period sales match, ranking and data rule fixed in research-core.mjs (IDEA 17) before any run.', sources: SBC_SOURCES, hold: R.hold, note: SBC_NOTE }); ch++; }
  return ch; }
