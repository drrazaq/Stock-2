// ANGLES CORE (24 Oct 2026; owner: "more, different ways to make money": angles NOT yet tested). Pure functions, no network, no files.
// Used by angles-lab.mjs (one 5-year run per angle, first complete verdict frozen + a forward PAPER lane from Monday 26 Oct 2026) and
// test/angles-core.test.mjs. Long only; no leverage; no shorting; never places an order.
//
// PRE-REGISTERED 24 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids ANG-*; the same text is written into
// data/strategy-library.json in the same commit and again, idempotently, by angles-lab.mjs before its first computation).
// Common conventions (the system's, unchanged):
//   LIQUID = close 5 USD+ and 20-session average traded value 5M USD+ on the signal day (SPY excluded).
//   LARGE CAP (top 500) = the 500 largest liquid stocks by total market value on the signal day (close x the SEC share count known 30
//   days earlier, data/shares.json.gz; one ticker per company: the most traded one).
//   Signal at the CLOSE of session t (only what is known then); buy the OPEN of t+1; sell the CLOSE of the exit session (a stock that left
//   the cache keeps its later price from the x rows, else its last close). One open trade per stock per angle, EXCEPT the monthly
//   basket ANG-DIVG, where every month is its own tranche (overlapping 3-month holds, as the anomaly lab's monthly sorts).
//   JUDGED at the system's tier-2 standard (value-core.mjs judge): both halves (signal before / from 2024-01-01) positive after 0.8% and
//   1.2% cost, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its other days,
//   positive without its 2 best trades, block t >= 2.5 (non-overlapping blocks of the hold length) -> TRADABLE SMALL; block t >= the
//   proof bar (max of 2.5, the league bar, 4.0) -> PROVEN. Fewer than 20 trades or 3 blocks in a half -> TOO FEW CASES. Nothing lowered.
//   INDEX-LEVEL rules (SPUS) trade the fund close to close; their yardstick is the fund's own average over ALL windows of the same length in
//   the same half (as ANOM-TOM / ANOM-PREHOL did).
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26';
import { boardStats, paperReady, nextSession, reactionIdx, NYSE_HOLIDAYS } from './anomaly-core.mjs';
export { boardStats, paperReady, nextSession, reactionIdx, NYSE_HOLIDAYS };
const P = (cite, url) => ({ cite, url });

// ---------------- the Russell calendar (FTSE Russell press releases / recon summaries) ----------------
// rank = rank day (market values taken at its close); recon = the Friday after whose close the new membership applies; small = total
// market value of the smallest Russell 2000 company; bp = the Russell 1000 / 2000 breakpoint (USD). 2025's breakpoint is the 2026
// summary's figure worked back (5.7B, +24%); December 2026 (the first semi-annual recon; rank day = last business day of October,
// effective after the close of the second Friday of December) uses the June 2026 cut-offs, the newest published.
export const RUSSELL = [
  { y: 2021, rank: '2021-05-07', recon: '2021-06-25', small: 257.1e6, bp: 5.2e9 },
  { y: 2022, rank: '2022-05-06', recon: '2022-06-24', small: 240.1e6, bp: 4.6e9 },
  { y: 2023, rank: '2023-04-28', recon: '2023-06-23', small: 159.5e6, bp: 4.2e9 },
  { y: 2024, rank: '2024-04-30', recon: '2024-06-28', small: 150.4e6, bp: 4.6e9 },
  { y: 2025, rank: '2025-04-30', recon: '2025-06-27', small: 119.4e6, bp: 4.6e9 },
  { y: 2026, rank: '2026-04-30', recon: '2026-06-26', small: 146.4e6, bp: 5.7e9 },
  { y: 2026.5, rank: '2026-10-30', recon: '2026-12-11', small: 146.4e6, bp: 5.7e9, estimated: true },
];
export const BAND = 0.025;   // Russell banding: +/- 2.5% of cumulative market value around the 1000 breakpoint (5% band)
// FOMC statement days (federalreserve.gov meeting calendars 2021-2026; scheduled meetings, statement on the 2nd day)
export const FOMC = ['2021-01-27', '2021-03-17', '2021-04-28', '2021-06-16', '2021-07-28', '2021-09-22', '2021-11-03', '2021-12-15',
  '2022-01-26', '2022-03-16', '2022-05-04', '2022-06-15', '2022-07-27', '2022-09-21', '2022-11-02', '2022-12-14',
  '2023-02-01', '2023-03-22', '2023-05-03', '2023-06-14', '2023-07-26', '2023-09-20', '2023-11-01', '2023-12-13',
  '2024-01-31', '2024-03-20', '2024-05-01', '2024-06-12', '2024-07-31', '2024-09-18', '2024-11-07', '2024-12-18',
  '2025-01-29', '2025-03-19', '2025-05-07', '2025-06-18', '2025-07-30', '2025-09-17', '2025-10-29', '2025-12-10',
  '2026-01-28', '2026-03-18', '2026-04-29', '2026-06-17', '2026-07-29', '2026-09-16', '2026-10-28', '2026-12-09'];

