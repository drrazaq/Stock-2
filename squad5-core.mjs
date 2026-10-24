// SQUAD 5 CORE (24 Oct 2026; squad5-lab.mjs uses it). "THE S&P 500 / SPUS IS ITSELF A TRADING RULE - COPY WHAT MAKES IT WIN."
// Pure functions, no network, no files. test/squad5-core.test.mjs.
// The owner's point: an index is a rule-based basket that keeps its winners, lets them grow, and drops losers at each rebalance; it beats
// most traders. These rules copy that mechanism (size, rank, low turnover, let winners run) and try to aim higher, on the liquid US market.
//
// PRE-REGISTERED 24 Oct 2026, BEFORE ANY RESULT WAS SEEN (one version each; ids SQ5-*; the same text is written into
// data/strategy-library.json before the first computation). Each rule is run ONCE on the 5-year window; the first complete verdict is
// frozen in data/squad5-lab.json firstRun (first-run.mjs freezeEach). No tuning on results.
//
// COMMON (all rules):
//   UNIVERSE at the close of formation session t: US-listed stocks with close >= 5 USD and 20-session average traded value >= 5M USD
//     (the system's liquid bar), dead and delisted stocks included (study-cache), that map to an SEC company number (historical ticker map
//     from the SEC Form 3/4/5 data sets, else the SEC ticker list) with SEC revenue facts (= an operating company: funds, ETFs and SPACs
//     are out), one ticker per company (the most traded). MARKET VALUE = close x the SEC share count known 30+ days before t (split-
//     repaired; the same split basis as the adjusted closes); a company without such a count uses its SEC balance-sheet / weighted-average
//     share count known from its filing date (multi-class companies such as Alphabet and Meta report no single cover-page count).
//     MARKET VALUE = the close AS TRADED that day (the adjusted close x every later split in the split list) x the share count as reported,
//     corrected for splits between its date and that day (cover-page count 30+ days old, else / when 3x+ different the financial-statement
//     count from its filing date: per filing, the largest of weighted-average basic, diluted and balance-sheet shares of the current period).
//     DATA GUARDS (set after the DIAG coverage checks of 24 Oct 2026, which showed share-count errors, BEFORE any rule result): only US
//     companies (SEC business address in a US state / DC / PR and no 20-F / 40-F filings: the index domicile rule; an ADR's SEC share
//     count is per ordinary share, so its market value is wrong; the address is the CURRENT one in SEC submissions); a market value is
//     used only if the 20-session average traded value is at least 0.02% of it (a share count off by 100x+ fails) and it is under
//     20,000B USD; when the cover-page count and the financial-statement count (weighted-average basic, else diluted, else balance-sheet
//     shares, known from the filing date) differ by more than 3x, the financial-statement count is used (DIAG 2 still showed x1000 rows).
//   HALAL: there is NO point-in-time halal (ZAD) status in the repository: data/halal.json holds the owner's ~360 recent marks and
//     data/zad-list.json one quarterly change list (Oct 2026). Using them on 2021-2026 would be survivorship and look-ahead, so the tests
//     run on the WHOLE liquid market (reported as such). SQ5-SHARIAH30 uses a point-in-time SHARIAH PROXY instead (below). Today's
//     members are reported with the owner's ZAD mark (ok / fail / unknown).
//   FORMATION = the first session of the month (quarterly rules: January, April, July, October); trades at the NEXT open. Rule start =
//     the first formation at which its inputs exist (market value: Jan 2022; SPY 200-day: Aug 2022; 12-1 momentum: Nov 2022; 12 prior
//     month starts: Dec 2022). Cash earns 0% (a sukuk / T-bill proxy at 0%: conservative).
//   PORTFOLIO (required for this squad, in addition to the per-trade standard): one account starting at 1, cost 0.4% of the money on
//     every buy and every sale (0.8% round trip; stress 0.6% + 0.6%), turnover counted on every rebalance (weight resets included);
//     daily marks; a dead stock (vanished under 3 USD) is worth 0, one that vanished above 3 USD is paid its last close. Reported: monthly
//     returns, CAGR, max drawdown, both halves (older = start to the last close of 2023, newer = from there to the last close) vs SPY
//     (price; the cache has no dividends, and neither do the stocks: like for like), SPUS, HLAL, and the equal-weight average liquid stock
//     (monthly, each stock capped at +300% a month). "Beats SPY after costs in BOTH halves" is reported plainly for every rule.
//   PER-TRADE JUDGE (so the scan's TRY SMALL lane can read it): each HOLDING PERIOD is one trade = a stock held from one review of the rule
//     to its next review (quarterly rules: a quarter, ~63 sessions; monthly rules: a month, ~21; SQ5-NEWIN: its whole 6-month entry; a sale,
//     a switch to cash, a delisting or the last close ends a period early; still held at the last close = marked there): open of the
//     period -> open of the next review (or the exit). This is what a TRY SMALL buy of one member for one period would get, so the FULL
//     0.8% cost is charged on every period (1.2% stress) even when the basket keeps the stock (conservative; the portfolio view charges
//     the real turnover); halves by the period's start (before / from 2024-01-01); value-core judge with the long-hold gate (hold-core judgeHold): > 0 after 0.8% and
//     1.2%, better than the average liquid stock over the same days, better than the same stock held the same number of sessions on its
//     other days (entries every 21 sessions, 63+ sessions away), > 0 without the 2 best, 20+ trades and 3+ blocks (63-session blocks of
//     the formation day), block t >= 2.5 (PROVEN at the league bar), and return per year of capital tied up above SPY on the same days in
//     both halves. Every gross return, the rule's and both yardsticks', capped at +300% (engine audit AUD-1, capBoth); uncapped =
//     sensitivity. A path with a near-whole 3x-50x one-day jump (an unadjusted split) is left out on both sides.
//
// THE RULES:
//   SQ5-TOP20      the 20 largest by market value; quarterly; equal weight (reset to equal each quarter). Cap-weighted twin reported as
//                  information (same members, so the same per-trade trades).
//   SQ5-TOP20-TF   SQ5-TOP20 with a trend filter: at every month start, SPY close below its 200-session average -> sell everything at the
//                  next open and hold cash (0%); back above -> buy the current top 20 at the next open; quarterly resets while invested.
//   SQ5-EW100      the 100 largest, equal weight, quarterly reset (the "equal weight beats cap weight" claim); the cap-weighted 100 is the
//                  information twin it must beat.
//   SQ5-MOMBUF     "winners stay": among the 500 largest, the 20 with the highest 12-1 month return (close 21 sessions ago / close 252
//                  sessions ago - 1); MONTHLY review; a holding is sold ONLY when it falls out of the top 40 by that return among the 500
//                  largest, or out of the 500 largest (the index buffer = low turnover); vacancies are filled by the best-ranked stocks not
//                  held; NO re-weighting (winners grow); the cash freed by sales is split equally among the new entries.
//   SQ5-MOMBUF-TF  SQ5-MOMBUF with the same monthly SPY 200-day filter (out -> all cash; back in -> a fresh top 20, equal weight).
//   SQ5-QUAL20     quality + size: among the 300 largest, the 20 with the best quality score = the average of the percentile ranks of the
//                  ROIC proxy (TTM operating income x (1 - 21%) / (equity + debt - cash)) and the TTM free-cash-flow margin ((operating
//                  cash flow - capex) / revenue), both > 0; SEC facts filed BEFORE t and of a period that ended 45+ days before t;
//                  quarterly; equal weight reset.
//   SQ5-NEWIN      new entrants (an index-addition proxy): a stock in the 500 largest at this month start that was NOT in the 500 largest at
//                  any of the previous 12 month starts; buy at the next open; sell at the open of the 6th month start after entry
//                  (about 126 sessions). Portfolio: equal weight across the open entrants, at most 5% each (the rest cash), reset monthly.
//   SQ5-SHARIAH30  the 30 largest that pass a POINT-IN-TIME SHARIAH PROXY (what SPUS does, more concentrated): business screen by SEC SIC
//                  code (out: banks, credit, brokers, insurance, investment offices and REITs 6000-6499 / 6700-6799; alcohol 2082-2085;
//                  tobacco 2100-2199; meat packing 2011; hotels-casinos 7011; gambling and amusement 7990 / 7993; broadcasting and cable
//                  4832-4841; advertising 7310-7319; motion pictures 7812-7829) and financial screens on the latest balance sheet filed
//                  before t: debt / market value < 33% and cash / market value < 33% (both known; a company that never reported debt has
//                  none); quarterly; equal weight reset. Cap-weighted twin as information. (S&P's real screens use 36-month average market
//                  value and more items: this is a proxy, not the ZAD / S&P status.)
import { instantAt } from './value-core.mjs';
export const COST = 0.008, STRESS = 0.012, SIDE = 0.004, SIDE_STRESS = 0.006, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', BLOCK = 63, YEAR = 252, CAP = 3;
export const MAX_CAP = 2e13, MIN_TURN = 0.0002, BIG = 500, TOPN = 20, EWN = 100, QUALN = 300, MOMBUF = 40, NEWIN_LOOK = 12, NEWIN_MONTHS = 6, NEWIN_MAXW = 0.05, SH_RATIO = 0.33, SHN = 30, PIT_LAG = 45;
const EPS = 1e-9, ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const median = (a) => { const s = a.filter(ok).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z');
export const addDays = (d, n) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10);
export const isQuarterMonth = (d) => ['01', '04', '07', '10'].includes(String(d).slice(5, 7));
// the first session of every month (index into D), skipping D[0]
export const monthStarts = (D) => { const o = []; for (let t = 1; t < D.length; t++) if (D[t].slice(0, 7) !== D[t - 1].slice(0, 7)) o.push(t); return o; };
// the last session of every month (index), the final session included even if the month is not over
export const monthEnds = (D) => { const o = []; for (let t = 0; t < D.length; t++) if (t === D.length - 1 || D[t + 1].slice(0, 7) !== D[t].slice(0, 7)) o.push(t); return o; };

