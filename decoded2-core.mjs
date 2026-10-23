// DECODED CORE, BATCH 2 (23 Oct 2026; owner: "7 is far too few: study more, dig, you have the whole web and a lot of winning traders").
// Pure functions, no network, no files. Extends decoded-core.mjs (same series format S = { o, h, l, c, v }, same liquidity, same lab).
// Every detector reads only what is known at the moment of its entry; entries: 'open' (next open), 'close' (the signal close, bought in
// the last minutes), 'stop' (a resting buy-stop from the next session), 'today' (a buy-stop / open order resting BEFORE session t whose
// level was known from earlier bars; it fills during session t). Long only; no leverage; no options.
// ONE generic exit engine (simulate2) runs each method's OWN stop, partial sale, trailing rule, scale-in and time limit (spec in METHODS2).
// Same-day ambiguity on daily bars is booked the WORST way: a stop known before an intraday fill that is touched the same day counts as hit.
//
// PRE-REGISTERED RULES (written 23 Oct 2026 BEFORE any batch-2 result was seen; one version each unless listed; library ids DEC2-*):
// (shorthand: liquid = close 5 USD+ and 20-day traded value 5M USD+, as batch 1; vavg50 = 50-day average volume; R = fill - initial stop)
//  DEC2-DARVAS  Darvas box. Box top H = the highest high of t-25..t-1, made 4+ sessions ago with 3 lower highs after it, and a 52-week
//               high; box bottom B = the lowest low after the top, made 4+ sessions ago (3 higher lows after it). Buy-stop at H (fills
//               during t, at the open if it gaps over). Stop just under the box bottom (0.995 B). Trail: each new box that forms above
//               (top confirmed by 3 lower highs, bottom by 3 higher lows) lifts the stop under its bottom. Max 504 sessions. No market filter.
//  DEC2-WEIN    Weinstein Stage 2 (weekly, on the week's last session). Week close above the 20-week resistance (highest high of the 100
//               sessions before the week) after the prior week closed at or under it; that base no deeper than 35%; 30-week average
//               (150-day) not lower than 4 weeks ago; the week's average daily volume >= 2x the prior 10 weeks'; Mansfield RS > 0 (stock/SPY
//               ratio above its 52-week average). MARKET: SPY above its 30-week average. Next open. Stop: lowest low of the 4 weeks before
//               the breakout week (skipped if more than 15% away). Exit: next open after a WEEK close under the 30-week average. Max 504.
//  DEC2-LIVER   Livermore pivotal point (continuation). Close > 50-day > 200-day; pivotal point P = the highest close of t-60..t-6; a
//               natural reaction since then of 10-35% (lowest close after P); yesterday's close at or under P, today's close above it on
//               volume >= 1.5x vavg50. Next open. Exit at the next open after a close back under P (pivot failed) or after a reaction from
//               the highest close since entry larger than the setup's natural reaction (at least 10%). Max 252.
//  DEC2-TURT20  Turtle System 1. Buy-stop at the prior 20-day high (fills during t). N = 20-day Wilder ATR. Stop 2N under the last unit.
//               Add a unit (equal money) at each close 1/2 N above the last unit, up to 4 units (the Turtles add intraday at the level; a
//               close is the daily-bar stand-in). Exit: a trade under the prior 10-day low (intraday). SKIP RULE: skip a signal if the last
//               System-1 breakout of that stock (taken or skipped) was a winner. No market filter.
//  DEC2-TURT55  Turtle System 2: 55-day breakout, exit under the prior 20-day low, same N, 2N stop and units; no skip rule.
//  DEC2-ZANGER  Zanger chart-pattern breakout: close > 50-day > 200-day, up 30%+ in 126 sessions; a 20-session base no deeper than 20%;
//               close above the base high (not more than 5% above) on volume >= 1.5x vavg50, yesterday at or under it. Buy the close. Stop
//               just under the breakout point (0.99 x base high), at most 7% away. If day 2 does not close above the buy price: sell its
//               close ("no acceleration on day one"). Sell 25% at +15%. Rest: next open after a close under the 21-day EMA. Max 252.
//  DEC2-IBD     IBD 85-85 (price half; the EPS rating needs data) + O'Neil base breakout + O'Neil sell rules. Relative strength top 15%;
//               8-week base (t-40..t-1) 5-33% deep after a prior 30%+ advance; close above the base high, within 5%, on volume >= 1.4x
//               vavg50. MARKET: SPY above its 50-day. Buy the close. Stop 8%. Sell all at a close 20%+ above cost, EXCEPT when the +20%
//               came within 15 sessions: then hold to the close of session 40 (8 weeks) with the stop at cost. Max 120.
//  DEC2-BBSQ    Bollinger squeeze (Method I): BandWidth (4 sd / 20-day average) made a 125-session low within the last 5 sessions;
//               today's close above the upper band, yesterday's not. Next open. Exit: Wilder parabolic SAR (0.02 step, 0.20 max), started
//               at the lowest low of t-4..t, as an intraday stop. Max 252.
//  DEC2-KELT    Keltner 10-day rule (1960): middle = 10-day average of (h+l+c)/3, bands +/- the 10-day average range. Buy-stop at
//               yesterday's upper band (fills during t). Exit: a trade under the lower band (it moves with the band). Max 252.
//  DEC2-GOLDX   Golden cross with filters: the 50-day crosses above the 200-day; the 200-day higher than 20 sessions ago; close above
//               the 50-day. Next open. Exit at the next open after the 50-day closes under the 200-day (death cross). Max 504.
//  DEC2-ICHI    Ichimoku cloud breakout: close above the plotted cloud (spans from 26 sessions ago), yesterday's not; tenkan > kijun;
//               close above the close 26 sessions ago (chikou); the forward cloud green. Next open. Exit next open after a close under
//               the kijun. Max 504.
//  DEC2-APPEL   Gerald Appel's two-MACD system: buy when MACD(8,17) crosses above its 9-period signal; sell (next open) when MACD(12,25)
//               crosses under its 9-period signal. Max 252.
//  DEC2-POCKET  Kacher & Morales pocket pivot: up close; volume above the largest down-day volume of the prior 10 sessions; low within 2%
//               of the 10-day average and close at or above it, not more than 5% above; close > 50-day > 200-day; close in the top half.
//               Buy the close. Stop: the pivot-day low, at most 8%. Sell (O'Neil-disciple rule): after a close under the 10-day line, sell
//               if the next session trades under that day's low; if the stock has not closed under the 10-day for 35 sessions (7 weeks)
//               the 50-day line takes over the same role. Max 252.
//  DEC2-BGU     Kacher & Morales buyable gap-up: open >= prior close + 0.75 x 40-day ATR; volume >= 1.5x vavg50; close above the prior
//               close; close above a 200-day that is higher than 30 sessions ago. Buy the close. Stop: the gap-day low. Sell rule as POCKET.
//  DEC2-WEDGE   Oliver Kell wedge pop: in the last 5 sessions a close under the 10 or 20-day EMA; those 5 sessions within 2x ADR; today
//               gaps over yesterday's high and closes above both EMAs, above its open, on volume above vavg50; close above the 200-day.
//               Next open. Stop: the pop-day low (skipped if more than 10% away). Sell half at a close 20%+ above the 10-day EMA
//               (exhaustion extension); rest at the next open after a close under the 20-day EMA. Max 252.
//  DEC2-MINTT   Minervini trend template alone: the first day all template conditions hold (batch-1 trendTemplate, RS top 30%) after a
//               day they did not. Next open. Exit: 25% trailing stop under the highest close since entry. Max 504. No market filter.
//  DEC2-STINE   Jesse Stine "superstock" traits: shares outstanding (SEC, point in time) <= 30M; a new 52-week closing high out of a
//               flat year (t-252..t-22 high/low <= 1.6); volume >= 3x vavg50; close in the top half. Next open. Stop 15%. Sell half at +100%;
//               rest at the next open after a close under the 50-day. Max 504.
//  DEC2-HOLYG   Raschke Holy Grail: the recent swing high (highest high of t-10..t-1) came with ADX(14) > 30 and rising, +DI > -DI; today
//               is the first touch of the 20-day EMA. Buy-stop at today's high for 1 session. Stop: today's low. Target: the swing high.
//               Max 20 sessions (our cap).
//  DEC2-8020    Raschke 80-20: yesterday opened in the top 20% of its range and closed in the bottom 20%; today opens under yesterday's
//               low and trades back up to it (buy-stop at yesterday's low). Stop: today's low (from day 2). Sell the close of day 2.
//  DEC2-NR7ID   Crabel NR7 inside day: today's range is the narrowest of 7 and inside yesterday's. Buy-stop at today's high for 1
//               session; stop at today's low; sell at the close of the breakout day.
//  DEC2-LWVB    Larry Williams volatility breakout: yesterday closed above its 20-day average; buy-stop at today's open + 0.5 x
//               yesterday's range. Stop one range under the fill. Exit: the first profitable open (bail-out), else the close of day 5.
//  DEC2-RSI2    Connors RSI(2): close above the 200-day, RSI(2) < 5. Buy the close; sell the close when it closes above the 5-day
//               average. No stop (Connors). Max 60.
//  DEC2-TPS     Connors TPS: close above the 200-day, RSI(2) < 25 two days running: buy 10% at the close; add 20%, 30%, 40% at each
//               later close under the last buy; sell everything at the close when RSI(2) > 70. No stop. Max 60.
//  DEC2-DBL7    Connors Double 7s: close above the 200-day and at a 7-day closing low: buy the close; sell the close at a 7-day closing
//               high. Max 60.
//  DEC2-H2      Al Brooks second entry (daily): 20-day EMA rising; a trend high in t-15..t-2; one failed up-attempt (H1) followed by a
//               lower low; today a pullback bar near the EMA closing in its top half. Buy-stop at today's high for 1 session; stop at
//               today's low; target 2R; max 10 sessions.
//  DEC2-NISON   Nison candle at support with confirmation: yesterday a bullish engulfing or hammer at the 20-day low (within 1%), after
//               a close under the 20-day average; today closes above yesterday's high. Buy the close. Exit: next open after a close
//               under the pattern low; target the prior 20-day high (resistance); max 20.
//  DEC2-WYCK    Wyckoff spring: a 55-session range t-60..t-6, 8-30% high; in t-5..t a low under support (not more than 10% under);
//               today closes back above support (today made the spring or yesterday closed under it). Next open. Stop 1% under the spring
//               low. Sell half at the range top (stop to cost); rest at support + 2 range heights, or the next open after a close under
//               the 50-day once the first target was hit. Max 126.
//  DEC2-GAPGO   Gap and go (daily): yesterday above its 50-day; opens 4%+ above yesterday's close: buy the open; stop at yesterday's close
//               (gap filled); sell the close.
//  DEC2-GAPFILL Gap fill, long side: yesterday above its 200-day; opens 2%+ under yesterday's close: buy the open; sell at yesterday's
//               close if reached (gap filled), else at the close.
//  DEC2-TSOUP   Raschke/Connors Turtle Soup Plus One: today closes under the prior 20-day low, which was made 3+ sessions earlier;
//               buy-stop at that prior low for 1 session; stop under the lower of the two days' lows; sell the close of day 5.
//  DEC2-SANTA   Santa Claus rally (Hirsch, Stock Trader's Almanac), SPY only: buy the close before the last 5 sessions of December, sell
//               the close of the 2nd January session.
//  DEC2-TOM     Turn of the month (Hirsch), SPY only: buy the close of the second-to-last session of the month, sell the close of the
//               4th session of the new month.
//  DEC2-FROGTRIG  Combination: a stock in the latest DEC-FROG basket (smooth 12-month leader), entered only on a DEC-QBO or DEC-PB
//               trigger (their own entry); stop and trail = the 10-day low (intraday), or the close of day 126, whichever first.
//  DEC2-CONTRACT  8-K item 1.01 (material agreement) reaching the market in t-2..t (SEC acceptance time, New York session); market value
//               (SEC shares known 30 days earlier x close) < 2B USD; today closes 4%+ up on volume >= 2x vavg50; not up 100%+ in 21
//               sessions. Next open. Stop: today's low; trail: the 10-day low. Max 252.
//  DEC2-INSQ    Insider quality: 2+ different insiders' open-market buys (Form 4) filed within 5 days, together > 200k USD, the cluster
//               completing on t (filing date); the company passes B-FCF1 (value-core.mjs fcfCheck) on t. Next open. Stop 15%. Hold 63.
//  DEC2-X-<entry>-<stop>-<trail>-<P|N>  (48 versions) Exit set on the batch-1 entries QBO / PB / VCP / EP (their own entries, entry
//               filters and skips unchanged). Stop DL = the day low (buy-stop entries: the entry-day low, from day 2, booked as stopped at
//               1 ADR if the entry day fell more than 1 ADR; open entries: the signal-day low) or 2A = 2 x 14-day ATR under the fill. Trail
//               L10 = intraday under the 10-day low, E21 = next open after a close under the 21-day EMA, S50 = next open after a close under
//               the 50-day. P = sell half at fill + 3R; N = no partial. Max 252.
//  DEC2-F-<QBO|PB>-<EXT10|EXT20|STRONG|ADD>  (8 versions) Champion filters on the batch-1 rule with its OWN exit: EXT10/EXT20 skip a signal
//               whose close is more than 10% / 20% above its 20-day average; STRONG adds the strong market filter (QQQ 10-day > 20-day, 20-day
//               rising, more than 50% of liquid stocks above their 50-day, more 52-week highs than lows); ADD adds 50% once, at the first close
//               5%+ above the fill that is the highest close since entry (reported separately).
import { smaArr, emaArr, indicators, hi, lo, avg, liquid, detectQBO, detectPB, detectVCP, detectEP, trendTemplate, COST } from './decoded-core.mjs';
const ok = (x) => typeof x === 'number' && isFinite(x);
const pos = (S, t) => { const r = S.h[t] - S.l[t]; return r > 0 ? (S.c[t] - S.l[t]) / r : 0.5; };
const argHi = (x, a, b) => { let k = -1, m = -Infinity; for (let i = a; i <= b; i++) { if (!ok(x[i])) return -1; if (x[i] >= m) { m = x[i]; k = i; } } return k; };   // last index of the max
const argLo = (x, a, b) => { let k = -1, m = Infinity; for (let i = a; i <= b; i++) { if (!ok(x[i])) return -1; if (x[i] <= m) { m = x[i]; k = i; } } return k; };
// ---------- indicators (superset of batch 1) ----------
export function wilderArr(x, p) { const n = x.length, o = new Float64Array(n).fill(NaN); let s = NaN, run = 0, acc = 0;
  for (let i = 0; i < n; i++) { const a = x[i]; if (!ok(a)) { s = NaN; run = 0; acc = 0; continue; } run++; if (run < p) { acc += a; continue; } if (run === p) { acc += a; s = acc / p; } else s = s + (a - s) / p; o[i] = s; } return o; }