// ---------------- the angles (exact rules) ----------------
export const ANGLES = {
  'ANG-RUS-ADD': { name: 'Russell 2000 addition from below (predicted on rank day)', family: 'russell', hold: 40,
    rule: 'On each Russell rank day (table RUSSELL), total market value = close x SEC share count known 30 days earlier (common stocks; one ticker per company). Predicted ADDITION from below: market value now >= the published smallest Russell 2000 company and < the published 1000/2000 breakpoint, AND on the previous rank day the company traded with a market value under that year\'s smallest Russell 2000 company (so it was not in the Russell 3000). Liquid on rank day. Buy the next open, sell the close of the reconstitution Friday. Hold field 40 (blocks): one block per year.',
    papers: [P('Madhavan (2003) The Russell Reconstitution Effect, Financial Analysts Journal 59(4)', 'https://doi.org/10.2469/faj.v59.n4.2545'), P('Dimensional (2024) Even Migrating Stocks Face Index Reconstitution Costs (2014-2023: R2000 migrating additions +1.2% vs the R2000 in the 20 days before recon, -0.95% in the 20 after)', 'https://www.dimensional.com/us-en/insights/even-migrating-stocks-face-index-reconstitution-costs')],
    reported: 'additions earn positive excess returns between rank day and reconstitution, then partly reverse', lib: 'E6 / ANOM-IDXADD (index inclusion: needs data, S&P announcement dates); C-SPEC1 (queued, S&P additions). Russell additions predicted from market value were never tested' },
  'ANG-RUS-DOWN': { name: 'Russell 1000 -> 2000 migrant (predicted on rank day)', family: 'russell', hold: 40,
    rule: 'On each rank day: the company had a market value >= the previous year\'s 1000/2000 breakpoint on the previous rank day (a Russell 1000 member), and now sits BELOW the Russell 1000 band: ranked by market value, its cumulative share of the total market value of all ranked companies is more than 2.5 percentage points past the cumulative share at the published breakpoint (banding), and its value is >= the smallest Russell 2000 company. Liquid. Buy the next open, sell the close of the reconstitution Friday.',
    papers: [P('Chang, Hong & Liskovich (2015) Regression Discontinuity and the Price Effects of Stock Market Indexing, Review of Financial Studies 28(1)', 'https://doi.org/10.1093/rfs/hhu041'), P('Madhavan (2003) FAJ 59(4)', 'https://doi.org/10.2469/faj.v59.n4.2545')],
    reported: 'stocks moving from the Russell 1000 to the top of the Russell 2000 rise into reconstitution (index-fund demand per dollar of value is much larger in the 2000)', lib: 'none (E6 / ANOM-IDXADD are S&P additions)' },
  'ANG-IPOBASE': { name: 'IPO first base breakout (O\'Neil), 3-24 months after listing', family: 'ipo', hold: 60,
    rule: 'IPO = the company\'s first 424B4 (SEC EDGAR index) and the stock first appears in the price cache within 15 sessions after it, not before; blank-check companies (SIC 6770, or the first 10 closes all within 9.5-10.6 USD) left out. Signal at session t when the stock is 63-504 sessions old: base high H = the highest close of the last 65 sessions (from listing), set 15+ sessions before t; base depth (H vs the lowest close since H) 8-40%; close above H but within 5% of it (buy zone); volume >= 1.5x its average of the prior 50 sessions (20+ needed); liquid. Only the FIRST such breakout per stock. Buy the next open; sell the close of the first session closing 8%+ under the buy (O\'Neil stop), else the close of the 60th session.',
    papers: [P('O\'Neil, How to Make Money in Stocks (IPO base: a new issue\'s first base in its first months; 7-8% loss-cutting rule)', 'https://www.luxalgo.com/library/concept/ipo-base/'), P('Ritter (1991) The Long-Run Performance of Initial Public Offerings, Journal of Finance 46(1) (IPOs as a group lag: why the base filter matters)', 'https://doi.org/10.1111/j.1540-6261.1991.tb03743.x')],
    reported: 'practitioner method; no audited record (AAII CAN SLIM screen as the nearest tracked proxy)', lib: 'I12 (young IPO above its 50-day: paper), DEC2-IBD (generic O\'Neil base, any stock): the IPO-only first base was never tested' },
  'ANG-LCREV-W': { name: 'Large-cap 1-week losers without news (short-term reversal)', family: 'reversal', hold: 5,
    rule: 'Every week at the close of its last session t: among the top 500 by market value (liquid), the 10% with the lowest 5-session return (close t vs close t-5), LEAVING OUT any company that filed an 8-K with item 2.02 (results) or 8.01 (other events) dated within those 5 sessions (SEC submissions). Buy the next open, sell the close of the 5th session.',
    papers: [P('Chan (2003) Stock price reaction to news and no-news: drift and reversal after headlines, Journal of Financial Economics 70(2)', 'https://doi.org/10.1016/S0304-405X(03)00146-6'), P('de Groot, Huij & Zhou (2012) Another look at trading costs and short-term reversal profits, Journal of Banking & Finance 36(2) (large caps: 30-50 bp a week net)', 'https://ideas.repec.org/a/eee/jbfina/v36y2012i2p371-382.html')],
    reported: 'no-news losers reverse; large-cap reversal survives realistic trading costs (30-50 bp a week)', lib: 'A-SW2 (rejected) took the worst 5-day losers among ALL liquid stocks in an uptrend with no news filter; ANOM-DAYREV1 (rejected) is the intraday month. Large caps + no-news filter is a different, published version' },
  'ANG-LCREV-M': { name: 'Large-cap 1-month losers without news (short-term reversal)', family: 'reversal', hold: 21,
    rule: 'Every month at the close of its last session t: among the top 500 by market value (liquid), the 10% with the lowest 21-session return, leaving out any company with an 8-K item 2.02 or 8.01 dated within those 21 sessions. Buy the next open, hold 21 sessions.',
    papers: [P('Jegadeesh (1990) Evidence of Predictable Behavior of Security Returns, Journal of Finance 45(3)', 'https://doi.org/10.1111/j.1540-6261.1990.tb05110.x'), P('Chan (2003) JFE 70(2)', 'https://doi.org/10.1016/S0304-405X(03)00146-6')],
    reported: 'one-month losers outperform the next month; strongest without news', lib: 'ANOM-DAYREV1 (intraday month, rejected); no plain large-cap no-news month version' },
  'ANG-LCGAP20': { name: 'Large-cap earnings gap-up that holds 3 sessions, hold 20', family: 'gap', hold: 20,
    rule: 'Earnings reaction session r (Nasdaq calendar: before the open = report day, else the next session) of a top-500 company (as of r-1): open >= 4% over the previous close, volume >= 2x its 50-session average, and the LOW of each of the next 3 sessions stays above the low of session r (daily bars with highs/lows from Massive). Buy the open of r+4, hold 20 sessions.',
    papers: [P('Zhou & Zhu (2012) Jump on the Post-Earnings Announcement Drift, Financial Analysts Journal 68(3) (positive earnings jumps drift for 3 months)', 'https://ideas.repec.org/a/taf/ufajxx/v68y2012i3p63-80.html'), P('Chan, Jegadeesh & Lakonishok (1996) Momentum Strategies, Journal of Finance 51(5)', 'https://doi.org/10.1111/j.1540-6261.1996.tb05222.x')],
    reported: 'earnings jumps predict drift in the same direction over the following 3 months (1971-2009)', lib: 'E13 -> E16 (not proven: ANY liquid stock, 5%+ gap, 3 QUIET days above the gap midpoint, hold 20); DEC2-GAPGO (any stock, no earnings link). Large caps, gap-day-low hold and a 60-day hold are new' },
  'ANG-LCGAP60': { name: 'Large-cap earnings gap-up that holds 3 sessions, hold 60', family: 'gap', hold: 60,
    rule: 'Earnings reaction session r (Nasdaq calendar: before the open = report day, else the next session) of a top-500 company (as of r-1): open >= 4% over the previous close, volume >= 2x its 50-session average, and the LOW of each of the next 3 sessions stays above the low of session r. Buy the open of r+4, hold 60 sessions (same signal as ANG-LCGAP20).', papers: [P('Zhou & Zhu (2012) FAJ 68(3)', 'https://ideas.repec.org/a/taf/ufajxx/v68y2012i3p63-80.html')],
    reported: 'as ANG-LCGAP20', lib: 'as ANG-LCGAP20' },
  'ANG-QLOW': { name: 'Quality stock at its 52-week low turning up (F-score 7+)', family: 'quality', hold: 60,
    rule: 'Non-financial liquid stock with Piotroski F-score >= 7 (quality.mjs yearly cache and code; a 10-K counts from 10 April), whose close was within 5% of its 252-session lowest close on at least one of the last 10 sessions, and which at t makes its first close above its 20-session average (close t-1 at or under that day\'s average). Buy the next open, hold 60 sessions.',
    papers: [P('Piotroski (2000) Value Investing: The Use of Historical Financial Statement Information, Journal of Accounting Research 38', 'https://doi.org/10.2307/2672906'), P('George & Hwang (2004) The 52-Week High and Momentum Investing, Journal of Finance 59(5) (anchoring to 52-week extremes)', 'https://doi.org/10.1111/j.1540-6261.2004.00695.x')],
    reported: 'high F-score stocks beat low; anchoring at 52-week extremes delays the price reaction', lib: 'V13 (F-score 8-9: not proven), V15 (F-score in an UPTREND: tier 2), M8 (1-year low + volume: failed), D2-002/3 (52-week low discovered rules). F-score at the low with a turn-up trigger was never tested' },
  'ANG-LOCKUP': { name: 'IPO lock-up expiry bounce: buy 3 sessions after the expiry', family: 'ipo', hold: 20,
    rule: 'IPO as ANG-IPOBASE. Expiry session E = the first session on or after the 424B4 date + 180 calendar days. Signal at the close of E+2 (liquid); buy the open of E+3, hold 20 sessions.',
    papers: [P('Field & Hanka (2001) The Expiration of IPO Share Lockups, Journal of Finance 56(2) (-1.5% three-day abnormal return around expiry)', 'https://ideas.repec.org/a/bla/jfinan/v56y2001i2p471-500.html')],
    reported: 'the price dips around the expiry (supply), a permanent 40% volume increase; the bounce after it is the untested part', lib: 'E12 (risk rule), C-LOCK (AVOID the 10 sessions after expiry: pre-registered, share-supply.mjs). The long side 3 sessions after was never tested' },
  'ANG-DIVG': { name: 'Dividend growth streak (5+ raises) with low debt', family: 'dividend', hold: 63,
    rule: 'Monthly at the close of the first session of each month: non-financial liquid stocks whose annual dividend per share (SEC XBRL CommonStockDividendsPerShareDeclared, else ...CashPaid) rose in each of the last 5 fiscal years (6 annual figures; each year compared with the year before IN THE SAME 10-K, so splits do not break it; only filings public before the day; latest year ended within 15 months) AND interest-bearing debt / market value < 33% (the halal screen\'s debt test). Equal weight; each month a new tranche held 63 sessions.',
    papers: [P('Ned Davis Research via Hartford Funds (S&P 500, 1973-2025: dividend growers and initiators 13.0% a year vs 12.7% all payers, 11.5% non-payers, lower volatility)', 'https://www.nasdaq.com/articles/does-long-term-dividend-investing-really-work-study-says-definitely'), P('Michaely, Thaler & Womack (1995) Price Reactions to Dividend Initiations and Omissions, Journal of Finance 50(2)', 'https://doi.org/10.1111/j.1540-6261.1995.tb04796.x')],
    reported: 'dividend growers beat other groups with lower volatility (practitioner study, not peer reviewed)', lib: 'V7 (dividend growth: needs data), ANOM-DIVINIT (initiations: rejected). A raise STREAK from SEC data was never tested' },
  'ANG-FOMC': { name: 'Pre-FOMC drift on SPUS', family: 'calendar', hold: 1,
    rule: 'Buy SPUS at the close of the session before each FOMC statement day (table FOMC), sell at the close of the statement day. Yardstick: SPUS over ALL 1-session windows of the same half. 0.8% cost as every rule (the 0.1% ETF-cost figure is information only).',
    papers: [P('Lucca & Moench (2015) The Pre-FOMC Announcement Drift, Journal of Finance 70(1)', 'https://doi.org/10.1111/jofi.12196'), P('Kurov, Wolfe & Gilbert (2021) The disappearing pre-FOMC announcement drift, Finance Research Letters 40 (gone after 2015)', 'https://ideas.repec.org/a/eee/finlet/v40y2021ics1544612320315956.html')],
    reported: 'S&P 500 rose ~49 bp in the 24 hours before announcements (1994-2011); essentially disappeared after 2015', lib: 'C7 (not tested: drift reported gone). Owner asked; tested once on SPUS' },
  'ANG-SPLIT': { name: 'Forward stock split, first in 3 years (post-split drift)', family: 'split', hold: 126,
    rule: 'Forward split (more shares, Massive split list) whose execution date is the company\'s first split in the previous 3 years. Signal at the close of the first session on or after the execution date (liquid); buy the next open, hold 126 sessions.',
    papers: [P('Ikenberry, Rankine & Stice (1996) What Do Stock Splits Really Signal? JFQA 31(3) (+7.9% first-year excess return)', 'https://ideas.repec.org/a/cup/jfinqa/v31y1996i03p357-375_00.html'), P('Long-run returns after splits revisited, 1975-2011 (no significant drift 2000-2011 overall; firms that had NOT split before: +6.05% a year, significant)', 'https://acfr.aut.ac.nz/__data/assets/pdf_file/0005/105476/89582-Splits-Longrun-2017.pdf')],
    reported: 'drift after splits, much weaker after 2000; survives for first-time splitters', lib: 'S4 (reverse-split aftermath: risk rule). Forward splits never tested' },
};
export const IDS = Object.keys(ANGLES);
export const TRANCHES = new Set(['ANG-DIVG']);   // monthly baskets: no one-open-per-stock rule
// information only (one path, no statistics; never in firstRun, never a buy)
export const INFO = {
  'ANG-DIP5': { name: 'Halal funds: save monthly and buy only on a 5% dip, vs buy every month (extends HOLD-DIPFUND, which tested 10%)',
    rule: 'SPUS and HLAL: 1 unit of money each month at the first session. DCA buys at that open; DIP keeps it as cash and invests all saved cash at the next open after a close 5%+ under the highest close of the last 252 sessions. 0.4% per buy and on the final sale (hold-core.mjs dcaVsDip, dip = 0.05). Over the cache window and since the fund\'s first price.',
    lib: 'HOLD-DIPFUND (10% dip: information, DIP +1.0% vs DCA in the window, -0.8% since inception for SPUS)' },
};
// candidates NOT run (already tested properly, or not testable as asked)
export const SKIPPED = {
  'Net buyback yield (XBRL repurchases minus issuance, top decile)': 'covered: ANOM-BBY (TTM repurchases / market value, top 10% of repurchasers, hold 63: REJECTED 23 Oct) and ANOM-NSI (shrinking share count: REJECTED), V11 (FAILED). Net = the same ranking minus issuance; V17 (net payout yield) stays queued with Agent B.',
  'Pre-holiday drift on SPUS': 'covered: ANOM-PREHOL (SPY, the same days: REJECTED, avg -0.6% after 0.8% cost in both halves). SPUS moves with SPY on those days; a 1-session trade cannot pay 0.8%.',
  'Sector / halal ETF relative strength with a trend filter': 'covered: A-ROT1 (top-3 sector ETFs by 6-month and 12-1 return: REJECTED, behind SPUS/HLAL in both halves) and A-ROT2 (SPUS/HLAL above the 10-month average else gold/cash: REJECTED). A trend filter on top of A-ROT1 can only cut its exposure in the months it already lagged; no materially different published version found.',
  'Dip buying SPUS/HLAL after a 10% drawdown': 'covered: HOLD-DIPFUND (information). Only the 5% version is new: ANG-DIP5 (information).',
  'Tax-loss / January reversal of December losers': 'not run: one event a year = 2 blocks in the older half, it cannot pass the 3-block gate by construction (C5 / DEC2-SANTA cover the calendar part).',
};

// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), addDays = (d, n) => new Date(ms(d) + n * DAY).toISOString().slice(0, 10);
export { addDays };
// first index with D[i] >= d (D sorted); D.length if none
export const onOrAfter = (D, d) => { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
// last index with D[i] <= d; -1 if none
export const onOrBefore = (D, d) => onOrAfter(D, addDays(d, 1)) - 1;
export function sma(c, t, n) { if (t - n + 1 < 0) return null; let s = 0; for (let k = t - n + 1; k <= t; k++) { if (!(c[k] > 0)) return null; s += c[k]; } return s / n; }
export function avgVol(v, t, n, minN = n) { let s = 0, m = 0; for (let k = Math.max(0, t - n); k < t; k++) if (v[k] > 0) { s += v[k]; m++; } return m >= minN ? s / m : null; }
// the bottom `frac` of rows [{ key, v }] by v (finite only), at least minRows usable, else []
export function pickBottom(rows, frac, minRows) { const a = rows.filter(r => ok(r.v)); if (a.length < minRows) return []; a.sort((x, y) => x.v - y.v); return a.slice(0, Math.max(1, Math.ceil(a.length * frac))).map(r => r.key); }
// week ends / month ends: indices t where D[t+1] is in another ISO week / month (the newest session counts when the calendar says so)
const isoWeek = (d) => { const x = new Date(d + 'T00:00:00Z'), day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day + 3); const y = x.getUTCFullYear(), f = new Date(Date.UTC(y, 0, 4)); return y + '-' + (1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)); };
export function weekEnds(D, hol = NYSE_HOLIDAYS) { const o = []; for (let t = 0; t < D.length; t++) { const nx = t + 1 < D.length ? D[t + 1] : nextSession(D[t], hol); if (isoWeek(nx) !== isoWeek(D[t])) o.push(t); } return o; }
export function monthEnds(D, hol = NYSE_HOLIDAYS) { const o = []; for (let t = 0; t < D.length; t++) { const nx = t + 1 < D.length ? D[t + 1] : nextSession(D[t], hol); if (nx.slice(0, 7) !== D[t].slice(0, 7)) o.push(t); } return o; }
export const monthStarts = (D) => { const o = []; for (let t = 1; t < D.length; t++) if (D[t].slice(0, 7) !== D[t - 1].slice(0, 7)) o.push(t); return o; };

