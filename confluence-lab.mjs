// CONFLUENCE LAB (24 Oct 2026; owner: "multiple real ways to make money before Monday's open"). Research + a FORWARD PAPER lane; never
// places an order; no Telegram. Rule: confluence-core.mjs header (CONF-2 / CONF-3, pre-registered 24 Oct 2026 before any run; the lab
// also writes the same text into data/strategy-library.json before computing anything).
// 1. PRICES (GitHub Actions only; keys only from secrets, never printed): the 5-year whole-market cache of the Sunday job
//    (study-cache/grouped.json.gz, RESTORED READ ONLY, dead stocks' later prices in its x rows) + the sessions since, from Massive's
//    grouped daily bars + splits since the cache day (the anomaly-lab pattern) + SPUS / HLAL daily bars (portfolio yardstick).
// 2. INPUT SIGNALS: each input rule's frozen 5-year trade list from its lab file (value-lab, decoded-history, expert-lab, anomaly-lab), and
//    for the rules whose lab stored only its newest trades, the full lists in data/confluence-signals.json.gz (confluence-signals.mjs).
//    A rule whose full list is missing or does not match its frozen counts makes the run INCOMPLETE (nothing frozen).
// 3. 5-YEAR ONE-SHOT for CONF-2 and CONF-3 (only while not frozen): first complete verdict frozen in data/confluence-lab.json firstRun
//    (value-lab.json format: results.older / newer / all with avg, avgStress, edge, vsOwn, noTop2, tBlock ...). Pair-by-pair split and year
//    by year: information only.
// 4. PORTFOLIO SIMULATION (information only, data/confluence-portfolio.json): the owner running TRY SMALL (and TRY SMALL + CONF) with
//    2 / 5 / 10 slots, 300 / 1,000 USD a buy, 3 USD per buy and per sale + 0.8% cost, each rule's own hold and stop, the most liquid first
//    when slots are full; the same dollars in SPUS / HLAL on the same sessions. Runs with the one-shot, or PORTFOLIO=1.
// 5. PAPER LANE (signals from the 23 Oct 2026 close): the input rules' own forward ledgers (decoded / anomaly / expert paper files, value
//    lab picks) are copied into data/confluence-paper.jsonl as input lines; each new CONF fire is appended once with its frozen plan; each
//    is resolved with the same walk. data/confluence-today.json (methods[id].newSignals = [{ sym, close, halal, ... }]) and
//    data/confluence-board.json (closed paper trades after 0.8% cost, vs the average stock; READY = 30+ trades on 10+ days > 0).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, TIER2_T } from './value-core.mjs';
import { ownAverage, nextSession } from './anomaly-core.mjs';
import { RULES, VERSIONS, TRY_SMALL, COST, SPLIT, BLOCK, PAPER_START, stopFor, halfOf, r4, r2, confluence, oneOpen, walk, simulate, curveStats, losingStreak, preRegister } from './confluence-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const OUT = 'data/confluence-lab.json', PAPER = 'data/confluence-paper.jsonl', TODAY = 'data/confluence-today.json', BOARD = 'data/confluence-board.json', PORT = 'data/confluence-portfolio.json', SIGF = 'data/confluence-signals.json.gz';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), START = env.PAPER_START || PAPER_START;

// ================= 0. PRE-REGISTRATION in the library (before any computation; idempotent) =================
{ const LB = J('data/strategy-library.json', null), ch = preRegister(LB); if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); log('library: ' + ch + ' CONF entries pre-registered now'); }

