// AUTOLAB: the system invents its own trading rules, tests them, and keeps only what survives. Read-only; never places an order.
// Every Sunday it builds NEW candidate rules by combining fixed building blocks (trend, momentum, pullback depth, short drop, volume,
// distance from the 1-year high, daily swing size, market state) with a holding period, and puts each through three gates that are
// kept strictly apart so the system cannot fool itself:
//   1. DISCOVERY (the oldest 60% of the 5 years): must beat an average stock bought the same days, after costs, beyond luck. The luck
//      bar counts EVERY rule ever tried (data/autolab.json keeps them all), so the more it tries, the harder a pass gets.
//   2. VALIDATION (the next 20%): the same rule, unchanged, must still beat the average stock.
//   3. VAULT (the newest 20%): looked at once per rule, only after 1 and 2 pass. Must still win.
//   4. LIVE PAPER: survivors' picks are logged every week and scored on real later prices. 30+ paper trades, positive after costs and
//      better than the average stock, before a rule may appear in your ACTIONS (as AUTO-DISCOVERED, with its record).
// A rule is never tested twice (same id = same rule), and none is ever adjusted after seeing its result.
// Output: data/autolab.json (every rule tried, its verdicts, live candidates, their paper record, this week's picks).
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org', OUT = 'data/autolab.json';
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
fs.mkdirSync('data', { recursive: true });
const PER_WEEK = +(env.AUTO_N || 60), COST = 0.008, GONE = -0.3;
const LAB = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return { tried: {}, candidates: {}, paper: [], weeks: 0 }; } })();
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('autolab: no price cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 500) { console.log('autolab: only ' + T + ' sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), HI = new Float32Array(NS * T).fill(NaN), LO = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; HI[k] = x.h ? x.h[j] : x.c[j]; LO[k] = x.l ? x.l[j] : x.c[j]; V[k] = x.v[j]; } }); store = null;
const spyI = SY.get('SPY');
// ---- features per stock-day (all known at the close of day t)
const F = { tr50: new Int8Array(NS * T), tr200: new Int8Array(NS * T), m6: new Float32Array(NS * T).fill(NaN), dd20: new Float32Array(NS * T).fill(NaN), r5: new Float32Array(NS * T).fill(NaN), vx: new Float32Array(NS * T).fill(NaN), dh: new Float32Array(NS * T).fill(NaN), atrp: new Float32Array(NS * T).fill(NaN), ok: new Uint8Array(NS * T) };
for (let i = 0; i < NS; i++) { const b = i * T; let s50 = 0, s200 = 0, sv = 0, dv = 0, tr = 0; const q50 = [], q200 = [], qv = [], dq = [], tq = [], h20 = [], h252 = [];
  for (let t = 0; t < T; t++) { const c = C[b + t]; if (!isFinite(c)) { q50.length = q200.length = qv.length = dq.length = tq.length = h20.length = h252.length = 0; s50 = s200 = sv = dv = tr = 0; continue; } const k = b + t;
    q50.push(c); s50 += c; if (q50.length > 50) s50 -= q50.shift(); q200.push(c); s200 += c; if (q200.length > 200) s200 -= q200.shift();
    const v = V[k]; if (qv.length === 20) F.vx[k] = sv / 20 > 0 ? v / (sv / 20) : NaN; qv.push(v); sv += v; if (qv.length > 20) sv -= qv.shift();
    dq.push(c * v); dv += c * v; if (dq.length > 20) dv -= dq.shift();
    const pcl = t > 0 && isFinite(C[k - 1]) ? C[k - 1] : c, x = Math.max(HI[k], pcl) - Math.min(LO[k], pcl); tq.push(x); tr += x; if (tq.length > 14) tr -= tq.shift(); if (tq.length === 14) F.atrp[k] = tr / 14 / c;
    h20.push(HI[k]); if (h20.length > 20) h20.shift(); h252.push(HI[k]); if (h252.length > 252) h252.shift();
    if (q50.length === 50) F.tr50[k] = c > s50 / 50 ? 1 : -1; if (q200.length === 200) F.tr200[k] = c > s200 / 200 ? 1 : -1;
    if (t >= 126 && isFinite(C[k - 126])) F.m6[k] = c / C[k - 126] - 1; if (t >= 5 && isFinite(C[k - 5])) F.r5[k] = c / C[k - 5] - 1;
    if (h20.length === 20) F.dd20[k] = 1 - c / Math.max(...h20); if (h252.length >= 200) F.dh[k] = 1 - c / Math.max(...h252);
    F.ok[k] = c >= 5 && dq.length === 20 && dv / 20 >= 5e6 ? 1 : 0; } }
