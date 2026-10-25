// SQUAD 20 LAB (25 Oct 2026): "USE THE JUMP DIFFERENTLY" (squad20-core.mjs = the pre-registered rules, written before any run).
// A) a +40% / +25% one-day jump in the 10 sessions before entry as an AVOID filter on the rules that work (SQ11-PB12, SQ6-MTUM, SQ6-QMOM,
// B-FCF1, DEC-FROG, ANOM-RESMOM, ANOM-SUESURGE, MACRO-GOLD-S20, MACRO-USD-E60); B) a +25% / +40% jump while held as an EXIT (sell half / all);
// C) the second setup after a +40% spike; D) one-month momentum among high-turnover large caps (Medhat & Schmeling 2022).
// Research + a FORWARD PAPER lane; never places an order; no Telegram.
// 1. DATA: exactly squad18-lab.mjs's data section (copied; itself squad11 / squad5's): the 5-year whole-market price cache
//    (study-cache/grouped.json.gz, RESTORED READ ONLY, dead stocks and small stocks in its x rows) + the sessions since (Massive grouped
//    daily), point-in-time market value (SEC company facts, the historical Form 3/4/5 ticker map from Squad 4's cache READ ONLY, Squads 5 /
//    11 / 18's caches copied into squad20-cache by the workflow), here checked down to the 1,100 largest. The base rules' trade lists from
//    their labs' files (read only): data/squad11-lab.json, data/value-lab.json, data/decoded-history.json, data/confluence-signals.json.gz,
//    data/macro-lab.json; SQ6-MTUM / SQ6-QMOM rebuilt with squad6-core (squad 18's construction). XLK from Massive daily bars.
// 2. 5-YEAR ONE-SHOT for every SQ20 rule not yet frozen; first complete verdict frozen in data/squad20-lab.json firstRun.
// 3. PAPER LANE from Monday 26 Oct 2026: data/squad20-paper.jsonl, data/squad20-today.json, data/squad20-board.json.
// DIAG=1: data coverage and signal counts only; nothing judged or written in data/.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { tradeG } from './yardstick.mjs';
import { ownAverage, nextSession } from './anomaly-core.mjs';
import { cikFromSpans, artifactJumps, hasArtifact } from './squad4-core.mjs';
import { byCap, capAt, usCompany, addDays } from './squad5-core.mjs';
import { yardOf, mtumPick, qmomPick, fip, weekly, weeksOf, topN, sd as sd6, monthEnds as monthEnds6 } from './squad6-core.mjs';
import { monthEnds } from './squad11-core.mjs';
import { RULES, IDS, A_IDS, B_IDS, TRADE_IDS, BASES, BASE_KEYS, FILTERS, EXITS, SPIKE, STM, COST, SPLIT, PAPER_START, YEAR, r4, mean, halfOf, jumpBefore, exitOverlay, holdFrom, holdStop,
  spikesOf, spikeSignals, spikeControls, stmomPick, turnover, groupReport, paired, perYearOf, byYear, adoptFilter, adoptExit, boardStats, paperReady, preRegister } from './squad20-core.mjs';
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ20_CACHE || 'squad20-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = env.SQ20_OUT || 'data/squad20-lab.json', PAPER = 'data/squad20-paper.jsonl', TODAY = 'data/squad20-today.json', BOARD = 'data/squad20-board.json', LIB = env.SQ20_LIB || 'data/strategy-library.json';
const START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ20_MINUTES || 120) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(2.5, +LEAGUE.bar || 0, 4.0), STATUS = {};

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ20 entries written now'); }

// ================= 1. PRICES (as squad5-lab, with highs and lows) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad20-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (OFFLINE || (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE))) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6 || OFFLINE) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none'));
const D = Object.keys(store.days).sort(), T = D.length;
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const CA = new Float32Array(N).fill(NaN), OA = new Float32Array(N).fill(NaN), HA = new Float32Array(N).fill(NaN), LA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
let withHL = 0, rowsAll = 0;
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; HA[k] = x.h ? x.h[j] : NaN; LA[k] = x.l ? x.l[j] : NaN; MAIN[k] = 1; rowsAll++; if (x.h && x.l && x.h[j] > 0) withHL++; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o[j]; VA[k] = x.x.v ? x.x.v[j] : NaN; HA[k] = x.x.h ? x.x.h[j] : NaN; LA[k] = x.x.l ? x.x.l[j] : NaN; } });
const SIC = store.sic || {}; store = null;
if (!OFFLINE) { const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; HA[q] /= r; LA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), cl = (i) => CA.subarray(i * T, i * T + T), CC = (i, t) => CA[i * T + t];
if (spyI === undefined) { console.log('squad20-lab: SPY missing from the cache; nothing done'); process.exit(0); }
const lastI = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; }
const GONE = 5, vanishedI = (i) => lastI[i] >= 0 && lastI[i] < T - 1 - GONE;
const LIQ = new Uint8Array(N), DV20 = new Float32Array(N);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN; if (isFinite(w)) { s -= w; n--; } }
    if (t >= 19 && n === 20) { DV20[b + t] = s / 20; if (CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } } }
