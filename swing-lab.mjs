// SWING LAB: 2-5 day trades, the user's goal (20 Oct 2026: "2-5% in 2-5 days"). Research only; no orders; no Telegram.
// Well-documented short-term effects NOT yet in the library, on LIQUID stocks only (close 10 USD+, 20-day average traded value
// 20M USD+: big names where a 2-5 day edge is not eaten by the spread), plus index/sector ETFs for the ETF rule.
// PRE-REGISTERED 20 Oct 2026, written before any result was seen. RUN ONCE AS WRITTEN (first verdict frozen, as in pattern-lab).
//   SW1 RSI(2) pullback in an uptrend (Connors): close above its 200-day average, 2-day RSI under 10. Sell at the first close above
//       the 5-day average, or after 5 sessions.
//   SW2 Short-term reversal (Jegadeesh 1990, Lehmann 1990): every session, the 20 liquid stocks above their 200-day with the worst
//       5-session return (at least -8%). Hold 5 sessions.
//   SW3 Three lower lows in an uptrend (Connors): above the 200-day, 3 sessions in a row each with a lower high and a lower low. Sell
//       at the first close above the 5-day average, or after 5 sessions.
//   SW4 10-day low in an uptrend: above the 200-day and up 20%+ over 6 months, close at its lowest close of 10 sessions. Hold 5.
//   SW5 ETF internal bar strength (IBS): index/sector ETFs in the cache (SPY QQQ IWM DIA and the XL* sectors), close above the 200-day,
//       (close - low) / (high - low) under 0.2. Sell at the first close with IBS above 0.8, or after 3 sessions.
// Entry: the next open. GATES (unchanged): 0.8% costs (stress 1.2%), older and newer half, date-clustered t at or above the higher of
// this study's luck bar and the league bar, must beat the average liquid stock bought the same day held the same days, the S&P 500
// over the same days and the same stock on its other days, must survive without its 2 best trades.
// FOR INFORMATION ONLY (never a pass): the result at 0.25% costs, i.e. a zero-commission broker and big orders. If a rule fails at 0.8%
// but works at 0.25%, the cost is what kills it, and that is a decision about the broker and the order size, not about the rule.
// Output: data/swing-lab.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, OUT = env.OUT || 'data/swing-lab.json', COST = 0.008, STRESS = 0.012, LOW = 0.0025;
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const PREV = J(OUT, {});
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('swing-lab: no price cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 400) { console.log('swing-lab: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), H = new Float32Array(NS * T).fill(NaN), L = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
// CX: closes of a stock AFTER it fell out of the cache's 3 USD / 1M USD filter (study-cache x rows, 22 Oct 2026). Used only to value an
// exit (a held stock that collapsed under 3 USD keeps its real price); never for an entry.
const CX = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; H[k] = x.h ? x.h[j] : NaN; L[k] = x.l ? x.l[j] : NaN; C[k] = x.c[j]; V[k] = x.v[j]; }  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; }}); store = null;
const spyI = SY.get('SPY'), ETF = new Set(['SPY', 'QQQ', 'IWM', 'DIA', 'XLK', 'XLF', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC']);
const DV = new Float32Array(NS * T).fill(NaN), MA200 = new Float32Array(NS * T).fill(NaN), MA5 = new Float32Array(NS * T).fill(NaN);
for (let i = 0; i < NS; i++) { const b = i * T; let s = 0, n = 0, s2 = 0, n2 = 0, s5 = 0, n5 = 0; const q = [], q2 = [], q5 = [];
  for (let t = 0; t < T; t++) { const c = C[b + t], v = V[b + t], x = isFinite(c) && isFinite(v) ? c * v : NaN;
    q.push(x); if (isFinite(x)) { s += x; n++; } if (q.length > 20) { const y = q.shift(); if (isFinite(y)) { s -= y; n--; } } if (n >= 15) DV[b + t] = s / n;
    q2.push(c); if (isFinite(c)) { s2 += c; n2++; } if (q2.length > 200) { const y = q2.shift(); if (isFinite(y)) { s2 -= y; n2--; } } if (n2 >= 190) MA200[b + t] = s2 / n2;
    q5.push(c); if (isFinite(c)) { s5 += c; n5++; } if (q5.length > 5) { const y = q5.shift(); if (isFinite(y)) { s5 -= y; n5--; } } if (n5 >= 5) MA5[b + t] = s5 / n5; } }
const liquid = (i, t) => C[i * T + t] >= 10 && DV[i * T + t] >= 2e7;
const upT = (i, t) => C[i * T + t] > MA200[i * T + t];
// exit simulation: buy the next open, sell at the close of the first session meeting exitFn (checked from the entry session on), or at
// the close of the last session; returns { g, h } with h = sessions held
function trade(i, t, maxH, exitFn) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + maxH >= T) return null; let last = null, h = 0;
  for (let k = t + 1; k <= t + maxH; k++) { if (isFinite(C[b + k])) { last = C[b + k]; h = k - t; if (exitFn && exitFn(i, k)) break; } else if (isFinite(CX[b + k])) { last = CX[b + k]; h = k - t; } }   // CX: price after it fell under 3 USD
  return last === null ? null : { g: last / e - 1, h }; }
