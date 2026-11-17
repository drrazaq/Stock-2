// AGENT A: A-SLM1 STOP-LOSS MOMENTUM LAB (Agent A, catch-up run for Sun 15 Nov 2026, built Tue 17 Nov 2026).
// agent-a-slm-core.mjs = the pre-registered rule and judging (written before any run). Research only; never places an order; no Telegram;
// never edits scan.mjs or another lab. Run ONCE: the first complete result is frozen in data/agent-a-slm-lab.json firstRun; later runs only
// refresh `latest` (monitoring, never a verdict).
// DATA: the whole-market price cache (study-cache/grouped.json.gz, RESTORED READ ONLY; dead stocks in x rows), sessions since from Massive
// grouped daily and splits since repaired (section 1 copied unchanged from agent-a-tp-lab.mjs, itself from agent-a-ldx-lab.mjs).
// DIAG=1: data check only (counts; nothing judged or written in data/).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { artifactJumps } from './squad4-core.mjs';
import { topN, monthEnds as monthEnds6 } from './squad6-core.mjs';
import { REGISTERED, COST, STRESS, TOPN, PICK, ID, r4, mean, halfOf, cap, slmTrade, halfStats, judgeSlm, preRegister, recordResult } from './agent-a-slm-core.mjs';
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const OUT = env.ASLM_OUT || 'data/agent-a-slm-lab.json', LIB = env.ASLM_LIB || 'data/strategy-library.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), STATUS = {};

// ================= 0. PRE-REGISTRATION (judging text into the two library entries before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' entries given their judging text now'); }

// ================= 1. PRICES (agent-a-ldx-lab.mjs section 1, unchanged) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('agent-a-slm-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
const spyI = SY.get('SPY'), cl = (i) => CA.subarray(i * T, i * T + T), ser = (A, i) => A.subarray(i * T, i * T + T);
if (spyI === undefined) { console.log('agent-a-slm-lab: SPY missing from the cache; nothing done'); process.exit(0); }
const lastI = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; }
const LIQ = new Uint8Array(N);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN; if (isFinite(w)) { s -= w; n--; } }
    if (t >= 19 && n === 20 && CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqMemo = new Map(), liqList = (t) => { if (t < 0) return []; if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const SPYC = Float64Array.from(cl(spyI)), SPYO = Float64Array.from(ser(OA, spyI));
STATUS.price = { ok: T >= 1000 && SPYC.filter(x => x > 0).length >= T * 0.95, sessions: T, from: D[0], to: D[T - 1], stocks: NS, rowsWithHighLow: r4(withHL / Math.max(1, rowsAll)) };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks)');
const JUMPS = new Map(), artOf = (i) => { if (!JUMPS.has(i)) JUMPS.set(i, new Set(artifactJumps(cl(i)))); return JUMPS.get(i); };
const hasArt = (i, a, b) => { for (const k of artOf(i)) if (k > a && k <= b) return true; return false; };
// ================= 2. FORMATIONS (month ends) and the two books =================
const TV63 = new Float32Array(N).fill(NaN); for (let i = 0; i < NS; i++) { const b = i * T; let s = 0, n = 0; for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; } if (t >= 63) { const w = MAIN[b + t - 63] ? CA[b + t - 63] * VA[b + t - 63] : NaN; if (isFinite(w)) { s -= w; n--; } } if (t >= 62 && n >= 57) TV63[b + t] = s / n; } }
const ME = monthEnds6(D, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).filter(t => t >= 252);
const FORM = []; for (let m = 0; m + 1 < ME.length; m++) { const t = ME[m], k0 = t + 1, k1 = ME[m + 1] + 1; if (k1 > T - 1) break;
  const uni = topN(liqList(t).filter(i => CA[i * T + t - 252] > 0 && CA[i * T + t - 21] > 0).map(i => ({ key: i, v: TV63[i * T + t] })), TOPN);
  const ranked = uni.map(i => ({ i, m: CA[i * T + t - 21] / CA[i * T + t - 252] - 1 })).filter(x => isFinite(x.m)).sort((a, b) => b.m - a.m);
  FORM.push({ t, k0, k1, d: D[t], uni: uni.length, picks: ranked.slice(0, Math.round(PICK * uni.length)).map(x => x.i) }); }
// average liquid stock bought at the same open k0, sold at the open k1 (+300% cap); the same stock on its other days (same half, every 3rd session)
const ctrlMemo = new Map(), ctrl = (t, k0, k1) => { const key = k0 + '_' + k1; if (ctrlMemo.has(key)) return ctrlMemo.get(key); const v = [];
  for (const i of liqList(t)) { const a = OA[i * T + k0], b = OA[i * T + k1] > 0 ? OA[i * T + k1] : (lastI[i] >= k0 && lastI[i] < k1 ? CA[i * T + lastI[i]] : NaN); if (a > 0 && b > 0 && !hasArt(i, k0, k1)) v.push(cap(b / a - 1)); } const r = v.length >= 30 ? mean(v) : null; ctrlMemo.set(key, r); return r; };   // a stock that stopped trading counts at its last close, as the picks do
