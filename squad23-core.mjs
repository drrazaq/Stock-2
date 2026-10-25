// SQUAD 23 CORE (25 Oct 2026; squad23-lab.mjs uses it). "A SECOND HALAL BASKET THAT ADDS DIVERSIFICATION TO BASKET 1".
// Pure functions, no network, no files. test/squad23-core.test.mjs. Long only; no leverage; never places an order. A BASKET study: it is
// NOT a TRY SMALL lab (scan.mjs does not read data/squad23-*; newSignals stay empty); the output is a yes / no on a second basket.
//
// THE OWNER'S QUESTION (25 Oct 2026): he holds Basket 1 = SQ10-SH20-C15 (the 20 largest Shariah-screened US companies, cap-weighted, no
// stock above 15%, re-formed quarterly). Is there a SECOND basket of DIFFERENT holdings that earns its place next to it?
//
// KNOWN BEFORE REGISTERING (25 Oct 2026; nothing of the five rules below was run):
//   Squad 10: SQ10-SH20-C15 beat SPUS as an account in both halves (16.2% a year vs 12.2%), fell deeper in 2022 (-33% vs -28%).
//   Squad 17: 50% SPUS + 50% Basket 1 (SQ17-MIX50) had the best return per unit of drawdown of the three core options; SQ17-SHMOM30 (halal
//     momentum 30 of the 100 largest, incl. the giants) was rejected. A-ROT2 (stocks vs gold vs cash TREND SWITCH) was rejected.
//   data/strategy-library.json, basket families already tested as STOCK PICKERS / accounts (not as a 30% diversifier of Basket 1):
//     low volatility / low beta (ANOM-LOWVOL, ANOM-LOWBETA, ANOM-LOWIVOL: rejected; V9 failed discovery); dividends (ANOM-DIVINIT, ANG-DIVG,
//     SQ16-SHYLD: rejected; SQ1-DIVHIKE not proven); value / quality (V1, V2, ANOM-GP, ANOM-QMJ, SQ5-QUAL20, SQ16-GPVAL, SQ16-MSCIQ:
//     rejected); equal weight (X6 tested, SQ5-EW100 not proven); sector rotation (R4 tested); momentum among large caps (SQ6-MTUM / SQ6-QMOM
//     survived; SQ10-SH30-MOM not proven per period but beat SPUS as an account; SQ17-SHMOM30 rejected); gold only as a trend switch (A-ROT2)
//     and as gold-miner trades (MACRO-GOLD-*, SQ20-*-GOLD). None of them was judged as a 30% sleeve NEXT TO Basket 1. Not repeated here.
//
// PRE-REGISTERED 25 Oct 2026, BEFORE ANY SQUAD 23 RESULT WAS SEEN (one version each; ids SQ23-*; the same text is written into
// data/strategy-library.json before the first computation). Each rule is run ONCE on the 5-year window; the first complete verdict is
// frozen in data/squad23-lab.json firstRun (first-run.mjs freezeEach). No tuning on results.
//
// COMMON: Squad 10's data and Shariah screen UNCHANGED (squad10-core balanceAt / shariahPass; squad10-lab data machinery copied with its
//   fixes: splits implied from SEC share counts, renamed giants FB->META / IIVI->COHR / ANTM->ELV spliced, wider debt tags, the historical
//   Form 3/4/5 ticker -> SEC company map (companies looked up by CIK, never by today's ticker list), US domicile). The Shariah list (a
//   point-in-time PROXY of the S&P / Dow Jones Islamic / AAOIFI method, NOT ZAD) is walked down the market-value ranking until 500
//   companies pass. Formation at the first session of Jan / Apr / Jul / Oct, trades at the NEXT open, weights drift until the next review,
//   cash at 0%. Funds (UMMA, GLD) are held as securities (their own daily opens / closes, price only, like the stocks and SPUS / SPY).
//   PORTFOLIO ENGINE = squad5-core simulate: 0.4% of the money on every buy and every sale (stress 0.6%), the REAL turnover of every
//   rebalance, daily marks, a dead stock = 0.
//   NO OVERLAP: every stock candidate is drawn from Shariah ranks 21+ at the same formation, so it never holds one of Basket 1's 20 names.
// THE RULES (5):
//   SQ23-NEXT30      Shariah ranks 21-50 by market value (30 names), cap-weighted, no stock above 10%, quarterly.
//   SQ23-MIDQ        Shariah ranks 101-500; gross profitability = TTM gross profit (GrossProfit, else revenue - cost of revenue, same period
//                    end) / latest total assets, both filed BEFORE the formation day and the period ending within 300 days; unknown or
//                    assets <= 0 = not eligible. The 30 with the highest gross profitability (ties: the larger company), EQUAL weight,
//                    quarterly.
//   SQ23-WORLD       the Wahed Dow Jones Islamic World ETF (UMMA; ~86% non-US Shariah stocks), bought at the first quarterly review on
//                    which it trades and held. CHOSEN BEFORE ANY RESULT because: SPWO (SP Funds Dow Jones Global ex-US Shariah) listed only
//                    on 20 Dec 2023, so it has NO older half (TOO FEW; shown for information from its listing); HLAL holds US large caps
//                    (the same giants as Basket 1, no diversification); UMMA listed 6 Jan 2022, giving an older half of ~21 months.
//   SQ23-GOLD        physical-gold exposure through the GLD price series (price proxy), bought at the first review and held; judged
//                    mainly as the fixed 30% sleeve. The halal status of any gold product is the owner's ZAD decision.
//   SQ23-NEXT30-MOM  among Shariah ranks 21-100: the 30 with the highest 12-1 return (close 21 sessions ago / close 252 sessions ago - 1;
//                    no 12-1 history = left out; ties: the larger company), cap-weighted, no stock above 10%, quarterly. Starts when 12-1
//                    returns exist in the price cache (Jan 2023), so its older half is 2023 only (said so in advance).
// JUDGED TWO WAYS (0.4% per side on the real turnover; stress 0.6%):
//   (1) ALONE as an account vs SPUS and SPY: CAGR in each half (start - last close of 2023 / 2024 - last close), max drawdown (worst fall),
//       calendar-year returns and the worst year. Information.
//   (2) THE KEY TEST: COMBO = 70% Basket 1 + 30% the candidate, ONE account, both sleeves reset to 70 / 30 at every quarterly review (the
//       candidate's own quarterly re-formation at the same review). BASE = Basket 1 alone. Both started on the SAME session (the candidate's
//       first trade session). Per half: R = CAGR / |max drawdown|. The combo is BETTER in a half when, if both CAGRs are > 0, its R is
//       higher; otherwise (either CAGR <= 0) when its CAGR is higher AND its max drawdown is no deeper. PASSES (2) = better in BOTH halves at
//       0.4% per side AND at 0.6% per side. Also reported: the correlation of the candidate's and Basket 1's monthly returns per half.
//   VERDICT: EARNS ITS PLACE = passes (2); else DOES NOT EARN ITS PLACE. If one earns its place, today's holdings are given in WHOLE-number
//   percentages summing to 100 (largest remainder; ZAD accepts whole numbers only) with each name's ZAD mark (unknown = check ZAD first).
import { capWeights, capAtMax, CAP15 } from './squad10-core.mjs';
import { ttmAt, instantAt } from './value-core.mjs';
export const SHARE = 0.30, B1_N = 20, CAP10 = 0.10, SHN_MAX = 500, GP_STALE = 300;
export const NEXT = [20, 50], MID = [100, 500], MID_N = 30, MOMR = [20, 100], MOM_N = 30;
export const FUND = { 'SQ23-WORLD': 'UMMA', 'SQ23-GOLD': 'GLD' }, INFO_FUNDS = ['SPWO', 'HLAL'];
const EPS = 1e-9, ok = (x) => typeof x === 'number' && isFinite(x), DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z');
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);

