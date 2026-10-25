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
export const IDS = Object.keys(RULES), BUY_IDS = IDS.filter(id => RULES[id].kind === 'buy');
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
const SOURCES = { lazy: ['https://onlinelibrary.wiley.com/doi/10.1111/jofi.12885', 'https://www.nber.org/papers/w25084'] };
export function preRegister(LB, date = '2026-10-25') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const id of IDS) { if (LB.strategies.some(x => x.id === id)) continue; const R = RULES[id];
    LB.strategies.push({ id, family: 'Daily researcher (RQ)', name: R.name, agent: 'daily researcher', kind: R.kind, status: 'pre-registered ' + date + ' (daily researcher); 5-year one-shot pending',
      explain: R.rule + ' Text measure, ranking and data rule fixed in research-core.mjs before any run (cosine similarity of 10-K word counts vs the previous 10-K; percentile vs the prior 365 days of 10-K similarities; both documents 10,000+ words).',
      sources: SOURCES[R.family] || [], hold: R.hold,
      note: 'Daily researcher ' + date + ': Cohen, Malloy and Nguyen (2020, Journal of Finance) Lazy Prices, 10-K only (the paper reports similar 10-K-only results). New information source (SEC filing text), not a chart shape. Tests the text-change half of C-DIFF1; C-DIFF1 itself is unchanged. Run once on 5 years incl. dead stocks with the system gates; first complete verdict frozen in data/research-lab.json firstRun; forward paper from 26 Oct 2026.' });
    ch++; }
  return ch; }
