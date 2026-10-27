// SQUAD 24 LAB (27 Oct 2026): "a small company announces a deal with a giant" (squad24-core.mjs header = the exact pre-registered rule).
// Research + forward PAPER lane; never places an order; no Telegram. Keys only from secrets via env, never printed. Official APIs only.
// MODES (env MODE, or the last line of run-squad24-now.txt via the workflow):
//   BUILD = (a) the mega-cap candidates per quarter start -> data/squad24-megacaps-build.json (market values only, NO returns of any rule);
//           the hand-aliased frozen list data/squad24-megacaps.json is written from it BEFORE the rule run and its SHA-256 goes into the core
//           header; (b) TASK A case studies -> data/squad24-cases.json (information, no verdict).
//   RUN   = the 5-year one-shot of SQ24-MEGADEAL (only if data/squad24-megacaps.json matches MEGACAP_SHA), then the paper lane.
//   PAPER = (weekday schedule) the paper lane only, and the one-shot if it is not frozen yet and the list is in place.
// DATA: prices = study-cache/grouped.json.gz (Sunday job, RESTORED READ ONLY; dead stocks and under-3-USD rows included) + sessions since
//   (Massive grouped daily); ticker spans = squad4-cache Form 3/4/5 (READ ONLY); 8-K = EDGAR full-text search per alias and month; each
//   candidate filing = its EDGAR full submission text (header ACCEPTANCE-DATETIME + every document); dilution forms = EDGAR quarterly
//   master index; shares = data/shares.json.gz (split-adjusted, 30 days late); splits = data/splits.json; Alpaca SIP bars for the cases.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { ownAverage, nextSession } from './anomaly-core.mjs';
import { artifactJumps, hasArtifact } from './squad4-core.mjs';
import { eftsHits, html2text } from './squad21-core.mjs';
import { secNY, nyParts } from './sec-time.mjs';
import { ID, RULES, TH, COST, SLIP, SPLIT, PAPER_START, MEGACAP_SHA, EVENT_FROM, LIST_FROM, DIL_FORMS, mean, r4, halfOf, capG, addDays, firstOnOrAfter, quarterOf, listOn, allCiks, topByCap,
  counterpartyMatch, largestUsd, etToIso, SIDE, pathStats, insiderCluster, preRegisterSide, filingSession, firstOpenSession, priceFail, reverseSplitNear, dilutedAt, sharesKnown, exitOf, slipped, perYear, shapeOf, boardStats, preRegister } from './squad24-core.mjs';
const env = process.env, MODE = String(env.MODE || 'PAPER').toUpperCase(), local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', EFTS = local(env.EFTS_BASE) || 'https://efts.sec.gov', AD = local(env.ALPACA_DATA_BASE) || 'https://data.alpaca.markets';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ24_CACHE || 'squad24-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = 'data/squad24-lab.json', PAPER = 'data/squad24-paper.jsonl', TODAY = 'data/squad24-today.json', BOARD = 'data/squad24-board.json', LIB = 'data/strategy-library.json';
const MCF = 'data/squad24-megacaps.json', MCB = 'data/squad24-megacaps-build.json', CASES = 'data/squad24-cases.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o, pretty) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, pretty ? 1 : 0)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ24_MINUTES || 280) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};
log('squad 24 lab, mode ' + MODE + '; frozen already: ' + (Object.keys(FROZEN).join(', ') || 'none'));

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
{ const LB = J(LIB, null), ch = preRegister(LB) + preRegisterSide(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' squad 24 entry written now'); }

