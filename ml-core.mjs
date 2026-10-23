// ML LAB CORE (ML-RANK1, pre-registered 24 Oct 2026 in ml-spec.json BEFORE any training). Pure functions, no network, no files.
// Used by ml-lab.mjs; tested by test/ml-core.test.mjs (feature lags, no look-ahead, walk-forward boundaries, stop and cost math, the
// tree learner and the ridge model). Every number here must equal ml-spec.json (the test checks it).
export const HOLD = 20, TOPK = 10, COST = 0.008, STRESS = 0.012, STOP = 0.35, MIN_PX = 5, MIN_DV = 5e6;
export const DEV_FROM = '2023-10-01', SPLIT = '2024-10-01', HOLDOUT_FROM = '2025-10-01', PAPER_FIRST = '2026-10-23';
export const GBDT = { trees: 200, maxDepth: 4, learningRate: 0.05, minLeaf: 400, rowSubsample: 0.3, colSubsample: 0.8, lambdaL2: 1.0, bins: 32, seed: 20261024 };
export const RIDGE_LAMBDA = 1000;
export const FEATURES = ['r5', 'r20', 'r60', 'r126', 'r252', 'mom12_1', 'dist52h', 'dist52l', 'vol20', 'vol60', 'adr20', 'volTrend', 'logDV20', 'intraday60', 'overnight60',
  'intradayShare60', 'upShare60', 'upShare252', 'dd126', 'gaps60', 'maxRet20', 'minRet20', 'r1', 'dma50', 'dma200', 'beta60', 'idioVol60', 'volRatio', 'logPrice', 'logMcap',
  'secRel60', 'secRel126', 'secMom126', 'fcfYield', 'revGrowth', 'debtEquity', 'fscore', 'spyVs200', 'breadth50', 'spyR20', 'spyVol20'];
export const NF = FEATURES.length, FI = Object.fromEntries(FEATURES.map((f, k) => [f, k]));
export const MARKET = ['spyVs200', 'breadth50', 'spyR20', 'spyVol20'];
export const RANKED = FEATURES.filter(f => !MARKET.includes(f));   // converted to cross-sectional percentile ranks on each decision date

const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
const sdOf = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((u, w) => u + (w - m) ** 2, 0) / (a.length - 1)); };

