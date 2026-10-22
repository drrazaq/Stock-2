// REGIME GATE A-RG1 (Agent A, Timing). Research only; never places an order; no Telegram. Changes no live rule by itself.
// Question (outside review, 20 Oct): do buy rules lose when the S&P 500 closes under its 200-day average? If yes, "no new buys in that
// state" would be a candidate rule (it still needs the user's decision and live paper; it is NOT switched on here).
// FIXED BEFORE THE FIRST RUN (run once as written):
//   regime at a close: S&P 500 (SPY) under its 200-day simple average = BELOW, else ABOVE.
//   Part 1, SPY itself on its long history (Twelve Data daily SPY, up to 4000 sessions, about 16 years; falls back to the 5-year
//     cache): the return from the next open over 20 sessions, BELOW vs ABOVE days; non-overlapping (one start every 20 sessions);
//     older and newer half.
//   Part 2, two system-style buy rules on the 5-year whole-market cache (dead stocks included), next open, 20-session hold,
//     0.8% costs (1.2% stress), each against the average liquid stock bought the same day:
//     LEADERS_PROXY  every 5th session, the 10 liquid stocks (5 USD+, 5M USD+ a day) with the biggest 6-month (126-session) rise;
//     NEW_HIGH       a close at a new 1-year closing high on 1.5x+ its 20-day average volume (liquid stocks).
//   The GATE HELPS only if, for that rule, in EVERY half that has 20+ BELOW trades, the BELOW trades do worse than the ABOVE trades
//   (after costs and vs the average stock), BELOW loses money after costs, and the pooled difference has a date-clustered (20-session
//   block) t at or beyond the luck bar (the higher of this study's bar and the league bar). SPY must also be weaker BELOW in both
//   halves of its long history. Otherwise: NOT PROVEN. Output: data/regime-gate.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, OUT = env.OUT || 'data/regime-gate.json', COST = 0.008, STRESS = 0.012, H = 20, BLOCK = 20;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, TD = local(env.TD_BASE) || 'https://api.twelvedata.com';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
import { freezeFirst, latestBlock } from './first-run.mjs';   // run once: first complete verdict frozen (22 Oct 2026)
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const sd = (v) => { const m = mean(v); return Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / Math.max(1, v.length - 1)); };
const welch = (a, b) => { if (a.length < 2 || b.length < 2) return null; const se = Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length); return se > 0 ? +((mean(a) - mean(b)) / se).toFixed(2) : null; };
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('regime-gate: no price cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 400) { console.log('regime-gate: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
// CX: closes of a stock AFTER it fell out of the cache's 3 USD / 1M USD filter (study-cache x rows, 22 Oct 2026). Used only to value an
// exit (a held stock that collapsed under 3 USD keeps its real price); never for an entry.
const CX = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; }}); store = null;
const spyI = SY.get('SPY'); if (spyI === undefined) { console.log('regime-gate: no SPY in the cache'); process.exit(0); }
// ---- regime per cache session
const below = new Uint8Array(T), known = new Uint8Array(T); { let s = 0; const q = []; for (let t = 0; t < T; t++) { const c = C[spyI * T + t]; if (!isFinite(c)) continue; q.push(c); s += c; if (q.length > 200) s -= q.shift(); if (q.length === 200) { known[t] = 1; below[t] = c < s / 200 ? 1 : 0; } } }
// ---- Part 1: SPY long history
async function spyLong() { if (!env.TWELVE_KEY && !local(env.TD_BASE)) return null;
  try { const r = await fetch(TD + '/time_series?symbol=SPY&interval=1day&outputsize=4000&order=ASC&apikey=' + encodeURIComponent(env.TWELVE_KEY || 'x')); const j = await r.json(); if (!j || !Array.isArray(j.values)) return null;
    return j.values.map(v => ({ d: String(v.datetime).slice(0, 10), o: +v.open, c: +v.close })).filter(x => x.o > 0 && x.c > 0).sort((a, b) => a.d < b.d ? -1 : 1); } catch (e) { return null; } }
let S = await spyLong(), spySource = 'Twelve Data (long history)';
if (!S || S.length < 600) { S = []; for (let t = 0; t < T; t++) { const o = O[spyI * T + t], c = C[spyI * T + t]; if (o > 0 && c > 0) S.push({ d: D[t], o, c }); } spySource = '5-year cache (Twelve Data not available)'; }
const P1 = (() => { const rows = []; let s = 0; const q = [];
  for (let t = 0; t < S.length; t++) { q.push(S[t].c); s += S[t].c; if (q.length > 200) s -= q.shift(); if (q.length < 200 || t + H >= S.length) continue; rows.push({ t, d: S[t].d, below: S[t].c < s / 200, g: S[t + H].c / S[t + 1].o - 1 }); }
  const pick = rows.filter((r, k) => k % H === 0), mid = Math.floor(pick.length / 2), half = (a) => { const b = a.filter(r => r.below).map(r => r.g), u = a.filter(r => !r.below).map(r => r.g); return { nBelow: b.length, below: b.length ? +mean(b).toFixed(4) : null, nAbove: u.length, above: u.length ? +mean(u).toFixed(4) : null, t: welch(b, u), shareBelow: +(b.length / Math.max(1, a.length)).toFixed(3) }; };
  return { source: spySource, from: S[0] && S[0].d, to: S[S.length - 1] && S[S.length - 1].d, sessions: S.length, older: half(pick.slice(0, mid)), newer: half(pick.slice(mid)), all: half(pick) }; })();
