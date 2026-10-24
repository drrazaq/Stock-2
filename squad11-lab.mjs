// SQUAD 11 LAB (24 Oct 2026): "BUY THE DIP ONLY IN PROVEN LEADERS" (squad11-core.mjs = the pre-registered rules, written before any run).
// Research + a FORWARD PAPER lane; never places an order; no Telegram.
// 1. DATA (GitHub Actions only; keys only from secrets, never printed): prices = the 5-year whole-market cache of the Sunday job
//    (study-cache/grouped.json.gz, RESTORED READ ONLY: open, high, low, close, volume; dead stocks included) + the sessions since (Massive
//    grouped daily) + splits since the cache day. MARKET VALUE exactly as Squad 5 (squad5-core capAt; the SEC code below is Squad 5's,
//    copied): SEC company facts and the historical Form 3/4/5 ticker map from Squad 4's actions cache (RESTORED READ ONLY), Squad 5's cache
//    (RESTORED READ ONLY and copied into this lab's own cache squad11-cache by the workflow; never saved under Squad 5's key), else
//    downloaded into squad11-cache. Share counts: data/shares.json.gz raw rows, else the cover-page counts.
// 2. 5-YEAR ONE-SHOT for every SQ11 rule not yet frozen; first complete verdict frozen in data/squad11-lab.json firstRun; later runs =
//    monitoring only (latest).
// 3. PAPER LANE from Monday 26 Oct 2026: data/squad11-paper.jsonl, data/squad11-today.json (methods[id].newSignals = signals of the newest
//    close, to be bought the next session), data/squad11-board.json.
// DIAG=1: data coverage + the leader sets at a few month ends (a data check, no rule result); nothing judged or written in data/.
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
import { yardOf } from './squad6-core.mjs';
import { RULES, IDS, DIP_IDS, COST, SPLIT, PAPER_START, TOPN, YEAR, smaArr, monthEnds, leaderMonthOf, mom121, leaderPick, dipSignals, holdTrade, perYearOf, timing, byYear, shape, boardStats, paperReady,
  preRegister, mean, r4, halfOf } from './squad11-core.mjs';
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ11_CACHE || 'squad11-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = env.SQ11_OUT || 'data/squad11-lab.json', PAPER = 'data/squad11-paper.jsonl', TODAY = 'data/squad11-today.json', BOARD = 'data/squad11-board.json', LIB = env.SQ11_LIB || 'data/strategy-library.json';
const START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ11_MINUTES || 120) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(2.5, +LEAGUE.bar || 0, 4.0), STATUS = {};

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ11 entries written now'); }

// ================= 1. PRICES (as squad5-lab, with highs and lows) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad11-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
store = null;
if (!OFFLINE) { const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; HA[q] /= r; LA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), cl = (i) => CA.subarray(i * T, i * T + T), CC = (i, t) => CA[i * T + t];
if (spyI === undefined) { console.log('squad11-lab: SPY missing from the cache; nothing done'); process.exit(0); }
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
const MS = MENDS;   // squad 11: the month ends (leader formation dates)
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

// ================= 5. LEADERS at every month end (+ the newest session when it is a month end: paper lane only) =================
const LIVE_ME = nextSession(D[T - 1]).slice(0, 7) !== D[T - 1].slice(0, 7) && !MENDS.includes(T - 1), FORM = LIVE_ME ? [...MENDS, T - 1] : [...MENDS];
const LEAD = new Map(), leadInfo = [];
for (const t of FORM) { const U = universe(t).ranked.slice(0, TOPN), rows = U.map(r => ({ key: r.i, m: mom121(cl(r.i), t) })), L = leaderPick(rows); LEAD.set(t, new Set(L));
  leadInfo.push({ d: D[t], top300: U.length, withMom: rows.filter(r => ok(r.m)).length, leaders: L.length, vanishedLeaders: L.filter(i => vanishedI(i)).length, cap300B: U[TOPN - 1] ? r4(U[TOPN - 1].cap / 1e9) : null }); }
