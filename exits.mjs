import {telegramFetch as sharedTelegramFetch} from './telegram-delivery.mjs';
const telegramFetch=(u,o)=>sharedTelegramFetch(u,o,{research:true});
// EXIT TEST: WHEN TO SELL. The same buys, sold ten different ways, to see which way of selling keeps more money. Read-only.
// Entries are fixed in advance (the 4 mid/long setups of horizons.mjs + a breakout to a new 1-year high on heavy volume), so only the
// SELLING changes. Every exit is compared with the current default (hold 60 sessions, sell if a close is 25% under the entry) on the
// SAME trades, trade by trade, older and newer half. Exits fixed in advance, not tuned:
//   HOLD60   hold 60 sessions (3 months), 25% safety stop                          <- today's default, the yardstick
//   HOLD120  hold 120 sessions (6 months), 25% safety stop
//   TRAIL10 / TRAIL15 / TRAIL20   sell when a close is 10 / 15 / 20% under the highest close since the buy (at most 120 sessions)
//   LOCK     25% stop; after a +15% close the stop moves to +2% (profit locked); after +30% it trails 15% under the highest close
//   MA20 / MA50   sell after the first close under the 20- / 50-day average (from the 5th session), 25% stop, at most 120 sessions
//   CHAND    sell when a close is 3 x the average daily range (20-day ATR) under the highest close, at most 120 sessions
//   T20S10   take profit at +20%, stop at -10%, at most 60 sessions
// All sells happen at the NEXT open after the close that triggers them (no perfect fills). 0.8% costs a trade (1.2% stress).
// A stock that disappears (delisted, bought out) is closed at its last price, minus 30% if it vanished without a later trace.
// An exit WINS only if, on the same trades, it beats the default in BOTH halves by a margin that is very unlikely to be luck given
// the 50 versions tried (paired t-stat above the rising bar), keeps its gain without its 2 best trades, and no single
// stock makes over 25% of the gain. (Whether the BUY makes money is the buy test's job; this only asks which selling keeps more.) Output: data/exits.json.
import fs from 'node:fs';
import { belowLeague, BELOW } from './league-bar.mjs';   // a passing verdict must also clear the league luck bar (22 Oct 2026)
import zlib from 'node:zlib';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TG = local(env.TG_BASE) || 'https://api.telegram.org', OUT = 'data/exits.json';
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
fs.mkdirSync('data', { recursive: true });
const COST = 0.008, STRESS = 0.012, GONE = -0.3, MAXH = 120;
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no price cache' })); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 400) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'only ' + T + ' sessions' })); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), HI = new Float32Array(NS * T).fill(NaN), LO = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; HI[k] = x.h ? x.h[j] : x.c[j]; LO[k] = x.l ? x.l[j] : x.c[j]; V[k] = x.v[j]; } }); store = null;
const spyI = SY.get('SPY');
// ---- per stock: 10/20/50/200-day averages, 1-year high, 20-day ATR, 20-day average volume, liquidity
const r6 = [], r12 = []; for (let t = 0; t < T; t++) { r6.push([]); r12.push([]); }
const st = new Array(NS);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T, q = { 10: [], 20: [], 50: [], 200: [] }, s = { 10: 0, 20: 0, 50: 0, 200: 0 }, hiq = [], dq = [], tq = [], vq = []; let dv = 0, tr = 0, vs = 0;
  const A = { a10: new Float32Array(T).fill(NaN), a20: new Float32Array(T).fill(NaN), a50: new Float32Array(T).fill(NaN), a200: new Float32Array(T).fill(NaN), hi: new Float32Array(T).fill(NaN), atr: new Float32Array(T).fill(NaN), av: new Float32Array(T).fill(NaN), ok: new Uint8Array(T) }; st[i] = A;
  for (let t = 0; t < T; t++) { const c = C[b + t]; if (!isFinite(c)) { for (const n of [10, 20, 50, 200]) { q[n].length = 0; s[n] = 0; } hiq.length = dq.length = tq.length = vq.length = 0; dv = tr = vs = 0; continue; }
    for (const n of [10, 20, 50, 200]) { q[n].push(c); s[n] += c; if (q[n].length > n) s[n] -= q[n].shift(); if (q[n].length === n) A['a' + n][t] = s[n] / n; }
    while (hiq.length && hiq[hiq.length - 1][1] <= c) hiq.pop(); hiq.push([t, c]); while (hiq[0][0] <= t - 252) hiq.shift(); A.hi[t] = hiq[0][1];
    const pcl = t > 0 && isFinite(C[b + t - 1]) ? C[b + t - 1] : c, trv = Math.max(HI[b + t], pcl) - Math.min(LO[b + t], pcl); tq.push(trv); tr += trv; if (tq.length > 20) tr -= tq.shift(); if (tq.length === 20) A.atr[t] = tr / 20;
    const vv = V[b + t]; vq.push(vv); vs += vv; if (vq.length > 21) vs -= vq.shift(); if (vq.length === 21) A.av[t] = (vs - vv) / 20;   // average of the 20 sessions BEFORE today
    dq.push(c * vv); dv += c * vv; if (dq.length > 20) dv -= dq.shift();
    A.ok[t] = c >= 5 && dq.length === 20 && dv / 20 >= 5e6 ? 1 : 0;
    if (t >= 126 && isFinite(C[b + t - 126]) && A.ok[t]) r6[t].push([i, c / C[b + t - 126] - 1]);
    if (t >= 252 && isFinite(C[b + t - 21]) && isFinite(C[b + t - 252]) && A.ok[t]) r12[t].push([i, C[b + t - 21] / C[b + t - 252] - 1]); } }
