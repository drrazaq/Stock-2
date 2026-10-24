// SQUAD 8 LAB: PATH EDGE AND SHARE SUPPLY (24 Oct 2026; Stock-2 squads 5-8). Research + a FORWARD PAPER lane; never places an order; no
// Telegram. Rules: squad8-core.mjs RULES + TH (pre-registered 24 Oct 2026 before any run; library ids SQ8-*; the lab writes the same rule
// text into data/strategy-library.json before computing anything).
// 1. DATA (GitHub Actions only; keys only from secrets, never printed; official sources / licensed APIs, no scraping):
//    prices   = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY; dead stocks' later prices
//               in its x rows) + the sessions since from Massive grouped daily bars + splits since the cache day (squad 1 / anomaly pattern).
//               Daily open and close give the overnight / regular-hours split; no minute bars are needed.
//    shares   = data/shares.json.gz (SEC cover counts, 30 days late). tickers -> CIK = shares.json SEC list, data/sec-ciks.json, Massive
//               reference (active + delisted common stocks).
//    splits   = Massive split list from 2017 (reverse splits). IPOs = SEC EDGAR quarterly full index (first 424B4 per company).
//    A source that does not load completely makes ITS rules "NOT RUN" (no verdict frozen); the others run.
// 2. 5-YEAR ONE-SHOT for every rule not yet frozen (value-core judge; halves = signal before / from 2024-01-01; capped yardstick AUD-1).
//    First complete verdict frozen in data/squad8-lab.json firstRun (first-run.mjs freezeEach); later runs = monitoring only.
//    Information only (never frozen): the plain RUNNER base and each rule's complement (runners that did not pass it).
// 3. PAPER LANE from Monday 26 Oct 2026: data/squad8-paper.jsonl, data/squad8-today.json (methods[id].newSignals), data/squad8-board.json.
// DIAG=1: coverage check only (data loaded, signal counts per rule and half), no returns computed, no verdict, no paper line.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, TIER2_T } from './value-core.mjs';
import { RULES, IDS, TH, HOLD, COST, SPLIT, PAPER_START, mean, r4, halfOf, capG, addDays, daysBetween, runnerAt, pathSplit, tugCount, upDownVol, orderly, turnover, hold3At, breakoutSeries,
  splitFix, sharesKnownAt, shareChange, reverseSplitWithin, spacLike, passes, ownAverage, boardStats, paperReady, shapeOf, preRegister } from './squad8-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ8_CACHE || 'squad8-cache', OUT = 'data/squad8-lab.json', PAPER = 'data/squad8-paper.jsonl', TODAY = 'data/squad8-today.json', BOARD = 'data/squad8-board.json';
const DIAG = !!env.DIAG, START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ8_MINUTES || 150) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0);
log('squad 8 lab' + (DIAG ? ' (DIAG: coverage only, no returns)' : '') + '; frozen already: ' + Object.keys(FROZEN).length + '/' + IDS.length);