const splitT = D.findIndex(d => d >= '2024-01-01'), ownMemo = new Map(), own = (i, h, half) => { const key = i + '_' + h + '_' + half; if (ownMemo.has(key)) return ownMemo.get(key);
  const lo = half === 'older' ? 0 : splitT, hi = half === 'older' ? splitT : T; const v = []; for (let k = lo; k + h < hi; k += 3) { const a = OA[i * T + k], b = OA[i * T + k + h]; if (a > 0 && b > 0 && !hasArt(i, k, k + h)) v.push(cap(b / a - 1)); }
  const r = v.length >= 20 ? mean(v) : null; ownMemo.set(key, r); return r; };
const trades = []; let dropped = 0;
for (const f of FORM) { const h = f.k1 - f.k0, c0 = ctrl(f.t, f.k0, f.k1), spy = SPYO[f.k1] / SPYO[f.k0] - 1, half = halfOf(f.d);
  for (const i of f.picks) { if (hasArt(i, f.k0, f.k1)) { dropped++; continue; } const o = [], c = []; for (let j = 0; j <= h; j++) { o.push(OA[i * T + f.k0 + j]); c.push(CA[i * T + f.k0 + j]); }
    const last = lastI[i] >= f.k0 + h ? Infinity : lastI[i] - f.k0, z = slmTrade(o, c, h, last); if (!z || c0 === null) { dropped++; continue; }
    trades.push({ d: f.d, s: SYMS[i], g: z.stop, g0: z.noStop, c: c0, own: own(i, h, half), spy, stopped: z.stopped, stopDay: z.stopped ? D[f.k0 + z.stopJ] : null }); } }
STATUS.books = { formations: FORM.length, from: FORM.length ? FORM[0].d : null, to: FORM.length ? FORM[FORM.length - 1].d : null, universeMin: Math.min(...FORM.map(f => f.uni)), picksPerMonth: FORM.length ? FORM[0].picks.length : 0, trades: trades.length, dropped, ok: FORM.length >= 30 && trades.length >= 2000 };
log('books: ' + JSON.stringify(STATUS.books));
if (DIAG) { console.log('DIAG: data check only; nothing judged or written.'); process.exit(0); }
if (!STATUS.price.ok || !STATUS.books.ok) { console.log('agent-a-slm-lab: data incomplete; nothing judged (' + JSON.stringify(STATUS) + ')'); process.exit(0); }

// ================= 3. JUDGING (run once) =================
const LEAGUE = J('data/agent-league.json', {}), luckBar = typeof LEAGUE.bar === 'number' ? LEAGUE.bar : 4.1;
const H = {}; for (const half of ['older', 'newer']) { const a = trades.filter(z => halfOf(z.d) === half);
  H[half] = { stop: { base: halfStats(a, 'g', COST), stress: halfStats(a, 'g', STRESS) }, noStop: { base: halfStats(a, 'g0', COST), stress: halfStats(a, 'g0', STRESS) } }; }
const judged = judgeSlm(H, luckBar);
const line = (h) => { const s = H[h].stop.base, x = H[h].stop.stress, n0 = H[h].noStop.base, n1 = H[h].noStop.stress;
  return h + ': ' + s.n + ' trades, ' + s.stocks + ' stocks, ' + s.days + ' entry days, stopped ' + s.stopped + ' (' + s.stopDays + ' days) | stop book avg ' + pc(s.avg) + ' (1.2%: ' + pc(x.avg) + '), median ' + pc(s.median) + ', worst ' + pc(s.worst) + ', worst month ' + pc(s.worstMonth) + ', max DD ' + pc(s.maxDD) + ', edge ' + pc(s.edge) + ' (block t ' + s.blockT + '), vs own ' + pc(s.vsOwn) + ', no top 2 ' + pc(s.noTop2) + ', per year ' + pc(s.perYear) + ' vs SPY ' + pc(s.spyPerYear) + ' | no-stop avg ' + pc(n0.avg) + ' (1.2%: ' + pc(n1.avg) + '), max DD ' + pc(n0.maxDD) + ', per year ' + pc(n0.perYear); };
const summary = [line('older'), line('newer')];
const results = { [ID]: { judged, luckBar, halves: H, summary, window: { from: D[0], to: D[T - 1] } } };
const firstRun = freezeEach(PREV.firstRun, results);
const out = { generatedAt: new Date().toISOString(), agent: 'A', preRegistered: 'agent-a-slm-core.mjs header (' + REGISTERED + ', before any run)', status: STATUS, firstRun, latest: latestBlock({ at: new Date().toISOString(), verdict: judged.verdict, summary }) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
{ const LB = J(LIB, null), ch = recordResult(LB, firstRun); if (ch) { LB.updated = new Date().toISOString().slice(0, 10); fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } log('library: ' + ch + ' result recorded'); }
console.log('A-SLM1 STOP-LOSS MOMENTUM: ' + firstRun[ID].judged.verdict + ' | level ' + firstRun[ID].judged.level + (firstRun[ID].frozenAt !== results[ID].frozenAt ? ' (frozen first run)' : ''));
for (const s of firstRun[ID].summary) console.log('- ' + s);
if (firstRun[ID].judged.why.length) console.log('why: ' + firstRun[ID].judged.why.join('; '));
