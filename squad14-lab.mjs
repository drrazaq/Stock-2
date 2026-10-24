// SQUAD 14 LAB (24 Oct 2026): "VARIANTS OF THE FEW THINGS THAT WORKED" (squad14-core.mjs = the pre-registered rules, written before any run).
// Research + a FORWARD PAPER lane; never places an order; no Telegram.
// 1. DATA: exactly Squad 11's (copied): the 5-year whole-market price cache (study-cache/grouped.json.gz, RESTORED READ ONLY, dead stocks
//    included) + the sessions since (Massive grouped daily) + splits since; Squad 5's point-in-time market value (SEC facts and the historical
//    Form 3/4/5 ticker map from Squad 4's cache, read only; Squad 11's cache copied into this lab's own squad14-cache by the workflow).
//    SEC SIC 4-digit from SEC submissions (the same cache), else the price cache's SIC. SPUS from the cache, else Massive daily bars.
// 2. 5-YEAR ONE-SHOT for every SQ14 rule not yet frozen; first complete verdict frozen in data/squad14-lab.json firstRun (later runs =
//    monitoring only, `latest`). PB12P5 and MTPB are also run as one account vs SPY and SPUS per half (reported in firstRun[id].portfolio,
//    which scan.mjs tryQualifies reads).
// 3. PAPER LANE from Monday 26 Oct 2026: data/squad14-paper.jsonl, data/squad14-today.json (methods[id].newSignals = signals of the newest
//    close, to be bought the next session; shariahCandidates = today's 12-1 leaders with the Shariah proxy and the owner's ZAD mark),
//    data/squad14-board.json.
// DIAG=1: data coverage, leader sets, Shariah proxy and industry groups (a data check, no rule result); nothing judged or written in data/.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { tradeG } from './yardstick.mjs';
import { ownAverage, nextSession } from './anomaly-core.mjs';
import { cikFromSpans, artifactJumps, hasArtifact } from './squad4-core.mjs';
import { byCap, capAt, usCompany, addDays, debtCashAt, shariahOk } from './squad5-core.mjs';
import { yardOf, mtumPick, weeksOf, weekly } from './squad6-core.mjs';
import { RULES, IDS, PB_IDS, COST, SPLIT, PAPER_START, TOPN, BIGN, YEAR, SIDE, SIDE_STRESS, SLOTS, SLOT_W, MTPB_W, MTUM_MONTHS, LEADH, smaArr, monthEnds, leaderMonthOf, mom121, leaderPick, pullbackFirst, holdTrade, perYearOf, timing, byYear, shape, boardStats, paperReady,
  weeklyVol, mom6_12, lastWeekAt, sic4, groupsBySic, firstHighIn, firstHighArr, followers, addSignal, simAccount, pathStats, yearTable, tryWouldQualify, preRegister, mean, r4, halfOf } from './squad14-core.mjs';
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ14_CACHE || 'squad14-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = env.SQ14_OUT || 'data/squad14-lab.json', PAPER = 'data/squad14-paper.jsonl', TODAY = 'data/squad14-today.json', BOARD = 'data/squad14-board.json', LIB = env.SQ14_LIB || 'data/strategy-library.json';
const START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ14_MINUTES || 120) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(2.5, +LEAGUE.bar || 0, 4.0), STATUS = {};

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ14 entries written now'); }

// ================= 1. PRICES (as squad5-lab, with highs and lows) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad14-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || x.T === 'SPUS' || !CS.size) && x.c > 0);
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
const SIC0 = store.sic || {}; store = null;
if (!OFFLINE) { const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; HA[q] /= r; LA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), cl = (i) => CA.subarray(i * T, i * T + T), CC = (i, t) => CA[i * T + t];
if (spyI === undefined) { console.log('squad14-lab: SPY missing from the cache; nothing done'); process.exit(0); }
const lastI = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; }
const GONE = 5, vanishedI = (i) => lastI[i] >= 0 && lastI[i] < T - 1 - GONE;
const LIQ = new Uint8Array(N), DV20 = new Float32Array(N);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN; if (isFinite(w)) { s -= w; n--; } }
    if (t >= 19 && n === 20) { DV20[b + t] = s / 20; if (CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } } }
const liqMemo = new Map(), liqList = (t) => { if (t < 0) return []; if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const SPYC = cl(spyI), MENDS = monthEnds(D).filter(t => t >= 252);   // leader formation dates: month ends with a 12-1 month return
STATUS.price = { ok: T >= 1000 && withHL >= rowsAll * 0.9 && SPYC.filter(x => x > 0).length >= T * 0.95, sessions: T, from: D[0], to: D[T - 1], stocks: NS, rowsWithHighLow: r4(withHL / Math.max(1, rowsAll)) };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks), rows with high/low ' + pc(withHL / Math.max(1, rowsAll)) + ', month ends with 12-1: ' + MENDS.length + ' (' + (MENDS.length ? D[MENDS[0]] : '-') + ' on)');

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
const MS = MENDS;   // the month ends (leader / universe formation dates)
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
// ================= 4b. universe = squad 5's (above) =================
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';

// ================= 5. LEADER SETS, SHARIAH PROXY, INDUSTRY GROUPS (every month end; + the newest session when it is a month end: paper only) =================
const ser = (A, i) => A.subarray(i * T, i * T + T), series = (i) => ({ o: ser(OA, i), h: ser(HA, i), l: ser(LA, i), c: ser(CA, i) });
const LIVE_ME = nextSession(D[T - 1]).slice(0, 7) !== D[T - 1].slice(0, 7) && !MENDS.includes(T - 1), FORM = LIVE_ME ? [...MENDS, T - 1] : [...MENDS];
const WK = weeksOf(D), wkMemo = new Map(), wkOf = (i) => { if (!wkMemo.has(i)) wkMemo.set(i, weekly(series(i), WK).c); return wkMemo.get(i); };
const sicAt = (i, cik) => { const a = cik && SUBS[cik] && SUBS[cik].sic; if (a) return String(a).padStart(4, '0'); const x = SIC0[SYMS[i]]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECCIK[SYMS[i]]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
const L121 = new Map(), LMT = new Map(), M121 = new Map(), SHA = new Map(), GRP = new Map(), leadInfo = [];
for (const t of FORM) { const U = universe(t).ranked, top = U.slice(0, TOPN), rows = top.map(r => ({ key: r.i, m: mom121(cl(r.i), t) })), L = leaderPick(rows);
  L121.set(t, new Set(L)); M121.set(t, new Map(rows.filter(r => ok(r.m)).map(r => [r.key, r.m])));
  const lw = lastWeekAt(WK, t), mrows = top.map(r => ({ key: r.i, ...mom6_12(cl(r.i), t), vol: weeklyVol(wkOf(r.i), lw) })), LM = mtumPick(mrows, Math.ceil(TOPN * 0.20)); LMT.set(t, new Set(LM));
  const sh = new Map(); for (const r of top) if (L121.get(t).has(r.i)) { const co = coOf(r.cik), bs = co ? debtCashAt(co, D[t]) : { debt: null, cash: null }; sh.set(r.i, shariahOk({ sic: sicAt(r.i, r.cik), debt: bs.debt, cash: bs.cash, cap: r.cap })); } SHA.set(t, sh);
  const big = U.slice(0, BIGN), G = groupsBySic(big.map(r => ({ key: r.i, sic: sicAt(r.i, r.cik), cap: r.cap }))); GRP.set(t, G);
  leadInfo.push({ d: D[t], top300: top.length, top500: big.length, leaders121: L.length, leadersMtum: LM.length, overlap: LM.filter(i => L121.get(t).has(i)).length, shariahPass: [...sh.values()].filter(v => v.ok).length,
    big500WithSic: big.filter(r => sicAt(r.i, r.cik)).length, groups4: G.size, groupMembers: [...G.values()].reduce((a, g) => a + g.length, 0), cap300B: top[TOPN - 1] ? r4(top[TOPN - 1].cap / 1e9) : null }); }
const mtFirst = leadInfo.findIndex(x => x.leadersMtum >= 30);   // the MTUM list needs 52+ weekly returns: it starts at the first month end that has them
STATUS.leaders = { ok: MENDS.length >= 40 && mtFirst >= 0 && mtFirst <= 2 && leadInfo.every((x, j) => x.top300 === TOPN && x.leaders121 >= 50 && (j < mtFirst || x.leadersMtum >= 30)), firstMtum: mtFirst >= 0 ? leadInfo[mtFirst].d : null, months: MENDS.length, first: MENDS.length ? D[MENDS[0]] : null, minLeaders121: Math.min(...leadInfo.map(x => x.leaders121)), minLeadersMtum: Math.min(...leadInfo.map(x => x.leadersMtum)), avgOverlap: r4(mean(leadInfo.map(x => x.overlap))) };
STATUS.sic = { ok: leadInfo.every(x => x.big500WithSic >= x.top500 * 0.95), minShareWithSic: r4(Math.min(...leadInfo.map(x => x.big500WithSic / Math.max(1, x.top500)))), minGroups: Math.min(...leadInfo.map(x => x.groups4)) };
STATUS.shariah = { ok: leadInfo.every(x => x.shariahPass >= 5), avgPassOf60: r4(mean(leadInfo.map(x => x.shariahPass))), whyOut: (() => { const w = {}; for (const m of SHA.values()) for (const v of m.values()) if (!v.ok) { const k = v.why.replace(/ \(SIC.*/, ''); w[k] = (w[k] || 0) + 1; } return w; })() };
log('leaders: ' + JSON.stringify(STATUS.leaders) + ' | sic: ' + JSON.stringify(STATUS.sic) + ' | shariah: ' + JSON.stringify(STATUS.shariah));
// SPUS (price only): the cache, else Massive daily bars
const SPUS = new Float64Array(T).fill(NaN); { const i = SY.get('SPUS'); let src = 'none';
  if (i !== undefined) { for (let t = 0; t < T; t++) if (CC(i, t) > 0) SPUS[t] = CC(i, t); src = 'cache'; }
  if ([...SPUS].filter(x => x > 0).length < T * 0.9) {   // DIAG 24 Oct: the price cache has no SPUS before the fresh sessions -> Massive daily bars
    SPUS.fill(NaN); src = 'none'; const j = await api('/v2/aggs/ticker/SPUS/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000'); if (j && Array.isArray(j.results)) { const m = new Map(j.results.map(b => [iso(b.t), b.c])); for (let t = 0; t < T; t++) { const v = m.get(D[t]); if (v > 0) SPUS[t] = v; } src = 'massive'; } }
  STATUS.spus = { ok: true, src, sessions: [...SPUS].filter(x => x > 0).length, note: 'information (portfolio comparison); SPY is the gate' }; log('SPUS: ' + JSON.stringify(STATUS.spus)); }
if (DIAG) { const pick = FORM.filter((t, j) => j % 8 === 0 || j === FORM.length - 1);
  console.log('SQUAD 14 DIAGNOSTICS (data coverage, leader sets, Shariah proxy and industry groups only; nothing judged or written)');
  console.log('DATA ' + JSON.stringify(STATUS)); for (const x of leadInfo) console.log('MONTH ' + JSON.stringify(x));
  for (const t of pick) { const nm = (s) => [...s].map(i => SYMS[i]).sort().join(' ');
    console.log('SNAP ' + D[t] + ' | 12-1 leaders: ' + nm(L121.get(t)) + ' | MTUM-style: ' + nm(LMT.get(t)) + ' | Shariah proxy pass: ' + [...SHA.get(t)].filter(([, v]) => v.ok).map(([i]) => SYMS[i]).sort().join(' '));
    console.log('GROUPS ' + D[t] + ' | ' + [...GRP.get(t)].sort((a, b) => b[1].length - a[1].length).slice(0, 25).map(([g, k]) => g + ': ' + k.slice(0, 5).map(i => SYMS[i]).join(',') + (k.length > 5 ? '..(' + k.length + ')' : '')).join(' | ')); }
  process.exit(0); }

// ================= 6. SIGNALS AND TRADES =================
const TR = {}, SG = {}, NOTE = {}; for (const id of IDS) { TR[id] = []; SG[id] = []; NOTE[id] = { artifacts: 0, open: 0, notBought: 0, skippedBusy: 0 }; }
const JUMPS = new Map(); const jumpsOf = (i) => { if (!JUMPS.has(i)) JUMPS.set(i, artifactJumps(cl(i))); return JUMPS.get(i); };
const busyUntil = {}; for (const id of IDS) busyUntil[id] = new Map();
function addTrade(id, t, i, t0, plan, extra = {}) { const bm = busyUntil[id]; if ((bm.get(i) ?? -1) >= t + 1) { NOTE[id].skippedBusy++; return null; }
  if (D[t] >= START || t === T - 1) SG[id].push({ t, i, plan });
  const r = holdTrade(series(i), t, lastI[i], T, RULES[id].hold); if (!r) { NOTE[id].notBought++; return null; } if (r.pending) { bm.set(i, Infinity); return null; }
  if (r.open) { NOTE[id].open++; bm.set(i, Infinity); const z = { t, i, t0, open: true, k: r.k, px0: r.px0, ...extra }; TR[id].push(z); return z; }
  bm.set(i, r.x); if (hasArtifact(jumpsOf(i), r.k, r.x)) { NOTE[id].artifacts++; return null; } const z = { t, i, t0, ...r, ...extra }; TR[id].push(z); return z; }
const sCache = new Map(); const sArr = (i) => { if (!sCache.has(i)) { const c = Float64Array.from(cl(i)); sCache.set(i, { c, s200: smaArr(c, 200) }); } return sCache.get(i); };
const pb = (i, t, pct) => { const A = sArr(i); return pullbackFirst(A.c, A.s200, t, pct); };
const planPB = 'buy the next open; sell at the close of session 126 (about 6 months)';
// PB rules: every stock that was ever a leader (either list), day by day, while it is a leader of the latest month end before t
const RAW = [];   // SQ11-PB12 signals with no busy filter (the 5-slot account picks from them)
{ const ever = new Set(); for (const m of [L121, LMT]) for (const s of m.values()) for (const i of s) ever.add(i);
  for (const i of [...ever].sort((a, b) => a - b)) for (let t = MENDS[0] + 1; t < T; t++) { if (!LIQ[i * T + t]) continue; const t0 = leaderMonthOf(MENDS, t); if (t0 < 0) continue;
    const in121 = L121.get(t0).has(i), inM = LMT.get(t0).has(i); if (!in121 && !inM) continue;
    const p12 = pb(i, t, 0.12);
    if (inM && p12) addTrade('SQ14-PB12M', t, i, t0, planPB);
    if (in121 && pb(i, t, 0.15)) addTrade('SQ14-PB15', t, i, t0, planPB);
    if (in121 && p12) { RAW.push({ t, i, t0, pri: M121.get(t0).get(i) ?? 0 }); const v = SHA.get(t0).get(i); if (v && v.ok) addTrade('SQ14-PB12H', t, i, t0, planPB + ' (passes the Shariah proxy at ' + D[t0] + '; check ZAD)'); } } }
// SQ14-PB12P5: candidates = every raw PB12 signal's own trade; the account decides
const P5C = []; for (const s of RAW.sort((a, b) => a.t - b.t || b.pri - a.pri || a.i - b.i)) { if (D[s.t] >= START || s.t === T - 1) SG['SQ14-PB12P5'].push({ t: s.t, i: s.i, plan: planPB + ' - only if fewer than 5 PB12 positions are open; size 20% of the account' });
  const r = holdTrade(series(s.i), s.t, lastI[s.i], T, 126); if (!r || r.pending) continue; if (!r.open && hasArtifact(jumpsOf(s.i), r.k, r.x)) { NOTE['SQ14-PB12P5'].artifacts++; continue; }
  P5C.push({ id: s.i + '|' + s.t, key: s.i, i: s.i, k: r.k, x: r.open ? null : r.x, pri: s.pri, w: SLOT_W, z: { t: s.t, i: s.i, t0: s.t0, ...r } }); }
// SQ14-LEADH4
{ const fh = new Map(), fhOf = (i) => { if (!fh.has(i)) fh.set(i, firstHighArr(Float64Array.from(cl(i)))); return fh.get(i); }; let sigs = 0;
  for (let t = MENDS[0] + 1; t < T; t++) { const t0 = leaderMonthOf(MENDS, t); if (t0 < 0) continue;
    for (const [g, keys] of GRP.get(t0)) { const L = keys[0]; if (!fhOf(L)[t]) continue; sigs++;
      for (const f of followers(keys, (k) => CC(k, t) > 0 && CC(k, t - LEADH.followLook) > 0 ? CC(k, t) / CC(k, t - LEADH.followLook) - 1 : null)) if (LIQ[f * T + t]) addTrade('SQ14-LEADH4', t, f, t0, 'buy the next open; sell at the close of session 63 (leader ' + SYMS[L] + ', SIC ' + g + ', first 52-week high in 63 sessions)', { leader: SYMS[L], sic: g }); } }
  NOTE['SQ14-LEADH4'].leaderSignals = sigs; }
// SQ14-MTPB: base at the May / November month ends + one add on the first 12% pullback
const REV = FORM.filter(t => MTUM_MONTHS.includes(+D[t].slice(5, 7)));
const MTA = [];   // add trades
for (const t of REV) for (const i of [...LMT.get(t)].sort((a, b) => a - b)) { const b = addTrade('SQ14-MTPB', t, i, t, 'buy the next open (MTUM-style book, ' + D[t] + '); sell at the close of session 126; add a second piece on its first 12% pullback', { role: 'base' });
  if (!b || !ok(b.k)) continue; const end = b.open ? T : b.x, ta = addSignal({ k: b.k, x: end }, (u) => u < T && LIQ[i * T + u] === 1 && pb(i, u, 0.12)); if (ta === null) continue; const k = ta + 1;
  if (D[ta] >= START || ta === T - 1) SG['SQ14-MTPB'].push({ t: ta, i, plan: 'ADD a second piece at the next open (first 12% pullback while held); sell with the base at ' + (b.open ? 'its session-126 close' : D[b.x]) });
  if (k > T - 1) continue; const S = series(i); if (!(S.o[k] > 0)) continue;
  if (b.open) { MTA.push({ t: ta, i, t0: t, open: true, k, px0: S.o[k], role: 'add', base: b }); continue; }
  if (hasArtifact(jumpsOf(i), k, b.x)) continue; const px1 = b.px1; MTA.push({ t: ta, i, t0: t, k, x: b.x, px0: S.o[k], px1, g: px1 / S.o[k] - 1, kind: b.kind, days: b.x - k + 1, role: 'add', base: b }); }
TR['SQ14-MTPB'].push(...MTA);
log('trades: ' + IDS.map(id => id + ' ' + TR[id].length).join(', ') + ' | PB12 raw signals ' + RAW.length + ' | MTPB adds ' + MTA.length);

// ================= 7. THE ACCOUNTS (PB12P5, MTPB) =================
const pxApi = { o: (i, k) => OA[i * T + k], c: (i, k) => CA[i * T + k] };
const s0 = MENDS[0], YE = (() => { let k = -1; for (let t = 0; t < T; t++) if (D[t] < SPLIT) k = t; return k; })(), spyLv = Float64Array.from(SPYC, x => x > 0 ? x : NaN);
function portStats(eq, label) { const lv = new Float64Array(T).fill(NaN); lv[s0] = 1; for (let k = s0 + 1; k < T; k++) lv[k] = eq[k]; const out = {};
  for (const [h, [a, b]] of Object.entries({ older: [s0, YE], newer: [YE, T - 1], all: [s0, T - 1] })) { const rule = pathStats(lv, a, b), spy = pathStats(spyLv, a, b), spus = pathStats(SPUS, a, b);
    out[h] = { from: D[a], to: D[b], rule, spy, spus, beatsSpy: !!(rule && spy && rule.cagr > spy.cagr), beatsSpus: spus ? !!(rule && rule.cagr > spus.cagr) : null }; }
  return { label, halves: out, years: yearTable(D, lv, spyLv, SPUS, s0) }; }
const ACC = {};
{ const mk = (cands, maxOpen) => { const A = simAccount({ T, start: s0 + 1, cands, maxOpen, px: pxApi, side: SIDE }), B = simAccount({ T, start: s0 + 1, cands, maxOpen, px: pxApi, side: SIDE_STRESS });
    return { A, B, P: { standard: portStats(A.eq, '0.4% per side'), stress: portStats(B.eq, '0.6% per side'), taken: A.taken.length, candidates: cands.length, skipped: A.skipped } }; };
  const p5 = mk(P5C, SLOTS); ACC['SQ14-PB12P5'] = p5.P; const took = new Set(p5.A.taken);
  for (const c of P5C) if (took.has(c.id)) { const z = c.z; if (z.open) NOTE['SQ14-PB12P5'].open++; TR['SQ14-PB12P5'].push(z.open ? { t: z.t, i: z.i, t0: z.t0, open: true, k: z.k, px0: z.px0 } : z); }
  NOTE['SQ14-PB12P5'].skipped = p5.A.skipped;
  const mc = TR['SQ14-MTPB'].map((z, j) => ({ id: (z.role === 'add' ? 'a' : 'b') + z.i + '|' + z.t, key: (z.role === 'add' ? 'a' : 'b') + z.i, i: z.i, k: z.k, x: z.open ? null : z.x, pri: z.role === 'add' ? 1 : 2, w: MTPB_W }));
  const mt = mk(mc, Infinity); ACC['SQ14-MTPB'] = mt.P; NOTE['SQ14-MTPB'].accountSkipped = mt.A.skipped;
  for (const id of Object.keys(ACC)) { const P = ACC[id], H = P.standard.halves; P.beatsSpyBothHalves = !!(H.older.beatsSpy && H.newer.beatsSpy); P.beatsSpyBothHalvesStress = !!(P.stress.halves.older.beatsSpy && P.stress.halves.newer.beatsSpy);
    log('account ' + id + ': ' + ['older', 'newer'].map(h => h + ' CAGR ' + pc(H[h].rule && H[h].rule.cagr) + ' DD ' + pc(H[h].rule && H[h].rule.maxDD) + ' vs SPY ' + pc(H[h].spy && H[h].spy.cagr) + ' DD ' + pc(H[h].spy && H[h].spy.maxDD) + ' SPUS ' + pc(H[h].spus && H[h].spus.cagr)).join(' | ') + ' | taken ' + P.taken + '/' + P.candidates + ' ' + JSON.stringify(P.skipped)); } }

// ================= 8. 5-YEAR ONE-SHOT (per trade) =================
const priceAt = (i, x, at) => { if (x > T - 1) return null; if (at === 'o') { const z = OA[i * T + x]; if (z > 0) return z; if (x > lastI[i]) { for (let q = x; q >= 0; q--) if (CA[i * T + q] > 0) return CA[i * T + q]; } return null; } for (let q = Math.min(x, T - 1); q >= 0; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const yMemo = new Map(); const yard = (k, x) => { const key = k + '|' + x; if (yMemo.has(key)) return yMemo.get(key);
  const st = liqList(k - 1).filter(i => i % 2 === 0 && !hasArtifact(jumpsOf(i), k, x)); const m = yardOf(st, k, x, 'c', priceAt, 'capBoth', 50); yMemo.set(key, m); return m; };
const spyG = (k, x) => { const a = OA[spyI * T + k], b = priceAt(spyI, x, 'c'); return a > 0 && b > 0 ? b / a - 1 : null; };
const ownM = new Map();
function judged(id) { const all = TR[id].filter(z => !z.open), sp = new Map(); for (const z of all) (sp.get(z.i) || sp.set(z.i, []).get(z.i)).push([z.k, z.x]);
  const tr = []; for (const z of all) { const g = tradeG(z.g, 'capBoth'); if (!isFinite(g)) continue; const c = yard(z.k, z.x); if (c === null) continue; const half = halfOf(D[z.t]), len = z.x - z.k + 1, key = z.i + '|' + len + '|' + half;
    if (!ownM.has(key)) ownM.set(key, ownAverage({ from: 253, to: T - 1, len, step: 10, busy: sp.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === half, ret: (u, x) => { const e = OA[z.i * T + u], y = priceAt(z.i, x, 'c'); return e > 0 && y > 0 ? y / e - 1 : null; }, mode: 'capBoth' }));
    let twin = null; if (PB_IDS.includes(id)) { const tw = holdTrade(series(z.i), z.t0, lastI[z.i], T, RULES[id].hold); if (tw && !tw.open && !tw.pending && !hasArtifact(jumpsOf(z.i), tw.k, tw.x)) twin = tradeG(tw.g, 'capBoth'); }
    tr.push({ t: z.t, s: SYMS[z.i], i: z.i, k: z.k, x: z.x, g, c, own: ownM.get(key), spy: spyG(z.k, z.x), twin, half, days: z.days, kind: z.kind, sig: D[z.t], role: z.role || null, leader: z.leader || null, sic: z.sic || null }); }
  return tr; }
const need = IDS.filter(id => !FROZEN[id]), RES = {};
const dataOk = () => Object.entries(STATUS).filter(([, v]) => v && v.ok === false).map(([k]) => k);
const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tB ' + h.tBlock + ' win ' + pc(h.win);
for (const id of IDS) { if (dataOk().length) { RES[id] = { verdict: 'NOT RUN', why: 'data incomplete: ' + dataOk().join(', ') + ' ' + JSON.stringify(Object.fromEntries(dataOk().map(k => [k, STATUS[k]]))).slice(0, 600) }; continue; }
  if (left() < 5 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = judged(id), blk = RULES[id].block, by = { older: tr.filter(z => z.half === 'older'), newer: tr.filter(z => z.half === 'newer') };
  const R = { older: halfStat(by.older, blk), newer: halfStat(by.newer, blk), all: halfStat(tr, blk) };
  const PY = Object.fromEntries(['older', 'newer'].map(h => [h, { rule: r4(perYearOf(by[h], 'g', COST)), spy: r4(perYearOf(by[h], 'spy', 0)), avgStock: r4(perYearOf(by[h], 'c', 0)) }]));
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks held as long on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] } });
  const kinds = {}; for (const z of tr) kinds[z.kind] = (kinds[z.kind] || 0) + 1;
  RES[id] = { ...v, name: RULES[id].name, hold: RULES[id].hold, block: blk, cost: COST, split: SPLIT, yardstick: 'capBoth (AUD-1)', results: R, perYear: PY,
    timing: PB_IDS.includes(id) ? { older: timing(by.older), newer: timing(by.newer), all: timing(tr), note: 'twin = the same leader bought at the open after its leader month end (the fixed date), same hold; dipMinusFixed > 0 = waiting for the dip paid' } : null,
    byYear: byYear(tr), shape: { older: shape(by.older), newer: shape(by.newer) }, exits: kinds, notes: NOTE[id],
    trades: tr.map(z => ({ s: z.s, sig: z.sig, buy: D[z.k], sell: D[z.x], kind: z.kind, role: z.role || undefined, leader: z.leader || undefined, sic: z.sic || undefined, net: r4(z.g - COST), avgStock: r4(z.c - COST), spy: r4(z.spy), sameStock: r4(ok(z.own) ? z.own - COST : null), fixedDate: r4(ok(z.twin) ? z.twin - COST : null) })) };
  if (ACC[id]) RES[id].portfolio = ACC[id];
  if (id === 'SQ14-MTPB') RES[id].legs = Object.fromEntries(['base', 'add'].map(role => { const a = tr.filter(z => z.role === role); return [role, { older: halfStat(a.filter(z => z.half === 'older'), blk), newer: halfStat(a.filter(z => z.half === 'newer'), blk), perYear: Object.fromEntries(['older', 'newer'].map(h => { const b = a.filter(z => z.half === h); return [h, { rule: r4(perYearOf(b, 'g', COST)), spy: r4(perYearOf(b, 'spy', 0)) }]; })), note: 'information only' }]; }));
  if (id === 'SQ14-PB12H') RES[id].shariahProxy = STATUS.shariah;
  RES[id].tryWouldQualify = tryWouldQualify(RES[id]);
  const tm = RES[id].timing, P = RES[id].portfolio;
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | per year rule/SPY older ' + pc(PY.older.rule) + '/' + pc(PY.older.spy) + ' newer ' + pc(PY.newer.rule) + '/' + pc(PY.newer.spy)
    + (tm ? ' | dip minus fixed date older ' + pc(tm.older.dipMinusFixed) + ' newer ' + pc(tm.newer.dipMinusFixed) : '') + (P ? ' | account beats SPY both halves ' + P.beatsSpyBothHalves : '') + ' | TRY SMALL ' + (RES[id].tryWouldQualify.qualifies ? 'YES' : 'no: ' + RES[id].tryWouldQualify.why.join('; ')) + ' | ' + String(RES[id].why).slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; }, isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);