const mktUp = new Int8Array(T); if (spyI !== undefined) { let s = 0; const q = []; for (let t = 0; t < T; t++) { const c = C[spyI * T + t]; if (!isFinite(c)) continue; q.push(c); s += c; if (q.length > 50) s -= q.shift(); if (q.length === 50) mktUp[t] = c > s / 50 ? 1 : -1; } }
// ---- building blocks (each a fixed yes/no test on a stock-day)
const BLOCKS = {
  up50: [(k) => F.tr50[k] === 1, 'above its 50-day average'], dn50: [(k) => F.tr50[k] === -1, 'under its 50-day average'],
  up200: [(k) => F.tr200[k] === 1, 'above its 200-day average'], dn200: [(k) => F.tr200[k] === -1, 'under its 200-day average'],
  momHi: [(k) => F.m6[k] >= 0.3, 'up 30%+ in 6 months'], momLo: [(k) => F.m6[k] <= -0.2, 'down 20%+ in 6 months'],
  pb5: [(k) => F.dd20[k] >= 0.05 && F.dd20[k] < 0.12, '5-12% under its 20-day high'], pb12: [(k) => F.dd20[k] >= 0.12 && F.dd20[k] < 0.25, '12-25% under its 20-day high'],
  drop5: [(k) => F.r5[k] <= -0.07, 'fell 7%+ in 5 days'], pop5: [(k) => F.r5[k] >= 0.07, 'rose 7%+ in 5 days'],
  volHi: [(k) => F.vx[k] >= 2, 'volume 2x+ its normal day'], volLo: [(k) => F.vx[k] <= 0.6, 'quiet volume (under 0.6x)'],
  nearHi: [(k) => F.dh[k] <= 0.03, 'within 3% of its 1-year high'], farHi: [(k) => F.dh[k] >= 0.4, '40%+ under its 1-year high'],
  calm: [(k) => F.atrp[k] <= 0.02, 'calm (daily swing under 2%)'], wild: [(k) => F.atrp[k] >= 0.05, 'wild (daily swing 5%+)'],
  mktUp: [(k, t) => mktUp[t] === 1, 'S&P 500 above its 50-day average'], mktDn: [(k, t) => mktUp[t] === -1, 'S&P 500 under its 50-day average'] };
const BK = Object.keys(BLOCKS), HOLDS = [5, 20, 60], CLASH = [['up50', 'dn50'], ['up200', 'dn200'], ['momHi', 'momLo'], ['pb5', 'pb12'], ['drop5', 'pop5'], ['volHi', 'volLo'], ['nearHi', 'farHi'], ['calm', 'wild'], ['mktUp', 'mktDn'], ['nearHi', 'pb12'], ['nearHi', 'drop5']];
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(+(env.AUTO_SEED || (Date.parse(D[T - 1]) / 864e5 | 0)));
const ruleId = (r) => [...r.b].sort().join('+') + '/h' + r.h;
function newRules(n) { const out = []; let guard = 0; while (out.length < n && guard++ < n * 50) { const k = 2 + Math.floor(rnd() * 2), b = new Set(); while (b.size < k) b.add(BK[Math.floor(rnd() * BK.length)]);
  const arr = [...b]; if (CLASH.some(([x, y]) => b.has(x) && b.has(y))) continue; const r = { b: arr, h: HOLDS[Math.floor(rnd() * HOLDS.length)] }, id = ruleId(r); if (LAB.tried[id] || out.some(z => ruleId(z) === id)) continue; out.push(r); } return out; }
// ---- testing
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null, lk = t; for (let k = t + 1; k <= t + h; k++) if (isFinite(C[b + k])) { last = C[b + k]; lk = k; }
  if (last === null) return null; if (lk === t + h) return last / e - 1; let later = false; for (let k = t + h + 1; k < Math.min(T, t + h + 15); k++) if (isFinite(C[b + k])) { later = true; break; } if (later) return last / e - 1; if (t + h + 15 >= T) return null; return Math.max(-1, last / e - 1 + GONE); }
