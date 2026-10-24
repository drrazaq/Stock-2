// SQUAD 6 LAB (24 Oct 2026): traders and funds with public, multi-year records, decoded faithfully (squad6-core.mjs = the pre-registered
// rules, written before any run). Research + a FORWARD PAPER lane; never places an order; no Telegram.
// 1. DATA: the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY: open, high, low, close, volume;
//    dead stocks in its x rows) + the sessions since, from Massive's grouped daily bars + splits since the cache day (anomaly-lab pattern).
//    SPY from the cache (else Massive daily aggregates). Industry (REIT check) = the cache's SIC, else data/sec-ciks.json. Nothing saved back.
// 2. 5-YEAR ONE-SHOT for every SQ6 rule not yet frozen: every signal of the window with the rule's own entry and exit, judged at the tier-2
//    standard (value-core judge; halves = signal before / from 2024-01-01) with the rule and the yardstick capped at +300% alike (AUD-1).
//    First complete verdict frozen in data/squad6-lab.json firstRun (first-run.mjs freezeEach); later runs = monitoring (latest).
//    A trade whose path holds a near-whole 3x-50x one-day jump (an unadjusted split in the data) is left out, and so is such a stock in the
//    yardstick. Win rate, average win / loss, worst 5%, and newer-vs-older are reported next to the verdict.
// 3. PAPER LANE (from Monday 26 Oct 2026): every signal from then on is appended to data/squad6-paper.jsonl with its plan and the owner's
//    ZAD halal mark, and resolved with the same engine; data/squad6-today.json (methods[id].newSignals: signals of the newest close, to be
//    bought the next session) and data/squad6-board.json (closed paper trades after 0.8% cost vs the average stock).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { tradeG } from './yardstick.mjs';
import { halfStat, judge, TIER2_T } from './value-core.mjs';
import { ownAverage, nextSession } from './anomaly-core.mjs';
import { artifactJumps, hasArtifact } from './squad4-core.mjs';
import { RULES, IDS, COST, SPLIT, PAPER_START, mean, sd, r4, halfOf, smaArr, rsiArr, connorsRsiArr, adxArr, atrPctAt, clenowScore, maxAbsMove, clenowWeight, clenowStep, radgeStop,
  weeksOf, wednesdays, monthEnds, weekly, radgeEntry, threeWeeksTight, tdBuy9, crsiSetup, fip, mtumPick, qmomPick, topN, nextOpen, walkClose, walkFrom, fillOrder, isoWeek, walkBracket, yardOf,
  shape, newerVsOlder, boardStats, paperReady, preRegister } from './squad6-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', OFFLINE = !!env.OFFLINE;
const OUT = 'data/squad6-lab.json', PAPER = 'data/squad6-paper.jsonl', TODAY = 'data/squad6-today.json', BOARD = 'data/squad6-board.json', LIB = 'data/strategy-library.json', START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ6_MINUTES || 300) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};

