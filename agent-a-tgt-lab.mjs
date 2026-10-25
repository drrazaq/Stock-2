// AGENT A TARGETS STUDY LAB (A-TGT1; 25 Oct 2026). agent-a-tgt-core.mjs = the pre-registered rules (written before any run).
// Do a profit target (+10 / +15 / +20%), a 10% trailing stop or a 10% stop from the buy (Han, Zhou & Zhu) beat the current exit (the close
// of the fixed hold) on the live TRY SMALL rules SQ11-PB12, SQ6-MTUM and SQ6-QMOM? Research only; never places an order; no Telegram.
// DATA: exactly squad20-lab.mjs's price section (the 5-year whole-market cache study-cache/grouped.json.gz, RESTORED READ ONLY, with highs
// and lows; the sessions since from Massive grouped daily; splits since the cache repaired). Bases rebuilt as squad20-lab.mjs did.
// 5-YEAR ONE-SHOT for every A-TGT rule not yet frozen; first complete verdict frozen in data/agent-a-tgt-lab.json firstRun.
// DIAG=1: data coverage and base counts only; nothing judged or written in data/.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { tradeG } from './yardstick.mjs';
import { ownAverage } from './anomaly-core.mjs';
import { artifactJumps } from './squad4-core.mjs';
import { yardOf, mtumPick, qmomPick, fip, weekly, weeksOf, topN, sd as sd6, monthEnds as monthEnds6 } from './squad6-core.mjs';
import { nextSession } from './anomaly-core.mjs';
import { RULES, IDS, BASES, BASE_KEYS, EXITS, EXIT_KEYS, COST, SPLIT, r4, mean, halfOf, applyExit, perYearOf, sameWindow, adoptExit, preRegister } from './agent-a-tgt-core.mjs';
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const OUT = env.ATGT_OUT || 'data/agent-a-tgt-lab.json', LIB = env.ATGT_LIB || 'data/strategy-library.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(2.5, +LEAGUE.bar || 0, 4.0), STATUS = {};

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' A-TGT entries written now'); }