// ================= selection =================
// rows [{ key, cap }] -> the rows with a usable market value, largest first (ties: key ascending)
// rows may carry dv (20-session traded value): a value under MIN_TURN x cap marks the market value as a unit error
export function byCap(rows) { return rows.filter(r => ok(r.cap) && r.cap > 0 && r.cap <= MAX_CAP && !(ok(r.dv) && r.dv < MIN_TURN * r.cap)).sort((a, b) => b.cap - a.cap || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)); }
export const topByCap = (rows, n) => byCap(rows).slice(0, n);
// 12-1 month return: close 21 sessions ago over the close 252 sessions ago (c = array-like of closes)
export function mom121(c, t) { if (t < 252) return null; const a = c[t - 252], b = c[t - 21]; return a > 0 && b > 0 ? b / a - 1 : null; }
// THE INDEX BUFFER. held = keys held now; ranked = eligible keys, best first; keep a holding while its rank is within `buf` (0-based rank <
// buf); fill up to n with the best-ranked keys not held. Returns { keep, drop, add } (arrays of keys).
export function bufferSelect(held, ranked, n, buf) {
  const pos = new Map(ranked.map((k, j) => [k, j])), keep = [], drop = [];
  for (const k of held) { const j = pos.get(k); if (j !== undefined && j < buf) keep.push(k); else drop.push(k); }
  const ks = new Set(keep), add = []; for (const k of ranked) { if (keep.length + add.length >= n) break; if (!ks.has(k)) add.push(k); }
  return { keep, drop, add };
}
// new entrant: in the set now and in none of the previous `look` month-start sets (prev = array of booleans, newest last; a month start
// before the data or without a ranking does not count, so fewer than `look` known -> false)
export const newEntrant = (inNow, prev, look = NEWIN_LOOK) => !!inNow && Array.isArray(prev) && prev.length >= look && prev.slice(-look).every(x => x === false);
// quality: rows [{ key, roic, fcfM }] -> the n keys with the best average percentile rank of roic and fcfM (both > 0); ties by key
export function qualityPick(rows, n) {
  const a = rows.filter(r => ok(r.roic) && ok(r.fcfM) && r.roic > 0 && r.fcfM > 0); if (!a.length) return [];
  const pct = (f) => { const s = [...a].sort((x, y) => f(x) - f(y)), m = new Map(); s.forEach((r, j) => m.set(r.key, s.length > 1 ? j / (s.length - 1) : 1)); return m; };
  const pr = pct(r => r.roic), pf = pct(r => r.fcfM);
  return a.map(r => ({ key: r.key, s: (pr.get(r.key) + pf.get(r.key)) / 2 })).sort((x, y) => y.s - x.s || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0)).slice(0, n).map(r => r.key);
}
// ---- Shariah proxy ----
export function haramSic(sic) { const n = +sic; if (!sic || !isFinite(n)) return false;
  return (n >= 6000 && n <= 6499) || (n >= 6700 && n <= 6799) || (n >= 2082 && n <= 2085) || (n >= 2100 && n <= 2199) || n === 2011 || n === 7011 || n === 7990 || n === 7993
    || (n >= 4832 && n <= 4841) || (n >= 7310 && n <= 7319) || (n >= 7812 && n <= 7829); }
