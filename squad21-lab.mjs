// SQUAD 21 LAB (25 Oct 2026): two rules from the owner's outside reviewer (squad21-core.mjs header = the exact pre-registered rules).
// Research + FORWARD PAPER lanes; never places an order; no Telegram.
// 1. DATA (GitHub Actions only; keys only from secrets, never printed; official sources, no scraping):
//    prices  = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY: open / high / low / close /
//              volume, dead stocks included, the under-3-USD rows too) + the sessions since (Massive grouped daily) + splits since.
//    8-K     = SEC EDGAR full-text search (efts.sec.gov, squad 1's pipeline) per phrase and month: "Material Definitive Agreement" (items 1.01)
//              and "Unregistered Sales of Equity Securities" (items 3.02); the main 8-K document of each candidate is read once.
//    filings = SEC EDGAR quarterly master index (Forms 424B5 and S-1 by CIK).
//    identity= the filing's CIK; its point-in-time ticker from the SEC Form 3/4/5 data sets (squad 4's cache RESTORED READ ONLY, else
//              downloaded here); then the search's tickers; then today's list. Share counts: data/shares.json.gz by CIK (30 days late).
//    revenue = study-cache/fund.json.gz (quality.mjs SEC frames; materiality information only). SIC (V15 lane) = SEC submissions by CIK.
// 2. 5-YEAR ONE-SHOT for SQ21-CONTRACT10D if not yet frozen (first complete verdict frozen in data/squad21-lab.json firstRun).
// 3. PAPER LANES: SQ21-CONTRACT10D from 26 Oct 2026; V15-REF / V15-NO35 formations from 27 Oct 2026 (data/squad21-paper.jsonl,
//    data/squad21-today.json, data/squad21-board.json).
// DIAG=1: data coverage, event and candidate counts, a sample of text matches; no returns, no verdict, nothing written in data/ but the diag.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { ownAverage, nextSession } from './anomaly-core.mjs';
import { cikFromSpans, artifactJumps, hasArtifact } from './squad4-core.mjs';
import { RULES, TEST_IDS, TH, COST, SPLIT, PAPER_START, V15_START, V15_FROZEN_AT, V15_HOLD, V15_BLOCK, NOT_TESTED, mean, r4, halfOf, capG, addDays, firstOnOrAfter, eftsHits, mainDoc, hasItem,
  contractMatch, html2text, dollarValue, dealType, signalSession, sharesUp, dilutedAt, exitOf, vol20, deciles, perMonth, perYear, byYear, shapeOf, boardStats, sic35, v15Key, v15Split, preRegister } from './squad21-core.mjs';
const env = process.env, DIAG = !!env.DIAG, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov', EFTS = local(env.EFTS_BASE) || 'https://efts.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ21_CACHE || 'squad21-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = 'data/squad21-lab.json', PAPER = 'data/squad21-paper.jsonl', TODAY = 'data/squad21-today.json', BOARD = 'data/squad21-board.json', LIB = 'data/strategy-library.json';
const START = env.PAPER_START || PAPER_START, ID = 'SQ21-CONTRACT10D';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ21_MINUTES || 280) * 60e3, left = () => BUDGET - (Date.now() - t0);
const redact = (s) => String(s).replace(/(apiKey|token)=[^&\s]+/gi, '$1=***');
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};
log('squad 21 lab' + (DIAG ? ' (DIAG: coverage only, no returns)' : '') + '; frozen already: ' + Object.keys(FROZEN).join(', '));

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' squad 21 entries written now'); }

// ================= 1. PRICES (squad 11 pattern, highs and lows, under-3-USD rows kept) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad21-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (/^[A-Z]{1,5}$/.test(s) && !SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const CA = new Float32Array(N).fill(NaN), OA = new Float32Array(N).fill(NaN), HA = new Float32Array(N).fill(NaN), LA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
let withHL = 0, rowsAll = 0;
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; HA[k] = x.h ? x.h[j] : NaN; LA[k] = x.l ? x.l[j] : NaN; MAIN[k] = 1; rowsAll++; if (x.h && x.l && x.h[j] > 0) withHL++; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o ? x.x.o[j] : NaN; VA[k] = x.x.v ? x.x.v[j] : NaN; HA[k] = x.x.h ? x.x.h[j] : NaN; LA[k] = x.x.l ? x.x.l[j] : NaN; } });
store = null;
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; HA[q] /= r; LA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'); if (spyI === undefined) { console.log('squad21-lab: SPY missing; nothing done'); process.exit(0); }
const ser = (A, i) => A.subarray(i * T, i * T + T), series = (i) => ({ o: ser(OA, i), h: ser(HA, i), l: ser(LA, i), c: ser(CA, i), v: ser(VA, i) });
// the average liquid stock (close 5+, 5M USD+ a day on the main rows; the system's yardstick) and the rule universe (close 2+, 2M USD+, all rows)
const LIQ = new Uint8Array(N), DV2 = new Float32Array(N).fill(NaN);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0, s2 = 0, n2 = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN, w2 = CA[b + t] * VA[b + t]; if (isFinite(v)) { s += v; n++; } if (isFinite(w2)) { s2 += w2; n2++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN, z = CA[k] * VA[k]; if (isFinite(w)) { s -= w; n--; } if (isFinite(z)) { s2 -= z; n2--; } }
    if (t >= 19 && n === 20 && CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; if (t >= 19 && n2 === 20) DV2[b + t] = s2 / 20; } }
