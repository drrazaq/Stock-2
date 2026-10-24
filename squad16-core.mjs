// SQUAD 16 CORE (24 Oct 2026; squad16-lab.mjs uses it). "WHERE WINNING STOCK METHODS ARE PUBLISHED" - a wide sweep of books, fund
// rulebooks, screen sites, quant blogs and papers, decoded faithfully and tested once. Pure functions, no network, no files.
// test/squad16-core.test.mjs. Long only; no leverage; no shorting; never places an order.
//
// THE SWEEP (sources read 24 Oct 2026; the full source table with the claimed results is in SOURCES below and in data/squad16-lab.json):
// chosen = published, exact, US stocks, long-only, large / mid caps, holds of weeks to months, and NOT already in data/strategy-library.json
// (V6 / DEC2-GREEN magic formula = an old weekly-researcher check / "needs data"; ANOM-GP, ANOM-QMJ, ANOM-INDMOM, ANOM-LOWVOL, ANOM-EAP
// tested the anomalies on ALL liquid stocks, top 10% equal weight, fixed 21-63 holds; DEC2-OSH / DEC2-LYNCH "needs data"; T10 / A-ROT2 dual
// momentum / Faber timing; SQ5-QUAL20 ROIC + FCF; SQ6-MTUM / QMOM / CLENOW momentum funds). What is NEW here: the published methods as
// their authors run them - large-cap universes by point-in-time market value, their own review calendars, their own selection counts,
// held while selected (a basket), and judged as a basket (portfolio vs SPY per half) as well as per trade.
// Not testable here (recorded in SOURCES with the reason): IBD 50 / CAN SLIM ratings (proprietary EPS / composite ratings), Zacks Rank
// (needs the history of analyst estimate revisions; ANOM-REVISION waits for it), Validea guru models (exact thresholds behind a paywall),
// Quantified Strategies (paywalled rules), Kevin Davey / Andrea Unger (futures), Tom Hougaard (indices), Patrick Boyle / Ben Felix
// (commentary and factor ETFs, no stock rule), SMB Capital stocks in play / Jeff Sun / Oliver Kell (intraday and swing setups; squad 2 and
// the decoded lanes lost after costs), Rayner Teo (moving-average rules already in T4-T17).
//
// PRE-REGISTERED 24 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids SQ16-*; squad16-lab.mjs writes the same text into
// data/strategy-library.json before computing anything). Each rule is run ONCE on the 5-year window; the first complete verdict is frozen
// in data/squad16-lab.json firstRun (first-run.mjs freezeEach). No tuning on results.
//
// COMMON (all rules):
//   UNIVERSE = the N largest US operating companies by point-in-time market value at the review close (Squad 5 / 11 / 14 market value:
//     squad5-core capAt - close as traded x the SEC share count known 30+ days earlier, liquid (close >= 5 USD, 20-session traded value
//     >= 5M USD), dead stocks included, the historical Form 3/4/5 ticker -> SEC company map (never today's ticker list), one ticker per
//     company, US domicile, no 20-F / 40-F filers). FINANCIALS = SEC SIC 6000-6999; UTILITIES = 4900-4999.
//   FUNDAMENTALS: SEC XBRL company facts, POINT IN TIME: a figure counts only if its filing date is before the review date (value-core
//     ttmAt / instantAt). TTM = trailing twelve months. A TTM figure whose period ended more than 200 days before the review is missing.
//     EBIT = TTM OperatingIncomeLoss. EV = market value + debt - cash (squad5-core debtCashAt). Year-ago figures = the same item for the
//     period ending 365 +- 20 days earlier, also filed before the review.
//   REVIEWS: quarterly = the last session of March, June, September, December; semi-annual = May and November; monthly = every month end.
//   BASKET TRADES (amended 24 Oct 2026 before any result: the first data check stopped on a missing constant, nothing was computed): a
//     basket is judged per REVIEW PERIOD, as Squad 5's baskets were (periodPieces): every stock held after review j is one trade, bought at
//     the open after review j and sold at the open after review j+1 (a stock that stops trading: its last close). Judging only whole
//     holdings would leave out the holdings still open today, and those are not a random sample (a momentum name stays because it kept
//     rising; a value name leaves because it rose): splitting at every review judges every period the basket was held. Each period pays
//     the full 0.8% (1.2% stress) as the system standard requires (a real basket that keeps a stock pays nothing: the PORTFOLIO test below
//     carries only the real trading cost). The period after the newest review is open (paper lane).
//   SLEEVES (MAGIC, CORNER: the authors hold each pick ONE YEAR): every quarterly review buys a new sleeve of the best-ranked stocks not
//     held in the three younger sleeves; a sleeve is sold at the next open after the review four quarters later, unless that review picks
//     the stock again into the new sleeve (then it is simply kept).
//   COST 0.8% round trip per trade (1.2% stress). Halves by the entry review date (before / from 2024-01-01). JUDGED with hold-core
//     judgeHold (value-core tier-2 + the long-hold gate) on both halves: > 0 after 0.8% and 1.2%, better than the average liquid stock
//     bought and sold at the same moments (yardstick capBoth, +300% cap on both, AUD-1), better than the same stock held as long on its
//     other days, > 0 without its 2 best, 20+ trades and 3+ blocks (63 sessions) per half, block t >= 2.5, and return per year of capital
//     tied up above SPY's over the same days in both halves.
//   PORTFOLIO (every basket rule; part of the rule, so it gates scan.mjs): one account from 1 at the first review, 0.4% cost on the money
//     of every buy and every sale (stress 0.6%), cash at 0%, daily marks; each new holding = w of the account marked at the previous close
//     (bought with the cash there is): w = 1 / the rule's target count (MAGIC 1/40, CORNER 1/52, MSCIQ: its index weight, see the rule).
//     Halves = first review to the last close of 2023 / from there to the newest close; CAGR and max drawdown vs SPY and SPUS (price only);
//     beatsSpy = CAGR above SPY's.
import { halfOf as halfOf14, pathStats, yearTable, tryWouldQualify } from './squad14-core.mjs';
export { pathStats, yearTable, tryWouldQualify };
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', YEAR = 252, SIDE = 0.004, SIDE_STRESS = 0.006, STALE = 200;
export const halfOf = halfOf14;
const S = (who, url, claim, costs, oos) => ({ who, url, claim, costs, oos });
export const RULES = {
  'SQ16-MAGIC': { name: 'Greenblatt magic formula (EBIT/EV + return on capital, 1000 largest, 10 a quarter, each held a year)', kind: 'sleeve', review: 'quarterly', uni: 1000, sleeveN: 10, sleeves: 4, target: 40, block: 63, replication: 'partial',
    source: S('Joel Greenblatt, The Little Book That Beats the Market (2005/2010); magicformulainvesting.com', 'https://www.magicformulainvesting.com/', 'book: top 30 of the 3,500 largest +30.8%/yr 1988-2004 vs S&P 500 +12.4%; 1,000 largest +22.9%/yr. Schwartz & Hanauer (as retyped by quant-investing.com) 2000-2022: top 40 ex-micro/ex-financials +17.2%/yr vs +8.0% value-weighted universe', 'no costs stated', 'the 2000-2022 study is after the book (out of sample); it lagged 2018-2020'),
    rule: 'Quarterly review. Universe: the 1000 largest, financials and utilities out. Earnings yield = EBIT / EV (EV > 0); return on capital = EBIT / (net working capital + net fixed assets), net working capital = (current assets - cash) - (current liabilities - current debt) floored at 0, net fixed assets = net property, plant and equipment; EBIT > 0 and capital > 0 needed. Rank each (1 = best), add the ranks, lowest sum first (ties: higher earnings yield). Each review buys the 10 best-ranked not held in the three younger sleeves; each sleeve is held one year (sold at the next open after the review four quarters later unless re-picked). About 40 holdings.',
    deviations: 'EBIT = operating income (no add-backs); a quarterly sleeve of 10 instead of "5-7 every 2-3 months"; market-value universe instead of the site\'s 50M+ screen (the book\'s 1000-largest version).' },
  'SQ16-ACQM': { name: 'Carlisle Acquirer\'s Multiple (30 cheapest by EV / EBIT among the 1000 largest, quarterly)', kind: 'basket', review: 'quarterly', uni: 1000, n: 30, target: 30, block: 63, replication: 'partial',
    source: S('Tobias Carlisle, Deep Value (2014) / The Acquirer\'s Multiple (2017); acquirersmultiple.com; Formula Investing paper as retyped by quant-investing.com', 'https://www.quant-investing.com/blog/acquirers-multiple-backtest-results-2000-2022/', '2000-2022: 40 cheapest by EV/operating earnings, quarterly, ex-micro/ex-financials +14.2%/yr vs +7.2% (value-weighted, capped)', 'no costs stated', 'partly after the book; drawdowns ~53%'),
    rule: 'Quarterly review. Universe: the 1000 largest, financials and utilities out. Acquirer\'s multiple = EV / EBIT with EBIT > 0 and EV > 0. Hold the 30 with the lowest multiple (ties: larger EBIT first), equal weight; sold when no longer among the 30 at a review.',
    deviations: 'EBIT = operating income (Carlisle\'s "operating earnings" adds back depreciation details); equal weight (the paper value-weights with a cap); 30 names (the site\'s screens show 30).' },
  'SQ16-QVAL': { name: 'Gray & Carlisle Quantitative Value (cheapest 10% by EV/EBIT, then the better half by Piotroski F-score, quarterly)', kind: 'basket', review: 'quarterly', uni: 1000, target: 45, block: 63, replication: 'partial',
    source: S('Wesley Gray & Tobias Carlisle, Quantitative Value (2012); Alpha Architect QVAL ETF process (QuantRocket summary)', 'https://www.quantrocket.com/codeload/qval/qval/Introduction.ipynb', 'book: 1974-2011 back test well ahead of the S&P 500 (not verified here); QVAL ETF live since 2014', 'book: no trading costs; the ETF is net of fees', 'the ETF since 2014 is out of sample'),
    rule: 'Quarterly review. Universe: the 1000 largest, financials, utilities and REITs (SIC 6798, inside financials) out. Keep the cheapest 10% (ceil) by EV / EBIT among those with EBIT > 0 and EV > 0; of them hold the better half (ceil) by Piotroski F-score (9 tests, each 1 point: net income > 0; operating cash flow > 0; net income / assets up vs a year earlier; operating cash flow > net income; long-term debt / assets down; current ratio up; no common stock issued (TTM proceeds 0 or missing); gross margin up; revenue / assets up; 6+ of the 9 must be computable, a test that cannot be computed scores 0); ties: cheaper first. Equal weight; sold when no longer selected.',
    deviations: 'Quality = the F-score only (the book adds franchise power: 8-year ROA / margin stability, not available on a 5-year window); EBIT = operating income; universe = 1000 largest (QVAL: top 60% of NYSE by size).' },
  'SQ16-GPVAL': { name: 'Novy-Marx profitable value (gross profit / assets rank + book / market rank, 50 of the 500 largest, quarterly)', kind: 'basket', review: 'quarterly', uni: 500, n: 50, target: 50, block: 63, replication: 'partial',
    source: S('Robert Novy-Marx (2013) The other side of value: the gross profitability premium, JFE 108(1) (Alpha Architect summary)', 'https://alphaarchitect.com/combining-value-and-profitability-factors-to-improve-performance/', 'profitability 0.31%/month, value 0.41%/month, combined 0.71%/month long-short 1962-2010 (Sharpe 0.85); works "even among the largest, most liquid stocks"', 'gross of costs', 'later: value lost ~60% 2017-2020 while profitability held; the library\'s all-stock ANOM-GP was rejected'),
    rule: 'Quarterly review. Universe: the 500 largest, financials out. GP/A = TTM gross profit (or revenue - cost of revenue) / latest total assets; B/M = latest stockholders\' equity / market value; both known and equity > 0. Score = percentile rank of GP/A + percentile rank of B/M (each 0..1 within the eligible set); hold the 50 highest (ties: higher GP/A), equal weight; sold when no longer among the 50.',
    deviations: 'Long only (the paper is long-short); quarterly instead of annual / monthly; a fixed 50 instead of the top tercile / decile.' },
  'SQ16-MSCIQ': { name: 'MSCI USA Quality method (iShares QUAL): ROE, low debt, stable earnings; 125 of the 600 largest, May/November, index-weighted', kind: 'basket', review: 'semiannual', uni: 600, n: 125, buffer: 150, target: 125, block: 63, replication: 'proxy',
    source: S('MSCI Quality Indexes Methodology (May 2013 / 2022): z-scores of ROE, debt/equity, earnings variability; semi-annual May/Nov; weight = quality score x market weight, 5% cap', 'https://www.msci.com/eqb/methodology/meth_docs/MSCI_Quality_Indices_Methodology.pdf', 'MSCI reports long-run outperformance of the parent index (QUAL ETF live since 2013)', 'index (no costs); ETF net of fees', 'live since 2013'),
    rule: 'Reviews at the last session of May and November. Universe: the 600 largest. ROE = TTM net income / latest stockholders\' equity (equity > 0; required); D/E = debt / equity; earnings variability = standard deviation of the year-on-year growth of annual net income ((NI_y - NI_y-1) / |NI_y-1|) over up to the last 5 fiscal years filed before the review (3+ growth values). Each variable winsorised at its 5th / 95th percentile, z-scored; D/E and variability negated; composite = the average of the available z (ROE + at least one other); quality score = 1 + z when z >= 0, 1 / (1 - z) when z < 0. Select the 125 best composites; a current holding stays while it ranks in the best 150 (MSCI\'s 20% buffer), the rest filled from the top. Per trade equal weight; in the PORTFOLIO each new holding gets its index weight (quality score x market value, normalised over the 125, capped at 5%).',
    deviations: 'Net income instead of EPS (no per-share history needed); debt = squad5 debtCashAt; 125 is MSCI USA Quality\'s usual count (fixed number set at launch); 600 largest = MSCI USA proxy; weights fixed at entry, not re-set at each review.' },
  'SQ16-SHYLD': { name: 'Meb Faber shareholder yield (dividends + net buybacks + debt paydown, top 100 of the 1000 largest, quarterly)', kind: 'basket', review: 'quarterly', uni: 1000, n: 100, target: 100, block: 63, replication: 'partial',
    source: S('Meb Faber, Shareholder Yield (2013); Cambria SYLD (top 100 by shareholder yield among large US stocks, plus value / quality screens)', 'https://www.etfstrategy.com/cambrias-new-shareholder-yield-etf-syld-targets-dividends-buybacks-and-debt-paydowns-41256/', 'book: high shareholder-yield portfolios beat the market and high dividend yield by a substantial margin (O\'Shaughnessy WWWS: shareholder yield one of the best value measures)', 'book back tests gross; ETF net of fees', 'SYLD live since 2013'),
    rule: 'Quarterly review. Universe: the 1000 largest, financials out. Shareholder yield = (TTM dividends paid + TTM common stock repurchased - TTM common stock issued) / market value + (debt a year earlier - debt now) / market value (debt paydown; 0 when either debt is unknown); dividends / repurchases / issuance missing = 0; at least one of dividends or repurchases must be reported. Hold the 100 highest (ties: larger market value), equal weight; sold when no longer among the 100.',
    deviations: 'No value / quality composite (SYLD adds them after the yield rank); 1000 largest instead of SYLD\'s size floor.' },
  'SQ16-VALMOM': { name: 'AQR value + momentum combined (book/market rank + 12-1 momentum rank, 100 of the 1000 largest, quarterly)', kind: 'basket', review: 'quarterly', uni: 1000, n: 100, target: 100, block: 63, replication: 'partial',
    source: S('Asness, Moskowitz & Pedersen (2013) Value and Momentum Everywhere, Journal of Finance 68(3)', 'https://www.johnhcochrane.com/s/Value-and-Momentum-Everywhere.pdf', '50/50 value-momentum combination has a much higher Sharpe than either alone (negative correlation) across markets 1972-2011', 'gross of costs', 'AQR funds since; value weak 2017-2020'),
    rule: 'Quarterly review. Universe: the 1000 largest (all sectors). Value = latest stockholders\' equity / market value (equity > 0); momentum = close 21 sessions before / close 252 sessions before - 1. Score = percentile rank of value + percentile rank of momentum (each 0..1 among stocks with both); hold the 100 highest (ties: higher momentum), equal weight; sold when no longer among the 100.',
    deviations: 'Long only, quarterly (the paper is long-short, monthly, rank-weighted).' },
  'SQ16-CORNER': { name: 'O\'Shaughnessy Cornerstone Growth (price/sales < 1.5, earnings up, top by 12-month price strength; each held a year)', kind: 'sleeve', review: 'quarterly', uni: 1000, sleeveN: 13, sleeves: 4, target: 52, block: 63, replication: 'partial',
    source: S('James O\'Shaughnessy, What Works on Wall Street (1996-2011 eds.), Cornerstone Growth (as coded by Validea)', 'https://www.validea.com/', 'book: Cornerstone Growth 1952-1996 ~+18%/yr vs ~+13% all stocks (not verified here); Validea runs it as a live model', 'gross of costs', 'later editions and Validea\'s model are partly out of sample'),
    rule: 'Quarterly review. Universe: the 1000 largest (all sectors). Eligible: price / sales = market value / TTM revenue < 1.5; TTM net income above the TTM net income a year earlier; 12-month price change (close / close 252 sessions before - 1) known. Rank by the 12-month price change (highest first). Each review buys the 13 best-ranked not held in the three younger sleeves (about 50 held, his number); each sleeve is held one year (sold at the next open after the review four quarters later unless re-picked).',
    deviations: 'Annual rebalance spread over 4 quarterly sleeves; his market-value floor (USD 150M+) replaced by the 1000 largest (the large-cap focus of this sweep).' },
  'SQ16-IND12': { name: 'Industry momentum 12-0 among the 500 largest (top 5 SIC-2 industries by 12-month return, monthly)', kind: 'basket', review: 'monthly', uni: 500, nInd: 5, minMembers: 5, target: null, block: 63, replication: 'partial',
    source: S('Moskowitz & Grinblatt (1999) Do industries explain momentum? JF 54(4); Dikhit (2026) The informational role of the most recent month in industry-level momentum, SSRN 6009657 (Swedroe summary)', 'https://alphaarchitect.com/skip-month-mystery/', 'top 5 of 48 industries, 12-0 (incl. last month) about +1.3% to +1.9%/month 1975-2024, slightly better than 12-1', 'no costs', 'the 2026 paper covers 1975-2024 (in sample); ANOM-INDMOM (6-month, all liquid stocks, hold 21) was rejected here'),
    rule: 'Monthly review (every month end with 252 sessions of history). Universe: the 500 largest. Industry = SEC SIC first 2 digits (99, 67 and missing out); industries with 5+ members in the universe. Industry return = market-value-weighted average of members\' 12-month return (close / close 252 sessions before - 1, including the last month). Hold every universe member of the 5 industries with the highest return (equal weight); a stock is sold when its industry leaves the top 5 or it leaves the universe.',
    deviations: 'SIC 2-digit groups instead of Fama-French 48; members of the 500 largest only; equal weight across held stocks (the paper equal-weights industries).' },
  'SQ16-RSNH': { name: 'IBD / Moglen "RS line new high before price" (blue dot) on the 500 largest, hold 63', kind: 'daily', uni: 500, hold: 63, block: 63, replication: 'proxy',
    source: S('Investor\'s Business Daily (MarketSurge "RS line blue dot": the stock / S&P 500 line at a 52-week high before the price); Richard Moglen / TraderLion teach it as a leading sign; TradingView "Relative Strength Line with NewHigh Blue Dot"', 'https://www.tradingview.com/script/11Di8Fti-ChillLax-Relative-Strength-Line-with-NewHigh-NewLow-Blue-Dot', 'no numeric record published; taught as a mark of the best leaders before their breakouts', 'n/a', 'n/a'),
    rule: 'Daily at the close of t. Universe: the 500 largest at the prior month end, liquid at t. RS line = close / SPY close. Signal: the RS line closes above its highest value of the previous 251 sessions (240+ present) AND did not on any of the 20 sessions before (fresh) AND the close is NOT above its own highest close of the previous 251 sessions (price not yet at a new high) AND the close is within 15% of that high AND above its 50-session average. Buy the next open; sell at the close of session 63; one open trade per stock; no stop.',
    deviations: 'No base / volume pattern check (the discretionary part of the method); fixed 63-session hold (no published exit).' },
};
export const IDS = Object.keys(RULES), BASKET_IDS = IDS.filter(id => RULES[id].kind !== 'daily');
// the sources read and not tested (why), for the report's source table
export const NOT_TESTED = [
  { who: 'IBD 50 / CAN SLIM (William O\'Neil, IBD; FFTY ETF)', url: 'https://www.innovatoretfs.com/pdf/FFTY_Summary_Prospectus.pdf', why: 'proprietary Composite / EPS / RS ratings; CAN SLIM (DEC-CANSLIM) queued in the decoded lane; FFTY has lagged the S&P 500 since 2015' },
  { who: 'Zacks Rank (estimate-revision ranking)', url: 'https://www.zacks.com/about-us.php', why: 'needs the history of consensus revisions (none before Oct 2026 here; ANOM-REVISION waits); claimed #1 Rank +~24%/yr since 1988 is Zacks\' own, unaudited' },
  { who: 'Validea guru models (Lynch P/E/Growth, Graham, Buffett-Hagstrom)', url: 'https://www.validea.com/peter-lynch', why: 'exact thresholds behind the paywall; Lynch model claims +1,525% since 2003 (model returns, no costs, partly back-tested); Lynch needs EPS growth history (DEC2-LYNCH)' },
  { who: 'Quantified Strategies (S&P 500 momentum / pullback systems)', url: 'https://quantifiedstrategies.substack.com/p/s-and-p-500-momentum-strategy-as-643', why: 'rules paywalled' },
  { who: 'Kevin Davey, Andrea Unger (World Cup futures champions)', url: 'https://www.kjtradingsystems.com/', why: 'futures systems, not US stocks' },
  { who: 'Tom Hougaard', url: 'https://www.tradertom.com/', why: 'index futures day trading' },
  { who: 'Patrick Boyle, Ben Felix / Rational Reminder', url: 'https://rationalreminder.ca/', why: 'commentary and factor-ETF investing; their stock factors (value, profitability, momentum) are covered by GPVAL / VALMOM / MSCIQ here' },
  { who: 'SMB Capital (stocks in play), Jeff Sun, Oliver Kell, Rayner Teo', url: 'https://www.smbtraining.com/', why: 'intraday / short swing setups and simple moving-average rules: tested in squad 2, the decoded lanes and T4-T17; they lost after costs' },
  { who: 'Antonacci Global Equities Momentum / Faber timing', url: 'https://www.optimalmomentum.com/', why: 'asset-class timing (SPY / EFA / bonds), not stock picking; the halal SPUS version (A-ROT2) was rejected' },
  { who: 'Quantpedia / Robot Wealth equity anomaly lists', url: 'https://quantpedia.com/equity-anomalies-persist-in-international-markets/', why: 'their most-cited equity anomalies (momentum, value, low vol, accruals, asset growth, seasonality, EAP, PEAD) are already ANOM-* in the library; the large-cap published versions are tested here' },
];
// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((u, w) => u + (w - m) ** 2, 0) / (a.length - 1)); };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
const cmpKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// percentile (0..1, ties averaged) of each finite value; rows [{ key, v }] -> Map key -> pct
export function pctRank(rows) { const a = rows.filter(r => ok(r.v)).sort((x, y) => x.v - y.v), n = a.length, m = new Map(); let j = 0;
  while (j < n) { let e = j; while (e + 1 < n && a[e + 1].v === a[j].v) e++; const p = n > 1 ? ((j + e) / 2) / (n - 1) : 1; for (let q = j; q <= e; q++) m.set(a[q].key, p); j = e + 1; } return m; }