// ================= 1. PRICES (squad20-lab.mjs section 1) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('agent-a-tgt-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (OFFLINE || (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE))) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6 || OFFLINE) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none'));
const D = Object.keys(store.days).sort(), T = D.length;
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const CA = new Float32Array(N).fill(NaN), OA = new Float32Array(N).fill(NaN), HA = new Float32Array(N).fill(NaN), LA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
let withHL = 0, rowsAll = 0;
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; HA[k] = x.h ? x.h[j] : NaN; LA[k] = x.l ? x.l[j] : NaN; MAIN[k] = 1; rowsAll++; if (x.h && x.l && x.h[j] > 0) withHL++; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o[j]; VA[k] = x.x.v ? x.x.v[j] : NaN; HA[k] = x.x.h ? x.x.h[j] : NaN; LA[k] = x.x.l ? x.x.l[j] : NaN; } });
const SIC = store.sic || {}; store = null;
if (!OFFLINE) { const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; HA[q] /= r; LA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), cl = (i) => CA.subarray(i * T, i * T + T);
if (spyI === undefined) { console.log('agent-a-tgt-lab: SPY missing from the cache; nothing done'); process.exit(0); }
const lastI = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; }
const LIQ = new Uint8Array(N);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN; if (isFinite(w)) { s -= w; n--; } }
    if (t >= 19 && n === 20 && CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqMemo = new Map(), liqList = (t) => { if (t < 0) return []; if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const SPYC = cl(spyI);
STATUS.price = { ok: T >= 1000 && withHL >= rowsAll * 0.9 && SPYC.filter(x => x > 0).length >= T * 0.95, sessions: T, from: D[0], to: D[T - 1], stocks: NS, rowsWithHighLow: r4(withHL / Math.max(1, rowsAll)) };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks), rows with high/low ' + pc(withHL / Math.max(1, rowsAll)));
const SPYCD = Float64Array.from(SPYC), SPYO = Float64Array.from(OA.subarray(spyI * T, spyI * T + T));
const tOf = new Map(D.map((d, t) => [d, t])), sessionOf = (d) => { if (tOf.has(d)) return tOf.get(d); let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo - 1; };
const ser = (A, i) => A.subarray(i * T, i * T + T);
const JUMPS = new Map(); const artOf = (i) => { if (!JUMPS.has(i)) JUMPS.set(i, new Set(artifactJumps(cl(i)))); return JUMPS.get(i); };
const hasArt = (i, a, b) => { for (const k of artOf(i)) if (k > a && k <= b) return true; return false; };
const SER = new Map(); const seriesOf = (i) => { if (!SER.has(i)) SER.set(i, { o: ser(OA, i), h: ser(HA, i), c: ser(CA, i), last: lastI[i] }); return SER.get(i); };
// the fixed hold from a given buy (squad 11 holdTrade convention, as squad20-core holdFrom)
function holdFrom(S, k, last, hold) { if (k > T - 1) return { pending: true }; if (!(S.o[k] > 0)) return null; const px0 = S.o[k], x = k + hold - 1;
  if (last < T - 6 && last < x) { for (let q = last; q >= k; q--) if (S.c[q] > 0) return { k, x: q, px0, g: S.c[q] / px0 - 1, kind: 'gone', days: q - k + 1 }; return { k, x: k, px0, g: 0, kind: 'gone', days: 1 }; }
  if (x > T - 1) return { open: true };
  for (let q = x; q >= k; q--) if (S.c[q] > 0) return { k, x, px0, g: S.c[q] / px0 - 1, kind: 'max', days: x - k + 1 };
  return null; }

// ================= 2. BASE RULES (squad20-lab.mjs section 6, PB12 / MTUM / QMOM only) =================
const S11 = J('data/squad11-lab.json', {}), S6 = J('data/squad6-lab.json', {});
const frozenN = (L, id) => { const r = (L.firstRun || {})[id]; return r && r.results ? (r.results.older.n || 0) + (r.results.newer.n || 0) : null; };
const SIGNALS = { PB12: ((S11.trades || {})['SQ11-PB12'] || []).map(z => [z.s, z.sig]), MTUM: [], QMOM: [] }, FROZENN = { PB12: frozenN(S11, 'SQ11-PB12'), MTUM: frozenN(S6, 'SQ6-MTUM'), QMOM: frozenN(S6, 'SQ6-QMOM') };
const TV63 = new Float32Array(N).fill(NaN); for (let i = 0; i < NS; i++) { const b = i * T; let s = 0, n = 0; for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; } if (t >= 63) { const w = MAIN[b + t - 63] ? CA[b + t - 63] * VA[b + t - 63] : NaN; if (isFinite(w)) { s -= w; n--; } } if (t >= 62 && n >= 57) TV63[b + t] = s / n; } }
const SECC = J('data/sec-ciks.json', {}), sicOf = (s) => { const x = SIC[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECC[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
const WKS = weeksOf(D), wkMemo = new Map(), wkOf = (i) => { if (!wkMemo.has(i)) wkMemo.set(i, weekly({ o: ser(OA, i), h: ser(HA, i), l: ser(LA, i), c: ser(CA, i) }, WKS).c); return wkMemo.get(i); };
const meLive = (months) => { const a = monthEnds6(D, months), nx = nextSession(D[T - 1]); if (nx.slice(0, 7) !== D[T - 1].slice(0, 7) && months.includes(+D[T - 1].slice(5, 7)) && !a.includes(T - 1)) a.push(T - 1); return a; };
for (const t of meLive([5, 11])) { if (t < 252) continue; const uni = topN(liqList(t).filter(i => CA[i * T + t - 252] > 0).map(i => ({ key: i, v: TV63[i * T + t] })), 600);
  const nW = WKS.findIndex(w => w.e >= t), lastW = WKS[nW] && WKS[nW].e === t ? nW : nW - 1;
  const rows = uni.map(i => { const c = cl(i), a = c[t - 21], m12 = c[t - 252] > 0 && a > 0 ? a / c[t - 252] - 1 : null, m6 = c[t - 126] > 0 && a > 0 ? a / c[t - 126] - 1 : null, wc = wkOf(i), rr = [];
    for (let w = Math.max(1, lastW - 155); w <= lastW; w++) if (wc[w] > 0 && wc[w - 1] > 0) rr.push(wc[w] / wc[w - 1] - 1); const s = rr.length >= 52 ? sd6(rr) * Math.sqrt(52) : null; return { key: i, m6, m12, vol: s }; });
  for (const i of mtumPick(rows, Math.ceil(uni.length * 0.20))) SIGNALS.MTUM.push([SYMS[i], D[t]]); }
for (const t of meLive([2, 5, 8, 11])) { if (t < 252) continue; const uni = topN(liqList(t).filter(i => CA[i * T + t - 252] > 0 && sicOf(SYMS[i]) !== '6798').map(i => ({ key: i, v: TV63[i * T + t] })), 1000);
  const rows = uni.map(i => { const c = cl(i), m = c[t - 21] > 0 && c[t - 252] > 0 ? c[t - 21] / c[t - 252] - 1 : null; return { key: i, m, fip: m === null ? null : fip(c, t - 251, t - 21, m) }; });
  for (const i of qmomPick(rows)) SIGNALS.QMOM.push([SYMS[i], D[t]]); }
STATUS.bases = {}; const BASE_TR = {};
for (const b of BASE_KEYS) { const B = BASES[b], out = [], note = { signals: SIGNALS[b].length, noPrice: 0, open: 0, artifacts: 0, notBought: 0 };
  for (const [sym, d] of SIGNALS[b]) { const t = sessionOf(d); if (t < 0) { note.noPrice++; continue; } const i = SY.get(sym); if (i === undefined) { note.noPrice++; continue; } const S = seriesOf(i);
    const r = holdFrom(S, t + 1, S.last, B.hold); if (!r) { note.notBought++; continue; } if (r.pending || r.open) { note.open++; continue; }
    if (hasArt(i, r.k, r.x)) { note.artifacts++; continue; }
    out.push({ b, sym, i, S, t, sig: D[t], half: halfOf(D[t]), ...r }); }
  BASE_TR[b] = out; const fz = FROZENN[b];
  STATUS.bases[b] = { ok: fz !== null && fz > 0 && out.length >= fz * 0.9 && out.length <= fz * 1.1, rule: B.id, frozenTrades: fz, rebuilt: out.length, ...note };
  log('base ' + b + ' (' + B.id + '): ' + JSON.stringify(STATUS.bases[b])); }
// how often each exit would fire (no returns)
const FIRE = {}; for (const b of BASE_KEYS) for (const x of EXIT_KEYS) { const hit = BASE_TR[b].filter(z => { const e = applyExit(z.S, z, x, z.S.last, T); return e && !e.open; }); FIRE[x + '-' + b] = { older: hit.filter(z => z.half === 'older').length, newer: hit.filter(z => z.half === 'newer').length }; }
log('exit would fire (older/newer): ' + JSON.stringify(FIRE));
if (DIAG) { console.log('AGENT A TARGETS DIAG (data coverage and counts only; nothing judged or written)'); console.log('DATA ' + JSON.stringify(STATUS)); process.exit(0); }

// ================= 3. JUDGING (squad 11 / 18 / 20 standard) =================
const priceAt = (i, x, at) => { if (x > T - 1) return null; if (at === 'o') { const z = OA[i * T + x]; if (z > 0) return z; if (x > lastI[i]) { for (let q = x; q >= 0; q--) if (CA[i * T + q] > 0) return CA[i * T + q]; } return null; } for (let q = Math.min(x, T - 1); q >= 0; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const yMemo = new Map(); const yard = (k, x) => { const key = k * 8192 + x; if (yMemo.has(key)) return yMemo.get(key);
  const st = liqList(k - 1).filter(i => i % 2 === 0 && !hasArt(i, k, x)); const m = yardOf(st, k, x, 'c', priceAt, 'capBoth', 50); yMemo.set(key, m); return m; };
const spyG = (k, x) => { const a = SPYO[k]; let y = null; for (let q = Math.min(x, T - 1); q >= 0; q--) if (SPYCD[q] > 0) { y = SPYCD[q]; break; } return a > 0 && y > 0 ? y / a - 1 : null; };
const capG = (g) => tradeG(g, 'capBoth');
const ownM = new Map();
function ownOf(tag, z, len, spans) { const key = tag + '|' + z.sym + '|' + len + '|' + z.half; if (ownM.has(key)) return ownM.get(key); const S = z.S;
  const v = ownAverage({ from: 253, to: T - 1, len, step: 10, busy: spans || [], okAt: (u) => halfOf(D[u]) === z.half && LIQ[z.i * T + u - 1] === 1, ret: (u, x) => { const e = S.o[u]; let y = null; for (let q = Math.min(x, T - 1); q >= u; q--) if (S.c[q] > 0) { y = S.c[q]; break; } return e > 0 && y > 0 ? y / e - 1 : null; }, mode: 'capBoth' });
  ownM.set(key, v); return v; }
const spansOf = (rows) => { const m = new Map(); for (const z of rows) (m.get(z.sym) || m.set(z.sym, []).get(z.sym)).push([z.k, z.x]); return m; };
function judgedRows(tag, rows) { const sp = spansOf(rows), out = [];
  for (const z of rows) { const c = yard(z.k, z.x); if (c === null) continue; const own = ownOf(tag, z, z.x - z.k + 1, sp.get(z.sym));
    out.push({ ...z, g0: z.g, g: capG(z.g), c, spy: spyG(z.k, z.x), own, s: z.sym }); }
  return out; }
function judgeRows(rows, hold, block) { const by = { older: rows.filter(z => z.half === 'older'), newer: rows.filter(z => z.half === 'newer') };
  const R = { older: halfStat(by.older, block), newer: halfStat(by.newer, block), all: halfStat(rows, block) };
  const PY = Object.fromEntries(['older', 'newer'].map(h => [h, { rule: r4(perYearOf(by[h], 'g', COST)), spy: r4(perYearOf(by[h], 'spy', 0)), avgStock: r4(perYearOf(by[h], 'c', 0)) }]));
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks held as long on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] } });
  return { ...v, hold, block, cost: COST, split: SPLIT, yardstick: 'capBoth (AUD-1)', results: R, perYear: PY }; }
const fH = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' med ' + pc(h.median) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tB ' + h.tBlock + ' win ' + pc(h.win) + ' worst ' + pc(h.worst);
const line = (id, o) => '- ' + id + ': ' + o.verdict + ' | older ' + fH(o.results.older) + ' | newer ' + fH(o.results.newer) + ' | per year rule/SPY older ' + pc(o.perYear.older.rule) + '/' + pc(o.perYear.older.spy) + ' newer ' + pc(o.perYear.newer.rule) + '/' + pc(o.perYear.newer.spy);
const halves = (rows, f) => ({ older: f(rows.filter(z => z.half === 'older')), newer: f(rows.filter(z => z.half === 'newer')) });

// ================= 4. 5-YEAR ONE-SHOT =================
const RES = {}, REFS = {}, need = IDS.filter(id => !FROZEN[id]);
const BASEJ = {}; for (const b of BASE_KEYS) BASEJ[b] = STATUS.bases[b].ok && STATUS.price.ok ? judgedRows('base:' + b, BASE_TR[b]) : null;
for (const b of BASE_KEYS) { if (!BASEJ[b]) continue; const o = judgeRows(BASEJ[b], BASES[b].hold, BASES[b].block); REFS['REF-' + b] = { name: BASES[b].name + ' (rebuilt base, reference only)', rule: BASES[b].id, ...o }; log(line('REF-' + b, o)); }
for (const id of IDS) { if (!need.includes(id)) continue; const R0 = RULES[id], b = R0.base;
  if (!BASEJ[b]) { RES[id] = { verdict: 'NOT RUN', why: 'base ' + b + ' data incomplete: ' + JSON.stringify(STATUS.bases[b]) + ' price ' + JSON.stringify(STATUS.price) }; log('- ' + id + ': NOT RUN'); continue; }
  const rows = [], sw = [], hows = {}; let stillOpen = 0;
  for (const z of BASEJ[b]) { const e = applyExit(z.S, z, R0.exit, z.S.last, T);
    if (!e) { rows.push({ ...z, g: z.g0 }); sw.push({ half: z.half, g: z.g0, base: z.g0, fired: false }); continue; }
    if (e.open) { stillOpen++; rows.push({ ...z, g: z.g0 }); sw.push({ half: z.half, g: z.g0, base: z.g0, fired: false }); continue; }   // the sale is past the data: original kept
    const g = e.px / z.px0 - 1; hows[e.how] = (hows[e.how] || 0) + 1;
    rows.push({ b: z.b, sym: z.sym, i: z.i, S: z.S, t: z.t, sig: z.sig, half: z.half, k: z.k, x: e.q, px0: z.px0, g, kind: e.how, days: e.q - z.k + 1 });
    sw.push({ half: z.half, g, base: z.g0, fired: true, sym: z.sym, sig: z.sig, sold: D[e.q] }); }
  const J0 = judgedRows(id, rows), o = judgeRows(J0, R0.hold, R0.block), base = REFS['REF-' + b], S2 = halves(sw, sameWindow);
  const ad = adoptExit(S2, { older: o.perYear.older.rule, newer: o.perYear.newer.rule }, { older: base.perYear.older.rule, newer: base.perYear.newer.rule });
  RES[id] = { ...o, name: R0.name, kind: 'exit', base: BASES[b].id, exit: R0.exit, exits: hows, stillOpen, sameWindow: { ...S2, all: sameWindow(sw), note: 'every base trade, new exit vs the original exit; after an early sale the money earns 0% until the original sale (diff > 0 = the exit helped)' },
    baseRef: { verdict: base.verdict, results: base.results, perYear: base.perYear }, adoption: ad,
    trades: J0.filter(z => z.kind !== 'max' && z.kind !== 'gone').slice(-300).map(z => ({ s: z.sym, sig: z.sig, buy: D[z.k], sell: D[z.x], kind: z.kind, net: r4(z.g - COST), avgStock: r4(z.c - COST) })) };
  log(line(id, o) + ' | same window older ' + JSON.stringify(S2.older) + ' newer ' + JSON.stringify(S2.newer) + ' | ADOPT ' + ad.adopt + ' (' + ad.why + ')'); }
const strip = (r) => { const { trades, ...rest } = r; return rest; }, isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);

