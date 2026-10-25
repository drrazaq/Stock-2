// DECODED LAB (23 Oct 2026; owner: "study how people won on past trades and try to implement them on future trades; don't fixate on
// passing all the tests"; batch 2 the same day: "7 is far too few: study more, dig"). Research + a FORWARD PAPER lane; never places an
// order; no Telegram. Rules: decoded-core.mjs (batch 1, DEC-*) and decoded2-core.mjs (batch 2, DEC2-*), each pre-registered in its
// header and in its library entry before any run.
// 1. PRICES: the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY, dead stocks' later prices in
//    its x rows) + the sessions since that run, fetched here from Massive's grouped daily bars (same filters as leaders-study.mjs: common
//    stocks / ADRs on its ticker list, main rows 3 USD+ and 1M USD+ traded) + splits executed since the cache day (same jump check) + QQQ
//    daily bars (the Kullamagi market filter). Nothing is saved back to the cache.
//    Batch 2 also reads (all READ ONLY, all optional; a method whose data is missing records nothing and freezes nothing):
//    data/shares.json.gz (SEC share counts, known 30 days after their date: DEC2-STINE, DEC2-CONTRACT market value), ev-cache/events-cache
//    .json.gz (SEC 8-K items with acceptance times: DEC2-CONTRACT), study-cache/insider/*.json (Form 4 open-market buys: DEC2-INSQ) and
//    value-cache/facts.json.gz (SEC companyfacts compacted by value-lab.mjs: the B-FCF1 check of DEC2-INSQ).
// 2. PAPER LANE (every weekday after the close): every session from 23 Oct 2026 on is scanned once; each new signal is appended to
//    data/decoded-paper.jsonl (signal day, the frozen trigger / stop numbers, the owner's ZAD halal mark); every signal is then re-walked
//    with its method's own entry and exit on the newest prices, and a result line is appended once when it resolves. The 56 versions
//    built on batch-1 entries (DEC2-X-*, DEC2-F-*) share ONE line per base signal (field ms = the versions it opened, b = the frozen base
//    numbers). Writes data/decoded-today.json and data/decoded-board.json (per method, after 0.8% cost: trades, distinct days, distinct
//    stocks, win rate, average, average win, average loss, profit factor; TRY SMALL readiness = 30+ trades on 10+ days, average > 0).
// 3. 5-YEAR ONE-SHOT (only for methods not yet frozen, or HISTORY=1 for monitoring): every signal of the 5 years with the same entries and
//    exits, judged at the system's tier-2 standard (value-core.mjs judge: both halves = signals before / from 2024-01-01, positive after
//    0.8% and 1.2%, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its other
//    days, positive without its 2 best, block t >= 2.5; PROVEN at the proof bar) + DEC-CRASH's control gate. First complete verdict
//    frozen (first-run.mjs freezeEach) in data/decoded-history.json; information only: it does NOT block the paper lane. Methods with a
//    market filter are also run once WITHOUT it (shown next to the verdict, not judged). data/decoded-history.json carries `versions`
//    (every version and shadow run), which league.mjs adds to the luck-bar count.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { tradeG, yardPush, yardMean, correctedEntry } from './yardstick.mjs';
import { halfStat, judge, r4, TIER2_T, fcfCheck } from './value-core.mjs';
import { secNY } from './sec-time.mjs';
import { METHODS, COST, liquid, regimeUp, aboveSma, rsScore, detectQBO, detectEP, detectMB, detectVCP, detectPB, detectCrash, crashControl,
  frogRow, frogPick, simulate, boardStats, trySmallReady } from './decoded-core.mjs';