// ================= 0. PRE-REGISTRATION in the library (before any computation; idempotent) =================
{ const LB = J('data/strategy-library.json', null), ch = preRegister(LB); if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ8 entries pre-registered now'); }

// ================= 1. PRICES (squad 1 / anomaly pattern) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad8-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
const firstAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo; };
const SY = new Map(); for (const d of D) { for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size); if (store.days[d].x) for (const s of store.days[d].x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN), CX = new Float32Array(N).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; } });
store = null;
{ let j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'); if (!j || j.refused) j = await api('/v3/reference/splits?execution_date.gte=' + cacheLast + '&limit=1000'); const rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; C[q] /= r; CX[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), ser = (A, i) => A.subarray(i * T, i * T + T);
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS);
// liquidity: close 5 USD+ and 20-session average traded value 5M USD+ (main rows only)
const LIQ = new Uint8Array(N); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = C[b + t] * V[b + t]; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const w = C[b + t - 20] * V[b + t - 20]; if (isFinite(w)) { s -= w; n--; } } if (t >= 19 && n === 20 && C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqAt = new Map(); const liqList = (t) => { if (!liqAt.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqAt.set(t, a); } return liqAt.get(t); };
const closeAt = (i, x, k) => { for (let q = Math.min(x, T - 1); q >= k; q--) { const z = C[i * T + q]; if (z > 0) return z; const y = CX[i * T + q]; if (y > 0) return y; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1 || k >= T) return null; const e = O[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
// the average liquid stock (every second one, as the other labs), each gross return capped at +300% like the trades (AUD-1 corrected rule)
const cMemo = new Map(); const ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
const FIRST = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = 0; t < T; t++) if (C[i * T + t] > 0 || CX[i * T + t] > 0) { FIRST[i] = t; break; }
const fullC = (i) => { const a = new Float32Array(T).fill(NaN); for (let t = 0; t < T; t++) { const z = C[i * T + t] > 0 ? C[i * T + t] : CX[i * T + t]; if (z > 0) a[t] = z; } return a; };
const STATUS = { price: { ok: T > 1000, sessions: T, from: D[0], to: D[T - 1], stocks: NS } };

// ================= 2. DATA SOURCES =================
async function get(url, opt = {}) { for (let a = 0; a < 3; a++) { try { const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(opt.timeout || 120000) }); if (r.status === 404) return { status: 404, ok: false }; if (r.status === 429 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; } return r; } catch (e) { await sleep(2000 * (a + 1)); } } return null; }
// ---- 2a. identities: SEC tickers (shares.json), data/sec-ciks.json, Massive reference (active + delisted common stocks) ----
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {}, c: {} });
const REF = { ok: false, cik: {} }; { const f = SC + '/ref.json.gz'; let x = JZ(f, null);
  if (!x || Date.now() - Date.parse(x.at) > 20 * 864e5) { const cik = {}; let n = 0, okAll = true;
    for (const active of [true, false]) { let path = '/v3/reference/tickers?market=stocks&type=CS&active=' + active + '&limit=1000', pages = 0;
      while (path && pages < 200) { const j = await api(path); pages++; if (!j || j.refused || !Array.isArray(j.results)) { okAll = false; break; } for (const r of j.results) if (r && /^[A-Z.]{1,6}$/.test(r.ticker || '')) { n++; if (r.cik && !cik[r.ticker]) cik[r.ticker] = String(+r.cik); }
        path = j.next_url ? j.next_url.replace(/^https?:\/\/[^/]+/, '') : null; } }
    if (okAll && n > 3000) { x = { at: new Date().toISOString(), cik }; WZ(f, x); } else log('Massive reference incomplete (' + n + ' tickers)'); }
  if (x) { REF.ok = true; REF.cik = x.cik || {}; } log('reference: ' + Object.keys(REF.cik).length + ' tickers with a CIK'); }
const symCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(a); const y = SECCIK[s]; if (y) return String(y[0]); return REF.cik[s] || null; };
const cikSyms = new Map(); for (const s of SYMS) { const c = symCik(s); if (c) (cikSyms.get(c) || cikSyms.set(c, []).get(c)).push(s); }
const SHROWS = new Map(); const shRows = (cik) => { if (!SHROWS.has(cik)) SHROWS.set(cik, SH.c[cik] ? splitFix(SH.c[cik]) : null); return SHROWS.get(cik); };
STATUS.shares = { ok: Object.keys(SH.c || {}).length > 3000, companies: Object.keys(SH.c || {}).length, at: SH.at || null, lagDays: 30 };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
// ---- 2b. splits (Massive, 2017 on; reverse = split_to < split_from) ----
const SPL = new Map(); { const f = SC + '/splits.json.gz'; let x = JZ(f, null);
  if (!x || Date.now() - Date.parse(x.at) > 6 * 864e5) { const rows = []; let done = false;
    for (const base of ['/stocks/v1/splits?execution_date.gte=2017-01-01&limit=1000', '/v3/reference/splits?execution_date.gte=2017-01-01&limit=1000']) { let path = base, pages = 0; rows.length = 0;
      while (path && pages < 500) { const j = await api(path); pages++; if (!j || j.refused || !Array.isArray(j.results)) break; for (const r of j.results) if (r && r.ticker && r.execution_date && !/dividend/i.test(String(r.adjustment_type || ''))) rows.push([String(r.ticker).toUpperCase(), r.execution_date, +r.split_from, +r.split_to]);
        if (!j.next_url) { done = true; break; } path = j.next_url.replace(/^https?:\/\/[^/]+/, ''); }
      if (done && rows.length > 500) break; done = false; }
    if (done && rows.length > 500) { x = { at: new Date().toISOString(), rows: [...rows] }; WZ(f, x); } else log('splits: download incomplete (' + rows.length + ' rows)'); }
  let first = null; if (x) for (const [sym, d, from, to] of x.rows) { if (!(from > 0 && to > 0)) continue; (SPL.get(sym) || SPL.set(sym, []).get(sym)).push({ d, from, to }); if (!first || d < first) first = d; }
  const nRev = x ? x.rows.filter(r => r[3] < r[2]).length : 0;
  STATUS.splits = { ok: !!x && x.rows.length > 500 && !!first && first <= '2018-12-31', rows: x ? x.rows.length : 0, reverse: nRev, first, at: x && x.at }; log('splits: ' + STATUS.splits.rows + ' rows (' + nRev + ' reverse) from ' + first); }
// ---- 2c. SEC EDGAR quarterly index: first 424B4 per company (IPOs), from 2019 Q1 ----
const IPO = new Map(); { const now = new Date(), first = new Map(); let qOk = 0, qAll = 0;
  for (let y = 2019; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) { const qs = Date.UTC(y, (q - 1) * 3, 1); if (qs > now.getTime()) continue; qAll++;
    const cur = now.getTime() < Date.UTC(y, q * 3, 1) + 7 * 864e5, f = SC + '/edgar/' + y + 'q' + q + '.json'; let rows = cur ? null : J(f, null);
    if (!rows) { await sleep(local(env.SEC_BASE) ? 0 : 250); const r = await get(SEC + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.gz', { headers: { 'User-Agent': UA }, timeout: 300000 }); let txt = null;
      if (r && r.ok) { try { txt = zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString('latin1'); } catch (e) { txt = null; } }
      if (txt) { rows = []; for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length !== 5 || p[2].trim() !== '424B4' || !/^\d+$/.test(p[0])) continue; rows.push([String(+p[0]), p[1].trim(), p[3].trim()]); } W(f, rows); } }
    if (!rows) continue; qOk++; for (const [cik, name, d] of rows) { const b = first.get(cik); if (!b || d < b.d) first.set(cik, { d, name }); } }
  for (const [cik, x] of first) { if (/\b(acquisition|blank check)\b/i.test(x.name)) continue; for (const s of cikSyms.get(cik) || []) { const i = SY.get(s), f0 = FIRST[i], tI = firstAfter(addDays(x.d, -1));
      if (!(f0 > 5 && tI > 0 && f0 >= tI && f0 - tI <= 15)) continue; if (spacLike(fullC(i), f0)) continue; IPO.set(i, x.d); break; } }
  STATUS.ipo = { ok: qAll > 0 && qOk === qAll, quarters: qAll, read: qOk, companies424B4: first.size, iposInCache: IPO.size, note: 'an IPO before the cache start (' + D[0] + ') cannot be dated by first price and is left out (rule needs 200-730 days, so early-window signals are thinner)' };
  log('EDGAR 424B4: ' + first.size + ' companies, ' + IPO.size + ' IPOs in the price cache (' + qOk + '/' + qAll + ' quarters)'); }

