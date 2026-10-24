// SQUAD 7 CORE: WINNER DNA (24 Oct 2026; the owner's squads 5-8). Pure functions, no network, no files; squad7-lab.mjs reads and
// writes, test/squad7-core.test.mjs tests. Long only; no leverage; no shorting; never places an order.
//
// QUESTION: what was VISIBLE the day before big winners moved, that matched look-alikes (same day, same price band, same liquidity,
// same prior-20-day move, same sector) did NOT show? The earlier 90-day winners autopsy (winners-autopsy-*, WIN-001..003) was rejected;
// this is the 5-year whole-market, matched case-control version, discovery on the OLDER half only, then a single out-of-sample test.
//
// STAGE 1 (DISCOVERY, older half only; data/squad7-dna.json; no verdicts, nothing traded):
//   UNIVERSE (point in time) = LIQUID stock-days: close >= 5 USD and 20-session average traded value >= 5M USD (main cache rows; SPY out).
//   WINNER W20  at signal day t: the stock CLOSES >= +30% over the OPEN of t+1 (the entry) on some session t+1..t+20.
//   WINNER W120 at signal day t: a close >= +100% over the open of t+1 on some session t+1..t+120. Closes from main and x rows (a stock
//   that fell under the cache filter still counts; a stock that died simply stops). One CASE per winning episode: the first t whose
//   label is true while t-1's is not, then no new case of that stock for 20 (W20) / 120 (W120) sessions.
//   LOOK-ALIKES (controls): up to 5 per case, same t, liquid, label FALSE, same cell = price band x liquidity band x prior-20-day-return
//   band x SIC 2-digit sector (sector dropped when the exact cell is empty; no control if still empty). Deterministic pick.
//   OLDER HALF ONLY: a case or control is used only if its whole label window ends before 2024-01-01 (t + 20 / t + 120 < the first 2024
//   session), so no newer-half price enters the discovery.
//   FEATURES at the close of t (FEATURES below): every value known at that close (share counts 30 days late, earnings reports dated on
//   or before t, sector peers on t).
//   RANKING: per feature, deciles of the pooled matched sample; lift = case share in the decile / case share overall, for the top and
//   the bottom decile; AUC (0.5 = useless); precision = case share in the best decile. A POPULATION sample (every 7th liquid stock-day of
//   the older half) gives, per decile, the whole-market winner rate, the loser rate (closes <= -30% / -50% in the window) and the average
//   forward return (entry open -> close of t+20 / t+120, capped at +300%): a feature that finds winners AND losers equally is useless.
//   PAIRS: the 12 best features (by |AUC - 0.5|, W20 and W120 separately) in their best quintile, every pair: matched lift + population
//   winner rate, loser rate and forward return.
//
// STAGE 2 (RULES, registered in RULES below AFTER stage 1 and BEFORE any newer-half number was computed): see the RULES block.
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', PAPER_START = '2026-10-26', CAP = 3;
export const W20 = { len: 20, gain: 0.30, loss: -0.30 }, W120 = { len: 120, gain: 1.00, loss: -0.50 };
export const MIN_PX = 5, MIN_DV = 5e6, CONTROLS = 5, POP_EVERY = 7;
const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';

// ================= labels (look FORWARD on purpose: they define what happened next) =================
// o, c: one stock's opens / closes on the common calendar (NaN = no bar). Returns per signal day t (entry = open of t+1):
// win[t] 1/0 (NaN-free: 0 when unknown), known[t] 1 if the entry open exists and the window is complete (t + len < T), max/min ratio, fwd.
export function labelSeries(o, c, { len, gain, loss }) {
  const T = c.length, win = new Uint8Array(T), lose = new Uint8Array(T), known = new Uint8Array(T), fwd = new Float32Array(T).fill(NaN);
  const qmax = [], qmin = []; let h1 = 0, h2 = 0;   // monotonic deques over closes of k..k+len-1, k = t+1
  // slide: window for t is [t+1, t+len]; build incrementally by advancing the right edge
  let right = 0;
  for (let t = 0; t + len < T; t++) {
    const a = t + 1, b = t + len;
    while (right <= b) { const x = c[right]; if (x > 0) { while (qmax.length > h1 && c[qmax[qmax.length - 1]] <= x) qmax.pop(); qmax.push(right); while (qmin.length > h2 && c[qmin[qmin.length - 1]] >= x) qmin.pop(); qmin.push(right); } right++; }
    while (qmax.length > h1 && qmax[h1] < a) h1++; while (qmin.length > h2 && qmin[h2] < a) h2++;
    const e = o[a]; if (!(e > 0)) continue; known[t] = 1;
    if (qmax.length > h1 && c[qmax[h1]] >= e * (1 + gain)) win[t] = 1;
    if (qmin.length > h2 && c[qmin[h2]] <= e * (1 + loss)) lose[t] = 1;
    for (let q = b; q >= a; q--) if (c[q] > 0) { fwd[t] = c[q] / e - 1; break; }
  }
  return { win, lose, known, fwd };
}
// one case per winning episode: label true, previous day's false (or not eligible), cooldown sessions before the next case
export function episodeStarts(win, elig, cooldown) { const out = []; let next = -1;
  for (let t = 0; t < win.length; t++) { if (!win[t] || !elig(t) || t < next) continue; if (t > 0 && win[t - 1] && elig(t - 1)) continue; out.push(t); next = t + cooldown; }
  return out; }