const liqMemo = new Map(), liqList = (t) => { if (t < 0) return []; if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const SPYC = cl(spyI), MENDS = monthEnds(D).filter(t => t >= 21);   // month ends with a previous month end (STMOM formation dates)
STATUS.price = { ok: T >= 1000 && withHL >= rowsAll * 0.9 && SPYC.filter(x => x > 0).length >= T * 0.95, sessions: T, from: D[0], to: D[T - 1], stocks: NS, rowsWithHighLow: r4(withHL / Math.max(1, rowsAll)) };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks), rows with high/low ' + pc(withHL / Math.max(1, rowsAll)) + ', month ends: ' + MENDS.length + ' (' + (MENDS.length ? D[MENDS[0]] : '-') + ' on)');

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
  for (const q of qs) { let x = JZ(SC4 + '/f345/' + q + '.json.gz', null); if (x) from4++; if (!x) x = JZ(SC + '/f345/' + q + '.json.gz', null);
    if (!x && !OFFLINE) { for (const p of ['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/']) { const zip = SC + '/f345.zip'; if (!download(SEC + p + q + '_form345.zip', zip)) continue;
      const r = parseMap(zip); try { fs.unlinkSync(zip); } catch (e) {} if (r) { x = r; WZ(SC + '/f345/' + q + '.json.gz', x); got++; break; } } }
    if (!x) { fail.push(q); continue; } for (const m of x.map) (TMAP.get(m[0]) || TMAP.set(m[0], []).get(m[0])).push([m[1], m[2], m[3], m[4]]); }
  for (const [s, a] of TMAP) { const by = new Map(); for (const [c, f, l, n] of a) { const o = by.get(c); if (!o) by.set(c, [c, f, l, n]); else { if (f < o[1]) o[1] = f; if (l > o[2]) o[2] = l; o[3] += n; } } TMAP.set(s, [...by.values()]); }
  STATUS.tickerMap = { ok: qs.slice(0, -1).every(q => !fail.includes(q)), quarters: qs.length, fromSquad4Cache: from4, downloadedNow: got, missing: fail, tickers: TMAP.size };
  log('ticker map: ' + JSON.stringify(STATUS.tickerMap)); }
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {}, c: {} });
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
{ const meta = J(SC + '/facts-meta.json', {}); FX.ownAt = meta.at || null; for (let k = 0; k < NSH; k++) Object.assign(FX.own, JZ(SC + '/facts-' + k + '.json.gz', {})); for (const [c, v] of Object.entries(FX.own)) if (!(c in FX.c)) FX.c[c] = v; }
// the companies needed: every liquid stock at a month start (market value ranks need all of them)
const MS = MENDS;   // the month ends (STMOM formation dates); TOPCAP = how deep the share-count / domicile checks go
const TOPCAP = 1100;
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
const SUBS = J(SC + '/subs.json', {});
const ALT = J(SC + '/alt-shares-v3.json', {}), ALT_TAGS = ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding', 'CommonStockSharesOutstanding'];
// per filing: the current period's count of each tag; the LARGEST of the tags (a multi-class company may report one class under one tag)
function altFrom(j) { const g = j && j.facts && j.facts['us-gaap']; if (!g) return []; const m = new Map();
  for (const tag of ALT_TAGS) { const u = g[tag] && g[tag].units && g[tag].units.shares; if (!Array.isArray(u)) continue; const cur = new Map();
    for (const x of u) { if (!x || !x.filed || !x.end || !(x.val > 0) || x.end < '2019-01-01') continue; if (x.start) { const dd = (Date.parse(x.end) - Date.parse(x.start)) / 864e5 + 1; if (!((dd >= 80 && dd <= 100) || (dd >= 350 && dd <= 380))) continue; }
      const o = cur.get(x.filed); if (!o || x.end > o[1] || (x.end === o[1] && x.val > o[2])) cur.set(x.filed, [x.filed, x.end, x.val]); }
    for (const [f, r] of cur) { const o = m.get(f); if (!o || r[1] > o[1] || (r[1] === o[1] && r[2] > o[2])) m.set(f, r); } }
  return [...m.values()].sort((a, b) => a[0] < b[0] ? -1 : 1); }
// ---- the split list (Massive; own cache, refreshed every run): ticker -> [[execution date, new shares per old share]] ----
const SPL = new Map(); { let rows = J(SC + '/splits.json', null), pages = 0;
  if (!OFFLINE) { const got = []; let path = '/stocks/v1/splits?execution_date.gte=2021-01-01&limit=1000', ok2 = false;
    while (path && pages < 80) { const j = await api(path); pages++; if (!j || j.refused || !Array.isArray(j.results)) break; got.push(...j.results); if (!j.next_url) { ok2 = true; break; } path = String(j.next_url).replace(/^https?:\/\/[^/]+/, ''); }
    if (ok2 && got.length > 500) { rows = got.map(x => [String(x.ticker || '').toUpperCase(), String(x.execution_date || ''), +x.split_from, +x.split_to, String(x.adjustment_type || '')]); W(SC + '/splits.json', rows); } }
  for (const [t, d, f, to, kind] of rows || []) { if (!t || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(kind)) continue; (SPL.get(t) || SPL.set(t, []).get(t)).push([d, to / f]); }
  for (const a of SPL.values()) a.sort((x, y) => x[0] < y[0] ? -1 : 1);
  STATUS.splits = { ok: (rows || []).length > 500, rows: (rows || []).length, tickers: SPL.size, pagesNow: pages }; log('split list: ' + JSON.stringify(STATUS.splits)); }