// ================= 5. OUTPUT + LIBRARY =================
const adoption = {}; for (const id of IDS) { const r = firstRun[id]; if (r && r.adoption) adoption[id] = { adopt: r.adoption.adopt, why: r.adoption.why, base: r.base, exit: r.exit }; }
// what ACTIONS should show (the main session owns scan.mjs): for each live rule, the exit to use = an ADOPTED exit, else the current one
const exitAdvice = {}; for (const b of BASE_KEYS) { const ad = IDS.filter(id => RULES[id].base === b && adoption[id] && adoption[id].adopt);
  exitAdvice[BASES[b].id] = ad.length ? { use: ad, note: 'adopted by the pre-registered test (data/agent-a-tgt-lab.json firstRun)' } : { use: 'current exit (sell at the close of session ' + BASES[b].hold + ')', note: 'no target, trailing stop or 10% stop passed the pre-registered adoption test' }; }
const out = { generatedAt: new Date().toISOString(), study: 'A-TGT1 targets and trailing exits on the live rules (Agent A)', preRegistered: 'agent-a-tgt-core.mjs header + RULES (25 Oct 2026, before any run) + data/strategy-library.json A-TGT-*',
  window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS, fireCounts: FIRE,
  rules: Object.fromEntries(IDS.map(id => [id, { name: RULES[id].name, hold: RULES[id].hold, rule: RULES[id].rule }])), firstRun, adoption, exitAdvice, reference: REFS,
  latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { verdict: r.verdict, why: r.why, results: r.results, perYear: r.perYear }])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result || !r.results) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + '; ' + (r.adoption && r.adoption.adopt ? 'ADOPT' : 'do not adopt') + ' (exit)';
    e.tested = String(r.window[1]); e.study = 'agent-a-tgt-lab.mjs -> data/agent-a-tgt-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], median: [R.older.median, R.newer.median], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock],
      perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], sameWindowDiff: [r.sameWindow.older.diff, r.sameWindow.newer.diff], fired: [r.sameWindow.older.fired, r.sameWindow.newer.fired], adopt: r.adoption.adopt, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('agent-a-tgt-lab: library not updated: ' + e.message); }
console.log('AGENT A TARGETS LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + IDS.map(id => id + ' ' + (firstRun[id] ? firstRun[id].verdict + (firstRun[id].adoption && firstRun[id].adoption.adopt ? ' ADOPT' : '') : (RES[id] || {}).verdict)).join(', '));
