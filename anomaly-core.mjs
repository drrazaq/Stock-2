// ANOMALY CORE (23 Oct 2026; owner: "find every documented way people make money in stocks and test it properly"). Pure functions, no
// network, no files. Used by anomaly-lab.mjs (one 5-year run per anomaly, first complete verdict frozen + a forward PAPER lane from Monday
// 26 Oct 2026) and test/anomaly-core.test.mjs. Long only; no leverage; no shorting; never places an order.
//
// PRE-REGISTERED 23 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids ANOM-*; the same text is written into
// data/strategy-library.json by anomaly-lab.mjs before its first computation). Common conventions:
//   LIQUID = close 5 USD+ and 20-session average traded value 5M USD+ on the formation day (SPY excluded).
//   MONTHLY formation = the close of the FIRST session of each month (knowable that day), buy the next open, sell the close of session
//   t + hold (value-lab fwd). WEEKLY formation = the close of the first session of each ISO week. A monthly sort picks the top (or bottom)
//   10% of liquid stocks with a value (at least 100 such stocks that day, else the month is skipped); every month is its own tranche, so
//   3-month holds overlap (Jegadeesh-Titman). Event rules: buy the next open after the day the event is public; one open trade per stock
//   per rule. FINANCIALS (SEC SIC 6xxx) are left out of the accounting sorts marked "non-financial" (as the papers do).
//   POINT IN TIME: SEC numbers only from filings filed BEFORE the formation day (value-core ttmAt / instantAt); share counts 30 days late
//   (data/shares.json.gz); short interest 14 calendar days after its settlement date; 13F holdings only from filings made by the 45-day
//   deadline; earnings surprises use the consensus shown by the Nasdaq calendar.
//   HOLDING: monthly characteristic sorts are held 3 months (63 sessions) unless the paper's own horizon is one month (MAX, IVOL,
//   seasonality, day/night momentum, industry and time-series momentum, short interest) or six months (52-week high). 0.8% round-trip cost
//   (1.2% stress) per trade: at a 1-month hold that is ~10% a year of cost, which is the system's rule and is NOT lowered here.
//   JUDGED at the system's tier-2 standard (value-core.mjs judge): both halves (formation before / from 2024-01-01) positive after 0.8% and
//   1.2% cost, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its other days,
//   positive without its 2 best trades, block t >= 2.5 (blocks = the hold length) -> TRADABLE SMALL; block t >= the proof bar -> PROVEN.
//   CALENDAR rules (ANOM-TOM, ANOM-PREHOL) trade SPY close to close (a halal investor would use SPUS/HLAL); their yardstick is SPY's
//   average return over ALL windows of the same length in the same half (the average stock over the same days would be the trade itself).
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26';
const P = (cite, url) => ({ cite, url });
// replication sources used throughout
const HXZ = P('Hou, Xue & Zhang (2020) Replicating Anomalies, Review of Financial Studies 33(5)', 'https://ideas.repec.org/a/oup/rfinst/v33y2020i5p2019-2133..html');
const CZ = P('Chen & Zimmermann (2022) Open Source Cross-Sectional Asset Pricing, Critical Finance Review 11(2)', 'https://www.openassetpricing.com');
export const ANOMALIES = {
  // ---------------- price and volume (5-year whole-market cache) ----------------
  'ANOM-MOM12': { family: 'price', hold: 63, name: '12-1 month momentum (top 10%)', papers: [P('Jegadeesh & Titman (1993) Returns to Buying Winners and Selling Losers, Journal of Finance 48(1)', 'https://doi.org/10.1111/j.1540-6261.1993.tb04702.x')],
    reported: 'winners minus losers about 1% a month 1965-89', replication: 'replicates (HXZ: R11 significant; Chen-Zimmermann: Mom12m clear); crashes in rebounds (2009, 2020)', refs: [HXZ, CZ],
    rule: 'Monthly: return from the close 252 sessions ago to the close 21 sessions ago; top 10% of liquid stocks; hold 63 sessions.', lib: 'T1 (6-month leaders, any day; tested: not proven) and DEC-FROG (smooth 12-1 winners); the plain 12-1 decile was never run' },
  'ANOM-52WH': { family: 'price', hold: 126, name: 'Near the 52-week high (George & Hwang)', papers: [P('George & Hwang (2004) The 52-Week High and Momentum Investing, Journal of Finance 59(5)', 'https://doi.org/10.1111/j.1540-6261.2004.00695.x')],
    reported: 'top 30% by price/52-week high beat the bottom 30% by ~0.45% a month, 6-month hold', replication: 'replicates in CZ (52-week high); HXZ: weaker value-weighted', refs: [HXZ, CZ],
    rule: 'Monthly: close / highest close of the last 252 sessions; top 10% of liquid stocks; hold 126 sessions (the paper\'s 6 months).', lib: 'T3 (new 1-year high, hold 3 months, any day: FAILED DISCOVERY). T3 was an event version, not the monthly ratio sort of the paper: mis-specified' },
  'ANOM-RESMOM': { family: 'price', hold: 63, name: 'Residual (idiosyncratic) momentum', papers: [P('Blitz, Huij & Martens (2011) Residual Momentum, Journal of Empirical Finance 18(3)', 'https://doi.org/10.1016/j.jempfin.2011.01.003'), P('Gutierrez & Pirinsky (2007) Momentum, reversal, and the trading behaviors of institutions, Journal of Financial Markets 10(1)', 'https://doi.org/10.1016/j.finmar.2006.09.002')],
    reported: 'about half the volatility of total-return momentum with similar returns (1930-2009)', replication: 'replicated out of sample by Blitz, Hanauer & Vidojevic (2020) internationally', refs: [CZ],
    rule: 'Monthly: beta from a regression of daily returns on SPY over the sessions 252..21 before formation; residual = daily return - beta x SPY return (no intercept); score = sum of residuals / their standard deviation; top 10% of liquid stocks; hold 63. (Market model instead of the paper\'s Fama-French 3 factors: no factor data in the repository.)', lib: 'none' },
  'ANOM-INDMOM': { family: 'price', hold: 21, name: 'Industry momentum (Moskowitz & Grinblatt)', papers: [P('Moskowitz & Grinblatt (1999) Do Industries Explain Momentum? Journal of Finance 54(4)', 'https://doi.org/10.1111/0022-1082.00146')],
    reported: 'top-3 of 20 industries beat the bottom 3 by ~0.4% a month; strongest at short horizons', replication: 'replicates (CZ IndMom); HXZ: significant equal-weighted', refs: [HXZ, CZ],
    rule: 'Monthly: industry = SEC SIC 2-digit group with 5+ liquid members; industry return = average 126-session return of its liquid members; every liquid member of the top 15% of industries; hold 21.', lib: 'T21 (top 20% of industries over 6 months, any day, 60-session hold: FAILED DISCOVERY) and B-SIF1. T21 used daily entries; the paper is a monthly sort held 1 month: partly mis-specified' },
  'ANOM-TSMOM': { family: 'price', hold: 21, name: 'Time-series momentum on single stocks (own 12-1 return above zero)', papers: [P('Moskowitz, Ooi & Pedersen (2012) Time Series Momentum, Journal of Financial Economics 104(2)', 'https://doi.org/10.1016/j.jfineco.2011.11.003'), P('Lim, Wang & Yao (2018) Time-series momentum in nearly 100 years of stock returns, Journal of Banking & Finance 97', 'https://doi.org/10.1016/j.jbankfin.2018.10.006')],
    reported: 'stock-level TSMOM ~0.8-1.1% a month long-short (1927-2017)', replication: 'Huang et al. (2020 JFE) dispute its strength beyond cross-sectional momentum', refs: [P('Huang, Li, Wang & Zhou (2020) Time series momentum: Is it there? Journal of Financial Economics 135(3)', 'https://doi.org/10.1016/j.jfineco.2019.08.004')],
    rule: 'Monthly: every liquid stock whose return from 252 to 21 sessions ago is above zero; hold 21.', lib: 'T10 (dual momentum) related, never the plain sign rule' },
  'ANOM-LOWVOL': { family: 'price', hold: 63, name: 'Low volatility (lowest 10%)', papers: [P('Ang, Hodrick, Xing & Zhang (2006) The Cross-Section of Volatility and Expected Returns, Journal of Finance 61(1)', 'https://doi.org/10.1111/j.1540-6261.2006.00836.x'), P('Blitz & van Vliet (2007) The Volatility Effect, Journal of Portfolio Management 34(1)', 'https://doi.org/10.3905/jpm.2007.698039')],
    reported: 'low-volatility stocks earn similar or higher returns with far less risk', replication: 'risk-adjusted effect replicates (CZ RealizedVol); raw returns lag in strong bull markets', refs: [HXZ, CZ],
    rule: 'Monthly: standard deviation of daily returns over the last 252 sessions; bottom 10% of liquid stocks; hold 63.', lib: 'V9 / V10 (calm stocks, any day, absolute thresholds: FAILED DISCOVERY). Not the monthly decile sort: mis-specified' },
  'ANOM-LOWBETA': { family: 'price', hold: 63, name: 'Low beta (betting-against-beta long leg)', papers: [P('Frazzini & Pedersen (2014) Betting Against Beta, Journal of Financial Economics 111(1)', 'https://doi.org/10.1016/j.jfineco.2013.10.005')],
    reported: 'BAB ~0.7% a month (levered long-short); the long leg alone mainly lowers risk', replication: 'Novy-Marx & Velikov (2022) show much of BAB comes from tiny stocks and its construction', refs: [P('Novy-Marx & Velikov (2022) Betting against betting against beta, Journal of Financial Economics 143(1)', 'https://doi.org/10.1016/j.jfineco.2021.05.023')],
    rule: 'Monthly: beta = correlation with SPY x (stock sd / SPY sd), daily returns over 252 sessions (the paper uses 5 years for correlation: not available), shrunk 0.6 beta + 0.4; bottom 10% of liquid stocks; hold 63.', lib: 'none' },
  'ANOM-LOWMAX': { family: 'price', hold: 21, name: 'Not a lottery stock (lowest MAX)', papers: [P('Bali, Cakici & Whitelaw (2011) Maxing Out: Stocks as Lotteries, Journal of Financial Economics 99(2)', 'https://doi.org/10.1016/j.jfineco.2010.08.014')],
    reported: 'highest-MAX decile underperforms lowest by ~1% a month', replication: 'replicates (CZ MaxRet); HXZ: insignificant value-weighted', refs: [HXZ, CZ],
    rule: 'Monthly: highest daily return of the last 21 sessions; bottom 10% of liquid stocks; hold 21.', lib: 'M14 (no +4% day, above 200-day, any day: FAILED DISCOVERY) / M15 (avoid test). The long leg as a monthly decile was never run' },
  'ANOM-LOWIVOL': { family: 'price', hold: 21, name: 'Low idiosyncratic volatility', papers: [P('Ang, Hodrick, Xing & Zhang (2006) The Cross-Section of Volatility and Expected Returns, Journal of Finance 61(1)', 'https://doi.org/10.1111/j.1540-6261.2006.00836.x')],
    reported: 'highest IVOL quintile underperforms lowest by ~1.06% a month', replication: 'HXZ: mostly fails value-weighted; strongest among small stocks', refs: [HXZ, CZ],
    rule: 'Monthly: standard deviation of market-model (SPY) residuals over the last 21 sessions; bottom 10% of liquid stocks; hold 21.', lib: 'none (V9/V10 used total volatility)' },
  'ANOM-SEASON': { family: 'price', hold: 21, name: 'Same-month seasonality (Heston & Sadka)', papers: [P('Heston & Sadka (2008) Seasonality in the cross-section of stock returns, Journal of Financial Economics 87(2)', 'https://doi.org/10.1016/j.jfineco.2007.02.003'), P('Keloharju, Linnainmaa & Nyberg (2016) Return Seasonalities, Journal of Finance 71(4)', 'https://doi.org/10.1111/jofi.12398')],
    reported: 'stocks that did well in the same calendar month in past years beat by ~1% that month', replication: 'replicates (CZ MomSeason); KLN 2016 show it across asset classes', refs: [CZ],
    rule: 'Monthly (formation = first session of the month, so the hold covers that month): average return of the stock in the same calendar month of earlier years in the window (1 to 4 years available; the paper uses up to 20); top 10% of liquid stocks; hold 21.', lib: 'C4 (days of the month) is a different calendar test; none' },
  'ANOM-OVNMOM': { family: 'price', hold: 21, name: 'Overnight-return momentum', papers: [P('Lou, Polk & Skouras (2019) A tug of war: Overnight versus intraday expected returns, Journal of Financial Economics 134(1)', 'https://personal.lse.ac.uk/polk/research/TugOfWar.pdf')],
    reported: 'momentum profits accrue overnight; past overnight winners keep earning overnight', replication: 'confirmed by Barardehi, Bogousslavsky & Muravyev for news-driven returns only at long horizons', refs: [],
    rule: 'Monthly: sum of log(open / previous close) over the last 252 sessions; top 10% of liquid stocks; hold 21 (close-to-close from the next open).', lib: 'none' },
  'ANOM-DAYMOM12': { family: 'price', hold: 21, name: 'Intraday (day) momentum, 12-1 months', papers: [P('Barardehi, Bogousslavsky & Muravyev, What Drives Momentum and Reversal? Evidence from Day and Night Signals (SSRN 4069509; Review of Financial Studies, 2026 per the coordinator; an earlier CV lists it as R&R at RFS)', 'https://experts.illinois.edu/en/publications/what-drives-momentum-and-reversal-evidence-from-day-and-night-sig/')],
    reported: 'portfolios on past INTRADAY returns show momentum (12-1) and short-term reversal (1 month); past OVERNIGHT returns show neither (1926-2019)', replication: 'new; no independent replication yet', refs: [],
    rule: 'Monthly: sum of log(close / open) over the sessions 252..21 before formation; top 10% of liquid stocks; hold 21.', lib: 'none' },
  'ANOM-DAYMOM1': { family: 'price', hold: 21, name: 'Intraday (day) return of the last month, top 10% (coordinator\'s 1-month version)', papers: [P('Barardehi, Bogousslavsky & Muravyev (SSRN 4069509)', 'https://experts.illinois.edu/en/publications/what-drives-momentum-and-reversal-evidence-from-day-and-night-sig/')],
    reported: 'the paper finds 1-month intraday returns REVERSE: this long-the-winners version is expected to lag', replication: 'new', refs: [],
    rule: 'Monthly: sum of log(close / open) over the last 21 sessions; top 10% of liquid stocks; hold 21.', lib: 'none' },
  'ANOM-DAYREV1': { family: 'price', hold: 21, name: 'Intraday short-term reversal (last month\'s intraday losers)', papers: [P('Barardehi, Bogousslavsky & Muravyev (SSRN 4069509)', 'https://experts.illinois.edu/en/publications/what-drives-momentum-and-reversal-evidence-from-day-and-night-sig/')],
    reported: 'the reversal leg the paper reports for 1-month intraday returns', replication: 'new; plain 1-month reversal is weak after costs (A-SW2 rejected here)', refs: [],
    rule: 'Monthly: sum of log(close / open) over the last 21 sessions; bottom 10% of liquid stocks; hold 21.', lib: 'A-SW2 (5-day losers, 5-session hold: rejected) is a different horizon' },
  'ANOM-DAYNIGHT': { family: 'price', hold: 21, name: 'Day-night interaction: strong intraday, weak overnight (12-1)', papers: [P('Barardehi, Bogousslavsky & Muravyev (SSRN 4069509)', 'https://experts.illinois.edu/en/publications/what-drives-momentum-and-reversal-evidence-from-day-and-night-sig/'), P('Lou, Polk & Skouras (2019) JFE 134(1)', 'https://personal.lse.ac.uk/polk/research/TugOfWar.pdf')],
    reported: 'trading-driven (intraday) gains continue; news-driven (overnight) gains do not', replication: 'new', refs: [],
    rule: 'Monthly: top 30% by 12-1 intraday sum AND bottom 30% by 12-1 overnight sum (log(open / previous close), sessions 252..21); all such liquid stocks; hold 21.', lib: 'none' },
  'ANOM-HVP': { family: 'price', hold: 21, name: 'High-volume return premium', papers: [P('Gervais, Kaniel & Mingelgrin (2001) The High-Volume Return Premium, Journal of Finance 56(3)', 'https://doi.org/10.1111/0022-1082.00349')],
    reported: 'stocks with unusually high volume over a week/day earn more over the next month (1963-96)', replication: 'Kaniel, Ozoguz & Starks (2012) find it in 41 countries; CZ include a volume-trend family', refs: [CZ],
    rule: 'Weekly: the last 5 sessions\' volume is higher than each of the 9 earlier non-overlapping 5-session volumes (top of 10 weeks); liquid; buy the next open; hold 21; one open trade per stock.', lib: 'I3 / I13 (volume awakening in a quiet base: FAILED DISCOVERY) are breakout versions with price conditions, not this' },
  'ANOM-EIL20': { family: 'price', hold: 20, name: 'Emerging industry leadership (coordinator, 20 sessions)', papers: [P('Coordinator hypothesis, built on Moskowitz & Grinblatt (1999) and Hong, Torous & Valkanov (2007) Do industries lead stock markets? JFE 83(2)', 'https://doi.org/10.1016/j.jfineco.2005.09.010')],
    reported: 'none (new combination)', replication: 'n/a', refs: [],
    rule: 'Weekly: industry (SIC 2-digit, 5+ liquid members) breadth = share of members above their 50-day average; improving = breadth up 0.20+ over 20 sessions, at least 0.50 now, AND the share at a 20-session closing high higher than 20 sessions ago. Stock: percentile of its 63-session return inside its industry, up 0.25+ over 20 sessions and at least 0.70 now. Buy the next open; hold 20; one open trade per stock. Must beat plain 12-1 momentum (top 10%) and plain industry momentum (ANOM-INDMOM selection) on the same dates, same hold, in both halves.', lib: 'T22 (up 30% in a top-20% industry: FAILED DISCOVERY) is the static version' },
  'ANOM-EIL60': { family: 'price', hold: 60, name: 'Emerging industry leadership (coordinator, 60 sessions)', papers: [P('as ANOM-EIL20', '')], reported: 'none', replication: 'n/a', refs: [],
    rule: 'As ANOM-EIL20 with hold 60.', lib: 'as ANOM-EIL20' },
  'ANOM-TOM': { family: 'calendar', hold: 4, name: 'Turn of the month (SPY, close of day -2 to close of day +3)', papers: [P('Lakonishok & Smidt (1988) Are Seasonal Anomalies Real? Review of Financial Studies 1(4)', 'https://doi.org/10.1093/rfs/1.4.403'), P('McConnell & Xu (2008) Equity Returns at the Turn of the Month, Financial Analysts Journal 64(2)', 'https://doi.org/10.2469/faj.v64.n2.11')],
    reported: 'nearly all of the US market\'s excess return 1926-2005 came in days -1..+3', replication: 'still present to 2020s in index data (weaker)', refs: [],
    rule: 'Each month: buy SPY at the close of the session before the last session of the month, sell at the close of the 3rd session of the new month (4 sessions: -1, +1, +2, +3). Yardstick: SPY over all 4-session windows of the half.', lib: 'C1 / C2 (turn of the month on every stock vs the average stock: FAILED DISCOVERY). Comparing every stock with the average stock on the same days cancels a market-wide effect: mis-specified' },
  'ANOM-PREHOL': { family: 'calendar', hold: 1, name: 'Pre-holiday (SPY)', papers: [P('Ariel (1990) High Stock Returns before Holidays, Journal of Finance 45(5)', 'https://doi.org/10.1111/j.1540-6261.1990.tb02441.x')],
    reported: 'pre-holiday days earned 9-14x a normal day (1963-82)', replication: 'weaker since 1990s (Lakonishok-Smidt; later studies)', refs: [],
    rule: 'Buy SPY at the close of the session before a pre-holiday session (a session followed by a weekday market closure), sell at the close of the pre-holiday session. Yardstick: SPY over all 1-session windows of the half.', lib: 'C5 (Santa / January: needs data); none' },
  // ---------------- earnings (Nasdaq earnings calendar: date, time, actual and consensus EPS) ----------------
  'ANOM-EAP': { family: 'earn', hold: 6, name: 'Earnings-announcement premium (own the stock into its report)', papers: [P('Frazzini & Lamont (2007) The Earnings Announcement Premium and Trading Volume, NBER w13090', 'https://www.nber.org/papers/w13090'), P('Barber, De George, Lehavy & Trueman (2013) The earnings announcement premium around the globe, Journal of Financial Economics 108(1)', 'https://doi.org/10.1016/j.jfineco.2012.10.007')],
    reported: 'announcement months earn ~0.5-1% more than other months; mostly in the days around the report', replication: 'replicates (CZ AnnouncementReturn family); small vs costs', refs: [CZ],
    rule: 'Every report with a consensus EPS on the Nasdaq calendar: reaction session r = the report day if before the open, else the next session; buy the open of r-5 (dates are published weeks ahead), sell the close of r; liquid the day before buying.', lib: 'E19 (queued, same idea; never run). Same rule, now run' },
  'ANOM-SUE': { family: 'earn', hold: 60, name: 'Post-earnings drift on the analyst surprise (SUE top 10%)', papers: [P('Bernard & Thomas (1989) Post-Earnings-Announcement Drift, Journal of Accounting Research 27', 'https://doi.org/10.2307/2491062'), P('Livnat & Mendenhall (2006) Comparing the Post-Earnings Announcement Drift for Surprises Calculated from Analyst and Time Series Forecasts, JAR 44(1)', 'https://doi.org/10.1111/j.1475-679X.2006.00196.x')],
    reported: 'top-minus-bottom SUE decile ~4-6% over 60 days (older samples)', replication: 'much weaker after 2006 for large stocks (Martineau 2022 "Rest in Peace Post-Earnings Announcement Drift", Critical Finance Review)', refs: [P('Martineau (2022) Rest in Peace Post-Earnings Announcement Drift, Critical Finance Review 11(3-4)', 'https://doi.org/10.1561/104.00000122')],
    rule: '(actual EPS - consensus) / the close before the report; top 10% vs the surprises of all liquid reports of the previous 63 sessions (rolling, point in time); buy the open of r+1; hold 60.', lib: 'E1 / A-E1W1 (big beat + gap rule: not proven) and B-EM1 (beat streak: rejected). E1 uses a gap condition, not the SUE decile' },
  'ANOM-EAR': { family: 'earn', hold: 60, name: 'Earnings-announcement-return drift (EAR top 10%)', papers: [P('Chan, Jegadeesh & Lakonishok (1996) Momentum Strategies, Journal of Finance 51(5)', 'https://doi.org/10.1111/j.1540-6261.1996.tb05222.x'), P('Brandt, Kishore, Santa-Clara & Venkatachalam (2008) Earnings announcements are full of surprises, SSRN 909563', 'https://ssrn.com/abstract=909563')],
    reported: 'EAR-sorted drift ~7% a year top minus bottom, and stronger than SUE in recent decades', replication: 'replicates (CZ AnnouncementReturn)', refs: [CZ],
    rule: '3-session return from the close of r-2 to the close of r+1 minus the average liquid stock\'s; top 10% vs the previous 63 sessions\' liquid reports; buy the open of r+2; hold 60.', lib: 'E16 (gap + quiet days: not proven), E13; the EAR decile was never run' },
  'ANOM-SUESURGE': { family: 'earn', hold: 60, name: 'Earnings AND revenue surprise together (SUE + SURGE)', papers: [P('Jegadeesh & Livnat (2006) Revenue surprises and stock returns, Journal of Accounting and Economics 41(1-2)', 'https://doi.org/10.1016/j.jacceco.2005.10.002')],
    reported: 'drift is largest when earnings and revenue surprises agree', replication: 'revenue-surprise drift replicates (CZ RevenueSurprise)', refs: [CZ],
    rule: 'SUE in the top 30% (rolling 63 sessions) AND SURGE (the quarter\'s revenue minus the same quarter a year earlier minus the mean of that seasonal change over up to 8 earlier quarters, over its standard deviation; at least 4 earlier changes; SEC quarterly revenue) in the top 30%; buy the open of the first session after both r and the SEC filing with the quarter\'s revenue (filed within 10 sessions of r, else skipped); hold 60.', lib: 'B-EM1 (beat streak + rising growth: rejected) is different' },
  // ---------------- accounting (SEC XBRL company facts, point in time) ----------------
  'ANOM-GP': { family: 'facts', hold: 63, name: 'Gross profitability (Novy-Marx)', papers: [P('Novy-Marx (2013) The other side of value: The gross profitability premium, Journal of Financial Economics 108(1)', 'https://doi.org/10.1016/j.jfineco.2013.01.003')],
    reported: 'top-minus-bottom GP/A quintile ~0.31% a month value-weighted', replication: 'replicates (HXZ GPA; CZ GP)', refs: [HXZ, CZ],
    rule: 'Monthly, non-financial: trailing-12-month (revenue - cost of revenue, or GrossProfit) / latest total assets; top 10% of liquid stocks; hold 63.', lib: 'V2 (high gross profit on assets: tested: rejected); V2 was the same idea with a different construction. Re-run once in the common anomaly frame' },
  'ANOM-CFOA': { family: 'facts', hold: 63, name: 'Cash-based operating profitability (simplified: operating cash flow / assets)', papers: [P('Ball, Gerakos, Linnainmaa & Nikolaev (2016) Accruals, cash flows, and operating profitability in the cross section of stock returns, Journal of Financial Economics 121(1)', 'https://doi.org/10.1016/j.jfineco.2016.03.002')],
    reported: 'cash-based operating profitability subsumes accruals and beats GP/A', replication: 'replicates (CZ CBOperProf)', refs: [CZ],
    rule: 'Monthly, non-financial: trailing-12-month operating cash flow / latest total assets (a simplified CbOP: the paper adds back R&D and adjusts working capital); top 10% of liquid stocks; hold 63.', lib: 'V3 (cheap for its cash flow) is a value ratio, not this' },
  'ANOM-AG': { family: 'facts', hold: 63, name: 'Low asset growth', papers: [P('Cooper, Gulen & Schill (2008) Asset Growth and the Cross-Section of Stock Returns, Journal of Finance 63(4)', 'https://doi.org/10.1111/j.1540-6261.2008.01370.x')],
    reported: 'low-growth decile beat high by ~20% a year equal-weighted (1968-2003)', replication: 'replicates but much smaller value-weighted (HXZ I/A)', refs: [HXZ, CZ],
    rule: 'Monthly, non-financial: latest total assets / total assets about a year earlier (the balance sheet 330-400 days before the latest) - 1; bottom 10% of liquid stocks; hold 63.', lib: 'none' },
  'ANOM-ACC': { family: 'facts', hold: 63, name: 'Low accruals (Sloan)', papers: [P('Sloan (1996) Do Stock Prices Fully Reflect Information in Accruals and Cash Flows about Future Earnings? The Accounting Review 71(3)', 'https://www.jstor.org/stable/248290')],
    reported: 'low-minus-high accrual decile ~10% a year (1962-91)', replication: 'weakened sharply after 2000 (Green, Hand & Soliman 2011); CZ still list it', refs: [CZ, P('Green, Hand & Soliman (2011) Going, Going, Gone? The Apparent Demise of the Accruals Anomaly, Management Science 57(5)', 'https://doi.org/10.1287/mnsc.1110.1345')],
    rule: 'Monthly, non-financial: (TTM net income - TTM operating cash flow) / average of latest and year-earlier total assets; bottom 10% of liquid stocks; hold 63.', lib: 'V1 (quality, incl. cash-backed profits: rejected) mixed several checks; the accrual decile alone was never run' },
  'ANOM-QMJ': { family: 'facts', hold: 63, name: 'Quality minus junk (simplified, long the top 10%)', papers: [P('Asness, Frazzini & Pedersen (2019) Quality minus junk, Review of Accounting Studies 24', 'https://doi.org/10.1007/s11142-018-9470-2')],
    reported: 'QMJ ~0.4-0.6% a month across 24 countries', replication: 'replicates (AQR data library)', refs: [],
    rule: 'Monthly, non-financial: average of three percentile ranks: PROFITABILITY (mean rank of GP/A, net income/A, operating cash flow/A, gross margin, minus accruals; 3+ of 5), GROWTH (mean rank of the 1-year change in GP/A and in net income/A; 1+), SAFETY (mean rank of minus beta, minus 252-session volatility, minus liabilities/assets; 2+); top 10% of liquid stocks; hold 63. (No payout component; growth over 1 year, not 5.)', lib: 'V1 (quality companies: rejected), V13 / V15 (F-score). Different construction' },
  'ANOM-RD': { family: 'facts', hold: 63, name: 'High R&D intensity (R&D / market value)', papers: [P('Chan, Lakonishok & Sougiannis (2001) The Stock Market Valuation of Research and Development Expenditures, Journal of Finance 56(6)', 'https://doi.org/10.1111/0022-1082.00416'), P('Eberhart, Maxwell & Siddique (2004) An Examination of Long-Term Abnormal Stock Returns and Operating Performance Following R&D Increases, Journal of Finance 59(2)', 'https://doi.org/10.1111/j.1540-6261.2004.00649.x')],
    reported: 'high R&D-to-market firms earn ~6% a year excess', replication: 'replicates (CZ RD / RDcap)', refs: [CZ],
    rule: 'Monthly, non-financial, R&D reporters only: TTM research and development expense / (share count known x close); top 10% of liquid stocks; hold 63.', lib: 'none' },
  'ANOM-OL': { family: 'facts', hold: 63, name: 'Operating leverage (Novy-Marx)', papers: [P('Novy-Marx (2011) Operating Leverage, Review of Finance 15(1)', 'https://doi.org/10.1093/rof/rfq019')],
    reported: 'high (cost of goods + SG&A)/assets earns more', replication: 'replicates (Chen-Zimmermann signal OPLeverage)', refs: [CZ],
    rule: 'Monthly, non-financial: (TTM cost of revenue + TTM SG&A) / latest total assets; top 10% of liquid stocks; hold 63.', lib: 'none' },
  'ANOM-CAPEX': { family: 'facts', hold: 63, name: 'Low abnormal capital investment', papers: [P('Titman, Wei & Xie (2004) Capital Investments and Stock Returns, Journal of Financial and Quantitative Analysis 39(4)', 'https://doi.org/10.1017/S0022109000003173')],
    reported: 'firms raising capex the most underperform', replication: 'replicates (Chen-Zimmermann signal Investment, Titman-Wei-Xie); HXZ investment family', refs: [HXZ, CZ],
    rule: 'Monthly, non-financial: TTM capex / TTM revenue now, divided by the average of the same ratio 1, 2 and 3 years earlier (all known before the day), minus 1; bottom 10% of liquid stocks; hold 63.', lib: 'none' },
  'ANOM-NSI': { family: 'facts', hold: 63, name: 'Net share issuance: shrinking share count (lowest 10%)', papers: [P('Pontiff & Woodgate (2008) Share Issuance and Cross-sectional Returns, Journal of Finance 63(2)', 'https://doi.org/10.1111/j.1540-6261.2008.01338.x')],
    reported: 'issuance strongly predicts lower returns after 1970', replication: 'one of the most robust (HXZ NSI; CZ ShareIss1Y)', refs: [HXZ, CZ],
    rule: 'Monthly, all liquid stocks: share count known now / share count known 252 sessions earlier (both 30 days late) - 1; bottom 10%; hold 63.', lib: 'S1 (flat count + above 50-day, any day: FAILED DISCOVERY), S2 (avoid test), V11, C-NSI1 (queued avoid). The monthly decile was never run' },
  'ANOM-BBY': { family: 'facts', hold: 63, name: 'Buyback yield (actual repurchases)', papers: [P('Boudoukh, Michaely, Richardson & Roberts (2007) On the Importance of Measuring Payout Yield, Journal of Finance 62(2)', 'https://doi.org/10.1111/j.1540-6261.2007.01226.x'), P('Ikenberry, Lakonishok & Vermaelen (1995) Market underreaction to open market share repurchases, JFE 39(2-3)', 'https://doi.org/10.1016/0304-405X(95)00826-Z')],
    reported: 'payout yield incl. buybacks predicts returns; announcement drift +12% over 4 years (1980-90)', replication: 'payout yield replicates (CZ NetPayoutYield); announcement drift weaker after 2000', refs: [CZ],
    rule: 'Monthly, all liquid stocks: TTM PaymentsForRepurchaseOfCommonStock / (share count known x close); top 10% among repurchasers; hold 63. (Announcement dates need a news feed: see ANOM-BBANN.)', lib: 'E8 (buyback announcements: queued), V17 (net payout yield: queued). Measured from what was actually spent' },
  // ---------------- events ----------------
  'ANOM-INSIDER': { family: 'insider', hold: 21, name: 'Opportunistic insider purchases (routine buyers removed)', papers: [P('Cohen, Malloy & Pomorski (2012) Decoding Inside Information, Journal of Finance 67(3)', 'https://www.nber.org/papers/w16454')],
    reported: 'opportunistic buys earn ~0.8% a month abnormal; routine trades nothing', replication: 'replicated in later insider studies; CZ include insider-buying signals', refs: [CZ],
    rule: 'SEC Form 4 open-market purchase (code P) by an insider who traded in each of the 3 previous calendar years but NOT in the same calendar month in all 3 (a routine trader = traded in the same month 3 years running); buy the next open after the filing date; hold 21; one open trade per stock.', lib: 'E3 (insider cluster: not proven), C-INS2 (rejected), C-INS3 (queued, this idea with clusters). One-shot of the paper\'s single-trade version' },
  'ANOM-13D': { family: 'edgar', hold: 63, name: 'Activist 13D filing', papers: [P('Brav, Jiang, Partnoy & Thomas (2008) Hedge Fund Activism, Corporate Governance, and Firm Performance, Journal of Finance 63(4)', 'https://doi.org/10.1111/j.1540-6261.2008.01373.x')],
    reported: '+7% abnormal around the filing, no reversal over the next year', replication: 'confirmed (Bebchuk, Brav & Jiang 2015)', refs: [],
    rule: 'Original SC 13D / SCHEDULE 13D (not amendments) in the EDGAR quarterly index; subject = the one listed company on the filing; buy the next open after the filing date; hold 63; one open trade per stock. (Not every 13D is an activist: passive 5% holders file 13G.)', lib: 'E4 (queued). First run' },
  'ANOM-SPIN': { family: 'edgar', hold: 126, name: 'Spin-offs (the new company)', papers: [P('Cusatis, Miles & Woolridge (1993) Restructuring through spinoffs, Journal of Financial Economics 33(3)', 'https://doi.org/10.1016/0304-405X(93)90011-Z'), P('McConnell & Ovtchinnikov (2004) Predictability of Long-Term Spinoff Returns, Journal of Investment Management 2(3)', 'https://www.joim.com')],
    reported: 'spun-off firms beat matched firms by ~25-30% over 3 years', replication: 'weaker in later samples; concentrated in takeovers', refs: [],
    rule: 'Form 10-12B filer (the new company) whose ticker first trades in the cache on or after the filing (not traded before it, within 400 days); buy the open of its 2nd trading session; hold 126.', lib: 'E7 (queued). First run' },
  'ANOM-DIVINIT': { family: 'divs', hold: 126, name: 'Dividend initiations', papers: [P('Michaely, Thaler & Womack (1995) Price Reactions to Dividend Initiations and Omissions, Journal of Finance 50(2)', 'https://doi.org/10.1111/j.1540-6261.1995.tb04793.x')],
    reported: '+7.5% drift in the year after an initiation', replication: 'Boehme & Sorescu (2002) find the drift fragile', refs: [P('Boehme & Sorescu (2002) The Long-run Performance Following Dividend Initiations and Resumptions, Journal of Finance 57(2)', 'https://doi.org/10.1111/1540-6261.00436')],
    rule: 'A regular cash dividend (Massive dividends: type CD) declared by a stock with no dividend of any kind in the previous 730 days and in the cache for 252+ sessions; buy the next open after the declaration date; hold 126.', lib: 'V7 (dividend growth: needs data). First run' },
  'ANOM-13FBEST': { family: '13f', hold: 63, name: '13F best ideas of active managers', papers: [P('Cohen, Polk & Silli (2010) Best Ideas, SSRN 1364827', 'https://ssrn.com/abstract=1364827')],
    reported: 'managers\' best ideas beat the market by ~1-2.5% a quarter', replication: 'Antón, Cohen & Polk (2021) confirm with newer data', refs: [],
    rule: 'For each 13F-HR (filed by the 45-day deadline) with 20-300 share positions (no options): the stock with the largest weight above its weight in the sum of all 13F filings that quarter = that manager\'s best idea. Formation = first session after the deadline; every liquid best-idea stock; hold 63. CUSIP -> ticker via Massive.', lib: 'C-13F1 (new positions by concentrated funds: queued) is different' },
  'ANOM-SILOW': { family: 'si', hold: 21, name: 'Low short interest (lowest 10% of shares sold short)', papers: [P('Asquith, Pathak & Ritter (2005) Short interest, institutional ownership, and stock returns, Journal of Financial Economics 78(2)', 'https://doi.org/10.1016/j.jfineco.2004.06.005'), P('Boehme, Danielsen & Sorescu (2006) Short-Sale Constraints, Differences of Opinion, and Overvaluation, JFQA 41(2)', 'https://doi.org/10.1017/S0022109000002118')],
    reported: 'high short interest predicts low returns; low SI is the long side', replication: 'replicates (CZ ShortInterest)', refs: [CZ],
    rule: 'Monthly: latest FINRA short interest known 14 days after its settlement date / share count known; bottom 10% of liquid stocks; hold 21.', lib: 'C-SI1 (avoid, queued), S5 / C-SQZ1 (needs data). First run' },
  'ANOM-DTCLOW': { family: 'si', hold: 21, name: 'Low days-to-cover', papers: [P('Hong, Li, Ni, Scheinkman & Yan (2016) Days to Cover and Stock Returns, NBER w21166', 'https://www.nber.org/papers/w21166')],
    reported: 'days-to-cover predicts returns better than short interest (~1.2% a month high-low)', replication: 'Hong et al. report it over 1988-2012; not in the HXZ list', refs: [],
    rule: 'Monthly: latest FINRA days-to-cover (short interest / average daily volume) known 14 days after settlement; bottom 10% of liquid stocks; hold 21.', lib: 'none' },
  'ANOM-SIDROP': { family: 'si', hold: 21, name: 'Short-interest decline (shorts covering)', papers: [P('Desai, Ramesh, Thiagarajan & Balachandran (2002) An Investigation of the Informational Role of Short Interest in the Nasdaq Market, Journal of Finance 57(5)', 'https://doi.org/10.1111/1540-6261.00492')],
    reported: 'short-interest changes carry information; covering precedes better returns', replication: 'mixed', refs: [],
    rule: 'Monthly: change in short interest between the latest known report and the one about a month earlier (2 reports back), among stocks with 2%+ of shares short a month earlier; the largest 10% declines; hold 21.', lib: 'none' },
};
// documented anomalies with no usable data in the repository: registered, NOT run
export const NEEDS_DATA = {
  'ANOM-IDXADD': { name: 'Index additions', papers: [P('Greenwood & Sammon (2022) The Disappearing Index Effect, NBER w30748', 'https://www.nber.org/papers/w30748')], why: 'no point-in-time S&P / Russell announcement dates in the repository (S&P press releases are not archived in a machine-readable feed); the paper finds the effect has largely disappeared since 2010', lib: 'E6 (needs data), C-SPEC1 (queued)' },
  'ANOM-REVISION': { name: 'Analyst earnings-forecast revision momentum', papers: [P('Chan, Jegadeesh & Lakonishok (1996) JF 51(5)', 'https://doi.org/10.1111/j.1540-6261.1996.tb05222.x')], why: 'no history of consensus revisions (data/analyst-archive starts October 2026; C-REV1 is collecting)', lib: 'E5, C-REV1' },
  'ANOM-8KTONE': { name: 'Tone of 8-K / 10-K text', papers: [P('Loughran & McDonald (2011) When Is a Liability Not a Liability? JF 66(1)', 'https://doi.org/10.1111/j.1540-6261.2010.01625.x')], why: 'needs the full text of every filing for 5 years plus a tested dictionary pipeline; not built in this round', lib: 'C-DIFF1 (queued)' },
  'ANOM-OPTSKEW': { name: 'Options-implied skew / volatility spread', papers: [P('Xing, Zhang & Zhao (2010) What Does the Individual Option Volatility Smirk Tell Us About Future Equity Returns? JFQA 45(3)', 'https://doi.org/10.1017/S0022109010000220'), P('Cremers & Weinbaum (2010) Deviations from Put-Call Parity and Stock Return Predictability, JFQA 45(2)', 'https://doi.org/10.1017/S0022109010000074')], why: 'no 5-year history of option implied volatilities per stock', lib: 'OPT-UOA1 (needs data)' },
  'ANOM-BBANN': { name: 'Buyback announcements', papers: [P('Ikenberry, Lakonishok & Vermaelen (1995) JFE 39(2-3)', 'https://doi.org/10.1016/0304-405X(95)00826-Z')], why: 'announcement dates are in press releases / 8-K item 8.01 text, not a structured field; ANOM-BBY tests the money actually spent instead', lib: 'E8 (queued)' },
};
export const IDS = Object.keys(ANOMALIES);

// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((u, w) => u + (w - m) ** 2, 0) / (a.length - 1)); };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
// pick the top (or bottom) `frac` of rows [{ key, v }] with a finite v; fewer than minRows usable -> []. Ties keep input order.
export function pickFrac(rows, frac, dir = 'top', minRows = 100) {
  const a = rows.filter(r => ok(r.v)); if (a.length < minRows) return [];
  a.sort((x, y) => dir === 'top' ? y.v - x.v : x.v - y.v); return a.slice(0, Math.max(1, Math.ceil(a.length * frac))).map(r => r.key);
}
// percentile rank 0..1 of each row's v among rows with a finite v (average rank for ties)
export function pctRanks(rows) {
  const a = rows.filter(r => ok(r.v)).sort((x, y) => x.v - y.v), out = new Map(), n = a.length; if (!n) return out;
  for (let i = 0; i < n;) { let j = i; while (j + 1 < n && a[j + 1].v === a[i].v) j++; const p = n > 1 ? ((i + j) / 2) / (n - 1) : 0.5; for (let k = i; k <= j; k++) out.set(a[k].key, p); i = j + 1; }
  return out;
}
// ---------------- price features (c, o, v: arrays with NaN where no bar; t = formation index) ----------------
export const mom = (c, t, from, to) => { const a = c[t - from], b = c[t - to]; return t - from >= 0 && a > 0 && b > 0 ? b / a - 1 : null; };   // close `from` sessions ago -> close `to` sessions ago
export function high52(c, t, n = 252) { if (t - n + 1 < 0 || !(c[t] > 0)) return null; let m = -Infinity, have = 0; for (let k = t - n + 1; k <= t; k++) if (c[k] > 0) { have++; if (c[k] > m) m = c[k]; } return have >= n * 0.9 ? c[t] / m : null; }
// daily simple returns for sessions a..b (inclusive): null if more than 10% are missing
export function rets(c, a, b) { if (a < 1) return null; const out = [], idx = []; for (let k = a; k <= b; k++) if (c[k] > 0 && c[k - 1] > 0) { out.push(c[k] / c[k - 1] - 1); idx.push(k); } return out.length >= (b - a + 1) * 0.9 ? { r: out, k: idx } : null; }
export function volatility(c, t, n) { const x = rets(c, t - n + 1, t); return x ? sd(x.r) : null; }
export function maxRet(c, t, n) { const x = rets(c, t - n + 1, t); return x ? Math.max(...x.r) : null; }
// OLS of y on x (paired arrays): { a, b, e (residuals) }
export function ols(y, x) { const n = y.length; if (n < 3) return null; const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; } if (!(sxx > 0)) return null;
  const b = sxy / sxx, a = my - b * mx; return { a, b, e: y.map((v, i) => v - a - b * x[i]) }; }