// winsorise at the p / 1-p quantiles (nearest rank), then z-score; values null stay null
export function winsorZ(vals, p = 0.05) { const v = vals.filter(ok).sort((a, b) => a - b); if (v.length < 3) return vals.map(() => null);
  const q = (f) => v[Math.min(v.length - 1, Math.max(0, Math.round(f * (v.length - 1))))], lo = q(p), hi = q(1 - p), w = vals.map(x => ok(x) ? Math.min(hi, Math.max(lo, x)) : null);
  const ww = w.filter(ok), m = mean(ww), s = sd(ww); return w.map(x => ok(x) && s > 0 ? (x - m) / s : (ok(x) ? 0 : null)); }
export const msciScore = (z) => z >= 0 ? 1 + z : 1 / (1 - z);
export const finSic = (sic) => { const n = +sic; return !!sic && isFinite(n) && n >= 6000 && n <= 6999; };
export const utilSic = (sic) => { const n = +sic; return !!sic && isFinite(n) && n >= 4900 && n <= 4999; };
export const sic2 = (sic) => { const s = String(sic || '').replace(/\D/g, ''); if (!s || +s === 0) return null; const x = s.padStart(4, '0').slice(0, 2); return x === '99' || x === '67' ? null : x; };
// ---------------- the methods' measures (pure) ----------------
// Greenblatt: { ebit, cap, debt, cash, ca, cl, dcur, ppe } -> { ey, roc } (null where not computable)
export function magicMetrics({ ebit, cap, debt, cash, ca, cl, dcur, ppe }) {
  if (!ok(ebit) || !(ebit > 0) || !(cap > 0)) return { ey: null, roc: null }; const ev = cap + (ok(debt) ? debt : 0) - (ok(cash) ? cash : 0);
  const ey = ev > 0 ? ebit / ev : null; let roc = null;
  if (ok(ca) && ok(cl) && ok(ppe)) { const nwc = Math.max(0, (ca - (ok(cash) ? cash : 0)) - (cl - (ok(dcur) ? dcur : 0))), capi = nwc + ppe; roc = capi > 0 ? ebit / capi : null; }
  return { ey, roc }; }