const ctrlCache = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlCache) return ctrlCache[key]; const v = []; for (let i = 0; i < NS; i += 3) if (i !== spyI && F.ok[i * T + t]) { const g = fwd(i, t, h); if (g !== null && isFinite(g)) v.push(g); } return (ctrlCache[key] = v.length >= 30 ? mean(v) : null); };
const P1 = Math.floor(T * 0.6), P2 = Math.floor(T * 0.8), STEP = 3;   // signals checked every 3rd session (speed); one trade per stock per holding period
function run(r, from, to) { const tr = []; const fs_ = r.b.map(x => BLOCKS[x][0]);
  for (let i = 0; i < NS; i++) { if (i === spyI) continue; let free = 0; for (let t = Math.max(from, 252); t < Math.min(to, T - r.h - 1); t += STEP) { if (t < free) continue; const k = i * T + t; if (!F.ok[k]) continue; let hit = true; for (const f of fs_) if (!f(k, t)) { hit = false; break; } if (!hit) continue;
    const g = fwd(i, t, r.h), c0 = ctrl(t, r.h); if (g === null || c0 === null) continue; tr.push({ t, s: SYMS[i], x: g - c0, g: g - COST }); free = t + r.h; } }
  return tr; }
function judge(tr, bar) { if (tr.length < 40) return { pass: false, n: tr.length, why: 'too few trades (' + tr.length + ')' };
  const byT = {}; for (const z of tr) (byT[z.t] = byT[z.t] || []).push(z.x - COST); const v = Object.values(byT).map(mean), m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / Math.max(1, v.length - 1)), t = sd > 0 ? m / (sd / Math.sqrt(v.length)) : 0;
  const avg = mean(tr.map(z => z.g)), byS = {}; let pos = 0; for (const z of tr) if (z.g > 0) { byS[z.s] = (byS[z.s] || 0) + z.g; pos += z.g; } const top = pos > 0 ? Math.max(...Object.values(byS)) / pos : 1;
  const why = []; if (!(m > 0.003)) why.push('not 0.3%+ better than an average stock (' + pc(m) + ')'); if (!(t >= bar)) why.push('could be luck (t ' + t.toFixed(1) + ', ' + bar.toFixed(1) + ' needed)'); if (!(avg > 0)) why.push('lost money after costs'); if (top > 0.25) why.push('one stock made over 25% of the profit');
  return { pass: !why.length, n: tr.length, days: v.length, edge: +m.toFixed(4), t: +t.toFixed(2), avg: +avg.toFixed(4), why: why.join('; ') }; }
function erfc(x) { const z = Math.abs(x), t = 1 / (1 + z / 2), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
const zInv = (p) => { let lo = 0, hi = 10; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (0.5 * erfc(m / Math.SQRT2) > p) lo = m; else hi = m; } return (lo + hi) / 2; };
const name = (r) => r.b.map(x => BLOCKS[x][1]).join(' + ') + ', held ' + r.h + ' sessions';
// ---- 1. this week's new rules through the three gates
const fresh = newRules(PER_WEEK), totalTried = Object.keys(LAB.tried).length + fresh.length, BAR = Math.max(2.5, zInv(0.05 / totalTried)), VBAR = 2;
let passedAll = 0;
for (const r of fresh) { const id = ruleId(r), d1 = judge(run(r, 0, P1), BAR); let d2 = null, d3 = null, verdict = 'FAILED DISCOVERY';
  if (d1.pass) { d2 = judge(run(r, P1, P2), VBAR); verdict = 'FAILED VALIDATION'; if (d2.pass) { d3 = judge(run(r, P2, T), VBAR); verdict = d3.pass ? 'LIVE CANDIDATE' : 'FAILED VAULT'; } }
  LAB.tried[id] = { week: D[T - 1], name: name(r), b: r.b, h: r.h, verdict, discovery: d1, validation: d2, vault: d3 };
  if (verdict === 'LIVE CANDIDATE') { LAB.candidates[id] = { since: D[T - 1], name: name(r), b: r.b, h: r.h }; passedAll++; } }
