// FULFILLING LAB (outside review of 20 Oct, afternoon): "buy quiet before the crowd, not the jump". Research only; no orders; no Telegram.
// PRE-REGISTERED 20 Oct 2026, written before any result was seen. RUN ONCE AS WRITTEN (first verdict frozen, as in pattern-lab).
// Data already in the system: 5-year whole-market prices, SEC Form 4 open-market purchases (study-cache/insider, from insider-study),
// SEC share counts (data/shares.json.gz), SEC filing events (ev-cache: 8-K 1.01 CONTRACT, 424B4/5 OFFERING, 8-K 3.02 DILUTION).
// Three rules, each a different "quiet before" idea the earlier tests did not cover:
//   F1 INSIDER THEN QUIET (C-INS2): 2+ different insiders buy within 10 days (filing dates); after the LAST filing, 3 sessions each with
//      volume under 150% of the 50-day median and a close at or above the filing-day low. Buy the next open (day 4), hold 20 sessions.
//   F2 FULFILLING-1 (the review's stack): share count known on t under 5% above the count 90 days earlier; no 424B4/5 or 8-K 3.02 in
//      20 sessions; volume on t-7..t-3 under 150% of median; close above the 50-day average; no 15%+ one-day jump in 21 sessions;
//      an insider cluster (2+) filed within the 10 sessions before t; ignition on t: volume over 3x median, close in the top 25% of the
//      range, open within 3% of the previous close (no gap already done). Buy next open, hold 3 and 5 sessions.
//   F3 QUIET AFTER 8-K 1.01: a material-agreement 8-K, then 3 sessions each with volume under 150% of median and a close at or above the
//      filing-session low. Buy the next open (day 4), hold 10 sessions. (events-study bought the morning after the filing and was rejected.)
// Tradable: close 3 USD+, 20-session average traded value 1M USD+. GATES unchanged: 0.8% costs (1.2% stress), both halves of 5 years,
// date-clustered t at or above max(own bar, league bar), must beat the average stock bought the same day, the S&P 500 over the same days
// AND the same stock on its other days, must survive without its 2 best trades. A pass goes to live paper first. Output: data/fulfilling.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { secNY } from './sec-time.mjs';   // SEC acceptance times are UTC: converted to the New York clock (fixed 22 Oct 2026)
const env = process.env, OUT = env.OUT || 'data/fulfilling.json', COST = 0.008, STRESS = 0.012, IDIR = (env.CACHE_DIR || 'study-cache') + '/insider';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, gz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return null; } };
const PREV = J(OUT, {});
let store = gz(env.CACHE || 'study-cache/grouped.json.gz'); if (!store) { console.log('fulfilling: no price cache'); process.exit(0); }
const EV = gz(env.EV_CACHE || 'ev-cache/events-cache.json.gz'), SHR = gz(env.SHARES || 'data/shares.json.gz');
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 300) { console.log('fulfilling: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), H = new Float32Array(NS * T).fill(NaN), L = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
// CX: closes of a stock AFTER it fell out of the cache's 3 USD / 1M USD filter (study-cache x rows, 22 Oct 2026). Used only to value an
// exit (a held stock that collapsed under 3 USD keeps its real price); never for an entry.
const CX = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; H[k] = x.h ? x.h[j] : NaN; L[k] = x.l ? x.l[j] : NaN; C[k] = x.c[j]; V[k] = x.v[j]; }  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; }}); store = null;
const spyI = SY.get('SPY');
// insider purchases from the cache insider-study keeps: [symbol, filing date, insider CIK, USD]
const INS = {}; let nIns = 0; try { for (const f of fs.readdirSync(IDIR).filter(f => f.endsWith('.json'))) for (const b of JSON.parse(fs.readFileSync(IDIR + '/' + f, 'utf8'))) { if (SY.has(b[0])) { (INS[b[0]] = INS[b[0]] || []).push({ d: b[1], who: b[2] }); nIns++; } } } catch (e) {}
if (!nIns) { console.log('fulfilling: no insider cache (insider-study runs first); not run'); process.exit(0); }
for (const a of Object.values(INS)) a.sort((x, y) => x.d < y.d ? -1 : 1);
const firstOnOrAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
// cluster events per stock: session index of the LAST filing of a 2+-insider cluster (one event per 30 days)
const CL = {}; for (const [sym, a] of Object.entries(INS)) { let last = '0'; for (let k = 0; k < a.length; k++) { const p = a[k], from = new Date(Date.parse(p.d) - 10 * 864e5).toISOString().slice(0, 10); const n = new Set(a.filter(z => z.d >= from && z.d <= p.d).map(z => z.who)).size;
  if (n >= 2 && p.d > last) { const t = firstOnOrAfter(p.d); if (t < T) (CL[sym] = CL[sym] || []).push(t); last = new Date(Date.parse(p.d) + 30 * 864e5).toISOString().slice(0, 10); } } }
