// PATTERN LAB: volume profile (POC, value area, HVN/LVN) and Smart Money Concepts (SMC), asked for by the user on 20 Oct 2026.
// Research only; never places an order; no Telegram. Library ids A-VP1..3 and A-SMC1..3 (Agent A lane).
// PRE-REGISTERED 20 Oct 2026, written before any result was seen. RUN ONCE AS WRITTEN: the first complete verdict is frozen in
// data/pattern-lab.json (firstRun) and in the library; later runs only refresh the newer data for information, never a second chance.
// Daily bars only (open, high, low, close, volume), so the volume profile is an APPROXIMATION: each session spreads its volume evenly
// across its own high-low range. True volume-at-price needs intraday data.
// PROFILE on day t = the 60 sessions t-60..t-1 (today excluded), price range = lowest low..highest high, 50 equal bins.
//   POC = busiest bin (its middle price). VALUE AREA = start at the POC bin, keep adding the busier neighbour until 70% of the volume.
//   VAL / VAH = the low edge / high edge of the value area. LVN = a bin under 0.5x the average bin. Prices above the range count as empty.
// Tradable on t: close 5 USD+, 20-session average traded value 5M USD+ (no 1-3 USD lottery names). Entry: the next open.
//   VP1 value-area-low reclaim: close t-1 under VAL, close t back at or above VAL (same profile). Hold 5 and 20 sessions.
//   VP2 breakout into a thin zone: close t-1 at or under VAH, close t above VAH, and the bins from VAH up to VAH x 1.10 average
//       under 0.5x the average bin (low-volume nodes overhead). Hold 5 and 20 sessions.
//   VP3 pullback to the POC in an uptrend: close above its 200-day average, close within 1% of the POC, and 5 sessions earlier the
//       close was 3%+ above the POC (a pullback, not a slide). Hold 10 sessions.
//   SMC1 fair value gap fill: a bullish gap formed on day k (low of k above the high of k-2) in the last 10 sessions, with the close
//       of k above its 50-day average; on t the low first trades back to the low of k (nothing since k did) and the close stays at or
//       above the high of k-2 (the gap held). Hold 10 sessions.
//   SMC2 order block retest: break of structure on day b = close above the most recent confirmed swing high (a high above the 2
//       highs on each side) after closing at or under it the day before; order block = the last down day (close under open) in the
//       10 sessions before b. On t (b+1..b+20) the low first trades into the block's high and the close stays at or above its low.
//       Hold 10 sessions.
//   SMC3 liquidity sweep of equal lows: two confirmed swing lows (a low under the 2 lows each side) in the last 40 sessions within
//       1% of each other; on t the low trades under the lower one and the close is back above it. Hold 5 sessions.
// GATES (the same as every study): 0.8% costs (stress 1.2%); older and newer half of 5 years; date-clustered t at or above the higher
// of this study's own luck bar and the LEAGUE bar (data/agent-league.json, read only); must beat the average tradable stock bought
// the same day, the S&P 500 over the same days AND the same stock on its other days in the same half; must survive without its 2
// best trades. A pass goes to live paper first, never straight into buys. Output: data/pattern-lab.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, OUT = env.OUT || 'data/pattern-lab.json', COST = 0.008, STRESS = 0.012, NB = 50, WIN = 60;
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const PREV = J(OUT, {});
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('pattern-lab: no price cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 400) { console.log('pattern-lab: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), H = new Float32Array(NS * T).fill(NaN), L = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; H[k] = x.h ? x.h[j] : NaN; L[k] = x.l ? x.l[j] : NaN; C[k] = x.c[j]; V[k] = x.v[j]; } }); store = null;
const spyI = SY.get('SPY');
const DV = new Float32Array(NS * T).fill(NaN);   // 20-session average traded value
for (let i = 0; i < NS; i++) { const b = i * T; let s = 0, n = 0; const q = []; for (let t = 0; t < T; t++) { const c = C[b + t], v = V[b + t], x = isFinite(c) && isFinite(v) ? c * v : NaN; q.push(x); if (isFinite(x)) { s += x; n++; } if (q.length > 20) { const y = q.shift(); if (isFinite(y)) { s -= y; n--; } } if (n >= 15) DV[b + t] = s / n; } }
const tradable = (i, t) => C[i * T + t] >= 5 && DV[i * T + t] >= 5e6;
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k > t; k--) if (isFinite(C[b + k])) { last = C[b + k]; break; } return last === null ? null : last / e - 1; }
const ctrlC = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlC) return ctrlC[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && tradable(i, t)) { const g = fwd(i, t, h); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[key] = v.length >= 30 ? mean(v) : null); };
const spyF = (t, h) => spyI === undefined ? null : fwd(spyI, t, h);
const START = 210, midT = Math.floor((START + T) / 2), ownC = {};
const own = (i, t, h) => { const half = t < midT ? 0 : 1, key = i + '_' + h + '_' + half; if (key in ownC) return ownC[key]; const v = []; for (let k = half ? midT : START; k < (half ? T - 1 : midT); k += 2) { if (Math.abs(k - t) <= h) continue; if (tradable(i, k)) { const g = fwd(i, k, h); if (g !== null && Math.abs(g) < 3) v.push(g); } } return (ownC[key] = v.length >= 30 ? mean(v) : null); };
// ---- volume profile of the 60 sessions before t
const bins = new Float64Array(NB);
function profile(i, t) { const b = i * T; let lo = Infinity, hi = -Infinity, n = 0;
  for (let k = t - WIN; k < t; k++) { const h = H[b + k], l = L[b + k], v = V[b + k]; if (!(h >= l) || !(l > 0) || !isFinite(v)) continue; n++; if (l < lo) lo = l; if (h > hi) hi = h; }
  if (n < 50 || !(hi > lo)) return null; const w = (hi - lo) / NB; bins.fill(0); let tot = 0;
  for (let k = t - WIN; k < t; k++) { const h = H[b + k], l = L[b + k], v = V[b + k]; if (!(h >= l) || !(l > 0) || !isFinite(v) || v <= 0) continue;
    let a = Math.min(NB - 1, Math.floor((l - lo) / w)), z = Math.min(NB - 1, Math.floor((h - lo) / w)); const per = v / (z - a + 1); for (let q = a; q <= z; q++) bins[q] += per; tot += v; }
  if (!(tot > 0)) return null; let p = 0; for (let q = 1; q < NB; q++) if (bins[q] > bins[p]) p = q;
  let a = p, z = p, acc = bins[p]; while (acc < 0.7 * tot && (a > 0 || z < NB - 1)) { const dn = a > 0 ? bins[a - 1] : -1, up = z < NB - 1 ? bins[z + 1] : -1; if (up >= dn) { z++; acc += bins[z]; } else { a--; acc += bins[a]; } }
  const avg = tot / NB, vah = lo + (z + 1) * w; let thin = 0, cnt = 0; for (let px = vah; px < vah * 1.10; px += w) { const q = Math.floor((px - lo) / w); thin += q >= 0 && q < NB ? bins[q] : 0; cnt++; }
  return { poc: lo + (p + 0.5) * w, val: lo + a * w, vah, thinAbove: cnt ? thin / cnt < 0.5 * avg : false }; }