STATUS.leaders = { ok: MENDS.length >= 40 && leadInfo.every(x => x.top300 === TOPN && x.leaders >= 50), months: MENDS.length, first: MENDS.length ? D[MENDS[0]] : null, minTop: Math.min(...leadInfo.map(x => x.top300)), minLeaders: Math.min(...leadInfo.map(x => x.leaders)), vanishedLeaders: leadInfo.reduce((a, x) => a + x.vanishedLeaders, 0) };
log('leaders: ' + JSON.stringify(STATUS.leaders));
if (DIAG) { const pick = FORM.filter((t, j) => j % 6 === 0 || j === FORM.length - 1);
  console.log('SQUAD 11 DIAGNOSTICS (data coverage and the leader sets only; nothing judged or written)');
  console.log(JSON.stringify({ data: STATUS, perMonth: leadInfo, snapshots: pick.map(t => { const U = universe(t).ranked.slice(0, TOPN);
    return { date: D[t], top10: U.slice(0, 10).map(r => SYMS[r.i] + ' ' + (r.cap / 1e9).toFixed(0) + 'B'), rank300: U[TOPN - 1] ? SYMS[U[TOPN - 1].i] + ' ' + (U[TOPN - 1].cap / 1e9).toFixed(1) + 'B' : null,
      leaders: [...LEAD.get(t)].map(i => ({ s: SYMS[i], m: mom121(cl(i), t) })).sort((a, b) => b.m - a.m).map(x => x.s + ' ' + pc(x.m)) }; }) }, null, 1).slice(0, 60000));
  process.exit(0); }

// ================= 6. SIGNALS AND TRADES =================
const TR = {}, SG = {}, NOTE = {}; for (const id of IDS) { TR[id] = []; SG[id] = []; NOTE[id] = { artifacts: 0, open: 0, notBought: 0, skippedBusy: 0 }; }
const JUMPS = new Map(); const jumpsOf = (i) => { if (!JUMPS.has(i)) JUMPS.set(i, artifactJumps(cl(i))); return JUMPS.get(i); };
const ser = (A, i) => A.subarray(i * T, i * T + T), series = (i) => ({ o: ser(OA, i), h: ser(HA, i), l: ser(LA, i), c: ser(CA, i) });
const busyUntil = {}; for (const id of IDS) busyUntil[id] = new Map();
function addTrade(id, t, i, t0, plan) { const bm = busyUntil[id]; if ((bm.get(i) ?? -1) >= t + 1) { NOTE[id].skippedBusy++; return; }
  if (D[t] >= START || t === T - 1) SG[id].push({ t, i, plan });
  const S = series(i), r = holdTrade(S, t, lastI[i], T, RULES[id].hold); if (!r) { NOTE[id].notBought++; return; } if (r.pending) { bm.set(i, Infinity); return; }
  if (r.open) { NOTE[id].open++; bm.set(i, Infinity); TR[id].push({ t, i, t0, open: true, k: r.k, px0: r.px0 }); return; }
  bm.set(i, r.x); if (hasArtifact(jumpsOf(i), r.k, r.x)) { NOTE[id].artifacts++; return; } TR[id].push({ t, i, t0, ...r }); }
const everLeader = new Set(); for (const s of LEAD.values()) for (const i of s) everLeader.add(i);
// dip rules: day by day over every stock that was ever a leader, only while it is a leader of the latest month end before t
for (const i of everLeader) { const c = Float64Array.from(cl(i)), A = { c, l: Float64Array.from(ser(LA, i)), s20: smaArr(c, 20), s50: smaArr(c, 50), s200: smaArr(c, 200) };
  for (let t = MENDS[0] + 1; t < T; t++) { if (!LIQ[i * T + t]) continue; const t0 = leaderMonthOf(MENDS, t); if (t0 < 0 || !LEAD.get(t0).has(i)) continue;
    for (const id of dipSignals(A, SPYC, t)) addTrade(id, t, i, t0, 'buy the next open; sell at the close of session ' + RULES[id].hold + ' (about ' + Math.round(RULES[id].hold / 21) + ' month' + (RULES[id].hold > 21 ? 's' : '') + ')'); } }
// control: every leader at the month start
for (const t of FORM) for (const i of [...LEAD.get(t)].sort((a, b) => a - b)) addTrade('SQ11-MS63', t, i, t, 'buy the next open (month start); sell at the close of session 63');
log('trades: ' + IDS.map(id => id + ' ' + TR[id].length).join(', '));

