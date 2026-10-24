// SQUAD 9 CORE: YOUTUBE STRATEGY TESTERS (24 Oct 2026; the owner sent three channels: DaviddTech, The Moving Average, Quant Guild, and asked
// whether their backtested claims hold up after costs and on unseen years). Pure functions, no network, no files. Used by squad9-lab.mjs
// and test/squad9-core.test.mjs. Long only; no leverage; no shorting; never places an order.
//
// PRE-REGISTERED 24 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids SQ9-*; the same text is written into
// data/strategy-library.json by squad9-lab.mjs before its first computation). The rules were read from the videos' transcripts and
// descriptions (research table: SOURCES below). Every channel rule was published for 1-minute to 1-hour bars on crypto / forex; on
// US stocks they run on DAILY bars, so each carries a replication label:
//   faithful = the published entry AND exit, only the market and bar size change (still a proxy of the timeframe, said so);
//   partial  = the entry is the published one, the exit (or one filter) had to be chosen because the video did not give it;
//   proxy    = a daily-bar translation of an intraday idea (session ranges, pips) with the parameters stated here.
// COMMON CONVENTIONS (all rules):
//   UNIVERSE = every US stock in the 5-year whole-market cache incl. dead ones; LIQUID on the signal day = close 5 USD+ and 20-session
//   average traded value 5M USD+ (SPY and the funds excluded). Signal at the close of session t (every input known at that close);
//   entry = the OPEN of t+1 (FIB: a limit order, see SQ9-TMA-FIB). One open trade per stock per rule.
//   BRACKET EXITS on daily bars: stop and target are set from the entry price; each session from the entry day on: if the low reaches the
//   stop -> out at the stop (or at the open if it gapped through); else if the high reaches the target -> out at the target (or the open
//   if it gapped over); BOTH on the same day -> the STOP is assumed first (conservative: the daily bar does not show the order). A
//   half taken at 1R moves the other half's stop to the entry price from the NEXT session. A close-based exit (SSL cross down, back to the
//   Kalman mean) sells at that close. MAX HOLD: out at the close of the last allowed session. Dead stock: out at its last close.
//   COST 0.8% round trip (1.2% stress); gross returns capped at +300% for the rule and the yardstick alike (engine audit AUD-1).
//   JUDGED at the system standard (value-core judge): halves = signal before / from 2024-01-01; both > 0 after 0.8% and 1.2%, better than
//   the average liquid stock over the same entry-to-exit sessions, better than the same stock on its other days, > 0 without the 2 best,
//   block t >= 2.5 (blocks = the rule's max hold) -> TRADABLE SMALL; block t >= the proof bar -> PROVEN.
//   CHANNEL STYLE (information, not a verdict): the same rule on SPY alone and on QQQ alone, every trade at 0.8% and at 0.1% (an ETF
//   round trip), win rate, profit factor, compounded return vs buy-and-hold, per half: the owner's "does the YouTuber's claim hold?".
// HOUSE BRACKET (DaviddTech's own exit in his videos when the strategy video does not give one: "ATR bands" by AlexanderTeaH, ATR 14 x 3
// below the entry as the stop, take profit at 1.5x the risk): stop = entry - 3 x ATR14 (ATR at the signal close), target = entry + 1.5 x
// that distance, max hold 40 sessions.
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', CAP = 3;
const V = (title, url, date, channel) => ({ title, url, date, channel });
export const RULES = {
  'SQ9-DT-3ST': { channel: 'DaviddTech', label: 'faithful (timeframe proxy: 15-minute BTC/USDT -> daily US stocks)', maxHold: 40,
    name: 'Triple Supertrend + volume + Stochastic RSI pullback (DaviddTech / Traders Landing)',
    video: V('WOW! 87% WIN RATE SuperTrend with Volume Trading Strategy.', 'https://www.youtube.com/watch?v=WlWhoVEJaTA', '2022-01-17', 'DaviddTech'),
    rule: 'Close above its 200-day EMA; at least 2 of 3 Supertrends green (ATR 10 x 1, ATR 11 x 2, ATR 12 x 3, hl2 source, Wilder ATR); Time Segmented Volume (13-session sum of volume x close change) above 0; Stochastic RSI (RSI 14, stoch 14, K 3, D 3): K crosses above D, the pullback had K or D under 20 on the previous session, and neither line is at 80+. Buy the next open. Stop = the previous swing low (lowest low of the 10 sessions before the entry) or the furthest green Supertrend line, whichever is further away. Half sold at 1R (the other half\'s stop moves to the entry), the other half at 2R. Max hold 40 sessions.',
    claim: { text: '131 trades, 74% win, profit factor 1.61, +187% net in about 6 months, max drawdown 22% (BTC/USDT 15-minute). That result already included filters he added while coding (Hull MA 100, ADX, a volume filter) and an optimiser; title says 87%, description 80%.', trades: 131, win: 0.74, pf: 1.61, ret: 1.87, market: 'BTC/USDT', timeframe: '15m', costs: 'not stated', outOfSample: 'no (about 6 months, optimised on the same data)' },
    lib: 'T16 (Supertrend / ADX filters) was never run on its own (marked covered by T4); none with TSV and a Stochastic-RSI trigger' },
  'SQ9-DT-KST': { channel: 'DaviddTech', label: 'partial (exit not given in the video: DaviddTech house bracket)', maxHold: 40,
    name: 'Know Sure Thing cross under zero in an uptrend (DaviddTech "better than the MACD")',
    video: V('Extremely More Profitable than the MACD Trading Strategy | Tested 100 Times', 'https://www.youtube.com/watch?v=oceOcXBV6Yk', '2021-09-10', 'DaviddTech'),
    rule: 'Close above its 200-day EMA; KST (Pring, TradingView defaults: ROC 10/15/20/30, smoothed 10/10/10/15, weights 1-4, signal SMA 9) crosses above its signal line while the KST is below zero. Buy the next open. House bracket: stop entry - 3 x ATR14, target 1.5x the risk, max 40 sessions.',
    claim: { text: '156 trades, 46.8% win, +45.75% net (1-hour chart; same settings MACD gave 96 trades, 44% win, +16.8%).', trades: 156, win: 0.468, ret: 0.4575, market: 'crypto (BTC chart shown)', timeframe: '1h', costs: 'not stated', outOfSample: 'no' },
    lib: 'DEC2-APPEL is a two-MACD rule; no KST rule' },
  'SQ9-DT-MACD': { channel: 'DaviddTech', label: 'partial (the video\'s comparison rule; exit not given: house bracket)', maxHold: 40,
    name: 'MACD cross under zero in an uptrend (the control in the KST video)',
    video: V('Extremely More Profitable than the MACD Trading Strategy | Tested 100 Times', 'https://www.youtube.com/watch?v=oceOcXBV6Yk', '2021-09-10', 'DaviddTech'),
    rule: 'Close above its 200-day EMA; MACD (12, 26, 9 EMA) line crosses above its signal line while the MACD line is below zero. Buy the next open. House bracket: stop entry - 3 x ATR14, target 1.5x the risk, max 40 sessions.',
    claim: { text: '96 trades, 44% win, +16.8% net (1-hour; the KST version did better).', trades: 96, win: 0.44, ret: 0.168, market: 'crypto', timeframe: '1h', costs: 'not stated', outOfSample: 'no' },
    lib: 'DEC2-APPEL (two MACDs, trend exit) differs; the plain under-zero cross above the 200 EMA was never run' },
  'SQ9-DT-WQM': { channel: 'DaviddTech', label: 'faithful (timeframe proxy: 1-hour BTC/USDT -> daily US stocks)', maxHold: 40,
    name: 'Waddah Attar Explosion + QQE Mod + McGinley Dynamic (DaviddTech "1794%")',
    video: V('INSANE 1794,42%+ HIGHLY PROFITABLE Trading Strategy- Waddah Attar + QQE + MCGinley', 'https://www.youtube.com/watch?v=UjY3Zq2-8ic', '2023-03-06', 'DaviddTech'),
    rule: 'Close above the McGinley Dynamic 150; QQE Mod (Mihkel00 defaults: RSI 6, smoothing 5, QQE 3 and 1.61, threshold 3, Bollinger 50 x 0.35) bar blue (both QQE conditions bullish) and the second RSI line above the QQE line; Waddah Attar Explosion (LazyBear defaults: sensitivity 150, MACD 20/40, BB 20 x 2, dead zone = Wilder ATR 100 x 3.7) green bar above both the explosion line and the dead zone. Buy the next open. Stop = entry - 3 x ATR14, but never more than 2.5% below the entry; target 1.5x the risk; max 40 sessions.',
    claim: { text: '166 trades, 60% win, profit factor 2.38, +1794% (leveraged up to 25x), max drawdown 24% (BTC/USDT 1-hour, April 2022 to March 2023).', trades: 166, win: 0.60, pf: 2.379, ret: 17.94, market: 'BTC/USDT', timeframe: '1h', costs: 'not stated', outOfSample: 'no (one year, settings chosen on it)' },
    lib: 'none (no WAE, QQE or McGinley rule in the library)' },
  'SQ9-DT-SSLW': { channel: 'DaviddTech', label: 'faithful (timeframe proxy: 30-minute BTC/USDT -> daily US stocks; ATR band multiplier 2 as in the video)', maxHold: 40,
    name: 'SSL channel cross + Waddah Attar + 200 EMA (DaviddTech / Traders Landing)',
    video: V('High Win Rate + High Profit | Complete System | SSL + ATR + WAE + EMA | FOREX CRYPTO & STOCKS', 'https://www.youtube.com/watch?v=WhMMFzw2qDE', '2022-05-09', 'DaviddTech'),
    rule: 'Close above its 200-day EMA; SSL channel 21 (SMA 21 of highs and of lows) crosses up (the close goes above the high-average after being below the low-average); Waddah Attar Explosion green bar above the explosion line and the dead zone. Buy the next open. Stop = entry - 2 x ATR14; half sold at 1R, the other half\'s stop moves to the entry and it is sold at the close of the next SSL cross down (or the break-even stop); max 40 sessions.',
    claim: { text: 'His faithful version: 584 trades, 65% win, NET LOSS -47% (BTC/USDT 30-minute). His "improved" version (multiple entries, 2% max stop, ADX filter): 764 trades 73% win profit factor 1.23 +408%; on 2017-2022 deep history 2,399 trades 71% win, profit factor 1.19, +1,256%, max drawdown 67%.', trades: 584, win: 0.65, ret: -0.47, market: 'BTC/USDT', timeframe: '30m', costs: 'not stated', outOfSample: 'partly (deep history 2017-2022 for the improved version, after tuning)' },
    lib: 'none' },
  'SQ9-DT-HDIV': { channel: 'DaviddTech', label: 'partial (the video used fixed percentage exits it did not state: house bracket)', maxHold: 40,
    name: 'Hidden bullish MACD divergence in an uptrend (DaviddTech "stop using the RSI")',
    video: V('Simple Trading Strategy "STOP Using the RSI" Tested 100 Times', 'https://www.youtube.com/watch?v=5ML87TuLVFk', '2021-10-11', 'DaviddTech'),
    rule: 'EMA 50 above EMA 400; hidden bullish divergence on the MACD line (12/26): a pivot low of the MACD line (5 sessions each side, confirmed 5 sessions later) that is LOWER than the previous MACD pivot low 5-60 sessions earlier, while the price low at the new pivot is HIGHER than the price low at the previous one. Signal on the confirmation session; buy the next open. House bracket: stop entry - 3 x ATR14, target 1.5x the risk, max 40 sessions.',
    claim: { text: '138 trades, 84% win, +149% net, profit factor 2.7, max drawdown 11% - the best of about 9 oscillators he tried on the same chart (RSI gave 69.6% win and +0.93%).', trades: 138, win: 0.84, pf: 2.7, ret: 1.49, market: 'crypto (BTC)', timeframe: 'not stated (intraday)', costs: 'not stated', outOfSample: 'no (picked the best of ~9 oscillators x regular/hidden on one sample)' },
    lib: 'none (no divergence rule)' },
  'SQ9-TMA-3LS': { channel: 'The Moving Average', label: 'proxy (5-minute forex pips -> daily bars: the 10-pip stop is one signal-candle length)', maxHold: 20,
    name: 'Three-line strike with the trend (The Moving Average\'s favourite candle)',
    video: V('Best Candle Formation for 5 Minute Scalping', 'https://www.youtube.com/watch?v=RyTlRkMujuk', '2022-07-12', 'The Moving Average'),
    rule: 'Uptrend: smoothed (Wilder) MAs 21 > 50 > 200 and the close above all three. Three down candles in a row, each closing lower, then one up candle that opens at or below the previous close and closes above the open of the first of the three (engulfs them). Buy the next open. Stop = entry - the signal candle\'s high-low range; target = 2x the risk; max 20 sessions.',
    claim: { text: '"Consistently gets me a 70 to 75% win rate when I trade during my market hours"; 8 winners out of 8 in the example trend (AUD/USD 5-minute, 10-pip stop, 20-pip target).', win: 0.725, market: 'forex (AUD/USD, GBP/USD)', timeframe: '5m', costs: 'not stated', outOfSample: 'no (his own trading, no trade list)' },
    lib: 'DEC2-NISON (engulfing / hammer at a 20-day low) differs; no three-line strike' },
  'SQ9-TMA-TREND': { channel: 'The Moving Average', label: 'proxy (5-minute forex session scalp -> daily bars)', maxHold: 20,
    name: 'Trend scalp: stacked SMMAs + engulfing (or 3-line strike) + RSI over 50 (The Moving Average "highest win rate")',
    video: V('5 Minute Scalping Strategy **HIGHEST WIN RATE**', 'https://www.youtube.com/watch?v=wbfXaqjIrJ0', '2021-08-05', 'The Moving Average'),
    rule: 'Smoothed MAs 21 > 50 > 200 and the close above all three; the signal candle is a bullish engulfing (up candle, previous candle down, opens at or below the previous close and closes at or above the previous open) or a three-line strike; RSI 14 above 50. Buy the next open. Stop = entry - 2 x the signal candle\'s high-low range; target = 2x the risk; max 20 sessions.',
    claim: { text: '"Highest win rate"; no trade statistics. 1% risk for 2% reward, "24% gain on your account each month" is an example calculation, not a result.', market: 'forex (AUD/USD)', timeframe: '5m', costs: 'not stated', outOfSample: 'no statistics given' },
    lib: 'DEC2-NISON / DEC2-PB differ (engulfing at a low; 21-EMA pullback); none with the SMMA stack + RSI 50' },
  'SQ9-TMA-FIB': { channel: 'The Moving Average', label: 'proxy (1-minute EUR/USD -> daily bars; swing points defined mechanically)', maxHold: 20,
    name: 'Fibonacci 0.618 golden-pocket pullback after a break of structure (The Moving Average)',
    video: V('1 Minute Fibonacci Scalping Strategy Backtested 100 TIMES', 'https://www.youtube.com/watch?v=2GAAK_JhNW0', '2025-07-18', 'The Moving Average'),
    rule: 'Impulse: the highest high of the last 11 sessions (H) was made 2-10 sessions ago; L = the lowest low of the 20 sessions before H; H is above the highest high of the 40 sessions before L (break of structure) and H - L is at least 3 x ATR14; no low since H has reached the 0.618 level E = H - 0.618 x (H - L). Then a buy limit at E for the next 10 sessions (filled at E, or at the open if it opens below E). Stop at L (the 1.0 level); target H (the previous high, about 1:1.6); max 20 sessions after the fill.',
    claim: { text: '100 trades on EUR/USD 1-minute over 12 days (London to New York session); "substantially more wins than losses" at 1:1.5-1.6; exact figures only on screen.', trades: 100, market: 'forex (EUR/USD)', timeframe: '1m', costs: 'not stated', outOfSample: 'no (12 days)' },
    lib: 'none (no Fibonacci rule)' },
  'SQ9-QG-KALMAN': { channel: 'Quant Guild', label: 'proxy (1-minute bars, 60-bar calibration -> daily bars, 60-session calibration)', maxHold: 20,
    name: 'Kalman-filter mean reversion: buy 2 standard deviations under the adaptive mean (Quant Guild)',
    video: V('Trading Mean Reversion with Kalman Filters', 'https://www.youtube.com/watch?v=BuPil7nXvMU', '2026-03-03', 'Quant Guild'),
    rule: 'x = log close. Measurement noise R = variance of x minus its 60-session average over the last 60 sessions; process noise Q = R / 100 ("trust the model more"); local-level Kalman filter mean m. z = (x - m) / sqrt(R). Signal when z falls to -2 or below (above -2 the session before). Buy the next open; sell at the first close at or above the Kalman mean; max 20 sessions; no stop (as in the video).',
    claim: { text: 'No backtest figure: the video shows a simulated mean-reverting (Ornstein-Uhlenbeck) path where trading around the estimated mean makes money, and warns that real prices are not stationary and the edge can vanish.', market: 'any (demo on a stock, 1-minute)', timeframe: '1m', costs: 'n/a', outOfSample: 'n/a (theory demonstration)' },
    lib: 'A-SW1 / DEC2-RSI2 / M-series are oversold rules on fixed indicators; no adaptive (Kalman) mean' },
};
export const IDS = Object.keys(RULES);
// the research table: every candidate video looked at, with why it was or was not tested (written into data/squad9-lab.json)
export const SOURCES = [
  { channel: 'DaviddTech', title: 'Trading on steroids - How to Beat the Market Using These Three Indicators!', url: 'https://www.youtube.com/watch?v=Komcrvd7gKg', date: '2023-03-13', rules: 'Supertrend green + price above Fantail VMA + zero-lag MACD above signal; ATR 14 x 3 stop, 1.3R target, max stop 2.5%, flat at weekends', claim: '450 trades, 49% win, profit factor 1.38, +2332% with up to 25x leverage, max drawdown 33%, Sharpe 0.58 (BTC/USDT 1h; "optimised for a couple of hours")', costs: 'not stated', oos: 'no', tested: 'no: the Fantail VMA has no published formula outside one TradingView script; the KST / MACD / Supertrend parts are tested in other SQ9 rules' },
  { channel: 'DaviddTech', title: 'Are Double Tops & Bottoms A Hugely Profitable Trading Strategy?', url: 'https://www.youtube.com/watch?v=ScKymEly460', claim: '168 trades, 47% win, +43% (1h, settings from his optimiser)', costs: 'not stated', oos: 'no', tested: 'no: double bottom is already queued in the library (A-CP1)' },
  { channel: 'DaviddTech', title: 'I Built an INSANELY Profitable AI Trading Bot for Stocks (Full Guide)', url: 'https://www.youtube.com/watch?v=zfEnBDG-u6s', claim: 'AI loop tested 1,368 strategies, 277 "passed"; one shown at +473%, profit factor 1.7; he says 99% of strategies fail on unseen data and to include fees and slippage', costs: 'advised, not shown', oos: 'advised (1-3 months incubation)', tested: 'no: no rule is published (black box)' },
  { channel: 'DaviddTech', title: 'I Let Claude Fable 5 Test 143,000 Trading Strategies (HERE ARE THE BEST)', url: 'https://www.youtube.com/watch?v=VX9RSOjHVlA', claim: '142,537 backtests, 99.1% failed, 196 survived his filters; mostly crypto, 1h-4h', costs: 'not stated', oos: 'an "overfit detector", not described', tested: 'no: no single rule is published; his own number (under 1% survive) is the honest headline' },
  { channel: 'The Moving Average', title: '15-Min ORB Strategy: Why Most Traders Lose (And How to Fix It)', url: 'https://www.youtube.com/watch?v=jlShztsY3oA', claim: 'the plain 15-minute ORB on gold: 2 wins, 5 losses in 8 days (-0.5%)', costs: 'no', oos: 'no', tested: 'no: opening-range breakouts already tested (A-ORB1, SQ2-ORB5/ORB30: rejected)' },
  { channel: 'The Moving Average', title: 'The Easiest Day Trading Strategy (Tokyo range breakout)', url: 'https://www.youtube.com/watch?v=oQxfd2QuKbM', claim: 'EUR/USD: 7 days 60% win PF 3.4; 30 days 63% win PF 3.8 (the numbers in the video do not add up: 14 losers and 8 winners); 90 days 46% win PF 1.6', costs: 'no', oos: 'no', tested: 'no: needs the Tokyo forex session; US stocks do not trade then' },
  { channel: 'The Moving Average', title: 'Moving Average Crossover: DONT DO IT', url: 'https://www.youtube.com/watch?v=b2QpsIdEkfk', claim: 'crossovers fail (no statistics)', costs: 'n/a', oos: 'n/a', tested: 'no: MA crosses are queued in the library (T7, T15) and DEC2-GOLDX is in paper' },
  { channel: 'Quant Guild', title: 'How to Protect your Stock Portfolio from Market Crashes', url: 'https://www.youtube.com/watch?v=Z3w8TpH7kYw', claim: 'monthly 20-delta puts as insurance; buy the fire sale', costs: 'option premium discussed', oos: 'n/a', tested: 'no: options (not halal-screened; the options lab is separate)' },
  { channel: 'Quant Guild', title: 'Market Neutral Trading Strategies', url: 'https://www.youtube.com/watch?v=3N1yODNF8jI', claim: 'education', costs: 'n/a', oos: 'n/a', tested: 'no: long-short, not for this system (Z1/Z2)' },
  { channel: 'Quant Guild', title: 'How to Quant Trade in 3 Minutes / How a Quant would Invest $1,000,000', url: 'https://www.youtube.com/watch?v=mZLNzqDZHbA', claim: 'short implied volatility edge; treasuries vs SPY vs private equity illustrations', costs: 'n/a', oos: 'n/a', tested: 'no: no stock rule (volatility selling is not for this system: Z7)' },
];

// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
const F = (n) => new Float64Array(n).fill(NaN);

// ---------------- indicators (input arrays may hold NaN: an indicator restarts after a missing bar) ----------------
export function sma(x, n) { const o = F(x.length); let s = 0, c = 0; for (let t = 0; t < x.length; t++) { if (!ok(x[t])) { s = 0; c = 0; continue; } s += x[t]; c++; if (c > n) { s -= x[t - n]; c = n; } if (c === n) o[t] = s / n; } return o; }
export function stdev(x, n) { const o = F(x.length); for (let t = n - 1; t < x.length; t++) { let s = 0, q = 0, bad = false; for (let k = t - n + 1; k <= t; k++) { if (!ok(x[k])) { bad = true; break; } s += x[k]; q += x[k] * x[k]; } if (!bad) { const m = s / n; o[t] = Math.sqrt(Math.max(0, q / n - m * m)); } } return o; }   // population sd (TradingView ta.stdev)
// EMA seeded by the SMA of the first n values (TradingView ta.ema); alpha override for RMA
export function ema(x, n, alpha = 2 / (n + 1)) { const o = F(x.length); let e = NaN, s = 0, c = 0; for (let t = 0; t < x.length; t++) { if (!ok(x[t])) { e = NaN; s = 0; c = 0; continue; } if (!ok(e)) { s += x[t]; c++; if (c === n) { e = s / n; o[t] = e; } continue; } e = alpha * x[t] + (1 - alpha) * e; o[t] = e; } return o; }
export const rma = (x, n) => ema(x, n, 1 / n);
export function trueRange(h, l, c) { const o = F(c.length); for (let t = 0; t < c.length; t++) { if (!ok(h[t]) || !ok(l[t])) continue; o[t] = t > 0 && ok(c[t - 1]) ? Math.max(h[t] - l[t], Math.abs(h[t] - c[t - 1]), Math.abs(l[t] - c[t - 1])) : h[t] - l[t]; } return o; }
export const atr = (h, l, c, n) => rma(trueRange(h, l, c), n);
export function rsi(c, n) { const up = F(c.length), dn = F(c.length); for (let t = 1; t < c.length; t++) if (ok(c[t]) && ok(c[t - 1])) { const d = c[t] - c[t - 1]; up[t] = Math.max(d, 0); dn[t] = Math.max(-d, 0); }
  const u = rma(up, n), d = rma(dn, n), o = F(c.length); for (let t = 0; t < c.length; t++) if (ok(u[t]) && ok(d[t])) o[t] = d[t] === 0 ? 100 : u[t] === 0 ? 0 : 100 - 100 / (1 + u[t] / d[t]); return o; }
