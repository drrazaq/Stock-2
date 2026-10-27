// SQUAD 29 LAB (27 Oct 2026): RED-FLAG SEC FILINGS AS SELL WARNINGS (squad29-core.mjs header = the exact pre-registered rules).
// Research + a weekday RECORD-ONLY flag list; never places an order; no Telegram. Never writes data/my-positions.json (read only).
// MODE=lab   (push of run-squad29-now.txt): data, events, the 5-year one-shot per family if not frozen yet (data/squad29-lab.json firstRun),
//            then data/squad29-flags-today.json and the holdings check.
// MODE=today (weekday schedule): refresh the filings of companies that filed (EDGAR daily master index), then flags-today + holdings only.
// MODE=diag  (last line of run-squad29-now.txt = DIAG): data coverage, event counts per family and half, text samples; NO returns, no verdict.
// DATA (GitHub Actions only; keys from secrets, never printed; official sources only):
//   prices  = study-cache/grouped.json.gz (the Sunday job's 5-year whole-market cache incl. dead stocks, RESTORED READ ONLY) + sessions since
//             (Massive grouped daily) + splits since.
//   tickers = SEC Form 3/4/5 data sets (issuer CIK + ticker on each filing date; squad 4's cache RESTORED READ ONLY, else downloaded) +
//             today's SEC list (company_tickers.json, data/shares.json.gz, data/sec-ciks.json).
//   filings = data.sec.gov submissions per CIK (+ older pages back to 2020-09); 8-K / NT 10-K / NT 10-Q / 10-K / 10-Q rows with items,
//             acceptanceDateTime and the primary document. Own cache squad29-cache.
//   going concern = efts.sec.gov full-text search per month, forms 10-K / 10-Q, both phrases. Documents from www.sec.gov/Archives.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { secNY, nyStamp } from './sec-time.mjs';
import { artifactJumps, hasArtifact } from './squad4-core.mjs';
import { FAMILIES, FAM_KEYS, SPLIT, HS, VIEWS, BAR, GAP, OWN_STEP, OWN_MIN, RENAME_SESS, GC_FROM, TODAY_SESS, HOLD_DAYS, candidateFams, isPeriodic, html2text, auditorResigned,
  execDeparture, goingConcernAffirmative, previousPeriodic, entryIdx, dedupe, windowRet, halfStats, decide, preRegister, capG, halfOf, r4, mean, addDays, firstOnOrAfter } from './squad29-core.mjs';
const env = process.env, MODE = env.MODE === 'today' ? 'today' : env.MODE === 'diag' || env.DIAG ? 'diag' : 'lab';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov', EFTS = local(env.EFTS_BASE) || 'https://efts.sec.gov';
const FAST = !!(local(env.SEC_BASE) || local(env.EFTS_BASE));
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ29_CACHE || 'squad29-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = 'data/squad29-lab.json', TODAY = 'data/squad29-flags-today.json', DIAGF = 'data/squad29-diag.json', LIB = 'data/strategy-library.json', POS = 'data/my-positions.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ29_MINUTES || 290) * 60e3, left = () => BUDGET - (Date.now() - t0);
const redact = (s) => String(s).replace(/(apiKey|token)=[^&\s]+/gi, '$1=***');
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, STATUS = {};
log('squad 29 lab, mode ' + MODE + '; frozen already: ' + (Object.keys(FROZEN).join(', ') || 'none'));

// ================= 0. PRE-REGISTRATION (library entries before any computation; idempotent, append only) =================
if (MODE === 'lab') { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' squad 29 entries written now'); }

// ================= 1. PRICES (squad 21 pattern; under-3-USD rows kept) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad29-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none') + (env.MASSIVE_KEY ? '' : ' (no MASSIVE_KEY)'));
const D = Object.keys(store.days).sort(), T = D.length;
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (/^[A-Z]{1,5}$/.test(s) && !SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const CA = new Float32Array(N).fill(NaN), OA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; MAIN[k] = 1; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o ? x.x.o[j] : NaN; VA[k] = x.x.v ? x.x.v[j] : NaN; } });
store = null;
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY');
// per symbol: first / last session with a close; 20-session average traded value on all rows
const FIRST = new Int32Array(NS).fill(-1), LAST = new Int32Array(NS).fill(-1), DV = new Float32Array(N).fill(NaN);
for (let i = 0; i < NS; i++) { const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const z = CA[b + t]; if (z > 0) { if (FIRST[i] < 0) FIRST[i] = t; LAST[i] = t; }
    const w = CA[b + t] * VA[b + t]; if (isFinite(w)) { s += w; n++; } if (t >= 20) { const q = CA[b + t - 20] * VA[b + t - 20]; if (isFinite(q)) { s -= q; n--; } }
    if (t >= 19 && n === 20) DV[b + t] = s / 20; } }
