// TIPSTER LAB (24 Oct 2026; owner: "my tipster told me to buy NVIDIA at about 90 USD, buy and forget, it will come up, and to add more
// every now and then; and Intel, now up over 100%. How did he figure it out? Decode this style and test it"). Research + a FORWARD PAPER
// lane; never places an order; no Telegram. Rules: tipster-core.mjs (TIP-*, pre-registered 24 Oct 2026 before any run; the lab writes
// the same rule text into data/strategy-library.json before computing anything).
// 1. DATA (GitHub Actions only; keys only from secrets, never printed):
//    prices  = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY; dead stocks' later prices
//              in its x rows) + the sessions since (Massive grouped daily) + splits since the cache day; and the ~3 years BEFORE the cache
//              window from Massive grouped daily bars (adjusted; own cache tipster-cache/pre.json.gz) so 52-week highs, 12-month returns and
//              3-year lows exist from the first window day. SPUS / HLAL daily (Massive, else Nasdaq).
//    facts   = SEC XBRL company facts, point in time (value-core rules): anomaly-cache/facts.json.gz READ ONLY, missing companies fetched
//              into tipster-cache. shares = data/shares.json.gz (30 days late; split jumps repaired). industry = SIC 4-digit.
//    insider = SEC Form 3/4/5 data sets (anomaly-cache/insider READ ONLY, missing quarters downloaded into tipster-cache).
//    8-K items = EDGAR submissions API (Item 3.02 = unregistered sale of equity: a strategic / private investment), candidates only.
// 2. 5-YEAR ONE-SHOT of every TIP rule not yet frozen (tier-2 standard + capital-per-year vs the S&P 500 gate, hold-core judgeHold); the
//    first complete verdict is frozen in data/tipster-lab.json firstRun (first-run.mjs freezeEach), same results.older / results.newer
//    format as data/value-lab.json; later runs = monitoring only.
// 3. RECONSTRUCTION of the two calls (NVDA near 90 USD in April 2025; INTC at its 2025 low and at the August 2025 government stake): what
//    was knowable that day, and whether the system's existing rules (DEC-FROG, ANOM-52WH, ANOM-RESMOM, B-FCF1, V15, HOLD-AVGDOWN) picked them.
// 4. PAPER LANE (from Monday 26 Oct 2026): every new session is scanned once; each new signal goes to data/tipster-paper.jsonl with its frozen
//    plan and the owner's ZAD halal mark; data/tipster-today.json (methods[id] = { name, hold, newSignals: [{ sym, close, halal }] }) and
//    data/tipster-board.json (closed paper trades after 0.8% cost, vs the average stock; READY = 30+ trades on 10+ days > 0).
// DIAG=1: coverage only, nothing computed or written.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock, effectiveRuns } from './first-run.mjs';
import { capG, correctedEntry } from './yardstick.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { high52, residMom, nextSession, boardStats, paperReady, monthStarts } from './anomaly-core.mjs';
import { infoDiscreteness } from './decoded-core.mjs';
import { RULES, IDS, PLAN, PLANS, COST, STRESS, SPLIT, PAPER_START, HOLD, BLOCK, YEAR, DIP, TURN, TOP_BIG, runPlan, weighted, perYearOf, failures, splitFix, sharesAt, industryLeaders, largest, dedupeByCompany,
  dipLeaderOk, themePick, industryGrowth, turnaroundOk, highOf, insiderUsdBefore, item302Before, revGrowthTTM, growthOf, ttmOf, preRegister, mean, median, r4, halfOf, addDays } from './tipster-core.mjs';
const env = process.env, DIAG = !!env.DIAG, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', TC = env.TIP_CACHE || 'tipster-cache', AC = env.ANOM_CACHE || 'anomaly-cache';
const OUT = 'data/tipster-lab.json', PAPER = 'data/tipster-paper.jsonl', TODAY = 'data/tipster-today.json', BOARD = 'data/tipster-board.json', START = env.PAPER_START || PAPER_START, PRE_FROM = '2018-08-01';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.TIP_MINUTES || 200) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(TC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J('data/strategy-library.json', null), ch = preRegister(LB); if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); log('library: ' + ch + ' TIP entries pre-registered now'); }

// ================= 1. PRICES =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('tipster-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6 || DIAG) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN), CX = new Float32Array(N).fill(NaN), OX = new Float32Array(N).fill(NaN);
let xDays = 0;
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }
  if (x.x) { xDays++; for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) { CX[q * T + t] = x.x.c[j]; OX[q * T + t] = x.x.o[j]; } } } });
const SIC = store.sic || {}; store = null;
if (!DIAG) { const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; C[q] /= r; CX[q] /= r; OX[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), CC = (i, t) => { const z = C[i * T + t]; return z > 0 ? z : CX[i * T + t]; }, OO = (i, t) => { const z = O[i * T + t]; return z > 0 ? z : OX[i * T + t]; };
const lastI = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = T - 1; t >= 0; t--) if (CC(i, t) > 0) { lastI[i] = t; break; }
const GONE = 5, vanishedI = (i) => lastI[i] >= 0 && lastI[i] < T - 1 - GONE, deadI = (i) => vanishedI(i) && CC(i, lastI[i]) < 3;
const serMemo = new Map(), ser = (i) => { if (!serMemo.has(i)) serMemo.set(i, { o: (k) => OO(i, k), c: (k) => CC(i, k), last: lastI[i], T }); return serMemo.get(i); };
// liquidity (main rows): close >= 5 and 20-session average traded value >= 5M USD; DV20 kept for the one-ticker-per-company choice
const LIQ = new Uint8Array(N), DV20 = new Float32Array(N); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = C[b + t] * V[b + t]; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const w = C[b + t - 20] * V[b + t - 20]; if (isFinite(w)) { s -= w; n--; } } if (t >= 19 && n === 20) { DV20[b + t] = s / 20; if (C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } } }
const liqMemo = new Map(), liqList = (t) => { if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks, x rows on ' + xDays + ' days)');

// ---- the ~3 years BEFORE the window (Massive grouped daily, adjusted; closes only; own cache) ----
const PRE = JZ(TC + '/pre.json.gz', { syms: [], days: {}, empty: [] }); { const want = []; for (let x = Date.parse(PRE_FROM + 'T12:00:00Z'); iso(x) < D[0]; x += 864e5) { const w = new Date(x).getUTCDay(); if (w > 0 && w < 6) want.push(iso(x)); }
  const have = new Set([...Object.keys(PRE.days), ...PRE.empty]), todo = want.filter(d => !have.has(d)); let got = 0, refused = 0; const sIdx = new Map(PRE.syms.map((s, k) => [s, k]));
  if (!DIAG) for (const d of todo) { if (left() < 120 * 60e3) break; const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (j && j.refused) { refused++; if (refused >= 10 && !got) break; continue; } if (!j) continue;
    const rows = Array.isArray(j.results) ? j.results.filter(x => x && SY.has(x.T) && x.c > 0) : []; if (!rows.length) { PRE.empty.push(d); continue; }
    const ix = [], cs = []; for (const x of rows) { if (!sIdx.has(x.T)) { sIdx.set(x.T, PRE.syms.length); PRE.syms.push(x.T); } ix.push(sIdx.get(x.T)); cs.push(+x.c.toFixed(4)); } PRE.days[d] = [ix, cs]; got++; }
  if (got) WZ(TC + '/pre.json.gz', PRE);
  if (refused) log('pre-window: Massive refused ' + refused + ' grouped requests (plan history limit); falling back to Nasdaq per-ticker history'); }

