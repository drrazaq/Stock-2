// SQUAD 16 LAB (24 Oct 2026): "WHERE WINNING STOCK METHODS ARE PUBLISHED" - a wide sweep of books, fund rulebooks, screen sites and papers
// (squad16-core.mjs = the pre-registered rules and the source table, written before any run). Research + a FORWARD PAPER lane; never
// places an order; no Telegram.
// 1. DATA: Squad 14's (copied): the 5-year whole-market price cache (study-cache/grouped.json.gz, RESTORED READ ONLY, dead stocks included)
//    + the sessions since (Massive grouped daily) + splits since; Squad 5's point-in-time market value (SEC facts and the historical Form
//    3/4/5 ticker map from Squad 4's cache, read only; Squad 5 / 11 / 14 caches copied into this lab's own squad16-cache by the workflow);
//    plus EXTRA SEC items (assets, net income, payouts, working capital, fixed assets) for the 1100 largest at every review, from the SEC
//    companyfacts files (bulk file when many are missing). SPUS from the cache, else Massive daily bars.
// 2. 5-YEAR ONE-SHOT for every SQ16 rule not yet frozen; first complete verdict frozen in data/squad16-lab.json firstRun (later runs =
//    monitoring only, `latest`). Every basket is also run as one account vs SPY and SPUS per half (firstRun[id].portfolio, which scan.mjs
//    tryQualifies reads).
// 3. PAPER LANE from Monday 26 Oct 2026: data/squad16-paper.jsonl, data/squad16-today.json (methods[id].newSignals = names that enter a
//    basket at the newest review close, to be bought the next session; basket = the current holdings), data/squad16-board.json.
// DIAG=1: data coverage and selection counts (a data check, no rule result); nothing judged or written in data/.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, ttmAt, instantAt, shiftYear } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { tradeG } from './yardstick.mjs';
import { ownAverage, nextSession } from './anomaly-core.mjs';
import { cikFromSpans, artifactJumps, hasArtifact } from './squad4-core.mjs';
import { byCap, capAt, usCompany, addDays, debtCashAt } from './squad5-core.mjs';
import { yardOf } from './squad6-core.mjs';
import { smaArr, monthEnds, leaderMonthOf, mom121, holdTrade } from './squad14-core.mjs';
import { RULES, IDS, BASKET_IDS, NOT_TESTED, MONTHS, COST, SPLIT, PAPER_START, SIDE, SIDE_STRESS, STALE, finSic, utilSic, sic2, magicMetrics, magicRank, acqMultiple, fScore, qvalPick, rankSumPick, topBy, earnVar, msciRank, bufferPick, cappedWeights,
  shYield, indPick, rsHighArr, blueDot, annualVals, instantNear, sleeveHeld, episodes, episodeTrade, simAccount2, pathStats, yearTable, tryWouldQualify, perYearOf, byYear, shape, boardStats, paperReady, preRegister, r4, halfOf } from './squad16-core.mjs';
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ16_CACHE || 'squad16-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = env.SQ16_OUT || 'data/squad16-lab.json', PAPER = 'data/squad16-paper.jsonl', TODAY = 'data/squad16-today.json', BOARD = 'data/squad16-board.json', LIB = env.SQ16_LIB || 'data/strategy-library.json';
const START = env.PAPER_START || PAPER_START, PROV = 1200;   // provisional largest companies whose share counts and domicile are fetched (the rules rank up to the 1000 largest)
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ16_MINUTES || 120) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(2.5, +LEAGUE.bar || 0, 4.0), STATUS = {};

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ16 entries written now'); }

// ================= 1. PRICES (as squad5-lab, with highs and lows) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad16-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
if (spyI === undefined) { console.log('squad16-lab: SPY missing from the cache; nothing done'); process.exit(0); }
const lastI = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; }
const GONE = 5, vanishedI = (i) => lastI[i] >= 0 && lastI[i] < T - 1 - GONE;
const LIQ = new Uint8Array(N), DV20 = new Float32Array(N);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN; if (isFinite(w)) { s -= w; n--; } }
    if (t >= 19 && n === 20) { DV20[b + t] = s / 20; if (CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } } }
const liqMemo = new Map(), liqList = (t) => { if (t < 0) return []; if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const SPYC = cl(spyI), MENDS = monthEnds(D).filter(t => t >= 19);   // review / universe dates: every month end with a 20-session traded value
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
const MS = MENDS;   // the month ends (review / universe dates)
// ---- SQUAD 16 EXTRA SEC items (assets, net income, payouts, working capital, fixed assets; facts from 2015 for 5 fiscal years of net income);
// own cache squad16-cache/extra-*.json.gz, filled from the same companyfacts files as the share counts, else the bulk file ----
const EXTAGS = { assets: ['Assets'], ni: ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'], div: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'], rep: ['PaymentsForRepurchaseOfCommonStock'],
  iss: ['ProceedsFromIssuanceOfCommonStock'], ca: ['AssetsCurrent'], cl: ['LiabilitiesCurrent'], ppe: ['PropertyPlantAndEquipmentNet'], dcur: ['LongTermDebtCurrent', 'DebtCurrent'], ltd: ['LongTermDebtNoncurrent', 'LongTermDebt'] };
const EXALL = [...new Set(Object.values(EXTAGS).flat())];
function exCompact(j) { const out = {}, g = j && j.facts && j.facts['us-gaap']; if (!g) return out;
  for (const tag of EXALL) { const u = g[tag] && g[tag].units && g[tag].units.USD; if (!Array.isArray(u)) continue; const rows = [], seen = new Set();
    for (const x of [...u].sort((a, b) => a.filed < b.filed ? -1 : 1)) { if (!x || !x.end || !x.filed || !isFinite(x.val) || x.end < '2015-01-01') continue; if (x.start) { const dd = (Date.parse(x.end) - Date.parse(x.start)) / 864e5 + 1; if (!((dd >= 80 && dd <= 100) || (dd >= 170 && dd <= 190) || (dd >= 260 && dd <= 285) || (dd >= 350 && dd <= 380))) continue; } const k = (x.start || '') + '|' + x.end + '|' + x.val; if (seen.has(k)) continue; seen.add(k); rows.push([x.start || '', x.end, x.val, x.filed]); }
    if (rows.length) out[tag] = rows; }
  return out; }
