// DECODED CORE (23 Oct 2026; owner: "study how people won on past trades ... decode it"). Pure functions, no network, no files.
// One detector per decoded trader method on DAILY bars, plus each method's OWN exit (stop, partial sale, trailing line, time limit).
// Used by decoded-lab.mjs (live paper lane from Monday 26 Oct + one 5-year run per method) and test/decoded-core.test.mjs.
// A series S = { o, h, l, c, v } (arrays or typed arrays, NaN where the stock has no bar); t = the session index of the signal CLOSE.
// Everything a detector reads is known at the close of t. Entries happen on t+1 or later. Long only; no leverage; no options.
//
// PRE-REGISTERED RULES (written 23 Oct 2026 before any result was seen; one version each; library ids DEC-*):
//   DEC-QBO  Kullamagi (Qullamaggie) breakout. Liquid (close 5 USD+, 20-day traded value 5M USD+); average daily range (ADR, 20-day
//            mean of high/low - 1) >= 4%; a prior move of 30%+ (highest close of the last 63 sessions vs the lowest close of the 63
//            sessions up to that high); a 10-session base whose high-low range <= 2.5 x ADR, higher lows (lowest low of the last 5
//            sessions >= lowest low of the 5 before), base high >= 85% of the 63-session high; 10-day average > 20-day average, the
//            20-day rising (vs 5 sessions ago), close >= 20-day average and within 1 ADR under the base high. Market: QQQ 10-day
//            average above its 20-day average and both rising. ENTRY: buy-stop at the base high, valid 5 sessions (filled at the open if
//            it opens above, else at the trigger), cancelled by a close under the base low. STOP: the entry day's low; if that low is
//            more than 1 ADR under the fill, the trade counts as stopped the same day at 1 ADR (his rule: skip such trades; we book the
//            worst case). EXIT (engine KQ): sell 1/3 at the close of day 3 (entry day = day 1) if above the fill and move the stop to
//            the fill; from day 4 sell the rest at the next open after a close under the 10-day average; at most 120 sessions.
//   DEC-EP   Kullamagi episodic pivot. Opens 10%+ above the prior close, volume >= 3x its 50-day average, holds a 10%+ gain at the close
//            in the top half of the day's range; neglected before (63-session return to the prior close <= +20%); close 5 USD+,
//            20-day traded value 5M USD+. No market filter (news driven; the QQQ state is recorded). ENTRY: next open (the trader buys
//            the opening-range high ON the gap day: a daily-bar lab can only buy the next open; noted as a handicap). STOP: the gap-day
//            low, but never more than 1.5 ADR (pre-gap) under the entry; skipped if the next open is at or under the stop. EXIT: KQ.
//   DEC-MB   Stockbee (Pradeep Bonde) 4% momentum burst. Close up 4%+ on the prior close, volume above the prior day and >= 100k shares,
//            close in the top 30% of the day's range, NOT after 3 up closes in a row; liquid as above. Market: Stockbee-style breadth,
//            10-session sum of stocks up 4%+ over stocks down 4%+ (close 5 USD+, 100k shares+) >= 1.0. ENTRY: next open. STOP: the burst
//            day's low (intraday). EXIT: the close of day 5.
//   DEC-VCP  Minervini trend template + volatility contraction. Close above the 50, 150 and 200-day averages; 150 > 200; 200-day rising
//            over 21 sessions; 50 > 150; close >= 1.3x the 52-week low and >= 0.75x the 52-week high; relative strength (0.4 r63 +
//            0.2 r126 + 0.2 r189 + 0.2 r252) in the top 30% of liquid stocks that day. Contraction: depth (high-low over high) of
//            sessions t-39..t-20 > t-19..t-10 > t-9..t, last depth <= 10%, 10-day average volume under the 50-day; close >= 93% of the
//            pivot (10-session high). Market: SPY above its 50-day average. ENTRY: buy-stop at the pivot, valid 5 sessions, no fill if
//            it opens 5%+ above the pivot (O'Neil's buy range), cancelled by a close under the base low. STOP: the base low, at most 8%
//            under the fill. EXIT (engine MO): after a close 10%+ above the fill the stop moves to the fill; sell 1/2 at +20%; the rest
//            at the next open after a close under the 50-day average; at most 252 sessions.
//   DEC-PB   Martin Luk / Oliver Kell pullback reclaim (EMA crossback). Up 30%+ over 21, 63 or 126 sessions; EMA9 > EMA21 > EMA50,
//            EMA21 rising over 5 sessions; the day's low touches the 21-day EMA (<= 0.5% above it) and the close is back above it, above
//            the open, in the top half of the range; liquid. No market filter (none given; recorded). ENTRY: next open. STOP: the
//            signal day's low; skipped if the next open is at or under it or more than 8% above it. EXIT: the next open after a close
//            under the 9-day EMA; at most 60 sessions.
//   DEC-FROG Da, Gurun & Warachka (2014) frog in the pan. At the close of the FIRST session of each month: liquid stocks, 12-1 month return (close 21 sessions
//            ago over close 252 ago); the top 30% are winners; information discreteness ID = sign(return) x (% down days - % up days)
//            over the same window; the 30 winners with the LOWEST ID (most continuous). ENTRY: next open. EXIT: close of day 126.
//   DEC-CRASH Crashed then stabilising (coordinator's request 23 Oct; overlaps D3-POOL, registered separately). Down 50%+ over 126
//            sessions; no lower low (lowest low of t-9..t >= lowest low of t-29..t-10); range of t-9..t <= 0.6x the range of t-29..t-10;
//            average volume of t-9..t >= 1.2x that of t-29..t-10; liquid. ENTRY: next open. EXIT: the next open after a close under the
//            10-session base low, or the close of day 60. CONTROL (extra gate): crashed stocks the same day (down 50%+ over 126, ADR
//            within 25% of the signal's) that DID make a lower low; same entry and exit; the rule must beat them in both halves.
export const COST = 0.008, STRESS = 0.012;
export const METHODS = {
  'DEC-QBO': { name: 'Qullamaggie breakout (tight base after a 30%+ move, buy the break, stop at the day low, trail the 10-day)', engine: 'KQ', block: 20, who: 'Kristjan Kullamagi' },
  'DEC-EP': { name: 'Qullamaggie episodic pivot (10%+ news gap on 3x volume in a neglected stock)', engine: 'KQ', block: 20, who: 'Kristjan Kullamagi' },
  'DEC-MB': { name: 'Stockbee 4% momentum burst (3-5 day hold, stop at the burst day low)', engine: 'MB', block: 5, who: 'Pradeep Bonde (Stockbee)' },
  'DEC-VCP': { name: 'Minervini trend template + volatility contraction pivot breakout', engine: 'MO', block: 40, who: 'Mark Minervini / William O\'Neil' },
  'DEC-PB': { name: 'Luk / Kell pullback to the rising 21-day EMA, reclaimed; trail the 9-day EMA', engine: 'PB', block: 10, who: 'Martin Luk / Oliver Kell' },
  'DEC-FROG': { name: 'Frog in the pan: 12-1 month winners with the smoothest climb, monthly, hold 6 months', engine: 'TIME', block: 126, who: 'Da, Gurun & Warachka (RFS 2014)' },
  'DEC-CRASH': { name: 'Crashed 50%+, then stabilising (no lower low, tighter range, rising volume)', engine: 'CRASH', block: 40, who: 'coordinator hypothesis (recovery family)' },
};
const ok = (x) => typeof x === 'number' && isFinite(x);
// ---------- indicators (one stock, whole series) ----------
function smaArr(x, p) { const n = x.length, o = new Float64Array(n).fill(NaN); let s = 0, bad = 0; for (let i = 0; i < n; i++) { const a = x[i]; if (ok(a)) s += a; else bad++; if (i >= p) { const b = x[i - p]; if (ok(b)) s -= b; else bad--; } if (i >= p - 1 && bad === 0) o[i] = s / p; } return o; }
function emaArr(x, p) { const n = x.length, o = new Float64Array(n).fill(NaN), k = 2 / (p + 1); let e = NaN, run = 0, s = 0;
  for (let i = 0; i < n; i++) { const a = x[i]; if (!ok(a)) { e = NaN; run = 0; s = 0; continue; } run++; if (run < p) { s += a; continue; } if (run === p) { s += a; e = s / p; } else e = a * k + e * (1 - k); o[i] = e; } return o; }
