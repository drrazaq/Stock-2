// STOP STUDY: where should the stop go on a stock you buy yourself (or one a source names)? Read-only; never places an order.
// The system's old default for your own buys (2 daily ranges under the price, or the 50-day average if closer) was never tested,
// and in the 15 Oct drop it was hit on almost every stock. This tests 10 stop rules, fixed in advance, on 5 years of the whole US
// market (stocks that later collapsed included), on two kinds of buys: ANY liquid stock, and STRONG stocks (top 30% of 6-month
// gains, the kind you and your sources tend to buy). Each buy is held up to 60 sessions; a stop is hit when a CLOSE is at or under it,
// and the stock is sold at the next open (no perfect fills). Every rule is compared with NO STOP on the same buys, on the money you
// actually end with after 60 sessions (cash after a stop earns nothing). Output: data/stops.json.
// Stop rules: NONE | PCT10 PCT15 PCT20 PCT25 PCT35 (that far under the buy) | ATR2 ATR3 ATR4 (2/3/4 average daily ranges under the buy)
//             OLD (the old default: the higher of 2 daily ranges under the buy and the 50-day average when it is under the price)
// THE RECOMMENDED STOP, chosen by a rule fixed in advance: among the rules that cost at most 0.5% a buy against no stop in both halves
// (and no t-stat under -2), the one with the smallest average loss in the worst 5% of buys. It is a safety rule, not a profit rule.
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org', OUT = 'data/stops.json';
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
fs.mkdirSync('data', { recursive: true });
const H = 60, GONE = -0.3, STEP = 5, PER = +(env.ST_PER || 40);
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no price cache' })); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 400) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'only ' + T + ' sessions' })); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), HI = new Float32Array(NS * T).fill(NaN), LO = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; HI[k] = x.h ? x.h[j] : x.c[j]; LO[k] = x.l ? x.l[j] : x.c[j]; V[k] = x.v[j]; } }); store = null;
const spyI = SY.get('SPY');
// per stock: 14-day ATR, 50-day average, liquidity, 6-month gain
const ATR = new Float32Array(NS * T).fill(NaN), A50 = new Float32Array(NS * T).fill(NaN), OK = new Uint8Array(NS * T), G6 = new Float32Array(NS * T).fill(NaN);
for (let i = 0; i < NS; i++) { const b = i * T; let tr = 0, s50 = 0, dv = 0; const tq = [], q50 = [], dq = [];
  for (let t = 0; t < T; t++) { const c = C[b + t]; if (!isFinite(c)) { tq.length = q50.length = dq.length = 0; tr = s50 = dv = 0; continue; }
    const pcl = t > 0 && isFinite(C[b + t - 1]) ? C[b + t - 1] : c, x = Math.max(HI[b + t], pcl) - Math.min(LO[b + t], pcl); tq.push(x); tr += x; if (tq.length > 14) tr -= tq.shift(); if (tq.length === 14) ATR[b + t] = tr / 14;
    q50.push(c); s50 += c; if (q50.length > 50) s50 -= q50.shift(); if (q50.length === 50) A50[b + t] = s50 / 50;
    dq.push(c * V[b + t]); dv += c * V[b + t]; if (dq.length > 20) dv -= dq.shift(); OK[b + t] = c >= 5 && dq.length === 20 && dv / 20 >= 5e6 ? 1 : 0;
    if (t >= 126 && isFinite(C[b + t - 126])) G6[b + t] = c / C[b + t - 126] - 1; } }
const RULES = ['NONE', 'PCT10', 'PCT15', 'PCT20', 'PCT25', 'PCT35', 'ATR2', 'ATR3', 'ATR4', 'OLD'];
const NAME = { NONE: 'no stop', PCT10: '10% under the buy', PCT15: '15% under the buy', PCT20: '20% under the buy', PCT25: '25% under the buy', PCT35: '35% under the buy', ATR2: '2 daily ranges under the buy', ATR3: '3 daily ranges under the buy', ATR4: '4 daily ranges under the buy', OLD: 'the old default (2 daily ranges or the 50-day average)' };
const level = (r, e, i, t) => { const a = ATR[i * T + t], m = A50[i * T + t], c = C[i * T + t];
  switch (r) { case 'NONE': return 0; case 'PCT10': return e * 0.9; case 'PCT15': return e * 0.85; case 'PCT20': return e * 0.8; case 'PCT25': return e * 0.75; case 'PCT35': return e * 0.65;
    case 'ATR2': return e - 2 * a; case 'ATR3': return e - 3 * a; case 'ATR4': return e - 4 * a; case 'OLD': return Math.max(e - 2 * a, m < c ? m : 0); } };
const mkt = (t, k, nextOpen) => { if (spyI === undefined) return 0; const b = spyI * T, e = O[b + t + 1], z = nextOpen && isFinite(O[b + k + 1]) ? O[b + k + 1] : C[b + k]; return e > 0 && z > 0 ? z / e - 1 : 0; };
function run(i, t, r) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + H + 1 >= T || !isFinite(ATR[b + t])) return null; const st = level(r, e, i, t); let last = null, lk = t;
  for (let k = t + 1; k <= t + H; k++) { const c = C[b + k]; if (!isFinite(c)) continue; last = c; lk = k; if (k < t + H && st > 0 && c <= st) { const n = O[b + k + 1]; return { g: (isFinite(n) && n > 0 ? n : c) / e - 1, m: mkt(t, k, true), hit: 1 }; } }
  if (last === null) return null; if (lk === t + H) return { g: last / e - 1, m: mkt(t, lk, false), hit: 0 };
  let later = false; for (let k = t + H + 1; k < Math.min(T, t + H + 15); k++) if (isFinite(C[b + k])) { later = true; break; } if (!later && t + H + 15 >= T) return null;
  return { g: later ? last / e - 1 : Math.max(-1, last / e - 1 + GONE), m: mkt(t, lk, false), hit: 0 }; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(20261015), POOLS = ['ANY', 'STRONG'], rows = { ANY: [], STRONG: [] };
