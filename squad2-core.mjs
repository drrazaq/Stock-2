// SQUAD 2 CORE: "TRADE IT LIKE THE TRADERS DO" (24 Oct 2026). Pure functions, no network, no files.
// Used by squad2-lab.mjs (one 5-year one-shot on 1-minute SIP bars, first complete verdict frozen in data/squad2-lab.json, plus a
// forward PAPER lane from Monday 26 Oct 2026) and test/squad2-core.test.mjs. Long only; no leverage; no shorting; never places an order.
//
// WHY: almost every earlier test (DEC-*, DEC2-*, T-*, I-*) bought at the NEXT DAY'S OPEN on daily bars. Day and swing traders enter
// DURING the session (opening-range breaks, VWAP reclaims, first pullbacks, intraday breaks of a base high) with a stop at the day's
// low as known at entry. These rules test exactly that, on 1-minute bars.
//
// PRE-REGISTERED 24 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each; ids SQ2-*; the same text is written into
// data/strategy-library.json in the same commit and again, idempotently, by squad2-lab.mjs before its first computation).
// COMMON CONVENTIONS
//   UNIVERSE (point in time, from the whole-market daily cache incl. dead stocks): close of the PRIOR session >= 5 USD and the median
//     traded value (close x volume) of the 20 prior sessions >= 10M USD (15+ of the 20 present). Decisions for day t use daily data up
//     to t-1 plus day t's OPEN (known at 09:30) and the 1-minute bars of day t COMPLETED before the decision.
//   MINUTE BARS: Alpaca SIP 1-minute bars (all US exchanges), raw prices, regular session 09:30-15:59 New York (bar = its start minute).
//     Daily-cache levels are converted to minute units with scale = daily open / first minute open (1 when within 3%; a clean split
//     common split ratio within 2%; else the stock-day is dropped as a data mismatch).
//   ORDERS: a level fixed at the end of minute k can only fill from minute k+1. BUY-STOP at L: the first later bar with high > L fills
//     at max(L, that bar's open). MARKET: the open of the next bar. No entry in the first 5 minutes (09:30-09:34) for any rule.
//   STOPS: a protective stop is live from the fill. A bar that OPENS at or under the stop fills at its open (gap through the stop);
//     otherwise a low at or under the stop fills at the stop. SAME-MINUTE AMBIGUITY: if the entry bar filled intrabar (not at its open)
//     and its low is at or under the stop, the order of the two prices is unknown: the VERDICT books the worst case (stopped at the
//     stop in that minute); the best case (not stopped) is reported as the upper bound. Swing rules after day 1: daily bars, the same
//     gap-through rule (open under the stop fills at the open).
//   DAY TRADES exit at the close of the last regular-session minute bar (15:59 bar close; the closing auction is not assumed).
//   RELATIVE VOLUME at minute m = volume 09:30..m / (20-session average daily volume x F(m)), F = a fixed typical US intraday
//     cumulative-volume curve (VOL_CURVE below; the same for every trigger and every control).
//   COSTS: 0.1% slippage per side inside every return (fills 0.1% worse), plus the house cost 0.8% per round trip (stress 1.2%).
//     Information only: 0.4% cost (intraday liquid trades can be cheaper) and 0.05% slippage.
//   JUDGED at the system's tier-2 standard (value-core.mjs judge, unchanged): both halves (signal day before / from 2024-01-01)
//     positive after 0.8% and 1.2% cost; better than the MATCHED CONTROL (stocks that met the same rule's pre-trigger conditions the same
//     day, e.g. the same gap and relative volume, but had not triggered by that minute, bought at the same minute and sold the same way:
//     at the close for day trades, at the close of the trade's exit session for swing rules; if a day has no matched control, every
//     other stock fetched that day at the same minute); better than the same stock on its other days (day trades: open to close; swing:
//     open to close over the same number of sessions); positive without its 2 best trades; block t >= 2.5 on non-overlapping blocks
//     (5 sessions for day trades, 20 for swing rules); 20+ trades and 3+ blocks in each half, else TOO FEW CASES. PROVEN needs block t
//     >= the proof bar (max of 2.5, the league bar, 4.0). One trade per stock per rule at a time.
export const COST = 0.008, STRESS = 0.012, INFO_COST = 0.004, SLIP = 0.001, SLIP_LOW = 0.0005, SPLIT = '2024-01-01', PAPER_START = '2026-10-26';
export const OPEN_MIN = 570, CLOSE_MIN = 960, LAST_BAR = 959;
export const MIN_PX = 5, MIN_DV = 10e6;
// cumulative share of the day's volume traded after N minutes of the regular session (fixed approximation of the US U-shaped profile)
export const VOL_CURVE = [[0, 0], [5, 0.040], [15, 0.085], [30, 0.135], [60, 0.215], [120, 0.335], [180, 0.430], [240, 0.520], [300, 0.610], [330, 0.660], [360, 0.725], [390, 0.880]];