// ---------------- calendar ----------------
export const isoWeek = (d) => { const x = new Date(d + 'T00:00:00Z'), day = (x.getUTCDay() + 6) % 7; x.setUTCDate(x.getUTCDate() - day + 3); const y = x.getUTCFullYear(), f = new Date(Date.UTC(y, 0, 4));
  return y + '-' + String(1 + Math.round(((x - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0'); };
// the last session of each ISO week. The newest session is a week end only when nextSessionOf(it) (the NYSE calendar) is in a later week.
export function weekEnds(D, nextSessionOf) { const o = []; for (let t = 0; t < D.length; t++) { const nx = t + 1 < D.length ? D[t + 1] : (nextSessionOf ? nextSessionOf(D[t]) : null); if (nx && isoWeek(nx) !== isoWeek(D[t])) o.push(t); } return o; }
export const quarterOf = (d) => d.slice(0, 4) + 'Q' + (Math.floor((+d.slice(5, 7) - 1) / 3) + 1);

// ---------------- walk-forward schedule ----------------
// dec = decision session indices (sorted), D = dates. Retrain on the first decision date of every calendar quarter from DEV_FROM; each model
// predicts the decision dates of its own quarter only. Training rows of a retrain at session t0: rows whose label is known, t + HOLD <= t0.
export function schedule(dec, D, { devFrom = DEV_FROM, hold = HOLD } = {}) {
  const out = []; let cur = null;
  for (const t of dec) { if (D[t] < devFrom) continue; const q = quarterOf(D[t]); if (!cur || cur.q !== q) { cur = { q, t0: t, trainMaxT: t - hold, predict: [] }; out.push(cur); } cur.predict.push(t); }
  return out; }
export const labelKnown = (t, t0, hold = HOLD) => t + hold <= t0;
export const periodOf = (d) => d < DEV_FROM ? 'train' : d < SPLIT ? 'older' : d < HOLDOUT_FROM ? 'newer' : 'holdout';

// ---------------- prices ----------------
// a single stock's arrays (merged main/x rows, NaN = no price): o, h, l, c, v. The previous valid close at or before k (>= lo).
export const lastClose = (c, k, lo = 0) => { for (let q = k; q >= lo; q--) if (c[q] > 0) return c[q]; return null; };
// plain forward return for the target: buy the open of t+1, sell the close of t+hold (walks back to the last known close)
export function fwdReturn(s, t, hold = HOLD) { const T = s.c.length; if (t + hold >= T) return null; const e = s.o[t + 1]; if (!(e > 0)) return null; const x = lastClose(s.c, t + hold, t + 1); return x > 0 ? x / e - 1 : null; }
// the strategy's trade: same entry and exit, with the disaster stop. The first session whose low <= entry x (1 - stop) exits at the
// stop price, or at that session's open when it opened below it. Returns { g, stopped, x } or null.
export function tradeReturn(s, t, hold = HOLD, stop = STOP) {
  const T = s.c.length; if (t + hold >= T) return null; const e = s.o[t + 1]; if (!(e > 0)) return null; const sp = e * (1 - stop);
  for (let k = t + 1; k <= t + hold; k++) { const lo = s.l[k]; if (lo > 0 && lo <= sp) { const op = s.o[k]; const px = k > t + 1 && op > 0 && op < sp ? op : sp; return { g: px / e - 1, stopped: true, x: k }; } }
  const x = lastClose(s.c, t + hold, t + 1); return x > 0 ? { g: x / e - 1, stopped: false, x: t + hold } : null; }
export const net = (g, cost = COST) => g - cost;

// liquidity (main rows only): close >= 5 and the MEDIAN of the last 20 dollar volumes >= 5M (all 20 present)
export function liquid(mc, mv, t) { if (!(mc[t] >= MIN_PX) || t < 19) return false; const a = []; for (let k = t - 19; k <= t; k++) { const c = mc[k], v = mv[k]; if (!(c > 0) || !(v >= 0)) return false; a.push(c * v); }
  a.sort((x, y) => x - y); return (a[9] + a[10]) / 2 >= MIN_DV; }

// ---------------- features (the stock part; only indices <= t are read) ----------------
// s = { o, h, l, c, v } merged series; m = SPY closes (same index). Returns a Float64Array(NF) with NaN for unknown; the cross-sectional
// features (secRel*, secMom126), fundamentals, logMcap and the market features are filled by the caller.
export function stockFeatures(s, m, t) {
  const f = new Float64Array(NF).fill(NaN), c = s.c, o = s.o, h = s.h, l = s.l, v = s.v;
  const C = (k) => k >= 0 && c[k] > 0 ? c[k] : NaN, ret = (n) => { const a = C(t), b = C(t - n); return a / b - 1; };
  f[FI.r1] = ret(1); f[FI.r5] = ret(5); f[FI.r20] = ret(20); f[FI.r60] = ret(60); f[FI.r126] = ret(126); f[FI.r252] = ret(252);
  f[FI.mom12_1] = C(t - 21) / C(t - 252) - 1;
  if (!(c[t] > 0)) return f;
  // 52-week high / low and 6-month high
  { let hi = -Infinity, lo = Infinity, n = 0, hi6 = -Infinity; for (let k = Math.max(0, t - 251); k <= t; k++) { const z = c[k]; if (!(z > 0)) continue; n++; if (z > hi) hi = z; if (z < lo) lo = z; if (k >= t - 125 && z > hi6) hi6 = z; }
    if (n >= 200) { f[FI.dist52h] = c[t] / hi - 1; f[FI.dist52l] = c[t] / lo - 1; } if (t >= 125) f[FI.dd126] = c[t] / hi6 - 1; }
  // daily returns over windows
  const lr = (k) => k >= 1 && c[k] > 0 && c[k - 1] > 0 ? Math.log(c[k] / c[k - 1]) : NaN;
  const sdWin = (n, minN) => { const a = []; for (let k = t - n + 1; k <= t; k++) { const x = lr(k); if (isFinite(x)) a.push(x); } return a.length >= minN ? sdOf(a) : NaN; };
  f[FI.vol20] = sdWin(20, 15); f[FI.vol60] = sdWin(60, 45); f[FI.volRatio] = f[FI.vol20] / f[FI.vol60];
  { const a = []; let mx = -Infinity, mn = Infinity, n = 0; for (let k = t - 19; k <= t; k++) { if (k < 1) continue; if (h[k] > 0 && l[k] > 0 && c[k] > 0) a.push((h[k] - l[k]) / c[k]); if (c[k] > 0 && c[k - 1] > 0) { const r = c[k] / c[k - 1] - 1; n++; if (r > mx) mx = r; if (r < mn) mn = r; } }
    if (a.length >= 15) f[FI.adr20] = mean(a); if (n >= 15) { f[FI.maxRet20] = mx; f[FI.minRet20] = mn; } }
  { const dv = (a, b) => { const x = []; for (let k = a; k <= b; k++) if (k >= 0 && c[k] > 0 && v[k] >= 0) x.push(c[k] * v[k]); return x; }; const d20 = dv(t - 19, t), d60 = dv(t - 59, t);
    if (d20.length >= 15 && d60.length >= 45) { const m20 = mean(d20), m60 = mean(d60); if (m20 > 0 && m60 > 0) f[FI.volTrend] = Math.log(m20 / m60); }
    if (d20.length >= 15) { const s2 = [...d20].sort((x, y) => x - y), md = s2.length % 2 ? s2[s2.length >> 1] : (s2[s2.length / 2 - 1] + s2[s2.length / 2]) / 2; if (md > 0) f[FI.logDV20] = Math.log(md); } }
  { let id = 0, on = 0, n = 0, up = 0, nu = 0, gaps = 0, ng = 0; for (let k = t - 59; k <= t; k++) { if (k < 1) continue; if (o[k] > 0 && c[k] > 0 && c[k - 1] > 0) { id += Math.log(c[k] / o[k]); on += Math.log(o[k] / c[k - 1]); n++; if (Math.abs(o[k] / c[k - 1] - 1) >= 0.04) gaps++; ng++; } if (c[k] > 0 && c[k - 1] > 0) { nu++; if (c[k] > c[k - 1]) up++; } }
    if (n >= 45) { f[FI.intraday60] = id; f[FI.overnight60] = on; const den = Math.abs(id) + Math.abs(on); f[FI.intradayShare60] = den > 0 ? id / den : 0; } if (ng >= 45) f[FI.gaps60] = gaps; if (nu >= 45) f[FI.upShare60] = up / nu; }
  { let up = 0, nu = 0; for (let k = t - 251; k <= t; k++) { if (k < 1) continue; if (c[k] > 0 && c[k - 1] > 0) { nu++; if (c[k] > c[k - 1]) up++; } } if (nu >= 200) f[FI.upShare252] = up / nu; }
  const sma = (n) => { if (t - n + 1 < 0) return NaN; let s0 = 0, k0 = 0; for (let k = t - n + 1; k <= t; k++) if (c[k] > 0) { s0 += c[k]; k0++; } return k0 >= n * 0.9 ? s0 / k0 : NaN; };
  f[FI.dma50] = c[t] / sma(50) - 1; f[FI.dma200] = c[t] / sma(200) - 1;
  if (m) { const y = [], x = []; for (let k = t - 59; k <= t; k++) { if (k < 1) continue; if (c[k] > 0 && c[k - 1] > 0 && m[k] > 0 && m[k - 1] > 0) { y.push(c[k] / c[k - 1] - 1); x.push(m[k] / m[k - 1] - 1); } }
    if (y.length >= 45) { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0; for (let i = 0; i < y.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
      if (sxx > 0) { const b = sxy / sxx, a = my - b * mx; f[FI.beta60] = b; f[FI.idioVol60] = sdOf(y.map((yy, i) => yy - a - b * x[i])); } } }
  f[FI.logPrice] = Math.log(c[t]);
  return f; }

// the market features on t: SPY closes m, breadth = share of the universe above its 50-session average (computed by the caller)
export function marketFeatures(m, t, breadth) { const out = { spyVs200: NaN, breadth50: ok(breadth) ? breadth : NaN, spyR20: NaN, spyVol20: NaN };
  if (m && m[t] > 0) { let s0 = 0, n = 0; for (let k = t - 199; k <= t; k++) if (k >= 0 && m[k] > 0) { s0 += m[k]; n++; } if (n >= 180) out.spyVs200 = m[t] / (s0 / n) - 1;
    if (t >= 20 && m[t - 20] > 0) out.spyR20 = m[t] / m[t - 20] - 1; const a = []; for (let k = t - 19; k <= t; k++) if (k >= 1 && m[k] > 0 && m[k - 1] > 0) a.push(Math.log(m[k] / m[k - 1])); if (a.length >= 15) out.spyVol20 = sdOf(a); }
  return out; }

// cross-sectional percentile rank (0..1), NaN stays NaN; ties share the average rank
export function xsRank(vals) { const idx = []; for (let i = 0; i < vals.length; i++) if (isFinite(vals[i])) idx.push(i); const out = new Float64Array(vals.length).fill(NaN); if (!idx.length) return out;
  idx.sort((a, b) => vals[a] - vals[b]); const n = idx.length; let i = 0; while (i < n) { let j = i; while (j + 1 < n && vals[idx[j + 1]] === vals[idx[i]]) j++; const r = n > 1 ? ((i + j) / 2) / (n - 1) : 0.5; for (let k = i; k <= j; k++) out[idx[k]] = r; i = j + 1; } return out; }
// group-relative: value minus its group's mean (groups with >= minN members with a value), and the group mean itself
export function groupRel(vals, groups, minN = 5) { const sum = new Map(), cnt = new Map(); vals.forEach((v, i) => { const g = groups[i]; if (!g || !isFinite(v)) return; sum.set(g, (sum.get(g) || 0) + v); cnt.set(g, (cnt.get(g) || 0) + 1); });
  const rel = new Float64Array(vals.length).fill(NaN), gm = new Float64Array(vals.length).fill(NaN);
  vals.forEach((v, i) => { const g = groups[i]; if (!g || !(cnt.get(g) >= minN)) return; const m = sum.get(g) / cnt.get(g); gm[i] = m; if (isFinite(v)) rel[i] = v - m; }); return { rel, gm }; }
export function winsorize(vals, lo = 0.01, hi = 0.99) { const a = vals.filter(isFinite).sort((x, y) => x - y); if (a.length < 3) return vals.slice(); const q = (p) => a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))]; const L = q(lo), H = q(hi); return vals.map(v => isFinite(v) ? Math.min(H, Math.max(L, v)) : v); }

// F-score (quality.mjs / value-lab.mjs code, unchanged): Fv = fund cache .v, SHc = shares.json.gz .c
export function fscore(Fv, SHc, cik, y) { const c = Fv[cik]; if (!c || !c[y] || !c[y - 1] || !c[y - 2]) return null; const a = c[y], b = c[y - 1], z = c[y - 2];
  const num = (...v) => v.every(u => typeof u === 'number' && isFinite(u));
  const atYE = (yy) => { const r = SHc[cik]; if (!r) return null; let v = null; for (const [e, n] of r) { if (e <= yy + '-12-31' && e >= yy + '-07-01') v = n; } return v; };
  if (!num(a.ni, b.ni, a.cfo, a.ltd, b.ltd, a.acur, b.acur, a.gp, b.gp) || !(a.assets > 0 && b.assets > 0 && z.assets > 0) || !(a.lcur > 0 && b.lcur > 0)) return null;
  const rk = num(a.rev, b.rev) ? 'rev' : num(a.rev2, b.rev2) ? 'rev2' : null; if (!rk || !(a[rk] > 0 && b[rk] > 0)) return null;
  const s1 = atYE(y), s0 = atYE(y - 1); if (!(s1 > 0 && s0 > 0)) return null;
  const chk = [a.ni > 0, a.cfo > 0, a.ni / b.assets > b.ni / z.assets, a.cfo > a.ni, a.ltd / ((a.assets + b.assets) / 2) < b.ltd / ((b.assets + z.assets) / 2),
    a.acur / a.lcur > b.acur / b.lcur, s1 <= s0, a.gp / a[rk] > b.gp / b[rk], a[rk] / b.assets > b[rk] / z.assets];
  return chk.filter(Boolean).length; }
export const knownYear = (d) => { const y = +d.slice(0, 4), md = d.slice(5); return md >= '04-10' ? y - 1 : y - 2; };

// ---------------- random numbers (deterministic) ----------------
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------------- binning (cut points from the training rows only) ----------------
// X = Float32Array(N * NF) row-major. rows = training row ids. Returns edges[f] = sorted cut points (<= bins - 1). bin 0 = missing.
export function binEdges(X, nf, rows, bins = GBDT.bins, maxSample = 200000, seed = 1) {
  const R = rng(seed), take = rows.length > maxSample ? maxSample / rows.length : 1, edges = [];
  for (let f = 0; f < nf; f++) { const a = []; for (const r of rows) { if (take < 1 && R() > take) continue; const x = X[r * nf + f]; if (isFinite(x)) a.push(x); }
    a.sort((x, y) => x - y); const e = []; if (a.length) for (let k = 1; k < bins; k++) { const v = a[Math.min(a.length - 1, Math.floor(k * a.length / bins))]; if (!e.length || v > e[e.length - 1]) e.push(v); } edges.push(e); }
  return edges; }
// value -> bin: 0 missing, else 1 + number of cut points < value (1..bins)
export const binOf = (e, x) => { if (!isFinite(x)) return 0; let lo = 0, hi = e.length; while (lo < hi) { const m = (lo + hi) >> 1; if (e[m] < x) lo = m + 1; else hi = m; } return 1 + lo; };
export function binMatrix(X, nf, rows, edges) { const B = new Uint8Array(rows.length * nf); for (let j = 0; j < rows.length; j++) { const r = rows[j]; for (let f = 0; f < nf; f++) B[j * nf + f] = binOf(edges[f], X[r * nf + f]); } return B; }

// ---------------- gradient-boosted regression trees (squared error, histogram splits, depth-wise) ----------------
// B = Uint8Array(n * nf) binned rows (row-major), y = Float64Array(n). Returns { base, trees, gain (per feature), edges? }.
// A tree: { f: Int16Array, b: Uint8Array (go left when bin <= b, bins >= 1), ml: Uint8Array (missing goes left), L, R: Int16Array, v: Float64Array }.
export function trainGBDT(B, n, nf, y, P = GBDT) {
  const NB = P.bins + 1, R = rng(P.seed), pred = new Float64Array(n), base = mean(Array.from(y)) || 0; pred.fill(base);
  const trees = [], gain = new Float64Array(nf), res = new Float64Array(n), lam = P.lambdaL2;
  for (let m = 0; m < P.trees; m++) {
    for (let i = 0; i < n; i++) res[i] = y[i] - pred[i];
    const S = []; for (let i = 0; i < n; i++) if (R() < P.rowSubsample) S.push(i);
    const feats = []; for (let f = 0; f < nf; f++) if (R() < P.colSubsample) feats.push(f); if (!feats.length) feats.push(Math.floor(R() * nf));
    const tf = [], tb = [], tml = [], tL = [], tR = [], tv = [];
    const newNode = () => { tf.push(-1); tb.push(0); tml.push(1); tL.push(-1); tR.push(-1); tv.push(0); return tf.length - 1; };
    const root = newNode(); let active = [root]; const nodeOf = new Int32Array(S.length); // index into tree nodes; -1 = finished
    let sums = new Map([[root, (() => { let s = 0; for (const i of S) s += res[i]; return [s, S.length]; })()]]);
    for (let depth = 0; depth <= P.maxDepth && active.length; depth++) {
      if (depth === P.maxDepth) { for (const nd of active) { const [s, c] = sums.get(nd); tv[nd] = P.learningRate * s / (c + lam); } break; }
      const slot = new Map(active.map((nd, k) => [nd, k])), A = active.length, H = new Float64Array(A * nf * NB), Hc = new Float64Array(A * nf * NB);
      for (let j = 0; j < S.length; j++) { const nd = nodeOf[j]; if (nd < 0) continue; const k = slot.get(nd); if (k === undefined) continue; const i = S[j], r = res[i], base0 = k * nf * NB, row = i * nf;
        for (const f of feats) { const q = base0 + f * NB + B[row + f]; H[q] += r; Hc[q] += 1; } }
      const next = [], nextSums = new Map();
      for (let k = 0; k < A; k++) { const nd = active[k], [St, Ct] = sums.get(nd), parent = St * St / (Ct + lam); let best = 0, bf = -1, bb = 0, bml = 1, bl = null;
        if (Ct >= 2 * P.minLeaf) for (const f of feats) { const o0 = k * nf * NB + f * NB, ms = H[o0], mc = Hc[o0]; let ls = 0, lc = 0;
          for (let b = 1; b < NB - 1; b++) { ls += H[o0 + b]; lc += Hc[o0 + b]; const rs = St - ms - ls, rc = Ct - mc - lc;
            for (const mlft of [1, 0]) { const Ls = ls + (mlft ? ms : 0), Lc = lc + (mlft ? mc : 0), Rs = St - Ls, Rc = Ct - Lc; if (Lc < P.minLeaf || Rc < P.minLeaf) continue;
              const g = Ls * Ls / (Lc + lam) + Rs * Rs / (Rc + lam) - parent; if (g > best + 1e-12) { best = g; bf = f; bb = b; bml = mlft; bl = [Ls, Lc, Rs, Rc]; } } void rs; void rc; } }
        if (bf < 0) { tv[nd] = P.learningRate * St / (Ct + lam); continue; }
        gain[bf] += best; tf[nd] = bf; tb[nd] = bb; tml[nd] = bml; const l = newNode(), r = newNode(); tL[nd] = l; tR[nd] = r; next.push(l, r); nextSums.set(l, [bl[0], bl[1]]); nextSums.set(r, [bl[2], bl[3]]); }
      for (let j = 0; j < S.length; j++) { const nd = nodeOf[j]; if (nd < 0) continue; if (tf[nd] < 0) { nodeOf[j] = -1; continue; } const bin = B[S[j] * nf + tf[nd]]; nodeOf[j] = goLeft(bin, tb[nd], tml[nd]) ? tL[nd] : tR[nd]; }
      active = next; sums = nextSums; }
    const tree = { f: Int16Array.from(tf), b: Uint8Array.from(tb), ml: Uint8Array.from(tml), L: Int16Array.from(tL), R: Int16Array.from(tR), v: Float64Array.from(tv) };
    trees.push(tree); for (let i = 0; i < n; i++) pred[i] += treeOut(tree, B, i * nf); }
  return { base, trees, gain: Array.from(gain) }; }
const goLeft = (bin, b, ml) => bin === 0 ? ml === 1 : bin <= b;
export function treeOut(tr, B, off) { let nd = 0; while (tr.f[nd] >= 0) nd = goLeft(B[off + tr.f[nd]], tr.b[nd], tr.ml[nd]) ? tr.L[nd] : tr.R[nd]; return tr.v[nd]; }
export function predictGBDT(model, B, n, nf) { const out = new Float64Array(n); for (let i = 0; i < n; i++) { let s = model.base; for (const tr of model.trees) s += treeOut(tr, B, i * nf); out[i] = s; } return out; }
// compact JSON form (data/ml-model.json) and back
export const treesToJSON = (m) => ({ base: m.base, gain: m.gain, trees: m.trees.map(t => ({ f: Array.from(t.f), b: Array.from(t.b), ml: Array.from(t.ml), L: Array.from(t.L), R: Array.from(t.R), v: Array.from(t.v).map(x => +x.toPrecision(7)) })) });
export const treesFromJSON = (j) => ({ base: j.base, gain: j.gain, trees: j.trees.map(t => ({ f: Int16Array.from(t.f), b: Uint8Array.from(t.b), ml: Uint8Array.from(t.ml), L: Int16Array.from(t.L), R: Int16Array.from(t.R), v: Float64Array.from(t.v) })) });

// ---------------- ridge regression ----------------
// X Float32Array(N * nf), rows = training row ids, y aligned with rows. Standardize with the training mean / sd; missing = 0 after.
export function trainRidge(X, nf, rows, y, lambda = RIDGE_LAMBDA) {
  const mu = new Float64Array(nf), sd = new Float64Array(nf), cnt = new Float64Array(nf);
  for (const r of rows) for (let f = 0; f < nf; f++) { const x = X[r * nf + f]; if (isFinite(x)) { mu[f] += x; cnt[f]++; } }
  for (let f = 0; f < nf; f++) mu[f] = cnt[f] ? mu[f] / cnt[f] : 0;
  for (const r of rows) for (let f = 0; f < nf; f++) { const x = X[r * nf + f]; if (isFinite(x)) sd[f] += (x - mu[f]) ** 2; }
  for (let f = 0; f < nf; f++) sd[f] = cnt[f] > 1 && sd[f] > 0 ? Math.sqrt(sd[f] / (cnt[f] - 1)) : 1;
  const p = nf + 1, A = new Float64Array(p * p), bv = new Float64Array(p), z = new Float64Array(p);
  rows.forEach((r, j) => { z[0] = 1; for (let f = 0; f < nf; f++) { const x = X[r * nf + f]; z[f + 1] = isFinite(x) ? (x - mu[f]) / sd[f] : 0; } const yy = y[j];
    for (let a = 0; a < p; a++) { bv[a] += z[a] * yy; const za = z[a]; if (za === 0) continue; for (let b = a; b < p; b++) A[a * p + b] += za * z[b]; } });
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) A[a * p + b] = A[b * p + a];
  for (let a = 1; a < p; a++) A[a * p + a] += lambda;   // the intercept is not penalized
  return { mu: Array.from(mu), sd: Array.from(sd), w: solve(A, bv, p) }; }
function solve(A, b, n) { const M = Float64Array.from(A), x = Float64Array.from(b);
  for (let c = 0; c < n; c++) { let pv = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r * n + c]) > Math.abs(M[pv * n + c])) pv = r;
    if (pv !== c) { for (let k = 0; k < n; k++) { const t = M[c * n + k]; M[c * n + k] = M[pv * n + k]; M[pv * n + k] = t; } const t = x[c]; x[c] = x[pv]; x[pv] = t; }
    const d = M[c * n + c]; if (Math.abs(d) < 1e-12) continue; for (let r = c + 1; r < n; r++) { const fct = M[r * n + c] / d; if (!fct) continue; for (let k = c; k < n; k++) M[r * n + k] -= fct * M[c * n + k]; x[r] -= fct * x[c]; } }
  const out = new Array(n).fill(0); for (let r = n - 1; r >= 0; r--) { let s = x[r]; for (let k = r + 1; k < n; k++) s -= M[r * n + k] * out[k]; out[r] = Math.abs(M[r * n + r]) < 1e-12 ? 0 : s / M[r * n + r]; } return out; }