for (let t = 130; t < T - H - 2; t += STEP) { const liq = []; for (let i = 0; i < NS; i++) if (i !== spyI && OK[i * T + t]) liq.push(i); if (liq.length < 50) continue;
  const g6 = liq.filter(i => isFinite(G6[i * T + t])).sort((a, b) => G6[b * T + t] - G6[a * T + t]), strong = g6.slice(0, Math.ceil(g6.length * 0.3));
  for (const pool of POOLS) { const P = pool === 'ANY' ? liq : strong; for (let n = 0; n < Math.min(PER, P.length); n++) { const i = P[Math.floor(rnd() * P.length)], res = {}; let ok = true;
      for (const r of RULES) { const x = run(i, t, r); if (!x) { ok = false; break; } res[r] = x; } if (ok) rows[pool].push({ t, s: SYMS[i], res }); } } }
const NT = (RULES.length - 1) * POOLS.length;
function erfc(x) { const z = Math.abs(x), t = 1 / (1 + z / 2), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
const zInv = (p) => { let lo = 0, hi = 10; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (0.5 * erfc(m / Math.SQRT2) > p) lo = m; else hi = m; } return (lo + hi) / 2; };
const TCRIT = Math.max(2, zInv(0.05 / 2 / NT));
// buys on the same date share the market, so the t-stat is taken over dates
const byDate = (a, f) => { const m = {}; for (const x of a) (m[x.t] = m[x.t] || []).push(f(x)); return Object.values(m).map(mean); };
const tst = (v) => { if (v.length < 3) return { n: v.length, diff: null, t: null }; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return { n: v.length, diff: +m.toFixed(4), t: sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null }; };
const RES = {};
for (const pool of POOLS) { const A = rows[pool], ts = [...new Set(A.map(x => x.t))].sort((a, b) => a - b), mid = ts[Math.floor(ts.length / 2)], half = { older: A.filter(x => x.t < mid), newer: A.filter(x => x.t >= mid) }, R = {};
  for (const r of RULES) { const o = { name: NAME[r] };
    for (const h of ['older', 'newer']) { const a = half[h], g = a.map(x => x.res[r].g).sort((u, v) => u - v), w5 = g.slice(0, Math.max(1, Math.floor(g.length * 0.05)));
      o[h] = { n: a.length, avg: +mean(g).toFixed(4), worst5: +mean(w5).toFixed(4), worst: +g[0].toFixed(3), hit: +mean(a.map(x => x.res[r].hit)).toFixed(3), vsNone: r === 'NONE' ? null : tst(byDate(a, x => x.res[r].g - x.res.NONE.g)) }; }
    o.harmful = r !== 'NONE' && ['older', 'newer'].some(h => (o[h].vsNone.t !== null && o[h].vsNone.t <= -2) || o[h].vsNone.diff < -0.005);   // costs more than 0.5% a buy (the price of the insurance) in either half
    o.better = r !== 'NONE' && ['older', 'newer'].every(h => o[h].vsNone.diff > 0 && o[h].vsNone.t >= TCRIT);
    R[r] = o; }
  const safe = RULES.filter(r => r !== 'NONE' && !R[r].harmful).sort((a, b) => (R[b].newer.worst5 + R[b].older.worst5) - (R[a].newer.worst5 + R[a].older.worst5));
  RES[pool] = { rules: R, recommended: safe[0] || 'NONE', buys: A.length }; }
const out = { generatedAt: new Date().toISOString(), status: 'OK', from: D[130], to: D[T - H - 3], hold: H, versions: NT, tCrit: +TCRIT.toFixed(2), results: RES };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const msg = ['STOP STUDY (where to put the stop on your own buys; 5 years, whole market, held up to 60 sessions, ' + out.from + ' to ' + out.to + ')', ''];
for (const pool of POOLS) { const P = RES[pool], R = P.rules, rec = P.recommended, line = (r) => R[r].name + ': ' + pc(R[r].newer.avg) + ' a buy, worst 5% average ' + pc(R[r].newer.worst5) + ', stopped ' + Math.round(R[r].newer.hit * 100) + '% of the time' + (R[r].harmful ? ' (cost more than 0.5% a buy vs no stop)' : R[r].better ? ' (beat no stop)' : '');
  msg.push(pool === 'ANY' ? 'ANY LIQUID STOCK (' + P.buys + ' buys):' : 'STRONG STOCKS, top 30% of 6-month gains (' + P.buys + ' buys):', '- ' + line('NONE'), '- ' + line('OLD'), '- ' + line('PCT25'), '- ' + line('ATR3'), 'RECOMMENDED: ' + NAME[rec] + ' (the smallest losses in the worst 5% of buys among the stops costing at most 0.5% a buy)', ''); }
msg.push(NT + ' versions. Research only. New buys you record get the recommended stop; existing stops are shown side by side in  stops .');
console.log(msg.join('\n'));
if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