// ---- SPUS / HLAL (price only) ----
const NQ_HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
async function getJ(url, headers = {}) { for (let a = 0; a < 3; a++) { try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(45000) }); if (r.status === 404) return null; if (r.status === 429 || r.status >= 500) { await sleep(2500 * (a + 1)); continue; } if (!r.ok) return null; return await r.json(); } catch (e) { await sleep(2000 * (a + 1)); } } return null; }
const nnum = (v) => { const x = parseFloat(String(v || '').replace(/[$,]/g, '')); return isFinite(x) && x > 0 ? x : NaN; };
async function fundBars(sym) { if (DIAG) return null; const j = await api('/v2/aggs/ticker/' + sym + '/range/1/day/2019-01-01/' + iso(Date.now()) + '?adjusted=true&sort=asc&limit=50000');
  if (j && Array.isArray(j.results) && j.results.length > 100) return j.results.map(b => ({ d: iso(b.t), o: b.o, c: b.c }));
  const q = await getJ(NQ + '/api/quote/' + sym + '/historical?assetclass=etf&fromdate=2019-01-01&todate=' + iso(Date.now()) + '&limit=9999', NQ_HEAD), rows = q && q.data && q.data.tradesTable && q.data.tradesTable.rows;
  if (!Array.isArray(rows) || rows.length < 100) return null; return rows.map(r => { const m = String(r.date || '').match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m ? { d: m[3] + '-' + m[1] + '-' + m[2], o: nnum(r.open), c: nnum(r.close) } : null; }).filter(b => b && b.c > 0).sort((a, b) => a.d < b.d ? -1 : 1); }
const FUND = {}; for (const f of ['SPUS', 'HLAL']) { const b = await fundBars(f); FUND[f] = b ? new Map(b.map(x => [x.d, x])) : null; } STATUS.funds = { ok: !!(FUND.SPUS && FUND.HLAL), SPUS: FUND.SPUS ? FUND.SPUS.size : 0, HLAL: FUND.HLAL ? FUND.HLAL.size : 0 };
const idxRet = (kind) => (kIn, x, at) => { if (kind === 'SPY') { const a = OO(spyI, kIn), b = at === 'o' ? OO(spyI, x) : CC(spyI, x); return a > 0 && b > 0 ? b / a - 1 : null; }
  const M = FUND[kind]; if (!M) return null; const a = M.get(D[kIn]), b = M.get(D[x]); const pa = a ? (a.o > 0 ? a.o : a.c) : NaN, pb = b ? (at === 'o' ? (b.o > 0 ? b.o : b.c) : b.c) : NaN; return pa > 0 && pb > 0 ? pb / pa - 1 : null; };