// paired daily returns of a stock and the market over sessions a..b (both must have a bar)
export function paired(c, m, a, b) { const y = [], x = []; for (let k = Math.max(1, a); k <= b; k++) if (c[k] > 0 && c[k - 1] > 0 && m[k] > 0 && m[k - 1] > 0) { y.push(c[k] / c[k - 1] - 1); x.push(m[k] / m[k - 1] - 1); } return { y, x, n: b - Math.max(1, a) + 1 }; }
// residual = r - beta x market (beta from the same window; no intercept, else the residuals would sum to zero over the window)
export function residMom(c, m, t) { const p = paired(c, m, t - 251, t - 21); if (p.y.length < p.n * 0.9) return null; const f = ols(p.y, p.x); if (!f) return null; const e = p.y.map((y, i) => y - f.b * p.x[i]), s = sd(e); return s > 0 ? e.reduce((u, w) => u + w, 0) / s : null; }
export function fpBeta(c, m, t, n = 252) { const p = paired(c, m, t - n + 1, t); if (p.y.length < p.n * 0.9) return null; const sy = sd(p.y), sx = sd(p.x); if (!(sx > 0) || !(sy > 0)) return null; const my = mean(p.y), mx = mean(p.x);
  let cv = 0; for (let i = 0; i < p.y.length; i++) cv += (p.y[i] - my) * (p.x[i] - mx); const rho = cv / (p.y.length - 1) / (sy * sx); return 0.6 * rho * sy / sx + 0.4; }
