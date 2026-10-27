// SQUAD 28 LAB (27 Oct 2026): supplier drift after the CUSTOMER's earnings (squad28-core.mjs header = the exact pre-registered rule).
// Research + forward PAPER lane (record only); never places an order; no Telegram. Keys only from secrets via env, never printed.
// MODES (env MODE, or the last line of run-squad28-now.txt via the workflow):
//   LINKS = build the point-in-time 10-K major-customer links (customer universe from Massive, EDGAR full-text search, verification on the
//           10-K text) -> data/squad28-links.json + 50 seeded links for the hand check -> data/squad28-linkcheck.json. NO returns of any
//           rule are computed in this mode. Both files are written once (never overwritten); the run resumes from squad28-cache.
//   RUN   = the 5-year one-shot of SQ28-SUPDRIFT and SQ28-SUPDRIFT-ANY (only with the frozen links file whose SHA-256 is LINKS_SHA and a
//           hand check of 50 links with precision >= 90%), first complete verdict frozen in data/squad28-lab.json firstRun; then the paper lane.
//   PAPER = (weekday schedule) the paper lane only (and the one-shot if not frozen yet and the links are in place).
// DATA: prices = study-cache/grouped.json.gz (Sunday job, RESTORED READ ONLY; dead stocks included) + sessions since (Massive grouped daily);
//   ticker spans = squad4-cache Form 3/4/5 (READ ONLY); names = Massive ticker details (squad24-cache details READ ONLY as a seed);
//   earnings = Nasdaq earnings calendar (anomaly-cache / a-cache READ ONLY, missing days fetched into squad28-cache); 10-K / 10-Q dates =
//   EDGAR quarterly master index; 10-K text = EDGAR full-text search + the hit document.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { ownAverage, nextSession } from './anomaly-core.mjs';
import { artifactJumps, hasArtifact } from './squad4-core.mjs';
import { html2text } from './squad21-core.mjs';
import { ID, VAR, IDS, RULES, TH, COST, STRESS, SPLIT, PAPER_START, LINKS_SHA, SEED, mean, r4, halfOf, capG, addDays, firstOnOrAfter, mulberry32, sampleOf, aliasesOf, customerQuery, linkSentence,
  coverTicker, linkActiveOn, sueCut, sueOf, ownNear, reactionIdx, exitOf, placeboPick, quarterKey, perYear, shapeOf, boardStats, precisionOf, preRegister, sessionOfAcceptance, pick202 } from './squad28-core.mjs';
import { secNY } from './sec-time.mjs';
const env = process.env, MODE = String(env.MODE || 'PAPER').toUpperCase(), local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const SECD = local(env.SEC_BASE) || 'https://data.sec.gov', PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', EFTS = local(env.EFTS_BASE) || 'https://efts.sec.gov', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ28_CACHE || 'squad28-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = 'data/squad28-lab.json', PAPER = 'data/squad28-paper.jsonl', TODAY = 'data/squad28-today.json', BOARD = 'data/squad28-board.json', LIB = 'data/strategy-library.json';
const LINKS = 'data/squad28-links.json', CHECK = 'data/squad28-linkcheck.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o, pretty) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, pretty ? 1 : 0)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ28_MINUTES || 280) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};
log('squad 28 lab, mode ' + MODE + '; frozen already: ' + (Object.keys(FROZEN).join(', ') || 'none'));

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
{ const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' squad 28 entries written now'); }

// ================= 1. NETWORK =================
let mvGap = 0, mvCalls = 0;
async function mv(path) { if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null; const url = PX + path;
  for (let a = 0; a < 5; a++) { const w = mvGap - Date.now(); if (w > 0) await sleep(w); mvGap = Date.now() + (local(env.MASSIVE_BASE) ? 0 : 70); mvCalls++; let r;
    try { r = await fetch(url + (url.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(15000 * (a + 1)); continue; } if (r.status === 404) return { notFound: true }; if (r.status === 401 || r.status === 403) return { refused: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
// SEC: a start-rate gate (<= 8 requests a second) shared by concurrent workers
let gateP = Promise.resolve(), secReq = 0, secFail = 0; const SECFAILS = [], GAP = local(env.SEC_BASE) || local(env.EFTS_BASE) ? 0 : 125;
async function slot() { const p = gateP; let rel; gateP = new Promise(r => { rel = r; }); await p; setTimeout(rel, GAP); }
async function sec(url, kind = 'json') { for (let a = 0; a < 4; a++) { await slot(); secReq++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(120000) }); if (r.status === 404 || r.status === 410) return kind === 'text' ? '' : null;
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; } if (!r.ok) { secFail++; if (SECFAILS.length < 20) SECFAILS.push('HTTP ' + r.status + ' ' + url.slice(0, 160)); return undefined; }
      if (kind === 'json') return await r.json(); const b = Buffer.from(await r.arrayBuffer()); return b.subarray(0, 15e6).toString('latin1'); } catch (e) { await sleep(1500 * (a + 1)); } }
  secFail++; if (SECFAILS.length < 20) SECFAILS.push('gave up ' + url.slice(0, 160)); return undefined; }
function download(url, file) { try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 20 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
async function pool(items, n, fn) { let i = 0; const run = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }; await Promise.all(Array.from({ length: n }, run)); }

// ================= 2. PRICES (squad 24 pattern) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad28-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop();
for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await mv('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || j.notFound || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; }
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (/^[A-Z]{1,5}$/.test(s) && !SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const CA = new Float32Array(N).fill(NaN), OA = new Float32Array(N).fill(NaN), HA = new Float32Array(N).fill(NaN), LA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; HA[k] = x.h ? x.h[j] : NaN; LA[k] = x.l ? x.l[j] : NaN; MAIN[k] = 1; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o ? x.x.o[j] : NaN; VA[k] = x.x.v ? x.x.v[j] : NaN; HA[k] = x.x.h ? x.x.h[j] : NaN; LA[k] = x.x.l ? x.x.l[j] : NaN; } });
store = null;
const SPL = J('data/splits.json', { splits: [] }), SPLITS = new Map(); for (const x of SPL.splits || []) { if (!x || !x.s || !(x.r > 0)) continue; (SPLITS.get(x.s) || SPLITS.set(x.s, []).get(x.s)).push(x); }
{ let fixed = 0; for (const [s, a] of SPLITS) { const i = SY.get(s); if (i === undefined) continue; for (const x of a) { if (x.d <= cacheLast || x.d > D[T - 1]) continue; const r = x.r, ta = D.findIndex(z => z >= x.d); if (ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; HA[q] /= r; LA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; } } log('splits after the cache: ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'); if (spyI === undefined) { console.log('squad28-lab: SPY missing; nothing done'); process.exit(0); }
const ser = (A, i) => A.subarray(i * T, i * T + T), series = (i) => ({ o: ser(OA, i), h: ser(HA, i), l: ser(LA, i), c: ser(CA, i), v: ser(VA, i) });
const LIQ = new Uint8Array(N), DV = new Float32Array(N).fill(NaN);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0, s2 = 0, n2 = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN, w2 = CA[b + t] * VA[b + t]; if (isFinite(v)) { s += v; n++; } if (isFinite(w2)) { s2 += w2; n2++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN, z = CA[k] * VA[k]; if (isFinite(w)) { s -= w; n--; } if (isFinite(z)) { s2 -= z; n2--; } }
    if (t >= 19 && n === 20 && CA[b + t] >= TH.custClose && s / 20 >= TH.custDv) LIQ[b + t] = 1; if (t >= 19 && n2 >= 18) DV[b + t] = s2 / n2; } }
