// ML LAB (ML-RANK1; owner's request of 24 Oct 2026: "a machine-learning ranker, built honestly so it cannot fool itself").
// Research + a FORWARD PAPER lane; never places an order; no Telegram. The exact rule is ml-spec.json, frozen and committed BEFORE any
// training (library entry ML-RANK1); ml-core.mjs holds the pure code and test/ml-core.test.mjs checks it equals the spec.
// 1. DATA (GitHub Actions only; keys only from secrets, never printed):
//    prices = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY; dead stocks' later prices
//             in its x rows) + the sessions since, from Massive's grouped daily bars, + splits since the cache day (anomaly-lab.mjs method).
//    facts  = SEC companyfacts, compact, from the value lab's cache (value-cache/facts.json.gz, RESTORED READ ONLY), read point in time
//             with value-core.mjs fcfCheck; F-score from quality.mjs's yearly cache (study-cache/fund.json.gz); shares data/shares.json.gz.
// 2. 5-YEAR WALK-FORWARD ONE-SHOT (only while data/ml-lab.json has no firstRun['ML-RANK1']): weekly decision dates, ~41 point-in-time
//    features, expanding-window retrain every quarter from 2023-10-01 predicting only that quarter; top 10 a week, hold 20 sessions,
//    0.8% cost (1.2% stress), 35% disaster stop; judged with value-core halfStat/judge on 2023-10..2024-09 / 2024-10..2025-09, plus the
//    registered extra gates (beat the 12-1 momentum baseline in both halves; the untouched holdout 2025-10.. must hold up). The first
//    complete verdict is frozen (first-run.mjs freezeEach); later runs are monitoring only (HISTORY=1).
// 3. PAPER LANE from the decision of Fri 23 Oct 2026 (entry Mon 26 Oct): each week's ML top 10 and the momentum baseline's top 10 go to
//    data/ml-paper.jsonl with close + ZAD halal mark, resolved after 20 sessions; data/ml-today.json, data/ml-board.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, fcfCheck, TIER2_T } from './value-core.mjs';
import { nextSession, boardStats, paperReady } from './anomaly-core.mjs';
import { HOLD, TOPK, COST, STRESS, STOP, DEV_FROM, SPLIT, HOLDOUT_FROM, PAPER_FIRST, GBDT, RIDGE_LAMBDA, FEATURES, NF, FI, MARKET, RANKED, weekEnds, quarterOf, schedule, labelKnown, periodOf,
  fwdReturn, tradeReturn, liquid, stockFeatures, marketFeatures, xsRank, groupRel, winsorize, fscore, knownYear, binEdges, binMatrix, trainGBDT, predictGBDT, treesToJSON, treesFromJSON,
  trainRidge, predictRidge, topK, spearman, tStat, extraGates, mean, r4 } from './ml-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const OUT = env.OUT || 'data/ml-lab.json', TODAY = env.TODAY_OUT || 'data/ml-today.json', PAPER = env.PAPER_OUT || 'data/ml-paper.jsonl', BOARD = env.BOARD_OUT || 'data/ml-board.json', MODEL = env.MODEL_OUT || 'data/ml-model.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.ML_MINUTES || 230) * 60e3, left = () => BUDGET - (Date.now() - t0);
const NOW = env.ML_NOW || new Date().toISOString(), PSTART = env.ML_PAPER_FIRST || PAPER_FIRST;   // test hooks: the recording time and first decision of the paper lane
fs.mkdirSync('data', { recursive: true });
const SPEC_TEXT = fs.readFileSync('ml-spec.json', 'utf8'), SPEC = JSON.parse(SPEC_TEXT), SPEC_SHA = crypto.createHash('sha256').update(SPEC_TEXT).digest('hex').slice(0, 16);
if (JSON.stringify(SPEC.models['ML-RANK1'].hyperParameters) !== JSON.stringify(GBDT) || SPEC.features.list.map(x => x[0]).join() !== FEATURES.join()) { console.log('Error: ml-core.mjs differs from the frozen ml-spec.json; nothing run'); process.exit(1); }
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0);
const ONE_SHOT = !FROZEN['ML-RANK1'], HISTORY = !!env.HISTORY;

