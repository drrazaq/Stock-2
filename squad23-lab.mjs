// SQUAD 23 LAB: "A SECOND HALAL BASKET THAT ADDS DIVERSIFICATION TO BASKET 1" (25 Oct 2026). BASKET study: NOT a TRY SMALL lab
// (scan.mjs does not read data/squad23-*; newSignals stay empty). Research + a forward paper record; never places an order; no Telegram.
// Rules: squad23-core.mjs (SQ23-*, pre-registered 25 Oct 2026 before any run; the lab writes the same rule text into
// data/strategy-library.json before computing anything). Basket 1 = SQ10-SH20-C15 (the 20 largest Shariah-screened US companies,
// cap-weighted, max 15%, quarterly).
// Builds on Squad 10 / 17: their data machinery is COPIED unchanged (whole-market price cache with dead stocks, historical SEC ticker map by
// CIK, company facts, share counts, split list incl. implied splits, renamed giants, US domicile, SIC, the Shariah screen) and their caches
// are copied into this lab's own cache (squad23-cache) by the workflow. The Shariah list is walked until 500 companies pass (SQ23-MIDQ).
// 1. 5-YEAR ONE-SHOT of every SQ23 rule not yet frozen: (1) alone as an account vs SPUS / SPY per half, worst fall, worst year; (2) 70% Basket
//    1 + 30% the candidate vs Basket 1 alone (CAGR / |max drawdown| per half, correlation); first complete verdict frozen in firstRun.
// 2. TODAY: data/squad23-today.json (each candidate's current holdings in WHOLE percentages with the ZAD mark), board, paper marks.
// DIAG=1: data coverage (Shariah depth to 500, gross-profitability coverage, fund rows) and basket structure only; no returns, nothing judged.
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
import { RULES, IDS, FUND, INFO_FUNDS, SHARE, SHN_MAX, MID, preRegister, b1Weights, candWeights, comboWeights, overlap, gpaAt, retForDD, comboBetter, corr, yearReturns, worstYear, wholePct } from './squad23-core.mjs';
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ23_CACHE || 'squad23-cache', SC4 = env.SQ4_CACHE || 'squad4-cache', SC5 = env.SQ5_CACHE || 'squad5-cache';
const OUT = env.SQ23_OUT || 'data/squad23-lab.json', PAPER = env.SQ23_PAPER || 'data/squad23-paper.jsonl', TODAY = env.SQ23_TODAY || 'data/squad23-today.json', BOARD = env.SQ23_BOARD || 'data/squad23-board.json', LIB = env.SQ23_LIB || 'data/strategy-library.json';
const START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ23_MINUTES || 100) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ23 entries written now'); }

// ================= 1. PRICES (as squad4-lab) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad23-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
const CANDS = 1600;   // squad 23: domicile, SIC and Shariah facts for the 1,600 largest at every quarter start (the walk to 500 passes)
const FUNDS = ['SPUS', 'HLAL', 'UMMA', 'GLD', 'SPWO']; for (const f of FUNDS) if (!SY.has(f)) SY.set(f, SY.size);   // funds held as securities (filled from their own bars below if the cache lacks them)
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
if (spyI === undefined) { console.log('squad23-lab: SPY missing from the cache; nothing done'); process.exit(0); }
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

// ---- FUNDS (price only): SPUS / HLAL (yardsticks), UMMA (SQ23-WORLD), GLD (SQ23-GOLD), SPWO (information: listed 20 Dec 2023) ----
const NQ_HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
async function getJ(url, headers = {}) { if (OFFLINE) return null; for (let a = 0; a < 3; a++) { try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(45000) }); if (r.status === 404) return null; if (r.status === 429 || r.status >= 500) { await sleep(2500 * (a + 1)); continue; } if (!r.ok) return null; return await r.json(); } catch (e) { await sleep(2000 * (a + 1)); } } return null; }
const nnum = (v) => { const x = parseFloat(String(v || '').replace(/[$,]/g, '')); return isFinite(x) && x > 0 ? x : NaN; };
async function fundBars(sym) { const j = await api('/v2/aggs/ticker/' + sym + '/range/1/day/2019-01-01/' + iso(Date.now()) + '?adjusted=true&sort=asc&limit=50000');
  if (j && Array.isArray(j.results) && j.results.length > 100) return j.results.map(b => ({ d: iso(b.t), o: b.o, c: b.c }));
  const q = await getJ(NQ + '/api/quote/' + sym + '/historical?assetclass=etf&fromdate=2019-01-01&todate=' + iso(Date.now()) + '&limit=9999', NQ_HEAD), rows = q && q.data && q.data.tradesTable && q.data.tradesTable.rows;
  if (!Array.isArray(rows) || rows.length < 100) return null; return rows.map(r => { const m = String(r.date || '').match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m ? { d: m[3] + '-' + m[1] + '-' + m[2], o: nnum(r.open), c: nnum(r.close) } : null; }).filter(b => b && b.c > 0).sort((a, b) => a.d < b.d ? -1 : 1); }
