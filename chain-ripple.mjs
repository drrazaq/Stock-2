// CHAIN RIPPLE STUDY: "who buys from whom". When one company in a value chain (data/chains.json: AI build-out, space and defense,
// energy, obesity drugs) jumps on heavy volume, do the OTHER companies of the same chain that have not moved yet follow over the next
// days? Two versions of "connected": the same layer (competitors / peers) and another layer of the chain (suppliers and customers).
// Held 3, 10 and 20 sessions, bought at the next open, 0.8% costs (1.2% stress). Compared with the average liquid stock bought the same
// day for the same days. Both halves of 5 years, date-clustered t-statistic with a luck bar for the 6 versions, must survive without its
// 2 best trades. Caveat written into the output: chain membership is TODAY's knowledge (a company listed in 2025 cannot appear earlier;
// a company that left a chain is missing), so a pass goes to live paper first. Output: data/chain-ripple.json. Research only.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';   // run once per version: first judged verdict frozen (22 Oct 2026)
const env = process.env, OUT = 'data/chain-ripple.json', COST = 0.008, STRESS = 0.012, HOLDS = [3, 10, 20];
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, pc = (x) => x === null || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('chain-ripple: no price cache'); process.exit(0); }
const CH = JSON.parse(fs.readFileSync('data/chains.json', 'utf8')).chains;
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 300) { console.log('chain-ripple: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
// CX: closes of a stock AFTER it fell out of the cache's 3 USD / 1M USD filter (study-cache x rows, 22 Oct 2026). Used only to value an
// exit (a held stock that collapsed under 3 USD keeps its real price); never for an entry.
const CX = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; }}); store = null;
const spyI = SY.get('SPY');
const r1 = (i, t) => { const a = C[i * T + t - 1], b = C[i * T + t]; return a > 0 && b > 0 ? b / a - 1 : null; };
const vx = (i, t) => { let s = 0, n = 0; for (let k = t - 20; k < t; k++) { const v = V[i * T + k]; if (isFinite(v)) { s += v; n++; } } const v0 = V[i * T + t]; return n >= 15 && s > 0 && isFinite(v0) ? v0 / (s / n) : null; };
const liquid = (i, t) => { const c = C[i * T + t]; if (!(c >= 5)) return false; let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) { const c1 = C[i * T + k], v = V[i * T + k]; if (isFinite(c1) && isFinite(v)) { dv += c1 * v; n++; } } return n >= 15 && dv / n >= 5e6; };
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k > t; k--) { const z = isFinite(C[b + k]) ? C[b + k] : CX[b + k]; if (isFinite(z)) { last = z; break; } } return last === null ? null : last / e - 1; }
const ctrlC = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlC) return ctrlC[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && liquid(i, t)) { const g = fwd(i, t, h); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[key] = v.length >= 30 ? mean(v) : null); };
// chain map: symbol -> [{chain, layer}]
const members = []; for (const [chain, layers] of Object.entries(CH)) layers.forEach((L, li) => { for (const s of L.syms) if (SY.has(s)) members.push({ s, i: SY.get(s), chain, li }); });
// OWN BASELINE (added after the first run): the chain lists were written in 2026, so their members are, with hindsight, the AI-era
// winners and would beat the average stock on ANY day. The honest yardstick is the SAME stock on all its other days in the same half:
// a ripple must beat what that stock did anyway.
const midT = Math.floor((21 + T) / 2), ownC = {}; const own = (i, t, h) => { const half = t < midT ? 0 : 1, key = i + '_' + h + '_' + half; if (key in ownC) return ownC[key]; const v = []; for (let k = half ? midT : 21; k < (half ? T - 1 : midT); k += 2) if (liquid(i, k)) { const g = fwd(i, k, h); if (g !== null && Math.abs(g) < 3) v.push(g); } return (ownC[key] = v.length >= 30 ? mean(v) : null); };
const trades = {}; for (const v of ['SAME_LAYER', 'OTHER_LAYER']) for (const h of HOLDS) trades[v + '_' + h] = [];
let events = 0;
for (let t = 21; t < T - 1; t++) {
  const movers = members.filter(m => { const r = r1(m.i, t), x = vx(m.i, t); return r !== null && r >= 0.06 && x !== null && x >= 2 && liquid(m.i, t); });
  if (!movers.length) continue; events += movers.length; const seen = new Set();
  for (const m of movers) for (const o of members) { if (o.chain !== m.chain || o.s === m.s || movers.some(z => z.s === o.s)) continue;
    const r = r1(o.i, t); if (r === null || r < -0.02 || r > 0.01 || !liquid(o.i, t)) continue;   // has not moved yet
    const v = o.li === m.li ? 'SAME_LAYER' : 'OTHER_LAYER', key = v + o.s; if (seen.has(key)) continue; seen.add(key);
    for (const h of HOLDS) { const g = fwd(o.i, t, h), c0 = ctrl(t, h), ob = own(o.i, t, h); if (g === null || c0 === null || ob === null || Math.abs(g) > 3) continue; trades[v + '_' + h].push({ t, s: o.s, by: m.s, g, c: c0, ob }); } } }