export function ivol(c, m, t, n = 21) { const p = paired(c, m, t - n + 1, t); if (p.y.length < p.n * 0.9) return null; const f = ols(p.y, p.x); return f ? sd(f.e) : null; }
// sums of log returns over sessions a..b inclusive: overnight = log(open_k / close_{k-1}), intraday = log(close_k / open_k); null if 10%+ missing
export function logSum(o, c, a, b, kind) { if (a < 1) return null; let s = 0, n = 0; for (let k = a; k <= b; k++) { const x = kind === 'night' ? (o[k] > 0 && c[k - 1] > 0 ? Math.log(o[k] / c[k - 1]) : NaN) : (c[k] > 0 && o[k] > 0 ? Math.log(c[k] / o[k]) : NaN); if (isFinite(x)) { s += x; n++; } }
  return n >= (b - a + 1) * 0.9 ? s : null; }
// high-volume week: the 5-session volume ending t is higher than each of the 9 earlier non-overlapping 5-session volumes
export function hvpWeek(v, t) { if (t - 49 < 0) return false; const w = (e) => { let s = 0; for (let k = e - 4; k <= e; k++) { if (!(v[k] >= 0)) return NaN; s += v[k]; } return s; }; const now = w(t); if (!(now > 0)) return false;
  for (let j = 1; j <= 9; j++) { const p = w(t - 5 * j); if (!isFinite(p) || p >= now) return false; } return true; }