// each fund is a security: when its own bars exist (Massive, else Nasdaq), its row is written from them (open + close); else the cache row stays
const FUNDC = {}; STATUS.fundRows = {};
for (const f of FUNDS) { const i = SY.get(f), b = await fundBars(f); let n = 0;
  if (b && b.length > 100) { const m = new Map(b.map(x => [x.d, x])); for (let t = 0; t < T; t++) { const x = m.get(D[t]), k = i * T + t; if (x && x.c > 0) { CA[k] = x.c; OA[k] = x.o > 0 ? x.o : x.c; n++; } else if (!(CA[k] > 0)) { CA[k] = NaN; OA[k] = NaN; } } }
  lastI[i] = -1; for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; }
  const arr = new Float64Array(T).fill(NaN); let first = -1, have = 0; for (let t = 0; t < T; t++) { const v = CC(i, t); if (v > 0) { arr[t] = v; have++; if (first < 0) first = t; } } FUNDC[f] = arr;
  STATUS.fundRows[f] = { fromBars: n, first: first >= 0 ? D[first] : null, last: lastI[i] >= 0 ? D[lastI[i]] : null, sessions: have, coverSinceFirst: first >= 0 ? r4(have / (T - first)) : 0 }; }
const SPUSI = SY.get('SPUS'), FR = STATUS.fundRows, fullOk = (f) => FR[f] && FR[f].last === D[T - 1] && FR[f].coverSinceFirst >= 0.98;
STATUS.funds = { ok: ['SPUS', 'HLAL', 'GLD'].every(f => fullOk(f) && FR[f].sessions > T * 0.9) && fullOk('UMMA') && FR.UMMA.first <= '2022-03-31', ...FR };
log('funds: ' + JSON.stringify(STATUS.funds));

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
  if (todo.length && !OFFLINE) { const zip = SC + '/companyfacts.zip'; let zipOk = false;
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
// (squad 23: also the CANDS largest at every quarter start and the last close, so the Shariah walk to 500 passes uses US companies only)
{ const want = new Set(); for (const t of [...MS.filter(x => x >= 19), T - 1]) for (const r of byCap(rowsAt(t, false).rows).slice(0, 700)) if (!(r.cik in SUBS)) want.add(r.cik);
  for (const t of [...MS.filter(x => x >= 19 && isQuarterMonth(D[x])), T - 1]) for (const r of byCap(rowsAt(t, false).rows).slice(0, CANDS)) if (!(r.cik in SUBS)) want.add(r.cik);
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
{ const want = new Set(); for (const t of [...QS, T - 1]) for (const r of universe(t).ranked.slice(0, CANDS)) if (!sicAt(r.i, r.cik) && !(r.cik in SICC)) want.add(r.cik);
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

// ================= 4b. SHARIAH SCREEN + GROSS PROFIT DATA (own cache shfacts-sq23: the Shariah items + gross profit / cost of revenue /
// total assets of the CANDS largest at every quarter start; the SEC bulk companyfacts file when many are missing, else the API) =================
const GP_TAGS = { gp: ['GrossProfit'], cogs: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'], assets: ['Assets'] };
const SHALL = [...new Set([...Object.values(SH_TAGS).flat(), ...Object.values(GP_TAGS).flat()])], SHF = JZ(SC + '/shfacts-sq23.json.gz', {});
function compactSH(j) { const g = j && j.facts && j.facts['us-gaap'], out = {}; if (!g) return out;
  for (const tag of SHALL) { const u = g[tag] && g[tag].units && g[tag].units.USD; if (!Array.isArray(u)) continue; const rows = [], seen = new Set();
    for (const x of u) { if (!x || !x.end || !x.filed || !isFinite(x.val) || x.end < '2017-01-01') continue;
      if (x.start) { const dd = (Date.parse(x.end) - Date.parse(x.start)) / 864e5 + 1; if (!((dd >= 80 && dd <= 100) || (dd >= 170 && dd <= 190) || (dd >= 260 && dd <= 285) || (dd >= 350 && dd <= 380))) continue; }
      const k = (x.start || '') + '|' + x.end + '|' + x.val + '|' + x.filed; if (seen.has(k)) continue; seen.add(k); rows.push([x.start || '', x.end, x.val, x.filed]); }
    if (rows.length) out[tag] = rows; }
  return out; }
{ const want = new Set(); for (const t of [...QS, T - 1]) for (const r of universe(t).ranked.slice(0, CANDS)) if (!(r.cik in SHF)) want.add(r.cik);
  const todo = [...want]; let got = 0, fail = 0, mode = 'cache';
  if (todo.length && !OFFLINE) { const zip = SC + '/companyfacts-sq23.zip'; let zipOk = false;
    if (todo.length > 300 && !local(env.SEC_BASE)) zipOk = download(SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip', zip) && fs.statSync(zip).size > 1e8;
    if (zipOk) { mode = 'bulk'; const tmp = SC + '/cf-tmp23';
      for (let a = 0; a < todo.length; a += 300) { const part = todo.slice(a, a + 300), names = part.map(c => 'CIK' + c.padStart(10, '0') + '.json'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
        try { execFileSync('unzip', ['-o', '-qq', zip, ...names, '-d', tmp], { stdio: 'ignore', maxBuffer: 1e8 }); } catch (e) {}
        for (const c of part) { const f = tmp + '/CIK' + c.padStart(10, '0') + '.json'; let j = null; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {} SHF[c] = j ? compactSH(j) : {}; if (j) got++; else fail++; } }
      fs.rmSync(tmp, { recursive: true, force: true }); }
    else { mode = 'api'; for (const c of todo) { if (left() < 60 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null;
      try { r = await fetch(SECD + '/api/xbrl/companyfacts/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) }); } catch (e) {}
      if (r && r.ok) { const j = await r.json().catch(() => null); if (j) { SHF[c] = compactSH(j); got++; } else fail++; } else if (r && r.status === 404) SHF[c] = {}; else fail++; } }
    try { fs.unlinkSync(zip); } catch (e) {}
    if (got) WZ(SC + '/shfacts-sq23.json.gz', SHF); }
  const still = todo.filter(c => !(c in SHF)).length;
  STATUS.shFacts = { ok: still <= Math.max(3, want.size * 0.01), wantedNow: want.size, fetchedNow: got, notInSec: fail, missing: still, known: Object.keys(SHF).length, mode }; log('Shariah + gross profit facts: ' + JSON.stringify(STATUS.shFacts)); }
const shMemo = new Map(); function shOf(cik) { if (shMemo.has(cik)) return shMemo.get(cik); const a = SHF[cik]; let o = null;
  if (a) { o = {}; for (const [g, tags] of Object.entries(SH_TAGS)) { o[g] = {}; for (const t of tags) if (a[t]) o[g][t] = a[t].map(([s0, e, v, f]) => ({ s: s0, e, v, f })); } } shMemo.set(cik, o); return o; }
const gpCo = new Map(); function gpaOf(cik, t) { let o = gpCo.get(cik);
  if (o === undefined) { const a = SHF[cik], grp = (tags) => Object.fromEntries(tags.filter(x => a[x]).map(x => [x, a[x].map(([s0, e, v, f]) => ({ s: s0, e, v, f }))]));
    o = a ? { gp: grp(GP_TAGS.gp), cogs: grp(GP_TAGS.cogs), assets: grp(GP_TAGS.assets), rev: grp(SH_TAGS.rev) } : null; gpCo.set(cik, o); }
  return o ? gpaAt(o, D[t]) : null; }
// market value at every month start by company (for the 36-month average)
const capMS = new Map(); for (const t of MS) if (t >= startT) capMS.set(t, new Map(universe(t).ranked.map(r => [r.cik, r.cap])));
function mvAvg(cik, t, cur) { const prev = MS.filter(m => m >= startT && m < t).slice(-(AVG_MONTHS - 1)).map(m => capMS.get(m).get(cik)); return avgLast([...prev, cur], AVG_MONTHS); }
// the companies passing the screen at t, largest first (up to SHN_MAX = 500), with the reasons the others failed
const listMemo = new Map();
function shariahList(t) { if (listMemo.has(t)) return listMemo.get(t); const rows = [], why = {}; let walkedN = 0;
  for (const r of universe(t).ranked) { if (rows.length >= SHN_MAX) break; walkedN++; const sic = sicAt(r.i, r.cik), co = shOf(r.cik);
    const b = co ? balanceAt(co, D[t]) : { debt: null, cashInv: null, recv: null, intInc: null, rev: null }, avg = mvAvg(r.cik, t, r.cap);
    const v = co ? shariahPass({ sic, mvAvg: avg, ...b }) : { ok: false, why: 'no SEC facts fetched' };
    if (v.ok) rows.push({ key: r.i, i: r.i, cik: r.cik, sym: SYMS[r.i], cap: r.cap, mom: mom121(cl(r.i), t) }); else why[v.why] = (why[v.why] || 0) + 1; }
  const o = { rows, why, depth: walkedN }; listMemo.set(t, o); return o; }
STATUS.impliedSplits = { ok: true, list: IMPLIED };
{ const bad = []; let maxDepth = 0; for (const t of [...QS, T - 1]) { const L = shariahList(t); maxDepth = Math.max(maxDepth, L.depth); if (L.rows.length < SHN_MAX || L.depth > CANDS || L.why['no SEC facts fetched']) bad.push(D[t] + ' ' + L.rows.length + '/' + L.depth + (L.why['no SEC facts fetched'] ? ' nofacts ' + L.why['no SEC facts fetched'] : '')); }
  STATUS.depth = { ok: bad.length === 0, maxRankWalked: maxDepth, candidatesWithFacts: CANDS, bad: bad.slice(0, 20) }; log('Shariah list depth: ' + JSON.stringify(STATUS.depth)); }
// DATA GUARD (set before any result): gross profitability must be known for at least half of Shariah ranks 101-500 at every review
{ const per = []; for (const t of QS) { const rows = shariahList(t).rows.slice(MID[0], MID[1]); const k = rows.filter(r => gpaOf(r.cik, t) !== null).length; per.push({ d: D[t], ranks: rows.length, withGpa: k, share: r4(rows.length ? k / rows.length : 0) }); }
  STATUS.gp = { ok: per.length > 0 && per.every(x => x.ranks >= MID[1] - MID[0] && x.share >= 0.5), per }; log('gross profitability coverage: ' + JSON.stringify(per.map(x => x.d + ' ' + x.withGpa + '/' + x.ranks))); }
DIAGS.shariah = [...QS.filter(t => D[t].slice(5, 7) === '01'), T - 1].map(t => { const L = shariahList(t); return { date: D[t], passing: L.rows.length, walked: L.depth, outReasons: L.why, top20: L.rows.slice(0, 20).map(r => r.sym), ranks21to30: L.rows.slice(20, 30).map(r => r.sym) }; });

// ================= 5. THE BASKETS =================
const pxApi = { o: (i, k) => OO(i, k), c: (i, k) => CC(i, k), last: (i) => lastI[i], vanished: vanishedI, dead: deadI };
const fundOf = (id) => id === 'INFO-SPWO' ? 'SPWO' : FUND[id] || null;
const b1Memo = new Map(), b1At = (t) => { if (!b1Memo.has(t)) { const rows = shariahList(t).rows; b1Memo.set(t, rows.length >= 20 ? b1Weights(rows) : null); } return b1Memo.get(t); };
function candAt(id, t) { const f = fundOf(id); if (f) { const fi = SY.get(f); return t + 1 < T && OO(fi, t + 1) > 0 ? new Map([[fi, 1]]) : null; }
  if (RULES[id].mom && t < 252) return null; let rows = shariahList(t).rows;
  if (id === 'SQ23-MIDQ') rows = rows.map((r, j) => j >= MID[0] && j < MID[1] ? { ...r, gpa: gpaOf(r.cik, t) } : r);
  return candWeights(id, rows); }
// build(id) -> { start (formation session of the first review), alone / combo / base event maps (trade session -> reset), wts, overlaps }
// alone: the candidate as its own account (a fund: bought once and held); combo: 70% Basket 1 + 30% candidate reset every quarter;
// base: Basket 1 alone from the same session. A later review where a stock rule cannot form keeps its previous weights.
function build(id) { const alone = new Map(), combo = new Map(), base = new Map(), wts = new Map(), ovl = []; let first = null, lastC = null; const isFund = !!fundOf(id);
  for (const t of QS) { if (!(t + 1 < T)) continue; const B = b1At(t); if (!B) continue; const wC = candAt(id, t);
    if (first === null) { if (!wC) continue; first = t; }
    if (wC) lastC = wC; const use = lastC;
    if (wC && (!isFund || alone.size === 0)) alone.set(t + 1, { kind: 'reset', w: wC });
    combo.set(t + 1, { kind: 'reset', w: comboWeights(B, use) }); base.set(t + 1, { kind: 'reset', w: B }); wts.set(t + 1, { t, w: use, fresh: !!wC });
    const o = overlap(B, use); if (o.length) ovl.push(D[t] + ': ' + o.map(i => SYMS[i]).join(' ')); }
  return { start: first, alone, combo, base, wts, overlaps: ovl }; }
const ALL = [...IDS, 'INFO-SPWO'], BUILT = {}; for (const id of ALL) BUILT[id] = build(id);
const complete = T >= 1000 && STATUS.facts.ok && STATUS.cikCover.ok && STATUS.sic.ok && STATUS.tickerMap.ok && STATUS.domicile.ok && STATUS.splits.ok && STATUS.altShares.ok && STATUS.shFacts.ok && STATUS.funds.ok && STATUS.depth.ok && STATUS.gp.ok;
if (DIAG) { console.log('SQUAD 23 DIAGNOSTICS (data coverage and basket structure only; no returns computed, nothing judged)');
  DIAGS.structure = {}; for (const id of ALL) { const B = BUILT[id], ks = [...B.combo.keys()].sort((a, b) => a - b);
    DIAGS.structure[id] = { start: B.start === null ? null : D[B.start], reviews: ks.length, aloneEvents: B.alone.size, overlapsWithBasket1: B.overlaps,
      perReview: ks.map(k => { const x = B.wts.get(k), w = x.w, c = B.combo.get(k).w; return D[k] + ' n' + w.size + (x.fresh ? '' : ' (kept)') + ' max' + r4(Math.max(0, ...w.values())) + ' combo n' + c.size + ' sum' + r4([...c.values()].reduce((a, b) => a + b, 0)); }),
      lastMembers: ks.length ? [...B.wts.get(ks[ks.length - 1]).w.keys()].map(i => SYMS[i]) : [] }; }
  DIAGS.complete = complete; fs.writeFileSync('data/squad23-diag.json', JSON.stringify(DIAGS, null, 1)); console.log(JSON.stringify({ complete, data: Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v && v.ok])), structure: Object.fromEntries(Object.entries(DIAGS.structure).map(([k, v]) => [k, { start: v.start, reviews: v.reviews, overlaps: v.overlapsWithBasket1.length, last: v.perReview.slice(-1)[0] }])) }, null, 1)); process.exit(0); }

// ================= 6. 5-YEAR ONE-SHOT: alone vs SPUS / SPY, and 70 / 30 with Basket 1 vs Basket 1 alone =================
const YE = (() => { let k = -1; for (let t = 0; t < T; t++) if (D[t] < SPLIT) k = t; return k; })();
const spyLv = Float64Array.from(SPYC, x => x > 0 ? x : NaN);
const lvOf = (eq, s0) => { const lv = new Float64Array(T).fill(NaN); lv[s0] = 1; for (let k = s0 + 1; k < T; k++) lv[k] = eq[k]; return lv; };
const PTS = (s0) => [s0, ...ME.filter(k => k > s0 && k < T - 1), T - 1];
const run = (events, s0, side) => simulate({ T, start: s0 + 1, events, px: pxApi, side });
const turn = (S, s0) => { const a = [...S.eq].filter(x => x > 0), m = a.length ? a.reduce((p, q) => p + q, 0) / a.length : 1; return r4(S.traded / m / ((T - s0 - 1) / YEAR)); };
const RES = {}, SIMS = {};
for (const id of ALL) { const B = BUILT[id]; if (B.start === null) { RES[id] = { verdict: 'TOO FEW', why: 'no formation possible in the window' }; continue; }
  const s0 = B.start, pts = PTS(s0), H = { older: [s0, YE], newer: [Math.max(YE, s0), T - 1], all: [s0, T - 1] }, o = { name: id === 'INFO-SPWO' ? 'SPWO (SP Funds Dow Jones Global ex-US Shariah) held - information' : RULES[id].name, start: D[s0], firstTrade: D[s0 + 1], reviews: B.combo.size };
  for (const [lab, side] of [['standard', SIDE], ['stress', SIDE_STRESS]]) {
    const A = run(B.alone, s0, side), C = run(B.combo, s0, side), Bs = run(B.base, s0, side), lA = lvOf(A.eq, s0), lC = lvOf(C.eq, s0), lB = lvOf(Bs.eq, s0);
    if (lab === 'standard') SIMS[id] = { A, C, Bs, s0 };
    const halves = {};
    for (const [h, [a, b]] of Object.entries(H)) { if (!(b > a)) { halves[h] = null; continue; }
      const alone = pathStats(lA, a, b), combo = pathStats(lC, a, b), base = pathStats(lB, a, b), spus = pathStats(FUNDC.SPUS, a, b), spy = pathStats(spyLv, a, b), p = pts.filter(k => k >= a && k <= b);
      halves[h] = { from: D[a], to: D[b], alone, spus, spy, aloneBeatsSpus: !!(alone && spus && alone.cagr > spus.cagr), aloneBeatsSpy: !!(alone && spy && alone.cagr > spy.cagr), aloneDDvsSpus: alone && spus ? r4(alone.maxDD - spus.maxDD) : null,
        combo, basket1: base, comboRatio: retForDD(combo), basket1Ratio: retForDD(base), comboBetter: comboBetter(combo, base), corrWithBasket1: corr(monthly(lA, p, D), monthly(lB, p, D)) }; }
    const yr = { alone: yearReturns(lA, D, s0), combo: yearReturns(lC, D, s0), basket1: yearReturns(lB, D, s0), spus: yearReturns(FUNDC.SPUS, D, s0), spy: yearReturns(spyLv, D, s0) };
    o[lab] = { halves, turnoverPerYear: { alone: turn(A, s0), combo: turn(C, s0), basket1: turn(Bs, s0) }, costPaid: { alone: r4(A.costPaid), combo: r4(C.costPaid), basket1: r4(Bs.costPaid) },
      years: yr, worstYear: Object.fromEntries(Object.entries(yr).map(([k, v]) => [k, worstYear(v)])) }; }
  const S = o.standard.halves, X = o.stress.halves, hb = (Z, h) => Z[h] ? Z[h].comboBetter === true : false;
  o.test2 = { older: hb(S, 'older'), newer: hb(S, 'newer'), olderStress: hb(X, 'older'), newerStress: hb(X, 'newer') };
  o.passesTest2 = o.test2.older && o.test2.newer && o.test2.olderStress && o.test2.newerStress;
  o.aloneBeatsSpusBothHalves = !!(S.older && S.newer && S.older.aloneBeatsSpus && S.newer.aloneBeatsSpus); o.aloneBeatsSpyBothHalves = !!(S.older && S.newer && S.older.aloneBeatsSpy && S.newer.aloneBeatsSpy);
  o.overlapsWithBasket1 = B.overlaps;
  const fail = []; if (!S.older) fail.push('no older half (the candidate starts ' + D[s0] + ')');
  for (const [h, z] of [['older', S.older], ['newer', S.newer]]) if (z && !z.comboBetter) fail.push('70/30 not better than Basket 1 alone in the ' + h + ' half (return/maxDD ' + z.comboRatio + ' vs ' + z.basket1Ratio + '; CAGR ' + pc(z.combo && z.combo.cagr) + ' vs ' + pc(z.basket1 && z.basket1.cagr) + ', max fall ' + pc(z.combo && z.combo.maxDD) + ' vs ' + pc(z.basket1 && z.basket1.maxDD) + ')');
  for (const [h, z] of [['older', X.older], ['newer', X.newer]]) if (z && !z.comboBetter && S[h] && S[h].comboBetter) fail.push('fails at the 0.6% stress cost in the ' + h + ' half');
  o.verdict = !S.older ? 'TOO FEW' : o.passesTest2 ? 'EARNS ITS PLACE' : 'DOES NOT EARN ITS PLACE'; o.why = fail.length ? fail.join('; ') : 'the 70/30 account had a higher return per unit of max drawdown than Basket 1 alone in both halves, also at 0.6% per side';
  RES[id] = o;
  const ln = (z) => z ? 'alone ' + pc(z.alone && z.alone.cagr) + ' (SPUS ' + pc(z.spus && z.spus.cagr) + ', SPY ' + pc(z.spy && z.spy.cagr) + ', fall ' + pc(z.alone && z.alone.maxDD) + ') | 70/30 R ' + z.comboRatio + ' vs B1 ' + z.basket1Ratio + ' corr ' + z.corrWithBasket1 : 'n/a';
  log('- ' + id + ': ' + o.verdict + ' | from ' + o.start + ' | OLDER ' + ln(S.older) + ' | NEWER ' + ln(S.newer) + ' | ' + o.why.slice(0, 300)); }

// ================= 7. FREEZE =================
const FR0 = Object.fromEntries(Object.entries(RES).filter(([k, r]) => IDS.includes(k) && !(k in FROZEN) && complete && r.standard).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], to: D[T - 1], ...r }]));
const firstRun = freezeEach(FROZEN, FR0, () => true);

// ================= 8. TODAY (each candidate's holdings in WHOLE percentages with the ZAD mark) + PAPER MARKS =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const seen = new Set(lines.map(x => x.type + '|' + x.id)), newLines = [], today = {}, board = {};
const zadOf = (i) => SYMS[i] === 'GLD' ? 'gold product - owner decides in ZAD' : FUNDS.includes(SYMS[i]) ? 'fund - check in ZAD' : ZADM(SYMS[i]);
const asPct = (w) => wholePct([...w].map(([i, v]) => ({ key: i, w: v }))).map(x => ({ sym: SYMS[x.key], pct: x.pct, zad: zadOf(x.key), screener: FUNDS.includes(SYMS[x.key]) ? null : screener(SYMS[x.key]) }));
const b1Now = b1At(QS[QS.length - 1]);
for (const id of IDS) { const B = BUILT[id], Z = SIMS[id]; if (!B || B.start === null || !Z) continue;
  const ks = [...B.alone.keys()].sort((a, b) => a - b), lastTe = ks[ks.length - 1], w0 = B.alone.get(lastTe).w;
  const drift = new Map([...w0].map(([i, w]) => { const e = OO(i, lastTe), p = CC(i, lastI[i] >= 0 ? Math.min(lastI[i], T - 1) : T - 1); return [i, e > 0 && p > 0 ? w * p / e : 0]; }));
  const fresh = candAt(id, T - 1), fr = firstRun[id] || {};
  const k0 = D.findIndex(d => d >= START); if (k0 >= 0) for (let k = Math.max(Z.s0 + 1, k0); k < T; k++) { const mid = id + '|' + D[k]; if (seen.has('mark|' + mid)) continue; seen.add('mark|' + mid);
    newLines.push({ type: 'mark', id: mid, m: id, d: D[k], alone: r4(Z.A.eq[k]), combo7030: r4(Z.C.eq[k]), basket1: r4(Z.Bs.eq[k]) }); }
  today[id] = { name: RULES[id].name, hold: 63, verdict: fr.verdict || null, passesTest2: fr.passesTest2 ?? null, newSignals: [], lastReview: D[lastTe],
    holdingsNow: asPct(drift), holdingsIfFormedAtLastClose: fresh ? asPct(fresh) : null, basket1Overlap: b1Now ? overlap(b1Now, drift).map(i => SYMS[i]) : null,
    account: 'If adopted: 70% of the money in Basket 1 (SQ10-SH20-C15) and 30% in this basket, both reset to 70/30 at every quarterly review (first session of Jan / Apr / Jul / Oct).' };
  board[id] = { name: RULES[id].name, verdict: fr.verdict || null, paperMarks: [...lines, ...newLines].filter(x => x.type === 'mark' && x.m === id).length }; }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
const NOTE = 'PAPER ONLY. Squad 23 second-basket candidates (SQ23-*). Basket study, NOT a TRY SMALL lab: newSignals stay empty. holdingsNow = the basket formed at its last quarterly review, drifted to the last close, in WHOLE percentages summing to 100 (ZAD accepts whole numbers only). The Shariah screen is a point-in-time PROXY of the S&P / Dow Jones / AAOIFI method, NOT ZAD: zad = the owner\'s ZAD mark (data/halal.json + zad-list); "unknown" must be checked in ZAD before any real buy; the halal status of any gold product (GLD or another) is the owner\'s ZAD decision.';
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, note: NOTE, basket1Now: b1Now ? [...b1Now.keys()].map(i => SYMS[i]) : null, methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, note: 'daily marks of each candidate alone, the 70/30 account and Basket 1 alone in data/squad23-paper.jsonl', methods: board }, null, 1));
log('paper lane: ' + newLines.length + ' new line(s)');