const liqMemo = new Map(), liqList = (t) => { if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const inU2 = (i, t) => t >= 0 && t < T && i !== spyI && CA[i * T + t] >= TH.minClose && DV2[i * T + t] >= TH.minDv;
const closeAt = (i, x, k) => { for (let q = Math.min(x, T - 1); q >= k; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1 || x < k) return null; const e = OA[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const JUMPS = new Map(), jumpsOf = (i) => { if (!JUMPS.has(i)) JUMPS.set(i, artifactJumps(ser(CA, i))); return JUMPS.get(i); };
const artifactIn = (i, a, b) => hasArtifact(jumpsOf(i), a, b);
const cMemo = new Map(); const ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; if (artifactIn(i, k - 1, x)) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
const spyRet = (k, x) => { const e = OA[spyI * T + k], y = closeAt(spyI, x, k); return e > 0 && y > 0 ? y / e - 1 : null; };
STATUS.price = { ok: T >= 1000 && withHL >= rowsAll * 0.9, sessions: T, from: D[0], to: D[T - 1], stocks: NS, rowsWithHighLow: r4(withHL / Math.max(1, rowsAll)) };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks), rows with high/low ' + pc(withHL / Math.max(1, rowsAll)));

// ================= 2. SEC SOURCES =================
let lastSec = 0, secReq = 0, secFail = 0; const SECFAILS = [];
async function sec(url, kind = 'json') { for (let a = 0; a < 4; a++) { const w = (local(env.SEC_BASE) || local(env.EFTS_BASE) ? 0 : 125) - (Date.now() - lastSec); if (w > 0) await sleep(w); lastSec = Date.now(); secReq++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(60000) }); if (r.status === 404 || r.status === 410) return kind === 'text' ? '' : null;
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; } if (!r.ok) { secFail++; if (SECFAILS.length < 20) SECFAILS.push('HTTP ' + r.status + ' ' + url.slice(0, 200)); return undefined; }
      return kind === 'json' ? await r.json() : await r.text(); } catch (e) { await sleep(1000 * (a + 1)); } }
  secFail++; if (SECFAILS.length < 20) SECFAILS.push('gave up ' + url.slice(0, 200)); return undefined; }
function download(url, file) { try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : (/^\d{4}-\d\d-\d\d/.test(String(s || '')) ? String(s).slice(0, 10) : null); };
const months = (from) => { const out = [], now = new Date(); for (let y = +from.slice(0, 4), m = +from.slice(5, 7); y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1); m === 12 ? (y++, m = 1) : m++) out.push(y + '-' + String(m).padStart(2, '0')); return out; };
const monthEnd = (m) => iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)), slug = (p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// ---- 2a. point-in-time ticker map (SEC Form 3/4/5 SUBMISSION tables: issuer ticker + issuer CIK on each filing date) ----
const CIKMAP = new Map(); { const qs = [], now = new Date(); for (let y = 2021; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, q * 3, 1)) < now) qs.push(y + 'q' + q);
  const parseMap = (zip) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, 'SUBMISSION.tsv'], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const L = txt.split(/\r?\n/), H = L[0].split('\t'), ix = (k) => H.indexOf(k);
    const a = ix('FILING_DATE'), c = ix('ISSUERCIK'), s = ix('ISSUERTRADINGSYMBOL'); if (a < 0 || c < 0 || s < 0) return null; const map = new Map();
    for (const l of L.slice(1)) { if (!l) continue; const r = l.split('\t'), d = isoD(r[a]), cik = String(+r[c] || ''), sym = String(r[s] || '').toUpperCase().trim().replace(/-/g, '.'); if (!d || !cik || !/^[A-Z][A-Z0-9.]{0,6}$/.test(sym) || sym === 'NONE' || sym === 'NA') continue;
      const k = sym + '|' + cik, o = map.get(k); if (!o) map.set(k, [sym, cik, d, d, 1]); else { if (d < o[2]) o[2] = d; if (d > o[3]) o[3] = d; o[4]++; } } return { map: [...map.values()] }; };
  const fail = []; let got = 0, from4 = 0;
  for (const q of qs) { let x = JZ(SC4 + '/f345/' + q + '.json.gz', null); if (x) from4++; if (!x) x = JZ(SC + '/f345/' + q + '.json.gz', null);
    if (!x && !local(env.SEC_BASE) && left() > 150 * 60e3) { for (const p of ['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/']) { const zip = SC + '/f345.zip'; if (!download(SEC + p + q + '_form345.zip', zip)) continue;
      const r = parseMap(zip); try { fs.unlinkSync(zip); } catch (e) {} if (r) { x = r; WZ(SC + '/f345/' + q + '.json.gz', x); got++; break; } } }
    if (!x) { fail.push(q); continue; } for (const [sym, cik, f, l, n] of x.map) (CIKMAP.get(cik) || CIKMAP.set(cik, []).get(cik)).push([sym, f, l, n]); }
  STATUS.tickerMap = { ok: qs.slice(0, -1).every(q => !fail.includes(q)), quarters: qs.length, fromSquad4Cache: from4, downloadedNow: got, missing: fail, ciks: CIKMAP.size };
  log('ticker map: ' + JSON.stringify(STATUS.tickerMap)); }