const inView = (v, i, t) => t >= 0 && t < T && i !== spyI && CA[i * T + t] >= VIEWS[v].minClose && DV[i * T + t] >= VIEWS[v].minDv;
const uMemo = { v1: new Map(), v3: new Map() }, uList = (v, t) => { const m = uMemo[v]; if (!m.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (inView(v, i, t)) a.push(i); m.set(t, a); } return m.get(t); };
const hasPx = (i, t) => { for (let q = Math.max(0, t - 5); q <= Math.min(T - 1, t + 5); q++) if (CA[i * T + q] > 0) return true; return false; };
const JUMPS = new Map(), artifactIn = (i, a, b) => { if (!JUMPS.has(i)) JUMPS.set(i, artifactJumps(CA.subarray(i * T, i * T + T))); return hasArtifact(JUMPS.get(i), a, b); };
STATUS.price = { ok: T >= 1000, sessions: T, from: D[0], to: D[T - 1], stocks: NS };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks)');

// ================= 2. SEC ACCESS (one polite queue: <= ~9 requests a second, a few in flight) =================
let nextSlot = 0, secReq = 0, secFail = 0; const SECFAILS = [];
async function slot() { const gap = FAST ? 0 : 115; const now = Date.now(), at = Math.max(now, nextSlot); nextSlot = at + gap; if (at > now) await sleep(at - now); }
async function sec(url, kind = 'json') { for (let a = 0; a < 4; a++) { await slot(); secReq++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(90000) }); if (r.status === 404 || r.status === 410) return kind === 'text' ? '' : null;
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; } if (!r.ok) { secFail++; if (SECFAILS.length < 20) SECFAILS.push('HTTP ' + r.status + ' ' + url.slice(0, 160)); return undefined; }
      return kind === 'json' ? await r.json() : await r.text(); } catch (e) { await sleep(1500 * (a + 1)); } }
  secFail++; if (SECFAILS.length < 20) SECFAILS.push('gave up ' + url.slice(0, 160)); return undefined; }
async function pool(items, n, fn) { let ix = 0; const run = async () => { while (ix < items.length) { const it = items[ix++]; await fn(it); } }; await Promise.all(Array.from({ length: n }, run)); }
function download(url, file) { try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
const MONS = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MONS[m[2]] + '-' + m[1].padStart(2, '0') : (/^\d{4}-\d\d-\d\d/.test(String(s || '')) ? String(s).slice(0, 10) : null); };

// ---- 2a. point-in-time ticker map (SEC Form 3/4/5 SUBMISSION tables), squad 21 pattern ----
const CIKMAP = new Map(), SYMCIK = new Map();
{ const qs = [], now = new Date(); for (let y = 2021; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, q * 3, 1)) < now) qs.push(y + 'q' + q);
  const parseMap = (zip) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, 'SUBMISSION.tsv'], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const L = txt.split(/\r?\n/), H = L[0].split('\t'), ix = (k) => H.indexOf(k);
    const a = ix('FILING_DATE'), c = ix('ISSUERCIK'), s = ix('ISSUERTRADINGSYMBOL'); if (a < 0 || c < 0 || s < 0) return null; const map = new Map();
    for (const l of L.slice(1)) { if (!l) continue; const r = l.split('\t'), d = isoD(r[a]), cik = String(+r[c] || ''), sym = String(r[s] || '').toUpperCase().trim().replace(/-/g, '.'); if (!d || !cik || !/^[A-Z][A-Z0-9.]{0,6}$/.test(sym) || sym === 'NONE' || sym === 'NA') continue;
      const k = sym + '|' + cik, o = map.get(k); if (!o) map.set(k, [sym, cik, d, d, 1]); else { if (d < o[2]) o[2] = d; if (d > o[3]) o[3] = d; o[4]++; } } return { map: [...map.values()] }; };
  const fail = []; let got = 0, from4 = 0;
  for (const q of qs) { let x = JZ(SC4 + '/f345/' + q + '.json.gz', null); if (x) from4++; if (!x) x = JZ(SC + '/f345/' + q + '.json.gz', null);
    if (!x && !FAST && left() > 150 * 60e3) { for (const p of ['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/']) { const zip = SC + '/f345.zip'; if (!download(SEC + p + q + '_form345.zip', zip)) continue;
      const r = parseMap(zip); try { fs.unlinkSync(zip); } catch (e) {} if (r) { x = r; WZ(SC + '/f345/' + q + '.json.gz', x); got++; break; } } }
    if (!x) { fail.push(q); continue; } for (const [sym, cik, f, l, n] of x.map) { (CIKMAP.get(cik) || CIKMAP.set(cik, []).get(cik)).push([sym, f, l, n]); (SYMCIK.get(sym) || SYMCIK.set(sym, []).get(sym)).push([cik, f, l, n]); } }
  STATUS.tickerMap = { ok: qs.slice(0, -1).every(q => !fail.includes(q)), quarters: qs.length, fromSquad4Cache: from4, downloadedNow: got, missing: fail, ciks: CIKMAP.size };
  log('ticker map: ' + JSON.stringify(STATUS.tickerMap)); }