// ================= 3. SIGNALS =================
// RUNNERS: every first-crossing runner with its features; HOLD3: confirmed breakouts. A signal: { t, i, k = t+1, x = t+HOLD }.
const RUNNERS = [], HOLDS = [];
for (let i = 0; i < NS; i++) { if (i === spyI) continue; let any = false; for (let t = 0; t < T; t++) if (LIQ[i * T + t]) { any = true; break; } if (!any) continue;
  const c = ser(C, i), o = ser(O, i), v = ser(V, i), bo = breakoutSeries(c), s = SYMS[i], cik = symCik(s), rows = cik ? shRows(cik) : null, spl = SPL.get(s) || null, ipoD = IPO.get(i) || null;
  for (let t = 12; t < T; t++) { if (!LIQ[i * T + t]) continue;
    if (t >= TH.boLook + TH.boQuiet + TH.boHold && hold3At(c, t, undefined, bo)) HOLDS.push({ t, i, k: t + 1, x: t + HOLD });
    const run = runnerAt(c, o, t); if (run === null) continue; const d = D[t], ps = pathSplit(o, c, t), ud = upDownVol(c, v, t), od = orderly(c, t), sh = rows ? sharesKnownAt(rows, d) : null;
    const f = { run, nightShare: ps ? ps.nightShare : null, tug: tugCount(o, c, t), ud: ud ? ud.ratio : null, upDays: od ? od.upDays : null, maxShare: od ? od.maxShare : null,
      shChg: rows ? shareChange(rows, d) : null, turn: sh ? turnover(v, t, sh) : null, ipoDays: ipoD && ipoD <= d ? daysBetween(ipoD, d) : null, rs3: STATUS.splits.ok ? reverseSplitWithin(spl, d) : null };
    RUNNERS.push({ t, i, k: t + 1, x: t + HOLD, f }); } }
log('runners ' + RUNNERS.length + ', confirmed breakouts ' + HOLDS.length);
const H = () => HOLD;
const SIGS = {}, COMP = {}; for (const id of IDS) { if (id === 'SQ8-HOLD3') { SIGS[id] = HOLDS; COMP[id] = []; continue; } SIGS[id] = RUNNERS.filter(z => passes(id, z.f) === true); COMP[id] = RUNNERS.filter(z => passes(id, z.f) === false); }
const FAMILY_OK = { path: () => true, shares: () => STATUS.shares.ok, ipo: () => STATUS.ipo.ok, 'shares+splits': () => STATUS.shares.ok && STATUS.splits.ok };
const familyOk = (id) => STATUS.price.ok && !!FAMILY_OK[RULES[id].family]();
const familyNote = (id) => RULES[id].family + ' data: ' + JSON.stringify({ shares: STATUS.shares, ipo: STATUS.ipo, splits: STATUS.splits }).slice(0, 400);
const COUNTS = {}; for (const id of IDS) { const s = SIGS[id].filter(z => z.x < T); COUNTS[id] = { dataOk: familyOk(id), older: s.filter(z => halfOf(D[z.t]) === 'older').length, newer: s.filter(z => halfOf(D[z.t]) === 'newer').length, complement: COMP[id].filter(z => z.x < T).length }; }
COUNTS.RUNNER = { older: RUNNERS.filter(z => z.x < T && halfOf(D[z.t]) === 'older').length, newer: RUNNERS.filter(z => z.x < T && halfOf(D[z.t]) === 'newer').length,
  knownShares: RUNNERS.filter(z => z.f.shChg !== null).length, knownTurn: RUNNERS.filter(z => z.f.turn !== null).length, knownIpo: RUNNERS.filter(z => z.f.ipoDays !== null).length };
log('signals with a complete hold (before one-open / yardstick filters): ' + IDS.map(id => id + ' ' + (COUNTS[id].dataOk ? COUNTS[id].older + '/' + COUNTS[id].newer : 'NO DATA')).join(', ') + ' | runners ' + JSON.stringify(COUNTS.RUNNER));
if (DIAG) { W('data/squad8-diag.json', { generatedAt: new Date().toISOString(), note: 'DIAG: data coverage and signal counts only; no returns computed, no verdict', window: [D[0], D[T - 1]], data: STATUS, signals: COUNTS });
  console.log('SQUAD 8 DIAG ' + D[0] + ' to ' + D[T - 1] + ' | ' + Object.entries(STATUS).map(([k, s]) => k + (s.ok ? ' ok' : ' MISSING')).join(', ')); process.exit(0); }