// ================= 1. PRICES =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('confluence-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
store = null;
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; C[q] /= r; OX[q] /= r; CX[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY');
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS);
// liquidity (anomaly-lab): close 5 USD+ and 20-session average traded value 5M USD+ (main rows only); ADV = that average (priority)
const LIQ = new Uint8Array(N), ADV = new Float32Array(N); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = C[b + t] * V[b + t]; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const w = C[b + t - 20] * V[b + t - 20]; if (isFinite(w)) { s -= w; n--; } } if (t >= 19 && n > 0) ADV[b + t] = s / n; if (t >= 19 && n === 20 && C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqAt = new Map(); const liqList = (t) => { if (!liqAt.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqAt.set(t, a); } return liqAt.get(t); };
const closeAt = (i, x, k) => { for (let q = x; q >= k; q--) { const z = C[i * T + q]; if (z > 0) return z; const y = CX[i * T + q]; if (y > 0) return y; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1) return null; const e = O[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const cMemo = new Map(); const ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; const g = ret(i, k, x); if (g !== null && Math.abs(g) < 3) v.push(g); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
// merged series of one stock for the walk: main rows, else the thin-trading rows (a dying stock keeps its later prices)
const serMemo = new Map(); const series = (sym) => { const i = SY.get(sym); if (i === undefined) return null; if (serMemo.has(i)) return serMemo.get(i); const b = i * T, o = new Float64Array(T), c = new Float64Array(T);
  for (let t = 0; t < T; t++) { o[t] = O[b + t] > 0 ? O[b + t] : OX[b + t] > 0 ? OX[b + t] : NaN; c[t] = C[b + t] > 0 ? C[b + t] : CX[b + t] > 0 ? CX[b + t] : NaN; }
  const s = { O: o, C: c }; if (serMemo.size > 3000) serMemo.clear(); serMemo.set(i, s); return s; };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const sessionOf = (d) => { if (tOf.has(d)) return tOf.get(d); let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo - 1; };   // the last session on or before d

// ================= 2. INPUT SIGNALS (5 years) =================
const VL = J('data/value-lab.json', {}), DH = J('data/decoded-history.json', {}), EL = J('data/expert-lab.json', {}), AL = J('data/anomaly-lab.json', {}), SG = JZ(SIGF, { signals: {}, check: {} });
const LABS = { 'value-lab': VL, 'decoded-history': DH, 'expert-lab': EL, 'anomaly-lab': AL };
const INPUT = {}, inputs = [];
for (const [id, r] of Object.entries(RULES)) { const L = LABS[r.lab], fr = (L.firstRun || {})[id], stored = (L.trades || {})[id] || [], nFrozen = fr && fr.results ? (fr.results.older.n || 0) + (fr.results.newer.n || 0) : null;
  let list = null, source = null, full = false;
  if (id === 'B-BASK1_3m') { list = stored.flatMap(b => { const k = tOf.get(b.buy); return k > 0 ? (b.names || []).map(s => [s, D[k - 1]]) : []; }); full = stored.length >= nFrozen; source = 'value-lab.json trades (basket names, signal = the session before the buy)'; }
  else if (stored.length >= (nFrozen || Infinity)) { list = stored.map(z => [z.s, z.sig || z.d]); full = true; source = r.lab + '.json trades (full list)'; }
  else if (SG.signals[id]) { list = SG.signals[id]; full = !!(SG.check[id] && SG.check[id].match); source = 'confluence-signals.json.gz (recomputed by a patched copy of the lab; check ' + JSON.stringify(SG.check[id] || null) + ')'; }
  else { list = stored.map(z => [z.s, z.sig || z.d]); full = false; source = r.lab + '.json trades: ONLY the newest ' + stored.length + ' of ' + nFrozen + ' (full list missing)'; }
  let used = 0, noPrice = 0; for (const [s, d] of list) { const t = sessionOf(d); if (!SY.has(s) || t < 0) { noPrice++; continue; } inputs.push({ rule: id, sym: s, t }); used++; }
  INPUT[id] = { family: r.family, hold: r.hold, why: r.why, nearMiss: !!r.nearMiss, frozenVerdict: fr ? fr.verdict : null, frozenTrades: nFrozen, signals: list.length, used, noPrice, full, source }; }
const incomplete = Object.entries(INPUT).filter(([, x]) => !x.full).map(([k]) => k);
log('inputs: ' + Object.entries(INPUT).map(([k, x]) => k + ' ' + x.used + (x.full ? '' : ' (NOT FULL)')).join(', '));
const complete = T >= 1000 && !incomplete.length;

// ================= 3. 5-YEAR ONE-SHOT =================
const HOLD_END = T - 1;
function confTrades(minFam) { const cands = confluence(inputs, { minFam }), W = new Map();
  const kept = oneOpen(cands, (c) => { const s = series(c.sym), w = s ? walk(s.O, s.C, c.t + 1, c.hold, c.stop) : null; if (!w || w.open) return null; W.set(c.sym + '|' + c.t, w); return w.x; });
  const tr = []; for (const c of kept) { const w = W.get(c.sym + '|' + c.t), i = SY.get(c.sym), k = c.t + 1, cc = ctrlSpan(k, w.x); if (cc === null || !isFinite(w.g)) continue;
    tr.push({ t: c.t, s: c.sym, i, k, x: w.x, g: w.g, c: cc, half: halfOf(D[c.t]), fams: c.fams, rules: c.rules, hold: c.hold, kind: w.kind }); }
  const spans = new Map(); for (const z of tr) (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, z.x]);
  const ownMemo = new Map(); for (const z of tr) { const len = z.x - z.k + 1, key = z.i + '|' + len + '|' + z.half;
    if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 253, to: T - 1, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  return { cands, tr }; }
const need = Object.keys(VERSIONS).filter(id => !FROZEN[id]), doHist = need.length > 0 || !!env.HISTORY;
const RES = {}, INFO = {}, CANDS = {};
if (doHist || env.PORTFOLIO || !fs.existsSync(PORT)) for (const id of Object.keys(VERSIONS)) { const { cands, tr } = confTrades(VERSIONS[id].minFam); CANDS[id] = cands; if (!doHist) continue;
  const R = { older: halfStat(tr.filter(z => z.half === 'older'), BLOCK), newer: halfStat(tr.filter(z => z.half === 'newer'), BLOCK), all: halfStat(tr, BLOCK) };
  const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  const brief = (a) => { const h = halfStat(a, BLOCK); return h.n ? { n: h.n, days: h.days, avg: h.avg, avgStress: h.avgStress, edge: h.edge, noTop2: h.noTop2, tBlock: h.tBlock, win: h.win } : { n: 0 }; };
  const pairs = {}; for (const z of tr) (pairs[z.fams.join(' + ')] = pairs[z.fams.join(' + ')] || []).push(z);
  INFO[id] = { label: 'INFORMATION ONLY (not judged)', candidates: cands.length,
    shape: { trades: tr.length, win: r4(w.length / (tr.length || 1)), avgWin: r4(mean(w)), avgLoss: r4(mean(l)), pf: l.length ? r4(sum(w) / -sum(l)) : null, avgSessions: r4(mean(tr.map(z => z.x - z.k + 1))), stops: tr.filter(z => z.kind === 'stop').length },
    byHold: Object.fromEntries([...new Set(tr.map(z => z.hold))].sort((a, b) => a - b).map(h => [h, { older: brief(tr.filter(z => z.hold === h && z.half === 'older')), newer: brief(tr.filter(z => z.hold === h && z.half === 'newer')) }])),
    byFamilies: Object.fromEntries(Object.entries(pairs).sort((a, b) => b[1].length - a[1].length).map(([k, a]) => [k, { older: brief(a.filter(z => z.half === 'older')), newer: brief(a.filter(z => z.half === 'newer')) }])),
    withoutPullback: { note: 'the same trades minus every trade with DEC2-TPS in its window', older: brief(tr.filter(z => z.half === 'older' && !z.rules.includes('DEC2-TPS'))), newer: brief(tr.filter(z => z.half === 'newer' && !z.rules.includes('DEC2-TPS'))) },
    strictInputsOnly: { note: 'the same trades minus every trade that needed a near-miss input (EXP-13F2, EXP-INS1, DEC2-MINTT) to reach its family count', older: null, newer: null },
    byYear: Object.fromEntries([...new Set(tr.map(z => D[z.t].slice(0, 4)))].sort().map(y => { const v = tr.filter(z => D[z.t].slice(0, 4) === y).map(z => z.g - COST); return [y, { n: v.length, avg: r4(mean(v)), win: r4(v.filter(x => x > 0).length / v.length) }]; })) };
  { const strict = tr.filter(z => { const fams = new Set(); for (const r of z.rules) if (!RULES[r].nearMiss) fams.add(RULES[r].family); return fams.size >= VERSIONS[id].minFam; });
    INFO[id].strictInputsOnly.older = brief(strict.filter(z => z.half === 'older')); INFO[id].strictInputsOnly.newer = brief(strict.filter(z => z.half === 'newer')); }
  RES[id] = { ...judge(R, { bar: BAR }), results: R, hold: BLOCK, holdNote: 'each trade holds the shortest hold of its input rules (10 to 126 sessions; stop 15%, 35% for 126); 63 = the block length of the luck test. The per-signal hold and stop are in confluence-today.json newSignals.',
    block: BLOCK, split: SPLIT, cost: COST, window: [D[0], D[HOLD_END]], inputsComplete: complete, incomplete,
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], hold: z.hold, exit: z.kind, fams: z.fams, rules: z.rules, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + (complete ? '' : ' (INPUTS INCOMPLETE: not frozen)') + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + RES[id].why.slice(0, 400)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), bar: BAR, ...strip(r) }])), (r) => complete && r.verdict && r.verdict !== 'NOT RUN');