// today's SEC list (company_tickers.json, refreshed once a day in the own cache) + the repo's maps
const TODAYCIK = new Map(); { let ct = J(SC + '/company_tickers.json', null); if (!ct || !ct.at || ct.at < iso(Date.now())) { const j = await sec(SEC + '/files/company_tickers.json'); if (j && typeof j === 'object') { ct = { at: iso(Date.now()), rows: Object.values(j).map(x => [String(x.ticker || '').toUpperCase().replace(/-/g, '.'), String(+x.cik_str)]) }; W(SC + '/company_tickers.json', ct); } }
  for (const [s, c] of (ct && ct.rows) || []) if (s && c && !TODAYCIK.has(s)) TODAYCIK.set(s, c);
  const SH = JZ('data/shares.json.gz', { t: {} }), SECCIK = J('data/sec-ciks.json', {});
  for (const [s, c] of Object.entries(SH.t || {})) if (!TODAYCIK.has(s.replace(/-/g, '.'))) TODAYCIK.set(s.replace(/-/g, '.'), String(+c));
  for (const [s, v] of Object.entries(SECCIK)) if (!TODAYCIK.has(s) && v && v[0]) TODAYCIK.set(s, String(+v[0]));
  STATUS.todayList = { ok: TODAYCIK.size > 5000, tickers: TODAYCIK.size }; }
const TODAYSYMS = new Map(); for (const [s, c] of TODAYCIK) (TODAYSYMS.get(c) || TODAYSYMS.set(c, []).get(c)).push(s);
const symFor = (cik, d) => { const t = Math.min(firstOnOrAfter(D, d), T - 1), c = String(+cik), sp = (CIKMAP.get(c) || []).filter(s => d >= addDays(s[1], -400) && d <= addDays(s[2], 400)).sort((a, b) => b[3] - a[3]);
  for (const s of [...sp.map(x => x[0]), ...(TODAYSYMS.get(c) || [])]) { const i = SY.get(s); if (i !== undefined && hasPx(i, t)) return s; } return null; };
const cikOfSym = (s, d) => { const sp = (SYMCIK.get(s) || []).filter(x => d >= addDays(x[1], -400) && d <= addDays(x[2], 400)).sort((a, b) => b[3] - a[3]); return sp.length ? sp[0][0] : (TODAYCIK.get(s) || null); };
// symbol objects for windowRet, with the rename successor (same CIK, starts trading within 5 sessions after the old ticker's last close)
const SOBJ = new Array(NS); for (let i = 0; i < NS; i++) SOBJ[i] = { px: { o: OA.subarray(i * T, i * T + T), c: CA.subarray(i * T, i * T + T) }, first: FIRST[i], last: LAST[i], next: null };
{ let renames = 0; for (let i = 0; i < NS; i++) { const L = LAST[i]; if (L < 0 || L >= T - 1) continue; const c = cikOfSym(SYMS[i], D[L]); if (!c) continue;
    const cands = new Set([...(CIKMAP.get(c) || []).map(x => x[0]), ...(TODAYSYMS.get(c) || [])]);
    for (const s of cands) { const j = SY.get(s); if (j === undefined || j === i) continue; if (FIRST[j] > L && FIRST[j] <= L + RENAME_SESS) { SOBJ[i].next = SOBJ[j]; renames++; break; } } }
  STATUS.renames = renames; log('ticker renames followed: ' + renames); }

// ================= 3. FILINGS BY COMPANY (submissions; own cache) =================
const POSITIONS = J(POS, {}), HELD = Object.keys(POSITIONS).filter(s => /^[A-Z][A-Z0-9.]{0,6}$/.test(s));
const HELDCIK = new Map(HELD.map(s => [s, TODAYCIK.get(s) || cikOfSym(s, D[T - 1])]));
const WANT = new Set(); { for (let i = 0; i < NS; i++) { if (i === spyI) continue; let ever = -1; for (let t = 19; t < T; t += 5) if (inView('v1', i, t)) { ever = t; break; } if (ever < 0) continue;
    const s = SYMS[i]; for (const x of SYMCIK.get(s) || []) if (x[2] >= addDays(D[0], -400)) WANT.add(x[0]); const c = TODAYCIK.get(s); if (c) WANT.add(c); }
  for (const c of HELDCIK.values()) if (c) WANT.add(c); }