const evT = (S, fam) => (S.ev || []).filter(e => String(e.f).split(',').includes(fam) && secNY(e.p)).map(e => { const ny = secNY(e.p), d = ny.d, late = !!ny.hm && ny.hm >= '16:00'; let t = firstOnOrAfter(d); if (late && D[t] === d) t++; return t; }).filter(t => t < T);
const lag = SHR ? (SHR.lagDays || 30) * 864e5 : 0, sharesKnown = (a, ms) => { const lim = new Date(ms - lag).toISOString().slice(0, 10); let v = null; for (const [d, n] of a) { if (d <= lim) v = n; else break; } return v; };
const tradable = (i, t) => { const c = C[i * T + t]; if (!(c >= 3)) return false; let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) { if (k < 0) continue; const c1 = C[i * T + k], v = V[i * T + k]; if (isFinite(c1) && isFinite(v)) { dv += c1 * v; n++; } } return n >= 15 && dv / n >= 1e6; };
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k > t; k--) { const z = isFinite(C[b + k]) ? C[b + k] : CX[b + k]; if (isFinite(z)) { last = z; break; } } return last === null ? null : last / e - 1; }
const ctrlC = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlC) return ctrlC[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && tradable(i, t)) { const g = fwd(i, t, h); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[key] = v.length >= 30 ? mean(v) : null); };
const spyF = (t, h) => spyI === undefined ? null : fwd(spyI, t, h);
const START = 60, midT = Math.floor((START + T) / 2), ownC = {}; const own = (i, t, h) => { const half = t < midT ? 0 : 1, key = i + '_' + h + '_' + half; if (key in ownC) return ownC[key]; const v = []; for (let k = half ? midT : START; k < (half ? T - 1 : midT); k += 2) { if (Math.abs(k - t) <= h) continue; if (tradable(i, k)) { const g = fwd(i, k, h); if (g !== null && Math.abs(g) < 3) v.push(g); } } return (ownC[key] = v.length >= 30 ? mean(v) : null); };
const medVol = (b, t) => { const w = []; for (let k = t - 50; k < t; k++) { const x = V[b + k]; if (isFinite(x)) w.push(x); } if (w.length < 40) return null; w.sort((x, y) => x - y); return w[w.length >> 1]; };
const quiet3 = (b, t0, lowRef) => { const med = medVol(b, t0); if (!(med > 0)) return false; for (let k = t0 + 1; k <= t0 + 3; k++) { const v = V[b + k], c = C[b + k]; if (!isFinite(v) || !(v < 1.5 * med) || !(c >= lowRef)) return false; } return true; };
const VERS = { F1_20: 20, F2_3: 3, F2_5: 5, F3_10: 10 }, trades = {}, counts = {}; for (const k in VERS) { trades[k] = []; counts[k] = 0; }
const add = (k, i, t) => { counts[k]++; const h = VERS[k], g = fwd(i, t, h), c0 = ctrl(t, h), ob = own(i, t, h), sp = spyF(t, h); if (g === null || c0 === null || ob === null || Math.abs(g) > 3) return; trades[k].push({ t, s: SYMS[i], g, c: c0, ob, sp }); };
let covered = 0;
for (let i = 0; i < NS; i++) { const sym = SYMS[i]; if (i === spyI) continue; const b = i * T, cl = CL[sym] || [], S = EV && EV.syms ? EV.syms[sym] : null, A = SHR && SHR.c ? SHR.c[SHR.t[sym]] : null;
  // F1: insider cluster, then 3 quiet sessions holding the filing-session low
  for (const t0 of cl) { if (t0 < START || t0 + 4 >= T || !isFinite(L[b + t0])) continue; if (quiet3(b, t0, L[b + t0]) && tradable(i, t0 + 3)) add('F1_20', i, t0 + 3); }
  // F3: 8-K 1.01, then 3 quiet sessions holding the filing-session low
  if (S && S.old) { covered++; for (const t0 of evT(S, 'CONTRACT')) { if (t0 < START || t0 + 4 >= T || !isFinite(L[b + t0])) continue; if (quiet3(b, t0, L[b + t0]) && tradable(i, t0 + 3)) add('F3_10', i, t0 + 3); } }
  // F2: the full stack, only where the stock has SEC history, share counts and at least one insider cluster
  if (!S || !S.old || !A || A.length < 2 || !cl.length) continue;
  const sup = new Uint8Array(T + 1); for (const t of [...evT(S, 'OFFERING'), ...evT(S, 'DILUTION')]) sup[t] = 1;
  for (const tc of cl) for (let t = tc; t <= Math.min(T - 2, tc + 10); t++) { const v = V[b + t], c = C[b + t], h = H[b + t], l = L[b + t], o = O[b + t], pc1 = C[b + t - 1]; if (!isFinite(v) || !(c >= 3) || !(h > l) || !(o > 0) || !(pc1 > 0)) continue;
    const med = medVol(b, t); if (!(med > 0) || !(v > 3 * med) || !((c - l) / (h - l) >= 0.75) || Math.abs(o / pc1 - 1) > 0.03) continue;
    let q = true; for (let k = t - 7; k <= t - 3; k++) { const x = V[b + k]; if (!isFinite(x) || !(x < 1.5 * med)) { q = false; break; } } if (!q) continue;
    let s50 = 0, n50 = 0; for (let k = t - 49; k <= t; k++) if (isFinite(C[b + k])) { s50 += C[b + k]; n50++; } if (!(n50 >= 45 && c > s50 / n50)) continue;
    let lot = false; for (let k = t - 20; k <= t; k++) { const a = C[b + k - 1], z = C[b + k]; if (a > 0 && z > 0 && z / a - 1 >= 0.15) { lot = true; break; } } if (lot) continue;
    const ms = Date.parse(D[t]), n1 = sharesKnown(A, ms), n0 = sharesKnown(A, ms - 90 * 864e5); let off = false; for (let k = Math.max(0, t - 19); k <= t; k++) if (sup[k]) { off = true; break; } if (!(n1 > 0 && n0 > 0) || !(n1 / n0 - 1 < 0.05) || off) continue;
    if (!tradable(i, t)) continue; add('F2_3', i, t); add('F2_5', i, t); break; } }