// ================= 9. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigIds = new Set(lines.filter(x => x.type === 'signal').map(x => x.id)), resIds = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), newLines = [];
const fromT = D.findIndex(d => d >= START), board = {}, today = {};
for (const id of IDS) { const mine = []; if (fromT >= 0) for (const s of SG[id]) { if (s.t < fromT) continue; const sym = SYMS[s.i], lid = id + '|' + sym + '|' + D[s.t];
    if (!sigIds.has(lid)) { sigIds.add(lid); newLines.push({ type: 'signal', id: lid, m: id, sym, d: D[s.t], close: r4(CC(s.i, s.t)), halal: halal(sym), plan: s.plan, recordedAfter: D[T - 1] }); } mine.push(lid); }
  const closed = []; for (const z of TR[id]) { if (fromT < 0 || z.t < fromT || z.open) continue; const sym = SYMS[z.i], lid = id + '|' + sym + '|' + D[z.t], c = yard(z.k, z.x);
    closed.push({ d: D[z.t], sym, g: z.g, c, halal: halal(sym) }); if (!resIds.has(lid)) { resIds.add(lid); newLines.push({ type: 'result', id: lid, m: id, sym, d: D[z.t], buy: D[z.k], sell: D[z.x], kind: z.kind, g: r4(z.g), net: r4(z.g - COST), avgStock: c === null ? null : r4(c - COST) }); } }
  const st = boardStats(closed), fr = firstRun[id];
  board[id] = { name: RULES[id].name, hold: RULES[id].hold, signals: mine.length, open: TR[id].filter(z => z.open && fromT >= 0 && z.t >= fromT).length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: paperReady(st), fiveYear: fr ? { verdict: fr.verdict, why: fr.why, tryWouldQualify: fr.tryWouldQualify } : null };
  today[id] = { name: RULES[id].name, hold: RULES[id].hold, tier: fr ? fr.verdict : null, newSignals: SG[id].filter(s => s.t === T - 1).map(s => ({ sym: SYMS[s.i], close: r4(CC(s.i, s.t)), halal: halal(SYMS[s.i]), d: D[s.t], plan: s.plan })),
    open: TR[id].filter(z => z.open && fromT >= 0 && z.t >= fromT).map(z => ({ sym: SYMS[z.i], halal: halal(SYMS[z.i]), signal: D[z.t], buy: z.k <= T - 1 ? D[z.k] : null, sinceBuy: z.px0 ? r4(CC(z.i, lastI[z.i]) / z.px0 - 1) : null })) }; }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