export function indicators(S) {
  const n = S.c.length, rng = new Float64Array(n).fill(NaN), dv = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) { if (ok(S.h[i]) && ok(S.l[i]) && S.l[i] > 0) rng[i] = S.h[i] / S.l[i] - 1; if (ok(S.c[i]) && ok(S.v[i])) dv[i] = S.c[i] * S.v[i]; }
  return { sma10: smaArr(S.c, 10), sma20: smaArr(S.c, 20), sma50: smaArr(S.c, 50), sma150: smaArr(S.c, 150), sma200: smaArr(S.c, 200),
    ema9: emaArr(S.c, 9), ema21: emaArr(S.c, 21), ema50: emaArr(S.c, 50), adr20: smaArr(rng, 20), vavg50: smaArr(S.v, 50), dv20: smaArr(dv, 20) };
}
// highest / lowest over [a, b] inclusive; NaN if any bar missing
export function hi(x, a, b) { if (a < 0) return NaN; let m = -Infinity; for (let i = a; i <= b; i++) { if (!ok(x[i])) return NaN; if (x[i] > m) m = x[i]; } return m; }
export function lo(x, a, b) { if (a < 0) return NaN; let m = Infinity; for (let i = a; i <= b; i++) { if (!ok(x[i])) return NaN; if (x[i] < m) m = x[i]; } return m; }
export function avg(x, a, b) { if (a < 0) return NaN; let s = 0; for (let i = a; i <= b; i++) { if (!ok(x[i])) return NaN; s += x[i]; } return s / (b - a + 1); }
export const liquid = (S, I, t) => S.c[t] >= 5 && I.dv20[t] >= 5e6;
const pos = (S, t) => { const r = S.h[t] - S.l[t]; return r > 0 ? (S.c[t] - S.l[t]) / r : 0.5; };
// QQQ regime (Kullamagi): 10-day average above the 20-day, both rising on the day
export function regimeUp(c, t) { const a = avg(c, t - 9, t), b = avg(c, t - 19, t), a1 = avg(c, t - 10, t - 1), b1 = avg(c, t - 20, t - 1); return ok(a) && ok(b) && ok(a1) && ok(b1) && a > b && a > a1 && b > b1; }
export const aboveSma = (c, t, p) => { const m = avg(c, t - p + 1, t); return ok(m) && c[t] > m; };
// highest close in the last 63 sessions over the lowest close of the 63 sessions up to that high
export function priorMove(c, t) { let k = -1, m = -Infinity; for (let i = t - 62; i <= t; i++) { if (i < 0 || !ok(c[i])) return NaN; if (c[i] > m) { m = c[i]; k = i; } } const l = lo(c, k - 62, k); return ok(l) && l > 0 ? m / l - 1 : NaN; }