const NV = Object.keys(VERS).length, OWN_BAR = 2.4 + 0.1 * NV / 2, LG = J('data/agent-league.json', {}), LEAGUE_BAR = typeof LG.bar === 'number' ? LG.bar : null, BAR = Math.max(OWN_BAR, LEAGUE_BAR || 0);
const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = {}; for (const z of a) { const x = f(z); if (x === null || !isFinite(x)) continue; (o[z.t] = o[z.t] || []).push(x); } return Object.values(o).map(mean); };
const stat = (a, cost) => { if (a.length < 20) return { n: a.length };
  const v = byDay(a, z => z.g - cost - z.c), ov = byDay(a, z => typeof z.ob === 'number' ? z.g - z.ob : null), sv = byDay(a, z => typeof z.sp === 'number' ? z.g - cost - z.sp : null), p = a.map(z => z.g - cost).sort((x, y) => y - x);
  return { n: a.length, days: v.length, stocks: new Set(a.map(z => z.s)).size, avg: +mean(p).toFixed(4), ctrl: +mean(a.map(z => z.c)).toFixed(4), edge: +mean(v).toFixed(4), t: tOf(v), vsSpy: sv.length ? +mean(sv).toFixed(4) : null, tSpy: tOf(sv), vsOwn: ov.length ? +mean(ov).toFixed(4) : null, tOwn: tOf(ov), win: +(p.filter(x => x > 0).length / p.length).toFixed(3), noTop2: +mean(p.slice(2)).toFixed(4) }; };
