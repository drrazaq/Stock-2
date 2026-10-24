// SQUAD 17 LAB: "WHICH HALAL CORE HOLDING: SPUS, THE HALAL TOP 20, OR A MIX?" (24 Oct 2026). Core-holding study: NOT a TRY SMALL lab
// (scan.mjs does not read it). Research + a forward paper record; never places an order; no Telegram. Rules: squad17-core.mjs (SQ17-*,
// pre-registered 24 Oct 2026 before any run; the lab writes the same rule text into data/strategy-library.json before computing anything).
// Builds on Squad 10: its data machinery is COPIED unchanged (whole-market price cache with dead stocks, historical SEC ticker map, company
// facts, share counts, split list incl. implied splits, renamed giants, US domicile, SIC, the Shariah facts) and Squad 10's caches are
// copied into this lab's own cache (squad17-cache) by the workflow. The Shariah list is walked until 100 companies pass (rule 3).
// 1. 5-YEAR ONE-SHOT of every SQ17 rule not yet frozen: account vs SPUS (primary) and SPY per half, worst year, CAGR / |max drawdown|,
//    + the per-period judge; first complete verdict frozen in data/squad17-lab.json firstRun; later runs = monitoring only (latest).
// 2. THE OWNER'S ANSWER (pre-registered in squad17-core.mjs): SPUS alone vs SQ10-SH20-C15 vs SQ17-MIX50 on the same dates.
// 3. TODAY: data/squad17-today.json (each rule's current holdings and weights with the ZAD mark), data/squad17-board.json, paper jsonl.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { fundamentals, cikFromSpans, artifactJumps, hasArtifact } from './squad4-core.mjs';
import { COST, STRESS, SIDE, SIDE_STRESS, SPLIT, PAPER_START, BLOCK, YEAR, CAP, byCap, mom121, simulate, pathStats, monthly, monthStarts, monthEnds, isQuarterMonth,
  boardStats, paperReady, mean, median, halfOf, addDays, periodPieces, usCompany, capAt } from './squad5-core.mjs';
import { SH_TAGS, impliedSplits, balanceAt, shariahPass, avgLast, r4, AVG_MONTHS } from './squad10-core.mjs';
import { RULES, IDS, weightsFor, reviewMonth, periodHold, preRegister, c15, monthEndCloses, trendAt, yearReturns, worstYear, retForDD, bestCore, MOM_POOL } from './squad17-core.mjs';
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ17_CACHE || 'squad17-cache', SC4 = env.SQ4_CACHE || 'squad4-cache', SC5 = env.SQ5_CACHE || 'squad5-cache';
const OUT = env.SQ17_OUT || 'data/squad17-lab.json', PAPER = env.SQ17_PAPER || 'data/squad17-paper.jsonl', TODAY = env.SQ17_TODAY || 'data/squad17-today.json', BOARD = env.SQ17_BOARD || 'data/squad17-board.json', LIB = env.SQ17_LIB || 'data/strategy-library.json';
const START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ17_MINUTES || 100) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ17 entries written now'); }

// ================= 1. PRICES (as squad4-lab) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad17-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (OFFLINE || (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE))) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6 || OFFLINE) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none'));
const D = Object.keys(store.days).sort(), T = D.length;
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (!SY.has(s)) SY.set(s, SY.size); }
if (!SY.has('SPUS')) SY.set('SPUS', SY.size);   // SPUS is held as a security by SQ17-MIX50 (filled from its own bars below if the cache lacks it)
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const CA = new Float32Array(N).fill(NaN), OA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; MAIN[k] = 1; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o[j]; VA[k] = x.x.v ? x.x.v[j] : NaN; } });
const SIC0 = store.sic || {}; store = null;
if (!OFFLINE) { const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), cl = (i) => CA.subarray(i * T, i * T + T), CC = (i, t) => CA[i * T + t], OO = (i, t) => OA[i * T + t];
if (spyI === undefined) { console.log('squad17-lab: SPY missing from the cache; nothing done'); process.exit(0); }
const lastI = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; }
const GONE = 5, vanishedI = (i) => lastI[i] >= 0 && lastI[i] < T - 1 - GONE, deadI = (i) => vanishedI(i) && CA[i * T + lastI[i]] < 3;
const LIQ = new Uint8Array(N), DV20 = new Float32Array(N);
function liqRow(i) { const b = i * T; let s = 0, n = 0; LIQ.fill(0, b, b + T); DV20.fill(0, b, b + T);
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN; if (isFinite(w)) { s -= w; n--; } }
    if (t >= 19 && n === 20) { DV20[b + t] = s / 20; if (CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } } }
for (let i = 0; i < NS; i++) if (i !== spyI) liqRow(i);
const liqMemo = new Map(), liqList = (t) => { if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const SPYC = cl(spyI);
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks)');

// ---- SPUS / HLAL (price only) ----
const NQ_HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
async function getJ(url, headers = {}) { if (OFFLINE) return null; for (let a = 0; a < 3; a++) { try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(45000) }); if (r.status === 404) return null; if (r.status === 429 || r.status >= 500) { await sleep(2500 * (a + 1)); continue; } if (!r.ok) return null; return await r.json(); } catch (e) { await sleep(2000 * (a + 1)); } } return null; }
const nnum = (v) => { const x = parseFloat(String(v || '').replace(/[$,]/g, '')); return isFinite(x) && x > 0 ? x : NaN; };
async function fundBars(sym) { const j = await api('/v2/aggs/ticker/' + sym + '/range/1/day/2019-01-01/' + iso(Date.now()) + '?adjusted=true&sort=asc&limit=50000');
  if (j && Array.isArray(j.results) && j.results.length > 100) return j.results.map(b => ({ d: iso(b.t), o: b.o, c: b.c }));
  const q = await getJ(NQ + '/api/quote/' + sym + '/historical?assetclass=etf&fromdate=2019-01-01&todate=' + iso(Date.now()) + '&limit=9999', NQ_HEAD), rows = q && q.data && q.data.tradesTable && q.data.tradesTable.rows;
  if (!Array.isArray(rows) || rows.length < 100) return null; return rows.map(r => { const m = String(r.date || '').match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m ? { d: m[3] + '-' + m[1] + '-' + m[2], o: nnum(r.open), c: nnum(r.close) } : null; }).filter(b => b && b.c > 0).sort((a, b) => a.d < b.d ? -1 : 1); }
const FUNDC = {}, FUNDBARS = {}; for (const f of ['SPUS', 'HLAL']) { const arr = new Float64Array(T).fill(NaN), i = SY.get(f), b = await fundBars(f); FUNDBARS[f] = b || [];
  if (i !== undefined && lastI[i] === T - 1) for (let t = 0; t < T; t++) arr[t] = CC(i, t); else if (b) { const m = new Map(b.map(x => [x.d, x.c])); for (let t = 0; t < T; t++) { const v = m.get(D[t]); if (v > 0) arr[t] = v; } }
  FUNDC[f] = arr; }
// SPUS as a security: if the price cache has no full SPUS row, its own bars (open + close) are written into the row
{ const i = SY.get('SPUS'); if (!(lastI[i] === T - 1)) { const m = new Map((FUNDBARS.SPUS || []).map(x => [x.d, x])); let n = 0;
    for (let t = 0; t < T; t++) { const b = m.get(D[t]), k = i * T + t; if (b && b.c > 0) { CA[k] = b.c; OA[k] = b.o > 0 ? b.o : b.c; n++; } }
    for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; } STATUS.spusRow = { filledFromBars: n }; } else STATUS.spusRow = { fromCache: true }; }
// DATA GUARD (after DIAG 1 of 24 Oct 2026, before any SQ17 result): the price API returns SPUS only from Oct 2021 (5-year limit), so the
// 10-month average did not exist at the start. The month-end closes BEFORE the first bar come from Alpha Vantage TIME_SERIES_MONTHLY
// (official API, ALPHAVANTAGE_KEY secret; SPUS never split, so its raw closes match); overlapping months must agree within 1%.
const SPUSI = SY.get('SPUS'); let SPUS_ME = monthEndCloses(FUNDBARS.SPUS.length ? FUNDBARS.SPUS : D.map((d, t) => ({ d, c: FUNDC.SPUS[t] })));
STATUS.spusHist = { ok: SPUS_ME.length > 0 && SPUS_ME[0][0] <= '2021-01', added: 0 };
if (!STATUS.spusHist.ok && env.ALPHAVANTAGE_KEY && !OFFLINE) { const j = await getJ('https://www.alphavantage.co/query?function=TIME_SERIES_MONTHLY&symbol=SPUS&apikey=' + encodeURIComponent(env.ALPHAVANTAGE_KEY)), ser = j && j['Monthly Time Series'];
  if (ser) { const av = Object.entries(ser).map(([d, v]) => [d.slice(0, 7), d, +v['4. close']]).filter(x => x[2] > 0).sort((a, b) => a[0] < b[0] ? -1 : 1), have = new Map(SPUS_ME.map(x => [x[0], x]));
    const overlap = av.filter(x => have.has(x[0]) && have.get(x[0])[1] === x[1]), agree = overlap.filter(x => Math.abs(x[2] / have.get(x[0])[2] - 1) < 0.01).length;
    const older = av.filter(x => x[0] < SPUS_ME[0][0]); SPUS_ME = [...older, ...SPUS_ME];
    STATUS.spusHist = { ok: SPUS_ME[0][0] <= '2021-01' && overlap.length >= 6 && agree >= overlap.length - 1, added: older.length, from: SPUS_ME[0][1], overlapMonths: overlap.length, agreeWithin1pct: agree }; } else STATUS.spusHist.error = 'no Alpha Vantage answer'; }
