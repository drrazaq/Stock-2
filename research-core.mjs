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