// ================= matching =================
export const priceBand = (p) => p < 10 ? 0 : p < 20 ? 1 : p < 50 ? 2 : p < 100 ? 3 : 4;
export const liqBand = (dv) => dv < 15e6 ? 0 : dv < 50e6 ? 1 : dv < 200e6 ? 2 : 3;
export const r20Band = (r) => !ok(r) ? 9 : r < -0.15 ? 0 : r < -0.05 ? 1 : r < 0.05 ? 2 : r < 0.15 ? 3 : r < 0.30 ? 4 : 5;
export const cellKey = (px, dv, r20, sec) => priceBand(px) + '|' + liqBand(dv) + '|' + r20Band(r20) + '|' + (sec || '?');
export const looseKey = (k) => k.slice(0, k.lastIndexOf('|'));
// deterministic pseudo-random pick of n items (seeded by a string)
export function seeded(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e9) / 1e9; }; }
export function pickN(arr, n, seed) { if (arr.length <= n) return [...arr]; const r = seeded(seed), a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }

// ================= features (known at the close of t) =================
// arrays o, h, l, c, v of one stock; spy = SPY closes. sector / shares / earnings features are added by the lab (sectorFeatures,
// sharesChange, earnFeatures). Each returns a Float32Array per feature (NaN = unknown).
export const PRICE_FEATURES = ['r5', 'r20', 'r63', 'r126', 'rs63', 'rs126', 'hi52', 'd50', 'd200', 'turn50', 'dry', 'dryPop', 'vcp', 'rng10', 'vol20', 'gapUp20', 'gapMax20', 'ovn20', 'intra20', 'ovnShare', 'ret1', 'clv', 'udVol20', 'baseLen', 'dv20'];
export const OTHER_FEATURES = ['rsSec', 'breadthSec', 'dShares', 'logMcap', 'earnDays', 'surprise'];
export const FEATURES = [...PRICE_FEATURES, ...OTHER_FEATURES];
export const DESCRIBE = {
  r5: '5-session return', r20: '20-session return (matched)', r63: '3-month return', r126: '6-month return', rs63: '3-month return minus the S&P 500 (SPY)', rs126: '6-month return minus SPY',
  hi52: 'distance from the highest close of the last 252 sessions (0 = at the high)', d50: 'close vs its 50-day average', d200: 'close vs its 200-day average',
  turn50: 'today\'s volume / the 50-day average volume', dry: 'quietest 5-day average volume of the last 15 sessions / the 50-day average (low = volume dried up)', dryPop: 'today\'s volume ratio / the dry-up ratio (expansion after a dry-up)',
  vcp: 'average true range 10 days / 50 days (low = volatility contracted)', rng10: '10-day high-low range / close', vol20: 'daily volatility, 20 sessions',
  gapUp20: 'number of 3%+ opening gaps up, last 20 sessions', gapMax20: 'largest opening gap, last 20 sessions', ovn20: 'overnight (close-to-open) part of the last 20 sessions\' move (log)',
  intra20: 'intraday (open-to-close) part of the last 20 sessions\' move (log)', ovnShare: 'overnight share of the 20-session move (-1..1)', ret1: 'today\'s return', clv: 'where the close sits in today\'s range (1 = at the high)',
  udVol20: 'volume on up days / volume on down days, 20 sessions', baseLen: 'sessions the stock has stayed inside a 30% range before today (prior base length)', dv20: 'log10 20-day average traded value (matched)',
  rsSec: '3-month return minus the sector median (SIC 2-digit, 5+ liquid peers)', breadthSec: 'share of liquid sector peers beating SPY over 20 sessions', dShares: 'share-count change over a year (known 30 days late; + = dilution)',
  logMcap: 'log10 market value (close x shares known 30 days late)', earnDays: 'calendar days since the last earnings report (Nasdaq calendar)', surprise: 'last earnings surprise (actual - estimate) / max(|estimate|, 0.05)' };