// same-calendar-month average return in earlier years. monthly = Map 'YYYY-MM' -> return of that month; target 'YYYY-MM'
export function seasonal(monthly, target) { const y = +target.slice(0, 4), m = target.slice(5, 7), v = []; for (let k = 1; k <= 20; k++) { const r = monthly.get((y - k) + '-' + m); if (ok(r)) v.push(r); } return v.length ? mean(v) : null; }
// ---------------- calendar ----------------
const ym = (d) => d.slice(0, 7);
export const monthStarts = (D) => { const o = []; for (let t = 1; t < D.length; t++) if (ym(D[t]) !== ym(D[t - 1])) o.push(t); return o; };
const isoWeek = (d) => { const x = new Date(d + 'T00:00:00Z'), day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day + 3); const y = x.getUTCFullYear(), f = new Date(Date.UTC(y, 0, 4)); return y + '-' + (1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)); };
export const weekStarts = (D) => { const o = []; for (let t = 1; t < D.length; t++) if (isoWeek(D[t]) !== isoWeek(D[t - 1])) o.push(t); return o; };
const nextWeekday = (d) => { let x = Date.parse(d + 'T00:00:00Z') + 864e5; while ([0, 6].includes(new Date(x).getUTCDay())) x += 864e5; return new Date(x).toISOString().slice(0, 10); };
// session t is pre-holiday when the next session is later than the next weekday (a weekday closure in between). Needs D[t+1].
export const preHoliday = (D, t) => t + 1 < D.length && D[t + 1] > nextWeekday(D[t]);
// turn-of-the-month windows on a session list: [{ buy: index of the close bought (session before the month's last), sell: index of the
// close sold (3rd session of the new month) }]
export function tomWindows(D) { const o = []; for (const s of monthStarts(D)) { const b = s - 2, x = s + 2; if (b >= 0 && x < D.length) o.push({ buy: b, sell: x }); } return o; }
// NYSE full-day closures (published calendars) for the forward paper lane, where the next session is not yet in the data
export const NYSE_HOLIDAYS = new Set(['2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25', '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
  '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);
export function nextSession(d, hol = NYSE_HOLIDAYS) { let x = nextWeekday(d); while (hol.has(x)) x = nextWeekday(x); return x; }
// ---------------- earnings ----------------
// reaction session of a report on date d: before the open -> the first session on/after d; otherwise (after the close or unknown) the
// first session after d. D sorted. Returns an index or -1.
export function reactionIdx(D, d, time) { let lo = 0, hi = D.length; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } if (lo >= D.length) return -1; if (time === 'bmo') return lo; return D[lo] === d ? (lo + 1 < D.length ? lo + 1 : -1) : lo; }
// rolling cut-off: value at quantile q of the history (needs 30+ values), else null
export function quantile(a, q) { if (a.length < 30) return null; const s = [...a].sort((x, y) => x - y), p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); }
// SURGE (Jegadeesh & Livnat 2006, seasonal random walk with drift): revs = quarterly revenues oldest..newest (consecutive quarters);
// SURGE = (R_q - R_{q-4} - mu) / sigma, mu and sigma over the seasonal changes of up to 8 earlier quarters (4+ needed).
export function surge(revs) { const n = revs.length; if (n < 9 || !revs.slice(-9).every(ok)) return null; const ch = []; for (let j = n - 2; j >= 4 && ch.length < 8; j--) { if (ok(revs[j]) && ok(revs[j - 4])) ch.push(revs[j] - revs[j - 4]); else break; }
  if (ch.length < 4) return null; const s = sd(ch); return s > 0 ? (revs[n - 1] - revs[n - 5] - mean(ch)) / s : null; }
