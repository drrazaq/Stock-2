// SQUAD 6 CORE (24 Oct 2026; squad6-lab.mjs uses it). TRADERS AND FUNDS WITH PUBLIC, MULTI-YEAR RECORDS, DECODED FAITHFULLY. Pure
// functions, no network, no files. Long only; no leverage; no shorting; never places an order.
// The owner's belief: many traders start by losing, improve, and win most of their trades in the last 2-3 years. So: take methods whose
// authors have a public multi-year record (US Investing Championship entrants, published fund rulebooks, books with exact rules), test the
// ones NOT yet tested here, and report for each: win rate AND average after cost (high-win methods often hide large losers), and whether
// the newer half (2024-26) was better than the older half (judged on BOTH halves; a newer-half-only winner may go to the forward paper
// lane only, never to TRY SMALL: scan.mjs tryQualifies already requires both halves).
//
// ALREADY DECODED HERE (not repeated): DEC-QBO / DEC-EP (Kullamagi), DEC-MB (Stockbee), DEC-VCP / DEC2-MINTT (Minervini), DEC-PB / DEC2-WEDGE
// (Luk / Kell), DEC-FROG (frog in the pan), DEC2-DARVAS, DEC2-WEIN (Weinstein), DEC2-LIVER, DEC2-TURT20/55, DEC2-ZANGER, DEC2-IBD (O'Neil sell
// rules), DEC2-POCKET / DEC2-BGU (Kacher-Morales), DEC2-HOLYG / DEC2-8020 / DEC2-TSOUP (Raschke), DEC2-RSI2 / DEC2-TPS / DEC2-DBL7 (Connors),
// DEC2-NR7ID, DEC2-LWVB, DEC2-H2, DEC2-NISON, DEC2-WYCK, DEC2-STINE, DEC2-BBSQ, DEC2-KELT, DEC2-GOLDX, DEC2-ICHI, DEC2-APPEL; ANOM-MOM12 /
// ANOM-52WH / ANOM-RESMOM (momentum deciles), T10 (dual momentum), A-ROT1/2 (ETF rotation), SQ2-* (intraday setups). DEC-CANSLIM is queued
// in the decoded lane (needs SEC quarterly EPS) and A-CP1 (cup and handle) is queued by Agent A: both left to them.
//
// PRE-REGISTERED 24 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; library ids SQ6-*; squad6-lab.mjs writes the same text into
// data/strategy-library.json before computing anything). COMMON CONVENTIONS:
//   LIQUID = close 5 USD+ and 20-session average traded value 5M USD+ (SPY excluded). Whole market incl. dead stocks (the 5-year cache).
//   LARGE-CAP UNIVERSE (funds whose rulebook starts from the largest companies) = the N most traded liquid stocks by 63-session average
//   traded value on the formation day (a point-in-time, survivor-free proxy for market-cap rank: dead stocks keep their traded value).
//   ENTRY: never before the next session. Next open, or a resting limit / buy-stop order placed after the signal close that fills during
//   a later session (fill = the open if the open is already through the level, else the level). EXIT at a close-based condition: the NEXT
//   open after that close (no same-close exits: the condition is only known at the close). Intraday stops / targets: at the level (the open
//   if it gapped through); a stop and a target touched the same day count as the STOP (worst case). A stock that stops trading: its last
//   close. A trade still open at the newest close is not judged (paper lane only).
//   COST 0.8% round trip (1.2% stress). JUDGED (value-core judge) at the tier-2 standard on both halves (signal before / from 2024-01-01):
//   > 0 after 0.8% and 1.2%, better than the average liquid stock bought and sold at the same moments (yardstick.mjs capBoth: +300% cap on the
//   rule AND the yardstick, engine audit AUD-1), better than the same stock on its other days (same length), > 0 without its 2 best trades,
//   20+ trades and 3+ blocks per half, block t >= 2.5. Reported too: win rate, average win / loss, worst trade, and newer-vs-older.
import { yardPush } from './yardstick.mjs';
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26';
const P = (cite, url) => ({ cite, url });
export const RULES = {
  'SQ6-CLENOW': { name: 'Clenow "Stocks on the Move" momentum (weekly, regression slope x R2)', block: 63, replication: 'partial',
    who: 'Andreas Clenow (CIO of ACIES Asset Management; the book publishes the full rules and a 1999-2014 S&P 500 simulation)',
    sources: [P('Clenow (2015) Stocks on the Move: Beating the Market with Hedge Fund Momentum Strategies', 'https://www.followingthetrend.com/stocks-on-the-move/'), P('QuantConnect forum: Andreas F. Clenow momentum (rules restated, 2018)', 'https://www.quantconnect.com/forum/discussion/3136/andreas-f-clenow-momentum/p1')],
    rule: 'Weekly, on the first session of each week that falls on a Wednesday or later (his Wednesday). Universe: the 500 most traded liquid stocks (S&P 500 proxy). Score = annualised exponential regression slope of the last 90 closes (OLS of ln close on day number; exp(slope x 252) - 1) x the regression R2. Rank the universe; the top 20% (100) are the buy / keep zone. A stock may be held only if its close is above its 100-day average and it had no one-day move of 15%+ (close to close) in the last 90 sessions. SELL (next open) a held stock that leaves the top 20%, closes under its 100-day average, has a 15%+ move, or leaves the universe. BUY (next open), only when SPY closes above its 200-day average: from the top of the ranking down, stocks not held that pass the filters, each sized 0.1% of the account / ATR(20) (ATR as a fraction of the close; capped at 10% of the account), while the summed sizes fit in 100%; the first one that does not fit stops the buying.',
    deviations: 'S&P 500 membership is proxied by the 500 most traded liquid stocks (no point-in-time index list); the every-other-week size rebalance is not modelled; each position is judged as one trade (equal weight per trade, the system standard), its size is recorded.' },
  'SQ6-RADGE': { name: 'Radge Weekend Trend Trader (20-week high, ROC 30%+, index filter, 40%/10% trailing stop)', block: 63, replication: 'faithful',
    who: 'Nick Radge (The Chartist; published the rules with a long simulated and live record)',
    sources: [P('Radge (2012) Weekend Trend Trader', 'https://www.thechartist.com.au/'), P('usethinkscript: Weekend Trend Trader by Nick Radge (rules restated from the book)', 'https://usethinkscript.com/threads/weekend-trend-trader-by-nick-radge-strategy-for-thinkorswim.669/post-60340')],
    rule: 'Weekly, on the last session of each week. Liquid stock; this week\'s close is the highest weekly close of the last 20 weeks; 20-week rate of change (week close / week close 20 weeks earlier - 1) >= 30%; SPY\'s week close above the 10-week average of its week closes. BUY the next open. EXIT, checked on each week close (review levels, not live stops): stop = highest week close since entry x 0.60 while SPY\'s week close is above its 10-week average, x 0.90 when it is below; the stop only rises; a week close under the stop sells at the next open. At most 504 sessions (then the close).',
    deviations: 'The book trades a liquid index universe (Russell 1000 / ASX); here every liquid stock. "20-week high" read as a 20-week closing high.' },
  'SQ6-CRSIPB': { name: 'Connors ConnorsRSI pullback (limit 4% under the close, out when ConnorsRSI > 50)', block: 10, replication: 'faithful',
    who: 'Larry Connors / Connors Research (published high-win-rate stock pullback system)',
    sources: [P('Connors Research, ConnorsRSI pullback system as published in Active Trader, March 2013 (rules as coded on Wealth-Lab)', 'https://wl6.wealth-lab.com/Strategy/Details/254'), P('Connors & Alvarez (2012) An Introduction to ConnorsRSI', 'https://www.tradingmarkets.com/')],
    rule: 'Daily. Close above 5 USD, 21-day average volume 250k+ shares (and the system\'s liquid floor); ADX(10) > 30; today\'s low at least 4% under yesterday\'s close; today\'s close in the bottom 25% of its range; ConnorsRSI(3,2,100) < 15. ConnorsRSI = (Wilder RSI(3) of the close + RSI(2) of the up/down streak + percent rank of today\'s 1-day return among the previous 100) / 3. BUY: a limit order for the next session at today\'s close x 0.96 (filled at the open if it opens under it). SELL: the next open after the first close with ConnorsRSI > 50. No stop (as published). At most 60 sessions (then the close). One open trade per stock.',
    deviations: 'The published exit sells AT the close; here the next open (the standard). Max 60 sessions is our cap (none published).' },
  'SQ6-CUMRSI': { name: 'Connors cumulative RSI(2) on stocks over the 200-day (2-day sum < 35, out at RSI(2) > 65)', block: 10, replication: 'partial',
    who: 'Larry Connors & Cesar Alvarez',
    sources: [P('Connors & Alvarez (2008) Short Term Trading Strategies That Work, ch. "Cumulative RSI"', 'https://www.amazon.com/dp/0981923909')],
    rule: 'Daily. Liquid; close above its 200-day average; Wilder RSI(2) of today + RSI(2) of yesterday < 35. BUY the next open. SELL the next open after the first close with RSI(2) > 65. No stop. At most 60 sessions. One open trade per stock.',
    deviations: 'Published for indices / ETFs with a buy at the close; applied to liquid stocks and bought at the next open. Differs from DEC2-RSI2 (RSI(2) < 5, out over the 5-day average) and A-SW1 (RSI(2) < 10, max 5 sessions).' },
  'SQ6-MTUM': { name: 'MSCI USA Momentum index method (iShares MTUM): risk-adjusted 6 and 12-month momentum, semi-annual', block: 126, replication: 'proxy',
    who: 'MSCI index rulebook tracked by iShares MTUM (public methodology, live since 2013)',
    sources: [P('MSCI Momentum Indexes Methodology (May 2017; current edition 2025)', 'https://www.msci.com/eqb/methodology/meth_docs/MSCI_Momentum_Indexes_Methodology_May2017.pdf')],
    rule: 'At the close of the last session of May and of November. Universe: the 600 most traded liquid stocks with 252+ sessions of history (MSCI USA proxy). 12-month momentum = close 21 sessions ago / close 252 sessions ago - 1; 6-month = close 21 ago / close 126 ago - 1; each divided by the annualised standard deviation of weekly returns over up to 3 years (156 weeks, 52 at least); each turned into a z-score across the universe, averaged 50/50, standardised again and winsorised at +-3. BUY the next open the 120 stocks (20% of the universe) with the highest positive combined z-score. SELL at the close of session 126 (the next review).',
    deviations: 'Market-cap x score weighting, the 50% buffer and the ad-hoc rebalance are not modelled; equal weight per trade; no risk-free rate (it is common to every stock); the first reviews have under 3 years of weekly returns; the universe is a traded-value proxy.' },
  'SQ6-QMOM': { name: 'Alpha Architect Quantitative Momentum (QMOM): top 10% 12-2 momentum, the smoother half, quarterly', block: 63, replication: 'partial',
    who: 'Wes Gray & Jack Vogel (Alpha Architect; QMOM ETF live since Dec 2015, rules published in the book and fund documents)',
    sources: [P('Gray & Vogel (2016) Quantitative Momentum; Alpha Architect QM education deck', 'https://alphaarchitect.com/wp-content/uploads/2018/01/QM_IQM_Education_vF.pdf'), P('Alpha Architect, QMOM process', 'https://funds.alphaarchitect.com/wp-content/uploads/compliance/etf/education/process_quantmomentum.pdf')],
    rule: 'At the close of the last session of February, May, August and November (their seasonal quarterly rebalance). Universe: the 1000 most traded liquid stocks with 252+ sessions, REITs (SIC 6798) left out. Momentum = close 21 sessions ago / close 252 sessions ago - 1 (2-12). Keep the top 10% (100). Frog-in-the-pan FIP = sign(momentum) x (% of down days - % of up days) over the same sessions; BUY the next open the 50 with the LOWEST FIP (smoothest), equal weight. SELL at the close of session 63.',
    deviations: 'No 25% sector cap, no high-beta screen, traded-value universe proxy; the fund went monthly in Q4 2024, the book\'s quarterly seasonal schedule is used throughout. Overlaps DEC-FROG (all liquid stocks, monthly, top 30% then 30 smoothest, hold 126): here large caps, quarterly, top 10% then 50, hold 63.' },
  'SQ6-3WT': { name: 'O\'Neil / IBD three-weeks-tight breakout (buy over the 3-week high, 8% stop, +20% target)', block: 20, replication: 'partial',
    who: 'William O\'Neil / David Ryan (IBD; Ryan won the US Investing Championship with CAN SLIM; 3-weeks-tight is one of their add / buy points)',
    sources: [P('O\'Neil, How to Make Money in Stocks (4th ed., 2009), three-weeks-tight; IBD rule restated in TradingView "3 Weeks Tight - CANSLIM Technical Indicator"', 'https://it.tradingview.com/script/NHt4hBzv-3-Weeks-Tight-CANSLIM-Technical-Indicator')],
    rule: 'Weekly, on the last session of each week. Liquid; the last 3 week closes each within 1.5% of the week close before it (2 tight steps); a prior advance: the first of the 3 week closes is 20%+ above the lowest week close of the 12 weeks before it; close > 50-day > 200-day average; 126-session return in the top 30% of liquid stocks that day (RS 70+ proxy). BUY: a buy-stop at the highest daily high of the 3 weeks + 0.10 USD, valid the next 5 sessions. STOP 8% under the fill (intraday, O\'Neil\'s 7-8% rule); TARGET +20% (intraday, his 20-25% profit rule); else the close of session 63. Stop and target the same day = stop. One open trade per stock.',
    deviations: 'No EPS / composite rating (needs data); RS rating proxied by the 126-session return rank; the 8-week hold exception after a fast +20% is not modelled (DEC2-IBD has it).' },
  'SQ6-TD9': { name: 'DeMark TD Sequential buy setup 9 (perfected), 1-4 bar bounce', block: 5, replication: 'proxy',
    who: 'Tom DeMark (indicators licensed to Bloomberg / used by large funds; no public personal record)',
    sources: [P('DeMark (1994) The New Science of Technical Analysis, TD Sequential setup', 'https://www.wiley.com/en-us/The+New+Science+of+Technical+Analysis-p-9780471035480')],
    rule: 'Daily. Liquid; a completed TD buy setup: 9 closes in a row each lower than the close 4 sessions earlier, the close before bar 1 NOT lower than the close 4 sessions before it (bar 9 is today, not bar 10+); perfected: the lower of the lows of bars 8 and 9 <= the lower of the lows of bars 6 and 7. BUY the next open (skipped if it opens at or under the stop). STOP: the lowest low of the 9 setup bars (intraday). SELL at the close of the 4th session (the expected 1-4 bar reaction). One open trade per stock.',
    deviations: 'DeMark gives no fixed exit; the 4-session exit and the setup-low stop are our reading of the 1-4 bar reaction and the TD risk level.' },
};
export const IDS = Object.keys(RULES);
// ---------------- small maths ----------------
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((u, w) => u + (w - m) ** 2, 0) / (a.length - 1)); };
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
// ---------------- indicators (whole series; NaN where unknown; a missing bar restarts the recursive ones) ----------------
export function smaArr(x, p) { const n = x.length, o = new Float64Array(n).fill(NaN); let s = 0, bad = 0; for (let i = 0; i < n; i++) { const a = x[i]; if (ok(a)) s += a; else bad++; if (i >= p) { const b = x[i - p]; if (ok(b)) s -= b; else bad--; } if (i >= p - 1 && bad === 0) o[i] = s / p; } return o; }
// Wilder RSI of any series (price, or the streak series): seeded by the simple average of the first p changes
export function rsiArr(x, p) { const n = x.length, o = new Float64Array(n).fill(NaN); let ag = 0, al = 0, cnt = 0;
  for (let i = 1; i < n; i++) { const a = x[i], b = x[i - 1]; if (!ok(a) || !ok(b)) { cnt = 0; ag = 0; al = 0; continue; } const ch = a - b, g = ch > 0 ? ch : 0, l = ch < 0 ? -ch : 0;
    if (cnt < p) { ag += g; al += l; cnt++; if (cnt === p) { ag /= p; al /= p; o[i] = al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al); } continue; }
    ag = (ag * (p - 1) + g) / p; al = (al * (p - 1) + l) / p; o[i] = al === 0 ? (ag === 0 ? 50 : 100) : 100 - 100 / (1 + ag / al); }
  return o; }