// ---- Part 2: system-style rules on the cache
const liquid = (i, t) => { const c = C[i * T + t]; if (!(c >= 5)) return false; let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) { if (k < 0) continue; const c1 = C[i * T + k], v = V[i * T + k]; if (isFinite(c1) && isFinite(v)) { dv += c1 * v; n++; } } return n >= 15 && dv / n >= 5e6; };
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k > t; k--) { const z = isFinite(C[b + k]) ? C[b + k] : CX[b + k]; if (isFinite(z)) { last = z; break; } } return last === null ? null : last / e - 1; }
const ctrlC = {}; const ctrl = (t) => { if (t in ctrlC) return ctrlC[t]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && liquid(i, t)) { const g = fwd(i, t, H); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[t] = v.length >= 30 ? mean(v) : null); };
const trades = { LEADERS_PROXY: [], NEW_HIGH: [] };
for (let t = 252; t < T - H - 1; t++) { if (!known[t]) continue; const c0 = ctrl(t); if (c0 === null) continue;
  if (t % 5 === 0) { const L = []; for (let i = 0; i < NS; i++) { if (i === spyI || !liquid(i, t)) continue; const a = C[i * T + t - 126], c = C[i * T + t]; if (a > 0 && c > 0) L.push([i, c / a - 1]); }
    L.sort((x, y) => y[1] - x[1]); for (const [i] of L.slice(0, 10)) { const g = fwd(i, t, H); if (g !== null && Math.abs(g) < 3) trades.LEADERS_PROXY.push({ t, g, c: c0, below: below[t] }); } }
}
// NEW_HIGH: one pass per stock (rolling 252-session closing high of the PREVIOUS closes, 20-session average volume before today)
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T, hq = [], vq = []; let vs = 0, n = 0;
  for (let t = 0; t < T - H - 1; t++) { const c = C[b + t], v = V[b + t];
    if (t >= 252 && known[t] && c >= 5 && isFinite(v) && hq.length && n >= 200 && vq.length >= 15 && c > hq[0][1] && v >= 1.5 * vs / vq.length && liquid(i, t)) { const c0 = ctrl(t), g = fwd(i, t, H); if (c0 !== null && g !== null && Math.abs(g) < 3) trades.NEW_HIGH.push({ t, g, c: c0, below: below[t] }); }
    if (isFinite(c)) { while (hq.length && hq[hq.length - 1][1] <= c) hq.pop(); hq.push([t, c]); n++; } while (hq.length && hq[0][0] <= t - 252) hq.shift();
    if (isFinite(v)) { vq.push(v); vs += v; } if (vq.length > 20) vs -= vq.shift(); } }
const NV = 3, OWN_BAR = 2.4 + 0.1 * NV / 2, LG = J('data/agent-league.json', {}), LEAGUE_BAR = typeof LG.bar === 'number' ? LG.bar : null, BAR = Math.max(OWN_BAR, LEAGUE_BAR || 0), midT = Math.floor((252 + T) / 2);
const blocks = (a, f) => { const o = {}; for (const z of a) (o[Math.floor(z.t / BLOCK)] = o[Math.floor(z.t / BLOCK)] || []).push(f(z)); return Object.values(o).map(mean); };
const side = (a, cost) => { const p = a.map(z => z.g - cost); return { n: a.length, blocks: blocks(a, z => z.g).length, avg: a.length ? +mean(p).toFixed(4) : null, edge: a.length ? +mean(a.map(z => z.g - cost - z.c)).toFixed(4) : null }; };
const cmp = (a, cost) => { const b = a.filter(z => z.below), u = a.filter(z => !z.below); return { below: side(b, cost), above: side(u, cost), tDiff: welch(blocks(b, z => z.g - cost - z.c), blocks(u, z => z.g - cost - z.c)), tDiffAbs: welch(blocks(b, z => z.g), blocks(u, z => z.g)) }; };
const RES = {};
for (const [k, a] of Object.entries(trades)) { const R = { older: cmp(a.filter(z => z.t < midT), COST), newer: cmp(a.filter(z => z.t >= midT), COST), all: cmp(a, COST), stress: cmp(a, STRESS) }, why = [];
  const halves = ['older', 'newer'].filter(hf => R[hf].below.n >= 20); if (halves.length < 2) why.push('the S&P 500 was under its 200-day in only ' + (halves[0] || 'no') + ' half with 20+ trades, so the gate cannot be checked in both halves');
  for (const hf of halves) { const r = R[hf]; if (!(r.below.edge < r.above.edge)) why.push('BELOW was not worse than ABOVE in the ' + hf + ' half (' + pc(r.below.edge) + ' vs ' + pc(r.above.edge) + ' against the average stock)'); if (!(r.below.avg < 0)) why.push('BELOW still made money after costs in the ' + hf + ' half (' + pc(r.below.avg) + ')'); }
  if (!(R.all.tDiff !== null && -R.all.tDiff >= BAR)) why.push('difference could be luck (block t ' + R.all.tDiff + ', ' + BAR.toFixed(2) + ' needed)');
  RES[k] = { name: k === 'LEADERS_PROXY' ? '6-month leaders (top 10, every 5th session), 20 sessions' : 'New 1-year high on 1.5x volume, 20 sessions', verdict: why.length ? 'NOT PROVEN' : 'GATE HELPS', why: why.join('; ') || 'BELOW trades did worse in both halves and lost money, beyond the luck bar', results: R }; }