export function stochOf(x, n) { const o = F(x.length); for (let t = n - 1; t < x.length; t++) { let lo = Infinity, hi = -Infinity, bad = false; for (let k = t - n + 1; k <= t; k++) { if (!ok(x[k])) { bad = true; break; } lo = Math.min(lo, x[k]); hi = Math.max(hi, x[k]); } if (!bad) o[t] = hi > lo ? 100 * (x[t] - lo) / (hi - lo) : 50; } return o; }
export function stochRsi(c, lenRsi = 14, lenSt = 14, k = 3, d = 3) { const K = sma(stochOf(rsi(c, lenRsi), lenSt), k); return { k: K, d: sma(K, d) }; }
// Supertrend (KivancOzbilgic / TradingView classic): src hl2, Wilder ATR; trend 1 = green (line below price), -1 = red
export function supertrend(h, l, c, n, mult) { const a = atr(h, l, c, n), T = c.length, trend = new Int8Array(T), line = F(T); let up1 = NaN, dn1 = NaN, tr = 1;
  for (let t = 0; t < T; t++) { if (!ok(a[t]) || !ok(c[t])) { up1 = NaN; dn1 = NaN; tr = 1; continue; } const src = (h[t] + l[t]) / 2; let up = src - mult * a[t], dn = src + mult * a[t];
    if (ok(up1) && ok(c[t - 1]) && c[t - 1] > up1) up = Math.max(up, up1); if (ok(dn1) && ok(c[t - 1]) && c[t - 1] < dn1) dn = Math.min(dn, dn1);
    if (tr === -1 && ok(dn1) && c[t] > dn1) tr = 1; else if (tr === 1 && ok(up1) && c[t] < up1) tr = -1;
    trend[t] = tr; line[t] = tr === 1 ? up : dn; up1 = up; dn1 = dn; } return { trend, line }; }