// ---- signals
const VERS = { VP1_5: 5, VP1_20: 20, VP2_5: 5, VP2_20: 20, VP3_10: 10, SMC1_10: 10, SMC2_10: 10, SMC3_5: 5 }, trades = {}; for (const k in VERS) trades[k] = [];
const counts = {}; for (const k in VERS) counts[k] = 0;
const add = (k, i, t) => { counts[k]++; const h = VERS[k], g = fwd(i, t, h), c0 = ctrl(t, h), ob = own(i, t, h), sp = spyF(t, h); if (g === null || c0 === null || ob === null || Math.abs(g) > 3) return; trades[k].push({ t, s: SYMS[i], g, c: c0, ob, sp }); };
const isSwingHi = (b, j) => { const h = H[b + j]; return h > H[b + j - 1] && h > H[b + j - 2] && h > H[b + j + 1] && h > H[b + j + 2]; };
const isSwingLo = (b, j) => { const l = L[b + j]; return l < L[b + j - 1] && l < L[b + j - 2] && l < L[b + j + 1] && l < L[b + j + 2]; };
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s200 = 0, n200 = 0, s50 = 0, n50 = 0; const q200 = [], q50 = [];
  let lastSH = null, ob = null;   // SMC2 state: most recent confirmed swing high, active order block {lo, hi, until, used}
  for (let t = 0; t < T - 1; t++) { const c = C[b + t];
    q200.push(c); if (isFinite(c)) { s200 += c; n200++; } if (q200.length > 200) { const y = q200.shift(); if (isFinite(y)) { s200 -= y; n200--; } }
    q50.push(c); if (isFinite(c)) { s50 += c; n50++; } if (q50.length > 50) { const y = q50.shift(); if (isFinite(y)) { s50 -= y; n50--; } }
    if (t >= 4 && isSwingHi(b, t - 2)) lastSH = H[b + t - 2];   // confirmed 2 sessions later
    if (t < START || !isFinite(c) || !(H[b + t] >= L[b + t])) continue;
    const ok = tradable(i, t), c1 = C[b + t - 1];
    // SMC2: break of structure creates an order block; then wait for the first retest
    if (lastSH !== null && c > lastSH && c1 <= lastSH) { let o = null; for (let k = t - 1; k >= t - 10; k--) if (C[b + k] < O[b + k]) { o = k; break; } if (o !== null) ob = { lo: L[b + o], hi: H[b + o], until: t + 20, from: t }; lastSH = null; }
    else if (ob && t > ob.from) { if (t > ob.until) ob = null; else if (L[b + t] <= ob.hi) { if (ok && c >= ob.lo) add('SMC2_10', i, t); ob = null; } }
    if (!ok) continue;
    // volume profile rules (one profile per day, only when a rule could fire)
    const P = profile(i, t);
    if (P) { if (c1 < P.val && c >= P.val) { add('VP1_5', i, t); add('VP1_20', i, t); }
      if (c1 <= P.vah && c > P.vah && P.thinAbove) { add('VP2_5', i, t); add('VP2_20', i, t); }
      if (n200 >= 190 && c > s200 / n200 && Math.abs(c / P.poc - 1) <= 0.01 && C[b + t - 5] >= P.poc * 1.03) add('VP3_10', i, t); }
    // SMC1: fair value gap in the last 10 sessions, first return into it
    for (let k = t - 1; k >= t - 10; k--) { if (!(L[b + k] > H[b + k - 2])) continue; if (!(n50 >= 45)) break; let ma = 0, m = 0; for (let z = k - 49; z <= k; z++) if (isFinite(C[b + z])) { ma += C[b + z]; m++; } if (!(m >= 45 && C[b + k] > ma / m)) break;
      let touched = false; for (let z = k + 1; z < t; z++) if (L[b + z] <= L[b + k]) { touched = true; break; } if (!touched && L[b + t] <= L[b + k] && c >= H[b + k - 2]) add('SMC1_10', i, t); break; }
    // SMC3: two swing lows within 1% in the last 40 sessions, swept today and reclaimed
    const lows = []; for (let j = t - 40; j <= t - 3; j++) if (isSwingLo(b, j)) lows.push(L[b + j]);
    if (lows.length >= 2) { let lvl = null; for (let x = 0; x < lows.length && lvl === null; x++) for (let y = x + 1; y < lows.length; y++) if (Math.abs(lows[x] / lows[y] - 1) <= 0.01) { lvl = Math.min(lows[x], lows[y]); break; }
      if (lvl !== null && L[b + t] < lvl && c > lvl) { let gone = false; for (let z = t - 2; z < t; z++) if (L[b + z] < lvl) gone = true; if (!gone) add('SMC3_5', i, t); } } } }