// ---------------- insiders (Cohen, Malloy & Pomorski 2012) ----------------
// months: Set of 'YYYY-MM' in which the insider made any open-market trade (buy or sell). Classification for a trade in `year`:
// null if the insider did not trade in each of the 3 previous years (not classifiable, left out as in the paper); 'routine' if some
// calendar month was traded in all 3 previous years; else 'opportunistic'.
export function insiderType(months, year) { const ys = [year - 1, year - 2, year - 3], have = (y) => [...months].some(m => +m.slice(0, 4) === y); if (!ys.every(have)) return null;
  for (let mo = 1; mo <= 12; mo++) { const mm = String(mo).padStart(2, '0'); if (ys.every(y => months.has(y + '-' + mm))) return 'routine'; } return 'opportunistic'; }
// ---------------- EDGAR index ----------------
// master.idx text -> [{ cik, name, form, date, file }] for the forms wanted (exact form names; amendments end in /A and are not wanted)
export function parseMasterIdx(text, forms) { const out = []; for (const line of String(text).split('\n')) { const p = line.split('|'); if (p.length !== 5 || !/^\d+$/.test(p[0])) continue; if (!forms.has(p[2].trim())) continue; out.push({ cik: String(+p[0]), name: p[1].trim(), form: p[2].trim(), date: p[3].trim(), file: p[4].trim() }); } return out; }
// group rows by filing: [{ file, date, form, ciks: [...] }]
export function byFiling(rows) { const m = new Map(); for (const r of rows) { const x = m.get(r.file) || m.set(r.file, { file: r.file, date: r.date, form: r.form, ciks: [] }).get(r.file); if (!x.ciks.includes(r.cik)) x.ciks.push(r.cik); } return [...m.values()]; }
// ---------------- 13F best ideas ----------------
// filings: [{ mgr, pos: Map cusip -> USD value }] for one report period. Managers with minPos..maxPos positions. The aggregate weight of a
// CUSIP = its share of the summed value of ALL filings. Best idea = argmax(manager weight - aggregate weight). Returns Map cusip -> count.
export function bestIdeas(filings, minPos = 20, maxPos = 300) { const agg = new Map(); let tot = 0; for (const f of filings) for (const [c, v] of f.pos) { if (!(v > 0)) continue; agg.set(c, (agg.get(c) || 0) + v); tot += v; }
  const out = new Map(); if (!(tot > 0)) return out;
  for (const f of filings) { const n = [...f.pos.values()].filter(v => v > 0).length; if (n < minPos || n > maxPos) continue; let s = 0; for (const v of f.pos.values()) if (v > 0) s += v; if (!(s > 0)) continue;
    let best = null, bv = -Infinity; for (const [c, v] of f.pos) { if (!(v > 0)) continue; const d = v / s - agg.get(c) / tot; if (d > bv) { bv = d; best = c; } } if (best) out.set(best, (out.get(best) || 0) + 1); }
  return out; }
