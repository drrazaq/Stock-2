// MACRO LAB (24 Oct 2026; owner: "traders make money from what is happening in the world: demand, war, oil up -> industry up, weapons
// companies on conflict, peace, global warming / energy policy, inflation, rates"). The pre-registered MACRO-* rules (macro-core.mjs RULES,
// written into data/strategy-library.json before any computation) are each run ONCE on the 5-year window, plus information tables (what each
// dated world event did to every sector fund at day 1 / 5 / 20 / 60, and how each driver moves with its sector) and a FORWARD PAPER lane from
// Monday 26 Oct 2026. Research only; never places an order; no Telegram.
// 1. DATA (GitHub Actions only; keys only from secrets, never printed):
//    stocks = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY; dead stocks' later prices in
//             its x rows) + the sessions since, from Massive grouped daily bars + splits since the cache day (angles-lab pattern). Its
//             sessions are the clock D. SIC = the cache's SIC map, else data/sec-ciks.json.
//    funds  = Massive daily bars per fund (split-adjusted, about 5 years) + older days from Nasdaq's historical endpoint (as agent-a-lab /
//             angles-lab do for SPUS), scaled to Massive at the first common day; a split-sized jump in the Nasdaq-only part is repaired.
//             A fund whose history does not reach back to 2020-10-15 makes the rules that need it "NOT RUN" (the driver look-back needs
//             272 sessions before the first signal).
// 2. 5-YEAR ONE-SHOT for every rule not yet frozen (judge = value-core judge + "better than SPY" + the rotation's equal-weight yardstick;
//    halves = signal before / from 2024-01-01); first complete verdict frozen in data/macro-lab.json firstRun (same firstRun /
//    results.older / results.newer format as data/value-lab.json, with `hold` in sessions, for the TRY SMALL lane). Later runs = monitoring.
// 3. PAPER LANE (from Monday 26 Oct 2026): each session's new signals -> data/macro-paper.jsonl (frozen plan: next open, hold, the owner's
//    ZAD halal mark), resolved after the hold; data/macro-today.json (methods[id].newSignals) and data/macro-board.json. Event rules record
//    only when a new dated event is added to macro-core.mjs EVENTS (by hand, with its source, on the day it happens).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { ownAverage, boardStats, paperReady } from './anomaly-core.mjs';
import { monthEnds } from './angles-core.mjs';
import { RULES, IDS, EVENTS, DRIVERS, ROT_MAP, SPDR11, ALL_ETFS, GROUPS, groupOf, entryIdx, retN, driverFlags, vixFlags, topByValue, driverScore, rotPick, worstOf, stitch, splitGuard,
  eventWindow, corrBeta, yardGap, judgeMacro, preRegister, monthEndAfter, nextSession, halfOf, mean, r4, onOrAfter, COST, SPLIT, PAPER_START } from './macro-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com';
const MC = env.MACRO_CACHE || 'macro-cache', OUT = 'data/macro-lab.json', PAPER = 'data/macro-paper.jsonl', TODAY = 'data/macro-today.json', BOARD = 'data/macro-board.json';
const START = env.PAPER_START || PAPER_START, NEED_FROM = '2020-10-15';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
fs.mkdirSync(MC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0);

// ================= 0. PRE-REGISTRATION in the library (before any computation; idempotent) =================
{ const LB = J('data/strategy-library.json', null), ch = preRegister(LB); if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); log('library: ' + ch + ' MACRO entries pre-registered now'); }

