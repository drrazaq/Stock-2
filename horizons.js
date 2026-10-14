// HORIZONS: mid- and long-term setups, not only quick trades. Read-only; never places an order.
// The owner's question: "many stocks pull back, then rocket up; why does the system only look at the next few days?" The quick and
// swing rules hold days to weeks. This tests fixed, pre-registered setups held for 1, 3 and 6 MONTHS (20 / 60 / 120 sessions)
// on 5 years of the whole US market (stocks that later collapsed included), bought at the next open, with a tested safety stop
// (a close 25% under the entry is sold at the next open), 0.8% costs (1.2% stress). Each is compared with an AVERAGE liquid stock
// bought the same day and held as long (so a rising market is not mistaken for skill), older and newer half.
// Setups (fixed in advance, not tuned):
//  PB_UP   Pullback in a long uptrend: above its 200-day average, 8-25% under its 1-year high, it had dipped under its 50-day
//          average and today closes back above its 20-day average.
//  PB_DEEP Deep pullback of a strong stock: top 30% of 6-month gains, 15-35% under its 1-year high, closes back above its 10-day.
//  LEADER  Long-term leader: top 10% of 12-month gains (skipping the last month), above its 200-day average (classic momentum).
//  TURN    Trend turn of a beaten-down stock: 30%+ under its 1-year high, under its 200-day, closes back above its 50-day average.
// Also judged against simply holding the S&P 500 over the same days; 40+ trades a half; no stock over 25% of the profit; the worst
// trade and the average low point during the hold are reported (the 25% stop is fixed in advance, not chosen after the results).
// Output: data/horizons.json (verdict per setup x horizon, and which stocks are in each setup today).
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org', OUT = 'data/horizons.json';
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
fs.mkdirSync('data', { recursive: true });
const H = [20, 60, 120], COST = 0.008, STRESS = 0.012, STOP = 0.75, GONE = -0.3;
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no price cache' })); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 400) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'only ' + T + ' sessions' })); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; } }); store = null;
const spyI = SY.get('SPY');
// forward result from the next open, H sessions, with the safety stop (a close under 75% of the entry -> sold at the next open)
let MAE = 0;   // worst close vs the entry during the last fwd() call
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; MAE = 0; if (!(e > 0) || t + h >= T) return null; let last = null;
  for (let k = t + 1; k <= t + h; k++) { const c = C[b + k]; if (!isFinite(c)) continue; last = c; if (c / e - 1 < MAE) MAE = c / e - 1; if (c < e * STOP && k < t + h) { const n = O[b + k + 1]; return isFinite(n) ? n / e - 1 : c / e - 1; } }
  if (last === null) return null; if (isFinite(C[b + t + h])) return C[b + t + h] / e - 1;
  let later = false; for (let k = t + h + 1; k < Math.min(T, t + h + 15); k++) if (isFinite(C[b + k])) { later = true; break; } if (later) return last / e - 1; if (t + h + 15 >= T) return null; return Math.max(-1, last / e - 1 + GONE); }
// per stock rolling values: 10/20/50/200-day averages, 252-day high, 6- and 12-month returns
const SETUPS = ['PB_UP', 'PB_DEEP', 'LEADER', 'TURN'], NAME = { PB_UP: 'Pullback in a long uptrend, back above its 20-day', PB_DEEP: 'Deep pullback of a strong stock, back above its 10-day', LEADER: 'Long-term leader (top 10% of 12-month gains)', TURN: 'Beaten-down stock turning up (back above its 50-day)' };
const sig = {}; for (const s of SETUPS) sig[s] = [];   // { i, t }
const r6 = [], r12 = []; for (let t = 0; t < T; t++) { r6.push([]); r12.push([]); }
const st = new Array(NS);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T, q10 = [], q20 = [], q50 = [], q200 = []; let s10 = 0, s20 = 0, s50 = 0, s200 = 0, dipped50 = -999, dv = 0; const dq = [];
  const A = { a20: new Float32Array(T).fill(NaN), a10: new Float32Array(T).fill(NaN), a50: new Float32Array(T).fill(NaN), a200: new Float32Array(T).fill(NaN), hi: new Float32Array(T).fill(NaN), ok: new Uint8Array(T) }; st[i] = A;
  const hiq = []; // monotonic deque for 252-day high of closes
  for (let t = 0; t < T; t++) { const c = C[b + t]; if (!isFinite(c)) { q10.length = q20.length = q50.length = q200.length = 0; s10 = s20 = s50 = s200 = 0; hiq.length = 0; dq.length = 0; dv = 0; continue; }
    const push = (q, s, n) => { q.push(c); s += c; if (q.length > n) s -= q.shift(); return s; }; s10 = push(q10, s10, 10); s20 = push(q20, s20, 20); s50 = push(q50, s50, 50); s200 = push(q200, s200, 200);
    while (hiq.length && hiq[hiq.length - 1][1] <= c) hiq.pop(); hiq.push([t, c]); while (hiq[0][0] <= t - 252) hiq.shift();
    dq.push(c * V[b + t]); dv += c * V[b + t]; if (dq.length > 20) dv -= dq.shift();
    if (q10.length === 10) A.a10[t] = s10 / 10; if (q20.length === 20) A.a20[t] = s20 / 20; if (q50.length === 50) A.a50[t] = s50 / 50; if (q200.length === 200) A.a200[t] = s200 / 200; A.hi[t] = hiq[0][1];
    A.ok[t] = c >= 5 && dq.length === 20 && dv / 20 >= 5e6 ? 1 : 0;
    if (t >= 126 && isFinite(C[b + t - 126]) && A.ok[t]) r6[t].push([i, c / C[b + t - 126] - 1]);
    if (t >= 252 && isFinite(C[b + t - 21]) && isFinite(C[b + t - 252]) && A.ok[t]) r12[t].push([i, C[b + t - 21] / C[b + t - 252] - 1]); } }