// ---- weights ----
export const b1Weights = (rows) => capAtMax(capWeights(rows.slice(0, B1_N)), CAP15);   // Basket 1 = SQ10-SH20-C15
export const c10 = (rows) => capAtMax(capWeights(rows), CAP10);
export const equalW = (rows) => new Map(rows.map(r => [r.key, rows.length ? 1 / rows.length : 0]));
export const next30Pick = (rows) => rows.slice(NEXT[0], NEXT[1]);
// rows: the Shariah list (largest first) with r.gpa (null = unknown)
export function midqPick(rows) { return rows.slice(MID[0], MID[1]).filter(r => ok(r.gpa)).sort((a, b) => b.gpa - a.gpa || b.cap - a.cap).slice(0, MID_N); }
export function momPick(rows) { return rows.slice(MOMR[0], MOMR[1]).filter(r => ok(r.mom)).sort((a, b) => b.mom - a.mom || b.cap - a.cap).slice(0, MOM_N); }
// the candidate's own weights at a review (stock rules); null when the list is too short for the rule
export function candWeights(id, rows) {
  if (id === 'SQ23-NEXT30') { if (rows.length < NEXT[1]) return null; return c10(next30Pick(rows)); }
  if (id === 'SQ23-MIDQ') { if (rows.length < MID[1]) return null; const p = midqPick(rows); return p.length < MID_N ? null : equalW(p); }
  if (id === 'SQ23-NEXT30-MOM') { if (rows.length < MOMR[1]) return null; const p = momPick(rows); return p.length < MOM_N ? null : c10(p); }
  throw new Error('not a stock rule ' + id); }