const capOf = (i, cik, t) => { const r = capAt({ adjClose: CC(i, t), d: D[t], splits: SPL.get(SYMS[i]) || SPL.get(SYMS[i].replace(/\./g, '-')), cover: coverRows(cik), alt: ALT[cik] }); return r ? r.cap : null; };
const coverOk = (cik, d) => { const lim = addDays(d, -30); return (coverRows(cik) || []).some(([e, n]) => e <= lim && n > 0); };
// the financial-statement count is fetched for every company without a usable cover-page count and for every company in the provisional TOPCAP (1100)
// largest at any month start (rowsAt is a hoisted function declaration)
{ const want = new Set(); for (const t of [...MS, T - 1]) { for (const i of liqList(t)) { const cik = cikAt(i, D[t]); if (cik && coOf(cik) && !coverOk(cik, D[t]) && !(cik in ALT)) want.add(cik); }
    if (t >= 19) for (const r of byCap(rowsAt(t, false).rows).slice(0, TOPCAP)) if (!(r.cik in ALT)) want.add(r.cik); }
  let got = 0; if (!OFFLINE) for (const c of want) { if (left() < 75 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null; try { r = await fetch(SECD + '/api/xbrl/companyfacts/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); } catch (e) {}
    if (r && r.ok) { const j = await r.json().catch(() => null); if (j) { ALT[c] = altFrom(j); got++; } } else if (r && r.status === 404) ALT[c] = []; }
  if (got) W(SC + '/alt-shares-v3.json', ALT); STATUS.altShares = { ok: [...want].filter(c => !(c in ALT)).length <= Math.max(5, want.size * 0.02), wanted: want.size, fetchedNow: got, known: Object.values(ALT).filter(a => a.length).length }; log('statement share counts: ' + JSON.stringify(STATUS.altShares)); }
// ---- domicile (SEC submissions: business address + 20-F / 40-F filings; also the SIC code); own cache ----
function rowsAt(t, useDom) { const rows = new Map(); let noCik = 0, noFacts = 0, noShares = 0, foreign = 0;
  for (const i of liqList(t)) { const cik = cikAt(i, D[t]); if (!cik) { noCik++; continue; } if (!coOf(cik)) { noFacts++; continue; } if (useDom && SUBS[cik] && SUBS[cik].us === false) { foreign++; continue; } const cap = capOf(i, cik, t); if (!cap) noShares++;
    const r = { key: i, i, cik, dv: DV20[i * T + t], close: CC(i, t), cap }, o = rows.get(cik); if (!o || r.dv > o.dv) rows.set(cik, r); }
  return { rows: [...rows.values()], noCik, noFacts, noShares, foreign }; }
{ const want = new Set(); for (const t of [...MS.filter(x => x >= 19), T - 1]) for (const r of byCap(rowsAt(t, false).rows).slice(0, TOPCAP)) if (!(r.cik in SUBS)) want.add(r.cik);
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
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const SPYCD = Float64Array.from(SPYC), SPYO = Float64Array.from(OA.subarray(spyI * T, spyI * T + T));
const tOf = new Map(D.map((d, t) => [d, t])), sessionOf = (d) => { if (tOf.has(d)) return tOf.get(d); let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo - 1; };
const ser = (A, i) => A.subarray(i * T, i * T + T);
// every-row 20-session average traded value (small stocks included: the SPIKE2 liquidity gate)
const DVA = new Float32Array(N).fill(NaN); for (let i = 0; i < NS; i++) { const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = CA[b + t] * VA[b + t]; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const w = CA[b + t - 20] * VA[b + t - 20]; if (isFinite(w)) { s -= w; n--; } } if (t >= 19 && n >= 15) DVA[b + t] = s / n; } }
const JUMPS = new Map(); const artOf = (i) => { if (!JUMPS.has(i)) JUMPS.set(i, new Set(artifactJumps(cl(i)))); return JUMPS.get(i); };
const hasArt = (i, a, b) => { for (const k of artOf(i)) if (k > a && k <= b) return true; return false; };
// funds missing from the cache (XLK of MACRO-USD-E60): Massive daily bars (adjusted), as squad3-lab loads them
const EXTRA = new Map();
async function extraSeries(sym) { if (EXTRA.has(sym)) return EXTRA.get(sym); const j = await api('/v2/aggs/ticker/' + sym + '/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000'); let s = null;
  if (j && Array.isArray(j.results) && j.results.length > 200) { const o = new Float64Array(T).fill(NaN), c = new Float64Array(T).fill(NaN), v = new Float64Array(T).fill(NaN); let last = -1;
    for (const b of j.results) { const t = tOf.get(iso(b.t)); if (t !== undefined) { o[t] = b.o; c[t] = b.c; v[t] = b.v; if (t > last) last = t; } } s = { o, c, v, last, art: new Set(artifactJumps(c)) }; }
  EXTRA.set(sym, s); return s; }
const SER = new Map(); const seriesOf = (i) => { if (!SER.has(i)) SER.set(i, { o: ser(OA, i), c: ser(CA, i), l: ser(LA, i), v: ser(VA, i), last: lastI[i], art: artOf(i) }); return SER.get(i); };

// ================= 6. BASE RULES: the trade lists =================
const VL = J('data/value-lab.json', {}), DH = J('data/decoded-history.json', {}), AL = J('data/anomaly-lab.json', {}), ML = J('data/macro-lab.json', {}), S11 = J('data/squad11-lab.json', {}), S6 = J('data/squad6-lab.json', {});
const SGL = JZ('data/confluence-signals.json.gz', { signals: {}, check: {} });
const frozenN = (L, id) => { const r = (L.firstRun || {})[id]; return r && r.results ? (r.results.older.n || 0) + (r.results.newer.n || 0) : null; };
const SIGNALS = {}, FROZENN = {};
SIGNALS.PB12 = ((S11.trades || {})['SQ11-PB12'] || []).map(z => [z.s, z.sig]); FROZENN.PB12 = frozenN(S11, 'SQ11-PB12');
SIGNALS.FCF1 = ((VL.trades || {})['B-FCF1'] || []).map(z => [z.s, z.sig || z.d]); FROZENN.FCF1 = frozenN(VL, 'B-FCF1');
SIGNALS.FROG = ((DH.trades || {})['DEC-FROG'] || []).map(z => [z.s, z.sig || z.d]); FROZENN.FROG = frozenN(DH, 'DEC-FROG');
SIGNALS.RESMOM = (SGL.signals['ANOM-RESMOM'] || []).map(z => [z[0], z[1]]); FROZENN.RESMOM = frozenN(AL, 'ANOM-RESMOM');
SIGNALS.SUESURGE = (SGL.signals['ANOM-SUESURGE'] || []).map(z => [z[0], z[1]]); FROZENN.SUESURGE = frozenN(AL, 'ANOM-SUESURGE');
SIGNALS.GOLD = ((ML.trades || {})['MACRO-GOLD-S20'] || []).map(z => [z.s, z.sig || z.d]); FROZENN.GOLD = frozenN(ML, 'MACRO-GOLD-S20');
SIGNALS.USD = ((ML.trades || {})['MACRO-USD-E60'] || []).map(z => [z.s, z.sig || z.d]); FROZENN.USD = frozenN(ML, 'MACRO-USD-E60');
FROZENN.MTUM = frozenN(S6, 'SQ6-MTUM'); FROZENN.QMOM = frozenN(S6, 'SQ6-QMOM');
// MTUM / QMOM rebuilt (squad6-lab.mjs construction; squad6-core picks; exactly squad18-lab.mjs's rebuild, which matched the frozen counts)
const TV63 = new Float32Array(N).fill(NaN); for (let i = 0; i < NS; i++) { const b = i * T; let s = 0, n = 0; for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; } if (t >= 63) { const w = MAIN[b + t - 63] ? CA[b + t - 63] * VA[b + t - 63] : NaN; if (isFinite(w)) { s -= w; n--; } } if (t >= 62 && n >= 57) TV63[b + t] = s / n; } }
const SECC = J('data/sec-ciks.json', {}), sicOf = (s) => { const x = SIC[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECC[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
const WKS = weeksOf(D), wkMemo = new Map(), wkOf = (i) => { if (!wkMemo.has(i)) wkMemo.set(i, weekly({ o: ser(OA, i), h: ser(HA, i), l: ser(LA, i), c: ser(CA, i) }, WKS).c); return wkMemo.get(i); };
const meLive = (months) => { const a = monthEnds6(D, months), nx = nextSession(D[T - 1]); if (nx.slice(0, 7) !== D[T - 1].slice(0, 7) && months.includes(+D[T - 1].slice(5, 7)) && !a.includes(T - 1)) a.push(T - 1); return a; };
const FUNDSIG = { MTUM: [], QMOM: [] };
for (const t of meLive([5, 11])) { if (t < 252) continue; const uni = topN(liqList(t).filter(i => CA[i * T + t - 252] > 0).map(i => ({ key: i, v: TV63[i * T + t] })), 600);
  const nW = WKS.findIndex(w => w.e >= t), lastW = WKS[nW] && WKS[nW].e === t ? nW : nW - 1;
  const rows = uni.map(i => { const c = cl(i), a = c[t - 21], m12 = c[t - 252] > 0 && a > 0 ? a / c[t - 252] - 1 : null, m6 = c[t - 126] > 0 && a > 0 ? a / c[t - 126] - 1 : null, wc = wkOf(i), rr = [];
    for (let w = Math.max(1, lastW - 155); w <= lastW; w++) if (wc[w] > 0 && wc[w - 1] > 0) rr.push(wc[w] / wc[w - 1] - 1); const s = rr.length >= 52 ? sd6(rr) * Math.sqrt(52) : null; return { key: i, m6, m12, vol: s }; });
  for (const i of mtumPick(rows, Math.ceil(uni.length * 0.20))) FUNDSIG.MTUM.push([SYMS[i], D[t]]); }
for (const t of meLive([2, 5, 8, 11])) { if (t < 252) continue; const uni = topN(liqList(t).filter(i => CA[i * T + t - 252] > 0 && sicOf(SYMS[i]) !== '6798').map(i => ({ key: i, v: TV63[i * T + t] })), 1000);
  const rows = uni.map(i => { const c = cl(i), m = c[t - 21] > 0 && c[t - 252] > 0 ? c[t - 21] / c[t - 252] - 1 : null; return { key: i, m, fip: m === null ? null : fip(c, t - 251, t - 21, m) }; });
  for (const i of qmomPick(rows)) FUNDSIG.QMOM.push([SYMS[i], D[t]]); }
SIGNALS.MTUM = FUNDSIG.MTUM; SIGNALS.QMOM = FUNDSIG.QMOM;
// build the base trades: buy the open after the signal close, sell at the close of session hold
STATUS.bases = {}; const BASE_TR = {}, LIVE_BASE = {};
for (const b of BASE_KEYS) { const B = BASES[b], out = [], note = { signals: SIGNALS[b].length, noPrice: 0, open: 0, artifacts: 0, notBought: 0 }; LIVE_BASE[b] = [];
  for (const [sym, d] of SIGNALS[b]) { const t = sessionOf(d); if (t < 0) { note.noPrice++; continue; } let i = SY.get(sym), S = null;
    if (i !== undefined) S = seriesOf(i); else { S = await extraSeries(sym); i = -1; } if (!S) { note.noPrice++; continue; }
    const r = holdFrom(S, t + 1, S.last, T, B.hold); if (!r) { note.notBought++; continue; } if (r.pending || r.open) { note.open++; LIVE_BASE[b].push({ sym, i, t, k: r.k, px0: r.px0 }); continue; }
    if (i >= 0 ? hasArt(i, r.k, r.x) : [...S.art].some(k => k > r.k && k <= r.x)) { note.artifacts++; continue; }
    out.push({ b, sym, i, S, t, sig: D[t], half: halfOf(D[t]), ...r }); }
  BASE_TR[b] = out; const fz = FROZENN[b];
  STATUS.bases[b] = { ok: fz !== null && fz > 0 && out.length >= fz * 0.9 && out.length <= fz * 1.1, rule: B.id, frozenTrades: fz, rebuilt: out.length, ...note };
  log('base ' + b + ' (' + B.id + '): ' + JSON.stringify(STATUS.bases[b])); }

// ================= 7. JUDGING (squad 11 / 18 standard) =================
const priceAt = (i, x, at) => { if (x > T - 1) return null; if (at === 'o') { const z = OA[i * T + x]; if (z > 0) return z; if (x > lastI[i]) { for (let q = x; q >= 0; q--) if (CA[i * T + q] > 0) return CA[i * T + q]; } return null; } for (let q = Math.min(x, T - 1); q >= 0; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const yMemo = new Map(); const yard = (k, x) => { const key = k * 8192 + x; if (yMemo.has(key)) return yMemo.get(key);
  const st = liqList(k - 1).filter(i => i % 2 === 0 && !hasArt(i, k, x)); const m = yardOf(st, k, x, 'c', priceAt, 'capBoth', 50); yMemo.set(key, m); return m; };
const spyG = (k, x) => { const a = SPYO[k]; let y = null; for (let q = Math.min(x, T - 1); q >= 0; q--) if (SPYCD[q] > 0) { y = SPYCD[q]; break; } return a > 0 && y > 0 ? y / a - 1 : null; };
const capG = (g) => tradeG(g, 'capBoth');
// same stock held as long on its other days (busy = the rule's own spans of that stock); okAt = the stock was liquid the session before
const ownM = new Map();
function ownOf(tag, z, len, spans, okAt) { const key = tag + '|' + z.sym + '|' + len + '|' + z.half; if (ownM.has(key)) return ownM.get(key); const S = z.S;
  const v = ownAverage({ from: 253, to: T - 1, len, step: 10, busy: spans || [], okAt: (u) => halfOf(D[u]) === z.half && okAt(u), ret: (u, x) => { const e = S.o[u]; let y = null; for (let q = Math.min(x, T - 1); q >= u; q--) if (S.c[q] > 0) { y = S.c[q]; break; } return e > 0 && y > 0 ? y / e - 1 : null; }, mode: 'capBoth' });
  ownM.set(key, v); return v; }
const liqOk = (z) => (u) => z.i >= 0 ? LIQ[z.i * T + u - 1] === 1 : z.S.c[u - 1] > 0;
const spansOf = (rows) => { const m = new Map(); for (const z of rows) (m.get(z.sym) || m.set(z.sym, []).get(z.sym)).push([z.k, z.x]); return m; };
// a judged row: g capped, c (yardstick), spy, own
function judgedRows(tag, rows, okAtOf = liqOk) { const sp = spansOf(rows), out = [];
  for (const z of rows) { const c = z.c !== undefined ? z.c : yard(z.k, z.x); if (c === null) continue; const own = z.own !== undefined ? z.own : ownOf(tag, z, z.x - z.k + 1, sp.get(z.sym), okAtOf(z));
    const g0 = z.g0 !== undefined ? z.g0 : z.g; out.push({ ...z, g0, g: capG(g0), c, spy: z.spy !== undefined ? z.spy : spyG(z.k, z.x), own, s: z.sym }); }
  return out; }
function judgeRows(rows, hold, block) { const by = { older: rows.filter(z => z.half === 'older'), newer: rows.filter(z => z.half === 'newer') };
  const R = { older: halfStat(by.older, block), newer: halfStat(by.newer, block), all: halfStat(rows, block) };
  const PY = Object.fromEntries(['older', 'newer'].map(h => [h, { rule: r4(perYearOf(by[h], 'g', COST)), spy: r4(perYearOf(by[h], 'spy', 0)), avgStock: r4(perYearOf(by[h], 'c', 0)) }]));
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks held as long on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] } });
  return { ...v, hold, block, cost: COST, split: SPLIT, yardstick: 'capBoth (AUD-1)', results: R, perYear: PY, byYear: byYear(rows) }; }
const fH = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tB ' + h.tBlock + ' win ' + pc(h.win);
const line = (id, o) => '- ' + id + ': ' + o.verdict + ' | older ' + fH(o.results.older) + ' | newer ' + fH(o.results.newer) + ' | per year rule/SPY older ' + pc(o.perYear.older.rule) + '/' + pc(o.perYear.older.spy) + ' newer ' + pc(o.perYear.newer.rule) + '/' + pc(o.perYear.newer.spy);
const halves = (rows, f) => ({ older: f(rows.filter(z => z.half === 'older')), newer: f(rows.filter(z => z.half === 'newer')) });
const tradeOut = (z) => ({ s: z.sym, sig: z.sig, buy: D[z.k], sell: D[z.x], kind: z.kind, net: r4(z.g - COST), avgStock: r4(z.c - COST), spy: r4(z.spy), sameStock: r4(ok(z.own) ? z.own - COST : null) });

// ================= 8. C (spike second setup) and D (turnover momentum): signals =================
const SPK = { signals: [], controls: [], spikes: 0, stocks: 0 };
{ const busy = new Map();
  for (let i = 0; i < NS; i++) { if (i === spyI) continue; const S = seriesOf(i), art = S.art, sp = spikesOf(S.c, art); if (!sp.length) continue; SPK.stocks++; SPK.spikes += sp.length;
    const elig = (t) => S.c[t] >= SPIKE.minPx && DVA[i * T + t] >= SPIKE.minDv;
    for (const z of spikeSignals(S, sp, elig, art)) SPK.signals.push({ i, sym: SYMS[i], S, s: z.s, t: z.t });
    for (const z of spikeControls(S.c, sp, elig, art)) SPK.controls.push({ i, sym: SYMS[i], S, s: z.s, t: z.t, held: z.held }); } }
SPK.signals.sort((a, b) => a.t - b.t || a.i - b.i);
STATUS.spike = { ok: STATUS.price.ok, stocksWithSpikes: SPK.stocks, spikes: SPK.spikes, signals: SPK.signals.length, controls: SPK.controls.length, controlsHeld: SPK.controls.filter(z => z.held).length };
log('spikes: ' + JSON.stringify(STATUS.spike));
const STMF = []; const STMSIG = { 'SQ20-STMOM-1000': [], 'SQ20-STMOM-500': [] };
{ const LIVE = nextSession(D[T - 1]).slice(0, 7) !== D[T - 1].slice(0, 7) && !MENDS.includes(T - 1), FORMS = LIVE ? [...MENDS, T - 1] : [...MENDS];
  for (let j = 1; j < FORMS.length; j++) { const t = FORMS[j], tp = FORMS[j - 1]; if (t < 19) continue; const U = universe(t).ranked, info = { d: D[t], companies: U.length };
    for (const [id, n] of Object.entries(STM.sizes)) { const top = U.slice(0, n), rows = [];
      for (const r of top) { const i = r.i, c1 = CA[i * T + t], c0 = CA[i * T + tp]; const sh = r.cap > 0 && c1 > 0 ? r.cap / c1 : null;
        rows.push({ key: i, r: c1 > 0 && c0 > 0 ? c1 / c0 - 1 : null, to: turnover(ser(VA, i), tp + 1, t, sh) }); }
      const pick = stmomPick(rows); info[id] = { universe: top.length, usable: rows.filter(x => ok(x.r) && ok(x.to)).length, picks: pick.length, sizeAtCut: top.length ? r4(top[top.length - 1].cap / 1e9) : null };
      for (const i of pick) STMSIG[id].push({ i, sym: SYMS[i], t }); }
    STMF.push(info); } }
const SECOK = ['tickerMap', 'facts', 'altShares', 'domicile', 'splits'].every(k => STATUS[k] && STATUS[k].ok);
STATUS.stmom = { ok: SECOK && STMF.length >= 50 && STMF.every(x => x['SQ20-STMOM-1000'].universe === 1000 && x['SQ20-STMOM-1000'].usable >= 900 && x['SQ20-STMOM-500'].usable >= 450), formations: STMF.length, first: STMF.length ? STMF[0].d : null,
  minUniverse: STMF.length ? Math.min(...STMF.map(x => x['SQ20-STMOM-1000'].universe)) : 0, minUsable1000: STMF.length ? Math.min(...STMF.map(x => x['SQ20-STMOM-1000'].usable)) : 0, avgPicks1000: STMF.length ? r4(mean(STMF.map(x => x['SQ20-STMOM-1000'].picks))) : 0, avgPicks500: STMF.length ? r4(mean(STMF.map(x => x['SQ20-STMOM-500'].picks))) : 0 };
log('turnover momentum: ' + JSON.stringify(STATUS.stmom));
// AVOID-filter counts (no returns): how many base trades each filter removes, per half
const RMCOUNT = {}; for (const b of BASE_KEYS) for (const [f, thr] of Object.entries(FILTERS)) { const rm = BASE_TR[b].filter(z => jumpBefore(z.S.c, z.t, thr, z.S.art)); RMCOUNT[f + '-' + b] = { older: rm.filter(z => z.half === 'older').length, newer: rm.filter(z => z.half === 'newer').length }; }
const XCOUNT = {}; for (const b of BASE_KEYS) for (const [x, X] of Object.entries(EXITS)) { if (X.part !== 1) continue; const hit = BASE_TR[b].filter(z => exitOverlay(z.S, z, X.thr, 1, z.S.art)); XCOUNT[x.slice(2) + '-' + b] = { older: hit.filter(z => z.half === 'older').length, newer: hit.filter(z => z.half === 'newer').length }; }
log('AVOID filter would remove (older/newer): ' + JSON.stringify(RMCOUNT)); log('jump exit would trigger (older/newer): ' + JSON.stringify(XCOUNT));
if (DIAG) { console.log('SQUAD 20 DIAG (data coverage and signal counts only; no returns computed, nothing judged or written)'); console.log('DATA ' + JSON.stringify(STATUS));
  for (const x of STMF.filter((_, j) => j % 6 === 0 || j === STMF.length - 1)) console.log('STMOM ' + JSON.stringify(x)); for (const z of SPK.signals.slice(-15)) console.log('SPIKE2 ' + z.sym + ' spike ' + D[z.s] + ' signal ' + D[z.t]);
  process.exit(0); }

// ================= 9. 5-YEAR ONE-SHOT =================
const RES = {}, REFS = {}, ADOPTION = {}, need = IDS.filter(id => !FROZEN[id]);
const BASEJ = {}; for (const b of BASE_KEYS) BASEJ[b] = STATUS.bases[b].ok && STATUS.price.ok ? judgedRows('base:' + b, BASE_TR[b]) : null;
for (const b of BASE_KEYS) { if (!BASEJ[b]) continue; const o = judgeRows(BASEJ[b], BASES[b].hold, BASES[b].block); REFS['REF-' + b] = { name: BASES[b].name + ' (rebuilt base, reference only)', rule: BASES[b].id, ...o }; log(line('REF-' + b, o)); }
const notRun = (id, why) => { RES[id] = { verdict: 'NOT RUN', why }; log('- ' + id + ': NOT RUN (' + why.slice(0, 200) + ')'); };
// ---- A: AVOID filters ----
for (const id of A_IDS) { if (!need.includes(id)) continue; const R0 = RULES[id], b = R0.base; if (!BASEJ[b]) { notRun(id, 'base ' + b + ' data incomplete: ' + JSON.stringify(STATUS.bases[b])); continue; }
  const flag = (z) => jumpBefore(z.S.c, z.t, R0.thr, z.S.art), kept = [], removed = [];
  for (const z of BASEJ[b]) { const j = flag(z); if (j) removed.push({ ...z, jumpDay: D[j.q], jump: r4(j.move) }); else kept.push(z); }
  // the kept trades are re-judged with their own spans for the same-stock yardstick (a removed trade frees its stock's days)
  const keptJ = judgedRows(id, kept.map(z => { const { own, ...rest } = z; return rest; }));
  const o = judgeRows(keptJ, R0.hold, R0.block), base = REFS['REF-' + b];
  const rem = halves(removed, groupReport), kep = halves(kept, groupReport);
  const ad = adoptFilter(rem, kep, { older: o.perYear.older.rule, newer: o.perYear.newer.rule }, { older: base.perYear.older.rule, newer: base.perYear.newer.rule });
  RES[id] = { ...o, name: R0.name, kind: 'filter', base: BASES[b].id, removed: { ...rem, note: 'base trades skipped by the filter (a +' + Math.round(R0.thr * 100) + '% day in the 10 sessions before entry)', list: removed.slice(0, 300).map(z => ({ ...tradeOut(z), jumpDay: z.jumpDay, jump: z.jump })) }, kept: kep,
    baseRef: { verdict: base.verdict, results: base.results, perYear: base.perYear }, adoption: ad, trades: keptJ.map(tradeOut) };
  ADOPTION[id] = { adopt: ad.adopt, why: ad.why };
  log(line(id, o) + ' | REMOVED older ' + JSON.stringify(rem.older) + ' newer ' + JSON.stringify(rem.newer) + ' | ADOPT ' + ad.adopt + ' (' + ad.why + ')'); }
// ---- B: jump exits ----
for (const id of B_IDS) { if (!need.includes(id)) continue; const R0 = RULES[id], b = R0.base; if (!BASEJ[b]) { notRun(id, 'base ' + b + ' data incomplete: ' + JSON.stringify(STATUS.bases[b])); continue; }
  const rows = [], pairsRows = [];
  for (const z of BASEJ[b]) { const ex = exitOverlay(z.S, { k: z.k, x: z.x, px0: z.px0, g: z.g0 }, R0.thr, R0.part, z.S.art);
    if (!ex) { rows.push(z); continue; }
    const q = ex.q, cq = yard(z.k, q), sq = spyG(z.k, q); if (cq === null) { rows.push(z); continue; }
    let nz; if (R0.part === 1) nz = { ...z, x: q, g0: ex.g, g: capG(ex.g), c: cq, spy: sq, days: q - z.k + 1, kind: 'jump-exit', own: undefined };
    else nz = { ...z, g0: ex.g, g: capG(ex.g), c: 0.5 * cq + 0.5 * z.c, spy: ok(sq) && ok(z.spy) ? 0.5 * sq + 0.5 * z.spy : z.spy, days: 0.5 * (q - z.k + 1) + 0.5 * z.days, kind: 'half-jump-exit', jumpAt: q };
    rows.push(nz); pairsRows.push({ half: z.half, g: nz.g, base: z.g, sym: z.sym, sig: z.sig, jumpDay: D[q] }); }
  // sell-all trades end at q: their same-stock yardstick is recomputed for the shorter hold
  const fixed = R0.part === 1 ? rows.map(z => z.own === undefined ? { ...z, own: ownOf(id, z, z.x - z.k + 1, null, liqOk(z)) } : z) : rows;
  const o = judgeRows(fixed, R0.hold, R0.block), base = REFS['REF-' + b], pr = halves(pairsRows, paired);
  const ad = adoptExit(pr, { older: o.perYear.older.rule, newer: o.perYear.newer.rule }, { older: base.perYear.older.rule, newer: base.perYear.newer.rule });
  RES[id] = { ...o, name: R0.name, kind: 'exit', base: BASES[b].id, vsOriginal: { ...pr, all: paired(pairsRows), note: 'trades that hit the jump exit: new result vs the original exit, trade by trade (diff > 0 = the exit helped)', list: pairsRows.slice(0, 300).map(z => ({ s: z.sym, sig: z.sig, jumpDay: z.jumpDay, net: r4(z.g - COST), original: r4(z.base - COST) })) },
    baseRef: { verdict: base.verdict, results: base.results, perYear: base.perYear }, adoption: ad, trades: fixed.filter(z => z.kind && /jump/.test(z.kind)).map(tradeOut) };
  ADOPTION[id] = { adopt: ad.adopt, why: ad.why };
  log(line(id, o) + ' | vs original older ' + JSON.stringify(pr.older) + ' newer ' + JSON.stringify(pr.newer) + ' | ADOPT ' + ad.adopt + ' (' + ad.why + ')'); }
// ---- C: spike second setup ----
const spikeTrades = (list, busyOn) => { const out = [], busy = new Map(), note = { open: 0, artifacts: 0, busy: 0, notBought: 0 };
  for (const z of list) { if (busyOn && (busy.get(z.i) ?? -1) >= z.t + 1) { note.busy++; continue; } const r = holdStop(z.S, z.t + 1, z.S.last, T, SPIKE.hold, SPIKE.stop);
    if (!r) { note.notBought++; continue; } if (r.pending || r.open) { note.open++; if (busyOn) busy.set(z.i, Infinity); continue; } if (busyOn) busy.set(z.i, r.x); if (hasArt(z.i, r.k, r.x)) { note.artifacts++; continue; }
    out.push({ ...z, ...r, sig: D[z.t], half: halfOf(D[z.t]) }); }
  out.note = note; return out; };
const spikeOk = (z) => (u) => z.S.c[u - 1] >= SPIKE.minPx && DVA[z.i * T + u - 1] >= SPIKE.minDv;
if (need.includes('SQ20-SPIKE2')) { if (!STATUS.spike.ok) notRun('SQ20-SPIKE2', 'price data incomplete');
  else { const tr = spikeTrades(SPK.signals, true), J0 = judgedRows('SQ20-SPIKE2', tr, spikeOk), o = judgeRows(J0, SPIKE.hold, SPIKE.hold);
    const ctl = spikeTrades(SPK.controls, false), cJ = ctl.map(z => ({ ...z, c: yard(z.k, z.x), spy: spyG(z.k, z.x), g: capG(z.g) })).filter(z => z.c !== null);
    const exits = {}; for (const z of J0) exits[z.kind] = (exits[z.kind] || 0) + 1;
    RES['SQ20-SPIKE2'] = { ...o, name: RULES['SQ20-SPIKE2'].name, kind: 'trade', exits, notes: tr.note, controls: { rule: halves(J0, groupReport), notHeld: halves(cJ.filter(z => !z.held), groupReport), held: halves(cJ.filter(z => z.held), groupReport), note: 'controls bought at the open of spike + 21 sessions with the same exits (hold 63, stop 15%): NOT HELD = closed under the half-gain level within 20 sessions; HELD = stayed above' }, trades: J0.map(tradeOut) };
    log(line('SQ20-SPIKE2', o) + ' | controls ' + JSON.stringify(RES['SQ20-SPIKE2'].controls).slice(0, 900)); } }
// ---- D: turnover momentum ----
for (const id of Object.keys(STM.sizes)) { if (!need.includes(id)) continue; if (!STATUS.stmom.ok) { notRun(id, 'universe / turnover data incomplete: ' + JSON.stringify(STATUS.stmom) + ' ' + JSON.stringify({ tickerMap: STATUS.tickerMap && STATUS.tickerMap.ok, facts: STATUS.facts && STATUS.facts.ok, altShares: STATUS.altShares && STATUS.altShares.ok, domicile: STATUS.domicile && STATUS.domicile.ok })); continue; }
  const tr = [], note = { open: 0, artifacts: 0, notBought: 0 };
  for (const z of STMSIG[id]) { const S = seriesOf(z.i), r = holdFrom(S, z.t + 1, S.last, T, STM.hold); if (!r) { note.notBought++; continue; } if (r.pending || r.open) { note.open++; continue; } if (hasArt(z.i, r.k, r.x)) { note.artifacts++; continue; }
    tr.push({ ...z, S, ...r, sig: D[z.t], half: halfOf(D[z.t]) }); }
  const J0 = judgedRows(id, tr), o = judgeRows(J0, STM.hold, STM.hold);
  RES[id] = { ...o, name: RULES[id].name, kind: 'trade', notes: note, formations: STMF.length, picksPerMonth: STATUS.stmom[id === 'SQ20-STMOM-1000' ? 'avgPicks1000' : 'avgPicks500'], trades: J0.map(tradeOut) }; log(line(id, o)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; }, isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);

// ================= 10. PAPER LANE (from Monday 26 Oct 2026) =================
// A: the base rules' own newest signals (their labs' today files), kept only when the stock had no +40% / +25% day in the last 10 sessions
const BASE_TODAY = { PB12: ['data/squad11-today.json', 'SQ11-PB12'], MTUM: ['data/squad6-today.json', 'SQ6-MTUM'], QMOM: ['data/squad6-today.json', 'SQ6-QMOM'], FROG: ['data/decoded-today.json', 'DEC-FROG'], RESMOM: ['data/anomaly-today.json', 'ANOM-RESMOM'],
  SUESURGE: ['data/anomaly-today.json', 'ANOM-SUESURGE'], GOLD: ['data/macro-today.json', 'MACRO-GOLD-S20'], USD: ['data/macro-today.json', 'MACRO-USD-E60'] };
const baseToday = (b) => { if (b === 'FCF1') { const V = J('data/value-today.json', {}), R = V.rules && V.rules['B-FCF1']; if (!R || !R.formed || sessionOf(R.formed) < T - 6) return [];
    return (R.picks || []).filter(p => !p.blocked).map(p => ({ sym: p.sym, close: p.lastClose, d: R.formed })); }
  const [f, id] = BASE_TODAY[b], X = J(f, {}), M = X.methods && X.methods[id]; return M && Array.isArray(M.newSignals) ? M.newSignals.map(p => ({ sym: p.sym, close: p.close, d: p.d || X.lastClose })) : []; };
const jumpNow = (sym, thr) => { const i = SY.get(sym); if (i === undefined) { const S = EXTRA.get(sym); return S ? !!jumpBefore(S.c, T - 1, thr, S.art) : null; } return !!jumpBefore(cl(i), T - 1, thr, artOf(i)); };
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigIds = new Set(lines.filter(x => x.type === 'signal').map(x => x.id)), resIds = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), newLines = [], today = {};
const live = D[T - 1] >= START;
const addSig = (id, sym, d, close, plan, hold, stop) => { const lid = id + '|' + sym + '|' + d; if (!live || sigIds.has(lid)) return; sigIds.add(lid); newLines.push({ type: 'signal', id: lid, m: id, sym, d, close: r4(close), halal: halal(sym), hold, stop: stop || null, plan, recordedAfter: D[T - 1] }); };
for (const id of A_IDS) { const R0 = RULES[id], hold = R0.hold, list = baseToday(R0.base).filter(p => jumpNow(p.sym, R0.thr) === false);
  today[id] = { name: R0.name, hold, tier: firstRun[id] ? firstRun[id].verdict : null, newSignals: list.map(p => ({ sym: p.sym, close: p.close, halal: halal(p.sym), d: p.d })), note: 'the base rule ' + BASES[R0.base].id + '\'s newest signals without a +' + Math.round(R0.thr * 100) + '% day in the last 10 sessions' };
  for (const p of list) addSig(id, p.sym, p.d, p.close, 'buy the next open, sell at the close of session ' + hold, hold); }
{ const sg = SPK.signals.filter(z => z.t === T - 1); today['SQ20-SPIKE2'] = { name: RULES['SQ20-SPIKE2'].name, hold: SPIKE.hold, tier: firstRun['SQ20-SPIKE2'] ? firstRun['SQ20-SPIKE2'].verdict : null, newSignals: sg.map(z => ({ sym: z.sym, close: r4(CC(z.i, z.t)), halal: halal(z.sym), d: D[z.t], spike: D[z.s] })) };
  for (const z of sg) addSig('SQ20-SPIKE2', z.sym, D[z.t], CC(z.i, z.t), 'buy the next open; stop: sell at the next open after a close 15% under the buy; else sell at the close of session 63', SPIKE.hold, SPIKE.stop); }