STATUS.price = { ok: T >= 1000, sessions: T, from: D[0], to: D[T - 1], stocks: NS };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks)');
const closeAt = (i, x, k) => { for (let q = Math.min(x, T - 1); q >= k; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1 || x < k) return null; const e = OA[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const JUMPS = new Map(), artifactIn = (i, a, b) => { if (!JUMPS.has(i)) JUMPS.set(i, artifactJumps(ser(CA, i))); return hasArtifact(JUMPS.get(i), a, b); };
const inU = (i, t) => t >= 0 && t < T && i !== spyI && CA[i * T + t] >= TH.minClose && DV[i * T + t] >= TH.minDv;
const spyRet = (k, x) => { const e = OA[spyI * T + k], y = closeAt(spyI, x, k); return e > 0 && y > 0 ? y / e - 1 : null; };
// the session calendar extended 45 sessions into the future (upcoming reports for the paper lane's own-report test)
const DX = [...D]; while (DX.length < T + 45) DX.push(nextSession(DX[DX.length - 1]));

// ================= 3. IDENTITY: point-in-time ticker spans (squad 4 cache, read only) =================
const CIKMAP = new Map(); { let q = 0; for (const f of (() => { try { return fs.readdirSync(SC4 + '/f345'); } catch (e) { return []; } })()) { const x = JZ(SC4 + '/f345/' + f, null); if (!x) continue; q++;
    for (const [sym, cik, a, b, n] of x.map) (CIKMAP.get(String(+cik)) || CIKMAP.set(String(+cik), []).get(String(+cik))).push([sym, a, b, n]); } STATUS.tickerMap = { ok: q >= 20, quarters: q, ciks: CIKMAP.size }; log('ticker map: ' + JSON.stringify(STATUS.tickerMap)); }
const SH = JZ('data/shares.json.gz', { t: {}, c: {} }), SECCIK = J('data/sec-ciks.json', {});
const todayCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(+a); const y = SECCIK[s]; return y ? String(+y[0]) : null; };
const TODAYSYMS = new Map(); for (const s of SYMS) { const c = todayCik(s); if (c) (TODAYSYMS.get(c) || TODAYSYMS.set(c, []).get(c)).push(s); }
const hasPx = (i, t) => { for (let q = Math.max(0, t - 5); q <= Math.min(T - 1, t + 5); q++) if (CA[i * T + q] > 0) return true; return false; };
const symFor = (cik, tickers, d) => { const t = Math.min(firstOnOrAfter(D, d), T - 1), c = String(+cik), sp = (CIKMAP.get(c) || []).filter(s => d >= addDays(s[1], -400) && d <= addDays(s[2], 400)).sort((a, b) => b[3] - a[3]);
  for (const s of [...sp.map(x => x[0]), ...(tickers || []), ...(TODAYSYMS.get(c) || [])]) { const i = SY.get(s); if (i !== undefined && hasPx(i, t)) return s; } return null; };
const SPANCIK = new Map(); for (const [cik, a] of CIKMAP) for (const [sym, f, l, n] of a) (SPANCIK.get(sym) || SPANCIK.set(sym, []).get(sym)).push([cik, f, l, n]);
const cikOn = (sym, d) => { const a = (SPANCIK.get(sym) || []).filter(s => d >= addDays(s[1], -400) && d <= addDays(s[2], 400)).sort((x, y) => y[3] - x[3]); return a.length ? String(+a[0][0]) : todayCik(sym); };

// ================= 4. EDGAR quarterly master index: 10-K and 10-Q dates by CIK =================
const TENK = new Map(), TENQ = new Map(); { const qs = [], now = new Date(); for (let y = 2019; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, (q - 1) * 3, 1)) <= now) qs.push([y, q]);
  const fail = []; let rows = 0, got = 0; const KF = new Set(['10-K', '10-K405', '10-KT']), QF = new Set(['10-Q']);
  for (const [y, q] of qs) { const key = y + 'q' + q, cf = SC + '/master/' + key + '.json', cur = Date.now() < Date.UTC(y, q * 3, 1) + 5 * 864e5; let x = cur ? null : J(cf, null);
    if (!x) { const gz = SC + '/master.gz'; if (download(SEC + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.gz', gz)) { let txt = null; try { txt = zlib.gunzipSync(fs.readFileSync(gz)).toString('latin1'); } catch (e) {} try { fs.unlinkSync(gz); } catch (e) {}
        if (txt) { x = []; for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length !== 5 || !/^\d+$/.test(p[0].trim())) continue; const f = p[2].trim(); if (KF.has(f) || QF.has(f)) x.push([String(+p[0]), KF.has(f) ? 'K' : 'Q', p[3].trim()]); } if (x.length > 100) { W(cf, x); got++; } else x = null; } } }
    if (!x) { fail.push(key); continue; } for (const [c, k, d] of x) { const M = k === 'K' ? TENK : TENQ; (M.get(c) || M.set(c, []).get(c)).push(d); rows++; } }
  for (const M of [TENK, TENQ]) for (const [c, a] of M) M.set(c, [...new Set(a)].sort());
  STATUS.master = { ok: !fail.length, quarters: qs.length, downloadedNow: got, missing: fail, rows, tenKFilers: TENK.size }; log('master index: ' + rows + ' 10-K / 10-Q filings' + (fail.length ? ', MISSING ' + fail.join(' ') : '')); }

