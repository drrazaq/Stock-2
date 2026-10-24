// SQUAD 17 CORE (24 Oct 2026; squad17-lab.mjs uses it). "WHICH HALAL CORE HOLDING: SPUS, THE HALAL TOP 20, OR A MIX?"
// Pure functions, no network, no files. test/squad17-core.test.mjs. Long only; no leverage; never places an order. A CORE-HOLDING study:
// basket labs are NOT used for TRY SMALL (scan.mjs does not read this lab); the output is a recommendation of one core holding.
//
// BUILDS ON (known before registering, 24 Oct 2026):
//   Squad 10 (data/squad10-lab.json firstRun): SQ10-SH20-C15 (the 20 largest Shariah-screened US companies, cap-weighted, no stock above
//     15%, quarterly) beat SPUS as an account in both halves (whole window 16.2% a year vs 12.2%) but fell deeper in 2022 (-33% vs -28%);
//     per holding period NOT PROVEN (block t 1.36 / 1.8). SQ10-SH20-C15-Y (same, yearly) was TOO FEW CASES per period (2 + 3 blocks).
//     SQ10-SH30-MOM (MSCI momentum TILT of the top 30) beat SPUS in both halves from Oct 2022 (NOT PROVEN per period).
//   Squad 5: a 200-day SPY trend filter on the top 20 (SQ5-TOP20-TF) did not help. Squad 16: value / quality baskets failed 2024-26; its
//     next idea was large-company momentum weighted by size (rule 3 below).
//   NOTHING of the four rules below was run before they were written here.
//
// PRE-REGISTERED 24 Oct 2026, BEFORE ANY SQUAD 17 RESULT WAS SEEN (one version each; ids SQ17-*; the same text is written into
// data/strategy-library.json before the first computation). Each rule is run ONCE on the 5-year window; the first complete verdict is
// frozen in data/squad17-lab.json firstRun (first-run.mjs freezeEach). No tuning on results.
//
// COMMON (all rules): Squad 10's data and Shariah screen UNCHANGED (squad10-core.mjs balanceAt / shariahPass / weights, squad10-lab data
//   machinery copied with its fixes: splits implied from SEC share counts, renamed giants FB->META / IIVI->COHR / ANTM->ELV spliced, wider
//   debt tags, the historical Form 3/4/5 ticker -> SEC company map, never today's ticker list; Visa / Berkshire gaps as noted by Squad 10).
//   Formation at the first session of Jan / Apr / Jul / Oct (yearly rule: January only), trades at the NEXT open, cash at 0%. The Shariah
//   list is walked down the market-value ranking until 100 companies pass (Squad 10 stopped at 60; rule 3 needs 100).
//   SPUS is held as a security (its own daily opens and closes, price only, like the stocks).
//   PORTFOLIO ENGINE = squad5-core simulate: 0.4% of the money on every buy and every sale (stress 0.6%), the REAL turnover of every
//   rebalance, daily marks, a dead stock = 0.
// THE RULES (4):
//   SQ17-MIX50     50% SPUS + 50% SQ10-SH20-C15 (each of the 20 at half its SH20-C15 weight), BOTH sleeves reset to 50 / 50 at every
//                  quarterly review (the SPUS sleeve is only topped up or trimmed).
//   SQ17-SH20-TF10 SQ10-SH20-C15, but at the LAST session of every month: SPUS close below the average of its last 10 month-end closes (this
//                  one included; SPUS history from 2019 so the average exists from the start) -> sell everything at the next open and
//                  hold cash at 0% (a sukuk / cash proxy that earns nothing); back at or above it -> buy the CURRENT Shariah top 20,
//                  capped 15%, at the next open. Quarterly reviews only while invested. One version (Faber 10-month rule on SPUS).
//   SQ17-SHMOM30   the 100 largest passing the Shariah screen -> the 30 with the highest 12-1 return (close 21 sessions ago / close 252
//                  sessions ago - 1; a company without 252 sessions of history is left out; ties: the larger company), weighted by market
//                  value, no stock above 15%, quarterly. Starts when 12-1 returns exist in the price cache (first review January 2023: the
//                  cache starts Oct 2021), so its older half is 2023 only - reported as such.
//   SQ17-SH20-CW-Y the 20 largest passing the Shariah screen, PURE cap weight (no cap), re-formed ONCE A YEAR (first session of January),
//                  weights drift in between (lowest turnover). Differs from SQ10-SH20-C15-Y only by the missing 15% cap. With 1 period
//                  a year per stock the per-period count is expected TOO FEW: judged mainly as an account (said so in advance).
// JUDGED AS ACCOUNTS (primary): CAGR per half (start - last close of 2023 / 2024 - last close) after 0.4% per side on real turnover, vs SPUS
//   (PRIMARY: the halal fund the owner can buy instead) and SPY, at 0.6% per side (stress); max drawdown; WORST CALENDAR YEAR (2026 = to
//   the last close; the first year from the start); return for the drawdown = whole-window CAGR / |max drawdown|.
// PER-PERIOD STANDARD (Squad 10 / Squad 5, unchanged): each holding period (a stock - or the SPUS sleeve - from one review to the next; a
//   sale, cash switch, delisting or the last close ends it early) = one trade with the full 0.8% (1.2% stress); halves by period start;
//   value-core + hold-core judgeHold (> 0 after both costs, beats the average liquid stock on the same days, beats the same stock held as long
//   on its other days, > 0 without the 2 best, 20+ trades, 3+ blocks, block t, return per year of capital above SPY in both halves); every
//   gross return capped at +300% on both sides (AUD-1).
// THE OWNER'S ANSWER (fixed in advance): among the three core options SPUS ALONE (bought once, held), SQ10-SH20-C15 (re-run here on the same
//   dates) and SQ17-MIX50, all started on the same session, "best return for the drawdown" = the highest whole-window CAGR / |max
//   drawdown| after 0.4% per side (a tie within 0.05: the smaller drawdown). Rules 2-4 are reported next to them; one is named instead only
//   if it beats SPUS in both halves AND has the higher ratio on the SAME dates as SPUS.
import { capWeights, capAtMax, CAP15 } from './squad10-core.mjs';
export const MIX_SPUS = 0.5, SMA_MONTHS = 10, MOM_POOL = 100, MOM_N = 30, SH_N = 20;
const EPS = 1e-9, ok = (x) => typeof x === 'number' && isFinite(x);
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);