// up/down streak: +n after n up closes in a row, -n after n down closes, 0 when unchanged
export function streakArr(c) { const n = c.length, o = new Float64Array(n).fill(NaN); let s = 0; for (let i = 1; i < n; i++) { if (!ok(c[i]) || !ok(c[i - 1])) { s = 0; continue; } s = c[i] > c[i - 1] ? (s > 0 ? s + 1 : 1) : c[i] < c[i - 1] ? (s < 0 ? s - 1 : -1) : 0; o[i] = s; } return o; }
// percent rank (0..100) of today's 1-day return among the previous p 1-day returns (share strictly lower)
export function pctRankArr(c, p = 100) { const n = c.length, o = new Float64Array(n).fill(NaN), r = new Float64Array(n).fill(NaN); for (let i = 1; i < n; i++) if (c[i] > 0 && c[i - 1] > 0) r[i] = c[i] / c[i - 1] - 1;
  for (let i = p + 1; i < n; i++) { if (!ok(r[i])) continue; let lo = 0, have = 0; for (let k = i - p; k < i; k++) if (ok(r[k])) { have++; if (r[k] < r[i]) lo++; } if (have === p) o[i] = 100 * lo / p; } return o; }
export function connorsRsiArr(c) { const a = rsiArr(c, 3), b = rsiArr(streakArr(c), 2), d = pctRankArr(c, 100), n = c.length, o = new Float64Array(n).fill(NaN); for (let i = 0; i < n; i++) if (ok(a[i]) && ok(b[i]) && ok(d[i])) o[i] = (a[i] + b[i] + d[i]) / 3; return o; }
// Wilder ADX(p)
export function adxArr(h, l, c, p) { const n = c.length, o = new Float64Array(n).fill(NaN); let cnt = 0, tr = 0, pd = 0, md = 0, dxs = [], adx = NaN;
  const reset = () => { cnt = 0; tr = 0; pd = 0; md = 0; dxs = []; adx = NaN; };
  for (let i = 1; i < n; i++) { if (!ok(h[i]) || !ok(l[i]) || !ok(c[i]) || !ok(h[i - 1]) || !ok(l[i - 1]) || !ok(c[i - 1])) { reset(); continue; }
    const t = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])), up = h[i] - h[i - 1], dn = l[i - 1] - l[i], p1 = up > dn && up > 0 ? up : 0, m1 = dn > up && dn > 0 ? dn : 0;
    if (cnt < p) { tr += t; pd += p1; md += m1; cnt++; if (cnt < p) continue; } else { tr = tr - tr / p + t; pd = pd - pd / p + p1; md = md - md / p + m1; }
    const pdi = tr > 0 ? 100 * pd / tr : 0, mdi = tr > 0 ? 100 * md / tr : 0, dx = pdi + mdi > 0 ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0;
    if (!ok(adx)) { dxs.push(dx); if (dxs.length === p) { adx = mean(dxs); o[i] = adx; } } else { adx = (adx * (p - 1) + dx) / p; o[i] = adx; } }
  return o; }