// ================= 2. COMPANIES: SIC, shares, market caps, facts, insiders, 8-K items =================
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {}, c: {} });
const sicOf = (s) => { const x = SIC[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECCIK[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
const symCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(a); const y = SECCIK[s]; return y ? String(y[0]) : null; };
const shMemo = new Map(), shRows = (cik) => { if (!shMemo.has(cik)) { const a = SH.c[cik]; shMemo.set(cik, a && a.length ? splitFix(a) : null); } return shMemo.get(cik); };
const capMemo = new Map();
function capsAt(t) { if (capMemo.has(t)) return capMemo.get(t); const rows = [];
  for (const i of liqList(t)) { const s = SYMS[i], cik = symCik(s), ind = sicOf(s); if (!cik || !ind) continue; const sh = sharesAt(shRows(cik), D[t]); if (!(sh > 0)) continue; const cap = C[i * T + t] * sh; if (!(cap > 0)) continue;
    rows.push({ key: i, cik, ind, cap, dv: DV20[i * T + t] }); }
  const u = dedupeByCompany(rows), L = industryLeaders(u), B = largest(u, TOP_BIG), out = { rows: u, ...L, big: B.set, bigRank: B.rank }; capMemo.set(t, out); return out; }
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';

// ---- the years before the window, fallback: Nasdaq per-ticker daily history (Massive serves only ~5 years). Needed for: every universe
// member at the month starts of the first 260 sessions (12-month returns, 52-week highs) and every industry leader at any month start
// (3-year lows), plus SPY. Cached per ticker in tipster-cache/pre-nasdaq.json; a ticker Nasdaq does not know (most delisted stocks) is
// recorded as [] and stays without pre-window history (it can only qualify once the window itself gives enough sessions).
const NQP = J(TC + '/pre-nasdaq2.json', null) || { tk: {} }, preMode = Object.keys(PRE.days).length >= 700 ? 'massive' : 'nasdaq'; let nqGot = 0, nqFail = 0, preNeed = [];
if (preMode === 'nasdaq') { const need = new Set(['SPY']), ms0 = monthStarts(D); for (const t of ms0.filter(t => t < 260)) for (const r of capsAt(t).rows) need.add(SYMS[r.key]); for (const t of ms0) for (const i of capsAt(t).leaders) need.add(SYMS[i]); preNeed = [...need];
  const mdy = (s) => { const m = String(s || '').match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m ? m[3] + '-' + m[1] + '-' + m[2] : null; };
  // the query runs to today (the form hold-lab.mjs uses; a past todate came back empty on 24 Oct) and is cut at the window start here.
  // SPY goes first: if SPY gives no history the source is not working, nothing is recorded and the run stays incomplete.
  preNeed = ['SPY', ...preNeed.filter(s => s !== 'SPY')];
  if (!DIAG) for (const s of preNeed) { if (NQP.tk[s] !== undefined) continue; if (left() < 120 * 60e3) break; await sleep(local(env.NASDAQ_BASE) ? 0 : 250);
    const q = await getJ(NQ + '/api/quote/' + encodeURIComponent(s) + '/historical?assetclass=' + (s === 'SPY' ? 'etf' : 'stocks') + '&fromdate=' + PRE_FROM + '&todate=' + iso(Date.now()) + '&limit=9999', NQ_HEAD);
    if (q === null) { nqFail++; continue; } const rows = q && q.data && q.data.tradesTable && q.data.tradesTable.rows;
    if (s === 'SPY' && !(Array.isArray(rows) && rows.length > 500)) { log('pre-window (Nasdaq): SPY gave no usable history; response keys ' + JSON.stringify(Object.keys(q || {})) + ' data ' + JSON.stringify(q && q.data ? Object.keys(q.data) : null) + ' status ' + JSON.stringify(q && q.status || null).slice(0, 300) + ' rows ' + (Array.isArray(rows) ? rows.length + ' first ' + JSON.stringify(rows[0]).slice(0, 200) : typeof rows)); nqFail++; break; }
    NQP.tk[s] = Array.isArray(rows) ? rows.map(r => { const d = mdy(r.date), c = nnum(r.close); return d && c > 0 && d < D[0] && d >= PRE_FROM ? [d, +c.toFixed(4)] : null; }).filter(Boolean).sort((a, b) => a[0] < b[0] ? -1 : 1) : [];
    nqGot++; if (nqGot % 250 === 0) { W(TC + '/pre-nasdaq2.json', NQP); log('pre-window (Nasdaq): ' + nqGot + ' tickers fetched'); } }
  if (nqGot) W(TC + '/pre-nasdaq2.json', NQP); }
const PD = preMode === 'massive' ? Object.keys(PRE.days).sort() : (NQP.tk.SPY || []).map(b => b[0]), P = PD.length, E = P + T, EC = new Float32Array(NS * E).fill(NaN), pIdx = new Map(PD.map((d, p) => [d, p]));
if (preMode === 'massive') PD.forEach((d, p) => { const [ix, cs] = PRE.days[d]; for (let j = 0; j < ix.length; j++) { const i = SY.get(PRE.syms[ix[j]]); if (i !== undefined) EC[i * E + p] = cs[j]; } });
else for (const [s, rows] of Object.entries(NQP.tk)) { const i = SY.get(s); if (i === undefined || !Array.isArray(rows)) continue; for (const [d, c] of rows) { const p = pIdx.get(d); if (p !== undefined) EC[i * E + p] = c; } }
{ const tried = preNeed.filter(s => NQP.tk[s] !== undefined), withData = tried.filter(s => NQP.tk[s].length >= 100), noData = tried.filter(s => NQP.tk[s].length < 100), notTried = preNeed.length - tried.length;
  const delistedNoData = noData.filter(s => { const i = SY.get(s); return i !== undefined && vanishedI(i); }).length;
  STATUS.pre = preMode === 'massive' ? { ok: P >= 700, mode: 'massive grouped', sessions: P, from: PD[0] || null }
    : { ok: P >= 700 && notTried + nqFail <= preNeed.length * 0.01, mode: 'nasdaq per ticker', sessions: P, from: PD[0] || null, needed: preNeed.length, withHistory: withData.length, noHistory: noData.length, noHistoryAndDelistedInWindow: delistedNoData, notTriedYet: notTried, failedNow: nqFail, fetchedNow: nqGot,
      note: 'tickers without pre-window history (mostly stocks delisted since) can only qualify once the window gives enough sessions: a survivorship gap in the first year of the window' };
  log('pre-window: ' + JSON.stringify(STATUS.pre)); }
let boundaryFix = 0; for (let i = 0; i < NS; i++) { const b = i * E; for (let t = 0; t < T; t++) { const z = CC(i, t); if (z > 0) EC[b + P + t] = z; }
  // the cache was adjusted when it was built; a split since then shows as a whole-ratio jump at the boundary: scale the pre-window
  let a = NaN, z = NaN; for (let p = P - 1; p >= Math.max(0, P - 5) && !(a > 0); p--) a = EC[b + p]; for (let t = 0; t < 5 && !(z > 0); t++) z = EC[b + P + t];
  if (a > 0 && z > 0) { const r = z / a, R = r >= 1 ? r : 1 / r, w = Math.round(R); if (w >= 2 && w <= 50 && Math.abs(R / w - 1) <= 0.03) { for (let p = 0; p < P; p++) EC[b + p] *= r; boundaryFix++; } } }
const ext = (i) => EC.subarray(i * E, i * E + E), spyE = spyI !== undefined ? ext(spyI) : null;
log('extended closes: ' + P + ' pre-window + ' + T + ' window sessions; boundary split repairs ' + boundaryFix);
// ---- SEC facts (revenue, gross profit, cost of revenue, net income), compact [start, end, value, filed] ----
const TAGS = { rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], gp: ['GrossProfit'], cogs: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'], ni: ['NetIncomeLoss', 'ProfitLoss'] };
const ALLTAGS = [...new Set(Object.values(TAGS).flat())];
const compact = (j) => { const out = {}, g = j && j.facts && j.facts['us-gaap']; if (!g) return out;
  for (const tag of ALLTAGS) { const u = g[tag] && g[tag].units && g[tag].units.USD; if (!Array.isArray(u)) continue; const rows = [], seen = new Set();
    for (const x of [...u].sort((a, b) => a.filed < b.filed ? -1 : 1)) { if (!x || !x.end || !x.filed || !isFinite(x.val) || x.end < '2016-01-01') continue; const k = (x.start || '') + '|' + x.end + '|' + x.val; if (seen.has(k)) continue; seen.add(k); rows.push([x.start || '', x.end, x.val, x.filed]); }
    if (rows.length) out[tag] = rows; } return out; };
const AFX = JZ(AC + '/facts.json.gz', { at: null, c: {} }), TFX = JZ(TC + '/facts.json.gz', { at: null, c: {} });
async function get(url, opt = {}) { for (let a = 0; a < 3; a++) { try { const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(opt.timeout || 120000) }); if (r.status === 404) return { status: 404 }; if (r.status === 429 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; } return r; } catch (e) { await sleep(2000 * (a + 1)); } } return null; }
{ const need = new Set(); for (const t of monthStarts(D)) for (const r of capsAt(t).rows) need.add(r.cik); for (const s of ['NVDA', 'INTC']) { const c = symCik(s); if (c) need.add(c); }
  // a company is fetched here only if neither cache has it (an empty answer is remembered: {}); the anomaly lab refreshes its cache weekly
  const todo = [...need].filter(c => !(AFX.c[c] && Object.keys(AFX.c[c]).length) && !TFX.c[c]);
  let got = 0, fail = 0; if (!DIAG) { for (const c of todo) { if (left() < 140 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); const r = await get(SECD + '/api/xbrl/companyfacts/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA } });
      if (r && r.ok) { const j = await r.json().catch(() => null); if (j) { TFX.c[c] = compact(j); got++; } } else if (r && r.status === 404) TFX.c[c] = {}; else fail++; }
    if (got) { TFX.at = new Date().toISOString(); WZ(TC + '/facts.json.gz', TFX); } }
  const cov = [...need].filter(c => (TFX.c[c] && Object.keys(TFX.c[c]).length) || (AFX.c[c] && Object.keys(AFX.c[c]).length)).length;
  STATUS.facts = { ok: need.size > 0 && cov >= need.size * 0.8, companies: need.size, withFacts: cov, fetchedNow: got, failed: fail, anomalyCacheAt: AFX.at }; log('SEC facts coverage ' + cov + '/' + need.size + ' (' + got + ' fetched now)'); }
const coMemo = new Map(); const coOf = (cik) => { if (!cik) return null; if (coMemo.has(cik)) return coMemo.get(cik); const a = TFX.c[cik] && Object.keys(TFX.c[cik]).length ? TFX.c[cik] : AFX.c[cik]; let o = null;
  if (a) { o = {}; for (const [g, tags] of Object.entries(TAGS)) { o[g] = {}; for (const t of tags) if (a[t]) o[g][t] = a[t].map(([s0, e, v, f]) => ({ s: s0, e, v, f })); } } coMemo.set(cik, o); return o; };
const gMemo = new Map(), growthAt = (cik, d) => { const k = cik + '|' + d; if (!gMemo.has(k)) { const co = coOf(cik); gMemo.set(k, co ? growthOf(co.rev, d) : null); } return gMemo.get(k); };
const rgMemo = new Map(), revGAt = (cik, d) => { const k = cik + '|' + d; if (!rgMemo.has(k)) { const co = coOf(cik); rgMemo.set(k, co ? revGrowthTTM(co.rev, d) : null); } return rgMemo.get(k); };

// ---- insider purchases (SEC Form 345 data sets; anomaly cache read only, missing quarters downloaded here) ----
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : null; };
const tsv = (zip, name) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const L = txt.split(/\r?\n/), H = L[0].split('\t'); return { H, rows: L.slice(1).filter(Boolean).map(l => l.split('\t')) }; };
async function download(url, file) { try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 30 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
const INSB = new Map(); { const qs = [], now = new Date(); for (let y = 2021; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, q * 3, 1)) < now) qs.push(y + 'q' + q);
  let got = 0, n = 0; const fail = [];
  for (const q of qs) { let x = J(AC + '/insider/' + q + '.json', null) || J(TC + '/insider/' + q + '.json', null);
    if (!x && !DIAG && left() > 100 * 60e3) { for (const p of ['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/']) { const zip = TC + '/ins.zip'; if (!(await download(SEC + p + q + '_form345.zip', zip))) continue;
        const S = tsv(zip, 'SUBMISSION.tsv'), Nt = tsv(zip, 'NONDERIV_TRANS.tsv'), RO = tsv(zip, 'REPORTINGOWNER.tsv'); try { fs.unlinkSync(zip); } catch (e) {} if (!S || !Nt) continue;
        const own = new Map(); if (RO) { const a = RO.H.indexOf('ACCESSION_NUMBER'), b = RO.H.indexOf('RPTOWNERCIK'); for (const r of RO.rows) if (!own.has(r[a])) own.set(r[a], r[b]); }
        const si = (k) => S.H.indexOf(k), ni = (k) => Nt.H.indexOf(k), sub = new Map();
        for (const r of S.rows) if (r[si('DOCUMENT_TYPE')] === '4') sub.set(r[si('ACCESSION_NUMBER')], { d: isoD(r[si('FILING_DATE')]), sym: String(r[si('ISSUERTRADINGSYMBOL')] || '').toUpperCase().trim().replace(/-/g, '.') });
        const buys = []; for (const r of Nt.rows) { if (r[ni('TRANS_CODE')] !== 'P' || r[ni('TRANS_ACQUIRED_DISP_CD')] !== 'A') continue; const s = sub.get(r[ni('ACCESSION_NUMBER')]); if (!s || !s.d || !/^[A-Z][A-Z0-9.]{0,6}$/.test(s.sym)) continue;
          const sh = +r[ni('TRANS_SHARES')], px = +r[ni('TRANS_PRICEPERSHARE')]; if (sh > 0 && px > 0) buys.push([s.sym, s.d, own.get(r[ni('ACCESSION_NUMBER')]) || '', Math.round(sh * px), isoD(r[ni('TRANS_DATE')]) || s.d]); }
        x = { buys }; W(TC + '/insider/' + q + '.json', x); got++; break; } }
    if (!x) { fail.push(q); continue; } for (const b of x.buys) { if (!(b[3] > 0) || b[3] > 5e9) continue; (INSB.get(b[0]) || INSB.set(b[0], []).get(b[0])).push(b); n++; } }
  const lastDone = qs.slice(0, -1); STATUS.insider = { ok: lastDone.every(q => !fail.includes(q)), quarters: qs.length, downloadedNow: got, missing: fail, purchases: n, note: 'SEC publishes each quarter\'s data set after the quarter: the newest weeks of purchases are not in it yet' };
  log('insider: ' + n + ' purchases, missing ' + (fail.join(' ') || 'none')); }

