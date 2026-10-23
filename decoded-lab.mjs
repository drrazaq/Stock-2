// DECODED LAB (23 Oct 2026; owner: "study how people won on past trades and try to implement them on future trades; don't fixate on
// passing all the tests"). Research + a FORWARD PAPER lane; never places an order; no Telegram. Rules: decoded-core.mjs (pre-registered
// in its header and in the library entries DEC-QBO, DEC-EP, DEC-MB, DEC-VCP, DEC-PB, DEC-FROG, DEC-CRASH).
// 1. PRICES: the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY, dead stocks' later prices in
//    its x rows) + the sessions since that run, fetched here from Massive's grouped daily bars (same filters as leaders-study.mjs: common
//    stocks / ADRs on its ticker list, main rows 3 USD+ and 1M USD+ traded) + splits executed since the cache day (same jump check) + QQQ
//    daily bars (the Kullamagi market filter). Nothing is saved back to the cache.
// 2. PAPER LANE (every weekday after the close): every session from 23 Oct 2026 on is scanned once; each new signal is appended to
//    data/decoded-paper.jsonl (signal day, the frozen trigger / stop numbers, the owner's ZAD halal mark); every signal is then re-walked
//    with its method's own entry and exit on the newest prices, and a result line is appended once when it resolves. Writes
//    data/decoded-today.json (new signals, pending buy-stops, open trades) and data/decoded-board.json (per method, after 0.8% cost:
//    trades, distinct days, distinct stocks, win rate, average, average win, average loss, profit factor; TRY SMALL readiness = 30+
//    trades on 10+ days with a positive average).
// 3. 5-YEAR ONE-SHOT (only for methods not yet frozen, or HISTORY=1 for monitoring): every signal of the 5 years with the same entries and
//    exits, judged at the system's tier-2 standard (value-core.mjs judge: both halves = signals before / from 2024-01-01, positive after
//    0.8% and 1.2%, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its other
//    days, positive without its 2 best, block t >= 2.5; PROVEN at the proof bar) + DEC-CRASH's control gate. First complete verdict
//    frozen (first-run.mjs freezeEach) in data/decoded-history.json; information only: it does NOT block the paper lane.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, r4, TIER2_T } from './value-core.mjs';
import { METHODS, COST, indicators, liquid, regimeUp, aboveSma, rsScore, detectQBO, detectEP, detectMB, detectVCP, detectPB, detectCrash, crashControl,
  frogRow, frogPick, simulate, boardStats, trySmallReady } from './decoded-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const START = env.PAPER_START || '2026-10-23', SPLIT = '2024-01-01', PAPER = 'data/decoded-paper.jsonl', TODAY = 'data/decoded-today.json', BOARD = 'data/decoded-board.json', HIST = 'data/decoded-history.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const IDS = Object.keys(METHODS), t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