// ================= 1. STOCK PRICES (the clock) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('macro-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS0 = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS0.has(x.T) || x.T === 'SPY' || !CS0.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none') + (env.MASSIVE_KEY ? '' : ' (no MASSIVE_KEY)'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) { for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size); if (store.days[d].x) for (const s of store.days[d].x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN), CX = new Float32Array(N).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; } });
const SIC = store.sic || {}; store = null;
{ let j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'); if (!j || j.refused) j = await api('/v3/reference/splits?execution_date.gte=' + cacheLast + '&limit=1000'); const rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; C[q] /= r; CX[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY');
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS);
const LIQ = new Uint8Array(N), DV = new Float32Array(N); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = C[b + t] * V[b + t]; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const w = C[b + t - 20] * V[b + t - 20]; if (isFinite(w)) { s -= w; n--; } } if (n) DV[b + t] = s / Math.max(n, 1); if (t >= 19 && n === 20 && C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqAt = new Map(); const liqList = (t) => { if (!liqAt.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqAt.set(t, a); } return liqAt.get(t); };
const pxAt = (i, t) => { const z = C[i * T + t]; return z > 0 ? z : CX[i * T + t] > 0 ? CX[i * T + t] : null; };
const closeAtS = (i, x, k) => { for (let q = Math.min(x, T - 1); q >= k; q--) { const z = pxAt(i, q); if (z) return z; } return null; };
const retS = (i, k, x) => { if (x >= T || k < 1 || k >= T) return null; const e = O[i * T + k]; if (!(e > 0)) return null; const y = closeAtS(i, x, k); return y > 0 ? y / e - 1 : null; };
const cMemo = new Map(); const ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; const g = retS(i, k, x); if (g !== null && Math.abs(g) < 3) v.push(g); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
const SECCIK = J('data/sec-ciks.json', {});
const sicOf = (s) => { const x = SIC[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECCIK[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
// a session index for any date: the last session on or before d inside the data, or counted forward on the NYSE calendar past the newest close
const idxOf = (d) => { if (d <= D[T - 1]) { const k = onOrAfter(D, d); return D[k] === d ? k : k - 1; } let x = T - 1, s = D[T - 1]; while (s < d) { s = nextSession(s); x++; } return x; };
// the entry session of an event, also past the newest close (a new event added to EVENTS for the paper lane)
const entryOf = (ev) => { const k = entryIdx(D, ev); if (k >= 0) return k; let s = D[T - 1], x = T - 1; for (let n = 0; n < 400; n++) { s = nextSession(s); x++; if (ev.when === 'pre' ? s >= ev.d : s > ev.d) return x; } return -1; };
const dateOf = (x) => { if (x < T) return D[x]; let s = D[T - 1]; for (let q = T - 1; q < x; q++) s = nextSession(s); return s; };

// ================= 2. FUND PRICES =================
const NQ_HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
async function get(url, opt = {}) { for (let a = 0; a < 3; a++) { try { const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(opt.timeout || 60000) }); if (r.status === 404) return { status: 404, ok: false }; if (r.status === 429 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; } return r; } catch (e) { await sleep(2000 * (a + 1)); } } return null; }
const NQnum = (v) => { const x = parseFloat(String(v || '').replace(/[$,]/g, '')); return isFinite(x) && x > 0 ? x : NaN; };
async function fundRows(sym) { const f = MC + '/etf-' + sym + '.json', had = J(f, null); if (had && had.at && Date.now() - Date.parse(had.at) < 18 * 3600e3 && had.rows && had.rows.length > 200) return had;
  let mass = null, nq = null; const j = await api('/v2/aggs/ticker/' + sym + '/range/1/day/2019-10-01/' + iso(Date.now()) + '?adjusted=true&sort=asc&limit=50000');
  if (j && Array.isArray(j.results) && j.results.length > 50) mass = j.results.map(x => [iso(x.t), x.o, x.c]).filter(r => r[2] > 0);
  // Massive's history reaches back about 5 years: the older days come from Nasdaq (kept between runs: the old part never changes)
  const old = J(MC + '/nq-' + sym + '.json', null);
  if (old && old.rows && old.rows.length > 200) nq = old.rows;
  else if (!mass || mass[0][0] > NEED_FROM) { const r = await get(NQ + '/api/quote/' + sym + '/historical?assetclass=etf&fromdate=2019-10-01&todate=' + iso(Date.now()) + '&limit=9999', { headers: NQ_HEAD, timeout: 45000 }); const k = r && r.ok ? await r.json().catch(() => null) : null; const tr = k && k.data && k.data.tradesTable && k.data.tradesTable.rows;
    if (Array.isArray(tr) && tr.length > 200) { nq = tr.map(x => { const m = String(x.date || '').match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m ? [m[3] + '-' + m[1] + '-' + m[2], NQnum(x.open), NQnum(x.close)] : null; }).filter(x => x && x[2] > 0).sort((a, b) => a[0] < b[0] ? -1 : 1); W(MC + '/nq-' + sym + '.json', { at: new Date().toISOString(), rows: nq }); }
    await sleep(local(env.NASDAQ_BASE) ? 0 : 400); }
  let nqFixed = []; if (nq && mass) { const before = nq.filter(r => r[0] <= mass[0][0]); const g = splitGuard(before); nqFixed = g.fixed; nq = [...g.rows, ...nq.filter(r => r[0] > mass[0][0])]; }
  const rows = stitch(mass, nq); if (!rows.length) return had || { rows: [], missing: true };
  const out = { at: new Date().toISOString(), rows, massiveFrom: mass ? mass[0][0] : null, nasdaqFrom: nq && nq.length ? nq[0][0] : null, nqSplitsRepaired: nqFixed };
  if (mass) W(f, out); return out; }
const FUND = {}, FSTAT = {};
for (const s of ALL_ETFS) { const x = await fundRows(s); const rows = (x.rows || []).map(r => [r[0], r[1] > 0 ? r[1] : r[2], r[2]]);
  const map = new Map(rows.map((r, j) => [r[0], j])), EO = new Float64Array(T).fill(NaN), EC = new Float64Array(T).fill(NaN);
  for (let t = 0; t < T; t++) { const j = map.get(D[t]); if (j !== undefined) { EO[t] = rows[j][1]; EC[t] = rows[j][2]; } }
  const cover = EC.filter(v => v > 0).length;
  FUND[s] = { rows, map, d: rows.map(r => r[0]), c: rows.map(r => r[2]), EO, EC };
  FSTAT[s] = { ok: rows.length > 0 && rows[0][0] <= NEED_FROM && cover >= T * 0.97, covers: cover >= T * 0.97, from: rows.length ? rows[0][0] : null, to: rows.length ? rows[rows.length - 1][0] : null, days: rows.length, coverD: cover, massiveFrom: x.massiveFrom || null, nasdaqFrom: x.nasdaqFrom || null, nqSplitsRepaired: x.nqSplitsRepaired || [] };
  log('fund ' + s + ': ' + FSTAT[s].days + ' days from ' + FSTAT[s].from + ' (Massive from ' + FSTAT[s].massiveFrom + ', Nasdaq from ' + FSTAT[s].nasdaqFrom + '), on ' + cover + '/' + T + ' sessions' + (FSTAT[s].ok ? '' : '  <- NOT OK')); }
// a flag series computed on the fund's own dates, read on D
const onD = (sym, own) => { const F = FUND[sym], a = new Uint8Array(T); if (!F) return a; for (let t = 0; t < T; t++) { const j = F.map.get(D[t]); if (j !== undefined && own[j]) a[t] = 1; } return a; };

// ================= 3. INSTRUMENTS =================
// I < NS: a stock (cache row); I >= NS: a fund (ALL_ETFS[I - NS])
const EIDX = new Map(ALL_ETFS.map((s, j) => [s, NS + j])), symOf = (I) => I < NS ? SYMS[I] : ALL_ETFS[I - NS], instOf = (s) => EIDX.has(s) ? EIDX.get(s) : SY.has(s) ? SY.get(s) : undefined;
const fundOf = (I) => FUND[ALL_ETFS[I - NS]];
const closeOf = (I, t) => { if (I < NS) return pxAt(I, t); const v = fundOf(I).EC[t]; return v > 0 ? v : null; };
const ret = (I, k, x) => { if (I < NS) return retS(I, k, x); if (x >= T || k < 1 || k >= T) return null; const F = fundOf(I), e = F.EO[k]; if (!(e > 0)) return null; for (let q = x; q >= k; q--) if (F.EC[q] > 0) return F.EC[q] / e - 1; return null; };
const SPYF = EIDX.get('SPY'), spyRet = (k, x) => ret(SPYF, k, x);
const okAtI = (I, u) => I < NS ? LIQ[I * T + u - 1] === 1 : fundOf(I).EC[u - 1] > 0;

// ================= 4. SIGNALS =================
// { t (signal session), I (instrument), k (entry session, bought at its open), x (exit session, sold at its close), ev (event id) }
const SIG = {}; for (const id of IDS) SIG[id] = [];
const groupMembers = (g, t) => { const G = GROUPS[g], rows = []; for (const i of liqList(t)) { const s = SYMS[i]; if (G.list ? G.list.includes(s) : groupOf(sicOf(s)).includes(g)) rows.push({ key: i, dv: DV[i * T + t] }); } return topByValue(rows, 10); };
const FLAGS = {}; { for (const d of ['USO', 'UNG', 'GLD', 'CPER', 'TLT']) FLAGS[d + ':up'] = onD(d, driverFlags(FUND[d].c)); FLAGS['UUP:down'] = onD('UUP', driverFlags(FUND.UUP.c, { side: 'down' })); FLAGS['VIXY:spike'] = onD('VIXY', vixFlags(FUND.VIXY.c));
  log('driver flags (sessions flagged in D): ' + Object.entries(FLAGS).map(([k, f]) => k + ' ' + f.reduce((a, b) => a + b, 0)).join(', ')); }
const evDiag = {};
for (const id of IDS) { const R = RULES[id], h = R.hold;
  if (R.family === 'driver') { const f = FLAGS[R.driver + ':' + R.side]; for (let t = 0; t < T; t++) { if (!f[t]) continue;
      if (R.target.etf) SIG[id].push({ t, I: EIDX.get(R.target.etf), k: t + 1, x: t + h }); else for (const i of groupMembers(R.target.group, t)) SIG[id].push({ t, I: i, k: t + 1, x: t + h }); } }
  else if (R.family === 'event') { evDiag[id] = []; for (const ev of EVENTS.filter(e => e.kind === R.kind)) { const k = entryOf(ev), t = k - 1; if (k < 0 || t >= T) continue;
      if (t < 20) { evDiag[id].push(ev.id + ': before the data'); continue; }
      if (R.target.etf) SIG[id].push({ t, I: EIDX.get(R.target.etf), k, x: k + h - 1, ev: ev.id });
      else if (R.target.worst) { const r = {}; for (const s of R.target.worst) r[s] = retN(FUND[s].EC, t, 20); const w = worstOf(r); if (w) SIG[id].push({ t, I: EIDX.get(w), k, x: k + h - 1, ev: ev.id }); evDiag[id].push(ev.id + ': worst ' + w + ' ' + pc(r[w])); }
      else { const m = groupMembers(R.target.group, t); for (const i of m) SIG[id].push({ t, I: i, k, x: k + h - 1, ev: ev.id }); evDiag[id].push(ev.id + ': ' + m.map(i => SYMS[i]).join(' ')); } } }
  else if (R.family === 'rotation') { const ME = monthEnds(D); SIG[id].months = [];
    for (const t of ME) { const sc = {}; for (const [d, m] of Object.entries(ROT_MAP)) { const F = FUND[d], j = F.map.get(D[t]); const s = j === undefined ? null : driverScore(F.c, j); sc[m.etf] = s === null ? null : m.sign * s; }
      if (Object.values(sc).some(v => v === null)) continue; const pick = rotPick(sc), nx = ME.find(q => q > t), x = nx === undefined ? idxOf(monthEndAfter(dateOf(t + 1))) : nx;
      SIG[id].months.push({ d: D[t], pick, scores: Object.fromEntries(Object.entries(sc).map(([k, v]) => [k, r4(v)])) });
      for (const e of pick) SIG[id].push({ t, I: EIDX.get(e), k: t + 1, x, rot: true }); } } }
log('signals: ' + IDS.map(id => id + ' ' + SIG[id].length).join(', '));

// which data each rule needs
const needFunds = (id) => { const R = RULES[id], a = ['SPY']; if (R.driver) a.push(R.driver); if (R.target.etf) a.push(R.target.etf); if (R.target.worst) a.push(...R.target.worst); if (R.target.rotation) for (const [d, m] of Object.entries(ROT_MAP)) a.push(d, m.etf); return [...new Set(a)]; };
// drivers (and SPY) need the full history (look-backs); a fund that is only bought needs prices on the sessions of D
const failingFunds = (id) => { const R = RULES[id], drivers = new Set(['SPY', R.driver, ...(R.target.rotation ? Object.keys(ROT_MAP) : [])]);
  return needFunds(id).filter(s => !(FSTAT[s] && (drivers.has(s) ? FSTAT[s].ok : FSTAT[s].covers))); };
const dataOk = (id) => failingFunds(id).length === 0;

// ================= 5. 5-YEAR ONE-SHOT =================
const need = IDS.filter(id => !FROZEN[id]);
log('5-year one-shot for ' + need.length + ' rules not yet frozen');
const ROTE = Object.values(ROT_MAP).map(m => EIDX.get(m.etf));
function tradesOf(id, sigs, oneAtATime = false) { const out = [], busy = new Map(), spans = new Map(), rot = RULES[id].family === 'rotation', many = (rot || RULES[id].tranche) && !oneAtATime;
  for (const z of [...sigs].sort((p, q) => p.t - q.t || p.I - q.I)) { if (z.x >= T || z.k >= T) continue; if (!many && (busy.get(z.I) ?? -1) >= z.k) continue;
    const g = ret(z.I, z.k, z.x); if (g === null || !isFinite(g)) continue; const c = ctrlSpan(z.k, z.x); if (c === null) continue;
    busy.set(z.I, z.x); (spans.get(z.I) || spans.set(z.I, []).get(z.I)).push([z.k, z.x]);
    const tr = { t: z.t, s: symOf(z.I), I: z.I, k: z.k, x: z.x, g, c, spy: spyRet(z.k, z.x), half: halfOf(D[z.t]), ev: z.ev, h: halal(symOf(z.I)) };
    if (rot) { const v = ROTE.map(e => ret(e, z.k, z.x)).filter(u => u !== null); tr.ew = v.length === ROTE.length ? mean(v) : null; }
    out.push(tr); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.x - z.k + 1, key = z.I + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 21, to: T - 1, len, step: 10, busy: z.I < NS ? spans.get(z.I) || [] : [], okAt: (u) => okAtI(z.I, u) && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.I, u, x) }));
    z.own = ownMemo.get(key); }
  return out; }
