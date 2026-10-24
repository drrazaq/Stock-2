// SQUAD 2 LAB (24 Oct 2026): the traders' setups executed the way they are traded, INSIDE the session, on 1-minute SIP bars.
// Rules: squad2-core.mjs (pre-registered in its header and in data/strategy-library.json before any run). Never places an order.
// MODES (env MODE or argv[2]):
//   plan   whole-market daily cache (study-cache/grouped.json.gz, READ ONLY) -> per session the stock-days each rule needs (only what is
//          known before that session + its open), QQQ regime (Alpaca daily bars), a probe of how far back Alpaca SIP minute history
//          goes -> squad2-work/plan.json.gz. If every rule is already frozen in data/squad2-lab.json the plan is empty (one-shot).
//   shard  SHARD=i of SHARDS=n: fetches the 1-minute bars of its sessions (Alpaca SIP, raw prices; cached per symbol-day in squad2-min/
//          <day>.json.gz), runs every rule on every session (squad2-core runDay) -> squad2-work/shard-i.json.gz.
//   judge  joins the shards, finishes swing trades on daily bars, matched controls, the same stock on other days, both halves,
//          value-core judge; first complete verdict per rule frozen (first-run.mjs freezeEach) in data/squad2-lab.json; library entries.
//   paper  forward paper lane from 26 Oct 2026: every new session is scanned once with the same code on that day's minute bars;
//          data/squad2-paper.jsonl, data/squad2-today.json, data/squad2-board.json. newSignals stay EMPTY: every SQ2 rule enters
//          intraday, and scan.mjs TRY SMALL places next-open orders only.
// Keys only from the environment (ALPACA_KEY / ALPACA_SECRET, MASSIVE_KEY for fresh daily sessions); never printed.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, TIER2_T } from './value-core.mjs';
import { leagueBar } from './league-bar.mjs';
import { indicators, detectQBO, regimeUp } from './decoded-core.mjs';
import { SETUPS, IDS, COST, STRESS, INFO_COST, SLIP, SPLIT, PAPER_START, r4, mean, halfOf, toNyBars, priceScale, runDay, dayFlags, universe, leaderScore,
  continueDaily, shape, boardStats, paperReady, preRegister, smaAt } from './squad2-core.mjs';
const env = process.env, MODE = env.MODE || process.argv[2] || 'paper', t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const WZ = (f, x) => fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(x))), sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const AD = local(env.ALPACA_DATA_BASE) || 'https://data.alpaca.markets', MV = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const WORK = env.SQ2_WORK || 'squad2-work', MDIR = env.SQ2_MIN || 'squad2-min', LAB = 'data/squad2-lab.json', PAPER = 'data/squad2-paper.jsonl', TODAY = 'data/squad2-today.json', BOARD = 'data/squad2-board.json', TRADES = 'data/squad2-trades.json.gz', LIB = 'data/strategy-library.json';
const LEADERS = 30;
fs.mkdirSync('data', { recursive: true }); fs.mkdirSync(WORK, { recursive: true }); fs.mkdirSync(MDIR, { recursive: true });