fs.mkdirSync('data', { recursive: true });
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { store = null; }
if (!store || !store.days) { console.log('decoded-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
// ---- Massive (paid plan), same call pattern as leaders-study.mjs; the key is only read from the environment, never printed
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 150); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403) return { refused: true };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
// ---- 1. fresh sessions since the cache day
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(); let fresh = [];
for (let ms = Date.parse(cacheLast) + 864e5; ms <= Date.now(); ms += 864e5) { const d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions fetched: ' + (fresh.join(', ') || 'none') + (env.MASSIVE_KEY ? '' : ' (no MASSIVE_KEY)'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), H = new Float32Array(N).fill(NaN), L = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN);
const MAIN = new Uint8Array(N);   // 1 = a main (qualifying) row: entries only from these
D.forEach((d, t) => { const x = store.days[d]; const put = (r, main) => { for (let j = 0; j < r.T.length; j++) { const i = SY.get(r.T[j]); if (i === undefined) continue; const k = i * T + t; if (!main && MAIN[k]) continue;
    O[k] = r.o[j]; H[k] = r.h ? r.h[j] : r.c[j]; L[k] = r.l ? r.l[j] : r.c[j]; C[k] = r.c[j]; V[k] = r.v[j]; if (main) MAIN[k] = 1; } };
  put(x, true); if (x.x) put(x.x, false); });
store = null;
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS);
// ---- splits since the cache day (Massive's official split list): repair rows before the split when the price jump matches the ratio
const splitList = (J('data/splits.json', {}).splits || []).slice();
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'); const rows = j && Array.isArray(j.results) ? j.results : [];
  let fixed = 0; for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f; splitList.push({ s, d, r }); const i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue;
    let pre = null, post = null; for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; H[q] /= r; L[q] /= r; C[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const splitFactor = (sym, after) => splitList.filter(z => z.s === sym && z.d > after && z.d <= D[T - 1]).reduce((a, z) => a * z.r, 1);
// ---- market context per session
const series = (i) => { const b = i * T; return { o: O.subarray(b, b + T), h: H.subarray(b, b + T), l: L.subarray(b, b + T), c: C.subarray(b, b + T), v: V.subarray(b, b + T) }; };
const spyI = SY.get('SPY'), spyC = spyI !== undefined ? series(spyI).c : new Float32Array(T).fill(NaN);
const qqq = new Float64Array(T).fill(NaN); let qqqSrc = 'QQQ (Massive daily bars)';
{ const j = await api('/v2/aggs/ticker/QQQ/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000');
  if (j && Array.isArray(j.results)) for (const b of j.results) { const t = tOf.get(iso(b.t)); if (t !== undefined) qqq[t] = b.c; }
  if (!(qqq.filter(x => x > 0).length > T * 0.9)) { qqqSrc = 'SPY (QQQ bars not available this run)'; for (let t = 0; t < T; t++) qqq[t] = spyC[t]; } }
const REG = new Uint8Array(T), SPYUP = new Uint8Array(T), BR = new Float64Array(T).fill(NaN);
for (let t = 0; t < T; t++) { REG[t] = regimeUp(qqq, t) ? 1 : 0; SPYUP[t] = aboveSma(spyC, t, 50) ? 1 : 0; }
{ const up = new Float64Array(T), dn = new Float64Array(T); for (let i = 0; i < NS; i++) { const b = i * T; for (let t = 1; t < T; t++) { const k = b + t; if (!MAIN[k] || !(C[k] >= 5) || !(V[k] >= 1e5) || !(C[k - 1] > 0)) continue; const r = C[k] / C[k - 1] - 1; if (r >= 0.04) up[t]++; else if (r <= -0.04) dn[t]++; } }
  for (let t = 9; t < T; t++) { let u = 0, d = 0; for (let k = t - 9; k <= t; k++) { u += up[k]; d += dn[k]; } BR[t] = d > 0 ? u / d : u > 0 ? 9 : NaN; } }
log('QQQ regime from ' + qqqSrc + '; regime up on ' + REG.reduce((a, x) => a + x, 0) + ' of ' + T + ' sessions');
// ---- pass 1: liquidity flags, relative strength percentile, frog rows on formation days (first session of each month)
const LIQ = new Uint8Array(N), RS = new Float32Array(N).fill(NaN), RSP = new Float32Array(N).fill(NaN);
const FORM = new Set(); for (let t = 1; t < T; t++) if (D[t].slice(0, 7) !== D[t - 1].slice(0, 7)) FORM.add(t);
const frogRows = new Map(); for (const t of FORM) frogRows.set(t, []);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const S = series(i), I = indicators(S), b = i * T;
  for (let t = 0; t < T; t++) { if (!MAIN[b + t] || !liquid(S, I, t)) continue; LIQ[b + t] = 1; RS[b + t] = rsScore(S.c, t); if (FORM.has(t)) { const f = frogRow(S, I, t); if (f) frogRows.get(t).push({ key: i, ...f }); } } }