// today's Shariah-proxy candidates (SQ14-PB12H) with the owner's ZAD mark: the newest 12-1 leaders, their proxy verdict, and how far under the 50-day high
const tN = FORM[FORM.length - 1], candidates = [...L121.get(tN)].map(i => { const A = sArr(i), hi = (() => { let m = -Infinity; for (let k = T - 50; k < T; k++) if (A.c[k] > m) m = A.c[k]; return m; })(), v = SHA.get(tN).get(i) || { ok: false, why: 'n/a' };
  return { sym: SYMS[i], mom121: r4(M121.get(tN).get(i)), shariahProxy: v.ok ? 'pass' : 'fail: ' + v.why, zad: halal(SYMS[i]), underHigh50: r4(A.c[T - 1] / hi - 1), above200: A.c[T - 1] > A.s200[T - 1] }; }).sort((a, b) => b.mom121 - a.mom121);
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, leadersAsOf: D[tN], shariahCandidates: candidates,
  mtumBook: [...LMT.get(tN)].map(i => ({ sym: SYMS[i], halal: halal(SYMS[i]) })),
  note: 'PAPER ONLY. Squad 14 (variants of what worked: leader pullbacks, MTUM, leader-follower) recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a qualifying frozen 5-year verdict in BOTH halves (data/squad14-lab.json firstRun). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy; the Shariah proxy is NOT ZAD.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.filter(x => x.type === 'signal').length + ' new signals, ' + newLines.filter(x => x.type === 'result').length + ' new results; today: ' + IDS.map(id => id + ' ' + today[id].newSignals.length).join(', '));