// ---- statistics (date-clustered: one average per entry day, t over days)
const NV = Object.keys(VERS).length, OWN_BAR = 2.4 + 0.1 * NV / 2, LG = J('data/agent-league.json', {}), LEAGUE_BAR = typeof LG.bar === 'number' ? LG.bar : null, BAR = Math.max(OWN_BAR, LEAGUE_BAR || 0);
const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = {}; for (const z of a) { const x = f(z); if (x === null || !isFinite(x)) continue; (o[z.t] = o[z.t] || []).push(x); } return Object.values(o).map(mean); };
const stat = (a, cost) => { if (a.length < 20) return { n: a.length };
  const v = byDay(a, z => z.g - cost - z.c), ov = byDay(a, z => typeof z.ob === 'number' ? z.g - z.ob : null), sv = byDay(a, z => typeof z.sp === 'number' ? z.g - cost - z.sp : null), p = a.map(z => z.g - cost).sort((x, y) => y - x);
  return { n: a.length, days: v.length, stocks: new Set(a.map(z => z.s)).size, avg: +mean(p).toFixed(4), ctrl: +mean(a.map(z => z.c)).toFixed(4), edge: +mean(v).toFixed(4), t: tOf(v), vsSpy: sv.length ? +mean(sv).toFixed(4) : null, tSpy: tOf(sv), vsOwn: ov.length ? +mean(ov).toFixed(4) : null, tOwn: tOf(ov), win: +(p.filter(x => x > 0).length / p.length).toFixed(3), noTop2: +mean(p.slice(2)).toFixed(4) }; };