// ================= 5. LINKS (MODE=LINKS; no returns computed) =================
const quarterStarts = () => { const out = []; let y = +D[0].slice(0, 4), m = Math.floor((+D[0].slice(5, 7) - 1) / 3) * 3 + 1; for (;;) { const q = y + '-' + String(m).padStart(2, '0') + '-01'; if (q > D[T - 1]) break; out.push(q); m += 3; if (m > 12) { m -= 12; y++; } } return out; };
async function buildLinks(FWD = null) {   // FWD = the frozen links file: forward refresh for the PAPER lane only (current-year 10-Ks)
  // 5a. customer universe: the 1,000 most traded tickers at each quarter start; ETFs / funds dropped by the Massive type
  const CUST = new Map(); let calls = 0, nf = 0, etf = 0; const first = new Map(), last = new Map();
  if (FWD) { for (const [cik, o] of Object.entries(FWD.customers || {})) CUST.set(cik, { cik, names: new Set(o.names), syms: new Set(o.syms), aliases: o.aliases }); }
  else { const DC = { ...J((env.SQ24_CACHE || 'squad24-cache') + '/details.json', {}), ...J(SC + '/details.json', {}) };
  for (const q of quarterStarts()) { const t = firstOnOrAfter(D, q); if (t >= T) continue; const rows = []; for (let i = 0; i < NS; i++) if (i !== spyI && DV[i * T + t] > 0) rows.push([i, DV[i * T + t]]);
    rows.sort((a, b) => b[1] - a[1]); for (const [i] of rows.slice(0, TH.custTop)) { const s = SYMS[i]; if (!first.has(s)) first.set(s, D[t]); last.set(s, D[t]); } }
  for (const [s, d0] of first) for (const d of [...new Set([d0, last.get(s)])]) { const key = s + '|' + d; if (!(key in DC)) { if (left() < 200 * 60e3) continue; const j = await mv('/v3/reference/tickers/' + encodeURIComponent(s) + '?date=' + d), x = j && j.results; calls++;
      DC[key] = x ? { mc: x.market_cap || null, cik: x.cik ? String(+x.cik) : null, name: x.name || null, type: x.type || null } : (j && j.notFound ? { nf: 1 } : null); if (calls % 500 === 0) W(SC + '/details.json', DC); }
    const x = DC[key]; if (!x || x.nf) { nf++; continue; } if (x.type && !/^(CS|ADRC|OS)$/.test(x.type)) { etf++; continue; } const cik = x.cik || cikOn(s, d); if (!cik || !x.name) { nf++; continue; }
    const o = CUST.get(cik) || CUST.set(cik, { cik, names: new Set(), syms: new Set() }).get(cik); o.names.add(x.name); o.syms.add(s); }
  W(SC + '/details.json', DC);
  for (const o of CUST.values()) o.aliases = [...new Set([...o.names].flatMap(aliasesOf))]; }
  const withA = [...CUST.values()].filter(o => o.aliases.length); STATUS.customers = { tickers: first.size, companies: CUST.size, withAliases: withA.length, noDetails: nf, fundsDropped: etf, massiveCalls: calls };
  log('customer universe: ' + JSON.stringify(STATUS.customers));
  // 5b. EDGAR full-text search per customer and year (10-K)
  const from = addDays(D[0], -TH.searchBack), yNow = new Date().getUTCFullYear(), FT = { complete: true, fetched: 0, missing: [] }, HITS = new Map();   // docId -> { cik, adsh, file, d, name, tk, custs:Set }
  const eftsAll = async (q, a, b) => { const hits = []; for (let fr = 0; fr < 10000; fr += 100) { const j = await sec(EFTS + '/LATEST/search-index?q=' + encodeURIComponent(q) + '&forms=10-K&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + fr);
      if (!j || !j.hits) return null; const tot = (j.hits.total && j.hits.total.value) || 0;
      if (fr === 0 && tot >= 9900 && a < b) { const mid = iso((Date.parse(a) + Date.parse(b)) / 2), x = await eftsAll(q, a, mid), y = await eftsAll(q, addDays(mid, 1), b); return x && y ? x.concat(y) : null; }
      for (const h of j.hits.hits || []) { const s = h._source || {}, tk = []; for (const dn of s.display_names || []) { const m = String(dn).match(/\(([A-Z0-9.,\s-]+)\)\s+\(CIK/); if (m) tk.push(...m[1].split(',').map(x => x.trim()).filter(Boolean)); }
        hits.push([h._id, s.adsh, String(+((s.ciks || [])[0] || 0)), s.file_date, String(s.form || ''), tk, String((s.display_names || [])[0] || '').replace(/\s*\(CIK.*$/, '').replace(/\s+\([A-Z0-9.,\s-]+\)\s*$/, '').trim()]); }
      if ((j.hits.hits || []).length < 100 || fr + 100 >= tot) break; } return hits; };
  const yFrom = FWD ? (new Date().getUTCMonth() < 3 ? yNow - 1 : yNow) : +from.slice(0, 4), jobs = []; for (const o of withA) for (let y = yFrom; y <= yNow; y++) jobs.push([o, y]);
  await pool(jobs, 3, async ([o, y]) => { const f = SC + '/efts/' + o.cik + '/' + y + '.json', had = J(f, null), fresh = had && had.at && Date.now() - Date.parse(had.at) < 3 * 864e5; let h = had && had.h;
    if (!had || (y === yNow && !fresh)) { if (left() < 120 * 60e3) { if (!had) { FT.complete = false; FT.missing.push(o.cik + ' ' + y); } }
      else { const a = y === +from.slice(0, 4) ? from : y + '-01-01', b = y + '-12-31', x = await eftsAll(customerQuery(o.aliases), a, b); FT.fetched++; if (FT.fetched % 500 === 0) log('search jobs fetched: ' + FT.fetched + ' of ' + jobs.length);
        if (x) { h = x.filter(z => /^10-K(T|405)?$/.test(z[4])); W(f, { at: new Date().toISOString(), h }); } else if (!had) { FT.complete = false; FT.missing.push(o.cik + ' ' + y); } } }
    for (const z of h || []) { if (!z[1] || !z[2] || z[2] === '0' || z[2] === o.cik) continue; const file = String(z[0]).split(':')[1] || ''; if (!file) continue;
      const k = z[1] + ':' + file, e = HITS.get(k) || HITS.set(k, { cik: z[2], adsh: z[1], file, d: z[3], name: z[6], tk: z[5], custs: new Set() }).get(k); e.custs.add(o.cik); } });
  STATUS.efts = { ok: FT.complete, jobs: jobs.length, fetchedNow: FT.fetched, missing: FT.missing.slice(0, 20), missingN: FT.missing.length, docs: HITS.size };
  log('full-text search: ' + HITS.size + ' 10-K documents name a customer phrase; ' + (FT.complete ? 'complete' : 'INCOMPLETE ' + FT.missing.length));
  // 5c. verification on the document text (one fetch per document; every customer whose phrase hit it is checked)
  const VF = SC + '/verified-v3.json', VER = J(VF, {}); let read = 0, notRead = 0, saved = Date.now();
  const todo = [...HITS.entries()].filter(([k, e]) => !VER[k] || [...e.custs].some(c => !(c in VER[k].m)));
  log('documents to read: ' + todo.length + ' (cached ' + (HITS.size - todo.length) + ')');
  await pool(todo, 4, async ([k, e]) => { if (left() < 25 * 60e3) { notRead++; return; } const html = await sec(SEC + '/Archives/edgar/data/' + e.cik + '/' + e.adsh.replace(/-/g, '') + '/' + e.file, 'text');
    if (html === undefined) { notRead++; return; } const text = html2text(html), v = VER[k] || { tk: coverTicker(html), m: {} };
    for (const c of e.custs) { if (c in v.m) continue; const x = linkSentence(text, CUST.get(c).aliases, +String(e.d).slice(0, 4)); v.m[c] = x ? [x.pct, x.sentence] : 0; }
    VER[k] = v; read++; if (Date.now() - saved > 120e3) { saved = Date.now(); W(VF, VER); log('documents read: ' + read + ' of ' + todo.length); } });
  W(VF, VER); STATUS.docs = { ok: notRead === 0, read, notRead, documents: HITS.size }; log('documents: read now ' + read + ', not read ' + notRead);
  if (FWD) { const have = new Set(FWD.links.map(r => r.adsh + '|' + r.c)), rows = [];
    for (const [k, e] of HITS) { const v = VER[k]; if (!v) continue; for (const c of e.custs) { const m = v.m[c]; if (!m || have.has(e.adsh + '|' + c)) continue; const cu = CUST.get(c);
      rows.push({ s: e.cik, sn: e.name, c, cn: [...cu.names][0], cs: [...cu.syms], filed: e.d, adsh: e.adsh, file: e.file, pct: m[0], sentence: m[1], tk: v.tk || null, etk: e.tk || [] }); } }
    W('data/squad28-links-forward.json', { generatedAt: new Date().toISOString(), note: 'FORWARD links for the PAPER lane only (10-Ks found after the frozen links file; never used by the 5-year test)', complete: STATUS.efts.ok && STATUS.docs.ok, links: rows }, true); return rows; }
  if (!STATUS.efts.ok || !STATUS.docs.ok) { W('data/squad28-links-progress.json', { at: new Date().toISOString(), note: 'LINKS build not complete yet; the next LINKS run resumes from squad28-cache', status: STATUS }, true); return; }
  // 5d. the frozen links file (one row per verified 10-K document and customer)
  const rows = []; for (const [k, e] of HITS) { const v = VER[k]; if (!v) continue; for (const c of e.custs) { const m = v.m[c]; if (!m) continue; const cu = CUST.get(c);
      rows.push({ s: e.cik, sn: e.name, c, cn: [...cu.names][0], cs: [...cu.syms], filed: e.d, adsh: e.adsh, file: e.file, pct: m[0], sentence: m[1], tk: v.tk || null, etk: e.tk || [] }); } }
  rows.sort((a, b) => a.filed < b.filed ? -1 : a.filed > b.filed ? 1 : a.s < b.s ? -1 : a.s > b.s ? 1 : a.c < b.c ? -1 : 1);
  const pairs = new Set(rows.map(r => r.s + '>' + r.c)), out = { generatedAt: new Date().toISOString(), note: 'FROZEN point-in-time 10-K major-customer links (squad28-core.mjs header). One row per verified 10-K document and customer CIK. Built BEFORE any return was computed.',
    window: [D[0], D[T - 1]], searchFrom: from, params: TH, counts: { rows: rows.length, pairs: pairs.size, suppliers: new Set(rows.map(r => r.s)).size, customers: new Set(rows.map(r => r.c)).size, documentsSearched: HITS.size, customersSearched: withA.length },
    customers: Object.fromEntries(withA.map(o => [o.cik, { names: [...o.names], aliases: o.aliases, syms: [...o.syms] }])), links: rows };
  if (fs.existsSync(LINKS)) { log('links file exists already: NOT overwritten (frozen)'); } else { W(LINKS, out, true); log('links written: ' + JSON.stringify(out.counts)); }
  if (!fs.existsSync(CHECK)) { const LX = J(LINKS, out), byPair = new Map(); for (const r of sampleOf(LX.links, LX.links.length, SEED)) { const p = r.s + '>' + r.c; if (!byPair.has(p)) byPair.set(p, r); if (byPair.size >= TH.sample) break; }
    W(CHECK, { generatedAt: new Date().toISOString(), seed: SEED, linksSha: crypto.createHash('sha256').update(fs.readFileSync(LINKS)).digest('hex'), note: 'HAND CHECK of 50 random supplier -> customer links (seed 28), done BEFORE any return. hand.ok = the named company is really the customer CIK\'s company, a real counterparty, and >= 10% of the supplier\'s revenue in the latest year of that 10-K.',
      sample: [...byPair.values()].map((r, j) => ({ n: j + 1, supplier: r.sn, supplierCik: r.s, customer: r.cn, customerCik: r.c, filed: r.filed, url: SEC + '/Archives/edgar/data/' + r.s + '/' + r.adsh.replace(/-/g, '') + '/' + r.file, pct: r.pct, sentence: r.sentence, hand: null })) }, true); log('hand-check sample written: ' + CHECK); } }
if (MODE === 'LINKS') { await buildLinks(); log('LINKS done; SEC requests ' + secReq + ' failed ' + secFail + ' ' + SECFAILS.slice(0, 3).join(' | ')); process.exit(0); }

// ================= 6. THE FROZEN LINKS + HAND CHECK =================
const LRAW = (() => { try { return fs.readFileSync(LINKS); } catch (e) { return null; } })(), LSHA = LRAW ? crypto.createHash('sha256').update(LRAW).digest('hex') : null, CK = J(CHECK, {});
const PREC = precisionOf((CK.sample || []).map(x => x.hand)), handN = (CK.sample || []).filter(x => x.hand && typeof x.hand.ok === 'boolean').length;
STATUS.links = { ok: !!LRAW && !!LINKS_SHA && LSHA === LINKS_SHA, sha: LSHA, expected: LINKS_SHA }; STATUS.handCheck = { ok: handN >= TH.sample && PREC >= TH.minPrecision && CK.linksSha === LSHA, checked: handN, precision: r4(PREC) };
if (!STATUS.links.ok || !STATUS.handCheck.ok) { log('frozen links or hand check not in place: ' + JSON.stringify({ links: STATUS.links, hand: STATUS.handCheck }) + '; nothing run'); W(OUT, { ...PREV, generatedAt: new Date().toISOString(), data: STATUS }, true); process.exit(0); }
const LX = JSON.parse(LRAW.toString()), SHOWS = new Map(), SUPP = new Map(), BYCUST = new Map();   // 's>c' -> Set(filed); supplier cik -> { tickers }; customer cik -> [supplier ciks]
const FWDROWS = MODE === 'PAPER' && iso(Date.now()) >= PAPER_START ? (await buildLinks(LX)) || [] : (J('data/squad28-links-forward.json', {}).links || []);
const SHOWS_F = new Map(); for (const r of LX.links) { const p = r.s + '>' + r.c; (SHOWS_F.get(p) || SHOWS_F.set(p, new Set()).get(p)).add(r.filed); }
for (const r of [...LX.links, ...FWDROWS]) { const p = r.s + '>' + r.c; (SHOWS.get(p) || SHOWS.set(p, new Set()).get(p)).add(r.filed); const o = SUPP.get(r.s) || SUPP.set(r.s, { tk: new Set(), name: r.sn }).get(r.s); if (r.tk) o.tk.add(r.tk); for (const t of r.etk || []) o.tk.add(t);
  const b = BYCUST.get(r.c) || BYCUST.set(r.c, new Set()).get(r.c); b.add(r.s); }
log('forward links (paper lane only): ' + FWDROWS.length); log('frozen links: ' + LX.links.length + ' rows, ' + SHOWS.size + ' pairs; hand check precision ' + pc(PREC) + ' of ' + handN);

// ================= 7. EARNINGS: Nasdaq calendar =================
const NQ_HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
const usd = (x) => { const s = String(x || '').replace(/[$,\s]/g, ''); const m = /^\(([\d.]+)\)$/.exec(s); if (m) return -+m[1]; return s && isFinite(+s) && s !== '' ? +s : null; };
const REPORTS = []; { const days = [], today = iso(Date.now()); for (let x = Date.parse(D[0] + 'T12:00:00Z') - 10 * 864e5; x <= Date.now() + 40 * 864e5; x += 864e5) { const w = new Date(x).getUTCDay(); if (w > 0 && w < 6) days.push(iso(x)); }
  let fetched = 0, miss = 0, fromOther = 0; const old = (d) => d < iso(Date.now() - 7 * 864e5);
  for (const d of days) { let rows = old(d) ? J(SC + '/nasdaq/' + d + '.json', null) : null;
    if (!rows && old(d)) for (const dir of [(env.ANOM_CACHE || 'anomaly-cache') + '/nasdaq/', 'a-cache/nasdaq/']) { rows = J(dir + d + '.json', null); if (rows) { fromOther++; break; } }
    if (!rows) { if (left() < 60 * 60e3) { if (d <= today) miss++; continue; } await sleep(local(env.NASDAQ_BASE) ? 0 : 350); fetched++; let j = null; try { const r = await fetch(NQ + '/api/calendar/earnings?date=' + d, { headers: NQ_HEAD, signal: AbortSignal.timeout(30000) }); j = r.ok ? await r.json().catch(() => null) : null; } catch (e) {}
      if (!j || !j.data) { if (d <= today) miss++; continue; } rows = (j.data.rows || []).map(x => { const s = String(x.symbol || '').trim(); if (!/^[A-Z]{1,5}$/.test(s)) return null; return [s, x.time === 'time-pre-market' ? 'bmo' : x.time === 'time-after-hours' ? 'amc' : null, usd(x.eps), usd(x.epsForecast)]; }).filter(Boolean); W(SC + '/nasdaq/' + d + '.json', rows); }
    for (const r of rows) REPORTS.push({ sym: r[0], d, time: r[1], a: r[2], e: r[3] }); }
  const past = days.filter(d => d <= today).length; STATUS.earn = { ok: miss <= past * 0.05, days: past, missing: miss, fetchedNow: fetched, fromOtherCaches: fromOther, reports: REPORTS.length }; log('Nasdaq calendar: ' + JSON.stringify(STATUS.earn)); }
// own reports by ticker (reaction sessions on the extended calendar) and 10-Q / 10-K filing sessions by CIK
const OWNREP = new Map(); for (const r of REPORTS) { const k = reactionIdx(DX, r.d, r.time); if (k < 0) continue; (OWNREP.get(r.sym) || OWNREP.set(r.sym, []).get(r.sym)).push(k); }
const ownSessions = (sym, cik) => { const a = [...(OWNREP.get(sym) || [])]; for (const d of [...(TENK.get(cik) || []), ...(TENQ.get(cik) || [])]) a.push(firstOnOrAfter(DX, d)); return a; };
STATUS.dataOk = STATUS.price.ok && STATUS.master.ok && STATUS.tickerMap.ok && STATUS.earn.ok && STATUS.links.ok && STATUS.handCheck.ok;

// ================= 8. EVENTS =================
// retime(report, calendarSession) -> the reaction session to use (correctedRun: SEC 8-K Item 2.02 acceptance time); null = the calendar rule
function buildEvents(retime = null) { const COUNT = { reports: 0, withSue: 0, top30: 0, top30Up: 0, noCustomerCik: 0, noLinkedSupplier: 0, linkInactive: 0, supplierNoTicker: 0, supplierFilter: 0, ownReport: 0, sameCompany: 0 };
const EV = { [ID]: [], [VAR]: [] }, CUSTEV = [];
{ const reps = REPORTS.filter(r => SY.has(r.sym) && ok(r.e) && ok(r.a)).map(r => { const c = reactionIdx(D, r.d, r.time); return { ...r, i: SY.get(r.sym), r: retime && c > 0 ? retime(r, c) : c }; }).filter(r => r.r > 0 && r.r < T).sort((a, b) => a.r - b.r);
  const hist = [], cutMemo = new Map(), seen = new Set();
  for (const rp of reps) { const p = CA[rp.i * T + rp.r - 1]; if (!(p > 0) || !LIQ[rp.i * T + rp.r - 1]) continue; const s = sueOf(rp.a, rp.e, p); if (!ok(s) || Math.abs(s) > 1) continue;
    const key = rp.sym + '|' + rp.r; if (seen.has(key)) continue; seen.add(key); COUNT.reports++;
    if (!cutMemo.has(rp.r)) cutMemo.set(rp.r, sueCut(hist, rp.r)); const cut = cutMemo.get(rp.r); hist.push([rp.r, s]); if (cut === null) continue; COUNT.withSue++;
    if (!(s >= cut)) continue; COUNT.top30++; const react = CA[rp.i * T + rp.r] > 0 ? CA[rp.i * T + rp.r] / p - 1 : null; const up = ok(react) && react > 0; if (up) COUNT.top30Up++;
    const ccik = cikOn(rp.sym, D[rp.r]); if (!ccik) { COUNT.noCustomerCik++; continue; } const sups = BYCUST.get(ccik); if (!sups || !sups.size) { COUNT.noLinkedSupplier++; continue; }
    CUSTEV.push({ r: rp.r, csym: rp.sym, ccik, sue: s, cut, react, up });
    for (const scik of sups) { if (scik === ccik) { COUNT.sameCompany++; continue; } const pr = scik + '>' + ccik; if (!linkActiveOn(TENK.get(scik), (D[rp.r] >= PAPER_START ? SHOWS : SHOWS_F).get(pr) || new Set(), D[rp.r])) { COUNT.linkInactive++; continue; }
      const sym = symFor(scik, [...(SUPP.get(scik) || { tk: [] }).tk], D[rp.r]); if (!sym) { COUNT.supplierNoTicker++; continue; } const i = SY.get(sym);
      if (!inU(i, rp.r)) { COUNT.supplierFilter++; continue; } if (ownNear(ownSessions(sym, scik), rp.r)) { COUNT.ownReport++; continue; }
      const ev = { r: rp.r, i, sym, scik, sname: (SUPP.get(scik) || {}).name, ccik, csym: rp.sym, sue: s, react, pct: Math.max(...[...LX.links.filter(z => z.s === scik && z.c === ccik && z.filed < D[rp.r])].map(z => z.pct).concat([0])) };
      EV[VAR].push(ev); if (up) EV[ID].push(ev); } }
  for (const id of IDS) { const m = new Map(); for (const e of EV[id]) { const k = e.i + '|' + e.r; if (!m.has(k)) m.set(k, e); } EV[id] = [...m.values()].sort((a, b) => a.r - b.r || a.i - b.i); } }
return { EV, COUNT, CUSTEV }; }
const countsOf = (EVx, end = T - 1) => Object.fromEntries(IDS.map(id => [id, { older: EVx[id].filter(z => halfOf(D[z.r]) === 'older' && z.r + 1 <= end).length, newer: EVx[id].filter(z => halfOf(D[z.r]) === 'newer' && z.r + 1 <= end).length }]));
const { EV, COUNT, CUSTEV } = buildEvents(), COUNTS = countsOf(EV);
log('funnel ' + JSON.stringify(COUNT) + ' | CASE COUNTS (before one-open): ' + JSON.stringify(COUNTS));

// ================= 9. TRADES, PLACEBO AND THE ONE-SHOT =================
const liqMemo = new Map(), liqList = (t) => { if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); if (liqMemo.size > 80) liqMemo.delete(liqMemo.keys().next().value); } return liqMemo.get(t); };
const uMemo = new Map(), uList = (t) => { if (!uMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (inU(i, t)) a.push(i); uMemo.set(t, a); if (uMemo.size > 80) uMemo.delete(uMemo.keys().next().value); } return uMemo.get(t); };
const avgMemo = new Map(), avgOver = (list, k, x, tag) => { const key = tag + '|' + k + '|' + x; if (avgMemo.has(key)) return avgMemo.get(key); const v = []; for (const i of list) { if (artifactIn(i, k - 1, x)) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); }
  const m = v.length >= 50 ? mean(v) : null; if (avgMemo.size > 20000) avgMemo.clear(); avgMemo.set(key, m); return m; };