function fwd(i, t, h) { const r = trade(i, t, h, null); return r ? r.g : null; }
const ctrlC = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlC) return ctrlC[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && liquid(i, t)) { const g = fwd(i, t, h); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[key] = v.length >= 30 ? mean(v) : null); };
const spyF = (t, h) => spyI === undefined ? null : fwd(spyI, t, h);
const START = 210, midT = Math.floor((START + T) / 2), ownC = {};
const own = (i, t, h) => { const half = t < midT ? 0 : 1, key = i + '_' + h + '_' + half; if (key in ownC) return ownC[key]; const v = []; for (let k = half ? midT : START; k < (half ? T - 1 : midT); k += 2) { if (Math.abs(k - t) <= h) continue; if (C[i * T + k] > 0 && DV[i * T + k] >= 1e6) { const g = fwd(i, k, h); if (g !== null && Math.abs(g) < 3) v.push(g); } } return (ownC[key] = v.length >= 30 ? mean(v) : null); };
const aboveMA5 = (i, k) => C[i * T + k] > MA5[i * T + k], ibsHi = (i, k) => { const h = H[i * T + k], l = L[i * T + k]; return h > l && (C[i * T + k] - l) / (h - l) > 0.8; };
function rsi2(i, t) { const b = i * T; let up = 0, dn = 0; for (let k = t - 13; k <= t; k++) { const d = C[b + k] - C[b + k - 1]; if (!isFinite(d)) return null; }
  // Wilder smoothing with period 2 over the last 14 sessions
  let au = 0, ad = 0; { const d = C[b + t - 13] - C[b + t - 14]; au = Math.max(d, 0); ad = Math.max(-d, 0); }
  for (let k = t - 12; k <= t; k++) { const d = C[b + k] - C[b + k - 1]; au = (au + Math.max(d, 0)) / 2; ad = (ad + Math.max(-d, 0)) / 2; } return ad === 0 ? 100 : 100 - 100 / (1 + au / ad); }
const trades = { SW1: [], SW2: [], SW3: [], SW4: [], SW5: [] }, counts = { SW1: 0, SW2: 0, SW3: 0, SW4: 0, SW5: 0 };
const add = (k, i, t, maxH, exitFn) => { counts[k]++; const r = trade(i, t, maxH, exitFn); if (!r || Math.abs(r.g) > 3) return; const c0 = ctrl(t, r.h), ob = own(i, t, r.h), sp = spyF(t, r.h); if (c0 === null || ob === null) return; trades[k].push({ t, s: SYMS[i], g: r.g, c: c0, ob, sp, h: r.h }); };
for (let t = START; t < T - 6; t++) { const rev = [];
  for (let i = 0; i < NS; i++) { const b = i * T, c = C[b + t]; if (!isFinite(c)) continue; const sym = SYMS[i];
    if (ETF.has(sym)) { const h = H[b + t], l = L[b + t]; if (upT(i, t) && h > l && (c - l) / (h - l) < 0.2) add('SW5', i, t, 3, ibsHi); continue; }
    if (!liquid(i, t) || !upT(i, t)) continue;
    const r2 = rsi2(i, t); if (r2 !== null && r2 < 10) add('SW1', i, t, 5, aboveMA5);
    if (H[b + t] < H[b + t - 1] && L[b + t] < L[b + t - 1] && H[b + t - 1] < H[b + t - 2] && L[b + t - 1] < L[b + t - 2] && H[b + t - 2] < H[b + t - 3] && L[b + t - 2] < L[b + t - 3]) add('SW3', i, t, 5, aboveMA5);
    if (C[b + t - 126] > 0 && c / C[b + t - 126] >= 1.2) { let lo = true; for (let k = t - 9; k < t; k++) if (!(C[b + k] > c)) { lo = false; break; } if (lo) add('SW4', i, t, 5, null); }
    const r5 = C[b + t - 5] > 0 ? c / C[b + t - 5] - 1 : null; if (r5 !== null && r5 <= -0.08) rev.push([i, r5]); }
  rev.sort((x, y) => x[1] - y[1]); for (const [i] of rev.slice(0, 20)) add('SW2', i, t, 5, null); }