// rows [{ key, ey, roc }] -> keys ranked best first by the sum of ranks (1 = best; ties in a rank share the lower rank number)
export function magicRank(rows) { const a = rows.filter(r => ok(r.ey) && ok(r.roc)); const rk = (f) => { const s = [...a].sort((x, y) => f(y) - f(x)), m = new Map(); let prev = null, rank = 0; s.forEach((r, j) => { if (f(r) !== prev) { rank = j + 1; prev = f(r); } m.set(r.key, rank); }); return m; };
  const A = rk(r => r.ey), B = rk(r => r.roc); return a.map(r => ({ key: r.key, s: A.get(r.key) + B.get(r.key), ey: r.ey })).sort((x, y) => x.s - y.s || y.ey - x.ey || cmpKey(x.key, y.key)).map(r => r.key); }
// EV / EBIT (EBIT > 0, EV > 0) or null
export function acqMultiple({ ebit, cap, debt, cash }) { if (!ok(ebit) || !(ebit > 0) || !(cap > 0)) return null; const ev = cap + (ok(debt) ? debt : 0) - (ok(cash) ? cash : 0); return ev > 0 ? ev / ebit : null; }
// Piotroski F-score from now / year-ago figures. x = { ni, cfo, assets, ni0, assets0, ltd, ltd0, ca, cl, ca0, cl0, iss, gp, rev, gp0, rev0 }
// Returns { score, have } (have = computable tests); score null when have < 6
export function fScore(x) { let s = 0, h = 0; const t = (cond) => { if (cond === null) return; h++; if (cond) s++; }, d = (a, b) => ok(a) && ok(b) && b !== 0 ? a / b : null;
  t(ok(x.ni) ? x.ni > 0 : null); t(ok(x.cfo) ? x.cfo > 0 : null);
  const roa = d(x.ni, x.assets), roa0 = d(x.ni0, x.assets0); t(ok(roa) && ok(roa0) ? roa > roa0 : null);
  t(ok(x.cfo) && ok(x.ni) ? x.cfo > x.ni : null);
  const lev = d(x.ltd, x.assets), lev0 = d(x.ltd0, x.assets0); t(ok(lev) && ok(lev0) ? lev < lev0 : null);
  const cr = d(x.ca, x.cl), cr0 = d(x.ca0, x.cl0); t(ok(cr) && ok(cr0) ? cr > cr0 : null);
  t(!(ok(x.iss) && x.iss > 0));
  const gm = d(x.gp, x.rev), gm0 = d(x.gp0, x.rev0); t(ok(gm) && ok(gm0) ? gm > gm0 : null);
  const at = d(x.rev, x.assets), at0 = d(x.rev0, x.assets0); t(ok(at) && ok(at0) ? at > at0 : null);
  return { score: h >= 6 ? s : null, have: h }; }