const shape = (tr) => { const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), by = {}; tr.forEach((z, j) => { const y = D[z.t].slice(0, 4); (by[y] = by[y] || []).push(net[j]); });
  return { trades: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, byYear: Object.fromEntries(Object.keys(by).sort().map(y => [y, { n: by[y].length, avg: r4(mean(by[y])) }])) }; };
const RES = {};
for (const id of IDS) { const R = RULES[id];
  if (!dataOk(id)) { RES[id] = { verdict: 'NOT RUN', why: 'fund data not complete this run: ' + failingFunds(id).map(s => s + ' ' + JSON.stringify(FSTAT[s] || {}).slice(0, 160)).join('; ') }; log('- ' + id + ': NOT RUN (fund data)'); continue; }
  const tr = tradesOf(id, SIG[id]), H = { older: tr.filter(z => z.half === 'older'), newer: tr.filter(z => z.half === 'newer') };
  const Rs = { older: halfStat(H.older, R.hold), newer: halfStat(H.newer, R.hold), all: halfStat(tr, R.hold) }, gaps = {};
  for (const h of ['older', 'newer']) { Rs[h].vsSpy = yardGap(H[h], 'spy'); gaps[h] = {}; if (R.target.etf !== 'SPY') gaps[h].spy = Rs[h].vsSpy; if (R.target.rotation) { Rs[h].vsEqualWeight = yardGap(H[h], 'ew'); gaps[h].ew = Rs[h].vsEqualWeight; } }
  Rs.all.vsSpy = yardGap(tr, 'spy');
  const info = { halalMix: { ok: tr.filter(z => z.h === 'ok').length, fail: tr.filter(z => z.h === 'fail').length, unknown: tr.filter(z => z.h === 'unknown').length } };
  if (R.family === 'event') { info.events = [...new Set(tr.map(z => z.ev))]; info.eventsPerHalf = { older: new Set(H.older.map(z => z.ev)).size, newer: new Set(H.newer.map(z => z.ev)).size }; info.diag = evDiag[id];
    info.note = 'event rules have few independent events: every trade of one event shares one block; under 3 blocks or 20 trades in a half = TOO FEW CASES, a valid verdict'; }
  if (R.tranche) { const one = tradesOf(id, SIG[id], true); info.oneAtATime = { note: 'information only: the same rule holding one trade at a time (a new signal while held is skipped)' };
    for (const h of ['older', 'newer']) { const a = one.filter(z => z.half === h), st = halfStat(a, R.hold); info.oneAtATime[h] = { n: st.n || 0, avg: st.avg ?? null, edge: st.edge ?? null, vsSpy: yardGap(a, 'spy'), tBlock: st.tBlock ?? null }; } }
  if (R.target.rotation) { const kept = tr.map((z, j) => { const prev = tr.find(q => q.s === z.s && q.x === z.k - 1); return z.g - (prev ? 0 : COST); }); info.ifKeptHoldingsPayNoCost = { note: 'information only: a fund kept from one month to the next pays no new cost (the system standard charges 0.8% every fund-month)', older: r4(mean(kept.filter((_, j) => tr[j].half === 'older'))), newer: r4(mean(kept.filter((_, j) => tr[j].half === 'newer'))) };
    info.months = SIG[id].months; }
  RES[id] = { ...judgeMacro(Rs, { bar: BAR, gaps }), results: Rs, shape: shape(tr), info, hold: R.hold, family: R.family, split: SPLIT, cost: COST,
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], net: r4(z.g - COST), avgStock: r4(z.c - COST), spy: r4(z.spy), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST), halal: z.h, ...(z.ev ? { ev: z.ev } : {}) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' vsSPY ' + pc(h.vsSpy) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' (' + (h.blocks || 0) + ')';
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(Rs.older) + ' | newer ' + f(Rs.newer) + ' | ' + String(RES[id].why).slice(0, 240)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), to: D[T - 1], window: [D[0], D[T - 1]], bar: BAR, ...strip(r), ...(r.info && r.info.months ? { info: { ...r.info, months: undefined } } : {}) }])), isJudged);