const topSet = (L, f) => { if (L.length < 50) return null; const s = [...L].sort((a, b) => b[1] - a[1]); return new Set(s.slice(0, Math.ceil(s.length * f)).map(x => x[0])); };
const top6 = r6.map(L => topSet(L, 0.3)), top12 = r12.map(L => topSet(L, 0.1));
// ---- entries (same definitions as horizons.mjs, plus BREAKOUT)
const SETUPS = ['PB_UP', 'PB_DEEP', 'LEADER', 'TURN', 'BREAKOUT'];
const NAME = { PB_UP: 'Pullback in a long uptrend', PB_DEEP: 'Deep pullback of a strong stock', LEADER: 'Long-term leader', TURN: 'Beaten-down stock turning up', BREAKOUT: 'New 1-year high on 1.5x volume' };
const inSetup = (i, t) => { const A = st[i]; if (!A || !A.ok[t]) return []; const b = i * T, c = C[b + t], p = C[b + t - 1], out = [], dd = A.hi[t] > 0 ? 1 - c / A.hi[t] : null; if (!isFinite(p)) return out;
  let dipped = false; for (let k = t - 10; k < t; k++) if (k >= 0 && isFinite(C[b + k]) && C[b + k] < A.a50[k]) { dipped = true; break; }
  if (c > A.a200[t] && dd >= 0.08 && dd <= 0.25 && dipped && c > A.a20[t] && !(p > A.a20[t - 1])) out.push('PB_UP');
  if (top6[t] && top6[t].has(i) && dd >= 0.15 && dd <= 0.35 && c > A.a10[t] && !(p > A.a10[t - 1])) out.push('PB_DEEP');
  if (top12[t] && top12[t].has(i) && c > A.a200[t] && !(top12[t - 1] && top12[t - 1].has(i) && p > A.a200[t - 1])) out.push('LEADER');
  if (dd >= 0.30 && c < A.a200[t] && c > A.a50[t] && !(p > A.a50[t - 1])) out.push('TURN');
  if (t >= 252 && c >= A.hi[t] && isFinite(A.hi[t - 1]) && p < A.hi[t - 1] && A.av[t] > 0 && V[b + t] >= 1.5 * A.av[t] && c > A.a50[t]) out.push('BREAKOUT');
  return out; };