const SH = JZ('data/shares.json.gz', { t: {}, c: {} }), SECCIK = J('data/sec-ciks.json', {});
const todayCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(+a); const y = SECCIK[s]; return y ? String(+y[0]) : null; };
const TODAYSYMS = new Map(); for (const s of SYMS) { const c = todayCik(s); if (c) (TODAYSYMS.get(c) || TODAYSYMS.set(c, []).get(c)).push(s); }
const hasPx = (i, t) => { for (let q = Math.max(0, t - 5); q <= Math.min(T - 1, t + 5); q++) if (CA[i * T + q] > 0) return true; return false; };
// the stock behind a filing (CIK, date d): the Form 3/4/5 ticker of that CIK whose span covers d (+-400 days, most filings first), then the
// search's tickers, then today's list; each only with prices near d
const symFor = (cik, tickers, d) => { const t = Math.min(firstOnOrAfter(D, d), T - 1), c = String(+cik), sp = (CIKMAP.get(c) || []).filter(s => d >= addDays(s[1], -400) && d <= addDays(s[2], 400)).sort((a, b) => b[3] - a[3]);
  for (const s of [...sp.map(x => x[0]), ...(tickers || []), ...(TODAYSYMS.get(c) || [])]) { const i = SY.get(s); if (i !== undefined && hasPx(i, t)) return s; } return null; };

// ---- 2b. EDGAR full-text search (squad 1's pipeline), cached per phrase and month ----
async function efts(phrase, a, b) { const hits = []; for (let from = 0; from < 10000; from += 100) {
    const j = await sec(EFTS + '/LATEST/search-index?q=' + encodeURIComponent('"' + phrase + '"') + '&forms=8-K&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from);
    if (!j || !j.hits) return null; const tot = (j.hits.total && j.hits.total.value) || 0;
    if (from === 0 && tot >= 9900 && a < b) { const mid = iso((Date.parse(a) + Date.parse(b)) / 2), x = await efts(phrase, a, mid), y = await efts(phrase, addDays(mid, 1), b); return x && y ? x.concat(y) : null; }
    const h = eftsHits(j); hits.push(...h); if (h.length < 100 || from + 100 >= tot) break; } return hits; }
const FROM8K = '2021-08', FT = { complete: true, monthsFetched: 0, missing: [] };
async function phraseHits(phrase, keep) { const out = [];
  for (const m of months(FROM8K)) { const f = SC + '/efts/' + slug(phrase) + '/' + m + '.json', had = J(f, null), recent = m >= iso(Date.now() - 10 * 864e5).slice(0, 7);
    if (had && !recent) { out.push(...had); continue; } if (left() < 60 * 60e3) { if (had) out.push(...had); else { FT.complete = false; FT.missing.push(phrase + ' ' + m); } continue; }
    let h = await efts(phrase, m + '-01', monthEnd(m)); FT.monthsFetched++; if (!h) { await sleep(20000); h = await efts(phrase, m + '-01', monthEnd(m)); }
    if (!h) { if (had) out.push(...had); else { FT.complete = false; FT.missing.push(phrase + ' ' + m); } continue; } h = h.filter(keep); W(f, h); out.push(...h); }
  return out; }
const H101 = await phraseHits('Material Definitive Agreement', (h) => hasItem(h, '1.01')), H302 = await phraseHits('Unregistered Sales of Equity Securities', (h) => hasItem(h, '3.02'));
STATUS.efts = { ok: FT.complete, monthsFetchedNow: FT.monthsFetched, missing: FT.missing.slice(0, 20), item101Hits: H101.length, item302Hits: H302.length };
log('full-text search: ' + H101.length + ' item-1.01 hits, ' + H302.length + ' item-3.02 hits, ' + FT.monthsFetched + ' phrase-months fetched now' + (FT.complete ? '' : ', INCOMPLETE ' + FT.missing.length));

// ---- 2c. EDGAR quarterly master index: Forms 424B5 and S-1 by CIK ----
const DIL = new Map(), addDil = (cik, d) => { const c = String(+cik); (DIL.get(c) || DIL.set(c, []).get(c)).push(d); };
{ const qs = [], now = new Date(); for (let y = 2021; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) { const s = new Date(Date.UTC(y, (q - 1) * 3, 1)); if (s <= now && (y > 2021 || q >= 3)) qs.push([y, q]); }
  const fail = []; let got = 0, rows = 0;
  for (const [y, q] of qs) { const key = y + 'q' + q, cf = SC + '/master/' + key + '.json', cur = Date.now() < Date.UTC(y, q * 3, 1) + 5 * 864e5; let x = cur ? null : J(cf, null);
    if (!x) { const gz = SC + '/master.gz'; if (download(SEC + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.gz', gz)) { let txt = null; try { txt = zlib.gunzipSync(fs.readFileSync(gz)).toString('latin1'); } catch (e) {} try { fs.unlinkSync(gz); } catch (e) {}
        if (txt) { x = []; for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length !== 5 || !/^\d+$/.test(p[0].trim())) continue; const form = p[2].trim(); if (form === '424B5' || form === 'S-1') x.push([String(+p[0]), form, p[3].trim()]); }
          if (x.length > 100) { W(cf, x); got++; } else x = null; } } }
    if (!x) { fail.push(key); continue; } for (const [c, , d] of x) { addDil(c, d); rows++; } }
  STATUS.master = { ok: !fail.length, quarters: qs.length, downloadedNow: got, missing: fail, rows };
  log('master index: ' + rows + ' Form 424B5 / S-1 filings' + (fail.length ? ', MISSING ' + fail.join(' ') : '')); }