// ================= 4. PORTFOLIO SIMULATION (information only) =================
async function fundBars(sym) { const j = await api('/v2/aggs/ticker/' + sym + '/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000'); if (!j || !Array.isArray(j.results)) return null;
  const o = new Float64Array(T).fill(NaN), c = new Float64Array(T).fill(NaN); for (const b of j.results) { const t = tOf.get(new Date(b.t).toISOString().slice(0, 10)); if (t !== undefined) { o[t] = b.o; c[t] = b.c; } } return { O: o, C: c, days: j.results.length }; }
let PORTF = J(PORT, null);
if (Object.keys(CANDS).length && (doHist || env.PORTFOLIO || !PORTF)) {
  const FUNDS = {}; for (const f of ['SPUS', 'HLAL']) { FUNDS[f] = await fundBars(f); log('fund ' + f + ': ' + (FUNDS[f] ? FUNDS[f].days + ' days' : 'NOT LOADED')); }
  const liqOf = (sym, t) => { const i = SY.get(sym); return i === undefined ? 0 : ADV[i * T + t] || 0; };
  const ts = inputs.filter(z => TRY_SMALL[z.rule]).map(z => ({ id: z.rule + '|' + z.sym + '|' + D[z.t], sym: z.sym, k: z.t + 1, liq: liqOf(z.sym, z.t), hold: TRY_SMALL[z.rule], stop: stopFor(TRY_SMALL[z.rule]), rule: z.rule })).filter(c => c.k < T);
  const conf = (id) => (CANDS[id] || []).map(c => ({ id: id + '|' + c.sym + '|' + D[c.t], sym: c.sym, k: c.t + 1, liq: liqOf(c.sym, c.t), hold: c.hold, stop: c.stop, rule: id })).filter(c => c.k < T);
  const SETS = { 'TRY SMALL': ts, 'TRY SMALL + CONF-2': [...ts, ...conf('CONF-2')], 'TRY SMALL + CONF-3': [...ts, ...conf('CONF-3')], 'CONF-2 alone': conf('CONF-2'), 'CONF-3 alone': conf('CONF-3') };
  const a0 = D.findIndex(d => d >= '2021-10-12'), mid = D.findIndex(d => d >= SPLIT), periods = { 'all': [a0, T - 1], 'older half (2021-10 to 2023-12)': [a0, mid - 1], 'newer half (2024-01 to 2026-10)': [mid, T - 1] };
  for (const y of [...new Set(D.slice(a0).map(d => d.slice(0, 4)))]) { const a = D.findIndex(d => d.slice(0, 4) === y), b = D.length - 1 - [...D].reverse().findIndex(d => d.slice(0, 4) === y); periods[y] = [Math.max(a, a0), b]; }
  const rows = [];
  for (const [set, cands] of Object.entries(SETS)) for (const slots of [2, 5, 10]) for (const size of [300, 1000]) { const cap = slots * size, row = { set, slots, size, capital: cap, periods: {} };
    const runs = {}; for (const f of ['SPUS', 'HLAL']) runs[f] = simulate({ T, cands, series, slots, size, bench: FUNDS[f] || null });
    const r = runs.SPUS, tr = r.trades, net = tr.map(z => z.usd);
    row.trades = tr.length; row.win = r4(net.filter(x => x > 0).length / (tr.length || 1)); row.avgUsdPerTrade = r2(mean(net)); row.feesUsd = r2(tr.length * 6); row.costUsd = r2(tr.length * size * COST); row.skippedNoSlot = r.skipped; row.stillOpen = r.stillOpen;
    row.byRule = Object.fromEntries([...new Set(tr.map(z => z.rule))].map(k => { const a = tr.filter(z => z.rule === k); return [k, { trades: a.length, usd: r2(a.reduce((x, z) => x + z.usd, 0)), win: r4(a.filter(z => z.usd > 0).length / a.length) }]; }));
    row.losingStreak = losingStreak(tr); { const srt = [...net].sort((x, y) => y - x), med = srt.length ? srt[srt.length >> 1] : null; row.best3TradesUsd = srt.slice(0, 3).map(r2); row.medianTradeUsd = r2(med);
      row.profitWithoutBest2 = r2(net.reduce((a, x) => a + x, 0) - srt.slice(0, 2).reduce((a, x) => a + x, 0)); row.avgSlotsUsed = r2(r.avgOpen); }
    for (const [p, [a, b]] of Object.entries(periods)) { const inP = tr.filter(z => z.x >= a && z.x <= b);
      row.periods[p] = { strategy: curveStats(r.eq, D, a, b, cap), tradesClosed: inP.length, losingStreak: losingStreak(inP),
        sameDollarsSPUS: FUNDS.SPUS ? curveStats(runs.SPUS.meq, D, a, b, cap) : null, sameDollarsHLAL: FUNDS.HLAL ? curveStats(runs.HLAL.meq, D, a, b, cap) : null,
        buyHoldSPUS: FUNDS.SPUS ? holdFund(FUNDS.SPUS, a, b, cap) : null, buyHoldHLAL: FUNDS.HLAL ? holdFund(FUNDS.HLAL, a, b, cap) : null }; }
    rows.push(row); const A = row.periods.all; log('portfolio ' + set + ' ' + slots + 'x' + size + ': ' + tr.length + ' trades, profit ' + A.strategy.profit + ' USD (' + pc(A.strategy.returnOnCapital) + '), median month ' + A.strategy.perMonthMedian + ', worst ' + A.strategy.worstMonth + ', maxDD ' + A.strategy.maxDrawdown + ' | same $ SPUS ' + (A.sameDollarsSPUS ? A.sameDollarsSPUS.profit : 'n/a') + ' | hold SPUS ' + (A.buyHoldSPUS ? A.buyHoldSPUS.profit : 'n/a')); }
  PORTF = { generatedAt: new Date().toISOString(), label: 'INFORMATION ONLY: a simulation of the owner running these lanes on the 5-year history; not a rule, not a verdict', window: [D[a0], D[T - 1]],
    assumptions: ['each input signal bought at the next open (fractional shares), sold by its own rule: TRY SMALL rules at their lane hold (B-FCF1 63, DEC-FROG 126, ANOM-52WH 126, ANOM-RESMOM 63, ANOM-SUESURGE 60 sessions), CONF trades at their shortest input hold; stop at the next open after a close 15% under the buy (35% for 126-session holds)',
      'slots full: the most liquid signal (20-session average traded value) first; a stock already held is not bought again', '3 USD per buy and per sale + 0.8% cost on the money traded (stocks); funds: the same 3 USD fees + 0.1%',
      'sameDollars = every buy of the strategy replaced by the same USD in the fund on the same buy and sale sessions; buyHold = the whole capital (slots x size) in the fund from the period start',
      'months: change in (realized + open marks); drawdown on the daily marks; positions still open at the end are marked at the last close', 'NOT modelled: the ZAD halal filter of the real lane (history has no halal marks), the "switch off after 10 losing results" rule, taxes, dividends'],
    funds: Object.fromEntries(Object.entries(FUNDS).map(([k, v]) => [k, v ? v.days + ' daily bars' : 'not loaded'])), rows }; }