// ---- weights ----
// SH20-C15 weights: rows [{ key, cap }] (the Shariah top 20, largest first) -> Map key -> w (sum 1), no weight above 15%
export const c15 = (rows) => capAtMax(capWeights(rows), CAP15);
// the 50 / 50 mix: the basket's weights halved + the SPUS key at 50%
export function mixWeights(w, spusKey, share = MIX_SPUS) { const out = new Map(); for (const [k, v] of w) out.set(k, v * (1 - share)); out.set(spusKey, (out.get(spusKey) || 0) + share); return out; }
// rule 3: rows = the Shariah list (largest first; at least `pool` long) -> the n best by 12-1 return among the first `pool`, cap-weighted, 15% cap
export function momPick(rows, pool = MOM_POOL, n = MOM_N) {
  const top = rows.slice(0, pool).filter(r => ok(r.mom)).sort((a, b) => b.mom - a.mom || b.cap - a.cap).slice(0, n); return top; }
export const momWeights = (rows, pool = MOM_POOL, n = MOM_N) => c15(momPick(rows, pool, n));

// ---- the 10-month trend switch ----
// monthEndCloses(bars [{ d, c }] sorted) -> [[YYYY-MM, last date, close]] (the last bar of each calendar month)
export function monthEndCloses(bars) { const m = new Map(); for (const b of bars || []) if (b && b.c > 0) m.set(b.d.slice(0, 7), [b.d.slice(0, 7), b.d, b.c]); return [...m.values()].sort((a, b) => a[0] < b[0] ? -1 : 1); }
// on date d (a month's last session): { up, close, sma } - close of the month containing d vs the average of the last n month-end closes
// up to and including it (dates after d never used). null when fewer than n month ends exist.
export function trendAt(me, d, n = SMA_MONTHS) { const upto = me.filter(x => x[1] <= d); if (upto.length < n) return null; const last = upto[upto.length - 1];
  if (last[0] !== d.slice(0, 7)) return null;   // the month's own close must be the one at d
  const sma = upto.slice(-n).reduce((a, x) => a + x[2], 0) / n; return { up: last[2] >= sma - EPS, close: last[2], sma }; }

// ---- account statistics ----
// calendar-year returns of a level series lv (index -> value) from session s0: [{ y, r, from, to }]; the first year runs from s0
export function yearReturns(lv, D, s0) { const out = []; let a = s0;
  for (let k = s0 + 1; k < D.length; k++) { const endYear = k === D.length - 1 || D[k + 1].slice(0, 4) !== D[k].slice(0, 4);
    if (!endYear) continue; if (lv[a] > 0 && lv[k] > 0) out.push({ y: D[k].slice(0, 4), r: r4(lv[k] / lv[a] - 1), from: D[a], to: D[k] }); a = k; }
  return out; }
export const worstYear = (yr) => yr.length ? yr.reduce((w, x) => x.r < w.r ? x : w) : null;
// return for the drawdown: CAGR / |max drawdown| (null if either is missing or no drawdown)
export const retForDD = (s) => s && ok(s.cagr) && ok(s.maxDD) && s.maxDD < 0 ? r4(s.cagr / -s.maxDD) : null;
// the owner's answer: options [{ id, cagr, maxDD }] -> the id with the highest ratio; within 0.05 of the best: the smaller drawdown
export function bestCore(opts) { const v = opts.map(o => ({ ...o, ratio: retForDD(o) })).filter(o => o.ratio !== null); if (!v.length) return null;
  const top = Math.max(...v.map(o => o.ratio)), near = v.filter(o => o.ratio >= top - 0.05 - EPS).sort((a, b) => b.maxDD - a.maxDD || b.ratio - a.ratio); return near[0].id; }