// ---- exits
const EXITS = ['HOLD60', 'HOLD120', 'TRAIL10', 'TRAIL15', 'TRAIL20', 'LOCK', 'MA20', 'MA50', 'CHAND', 'T20S10'];
const EXNAME = { HOLD60: 'hold 3 months, 25% stop (today’s default)', HOLD120: 'hold 6 months, 25% stop', TRAIL10: 'sell 10% under the highest close', TRAIL15: 'sell 15% under the highest close', TRAIL20: 'sell 20% under the highest close',
  LOCK: 'lock profit: stop to +2% after +15%, then trail 15% after +30%', MA20: 'sell on a close under the 20-day average', MA50: 'sell on a close under the 50-day average', CHAND: 'sell 3 daily ranges under the highest close', T20S10: 'take profit +20%, stop -10%, 3 months at most' };
// the S&P 500 over the same days (bought at the same open, sold at the same open or close): longer holds collect more of the market's
// rise, so exits are compared on the gain ABOVE the market, not on the raw gain
const mkt = (t, k, nextOpen) => { if (spyI === undefined) return 0; const b = spyI * T, e = O[b + t + 1], z = nextOpen && isFinite(O[b + k + 1]) ? O[b + k + 1] : C[b + k]; return e > 0 && z > 0 ? z / e - 1 : 0; };
// returns { g, days, m } or null. Sells at the open after the triggering close.
function run(i, t, ex) { const b = i * T, e = O[b + t + 1], A = st[i]; if (!(e > 0)) return null;
  const maxh = ex === 'HOLD60' || ex === 'T20S10' ? 60 : MAXH; if (t + maxh >= T) return null;
  let peak = e, last = null, lastK = t + 1, locked = 0;
  const sellNext = (k) => { const n = O[b + k + 1]; return { g: (isFinite(n) && n > 0 ? n : C[b + k]) / e - 1, days: k + 1 - t, m: mkt(t, k, true) }; };
  for (let k = t + 1; k <= t + maxh; k++) { const c = C[b + k]; if (!isFinite(c)) continue; last = c; lastK = k; if (k === t + maxh) break;
    if (c > peak) peak = c; const r = c / e - 1;
    let out = false;
    switch (ex) {
      case 'HOLD60': case 'HOLD120': out = r <= -0.25; break;
      case 'TRAIL10': out = c <= peak * 0.90; break;
      case 'TRAIL15': out = c <= peak * 0.85; break;
      case 'TRAIL20': out = c <= peak * 0.80; break;
      case 'LOCK': { if (peak >= e * 1.30) locked = 2; else if (peak >= e * 1.15 && locked < 1) locked = 1; out = locked === 2 ? c <= peak * 0.85 : locked === 1 ? c <= e * 1.02 : r <= -0.25; break; }
      case 'MA20': out = r <= -0.25 || (k - t >= 5 && isFinite(A.a20[k]) && c < A.a20[k]); break;
      case 'MA50': out = r <= -0.25 || (k - t >= 5 && isFinite(A.a50[k]) && c < A.a50[k]); break;
      case 'CHAND': out = r <= -0.25 || (isFinite(A.atr[k]) && c <= peak - 3 * A.atr[k]); break;
      case 'T20S10': out = r >= 0.20 || r <= -0.10; break; }
    if (out) return sellNext(k); }
  if (last === null) return null;
  if (lastK === t + maxh) return { g: last / e - 1, days: maxh, m: mkt(t, lastK, false) };
  let later = false; for (let k = t + maxh + 1; k < Math.min(T, t + maxh + 15); k++) if (isFinite(C[b + k])) { later = true; break; }
  if (later) return { g: last / e - 1, days: lastK - t, m: mkt(t, lastK, false) }; if (t + maxh + 15 >= T) return null; return { g: Math.max(-1, last / e - 1 + GONE), days: lastK - t, m: mkt(t, lastK, false) }; }