// ================= 1. PRICES (anomaly-lab.mjs method; with highs and lows for the stop) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('ml-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let ms = Date.parse(cacheLast) + 864e5; ms <= Date.parse(NOW.slice(0, 10)); ms += 864e5) { const d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none') + (env.MASSIVE_KEY ? '' : ' (no MASSIVE_KEY)'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) { for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size); if (store.days[d].x) for (const s of store.days[d].x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
// main rows (liquidity, entry universe) and merged rows (main, else x: prices of stocks that fell under the cache filter)
const MC = new Float32Array(N).fill(NaN), MV = new Float32Array(N).fill(NaN), O = new Float32Array(N).fill(NaN), H = new Float32Array(N).fill(NaN), L = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN);
let hasHL = 0;
D.forEach((d, t) => { const x = store.days[d];
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]) * T + t; O[q] = x.x.o[j]; C[q] = x.x.c[j]; V[q] = x.x.v[j]; if (x.x.h) { H[q] = x.x.h[j]; L[q] = x.x.l[j]; } }
  for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; MC[k] = x.c[j]; MV[k] = x.v[j]; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; if (x.h) { H[k] = x.h[j]; L[k] = x.l[j]; hasHL++; } } });
const SIC = store.sic || {}; store = null;
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; H[q] /= r; L[q] /= r; C[q] /= r; MC[q] /= r; V[q] *= r; MV[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), sub = (A, i) => A.subarray(i * T, i * T + T), MKT = spyI !== undefined ? sub(C, spyI) : null;
const SER = (i) => ({ o: sub(O, i), h: sub(H, i), l: sub(L, i), c: sub(C, i), v: sub(V, i) });
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS + (hasHL ? '' : ' (NO highs/lows in the cache: the stop cannot be checked)'));
if (!MKT) { console.log('ml-lab: no SPY in the cache; nothing done'); process.exit(0); }