const P = (cite, url) => ({ cite, url });
const ORIG = 'Old version: bought the NEXT OPEN on daily bars (or simulated a daily buy-stop with the final daily low as the stop).';
export const SETUPS = {
  'SQ2-ORB5': { name: '5-minute opening-range breakout on a 4%+ gap with 3x relative volume (day trade)', kind: 'day', block: 5, hold: 1, old: ['A-ORB1', 'DEC2-GAPGO'],
    rule: 'Day t: universe; first-minute open >= 4% above the prior close; relative volume >= 3 at 09:35 (volume 09:30-09:34 vs 20-day average x F(5)). Buy-stop at the 09:30-09:34 high, live 09:35-15:30. Stop = the day\'s low as known at the fill (lowest low of the completed bars). Exit: the stop, else the 15:59 close. Gap + relative volume is the news proxy (no news history for the whole market).',
    src: [P('Zarattini, Barbon & Aziz (2024) A Profitable Day Trading Strategy for the U.S. Equity Market (SSRN 4729284)', 'https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4729284'), P('Toby Crabel (1990) Day Trading with Short Term Price Patterns and Opening Range Breakout', 'https://www.investopedia.com/terms/o/openingrangebreakout.asp')] },
  'SQ2-ORB30': { name: '30-minute opening-range breakout on a 4%+ gap with 3x relative volume (day trade)', kind: 'day', block: 5, hold: 1, old: ['A-ORB1', 'DEC2-GAPGO'],
    rule: 'Day t: universe; first-minute open >= 4% above the prior close; relative volume >= 3 at 10:00 (volume 09:30-09:59 vs 20-day average x F(30)). Buy-stop at the 09:30-09:59 high, live 10:00-15:30. Stop = the day\'s low as known at the fill. Exit: the stop, else the 15:59 close.',
    src: [P('Opening-range breakout, 30-minute version (Crabel; widely taught day-trader setup)', 'https://www.investopedia.com/terms/o/openingrangebreakout.asp')] },
  'SQ2-EPORB': { name: 'Episodic pivot bought on the gap day: 10%+ gap in a neglected stock, 5-minute opening-range high, Qullamaggie exits', kind: 'swing', block: 20, hold: 120, engine: 'KQ', old: ['DEC-EP'],
    rule: 'Day t: universe; first-minute open >= 10% above the prior close; the 63 sessions before were up no more than +20% (neglected); relative volume >= 3 at 09:35. Buy-stop at the 09:30-09:34 high, live 09:35-15:30 (Kullamagi buys the opening-range high ON the gap day; DEC-EP bought the next open). Stop = the day\'s low as known at the fill, but never more than 1.5 x the pre-gap 20-day ADR under the fill. Exit (KQ, as DEC-EP): sell 1/3 at the close of day 3 if above the fill and move the stop to the fill; from day 4 sell the rest at the next open after a close under the 10-day average; at most 120 sessions.',
    src: [P('Kristjan Kullamagi, episodic pivots (FWTV summary)', 'https://www.financialwisdomtv.com/post/the-episodic-pivot-strategy-qullamaggie-s-high-momentum-setup-explained')] },
  'SQ2-QBO': { name: 'Qullamaggie breakout bought on the intraday break of the base high (or the 5-minute opening-range high), stop at the day low so far', kind: 'swing', block: 20, hold: 120, engine: 'KQ', old: ['DEC-QBO'],
    rule: 'Setup = DEC-QBO exactly (decoded-core detectQBO at the close of t0: ADR >= 4%, 30%+ prior move, tight 10-session base with higher lows, 10/20-day averages, QQQ 10-day > 20-day and both rising) plus this squad\'s universe; the order is live on the 5 sessions after t0 and cancelled by a daily close under the base low. Each live day: buy-stop at max(base high, the 09:30-09:34 high), live 09:35-15:30. Stop = the day\'s low as known at the fill, at most 1 ADR under the fill. Exit KQ (1/3 day 3, stop to the fill, 10-day trail from day 4, max 120).',
    src: [P('Kristjan Kullamagi breakout (CTE summary of Market Wizards: The Next Generation)', 'https://completetradersedge.com/?p=233509')] },
  'SQ2-VWAP': { name: 'VWAP reclaim after a morning flush on leaders (day trade)', kind: 'day', block: 5, hold: 1, old: ['DEC-PB'],
    rule: 'Leaders at the close of t-1: universe, close above its 50-day average, 63-session return >= +30%, the 30 strongest by that return. Day t: a FLUSH = a 1-minute bar between 09:30 and 10:29 whose low is 2%+ under the day\'s open and whose close is under the session VWAP; then the first completed clock-aligned 5-minute bar (ending by 11:30) that closes above the session VWAP: buy at the open of the next minute (market). Stop = the day\'s low as known at the fill. Exit: the stop, else the 15:59 close.',
    src: [P('VWAP reclaim (Brian Shannon, Maximum Trading Gains with Anchored VWAP, 2023)', 'https://www.alphatrends.net/'), P('Martin Luk / Oliver Kell reclaim entries on leaders (FWTV)', 'https://www.financialwisdomtv.com/post/martin-luk-s-pullback-trading-strategy-how-the-2025-u-s-investing-champion-finds-low-risk-high-re')] },
  'SQ2-EMAPB': { name: 'First pullback to the 9/21 EMA on 5-minute bars after a 4%+ gap with 3x relative volume (day trade)', kind: 'day', block: 5, hold: 1, old: ['DEC-PB', 'DEC2-GAPGO'],
    rule: 'Day t: the SQ2-ORB5 pool (4%+ gap, relative volume >= 3 at 09:35). Clock-aligned 5-minute bars; EMA9 and EMA21 of their closes, both seeded with the prior close. Trend: a completed 5-minute bar closed above the EMA9 and the day\'s high after 09:35 exceeded the 09:30-09:34 high. FIRST PULLBACK = the first later 5-minute bar starting 09:40-11:25 whose low <= EMA9 and whose close > EMA21 (EMAs including that bar). Buy-stop at that bar\'s high, live for the next 15 minutes only. Stop = that bar\'s low. Exit: the stop, else the 15:59 close. Only the first pullback of the day.',
    src: [P('Ross Cameron / Warrior Trading first pullback on gappers (day-trader classic)', 'https://www.warriortrading.com/'), P('Linda Raschke, first touch of the moving average (Street Smarts, 1995)', 'https://tradingsetupsreview.com/the-holy-grail-trading-setup')] },
  'SQ2-HTF': { name: 'High tight flag bought on the intraday break of the flag high, stop at the day low so far, 10-day trail', kind: 'swing', block: 20, hold: 60, engine: 'S10', old: ['DEC2-WEDGE', 'T12'],
    rule: 'At the close of t-1: universe; the highest high of the last 40 sessions (pole top, session p) is 3 to 25 sessions old; it is 90%+ above the lowest low of the 40 sessions up to p (the pole); since p no low under 75% of the top (flag pullback <= 25%); close under the top. Day t: buy-stop at max(pole top, the 09:30-09:34 high), live 09:35-15:30. Stop = the day\'s low as known at the fill, at most 1 ADR under the fill. Exit: the stop; else the next open after a close under the 10-day average (from day 1); at most 60 sessions.',
    src: [P('William O\'Neil high tight flag (How to Make Money in Stocks); Bulkowski Encyclopedia of Chart Patterns', 'https://thepatternsite.com/HTF.html')] },
  'SQ2-PWR': { name: 'Power-hour breakout of the day high on strong, active stocks (day trade)', kind: 'day', block: 5, hold: 1, old: [],
    rule: 'Pool day t: the gap (>= 4% by the open) and leader lists of this squad (known at the open). At 15:00 (bars to 14:59 completed): last price >= 3% above the prior close, within 1% of the day\'s high, relative volume >= 1.5 (F(330)). Buy-stop at the day\'s high so far, live 15:00-15:50. Stop = the lowest low of 14:00-14:59, at most 1 ADR under the fill. Exit: the stop, else the 15:59 close.',
    src: [P('Power-hour / end-of-day breakout (day-trader folklore; Investopedia: power hour)', 'https://www.investopedia.com/terms/p/power-hour.asp')] },
  'SQ2-SWING': { name: 'Swing version: 5-minute opening-range breakout on a 4%+ gap with 3x relative volume, held for days with a 10-day-low trail', kind: 'swing', block: 20, hold: 60, engine: 'L10', old: ['DEC2-GAPGO', 'DEC-EP'],
    rule: 'Entry exactly as SQ2-ORB5 (same pool, same buy-stop, same initial stop = the day\'s low as known at the fill). Not sold at the close: from day 2 the stop trails to the lowest low of the 10 sessions before each day (never lowered); a daily open under the stop fills at the open; at most 60 sessions (sold at the close of day 60).',
    src: [P('Swing trading with a 10-day-low trailing stop (Turtle-style channel exit; Curtis Faith, Way of the Turtle)', 'https://www.investopedia.com/terms/d/donchianchannels.asp')] },
};
export const IDS = Object.keys(SETUPS);
const ok = (x) => typeof x === 'number' && isFinite(x);
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';