function holdFund(F, a, b, cap) { let e = null, q0 = a; for (let q = a; q <= b; q++) if (F.O[q] > 0) { e = F.O[q]; q0 = q; break; } if (!e) return null; let last = null; for (let q = b; q >= q0; q--) if (F.C[q] > 0) { last = F.C[q]; break; }
  const eq = new Float64Array(b + 1); let lc = e; for (let q = q0; q <= b; q++) { if (F.C[q] > 0) lc = F.C[q]; eq[q] = cap * (lc / e - 1) - 3 - cap * 0.0005; } return curveStats(eq, D, q0, b, cap); }

// ================= 5. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const seenIds = new Set(lines.map(x => x.id)), newLines = [], lastD = D[T - 1];
const addInput = (m, sym, d, from) => { if (!RULES[m] || !sym || !d) return; const id = 'in|' + m + '|' + sym + '|' + d; if (seenIds.has(id)) return; seenIds.add(id); const l = { type: 'input', id, m, sym, d, from, recordedAfter: lastD }; newLines.push(l); lines.push(l); };
const minInputDay = iso(Date.parse(START + 'T00:00:00Z') - 10 * 864e5);
for (const [f, lab] of [['data/decoded-paper.jsonl', 'decoded'], ['data/anomaly-paper.jsonl', 'anomaly'], ['data/expert-paper.jsonl', 'expert']]) { let txt = ''; try { txt = fs.readFileSync(f, 'utf8'); } catch (e) { continue; }
  for (const l of txt.split('\n')) { if (!l.includes('"signal"')) continue; let x; try { x = JSON.parse(l); } catch (e) { continue; } if (x.type === 'signal' && x.d >= minInputDay) addInput(x.m, x.sym, x.d, lab + ' paper'); } }
{ const VT = J('data/value-today.json', {}); for (const [rid, m] of [['B-FCF1', 'B-FCF1'], ['B-BASK1', 'B-BASK1_3m']]) { const R = (VT.rules || {})[rid]; if (R && R.formed && R.formed >= minInputDay) for (const p of R.picks || []) addInput(m, p.sym, R.formed, 'value-today'); } }
const pin = lines.filter(x => x.type === 'input' && tOf.has(x.d) && SY.has(x.sym)).map(x => ({ rule: x.m, sym: x.sym, t: tOf.get(x.d) }));
const sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.sid));
const board = {}, today = {};
for (const [id, v] of Object.entries(VERSIONS)) { const fires = confluence(pin, { minFam: v.minFam }).filter(c => D[c.t] >= START);
  const mine = sigLines.filter(x => x.m === id), openUntil = new Map();
  const exitIdx = (x) => { const s = series(x.sym), k = tOf.get(x.d) + 1; if (!s || k >= T) return Infinity; const w = walk(s.O, s.C, k, x.hold, x.stopPct); return !w ? -1 : w.open ? Infinity : w.x; };
  for (const x of mine) openUntil.set(x.sym, Math.max(openUntil.get(x.sym) ?? -1, exitIdx(x)));
  for (const c of fires) { const sid = id + '|' + c.sym + '|' + D[c.t]; if (seenIds.has(sid)) continue; if ((openUntil.get(c.sym) ?? -1) >= c.t + 1) continue;
    const i = SY.get(c.sym), line = { type: 'signal', id: sid, m: id, sym: c.sym, d: D[c.t], close: r4(C[i * T + c.t] > 0 ? C[i * T + c.t] : CX[i * T + c.t]), halal: halal(c.sym), hold: c.hold, stopPct: c.stop, families: c.fams, rules: c.rules,
      plan: 'buy at the open of ' + nextSession(D[c.t]) + ' (the next session after ' + D[c.t] + '), hold ' + c.hold + ' sessions, stop: sell at the next open after a close ' + Math.round(c.stop * 100) + '% under the buy', recordedAfter: lastD };
    seenIds.add(sid); newLines.push(line); sigLines.push(line); mine.push(line); openUntil.set(c.sym, exitIdx(line)); }
  const closed = [], openNow = [], waiting = [];
  for (const x of mine) { const s = series(x.sym), k = tOf.get(x.d) + 1; if (!s || !(k < T)) { waiting.push(x); continue; } const w = walk(s.O, s.C, k, x.hold, x.stopPct);
    if (!w) { waiting.push(x); continue; } if (w.open) { let c = NaN; for (let q = T - 1; q >= k; q--) if (s.C[q] > 0) { c = s.C[q]; break; } openNow.push({ sym: x.sym, halal: x.halal, signal: x.d, buy: D[k], sinceBuy: r4(c / s.O[k] - 1), exitAfter: x.hold + ' sessions', stopPct: x.stopPct, families: x.families }); continue; }
    const cc = ctrlSpan(k, w.x); closed.push({ d: x.d, sym: x.sym, g: w.g, c: cc, halal: x.halal });
    if (!resolved.has(x.id)) { resolved.add(x.id); newLines.push({ type: 'result', id: 'res|' + x.id, sid: x.id, m: id, sym: x.sym, d: x.d, buy: D[k], sell: D[w.x], exit: w.kind, g: r4(w.g), net: r4(w.g - COST), avgStock: cc === null ? null : r4(cc - COST) }); } }
  const st = (rows) => { const net = rows.map(r => r.g - COST), e = rows.filter(r => r.c !== null && r.c !== undefined); return { n: rows.length, days: new Set(rows.map(r => r.d)).size, avg: r4(mean(net)), win: rows.length ? r4(net.filter(x => x > 0).length / rows.length) : null, edge: e.length ? r4(mean(e.map(r => r.g - r.c))) : null }; };
  const s = st(closed), fr = firstRun[id];
  board[id] = { name: v.name, signals: mine.length, waiting: waiting.length, open: openNow.length, closed: s, halalOk: st(closed.filter(z => z.halal === 'ok')), ready: s.n >= 30 && s.days >= 10 && s.avg > 0, fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  today[id] = { name: v.name, hold: BLOCK, tier: fr ? fr.verdict : null, holdNote: 'each signal carries its own hold (sessions) and stopPct', newSignals: mine.filter(x => x.recordedAfter === lastD).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, hold: x.hold, stopPct: x.stopPct, families: x.families, rules: x.rules, plan: x.plan })), open: openNow }; }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: lastD, paperStart: START, inputsSeen: pin.length,
  note: 'PAPER ONLY. A stock picked by 2+ (CONF-3: 3+) different rule families within 5 sessions. Nothing here is a buy by itself: a version needs a TRADABLE SMALL / PROVEN frozen 5-year verdict (data/confluence-lab.json firstRun), or the TRY SMALL gates, or 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: lastD, paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.filter(x => x.type === 'input').length + ' new input signals, ' + newLines.filter(x => x.type === 'signal').length + ' new CONF signals (' + Object.entries(today).map(([k, x]) => k + ' ' + x.newSignals.map(z => z.sym).join(' ')).join(' | ') + ')');

// ================= 6. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'confluence-core.mjs header + data/strategy-library.json CONF-2 / CONF-3 (24 Oct 2026, before any run)', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, block: BLOCK, complete, incomplete,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its other days, > 0 without the 2 best, block t >= ' + TIER2_T + ' (63-session blocks) -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN',
  inputs: INPUT, firstRun, info: Object.keys(INFO).length ? INFO : (PREV.info || {}),
  latest: Object.keys(RES).length ? latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }) : (PREV.latest || null),
  trades: Object.keys(RES).length ? Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, r.trades])) : (PREV.trades || {}) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
if (PORTF) fs.writeFileSync(PORT, JSON.stringify(PORTF, null, 1));
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const id of Object.keys(VERSIONS)) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 23 Oct 2026 close'; e.tested = String(r.window[1]); e.study = 'confluence-lab.mjs -> data/confluence-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: [R.older.win, R.newer.win], why: r.why }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('confluence-lab: library not updated: ' + e.message); }
console.log('CONFLUENCE LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | inputs ' + (complete ? 'complete' : 'INCOMPLETE: ' + incomplete.join(', ')) + ' | frozen ' + Object.keys(firstRun).length + '/' + Object.keys(VERSIONS).length);