for (const h of H302) { if (h[2] && h[3]) addDil(h[2], h[3]); }
for (const a of DIL.values()) a.sort();

// ================= 3. EVENTS AND SIGNALS =================
const sessOf = (d) => firstOnOrAfter(D, d);
// all item-1.01 8-Ks (any matching document) by stock: their filing sessions (the same-volatility yardstick leaves these stocks out)
const FRESH = new Map(); { for (const h of H101) { const sym = symFor(h[2], h[7], h[3]); if (!sym) continue; const i = SY.get(sym), f = sessOf(h[3]); (FRESH.get(i) || FRESH.set(i, new Set()).get(i)).add(f); } }
const freshAt = (i, t) => { const s = FRESH.get(i); if (!s) return false; for (let q = t - TH.ctlFresh; q <= t; q++) if (s.has(q)) return true; return false; };
// one event per filing (the main 8-K document)
const EVENTS = []; { const seen = new Set(); let noSym = 0;
  for (const h of H101) { if (!mainDoc(h) || !h[1] || seen.has(h[1])) continue; seen.add(h[1]); const sym = symFor(h[2], h[7], h[3]); if (!sym) { noSym++; continue; }
    EVENTS.push({ adsh: h[1], file: String(h[0]).split(':')[1], cik: String(+h[2]), d: h[3], sym, i: SY.get(sym), f: sessOf(h[3]) }); }
  STATUS.events = { filings: seen.size, withStock: EVENTS.length, noStockWithPrices: noSym }; log('item-1.01 8-K filings: ' + seen.size + ' (main document), ' + EVENTS.length + ' tied to a stock with prices, ' + noSym + ' not'); }
// the non-text conditions (price, supply, dilution) -> signal session or -1
let shareMiss = 0; const sharesKnownOf = (cik) => SH.c[cik] || null;
for (const e of EVENTS) { if (e.f >= T) { e.t = -1; continue; } const S = series(e.i), sh = sharesKnownOf(e.cik); if (!sh) shareMiss++;
  e.t = signalSession(S, e.f, (t) => DV2[e.i * T + t], { sharesUp: (t) => sh ? sharesUp(sh, D[t]) : null, diluted: (t) => dilutedAt(DIL.get(e.cik), t, sessOf) }); }
const CAND = EVENTS.filter(e => e.t >= 0);
log('price / supply / dilution conditions met by ' + CAND.length + ' filings (' + shareMiss + ' filings without a share count series)');
// the text test on the main document (cached by accession: [ok, phrase, counterparty, usd, sentence])
const DOCS = J(SC + '/docs.json', {}); { let read = 0, miss = 0;
  for (const e of CAND) { if (e.adsh in DOCS) continue; if (left() < 40 * 60e3) { miss++; continue; }
    const html = await sec(SEC + '/Archives/edgar/data/' + e.cik + '/' + e.adsh.replace(/-/g, '') + '/' + e.file, 'text'); if (html === undefined) { miss++; continue; }
    const m = contractMatch(html2text(String(html).slice(0, 1500000))); DOCS[e.adsh] = m ? [1, m.phrase, m.counterparty.slice(0, 120), dollarValue(m.sentence), m.sentence.slice(0, 400)] : [0];
    read++; if (read % 300 === 0) { W(SC + '/docs.json', DOCS); log('documents read: ' + read); } }
  W(SC + '/docs.json', DOCS); STATUS.docs = { ok: FT.complete && miss <= CAND.length * 0.01, candidates: CAND.length, readNow: read, notRead: miss, named: CAND.filter(e => DOCS[e.adsh] && DOCS[e.adsh][0] === 1).length };
  log('documents: ' + CAND.length + ' candidates (' + read + ' read now, ' + miss + ' not read), ' + STATUS.docs.named + ' with a named counterparty'); }
const SIGS = CAND.filter(e => DOCS[e.adsh] && DOCS[e.adsh][0] === 1).map(e => { const x = DOCS[e.adsh]; return { ...e, k: e.t + 1, stop: LA[e.i * T + e.t], phrase: x[1], cp: x[2], usd: x[3], deal: dealType(x[2], x[4]) }; }).sort((a, b) => a.t - b.t || a.i - b.i);
STATUS.dataOk = STATUS.price.ok && STATUS.efts.ok && STATUS.master.ok && STATUS.tickerMap.ok && STATUS.docs.ok;
if (SECFAILS.length) log('SEC requests: ' + secReq + ', failed ' + secFail + ': ' + SECFAILS.slice(0, 3).map(redact).join(' | '));
const COUNTS = { older: SIGS.filter(z => z.k < T && halfOf(D[z.t]) === 'older').length, newer: SIGS.filter(z => z.k < T && halfOf(D[z.t]) === 'newer').length };
log('signals (before one-open): older ' + COUNTS.older + ', newer ' + COUNTS.newer + '; phrases ' + JSON.stringify(SIGS.reduce((a, z) => (a[z.phrase] = (a[z.phrase] || 0) + 1, a), {})));
if (DIAG) { const samp = SIGS.filter((z, j) => j % Math.max(1, Math.floor(SIGS.length / 40)) === 0).slice(0, 40).map(z => ({ sym: z.sym, filed: z.d, sig: D[z.t], phrase: z.phrase, counterparty: z.cp, usd: z.usd, sentence: (DOCS[z.adsh][4] || '').slice(0, 240) }));
  const rej = CAND.filter(e => DOCS[e.adsh] && DOCS[e.adsh][0] === 0).slice(0, 15).map(e => ({ sym: e.sym, filed: e.d, adsh: e.adsh }));
  W('data/squad21-diag.json', { generatedAt: new Date().toISOString(), note: 'DIAG: data coverage, signal counts and a sample of text matches only; no returns computed, no verdict', window: [D[0], D[T - 1]], data: STATUS, signals: COUNTS, sample: samp, noMatchSample: rej });
  console.log('SQUAD 21 DIAG ' + D[0] + ' to ' + D[T - 1] + ' | ' + Object.entries(STATUS).filter(([, s]) => s && typeof s === 'object').map(([k, s]) => k + (s.ok === false ? ' MISSING' : ' ok')).join(', ')); process.exit(0); }

