// ANOMALY LAB (23 Oct 2026; owner: "find every documented way people make money in stocks and test it properly"). Research + a FORWARD
// PAPER lane; never places an order; no Telegram. Rules: anomaly-core.mjs header and ANOMALIES (pre-registered 23 Oct 2026 before any run;
// library ids ANOM-*; the lab writes the same rule text into data/strategy-library.json before computing anything).
// 1. DATA (GitHub Actions only; keys only from secrets, never printed):
//    prices  = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY, dead stocks' later prices
//              in its x rows) + the sessions since, from Massive's grouped daily bars (decoded-lab pattern) + splits since the cache day.
//    facts   = SEC XBRL company facts (bulk companyfacts.zip, else one request per company), compact, point in time (value-core.mjs).
//    shares  = data/shares.json.gz (split-adjusted, 30 days late). earnings = Nasdaq earnings calendar (a-cache read only + own cache).
//    insider = SEC Form 3/4/5 data sets (quarterly ZIPs, 2018 on). 13D / spin-offs = EDGAR quarterly master index. dividends = Massive.
//    short interest = FINRA consolidated short interest API (public). 13F = SEC Form 13F data sets + Massive CUSIP -> ticker.
//    A source that does not load makes ITS anomalies "NOT RUN" (no verdict frozen); the others run.
// 2. 5-YEAR ONE-SHOT for every anomaly not yet frozen: every signal of the window, judged at the tier-2 standard (value-core judge; halves =
//    formation before / from 2024-01-01). First complete verdict frozen in data/anomaly-lab.json firstRun (first-run.mjs freezeEach), later
//    runs = monitoring only. Same firstRun / results.older / results.newer format as data/value-lab.json.
// 3. PAPER LANE (from Monday 26 Oct 2026): every session is scanned once; each new signal is appended to data/anomaly-paper.jsonl with its
//    frozen plan (next open, hold) and the owner's ZAD halal mark; resolved after its hold. data/anomaly-today.json (methods[id].newSignals)
//    and data/anomaly-board.json (per anomaly: closed paper trades after 0.8% cost, vs the average stock; READY = 30+ trades on 10+ days > 0).
import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { execFileSync, spawn } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, TIER2_T, ttmAt, instantAt, quarterAt, shiftYear } from './value-core.mjs';
import { ANOMALIES, NEEDS_DATA, IDS, COST, SPLIT, PAPER_START, mean, sd, r4, halfOf, pickFrac, pctRanks, mom, high52, volatility, maxRet, residMom, fpBeta, ivol, logSum, hvpWeek, seasonal,
  monthStarts, weekStarts, tomWindows, nextSession, reactionIdx, quantile, surge, insiderType, parseMasterIdx, byFiling, bestIdeas, divInitiations, EIL, eilIndustryOk, eilStockOk, ownAverage,
  boardStats, paperReady, shapeOf, preRegister } from './anomaly-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov', FINRA = local(env.FINRA_BASE) || 'https://api.finra.org';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', AC = env.ANOM_CACHE || 'anomaly-cache', OUT = 'data/anomaly-lab.json', PAPER = 'data/anomaly-paper.jsonl', TODAY = 'data/anomaly-today.json', BOARD = 'data/anomaly-board.json';
const START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.ANOM_MINUTES || 230) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(AC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0);

// ================= 0. PRE-REGISTRATION in the library (before any computation; idempotent; anomaly-core preRegister) =================
{ const LB = J('data/strategy-library.json', null), ch = preRegister(LB); if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); log('library: ' + ch + ' ANOM entries pre-registered now'); }