// average true range (simple p-day average of the true range), as a fraction of the close
export function atrPctAt(h, l, c, t, p = 20) { if (t - p < 0) return null; let s = 0; for (let k = t - p + 1; k <= t; k++) { if (!ok(h[k]) || !ok(l[k]) || !ok(c[k - 1])) return null; s += Math.max(h[k] - l[k], Math.abs(h[k] - c[k - 1]), Math.abs(l[k] - c[k - 1])); } return c[t] > 0 ? s / p / c[t] : null; }
// Clenow: annualised exponential regression slope x R2 over the last n closes (at most 5% missing)
export function clenowScore(c, t, n = 90) { if (t - n + 1 < 0) return null; let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0, m = 0;
  for (let j = 0; j < n; j++) { const z = c[t - n + 1 + j]; if (!(z > 0)) continue; const y = Math.log(z); sx += j; sy += y; sxx += j * j; sxy += j * y; syy += y * y; m++; }
  if (m < n * 0.95) return null; const vx = sxx - sx * sx / m, vy = syy - sy * sy / m, cv = sxy - sx * sy / m; if (!(vx > 0)) return null; const b = cv / vx, r2 = vy > 0 ? cv * cv / (vx * vy) : 0;
  return (Math.exp(b * 252) - 1) * r2; }