const mid = Math.floor((21 + T) / 2), NV = Object.keys(trades).length, BAR = 2.4 + 0.1 * NV / 2;   // luck bar rises with the versions tried
const stat = (a, cost) => { if (a.length < 20) return { n: a.length }; const byT = {}; for (const z of a) (byT[z.t] = byT[z.t] || []).push(z.g - cost - z.c); const v = Object.values(byT).map(mean), m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / Math.max(1, v.length - 1));
  const p = a.map(z => z.g - cost).sort((x, y) => y - x); const oT = {}; for (const z of a) if (typeof z.ob === 'number') (oT[z.t] = oT[z.t] || []).push(z.g - z.ob); const ov = Object.values(oT).map(mean), om = ov.length ? mean(ov) : null, osd = ov.length > 1 ? Math.sqrt(ov.reduce((u, w) => u + (w - om) ** 2, 0) / (ov.length - 1)) : 0; return { vsOwn: om === null ? null : +om.toFixed(4), tOwn: osd > 0 ? +(om / (osd / Math.sqrt(ov.length))).toFixed(2) : null, n: a.length, days: v.length, avg: +mean(a.map(z => z.g - cost)).toFixed(4), ctrl: +mean(a.map(z => z.c)).toFixed(4), edge: +m.toFixed(4), t: sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : 0, win: +(a.filter(z => z.g - cost > 0).length / a.length).toFixed(3), noTop2: +mean(p.slice(2)).toFixed(4) }; };
const RES = {};
for (const [k, a] of Object.entries(trades)) { const R = { older: stat(a.filter(z => z.t < mid), COST), newer: stat(a.filter(z => z.t >= mid), COST), stress: stat(a.filter(z => z.t >= mid), STRESS) }, why = [];
  for (const hf of ['older', 'newer']) { const r = R[hf]; if (!(r.n >= 20)) { why.push('too few cases in the ' + hf + ' half (' + (r.n || 0) + ')'); continue; } if (!(r.edge > 0)) why.push('not better than an average stock in the ' + hf + ' half (' + pc(r.edge) + ')'); if (!(r.t >= BAR)) why.push('could be luck in the ' + hf + ' half (t ' + r.t + ', ' + BAR.toFixed(1) + ' needed)'); if (!(r.avg > 0)) why.push('lost money after costs in the ' + hf + ' half'); if (r.vsOwn !== null && r.vsOwn !== undefined && !(r.vsOwn > 0 && r.tOwn >= 2)) why.push('not clearly better than the same stock on its other days in the ' + hf + ' half (' + pc(r.vsOwn) + ', t ' + r.tOwn + ')'); }
  if (R.stress.n >= 20 && !(R.stress.avg > 0)) why.push('loses at 1.2% costs'); if (R.newer.n >= 20 && !(R.newer.noTop2 > 0)) why.push('loses without its 2 best trades');
  const verdict = !(R.older.n >= 20 && R.newer.n >= 20) ? 'TOO FEW CASES' : !why.length ? 'PROMISING' : R.older.edge > 0 && R.newer.edge > 0 ? 'NOT PROVEN' : 'REJECTED';
  RES[k] = { name: (k.startsWith('SAME') ? 'Peer in the same layer' : 'Supplier / customer in another layer') + ' that has not moved yet, after a chain member jumps 6%+ on 2x volume; held ' + k.split('_').pop() + ' sessions', verdict, why: why.join('; ') || 'beat the average stock in both halves, beyond luck, at stress cost', results: R }; }