// the combo: Basket 1 weights x (1 - share) + candidate weights x share (keys never overlap for the stock rules; summed if they did)
export function comboWeights(wB1, wC, share = SHARE) { const out = new Map(); for (const [k, v] of wB1) out.set(k, v * (1 - share));
  for (const [k, v] of wC) out.set(k, (out.get(k) || 0) + v * share); return out; }
export const overlap = (wA, wB) => [...wA.keys()].filter(k => wB.has(k));

// ---- gross profitability (point in time) ----
// tagged: { tag: [{ s, e, v, f }] } -> the TTM value of the tag with the LATEST period end known before asOf (a company that switched
// tags is not read from a stale tag): { end, val } or null
export function ttmLatest(tagged, asOf) { let best = null; for (const f of Object.values(tagged || {})) { const r = ttmAt(f, asOf); if (r && (!best || r.end > best.end)) best = r; } return best; }
export function instLatest(tagged, asOf) { let best = null; for (const f of Object.values(tagged || {})) { const r = instantAt(f, asOf); if (r && (!best || r.end > best.end)) best = r; } return best; }
// co = { gp: {tag: facts}, rev: {...}, cogs: {...}, assets: {...} } -> GP / assets or null
export function gpaAt(co, asOf, stale = GP_STALE) { if (!co) return null; const fresh = (r) => r && (ms(asOf) - ms(r.end)) / DAY <= stale;
  const A = instLatest(co.assets, asOf); if (!fresh(A) || !(A.val > 0)) return null;
  let gp = ttmLatest(co.gp, asOf);
  if (!fresh(gp)) { const rv = ttmLatest(co.rev, asOf), cg = ttmLatest(co.cogs, asOf); gp = fresh(rv) && fresh(cg) && rv.end === cg.end ? { end: rv.end, val: rv.val - cg.val } : null; }
  return gp && ok(gp.val) ? gp.val / A.val : null; }