// ---- symbols, industries, shares, fundamentals, halal ----
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {}, c: {} });
const sicOf = (s) => { const x = SIC[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECCIK[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
const sic2 = (s) => { const c = sicOf(s); return c ? c.slice(0, 2) : null; }, finCo = (s) => { const c = sicOf(s); return !!c && c[0] === '6'; };
const symCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(a); const y = SECCIK[s]; return y ? String(y[0]) : null; };
const sharesKnown = (cik, d) => { const a = SH.c[cik]; if (!a) return null; const lim = iso(Date.parse(d + 'T00:00:00Z') - 30 * 864e5); let v = null; for (const [e, n] of a) if (e <= lim) v = n; return v; };
const FX = JZ((env.VALUE_CACHE || 'value-cache') + '/facts.json.gz', { at: null, c: {} }), FV = (JZ(env.FUND_CACHE || 'study-cache/fund.json.gz', { v: {} }) || {}).v || {};
const VTAGS = { cfo: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'], capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], cogs: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'],
  inv: ['InventoryNet'], eq: ['StockholdersEquity'], debt: ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings'] };
const coMemo = new Map(), coOf = (cik) => { if (coMemo.has(cik)) return coMemo.get(cik); const c = FX.c[cik]; let o = null;
  if (c && Object.keys(c).length) { const m = (tags) => { const z = {}; for (const t of tags) if (c[t]) z[t] = c[t].map(([s, e, v, f]) => ({ s, e, v, f })); return z; }; o = Object.fromEntries(Object.entries(VTAGS).map(([k, v]) => [k, m(v)])); }
  coMemo.set(cik, o); return o; };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';

// ================= 2. DECISION DATES, UNIVERSE, FEATURES, TARGETS =================
const DEC = weekEnds(D, (d) => nextSession(d)), FIRST = 252, decF = DEC.filter(t => t >= FIRST);
const monthFirst = new Map(); for (const t of decF) { const ym = D[t].slice(0, 7); if (!monthFirst.has(ym)) monthFirst.set(ym, t); }
const univAt = (t) => { const a = []; for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; if (!(MC[b + t] >= 5) || t < 60 || !(C[b + t - 60] > 0)) continue; if (liquid(sub(MC, i), sub(MV, i), t)) a.push(i); } return a; };
const fundMemo = new Map(); let fundAsked = 0, fundWithFacts = 0;
function fundOf(i, tm) {   // fundamentals of stock i known on the month's first decision date tm (filings strictly before D[tm])
  const s = SYMS[i], key = i * 4096 + tm; if (fundMemo.has(key)) return fundMemo.get(key); const out = [NaN, NaN, NaN, NaN], cik = symCik(s);
  if (cik) { fundAsked++; const co = coOf(cik), sh = sharesKnown(cik, D[tm]), px = C[i * T + tm];
    if (co) { fundWithFacts++; if (sh > 0 && px > 0) { const r = fcfCheck(co, D[tm], px, sh); if (isFinite(r.fcfy) && r.fcfy < 0.4) out[0] = r.fcfy; if (isFinite(r.growth)) out[1] = r.growth; if (isFinite(r.de)) out[2] = r.de; } }
    if (!finCo(s)) { const f = fscore(FV, SH.c, cik, knownYear(D[tm])); if (f !== null) out[3] = f; } }
  fundMemo.set(key, out); return out; }
// sample arrays (grown per decision date)
let cap = 1 << 20, nS = 0, X = new Float32Array(cap * NF), sT = new Int32Array(cap), sI = new Int32Array(cap), Y = new Float32Array(cap).fill(NaN), YW = new Float32Array(cap).fill(NaN), G = new Float32Array(cap).fill(NaN), MOMR = new Float32Array(cap).fill(NaN);
const grow = () => { cap *= 2; const g = (A, fill) => { const B = new A.constructor(A.length * 2); if (fill !== undefined) B.fill(fill); B.set(A); return B; }; X = g(X); sT = g(sT); sI = g(sI); Y = g(Y, NaN); YW = g(YW, NaN); G = g(G, NaN); MOMR = g(MOMR, NaN); };
const byDate = new Map(), ctrlAt = new Map(), STOPPED = new Set();
let factsCiks = new Set(), factsHave = new Set();
// which dates to build: every decision date for the one-shot (or HISTORY) or when the live model of the newest quarter must be trained;
// otherwise (weekly paper runs) only the paper dates (features of a date use nothing from other dates)
const SCHED = schedule(decF, D), lastQ = SCHED.length ? SCHED[SCHED.length - 1] : null, SAVED = J(MODEL, null);
const savedOk = !!(SAVED && lastQ && SAVED.q === lastQ.q && SAVED.spec === SPEC_SHA && SAVED.trainedThrough === D[lastQ.trainMaxT]);
const BUILD = ONE_SHOT || HISTORY || !savedOk ? decF : decF.filter(t => D[t] >= PSTART);
log('building ' + BUILD.length + ' decision dates' + (BUILD.length < decF.length ? ' (paper dates only; saved live model ' + SAVED.q + ')' : ''));
for (const t of BUILD) { const U = univAt(t); if (U.length < 50) continue; const tm = monthFirst.get(D[t].slice(0, 7)), n = U.length, F = U.map(i => stockFeatures(SER(i), MKT, t));
  // logMcap, fundamentals
  U.forEach((i, j) => { const cik = symCik(SYMS[i]); if (cik) { factsCiks.add(cik); if (coOf(cik)) factsHave.add(cik); const sh = sharesKnown(cik, D[t]); if (sh > 0) F[j][FI.logMcap] = Math.log(sh * C[i * T + t]); }
    const fu = fundOf(i, tm); F[j][FI.fcfYield] = fu[0]; F[j][FI.revGrowth] = fu[1]; F[j][FI.debtEquity] = fu[2]; F[j][FI.fscore] = fu[3]; });
  // sector-relative strength (SIC 2-digit groups of the universe on t)
  const grp = U.map(i => sic2(SYMS[i])), g60 = groupRel(F.map(f => f[FI.r60]), grp), g126 = groupRel(F.map(f => f[FI.r126]), grp);
  F.forEach((f, j) => { f[FI.secRel60] = g60.rel[j]; f[FI.secRel126] = g126.rel[j]; f[FI.secMom126] = g126.gm[j]; });
  // market: SPY regime + breadth (share of the universe above its 50-session average)
  const ab = F.filter(f => isFinite(f[FI.dma50])), mk = marketFeatures(MKT, t, ab.length ? ab.filter(f => f[FI.dma50] > 0).length / ab.length : NaN);
  const momRaw = F.map(f => f[FI.mom12_1]);
  for (const k of RANKED) { const r = xsRank(F.map(f => f[FI[k]])); F.forEach((f, j) => { f[FI[k]] = r[j]; }); }
  for (const k of MARKET) F.forEach(f => { f[FI[k]] = mk[k]; });
  // targets (label known only when t + 20 is in the data)
  const fw = U.map(i => fwdReturn(SER(i), t)), okv = fw.filter(x => x !== null && isFinite(x) && Math.abs(x) < 3), ctrl = okv.length >= 50 ? mean(okv) : null; if (ctrl !== null) ctrlAt.set(t, ctrl);
  const ex = fw.map(x => x !== null && ctrl !== null && isFinite(x) ? x - ctrl : NaN), exw = winsorize(ex);
  const ids = [];
  for (let j = 0; j < n; j++) { if (nS >= cap) grow(); const s0 = nS++; X.set(F[j].map(v => isFinite(v) ? v : NaN), s0 * NF); sT[s0] = t; sI[s0] = U[j]; Y[s0] = ex[j]; YW[s0] = exw[j]; MOMR[s0] = momRaw[j];
    const tr = tradeReturn(SER(U[j]), t); if (tr) { G[s0] = tr.g; if (tr.stopped) STOPPED.add(s0); } ids.push(s0); }
  byDate.set(t, ids); }
const fundCover = { companies: factsCiks.size, withFacts: factsHave.size, share: factsCiks.size ? r4(factsHave.size / factsCiks.size) : 0, factsAt: FX.at, fscoreYears: Object.keys(FV).length ? 'loaded' : 'missing' };
const featMissing = Object.fromEntries(FEATURES.map((f, k) => { let m = 0; for (let s = 0; s < nS; s++) if (!isFinite(X[s * NF + k])) m++; return [f, r4(m / Math.max(1, nS))]; }));
log('samples ' + nS + ' on ' + byDate.size + ' decision dates (' + D[decF[0]] + ' to ' + D[decF[decF.length - 1]] + '); SEC facts for ' + factsHave.size + '/' + factsCiks.size + ' companies');

// ================= 3. MODELS =================
const rowsUpTo = (maxT) => { const r = []; for (let s = 0; s < nS; s++) if (sT[s] <= maxT && isFinite(YW[s])) r.push(s); return r; };
function fit(maxT) { const rows = rowsUpTo(maxT), edges = binEdges(X, NF, rows, GBDT.bins, 200000, GBDT.seed), B = binMatrix(X, NF, rows, edges), y = Float64Array.from(rows.map(s => YW[s]));
  const gb = trainGBDT(B, rows.length, NF, y, GBDT), lin = trainRidge(X, NF, rows, rows.map(s => YW[s]), RIDGE_LAMBDA); return { rows: rows.length, edges, gb, lin }; }
function scoreRows(M, ids) { const B = binMatrix(X, NF, ids, M.edges), p = predictGBDT(M.gb, B, ids.length, NF); return ids.map((s, j) => ({ s, ml: p[j], lin: predictRidge(M.lin, X, NF, s), mom: MOMR[s] })); }
const scored = new Map(), retrains = [];   // t -> [{ s, ml, lin, mom }]
let liveModel = null;
if (ONE_SHOT || HISTORY) {
  for (const q of SCHED) { if (left() < 20 * 60e3) { log('time budget used up before ' + q.q); break; } const tt = Date.now(), M = fit(q.trainMaxT);
    for (const t of q.predict) if (byDate.has(t)) scored.set(t, scoreRows(M, byDate.get(t)));
    const tot = M.gb.gain.reduce((a, b) => a + b, 0) || 1; retrains.push({ q: q.q, retrainDate: D[q.t0], trainedThrough: D[q.trainMaxT], trainRows: M.rows, predicts: q.predict.length, seconds: Math.round((Date.now() - tt) / 1000), importance: M.gb.gain.map(g => g / tot) });
    if (q === lastQ) liveModel = { q: q.q, M }; log('retrain ' + q.q + ' at ' + D[q.t0] + ': ' + M.rows + ' rows, ' + Math.round((Date.now() - tt) / 1000) + 's'); } }

// ================= 4. STRATEGIES, VERDICT =================
const midT = (() => { const a = [...byDate.keys()].sort((x, y) => x - y); return a.find(t => D[t] >= SPLIT); })();
function strategy(key) { const tr = [], skipped = { noEntry: 0 };
  for (const [t, rows] of [...scored].sort((a, b) => a[0] - b[0])) { const per = periodOf(D[t]); if (per === 'train') continue; const c = ctrlAt.get(t); if (c === undefined) continue;
    const picks = topK(rows.map(r => ({ s: r.s, sym: SYMS[sI[r.s]], score: key === 'mom' ? r.mom : r[key] })), TOPK);
    for (const p of picks) { if (!isFinite(G[p.s])) { skipped.noEntry++; continue; } tr.push({ t, s: p.sym, i: sI[p.s], sid: p.s, g: G[p.s], c, h: HOLD, half: per, stopped: STOPPED.has(p.s), halal: halal(p.sym) }); } }
  // the same stock on the other decision dates of the same period, not picked by this strategy, in the universe
  const picked = new Set(tr.map(z => z.sid)), byStock = new Map();
  for (const t of scored.keys()) { const per = periodOf(D[t]); if (per === 'train') continue; for (const s of byDate.get(t)) { if (picked.has(s) || !isFinite(G[s])) continue; const k = sI[s] + '|' + per; (byStock.get(k) || byStock.set(k, []).get(k)).push(G[s]); } }
  for (const z of tr) { const v = byStock.get(z.i + '|' + z.half) || []; z.own = v.length >= 3 ? mean(v) : null; }
  const R = { older: halfStat(tr.filter(z => z.half === 'older'), HOLD), newer: halfStat(tr.filter(z => z.half === 'newer'), HOLD), all: halfStat(tr.filter(z => z.half !== 'holdout'), HOLD) }, HO = halfStat(tr.filter(z => z.half === 'holdout'), HOLD);
  const stops = (h) => { const a = tr.filter(z => z.half === h); return a.length ? r4(a.filter(z => z.stopped).length / a.length) : null; };
  const halalShare = (h) => { const a = tr.filter(z => z.half === h); return a.length ? { ok: r4(a.filter(z => z.halal === 'ok').length / a.length), fail: r4(a.filter(z => z.halal === 'fail').length / a.length), unknown: r4(a.filter(z => z.halal === 'unknown').length / a.length) } : null; };
  return { tr, R, HO, skipped, stopRate: { older: stops('older'), newer: stops('newer'), holdout: stops('holdout') }, halal: { older: halalShare('older'), newer: halalShare('newer'), holdout: halalShare('holdout') } }; }
let RES = null, INFO = {};
if (scored.size) {
  const S = { ml: strategy('ml'), lin: strategy('lin'), mom: strategy('mom') };
  const holdDates = [...scored.keys()].filter(t => periodOf(D[t]) === 'holdout' && ctrlAt.has(t)).length;
  const verdictOf = (x, extra) => ({ ...judge(x.R, { bar: BAR, extra }), results: x.R, holdout: x.HO, hold: HOLD, split: SPLIT, cost: COST, stress: STRESS, stop: STOP, skipped: x.skipped, stopRate: x.stopRate, halalMix: x.halal });
  const extra = extraGates(S.ml.R, S.mom.R, S.ml.HO, S.mom.HO);
  RES = { 'ML-RANK1': { ...verdictOf(S.ml, extra), extraGatesFailed: extra, passesExtraGates: extra.length === 0 }, MOM: verdictOf(S.mom, []), LIN: verdictOf(S.lin, []) };
  // information coefficient per week (score vs excess return), per period
  const ic = { ml: {}, lin: {}, mom: {} };
  for (const k of ['ml', 'lin', 'mom']) for (const per of ['older', 'newer', 'holdout']) { const v = []; for (const [t, rows] of scored) { if (periodOf(D[t]) !== per) continue; const a = rows.filter(r => isFinite(Y[r.s]) && isFinite(r[k])); if (a.length < 50) continue; const x = spearman(a.map(r => r[k]), a.map(r => Y[r.s])); if (x !== null) v.push(x); }
    ic[k][per] = { weeks: v.length, mean: r4(mean(v) ?? NaN), t: v.length > 2 ? +(tStat(v) || 0).toFixed(2) : null }; }
  // feature importance and stability across retrains
  const imp = retrains.map(r => r.importance), avgImp = FEATURES.map((f, k) => mean(imp.map(v => v[k])));
  const order = FEATURES.map((f, k) => k).sort((a, b) => avgImp[b] - avgImp[a]), top5 = FEATURES.map((f, k) => imp.filter(v => [...v.keys()].sort((a, b) => v[b] - v[a]).slice(0, 5).includes(k)).length);
  const cons = []; for (let j = 1; j < imp.length; j++) cons.push(spearman(imp[j - 1], imp[j]));
  INFO = { ic, holdoutDecisionDates: holdDates,
    importance: order.map(k => ({ feature: FEATURES[k], avg: r4(avgImp[k]), min: r4(Math.min(...imp.map(v => v[k]))), max: r4(Math.max(...imp.map(v => v[k]))), timesTop5: top5[k] })),
    stability: { retrains: imp.length, spearmanConsecutive: cons.map(x => r4(x)), meanSpearman: r4(mean(cons.filter(x => x !== null)) ?? NaN) },
    retrains: retrains.map(({ importance, ...r }) => r), samples: nS, decisionDates: byDate.size, featureMissingShare: featMissing };
  INFO.trades = Object.fromEntries(Object.entries(S).map(([k, x]) => [k, x.tr.map(z => ({ s: z.s, d: D[z.t], period: z.half, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null ? null : z.own - COST), stopped: z.stopped, halal: z.halal }))]));
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  for (const [k, r] of Object.entries(RES)) log('- ' + k + ': ' + r.verdict + ' | older ' + f(r.results.older) + ' | newer ' + f(r.results.newer) + ' | HOLDOUT ' + f(r.holdout) + ' | ' + r.why.slice(0, 400));
  log('IC (mean weekly Spearman, older/newer/holdout): ' + Object.entries(ic).map(([k, v]) => k + ' ' + ['older', 'newer', 'holdout'].map(p => v[p].mean + ' (t ' + v[p].t + ')').join(' / ')).join(' | '));
  log('top features: ' + INFO.importance.slice(0, 10).map(x => x.feature + ' ' + pc(x.avg) + ' (top5 ' + x.timesTop5 + '/' + imp.length + ')').join(', ') + ' | stability ' + INFO.stability.meanSpearman); }