// ================= 4. TRADES AND THE 5-YEAR ONE-SHOT =================
// the same-volatility yardstick: rule-universe stocks in the trade's volatility decile on t, without a fresh item-1.01 8-K, same sessions
const decMemo = new Map(); const decAt = (t) => { if (decMemo.has(t)) return decMemo.get(t); const rows = []; for (let i = 0; i < NS; i++) { if (!inU2(i, t)) continue; const v = vol20(ser(CA, i), t); if (v !== null) rows.push({ key: i, v }); }
  const m = deciles(rows), by = Array.from({ length: TH.deciles }, () => []); for (const [i, q] of m) by[q].push(i); const o = { m, by }; decMemo.set(t, o); if (decMemo.size > 400) decMemo.delete(decMemo.keys().next().value); return o; };
const sameVol = (i, t, k, x) => { const o = decAt(t), q = o.m.get(i); if (q === undefined) return null; const v = [];
  for (const j of o.by[q]) { if (j === i || freshAt(j, t) || artifactIn(j, k - 1, x)) continue; const g = ret(j, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } return v.length >= TH.ctlMin ? mean(v) : null; };
function tradesOf(sigs, end = T - 1) { const out = [], busy = new Map(), spans = new Map(); let artifacts = 0, noYard = 0;
  for (const z of sigs) { if (z.k > end) continue; if ((busy.get(z.i) ?? -1) >= z.k) continue; const S = series(z.i), ex = exitOf(S, z.k, z.stop, end + 1); if (!ex || ex.open) continue;
    if (artifactIn(z.i, z.t - 29, ex.x)) { artifacts++; continue; } const e = OA[z.i * T + z.k], g = ex.px / e - 1, lc = Math.max(z.k, ex.lastClose), c = ctrlSpan(z.k, lc); if (c === null) { noYard++; continue; }
    busy.set(z.i, ex.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, ex.x]);
    out.push({ t: z.t, s: z.sym, i: z.i, k: z.k, x: ex.x, lc, kind: ex.kind, days: Math.max(1, ex.held), g: capG(g), g0: g, c, c2: sameVol(z.i, z.t, z.k, lc), spy: spyRet(z.k, lc), half: halfOf(D[z.t]), d: z.d, cik: z.cik, cp: z.cp, phrase: z.phrase, usd: z.usd, deal: z.deal }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.lc - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 30, to: end, len, step: 10, busy: spans.get(z.i) || [], mode: 'capBoth', okAt: (u) => inU2(z.i, u - 1) && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  out.artifacts = artifacts; out.noYard = noYard; return out; }
const RES = {}, need = TEST_IDS.filter(id => !FROZEN[id]);
let TR = null;
for (const id of TEST_IDS) { if (!need.includes(id) && !env.HISTORY) continue;
  if (!STATUS.dataOk) { RES[id] = { verdict: 'NOT RUN', why: 'data not complete this run: ' + JSON.stringify({ efts: STATUS.efts, master: STATUS.master, tickerMap: STATUS.tickerMap.ok, docs: STATUS.docs, price: STATUS.price.ok }).slice(0, 500) }; log('- ' + id + ': NOT RUN (data)'); continue; }
  const tr = TR = tradesOf(SIGS), B = TH.block, R = { older: halfStat(tr.filter(z => z.half === 'older'), B), newer: halfStat(tr.filter(z => z.half === 'newer'), B), all: halfStat(tr, B) };
  const R2 = Object.fromEntries(['older', 'newer', 'all'].map(h => [h, halfStat(tr.filter(z => (h === 'all' || z.half === h) && ok(z.c2)).map(z => ({ ...z, c: z.c2 })), B)]));
  const PY = Object.fromEntries(['older', 'newer'].map(h => { const a = tr.filter(z => z.half === h); return [h, { rule: r4(perYear(a)), spy: r4(perYear(a.filter(z => ok(z.spy)).map(z => ({ g: z.spy, days: z.days })), 'g', 0)), avgStock: r4(perYear(a.map(z => ({ g: z.c, days: z.days })), 'g', 0)) }]; }));
  const extra = []; for (const h of ['older', 'newer']) if (!(R2[h].edge > 0)) extra.push('not better than same-volatility stocks without a fresh 8-K 1.01 in the ' + h + ' half (' + pc(R2[h].edge) + ', ' + (R2[h].n || 0) + ' trades with that yardstick)');
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] }, extra });
  const first = D[Math.max(0, SIGS.length ? SIGS[0].t : 0)], lastFull = (() => { const m = D[T - 1].slice(0, 7); const mm = +m.slice(5, 7), yy = +m.slice(0, 4); return mm === 1 ? (yy - 1) + '-12' : yy + '-' + String(mm - 1).padStart(2, '0'); })();
  const pm = perMonth(tr.map(z => D[z.t]), D[30].slice(0, 7), lastFull), pmSig = perMonth(SIGS.filter(z => z.k < T).map(z => D[z.t]), D[30].slice(0, 7), lastFull);
  // materiality (information only): one reliable dollar value vs the latest yearly revenue public on t (quality.mjs fund cache, 100-day lag)
  const F = JZ(env.FUND_CACHE || 'study-cache/fund.json.gz', { v: {} }), knownY = (d) => { const y = +d.slice(0, 4); return d.slice(5) >= '04-10' ? y - 1 : y - 2; };
  const revOf = (cik, d) => { const c = F.v && F.v[cik]; if (!c) return null; for (let y = knownY(d); y >= knownY(d) - 1; y--) { const a = c[y]; if (a && (a.rev > 0 || a.rev2 > 0)) return a.rev > 0 ? a.rev : a.rev2; } return null; };
  for (const z of tr) { const rv = z.usd ? revOf(z.cik, D[z.t]) : null; z.mat = z.usd && rv ? z.usd / rv : null; }
  const sub = (f) => Object.fromEntries(['older', 'newer'].map(h => { const a = tr.filter(z => z.half === h && f(z)); const s = halfStat(a, B); return [h, { n: s.n || 0, avg: s.avg ?? null, avgStress: s.avgStress ?? null, edge: s.edge ?? null, noTop2: s.noTop2 ?? null, tBlock: s.tBlock ?? null }]; }));
  const materiality = { note: 'INFORMATION ONLY, not part of the rule (reviewer\'s 10%-of-revenue condition): trades whose matched sentence names exactly one dollar amount (100k USD+, no per-share / per-unit price), divided by the latest yearly revenue public on the signal day (SEC frames via quality.mjs, 100 days after the year end).',
    withValue: tr.filter(z => z.usd).length, withValueAndRevenue: tr.filter(z => ok(z.mat)).length, material10: sub(z => ok(z.mat) && z.mat >= TH.material), under10: sub(z => ok(z.mat) && z.mat < TH.material), noValue: sub(z => !ok(z.mat)) };
  RES[id] = { ...v, name: RULES[id].name, kind: 'buy', family: RULES[id].family, hold: TH.maxHold, block: B, results: R, sameVolatility: { note: 'the reviewer\'s yardstick (an extra gate): same 20-day volatility decile on the signal day, no item-1.01 8-K in sessions t-10..t, the same buy and sell sessions', older: R2.older, newer: R2.newer, all: R2.all },
    perYear: PY, signalsPerMonth: { trades: { mean: pm.mean, median: pm.median, min: pm.min, max: pm.max, zeroMonths: pm.zeroMonths, months: pm.months }, signalsBeforeOneOpen: { mean: pmSig.mean, median: pmSig.median, min: pmSig.min, max: pmSig.max, zeroMonths: pmSig.zeroMonths }, byMonth: pm.byMonth },
    materiality, dealTypes: { note: 'INFORMATION ONLY, not part of the rule (squad21-core dealType: financing / corporate = lender, bank or fund counterparty, or a credit / underwriting / merger / voting / cooperation / purchase agreement in the sentence; else commercial)', commercial: sub(z => z.deal === 'commercial'), financing: sub(z => z.deal !== 'commercial') },
    calendarYears: byYear(tr, z => D[z.t].slice(0, 4)), shape: shapeOf(tr), artifactsLeftOut: tr.artifacts, noYardstick: tr.noYard, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1: trades and every yardstick capped at +300% alike)',
    trades: tr.map(z => ({ s: z.s, filed: z.d, sig: D[z.t], buy: D[z.k], sell: D[z.x], exit: z.kind, held: z.days, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameVol: r4(ok(z.c2) ? z.c2 - COST : null), sameStock: r4(ok(z.own) ? z.own - COST : null), spy: r4(z.spy), counterparty: z.cp, phrase: z.phrase, deal: z.deal, usd: z.usd, mat: r4(z.mat) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | same-vol edge ' + pc(R2.older.edge) + ' / ' + pc(R2.newer.edge) + ' | per year ' + pc(PY.older.rule) + ' vs SPY ' + pc(PY.older.spy) + ' / ' + pc(PY.newer.rule) + ' vs ' + pc(PY.newer.spy) + ' | per month ' + pm.mean + ' | ' + RES[id].why.slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);
// V15-NO35: FORWARD ONLY, never backtested; frozenAt fixed before its first formation so the comeback board counts every forward row
if (!firstRun['V15-NO35']) firstRun['V15-NO35'] = { verdict: 'FORWARD ONLY (not backtested)', kind: 'forward-only', name: RULES['V15-NO35'].name, hold: V15_HOLD, block: V15_BLOCK, frozenAt: V15_FROZEN_AT, at: new Date().toISOString(),
  why: 'the SIC 35/36/38 exclusion was chosen from V15\'s own older-half results, so a historical test cannot validate it; judged only on its forward paper record (from ' + V15_START + ') by the comeback board' };

// ================= 5. PAPER LANES =================
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), sigIds = new Set(sigLines.map(x => x.id)), newLines = [], lastT = T - 1;
// ---- 5a. SQ21-CONTRACT10D: signals from the paper start ----
const fromT = D.findIndex(d => d >= START);
// one open trade per stock: a stock is busy while an earlier paper trade of this rule is waiting / open, or exits on or after the new entry
const busyNow = (x) => { if (x.late || resolved.has(x.id)) return false; const i = SY.get(x.sym), k = x.entryDate ? tOf.get(x.entryDate) : undefined; if (i === undefined || k === undefined || k >= T) return true;
  const ex = exitOf(series(i), k, x.stop, T); return !!ex && (ex.open || ex.x >= T); };
if (fromT >= 0 && STATUS.efts.ok && STATUS.docs.ok) { const openStock = new Set(sigLines.filter(x => x.m === ID && busyNow(x)).map(x => x.sym));
  for (const z of SIGS) { if (z.t < fromT) continue; const id = ID + '|' + z.sym + '|' + D[z.t]; if (sigIds.has(id) || openStock.has(z.sym)) continue; const late = z.k <= lastT;
    const line = { type: 'signal', id, m: ID, sym: z.sym, d: D[z.t], filed: z.d, adsh: z.adsh, counterparty: z.cp, phrase: z.phrase, usd: z.usd, close: r4(CA[z.i * T + z.t]), stop: r4(z.stop), halal: halal(z.sym), hold: TH.maxHold,
      entryDate: late ? null : nextSession(D[lastT]), late, recordedAfter: D[lastT],
      plan: (late ? 'LATE (data arrived after the entry session): not a paper trade; ' : 'buy at the open of ' + nextSession(D[lastT]) + ' (that session only); ') + 'stop ' + r4(z.stop) + ' (the signal-day low); sell at the next open after a close below the 10-day average; at most 120 sessions' };
    sigIds.add(id); if (!late) openStock.add(z.sym); newLines.push(line); sigLines.push(line); } }
// ---- 5b. V15-REF / V15-NO35 formations from 27 Oct 2026 ----
const SICS = J(SC + '/sic.json', {});
async function sicOf(sym) { const cik = todayCik(sym); if (!cik) return { cik: null, sic: null, ok: true }; if (cik in SICS) return { cik, sic: SICS[cik], ok: true };
  const j = await sec(SECD + '/submissions/CIK' + cik.padStart(10, '0') + '.json'); if (j === undefined) return { cik, sic: null, ok: false }; SICS[cik] = j && j.sic ? String(j.sic) : null; return { cik, sic: SICS[cik], ok: true }; }
{ const done = new Set(lines.filter(x => x.type === 'formation').map(x => x.key)), key = v15Key(D[lastT], done), Q = J('data/quality.json', null);
  if (key) { const freshQ = Q && Array.isArray(Q.fscoreUpToday) && Date.now() - Date.parse(Q.generatedAt || 0) < 10 * 864e5;
    if (!freshQ) log('V15 formation ' + key + ' postponed: data/quality.json is missing or older than 10 days');
    else { const sic = {}, cik = {}; let bad = false; for (const p of Q.fscoreUpToday) { if (!p || !p.sym) continue; const r = await sicOf(p.sym); if (!r.ok) { bad = true; break; } sic[p.sym] = r.sic; cik[p.sym] = r.cik; }
      W(SC + '/sic.json', SICS);
      if (bad) log('V15 formation ' + key + ' postponed: the SEC submissions file did not answer');
      else { const sp = v15Split(Q.fscoreUpToday, (s) => sic[s]), d = D[lastT];
        newLines.push({ type: 'formation', key, d, quality: { generatedAt: Q.generatedAt, to: Q.to }, ref: sp.ref, no35: sp.no35, sic, cik, note: 'V15 live picks (data/quality.json fscoreUpToday); NO35 = SEC SIC not 35xx / 36xx / 38xx' });
        for (const [m, list] of [['V15-REF', sp.ref], ['V15-NO35', sp.no35]]) for (const s of list) { const id = m + '|' + s + '|' + d; if (sigIds.has(id)) continue; const i = SY.get(s);
          const line = { type: 'signal', id, m, sym: s, d, formation: key, sic: sic[s], close: i !== undefined ? r4(CA[i * T + lastT]) : null, halal: halal(s), hold: V15_HOLD, entryDate: nextSession(d), late: false, recordedAfter: d,
            plan: 'buy at the open of ' + nextSession(d) + ', sell at the close of the ' + V15_HOLD + 'th session (V15\'s 6-month hold)' + (m === 'V15-REF' ? '; REFERENCE ONLY (V15 unchanged, already live as LONGER HOLDS)' : '; FORWARD-ONLY test of the SIC 35/36/38 exclusion') };
          sigIds.add(id); newLines.push(line); sigLines.push(line); }
        log('V15 formation ' + key + ' on ' + d + ': ' + sp.ref.length + ' picks, ' + sp.no35.length + ' without SIC 35/36/38'); } } } }
// ---- 5c. resolve every signal line on the data so far ----
for (const x of sigLines) { const i = SY.get(x.sym), k = x.entryDate ? tOf.get(x.entryDate) : undefined; if (x.late) { x._state = 'late'; continue; } if (i === undefined || k === undefined || k >= T) { x._state = 'waiting'; continue; }
  let g = null, xi = null, lc = null, kind = null, held = null;
  if (x.m === ID) { const ex = exitOf(series(i), k, x.stop, T); if (!ex) { x._state = 'void'; continue; } if (ex.open) { x._state = 'open'; x._k = k; x._mark = ex.mark; continue; }
    g = ex.px / OA[i * T + k] - 1; xi = ex.x; lc = Math.max(k, ex.lastClose); kind = ex.kind; held = Math.max(1, ex.held); }
  else { xi = k + x.hold - 1; if (xi > T - 1) { x._state = 'open'; x._k = k; x._mark = ret(i, k, T - 1); continue; } g = ret(i, k, xi); lc = xi; kind = 'hold'; held = x.hold; }
  const c = ctrlSpan(k, lc); x._state = 'closed'; x._g = g; x._c = c; x._k = k; x._spy = spyRet(k, lc); x._days = held;
  if (!resolved.has(x.id) && g !== null) { resolved.add(x.id); const sv = x.m === ID ? sameVol(i, tOf.get(x.d) ?? k - 1, k, lc) : null;
    newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[xi], exit: kind, held, g: r4(g), net: r4(capG(g) - COST), avgStock: c === null ? null : r4(c - COST), sameVol: sv === null ? null : r4(sv - COST), spy: r4(x._spy) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
const board = {}, today = {};
for (const m of [ID, 'V15-NO35', 'V15-REF']) { const mine = sigLines.filter(x => x.m === m), closed = mine.filter(x => x._state === 'closed' && x._g !== null).map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c, spy: x._spy, days: x._days, halal: x.halal })), st = boardStats(closed), fr = firstRun[m];
  board[m] = { name: m === 'V15-REF' ? 'V15 unchanged (reference only, side by side with V15-NO35)' : RULES[m].name, kind: m === ID ? 'buy' : m === 'V15-NO35' ? 'forward-only' : 'reference', hold: m === ID ? TH.maxHold : V15_HOLD,
    signals: mine.length, waiting: mine.filter(x => x._state === 'waiting').length, open: mine.filter(x => x._state === 'open').length, late: mine.filter(x => x._state === 'late').length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')),
    frozen: fr ? { verdict: fr.verdict, frozenAt: fr.frozenAt || null } : null };
  if (m === 'V15-REF') continue;
  today[m] = { name: RULES[m].name, hold: m === ID ? TH.maxHold : V15_HOLD, tier: fr ? fr.verdict : null,
    newSignals: mine.filter(x => x.recordedAfter === D[lastT] && !x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, stop: x.stop ?? null, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, buy: D[x._k], sinceBuy: r4(x._mark ?? NaN) })) }; }