// ================= 10. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), squad: 14, preRegistered: 'squad14-core.mjs header + RULES (24 Oct 2026, before any run) + data/strategy-library.json SQ14-*', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS, leadersPerMonth: leadInfo,
  luck: 'VARIANTS OF A WINNER: 6 rules tried here (SQ14-PB12M, PB15, PB12P5, PB12H, LEADH4, MTPB), one version each, all chosen after SQ11-PB12 / SQ6-MTUM / SQ13-LEADH were seen; SQ11 itself tried 7 rules and the library holds ~450 ideas. A variant that passes is weaker evidence than an independent idea; read block t against the proof bar, not 2.5.',
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock bought and sold at the same moments (rule and yardstick capped at +300%, AUD-1), better than the same stock held as long on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= 2.5, return per year of capital tied up above SPY on the same days -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN. PB12P5 / MTPB also as one account (0.4% per side) vs SPY and SPUS per half.',
  rules: Object.fromEntries(IDS.map(id => [id, { name: RULES[id].name, hold: RULES[id].hold, rule: RULES[id].rule }])),
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-600)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results, H = r.portfolio ? r.portfolio.standard.halves : null;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'squad14-lab.mjs -> data/squad14-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock],
      perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], portfolioCagr: H ? [H.older.rule && H.older.rule.cagr, H.newer.rule && H.newer.rule.cagr] : undefined, spyCagr: H ? [H.older.spy && H.older.spy.cagr, H.newer.spy && H.newer.spy.cagr] : undefined,
      tryWouldQualify: r.tryWouldQualify ? r.tryWouldQualify.qualifies : null, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad14-lab: library not updated: ' + e.message); }
console.log('SQUAD 14 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + IDS.map(id => id + ' ' + (firstRun[id] ? firstRun[id].verdict + (firstRun[id].tryWouldQualify && firstRun[id].tryWouldQualify.qualifies ? ' (TRY SMALL)' : '') : (RES[id] || {}).verdict)).join(', '));