const complete = !!RES && retrains.length === SCHED.length && (INFO.holdoutDecisionDates || 0) >= 40 && fundCover.share >= 0.7 && hasHL > 0;
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = ONE_SHOT && RES ? freezeEach(FROZEN, { 'ML-RANK1': { at: NOW, window: [D[0], D[T - 1]], bar: BAR, spec: 'ml-spec.json sha256 ' + SPEC_SHA, ...RES['ML-RANK1'] } }, () => complete) : FROZEN;
const comparators = PREV.firstRunComparators || (ONE_SHOT && RES && complete ? { at: NOW, note: 'the same walk-forward and gates; information only, not rules', MOM: RES.MOM, LIN: RES.LIN } : null);
if (ONE_SHOT && RES && !complete) log('INCOMPLETE run (retrains ' + retrains.length + '/' + SCHED.length + ', holdout dates ' + INFO.holdoutDecisionDates + ', SEC facts share ' + fundCover.share + ', highs/lows ' + (hasHL > 0) + '): NOTHING frozen');

// ================= 5. LIVE MODEL (the quarter of the newest decision date) =================
const FR = firstRun['ML-RANK1'] || null, eligible = !!(FR && FR.passesExtraGates);   // TRY SMALL then applies its own standard (scan.mjs tryQualifies)
const lastDec = [...byDate.keys()].sort((a, b) => a - b).pop();
let live = null;
if (lastDec !== undefined && lastQ && lastQ.predict.includes(lastDec)) {
  if (liveModel && liveModel.q === lastQ.q) live = liveModel.M;
  else if (savedOk) live = { edges: SAVED.edges, gb: treesFromJSON(SAVED.gb), lin: SAVED.lin, rows: SAVED.rows };
  else { log('training the live model for ' + lastQ.q); live = fit(lastQ.trainMaxT); }
  fs.writeFileSync(MODEL, JSON.stringify({ q: lastQ.q, spec: SPEC_SHA, retrainDate: D[lastQ.t0], trainedThrough: D[lastQ.trainMaxT], rows: live.rows, features: FEATURES, edges: live.edges, gb: treesToJSON(live.gb), lin: live.lin })); }