// ================= 1. PRICES =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('anomaly-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let ms = Date.parse(cacheLast) + 864e5; ms <= Date.now(); ms += 864e5) { const d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none') + (env.MASSIVE_KEY ? '' : ' (no MASSIVE_KEY)'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) { for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN), CX = new Float32Array(N).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; } });
const SIC = store.sic || {}; store = null;
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; C[q] /= r; CX[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), ser = (A, i) => A.subarray(i * T, i * T + T), MKT = spyI !== undefined ? ser(C, spyI) : null;
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS);
// liquidity: close 5 USD+ and 20-session average traded value 5M USD+ (main rows only)
const LIQ = new Uint8Array(N); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = C[b + t] * V[b + t]; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const w = C[b + t - 20] * V[b + t - 20]; if (isFinite(w)) { s -= w; n--; } } if (t >= 19 && n === 20 && C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqAt = new Map(); const liqList = (t) => { if (!liqAt.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqAt.set(t, a); } return liqAt.get(t); };
const closeAt = (i, x, k) => { for (let q = x; q >= k; q--) { const z = C[i * T + q]; if (z > 0) return z; const y = CX[i * T + q]; if (y > 0) return y; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1) return null; const e = O[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const cMemo = new Map(); const ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; const g = ret(i, k, x); if (g !== null && Math.abs(g) < 3) v.push(g); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
// industry (SIC 2-digit): the Sunday cache's Massive codes, else the SEC code list
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {}, c: {} });
const sicOf = (s) => { const x = SIC[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECCIK[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
const sic2 = (s) => { const c = sicOf(s); return c ? c.slice(0, 2) : null; }, finCo = (s) => { const c = sicOf(s); return !!c && c[0] === '6'; };
const symCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(a); const y = SECCIK[s]; return y ? String(y[0]) : null; };
const cikSyms = new Map(); for (const s of SYMS) { const c = symCik(s); if (c) (cikSyms.get(c) || cikSyms.set(c, []).get(c)).push(s); }
const sharesKnown = (cik, d) => { const a = SH.c[cik]; if (!a) return null; const lim = iso(Date.parse(d + 'T00:00:00Z') - 30 * 864e5); let v = null; for (const [e, n] of a) if (e <= lim) v = n; return v; };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const FORM_M = monthStarts(D), FORM_W = weekStarts(D), STATUS = {};

// ================= 2. DATA SOURCES =================
async function get(url, opt = {}) { for (let a = 0; a < 3; a++) { try { const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(opt.timeout || 120000) }); if (r.status === 404) return { status: 404 }; if (r.status === 429 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; } return r; } catch (e) { await sleep(2000 * (a + 1)); } } return null; }
const usd = (s) => { const x = String(s ?? '').trim(); if (!x || x === 'N/A') return null; const neg = /^\(.*\)$/.test(x) || /^-/.test(x), y = x.replace(/[()$,\s-]/g, ''); if (!y || !isFinite(+y)) return null; return neg ? -y : +y; };
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : null; };
const tsv = (zip, name) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const L = txt.split(/\r?\n/), H = L[0].split('\t'); return { H, rows: L.slice(1).filter(Boolean).map(l => l.split('\t')) }; };
const zipNames = (zip) => { try { return execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 24 }).toString().split('\n').filter(Boolean); } catch (e) { return []; } };
async function download(url, file, headers = {}) { try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', headers.ua || UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 30 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }

// ---- 2a. SEC company facts (compact, own tags) ----
const TAGS = { assets: ['Assets'], liab: ['Liabilities'], ni: ['NetIncomeLoss', 'ProfitLoss'], cfo: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], cogs: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'], gp: ['GrossProfit'],
  sga: ['SellingGeneralAndAdministrativeExpense'], rd: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'], capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  bb: ['PaymentsForRepurchaseOfCommonStock'] };
const ALLTAGS = [...new Set(Object.values(TAGS).flat())];
const compact = (j) => { const out = {}, g = j && j.facts && j.facts['us-gaap']; if (!g) return out;
  for (const tag of ALLTAGS) { const u = g[tag] && g[tag].units && g[tag].units.USD; if (!Array.isArray(u)) continue; const rows = [], seen = new Set();
    for (const x of [...u].sort((a, b) => a.filed < b.filed ? -1 : 1)) { if (!x || !x.end || !x.filed || !isFinite(x.val) || x.end < '2016-01-01') continue; const k = (x.start || '') + '|' + x.end + '|' + x.val; if (seen.has(k)) continue; seen.add(k); rows.push([x.start || '', x.end, x.val, x.filed]); }
    if (rows.length) out[tag] = rows; } return out; };
let FX = JZ(AC + '/facts.json.gz', { at: null, c: {} });
{ const need = new Set(); for (const t of FORM_M) for (const i of liqList(t)) { const c = symCik(SYMS[i]); if (c) need.add(c); }
  const freshF = FX.at && Date.now() - Date.parse(FX.at) < 6 * 864e5, todo = [...need].filter(c => !freshF || !FX.c[c]);
  if (todo.length && left() > 60 * 60e3) { const zip = AC + '/companyfacts.zip'; let zipOk = false, got = 0, req = 0, fail = 0;
    if (!local(env.SEC_BASE)) zipOk = await download(SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip', zip) && fs.statSync(zip).size > 1e8;
    for (const c of todo) { const name = 'CIK' + c.padStart(10, '0') + '.json'; let j = null;
      if (zipOk) { try { j = JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch (e) { j = null; } }
      else { if (left() < 90 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 120); req++; const r = await get(SECD + '/api/xbrl/companyfacts/' + name, { headers: { 'User-Agent': UA } }); if (r && r.ok) j = await r.json().catch(() => null); else if (!r || r.status !== 404) fail++; }
      if (j) { FX.c[c] = compact(j); got++; } }
    if (zipOk) try { fs.unlinkSync(zip); } catch (e) {}
    FX.at = new Date().toISOString(); WZ(AC + '/facts.json.gz', FX); log('SEC facts: ' + got + ' of ' + todo.length + ' companies (' + (zipOk ? 'bulk file' : req + ' requests, ' + fail + ' failed') + ')'); }
  const cov = [...need].filter(c => FX.c[c] && Object.keys(FX.c[c]).length).length; STATUS.facts = { ok: need.size > 0 && cov >= need.size * 0.8, companies: need.size, withFacts: cov, at: FX.at }; log('SEC facts coverage ' + cov + '/' + need.size); }
const coMemo = new Map(); const coOf = (s) => { const cik = symCik(s); if (!cik) return null; if (coMemo.has(cik)) return coMemo.get(cik); const c = FX.c[cik]; let o = null;
  if (c) { o = {}; for (const [g, tags] of Object.entries(TAGS)) { o[g] = {}; for (const t of tags) if (c[t]) o[g][t] = c[t].map(([s0, e, v, f]) => ({ s: s0, e, v, f })); } } coMemo.set(cik, o); return o; };

// ---- 2b. Nasdaq earnings calendar ----
const NQ_HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
const REPORTS = []; { const days = []; for (let x = Date.parse(D[0] + 'T12:00:00Z'); x <= Date.now() + 14 * 864e5; x += 864e5) { const w = new Date(x).getUTCDay(); if (w > 0 && w < 6) days.push(iso(x)); }
  let fetched = 0, miss = 0, fromA = 0; const today = iso(Date.now());
  for (const d of days) { let rows = d < iso(Date.now() - 7 * 864e5) ? J(AC + '/nasdaq/' + d + '.json', null) : null; if (!rows && d < iso(Date.now() - 7 * 864e5)) { rows = J('a-cache/nasdaq/' + d + '.json', null); if (rows) fromA++; }
    if (!rows) { if (left() < 100 * 60e3 && d < today) { miss++; continue; } await sleep(local(env.NASDAQ_BASE) ? 0 : 350); fetched++; const r = await get(NQ + '/api/calendar/earnings?date=' + d, { headers: NQ_HEAD, timeout: 30000 }); const j = r && r.ok ? await r.json().catch(() => null) : null;
      if (!j || !j.data) { if (d <= today) miss++; continue; } rows = (j.data.rows || []).map(x => { const s = String(x.symbol || '').trim(); if (!/^[A-Z]{1,5}$/.test(s)) return null; return [s, x.time === 'time-pre-market' ? 'bmo' : x.time === 'time-after-hours' ? 'amc' : null, usd(x.eps), usd(x.epsForecast)]; }).filter(Boolean); W(AC + '/nasdaq/' + d + '.json', rows); }
    for (const r of rows) REPORTS.push({ sym: r[0], d, time: r[1], a: r[2], e: r[3] }); }
  const past = days.filter(d => d <= today).length; STATUS.earn = { ok: miss <= past * 0.05, days: past, missing: miss, fetchedNow: fetched, fromAgentA: fromA, reports: REPORTS.length }; log('Nasdaq calendar: ' + REPORTS.length + ' report rows, ' + miss + ' days missing, ' + fetched + ' fetched now'); }

// ---- 2c. SEC insider data sets (2018 on): purchases + every trader's trade months ----
const INS = { buys: [], months: new Map() }; { const qs = [], now = new Date(); for (let y = 2018; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, q * 3, 1)) < now) qs.push(y + 'q' + q);
  let got = 0, fail = [];
  for (const q of qs) { const cf = AC + '/insider/' + q + '.json'; let x = J(cf, null);
    if (!x && left() > 80 * 60e3) { for (const p of ['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/']) { const zip = AC + '/ins.zip'; if (!(await download(SEC + p + q + '_form345.zip', zip))) continue;
        const S = tsv(zip, 'SUBMISSION.tsv'), Nt = tsv(zip, 'NONDERIV_TRANS.tsv'), RO = tsv(zip, 'REPORTINGOWNER.tsv'); try { fs.unlinkSync(zip); } catch (e) {} if (!S || !Nt) continue;
        const own = new Map(); if (RO) { const a = RO.H.indexOf('ACCESSION_NUMBER'), b = RO.H.indexOf('RPTOWNERCIK'); for (const r of RO.rows) if (!own.has(r[a])) own.set(r[a], r[b]); }
        const si = (n) => S.H.indexOf(n), ni = (n) => Nt.H.indexOf(n), sub = new Map();
        for (const r of S.rows) if (r[si('DOCUMENT_TYPE')] === '4') sub.set(r[si('ACCESSION_NUMBER')], { d: isoD(r[si('FILING_DATE')]), sym: String(r[si('ISSUERTRADINGSYMBOL')] || '').toUpperCase().trim().replace(/-/g, '.') });
        const buys = [], months = new Set(); for (const r of Nt.rows) { const code = r[ni('TRANS_CODE')]; if (code !== 'P' && code !== 'S') continue; const s = sub.get(r[ni('ACCESSION_NUMBER')]); if (!s || !s.d) continue;
          const who = own.get(r[ni('ACCESSION_NUMBER')]); if (!who) continue; const td = isoD(r[ni('TRANS_DATE')]) || s.d; months.add(who + '|' + td.slice(0, 7));
          if (code === 'P' && r[ni('TRANS_ACQUIRED_DISP_CD')] === 'A' && /^[A-Z][A-Z0-9.]{0,6}$/.test(s.sym)) { const sh = +r[ni('TRANS_SHARES')], px = +r[ni('TRANS_PRICEPERSHARE')]; if (sh > 0 && px > 0) buys.push([s.sym, s.d, who, Math.round(sh * px), td]); } }
        x = { buys, months: [...months] }; W(cf, x); got++; break; } }
    if (!x) { fail.push(q); continue; } INS.buys.push(...x.buys); for (const m of x.months) { const [w, mo] = m.split('|'); (INS.months.get(w) || INS.months.set(w, new Set()).get(w)).add(mo); } }
  const lastDone = qs.slice(0, -1); STATUS.insider = { ok: lastDone.every(q => !fail.includes(q)), quarters: qs.length, downloadedNow: got, missing: fail, purchases: INS.buys.length }; log('insider: ' + INS.buys.length + ' purchases, ' + INS.months.size + ' insiders, missing ' + (fail.join(' ') || 'none')); }

// ---- 2d. EDGAR quarterly master index: SC 13D / SCHEDULE 13D originals and 10-12B ----
const EDG = []; { const want = new Set(['SC 13D', 'SCHEDULE 13D', '10-12B']), now = new Date(), qs = []; let fail = [];
  for (let y = 2020; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, (q - 1) * 3, 1)) <= now) qs.push([y, q]);
  for (const [y, q] of qs) { const cur = new Date(Date.UTC(y, q * 3, 1)) > now, cf = AC + '/edgar/' + y + 'q' + q + '.json'; let rows = cur ? null : J(cf, null);
    if (!rows && left() > 60 * 60e3) { await sleep(local(env.SEC_BASE) ? 0 : 200); let txt = null; const rz = await get(SEC + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.gz', { headers: { 'User-Agent': UA }, timeout: 300000 });
      if (rz && rz.ok) { try { txt = zlib.gunzipSync(Buffer.from(await rz.arrayBuffer())).toString('latin1'); } catch (e) { txt = null; } }
      if (!txt) { const r = await get(SEC + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.idx', { headers: { 'User-Agent': UA }, timeout: 300000 }); if (r && r.ok) txt = await r.text(); }
      if (txt) { rows = parseMasterIdx(txt, want); if (!cur) W(cf, rows); } }
    if (!rows) { fail.push(y + 'q' + q); continue; } EDG.push(...rows); }
  STATUS.edgar = { ok: !fail.length, quarters: qs.length, missing: fail, rows: EDG.length }; log('EDGAR index: ' + EDG.length + ' rows (13D + 10-12B), missing ' + (fail.join(' ') || 'none')); }

// ---- 2e. Massive dividends (declaration dates) ----
const DIVS = []; { const cf = AC + '/divs.json.gz'; let x = JZ(cf, null), ok = false;
  if (!x || Date.now() - Date.parse(x.at) > 6 * 864e5) { const rows = []; let path = '/v3/reference/dividends?declaration_date.gte=2019-01-01&order=asc&sort=declaration_date&limit=1000', pages = 0, done = false;
    while (path && pages < 2000 && left() > 70 * 60e3) { const j = await api(path); pages++; if (!j || j.refused || !Array.isArray(j.results)) break; for (const r of j.results) if (r && r.ticker && r.declaration_date) rows.push([r.ticker, r.declaration_date, r.dividend_type || '', r.ex_dividend_date || '']);
      if (!j.next_url) { done = true; break; } path = j.next_url.replace(/^https?:\/\/[^/]+/, ''); }
    if (done && rows.length > 1000) { x = { at: new Date().toISOString(), rows }; WZ(cf, x); } else log('dividends: download incomplete (' + pages + ' pages, ' + rows.length + ' rows)'); }
  else if (x) { const j = await api('/v3/reference/dividends?declaration_date.gte=' + iso(Date.now() - 20 * 864e5) + '&limit=1000'); if (j && Array.isArray(j.results)) { const seen = new Set(x.rows.map(r => r.join('|'))); for (const r of j.results) if (r && r.ticker && r.declaration_date) { const a = [r.ticker, r.declaration_date, r.dividend_type || '', r.ex_dividend_date || '']; if (!seen.has(a.join('|'))) x.rows.push(a); } } }
  if (x && x.rows) { ok = true; for (const r of x.rows) DIVS.push({ sym: r[0], decl: r[1], type: r[2] }); } STATUS.divs = { ok, rows: DIVS.length, at: x && x.at }; log('dividends: ' + DIVS.length + ' rows'); }

// ---- 2f. FINRA consolidated short interest (public API) ----
const SI = new Map(); { let ok = 0, tried = 0, note = ''; const months = []; for (let x = Date.parse(D[0].slice(0, 7) + '-01T00:00:00Z'); x <= Date.now(); ) { const d = new Date(x); months.push(iso(x).slice(0, 7)); x = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); }
  const pick = (r, ks) => { for (const k of ks) if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k]; return null; };
  for (const m of months) { const cur = m >= iso(Date.now() - 40 * 864e5).slice(0, 7), cf = AC + '/finra/' + m + '.json'; let rows = cur ? null : J(cf, null);
    if (!rows && !note && left() > 60 * 60e3) { tried++; rows = []; let off = 0, okm = true;
      while (true) { const r = await get(FINRA + '/data/group/otcMarket/name/consolidatedShortInterest', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, timeout: 60000,
          body: JSON.stringify({ limit: 5000, offset: off, dateRangeFilters: [{ fieldName: 'settlementDate', startDate: m + '-01', endDate: iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)) }] }) });
        if (!r || !r.ok) { okm = false; note = 'FINRA API answered ' + (r ? r.status : 'nothing') + ' for ' + m; break; } const a = await r.json().catch(() => null); if (!Array.isArray(a)) { okm = false; note = 'FINRA API: not a list for ' + m; break; }
        if (a.length && a.some(x => !String(pick(x, ['settlementDate']) || '').startsWith(m))) { okm = false; note = 'FINRA API ignored the date filter for ' + m; break; }
        for (const x of a) { const s = pick(x, ['symbolCode', 'issueSymbolIdentifier']), d = pick(x, ['settlementDate']), q = +pick(x, ['currentShortPositionQuantity', 'currentShortShareNumber']), dtc = +pick(x, ['daysToCoverQuantity', 'daysToCoverNumber']), adv = +pick(x, ['averageDailyVolumeQuantity']);
          if (s && d && isFinite(q)) rows.push([String(s).toUpperCase(), String(d).slice(0, 10), q, isFinite(dtc) && dtc < 999 ? dtc : (adv > 0 ? q / adv : null)]); }
        if (a.length < 5000) break; off += 5000; if (off >= 200000) { okm = false; note = 'FINRA paging did not end for ' + m; break; } await sleep(200); }
      if (!okm) { rows = null; } else if (!cur && rows.length) W(cf, rows); }
    if (rows && rows.length) { ok++; for (const [s, d, q, dtc] of rows) { (SI.get(s) || SI.set(s, []).get(s)).push([d, q, dtc]); } } }
  for (const a of SI.values()) a.sort((x, y) => x[0] < y[0] ? -1 : 1);
  STATUS.si = { ok: ok >= months.length * 0.8, months: months.length, withData: ok, tried, note }; log('short interest: ' + ok + '/' + months.length + ' months' + (note ? ' (' + note + ')' : '')); }
