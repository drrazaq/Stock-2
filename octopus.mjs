// OCTOPUS: many angles at once. Read-only research; never places an order.
// Instead of testing one rule at a time, this links 26 angles together (momentum, volume, quiet bases, gaps, the stock's
// industry, what its industry did today, company news from the SEC, earnings days, fast-mover memory, the market's mood) plus
// every PAIR of them (325 combinations, e.g. "volume surge AND industry hot", "near the high AND market rising"), and lets a
// model learn which combinations came before stocks that beat other stocks over the next 10 sessions.
//
// HONEST BY CONSTRUCTION (walk-forward): every week the model is retrained using ONLY the past (with a 10-session gap so no
// answer leaks in), then it picks its top 5 stocks for the next week. Those picks are judged on weeks the model had not seen.
// The model keeps relearning as the market changes. Fixed in advance (no tuning to make it pass): top 5, buy the next open,
// sell at the close 10 sessions later, 0.8% cost (1.2% stress), stocks that disappeared counted as -30%.
// PROMISING only if, on unseen weeks, in BOTH halves: it made money, it beat an average stock bought the same days by 0.5%+,
// profit factor 1.2+, still positive at 1.2% cost and without its 2 best trades, 30+ different weeks, no single-trade luck.
// Then it still needs a positive live paper record (data/octopus-paper.json) before it may become a buy.
//
// Input: the whole-market 5-year price cache (study-cache/grouped.json.gz, stocks that later collapsed included) and, when
// present, the SEC event cache (ev-cache/events-cache.json.gz). Output: data/octopus.json, data/octopus-paper.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const TG = local(env.TG_BASE) || 'https://api.telegram.org', OUT = 'data/octopus.json', PAPER = 'data/octopus-paper.json';
const pc = (x, d = 1) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
fs.mkdirSync('data', { recursive: true });
if (!fs.existsSync(PAPER)) fs.writeFileSync(PAPER, JSON.stringify({ picks: [] }));   // so the Sunday save step always finds the file
const P_ = { K: 5, HOLD: 10, STEP: 5, COST: 0.008, STRESS: 0.012, GONE: -0.3, MINPX: 3, MINDV: 2e6, TRAIN_MIN_WEEKS: 52, RIDGE: 0.05 };

const MODE = env.MODE === 'daily' ? 'daily' : 'study', MODEL = 'data/octopus-model.json', DAILY = 'data/octopus-daily.json';
// daily (weekday mornings, movers job): the fast-mover 5-year cache, refreshed every morning; the model trained on Sunday
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || (MODE === 'daily' ? 'fm-cache/fm.json.gz' : 'study-cache/grouped.json.gz'))).toString()); }
catch (e) { console.log('octopus: no price cache'); if (MODE === 'study') fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no price cache' })); process.exit(0); }
const D = Object.keys(store.days || {}).sort().slice(MODE === 'daily' ? -300 : 0), T = D.length;
if (T < (MODE === 'daily' ? 270 : 400)) { console.log('octopus: only ' + T + ' sessions'); if (MODE === 'study') fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'only ' + T + ' sessions' })); process.exit(0); }
if (!store.sic) { const ck = readJson('data/sec-ciks.json', {}); store.sic = {}; for (const [k, v] of Object.entries(ck)) if (Array.isArray(v) && v[1]) store.sic[k] = { c: v[1] }; }   // industry codes saved by the SEC job

// ---- prices as one typed array per field: [stock * T + session]
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const O = new Float32Array(N).fill(NaN), H = new Float32Array(N).fill(NaN), L = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; H[k] = x.h[j]; L[k] = x.l[j]; C[k] = x.c[j]; V[k] = x.v[j]; } });
const sic = store.sic || {}, IND = SYMS.map(s => sic[s] ? String(sic[s].c).slice(0, 3) : null);
store = null;
const spyI = SY.has('SPY') ? SY.get('SPY') : -1;
const spyC = (t) => spyI < 0 ? NaN : C[spyI * T + t];
const spyAbove50 = new Int8Array(T); if (spyI >= 0) { let s = 0, n = 0; for (let t = 0; t < T; t++) { const c = spyC(t); if (!isFinite(c)) continue; s += c; n++; if (t >= 50 && isFinite(spyC(t - 50))) { s -= spyC(t - 50); n--; } spyAbove50[t] = n >= 45 ? (c > s / n ? 1 : -1) : 0; } }

