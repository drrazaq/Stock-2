// ACCOUNT REPLAY LAB (27 Oct 2026; Stock-2). The live TRY SMALL lane replayed as ONE real account (account-replay-core.mjs = the
// pre-registered policy, written before any result). Research only: never places an order, no Telegram, never edits scan.mjs or any lab.
// DATA (read only): the 5-year whole-market price cache study-cache/grouped.json.gz (dead stocks in its x rows) + the sessions since
// (Massive grouped daily); the rules' signal lists exactly as squad20-lab.mjs section 6 loads / rebuilds them (that rebuild matched every
// frozen trade count); XLK and SPUS from Massive daily bars when not in the cache. Writes data/account-replay.json (summary + daily equity)
// and data/account-replay-trades.jsonl (every account trade of every replay).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { artifactJumps } from './squad4-core.mjs';
import { nextSession } from './anomaly-core.mjs';
import { mtumPick, qmomPick, fip, weekly, weeksOf, topN, sd as sd6, monthEnds as monthEnds6 } from './squad6-core.mjs';
import { monthEnds } from './squad11-core.mjs';
import { holdFrom, holdStop } from './squad20-core.mjs';
import { RULES, MAIN_IDS, COST, STRESS, CASH0, LATE_SHIFT, SHUFFLES, SPLIT, OLDER_END, ALL_ACTIVE, REGISTERED, r4, r2, mean, simulate, buyHold, shuffleWithin, rng, shiftStats, pct, netOf } from './account-replay-core.mjs';
const env = process.env, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const OUT = env.AR_OUT || 'data/account-replay.json', TRADES_OUT = env.AR_TRADES || 'data/account-replay-trades.jsonl';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), STATUS = {};
fs.mkdirSync('data', { recursive: true });
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad20-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
const spyI = SY.get('SPY'), cl = (i) => CA.subarray(i * T, i * T + T), CC = (i, t) => CA[i * T + t];
if (spyI === undefined) { console.log('squad20-lab: SPY missing from the cache; nothing done'); process.exit(0); }
const lastI = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; }
const GONE = 5, vanishedI = (i) => lastI[i] >= 0 && lastI[i] < T - 1 - GONE;
const LIQ = new Uint8Array(N), DV20 = new Float32Array(N);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN; if (isFinite(w)) { s -= w; n--; } }
    if (t >= 19 && n === 20) { DV20[b + t] = s / 20; if (CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } } }
const liqMemo = new Map(), liqList = (t) => { if (t < 0) return []; if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const SPYC = cl(spyI), MENDS = monthEnds(D).filter(t => t >= 21);   // month ends with a previous month end (STMOM formation dates)
STATUS.price = { ok: T >= 1000 && withHL >= rowsAll * 0.9 && SPYC.filter(x => x > 0).length >= T * 0.95, sessions: T, from: D[0], to: D[T - 1], stocks: NS, rowsWithHighLow: r4(withHL / Math.max(1, rowsAll)) };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks), rows with high/low ' + pc(withHL / Math.max(1, rowsAll)) + ', month ends: ' + MENDS.length + ' (' + (MENDS.length ? D[MENDS[0]] : '-') + ' on)');

const SPYCD = Float64Array.from(SPYC), SPYO = Float64Array.from(OA.subarray(spyI * T, spyI * T + T));
const tOf = new Map(D.map((d, t) => [d, t])), sessionOf = (d) => { if (tOf.has(d)) return tOf.get(d); let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo - 1; };
const ser = (A, i) => A.subarray(i * T, i * T + T);
const JUMPS = new Map(); const artOf = (i) => { if (!JUMPS.has(i)) JUMPS.set(i, new Set(artifactJumps(cl(i)))); return JUMPS.get(i); };
const hasArt = (i, a, b) => { for (const k of artOf(i)) if (k > a && k <= b) return true; return false; };
// funds missing from the cache (XLK of MACRO-USD-E60): Massive daily bars (adjusted), as squad3-lab loads them
const EXTRA = new Map();
async function extraSeries(sym) { if (EXTRA.has(sym)) return EXTRA.get(sym); const j = await api('/v2/aggs/ticker/' + sym + '/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000'); let s = null;
  if (j && Array.isArray(j.results) && j.results.length > 200) { const o = new Float64Array(T).fill(NaN), c = new Float64Array(T).fill(NaN), v = new Float64Array(T).fill(NaN); let last = -1;
    for (const b of j.results) { const t = tOf.get(iso(b.t)); if (t !== undefined) { o[t] = b.o; c[t] = b.c; v[t] = b.v; if (t > last) last = t; } } s = { o, c, v, last, art: new Set(artifactJumps(c)) }; }
  EXTRA.set(sym, s); return s; }