// ---------- detectors ----------
export function detectQBO(S, I, t, ctx = {}) {
  if (t < 130 || !liquid(S, I, t) || !ctx.regime) return null; const adr = I.adr20[t]; if (!(adr >= 0.04)) return null;
  const bh = hi(S.h, t - 9, t), bl = lo(S.l, t - 9, t); if (!ok(bh) || !ok(bl)) return null;
  if (!((bh - bl) / S.c[t] <= 2.5 * adr)) return null;
  if (!(lo(S.l, t - 4, t) >= lo(S.l, t - 9, t - 5))) return null;
  if (!(I.sma10[t] > I.sma20[t] && I.sma20[t] > I.sma20[t - 5] && S.c[t] >= I.sma20[t])) return null;
  if (!(bh >= 0.85 * hi(S.h, t - 62, t))) return null;
  if (!(S.c[t] < bh && S.c[t] >= bh * (1 - adr))) return null;
  const pm = priorMove(S.c, t); if (!(pm >= 0.30)) return null;
  return { entry: 'stop', trigger: bh, valid: 5, cancelBelow: bl, adr, info: { priorMove: +pm.toFixed(3), base: +((bh - bl) / S.c[t]).toFixed(3), adr: +adr.toFixed(4) } };
}
export function detectEP(S, I, t) {
  if (t < 70 || !(S.c[t] >= 5) || !(I.dv20[t] >= 5e6) || !ok(S.c[t - 1]) || !ok(S.o[t])) return null;
  const gap = S.o[t] / S.c[t - 1] - 1; if (!(gap >= 0.10)) return null;
  if (!(S.v[t] >= 3 * I.vavg50[t - 1])) return null;
  if (!(S.c[t] >= S.c[t - 1] * 1.10 && pos(S, t) >= 0.5)) return null;
  const pre = ok(S.c[t - 64]) ? S.c[t - 1] / S.c[t - 64] - 1 : NaN; if (!(pre <= 0.20)) return null;
  const adr = I.adr20[t - 1]; if (!(adr > 0)) return null;
  return { entry: 'open', stop: S.l[t], maxRisk: 1.5 * adr, adr, info: { gap: +gap.toFixed(3), volX: +(S.v[t] / I.vavg50[t - 1]).toFixed(1), before63: +pre.toFixed(3) } };
}
export function detectMB(S, I, t, ctx = {}) {
  if (t < 25 || !liquid(S, I, t) || !(ctx.breadth >= 1.0)) return null;
  if (!(S.c[t] / S.c[t - 1] - 1 >= 0.04) || !(S.v[t] > S.v[t - 1]) || !(S.v[t] >= 1e5) || !(pos(S, t) >= 0.7)) return null;
  if (S.c[t - 1] > S.c[t - 2] && S.c[t - 2] > S.c[t - 3] && S.c[t - 3] > S.c[t - 4]) return null;
  return { entry: 'open', stop: S.l[t], info: { day: +(S.c[t] / S.c[t - 1] - 1).toFixed(3), volUp: +(S.v[t] / S.v[t - 1]).toFixed(2) } };
}
export const rsScore = (c, t) => { if (t < 252) return NaN; const r = (k) => ok(c[t - k]) && c[t - k] > 0 ? c[t] / c[t - k] - 1 : NaN; const v = 0.4 * r(63) + 0.2 * r(126) + 0.2 * r(189) + 0.2 * r(252); return ok(v) ? v : NaN; };
export function trendTemplate(S, I, t, rsPct) {
  const c = S.c[t]; if (t < 252 || !liquid(S, I, t)) return false;
  if (!(c > I.sma50[t] && c > I.sma150[t] && c > I.sma200[t] && I.sma150[t] > I.sma200[t] && I.sma50[t] > I.sma150[t] && I.sma200[t] > I.sma200[t - 21])) return false;
  const l52 = lo(S.l, t - 251, t), h52 = hi(S.h, t - 251, t); if (!(c >= 1.3 * l52 && c >= 0.75 * h52)) return false;
  return rsPct >= 0.70;
}
export function detectVCP(S, I, t, ctx = {}) {
  if (!ctx.spyUp || !trendTemplate(S, I, t, ctx.rsPct)) return null;
  const depth = (a, b) => { const H = hi(S.h, a, b), L = lo(S.l, a, b); return ok(H) && ok(L) && H > 0 ? (H - L) / H : NaN; };
  const d1 = depth(t - 39, t - 20), d2 = depth(t - 19, t - 10), d3 = depth(t - 9, t); if (!(d1 > d2 && d2 > d3 && d3 <= 0.10)) return null;
  if (!(avg(S.v, t - 9, t) < I.vavg50[t])) return null;
  const pivot = hi(S.h, t - 9, t), bl = lo(S.l, t - 9, t); if (!(S.c[t] >= 0.93 * pivot && S.c[t] < pivot)) return null;
  return { entry: 'stop', trigger: pivot, valid: 5, cancelBelow: bl, maxAbove: 0.05, base: bl, info: { depths: [d1, d2, d3].map(x => +x.toFixed(3)), rsPct: +(+ctx.rsPct).toFixed(2) } };
}
export function detectPB(S, I, t) {
  if (t < 130 || !liquid(S, I, t)) return null; const c = S.c;
  const up = Math.max(...[21, 63, 126].map(k => ok(c[t - k]) && c[t - k] > 0 ? c[t] / c[t - k] - 1 : -1)); if (!(up >= 0.30)) return null;
  if (!(I.ema9[t] > I.ema21[t] && I.ema21[t] > I.ema50[t] && I.ema21[t] > I.ema21[t - 5])) return null;
  if (!(S.l[t] <= I.ema21[t] * 1.005 && c[t] > I.ema21[t] && c[t] > S.o[t] && pos(S, t) >= 0.5)) return null;
  return { entry: 'open', stop: S.l[t], maxRisk: 0.08, info: { up: +up.toFixed(3) } };
}
// information discreteness over sessions a..b (daily returns): sign(cumulative return) x (share of down days - share of up days)
export function infoDiscreteness(c, a, b) { let up = 0, dn = 0, n = 0; for (let i = a + 1; i <= b; i++) { if (!ok(c[i]) || !ok(c[i - 1])) return NaN; n++; if (c[i] > c[i - 1]) up++; else if (c[i] < c[i - 1]) dn++; }
  if (!n || !(c[a] > 0)) return NaN; const r = c[b] / c[a] - 1; return Math.sign(r) * (dn / n - up / n); }