for (const id of Object.keys(STM.sizes)) { const sg = STMSIG[id].filter(z => z.t === T - 1); today[id] = { name: RULES[id].name, hold: STM.hold, tier: firstRun[id] ? firstRun[id].verdict : null, newSignals: sg.map(z => ({ sym: z.sym, close: r4(CC(z.i, z.t)), halal: halal(z.sym), d: D[z.t] })) };
  for (const z of sg) addSig(id, z.sym, D[z.t], CC(z.i, z.t), 'buy the next open, sell at the close of session 21', STM.hold); }
// resolve paper signals whose hold is complete (buy = the first session after the signal date)
const board = {}; const closedBy = {};
for (const x of [...lines.filter(l => l.type === 'signal'), ...newLines.filter(l => l.type === 'signal')]) { const t = sessionOf(x.d); if (t < 0 || t + 1 > T - 1) continue; const i = SY.get(x.sym); const S = i !== undefined ? seriesOf(i) : EXTRA.get(x.sym); if (!S) continue;
  const r = x.stop ? holdStop(S, t + 1, S.last, T, x.hold, x.stop) : holdFrom(S, t + 1, S.last, T, x.hold); if (!r || r.open || r.pending) continue; const c = yard(r.k, r.x);
  (closedBy[x.m] || (closedBy[x.m] = [])).push({ d: x.d, sym: x.sym, g: r.g, c, halal: x.halal });
  if (!resIds.has(x.id)) { resIds.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[r.k], sell: D[r.x], kind: r.kind, g: r4(r.g), net: r4(r.g - COST), avgStock: c === null ? null : r4(c - COST) }); } }