export function priceFeatures({ o, h, l, c, v }, spy) {
  const T = c.length, F = {}; for (const k of PRICE_FEATURES) F[k] = new Float32Array(T).fill(NaN);
  const back = (t, k) => { for (let q = t - k; q >= Math.max(0, t - k - 3); q--) if (c[q] > 0) return c[q]; return NaN; };
  const sback = (t, k) => { for (let q = t - k; q >= Math.max(0, t - k - 3); q--) if (spy[q] > 0) return spy[q]; return NaN; };
  // prefix sums for averages
  const pc = new Float64Array(T + 1), pn = new Float64Array(T + 1), pv = new Float64Array(T + 1), pvn = new Float64Array(T + 1), pdv = new Float64Array(T + 1), pdn = new Float64Array(T + 1), tr = new Float64Array(T).fill(NaN), ptr = new Float64Array(T + 1), ptn = new Float64Array(T + 1);
  let prevC = NaN; for (let t = 0; t < T; t++) { const x = c[t], y = v[t];
    pc[t + 1] = pc[t] + (x > 0 ? x : 0); pn[t + 1] = pn[t] + (x > 0 ? 1 : 0); pv[t + 1] = pv[t] + (y >= 0 && x > 0 ? y : 0); pvn[t + 1] = pvn[t] + (y >= 0 && x > 0 ? 1 : 0);
    pdv[t + 1] = pdv[t] + (y >= 0 && x > 0 ? x * y : 0); pdn[t + 1] = pdn[t] + (y >= 0 && x > 0 ? 1 : 0);
    if (h[t] > 0 && l[t] > 0) tr[t] = Math.max(h[t], prevC > 0 ? prevC : h[t]) - Math.min(l[t], prevC > 0 ? prevC : l[t]);
    ptr[t + 1] = ptr[t] + (ok(tr[t]) ? tr[t] : 0); ptn[t + 1] = ptn[t] + (ok(tr[t]) ? 1 : 0); if (x > 0) prevC = x; }
  const avg = (P, N, a, b, mn) => { a = Math.max(0, a); if (b < a) return NaN; const n = N[b + 1] - N[a]; return n >= mn ? (P[b + 1] - P[a]) / n : NaN; };
  // rolling 252 max close (120+ present)
  const hi = new Float32Array(T).fill(NaN); { const dq = []; let h0 = 0, cnt = 0; for (let t = 0; t < T; t++) { if (c[t] > 0) { cnt++; while (dq.length > h0 && c[dq[dq.length - 1]] <= c[t]) dq.pop(); dq.push(t); } if (t >= 252 && c[t - 252] > 0) cnt--; while (dq.length > h0 && dq[h0] <= t - 252) h0++; if (cnt >= 120 && dq.length > h0) hi[t] = c[dq[h0]]; } }
  for (let t = 1; t < T; t++) { const x = c[t]; if (!(x > 0)) continue;
    for (const [k, n] of [['r5', 5], ['r20', 20], ['r63', 63], ['r126', 126]]) { const y = back(t, n); if (y > 0) F[k][t] = x / y - 1; }
    { const s0 = spy[t], s1 = sback(t, 63), s2 = sback(t, 126); if (s0 > 0 && s1 > 0 && ok(F.r63[t])) F.rs63[t] = F.r63[t] - (s0 / s1 - 1); if (s0 > 0 && s2 > 0 && ok(F.r126[t])) F.rs126[t] = F.r126[t] - (s0 / s2 - 1); }
    if (hi[t] > 0) F.hi52[t] = x / hi[t] - 1;
    { const m = avg(pc, pn, t - 49, t, 40); if (m > 0) F.d50[t] = x / m - 1; const m2 = avg(pc, pn, t - 199, t, 160); if (m2 > 0) F.d200[t] = x / m2 - 1; }
    const v50 = avg(pv, pvn, t - 50, t - 1, 40);
    if (v50 > 0 && v[t] >= 0) F.turn50[t] = v[t] / v50;
    if (v50 > 0) { let mn = Infinity; for (let j = t - 15; j <= t - 1; j++) { const a5 = avg(pv, pvn, j - 4, j, 4); if (ok(a5) && a5 < mn) mn = a5; } if (isFinite(mn)) { F.dry[t] = mn / v50; if (ok(F.turn50[t]) && mn > 0) F.dryPop[t] = F.turn50[t] / (mn / v50); } }
    { const a10 = avg(ptr, ptn, t - 9, t, 8), a50 = avg(ptr, ptn, t - 49, t, 40); if (a10 > 0 && a50 > 0) F.vcp[t] = a10 / a50; }
    { let mx = -Infinity, mn = Infinity, n = 0; for (let j = Math.max(0, t - 9); j <= t; j++) if (h[j] > 0 && l[j] > 0) { n++; mx = Math.max(mx, h[j]); mn = Math.min(mn, l[j]); } if (n >= 8) F.rng10[t] = (mx - mn) / x; }
    { let s = 0, q = 0, n = 0, gu = 0, gm = -Infinity, ov = 0, ia = 0, up = 0, dn = 0, gn = 0;
      for (let j = Math.max(1, t - 19); j <= t; j++) { if (!(c[j] > 0)) continue; let p = NaN; for (let z = j - 1; z >= Math.max(0, j - 3); z--) if (c[z] > 0) { p = c[z]; break; } if (!(p > 0)) continue;
        const r = Math.log(c[j] / p); s += r; q += r * r; n++; if (r > 0) up += v[j] >= 0 ? v[j] : 0; else if (r < 0) dn += v[j] >= 0 ? v[j] : 0;
        if (o[j] > 0) { const g = o[j] / p - 1; gn++; if (g >= 0.03) gu++; if (g > gm) gm = g; ov += Math.log(o[j] / p); ia += Math.log(c[j] / o[j]); } }
      if (n >= 15) { const m = s / n; F.vol20[t] = Math.sqrt(Math.max(0, q / n - m * m)); F.udVol20[t] = dn > 0 ? up / dn : up > 0 ? 10 : NaN; }
      if (gn >= 15) { F.gapUp20[t] = gu; F.gapMax20[t] = gm; F.ovn20[t] = ov; F.intra20[t] = ia; const z = Math.abs(ov) + Math.abs(ia); F.ovnShare[t] = z > 0 ? ov / z : 0; } }
    { const p = back(t, 1); if (p > 0) F.ret1[t] = x / p - 1; }
    if (h[t] > l[t] && l[t] > 0) F.clv[t] = (x - l[t]) / (h[t] - l[t]); else if (h[t] > 0 && h[t] === l[t]) F.clv[t] = 0.5;
    { let mx = -Infinity, mn = Infinity, w = 0; for (let j = t - 1; j >= Math.max(0, t - 252); j--) { if (!(c[j] > 0)) { w++; continue; } mx = Math.max(mx, c[j]); mn = Math.min(mn, c[j]); if (mx / mn > 1.30) break; w++; } F.baseLen[t] = t >= 252 || w < t ? w : NaN; }
    { const a = avg(pdv, pdn, t - 19, t, 15); if (a > 0) F.dv20[t] = Math.log10(a); }
  }
  return F;
}
// sector features for one day: rows = [{ i, sec, r63, r20 }] of liquid stocks; spyR20 = SPY's 20-session return. Returns Map i -> { rsSec, breadthSec }
export function sectorFeatures(rows, spyR20) { const by = new Map(); for (const r of rows) if (r.sec) (by.get(r.sec) || by.set(r.sec, []).get(r.sec)).push(r);
  const out = new Map();
  // the sector median includes the stock itself (6+ liquid members needed); breadth counts the OTHER members beating SPY
  for (const [, g] of by) { if (g.length < 6) continue; const s = g.map(r => r.r63).filter(ok).sort((a, b) => a - b), med = s.length >= 6 ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
    const n20 = g.filter(r => ok(r.r20)).length, beat = ok(spyR20) ? g.filter(r => ok(r.r20) && r.r20 > spyR20).length : 0;
    for (const r of g) { const self = ok(r.r20) ? 1 : 0, selfBeat = ok(r.r20) && ok(spyR20) && r.r20 > spyR20 ? 1 : 0;
      out.set(r.i, { rsSec: ok(r.r63) && ok(med) ? r.r63 - med : NaN, breadthSec: n20 - self >= 5 && ok(spyR20) ? (beat - selfBeat) / (n20 - self) : NaN }); } }
  return out; }