const firstOf = (tagged, f) => { for (const facts of Object.values(tagged || {})) { const r = f(facts); if (r !== null && r !== undefined) return r; } return null; };
const near = (a, b, tol) => Math.abs(ms(a) - ms(b)) / DAY <= tol;
// debt and cash at the latest balance sheet (the latest equity date) filed before asOf: co = { eq, debt, cash } tagged facts [{ s, e, v, f }].
// debt = LongTermDebt (incl. the current part) for that date, else the parts (non-current + current, else short-term debt); a company that
// never reported a debt item before asOf has none (0); one that did but not for that date -> null. cash null when not reported for that date.
export function debtCashAt(co, asOf, stale = 200) {
  const eq = firstOf(co && co.eq, (f) => instantAt(f, asOf)); if (!eq || (ms(asOf) - ms(eq.end)) / DAY > stale) return { end: null, debt: null, cash: null };
  const at = (facts) => { if (!facts) return null; const r = instantAt(facts.filter(x => x.e <= addDays(eq.end, 5)), asOf); return r && near(r.end, eq.end, 5) ? r.val : null; }, D = (co && co.debt) || {};
  const total = at(D.LongTermDebt), parts = ['LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent'].map(k => at(D[k])), ever = Object.values(D).some(f => (f || []).some(x => x.f < asOf));
  const debt = total !== null ? total : parts.some(v => v !== null) ? (parts[0] || 0) + (parts[1] !== null ? parts[1] : parts[2] || 0) : ever ? null : 0;
  const cash = firstOf(co && co.cash, (f) => at(f));
  return { end: eq.end, debt, cash };
}
export function shariahOk({ sic, debt, cash, cap }) {
  if (!sic) return { ok: false, why: 'no industry code' }; if (haramSic(sic)) return { ok: false, why: 'business (SIC ' + sic + ')' };
  if (!(cap > 0)) return { ok: false, why: 'no market value' }; if (!ok(debt)) return { ok: false, why: 'debt unknown' }; if (!ok(cash)) return { ok: false, why: 'cash unknown' };
  if (!(debt / cap < SH_RATIO - EPS)) return { ok: false, why: 'debt 33%+ of market value' }; if (!(cash / cap < SH_RATIO - EPS)) return { ok: false, why: 'cash 33%+ of market value' };
  return { ok: true, why: null };
}
// ---- market value from AS-TRADED numbers (DIAG 3 showed that split-adjusted prices x as-reported share counts break when a split or
// reverse split happened after the share count's date, e.g. after a merger under a new SEC company) ----
// splits [[date, r]] (r = new shares per old share, from the split list): the product of r over splits executed after a and on / before b
export function splitRatio(splits, a, b) { let f = 1; for (const [d, r] of splits || []) if (d > a && d <= b && r > 0) f *= r; return f; }
// cover = [[asOfDate, shares]] (cover-page counts, usable 30+ days after their date); alt = [[filed, periodEnd, shares]] (financial-statement
// counts, usable after their filing date). Price as traded on d = adjusted close x every later split; shares x the splits between their date
// and d. When both counts exist and differ by more than 3x, the financial-statement count is used. Returns { cap, src } or null.
export function capAt({ adjClose, d, splits, cover, alt }) {
  if (!(adjClose > 0)) return null; const px = adjClose * splitRatio(splits, d, '9999-12-31'), lim = addDays(d, -30);
  let a = null, b = null; for (const [e, n] of cover || []) if (e <= lim && n > 0) a = n * splitRatio(splits, e, d);
  for (const [f, e, n] of alt || []) if (f < d && n > 0) b = n * splitRatio(splits, e, d);
  const sh = a && b && (a / b > 3 || b / a > 3) ? b : a || b; return sh ? { cap: px * sh, src: sh === a ? 'cover' : 'statements' } : null;
}
// US company from SEC submissions: business address state code (US state, DC, PR) and no 20-F / 40-F among its filings
export const US_STATES = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR'.split(' '));
export const usCompany = (addrState, forms) => US_STATES.has(String(addrState || '').toUpperCase()) && !(forms || []).some(f => /^(20-F|40-F)/.test(String(f)));
// SPY trend: close above its n-session average (90%+ present); null when unknown
export function aboveMA(c, t, n = 200) { if (t - n + 1 < 0 || !(c[t] > 0)) return null; let s = 0, h = 0; for (let k = t - n + 1; k <= t; k++) if (c[k] > 0) { s += c[k]; h++; } return h >= n * 0.9 ? c[t] > s / h : null; }

