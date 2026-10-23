// WINNER AUTOPSY CORE (owner's request, 23 Oct 2026). Pure functions, no network, no files; winners-autopsy-lab.mjs does the reading,
// fetching and writing. Tested in test/winners-autopsy-core.test.mjs.
// Everything here is computed from data known at the CLOSE of the day asked about (no later bar is read), except where a function
// says otherwise (episode finding and exits look forward on purpose: they measure what happened next).
// Arrays: o, h, l, c, v = one stock's daily open / high / low / close / volume on the common session calendar; NaN = no bar that day.

export const COST = 0.008, COST_STRESS = 0.012;
export const WIN_GAIN = 0.30, WIN_LEN = 10, MIN_PRICE = 1, MIN_MEDDV = 2e6, LOOKBACK = 10;
const ok = (x) => typeof x === 'number' && isFinite(x);
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const firstOnOrAfter = (S, d) => { let lo = 0, hi = S.length; while (lo < hi) { const m = (lo + hi) >> 1; if (S[m] < d) lo = m + 1; else hi = m; } return lo; };

// ---- 1. PRICE / VOLUME FEATURES for every session of one stock (rolling, O(T) each) --------------------------------------------------
// d20/d50/d200   close vs its 20/50/200-day average (an average needs 80% of its days present)
// hi52           close vs the highest close of the last 252 sessions (120+ closes needed)
// dd6m           close vs the highest close of the last 126 sessions (60+ closes needed): the drawdown from the 6-month high
// tight10        (highest - lowest close of the last 10 sessions) / close: how tight the last 10 days were
// up10           how many of the last 10 sessions closed up
// vRel           today's volume / the average volume of the 20 sessions BEFORE today
// vTrend         average volume of the last 5 sessions / average of the 20 sessions before those
// r5, r20        5- and 20-session return
// bigDay20       the largest one-day gain of the last 20 sessions
// jumpShare      bigDay20 / the sum of all one-day gains of the last 20 sessions: near 1 = one jump made the gain; low = many small steps
// vol20          standard deviation of daily returns, last 20 sessions
// dvMed20        median daily dollar volume of the last 20 sessions (a session without a bar counts as 0)
export const FEATURES = ['d20', 'd50', 'd200', 'hi52', 'dd6m', 'tight10', 'up10', 'vRel', 'vTrend', 'r5', 'r20', 'bigDay20', 'jumpShare', 'vol20', 'dvMed20'];
export function featureSeries({ o, h, l, c, v }) {
  const T = c.length, F = {}; for (const k of FEATURES) F[k] = new Float64Array(T).fill(NaN);
  const pc = new Float64Array(T + 1), pn = new Float64Array(T + 1), pv = new Float64Array(T + 1), pvn = new Float64Array(T + 1);
  for (let t = 0; t < T; t++) { const x = c[t], y = v[t]; pc[t + 1] = pc[t] + (ok(x) && x > 0 ? x : 0); pn[t + 1] = pn[t] + (ok(x) && x > 0 ? 1 : 0); pv[t + 1] = pv[t] + (ok(y) && y >= 0 ? y : 0); pvn[t + 1] = pvn[t] + (ok(y) && y >= 0 ? 1 : 0); }
  const sma = (t, w) => { const a = Math.max(0, t + 1 - w), n = pn[t + 1] - pn[a]; return n >= Math.ceil(w * 0.8) ? (pc[t + 1] - pc[a]) / n : NaN; };
  const vavg = (a, b, mn) => { if (b < a || a < 0) return NaN; const n = pvn[b + 1] - pvn[a]; return n >= mn ? (pv[b + 1] - pv[a]) / n : NaN; };
  const dr = new Float64Array(T).fill(NaN); for (let t = 1; t < T; t++) if (c[t] > 0 && c[t - 1] > 0) dr[t] = c[t] / c[t - 1] - 1;
  const rollMax = (w, mn) => { const out = new Float64Array(T).fill(NaN), dq = []; let h0 = 0, cnt = 0; const q = [];
    for (let t = 0; t < T; t++) { const x = c[t] > 0 ? c[t] : NaN; q.push(x); if (ok(x)) cnt++; if (q.length > w) { const z = q.shift(); if (ok(z)) cnt--; }
      if (ok(x)) { while (dq.length > h0 && c[dq[dq.length - 1]] <= x) dq.pop(); dq.push(t); } while (dq.length > h0 && dq[h0] <= t - w) h0++;
      if (cnt >= mn && dq.length > h0) out[t] = c[dq[h0]]; } return out; };
  const max252 = rollMax(252, 120), max126 = rollMax(126, 60);
  for (let t = 0; t < T; t++) {
    const x = c[t]; if (!(x > 0)) continue;
    F.d20[t] = x / sma(t, 20) - 1; F.d50[t] = x / sma(t, 50) - 1; F.d200[t] = x / sma(t, 200) - 1;
    F.hi52[t] = x / max252[t] - 1; F.dd6m[t] = x / max126[t] - 1;
    { let mx = -Infinity, mn = Infinity, n = 0; for (let k = Math.max(0, t - 9); k <= t; k++) if (c[k] > 0) { n++; mx = Math.max(mx, c[k]); mn = Math.min(mn, c[k]); } if (n >= 8) F.tight10[t] = (mx - mn) / x; }
    { let u = 0, n = 0; for (let k = Math.max(1, t - 9); k <= t; k++) if (ok(dr[k])) { n++; if (dr[k] > 0) u++; } if (n >= 8) F.up10[t] = u; }
    { const a = vavg(t - 20, t - 1, 15); if (a > 0 && ok(v[t])) F.vRel[t] = v[t] / a; }
    { const a = vavg(t - 4, t, 4), b = vavg(t - 24, t - 5, 15); if (b > 0 && ok(a)) F.vTrend[t] = a / b; }
    if (t >= 5 && c[t - 5] > 0) F.r5[t] = x / c[t - 5] - 1; if (t >= 20 && c[t - 20] > 0) F.r20[t] = x / c[t - 20] - 1;
    { let mx = -Infinity, pos = 0, n = 0, s = 0, q = 0; for (let k = Math.max(1, t - 19); k <= t; k++) if (ok(dr[k])) { n++; mx = Math.max(mx, dr[k]); if (dr[k] > 0) pos += dr[k]; s += dr[k]; q += dr[k] * dr[k]; }
      if (n >= 15) { F.bigDay20[t] = mx; F.jumpShare[t] = pos > 0 ? Math.max(0, mx) / pos : 0; const m = s / n; F.vol20[t] = Math.sqrt(Math.max(0, q / n - m * m)); } }
    { const a = []; for (let k = t - 19; k <= t; k++) a.push(k >= 0 && c[k] > 0 && v[k] >= 0 ? c[k] * v[k] : 0); a.sort((p, q) => p - q); F.dvMed20[t] = (a[9] + a[10]) / 2; }
  }
  return F;
}
export const inUniverse = (c, dvMed) => c >= MIN_PRICE && dvMed >= MIN_MEDDV;