// ---------------- dividends ----------------
// rows: [{ sym, decl, type }] (any order). An initiation = a regular cash dividend (type 'CD') declared on or after `from` with no
// dividend of any type by the same symbol declared in the previous lookback days. One per symbol per lookback window.
export function divInitiations(rows, from, lookback = 730) { const by = new Map(); for (const r of rows) if (r && r.sym && r.decl) (by.get(r.sym) || by.set(r.sym, []).get(r.sym)).push(r);
  const out = []; for (const [sym, a] of by) { a.sort((x, y) => x.decl < y.decl ? -1 : 1); for (let i = 0; i < a.length; i++) { const r = a[i]; if (r.type !== 'CD' || r.decl < from) continue;
    const lim = new Date(Date.parse(r.decl + 'T00:00:00Z') - lookback * 864e5).toISOString().slice(0, 10); if (a.slice(0, i).some(q => q.decl >= lim && q.decl < r.decl)) continue; if (a.slice(0, i).some(q => q.decl === r.decl)) continue; out.push({ sym, d: r.decl }); } }
  return out.sort((x, y) => x.d < y.d ? -1 : 1); }
// ---------------- emerging industry leadership (coordinator, pre-registered above) ----------------
export const EIL = { brUp: 0.20, brMin: 0.50, rkUp: 0.25, rkMin: 0.70, look: 20, rsLen: 63, minMembers: 5 };
export const eilIndustryOk = (brNow, brPrev, nhNow, nhPrev) => ok(brNow) && ok(brPrev) && ok(nhNow) && ok(nhPrev) && brNow - brPrev >= EIL.brUp && brNow >= EIL.brMin && nhNow > nhPrev;
export const eilStockOk = (rkNow, rkPrev) => ok(rkNow) && ok(rkPrev) && rkNow - rkPrev >= EIL.rkUp && rkNow >= EIL.rkMin;
// ---------------- the same stock on its other days ----------------
// average return of windows of `len` sessions (buy the open of u, sell the close of u + len - 1), u every `step` sessions from `from` to
// `to`, where okAt(u) is true (e.g. liquid the session before, same half) and the window does not overlap any [k, x] in `busy`.
// ret(u, x) -> the return or null. 3+ windows needed, else null.
export function ownAverage({ from, to, len, step = 10, okAt, busy = [], ret }) { const v = []; for (let u = from; u + len - 1 <= to; u += step) { if (!okAt(u)) continue; const x = u + len - 1; if (busy.some(([a, b]) => u <= b && x >= a)) continue; const g = ret(u, x); if (ok(g) && Math.abs(g) < 3) v.push(g); } return v.length >= 3 ? mean(v) : null; }
// ---------------- paper board ----------------
export function boardStats(rows) { const net = rows.map(r => r.g - COST), win = net.filter(x => x > 0), loss = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => r.g - r.c))) : null, avgWin: win.length ? r4(sum(win) / win.length) : null, avgLoss: loss.length ? r4(sum(loss) / loss.length) : null,
    pf: loss.length && sum(loss) < 0 ? r4(sum(win) / -sum(loss)) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
