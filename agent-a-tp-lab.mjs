// AGENT A TIMING OVERLAYS LAB (A-TP1 momentum turning points on SPY; A-RMOM1 risk-managed SQ6-MTUM book). Agent A, 10 Nov 2026.
// agent-a-tp-core.mjs = the pre-registered rules and judging (written before any run). Research only; never places an order; no Telegram;
// never edits scan.mjs or another lab. Run ONCE: the first complete result per rule is frozen in data/agent-a-tp-lab.json firstRun;
// later runs only refresh `latest` (monitoring, never a verdict).
// DATA: the whole-market price cache (study-cache/grouped.json.gz, RESTORED READ ONLY; dead stocks in x rows), the sessions since from
// Massive grouped daily and splits since repaired (exactly agent-a-ldx-lab.mjs section 1); FRED DTB3 (public CSV) for the T-bill;
// Massive SPY daily bars from 2005 for the information-only long check. SQ6-MTUM rebuilt exactly as agent-a-tgt-lab.mjs section 2.
// DIAG=1: data check only (counts; nothing judged or written in data/).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { artifactJumps } from './squad4-core.mjs';
import { yardOf, mtumPick, weekly, weeksOf, topN, sd as sd6, monthEnds as monthEnds6 } from './squad6-core.mjs';
import { nextSession } from './anomaly-core.mjs';
import { REGISTERED, COST, STRESS, REG_SWITCH, HOLD, VOL_LB, SLOW, FAST, IDS, r4, mean, halfOf, tpBlend, tpRun, tpHalf, judgeTp, rmomWeight, bookPath, pathRets, annVol, bookDaily, dailyStats, judgeRmom, preRegister, recordResults } from './agent-a-tp-core.mjs';
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', FRED = local(env.FRED_BASE) || 'https://fred.stlouisfed.org';
const OUT = env.ATP_OUT || 'data/agent-a-tp-lab.json', LIB = env.ATP_LIB || 'data/strategy-library.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), STATUS = {};

// ================= 0. PRE-REGISTRATION (judging text into the two library entries before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' entries given their judging text now'); }

// ================= 1. PRICES (agent-a-ldx-lab.mjs section 1, unchanged) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('agent-a-tp-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
if (spyI === undefined) { console.log('agent-a-tp-lab: SPY missing from the cache; nothing done'); process.exit(0); }
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

// ================= 2. T-BILL (FRED DTB3, public CSV; unreachable -> 0%) =================
let tbill = new Map(), tbOk = false;
if (!OFFLINE) { try { const r = await fetch(FRED + '/graph/fredgraph.csv?id=DTB3', { signal: AbortSignal.timeout(60000) }); if (r.ok) { const txt = await r.text();
  for (const line of txt.split('\n').slice(1)) { const [d, v] = line.trim().split(','); if (/^\d{4}-\d\d-\d\d$/.test(d || '') && isFinite(+v) && v !== '' && v !== '.') tbill.set(d, +v); } tbOk = tbill.size > 1000; } } catch (e) {} }
const tbDates = [...tbill.keys()].sort(), tbAt = (d) => { let lo = 0, hi = tbDates.length; while (lo < hi) { const m = (lo + hi) >> 1; if (tbDates[m] <= d) lo = m + 1; else hi = m; } return lo ? tbill.get(tbDates[lo - 1]) : null; };
const rateOf = (d) => { const y = tbOk ? tbAt(d) : null; return y === null || y === undefined ? 0 : y / 100 / 252; };
STATUS.tbill = { ok: tbOk, source: 'FRED DTB3', values: tbill.size, note: tbOk ? 'accrued per session at DTB3 / 100 / 252' : 'FRED unreachable: cash at 0% (as registered)' };
log('T-bill: ' + JSON.stringify(STATUS.tbill));
const accrue = (dates) => dates.reduce((e, d) => e * (1 + rateOf(d)), 1) - 1;

// ================= 3. A-TP1 months =================
function tpMonths(Dd, O, C) { const n = Dd.length, ends = []; for (let t = 0; t + 1 < n; t++) if (Dd[t + 1].slice(0, 7) !== Dd[t].slice(0, 7)) ends.push(t);
  const out = []; for (let j = 0; j + 1 < ends.length; j++) { const t = ends[j], k0 = t + 1, k1 = ends[j + 1] + 1; if (t - SLOW < 0 || k1 > n - 1) continue;
    if (!(C[t] > 0 && C[t - SLOW] > 0 && C[t - FAST] > 0 && O[k0] > 0 && O[k1] > 0)) continue;
    const r12 = C[t] / C[t - SLOW] - 1, r1 = C[t] / C[t - FAST] - 1, tb12 = accrue(Dd.slice(t - SLOW + 1, t + 1)), tb1 = accrue(Dd.slice(t - FAST + 1, t + 1));
    const s = tpBlend(r12, tb12, r1, tb1); out.push({ d: Dd[t], half: halfOf(Dd[t]), ...s, r12: r4(r12), r1: r4(r1), spy: O[k1] / O[k0] - 1, cash: accrue(Dd.slice(k0, k1)) }); }
  return out; }