// ---- statistics ----
export const retForDD = (s) => s && ok(s.cagr) && ok(s.maxDD) && s.maxDD < 0 ? r4(s.cagr / -s.maxDD) : null;
// test (2) in one half: combo / base = pathStats { cagr, maxDD }
export function comboBetter(combo, base) { if (!combo || !base || !ok(combo.cagr) || !ok(base.cagr) || !ok(combo.maxDD) || !ok(base.maxDD)) return null;
  if (combo.cagr > 0 && base.cagr > 0) { const R = (s) => s.maxDD < 0 ? s.cagr / -s.maxDD : Infinity; return R(combo) > R(base); }
  return combo.cagr > base.cagr && combo.maxDD >= base.maxDD - EPS; }
// Pearson correlation of two return lists matched by key ([{ m, r }]); null under 6 common months
export function corr(a, b) { const mb = new Map((b || []).map(x => [x.m, x.r])), xs = [], ys = [];
  for (const x of a || []) if (mb.has(x.m) && ok(x.r) && ok(mb.get(x.m))) { xs.push(x.r); ys.push(mb.get(x.m)); }
  if (xs.length < 6) return null; const n = xs.length, mx = xs.reduce((p, q) => p + q, 0) / n, my = ys.reduce((p, q) => p + q, 0) / n; let sxy = 0, sxx = 0, syy = 0;
  for (let j = 0; j < n; j++) { sxy += (xs[j] - mx) * (ys[j] - my); sxx += (xs[j] - mx) ** 2; syy += (ys[j] - my) ** 2; } return sxx > 0 && syy > 0 ? r4(sxy / Math.sqrt(sxx * syy)) : null; }
// calendar-year returns of a level series lv from session s0: [{ y, r, from, to }] (the first year runs from s0)
export function yearReturns(lv, D, s0) { const out = []; let a = s0;
  for (let k = s0 + 1; k < D.length; k++) { const endYear = k === D.length - 1 || D[k + 1].slice(0, 4) !== D[k].slice(0, 4); if (!endYear) continue;
    if (lv[a] > 0 && lv[k] > 0) out.push({ y: D[k].slice(0, 4), r: r4(lv[k] / lv[a] - 1), from: D[a], to: D[k] }); a = k; }
  return out; }
export const worstYear = (yr) => yr.length ? yr.reduce((w, x) => x.r < w.r ? x : w) : null;
// WHOLE-NUMBER percentages summing to 100 (largest remainder; ties: the larger weight, then the key). items [{ key, w }] -> [{ key, pct }]
export function wholePct(items) { const tot = items.reduce((a, x) => a + (x.w > 0 ? x.w : 0), 0); if (!(tot > 0)) return [];
  const raw = items.filter(x => x.w > 0).map(x => ({ key: x.key, w: x.w, e: 100 * x.w / tot })), out = raw.map(x => ({ ...x, pct: Math.floor(x.e + EPS) }));
  let left = 100 - out.reduce((a, x) => a + x.pct, 0); const order = [...out].sort((a, b) => (b.e - b.pct) - (a.e - a.pct) || b.w - a.w || (a.key < b.key ? -1 : 1));
  for (const x of order) { if (left <= 0) break; x.pct++; left--; }
  return out.map(x => ({ key: x.key, pct: x.pct })).sort((a, b) => b.pct - a.pct || (a.key < b.key ? -1 : 1)); }