// ---- trades: one per stock per setup per 6 months, every exit on the same trades
const trades = {}; for (const s of SETUPS) trades[s] = [];
const nextFree = {};
for (let t = 252; t < T - MAXH - 1; t++) for (let i = 0; i < NS; i++) { if (!st[i] || !st[i].ok[t]) continue; const L = inSetup(i, t); if (!L.length) continue;
  for (const s of L) { if (t < (nextFree[s + i] || 0)) continue; const res = {}; let okAll = true; for (const ex of EXITS) { const r = run(i, t, ex); if (!r || !isFinite(r.g)) { okAll = false; break; } res[ex] = r; }
    if (!okAll) continue; nextFree[s + i] = t + MAXH; trades[s].push({ t, s: SYMS[i], r: res }); } }
// ---- verdicts
const mid = Math.floor((252 + T - MAXH) / 2), NT = SETUPS.length * (EXITS.length - 1);
// rising bar: two-sided normal quantile at 5% / number of comparisons (Bonferroni), at least 2
const zInv = (p) => { let lo = 0, hi = 10; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2, tail = 0.5 * erfc(m / Math.SQRT2); if (tail > p) lo = m; else hi = m; } return (lo + hi) / 2; };
function erfc(x) { const z = Math.abs(x), t = 1 / (1 + z / 2), r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? r : 2 - r; }
const TCRIT = Math.max(2, zInv(0.05 / 2 / NT));
const stat = (a, ex, cost) => { if (!a.length) return { n: 0 }; const p = a.map(x => x.r[ex].g - cost), w = p.filter(x => x > 0), l = p.filter(x => x <= 0), sm = z => z.reduce((u, v) => u + v, 0), srt = [...p].sort((u, v) => v - u);
  const byS = {}; for (let k = 0; k < a.length; k++) if (p[k] > 0) byS[a[k].s] = (byS[a[k].s] || 0) + p[k];
  const days = mean(a.map(x => x.r[ex].days));
  return { n: p.length, win: +(w.length / p.length).toFixed(3), avg: +(sm(p) / p.length).toFixed(4), perMonth: +((sm(p) / p.length) / days * 21).toFixed(4), days: +days.toFixed(1), pf: l.length && sm(l) < 0 ? +(sm(w) / -sm(l)).toFixed(2) : null,
    noTop2: srt.length > 2 ? +(sm(srt.slice(2)) / (srt.length - 2)).toFixed(4) : null, worst: +Math.min(...p).toFixed(3), topStock: sm(w) > 0 ? +(Math.max(...Object.values(byS)) / sm(w)).toFixed(3) : null }; };
const paired = (a, ex) => { const d = a.map(x => (x.r[ex].g - x.r[ex].m) - (x.r.HOLD60.g - x.r.HOLD60.m)); if (d.length < 3) return { n: d.length, diff: null, t: null }; const m = mean(d), sd = Math.sqrt(d.reduce((u, v) => u + (v - m) ** 2, 0) / (d.length - 1));
  const srt = [...d].sort((u, v) => v - u), noTop2 = srt.length > 2 ? srt.slice(2).reduce((u, v) => u + v, 0) / (srt.length - 2) : null, byS = {}; let pos = 0;
  for (let k = 0; k < a.length; k++) if (d[k] > 0) { byS[a[k].s] = (byS[a[k].s] || 0) + d[k]; pos += d[k]; }
  return { n: d.length, diff: +m.toFixed(4), t: sd > 0 ? +(m / (sd / Math.sqrt(d.length))).toFixed(2) : null, noTop2: noTop2 === null ? null : +noTop2.toFixed(4), topStock: pos > 0 ? +(Math.max(...Object.values(byS)) / pos).toFixed(3) : null }; };