import { METHODS2, NEEDS_DATA2, ind2, simulate2, baseSignal, baseNums } from './decoded2-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const START = env.PAPER_START || '2026-10-23', SPLIT = '2024-01-01', PAPER = 'data/decoded-paper.jsonl', TODAY = 'data/decoded-today.json', BOARD = 'data/decoded-board.json', HIST = 'data/decoded-history.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ALL = { ...METHODS, ...METHODS2 }, IDS = Object.keys(ALL), M2 = (m) => METHODS2[m], t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
const GROUPED = (m) => !!(M2(m) && M2(m).mk);   // derived versions on a batch-1 entry: one paper line per base signal
fs.mkdirSync('data', { recursive: true });
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('decoded-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
// ---- Massive (paid plan), same call pattern as leaders-study.mjs; the key is only read from the environment, never printed
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 150); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403) return { refused: true };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
// ---- 1. fresh sessions since the cache day
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(); let fresh = [];
for (let ms = Date.parse(cacheLast) + 864e5; ms <= Date.now(); ms += 864e5) { const d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions fetched: ' + (fresh.join(', ') || 'none') + (env.MASSIVE_KEY ? '' : ' (no MASSIVE_KEY)'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), H = new Float32Array(N).fill(NaN), L = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN);
const MAIN = new Uint8Array(N);   // 1 = a main (qualifying) row: entries only from these
D.forEach((d, t) => { const x = store.days[d]; const put = (r, main) => { for (let j = 0; j < r.T.length; j++) { const i = SY.get(r.T[j]); if (i === undefined) continue; const k = i * T + t; if (!main && MAIN[k]) continue;
    O[k] = r.o[j]; H[k] = r.h ? r.h[j] : r.c[j]; L[k] = r.l ? r.l[j] : r.c[j]; C[k] = r.c[j]; V[k] = r.v[j]; if (main) MAIN[k] = 1; } };
  put(x, true); if (x.x) put(x.x, false); });
store = null;
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS);
// ---- splits since the cache day (Massive's official split list): repair rows before the split when the price jump matches the ratio
const splitList = (J('data/splits.json', {}).splits || []).slice();
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'); const rows = j && Array.isArray(j.results) ? j.results : [];
  let fixed = 0; for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f; splitList.push({ s, d, r }); const i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue;
    let pre = null, post = null; for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; H[q] /= r; L[q] /= r; C[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const splitFactor = (sym, after) => splitList.filter(z => z.s === sym && z.d > after && z.d <= D[T - 1]).reduce((a, z) => a * z.r, 1);
// ---- calendar: week ends, week starts, month position
const WKEND = new Uint8Array(T), WS = new Int32Array(T), MON = new Uint8Array(T), MIDX = new Int16Array(T), MLEFT = new Int16Array(T);
{ const wk = (d) => { const ms = Date.parse(d), dow = (new Date(ms).getUTCDay() + 6) % 7; return iso(ms - dow * 864e5); }; let ws = 0;
  for (let t = 0; t < T; t++) { if (t && wk(D[t]) !== wk(D[t - 1])) ws = t; WS[t] = ws; WKEND[t] = t === T - 1 ? (new Date(Date.parse(D[t])).getUTCDay() === 5 ? 1 : 0) : wk(D[t + 1]) !== wk(D[t]) ? 1 : 0;
    MON[t] = +D[t].slice(5, 7); MIDX[t] = t && D[t - 1].slice(0, 7) === D[t].slice(0, 7) ? MIDX[t - 1] + 1 : 1; }
  // sessions left in the month; for the newest month the sessions still to come are counted from the weekday calendar minus NYSE holidays
  const HOL = new Set(['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24']);
  let ahead = 0; for (let ms = Date.parse(D[T - 1]) + 864e5; iso(ms).slice(0, 7) === D[T - 1].slice(0, 7); ms += 864e5) { const wd = new Date(ms).getUTCDay(); if (wd && wd !== 6 && !HOL.has(iso(ms))) ahead++; }
  for (let t = T - 1; t >= 0; t--) MLEFT[t] = t < T - 1 && D[t + 1].slice(0, 7) === D[t].slice(0, 7) ? MLEFT[t + 1] + 1 : t === T - 1 ? ahead : 0; }
const indOf = (S) => { const I = ind2(S); I.wkEnd = WKEND; I.mon = MON; I.mIdx = MIDX; I.mLeft = MLEFT; return I; };
// ---- market context per session
const series = (i) => { const b = i * T; return { o: O.subarray(b, b + T), h: H.subarray(b, b + T), l: L.subarray(b, b + T), c: C.subarray(b, b + T), v: V.subarray(b, b + T) }; };
const spyI = SY.get('SPY'), spyC = spyI !== undefined ? series(spyI).c : new Float32Array(T).fill(NaN);
const qqq = new Float64Array(T).fill(NaN); let qqqSrc = 'QQQ (Massive daily bars)';
{ const j = await api('/v2/aggs/ticker/QQQ/range/1/day/' + D[0] + '/' + D[T - 1] + '?adjusted=true&sort=asc&limit=50000');
  if (j && Array.isArray(j.results)) for (const b of j.results) { const t = tOf.get(iso(b.t)); if (t !== undefined) qqq[t] = b.c; }
  if (!(qqq.filter(x => x > 0).length > T * 0.9)) { qqqSrc = 'SPY (QQQ bars not available this run)'; for (let t = 0; t < T; t++) qqq[t] = spyC[t]; } }
const REG = new Uint8Array(T), SPYUP = new Uint8Array(T), SPY150 = new Uint8Array(T), SPY200 = new Uint8Array(T), BR = new Float64Array(T).fill(NaN), Q1020 = new Uint8Array(T);
for (let t = 0; t < T; t++) { REG[t] = regimeUp(qqq, t) ? 1 : 0; SPYUP[t] = aboveSma(spyC, t, 50) ? 1 : 0; SPY150[t] = aboveSma(spyC, t, 150) ? 1 : 0; SPY200[t] = aboveSma(spyC, t, 200) ? 1 : 0;
  if (t >= 20) { let a = 0, b = 0, b1 = 0; for (let k = t - 9; k <= t; k++) a += qqq[k]; for (let k = t - 19; k <= t; k++) b += qqq[k]; for (let k = t - 20; k <= t - 1; k++) b1 += qqq[k]; Q1020[t] = a / 10 > b / 20 && b > b1 ? 1 : 0; } }
{ const up = new Float64Array(T), dn = new Float64Array(T); for (let i = 0; i < NS; i++) { const b = i * T; for (let t = 1; t < T; t++) { const k = b + t; if (!MAIN[k] || !(C[k] >= 5) || !(V[k] >= 1e5) || !(C[k - 1] > 0)) continue; const r = C[k] / C[k - 1] - 1; if (r >= 0.04) up[t]++; else if (r <= -0.04) dn[t]++; } }
  for (let t = 9; t < T; t++) { let u = 0, d = 0; for (let k = t - 9; k <= t; k++) { u += up[k]; d += dn[k]; } BR[t] = d > 0 ? u / d : u > 0 ? 9 : NaN; } }
log('QQQ regime from ' + qqqSrc + '; regime up on ' + REG.reduce((a, x) => a + x, 0) + ' of ' + T + ' sessions');
// ---- pass 1: liquidity flags, relative strength percentile, frog rows on formation days (first session of each month), breadth for the
// strong market filter (% of liquid stocks above their 50-day; new 52-week highs vs lows)
const LIQ = new Uint8Array(N), RS = new Float32Array(N).fill(NaN), RSP = new Float32Array(N).fill(NaN);
const FORM = new Set(); for (let t = 1; t < T; t++) if (D[t].slice(0, 7) !== D[t - 1].slice(0, 7)) FORM.add(t);
const frogRows = new Map(); for (const t of FORM) frogRows.set(t, []);
const A50 = new Float64Array(T), NL50 = new Float64Array(T), NH = new Float64Array(T), NLO = new Float64Array(T);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const S = series(i), I = indOf(S), b = i * T;
  for (let t = 0; t < T; t++) { if (!MAIN[b + t] || !liquid(S, I, t)) continue; LIQ[b + t] = 1; RS[b + t] = rsScore(S.c, t); if (FORM.has(t)) { const f = frogRow(S, I, t); if (f) frogRows.get(t).push({ key: i, ...f }); }
    if (I.sma50[t] > 0) { NL50[t]++; if (S.c[t] > I.sma50[t]) A50[t]++; } }
  // 52-week highs / lows (rolling over the previous 251 sessions, monotonic queues)
  const qh = [], ql = []; for (let t = 0; t < T; t++) { const hh = S.h[t], ll = S.l[t];
    while (qh.length && qh[0] < t - 251) qh.shift(); while (ql.length && ql[0] < t - 251) ql.shift();
    if (t >= 251 && LIQ[b + t] && qh.length && ql.length) { if (hh > S.h[qh[0]]) NH[t]++; if (ll < S.l[ql[0]]) NLO[t]++; }
    if (hh > 0) { while (qh.length && !(S.h[qh[qh.length - 1]] > hh)) qh.pop(); qh.push(t); } if (ll > 0) { while (ql.length && !(S.l[ql[ql.length - 1]] < ll)) ql.pop(); ql.push(t); } } }