// ---------------- market value ranking (Russell) ----------------
// rows [{ key, mv }] -> sorted desc with rank (1 = largest) and cum (cumulative share of the total value, incl. itself)
export function rankByValue(rows) { const a = rows.filter(r => r.mv > 0).sort((x, y) => y.mv - x.mv), tot = a.reduce((s, r) => s + r.mv, 0); let c = 0;
  return a.map((r, j) => { c += r.mv; return { ...r, rank: j + 1, cum: tot > 0 ? c / tot : null }; }); }
// predicted additions from below: now = Map key -> mv on this rank day, prev = Map key -> mv on the previous rank day (traded that day)
export function russellAdds(now, prev, yr, yr0) { const out = []; for (const [k, mv] of now) { if (!(mv >= yr.small && mv < yr.bp)) continue; const p = prev.get(k); if (!(p > 0) || p >= yr0.small) continue; out.push(k); } return out; }
// predicted migrants from the Russell 1000 to the 2000: prev value >= previous breakpoint; now past the lower band edge
export function russellDowns(now, prev, yr, yr0, band = BAND) { const R = rankByValue([...now].map(([key, mv]) => ({ key, mv }))); if (!R.length) return [];
  let bpCum = null; for (const r of R) { if (r.mv >= yr.bp) bpCum = r.cum; else break; } if (bpCum === null) return [];
  return R.filter(r => r.cum > bpCum + band && r.mv >= yr.small && prev.get(r.key) >= yr0.bp).map(r => r.key); }