// ---------- network ----------
let aCalls = 0, aRefused = null, mCalls = 0;
const AH = { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' };
async function alp(path) { if (!env.ALPACA_KEY || !env.ALPACA_SECRET) { aRefused = 'ALPACA_KEY / ALPACA_SECRET not set'; return null; }
  for (let a = 0; a < 6; a++) { aCalls++; let r; try { r = await fetch(AD + path, { headers: AH, signal: AbortSignal.timeout(120000) }); } catch (e) { await sleep(2000 * (a + 1)); continue; }
    if (r.status === 429) { await sleep(3000 * (a + 1)); continue; } if (r.status === 401 || r.status === 403) { aRefused = 'HTTP ' + r.status + ' from Alpaca market data'; return null; }
    if (!r.ok) { if (r.status === 422 || r.status === 400) return { bad: r.status, text: (await r.text().catch(() => '')).slice(0, 200) }; await sleep(2000 * (a + 1)); continue; }
    return await r.json().catch(() => null); } return null; }
async function mv(path) { if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 4; a++) { if (mCalls) await sleep(local(env.MASSIVE_BASE) ? 0 : 150); mCalls++; let r;
    try { r = await fetch(MV + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401 || r.status === 403) return null; if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const nyMs = (day, min) => { const off = (() => { const h = +new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(day + 'T12:00:00Z')); return (h - 12) * 60; })(); return Date.parse(day + 'T00:00:00Z') + (min - off) * 60000; };
/** 1-minute regular-session bars of `syms` on `day` (Alpaca SIP, raw), cached per day file; returns Map sym -> rows (Alpaca shape) */
async function minuteDay(day, syms) {
  const f = MDIR + '/' + day + '.json.gz', C = JZ(f, { v: 1, b: {}, none: [] }), have = new Set([...Object.keys(C.b), ...C.none]), need = syms.filter(s => !have.has(s));
  let okAll = true;
  for (let i = 0; i < need.length; i += 100) { const chunk = need.slice(i, i + 100), got = new Map(); let tok = null, pages = 0, ok = true;
    do { const q = '/v2/stocks/bars?symbols=' + chunk.map(encodeURIComponent).join(',') + '&timeframe=1Min&start=' + new Date(nyMs(day, 570)).toISOString() + '&end=' + new Date(nyMs(day, 959)).toISOString() + '&adjustment=raw&feed=sip&sort=asc&limit=10000' + (tok ? '&page_token=' + encodeURIComponent(tok) : '');
      const j = await alp(q); if (!j || j.bad) { ok = false; break; } pages++; tok = j.next_page_token || null;
      for (const [s, arr] of Object.entries(j.bars || {})) { const a = got.get(s) || got.set(s, []).get(s); for (const x of arr) a.push([Date.parse(x.t), x.o, x.h, x.l, x.c, x.v, x.vw]); }
    } while (tok && pages < 400);
    if (ok && !tok) { for (const [s, a] of got) C.b[s] = a; for (const s of chunk) if (!got.has(s)) C.none.push(s); } else okAll = false; }   // a chunk is cached only when every page arrived
  if (need.length) WZ(f, C);
  const out = new Map(); for (const s of syms) if (C.b[s]) out.set(s, C.b[s].map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5], vw: r[6] })));
  return { bars: out, complete: okAll };
}