for (let t = 252; t < T; t++) { const v = []; for (let i = 0; i < NS; i++) { const k = i * T + t; if (LIQ[k] && isFinite(RS[k])) v.push([i, RS[k]]); } v.sort((a, b) => a[1] - b[1]); v.forEach(([i], j) => { RSP[i * T + t] = v.length > 1 ? j / (v.length - 1) : NaN; }); }
const FROG = new Map(); for (const [t, rows] of frogRows) if (rows.length >= 100) FROG.set(t, new Set(frogPick(rows, 0.3, 30).map(x => x.key)));
const FROGNOW = new Int32Array(T).fill(-1); { let f = -1; for (let t = 0; t < T; t++) { if (FROG.has(t)) f = t; FROGNOW[t] = f; } }
const STRONG = new Uint8Array(T); for (let t = 0; t < T; t++) STRONG[t] = Q1020[t] && NL50[t] > 0 && A50[t] / NL50[t] > 0.5 && NH[t] > NLO[t] ? 1 : 0;
log('pass 1 done: liquidity, relative strength, ' + FROG.size + ' frog formations; strong market on ' + STRONG.reduce((a, x) => a + x, 0) + ' sessions');
// ---- batch-2 data (read only, optional)
const firstOnOrAfter = (d) => { let a = 0, b = T; while (a < b) { const m = (a + b) >> 1; if (D[m] < d) a = m + 1; else b = m; } return a; };
const SH = JZ('data/shares.json.gz', null), symCik = (s) => SH && SH.t ? (SH.t[s] || SH.t[s.replace(/\./g, '-')] || null) : null;
const sharesAt = (s, t) => { const cik = symCik(s), a = cik && SH.c ? SH.c[cik] : null; if (!a) return null; const lim = iso(Date.parse(D[t]) - (SH.lagDays || 30) * 864e5); let v = null; for (const [e, n] of a) { if (e <= lim) v = n; else break; } return v; };
const EVC = JZ(env.EV_CACHE || 'ev-cache/events-cache.json.gz', null), CONTRACT = new Map(); let EVOK = false;
if (EVC && EVC.syms) { let n = 0; for (const [sym, S] of Object.entries(EVC.syms)) { if (!SY.has(sym) || !S || !S.old || !Array.isArray(S.ev)) continue; const a = [];
    for (const e of S.ev) { if (!String(e.f || '').split(',').includes('CONTRACT')) continue; const ny = secNY(e.p); if (!ny) continue; let t = firstOnOrAfter(ny.d); if (ny.hm && ny.hm >= '16:00' && D[t] === ny.d) t++; if (t < T) a.push(t); }
    if (a.length) { CONTRACT.set(sym, a); n += a.length; } } EVOK = n > 100; log('8-K 1.01 events: ' + n + ' on ' + CONTRACT.size + ' stocks' + (EVOK ? '' : ' (not enough: DEC2-CONTRACT not run)')); }
else log('no SEC event cache: DEC2-CONTRACT not run');
const IDIR = (env.CACHE_DIR || 'study-cache') + '/insider', INSQ = new Map(); let INSOK = false;
try { const P = {}; let n = 0; for (const f of fs.readdirSync(IDIR).filter(f => f.endsWith('.json'))) for (const b of J(IDIR + '/' + f, [])) { if (!SY.has(b[0]) || !(+b[3] > 0)) continue; (P[b[0]] = P[b[0]] || []).push({ d: b[1], who: b[2], usd: +b[3] }); n++; }
  for (const [sym, a] of Object.entries(P)) { a.sort((x, y) => x.d < y.d ? -1 : 1); let last = '0'; const m = new Map();
    for (const p of a) { if (p.d <= last) continue; const from = iso(Date.parse(p.d) - 5 * 864e5), w = a.filter(z => z.d >= from && z.d <= p.d), who = new Set(w.map(z => z.who)), usd = w.reduce((s, z) => s + z.usd, 0);
      if (who.size >= 2 && usd > 2e5) { const t = firstOnOrAfter(p.d); if (t < T) m.set(t, { n: who.size, usd }); last = iso(Date.parse(p.d) + 30 * 864e5); } }
    if (m.size) INSQ.set(sym, m); }
  INSOK = n > 1000; log('insider buys: ' + n + '; quality-size clusters on ' + INSQ.size + ' stocks'); } catch (e) { log('no insider cache: DEC2-INSQ not run'); }
const FX = JZ((env.VALUE_CACHE || 'value-cache') + '/facts.json.gz', null), FCFOK = !!(FX && FX.c && Object.keys(FX.c).length > 500);
if (!FCFOK) { INSOK = false; log('no value-lab SEC facts cache: DEC2-INSQ not run (needs the B-FCF1 check)'); }
const TAGS = { cfo: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'], capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], cogs: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'],
  inv: ['InventoryNet'], eq: ['StockholdersEquity'], debt: ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings'] };
const coMemo = new Map(), coOf = (s) => { const cik = symCik(s); if (!cik || !FX) return null; if (coMemo.has(cik)) return coMemo.get(cik); const c = FX.c[String(cik)]; let r = null;
  if (c) { const m = (tags) => { const o = {}; for (const t of tags) if (c[t]) o[t] = c[t].map(([s, e, v, f]) => ({ s, e, v, f })); return o; }; r = { cfo: m(TAGS.cfo), capex: m(TAGS.capex), rev: m(TAGS.rev), cogs: m(TAGS.cogs), inv: m(TAGS.inv), eq: m(TAGS.eq), debt: m(TAGS.debt) }; }
  coMemo.set(cik, r); return r; };
const fcfOkAt = (sym, t, px) => { const co = coOf(sym), sh = sharesAt(sym, t); return !!(co && sh > 0 && fcfCheck(co, D[t], px, sh).ok); };
const dataOk = (m) => { const n = M2(m) && M2(m).needs; return n === 'ev' ? EVOK : n === 'ins' ? INSOK : true; };
// ---- the detectors, one call per method (ctx built once per stock and session)
const ctxOf = (i, t, S, nf) => { const k = i * T + t, sym = SYMS[i]; return { regime: REG[t] === 1, spyUp: SPYUP[t] === 1, spy150: SPY150[t] === 1, spy200: SPY200[t] === 1, breadth: BR[t], strong: STRONG[t] === 1,
  rsPct: RSP[k], rsPrev: t ? RSP[k - 1] : NaN, wkEnd: WKEND[t] === 1, ws: WS[t], spyC, frogIn: FROGNOW[t] >= 0 && FROG.get(FROGNOW[t]).has(i), nf: !!nf, memo: {},
  get shares() { return sharesAt(sym, t); }, get mcap() { const s = sharesAt(sym, t); return s > 0 ? s * S.c[t] : null; },
  contract: (CONTRACT.get(sym) || []).some(z => z <= t && z >= t - 2), insq: (INSQ.get(sym) || new Map()).get(t) || null, fcfOk: () => fcfOkAt(sym, t, S.c[t]) }; };