// ---------------- news filter (SEC 8-K items) ----------------
// list: [{ d: filing date, items: '2.02,9.01' }]; true if any 8-K dated in [from, to] carries one of the items
export function has8k(list, from, to, items = ['2.02', '8.01']) { for (const f of list || []) { if (f.d < from || f.d > to) continue; const its = String(f.items || '').split(/[,\s]+/); if (items.some(x => its.includes(x))) return true; } return false; }

// ---------------- earnings gap that holds ----------------
// o, c, v arrays; r = reaction session. gap >= 4% at the open, volume >= 2x the 50-session average (30+ sessions needed)
export function gapUp(o, c, v, r, { gap = 0.04, volX = 2 } = {}) { if (r < 1 || !(o[r] > 0) || !(c[r - 1] > 0)) return null; const g = o[r] / c[r - 1] - 1, av = avgVol(v, r, 50, 30); if (av === null || !(v[r] > 0)) return null; return g >= gap && v[r] >= volX * av ? { gap: g, volX: v[r] / av } : null; }
// lows: daily lows aligned with the sessions; true if each of the n sessions after r has a low above low[r]
export function holdsAbove(lows, r, n = 3) { if (!(lows[r] > 0)) return null; for (let k = r + 1; k <= r + n; k++) { if (!(lows[k] > 0)) return null; if (!(lows[k] > lows[r])) return false; } return true; }