// CUSTOMER MOMENTUM (Cohen & Frazzini 2008, "Economic links and predictable returns"): customers' news reaches their SUPPLIERS' prices
// with a delay. Chain layers run upstream (suppliers) to downstream (customers). Every 21 sessions, each member with downstream layers gets
// its customers' average return over the last 21 sessions; buy the top 20% of members by that, hold 21 sessions. Also the bottom 20%,
// to see the spread. Same costs, both halves, compared with the average liquid stock.
{ const top = [], bot = [];
  for (let t = 42; t < T - 22; t += 21) { const sc = [];
    for (const m of members) { const down = members.filter(o => o.chain === m.chain && o.li > m.li); if (!down.length || !liquid(m.i, t)) continue;
      const rr = down.map(o => { const a = C[o.i * T + t - 21], b = C[o.i * T + t]; return a > 0 && b > 0 ? b / a - 1 : null; }).filter(x => x !== null && Math.abs(x) < 2); if (rr.length < 2) continue; sc.push({ m, cr: mean(rr) }); }
    const uniq = new Map(); for (const x of sc) if (!uniq.has(x.m.s) || uniq.get(x.m.s).cr < x.cr) uniq.set(x.m.s, x); const L = [...uniq.values()].sort((a, b) => b.cr - a.cr); if (L.length < 10) continue;
    const q = Math.max(2, Math.floor(L.length * 0.2)), c0 = ctrl(t, 21); if (c0 === null) continue;
    for (const x of L.slice(0, q)) { const g = fwd(x.m.i, t, 21); const ob = own(x.m.i, t, 21); if (g !== null && ob !== null && Math.abs(g) < 3) top.push({ t, s: x.m.s, g, c: c0, ob }); }
    for (const x of L.slice(-q)) { const g = fwd(x.m.i, t, 21); if (g !== null && Math.abs(g) < 3) bot.push({ t, s: x.m.s, g, c: c0 }); } }
  trades.CUSTOMER_TOP_21 = top; const R = { older: stat(top.filter(z => z.t < mid), COST), newer: stat(top.filter(z => z.t >= mid), COST), stress: stat(top.filter(z => z.t >= mid), STRESS), bottom: { older: stat(bot.filter(z => z.t < mid), COST), newer: stat(bot.filter(z => z.t >= mid), COST) } }, why = [];
  for (const hf of ['older', 'newer']) { const r = R[hf]; if (!(r.n >= 20)) { why.push('too few cases in the ' + hf + ' half'); continue; } if (!(r.edge > 0)) why.push('not better than an average stock in the ' + hf + ' half (' + pc(r.edge) + ')'); if (!(r.t >= BAR)) why.push('could be luck in the ' + hf + ' half (t ' + r.t + ', ' + BAR.toFixed(1) + ' needed)'); if (!(r.avg > 0)) why.push('lost money after costs in the ' + hf + ' half'); if (R.bottom[hf].n >= 20 && !(r.avg > R.bottom[hf].avg)) why.push('top group not better than the bottom group in the ' + hf + ' half'); if (r.vsOwn !== null && r.vsOwn !== undefined && !(r.vsOwn > 0 && r.tOwn >= 2)) why.push('not clearly better than the same stock on its other days in the ' + hf + ' half (' + pc(r.vsOwn) + ', t ' + r.tOwn + ')'); }
  if (R.stress.n >= 20 && !(R.stress.avg > 0)) why.push('loses at 1.2% costs');
  RES.CUSTOMER_TOP_21 = { name: 'Customer momentum (Cohen-Frazzini): suppliers whose customers rose most last month, held 1 month', verdict: !(R.older.n >= 20 && R.newer.n >= 20) ? 'TOO FEW CASES' : !why.length ? 'PROMISING' : R.older.edge > 0 && R.newer.edge > 0 ? 'NOT PROVEN' : 'REJECTED', why: why.join('; ') || 'beat the average stock and the bottom group in both halves, beyond luck', results: R }; }