const detect = (id, S, I, i, t, ctx) => { const k = i * T + t; if (!MAIN[k]) return null; const m2 = M2(id);
  if (m2) { if (!!m2.spyOnly !== (i === spyI) || !dataOk(id)) return null; return m2.detect(S, I, t, ctx); } if (i === spyI) return null;
  switch (id) { case 'DEC-QBO': return detectQBO(S, I, t, { regime: REG[t] === 1 }); case 'DEC-EP': return detectEP(S, I, t); case 'DEC-MB': return detectMB(S, I, t, { breadth: BR[t] });
    case 'DEC-VCP': return detectVCP(S, I, t, { spyUp: SPYUP[t] === 1, rsPct: RSP[k] }); case 'DEC-PB': return detectPB(S, I, t); case 'DEC-CRASH': return detectCrash(S, I, t);
    case 'DEC-FROG': return FROG.has(t) && FROG.get(t).has(i) ? { entry: 'open', info: { formation: D[t] } } : null; } return null; };
const sim = (m, S, I, t, sig, last) => M2(m) ? simulate2(M2(m), S, I, t, sig, last) : simulate(METHODS[m].engine, S, I, t, sig, last);
// halal marks (owner's ZAD list)
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';

// ================= 2. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const scanned = new Set(lines.filter(x => x.type === 'day').map(x => x.d)), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id));
// a grouped line (ms + b) opens one signal per version, each rebuilt from the frozen base numbers
const expand = (x) => x.ms ? x.ms.map(m => ({ ...x, m, id: m + '|' + x.sym + '|' + x.d, sig: M2(m).mk(x.b) })) : [x];
const signals = lines.filter(x => x.type === 'signal').flatMap(expand).filter(x => ALL[x.m]);
const PRICE_KEYS = ['trigger', 'cancelBelow', 'stop', 'base', 'fill', 'stopAtr', 'lowCap', 'target', 'P', 'pl', 'N', 'atr'];
const scale = (sig, f) => { if (f === 1) return sig; const s = { ...sig }; for (const k of PRICE_KEYS) if (typeof s[k] === 'number') s[k] = s[k] / f;
  if (s.targets) s.targets = s.targets.map(z => ({ ...z, px: z.px / f })); if (s.entrySkip) s.entrySkip = { ...s.entrySkip, lowRef: s.entrySkip.lowRef / f }; return s; };
const walk = (x) => { const i = SY.get(x.sym), t = tOf.get(x.d); if (i === undefined || t === undefined) return { state: 'unknown', why: 'no prices for the signal day' };
  const S = series(i); let r = { ...sim(x.m, S, indOf(S), t, scale(x.sig, splitFactor(x.sym, x.d))), t };
  if (x.hypo) r = { ...r, hypo: true, state: r.state === 'closed' ? 'skipped' : r.state === 'open' || r.state === 'pending' ? 'hypothetical' : r.state, why: 'Turtle skip rule: the last breakout won' + (r.state === 'closed' ? ' (hypothetical ' + pc(r.g - COST) + ')' : '') };
  return r; };
const busy = new Map(), lastWin = new Map();   // m|sym -> index until which a new signal is not taken; m|sym -> did the last breakout win
for (const x of signals) { const r = walk(x), key = x.m + '|' + x.sym; const until = ['pending', 'open', 'hypothetical'].includes(r.state) ? Infinity : r.x !== undefined ? r.x : r.state === 'closed' ? r.x : -1; busy.set(key, Math.max(busy.get(key) ?? -1, until));
  if (r.x !== undefined && typeof r.g === 'number') lastWin.set(key, r.g > 0); }
const toScan = []; for (let t = 0; t < T; t++) if (D[t] >= START && !scanned.has(D[t])) toScan.push(t);
const newLines = [], capped = {}, market = (t) => ({ qqqUp: REG[t] === 1, spyAbove50: SPYUP[t] === 1, strong: STRONG[t] === 1, breadth10: r4(BR[t]) });
const planOf = (s) => s.entry === 'stop' ? 'buy-stop at ' + r4(s.trigger) + ' for ' + s.valid + ' session(s)' : s.entry === 'close' ? 'bought at the close (' + r4(s.fill ?? NaN) + ')' : s.entry === 'today' ? 'filled during the session at ' + r4(s.fill) + ' (resting order)' : 'buy at the next open';
const freeze = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== 'info').map(([k, v]) => [k, typeof v === 'number' ? r4(v) : Array.isArray(v) ? v.map(z => typeof z === 'object' ? Object.fromEntries(Object.entries(z).map(([a, b]) => [a, typeof b === 'number' ? r4(b) : b])) : z) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([a, b]) => [a, typeof b === 'number' ? r4(b) : b])) : v]));
// PAPER CAP (pre-registered with batch 2, 23 Oct 2026): at most PAPER_CAP new signals per method (per base signal for the grouped
// versions) per session, the most liquid first (20-day traded value), so the ledger stays a readable size; the 5-year test is not capped;
// batch 1 (DEC-*) keeps its uncapped paper lane as registered.
const PAPER_CAP = 10;
for (const t of toScan) { const cand = new Map();   // m (or 'base:' + base) -> [{ i, dv, sig, ms }]
  for (let i = 0; i < NS; i++) { if (!MAIN[i * T + t]) continue; const S = series(i), I = indOf(S), ctx = ctxOf(i, t, S), groups = {};
    for (const m of IDS) { const key = m + '|' + SYMS[i]; if ((busy.get(key) ?? -1) >= t) continue; const sig = detect(m, S, I, i, t, ctx); if (!sig) continue;
      if (GROUPED(m)) { const base = M2(m).base; (groups[base] = groups[base] || []).push(m); continue; }
      (cand.get(m) || cand.set(m, []).get(m)).push({ i, dv: I.dv20[t], sig, S }); }
    for (const [base, ms] of Object.entries(groups)) { const b = baseSignal(base, S, I, t, ctx), n = baseNums(b, I, t); if (n) (cand.get('base:' + base) || cand.set('base:' + base, []).get('base:' + base)).push({ i, dv: I.dv20[t], b, n, ms, S }); } }
  for (const [m, arr] of cand) { const cap = m.startsWith('base:') || M2(m) ? PAPER_CAP : Infinity; arr.sort((a, z) => (z.dv || 0) - (a.dv || 0));   // batch 1 keeps its uncapped paper lane
    for (const c of arr.slice(0, cap)) { const { i, S } = c, sym = SYMS[i];
      if (c.ms) { const line = { type: 'signal', ms: c.ms, base: m.slice(5), sym, d: D[t], close: r4(S.c[t]), b: freeze({ ...c.n, info: undefined }), halal: halal(sym), market: market(t) }; line.b.info = c.b.info;
        newLines.push(line); for (const x of expand(line)) { signals.push(x); const r = walk(x); busy.set(x.m + '|' + sym, ['pending', 'open'].includes(r.state) ? Infinity : r.x !== undefined ? r.x : t); } continue; }
      const key = m + '|' + sym, { info, ...rest } = c.sig, hypo = M2(m) && M2(m).skipIfLastWin && lastWin.get(key) === true;
      const line = { type: 'signal', id: m + '|' + sym + '|' + D[t], m, sym, d: D[t], close: r4(S.c[t]), sig: freeze(rest), info, halal: halal(sym), market: market(t), entryPlan: planOf({ ...rest, fill: rest.fill ?? S.c[t] }), ...(hypo ? { hypo: true } : {}) };
      newLines.push(line); signals.push(line); const r = walk(line); busy.set(key, ['pending', 'open', 'hypothetical'].includes(r.state) ? Infinity : r.x !== undefined ? r.x : t); if (r.x !== undefined && typeof r.g === 'number') lastWin.set(key, r.g > 0); }
    if (arr.length > cap) capped[m] = (capped[m] || 0) + arr.length - cap; }
  newLines.push({ type: 'day', d: D[t], signals: newLines.filter(x => x.type === 'signal' && x.d === D[t]).reduce((a, x) => a + (x.ms ? x.ms.length : 1), 0) }); }