export function frogRow(S, I, t) { if (t < 252 || !liquid(S, I, t)) return null; const a = t - 252, b = t - 21; if (!(S.c[a] > 0) || !ok(S.c[b])) return null;
  const r = S.c[b] / S.c[a] - 1, id = infoDiscreteness(S.c, a, b); return ok(r) && ok(id) ? { r, id } : null; }
// rows: [{ key, r, id }] -> the n lowest-ID names among the top `frac` by r
export function frogPick(rows, frac = 0.3, n = 30) { const w = [...rows].sort((x, y) => y.r - x.r).slice(0, Math.ceil(rows.length * frac)); return w.sort((x, y) => x.id - y.id || y.r - x.r).slice(0, n); }
export function crashBase(S, I, t) { if (t < 130 || !liquid(S, I, t) || !(S.c[t - 126] > 0)) return null; const dd = S.c[t] / S.c[t - 126] - 1; if (!(dd <= -0.5)) return null;
  const l1 = lo(S.l, t - 9, t), l0 = lo(S.l, t - 29, t - 10), r1 = hi(S.h, t - 9, t) - l1, r0 = hi(S.h, t - 29, t - 10) - l0, v1 = avg(S.v, t - 9, t), v0 = avg(S.v, t - 29, t - 10);
  if (![l1, l0, r1, r0, v1, v0].every(ok)) return null; return { dd, l1, l0, r1, r0, v1, v0, adr: I.adr20[t] }; }