const SER = new Map(); const seriesOf = (i) => { if (!SER.has(i)) SER.set(i, { o: ser(OA, i), c: ser(CA, i), l: ser(LA, i), v: ser(VA, i), last: lastI[i], art: artOf(i) }); return SER.get(i); };

// ================= 6. BASE RULES: the trade lists =================
const VL = J('data/value-lab.json', {}), DH = J('data/decoded-history.json', {}), AL = J('data/anomaly-lab.json', {}), ML = J('data/macro-lab.json', {}), S11 = J('data/squad11-lab.json', {}), S6 = J('data/squad6-lab.json', {});
const SGL = JZ('data/confluence-signals.json.gz', { signals: {}, check: {} });
const frozenN = (L, id) => { const r = (L.firstRun || {})[id]; return r && r.results ? (r.results.older.n || 0) + (r.results.newer.n || 0) : null; };
const SIGNALS = {}, FROZENN = {};
SIGNALS.PB12 = ((S11.trades || {})['SQ11-PB12'] || []).map(z => [z.s, z.sig]); FROZENN.PB12 = frozenN(S11, 'SQ11-PB12');
SIGNALS.FCF1 = ((VL.trades || {})['B-FCF1'] || []).map(z => [z.s, z.sig || z.d]); FROZENN.FCF1 = frozenN(VL, 'B-FCF1');
SIGNALS.FROG = ((DH.trades || {})['DEC-FROG'] || []).map(z => [z.s, z.sig || z.d]); FROZENN.FROG = frozenN(DH, 'DEC-FROG');
SIGNALS.RESMOM = (SGL.signals['ANOM-RESMOM'] || []).map(z => [z[0], z[1]]); FROZENN.RESMOM = frozenN(AL, 'ANOM-RESMOM');
SIGNALS.SUESURGE = (SGL.signals['ANOM-SUESURGE'] || []).map(z => [z[0], z[1]]); FROZENN.SUESURGE = frozenN(AL, 'ANOM-SUESURGE');
SIGNALS.GOLD = ((ML.trades || {})['MACRO-GOLD-S20'] || []).map(z => [z.s, z.sig || z.d]); FROZENN.GOLD = frozenN(ML, 'MACRO-GOLD-S20');
SIGNALS.USD = ((ML.trades || {})['MACRO-USD-E60'] || []).map(z => [z.s, z.sig || z.d]); FROZENN.USD = frozenN(ML, 'MACRO-USD-E60');
FROZENN.MTUM = frozenN(S6, 'SQ6-MTUM'); FROZENN.QMOM = frozenN(S6, 'SQ6-QMOM');
// MTUM / QMOM rebuilt (squad6-lab.mjs construction; squad6-core picks; exactly squad18-lab.mjs's rebuild, which matched the frozen counts)
const TV63 = new Float32Array(N).fill(NaN); for (let i = 0; i < NS; i++) { const b = i * T; let s = 0, n = 0; for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; } if (t >= 63) { const w = MAIN[b + t - 63] ? CA[b + t - 63] * VA[b + t - 63] : NaN; if (isFinite(w)) { s -= w; n--; } } if (t >= 62 && n >= 57) TV63[b + t] = s / n; } }
const SECC = J('data/sec-ciks.json', {}), sicOf = (s) => { const x = SIC[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECC[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
const WKS = weeksOf(D), wkMemo = new Map(), wkOf = (i) => { if (!wkMemo.has(i)) wkMemo.set(i, weekly({ o: ser(OA, i), h: ser(HA, i), l: ser(LA, i), c: ser(CA, i) }, WKS).c); return wkMemo.get(i); };
const meLive = (months) => { const a = monthEnds6(D, months), nx = nextSession(D[T - 1]); if (nx.slice(0, 7) !== D[T - 1].slice(0, 7) && months.includes(+D[T - 1].slice(5, 7)) && !a.includes(T - 1)) a.push(T - 1); return a; };
const FUNDSIG = { MTUM: [], QMOM: [] };
for (const t of meLive([5, 11])) { if (t < 252) continue; const uni = topN(liqList(t).filter(i => CA[i * T + t - 252] > 0).map(i => ({ key: i, v: TV63[i * T + t] })), 600);
  const nW = WKS.findIndex(w => w.e >= t), lastW = WKS[nW] && WKS[nW].e === t ? nW : nW - 1;
  const rows = uni.map(i => { const c = cl(i), a = c[t - 21], m12 = c[t - 252] > 0 && a > 0 ? a / c[t - 252] - 1 : null, m6 = c[t - 126] > 0 && a > 0 ? a / c[t - 126] - 1 : null, wc = wkOf(i), rr = [];
    for (let w = Math.max(1, lastW - 155); w <= lastW; w++) if (wc[w] > 0 && wc[w - 1] > 0) rr.push(wc[w] / wc[w - 1] - 1); const s = rr.length >= 52 ? sd6(rr) * Math.sqrt(52) : null; return { key: i, m6, m12, vol: s }; });
  for (const i of mtumPick(rows, Math.ceil(uni.length * 0.20))) FUNDSIG.MTUM.push([SYMS[i], D[t]]); }
for (const t of meLive([2, 5, 8, 11])) { if (t < 252) continue; const uni = topN(liqList(t).filter(i => CA[i * T + t - 252] > 0 && sicOf(SYMS[i]) !== '6798').map(i => ({ key: i, v: TV63[i * T + t] })), 1000);
  const rows = uni.map(i => { const c = cl(i), m = c[t - 21] > 0 && c[t - 252] > 0 ? c[t - 21] / c[t - 252] - 1 : null; return { key: i, m, fip: m === null ? null : fip(c, t - 251, t - 21, m) }; });
  for (const i of qmomPick(rows)) FUNDSIG.QMOM.push([SYMS[i], D[t]]); }
SIGNALS.MTUM = FUNDSIG.MTUM; SIGNALS.QMOM = FUNDSIG.QMOM;

// ================= 7. ACCOUNT CANDIDATES =================
const BY = Object.fromEntries(RULES.map(R => [R.base, R]));
// saved per-trade nets (0.8% cost) for the rebuild check, keyed sym|signal date
const SAVED = { PB12: (S11.trades || {})['SQ11-PB12'], FCF1: (VL.trades || {})['B-FCF1'], FROG: (DH.trades || {})['DEC-FROG'], GOLD: (ML.trades || {})['MACRO-GOLD-S20'], USD: (ML.trades || {})['MACRO-USD-E60'] };
const winEnd = (L, id) => { const r = ((L.correctedRun || {})[id] && (L.correctedRun || {})[id].results ? L.correctedRun[id] : (L.firstRun || {})[id]) || {}; return (r.window && r.window[1]) || r.to || (L.window && L.window[1]) || null; };
const LABOF = { FCF1: VL, FROG: DH, RESMOM: AL, SUESURGE: AL, GOLD: ML, USD: ML, MTUM: S6, QMOM: S6, PB12: S11 };
const SERIES = new Map();   // sym -> series (cache or Massive)
async function seriesBySym(sym) { if (SERIES.has(sym)) return SERIES.get(sym); const i = SY.get(sym); let S = null; if (i !== undefined) S = { ...seriesOf(i), i }; else { const x = await extraSeries(sym); if (x) S = { ...x, i: -1 }; } SERIES.set(sym, S); return S; }
const artIn = (S, a, b) => { const set = S.i >= 0 ? artOf(S.i) : S.art; for (const k of set) if (k > a && k <= b) return true; return false; };
// one trade (the rule's own exit, or the live lane stop) entered at session k
function tradeAt(S, k, hold, stop) { const r = stop ? holdStop(S, k, S.last, T, hold, stop) : holdFrom(S, k, S.last, T, hold); if (!r || r.pending) return null;
  if (r.open) return { k, x: null, px0: r.px0, px1: null, kind: 'open', exitAt: 'c' };
  return { k, x: r.x, px0: r.px0, px1: r.px1, kind: r.kind, exitAt: r.atOpen ? 'o' : 'c', g: r.g }; }
STATUS.rules = {}; const CANDS = { tested: [], late: [], livestop: [] }, SHIFT = { 1: [], 3: [], 5: [] };
for (const R of RULES) { const b = R.base, sig = SIGNALS[b] || [], note = { signals: sig.length, noPrice: 0, notBought: 0, artifacts: 0, open: 0 }, dayIdx = new Map();
  const saved = new Map(((SAVED[b]) || []).map(z => [z.s + '|' + (z.sig || z.d), z.net])); let cmpN = 0, cmpOk = 0; const nets = [];
  const we = winEnd(LABOF[b], R.id), weT = we ? sessionOf(we) : T - 1; note.windowEnd = we; note.completeThrough = D[Math.max(0, weT - R.hold)];
  for (const [sym, d] of sig) { const t = sessionOf(d); if (t < 0) { note.noPrice++; continue; } const S = await seriesBySym(sym); if (!S) { note.noPrice++; continue; }
    const key = R.id + '|' + D[t], ord = dayIdx.get(key) || 0; dayIdx.set(key, ord + 1);
    const base = tradeAt(S, t + 1, R.hold, 0); if (!base) { note.notBought++; continue; }
    if (base.x !== null && artIn(S, base.k, base.x)) { note.artifacts++; continue; }   // squad 20: a trade whose path holds a split artifact is left out (as tested)
    if (base.x === null) note.open++; else { nets.push(base.g - COST); const sv = saved.get(sym + '|' + d); if (typeof sv === 'number') { cmpN++; if (Math.abs(sv - (base.g - COST)) < 0.002) cmpOk++; } }
    const c = { id: R.id, sym, t, sig: D[t], ord };
    CANDS.tested.push({ ...c, ...base });
    const ls = tradeAt(S, t + 1, R.hold, R.liveStop); if (ls) CANDS.livestop.push({ ...c, ...ls });
    if (R.id === 'B-FCF1') { for (const s of [1, 3, 5]) { const z = tradeAt(S, t + s, R.hold, 0); if (z && z.x !== null && !artIn(S, z.k, z.x)) SHIFT[s].push({ sym, sig: D[t], half: D[t] < SPLIT ? 'older' : 'newer', g: z.g }); }
      const lt = tradeAt(S, t + LATE_SHIFT, R.hold, 0); if (lt) CANDS.late.push({ ...c, ...lt }); }
    else CANDS.late.push({ ...c, ...base }); }
  const fr = ((LABOF[b].correctedRun || {})[R.id] && LABOF[b].correctedRun[R.id].results) ? LABOF[b].correctedRun[R.id] : (LABOF[b].firstRun || {})[R.id];
  note.rebuiltClosed = nets.length; note.rebuiltAvgNet = r4(mean(nets)); note.frozenN = fr && fr.results ? (fr.results.older.n || 0) + (fr.results.newer.n || 0) : null;
  note.frozenAvg = fr && fr.results && fr.results.all ? fr.results.all.avg : null; note.savedNetCompared = cmpN; note.savedNetMatch = cmpN ? r4(cmpOk / cmpN) : null;
  STATUS.rules[R.id] = note; log('rule ' + R.id + ': ' + JSON.stringify(note)); }

// ================= 8. THE REPLAYS =================
const mainRules = RULES.filter(R => !R.infoOnly);
const CUT_T = Math.min(...mainRules.map(R => sessionOf(STATUS.rules[R.id].completeThrough))), CUT = D[CUT_T];
const tStart = 0, tNewer = D.findIndex(d => d >= SPLIT), tOlderEnd = sessionOf(OLDER_END), tActive = D.findIndex(d => d >= ALL_ACTIVE);
log('CUT (every main rule\'s list complete through) = ' + CUT + '; older ' + D[tStart] + '..' + D[tOlderEnd] + ', newer ' + D[tNewer] + '..' + CUT);
const closeOf = (() => { const memo = new Map(); return (sym, t) => { const S = SERIES.get(sym); if (!S) return null; for (let q = t; q >= 0; q--) if (S.c[q] > 0) return S.c[q]; return null; }; })();
const SPYS = { o: Float64Array.from(OA.subarray(spyI * T, spyI * T + T)), c: SPYCD };
// (27 Oct, after the first run: SPUS was null for windows from 2021-10-12 because the cache has no SPUS bar that day; benchmark data only, the
// account is unchanged) SPUS from Massive daily bars first, the cache as fallback
const SPUS = (await extraSeries('SPUS')) || (SY.get('SPUS') !== undefined ? seriesOf(SY.get('SPUS')) : null);
STATUS.spus = { ok: !!(SPUS && SPUS.c.filter(x => x > 0).length > T * 0.9), firstOpen: SPUS ? D[SPUS.o.findIndex(x => x > 0)] : null, from: 'Massive daily bars, else the cache' };
const strip = (s) => { const { equity, closed, ...rest } = s; return rest; };
const WINDOWS = { older: [tStart, tOlderEnd], newer: [tNewer, CUT_T], full: [tStart, CUT_T], olderFromActive: [tActive, tOlderEnd], fullToNewestINCOMPLETE: [tStart, T - 1] };
const RES = {}, TRADE_ROWS = [];
function run(label, cands, priority, cost, windows, keepEquity) { const out = {};
  for (const [w, [a, z]] of Object.entries(windows)) { const s = simulate({ cands, D, closeOf, start: a, end: z, priority, cost }), spy = buyHold({ o: SPYS.o, c: SPYS.c, D, start: a, end: z, cost }), spus = SPUS ? buyHold({ o: SPUS.o, c: SPUS.c, D, start: a, end: z, cost }) : null;
    out[w] = { account: strip(s), spy: spy && strip(spy), spus: spus && strip(spus), beatsSpy: !!(spy && s.v1 > spy.v1), beatsSpus: spus ? s.v1 > spus.v1 : null };
    if (keepEquity) { out[w].equity = s.equity.map((e, j) => [e.d, e.v, e.open, spy ? spy.equity[j].v : null, spus ? spus.equity[j].v : null]); }
    for (const z of s.closed) TRADE_ROWS.push({ replay: label, window: w, ...z }); for (const P of s.openAtEnd) TRADE_ROWS.push({ replay: label, window: w, ...P, open: true });
    log(label + ' ' + w + ': ' + s.start + '..' + s.end + ' 2000 -> ' + s.v1 + ' (' + pc(s.perYear) + '/yr, DD ' + pc(s.maxDD) + ', ' + s.trades + ' trades, skipped full ' + s.skipped.fullSlots + ') | SPY -> ' + (spy && spy.v1) + ' (' + pc(spy && spy.perYear) + '/yr)' + (spus ? ' | SPUS -> ' + spus.v1 : '')); }
  return out; }
const MAINW = { older: WINDOWS.older, newer: WINDOWS.newer, full: WINDOWS.full };
RES['REPLAY-2SLOT'] = run('REPLAY-2SLOT', CANDS.tested, MAIN_IDS, COST, WINDOWS, true);
RES['REPLAY-2SLOT stress 1.2%'] = run('REPLAY-2SLOT-STRESS', CANDS.tested, MAIN_IDS, STRESS, MAINW, false);
RES['REPLAY-2SLOT-LATE'] = run('REPLAY-2SLOT-LATE', CANDS.late, MAIN_IDS, COST, MAINW, false);
RES['REPLAY-2SLOT-LATE stress 1.2%'] = run('REPLAY-2SLOT-LATE-STRESS', CANDS.late, MAIN_IDS, STRESS, MAINW, false);
RES['INFO live lane stops'] = run('INFO-LIVESTOP', CANDS.livestop, MAIN_IDS, COST, MAINW, false);
RES['INFO +ANOM-SUESURGE'] = run('INFO-SUESURGE', CANDS.tested, RULES.map(R => R.id), COST, MAINW, false);
// order sensitivity: picks shuffled within rule and day (seeded), main replay, 0.8%
const SENS = {}; for (const [w, [a, z]] of Object.entries(MAINW)) { const ends = [], beat = []; const spy = buyHold({ o: SPYS.o, c: SPYS.c, D, start: a, end: z, cost: COST });
  for (let s = 1; s <= SHUFFLES; s++) { const r = simulate({ cands: shuffleWithin(CANDS.tested, rng(s)), D, closeOf, start: a, end: z, priority: MAIN_IDS, cost: COST }); ends.push(r.v1); beat.push(r.v1 > spy.v1 ? 1 : 0); }
  SENS[w] = { shuffles: SHUFFLES, endP10: r2(pct(ends, 0.1)), endMedian: r2(pct(ends, 0.5)), endP90: r2(pct(ends, 0.9)), endMin: r2(Math.min(...ends)), endMax: r2(Math.max(...ends)), shareBeatingSpy: r4(mean(beat)), spyEnd: spy.v1 };
  log('order sensitivity ' + w + ': ' + JSON.stringify(SENS[w])); }
// B-FCF1 late entry, all trades (information)
const LATEINFO = {}; for (const s of [1, 3, 5]) { LATEINFO['+' + s] = { all: shiftStats(SHIFT[s], STRESS), older: shiftStats(SHIFT[s].filter(z => z.half === 'older'), STRESS), newer: shiftStats(SHIFT[s].filter(z => z.half === 'newer'), STRESS), allAt08: shiftStats(SHIFT[s], COST) }; }
log('B-FCF1 entry shift (1.2% cost): ' + JSON.stringify(LATEINFO));

// ================= 9. WRITE =================
const out = { generatedAt: new Date().toISOString(), registered: REGISTERED, question: 'Does the real 2-slot TRY SMALL account make money and beat SPY with the same 2,000 USD? Is B-FCF1 bought up to 5 sessions late still OK?',
  policy: 'account-replay-core.mjs header (pre-registered 27 Oct 2026 before any result)', priority: MAIN_IDS, cut: CUT, windows: Object.fromEntries(Object.entries(WINDOWS).map(([k, [a, z]]) => [k, [D[a], D[z]]])),
  halal: 'NOT applied: past ZAD marks cannot be known; run on the full universe (data/halal.json holds today\'s marks only). The live lane buys only ZAD-ok stocks, so its real picks would differ.',
  dividends: 'not included (split-adjusted prices) for the account, SPY and SPUS alike', data: { price: STATUS.price, spus: STATUS.spus, rules: STATUS.rules },
  results: RES, orderSensitivity: SENS, fcf1EntryShift: LATEINFO };
fs.writeFileSync(OUT, JSON.stringify(out));
fs.writeFileSync(TRADES_OUT, TRADE_ROWS.map(x => JSON.stringify(x)).join('\n') + '\n');
log('written ' + OUT + ' (' + (fs.statSync(OUT).size / 1e6).toFixed(2) + ' MB) and ' + TRADES_OUT + ' (' + TRADE_ROWS.length + ' rows)');