export function rollHi(x, p) { const n = x.length, o = new Float64Array(n).fill(NaN); for (let i = p - 1; i < n; i++) o[i] = hi(x, i - p + 1, i); return o; }
export function rollLo(x, p) { const n = x.length, o = new Float64Array(n).fill(NaN); for (let i = p - 1; i < n; i++) o[i] = lo(x, i - p + 1, i); return o; }
export function rsiArr(c, p) { const n = c.length, up = new Float64Array(n).fill(NaN), dn = new Float64Array(n).fill(NaN);
  for (let i = 1; i < n; i++) if (ok(c[i]) && ok(c[i - 1])) { const d = c[i] - c[i - 1]; up[i] = Math.max(d, 0); dn[i] = Math.max(-d, 0); }
  const U = wilderArr(up, p), Dn = wilderArr(dn, p), o = new Float64Array(n).fill(NaN); for (let i = 0; i < n; i++) if (ok(U[i]) && ok(Dn[i])) o[i] = U[i] + Dn[i] === 0 ? 50 : 100 * U[i] / (U[i] + Dn[i]); return o; }
export function ind2(S) {
  const I = indicators(S), n = S.c.length, { o, h, l, c } = S, tr = new Float64Array(n).fill(NaN), pdm = new Float64Array(n).fill(NaN), mdm = new Float64Array(n).fill(NaN), tp = new Float64Array(n).fill(NaN), hl = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) { if (ok(h[i]) && ok(l[i]) && ok(c[i])) { tp[i] = (h[i] + l[i] + c[i]) / 3; hl[i] = h[i] - l[i]; }
    if (i && ok(h[i]) && ok(l[i]) && ok(c[i - 1]) && ok(h[i - 1]) && ok(l[i - 1])) { tr[i] = Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])); const u = h[i] - h[i - 1], d = l[i - 1] - l[i]; pdm[i] = u > d && u > 0 ? u : 0; mdm[i] = d > u && d > 0 ? d : 0; } }
  I.atr14 = smaArr(tr, 14); I.atr40 = smaArr(tr, 40); I.atrW20 = wilderArr(tr, 20); I.rsi2 = rsiArr(c, 2); I.sma5 = smaArr(c, 5); I.ema10 = emaArr(c, 10); I.ema20 = emaArr(c, 20);
  const sTR = wilderArr(tr, 14), sP = wilderArr(pdm, 14), sM = wilderArr(mdm, 14), dx = new Float64Array(n).fill(NaN); I.pdi = new Float64Array(n).fill(NaN); I.mdi = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) if (sTR[i] > 0) { I.pdi[i] = 100 * sP[i] / sTR[i]; I.mdi[i] = 100 * sM[i] / sTR[i]; const s = I.pdi[i] + I.mdi[i]; dx[i] = s > 0 ? 100 * Math.abs(I.pdi[i] - I.mdi[i]) / s : 0; }
  I.adx = wilderArr(dx, 14);
  const e8 = emaArr(c, 8), e17 = emaArr(c, 17), e12 = emaArr(c, 12), e25 = emaArr(c, 25); I.macdB = new Float64Array(n).fill(NaN); I.macdS = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) { I.macdB[i] = e8[i] - e17[i]; I.macdS[i] = e12[i] - e25[i]; } I.sigB = emaArr(I.macdB, 9); I.sigS = emaArr(I.macdS, 9);
  I.sd20 = new Float64Array(n).fill(NaN); for (let i = 19; i < n; i++) { const m = I.sma20[i]; if (!ok(m)) continue; let s = 0; for (let k = i - 19; k <= i; k++) s += (c[k] - m) ** 2; I.sd20[i] = Math.sqrt(s / 20); }
  I.bw = new Float64Array(n).fill(NaN); I.bbUp = new Float64Array(n).fill(NaN); for (let i = 0; i < n; i++) if (I.sma20[i] > 0 && ok(I.sd20[i])) { I.bw[i] = 4 * I.sd20[i] / I.sma20[i]; I.bbUp[i] = I.sma20[i] + 2 * I.sd20[i]; }
  const km = smaArr(tp, 10), kr = smaArr(hl, 10); I.kUp = new Float64Array(n).fill(NaN); I.kLo = new Float64Array(n).fill(NaN); for (let i = 0; i < n; i++) { I.kUp[i] = km[i] + kr[i]; I.kLo[i] = km[i] - kr[i]; }
  const h9 = rollHi(h, 9), l9 = rollLo(l, 9), h26 = rollHi(h, 26), l26 = rollLo(l, 26), h52 = rollHi(h, 52), l52 = rollLo(l, 52);
  I.tenkan = new Float64Array(n).fill(NaN); I.kijun = new Float64Array(n).fill(NaN); I.spanA = new Float64Array(n).fill(NaN); I.spanB = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) { I.tenkan[i] = (h9[i] + l9[i]) / 2; I.kijun[i] = (h26[i] + l26[i]) / 2; I.spanA[i] = (I.tenkan[i] + I.kijun[i]) / 2; I.spanB[i] = (h52[i] + l52[i]) / 2; }
  return I;
}
// ---------- the generic exit engine ----------
// X = the method spec { maxDays, exit(S, I, j, st), partialR, partialFrac, bailout }. sig = the detector's frozen numbers.
// returns the batch-1 shape: { state, k, fill, x, legs, g, held, mark, stop, why } ; g = (sales + marked holding) / money put in - 1.
export function simulate2(X, S, I, t, sig, last = S.c.length - 1) {
  const { o, h, l, c } = S, e = sig.entry; let k = -1, fill = NaN, atOpen = true;
  if (e === 'stop') {
    for (let j = t + 1; j <= Math.min(t + sig.valid, last); j++) { if (!ok(o[j]) || !ok(h[j])) continue;
      if (sig.maxAbove && o[j] > sig.trigger * (1 + sig.maxAbove)) return { state: 'skipped', why: 'opened more than ' + (sig.maxAbove * 100) + '% above the pivot' };
      if (o[j] >= sig.trigger) { k = j; fill = o[j]; break; } if (h[j] >= sig.trigger) { k = j; fill = sig.trigger; atOpen = false; break; }
      if (ok(sig.cancelBelow) && c[j] < sig.cancelBelow) return { state: 'cancelled', why: 'closed under the base low before the break' }; }
    if (k < 0) return { state: last < t + sig.valid ? 'pending' : 'expired' };
  } else if (e === 'open') { k = t + 1; if (k > last) return { state: 'pending' }; fill = o[k]; }
  else if (e === 'close') { k = t; fill = c[t]; atOpen = false; }
  else if (e === 'today') { k = t; fill = sig.fill; atOpen = ok(o[t]) && Math.abs(sig.fill - o[t]) < 1e-9; }
  if (!(fill > 0)) return { state: 'skipped', why: 'no entry price' };
  if (sig.entrySkip) { const { lowRef, maxDist } = sig.entrySkip; if (!(fill > lowRef)) return { state: 'skipped', why: 'opened at or under the stop' }; if ((fill - lowRef) / fill > maxDist) return { state: 'skipped', why: 'stop more than ' + (maxDist * 100) + '% away' }; }
  let stop = -Infinity; if (ok(sig.stop)) stop = sig.stop; if (ok(sig.stopAtr)) stop = Math.max(stop, fill - sig.stopAtr); if (ok(sig.stopPct)) stop = Math.max(stop, fill * (1 - sig.stopPct));
  if (stop > -Infinity) { if (!(fill > stop)) return { state: 'skipped', why: 'opened at or under the stop' }; if (sig.skipRisk && (fill - stop) / fill > sig.skipRisk) return { state: 'skipped', why: 'stop more than ' + (sig.skipRisk * 100) + '% away' }; }
  const targets = (sig.targets || (ok(sig.target) ? [{ px: sig.target, frac: sig.targetFrac || 1, be: !!sig.targetBE }] : [])).map(z => ({ ...z }));
  if (targets.length && !(targets[0].px > fill)) return { state: 'skipped', why: 'opened at or above the target' };
  const sh0 = (sig.cap0 || 1) / fill; let sh = sh0, inv = sig.cap0 || 1, got = 0; const legs = [];
  const sell = (j, f, px, why) => { const q = sh * Math.min(1, f); if (q <= 0) return; legs.push([j, +(q / sh0).toFixed(4), +(+px).toFixed(4), why]); got += q * px; sh -= q; if (sh < sh0 * 1e-9) sh = 0; };
  const buy = (j, cap, px, why) => { sh += cap / px; inv += cap; legs.push([j, -+(cap / px / sh0).toFixed(4), +(+px).toFixed(4), why]); };
  const st = { t, k, fill, sig, stop, maxC: fill, prevMaxC: fill, day: 0, R: stop > -Infinity ? fill - stop : NaN, targets, adds: 0, lastEntry: fill };
  if (X.partialR && ok(st.R) && !sig.stopEntryLow) targets.push({ px: fill + X.partialR * st.R, frac: X.partialFrac || 0.5, why: 'partial at ' + X.partialR + 'R' });
  const hitTargets = (j) => { for (const z of targets) { if (z.done || !ok(h[j]) || !(h[j] >= z.px)) continue; sell(j, z.frac, Math.max(ok(o[j]) && j > k ? o[j] : z.px, z.px), z.why || 'target'); z.done = true; if (z.be) stop = Math.max(stop, fill); if (!sh) break; } };
  let lastOk = k, pend = false; const maxDays = X.maxDays || 252;
  for (let j = k; j <= last && sh > 0; j++) {
    if (!ok(c[j])) { if (j - lastOk > 15) { sell(j, 1, c[lastOk], 'no more prices'); break; } continue; }
    const day = j - k + 1; st.day = day;
    if (j > k) {
      if (pend) { sell(j, 1, ok(o[j]) ? o[j] : c[j], 'next open after the exit close'); break; }
      if (X.bailout && ok(o[j]) && o[j] > fill) { sell(j, 1, o[j], 'first profitable open'); break; }
      if (stop > 0) { if (ok(o[j]) && o[j] <= stop) { sell(j, 1, o[j], 'opened under the stop'); break; } if (ok(l[j]) && l[j] <= stop) { sell(j, 1, stop, 'stop'); break; } }
      hitTargets(j); if (!sh) break;
    } else {
      if (e !== 'close' && !sig.stopEntryLow && stop > 0 && ok(l[k]) && l[k] <= stop) { sell(k, 1, stop, atOpen ? 'stop' : 'stop the same day (worst case: the low counted after the buy)'); break; }
      if (atOpen) { hitTargets(k); if (!sh) break; }
    }
    lastOk = j;
    if (j === k && sig.stopEntryLow) { const a = sig.adr; if (ok(a) && l[k] < fill * (1 - a)) { sell(k, 1, fill * (1 - a), 'entry day fell more than 1 ADR: booked as stopped'); break; }
      stop = ok(sig.lowCap) ? Math.min(l[k], sig.lowCap) : l[k]; st.R = fill - stop; if (X.partialR && st.R > 0) targets.push({ px: fill + X.partialR * st.R, frac: X.partialFrac || 0.5, why: 'partial at ' + X.partialR + 'R' }); }
    st.prevMaxC = st.maxC; st.maxC = Math.max(st.maxC, c[j]); st.stop = stop; st.shares = sh / sh0;
    const a = X.exit ? X.exit(S, I, j, st) : null;
    if (a) { if (ok(a.stop)) stop = Math.max(stop, a.stop); if (a.stopTo !== undefined && ok(a.stopTo)) stop = a.stopTo;
      if (a.add) { buy(j, a.add[0], c[j], a.add[1]); st.adds++; st.lastEntry = c[j]; }
      if (a.sellClose) sell(j, a.sellClose[0], c[j], a.sellClose[1]);
      if (a.close) { sell(j, 1, c[j], a.close); break; } if (a.next) pend = a.next; }
    if (!sh) break;
    if (day >= maxDays && !pend) { sell(j, 1, c[j], 'time limit (' + maxDays + ' sessions)'); break; }
  }
  if (sh > 0) { const m = c[lastOk]; return { state: 'open', k, fill, legs, g: (got + sh * m) / inv - 1, held: +(sh / sh0).toFixed(4), mark: m, stop: stop > 0 ? stop : null, why: pend ? 'exit at the next open' : null }; }
  const sells = legs.filter(z => z[1] > 0), x = sells.length ? sells[sells.length - 1][0] : k; return { state: 'closed', k, fill, x, legs, g: got / inv - 1 };
}
// ---------- exit rules (called at each close j; st.k = entry index) ----------
const lowTrail = (n) => (S, I, j) => ({ stop: lo(S.l, j - n + 1, j) });
const closeUnder = (line, why) => (S, I, j, st) => (j > st.k || st.sig.entry !== 'close') && S.c[j] < I[line][j] ? { next: why } : null;
export const EXITS = {
  kq: (S, I, j, st) => { const r = {}; if (st.day === 3 && S.c[j] > st.fill) { r.sellClose = [1 / 3, 'partial 1/3 on day 3']; r.stop = st.fill; } if (st.day >= 4 && S.c[j] < I.sma10[j]) r.next = 'close under the 10-day'; return r; },
  pb: closeUnder('ema9', 'close under the 9-day EMA'),
  turtle: (n) => (S, I, j, st) => { const N = st.sig.N, r = {}; if (st.adds < 3 && S.c[j] >= st.lastEntry + N / 2 && j > st.k) r.add = [1, 'Turtle unit at +1/2 N']; const last = r.add ? S.c[j] : st.lastEntry;
    r.stop = Math.max(last - 2 * N, lo(S.l, j - n + 1, j)); return r; },
  oneil: (S, I, j, st) => { if (st.base === undefined) { st.base = st.stop; st.line = 'sma10'; st.below10 = false; st.viol = -1; } if (j === st.k && st.sig.entry === 'close') return null;
    if (!st.below10 && j - st.k >= 35) st.line = 'sma50'; const line = I[st.line][j];
    if (S.c[j] < line) { if (st.line === 'sma10') st.below10 = true; st.viol = j; return { stopTo: Math.max(st.base, S.l[j]) }; }
    if (st.viol >= 0) { st.viol = -1; return { stopTo: st.base }; } return null; },
  sar: (S, I, j, st) => { if (st.sar === undefined) { st.sar = st.sig.stop; st.af = 0.02; st.ep = S.h[j]; }
    else if (S.h[j] > st.ep) { st.ep = S.h[j]; st.af = Math.min(0.2, st.af + 0.02); }
    let s = st.sar + st.af * (st.ep - st.sar); s = Math.min(s, S.l[j], ok(S.l[j - 1]) ? S.l[j - 1] : S.l[j]); st.sar = Math.max(st.sar, s); return { stop: st.sar }; },
  darvas: (S, I, j, st) => { if (j < st.k + 3) return null; const p = argHi(S.h, st.k, j - 3); if (p < 0) return null; const H = S.h[p]; if (!(hi(S.h, p + 1, j) < H) || p + 1 > j) return null;
    const q = argLo(S.l, p + 1, j); if (q < 0 || q > j - 3) return null; return { stop: S.l[q] * 0.995 }; },
};
// ---------- detectors ----------
const L = (S, I, t) => t > 0 && liquid(S, I, t);
export function detectDarvas(S, I, t) { if (t < 260 || !L(S, I, t - 1) || !ok(S.o[t]) || !ok(S.h[t])) return null; const { h, l } = S;
  const p = argHi(h, t - 25, t - 1); if (p < 0 || p > t - 4) return null; const H = h[p]; if (!(h[p + 1] < H && h[p + 2] < H && h[p + 3] < H)) return null;
  if (!(hi(h, t - 252, t - 1) <= H)) return null; const q = argLo(l, p + 1, t - 1); if (q < 0 || q > t - 4) return null; const B = l[q];
  if (!(h[t] > H)) return null; const fill = Math.max(S.o[t], H); return { entry: 'today', fill, stop: B * 0.995, info: { boxTop: +H.toFixed(4), boxBottom: +B.toFixed(4), height: +((H - B) / H).toFixed(3) } }; }