log('SPUS month-end history: ' + JSON.stringify(STATUS.spusHist));
STATUS.funds = { ok: ['SPUS', 'HLAL'].every(f => FUNDC[f].filter(x => x > 0).length > T * 0.9) && lastI[SPUSI] === T - 1 && STATUS.spusHist.ok, SPUS: FUNDC.SPUS.filter(x => x > 0).length, HLAL: FUNDC.HLAL.filter(x => x > 0).length, spusHistoryFrom: SPUS_ME.length ? SPUS_ME[0][1] : null, ...STATUS.spusRow };

// ================= 2. SEC: historical ticker map (Form 3/4/5 SUBMISSION tables) =================
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : (/^\d{4}-\d\d-\d\d/.test(String(s || '')) ? String(s).slice(0, 10) : null); };
function download(url, file) { if (OFFLINE) return false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
function parseMap(zip) { let txt; try { txt = execFileSync('unzip', ['-p', zip, 'SUBMISSION.tsv'], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const L = txt.split(/\r?\n/), H = L[0].split('\t'), ix = (k) => H.indexOf(k);
  const a = ix('FILING_DATE'), c = ix('ISSUERCIK'), s = ix('ISSUERTRADINGSYMBOL'); if (a < 0 || c < 0 || s < 0) return null; const map = new Map();
  for (const l of L.slice(1)) { if (!l) continue; const r = l.split('\t'), d = isoD(r[a]), cik = String(+r[c] || ''), sym = String(r[s] || '').toUpperCase().trim().replace(/-/g, '.'); if (!d || !cik || !/^[A-Z][A-Z0-9.]{0,6}$/.test(sym) || sym === 'NONE' || sym === 'NA') continue;
    const k = sym + '|' + cik, o = map.get(k); if (!o) map.set(k, [sym, cik, d, d, 1]); else { if (d < o[2]) o[2] = d; if (d > o[3]) o[3] = d; o[4]++; } }
  return { map: [...map.values()] }; }
const TMAP = new Map(); { const qs = [], now = new Date(); for (let y = 2021; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, q * 3, 1)) < now) qs.push(y + 'q' + q);
  const fail = []; let got = 0, from4 = 0;
  for (const q of qs) { let x = JZ(SC4 + '/f345/' + q + '.json.gz', null); if (x) from4++; if (!x) x = JZ(SC5 + '/f345/' + q + '.json.gz', null); if (!x) x = JZ(SC + '/f345/' + q + '.json.gz', null);
    if (!x && !OFFLINE) { for (const p of ['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/']) { const zip = SC + '/f345.zip'; if (!download(SEC + p + q + '_form345.zip', zip)) continue;
      const r = parseMap(zip); try { fs.unlinkSync(zip); } catch (e) {} if (r) { x = r; WZ(SC + '/f345/' + q + '.json.gz', x); got++; break; } } }
    if (!x) { fail.push(q); continue; } for (const m of x.map) (TMAP.get(m[0]) || TMAP.set(m[0], []).get(m[0])).push([m[1], m[2], m[3], m[4]]); }
  for (const [s, a] of TMAP) { const by = new Map(); for (const [c, f, l, n] of a) { const o = by.get(c); if (!o) by.set(c, [c, f, l, n]); else { if (f < o[1]) o[1] = f; if (l > o[2]) o[2] = l; o[3] += n; } } TMAP.set(s, [...by.values()]); }
  STATUS.tickerMap = { ok: qs.slice(0, -1).every(q => !fail.includes(q)), quarters: qs.length, fromSquad4Cache: from4, downloadedNow: got, missing: fail, tickers: TMAP.size };
  log('ticker map: ' + JSON.stringify(STATUS.tickerMap)); }
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {}, c: {} });
// ---- RENAMED GIANTS (DATA GUARD set after DIAG 3 of 24 Oct 2026, before any rule result): the price cache has NO rows under a renamed
// company's OLD ticker (no FB at all), and the new ticker's rows before the rename can belong to an unrelated security (META before
// 9 Jun 2022 = the Roundhill metaverse ETF), so Meta was missing from every 2022 ranking. For the 400 most traded stocks at the last close:
// an older ticker of the same SEC company in the Form 3/4/5 map whose filings end before the current ticker's begin, with no usable cache
// rows, has its daily bars fetched (Massive, adjusted) and written into the current ticker's row up to its last bar (sanity: its last close
// within 15% of the current ticker's next close). ----
STATUS.renames = { ok: true, spliced: [], skipped: [] };
{ const top = []; for (let i = 0; i < NS; i++) if (i !== spyI && DV20[i * T + T - 1] > 0) top.push([DV20[i * T + T - 1], i]); top.sort((a, b) => b[0] - a[0]);
  for (const [, i] of top.slice(0, 400)) { const sym = SYMS[i], cik = String((SH.t[sym]) || (SECCIK[sym] && SECCIK[sym][0]) || ''); if (!cik) continue;
    const mine = (TMAP.get(sym) || []).filter(x => x[0] === cik); if (!mine.length) continue; const myFirst = mine.reduce((a, x) => x[1] < a ? x[1] : a, '9999');
    if (myFirst <= D[0]) continue;
    for (const [old, spans] of TMAP) { if (old === sym) continue; const sp = spans.find(x => x[0] === cik && x[2] <= myFirst && x[2] >= D[0] && x[3] >= 3); if (!sp) continue;
      const oi = SY.get(old); if (oi !== undefined && lastI[oi] >= 0 && CA[oi * T + lastI[oi]] > 0 && D[lastI[oi]] >= sp[2]) continue;   // the cache has the old ticker: nothing to do
      const j = await api('/v2/aggs/ticker/' + old + '/range/1/day/' + D[0] + '/' + myFirst + '?adjusted=true&sort=asc&limit=50000'), bars = j && Array.isArray(j.results) ? j.results : [];
      if (bars.length < 20) { STATUS.renames.skipped.push(old + '->' + sym + ' (no bars)'); if (!OFFLINE) STATUS.renames.ok = false; continue; }
      const lastD = iso(bars[bars.length - 1].t), tn = D.findIndex(d => d > lastD), nxt = tn > 0 ? (() => { for (let k = tn; k < Math.min(T, tn + 5); k++) if (CA[i * T + k] > 0) return CA[i * T + k]; return null; })() : null, lc = bars[bars.length - 1].c;
      if (!(nxt > 0) || Math.abs(Math.log(lc / nxt)) > Math.log(1.15)) { STATUS.renames.skipped.push(old + '->' + sym + ' (price gap ' + lc + ' vs ' + nxt + ')'); continue; }
      const m = new Map(bars.map(b => [iso(b.t), b])); let n = 0;
      for (let t = 0; t < T && D[t] <= lastD; t++) { const k = i * T + t, b = m.get(D[t]); if (b && b.c > 0) { OA[k] = b.o; CA[k] = b.c; VA[k] = b.v; MAIN[k] = 1; n++; } else { OA[k] = NaN; CA[k] = NaN; VA[k] = NaN; MAIN[k] = 0; } }
      liqRow(i); for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; }
      const sp2 = TMAP.get(sym); sp2.push([cik, D[0], lastD, sp[3]]);   // the current ticker now carries the old one's history: map it to the company from the start
      STATUS.renames.spliced.push(old + '->' + sym + ' to ' + lastD + ' (' + n + ' bars)'); break; } }
  log('renames: ' + JSON.stringify(STATUS.renames)); }

const cikMemo = new Map(); function cikAt(i, d) { const s = SYMS[i], k = i + '|' + d.slice(0, 7); if (cikMemo.has(k)) return cikMemo.get(k);
  let c = cikFromSpans(TMAP.get(s) || TMAP.get(s.replace(/\./g, '-')), d); if (!c && (!vanishedI(i) || lastI[i] >= T - 260)) { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) c = String(a); else { const y = SECCIK[s]; if (y) c = String(y[0]); } }
  cikMemo.set(k, c || null); return c || null; }

// ================= 3. SEC company facts (Squad 4's cache read only, else own bulk download) =================
const TAGS = { rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], gp: ['GrossProfit'], cogs: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'],
  rd: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'], op: ['OperatingIncomeLoss'], cfo: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'], eq: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  debt: ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent'], cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'] };
