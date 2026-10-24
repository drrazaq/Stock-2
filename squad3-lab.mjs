// SQUAD 3 LAB (MONEY MANAGEMENT; 4-squad competition, 24 Oct 2026). Research only; never places an order; no Telegram.
// The policies, inputs, account, windows and gates are pre-registered in the squad3-core.mjs header and written into
// data/strategy-library.json (SQ3-*) before anything is computed. Run once: the first complete verdicts are frozen in
// data/squad3-lab.json firstRun (first-run.mjs freezeEach); a later run only writes `latest` (monitoring, never a verdict).
// 1. PRICES (GitHub Actions only; keys only from secrets, never printed): the 5-year whole-market cache of the Sunday job
//    (study-cache/grouped.json.gz, RESTORED READ ONLY) + sessions since from Massive grouped bars + splits since the cache day (the
//    confluence-lab pattern) + SPUS / HLAL daily bars + any input symbol missing from the cache (e.g. the XLK fund of MACRO-USD-E60).
// 2. INPUT SIGNALS: the frozen 5-year trade lists (value-lab, decoded-history, macro-lab, and data/confluence-signals.json.gz for the
//    anomaly rules whose lab kept only its newest trades). A list that does not match its frozen count makes the run INCOMPLETE.
// 3. ACCOUNTS: every policy + PLAIN x 10,000 / 25,000 / 50,000 USD x older / newer half (0.8% and 1.2% cost) + the whole window.
// 4. OUTPUT: data/squad3-lab.json (firstRun, baseline, info), data/squad3-today.json (methods = {}: a policy is not a buy signal).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { RULES, POLICIES, PLAIN, COST, STRESS, SPLIT, START, TAIL, CAPITALS, PRIMARY, stopFor, runAccount, regimeAt, indicators, holdFund, curve, gates, halfBlock, preRegister, r2, r4 } from './squad3-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const OUT = 'data/squad3-lab.json', TODAY = 'data/squad3-today.json', SIGF = 'data/confluence-signals.json.gz';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {};

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
{ const LB = J('data/strategy-library.json', null), ch = preRegister(LB); if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ3 entries pre-registered now'); }

// ================= 1. PRICES =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad3-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let ms = Date.parse(cacheLast) + 864e5; ms <= Date.now(); ms += 864e5) { const d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none') + (env.MASSIVE_KEY ? '' : ' (no MASSIVE_KEY)'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) { for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN), OX = new Float32Array(N).fill(NaN), CX = new Float32Array(N).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) { CX[q * T + t] = x.x.c[j]; if (x.x.o) OX[q * T + t] = x.x.o[j]; } } });
const SIC = store.sic || {}; store = null;
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; C[q] /= r; OX[q] /= r; CX[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY');
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS);
// liquidity priority: 20-session average traded value (main rows); LIQ (breadth universe): close 5+ USD and 5M+ USD a day
const LIQ = new Uint8Array(N), ADV = new Float32Array(N); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = C[b + t] * V[b + t]; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const w = C[b + t - 20] * V[b + t - 20]; if (isFinite(w)) { s -= w; n--; } } if (t >= 19 && n > 0) ADV[b + t] = s / n; if (t >= 19 && n === 20 && C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
// breadth: share of liquid stocks whose close is above their own 200-session average (main rows; 180+ closes in the window)
const above = new Float64Array(T), tot = new Float64Array(T);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const c = C[b + t]; if (c > 0) { s += c; n++; } if (t >= 200) { const w = C[b + t - 200]; if (w > 0) { s -= w; n--; } }
    if (t >= 199 && n >= 180 && LIQ[b + t] && c > 0) { tot[t]++; if (c > s / n) above[t]++; } } }
const breadth = new Float64Array(T).fill(NaN); for (let t = 0; t < T; t++) if (tot[t] >= 200) breadth[t] = above[t] / tot[t];
const spyC = new Float64Array(T).fill(NaN); if (spyI !== undefined) for (let t = 0; t < T; t++) spyC[t] = C[spyI * T + t] > 0 ? C[spyI * T + t] : NaN;
async function bars(sym) { const j = await api('/v2/aggs/ticker/' + sym + '/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000'); if (!j || !Array.isArray(j.results)) return null;
  const o = new Float64Array(T).fill(NaN), c = new Float64Array(T).fill(NaN), v = new Float64Array(T).fill(NaN); for (const b of j.results) { const t = tOf.get(new Date(b.t).toISOString().slice(0, 10)); if (t !== undefined) { o[t] = b.o; c[t] = b.c; v[t] = b.v; } } return { O: o, C: c, V: v, days: j.results.length }; }