// ---- the rules ----
const COMMON = 'Squad 10 data and Shariah screen unchanged (point-in-time proxy of the S&P / Dow Jones Islamic / AAOIFI method, NOT ZAD; companies by SEC CIK, implied splits, FB->META etc., wider debt tags), walked until 500 companies pass. Quarterly formation (first session of Jan / Apr / Jul / Oct), trades next open, weights drift, cash 0%; funds held as securities, price only. No overlap with Basket 1 (SQ10-SH20-C15 = Shariah ranks 1-20) at any formation. JUDGED (1) ALONE as an account vs SPUS and SPY: CAGR both halves (start - end 2023 / 2024 - last close) after 0.4% per side on real turnover (stress 0.6%), max drawdown, worst year; (2) KEY TEST: 70% Basket 1 + 30% candidate, one account reset to 70/30 every quarter, vs Basket 1 alone from the same session: CAGR / |max drawdown| higher in BOTH halves at 0.4% and 0.6% per side (if a CAGR <= 0: higher CAGR and no deeper drawdown); correlation of monthly returns with Basket 1 reported. EARNS ITS PLACE = passes (2). Run once, first complete verdict frozen. Basket study: not used for TRY SMALL.';
export const RULES = {
  'SQ23-NEXT30': { kind: 'stock', name: 'Halal next 30 (Shariah ranks 21-50), cap-weighted, max 10%, quarterly', short: 'the Shariah-screened US companies ranked 21-50 by market value, cap-weighted with no stock above 10%, re-formed every quarter' },
  'SQ23-MIDQ': { kind: 'stock', name: 'Halal mid-cap quality: the 30 most gross-profitable of Shariah ranks 101-500, equal weight, quarterly', short: 'among the Shariah-screened companies ranked 101-500 by market value, the 30 with the highest point-in-time gross profit / total assets, equal weight, quarterly' },
  'SQ23-WORLD': { kind: 'fund', fund: 'UMMA', name: 'Halal world ex-US fund (UMMA, Wahed Dow Jones Islamic World) held', short: 'the Wahed Dow Jones Islamic World ETF (UMMA) bought once and held (SPWO listed only Dec 2023: too short for the older half, shown for information; HLAL = US giants, no diversification)' },
  'SQ23-GOLD': { kind: 'fund', fund: 'GLD', name: 'Gold sleeve (GLD price as the physical-gold proxy) held', short: 'physical-gold exposure through the GLD price series, bought once and held; mainly judged as the fixed 30% sleeve; halal status of any gold product = the owner\'s ZAD decision' },
  'SQ23-NEXT30-MOM': { kind: 'stock', mom: true, name: 'Halal momentum 30 of Shariah ranks 21-100 (best 12-1), cap-weighted, max 10%, quarterly', short: 'among the Shariah-screened companies ranked 21-100, the 30 with the best 12-1 month return, cap-weighted with no stock above 10%, quarterly (starts Jan 2023)' },
};
export const IDS = Object.keys(RULES);
export const reviewMonth = (d) => ['01', '04', '07', '10'].includes(String(d).slice(5, 7));
export function preRegister(LB, today = '2026-10-25') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Second halal basket / diversifier of Basket 1 (Squad 23)', name: r.name, explain: r.short + '. ' + COMMON, status: 'pre-registered ' + today + ' (squad 23); 5-year one-shot pending', agent: 'squad23', registered: today,
      libraryCheck: 'Already tested as stand-alone pickers / accounts (not as a 30% diversifier of Basket 1): low volatility / low beta (ANOM-LOWVOL, ANOM-LOWBETA, ANOM-LOWIVOL rejected), dividends (ANOM-DIVINIT, ANG-DIVG, SQ16-SHYLD rejected), value / quality incl. gross profitability (V2, ANOM-GP, ANOM-QMJ, SQ5-QUAL20, SQ16-GPVAL, SQ16-MSCIQ rejected), equal weight (X6, SQ5-EW100 not proven), sector rotation (R4), large-cap momentum (SQ6-MTUM survived; SQ10-SH30-MOM, SQ17-SHMOM30 incl. the giants), gold only as a trend switch (A-ROT2 rejected) and as miner trades (MACRO-GOLD-*). New here: Shariah names OUTSIDE Basket 1 only (ranks 21+), a halal world ex-US fund and a gold sleeve, each judged as 30% added to Basket 1 vs Basket 1 alone (return per unit of max drawdown in both halves) with the correlation.',
      note: 'Pre-registered ' + today + ' BEFORE any squad 23 run (squad23-core.mjs = the exact rule). 5-year one-shot by squad23-lab.mjs, first complete verdict frozen in data/squad23-lab.json; basket study, not a TRY SMALL lab.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
