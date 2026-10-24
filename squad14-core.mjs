// SQUAD 14 CORE (24 Oct 2026; squad14-lab.mjs uses it). "VARIANTS OF THE FEW THINGS THAT WORKED" - NEW, pre-registered rules, never a
// re-run or edit of a frozen rule. Pure functions, no network, no files. test/squad14-core.test.mjs. Long only; no leverage; no shorting;
// never places an order.
// WHY: of ~450 ideas, what came closest today was SQ11-PB12 (leader = top 20% by 12-1 return among the 300 largest; first close 12% under
// its 50-day high while above its 200-day; hold 126: beat SPY per year in both halves, NOT PROVEN on block t), SQ6-MTUM / SQ6-QMOM
// (momentum funds' rulebooks) and SQ13-LEADH (leader breakout -> followers; rejected, coarse 3-digit SIC). These rules ask whether the
// PB12 result survives a different leader definition, a deeper threshold, a 5-slot account the owner can actually hold, a Shariah screen,
// and whether the leader-follower idea works with real (4-digit) industries.
// HONESTY: these are VARIANTS OF A WINNER picked after seeing it. Six variants are tried here (listed below; no other version is run). A
// variant passing is weaker evidence than an independent idea passing: the luck bar matters more, and the report says so.
//
// PRE-REGISTERED 24 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids SQ14-*; squad14-lab.mjs writes the same text into
// data/strategy-library.json before computing anything). Each rule is run ONCE on the 5-year window; the first complete verdict is frozen
// in data/squad14-lab.json firstRun (first-run.mjs freezeEach). No tuning on results.
//
// COMMON (all rules; Squad 11's conventions, unchanged):
//   UNIVERSE = the N largest by point-in-time market value at each month end t0 (the last session of a calendar month): exactly Squad 5 /
//     Squad 11's market value (squad5-core capAt: liquid US operating companies, close >= 5 USD, 20-session traded value >= 5M USD, dead
//     stocks included, SEC company number from the historical Form 3/4/5 ticker map, SEC revenue facts, one ticker per company, US
//     domicile, no 20-F / 40-F, SEC share count known 30+ days before t0, the 0.02% turnover guard). N = 300 (PB rules), 500 (LEADH4).
//   12-1 LEADER (Squad 11) = among the 300, the top 20% (ceil) by close 21 sessions before t0 / close 252 sessions before t0 - 1.
//   MTUM-STYLE LEADER (Squad 6's MSCI method on the market-value universe) = among the 300, the up-to-60 (ceil 20%) with the highest
//     POSITIVE combined z of 6-month (close t0-21 / close t0-126 - 1) and 12-month (close t0-21 / close t0-252 - 1) momentum, each divided by
//     the annualised standard deviation of weekly returns over up to 156 weeks (52+) ending with the last complete week at / before t0
//     (squad6-core mtumPick: z-scores, 50/50, re-standardised, winsorised +-3).
//   PULLBACK (Squad 11 pullbackFirst) = the FIRST close >= X% under the highest close of the last 50 sessions (today included) while the
//     close is above its 200-session average (the previous close was less than X% under its own 50-session high).
//   A leader set formed at t0 is used for the signals at closes t with t0 < t <= the next month end. SIGNAL at the close of t on a liquid
//     stock; BUY the next open; SELL at the close of the hold session (k + hold - 1); a stock that stops trading = its last close. One open
//     trade per stock per rule. No stops. A trade whose path holds a near-whole 3x-50x one-day jump (unadjusted split) is left out.
//   COST 0.8% round trip (1.2% stress). Halves by signal date (before / from 2024-01-01). JUDGED with hold-core judgeHold (value-core
//     tier-2 + the long-hold gate) on both halves: > 0 after 0.8% and 1.2%, better than the average liquid stock bought and sold at the same
//     moments (yardstick capBoth, +300% cap on both, AUD-1), better than the same stock held as long on its other days, > 0 without its 2
//     best, 20+ trades and 3+ blocks (63 sessions) per half, block t >= 2.5, and return per year of capital tied up above SPY's over the
//     same days in both halves. Reported per trade, per calendar year vs SPY and the average stock, and whether scan.mjs tryQualifies would
//     take it (incl. the perYear and portfolio gates).
//   PORTFOLIO (SQ14-PB12P5 and SQ14-MTPB only, pre-registered as part of those rules, so it GATES them in scan.mjs): one account from 1 at
//     the first leader month end, 0.4% cost on the money of every buy and every sale (stress 0.6%), cash at 0%, daily marks; positions
//     follow the rule's own trades (buy the next open, sell the hold close / last close). Halves = start to the last close of 2023 / from
//     there to the last close; CAGR and max drawdown vs SPY and SPUS (price; no dividends on either side); beatsSpy = CAGR above SPY's.
//
// THE RULES (hold fixed before the run):
//   SQ14-PB12M   hold 126: PB12 with the MTUM-STYLE leader list (monthly) instead of the 12-1 list; 12% pullback; else as SQ11-PB12.
//   SQ14-PB15    hold 126: 12-1 leaders (as SQ11-PB12); the first close 15% under the 50-day high, above the 200-day.
//   SQ14-PB12P5  hold 126: the SQ11-PB12 signals traded in ONE account with at most 5 open positions: each new position = 20% of the
//                account (marked at the previous close), bought with what cash there is; a signal while 5 are open, or on a stock already
//                held, is skipped; several signals the same evening are taken in order of the 12-1 return at t0 (highest first).
//                Judged per trade on the trades taken, AND as a portfolio vs SPY / SPUS per half.
//   SQ14-PB12H   hold 126: SQ11-PB12 (12-1 leaders of all 300, 12%) only on leaders that pass a POINT-IN-TIME SHARIAH PROXY at t0
//                (squad5-core shariahOk: business screen by SEC SIC, out 6000-6499, 6700-6799, 2082-2085, 2100-2199, 2011, 7011, 7990,
//                7993, 4832-4841, 7310-7319, 7812-7829; debt and cash each < 33% of market value on the latest balance sheet filed before
//                t0). Not the ZAD status (none exists point in time); today's candidates are reported with the owner's ZAD mark.
//   SQ14-LEADH4  hold 63: leader-follower with REAL industries: universe = the 500 largest by market value at t0; industry = SEC SIC 4-digit
//                (catch-alls 7389, 6770, 9995, 9999 left out); groups with 4+ members. LEADER = the largest by market value at t0. Signal
//                at the close of t when the leader closes above the highest close of its previous 252 sessions (240+ present) and did not
//                on any of the 63 sessions before (squad13 firstHighIn). FOLLOWERS = the group's ranks 2, 3, 4 by market value at t0
//                whose 10-session return (close t / close t-10 - 1) is under +2%. Buy the next open; hold 63.
//   SQ14-MTPB    base hold 126: MTUM-STYLE book (as SQ6-MTUM's semi-annual review, at the last session of May and November) on the 300
//                largest by market value: buy every book name at the next open, sell at the close of session 126 (BASE trades). ADD:
//                while a base trade is open, the book name's FIRST 12% pullback (as PB12) at a close t with t + 1 < the base exit buys a
//                second piece at the open of t + 1, sold at the SAME close as its base (one add per base trade). Judged per trade on
//                base + add trades together (adds alone and bases alone reported as information). PORTFOLIO: each base piece and each
//                add piece = 1/80 of the account (60 names = 75% invested, the rest kept for adds), bought with what cash there is.
import { smaArr } from './squad6-core.mjs';
import { pullbackFirst, holdTrade, mom121, leaderPick, monthEnds, leaderMonthOf, perYearOf, byYear, shape, boardStats, paperReady, timing } from './squad11-core.mjs';
export { smaArr, pullbackFirst, holdTrade, mom121, leaderPick, monthEnds, leaderMonthOf, perYearOf, byYear, shape, boardStats, paperReady, timing };
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', TOPN = 300, BIGN = 500, LEADER_FRAC = 0.20, YEAR = 252;
export const SIDE = 0.004, SIDE_STRESS = 0.006, SLOTS = 5, SLOT_W = 0.20, MTPB_W = 1 / 80, MTUM_MONTHS = [5, 11];
export const LEADH = { minMembers: 4, ranks: [2, 3, 4], moved: 0.02, look: 252, quiet: 63, minHave: 240, followLook: 10, catchAll: ['7389', '6770', '9995', '9999'] };
export const RULES = {
  'SQ14-PB12M': { name: 'Leader pullback 12% with the MTUM-style (risk-adjusted 6+12 month) leader list (hold 126)', hold: 126, block: 63, leaders: 'mtum', pct: 0.12,
    rule: 'Leader = MTUM-style: among the 300 largest US companies by point-in-time market value at the prior month end, the up-to-60 with the highest positive combined z of 6- and 12-month momentum (skipping the last month), each divided by the annualised volatility of weekly returns (up to 3 years), MSCI method (squad6-core mtumPick). Signal: the first close >= 12% under the highest close of the last 50 sessions while above the 200-session average. Buy the next open; sell at the close of session 126.' },
  'SQ14-PB15': { name: 'Leader pullback 15% (12-1 leaders, hold 126)', hold: 126, block: 63, leaders: 'm121', pct: 0.15,
    rule: 'Leader = the top 20% by 12-1 month return among the 300 largest by market value at the prior month end (as SQ11-PB12). Signal: the first close >= 15% under the highest close of the last 50 sessions while above the 200-session average. Buy the next open; sell at the close of session 126.' },
  'SQ14-PB12P5': { name: 'PB12 as a 5-slot account (max 5 open, 20% each, skip when full; hold 126)', hold: 126, block: 63, leaders: 'm121', pct: 0.12, portfolio: true,
    rule: 'The SQ11-PB12 signals (12-1 leaders of the 300 largest; first close 12% under the 50-day high, above the 200-day; hold 126) traded in ONE account: at most 5 open positions, each new one 20% of the account marked at the previous close (bought with the cash there is); a signal while 5 are open or on a stock already held is skipped; signals of the same evening taken by the 12-1 return (highest first). 0.4% cost per buy and per sale. Judged per trade on the trades taken AND as a portfolio vs SPY and SPUS per half (CAGR, max drawdown).' },
  'SQ14-PB12H': { name: 'PB12 on Shariah-screened leaders only (SIC screen + debt and cash < 33% of market value; hold 126)', hold: 126, block: 63, leaders: 'm121', pct: 0.12, shariah: true,
    rule: 'As SQ11-PB12 (12-1 leaders of the 300 largest; first close 12% under the 50-day high, above the 200-day; hold 126), only on leaders that pass the point-in-time Shariah proxy at the leader month end (squad5-core shariahOk: SEC SIC business screen; debt / market value and cash / market value each < 33% on the latest balance sheet filed before that date). Not the ZAD status; today\'s candidates carry the owner\'s ZAD mark.' },
  'SQ14-LEADH4': { name: 'Industry leader\'s first 52-week high -> its non-moving large peers, SIC 4-digit, market-value ranks (hold 63)', hold: 63, block: 63,
    rule: 'Universe: the 500 largest by market value at the prior month end. Industry = SEC SIC 4-digit (catch-alls 7389, 6770, 9995, 9999 left out); groups with 4+ members. Leader = the group\'s largest by market value. Signal at the close of t: the leader closes above the highest close of its previous 252 sessions (240+ present) and did not on any of the 63 sessions before. Followers = the group\'s ranks 2-4 by market value whose 10-session return is under +2%. Buy them the next open; sell at the close of session 63; one open trade per stock.' },
  'SQ14-MTPB': { name: 'MTUM-style book on the 300 largest (May/Nov) + one add on its first 12% pullback (hold to the base exit)', hold: 126, block: 63, portfolio: true,
    rule: 'At the last session of May and November: the MTUM-style book (up-to-60 with the highest positive risk-adjusted 6+12 month z among the 300 largest by market value). BASE: buy each at the next open, sell at the close of session 126. ADD: while a base is open, the name\'s first close 12% under its 50-day high above its 200-day at a close t with t+1 before the base exit buys a second piece at the open of t+1, sold at the base exit close (one add per base). Judged per trade on base + add trades together. PORTFOLIO: every base and add piece 1/80 of the account (bought with the cash there is), 0.4% per side, vs SPY and SPUS per half.' },
};
export const IDS = Object.keys(RULES), PB_IDS = ['SQ14-PB12M', 'SQ14-PB15', 'SQ14-PB12P5', 'SQ14-PB12H'];
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((u, w) => u + (w - m) ** 2, 0) / (a.length - 1)); };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
// ---------------- MTUM-style inputs ----------------
// annualised sd of weekly returns from week closes wc over weeks (lastW-155 .. lastW); 52+ returns needed
export function weeklyVol(wc, lastW, weeks = 156, minN = 52) { const rr = []; for (let w = Math.max(1, lastW - weeks + 1); w <= lastW; w++) if (wc[w] > 0 && wc[w - 1] > 0) rr.push(wc[w] / wc[w - 1] - 1); return rr.length >= minN ? sd(rr) * Math.sqrt(52) : null; }
// 6 and 12-month momentum skipping the last month
export function mom6_12(c, t) { const a = c[t - 21]; return { m6: t >= 126 && c[t - 126] > 0 && a > 0 ? a / c[t - 126] - 1 : null, m12: t >= 252 && c[t - 252] > 0 && a > 0 ? a / c[t - 252] - 1 : null }; }
// the last complete week at / before session t: W = [{ s, e }]
export function lastWeekAt(W, t) { const n = W.findIndex(w => w.e >= t); if (n < 0) return W.length - 1; return W[n].e === t ? n : n - 1; }
// ---------------- industry groups (LEADH4) ----------------
export const sic4 = (sic) => { const s = String(sic || '').replace(/\D/g, ''); if (!s || +s === 0) return null; const x = s.padStart(4, '0').slice(-4); return LEADH.catchAll.includes(x) ? null : x; };
// rows [{ key, sic, cap }] (one per company) -> Map sic4 -> keys sorted by cap desc (ties key asc); only groups with minMembers+
export function groupsBySic(rows, minMembers = LEADH.minMembers) { const m = new Map(); for (const r of rows) { const g = sic4(r.sic); if (!g || !(r.cap > 0)) continue; (m.get(g) || m.set(g, []).get(g)).push(r); }
  const out = new Map(); for (const [g, a] of m) if (a.length >= minMembers) out.set(g, a.sort((x, y) => y.cap - x.cap || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0)).map(r => r.key)); return out; }