const EXTRA = new Map();
const serMemo = new Map(); const series = (sym) => { if (EXTRA.has(sym)) return EXTRA.get(sym); const i = SY.get(sym); if (i === undefined) return null; if (serMemo.has(i)) return serMemo.get(i); const b = i * T, o = new Float64Array(T), c = new Float64Array(T);
  for (let t = 0; t < T; t++) { o[t] = O[b + t] > 0 ? O[b + t] : OX[b + t] > 0 ? OX[b + t] : NaN; c[t] = C[b + t] > 0 ? C[b + t] : CX[b + t] > 0 ? CX[b + t] : NaN; }
  const s = { O: o, C: c }; serMemo.set(i, s); return s; };
const indMemo = new Map(); const ind = (sym) => { if (indMemo.has(sym)) return indMemo.get(sym); const s = series(sym), v = s ? indicators(s.C) : null; indMemo.set(sym, v); return v; };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const SECCIK = J('data/sec-ciks.json', {}), sector = (s) => { const x = SIC[s]; const c = x && x.c ? String(x.c).padStart(4, '0') : (SECCIK[s] && SECCIK[s][1] ? String(SECCIK[s][1]).padStart(4, '0') : null); return c ? c.slice(0, 2) : 'own:' + s; };
const sessionOf = (d) => { if (tOf.has(d)) return tOf.get(d); let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo - 1; };

// ================= 2. INPUT SIGNALS =================
const VL = J('data/value-lab.json', {}), DH = J('data/decoded-history.json', {}), AL = J('data/anomaly-lab.json', {}), ML = J('data/macro-lab.json', {}), SG = JZ(SIGF, { signals: {}, check: {} });
const LABS = { 'value-lab': VL, 'decoded-history': DH, 'anomaly-lab': AL, 'macro-lab': ML };
const INPUT = {}, raw = [];
for (const [id, r] of Object.entries(RULES)) { const L = LABS[r.lab], fr = (L.firstRun || {})[id], stored = (L.trades || {})[id] || [], nFrozen = fr && fr.results ? (fr.results.older.n || 0) + (fr.results.newer.n || 0) : null;
  let list, full, source;
  if (id === 'B-BASK1_3m') { list = stored.flatMap(b => { const k = tOf.get(b.buy); return k > 0 ? (b.names || []).map(s => [s, D[k - 1]]) : []; }); full = nFrozen !== null && stored.length >= nFrozen; source = 'value-lab.json trades (basket names; signal = the session before the buy)'; }
  else if (nFrozen !== null && stored.length >= nFrozen) { list = stored.map(z => [z.s, z.sig || z.d]); full = true; source = r.lab + '.json trades (full list)'; }
  else if (SG.signals[id]) { list = SG.signals[id]; full = !!(SG.check[id] && SG.check[id].match); source = 'confluence-signals.json.gz (full list recomputed by the confluence lab; check ' + JSON.stringify(SG.check[id] || null) + ')'; }
  else { list = stored.map(z => [z.s, z.sig || z.d]); full = false; source = r.lab + '.json trades: ONLY ' + stored.length + ' of ' + nFrozen; }
  INPUT[id] = { family: r.family, hold: r.hold, frozenVerdict: fr ? fr.verdict : null, frozenTrades: nFrozen, signals: list.length, full, source };
  for (const [s, d] of list) raw.push({ rule: id, sym: s, d }); }
// symbols missing from the cache (funds such as XLK): their own daily bars
{ const miss = [...new Set(raw.map(z => z.sym).filter(s => !SY.has(s)))]; log('input symbols missing from the cache: ' + (miss.join(' ') || 'none'));
  for (const s of miss.slice(0, 60)) { const b = await bars(s); if (b && b.days > 200) EXTRA.set(s, b); } log('loaded separately: ' + ([...EXTRA.keys()].join(' ') || 'none')); }
const liqOf = (sym, t) => { if (EXTRA.has(sym)) { const b = EXTRA.get(sym); let s = 0, n = 0; for (let u = Math.max(0, t - 19); u <= t; u++) if (b.C[u] > 0 && b.V[u] > 0) { s += b.C[u] * b.V[u]; n++; } return n ? s / n : 0; } const i = SY.get(sym); return i === undefined ? 0 : ADV[i * T + t] || 0; };
const cands = []; let noPrice = 0, haramOut = 0;
for (const z of raw) { const t = sessionOf(z.d); if (t < 0 || t + 1 >= T || !series(z.sym)) { noPrice++; INPUT[z.rule].noPrice = (INPUT[z.rule].noPrice || 0) + 1; continue; }
  const h = halal(z.sym); if (h === 'fail') { haramOut++; INPUT[z.rule].zadOut = (INPUT[z.rule].zadOut || 0) + 1; continue; }
  const r = RULES[z.rule]; cands.push({ sym: z.sym, rule: z.rule, family: r.family, sector: sector(z.sym), halal: h, t, k: t + 1, hold: r.hold, stop: stopFor(r.hold), liq: liqOf(z.sym, t) }); }
