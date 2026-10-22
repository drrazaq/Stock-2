// E16 EARNINGS GAP-AND-HOLD ABSORPTION (Agent A, Timing). Research only; never places an order; no Telegram.
// Idea (outside reviews, 19-20 Oct): after an earnings gap UP, if the next days are very quiet and the price holds above the middle of
// the gap, the sellers have been absorbed and the move may continue (a daily-data form of post-earnings drift).
// RULE, FIXED BEFORE THE FIRST RUN (not tuned; run once as written):
//   reaction day R = the report day if before the open (or time unknown), the next session if after the close;
//   gap: R's open is 5%+ above the previous close; the stock is 5 USD+ with 5M USD+ traded a day (20-day average) before R;
//   gap middle M = (previous close + R's open) / 2;
//   days R+1, R+2, R+3: each closes above M, each trades at most half of R's volume, each close moves 3% or less;
//   buy the next open (R+4). Two versions: hold 10 and 20 sessions. No stop (a fixed hold, so nothing is chosen after the results).
// GATES (the same as every study): 0.8% costs (stress 1.2%); older and newer half of 5 years; date-clustered t above the higher of
// this study's own luck bar and the LEAGUE luck bar (data/agent-league.json, read only); must beat the average liquid stock bought the
// same day, the S&P 500 over the same days AND the same stock on its other days in the same half; must survive without its 2 best
// trades. For information only: ALL 5%+ earnings gaps bought the same way (does the quiet hold add anything?).
// Caveat: earnings dates exist only for the ~220 large companies in data/earnings-cache.json.gz (today's companies, so survivorship
// flatters them); the same-stock yardstick removes most of that. A pass goes to live paper first, never straight into buys.
// Output: data/e16-absorption.json (verdicts + today's list of stocks whose 3 quiet days ended at this close).
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, OUT = env.OUT || 'data/e16-absorption.json', COST = 0.008, STRESS = 0.012, HOLDS = [10, 20];
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('e16: no price cache'); process.exit(0); }
let earn; try { earn = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.EARN || 'data/earnings-cache.json.gz')).toString()).syms || {}; } catch (e) { console.log('e16: no earnings dates'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 300) { console.log('e16: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
// CX: closes of a stock AFTER it fell out of the cache's 3 USD / 1M USD filter (study-cache x rows, 22 Oct 2026). Used only to value an
// exit (a held stock that collapsed under 3 USD keeps its real price); never for an entry.
const CX = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; }}); store = null;
const spyI = SY.get('SPY');
const liquid = (i, t) => { const c = C[i * T + t]; if (!(c >= 5)) return false; let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) { if (k < 0) continue; const c1 = C[i * T + k], v = V[i * T + k]; if (isFinite(c1) && isFinite(v)) { dv += c1 * v; n++; } } return n >= 15 && dv / n >= 5e6; };
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k > t; k--) { const z = isFinite(C[b + k]) ? C[b + k] : CX[b + k]; if (isFinite(z)) { last = z; break; } } return last === null ? null : last / e - 1; }
const ctrlC = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlC) return ctrlC[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && liquid(i, t)) { const g = fwd(i, t, h); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[key] = v.length >= 30 ? mean(v) : null); };
const spyF = (t, h) => spyI === undefined ? null : fwd(spyI, t, h);
const midT = Math.floor((21 + T) / 2), ownC = {}; const own = (i, t, h) => { const half = t < midT ? 0 : 1, key = i + '_' + h + '_' + half; if (key in ownC) return ownC[key]; const v = []; for (let k = half ? midT : 21; k < (half ? T - 1 : midT); k += 2) { if (Math.abs(k - t) <= h) continue; if (liquid(i, k)) { const g = fwd(i, k, h); if (g !== null && Math.abs(g) < 3) v.push(g); } } return (ownC[key] = v.length >= 30 ? mean(v) : null); };
const firstOnOrAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
// ---- events
const trades = {}, base = {}; for (const h of HOLDS) { trades['E16_' + h] = []; base[h] = []; }
let gaps = 0, holds = 0; const today = [];
for (const [sym, reps] of Object.entries(earn)) { const i = SY.get(sym); if (i === undefined || i === spyI) continue; const b = i * T, seen = new Set();
  for (const r of reps || []) { if (!r || !r.d || r.d < D[0] || r.d > D[T - 1]) continue; let R = firstOnOrAfter(r.d); if (r.t === 'amc' && D[R] === r.d) R++;
    if (R < 21 || R >= T || seen.has(R)) continue; seen.add(R); const pv = C[b + R - 1], op = O[b + R]; if (!(pv > 0) || !(op > 0) || !liquid(i, R - 1)) continue;
    if (op / pv - 1 < 0.05) continue; gaps++;
    const t0 = R + 3; if (t0 < T) for (const h of HOLDS) { const g = fwd(i, t0, h), c0 = ctrl(t0, h); if (g !== null && c0 !== null && Math.abs(g) < 3) base[h].push({ t: t0, s: sym, g, c: c0 }); }
    const M = (pv + op) / 2; let ok = R + 3 < T;
    for (let k = 1; k <= 3 && ok; k++) { const c = C[b + R + k], c1 = C[b + R + k - 1], v = V[b + R + k]; if (!(c > M) || !(c1 > 0) || !(isFinite(v) && v <= 0.5 * V[b + R]) || Math.abs(c / c1 - 1) > 0.03) ok = false; }
    if (!ok) continue; holds++;
    if (t0 === T - 1) today.push({ sym, d: D[t0], report: r.d, gap: +(op / pv - 1).toFixed(3), mid: +M.toFixed(2), close: +C[b + t0].toFixed(2) });
    for (const h of HOLDS) { const g = fwd(i, t0, h), c0 = ctrl(t0, h), ob = own(i, t0, h), sp = spyF(t0, h); if (g === null || c0 === null || ob === null || Math.abs(g) > 3) continue; trades['E16_' + h].push({ t: t0, s: sym, g, c: c0, ob, sp }); } } }
