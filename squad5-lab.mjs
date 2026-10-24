// SQUAD 5 LAB: "THE S&P 500 / SPUS IS ITSELF A TRADING RULE - COPY WHAT MAKES IT WIN" (24 Oct 2026; the owner's squad competition).
// Research + a FORWARD PAPER lane; never places an order; no Telegram. Rules: squad5-core.mjs (SQ5-*, pre-registered 24 Oct 2026 before any
// run; the lab writes the same rule text into data/strategy-library.json before computing anything).
// 1. DATA (GitHub Actions only; keys only from secrets, never printed):
//    prices = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY, dead stocks included) + the
//             sessions since (Massive grouped daily) + splits since the cache day. SPUS / HLAL daily (Massive, else Nasdaq).
//    SEC    = company facts (revenue, operating income, cash flow, capex, equity, debt, cash, cover-page share counts) and the historical
//             ticker map (Form 3/4/5 data sets): read from Squad 4's actions cache when it is there (RESTORED READ ONLY, never saved
//             under its key), else downloaded into this lab's own cache squad5-cache (bulk companyfacts.zip / Form 3/4/5 SUBMISSION tables).
//             Share counts: data/shares.json.gz, else the cover-page counts. Industry (SIC): the cache's, data/sec-ciks.json, Squad 4's
//             sic.json, else the EDGAR submissions API (own cache).
// 2. 5-YEAR ONE-SHOT of every SQ5 rule not yet frozen: the portfolio simulation (0.4% per side; stress 0.6%) and the per-trade judge;
//    first complete verdict frozen in data/squad5-lab.json firstRun; later runs = monitoring only (latest).
// 3. PAPER LANE from Monday 26 Oct 2026: data/squad5-paper.jsonl (every basket entry / exit from that day), data/squad5-today.json
//    (methods[id].newSignals = the CURRENT members of each basket: what the rule holds now), data/squad5-board.json.
// DIAG=1: coverage + the largest companies at a few dates (a data check, no rule result), nothing judged or written in data/.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { fundamentals, cikFromSpans, artifactJumps, hasArtifact } from './squad4-core.mjs';
import { RULES, IDS, COST, STRESS, SIDE, SIDE_STRESS, SPLIT, PAPER_START, BLOCK, YEAR, CAP, BIG, TOPN, EWN, QUALN, MOMBUF, NEWIN_LOOK, NEWIN_MONTHS, NEWIN_MAXW, SHN, PIT_LAG,
  byCap, mom121, bufferSelect, newEntrant, qualityPick, debtCashAt, shariahOk, aboveMA, simulate, equalW, capW, pathStats, monthly, monthStarts, monthEnds, isQuarterMonth,
  preRegister, boardStats, paperReady, mean, median, r4, halfOf, addDays, periodPieces, periodHold, usCompany, capAt } from './squad5-core.mjs';
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ5_CACHE || 'squad5-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = env.SQ5_OUT || 'data/squad5-lab.json', PAPER = env.SQ5_PAPER || 'data/squad5-paper.jsonl', TODAY = env.SQ5_TODAY || 'data/squad5-today.json', BOARD = env.SQ5_BOARD || 'data/squad5-board.json', LIB = env.SQ5_LIB || 'data/strategy-library.json';
const START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ5_MINUTES || 100) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ5 entries written now'); }