// ---- SEC events by stock -> session index when the public could know them (by that session's close)
const EV = new Map();
try { const ev = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.EV_CACHE || 'ev-cache/events-cache.json.gz')).toString());
  const tOf = new Map(D.map((d, t) => [d, t])), GOOD = new Set(['CONTRACT', 'ACQUIRED', 'ACTIVIST', 'BIO_NEWS', 'FDA_APPROVAL', 'FDA_NEW_USE']), BAD = new Set(['CONTRACT_END', 'RESTRUCTURE', 'DELIST', 'DILUTION', 'AUDITOR', 'RESTATE', 'OFFERING']);
  const sessOf = (p) => { const d = p.slice(0, 10), hm = p.length >= 16 ? p.slice(11, 16) : '00:00'; let t = tOf.get(d); if (t !== undefined) return hm >= '16:00' ? t + 1 : t;
    for (let k = 1; k < 6; k++) { const x = new Date(Date.parse(d + 'T12:00:00Z') + k * 864e5).toISOString().slice(0, 10); if (tOf.has(x)) return tOf.get(x); } return null; };
  for (const [s, S] of Object.entries(ev.syms || {})) { if (!SY.has(s)) continue; const a = []; for (const e of S.ev || []) { const t = sessOf(e.p); if (t === null || t >= T) continue; const f = String(e.f).split(',');
      a.push({ t, g: f.some(x => GOOD.has(x)) ? 1 : 0, b: f.some(x => BAD.has(x)) ? 1 : 0, e: f.includes('EARN') ? 1 : 0 }); } if (a.length) EV.set(SY.get(s), a); }
} catch (e) { /* no event cache: fall back to the last 10 days of events saved by the weekday SEC job (daily mode) */
  const ER = readJson('data/events-recent.json', null), tOf = new Map(D.map((d, t) => [d, t])), GOOD = new Set(['CONTRACT', 'ACQUIRED', 'ACTIVIST', 'BIO_NEWS', 'FDA_APPROVAL', 'FDA_NEW_USE']), BAD = new Set(['CONTRACT_END', 'RESTRUCTURE', 'DELIST', 'DILUTION', 'AUDITOR', 'RESTATE', 'OFFERING']);
  for (const e of (ER && ER.events) || []) { if (!SY.has(e.sym) || !e.p) continue; const d = String(e.p).slice(0, 10), hm = String(e.p).length >= 16 ? String(e.p).slice(11, 16) : '00:00'; let t = tOf.get(d); if (t === undefined) continue; if (hm >= '16:00') t++; if (t >= T) continue;
    const f = String(e.f).split(','), i = SY.get(e.sym); if (!EV.has(i)) EV.set(i, []); EV.get(i).push({ t, g: f.some(x => GOOD.has(x)) ? 1 : 0, b: f.some(x => BAD.has(x)) ? 1 : 0, e: f.includes('EARN') ? 1 : 0 }); } }

// ---- the 26 angles (all known at the close of session t)
const FN = ['1 day move', '5 day move', '1 month move', '3 month move', '6 month move', 'distance from the 1 year high', 'distance above the 1 year low',
  'volume today vs normal', 'volume this week vs normal', 'quiet range (10 vs 50 day)', 'daily swing size', 'close near the day high', 'opening gap today',
  'above the 50 day average', 'above the 200 day average', 'share price level', 'money traded per day', 'industry hot this month', 'stronger than its industry',
  'industry move today', 'stock vs its industry today', 'good SEC news this week', 'bad SEC news this month', 'earnings this week', 'share of up days (2 weeks)', 'biggest 1-day jump this month'];
const NF = FN.length, MKT = [0, 1, 2, 5, 7];   // angles also crossed with the market's mood (S&P 500 above / below its 50 day average)
const NT = 1 + NF + NF + NF * (NF - 1) / 2 + MKT.length;
const TERM = ['base']; for (let a = 0; a < NF; a++) TERM.push(FN[a]); for (let a = 0; a < NF; a++) TERM.push(FN[a] + ' (extreme either way)');
for (let a = 0; a < NF; a++) for (let b = a + 1; b < NF; b++) TERM.push(FN[a] + ' + ' + FN[b]); for (const a of MKT) TERM.push(FN[a] + ' + market rising');