// ---------- the whole-market daily cache (+ fresh sessions in paper mode) ----------
async function loadDaily(fresh) {
  let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null); if (!store || !store.days) return null;
  const qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6, pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
  const CS = new Set(store.ref ? store.ref.syms : []), cacheLast = Object.keys(store.days).sort().pop(), freshDays = [];
  if (fresh) for (let ms = Date.parse(cacheLast) + 864e5; ms <= Date.now(); ms += 864e5) { const d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6) continue;
    const j = await mv('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || !Array.isArray(j.results) || !j.results.length) continue;
    const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
    store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; freshDays.push(d); }
  const D = Object.keys(store.days).sort(), T = D.length, SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
  const NS = SY.size, N = NS * T, O = new Float32Array(N).fill(NaN), H = new Float32Array(N).fill(NaN), L = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
  D.forEach((d, t) => { const x = store.days[d]; const put = (r, main) => { for (let j = 0; j < r.T.length; j++) { const i = SY.get(r.T[j]); if (i === undefined) continue; const k = i * T + t; if (!main && MAIN[k]) continue;
      O[k] = r.o[j]; H[k] = r.h ? r.h[j] : r.c[j]; L[k] = r.l ? r.l[j] : r.c[j]; C[k] = r.c[j]; V[k] = r.v[j]; if (main) MAIN[k] = 1; } }; put(x, true); if (x.x) put(x.x, false); });
  store = null;
  if (fresh && freshDays.length) { const j = await mv('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'); let fixed = 0;
    for (const x of (j && j.results) || []) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
      const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
      for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
      if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
      for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; H[q] /= r; L[q] /= r; C[q] /= r; V[q] *= r; } fixed++; }
    log('splits since ' + cacheLast + ': ' + fixed + ' repaired'); }
  const series = (i) => { const b = i * T; return { o: O.subarray(b, b + T), h: H.subarray(b, b + T), l: L.subarray(b, b + T), c: C.subarray(b, b + T), v: V.subarray(b, b + T) }; };
  log('daily cache ' + D[0] + ' to ' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks incl. dead ones); fresh: ' + (freshDays.join(', ') || 'none'));
  return { D, T, SY, SYMS: [...SY.keys()], NS, O, H, L, C, V, MAIN, series, tOf: new Map(D.map((d, t) => [d, t])), cacheLast };
}
async function qqqRegime(DL) {
  const { D, T } = DL, q = new Float64Array(T).fill(NaN); let src = 'QQQ (Alpaca SIP daily bars, all adjustments)';
  let tok = null, n = 0; do { const j = await alp('/v2/stocks/bars?symbols=QQQ&timeframe=1Day&start=' + D[0] + '&end=' + D[T - 1] + 'T23:59:59Z&adjustment=all&feed=sip&limit=10000' + (tok ? '&page_token=' + encodeURIComponent(tok) : ''));
    if (!j || j.bad) break; tok = j.next_page_token || null; for (const b of (j.bars && j.bars.QQQ) || []) { const t = DL.tOf.get(String(b.t).slice(0, 10)); if (t !== undefined) { q[t] = b.c; n++; } } } while (tok);
  if (n < T * 0.9) { const j = await mv('/v2/aggs/ticker/QQQ/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000'); n = 0;
    if (j && Array.isArray(j.results)) for (const b of j.results) { const t = DL.tOf.get(iso(b.t)); if (t !== undefined) { q[t] = b.c; n++; } } src = 'QQQ (Massive daily bars)'; }
  const REG = new Uint8Array(T); for (let t = 0; t < T; t++) REG[t] = regimeUp(q, t) ? 1 : 0;
  return { REG, ok: n >= T * 0.9, src: n >= T * 0.9 ? src : 'QQQ missing (' + n + ' of ' + T + ')' };
}
/** stock-days for sessions [tFrom, tTo] (rows per session index). Uses only daily data to t-1 plus the open of t. */
function buildRows(DL, REG, tFrom, tTo) {
  const { T, NS, SYMS, D, MAIN } = DL, rows = new Map(), lead = new Map();
  for (let i = 0; i < NS; i++) { if (SYMS[i] === 'SPY') continue; const S = DL.series(i); let any = false; for (let t = Math.max(1, tFrom - 1); t <= tTo; t++) if (MAIN[i * T + t - 1]) { any = true; break; } if (!any) continue;
    const I = indicators(S); let act = null;
    for (let t = Math.max(1, tFrom - 140); t <= tTo; t++) {
      if (act && (t > act.t0 + 5 || (t - 1 > act.t0 && S.c[t - 1] < act.bl))) act = null;   // order window over / cancelled by a close under the base low
      if (t >= tFrom && MAIN[i * T + t - 1]) { const fl = dayFlags(S, t);
        if (fl) { if (act) fl.f.qbo = { trig: act.bh, adr: act.adr, sig: D[act.t0] };
          const ls = leaderScore(S, t - 1); if (ls !== null) (lead.get(t) || lead.set(t, []).get(t)).push([i, ls]);
          if (Object.keys(fl.f).length || ls !== null) (rows.get(t) || rows.set(t, new Map()).get(t)).set(i, { s: SYMS[i], O: S.o[t], ...fl }); } }
      if (!act && t < T && MAIN[i * T + t]) { const q = detectQBO(S, I, t, { regime: REG[t] }); if (q) act = { t0: t, bh: q.trigger, bl: q.cancelBelow, adr: q.adr }; }   // signal at the close of t, live from t+1
    } }
  const days = [];
  for (let t = tFrom; t <= tTo; t++) { const R = rows.get(t); if (!R) continue; const L = (lead.get(t) || []).sort((a, b) => b[1] - a[1]).slice(0, LEADERS); for (const [i] of L) { const r = R.get(i); if (r) r.f.lead = 1; }
    const keep = [...R.values()].filter(r => Object.keys(r.f).length).map(r => ({ s: r.s, O: r.O, pc: r.pc, adv: Math.round(r.adv), adr: r4(r.adr), f: r.f }));
    if (keep.length) days.push({ d: D[t], t, rows: keep }); }
  return days;
}
const allFrozen = () => { const L = J(LAB, null); return !!(L && L.firstRun && IDS.every(id => L.firstRun[id])); };

// ---------- one session: minute bars -> rules ----------
async function runSession(day, rows) {
  const { bars, complete } = await minuteDay(day.d, [...new Set(rows.map(r => r.s))]); let mismatch = 0, missing = 0; const SD = [];
  for (const r of rows) { const raw = bars.get(r.s); if (!raw || !raw.length) { missing++; continue; } const B = toNyBars(raw, day.d); if (!B.length) { missing++; continue; }
    const sc = priceScale(r.O, B[0].o); if (!sc) { mismatch++; continue; }
    const f = { ...r.f }; if (f.qbo) f.qbo = { ...f.qbo, trig: f.qbo.trig / sc }; if (f.htf) f.htf = { ...f.htf, top: f.htf.top / sc };
    SD.push({ sym: r.s, ctx: { pc: r.pc / sc, adv: r.adv * sc, adr: r.adr, scale: sc, f }, bars: B, sig: r.f.qbo ? r.f.qbo.sig : null }); }
  const res = runDay(SD); for (const id of IDS) for (const x of res[id].trades) { x.d = day.d; x.t = day.t; const sd = SD.find(z => z.sym === x.sym); if (id === 'SQ2-QBO' && sd && sd.sig) x.sig = sd.sig; }
  return { res, stats: { rows: rows.length, got: SD.length, missing, mismatch, complete } };
}

