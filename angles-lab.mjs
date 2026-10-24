// ANGLES LAB (24 Oct 2026; owner: "more, different ways to make money"). Angles NOT yet tested in data/strategy-library.json, each run ONCE
// as pre-registered (angles-core.mjs ANGLES, ids ANG-*; written into the library before any computation), plus a FORWARD PAPER lane from
// Monday 26 Oct 2026. Research only; never places an order; no Telegram.
// 1. DATA (GitHub Actions only; keys only from secrets, never printed):
//    prices   = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY; dead stocks' later prices in
//               its x rows) + the sessions since, from Massive grouped daily bars + splits since the cache day (anomaly-lab pattern).
//    shares   = data/shares.json.gz (SEC share counts, 30 days late). tickers = Massive reference (common stocks, active and delisted, with CIK).
//    Russell  = rank-day market values (close x shares); rank days before the cache from Massive grouped bars of that day.
//    IPOs     = SEC EDGAR quarterly index (first 424B4) + first session in the price cache. 8-K items = SEC submissions API (data.sec.gov).
//    earnings = Nasdaq calendar (Agent A's a-cache READ ONLY + own cache). highs/lows = Massive daily bars per gap candidate.
//    F-score  = quality.mjs's yearly SEC cache (study-cache/fund.json.gz, READ ONLY). dividends per share + debt = SEC companyfacts (bulk zip).
//    splits   = Massive split list. SPUS / HLAL = Massive (else Nasdaq) daily history.
//    A source that does not load makes ITS angles "NOT RUN" (nothing frozen); the others run.
// 2. 5-YEAR ONE-SHOT for every angle not yet frozen, judged at the tier-2 standard (value-core judge; halves = signal before / from
//    2024-01-01); first complete verdict frozen in data/angles-lab.json firstRun (same firstRun / results.older / results.newer format as
//    data/value-lab.json, with `hold` in sessions, which the TRY SMALL lane reads). Later runs = monitoring only.
// 3. PAPER LANE (from Monday 26 Oct 2026): each session's new signals -> data/angles-paper.jsonl (frozen plan: next open, hold, owner's ZAD
//    halal mark), resolved after the hold; data/angles-today.json (methods[id].newSignals) and data/angles-board.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, TIER2_T } from './value-core.mjs';
import { ownAverage } from './anomaly-core.mjs';
import { dcaVsDip } from './hold-core.mjs';
import { ANGLES, INFO, SKIPPED, IDS, TRANCHES, COST, SPLIT, PAPER_START, RUSSELL, FOMC, mean, r4, halfOf, addDays, onOrAfter, onOrBefore, avgVol, pickBottom, weekEnds, monthEnds, monthStarts,
  rankByValue, russellAdds, russellDowns, has8k, gapUp, holdsAbove, lowTurnSeries, fscoreOf, knownYear, spacLike, ipoBase, stopExit, divStreak, debtAt, fomcTrades, firstSplits,
  boardStats, paperReady, nextSession, reactionIdx, preRegister } from './angles-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', AC = env.ANG_CACHE || 'angles-cache', OUT = 'data/angles-lab.json', PAPER = 'data/angles-paper.jsonl', TODAY = 'data/angles-today.json', BOARD = 'data/angles-board.json';
const START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.ANG_MINUTES || 230) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(AC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0);

// ================= 0. PRE-REGISTRATION in the library (before any computation; idempotent) =================
{ const LB = J('data/strategy-library.json', null), ch = preRegister(LB); if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); log('library: ' + ch + ' ANG entries pre-registered now'); }

// ================= 1. PRICES =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('angles-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN), CX = new Float32Array(N).fill(NaN), VX = new Float32Array(N).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) { CX[q * T + t] = x.x.c[j]; if (x.x.v) VX[q * T + t] = x.x.v[j]; } } });
const SIC = store.sic || {}; store = null;
{ let j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'); if (!j || j.refused) j = await api('/v3/reference/splits?execution_date.gte=' + cacheLast + '&limit=1000'); const rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; C[q] /= r; CX[q] /= r; V[q] *= r; VX[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), ser = (A, i) => A.subarray(i * T, i * T + T);
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS);
// liquidity: close 5 USD+ and 20-session average traded value 5M USD+ (main rows only); DV = that 20-session average
const LIQ = new Uint8Array(N), DV = new Float32Array(N); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = C[b + t] * V[b + t]; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const w = C[b + t - 20] * V[b + t - 20]; if (isFinite(w)) { s -= w; n--; } } if (n) DV[b + t] = s / Math.max(n, 1); if (t >= 19 && n === 20 && C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqAt = new Map(); const liqList = (t) => { if (!liqAt.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqAt.set(t, a); } return liqAt.get(t); };
const pxAt = (i, t) => { const z = C[i * T + t]; return z > 0 ? z : CX[i * T + t] > 0 ? CX[i * T + t] : null; };
const closeAt = (i, x, k) => { for (let q = Math.min(x, T - 1); q >= k; q--) { const z = pxAt(i, q); if (z) return z; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1 || k >= T) return null; const e = O[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const cMemo = new Map(); const ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; const g = ret(i, k, x); if (g !== null && Math.abs(g) < 3) v.push(g); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
const FIRST = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = 0; t < T; t++) if (C[i * T + t] > 0 || CX[i * T + t] > 0) { FIRST[i] = t; break; }
const fullC = (i) => { const a = new Float32Array(T).fill(NaN); for (let t = 0; t < T; t++) { const z = pxAt(i, t); if (z) a[t] = z; } return a; };
const fullV = (i) => { const a = new Float32Array(T).fill(NaN); for (let t = 0; t < T; t++) { const z = V[i * T + t] > 0 ? V[i * T + t] : VX[i * T + t]; if (z > 0) a[t] = z; } return a; };
// a session index for any date: inside the data, or counted forward on the NYSE calendar past the newest close (paper lane)
const idxOf = (d) => { if (d <= D[T - 1]) return onOrBefore(D, d); let x = T - 1, s = D[T - 1]; while (s < d) { s = nextSession(s); x++; } return x; };
const dateOf = (x) => { if (x < T) return D[x]; let s = D[T - 1]; for (let q = T - 1; q < x; q++) s = nextSession(s); return s; };

// ---- identities: SEC tickers, SEC CIK list, Massive reference (active + delisted common stocks) ----
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {}, c: {} }), STATUS = {};
const REF = { ok: false, cs: new Set(), cik: {} }; { const f = AC + '/ref.json.gz'; let x = JZ(f, null);
  if (!x || Date.now() - Date.parse(x.at) > 20 * 864e5) { const cs = [], cik = {}; let okAll = true;
    for (const active of [true, false]) { let path = '/v3/reference/tickers?market=stocks&type=CS&active=' + active + '&limit=1000', pages = 0;
      while (path && pages < 200) { const j = await api(path); pages++; if (!j || j.refused || !Array.isArray(j.results)) { okAll = false; break; } for (const r of j.results) if (r && /^[A-Z.]{1,6}$/.test(r.ticker || '')) { cs.push(r.ticker); if (r.cik && !cik[r.ticker]) cik[r.ticker] = String(+r.cik); }
        path = j.next_url ? j.next_url.replace(/^https?:\/\/[^/]+/, '') : null; } }
    if (okAll && cs.length > 3000) { x = { at: new Date().toISOString(), cs, cik }; WZ(f, x); } else log('Massive reference incomplete (' + cs.length + ' tickers)'); }
  if (x) { REF.ok = true; for (const s of x.cs) REF.cs.add(s); REF.cik = x.cik || {}; } STATUS.ref = { ok: REF.ok, tickers: REF.cs.size, at: x && x.at }; log('reference: ' + REF.cs.size + ' common-stock tickers'); }
const symCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(a); const y = SECCIK[s]; if (y) return String(y[0]); return REF.cik[s] || null; };
const cikSyms = new Map(); for (const s of SYMS) { const c = symCik(s); if (c) (cikSyms.get(c) || cikSyms.set(c, []).get(c)).push(s); }
const sicOf = (s) => { const x = SIC[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECCIK[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
const finCo = (s) => { const c = sicOf(s); return !!c && c[0] === '6'; };
const sharesKnown = (cik, d) => { const a = SH.c[cik]; if (!a) return null; const lim = iso(Date.parse(d + 'T00:00:00Z') - 30 * 864e5); let v = null; for (const [e, n] of a) if (e <= lim) v = n; return v; };
const sharesAtYearEnd = (cik, y) => { const a = SH.c[cik]; if (!a) return null; let v = null; for (const [e, n] of a) { if (e <= y + '-12-31' && e >= y + '-07-01') v = n; } return v; };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const isCS = (s) => !REF.ok || REF.cs.has(s);
// TOP 500 by market value among liquid common stocks (one ticker per company: the most traded)
const topMemo = new Map(); function top500(t) { if (t < 0) return new Set(); if (topMemo.has(t)) return topMemo.get(t); const best = new Map();
  for (const i of liqList(t)) { const s = SYMS[i]; if (!isCS(s)) continue; const cik = symCik(s); if (!cik) continue; const sh = sharesKnown(cik, D[t]); if (!(sh > 0)) continue; const mv = C[i * T + t] * sh, dv = DV[i * T + t], b = best.get(cik); if (!b || dv > b.dv) best.set(cik, { i, mv, dv }); }
  const set = new Set([...best.values()].sort((a, b) => b.mv - a.mv).slice(0, 500).map(x => x.i)); topMemo.set(t, set); return set; }

// ================= 2. DATA SOURCES =================
async function get(url, opt = {}) { for (let a = 0; a < 3; a++) { try { const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(opt.timeout || 120000) }); if (r.status === 404) return { status: 404, ok: false }; if (r.status === 429 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; } return r; } catch (e) { await sleep(2000 * (a + 1)); } } return null; }
async function download(url, file) { try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 30 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }

// ---- 2a. Russell: market values on each rank day (before the cache: Massive grouped bars of that day) ----
const PRE = {}; { let okAll = true; for (const y of RUSSELL) { if (y.rank >= D[0]) continue; const f = AC + '/pre-' + y.rank + '.json'; let m = J(f, null);
    if (!m) { const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + y.rank + '?adjusted=true'); if (j && Array.isArray(j.results) && j.results.length > 1000) { m = {}; for (const x of j.results) if (x && x.T && x.c > 0) m[x.T] = [x.c, x.v || 0]; W(f, m); } }
    if (m) PRE[y.rank] = m; else okAll = false; }
  STATUS.russell = { ok: REF.ok && Object.keys(SH.c).length > 1000, allPreRankDays: okAll, preRankDays: Object.keys(PRE), ref: REF.ok };   /* a rank-day pair without prices is skipped and listed (Massive history reaches back 5 years only) */ log('Russell pre-cache rank days: ' + Object.keys(PRE).join(', ')); }
// Map cik -> { mv, i (the most traded ticker in the cache, or -1) } on a rank day
function valuesOn(date) { const out = new Map(), t = tOf.get(date);
  const add = (s, px, dv) => { if (!isCS(s) || !(px > 0)) return; const cik = symCik(s); if (!cik) return; const sh = sharesKnown(cik, date); if (!(sh > 0)) return; const i = SY.has(s) ? SY.get(s) : -1, b = out.get(cik); if (!b || dv > b.dv) out.set(cik, { mv: px * sh, i, dv }); };
  if (t !== undefined) { for (let i = 0; i < NS; i++) { if (i === spyI) continue; const px = pxAt(i, t); if (px) add(SYMS[i], px, DV[i * T + t] || 0); } }
  else if (PRE[date]) for (const [s, [c, v]] of Object.entries(PRE[date])) add(s, c, c * v);
  return out; }