// ---------------- quality at the low ----------------
// c: closes; true when t is the first close above the 20-session average after the stock was within 5% of its 252-session low close on
// one of the last 10 sessions
export function lowTurn(c, t, { near = 0.05, look = 10, n = 252 } = {}) { if (t < n + look) return false; const a = sma(c, t, 20), b = sma(c, t - 1, 20); if (a === null || b === null || !(c[t] > a) || !(c[t - 1] <= b)) return false;
  for (let k = t - look + 1; k <= t; k++) { let lo = Infinity, have = 0; for (let q = k - n + 1; q <= k; q++) if (c[q] > 0) { have++; if (c[q] < lo) lo = c[q]; } if (have < n * 0.9 || !(c[k] > 0)) continue; if (c[k] <= lo * (1 + near)) return true; } return false; }
// the same test for every session at once (O(T)): out[t] = 1 exactly when lowTurn(c, t) is true (the lab uses this one)
export function lowTurnSeries(c, { near = 0.05, look = 10, n = 252 } = {}) { const T = c.length, out = new Uint8Array(T), isNear = new Uint8Array(T), dq = []; let have = 0, head = 0;
  for (let k = 0; k < T; k++) { if (c[k] > 0) { have++; while (dq.length > head && c[dq[dq.length - 1]] >= c[k]) dq.pop(); dq.push(k); } if (k - n >= 0 && c[k - n] > 0) have--;
    while (dq.length > head && dq[head] <= k - n) head++; if (k >= n - 1 && have >= n * 0.9 && c[k] > 0 && dq.length > head && c[k] <= c[dq[head]] * (1 + near)) isNear[k] = 1; }
  const sm = new Float64Array(T).fill(NaN); let s = 0, m = 0;
  for (let k = 0; k < T; k++) { if (c[k] > 0) { s += c[k]; m++; } if (k >= 20 && c[k - 20] > 0) { s -= c[k - 20]; m--; } if (k >= 19 && m === 20) sm[k] = s / 20; }
  for (let t = n + look; t < T; t++) { if (!(c[t] > sm[t]) || !(c[t - 1] <= sm[t - 1])) continue; for (let k = t - look + 1; k <= t; k++) if (isNear[k]) { out[t] = 1; break; } }
  return out; }