// ---- statistics (date-clustered: one average per entry day, t over days)
const NV = HOLDS.length, OWN_BAR = 2.4 + 0.1 * NV / 2, LG = J('data/agent-league.json', {}), LEAGUE_BAR = typeof LG.bar === 'number' ? LG.bar : null, BAR = Math.max(OWN_BAR, LEAGUE_BAR || 0);
const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = {}; for (const z of a) { const x = f(z); if (x === null || !isFinite(x)) continue; (o[z.t] = o[z.t] || []).push(x); } return Object.values(o).map(mean); };
const stat = (a, cost) => { if (a.length < 20) return { n: a.length };
  const v = byDay(a, z => z.g - cost - z.c), ov = byDay(a, z => typeof z.ob === 'number' ? z.g - z.ob : null), sv = byDay(a, z => typeof z.sp === 'number' ? z.g - cost - z.sp : null), p = a.map(z => z.g - cost).sort((x, y) => y - x);
  return { n: a.length, days: v.length, stocks: new Set(a.map(z => z.s)).size, avg: +mean(p).toFixed(4), ctrl: +mean(a.map(z => z.c)).toFixed(4), edge: +mean(v).toFixed(4), t: tOf(v), vsSpy: sv.length ? +mean(sv).toFixed(4) : null, tSpy: tOf(sv), vsOwn: ov.length ? +mean(ov).toFixed(4) : null, tOwn: tOf(ov), win: +(p.filter(x => x > 0).length / p.length).toFixed(3), noTop2: +mean(p.slice(2)).toFixed(4) }; };