// the latest short-interest report known on day d (published ~ settlement + 14 calendar days); back = 0 latest, 2 = two reports earlier
const siKnown = (sym, d, back = 0) => { const a = SI.get(sym); if (!a) return null; const lim = iso(Date.parse(d + 'T00:00:00Z') - 14 * 864e5); let k = -1; for (let j = 0; j < a.length; j++) if (a[j][0] <= lim) k = j; k -= back; return k >= 0 ? { d: a[k][0], q: a[k][1], dtc: a[k][2] } : null; };

// ---- 2g. 13F data sets -> best ideas per report period (+ CUSIP -> ticker via Massive) ----
const B13 = []; { const sets = []; for (const y of [2021, 2022, 2023]) for (let q = 1; q <= 4; q++) { if (y === 2021 && q < 4) continue; const pe = q === 1 ? (y - 1) + '-12-31' : y + ['', '', '-03-31', '-06-30', '-09-30'][q]; sets.push({ name: y + 'q' + q + '_form13f.zip', period: pe }); }
  const mon = [['01jan2024-29feb2024', '2023-12-31'], ['01mar2024-31may2024', '2024-03-31'], ['01jun2024-31aug2024', '2024-06-30'], ['01sep2024-30nov2024', '2024-09-30'], ['01dec2024-28feb2025', '2024-12-31'], ['01mar2025-31may2025', '2025-03-31'],
    ['01jun2025-31aug2025', '2025-06-30'], ['01sep2025-30nov2025', '2025-09-30'], ['01dec2025-28feb2026', '2025-12-31'], ['01mar2026-31may2026', '2026-03-31'], ['01jun2026-31aug2026', '2026-06-30'], ['01sep2026-30nov2026', '2026-09-30']];
  for (const [n, p] of mon) sets.push({ name: n + '_form13f.zip', period: p });
  let fail = [], mapCalls = 0; const CU = J(AC + '/cusip.json', {});
  for (const S0 of sets) { const cf = AC + '/13f/' + S0.period + '.json'; let x = J(cf, null); const deadline = iso(Date.parse(S0.period + 'T00:00:00Z') + 45 * 864e5);
    if (deadline > iso(Date.now() - 864e5)) continue;   // filings not complete yet
    if (!x && left() > 70 * 60e3) { const zip = AC + '/13f.zip'; let got = false; for (const p of ['/files/structureddata/data/form-13f-data-sets/', '/files/datastandardsinnovation/data/form-13f-data-sets/']) if (await download(SEC + p + S0.name, zip)) { got = true; break; }
      if (got) { const names = zipNames(zip), nm = (b) => names.find(z => z.toUpperCase().endsWith(b)) || b; const S = tsv(zip, nm('SUBMISSION.TSV'));
        if (S) { const si = (n) => S.H.indexOf(n), keep = new Map();
          for (const r of S.rows) { if (r[si('SUBMISSIONTYPE')] !== '13F-HR') continue; const fd = isoD(r[si('FILING_DATE')]), per = isoD(r[si('PERIODOFREPORT')]); if (per !== S0.period || !fd || fd > deadline) continue;
            const mgr = r[si('CIK')], prev = keep.get(mgr); if (!prev || prev.fd < fd) keep.set(mgr, { acc: r[si('ACCESSION_NUMBER')], fd }); }
          const accMgr = new Map([...keep].map(([m, v]) => [v.acc, { m, mult: v.fd >= '2023-01-03' ? 1 : 1000 }])), pos = new Map();
          const proc = spawn('unzip', ['-p', zip, nm('INFOTABLE.TSV')]); const rl = readline.createInterface({ input: proc.stdout, crlfDelay: Infinity }); let H = null;
          let iA, iT, iP, iC, iV; for await (const line of rl) { const r = line.split('\t'); if (!H) { H = r; [iA, iT, iP, iC, iV] = ['ACCESSION_NUMBER', 'SSHPRNAMTTYPE', 'PUTCALL', 'CUSIP', 'VALUE'].map(n => H.indexOf(n)); continue; } const a = accMgr.get(r[iA]); if (!a) continue;
            if ((r[iT] || '').trim() !== 'SH' || (r[iP] || '').trim()) continue; const cu = (r[iC] || '').trim().toUpperCase(), v = +r[iV] * a.mult; if (!/^[0-9A-Z]{9}$/.test(cu) || !(v > 0)) continue;
            const m = pos.get(a.m) || pos.set(a.m, new Map()).get(a.m); m.set(cu, (m.get(cu) || 0) + v); }
          const bi = bestIdeas([...pos].map(([mgr, p]) => ({ mgr, pos: p }))); x = { period: S0.period, deadline, managers: pos.size, best: [...bi] }; W(cf, x); } }
      try { fs.unlinkSync(zip); } catch (e) {} }
    if (!x) { fail.push(S0.period); continue; }
    // exactly one match is accepted (if the API ignored the CUSIP filter it would return a page of unrelated tickers)
    const one = (j) => j && Array.isArray(j.results) && j.results.length === 1 && j.results[0].ticker ? j.results[0].ticker : null;
    for (const [cu] of x.best) if (!(cu in CU) && mapCalls < 9000 && left() > 50 * 60e3) { mapCalls++; let j = await api('/v3/reference/tickers?cusip=' + cu + '&limit=5'); let s = one(j);
      if (!s && j && !j.refused) { mapCalls++; j = await api('/v3/reference/tickers?cusip=' + cu + '&active=false&limit=5'); s = one(j); } if (j) CU[cu] = s; }
    B13.push({ ...x, syms: x.best.map(([cu, n]) => [CU[cu] ?? undefined, n, cu]) }); }
  W(AC + '/cusip.json', CU); const all = B13.flatMap(b => b.syms), mapped = all.filter(s => s[0] !== undefined).length;
  const cnt = {}; for (const v of Object.values(CU)) if (v) cnt[v] = (cnt[v] || 0) + 1; const top = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0], tickers = Object.values(CU).filter(Boolean).length, sane = !top || top[1] <= Math.max(3, tickers * 0.02);
  STATUS['13f'] = { ok: sane && !fail.length && B13.length >= 15 && mapped >= all.length * 0.9, cusipSanity: sane ? 'ok' : 'one ticker matched ' + top[1] + ' CUSIPs: lookup not trusted', periods: B13.length, missing: fail, bestIdeas: all.length, cusipLooked: mapped, withTicker: all.filter(s => s[0]).length, mapCallsNow: mapCalls };
  log('13F: ' + B13.length + ' periods, ' + all.length + ' best ideas, CUSIPs looked up ' + mapped + ', with ticker ' + STATUS['13f'].withTicker + ', missing ' + (fail.join(' ') || 'none')); }