const ALLTAGS = [...new Set(Object.values(TAGS).flat())], hasRev = (a) => !!a && TAGS.rev.some(t => a[t]);
const compact = (j) => { const out = {}, g = j && j.facts && j.facts['us-gaap']; if (!g) return out; let first = null;
  for (const v of Object.values(g)) for (const arr of Object.values((v && v.units) || {})) if (Array.isArray(arr)) for (const x of arr) if (x && x.filed && (!first || x.filed < first)) first = x.filed;
  for (const tag of ALLTAGS) { const u = g[tag] && g[tag].units && g[tag].units.USD; if (!Array.isArray(u)) continue; const rows = [], seen = new Set();
    for (const x of [...u].sort((a, b) => a.filed < b.filed ? -1 : 1)) { if (!x || !x.end || !x.filed || !isFinite(x.val) || x.end < '2017-01-01') continue; if (x.start) { const dd = (Date.parse(x.end) - Date.parse(x.start)) / 864e5 + 1; if (!((dd >= 80 && dd <= 100) || (dd >= 170 && dd <= 190) || (dd >= 260 && dd <= 285) || (dd >= 350 && dd <= 380))) continue; } const k = (x.start || '') + '|' + x.end + '|' + x.val; if (seen.has(k)) continue; seen.add(k); rows.push([x.start || '', x.end, x.val, x.filed]); }
    if (rows.length) out[tag] = rows; }
  const dei = j.facts.dei && j.facts.dei.EntityCommonStockSharesOutstanding && j.facts.dei.EntityCommonStockSharesOutstanding.units && j.facts.dei.EntityCommonStockSharesOutstanding.units.shares;
  if (Array.isArray(dei)) { const m = new Map(); for (const x of dei) if (x && x.end && isFinite(x.val) && x.val > 0 && x.end >= '2015-01-01') m.set(x.end, (m.get(x.end) || 0) < x.val ? x.val : m.get(x.end)); out._sh = [...m.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1); }
  out._first = first; return out; };