// ================= 9. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'squad23-core.mjs RULES + data/strategy-library.json SQ23-* (25 Oct 2026, before any run)', window: [D[0], D[T - 1]], split: SPLIT, sideCost: SIDE, sideStress: SIDE_STRESS, complete, data: STATUS, diagnostics: DIAGS,
  standard: '(1) ALONE as an account: CAGR per half (start - last close of 2023 / 2024 - last close) after 0.4% per side on the real turnover (stress 0.6%) vs SPUS and SPY (price only for all), max drawdown, calendar years and the worst year. (2) KEY TEST: 70% Basket 1 (SQ10-SH20-C15) + 30% the candidate, one account reset to 70/30 every quarter, vs Basket 1 alone from the same session: CAGR / |max drawdown| higher in BOTH halves at 0.4% AND at 0.6% per side (if a CAGR <= 0: higher CAGR and no deeper drawdown); correlation of monthly returns with Basket 1 per half. EARNS ITS PLACE = passes (2).',
  halalNote: 'The Shariah screen is a point-in-time PROXY (SIC business screen; debt, cash + short-term investments and receivables each < 33% of the 36-month average market value; interest income < 5% of revenue), NOT the ZAD status. Gold: the owner decides the halal status of any gold product through ZAD.',
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: RES }), info: { SPWO: RES['INFO-SPWO'] || null } };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result || !r.standard) continue; const S = r.standard.halves, g = (h, k, f) => S[h] && S[h][k] ? (f ? S[h][k][f] : S[h][k]) : null;
    e.status = 'tested: ' + r.verdict.toLowerCase() + ' (as 30% next to Basket 1); alone ' + (r.aloneBeatsSpusBothHalves ? 'beat' : 'did not beat') + ' SPUS in both halves'; e.tested = String(r.to); e.study = 'squad23-lab.mjs -> data/squad23-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, start: r.start, aloneCagr: [g('older', 'alone', 'cagr'), g('newer', 'alone', 'cagr')], spusCagr: [g('older', 'spus', 'cagr'), g('newer', 'spus', 'cagr')], spyCagr: [g('older', 'spy', 'cagr'), g('newer', 'spy', 'cagr')], aloneMaxDD: [g('older', 'alone', 'maxDD'), g('newer', 'alone', 'maxDD')],
      comboRatio: [g('older', 'comboRatio'), g('newer', 'comboRatio')], basket1Ratio: [g('older', 'basket1Ratio'), g('newer', 'basket1Ratio')], corrWithBasket1: [g('older', 'corrWithBasket1'), g('newer', 'corrWithBasket1')], passesTest2: r.passesTest2, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad23-lab: library not updated: ' + e.message); }
console.log('SQUAD 23 LAB ' + D[0] + ' to ' + D[T - 1] + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + (complete ? '' : ' | INCOMPLETE: ' + Object.entries(STATUS).filter(([, s]) => s && s.ok === false).map(([k]) => k).join(', ')));