// ================= 6. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const listed = new Set(lines.filter(x => x.type === 'list').map(x => x.m + '|' + x.d)), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), newLines = [];
if (live) for (const t of [...byDate.keys()].sort((a, b) => a - b)) { if (D[t] < PSTART || !lastQ.predict.includes(t)) continue;
  const sc = scoreRows(live, byDate.get(t)), entry = t + 1 < T ? D[t + 1] : nextSession(D[t]), late = NOW > entry + 'T13:30:00Z';
  // a late list enters at the first open after it was recorded
  let entryDate = entry; if (late) { let d = NOW.slice(0, 10); if (NOW.slice(11) >= '13:30') d = nextSession(d); else if ([0, 6].includes(new Date(d + 'T00:00:00Z').getUTCDay())) d = nextSession(d); entryDate = d; }
  for (const [m, key] of [['ML-RANK1', 'ml'], ['ML-MOM-BASE', 'mom']]) { if (listed.has(m + '|' + D[t])) continue;
    const picks = topK(sc.map(r => ({ s: r.s, sym: SYMS[sI[r.s]], score: key === 'mom' ? r.mom : r.ml })), TOPK).map(p => ({ sym: p.sym, close: r4(C[sI[p.s] * T + t]), halal: halal(p.sym), score: r4(p.score) }));
    newLines.push({ type: 'list', m, d: D[t], recordedAt: NOW, entryDate, late, hold: HOLD, stopPct: STOP, model: lastQ.q, picks }); listed.add(m + '|' + D[t]); } }