function tpJudgeAll(months) { const byCost = {}; for (const [name, c] of [['registered', REG_SWITCH * 2], ['base', COST], ['stress', STRESS]]) { const rows = tpRun(months, c);
  byCost[name] = { older: tpHalf(rows.filter(z => z.half === 'older')), newer: tpHalf(rows.filter(z => z.half === 'newer')), whole: tpHalf(rows) }; } return byCost; }
const TPM = tpMonths(D, SPYO, SPYC);
STATUS.tp = { ok: TPM.length >= 30, months: TPM.length, older: TPM.filter(z => z.half === 'older').length, newer: TPM.filter(z => z.half === 'newer').length, from: TPM[0] && TPM[0].d, to: TPM.length ? TPM[TPM.length - 1].d : null };
log('A-TP1 months: ' + JSON.stringify(STATUS.tp));
// information only: longer SPY history (Massive daily bars), never a verdict
let longInfo = null;
if (!OFFLINE && !DIAG) { const j = await api('/v2/aggs/ticker/SPY/range/1/day/2005-01-01/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000');
  const R = j && Array.isArray(j.results) ? j.results.filter(x => x && x.o > 0 && x.c > 0) : [];
  if (R.length > 2000) { const LD = R.map(x => iso(x.t)), LM = tpMonths(LD, R.map(x => x.o), R.map(x => x.c)), bc = tpJudgeAll(LM);
    longInfo = { label: 'INFORMATION ONLY (never a verdict)', from: LD[0], to: LD[LD.length - 1], months: LM.length, base: bc.base.whole, stress: bc.stress.whole,
      byPeriod: Object.fromEntries(['2006', '2011', '2016', '2021'].map((y, q, A) => { const lo = y + '-01-01', hi = A[q + 1] ? A[q + 1] + '-01-01' : '9999'; return [y + '+', tpHalf(tpRun(LM, COST).filter(z => z.d >= lo && z.d < hi))]; })) }; }
  else longInfo = { label: 'INFORMATION ONLY', note: 'Massive returned ' + R.length + ' SPY daily bars (' + (j && j.refused ? 'HTTP ' + j.status : 'no long history') + '): not shown' };
  log('A-TP1 long check: ' + JSON.stringify(longInfo).slice(0, 600)); }

// ================= 4. A-RMOM1: SQ6-MTUM rebuilt (agent-a-tgt-lab.mjs section 2, MTUM only) =================
const S6 = J('data/squad6-lab.json', {}), fz = (S6.firstRun || {})['SQ6-MTUM'], FROZENN = fz && fz.results ? (fz.results.older.n || 0) + (fz.results.newer.n || 0) : null;
const TV63 = new Float32Array(N).fill(NaN); for (let i = 0; i < NS; i++) { const b = i * T; let s = 0, n = 0; for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; } if (t >= 63) { const w = MAIN[b + t - 63] ? CA[b + t - 63] * VA[b + t - 63] : NaN; if (isFinite(w)) { s -= w; n--; } } if (t >= 62 && n >= 57) TV63[b + t] = s / n; } }
const WKS = weeksOf(D), wkMemo = new Map(), wkOf = (i) => { if (!wkMemo.has(i)) wkMemo.set(i, weekly({ o: ser(OA, i), h: ser(HA, i), l: ser(LA, i), c: ser(CA, i) }, WKS).c); return wkMemo.get(i); };
const meLive = (months) => { const a = monthEnds6(D, months), nx = nextSession(D[T - 1]); if (nx.slice(0, 7) !== D[T - 1].slice(0, 7) && months.includes(+D[T - 1].slice(5, 7)) && !a.includes(T - 1)) a.push(T - 1); return a; };
const FORM = [];
for (const t of meLive([5, 11])) { if (t < 252) continue; const uni = topN(liqList(t).filter(i => CA[i * T + t - 252] > 0).map(i => ({ key: i, v: TV63[i * T + t] })), 600);
  const nW = WKS.findIndex(w => w.e >= t), lastW = WKS[nW] && WKS[nW].e === t ? nW : nW - 1;
  const rows = uni.map(i => { const c = cl(i), a = c[t - 21], m12 = c[t - 252] > 0 && a > 0 ? a / c[t - 252] - 1 : null, m6 = c[t - 126] > 0 && a > 0 ? a / c[t - 126] - 1 : null, wc = wkOf(i), rr = [];
    for (let w = Math.max(1, lastW - 155); w <= lastW; w++) if (wc[w] > 0 && wc[w - 1] > 0) rr.push(wc[w] / wc[w - 1] - 1); const s = rr.length >= 52 ? sd6(rr) * Math.sqrt(52) : null; return { key: i, m6, m12, vol: s }; });
  FORM.push({ t, d: D[t], picks: mtumPick(rows, Math.ceil(uni.length * 0.20)) }); }