// ---- statistics (date-clustered: one average per entry day, t over days)
const NV = 5, OWN_BAR = 2.4 + 0.1 * NV / 2, LG = J('data/agent-league.json', {}), LEAGUE_BAR = typeof LG.bar === 'number' ? LG.bar : null, BAR = Math.max(OWN_BAR, LEAGUE_BAR || 0);
const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = {}; for (const z of a) { const x = f(z); if (x === null || !isFinite(x)) continue; (o[z.t] = o[z.t] || []).push(x); } return Object.values(o).map(mean); };
const stat = (a, cost) => { if (a.length < 20) return { n: a.length };
  const v = byDay(a, z => z.g - cost - z.c), ov = byDay(a, z => typeof z.ob === 'number' ? z.g - z.ob : null), sv = byDay(a, z => typeof z.sp === 'number' ? z.g - cost - z.sp : null), p = a.map(z => z.g - cost).sort((x, y) => y - x);
  return { n: a.length, days: v.length, stocks: new Set(a.map(z => z.s)).size, held: +mean(a.map(z => z.h)).toFixed(1), avg: +mean(p).toFixed(4), ctrl: +mean(a.map(z => z.c)).toFixed(4), edge: +mean(v).toFixed(4), t: tOf(v), vsSpy: sv.length ? +mean(sv).toFixed(4) : null, tSpy: tOf(sv), vsOwn: ov.length ? +mean(ov).toFixed(4) : null, tOwn: tOf(ov), win: +(p.filter(x => x > 0).length / p.length).toFixed(3), noTop2: +mean(p.slice(2)).toFixed(4) }; };