// ================= MODES =================
if (MODE === 'plan') {
  const LB = J(LIB, null); if (LB && preRegister(LB)) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1));
  if (allFrozen()) { WZ(WORK + '/plan.json.gz', { skip: true }); log('every SQ2 rule is already frozen: one-shot not repeated'); process.exit(0); }
  const DL = await loadDaily(false); if (!DL) { WZ(WORK + '/plan.json.gz', { skip: true, why: 'no daily cache' }); log('no daily cache'); process.exit(0); }
  const probe = {}; for (const d of ['2016-01-04', '2018-01-02', '2021-01-04', DL.D[0]]) { const j = await alp('/v2/stocks/bars?symbols=AAPL&timeframe=1Min&start=' + d + 'T14:30:00Z&end=' + d + 'T14:40:00Z&adjustment=raw&feed=sip&limit=20'); probe[d] = j && j.bars && j.bars.AAPL ? j.bars.AAPL.length : (j && j.bad ? 'HTTP ' + j.bad : 0); }
  log('Alpaca SIP minute-history probe (AAPL bars 09:30-09:40): ' + JSON.stringify(probe) + (aRefused ? ' refused: ' + aRefused : ''));
  const Q = await qqqRegime(DL); log('regime: ' + Q.src + ', up on ' + Q.REG.reduce((a, x) => a + x, 0) + ' sessions');
  const tFrom = 21, tTo = Math.min(DL.T - 1, DL.tOf.has(env.SQ2_TO || '') ? DL.tOf.get(env.SQ2_TO) : DL.T - 1);
  const days = buildRows(DL, Q.REG, tFrom, tTo), cnt = days.reduce((a, x) => a + x.rows.length, 0), fc = {};
  for (const x of days) for (const r of x.rows) for (const k of Object.keys(r.f)) fc[k] = (fc[k] || 0) + 1;
  log('plan: ' + days.length + ' sessions, ' + cnt + ' stock-days to fetch; by flag ' + JSON.stringify(fc));
  WZ(WORK + '/plan.json.gz', { at: new Date().toISOString(), D: DL.D, window: [days[0] && days[0].d, days.length && days[days.length - 1].d], probe, regime: { src: Q.src, ok: Q.ok }, days, counts: { sessions: days.length, stockDays: cnt, byFlag: fc }, aRefused });
  process.exit(0);
}
if (MODE === 'shard') {
  const P0 = JZ(WORK + '/plan.json.gz', null), i = +(env.SHARD || 0), n = +(env.SHARDS || 1), out = WORK + '/shard-' + i + '.json.gz';
  if (!P0 || P0.skip) { WZ(out, { skip: true }); log('nothing to do'); process.exit(0); }
  const per = Math.ceil(P0.days.length / n), mine = P0.days.slice(i * per, (i + 1) * per), trades = Object.fromEntries(IDS.map(id => [id, []])), pools = Object.fromEntries(IDS.map(id => [id, 0])), st = { sessions: 0, rows: 0, got: 0, missing: 0, mismatch: 0, incomplete: [] };
  let next = 0; const MAXMS = +(env.SQ2_MINUTES || 300) * 60000;
  async function worker() { while (next < mine.length && Date.now() - t0 < MAXMS && !aRefused) { const day = mine[next++]; const { res, stats } = await runSession(day, day.rows);
      for (const id of IDS) { trades[id].push(...res[id].trades); pools[id] += res[id].pool; } st.sessions++; st.rows += stats.rows; st.got += stats.got; st.missing += stats.missing; st.mismatch += stats.mismatch; if (!stats.complete) st.incomplete.push(day.d);
      if (st.sessions % 20 === 0) log('shard ' + i + ': ' + st.sessions + ' / ' + mine.length + ' sessions, ' + aCalls + ' Alpaca calls'); } }
  await Promise.all(Array.from({ length: +(env.SQ2_PAR || 6) }, worker));
  const complete = st.sessions === mine.length && !aRefused && st.incomplete.length === 0;
  WZ(out, { shard: i, of: n, from: mine[0] && mine[0].d, to: mine.length ? mine[mine.length - 1].d : null, complete, aRefused, stats: st, pools, trades, calls: aCalls });
  log('shard ' + i + ' done: ' + JSON.stringify({ ...st, incomplete: st.incomplete.length }) + ' complete ' + complete + (aRefused ? ' refused: ' + aRefused : '') + '; trades ' + JSON.stringify(Object.fromEntries(IDS.map(id => [id, trades[id].length]))));
  process.exit(0);
}