// ================= 4. 5-YEAR ONE-SHOT =================
const need = IDS.filter(id => !FROZEN[id]);
function tradesOf(sigs) { const out = [], busyUntil = new Map(), spans = new Map();
  for (const z of [...sigs].sort((p, q) => p.t - q.t || p.i - q.i)) { if (z.x >= T) continue;
    if ((busyUntil.get(z.i) ?? -1) >= z.k) continue; const g0 = ret(z.i, z.k, z.x); if (g0 === null || !isFinite(g0)) continue; const g = capG(g0), c = ctrlSpan(z.k, z.x); if (c === null) continue;
    busyUntil.set(z.i, z.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, z.x]); out.push({ t: z.t, s: SYMS[z.i], i: z.i, k: z.k, x: z.x, g, c, half: halfOf(D[z.t]) }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.x - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 21, to: T - 1, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  return out; }
const statsOf = (tr) => ({ older: halfStat(tr.filter(z => z.half === 'older'), HOLD), newer: halfStat(tr.filter(z => z.half === 'newer'), HOLD), all: halfStat(tr, HOLD) });
const brief = (h) => h && h.n ? { n: h.n, avg: h.avg, avgStress: h.avgStress, edge: h.edge, vsOwn: h.vsOwn, noTop2: h.noTop2, tBlock: h.tBlock, win: h.win } : { n: 0 };
const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
log('5-year one-shot for ' + need.length + ' rules not yet frozen');
const RES = {};
for (const id of need) { if (left() < 8 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  if (!familyOk(id)) { RES[id] = { verdict: 'NOT RUN', why: 'data not available this run: ' + familyNote(id) }; log('- ' + id + ': NOT RUN (' + RULES[id].family + ' data)'); continue; }
  const tr = tradesOf(SIGS[id]), R = statsOf(tr), v = judge(R, { bar: BAR });
  RES[id] = { ...v, results: R, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold: HOLD, kind: 'buy', family: RULES[id].family, name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1 corrected: trades and yardstick capped at +300% alike)',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + String(RES[id].why).slice(0, 300)); }
// information only: the plain runner base and each rule's complement (never frozen, never a buy)
const INFO = { note: 'INFORMATION ONLY (never frozen, never a buy): the same engine on the plain RUNNER base and on the runners that did NOT pass each rule (feature known).' };
if ((need.length || !PREV.informationFirstRun) && left() > 10 * 60e3) { const R0 = statsOf(tradesOf(RUNNERS)); INFO.RUNNER = { verdictIfJudged: judge(R0, { bar: BAR }).verdict, older: brief(R0.older), newer: brief(R0.newer) }; log('- info RUNNER base: older ' + f(R0.older) + ' | newer ' + f(R0.newer));
  for (const id of IDS) { if (id === 'SQ8-HOLD3' || !familyOk(id) || left() < 10 * 60e3) continue; const Rc = statsOf(tradesOf(COMP[id])); INFO['not ' + id] = { older: brief(Rc.older), newer: brief(Rc.newer) }; log('- info runners NOT ' + id + ': older ' + f(Rc.older) + ' | newer ' + f(Rc.newer)); } }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);
const infoFirst = PREV.informationFirstRun || (INFO.RUNNER ? { at: new Date().toISOString(), window: [D[0], D[T - 1]], ...INFO } : null);

// ================= 5. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const scanned = new Set(lines.filter(x => x.type === 'day').map(x => x.d)), sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id));
const toScan = []; for (let t = 0; t < T; t++) if (D[t] >= START && !scanned.has(D[t])) toScan.push(t);
const newLines = [], openBy = new Map(), sigIds = new Set(sigLines.map(x => x.id)), lastT = T - 1;
for (const x of sigLines) if (!resolved.has(x.id)) openBy.set(x.m + '|' + x.sym, true);
const fromT = D.findIndex(d => d >= START);
const nextSess = (d) => { let x = Date.parse(d + 'T00:00:00Z') + 864e5; while ([0, 6].includes(new Date(x).getUTCDay()) || ['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06'].includes(iso(x))) x += 864e5; return iso(x); };
if (fromT >= 0) { for (const id of IDS) { if (!familyOk(id)) continue;
    for (const z of SIGS[id].filter(z => z.t >= fromT && z.t <= lastT).sort((p, q) => p.t - q.t)) { const sym = SYMS[z.i], key = id + '|' + sym; if (openBy.get(key)) continue;
      const late = z.k <= lastT, entryDate = late ? null : nextSess(D[lastT]);
      const line = { type: 'signal', id: id + '|' + sym + '|' + D[z.t], m: id, sym, d: D[z.t], close: r4(C[z.i * T + z.t]), halal: halal(sym), hold: HOLD,
        plan: late ? 'LATE (data arrived after the rule\'s entry): buy at the next open after ' + D[lastT] + ', hold ' + HOLD + ' sessions' : 'buy at the open of ' + entryDate + ', hold ' + HOLD + ' sessions', entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
  for (const t of toScan) newLines.push({ type: 'day', d: D[t] }); }
const board = {}, today = {};
for (const x of sigLines) { const k = x.entryDate ? tOf.get(x.entryDate) : x.late ? firstAfter(x.recordedAfter) : undefined; if (k === undefined || k >= T) { x._state = 'waiting'; continue; } const xi = k + x.hold - 1, i = SY.get(x.sym);
  if (xi > T - 1) { x._state = 'open'; x._k = k; x._mark = ret(i, k, T - 1); continue; }
  const g = ret(i, k, xi), c = ctrlSpan(k, xi); x._state = 'closed'; x._g = g; x._c = c; x._k = k;
  if (!resolved.has(x.id) && g !== null) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[xi], g: r4(g), net: r4(capG(g) - COST), avgStock: c === null ? null : r4(c - COST) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
for (const id of IDS) { const mine = sigLines.filter(x => x.m === id), closed = mine.filter(x => x._state === 'closed' && x._g !== null && x._g !== undefined).map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c, halal: x.halal })), fr = firstRun[id], st = boardStats(closed);
  board[id] = { name: RULES[id].name, hold: HOLD, family: RULES[id].family, dataOk: familyOk(id), signals: mine.length, waiting: mine.filter(x => x._state === 'waiting').length, open: mine.filter(x => x._state === 'open').length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: paperReady(st),
    fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  today[id] = { name: RULES[id].name, hold: HOLD, tier: fr ? fr.verdict : null, newSignals: mine.filter(x => x.recordedAfter === D[lastT] && !x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan })),
    late: mine.filter(x => x.recordedAfter === D[lastT] && x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, buy: D[x._k], sinceBuy: r4(x._mark ?? NaN), exitAfter: HOLD + ' sessions' })) }; }
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, note: 'PAPER ONLY. Squad 8 (path edge and share supply) rules recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a frozen 5-year verdict that meets the TRY SMALL standard (data/squad8-lab.json firstRun) or 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: scanned ' + toScan.length + ' new session(s); ' + newLines.filter(x => x.type === 'signal').length + ' new signals; ' + sigLines.length + ' in all');

// ================= 6. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), squad: 8, philosophy: 'real demand vs fragile rallies: the PATH of a runner\'s gain and the SHARE SUPPLY behind it', preRegistered: 'squad8-core.mjs RULES + TH (24 Oct 2026, before any run) + data/strategy-library.json SQ8-*',
  window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, hold: HOLD, data: STATUS, signalCounts: COUNTS,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= ' + TIER2_T + ' -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN. Gross returns capped at +300% for trades and yardsticks alike (AUD-1).',
  firstRun, informationFirstRun: infoFirst, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])), information: INFO }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-400)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'squad8-lab.mjs -> data/squad8-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: [R.older.win, R.newer.win], why: r.why }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad8-lab: library not updated: ' + e.message); }
console.log('SQUAD 8 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + Object.entries(STATUS).map(([k, s]) => k + (s.ok ? ' ok' : ' MISSING')).join(', '));