// ================= the portfolio engine =================
// px = { o(i, k), c(i, k), last(i) (last session with a close), vanished(i), dead(i) }. events = Map te -> one of
//   { kind: 'reset', w: Map(i -> weight) }   trade at the open of te to these weights of the account (weights sum <= 1; the rest is cash)
//   { kind: 'drift', drop: [i], add: [i] }  sell `drop`, buy `add` with the cash split equally; holdings are NOT re-weighted
//   { kind: 'cash' }                          sell everything
// Sales first, then buys; cost `side` on the money of every buy and sale; a stock without an open at te is not bought (a sale without an
// open uses the latest close). Vanished holdings are cashed after their last close (dead = 0). Equity marked at every close from `start`.
// Returns { eq: Float64Array(T) (NaN before start), trades: [{ i, te, pxIn, x, at ('o'|'c'), pxOut, kind ('sold'|'dead'|'gone'|'open') }],
// traded (sum of money traded), costPaid }.
export function simulate({ T, start, events, px, side = SIDE }) {
  const eq = new Float64Array(T).fill(NaN), H = new Map(), trades = []; let cash = 1, traded = 0, costPaid = 0;
  const lastClose = (i, k) => { for (let q = Math.min(k, T - 1); q >= 0; q--) { const z = px.c(i, q); if (z > 0) return z; } return null; };
  const openPx = (i, k) => { const o = px.o(i, k); return o > 0 ? o : null; };
  const close = (i, h, x, at, p, kind) => { trades.push({ i, te: h.te, pxIn: h.pxIn, x, at, pxOut: p, kind }); H.delete(i); };
  const sell = (i, k, frac = 1) => { const h = H.get(i), p = openPx(i, k) || lastClose(i, k - 1); if (!(p > 0)) return; const sh = h.sh * frac, v = sh * p; cash += v * (1 - side); traded += v; costPaid += v * side; h.sh -= sh; if (frac >= 1 - EPS) close(i, h, k, 'o', p, 'sold'); };
  const buy = (i, k, v) => { const p = openPx(i, k); if (!(p > 0) || !(v > 0)) return; const h = H.get(i); if (h) h.sh += v / p; else H.set(i, { sh: v / p, te: k, pxIn: p }); cash -= v * (1 + side); traded += v; costPaid += v * side; };
  for (let k = start; k < T; k++) {
    for (const [i, h] of [...H]) if (px.vanished(i) && k > px.last(i)) { const p = px.dead(i) ? 0 : px.c(i, px.last(i)); cash += h.sh * p; close(i, h, px.last(i), 'c', p, px.dead(i) ? 'dead' : 'gone'); }
    const ev = events.get(k);
    if (ev) {
      if (ev.kind === 'cash') for (const i of [...H.keys()]) sell(i, k);
      else if (ev.kind === 'drift') { for (const i of ev.drop || []) if (H.has(i)) sell(i, k); const add = (ev.add || []).filter(i => !H.has(i) && openPx(i, k) > 0); if (add.length && cash > 0) { const v = cash / (1 + side) / add.length; for (const i of add) buy(i, k, v); } }
      else if (ev.kind === 'reset') { const val = (i) => { const h = H.get(i), p = openPx(i, k) || lastClose(i, k - 1); return h && p > 0 ? h.sh * p : 0; };
        for (const i of [...H.keys()]) if (!ev.w.has(i)) sell(i, k);
        const total = cash + [...H.keys()].reduce((a, i) => a + val(i), 0), buys = [];
        for (const [i, w] of ev.w) { if (!(w > 0)) continue; const cur = val(i), tgt = w * total; if (H.has(i) && cur > tgt * (1 + EPS)) sell(i, k, (cur - tgt) / cur); else if (tgt > cur * (1 + EPS) && openPx(i, k) > 0) buys.push([i, tgt - cur]); }
        const need = buys.reduce((a, b) => a + b[1], 0) * (1 + side), f = need > cash ? Math.max(0, cash) / need : 1; for (const [i, v] of buys) buy(i, k, v * f); } }
    let v = cash; for (const [i, h] of H) { const p = lastClose(i, k); v += p > 0 ? h.sh * p : 0; } eq[k] = v;
  }
  for (const [i, h] of H) trades.push({ i, te: h.te, pxIn: h.pxIn, x: T - 1, at: 'c', pxOut: lastClose(i, T - 1), kind: 'open' });
  return { eq, trades, traded, costPaid };
}
// HOLDING PERIODS: split every simulated holding at the rule's review sessions (sorted array of trade sessions). A review r cuts a holding
// that started before r and was still held at the open of r (its own exit at an open after r, or a close at / after r). Returns pieces
// { i, te, x, at, kind ('period' when the piece ends at a review), pxIn (the original entry price on the first piece, else null), pxOut
// (the holding's own exit price on the last piece, else null) }.
export function periodPieces(trades, reviews) {
  const out = [];
  for (const z of trades) { const cuts = reviews.filter(r => r > z.te && (z.at === 'o' ? r < z.x : r <= z.x)), starts = [z.te, ...cuts];
    starts.forEach((s, j) => { const last = j === starts.length - 1; out.push({ i: z.i, te: s, x: last ? z.x : starts[j + 1], at: last ? z.at : 'o', kind: last ? z.kind : 'period', pxIn: j === 0 ? z.pxIn : null, pxOut: last ? z.pxOut : null }); }); }
  return out;
}
export const periodHold = (id) => id === 'SQ5-NEWIN' ? 126 : RULES[id].kind === 'quarterly' ? 63 : 21;
// equal weights over keys (each at most maxW)
export const equalW = (keys, maxW = 1) => { const n = keys.length; return new Map(keys.map(k => [k, n ? Math.min(1 / n, maxW) : 0])); };
// cap weights over rows [{ key, cap }]
export const capW = (rows) => { const s = rows.reduce((a, r) => a + r.cap, 0); return new Map(rows.map(r => [r.key, s > 0 ? r.cap / s : 0])); };