// the shape of a 5-year trade list (information): win rate, average win / loss, profit factor, by year
export function shapeOf(tr, yearOf) { const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0), by = {};
  tr.forEach((z, i) => { const y = yearOf(z); (by[y] = by[y] || []).push(net[i]); });
  return { trades: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, pf: l.length && sum(l) < 0 ? r4(sum(w) / -sum(l)) : null,
    byYear: Object.fromEntries(Object.keys(by).sort().map(y => [y, { n: by[y].length, avg: r4(mean(by[y])), win: r4(by[y].filter(x => x > 0).length / by[y].length) }])) }; }
// ---------------- library pre-registration (written before any run; idempotent) ----------------
// LB = data/strategy-library.json parsed. Adds every ANOM-* entry that is missing; returns how many were added.
export function preRegister(LB) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, a] of [...Object.entries(ANOMALIES), ...Object.entries(NEEDS_DATA)]) { if (LB.strategies.some(e => e.id === id)) continue; const nd = id in NEEDS_DATA;
    LB.strategies.push({ id, family: 'Published anomalies', name: a.name, explain: nd ? 'NOT RUN: ' + a.why : a.rule + ' Paper(s): ' + a.papers.map(p => p.cite).join('; ') + '. Reported: ' + a.reported + '. Replication: ' + a.replication + '.',
      status: nd ? 'needs data' : 'pre-registered 23 Oct 2026 (anomaly lab); 5-year one-shot pending', agent: 'anomaly', libraryCheck: a.lib, sources: [...a.papers, ...(a.refs || [])].filter(p => p.url).map(p => p.url),
      note: nd ? 'Registered so it is not lost; no data in the repository.' : 'Pre-registered 23 Oct 2026 BEFORE any run (anomaly-core.mjs = the exact rule; one version; hold ' + a.hold + ' sessions). 5-year one-shot by anomaly-lab.mjs, first complete verdict frozen in data/anomaly-lab.json; forward paper lane (data/anomaly-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = '2026-10-23'; return ch; }