// cross-sectional ranks for momentum
const top6 = r6.map(L => { if (L.length < 50) return null; const s = [...L].sort((a, b) => b[1] - a[1]); return new Set(s.slice(0, Math.ceil(s.length * 0.3)).map(x => x[0])); });
const top12 = r12.map(L => { if (L.length < 50) return null; const s = [...L].sort((a, b) => b[1] - a[1]); return new Set(s.slice(0, Math.ceil(s.length * 0.1)).map(x => x[0])); });
const inSetup = (i, t) => { const A = st[i]; if (!A || !A.ok[t]) return []; const b = i * T, c = C[b + t], p = C[b + t - 1], out = [], dd = A.hi[t] > 0 ? 1 - c / A.hi[t] : null; if (!isFinite(p)) return out;
  let dipped = false; for (let k = t - 10; k < t; k++) if (k >= 0 && isFinite(C[b + k]) && C[b + k] < A.a50[k]) { dipped = true; break; }
  if (c > A.a200[t] && dd >= 0.08 && dd <= 0.25 && dipped && c > A.a20[t] && !(p > A.a20[t - 1])) out.push('PB_UP');
  if (top6[t] && top6[t].has(i) && dd >= 0.15 && dd <= 0.35 && c > A.a10[t] && !(p > A.a10[t - 1])) out.push('PB_DEEP');
  if (top12[t] && top12[t].has(i) && c > A.a200[t] && !(top12[t - 1] && top12[t - 1].has(i) && p > A.a200[t - 1])) out.push('LEADER');
  if (dd >= 0.30 && c < A.a200[t] && c > A.a50[t] && !(p > A.a50[t - 1])) out.push('TURN');
  return out; };
// average liquid stock bought the same day (the control), per horizon
const ctrl = H.map(() => new Float32Array(T).fill(NaN));
for (let t = 252; t < T - 1; t++) { if (t % 1 !== 0) continue; const ids = []; for (let i = 0; i < NS; i++) if (st[i] && st[i].ok[t]) ids.push(i); if (ids.length < 50) continue;
  H.forEach((h, k) => { if (t + h >= T) return; const smp = ids.length > 600 ? ids.filter((_, n) => n % Math.ceil(ids.length / 600) === 0) : ids; const v = smp.map(i => fwd(i, t, h)).filter(x => x !== null && isFinite(x)); if (v.length >= 30) ctrl[k][t] = mean(v); }); }
// signals: one per stock per horizon window (no overlapping trades of the same stock)
const trades = {}; for (const s of SETUPS) for (const h of H) trades[s + '_' + h] = [];
const nextFree = {}; const today = {}; for (const s of SETUPS) today[s] = [];
for (let t = 252; t < T; t++) for (let i = 0; i < NS; i++) { if (!st[i] || !st[i].ok[t]) continue; const L = inSetup(i, t); if (!L.length) continue;
  for (const s of L) { if (t === T - 1) today[s].push(SYMS[i]);
    H.forEach((h, k) => { const key = s + '_' + h, nf = nextFree[key + i] || 0; if (t < nf) return; const g = fwd(i, t, h); if (g === null || !isFinite(ctrl[k][t])) return; const mae = MAE, sb = spyI * T, se = O[sb + t + 1], sz = C[sb + t + h]; nextFree[key + i] = t + h; trades[key].push({ t, s: SYMS[i], g, c: ctrl[k][t], spy: se > 0 && sz > 0 ? sz / se - 1 : null, mae }); }); } }