// ================= portfolio statistics =================
// level series lv (index -> value; NaN = none) between sessions a and b (inclusive): total return, CAGR (252 sessions a year), max
// drawdown over the points given (pts = the indices to read; default every session)
export function pathStats(lv, a, b, pts = null) {
  const idx = (pts || Array.from({ length: b - a + 1 }, (_, j) => a + j)).filter(k => k >= a && k <= b && lv[k] > 0); if (idx.length < 2) return null;
  const v0 = lv[idx[0]], v1 = lv[idx[idx.length - 1]], yrs = (idx[idx.length - 1] - idx[0]) / YEAR; let pk = 0, dd = 0; for (const k of idx) { if (lv[k] > pk) pk = lv[k]; dd = Math.min(dd, lv[k] / pk - 1); }
  return { total: r4(v1 / v0 - 1), cagr: yrs > 0 ? r4(Math.pow(v1 / v0, 1 / yrs) - 1) : null, maxDD: r4(dd), years: r4(yrs) };
}
// monthly returns at the month-end indices me (from the first one with a value)
export function monthly(lv, me, D) { const out = []; let prev = null; for (const k of me) { if (!(lv[k] > 0)) continue; if (prev !== null) out.push({ m: D[k].slice(0, 7), r: r4(lv[k] / lv[prev] - 1) }); prev = k; } return out; }