// ---------- clock ----------
const NYH = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' });
/** minutes to ADD to UTC to get New York local time on that calendar day (-240 summer, -300 winter) */
export function nyOffsetMin(day) { const h = +NYH.format(new Date(day + 'T12:00:00Z')); return (h - 12) * 60; }
/** Alpaca/Massive bar rows of one day -> regular-session bars [{m,o,h,l,c,v,vw}] sorted by NY minute (09:30 = 570 .. 15:59 = 959) */
export function toNyBars(rows, day) {
  const off = nyOffsetMin(day), base = Date.parse(day + 'T00:00:00Z'), out = [];
  for (const r of rows || []) { const t = typeof r.t === 'number' ? r.t : Date.parse(r.t); const m = Math.round((t - base) / 60000) + off;
    if (m < OPEN_MIN || m >= CLOSE_MIN) continue; const o = +r.o, h = +r.h, l = +r.l, c = +r.c, v = +(r.v || 0);
    if (!(o > 0 && h > 0 && l > 0 && c > 0)) continue; out.push({ m, o, h, l, c, v, vw: ok(+r.vw) && +r.vw > 0 ? +r.vw : (h + l + c) / 3 }); }
  out.sort((a, b) => a.m - b.m); const ded = []; for (const b of out) if (!ded.length || ded[ded.length - 1].m !== b.m) ded.push(b); return ded;
}
export function curveAt(min) { const C = VOL_CURVE; if (min <= 0) return 0; for (let k = 1; k < C.length; k++) if (min <= C[k][0]) { const [a, fa] = C[k - 1], [b, fb] = C[k]; return fa + (fb - fa) * (min - a) / (b - a); } return C[C.length - 1][1]; }
export const rvol = (cumVol, adv, elapsed) => { const f = curveAt(elapsed); return adv > 0 && f > 0 ? cumVol / (adv * f) : NaN; };
/** scale = daily open / first minute open, snapped: 1 within 3%, else a common split ratio within 2%, else null (mismatch) */
export function priceScale(dailyOpen, minuteOpen) {
  if (!(dailyOpen > 0) || !(minuteOpen > 0)) return null; const r = dailyOpen / minuteOpen; if (Math.abs(r - 1) < 0.03) return 1;
  const cands = []; for (const n of [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100]) cands.push(n, 1 / n); cands.push(1.5, 2 / 3, 1.25, 0.8, 4 / 3, 0.75, 2.5, 0.4);
  for (const q of cands) if (Math.abs(r / q - 1) < 0.02) return r; return null;   // common split ratios only (a reused ticker of another company is dropped)
}