// rebuilt-count check against the frozen SQ6-MTUM trades (finished picks, artifacts dropped), as agent-a-tgt-lab
let rebuilt = 0; for (const f of FORM) { const k = f.t + 1, x = k + HOLD - 1; if (x > T - 1) continue; for (const i of f.picks) if (OA[i * T + k] > 0 && !hasArt(i, k, x)) rebuilt++; }
STATUS.mtum = { ok: FROZENN !== null && FROZENN > 0 && rebuilt >= FROZENN * 0.9 && rebuilt <= FROZENN * 1.1, frozenTrades: FROZENN, rebuilt, formations: FORM.length, dates: FORM.map(f => f.d + ':' + f.picks.length) };
log('SQ6-MTUM rebuild: ' + JSON.stringify(STATUS.mtum));
// a book: equal money at the open of k in the picks (no artifact inside k..x), values to the close of each session k..x
const bookOf = (picks, k, x) => { const paths = []; for (const i of picks) { if (!(OA[i * T + k] > 0) || hasArt(i, k, x)) continue; const p = [OA[i * T + k]]; for (let q = k; q <= x; q++) p.push(CA[i * T + q]); paths.push(p); } return paths.length ? { n: paths.length, V: bookPath(paths) } : null; };
const volBook = (picks, t) => { const a = t - VOL_LB; if (a < 0) return null; const paths = []; for (const i of picks) { if (!(CA[i * T + a] > 0) || hasArt(i, a, t)) continue; const p = [CA[i * T + a]]; for (let q = a + 1; q <= t; q++) p.push(CA[i * T + q]); paths.push(p); } const V = paths.length ? bookPath(paths) : null; return V ? annVol(pathRets(V)) : null; };
const priceAt = (i, x, at) => { if (x > T - 1) return null; if (at === 'o') { const z = OA[i * T + x]; if (z > 0) return z; if (x > lastI[i]) { for (let q = x; q >= 0; q--) if (CA[i * T + q] > 0) return CA[i * T + q]; } return null; } for (let q = Math.min(x, T - 1); q >= 0; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const BOOKS = [];
FORM.forEach((f, j) => { const k = f.t + 1, x = k + HOLD - 1; if (x > T - 1) return; const B = bookOf(f.picks, k, x); if (!B) return;
  const prev = j > 0 ? FORM[j - 1] : null, sigma = prev ? volBook(prev.picks, f.t) : null, w = rmomWeight(sigma);
  const spy = []; for (let q = k; q <= x; q++) spy.push(q === k ? SPYC[q] / SPYO[k] - 1 : SPYC[q] / SPYC[q - 1] - 1);
  const avg = yardOf(liqList(k - 1).filter(i => i % 2 === 0 && !hasArt(i, k, x)), k, x, 'c', priceAt, 'capBoth', 50);
  BOOKS.push({ d: f.d, half: halfOf(f.d), k: D[k], x: D[x], n: B.n, sigma: r4(sigma), w: r4(w), rets: pathRets(B.V), gross: r4(B.V[B.V.length - 1] - 1), spy, avgStock: r4(avg) }); });
STATUS.books = { ok: BOOKS.length >= 6, finished: BOOKS.length, older: BOOKS.filter(b => b.half === 'older').length, newer: BOOKS.filter(b => b.half === 'newer').length };
log('A-RMOM1 books: ' + JSON.stringify(STATUS.books) + ' ' + JSON.stringify(BOOKS.map(b => [b.d, b.n, b.w, b.gross])));
if (DIAG) { console.log('AGENT A TIMING OVERLAYS DIAG (data coverage and counts only; nothing judged or written)'); console.log('DATA ' + JSON.stringify(STATUS)); process.exit(0); }

// ================= 5. JUDGING (agent-a-tp-core.mjs, as registered) =================
const LB0 = J('data/agent-league.json', {}), LUCK = typeof LB0.bar === 'number' && LB0.bar > 0 ? LB0.bar : 4.1;
const results = {};
if (STATUS.price.ok && STATUS.tp.ok) { const byCost = tpJudgeAll(TPM), judged = judgeTp(byCost, LUCK);
  const s = byCost.stress, b = byCost.base;
  results['A-TP1'] = { rule: 'A-TP1', registered: REGISTERED, window: TPM[0].d + ' to ' + TPM[TPM.length - 1].d, luckBar: LUCK, tbill: STATUS.tbill, byCost: { registered: byCost.registered, base: b, stress: s }, judged,
    summary: 'older ' + s.older.months + ' months: rule ' + pc(b.older.rule.perYear) + '/yr (DD ' + pc(b.older.rule.maxDD) + ') vs hold ' + pc(b.older.hold.perYear) + ' (DD ' + pc(b.older.hold.maxDD) + '); newer ' + s.newer.months + ' months: rule ' + pc(b.newer.rule.perYear) + '/yr (DD ' + pc(b.newer.rule.maxDD) + ') vs hold ' + pc(b.newer.hold.perYear) + ' (DD ' + pc(b.newer.hold.maxDD) + '); at 0.8%; t (1.2%) ' + s.older.diffT + ' / ' + s.newer.diffT,
    months: TPM.map(z => ({ d: z.d, in: z.inMarket ? 1 : 0, slow: z.slow, fast: z.fast, spy: r4(z.spy), cash: r4(z.cash) })) }; }
if (STATUS.price.ok && STATUS.mtum.ok && STATUS.books.ok) { const byCost = {};
  for (const [name, c] of [['base', COST], ['stress', STRESS]]) { byCost[name] = {};
    for (const h of ['older', 'newer']) { const bs = BOOKS.filter(z => z.half === h); if (!bs.length) { byCost[name][h] = null; continue; }
      const sc = [], un = [], sp = []; for (const z of bs) { sc.push(...bookDaily(z.rets, z.w, c)); un.push(...bookDaily(z.rets, 1, c)); sp.push(...z.spy); }
      const per = (w1) => bs.map(z => { const r = bookDaily(z.rets, w1 ? z.w : 1, c); return r.reduce((e, x) => e * (1 + x), 1) - 1; });
      byCost[name][h] = { books: bs.length, scaled: { ...dailyStats(sc), worstBook: r4(Math.min(...per(true))) }, unscaled: { ...dailyStats(un), worstBook: r4(Math.min(...per(false))) }, spy: dailyStats(sp),
        avgStockPerBook: r4(mean(bs.map(z => z.avgStock).filter(x => typeof x === 'number'))), weights: bs.map(z => z.w) }; } }
  const judged = judgeRmom(byCost), b = byCost.base;
  results['A-RMOM1'] = { rule: 'A-RMOM1', registered: REGISTERED, mtum: STATUS.mtum, byCost, judged,
    books: BOOKS.map(z => ({ d: z.d, half: z.half, k: z.k, x: z.x, n: z.n, sigma: z.sigma, w: z.w, gross: z.gross, avgStock: z.avgStock })),
    summary: ['older', 'newer'].map(h => b[h] ? h + ' ' + b[h].books + ' books: scaled ' + pc(b[h].scaled.perYear) + '/yr Sharpe ' + b[h].scaled.sharpe + ' DD ' + pc(b[h].scaled.maxDD) + ' vs unscaled ' + pc(b[h].unscaled.perYear) + ' Sharpe ' + b[h].unscaled.sharpe + ' DD ' + pc(b[h].unscaled.maxDD) + ' (SPY ' + pc(b[h].spy.perYear) + ')' : h + ': none').join('; ') + ' (0.8%)' }; }
const firstRun = freezeEach(PREV.firstRun, results);
const out = { generatedAt: new Date().toISOString(), agent: 'A', preRegistered: 'agent-a-tp-core.mjs header (' + REGISTERED + ', before any run)', status: STATUS, firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { verdict: r.judged.verdict, summary: r.summary }])) }), longInfo };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
{ const LB = J(LIB, null), ch = recordResults(LB, firstRun); if (ch) { LB.updated = new Date().toISOString().slice(0, 10); fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } log('library: ' + ch + ' results recorded'); }
console.log('AGENT A TIMING OVERLAYS (first run frozen; verdicts below are firstRun)');
for (const id of IDS) { const r = firstRun[id]; console.log(id + ': ' + (r ? r.judged.verdict + ' | ' + r.summary + (r.judged.why.length ? ' | why: ' + r.judged.why.join('; ') : '') : 'NOT JUDGED (data check failed: ' + JSON.stringify(STATUS).slice(0, 400) + ')')); }