// ================= 6. INFORMATION: what the world did to the sectors, and how fast =================
const HS = [1, 5, 20, 60], fundsAll = ALL_ETFS.filter(s => FSTAT[s].coverD > T * 0.5);
const eventStudy = []; for (const ev of EVENTS) { const k = entryIdx(D, ev); if (k < 1) continue; const spy = eventWindow(FUND.SPY.EC, k, HS), rets = {}, ex = {};
  for (const s of fundsAll) { const w = eventWindow(FUND[s].EC, k, HS); rets[s] = Object.fromEntries(HS.map(h => [h, r4(w[h])])); ex[s] = Object.fromEntries(HS.map(h => [h, w[h] !== null && spy[h] !== null ? r4(w[h] - spy[h]) : null])); }
  eventStudy.push({ id: ev.id, d: ev.d, kind: ev.kind, what: ev.what, entry: D[k], baseClose: D[k - 1], rets, vsSpy: ex }); }
const byKind = {}; for (const kind of [...new Set(EVENTS.map(e => e.kind))]) { const E = eventStudy.filter(e => e.kind === kind); byKind[kind] = { events: E.map(e => e.id), funds: {} };
  for (const s of fundsAll) { const row = {}; for (const h of HS) { const v = E.map(e => e.vsSpy[s][h]).filter(x => x !== null); row[h] = v.length ? { avgVsSpy: r4(mean(v)), up: v.filter(x => x > 0).length, n: v.length } : null; }
    const d1 = row[1] && row[1].avgVsSpy, d20 = row[20] && row[20].avgVsSpy; row.shareOfDay20InDay1 = d1 !== null && d20 !== null && Math.abs(d20) > 0.002 ? r4(d1 / d20) : null; byKind[kind].funds[s] = row; } }