const allLists = [...lines, ...newLines].filter(x => x.type === 'list'), board = {}, openNow = {}, closedBy = { 'ML-RANK1': [], 'ML-MOM-BASE': [] };
for (const L0 of allLists) { const k = tOf.get(L0.entryDate);
  for (const p of L0.picks) { const id = L0.m + '|' + L0.d + '|' + p.sym, i = SY.get(p.sym);
    if (k === undefined || i === undefined) { (openNow[L0.m] = openNow[L0.m] || []).push({ sym: p.sym, halal: p.halal, decision: L0.d, entry: L0.entryDate, state: 'waiting' }); continue; }
    const tr = tradeReturn(SER(i), k - 1);
    if (!tr) { const last = C[i * T + T - 1], e = O[i * T + k]; (openNow[L0.m] = openNow[L0.m] || []).push({ sym: p.sym, halal: p.halal, decision: L0.d, entry: L0.entryDate, sinceBuy: e > 0 && last > 0 ? r4(last / e - 1) : null, exitAfter: D[Math.min(T - 1, k - 1 + HOLD)] && k - 1 + HOLD < T ? D[k - 1 + HOLD] : HOLD + ' sessions' }); continue; }
    const fw = []; const tD = tOf.get(L0.d); for (const s of byDate.get(tD) || []) { const g = fwdReturn(SER(sI[s]), k - 1); if (g !== null && Math.abs(g) < 3) fw.push(g); } const c = fw.length >= 50 ? mean(fw) : null;
    closedBy[L0.m].push({ d: L0.d, sym: p.sym, g: tr.g, c, halal: p.halal });
    if (!resolved.has(id)) { resolved.add(id); newLines.push({ type: 'result', id, m: L0.m, d: L0.d, sym: p.sym, buy: D[k], sell: D[tr.x], stopped: tr.stopped, g: r4(tr.g), net: r4(tr.g - COST), avgStock: c === null ? null : r4(c - COST) }); } } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
for (const m of ['ML-RANK1', 'ML-MOM-BASE']) { const st = boardStats(closedBy[m]); board[m] = { name: m === 'ML-RANK1' ? 'ML ranker top 10' : '12-1 momentum top 10 (the simple baseline)', lists: allLists.filter(x => x.m === m).length, open: (openNow[m] || []).length, closed: st, halalOk: boardStats(closedBy[m].filter(z => z.halal === 'ok')), ready: paperReady(st) }; }
board.mlMinusBaseline = board['ML-RANK1'].closed.n && board['ML-MOM-BASE'].closed.n ? r4(board['ML-RANK1'].closed.avg - board['ML-MOM-BASE'].closed.avg) : null;
const latestOf = (m) => allLists.filter(x => x.m === m).sort((a, b) => a.d < b.d ? -1 : 1).pop() || null;
const notEntered = (Lx) => Lx && !Lx.late && Lx.entryDate > D[T - 1];
const LML = latestOf('ML-RANK1'), LMB = latestOf('ML-MOM-BASE');
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: PSTART,
  note: 'PAPER ONLY. newSignals is filled only when the frozen first run of ML-RANK1 passed its registered extra gates (beat the 12-1 momentum baseline in both halves AND held up on the untouched holdout) and only until the list\'s entry open; otherwise the weekly picks are in paperPicks and data/ml-paper.jsonl. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.',
  methods: { 'ML-RANK1': { name: 'machine-learning ranker (top 10 a week, 20 sessions)', hold: HOLD, stopPct: STOP, tier: FR ? FR.verdict : null, eligible, decision: LML ? LML.d : null, entry: LML ? LML.entryDate : null,
    newSignals: eligible && notEntered(LML) ? LML.picks.map(p => ({ sym: p.sym, close: p.close, halal: p.halal })) : [], paperPicks: LML ? LML.picks : [], open: openNow['ML-RANK1'] || [] } },
  comparators: { 'ML-MOM-BASE': { name: '12-1 momentum top 10 (baseline, not a rule)', decision: LMB ? LMB.d : null, picks: LMB ? LMB.picks : [] } } }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: PSTART, cost: COST, readiness: '30+ resolved paper trades on 10+ decision dates, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.filter(x => x.type === 'list').length + ' new list(s), ' + newLines.filter(x => x.type === 'result').length + ' new result(s); lists in all ' + allLists.length);