export function maxAbsMove(c, t, n = 90) { let m = 0; for (let k = Math.max(1, t - n + 1); k <= t; k++) if (c[k] > 0 && c[k - 1] > 0) m = Math.max(m, Math.abs(c[k] / c[k - 1] - 1)); return m; }
// Clenow position size: 0.1% of the account / ATR fraction, capped at 10%
export const clenowWeight = (atrPct) => ok(atrPct) && atrPct > 0 ? Math.min(0.10, 0.001 / atrPct) : null;
// one Clenow week. held: Map key -> weight; ranked: [{ key, score, pass (100-day and 15% filters), w }] sorted best first (the whole universe
// with a score); indexOk: SPY over its 200-day. Returns { sells: [key], buys: [{ key, w }] }.
export function clenowStep(held, ranked, indexOk, topFrac = 0.20) {
  const nTop = Math.ceil(ranked.length * topFrac), top = new Map(ranked.slice(0, nTop).map(r => [r.key, r])), all = new Map(ranked.map(r => [r.key, r])), sells = [];
  for (const k of held.keys()) { const r = all.get(k); if (!r || !top.has(k) || !r.pass) sells.push(k); }
  const buys = []; if (!indexOk) return { sells, buys };
  let used = 0; for (const [k, w] of held) if (!sells.includes(k)) used += w;
  for (const r of ranked.slice(0, nTop)) { if (held.has(r.key) || !r.pass || !ok(r.w)) continue; if (used + r.w > 1 + 1e-12) break; used += r.w; buys.push({ key: r.key, w: r.w }); }
  return { sells, buys }; }