const QSESS = new Map(); D.forEach((d, t) => { const q = quarterKey(d); (QSESS.get(q) || QSESS.set(q, []).get(q)).push(t); });
function tradesOf(evs, end = T - 1, seed = SEED) { const out = [], busy = new Map(), spans = new Map(), evSess = new Map(); let artifacts = 0, noYard = 0, noOpen = 0;
  for (const z of evs) (evSess.get(z.i) || evSess.set(z.i, []).get(z.i)).push(z.r);
  for (const z of evs) { const k = z.r + 1; if (k > end) continue; if ((busy.get(z.i) ?? -1) >= k) continue; const S = series(z.i), ex = exitOf(S, k, end + 1); if (!ex) { noOpen++; continue; } if (ex.open) continue;
    if (artifactIn(z.i, z.r - 22, ex.x)) { artifacts++; continue; } const e = OA[z.i * T + k], g = ex.px / e - 1, lc = Math.max(k, ex.lastClose), c = avgOver(uList(z.r), k, lc, 'u'); if (c === null) { noYard++; continue; }
    busy.set(z.i, ex.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([k, ex.x]);
    out.push({ t: z.r, d: D[z.r], s: z.sym, i: z.i, k, x: ex.x, lc, kind: ex.kind, days: Math.max(1, ex.held), g: capG(g), g0: g, c, liq: avgOver(liqList(z.r), k, lc, 'l'), spy: spyRet(k, lc), half: halfOf(D[z.r]), ev: z }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.lc - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 30, to: end, len, step: 5, busy: spans.get(z.i) || [], mode: 'capBoth', okAt: (u) => inU(z.i, u - 1) && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  // PLACEBO: the same supplier on a random non-event session of the same calendar quarter (seeded, drawn in trade order)
  const rng = mulberry32(seed); for (const z of out) { const cand = (QSESS.get(quarterKey(D[z.t])) || []).filter(u => u + 1 <= end), own = ownSessions(z.s, z.ev.scik);
    const u = placeboPick(rng, cand, evSess.get(z.i), (u) => inU(z.i, u) && !ownNear(own, u)); if (u === null) { z.pl = null; continue; }
    const S = series(z.i), ex = exitOf(S, u + 1, end + 1); if (!ex || ex.open || artifactIn(z.i, u - 22, ex.x)) { z.pl = null; continue; } const lc = Math.max(u + 1, ex.lastClose), g = capG(ex.px / OA[z.i * T + u + 1] - 1), c = avgOver(uList(u), u + 1, lc, 'u');
    z.pl = { u, d: D[u], g, c, kind: ex.kind }; }
  out.artifacts = artifacts; out.noYard = noYard; out.noOpen = noOpen; return out; }
const placeboStats = (tr) => Object.fromEntries(['older', 'newer', 'all'].map(h => { const a = tr.filter(z => (h === 'all' || z.half === h) && z.pl), d = a.map(z => z.g - z.pl.g), sd = d.length > 1 ? Math.sqrt(d.reduce((u, w) => u + (w - mean(d)) ** 2, 0) / (d.length - 1)) : null;
  return [h, { n: a.length, ruleAvg: r4(mean(a.map(z => z.g - COST))), placeboAvg: r4(mean(a.map(z => z.pl.g - COST))), placeboEdge: r4(mean(a.filter(z => ok(z.pl.c)).map(z => z.pl.g - z.pl.c))), ruleMinusPlacebo: r4(mean(d)), tPaired: sd > 0 ? r4(mean(d) / (sd / Math.sqrt(d.length))) : null }]; }));
function evalRule(id, tr, counts, funnel) {
  const B = TH.block, R = { older: halfStat(tr.filter(z => z.half === 'older'), B), newer: halfStat(tr.filter(z => z.half === 'newer'), B), all: halfStat(tr, B) };
  const liqH = Object.fromEntries(['older', 'newer', 'all'].map(h => { const a = tr.filter(z => (h === 'all' || z.half === h) && ok(z.liq)); return [h, { n: a.length, edge: r4(mean(a.map(z => z.g - z.liq))) }]; }));
  const PY = Object.fromEntries(['older', 'newer'].map(h => { const a = tr.filter(z => z.half === h); return [h, { rule: r4(perYear(a)), spy: r4(perYear(a.filter(z => ok(z.spy)).map(z => ({ g: z.spy, days: z.days })), 'g', 0)), avgStock: r4(perYear(a.map(z => ({ g: z.c, days: z.days })), 'g', 0)) }]; }));
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] } });
  return { ...v, name: RULES[id].name, kind: 'buy', family: RULES[id].family, hold: TH.hold, block: B, caseCounts: counts, results: R, perYear: PY, placebo: { note: 'YARDSTICK (not a gate): the same supplier on a random non-event session of the same quarter (seed ' + SEED + '), same filters and exit', ...placeboStats(tr) },
    liquidYardstick: { note: 'information: edge vs the average liquid stock (5 USD+, 5M USD+ a day)', ...liqH }, shape: shapeOf(tr), artifactsLeftOut: tr.artifacts, noYardstick: tr.noYard, noEntryOpen: tr.noOpen, funnel, linkPrecision: STATUS.handCheck,
    split: SPLIT, cost: COST, yardstick: 'average stock with close 3 USD+ and 20-day traded value 2M USD+ on the signal session, same sessions; capBoth (AUD-1)' };
}
// ================= 9a. CORRECTED RUN SQ28-TIMING (MODE=CORRECT; firstRun untouched; run once) =================
// Bug found after the frozen run (27 Oct 2026, confirmed by the lead): the Nasdaq calendar often has NO report time; the frozen rule then
// took the NEXT session as the reaction session, so a before-the-open report (e.g. Walmart 20 Feb 2024, Dollar General 13 Mar 2025) was
// judged on the day AFTER its reaction (the reaction sign read on the wrong day, the entry one day late). Fix: every report of a company
// that is a linked customer is timed from its own SEC 8-K listing Item 2.02 (the 8-K closest to the calendar date, within 3 calendar
// days; acceptance time, New York clock): before 09:30 -> that session; 09:30-15:59 -> that session; 16:00 or later -> the next session.
// A report with no such 8-K keeps the calendar rule. Rule, gates, links, window, costs, yardsticks, placebo seed: unchanged.
if (MODE === 'CORRECT') {
  const CR = { ...(PREV.correctedRun || {}) }, todo = IDS.filter(id => FROZEN[id] && !CR[id]);
  if (!todo.length) { log('CORRECT: nothing to do (no frozen first run, or the corrected run is frozen already)'); process.exit(0); }
  if (!STATUS.dataOk) { log('CORRECT: data not complete: ' + JSON.stringify(STATUS).slice(0, 400)); process.exit(0); }
  const fr0 = FROZEN[todo[0]], end = tOf.get(String(fr0.window[1])); if (end === undefined) { log('CORRECT: frozen window end not in the data'); process.exit(0); }
  // 8-K Item 2.02 acceptance times of every linked customer CIK (SEC submissions JSON + its older pages)
  const F202 = new Map(), SUBF = J(SC + '/subs202.json', {}); let fail = 0;
  for (const cik of BYCUST.keys()) { if (!SUBF[cik]) { const pad = 'CIK' + String(cik).padStart(10, '0'), rows = [], take = (r) => { if (!r || !r.form) return; for (let j = 0; j < r.form.length; j++) if (/^8-K/.test(r.form[j]) && r.form[j] !== '8-K/A' && /\b2\.02\b/.test(String((r.items || [])[j] || ''))) rows.push(String(r.acceptanceDateTime[j] || '')); };
      const j = await sec(SECD + '/submissions/' + pad + '.json'); if (!j || !j.filings) { fail++; continue; } take(j.filings.recent);
      let okAll = true; for (const f of j.filings.files || []) { if (String(f.filingTo || '') < '2021-06-01') continue; const x = await sec(SECD + '/submissions/' + f.name); if (!x) { okAll = false; break; } take(x); }
      if (!okAll) { fail++; continue; } SUBF[cik] = rows; }
    F202.set(cik, SUBF[cik].map(a => secNY(a)).filter(x => x && x.hm)); }
  W(SC + '/subs202.json', SUBF);
  if (fail) { log('CORRECT: ' + fail + ' customer filing lists not read: nothing frozen'); process.exit(0); }
  const TIM = { customerReports: 0, by8K: 0, noFiling: 0, sameSession: 0, moved: 0, movedEarlier: 0, examples: [] };
  const retime = (rp, cal) => { const ccik = cikOn(rp.sym, rp.d); if (!ccik || !BYCUST.has(ccik)) return cal; TIM.customerReports++; const f = pick202(F202.get(ccik), rp.d); if (!f) { TIM.noFiling++; return cal; }
    const k = sessionOfAcceptance(D, f); if (k < 0) { TIM.noFiling++; return cal; } TIM.by8K++; if (k === cal) TIM.sameSession++; else { TIM.moved++; if (k < cal) TIM.movedEarlier++; if (TIM.examples.length < 25) TIM.examples.push({ sym: rp.sym, date: rp.d, calendarTime: rp.time, acceptedNY: f.d + ' ' + f.hm, calendarSession: D[cal], corrected: D[k] }); } return k; };
  const B2 = buildEvents(retime), C2 = countsOf(B2.EV, end), A0 = buildEvents(), rep = {};
  log('CORRECT timing: ' + JSON.stringify({ ...TIM, examples: TIM.examples.slice(0, 6) }) + ' | CASE COUNTS FIRST (corrected): ' + JSON.stringify(C2));
  for (const id of todo) { const t0r = tradesOf(A0.EV[id], end); rep[id] = { older: t0r.filter(z => z.half === 'older').length, newer: t0r.filter(z => z.half === 'newer').length, frozen: { older: FROZEN[id].results.older.n || 0, newer: FROZEN[id].results.newer.n || 0 } };
    rep[id].matchesFrozen = rep[id].older === rep[id].frozen.older && rep[id].newer === rep[id].frozen.newer;
    const tr = tradesOf(B2.EV[id], end), r = evalRule(id, tr, C2[id], B2.COUNT);
    CR[id] = { at: new Date().toISOString(), frozenAt: FROZEN[id].frozenAt || null, window: [D[0], D[end]], bar: BAR, bugs: ['SQ28-TIMING'],
      reason: 'Reaction-day timing bug (found after the frozen run, confirmed by the lead 27 Oct 2026): the Nasdaq calendar often has no report time, and the frozen rule then used the NEXT session, so before-the-open reports (e.g. Walmart 2024-02-20, Dollar General 2025-03-13) were judged a day late (wrong reaction sign, late entry). Corrected: each linked customer\'s report timed from its own SEC 8-K Item 2.02 acceptance time (before 09:30 ET -> that session; during market hours -> that session; 16:00 or later -> the next session); no 8-K within 3 days -> the calendar rule. Rule, gates, links (same SHA), window, costs, yardsticks and placebo seed unchanged.',
      timing: TIM, reproducedFrozen: rep[id], ...r, trades: tr.map(z => ({ sym: z.s, customer: z.ev.csym, signal: D[z.t], buy: D[z.k], sell: D[z.x], exit: z.kind, react: r4(z.ev.react), net: r4(z.g - COST), avgStock: r4(z.c - COST), placebo: z.pl ? { d: z.pl.d, net: r4(z.pl.g - COST) } : null })) };
    const R = r.results, f = (h) => (h.n || 0) + ' (' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock;
    log('CORRECT ' + id + ': frozen ' + FROZEN[id].verdict + ' -> corrected ' + r.verdict + ' (reproduced frozen: ' + rep[id].matchesFrozen + ') | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | perYear ' + JSON.stringify(r.perYear) + ' | placebo ' + JSON.stringify({ older: r.placebo.older, newer: r.placebo.newer }) + ' | ' + String(r.why).slice(0, 300)); }
  fs.writeFileSync(OUT, JSON.stringify({ ...PREV, generatedAt: new Date().toISOString(), correctedRun: CR }, null, 1));
  try { const LB = J(LIB, null); for (const id of todo) { const e = LB && LB.strategies.find(x => x.id === id), c = CR[id], R = c.results; if (!e) continue;
      e.corrected = { at: c.at, bugs: c.bugs, verdict: c.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg ?? null, R.newer.avg ?? null], stress: [R.older.avgStress ?? null, R.newer.avgStress ?? null], edge: [R.older.edge ?? null, R.newer.edge ?? null],
        vsOwn: [R.older.vsOwn ?? null, R.newer.vsOwn ?? null], noTop2: [R.older.noTop2 ?? null, R.newer.noTop2 ?? null], tBlock: [R.older.tBlock ?? null, R.newer.tBlock ?? null], perYear: [c.perYear.older.rule, c.perYear.newer.rule], spyPerYear: [c.perYear.older.spy, c.perYear.newer.spy],
        placebo: [c.placebo.older.ruleMinusPlacebo, c.placebo.newer.ruleMinusPlacebo], note: 'corrected run (SQ28-TIMING: report time from the SEC 8-K Item 2.02 acceptance time); firstRun unchanged' }; }
    fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { log('library not updated: ' + e.message); }
  process.exit(0); }