// ---- 2. FLAGS: fixed yes/no precursors (thresholds REGISTERED 23 Oct 2026 before any autopsy number was seen; never tuned) ----------
// ctx (known at that close): earnNext5 / earnLast10 (a report in the next 5 / last 10 sessions; the calendar date of an upcoming report
// is used as if published in advance - companies normally confirm the date 1-4 weeks ahead), k8 (8-Ks filed in the last 10 sessions),
// dil (S-1 / S-3 / F-1 / F-3 / 424B filed in the last 30 sessions), d13 (13D in the last 30), f4 (Form 4s in the last 10), sectorEx
// (the stock's industry (SEC 2-digit SIC, 5+ members) 20-day average return minus the S&P 500's), mktUp (S&P 500 above its 50-day
// average), mcap (close x SEC share count known 30 days earlier; null if unknown). A filing counts from the session AFTER its filing date.
export const FLAGS = [
  ['ABOVE_50', 'close above its 50-day average', (f) => f.d50 > 0],
  ['ABOVE_200', 'close above its 200-day average', (f) => f.d200 > 0],
  ['BELOW_200_20', 'close 20%+ below its 200-day average', (f) => f.d200 <= -0.20],
  ['NEAR_52W_HIGH', 'within 10% of its 52-week high close', (f) => f.hi52 >= -0.10],
  ['DEEP_DRAWDOWN', '40%+ below its 6-month high close', (f) => f.dd6m <= -0.40],
  ['TIGHT_10D', 'last 10 closes within an 8% range', (f) => f.tight10 <= 0.08],
  ['LOOSE_10D', 'last 10 closes spread over 25%+', (f) => f.tight10 >= 0.25],
  ['MANY_UP_DAYS', '6+ of the last 10 sessions closed up', (f) => f.up10 >= 6],
  ['FEW_UP_DAYS', '3 or fewer of the last 10 sessions closed up', (f) => f.up10 <= 3],
  ['VOLUME_SURGE', "today's volume 2x+ the 20-day average", (f) => f.vRel >= 2],
  ['VOLUME_RISING', 'last 5 days volume 1.5x+ the 20 days before', (f) => f.vTrend >= 1.5],
  ['VOLUME_DRY', 'last 5 days volume 0.7x or less of the 20 days before', (f) => f.vTrend <= 0.7],
  ['UP_10PCT_5D', 'up 10%+ in the last 5 sessions', (f) => f.r5 >= 0.10],
  ['DOWN_10PCT_5D', 'down 10%+ in the last 5 sessions', (f) => f.r5 <= -0.10],
  ['SMALL_STEPS', 'up 10%+ in 20 sessions with no single day over 35% of the gain', (f) => f.r20 >= 0.10 && f.jumpShare < 0.35],
  ['BIG_JUMP_20D', 'a one-day gain of 15%+ in the last 20 sessions', (f) => f.bigDay20 >= 0.15],
  ['EARNINGS_NEXT_5D', 'earnings report due in the next 5 sessions', (f, x) => !!x.earnNext5],
  ['EARNINGS_LAST_10D', 'earnings reported in the last 10 sessions', (f, x) => !!x.earnLast10],
  ['FILED_8K_10D', 'an 8-K filed in the last 10 sessions', (f, x) => x.k8 > 0],
  ['DILUTION_FILING_30D', 'an S-1 / S-3 / F-1 / F-3 / 424B filed in the last 30 sessions', (f, x) => x.dil > 0],
  ['FILED_13D_30D', 'a 13D (5%+ holder with intent) filed in the last 30 sessions', (f, x) => x.d13 > 0],
  ['INSIDER_FORMS_10D', '2+ Form 4 insider filings in the last 10 sessions', (f, x) => x.f4 >= 2],
  ['SECTOR_HOT', "its industry beat the S&P 500 by 5%+ over 20 sessions", (f, x) => x.sectorEx >= 0.05],
  ['SECTOR_COLD', "its industry trailed the S&P 500 by 5%+ over 20 sessions", (f, x) => x.sectorEx <= -0.05],
  ['MARKET_UP', 'S&P 500 above its 50-day average', (f, x) => !!x.mktUp],
  ['UNDER_5USD', 'price under 5 USD', (f) => f.c < 5],
  ['MICRO_CAP', 'market value under 300M USD', (f, x) => ok(x.mcap) && x.mcap < 3e8],
  ['HIGH_VOLATILITY', 'daily moves 6%+ (20-day standard deviation)', (f) => f.vol20 >= 0.06],
];
export const FLAG_NAMES = FLAGS.map(x => x[0]), FLAG_BIT = Object.fromEntries(FLAGS.map((x, j) => [x[0], j]));
// f = one session's features ({ c, d50, ... }); returns a bit mask (bit j = FLAGS[j])
export function flagMask(f, x = {}) { let m = 0; for (let j = 0; j < FLAGS.length; j++) { let on = false; try { on = FLAGS[j][2](f, x) === true; } catch (e) { on = false; } if (on) m |= (1 << j); } return m >>> 0; }
export const maskOf = (names) => names.reduce((m, n) => { if (!(n in FLAG_BIT)) throw new Error('unknown flag ' + n); return (m | (1 << FLAG_BIT[n])) >>> 0; }, 0);
export const namesOf = (mask) => FLAG_NAMES.filter((n, j) => (mask >>> j) & 1);
export const has = (dayMask, combo) => ((dayMask & combo) >>> 0) === combo;
// how many sorted session indexes fall in [a, b]
export function countIn(sorted, a, b) { if (!sorted || !sorted.length || b < a) return 0; const lo = firstOnOrAfter(sorted, a), hi = firstOnOrAfter(sorted, b + 1); return hi - lo; }