// QVAL: rows [{ key, mult, f }] -> the cheapest frac (ceil) by mult, then the better half (ceil) by F-score (ties: cheaper)
export function qvalPick(rows, frac = 0.10, keep = 0.5) { const a = rows.filter(r => ok(r.mult) && r.mult > 0).sort((x, y) => x.mult - y.mult || cmpKey(x.key, y.key)); if (a.length < 20) return [];
  const cheap = a.slice(0, Math.ceil(a.length * frac)).filter(r => ok(r.f)); return [...cheap].sort((x, y) => y.f - x.f || x.mult - y.mult || cmpKey(x.key, y.key)).slice(0, Math.ceil(cheap.length * keep)).map(r => r.key); }
// two-rank composite: rows [{ key, a, b, tie }] -> top n by pct(a) + pct(b) (rows need both); ties by tie (higher first), then key
export function rankSumPick(rows, n) { const r = rows.filter(x => ok(x.a) && ok(x.b)); const A = pctRank(r.map(x => ({ key: x.key, v: x.a }))), B = pctRank(r.map(x => ({ key: x.key, v: x.b })));
  return r.map(x => ({ key: x.key, s: A.get(x.key) + B.get(x.key), tie: ok(x.tie) ? x.tie : -Infinity })).sort((x, y) => y.s - x.s || y.tie - x.tie || cmpKey(x.key, y.key)).slice(0, n).map(x => x.key); }