export function detectWein(S, I, t, ctx = {}) { if (t < 300 || !ctx.wkEnd || !(ctx.ws > 110) || !L(S, I, t) || !(ctx.nf || ctx.spy150)) return null; const { h, l, c, v } = S, ws = ctx.ws, sp = ctx.spyC;
  const R = hi(h, ws - 100, ws - 1), B = lo(l, ws - 100, ws - 1); if (!ok(R) || !ok(B) || !((R - B) / R <= 0.35)) return null; if (!(c[ws - 1] <= R && c[t] > R)) return null;
  if (!(I.sma150[t] >= I.sma150[t - 20])) return null; const vw = avg(v, ws, t), vb = avg(v, ws - 50, ws - 1); if (!(vw >= 2 * vb)) return null;
  if (!sp) return null; let s = 0; for (let i = t - 259; i <= t; i++) { if (!ok(c[i]) || !(sp[i] > 0)) return null; s += c[i] / sp[i]; } const rs = (c[t] / sp[t]) / (s / 260) - 1; if (!(rs > 0)) return null;
  return { entry: 'open', stop: lo(l, ws - 20, ws - 1), skipRisk: 0.15, info: { resistance: +R.toFixed(4), base: +((R - B) / R).toFixed(3), volX: +(vw / vb).toFixed(1), mansfield: +rs.toFixed(3) } }; }