// Radge trailing stop: rises only; 40% under the highest week close while the index is up, 10% when it is down
export const radgeStop = (prev, hiClose, indexUp) => { const s = hiClose * (indexUp ? 0.60 : 0.90); return ok(prev) ? Math.max(prev, s) : s; };
// ---------------- weeks ----------------
export const isoWeek = (d) => { const x = new Date(d + 'T00:00:00Z'), day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day + 3); const y = x.getUTCFullYear(), f = new Date(Date.UTC(y, 0, 4)); return y + '-' + (1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)); };
// weeks of a session list: [{ s, e }] (first and last session index). `complete` = false for the last week if it may not be over yet
export function weeksOf(D) { const o = []; for (let t = 0; t < D.length; t++) { if (t === 0 || isoWeek(D[t]) !== isoWeek(D[t - 1])) o.push({ s: t, e: t }); else o[o.length - 1].e = t; } return o; }
// the Wednesday session of each week: the first session of the week on a Wednesday or later
export function wednesdays(D) { const o = []; let wk = null, done = false; for (let t = 0; t < D.length; t++) { const w = isoWeek(D[t]); if (w !== wk) { wk = w; done = false; } if (done) continue; if (new Date(D[t] + 'T00:00:00Z').getUTCDay() >= 3) { o.push(t); done = true; } } return o; }
// the last session of each calendar month in `months` (1-12): only months whose last session is known (the next session is in a later month)
export function monthEnds(D, months) { const o = []; for (let t = 0; t + 1 < D.length; t++) if (D[t + 1].slice(0, 7) !== D[t].slice(0, 7) && months.includes(+D[t].slice(5, 7))) o.push(t); return o; }
// week closes / highs / lows of one stock (NaN when no bar that week)
export function weekly(S, W) { const n = W.length, c = new Float64Array(n).fill(NaN), h = new Float64Array(n).fill(NaN), l = new Float64Array(n).fill(NaN);
  for (let w = 0; w < n; w++) { let hi = -Infinity, lo = Infinity, last = NaN; for (let k = W[w].s; k <= W[w].e; k++) { if (S.c[k] > 0) last = S.c[k]; if (S.h[k] > 0) hi = Math.max(hi, S.h[k]); if (S.l[k] > 0) lo = Math.min(lo, S.l[k]); }
    if (last > 0 && S.c[W[w].e] > 0) { c[w] = last; h[w] = isFinite(hi) ? hi : last; l[w] = isFinite(lo) ? lo : last; } } return { c, h, l }; }