STATUS.price = { ok: T >= 1000 && spyI !== undefined, sessions: T }; STATUS.calendar = STATUS.price;

// ================= 3. SIGNALS (shared by the 5-year one-shot and the paper lane) =================
// A signal: { t (signal session: everything used is known at its close), i (stock index; -1 = SPY calendar trade), k (entry session,
// bought at its OPEN; calendar: bought at the CLOSE of t), x (exit session, sold at its close) }. k/x may lie beyond T-1 (paper lane).
const H = (id) => ANOMALIES[id].hold;
const sortSig = (id, t, picks) => picks.map(i => ({ t, i, k: t + 1, x: t + H(id) }));
const fCache = new Map();   // per formation: per stock feature rows
function rowsAt(t, f) { const out = []; for (const i of liqList(t)) { const v = f(i); if (v !== null && v !== undefined && isFinite(v)) out.push({ key: i, v }); } return out; }
const S = (i) => ser(C, i), So = (i) => ser(O, i), Sv = (i) => ser(V, i);
// monthly returns per stock (for seasonality): close of the month's last session / previous month's last session - 1
const MEND = []; for (let t = 0; t < T; t++) if (t === T - 1 || D[t + 1].slice(0, 7) !== D[t].slice(0, 7)) MEND.push(t);
const monthlyOf = (i) => { const c = S(i), m = new Map(); for (let j = 1; j < MEND.length; j++) { const a = c[MEND[j - 1]], b = c[MEND[j]]; if (a > 0 && b > 0 && MEND[j] !== T - 1) m.set(D[MEND[j]].slice(0, 7), b / a - 1); } return m; };
const monthlyMemo = new Map(), monthlyM = (i) => monthlyMemo.get(i) || monthlyMemo.set(i, monthlyOf(i)).get(i);
// industry momentum selection at t (also the EIL yardstick)
function indMomPicks(t) { const g = new Map(); for (const i of liqList(t)) { const s2 = sic2(SYMS[i]); const r = mom(S(i), t, 126, 0); if (!s2 || r === null) continue; (g.get(s2) || g.set(s2, []).get(s2)).push([i, r]); }
  const ind = [...g].filter(([, a]) => a.length >= 5).map(([k, a]) => [k, mean(a.map(z => z[1]))]).sort((a, b) => b[1] - a[1]); if (ind.length < 10) return [];
  const top = new Set(ind.slice(0, Math.ceil(ind.length * 0.15)).map(z => z[0])); return [...g].filter(([k]) => top.has(k)).flatMap(([, a]) => a.map(z => z[0])); }
const mom12Picks = (t) => pickFrac(rowsAt(t, i => mom(S(i), t, 252, 21)), 0.1, 'top');
// emerging industry leadership at t
const eilMemo = new Map(); function eilPicks(t) { if (eilMemo.has(t)) return eilMemo.get(t); const r = eilPicks0(t); eilMemo.set(t, r); return r; }
function eilPicks0(t) { if (t < 260) return []; const g = new Map(); for (const i of liqList(t)) { const s2 = sic2(SYMS[i]); if (s2) (g.get(s2) || g.set(s2, []).get(s2)).push(i); }
  const above50 = (c, u) => { let s = 0; for (let k = u - 49; k <= u; k++) { if (!(c[k] > 0)) return null; s += c[k]; } return c[u] > s / 50; };
  const nh20 = (c, u) => { let m = -Infinity; for (let k = u - 19; k <= u; k++) { if (!(c[k] > 0)) return null; m = Math.max(m, c[k]); } return c[u] >= m; };
  const out = []; for (const [, mem] of g) { if (mem.length < EIL.minMembers) continue; const br = (u) => { const v = mem.map(i => above50(S(i), u)).filter(x => x !== null); return v.length >= EIL.minMembers ? v.filter(Boolean).length / v.length : null; };
    const nh = (u) => { const v = mem.map(i => nh20(S(i), u)).filter(x => x !== null); return v.length >= EIL.minMembers ? v.filter(Boolean).length / v.length : null; };
    if (!eilIndustryOk(br(t), br(t - EIL.look), nh(t), nh(t - EIL.look))) continue;
    const rk = (u) => pctRanks(mem.map(i => ({ key: i, v: mom(S(i), u, EIL.rsLen, 0) }))), a = rk(t), b = rk(t - EIL.look);
    for (const i of mem) if (eilStockOk(a.get(i), b.get(i))) out.push(i); }
  return out; }