const RES = {};
for (const [k, a] of Object.entries(trades)) { const h = +k.split('_')[1], R = { older: stat(a.filter(z => z.t < midT), COST), newer: stat(a.filter(z => z.t >= midT), COST), stress: stat(a.filter(z => z.t >= midT), STRESS) }, why = [];
  for (const hf of ['older', 'newer']) { const r = R[hf]; if (!(r.n >= 20)) { why.push('too few cases in the ' + hf + ' half (' + (r.n || 0) + ')'); continue; }
    if (!(r.edge > 0)) why.push('not better than an average stock in the ' + hf + ' half (' + pc(r.edge) + ')');
    if (!(r.t >= BAR)) why.push('could be luck in the ' + hf + ' half (t ' + r.t + ', ' + BAR.toFixed(2) + ' needed)');
    if (!(r.avg > 0)) why.push('lost money after costs in the ' + hf + ' half');
    if (!(r.vsSpy > 0)) why.push('did not beat the S&P 500 in the ' + hf + ' half (' + pc(r.vsSpy) + ')');
    if (!(r.vsOwn > 0 && r.tOwn >= 2)) why.push('not clearly better than the same stock on its other days in the ' + hf + ' half (' + pc(r.vsOwn) + ', t ' + r.tOwn + ')');
    if (!(r.noTop2 > 0)) why.push('loses without its 2 best trades in the ' + hf + ' half'); }
  if (R.stress.n >= 20 && !(R.stress.avg > 0)) why.push('loses at 1.2% costs');
  const verdict = !(R.older.n >= 20 && R.newer.n >= 20) ? 'TOO FEW CASES' : !why.length ? 'PASSED' : R.older.edge > 0 && R.newer.edge > 0 ? 'NOT PROVEN' : 'REJECTED';
  RES[k] = { name: 'Earnings gap up 5%+, 3 quiet days holding above the gap middle, buy day 4, hold ' + h + ' sessions', hold: h, verdict, why: why.join('; ') || 'beat the average stock, the S&P 500 and the same stock on its other days in both halves, beyond the luck bar, at stress cost, without its 2 best trades', results: R,
    allGaps: { older: stat(base[h].filter(z => z.t < midT), COST), newer: stat(base[h].filter(z => z.t >= midT), COST) } }; }
const order = ['PASSED', 'NOT PROVEN', 'REJECTED', 'TOO FEW CASES'], best = Object.values(RES).sort((x, y) => order.indexOf(x.verdict) - order.indexOf(y.verdict) || ((y.results.newer.t || -9) - (x.results.newer.t || -9)))[0];
const out = { generatedAt: new Date().toISOString(), agent: 'A', from: D[21], to: D[T - 1], stocksWithDates: Object.keys(earn).length, gaps, quietHolds: holds, versions: NV, ownBar: +OWN_BAR.toFixed(2), leagueBar: LEAGUE_BAR, bar: +BAR.toFixed(2),
  caveat: 'Earnings dates only for the large companies in the earnings cache (today’s companies); judged against the same stock on its other days to remove most of that bias. A pass goes to live paper first.', results: RES, today };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('E16 GAP-AND-HOLD (' + out.from + ' to ' + out.to + ', ' + gaps + ' earnings gaps of 5%+, ' + holds + ' quiet holds; bar t ' + out.bar + ')');
for (const r of Object.values(RES)) { const n = r.results.newer, o = r.results.older; console.log('- hold ' + r.hold + ': ' + r.verdict + ' | older ' + (o.n || 0) + ' trades, edge ' + pc(o.edge) + ' t ' + o.t + ' | newer ' + (n.n || 0) + ' trades, edge ' + pc(n.edge) + ' t ' + n.t + ', vs S&P ' + pc(n.vsSpy) + ', vs own ' + pc(n.vsOwn) + (r.verdict !== 'PASSED' ? ' (' + r.why.split(';')[0] + ')' : '')); }
// library: E16 (agent A); "tested: passed" only when the code above says PASSED
try { const LB = J('data/strategy-library.json', null), e = LB && LB.strategies.find(x => x.id === 'E16');
  if (e && best) { const R = best.results; e.agent = 'A'; e.status = 'tested: ' + (best.verdict === 'PASSED' ? 'passed' : best.verdict.toLowerCase()); e.tested = D[T - 1]; e.study = 'e16-absorption.mjs -> data/e16-absorption.json (today)';
    e.result = { hold: best.hold, t: R.newer.t, tOlder: R.older.t, edge: R.newer.edge, edgeOlder: R.older.edge, vsSpy: R.newer.vsSpy, vsSpyOlder: R.older.vsSpy, vsOwn: R.newer.vsOwn, n: [R.older.n || 0, R.newer.n || 0], bar: out.bar, why: best.why };
    fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } } catch (e) {}