// ---------- shared by judge and paper: finishing trades on daily bars ----------
function finisher(DL) {
  const { T, SY, tOf } = DL, cacheS = new Map(), S = (sym) => { const i = SY.get(sym); if (i === undefined) return null; if (!cacheS.has(i)) { const s = DL.series(i); cacheS.set(i, { s, sma10: Float64Array.from({ length: T }, (_, t) => smaAt(s.c, t, 10)) }); } return cacheS.get(i); };
  const closeAt = (sym, x) => { const z = S(sym); if (!z) return null; for (let k = x; k >= Math.max(0, x - 15); k--) if (z.s.c[k] > 0) return z.s.c[k]; return null; };
  const avgOC = new Float64Array(T).fill(NaN); { const sum = new Float64Array(T), n = new Float64Array(T); for (let i = 0; i < DL.NS; i++) for (let t = 0; t < T; t++) { const k = i * T + t; if (DL.MAIN[k] && DL.C[k] >= 5 && DL.O[k] > 0) { sum[t] += DL.C[k] / DL.O[k] - 1; n[t]++; } } for (let t = 0; t < T; t++) if (n[t]) avgOC[t] = sum[t] / n[t]; }
  const ownOC = new Map(); const ownDay = (sym, t) => { const i = SY.get(sym); if (i === undefined) return null; if (!ownOC.has(i)) { let s = 0, m = 0; const a = []; for (let k = 0; k < T; k++) { const q = i * T + k; if (DL.MAIN[q] && DL.C[q] >= 5 && DL.O[q] > 0) { a.push([k, DL.C[q] / DL.O[q] - 1]); s += DL.C[q] / DL.O[q] - 1; m++; } } ownOC.set(i, { a, s, m }); }
    const z = ownOC.get(i), self = z.a.find(x => x[0] === t); const s = z.s - (self ? self[1] : 0), m = z.m - (self ? 1 : 0); return m >= 20 ? s / m : null; };
  const ownSwing = (sym, k, x) => { const i = SY.get(sym); if (i === undefined) return null; const h = x - k + 1, b = i * T; let s = 0, m = 0;
    for (let q = 0; q + h - 1 < T; q++) { if (q + h - 1 >= k - 0 && q <= x) continue; if (!DL.MAIN[b + q] || !(DL.C[b + q] >= 5) || !(DL.O[b + q] > 0) || !(DL.C[b + q + h - 1] > 0)) continue; s += DL.C[b + q + h - 1] / DL.O[b + q] - 1; m++; } return m >= 20 ? s / m : null; };
  const avgWindow = (k, x) => { let s = 0, m = 0; for (let i = 0; i < DL.NS; i++) { const b = i * T; if (!DL.MAIN[b + k] || !(DL.C[b + k] >= 5) || !(DL.O[b + k] > 0)) continue; let c = null; for (let q = x; q >= k; q--) if (DL.C[b + q] > 0) { c = DL.C[b + q]; break; } if (c) { s += c / DL.O[b + k] - 1; m++; } } return m ? s / m : null; };
  /** a swing trade from its shard record -> { g, gOpt, x, held sessions, open } (daily units via scale) */
  function swing(tr, last = T - 1) { const engine = SETUPS[tr.id].engine, k = tOf.get(tr.d), z = S(tr.sym); if (k === undefined || !z) return null; const sc = tr.scale || 1, fillD = tr.fill * sc, stopD = tr.stop * sc;
    const one = (p) => { if (p.stopped) return { g: (p.px * (1 - SLIP)) / (tr.fill * (1 + SLIP)) - 1, x: k, state: 'closed', legs: [[k, 1, p.px * sc, p.why]] }; const r = continueDaily(engine, z.s, z.sma10, k, fillD, stopD, last); return r; };
    const P = one(tr.day1.pess), Q = one(tr.day1.opt); return { g: P.g, gOpt: Q.g, x: P.x, state: P.state, legs: P.legs, k }; }
  return { swing, closeAt, avgOC, ownDay, ownSwing, avgWindow };
}