// Piotroski F-score: the exact code of quality.mjs / value-lab.mjs. fy = { [year]: { ni, cfo, ltd, acur, lcur, gp, rev, rev2, assets } }, s1/s0 = shares
const num = (...v) => v.every(u => typeof u === 'number' && isFinite(u));
export function fscoreOf(fy, y, s1, s0) { const c = fy; if (!c || !c[y] || !c[y - 1] || !c[y - 2]) return null; const a = c[y], b = c[y - 1], z = c[y - 2];
  if (!num(a.ni, b.ni, a.cfo, a.ltd, b.ltd, a.acur, b.acur, a.gp, b.gp) || !(a.assets > 0 && b.assets > 0 && z.assets > 0) || !(a.lcur > 0 && b.lcur > 0)) return null;
  const rk = num(a.rev, b.rev) ? 'rev' : num(a.rev2, b.rev2) ? 'rev2' : null; if (!rk || !(a[rk] > 0 && b[rk] > 0)) return null;
  if (!(s1 > 0 && s0 > 0)) return null;
  const chk = [a.ni > 0, a.cfo > 0, a.ni / b.assets > b.ni / z.assets, a.cfo > a.ni, a.ltd / ((a.assets + b.assets) / 2) < b.ltd / ((b.assets + z.assets) / 2),
    a.acur / a.lcur > b.acur / b.lcur, s1 <= s0, a.gp / a[rk] > b.gp / b[rk], a[rk] / b.assets > b[rk] / z.assets];
  return chk.filter(Boolean).length; }
export const knownYear = (d) => { const y = +d.slice(0, 4), md = d.slice(5); return md >= '04-10' ? y - 1 : y - 2; };

// ---------------- IPOs ----------------
// first 10 closes all inside 9.5-10.6 USD -> a blank-check (SPAC) unit/share
export function spacLike(c, f0) { let n = 0; for (let k = f0; k < c.length && n < 10; k++) { if (!(c[k] > 0)) continue; n++; if (c[k] < 9.5 || c[k] > 10.6) return false; } return n >= 10; }
// IPO first-base breakout at t (c, v arrays; f0 = first session of the stock). Returns detail or null.
export function ipoBase(c, v, f0, t, { minAge = 63, maxAge = 504, look = 65, minLen = 15, dMin = 0.08, dMax = 0.40, zone = 0.05, volX = 1.5 } = {}) {
  const age = t - f0; if (age < minAge || age > maxAge || !(c[t] > 0)) return null; const a = Math.max(f0, t - look); let H = -Infinity, h = -1;
  for (let k = a; k < t; k++) if (c[k] > H) { H = c[k]; h = k; } if (h < 0 || t - h < minLen) return null;
  let lo = Infinity; for (let k = h + 1; k < t; k++) if (c[k] > 0 && c[k] < lo) lo = c[k]; const depth = 1 - lo / H; if (!(depth >= dMin && depth <= dMax)) return null;
  if (!(c[t] > H && c[t] <= H * (1 + zone))) return null; const av = avgVol(v, t, Math.min(50, t - f0), 20); if (av === null || !(v[t] >= volX * av)) return null;
  return { H, depth, len: t - h, volX: v[t] / av }; }
// exit session of a buy at the open of k: the first close <= (1 - stop) x entry, else k + hold - 1 (null entry -> null)
export function stopExit(o, c, k, hold, stop) { const e = o[k]; if (!(e > 0)) return null; const last = k + hold - 1; for (let q = k; q <= Math.min(last, c.length - 1); q++) if (c[q] > 0 && c[q] <= e * (1 - stop)) return q; return last; }