const KEEP = new Set(['8-K', 'NT 10-K', 'NT 10-Q', '10-K', '10-Q']);
const subFile = (c) => SC + '/sub/' + c + '.json.gz';
function compact(cols) { const out = []; if (!cols || !Array.isArray(cols.form)) return out;
  for (let j = 0; j < cols.form.length; j++) { const f = cols.form[j]; if (!KEEP.has(f)) continue; const fd = cols.filingDate[j]; if (fd < GC_FROM) continue; const it = String(cols.items ? cols.items[j] || '' : '');
    if (f === '8-K' && !/\b(3\.01|4\.01|4\.02|5\.02)\b/.test(it)) continue; out.push([f, cols.acceptanceDateTime ? cols.acceptanceDateTime[j] : '', fd, cols.accessionNumber[j], it, cols.primaryDocument ? cols.primaryDocument[j] : '']); }
  return out; }
async function fetchSub(c) { const j = await sec(SECD + '/submissions/CIK' + String(c).padStart(10, '0') + '.json'); if (j === undefined) return false; if (j === null) { WZ(subFile(c), { at: new Date().toISOString(), rows: [], none: true }); return true; }
  let rows = compact(j.filings && j.filings.recent);
  for (const f of (j.filings && j.filings.files) || []) { if (String(f.filingTo || '9999') < GC_FROM) continue; const x = await sec(SECD + '/submissions/' + f.name); if (x === undefined) return false; rows = rows.concat(compact(x)); }
  const seen = new Set(); rows = rows.filter(r => !seen.has(r[3]) && seen.add(r[3])).sort((a, b) => (a[2] + a[1]).localeCompare(b[2] + b[1]));
  WZ(subFile(c), { at: new Date().toISOString(), rows, sic: j.sic || null, name: j.name || null }); return true; }
const SUBS = new Map(); { const miss = [], stale = new Set(); for (const c of WANT) { const x = JZ(subFile(c), null); if (x) SUBS.set(c, x); else miss.push(c); }
  // companies that filed a relevant form in the last 12 calendar days (EDGAR daily master index) and were read before that day: read again
  let idxDays = 0; for (let k = 0; k <= 12; k++) { const d = iso(Date.now() - k * 864e5), wd = new Date(d + 'T12:00:00Z').getUTCDay(); if (wd === 0 || wd === 6) continue; const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1;
    const txt = await sec(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx', 'text'); if (!txt) continue; idxDays++;
    for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length !== 5 || !/^\d+$/.test(p[0].trim()) || !KEEP.has(p[2].trim())) continue; const c = String(+p[0]), x = SUBS.get(c); if (x && x.at.slice(0, 10) <= d) stale.add(c); } }
  const todo = [...miss, ...stale]; let done = 0, failed = 0;
  log('submissions: ' + WANT.size + ' companies wanted, ' + SUBS.size + ' cached, ' + miss.length + ' to read, ' + stale.size + ' to refresh (daily index, ' + idxDays + ' days)');
  await pool(todo, 4, async (c) => { if (left() < 120 * 60e3 && MODE !== 'today') { failed++; return; } if (await fetchSub(c)) { SUBS.set(c, JZ(subFile(c), null)); done++; if (done % 1000 === 0) log('submissions read: ' + done); } else failed++; });
  STATUS.submissions = { ok: SUBS.size >= WANT.size * 0.995 && failed <= WANT.size * 0.005, wanted: WANT.size, have: SUBS.size, readNow: done, failed, refreshDays: idxDays };
  log('submissions: ' + JSON.stringify(STATUS.submissions)); }

// ================= 4. GOING-CONCERN FULL-TEXT SEARCH (both phrases; forms 10-K, 10-Q; per month) =================
const GCQ = '"substantial doubt" "ability to continue as a going concern"';
async function efts(a, b) { const out = []; for (let from = 0; from < 10000; from += 100) {
    const j = await sec(EFTS + '/LATEST/search-index?q=' + encodeURIComponent(GCQ) + '&forms=10-K,10-Q&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from);
    if (!j || !j.hits) return null; const tot = (j.hits.total && j.hits.total.value) || 0;
    if (from === 0 && tot >= 9900 && a < b) { const mid = iso((Date.parse(a) + Date.parse(b)) / 2), x = await efts(a, mid), y = await efts(addDays(mid, 1), b); return x && y ? x.concat(y) : null; }
    const h = (j.hits.hits || []).map(x => { const s = x._source || {}; return [s.adsh || String(x._id || '').split(':')[0], String(+((s.ciks || [])[0] || 0)), s.file_date, String(s.form || (s.root_forms || [])[0] || '')]; });
    out.push(...h); if (h.length < 100 || from + 100 >= tot) break; } return out; }
const GC = new Set(); { const ms = [], now = new Date(); for (let y = +GC_FROM.slice(0, 4), m = +GC_FROM.slice(5, 7); y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1); m === 12 ? (y++, m = 1) : m++) ms.push(y + '-' + String(m).padStart(2, '0'));
  let fetched = 0, hits = 0; const miss = [];
  for (const m of ms) { const f = SC + '/gc/' + m + '.json', had = J(f, null), recent = m >= iso(Date.now() - 12 * 864e5).slice(0, 7); let h = had;
    if (!had || recent) { if (left() > 60 * 60e3 || MODE === 'today') { const end = iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)); let x = await efts(m + '-01', end); if (!x) { await sleep(15000); x = await efts(m + '-01', end); } if (x) { W(f, x); h = x; fetched++; } } }
    if (!h) { miss.push(m); continue; } for (const r of h) if (r[3] === '10-K' || r[3] === '10-Q') { GC.add(r[0]); hits++; } }
  STATUS.goingConcernSearch = { ok: !miss.length, months: ms.length, fetchedNow: fetched, missing: miss, filings: GC.size };
  log('going-concern search: ' + JSON.stringify(STATUS.goingConcernSearch)); }