// share-count change over a year, both counts known 30 days late; rows = [[date, shares]] ascending (split-repaired)
const DAY = 864e5, ms = (d) => Date.parse(d + 'T00:00:00Z'), isoMs = (x) => new Date(x).toISOString().slice(0, 10);
export const addDays = (d, n) => isoMs(ms(d) + n * DAY);
export function sharesAt(rows, d, lag = 30) { if (!rows || !rows.length) return null; const lim = addDays(d, -lag); let v = null; for (const [e, n] of rows) { if (e > lim) break; v = n; } return v > 0 ? v : null; }
export function sharesChange(rows, d) { const a = sharesAt(rows, d), b = sharesAt(rows, addDays(d, -365)); return a > 0 && b > 0 ? a / b - 1 : NaN; }
export function splitFix(rows) { const out = rows.map(([d, n]) => [d, n]);
  for (let k = out.length - 2; k >= 0; k--) { const a = out[k][1], b = out[k + 1][1]; if (!(a > 0 && b > 0)) continue; const r = b / a, R = r >= 1 ? r : 1 / r, w = Math.round(R);
    if (w >= 2 && w <= 50 && Math.abs(R / w - 1) <= 0.03) for (let j = 0; j <= k; j++) out[j][1] *= r; }
  return out; }
// earnings: reps = [{ d, a, e }] ascending by date (Nasdaq calendar). A report dated d is known for a decision at the close of d (bmo before
// the open; amc after the close but before the next open, when the trade is bought).
export function earnFeatures(reps, d) { if (!reps || !reps.length) return { earnDays: NaN, surprise: NaN }; let last = null;
  for (const r of reps) { if (r.d > d) break; last = r; }
  if (!last) return { earnDays: NaN, surprise: NaN };
  return { earnDays: Math.round((ms(d) - ms(last.d)) / DAY), surprise: ok(last.a) && ok(last.e) ? (last.a - last.e) / Math.max(Math.abs(last.e), 0.05) : NaN }; }