const RES = {}, TRS = {}, need = IDS.filter(id => !FROZEN[id]);
if (need.length || env.HISTORY) for (const id of IDS) {
  if (!STATUS.dataOk) { RES[id] = { verdict: 'NOT RUN', why: 'data not complete this run: ' + JSON.stringify({ master: STATUS.master.ok, tickerMap: STATUS.tickerMap.ok, earn: STATUS.earn, links: STATUS.links.ok, hand: STATUS.handCheck }).slice(0, 400) }; log('- ' + id + ': NOT RUN (data)'); continue; }
  const tr = TRS[id] = tradesOf(EV[id]); RES[id] = evalRule(id, tr, COUNTS[id], COUNT); const R = RES[id].results, PY = RES[id].perYear;
  const f = (h) => (h.n || 0) + ' (' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock;
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | perYear ' + JSON.stringify(PY) + ' | placebo ' + JSON.stringify(RES[id].placebo.all) + ' | ' + RES[id].why.slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), (r) => r && r.verdict && r.verdict !== 'NOT RUN');
const tradeRows = (id) => (TRS[id] || []).map(z => ({ sym: z.s, supplier: z.ev.sname, customer: z.ev.csym, signal: D[z.t], buy: D[z.k], sell: D[z.x], exit: z.kind, sue: r4(z.ev.sue), react: r4(z.ev.react), pct: z.ev.pct, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(ok(z.own) ? z.own - COST : null), spy: r4(z.spy), placebo: z.pl ? { d: z.pl.d, net: r4(z.pl.g - COST) } : null }));

// ================= 10. PAPER LANE (from PAPER_START; record only) =================
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigIds = new Set(lines.filter(x => x.type === 'signal').map(x => x.id)), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), newLines = [], lastT = T - 1;
if (STATUS.dataOk) for (const id of IDS) for (const z of EV[id]) { if (D[z.r] < PAPER_START) continue; const sid = id + '|' + z.sym + '|' + D[z.r]; if (sigIds.has(sid)) continue; const late = z.r + 1 <= lastT, entry = late ? D[z.r + 1] : nextSession(D[lastT]);
  const line = { type: 'signal', id: sid, m: id, sym: z.sym, d: D[z.r], customer: z.csym, sue: r4(z.sue), react: r4(z.react), pct: z.pct, close: r4(CA[z.i * T + z.r]), halal: halal(z.sym), hold: TH.hold, entryDate: entry, late, recordedAfter: D[lastT],
    plan: (late ? 'LATE (seen after the entry session; recorded for the board only); ' : '') + 'buy at the open of ' + entry + '; stop 20% under the entry; sell at the close of the 20th session' };
  sigIds.add(sid); newLines.push(line); lines.push(line); }