export function detectLiver(S, I, t) { if (t < 260 || !L(S, I, t)) return null; const { c, v } = S; if (!(c[t] > I.sma50[t] && I.sma50[t] > I.sma200[t])) return null;
  const p = argHi(c, t - 60, t - 6); if (p < 0) return null; const P = c[p], RL = lo(c, p + 1, t - 1), re = 1 - RL / P; if (!(re >= 0.10 && re <= 0.35)) return null;
  if (!(c[t - 1] <= P && c[t] > P && v[t] >= 1.5 * I.vavg50[t - 1])) return null; return { entry: 'open', P, react: re, info: { pivot: +P.toFixed(4), reaction: +re.toFixed(3) } }; }
export function detectTurtle(S, I, t, n) { if (t < 60 || !L(S, I, t - 1) || !ok(S.o[t]) || !ok(S.h[t])) return null; const trig = hi(S.h, t - n, t - 1), N = I.atrW20[t - 1]; if (!ok(trig) || !(N > 0) || !(S.h[t] > trig)) return null;
  const fill = Math.max(S.o[t], trig); return { entry: 'today', fill, stop: fill - 2 * N, N, info: { breakout: +trig.toFixed(4), N: +N.toFixed(4) } }; }
export function detectZanger(S, I, t) { if (t < 200 || !L(S, I, t)) return null; const { h, l, c, v } = S; if (!(c[t] > I.sma50[t] && I.sma50[t] > I.sma200[t] && c[t - 126] > 0 && c[t] / c[t - 126] - 1 >= 0.30)) return null;
  const R = hi(h, t - 20, t - 1), B = lo(l, t - 20, t - 1); if (!ok(R) || !ok(B) || !((R - B) / R <= 0.20)) return null; if (!(c[t] > R && c[t] <= 1.05 * R && c[t - 1] <= R && v[t] >= 1.5 * I.vavg50[t - 1])) return null;
  return { entry: 'close', stop: Math.max(0.99 * R, 0.93 * c[t]), target: 1.15 * c[t], targetFrac: 0.25, info: { baseHigh: +R.toFixed(4), depth: +((R - B) / R).toFixed(3) } }; }