// ================= 5. EVENTS =================
const lastSess = D[T - 1], todayFrom = D[Math.max(0, T - TODAY_SESS)], holdFrom = addDays(iso(Date.now()), -HOLD_DAYS);
const HELDBYCIK = new Map(); for (const [s, c] of HELDCIK) if (c) HELDBYCIK.set(c, s);
const DOCS = J(SC + '/docs.json', {}), CAND = [];
for (const [c, x] of SUBS) { const rows = (x.rows || []).map(r => ({ form: r[0], acc: r[1], fd: r[2], adsh: r[3], items: r[4], doc: r[5] }));
  for (const r of rows) { let fams = candidateFams(r); if (!fams.length) continue;
    if (fams.includes('P')) { fams = fams.filter(f => f !== 'P'); if (GC.has(r.adsh)) { const p = previousPeriodic(rows, r.adsh); if (p && p.fd >= GC_FROM && !GC.has(p.adsh)) fams.push('F5'); } }
    if (!fams.length) continue; const ny = secNY(r.acc || r.fd), k = entryIdx(D, ny);
    const sym = symFor(c, r.fd), i = sym ? SY.get(sym) : undefined, held = HELDBYCIK.get(c) || null;
    for (const fam of fams) CAND.push({ fam, cik: c, adsh: r.adsh, form: r.form, items: r.items, doc: r.doc, fd: r.fd, acc: r.acc, ny, k, sym, i, held, name: x.name || null }); } }
const relevant = (e) => (e.i !== undefined && e.k >= 21 && e.k <= T - 1 && inView('v1', e.i, e.k - 1)) || (e.ny && e.ny.d >= todayFrom) || (e.held && e.fd >= holdFrom);
const needText = CAND.filter(e => (e.fam === 'F2' || e.fam === 'F3' || e.fam === 'F5') && relevant(e) && !((e.adsh + '|' + e.fam) in DOCS));
log('candidates: ' + CAND.length + ' (' + FAM_KEYS.map(f => f + ' ' + CAND.filter(e => e.fam === f).length).join(', ') + '); documents to read now: ' + needText.length);
{ let read = 0, miss = 0, n = 0; const save = () => W(SC + '/docs.json', DOCS);
  await pool(needText, 5, async (e) => { if (left() < (MODE === 'today' ? 5 : 35) * 60e3) { miss++; return; } if (!e.doc) { DOCS[e.adsh + '|' + e.fam] = [0, 'no primary document']; return; }
    const html = await sec(SEC + '/Archives/edgar/data/' + e.cik + '/' + e.adsh.replace(/-/g, '') + '/' + e.doc, 'text'); if (html === undefined) { miss++; return; }
    const txt = html2text(String(html).slice(0, 12e6)); let m = null;
    if (e.fam === 'F2') m = auditorResigned(txt); else if (e.fam === 'F3') { const x = execDeparture(txt, e.fd); m = x ? { sentence: x.map(z => z.office + ': ' + z.sentence).join(' | ') } : null; } else m = goingConcernAffirmative(txt);
    DOCS[e.adsh + '|' + e.fam] = m ? [1, m.sentence.slice(0, 300)] : [0]; read++; if (++n % 2000 === 0) { save(); log('documents read: ' + read); } });
  save(); STATUS.docs = { ok: miss <= Math.max(5, needText.length * 0.005), toRead: needText.length, readNow: read, notRead: miss }; log('documents: ' + JSON.stringify(STATUS.docs)); }