// ---------- minute helpers ----------
export const idxFrom = (bars, m) => { let lo = 0, hi = bars.length; while (lo < hi) { const k = (lo + hi) >> 1; if (bars[k].m < m) lo = k + 1; else hi = k; } return lo; };
export function lowBefore(bars, i) { let x = Infinity; for (let k = 0; k < i; k++) if (bars[k].l < x) x = bars[k].l; return x; }
export function highBefore(bars, i) { let x = -Infinity; for (let k = 0; k < i; k++) if (bars[k].h > x) x = bars[k].h; return x; }
export function rangeOf(bars, fromMin, toMinExcl) { let h = -Infinity, l = Infinity, v = 0, n = 0; for (const b of bars) { if (b.m < fromMin) continue; if (b.m >= toMinExcl) break; if (b.h > h) h = b.h; if (b.l < l) l = b.l; v += b.v; n++; } return n ? { h, l, v, n } : null; }
/** BUY-STOP at level, searched from bar index `from` (the first bar AFTER the decision) while bar.m <= lastMin */
export function buyStop(bars, from, lastMin, level) {
  if (!(level > 0)) return null;
  for (let i = from; i < bars.length; i++) { const b = bars[i]; if (b.m > lastMin) break; if (b.o > level) return { i, m: b.m, px: b.o, atOpen: true }; if (b.h > level) return { i, m: b.m, px: level, atOpen: false }; }
  return null;
}
/** the price of a market order at minute m: the open of the first bar at or after m (null if none before the close) */
export const priceAt = (bars, m) => { const i = idxFrom(bars, m); return i < bars.length ? bars[i].o : null; };
export const lastClose = (bars, lastMin = LAST_BAR) => { for (let i = bars.length - 1; i >= 0; i--) if (bars[i].m <= lastMin) return bars[i].c; return null; };
/** Walk a long position from its entry bar i with a protective stop. Returns { pess, opt, ambiguous }: each { px, m, why, stopped }.
 *  atOpen = the entry filled at bar i's open (then everything after on that bar is known to come later: no ambiguity). */
