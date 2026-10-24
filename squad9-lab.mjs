// SQUAD 9 LAB: YOUTUBE STRATEGY TESTERS (24 Oct 2026; the owner sent DaviddTech, The Moving Average and Quant Guild and asked whether
// their backtested claims hold up after costs and on unseen years). Research + a FORWARD PAPER lane; never places an order; no Telegram.
// Spec and pre-registered rules: squad9-core.mjs header and RULES (written before any run; library ids SQ9-*; the lab writes the same
// rule text into data/strategy-library.json before computing anything).
// 1. DATA (GitHub Actions only; keys only from secrets, never printed): the 5-year whole-market cache of the Sunday job
//    (study-cache/grouped.json.gz, RESTORED READ ONLY; o/h/l/c/v; dead stocks' later prices in its x rows) + the sessions since from
//    Massive's grouped daily bars + splits since the cache day. Nothing else is needed: every SQ9 rule is price and volume only.
// 2. 5-YEAR ONE-SHOT for every rule not yet frozen: every signal of the window on every liquid US stock, daily-bar trade simulation
//    (squad9-core simulate), judged at the system standard (value-core judge; halves = signal before / from 2024-01-01; AUD-1 capped
//    yardstick). First complete verdict frozen in data/squad9-lab.json firstRun (first-run.mjs freezeEach); later runs = monitoring only.
// 3. CHANNEL STYLE (information): the same rule on SPY alone and QQQ alone, at 0.8% and at 0.1% a round trip, next to the channel's claim.
// 4. PAPER LANE (from Monday 26 Oct 2026): every new signal -> data/squad9-paper.jsonl with its frozen plan; resolved when its exit is
//    known. data/squad9-today.json (methods[id] = { name, hold, newSignals: [{ sym, close, halal }] }) and data/squad9-board.json.
// DIAG=1: coverage only (nothing judged or written but data/squad9-diag.json).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, TIER2_T } from './value-core.mjs';
import { RULES, IDS, SOURCES, COST, SPLIT, PAPER_START, mean, r4, capG, halfOf, indicators, signalAt, simulate, closeExitFn, tradeStats, ownAverage, boardStats, paperReady, verdictLine, preRegister } from './squad9-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const OUT = 'data/squad9-lab.json', PAPER = 'data/squad9-paper.jsonl', TODAY = 'data/squad9-today.json', BOARD = 'data/squad9-board.json', LIB = 'data/strategy-library.json';
const DIAG = !!env.DIAG, START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};
log('squad 9 lab' + (DIAG ? ' (DIAG)' : '') + '; rules ' + IDS.length + ', frozen ' + Object.keys(FROZEN).length);

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ9 entries written now'); }

// ================= 1. PRICES =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad9-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
if (!DIAG) for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || ['SPY', 'QQQ'].includes(x.T) || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const OA = new Float32Array(N).fill(NaN), HA = new Float32Array(N).fill(NaN), LA = new Float32Array(N).fill(NaN), CA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
let xDays = 0, hlMissing = 0;
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; MAIN[k] = 1; if (x.h && x.l) { HA[k] = x.h[j]; LA[k] = x.l[j]; } else hlMissing++; }
  if (x.x) { xDays++; for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o[j]; VA[k] = x.x.v ? x.x.v[j] : NaN; if (x.x.h && x.x.l) { HA[k] = x.x.h[j]; LA[k] = x.x.l[j]; } } } });