// ---- the rules ----
const COMMON = 'Squad 10 data and Shariah screen unchanged (point-in-time proxy of the S&P / Dow Jones Islamic method, NOT the ZAD status: SIC business screen; debt, cash + short-term investments and receivables each < 33% of the 36-month average market value; interest income < 5% of revenue; Squad 10 data fixes: implied splits from SEC share counts, renamed giants FB->META etc., wider debt tags, historical ticker -> SEC company map). Formation at the first session of Jan / Apr / Jul / Oct (yearly: January), trades at the next open, cash at 0%, SPUS held as a security (price only, like the stocks). JUDGED AS AN ACCOUNT vs SPUS (primary) and SPY: CAGR in both halves (start - end 2023 / 2024 - last close) after 0.4% per side on the real turnover (stress 0.6%), max drawdown, worst calendar year, CAGR / |max drawdown|; plus the per-period standard of Squad 10 (each holding period one trade, 0.8% / 1.2%, average-stock and same-stock yardsticks, no-top-2, 20+ trades, 3+ blocks, block t, return per year above SPY; +300% cap both sides). Run once, first complete verdict frozen. Core-holding study: not used for TRY SMALL.';
export const RULES = {
  'SQ17-MIX50': { kind: 'mix', n: SH_N, every: 'q', name: 'Half SPUS + half Halal top 20 (capped 15%), rebalanced quarterly', short: '50% SPUS + 50% SQ10-SH20-C15 (the 20 largest Shariah-screened, cap-weighted, max 15%), both sleeves reset to 50/50 every quarter' },
  'SQ17-SH20-TF10': { kind: 'tf', n: SH_N, every: 'q', name: 'Halal top 20 (capped 15%) with a 10-month SPUS trend switch to cash', short: 'SQ10-SH20-C15, but all in cash (0%) while SPUS closes a month below its 10-month average (checked at every month end, trades next open); back above = buy the current top 20 again' },
  'SQ17-SHMOM30': { kind: 'mom', n: MOM_N, pool: MOM_POOL, every: 'q', mom: true, name: 'Halal momentum 30 of the 100 largest, cap-weighted, capped 15%', short: 'among the 100 largest Shariah-screened companies, the 30 with the best 12-1 month return, weighted by market value, no stock above 15%, quarterly' },
  'SQ17-SH20-CW-Y': { kind: 'cwy', n: SH_N, every: 'y', name: 'Halal top 20, pure cap weight, rebalanced once a year', short: 'the 20 largest Shariah-screened companies, pure cap weight (no cap), re-formed once a year in January, weights drift in between' },
};
export const IDS = Object.keys(RULES);
export const reviewMonth = (id, d) => { const m = String(d).slice(5, 7); return RULES[id].every === 'y' ? m === '01' : ['01', '04', '07', '10'].includes(m); };
export const periodHold = (id) => RULES[id].every === 'y' ? 252 : 63;
// the weights of a rule at a review: rows = the Shariah list at that review (largest first; mom = 12-1 return), spusKey for the mix
export function weightsFor(id, rows, spusKey) { const R = RULES[id];
  if (R.kind === 'mix') return mixWeights(c15(rows.slice(0, R.n)), spusKey);
  if (R.kind === 'tf') return c15(rows.slice(0, R.n));
  if (R.kind === 'mom') return momWeights(rows, R.pool, R.n);
  if (R.kind === 'cwy') return capWeights(rows.slice(0, R.n));
  throw new Error('unknown rule kind ' + R.kind); }
export function preRegister(LB, today = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Halal core holding (Squad 17)', name: r.name, explain: r.short + '. ' + COMMON, status: 'pre-registered ' + today + ' (squad 17); 5-year one-shot pending', agent: 'squad17', registered: today,
      libraryCheck: 'Builds on SQ10-SH20-C15 (beat SPUS both halves as an account, deeper 2022 drawdown), SQ10-SH20-C15-Y (too few periods), SQ10-SH30-MOM (momentum tilt, not selection), SQ5-TOP20-TF (SPY 200-day filter, did not help), SQ16 (value / quality baskets failed). New here: a SPUS + basket mix, a 10-month SPUS trend switch, momentum SELECTION (top 30 of the 100 largest halal) with size weights, an uncapped yearly halal top 20; judged first as one account vs SPUS with worst year and return for the drawdown.',
      note: 'Pre-registered ' + today + ' BEFORE any squad 17 run (squad17-core.mjs = the exact rule). 5-year one-shot by squad17-lab.mjs, first complete verdict frozen in data/squad17-lab.json; core-holding study, not a TRY SMALL lab.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