if (MODE === 'judge') {
  const P0 = JZ(WORK + '/plan.json.gz', null); if (!P0 || P0.skip) { log('judge: nothing to judge (' + (P0 && P0.why || 'already frozen') + ')'); process.exit(0); }
  const n = +(env.SHARDS || 1), shards = []; for (let i = 0; i < n; i++) shards.push(JZ(WORK + '/shard-' + i + '.json.gz', null));
  const missingShards = shards.map((s, i) => s ? null : i).filter(x => x !== null), DL = await loadDaily(false); if (!DL) { log('judge: no daily cache'); process.exit(1); }
  const F = finisher(DL), bar = Math.max(TIER2_T, leagueBar().bar || 0, 4.0), st = { rows: 0, got: 0, missing: 0, mismatch: 0, incomplete: 0 };
  for (const s of shards) if (s && s.stats) { for (const k of ['rows', 'got', 'missing', 'mismatch']) st[k] += s.stats[k]; st.incomplete += s.stats.incomplete.length; }
  const coverage = st.rows ? st.got / st.rows : 0, complete = !missingShards.length && shards.every(s => s && s.complete) && coverage >= 0.9 && P0.regime.ok;
  log('judge: shards ' + n + ' (missing ' + missingShards.length + '), stock-days ' + st.rows + ', with minute bars ' + st.got + ' (' + (coverage * 100).toFixed(1) + '%), price mismatch ' + st.mismatch + '; complete ' + complete);
  const results = {}, tradeOut = {}, oldLib = new Map((J(LIB, { strategies: [] }).strategies || []).map(e => [e.id, e]));
  for (const id of IDS) { const S0 = SETUPS[id]; let all = shards.flatMap(s => (s && s.trades && s.trades[id]) || []); all.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : a.m - b.m);
    const rows = [], busy = new Map(), usedSig = new Set(); let amb = 0, cMatched = 0;
    for (const tr of all) { const k = DL.tOf.get(tr.d); if (k === undefined) continue; if ((busy.get(tr.sym) ?? -1) >= k) continue; if (tr.sig) { if (usedSig.has(tr.sym + '|' + tr.sig)) continue; }
      let g, gOpt, gLow, x = k, c = null, own = null;
      if (S0.kind === 'day') { g = tr.g; gOpt = tr.gOpt; gLow = tr.gLowSlip; c = tr.c !== null && tr.c !== undefined ? tr.c : (isFinite(F.avgOC[k]) ? F.avgOC[k] : null); own = F.ownDay(tr.sym, k); }
      else { const w = F.swing(tr); if (!w) continue; g = w.g; gOpt = w.gOpt; gLow = g + 2 * (SLIP - 0.0005); x = w.x;
        const cr = (tr.ctrl || []).map(([s, p0, sc]) => { const cx = F.closeAt(s, x); return cx > 0 && p0 > 0 ? cx / (p0 * sc) - 1 : null; }).filter(v => v !== null && isFinite(v));
        c = cr.length ? mean(cr) : F.avgWindow(k, x); own = F.ownSwing(tr.sym, k, x); }
      if (!isFinite(g)) continue; busy.set(tr.sym, x); if (tr.sig) usedSig.add(tr.sym + '|' + tr.sig); if (tr.ambiguous) amb++; if (tr.cType === 'matched') cMatched++;
      rows.push({ t: k, d: tr.d, s: tr.sym, g, gOpt, gLow, c, own, held: x - k + 1, m: tr.m, why: tr.why || null }); }
    const half = (h) => rows.filter(r => halfOf(r.d) === h), R = { older: halfStat(half('older'), S0.block), newer: halfStat(half('newer'), S0.block), all: halfStat(rows, S0.block) };
    const v = judge(R, { bar }), byYear = {}; for (const r of rows) { const y = r.d.slice(0, 4); (byYear[y] = byYear[y] || []).push(r.g - COST); }
    const avgH = (key, cost, h) => { const a = (h ? half(h) : rows).map(r => r[key] - cost); return a.length ? r4(mean(a)) : null; };
    results[id] = { at: new Date().toISOString(), window: P0.window, bar, verdict: v.verdict, why: v.why, results: R, hold: S0.kind === 'day' ? 1 : Math.max(1, Math.round(mean(rows.map(r => r.held)) || 1)), maxHold: S0.kind === 'day' ? 1 : S0.hold,
      kind: S0.kind, block: S0.block, split: SPLIT, cost: COST, intradayEntry: true,
      shape: { ...shape(rows), avgHeld: rows.length ? r4(mean(rows.map(r => r.held))) : null, byYear: Object.fromEntries(Object.entries(byYear).map(([y, a]) => [y, { n: a.length, avg: r4(mean(a)) }])) },
      info: { bestCaseSameMinute: { older: avgH('gOpt', COST, 'older'), newer: avgH('gOpt', COST, 'newer') }, ambiguousTrades: amb, cost04: { older: avgH('g', INFO_COST, 'older'), newer: avgH('g', INFO_COST, 'newer') },
        slip005: { older: avgH('gLow', COST, 'older'), newer: avgH('gLow', COST, 'newer') }, matchedControlShare: rows.length ? r4(cMatched / rows.length) : null, poolStockDays: shards.reduce((a, s) => a + ((s && s.pools && s.pools[id]) || 0), 0) },
      old: S0.old.map(o => { const e = oldLib.get(o); return e && e.result ? { id: o, verdict: e.result.verdict || null, n: e.result.n || null, avg: e.result.avg || null, edge: e.result.edge || null, win: e.result.win ?? null, avgWin: e.result.avgWin ?? null, avgLoss: e.result.avgLoss ?? null } : { id: o, status: e ? e.status : 'not in library' }; }) };
    tradeOut[id] = rows.map(r => [r.d, r.s, r.m, r4(r.g), r4(r.gOpt), r4(r.c), r4(r.own), r.held]);
    log(id + ': ' + v.verdict + ' | n ' + R.older.n + ' / ' + R.newer.n + ' | avg ' + R.older.avg + ' / ' + R.newer.avg + ' | edge ' + R.older.edge + ' / ' + R.newer.edge + ' | tBlock ' + R.older.tBlock + ' / ' + R.newer.tBlock); }
  const prev = J(LAB, {}), firstRun = complete ? freezeEach(prev.firstRun, results) : (prev.firstRun || {});
  const OUT = { generatedAt: new Date().toISOString(), preRegistered: '2026-10-24 (squad2-core.mjs header + data/strategy-library.json SQ2-*)', window: P0.window, split: SPLIT, bar, cost: { base: COST, stress: STRESS, slipPerSide: SLIP, info: INFO_COST },
    data: { minuteBars: 'Alpaca SIP 1-minute bars, raw, regular session', historyProbe: P0.probe, regime: P0.regime, plan: P0.counts, stockDays: st, coverage: r4(coverage), complete, missingShards },
    standard: 'value-core.mjs judge (tier 2): both halves (signal before / from ' + SPLIT + ') > 0 after 0.8% and 1.2%; edge vs the matched control > 0; vs the same stock on other days > 0; without the 2 best > 0; block t >= ' + TIER2_T + '; 20+ trades and 3+ blocks per half; PROVEN at block t >= ' + bar + '. Same-minute entry/stop ambiguity booked worst case.',
    firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, { verdict: r.verdict, results: { older: r.results.older, newer: r.results.newer } }])) }) };
  fs.writeFileSync(LAB, JSON.stringify(OUT, null, 1)); if (complete) WZ(TRADES, { note: 'per rule: [signal day, symbol, entry NY minute, g worst case (net of slippage, gross of the 0.8% cost), g best case, matched control, same stock other days, sessions held]', trades: tradeOut });
  const LB = J(LIB, null); if (LB && complete) { preRegister(LB); for (const id of IDS) { const fr = firstRun[id], e = LB.strategies.find(z => z.id === id); if (!fr || !e || e.result) continue; const R = fr.results;
      e.tested = fr.at.slice(0, 10); e.status = 'tested: ' + fr.verdict.toLowerCase() + ' (squad 2, 1-minute bars); forward paper lane from 26 Oct 2026';
      e.result = { verdict: fr.verdict, n: [R.older.n, R.newer.n], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: fr.shape.win, avgWin: fr.shape.avgWin, avgLoss: fr.shape.avgLoss, pf: fr.shape.pf, why: fr.why }; }
    fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); }
  log('judge written: ' + LAB + (complete ? ' (first verdicts frozen where new)' : ' (INCOMPLETE: nothing frozen)'));
  process.exit(0);
}