// ================= 1. PRICES (as squad4-lab) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad5-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
if (spyI === undefined) { console.log('squad5-lab: SPY missing from the cache; nothing done'); process.exit(0); }
const lastI = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; }
const GONE = 5, vanishedI = (i) => lastI[i] >= 0 && lastI[i] < T - 1 - GONE, deadI = (i) => vanishedI(i) && CA[i * T + lastI[i]] < 3;
const LIQ = new Uint8Array(N), DV20 = new Float32Array(N);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN; if (isFinite(w)) { s -= w; n--; } }
    if (t >= 19 && n === 20) { DV20[b + t] = s / 20; if (CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } } }
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
const FUNDC = {}; for (const f of ['SPUS', 'HLAL']) { const arr = new Float64Array(T).fill(NaN), i = SY.get(f);
  if (i !== undefined && lastI[i] === T - 1) for (let t = 0; t < T; t++) arr[t] = CC(i, t); else { const b = await fundBars(f); if (b) { const m = new Map(b.map(x => [x.d, x.c])); for (let t = 0; t < T; t++) { const v = m.get(D[t]); if (v > 0) arr[t] = v; } } }
  FUNDC[f] = arr; }
STATUS.funds = { ok: ['SPUS', 'HLAL'].every(f => FUNDC[f].filter(x => x > 0).length > T * 0.9), SPUS: FUNDC.SPUS.filter(x => x > 0).length, HLAL: FUNDC.HLAL.filter(x => x > 0).length };

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
const SICC = { ...J(SC4 + '/sic.json', {}), ...J(SC + '/sic.json', {}) }; let sicFetched = 0;
const sicOfSym = (s) => { const x = SIC0[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECCIK[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
const sicAt = (i, cik) => sicOfSym(SYMS[i]) || (cik && SICC[cik]) || (cik && SUBS[cik] && SUBS[cik].sic) || null;
const startT = MS.find(t => t >= 19);   // the first month start with a 20-session traded value
const QS = MS.filter(t => t >= startT && isQuarterMonth(D[t]));
{ const want = new Set(); for (const t of [...QS, T - 1]) for (const r of universe(t).ranked.slice(0, 600)) if (!sicAt(r.i, r.cik) && !(r.cik in SICC)) want.add(r.cik);
  if (!OFFLINE && !DIAG) for (const c of want) { if (left() < 70 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null; try { r = await fetch(SECD + '/submissions/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); } catch (e) {}
    if (r && r.ok) { const j = await r.json().catch(() => null); SICC[c] = j && j.sic ? String(j.sic).padStart(4, '0') : ''; sicFetched++; } else if (r && r.status === 404) SICC[c] = ''; }
  if (sicFetched) W(SC + '/sic.json', Object.fromEntries(Object.entries(SICC))); let n = 0, have = 0; for (const t of [...QS, T - 1]) for (const r of universe(t).ranked.slice(0, 300)) { n++; if (sicAt(r.i, r.cik)) have++; }
  STATUS.sic = { ok: n > 0 && have >= n * 0.95, top300Rows: n, withSic: have, askedNow: sicFetched, wanted: want.size }; log('SIC: ' + JSON.stringify(STATUS.sic)); }
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';

// coverage / survivorship diagnostics
const DIAGS = { window: [D[0], D[T - 1]], sessions: T, stocks: NS, data: STATUS };
{ let g = 0, gc = 0, a = 0, ac = 0; for (const t of MS) for (const i of liqList(t)) { const c = cikAt(i, D[t]); if (vanishedI(i)) { g++; if (c) gc++; } else { a++; if (c) ac++; } }
  STATUS.cikCover = { ok: g === 0 || gc / g >= 0.75, vanished: g, vanishedWithCik: gc, alive: a, aliveWithCik: ac, vanishedShare: r4(g ? gc / g : null), aliveShare: r4(a ? ac / a : null) };
  const snap = (t) => { const U = universe(t); return { date: D[t], liquid: U.liquid, companies: U.companies, ranked: U.ranked.length, noCik: U.noCik, noFacts: U.noFacts, noShares: U.noShares, foreign: U.foreign, top30: U.ranked.slice(0, 30).map(r => SYMS[r.i] + ' ' + (r.cap / 1e9).toFixed(0) + 'B'), rank500Cap: U.ranked[499] ? r4(U.ranked[499].cap / 1e9) : null, vanishedInTop500: U.ranked.slice(0, 500).filter(r => vanishedI(r.i)).length,
    probe: Object.fromEntries(['GOOGL', 'META', 'BRK.B', 'NVDA', 'AVGO', 'WMT', 'CMG', 'SIRI', 'BYND', 'PARA', 'NFE', 'SPCX', 'PLTR', 'LRCX', 'CTAS'].map(sy => { const r = U.ranked.find(z => SYMS[z.i] === sy); return [sy, r ? (r.cap / 1e9).toFixed(1) + 'B #' + (r.rank + 1) : 'not ranked'] })) }; };
  DIAGS.snapshots = [...QS.filter(t => D[t].slice(5, 7) === '01'), T - 1].map(snap); }
if (DIAG) { console.log('SQUAD 5 DIAGNOSTICS (coverage and the largest companies only; nothing judged or written)'); console.log(JSON.stringify(DIAGS, null, 1).slice(0, 30000)); process.exit(0); }

// ================= 5. THE BASKETS (events per rule) =================
const MSET = new Set(MS), msIdx = new Map(MS.map((t, j) => [t, j]));
const spyAbove = (t) => aboveMA(SPYC, t, 200);
const topKeys = (t, n) => universe(t).ranked.slice(0, n).map(r => r.i);
const capRows = (t, n) => universe(t).ranked.slice(0, n).map(r => ({ key: r.i, cap: r.cap }));
function momRanked(t) { const U = universe(t).ranked.slice(0, BIG), c = []; for (const r of U) { const m = mom121(cl(r.i), t); if (ok(m)) c.push({ i: r.i, m }); } return c.sort((a, b) => b.m - a.m || a.i - b.i).map(z => z.i); }
function qualKeys(t) { const rows = []; for (const r of universe(t).ranked.slice(0, QUALN)) { const co = coOf(r.cik); if (!co) continue; const f = fundamentals(co, D[t]); if (!f || !f.revEnd || f.revEnd > addDays(D[t], -PIT_LAG)) continue; rows.push({ key: r.i, roic: f.roic, fcfM: f.fcfM }); } return qualityPick(rows, TOPN); }
const shariahMemo = new Map();
function shariahRows(t, n) { if (shariahMemo.has(t)) return shariahMemo.get(t); const out = [], why = {};
  for (const r of universe(t).ranked) { if (out.length >= n) break; const co = coOf(r.cik), bs = co ? debtCashAt(co, D[t]) : { debt: null, cash: null }, v = shariahOk({ sic: sicAt(r.i, r.cik), debt: bs.debt, cash: bs.cash, cap: r.cap });
    if (v.ok) out.push({ key: r.i, cap: r.cap }); else why[v.why.replace(/ \(SIC.*/, '')] = (why[v.why.replace(/ \(SIC.*/, '')] || 0) + 1; }
  const o = { rows: out, why }; shariahMemo.set(t, o); return o; }
// new-entrant flags per month start (in the 500 largest?)
const in500 = new Map(), in500cik = new Map(); for (const t of MS) if (t >= startT) { const top = universe(t).ranked.slice(0, BIG); in500.set(t, new Set(top.map(r => r.i))); in500cik.set(t, new Set(top.map(r => r.cik))); }
function entrants(t) { const j = msIdx.get(t), prev = MS.slice(Math.max(0, j - NEWIN_LOOK), j).filter(x => in500.has(x)); if (prev.length < NEWIN_LOOK) return null;
  const out = []; for (const r of universe(t).ranked.slice(0, BIG)) { const flags = prev.map(p => in500cik.get(p).has(r.cik) || in500.get(p).has(r.i)); if (newEntrant(true, flags)) out.push(r.i); } return out; }
// returns { start (formation session), events: Map te -> event, cw (cap-weighted twin events or null), log }
function build(id) {
  const ev = new Map(), cw = new Map(), R = RULES[id], tf = !!R.tf; let first = null, invested = false, held = [];
  const formOK = (t) => t + 1 < T;
  if (id === 'SQ5-TOP20' || id === 'SQ5-EW100' || id === 'SQ5-QUAL20' || id === 'SQ5-SHARIAH30') {
    for (const t of QS) { if (!formOK(t)) continue; let w, wc = null;
      if (id === 'SQ5-TOP20') { const rows = capRows(t, TOPN); w = equalW(rows.map(r => r.key)); wc = capW(rows); }
      else if (id === 'SQ5-EW100') { const rows = capRows(t, EWN); w = equalW(rows.map(r => r.key)); wc = capW(rows); }
      else if (id === 'SQ5-QUAL20') w = equalW(qualKeys(t));
      else { const rows = shariahRows(t, SHN).rows; w = equalW(rows.map(r => r.key)); wc = capW(rows); }
      if (!w.size) continue; if (first === null) first = t; ev.set(t + 1, { kind: 'reset', w }); if (wc) cw.set(t + 1, { kind: 'reset', w: wc }); }
    return { start: first, events: ev, cw: cw.size ? cw : null, reviews: [...ev.keys()].sort((a, b) => a - b) }; }
  if (id === 'SQ5-TOP20-TF') { for (const t of MS) { if (t < startT || !formOK(t)) continue; const up = spyAbove(t); if (up === null) continue; if (first === null) first = t;
      if (!up) { if (invested) ev.set(t + 1, { kind: 'cash' }); invested = false; continue; }
      if (!invested || isQuarterMonth(D[t])) { ev.set(t + 1, { kind: 'reset', w: equalW(topKeys(t, TOPN)) }); invested = true; } }
    return { start: first, events: ev, cw: null, reviews: [...ev.keys()].sort((a, b) => a - b) }; }
  if (id === 'SQ5-MOMBUF' || id === 'SQ5-MOMBUF-TF') { for (const t of MS) { if (t < 252 || !formOK(t)) continue; const up = tf ? spyAbove(t) : true; if (up === null) continue;
      if (!up) { if (first === null) first = t; if (held.length) ev.set(t + 1, { kind: 'cash' }); held = []; continue; }
      const ranked = momRanked(t); if (ranked.length < MOMBUF) continue; if (first === null) first = t;
      const s = bufferSelect(held, ranked, TOPN, MOMBUF); if (s.drop.length || s.add.length) ev.set(t + 1, { kind: 'drift', drop: s.drop, add: s.add }); held = [...s.keep, ...s.add]; }
    return { start: first, events: ev, cw: null, reviews: first === null ? [] : MS.filter(t => t >= first && t + 1 < T).map(t => t + 1) }; }
  if (id === 'SQ5-NEWIN') { const cohorts = []; for (const t of MS) { if (!in500.has(t) || !formOK(t)) continue; const e = entrants(t); if (e === null) continue; if (first === null) first = t;
      const j = msIdx.get(t); cohorts.push({ j, keys: e }); const open = new Set(); for (const c of cohorts) if (j - c.j < NEWIN_MONTHS) for (const k of c.keys) open.add(k);
      ev.set(t + 1, { kind: 'reset', w: equalW([...open], NEWIN_MAXW) }); }
    return { start: first, events: ev, cw: null, reviews: [] }; }
  throw new Error('unknown rule ' + id);
}

// ================= 6. YARDSTICKS =================
const ART = new Map(), artOf = (i) => { if (!ART.has(i)) ART.set(i, artifactJumps(cl(i))); return ART.get(i); };
const lastCloseI = (i, k) => { for (let q = Math.min(k, T - 1); q >= 0; q--) { const z = CC(i, q); if (z > 0) return z; } return null; };
const pxApi = { o: (i, k) => OO(i, k), c: (i, k) => CC(i, k), last: (i) => lastI[i], vanished: vanishedI, dead: deadI };
// value of one share at the exit (x, at): dead after vanishing = 0, gone = last close
const exitVal = (i, x, at) => { if (vanishedI(i) && x > lastI[i]) return deadI(i) ? 0 : CC(i, lastI[i]); if (at === 'o') { const o = OO(i, x); return o > 0 ? o : lastCloseI(i, x - 1); } return lastCloseI(i, x); };
// the average liquid stock (every second one; liquid the session before) bought at the open of te: { raw, cap } by close offset
const curveMemo = new Map();
function curve(te) { if (curveMemo.has(te)) return curveMemo.get(te); const L = T - te, sR = new Float64Array(L), sC = new Float64Array(L), cnt = new Uint32Array(L), lq = liqList(te - 1);
  for (let q = 0; q < lq.length; q += 2) { const i = lq[q], e = OO(i, te); if (!(e > 0)) continue; const aj = artOf(i), li = lastI[i], van = vanishedI(i), dead = deadI(i); let lc = NaN, wall = L;
    for (const a of aj) if (a > te - 1) { wall = a - te; break; }   // a split artifact ends this stock's path (left out from there on)
    for (let off = 0; off < Math.min(L, wall); off++) { const k = te + off; let v; if (van && k > li) v = dead ? 0 : CC(i, li); else { const z = CC(i, k); if (z > 0) lc = z; v = lc; } if (!(v >= 0)) continue; sR[off] += v / e; sC[off] += Math.min(v / e, 1 + CAP); cnt[off]++; } }
  const raw = new Float32Array(L), cap = new Float32Array(L); for (let off = 0; off < L; off++) { raw[off] = cnt[off] >= 50 ? sR[off] / cnt[off] - 1 : NaN; cap[off] = cnt[off] >= 50 ? sC[off] / cnt[off] - 1 : NaN; }
  const o = { raw, cap }; curveMemo.set(te, o); return o; }
const ctrl = (te, x, at, kind) => { const cv = curve(te)[kind], off = (at === 'o' ? x - 1 : x) - te; const v = off >= 0 && off < cv.length ? cv[off] : NaN; return isFinite(v) ? v : null; };
// the same stock held the same number of sessions on its other days (entries every 21 sessions, 63+ sessions away)
function ownOf(i, te, x, at, capIt) { const L = x - te, out = [];
  for (let k = 1; k < T; k += 21) { if (Math.abs(k - te) < 63) continue; const xe = k + L; if (xe > T - 1) break; const e = OO(i, k); if (!(e > 0)) continue; if (hasArtifact(artOf(i), k - 1, xe)) continue;
    const v = exitVal(i, xe, at); if (!(v >= 0)) continue; const g = v / e - 1; out.push(capIt ? Math.min(g, CAP) : g); }
  return out.length ? mean(out) : null; }
const spyRet = (te, x, at) => { const a = SPYC[te - 1] > 0 ? OO(spyI, te) : NaN, b = at === 'o' ? OO(spyI, x) : SPYC[x]; return a > 0 && b > 0 ? b / a - 1 : null; };
// equal-weight average liquid stock on custom points (each step: liquid at the step's start; each stock capped at +300% a step)
function ewPath(pts) { const lv = new Float64Array(T).fill(NaN); if (!pts.length) return lv; lv[pts[0]] = 1;
  for (let j = 1; j < pts.length; j++) { const a = pts[j - 1], b = pts[j]; let s = 0, n = 0;
    for (const i of liqList(a)) { const e = CC(i, a); if (!(e > 0) || hasArtifact(artOf(i), a, b)) continue; const v = vanishedI(i) && b > lastI[i] ? (deadI(i) ? 0 : CC(i, lastI[i])) : lastCloseI(i, b); if (!(v >= 0)) continue; s += Math.min(v / e, 1 + CAP); n++; }
    lv[b] = lv[a] * (n >= 50 ? s / n : 1); }
  return lv; }

// ================= 7. 5-YEAR ONE-SHOT: portfolio + per-trade =================
const YE = (() => { let k = -1; for (let t = 0; t < T; t++) if (D[t] < SPLIT) k = t; return k; })();   // the last close before 2024
const spyLv = Float64Array.from(SPYC, x => x > 0 ? x : NaN);
function portStats(eq, s0, label) { const lv = new Float64Array(T).fill(NaN); lv[s0] = 1; for (let k = s0 + 1; k < T; k++) lv[k] = eq[k];
  const pts = [s0, ...ME.filter(k => k > s0 && k < T - 1), T - 1], ew = ewPath(pts), halves = { older: [s0, YE], newer: [YE, T - 1], all: [s0, T - 1] }, out = {};
  for (const [h, [a, b]] of Object.entries(halves)) { if (!(b > a)) { out[h] = null; continue; } const rule = pathStats(lv, a, b), spy = pathStats(spyLv, a, b), spus = pathStats(FUNDC.SPUS, a, b), hlal = pathStats(FUNDC.HLAL, a, b), avg = pathStats(ew, a, b, pts);
    out[h] = { from: D[a], to: D[b], rule, spy, spus, hlal, avgStock: avg, beatsSpy: !!(rule && spy && rule.cagr > spy.cagr), beatsAvgStock: !!(rule && avg && rule.cagr > avg.cagr) }; }
  return { label, halves: out, months: monthly(lv, pts, D), spyMonths: monthly(spyLv, pts, D) }; }
const RES = {}, need = IDS.filter(id => !(id in FROZEN)), PORT = {}, TRADES = {};
for (const id of IDS) { const B = build(id); if (B.start === null) { RES[id] = { verdict: 'TOO FEW CASES', why: 'no formation possible' }; continue; }
  const s0 = B.start, first = s0 + 1, S = simulate({ T, start: first, events: B.events, px: pxApi, side: SIDE }), SS = simulate({ T, start: first, events: B.events, px: pxApi, side: SIDE_STRESS });
  const avgEq = mean([...S.eq].filter(x => x > 0)), P = { standard: portStats(S.eq, s0, '0.4% per side'), stress: portStats(SS.eq, s0, '0.6% per side'), turnoverPerYear: r4(S.traded / avgEq / ((T - first) / YEAR)), costPaid: r4(S.costPaid), rebalances: B.events.size,
    exposure: r4(mean([...B.events.values()].map(e => e.kind === 'cash' ? 0 : e.kind === 'reset' ? [...e.w.values()].reduce((a, b) => a + b, 0) : 1))) };
  if (B.cw) { const C = simulate({ T, start: first, events: B.cw, px: pxApi, side: SIDE }); P.capWeightedTwin = portStats(C.eq, s0, 'cap-weighted, same members, 0.4% per side'); }
  P.beatsSpyBothHalves = !!(P.standard.halves.older && P.standard.halves.newer && P.standard.halves.older.beatsSpy && P.standard.halves.newer.beatsSpy);
  P.beatsSpyBothHalvesStress = !!(P.stress.halves.older && P.stress.halves.newer && P.stress.halves.older.beatsSpy && P.stress.halves.newer.beatsSpy);
  PORT[id] = P;
  // per-trade
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
  const hold = periodHold(id), holdMedian = median(tr.filter(z => z.kind !== 'open').map(z => z.days));
  RES[id] = { ...v, name: RULES[id].name, hold, holdMedianSessions: holdMedian, cost: COST, split: SPLIT, start: D[s0], results: R, perYear: PY, portfolio: P, uncappedSensitivity: { verdict: vu.verdict, older: { avg: RU.older.avg, edge: RU.older.edge, tBlock: RU.older.tBlock }, newer: { avg: RU.newer.avg, edge: RU.newer.edge, tBlock: RU.newer.tBlock } },
    counts: { periods: tr.length, holdings: S.trades.length, stillHeld: tr.filter(z => z.kind === 'open').length, dead: tr.filter(z => z.kind === 'dead').length, gone: tr.filter(z => z.kind === 'gone').length, splitArtifactsLeftOut: art, stocks: new Set(tr.map(z => z.s)).size } };
  if (id === 'SQ5-SHARIAH30') RES[id].shariahScreenOut = shariahRows(QS[QS.length - 1], SHN).why;
  TRADES[id] = tr.map(z => ({ s: z.s, sig: z.sig, buy: z.buy, sell: z.sell, kind: z.kind, net: r4(z.gRaw - COST), avgStock: r4(ok(z.cRaw) ? z.cRaw - COST : null), sameStock: r4(z.ownRaw === null ? null : z.ownRaw - COST), spy: r4(z.spy), days: z.days }));
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tB ' + h.tBlock;
  const ph = (h) => { const x = P.standard.halves[h]; return x ? 'CAGR ' + pc(x.rule && x.rule.cagr) + ' vs SPY ' + pc(x.spy && x.spy.cagr) + ' avgStock ' + pc(x.avgStock && x.avgStock.cagr) + ' DD ' + pc(x.rule && x.rule.maxDD) : 'n/a'; };
  log('- ' + id + ': ' + RES[id].verdict + ' | trades older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | PORTFOLIO older ' + ph('older') + ' | newer ' + ph('newer') + ' | beats SPY both halves: ' + P.beatsSpyBothHalves + ' | ' + String(RES[id].why).slice(0, 250)); }

// ================= 8. FREEZE =================
const complete = T >= 1000 && STATUS.facts.ok && STATUS.cikCover.ok && STATUS.sic.ok && STATUS.tickerMap.ok && STATUS.domicile.ok && STATUS.splits.ok && STATUS.altShares.ok;
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k, r]) => need.includes(k) && complete && r.results).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], to: D[T - 1], bar: BAR, ...r }])), (r) => r.verdict !== 'TOO FEW CASES');