// ---- 3. WINNER EPISODES -------------------------------------------------------------------------------------------------------------
// A winner = a close at least 30% above the LOWEST close of the 10 sessions before it (a rise over a 1-10 session window). The window
// starts the session after that lowest close (start s, base b = s - 1). The start must fall in [from, to]; the stock must be in the
// universe at the base close (price >= 1 USD, median dollar volume >= 2M USD); one episode per stock per 10 sessions.
// peak = the highest close of the 10-session window s..s+9 (as far as data goes).
export function findEpisodes(c, from, to, inUni, { gain = WIN_GAIN, len = WIN_LEN } = {}) {
  const T = c.length, out = []; let lastS = -Infinity;
  for (let e = Math.max(1, from); e < T; e++) { if (!(c[e] > 0)) continue; let b = -1;
    for (let k = Math.max(0, e - len); k <= e - 1; k++) if (c[k] > 0 && (b < 0 || c[k] <= c[b])) b = k;
    if (b < 0 || !(c[e] >= c[b] * (1 + gain))) continue; const s = b + 1;
    if (s < from || s > to || s < lastS + len || !inUni(b)) continue;
    let pk = s; for (let k = s; k <= Math.min(T - 1, s + len - 1); k++) if (c[k] > 0 && (!(c[pk] > 0) || c[k] > c[pk])) pk = k;
    out.push({ s, b, e, peakT: pk, gain: c[pk] / c[b] - 1, firstHit: e - s + 1 }); lastS = s; }
  return out;
}
// THE REALISTIC ENTRY of a winner, two ways. momentum: the first close in the window 10%+ above the base close is the first knowable
// sign of the move; a long-only trader buys the NEXT open. left = the best close later in the window over that open (an upper bound:
// selling at the top); atEnd = the window's last close over that open. precursor: if a precursor signal fired on one of the 10 sessions
// before the start (sigT), the buy is the next open after it.
export function realisticEntry({ o, c }, ep, sigT = null, { trigger = 0.10, len = WIN_LEN } = {}) {
  const T = c.length, end = Math.min(T - 1, ep.s + len - 1), res = {};
  const after = (te) => { if (te > end || !(o[te] > 0)) return null; let pk = -Infinity; for (let k = te; k <= end; k++) if (c[k] > 0) pk = Math.max(pk, c[k]); let ce = NaN; for (let k = end; k >= te && !ok(ce); k--) if (c[k] > 0) ce = c[k];
    return { te, entry: o[te], left: pk > 0 ? pk / o[te] - 1 : null, atEnd: ok(ce) ? ce / o[te] - 1 : null }; };
  let d = -1; for (let k = ep.s; k <= end; k++) if (c[k] >= c[ep.b] * (1 + trigger)) { d = k; break; }
  res.momentum = d < 0 ? null : { signalT: d, ...(after(d + 1) || { te: d + 1, entry: null, left: null, atEnd: null }) };
  res.precursor = sigT === null ? null : { signalT: sigT, ...(after(sigT + 1) || { te: sigT + 1, entry: null, left: null, atEnd: null }) };
  return res;
}