const passes = (e) => e.fam === 'F1' || e.fam === 'F4' || e.fam === 'F6' || (DOCS[e.adsh + '|' + e.fam] && DOCS[e.adsh + '|' + e.fam][0] === 1);
const FLAGS = CAND.filter(passes);
STATUS.dataOk = STATUS.price.ok && STATUS.tickerMap.ok && STATUS.submissions.ok && STATUS.goingConcernSearch.ok && STATUS.docs.ok && STATUS.todayList.ok;
if (SECFAILS.length) log('SEC requests: ' + secReq + ', failed ' + secFail + ': ' + SECFAILS.slice(0, 3).map(redact).join(' | '));
const famOf = (k) => { const f = FROZEN[FAMILIES[k].id]; return f ? f.verdict : 'NOT JUDGED YET'; };

// ================= 6. THE ONE-SHOT (per family, only if not frozen) =================
const RES = {}, COUNTS = {};
const study = (v) => dedupe(FLAGS.filter(e => e.i !== undefined && e.k >= 21 && e.k <= T - 1 && inView(v, e.i, e.k - 1)));
for (const v of ['v3', 'v1']) { COUNTS[v] = {}; const ev = study(v); for (const f of FAM_KEYS) COUNTS[v][f] = { older: ev.filter(e => e.fam === f && halfOf(e.ny.d) === 'older').length, newer: ev.filter(e => e.fam === f && halfOf(e.ny.d) === 'newer').length }; }
log('events per family (3 USD view, older / newer): ' + FAM_KEYS.map(f => f + ' ' + COUNTS.v3[f].older + '/' + COUNTS.v3[f].newer).join(', '));
if (MODE === 'diag') { const samp = {}; for (const f of ['F2', 'F3', 'F5']) { const ok1 = CAND.filter(e => e.fam === f && DOCS[e.adsh + '|' + f] && DOCS[e.adsh + '|' + f][0] === 1), no = CAND.filter(e => e.fam === f && DOCS[e.adsh + '|' + f] && DOCS[e.adsh + '|' + f][0] === 0);
    samp[f] = { passed: ok1.length, failed: no.length, passSample: ok1.filter((e, j) => j % Math.max(1, Math.floor(ok1.length / 15)) === 0).slice(0, 15).map(e => ({ sym: e.sym, fd: e.fd, adsh: e.adsh, sentence: DOCS[e.adsh + '|' + f][1] })), failSample: no.slice(0, 10).map(e => ({ sym: e.sym, fd: e.fd, adsh: e.adsh })) }; }
  const phase = { before: 0, during: 0, after: 0, dateOnly: 0 }; for (const e of FLAGS) { const h = e.ny && e.ny.hm; if (!h) phase.dateOnly++; else phase[h < '09:30' ? 'before' : h < '16:00' ? 'during' : 'after']++; }
  W(DIAGF, { generatedAt: new Date().toISOString(), note: 'DIAG: data coverage, event counts and text samples only; no returns computed, no verdict', window: [D[0], D[T - 1]], data: STATUS, counts: COUNTS, acceptancePhase: phase, text: samp });
  console.log('SQUAD 29 DIAG ' + Object.entries(STATUS).filter(([, s]) => s && typeof s === 'object').map(([k, s]) => k + (s.ok === false ? ' MISSING' : ' ok')).join(', ')); process.exit(0); }