const NAMES = { SW1: '2-day RSI under 10 in an uptrend, sell at the first close above the 5-day average (max 5 sessions)', SW2: 'Short-term reversal: the 20 worst 5-day losers (8%+ down) among liquid stocks in an uptrend, held 5 sessions', SW3: 'Three lower highs and lows in an uptrend, sell at the first close above the 5-day average (max 5)', SW4: 'Strong stock (up 20%+ in 6 months) closing at a 10-day low, held 5 sessions', SW5: 'Index/sector ETF closing near its low (IBS under 0.2) in an uptrend, sell at the first strong close (max 3)' };
const RES = {};
for (const [k, a] of Object.entries(trades)) { const R = { older: stat(a.filter(z => z.t < midT), COST), newer: stat(a.filter(z => z.t >= midT), COST), stress: stat(a.filter(z => z.t >= midT), STRESS), lowCostOlder: stat(a.filter(z => z.t < midT), LOW), lowCostNewer: stat(a.filter(z => z.t >= midT), LOW) }, why = [];
  for (const hf of ['older', 'newer']) { const r = R[hf]; if (!(r.n >= 20)) { why.push('too few cases in the ' + hf + ' half (' + (r.n || 0) + ')'); continue; }
    if (!(r.edge > 0)) why.push('not better than an average stock in the ' + hf + ' half (' + pc(r.edge) + ')');
    if (!(r.t >= BAR)) why.push('could be luck in the ' + hf + ' half (t ' + r.t + ', ' + BAR.toFixed(2) + ' needed)');
    if (!(r.avg > 0)) why.push('lost money after costs in the ' + hf + ' half');
    if (!(r.vsSpy > 0)) why.push('did not beat the S&P 500 in the ' + hf + ' half (' + pc(r.vsSpy) + ')');
    if (!(r.vsOwn > 0 && r.tOwn >= 2)) why.push('not clearly better than the same stock on its other days in the ' + hf + ' half (' + pc(r.vsOwn) + ', t ' + r.tOwn + ')');
    if (!(r.noTop2 > 0)) why.push('loses without its 2 best trades in the ' + hf + ' half'); }
  if (R.stress.n >= 20 && !(R.stress.avg > 0)) why.push('loses at 1.2% costs');
  const verdict = !(R.older.n >= 20 && R.newer.n >= 20) ? 'TOO FEW CASES' : !why.length ? 'PASSED' : R.older.edge > 0 && R.newer.edge > 0 ? 'NOT PROVEN' : 'REJECTED';
  const lowOk = R.lowCostOlder.avg > 0 && R.lowCostNewer.avg > 0 && R.lowCostOlder.edge > 0 && R.lowCostNewer.edge > 0;
  RES[k] = { name: NAMES[k], signals: counts[k], verdict, why: why.join('; ') || 'beat the average stock, the S&P 500 and the same stock on its other days in both halves, beyond the luck bar, at stress cost, without its 2 best trades', lowCostNote: lowOk ? 'positive at 0.25% costs in both halves (information only: the cost is what decides it)' : 'not positive even at 0.25% costs', results: R }; }
const thisRun = { at: new Date().toISOString(), from: D[START], to: D[T - 1], bar: +BAR.toFixed(2), results: RES };
const firstRun = PREV.firstRun && PREV.firstRun.results ? PREV.firstRun : thisRun;
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), agent: 'A', preRegistered: '2026-10-20', versions: NV, bar: +BAR.toFixed(2), firstRun, latest: thisRun }, null, 1));
console.log('SWING LAB (2-5 days), ' + D[START] + ' to ' + D[T - 1] + ', bar t ' + BAR.toFixed(2) + (PREV.firstRun ? ' (verdicts frozen from ' + PREV.firstRun.at.slice(0, 10) + ')' : ''));
for (const [k, r] of Object.entries(firstRun.results)) { const n = r.results.newer, o = r.results.older; console.log('- ' + k + ' ' + r.verdict + ' | ' + r.signals + ' signals, held ' + (n.held || '?') + ' | older avg ' + pc(o.avg) + ' edge ' + pc(o.edge) + ' t ' + o.t + ' | newer avg ' + pc(n.avg) + ' edge ' + pc(n.edge) + ' t ' + n.t + ' win ' + n.win + ', vs S&P ' + pc(n.vsSpy) + ', vs own ' + pc(n.vsOwn) + ' | ' + r.lowCostNote); }
try { const LB = J('data/strategy-library.json', null); if (LB) { let ch = false;
  for (const [k, r] of Object.entries(firstRun.results)) { const id = 'A-' + k; let e = LB.strategies.find(x => x.id === id); if (e && /^tested/.test(e.status || '')) continue;
    if (!e) { e = { id, family: 'Swing 2-5 days', name: NAMES[k], explain: NAMES[k] + '. Pre-registered 20 Oct 2026 (swing-lab.mjs).', agent: 'A' }; LB.strategies.push(e); }
    const R = r.results; e.status = 'tested: ' + (r.verdict === 'PASSED' ? 'passed' : r.verdict.toLowerCase()); e.tested = firstRun.to; e.study = 'swing-lab.mjs -> data/swing-lab.json (run once, first run frozen)';
    e.result = { t: R.newer.t, tOlder: R.older.t, edge: R.newer.edge, edgeOlder: R.older.edge, avg: R.newer.avg, win: R.newer.win, vsSpy: R.newer.vsSpy, vsOwn: R.newer.vsOwn, n: [R.older.n || 0, R.newer.n || 0], bar: firstRun.bar, why: r.why, lowCost: r.lowCostNote }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } } catch (e) {}