function rawRow(i, t) {
  const b = i * T, c = C[b + t]; if (!(c >= P_.MINPX) || !isFinite(C[b + t - 1]) || !isFinite(O[b + t])) return null;
  let dv = 0, n20 = 0; for (let k = t - 19; k <= t; k++) if (isFinite(C[b + k])) { dv += C[b + k] * V[b + k]; n20++; } if (n20 < 15) return null; dv /= n20; if (dv < P_.MINDV) return null;
  const back = (k) => { for (let j = t - k; j >= t - k - 3 && j >= 0; j--) if (isFinite(C[b + j])) return C[b + j]; return NaN; };
  let hi = -Infinity, lo = Infinity, nh = 0; for (let k = Math.max(0, t - 251); k <= t; k++) if (isFinite(H[b + k])) { if (H[b + k] > hi) hi = H[b + k]; if (L[b + k] < lo) lo = L[b + k]; nh++; }
  let v50 = 0, n50 = 0, r50 = 0, r10 = 0, n10 = 0, v5 = 0, n5 = 0, m50 = 0, m200 = 0, n200 = 0, ups = 0, nu = 0, jmp = 0;
  for (let k = t - 49; k <= t; k++) { const kk = b + k; if (!isFinite(C[kk])) continue; v50 += V[kk]; n50++; m50 += C[kk]; const rg = (H[kk] - L[kk]) / C[kk]; r50 += rg; if (k > t - 10) { r10 += rg; n10++; } if (k > t - 5) { v5 += V[kk]; n5++; } }
  for (let k = t - 199; k <= t; k++) if (k >= 0 && isFinite(C[b + k])) { m200 += C[b + k]; n200++; }
  for (let k = t - 19; k <= t; k++) { const p = C[b + k - 1], q = C[b + k]; if (isFinite(p) && isFinite(q) && p > 0) { const r = q / p - 1; if (k > t - 10) { nu++; if (r > 0) ups++; } if (r > jmp) jmp = r; } }
  if (n50 < 35) return null;
  const f = new Float64Array(NF), pv = C[b + t - 1];
  f[0] = c / pv - 1; f[1] = c / back(5) - 1; f[2] = c / back(20) - 1; f[3] = c / back(60) - 1; f[4] = c / back(126) - 1;
  f[5] = nh > 200 ? c / hi - 1 : NaN; f[6] = nh > 200 ? c / lo - 1 : NaN; f[7] = V[b + t] / (v50 / n50); f[8] = (v5 / n5) / (v50 / n50);
  f[9] = n10 ? (r10 / n10) / (r50 / n50) : NaN; f[10] = r50 / n50; f[11] = H[b + t] > L[b + t] ? (c - L[b + t]) / (H[b + t] - L[b + t]) : 0.5; f[12] = O[b + t] / pv - 1;
  f[13] = c / (m50 / n50) - 1; f[14] = n200 >= 180 ? c / (m200 / n200) - 1 : NaN; f[15] = Math.log(c); f[16] = Math.log(dv);
  f[17] = NaN; f[18] = NaN; f[19] = NaN; f[20] = NaN;   // industry angles, filled per session below
  let g = 0, bd = 0, er = 0; const E = EV.get(i); if (E) for (const e of E) { if (e.t > t || e.t < t - 19) continue; if (e.b) bd = 1; if (e.t >= t - 4) { if (e.g) g = 1; if (e.e) er = 1; } }
  f[21] = g; f[22] = bd; f[23] = er; f[24] = nu ? ups / nu : NaN; f[25] = jmp;
  return f;
}
// forward result: buy the next open, sell the close HOLD sessions later; gone before then = last close then -30%
function fwd(i, t) {
  const b = i * T, e = O[b + t + 1]; if (!(e > 0)) return null; const z = t + P_.HOLD; if (z >= T) return null;
  if (isFinite(C[b + z])) return C[b + z] / e - 1;
  let last = NaN, lt = -1; for (let k = t + 1; k <= z; k++) if (isFinite(C[b + k])) { last = C[b + k]; lt = k; }
  let later = false; for (let k = z + 1; k < Math.min(T, z + 15); k++) if (isFinite(C[b + k])) { later = true; break; }
  if (later && lt >= 0) return last / e - 1; if (lt < 0) return null; if (z + 15 >= T) return null;
  return Math.max(-1, last / e - 1 + P_.GONE);
}
const rankCol = (vals) => { const idx = []; for (let k = 0; k < vals.length; k++) if (isFinite(vals[k])) idx.push(k); idx.sort((a, b) => vals[a] - vals[b]);
  const out = new Float64Array(vals.length); let k = 0; while (k < idx.length) { let j = k; while (j + 1 < idx.length && vals[idx[j + 1]] === vals[idx[k]]) j++; const r = idx.length > 1 ? ((k + j) / 2) / (idx.length - 1) - 0.5 : 0; for (let q = k; q <= j; q++) out[idx[q]] = r; k = j + 1; } return out; };