const RES = {};
for (const s of SETUPS) { const a = trades[s], o = a.filter(x => x.t < mid), w = a.filter(x => x.t >= mid), row = {};
  for (const ex of EXITS) { const R = { older: stat(o, ex, COST), newer: stat(w, ex, COST), stress: stat(w, ex, STRESS), vsDefault: { older: paired(o, ex), newer: paired(w, ex) } }, why = [];
    let verdict = ex === 'HOLD60' ? 'DEFAULT' : 'BETTER';
    if (ex !== 'HOLD60') {
      if (R.older.n < 40 || R.newer.n < 40) { verdict = 'NOT PROVEN'; why.push('too few trades (' + R.older.n + ' / ' + R.newer.n + '; 40 each needed)'); }
      else { for (const h of ['older', 'newer']) { const v = R.vsDefault[h]; if (!(v.diff > 0)) why.push('did not beat the default in the ' + h + ' half (' + pc(v.diff) + ' a trade)'); else if (!(v.t >= TCRIT)) why.push('beat the default in the ' + h + ' half by ' + pc(v.diff) + ' but that could be luck (t ' + v.t + ', ' + TCRIT.toFixed(1) + ' needed)'); }
        if (!(R.vsDefault.newer.noTop2 > 0)) why.push('the gain over the default disappears without its 2 best trades'); if (R.vsDefault.newer.topStock > 0.25) why.push('one stock made over 25% of the gain over the default');
        if (why.length) verdict = R.vsDefault.older.diff > 0 && R.vsDefault.newer.diff > 0 ? 'NOT PROVEN' : 'WORSE'; } }
    if (verdict === 'BETTER') { const lw = belowLeague([R.vsDefault.older.t, R.vsDefault.newer.t], TCRIT); if (lw) { verdict = BELOW; why.push('beat the default in both halves; ' + lw); } }
    row[ex] = { name: EXNAME[ex], verdict, why: why.join('; ') || (ex === 'HOLD60' ? 'the yardstick' : 'beat the default on the same trades in both halves, beyond luck'), results: R }; }
  const better = EXITS.filter(ex => row[ex].verdict === 'BETTER').sort((x, y) => row[y].results.vsDefault.newer.diff - row[x].results.vsDefault.newer.diff);
  RES[s] = { name: NAME[s], trades: a.length, best: better[0] || 'HOLD60', exits: row }; }
const out = { generatedAt: new Date().toISOString(), status: 'OK', from: D[252], to: D[T - MAXH - 1], versions: NT, tCrit: +TCRIT.toFixed(2), cost: COST, results: RES };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
// ---- message
const msg = ['EXIT TEST (when to sell): the same buys sold 10 ways, 5 years, whole market, ' + out.from + ' to ' + out.to, 'Yardstick: hold 3 months with a 25% stop. A new exit must beat it on the SAME trades, measured above the S&P 500 over the days each was held, in both halves, beyond luck (' + NT + ' versions, bar t ' + TCRIT.toFixed(1) + ').', ''];
for (const s of SETUPS) { const R = RES[s], d = R.exits.HOLD60.results.newer; msg.push(R.name + ' (' + R.trades + ' trades): default ' + pc(d.avg) + ' a trade, ' + Math.round((d.win || 0) * 100) + '% won, ' + d.days + ' sessions held');
  if (R.best !== 'HOLD60') { const b = R.exits[R.best].results; msg.push('  BEST: ' + EXNAME[R.best] + ': ' + pc(b.newer.avg) + ' a trade (' + pc(b.vsDefault.newer.diff) + ' vs default, newer half; ' + pc(b.vsDefault.older.diff) + ' older), ' + b.newer.days + ' sessions held, ' + pc(b.newer.perMonth) + ' a month'); }
  else msg.push('  No exit beat the default beyond luck. Keep: ' + EXNAME.HOLD60 + '.');
  const close = EXITS.filter(ex => R.exits[ex].verdict === 'NOT PROVEN' && R.exits[ex].results.vsDefault.newer.diff > 0).slice(0, 2); if (close.length) msg.push('  Close but not proven: ' + close.map(ex => EXNAME[ex] + ' (' + pc(R.exits[ex].results.vsDefault.newer.diff) + ')').join('; '));
  msg.push(''); }
msg.push('Research only. A better exit is used in your sell plans only for a buy kind that has itself passed its test.');
console.log(msg.join('\n'));
const QUIET_ = (() => { try { return JSON.parse(fs.readFileSync('data/settings.json', 'utf8')).quiet !== false; } catch (e) { return true; } })();   // quiet (default): study results stay in the files and reach you through ACTIONS and the weekly report
if (env.TG_TOKEN && env.TG_CHAT && !QUIET_) await telegramFetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n'), disable_web_page_preview: true }) }).catch(() => {});