// top n by v (desc; ties by tie desc, then key)
export function topBy(rows, n) { return rows.filter(x => ok(x.v)).sort((x, y) => y.v - x.v || (ok(y.tie) ? y.tie : 0) - (ok(x.tie) ? x.tie : 0) || cmpKey(x.key, y.key)).slice(0, n).map(x => x.key); }
// earnings variability: annual values [{ e, v }] (fiscal years, oldest first) -> sd of YoY growth over the last `years` growths (3+ needed)
export function earnVar(annual, years = 5) { const a = annual.filter(x => ok(x.v)); const g = []; for (let j = 1; j < a.length; j++) if (a[j - 1].v !== 0) g.push((a[j].v - a[j - 1].v) / Math.abs(a[j - 1].v)); const w = g.slice(-years); return w.length >= 3 ? sd(w) : null; }
// MSCI quality: rows [{ key, roe, de, ev, cap }] -> ranked [{ key, z, score }] best first (ROE required + 1 more)
export function msciRank(rows) { const r = rows.filter(x => ok(x.roe)); const zr = winsorZ(r.map(x => x.roe)), zd = winsorZ(r.map(x => ok(x.de) ? x.de : null)), zv = winsorZ(r.map(x => ok(x.ev) ? x.ev : null));
  const out = []; r.forEach((x, j) => { const parts = [zr[j], ok(zd[j]) ? -zd[j] : null, ok(zv[j]) ? -zv[j] : null].filter(ok); if (parts.length < 2) return; const z = mean(parts); out.push({ key: x.key, z, score: msciScore(z), cap: x.cap }); });
  return out.sort((a, b) => b.z - a.z || cmpKey(a.key, b.key)); }