store = null;
if (!DIAG) { const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; HA[q] /= r; LA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), qqqI = SY.get('QQQ'), tSplit = D.findIndex(d => d >= SPLIT);
STATUS.price = { ok: T > 1000 && spyI !== undefined && tSplit > 300 && hlMissing < N * 0.01, sessions: T, from: D[0], to: D[T - 1], stocks: NS, xDays, hlMissing, qqq: qqqI !== undefined };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks, highs/lows missing on ' + hlMissing + ' rows, QQQ ' + (qqqI !== undefined ? 'present' : 'MISSING') + ')');
// liquid (main rows): close >= 5 USD and 20-session average traded value >= 5M USD; SPY and QQQ excluded
const LIQ = new Uint8Array(N);
for (let i = 0; i < NS; i++) { if (i === spyI || i === qqqI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN; if (isFinite(w)) { s -= w; n--; } }
    if (t >= 19 && n === 20 && CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqMemo = new Map(), liqList = (t) => { if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const everLiq = []; for (let i = 0; i < NS; i++) { for (let t = 0; t < T; t++) if (LIQ[i * T + t]) { everLiq.push(i); break; } }
const closeAt = (i, x, k) => { for (let q = x; q >= k; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1) return null; const e = OA[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const cMemo = new Map(); const ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
const sub = (A, i) => A.subarray(i * T, i * T + T), series = (i) => ({ o: sub(OA, i), h: sub(HA, i), l: sub(LA, i), c: sub(CA, i), v: sub(VA, i) });
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';

// ================= 2. SIGNALS AND TRADES (every liquid stock, every rule; one open trade per stock per rule) =================
// TR[id] = [{ t, i, k, x, g, why }] closed trades; OPEN[id] = [{ t, i, plan, k }] still open at the newest close; SIGS[id] = signals of the
// newest session (entry at the next open)
const TR = {}, OPEN = {}, COUNTS = {}; for (const id of IDS) { TR[id] = []; OPEN[id] = []; COUNTS[id] = { signals: 0, trades: 0, open: 0, notFilled: 0 }; }
function runStock(P, liqAt, onTrade) { const I = indicators(P);
  for (const id of IDS) { let busy = -1;
    for (let t = 200; t < T; t++) { if (t <= busy || !liqAt(t)) continue; let plan = null; try { plan = signalAt(id, I, P, t); } catch (e) { plan = null; } if (!plan) continue;
      const s = simulate(P, t + 1, plan, closeExitFn(plan, I)); onTrade(id, t, plan, s);
      if (s === null) { busy = t + (plan.validFor || 0); continue; } if (s.open) { busy = T; continue; } busy = s.x; } } }
let done = 0; const tS = Date.now();
for (const i of everLiq) { const P = series(i);
  runStock(P, (t) => LIQ[i * T + t] === 1, (id, t, plan, s) => { COUNTS[id].signals++;
    if (s === null) { COUNTS[id].notFilled++; if (t + (plan.validFor || 0) >= T) OPEN[id].push({ t, i, plan, k: null }); return; }
    if (s.open) { COUNTS[id].open++; OPEN[id].push({ t, i, plan, k: s.k ?? t + 1, entry: s.entry ?? null }); return; }
    COUNTS[id].trades++; TR[id].push({ t, i, k: s.k, x: s.x, g: capG(s.g), why: s.why, entry: s.entry, exit: s.exit }); });
  if (++done % 1000 === 0) log('stocks ' + done + '/' + everLiq.length + ' (' + ((Date.now() - tS) / 1000).toFixed(0) + 's)'); }
log('signals: ' + IDS.map(id => id + ' ' + COUNTS[id].trades + ' trades').join(', '));
STATUS.signals = { ok: true, everLiquid: everLiq.length, counts: COUNTS };
if (DIAG) { fs.writeFileSync('data/squad9-diag.json', JSON.stringify({ generatedAt: new Date().toISOString(), data: STATUS }, null, 1)); console.log('SQUAD 9 DIAG ' + JSON.stringify(STATUS).slice(0, 2000)); process.exit(0); }

// ================= 3. 5-YEAR ONE-SHOT =================
const need = IDS.filter(id => !FROZEN[id]); log('5-year one-shot for ' + need.length + ' rules not yet frozen');
const RES = {};
function judged(id) { const tr = TR[id], hold = RULES[id].maxHold, spans = new Map(); for (const z of tr) (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, z.x]);
  const ownMemo = new Map(), rows = [];
  for (const z of tr) { const c = ctrlSpan(z.k, z.x); if (c === null) continue; const half = halfOf(D[z.t]), len = z.x - z.k + 1, key = z.i + '|' + len + '|' + half;
    if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 253, to: T - 1, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === half, ret: (u, x) => ret(z.i, u, x) }));
    rows.push({ t: z.t, s: SYMS[z.i], g: z.g, c, own: ownMemo.get(key), half, why: z.why, k: z.k, x: z.x }); }
  const R = { older: halfStat(rows.filter(z => z.half === 'older'), hold), newer: halfStat(rows.filter(z => z.half === 'newer'), hold), all: halfStat(rows, hold) };
  const shape = (a) => ({ ...tradeStats(a.map(z => z.g)), exits: a.reduce((m, z) => (m[z.why] = (m[z.why] || 0) + 1, m), {}), avgSessions: r4(mean(a.map(z => z.x - z.k + 1)) ?? NaN) });
  const byYear = {}; for (const z of rows) { const y = D[z.t].slice(0, 4); (byYear[y] = byYear[y] || []).push(z.g); }
  return { ...judge(R, { bar: BAR }), results: R, hold, shape: { older: shape(rows.filter(z => z.half === 'older')), newer: shape(rows.filter(z => z.half === 'newer')), all: shape(rows) },
    byYear: Object.fromEntries(Object.entries(byYear).sort().map(([y, g]) => [y, tradeStats(g)])), label: RULES[id].label, split: SPLIT, cost: COST,
    trades: rows.slice(-300).map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], net: r4(z.g - COST), avgStock: r4(z.c - COST), why: z.why })) }; }