const EXTRA = {}; for (let k = 0; k < NSH; k++) Object.assign(EXTRA, JZ(SC + '/extra-' + k + '.json.gz', {}));
const saveExtra = () => { const parts = Array.from({ length: NSH }, () => ({})); for (const [c, v] of Object.entries(EXTRA)) parts[+c % NSH][c] = v; parts.forEach((o, k) => WZ(SC + '/extra-' + k + '.json.gz', o)); };
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
    if (t >= 19) for (const r of byCap(rowsAt(t, false).rows).slice(0, PROV)) if (!(r.cik in ALT)) want.add(r.cik); }
  let got = 0; if (!OFFLINE) for (const c of want) { if (left() < 75 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null; try { r = await fetch(SECD + '/api/xbrl/companyfacts/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); } catch (e) {}
    if (r && r.ok) { const j = await r.json().catch(() => null); if (j) { ALT[c] = altFrom(j); EXTRA[c] = exCompact(j); got++; } } else if (r && r.status === 404) { ALT[c] = []; EXTRA[c] = {}; } }
  if (got) { W(SC + '/alt-shares-v3.json', ALT); saveExtra(); } STATUS.altShares = { ok: [...want].filter(c => !(c in ALT)).length <= Math.max(5, want.size * 0.02), wanted: want.size, fetchedNow: got, known: Object.values(ALT).filter(a => a.length).length }; log('statement share counts: ' + JSON.stringify(STATUS.altShares)); }
// ---- domicile (SEC submissions: business address + 20-F / 40-F filings; also the SIC code); own cache ----
function rowsAt(t, useDom) { const rows = new Map(); let noCik = 0, noFacts = 0, noShares = 0, foreign = 0;
  for (const i of liqList(t)) { const cik = cikAt(i, D[t]); if (!cik) { noCik++; continue; } if (!coOf(cik)) { noFacts++; continue; } if (useDom && SUBS[cik] && SUBS[cik].us === false) { foreign++; continue; } const cap = capOf(i, cik, t); if (!cap) noShares++;
    const r = { key: i, i, cik, dv: DV20[i * T + t], close: CC(i, t), cap }, o = rows.get(cik); if (!o || r.dv > o.dv) rows.set(cik, r); }
  return { rows: [...rows.values()], noCik, noFacts, noShares, foreign }; }
{ const want = new Set(); for (const t of [...MS.filter(x => x >= 19), T - 1]) for (const r of byCap(rowsAt(t, false).rows).slice(0, PROV)) if (!(r.cik in SUBS)) want.add(r.cik);
  let got = 0, fail = 0; if (!OFFLINE) for (const c of want) { if (left() < 70 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null; try { r = await fetch(SECD + '/submissions/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); } catch (e) {}
    if (r && r.ok) { const j = await r.json().catch(() => null); if (j) { const st = j.addresses && j.addresses.business && j.addresses.business.stateOrCountry, forms = (j.filings && j.filings.recent && j.filings.recent.form) || [];
      SUBS[c] = { st: st || null, us: usCompany(st, forms), f20: forms.some(f => /^(20-F|40-F)/.test(String(f))), sic: j.sic ? String(j.sic).padStart(4, '0') : '' }; got++; } else fail++; } else if (r && r.status === 404) SUBS[c] = { st: null, us: false, f20: false, sic: '' }; else fail++; }
  if (got) W(SC + '/subs.json', SUBS); const still = [...want].filter(c => !(c in SUBS)).length;
  STATUS.domicile = { ok: still <= Math.max(5, want.size * 0.02), wantedNow: want.size, fetchedNow: got, failed: fail, missing: still, known: Object.keys(SUBS).length, foreign: Object.values(SUBS).filter(x => x.us === false).length };
  log('domicile: ' + JSON.stringify(STATUS.domicile)); }
const uniMemo = new Map();
function universe(t) { if (uniMemo.has(t)) return uniMemo.get(t); const X = rowsAt(t, true), ranked = byCap(X.rows); ranked.forEach((r, j) => { r.rank = j; });
  const out = { ranked, liquid: liqList(t).length, companies: X.rows.length, noCik: X.noCik, noFacts: X.noFacts, noShares: X.noShares, foreign: X.foreign }; uniMemo.set(t, out); return out; }

// ================= 4b. EXTRA SEC items for every company the rules rank (the 1100 largest at each fundamentals review) =================
const ser = (A, i) => A.subarray(i * T, i * T + T), series = (i) => ({ o: ser(OA, i), h: ser(HA, i), l: ser(LA, i), c: ser(CA, i) });
const LIVE_ME = nextSession(D[T - 1]).slice(0, 7) !== D[T - 1].slice(0, 7) && !MENDS.includes(T - 1), ALLREV = LIVE_ME ? [...MENDS, T - 1] : [...MENDS];
const FUND_MONTHS = [3, 5, 6, 9, 11, 12], isFundRev = (t) => FUND_MONTHS.includes(+D[t].slice(5, 7));
{ const want = new Set(); for (const t of ALLREV.filter(isFundRev)) for (const r of universe(t).ranked.slice(0, 1100)) if (!(r.cik in EXTRA)) want.add(r.cik);
  const todo = [...want]; let got = 0, fail = 0, mode = 'cache';
  if (todo.length && !OFFLINE) { const zip = SC + '/companyfacts.zip'; let zipOk = false;
    if (todo.length > 300 && !local(env.SEC_BASE)) zipOk = download(SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip', zip) && fs.statSync(zip).size > 1e8;
    if (zipOk) { mode = 'bulk'; const tmp = SC + '/cf-tmp'; for (let a = 0; a < todo.length; a += 400) { const part = todo.slice(a, a + 400), names = part.map(c => 'CIK' + c.padStart(10, '0') + '.json'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
        try { execFileSync('unzip', ['-o', '-qq', zip, ...names, '-d', tmp], { stdio: 'ignore', maxBuffer: 1e8 }); } catch (e) {}
        for (const c of part) { const f = tmp + '/CIK' + c.padStart(10, '0') + '.json'; let j = null; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {} EXTRA[c] = j ? exCompact(j) : {}; if (j) got++; } }
      fs.rmSync(tmp, { recursive: true, force: true }); try { fs.unlinkSync(zip); } catch (e) {} }
    else { mode = 'api'; for (const c of todo) { if (left() < 50 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null; try { r = await fetch(SECD + '/api/xbrl/companyfacts/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); } catch (e) {}
        if (r && r.ok) { const j = await r.json().catch(() => null); if (j) { EXTRA[c] = exCompact(j); got++; } else fail++; } else if (r && r.status === 404) EXTRA[c] = {}; else fail++; } }
    if (got) saveExtra(); }
  const all = new Set(); for (const t of ALLREV.filter(isFundRev)) for (const r of universe(t).ranked.slice(0, 1000)) all.add(r.cik);
  const miss = [...all].filter(c => !(c in EXTRA)).length, withA = [...all].filter(c => EXTRA[c] && EXTRA[c].Assets).length, withNI = [...all].filter(c => EXTRA[c] && (EXTRA[c].NetIncomeLoss || EXTRA[c].ProfitLoss)).length;
  STATUS.extra = { ok: miss <= Math.max(5, all.size * 0.02) && withA >= all.size * 0.85 && withNI >= all.size * 0.85, companies: all.size, missing: miss, withAssets: withA, withNetIncome: withNI, wantedNow: todo.length, fetchedNow: got, failed: fail, mode };
  log('extra SEC items: ' + JSON.stringify(STATUS.extra)); }
const exMemo = new Map(); const exOf = (cik) => { if (!cik) return null; if (exMemo.has(cik)) return exMemo.get(cik); const a = EXTRA[cik]; let o = null;
  if (a) { o = {}; for (const [g, tags] of Object.entries(EXTAGS)) { o[g] = {}; for (const t of tags) if (a[t]) o[g][t] = a[t].map(([s0, e, v, f]) => ({ s: s0, e, v, f })); } } exMemo.set(cik, o); return o; };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const sicAt = (i, cik) => { const a = cik && SUBS[cik] && SUBS[cik].sic; if (a) return String(a).padStart(4, '0'); const x = SIC0[SYMS[i]]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECCIK[SYMS[i]]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };

// ================= 5. POINT-IN-TIME FUNDAMENTALS (one company, one review date) =================
const dnum = (d) => Date.parse(d + "T00:00:00Z") / 864e5, freshF = (r, d) => r && dnum(d) - dnum(r.end) <= STALE;
const firstT = (grp, f) => { for (const facts of Object.values(grp || {})) { const r = f(facts); if (r !== null && r !== undefined) return r; } return null; };
const ttmF = (grp, d) => firstT(grp, (f) => { const r = ttmAt(f, d); return freshF(r, d) ? r : null; });
// the same tag's TTM a year before the end `end` (end within 20 days of a year earlier)
const ttmPrior = (grp, d, end) => firstT(grp, (f) => { const lim = addDays(shiftYear(end), 10), r = ttmAt(f, d, lim); return r && Math.abs(dnum(r.end) - dnum(shiftYear(end))) <= 20 ? r : null; });
const instF = (grp, d) => firstT(grp, (f) => { const r = instantAt(f, d); return freshF(r, d) ? r : null; });
const fMemo = new Map();
function fund(cik, t) { const d = D[t], key = cik + '|' + d; if (fMemo.has(key)) return fMemo.get(key); const co = coOf(cik), ex = exOf(cik) || {}, o = { cik };
  if (co) { const op = ttmF(co.op, d); o.ebit = op ? op.val : null; const rv = ttmF(co.rev, d); o.rev = rv ? rv.val : null;
    const gp = ttmF(co.gp, d); if (gp) o.gp = gp.val; else { const cg = ttmF(co.cogs, d); o.gp = rv && cg && cg.end === rv.end ? rv.val - cg.val : null; }
    const cf = ttmF(co.cfo, d); o.cfo = cf ? cf.val : null; const eq = instF(co.eq, d); o.eq = eq ? eq.val : null;
    const dc = debtCashAt(co, d); o.debt = dc.debt; o.cash = dc.cash; o.debt0 = debtCashAt(co, shiftYear(d)).debt;
    if (rv) { const p = ttmPrior(co.rev, d, rv.end); o.rev0 = p ? p.val : null; const g0 = ttmPrior(co.gp, d, rv.end); if (g0) o.gp0 = g0.val; else { const c0 = ttmPrior(co.cogs, d, rv.end); o.gp0 = p && c0 ? p.val - c0.val : null; } } }
  const ni = ttmF(ex.ni, d); o.ni = ni ? ni.val : null; if (ni) { const p = ttmPrior(ex.ni, d, ni.end); o.ni0 = p ? p.val : null; }
  const as = instF(ex.assets, d); o.assets = as ? as.val : null; if (as) { const a0 = firstT(ex.assets, f => instantNear(f, d, shiftYear(as.end))); o.assets0 = a0 ? a0.val : null;
    for (const g of ['ca', 'cl', 'ltd']) { const v = firstT(ex[g], f => instantNear(f, d, as.end, 5)), v0 = firstT(ex[g], f => instantNear(f, d, shiftYear(as.end))); o[g] = v ? v.val : null; o[g + '0'] = v0 ? v0.val : null; }
    const pp = firstT(ex.ppe, f => instantNear(f, d, as.end, 5)); o.ppe = pp ? pp.val : null; const dcu = firstT(ex.dcur, f => instantNear(f, d, as.end, 5)); o.dcur = dcu ? dcu.val : null; }
  for (const g of ['div', 'rep', 'iss']) { const r = ttmF(ex[g], d); o[g] = r ? r.val : null; }
  o.niAnnual = firstT(ex.ni, f => { const a = annualVals(f, d); return a.length ? a : null; }) || [];
  fMemo.set(key, o); return o; }

// ================= 6. THE SELECTIONS AT EVERY REVIEW =================
const isFin = (i, cik) => finSic(sicAt(i, cik)), isUtil = (i, cik) => utilSic(sicAt(i, cik)), isReit = (i, cik) => sicAt(i, cik) === '6798';
const top = (t, n) => universe(t).ranked.slice(0, n);
const SEL = {}, REVS = {}, INFO = {}; for (const id of BASKET_IDS) { SEL[id] = []; REVS[id] = []; INFO[id] = []; }
const revsOf = (kind, minT) => ALLREV.filter(t => t >= minT && (!MONTHS[kind] || MONTHS[kind].includes(+D[t].slice(5, 7))));
const WEIGHT = {};   // MSCIQ index weights at entry: id|review -> Map i -> w
// MAGIC / CORNER ranked lists (sleeves built afterwards)
const RANKED = { 'SQ16-MAGIC': [], 'SQ16-CORNER': [] };
for (const t of revsOf('quarterly', 19)) { const U = top(t, 1000).filter(r => !isFin(r.i, r.cik) && !isUtil(r.i, r.cik));
  const rows = U.map(r => { const f = fund(r.cik, t), m = magicMetrics({ ebit: f.ebit, cap: r.cap, debt: f.debt, cash: f.cash, ca: f.ca, cl: f.cl, dcur: f.dcur, ppe: f.ppe }); return { key: r.i, ...m }; });
  const rk = magicRank(rows); REVS['SQ16-MAGIC'].push(t); RANKED['SQ16-MAGIC'].push(rk); INFO['SQ16-MAGIC'].push({ d: D[t], universe: U.length, eligible: rk.length, best: rk.slice(0, 10).map(i => SYMS[i]) });
  // ACQM
  const am = U.map(r => { const f = fund(r.cik, t); return { key: r.i, v: (() => { const x = acqMultiple({ ebit: f.ebit, cap: r.cap, debt: f.debt, cash: f.cash }); return ok(x) ? -x : null; })(), tie: f.ebit }; });
  const ap = topBy(am, RULES['SQ16-ACQM'].n); REVS['SQ16-ACQM'].push(t); SEL['SQ16-ACQM'].push(new Set(ap)); INFO['SQ16-ACQM'].push({ d: D[t], eligible: am.filter(x => ok(x.v)).length, picks: ap.length, sample: ap.slice(0, 10).map(i => SYMS[i]) });
  // QVAL
  const qv = U.filter(r => !isReit(r.i, r.cik)).map(r => { const f = fund(r.cik, t), m = acqMultiple({ ebit: f.ebit, cap: r.cap, debt: f.debt, cash: f.cash }); if (!ok(m)) return { key: r.i, mult: null };
    return { key: r.i, mult: m, f: fScore({ ni: f.ni, cfo: f.cfo, assets: f.assets, ni0: f.ni0, assets0: f.assets0, ltd: f.ltd, ltd0: f.ltd0, ca: f.ca, cl: f.cl, ca0: f.ca0, cl0: f.cl0, iss: f.iss, gp: f.gp, rev: f.rev, gp0: f.gp0, rev0: f.rev0 }).score }; });
  const qp = qvalPick(qv); REVS['SQ16-QVAL'].push(t); SEL['SQ16-QVAL'].push(new Set(qp)); INFO['SQ16-QVAL'].push({ d: D[t], eligible: qv.filter(x => ok(x.mult)).length, cheapWithF: Math.ceil(qv.filter(x => ok(x.mult)).length * 0.10), picks: qp.length, sample: qp.slice(0, 10).map(i => SYMS[i]) });
  // GPVAL (500 largest, financials out)
  const gv = top(t, 500).filter(r => !isFin(r.i, r.cik)).map(r => { const f = fund(r.cik, t); return { key: r.i, a: ok(f.gp) && f.assets > 0 ? f.gp / f.assets : null, b: f.eq > 0 ? f.eq / r.cap : null, tie: ok(f.gp) && f.assets > 0 ? f.gp / f.assets : null }; });
  const gp = rankSumPick(gv, RULES['SQ16-GPVAL'].n); REVS['SQ16-GPVAL'].push(t); SEL['SQ16-GPVAL'].push(new Set(gp)); INFO['SQ16-GPVAL'].push({ d: D[t], eligible: gv.filter(x => ok(x.a) && ok(x.b)).length, picks: gp.length, sample: gp.slice(0, 10).map(i => SYMS[i]) });
  // SHYLD
  const sy = U.map(r => { const f = fund(r.cik, t); return { key: r.i, v: shYield({ div: f.div, rep: f.rep, iss: f.iss, cap: r.cap, debt: f.debt, debt0: f.debt0 }), tie: r.cap }; });
  const sp = topBy(sy, RULES['SQ16-SHYLD'].n); REVS['SQ16-SHYLD'].push(t); SEL['SQ16-SHYLD'].push(new Set(sp)); INFO['SQ16-SHYLD'].push({ d: D[t], eligible: sy.filter(x => ok(x.v)).length, picks: sp.length, sample: sp.slice(0, 10).map(i => SYMS[i] + ' ' + pc(sy.find(x => x.key === i).v)) });
  if (t >= 252) { const A = top(t, 1000);
    // VALMOM (all sectors)
    const vm = A.map(r => { const f = fund(r.cik, t), m = mom121(cl(r.i), t); return { key: r.i, a: f.eq > 0 ? f.eq / r.cap : null, b: m, tie: m }; });
    const vp = rankSumPick(vm, RULES['SQ16-VALMOM'].n); REVS['SQ16-VALMOM'].push(t); SEL['SQ16-VALMOM'].push(new Set(vp)); INFO['SQ16-VALMOM'].push({ d: D[t], eligible: vm.filter(x => ok(x.a) && ok(x.b)).length, picks: vp.length, sample: vp.slice(0, 10).map(i => SYMS[i]) });
    // CORNER
    const cr = A.map(r => { const f = fund(r.cik, t), c = cl(r.i), r12 = c[t] > 0 && c[t - 252] > 0 ? c[t] / c[t - 252] - 1 : null; const ps = f.rev > 0 ? r.cap / f.rev : null;
      return { key: r.i, v: ok(ps) && ps < 1.5 && ok(f.ni) && ok(f.ni0) && f.ni > f.ni0 ? r12 : null }; });
    const ck = topBy(cr, 1000); REVS['SQ16-CORNER'].push(t); RANKED['SQ16-CORNER'].push(ck); INFO['SQ16-CORNER'].push({ d: D[t], eligible: ck.length, best: ck.slice(0, 13).map(i => SYMS[i]) }); } }
// MSCIQ (May / November, 600 largest, buffer 150)
{ let held = new Set(); for (const t of revsOf('semiannual', 19)) { const rows = top(t, 600).map(r => { const f = fund(r.cik, t); return { key: r.i, roe: f.eq > 0 && ok(f.ni) ? f.ni / f.eq : null, de: f.eq > 0 && ok(f.debt) ? f.debt / f.eq : null, ev: earnVar(f.niAnnual.slice(-6)), cap: r.cap }; });
    const rk = msciRank(rows), keys = rk.map(x => x.key), pick = bufferPick(keys, held, RULES['SQ16-MSCIQ'].n, RULES['SQ16-MSCIQ'].buffer), by = new Map(rk.map(x => [x.key, x]));
    WEIGHT['SQ16-MSCIQ|' + t] = cappedWeights(pick.map(k => ({ key: k, score: by.get(k).score, cap: by.get(k).cap })), 0.05);
    held = new Set(pick); REVS['SQ16-MSCIQ'].push(t); SEL['SQ16-MSCIQ'].push(held); INFO['SQ16-MSCIQ'].push({ d: D[t], universe: rows.length, ranked: rk.length, withVariability: rows.filter(x => ok(x.ev)).length, picks: pick.length, sample: pick.slice(0, 10).map(i => SYMS[i]) }); } }
// IND12 (monthly, 500 largest)
for (const t of revsOf('monthly', 252)) { const rows = top(t, 500).map(r => { const c = cl(r.i); return { key: r.i, ind: sic2(sicAt(r.i, r.cik)), cap: r.cap, r: c[t] > 0 && c[t - 252] > 0 ? c[t] / c[t - 252] - 1 : null }; });
  const P = indPick(rows, RULES['SQ16-IND12'].nInd, RULES['SQ16-IND12'].minMembers); REVS['SQ16-IND12'].push(t); SEL['SQ16-IND12'].push(new Set(P.keys)); INFO['SQ16-IND12'].push({ d: D[t], industries: P.industries.map(x => x.k + ' ' + pc(x.r)), picks: P.keys.length }); }
// sleeves
for (const id of ['SQ16-MAGIC', 'SQ16-CORNER']) { const sh = sleeveHeld(RANKED[id], RULES[id].sleeveN, RULES[id].sleeves); SEL[id] = sh.held; INFO[id].forEach((x, j) => { x.sleeve = (sh.picks[j] || []).map(i => SYMS[i]); x.held = sh.held[j].size; }); }
const minOf = (id, f) => Math.min(...INFO[id].map(f));
STATUS.select = { ok: INFO['SQ16-MAGIC'].length >= 18 && minOf('SQ16-MAGIC', x => x.eligible) >= 200 && minOf('SQ16-ACQM', x => x.eligible) >= 200 && minOf('SQ16-QVAL', x => x.picks) >= 20 && minOf('SQ16-GPVAL', x => x.eligible) >= 150
    && minOf('SQ16-SHYLD', x => x.eligible) >= 300 && minOf('SQ16-VALMOM', x => x.eligible) >= 500 && minOf('SQ16-CORNER', x => x.eligible) >= 13 && minOf('SQ16-MSCIQ', x => x.ranked) >= 300 && minOf('SQ16-IND12', x => x.industries.length) >= 5,
  reviews: Object.fromEntries(BASKET_IDS.map(id => [id, REVS[id].length])), minEligible: { magic: minOf('SQ16-MAGIC', x => x.eligible), acqm: minOf('SQ16-ACQM', x => x.eligible), qvalPicks: minOf('SQ16-QVAL', x => x.picks), gpval: minOf('SQ16-GPVAL', x => x.eligible), shyld: minOf('SQ16-SHYLD', x => x.eligible), valmom: minOf('SQ16-VALMOM', x => x.eligible), corner: minOf('SQ16-CORNER', x => x.eligible), msciqRanked: minOf('SQ16-MSCIQ', x => x.ranked), msciqVar: minOf('SQ16-MSCIQ', x => x.withVariability) } };
log('selections: ' + JSON.stringify(STATUS.select));
// SPUS (price only): the cache, else Massive daily bars
const SPUS = new Float64Array(T).fill(NaN); { const i = SY.get('SPUS'); let src = 'none';
  if (i !== undefined) { for (let t = 0; t < T; t++) if (CC(i, t) > 0) SPUS[t] = CC(i, t); src = 'cache'; }
  if ([...SPUS].filter(x => x > 0).length < T * 0.9) { SPUS.fill(NaN); src = 'none'; const j = await api('/v2/aggs/ticker/SPUS/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000'); if (j && Array.isArray(j.results)) { const m = new Map(j.results.map(b => [iso(b.t), b.c])); for (let t = 0; t < T; t++) { const v = m.get(D[t]); if (v > 0) SPUS[t] = v; } src = 'massive'; } }
  STATUS.spus = { ok: true, src, sessions: [...SPUS].filter(x => x > 0).length, note: 'information (portfolio comparison); SPY is the gate' }; log('SPUS: ' + JSON.stringify(STATUS.spus)); }
if (DIAG) { console.log('SQUAD 16 DIAGNOSTICS (data coverage and selection counts only; nothing judged or written)'); console.log('DATA ' + JSON.stringify(STATUS));
  for (const id of BASKET_IDS) { const a = INFO[id]; for (const j of [0, Math.floor(a.length / 2), a.length - 1]) if (a[j]) console.log('SEL ' + id + ' ' + JSON.stringify(a[j]).slice(0, 700)); }
  const cik0 = universe(MENDS[MENDS.length - 1]).ranked.slice(0, 3); for (const r of cik0) { const f = fund(r.cik, MENDS[MENDS.length - 1]); console.log('FUND ' + SYMS[r.i] + ' ' + JSON.stringify({ ...f, niAnnual: f.niAnnual.length })); }
  process.exit(0); }

// ================= 7. TRADES =================
const TR = {}, SG = {}, NOTE = {}; for (const id of IDS) { TR[id] = []; SG[id] = []; NOTE[id] = { artifacts: 0, open: 0, notBought: 0, skippedBusy: 0 }; }
const JUMPS = new Map(); const jumpsOf = (i) => { if (!JUMPS.has(i)) JUMPS.set(i, artifactJumps(cl(i))); return JUMPS.get(i); };
const planOf = (id) => RULES[id].kind === 'sleeve' ? 'buy the next open; hold one year (sold at the review four quarters later unless re-picked)' : RULES[id].kind === 'daily' ? 'buy the next open; sell at the close of session 63' : 'buy the next open; hold while the ' + RULES[id].review + ' review keeps it selected';
const EP = {};   // whole holdings (entry to exit): the PORTFOLIO test and the paper signals; TR = review-period pieces: the per-trade verdict
for (const id of BASKET_IDS) { const R = REVS[id], H = SEL[id]; EP[id] = [];
  const wOf = (j, i) => id === 'SQ16-MSCIQ' ? (WEIGHT[id + '|' + R[j]].get(i) || 0) : 1 / (RULES[id].target || Math.max(1, H[j].size));
  for (const e of episodes(H)) { const ta = R[e.a], tb = e.b === null ? null : R[e.b], i = e.key;
    if (D[ta] >= START || ta === T - 1) SG[id].push({ t: ta, i, plan: planOf(id) });
    const r = episodeTrade(series(i), ta, tb, lastI[i], T); if (!r || r.pending) continue; if (!r.open && hasArtifact(jumpsOf(i), r.k, r.x)) continue; EP[id].push(r.open ? { t: ta, i, open: true, k: r.k, px0: r.px0, w: wOf(e.a, i) } : { t: ta, i, ...r, w: wOf(e.a, i) }); }
  for (let j = 0; j < R.length; j++) for (const i of H[j]) { const r = episodeTrade(series(i), R[j], j + 1 < R.length ? R[j + 1] : null, lastI[i], T); if (!r) { NOTE[id].notBought++; continue; } if (r.pending) continue;
    if (r.open) { NOTE[id].open++; TR[id].push({ t: R[j], i, open: true, k: r.k, px0: r.px0 }); continue; }
    if (hasArtifact(jumpsOf(i), r.k, r.x)) { NOTE[id].artifacts++; continue; } TR[id].push({ t: R[j], i, ...r, kind: r.kind === 'dropped' ? 'period' : r.kind }); } }
// RSNH: daily
{ const id = 'SQ16-RSNH', busy = new Map(), rsMemo = new Map(), U5 = new Map(); let sigs = 0;
  const arrs = (i) => { if (!rsMemo.has(i)) { const c = Float64Array.from(cl(i)); rsMemo.set(i, { c, hi: rsHighArr(c, SPYC), s50: smaArr(c, 50) }); } return rsMemo.get(i); };
  for (let t = 252; t < T; t++) { const t0 = leaderMonthOf(MENDS, t); if (t0 < 0) continue; if (!U5.has(t0)) U5.set(t0, top(t0, 500).map(r => r.i));
    for (const i of U5.get(t0)) { if (!LIQ[i * T + t]) continue; const A = arrs(i); if (!blueDot(A.c, A.hi, A.s50, t)) continue; sigs++;
      if ((busy.get(i) ?? -1) >= t + 1) { NOTE[id].skippedBusy++; continue; } if (D[t] >= START || t === T - 1) SG[id].push({ t, i, plan: planOf(id) });
      const r = holdTrade(series(i), t, lastI[i], T, RULES[id].hold); if (!r) { NOTE[id].notBought++; continue; } if (r.pending) { busy.set(i, Infinity); continue; }
      if (r.open) { NOTE[id].open++; busy.set(i, Infinity); TR[id].push({ t, i, open: true, k: r.k, px0: r.px0 }); continue; }
      busy.set(i, r.x); if (hasArtifact(jumpsOf(i), r.k, r.x)) { NOTE[id].artifacts++; continue; } TR[id].push({ t, i, ...r, at: 'c' }); } }
  NOTE[id].signals = sigs; }
log('trades (review-period pieces): ' + IDS.map(id => id + ' ' + TR[id].length).join(', ') + ' | holdings: ' + BASKET_IDS.map(id => id + ' ' + EP[id].length).join(', '));

// ================= 8. THE ACCOUNTS (every basket) =================
const pxApi = { o: (i, k) => OA[i * T + k], c: (i, k) => CA[i * T + k] };
const YE = (() => { let k = -1; for (let t = 0; t < T; t++) if (D[t] < SPLIT) k = t; return k; })(), spyLv = Float64Array.from(SPYC, x => x > 0 ? x : NaN);
function portStats(eq, s0) { const lv = new Float64Array(T).fill(NaN); lv[s0] = 1; for (let k = s0 + 1; k < T; k++) lv[k] = eq[k]; const out = {};
  for (const [h, [a, b]] of Object.entries({ older: [s0, YE], newer: [YE, T - 1], all: [s0, T - 1] })) { const rule = pathStats(lv, a, b), spy = pathStats(spyLv, a, b), spus = pathStats(SPUS, a, b);
    out[h] = { from: D[a], to: D[b], rule, spy, spus, beatsSpy: !!(rule && spy && rule.cagr > spy.cagr), beatsSpus: spus ? !!(rule && rule.cagr > spus.cagr) : null }; }
  return { halves: out, years: yearTable(D, lv, spyLv, SPUS, s0) }; }
const ACC = {};
for (const id of BASKET_IDS) { const s0 = REVS[id][0], cands = EP[id].map(z => ({ id: z.i + '|' + z.t, key: z.i, i: z.i, k: z.k, x: z.open ? null : z.x, at: z.at || 'c', w: z.w }));
  const A = simAccount2({ T, start: s0 + 1, cands, px: pxApi, side: SIDE }), B = simAccount2({ T, start: s0 + 1, cands, px: pxApi, side: SIDE_STRESS });
  const P = { standard: { label: '0.4% per side', ...portStats(A.eq, s0) }, stress: { label: '0.6% per side', ...portStats(B.eq, s0) }, taken: A.taken.length, candidates: cands.length, skipped: A.skipped, weights: id === 'SQ16-MSCIQ' ? 'index weight (quality score x market value, 5% cap) at entry' : '1/' + (RULES[id].target || 'basket size') + ' of the account at entry' };
  P.beatsSpyBothHalves = !!(P.standard.halves.older.beatsSpy && P.standard.halves.newer.beatsSpy); P.beatsSpyBothHalvesStress = !!(P.stress.halves.older.beatsSpy && P.stress.halves.newer.beatsSpy); ACC[id] = P;
  const H = P.standard.halves; log('account ' + id + ': ' + ['older', 'newer'].map(h => h + ' CAGR ' + pc(H[h].rule && H[h].rule.cagr) + ' DD ' + pc(H[h].rule && H[h].rule.maxDD) + ' vs SPY ' + pc(H[h].spy && H[h].spy.cagr) + ' SPUS ' + pc(H[h].spus && H[h].spus.cagr)).join(' | ') + ' | taken ' + P.taken + '/' + P.candidates + ' ' + JSON.stringify(P.skipped)); }

// ================= 9. 5-YEAR ONE-SHOT (per trade) =================
const priceAt = (i, x, at) => { if (x > T - 1) return null; if (at === 'o') { const z = OA[i * T + x]; if (z > 0) return z; if (x > lastI[i]) { for (let q = x; q >= 0; q--) if (CA[i * T + q] > 0) return CA[i * T + q]; } return null; } for (let q = Math.min(x, T - 1); q >= 0; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const yMemo = new Map(); const yard = (k, x, at) => { const key = k + '|' + x + '|' + at; if (yMemo.has(key)) return yMemo.get(key);
  const st = liqList(k - 1).filter(i => i % 2 === 0 && !hasArtifact(jumpsOf(i), k, x)); const m = yardOf(st, k, x, at, priceAt, 'capBoth', 50); yMemo.set(key, m); return m; };
const spyG = (k, x, at) => { const a = OA[spyI * T + k], b = priceAt(spyI, x, at); return a > 0 && b > 0 ? b / a - 1 : null; };
const ownM = new Map();
function judged(id) { const all = TR[id].filter(z => !z.open), sp = new Map(); for (const z of all) (sp.get(z.i) || sp.set(z.i, []).get(z.i)).push([z.k, z.x]);
  const tr = []; for (const z of all) { const g = tradeG(z.g, 'capBoth'); if (!isFinite(g)) continue; const c = yard(z.k, z.x, z.at || 'c'); if (c === null) continue; const half = halfOf(D[z.t]), len = z.x - z.k + 1, key = z.i + '|' + len + '|' + half;
    if (!ownM.has(key)) ownM.set(key, ownAverage({ from: 253, to: T - 1, len, step: 10, busy: sp.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === half, ret: (u, x) => { const e = OA[z.i * T + u], y = priceAt(z.i, x, 'c'); return e > 0 && y > 0 ? y / e - 1 : null; }, mode: 'capBoth' }));
    tr.push({ t: z.t, s: SYMS[z.i], i: z.i, k: z.k, x: z.x, g, c, own: ownM.get(key), spy: spyG(z.k, z.x, z.at || 'c'), half, days: z.days, kind: z.kind, sig: D[z.t] }); }
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
  const kinds = {}; for (const z of tr) kinds[z.kind] = (kinds[z.kind] || 0) + 1; const sh = { older: shape(by.older), newer: shape(by.newer) };
  RES[id] = { ...v, name: RULES[id].name, hold: RULES[id].kind === 'sleeve' ? 252 : RULES[id].hold || shape(tr).medianDays || 63, holdRule: planOf(id), block: blk, cost: COST, split: SPLIT, yardstick: 'capBoth (AUD-1)', replication: RULES[id].replication, source: RULES[id].source, results: R, perYear: PY,
    byYear: byYear(tr), shape: sh, exits: kinds, notes: NOTE[id], reviews: REVS[id] ? REVS[id].length : null,
    trades: tr.map(z => ({ s: z.s, sig: z.sig, buy: D[z.k], sell: D[z.x], kind: z.kind, days: z.days, net: r4(z.g - COST), avgStock: r4(z.c - COST), spy: r4(z.spy), sameStock: r4(ok(z.own) ? z.own - COST : null) })) };
  if (ACC[id]) RES[id].portfolio = ACC[id];
  RES[id].tryWouldQualify = tryWouldQualify(RES[id]); const P = RES[id].portfolio;
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | per year rule/SPY older ' + pc(PY.older.rule) + '/' + pc(PY.older.spy) + ' newer ' + pc(PY.newer.rule) + '/' + pc(PY.newer.spy)
    + (P ? ' | account beats SPY both halves ' + P.beatsSpyBothHalves : '') + ' | TRY SMALL ' + (RES[id].tryWouldQualify.qualifies ? 'YES' : 'no: ' + RES[id].tryWouldQualify.why.join('; ')) + ' | ' + String(RES[id].why).slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; }, isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);

// ================= 10. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigIds = new Set(lines.filter(x => x.type === 'signal').map(x => x.id)), resIds = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), newLines = [];
const fromT = D.findIndex(d => d >= START), board = {}, today = {};
for (const id of IDS) { const mine = []; if (fromT >= 0) for (const s of SG[id]) { if (s.t < fromT) continue; const sym = SYMS[s.i], lid = id + '|' + sym + '|' + D[s.t];
    if (!sigIds.has(lid)) { sigIds.add(lid); newLines.push({ type: 'signal', id: lid, m: id, sym, d: D[s.t], close: r4(CC(s.i, s.t)), halal: halal(sym), plan: s.plan, recordedAfter: D[T - 1] }); } mine.push(lid); }
  const closed = []; for (const z of TR[id]) { if (fromT < 0 || z.t < fromT || z.open) continue; const sym = SYMS[z.i], lid = id + '|' + sym + '|' + D[z.t], c = yard(z.k, z.x, z.at || 'c');
    closed.push({ d: D[z.t], sym, g: z.g, c, halal: halal(sym) }); if (!resIds.has(lid)) { resIds.add(lid); newLines.push({ type: 'result', id: lid, m: id, sym, d: D[z.t], buy: D[z.k], sell: D[z.x], kind: z.kind, g: r4(z.g), net: r4(z.g - COST), avgStock: c === null ? null : r4(c - COST) }); } }
  const st = boardStats(closed), fr = firstRun[id];
  board[id] = { name: RULES[id].name, signals: mine.length, open: TR[id].filter(z => z.open && fromT >= 0 && z.t >= fromT).length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: paperReady(st), fiveYear: fr ? { verdict: fr.verdict, why: fr.why, tryWouldQualify: fr.tryWouldQualify } : null };
  const lastRev = REVS[id] && REVS[id].length ? REVS[id][REVS[id].length - 1] : null, basket = lastRev !== null ? [...SEL[id][SEL[id].length - 1]].map(i => ({ sym: SYMS[i], halal: halal(SYMS[i]) })) : undefined;
  today[id] = { name: RULES[id].name, hold: fr ? fr.hold : (RULES[id].hold || 63), holdRule: planOf(id), tier: fr ? fr.verdict : null, newSignals: SG[id].filter(s => s.t === T - 1).map(s => ({ sym: SYMS[s.i], close: r4(CC(s.i, s.t)), halal: halal(SYMS[s.i]), d: D[s.t], plan: s.plan })),
    basketAsOf: lastRev !== null ? D[lastRev] : undefined, basket }; }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START,
  note: 'PAPER ONLY. Squad 16 (published winning methods, wide sweep) recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a qualifying frozen 5-year verdict in BOTH halves (data/squad16-lab.json firstRun), incl. its portfolio test. Baskets change only at their review dates (quarterly: end of Mar/Jun/Sep/Dec; MSCIQ: end of May/Nov; IND12: every month end). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.filter(x => x.type === 'signal').length + ' new signals, ' + newLines.filter(x => x.type === 'result').length + ' new results; today: ' + IDS.map(id => id + ' ' + today[id].newSignals.length).join(', '));

// ================= 11. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), squad: 16, preRegistered: 'squad16-core.mjs header + RULES (24 Oct 2026, before any run) + data/strategy-library.json SQ16-*', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS,
  sources: { tested: Object.fromEntries(IDS.map(id => [id, RULES[id].source])), notTested: NOT_TESTED },
  luck: '10 rules tried here (one version each) from a sweep of ~30 sources; the library holds ~590 ideas. Read block t against the proof bar, not 2.5. Value, quality and payout baskets overlap (cheap, profitable large caps): their results are not independent.',
  standard: 'both halves (entry review before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock bought and sold at the same moments (rule and yardstick capped at +300%, AUD-1), better than the same stock held as long on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= 2.5, return per year of capital tied up above SPY on the same days -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN. Baskets also as one account (0.4% per side) vs SPY and SPUS per half (gates scan.mjs).',
  rules: Object.fromEntries(IDS.map(id => [id, { name: RULES[id].name, rule: RULES[id].rule, deviations: RULES[id].deviations, replication: RULES[id].replication }])), selections: INFO,
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-600)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results, H = r.portfolio ? r.portfolio.standard.halves : null;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'squad16-lab.mjs -> data/squad16-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock],
      perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], portfolioCagr: H ? [H.older.rule && H.older.rule.cagr, H.newer.rule && H.newer.rule.cagr] : undefined, spyCagr: H ? [H.older.spy && H.older.spy.cagr, H.newer.spy && H.newer.spy.cagr] : undefined,
      tryWouldQualify: r.tryWouldQualify ? r.tryWouldQualify.qualifies : null, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad16-lab: library not updated: ' + e.message); }
console.log('SQUAD 16 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + IDS.map(id => id + ' ' + (firstRun[id] ? firstRun[id].verdict + (firstRun[id].tryWouldQualify && firstRun[id].tryWouldQualify.qualifies ? ' (TRY SMALL)' : '') : (RES[id] || {}).verdict)).join(', '));