// ---- 8-K items from the EDGAR submissions API (on demand; own cache, refreshed after 6 days) ----
const SUBS = J(TC + '/subs.json', {}), subsTried = new Set(); let subsFetched = 0, subsFail = 0;
async function eightK(cik) { if (!cik) return null; const c = SUBS[cik]; if (c && (DIAG || subsTried.has(cik) || Date.now() - Date.parse(c.at) < 6 * 864e5)) return c.f; if (DIAG || subsTried.has(cik)) return c ? c.f : null; subsTried.add(cik);
  const pad = 'CIK' + cik.padStart(10, '0'), rows = [], take = (r) => { if (!r || !Array.isArray(r.form)) return; for (let k = 0; k < r.form.length; k++) if (r.form[k] === '8-K' || r.form[k] === '8-K/A') rows.push({ d: r.filingDate[k], items: String(r.items[k] || ''), form: r.form[k] }); };
  await sleep(local(env.SEC_BASE) ? 0 : 110); const r = await get(SECD + '/submissions/' + pad + '.json', { headers: { 'User-Agent': UA } }); if (r && r.status === 404) { SUBS[cik] = { at: new Date().toISOString(), f: [] }; return []; }
  const j = r && r.ok ? await r.json().catch(() => null) : null; if (!j) { subsFail++; return c ? c.f : null; }
  take(j.filings && j.filings.recent); for (const f of (j.filings && j.filings.files) || []) { if (!(f.filingTo >= '2018-01-01')) continue; await sleep(110); const r2 = await get(SECD + '/submissions/' + f.name, { headers: { 'User-Agent': UA } }); const j2 = r2 && r2.ok ? await r2.json().catch(() => null) : null; if (j2) take(j2); else subsFail++; }
  rows.sort((a, b) => a.d < b.d ? -1 : 1); SUBS[cik] = { at: new Date().toISOString(), f: rows }; subsFetched++; return rows; }

const SPYDD = new Float32Array(T).fill(NaN); for (let t = 0; t < T; t++) { const h = spyE ? highOf(spyE, P + t, 252) : null; if (h > 0) SPYDD[t] = spyE[P + t] / h - 1; }
const DIAGS = { window: [D[0], D[T - 1]], sessions: T, stocks: NS, preWindow: STATUS.pre, spyDDknown: [...SPYDD].filter(ok).length, crashSessions: [...SPYDD].filter(x => x <= -DIP.spyOff).length, funds: STATUS.funds, facts: STATUS.facts, insider: STATUS.insider,
  leadersAtLastMonthStart: (() => { const ms = monthStarts(D), t = ms[ms.length - 1], L = capsAt(t); return { date: D[t], universe: L.rows.length, industries5: [...L.members.values()].filter(n => n >= 5).length, leaders: L.leaders.size }; })() };
if (DIAG) { console.log('TIPSTER LAB DIAGNOSTICS (coverage only, nothing computed or written)'); console.log(JSON.stringify(DIAGS, null, 1)); process.exit(0); }

// ================= 3. SIGNALS (shared by the 5-year test and the paper lane) =================
const MS = monthStarts(D), QS = MS.filter(t => ['01', '04', '07', '10'].includes(D[t].slice(5, 7)));
const leaderAtMS = new Map(MS.map(t => [t, capsAt(t).leaders]));
// former leaders: every stock that was a leader at a month start; rolling 756-session low (closes before t) and its cover, on extended closes
const FORMER = new Set(); for (const L of leaderAtMS.values()) for (const i of L) FORMER.add(i);
const LOW = new Map(); for (const i of FORMER) { const c = ext(i), lo = new Float32Array(E).fill(NaN), cv = new Float32Array(E).fill(0), n = TURN.lowWindow; const dq = []; let have = 0;
  for (let g = 0; g < E; g++) { // window [g - n, g - 1]
    if (g - 1 >= 0) { const v = c[g - 1]; if (v > 0) { while (dq.length && c[dq[dq.length - 1]] >= v) dq.pop(); dq.push(g - 1); have++; } }
    const out = g - n - 1; if (out >= 0 && c[out] > 0) have--; while (dq.length && dq[0] < g - n) dq.shift(); lo[g] = dq.length ? c[dq[0]] : NaN; cv[g] = have / n; }
  LOW.set(i, { lo, cv }); }
const wasLeader = (i, t) => { for (const m of MS) { if (m > t) break; if (m >= t - TURN.formerWindow && leaderAtMS.get(m).has(i)) return true; } return false; };
const hi252 = (i, t) => highOf(ext(i), P + t, 252);
function dipSignals(t) { const out = { 'TIP-DIPLEAD': [], 'TIP-DIPLEAD-100': [] }; if (!(SPYDD[t] <= -DIP.spyOff + 1e-9)) return out; const L = capsAt(t);
  for (const r of L.rows) { const i = r.key; if (!L.leaders.has(i)) continue; const h = hi252(i, t), cl = C[i * T + t]; if (!(h > 0) || !(cl <= h * (1 - DIP.stockOff) * (1 + 1e-9))) continue;
    const g = revGAt(r.cik, D[t]); if (!dipLeaderOk({ leader: true, close: cl, hi252: h, spyClose: spyE[P + t], spyHi252: highOf(spyE, P + t, 252), revG: g })) continue;
    const info = { capB: r.cap / 1e9, rankInInd: L.rankInInd.get(i), ind: r.ind, dd52: cl / h - 1, spyDD: SPYDD[t], revG: g, bigRank: L.bigRank.get(i) };
    out['TIP-DIPLEAD'].push({ i, info }); if (L.big.has(i)) out['TIP-DIPLEAD-100'].push({ i, info }); } return out; }
const themeLog = [];
function themeSignals(t) { const out = { 'TIP-THEME': [], 'TIP-THEME-100': [] }; if (!QS.includes(t)) return out; const L = capsAt(t), inds = [];
  for (const [ind, a] of L.byInd) { if (a.length < 5) continue; const rets = a.map(r => { const c = ext(r.key), x = c[P + t], y = c[P + t - 252]; return x > 0 && y > 0 ? x / y - 1 : NaN; });
    const gs = a.map(r => { const g = growthAt(r.cik, D[t]); return g ? [g.g[0], g.g[1]] : null; }), ig = industryGrowth(gs); inds.push({ ind, n: a.length, ret12: median(rets), ...ig }); }
  const pick = themePick(inds); const ranked = [...inds].filter(x => ok(x.ret12)).sort((a, b) => b.ret12 - a.ret12);
  if (!themeLog.some(x => x.d === D[t])) themeLog.push({ d: D[t], theme: pick ? { ind: pick.ind, n: pick.n, ret12: r4(pick.ret12), g0: r4(pick.g0), g1: r4(pick.g1), leaders: [...L.byInd.get(pick.ind)].sort((a, b) => b.cap - a.cap).slice(0, 3).map(r => SYMS[r.key]) } : null,
    hottest: ranked.slice(0, 5).map(x => ({ ind: x.ind, ret12: r4(x.ret12), g0: r4(x.g0), g1: r4(x.g1), accelerating: !!(x.g0 > x.g1 && x.g0 > 0 && x.ng >= 3) })) });
  if (!pick) return out; const lead = [...L.byInd.get(pick.ind)].sort((a, b) => b.cap - a.cap).slice(0, 3);
  for (const r of lead) { const info = { capB: r.cap / 1e9, ind: pick.ind, indRet12: pick.ret12, indG0: pick.g0, indG1: pick.g1, bigRank: L.bigRank.get(r.key) }; out['TIP-THEME'].push({ i: r.key, info }); if (L.big.has(r.key)) out['TIP-THEME-100'].push({ i: r.key, info }); }
  return out; }