const NAMES = { F1: 'Insider cluster (2+), then 3 quiet sessions holding the filing-day low; buy day 4', F2: 'FULFILLING-1: flat share count, no offering, quiet 3-7 days before, above the 50-day, not a lottery stock, insider cluster in 10 days, then ignition without a gap', F3: '8-K 1.01 material agreement, then 3 quiet sessions holding the filing-day low; buy day 4' };
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
const thisRun = { at: new Date().toISOString(), from: D[START], to: D[T - 1], bar: +BAR.toFixed(2), insiderPurchases: nIns, stocksWithSec: covered, results: RES };
const firstRun = PREV.firstRun && PREV.firstRun.results ? PREV.firstRun : thisRun;
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), agent: 'C', preRegistered: '2026-10-20', versions: NV, bar: +BAR.toFixed(2), firstRun, latest: thisRun }, null, 1));
console.log('FULFILLING LAB, ' + D[START] + ' to ' + D[T - 1] + ', ' + nIns + ' insider purchases, bar t ' + BAR.toFixed(2) + (PREV.firstRun ? ' (verdicts frozen from ' + PREV.firstRun.at.slice(0, 10) + ')' : ''));
for (const [k, r] of Object.entries(firstRun.results)) { const n = r.results.newer, o = r.results.older; console.log('- ' + k + ' ' + r.verdict + ' | ' + r.signals + ' signals | older ' + (o.n || 0) + ', edge ' + pc(o.edge) + ' t ' + o.t + ' | newer ' + (n.n || 0) + ', edge ' + pc(n.edge) + ' t ' + n.t + ' win ' + n.win + ', vs S&P ' + pc(n.vsSpy) + ', vs own ' + pc(n.vsOwn) + (r.verdict !== 'PASSED' ? ' (' + r.why.split(';')[0] + ')' : '')); }
try { const LB = J('data/strategy-library.json', null); if (LB) { let ch = false; const order = ['PASSED', 'NOT PROVEN', 'REJECTED', 'TOO FEW CASES'];
  for (const [id, rk, fam, nm] of [['C-INS2', 'F1', 'Insiders', NAMES.F1], ['C-FUL1', 'F2', 'Early wave', NAMES.F2], ['C-QK1', 'F3', 'Company events', NAMES.F3]]) { let e = LB.strategies.find(x => x.id === id); if (e && /^tested/.test(e.status || '')) continue;
    const vs = Object.entries(firstRun.results).filter(([k]) => k.split('_')[0] === rk).sort(([, x], [, y]) => order.indexOf(x.verdict) - order.indexOf(y.verdict) || ((y.results.newer.t || -9) - (x.results.newer.t || -9))); if (!vs.length) continue;
    if (!e) { e = { id, family: fam, name: nm, explain: nm + '. Pre-registered 20 Oct 2026 (fulfilling.mjs).', agent: 'C' }; LB.strategies.push(e); }
    const [bk, br] = vs[0], R = br.results; e.agent = 'C'; e.status = 'tested: ' + (br.verdict === 'PASSED' ? 'passed' : br.verdict.toLowerCase()); e.tested = firstRun.to; e.study = 'fulfilling.mjs -> data/fulfilling.json (run once, first run frozen)';
    e.result = { best: bk, t: R.newer.t, tOlder: R.older.t, edge: R.newer.edge, edgeOlder: R.older.edge, vsSpy: R.newer.vsSpy, vsOwn: R.newer.vsOwn, n: [R.older.n || 0, R.newer.n || 0], bar: firstRun.bar, why: vs.map(([k, r]) => k + ' ' + r.verdict + (r.verdict === 'PASSED' ? '' : ': ' + r.why.split(';')[0])).join(' | ') }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } } catch (e) {}