const formations = [...lines, ...newLines].filter(x => x.type === 'formation').map(x => ({ key: x.key, d: x.d, ref: x.ref.length, no35: x.no35.length, left: x.ref.filter(s => !x.no35.includes(s)) }));
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, v15Start: V15_START, note: 'PAPER ONLY. Squad 21 (outside reviewer rules). SQ21-CONTRACT10D is a buy only if its frozen 5-year verdict meets the TRY SMALL standard (data/squad21-lab.json firstRun). V15-NO35 is FORWARD ONLY (never backtested): it is judged by the comeback board on its own forward record. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, v15Start: V15_START, cost: COST, sideBySide: 'V15-REF (every V15 live pick) vs V15-NO35 (without SEC SIC 35/36/38), same formation days, buy next open, hold 126 sessions', formations, methods: board }, null, 1));
log('paper: ' + newLines.filter(x => x.type === 'signal').length + ' new signal lines, ' + newLines.filter(x => x.type === 'result').length + ' new results; formations ' + formations.length);

// ================= 6. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), squad: 21, philosophy: 'two outside-reviewer rules: a fresh named-counterparty contract 8-K on a quiet clean base (tested once), and V15 without SIC 35/36/38 (forward only)',
  preRegistered: 'squad21-core.mjs header (25 Oct 2026, before any run) + data/strategy-library.json SQ21-CONTRACT10D / V15-NO35 / ' + NOT_TESTED.id, window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS, signalCounts: COUNTS,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2%, better than the average liquid stock over the same sessions, better than the same stock on its other days, better than same-volatility stocks without a fresh 8-K 1.01, > 0 without its 2 best, 20+ trades and 3+ blocks of 21 sessions, block t >= ' + TIER2_T + ', return per year of capital above SPY -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN. Every gross return capped at +300% (AUD-1).',
  notTested: NOT_TESTED, firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-600)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false; const e = LB && LB.strategies.find(x => x.id === ID), r = firstRun[ID];
  if (e && r && r.results && !e.result) { const R = r.results; e.status = 'tested: ' + r.verdict.toLowerCase() + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'squad21-lab.mjs -> data/squad21-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], sameVolEdge: [r.sameVolatility.older.edge, r.sameVolatility.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock],
      perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], signalsPerMonth: r.signalsPerMonth.trades.mean, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad21-lab: library not updated: ' + e.message); }
console.log('SQUAD 21 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | ' + Object.entries(firstRun).map(([k, r]) => k + ' ' + r.verdict).join(', ') + ' | ' + ['price', 'efts', 'master', 'tickerMap', 'docs'].map(k => k + (STATUS[k] && STATUS[k].ok ? ' ok' : ' MISSING')).join(', '));