// accounting numbers of a stock at formation t (point in time: filings before D[t])
const firstOf = (m, f) => { for (const facts of Object.values(m || {})) { const r = f(facts); if (r !== null && r !== undefined) return r; } return null; };
const ageOk = (end, d) => end && (Date.parse(d) - Date.parse(end)) / 864e5 <= 200;
function instBefore(facts, asOf, maxEnd) { let best = null, bf = null; for (const x of facts || []) { if (!(x.f < asOf) || x.e > maxEnd || x.s) continue; if (!best || x.e > best.e || (x.e === best.e && x.f >= bf)) { best = x; bf = x.f; } } return best ? { end: best.e, val: best.v } : null; }
const fundMemo = new Map();
function fundOf(i, t) { const key = i * 4096 + t; if (fundMemo.has(key)) return fundMemo.get(key); const s = SYMS[i], co = coOf(s), d = D[t]; let o = null;
  if (co) { const ttm = (g, maxEnd) => firstOf(co[g], f => { const r = ttmAt(f, d, maxEnd); return r && (maxEnd || ageOk(r.end, d)) ? r : null; }), inst = (g) => firstOf(co[g], f => { const r = instantAt(f, d); return r && ageOk(r.end, d) ? r : null; });
    const A = inst('assets'), rev = ttm('rev'), cogs = ttm('cogs'), gp0 = ttm('gp'), gp = gp0 ? gp0 : rev && cogs && rev.end === cogs.end ? { end: rev.end, val: rev.val - cogs.val } : null;
    const ni = ttm('ni'), cfo = ttm('cfo'), L = inst('liab'), sga = ttm('sga'), rd = ttm('rd'), cap = ttm('capex'), bb = ttm('bb');
    const A1 = A ? firstOf(co.assets, f => { const r = instBefore(f, d, iso(Date.parse(A.end) - 330 * 864e5)); return r && (Date.parse(A.end) - Date.parse(r.end)) / 864e5 <= 400 ? r : null; }) : null;
    const yAgo = (g, cur) => cur ? firstOf(co[g], f => { const b = ttmAt(f, d, iso(Date.parse(shiftYear(cur.end)) + 10 * 864e5)); return b && Math.abs(Date.parse(b.end) - Date.parse(shiftYear(cur.end))) <= 15 * 864e5 ? b : null; }) : null;
    const gpY = gp0 ? yAgo('gp', gp) : (() => { const r1 = yAgo('rev', rev), c1 = yAgo('cogs', cogs); return r1 && c1 ? { end: r1.end, val: r1.val - c1.val } : null; })(), niY = yAgo('ni', ni);
    const capRatio = (k) => { if (!cap || !rev) return null; if (k === 0) return rev.val > 0 ? cap.val / rev.val : null; const lim = iso(Date.parse(shiftYear(cap.end, -k)) + 10 * 864e5), a = firstOf(co.capex, f => ttmAt(f, d, lim)), b = firstOf(co.rev, f => ttmAt(f, d, lim));
      return a && b && b.val > 0 && Math.abs(Date.parse(a.end) - Date.parse(shiftYear(cap.end, -k))) <= 15 * 864e5 && a.end === b.end ? a.val / b.val : null; };
    const cik = symCik(s), sh = cik ? sharesKnown(cik, d) : null, mv = sh > 0 && C[i * T + t] > 0 ? sh * C[i * T + t] : null;
    const Av = A && A.val > 0 ? A.val : null, avgA = Av && A1 && A1.val > 0 ? (Av + A1.val) / 2 : null;
    o = { gpa: gp && Av ? gp.val / Av : null, cfoa: cfo && Av ? cfo.val / Av : null, roa: ni && Av ? ni.val / Av : null, gm: gp && rev && rev.val > 0 ? gp.val / rev.val : null,
      ag: Av && A1 && A1.val > 0 ? Av / A1.val - 1 : null, acc: ni && cfo && avgA && ni.end === cfo.end ? (ni.val - cfo.val) / avgA : null, lev: L && Av && L.end === A.end ? L.val / Av : null,
      dgpa: gp && gpY && Av && A1 && A1.val > 0 ? gp.val / Av - gpY.val / A1.val : null, droa: ni && niY && Av && A1 && A1.val > 0 ? ni.val / Av - niY.val / A1.val : null,
      rdmv: rd && rd.val > 0 && mv ? rd.val / mv : null, ol: Av && (cogs || sga) ? ((cogs ? cogs.val : 0) + (sga ? sga.val : 0)) / Av : null,
      bby: bb && bb.val > 0 && mv ? bb.val / mv : null, capex: (() => { const now = capRatio(0), p = [1, 2, 3].map(capRatio); return now !== null && p.every(x => x !== null) && mean(p) > 0 ? now / mean(p) - 1 : null; })() }; }
  fundMemo.set(key, o); return o; }
const nsiOf = (i, t) => { if (t < 252) return null; const cik = symCik(SYMS[i]); if (!cik) return null; const a = sharesKnown(cik, D[t]), b = sharesKnown(cik, D[t - 252]); return a > 0 && b > 0 ? a / b - 1 : null; };
function qmjPicks(t) { const rows = []; for (const i of liqList(t)) { if (finCo(SYMS[i])) continue; const f = fundOf(i, t); if (!f) continue; rows.push({ i, f, beta: fpBeta(S(i), MKT, t), vol: volatility(S(i), t, 252) }); }
  const rk = (get) => pctRanks(rows.map(r => ({ key: r.i, v: get(r) }))), avgR = (maps, i, min) => { const v = maps.map(m => m.get(i)).filter(x => x !== undefined); return v.length >= min ? mean(v) : null; };
  const P1 = [rk(r => r.f.gpa), rk(r => r.f.roa), rk(r => r.f.cfoa), rk(r => r.f.gm), rk(r => r.f.acc === null ? null : -r.f.acc)], G1 = [rk(r => r.f.dgpa), rk(r => r.f.droa)], S1 = [rk(r => r.beta === null ? null : -r.beta), rk(r => r.vol === null ? null : -r.vol), rk(r => r.f.lev === null ? null : -r.f.lev)];
  return pickFrac(rows.map(r => { const p = avgR(P1, r.i, 3), g = avgR(G1, r.i, 1), s = avgR(S1, r.i, 2); return { key: r.i, v: p !== null && g !== null && s !== null ? (p + g + s) / 3 : null }; }), 0.1, 'top'); }