export function detectIBD(S, I, t, ctx = {}) { if (t < 260 || !L(S, I, t) || !(ctx.nf || ctx.spyUp) || !(ctx.rsPct >= 0.85)) return null; const { h, l, c, v } = S;
  const R = hi(h, t - 40, t - 1), B = lo(l, t - 40, t - 1), d = ok(R) && ok(B) ? (R - B) / R : NaN; if (!(d >= 0.05 && d <= 0.33)) return null; const pre = lo(c, t - 140, t - 41); if (!(c[t - 41] >= 1.3 * pre)) return null;
  if (!(c[t] > R && c[t] <= 1.05 * R && c[t - 1] <= R && v[t] >= 1.4 * I.vavg50[t - 1])) return null; return { entry: 'close', stopPct: 0.08, info: { pivot: +R.toFixed(4), depth: +d.toFixed(3), rsPct: +(+ctx.rsPct).toFixed(2) } }; }
export function detectBBSQ(S, I, t) { if (t < 150 || !L(S, I, t)) return null; let a = Infinity, b = Infinity; for (let i = t - 5; i <= t - 1; i++) { if (!ok(I.bw[i])) return null; a = Math.min(a, I.bw[i]); } for (let i = t - 129; i <= t - 6; i++) { if (!ok(I.bw[i])) return null; b = Math.min(b, I.bw[i]); }
  if (!(a <= b && S.c[t] > I.bbUp[t] && S.c[t - 1] <= I.bbUp[t - 1])) return null; const s0 = lo(S.l, t - 4, t); return { entry: 'open', stop: s0, info: { bandwidth: +a.toFixed(4) } }; }
export function detectKelt(S, I, t) { if (t < 20 || !L(S, I, t - 1) || !ok(S.o[t]) || !ok(S.h[t])) return null; const up = I.kUp[t - 1]; if (!ok(up) || !(S.c[t - 1] <= up) || !(S.h[t] > up)) return null;
  const fill = Math.max(S.o[t], up); return { entry: 'today', fill, stop: I.kLo[t - 1], info: { upper: +up.toFixed(4) } }; }
export function detectGoldx(S, I, t) { if (t < 230 || !L(S, I, t)) return null; const a = I.sma50, b = I.sma200; if (!(a[t] > b[t] && a[t - 1] <= b[t - 1] && b[t] > b[t - 20] && S.c[t] > a[t])) return null; return { entry: 'open', info: {} }; }
export function detectIchi(S, I, t) { if (t < 110 || !L(S, I, t)) return null; const top = (i) => Math.max(I.spanA[i - 26], I.spanB[i - 26]); const T0 = top(t), T1 = top(t - 1); if (!ok(T0) || !ok(T1)) return null;
  if (!(S.c[t] > T0 && S.c[t - 1] <= T1 && I.tenkan[t] > I.kijun[t] && S.c[t] > S.c[t - 26] && I.spanA[t] > I.spanB[t])) return null; return { entry: 'open', info: { cloudTop: +T0.toFixed(4) } }; }
export function detectAppel(S, I, t) { if (t < 60 || !L(S, I, t)) return null; if (!(I.macdB[t] > I.sigB[t] && I.macdB[t - 1] <= I.sigB[t - 1])) return null; return { entry: 'open', info: {} }; }
export function detectPocket(S, I, t) { if (t < 210 || !L(S, I, t)) return null; const { l, c, v } = S; if (!(c[t] > c[t - 1])) return null; let mx = -1;
  for (let i = t - 10; i <= t - 1; i++) { if (!ok(c[i]) || !ok(c[i - 1]) || !ok(v[i])) return null; if (c[i] < c[i - 1]) mx = Math.max(mx, v[i]); } if (!(mx > 0) || !(v[t] > mx)) return null;
  const m = I.sma10[t]; if (!(l[t] <= 1.02 * m && c[t] >= m && c[t] <= 1.05 * m && c[t] > I.sma50[t] && I.sma50[t] > I.sma200[t] && pos(S, t) >= 0.5)) return null;
  return { entry: 'close', stop: Math.max(l[t], 0.92 * c[t]), info: { volVsDownMax: +(v[t] / mx).toFixed(2) } }; }
export function detectBGU(S, I, t) { if (t < 240 || !L(S, I, t)) return null; const { o, l, c, v } = S, a = I.atr40[t - 1]; if (!(a > 0) || !(o[t] >= c[t - 1] + 0.75 * a)) return null;
  if (!(v[t] >= 1.5 * I.vavg50[t - 1] && c[t] > c[t - 1] && c[t] > I.sma200[t] && I.sma200[t] > I.sma200[t - 30])) return null; return { entry: 'close', stop: l[t], info: { gapATR: +((o[t] - c[t - 1]) / a).toFixed(2) } }; }
export function detectWedge(S, I, t) { if (t < 210 || !L(S, I, t)) return null; const { o, h, l, c, v } = S; let under = false; for (let i = t - 5; i <= t - 1; i++) { if (!ok(c[i])) return null; if (c[i] < I.ema10[i] || c[i] < I.ema20[i]) under = true; } if (!under) return null;
  const rg = (hi(h, t - 5, t - 1) - lo(l, t - 5, t - 1)) / c[t - 1]; if (!(rg <= 2 * I.adr20[t - 1])) return null;
  if (!(o[t] > h[t - 1] && c[t] > Math.max(I.ema10[t], I.ema20[t]) && c[t] > o[t] && v[t] > I.vavg50[t - 1] && c[t] > I.sma200[t])) return null; return { entry: 'open', stop: l[t], skipRisk: 0.10, info: { range5: +rg.toFixed(3) } }; }
export function detectMinTT(S, I, t, ctx = {}) { if (!trendTemplate(S, I, t, ctx.rsPct) || trendTemplate(S, I, t - 1, ctx.rsPrev)) return null; return { entry: 'open', info: { rsPct: +(+ctx.rsPct).toFixed(2) } }; }
export function detectStine(S, I, t, ctx = {}) { if (t < 260 || !L(S, I, t) || !(ctx.shares > 0 && ctx.shares <= 30e6)) return null; const { c, v } = S; if (!(c[t] > hi(c, t - 252, t - 1))) return null;
  const a = hi(c, t - 252, t - 22), b = lo(c, t - 252, t - 22); if (!(b > 0 && a / b <= 1.6)) return null; if (!(v[t] >= 3 * I.vavg50[t - 1] && pos(S, t) >= 0.5)) return null;
  return { entry: 'open', stopPct: 0.15, info: { shares: ctx.shares, volX: +(v[t] / I.vavg50[t - 1]).toFixed(1), flatYear: +(a / b).toFixed(2) } }; }
export function detectHolyG(S, I, t) { if (t < 60 || !L(S, I, t)) return null; const { h, l } = S; if (!(l[t] <= I.ema20[t] && l[t - 1] > I.ema20[t - 1])) return null; const p = argHi(h, t - 10, t - 1); if (p < 3) return null;
  if (!(I.adx[p] > 30 && I.adx[p] > I.adx[p - 3] && I.pdi[p] > I.mdi[p])) return null; return { entry: 'stop', trigger: h[t], valid: 1, stop: l[t], target: h[p], info: { swingHigh: +h[p].toFixed(4), adx: +I.adx[p].toFixed(1) } }; }
export function detect8020(S, I, t) { if (t < 25 || !L(S, I, t - 1) || !ok(S.o[t])) return null; const { o, h, l, c } = S, r = h[t - 1] - l[t - 1]; if (!(r > 0)) return null;
  if (!((o[t - 1] - l[t - 1]) / r >= 0.8 && (c[t - 1] - l[t - 1]) / r <= 0.2)) return null; if (!(o[t] < l[t - 1] && h[t] >= l[t - 1])) return null; return { entry: 'today', fill: l[t - 1], stopEntryLow: true, info: {} }; }
export function detectNR7ID(S, I, t) { if (t < 25 || !L(S, I, t)) return null; const { h, l } = S, r = h[t] - l[t]; for (let i = t - 6; i <= t - 1; i++) if (!(h[i] - l[i] > r)) return null; if (!(h[t] <= h[t - 1] && l[t] >= l[t - 1])) return null;
  return { entry: 'stop', trigger: h[t], valid: 1, stop: l[t], info: {} }; }
export function detectLWVB(S, I, t) { if (t < 25 || !L(S, I, t - 1) || !ok(S.o[t]) || !ok(S.h[t])) return null; const r = S.h[t - 1] - S.l[t - 1]; if (!(r > 0) || !(S.c[t - 1] > I.sma20[t - 1])) return null; const trig = S.o[t] + 0.5 * r; if (!(S.h[t] >= trig)) return null;
  return { entry: 'today', fill: trig, stop: trig - r, info: { range: +r.toFixed(4) } }; }