// resolve every signal on the newest prices
// (25 Oct 2026, coordinator, for the COMEBACK board) each resolved paper trade also records the AVERAGE STOCK over the same sessions:
// the same yardstick as the 5-year run (every 4th liquid stock, bought at the entry session's open, or its close for a close entry, sold
// at the exit session's close; 50+ stocks), every gross return capped at +300% (capBoth, AUD-1); avgStock = that return - 0.8% cost.
// Information only: the rules, entries, exits, g / net and the frozen results are unchanged.
const paperCtrl = (k, x, atClose) => { const v = []; for (let i = 0; i < NS; i += 4) { if (!LIQ[i * T + (atClose ? k : k - 1)]) continue; const e = atClose ? C[i * T + k] : O[i * T + k]; let y = NaN;
  for (let q = x; q >= k && !(y > 0); q--) y = C[i * T + q]; if (e > 0 && y > 0) yardPush(v, y / e - 1, 'capBoth'); } return yardMean(v, 50); };
const live = [], board = {}, today = {};
for (const x of signals) { const r = walk(x); live.push({ x, r });
  if (['closed', 'cancelled', 'expired', 'skipped'].includes(r.state) && !resolved.has(x.id)) { resolved.add(x.id);
    newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, state: r.state, why: r.why || null, ...(r.state === 'closed' ? { buy: D[r.k], fill: r4(r.fill), sell: D[r.x], g: r4(r.g), net: r4(r.g - COST), avgStock: (() => { const c = r.k >= 1 ? paperCtrl(r.k, r.x, ((x.sig && x.sig.entry) || '') === 'close') : null; return c === null ? null : r4(c - COST); })(), ...(M2(x.m) ? { last: r.legs[r.legs.length - 1][3] } : { legs: r.legs.map(([j, q, p, w]) => [D[j], q, p, w]) }) } : {}) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
const HISTF = J(HIST, {}), lastD = D[T - 1];
for (const m of IDS) { const mine = live.filter(z => z.x.m === m), closed = mine.filter(z => z.r.state === 'closed').map(z => ({ d: z.x.d, sym: z.x.sym, g: z.r.g, halal: z.x.halal }));
  const all = boardStats(closed), okH = boardStats(closed.filter(z => z.halal === 'ok')), fr = (HISTF.firstRun || {})[m];
  board[m] = { name: ALL[m].name, who: ALL[m].who, engine: ALL[m].engine || 'generic (decoded2-core.mjs)', batch: M2(m) ? 2 : 1, signals: mine.length, pending: mine.filter(z => z.r.state === 'pending').length, open: mine.filter(z => z.r.state === 'open').length,
    cancelledOrExpired: mine.filter(z => ['cancelled', 'expired', 'skipped'].includes(z.r.state)).length, closed: all, halalOk: okH, trySmallReady: trySmallReady(all), trySmallReadyHalal: trySmallReady(okH),
    openMarkAvg: r4(mean(mine.filter(z => z.r.state === 'open').map(z => z.r.g - COST)) ?? NaN),
    closedPlusOpenMarked: boardStats([...closed, ...mine.filter(z => z.r.state === 'open').map(z => ({ d: z.x.d, sym: z.x.sym, g: z.r.g }))]),
    ...(M2(m) && M2(m).needs && !dataOk(m) ? { dataMissing: 'its data (' + M2(m).needs + ') was not available this run: nothing recorded' } : {}),
    note: 'trend methods close their losers first (tight stops) and keep winners open; read closed together with closedPlusOpenMarked', fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  const brief = GROUPED(m);
  today[m] = { newSignals: brief ? mine.filter(z => z.x.d === lastD).length : mine.filter(z => z.x.d === lastD).map(z => ({ sym: z.x.sym, halal: z.x.halal, close: z.x.close, plan: z.x.entryPlan, stop: z.x.sig.stop ?? z.x.sig.base ?? null, info: z.x.info, ...(z.x.hypo ? { skipRule: 'Turtle skip rule: recorded, not taken' } : {}) })),
    pendingBuyStops: brief ? mine.filter(z => z.r.state === 'pending' && z.x.d < lastD).length : mine.filter(z => z.r.state === 'pending' && z.x.d < lastD).map(z => ({ sym: z.x.sym, halal: z.x.halal, since: z.x.d, trigger: z.x.sig.trigger, cancelBelow: z.x.sig.cancelBelow })),
    open: brief ? mine.filter(z => z.r.state === 'open').length : mine.filter(z => z.r.state === 'open').map(z => ({ sym: z.x.sym, halal: z.x.halal, signal: z.x.d, buy: D[z.r.k], fill: r4(z.r.fill), last: r4(z.r.mark), sinceBuy: r4(z.r.g), held: r4(z.r.held), stop: r4(z.r.stop), note: z.r.why })) }; }
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: lastD, paperStart: START, market: { qqqUp: REG[T - 1] === 1, qqqSource: qqqSrc, spyAbove50: SPYUP[T - 1] === 1, strong: STRONG[T - 1] === 1, breadth10: r4(BR[T - 1]) },
  note: 'PAPER ONLY. Decoded trader methods recording live (batch 1 from 26 Oct 2026, batch 2 from the first session after it was added). Nothing here is a buy until a method has 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost (then the TRY SMALL lane may consider it). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy. Versions built on batch-1 entries (DEC2-X-*, DEC2-F-*) show counts only.',
  methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: lastD, paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', paperCap: 'at most ' + PAPER_CAP + ' new signals per method (per base signal for DEC2-X / DEC2-F) per session, most liquid first; the 5-year test is not capped', cappedThisRun: capped, methods: board, needsData: NEEDS_DATA2 }, null, 1));
log('paper lane: scanned ' + toScan.length + ' new session(s) (' + toScan.map(t => D[t]).join(', ') + '); ' + newLines.filter(x => x.type === 'signal').length + ' new signal lines; ' + signals.length + ' signals in all' + (Object.keys(capped).length ? '; over the cap of ' + PAPER_CAP + ' a day (not recorded): ' + Object.entries(capped).map(([k, v]) => k + ' ' + v).join(', ') : ''));
for (const m of IDS) { const b = board[m]; if (!b.signals && GROUPED(m)) continue; console.log('- ' + m + ': signals ' + b.signals + ', pending ' + b.pending + ', open ' + b.open + ', closed ' + b.closed.n + ' avg ' + pc(b.closed.avg) + (Array.isArray(today[m].newSignals) ? ' | today ' + today[m].newSignals.map(z => z.sym + (z.halal === 'ok' ? '' : '(' + z.halal + ')')).join(' ') : ' | today ' + today[m].newSignals)); }

const HIST_END = T - 1, liqSample = []; for (let t = 0; t < T; t++) { const a = []; for (let i = 0; i < NS; i += 4) if (LIQ[i * T + t]) a.push(i); liqSample.push(a); }
// the average liquid stock (sampled every 4th) bought at the open of k (or the close of k for close entries) and sold at the close of x
// mode (engine audit AUD-1, yardstick.mjs): 'asFrozen' = the frozen runs (stocks of +300% or more dropped); 'capBoth' = corrected; 'raw'
const cMemo = new Map(), ctrlSpan = (k, x, atClose, mode = 'asFrozen') => { const key = ((k * 4096 + x) * 2 + (atClose ? 1 : 0)) + mode; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqSample[atClose ? k : k - 1] || []) { const e = atClose ? C[i * T + k] : O[i * T + k]; let y = NaN; for (let q = x; q >= k && !(y > 0); q--) y = C[i * T + q]; if (e > 0 && y > 0) yardPush(v, y / e - 1, mode); }
  const m = yardMean(v, 50); cMemo.set(key, m); return m; };
// ================= CHECK (monitoring only; never a verdict) =================
// CHECK=TPS (added 23 Oct 2026 after DEC2-TPS was frozen PROVEN): the frozen run scores each TPS trade per dollar INVESTED (10% to 100%
// of the budget). This check re-scores the same trades per dollar of BUDGET (profit / the full planned position, cost charged on the money
// actually traded) and runs one execution variant (first 10% bought at the NEXT OPEN instead of the signal close; adds and exit unchanged).
// Written to data/decoded-check.json. It does not touch firstRun or the library.
if (env.CHECK === 'TPS') { const m = 'DEC2-TPS', blk = M2(m).block, out = { budget: [], invested: [], nextOpen: [] };
  for (let i = 0; i < NS; i++) { if (i === spyI) continue; const S = series(i), I = indOf(S), b = i * T; let free = -1, free2 = -1;
    for (let t = 130; t < T - 1; t++) { if (!MAIN[b + t]) continue; const sig = (free < t || free2 < t) ? detect(m, S, I, i, t, ctxOf(i, t, S)) : null; if (!sig) continue;
      if (free < t) { const r = sim(m, S, I, t, sig, T - 1); if (r.state === 'closed') { free = r.x; const c = ctrlSpan(r.k, r.x, true); if (c !== null) { const half = D[t] < SPLIT ? 'older' : 'newer', base = { t, s: SYMS[i], k: r.k, x: r.x, half };
            out.invested.push({ ...base, g: r.g, c }); out.budget.push({ ...base, g: r.inv * (r.g - COST) + COST, c: r.inv * (c - COST), inv: r.inv }); } } else if (r.state === 'open') free = Infinity; }
      if (free2 < t) { const r = sim(m, S, I, t, { ...sig, entry: 'open' }, T - 1); if (r.state === 'closed') { free2 = r.x; const c = ctrlSpan(r.k, r.x, false); if (c !== null) out.nextOpen.push({ t, s: SYMS[i], k: r.k, x: r.x, half: D[t] < SPLIT ? 'older' : 'newer', g: r.inv * (r.g - COST) + COST, c: r.inv * (c - COST) }); } else if (r.state === 'open') free2 = Infinity; } } }
  const sum = (a) => ({ older: halfStat(a.filter(z => z.half === 'older'), blk), newer: halfStat(a.filter(z => z.half === 'newer'), blk), last12m: halfStat(a.filter(z => D[z.t] >= iso(Date.parse(D[T - 1]) - 365 * 864e5)), blk) });
  const res = { generatedAt: new Date().toISOString(), label: 'MONITORING CHECK ONLY: not a verdict; DEC2-TPS firstRun stays as frozen', note: 'budget = profit per dollar of the FULL planned position (10/20/30/40 scale-in), cost on money traded; nextOpen = same, first buy at the next open; vsOwn not computed for these',
    avgInvested: r4(mean(out.budget.map(z => z.inv))), invested: sum(out.invested), budget: sum(out.budget), nextOpen: sum(out.nextOpen) };
  fs.writeFileSync('data/decoded-check.json', JSON.stringify(res, null, 1)); for (const k of ['invested', 'budget', 'nextOpen']) console.log('CHECK TPS ' + k + ': older ' + JSON.stringify(res[k].older) + ' | newer ' + JSON.stringify(res[k].newer) + ' | 12m ' + JSON.stringify(res[k].last12m));
  process.exit(0); }
// ================= ENGINE AUDIT (24 Oct 2026; yardstick.mjs) =================
// DEC-FROG (the decoded rule in TRY SMALL) re-run ONCE on its frozen window, exactly as the one-shot below walks it, with the yardstick
// fixed (AUD-1: trades and the average stock capped at +300% alike; the same-stock-other-days yardstick, uncapped in the frozen run,
// capped the same way). Written to correctedRun in data/decoded-history.json next to firstRun (never over it).
const CORR = { ...(HISTF.correctedRun || {}) };
for (const m of ['DEC-FROG']) { const fr = (HISTF.firstRun || {})[m]; if (!fr || !fr.results || CORR[m]) continue; const end = tOf.get(String((fr.window || [])[1]));
  if (end === undefined) { log('audit ' + m + ': frozen window end not in the data; not corrected'); continue; }
  const base = []; for (let i = 0; i < NS; i++) { if (i === spyI) continue; const S = series(i), I = indOf(S), b = i * T; let free = -1; const mine = [];
    for (let t = 130; t < end; t++) { if (!MAIN[b + t] || free >= t) continue; const sig = detect(m, S, I, i, t, ctxOf(i, t, S)); if (!sig) continue; const r = sim(m, S, I, t, sig, end);
      if (r.state === 'pending' || r.state === 'open') { free = Infinity; continue; } if (r.state !== 'closed') { free = t + (sig.valid || 0); continue; } free = r.x;
      mine.push({ t, s: SYMS[i], i, k: r.k, x: r.x, g0: r.g, atClose: sig.entry === 'close', half: D[t] < SPLIT ? 'older' : 'newer' }); }
    if (!mine.length) continue; const mark = new Int32Array(T + 2); for (const z of mine) { mark[z.k]++; mark[z.x + 1]--; }
    const cov = new Int32Array(T + 2); let run = 0; for (let q = 0; q <= T; q++) { run += mark[q]; cov[q + 1] = cov[q] + (run > 0 ? 1 : 0); }
    const own = new Map(); for (const z of mine) { const len = z.x - z.k + 1, ck = len + '|' + z.half; if (!own.has(ck)) { const v = [];
        for (let u = 131; u + len < end; u += 10) { if ((D[u] < SPLIT) !== (z.half === 'older') || !LIQ[b + u - 1] || cov[Math.min(T, u + len) + 1] - cov[u] > 0) continue; const e = O[b + u], y = C[b + u + len - 1]; if (e > 0 && y > 0) v.push(y / e - 1); }
        own.set(ck, v); } z.ownV = own.get(ck); base.push(z); } }
  const blk = ALL[m].block, runM = (mode) => { const tr = []; for (const z of base) { const c = ctrlSpan(z.k, z.x, z.atClose, mode); if (c === null) continue;
      const ov = mode === 'capBoth' ? z.ownV.map(x => tradeG(x, mode)) : z.ownV; tr.push({ ...z, g: tradeG(z.g0, mode), c, own: ov.length >= 3 ? mean(ov) : null }); }
    const R = { older: halfStat(tr.filter(z => z.half === 'older'), blk), newer: halfStat(tr.filter(z => z.half === 'newer'), blk), all: halfStat(tr, blk) }; return { ...judge(R, { bar: fr.bar }), R }; };
  CORR[m] = correctedEntry({ frozen: fr, fixed: runM('capBoth'), asFrozen: runM('asFrozen'), raw: runM('raw'), bugs: ['AUD-1'], window: [D[0], D[end]], extra: { block: blk } });
  const c = CORR[m]; log('AUDIT ' + m + ': frozen ' + fr.verdict + ' -> corrected ' + c.verdict + ' (reproduced: ' + c.reproduced.matchesFrozen + ') | older edge ' + pc(fr.results.older.edge) + ' -> ' + pc(c.results.older.edge) + ' | newer edge ' + pc(fr.results.newer.edge) + ' -> ' + pc(c.results.newer.edge));
  const h = J(HIST, {}); h.correctedRun = CORR; fs.writeFileSync(HIST, JSON.stringify(h)); }
// ================= 3. 5-YEAR ONE-SHOT =================
const LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0);
const need = IDS.filter(m => !(HISTF.firstRun || {})[m]), NF = need.filter(m => M2(m) && M2(m).mkt);   // NF: shadow runs without the market filter
const VERSIONS = IDS.length + IDS.filter(m => M2(m) && M2(m).mkt).length + 1;   // + 1: the DEC2-TPS next-open check
if (!need.length && !env.HISTORY) { const h = J(HIST, {}); if (h.versions !== VERSIONS) { h.versions = VERSIONS; fs.writeFileSync(HIST, JSON.stringify(h)); } log('5-year one-shot: every method frozen; skipped (HISTORY=1 for a monitoring run)'); process.exit(0); }
const RUNS = [...need.map(m => [m, m, false]), ...NF.map(m => [m + '~nf', m, true])], TR = Object.fromEntries(RUNS.map(([k]) => [k, []])), CTRL = [];
for (let i = 0; i < NS; i++) { const S = series(i), I = indOf(S), b = i * T, free = Object.fromEntries(RUNS.map(([k]) => [k, -1])), mine = Object.fromEntries(RUNS.map(([k]) => [k, []])), won = {};
  const runs = RUNS.filter(([, m]) => i === spyI ? !!(M2(m) && M2(m).spyOnly) : !(M2(m) && M2(m).spyOnly)); if (!runs.length) continue;
  for (let t = 130; t < HIST_END; t++) { if (!MAIN[b + t]) continue; const ctx = ctxOf(i, t, S), ctxNF = NF.length ? { ...ctx, nf: true } : null;
    for (const [key, m, nf] of runs) { if (free[key] >= t) continue; const sig = detect(m, S, I, i, t, nf ? ctxNF : ctx); if (!sig) continue; const r = sim(m, S, I, t, sig, HIST_END);
      if (r.state === 'pending' || r.state === 'open') { free[key] = Infinity; continue; } if (r.state !== 'closed') { free[key] = t + (sig.valid || 0); continue; } free[key] = r.x;
      if (M2(m) && M2(m).skipIfLastWin) { const w = won[key]; won[key] = r.g > 0; if (w === true) continue; }   // Turtle skip rule: the skipped breakout still sets "last breakout"
      const atClose = sig.entry === 'close', c = ctrlSpan(r.k, r.x, atClose); if (c === null) continue;
      const z = { t, s: SYMS[i], i, k: r.k, x: r.x, g: r.g, c, atClose, half: D[t] < SPLIT ? 'older' : 'newer', adr: sig.adr ?? I.adr20[t], qqqUp: REG[t] === 1 }; TR[key].push(z); mine[key].push(z); }
    if (need.includes('DEC-CRASH') && i !== spyI) { const cs = crashControl(S, I, t); if (cs && MAIN[b + t]) { const r = simulate('CRASH', S, I, t, cs, HIST_END); if (r.state === 'closed') CTRL.push({ t, g: r.g, adr: cs.adr }); } } }
  // the same stock on its other days (open of u to close of u + len - 1, every 10th session where it was liquid the day before, away from this method's trades)
  // (cov = prefix count of sessions covered by this method's trades in this stock: a window [u, u + len] overlaps a trade iff it covers one)
  for (const key of Object.keys(mine)) { const arr = mine[key]; if (!arr.length) continue; const mark = new Int32Array(T + 2); for (const z of arr) { mark[z.k]++; mark[z.x + 1]--; }
    const cov = new Int32Array(T + 2); let run = 0; for (let q = 0; q <= T; q++) { run += mark[q]; cov[q + 1] = cov[q] + (run > 0 ? 1 : 0); }
    const own = new Map();
    for (const z of arr) { const len = z.x - z.k + 1, ck = len + '|' + z.half; if (own.has(ck)) { z.own = own.get(ck); continue; } const v = [];
      for (let u = 131; u + len < HIST_END; u += 10) { if ((D[u] < SPLIT) !== (z.half === 'older') || !LIQ[b + u - 1] && i !== spyI || cov[Math.min(T, u + len) + 1] - cov[u] > 0) continue; const e = O[b + u], y = C[b + u + len - 1]; if (e > 0 && y > 0) v.push(y / e - 1); }
      z.own = v.length >= 3 ? mean(v) : null; own.set(ck, z.own); } } }
log('5-year signals walked: ' + RUNS.map(([k]) => k + ' ' + TR[k].length).join(', '));
const RES = {}, last12 = iso(Date.parse(D[T - 1]) - 365 * 864e5), last6 = iso(Date.parse(D[T - 1]) - 183 * 864e5);
const brief = (h) => h && h.n ? { n: h.n, days: h.days, avg: h.avg, avgStress: h.avgStress, edge: h.edge, tBlock: h.tBlock, win: h.win, noTop2: h.noTop2 } : { n: 0 };
for (const m of need) { const tr = TR[m], blk = ALL[m].block, R = { older: halfStat(tr.filter(z => z.half === 'older'), blk), newer: halfStat(tr.filter(z => z.half === 'newer'), blk), all: halfStat(tr, blk) }, extra = [];
  if (m === 'DEC-CRASH') { for (const h of ['older', 'newer']) { const a = [], b = []; for (const z of tr.filter(q => q.half === h)) { const cc = CTRL.filter(q => q.t === z.t && q.adr > 0 && z.adr > 0 && Math.abs(q.adr / z.adr - 1) <= 0.25); if (cc.length) { a.push(z.g); b.push(mean(cc.map(q => q.g))); } }
      R[h].vsControl = { n: a.length, rule: r4(mean(a) ?? NaN), control: r4(mean(b) ?? NaN) }; if (!(a.length && mean(a) > mean(b))) extra.push('not better than crashed stocks still making lower lows in the ' + h + ' half (' + pc(mean(a)) + ' vs ' + pc(mean(b)) + ', ' + a.length + ' matched)'); } }
  const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  const shape = { trades: tr.length, win: r4(w.length / (tr.length || 1)), avgWin: r4(mean(w) ?? NaN), avgLoss: r4(mean(l) ?? NaN), payoff: l.length && w.length ? r4(mean(w) / -mean(l)) : null, pf: l.length ? r4(sum(w) / -sum(l)) : null,
    avg: r4(mean(net) ?? NaN), median: R.all.median ?? null, avgSessions: r4(mean(tr.map(z => z.x - z.k + 1)) ?? NaN),
    qqqUp: halfStat(tr.filter(z => z.qqqUp), blk), qqqDown: halfStat(tr.filter(z => !z.qqqUp), blk), last6m: halfStat(tr.filter(z => D[z.t] >= last6), blk), last12m: halfStat(tr.filter(z => D[z.t] >= last12), blk),
    byYear: Object.fromEntries([...new Set(tr.map(z => D[z.t].slice(0, 4)))].sort().map(y => { const v = tr.filter(z => D[z.t].slice(0, 4) === y).map(z => z.g - COST); return [y, { n: v.length, avg: r4(mean(v)), win: r4(v.filter(x => x > 0).length / v.length) }]; })) };
  if (TR[m + '~nf']) { const q = TR[m + '~nf']; shape.noFilter = { filter: M2(m).mkt, all: brief(halfStat(q, blk)), older: brief(halfStat(q.filter(z => z.half === 'older'), blk)), newer: brief(halfStat(q.filter(z => z.half === 'newer'), blk)), last12m: brief(halfStat(q.filter(z => D[z.t] >= last12), blk)) }; }
  RES[m] = { ...judge(R, { bar: BAR, extra }), results: R, shape, block: blk, split: SPLIT, cost: COST, dataOk: dataOk(m), trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) }; }