// ---- 4. MATCHED CONTROLS --------------------------------------------------------------------------------------------------------------
// w and cands: { i, px, vol, mcap, sec }. Distance: |ln price ratio| / 0.5 + |ln volatility ratio| / 0.5 + |ln market value ratio| / 1.0
// (a missing market value adds 1.5). The k nearest of the SAME industry first; if fewer than k exist, the nearest of other industries
// fill the rest (marked sameSector false). Ties: lower i first (deterministic).
export function pickControls(w, cands, k = 5) {
  const dist = (x) => { let d = Math.abs(Math.log(x.px / w.px)) / 0.5 + Math.abs(Math.log((x.vol || 1e-4) / (w.vol || 1e-4))) / 0.5;
    d += ok(x.mcap) && ok(w.mcap) && x.mcap > 0 && w.mcap > 0 ? Math.abs(Math.log(x.mcap / w.mcap)) : 1.5; return d; };
  const all = cands.filter(x => x.i !== w.i && x.px > 0).map(x => ({ i: x.i, d: dist(x), same: !!(w.sec && x.sec === w.sec) })).sort((a, b) => a.d - b.d || a.i - b.i);
  const same = all.filter(x => x.same).slice(0, k), rest = same.length < k ? all.filter(x => !x.same).slice(0, k - same.length) : [];
  return [...same, ...rest].map(x => ({ i: x.i, dist: r4(x.d), sameSector: x.same }));
}

