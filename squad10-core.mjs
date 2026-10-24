// SQUAD 10 CORE (24 Oct 2026; squad10-lab.mjs uses it). "A HALAL CORE BASKET THAT BEATS SPUS - ONE THE OWNER CAN HOLD WHOLE."
// Pure functions, no network, no files. test/squad10-core.test.mjs.
// Builds on Squad 5 (data/squad5-lab.json, 24 Oct 2026): SQ5-TOP20 (equal weight) beat SPY as a portfolio in both halves, and the
// cap-weighted twin of SQ5-SHARIAH30 (information only, not judged) beat SPUS in both halves. Squad 10 asks the owner's question directly:
// is there a Shariah-screened basket of 10-30 giants, small enough to own WHOLE, that beat SPUS after costs in both halves?
//
// PRE-REGISTERED 24 Oct 2026, BEFORE ANY SQUAD 10 RESULT WAS SEEN (one version each; ids SQ10-*; the same text is written into
// data/strategy-library.json before the first computation). Each rule is run ONCE on the 5-year window; the first complete verdict is
// frozen in data/squad10-lab.json firstRun (first-run.mjs freezeEach). No tuning on results. (Known before registering: Squad 5's results
// above. Nothing of these exact rules was run.)
//
// COMMON (all rules): Squad 5's universe and data, unchanged (squad5-core.mjs COMMON): liquid US operating companies (close >= 5 USD,
//   20-session traded value >= 5M USD, dead and delisted included, one ticker per SEC company, US domicile), market value = as-traded close x
//   SEC share count known 30+ days before (split-repaired; data guards as Squad 5). Formation at the first session of a quarter month (Jan /
//   Apr / Jul / Oct; the yearly rule: January only); trades at the NEXT open; cash at 0%. Portfolio engine = squad5-core simulate (0.4% of
//   the money on every buy and sale, stress 0.6%; turnover of every rebalance counted; daily marks; a dead stock = 0, a bought-out one = its
//   last close). Prices are price-only (no dividends) for the stocks, SPY and SPUS alike.
// SHARIAH SCREEN (point in time, a proxy of the S&P / Dow Jones Islamic / AAOIFI method; it is NOT the ZAD status, which the repository
//   has only as today's marks):
//   1. business: squad5-core haramSic (SIC out: banks, credit, brokers, insurance, investment offices, REITs 6000-6499 / 6700-6799; alcohol
//      2082-2085; tobacco 2100-2199; meat packing 2011; hotels-casinos 7011; gambling 7990 / 7993; broadcasting-cable 4832-4841;
//      advertising 7310-7319; motion pictures 7812-7829). No industry code = out.
//   2. financial ratios on the latest balance sheet filed BEFORE the formation day (the latest equity date known; 200+ days old = unknown),
//      each divided by the AVERAGE MARKET VALUE over the last 36 month starts (as S&P; as many as the data has, at least the current one):
//        debt (see SH_TAGS below: the larger of total debt and non-current + current debt; a company that never reported a debt item has
//          none)                                                                                           < 33%
//        cash + short-term investments (cash & equivalents; + ShortTermInvestments / MarketableSecuritiesCurrent /
//          AvailableForSaleSecuritiesDebtSecuritiesCurrent, missing = 0)                                       < 33%
//        receivables (AccountsReceivableNetCurrent / ReceivablesNetCurrent, missing = 0)                       < 33%  (Dow Jones style)
//      debt unknown or cash unknown = out.
//   3. impure income: TTM interest income (InvestmentIncomeInterest / InvestmentIncomeInterestAndDividend) / TTM revenue < 5% where both are
//      known (not reported = pass).
// RANK: the largest by CURRENT market value among the companies that pass, walking down the size list.
// WEIGHTS: CW = market value / sum (cap weight). C15 = cap weight with no stock above 15% (the excess re-spread pro rata over the others,
//   repeated until none is above). Weights are set at each review and then drift with prices until the next review (like the index).
// THE RULES (8):
//   SQ10-SH10        Shariah top 10, cap-weighted, quarterly.
//   SQ10-SH10-C15    Shariah top 10, capped 15%, quarterly.
//   SQ10-SH20        Shariah top 20, cap-weighted, quarterly.
//   SQ10-SH20-C15    Shariah top 20, capped 15%, quarterly.
//   SQ10-SH20-C15-Y  Shariah top 20, capped 15%, re-formed YEARLY (January only).
//   SQ10-SH30-C15    Shariah top 30, capped 15%, quarterly.
//   SQ10-SH30-MOM    Shariah top 30 tilted to 12-1 momentum (the MSCI momentum-index tilt, as in MTUM): z = (12-1 return - mean) / sd
//                    among the 30 (z clipped to +-3; a member without 12-1 history: z = 0); score = 1 + z if z > 0, else 1 / (1 - z);
//                    weight ~ market value x score, then capped 15%; quarterly. Starts when 12-1 momentum exists (252 sessions).
//   SQ10-SH50-XMOM   Shariah top 50 minus the bottom third by 12-1 return (floor(k / 3) of the k members that have one; members without
//                    one stay), cap-weighted, capped 15%; quarterly. Starts when 12-1 momentum exists.
// JUDGED AS PORTFOLIOS (primary): CAGR per half (older = start to the last close of 2023, newer = 2024 to the last close) after 0.4% per
//   side, vs SPUS (PRIMARY: the halal fund the owner can buy instead) and SPY; also at 0.6% per side (stress); max drawdown vs SPUS.
//   "Beats SPUS after costs in BOTH halves" and "beats SPY in both halves" are reported plainly for every rule.
// PER-TRADE STANDARD (so the scan's TRY SMALL gates work; identical to Squad 5): each holding period (a stock from one review to the next;
//   a sale, delisting or the last close ends it early) = one trade, the full 0.8% cost on each (1.2% stress), halves by period start,
//   value-core + hold-core judgeHold (> 0 after both costs, beats the average liquid stock on the same days, beats the same stock held as
//   long on its other days, > 0 without the 2 best, 20+ trades, 3+ blocks, block t, return per year of capital above SPY in both halves),
//   every gross return capped at +300% on both sides (AUD-1).
// SENSITIVITY (information only, never judged, computed after the frozen run): each rule re-run without NVDA, without AAPL, without MSFT,
//   without all three (removed from the eligible list, the next one fills in), with a 10% / 20% / no weight cap, and its average weight in
//   those three; what drives the result.
// TODAY: the members the rule holds now with their current (drifted) weights, the owner's ZAD mark (data/halal.json + data/zad-list.json),
//   the HalalScreener second opinion (data/halal-ext.json) and the next 5 reserves (a member the owner's ZAD marks as not halal is replaced
//   by the first halal reserve; that live substitution cannot be tested, as there is no point-in-time ZAD history).
import { instantAt, ttmAt } from './value-core.mjs';
import { haramSic } from './squad5-core.mjs';
export const SH_MAX = 0.33, SH_INT = 0.05, AVG_MONTHS = 36, CAP15 = 0.15, STALE = 200;
const EPS = 1e-9, ok = (x) => typeof x === 'number' && isFinite(x), DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z');
const addDays = (d, n) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10), near = (a, b, tol) => Math.abs(ms(a) - ms(b)) / DAY <= tol;
const firstOf = (tagged, f) => { for (const facts of Object.values(tagged || {})) { const r = f(facts); if (r !== null && r !== undefined) return r; } return null; };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);