// buffer selection: ranked keys best first; held Set; n to hold; keep a holding while its rank <= buf
export function bufferPick(ranked, held, n, buf) { const pos = new Map(ranked.map((k, j) => [k, j])), keep = ranked.slice(0, buf).filter(k => held.has(k)).slice(0, n), out = [...keep];
  for (const k of ranked) { if (out.length >= n) break; if (!out.includes(k)) out.push(k); } return out.sort((a, b) => pos.get(a) - pos.get(b)); }
// index weights: rows [{ key, score, cap }] -> Map key -> weight (score x cap normalised, capped at `cap`, excess redistributed)
export function cappedWeights(rows, capW = 0.05) { let w = new Map(rows.map(r => [r.key, Math.max(0, r.score * r.cap)])); const tot = [...w.values()].reduce((a, b) => a + b, 0); if (!(tot > 0)) return new Map(rows.map(r => [r.key, 1 / rows.length]));
  for (const [k, v] of w) w.set(k, v / tot); for (let it = 0; it < 50; it++) { let over = 0, freeSum = 0; for (const v of w.values()) { if (v > capW) over += v - capW; else freeSum += v; } if (over < 1e-12) break; for (const [k, v] of w) w.set(k, v > capW ? capW : v + over * v / freeSum); } return w; }
// shareholder yield
export function shYield({ div, rep, iss, cap, debt, debt0 }) { if (!(cap > 0) || (!ok(div) && !ok(rep))) return null; const pay = (ok(div) ? Math.abs(div) : 0) + (ok(rep) ? Math.abs(rep) : 0) - (ok(iss) ? Math.abs(iss) : 0);
  const paydown = ok(debt) && ok(debt0) ? debt0 - debt : 0; return pay / cap + paydown / cap; }
// industry momentum: rows [{ key, ind, cap, r }] -> the keys of the nInd industries (minMembers+) with the highest cap-weighted r
export function indPick(rows, nInd = 5, minMembers = 5) { const g = new Map(); for (const x of rows) { if (!x.ind) continue; (g.get(x.ind) || g.set(x.ind, []).get(x.ind)).push(x); }
  const ind = []; for (const [k, a] of g) { if (a.length < minMembers) continue; const v = a.filter(x => ok(x.r) && x.cap > 0), w = v.reduce((s, x) => s + x.cap, 0); if (!v.length || !(w > 0)) continue; ind.push({ k, r: v.reduce((s, x) => s + x.cap * x.r, 0) / w }); }
  ind.sort((a, b) => b.r - a.r || cmpKey(a.k, b.k)); const top = new Set(ind.slice(0, nInd).map(x => x.k)); return { industries: ind.slice(0, nInd), keys: rows.filter(x => top.has(x.ind)).map(x => x.key) }; }
// RS line blue dot at t: c = stock closes, m = SPY closes, s50 = stock's 50-session average
export function rsHighArr(c, m, look = 251, minHave = 240) { const n = c.length, o = new Uint8Array(n); const rs = new Float64Array(n).fill(NaN); for (let t = 0; t < n; t++) if (c[t] > 0 && m[t] > 0) rs[t] = c[t] / m[t];
  for (let t = look; t < n; t++) { if (!(rs[t] > 0)) continue; let mx = -Infinity, h = 0; for (let k = t - look; k < t; k++) if (rs[k] > 0) { h++; if (rs[k] > mx) mx = rs[k]; } if (h >= minHave && rs[t] > mx) o[t] = 1; } return o; }
export function blueDot(c, rsHi, s50, t, { look = 251, fresh = 20, within = 0.15 } = {}) { if (t < look || !rsHi[t] || !(c[t] > 0) || !(s50[t] > 0) || !(c[t] > s50[t])) return false;
  for (let k = Math.max(0, t - fresh); k < t; k++) if (rsHi[k]) return false; let mx = -Infinity, h = 0; for (let k = t - look; k < t; k++) if (c[k] > 0) { h++; if (c[k] > mx) mx = c[k]; }
  if (h < 240 || !(c[t] <= mx)) return false; return c[t] >= mx * (1 - within) * (1 - 1e-12); }
// ---------------- point-in-time fact helpers (facts = [{ s, e, v, f }]; a fact counts only if filed before asOf) ----------------
const dayN = (d) => Date.parse(d + 'T00:00:00Z') / 864e5;
// annual (350-380 day) values known before asOf: the latest-filed figure per fiscal year end, oldest first
export function annualVals(facts, asOf) { const m = new Map(); for (const x of facts || []) { if (!x || !x.s || !(x.f < asOf) || !ok(x.v)) continue; const d = dayN(x.e) - dayN(x.s) + 1; if (d < 350 || d > 380) continue; const o = m.get(x.e); if (!o || x.f >= o.f) m.set(x.e, { e: x.e, v: x.v, f: x.f }); }
  return [...m.values()].sort((a, b) => cmpKey(a.e, b.e)).map(({ e, v }) => ({ e, v })); }