// ================= ranking =================
export function quantiles(vals, q) { const s = vals.filter(ok).sort((a, b) => a - b); if (!s.length) return null; return q.map(p => s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]); }
const DEC = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
export const decileOf = (x, cuts) => { let k = 0; while (k < cuts.length && x >= cuts[k]) k++; return k; };
// AUC (Mann-Whitney): probability a random case has a higher value than a random control
export function auc(cases, ctrls) { const a = cases.filter(ok), b = ctrls.filter(ok); if (a.length < 10 || b.length < 10) return null;
  const all = a.map(x => [x, 1]).concat(b.map(x => [x, 0])).sort((p, q) => p[0] - q[0]); let rank = 0, sumA = 0;
  for (let i = 0; i < all.length;) { let j = i; while (j < all.length && all[j][0] === all[i][0]) j++; const r = (i + 1 + j) / 2; for (let k = i; k < j; k++) if (all[k][1]) sumA += r; rank = j; i = j; } void rank;
  return (sumA - a.length * (a.length + 1) / 2) / (a.length * b.length); }
// rows = [{ y: 1 case / 0 control, f: { feature: value } }]; pop = [{ win, lose, fwd, f }] (population sample, same horizon)
export function liftTable(rows, pop, feats) { const out = [];
  for (const k of feats) { const vals = rows.map(r => r.f[k]), cuts = quantiles(vals, DEC); if (!cuts) { out.push({ feature: k, n: 0 }); continue; }
    const have = rows.filter(r => ok(r.f[k])), base = have.filter(r => r.y).length / have.length, dec = Array.from({ length: 10 }, () => ({ n: 0, y: 0 }));
    for (const r of have) { const d = decileOf(r.f[k], cuts); dec[d].n++; dec[d].y += r.y; }
    const A = auc(have.filter(r => r.y).map(r => r.f[k]), have.filter(r => !r.y).map(r => r.f[k])), dir = A === null ? 0 : A >= 0.5 ? 1 : -1;
    const pd = Array.from({ length: 10 }, () => ({ n: 0, win: 0, lose: 0, fwd: [] })); let pn = 0, pw = 0, pl = 0; const pf = [];
    for (const p of pop) { const x = p.f[k]; if (!ok(x)) continue; const d = decileOf(x, cuts); pd[d].n++; pd[d].win += p.win; pd[d].lose += p.lose; if (ok(p.fwd)) { pd[d].fwd.push(capG(p.fwd)); pf.push(capG(p.fwd)); } pn++; pw += p.win; pl += p.lose; }
    const decs = dec.map((z, d) => ({ d: d + 1, from: d ? r4(cuts[d - 1]) : null, lift: z.n && base > 0 ? r4(z.y / z.n / base) : null, n: z.n, popWin: pd[d].n ? r4(pd[d].win / pd[d].n) : null, popLose: pd[d].n ? r4(pd[d].lose / pd[d].n) : null, popFwd: r4(mean(pd[d].fwd)) }));
    const best = dir >= 0 ? decs[9] : decs[0];
    out.push({ feature: k, what: DESCRIBE[k] || k, n: have.length, cases: have.filter(r => r.y).length, coverage: r4(have.length / rows.length), auc: r4(A), direction: dir > 0 ? 'high' : dir < 0 ? 'low' : 'none', strength: A === null ? null : r4(Math.abs(A - 0.5)),
      liftTop: decs[9].lift, liftBottom: decs[0].lift, bestDecile: { side: dir >= 0 ? 'top 10%' : 'bottom 10%', cut: dir >= 0 ? r4(cuts[8]) : r4(cuts[0]), matchedPrecision: best.n ? r4(best.lift * base) : null, lift: best.lift, popWin: best.popWin, popLose: best.popLose, popFwd: best.popFwd },
      popAll: { n: pn, win: pn ? r4(pw / pn) : null, lose: pn ? r4(pl / pn) : null, fwd: r4(mean(pf)) }, cuts: cuts.map(r4), deciles: decs }); }
  return out.sort((a, b) => (b.strength || 0) - (a.strength || 0)); }