// Time Segmented Volume (liw0 / TradingView): sum over n of volume x (close - previous close)
export function tsv(c, v, n = 13) { const x = F(c.length); for (let t = 1; t < c.length; t++) if (ok(c[t]) && ok(c[t - 1]) && ok(v[t])) x[t] = v[t] * (c[t] - c[t - 1]); const s = sma(x, n), o = F(c.length); for (let t = 0; t < c.length; t++) if (ok(s[t])) o[t] = s[t] * n; return o; }
export function roc(c, n) { const o = F(c.length); for (let t = n; t < c.length; t++) if (ok(c[t]) && c[t - n] > 0) o[t] = 100 * (c[t] - c[t - n]) / c[t - n]; return o; }
export function kst(c) { const a = sma(roc(c, 10), 10), b = sma(roc(c, 15), 10), d = sma(roc(c, 20), 10), e = sma(roc(c, 30), 15), k = F(c.length);
  for (let t = 0; t < c.length; t++) if (ok(a[t]) && ok(b[t]) && ok(d[t]) && ok(e[t])) k[t] = a[t] + 2 * b[t] + 3 * d[t] + 4 * e[t]; return { line: k, signal: sma(k, 9) }; }
export function macd(c, fast = 12, slow = 26, sig = 9) { const f = ema(c, fast), s = ema(c, slow), m = F(c.length); for (let t = 0; t < c.length; t++) if (ok(f[t]) && ok(s[t])) m[t] = f[t] - s[t]; return { line: m, signal: ema(m, sig) }; }
// McGinley Dynamic (TradingView): seeded with the EMA, then md += (src - md) / (n x (src / md)^4)
export function mcginley(c, n) { const e = ema(c, n), o = F(c.length); let m = NaN; for (let t = 0; t < c.length; t++) { if (!ok(c[t])) { m = NaN; continue; } if (!ok(m)) { if (ok(e[t])) m = e[t]; o[t] = m; continue; } m = m + (c[t] - m) / (n * Math.pow(c[t] / m, 4)); o[t] = m; } return o; }
// Waddah Attar Explosion (LazyBear): trendUp > 0 green; explosion = BB width; dead zone = RMA(TR,100) x 3.7
export function wae(h, l, c, sens = 150, fast = 20, slow = 40, bbLen = 20, bbMult = 2) { const m = macd(c, fast, slow, 9).line, b = sma(c, bbLen), s = stdev(c, bbLen), dz = rma(trueRange(h, l, c), 100), T = c.length, up = F(T), exp = F(T), dead = F(T);
  for (let t = 1; t < T; t++) { if (ok(m[t]) && ok(m[t - 1])) { const t1 = (m[t] - m[t - 1]) * sens; up[t] = t1 >= 0 ? t1 : 0; } if (ok(b[t]) && ok(s[t])) exp[t] = 2 * bbMult * s[t]; if (ok(dz[t])) dead[t] = dz[t] * 3.7; } return { up, exp, dead }; }