export function walkDay(bars, i, stop, atOpen, lastMin = LAST_BAR) {
  const b = bars[i]; let pess = null, amb = false;
  if (b.l <= stop) { if (atOpen) { const r = { px: b.o <= stop ? b.o : stop, m: b.m, why: b.o <= stop ? 'opened under the stop' : 'stop', stopped: true }; return { pess: r, opt: r, ambiguous: false }; }
    amb = true; pess = { px: stop, m: b.m, why: 'stop in the entry minute (worst case)', stopped: true }; }
  let opt = null;
  for (let j = i + 1; j < bars.length && bars[j].m <= lastMin; j++) { const x = bars[j];
    if (x.o <= stop) { opt = { px: x.o, m: x.m, why: 'opened under the stop', stopped: true }; break; }
    if (x.l <= stop) { opt = { px: stop, m: x.m, why: 'stop', stopped: true }; break; } }
  if (!opt) { const c = lastClose(bars, lastMin); opt = { px: c, m: lastMin, why: 'close', stopped: false }; }
  return { pess: pess || opt, opt, ambiguous: amb };
}
/** clock-aligned 5-minute bars; each carries `end` = the index of its last 1-minute bar (decisions on it act from end+1) */
export function fiveMin(bars) { const out = []; for (let i = 0; i < bars.length; i++) { const b = bars[i], s = Math.floor(b.m / 5) * 5, z = out[out.length - 1];
    if (z && z.s === s) { z.h = Math.max(z.h, b.h); z.l = Math.min(z.l, b.l); z.c = b.c; z.v += b.v; z.end = i; } else out.push({ s, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, end: i }); } return out; }