// ---------------- setups ----------------
// Radge entry on week w: a 20-week closing high and ROC(20) >= 30%
export function radgeEntry(wc, w) { if (w < 20 || !(wc[w] > 0) || !(wc[w - 20] > 0)) return false; for (let j = w - 19; j < w; j++) { if (!(wc[j] > 0)) return false; if (wc[j] > wc[w]) return false; } return wc[w] / wc[w - 20] - 1 >= 0.30 - 1e-12; }
// 3 weeks tight on week w: two tight steps (each week close within 1.5% of the one before) and a 20%+ advance into the pattern
export function threeWeeksTight(wc, w) { if (w < 14) return false; for (let j = w - 2; j <= w; j++) if (!(wc[j] > 0)) return false; if (Math.abs(wc[w] / wc[w - 1] - 1) > 0.015 || Math.abs(wc[w - 1] / wc[w - 2] - 1) > 0.015) return false;
  let lo = Infinity; for (let j = w - 14; j <= w - 3; j++) if (wc[j] > 0) lo = Math.min(lo, wc[j]); return isFinite(lo) && wc[w - 2] >= lo * 1.20 * (1 - 1e-12); }
// TD buy setup 9 completed at t (bar 9 = t), perfected; returns { low } (lowest low of the 9 bars) or null
export function tdBuy9(c, l, t) { if (t - 13 < 0) return null; for (let j = 0; j < 9; j++) { const a = c[t - j], b = c[t - j - 4]; if (!(a > 0 && b > 0) || !(a < b)) return null; }
  const a0 = c[t - 9], b0 = c[t - 13]; if (!(a0 > 0 && b0 > 0) || a0 < b0) return null;   // bar 9 is the first 9 (the close before bar 1 was not lower)
  const L = (k) => l[k] > 0 ? l[k] : NaN; const p89 = Math.min(L(t - 1), L(t)), p67 = Math.min(L(t - 3), L(t - 2)); if (!(p89 <= p67)) return null;
  let lo = Infinity; for (let k = t - 8; k <= t; k++) if (l[k] > 0) lo = Math.min(lo, l[k]); return isFinite(lo) ? { low: lo } : null; }
// ConnorsRSI pullback setup at t (indicators precomputed)
export function crsiSetup({ o, h, l, c, v }, t, crsi, adx10) { if (t < 1 || !(c[t] > 5) || !(c[t - 1] > 0) || !(h[t] > 0) || !(l[t] > 0)) return false; let sv = 0; for (let k = t - 20; k <= t; k++) { if (!(v[k] >= 0)) return false; sv += v[k]; } if (sv / 21 < 250000) return false;
  if (!(adx10[t] > 30)) return false; if (!(l[t] <= c[t - 1] * 0.96 * (1 + 1e-12))) return false; const rg = h[t] - l[t]; if (!(rg > 0) || (c[t] - l[t]) / rg > 0.25 + 1e-12) return false; return crsi[t] < 15; }
// frog in the pan information discreteness over daily returns a..b: sign(ret) x (% down - % up)
export function fip(c, a, b, ret) { let up = 0, dn = 0, n = 0; for (let k = Math.max(1, a); k <= b; k++) if (c[k] > 0 && c[k - 1] > 0) { n++; if (c[k] > c[k - 1]) up++; else if (c[k] < c[k - 1]) dn++; } if (n < (b - a + 1) * 0.9 || !ok(ret)) return null; return Math.sign(ret) * (dn / n - up / n); }
// ---------------- fund selections ----------------
const zs = (a) => { const v = a.filter(ok); const m = mean(v), s = sd(v); return a.map(x => ok(x) && s > 0 ? (x - m) / s : null); };
// MSCI momentum: rows [{ key, m6, m12, vol }] -> the n keys with the highest positive combined z (12-month missing -> the 6-month alone)
export function mtumPick(rows, n) { const r = rows.filter(x => ok(x.m6) && x.vol > 0); if (r.length < 20) return [];
  const z6 = zs(r.map(x => x.m6 / x.vol)), z12 = zs(r.map(x => ok(x.m12) ? x.m12 / x.vol : null)), comb = r.map((x, i) => z12[i] === null ? z6[i] : 0.5 * z6[i] + 0.5 * z12[i]), Z = zs(comb).map(z => z === null ? null : Math.max(-3, Math.min(3, z)));
  return r.map((x, i) => ({ key: x.key, z: Z[i] })).filter(x => x.z > 0).sort((a, b) => b.z - a.z).slice(0, n).map(x => x.key); }
// Quantitative momentum: rows [{ key, m, fip }] -> top `frac` by m (ceil), then the `keep` share with the lowest FIP (ceil)
export function qmomPick(rows, frac = 0.10, keep = 0.5) { const r = rows.filter(x => ok(x.m) && ok(x.fip)).sort((a, b) => b.m - a.m); if (r.length < 100) return []; const top = r.slice(0, Math.ceil(r.length * frac));
  return [...top].sort((a, b) => a.fip - b.fip).slice(0, Math.ceil(top.length * keep)).map(x => x.key); }