function expand(f, mk, x) { let p = 0; x[p++] = 1; for (let a = 0; a < NF; a++) x[p++] = f[a]; for (let a = 0; a < NF; a++) x[p++] = f[a] * f[a] - 1 / 12;
  for (let a = 0; a < NF; a++) for (let b = a + 1; b < NF; b++) x[p++] = f[a] * f[b] * 4; for (const a of MKT) x[p++] = f[a] * mk; }

// one session -> ranked angles for every eligible stock
function session(t, needFwd) {
  const ids = [], raws = []; for (let i = 0; i < NS; i++) { if (i === spyI) continue; const f = rawRow(i, t); if (f) { ids.push(i); raws.push(f); } }
  if (ids.length < 50) return null;
  const sum = {}, sum1 = {}, cnt = {}; let m20 = 0, m1 = 0; for (let k = 0; k < ids.length; k++) { m20 += raws[k][2]; m1 += raws[k][0]; const g = IND[ids[k]]; if (!g) continue; sum[g] = (sum[g] || 0) + raws[k][2]; sum1[g] = (sum1[g] || 0) + raws[k][0]; cnt[g] = (cnt[g] || 0) + 1; }
  m20 /= ids.length; m1 /= ids.length;
  for (let k = 0; k < ids.length; k++) { const g = IND[ids[k]]; if (g && cnt[g] >= 5) { const a20 = sum[g] / cnt[g], a1 = sum1[g] / cnt[g]; raws[k][17] = a20 - m20; raws[k][18] = raws[k][2] - a20; raws[k][19] = a1 - m1; raws[k][20] = raws[k][0] - a1; } }
  const F = ids.map(() => new Float64Array(NF)); for (let a = 0; a < NF; a++) { const r = rankCol(raws.map(x => x[a])); for (let k = 0; k < ids.length; k++) F[k][a] = r[k]; }
  let y = null, ret = null; if (needFwd) { ret = ids.map(i => fwd(i, t)); y = rankCol(ret.map(v => v === null ? NaN : v)); }
  return { t, ids, F, ret, y, mk: spyAbove50[t] * 0.5 };
}
// ridge solve (Cholesky) of (A + lam*I) w = bvec, base term not penalised
function solve(A, bv, lam) {
  const n = NT, M = new Float64Array(n * n); for (let k = 0; k < n * n; k++) M[k] = A[k]; for (let k = 1; k < n; k++) M[k * n + k] += lam;
  for (let j = 0; j < n; j++) { let s = M[j * n + j]; for (let k = 0; k < j; k++) s -= M[j * n + k] * M[j * n + k]; if (!(s > 1e-12)) s = 1e-12; const d = Math.sqrt(s); M[j * n + j] = d;
    for (let i = j + 1; i < n; i++) { let q = M[i * n + j]; for (let k = 0; k < j; k++) q -= M[i * n + k] * M[j * n + k]; M[i * n + j] = q / d; } }
  const z = new Float64Array(n); for (let i = 0; i < n; i++) { let s = bv[i]; for (let k = 0; k < i; k++) s -= M[i * n + k] * z[k]; z[i] = s / M[i * n + i]; }
  const w = new Float64Array(n); for (let i = n - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < n; k++) s -= M[k * n + i] * w[k]; w[i] = s / M[i * n + i]; } return w;
}
const XtX = new Float64Array(NT * NT), Xty = new Float64Array(NT), x = new Float64Array(NT); let nTrain = 0, wTrain = 0;
function addTrain(S) { for (let k = 0; k < S.ids.length; k++) { if (!isFinite(S.y[k]) || S.ret[k] === null) continue; expand(S.F[k], S.mk, x); const yk = S.y[k];
    for (let a = 0; a < NT; a++) { const xa = x[a]; if (xa === 0) continue; Xty[a] += xa * yk; const row = a * NT; for (let b2 = a; b2 < NT; b2++) XtX[row + b2] += xa * x[b2]; } nTrain++; } wTrain++; }