const turnPend = [];   // price + growth passed; money leg checked after the 8-K fetch
function turnPrelim(t) { const out = [];
  for (const i of FORMER) { if (!LIQ[i * T + t]) continue; const lw = LOW.get(i), g = P + t, cl = C[i * T + t]; if (!(lw.lo[g] > 0) || !(lw.cv[g] >= 0.9) || !(cl <= lw.lo[g] * (1 + TURN.nearLow) * (1 + 1e-9))) continue;
    if (!wasLeader(i, t)) continue; const cik = symCik(SYMS[i]); if (!cik) continue; const gr0 = growthAt(cik, D[t]); if (!gr0 || !gr0.rising) continue;
    const L = capsAt(t), r = L.rows.find(z => z.key === i); if (!r) continue; const gr = gr0;   // in the universe that day (shares known, SIC, the company's main ticker)
    out.push({ i, t, cik: r.cik, close: cl, low: lw.lo[g], lowCover: lw.cv[g], growth: gr, big: L.big.has(i), info: { capB: r.cap / 1e9, ind: r.ind, rankInIndNow: L.rankInInd.get(i), vsLow: cl / lw.lo[g] - 1, growth: gr.g.map(r4), bigRank: L.bigRank.get(i) } }); }
  return out; }
async function turnFinal(list) { const out = { 'TIP-TURN': [], 'TIP-TURN-100': [] };
  for (const z of list) { const ins = insiderUsdBefore(INSB.get(SYMS[z.i]) || [], D[z.t]); let f302 = [];
    if (!(ins >= TURN.insiderUsd)) { const f = await eightK(z.cik); f302 = f ? item302Before(f, D[z.t]) : []; }
    if (!turnaroundOk({ formerLeader: true, close: z.close, low: z.low, lowCover: z.lowCover, growth: z.growth, insiderUsd: ins, item302: f302.length > 0 })) continue;
    const info = { ...z.info, insiderUsd90: ins, item302: f302.map(x => x.d) }; out['TIP-TURN'].push({ i: z.i, t: z.t, info }); if (z.big) out['TIP-TURN-100'].push({ i: z.i, t: z.t, info }); }
  return out; }

// ================= 4. 5-YEAR ONE-SHOT =================
const need = IDS.filter(id => !(id in FROZEN)), LIGHT = env.TIP_LIGHT === '1' && !need.length;   // weekday evenings once all are frozen: paper lane only
// the average liquid stock bought at the open of session te (liquid the session before) and held: curve by offset (every second stock,
// each capped at +300% (winsorised), a dead stock counts 0 after it vanished) - hold-lab.mjs method. AUD-1 (engine audit 24 Oct 2026): the
// rule's own returns are capped at +300% the same way (yardstick.mjs capBoth); capped = false gives the uncapped curve (sensitivity 'raw').
const curveMemo = new Map();
function curve(te, len, capped = true) { const key = capped ? te : -te - 1, m = curveMemo.get(key); if (m && m.length >= Math.min(len, T - te)) return m; const L = Math.min(len, T - te), sum = new Float64Array(L), cnt = new Uint32Array(L), lq = liqList(te - 1);
  for (let q = 0; q < lq.length; q += 2) { const i = lq[q], e = OO(i, te); if (!(e > 0)) continue; const li = lastI[i], van = vanishedI(i), dead = deadI(i); let lc = NaN;
    for (let off = 0; off < L; off++) { const k = te + off; let v; if (van && k > li) v = dead ? 0 : CC(i, li); else { const z = CC(i, k); if (z > 0) lc = z; v = lc; } if (!(v >= 0)) continue; sum[off] += capped ? Math.min(v / e, 4) : v / e; cnt[off]++; } }
  const out = new Float32Array(L); for (let off = 0; off < L; off++) out[off] = cnt[off] >= 50 ? sum[off] / cnt[off] - 1 : NaN; curveMemo.set(key, out); return out; }
const ctrlRet = (kIn, x, at, capped = true) => { const cv = curve(kIn, HOLD + 1, capped), off = (at === 'o' ? x - 1 : x) - kIn; const v = off >= 0 && off < cv.length ? cv[off] : NaN; return isFinite(v) ? v : null; };
// the same stock with the same plan on its other days (every 21st session, starts 63+ sessions away from this entry)
const ownMemo = new Map(), ownList = (i) => { if (!ownMemo.has(i)) { const a = []; for (let k = 1; k + HOLD <= T; k += 21) { const r = runPlan(ser(i), k, PLAN); if (r) a.push({ k, g: r.g }); } ownMemo.set(i, a); } return ownMemo.get(i); };
const ownOf = (i, te, capped = false) => { const a = ownList(i).filter(z => Math.abs(z.k - te) >= 63).map(z => capped ? capG(z.g) : z.g); return a.length ? mean(a) : null; };
const exitPx = (i, r) => r.kind === 'dead' ? 0 : r.at === 'o' ? OO(i, r.x) : CC(i, r.x);
function evalSignal(id, i, t, info) { const te = t + 1; if (te >= T) return { censored: true }; const r = runPlan(ser(i), te, PLAN); if (!r) return { censored: true };
  const plans = Object.fromEntries(Object.entries(PLANS).map(([k, p]) => { const z = runPlan(ser(i), te, p); return [k, z ? { g: z.g, w: z.w, unitYears: z.unitYears, kind: z.kind } : null]; }));
  return { t, s: SYMS[i], i, half: halfOf(D[t]), sig: D[t], buy: D[te], sell: D[r.x], kind: r.kind, g: r.g, w: r.w, n: r.units.length, unitYears: r.unitYears, worst: r.worst, days: r.days, endVsFirst: exitPx(i, r) / r.units[0].px - 1,
    c: weighted(r.units, r.x, r.at, ctrlRet) ?? NaN, cRaw: weighted(r.units, r.x, r.at, (a, b, c) => ctrlRet(a, b, c, false)) ?? NaN, own: ownOf(i, te), ownCap: ownOf(i, te, true), spy: weighted(r.units, r.x, r.at, idxRet('SPY')), spus: weighted(r.units, r.x, r.at, idxRet('SPUS')), hlal: weighted(r.units, r.x, r.at, idxRet('HLAL')), plans, info }; }
const SIGS = Object.fromEntries(IDS.map(id => [id, []])), CENS = Object.fromEntries(IDS.map(id => [id, 0])), RAW = Object.fromEntries(IDS.map(id => [id, []]));
{ const openUntil = Object.fromEntries(IDS.map(id => [id, new Map()])), turnAll = [];
  const take = (id, list, t) => { for (const z of list) { const ou = openUntil[id].get(z.i); if (ou !== undefined && t <= ou) continue; RAW[id].push({ i: z.i, t, info: z.info }); const e = evalSignal(id, z.i, t, z.info);
      if (e.censored) { CENS[id]++; openUntil[id].set(z.i, T); continue; } SIGS[id].push(e); const x = tOf.get(e.sell); openUntil[id].set(z.i, x); } };
  for (let t = 252 - P > 0 ? 252 - P : 0; t < (LIGHT ? 0 : T - 1); t++) { if (left() < 25 * 60e3) { log('time budget: the scan stopped at ' + D[t]); STATUS.scan = { ok: false, stoppedAt: D[t] }; break; }
    const a = dipSignals(t); for (const id of Object.keys(a)) take(id, a[id], t);
    const b = themeSignals(t); for (const id of Object.keys(b)) take(id, b[id], t);
    turnAll.push(...turnPrelim(t)); }
  if (!STATUS.scan) STATUS.scan = { ok: true };
  // TURN: the money leg (insider buys / 8-K item 3.02) for every price + growth candidate, then in date order with one open position per stock
  const fin = await turnFinal(turnAll); for (const id of ['TIP-TURN', 'TIP-TURN-100']) { const byT = new Map(); for (const z of fin[id]) (byT.get(z.t) || byT.set(z.t, []).get(z.t)).push(z); for (const t of [...byT.keys()].sort((a, b) => a - b)) take(id, byT.get(t), t); }
  const firstBy = new Map(); for (const z of turnAll) { const s = SYMS[z.i]; if (!firstBy.has(s)) firstBy.set(s, { first: D[z.t], last: D[z.t], days: 0 }); const f = firstBy.get(s); f.last = D[z.t]; f.days++; }
  STATUS.turn = { candidatesPriceGrowth: turnAll.length, stocks: firstBy.size, eightKFetched: subsFetched, eightKFailed: subsFail, priceGrowthStocks: Object.fromEntries([...firstBy.entries()].slice(0, 80)) };
  log('signals: ' + IDS.map(id => id + ' ' + SIGS[id].length + (CENS[id] ? ' (+' + CENS[id] + ' too recent)' : '')).join(', ')); }