// SEC tags this squad reads (compact rows { s, e, v, f }). DATA GUARD set after DIAG 1-2 of 24 Oct 2026 (coverage only, BEFORE any rule
// result): 17 large companies (ORCL, AVGO, QCOM, KO, XOM, CAT, UNP, ABBV, NOW, ...) report debt under other tags (DebtLongtermAndShortterm-
// CombinedAmount, LongTermDebtAndCapitalLeaseObligations*, LongTermNotesPayable, NotesPayableCurrent, CommercialPaperAtCarryingValue) and
// one (ORCL) filed a bogus LongTermDebt = 0, so: debt = the LARGER of (a) the largest total-debt item and (b) non-current + current debt
// (DebtCurrent if reported, else current long-term debt + short-term borrowings / commercial paper), each the largest of its tags; and
// when nothing is reported at the balance-sheet date itself, the latest item of the 120 days before it.
export const SH_TAGS = { eq: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  tot: ['LongTermDebt', 'DebtLongtermAndShorttermCombinedAmount', 'LongTermDebtAndCapitalLeaseObligationsIncludingCurrentMaturities', 'DebtAndCapitalLeaseObligations', 'NotesPayable'],
  nc: ['LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations', 'LongTermNotesPayable'],
  cur: ['LongTermDebtCurrent', 'LongTermDebtAndCapitalLeaseObligationsCurrent', 'NotesPayableCurrent'], debtC: ['DebtCurrent'],
  short: ['ShortTermBorrowings', 'CommercialPaper', 'CommercialPaperAtCarryingValue', 'ShortTermBankLoansAndNotesPayable', 'OtherShortTermBorrowings'],
  cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'],
  sti: ['ShortTermInvestments', 'MarketableSecuritiesCurrent', 'AvailableForSaleSecuritiesDebtSecuritiesCurrent'],
  recv: ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent'],
  intInc: ['InvestmentIncomeInterest', 'InvestmentIncomeInterestAndDividend'],
  rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'] };
const DEBT_G = ['tot', 'nc', 'cur', 'debtC', 'short'];

// the balance sheet at the latest equity date filed before asOf: { end, debt, cashInv, recv, intInc, rev } (null = unknown)
export function balanceAt(co, asOf, stale = STALE) {
  const none = { end: null, debt: null, cashInv: null, recv: null, intInc: null, rev: null };
  const eq = firstOf(co && co.eq, (f) => instantAt(f, asOf)); if (!eq || (ms(asOf) - ms(eq.end)) / DAY > stale) return none;
  // per group: the largest of its tags at the balance-sheet date (+-5 days), or (back) the latest within the 120 days before it
  const val1 = (facts, lo) => { if (!facts) return null; const r = instantAt(facts.filter(x => x.e <= addDays(eq.end, 5) && x.e >= lo), asOf); return r ? r.val : null; };
  const grp = (g, lo) => { let m = null; for (const f of Object.values(co[g] || {})) { const v = val1(f, lo); if (v !== null && (m === null || v > m)) m = v; } return m; };
  const debtAt = (lo) => { const v = {}; for (const g of DEBT_G) v[g] = grp(g, lo); if (DEBT_G.every(g => v[g] === null)) return null;
    const parts = (v.nc || 0) + (v.debtC !== null ? v.debtC : (v.cur || 0) + (v.short || 0)); return Math.max(v.tot !== null ? v.tot : 0, parts); };
  const ever = DEBT_G.some(g => Object.values(co[g] || {}).some(f => (f || []).some(x => x.f < asOf)));
  let debt = debtAt(addDays(eq.end, -5)); if (debt === null) debt = debtAt(addDays(eq.end, -120)); if (debt === null) debt = ever ? null : 0;
  let cash = grp('cash', addDays(eq.end, -5)); if (cash === null) cash = grp('cash', addDays(eq.end, -120));
  const sti = grp('sti', addDays(eq.end, -5)), recv = grp('recv', addDays(eq.end, -5));
  const ttm = (g) => firstOf(co[g], (f) => { const r = ttmAt(f, asOf); return r ? r.val : null; });
  return { end: eq.end, debt, cashInv: cash === null ? null : cash + (sti || 0), recv: recv === null ? 0 : recv, intInc: ttm('intInc'), rev: ttm('rev') };
}
// the screen. mvAvg = the average market value (36 month starts); returns { ok, why }
export function shariahPass({ sic, mvAvg, debt, cashInv, recv, intInc, rev }) {
  if (!sic) return { ok: false, why: 'no industry code' }; if (haramSic(sic)) return { ok: false, why: 'business' };
  if (!(mvAvg > 0)) return { ok: false, why: 'no market value' }; if (!ok(debt)) return { ok: false, why: 'debt unknown' }; if (!ok(cashInv)) return { ok: false, why: 'cash unknown' };
  if (!(debt / mvAvg < SH_MAX - EPS)) return { ok: false, why: 'debt 33%+' }; if (!(cashInv / mvAvg < SH_MAX - EPS)) return { ok: false, why: 'cash 33%+' };
  if (ok(recv) && !(recv / mvAvg < SH_MAX - EPS)) return { ok: false, why: 'receivables 33%+' };
  if (ok(intInc) && ok(rev) && rev > 0 && !(intInc / rev < SH_INT - EPS)) return { ok: false, why: 'interest income 5%+' };
  return { ok: true, why: null };
}
// average of the values (the last `n` given, newest last), ignoring missing; null if none
export function avgLast(vals, n = AVG_MONTHS) { const a = vals.slice(-n).filter(x => ok(x) && x > 0); return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }

// IMPLIED SPLITS: alt = [[filed, periodEnd, shares]] (financial-statement counts by filing date), listed = [[date, r]]. Two consecutive
// filings (<= 200 days apart) whose counts differ by a near-whole factor k (2, 3, 4, 5, 8, 10, 15, 20, 25, 30, 40, 50 or 1 / k, within 2%)
// with no listed split of about that size between them (30 days of slack) -> a split [later filing date, k]. Placing it at the later filing
// date gives the right market value on every day (the earlier count x k before it, the restated count after it).
const KS = [2, 3, 4, 5, 8, 10, 15, 20, 25, 30, 40, 50];
export function impliedSplits(alt, listed = []) { const out = [], a = (alt || []).filter(x => x && x[2] > 0).sort((x, y) => x[0] < y[0] ? -1 : 1);
  for (let j = 1; j < a.length; j++) { const [f1, , n1] = a[j - 1], [f2, , n2] = a[j]; if ((ms(f2) - ms(f1)) / DAY > 200) continue; const F = n2 / n1;
    let k = null; for (const q of KS) { if (Math.abs(F / q - 1) < 0.02) k = q; else if (Math.abs(F * q - 1) < 0.02) k = 1 / q; } if (k === null) continue;
    if ((listed || []).some(([d, r]) => d > addDays(f1, -30) && d <= addDays(f2, 30) && Math.abs(r / k - 1) < 0.05)) continue; out.push([f2, k]); }
  return out; }

// ---- weights ----
export function capWeights(rows) { const s = rows.reduce((a, r) => a + r.cap, 0); return new Map(rows.map(r => [r.key, s > 0 ? r.cap / s : 0])); }
// weights (Map key -> w, sum 1) with no weight above maxW: the excess is re-spread pro rata over the uncapped ones, repeated
export function capAtMax(w, maxW) {
  const out = new Map(w); if (!(maxW > 0) || maxW >= 1) return out; const fixed = new Set();
  for (let it = 0; it < 100; it++) { let excess = 0; for (const [k, v] of out) if (!fixed.has(k) && v > maxW + EPS) { excess += v - maxW; out.set(k, maxW); fixed.add(k); }
    if (excess <= EPS) break; const free = [...out].filter(([k]) => !fixed.has(k)), fs = free.reduce((a, [, v]) => a + v, 0); if (!(fs > 0)) break;
    for (const [k, v] of free) out.set(k, v + excess * v / fs); }
  return out;
}
// MSCI momentum tilt: rows [{ key, cap, mom (null = none) }] -> weights ~ cap x score (score = 1 + z, or 1 / (1 - z); z clipped to +-3)
export function momTilt(rows) {
  const m = rows.map(r => r.mom).filter(ok); const mu = m.length ? m.reduce((a, b) => a + b, 0) / m.length : 0, sd = m.length > 1 ? Math.sqrt(m.reduce((a, b) => a + (b - mu) ** 2, 0) / (m.length - 1)) : 0;
  const sc = rows.map(r => { let z = ok(r.mom) && sd > 0 ? (r.mom - mu) / sd : 0; z = Math.max(-3, Math.min(3, z)); return { key: r.key, cap: r.cap * (z > 0 ? 1 + z : 1 / (1 - z)) }; });
  return capWeights(sc);
}
// drop the bottom third by 12-1 return: floor(k / 3) of the k rows that have one (ties: the larger company stays); rows without one stay
export function dropBottomThird(rows) {
  const have = rows.filter(r => ok(r.mom)).sort((a, b) => a.mom - b.mom || a.cap - b.cap), cut = new Set(have.slice(0, Math.floor(have.length / 3)).map(r => r.key));
  return rows.filter(r => !cut.has(r.key));
}

// ---- the rules ----
const COMMON = 'Universe and market value exactly as Squad 5 (squad5-core.mjs COMMON: liquid US operating companies, dead and delisted included, one ticker per SEC company, US domicile, as-traded market value from SEC share counts known 30+ days before). SHARIAH SCREEN point in time (a proxy of the S&P / Dow Jones Islamic / AAOIFI method, NOT the ZAD status): business screen by SEC SIC (out 6000-6499, 6700-6799, 2082-2085, 2100-2199, 2011, 7011, 7990, 7993, 4832-4841, 7310-7319, 7812-7829; no code = out); on the latest balance sheet filed before the formation day, divided by the average market value of the last 36 month starts (as many as exist): debt < 33%, cash + short-term investments < 33%, receivables < 33%; TTM interest income / revenue < 5% where reported. Ranked by current market value among those that pass. Formation at the first session of Jan / Apr / Jul / Oct (yearly rule: January), trades at the next open, weights then drift until the next review; cash at 0%. JUDGED AS A PORTFOLIO vs SPUS (primary) and SPY: CAGR in both halves (start - end 2023 / 2024 - last close) after 0.4% per side on all turnover (stress 0.6%), max drawdown; plus the per-trade standard of Squad 5 (each holding period one trade, 0.8% / 1.2% cost, halves, average-stock and same-stock yardsticks, no-top-2, 20+ trades, 3+ blocks, block t, return per year above SPY; +300% cap both sides). Run once, first complete verdict frozen. Sensitivity (ex-NVDA / AAPL / MSFT, weight caps 10 / 20 / none) = information only.';
export const RULES = {
  'SQ10-SH10': { n: 10, w: 'cw', every: 'q', name: 'Halal top 10, cap-weighted, quarterly', short: 'the 10 largest US companies passing the Shariah screen, cap-weighted, re-formed every quarter' },
  'SQ10-SH10-C15': { n: 10, w: 'c15', every: 'q', name: 'Halal top 10, capped 15%, quarterly', short: 'the 10 largest passing the Shariah screen, cap-weighted with no stock above 15%, quarterly' },
  'SQ10-SH20': { n: 20, w: 'cw', every: 'q', name: 'Halal top 20, cap-weighted, quarterly', short: 'the 20 largest passing the Shariah screen, cap-weighted, quarterly' },
  'SQ10-SH20-C15': { n: 20, w: 'c15', every: 'q', name: 'Halal top 20, capped 15%, quarterly', short: 'the 20 largest passing the Shariah screen, cap-weighted with no stock above 15%, quarterly' },
  'SQ10-SH20-C15-Y': { n: 20, w: 'c15', every: 'y', name: 'Halal top 20, capped 15%, yearly', short: 'the 20 largest passing the Shariah screen, capped 15%, re-formed once a year (January)' },
  'SQ10-SH30-C15': { n: 30, w: 'c15', every: 'q', name: 'Halal top 30, capped 15%, quarterly', short: 'the 30 largest passing the Shariah screen, capped 15%, quarterly' },
  'SQ10-SH30-MOM': { n: 30, w: 'mom', every: 'q', mom: true, name: 'Halal top 30 tilted to 12-1 momentum (MSCI/MTUM tilt), capped 15%', short: 'the 30 largest passing the Shariah screen, weight = market value x MSCI momentum score (1+z or 1/(1-z) of the 12-1 return), capped 15%, quarterly' },
  'SQ10-SH50-XMOM': { n: 50, w: 'xmom', every: 'q', mom: true, name: 'Halal top 50 minus the weakest third by 12-1 momentum, capped 15%', short: 'the 50 largest passing the Shariah screen, minus the bottom third by 12-1 return, cap-weighted capped 15%, quarterly' },
};
export const IDS = Object.keys(RULES);
// rows [{ key, cap, mom }] (the Shariah top n, largest first) -> Map key -> weight, by the rule's weighting. maxW undefined = the rule's
// own cap (CW rules: none; the others 15%); a number or null (= no cap) overrides it (sensitivity only)
export function weightsFor(id, rows, maxW) { const R = RULES[id], m = maxW === undefined ? (R.w === 'cw' ? null : CAP15) : maxW, cap = (w) => m ? capAtMax(w, m) : w;
  if (R.w === 'cw' || R.w === 'c15') return cap(capWeights(rows));
  if (R.w === 'mom') return cap(momTilt(rows));
  if (R.w === 'xmom') return cap(capWeights(dropBottomThird(rows)));
  throw new Error('unknown weighting ' + R.w); }
export const reviewMonth = (id, d) => { const m = String(d).slice(5, 7); return RULES[id].every === 'y' ? m === '01' : ['01', '04', '07', '10'].includes(m); };
export const periodHold = (id) => RULES[id].every === 'y' ? 252 : 63;
export function preRegister(LB, today = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Halal core baskets (Squad 10)', name: r.name, explain: r.short + '. ' + COMMON, status: 'pre-registered ' + today + ' (squad 10); 5-year one-shot pending', agent: 'squad10', registered: today,
      libraryCheck: 'Builds on SQ5-SHARIAH30 (equal weight, judged; cap-weighted twin info only) and SQ5-TOP20; overlaps P1 / HOLD-DIPFUND (owning SPUS itself = the yardstick), SQ6-MTUM (momentum weighting, whole market, not Shariah). New here: Shariah screen with receivables, short-term investments, interest income and the 36-month average market value; cap / capped weights; 10 / 20 / 30 / 50 sizes; quarterly vs yearly; judged against SPUS first.',
      note: 'Pre-registered ' + today + ' BEFORE any squad 10 run (squad10-core.mjs = the exact rule). 5-year one-shot by squad10-lab.mjs, first complete verdict frozen in data/squad10-lab.json; forward paper lane (data/squad10-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