// ---- 5. WINNERS vs CONTROLS, feature by feature and in combinations of up to 3 ----------------------------------------------------------
// rows: { days: [mask of each of the 10 knowable sessions] }. A combination is PRESENT before a winner if all its flags were on together
// on at least one of the 10 sessions before the start. Returns every combination of 1..maxK flags that at least minW winners had.
export function comboTable(winRows, ctrlRows, { maxK = 3, minW = 1, nFlags = FLAGS.length } = {}) {
  const any = (rows) => rows.map(r => { let u = 0; for (const m of r.days) u = (u | m) >>> 0; return { u, days: r.days }; });
  const W = any(winRows), C = any(ctrlRows), nW = W.length, nC = C.length, out = [];
  const count = (R, m) => { let n = 0; for (const r of R) { if (!has(r.u, m)) continue; for (const d of r.days) if (has(d, m)) { n++; break; } } return n; };
  const z2 = (a, n1, b, n2) => { const p = (a + b) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2)); return se > 0 ? (a / n1 - b / n2) / se : 0; };
  const rec = (start, m, k, wCount) => { for (let j = start; j < nFlags; j++) { const m2 = (m | (1 << j)) >>> 0, w = count(W, m2); if (w < minW) continue; const cc = count(C, m2);
      const pw = w / nW, pcs = (cc + 0.5) / (nC + 1); out.push({ mask: m2, k: k + 1, flags: namesOf(m2), w, c: cc, nW, nC, pw: r4(pw), pc: r4(cc / nC), lift: r4(pw / pcs), z: r4(z2(w, nW, cc, nC)) });
      if (k + 1 < maxK) rec(j + 1, m2, k + 1, w); } };
  if (nW && nC) rec(0, 0, 0, nW);
  return out;
}
// (a) CLEARLY MORE OFTEN before winners (registered): >= minW winners (max of 10 and 3% of winners), lift >= 1.5, two-proportion z >= 3.0,
// and for a 2-3 flag combination a lift at least 10% above each of its smaller parts (else the extra flag adds nothing).
export function clearlyMoreOften(table, { minLift = 1.5, minZ = 3.0, minW = null } = {}) {
  if (!table.length) return []; const nW = table[0].nW, need = minW === null ? Math.max(10, Math.ceil(nW * 0.03)) : minW;
  const byMask = new Map(table.map(r => [r.mask, r]));
  const subs = (m) => { const bits = []; for (let j = 0; j < 32; j++) if ((m >>> j) & 1) bits.push(j); const out = []; for (let s = 1; s < (1 << bits.length) - 1; s++) { let x = 0; bits.forEach((b, q) => { if ((s >> q) & 1) x |= (1 << b); }); out.push(x >>> 0); } return out; };
  return table.filter(r => r.w >= need && r.lift >= minLift && r.z >= minZ && subs(r.mask).every(s => { const p = byMask.get(s); return !p || r.lift >= p.lift * 1.1; }))
    .sort((a, b) => b.z - a.z || b.lift - a.lift);
}