const NAMES = { VP1: 'Volume profile: close back inside the value area after closing under it', VP2: 'Volume profile: close above the value area into a thin (low-volume) zone', VP3: 'Volume profile: uptrend pullback to the point of control (POC)', SMC1: 'SMC: first return into a bullish fair value gap', SMC2: 'SMC: first retest of the order block after a break of structure', SMC3: 'SMC: sweep of equal lows, closed back above' };
const RES = {};
for (const [k, a] of Object.entries(trades)) { const [r0, hs] = k.split('_'), R = { older: stat(a.filter(z => z.t < midT), COST), newer: stat(a.filter(z => z.t >= midT), COST), stress: stat(a.filter(z => z.t >= midT), STRESS) }, why = [];
  for (const hf of ['older', 'newer']) { const r = R[hf]; if (!(r.n >= 20)) { why.push('too few cases in the ' + hf + ' half (' + (r.n || 0) + ')'); continue; }
    if (!(r.edge > 0)) why.push('not better than an average stock in the ' + hf + ' half (' + pc(r.edge) + ')');
    if (!(r.t >= BAR)) why.push('could be luck in the ' + hf + ' half (t ' + r.t + ', ' + BAR.toFixed(2) + ' needed)');
    if (!(r.avg > 0)) why.push('lost money after costs in the ' + hf + ' half');
    if (!(r.vsSpy > 0)) why.push('did not beat the S&P 500 in the ' + hf + ' half (' + pc(r.vsSpy) + ')');
    if (!(r.vsOwn > 0 && r.tOwn >= 2)) why.push('not clearly better than the same stock on its other days in the ' + hf + ' half (' + pc(r.vsOwn) + ', t ' + r.tOwn + ')');
    if (!(r.noTop2 > 0)) why.push('loses without its 2 best trades in the ' + hf + ' half'); }
  if (R.stress.n >= 20 && !(R.stress.avg > 0)) why.push('loses at 1.2% costs');
  const verdict = !(R.older.n >= 20 && R.newer.n >= 20) ? 'TOO FEW CASES' : !why.length ? 'PASSED' : R.older.edge > 0 && R.newer.edge > 0 ? 'NOT PROVEN' : 'REJECTED';
  RES[k] = { rule: r0, name: NAMES[r0] + ', hold ' + hs + ' sessions', signals: counts[k], verdict, why: why.join('; ') || 'beat the average stock, the S&P 500 and the same stock on its other days in both halves, beyond the luck bar, at stress cost, without its 2 best trades', results: R }; }