// one QQE line (Mihkel00 QQE MOD): smoothed RSI and its trailing level
function qqeLine(c, len, sf, q) { const r = rsi(c, len), rm = ema(r, sf), T = c.length, d1 = F(T); for (let t = 1; t < T; t++) if (ok(rm[t]) && ok(rm[t - 1])) d1[t] = Math.abs(rm[t - 1] - rm[t]);
  const wp = len * 2 - 1, dar = ema(ema(d1, wp), wp), tl = F(T); let lb = NaN, sb = NaN, tr = 1, pr = NaN;
  for (let t = 0; t < T; t++) { if (!ok(dar[t]) || !ok(rm[t])) { lb = NaN; sb = NaN; tr = 1; pr = NaN; continue; } const D = dar[t] * q, nl = rm[t] - D, ns = rm[t] + D, plb = lb, psb = sb;
    lb = ok(plb) && ok(pr) && pr > plb && rm[t] > plb ? Math.max(plb, nl) : nl; sb = ok(psb) && ok(pr) && pr < psb && rm[t] < psb ? Math.min(psb, ns) : ns;
    if (ok(psb) && ok(pr) && pr <= psb && rm[t] > psb) tr = 1; else if (ok(plb) && ok(pr) && pr >= plb && rm[t] < plb) tr = -1;
    tl[t] = tr === 1 ? lb : sb; pr = rm[t]; } return { rm, tl }; }