// ================= 9. TODAY (current members) + PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const seen = new Set(lines.map(x => x.type + '|' + x.id)), newLines = [], today = {}, board = {};
for (const id of IDS) { const B = build(id); if (B.start === null) continue; const S = simulate({ T, start: B.start + 1, events: B.events, px: pxApi, side: SIDE });
  const lastEq = S.eq[T - 1], openT = S.trades.filter(z => z.kind === 'open');
  const members = openT.map(z => ({ sym: SYMS[z.i], close: r4(CC(z.i, T - 1) || lastCloseI(z.i, T - 1)), halal: halal(SYMS[z.i]), since: D[z.te], sinceBuy: r4(z.pxOut / z.pxIn - 1) })).sort((a, b) => (b.sinceBuy || 0) - (a.sinceBuy || 0));
  const fr = firstRun[id] || {}, paper = S.trades.filter(z => D[z.te] >= START);
  for (const z of paper) { const sid = id + '|' + SYMS[z.i] + '|' + D[z.te];
    if (!seen.has('signal|' + sid)) { seen.add('signal|' + sid); newLines.push({ type: 'signal', id: sid, m: id, sym: SYMS[z.i], d: D[z.te - 1], buy: D[z.te], px: r4(z.pxIn), halal: halal(SYMS[z.i]), recordedAfter: D[T - 1] }); }
    if (z.kind !== 'open' && !seen.has('result|' + sid)) { seen.add('result|' + sid); const g = (z.kind === 'dead' ? 0 : z.pxOut) / z.pxIn - 1, c = ctrl(z.te, z.x, z.at, 'raw');
      newLines.push({ type: 'result', id: sid, m: id, sym: SYMS[z.i], d: D[z.te - 1], buy: D[z.te], sell: D[z.x], kind: z.kind, g: r4(g), net: r4(g - COST), avgStock: c === null ? null : r4(c - COST) }); } }
  const closed = [...lines, ...newLines].filter(x => x.type === 'result' && x.m === id).map(x => ({ d: x.d, sym: x.sym, g: x.g, c: x.avgStock === null ? NaN : x.avgStock + COST })), st = boardStats(closed);
  const inCash = !openT.length;
  today[id] = { name: RULES[id].name, hold: fr.hold || (RES[id] && RES[id].hold) || 63, tier: fr.verdict || null, kind: RULES[id].kind,
    newSignals: members.map(m => ({ sym: m.sym, close: m.close, halal: m.halal })), members, inCash, portfolioValueSinceStart: r4(lastEq), nextReview: RULES[id].kind === 'quarterly' ? 'first session of the next quarter (Jan / Apr / Jul / Oct)' + (RULES[id].tf ? '; the 200-day filter is checked every month start' : '') : 'first session of the next month' };
  board[id] = { name: RULES[id].name, paperEntries: paper.length, open: paper.filter(z => z.kind === 'open').length, closed: st, ready: paperReady(st), fiveYear: fr.verdict ? { verdict: fr.verdict, why: fr.why, beatsSpyBothHalves: fr.portfolio ? fr.portfolio.beatsSpyBothHalves : null } : null }; }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