// ---- 6. EXITS (fixed before any result) ---------------------------------------------------------------------------------------------
// S8T10: buy the open of session te; stop 8% under the entry (a low at or under the stop sells at the stop; an open under it sells at
//        that open); else sell the close of the 10th session (te + 9).
// TRAIL: the same 8% starting stop; after every close the stop rises to 10% under the highest close since entry (never falls); checked
//        on the next sessions' lows / opens the same way; at most 20 sessions (close of te + 19).
// A day without a bar is skipped; if the stock has no bar on the last day, its last earlier close is used (a dead stock keeps its loss).
// Returns null if the entry open is missing; { open: true } if the data ends before the trade is decided.
export const EXITS = { S8T10: { stop: 0.08, trail: null, max: 10 }, TRAIL: { stop: 0.08, trail: 0.10, max: 20 } };
export function walkExit({ o, h, l, c }, te, kind, { dead = false } = {}) {
  const X = EXITS[kind], T = c.length; if (te >= T || !(o[te] > 0)) return null; const e = o[te]; let stop = e * (1 - X.stop), hc = -Infinity, lastC = NaN, lastK = te;
  for (let k = te; k < te + X.max; k++) {
    if (k >= T) { if (dead && ok(lastC)) return { g: lastC / e - 1, x: lastK, why: 'no more data' }; return { open: true, stop, held: k - te }; }
    if (o[k] > 0 && k > te && o[k] <= stop) return { g: o[k] / e - 1, x: k, why: 'gap under stop' };
    if (l[k] > 0 && l[k] <= stop) return { g: stop / e - 1, x: k, why: X.trail && stop > e * (1 - X.stop) ? 'trailing stop' : 'stop' };
    if (c[k] > 0) { lastC = c[k]; lastK = k; if (X.trail) { hc = Math.max(hc, c[k]); stop = Math.max(stop, hc * (1 - X.trail)); } }
  }
  return ok(lastC) ? { g: lastC / e - 1, x: lastK, why: 'time' } : null;
}
// fresh signals of one combination for one stock: the combination is on at close t, was not on at t-1, the stock is in the universe at
// t, and no trade of this rule is open in this stock. trades: { t (signal close), te (entry session), ...walkExit }
export function ruleTrades(px, masks, uni, combo, kind, from, to, opts = {}) {
  const out = []; let free = from;
  for (let t = Math.max(1, from); t <= to; t++) { if (t < free || !uni(t) || !has(masks[t], combo) || has(masks[t - 1], combo)) continue;
    const r = walkExit(px, t + 1, kind, opts); if (!r) continue; out.push({ t, te: t + 1, ...r }); free = r.open ? Infinity : r.x + 1; }
  return out;
}

// ---- 7. PAPER BOARD -------------------------------------------------------------------------------------------------------------------
// closed trades { g (gross), day (signal day), sym }: n, distinct days, distinct stocks, win rate, average after 0.8% cost, average win,
// average loss, profit factor (sum of net wins / sum of net losses). READY = 30+ trades on 10+ distinct days and positive after cost.
export function boardStats(tr) {
  const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), lo = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  const st = { n: tr.length, days: new Set(tr.map(z => z.day)).size, stocks: new Set(tr.map(z => z.sym)).size, win: tr.length ? r4(w.length / tr.length) : null,
    avg: r4(mean(net)), avgWin: r4(mean(w)), avgLoss: r4(mean(lo)), pf: lo.length && sum(lo) < 0 ? r4(sum(w) / -sum(lo)) : (w.length ? null : null) };
  st.ready = st.n >= 30 && st.days >= 10 && st.avg > 0;
  return st;
}