W(TC + '/subs.json', SUBS);
const benchPY = (rows, key) => { const v = rows.filter(z => ok(z[key])); const y = v.reduce((a, z) => a + z.unitYears, 0); return v.length && y > 0 ? r4(v.reduce((a, z) => a + z[key] * z.w, 0) / y) : null; };
const RES = {};
// three yardstick modes (yardstick.mjs): capBoth = THE VERDICT (rule and yardsticks capped at +300% alike); asFrozen = the pre-audit engine
// (yardstick curve capped, rule uncapped); raw = no cap on either side (sensitivity)
const asMode = (tr, mode) => tr.map(z => mode === 'capBoth' ? { ...z, g: capG(z.g), own: z.ownCap } : mode === 'raw' ? { ...z, c: z.cRaw } : z);
const py = (a) => ({ rule: r4(perYearOf(a)), spy: benchPY(a, 'spy'), spus: benchPY(a, 'spus'), hlal: benchPY(a, 'hlal'), avgStock: benchPY(a, 'c') });
const judgeMode = (tr0, mode) => { const tr = asMode(tr0, mode), by = { older: tr.filter(z => z.half === 'older'), newer: tr.filter(z => z.half === 'newer') };
  const R = { older: halfStat(by.older, BLOCK), newer: halfStat(by.newer, BLOCK), all: halfStat(tr, BLOCK) }, PY = { older: py(by.older), newer: py(by.newer), all: py(tr) };
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks with the same plan on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] } }); return { ...v, R, PY }; };
for (const id of LIGHT ? [] : IDS) { const tr = SIGS[id], by = { older: tr.filter(z => z.half === 'older'), newer: tr.filter(z => z.half === 'newer') };
  const J0 = judgeMode(tr, 'capBoth'), JF = judgeMode(tr, 'asFrozen'), JR = judgeMode(tr, 'raw'), R = J0.R, PY = J0.PY;
  const plans = Object.fromEntries(['REGISTERED', ...Object.keys(PLANS)].map(k => { const f = (a) => { const v = k === 'REGISTERED' ? a : a.map(z => z.plans[k] ? { ...z.plans[k] } : null).filter(Boolean);
      return { n: v.length, avg: r4(mean(v.map(z => z.g - COST))), perYear: r4(perYearOf(v)), moneyIn: r4(mean(v.map(z => z.w))) }; }; return [k, { older: f(by.older), newer: f(by.newer), all: f(tr) }]; }));
  const v = { verdict: J0.verdict, why: J0.why };
  const worst = [...tr].sort((a, b) => a.g - b.g).slice(0, 10).map(z => ({ s: z.s, sig: z.sig, sell: z.sell, kind: z.kind, net: r4(z.g - COST), worstOnTheWay: r4(z.worst), units: z.n }));
  const best = [...tr].sort((a, b) => b.g - a.g).slice(0, 5).map(z => ({ s: z.s, sig: z.sig, sell: z.sell, net: r4(z.g - COST) }));
  RES[id] = { ...v, yardstick: 'capBoth', modes: { asFrozen: { verdict: JF.verdict, why: JF.why, R: JF.R }, raw: { verdict: JR.verdict, why: JR.why, R: JR.R } }, name: RULES[id].name, hold: HOLD, cost: COST, split: SPLIT, results: R, perYear: PY, plans, failures: { older: failures(by.older), newer: failures(by.newer), all: failures(tr) }, worst, best,
    signals: tr.length, tooRecent: CENS[id], stocks: new Set(tr.map(z => z.s)).size, byYear: Object.fromEntries([...new Set(tr.map(z => z.sig.slice(0, 4)))].sort().map(y => { const a = tr.filter(z => z.sig.startsWith(y)); return [y, { n: a.length, avg: r4(mean(a.map(z => z.g - COST))) }]; })),
    trades: tr.map(z => ({ s: z.s, sig: z.sig, buy: z.buy, sell: z.sell, kind: z.kind, units: z.n, net: r4(z.g - COST), avgStock: r4(ok(z.c) ? z.c - COST : null), sameStock: r4(z.own === null ? null : z.own - COST), spy: r4(z.spy), worst: r4(z.worst), endVsFirst: r4(z.endVsFirst) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tB ' + h.tBlock;
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' /yr ' + pc(PY.older.rule) + ' SPY ' + pc(PY.older.spy) + ' | newer ' + f(R.newer) + ' /yr ' + pc(PY.newer.rule) + ' SPY ' + pc(PY.newer.spy) + ' | ' + RES[id].why.slice(0, 250)); }

// ================= 5. RECONSTRUCTION: NVDA and INTC (information) =================
const fsCache = JZ(env.FUND_CACHE || 'study-cache/fund.json.gz', { v: {} });
const sharesAtYearEnd = (cik, y) => { const a = shRows(cik); if (!a) return null; let v = null; for (const [e, n] of a) { if (e <= y + '-12-31' && e >= y + '-07-01') v = n; } return v; };
const num = (...v) => v.every(u => typeof u === 'number' && isFinite(u));
function fscore(cik, y) { const c = fsCache.v[cik]; if (!c || !c[y] || !c[y - 1] || !c[y - 2]) return null; const a = c[y], b = c[y - 1], z = c[y - 2];   // quality.mjs / hold-lab.mjs code
  if (!num(a.ni, b.ni, a.cfo, a.ltd, b.ltd, a.acur, b.acur, a.gp, b.gp) || !(a.assets > 0 && b.assets > 0 && z.assets > 0) || !(a.lcur > 0 && b.lcur > 0)) return null;
  const rk = num(a.rev, b.rev) ? 'rev' : num(a.rev2, b.rev2) ? 'rev2' : null; if (!rk || !(a[rk] > 0 && b[rk] > 0)) return null;
  const s1 = sharesAtYearEnd(cik, y), s0 = sharesAtYearEnd(cik, y - 1); if (!(s1 > 0 && s0 > 0)) return null;
  const chk = [a.ni > 0, a.cfo > 0, a.ni / b.assets > b.ni / z.assets, a.cfo > a.ni, a.ltd / ((a.assets + b.assets) / 2) < b.ltd / ((b.assets + z.assets) / 2), a.acur / a.lcur > b.acur / b.lcur, s1 <= s0, a.gp / a[rk] > b.gp / b[rk], a[rk] / b.assets > b[rk] / z.assets];
  return chk.filter(Boolean).length; }
const knownYear = (d) => { const y = +d.slice(0, 4), md = d.slice(5); return md >= '04-10' ? y - 1 : y - 2; };
// existing rules, monthly at each month start: ANOM-52WH (top 10% by close / 52-week high), ANOM-RESMOM (top 10% residual momentum), DEC-FROG
// (top 30% by 12-1 return, then the 30 with the lowest information discreteness), V15 (F-score 8-9 and above the 200-day average)
const WATCH = ['NVDA', 'INTC'].filter(s => SY.has(s)), EXIST = Object.fromEntries(WATCH.map(s => [s, []]));
for (const t of LIGHT ? [] : MS) { if (left() < 10 * 60e3) break; const lq = liqList(t), g = P + t, rows52 = [], rowsRes = [], rowsFrog = [];
  for (const i of lq) { const c = ext(i); const h = high52(c, g); if (ok(h)) rows52.push({ i, v: h }); const rm = residMom(c, spyE, g); if (ok(rm)) rowsRes.push({ i, v: rm });
    if (c[g - 252] > 0 && c[g - 21] > 0) { const r = c[g - 21] / c[g - 252] - 1, id = infoDiscreteness(c, g - 252, g - 21); if (ok(r) && ok(id)) rowsFrog.push({ i, r, id }); } }
  const rankPct = (rows, i) => { const s = [...rows].sort((a, b) => b.v - a.v), k = s.findIndex(z => z.i === i); return k < 0 ? null : (k + 1) / s.length; };
  const winners = [...rowsFrog].sort((a, b) => b.r - a.r).slice(0, Math.ceil(rowsFrog.length * 0.3)), frog = new Set(winners.sort((a, b) => a.id - b.id || b.r - a.r).slice(0, 30).map(z => z.i));
  for (const s of WATCH) { const i = SY.get(s), c = ext(i), cik = symCik(s), fsc = fscore(cik, knownYear(D[t])); let sma = 0, nn = 0; for (let k = g - 199; k <= g; k++) if (c[k] > 0) { sma += c[k]; nn++; }
    const p52 = rankPct(rows52, i), pres = rankPct(rowsRes, i);
    EXIST[s].push({ d: D[t], close: r4(c[g]), '52WH': p52 === null ? null : p52 <= 0.1, '52WHpct': r4(p52), RESMOM: pres === null ? null : pres <= 0.1, RESMOMpct: r4(pres), FROG: frog.has(i), fscore: fsc, V15: fsc !== null && fsc >= 8 && nn >= 190 && c[g] > sma / nn }); } }
const VL = J('data/value-lab.json', {}), HL = J('data/hold-lab.json', {});
const fromLists = (s) => ({ 'B-FCF1 (all 1,020 frozen 5-year picks)': ((VL.trades || {})['B-FCF1'] || []).filter(z => z.s === s).map(z => z.d),
  'HOLD-AVGDOWN on B-FCF1 quality (same picks)': ((HL.trades || {})['H-AVGDOWN/b1'] || []).filter(z => z[0] === s).map(z => z[1]),
  'HOLD-AVGDOWN on F-score 8-9 (12-a-day sample)': ((HL.trades || {})['H-AVGDOWN/b2'] || []).filter(z => z[0] === s).map(z => z[1] + ' -> ' + z[2] + ' ' + pc(z[4])) });
function snapshot(s, t, label) { const i = SY.get(s), c = ext(i), g = P + t, cik = symCik(s), co = coOf(cik), L = capsAt(t), d = D[t], close = c[g];
  let ath = 0; for (let k = 0; k <= g; k++) if (c[k] > ath) ath = c[k]; const h = highOf(c, g, 252), sh = sharesAt(shRows(cik), d), cap = sh ? close * sh : null;
  const ttm = (grp) => co ? ttmOf(co[grp], d) : null, rev = ttm('rev'), gp = ttm('gp'), cogs = ttm('cogs'), ni = ttm('ni'), gr = growthAt(cik, d);
  const gm = rev && rev.val > 0 ? (gp && gp.end === rev.end ? gp.val / rev.val : cogs && cogs.end === rev.end ? 1 - cogs.val / rev.val : null) : null;
  // valuation vs its own history: price / sales and price / earnings at every month start of the previous 5 years (extended closes, shares and TTM known then)
  const hist = []; for (let p = 0; p < g; p += 21) { const dd = p < P ? PD[p] : D[p - P]; if (dd < addDays(d, -5 * 365)) continue; const px = c[p], sh2 = sharesAt(shRows(cik), dd); if (!(px > 0) || !(sh2 > 0) || !co) continue;
    const rv = ttmOf(co.rev, dd), nn = ttmOf(co.ni, dd); hist.push({ ps: rv && rv.val > 0 ? px * sh2 / rv.val : null, pe: nn && nn.val > 0 ? px * sh2 / nn.val : null }); }
  const ps = cap && rev && rev.val > 0 ? cap / rev.val : null, pe = cap && ni && ni.val > 0 ? cap / ni.val : null;
  const indRows = L.byInd.get(sicOf(s)) || [], indRet = (ind) => median((L.byInd.get(ind) || []).map(r => { const x = ext(r.key); return x[g] > 0 && x[g - 252] > 0 ? x[g] / x[g - 252] - 1 : NaN; }));
  const allInd = [...L.byInd.entries()].filter(([, a]) => a.length >= 5).map(([ind]) => ({ ind, r: indRet(ind) })).filter(z => ok(z.r)).sort((a, b) => b.r - a.r), myRank = allInd.findIndex(z => z.ind === sicOf(s));
  const lastQS = [...QS].reverse().find(q => q <= t), theme = themeLog.find(x => x.d === (lastQS !== undefined ? D[lastQS] : '')) || null;
  const ins = (INSB.get(s) || []).filter(b => b[1] >= addDays(d, -90) && b[1] < d).sort((a, b) => b[3] - a[3]);
  const after = (n) => { const k = t + n; return k < T && CC(i, k) > 0 ? r4(CC(i, k) / close - 1) : null; };
  const sigHits = Object.fromEntries(IDS.map(id => [id, RAW[id].filter(z => z.i === i).map(z => D[z.t])]));
  return { label, sym: s, date: d, close: r4(close), high52: r4(h), offHigh52: r4(h ? close / h - 1 : null), allTimeHighInData: r4(ath), offAllTimeHigh: r4(close / ath - 1), dataFrom: PD[0] || D[0],
    spyOffHigh: r4(SPYDD[t]), marketCapB: r4(cap ? cap / 1e9 : null), sic: sicOf(s), rankInIndustry: L.rankInInd.get(i) || null, industryMembers: indRows.length, rankAllUS: L.bigRank.get(i) || null,
    industry12mReturn: r4(indRet(sicOf(s))), industryRankOf: myRank >= 0 ? (myRank + 1) + ' of ' + allInd.length : null, themeAtLastQuarterStart: theme,
    revenueTTM_B: r4(rev ? rev.val / 1e9 : null), revenuePeriodEnd: rev ? rev.end : null, revenueGrowthTTM: r4(revGAt(cik, d)), quarterlyYoY: gr ? gr.g.map(r4) : null, growthRising: gr ? gr.rising : null,
    grossMarginTTM: r4(gm), netIncomeTTM_B: r4(ni ? ni.val / 1e9 : null), priceToSales: r4(ps), priceToSales5yMedian: r4(median(hist.map(z => z.ps))), priceToEarnings: r4(pe), priceToEarnings5yMedian: r4(median(hist.map(z => z.pe))), valuationMonths: hist.length,
    insiderBuys90d: ins.slice(0, 6).map(b => ({ filed: b[1], traded: b[4], usd: b[3] })), insiderUsd90d: ins.reduce((a, b) => a + b[3], 0),
    returnAfter126: after(126), returnAfter252: after(252), returnToLatest: r4(CC(i, T - 1) / close - 1), latest: D[T - 1], tipRuleSignals: sigHits }; }
const RECON = LIGHT ? (PREV.reconstruction || {}) : {}; if (!LIGHT) { const at = (s, from, to, mode) => { const i = SY.get(s); let best = -1; for (let t = 0; t < T; t++) { if (D[t] < from || D[t] > to) continue; const v = CC(i, t); if (!(v > 0)) continue; if (best < 0 || (mode === 'min' ? v < CC(i, best) : false)) best = t; } return best; };
  const firstOn = (d) => D.findIndex(x => x >= d);
  if (SY.has('NVDA')) { const tLow = at('NVDA', '2025-01-01', '2025-12-31', 'min'), t90 = (() => { let b = -1; for (let t = 0; t < T; t++) if (D[t] >= '2025-01-01' && D[t] <= '2025-12-31' && CC(SY.get('NVDA'), t) <= 100 && b < 0) b = t; return b; })();
    RECON.NVDA = { dates: [tLow >= 0 && snapshot('NVDA', tLow, 'NVDA lowest close of 2025 (the "about 90 USD" call)'), t90 >= 0 && t90 !== tLow && snapshot('NVDA', t90, 'NVDA first close under 100 USD in 2025')].filter(Boolean), existingRules: EXIST.NVDA, fromLists: fromLists('NVDA') }; }
  if (SY.has('INTC')) { const i = SY.get('INTC'), tLow = at('INTC', '2025-01-01', '2025-12-31', 'min'), tLow24 = at('INTC', '2024-07-01', '2024-12-31', 'min'), tGov = firstOn('2025-08-22');
    RECON.INTC = { dates: [tLow24 >= 0 && snapshot('INTC', tLow24, 'INTC lowest close of the second half of 2024'), tLow >= 0 && snapshot('INTC', tLow, 'INTC lowest close of 2025'), tGov >= 0 && snapshot('INTC', tGov, 'INTC on the US government stake (22 Aug 2025)')].filter(Boolean),
      existingRules: EXIST.INTC, fromLists: fromLists('INTC'), eightK2025: ((await eightK(symCik('INTC'))) || []).filter(f => f.d >= '2024-06-01').map(f => f.d + ' ' + f.form + ' items ' + f.items) }; }
  if (RECON.NVDA) RECON.NVDA.eightK2025 = ((await eightK(symCik('NVDA'))) || []).filter(f => f.d >= '2025-01-01').map(f => f.d + ' ' + f.form + ' items ' + f.items);
  W(TC + '/subs.json', SUBS); log('reconstruction: ' + Object.keys(RECON).join(', ')); }

// ================= 6. FREEZE =================
const complete = T >= 1000 && STATUS.pre.ok && STATUS.facts.ok && STATUS.scan.ok && STATUS.funds.ok;
const dataOk = (id) => complete && (!/TURN/.test(id) || STATUS.insider.ok);
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k) && dataOk(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], to: D[T - 1], bar: BAR, ...strip(r) }])), () => true);
// AUD-1: a rule frozen by the pre-audit engine (no yardstick field) keeps its firstRun untouched; its corrected verdict (capBoth, this run) is
// frozen once in correctedRun next to it (first-run.mjs effectiveRuns = what a reader acting on verdicts uses)
const correctedRun = freezeEach(PREV.correctedRun, Object.fromEntries(Object.keys(FROZEN).filter(k => FROZEN[k].yardstick !== 'capBoth' && RES[k] && dataOk(k)).map(k => { const r = RES[k];
  return [k, correctedEntry({ frozen: FROZEN[k], fixed: { verdict: r.verdict, why: r.why, R: r.results }, asFrozen: r.modes.asFrozen, raw: r.modes.raw, bugs: ['AUD-1'], window: [D[0], D[T - 1]],
    extra: { yardstick: 'capBoth', name: r.name, hold: HOLD, perYear: r.perYear, failures: r.failures, plans: r.plans, signals: r.signals } })]; })), () => true);