// ---------- the rules on one stock-day ----------
// ctx (all in MINUTE units): { pc prior close, adv 20-day avg volume (shares), adr (fraction), f: { gap, ep, lead, qbo: {trig, adr}, htf: {top, adr} } }
// Each returns { pool, poolMin, fill?, stop?, info } where pool = met the rule's pre-trigger conditions by minute poolMin (the matched
// control set) and fill = { i, m, px, atOpen } the entry.
function orb(ctx, bars, N, gapMin, rvMin) {
  if (!bars.length || bars[0].m >= OPEN_MIN + N || !(ctx.pc > 0)) return { pool: false };
  const gap = bars[0].o / ctx.pc - 1; if (!(gap >= gapMin)) return { pool: false, gap };
  const R = rangeOf(bars, OPEN_MIN, OPEN_MIN + N); if (!R) return { pool: false };
  const rv = rvol(R.v, ctx.adv, N); if (!(rv >= rvMin)) return { pool: false, gap, rv };
  return { pool: true, poolMin: OPEN_MIN + N, gap, rv, R, from: idxFrom(bars, OPEN_MIN + N) };
}
export function setupORB(ctx, bars, N = 5) {
  const z = orb(ctx, bars, N, 0.04, 3); if (!z.pool) return z;
  const f = buyStop(bars, z.from, 930, z.R.h); if (!f) return { ...z, info: { gap: r4(z.gap), rv: r4(z.rv) } };
  return { ...z, fill: f, stop: lowBefore(bars, f.i), info: { gap: r4(z.gap), rv: r4(z.rv), orh: z.R.h } };
}
export function setupEP(ctx, bars) {
  if (!(ctx.f && ctx.f.ep) || !(ctx.adr > 0)) return { pool: false };
  const z = orb(ctx, bars, 5, 0.10, 3); if (!z.pool) return z;
  const f = buyStop(bars, z.from, 930, z.R.h); if (!f) return { ...z, info: { gap: r4(z.gap), rv: r4(z.rv) } };
  return { ...z, fill: f, stop: Math.max(lowBefore(bars, f.i), f.px * (1 - 1.5 * ctx.adr)), info: { gap: r4(z.gap), rv: r4(z.rv) } };
}
function baseBreak(ctx, bars, level, adr) {
  if (!bars.length || !(level > 0) || !(adr > 0) || bars[0].m >= OPEN_MIN + 5) return { pool: false };
  const R = rangeOf(bars, OPEN_MIN, OPEN_MIN + 5); if (!R) return { pool: false };
  const lv = Math.max(level, R.h), from = idxFrom(bars, OPEN_MIN + 5), f = buyStop(bars, from, 930, lv);
  if (!f) return { pool: true, poolMin: OPEN_MIN + 5, info: { level: lv } };
  return { pool: true, poolMin: OPEN_MIN + 5, fill: f, stop: Math.max(lowBefore(bars, f.i), f.px * (1 - adr)), info: { level: lv, base: level } };
}
export const setupQBO = (ctx, bars) => ctx.f && ctx.f.qbo ? baseBreak(ctx, bars, ctx.f.qbo.trig, ctx.f.qbo.adr) : { pool: false };
export const setupHTF = (ctx, bars) => ctx.f && ctx.f.htf ? baseBreak(ctx, bars, ctx.f.htf.top, ctx.f.htf.adr) : { pool: false };
export function setupVWAP(ctx, bars) {
  if (!(ctx.f && ctx.f.lead) || !bars.length || bars[0].m >= OPEN_MIN + 5) return { pool: false };
  const open = bars[0].o; let cv = 0, cpv = 0, flushed = false;
  for (let i = 0; i < bars.length; i++) { const b = bars[i]; cv += b.v; cpv += b.vw * b.v; const vwap = cv > 0 ? cpv / cv : b.c;
    if (!flushed && b.m < 630 && b.l <= 0.98 * open && b.c < vwap) flushed = true;
    const nx = bars[i + 1], blockEnd = b.m % 5 === 4 || !nx || Math.floor(nx.m / 5) !== Math.floor(b.m / 5);
    if (blockEnd && flushed && b.m <= 689 && b.c > vwap) { if (!nx || nx.m > 690) return { pool: true, poolMin: OPEN_MIN, info: { why: 'no next minute' } };
      const f = { i: i + 1, m: nx.m, px: nx.o, atOpen: true }; return { pool: true, poolMin: OPEN_MIN, fill: f, stop: lowBefore(bars, i + 1), info: { vwap: r4(vwap), open } }; }
    if (b.m > 689) break; }
  return { pool: true, poolMin: OPEN_MIN, info: { flushed } };
}
export function setupEMAPB(ctx, bars) {
  const z = orb(ctx, bars, 5, 0.04, 3); if (!z.pool) return z;
  const F = fiveMin(bars), k9 = 2 / 10, k21 = 2 / 22; let e9 = ctx.pc, e21 = ctx.pc, closedAbove = false, hod = -Infinity;
  for (const x of F) { e9 = x.c * k9 + e9 * (1 - k9); e21 = x.c * k21 + e21 * (1 - k21);
    const trend = closedAbove && hod > z.R.h;   // established by EARLIER 5-minute bars only
    if (trend && x.s >= 580 && x.s <= 685 && x.l <= e9 && x.c > e21) {
      const f = buyStop(bars, x.end + 1, x.s + 5 + 14, x.h); if (!f) return { ...z, info: { pullback: x.s } };
      return { ...z, fill: f, stop: x.l, info: { pullback: x.s, ema9: r4(e9), ema21: r4(e21) } }; }
    if (x.s > 685) break;
    if (x.s >= OPEN_MIN + 5) hod = Math.max(hod, x.h);
    if (x.c > e9) closedAbove = true; }
  return { ...z, info: { pullback: null } };
}
export function setupPWR(ctx, bars) {
  if (!(ctx.f && (ctx.f.gap || ctx.f.lead)) || !(ctx.pc > 0) || !(ctx.adr > 0)) return { pool: false };
  const i0 = idxFrom(bars, 900); if (i0 === 0) return { pool: false }; const last = bars[i0 - 1]; if (last.m < 890) return { pool: false };
  const hod = highBefore(bars, i0); let cv = 0; for (let k = 0; k < i0; k++) cv += bars[k].v; const rv = rvol(cv, ctx.adv, 330);
  if (!(last.c >= 1.03 * ctx.pc && last.c >= 0.99 * hod && rv >= 1.5)) return { pool: false };
  const H = rangeOf(bars, 840, 900); if (!H) return { pool: false };
  const f = buyStop(bars, i0, 950, hod); if (!f) return { pool: true, poolMin: 900, info: { hod } };
  return { pool: true, poolMin: 900, fill: f, stop: Math.max(H.l, f.px * (1 - ctx.adr)), info: { hod, rv: r4(rv) } };
}
export const RUN = { 'SQ2-ORB5': (c, b) => setupORB(c, b, 5), 'SQ2-ORB30': (c, b) => setupORB(c, b, 30), 'SQ2-EPORB': setupEP, 'SQ2-QBO': setupQBO, 'SQ2-VWAP': setupVWAP,
  'SQ2-EMAPB': setupEMAPB, 'SQ2-HTF': setupHTF, 'SQ2-PWR': setupPWR, 'SQ2-SWING': (c, b) => setupORB(c, b, 5) };

/** All rules on one day. stockDays: [{ sym, ctx, bars }] (minute units). Returns per rule: { trades: [...], pool: n }.
 *  A day-trade result carries g (worst case) and gOpt (best case), gross of the house cost, net of slippage; the matched control c
 *  (gross, same minute to the close, no slippage); swing rules carry the day-1 path and the controls' same-minute prices. */