for (const x of lines.filter(x => x.type === 'signal')) { const i = SY.get(x.sym), k = tOf.get(x.entryDate); if (i === undefined || k === undefined) { x._state = 'waiting'; continue; } const ex = exitOf(series(i), k, T); if (!ex) { x._state = 'void'; continue; }
  if (ex.open) { x._state = 'open'; x._mark = ex.mark; continue; } const lc = Math.max(k, ex.lastClose), g = ex.px / OA[i * T + k] - 1, c = avgOver(uList(tOf.get(x.d) ?? k - 1), k, lc, 'u'); x._state = 'closed'; x._g = g; x._c = c;
  if (!resolved.has(x.id)) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[ex.x], exit: ex.kind, held: ex.held, g: r4(g), net: r4(capG(g) - COST), avgStock: c === null ? null : r4(c - COST), spy: r4(spyRet(k, lc)) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
const sigs = (id) => lines.filter(x => x.type === 'signal' && x.m === id);
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: PAPER_START, note: 'PAPER ONLY (record only). A rule is a buy only if its frozen 5-year verdict meets the TRY SMALL standard (data/squad28-lab.json firstRun). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.',
  methods: Object.fromEntries(IDS.map(id => [id, { name: RULES[id].name, hold: TH.hold, tier: firstRun[id] ? firstRun[id].verdict : null,
    newSignals: sigs(id).filter(x => x.recordedAfter === D[lastT] && !x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, customer: x.customer, plan: x.plan })),
    open: sigs(id).filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, sinceBuy: r4(x._mark ?? NaN) })) }])) }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: PAPER_START, cost: COST, methods: Object.fromEntries(IDS.map(id => { const m = sigs(id), closed = m.filter(x => x._state === 'closed').map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c }));
  return [id, { name: RULES[id].name, hold: TH.hold, signals: m.length, open: m.filter(x => x._state === 'open').length, waiting: m.filter(x => x._state === 'waiting').length, closed: boardStats(closed), frozen: firstRun[id] ? { verdict: firstRun[id].verdict, frozenAt: firstRun[id].frozenAt } : null }]; })) }, null, 1));