const EFF = effectiveRuns(firstRun, correctedRun);

// ================= 7. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const scanned = new Set(lines.filter(x => x.type === 'day').map(x => x.d)), sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id));
const newLines = [], sigIds = new Set(sigLines.map(x => x.id)), toScan = []; for (let t = 0; t < T; t++) if (D[t] >= START && !scanned.has(D[t])) toScan.push(t);
const firstAfter = (d) => { const k = D.findIndex(x => x > d); return k < 0 ? undefined : k; };
const openKey = new Set(); for (const x of sigLines) if (!resolved.has(x.id)) openKey.add(x.m + '|' + x.sym);
for (const t of toScan) { const a = dipSignals(t), b = themeSignals(t), c = await turnFinal(turnPrelim(t)), all = { ...a, ...b, ...c };
  for (const id of IDS) for (const z of all[id] || []) { const sym = SYMS[z.i], key = id + '|' + sym; if (openKey.has(key)) continue; const lid = id + '|' + sym + '|' + D[t]; if (sigIds.has(lid)) continue;
    const entryDate = t + 1 < T ? D[t + 1] : nextSession(D[t]);
    const line = { type: 'signal', id: lid, m: id, sym, d: D[t], close: r4(C[z.i * T + t]), halal: halal(sym), hold: HOLD, info: Object.fromEntries(Object.entries(z.info || {}).map(([k, v]) => [k, typeof v === 'number' ? r4(v) : v])),
      plan: 'buy 1 unit at the open of ' + entryDate + '; add 0.5 unit at the next open after a close 15% under the first buy; sell all if the position is worth 65% or less of the money in (35% stop on the total); else sell at the close of session ' + HOLD, entryDate, recordedAfter: D[T - 1] };
    sigIds.add(lid); openKey.add(key); newLines.push(line); sigLines.push(line); } }