// an instant (balance-sheet) value with period end within tol days of target, filed before asOf: the end nearest the target, latest filing
export function instantNear(facts, asOf, target, tol = 20) { let best = null; for (const x of facts || []) { if (!x || x.s || !(x.f < asOf) || !ok(x.v)) continue; const dd = Math.abs(dayN(x.e) - dayN(target)); if (dd > tol) continue;
    if (!best || dd < best.dd || (dd === best.dd && x.f >= best.f)) best = { dd, f: x.f, v: x.v, e: x.e }; } return best ? { end: best.e, val: best.v } : null; }
// ---------------- sleeves and holdings ----------------
// sleeve rule: ranked keys at each review (best first) -> held set at each review (Array of Sets) and the sleeve of each pick.
// review r buys the best `per` not held in sleeves r-(sleeves-1)..r-1 (sleeve r-sleeves expires now; its names may be re-picked)
export function sleeveHeld(rankedByReview, per, sleeves = 4) { const picks = [], held = [];
  for (let r = 0; r < rankedByReview.length; r++) { const young = new Set(); for (let q = Math.max(0, r - sleeves + 1); q < r; q++) for (const k of picks[q]) young.add(k);
    const p = []; for (const k of rankedByReview[r] || []) { if (p.length >= per) break; if (!young.has(k)) p.push(k); } picks.push(p);
    const h = new Set(p); for (const k of young) h.add(k); held.push(h); }
  return { picks, held }; }
// continuous holdings from the held sets: [{ key, a (review index of entry), b (review index whose next open sells; null = still held) }]
export function episodes(held) { const out = [], open = new Map();
  for (let r = 0; r < held.length; r++) { for (const [k, e] of [...open]) if (!held[r].has(k)) { e.b = r; out.push(e); open.delete(k); } for (const k of held[r]) if (!open.has(k)) open.set(k, { key: k, a: r, b: null }); }
  for (const e of open.values()) out.push(e); return out.sort((x, y) => x.a - y.a || cmpKey(String(x.key), String(y.key))); }
// one holding as a trade. S = { o, c } of the stock, last = its last session with a close, T = sessions. Buy the open of ta+1; sell the
// open of tb+1 (tb = the review that dropped it; null = still held). A stock that stops trading (last < T-6) before the sale: its last
// close. Returns { k, x, at, px0, px1, g, kind, days } | { open: true, k, px0 } | null (no open at ta+1)
export function episodeTrade(S, ta, tb, last, T) { const k = ta + 1; if (k > T - 1) return { open: true, k, px0: null, pending: true }; if (!(S.o[k] > 0)) return null; const px0 = S.o[k];
  const gone = last < T - 6, end = tb === null ? T - 1 : tb + 1;
  if (gone && last < end) { for (let q = last; q >= k; q--) if (S.c[q] > 0) return { k, x: q, at: 'c', px0, px1: S.c[q], g: S.c[q] / px0 - 1, kind: 'gone', days: q - k + 1 }; return { k, x: k, at: 'c', px0, px1: px0, g: 0, kind: 'gone', days: 1 }; }
  if (tb === null) return { open: true, k, px0 };
  for (let q = tb + 1; q < T && q <= tb + 10; q++) if (S.o[q] > 0) return { k, x: q, at: 'o', px0, px1: S.o[q], g: S.o[q] / px0 - 1, kind: 'dropped', days: q - k + 1 };
  if (tb + 1 > T - 1) return { open: true, k, px0 };
  for (let q = tb; q >= k; q--) if (S.c[q] > 0) return { k, x: q, at: 'c', px0, px1: S.c[q], g: S.c[q] / px0 - 1, kind: 'dropped', days: q - k + 1 }; return null; }
// ---------------- the trade-driven account (exits at the open or the close of the exit session) ----------------
// cands = [{ id, key, i, k (buy at its open), x (exit session; null = open at the data end), at ('o' | 'c'), w }]. Cost `side` per buy
// and per sale on the money traded. Session order: exits at the open, then buys at the open, then exits at the close, then the mark.
export function simAccount2({ T, start, cands, px, side = SIDE }) { const eq = new Float64Array(T).fill(NaN), H = new Map(), byK = new Map(), taken = [], skipped = { held: 0, cash: 0, noPrice: 0 }; let cash = 1, prevEq = 1;
  for (const c of cands) if (c.k >= start && c.k < T) (byK.get(c.k) || byK.set(c.k, []).get(c.k)).push(c);
  for (const a of byK.values()) a.sort((p, q) => (q.w || 0) - (p.w || 0) || cmpKey(String(p.id), String(q.id)));
  const lastC = (i, k) => { for (let q = Math.min(k, T - 1); q >= 0; q--) { const z = px.c(i, q); if (z > 0) return z; } return null; };
  const sell = (key, h, p) => { cash += (p > 0 ? h.sh * p : 0) * (1 - side); H.delete(key); };
  for (let k = start; k < T; k++) {
    for (const [key, h] of [...H]) if (h.x === k && h.at === 'o') sell(key, h, px.o(h.i, k) > 0 ? px.o(h.i, k) : lastC(h.i, k));
    for (const c of byK.get(k) || []) { if (H.has(c.key)) { skipped.held++; continue; } const p = px.o(c.i, k); if (!(p > 0)) { skipped.noPrice++; continue; }
      const v = Math.min(c.w * prevEq, cash / (1 + side)); if (!(v > 1e-9)) { skipped.cash++; continue; } cash -= v * (1 + side); H.set(c.key, { i: c.i, sh: v / p, x: c.x, at: c.at || 'c' }); taken.push(c.id); }
    for (const [key, h] of [...H]) if (h.x === k && h.at !== 'o') sell(key, h, lastC(h.i, k));
    let v = cash; for (const h of H.values()) { const p = lastC(h.i, k); v += p > 0 ? h.sh * p : 0; } eq[k] = v; prevEq = v; }
  return { eq, taken, skipped }; }