const need = MODE === 'lab' && STATUS.dataOk ? FAM_KEYS.filter(f => !FROZEN[FAMILIES[f].id]) : [];
if (MODE === 'lab' && !STATUS.dataOk) log('DATA INCOMPLETE: no verdict this run (the caches keep what was read; the next run continues)');
if (need.length) {
  const yMemo = new Map(), yard = (v, k, x) => { const key = v + '|' + k + '|' + x; if (yMemo.has(key)) return yMemo.get(key); const a = [];
    for (const i of uList(v, k - 1)) { if (artifactIn(i, k - 1, x)) continue; const g = windowRet(SOBJ[i], k, x, T); if (g !== null && isFinite(g)) a.push(capG(g)); } const m = a.length >= 50 ? mean(a) : null; yMemo.set(key, m); return m; };
  const allByStock = new Map(); for (const e of FLAGS) if (e.i !== undefined && e.k >= 0) (allByStock.get(e.i) || allByStock.set(e.i, []).get(e.i)).push(e.k);
  const oMemo = new Map(), own = (v, i, H) => { const key = v + '|' + i + '|' + H; if (oMemo.has(key)) return oMemo.get(key); const busy = allByStock.get(i) || [], a = [];
    for (let u = 21; u + H - 1 <= T - 1; u += OWN_STEP) { const x = u + H - 1; if (busy.some(b => u <= b + H && x >= b - H)) continue; if (!inView(v, i, u - 1) || artifactIn(i, u - 1, x)) continue; const g = windowRet(SOBJ[i], u, x, T); if (g !== null && isFinite(g)) a.push(capG(g)); }
    const m = a.length >= OWN_MIN ? mean(a) : null; oMemo.set(key, m); return m; };
  for (const v of ['v3', 'v1']) { const ev = study(v);
    for (const f of need) { const R = {}, excluded = { artifact: 0, noReturn: 0, noYardstick: 0 }, sample = [];
      for (const H of HS) { R[H] = {}; const rows = { older: [], newer: [] };
        for (const e of ev) { if (e.fam !== f) continue; const x = e.k + H - 1; if (x > T - 1) continue; if (artifactIn(e.i, e.k - 1, x)) { if (H === 60) excluded.artifact++; continue; }
          const g = windowRet(SOBJ[e.i], e.k, x, T); if (g === null || !isFinite(g)) { if (H === 60) excluded.noReturn++; continue; } const y = yard(v, e.k, x); if (y === null) { if (H === 60) excluded.noYardstick++; continue; }
          rows[halfOf(e.ny.d)].push({ k: e.k, g: capG(g), y, own: own(v, e.i, H) });
          if (v === 'v3' && H === 20 && sample.length < 400) sample.push([e.sym, e.ny.d, D[e.k], r4(capG(g)), r4(y)]); }
        for (const h of ['older', 'newer']) R[H][h] = halfStats(rows[h], H); }
      RES[v] = RES[v] || {}; RES[v][f] = { results: R, excluded, sample20: sample }; log(v + ' ' + f + ': ' + HS.map(H => H + 's ' + pc(R[H].older.excess) + ' (t ' + R[H].older.blockT + ', n ' + R[H].older.n + ') / ' + pc(R[H].newer.excess) + ' (t ' + R[H].newer.blockT + ', n ' + R[H].newer.n + ')').join('; ')); } }
}
const nowIso = new Date().toISOString();
const judged = Object.fromEntries(need.filter(f => RES.v3 && RES.v3[f]).map(f => { const d = decide(RES.v3[f].results);
  return [FAMILIES[f].id, { flag: f, name: FAMILIES[f].name, at: nowIso, window: [D[0], D[T - 1]], bar: BAR, verdict: d.verdict, horizons: d.horizons, why: d.why, results: RES.v3[f].results, excluded: RES.v3[f].excluded,
    view1usd: RES.v1 && RES.v1[f] ? { note: 'information only (close 1+ USD, 2M USD+ a day); the verdict is the 3 USD view', results: RES.v1[f].results, excluded: RES.v1[f].excluded, decisionIfUsed: decide(RES.v1[f].results).verdict } : null,
    sample20: RES.v3[f].sample20 }]; }));
const firstRun = freezeEach(FROZEN, judged, () => STATUS.dataOk);
for (const [id, r] of Object.entries(judged)) if (!FROZEN[id]) log('FROZEN ' + id + ': ' + r.verdict + ' (' + r.why + ')');
const verdictOf = (f) => { const r = firstRun[FAMILIES[f].id]; return r ? r.verdict : 'NOT JUDGED YET'; };

// ================= 7. FLAGS TODAY + HOLDINGS (record only) =================
const flagRow = (e) => ({ sym: e.sym || null, cik: e.cik, company: e.name, flag: e.fam, id: FAMILIES[e.fam].id, what: FAMILIES[e.fam].name, verdict: verdictOf(e.fam), accepted: nyStamp(e.acc || e.fd), filed: e.fd,
  entrySession: e.k < T ? D[e.k] : 'next session', form: e.form, items: e.items || null, url: SEC + '/Archives/edgar/data/' + e.cik + '/' + e.adsh.replace(/-/g, '') + '/' + (e.doc || ''),
  inUniverse3: e.i !== undefined ? inView('v3', e.i, Math.min(e.k, T) - 1) : false, inUniverse1: e.i !== undefined ? inView('v1', e.i, Math.min(e.k, T) - 1) : false, held: e.held || null,
  text: DOCS[e.adsh + '|' + e.fam] && DOCS[e.adsh + '|' + e.fam][1] || null,
  // label only (added after the frozen run, changes no verdict): an 8-K that also carries 2.01 (completed acquisition) and 5.01 (change in control) is a
  // merger closing; its 3.01 delisting is the cash-out, not a distress notice. The frozen F6 result counts these stops as -100% (see the lab note).
  likelyMergerClose: e.fam === 'F6' && /\b2\.01\b/.test(e.items || '') && /\b5\.01\b/.test(e.items || '') });