export function detectCrash(S, I, t) { const b = crashBase(S, I, t); if (!b) return null; if (!(b.l1 >= b.l0 && b.r1 <= 0.6 * b.r0 && b.v1 >= 1.2 * b.v0)) return null;
  return { entry: 'open', base: b.l1, info: { down126: +b.dd.toFixed(3), rangeRatio: +(b.r1 / b.r0).toFixed(2), volRatio: +(b.v1 / b.v0).toFixed(2) } }; }
// the control: crashed the same way but still making lower lows (exits the same way, against its own 10-session low)
export function crashControl(S, I, t) { const b = crashBase(S, I, t); if (!b || !(b.l1 < b.l0)) return null; return { entry: 'open', base: b.l1, adr: b.adr }; }

// ---------- entry + exit simulation (one trade) ----------
// returns { state: 'pending' | 'expired' | 'cancelled' | 'skipped' | 'open' | 'closed', k: entry index, fill, x: exit index, g: gross return
// (weighted over partial sales; for an open trade marked at the last close), legs: [[index, fraction, price, why]], why }
export function simulate(engine, S, I, t, sig, last = S.c.length - 1) {
  const { o, h, l, c } = S; let k = -1, fill = NaN, atOpen = true;
  if (sig.entry === 'stop') {
    for (let j = t + 1; j <= Math.min(t + sig.valid, last); j++) { if (!ok(o[j]) || !ok(h[j])) continue;
      if (sig.maxAbove && o[j] > sig.trigger * (1 + sig.maxAbove)) return { state: 'skipped', why: 'opened more than ' + (sig.maxAbove * 100) + '% above the pivot' };
      if (o[j] >= sig.trigger) { k = j; fill = o[j]; break; } if (h[j] >= sig.trigger) { k = j; fill = sig.trigger; atOpen = false; break; }
      if (c[j] < sig.cancelBelow) return { state: 'cancelled', why: 'closed under the base low before the break' }; }
    if (k < 0) return { state: last < t + sig.valid ? 'pending' : 'expired' };
  } else { k = t + 1; if (k > last) return { state: 'pending' }; fill = o[k]; if (!(fill > 0)) return { state: 'skipped', why: 'no open price' }; }
  let stop = -Infinity, w = 1, val = 0; const legs = [], sell = (j, f, px, why) => { const q = Math.min(w, f); if (q <= 0) return; legs.push([j, +q.toFixed(4), +(+px).toFixed(4), why]); val += q * px; w -= q; };
  // initial stop
  if (engine === 'KQ') { if (sig.entry === 'stop') { stop = l[k]; if (l[k] < fill * (1 - sig.adr)) sell(k, 1, fill * (1 - sig.adr), 'entry day fell more than 1 ADR: booked as stopped'); }
    else { stop = Math.max(sig.stop, fill * (1 - sig.maxRisk)); if (!(fill > stop)) return { state: 'skipped', why: 'opened at or under the stop' }; } }
  else if (engine === 'MB') { stop = sig.stop; if (!(fill > stop)) return { state: 'skipped', why: 'opened at or under the stop' }; }
  else if (engine === 'MO') { stop = Math.max(sig.base, fill * 0.92); if (atOpen && l[k] <= stop) sell(k, 1, stop, 'stop'); else if (!atOpen && c[k] <= stop) sell(k, 1, stop, 'stop'); }
  else if (engine === 'PB') { stop = sig.stop; if (!(fill > stop) || (fill - stop) / fill > sig.maxRisk) return { state: 'skipped', why: !(fill > stop) ? 'opened at or under the stop' : 'stop more than 8% away' }; }
  else if (engine === 'CRASH') stop = -Infinity;
  const intradayStopFromDay1 = engine === 'KQ' ? sig.entry !== 'stop' : engine === 'MB' || engine === 'PB';
  const maxDays = { KQ: 120, MB: 5, MO: 252, PB: 60, TIME: 126, CRASH: 60 }[engine];
  let lastOk = k, half = false, pendingExit = false;
  for (let j = k; j <= last && w > 1e-9; j++) {
    if (!ok(c[j])) { if (j - lastOk > 15) { sell(j, w, c[lastOk], 'no more prices'); break; } continue; }
    const day = j - k + 1;
    if (j > k) { if (pendingExit) { sell(j, w, ok(o[j]) ? o[j] : c[j], 'next open after the exit close'); break; }
      if (stop > 0) { if (o[j] <= stop) { sell(j, w, o[j], 'opened under the stop'); break; } if (l[j] <= stop) { sell(j, w, stop, 'stop'); break; } } }
    else if (intradayStopFromDay1 && stop > 0 && l[j] <= stop) { sell(j, w, stop, 'stop'); break; }
    lastOk = j;
    if (engine === 'KQ') { if (day === 3 && c[j] > fill) { sell(j, 1 / 3, c[j], 'partial 1/3 on day 3'); stop = Math.max(stop, fill); }
      if (day >= 4 && c[j] < I.sma10[j]) pendingExit = true; }
    else if (engine === 'MO') { if (!half && h[j] >= fill * 1.2 && j > k) { sell(j, 0.5, Math.max(o[j], fill * 1.2), 'half at +20%'); half = true; }
      if (c[j] >= fill * 1.10) stop = Math.max(stop, fill); if (c[j] < I.sma50[j]) pendingExit = true; }
    else if (engine === 'PB') { if (c[j] < I.ema9[j]) pendingExit = true; }
    else if (engine === 'CRASH') { if (c[j] < sig.base) pendingExit = true; }
    if (w > 1e-9 && day >= maxDays && !pendingExit) { sell(j, w, c[j], 'time limit (' + maxDays + ' sessions)'); break; }
  }
  if (w > 1e-9) { const m = c[lastOk]; return { state: 'open', k, fill, legs, g: (val + w * m) / fill - 1, held: w, mark: m, stop: stop > 0 ? stop : null, why: pendingExit ? 'exit at the next open' : null }; }
  const x = legs[legs.length - 1][0]; return { state: 'closed', k, fill, x, legs, g: val / fill - 1 };
}
// ---------- live record stats (net of COST) ----------
export function boardStats(rows) {
  const net = rows.map(r => r.g - COST), win = net.filter(x => x > 0), loss = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0), r4 = (x) => x === null || !isFinite(x) ? null : +x.toFixed(4);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    avgWin: win.length ? r4(sum(win) / win.length) : null, avgLoss: loss.length ? r4(sum(loss) / loss.length) : null, pf: loss.length && sum(loss) < 0 ? r4(sum(win) / -sum(loss)) : (win.length ? null : null), best: net.length ? r4(Math.max(...net)) : null, worst: net.length ? r4(Math.min(...net)) : null };
}
// TRY SMALL readiness (pre-registered, owner's lane): 30+ resolved paper trades on 10+ distinct signal days, average positive after 0.8%
export const trySmallReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