// ================= the rules as registered (library text) =================
const COMMON = 'Universe at the close of formation session t: liquid US stocks (close >= 5 USD, 20-session average traded value >= 5M USD; dead and delisted included) that map to an SEC company with revenue facts (operating companies; ETFs, funds and SPACs out), one ticker per company; market value = close x SEC share count known 30+ days before t (split-repaired; else the balance-sheet / weighted-average count from its filing date). Data guards: US companies only (SEC business address in a US state, no 20-F / 40-F filings; current SEC address), a market value is used only if 20-session traded value >= 0.02% of it and it is < 20,000B; a cover-page share count more than 3x off the financial-statement count (weighted-average shares from the filing date) is replaced by the latter. Formation at the first session of the month (quarterly: Jan / Apr / Jul / Oct); trades at the next open; cash at 0%. NO point-in-time halal status exists in the repository (data/halal.json = the owner\'s recent marks, zad-list = one quarterly change list): the test runs on the whole liquid market; today\'s members carry the owner\'s ZAD mark. PORTFOLIO: one account, 0.4% cost per buy and per sale (stress 0.6%), turnover of every rebalance counted, daily marks, dead stock = 0; monthly returns, CAGR, max drawdown, halves (start - end 2023 / 2024 - last close) vs SPY (price, like the stocks), SPUS, HLAL and the equal-weight average liquid stock. PER-TRADE JUDGE: each holding period = one trade (a stock from one review of the rule to its next review: quarter / month / the whole 6-month entry for SQ5-NEWIN; a sale, cash switch, delisting or the last close ends it early; still held = marked at the last close), the full 0.8% cost on every period (1.2% stress; conservative: what a TRY SMALL buy of one member for one period pays), halves by period start before / from 2024-01-01, value-core + hold-core judgeHold: > 0 after both costs, better than the average liquid stock over the same days, better than the same stock held as long on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= 2.5 (63-session blocks), return per year of capital above SPY on the same days in both halves; every gross return (rule and yardsticks) capped at +300% (AUD-1 capBoth). Run once, first complete verdict frozen.';
export const RULES = {
  'SQ5-TOP20': { name: 'The 20 largest companies, equal weight, quarterly', kind: 'quarterly', short: 'the 20 largest US companies by market value, equal weight, re-formed every quarter (cap-weighted twin reported)',
    rule: 'Quarterly: the 20 largest by market value; equal weight, reset to equal at every quarter. Cap-weighted twin (same members) reported as information.' },
  'SQ5-TOP20-TF': { name: 'The 20 largest, with a 200-day market filter', kind: 'quarterly', tf: true, short: 'SQ5-TOP20, but all cash while SPY is under its 200-day average (checked monthly)',
    rule: 'As SQ5-TOP20; at every month start, SPY close below its 200-session average -> sell all at the next open, hold cash at 0%; back above -> buy the current top 20 at the next open; quarterly resets while invested.' },
  'SQ5-EW100': { name: 'The 100 largest, equal weight (vs cap weight)', kind: 'quarterly', short: 'the 100 largest by market value, equal weight, quarterly; must beat the cap-weighted 100',
    rule: 'Quarterly: the 100 largest by market value, equal weight, reset every quarter. The cap-weighted 100 (same members) is the information twin.' },
  'SQ5-MOMBUF': { name: 'Winners stay: 12-1 momentum top 20 of the 500 largest, with an index buffer', kind: 'monthly', short: 'top 20 by 12-1 month return among the 500 largest; sold only when out of the top 40 (or out of the 500 largest); no re-weighting',
    rule: 'Monthly: among the 500 largest, rank by the 12-1 month return (close 21 sessions ago / close 252 sessions ago - 1); hold 20; a holding is sold only when it falls out of the top 40 by that return or out of the 500 largest; vacancies filled by the best-ranked not held; no re-weighting; freed cash split equally among new entries.' },
  'SQ5-MOMBUF-TF': { name: 'Winners stay, with a 200-day market filter', kind: 'monthly', tf: true, short: 'SQ5-MOMBUF, but all cash while SPY is under its 200-day average (checked monthly)',
    rule: 'As SQ5-MOMBUF; at every month start, SPY close below its 200-session average -> sell all at the next open (cash 0%); back above -> a fresh top 20, equal weight.' },
  'SQ5-QUAL20': { name: 'Quality + size: the 20 most profitable cash generators of the 300 largest', kind: 'quarterly', short: 'among the 300 largest, the 20 with the best ROIC + free-cash-flow margin rank; quarterly, equal weight',
    rule: 'Quarterly: among the 300 largest, quality score = average percentile rank of the ROIC proxy (TTM operating income x 0.79 / (equity + debt - cash)) and the TTM free-cash-flow margin ((operating cash flow - capex) / revenue), both > 0; SEC facts filed before t, of a period ended 45+ days before t; the top 20, equal weight reset.' },
  'SQ5-NEWIN': { name: 'New entrants to the 500 largest (index-addition proxy), held 6 months', kind: 'monthly', short: 'a stock that just entered the 500 largest (not in at any of the previous 12 month starts); hold 6 months',
    rule: 'Monthly: in the 500 largest at this month start and in none of the previous 12 month starts\' 500 largest; buy at the next open; sell at the open of the 6th month start after entry (~126 sessions). Portfolio: equal weight across open entrants, max 5% each (rest cash), reset monthly.' },
  'SQ5-SHARIAH30': { name: 'The 30 largest that pass a Shariah proxy (SPUS-style, concentrated)', kind: 'quarterly', short: 'the 30 largest passing a point-in-time Shariah proxy (no banks/insurance/alcohol/tobacco/gambling/media; debt and cash each < 33% of market value); quarterly, equal weight',
    rule: 'Quarterly: the 30 largest that pass: business screen by SEC SIC (out: 6000-6499, 6700-6799, 2082-2085, 2100-2199, 2011, 7011, 7990, 7993, 4832-4841, 7310-7319, 7812-7829) and, on the latest balance sheet filed before t, debt / market value < 33% and cash / market value < 33% (both known; never reported debt = 0); equal weight reset. Cap-weighted twin as information. A proxy of the S&P Shariah method (which uses 36-month average market value and more items), not the ZAD status.' },
};
export const IDS = Object.keys(RULES);
export function preRegister(LB, today = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Index-style baskets (Squad 5)', name: r.name, explain: r.short + '. RULE: ' + r.rule + ' ' + COMMON, status: 'pre-registered ' + today + ' (squad 5); 5-year one-shot pending', agent: 'squad5', registered: today,
      libraryCheck: 'Overlaps: P1 (index fund, monthly buying: the yardstick itself), X6 (equal-weight rebalancing of the owner\'s holdings), ANOM-MOM12 / DEC-FROG (12-1 momentum, top 10% / smooth, fixed holds, all liquid stocks: rejected / not proven), ANOM-QMJ / V1 (quality, all sizes: rejected), E6 / ANOM-IDXADD (index additions: needs data), A-RG1 / SQ3-REGIME (200-day regime). New here: BASKETS of the LARGEST companies with index mechanics (rank by size, buffer, no re-weighting, quarterly), judged as a portfolio with turnover costs as well as per holding.',
      note: 'Pre-registered ' + today + ' BEFORE any run (squad5-core.mjs = the exact rule). 5-year one-shot by squad5-lab.mjs, first complete verdict frozen in data/squad5-lab.json; forward paper lane (data/squad5-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
// board helpers (as squad4-core)
export function boardStats(rows) { const net = rows.map(r => r.g - COST), win = net.filter(x => x > 0), loss = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => r.g - r.c))) : null, pf: loss.length && sum(loss) < 0 ? r4(sum(win) / -sum(loss)) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