const fundSort = (t, get, dir, nonFin = true) => pickFrac(rowsAt(t, i => { if (nonFin && finCo(SYMS[i])) return null; const f = fundOf(i, t); return f ? get(f) : null; }), 0.1, dir);
// ---- monthly / weekly sort definitions ----
const SORTS = {
  'ANOM-MOM12': (t) => t >= 252 ? mom12Picks(t) : [],
  'ANOM-52WH': (t) => pickFrac(rowsAt(t, i => high52(S(i), t)), 0.1, 'top'),
  'ANOM-RESMOM': (t) => t >= 252 && MKT ? pickFrac(rowsAt(t, i => residMom(S(i), MKT, t)), 0.1, 'top') : [],
  'ANOM-INDMOM': (t) => t >= 126 ? indMomPicks(t) : [],
  'ANOM-TSMOM': (t) => t >= 252 ? rowsAt(t, i => mom(S(i), t, 252, 21)).filter(r => r.v > 0).map(r => r.key) : [],
  'ANOM-LOWVOL': (t) => pickFrac(rowsAt(t, i => volatility(S(i), t, 252)), 0.1, 'bottom'),
  'ANOM-LOWBETA': (t) => MKT ? pickFrac(rowsAt(t, i => fpBeta(S(i), MKT, t)), 0.1, 'bottom') : [],
  'ANOM-LOWMAX': (t) => pickFrac(rowsAt(t, i => maxRet(S(i), t, 21)), 0.1, 'bottom'),
  'ANOM-LOWIVOL': (t) => MKT ? pickFrac(rowsAt(t, i => ivol(S(i), MKT, t, 21)), 0.1, 'bottom') : [],
  'ANOM-SEASON': (t) => pickFrac(rowsAt(t, i => seasonal(monthlyM(i), D[t].slice(0, 7))), 0.1, 'top'),
  'ANOM-OVNMOM': (t) => pickFrac(rowsAt(t, i => logSum(So(i), S(i), t - 251, t, 'night')), 0.1, 'top'),
  'ANOM-DAYMOM12': (t) => pickFrac(rowsAt(t, i => logSum(So(i), S(i), t - 251, t - 21, 'day')), 0.1, 'top'),
  'ANOM-DAYMOM1': (t) => pickFrac(rowsAt(t, i => logSum(So(i), S(i), t - 20, t, 'day')), 0.1, 'top'),
  'ANOM-DAYREV1': (t) => pickFrac(rowsAt(t, i => logSum(So(i), S(i), t - 20, t, 'day')), 0.1, 'bottom'),
  'ANOM-DAYNIGHT': (t) => { const d = new Set(pickFrac(rowsAt(t, i => logSum(So(i), S(i), t - 251, t - 21, 'day')), 0.3, 'top')), n = pickFrac(rowsAt(t, i => logSum(So(i), S(i), t - 251, t - 21, 'night')), 0.3, 'bottom'); return n.filter(i => d.has(i)); },
  'ANOM-GP': (t) => fundSort(t, f => f.gpa, 'top'), 'ANOM-CFOA': (t) => fundSort(t, f => f.cfoa, 'top'), 'ANOM-AG': (t) => fundSort(t, f => f.ag, 'bottom'), 'ANOM-ACC': (t) => fundSort(t, f => f.acc, 'bottom'),
  'ANOM-QMJ': (t) => t >= 252 ? qmjPicks(t) : [], 'ANOM-RD': (t) => fundSort(t, f => f.rdmv, 'top'), 'ANOM-OL': (t) => fundSort(t, f => f.ol, 'top'), 'ANOM-CAPEX': (t) => fundSort(t, f => f.capex, 'bottom'),
  'ANOM-NSI': (t) => pickFrac(rowsAt(t, i => nsiOf(i, t)), 0.1, 'bottom'), 'ANOM-BBY': (t) => fundSort(t, f => f.bby, 'top', false),
  'ANOM-SILOW': (t) => pickFrac(rowsAt(t, i => { const s = siKnown(SYMS[i], D[t]), cik = symCik(SYMS[i]), sh = cik ? sharesKnown(cik, D[t]) : null; return s && sh > 0 ? s.q / sh : null; }), 0.1, 'bottom'),
  'ANOM-DTCLOW': (t) => pickFrac(rowsAt(t, i => { const s = siKnown(SYMS[i], D[t]); return s && s.dtc !== null ? s.dtc : null; }), 0.1, 'bottom'),
  'ANOM-SIDROP': (t) => pickFrac(rowsAt(t, i => { const a = siKnown(SYMS[i], D[t]), b = siKnown(SYMS[i], D[t], 2), cik = symCik(SYMS[i]), sh = cik ? sharesKnown(cik, D[t]) : null; return a && b && sh > 0 && b.q / sh >= 0.02 && b.q > 0 ? -(a.q / b.q - 1) : null; }), 0.1, 'top'),
};
const WEEKLY = new Set(['ANOM-HVP', 'ANOM-EIL20', 'ANOM-EIL60']);
const ONE_OPEN = new Set(['ANOM-HVP', 'ANOM-EIL20', 'ANOM-EIL60', 'ANOM-SUE', 'ANOM-EAR', 'ANOM-SUESURGE', 'ANOM-EAP', 'ANOM-INSIDER', 'ANOM-13D', 'ANOM-SPIN', 'ANOM-DIVINIT']);
// ---- event lists (computed once; filtered by signal session) ----
const firstAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo; };   // first session strictly after date d (T if none yet)
const EVENTS = {}; const evPush = (id, e) => (EVENTS[id] = EVENTS[id] || []).push(e);
// earnings
{ const reps = REPORTS.filter(r => SY.has(r.sym) && r.e !== null).map(r => ({ ...r, i: SY.get(r.sym), r: reactionIdx(D, r.d, r.time) })).filter(r => r.r > 0).sort((a, b) => a.r - b.r);
  const fut = REPORTS.filter(r => SY.has(r.sym) && r.e !== null && r.d > D[T - 1]);   // upcoming (paper lane, EAP only)
  // EAP: buy the open of r-5, sell the close of r; signal at r-6 (date already on the calendar)
  for (const r of reps) if (r.r - 6 >= 1 && LIQ[r.i * T + r.r - 6]) evPush('ANOM-EAP', { t: r.r - 6, i: r.i, k: r.r - 5, x: r.r });
  // upcoming report whose reaction session is the 6th session from now: buy the next open (the paper lane only)
  for (const r of fut) { const i = SY.get(r.sym); let d = D[T - 1], rd = null; for (let n = 1; n <= 8; n++) { d = nextSession(d); if ((r.time === 'bmo' && d >= r.d) || (r.time !== 'bmo' && d > r.d)) { rd = n; break; } }
    if (rd === 6 && LIQ[i * T + T - 1]) evPush('ANOM-EAP', { t: T - 1, i, k: T, x: T + 5, future: true }); }
  const sueH = [], earH = [], surH = []; let surgeDiag = { reports: 0, withSurge: 0 };
  const mktCC = (a, b) => { const v = []; for (const i of liqList(a)) { if (i % 2) continue; const x = C[i * T + a], y = closeAt(i, b, a); if (x > 0 && y > 0) v.push(y / x - 1); } return v.length >= 50 ? mean(v) : null; }, mccMemo = new Map();
  for (const r of reps) { const i = r.i, p = C[i * T + r.r - 1]; if (!(p > 0) || !LIQ[i * T + r.r - 1] || r.a === null) continue; const s = (r.a - r.e) / p; if (!isFinite(s) || Math.abs(s) > 1) continue;
    while (sueH.length && sueH[0][0] < r.r - 63) sueH.shift(); const q90 = quantile(sueH.map(z => z[1]), 0.9), q70 = quantile(sueH.map(z => z[1]), 0.7);
    if (q90 !== null && s >= q90 && r.r + 1 < T + 1) evPush('ANOM-SUE', { t: r.r, i, k: r.r + 1, x: r.r + 60 });
    // EAR: close r-2 -> close r+1 minus the average liquid stock's
    if (r.r + 1 < T && r.r - 2 >= 0) { const a = C[i * T + r.r - 2], b = closeAt(i, r.r + 1, r.r - 1), mk = mccMemo.has(r.r) ? mccMemo.get(r.r) : mccMemo.set(r.r, mktCC(r.r - 2, r.r + 1)).get(r.r);
      if (a > 0 && b > 0 && mk !== null) { const ear = b / a - 1 - mk; while (earH.length && earH[0][0] < r.r + 1 - 63) earH.shift(); const e90 = quantile(earH.map(z => z[1]), 0.9); if (e90 !== null && ear >= e90) evPush('ANOM-EAR', { t: r.r + 1, i, k: r.r + 2, x: r.r + 61 }); earH.push([r.r + 1, ear]); } }
    // SUE + SURGE (revenue from the SEC filing for the quarter just reported, filed within 10 sessions of r)
    const co = coOf(r.sym); if (co) { surgeDiag.reports++; const sg = surgeAt(co, r.d, r.r); while (surH.length && surH[0][0] < r.r - 63) surH.shift();
      if (sg) { surgeDiag.withSurge++; const g70 = quantile(surH.map(z => z[1]), 0.7); if (q70 !== null && g70 !== null && s >= q70 && sg.v >= g70) { const k = Math.max(r.r + 1, sg.k); evPush('ANOM-SUESURGE', { t: k - 1, i, k, x: k + 59 }); } surH.push([r.r, sg.v]); } }
    sueH.push([r.r, s]); }
  STATUS.earn.surge = surgeDiag; }
// one quarter's value; a 4th quarter without a 9-month YTD figure = the full year minus the three quarters before it
function qAt(facts, asOf, end) { const v = quarterAt(facts, asOf, end); if (v !== null) return v; const fy = facts.filter(x => x.f < asOf && x.s && Math.abs(Date.parse(x.e) - Date.parse(end)) <= 5 * 864e5 && (Date.parse(x.e) - Date.parse(x.s)) / 864e5 >= 350 && (Date.parse(x.e) - Date.parse(x.s)) / 864e5 <= 380).sort((a, b) => a.f < b.f ? -1 : 1).pop();
  if (!fy) return null; let sum = 0; for (const k of [1, 2, 3]) { const e = facts.filter(x => x.f < asOf && Math.abs(Date.parse(x.e) - (Date.parse(end) - k * 91.3 * 864e5)) <= 7 * 864e5).map(x => x.e)[0]; const q = e ? quarterAt(facts, asOf, e) : null; if (q === null) return null; sum += q; } return fy.v - sum; }
function surgeAt(co, repDate, r) { for (const facts of Object.values(co.rev || {})) { const lo = iso(Date.parse(repDate + 'T00:00:00Z') - 120 * 864e5), cand = facts.filter(x => x.f >= iso(Date.parse(repDate + 'T00:00:00Z') - 3 * 864e5) && x.e >= lo && x.e <= repDate && x.s).sort((a, b) => a.f < b.f ? -1 : 1);
    if (!cand.length) continue; const f = cand[0].f, k = firstAfter(f); if (k - r > 10 || k >= T + 30) continue; const asOf = iso(Date.parse(f + 'T00:00:00Z') + 864e5), E = cand[0].e, ends = [E];
    while (ends.length < 13) { const last = ends[ends.length - 1], prevs = facts.filter(x => x.f < asOf).map(x => x.e).filter(e => { const dd = (Date.parse(last) - Date.parse(e)) / 864e5; return dd >= 80 && dd <= 100; }).sort(); if (!prevs.length) break; ends.push(prevs[prevs.length - 1]); }
    const revs = ends.reverse().map(e => qAt(facts, asOf, e)), v = surge(revs.map(x => x === null ? NaN : x)); if (v !== null && isFinite(v)) return { v, k }; }
  return null; }