// top N keys by value (desc)
export const topN = (rows, n) => rows.filter(x => ok(x.v)).sort((a, b) => b.v - a.v).slice(0, n).map(x => x.key);
// ---------------- trade walkers (S = { o, h, l, c } of one stock; last = its last session with a bar; T = sessions in the data) ----------------
// the exit at the NEXT open after session j: { x, at: 'o', px } ; a stock with no bar after j: its last close (kind 'gone'); data end -> null
export function nextOpen(S, j, last, T) { for (let k = j + 1; k < T; k++) { if (S.o[k] > 0) return { x: k, at: 'o', px: S.o[k] }; if (k > last) break; }
  if (last < T - 1 && last >= 0 && S.c[last] > 0) return { x: Math.max(last, j), at: 'c', px: S.c[last], gone: true }; return null; }
const closeOut = (S, k, last, T) => { if (k > T - 1) return null; if (S.c[k] > 0) return { x: k, at: 'c', px: S.c[k] }; for (let q = k; q >= 0; q--) if (S.c[q] > 0) return { x: k, at: 'c', px: S.c[q] }; return null; };
const fin = (k, px0, ex, kind) => ({ k, px0, x: ex.x, at: ex.at, px1: ex.px, g: ex.px / px0 - 1, kind: ex.gone ? 'gone' : kind, days: ex.x - k + 1 });
// buy the next open after t, then sell at the next open after the first close j >= k where exitIf(j) is true; at most maxH sessions (sell
// the close of k + maxH - 1). Returns a trade, { open: true, k, px0 } if unresolved at the data end, or null if never bought.
export function walkClose(S, t, last, T, exitIf, maxH) { const k = t + 1; if (k > T - 1) return { open: true, k, px0: null, pending: true }; if (!(S.o[k] > 0)) return null; return walkFrom(S, k, S.o[k], last, T, exitIf, maxH); }
// the same exit from a fill at session k at price px0 (a limit / stop fill during k)
export function walkFrom(S, k, px0, last, T, exitIf, maxH) {
  for (let j = k; j <= k + maxH - 1; j++) { if (j > T - 1) return { open: true, k, px0 }; if (j > last) { const ex = nextOpen(S, j - 1, last, T); return ex ? fin(k, px0, ex, 'gone') : { open: true, k, px0 }; }
    if (!(S.c[j] > 0)) continue; if (j === k + maxH - 1) return fin(k, px0, { x: j, at: 'c', px: S.c[j] }, 'max');
    if (exitIf(j)) { const ex = nextOpen(S, j, last, T); return ex ? fin(k, px0, ex, 'rule') : { open: true, k, px0 }; } }
  const ex = closeOut(S, k + maxH - 1, last, T); return ex ? fin(k, px0, ex, 'max') : { open: true, k, px0 }; }
// a resting order filled during a later session: kind 'limit' (fills if low <= level; at min(open, level)) or 'stop' (fills if high >=
// level; at max(open, level)); tries sessions t+1 .. t+valid. Returns { k, px } , { open: true } at the data end, or null.
export function fillOrder(S, t, last, T, kind, level, valid) { for (let k = t + 1; k <= t + valid; k++) { if (k > T - 1) return { open: true, k }; if (k > last) return null; const o = S.o[k], hi = S.h[k], lo = S.l[k]; if (!(o > 0)) continue;
    if (kind === 'limit') { if (o <= level) return { k, px: o }; if (lo > 0 && lo <= level) return { k, px: level }; }
    else { if (o >= level) return { k, px: o }; if (hi > 0 && hi >= level) return { k, px: level }; } }
  return null; }
// after a fill at session k (price px0): intraday stop / target (either may be null), at most maxH sessions (close of k + maxH - 1).
// On the fill day the stop is checked first (worst case: the low after the fill hit it); the target only counts there on the close.
export function walkBracket(S, k, px0, last, T, stop, target, maxH) {
  for (let j = k; j <= k + maxH - 1; j++) { if (j > T - 1) return { open: true, k, px0 }; if (j > last) { const ex = nextOpen(S, j - 1, last, T); return ex ? fin(k, px0, ex, 'gone') : { open: true, k, px0 }; }
    const o = S.o[j], hi = S.h[j] > 0 ? S.h[j] : S.c[j], lo = S.l[j] > 0 ? S.l[j] : S.c[j]; if (!(S.c[j] > 0)) continue;
    if (stop !== null && lo <= stop) return fin(k, px0, { x: j, at: 'i', px: j > k && o > 0 && o < stop ? o : stop }, 'stop');
    if (target !== null && j > k && hi >= target) return fin(k, px0, { x: j, at: 'i', px: o > 0 && o > target ? o : target }, 'target');
    if (target !== null && j === k && S.c[j] >= target) return fin(k, px0, { x: j, at: 'c', px: S.c[j] }, 'target');
    if (j === k + maxH - 1) return fin(k, px0, { x: j, at: 'c', px: S.c[j] }, 'max'); }
  const ex = closeOut(S, k + maxH - 1, last, T); return ex ? fin(k, px0, ex, 'max') : { open: true, k, px0 }; }