const PAIRS = [['USO', 'XLE'], ['BNO', 'XOP'], ['UNG', 'FCG'], ['GLD', 'GDX'], ['CPER', 'COPX'], ['TLT', 'IWM'], ['TLT', 'XLU'], ['TLT', 'KRE'], ['UUP', 'XLK'], ['VIXY', 'SPY'], ['USO', 'ITA'], ['IEF', 'IWM']];
const drv = {}; for (const [a, b] of PAIRS) { if (!FSTAT[a].coverD || !FSTAT[b].coverD) continue; const A = FUND[a].EC, B = FUND[b].EC, S = FUND.SPY.EC; drv[a + '->' + b] = {};
  for (const h of ['older', 'newer']) { const ts = []; for (let t = 1; t < T; t++) if (halfOf(D[t]) === h) ts.push(t);
    const dx = ts.map(t => A[t] > 0 && A[t - 1] > 0 ? A[t] / A[t - 1] - 1 : null), dy = ts.map(t => B[t] > 0 && B[t - 1] > 0 ? B[t] / B[t - 1] - 1 : null), same = corrBeta(dx, dy);
    const lx = [], ly = [], cx = [], cy = []; for (let j = 0; j < ts.length; j += 20) { const t = ts[j]; if (t < 20 || t + 20 >= T) continue; const a0 = retN(A, t, 20), b1 = B[t + 20] > 0 && B[t] > 0 && S[t + 20] > 0 && S[t] > 0 ? (B[t + 20] / B[t] - 1) - (S[t + 20] / S[t] - 1) : null, b0 = retN(B, t, 20);
      lx.push(a0); ly.push(b1); cx.push(a0); cy.push(b0 !== null && retN(S, t, 20) !== null ? b0 - retN(S, t, 20) : null); }
    const lead = corrBeta(lx, ly), same20 = corrBeta(cx, cy);
    drv[a + '->' + b][h] = { dailyCorr: r4(same.corr), dailyBeta: r4(same.beta), days: same.n, same20dCorrVsSpy: r4(same20.corr), next20dCorrVsSpy: r4(lead.corr), next20dBeta: r4(lead.beta), steps: lead.n }; } }