export function runDay(stockDays, { slip = SLIP } = {}) {
  const out = {}, all = stockDays.filter(x => x.bars && x.bars.length);
  for (const id of IDS) { const S = SETUPS[id], res = all.map(x => ({ x, r: RUN[id](x.ctx, x.bars) })), pool = res.filter(z => z.r.pool), trades = [];
    for (const { x, r } of pool) { if (!r.fill) continue; const f = r.fill; if (!(r.stop < f.px)) continue;
      const W = walkDay(x.bars, f.i, r.stop, f.atOpen, LAST_BAR), m = f.m;
      const ctrlSet = pool.filter(z => z.x !== x && z.r.poolMin <= m && !(z.r.fill && z.r.fill.m <= m)).map(z => z.x);
      const matched = ctrlSet.length > 0, cs = matched ? ctrlSet : all.filter(z => z !== x && z.sym !== x.sym);
      const base = { id, sym: x.sym, m, fill: f.px, atOpen: f.atOpen, stop: r.stop, ambiguous: W.ambiguous, info: r.info || null, cType: matched ? 'matched' : 'all' };
      if (S.kind === 'day') { const gOf = (e, s) => (e.px * (1 - s)) / (f.px * (1 + s)) - 1;
        const cr = cs.map(z => { const p0 = priceAt(z.bars, m), p1 = lastClose(z.bars); return p0 > 0 && p1 > 0 ? p1 / p0 - 1 : null; }).filter(ok);
        trades.push({ ...base, exitM: W.pess.m, exit: W.pess.px, why: W.pess.why, g: r4(gOf(W.pess, slip)), gOpt: r4(gOf(W.opt, slip)), gLowSlip: r4(gOf(W.pess, SLIP_LOW)), c: cr.length ? r4(mean(cr)) : null, cN: cr.length }); }
      else { const ctrl = cs.map(z => { const p0 = priceAt(z.bars, m); return p0 > 0 ? [z.sym, p0, z.ctx.scale || 1] : null; }).filter(Boolean);
        trades.push({ ...base, day1: { pess: W.pess, opt: W.opt, close: lastClose(x.bars) }, scale: x.ctx.scale || 1, ctrl }); } }
    out[id] = { trades, pool: pool.length }; }
  return out;
}

// ---------- daily plan flags for day t (uses ONLY daily data up to t-1 plus the open of t) ----------
// S = { o, h, l, c, v } (daily units), I = decoded-core indicators. Returns null (not in the universe) or { pc, adv, adr, f }.
export function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
export function universe(S, t) { const y = t - 1; if (y < 20 || !(S.c[y] >= MIN_PX)) return false; const dv = []; for (let k = y - 19; k <= y; k++) if (S.c[k] > 0 && S.v[k] > 0) dv.push(S.c[k] * S.v[k]); return dv.length >= 15 && median(dv) >= MIN_DV; }
export function adrAt(S, y, n = 20) { if (y - n + 1 < 0) return NaN; let s = 0, m = 0; for (let k = y - n + 1; k <= y; k++) if (S.h[k] > 0 && S.l[k] > 0) { s += S.h[k] / S.l[k] - 1; m++; } return m >= 15 ? s / m : NaN; }
export function advAt(S, y, n = 20) { let s = 0, m = 0; for (let k = Math.max(0, y - n + 1); k <= y; k++) if (S.v[k] > 0) { s += S.v[k]; m++; } return m >= 15 ? s / m : NaN; }
export function smaAt(c, y, n) { if (y - n + 1 < 0) return NaN; let s = 0; for (let k = y - n + 1; k <= y; k++) { if (!(c[k] > 0)) return NaN; s += c[k]; } return s / n; }
/** HTF pole/flag at the close of y (pre-registered above). Returns { top, p } or null. */
export function htfAt(S, y) {
  if (y < 80) return null; let p = -1, top = -Infinity; for (let k = y - 39; k <= y; k++) { if (!(S.h[k] > 0)) return null; if (S.h[k] > top) { top = S.h[k]; p = k; } }
  if (!(y - p >= 3 && y - p <= 25)) return null; let pl = Infinity; for (let k = p - 39; k <= p; k++) { if (!(S.l[k] > 0)) return null; if (S.l[k] < pl) pl = S.l[k]; }
  if (!(top >= 1.9 * pl)) return null; for (let k = p + 1; k <= y; k++) if (!(S.l[k] >= 0.75 * top)) return null;
  if (!(S.c[y] < top)) return null; return { top, p };
}
/** gap / EP / HTF flags and context for day t (leaders and QBO orders are cross-sectional / stateful: the lab adds them). */
export function dayFlags(S, t, gapFetch = 0.035) {
  if (t < 1 || !universe(S, t)) return null; const y = t - 1, pc = S.c[y], adv = advAt(S, y), adr = adrAt(S, y); if (!(adv > 0)) return null;
  const f = {}, gap = S.o[t] > 0 ? S.o[t] / pc - 1 : NaN;
  if (gap >= gapFetch) f.gap = 1;
  if (gap >= 0.095 && S.c[y - 63] > 0 && pc / S.c[y - 63] - 1 <= 0.20) f.ep = 1;
  const h = htfAt(S, y); if (h && adr > 0) f.htf = { top: h.top, adr };
  return { pc, adv, adr, f };
}
/** leader score at the close of y: 63-session return when the close is above its 50-day average and the return >= 30%, else null */
export function leaderScore(S, y) { if (y < 64 || !(S.c[y] > 0) || !(S.c[y - 63] > 0)) return null; const m = smaAt(S.c, y, 50); if (!(S.c[y] > m)) return null; const r = S.c[y] / S.c[y - 63] - 1; return r >= 0.30 ? r : null; }