// ---------------- dividends (SEC XBRL, per share) ----------------
// rows [{ s, e, v, f }] of a per-share dividend tag (duration facts). Annual periods only. Each year y is compared with year y-1 as BOTH
// appear in the latest filing (filed before asOf) that reports both; returns { streak: consecutive raises ending at the latest year,
// last: latest year end } or null. A year missing from every filing ends the streak.
export function divStreak(rows, asOf) { const A = (rows || []).filter(x => x && x.s && x.e && x.f < asOf && ok(x.v)).filter(x => { const d = (ms(x.e) - ms(x.s)) / DAY + 1; return d >= 350 && d <= 380; });
  if (!A.length) return null; const ends = [...new Set(A.map(x => x.e))].sort().reverse(), last = ends[0]; let streak = 0;
  for (let j = 0; j + 1 < ends.length; j++) { const e1 = ends[j], gap = (ms(e1) - ms(ends[j + 1])) / DAY; if (gap < 350 || gap > 380) break; const e0 = ends[j + 1];
    const fs = A.filter(x => x.e === e1).map(x => x.f).filter(f => A.some(y => y.e === e0 && y.f === f)).sort(); if (!fs.length) break; const f = fs[fs.length - 1];
    const v1 = A.find(x => x.e === e1 && x.f === f).v, v0 = A.find(x => x.e === e0 && x.f === f).v; if (!(v0 > 0) || !(v1 > v0 * (1 + 1e-6))) break; streak++; }
  return { streak, last }; }
// interest-bearing debt at the latest balance sheet known before asOf. D = { tag: rows [{ e, v, f }] }: LongTermDebt (incl. current) if
// reported for that date, else the parts (non-current + current (or DebtCurrent) + short-term borrowings); a company that never reported
// any debt item before asOf has none (0); one that did but not for the latest date -> null (unknown)
export function debtAt(Dt, asOf) {
  const all = Object.values(Dt || {}).flat().filter(x => x && x.f < asOf && ok(x.v)); if (!all.length) return 0; const E = all.reduce((m, x) => x.e > m ? x.e : m, '');
  const at = (k) => { const r = (Dt[k] || []).filter(x => x.f < asOf && x.e === E && ok(x.v)); if (!r.length) return null; return r.reduce((a, b) => b.f >= a.f ? b : a).v; };
  const tot = at('LongTermDebt'), stb = at('ShortTermBorrowings') || 0; if (tot !== null) return tot + stb;
  const nc = at('LongTermDebtNoncurrent'), cur = at('LongTermDebtCurrent'), dc = at('DebtCurrent'); if (nc === null && cur === null && dc === null && at('ShortTermBorrowings') === null) return null;
  return (nc || 0) + (cur !== null ? cur : dc || 0) + stb; }

// ---------------- calendar / splits ----------------
// FOMC trades on a session list D: [{ t: eve index (bought at its close), x: statement-day index }] for statement days inside D
export function fomcTrades(D, days = FOMC) { const o = []; for (const d of days) { const x = D.indexOf(d); if (x > 0) o.push({ t: x - 1, x }); } return o; }
// splits [{ sym, d (execution date), from, to }]: forward splits that are the symbol's first split of any kind in the 3 years before
export function firstSplits(splits, from = '0000') { const by = new Map(); for (const s of splits) if (s && s.sym && s.d) (by.get(s.sym) || by.set(s.sym, []).get(s.sym)).push(s);
  const out = []; for (const [sym, a] of by) { a.sort((x, y) => x.d < y.d ? -1 : 1); for (let i = 0; i < a.length; i++) { const s = a[i]; if (!(s.to > s.from) || s.d < from) continue; const lim = addDays(s.d, -3 * 365);
    if (a.slice(0, i).some(q => q.d >= lim && q.d < s.d)) continue; if (a.slice(0, i).some(q => q.d === s.d)) continue; out.push({ sym, d: s.d, ratio: s.to / s.from }); } }
  return out.sort((x, y) => x.d < y.d ? -1 : 1); }

// ---------------- library pre-registration (idempotent) ----------------
export function preRegister(LB, day = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, a] of Object.entries(ANGLES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Untested angles', name: a.name, explain: a.rule + ' Source(s): ' + a.papers.map(p => p.cite).join('; ') + '. Reported: ' + a.reported + '.', status: 'pre-registered ' + day + ' (angles lab); 5-year one-shot pending', agent: 'angles', libraryCheck: a.lib,
      sources: a.papers.filter(p => p.url).map(p => p.url), note: 'Pre-registered ' + day + ' BEFORE any run (angles-core.mjs = the exact rule; one version; hold ' + a.hold + ' sessions). 5-year one-shot by angles-lab.mjs, first complete verdict frozen in data/angles-lab.json; forward paper lane (data/angles-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  for (const [id, a] of Object.entries(INFO)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Untested angles', name: a.name, explain: a.rule, status: 'pre-registered ' + day + ' (angles lab); information only (one path, no statistics)', agent: 'angles', libraryCheck: a.lib, note: 'Information only, never a buy signal.' }); ch++; }
  if (ch) LB.updated = day; return ch; }