const recent = FLAGS.filter(e => e.ny && e.ny.d >= todayFrom && (e.sym || e.held)).sort((a, b) => String(b.acc).localeCompare(String(a.acc))).map(flagRow);
const heldFlags = FLAGS.filter(e => e.held && e.fd >= holdFrom).sort((a, b) => String(b.acc).localeCompare(String(a.acc))).map(flagRow);
const unknownText = CAND.filter(e => e.held && e.fd >= holdFrom && (e.fam === 'F2' || e.fam === 'F3' || e.fam === 'F5') && !((e.adsh + '|' + e.fam) in DOCS)).length;
const HOLDINGS = { checkedAt: nowIso, source: POS + ' (read only)', positions: HELD.map(s => ({ sym: s, cik: HELDCIK.get(s) || null, filingsRead: !!(HELDCIK.get(s) && SUBS.has(HELDCIK.get(s))) })), days: HOLD_DAYS, flags: heldFlags, textNotRead: unknownText };
const verdicts = Object.fromEntries(FAM_KEYS.map(f => [f, { id: FAMILIES[f].id, name: FAMILIES[f].name, verdict: verdictOf(f), action: verdictOf(f) === 'SELL-WARNING' ? 'SELL WARNING for a held stock; BLOCK a new buy' : 'information only' }]));
W(TODAY, { generatedAt: nowIso, note: 'RECORD ONLY (squad 29): official SEC red-flag filings accepted in the last ' + TODAY_SESS + ' sessions on any stock with a ticker. verdict = the frozen squad 29 test of that flag family (SELL-WARNING or INFO). Not wired into SELL / HOLD text yet; no Telegram; never an order.',
  sessions: [todayFrom, lastSess], dataOk: STATUS.dataOk, families: verdicts, flags: recent, holdings: HOLDINGS });
log('flags in the last ' + TODAY_SESS + ' sessions: ' + recent.length + '; held stocks with a flag in ' + HOLD_DAYS + ' days: ' + (heldFlags.map(f => f.sym + ' ' + f.flag + ' ' + f.filed).join(', ') || 'none'));

// ================= 8. OUTPUT =================
const F6CAVEAT = 'Added 27 Oct 2026 after the frozen run (verdicts unchanged): about 30% of F6 (8-K 3.01) events stopped trading within days and were counted -100% as pre-registered, but most are MERGER CLOSINGS (3.01 filed with 2.01 / 3.03 / 5.01: holders were cashed out, not wiped out). In the 400-event sample at 20 sessions, events that kept trading still lagged the average stock by -5.3% (median -4.5%), so a real warning remains, but the frozen -33% / -41% sizes are inflated. flags-today marks likelyMergerClose; the lead should not send a SELL warning for those.';
if (MODE === 'lab' || !fs.existsSync(OUT)) {
  W(OUT, { generatedAt: nowIso, about: 'Squad 29: do official red-flag SEC filings predict that a stock does worse afterwards? Each family judged ONCE (firstRun); SELL-WARNING families warn holders and block new buys; INFO families are information only. Long only; never an order.',
    preRegistered: 'squad29-core.mjs header (27 Oct 2026, before any result) + data/strategy-library.json SQ29-F1..F6', window: [D[0], D[T - 1]], split: SPLIT, horizons: HS, bar: BAR, data: STATUS, eventCounts: COUNTS,
    families: verdicts, firstRun, caveat: F6CAVEAT, latest: latestBlock({ at: nowIso, mode: MODE, eventCounts: COUNTS }), holdings: HOLDINGS });
} else { const prev = J(OUT, {}); prev.caveat = F6CAVEAT; prev.holdings = HOLDINGS; prev.families = verdicts; prev.latest = latestBlock({ at: nowIso, mode: MODE, eventCounts: COUNTS, data: STATUS }); W(OUT, prev); }
if (MODE === 'lab') try { const LB = J(LIB, null); let ch = false;
  for (const f of FAM_KEYS) { const id = FAMILIES[f].id, e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.tested) continue;
    const h = (H, half) => r.results[H] && r.results[H][half] ? pc(r.results[H][half].excess) + ' (t ' + r.results[H][half].blockT + ', n ' + r.results[H][half].n + ')' : 'n/a';
    e.status = r.verdict === 'SELL-WARNING' ? 'risk rule: SELL WARNING (squad 29, frozen ' + r.frozenAt.slice(0, 10) + ')' : 'information only (squad 29, frozen ' + r.frozenAt.slice(0, 10) + '): did not meet the SELL-WARNING bar';
    e.tested = r.frozenAt.slice(0, 10); e.verdict = r.verdict; e.why = r.why;
    e.result = 'vs the average stock, older / newer: 20 sessions ' + h(20, 'older') + ' / ' + h(20, 'newer') + '; 60 sessions ' + h(60, 'older') + ' / ' + h(60, 'newer'); ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad29-lab: library not updated: ' + e.message); }
console.log('SQUAD 29 ' + MODE.toUpperCase() + ' done: ' + FAM_KEYS.map(f => f + ' ' + verdictOf(f)).join(', ') + (STATUS.dataOk ? '' : ' (DATA INCOMPLETE)'));