for (let t = 252; t < T; t++) { const v = []; for (let i = 0; i < NS; i++) { const k = i * T + t; if (LIQ[k] && isFinite(RS[k])) v.push([i, RS[k]]); } v.sort((a, b) => a[1] - b[1]); v.forEach(([i], j) => { RSP[i * T + t] = v.length > 1 ? j / (v.length - 1) : NaN; }); }
const FROG = new Map(); for (const [t, rows] of frogRows) if (rows.length >= 100) FROG.set(t, new Set(frogPick(rows, 0.3, 30).map(x => x.key)));
log('pass 1 done: liquidity, relative strength, ' + FROG.size + ' frog formations');
// ---- the detectors, one call per method
const detect = (id, S, I, i, t) => { const k = i * T + t; if (!MAIN[k]) return null;
  switch (id) { case 'DEC-QBO': return detectQBO(S, I, t, { regime: REG[t] === 1 }); case 'DEC-EP': return detectEP(S, I, t); case 'DEC-MB': return detectMB(S, I, t, { breadth: BR[t] });
    case 'DEC-VCP': return detectVCP(S, I, t, { spyUp: SPYUP[t] === 1, rsPct: RSP[k] }); case 'DEC-PB': return detectPB(S, I, t); case 'DEC-CRASH': return detectCrash(S, I, t);
    case 'DEC-FROG': return FROG.has(t) && FROG.get(t).has(i) ? { entry: 'open', info: { formation: D[t] } } : null; } return null; };
// halal marks (owner's ZAD list)
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';

// ================= 2. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const scanned = new Set(lines.filter(x => x.type === 'day').map(x => x.d)), signals = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id));
const scale = (sig, f) => { if (f === 1) return sig; const s = { ...sig }; for (const k of ['trigger', 'cancelBelow', 'stop', 'base']) if (typeof s[k] === 'number') s[k] = s[k] / f; return s; };
const walk = (x) => { const i = SY.get(x.sym), t = tOf.get(x.d); if (i === undefined || t === undefined) return { state: 'unknown', why: 'no prices for the signal day' };
  const S = series(i); return { ...simulate(METHODS[x.m].engine, S, indicators(S), t, scale(x.sig, splitFactor(x.sym, x.d))), t }; };
const busy = new Map();   // m|sym -> index until which a new signal is not taken (pending order or open trade)
for (const x of signals) { const r = walk(x), key = x.m + '|' + x.sym; const until = r.state === 'pending' || r.state === 'open' ? Infinity : r.state === 'closed' ? r.x : -1; busy.set(key, Math.max(busy.get(key) ?? -1, until)); }
const toScan = []; for (let t = 0; t < T; t++) if (D[t] >= START && !scanned.has(D[t])) toScan.push(t);
const newLines = [];
if (toScan.length) { for (let i = 0; i < NS; i++) { if (i === spyI) continue; let S = null, I = null;
    for (const t of toScan) { if (!MAIN[i * T + t]) continue; if (!S) { S = series(i); I = indicators(S); }
      for (const m of IDS) { const key = m + '|' + SYMS[i]; if ((busy.get(key) ?? -1) >= t) continue; const sig = detect(m, S, I, i, t); if (!sig) continue;
        const { info, ...rest } = sig; const line = { type: 'signal', id: m + '|' + SYMS[i] + '|' + D[t], m, sym: SYMS[i], d: D[t], close: r4(S.c[t]), sig: Object.fromEntries(Object.entries(rest).map(([k, v]) => [k, typeof v === 'number' ? r4(v) : v])), info, halal: halal(SYMS[i]),
          market: { qqqUp: REG[t] === 1, spyAbove50: SPYUP[t] === 1, breadth10: r4(BR[t]) }, entryPlan: rest.entry === 'stop' ? 'buy-stop at ' + r4(rest.trigger) + ' for ' + rest.valid + ' sessions' : 'buy at the next open' };
        newLines.push(line); signals.push(line); const r = walk(line); busy.set(key, r.state === 'pending' || r.state === 'open' ? Infinity : r.state === 'closed' ? r.x : t); } } }
  for (const t of toScan) newLines.push({ type: 'day', d: D[t], signals: newLines.filter(x => x.type === 'signal' && x.d === D[t]).length }); }