// ================= 1. NETWORK =================
let mvGap = 0, mvCalls = 0;
async function mv(path) { if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null; const url = PX + path;
  for (let a = 0; a < 5; a++) { const w = mvGap - Date.now(); if (w > 0) await sleep(w); mvGap = Date.now() + (local(env.MASSIVE_BASE) ? 0 : 70); mvCalls++; let r;
    try { r = await fetch(url + (url.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(15000 * (a + 1)); continue; } if (r.status === 404) return { notFound: true }; if (r.status === 401 || r.status === 403) return { refused: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
let lastSec = 0, secReq = 0, secFail = 0; const SECFAILS = [];
async function sec(url, kind = 'json') { for (let a = 0; a < 4; a++) { const w = (local(env.SEC_BASE) || local(env.EFTS_BASE) ? 0 : 125) - (Date.now() - lastSec); if (w > 0) await sleep(w); lastSec = Date.now(); secReq++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(90000) }); if (r.status === 404 || r.status === 410) return kind === 'text' ? '' : null;
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; } if (!r.ok) { secFail++; if (SECFAILS.length < 20) SECFAILS.push('HTTP ' + r.status + ' ' + url.slice(0, 160)); return undefined; }
      if (kind === 'json') return await r.json(); const b = Buffer.from(await r.arrayBuffer()); return b.subarray(0, 15e6).toString('latin1'); } catch (e) { await sleep(1000 * (a + 1)); } }
  secFail++; if (SECFAILS.length < 20) SECFAILS.push('gave up ' + url.slice(0, 160)); return undefined; }
const AH = { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' };
async function alp(path) { if (!env.ALPACA_KEY && !local(env.ALPACA_DATA_BASE)) return null;
  for (let a = 0; a < 5; a++) { let r; try { r = await fetch(AD + path, { headers: AH, signal: AbortSignal.timeout(120000) }); } catch (e) { await sleep(2000 * (a + 1)); continue; }
    if (r.status === 429) { await sleep(3000 * (a + 1)); continue; } if (!r.ok) return { bad: r.status }; return await r.json().catch(() => null); } return null; }
async function alpBars(sym, tf, start, end, adj) { const out = []; let tok = null;
  do { const j = await alp('/v2/stocks/bars?symbols=' + encodeURIComponent(sym) + '&timeframe=' + tf + '&start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end) + '&adjustment=' + adj + '&feed=sip&sort=asc&limit=10000' + (tok ? '&page_token=' + encodeURIComponent(tok) : ''));
    if (!j || j.bad) return { bars: out, err: j ? 'HTTP ' + j.bad : 'no answer' }; out.push(...(((j.bars || {})[sym]) || [])); tok = j.next_page_token; } while (tok);
  return { bars: out }; }
function download(url, file) { try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 20 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : (/^\d{4}-\d\d-\d\d/.test(String(s || '')) ? String(s).slice(0, 10) : null); };
const monthsFrom = (from) => { const out = [], now = new Date(); for (let y = +from.slice(0, 4), m = +from.slice(5, 7); y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1); m === 12 ? (y++, m = 1) : m++) out.push(y + '-' + String(m).padStart(2, '0')); return out; };
const monthEnd = (m) => iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)), slug = (p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-');
// the EDGAR full submission text -> { accept: 'YYYYMMDDHHMMSS' Eastern, form, docs: [{ type, file, text }] }
function parseSubmission(txt) { const s = String(txt || ''), hdrEnd = s.search(/<DOCUMENT>/i), hdr = hdrEnd > 0 ? s.slice(0, hdrEnd) : s.slice(0, 20000);
  const acc = /<ACCEPTANCE-DATETIME>\s*(\d{14})/i.exec(hdr) || /ACCEPTANCE-DATETIME:\s*(\d{14})/i.exec(hdr), form = /CONFORMED SUBMISSION TYPE:\s*([^\n]+)/i.exec(hdr), items = [...hdr.matchAll(/ITEM INFORMATION:\s*([^\n]+)/gi)].map(m => m[1].trim());
  const docs = []; const re = /<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi; let m;
  while ((m = re.exec(s)) !== null) { const body = m[1], type = ((/<TYPE>([^\n<]+)/i.exec(body) || [])[1] || '').trim().toUpperCase(), file = ((/<FILENAME>([^\n<]+)/i.exec(body) || [])[1] || '').trim();
    if (!(type === '8-K' || type === '6-K' || /^EX-99/.test(type) || /^EX-10/.test(type))) continue; if (/\.(pdf|jpg|jpeg|png|gif|xlsx?|zip)$/i.test(file)) continue;
    docs.push({ type, file, text: html2text(body.slice(0, 3e6)) }); }
  return { accept: acc ? acc[1] : null, form: form ? form[1].trim() : null, items, docs }; }
const subUrl = (cik, adsh) => SEC + '/Archives/edgar/data/' + (+cik) + '/' + adsh.replace(/-/g, '') + '/' + adsh + '.txt';
async function efts(q, a, b, extra = '') { const hits = []; for (let from = 0; from < 10000; from += 100) {
    const j = await sec(EFTS + '/LATEST/search-index?q=' + encodeURIComponent('"' + q + '"') + extra + '&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from);
    if (!j || !j.hits) return null; const tot = (j.hits.total && j.hits.total.value) || 0;
    if (from === 0 && tot >= 9900 && a < b) { const mid = iso((Date.parse(a) + Date.parse(b)) / 2), x = await efts(q, a, mid, extra), y = await efts(q, addDays(mid, 1), b, extra); return x && y ? x.concat(y) : null; }
    const h = eftsHits(j); hits.push(...h); if (h.length < 100 || from + 100 >= tot) break; } return hits; }

// ================= 2. PRICES (squad 21 pattern) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad24-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
const spyI = SY.get('SPY'); if (spyI === undefined) { console.log('squad24-lab: SPY missing; nothing done'); process.exit(0); }
const ser = (A, i) => A.subarray(i * T, i * T + T), series = (i) => ({ o: ser(OA, i), h: ser(HA, i), l: ser(LA, i), c: ser(CA, i), v: ser(VA, i) });
const LIQ = new Uint8Array(N), DV = new Float32Array(N).fill(NaN);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0, s2 = 0, n2 = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN, w2 = CA[b + t] * VA[b + t]; if (isFinite(v)) { s += v; n++; } if (isFinite(w2)) { s2 += w2; n2++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN, z = CA[k] * VA[k]; if (isFinite(w)) { s -= w; n--; } if (isFinite(z)) { s2 -= z; n2--; } }
    if (t >= 19 && n === 20 && CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; if (t >= 19 && n2 >= 18) DV[b + t] = s2 / n2; } }
STATUS.price = { ok: T >= 1000, sessions: T, from: D[0], to: D[T - 1], stocks: NS };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks)');
const closeAt = (i, x, k) => { for (let q = Math.min(x, T - 1); q >= k; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1 || x < k) return null; const e = OA[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const JUMPS = new Map(), artifactIn = (i, a, b) => { if (!JUMPS.has(i)) JUMPS.set(i, artifactJumps(ser(CA, i))); return hasArtifact(JUMPS.get(i), a, b); };
const inU = (i, t) => t >= 0 && t < T && i !== spyI && CA[i * T + t] >= TH.minClose && CA[i * T + t] <= TH.maxClose && DV[i * T + t] >= TH.minDv;
const spyRet = (k, x) => { const e = OA[spyI * T + k], y = closeAt(spyI, x, k); return e > 0 && y > 0 ? y / e - 1 : null; };

// ================= 3. IDENTITY: point-in-time ticker spans (squad 4 cache, read only) =================
const CIKMAP = new Map(); { let q = 0; for (const f of (() => { try { return fs.readdirSync(SC4 + '/f345'); } catch (e) { return []; } })()) { const x = JZ(SC4 + '/f345/' + f, null); if (!x) continue; q++;
    for (const [sym, cik, a, b, n] of x.map) (CIKMAP.get(cik) || CIKMAP.set(cik, []).get(cik)).push([sym, a, b, n]); } STATUS.tickerMap = { ok: q >= 20, quarters: q, ciks: CIKMAP.size }; log('ticker map: ' + JSON.stringify(STATUS.tickerMap)); }
const SH = JZ('data/shares.json.gz', { t: {}, c: {} }), SECCIK = J('data/sec-ciks.json', {});
const todayCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(+a); const y = SECCIK[s]; return y ? String(+y[0]) : null; };
const TODAYSYMS = new Map(); for (const s of SYMS) { const c = todayCik(s); if (c) (TODAYSYMS.get(c) || TODAYSYMS.set(c, []).get(c)).push(s); }
const hasPx = (i, t) => { for (let q = Math.max(0, t - 5); q <= Math.min(T - 1, t + 5); q++) if (CA[i * T + q] > 0) return true; return false; };
const symFor = (cik, tickers, d) => { const t = Math.min(firstOnOrAfter(D, d), T - 1), c = String(+cik), sp = (CIKMAP.get(c) || []).filter(s => d >= addDays(s[1], -400) && d <= addDays(s[2], 400)).sort((a, b) => b[3] - a[3]);
  for (const s of [...sp.map(x => x[0]), ...(tickers || []), ...(TODAYSYMS.get(c) || [])]) { const i = SY.get(s); if (i !== undefined && hasPx(i, t)) return s; } return null; };
// point-in-time CIK of a symbol on day d (spans first, then today's list)
const SPANCIK = new Map(); for (const [cik, a] of CIKMAP) for (const [sym, f, l, n] of a) (SPANCIK.get(sym) || SPANCIK.set(sym, []).get(sym)).push([cik, f, l, n]);
const cikOn = (sym, d) => { const a = (SPANCIK.get(sym) || []).filter(s => d >= addDays(s[1], -400) && d <= addDays(s[2], 400)).sort((x, y) => y[3] - x[3]); return a.length ? String(+a[0][0]) : todayCik(sym); };
const splitFactorAfter = (sym, d) => (SPLITS.get(sym) || []).filter(x => x.d > d && x.d <= D[T - 1]).reduce((a, x) => a * x.r, 1);

// ================= 4. BUILD: mega-cap candidates per quarter start (market values only; no returns) =================
async function buildMegacaps() { const qs = []; for (let y = +LIST_FROM.slice(0, 4), m = +LIST_FROM.slice(5, 7); ; m += 3) { if (m > 12) { m -= 12; y++; } const q = y + '-' + String(m).padStart(2, '0') + '-01'; if (q > D[T - 1]) break; qs.push(q); }
  const DC = J(SC + '/details.json', {}), out = { generatedAt: new Date().toISOString(), note: 'BUILD output: market values only (Massive ticker details on the date, else close x SEC shares known 30 days earlier). No rule returns. The frozen list with hand aliases is data/squad24-megacaps.json.', quarters: {} };
  for (const q of qs) { const t = firstOnOrAfter(D, q); if (t >= T) continue; const d = D[t], rows = [];
    for (let i = 0; i < NS; i++) { if (i === spyI) continue; const c = CA[i * T + t]; if (!(c > 0)) continue; let s = 0, n = 0; for (let k = Math.max(0, t - 19); k <= t; k++) { const z = CA[i * T + k] * VA[i * T + k]; if (isFinite(z)) { s += z; n++; } }
      const sym = SYMS[i], cik = cikOn(sym, d), sh = cik ? sharesKnown(SH.c[cik], d) : null; rows.push({ i, sym, dv: n ? s / n : 0, secCap: sh ? sh * c : null, cik }); }
    const byDv = [...rows].sort((a, b) => b.dv - a.dv).slice(0, 450), byCap = rows.filter(r => r.secCap > 0).sort((a, b) => b.secCap - a.secCap).slice(0, 300), cand = new Map();
    for (const r of [...byDv, ...byCap]) cand.set(r.sym, r);
    const ranked = [];
    for (const r of cand.values()) { const key = r.sym + '|' + d; if (!(key in DC)) { const j = await mv('/v3/reference/tickers/' + encodeURIComponent(r.sym) + '?date=' + d), x = j && j.results;
        DC[key] = x ? { mc: x.market_cap || null, cik: x.cik ? String(+x.cik) : null, name: x.name || null, type: x.type || null } : (j && j.notFound ? { nf: 1 } : null); }
      const x = DC[key]; if (x && x.type && !/^(CS|ADRC|OS)$/.test(x.type)) continue; if (!x && !r.secCap) continue;
      const cap = x && x.mc > 0 ? x.mc : r.secCap, cik = (x && x.cik) || r.cik; if (!(cap > 0) || !cik) continue;
      ranked.push({ cik, sym: r.sym, name: (x && x.name) || null, cap, src: x && x.mc > 0 ? 'massive' : 'sec', type: (x && x.type) || null }); }
    W(SC + '/details.json', DC);
    const top = topByCap(ranked, 130); out.quarters[q] = { session: d, top: top.map((r, j) => ({ rank: j + 1, cik: String(+r.cik), sym: r.sym, name: r.name, cap: Math.round(r.cap), src: r.src, type: r.type })) };
    log('mega-caps ' + q + ' (' + d + '): ' + cand.size + ' candidates, ' + ranked.length + ' valued; #1 ' + (top[0] && top[0].sym) + ', #100 ' + (top[99] && top[99].sym) + ' ' + (top[99] ? (top[99].cap / 1e9).toFixed(0) + 'B' : '')); }
  W(MCB, out, true); }

// ================= 5. TASK A: CASE STUDIES (information only) =================
const CASE_DEFS = [
  { id: 'SOUN-NVDA-13F', sym: 'SOUN', cik: '1840856', what: 'Nvidia\'s first 13F-HR showed a SoundHound stake (a filing BY Nvidia; no SoundHound deal 8-K)', search: { q: 'SoundHound', forms: '13F-HR', ciks: '0001045810', a: '2024-02-01', b: '2024-02-29' }, own8k: { a: '2024-01-25', b: '2024-02-29' } },
  { id: 'ELVA-AMZN', sym: 'ELVA', cik: '1844450', what: 'Electrovaya commercial agreement + warrants with Amazon (foreign private issuer: Form 6-K, not an 8-K)', search: { q: 'Amazon', forms: '6-K', ciks: '0001844450', a: '2026-07-08', b: '2026-07-31' },
    press: { at: '2026-07-15T15:51-04:00', src: 'GlobeNewswire via BNN Bloomberg, 15 Jul 2026 3:51 p.m. EDT (2026-07-15T19:51:27Z)', url: 'https://www.bnnbloomberg.ca/press-releases/2026/07/15/electrovaya-announces-commercial-relationship-with-amazon/' } },
  { id: 'WULF-GOOGL', sym: 'WULF', cik: '1083301', what: 'TeraWulf / Fluidstack 10-year AI hosting deal backstopped by Google, Google warrants (8-K Item 1.01)', search: { q: 'Google', forms: '8-K', ciks: '0001083301', a: '2025-08-10', b: '2025-08-20' }, known: ['0001104659-25-078084'] } ];
const nyTime = (ms) => { const p = nyParts(ms); return p.d + ' ' + p.hm; };
async function runCases() { const out = { generatedAt: new Date().toISOString(), note: 'TASK A, information only (no verdict). Times are New York. SEC times = the EDGAR header ACCEPTANCE-DATETIME (Eastern). Bars = Alpaca SIP (minute bars raw, daily bars split-adjusted).', cases: [] };
  for (const C of CASE_DEFS) { const R = { id: C.id, sym: C.sym, what: C.what, filings: [] }; try {
    const hits = await efts(C.search.q, C.search.a, C.search.b, '&forms=' + encodeURIComponent(C.search.forms) + '&ciks=' + C.search.ciks) || [];
    const adshs = [...new Set([...(C.known || []), ...hits.map(h => h[1]).filter(Boolean)])].slice(0, 6);
    for (const a of adshs) { const cik = +C.search.ciks; const txt = await sec(subUrl(cik, a), 'text'); if (!txt) { R.filings.push({ adsh: a, error: 'not read' }); continue; } const p = parseSubmission(txt), accIso = etToIso(p.accept, nyParts);
      const mc = p.docs.map(dc => counterpartyMatch(dc.text, [{ cik: 'x', aliases: [C.search.q, C.search.q.toUpperCase()] }])).find(Boolean), lu = p.docs.map(dc => largestUsd(dc.text)).filter(Boolean).sort((x, y) => y.usd - x.usd)[0];
      R.filings.push({ adsh: a, form: p.form, items: p.items, acceptedNY: accIso ? nyTime(Date.parse(accIso)) : null, acceptedIso: accIso, docs: p.docs.map(x => x.type + ' ' + x.file), sentence: mc ? mc.sentence.slice(0, 400) : null, largestUsd: lu ? lu.usd : null, largestUsdText: lu ? lu.snippet.slice(0, 260) : null }); }
    if (C.own8k) { const h = await efts(C.sym === 'SOUN' ? 'SoundHound' : C.sym, C.own8k.a, C.own8k.b, '&forms=8-K&ciks=' + String(C.cik).padStart(10, '0')) || []; R.own8Ks = [...new Map(h.map(x => [x[1], { adsh: x[1], filed: x[3], items: x[4] }])).values()]; }
    const times = R.filings.map(f => f.acceptedIso).filter(Boolean).map(Date.parse); if (C.press) { R.press = C.press; times.push(Date.parse(C.press.at)); }
    const pub = times.length ? Math.min(...times) : null; R.publicNY = pub ? nyTime(pub) : null; R.publicIso = pub ? new Date(pub).toISOString() : null;
    if (pub) { const pd = nyParts(pub).d, dStart = addDays(pd, -45), dEnd = addDays(pd, 25);
      const day = await alpBars(C.sym, '1Day', dStart + 'T00:00:00Z', dEnd + 'T23:59:00Z', 'split'), bars = day.bars.map(b => ({ d: nyParts(Date.parse(b.t)).d, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw }));
      R.dailyErr = day.err || null; const pnp = nyParts(pub), isSess = bars.some(b => b.d === pd), before = bars.filter(b => b.d < pd || (b.d === pd && pnp.hm >= '16:00')), after = bars.filter(b => !before.includes(b));
      const prev = before[before.length - 1]; R.before = prev ? { lastClose: prev.c, lastCloseDate: prev.d, avgVol20: Math.round(mean(before.slice(-20).map(b => b.v)) || 0), avgDollarVol20: Math.round(mean(before.slice(-20).map(b => b.v * b.c)) || 0), ret20: before.length > 20 ? r4(prev.c / before[before.length - 21].c - 1) : null } : null;
      R.daily = bars.slice(Math.max(0, before.length - 5), before.length + 12);
      // minute bars (04:00-20:00 New York): the public day and the next 2 sessions
      const mdays = [...new Set([pd, ...after.filter(b => b.d > pd).slice(0, 2).map(b => b.d)])], mins = [];
      for (const md of mdays) { const m = await alpBars(C.sym, '1Min', md + 'T08:00:00Z', addDays(md, 1) + 'T01:00:00Z', 'raw'); mins.push(...m.bars); if (m.err) R.minuteErr = m.err; }
      const M = [...new Map(mins.map(b => [b.t, b])).values()].sort((a, b) => Date.parse(a.t) - Date.parse(b.t)).map(b => ({ ms: Date.parse(b.t), ny: nyTime(Date.parse(b.t)), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
      R.minuteBars = M.length; const firstAfter = M.find(b => b.ms >= pub + 60000), lastBefore = [...M].reverse().find(b => b.ms < pub);
      const at = (k) => { const x = M.find(b => b.ms >= pub + k * 60000); return x ? { ny: x.ny, o: x.o, c: x.c, v: x.v } : null; };
      R.minutes = { lastBeforePublic: lastBefore ? { ny: lastBefore.ny, c: lastBefore.c } : null, firstMinuteAfter: firstAfter ? { ny: firstAfter.ny, o: firstAfter.o, h: firstAfter.h, l: firstAfter.l, c: firstAfter.c, v: firstAfter.v } : null, plus5: at(5), plus15: at(15), plus60: at(60) };
      const react = after[0], during = isSess && pnp.hm >= '09:30' && pnp.hm < '16:00', e2 = during ? after[1] : after[0], e3 = after[1];
      if (e2) { const openMs = Date.parse(etToIso(e2.d.replace(/-/g, '') + '093000', nyParts)), pre = M.filter(b => b.ms >= pub && b.ms < openMs);
        R.minutes.publicToNextOpen = { minutes: pre.length, shares: pre.reduce((a, b) => a + b.v, 0), dollars: Math.round(pre.reduce((a, b) => a + b.v * b.c, 0)), high: pre.length ? Math.max(...pre.map(b => b.h)) : null, low: pre.length ? Math.min(...pre.map(b => b.l)) : null, vwap: pre.length ? r4(pre.reduce((a, b) => a + b.v * b.c, 0) / Math.max(1, pre.reduce((a, b) => a + b.v, 0))) : null }; }
      const peak = after.length ? Math.max(...after.slice(0, 10).map(b => b.c)) : null, path = (e, from) => after.slice(from, from + 10).map(b => r4(b.c / e - 1));
      R.reaction = react ? { day: react.d, open: react.o, high: react.h, low: react.l, close: react.c, volume: react.v, closeVsPrev: R.before ? r4(react.c / R.before.lastClose - 1) : null, highVsPrev: R.before ? r4(react.h / R.before.lastClose - 1) : null } : null;
      R.moveToPeakClose10 = R.before && peak ? r4(peak / R.before.lastClose - 1) : null; R.moveToReactionClose = R.before && react ? r4(react.c / R.before.lastClose - 1) : null;
      R.entries = {
        firstMinute: firstAfter ? { ny: firstAfter.ny, price: firstAfter.o, vsLastBefore: lastBefore ? r4(firstAfter.o / lastBefore.c - 1) : null, toReactionClose: react ? r4(react.c / firstAfter.o - 1) : null, toPeakClose10: r4(peak / firstAfter.o - 1), closes1to10: path(firstAfter.o, 0) } : null,
        nextRegularOpen: e2 ? { day: e2.d, price: e2.o, gapVsPrev: R.before ? r4(e2.o / R.before.lastClose - 1) : null, toThatClose: r4(e2.c / e2.o - 1), toPeakClose10: r4(peak / e2.o - 1), closes1to10: path(e2.o, after.indexOf(e2)) } : null,
        openAfterReaction: e3 ? { day: e3.d, price: e3.o, toPeakClose10: r4(peak / e3.o - 1), closes1to10: path(e3.o, 1), session10Close: after[10] ? r4(after[10].c / e3.o - 1) : null, minLowNext10: r4(Math.min(...after.slice(1, 11).map(b => b.l)) / e3.o - 1) } : null };
      // H2 timeline (reviewer addendum): T-10 / T-5 / T-3 / T-1 closes and volumes (T-1 = the last close before public), the first minute
      // >= 5% from that close (on the public day or after), and H3 path stats for each entry (1/3/5/10 sessions, max favourable / adverse)
      const tbk = (n) => before[before.length - n] ? { d: before[before.length - n].d, c: before[before.length - n].c, v: before[before.length - n].v } : null;
      const pc0 = R.before ? R.before.lastClose : null, dayStart = Date.parse(etToIso(pd.replace(/-/g, '') + '040000', nyParts)), fr = pc0 ? M.find(b => b.ms >= dayStart && Math.abs(b.c / pc0 - 1) >= 0.05) : null;
      const ps = (e, from) => { const a = after.slice(from, from + 10); if (!a.length) return null; const at = (j) => a[j - 1] ? r4(a[j - 1].c / e - 1) : null; return { d1: at(1), d3: at(3), d5: at(5), d10: at(10), mfe: r4(Math.max(...a.map(b => b.h)) / e - 1), mae: r4(Math.min(...a.map(b => b.l)) / e - 1) }; };
      R.timeline = { 'T-10': tbk(10), 'T-5': tbk(5), 'T-3': tbk(3), 'T-1': tbk(1), firstFormal: R.publicNY, firstReactionMinute5pct: fr ? { ny: fr.ny, c: fr.c, vsPrev: r4(fr.c / pc0 - 1), beforeFormal: fr.ms < pub } : null,
        path: { firstMinute: firstAfter ? ps(firstAfter.o, 0) : null, nextRegularOpen: e2 ? ps(e2.o, after.indexOf(e2)) : null, openAfterReaction: e3 ? ps(e3.o, 1) : null } };
      // which live Stock-2 universes the stock was in on the session before (information: the live rules are big-company / monthly / quarterly rules)
      const i = SY.get(C.sym), tb = prev ? tOf.get(prev.d) : undefined; R.liveRuleCheck = i !== undefined && tb !== undefined ? { liquidUniverse: !!LIQ[i * T + tb], close: r4(CA[i * T + tb]), dv20: Math.round(DV[i * T + tb] || 0) } : { note: 'not in the price cache' }; }
    } catch (e) { R.error = String(e && e.message || e).slice(0, 300); }
    out.cases.push(R); log('case ' + C.id + ': public ' + R.publicNY + ', reaction ' + JSON.stringify(R.reaction) + ', entries ' + String(JSON.stringify(R.entries) || '').slice(0, 400)); }
  W(CASES, out, true); }

if (MODE === 'BUILD') { await buildMegacaps(); await runCases(); log('BUILD done: ' + MCB + ', ' + CASES + '; SEC requests ' + secReq + ' failed ' + secFail + ' ' + SECFAILS.slice(0, 3).join(' | ')); process.exit(0); }

// ================= 6. THE FROZEN LIST =================
const MCRAW = (() => { try { return fs.readFileSync(MCF); } catch (e) { return null; } })(), MCSHA = MCRAW ? crypto.createHash('sha256').update(MCRAW).digest('hex') : null;
STATUS.megacaps = { ok: !!MCRAW && MCSHA === MEGACAP_SHA, sha: MCSHA, expected: MEGACAP_SHA };
if (!STATUS.megacaps.ok) { log('frozen mega-cap list missing or not the registered one (' + MCSHA + ' vs ' + MEGACAP_SHA + '): nothing run'); W(OUT, { ...PREV, generatedAt: new Date().toISOString(), data: STATUS }, true); process.exit(0); }
const MC = JSON.parse(MCRAW.toString()), MCALL = allCiks(MC), COS = (cik) => ({ cik, aliases: (MC.companies[cik] || {}).aliases || [] });
const ALIASES = [...new Set(Object.values(MC.companies).flatMap(c => c.aliases || []))].sort();
log('frozen list: ' + Object.keys(MC.quarters).length + ' quarters, ' + MCALL.size + ' companies, ' + ALIASES.length + ' aliases');

// ================= 7. EDGAR: 8-K hits per alias and month =================
const FT = { complete: true, fetched: 0, missing: [] }, HITS = new Map();   // adsh -> { adsh, cik, d, tickers, aliases:Set, files:Set }
for (const al of ALIASES) { for (const m of monthsFrom(EVENT_FROM.slice(0, 7))) { const f = SC + '/efts/' + slug(al) + '/' + m + '.json', had = J(f, null), recent = m >= iso(Date.now() - 12 * 864e5).slice(0, 7); let h = had;
    if (!had || recent) { if (left() < 70 * 60e3) { if (!had) { FT.complete = false; FT.missing.push(al + ' ' + m); } }
      else { const x = await efts(al, m === EVENT_FROM.slice(0, 7) ? EVENT_FROM : m + '-01', monthEnd(m), '&forms=8-K'); FT.fetched++; if (x) { h = x.filter(z => (z[4] || []).some(it => String(it).trim() === '1.01') && (!z[6] || z[6] === '8-K')).map(z => [z[0], z[1], z[2], z[3], z[7]]); W(f, h); } else if (!had) { FT.complete = false; FT.missing.push(al + ' ' + m); } } }
    for (const z of h || []) { if (!z[1] || !z[2]) continue; const o = HITS.get(z[1]) || HITS.set(z[1], { adsh: z[1], cik: String(+z[2]), d: z[3], tickers: z[4] || [], aliases: new Set(), files: new Set() }).get(z[1]); o.aliases.add(al); o.files.add(String(z[0]).split(':')[1] || ''); } }
  if (FT.fetched && FT.fetched % 500 === 0) log('alias months fetched: ' + FT.fetched); }
STATUS.efts = { ok: FT.complete, fetchedNow: FT.fetched, missing: FT.missing.slice(0, 20), filings: HITS.size };
log('full-text search: ' + HITS.size + ' 8-K item-1.01 filings mention an alias; fetched ' + FT.fetched + ' alias-months' + (FT.complete ? '' : ', INCOMPLETE ' + FT.missing.length));

// ---- EDGAR quarterly master index: dilution forms by CIK ----
const DIL = new Map(); { const qs = [], now = new Date(); for (let y = 2021; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) { const s = new Date(Date.UTC(y, (q - 1) * 3, 1)); if (s <= now && (y > 2021 || q >= 3)) qs.push([y, q]); }
  const fail = []; let rows = 0, got = 0, FORMS = new Set(DIL_FORMS);
  for (const [y, q] of qs) { const key = y + 'q' + q, cf = SC + '/master/' + key + '.json', cur = Date.now() < Date.UTC(y, q * 3, 1) + 5 * 864e5; let x = cur ? null : J(cf, null);
    if (!x) { const gz = SC + '/master.gz'; if (download(SEC + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.gz', gz)) { let txt = null; try { txt = zlib.gunzipSync(fs.readFileSync(gz)).toString('latin1'); } catch (e) {} try { fs.unlinkSync(gz); } catch (e) {}
        if (txt) { x = []; for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length !== 5 || !/^\d+$/.test(p[0].trim())) continue; if (FORMS.has(p[2].trim())) x.push([String(+p[0]), p[2].trim(), p[3].trim()]); } if (x.length > 100) { W(cf, x); got++; } else x = null; } } }
    if (!x) { fail.push(key); continue; } for (const [c, , d] of x) { (DIL.get(c) || DIL.set(c, []).get(c)).push(d); rows++; } }
  STATUS.master = { ok: !fail.length, quarters: qs.length, downloadedNow: got, missing: fail, rows }; log('master index: ' + rows + ' dilution filings' + (fail.length ? ', MISSING ' + fail.join(' ') : '')); }

// ================= 8. EVENTS =================
const sessOf = (d) => firstOnOrAfter(D, d), CAND = [], COUNT = { filings: HITS.size, filerIsMegacap: 0, noStock: 0, prefilter: 0, read: 0, notRead: 0, noAccept: 0, notItem101: 0, filters: {}, noCounterparty: 0, noUsd: 0, noShares: 0, small: 0, events: 0 };
for (const h of HITS.values()) { if (MCALL.has(h.cik)) { COUNT.filerIsMegacap++; continue; } const sym = symFor(h.cik, h.tickers, h.d); if (!sym) { COUNT.noStock++; continue; } const i = SY.get(sym), s0 = sessOf(h.d);
  // cheap prefilter (both possible filing sessions): close 0.8-12 and traded value >= 0.4M
  let pre = false; for (const f of [s0, s0 + 1]) if (f < T && CA[i * T + f] >= 0.8 && CA[i * T + f] <= 12 && DV[i * T + f] >= 4e5) pre = true; if (!pre && s0 < T) continue; COUNT.prefilter++; CAND.push({ ...h, sym, i }); }
const SUBS = J(SC + '/subs.json', {}); // adsh -> { a: accept, it: items, m: [cik, alias, sentence] | null, u: [usd, snippet] | null }
{ let read = 0; for (const e of CAND) { if (e.adsh in SUBS) continue; if (left() < 40 * 60e3) { COUNT.notRead++; continue; }
    const txt = await sec(subUrl(e.cik, e.adsh), 'text'); if (txt === undefined || !txt) { COUNT.notRead++; continue; } const p = parseSubmission(txt);
    const cos = listOn(MC, e.d).map(String).map(COS); let m = null; for (const dc of p.docs) { const x = counterpartyMatch(dc.text, cos); if (x) { m = [x.cik, x.alias, x.sentence.slice(0, 400), dc.type]; break; } }
    const lu = p.docs.map(dc => largestUsd(dc.text)).filter(Boolean).sort((a, b) => b.usd - a.usd)[0];
    SUBS[e.adsh] = { a: p.accept, it: p.items, m, u: lu ? [lu.usd, lu.snippet.slice(0, 300)] : null, f: p.form }; read++; if (read % 300 === 0) { W(SC + '/subs.json', SUBS); log('submissions read: ' + read); } }
  W(SC + '/subs.json', SUBS); COUNT.read = read; }
STATUS.docs = { ok: COUNT.notRead <= Math.max(3, CAND.length * 0.01), candidates: CAND.length, notRead: COUNT.notRead };
const shareCache = J(SC + '/mvshares.json', {});
async function sharesOn(e, d) { const sec0 = sharesKnown(SH.c[e.cik], d); if (sec0) return { n: sec0, src: 'sec' }; const dd = addDays(d, -TH.shareLag), key = e.sym + '|' + dd;
  if (!(key in shareCache)) { const j = await mv('/v3/reference/tickers/' + encodeURIComponent(e.sym) + '?date=' + dd), x = j && j.results; shareCache[key] = x ? (x.weighted_shares_outstanding || x.share_class_shares_outstanding || null) : null; }
  const n = shareCache[key]; return n > 0 ? { n: n * splitFactorAfter(e.sym, dd), src: 'massive' } : null; }
const EVENTS = [], ALLCASES = [];
for (const e of CAND) { const s = SUBS[e.adsh]; if (!s) continue; if (s.f && s.f !== '8-K') { COUNT.notItem101++; continue; }
  const accIso = etToIso(s.a, nyParts); if (!accIso) { COUNT.noAccept++; continue; } const x = secNY(accIso), fs0 = filingSession(D, x), f = fs0.f; if (f >= T) continue;
  const S = series(e.i), why = priceFail(S, f, DV[e.i * T + f]) || (reverseSplitNear(SPLITS.get(e.sym), D[f]) ? 'reverse split' : null) || (dilutedAt(DIL.get(e.cik), f, sessOf) ? 'dilution filing' : null);
  if (why) { COUNT.filters[why] = (COUNT.filters[why] || 0) + 1; continue; }
  if (!s.m) { COUNT.noCounterparty++; continue; } if (!s.u) { COUNT.noUsd++; continue; }
  const sh = await sharesOn(e, D[f]); if (!sh) { COUNT.noShares++; continue; } const cap = sh.n * CA[e.i * T + f], size = s.u[0] / cap;
  const ev = { ...e, f, phase: fs0.phase, accepted: x.d + ' ' + x.hm, cp: (MC.companies[s.m[0]] || {}).name || s.m[1], cpCik: s.m[0], alias: s.m[1], sentence: s.m[2], doc: s.m[3], usd: s.u[0], usdText: s.u[1], cap, size, shSrc: sh.src };
  ALLCASES.push(ev); if (size < TH.sizeMin) { COUNT.small++; continue; } COUNT.events++; EVENTS.push(ev); }
fs.writeFileSync(SC + '/mvshares.json', JSON.stringify(shareCache));
EVENTS.sort((a, b) => a.f - b.f || a.i - b.i);
STATUS.dataOk = STATUS.price.ok && STATUS.efts.ok && STATUS.master.ok && STATUS.tickerMap.ok && STATUS.docs.ok && STATUS.megacaps.ok;
const COUNTS = { older: EVENTS.filter(z => halfOf(D[z.f]) === 'older' && z.f + 1 < T).length, newer: EVENTS.filter(z => halfOf(D[z.f]) === 'newer' && z.f + 1 < T).length };
log('funnel ' + JSON.stringify(COUNT) + ' | CASE COUNTS (before one-open): older ' + COUNTS.older + ', newer ' + COUNTS.newer);

// ================= 9. TRADES AND THE ONE-SHOT =================
const liqMemo = new Map(), liqList = (t) => { if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const uMemo = new Map(), uList = (t) => { if (!uMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (inU(i, t)) a.push(i); uMemo.set(t, a); if (uMemo.size > 50) uMemo.delete(uMemo.keys().next().value); } return uMemo.get(t); };
const avgOver = (list, k, x) => { const v = []; for (const i of list) { if (artifactIn(i, k - 1, x)) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } return v.length >= 50 ? mean(v) : null; };
function tradesOf(evs, end = T - 1) { const out = [], busy = new Map(), spans = new Map(); let artifacts = 0, noYard = 0, noOpen = 0;
  for (const z of evs) { const k = z.f + 1; if (k > end) continue; if ((busy.get(z.i) ?? -1) >= k) continue; const S = series(z.i), ex = exitOf(S, k, end + 1); if (!ex) { noOpen++; continue; } if (ex.open) continue;
    if (artifactIn(z.i, z.f - 22, ex.x)) { artifacts++; continue; } const e = OA[z.i * T + k], g = ex.px / e - 1, lc = Math.max(k, ex.lastClose), c = avgOver(uList(z.f), k, lc); if (c === null) { noYard++; continue; }
    busy.set(z.i, ex.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([k, ex.x]);
    const k0 = firstOpenSession(z.f, z.phase), ex0 = k0 <= end ? exitOf(S, k0, end + 1) : null;
    out.push({ t: z.f, s: z.sym, i: z.i, k, x: ex.x, lc, kind: ex.kind, days: Math.max(1, ex.held), g: capG(g), g0: g, gs: capG(slipped(e, ex.px)), c, liq: avgOver(liqList(z.f), k, lc), spy: spyRet(k, lc), half: halfOf(D[z.f]),
      first: ex0 && !ex0.open ? capG(ex0.px / OA[z.i * T + k0] - 1) : null, react: CA[z.i * T + z.f] / CA[z.i * T + z.f - 1] - 1, ev: z }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.lc - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 30, to: end, len, step: 5, busy: spans.get(z.i) || [], mode: 'capBoth', okAt: (u) => inU(z.i, u - 1) && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  out.artifacts = artifacts; out.noYard = noYard; out.noOpen = noOpen; return out; }
const RES = {}, need = FROZEN[ID] ? [] : [ID]; let TR = null;
if (need.length || env.HISTORY) {
  if (!STATUS.dataOk) { RES[ID] = { verdict: 'NOT RUN', why: 'data not complete this run: ' + JSON.stringify({ efts: STATUS.efts.ok, master: STATUS.master.ok, tickerMap: STATUS.tickerMap.ok, docs: STATUS.docs, megacaps: STATUS.megacaps.ok }).slice(0, 400) }; log('- ' + ID + ': NOT RUN (data)'); }
  else { const tr = TR = tradesOf(EVENTS), B = TH.block, R = { older: halfStat(tr.filter(z => z.half === 'older'), B), newer: halfStat(tr.filter(z => z.half === 'newer'), B), all: halfStat(tr, B) };
    const slipH = Object.fromEntries(['older', 'newer', 'all'].map(h => { const a = tr.filter(z => h === 'all' || z.half === h); return [h, { n: a.length, avg: r4(mean(a.map(z => z.gs - COST))) }]; }));
    const liqH = Object.fromEntries(['older', 'newer', 'all'].map(h => { const a = tr.filter(z => (h === 'all' || z.half === h) && ok(z.liq)); return [h, { n: a.length, edge: r4(mean(a.map(z => z.g - z.liq))) }]; }));
    const firstH = Object.fromEntries(['older', 'newer', 'all'].map(h => { const a = tr.filter(z => (h === 'all' || z.half === h) && ok(z.first)); return [h, { n: a.length, avg: r4(mean(a.map(z => z.first - COST))), avgSlip: r4(mean(a.map(z => (1 + z.first) * (1 - SLIP) / (1 + SLIP) - 1 - COST))) }]; }));
    const PY = Object.fromEntries(['older', 'newer'].map(h => { const a = tr.filter(z => z.half === h); return [h, { rule: r4(perYear(a)), spy: r4(perYear(a.filter(z => ok(z.spy)).map(z => ({ g: z.spy, days: z.days })), 'g', 0)), avgStock: r4(perYear(a.map(z => ({ g: z.c, days: z.days })), 'g', 0)) }]; }));
    const extra = []; for (const h of ['older', 'newer']) if (!(slipH[h].avg > 0)) extra.push('loses with 2% slippage each way in the ' + h + ' half (' + pc(slipH[h].avg) + ')');
    const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] }, extra });
    RES[ID] = { ...v, name: RULES[ID].name, kind: 'buy', family: RULES[ID].family, hold: TH.hold, block: B, caseCounts: COUNTS, results: R, slippage: slipH, perYear: PY, liquidYardstick: { note: 'information: edge vs the average liquid stock (5 USD+, 5M USD+ a day)', ...liqH },
      firstOpen: { note: 'information: buy the first open after the filing was public (f for a filing outside market hours, f+1 otherwise), same exit; NOT the rule', ...firstH }, shape: shapeOf(tr), artifactsLeftOut: tr.artifacts, noYardstick: tr.noYard, noEntryOpen: tr.noOpen,
      funnel: COUNT, split: SPLIT, cost: COST, yardstick: 'average 1-10 USD stock (20-day traded value >= 0.5M USD) on the same sessions; capBoth (AUD-1)' };
    const f = (h) => (h.n || 0) + ' (' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock;
    log('- ' + ID + ': ' + RES[ID].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | slippage ' + pc(slipH.older.avg) + ' / ' + pc(slipH.newer.avg) + ' | ' + RES[ID].why.slice(0, 300)); } }
// ================= 9b. SIDE (reviewer addendum; reporting + exploratory side tests; firstRun untouched) =================
if (MODE === 'SIDE') { const tr = tradesOf(EVENTS), H = ['older', 'newer', 'all'], inH = (z, h) => h === 'all' || z.half === h;
  const stat = (a) => ({ n: a.length, avg: r4(mean(a.map(z => z.g - COST))), stress: r4(mean(a.map(z => z.g - 0.012))), slip: r4(mean(a.map(z => z.gs - COST))), edge1to10: r4(mean(a.map(z => z.g - z.c))), win: a.length ? r4(a.filter(z => z.g - COST > 0).length / a.length) : null });
  // H1 (ii) size-matched no-deal stocks: 1-10 universe on f, traded value 0.5x-2x, no alias-matched 8-K in f-10..f
  const dealAt = new Map(); for (const h of HITS.values()) { const sym = symFor(h.cik, h.tickers, h.d); if (!sym) continue; const i = SY.get(sym); (dealAt.get(i) || dealAt.set(i, []).get(i)).push(sessOf(h.d)); }
  for (const z of tr) { const dv0 = DV[z.i * T + z.t], v = []; for (const j of uList(z.t)) { if (j === z.i) continue; const r = DV[j * T + z.t] / dv0; if (!(r >= SIDE.dvLo && r <= SIDE.dvHi)) continue;
      if ((dealAt.get(j) || []).some(q => q >= z.t - 10 && q <= z.t)) continue; if (artifactIn(j, z.k - 1, z.lc)) continue; const g = ret(j, z.k, z.lc); if (g !== null && isFinite(g)) v.push(capG(g)); }
    z.cm = v.length >= SIDE.ctlMin ? mean(v) : null; z.ps = pathStats(series(z.i), z.k); }
  const h1 = Object.fromEntries(H.map(h => { const a = tr.filter(z => inH(z, h)), m = a.filter(z => ok(z.cm)), mv = a.filter(z => Math.abs(z.react) >= SIDE.noMove), nm = a.filter(z => Math.abs(z.react) < SIDE.noMove), fo = a.filter(z => ok(z.first));
    return [h, { base: stat(a), sizeMatched: { n: m.length, edge: r4(mean(m.map(z => z.g - z.cm))), controlAvg: r4(mean(m.map(z => z.cm - COST))) }, dealsThatMoved: stat(mv), dealsWithNoMove: stat(nm),
      firstOpenBeforeReaction: { n: fo.length, avg: r4(mean(fo.map(z => z.first - COST))), avgSlip: r4(mean(fo.map(z => (1 + z.first) * 0.98 / 1.02 - 1 - COST))) } }]; }));
  const h3 = Object.fromEntries(H.map(h => { const a = tr.filter(z => inH(z, h) && z.ps); const m = (k) => r4(mean(a.map(z => z.ps[k]).filter(ok))), md = (k) => { const v = a.map(z => z.ps[k]).filter(ok).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : null; };
    return [h, { n: a.length, avgD1: m('d1'), avgD3: m('d3'), avgD5: m('d5'), avgD10: m('d10'), avgMFE: m('mfe'), medMFE: md('mfe'), avgMAE: m('mae'), medMAE: md('mae'), stopped: a.filter(z => z.kind === 'stop').length, gone: a.filter(z => z.kind === 'gone').length, note: 'gross from the entry open; costs and slippage in H1 base (avg / stress / slip)' }]; }));
  // SIDE-FIRST: earlier 8-K 1.01 by the same filer naming the same mega-cap since 2020
  const PRIOR = J(SC + '/prior.json', {});
  for (const z of tr) { const e = z.ev, key = e.adsh, cik = e.cpCik; if (key in PRIOR) { z.prior = PRIOR[key]; continue; } let found = 0, okAll = true;
    for (const al of (MC.companies[cik] || {}).aliases || []) { const hs = await efts(al, SIDE.firstFrom, addDays(e.d, -1), '&forms=8-K&ciks=' + String(e.cik).padStart(10, '0')); if (!hs) { okAll = false; continue; }
      for (const h of hs) { if (found || !h[1] || h[1] === e.adsh || !(h[4] || []).some(it => String(it).trim() === '1.01')) continue; const txt = await sec(subUrl(e.cik, h[1]), 'text'); if (!txt) continue;
        const p = parseSubmission(txt); if (p.docs.some(dc => { const m = counterpartyMatch(dc.text, [{ cik, aliases: (MC.companies[cik] || {}).aliases || [] }]); return !!m; })) found = 1; } if (found) break; }
    z.prior = PRIOR[key] = okAll || found ? found : null; }
  W(SC + '/prior.json', PRIOR);
  // SIDE-INSIDER: squad 1's Form 4 purchase cache (read only)
  const BUY = new Map(); let insQ = 0; for (const f of (() => { try { return fs.readdirSync((env.SQ1_CACHE || 'squad1-cache') + '/insider2'); } catch (e) { return []; } })()) { const x = J((env.SQ1_CACHE || 'squad1-cache') + '/insider2/' + f, null); if (!x) continue; insQ++;
    for (const r of x.rows || []) { const c = String(+r[6]); (BUY.get(c) || BUY.set(c, []).get(c)).push([r[1], r[2]]); } }
  for (const z of tr) z.ins = insQ ? insiderCluster(BUY.get(z.ev.cik), z.t, sessOf) : null;
  const sideOf = (f) => Object.fromEntries(['older', 'newer', 'all'].map(h => [h, stat(tr.filter(z => inH(z, h) && f(z)))]));
  const sides = { [SIDE.first]: { note: 'EXPLORATORY: base trades whose filer had no earlier 8-K 1.01 naming the same mega-cap since 2020', unknown: tr.filter(z => z.prior === null).length, kept: sideOf(z => z.prior === 0), dropped: sideOf(z => z.prior === 1) },
    [SIDE.insider]: { note: 'EXPLORATORY: base trades with 2+ different insiders buying (Form 4 code P) in the 10 sessions before the filing session', insiderQuarters: insQ, kept: sideOf(z => z.ins >= SIDE.insMin), dropped: sideOf(z => z.ins !== null && z.ins < SIDE.insMin) } };
  const rows = tr.map(z => ({ sym: z.s, filingSession: D[z.t], buy: D[z.k], counterparty: z.ev.cp, size: r4(z.ev.size), reaction: r4(z.react), net: r4(z.g - COST), slip: r4(z.gs - COST), avg1to10: r4(z.c - COST), sizeMatched: r4(ok(z.cm) ? z.cm - COST : null), firstOpen: r4(ok(z.first) ? z.first - COST : null), ...z.ps, exit: z.kind, priorDealSame: z.prior, insiders10: z.ins }));
  W('data/squad24-side.json', { generatedAt: new Date().toISOString(), note: 'Reviewer addendum (27 Oct 2026): REPORTING ONLY. SQ24-MEGADEAL entry/exit/verdict unchanged (data/squad24-lab.json firstRun). Side tests are exploratory, each alone against the base, never stacked, never a verdict. No option data used.', caseCounts: COUNTS, H1: h1, H3: h3, sideTests: sides, trades: rows }, true);
  await runCases(); log('SIDE done: ' + tr.length + ' base trades; ' + JSON.stringify(h1.all.base)); process.exit(0); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), (r) => r && r.verdict && r.verdict !== 'NOT RUN');
// every case, traded or not (the owner's list): trades with results; filtered-in events that were not traded say why; size-failures listed apart
const tradeBy = new Map((TR || []).map(z => [z.ev.adsh, z]));
const caseRow = (z) => { const t = tradeBy.get(z.adsh); return { sym: z.sym, cik: z.cik, adsh: z.adsh, accepted: z.accepted, phase: z.phase, filingSession: D[z.f], counterparty: z.cp, alias: z.alias, doc: z.doc, usd: z.usd, marketCap: Math.round(z.cap), size: r4(z.size), shares: z.shSrc,
  closeF: r4(CA[z.i * T + z.f]), reactionDay: r4(CA[z.i * T + z.f] / CA[z.i * T + z.f - 1] - 1), sentence: (z.sentence || '').slice(0, 300), usdText: (z.usdText || '').slice(0, 220),
  trade: t ? { buy: D[t.k], sell: D[t.x], exit: t.kind, held: t.days, net: r4(t.g - COST), netSlip: r4(t.gs - COST), avg1to10: r4(t.c - COST), sameStock: r4(ok(t.own) ? t.own - COST : null), spy: r4(t.spy), firstOpenNet: r4(ok(t.first) ? t.first - COST : null) } : null }; };
const caseList = EVENTS.map(caseRow), belowSize = ALLCASES.filter(z => z.size < TH.sizeMin).sort((a, b) => b.size - a.size).slice(0, 150).map(z => ({ sym: z.sym, filingSession: D[z.f], counterparty: z.cp, usd: z.usd, size: r4(z.size), reactionDay: r4(CA[z.i * T + z.f] / CA[z.i * T + z.f - 1] - 1) }));

// ================= 10. PAPER LANE (from PAPER_START) =================
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigIds = new Set(lines.filter(x => x.type === 'signal').map(x => x.id)), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), newLines = [], lastT = T - 1;
if (STATUS.efts.ok && STATUS.docs.ok) for (const z of EVENTS) { if (D[z.f] < PAPER_START) continue; const id = ID + '|' + z.sym + '|' + D[z.f]; if (sigIds.has(id)) continue; const late = z.f + 1 <= lastT;
  const line = { type: 'signal', id, m: ID, sym: z.sym, d: D[z.f], adsh: z.adsh, counterparty: z.cp, usd: z.usd, size: r4(z.size), close: r4(CA[z.i * T + z.f]), halal: halal(z.sym), hold: TH.hold, entryDate: late ? D[z.f + 1] : nextSession(D[lastT]), late, recordedAfter: D[lastT],
    plan: (late ? 'LATE (seen after the entry session; recorded for the board only); ' : '') + 'buy at the open of ' + (late ? D[z.f + 1] : nextSession(D[lastT])) + ' (that session only); stop 25% under the entry; sell at the close of the 10th session' };
  sigIds.add(id); newLines.push(line); lines.push(line); }
for (const x of lines.filter(x => x.type === 'signal')) { const i = SY.get(x.sym), k = tOf.get(x.entryDate); if (i === undefined || k === undefined) { x._state = 'waiting'; continue; } const ex = exitOf(series(i), k, T); if (!ex) { x._state = 'void'; continue; }
  if (ex.open) { x._state = 'open'; x._mark = ex.mark; continue; } const lc = Math.max(k, ex.lastClose), g = ex.px / OA[i * T + k] - 1, c = avgOver(uList(tOf.get(x.d) ?? k - 1), k, lc); x._state = 'closed'; x._g = g; x._c = c;
  if (!resolved.has(x.id)) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: ID, sym: x.sym, d: x.d, buy: D[k], sell: D[ex.x], exit: ex.kind, held: ex.held, g: r4(g), net: r4(capG(g) - COST), avg1to10: c === null ? null : r4(c - COST), spy: r4(spyRet(k, lc)) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
const mine = lines.filter(x => x.type === 'signal'), closed = mine.filter(x => x._state === 'closed').map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c }));
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: PAPER_START, note: 'PAPER ONLY. SQ24-MEGADEAL is a buy only if its frozen 5-year verdict meets the TRY SMALL standard (data/squad24-lab.json firstRun). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.',
  methods: { [ID]: { name: RULES[ID].name, hold: TH.hold, tier: firstRun[ID] ? firstRun[ID].verdict : null, newSignals: mine.filter(x => x.recordedAfter === D[lastT] && !x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, counterparty: x.counterparty, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, sinceBuy: r4(x._mark ?? NaN) })) } } }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: PAPER_START, cost: COST, methods: { [ID]: { name: RULES[ID].name, hold: TH.hold, signals: mine.length, open: mine.filter(x => x._state === 'open').length, waiting: mine.filter(x => x._state === 'waiting').length, closed: boardStats(closed), frozen: firstRun[ID] ? { verdict: firstRun[ID].verdict, frozenAt: firstRun[ID].frozenAt } : null } } }, null, 1));