const mid = Math.floor((252 + T) / 2), RES = {};
const stats = (a, cost) => { if (!a.length) return { n: 0 }; const p = a.map(x => x.g - cost), w = p.filter(x => x > 0), l = p.filter(x => x <= 0), sm = z => z.reduce((u, v) => u + v, 0), srt = [...p].sort((u, v) => v - u);
  return { n: p.length, win: w.length / p.length, avg: sm(p) / p.length, ctrl: mean(a.map(x => x.c - cost)), pf: l.length && sm(l) < 0 ? sm(w) / -sm(l) : w.length ? 99 : null, bestShare: sm(w) > 0 ? Math.max(...w) / sm(w) : null, noTop2: srt.length > 2 ? sm(srt.slice(2)) / (srt.length - 2) : null, days: new Set(a.map(x => x.t)).size, spy: mean(a.filter(x => x.spy !== null).map(x => x.spy)), worst: Math.min(...p), avgMAE: mean(a.map(x => x.mae)), topStock: (() => { const by = {}; let tot = 0; a.forEach((x, k) => { if (p[k] > 0) { by[x.s] = (by[x.s] || 0) + p[k]; tot += p[k]; } }); return tot > 0 ? Math.max(...Object.values(by)) / tot : null; })() }; };
for (const s of SETUPS) for (const h of H) { const a = trades[s + '_' + h], o = a.filter(x => x.t < mid), w = a.filter(x => x.t >= mid), R = { older: stats(o, COST), newer: stats(w, COST), stress: stats(w, STRESS) }, why = [], need = 0.005 * h / 20;
  let verdict = 'PROMISING';
  if (R.older.n < 40 || R.newer.n < 40) { verdict = 'NOT PROVEN'; why.push('too few trades (' + R.older.n + ' / ' + R.newer.n + '; 40 each needed)'); }
  else { for (const k of ['older', 'newer']) { if (!(R[k].avg > 0)) why.push('lost money in the ' + k + ' half'); if (!(R[k].avg > R[k].ctrl + need)) why.push('not ' + pc(need) + '+ better than an average stock in the ' + k + ' half (' + pc(R[k].avg) + ' vs ' + pc(R[k].ctrl) + ')'); }
    if (!(R.newer.pf >= 1.2)) why.push('profit factor ' + (R.newer.pf || 0).toFixed(2)); if (!(R.stress.avg > 0)) why.push('loses at 1.2% cost'); if (!(R.newer.noTop2 > 0)) why.push('loses without its 2 best trades');
    if (R.newer.bestShare > 0.2) why.push('one trade made 20%+ of the profit'); for (const k of ['older', 'newer']) if (!(R[k].avg > (R[k].spy || 0) - COST)) why.push('did not beat simply holding the S&P 500 in the ' + k + ' half (' + pc(R[k].avg) + ' vs ' + pc(R[k].spy) + ')'); if (R.newer.topStock > 0.25) why.push('one stock made over 25% of the profit'); if (R.newer.days < 30) why.push('only ' + R.newer.days + ' different days');
    if (why.length) verdict = R.older.avg > 0 && R.newer.avg > 0 ? 'NOT PROVEN' : 'REJECTED'; }
  RES[s + '_' + h] = { setup: s, name: NAME[s], hold: h, months: Math.round(h / 21), verdict, why: why.join('; ') || 'beat an average stock bought the same day in both halves, at stress cost, without its 2 best trades', results: R }; }
const spy = (h) => { const a = []; for (let t = 252; t + h < T; t += h) { const b = spyI * T, e = O[b + t + 1], z = C[b + t + h]; if (e > 0 && z > 0) a.push(z / e - 1); } return mean(a); };
const out = { generatedAt: new Date().toISOString(), status: 'OK', from: D[252], to: D[T - 1], versions: SETUPS.length * H.length, spy: Object.fromEntries(H.map(h => [h, spy(h)])), results: RES, today, rules: { stopAt: STOP, cost: COST } };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const msg = ['HORIZONS (mid and long term: 1, 3 and 6 months; 5 years, whole market, vs an average stock bought the same day)', ''];
for (const s of SETUPS) { msg.push(NAME[s] + ':'); for (const h of H) { const r = RES[s + '_' + h], n = r.results.newer; msg.push('  ' + r.months + ' month' + (r.months > 1 ? 's' : '') + ': ' + r.verdict + (n.n ? ' | newer half ' + n.n + ' trades, ' + pc(n.avg) + ' vs average stock ' + pc(n.ctrl) + ', ' + Math.round(n.win * 100) + '% won, S&P 500 ' + pc(n.spy) + ', worst trade ' + pc(n.worst) + ', average low point ' + pc(n.avgMAE) : '') + (r.verdict !== 'PROMISING' ? ' (' + r.why.split(';')[0] + ')' : '')); }
  if (today[s].length && Object.values(RES).some(r => r.setup === s && r.verdict === 'PROMISING')) msg.push('  In this setup today: ' + today[s].slice(0, 10).join(', ')); }
msg.push('', SETUPS.length * H.length + ' versions tested, so about 1 could pass by luck. A pass goes to paper first. Research only.');
console.log(msg.join('\n'));
if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