export function detectRSI2(S, I, t) { if (t < 210 || !L(S, I, t)) return null; if (!(S.c[t] > I.sma200[t] && I.rsi2[t] < 5)) return null; return { entry: 'close', info: { rsi2: +I.rsi2[t].toFixed(1) } }; }
export function detectTPS(S, I, t) { if (t < 210 || !L(S, I, t)) return null; if (!(S.c[t] > I.sma200[t] && I.rsi2[t] < 25 && I.rsi2[t - 1] < 25)) return null; return { entry: 'close', cap0: 0.1, info: { rsi2: +I.rsi2[t].toFixed(1) } }; }
export function detectDbl7(S, I, t) { if (t < 210 || !L(S, I, t)) return null; if (!(S.c[t] > I.sma200[t] && S.c[t] <= lo(S.c, t - 6, t))) return null; return { entry: 'close', info: {} }; }
export function detectH2(S, I, t) { if (t < 60 || !L(S, I, t)) return null; const { o, h, l, c } = S; if (!(I.ema20[t] > I.ema20[t - 5])) return null; const p = argHi(h, t - 15, t - 2); if (p < 0 || !(c[p] > I.ema20[p]) || !(h[p] >= hi(h, t - 40, t - 1))) return null;
  if (!(h[p + 1] < h[p])) return null; const att = []; for (let j = p + 2; j <= t; j++) if (h[j] > h[j - 1] && h[j - 1] <= h[j - 2]) att.push(j);
  if (att.length !== 1 || att[0] >= t) return null; const a1 = att[0]; if (!(lo(l, a1 + 1, t) < l[a1])) return null;
  if (!(h[t] <= h[t - 1] && l[t] <= I.ema20[t] * 1.01 && pos(S, t) >= 0.5)) return null; return { entry: 'stop', trigger: h[t], valid: 1, stop: l[t], info: { trendHigh: +h[p].toFixed(4) } }; }
export function detectNison(S, I, t) { if (t < 30 || !L(S, I, t)) return null; const { o, h, l, c } = S, y = t - 1; const body = Math.abs(c[y] - o[y]), rg = h[y] - l[y]; if (!(rg > 0)) return null;
  const engulf = c[y - 1] < o[y - 1] && o[y] <= c[y - 1] && c[y] >= o[y - 1] && c[y] > o[y], hammer = Math.min(o[y], c[y]) - l[y] >= 2 * body && h[y] - Math.max(o[y], c[y]) <= 0.1 * rg && body > 0;
  if (!(engulf || hammer)) return null; if (!(l[y] <= 1.01 * lo(l, t - 21, t - 2) && c[y - 1] < I.sma20[y - 1] && c[t] > h[y])) return null;
  return { entry: 'close', pl: l[y], target: hi(h, t - 21, t - 2), info: { pattern: engulf ? 'bullish engulfing' : 'hammer' } }; }
export function detectWyck(S, I, t) { if (t < 80 || !L(S, I, t)) return null; const { l, c } = S, Sp = lo(l, t - 60, t - 6), Rr = hi(S.h, t - 60, t - 6); if (!ok(Sp) || !ok(Rr)) return null; const ht = (Rr - Sp) / Sp; if (!(ht >= 0.08 && ht <= 0.30)) return null;
  const m = lo(l, t - 5, t); if (!(m < 0.995 * Sp && m >= 0.90 * Sp)) return null; if (!(c[t] > Sp && (l[t] < Sp || c[t - 1] <= Sp))) return null;
  return { entry: 'open', stop: 0.99 * m, targets: [{ px: Rr, frac: 0.5, be: true, why: 'half at the range top' }, { px: Sp + 2 * (Rr - Sp), frac: 1, why: 'count target (2 range heights)' }], info: { support: +Sp.toFixed(4), top: +Rr.toFixed(4) } }; }
export function detectGapGo(S, I, t) { if (t < 60 || !L(S, I, t - 1) || !ok(S.o[t])) return null; if (!(S.c[t - 1] > I.sma50[t - 1] && S.o[t] >= 1.04 * S.c[t - 1])) return null; return { entry: 'today', fill: S.o[t], stop: S.c[t - 1], info: { gap: +(S.o[t] / S.c[t - 1] - 1).toFixed(3) } }; }
export function detectGapFill(S, I, t) { if (t < 210 || !L(S, I, t - 1) || !ok(S.o[t])) return null; if (!(S.c[t - 1] > I.sma200[t - 1] && S.o[t] <= 0.98 * S.c[t - 1])) return null; return { entry: 'today', fill: S.o[t], target: S.c[t - 1], info: { gap: +(S.o[t] / S.c[t - 1] - 1).toFixed(3) } }; }
export function detectTSoup(S, I, t) { if (t < 30 || !L(S, I, t)) return null; const q = argLo(S.l, t - 20, t - 1); if (q < 0 || q > t - 3) return null; const P = S.l[q]; if (!(S.c[t] < P)) return null;
  return { entry: 'stop', trigger: P, valid: 1, stopEntryLow: true, lowCap: S.l[t], info: { priorLow: +P.toFixed(4) } }; }
export function detectSanta(S, I, t) { return I.mon && I.mon[t] === 12 && I.mLeft[t] === 5 ? { entry: 'close', info: {} } : null; }
export function detectTOM(S, I, t) { return I.mLeft && I.mLeft[t] === 1 ? { entry: 'close', info: {} } : null; }
export function detectFrogTrig(S, I, t, ctx = {}) { if (!ctx.frogIn) return null; const b = lo(S.l, t - 9, t); if (!ok(b)) return null; const q = detectQBO(S, I, t, { regime: ctx.regime });
  if (q) return { entry: 'stop', trigger: q.trigger, valid: q.valid, cancelBelow: q.cancelBelow, stop: b, info: { via: 'QBO', ...q.info } };
  const p = detectPB(S, I, t); if (p) return { entry: 'open', stop: b, info: { via: 'PB', ...p.info } }; return null; }
export function detectContract(S, I, t, ctx = {}) { if (t < 60 || !ctx.contract || !L(S, I, t) || !(ctx.mcap > 0 && ctx.mcap < 2e9)) return null; const { c, v, l } = S;
  if (!(c[t] / c[t - 1] - 1 >= 0.04 && v[t] >= 2 * I.vavg50[t - 1] && c[t - 21] > 0 && c[t] / c[t - 21] - 1 < 1.0)) return null; return { entry: 'open', stop: l[t], info: { mcapM: Math.round(ctx.mcap / 1e6), day: +(c[t] / c[t - 1] - 1).toFixed(3) } }; }
export function detectInsQ(S, I, t, ctx = {}) { if (!ctx.insq || !L(S, I, t) || !ctx.fcfOk || !ctx.fcfOk()) return null; return { entry: 'open', stopPct: 0.15, info: { insiders: ctx.insq.n, usd: Math.round(ctx.insq.usd) } }; }
// ---------- batch-1 entries with new exits (A) and champion filters (B) ----------
// base: the batch-1 signal; kind 'DL' | '2A'. Returns the batch-2 sig (entry unchanged, incl. its skips).
export function fromBase(base, b, atr, adr, kind) { if (!b) return null; let s;
  if (base === 'QBO' || base === 'VCP') s = { entry: 'stop', trigger: b.trigger, valid: b.valid, cancelBelow: b.cancelBelow, maxAbove: b.maxAbove || 0 };
  else if (base === 'EP') s = { entry: 'open', entrySkip: { lowRef: b.stop, maxDist: Infinity } };
  else s = { entry: 'open', entrySkip: { lowRef: b.stop, maxDist: 0.08 } };
  if (kind === '2A') { if (!(atr > 0)) return null; s.stopAtr = 2 * atr; }
  else if (base === 'QBO' || base === 'VCP') { s.stopEntryLow = true; s.adr = adr; } else s.stop = b.stop;
  return { ...s, info: { ...(b.info || {}), stopKind: kind } }; }