const full = () => { const A = new Float64Array(NT * NT); for (let a = 0; a < NT; a++) for (let b2 = a; b2 < NT; b2++) A[a * NT + b2] = A[b2 * NT + a] = XtX[a * NT + b2]; return A; };
const predict = (w, S) => S.F.map(f => { expand(f, S.mk, x); let s = 0; for (let a = 0; a < NT; a++) s += w[a] * x[a]; return s; });

// ---- DAILY: rank today's market with the model trained on Sunday; log the top 5 as live paper picks and score finished ones
if (MODE === 'daily') {
  const M = readJson(MODEL, null), ST = readJson(OUT, {}); if (!M || !Array.isArray(M.w) || M.w.length !== NT) { console.log('octopus daily: no trained model yet (Sunday)'); process.exit(0); }
  const today = D[T - 1], DP = readJson(DAILY, { picks: [] }), tOf = new Map(D.map((d, t) => [d, t]));
  for (const p of DP.picks) { if (p.done) continue; const t = tOf.get(p.d); if (t === undefined) { if (p.d < D[0]) p.done = true; continue; } if (!SY.has(p.sym) || t + P_.HOLD >= T) continue; const g = fwd(SY.get(p.sym), t); if (g === null) continue; p.g = +(g - P_.COST).toFixed(4); p.done = true; }
  let top = []; if (!DP.picks.some(p => p.d === today)) { const S = session(T - 1, false); if (S) { const sc = predict(Float64Array.from(M.w), S); top = S.ids.map((i, k) => ({ sym: SYMS[i], sc: sc[k] })).sort((a, b) => b.sc - a.sc).slice(0, P_.K); for (const z of top) DP.picks.push({ d: today, sym: z.sym, score: +z.sc.toFixed(4), done: false }); } }
  DP.picks = DP.picks.slice(-2000); const dn = DP.picks.filter(p => p.done && isFinite(p.g));
  DP.record = { n: dn.length, avg: mean(dn.map(p => p.g)), win: dn.length ? dn.filter(p => p.g > 0).length / dn.length : null, days: new Set(dn.map(p => p.d)).size }; DP.updated = new Date().toISOString(); DP.model = M.trainedTo;
  fs.writeFileSync(DAILY, JSON.stringify(DP));
  const rec = DP.record, pass = ST.verdict === 'PROMISING', live = pass && rec.n >= 30 && rec.days >= 10 && rec.avg > 0;
  const msg = ['OCTOPUS DAILY ' + today + ' (model trained to ' + M.trainedTo + '; 5-year test: ' + (ST.verdict || 'not run') + ')',
    'Top 5 of the whole market today: ' + (top.length ? top.map(z => z.sym).join(', ') : 'already logged') + ' (bought next open, sold 10 sessions later, on paper).',
    'Live paper record: ' + (rec.n ? rec.n + ' picks over ' + rec.days + ' days, ' + pc(rec.avg) + ' a trade, ' + Math.round(rec.win * 100) + '% won' : 'first results in 2 weeks') + '.',
    live ? 'Both gates passed: these may be considered as buys (your stop, your halal check, your decision).' : 'Not a buy list yet: ' + (pass ? 'needs 30+ positive live paper picks over 10+ days.' : 'the 5-year test has not passed.')];
  console.log(msg.join('\n'));
  if (pass && env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n'), disable_web_page_preview: true }) }).catch(() => {});
  process.exit(0);
}

// ---- walk forward, one session a week
const t0 = Date.now(), first = 252, dates = []; for (let t = first; t + P_.HOLD < T - 1; t += P_.STEP) dates.push(t);
const pending = [], trades = [], ctrl = [], deciles = [];
for (const t of dates) {
  while (pending.length && pending[0].t + P_.HOLD + 1 <= t) addTrain(pending.shift());   // only weeks whose 10 sessions finished before t
  const S = session(t, true); if (!S) continue;
  if (wTrain >= P_.TRAIN_MIN_WEEKS) {
    const w = solve(full(), Xty, P_.RIDGE * nTrain / 12), sc = predict(w, S), ord = S.ids.map((_, k) => k).filter(k => S.ret[k] !== null).sort((a, b) => sc[b] - sc[a]);
    for (const k of ord.slice(0, P_.K)) trades.push({ t, s: SYMS[S.ids[k]], g: S.ret[k], spy: isFinite(spyC(t + 1)) && isFinite(spyC(t + P_.HOLD)) ? spyC(t + P_.HOLD) / spyC(t + 1) - 1 : null });
    ctrl.push({ t, g: mean(ord.map(k => S.ret[k])) });
    const dec = new Array(10).fill(0).map(() => []); ord.forEach((k, r) => dec[9 - Math.min(9, Math.floor(r * 10 / ord.length))].push(S.ret[k])); deciles.push({ t, d: dec.map(a => mean(a)) });   // d[9] = best rated
  }
  pending.push(S);
  if (dates.indexOf(t) % 20 === 0) console.log('octopus: ' + D[t] + ' | trained on ' + wTrain + ' weeks, ' + nTrain + ' stock-weeks | ' + Math.round((Date.now() - t0) / 1000) + 's');
}
while (pending.length) { const S = pending.shift(); if (S.t + P_.HOLD < T - 1) addTrain(S); }

// ---- judge the unseen picks
const mid = trades.length ? trades[Math.floor(trades.length / 2)].t : 0;
function stats(a, cost) { if (!a.length) return { n: 0 }; const p = a.map(z => z.g - cost), w = p.filter(z => z > 0), l = p.filter(z => z <= 0), sm = z => z.reduce((u, v) => u + v, 0);
  const sp = a.filter(z => z.spy !== null).map(z => z.spy), srt = [...p].sort((u, v) => v - u);
  return { n: p.length, win: w.length / p.length, avg: sm(p) / p.length, pf: l.length && sm(l) < 0 ? sm(w) / -sm(l) : w.length ? 99 : null, spy: sp.length ? mean(sp) : null,
    bestShare: sm(w) > 0 ? Math.max(...w) / sm(w) : null, noTop2: srt.length > 2 ? sm(srt.slice(2)) / (srt.length - 2) : null, worst: Math.min(...p), days: new Set(a.map(z => z.t)).size }; }
const half = (a, h) => a.filter(z => h === 'older' ? z.t < mid : z.t >= mid);
const R = {}; for (const h of ['older', 'newer']) { R[h] = stats(half(trades, h), P_.COST); R[h + 'Stress'] = stats(half(trades, h), P_.STRESS); R[h + 'Avg'] = mean(half(ctrl, h).map(z => z.g - P_.COST));
  const dz = half(deciles, h); R[h + 'Deciles'] = new Array(10).fill(0).map((_, j) => mean(dz.map(z => z.d[j]).filter(v => v !== null && isFinite(v)))); }
const why = []; let verdict = 'PROMISING';
if (!(R.older.n >= 100 && R.newer.n >= 100)) { verdict = 'NOT PROVEN'; why.push('too few unseen picks (' + (R.older.n || 0) + ' / ' + (R.newer.n || 0) + ')'); }
else { for (const h of ['older', 'newer']) { if (!(R[h].avg > 0)) why.push('lost money in the ' + h + ' unseen half'); if (!(R[h].avg > (R[h + 'Avg'] || 0) + 0.005)) why.push('not 0.5%+ better than an average stock in the ' + h + ' half');
    if (!(R[h + 'Deciles'][9] > R[h + 'Deciles'][0])) why.push('its best-rated tenth did not beat its worst-rated tenth (' + h + ' half)'); }
  if (!(R.newer.pf >= 1.2)) why.push('profit factor ' + (R.newer.pf || 0).toFixed(2) + ', under 1.2'); if (!(R.newerStress.avg > 0)) why.push('loses at 1.2% cost');
  if (!(R.newer.noTop2 > 0)) why.push('loses without its 2 best trades'); if (R.newer.days < 30) why.push('only ' + R.newer.days + ' different weeks'); if (R.newer.bestShare > 0.2) why.push('one trade made over 20% of the profit');
  if (why.length) verdict = R.older.avg > 0 && R.newer.avg > 0 ? 'NOT PROVEN' : 'REJECTED'; }

// ---- the model on ALL finished weeks: what it learned (the angles that matter) and today's ranking
const wAll = solve(full(), Xty, P_.RIDGE * nTrain / 12), angles = [...wAll].map((v, k) => ({ k, v })).slice(1).sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 12).map(z => ({ term: TERM[z.k], weight: +z.v.toFixed(4), helps: z.v > 0 }));
const St = session(T - 1, false), now = []; if (St) { const sc = predict(wAll, St); St.ids.map((i, k) => ({ s: SYMS[i], sc: sc[k] })).sort((a, b) => b.sc - a.sc).slice(0, 10).forEach(z => now.push({ sym: z.s, score: +z.sc.toFixed(4) })); }