const NOTE = 'PAPER ONLY. Squad 5 baskets (SQ5-*: index-style rules). newSignals = the CURRENT members of each basket (what the rule holds after its latest review), not a new-signal list; a basket is meant to be owned as a whole. Nothing here is a buy by itself: a rule needs a frozen 5-year verdict that qualifies (data/squad5-lab.json firstRun). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy. Entries and exits from ' + START + ' are recorded in data/squad5-paper.jsonl.';
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, note: NOTE, methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.length + ' new line(s)');

// ================= 10. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'squad5-core.mjs RULES + data/strategy-library.json SQ5-* (24 Oct 2026, before any run)', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, stress: STRESS, sideCost: SIDE, sideStress: SIDE_STRESS, complete, data: STATUS, diagnostics: DIAGS,
  standard: 'PER TRADE (TRY SMALL reads this): each continuous holding = one trade; both halves by entry (before / from ' + SPLIT + '): > 0 after 0.8% and 1.2%, better than the average liquid stock over the same days, better than the same stock held as long on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= ' + TIER2_T + ' (63-session blocks) -> TRADABLE SMALL; >= ' + BAR + ' -> PROVEN; plus return per year of capital above SPY on the same days in both halves. All gross returns capped at +300% on both sides (AUD-1 capBoth); uncapped = sensitivity. PORTFOLIO: 0.4% per side on all turnover (stress 0.6%), CAGR / max drawdown per half vs SPY, SPUS, HLAL (price) and the equal-weight average liquid stock; beatsSpyBothHalves.',
  halalNote: 'No point-in-time halal status exists in the repository; the tests run on the whole liquid market. SQ5-SHARIAH30 uses a point-in-time Shariah PROXY (SIC business screen + debt and cash < 33% of market value), not ZAD.',
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, r])) }), trades: TRADES };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result || !r.results) continue; const R = r.results, P = r.portfolio || {}, H = (h) => ((P.standard || {}).halves || {})[h] || {};
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.to); e.study = 'squad5-lab.mjs -> data/squad5-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock],
      portfolioCagr: [H('older').rule ? H('older').rule.cagr : null, H('newer').rule ? H('newer').rule.cagr : null], spyCagr: [H('older').spy ? H('older').spy.cagr : null, H('newer').spy ? H('newer').spy.cagr : null], beatsSpyBothHalves: P.beatsSpyBothHalves, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad5-lab: library not updated: ' + e.message); }
console.log('SQUAD 5 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + (complete ? '' : ' | INCOMPLETE: ' + Object.entries(STATUS).filter(([, s]) => s && s.ok === false).map(([k]) => k).join(', ')));