export function qqeMod(c) { const A = qqeLine(c, 6, 5, 3), B = qqeLine(c, 6, 5, 1.61), T = c.length, x = F(T); for (let t = 0; t < T; t++) if (ok(A.tl[t])) x[t] = A.tl[t] - 50;
  const bas = sma(x, 50), dev = stdev(x, 50), blue = new Uint8Array(T), above = new Uint8Array(T);
  for (let t = 0; t < T; t++) { if (!ok(bas[t]) || !ok(B.rm[t]) || !ok(A.rm[t])) continue; const upper = bas[t] + 0.35 * dev[t]; blue[t] = B.rm[t] - 50 > 3 && A.rm[t] - 50 > upper ? 1 : 0; above[t] = ok(A.tl[t]) && B.rm[t] > A.tl[t] ? 1 : 0; }
  return { blue, above }; }
// SSL channel (ErwinBeckers): hlv = 1 when the close is above the SMA of highs, -1 under the SMA of lows, else unchanged
export function sslHlv(h, l, c, n) { const sh = sma(h, n), sl = sma(l, n), T = c.length, o = new Int8Array(T); let s = 0; for (let t = 0; t < T; t++) { if (!ok(sh[t]) || !ok(sl[t]) || !ok(c[t])) { s = 0; continue; } if (c[t] > sh[t]) s = 1; else if (c[t] < sl[t]) s = -1; o[t] = s; } return o; }
// pivot low of x at index p: x[p] strictly lowest of p-L..p+R (TradingView ta.pivotlow: lower than all left bars, not higher than the right)
export function isPivotLow(x, p, L = 5, R = 5) { if (p - L < 0 || p + R >= x.length || !ok(x[p])) return false; for (let k = p - L; k <= p + R; k++) { if (k === p) continue; if (!ok(x[k])) return false; if (k < p ? x[k] <= x[p] : x[k] < x[p]) return false; } return true; }
// hidden bullish divergence confirmed at session t (pivot at t-5): osc lower low, price higher low vs the previous osc pivot 5..60 sessions earlier
export function hiddenBullAt(osc, low, t, L = 5, R = 5, lo = 5, hi = 60) { const p = t - R; if (!isPivotLow(osc, p, L, R)) return false;
  for (let q = p - 1; q >= Math.max(0, p - hi); q--) { if (isPivotLow(osc, q, L, R)) { const gap = p - q; if (gap < lo || gap > hi) return false; return osc[p] < osc[q] && low[p] > low[q]; } } return false; }
// Kalman local-level mean of x = log close with R = rolling variance of (x - SMA n) over n sessions, Q = R x qr
export function kalmanZ(c, n = 60, qr = 0.01) { const T = c.length, x = F(T); for (let t = 0; t < T; t++) if (c[t] > 0) x[t] = Math.log(c[t]); const m60 = sma(x, n), dv = F(T); for (let t = 0; t < T; t++) if (ok(x[t]) && ok(m60[t])) dv[t] = x[t] - m60[t];
  const z = F(T), mean_ = F(T); let m = NaN, P = NaN; for (let t = 0; t < T; t++) { if (!ok(x[t])) { m = NaN; continue; } let R = NaN; if (t >= n - 1) { let s = 0, q = 0, k = 0; for (let j = t - n + 1; j <= t; j++) if (ok(dv[j])) { s += dv[j]; q += dv[j] * dv[j]; k++; } if (k >= n * 0.9) R = Math.max(1e-10, q / k - (s / k) ** 2); }
    if (!ok(R)) { m = NaN; continue; } if (!ok(m)) { m = x[t]; P = R; } P += R * qr; const K = P / (P + R); m = m + K * (x[t] - m); P = (1 - K) * P; mean_[t] = m; z[t] = (x[t] - m) / Math.sqrt(R); } return { z, mean: mean_ }; }

// ---------------- all indicators of one stock ----------------
export function indicators({ o, h, l, c, v }) {
  const T = c.length, ema200 = ema(c, 200), sr = stochRsi(c), st1 = supertrend(h, l, c, 10, 1), st2 = supertrend(h, l, c, 11, 2), st3 = supertrend(h, l, c, 12, 3);
  return { T, ema200, ema50: ema(c, 50), ema400: ema(c, 400), atr14: atr(h, l, c, 14), sr, st: [st1, st2, st3], tsv: tsv(c, v, 13), kst: kst(c), macd: macd(c), mcg: mcginley(c, 150), wae: wae(h, l, c), qqe: qqeMod(c),
    ssl: sslHlv(h, l, c, 21), smma21: rma(c, 21), smma50: rma(c, 50), smma200: rma(c, 200), rsi14: rsi(c, 14), kal: kalmanZ(c) };
}

// ---------------- the rules: signal at the close of t -> plan { stopDist, tp1R, tpR, beAfterTp1, closeExit, maxHold, limit } ----------------
// Each plan's stop / targets are distances from the entry price (fixed at the signal close: known before the entry open).
const bull = (o, c, t) => c[t] > o[t], bear = (o, c, t) => c[t] < o[t];
export function threeLineStrike(o, c, t) { if (t < 3) return false; for (const k of [t - 3, t - 2, t - 1]) if (!(ok(o[k]) && ok(c[k]) && bear(o, c, k))) return false;
  if (!(c[t - 2] < c[t - 3] && c[t - 1] < c[t - 2])) return false; return ok(o[t]) && ok(c[t]) && bull(o, c, t) && o[t] <= c[t - 1] && c[t] > o[t - 3]; }