const NSH = 16, FX = { c: {}, from4: 0, own: {} };
for (let k = 0; k < NSH; k++) { const a = JZ(SC4 + '/facts-' + k + '.json.gz', null); if (a) { Object.assign(FX.c, a); FX.from4 += Object.keys(a).length; } }
{ const meta = J(SC + '/facts-meta.json', {}); FX.ownAt = meta.at || null; for (let k = 0; k < NSH; k++) { for (const [c, v] of Object.entries(JZ(SC5 + '/facts-' + k + '.json.gz', {}))) if (!(c in FX.c)) FX.c[c] = v; Object.assign(FX.own, JZ(SC + '/facts-' + k + '.json.gz', {})); } for (const [c, v] of Object.entries(FX.own)) if (!(c in FX.c)) FX.c[c] = v; }
// the companies needed: every liquid stock at a month start (market value ranks need all of them)
const MS = monthStarts(D), ME = monthEnds(D);
const NEED = new Set(); for (const t of MS) for (const i of liqList(t)) { const c = cikAt(i, D[t]); if (c) NEED.add(c); }
{ const todo = [...NEED].filter(c => !(c in FX.c)); let got = 0, fail = 0, mode = 'cache';
  if (todo.length && !OFFLINE && !DIAG) { const zip = SC + '/companyfacts.zip'; let zipOk = false;
    if (todo.length > 300 && !local(env.SEC_BASE)) zipOk = download(SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip', zip) && fs.statSync(zip).size > 1e8;
    if (zipOk) { mode = 'bulk'; const tmp = SC + '/cf-tmp'; for (let a = 0; a < todo.length; a += 400) { const part = todo.slice(a, a + 400), names = part.map(c => 'CIK' + c.padStart(10, '0') + '.json'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
        try { execFileSync('unzip', ['-o', '-qq', zip, ...names, '-d', tmp], { stdio: 'ignore', maxBuffer: 1e8 }); } catch (e) {}
        for (const c of part) { const f = tmp + '/CIK' + c.padStart(10, '0') + '.json'; let j = null; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {} FX.c[c] = FX.own[c] = j ? compact(j) : {}; if (j) got++; } }
      fs.rmSync(tmp, { recursive: true, force: true }); try { fs.unlinkSync(zip); } catch (e) {} }
    else { mode = 'api'; for (const c of todo) { if (left() < 60 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null; try { r = await fetch(SECD + '/api/xbrl/companyfacts/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); } catch (e) {}
        if (r && r.ok) { const j = await r.json().catch(() => null); if (j) { FX.c[c] = FX.own[c] = compact(j); got++; } } else if (r && r.status === 404) FX.c[c] = FX.own[c] = {}; else fail++; } }
    if (got) { const parts = Array.from({ length: NSH }, () => ({})); for (const [c, v] of Object.entries(FX.own)) parts[+c % NSH][c] = v; parts.forEach((o, k) => WZ(SC + '/facts-' + k + '.json.gz', o)); W(SC + '/facts-meta.json', { at: new Date().toISOString() }); } }
  const ans = [...NEED].filter(c => c in FX.c).length, cov = [...NEED].filter(c => hasRev(FX.c[c])).length;
  STATUS.facts = { ok: NEED.size > 0 && ans >= NEED.size * 0.95 && cov >= NEED.size * 0.5, companies: NEED.size, answered: ans, withRevenue: cov, fromSquad4Cache: FX.from4, fetchedNow: got, failed: fail, mode };
  log('SEC facts: ' + JSON.stringify(STATUS.facts)); }
const coMemo = new Map(); const coOf = (cik) => { if (!cik) return null; if (coMemo.has(cik)) return coMemo.get(cik); const a = FX.c[cik]; let o = null;
  if (hasRev(a)) { o = {}; for (const [g, tags] of Object.entries(TAGS)) { o[g] = {}; for (const t of tags) if (a[t]) o[g][t] = a[t].map(([s0, e, v, f]) => ({ s: s0, e, v, f })); } } coMemo.set(cik, o); return o; };
const coverRows = (cik) => SH.raw && SH.raw[cik] && SH.raw[cik].length ? SH.raw[cik] : (FX.c[cik] && FX.c[cik]._sh) || null;   // AS REPORTED (data/shares.json.gz raw; its c rows are split-adjusted): splits are applied by capAt

// ================= 4. UNIVERSE + market value ranks =================
// ---- alternative share counts for companies without a cover-page count (multi-class companies): SEC balance-sheet / weighted-average
// shares, keyed by their FILING date (known from then), the current period of each filing; own cache ----
const SUBS = { ...J(SC5 + '/subs.json', {}), ...J(SC + '/subs.json', {}) };
const ALT = { ...J(SC5 + '/alt-shares-v3.json', {}), ...J(SC + '/alt-shares-v3.json', {}) }, ALT_TAGS = ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding', 'CommonStockSharesOutstanding'];
// per filing: the current period's count of each tag; the LARGEST of the tags (a multi-class company may report one class under one tag)
function altFrom(j) { const g = j && j.facts && j.facts['us-gaap']; if (!g) return []; const m = new Map();
  for (const tag of ALT_TAGS) { const u = g[tag] && g[tag].units && g[tag].units.shares; if (!Array.isArray(u)) continue; const cur = new Map();
    for (const x of u) { if (!x || !x.filed || !x.end || !(x.val > 0) || x.end < '2019-01-01') continue; if (x.start) { const dd = (Date.parse(x.end) - Date.parse(x.start)) / 864e5 + 1; if (!((dd >= 80 && dd <= 100) || (dd >= 350 && dd <= 380))) continue; }
      const o = cur.get(x.filed); if (!o || x.end > o[1] || (x.end === o[1] && x.val > o[2])) cur.set(x.filed, [x.filed, x.end, x.val]); }
    for (const [f, r] of cur) { const o = m.get(f); if (!o || r[1] > o[1] || (r[1] === o[1] && r[2] > o[2])) m.set(f, r); } }
  return [...m.values()].sort((a, b) => a[0] < b[0] ? -1 : 1); }
// ---- the split list (Massive; own cache, refreshed every run): ticker -> [[execution date, new shares per old share]] ----
const SPL = new Map(); { let rows = J(SC + '/splits.json', null) || J(SC5 + '/splits.json', null), pages = 0;
  if (!OFFLINE) { const got = []; let path = '/stocks/v1/splits?execution_date.gte=2021-01-01&limit=1000', ok2 = false;
    while (path && pages < 80) { const j = await api(path); pages++; if (!j || j.refused || !Array.isArray(j.results)) break; got.push(...j.results); if (!j.next_url) { ok2 = true; break; } path = String(j.next_url).replace(/^https?:\/\/[^/]+/, ''); }
    if (ok2 && got.length > 500) { rows = got.map(x => [String(x.ticker || '').toUpperCase(), String(x.execution_date || ''), +x.split_from, +x.split_to, String(x.adjustment_type || '')]); W(SC + '/splits.json', rows); } }
  for (const [t, d, f, to, kind] of rows || []) { if (!t || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(kind)) continue; (SPL.get(t) || SPL.set(t, []).get(t)).push([d, to / f]); }
  for (const a of SPL.values()) a.sort((x, y) => x[0] < y[0] ? -1 : 1);
  STATUS.splits = { ok: (rows || []).length > 500, rows: (rows || []).length, tickers: SPL.size, pagesNow: pages }; log('split list: ' + JSON.stringify(STATUS.splits)); }
// DATA GUARD (after DIAG 3, before any result): the split list misses some splits (GOOGL 20-for-1, Jul 2022: Alphabet ranked at 96B in Jan
// 2022); a near-whole jump in the company's financial-statement share count with no listed split is taken as a split (squad10-core impliedSplits)
const splMemo = new Map(), splitsOf = (i, cik) => { const k = i + '|' + cik; if (!splMemo.has(k)) { const L = SPL.get(SYMS[i]) || SPL.get(SYMS[i].replace(/\./g, '-')) || []; const imp = impliedSplits(ALT[cik], L); splMemo.set(k, imp.length ? [...L, ...imp].sort((a, b) => a[0] < b[0] ? -1 : 1) : L); if (imp.length) IMPLIED[SYMS[i]] = imp; } return splMemo.get(k); }, IMPLIED = {};
const capOf = (i, cik, t) => { const r = capAt({ adjClose: CC(i, t), d: D[t], splits: splitsOf(i, cik), cover: coverRows(cik), alt: ALT[cik] }); return r ? r.cap : null; };
const coverOk = (cik, d) => { const lim = addDays(d, -30); return (coverRows(cik) || []).some(([e, n]) => e <= lim && n > 0); };
// the financial-statement count is fetched for every company without a usable cover-page count and for every company in the provisional 700
// largest at any month start (rowsAt is a hoisted function declaration)
{ const want = new Set(); for (const t of [...MS, T - 1]) { for (const i of liqList(t)) { const cik = cikAt(i, D[t]); if (cik && coOf(cik) && !coverOk(cik, D[t]) && !(cik in ALT)) want.add(cik); }
    if (t >= 19) for (const r of byCap(rowsAt(t, false).rows).slice(0, 700)) if (!(r.cik in ALT)) want.add(r.cik); }
  let got = 0; if (!OFFLINE) for (const c of want) { if (left() < 75 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null; try { r = await fetch(SECD + '/api/xbrl/companyfacts/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); } catch (e) {}
    if (r && r.ok) { const j = await r.json().catch(() => null); if (j) { ALT[c] = altFrom(j); got++; } } else if (r && r.status === 404) ALT[c] = []; }
  if (got) W(SC + '/alt-shares-v3.json', ALT); STATUS.altShares = { ok: [...want].filter(c => !(c in ALT)).length <= Math.max(5, want.size * 0.02), wanted: want.size, fetchedNow: got, known: Object.values(ALT).filter(a => a.length).length }; log('statement share counts: ' + JSON.stringify(STATUS.altShares)); }
// ---- domicile (SEC submissions: business address + 20-F / 40-F filings; also the SIC code); own cache ----
function rowsAt(t, useDom) { const rows = new Map(); let noCik = 0, noFacts = 0, noShares = 0, foreign = 0;
  for (const i of liqList(t)) { const cik = cikAt(i, D[t]); if (!cik) { noCik++; continue; } if (!coOf(cik)) { noFacts++; continue; } if (useDom && SUBS[cik] && SUBS[cik].us === false) { foreign++; continue; } const cap = capOf(i, cik, t); if (!cap) noShares++;
    const r = { key: i, i, cik, dv: DV20[i * T + t], close: CC(i, t), cap }, o = rows.get(cik); if (!o || r.dv > o.dv) rows.set(cik, r); }
  return { rows: [...rows.values()], noCik, noFacts, noShares, foreign }; }
{ const want = new Set(); for (const t of [...MS.filter(x => x >= 19), T - 1]) for (const r of byCap(rowsAt(t, false).rows).slice(0, 700)) if (!(r.cik in SUBS)) want.add(r.cik);
  let got = 0, fail = 0; if (!OFFLINE) for (const c of want) { if (left() < 70 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null; try { r = await fetch(SECD + '/submissions/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); } catch (e) {}
    if (r && r.ok) { const j = await r.json().catch(() => null); if (j) { const st = j.addresses && j.addresses.business && j.addresses.business.stateOrCountry, forms = (j.filings && j.filings.recent && j.filings.recent.form) || [];
      SUBS[c] = { st: st || null, us: usCompany(st, forms), f20: forms.some(f => /^(20-F|40-F)/.test(String(f))), sic: j.sic ? String(j.sic).padStart(4, '0') : '' }; got++; } else fail++; } else if (r && r.status === 404) SUBS[c] = { st: null, us: false, f20: false, sic: '' }; else fail++; }
  if (got) W(SC + '/subs.json', SUBS); const still = [...want].filter(c => !(c in SUBS)).length;
  STATUS.domicile = { ok: still <= Math.max(5, want.size * 0.02), wantedNow: want.size, fetchedNow: got, failed: fail, missing: still, known: Object.keys(SUBS).length, foreign: Object.values(SUBS).filter(x => x.us === false).length };
  log('domicile: ' + JSON.stringify(STATUS.domicile)); }
const uniMemo = new Map();
function universe(t) { if (uniMemo.has(t)) return uniMemo.get(t); const X = rowsAt(t, true), ranked = byCap(X.rows); ranked.forEach((r, j) => { r.rank = j; });
  const out = { ranked, liquid: liqList(t).length, companies: X.rows.length, noCik: X.noCik, noFacts: X.noFacts, noShares: X.noShares, foreign: X.foreign }; uniMemo.set(t, out); return out; }
// industry (SIC 4-digit)
const SICC = { ...J(SC4 + '/sic.json', {}), ...J(SC5 + '/sic.json', {}), ...J(SC + '/sic.json', {}) }; let sicFetched = 0;
const sicOfSym = (s) => { const x = SIC0[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECCIK[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
const sicAt = (i, cik) => sicOfSym(SYMS[i]) || (cik && SICC[cik]) || (cik && SUBS[cik] && SUBS[cik].sic) || null;
const startT = MS.find(t => t >= 19);   // the first month start with a 20-session traded value
const QS = MS.filter(t => t >= startT && isQuarterMonth(D[t]));
{ const want = new Set(); for (const t of [...QS, ...ME.filter(t => t >= startT), T - 1]) for (const r of universe(t).ranked.slice(0, 600)) if (!sicAt(r.i, r.cik) && !(r.cik in SICC)) want.add(r.cik);
  if (!OFFLINE) for (const c of want) { if (left() < 70 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null; try { r = await fetch(SECD + '/submissions/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); } catch (e) {}
    if (r && r.ok) { const j = await r.json().catch(() => null); SICC[c] = j && j.sic ? String(j.sic).padStart(4, '0') : ''; sicFetched++; } else if (r && r.status === 404) SICC[c] = ''; }
  if (sicFetched) W(SC + '/sic.json', Object.fromEntries(Object.entries(SICC))); let n = 0, have = 0; for (const t of [...QS, T - 1]) for (const r of universe(t).ranked.slice(0, 300)) { n++; if (sicAt(r.i, r.cik)) have++; }
  STATUS.sic = { ok: n > 0 && have >= n * 0.95, top300Rows: n, withSic: have, askedNow: sicFetched, wanted: want.size }; log('SIC: ' + JSON.stringify(STATUS.sic)); }
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';

// coverage / survivorship diagnostics
const DIAGS = { window: [D[0], D[T - 1]], sessions: T, stocks: NS, data: STATUS };
{ let g = 0, gc = 0, a = 0, ac = 0; for (const t of MS) for (const i of liqList(t)) { const c = cikAt(i, D[t]); if (vanishedI(i)) { g++; if (c) gc++; } else { a++; if (c) ac++; } }
  STATUS.cikCover = { ok: g === 0 || gc / g >= 0.75, vanished: g, vanishedWithCik: gc, alive: a, aliveWithCik: ac, vanishedShare: r4(g ? gc / g : null), aliveShare: r4(a ? ac / a : null) };
  }
const ZADM = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && (HAL[s].s === 'ok' || HAL[s].s === 'fail') ? HAL[s].s : 'unknown');
const HEXT = J('data/halal-ext.json', {}), screener = (s) => { const x = HEXT[s] && HEXT[s].ht; return x && typeof x.v === 'boolean' ? (x.v ? 'ok' : 'fail') : 'unknown'; };

// ================= 4b. SHARIAH SCREEN DATA (own cache shfacts: the extra SEC items of the ~200 largest at every quarter) =================
const CANDS = 320, SHN_MAX = MOM_POOL;   // walk until 100 pass (rule 3); Shariah facts fetched for the 320 largest at every review and month end
const SHALL = [...new Set(Object.values(SH_TAGS).flat())], SHF = JZ(SC + '/shfacts-v2.json.gz', {});
function compactSH(j) { const g = j && j.facts && j.facts['us-gaap'], out = {}; if (!g) return out;
  for (const tag of SHALL) { const u = g[tag] && g[tag].units && g[tag].units.USD; if (!Array.isArray(u)) continue; const rows = [], seen = new Set();
    for (const x of u) { if (!x || !x.end || !x.filed || !isFinite(x.val) || x.end < '2017-01-01') continue;
      if (x.start) { const dd = (Date.parse(x.end) - Date.parse(x.start)) / 864e5 + 1; if (!((dd >= 80 && dd <= 100) || (dd >= 170 && dd <= 190) || (dd >= 260 && dd <= 285) || (dd >= 350 && dd <= 380))) continue; }
      const k = (x.start || '') + '|' + x.end + '|' + x.val + '|' + x.filed; if (seen.has(k)) continue; seen.add(k); rows.push([x.start || '', x.end, x.val, x.filed]); }
    if (rows.length) out[tag] = rows; }
  return out; }
const MEW = ME.filter(t => t >= startT && t + 1 < T);   // month-end sessions (rule 2 checks and re-entries)
{ const want = new Set(); for (const t of [...QS, ...MEW, T - 1]) for (const r of universe(t).ranked.slice(0, CANDS)) if (!(r.cik in SHF)) want.add(r.cik);
  let got = 0, fail = 0; if (!OFFLINE) for (const c of want) { if (left() < 40 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null;
    try { r = await fetch(SECD + '/api/xbrl/companyfacts/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) }); } catch (e) {}
    if (r && r.ok) { const j = await r.json().catch(() => null); if (j) { SHF[c] = compactSH(j); got++; } else fail++; } else if (r && r.status === 404) SHF[c] = {}; else fail++; }
  if (got) WZ(SC + '/shfacts-v2.json.gz', SHF); const still = [...want].filter(c => !(c in SHF)).length;
  STATUS.shFacts = { ok: still <= Math.max(3, want.size * 0.01), wantedNow: want.size, fetchedNow: got, failed: fail, missing: still, known: Object.keys(SHF).length }; log('Shariah facts: ' + JSON.stringify(STATUS.shFacts)); }
const shMemo = new Map(); function shOf(cik) { if (shMemo.has(cik)) return shMemo.get(cik); const a = SHF[cik]; let o = null;
  if (a) { o = {}; for (const [g, tags] of Object.entries(SH_TAGS)) { o[g] = {}; for (const t of tags) if (a[t]) o[g][t] = a[t].map(([s0, e, v, f]) => ({ s: s0, e, v, f })); } } shMemo.set(cik, o); return o; }
// market value at every month start by company (for the 36-month average)
const capMS = new Map(); for (const t of MS) if (t >= startT) capMS.set(t, new Map(universe(t).ranked.map(r => [r.cik, r.cap])));
function mvAvg(cik, t, cur) { const prev = MS.filter(m => m >= startT && m < t).slice(-(AVG_MONTHS - 1)).map(m => capMS.get(m).get(cik)); return avgLast([...prev, cur], AVG_MONTHS); }
// the companies passing the screen at t, largest first (up to SHN_MAX), with the reasons the others failed (among those walked)
const listMemo = new Map();
function shariahList(t) { if (listMemo.has(t)) return listMemo.get(t); const rows = [], why = {}, walked = []; let walkedN = 0;
  for (const r of universe(t).ranked) { if (rows.length >= SHN_MAX) break; walkedN++; const sic = sicAt(r.i, r.cik), co = shOf(r.cik);
    const b = co ? balanceAt(co, D[t]) : { debt: null, cashInv: null, recv: null, intInc: null, rev: null }, avg = mvAvg(r.cik, t, r.cap);
    const v = co ? shariahPass({ sic, mvAvg: avg, ...b }) : { ok: false, why: 'no SEC facts fetched' };
    const pct = (x) => x === null || x === undefined || !(avg > 0) ? null : r4(x / avg);
    if (walked.length < 60) walked.push({ sym: SYMS[r.i], cik: r.cik, capB: r4(r.cap / 1e9), pass: v.ok, why: v.why, bsEnd: b.end || null, debtPct: pct(b.debt), cashPct: pct(b.cashInv), recvPct: pct(b.recv), intPct: b.rev > 0 && b.intInc !== null ? r4(b.intInc / b.rev) : null });
    if (v.ok) rows.push({ key: r.i, i: r.i, cik: r.cik, sym: SYMS[r.i], cap: r.cap, mom: mom121(cl(r.i), t) }); else why[v.why] = (why[v.why] || 0) + 1; }
  const o = { rows, why, walked, depth: walkedN }; listMemo.set(t, o); return o; }
STATUS.impliedSplits = { ok: true, list: IMPLIED };
{ const bad = []; let maxDepth = 0; for (const t of [...QS, ...MEW]) { const L = shariahList(t); maxDepth = Math.max(maxDepth, L.depth); if (L.rows.length < SHN_MAX || L.depth > CANDS || L.why['no SEC facts fetched']) bad.push(D[t] + ' ' + L.rows.length + '/' + L.depth + (L.why['no SEC facts fetched'] ? ' nofacts ' + L.why['no SEC facts fetched'] : '')); }
  STATUS.depth = { ok: bad.length === 0, maxRankWalked: maxDepth, candidatesWithFacts: CANDS, bad: bad.slice(0, 20) }; log('Shariah list depth: ' + JSON.stringify(STATUS.depth)); }
DIAGS.shariah = [...QS.filter(t => D[t].slice(5, 7) === '01'), T - 1].map(t => { const L = shariahList(t); return { date: D[t], passing: L.rows.length, walked: L.depth, outReasons: L.why, top20: L.rows.slice(0, 20).map(r => r.sym) }; });

// ================= 5. THE BASKETS =================
// build(id) -> { start (formation session of the first review), events (trade session -> simulate event), wts, reviews, trend }
// info-only baselines: build('BASE-SPUS') = SPUS bought once at the first SH20-C15 trade session and held; build('BASE-SH20C15') = SQ10-SH20-C15
const QSET = new Set(QS), MESET = new Set(MEW);
function build(id) { const ev = new Map(), wts = new Map(), trend = []; let first = null;
  const R = RULES[id] || { kind: id === 'BASE-SPUS' ? 'spus' : 'base', every: 'q', n: 20 };
  const put = (t, w) => { ev.set(t + 1, { kind: 'reset', w }); wts.set(t + 1, { t, rows: [], w }); };
  if (R.kind === 'tf') { let inv = false;
    for (let t = QS[0]; t + 1 < T; t++) {
      if (first === null) { if (!QSET.has(t)) continue; first = t; const prevME = ME.filter(k => k < t).pop(), tr = prevME !== undefined ? trendAt(SPUS_ME, D[prevME]) : null;
        trend.push({ d: D[prevME], up: tr ? tr.up : null, close: tr ? r4(tr.close) : null, sma: tr ? r4(tr.sma) : null, start: true });
        if (tr && tr.up) { put(t, c15(shariahList(t).rows.slice(0, R.n))); inv = true; } continue; }
      if (MESET.has(t)) { const tr = trendAt(SPUS_ME, D[t]); trend.push({ d: D[t], up: tr ? tr.up : null, close: tr ? r4(tr.close) : null, sma: tr ? r4(tr.sma) : null });
        if (!tr) continue;
        if (inv && !tr.up) { ev.set(t + 1, { kind: 'cash' }); wts.set(t + 1, { t, rows: [], w: new Map(), cash: true }); inv = false; }
        else if (!inv && tr.up) { put(t, c15(shariahList(t).rows.slice(0, R.n))); inv = true; } }
      else if (QSET.has(t) && inv) put(t, c15(shariahList(t).rows.slice(0, R.n))); }
    return { start: first, events: ev, wts, reviews: [...ev.keys()].sort((a, b) => a - b), trend, investedNow: inv }; }
  for (const t of QS) { if (!(t + 1 < T)) continue;
    if (R.kind === 'spus') { put(t, new Map([[SPUSI, 1]])); first = t; break; }
    if (R.kind === 'base') { const rows = shariahList(t).rows.slice(0, 20); if (rows.length < 20) continue; put(t, c15(rows)); if (first === null) first = t; continue; }
    if (!reviewMonth(id, D[t]) || (R.mom && t < 252)) continue;
    const rows = shariahList(t).rows; if (rows.length < (R.kind === 'mom' ? R.pool : R.n)) continue;
    const w = weightsFor(id, rows, SPUSI); if (w.size < (R.kind === 'mix' ? R.n + 1 : R.n)) continue; if (first === null) first = t; put(t, w); }
  return { start: first, events: ev, wts, reviews: [...ev.keys()].sort((a, b) => a - b) }; }

if (DIAG) { console.log('SQUAD 17 DIAGNOSTICS (data coverage and basket structure only; no returns computed, nothing judged)');
  DIAGS.structure = {}; for (const id of [...IDS, 'BASE-SPUS', 'BASE-SH20C15']) { const B = build(id), ks = B.reviews;
    DIAGS.structure[id] = { start: B.start === null ? null : D[B.start], events: ks.length, cashEvents: [...B.events.values()].filter(e => e.kind === 'cash').length,
      perEvent: ks.map(k => { const w = B.wts.get(k).w; return D[k] + ' n' + w.size + ' sum' + r4([...w.values()].reduce((a, b) => a + b, 0)) + ' max' + r4(Math.max(0, ...w.values())); }),
      trendChecks: B.trend ? B.trend.length : undefined, investedNow: B.investedNow }; }
  fs.writeFileSync('data/squad17-diag.json', JSON.stringify(DIAGS, null, 1)); console.log(JSON.stringify({ data: STATUS, shariah: DIAGS.shariah, structure: DIAGS.structure }, null, 1).slice(0, 30000)); process.exit(0); }

// ================= 6. YARDSTICKS (as squad5-lab) =================
const ART = new Map(), artOf = (i) => { if (!ART.has(i)) ART.set(i, artifactJumps(cl(i))); return ART.get(i); };
const lastCloseI = (i, k) => { for (let q = Math.min(k, T - 1); q >= 0; q--) { const z = CC(i, q); if (z > 0) return z; } return null; };
const pxApi = { o: (i, k) => OO(i, k), c: (i, k) => CC(i, k), last: (i) => lastI[i], vanished: vanishedI, dead: deadI };
const exitVal = (i, x, at) => { if (vanishedI(i) && x > lastI[i]) return deadI(i) ? 0 : CC(i, lastI[i]); if (at === 'o') { const o = OO(i, x); return o > 0 ? o : lastCloseI(i, x - 1); } return lastCloseI(i, x); };
const curveMemo = new Map();
function curve(te) { if (curveMemo.has(te)) return curveMemo.get(te); const L = T - te, sR = new Float64Array(L), sC = new Float64Array(L), cnt = new Uint32Array(L), lq = liqList(te - 1);
  for (let q = 0; q < lq.length; q += 2) { const i = lq[q], e = OO(i, te); if (!(e > 0)) continue; const aj = artOf(i), li = lastI[i], van = vanishedI(i), dead = deadI(i); let lc = NaN, wall = L;
    for (const a of aj) if (a > te - 1) { wall = a - te; break; }
    for (let off = 0; off < Math.min(L, wall); off++) { const k = te + off; let v; if (van && k > li) v = dead ? 0 : CC(i, li); else { const z = CC(i, k); if (z > 0) lc = z; v = lc; } if (!(v >= 0)) continue; sR[off] += v / e; sC[off] += Math.min(v / e, 1 + CAP); cnt[off]++; } }
  const raw = new Float32Array(L), cap = new Float32Array(L); for (let off = 0; off < L; off++) { raw[off] = cnt[off] >= 50 ? sR[off] / cnt[off] - 1 : NaN; cap[off] = cnt[off] >= 50 ? sC[off] / cnt[off] - 1 : NaN; }
  const o = { raw, cap }; curveMemo.set(te, o); return o; }
const ctrl = (te, x, at, kind) => { const cv = curve(te)[kind], off = (at === 'o' ? x - 1 : x) - te; const v = off >= 0 && off < cv.length ? cv[off] : NaN; return isFinite(v) ? v : null; };
function ownOf(i, te, x, at, capIt) { const L = x - te, out = [];
  for (let k = 1; k < T; k += 21) { if (Math.abs(k - te) < 63) continue; const xe = k + L; if (xe > T - 1) break; const e = OO(i, k); if (!(e > 0)) continue; if (hasArtifact(artOf(i), k - 1, xe)) continue;
    const v = exitVal(i, xe, at); if (!(v >= 0)) continue; const g = v / e - 1; out.push(capIt ? Math.min(g, CAP) : g); }
  return out.length ? mean(out) : null; }
const spyRet = (te, x, at) => { const a = SPYC[te - 1] > 0 ? OO(spyI, te) : NaN, b = at === 'o' ? OO(spyI, x) : SPYC[x]; return a > 0 && b > 0 ? b / a - 1 : null; };
function ewPath(pts) { const lv = new Float64Array(T).fill(NaN); if (!pts.length) return lv; lv[pts[0]] = 1;
  for (let j = 1; j < pts.length; j++) { const a = pts[j - 1], b = pts[j]; let s = 0, n = 0;
    for (const i of liqList(a)) { const e = CC(i, a); if (!(e > 0) || hasArtifact(artOf(i), a, b)) continue; const v = vanishedI(i) && b > lastI[i] ? (deadI(i) ? 0 : CC(i, lastI[i])) : lastCloseI(i, b); if (!(v >= 0)) continue; s += Math.min(v / e, 1 + CAP); n++; }
    lv[b] = lv[a] * (n >= 50 ? s / n : 1); }
  return lv; }

// ================= 7. 5-YEAR ONE-SHOT: portfolio vs SPUS / SPY + per-trade =================
const YE = (() => { let k = -1; for (let t = 0; t < T; t++) if (D[t] < SPLIT) k = t; return k; })();
const spyLv = Float64Array.from(SPYC, x => x > 0 ? x : NaN);
function portStats(eq, s0, label, lite = false) { const lv = new Float64Array(T).fill(NaN); lv[s0] = 1; for (let k = s0 + 1; k < T; k++) lv[k] = eq[k];
  const pts = [s0, ...ME.filter(k => k > s0 && k < T - 1), T - 1], ew = lite ? null : ewPath(pts), halves = { older: [s0, YE], newer: [Math.max(YE, s0), T - 1], all: [s0, T - 1] }, out = {};
  for (const [h, [a, b]] of Object.entries(halves)) { if (!(b > a)) { out[h] = null; continue; } const rule = pathStats(lv, a, b), spy = pathStats(spyLv, a, b), spus = pathStats(FUNDC.SPUS, a, b), hlal = pathStats(FUNDC.HLAL, a, b), avg = ew ? pathStats(ew, a, b, pts) : null;
    out[h] = { from: D[a], to: D[b], rule, spy, spus, hlal, avgStock: avg, beatsSpy: !!(rule && spy && rule.cagr > spy.cagr), beatsSpus: !!(rule && spus && rule.cagr > spus.cagr), ddBetterThanSpus: !!(rule && spus && rule.maxDD > spus.maxDD), beatsAvgStock: !!(rule && avg && rule.cagr > avg.cagr) }; }
  return lite ? { halves: out } : { label, halves: out, months: monthly(lv, pts, D), spusMonths: monthly(FUNDC.SPUS, pts, D), monthsBeatingSpus: (() => { const a = monthly(lv, pts, D), b = new Map(monthly(FUNDC.SPUS, pts, D).map(x => [x.m, x.r])); const z = a.filter(x => b.has(x.m)); return z.length ? r4(z.filter(x => x.r > b.get(x.m)).length / z.length) : null; })() }; }
// account extras: calendar-year returns, worst year and CAGR / |max drawdown| of the rule, SPUS and SPY on the same dates (0.4% per side)
const lvOf = (eq, s0) => { const lv = new Float64Array(T).fill(NaN); lv[s0] = 1; for (let k = s0 + 1; k < T; k++) lv[k] = eq[k]; return lv; };
function account(eq, s0) { const lv = lvOf(eq, s0), all = (x) => pathStats(x, s0, T - 1), o = { years: {}, worstYear: {}, retForDD: {}, whole: {} };
  for (const [k, x] of [['rule', lv], ['spus', FUNDC.SPUS], ['spy', spyLv]]) { const yr = yearReturns(x, D, s0), w = all(x); o.years[k] = yr; o.worstYear[k] = worstYear(yr); o.whole[k] = w; o.retForDD[k] = retForDD(w); }
  o.betterRatioThanSpus = !!(o.retForDD.rule !== null && o.retForDD.spus !== null && o.retForDD.rule > o.retForDD.spus); return o; }
const both = (ps, k) => !!(ps && ps.halves.older && ps.halves.newer && ps.halves.older[k] && ps.halves.newer[k]);
// contribution of each stock per half: sum over review periods of (weight at the review x the stock's return to the next review), in points
function attribution(B) { const keys = [...B.wts.keys()].sort((a, b) => a - b), out = { older: {}, newer: {} };
  keys.forEach((te, j) => { const end = j + 1 < keys.length ? keys[j + 1] - 1 : T - 1, h = halfOf(D[te - 1]), { w } = B.wts.get(te);
    for (const [i, wi] of w) { const e = OO(i, te), v = vanishedI(i) && end > lastI[i] ? (deadI(i) ? 0 : CC(i, lastI[i])) : lastCloseI(i, end); if (!(e > 0) || !(v >= 0)) continue; const s = SYMS[i]; out[h][s] = (out[h][s] || 0) + wi * (v / e - 1); } });
  const top = (o) => Object.entries(o).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 8).map(([s, v]) => ({ sym: s, points: r4(v) }));
  return { older: top(out.older), newer: top(out.newer), note: 'sum over review periods of weight x the stock\'s return to the next review (simple points, not compounded)' }; }
const RES = {}, need = IDS.filter(id => !(id in FROZEN)), TRADES = {}, BUILT = {};
for (const id of IDS) { const B = build(id); BUILT[id] = B; if (B.start === null) { RES[id] = { verdict: 'TOO FEW CASES', why: 'no formation possible' }; continue; }
  const s0 = B.start, first = s0 + 1, S = simulate({ T, start: first, events: B.events, px: pxApi, side: SIDE }), SS = simulate({ T, start: first, events: B.events, px: pxApi, side: SIDE_STRESS });
  const avgEq = mean([...S.eq].filter(x => x > 0)), P = { standard: portStats(S.eq, s0, '0.4% per side'), stress: portStats(SS.eq, s0, '0.6% per side'), turnoverPerYear: r4(S.traded / avgEq / ((T - first) / YEAR)), costPaid: r4(S.costPaid), rebalances: B.events.size };
  P.beatsSpyBothHalves = both(P.standard, 'beatsSpy'); P.beatsSpyBothHalvesStress = both(P.stress, 'beatsSpy');
  Object.assign(P, account(S.eq, s0), { trend: B.trend || undefined, investedNow: B.investedNow });
  P.beatsSpusBothHalves = both(P.standard, 'beatsSpus'); P.beatsSpusBothHalvesStress = both(P.stress, 'beatsSpus'); P.ddBetterThanSpusBothHalves = both(P.standard, 'ddBetterThanSpus');
  let art = 0; const tr = [];
  for (const z of periodPieces(S.trades, B.reviews)) { const { i, te, x, at } = z; if (hasArtifact(artOf(i), te - 1, x)) { art++; continue; }
    const pIn = z.pxIn > 0 ? z.pxIn : (OO(i, te) > 0 ? OO(i, te) : lastCloseI(i, te - 1)), v = z.kind === 'dead' ? 0 : z.pxOut !== null ? z.pxOut : exitVal(i, x, at); if (!(pIn > 0) || !(v >= 0)) continue;
    const g = v / pIn - 1, days = at === 'o' ? x - te : x - te + 1;
    tr.push({ t: te - 1, s: SYMS[i], i, half: halfOf(D[te - 1]), sig: D[te - 1], buy: D[te], sell: D[x], at, kind: z.kind, gRaw: g, g: Math.min(g, CAP), c: ctrl(te, x, at, 'cap') ?? NaN, cRaw: ctrl(te, x, at, 'raw') ?? NaN,
      own: ownOf(i, te, x, at, true), ownRaw: ownOf(i, te, x, at, false), spy: spyRet(te, x, at), days, unitYears: Math.max(1, days) / YEAR }); }
  tr.sort((a, b) => a.t - b.t || (a.s < b.s ? -1 : 1));
  const by = { older: tr.filter(z => z.half === 'older'), newer: tr.filter(z => z.half === 'newer') };
  const R = { older: halfStat(by.older, BLOCK), newer: halfStat(by.newer, BLOCK), all: halfStat(tr, BLOCK) };
  const pyOf = (a, key, cost) => { const y = a.reduce((s, z) => s + z.unitYears, 0), v = a.filter(z => ok(z[key])); return v.length && y > 0 ? r4(v.reduce((s, z) => s + z[key] - cost, 0) / v.reduce((s, z) => s + z.unitYears, 0)) : null; };
  const PY = Object.fromEntries(['older', 'newer'].map(h => [h, { rule: pyOf(by[h], 'g', COST), spy: pyOf(by[h], 'spy', 0), avgStock: pyOf(by[h], 'c', 0) }]));
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks held as long on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] } });
  const raw = (a) => a.map(z => ({ ...z, g: z.gRaw, c: z.cRaw, own: z.ownRaw })), RU = { older: halfStat(raw(by.older), BLOCK), newer: halfStat(raw(by.newer), BLOCK) };
  const vu = judgeHold(RU, { bar: BAR, perYear: { older: [pyOf(raw(by.older), 'g', COST), PY.older.spy], newer: [pyOf(raw(by.newer), 'g', COST), PY.newer.spy] } });
  RES[id] = { ...v, name: RULES[id].name, hold: periodHold(id), holdMedianSessions: median(tr.filter(z => z.kind !== 'open').map(z => z.days)), cost: COST, split: SPLIT, start: D[s0], results: R, perYear: PY, portfolio: P,
    uncappedSensitivity: { verdict: vu.verdict, older: { avg: RU.older.avg, edge: RU.older.edge, tBlock: RU.older.tBlock }, newer: { avg: RU.newer.avg, edge: RU.newer.edge, tBlock: RU.newer.tBlock } },
    counts: { periods: tr.length, holdings: S.trades.length, stillHeld: tr.filter(z => z.kind === 'open').length, dead: tr.filter(z => z.kind === 'dead').length, gone: tr.filter(z => z.kind === 'gone').length, splitArtifactsLeftOut: art, stocks: new Set(tr.map(z => z.s)).size } };
  TRADES[id] = tr.map(z => ({ s: z.s, sig: z.sig, buy: z.buy, sell: z.sell, kind: z.kind, net: r4(z.gRaw - COST), avgStock: r4(ok(z.cRaw) ? z.cRaw - COST : null), sameStock: r4(z.ownRaw === null ? null : z.ownRaw - COST), spy: r4(z.spy), days: z.days }));
  const f = (h) => (h.n || 0) + ' (' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tB ' + h.tBlock;
  const ph = (h) => { const x = P.standard.halves[h]; return x ? 'CAGR ' + pc(x.rule && x.rule.cagr) + ' vs SPUS ' + pc(x.spus && x.spus.cagr) + ' SPY ' + pc(x.spy && x.spy.cagr) + ' DD ' + pc(x.rule && x.rule.maxDD) + '/' + pc(x.spus && x.spus.maxDD) : 'n/a'; };
  log('- ' + id + ': ' + RES[id].verdict + ' | trades older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | PORTFOLIO older ' + ph('older') + ' | newer ' + ph('newer') + ' | beats SPUS both: ' + P.beatsSpusBothHalves + ', SPY both: ' + P.beatsSpyBothHalves + ' | ' + String(RES[id].why).slice(0, 200)); }

// ================= 8. FREEZE =================
const complete = T >= 1000 && STATUS.facts.ok && STATUS.cikCover.ok && STATUS.sic.ok && STATUS.tickerMap.ok && STATUS.domicile.ok && STATUS.splits.ok && STATUS.altShares.ok && STATUS.shFacts.ok && STATUS.funds.ok && STATUS.depth.ok;
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k, r]) => need.includes(k) && complete && r.results).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], to: D[T - 1], bar: BAR, ...r }])), (r) => r.verdict !== 'TOO FEW CASES');

fs.writeFileSync(OUT, JSON.stringify({ ...PREV, generatedAt: new Date().toISOString(), complete, data: STATUS, firstRun, partial: 'written right after the freeze; the full output follows at the end of the run' }, null, 1));   // early save: a later crash cannot lose the frozen verdicts

// ================= 8b. THE OWNER'S ANSWER (pre-registered in squad17-core.mjs; information, not a per-period verdict) =================
// SPUS alone, SQ10-SH20-C15 (re-run here) and SQ17-MIX50, all from the same first trade session, 0.4% per side on real turnover
const CORE = {}; { const opts = [];
  for (const id of ['BASE-SPUS', 'BASE-SH20C15', 'SQ17-MIX50']) { const B = id.startsWith('BASE') ? build(id) : BUILT[id]; if (!B || B.start === null) continue;
    const S = simulate({ T, start: B.start + 1, events: B.events, px: pxApi, side: SIDE }), ps = portStats(S.eq, B.start, '', true), A = account(S.eq, B.start), avgEq = mean([...S.eq].filter(x => x > 0));
    const W = A.whole.rule; CORE[id] = { label: { 'BASE-SPUS': 'SPUS alone (bought once, held)', 'BASE-SH20C15': 'SQ10-SH20-C15 (halal top 20, capped 15%, quarterly)', 'SQ17-MIX50': '50% SPUS + 50% SQ10-SH20-C15, quarterly' }[id], from: D[B.start], cagr: W && W.cagr, maxDD: W && W.maxDD, retForDD: A.retForDD.rule,
      worstYear: A.worstYear.rule, years: A.years.rule, older: ps.halves.older && ps.halves.older.rule, newer: ps.halves.newer && ps.halves.newer.rule, turnoverPerYear: r4(S.traded / avgEq / ((T - B.start - 1) / YEAR)) };
    if (W) opts.push({ id, cagr: W.cagr, maxDD: W.maxDD }); }
  CORE.best = bestCore(opts); CORE.rule = 'highest whole-window CAGR / |max drawdown| after 0.4% per side; within 0.05 of the best: the smaller drawdown (pre-registered)';
  // rules 2-4 next to them (named instead only if they beat SPUS in both halves AND have the higher ratio than SPUS on their own dates)
  CORE.others = Object.fromEntries(IDS.filter(id => id !== 'SQ17-MIX50' && RES[id] && RES[id].portfolio).map(id => { const P = RES[id].portfolio; return [id, { from: RES[id].start, cagr: P.whole.rule && P.whole.rule.cagr, maxDD: P.whole.rule && P.whole.rule.maxDD, retForDD: P.retForDD.rule, spusSameDates: P.retForDD.spus, beatsSpusBothHalves: P.beatsSpusBothHalves, worstYear: P.worstYear.rule }]; }));
  CORE.challenger = Object.entries(CORE.others).filter(([, o]) => o.beatsSpusBothHalves && o.retForDD !== null && o.spusSameDates !== null && o.retForDD > o.spusSameDates && o.retForDD > ((CORE[CORE.best] || {}).retForDD ?? Infinity)).map(([k]) => k);
  log('OWNER ANSWER: best = ' + CORE.best + ' | ' + ['BASE-SPUS', 'BASE-SH20C15', 'SQ17-MIX50'].map(k => CORE[k] ? k + ' CAGR ' + pc(CORE[k].cagr) + ' DD ' + pc(CORE[k].maxDD) + ' ratio ' + CORE[k].retForDD + ' worst ' + (CORE[k].worstYear ? CORE[k].worstYear.y + ' ' + pc(CORE[k].worstYear.r) : 'n/a') : k + ' n/a').join(' | ') + ' | challengers: ' + (CORE.challenger.join(', ') || 'none')); }

// ================= 9. TODAY (current holdings with weights) + PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const seen = new Set(lines.map(x => x.type + '|' + x.id)), newLines = [], today = {}, board = {};
const holdingsNow = (B) => { const lastTe = B.reviews[B.reviews.length - 1], L = B.wts.get(lastTe); if (!L || !L.w.size) return { lastReview: D[lastTe], members: [], cash: 1 };
  const cash0 = Math.max(0, 1 - [...L.w.values()].reduce((a, b) => a + b, 0)), drift = [...L.w].map(([i, w]) => { const e = OO(i, lastTe), p = lastCloseI(i, T - 1); return { i, w, v: e > 0 && p > 0 ? w * p / e : 0 }; }), tot = drift.reduce((a, z) => a + z.v, 0) + cash0;
  return { lastReview: D[lastTe], cash: r4(cash0 / tot), members: drift.map(z => ({ sym: SYMS[z.i], weightNow: r4(z.v / tot), weightAtReview: r4(z.w), close: r4(lastCloseI(z.i, T - 1)), zad: z.i === SPUSI ? 'fund (halal ETF)' : ZADM(SYMS[z.i]), screener: z.i === SPUSI ? null : screener(SYMS[z.i]) })).sort((a, b) => b.weightNow - a.weightNow) }; };
for (const id of IDS) { const B = BUILT[id]; if (!B || B.start === null) continue; const S = simulate({ T, start: B.start + 1, events: B.events, px: pxApi, side: SIDE }), H = holdingsNow(B);
  const SL = shariahList(T - 1).rows, R = RULES[id], fw = R.kind === 'tf' ? c15(SL.slice(0, R.n)) : weightsFor(id, SL.map(r => ({ ...r, mom: mom121(cl(r.i), T - 1) })), SPUSI);
  const fresh = [...fw].map(([i, w]) => ({ sym: SYMS[i], weight: r4(w), zad: i === SPUSI ? 'fund (halal ETF)' : ZADM(SYMS[i]) })).sort((a, b) => b.weight - a.weight);
  const used = new Set(H.members.map(m => m.sym)), reserves = R.kind === 'mom' ? [] : SL.filter(r => !used.has(r.sym)).slice(0, 5).map(r => ({ sym: r.sym, zad: ZADM(r.sym), screener: screener(r.sym) }));
  const fr = firstRun[id] || {}, paper = S.trades.filter(z => D[z.te] >= START);
  for (const z of paper) { const sid = id + '|' + SYMS[z.i] + '|' + D[z.te];
    if (!seen.has('signal|' + sid)) { seen.add('signal|' + sid); newLines.push({ type: 'signal', id: sid, m: id, sym: SYMS[z.i], d: D[z.te - 1], buy: D[z.te], px: r4(z.pxIn), halal: ZADM(SYMS[z.i]), recordedAfter: D[T - 1] }); }
    if (z.kind !== 'open' && !seen.has('result|' + sid)) { seen.add('result|' + sid); const g = (z.kind === 'dead' ? 0 : z.pxOut) / z.pxIn - 1, c = ctrl(z.te, z.x, z.at, 'raw');
      newLines.push({ type: 'result', id: sid, m: id, sym: SYMS[z.i], d: D[z.te - 1], buy: D[z.te], sell: D[z.x], kind: z.kind, g: r4(g), net: r4(g - COST), avgStock: c === null ? null : r4(c - COST) }); } }
  const closed = [...lines, ...newLines].filter(x => x.type === 'result' && x.m === id).map(x => ({ d: x.d, sym: x.sym, g: x.g, c: x.avgStock === null ? NaN : x.avgStock + COST })), st = boardStats(closed);
  today[id] = { name: R.name, hold: periodHold(id), tier: fr.verdict || null, every: R.every === 'y' ? 'yearly' : 'quarterly', lastReview: H.lastReview,
    newSignals: [], members: H.members, cash: H.cash, investedNow: R.kind === 'tf' ? B.investedNow : undefined, reserves, freshAtLastClose: fresh,
    beatsSpusBothHalves: fr.portfolio ? fr.portfolio.beatsSpusBothHalves : null, portfolioValueSinceStart: r4(S.eq[T - 1]),
    nextReview: R.every === 'y' ? 'first session of January' : 'first session of the next quarter (Jan / Apr / Jul / Oct)' + (R.kind === 'tf' ? '; plus the SPUS 10-month check at every month end' : '') };
  board[id] = { name: R.name, paperEntries: paper.length, open: paper.filter(z => z.kind === 'open').length, closed: st, ready: paperReady(st), fiveYear: fr.verdict ? { verdict: fr.verdict, beatsSpusBothHalves: fr.portfolio ? fr.portfolio.beatsSpusBothHalves : null, beatsSpyBothHalves: fr.portfolio ? fr.portfolio.beatsSpyBothHalves : null } : null }; }
// the owner's core option today (the pre-registered best of SPUS / SH20-C15 / MIX50): exact holdings and weights
let ownerCore = null; { const id = CORE.best; let hold = null;
  if (id === 'BASE-SPUS') hold = { members: [{ sym: 'SPUS', weightNow: 1, zad: 'fund (halal ETF)' }], cash: 0 };
  else if (id === 'SQ17-MIX50') hold = holdingsNow(BUILT['SQ17-MIX50']);
  else if (id === 'BASE-SH20C15') hold = holdingsNow(build('BASE-SH20C15'));
  ownerCore = { best: id, label: CORE[id] ? CORE[id].label : null, ...(hold || {}), note: 'weights = what the rule holds at the last close (set at the last quarterly review, drifted with prices). Buy the whole set in these proportions; a name ZAD marks not halal is replaced by the first halal reserve of SQ10-SH20-C15; zad unknown = check in ZAD first.' }; }
// scan.mjs does not read this lab (core-holding study, not TRY SMALL): newSignals are left empty on purpose
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
const NOTE = 'PAPER ONLY. Squad 17 halal core holding (SQ17-*). Core-holding study, NOT a TRY SMALL lab. members = what each rule holds now with its weight today (set at the last review, then drifted); a basket is owned WHOLE. The Shariah screen is a point-in-time PROXY of the S&P / Dow Jones method, NOT ZAD: zad = the owner\'s ZAD mark (data/halal.json + zad-list); "unknown" must be checked in ZAD before any real buy. ownerCore = the pre-registered best core option (SPUS alone / SQ10-SH20-C15 / SQ17-MIX50) with today\'s holdings.';
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, note: NOTE, ownerCore, methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.length + ' new line(s)');

// ================= 10. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'squad17-core.mjs RULES + data/strategy-library.json SQ17-* (24 Oct 2026, before any run)', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, stress: STRESS, sideCost: SIDE, sideStress: SIDE_STRESS, complete, data: STATUS, diagnostics: DIAGS,
  standard: 'PORTFOLIO (primary for this squad): CAGR per half (start - last close of 2023 / 2024 - last close) after 0.4% per side on all turnover (stress 0.6%) vs SPUS (primary) and SPY, price only for all; max drawdown; beatsSpusBothHalves / beatsSpyBothHalves. PER TRADE (TRY SMALL reads this; identical to Squad 5): each holding period = one trade, both halves: > 0 after 0.8% and 1.2%, better than the average liquid stock and than the same stock held as long on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= ' + TIER2_T + ' (63-session blocks) -> TRADABLE SMALL; >= ' + BAR + ' -> PROVEN; plus return per year of capital above SPY in both halves. Gross returns capped at +300% both sides (AUD-1).',
  halalNote: 'The Shariah screen is a point-in-time PROXY (SIC business screen; debt, cash + short-term investments and receivables each < 33% of the 36-month average market value; interest income < 5% of revenue), NOT the ZAD status: no point-in-time ZAD history exists in the repository. Today\'s members carry the owner\'s ZAD mark and the HalalScreener result.',
  ownerAnswer: CORE, firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, r])) }), trades: TRADES };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result || !r.results) continue; const R = r.results, P = r.portfolio || {}, H = (h) => ((P.standard || {}).halves || {})[h] || {};
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; portfolio ' + (P.beatsSpusBothHalves ? 'beat' : 'did not beat') + ' SPUS in both halves; forward paper lane from 26 Oct 2026'; e.tested = String(r.to); e.study = 'squad10-lab.mjs -> data/squad10-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock],
      portfolioCagr: [H('older').rule ? H('older').rule.cagr : null, H('newer').rule ? H('newer').rule.cagr : null], spusCagr: [H('older').spus ? H('older').spus.cagr : null, H('newer').spus ? H('newer').spus.cagr : null], spyCagr: [H('older').spy ? H('older').spy.cagr : null, H('newer').spy ? H('newer').spy.cagr : null],
      beatsSpusBothHalves: P.beatsSpusBothHalves, beatsSpyBothHalves: P.beatsSpyBothHalves, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad17-lab: library not updated: ' + e.message); }
console.log('SQUAD 17 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + (complete ? '' : ' | INCOMPLETE: ' + Object.entries(STATUS).filter(([, s]) => s && s.ok === false).map(([k]) => k).join(', ')));