// insiders: opportunistic purchases
{ const seen = new Set(); for (const [sym, fd, who, usdv, td] of INS.buys) { const i = SY.get(sym); if (i === undefined || fd < D[0]) continue; const ty = insiderType(INS.months.get(who) || new Set(), +td.slice(0, 4)); if (ty !== 'opportunistic') continue;
    const k = firstAfter(fd), key = sym + fd; if (seen.has(key)) continue; seen.add(key); if (k < 2 || (k < T && !LIQ[i * T + k - 1]) || (k >= T && !LIQ[i * T + T - 1])) continue; evPush('ANOM-INSIDER', { t: k - 1, i, k, x: k + 20, late: true }); } }
// 13D and spin-offs from the EDGAR index
{ const files = byFiling(EDG); for (const f of files) { const syms = f.ciks.flatMap(c => (cikSyms.get(c) || []).filter(s => SY.has(s)).slice(0, 1));
    if (f.form !== '10-12B') { if (syms.length !== 1) continue; const i = SY.get(syms[0]), k = firstAfter(f.date); if (k < 2 || f.date < D[0]) continue; if ((k < T && !LIQ[i * T + k - 1]) || (k >= T && !LIQ[i * T + T - 1])) continue; evPush('ANOM-13D', { t: k - 1, i, k, x: k + 62, late: true }); continue; }
    for (const s of syms) { const i = SY.get(s); let f0 = -1; for (let t = 0; t < T; t++) if (C[i * T + t] > 0 || CX[i * T + t] > 0) { f0 = t; break; } if (f0 <= 5 || D[f0] < f.date || (Date.parse(D[f0]) - Date.parse(f.date)) / 864e5 > 400) continue;
      if (!(C[i * T + f0] >= 5 && C[i * T + f0] * V[i * T + f0] >= 5e6)) continue; evPush('ANOM-SPIN', { t: f0, i, k: f0 + 1, x: f0 + 126 }); } } }
// dividend initiations
{ for (const e of divInitiations(DIVS, '2021-01-01')) { const i = SY.get(e.sym); if (i === undefined) continue; const k = firstAfter(e.d); if (k < 253) continue; let f0 = -1; for (let t = 0; t < T; t++) if (C[i * T + t] > 0) { f0 = t; break; } if (f0 < 0 || f0 > k - 252) continue;
    if ((k < T && !LIQ[i * T + k - 1]) || (k >= T && !LIQ[i * T + T - 1])) continue; evPush('ANOM-DIVINIT', { t: k - 1, i, k, x: k + 125 }); } }
// 13F best ideas: formation = first session after the 45-day deadline
const F13 = new Map(); for (const b of B13) { const t = firstAfter(b.deadline) - 1; if (t < 1) continue; F13.set(t, b.syms.filter(([s]) => s && SY.has(s)).map(([s]) => SY.get(s)).filter(i => LIQ[i * T + Math.min(t, T - 1)])); }
// calendar trades on SPY (close to close)
const CAL = { 'ANOM-TOM': tomWindows(D).map(w => ({ t: w.buy, i: -1, k: w.buy, x: w.sell })), 'ANOM-PREHOL': [] };
for (let t = 1; t + 1 < T; t++) if (D[t + 1] > (() => { let x = Date.parse(D[t] + 'T00:00:00Z') + 864e5; while ([0, 6].includes(new Date(x).getUTCDay())) x += 864e5; return iso(x); })()) CAL['ANOM-PREHOL'].push({ t: t - 1, i: -1, k: t - 1, x: t });
// all signals of one anomaly with signal session in [a, b]
function signalsOf(id, a, b) { const fam = ANOMALIES[id].family;
  if (fam === 'calendar') return CAL[id].filter(z => z.t >= a && z.t <= b);
  if (SORTS[id]) return FORM_M.filter(t => t >= a && t <= b && t >= 21).flatMap(t => sortSig(id, t, SORTS[id](t)));
  if (id === 'ANOM-HVP') return FORM_W.filter(t => t >= Math.max(a, 50) && t <= b).flatMap(t => liqList(t).filter(i => hvpWeek(Sv(i), t)).map(i => ({ t, i, k: t + 1, x: t + H(id) })));
  if (id === 'ANOM-EIL20' || id === 'ANOM-EIL60') return FORM_W.filter(t => t >= a && t <= b).flatMap(t => eilPicks(t).map(i => ({ t, i, k: t + 1, x: t + H(id) })));
  if (id === 'ANOM-13FBEST') return [...F13].filter(([t]) => t >= a && t <= b).flatMap(([t, a2]) => sortSig(id, t, a2));
  return (EVENTS[id] || []).filter(z => z.t >= a && z.t <= b); }
const familyOk = (id) => { const f = ANOMALIES[id].family; return !!(STATUS[f] && STATUS[f].ok); };
const familyNote = (id) => { const f = ANOMALIES[id].family, s = STATUS[f] || {}; return f + ' data: ' + JSON.stringify(s).slice(0, 300); };

// ================= 4. 5-YEAR ONE-SHOT =================
const need = IDS.filter(id => !FROZEN[id]);
log('5-year one-shot for ' + need.length + ' anomalies not yet frozen' + (env.HISTORY ? ' (+ monitoring of all)' : ''));
const RES = {}, SAMEDATE = {};
const calCtrl = new Map(); const calAvg = (len, half) => { const key = len + half; if (calCtrl.has(key)) return calCtrl.get(key); const v = []; for (let u = 0; u + len < T; u++) if (halfOf(D[u]) === half && MKT[u] > 0 && MKT[u + len] > 0) v.push(MKT[u + len] / MKT[u] - 1); const m = v.length ? mean(v) : null; calCtrl.set(key, m); return m; };
function tradesOf(id, sigs) { const hold = H(id), out = [], busyUntil = new Map(), spans = new Map();
  for (const z of sigs.sort((p, q) => p.t - q.t || p.i - q.i)) { if (z.x >= T || z.future) continue;
    if (z.i < 0) { const a = MKT[z.k], b = MKT[z.x]; if (!(a > 0 && b > 0)) continue; const h = halfOf(D[z.t]), c = calAvg(z.x - z.k, h); out.push({ t: z.t, s: 'SPY', i: -1, k: z.k, x: z.x, g: b / a - 1, c, own: c, half: h }); continue; }
    if (ONE_OPEN.has(id) && (busyUntil.get(z.i) ?? -1) >= z.k) continue; const g = ret(z.i, z.k, z.x); if (g === null || !isFinite(g)) continue; const c = ctrlSpan(z.k, z.x); if (c === null) continue;
    busyUntil.set(z.i, z.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, z.x]); out.push({ t: z.t, s: SYMS[z.i], i: z.i, k: z.k, x: z.x, g, c, half: halfOf(D[z.t]) }); }
  const ownMemo = new Map();
  for (const z of out) { if (z.i < 0) continue; const len = z.x - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 253, to: T - 1, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  return out; }