const thisRun = { at: new Date().toISOString(), from: D[START], to: D[T - 1], bar: +BAR.toFixed(2), results: RES };
const firstRun = PREV.firstRun && PREV.firstRun.results ? PREV.firstRun : thisRun;   // frozen: run once as written
const out = { generatedAt: new Date().toISOString(), agent: 'A', preRegistered: '2026-10-20', versions: NV, ownBar: +OWN_BAR.toFixed(2), leagueBar: LEAGUE_BAR, bar: +BAR.toFixed(2), firstRun, latest: thisRun,
  caveat: 'Daily-bar approximation of the volume profile and of SMC patterns. A pass goes to live paper first.' };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('PATTERN LAB (volume profile + SMC), ' + D[START] + ' to ' + D[T - 1] + ', bar t ' + out.bar + (PREV.firstRun ? ' (verdicts frozen from ' + PREV.firstRun.at.slice(0, 10) + ')' : ''));
for (const [k, r] of Object.entries(firstRun.results)) { const n = r.results.newer, o = r.results.older; console.log('- ' + k + ' ' + r.verdict + ' | ' + r.signals + ' signals | older ' + (o.n || 0) + ', edge ' + pc(o.edge) + ' t ' + o.t + ' | newer ' + (n.n || 0) + ', edge ' + pc(n.edge) + ' t ' + n.t + ', vs S&P ' + pc(n.vsSpy) + ', vs own ' + pc(n.vsOwn) + (r.verdict !== 'PASSED' ? ' (' + r.why.split(';')[0] + ')' : '')); }
// library: written once from the frozen first run; "tested: passed" only when the code above says PASSED
try { const LB = J('data/strategy-library.json', null); if (LB) { let ch = false; const order = ['PASSED', 'NOT PROVEN', 'REJECTED', 'TOO FEW CASES'];
  for (const [id, rk] of [['A-VP1', 'VP1'], ['A-VP2', 'VP2'], ['A-VP3', 'VP3'], ['A-SMC1', 'SMC1'], ['A-SMC2', 'SMC2'], ['A-SMC3', 'SMC3']]) { const e = LB.strategies.find(x => x.id === id); if (!e || /^tested/.test(e.status || '')) continue;
    const vs = Object.entries(firstRun.results).filter(([k]) => k.split('_')[0] === rk).sort(([, x], [, y]) => order.indexOf(x.verdict) - order.indexOf(y.verdict) || ((y.results.newer.t || -9) - (x.results.newer.t || -9))); if (!vs.length) continue;
    const [bk, br] = vs[0], R = br.results; e.status = 'tested: ' + (br.verdict === 'PASSED' ? 'passed' : br.verdict.toLowerCase()); e.tested = firstRun.to; e.study = 'pattern-lab.mjs -> data/pattern-lab.json (run once, first run frozen)';
    e.result = { best: bk, t: R.newer.t, tOlder: R.older.t, edge: R.newer.edge, edgeOlder: R.older.edge, vsSpy: R.newer.vsSpy, vsSpyOlder: R.older.vsSpy, vsOwn: R.newer.vsOwn, n: [R.older.n || 0, R.newer.n || 0], bar: firstRun.bar, why: vs.map(([k, r]) => k + ' ' + r.verdict + (r.verdict === 'PASSED' ? '' : ': ' + r.why.split(';')[0])).join(' | ') }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } } catch (e) {}