// ---- 2b. SEC EDGAR quarterly index: first 424B4 per company (IPOs) ----
const IPO = []; { const y0 = 2021, now = new Date(), first = new Map(); let qOk = 0, qAll = 0;
  for (let y = y0; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) { const qs = Date.UTC(y, (q - 1) * 3, 1); if (qs > now.getTime() || (y === y0 && q < 3)) continue; qAll++;
    const cur = now.getTime() < Date.UTC(y, q * 3, 1) + 7 * 864e5, f = AC + '/edgar/' + y + 'q' + q + '.json'; let rows = cur ? null : J(f, null);
    if (!rows && left() > 60 * 60e3) { await sleep(local(env.SEC_BASE) ? 0 : 250); const r = await get(SEC + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.gz', { headers: { 'User-Agent': UA }, timeout: 300000 }); let txt = null;
      if (r && r.ok) { try { txt = zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString('latin1'); } catch (e) { txt = null; } }
      if (txt) { rows = []; for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length !== 5 || p[2].trim() !== '424B4' || !/^\d+$/.test(p[0])) continue; rows.push([String(+p[0]), p[1].trim(), p[3].trim()]); } W(f, rows); } }
    if (!rows) continue; qOk++; for (const [cik, name, d] of rows) { const b = first.get(cik); if (!b || d < b.d) first.set(cik, { d, name }); } }
  for (const [cik, x] of first) { if (/\b(acquisition|blank check)\b/i.test(x.name)) continue; for (const s of cikSyms.get(cik) || []) { const i = SY.get(s), f0 = FIRST[i], tI = onOrAfter(D, x.d); if (!(f0 > 5 && tI > 0 && f0 >= tI && f0 - tI <= 15)) continue;
      if (sicOf(s) === '6770' || spacLike(fullC(i), f0)) continue; IPO.push({ i, sym: s, d: x.d, f0 }); break; } }
  STATUS.edgar = { ok: qAll > 0 && qOk === qAll, quarters: qAll, read: qOk, ipos: IPO.length }; log('EDGAR 424B4: ' + first.size + ' companies, ' + IPO.length + ' IPOs in the price cache (' + qOk + '/' + qAll + ' quarters)'); }

// ---- 2c. Nasdaq earnings calendar ----
const NQ_HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
const REPORTS = []; { const days = []; for (let x = Date.parse(D[0] + 'T12:00:00Z'); x <= Date.now(); x += 864e5) { const w = new Date(x).getUTCDay(); if (w > 0 && w < 6) days.push(iso(x)); }
  let fetched = 0, miss = 0; const old = iso(Date.now() - 7 * 864e5);
  for (const d of days) { let rows = d < old ? (J(AC + '/nasdaq/' + d + '.json', null) || J('a-cache/nasdaq/' + d + '.json', null) || J('anomaly-cache/nasdaq/' + d + '.json', null)) : null;
    if (!rows) { if (left() < 100 * 60e3) { miss++; continue; } await sleep(local(env.NASDAQ_BASE) ? 0 : 350); fetched++; const r = await get(NQ + '/api/calendar/earnings?date=' + d, { headers: NQ_HEAD, timeout: 30000 }); const j = r && r.ok ? await r.json().catch(() => null) : null;
      if (!j || !j.data) { miss++; continue; } rows = (j.data.rows || []).map(x => { const s = String(x.symbol || '').trim(); if (!/^[A-Z]{1,5}$/.test(s)) return null; return [s, x.time === 'time-pre-market' ? 'bmo' : x.time === 'time-after-hours' ? 'amc' : null]; }).filter(Boolean); W(AC + '/nasdaq/' + d + '.json', rows); }
    for (const r of rows) REPORTS.push({ sym: r[0], d, time: r[1] }); }
  STATUS.earn = { ok: miss <= days.length * 0.05, days: days.length, missing: miss, fetchedNow: fetched, reports: REPORTS.length }; log('Nasdaq calendar: ' + REPORTS.length + ' report rows, ' + miss + ' days missing, ' + fetched + ' fetched now'); }

// ---- 2d. quality.mjs yearly SEC cache (F-score) ----
const F = JZ(env.FUND_CACHE || 'study-cache/fund.json.gz', null); STATUS.fund = { ok: !!(F && F.v && Object.keys(F.v).length > 500), companies: F && F.v ? Object.keys(F.v).length : 0 };
const fsMemo = new Map(), fsOf = (i, t) => { const s = SYMS[i], y = knownYear(D[t]), k = s + '_' + y; if (!fsMemo.has(k)) { const cik = finCo(s) ? null : symCik(s); fsMemo.set(k, cik && F ? fscoreOf(F.v[cik], y, sharesAtYearEnd(cik, y), sharesAtYearEnd(cik, y - 1)) : null); } return fsMemo.get(k); };

// ---- 2e. SEC companyfacts: dividends per share (USD/shares) and debt (USD), compact ----
const DPS_TAGS = ['CommonStockDividendsPerShareDeclared', 'CommonStockDividendsPerShareCashPaid'], DEBT_TAGS = ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings'];
const compact = (j) => { const out = {}, g = j && j.facts && j.facts['us-gaap']; if (!g) return out;
  for (const tag of DPS_TAGS) { const u = g[tag] && g[tag].units && g[tag].units['USD/shares']; if (!Array.isArray(u)) continue; const rows = [], seen = new Set();
    for (const x of u) { if (!x || !x.start || !x.end || !x.filed || !isFinite(x.val) || x.end < '2012-01-01') continue; const k = x.start + '|' + x.end + '|' + x.val + '|' + x.filed; if (seen.has(k)) continue; seen.add(k); rows.push([x.start, x.end, x.val, x.filed]); }
    if (rows.length) out[tag] = rows; }
  for (const tag of DEBT_TAGS) { const u = g[tag] && g[tag].units && g[tag].units.USD; if (!Array.isArray(u)) continue; const rows = [], seen = new Set();
    for (const x of u) { if (!x || !x.end || !x.filed || !isFinite(x.val) || x.end < '2019-01-01' || x.start) continue; const k = x.end + '|' + x.val + '|' + x.filed; if (seen.has(k)) continue; seen.add(k); rows.push([x.end, x.val, x.filed]); }
    if (rows.length) out[tag] = rows; } return out; };