// the frozen numbers of a batch-1 signal that the derived versions need (one paper line per base signal)
export const baseNums = (b, I, t) => b && { trigger: b.trigger, valid: b.valid, cancelBelow: b.cancelBelow, maxAbove: b.maxAbove, stop: b.stop, adr: b.adr, info: b.info, atr: I.atr14[t], adr20: I.adr20[t] };
const BASED = { QBO: (S, I, t, ctx) => detectQBO(S, I, t, { regime: ctx.regime }), PB: (S, I, t) => detectPB(S, I, t), VCP: (S, I, t, ctx) => detectVCP(S, I, t, { spyUp: ctx.spyUp, rsPct: ctx.rsPct }), EP: (S, I, t) => detectEP(S, I, t) };
export const baseSignal = (base, S, I, t, ctx = {}) => { const m = ctx.memo; if (m && base in m) return m[base]; const r = BASED[base](S, I, t, ctx); if (m) m[base] = r; return r; };
// ---------- the methods ----------
const M = (name, who, src, block, maxDays, detect, exit, extra = {}) => ({ name, who, src, block, maxDays, detect, exit, ...extra });
export const METHODS2 = {
  'DEC2-DARVAS': M('Darvas box: buy-stop over a confirmed box top at a 52-week high, stop under the box bottom, raised box by box', 'Nicolas Darvas', 'How I Made $2,000,000 in the Stock Market (1960)', 20, 504, detectDarvas, EXITS.darvas),
  'DEC2-WEIN': M('Weinstein Stage 2: weekly close over the base on 2x volume, 30-week average turning up, Mansfield RS > 0; exit on a week close under the 30-week', 'Stan Weinstein', 'Secrets for Profiting in Bull and Bear Markets (1988)', 60, 504, detectWein,
    (S, I, j) => I.wkEnd && I.wkEnd[j] && S.c[j] < I.sma150[j] ? { next: 'week closed under the 30-week average' } : null, { mkt: 'SPY above its 30-week average' }),
  'DEC2-LIVER': M('Livermore pivotal point: close through the prior pivot after a 10-35% natural reaction, on volume; out if it falls back under the pivot', 'Jesse Livermore', 'How to Trade in Stocks (1940)', 20, 252, detectLiver,
    (S, I, j, st) => S.c[j] < st.sig.P ? { next: 'closed back under the pivotal point' } : S.c[j] <= st.maxC * (1 - Math.max(st.sig.react, 0.10)) ? { next: 'reaction larger than the natural reaction' } : null),
  'DEC2-TURT20': M('Turtle System 1: 20-day breakout, 2N stop, units at +1/2 N, exit under the 10-day low, skip after a winning breakout', 'Richard Dennis / the Turtles', 'Curtis Faith, The Original Turtle Trading Rules (2003)', 20, 504, (S, I, t) => detectTurtle(S, I, t, 20), EXITS.turtle(10), { skipIfLastWin: true }),
  'DEC2-TURT55': M('Turtle System 2: 55-day breakout, 2N stop, units at +1/2 N, exit under the 20-day low', 'Richard Dennis / the Turtles', 'Curtis Faith, The Original Turtle Trading Rules (2003)', 20, 504, (S, I, t) => detectTurtle(S, I, t, 55), EXITS.turtle(20)),
  'DEC2-ZANGER': M('Zanger breakout: base high taken on 1.5x volume within 5%, 7% stop, out if no day-one acceleration, 25% sold at +15%, rest on the 21-day EMA', 'Dan Zanger', 'financialwisdomtv.com/post/dan-zanger', 20, 252, detectZanger,
    (S, I, j, st) => st.day === 2 && S.c[j] <= st.fill ? { close: 'no acceleration on day one' } : j > st.k && S.c[j] < I.ema21[j] ? { next: 'close under the 21-day EMA' } : null),
  'DEC2-IBD': M('IBD 85-85 (price half) base breakout with O\'Neil sell rules: 8% stop, take 20%, but hold 8 weeks if +20% came within 3 weeks', 'William O\'Neil / IBD', 'How to Make Money in Stocks; IBD sell rules', 40, 120, detectIBD,
    (S, I, j, st) => { if (j === st.k) return null; if (st.hold8) return st.day >= 40 ? { close: 'end of the 8-week hold' } : null;
      if (S.c[j] >= st.fill * 1.2) { if (j - st.k < 15) { st.hold8 = true; return { stop: st.fill }; } return { close: 'took the 20% profit' }; } return null; }, { mkt: 'SPY above its 50-day average' }),
  'DEC2-BBSQ': M('Bollinger squeeze: 6-month low bandwidth, close over the upper band; parabolic SAR exit', 'John Bollinger', 'Bollinger on Bollinger Bands (2001), Method I', 20, 252, detectBBSQ, EXITS.sar),
  'DEC2-KELT': M('Keltner 10-day rule: buy over the upper band, out under the lower band', 'Chester Keltner', 'How to Make Money in Commodities (1960)', 10, 252, detectKelt, (S, I, j) => ({ stopTo: I.kLo[j] })),
  'DEC2-GOLDX': M('Golden cross with filters (rising 200-day, close over the 50-day); out on the death cross', 'practitioner classic', 'T7 in the library (never built)', 60, 504, detectGoldx, (S, I, j) => I.sma50[j] < I.sma200[j] ? { next: 'death cross' } : null),
  'DEC2-ICHI': M('Ichimoku cloud breakout (tenkan > kijun, chikou up, green cloud ahead); out under the kijun', 'Goichi Hosoda (Ichimoku)', 'Ichimoku Kinko Hyo, standard rules', 20, 504, detectIchi, closeUnder('kijun', 'close under the kijun')),
  'DEC2-APPEL': M('Appel two-MACD: buy MACD(8,17) over its signal, sell MACD(12,25) under its signal', 'Gerald Appel', 'Technical Analysis: Power Tools for Active Investors (2005)', 20, 252, detectAppel,
    (S, I, j, st) => j > st.k && I.macdS[j] < I.sigS[j] && I.macdS[j - 1] >= I.sigS[j - 1] ? { next: 'MACD(12,25) crossed under its signal' } : null),
  'DEC2-POCKET': M('Pocket pivot at the 10-day line; O\'Neil-disciple 10-day / 7-week sell rule', 'Gil Morales & Chris Kacher', 'Trade Like an O\'Neil Disciple (2010)', 20, 252, detectPocket, EXITS.oneil),
  'DEC2-BGU': M('Buyable gap-up (0.75 ATR gap on 1.5x volume), stop at the gap-day low, 10-day / 7-week sell rule', 'Gil Morales & Chris Kacher', 'Trade Like an O\'Neil Disciple (2010)', 20, 252, detectBGU, EXITS.oneil),
  'DEC2-WEDGE': M('Kell wedge pop: gap back over the 10/20 EMAs after a tight pullback; half at exhaustion, rest on the 20 EMA', 'Oliver Kell', 'traderlion.com (Kell, MU wedge pop)', 20, 252, detectWedge,
    (S, I, j, st) => { const r = {}; if (!st.half && S.c[j] >= 1.2 * I.ema10[j]) { st.half = true; r.sellClose = [0.5, 'exhaustion extension: half sold']; } if (j > st.k && S.c[j] < I.ema20[j]) r.next = 'close under the 20-day EMA'; return r; }),
  'DEC2-MINTT': M('Minervini trend template alone, 25% trailing stop', 'Mark Minervini', 'Trade Like a Stock Market Wizard (2013)', 60, 504, detectMinTT, (S, I, j, st) => ({ stop: 0.75 * st.maxC })),
  'DEC2-STINE': M('Stine superstock: small share count, new high out of a flat year on 3x volume; half at +100%, rest on the 50-day', 'Jesse Stine', 'Insider Buy Superstocks (2013)', 60, 504, detectStine,
    (S, I, j, st) => { const r = {}; if (!st.half && S.c[j] >= 2 * st.fill) { st.half = true; r.sellClose = [0.5, 'half at +100%']; } if (j > st.k && S.c[j] < I.sma50[j]) r.next = 'close under the 50-day'; return r; }),
  'DEC2-HOLYG': M('Raschke Holy Grail: ADX>30 trend, first touch of the 20 EMA, buy over the touch bar, target the swing high', 'Linda Raschke', 'Street Smarts (1995)', 10, 20, detectHolyG, null),
  'DEC2-8020': M('Raschke 80-20: wide reversal-down day, next day opens under its low and trades back through it; 2-day hold', 'Linda Raschke', 'Street Smarts (1995)', 5, 2, detect8020, null),
  'DEC2-NR7ID': M('Crabel NR7 inside day breakout, stop at its low, out at the close', 'Toby Crabel', 'Day Trading with Short Term Price Patterns (1990)', 5, 1, detectNR7ID, null),
  'DEC2-LWVB': M('Larry Williams volatility breakout (open + 0.5 range), first profitable open', 'Larry Williams', 'Long-Term Secrets to Short-Term Trading (1999)', 5, 5, detectLWVB, null, { bailout: true }),
  'DEC2-RSI2': M('Connors RSI(2) < 5 above the 200-day, out on a close over the 5-day average', 'Larry Connors', 'Short Term Trading Strategies That Work (2008)', 5, 60, detectRSI2, (S, I, j, st) => j > st.k && S.c[j] > I.sma5[j] ? { close: 'close over the 5-day average' } : null),
  'DEC2-TPS': M('Connors TPS: RSI(2) < 25 twice, scale in 10/20/30/40% on lower closes, out at RSI(2) > 70', 'Larry Connors', 'High Probability ETF Trading (2009)', 10, 60, detectTPS,
    (S, I, j, st) => { if (j === st.k) return null; if (I.rsi2[j] > 70) return { close: 'RSI(2) over 70' }; if (st.adds < 3 && S.c[j] < st.lastEntry) return { add: [[0.2, 0.3, 0.4][st.adds], 'scale-in on a lower close'] }; return null; }),
  'DEC2-DBL7': M('Connors Double 7s: 7-day closing low above the 200-day, out at a 7-day closing high', 'Larry Connors', 'Short Term Trading Strategies That Work (2008)', 5, 60, detectDbl7, (S, I, j, st) => j > st.k && S.c[j] >= hi(S.c, j - 6, j) ? { close: '7-day closing high' } : null),
  'DEC2-H2': M('Al Brooks second entry (H2) pullback to the 20 EMA, stop under the signal bar, 2R target', 'Al Brooks', 'Trading Price Action Trends (2012)', 10, 10, detectH2, null, { partialR: 2, partialFrac: 1 }),
  'DEC2-NISON': M('Nison bullish engulfing / hammer at the 20-day low, confirmed by a close over its high; out under the pattern low or at resistance', 'Steve Nison', 'Japanese Candlestick Charting Techniques (1991)', 10, 20, detectNison,
    (S, I, j, st) => j > st.k && S.c[j] < st.sig.pl ? { next: 'closed under the pattern low' } : null),
  'DEC2-WYCK': M('Wyckoff spring: break under range support and close back inside; half at the range top, rest at the count target', 'Richard Wyckoff', 'Wyckoff method (spring), luxalgo.com library', 20, 126, detectWyck,
    (S, I, j, st) => st.targets[0] && st.targets[0].done && S.c[j] < I.sma50[j] ? { next: 'close under the 50-day after the first target' } : null),
  'DEC2-GAPGO': M('Gap and go (daily): 4%+ gap up in an uptrend, stop if the gap fills, out at the close', 'momentum day-trader classic', 'gap-and-go (daily approximation)', 5, 1, detectGapGo, null),
  'DEC2-GAPFILL': M('Gap fill (long): 2%+ gap down above the 200-day, sell at the gap fill or the close', 'practitioner classic', 'gap-fill fade (long side)', 5, 1, detectGapFill, null),
  'DEC2-TSOUP': M('Turtle Soup Plus One: close under a 20-day low made 3+ days earlier, buy back through it next day', 'Linda Raschke / Larry Connors', 'Street Smarts (1995)', 5, 5, detectTSoup, null),
  'DEC2-SANTA': M('Santa Claus rally on SPY (last 5 sessions of December + first 2 of January)', 'Yale & Jeffrey Hirsch', 'Stock Trader\'s Almanac', 1, 10, detectSanta, (S, I, j, st) => j > st.k && I.mon[j] === 1 && I.mIdx[j] === 2 ? { close: '2nd January session' } : null, { spyOnly: true }),
  'DEC2-TOM': M('Turn of the month on SPY (second-to-last session to the 4th session)', 'Yale & Jeffrey Hirsch', 'Stock Trader\'s Almanac', 1, 10, detectTOM, (S, I, j, st) => j > st.k && I.mIdx[j] === 4 ? { close: '4th session of the month' } : null, { spyOnly: true }),
  'DEC2-FROGTRIG': M('DEC-FROG basket member entered only on a QBO or PB trigger; 10-day-low trail or day 126', 'combination (outside review)', 'DEC-FROG + DEC-QBO / DEC-PB', 20, 126, detectFrogTrig, lowTrail(10)),
  'DEC2-CONTRACT': M('8-K 1.01 contract, under 2B USD value, +4% close on 2x volume; stop the day low, trail the 10-day low', 'event + chart (outside review)', 'SEC 8-K item 1.01', 20, 252, detectContract, lowTrail(10), { needs: 'ev' }),
  'DEC2-INSQ': M('2+ insiders buy > 200k USD within 5 days in a B-FCF1 company; 15% stop, hold 63', 'event + quality (outside review)', 'SEC Form 4 + B-FCF1', 63, 63, detectInsQ, null, { needs: 'ins' }),
};
// A: 48 versions. B: 8 versions.
const TRAILS = { L10: lowTrail(10), E21: closeUnder('ema21', 'close under the 21-day EMA'), S50: closeUnder('sma50', 'close under the 50-day') };
for (const base of ['QBO', 'PB', 'VCP', 'EP']) for (const sk of ['DL', '2A']) for (const tr of ['L10', 'E21', 'S50']) for (const pp of ['P', 'N']) {
  const id = 'DEC2-X-' + base + '-' + sk + '-' + tr + '-' + pp;
  METHODS2[id] = M('Batch-1 ' + base + ' entry; stop ' + (sk === 'DL' ? 'day low' : '2 ATR') + '; trail ' + { L10: '10-day low', E21: '21-day EMA close', S50: '50-day close' }[tr] + (pp === 'P' ? '; half at 3R' : ''), 'exit set (outside review)', 'DEC-' + base + ' entry', { QBO: 20, PB: 10, VCP: 40, EP: 20 }[base], 252,
    (S, I, t, ctx) => fromBase(base, baseSignal(base, S, I, t, ctx), I.atr14[t], base === 'VCP' ? I.adr20[t] : (baseSignal(base, S, I, t, ctx) || {}).adr ?? I.adr20[t], sk), TRAILS[tr],
    { base, family: 'X', mk: (n) => fromBase(base, n, n.atr, base === 'VCP' ? n.adr20 : n.adr ?? n.adr20, sk), ...(pp === 'P' ? { partialR: 3, partialFrac: 0.5 } : {}) }); }