// a new 52-week closing high at t (squad13 newHigh) and the first in `quiet` sessions (squad13 firstHighIn), re-stated here (pure)
export function newHigh(c, t, look = LEADH.look, minHave = LEADH.minHave) { if (t < look || !(c[t] > 0)) return false; let m = -Infinity, have = 0; for (let k = t - look; k < t; k++) if (c[k] > 0) { have++; if (c[k] > m) m = c[k]; } return have >= minHave && c[t] > m; }
export function firstHighIn(c, t, quiet = LEADH.quiet, look = LEADH.look) { if (!newHigh(c, t, look)) return false; for (let k = Math.max(look, t - quiet); k < t; k++) if (newHigh(c, k, look)) return false; return true; }
// the same as firstHighIn over a whole series (fast): Uint8Array, 1 where firstHighIn(c, t) is true
export function firstHighArr(c, quiet = LEADH.quiet, look = LEADH.look) { const n = c.length, nh = new Uint8Array(n), o = new Uint8Array(n); for (let t = look; t < n; t++) nh[t] = newHigh(c, t, look) ? 1 : 0;
  for (let t = look; t < n; t++) { if (!nh[t]) continue; let f = 1; for (let k = Math.max(look, t - quiet); k < t; k++) if (nh[k]) { f = 0; break; } o[t] = f; } return o; }