// ---------- swing continuation on daily bars (day 2 onward; day 1 was walked on minutes) ----------
// S daily (daily units), sma10 array, k = entry session, fill/stop daily units, last = last session index available.
// Returns { state: 'closed'|'open', x, legs: [[session, qty, px, why]], g } with g net of slippage (gross of the house cost).
export function continueDaily(engine, S, sma10, k, fill, stop0, last, { slip = SLIP } = {}) {
  const { o, h, l, c } = S, legs = []; let w = 1, val = 0, stop = stop0, pending = false, lastOk = k;
  const maxDays = engine === 'KQ' ? 120 : 60, sell = (j, q, px, why) => { q = Math.min(w, q); if (q <= 0) return; legs.push([j, +q.toFixed(4), +(+px).toFixed(4), why]); val += q * px * (1 - slip); w -= q; };
  if (engine === 'S10' && c[k] < sma10[k]) pending = true;
  for (let j = k + 1; j <= last && w > 1e-9; j++) {
    if (!(c[j] > 0) || !(o[j] > 0)) { if (j - lastOk > 15) { sell(j, w, c[lastOk], 'no more prices'); break; } continue; }
    const day = j - k + 1;
    if (pending) { sell(j, w, o[j], 'next open after the exit close'); break; }
    if (engine === 'L10') { let lo10 = Infinity; for (let q = Math.max(0, j - 10); q < j; q++) if (l[q] > 0 && l[q] < lo10) lo10 = l[q]; if (lo10 < Infinity) stop = Math.max(stop, lo10); }
    if (o[j] <= stop) { sell(j, w, o[j], 'opened under the stop'); break; }
    if (l[j] <= stop) { sell(j, w, stop, 'stop'); break; }
    lastOk = j;
    if (engine === 'KQ') { if (day === 3 && c[j] > fill) { sell(j, 1 / 3, c[j], 'partial 1/3 on day 3'); stop = Math.max(stop, fill); } if (day >= 4 && c[j] < sma10[j]) pending = true; }
    else if (engine === 'S10') { if (c[j] < sma10[j]) pending = true; }
    if (w > 1e-9 && day >= maxDays && !pending) { sell(j, w, c[j], 'time limit (' + maxDays + ' sessions)'); break; }
  }
  const den = fill * (1 + slip);
  if (w > 1e-9) return { state: 'open', x: lastOk, legs, g: (val + w * c[lastOk] * (1 - slip)) / den - 1, held: w };
  return { state: 'closed', x: legs[legs.length - 1][0], legs, g: val / den - 1 };
}

// ---------- results shape ----------
export function shape(rows, cost = COST) { const net = rows.map(r => r.g - cost), win = net.filter(x => x > 0), loss = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null, avgWin: win.length ? r4(sum(win) / win.length) : null,
    avgLoss: loss.length ? r4(sum(loss) / loss.length) : null, pf: loss.length && sum(loss) < 0 ? r4(sum(win) / -sum(loss)) : null }; }
export function boardStats(rows) { const s = shape(rows); return { ...s, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;

// ---------- library pre-registration (idempotent) ----------
export function preRegister(LB, day = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, a] of Object.entries(SETUPS)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Intraday execution (squad 2, minute bars)', name: a.name, explain: a.rule + ' ' + ORIG + ' Same-setup earlier tests: ' + (a.old.join(', ') || 'none') + '.',
      status: 'pre-registered ' + day + ' (squad 2 lab); 5-year one-shot on 1-minute SIP bars pending', agent: 'squad2', libraryCheck: a.old.length ? 'Same setup entered at the next open on daily bars: ' + a.old.join(', ') : 'none',
      sources: a.src.map(p => p.url), spec: 'squad2-core.mjs header (common conventions) + SETUPS[' + id + ']; kind ' + a.kind + (a.engine ? ', exit engine ' + a.engine : '') + '; blocks of ' + a.block + ' sessions.',
      note: 'Pre-registered ' + day + ' BEFORE any run (squad2-core.mjs = the exact rule; one version). 5-year one-shot by squad2-lab.mjs on Alpaca SIP 1-minute bars, first complete verdict frozen in data/squad2-lab.json; forward paper lane (data/squad2-paper.jsonl) from 26 Oct 2026. INTRADAY ENTRY: TRY SMALL (next-open orders) must not take its signals; a winner needs a live intraday alert path.',
      study: 'squad2-lab.mjs -> data/squad2-lab.json (run once as written, first complete run frozen)' }); ch++; }
  if (ch) LB.updated = day; return ch; }