// ================= 7. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'ml-spec.json (sha256 ' + SPEC_SHA + ', committed 24 Oct 2026 before any training) + data/strategy-library.json ML-RANK1', window: [D[0], D[T - 1]], bar: BAR, cost: COST, stress: STRESS, stop: STOP, hold: HOLD,
  periods: { trainingOnly: 'before ' + DEV_FROM, older: DEV_FROM + ' .. ' + SPLIT, newer: SPLIT + ' .. ' + HOLDOUT_FROM, holdout: HOLDOUT_FROM + ' ..' },
  standard: 'development halves: > 0 after 0.8% and 1.2% cost, edge over the average universe stock > 0, better than the same stocks on their other decision dates, > 0 without the 2 best, block t >= ' + TIER2_T + ' -> TRADABLE SMALL; >= ' + BAR + ' -> PROVEN; PLUS beat the 12-1 momentum baseline in both halves and hold up on the untouched holdout (avg > 0, edge > 0, above the baseline)',
  data: { sessions: T, stocks: NS, freshSessions: fresh, highsLows: hasHL > 0, fundamentals: fundCover, fundamentalsAskedMonthly: fundAsked },
  complete: ONE_SHOT ? complete : null, firstRun, firstRunComparators: comparators,
  info: ONE_SHOT && RES ? (({ trades, ...rest }) => rest)(INFO) : PREV.info || null,
  latest: HISTORY && RES ? latestBlock({ at: NOW, window: [D[0], D[T - 1]], results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }) : PREV.latest || null,
  trades: ONE_SHOT && RES ? Object.fromEntries(Object.entries(INFO.trades).map(([k, v]) => [k, v.slice(-400)])) : PREV.trades || null };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const LIB = env.LIBRARY_OUT || 'data/strategy-library.json';
try { const LB = J(LIB, null), e = LB && LB.strategies.find(x => x.id === 'ML-RANK1'), r = firstRun['ML-RANK1'];
  if (e && r && !e.result) { const R = r.results, Hh = r.holdout || {};
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + (r.passesExtraGates ? '' : '; fails its registered extra gates') + '; forward paper lane from 23 Oct 2026'; e.tested = String(r.window[1]); e.study = 'ml-lab.mjs -> data/ml-lab.json (walk-forward, run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock],
      holdout: { n: Hh.n || 0, avg: Hh.avg ?? null, edge: Hh.edge ?? null, tBlock: Hh.tBlock ?? null }, why: r.why };
    fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } } catch (e) { console.log('ml-lab: library not updated: ' + e.message); }
console.log('ML LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | ' + (FR ? 'ML-RANK1 frozen: ' + FR.verdict + (FR.passesExtraGates ? '' : ' (fails extra gates)') : 'ML-RANK1 not frozen') + ' | live model ' + (live ? lastQ.q : 'none'));