// ================= 11. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), squad: 28, philosophy: 'limited attention along the supply chain: a supplier drifts after its 10%+ customer reports a strong surprise (Pandit, Wasley & Zach 2011); event-driven, bought the open after the customer\'s reaction session, held 20 sessions with a 20% stop',
  preRegistered: 'squad28-core.mjs header (27 Oct 2026, before any run) + data/strategy-library.json ' + IDS.join(', ') + '; frozen links ' + LINKS + ' sha256 ' + LINKS_SHA, window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS, caseCounts: COUNTS, funnel: COUNT,
  linkCheck: { precision: r4(PREC), checked: handN, wrong: (CK.sample || []).filter(x => x.hand && x.hand.ok === false).map(x => ({ supplier: x.supplier, customer: x.customer, note: x.hand.note })) },
  standard: 'both halves (signal session before / from ' + SPLIT + '): > 0 after 0.8% and 1.2%, better than the average stock (3 USD+, 2M USD+ a day) over the same sessions, better than the same stock on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks of 20 sessions, block t >= ' + TIER2_T + ', return per year above SPY -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN. +300% cap on every gross return (AUD-1).',
  firstRun, correctedRun: PREV.correctedRun || undefined, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: TRS[ID] ? Object.fromEntries(IDS.map(id => [id, tradeRows(id)])) : PREV.trades, customerEvents: CUSTEV.length };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = 0; for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id];
    if (e && r && r.results && !e.result) { const R = r.results; e.status = 'tested: ' + r.verdict.toLowerCase() + '; forward paper lane from ' + PAPER_START; e.tested = String(r.window[1]); e.study = 'squad28-lab.mjs -> data/squad28-lab.json (run once as written, first complete run frozen)';
      e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg ?? null, R.newer.avg ?? null], stress: [R.older.avgStress ?? null, R.newer.avgStress ?? null], edge: [R.older.edge ?? null, R.newer.edge ?? null],
        vsOwn: [R.older.vsOwn ?? null, R.newer.vsOwn ?? null], noTop2: [R.older.noTop2 ?? null, R.newer.noTop2 ?? null], tBlock: [R.older.tBlock ?? null, R.newer.tBlock ?? null], perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy],
        placebo: [r.placebo.older.ruleMinusPlacebo, r.placebo.newer.ruleMinusPlacebo], linkPrecision: r.linkPrecision.precision, why: r.why }; ch++; } }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad28-lab: library not updated: ' + e.message); }
if (SECFAILS.length) log('SEC requests ' + secReq + ', failed ' + secFail + ': ' + SECFAILS.slice(0, 3).join(' | '));
console.log('SQUAD 28 LAB ' + D[0] + ' to ' + D[T - 1] + ' | cases ' + JSON.stringify(COUNTS) + ' | ' + Object.entries(firstRun).map(([k, r]) => k + ' ' + r.verdict).join(', ') + ' | ' + ['price', 'master', 'tickerMap', 'earn', 'links', 'handCheck'].map(k => k + (STATUS[k] && STATUS[k].ok ? ' ok' : ' MISSING')).join(', '));