// ---- live paper record: log this week's top 5, score the ones whose 10 sessions have finished (judged on the newest prices)
const P = readJson(PAPER, { picks: [] }), today = D[T - 1];
if (!P.picks.some(p => p.d === today)) for (const z of now.slice(0, P_.K)) P.picks.push({ d: today, sym: z.sym, done: false });
const tOf = new Map(D.map((d, t) => [d, t]));
for (const p of P.picks) { if (p.done) continue; const t = tOf.get(p.d); if (t === undefined || !SY.has(p.sym) || t + P_.HOLD >= T) continue; const g = fwd(SY.get(p.sym), t); if (g === null) continue; p.g = +(g - P_.COST).toFixed(4); p.done = true; }
const doneP = P.picks.filter(p => p.done), rec = { n: doneP.length, avg: mean(doneP.map(p => p.g)), win: doneP.length ? doneP.filter(p => p.g > 0).length / doneP.length : null };
P.record = rec; P.updated = new Date().toISOString(); fs.writeFileSync(PAPER, JSON.stringify(P));

const out = { generatedAt: new Date().toISOString(), status: 'OK', from: D[first], to: today, rules: P_, angles: NF, terms: NT, unseenWeeks: deciles.length, verdict,
  why: why.join('; ') || 'beat an average stock on unseen weeks in both halves, at stress cost, without its 2 best trades. Next gate: 30+ positive live paper picks',
  results: R, learned: angles, now, paper: rec, version: 1, seconds: Math.round((Date.now() - t0) / 1000) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
fs.writeFileSync(MODEL, JSON.stringify({ version: 1, trainedTo: D[Math.max(0, T - 1 - P_.HOLD)], terms: NT, w: [...wAll].map(v => +v.toPrecision(6)) }));

const dl = (a) => a.map(v => v === null ? 'n/a' : pc(v - P_.COST, 1)).join(' ');
const msg = ['OCTOPUS (26 angles + 325 combinations, retrained every week, judged only on weeks it had not seen) ' + D[first] + ' to ' + today, '',
  'VERDICT: ' + verdict + '. ' + out.why + '.',
  'Unseen older half: ' + (R.older.n || 0) + ' picks, ' + pc(R.older.avg) + ' a trade vs an average stock ' + pc(R.olderAvg) + '.',
  'Unseen newer half: ' + (R.newer.n || 0) + ' picks, ' + pc(R.newer.avg) + ' a trade (' + Math.round((R.newer.win || 0) * 100) + '% won, profit factor ' + (R.newer.pf || 0).toFixed(2) + ') vs an average stock ' + pc(R.newerAvg) + '.',
  'Worst-rated tenth -> best-rated tenth (newer half): ' + dl(R.newerDeciles), '',
  'WHAT IT LEARNED (strongest angles, + helps, - hurts):', ...angles.slice(0, 6).map(a => (a.helps ? '+ ' : '- ') + a.term),
  '', 'Live paper record: ' + (rec.n ? rec.n + ' picks, ' + pc(rec.avg) + ' a trade, ' + Math.round(rec.win * 100) + '% won' : 'starts today, first results in 2 weeks') + '.',
  verdict === 'PROMISING' ? 'Top now (paper only until the live record passes): ' + now.slice(0, P_.K).map(z => z.sym).join(', ') : 'Not a buy list. Research only.'];
console.log(msg.join('\n'));
if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