// a feature in its best quintile: the cut and the side
export function bestQuintile(rows, k, direction) { const q = quantiles(rows.map(r => r.f[k]), [0.2, 0.8]); if (!q) return null; return direction === 'low' ? { k, side: '<=', cut: q[0] } : { k, side: '>=', cut: q[1] }; }
export const inQ = (x, q) => ok(x) && (q.side === '>=' ? x >= q.cut : x <= q.cut);
export function pairTable(rows, pop, qs) { const out = [], base = rows.filter(r => r.y).length / Math.max(1, rows.length), pAll = mean(pop.filter(p => ok(p.fwd)).map(p => capG(p.fwd)));
  for (let a = 0; a < qs.length; a++) for (let b = a + 1; b < qs.length; b++) { const A = qs[a], B = qs[b], m = rows.filter(r => inQ(r.f[A.k], A) && inQ(r.f[B.k], B)), p = pop.filter(r => inQ(r.f[A.k], A) && inQ(r.f[B.k], B));
    const fw = p.filter(r => ok(r.fwd)).map(r => capG(r.fwd));
    out.push({ pair: A.k + ' ' + A.side + ' ' + r4(A.cut) + ' AND ' + B.k + ' ' + B.side + ' ' + r4(B.cut), matched: m.length, lift: m.length >= 30 && base > 0 ? r4(m.filter(r => r.y).length / m.length / base) : null,
      pop: p.length, popWin: p.length ? r4(p.reduce((s, r) => s + r.win, 0) / p.length) : null, popLose: p.length ? r4(p.reduce((s, r) => s + r.lose, 0) / p.length) : null, popFwd: r4(mean(fw)), popFwdAll: r4(pAll) }); }
  return out.sort((x, y) => (y.lift || 0) - (x.lift || 0)); }

// ================= STAGE 1b: CANDIDATE SCREEN (older half only; written 24 Oct 2026 after reading data/squad7-dna.json) =================
// What stage 1 showed (older half, 2021-10 .. 2023-12): the traits that separate winners from look-alikes best are VARIANCE traits
// (wide 10-day range, high volatility, deep under the 52-week high, big gaps, a down day, short base, dilution, small size). They
// flag LOSERS as often as winners: their best deciles have a negative average forward return. Traits where winners clearly outnumber
// losers: deep under the 200-day average (20-session horizon only), the sector laggard, no dilution, a long quiet base, 59-85 days since
// the last report (next report near), a moderate pullback (200-day -34%..-15%) and leaders in strong sectors (120-session horizon).
// Each candidate below pairs a winner-lift trait with a loser-cutting trait (cuts = stage-1 decile boundaries, rounded). Several singles
// are already rejected in the library (ANOM-LOWVOL, ANOM-EAP, ANOM-NSI, D2-004, M8, I3/I13), so only combinations are screened.
// The screen runs the rule engine on the OLDER half only (signal + hold before 2024-01-01); the 4-8 best by older-half edge become the
// SQ7 rules; the newer half is then their out-of-sample test. when = [[feature, '>=' | '<=', cut]], rank = per-day order, max 10 a day.
const C = (name, hold, when, rank) => ({ name, hold, when, rank, maxPerDay: 10 });
export const CANDIDATES = {
  A: C('Deep under the 200-day, not diluting', 20, [['d200', '<=', -0.33], ['dShares', '<=', 0.003]], ['d200', 'low']),
  B: C('Deep under the 200-day, next report near (59-85 days since the last)', 20, [['d200', '<=', -0.33], ['earnDays', '>=', 59], ['earnDays', '<=', 85]], ['d200', 'low']),
  C: C('Sector laggard (3-month return 22%+ under its sector) while the sector turns up (half its peers beat SPY), under the 200-day', 20, [['d200', '<=', -0.26], ['rsSec', '<=', -0.22], ['breadthSec', '>=', 0.5]], ['rsSec', 'low']),
  D: C('Deep under the 200-day but calm (20-day volatility under 4.35%)', 20, [['d200', '<=', -0.33], ['vol20', '<=', 0.0435]], ['d200', 'low']),
  E: C('Deep under the 200-day with volume waking up (1.45x the 50-day)', 20, [['d200', '<=', -0.33], ['turn50', '>=', 1.45]], ['turn50', 'high']),
  F: C('Long base far under the 52-week high, no dilution', 20, [['hi52', '<=', -0.53], ['baseLen', '>=', 26], ['dShares', '<=', 0.008]], ['baseLen', 'high']),
  G: C('Pre-report sector laggard under its 200-day (59-85 days since the last report)', 20, [['earnDays', '>=', 59], ['earnDays', '<=', 85], ['rsSec', '<=', -0.1], ['d200', '<=', 0]], ['rsSec', 'low']),
  H: C('Deep under the 200-day, recent 3%+ gap up, not diluting', 20, [['d200', '<=', -0.33], ['gapUp20', '>=', 1], ['dShares', '<=', 0.008]], ['d200', 'low']),
  I: C('Quiet pullback: 15-34% under the 200-day, 30+ day base, no dilution', 120, [['d200', '>=', -0.34], ['d200', '<=', -0.15], ['baseLen', '>=', 30], ['dShares', '<=', 0.007]], ['baseLen', 'high']),
  J: C('Leader in a strong sector: 15%+ over the 200-day, 55%+ of sector peers beat SPY', 120, [['d200', '>=', 0.15], ['breadthSec', '>=', 0.55]], ['breadthSec', 'high']),
  K: C('Leader on volume, no dilution: 15%+ over the 200-day, volume 1.6x the 50-day', 120, [['d200', '>=', 0.15], ['turn50', '>=', 1.6], ['dShares', '<=', 0.007]], ['turn50', 'high']),
  L: C('Pullback 27-49% under the 52-week high, 6-month RS not weak, volume expanding after a dry-up', 120, [['hi52', '>=', -0.49], ['hi52', '<=', -0.27], ['rs126', '>=', -0.2], ['dryPop', '>=', 2.0]], ['dryPop', 'high']),
  M: C('Buyback company (shares -3%+ in a year) not collapsing, on 1.34x volume', 120, [['dShares', '<=', -0.03], ['d200', '>=', -0.34], ['turn50', '>=', 1.34]], ['turn50', 'high']),
};
export const candOk = (c, f) => c.when.every(([k, side, cut]) => ok(f[k]) && (side === '>=' ? f[k] >= cut : f[k] <= cut));