// resolve every signal on the newest prices
const live = [], board = {}, today = {};
for (const x of signals) { const r = walk(x); live.push({ x, r });
  if (['closed', 'cancelled', 'expired', 'skipped'].includes(r.state) && !resolved.has(x.id)) { resolved.add(x.id);
    newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, state: r.state, why: r.why || null, ...(r.state === 'closed' ? { buy: D[r.k], fill: r4(r.fill), sell: D[r.x], g: r4(r.g), net: r4(r.g - COST), legs: r.legs.map(([j, q, p, w]) => [D[j], q, p, w]) } : {}) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
const HISTF = J(HIST, {});
for (const m of IDS) { const mine = live.filter(z => z.x.m === m), closed = mine.filter(z => z.r.state === 'closed').map(z => ({ d: z.x.d, sym: z.x.sym, g: z.r.g, halal: z.x.halal }));
  const all = boardStats(closed), ok = boardStats(closed.filter(z => z.halal === 'ok')), fr = (HISTF.firstRun || {})[m];
  board[m] = { name: METHODS[m].name, who: METHODS[m].who, engine: METHODS[m].engine, signals: mine.length, pending: mine.filter(z => z.r.state === 'pending').length, open: mine.filter(z => z.r.state === 'open').length,
    cancelledOrExpired: mine.filter(z => ['cancelled', 'expired', 'skipped'].includes(z.r.state)).length, closed: all, halalOk: ok, trySmallReady: trySmallReady(all), trySmallReadyHalal: trySmallReady(ok),
    openMarkAvg: r4(mean(mine.filter(z => z.r.state === 'open').map(z => z.r.g - COST)) ?? NaN),
    closedPlusOpenMarked: boardStats([...closed, ...mine.filter(z => z.r.state === 'open').map(z => ({ d: z.x.d, sym: z.x.sym, g: z.r.g }))]),
    note: 'trend methods close their losers first (tight stops) and keep winners open; read closed together with closedPlusOpenMarked', fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  const lastD = D[T - 1];
  today[m] = { newSignals: mine.filter(z => z.x.d === lastD).map(z => ({ sym: z.x.sym, halal: z.x.halal, close: z.x.close, plan: z.x.entryPlan, stop: z.x.sig.stop ?? z.x.sig.base ?? null, info: z.x.info })),
    pendingBuyStops: mine.filter(z => z.r.state === 'pending' && z.x.d < lastD).map(z => ({ sym: z.x.sym, halal: z.x.halal, since: z.x.d, trigger: z.x.sig.trigger, cancelBelow: z.x.sig.cancelBelow })),
    open: mine.filter(z => z.r.state === 'open').map(z => ({ sym: z.x.sym, halal: z.x.halal, signal: z.x.d, buy: D[z.r.k], fill: r4(z.r.fill), last: r4(z.r.mark), sinceBuy: r4(z.r.g), held: r4(z.r.held), stop: r4(z.r.stop), note: z.r.why })) }; }
const lastD = D[T - 1];
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: lastD, paperStart: START, market: { qqqUp: REG[T - 1] === 1, qqqSource: qqqSrc, spyAbove50: SPYUP[T - 1] === 1, breadth10: r4(BR[T - 1]) },
  note: 'PAPER ONLY. Decoded trader methods recording live from 26 Oct 2026. Nothing here is a buy until a method has 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost (then the TRY SMALL lane may consider it). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.',
  methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: lastD, paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: scanned ' + toScan.length + ' new session(s) (' + toScan.map(t => D[t]).join(', ') + '); ' + newLines.filter(x => x.type === 'signal').length + ' new signals; ' + signals.length + ' signals in all');
for (const m of IDS) { const b = board[m]; console.log('- ' + m + ': signals ' + b.signals + ', pending ' + b.pending + ', open ' + b.open + ', closed ' + b.closed.n + ' avg ' + pc(b.closed.avg) + ' | today ' + today[m].newSignals.map(z => z.sym + (z.halal === 'ok' ? '' : '(' + z.halal + ')')).join(' ')); }

// ================= 3. 5-YEAR ONE-SHOT =================
const LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0);
const need = IDS.filter(m => !(HISTF.firstRun || {})[m]);
if (!need.length && !env.HISTORY) { log('5-year one-shot: every method frozen; skipped (HISTORY=1 for a monitoring run)'); process.exit(0); }
const HIST_END = T - 1, liqSample = []; for (let t = 0; t < T; t++) { const a = []; for (let i = 0; i < NS; i += 4) if (LIQ[i * T + t]) a.push(i); liqSample.push(a); }
// the average liquid stock (sampled every 4th) bought at the open of k and sold at the close of x
const cMemo = new Map(), ctrlSpan = (k, x) => { const key = k * 4096 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqSample[k - 1] || []) { const e = O[i * T + k]; let y = NaN; for (let q = x; q >= k && !(y > 0); q--) y = C[i * T + q]; if (e > 0 && y > 0 && Math.abs(y / e - 1) < 3) v.push(y / e - 1); }
  const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
const TR = Object.fromEntries(IDS.map(m => [m, []])), CTRL = [];
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const S = series(i), I = indicators(S), b = i * T, free = Object.fromEntries(IDS.map(m => [m, -1])), spans = [], mine = [];
  for (let t = 130; t < HIST_END; t++) { if (!MAIN[b + t]) continue;
    for (const m of need) { if (free[m] >= t) continue; const sig = detect(m, S, I, i, t); if (!sig) continue; const r = simulate(METHODS[m].engine, S, I, t, sig, HIST_END);
      if (r.state === 'pending' || r.state === 'open') { free[m] = Infinity; continue; } if (r.state !== 'closed') { free[m] = t + (sig.valid || 0); continue; } free[m] = r.x;
      const c = ctrlSpan(r.k, r.x); if (c === null) continue; const z = { t, s: SYMS[i], i, k: r.k, x: r.x, g: r.g, c, half: D[t] < SPLIT ? 'older' : 'newer', adr: sig.adr ?? I.adr20[t], qqqUp: REG[t] === 1 }; TR[m].push(z); mine.push(z); spans.push([r.k, r.x]); }
    if (need.includes('DEC-CRASH')) { const cs = crashControl(S, I, t); if (cs && MAIN[b + t]) { const r = simulate('CRASH', S, I, t, cs, HIST_END); if (r.state === 'closed') CTRL.push({ t, g: r.g, adr: cs.adr }); } } }
  // the same stock on its other days: open of u to close of u + len - 1, every 10th session where it was liquid the day before, away from its trades
  for (const z of mine) { const len = z.x - z.k + 1, v = [];
    for (let u = 131; u + len < HIST_END; u += 10) { if ((D[u] < SPLIT) !== (z.half === 'older') || !LIQ[b + u - 1] || spans.some(([a, e]) => u <= e && u + len >= a)) continue; const e = O[b + u], y = C[b + u + len - 1]; if (e > 0 && y > 0) v.push(y / e - 1); }
    z.own = v.length >= 3 ? mean(v) : null; } }
log('5-year signals walked: ' + need.map(m => m + ' ' + TR[m].length).join(', '));
const RES = {};
for (const m of need) { const tr = TR[m], blk = METHODS[m].block, R = { older: halfStat(tr.filter(z => z.half === 'older'), blk), newer: halfStat(tr.filter(z => z.half === 'newer'), blk), all: halfStat(tr, blk) }, extra = [];
  if (m === 'DEC-CRASH') { for (const h of ['older', 'newer']) { const a = [], b = []; for (const z of tr.filter(q => q.half === h)) { const cc = CTRL.filter(q => q.t === z.t && q.adr > 0 && z.adr > 0 && Math.abs(q.adr / z.adr - 1) <= 0.25); if (cc.length) { a.push(z.g); b.push(mean(cc.map(q => q.g))); } }
      R[h].vsControl = { n: a.length, rule: r4(mean(a) ?? NaN), control: r4(mean(b) ?? NaN) }; if (!(a.length && mean(a) > mean(b))) extra.push('not better than crashed stocks still making lower lows in the ' + h + ' half (' + pc(mean(a)) + ' vs ' + pc(mean(b)) + ', ' + a.length + ' matched)'); } }
  const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  const shape = { trades: tr.length, win: r4(w.length / (tr.length || 1)), avgWin: r4(mean(w) ?? NaN), avgLoss: r4(mean(l) ?? NaN), pf: l.length ? r4(sum(w) / -sum(l)) : null, avgSessions: r4(mean(tr.map(z => z.x - z.k + 1)) ?? NaN),
    qqqUp: halfStat(tr.filter(z => z.qqqUp), blk), qqqDown: halfStat(tr.filter(z => !z.qqqUp), blk), last6m: halfStat(tr.filter(z => D[z.t] >= iso(Date.parse(D[T - 1]) - 183 * 864e5)), blk),
    byYear: Object.fromEntries([...new Set(tr.map(z => D[z.t].slice(0, 4)))].sort().map(y => { const v = tr.filter(z => D[z.t].slice(0, 4) === y).map(z => z.g - COST); return [y, { n: v.length, avg: r4(mean(v)), win: r4(v.filter(x => x > 0).length / v.length) }]; })) };
  RES[m] = { ...judge(R, { bar: BAR, extra }), results: R, shape, block: blk, split: SPLIT, cost: COST, trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) }; }