const kqSig = (b, S, I, t) => b && { entry: 'stop', trigger: b.trigger, valid: b.valid, cancelBelow: b.cancelBelow, stopEntryLow: true, adr: b.adr, info: b.info };
const pbSig = (b) => b && { entry: 'open', stop: b.stop, entrySkip: { lowRef: b.stop, maxDist: 0.08 }, info: b.info };
const addWin = (inner) => (S, I, j, st) => { const r = inner(S, I, j, st) || {}; if (!st.added && j > st.k && S.c[j] >= st.fill * 1.05 && S.c[j] > st.prevMaxC && !r.next && !r.close) { st.added = true; r.add = [0.5, 'add 50% at a new closing high 5%+ up']; } return r; };
for (const base of ['QBO', 'PB']) for (const f of ['EXT10', 'EXT20', 'STRONG', 'ADD']) {
  const id = 'DEC2-F-' + base + '-' + f, inner = base === 'QBO' ? EXITS.kq : EXITS.pb;
  METHODS2[id] = M('Batch-1 ' + base + ' with ' + { EXT10: 'no entry more than 10% over the 20-day', EXT20: 'no entry more than 20% over the 20-day', STRONG: 'the strong market filter', ADD: 'add 50% to a winner' }[f] + ' (own exit)', 'champion filter (outside review)', 'DEC-' + base, base === 'QBO' ? 20 : 10, base === 'QBO' ? 120 : 60,
    (S, I, t, ctx) => { if (f === 'EXT10' && !(S.c[t] <= 1.10 * I.sma20[t])) return null; if (f === 'EXT20' && !(S.c[t] <= 1.20 * I.sma20[t])) return null; if (f === 'STRONG' && !(ctx.nf || ctx.strong)) return null;
      const b = baseSignal(base, S, I, t, ctx); return base === 'QBO' ? kqSig(b) : pbSig(b); }, f === 'ADD' ? addWin(inner) : inner,
    { base, family: 'F', mk: (n) => base === 'QBO' ? kqSig(n) : pbSig(n), ...(f === 'STRONG' ? { mkt: 'strong market filter' } : {}) }); }
export const NEEDS_DATA2 = {
  'DEC2-GREEN': 'Greenblatt magic formula: needs EBIT and enterprise value point in time; this lab has prices only. Earlier test V6 (tested: not proven; 6-month version rejected).',
  'DEC2-OSH': 'O\'Shaughnessy trending value: needs a six-factor value composite (P/E, P/S, P/B, P/CF, EV/EBITDA, shareholder yield) point in time. Not in the lab data.',
  'DEC2-LYNCH': 'Peter Lynch fast grower: needs EPS growth 20-25% a year and PEG; quarterly EPS point in time not loaded (same gap as DEC-CANSLIM).',
  'DEC2-CAMILLO': 'Chris Camillo social arbitrage: needs licensed historical social/attention data (same gap as DEC-SOC).',
  'DEC2-SPINOFF': 'Greenblatt spin-offs / post-bankruptcy: needs Form 10 / emergence dates mapped to tickers (E7 queued).',
  'DEC2-SHORT-CATALYST': 'High short interest + catalyst: needs a point-in-time short-interest history; no FINRA loader in the system yet (C-SI1 / C-SQZ1 queued).',
  'DEC2-EPS-REV': 'EPS estimate revisions: needs point-in-time estimate snapshots; the FMP history the system has is not as-of (C-REV1 logs our own snapshots from now).',
  'DEC2-ASIA-SUPPLIER': 'Asian supplier, same chain layer: needs customer-exposure data the system does not have.',
};
export { COST };