const MS = monthStarts(D);
let FX = JZ(AC + '/facts.json.gz', { at: null, c: {} });
{ const need = new Set(); for (const t of MS) for (const i of liqList(t)) { const s = SYMS[i]; if (finCo(s)) continue; const c = symCik(s); if (c) need.add(c); }
  const freshF = FX.at && Date.now() - Date.parse(FX.at) < 6 * 864e5, todo = [...need].filter(c => !freshF || !FX.c[c]);
  if (todo.length && left() > 60 * 60e3) { const zip = AC + '/companyfacts.zip'; let zipOk = false, got = 0, req = 0, fail = 0;
    if (!local(env.SEC_BASE)) zipOk = await download(SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip', zip) && fs.statSync(zip).size > 1e8;
    for (const c of todo) { const name = 'CIK' + c.padStart(10, '0') + '.json'; let j = null;
      if (zipOk) { try { j = JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch (e) { j = null; } }
      else { if (left() < 90 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 120); req++; const r = await get(SECD + '/api/xbrl/companyfacts/' + name, { headers: { 'User-Agent': UA } }); if (r && r.ok) j = await r.json().catch(() => null); else if (!r || r.status !== 404) fail++; }
      if (j) { FX.c[c] = compact(j); got++; } }
    if (zipOk) try { fs.unlinkSync(zip); } catch (e) {}
    FX.at = new Date().toISOString(); WZ(AC + '/facts.json.gz', FX); log('SEC facts: ' + got + ' of ' + todo.length + ' companies (' + (zipOk ? 'bulk file' : req + ' requests, ' + fail + ' failed') + ')'); }
  const cov = [...need].filter(c => FX.c[c]).length; STATUS.facts = { ok: need.size > 0 && cov >= need.size * 0.8, companies: need.size, withFacts: cov, at: FX.at }; log('SEC facts coverage ' + cov + '/' + need.size); }
const divMemo = new Map(); const divOf = (cik) => { if (divMemo.has(cik)) return divMemo.get(cik); const c = FX.c[cik]; let o = null;
  if (c) { const dps = DPS_TAGS.map(t => (c[t] || []).map(([s, e, v, f]) => ({ s, e, v, f }))).find(r => r.length) || []; const debt = {}; for (const t of DEBT_TAGS) if (c[t]) debt[t] = c[t].map(([e, v, f]) => ({ e, v, f })); o = { dps, debt }; }
  divMemo.set(cik, o); return o; };

// ---- 2f. splits (Massive, 2017 on) ----
const SPLITS = []; { const f = AC + '/splits.json.gz'; let x = JZ(f, null);
  if (!x || Date.now() - Date.parse(x.at) > 6 * 864e5) { const rows = []; let done = false;
    for (const base of ['/stocks/v1/splits?execution_date.gte=2017-01-01&limit=1000', '/v3/reference/splits?execution_date.gte=2017-01-01&limit=1000']) { let path = base, pages = 0; rows.length = 0;
      while (path && pages < 500) { const j = await api(path); pages++; if (!j || j.refused || !Array.isArray(j.results)) break; for (const r of j.results) if (r && r.ticker && r.execution_date && !/dividend/i.test(String(r.adjustment_type || ''))) rows.push([r.ticker, r.execution_date, +r.split_from, +r.split_to]);
        if (!j.next_url) { done = true; break; } path = j.next_url.replace(/^https?:\/\/[^/]+/, ''); }
      if (done && rows.length > 500) break; done = false; }
    if (done && rows.length > 500) { x = { at: new Date().toISOString(), rows: [...rows] }; WZ(f, x); } else log('splits: download incomplete (' + rows.length + ' rows)'); }
  if (x) for (const [sym, d, from, to] of x.rows) SPLITS.push({ sym, d, from, to }); STATUS.splits = { ok: SPLITS.length > 500, rows: SPLITS.length, at: x && x.at }; log('splits: ' + SPLITS.length + ' rows'); }

// ---- 2g. SPUS / HLAL daily history ----
const NQnum = (v) => { const x = parseFloat(String(v || '').replace(/[$,]/g, '')); return isFinite(x) && x > 0 ? x : NaN; };
async function fundHist(sym) { const f = AC + '/fund-' + sym + '.json'; let b = J(f, null); if (b && b.at && Date.now() - Date.parse(b.at) < 20 * 3600e3 && b.rows && b.rows[0][0] <= '2020-01-31') return b.rows;
  let rows = null; const j = await api('/v2/aggs/ticker/' + sym + '/range/1/day/2019-12-01/' + iso(Date.now()) + '?adjusted=true&sort=asc&limit=50000');
  if (j && Array.isArray(j.results) && j.results.length > 200) rows = j.results.map(x => [iso(x.t), x.o, x.c]);
  // Massive's history reaches back 5 years only: then the full history from Nasdaq
  if (!rows || rows[0][0] > '2020-01-31') { const r = await get(NQ + '/api/quote/' + sym + '/historical?assetclass=etf&fromdate=2019-12-01&todate=' + iso(Date.now()) + '&limit=9999', { headers: NQ_HEAD, timeout: 45000 }); const k = r && r.ok ? await r.json().catch(() => null) : null; const tr = k && k.data && k.data.tradesTable && k.data.tradesTable.rows;
    if (Array.isArray(tr) && tr.length > 200 && (!rows || tr.length > rows.length)) rows = tr.map(x => { const m = String(x.date || '').match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m ? [m[3] + '-' + m[1] + '-' + m[2], NQnum(x.open), NQnum(x.close)] : null; }).filter(x => x && x[2] > 0).sort((a, b) => a[0] < b[0] ? -1 : 1); }
  if (rows) W(f, { at: new Date().toISOString(), rows }); return rows || (b && b.rows) || null; }
const FUNDS = { SPUS: await fundHist('SPUS'), HLAL: await fundHist('HLAL') }; STATUS.funds = { ok: !!(FUNDS.SPUS && FUNDS.SPUS.length > 500 && FUNDS.SPUS[0][0] <= '2021-01-04'), SPUS: FUNDS.SPUS ? FUNDS.SPUS.length : 0, HLAL: FUNDS.HLAL ? FUNDS.HLAL.length : 0 };
log('funds: SPUS ' + STATUS.funds.SPUS + ' days, HLAL ' + STATUS.funds.HLAL + ' days');

// ================= 3. SIGNALS =================
// A signal: { t (signal session: everything used is known at its close), i (stock; -1 = SPUS), k (entry session, bought at its OPEN; SPUS: at
// the CLOSE of t), x (exit session, sold at its close), stop (optional: exit at the first close that far under the buy) }. k / x may lie
// past T-1 (paper lane).
const H = (id) => ANGLES[id].hold, SIG = {}; for (const id of IDS) SIG[id] = [];
// ---- Russell ----
{ const sigs = { 'ANG-RUS-ADD': [], 'ANG-RUS-DOWN': [] }, diag = [];
  for (let j = 1; j < RUSSELL.length; j++) { const yr = RUSSELL[j], yr0 = RUSSELL[j - 1], t = tOf.get(yr.rank); if (t === undefined) continue; const nowV = valuesOn(yr.rank), prevV = valuesOn(yr0.rank); if (nowV.size < 1000 || prevV.size < 1000) { diag.push(yr.rank + ': too few values'); continue; }
    const nowMv = new Map([...nowV].map(([k, v]) => [k, v.mv])), prevMv = new Map([...prevV].map(([k, v]) => [k, v.mv])), x = idxOf(yr.recon);
    const lists = { 'ANG-RUS-ADD': russellAdds(nowMv, prevMv, yr, yr0), 'ANG-RUS-DOWN': russellDowns(nowMv, prevMv, yr, yr0) };
    for (const [id, ciks] of Object.entries(lists)) { let n = 0; for (const c of ciks) { const i = nowV.get(c).i; if (i < 0 || !LIQ[i * T + t]) continue; sigs[id].push({ t, i, k: t + 1, x }); n++; } diag.push(yr.rank + ' ' + id + ': ' + ciks.length + ' predicted, ' + n + ' liquid'); } }
  Object.assign(SIG, sigs); STATUS.russell.diag = diag; STATUS.russell.pairsSkipped = diag.filter(x => /too few values/.test(x)); STATUS.russell.ok = STATUS.russell.ok && diag.filter(x => / ANG-RUS-ADD: /.test(x)).length >= 3; log('Russell: ' + diag.join('; ')); }
// ---- IPO first base + lock-up ----
{ for (const p of IPO) { const c = fullC(p.i), v = fullV(p.i);
    for (let t = p.f0 + 63; t <= Math.min(p.f0 + 504, T - 1); t++) { if (!ipoBase(c, v, p.f0, t)) continue; if (LIQ[p.i * T + t]) SIG['ANG-IPOBASE'].push({ t, i: p.i, k: t + 1, x: t + H('ANG-IPOBASE'), stop: 0.08 }); break; }   // only the FIRST breakout
    const E = idxOf(addDays(p.d, 180)), t = E + 2; if (t <= T - 1 && LIQ[p.i * T + t]) SIG['ANG-LOCKUP'].push({ t, i: p.i, k: t + 1, x: t + H('ANG-LOCKUP') }); }
  log('IPO base signals ' + SIG['ANG-IPOBASE'].length + ', lock-up signals ' + SIG['ANG-LOCKUP'].length); }
// ---- large-cap reversal (candidates first; the 8-K filter needs their filings) ----
const REV = { 'ANG-LCREV-W': { n: 5, ends: weekEnds(D) }, 'ANG-LCREV-M': { n: 21, ends: monthEnds(D) } }, CAND = {};
for (const [id, r] of Object.entries(REV)) { CAND[id] = []; for (const t of r.ends) { if (t < r.n + 1) continue; const rows = []; for (const i of top500(t)) { const a = C[i * T + t - r.n], b = C[i * T + t]; if (a > 0 && b > 0) rows.push({ key: i, v: b / a - 1 }); } for (const i of pickBottom(rows, 0.1, 400)) CAND[id].push({ t, i }); } }
const NEWS = JZ(AC + '/news.json.gz', { c: {} }); { const need = new Map(); for (const id of Object.keys(REV)) for (const z of CAND[id]) { const c = symCik(SYMS[z.i]); if (!c) continue; const recent = z.t >= T - 30; need.set(c, (need.get(c) || false) || recent); }
  let req = 0, fail = 0, got = 0;
  for (const [cik, recent] of need) { const have = NEWS.c[cik], age = have ? Date.now() - Date.parse(have.at) : Infinity; if (have && (age < 6 * 864e5 || (!recent && age < 30 * 864e5)) && !(recent && age > 20 * 3600e3)) continue; if (left() < 70 * 60e3) break;
    const pad = 'CIK' + cik.padStart(10, '0'), list = []; let okc = true;
    const eat = (o) => { const n = (o.form || []).length; for (let q = 0; q < n; q++) if (o.form[q] === '8-K' && o.filingDate[q] >= '2021-09-01') list.push([o.filingDate[q], String((o.items || [])[q] || '')]); };
    await sleep(local(env.SEC_BASE) ? 0 : 120); req++; const r = await get(SECD + '/submissions/' + pad + '.json', { headers: { 'User-Agent': UA }, timeout: 60000 }); const j = r && r.ok ? await r.json().catch(() => null) : null;
    if (!j || !j.filings || !j.filings.recent) { fail++; continue; } eat(j.filings.recent);
    for (const fl of j.filings.files || []) { if (!(fl.filingTo >= '2021-09-01')) continue; await sleep(local(env.SEC_BASE) ? 0 : 120); req++; const r2 = await get(SECD + '/submissions/' + fl.name, { headers: { 'User-Agent': UA }, timeout: 60000 }); const j2 = r2 && r2.ok ? await r2.json().catch(() => null) : null; if (!j2) { okc = false; break; } eat(j2); }
    if (!okc) { fail++; continue; } NEWS.c[cik] = { at: new Date().toISOString(), f: list }; got++; }
  if (req) WZ(AC + '/news.json.gz', NEWS); const cov = [...need.keys()].filter(c => NEWS.c[c]).length; STATUS.news = { ok: need.size > 0 && cov >= need.size * 0.9, companies: need.size, withFilings: cov, requests: req, failed: fail, fetchedNow: got };
  log('SEC 8-K items: ' + cov + '/' + need.size + ' companies (' + req + ' requests, ' + fail + ' failed)'); }
{ const unk = {}; for (const id of Object.keys(REV)) { const n = REV[id].n; unk[id] = 0;
    for (const z of CAND[id]) { const c = symCik(SYMS[z.i]), nw = c && NEWS.c[c]; if (!nw) { unk[id]++; continue; } if (has8k(nw.f.map(([d, items]) => ({ d, items })), D[z.t - n + 1], D[z.t])) continue; SIG[id].push({ t: z.t, i: z.i, k: z.t + 1, x: z.t + n }); } }
  STATUS.news.unknownLeftOut = unk; log('reversal signals: W ' + SIG['ANG-LCREV-W'].length + ' (of ' + CAND['ANG-LCREV-W'].length + ' candidates), M ' + SIG['ANG-LCREV-M'].length + ' (of ' + CAND['ANG-LCREV-M'].length + ')'); }
// ---- large-cap earnings gap that holds ----
{ const ev = [], seen = new Set(); for (const r of REPORTS) { const i = SY.get(r.sym); if (i === undefined) continue; const k = reactionIdx(D, r.d, r.time); if (k < 51 || k > T - 1 || seen.has(i + '|' + k)) continue; seen.add(i + '|' + k);
    if (!top500(k - 1).has(i)) continue; if (gapUp(ser(O, i), ser(C, i), ser(V, i), k)) ev.push({ i, r: k }); }
  const syms = [...new Set(ev.map(e => SYMS[e.i]))], BARS = {}; let req = 0, fail = 0;
  for (const s of syms) { const f = AC + '/bars/' + s + '.json'; let b = J(f, null); const lastEv = Math.max(...ev.filter(e => SYMS[e.i] === s).map(e => e.r)), needTo = D[Math.min(T - 1, lastEv + 3)];
    if (!b || b.to < needTo) { if (left() < 60 * 60e3) { fail++; continue; } const j = await api('/v2/aggs/ticker/' + s + '/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000'); req++;
      if (j && Array.isArray(j.results)) { b = { to: D[T - 1], rows: j.results.map(x => [iso(x.t), x.l]) }; W(f, b); } else { fail++; continue; } }
    const L = new Float64Array(T).fill(NaN); for (const [d, l] of b.rows) { const t = tOf.get(d); if (t !== undefined) L[t] = l; } BARS[s] = L; }
  let held = 0; for (const e of ev) { const L = BARS[SYMS[e.i]]; if (!L) continue; if (holdsAbove(L, e.r) !== true) continue; held++; for (const id of ['ANG-LCGAP20', 'ANG-LCGAP60']) SIG[id].push({ t: e.r + 3, i: e.i, k: e.r + 4, x: e.r + 3 + H(id) }); }
  STATUS.bars = { ok: syms.length > 0 && fail <= syms.length * 0.1, symbols: syms.length, requests: req, failed: fail }; log('earnings gaps (top 500): ' + ev.length + ' gaps, ' + held + ' held 3 sessions; bars for ' + (syms.length - fail) + '/' + syms.length + ' symbols'); }
// ---- quality at the 52-week low ----
{ let trig = 0; for (let i = 0; i < NS; i++) { if (i === spyI || finCo(SYMS[i]) || !symCik(SYMS[i])) continue; let any = false; for (let t = 0; t < T; t++) if (LIQ[i * T + t]) { any = true; break; } if (!any) continue;
    const S = lowTurnSeries(ser(C, i)); for (let t = 0; t < T; t++) { if (!S[t] || !LIQ[i * T + t]) continue; trig++; const f = fsOf(i, t); if (f !== null && f >= 7) SIG['ANG-QLOW'].push({ t, i, k: t + 1, x: t + H('ANG-QLOW') }); } }
  log('quality at the low: ' + trig + ' turns, ' + SIG['ANG-QLOW'].length + ' with F-score 7+'); }
// ---- dividend growth streak ----
{ const diag = { checked: 0, streak5: 0, lowDebt: 0 };
  for (const t of MS) { if (t < 21) continue; for (const i of liqList(t)) { const s = SYMS[i]; if (finCo(s)) continue; const cik = symCik(s); if (!cik) continue; const dv = divOf(cik); if (!dv || !dv.dps.length) continue; diag.checked++;
      const st = divStreak(dv.dps, D[t]); if (!st || st.streak < 5 || (Date.parse(D[t]) - Date.parse(st.last)) / 864e5 > 456) continue; diag.streak5++;
      const sh = sharesKnown(cik, D[t]), debt = debtAt(dv.debt, D[t]), mv = sh > 0 ? sh * C[i * T + t] : null; if (debt === null || !(mv > 0) || !(debt / mv < 0.33)) continue; diag.lowDebt++;
      SIG['ANG-DIVG'].push({ t, i, k: t + 1, x: t + H('ANG-DIVG') }); } }
  STATUS.facts.diag = diag; log('dividend growth: ' + JSON.stringify(diag)); }
// ---- forward splits, first in 3 years ----
{ for (const s of firstSplits(SPLITS, D[0])) { const i = SY.get(s.sym); if (i === undefined) continue; const t = onOrAfter(D, s.d); if (t >= T || !LIQ[i * T + t]) continue; SIG['ANG-SPLIT'].push({ t, i, k: t + 1, x: t + H('ANG-SPLIT') }); }
  log('first forward splits: ' + SIG['ANG-SPLIT'].length); }
// ---- FOMC on SPUS (its own session list) ----
const FD = (FUNDS.SPUS || []).map(r => r[0]), FC = (FUNDS.SPUS || []).map(r => r[2]), fTOf = new Map(FD.map((d, k) => [d, k]));
const famOk = { russell: () => STATUS.russell.ok, ipo: () => STATUS.edgar.ok, reversal: () => STATUS.news.ok, gap: () => STATUS.earn.ok && STATUS.bars.ok, quality: () => STATUS.fund.ok, dividend: () => STATUS.facts.ok, calendar: () => STATUS.funds.ok, split: () => STATUS.splits.ok };
const familyOk = (id) => famOk[ANGLES[id].family]();

// ================= 4. 5-YEAR ONE-SHOT =================
const need = IDS.filter(id => !FROZEN[id]);
log('5-year one-shot for ' + need.length + ' angles not yet frozen');
const RES = {};
const exitOf = (z) => { if (!z.stop || z.x >= T) return z.x; const q = stopExit(ser(O, z.i), fullC(z.i), z.k, z.x - z.k + 1, z.stop); return q === null ? z.x : q; };
const topCtrl = new Map(); const ctrlTop = (t, k, x) => { const key = t + '|' + k + '|' + x; if (topCtrl.has(key)) return topCtrl.get(key); const v = []; for (const i of top500(t)) { const g = ret(i, k, x); if (g !== null && Math.abs(g) < 3) v.push(g); } const m = v.length >= 100 ? mean(v) : null; topCtrl.set(key, m); return m; };
function tradesOf(id, sigs) { const out = [], busy = new Map(), spans = new Map();
  for (const z of [...sigs].sort((p, q) => p.t - q.t || p.i - q.i)) { if (z.x >= T || z.k >= T) continue; if (!TRANCHES.has(id) && (busy.get(z.i) ?? -1) >= z.k) continue;
    const x = exitOf(z), g = ret(z.i, z.k, x); if (g === null || !isFinite(g)) continue; const c = ctrlSpan(z.k, x); if (c === null) continue;
    busy.set(z.i, x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, x]); out.push({ t: z.t, s: SYMS[z.i], i: z.i, k: z.k, x, g, c, half: halfOf(D[z.t]) }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.x - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 21, to: T - 1, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  return out; }
function fomcTradesOf() { const tr = fomcTrades(FD), avg = {}; for (const h of ['older', 'newer']) { const v = []; for (let u = 1; u < FD.length; u++) if (halfOf(FD[u - 1]) === h && FC[u - 1] > 0 && FC[u] > 0) v.push(FC[u] / FC[u - 1] - 1); avg[h] = v.length ? mean(v) : null; }
  return tr.filter(z => FD[z.t] >= '2021-01-01' && FC[z.t] > 0 && FC[z.x] > 0).map(z => { const h = halfOf(FD[z.t]); return { t: z.t, s: 'SPUS', i: -1, k: z.t, x: z.x, g: FC[z.x] / FC[z.t] - 1, c: avg[h], own: avg[h], half: h, date: FD[z.x] }; }); }
const shape = (tr) => { const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), by = {}; tr.forEach((z, j) => { const y = (z.date || D[z.t]).slice(0, 4); (by[y] = by[y] || []).push(net[j]); });
  return { trades: tr.length, win: tr.length ? r4(w.length / tr.length) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, byYear: Object.fromEntries(Object.keys(by).sort().map(y => [y, { n: by[y].length, avg: r4(mean(by[y])) }])) }; };
for (const id of need) { if (left() < 8 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  if (!familyOk(id)) { RES[id] = { verdict: 'NOT RUN', why: 'data not available this run: ' + ANGLES[id].family + ' data ' + JSON.stringify(STATUS[{ russell: 'russell', ipo: 'edgar', reversal: 'news', gap: 'bars', quality: 'fund', dividend: 'facts', calendar: 'funds', split: 'splits' }[ANGLES[id].family]] || {}).slice(0, 300) }; log('- ' + id + ': NOT RUN (' + ANGLES[id].family + ' data)'); continue; }
  const hold = H(id), tr = id === 'ANG-FOMC' ? fomcTradesOf() : tradesOf(id, SIG[id]);
  // the block clock: session index (FOMC: the fund's own session list)
  const R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) }, info = {};
  if (id === 'ANG-FOMC') info.atEtfCost = { note: 'information only: the same trades at 0.1% round trip (an ETF trade), NOT the system standard', older: r4(mean(tr.filter(z => z.half === 'older').map(z => z.g - 0.001)) ?? NaN), newer: r4(mean(tr.filter(z => z.half === 'newer').map(z => z.g - 0.001)) ?? NaN) };
  if (/LCREV|LCGAP/.test(id)) { info.vsTop500 = { note: 'information only: edge over the average TOP-500 stock over the same sessions (the gate uses the average liquid stock)' }; for (const h of ['older', 'newer']) { const v = tr.filter(z => z.half === h).map(z => { const c = ctrlTop(z.t, z.k, z.x); return c === null ? null : z.g - c; }).filter(x => x !== null); info.vsTop500[h] = v.length ? r4(mean(v)) : null; } }
  if (ANGLES[id].family === 'russell') info.note = 'one reconstitution a year: every trade of a year falls in one block, so the older half (2022, 2023) has 2 blocks and cannot meet the 3-block gate: TOO FEW CASES there by construction';
  RES[id] = { ...judge(R, { bar: BAR }), results: R, shape: shape(tr), info, hold, family: ANGLES[id].family, split: SPLIT, cost: COST,
    trades: tr.map(z => ({ s: z.s, sig: z.date ? FD[z.t] : D[z.t], buy: z.date ? FD[z.k] : D[z.k], sell: z.date ? FD[z.x] : D[z.x], net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' (' + (h.blocks || 0) + ') win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + String(RES[id].why).slice(0, 300)); }
// information: ANG-DIP5 (one path per fund, hold-core dcaVsDip with a 5% dip)
const INFO_RES = {}; for (const f of ['SPUS', 'HLAL']) { const rows = FUNDS[f]; if (!rows || rows.length < 300) { INFO_RES['ANG-DIP5/' + f] = { verdict: 'NOT RUN', why: 'no fund history' }; continue; }
  const d = rows.map(r => r[0]), o = rows.map(r => r[1] > 0 ? r[1] : r[2]), c = rows.map(r => r[2]), w0 = d.findIndex(x => x >= D[0]);
  const win = dcaVsDip(d.slice(w0), o.slice(w0), c.slice(w0), { dip: 0.05 }), full = dcaVsDip(d, o, c, { dip: 0.05 });
  INFO_RES['ANG-DIP5/' + f] = { verdict: 'INFORMATION', why: 'one path per fund: no statistics', window: { from: d[w0], to: d[d.length - 1], ...win, dipVsDca: r4(win.dip.value / win.dca.value - 1) }, sinceFirst: { from: d[0], to: d[d.length - 1], ...full, dipVsDca: r4(full.dip.value / full.dca.value - 1) } };
  log('- ANG-DIP5/' + f + ': DIP vs DCA ' + pc(INFO_RES['ANG-DIP5/' + f].window.dipVsDca) + ' in the window, ' + pc(INFO_RES['ANG-DIP5/' + f].sinceFirst.dipVsDca) + ' since ' + d[0]); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);
const infoFirst = freezeEach(PREV.informationFirstRun, Object.fromEntries(Object.entries(INFO_RES).map(([k, r]) => [k, { at: new Date().toISOString(), ...r }])), (r) => isJudged(r) && r.sinceFirst && r.sinceFirst.from <= '2020-01-31');   // only with the fund's full history

// ================= 5. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const scanned = new Set(lines.filter(x => x.type === 'day').map(x => x.d)), sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id));
const toScan = []; for (let t = 0; t < T; t++) if (D[t] >= START && !scanned.has(D[t])) toScan.push(t);
const newLines = [], openBy = new Map(), sigIds = new Set(sigLines.map(x => x.id)), lastT = T - 1;
for (const x of sigLines) if (!resolved.has(x.id)) openBy.set(x.m + '|' + x.sym, true);
const fromT = D.findIndex(d => d >= START);
if (fromT >= 0) {
  // FOMC: planned the evening before the eve (buy SPUS at the close of the next session, sell at the close of the statement day)
  { const b0 = nextSession(D[lastT]), s1 = nextSession(b0); if (FOMC.includes(s1) && toScan.includes(lastT) && familyOk('ANG-FOMC')) { const line = { type: 'signal', id: 'ANG-FOMC|SPUS|' + D[lastT], m: 'ANG-FOMC', sym: 'SPUS', d: D[lastT], close: r4(FC[FC.length - 1] ?? NaN), halal: halal('SPUS'), hold: 2, cal: true,
      plan: 'buy SPUS at the close of ' + b0 + ', sell at the close of ' + s1 + ' (FOMC statement day)', entryDate: b0, exitDate: s1, late: false, recordedAfter: D[lastT] }; if (!sigIds.has(line.id)) { sigIds.add(line.id); newLines.push(line); sigLines.push(line); } } }
  for (const id of IDS) { if (id === 'ANG-FOMC' || !familyOk(id)) continue;
    for (const z of SIG[id].filter(z => z.t >= fromT && z.t <= lastT).sort((p, q) => p.t - q.t)) { const sym = SYMS[z.i], key = id + '|' + sym; if (!TRANCHES.has(id) && openBy.get(key)) continue;
      const late = z.k <= lastT, hold = z.x - z.k + 1; let entryDate = null; if (!late) entryDate = dateOf(z.k);
      const line = { type: 'signal', id: id + '|' + sym + '|' + D[z.t], m: id, sym, d: D[z.t], close: r4(C[z.i * T + z.t]), halal: halal(sym), hold, ...(z.stop ? { stop: z.stop } : {}), ...(ANGLES[id].family === 'russell' ? { exitDate: dateOf(z.x) } : {}),
        plan: (late ? 'LATE (data arrived after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + ', hold ' + hold + ' sessions' + (ANGLES[id].family === 'russell' ? ' (sell at the close of ' + dateOf(z.x) + ', the reconstitution Friday)' : '') + (z.stop ? '; sell at the first close ' + Math.round(z.stop * 100) + '% under the buy' : ''),
        entryDate: late ? null : entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
  for (const t of toScan) newLines.push({ type: 'day', d: D[t] }); }
const firstAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo; };
const board = {}, today = {};
for (const x of sigLines) { if (x.cal) { const k = fTOf.get(x.entryDate), xi = fTOf.get(x.exitDate); if (k === undefined) { x._state = 'waiting'; continue; } if (xi === undefined) { x._state = 'open'; x._k = -1; x._mark = FC[FC.length - 1] / FC[k] - 1; continue; }
    x._state = 'closed'; x._g = FC[xi] / FC[k] - 1; x._c = null; if (!resolved.has(x.id)) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: x.entryDate, sell: x.exitDate, g: r4(x._g), net: r4(x._g - COST), avgStock: null }); } continue; }
  const i = SY.get(x.sym); let k = x.entryDate ? tOf.get(x.entryDate) : x.late ? firstAfter(x.recordedAfter) : undefined; if (i === undefined || k === undefined || k >= T) { x._state = 'waiting'; continue; }
  let xi = x.exitDate && x.exitDate <= D[T - 1] ? onOrBefore(D, x.exitDate) : k + x.hold - 1; if (x.stop) { const q = stopExit(ser(O, i), fullC(i), k, xi - k + 1, x.stop); if (q !== null && q < T) xi = Math.min(xi, q); }
  if (xi > T - 1) { x._state = 'open'; x._k = k; x._mark = ret(i, k, T - 1); continue; }
  const g = ret(i, k, xi), c = ctrlSpan(k, xi); x._state = 'closed'; x._g = g; x._c = c; x._k = k; x._x = xi;
  if (!resolved.has(x.id) && g !== null) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[xi], g: r4(g), net: r4(g - COST), avgStock: c === null ? null : r4(c - COST) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
for (const id of IDS) { const mine = sigLines.filter(x => x.m === id), closed = mine.filter(x => x._state === 'closed' && x._g !== null && x._g !== undefined).map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c, halal: x.halal })), fr = firstRun[id], st = boardStats(closed);
  board[id] = { name: ANGLES[id].name, hold: H(id), family: ANGLES[id].family, dataOk: familyOk(id), signals: mine.length, waiting: mine.filter(x => x._state === 'waiting').length, open: mine.filter(x => x._state === 'open').length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: paperReady(st),
    fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  today[id] = { name: ANGLES[id].name, hold: H(id), tier: fr ? fr.verdict : null, newSignals: mine.filter(x => x.recordedAfter === D[lastT]).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, buy: x._k >= 0 ? D[x._k] : x.entryDate, sinceBuy: r4(x._mark ?? NaN), exitAfter: x.exitDate ? 'the close of ' + x.exitDate : x.hold + ' sessions' })) }; }
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, note: 'PAPER ONLY. Untested angles recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a TRADABLE SMALL / PROVEN frozen 5-year verdict (data/angles-lab.json firstRun), or the TRY SMALL lane\'s own standard on that frozen run, or 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: scanned ' + toScan.length + ' new session(s); ' + newLines.filter(x => x.type === 'signal').length + ' new signals; ' + sigLines.length + ' in all');

// ================= 6. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'angles-core.mjs header + ANGLES (24 Oct 2026, before any run) + data/strategy-library.json ANG-*', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock over the same entry-to-exit sessions (SPUS rules: SPUS over all same-length windows), better than the same stock on its other days, > 0 without the 2 best, block t >= ' + TIER2_T + ' -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN',
  skipped: SKIPPED, information: INFO_RES, informationFirstRun: infoFirst, firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-400)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'angles-lab.mjs -> data/angles-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: [R.older.win, R.newer.win], why: r.why }; ch = true; }
  for (const f of ['SPUS', 'HLAL']) { const e = LB && LB.strategies.find(x => x.id === 'ANG-DIP5'), r = infoFirst['ANG-DIP5/' + f]; if (!e || !r || (e.result && e.result[f])) continue; e.status = 'tested: information (one path per fund)'; e.result = { ...(e.result || {}), [f]: { window: r.window.dipVsDca, sinceFirst: r.sinceFirst.dipVsDca, from: r.sinceFirst.from } }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('angles-lab: library not updated: ' + e.message); }
console.log('ANGLES LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + Object.entries(STATUS).map(([k, s]) => k + (s.ok ? ' ok' : ' MISSING')).join(', '));