log('event study: ' + eventStudy.length + ' events; driver pairs: ' + Object.keys(drv).length);

// ================= 7. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const scanned = new Set(lines.filter(x => x.type === 'day').map(x => x.d)), sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id));
const toScan = []; for (let t = 0; t < T; t++) if (D[t] >= START && !scanned.has(D[t])) toScan.push(t);
const newLines = [], openBy = new Map(), sigIds = new Set(sigLines.map(x => x.id)), lastT = T - 1, fromT = D.findIndex(d => d >= START);
for (const x of sigLines) if (!resolved.has(x.id)) openBy.set(x.m + '|' + x.sym, true);
if (fromT >= 0) {
  for (const id of IDS) { if (!dataOk(id)) continue; const rot = RULES[id].family === 'rotation' || !!RULES[id].tranche;
    for (const z of SIG[id].filter(z => z.t >= fromT && z.t <= lastT).sort((p, q) => p.t - q.t)) { const sym = symOf(z.I), key = id + '|' + sym; if (!rot && openBy.get(key)) continue;
      const isRot = RULES[id].family === 'rotation', late = z.k <= lastT, hold = z.x - z.k + 1, entryDate = late ? null : dateOf(z.k), exitDate = isRot ? monthEndAfter(late ? nextSession(D[lastT]) : dateOf(z.k)) : null;
      const line = { type: 'signal', id: id + '|' + sym + '|' + D[z.t], m: id, sym, d: D[z.t], close: r4(closeOf(z.I, z.t) ?? NaN), halal: halal(sym), hold, ...(z.ev ? { ev: z.ev } : {}), ...(exitDate ? { exitDate } : {}),
        plan: (late ? 'LATE (data arrived after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + (isRot ? ', sell at the close of ' + exitDate + ' (the month\'s last session)' : ', hold ' + hold + ' sessions'),
        entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
  for (const t of toScan) newLines.push({ type: 'day', d: D[t] }); }
const firstAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo; };
for (const x of sigLines) { const I = instOf(x.sym); let k = x.entryDate ? tOf.get(x.entryDate) : x.late ? firstAfter(x.recordedAfter) : undefined; if (I === undefined || k === undefined || k >= T) { x._state = 'waiting'; continue; }
  const xi = x.exitDate ? (x.exitDate <= D[T - 1] ? tOf.get(x.exitDate) ?? (onOrAfter(D, x.exitDate) - 1) : T) : k + x.hold - 1;
  if (xi > T - 1) { x._state = 'open'; x._k = k; x._mark = ret(I, k, T - 1); continue; }
  const g = ret(I, k, xi), c = ctrlSpan(k, xi); x._state = 'closed'; x._g = g; x._c = c; x._k = k; x._x = xi;
  if (!resolved.has(x.id) && g !== null) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[xi], g: r4(g), net: r4(g - COST), avgStock: c === null ? null : r4(c - COST), spy: r4(spyRet(k, xi)) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
const board = {}, today = {};
for (const id of IDS) { const mine = sigLines.filter(x => x.m === id), closed = mine.filter(x => x._state === 'closed' && x._g !== null && x._g !== undefined).map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c, halal: x.halal })), fr = firstRun[id], st = boardStats(closed);
  board[id] = { name: RULES[id].name, hold: RULES[id].hold, family: RULES[id].family, dataOk: dataOk(id), signals: mine.length, waiting: mine.filter(x => x._state === 'waiting').length, open: mine.filter(x => x._state === 'open').length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: paperReady(st),
    fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  today[id] = { name: RULES[id].name, hold: RULES[id].hold, tier: fr ? fr.verdict : null, newSignals: mine.filter(x => x.recordedAfter === D[lastT] && newLines.includes(x)).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, buy: x._k >= 0 ? D[x._k] : x.entryDate, sinceBuy: r4(x._mark ?? NaN), exitAfter: x.exitDate ? 'the close of ' + x.exitDate : x.hold + ' sessions' })) }; }