const complete = T >= 1000 && qqqSrc.startsWith('QQQ'), strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(HISTF.firstRun, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[HIST_END]], bar: BAR, ...strip(r) }])), (r) => complete && r.dataOk !== false);
fs.writeFileSync(HIST, JSON.stringify({ generatedAt: new Date().toISOString(), preRegistered: 'decoded-core.mjs header + decoded2-core.mjs header + data/strategy-library.json DEC-* / DEC2-* (each before its first run)', window: [D[0], D[HIST_END]], bar: BAR, complete, qqqSource: qqqSrc,
  versions: VERSIONS, versionsNote: 'every version run once (batch 1 + batch 2) plus the no-market-filter shadow runs; league.mjs adds this to the luck-bar count',
  standard: 'both halves (signals before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its other days, > 0 without the 2 best, block t >= ' + TIER2_T + ' -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN',
  data: { eightK: EVOK, insiders: INSOK, secFacts: FCFOK, shares: !!SH },
  firstRun, correctedRun: CORR, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: { ...(HISTF.trades || {}), ...Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, r.trades.slice(-(M2(k) && M2(k).family ? 300 : 1500))])) } }));
console.log('DECODED 5-YEAR ONE-SHOT ' + D[0] + ' to ' + D[HIST_END] + ' | bar ' + BAR + (complete ? '' : ' | INCOMPLETE (nothing frozen)'));
for (const [m, r] of Object.entries(RES)) { const f = (h) => h.n + ' (' + h.days + ' days) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock;
  console.log('- ' + m + ': ' + r.verdict + (r.dataOk ? '' : ' (DATA MISSING: not frozen)') + ' | older ' + f(r.results.older) + ' | newer ' + f(r.results.newer) + ' | win ' + pc(r.shape.win) + ' avgWin ' + pc(r.shape.avgWin) + ' avgLoss ' + pc(r.shape.avgLoss) + ' payoff ' + r.shape.payoff + ' pf ' + r.shape.pf + ' days ' + r.shape.avgSessions + ' | 12m ' + r.shape.last12m.n + ' ' + pc(r.shape.last12m.avg) + (r.shape.noFilter ? ' | no filter ' + r.shape.noFilter.all.n + ' ' + pc(r.shape.noFilter.all.avg) : '')); }
// library: the frozen verdict only (status stays the paper-lane status)
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const m of IDS) { const e = LB && LB.strategies.find(x => x.id === m), r = firstRun[m]; if (!e || !r || e.result) continue; const R = r.results;
    e.tested = String(r.window[1]); e.study = 'decoded-lab.mjs -> data/decoded-history.json (run once as written, first complete run frozen; information only, the paper lane runs regardless)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: r.shape.win, avgWin: r.shape.avgWin, avgLoss: r.shape.avgLoss, pf: r.shape.pf, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('decoded-lab: library not updated: ' + e.message); }