cands.sort((a, b) => a.t - b.t);
const incomplete = Object.entries(INPUT).filter(([, x]) => !x.full).map(([k]) => k);
log('inputs: ' + Object.entries(INPUT).map(([k, x]) => k + ' ' + x.signals + (x.full ? '' : ' (NOT FULL)')).join(', ') + ' | usable ' + cands.length + ', no price ' + noPrice + ', ZAD not-halal left out ' + haramOut);

// ================= 3. ACCOUNTS =================
const FUNDS = {}; for (const f of ['SPUS', 'HLAL']) { FUNDS[f] = await bars(f); log('fund ' + f + ': ' + (FUNDS[f] ? FUNDS[f].days + ' days' : 'NOT LOADED')); }
const a0 = D.findIndex(d => d >= START), mid = D.findIndex(d => d >= SPLIT), E = T - 1 - TAIL;
const WIN = { older: [a0, mid - 1], newer: [mid, E] };
const complete = T >= 1000 && !incomplete.length && !!FUNDS.SPUS && spyI !== undefined && a0 >= 0 && mid > a0 && E > mid;
log('windows: older ' + D[a0] + '..' + D[mid - 1] + ', newer ' + D[mid] + '..' + D[E] + ' (last complete signal session; data to ' + D[T - 1] + ')' + (complete ? '' : ' | INCOMPLETE'));
// SPY with history before the window (its 200-day average and 252-day high from the first session); the cache's SPY if that fails
const ctx = { spyC, breadth, off: 0 };
{ const from = iso(Date.parse(D[0]) - 420 * 864e5), j = await api('/v2/aggs/ticker/SPY/range/1/day/' + from + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000');
  if (j && Array.isArray(j.results) && j.results.length > 300) { const pre = j.results.filter(b => iso(b.t) < D[0]).map(b => b.c), byD = new Map(j.results.map(b => [iso(b.t), b.c]));
    const arr = new Float64Array(pre.length + T).fill(NaN); pre.forEach((c, i) => { arr[i] = c; }); for (let t = 0; t < T; t++) arr[pre.length + t] = byD.get(D[t]) || spyC[t];
    ctx.spyC = arr; ctx.off = pre.length; } log('SPY history before the window: ' + ctx.off + ' sessions'); }
const regimeLog = {}; for (const st of ['full', 'weak', 'crash']) regimeLog[st] = 0; for (let q = a0; q <= T - 1; q++) regimeLog[regimeAt(q, ctx)]++; log('regime sessions: ' + JSON.stringify(regimeLog));
const ALL = { PLAIN, ...POLICIES };
const sim = (pol, cap, a, b, cost) => runAccount({ D, a, b, cands, series, ind, ctx, capital: cap, policy: pol, cost });
const brief = (r, a, b, cap) => { const c = curve(r.eq, D, a, b, cap), tr = r.trades;
  const byRule = {}; for (const z of tr) { const x = byRule[z.rule] || (byRule[z.rule] = { trades: 0, usd: 0 }); x.trades++; x.usd += z.usd; } for (const x of Object.values(byRule)) x.usd = r2(x.usd);
  const best = [...tr].sort((p, q) => q.usd - p.usd).slice(0, 3).map(z => ({ sym: z.sym, rule: z.rule, buy: D[z.k], sell: z.x === null ? 'open' : D[z.x], usd: r2(z.usd) }));
  return { ...c, trades: tr.length, buys: r.nBuys, partialBuys: r.partial, skippedNoCash: r.skippedCash, skippedByCap: r.skippedCap, avgInvested: r4(r.avgInvested), openAtEnd: r.openAtEnd, regimeDays: r.regimeDays,
    halalMix: { ok: tr.filter(z => z.halal === 'ok').length, unknown: tr.filter(z => z.halal !== 'ok').length }, byRule, best3: best, winRate: r4(tr.filter(z => z.usd > 0).length / (tr.length || 1)) }; };
const R = {};   // R[id][cap][half] = { run, runStress, c, cs }
for (const [id, pol] of Object.entries(ALL)) { R[id] = {};
  for (const cap of CAPITALS) { R[id][cap] = {};
    for (const [h, [a, b]] of Object.entries(WIN)) { const run = sim(pol, cap, a, b, COST), st = sim(pol, cap, a, b, STRESS); R[id][cap][h] = { run, c: brief(run, a, b, cap), cs: curve(st.eq, D, a, b, cap) }; }
    const full = sim(pol, cap, a0, E, COST), toEnd = sim(pol, cap, a0, T - 1, COST); R[id][cap].full = brief(full, a0, E, cap); R[id][cap].toEnd = brief(toEnd, a0, T - 1, cap); }
  const x = R[id][PRIMARY]; log(id + ' @' + PRIMARY + ': older ' + x.older.c.profit + ' (DD ' + x.older.c.maxDD + ') | newer ' + x.newer.c.profit + ' (DD ' + x.newer.c.maxDD + ') | full ' + x.full.profit + ' | to end ' + x.toEnd.profit); }
const SP = {}; for (const cap of CAPITALS) { SP[cap] = {};
  for (const [h, [a, b]] of Object.entries(WIN)) SP[cap][h] = FUNDS.SPUS ? curve(holdFund(FUNDS.SPUS, a, b, cap), D, a, b, cap) : null;
  SP[cap].full = FUNDS.SPUS ? curve(holdFund(FUNDS.SPUS, a0, E, cap), D, a0, E, cap) : null; SP[cap].toEnd = FUNDS.SPUS ? curve(holdFund(FUNDS.SPUS, a0, T - 1, cap), D, a0, T - 1, cap) : null;
  SP[cap].hlalFull = FUNDS.HLAL ? curve(holdFund(FUNDS.HLAL, a0, E, cap), D, a0, E, cap) : null; }
const strip = (c) => { if (!c) return c; const { monthly, ...rest } = c; return rest; };

// ================= 4. VERDICTS =================
const RES = {};
if (complete) for (const id of Object.keys(POLICIES)) { const byCap = {}, fails = [];
  for (const cap of CAPITALS) { const blk = {};
    for (const h of ['older', 'newer']) { const P = R[id][cap][h], B = R.PLAIN[cap][h], g = gates(P.c, B.c, SP[cap][h], P.run.trades);
      blk[h] = halfBlock({ pol: P.c, polStress: P.cs, plain: B.c, spus: SP[cap][h], trades: P.run.trades, capital: cap, g });
      blk[h].usd = strip(P.c); blk[h].plain = strip(B.c); blk[h].spus = strip(SP[cap][h]);
      for (const [k, v] of Object.entries(g)) if (v === false && k !== 'pass') fails.push(cap + ' USD ' + h + ' half: ' + ({ beatsPlain: 'did not beat plain 1,000 USD tickets (' + P.c.profit + ' vs ' + B.c.profit + ')', beatsSPUS: 'did not beat SPUS held (' + P.c.profit + ' vs ' + SP[cap][h].profit + ')', drawdownOk: 'max drawdown ' + (P.c.maxDD * 100).toFixed(1) + '% vs SPUS ' + (SP[cap][h].maxDD * 100).toFixed(1) + '% (more than 5 points worse)', noTop2BeatsPlain: 'without its 2 best trades ' + g.noTop2Profit + ' did not beat plain ' + B.c.profit })[k]); }
    byCap[cap] = { older: blk.older, newer: blk.newer, pass: blk.older.gates.pass && blk.newer.gates.pass, fiveYear: strip(R[id][cap].full), toLastDay: strip(R[id][cap].toEnd) }; }
  const pass = CAPITALS.every(c => byCap[c].pass);
  RES[id] = { at: new Date().toISOString(), verdict: pass ? 'PASS (money-management policy; not a buy signal)' : 'REJECTED', why: pass ? 'all four gates in both halves at 10,000, 25,000 and 50,000 USD' : fails.slice(0, 12).join('; ') + (fails.length > 12 ? '; ... (' + fails.length + ' gate failures)' : ''),
    passAt: CAPITALS.filter(c => byCap[c].pass), policy: POLICIES[id], capital: PRIMARY, results: { older: byCap[PRIMARY].older, newer: byCap[PRIMARY].newer }, byCapital: byCap,
    windows: { older: [D[WIN.older[0]], D[WIN.older[1]]], newer: [D[WIN.newer[0]], D[WIN.newer[1]]] }, split: SPLIT, cost: COST, stress: STRESS };
  log('- ' + id + ': ' + RES[id].verdict + ' | pass at ' + (RES[id].passAt.join(', ') || 'none') + ' | ' + RES[id].why.slice(0, 500)); }
const firstRun = freezeEach(FROZEN, RES, (r) => complete && !!r.verdict);
const newlyFrozen = Object.keys(firstRun).filter(k => !(k in FROZEN));

// ================= 5. OUTPUT =================
const baseline = {}; for (const cap of CAPITALS) baseline[cap] = { plain: { older: strip(R.PLAIN[cap].older.c), newer: strip(R.PLAIN[cap].newer.c), fiveYear: strip(R.PLAIN[cap].full), toLastDay: strip(R.PLAIN[cap].toEnd) },
  spus: { older: strip(SP[cap].older), newer: strip(SP[cap].newer), fiveYear: strip(SP[cap].full), toLastDay: strip(SP[cap].toEnd) }, hlalFiveYear: strip(SP[cap].hlalFull) };
const monthly = {}; for (const id of Object.keys(ALL)) monthly[id] = { full10k: R[id][PRIMARY].full.monthly }; monthly.SPUS = { full10k: SP[PRIMARY].full ? SP[PRIMARY].full.monthly : null };
const out = { generatedAt: new Date().toISOString(), preRegistered: 'squad3-core.mjs header + data/strategy-library.json SQ3-* (24 Oct 2026, before any run)', squad: 3, label: 'MONEY MANAGEMENT policies on the rules that made money in both halves. A policy is NOT a buy signal.',
  window: [D[0], D[T - 1]], windows: { older: [D[WIN.older[0]], D[WIN.older[1]]], newer: [D[WIN.newer[0]], D[WIN.newer[1]]], fiveYear: [D[a0], D[E]], toLastDay: [D[a0], D[T - 1]] },
  standard: 'per capital (10,000 / 25,000 / 50,000 USD) and per half (separate accounts): profit > the same rules on plain 1,000 USD tickets; profit > SPUS held; max drawdown (% of peak equity) no worse than SPUS by more than 5 points; profit minus its 2 best trades > plain. PASS = all gates, both halves, all three capitals.',
  fields: 'results.older / newer at 10,000 USD (byCapital for all): n = trades, blocks = months, avg = mean monthly return (0.8% cost), avgStress = the same at 1.2%, edge = mean monthly return minus SPUS held, noTop2 = (profit - 2 best trades - plain profit) / capital / months, tBlock = t of the monthly differences vs SPUS, vsPlain = (profit - plain) / capital / months; usd / plain / spus = USD curves (profit, perMonthMedian, worstMonth, maxDD as % of peak, monthsPositive)',
  complete, incomplete, inputs: INPUT, usableSignals: cands.length, zadNotHalalLeftOut: haramOut, extraSeries: [...EXTRA.keys()], spyHistoryBefore: ctx.off, regimeSessions: regimeLog, breadthCovered: [...breadth].filter(x => isFinite(x)).length,
  firstRun, newlyFrozen, baseline, monthly,
  latest: Object.keys(RES).length && !newlyFrozen.length ? latestBlock({ at: new Date().toISOString(), verdicts: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { verdict: r.verdict, passAt: r.passAt }])) }) : (PREV.latest || null) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], note: 'Squad 3 tests money-management POLICIES (size, adds, exits), not stock picks. No policy produces picks of its own, so there are no signals here.', methods: {} }, null, 1));
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const id of Object.keys(POLICIES)) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const o = r.results.older, n = r.results.newer;
    e.status = 'tested: ' + (r.verdict.startsWith('PASS') ? 'pass (money management, not a buy signal)' : 'rejected'); e.tested = D[T - 1]; e.study = 'squad3-lab.mjs -> data/squad3-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, passAt: r.passAt, capital: PRIMARY, profitUsd: [o.usd.profit, n.usd.profit], plainUsd: [o.plain.profit, n.plain.profit], spusUsd: [o.spus.profit, n.spus.profit], maxDD: [o.usd.maxDD, n.usd.maxDD], spusDD: [o.spus.maxDD, n.spus.maxDD], noTop2Usd: [o.gates.noTop2Profit, n.gates.noTop2Profit], fiveYearUsd: CAPITALS.map(c => r.byCapital[c].fiveYear.profit), why: r.why.slice(0, 600) }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad3-lab: library not updated: ' + e.message); }
console.log('SQUAD3 LAB ' + D[0] + ' to ' + D[T - 1] + ' | ' + (complete ? 'complete' : 'INCOMPLETE: ' + incomplete.join(', ')) + ' | frozen ' + Object.keys(firstRun).length + '/' + Object.keys(POLICIES).length + ' | pass: ' + (Object.entries(firstRun).filter(([, r]) => /^PASS/.test(r.verdict)).map(([k]) => k).join(', ') || 'none'));