for (const id of [...new Set([...need, ...(env.HISTORY ? IDS : [])])]) { RES[id] = judged(id); const R = RES[id].results;
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + RES[id].why.slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
if (!STATUS.price.ok) log('price data incomplete (' + JSON.stringify(STATUS.price) + '): nothing is frozen this run');
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k) && STATUS.price.ok).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), (r) => r && r.verdict);

// ================= 4. CHANNEL STYLE: the rule on SPY alone and on QQQ alone (information) =================
const ETF = {};
// a fund the whole-market cache does not carry (QQQ: the Sunday cache keeps SPY only) -> its own daily bars from Massive (information only)
async function fundSeries(sym, idx) { const have = idx === undefined ? 0 : sub(CA, idx).filter(x => x > 0).length; if (have >= T * 0.95) return series(idx);
  const j = await api('/v2/aggs/ticker/' + sym + '/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000'), rows = j && Array.isArray(j.results) ? j.results : [];
  const P = { o: new Float64Array(T).fill(NaN), h: new Float64Array(T).fill(NaN), l: new Float64Array(T).fill(NaN), c: new Float64Array(T).fill(NaN), v: new Float64Array(T).fill(NaN) }; let n = 0;
  for (const r of rows) { const t = tOf.get(iso(r.t + 12 * 36e5)); if (t === undefined) continue; P.o[t] = r.o; P.h[t] = r.h; P.l[t] = r.l; P.c[t] = r.c; P.v[t] = r.v; n++; }
  log(sym + ': ' + have + ' sessions in the cache, ' + n + ' fetched from Massive'); return n >= T * 0.95 ? P : null; }
for (const [sym, idx] of [['SPY', spyI], ['QQQ', qqqI]]) { const P = await fundSeries(sym, idx); if (!P) { ETF[sym] = null; continue; } const got = {}; for (const id of IDS) got[id] = [];
  runStock(P, () => true, (id, t, plan, s) => { if (s && !s.open) got[id].push({ t, g: s.g, k: s.k, x: s.x }); });
  const bh = (a, b) => { const x = P.o[a], y = P.c[b]; return x > 0 && y > 0 ? r4(y / x - 1) : null; }, lastOld = tSplit - 1;
  ETF[sym] = { buyHold: { older: bh(200, lastOld), newer: bh(tSplit, T - 1), note: 'buy at the open of session 200 (the first session any rule can signal) / of the first 2024 session, sell at the last close of the half' }, rules: {} };
  for (const id of IDS) { const a = got[id], H = (h) => a.filter(z => halfOf(D[z.t]) === h).map(z => z.g);
    ETF[sym].rules[id] = { all: { at08: tradeStats(a.map(z => z.g)), at01: tradeStats(a.map(z => z.g), 0.001) }, older: { at08: tradeStats(H('older')), at01: tradeStats(H('older'), 0.001) }, newer: { at08: tradeStats(H('newer')), at01: tradeStats(H('newer'), 0.001) },
      daysInMarket: a.reduce((s, z) => s + z.x - z.k + 1, 0) }; } }
log('channel style: ' + Object.entries(ETF).map(([s, e]) => s + (e ? ' ok' : ' missing')).join(', '));

// claim vs ours (plain English, for the owner)
const CLAIMS = {}; for (const id of IDS) { const r = RULES[id], fr = firstRun[id] || RES[id], sh = fr && fr.shape ? fr.shape.all : null, e = (s) => ETF[s] && ETF[s].rules[id];
  CLAIMS[id] = { channel: r.channel, video: r.video, label: r.label, claim: r.claim, ours: fr ? { verdict: fr.verdict, wholeMarket: sh, older: fr.shape.older, newer: fr.shape.newer, line: verdictLine(r.claim, sh) } : null,
    spy: e('SPY') ? { at08: e('SPY').all.at08, at01: e('SPY').all.at01, older01: e('SPY').older.at01, newer01: e('SPY').newer.at01 } : null, qqq: e('QQQ') ? { at08: e('QQQ').all.at08, at01: e('QQQ').all.at01, older01: e('QQQ').older.at01, newer01: e('QQQ').newer.at01 } : null }; }