// ================= 11. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), squad: 24, philosophy: 'a small company (1-10 USD) states a deal worth >= 20% of its market value with a top-100 US-listed company in an 8-K 1.01; bought the open after the reaction session, held 10 sessions',
  preRegistered: 'squad24-core.mjs header (27 Oct 2026, before any run) + data/strategy-library.json ' + ID + '; frozen list ' + MCF + ' sha256 ' + MEGACAP_SHA, window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS, caseCounts: COUNTS, funnel: COUNT,
  standard: 'both halves (filing session before / from ' + SPLIT + '): > 0 after 0.8% and 1.2%, > 0 with 2% slippage each way, better than the average 1-10 USD stock over the same sessions, better than the same stock on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks of 10 sessions, block t >= ' + TIER2_T + ', return per year above SPY -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN. +300% cap on every gross return (AUD-1).',
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }), cases: caseList, belowSizeTop150: belowSize };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null), e = LB && LB.strategies.find(x => x.id === ID), r = firstRun[ID];
  if (e && r && r.results && !e.result) { const R = r.results; e.status = 'tested: ' + r.verdict.toLowerCase() + '; forward paper lane from ' + PAPER_START; e.tested = String(r.window[1]); e.study = 'squad24-lab.mjs -> data/squad24-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg ?? null, R.newer.avg ?? null], stress: [R.older.avgStress ?? null, R.newer.avgStress ?? null], slippage: [r.slippage.older.avg, r.slippage.newer.avg], edge: [R.older.edge ?? null, R.newer.edge ?? null],
      vsOwn: [R.older.vsOwn ?? null, R.newer.vsOwn ?? null], noTop2: [R.older.noTop2 ?? null, R.newer.noTop2 ?? null], tBlock: [R.older.tBlock ?? null, R.newer.tBlock ?? null], perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], why: r.why };
    fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } } catch (e) { console.log('squad24-lab: library not updated: ' + e.message); }
if (SECFAILS.length) log('SEC requests ' + secReq + ', failed ' + secFail + ': ' + SECFAILS.slice(0, 3).join(' | '));
console.log('SQUAD 24 LAB ' + D[0] + ' to ' + D[T - 1] + ' | cases older ' + COUNTS.older + ' newer ' + COUNTS.newer + ' | ' + Object.entries(firstRun).map(([k, r]) => k + ' ' + r.verdict).join(', ') + ' | ' + ['price', 'efts', 'master', 'tickerMap', 'docs', 'megacaps'].map(k => k + (STATUS[k] && STATUS[k].ok ? ' ok' : ' MISSING')).join(', '));