export function predictRidge(m, X, nf, r) { let s = m.w[0]; for (let f = 0; f < nf; f++) { const x = X[r * nf + f]; if (isFinite(x)) s += m.w[f + 1] * (x - m.mu[f]) / m.sd[f]; } return s; }

// ---------------- ranking and statistics ----------------
// the k best (highest score; ties by symbol) of candidates [{ id, sym, score }] with a finite score
export const topK = (cands, k = TOPK) => cands.filter(x => isFinite(x.score)).sort((a, b) => b.score - a.score || (a.sym < b.sym ? -1 : a.sym > b.sym ? 1 : 0)).slice(0, k);
export function spearman(a, b) { const n = a.length; if (n < 3) return null; const ra = xsRank(a), rb = xsRank(b); const x = [], y = []; for (let i = 0; i < n; i++) if (isFinite(ra[i]) && isFinite(rb[i])) { x.push(ra[i]); y.push(rb[i]); }
  if (x.length < 3) return null; const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null; }
export const tStat = (v) => { if (v.length < 2) return null; const m = mean(v), s = sdOf(v); return s > 0 ? m / (s / Math.sqrt(v.length)) : null; };
// the registered extra gates (ml-spec.json judging.extraGates). R = { older, newer } halfStat of ML and MOM; H = holdout halfStat of ML and MOM.
export function extraGates(ml, mom, hML, hMOM) { const why = [];
  for (const k of ['older', 'newer']) { const a = ml[k] || {}, b = mom[k] || {}; if (!(a.avg > b.avg && a.edge > b.edge)) why.push('does not beat the 12-1 momentum baseline in the ' + k + ' half (avg ' + pc(a.avg) + ' vs ' + pc(b.avg) + ', edge ' + pc(a.edge) + ' vs ' + pc(b.edge) + ')'); }
  if (!(hML && hML.avg > 0)) why.push('holdout: lost money after 0.8% cost (' + pc(hML && hML.avg) + ')');
  if (!(hML && hML.edge > 0)) why.push('holdout: not better than the average stock (edge ' + pc(hML && hML.edge) + ')');
  if (!(hML && hMOM && hML.avg > hMOM.avg)) why.push('holdout: not better than the momentum baseline (' + pc(hML && hML.avg) + ' vs ' + pc(hMOM && hMOM.avg) + ')');
  return why; }
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