for (const t of toScan) newLines.push({ type: 'day', d: D[t] });
const board = {}, today = {};
for (const x of sigLines) { const k = tOf.get(x.entryDate); if (k === undefined) { x._state = 'waiting'; continue; } const i = SY.get(x.sym), r = i === undefined ? null : runPlan(ser(i), k, { ...PLAN, partial: true }); if (!r) { x._state = 'waiting'; continue; }
  x._k = k; x._r = r; if (r.kind === 'open') { x._state = 'open'; continue; } x._state = 'closed'; x._c = weighted(r.units, r.x, r.at, (kIn, xx, at) => ctrlRet(kIn, xx, at));
  if (!resolved.has(x.id)) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[r.x], kind: r.kind, units: r.units.length, moneyIn: r4(r.w), g: r4(r.g), net: r4(r.g - COST), avgStock: x._c === null ? null : r4(x._c - COST) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
for (const id of IDS) { const mine = sigLines.filter(x => x.m === id), closed = mine.filter(x => x._state === 'closed').map(x => ({ d: x.d, sym: x.sym, g: capG(x._r.g), c: x._c, halal: x.halal })), fr = EFF[id], st = boardStats(closed);
  board[id] = { name: RULES[id].name, hold: HOLD, signals: mine.length, waiting: mine.filter(x => x._state === 'waiting').length, open: mine.filter(x => x._state === 'open').length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: paperReady(st), fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  today[id] = { name: RULES[id].name, hold: HOLD, tier: fr ? fr.verdict : null, newSignals: mine.filter(x => x.recordedAfter === D[T - 1]).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, buy: D[x._k], units: x._r.units.length, sinceBuy: r4(x._r.g), stopPending: !!x._r.stopPending })) }; }
const NOTE = 'PAPER ONLY. The tipster-style rules (TIP-*) record forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a TRADABLE SMALL / PROVEN frozen 5-year verdict (data/tipster-lab.json firstRun) or 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost. Hold 252 sessions (about 12 months), one add of 0.5 unit at -15%, 35% stop on the total. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.';
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, note: NOTE, methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: scanned ' + toScan.length + ' new session(s); ' + newLines.filter(x => x.type === 'signal').length + ' new signals; ' + sigLines.length + ' in all');

// ================= 8. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'tipster-core.mjs RULES + data/strategy-library.json TIP-* (24 Oct 2026, before any run)', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, stress: STRESS, hold: HOLD, complete, data: STATUS, diagnostics: DIAGS,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost per unit of money, better than the average liquid stock over the same unit-weighted days, better than the same stocks with the same plan on their other days, > 0 without the 2 best, block t >= ' + TIER2_T + ' (63-session blocks; 12-month holds overlap so t is optimistic) -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN; plus return per year of capital tied up above the S&P 500 (SPY) over the same days in both halves',
  plan: 'REGISTERED: 1 unit at the next open, +0.5 unit after a close 15% under the first buy, 35% stop on the total, 252 sessions. Information plans on the same entries: ONCE (no add), FORGET (no add, no stop), MONTHLY (+0.1 unit every 21 sessions)',
  firstRun, correctedRun, effectiveNote: 'readers acting on verdicts use first-run.mjs effectiveRuns(firstRun, correctedRun)', latest: LIGHT ? PREV.latest : latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }), themes: LIGHT ? PREV.themes : themeLog, reconstruction: RECON,
  trades: LIGHT ? PREV.trades : Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, r.trades])), light: LIGHT || undefined };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = EFF[id]; if (!e || !r || (e.result && !(r.corrected && !e.result.corrected))) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.to || (r.window || [])[1]); e.study = 'tipster-lab.mjs -> data/tipster-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock],
      perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], why: r.why, ...(r.corrected ? { corrected: true, bugs: r.bugs } : {}) }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('tipster-lab: library not updated: ' + e.message); }
console.log('TIPSTER LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + (complete ? '' : ' | INCOMPLETE: ' + Object.entries(STATUS).filter(([, s]) => s && s.ok === false).map(([k]) => k).join(', ')) + ' | ' + Object.entries(STATUS).map(([k, s]) => k + (s.ok === false ? ' MISSING' : ' ok')).join(', '));