export function bullEngulf(o, c, t) { return t >= 1 && ok(o[t]) && ok(c[t]) && ok(o[t - 1]) && ok(c[t - 1]) && bear(o, c, t - 1) && bull(o, c, t) && o[t] <= c[t - 1] && c[t] >= o[t - 1]; }
const stackUp = (I, c, t) => I.smma21[t] > I.smma50[t] && I.smma50[t] > I.smma200[t] && c[t] > I.smma21[t] && c[t] > I.smma50[t] && c[t] > I.smma200[t];
const crossUp = (a, b, t) => t >= 1 && ok(a[t]) && ok(b[t]) && ok(a[t - 1]) && ok(b[t - 1]) && a[t] > b[t] && a[t - 1] <= b[t - 1];
const house = (I, t) => ok(I.atr14[t]) && I.atr14[t] > 0 ? { stopDist: 3 * I.atr14[t], tpR: 1.5, maxHold: 40 } : null;
export function signalAt(id, I, P, t) { const { o, h, l, c } = P; if (t < 1 || !ok(c[t])) return null;
  switch (id) {
    case 'SQ9-DT-3ST': { if (!(c[t] > I.ema200[t]) || !(I.tsv[t] > 0)) return null; const g = I.st.filter(s => s.trend[t] === 1 && ok(s.line[t]) && s.line[t] < c[t]); if (g.length < 2) return null;
      const K = I.sr.k, D = I.sr.d; if (!crossUp(K, D, t) || !(Math.min(K[t - 1], D[t - 1]) < 20) || !(K[t] < 80 && D[t] < 80)) return null;
      let sw = Infinity; for (let k = t - 9; k <= t; k++) { if (k < 0 || !ok(l[k])) return null; sw = Math.min(sw, l[k]); } const far = Math.min(...g.map(s => s.line[t])), stopPx = Math.min(sw, far), dist = c[t] - stopPx;
      return dist > 0 ? { stopDist: dist, tp1R: 1, tpR: 2, beAfterTp1: true, maxHold: 40 } : null; }
    case 'SQ9-DT-KST': return c[t] > I.ema200[t] && crossUp(I.kst.line, I.kst.signal, t) && I.kst.line[t] < 0 ? house(I, t) : null;
    case 'SQ9-DT-MACD': return c[t] > I.ema200[t] && crossUp(I.macd.line, I.macd.signal, t) && I.macd.line[t] < 0 ? house(I, t) : null;
    case 'SQ9-DT-WQM': { if (!(c[t] > I.mcg[t]) || !I.qqe.blue[t] || !I.qqe.above[t]) return null; const w = I.wae; if (!(w.up[t] > 0 && w.up[t] > w.exp[t] && w.up[t] > w.dead[t])) return null;
      if (!(I.atr14[t] > 0)) return null; return { stopDist: Math.min(3 * I.atr14[t], 0.025 * c[t]), tpR: 1.5, maxHold: 40 }; }
    case 'SQ9-DT-SSLW': { if (!(c[t] > I.ema200[t]) || !(I.ssl[t] === 1 && I.ssl[t - 1] === -1)) return null; const w = I.wae; if (!(w.up[t] > 0 && w.up[t] > w.exp[t] && w.up[t] > w.dead[t])) return null;
      if (!(I.atr14[t] > 0)) return null; return { stopDist: 2 * I.atr14[t], tp1R: 1, tpR: null, beAfterTp1: true, closeExit: 'ssl', closeAfterHalf: true, maxHold: 40 }; }
    case 'SQ9-DT-HDIV': return I.ema50[t] > I.ema400[t] && hiddenBullAt(I.macd.line, l, t) ? house(I, t) : null;
    case 'SQ9-TMA-3LS': { if (!stackUp(I, c, t) || !threeLineStrike(o, c, t)) return null; const r = h[t] - l[t]; return r > 0 ? { stopDist: r, tpR: 2, maxHold: 20 } : null; }
    case 'SQ9-TMA-TREND': { if (!stackUp(I, c, t) || !(I.rsi14[t] > 50) || !(bullEngulf(o, c, t) || threeLineStrike(o, c, t))) return null; const r = h[t] - l[t]; return r > 0 ? { stopDist: 2 * r, tpR: 2, maxHold: 20 } : null; }
    case 'SQ9-TMA-FIB': return fibSetup(P, I, t);
    case 'SQ9-QG-KALMAN': { const z = I.kal.z; return ok(z[t]) && ok(z[t - 1]) && z[t] <= -2 && z[t - 1] > -2 ? { stopDist: null, tpR: null, closeExit: 'kalman', maxHold: 20 } : null; }
  } return null; }
// SQ9-TMA-FIB setup at the close of t (see the rule text): { limit, stopPx, tpPx, validFor, maxHold, key (the impulse high's session) }
export function fibSetup(P, I, t) { const { h, l, c } = P; if (t < 75 || !(I.atr14[t] > 0)) return null; let hi = -Infinity, ih = -1; for (let k = t - 10; k <= t; k++) { if (!ok(h[k]) || !ok(l[k])) return null; if (h[k] > hi) { hi = h[k]; ih = k; } }
  if (ih > t - 2) return null; let lo = Infinity, il = -1; for (let k = ih - 20; k < ih; k++) { if (!ok(l[k])) return null; if (l[k] < lo) { lo = l[k]; il = k; } }
  let prior = -Infinity; for (let k = il - 40; k < il; k++) { if (k < 0 || !ok(h[k])) return null; prior = Math.max(prior, h[k]); } if (!(hi > prior)) return null;
  const R = hi - lo; if (!(R >= 3 * I.atr14[t])) return null; const E = hi - 0.618 * R; for (let k = ih + 1; k <= t; k++) if (l[k] <= E) return null;
  return { limit: E, stopPx: lo, tpPx: hi, validFor: 10, maxHold: 20, key: ih }; }