// followers: ranked keys (largest first); ret(key) = 10-session return; ranks 2-4 under +2%
export function followers(ranked, ret, { ranks = LEADH.ranks, moved = LEADH.moved } = {}) { const out = []; for (const r of ranks) { const k = ranked[r - 1]; if (k === undefined) continue; const g = ret(k); if (ok(g) && g < moved) out.push(k); } return out; }
// ---------------- MTPB add leg ----------------
// base trade { k, x } and the pullback test sig(t): the first t in k..x-2 with sig(t) true (buy at t+1 <= x-1), else null
export function addSignal(base, sig) { if (!base || !ok(base.k) || !ok(base.x)) return null; for (let t = base.k; t + 1 <= base.x - 1; t++) if (sig(t)) return t; return null; }
// ---------------- the trade-driven account ----------------
// cands = [{ id, key, i, k (entry session: buy at its open), x (exit session: sell at its close; null = still open at the data end), pri
// (higher first on the same open), w (weight of the account marked at the previous close) }]. maxOpen = slots (Infinity = none). A
// candidate is skipped when its key is held, when maxOpen positions are open, or when there is no cash. px = { o(i, k), c(i, k) } (c falls
// back to the latest close). Cost `side` on the money of every buy and sale. Equity marked at every close from `start`.
// Returns { eq: Float64Array(T) (NaN before start), taken: [id], skipped: { held, full, cash } }.
export function simAccount({ T, start, cands, maxOpen = Infinity, px, side = SIDE }) {
  const eq = new Float64Array(T).fill(NaN), H = new Map(), byK = new Map(), taken = [], skipped = { held: 0, full: 0, cash: 0 }; let cash = 1;
  for (const c of cands) if (c.k >= start && c.k < T) (byK.get(c.k) || byK.set(c.k, []).get(c.k)).push(c);
  for (const a of byK.values()) a.sort((p, q) => (q.pri || 0) - (p.pri || 0) || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
  const lastC = (i, k) => { for (let q = Math.min(k, T - 1); q >= 0; q--) { const z = px.c(i, q); if (z > 0) return z; } return null; };
  const value = (k) => { let v = cash; for (const h of H.values()) { const p = lastC(h.i, k); v += p > 0 ? h.sh * p : 0; } return v; };
  let prevEq = 1;
  for (let k = start; k < T; k++) {
    for (const c of byK.get(k) || []) { if (H.has(c.key)) { skipped.held++; continue; } if (H.size >= maxOpen) { skipped.full++; continue; }
      const p = px.o(c.i, k); if (!(p > 0)) { skipped.cash++; continue; } const v = Math.min(c.w * prevEq, cash / (1 + side)); if (!(v > 1e-9)) { skipped.cash++; continue; }
      cash -= v * (1 + side); H.set(c.key, { i: c.i, sh: v / p, x: c.x }); taken.push(c.id); }
    for (const [key, h] of [...H]) if (h.x !== null && h.x !== undefined && h.x === k) { const p = lastC(h.i, k); cash += (p > 0 ? h.sh * p : 0) * (1 - side); H.delete(key); }
    eq[k] = value(k); prevEq = eq[k]; }
  return { eq, taken, skipped };
}
// level path stats between sessions a and b over the points given (CAGR on 252 sessions a year, max drawdown)
export function pathStats(lv, a, b) { let v0 = null, k0 = null, v1 = null, k1 = null, pk = 0, dd = 0; for (let k = a; k <= b; k++) { const v = lv[k]; if (!(v > 0)) continue; if (v0 === null) { v0 = v; k0 = k; } v1 = v; k1 = k; if (v > pk) pk = v; dd = Math.min(dd, v / pk - 1); }
  if (v0 === null || k1 === k0) return null; const yrs = (k1 - k0) / YEAR; return { total: r4(v1 / v0 - 1), cagr: r4(Math.pow(v1 / v0, 1 / yrs) - 1), maxDD: r4(dd), years: r4(yrs) }; }
// per calendar year of the account vs SPY / SPUS (year-end to year-end levels)
export function yearTable(D, lv, spy, spus, start) { const out = {}; let prev = start; const ends = []; for (let k = start; k < D.length; k++) if (k === D.length - 1 || D[k + 1].slice(0, 4) !== D[k].slice(0, 4)) ends.push(k);
  for (const e of ends) { if (e <= prev) continue; const g = (s) => s[prev] > 0 && s[e] > 0 ? r4(s[e] / s[prev] - 1) : null; out[D[e].slice(0, 4)] = { from: D[prev], to: D[e], account: g(lv), spy: g(spy), spus: g(spus) }; prev = e; } return out; }
// the scan.mjs TRY SMALL test, re-stated (scan.mjs tryQualifies: verdict, both halves, perYear and portfolio gates) - information only
export function tryWouldQualify(r) { if (!r || !r.results) return { qualifies: false, why: ['no result'] }; const why = [];
  if (/REJECTED|TOO FEW/i.test(r.verdict || '')) why.push('verdict ' + r.verdict);
  for (const h of ['older', 'newer']) { const x = r.results[h]; if (!x) { why.push(h + ': no trades'); continue; }
    if (!(x.avgStress > 0)) why.push(h + ': not > 0 after stress cost'); if (!(x.edge > 0)) why.push(h + ': not better than the average stock'); if (!(x.noTop2 > 0)) why.push(h + ': not > 0 without its 2 best');
    if (typeof x.n === 'number' && x.n < 20) why.push(h + ': under 20 trades'); if (typeof x.blocks === 'number' && x.blocks < 3) why.push(h + ': under 3 blocks');
    const py = r.perYear && r.perYear[h]; if (py && ok(py.rule) && ok(py.spy) && !(py.rule > py.spy)) why.push(h + ': per year of capital not above SPY');
    const pf = r.portfolio && r.portfolio.standard && r.portfolio.standard.halves && r.portfolio.standard.halves[h]; if (pf && pf.beatsSpy === false) why.push(h + ': portfolio lagged SPY'); }
  return { qualifies: !why.length, why }; }
// ---------------- library pre-registration (idempotent; before any computation) ----------------
const COMMON = 'Common (squad14-core.mjs header): universe = the 300 (LEADH4: 500) largest US operating companies by point-in-time market value at each month-end close (Squad 5 / 11 market value, dead stocks included, US domicile, one ticker per company); leader sets of a month end used for the signals of the following month. Buy the next open, sell at the close of the hold session (a stock that stops trading: its last close); one open trade per stock per rule; no stops. Cost 0.8% (1.2% stress). Judged once (first complete run frozen in data/squad14-lab.json firstRun) with hold-core judgeHold on both halves (signal before / from 2024-01-01): > 0 after 0.8% and 1.2%, better than the average liquid stock at the same moments (both capped at +300%, AUD-1), better than the same stock held as long on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks per half, block t >= 2.5, return per year of capital tied up above SPY on the same days in both halves. PB12P5 and MTPB also as one account (0.4% per side) vs SPY and SPUS per half. VARIANTS OF A WINNER (SQ11-PB12 / SQ6-MTUM / SQ13-LEADH): 6 tried, one version each; the luck bar matters more than for an independent idea.';
const CHECK = 'Not a re-run of SQ11-PB12 / PB8 (12-1 leaders, 12% / 8%), SQ6-MTUM (traded-value universe, fixed date, no pullback add), SQ13-LEADH (3-digit SIC, traded-value ranks), SQ5-SHARIAH30 / SQ10-SH* (Shariah baskets, no pullback entry), T5 / M7 / DEC-PB / SQ4-QUALDIP (dips on other universes).';
export function preRegister(LB, today = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Variants of what worked: leader pullbacks, MTUM, leader-follower (Squad 14)', name: r.name, explain: 'RULE: ' + r.rule + ' ' + COMMON, status: 'pre-registered ' + today + ' (squad 14); 5-year one-shot pending', agent: 'squad14', registered: today, hold: r.hold,
      libraryCheck: CHECK, note: 'Pre-registered ' + today + ' BEFORE any run (squad14-core.mjs = the exact rule; one version; 6 variants in all). 5-year one-shot by squad14-lab.mjs, first complete verdict frozen; forward paper lane (data/squad14-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