// ---- 2. live paper: score last weeks' picks whose holding period has ended, then log this week's picks of every candidate
const idx = new Map(D.map((d, t) => [d, t]));
for (const p of LAB.paper) { if (p.done) continue; const t = idx.get(p.d), i = SY.get(p.sym); if (t === undefined || i === undefined || t + p.h >= T) continue; const g = fwd(i, t, p.h), c0 = ctrl(t, p.h); if (g === null) continue; p.g = +(g - COST).toFixed(4); p.x = c0 === null ? null : +(g - c0).toFixed(4); p.done = true; }
const tLast = T - 1, today = {};
for (const [id, c] of Object.entries(LAB.candidates)) { const fs_ = c.b.map(x => BLOCKS[x][0]), picks = [];
  for (let i = 0; i < NS; i++) { if (i === spyI) continue; const k = i * T + tLast; if (!F.ok[k]) continue; if (fs_.every(f => f(k, tLast))) picks.push(SYMS[i]); }
  const sel = picks.slice(0, 15); today[id] = sel; for (const s of sel) if (!LAB.paper.some(p => p.id === id && p.sym === s && p.d === D[tLast])) LAB.paper.push({ id, sym: s, d: D[tLast], h: c.h }); }
const rec = {}; for (const p of LAB.paper.filter(z => z.done)) { const r = rec[p.id] || (rec[p.id] = { n: 0, g: 0, x: 0, nx: 0, win: 0 }); r.n++; r.g += p.g; if (p.x !== null) { r.x += p.x; r.nx++; } if (p.g > 0) r.win++; }
for (const [id, c] of Object.entries(LAB.candidates)) { const r = rec[id]; c.paper = r ? { n: r.n, avg: +(r.g / r.n).toFixed(4), vsAvg: r.nx ? +(r.x / r.nx).toFixed(4) : null, win: +(r.win / r.n).toFixed(3) } : { n: 0 };
  c.status = c.paper.n >= 30 && c.paper.avg > 0 && c.paper.vsAvg > 0 ? 'PROVEN LIVE' : c.paper.n >= 30 ? 'FAILED LIVE' : 'ON PAPER'; c.today = today[id] || []; }
for (const [id, c] of Object.entries(LAB.candidates)) if (c.status === 'FAILED LIVE') { LAB.tried[id].verdict = 'FAILED LIVE'; delete LAB.candidates[id]; }
if (LAB.paper.length > 20000) LAB.paper = LAB.paper.slice(-20000);
LAB.weeks++; LAB.generatedAt = new Date().toISOString(); LAB.status = 'OK'; LAB.last = { week: D[T - 1], tested: fresh.length, passed: passedAll, bar: +BAR.toFixed(2), totalTried };
fs.writeFileSync(OUT, JSON.stringify(LAB));
const cand = Object.values(LAB.candidates), msg = ['AUTOLAB: the system invented and tested ' + fresh.length + ' new rules this week (' + totalTried + ' tried in total; luck bar t ' + BAR.toFixed(1) + ')', '',
  passedAll ? passedAll + ' passed discovery, validation AND the untouched vault: now on live paper.' : 'None passed all three gates this week. That is the normal result; it means the bar is working.',
  'Failed at discovery ' + fresh.filter(r => LAB.tried[ruleId(r)].verdict === 'FAILED DISCOVERY').length + ', validation ' + fresh.filter(r => LAB.tried[ruleId(r)].verdict === 'FAILED VALIDATION').length + ', vault ' + fresh.filter(r => LAB.tried[ruleId(r)].verdict === 'FAILED VAULT').length + '.', '',
  ...(cand.length ? ['LIVE CANDIDATES (' + cand.length + '):', ...cand.map(c => '- ' + c.name + ': ' + c.status + (c.paper.n ? ' (' + c.paper.n + ' paper trades, ' + pc(c.paper.avg) + ' a trade, ' + pc(c.paper.vsAvg) + ' vs an average stock)' : ' (paper starts now)'))] : ['No live candidates yet.']),
  '', 'Only PROVEN LIVE rules (30+ paper trades, profitable and better than an average stock) reach your ACTIONS. Research only.'];
console.log(msg.join('\n'));
if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