// today's ripple candidates (watch list): chain members that jumped today, and the connected names that have not moved
const tL = T - 1, todayMovers = members.filter(m => { const r = r1(m.i, tL), x = vx(m.i, tL); return r !== null && r >= 0.06 && x !== null && x >= 2; }).map(m => ({ sym: m.s, chain: m.chain, layer: CH[m.chain][m.li].layer, move: +r1(m.i, tL).toFixed(3) }));
// RUN ONCE per version: a version's first run with 20+ cases in both halves is frozen in firstRun.results and never overwritten;
// this run's numbers go to `latest` (monitoring only). The library (N1, N3, N4) reads firstRun only.
const PREV = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return {}; } })() || {};
const FR = freezeEach(PREV.firstRun && PREV.firstRun.results, RES, (r) => r.verdict !== 'TOO FEW CASES');
const firstRun = Object.keys(FR).length ? { at: (PREV.firstRun && PREV.firstRun.at) || new Date().toISOString(), bar: (PREV.firstRun && PREV.firstRun.bar) || +BAR.toFixed(2), results: FR } : null;
const RESF = Object.fromEntries(Object.keys(RES).map(k => [k, FR[k] || { ...RES[k], verdict: 'NO VERDICT YET (' + RES[k].verdict + ')' }]));
const out = { generatedAt: new Date().toISOString(), from: D[21], to: D[tL], events, versions: NV, bar: +BAR.toFixed(2), caveat: 'Chain membership is today’s knowledge (not point in time): a pass goes to live paper first. results = the frozen first verdict of each version (firstRun); latest = monitoring only.', results: RESF, firstRun, latest: latestBlock({ at: new Date().toISOString(), to: D[tL], bar: +BAR.toFixed(2), results: RES }), todayMovers };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('CHAIN RIPPLE (' + out.from + ' to ' + out.to + ', ' + events + ' chain-member jumps)');
for (const r of Object.values(RESF)) console.log('- ' + r.name + ': ' + r.verdict + (r.results.newer.n ? ' | newer half ' + r.results.newer.n + ' trades, ' + pc(r.results.newer.avg) + ' a trade, ' + pc(r.results.newer.edge) + ' vs an average stock, t ' + r.results.newer.t + (typeof r.results.newer.vsOwn === 'number' ? ', ' + pc(r.results.newer.vsOwn) + ' vs the same stock on other days (t ' + r.results.newer.tOwn + ')' : '') : '') + (r.verdict !== 'PROMISING' ? ' (' + r.why.split(';')[0] + ')' : ''));
// write the verdict into the strategy library (N1 supply-chain laggard, N3 sympathy move)
try { const LB = JSON.parse(fs.readFileSync('data/strategy-library.json', 'utf8')), best = (pre) => Object.entries(FR).filter(([k]) => k.startsWith(pre)).map(([, r]) => r.verdict).sort((a, b) => ['PROMISING', 'NOT PROVEN', 'REJECTED', 'TOO FEW CASES'].indexOf(a) - ['PROMISING', 'NOT PROVEN', 'REJECTED', 'TOO FEW CASES'].indexOf(b))[0];
  const fd = firstRun ? firstRun.at.slice(0, 10) : null; if (fd) for (const e of LB.strategies) { if (e.id === 'N1' && best('OTHER')) { e.status = 'tested: ' + best('OTHER').toLowerCase(); e.tested = fd; e.note = 'chain-ripple.mjs, other-layer version (suppliers/customers).'; } if (e.id === 'N4' && FR.CUSTOMER_TOP_21) { e.status = 'tested: ' + FR.CUSTOMER_TOP_21.verdict.toLowerCase(); e.tested = fd; } if (e.id === 'N3' && best('SAME')) { e.status = 'tested: ' + best('SAME').toLowerCase(); e.tested = fd; e.note = 'chain-ripple.mjs, same-layer version (peers).'; } }
  fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) {}