// ---------------- the trade simulator (daily bars; see BRACKET EXITS in the header) ----------------
// P = { o, h, l, c } of one stock; k = entry session (bought at its open, or the limit fill session); plan from signalAt.
// closeExitAt(j) -> true when the close of j triggers the close-based exit. Returns { k, x, entry, exit, g, why } or { open: true } if the
// data ends first, or null if there is no entry (no open price / limit never filled).
export function simulate(P, k, plan, closeExitAt = () => false) { const { o, h, l, c } = P, T = c.length; if (k >= T) return { open: true };
  let entry, start = k;
  if (plan.limit) { let f = -1; for (let j = k; j < Math.min(T, k + plan.validFor); j++) { if (!ok(l[j]) || !ok(o[j])) continue; if (l[j] <= plan.limit) { f = j; entry = Math.min(o[j], plan.limit); break; } } if (f < 0) return k + plan.validFor > T ? { open: true } : null; start = f; }
  else { if (!ok(o[k]) || !(o[k] > 0)) return null; entry = o[k]; }
  const risk = plan.limit ? entry - plan.stopPx : plan.stopDist; if (plan.limit && !(risk > 0)) return null;
  const tp = plan.limit ? plan.tpPx : plan.tpR ? entry + plan.tpR * risk : null, tp1 = plan.tp1R ? entry + plan.tp1R * risk : null;
  let stop = plan.limit ? plan.stopPx : risk ? entry - risk : NaN, half = null, beArm = false, lastC = NaN, lastJ = -1; const last = start + plan.maxHold - 1;
  for (let j = start; j <= Math.min(last, T - 1); j++) { if (!ok(c[j]) || !ok(h[j]) || !ok(l[j])) continue;
    if (beArm) { stop = Math.max(ok(stop) ? stop : -Infinity, entry); beArm = false; }   // break-even from the session AFTER the 1R half
    const op = j === start ? entry : ok(o[j]) ? o[j] : c[j], gap = j > start; lastC = c[j]; lastJ = j;
    const finish = (px, why) => ({ k: start, x: j, entry, exit: px, g: (half === null ? px : (half + px) / 2) / entry - 1, why, half: half !== null });
    if (ok(stop) && l[j] <= stop) return finish(gap && op < stop ? op : stop, half !== null && stop >= entry ? 'breakeven' : 'stop');
    if (tp1 !== null && half === null && h[j] >= tp1) { half = gap && op > tp1 ? op : tp1; if (plan.beAfterTp1) beArm = true; }
    if (tp !== null && h[j] >= tp && (tp1 === null || half !== null)) return finish(gap && op > tp ? op : tp, 'target');
    if ((!plan.closeAfterHalf || half !== null) && closeExitAt(j)) return finish(c[j], 'signal');
    if (j === last) return finish(c[j], 'time'); }
  if (last <= T - 1 && lastJ >= 0) return { k: start, x: last, entry, exit: lastC, g: (half === null ? lastC : (half + lastC) / 2) / entry - 1, why: 'dead', half: half !== null };   // bars stopped (delisted): its last close
  return { open: true, k: start, entry }; }

// ---------------- statistics for the channel-style tables ----------------
export function tradeStats(gs, cost = COST) { const net = gs.map(g => capG(g) - cost), w = net.filter(x => x > 0), lo = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  let comp = 1; for (const x of net) comp *= 1 + x;
  return { n: net.length, win: net.length ? r4(w.length / net.length) : null, avg: net.length ? r4(sum(net) / net.length) : null, pf: lo.length && sum(lo) < 0 ? r4(sum(w) / -sum(lo)) : (w.length ? null : null), compounded: net.length ? r4(comp - 1) : null }; }
// the same stock on its other days: average capped return of windows of len sessions (open u -> close u+len-1), every step sessions,
// where okAt(u), not overlapping a busy [k, x]; 3+ windows needed
export function ownAverage({ from, to, len, step = 10, okAt, busy = [], ret }) { const v = []; for (let u = from; u + len - 1 <= to; u += step) { if (!okAt(u)) continue; const x = u + len - 1; if (busy.some(([a, b]) => u <= b && x >= a)) continue; const g = ret(u, x); if (ok(g)) v.push(capG(g)); } return v.length >= 3 ? mean(v) : null; }
export function boardStats(rows) { const net = rows.map(r => capG(r.g) - COST), w = net.filter(x => x > 0), lo = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, win: rows.length ? r4(w.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => capG(r.g) - capG(r.c)))) : null, pf: lo.length && sum(lo) < 0 ? r4(sum(w) / -sum(lo)) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
// one line comparing the channel's claim with our numbers (plain English)
export function verdictLine(claim, ours) { if (!ours || !ours.n) return 'no trades on US stocks'; const bits = [];
  if (ok(claim.win)) bits.push('win rate claimed ' + Math.round(claim.win * 100) + '%, ours ' + Math.round(ours.win * 100) + '%');
  if (ok(claim.pf)) bits.push('profit factor claimed ' + claim.pf + ', ours ' + (ours.pf ?? 'n/a'));
  bits.push('average trade after 0.8% cost ' + (ours.avg >= 0 ? '+' : '') + (ours.avg * 100).toFixed(2) + '%'); return bits.join('; '); }

// ---------------- library pre-registration (written before any run; idempotent) ----------------
export function preRegister(LB, date = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, a] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'YouTube strategy testers (Squad 9)', name: a.name, explain: a.rule + ' Source: ' + a.channel + ', "' + a.video.title + '" (' + a.video.date + '). Claimed: ' + a.claim.text + ' Costs in the claim: ' + a.claim.costs + '; out-of-sample: ' + a.claim.outOfSample + '. Replication: ' + a.label + '.',
      status: 'pre-registered ' + date + ' (squad 9 lab); 5-year one-shot pending', agent: 'squad9', kind: 'buy', hold: a.maxHold, libraryCheck: a.lib, sources: [a.video.url],
      note: 'Pre-registered ' + date + ' BEFORE any run (squad9-core.mjs RULES = the exact rule; one version; max hold ' + a.maxHold + ' sessions). 5-year one-shot by squad9-lab.mjs on daily bars of the whole US market, first complete verdict frozen in data/squad9-lab.json; the same rule on SPY and QQQ alone is reported next to the channel\'s claim (information); forward paper lane (data/squad9-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = date; return ch; }
// the close-based exit of a plan (SSL cross down; back to the Kalman mean)
export const closeExitFn = (plan, I) => plan && plan.closeExit === 'ssl' ? (j) => I.ssl[j] === -1 && I.ssl[j - 1] === 1 : plan && plan.closeExit === 'kalman' ? (j) => I.kal.z[j] >= 0 : () => false;