// ---------------- yardstick: the average liquid stock bought and sold at the same moments ----------------
// price(i, x, at): the exit price of stock i at session x ('o' = its open, else its close; a stock gone: its last close); entry = open of k
export function yardOf(stocks, k, x, at, priceAt, mode = 'capBoth', minN = 50) { const v = []; for (const i of stocks) { const e = priceAt(i, k, 'o'); if (!(e > 0)) continue; const y = priceAt(i, x, at === 'o' ? 'o' : 'c'); if (y > 0) yardPush(v, y / e - 1, mode); } return v.length >= minN ? mean(v) : null; }
// ---------------- reporting ----------------
export function shape(tr, cost = COST) { const net = tr.map(z => z.g - cost), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0), srt = [...net].sort((a, b) => a - b), k5 = Math.max(1, Math.ceil(srt.length * 0.05));
  return { n: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avg: tr.length ? r4(mean(net)) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, pf: l.length && sum(l) < 0 ? r4(sum(w) / -sum(l)) : null,
    worst5pctAvg: srt.length ? r4(mean(srt.slice(0, k5))) : null, worst: srt.length ? r4(srt[0]) : null, medianDays: tr.length ? [...tr.map(z => z.days)].sort((a, b) => a - b)[tr.length >> 1] : null }; }
// did the newer half do better? (information; the verdict uses both halves)
export function newerVsOlder(R) { const a = R.older || {}, b = R.newer || {}; if (!(a.n > 0) || !(b.n > 0)) return { better: null, note: 'a half has no trades' };
  const better = b.avg > a.avg && b.edge > a.edge; return { better, avg: [a.avg, b.avg], win: [a.win, b.win], edge: [a.edge, b.edge], note: better ? 'newer half better on average and edge' : 'newer half NOT better on both average and edge' }; }
export function boardStats(rows) { const net = rows.map(r => r.g - COST), win = net.filter(x => x > 0), loss = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => r.g - r.c))) : null, avgWin: win.length ? r4(sum(win) / win.length) : null, avgLoss: loss.length ? r4(sum(loss) / loss.length) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
// ---------------- library pre-registration (idempotent; before any computation) ----------------
const COMMON = 'Common (squad6-core.mjs header): liquid = close 5 USD+ and 20-session average traded value 5M USD+; whole market with dead stocks (5-year cache); large-cap universes = the most traded liquid stocks by 63-session traded value (survivor-free proxy for market-cap rank). Entries never before the next session (next open, or a resting limit / buy-stop filled at the level or the open if through it); close-based exits at the NEXT open; intraday stop and target on the same day = stop; a stock that stops trading = its last close. Cost 0.8% (1.2% stress). Judged once (first complete run frozen, data/squad6-lab.json firstRun) at the tier-2 standard on both halves (signal before / from 2024-01-01) with the yardstick and the rule both capped at +300% (AUD-1): > 0 after 0.8% and 1.2%, better than the average liquid stock bought and sold at the same moments, better than the same stock on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks per half, block t >= 2.5. Win rate, average win / loss and newer-vs-older reported.';
export function preRegister(LB, today = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Public-record traders and fund rulebooks (Squad 6)', name: r.name, explain: 'RULE: ' + r.rule + ' DEVIATIONS from the published method: ' + r.deviations + ' ' + COMMON,
      status: 'pre-registered ' + today + ' (squad 6); 5-year one-shot pending', agent: 'squad6', registered: today, who: r.who, replication: r.replication, sources: r.sources.map(s => s.url), cites: r.sources.map(s => s.cite),
      libraryCheck: 'Not among DEC-* / DEC2-* (decoded lanes), ANOM-* (momentum deciles), T1-T23, A-SW*, SQ2-*. Nearest: ' + ({ 'SQ6-CLENOW': 'ANOM-MOM12 / T1 (momentum, no regression quality, no index filter, no exits) and SQ5-MOMBUF (squad 5, same day: plain 12-1 top 20 of the 500 largest with a buffer)', 'SQ6-RADGE': 'DEC2-TURT55 / T3 (breakouts with different exits)', 'SQ6-CRSIPB': 'DEC2-RSI2 / A-SW1 (RSI(2), no limit entry, no ADX)', 'SQ6-CUMRSI': 'DEC2-RSI2 / A-SW1', 'SQ6-MTUM': 'ANOM-MOM12 (raw 12-1 decile of all liquid stocks) and SQ5-MOMBUF (plain 12-1 top 20 of the 500 largest)', 'SQ6-QMOM': 'DEC-FROG (frog in the pan on all liquid stocks) and SQ5-MOMBUF (plain 12-1 top 20)', 'SQ6-3WT': 'DEC2-IBD (base breakout)', 'SQ6-TD9': 'M6 / A-SW3 (down-day counts)' })[id] + '.',
      note: 'Pre-registered ' + today + ' BEFORE any run (squad6-core.mjs = the exact rule; one version). 5-year one-shot by squad6-lab.mjs, first complete verdict frozen; forward paper lane (data/squad6-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