// ================= STAGE 2 RULES: PRE-REGISTERED 24 Oct 2026, after stage 1 (data/squad7-dna.json) and the older-half screen
// (data/squad7-screen.json), BEFORE any newer-half (2024-26) number was computed. One version each; library ids SQ7-*; the same text is
// written into data/strategy-library.json by squad7-lab.mjs before its first computation.
// CHOSEN: the 5 candidates whose older-half edge over the average stock was positive and positive in 3+ of 4 older semesters (H, B, M, A,
// G). NOT chosen: C, D, E, F, K, L (edge <= 0 in the older half), I (edge +0.3%, 2 of 4 semesters), J (edge +1.9% but 13% worse than
// the same stocks on their other days). None of the chosen reached block t 2.5 even in the older half (best 1.74): a pass is unlikely.
// COMMON: universe = liquid at the close of t (close >= 5 USD, 20-session average traded value >= 5M USD; dead stocks included); every
// feature known at that close (squad7-core.mjs priceFeatures / sectorFeatures / sharesChange / earnFeatures); at most 10 signals a day in
// the rank order given; buy the next open, sell the close of session t + hold; one open trade per stock per rule; 0.8% cost (1.2%
// stress); judged at the tier-2 standard (value-core judge, halves = signal before / from 2024-01-01, AUD-1 capped yardstick). Signals
// from session 20 of the window (a feature that is not yet known simply fails the rule).
const RX = (c, name, rule, evidence, lib) => ({ ...c, name, rule, evidence, lib });
export const RULES = {
  'SQ7-DEEPGAP': RX(CANDIDATES.H, 'Beaten-down stock (33%+ under its 200-day) that gapped up 3%+ in the last month and is not diluting (hold 20)',
    'Close >= 33% under its 200-day average (d200 <= -0.33); at least one opening gap of +3% or more in the last 20 sessions (gapUp20 >= 1); share count up no more than 0.8% in a year (dShares <= 0.008, both counts known 30 days late). Rank: deepest under the 200-day first; max 10 a day. Hold 20 sessions.',
    'stage 1 (W20, +30% in 20 sessions): d200 bottom decile lift 1.75 with winners 21.3% vs losers 12.9% of liquid stock-days (population 3.1% / 3.2%); gapUp20 >= 2 lift 1.55; dilution top decile lift 1.29 but losers 8.1% > winners 5.8%, so dilution is excluded. Older-half screen: 312 trades, average +5.1% after 0.8%, edge over the average stock +3.0%, all 4 older semesters positive, block t 1.63.',
    'D2-004 (deep under the 200-day + a down day + 5-day loss: rejected), M8 (1-year low + heavy volume + no dilution: failed discovery), DEC-CRASH (crashed 50%+ and stabilising: paper), S2 / C-NSI1 (dilution avoid). New: the recent gap-up (buyers showing up) inside a deep reset, dilution excluded.'),
  'SQ7-DEEPEARN': RX(CANDIDATES.B, 'Beaten-down stock (33%+ under its 200-day) with its next report near (59-85 days since the last) (hold 20)',
    'Close >= 33% under its 200-day average; the last earnings report on the Nasdaq calendar was 59 to 85 calendar days before the signal close (the next report usually falls inside the 20-session hold). Rank: deepest under the 200-day first; max 10 a day. Hold 20 sessions.',
    'stage 1 (W20): earnDays 59-85 deciles have winners 3.4-4.7% vs losers 2.2-2.8% and a forward return of +0.7% to +1.5% (population -0.7%); d200 bottom decile as above. Older-half screen: 341 trades, average +4.8%, edge +2.6%, 3 of 4 semesters positive, block t 1.21.',
    'ANOM-EAP (earnings-announcement premium alone: rejected), E19 (queued), D2-004 (deep reset + down day: rejected). New: the pre-report window only inside a deep reset.'),
  'SQ7-BUYBACKVOL': RX(CANDIDATES.M, 'Buyback company (share count down 3%+ in a year) not collapsing, on 1.34x volume (hold 120)',
    'Share count down 3% or more over a year (dShares <= -0.03, known 30 days late); close no more than 34% under its 200-day average (d200 >= -0.34); today\'s volume >= 1.34x its 50-day average (turn50 >= 1.34). Rank: highest volume ratio first; max 10 a day. Hold 120 sessions.',
    'stage 1 (W120, +100% in 120 sessions): shrinking share count bottom decile has the lowest loser rate (2.2% vs 8.7% population) and a forward return of +1.6% vs -4.2%; turn50 top decile lift 1.83; d200 under -34% carries 36% losers, so it is excluded. Older-half screen: 731 trades, average +2.8%, edge +2.2%, all 4 older semesters positive (the last one only 9 trades), block t 1.74.',
    'ANOM-NSI (shrinking share count, lowest 10%, alone: rejected), V17 net payout yield (queued), E8 buyback announcements (queued). New: buyback + not collapsing + a volume day as the timing trigger.'),
  'SQ7-DEEPNODIL': RX(CANDIDATES.A, 'Beaten-down stock (33%+ under its 200-day) that is not diluting (hold 20)',
    'Close >= 33% under its 200-day average; share count up no more than 0.3% in a year (dShares <= 0.003, known 30 days late). Rank: deepest under the 200-day first; max 10 a day. Hold 20 sessions.',
    'stage 1 (W20): d200 bottom decile winners 21.3% vs losers 12.9%; dShares <= 0.003 deciles have fewer losers than winners. Older-half screen: 301 trades, average +1.8%, edge +1.7%, 3 of 4 semesters positive, block t 0.94.',
    'D2-004 (rejected), M8 (failed discovery), ANOM-NSI (rejected), S2 (dilution avoid). New: the deep reset filtered by no dilution, no volume or down-day trigger.'),
  'SQ7-LAGEARN': RX(CANDIDATES.G, 'Sector laggard under its 200-day with its next report near (hold 20)',
    '59-85 calendar days since the last earnings report; 3-month return 10%+ under its sector median (rsSec <= -0.10, SIC 2-digit, 6+ liquid members); close under its 200-day average. Rank: furthest behind its sector first; max 10 a day. Hold 20 sessions.',
    'stage 1 (W20): rsSec bottom decile lift 1.61, winners 14.5% vs losers 10.6%, forward +0.6% vs -0.7%; earnDays 59-85 as above. Older-half screen: 610 trades, average +2.1%, edge +1.5%, 3 of 4 semesters positive, block t 1.32.',
    'ANOM-EAP (rejected), D2-001 / D2-002 (industry-relative losers: not proven). New: the sector laggard only inside the pre-report window.'),
};
export const IDS = Object.keys(RULES);
export const ruleOk = (id, f) => RULES[id].when.every(([k, side, cut]) => ok(f[k]) && (side === '>=' ? f[k] >= cut : f[k] <= cut));