const avgNet = (tr) => tr.length ? mean(tr.map(z => z.g - COST)) : null;
for (const id of [...new Set([...need, ...(env.HISTORY ? IDS : [])])]) { if (left() < 8 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  if (!familyOk(id)) { RES[id] = { verdict: 'NOT RUN', why: 'data not available this run: ' + familyNote(id) }; log('- ' + id + ': NOT RUN (' + ANOMALIES[id].family + ' data)'); continue; }
  const sigs = signalsOf(id, 0, T - 1), tr = tradesOf(id, sigs), hold = H(id);
  const R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) }, extra = [], info = {};
  if (id === 'ANOM-EIL20' || id === 'ANOM-EIL60') { const days = [...new Set(tr.map(z => z.t))];
    const mt = tradesOf('ANOM-TSMOM', days.flatMap(t => mom12Picks(t).map(i => ({ t, i, k: t + 1, x: t + hold })))), it = tradesOf('ANOM-TSMOM', days.flatMap(t => indMomPicks(t).map(i => ({ t, i, k: t + 1, x: t + hold }))));
    for (const h of ['older', 'newer']) { const a = avgNet(tr.filter(z => z.half === h)), b = avgNet(mt.filter(z => z.half === h)), c = avgNet(it.filter(z => z.half === h)); info[h] = { rule: r4(a), plainMomentum: r4(b), plainIndustryMomentum: r4(c), momTrades: mt.filter(z => z.half === h).length, indTrades: it.filter(z => z.half === h).length };
      if (!(a > b)) extra.push('not better than plain 12-1 momentum on the same dates in the ' + h + ' half (' + pc(a) + ' vs ' + pc(b) + ' after cost)'); if (!(a > c)) extra.push('not better than plain industry momentum on the same dates in the ' + h + ' half (' + pc(a) + ' vs ' + pc(c) + ' after cost)'); }
    SAMEDATE[id] = info; }
  if (ANOMALIES[id].family === 'calendar') { info.atEtfCost = { note: 'information only: the same trades at 0.1% round trip (an ETF trade), NOT the system standard', older: r4(mean(tr.filter(z => z.half === 'older').map(z => z.g - 0.001)) ?? NaN), newer: r4(mean(tr.filter(z => z.half === 'newer').map(z => z.g - 0.001)) ?? NaN) }; }
  RES[id] = { ...judge(R, { bar: BAR, extra }), results: R, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), info, hold, family: ANOMALIES[id].family, split: SPLIT, cost: COST,
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + RES[id].why.slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);

// ================= 5. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const scanned = new Set(lines.filter(x => x.type === 'day').map(x => x.d)), sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id));
const toScan = []; for (let t = 0; t < T; t++) if (D[t] >= START && !scanned.has(D[t])) toScan.push(t);
const newLines = [], openBy = new Map(), sigIds = new Set(sigLines.map(x => x.id));   // id|sym -> exit date of an open paper trade
const entryIdx = (x) => x.entryDate ? tOf.get(x.entryDate) : undefined;
for (const x of sigLines) if (!resolved.has(x.id)) openBy.set(x.m + '|' + x.sym, true);
const fromT = D.findIndex(d => d >= START);
if (fromT >= 0) { const a = fromT, b = T - 1, lastT = T - 1;   // every session from the start each run: lagged sources (insider, 13F) add late signals; ids dedupe
  // calendar rules: planned the evening before, from the NYSE calendar (buy at the close of the next session)
  { const nwd = (d) => { let x = Date.parse(d + 'T00:00:00Z') + 864e5; while ([0, 6].includes(new Date(x).getUTCDay())) x += 864e5; return iso(x); };
    const b0 = nextSession(D[lastT]), s1 = nextSession(b0), s2 = nextSession(s1), plan = { 'ANOM-TOM': s1.slice(0, 7) === b0.slice(0, 7) && s2.slice(0, 7) !== s1.slice(0, 7), 'ANOM-PREHOL': nextSession(s1) > nwd(s1) };
    for (const id of ['ANOM-TOM', 'ANOM-PREHOL']) { if (!plan[id] || !toScan.includes(lastT)) continue; const line = { type: 'signal', id: id + '|SPY|' + D[lastT], m: id, sym: 'SPY', d: D[lastT], close: r4(MKT[lastT]), halal: 'SPY (use SPUS/HLAL)', hold: H(id) + 1,
        plan: 'buy at the close of ' + b0 + ', sell at the close ' + H(id) + ' session(s) later', entryDate: b0, late: false, recordedAfter: D[lastT] };
      if (!sigIds.has(line.id)) { sigIds.add(line.id); newLines.push(line); sigLines.push(line); } } }
  for (const id of IDS) { if (!familyOk(id) || ANOMALIES[id].family === 'calendar') continue; let sigs; try { sigs = signalsOf(id, a, b); } catch (e) { log('paper ' + id + ': ' + e.message); continue; }
    for (const z of sigs) { if (z.future && z.t !== lastT) continue;
      const sym = z.i < 0 ? 'SPY' : SYMS[z.i], key = id + '|' + sym; if (ONE_OPEN.has(id) && openBy.get(key)) continue;
      // the entry the owner can actually take: the rule's entry if it is still ahead of the newest close, else the next open after it (late)
      const ruleK = z.k, late = ruleK <= lastT, cal = false;
      let entryDate = null, d = D[lastT]; if (!late) { for (let q = lastT; q < ruleK; q++) d = nextSession(d); entryDate = d; }
      const line = { type: 'signal', id: id + '|' + sym + '|' + D[z.t], m: id, sym, d: D[z.t], close: r4(z.i < 0 ? MKT[z.t] : C[z.i * T + z.t]), halal: z.i < 0 ? 'SPY (use SPUS/HLAL)' : halal(sym), hold: z.x - z.k + 1,
        plan: cal ? 'buy at the close of ' + D[ruleK] + ', sell at the close ' + (z.x - z.k) + ' session(s) later' : late ? 'LATE (data arrived after the rule\'s entry): buy at the next open after ' + D[lastT] + ', hold ' + (z.x - z.k + 1) + ' sessions' : 'buy at the open of ' + entryDate + ', hold ' + (z.x - z.k + 1) + ' sessions', entryDate: late ? null : entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
  for (const t of toScan) newLines.push({ type: 'day', d: D[t] }); }
// resolve: late signals take the first session after recordedAfter
const board = {}, today = {};
for (const x of sigLines) { let k = x.entryDate ? tOf.get(x.entryDate) : x.late ? firstAfter(x.recordedAfter) : undefined; if (k === undefined || k >= T) { x._state = 'waiting'; continue; } const xi = k + x.hold - 1, cal = x.sym === 'SPY' && ANOMALIES[x.m] && ANOMALIES[x.m].family === 'calendar';
  if (xi > T - 1) { x._state = 'open'; x._k = k; x._mark = cal ? (MKT[T - 1] / MKT[k] - 1) : ret(SY.get(x.sym), k, T - 1); continue; }
  const g = cal ? MKT[xi] / MKT[k] - 1 : ret(SY.get(x.sym), k, xi), c = cal ? null : ctrlSpan(k, xi); x._state = 'closed'; x._g = g; x._c = c; x._k = k; x._x = xi;
  if (!resolved.has(x.id) && g !== null) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[xi], g: r4(g), net: r4(g - COST), avgStock: c === null ? null : r4(c - COST) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
for (const id of IDS) { const mine = sigLines.filter(x => x.m === id), closed = mine.filter(x => x._state === 'closed' && x._g !== null).map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c, halal: x.halal })), fr = firstRun[id], st = boardStats(closed);
  board[id] = { name: ANOMALIES[id].name, hold: H(id), family: ANOMALIES[id].family, dataOk: familyOk(id), signals: mine.length, waiting: mine.filter(x => x._state === 'waiting').length, open: mine.filter(x => x._state === 'open').length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: paperReady(st),
    fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  const lastD = D[T - 1]; today[id] = { name: ANOMALIES[id].name, hold: H(id), tier: fr ? fr.verdict : null, newSignals: mine.filter(x => x.recordedAfter === lastD && newLines.includes(x)).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, buy: D[x._k], sinceBuy: r4(x._mark ?? NaN), exitAfter: x.hold + ' sessions' })) }; }
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, note: 'PAPER ONLY. Published anomalies recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a TRADABLE SMALL / PROVEN frozen 5-year verdict (data/anomaly-lab.json firstRun) or 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: scanned ' + toScan.length + ' new session(s); ' + newLines.filter(x => x.type === 'signal').length + ' new signals; ' + sigLines.length + ' in all');

// ================= 6. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'anomaly-core.mjs header + ANOMALIES (23 Oct 2026, before any run) + data/strategy-library.json ANOM-*', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS,
  standard: 'both halves (formation before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock over the same entry-to-exit sessions (calendar rules: SPY over all same-length windows), better than the same stock on its other days, > 0 without the 2 best, block t >= ' + TIER2_T + ' -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN',
  needsData: Object.fromEntries(Object.entries(NEEDS_DATA).map(([k, v]) => [k, { name: v.name, why: v.why }])), sameDateComparisons: SAMEDATE,
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-300)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'anomaly-lab.mjs -> data/anomaly-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: [R.older.win, R.newer.win], why: r.why }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('anomaly-lab: library not updated: ' + e.message); }
console.log('ANOMALY LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + Object.entries(STATUS).map(([k, s]) => k + (s.ok ? ' ok' : ' MISSING')).join(', '));