// ---------------- reporting ----------------
export function perYearOf(rows, key, cost) { const v = rows.filter(z => ok(z[key]) && z.days > 0); const y = v.reduce((a, z) => a + z.days / YEAR, 0); return v.length && y > 0 ? v.reduce((a, z) => a + z[key] - cost, 0) / y : null; }
export function byYear(rows) { const m = new Map(); for (const z of rows) { const y = z.sig.slice(0, 4); (m.get(y) || m.set(y, []).get(y)).push(z); }
  return Object.fromEntries([...m.entries()].sort().map(([y, a]) => [y, { n: a.length, avg: r4(mean(a.map(z => z.g - COST))), spy: r4(mean(a.filter(z => ok(z.spy)).map(z => z.spy))), avgStock: r4(mean(a.filter(z => ok(z.c)).map(z => z.c - COST))), beatsSpy: mean(a.map(z => z.g - COST)) > mean(a.filter(z => ok(z.spy)).map(z => z.spy)) }])); }
export function shape(tr, cost = COST) { const net = tr.map(z => z.g - cost), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), dd = [...tr.map(z => z.days)].sort((a, b) => a - b);
  return { n: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avg: tr.length ? r4(mean(net)) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, worst: net.length ? r4(Math.min(...net)) : null, medianDays: dd.length ? dd[dd.length >> 1] : null }; }
export function boardStats(rows) { const net = rows.map(r => r.g - COST), win = net.filter(x => x > 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => r.g - r.c))) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
// review sessions: month ends (t + 1 in a later month) whose month is in `months`; t >= minT
export function reviewEnds(D, months, minT = 0) { const o = []; for (let t = minT; t + 1 < D.length; t++) if (D[t + 1].slice(0, 7) !== D[t].slice(0, 7) && (!months || months.includes(+D[t].slice(5, 7)))) o.push(t); return o; }
export const MONTHS = { quarterly: [3, 6, 9, 12], semiannual: [5, 11], monthly: null };
// ---------------- library pre-registration (idempotent; before any computation) ----------------
const COMMON = 'Common (squad16-core.mjs header): universe = the N largest US operating companies by point-in-time market value at each review close (Squad 5 / 11 / 14 market value: SEC share count known 30+ days earlier x the close, dead stocks included, the historical Form 3/4/5 ticker map, US domicile, one ticker per company); SEC XBRL facts filed before the review only (TTM periods ended within 200 days). Baskets: bought at the next open after the review that selects them, held while selected, sold at the next open after the first review that drops them; sleeve rules hold each pick one year. Judged per REVIEW PERIOD (each stock held from the open after review j to the open after review j+1 is one trade, as Squad 5 periodPieces), so holdings still open today do not bias the result; every period pays the full 0.8% cost (1.2% stress); the portfolio test pays only real trades. Judged once (first complete run frozen in data/squad16-lab.json firstRun) with hold-core judgeHold on both halves (entry before / from 2024-01-01): > 0 after 0.8% and 1.2%, better than the average liquid stock at the same moments (both capped at +300%, AUD-1), better than the same stock held as long on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks per half, block t >= 2.5, return per year of capital tied up above SPY on the same days in both halves; baskets also as one account (0.4% per side) vs SPY and SPUS per half (gates scan.mjs).';
const CHECK = { 'SQ16-MAGIC': 'V6 (old weekly-researcher magic formula, no point-in-time EV, "not proven") and DEC2-GREEN ("needs data"): this is the first faithful test with SEC EBIT / EV / capital point in time.',
  'SQ16-ACQM': 'No EV/EBIT deep-value rule in the library (DEC2-OSH "needs data"; V-series value screens use P/E / P/B).', 'SQ16-QVAL': 'V13-V16 / B-FS2 (F-score on all stocks, no cheapness cut), DEC2-OSH (needs data).',
  'SQ16-GPVAL': 'ANOM-GP (GP/A alone, all liquid stocks, top 10%, hold 63: rejected); value alone V-series; the combination on the 500 largest is new.', 'SQ16-MSCIQ': 'SQ5-QUAL20 (ROIC + FCF margin, 20 names), ANOM-QMJ (all liquid stocks): MSCI\'s ROE / leverage / variability composite with buffer and index weights is new.',
  'SQ16-SHYLD': 'V11 (shrinking share count in a calm stock, failed discovery), SQ8-SHRINK, SQ1-BB* (buyback events): total payout + debt paydown yield on large caps is new.', 'SQ16-VALMOM': 'ANOM-MOM12 / SQ5-MOMBUF (momentum alone), V-series (value alone): the AQR combination is new.',
  'SQ16-CORNER': 'DEC2-OSH (trending value, needs data); no P/S + earnings-up + relative-strength rule in the library.', 'SQ16-IND12': 'ANOM-INDMOM (6-month, all liquid stocks, hold 21: rejected), T21 (failed discovery), SQ13-WAVE-BIG (breadth waves): 12-0 top-5 industries on the 500 largest held while top is new.',
  'SQ16-RSNH': 'DEC-VCP / DEC2-MINTT / ANOM-52WH use price highs; no RS-line-before-price rule in the library.' };
export function preRegister(LB, today = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Published winning methods, wide sweep (Squad 16)', name: r.name, explain: 'RULE: ' + r.rule + ' DEVIATIONS from the published method: ' + r.deviations + ' ' + COMMON, status: 'pre-registered ' + today + ' (squad 16); 5-year one-shot pending', agent: 'squad16', registered: today,
      hold: r.hold || 'while selected' + (r.kind === 'sleeve' ? ' (each sleeve one year)' : ''), who: r.source.who, replication: r.replication, sources: [r.source.url], claimed: r.source.claim, claimCosts: r.source.costs, claimOutOfSample: r.source.oos,
      libraryCheck: CHECK[id], note: 'Pre-registered ' + today + ' BEFORE any run (squad16-core.mjs = the exact rule; one version; 10 rules in all from a sweep of ~30 sources). 5-year one-shot by squad16-lab.mjs, first complete verdict frozen; forward paper lane (data/squad16-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