if (MODE === 'paper') {
  const DL = await loadDaily(true), lab = J(LAB, {}), firstRun = lab.firstRun || {};
  const lines = fs.existsSync(PAPER) ? fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean) : [];
  const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
  const today = { generatedAt: new Date().toISOString(), paperStart: PAPER_START, note: 'PAPER ONLY. Every SQ2 rule ENTERS INTRADAY (buy-stop / VWAP reclaim during the session), so newSignals is always empty: scan.mjs TRY SMALL places next-open orders, which these rules are not. A rule that passes needs a live intraday alert path (coordinator). Halal = the owner\'s ZAD mark.', methods: {} };
  const append = []; let lastD = null, watch = {};
  if (DL) { const done = new Set(lines.filter(x => x.type === 'day').map(x => x.d)), Q = await qqqRegime(DL), toDo = DL.D.map((d, t) => ({ d, t })).filter(z => z.d >= PAPER_START && !done.has(z.d)); lastD = DL.D[DL.T - 1];
    for (const z of toDo) { const days = buildRows(DL, Q.REG, z.t, z.t), rowsOf = days.length ? days[0].rows : []; const { res, stats } = await runSession({ d: z.d, t: z.t }, rowsOf);
      if (!stats.complete || aRefused) { log('paper ' + z.d + ': minute bars incomplete (' + (aRefused || 'fetch failed') + '); retried next run'); break; }
      for (const id of IDS) for (const tr of res[id].trades) { const sig = { type: 'signal', id: id + '|' + tr.sym + '|' + z.d, m: id, sym: tr.sym, d: z.d, entryMin: tr.m, fill: r4(tr.fill), stop: r4(tr.stop), ambiguous: tr.ambiguous, halal: halal(tr.sym), kind: SETUPS[id].kind, recordedAfter: z.d };
        if (SETUPS[id].kind === 'day') append.push(sig, { type: 'result', id: sig.id, m: id, sym: tr.sym, d: z.d, g: tr.g, gOpt: tr.gOpt, c: tr.c, why: tr.why, halal: sig.halal });
        else append.push({ ...sig, scale: tr.scale, day1: tr.day1, ctrl: tr.ctrl }); }
      append.push({ type: 'day', d: z.d, stats }); log('paper ' + z.d + ': ' + JSON.stringify(stats) + '; triggers ' + IDS.map(id => id + ' ' + res[id].trades.length).join(', ')); }
    // tomorrow's watch list (information): live QBO orders and HTF flags at the last close
    if (DL.T > 2) { const nx = buildRows(DL, Q.REG, DL.T, DL.T); for (const r of (nx[0] && nx[0].rows) || []) { if (r.f.qbo) (watch['SQ2-QBO'] = watch['SQ2-QBO'] || []).push({ sym: r.s, level: r4(r.f.qbo.trig), halal: halal(r.s) }); if (r.f.htf) (watch['SQ2-HTF'] = watch['SQ2-HTF'] || []).push({ sym: r.s, level: r4(r.f.htf.top), halal: halal(r.s) }); } } }
  const allLines = [...lines, ...append], resolved = new Set(allLines.filter(x => x.type === 'result').map(x => x.id));
  if (DL) { const F = finisher(DL); for (const s of allLines.filter(x => x.type === 'signal' && x.kind === 'swing' && !resolved.has(x.id))) { const w = F.swing({ ...s, id: s.m, fill: s.fill, stop: s.stop }); if (w && w.state === 'closed') { const ln = { type: 'result', id: s.id, m: s.m, sym: s.sym, d: s.d, g: r4(w.g), gOpt: r4(w.gOpt), exit: DL.D[w.x], halal: s.halal }; append.push(ln); allLines.push(ln); resolved.add(s.id); } } }
  if (append.length) fs.appendFileSync(PAPER, append.map(x => JSON.stringify(x)).join('\n') + '\n');
  const board = { generatedAt: today.generatedAt, paperStart: PAPER_START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost (worst case on same-minute ambiguity)', methods: {} };
  for (const id of IDS) { const res = allLines.filter(x => x.type === 'result' && x.m === id), sigs = allLines.filter(x => x.type === 'signal' && x.m === id), s = boardStats(res), fr = firstRun[id];
    board.methods[id] = { name: SETUPS[id].name, kind: SETUPS[id].kind, intradayEntry: true, signals: sigs.length, open: sigs.filter(x => !resolved.has(x.id)).length, closed: s, halalOk: boardStats(res.filter(x => x.halal === 'ok')), ready: paperReady(s), fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
    today.methods[id] = { name: SETUPS[id].name, hold: SETUPS[id].kind === 'day' ? 1 : SETUPS[id].hold, tier: fr ? fr.verdict : null, intradayOnly: true, newSignals: [],
      todayTriggers: sigs.filter(x => x.d === lastD).map(x => ({ sym: x.sym, d: x.d, entryMin: x.entryMin, fill: x.fill, stop: x.stop, halal: x.halal })), watch: watch[id] || [],
      open: sigs.filter(x => !resolved.has(x.id)).map(x => ({ sym: x.sym, signal: x.d, fill: x.fill, stop: x.stop, halal: x.halal })) }; }
  today.lastClose = lastD; board.lastClose = lastD;
  fs.writeFileSync(TODAY, JSON.stringify(today, null, 1)); fs.writeFileSync(BOARD, JSON.stringify(board, null, 1));
  log('paper lane: ' + append.length + ' new lines; today/board written');
  process.exit(0);
}
console.log('squad2-lab: unknown MODE ' + MODE); process.exit(1);