for (const id of [...A_IDS, ...TRADE_IDS]) { const st = boardStats(closedBy[id] || []), fr = firstRun[id]; board[id] = { name: RULES[id].name, hold: RULES[id].hold, closed: st, ready: paperReady(st), fiveYear: fr ? { verdict: fr.verdict, why: fr.why, perYear: fr.perYear } : null }; }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, note: 'PAPER ONLY. Squad 20 (use the jump differently) recording forward from 26 Oct 2026. A rule needs a qualifying frozen 5-year verdict in BOTH halves (data/squad20-lab.json firstRun). The jump EXITS (SQ20-X*) are not buy rules and publish no signals; their adoption is in data/squad20-lab.json adoption. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.filter(x => x.type === 'signal').length + ' new signals, ' + newLines.filter(x => x.type === 'result').length + ' new results');

// ================= 11. OUTPUT + LIBRARY =================
const adoptionAll = {}; for (const id of [...A_IDS, ...B_IDS]) { const r = firstRun[id]; if (r && r.adoption) adoptionAll[id] = { adopt: r.adoption.adopt, why: r.adoption.why, base: r.base }; }
const out = { generatedAt: new Date().toISOString(), squad: 20, philosophy: 'use the jump differently: as an AVOID filter and an EXIT on the rules that work, as a second setup after the spike is digested, and one-month momentum among high-turnover large caps (Medhat & Schmeling 2022)',
  preRegistered: 'squad20-core.mjs header + RULES (25 Oct 2026, before any run) + data/strategy-library.json SQ20-*', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock at the same moments (capped +300%, AUD-1), better than the same stock on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= 2.5, return per year of capital above SPY -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN. A filters / B exits additionally carry the pre-registered ADOPT test (squad20-core.mjs adoptFilter / adoptExit).',
  rules: Object.fromEntries(IDS.map(id => [id, { name: RULES[id].name, hold: RULES[id].hold, kind: RULES[id].kind, rule: RULES[id].rule }])),
  firstRun, adoption: adoptionAll, reference: REFS, filterCounts: RMCOUNT, exitCounts: XCOUNT, stmomFormations: STMF.slice(-24),
  latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { verdict: r.verdict, why: r.why, results: r.results, perYear: r.perYear }])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-400)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result || !r.results) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.adoption ? '; ' + (r.adoption.adopt ? 'ADOPT' : 'do not adopt') + ' (' + (r.kind === 'exit' ? 'exit' : 'filter') + ')' : '') + (r.kind === 'exit' ? '' : '; forward paper lane from 26 Oct 2026');
    e.tested = String(r.window[1]); e.study = 'squad20-lab.mjs -> data/squad20-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock],
      perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], removedAvg: r.removed ? [r.removed.older.avg, r.removed.newer.avg] : undefined, removedN: r.removed ? [r.removed.older.n, r.removed.newer.n] : undefined,
      vsOriginal: r.vsOriginal ? [r.vsOriginal.older.diff, r.vsOriginal.newer.diff] : undefined, adopt: r.adoption ? r.adoption.adopt : undefined, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad20-lab: library not updated: ' + e.message); }
console.log('SQUAD 20 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + IDS.map(id => id + ' ' + (firstRun[id] ? firstRun[id].verdict + (firstRun[id].adoption ? (firstRun[id].adoption.adopt ? ' ADOPT' : '') : '') : (RES[id] || {}).verdict)).join(', '));