// ================= paper board + library =================
export function boardStats(rows) { const net = rows.map(r => capG(r.g) - COST), win = net.filter(x => x > 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  return { n: rows.length, days: new Set(rows.map(r => r.d)).size, stocks: new Set(rows.map(r => r.sym)).size, win: rows.length ? r4(win.length / rows.length) : null, avg: rows.length ? r4(sum(net) / rows.length) : null,
    edge: rows.filter(r => ok(r.c)).length ? r4(mean(rows.filter(r => ok(r.c)).map(r => capG(r.g) - r.c))) : null }; }
export const paperReady = (s) => s.n >= 30 && s.days >= 10 && s.avg > 0;
export function preRegister(LB, date = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, a] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Winner DNA (Squad 7)', name: a.name, explain: a.rule + ' Evidence (older half only): ' + a.evidence,
      status: 'pre-registered ' + date + ' (squad 7 lab); 5-year one-shot pending', agent: 'squad7', kind: 'buy', hold: a.hold, libraryCheck: a.lib,
      note: 'Pre-registered ' + date + ' after the stage-1 discovery on the OLDER half only (data/squad7-dna.json) and BEFORE any newer-half number was computed (squad7-core.mjs RULES = the exact rule; one version). 5-year one-shot by squad7-lab.mjs, first complete verdict frozen in data/squad7-lab.json; forward paper lane (data/squad7-paper.jsonl) from 26 Oct 2026.' }); ch++; }
  if (ch) LB.updated = date; return ch; }