// ================= 7. 5-YEAR ONE-SHOT =================
const priceAt = (i, x, at) => { if (x > T - 1) return null; if (at === 'o') { const z = OA[i * T + x]; if (z > 0) return z; if (x > lastI[i]) { for (let q = x; q >= 0; q--) if (CA[i * T + q] > 0) return CA[i * T + q]; } return null; } for (let q = Math.min(x, T - 1); q >= 0; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const yMemo = new Map(); const yard = (k, x) => { const key = k + '|' + x; if (yMemo.has(key)) return yMemo.get(key);
  const st = liqList(k - 1).filter(i => i % 2 === 0 && !hasArtifact(jumpsOf(i), k, x)); const m = yardOf(st, k, x, 'c', priceAt, 'capBoth', 50); yMemo.set(key, m); return m; };
const spyG = (k, x) => { const a = OA[spyI * T + k], b = priceAt(spyI, x, 'c'); return a > 0 && b > 0 ? b / a - 1 : null; };
const ownM = new Map(), spans = {};
function judged(id) { const all = TR[id].filter(z => !z.open), sp = new Map(); for (const z of all) (sp.get(z.i) || sp.set(z.i, []).get(z.i)).push([z.k, z.x]);
  const tr = []; for (const z of all) { const g = tradeG(z.g, 'capBoth'); if (!isFinite(g)) continue; const c = yard(z.k, z.x); if (c === null) continue; const half = halfOf(D[z.t]), len = z.x - z.k + 1, key = id + '|' + z.i + '|' + len + '|' + half;
    if (!ownM.has(key)) ownM.set(key, ownAverage({ from: 253, to: T - 1, len, step: 10, busy: sp.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === half, ret: (u, x) => { const e = OA[z.i * T + u], y = priceAt(z.i, x, 'c'); return e > 0 && y > 0 ? y / e - 1 : null; }, mode: 'capBoth' }));
    let twin = null; if (!RULES[id].control) { const tw = holdTrade(series(z.i), z.t0, lastI[z.i], T, RULES[id].hold); if (tw && !tw.open && !hasArtifact(jumpsOf(z.i), tw.k, tw.x)) twin = tradeG(tw.g, 'capBoth'); }
    tr.push({ t: z.t, s: SYMS[z.i], i: z.i, k: z.k, x: z.x, g, c, own: ownM.get(key), spy: spyG(z.k, z.x), twin, half, days: z.days, kind: z.kind, sig: D[z.t] }); }
  return tr; }
const need = IDS.filter(id => !FROZEN[id]), RES = {};
const dataOk = () => Object.entries(STATUS).filter(([, v]) => v && v.ok === false).map(([k]) => k);
for (const id of IDS) { if (dataOk().length) { RES[id] = { verdict: 'NOT RUN', why: 'data incomplete: ' + dataOk().join(', ') + ' ' + JSON.stringify(Object.fromEntries(dataOk().map(k => [k, STATUS[k]]))).slice(0, 600) }; continue; }
  if (left() < 5 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = judged(id), blk = RULES[id].block, by = { older: tr.filter(z => z.half === 'older'), newer: tr.filter(z => z.half === 'newer') };
  const R = { older: halfStat(by.older, blk), newer: halfStat(by.newer, blk), all: halfStat(tr, blk) };
  const PY = Object.fromEntries(['older', 'newer'].map(h => [h, { rule: r4(perYearOf(by[h], 'g', COST)), spy: r4(perYearOf(by[h], 'spy', 0)), avgStock: r4(perYearOf(by[h], 'c', 0)) }]));
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks held as long on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] } });
  const kinds = {}; for (const z of tr) kinds[z.kind] = (kinds[z.kind] || 0) + 1;
  RES[id] = { ...v, name: RULES[id].name, hold: RULES[id].hold, block: blk, control: !!RULES[id].control, cost: COST, split: SPLIT, yardstick: 'capBoth (AUD-1)', results: R, perYear: PY,
    timing: RULES[id].control ? null : { older: timing(by.older), newer: timing(by.newer), all: timing(tr), note: 'twin = the same leader bought at the open after its leader month end (the fixed date) and held the same number of sessions; dipMinusFixed > 0 = waiting for the dip paid' },
    byYear: byYear(tr), shape: { older: shape(by.older), newer: shape(by.newer) }, exits: kinds, notes: NOTE[id],
    trades: tr.map(z => ({ s: z.s, sig: z.sig, buy: D[z.k], sell: D[z.x], kind: z.kind, net: r4(z.g - COST), avgStock: r4(z.c - COST), spy: r4(z.spy), sameStock: r4(ok(z.own) ? z.own - COST : null), fixedDate: r4(ok(z.twin) ? z.twin - COST : null) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tB ' + h.tBlock + ' win ' + pc(h.win);
  const tm = RES[id].timing; log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | per year rule/SPY older ' + pc(PY.older.rule) + '/' + pc(PY.older.spy) + ' newer ' + pc(PY.newer.rule) + '/' + pc(PY.newer.spy)
    + (tm ? ' | dip minus fixed date older ' + pc(tm.older.dipMinusFixed) + ' newer ' + pc(tm.newer.dipMinusFixed) : '') + ' | ' + RES[id].why.slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; }, isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);

// ================= 8. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigIds = new Set(lines.filter(x => x.type === 'signal').map(x => x.id)), resIds = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), newLines = [];
const fromT = D.findIndex(d => d >= START), board = {}, today = {};
for (const id of IDS) { const mine = []; if (fromT >= 0) for (const s of SG[id]) { if (s.t < fromT) continue; const sym = SYMS[s.i], lid = id + '|' + sym + '|' + D[s.t];
    if (!sigIds.has(lid)) { sigIds.add(lid); newLines.push({ type: 'signal', id: lid, m: id, sym, d: D[s.t], close: r4(CC(s.i, s.t)), halal: halal(sym), plan: s.plan, recordedAfter: D[T - 1] }); } mine.push(lid); }
  const closed = []; for (const z of TR[id]) { if (fromT < 0 || z.t < fromT || z.open) continue; const sym = SYMS[z.i], lid = id + '|' + sym + '|' + D[z.t], c = yard(z.k, z.x);
    closed.push({ d: D[z.t], sym, g: z.g, c, halal: halal(sym) }); if (!resIds.has(lid)) { resIds.add(lid); newLines.push({ type: 'result', id: lid, m: id, sym, d: D[z.t], buy: D[z.k], sell: D[z.x], kind: z.kind, g: r4(z.g), net: r4(z.g - COST), avgStock: c === null ? null : r4(c - COST) }); } }
  const st = boardStats(closed), fr = firstRun[id];
  board[id] = { name: RULES[id].name, hold: RULES[id].hold, signals: mine.length, open: TR[id].filter(z => z.open && fromT >= 0 && z.t >= fromT).length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: paperReady(st), fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  today[id] = { name: RULES[id].name, hold: RULES[id].hold, tier: fr ? fr.verdict : null, newSignals: SG[id].filter(s => s.t === T - 1).map(s => ({ sym: SYMS[s.i], close: r4(CC(s.i, s.t)), halal: halal(SYMS[s.i]), d: D[s.t], plan: s.plan })),
    open: TR[id].filter(z => z.open && fromT >= 0 && z.t >= fromT).map(z => ({ sym: SYMS[z.i], halal: halal(SYMS[z.i]), signal: D[z.t], buy: z.k <= T - 1 ? D[z.k] : null, sinceBuy: z.px0 ? r4(CC(z.i, lastI[z.i]) / z.px0 - 1) : null })) }; }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
const curLead = LEAD.get(FORM[FORM.length - 1]);
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, leadersAsOf: D[FORM[FORM.length - 1]], leaders: [...curLead].map(i => ({ sym: SYMS[i], mom121: r4(mom121(cl(i), FORM[FORM.length - 1])), halal: halal(SYMS[i]) })).sort((a, b) => b.mom121 - a.mom121),
  note: 'PAPER ONLY. Squad 11 (buy the dip only in proven leaders: the top 20% by 12-1 month return of the 300 largest US companies) recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a qualifying frozen 5-year verdict in BOTH halves (data/squad11-lab.json firstRun). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.filter(x => x.type === 'signal').length + ' new signals, ' + newLines.filter(x => x.type === 'result').length + ' new results; today: ' + IDS.map(id => id + ' ' + today[id].newSignals.length).join(', '));

// ================= 9. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'squad11-core.mjs header + RULES (24 Oct 2026, before any run) + data/strategy-library.json SQ11-*', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS, leadersPerMonth: leadInfo,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock bought and sold at the same moments (rule and yardstick capped at +300%, AUD-1), better than the same stock held as long on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= 2.5, return per year of capital tied up above SPY on the same days -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN',
  rules: Object.fromEntries(IDS.map(id => [id, { name: RULES[id].name, hold: RULES[id].hold, rule: RULES[id].rule, control: !!RULES[id].control }])),
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-400)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'squad11-lab.mjs -> data/squad11-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock],
      perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], dipMinusFixedDate: r.timing ? [r.timing.older.dipMinusFixed, r.timing.newer.dipMinusFixed] : null, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad11-lab: library not updated: ' + e.message); }
console.log('SQUAD 11 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + IDS.map(id => id + ' ' + (firstRun[id] ? firstRun[id].verdict : (RES[id] || {}).verdict)).join(', '));