const complete = T >= 1000 && qqqSrc.startsWith('QQQ'), strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(HISTF.firstRun, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[HIST_END]], bar: BAR, ...strip(r) }])), () => complete);
fs.writeFileSync(HIST, JSON.stringify({ generatedAt: new Date().toISOString(), preRegistered: 'decoded-core.mjs header + data/strategy-library.json DEC-* (23 Oct 2026, before any run)', window: [D[0], D[HIST_END]], bar: BAR, complete, qqqSource: qqqSrc,
  standard: 'both halves (signals before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its other days, > 0 without the 2 best, block t >= ' + TIER2_T + ' -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN',
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }), trades: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, r.trades.slice(-3000)])) }, null, 1));
console.log('DECODED 5-YEAR ONE-SHOT ' + D[0] + ' to ' + D[HIST_END] + ' | bar ' + BAR + (complete ? '' : ' | INCOMPLETE (nothing frozen)'));
for (const [m, r] of Object.entries(RES)) { const f = (h) => h.n + ' (' + h.days + ' days) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock;
  console.log('- ' + m + ': ' + r.verdict + ' | older ' + f(r.results.older) + ' | newer ' + f(r.results.newer) + ' | win ' + pc(r.shape.win) + ' avgWin ' + pc(r.shape.avgWin) + ' avgLoss ' + pc(r.shape.avgLoss) + ' pf ' + r.shape.pf + ' | ' + r.why); }
// library: the frozen verdict only (status stays the paper-lane status)
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const m of IDS) { const e = LB && LB.strategies.find(x => x.id === m), r = firstRun[m]; if (!e || !r || e.result) continue; const R = r.results;
    e.tested = String(r.window[1]); e.study = 'decoded-lab.mjs -> data/decoded-history.json (run once as written, first complete run frozen; information only, the paper lane runs regardless)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: r.shape.win, avgWin: r.shape.avgWin, avgLoss: r.shape.avgLoss, pf: r.shape.pf, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('decoded-lab: library not updated: ' + e.message); }