const curRot = SIG['MACRO-ROT'].months && SIG['MACRO-ROT'].months.length ? SIG['MACRO-ROT'].months[SIG['MACRO-ROT'].months.length - 1] : null;
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, rotationLatest: curRot, driversToday: Object.fromEntries(Object.entries(FLAGS).map(([k, f]) => [k, !!f[lastT]])), note: 'PAPER ONLY. Macro rules recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a TRADABLE SMALL / PROVEN frozen 5-year verdict (data/macro-lab.json firstRun), or 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost. Event rules record only when a new dated event is added to macro-core.mjs EVENTS. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: scanned ' + toScan.length + ' new session(s); ' + newLines.filter(x => x.type === 'signal').length + ' new signals; ' + sigLines.length + ' in all');

// ================= 8. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'macro-core.mjs header + RULES + EVENTS (24 Oct 2026, before any run) + data/strategy-library.json MACRO-*', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, funds: FSTAT,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock / fund on its other days, > 0 without the 2 best, block t >= ' + TIER2_T + ', better than SPY over the same sessions (not for the SPY rule), the rotation also better than the equal weight of its 6 funds -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN',
  events: EVENTS, firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { ...strip(r), info: r.info ? { ...r.info, months: undefined } : undefined }])) }),
  information: { note: 'information only, never a buy: what each dated event did to every fund (close before the entry session -> close of day 1 / 5 / 20 / 60; vsSpy = minus SPY), averaged by kind; and how each driver moves with its sector (daily correlation / beta; 20-session moves at the same time and the NEXT 20 sessions, vs SPY)', byKind, drivers: drv, eventStudy, rotationMonths: SIG['MACRO-ROT'].months || [] },
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-400)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'macro-lab.mjs -> data/macro-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsSpy: [R.older.vsSpy, R.newer.vsSpy], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: [R.older.win, R.newer.win], why: r.why }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('macro-lab: library not updated: ' + e.message); }
console.log('MACRO LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | funds ok ' + ALL_ETFS.filter(s => FSTAT[s].ok).length + '/' + ALL_ETFS.length + ' | ' + Object.entries(firstRun).map(([k, r]) => k + ' ' + r.verdict).join(', '));