// ================= 5. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigIds = new Set(lines.filter(x => x.type === 'signal').map(x => x.id)), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), newLines = [];
const tStart = D.findIndex(d => d >= START), lastT = T - 1;
const planText = (plan, close) => plan.limit ? 'buy limit ' + r4(plan.limit) + ' for ' + plan.validFor + ' sessions; stop ' + r4(plan.stopPx) + ', target ' + r4(plan.tpPx) + ', max ' + plan.maxHold + ' sessions'
  : 'buy at the next open; ' + (plan.stopDist ? 'stop about ' + (100 * plan.stopDist / close).toFixed(1) + '% under the entry' : 'no stop') + (plan.tp1R ? ', sell half at ' + plan.tp1R + 'R then break-even' : '') + (plan.tpR ? ', target ' + plan.tpR + 'R' : '') + (plan.closeExit ? ', exit on ' + (plan.closeExit === 'ssl' ? 'the SSL cross down' : 'the close back at the Kalman mean') : '') + ', max ' + plan.maxHold + ' sessions';
if (tStart >= 0) for (const id of IDS) {
  const mk = (t, i, plan) => ({ type: 'signal', id: id + '|' + SYMS[i] + '|' + D[t], m: id, sym: SYMS[i], d: D[t], close: r4(CA[i * T + t]), halal: halal(SYMS[i]), hold: RULES[id].maxHold, plan: planText(plan, CA[i * T + t]), recordedAfter: D[lastT], late: t < lastT });
  const plans = new Map(); for (const z of TR[id]) if (z.t >= tStart) plans.set(z.i + '|' + z.t, z); for (const z of OPEN[id]) if (z.t >= tStart) plans.set(z.i + '|' + z.t, z);
  for (const z of plans.values()) { const P = series(z.i), line = mk(z.t, z.i, z.plan || signalAt(id, indicators(P), P, z.t) || { maxHold: RULES[id].maxHold });
    if (!sigIds.has(line.id)) { sigIds.add(line.id); newLines.push(line); }
    if (z.x !== undefined && !resolved.has(line.id)) { const c = ctrlSpan(z.k, z.x); resolved.add(line.id); newLines.push({ type: 'result', id: line.id, m: id, sym: line.sym, d: line.d, buy: D[z.k], sell: D[z.x], g: r4(z.g), net: r4(z.g - COST), avgStock: c === null ? null : r4(c - COST), why: z.why }); } } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
const all = [...lines, ...newLines], board = {}, today = {};
for (const id of IDS) { const sig = all.filter(x => x.type === 'signal' && x.m === id), res = all.filter(x => x.type === 'result' && x.m === id), st = boardStats(res.map(x => ({ g: x.g, c: x.avgStock === null ? null : x.avgStock + COST, d: x.d }))), fr = firstRun[id];
  board[id] = { name: RULES[id].name, channel: RULES[id].channel, hold: RULES[id].maxHold, signals: sig.length, closed: st, ready: paperReady(st), fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  today[id] = { name: RULES[id].name, hold: RULES[id].maxHold, tier: fr ? fr.verdict : null, newSignals: sig.filter(x => x.d === D[lastT]).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan })) }; }
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, note: 'PAPER ONLY. Squad 9 (YouTube strategy testers) rules recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a frozen 5-year verdict that meets the TRY SMALL standard (data/squad9-lab.json firstRun). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.filter(x => x.type === 'signal').length + ' new signals, ' + newLines.filter(x => x.type === 'result').length + ' new results');

// ================= 6. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'squad9-core.mjs RULES (24 Oct 2026, before any run) + data/strategy-library.json SQ9-*', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock over the same entry-to-exit sessions (capped at +300% like the rule, AUD-1), better than the same stock on its other days, > 0 without the 2 best, block t >= ' + TIER2_T + ' (blocks = the rule\'s max hold) -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN',
  timeframeNote: 'Every channel rule was published for 1-minute to 1-hour crypto / forex charts; here they run on DAILY bars of US stocks (the replication label of each rule says how close that is). Intraday 1-minute SIP bars were not used: none of the 10 rules is a US-stock session method.',
  research: { channels: ['https://youtube.com/@daviddtech', 'https://youtube.com/@themovingaverage', 'https://youtube.com/@quantguild'], tested: IDS.map(id => ({ id, channel: RULES[id].channel, ...RULES[id].video, label: RULES[id].label, claim: RULES[id].claim })), notTested: SOURCES },
  claimVsOurs: CLAIMS, channelStyle: ETF, firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + ' (squad 9, daily bars); forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'squad9-lab.mjs -> data/squad9-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: [R.older.win, R.newer.win], why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad9-lab: library not updated: ' + e.message); }
console.log('SQUAD 9 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + Object.entries(STATUS).map(([k, s]) => k + (s.ok ? ' ok' : ' MISSING')).join(', '));