// ================= 0. PRE-REGISTRATION in the library (before any computation; idempotent) =================
{ const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ6 entries pre-registered now'); }

// ================= 1. PRICES =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad6-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) { const x = store.days[d]; for (const s of x.T) if (!SY.has(s)) SY.set(s, SY.size); if (x.x) for (const s of x.x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const O = new Float32Array(N).fill(NaN), H = new Float32Array(N).fill(NaN), L = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN);
let withHL = 0, rowsAll = 0;
D.forEach((d, t) => { const x = store.days[d]; const put = (r, main) => { if (!r || !r.T) return; for (let j = 0; j < r.T.length; j++) { const q = SY.get(r.T[j]); if (q === undefined) continue; const k = q * T + t; if (!main && C[k] > 0) continue;
    O[k] = r.o ? r.o[j] : NaN; C[k] = r.c[j]; V[k] = r.v ? r.v[j] : NaN; H[k] = r.h ? r.h[j] : NaN; L[k] = r.l ? r.l[j] : NaN; rowsAll++; if (r.h && r.l && r.h[j] > 0) withHL++; } };
  put(x, true); put(x.x, false); });
const SIC = store.sic || {}; store = null;
if (!OFFLINE) { const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; H[q] /= r; L[q] /= r; C[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
// SPY: the cache's, else Massive's daily aggregates
let spyI = SY.get('SPY'), SPYB = null;
if ((spyI === undefined || [...Array(T).keys()].filter(t => C[spyI * T + t] > 0).length < T * 0.95) && !OFFLINE) { const j = await api('/v2/aggs/ticker/SPY/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000');
  if (j && Array.isArray(j.results)) { const tmp = new Map(j.results.map(b => [iso(b.t), b])); SPYB = D.map(d => tmp.get(d) || null); log('SPY from Massive daily aggregates: ' + SPYB.filter(Boolean).length + ' sessions'); } }
const ser = (A, i) => A.subarray(i * T, i * T + T);
const series = (i) => ({ o: ser(O, i), h: ser(H, i), l: ser(L, i), c: ser(C, i), v: ser(V, i) });
const SPYS = (() => { if (SPYB) { const b = SPYB, f = (k) => Float64Array.from(b.map(x => x ? x[k] : NaN)); return { o: f('o'), h: f('h'), l: f('l'), c: f('c'), v: f('v') }; } return spyI !== undefined ? series(spyI) : null; })();
STATUS.price = { ok: T >= 1000 && !!SPYS && withHL >= rowsAll * 0.9, sessions: T, from: D[0], to: D[T - 1], stocks: NS, rowsWithHighLow: r4(withHL / Math.max(1, rowsAll)) };
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS + ', rows with high/low ' + pc(withHL / Math.max(1, rowsAll)) + ', SPY ' + (SPYS ? 'ok' : 'MISSING'));
if (!STATUS.price.ok) console.log('Error: price data incomplete: ' + JSON.stringify(STATUS.price));
// liquidity (close 5+, 20-session average traded value 5M+), 63-session average traded value, last bar per stock
const LIQ = new Uint8Array(N), TV63 = new Float32Array(N).fill(NaN), LAST = new Int32Array(NS).fill(-1);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0, s6 = 0, n6 = 0;
  for (let t = 0; t < T; t++) { const v = C[b + t] * V[b + t]; if (C[b + t] > 0) LAST[i] = t;
    if (isFinite(v)) { s += v; n++; s6 += v; n6++; } if (t >= 20) { const w = C[b + t - 20] * V[b + t - 20]; if (isFinite(w)) { s -= w; n--; } } if (t >= 63) { const w = C[b + t - 63] * V[b + t - 63]; if (isFinite(w)) { s6 -= w; n6--; } }
    if (t >= 19 && n === 20 && C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; if (t >= 62 && n6 >= 57) TV63[b + t] = s6 / n6; } }
const liqAt = new Map(); const liqList = (t) => { if (t < 0) return []; if (!liqAt.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqAt.set(t, a); } return liqAt.get(t); };
const closeAt = (i, x) => { for (let q = Math.min(x, T - 1); q >= 0; q--) { const z = C[i * T + q]; if (z > 0) return z; } return null; };
const priceAt = (i, x, at) => { if (x > T - 1) return null; if (at === 'o') { const z = O[i * T + x]; if (z > 0) return z; return x > LAST[i] ? closeAt(i, x) : null; } return closeAt(i, x); };
const JUMPS = new Map(); const jumpsOf = (i) => { if (!JUMPS.has(i)) JUMPS.set(i, artifactJumps(ser(C, i))); return JUMPS.get(i); };
const yMemo = new Map(); const yard = (k, x, at) => { const key = k + '|' + x + '|' + at; if (yMemo.has(key)) return yMemo.get(key);
  const stocks = liqList(k - 1).filter(i => i % 2 === 0 && !hasArtifact(jumpsOf(i), k, x)); const m = yardOf(stocks, k, x, at, priceAt, 'capBoth', 50); yMemo.set(key, m); return m; };
const SECCIK = J('data/sec-ciks.json', {}), sicOf = (s) => { const x = SIC[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECCIK[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const W = weeksOf(D), WK = new Int32Array(T); W.forEach((w, n) => { for (let t = w.s; t <= w.e; t++) WK[t] = n; });
const LASTWEEK_DONE = isoWeek(nextSession(D[T - 1])) !== isoWeek(D[T - 1]), weekDone = (n) => n < W.length - 1 || LASTWEEK_DONE;   // the newest week counts once its last session is in
// month ends, plus the newest session when the next NYSE session is in a new month (the paper lane signals that same evening; the 5-year
// windows never reach the newest session, so this changes no judged trade)
const monthEndsLive = (months) => { const a = monthEnds(D, months), nx = nextSession(D[T - 1]); if (nx.slice(0, 7) !== D[T - 1].slice(0, 7) && months.includes(+D[T - 1].slice(5, 7)) && !a.includes(T - 1)) a.push(T - 1); return a; };
const SPY_SMA200 = SPYS ? smaArr(SPYS.c, 200) : null, SPYW = SPYS ? weekly(SPYS, W) : null, SPYW10 = SPYW ? smaArr(SPYW.c, 10) : null;
const spyWeekUp = (n) => SPYW && SPYW.c[n] > 0 && SPYW10[n] > 0 && SPYW.c[n] > SPYW10[n];

// ================= 2. SIGNALS AND TRADES PER RULE =================
// trade: { t (signal session), i, k (entry session), px0, x (exit session), at ('o' | 'c' | 'i'), px1, g, kind, days, w? } or { open: true, ... }
// signals (paper lane / today): { t, i, plan }
const TR = {}, SG = {}, NOTE = {}; for (const id of IDS) { TR[id] = []; SG[id] = []; NOTE[id] = { artifacts: 0, open: 0, notFilled: 0, skipped: 0 }; }
const add = (id, t, i, r, plan) => { if (D[t] >= START || t === T - 1) SG[id].push({ t, i, plan }); if (!r) { NOTE[id].notFilled++; return null; } if (r.pending) return null;
  if (r.open) { NOTE[id].open++; TR[id].push({ t, i, open: true, k: r.k, px0: r.px0 }); return r; }
  if (hasArtifact(jumpsOf(i), r.k, r.x)) { NOTE[id].artifacts++; return r; } TR[id].push({ t, i, ...r }); return r; };
const busy = (m, i, k) => (m.get(i) ?? -1) >= k;
// ---- daily rules: CRSIPB, CUMRSI, TD9 ----
{ const bC = new Map(), bU = new Map(), bT = new Map(); let done = 0;
  for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let any = false; for (let t = 0; t < T; t++) if (LIQ[b + t]) { any = true; break; } if (!any) continue;
    const S = series(i), last = LAST[i], crsi = connorsRsiArr(S.c), adx = adxArr(S.h, S.l, S.c, 10), rsi2 = rsiArr(S.c, 2), s200 = smaArr(S.c, 200);
    for (let t = 1; t < T; t++) { if (!LIQ[b + t]) continue;
      if (!busy(bC, i, t + 1) && crsiSetup(S, t, crsi, adx)) { const lim = S.c[t] * 0.96, f = fillOrder(S, t, last, T, 'limit', lim, 1);
        let r = null; if (f && f.open) r = { open: true, k: f.k, px0: null, pending: true }; else if (f) r = walkFrom(S, f.k, f.px, last, T, (j) => crsi[j] > 50, 60);
        add('SQ6-CRSIPB', t, i, r, 'limit buy at ' + lim.toFixed(2) + ' for the next session only; sell the next open after a close with ConnorsRSI > 50 (max 60 sessions)'); if (r) bC.set(i, r.open ? Infinity : r.x); }
      if (!busy(bU, i, t + 1) && S.c[t] > s200[t] && rsi2[t] + rsi2[t - 1] < 35) { const r = walkClose(S, t, last, T, (j) => rsi2[j] > 65, 60);
        add('SQ6-CUMRSI', t, i, r, 'buy the next open; sell the next open after a close with RSI(2) > 65 (max 60 sessions)'); if (r) bU.set(i, r.open ? Infinity : r.x); }
      if (!busy(bT, i, t + 1)) { const s = tdBuy9(S.c, S.l, t); if (s) { let r = null; const k = t + 1;
          if (k > T - 1) r = { open: true, k, px0: null, pending: true }; else if (S.o[k] > 0 && S.o[k] > s.low) r = walkBracket(S, k, S.o[k], last, T, s.low, null, 4); else NOTE['SQ6-TD9'].skipped++;
          if (r && !r.open) r.k = k; add('SQ6-TD9', t, i, r, 'buy the next open unless it opens at or under ' + s.low.toFixed(2) + '; stop ' + s.low.toFixed(2) + '; sell the close of the 4th session'); if (r) bT.set(i, r.open ? Infinity : r.x); } } }
    if (++done % 2000 === 0) log('daily rules: ' + done + ' stocks'); }
  log('daily rules: ' + ['SQ6-CRSIPB', 'SQ6-CUMRSI', 'SQ6-TD9'].map(id => id + ' ' + TR[id].length + ' trades').join(', ')); }
// ---- weekly rules: RADGE, 3WT ----
{ // relative-strength rank (126-session return) among liquid stocks at a session
  const rsMemo = new Map(); const rsPct = (t) => { if (rsMemo.has(t)) return rsMemo.get(t); const rows = []; for (const i of liqList(t)) { const a = C[i * T + t - 126], z = C[i * T + t]; if (t >= 126 && a > 0 && z > 0) rows.push([i, z / a - 1]); }
    rows.sort((x, y) => x[1] - y[1]); const m = new Map(); rows.forEach(([i], n) => m.set(i, rows.length > 1 ? n / (rows.length - 1) : 0.5)); rsMemo.set(t, m); return m; };
  const bR = new Map(), b3 = new Map();
  for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let any = false; for (let t = 0; t < T; t++) if (LIQ[b + t]) { any = true; break; } if (!any) continue;
    const S = series(i), last = LAST[i], wk = weekly(S, W), s50 = smaArr(S.c, 50), s200 = smaArr(S.c, 200);
    for (let n = 20; n < W.length; n++) { if (!weekDone(n)) continue; const t = W[n].e; if (!LIQ[b + t]) continue;
      // Radge
      if (!busy(bR, i, t + 1) && radgeEntry(wk.c, n) && spyWeekUp(n)) { const k = t + 1; let r;
        if (k > T - 1) r = { open: true, k, px0: null, pending: true }; else if (!(S.o[k] > 0)) r = null; else { const px0 = S.o[k]; let stop = null, hi = -Infinity; r = null;
          for (let m = WK[k]; m < W.length && !r; m++) { const e = W[m].e;
            if (e >= k + 503) { const x = Math.min(k + 503, T - 1); r = k + 503 > T - 1 ? { open: true, k, px0 } : { k, px0, x: k + 503, at: 'c', px1: closeAt(i, k + 503), kind: 'max' }; break; }
            if (k > last || W[m].s > last) { const ex = nextOpen(S, Math.max(k, last), last, T); r = ex ? { k, px0, x: ex.x, at: ex.at, px1: ex.px, kind: 'gone' } : { open: true, k, px0 }; break; }
            if (!weekDone(m)) { r = { open: true, k, px0 }; break; } if (!(wk.c[m] > 0)) continue; hi = Math.max(hi, wk.c[m]); stop = radgeStop(stop, hi, spyWeekUp(m));
            if (wk.c[m] < stop) { const ex = nextOpen(S, e, last, T); r = ex ? { k, px0, x: ex.x, at: ex.at, px1: ex.px, kind: ex.gone ? 'gone' : 'stop' } : { open: true, k, px0 }; } }
          if (!r) r = { open: true, k, px0 }; if (!r.open) { r.g = r.px1 / px0 - 1; r.days = r.x - k + 1; } }
        add('SQ6-RADGE', t, i, r, 'buy the next open; weekly review: sell the next open after a week close under the trailing stop (40% under the highest week close since entry, 10% when SPY is under its 10-week average)'); if (r) bR.set(i, r.open ? Infinity : r.x); }
      // 3 weeks tight
      if (!busy(b3, i, t + 1) && threeWeeksTight(wk.c, n) && S.c[t] > s50[t] && s50[t] > s200[t]) { const rp = rsPct(t).get(i); if (rp !== undefined && rp >= 0.70) {
          let hiP = -Infinity; for (let k = W[n - 2].s; k <= t; k++) if (S.h[k] > 0) hiP = Math.max(hiP, S.h[k]); if (isFinite(hiP)) { const lvl = hiP + 0.10, f = fillOrder(S, t, last, T, 'stop', lvl, 5); let r = null;
            if (f && f.open) r = { open: true, k: f.k, px0: null, pending: true }; else if (f) r = walkBracket(S, f.k, f.px, last, T, f.px * 0.92, f.px * 1.20, 63);
            add('SQ6-3WT', t, i, r, 'buy-stop at ' + lvl.toFixed(2) + ' valid 5 sessions; stop 8% under the fill, sell at +20%, else the close of session 63'); if (r) b3.set(i, r.open ? Infinity : r.x); else b3.set(i, t + 5); } } } } }
  log('weekly rules: RADGE ' + TR['SQ6-RADGE'].length + ', 3WT ' + TR['SQ6-3WT'].length + ' trades'); }
// ---- fund rules: MTUM, QMOM (formation at month ends) ----
const wkMemo = new Map(); const wkOf = (i) => { if (!wkMemo.has(i)) wkMemo.set(i, weekly(series(i), W).c); return wkMemo.get(i); };
const hold = (id, t, i, n, plan) => { const S = series(i), k = t + 1; let r; if (k > T - 1) r = { open: true, k, px0: null, pending: true }; else if (!(S.o[k] > 0)) r = null; else r = walkBracket(S, k, S.o[k], LAST[i], T, null, null, n); add(id, t, i, r, plan); };
{ for (const t of monthEndsLive([5, 11])) { if (t < 252) continue; const uni = topN(liqList(t).filter(i => C[i * T + t - 252] > 0).map(i => ({ key: i, v: TV63[i * T + t] })), 600);
    const nW = W.findIndex(w => w.e >= t), lastW = W[nW] && W[nW].e === t ? nW : nW - 1;
    const rows = uni.map(i => { const c = ser(C, i), a = c[t - 21], m12 = c[t - 252] > 0 && a > 0 ? a / c[t - 252] - 1 : null, m6 = c[t - 126] > 0 && a > 0 ? a / c[t - 126] - 1 : null, wc = wkOf(i), rr = [];
      for (let w = Math.max(1, lastW - 155); w <= lastW; w++) if (wc[w] > 0 && wc[w - 1] > 0) rr.push(wc[w] / wc[w - 1] - 1); const s = rr.length >= 52 ? sd(rr) * Math.sqrt(52) : null; return { key: i, m6, m12, vol: s }; });
    for (const i of mtumPick(rows, Math.ceil(uni.length * 0.20))) hold('SQ6-MTUM', t, i, 126, 'buy the next open; sell at the close of session 126 (next semi-annual review)'); }
  for (const t of monthEndsLive([2, 5, 8, 11])) { if (t < 252) continue; const uni = topN(liqList(t).filter(i => C[i * T + t - 252] > 0 && sicOf(SYMS[i]) !== '6798').map(i => ({ key: i, v: TV63[i * T + t] })), 1000);
    const rows = uni.map(i => { const c = ser(C, i), m = c[t - 21] > 0 && c[t - 252] > 0 ? c[t - 21] / c[t - 252] - 1 : null; return { key: i, m, fip: m === null ? null : fip(c, t - 251, t - 21, m) }; });
    for (const i of qmomPick(rows)) hold('SQ6-QMOM', t, i, 63, 'buy the next open; sell at the close of session 63 (next quarterly rebalance)'); }
  log('fund rules: MTUM ' + TR['SQ6-MTUM'].length + ', QMOM ' + TR['SQ6-QMOM'].length + ' trades'); }
// ---- Clenow (weekly portfolio) ----
{ const held = new Map(), info = { weeks: 0, indexOff: 0, maxHeld: 0, sumW: [] }, sma100 = new Map(), s100 = (i) => { if (!sma100.has(i)) sma100.set(i, smaArr(ser(C, i), 100)); return sma100.get(i); };
  for (const t of wednesdays(D)) { if (t < 200) continue; info.weeks++;
    const uni = topN(liqList(t).filter(i => C[i * T + t - 100] > 0).map(i => ({ key: i, v: TV63[i * T + t] })), 500);
    const ranked = []; for (const i of uni) { const c = ser(C, i), sc = clenowScore(c, t, 90); if (sc === null) continue; const S = series(i);
      ranked.push({ key: i, score: sc, pass: c[t] > s100(i)[t] && maxAbsMove(c, t, 90) < 0.15, w: clenowWeight(atrPctAt(S.h, S.l, S.c, t, 20)) }); }
    ranked.sort((a, b) => b.score - a.score); const idx = SPYS && SPYS.c[t] > SPY_SMA200[t]; if (!idx) info.indexOff++;
    // positions whose stock stopped trading leave at their last close
    const st = clenowStep(new Map([...held].map(([k, v]) => [k, v.w])), ranked, idx);
    for (const k of st.sells) { const p = held.get(k), S = series(k), ex = nextOpen(S, t, LAST[k], T); held.delete(k); if (!p.px0) continue;
      const r = ex ? { k: p.k, px0: p.px0, x: ex.x, at: ex.at, px1: ex.px, g: ex.px / p.px0 - 1, kind: ex.gone ? 'gone' : 'rule', days: ex.x - p.k + 1, w: p.w } : { open: true, k: p.k, px0: p.px0, w: p.w };
      if (r.open) { NOTE['SQ6-CLENOW'].open++; TR['SQ6-CLENOW'].push({ t: p.t, i: k, ...r }); } else if (hasArtifact(jumpsOf(k), r.k, r.x)) NOTE['SQ6-CLENOW'].artifacts++; else TR['SQ6-CLENOW'].push({ t: p.t, i: k, ...r }); }
    for (const bb of st.buys) { const k = t + 1, S = series(bb.key); if (D[t] >= START || t === T - 1) SG['SQ6-CLENOW'].push({ t, i: bb.key, plan: 'buy the next open (size ' + (bb.w * 100).toFixed(1) + '% of the account); weekly Wednesday review: sell when it leaves the top 20%, closes under its 100-day average or moves 15%+ in a day' });
      if (k > T - 1) { held.set(bb.key, { t, k, px0: null, w: bb.w }); continue; } if (!(S.o[k] > 0)) continue; held.set(bb.key, { t, k, px0: S.o[k], w: bb.w }); }
    info.maxHeld = Math.max(info.maxHeld, held.size); info.sumW.push([...held.values()].reduce((a, p) => a + p.w, 0)); }
  for (const [k, p] of held) if (p.px0) { NOTE['SQ6-CLENOW'].open++; TR['SQ6-CLENOW'].push({ t: p.t, i: k, open: true, k: p.k, px0: p.px0, w: p.w }); }
  NOTE['SQ6-CLENOW'].portfolio = { weeks: info.weeks, weeksIndexBelow200: info.indexOff, maxPositions: info.maxHeld, avgInvested: r4(mean(info.sumW)) };
  log('Clenow: ' + TR['SQ6-CLENOW'].length + ' positions, ' + JSON.stringify(NOTE['SQ6-CLENOW'].portfolio)); }

// ================= 3. 5-YEAR ONE-SHOT =================
const need = IDS.filter(id => !FROZEN[id]), RES = {};
const ownM = new Map();
function judged(id) { const blk = RULES[id].block, all = TR[id].filter(z => !z.open), spans = new Map(); for (const z of all) (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, z.x]);
  const tr = []; for (const z of all) { const g = tradeG(z.g, 'capBoth'); if (!isFinite(g)) continue; const c = yard(z.k, z.x, z.at === 'o' ? 'o' : 'c'); if (c === null) continue; const half = halfOf(D[z.t]), len = z.x - z.k + 1, key = z.i + '|' + len + '|' + half;
    if (!ownM.has(key)) ownM.set(key, ownAverage({ from: 253, to: T - 1, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === half, ret: (u, x) => { const e = O[z.i * T + u], y = closeAt(z.i, x); return e > 0 && y > 0 ? y / e - 1 : null; }, mode: 'capBoth' }));
    tr.push({ t: z.t, s: SYMS[z.i], i: z.i, k: z.k, x: z.x, g, c, own: ownM.get(key), half, days: z.days, kind: z.kind, w: z.w }); }
  return tr; }
for (const id of IDS) { if (left() < 10 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  if (!STATUS.price.ok) { RES[id] = { verdict: 'NOT RUN', why: 'price data incomplete: ' + JSON.stringify(STATUS.price) }; continue; }
  const tr = judged(id), blk = RULES[id].block, R = { older: halfStat(tr.filter(z => z.half === 'older'), blk), newer: halfStat(tr.filter(z => z.half === 'newer'), blk), all: halfStat(tr, blk) };
  const shp = { older: shape(tr.filter(z => z.half === 'older')), newer: shape(tr.filter(z => z.half === 'newer')), all: shape(tr) }, kinds = {}; for (const z of tr) kinds[z.kind] = (kinds[z.kind] || 0) + 1;
  RES[id] = { ...judge(R, { bar: BAR }), results: R, shape: shp, newerVsOlder: newerVsOlder(R), exits: kinds, notes: NOTE[id], block: blk, hold: blk, replication: RULES[id].replication, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1)',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], kind: z.kind, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + RES[id].why.slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; }, isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);

// ================= 4. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigIds = new Set(lines.filter(x => x.type === 'signal').map(x => x.id)), resIds = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), newLines = [];
const fromT = D.findIndex(d => d >= START), board = {}, today = {};
for (const id of IDS) { const mine = []; if (fromT >= 0) for (const s of SG[id]) { if (s.t < fromT) continue; const sym = SYMS[s.i], lid = id + '|' + sym + '|' + D[s.t];
    if (!sigIds.has(lid)) { sigIds.add(lid); newLines.push({ type: 'signal', id: lid, m: id, sym, d: D[s.t], close: r4(C[s.i * T + s.t]), halal: halal(sym), plan: s.plan, recordedAfter: D[T - 1] }); } mine.push(lid); }
  const closed = []; for (const z of TR[id]) { if (fromT < 0 || z.t < fromT || z.open) continue; const sym = SYMS[z.i], lid = id + '|' + sym + '|' + D[z.t], c = yard(z.k, z.x, z.at === 'o' ? 'o' : 'c');
    closed.push({ d: D[z.t], sym, g: z.g, c, halal: halal(sym) }); if (!resIds.has(lid)) { resIds.add(lid); newLines.push({ type: 'result', id: lid, m: id, sym, d: D[z.t], buy: D[z.k], sell: D[z.x], kind: z.kind, g: r4(z.g), net: r4(z.g - COST), avgStock: c === null ? null : r4(c - COST) }); } }
  const st = boardStats(closed), fr = firstRun[id];
  board[id] = { name: RULES[id].name, who: RULES[id].who, replication: RULES[id].replication, signals: mine.length, open: TR[id].filter(z => z.open && z.t >= fromT && fromT >= 0).length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: paperReady(st), fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  today[id] = { name: RULES[id].name, hold: RULES[id].block, tier: fr ? fr.verdict : null, newSignals: SG[id].filter(s => s.t === T - 1).map(s => ({ sym: SYMS[s.i], close: r4(C[s.i * T + s.t]), halal: halal(SYMS[s.i]), d: D[s.t], plan: s.plan })),
    open: TR[id].filter(z => z.open && fromT >= 0 && z.t >= fromT).map(z => ({ sym: SYMS[z.i], halal: halal(SYMS[z.i]), signal: D[z.t], buy: z.k <= T - 1 ? D[z.k] : null, sinceBuy: z.px0 ? r4(closeAt(z.i, T - 1) / z.px0 - 1) : null })) }; }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, note: 'PAPER ONLY. Squad 6 (public-record traders and fund rulebooks) recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a qualifying frozen 5-year verdict in BOTH halves (data/squad6-lab.json firstRun). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.filter(x => x.type === 'signal').length + ' new signals, ' + newLines.filter(x => x.type === 'result').length + ' new results');

// ================= 5. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'squad6-core.mjs header + RULES (24 Oct 2026, before any run) + data/strategy-library.json SQ6-*', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock bought and sold at the same moments (rule and yardstick capped at +300%, AUD-1), better than the same stock on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= ' + TIER2_T + ' -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN',
  rules: Object.fromEntries(IDS.map(id => [id, { name: RULES[id].name, who: RULES[id].who, replication: RULES[id].replication, sources: RULES[id].sources, rule: RULES[id].rule, deviations: RULES[id].deviations }])),
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-300)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'squad6-lab.mjs -> data/squad6-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: [R.older.win, R.newer.win], newerBetter: r.newerVsOlder && r.newerVsOlder.better, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad6-lab: library not updated: ' + e.message); }
console.log('SQUAD 6 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + IDS.map(id => id + ' ' + (firstRun[id] ? firstRun[id].verdict : (RES[id] || {}).verdict)).join(', '));