const spyOk = P1.older.below !== null && P1.newer.below !== null && P1.older.below < P1.older.above && P1.newer.below < P1.newer.above;
const gate = Object.values(RES).every(r => r.verdict === 'GATE HELPS') && spyOk ? 'GATE HELPS' : 'NOT PROVEN';
// RUN ONCE: the first complete run (both rules judged, SPY history present) is frozen in firstRun; later runs go to `latest` (monitoring only).
const thisRun = { at: new Date().toISOString(), from: D[252], to: D[T - 1], bar: +BAR.toFixed(2), gate, spyWeakerBelowBothHalves: spyOk, spy: P1, results: RES };
const PREV = J(OUT, {}) || {}, firstRun = freezeFirst(PREV, thisRun, !!(RES.LEADERS_PROXY && RES.NEW_HIGH && P1 && P1.older && P1.newer)), F = firstRun || thisRun;
const out = { generatedAt: new Date().toISOString(), agent: 'A', from: D[252], to: D[T - 1], versions: NV, ownBar: +OWN_BAR.toFixed(2), leagueBar: LEAGUE_BAR, bar: +BAR.toFixed(2), todayBelow: !!below[T - 1],
  gate: firstRun ? firstRun.gate : 'NO VERDICT YET (first run incomplete)', spyWeakerBelowBothHalves: F.spyWeakerBelowBothHalves, spy: F.spy, results: F.results, firstRun, latest: latestBlock(thisRun),
  note: 'Research only. Even GATE HELPS does not switch anything on: it goes to the user and to live paper first. Verdict = firstRun (run once); latest = monitoring only.' };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('REGIME GATE (S&P 500 under its 200-day): ' + out.gate + (PREV.firstRun ? ' (frozen first run of ' + String(PREV.firstRun.at).slice(0, 10) + '; this run, monitoring only: ' + gate + ')' : '') + ' | today ' + (out.todayBelow ? 'BELOW' : 'ABOVE') + ' | SPY ' + P1.source + ' ' + P1.from + '..' + P1.to + ': 20-session return below ' + pc(P1.all.below) + ' (' + P1.all.nBelow + ') vs above ' + pc(P1.all.above) + ' (' + P1.all.nAbove + '), older ' + pc(P1.older.below) + '/' + pc(P1.older.above) + ', newer ' + pc(P1.newer.below) + '/' + pc(P1.newer.above));
for (const r of Object.values(RES)) console.log('- ' + r.name + ': ' + r.verdict + ' | below ' + r.results.all.below.n + ' trades ' + pc(r.results.all.below.avg) + ' (vs avg stock ' + pc(r.results.all.below.edge) + '), above ' + r.results.all.above.n + ' trades ' + pc(r.results.all.above.avg) + ' (' + pc(r.results.all.above.edge) + '), block t ' + r.results.all.tDiff + (r.verdict !== 'GATE HELPS' ? ' (' + r.why.split(';')[0] + ')' : ''));
try { const LB = J('data/strategy-library.json', null), e = LB && LB.strategies.find(x => x.id === 'A-RG1');
  if (e && firstRun) { const RES = firstRun.results, P1 = firstRun.spy, L = RES.LEADERS_PROXY.results, N = RES.NEW_HIGH.results; e.agent = 'A'; e.status = 'tested: ' + (firstRun.gate === 'GATE HELPS' ? 'passed' : 'not proven'); e.tested = firstRun.to; e.study = 'regime-gate.mjs -> data/regime-gate.json (run once, first run frozen)';
    e.result = { t: L.all.tDiff, tNewHigh: N.all.tDiff, leadersBelowVsAvg: L.all.below.edge, leadersAboveVsAvg: L.all.above.edge, newHighBelowVsAvg: N.all.below.edge, newHighAboveVsAvg: N.all.above.edge, spyBelow20d: P1.all.below, spyAbove20d: P1.all.above, spyOlder: [P1.older.below, P1.older.above], spyNewer: [P1.newer.below, P1.newer.above], bar: firstRun.bar, why: Object.values(RES).map(r => r.verdict + ': ' + r.why).join(' | ') };
    fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } } catch (e) {}
