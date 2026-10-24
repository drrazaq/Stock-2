// SQUAD 7 LAB: WINNER DNA (24 Oct 2026; the owner's squads 5-8). Research + a FORWARD PAPER lane; never places an order; no Telegram.
// Spec: squad7-core.mjs header. Two stages, run separately:
//   SQ7_MODE=dna  STAGE 1 discovery on the OLDER half only (labels must end before 2024-01-01): matched case-control lift tables for
//                 W20 (+30% in 20 sessions) and W120 (+100% in 120 sessions) -> data/squad7-dna.json. Run once (refuses to overwrite).
//                 Nothing is judged, nothing is traded, no newer-half price is read by the discovery.
//   default       STAGE 2: the SQ7-* rules (squad7-core.mjs RULES, registered after stage 1 and before any newer-half number) are written
//                 into data/strategy-library.json, then each rule not yet frozen gets its ONE 5-year test (value-core judge; halves = signal
//                 before / from 2024-01-01; AUD-1 capped yardstick); first complete verdict frozen in data/squad7-lab.json firstRun
//                 (first-run.mjs freezeEach). Then the PAPER lane from Monday 26 Oct 2026: data/squad7-paper.jsonl, squad7-today.json
//                 (methods[id] = { name, hold, newSignals: [{ sym, close, halal }] }), squad7-board.json.
// DATA (GitHub Actions only; keys only from secrets, never printed; official APIs / public files only):
//   prices   = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY; o/h/l/c/v; dead stocks' later
//              prices in its x rows) + the sessions since from Massive grouped daily bars + splits since the cache day.
//   sector   = SIC code (the cache's, else data/sec-ciks.json), 2-digit. shares = data/shares.json.gz (split-repaired, 30 days late).
//   earnings = the Nasdaq earnings calendar day files already cached by the anomaly lab / Agent A (anomaly-cache, a-cache: READ ONLY) and
//              this lab's own cache (squad7-cache) for days neither has.
// DIAG=1: coverage only.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, TIER2_T } from './value-core.mjs';
import { ownAverage, nextSession } from './squad1-core.mjs';
import { COST, SPLIT, PAPER_START, W20, W120, CONTROLS, POP_EVERY, FEATURES, PRICE_FEATURES, DESCRIBE, RULES, IDS, ruleOk, mean, r4, capG, halfOf, labelSeries, episodeStarts, cellKey, looseKey,
  pickN, priceFeatures, sectorFeatures, sharesChange, sharesAt, splitFix, earnFeatures, liftTable, bestQuintile, pairTable, boardStats, paperReady, preRegister } from './squad7-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com';
const SC = env.SQ7_CACHE || 'squad7-cache', OUT = 'data/squad7-lab.json', DNA = 'data/squad7-dna.json', PAPER = 'data/squad7-paper.jsonl', TODAY = 'data/squad7-today.json', BOARD = 'data/squad7-board.json', LIB = 'data/strategy-library.json';
const MODE = env.SQ7_MODE || 'rules', DIAG = !!env.DIAG, START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ7_MINUTES || 280) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};
log('squad 7 lab, mode ' + MODE + (DIAG ? ' (DIAG)' : '') + '; rules registered ' + IDS.length + ', frozen ' + Object.keys(FROZEN).length);
if (MODE === 'dna' && fs.existsSync(DNA) && !DIAG) { console.log('squad7-lab: stage 1 already done (' + DNA + ' exists); discovery runs once'); process.exit(0); }
if (MODE !== 'dna' && !IDS.length) { console.log('squad7-lab: no SQ7 rule registered yet (stage 1 first); nothing done'); process.exit(0); }

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (MODE !== 'dna' && !DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ7 entries written now'); }

// ================= 1. PRICES =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad7-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
if (MODE !== 'dna') for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6 || DIAG) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const OA = new Float32Array(N).fill(NaN), HA = new Float32Array(N).fill(NaN), LA = new Float32Array(N).fill(NaN), CA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
let xDays = 0, hlMissing = 0;
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; MAIN[k] = 1; if (x.h && x.l) { HA[k] = x.h[j]; LA[k] = x.l[j]; } else hlMissing++; }
  if (x.x) { xDays++; for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o[j]; VA[k] = x.x.v ? x.x.v[j] : NaN; if (x.x.h && x.x.l) { HA[k] = x.x.h[j]; LA[k] = x.x.l[j]; } } } });
const SIC0 = store.sic || {}; store = null;
if (MODE !== 'dna' && !DIAG) { const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; HA[q] /= r; LA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), tSplit = D.findIndex(d => d >= SPLIT);
STATUS.price = { ok: T > 1000 && spyI !== undefined && tSplit > 300, sessions: T, from: D[0], to: D[T - 1], stocks: NS, xDays, hlMissing };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks, x rows on ' + xDays + ' days, first ' + SPLIT + ' session index ' + tSplit + ')');
// liquid (main rows): close >= 5 USD and 20-session average traded value >= 5M USD
const LIQ = new Uint8Array(N), DV20 = new Float32Array(N).fill(NaN);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN; if (isFinite(w)) { s -= w; n--; } }
    if (t >= 19 && n === 20) { DV20[b + t] = s / 20; if (CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } } }
const liqMemo = new Map(), liqList = (t) => { if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const everLiq = []; for (let i = 0; i < NS; i++) { for (let t = 0; t < T; t++) if (LIQ[i * T + t]) { everLiq.push(i); break; } }
const closeAt = (i, x, k) => { for (let q = x; q >= k; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1) return null; const e = OA[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const cMemo = new Map(); const ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
const sub = (A, i) => A.subarray(i * T, i * T + T), spyC = sub(CA, spyI);

// ================= 2. SECTOR, SHARES, EARNINGS =================
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {}, c: {} });
const secOf = (s) => { const x = SIC0[s]; if (x && x.c) return String(x.c).padStart(4, '0').slice(0, 2); const y = SECCIK[s]; return y && y[1] ? String(y[1]).padStart(4, '0').slice(0, 2) : null; };
const SEC = SYMS.map(secOf);
STATUS.sector = { ok: true, everLiquid: everLiq.length, withSector: everLiq.filter(i => SEC[i]).length };
const symCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(a); const y = SECCIK[s]; return y ? String(y[0]) : null; };
const shMemo = new Map(), shRows = (i) => { if (!shMemo.has(i)) { const c = symCik(SYMS[i]), a = c && SH.c[c] && SH.c[c].length ? splitFix(SH.c[c]) : null; shMemo.set(i, a); } return shMemo.get(i); };
STATUS.shares = { ok: Object.keys(SH.c).length > 3000, companies: Object.keys(SH.c).length, everLiquidMapped: everLiq.filter(i => shRows(i)).length };
// Nasdaq earnings calendar: [sym, time, actual, estimate] per day file
const REP = new Map(); { const today = iso(Date.now()); let have = 0, miss = 0, fetched = 0; const NQH = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
  const usd = (s) => { const x = parseFloat(String(s || '').replace(/[$,()]/g, '')); return isFinite(x) ? (/\(/.test(String(s)) ? -x : x) : null; };
  const lastD = MODE === 'dna' ? D[tSplit - 1] : D[T - 1];
  for (const d of D) { if (d > lastD) break; let rows = null; for (const dir of [SC, 'anomaly-cache', 'a-cache']) { rows = J(dir + '/nasdaq/' + d + '.json', null); if (rows) break; }
    if (!rows && !DIAG && left() > 200 * 60e3 && d < today) { await sleep(local(env.NASDAQ_BASE) ? 0 : 350); fetched++; let j = null;
      try { const r = await fetch(NQ + '/api/calendar/earnings?date=' + d, { headers: NQH, signal: AbortSignal.timeout(30000) }); j = r.ok ? await r.json() : null; } catch (e) {}
      if (j && j.data) { rows = (j.data.rows || []).map(x => { const s = String(x.symbol || '').trim(); return /^[A-Z]{1,5}$/.test(s) ? [s, x.time === 'time-pre-market' ? 'bmo' : x.time === 'time-after-hours' ? 'amc' : null, usd(x.eps), usd(x.epsForecast)] : null; }).filter(Boolean); W(SC + '/nasdaq/' + d + '.json', rows); } }
    if (!rows) { miss++; continue; } have++; for (const r of rows) { const a = REP.get(r[0]) || REP.set(r[0], []).get(r[0]); a.push({ d, a: r[2], e: r[3] }); } }
  for (const a of REP.values()) a.sort((x, y) => x.d < y.d ? -1 : 1);
  STATUS.earn = { ok: miss <= (have + miss) * 0.05, days: have + miss, missing: miss, fetchedNow: fetched, symbols: REP.size }; log('earnings calendar: ' + JSON.stringify(STATUS.earn)); }

// ================= 3. FEATURES (every value known at the close of t) =================
const FT = new Map();   // i -> { feature: Float32Array(T) } for every stock ever liquid
for (const i of everLiq) FT.set(i, priceFeatures({ o: sub(OA, i), h: sub(HA, i), l: sub(LA, i), c: sub(CA, i), v: sub(VA, i) }, spyC));
log('price features for ' + FT.size + ' stocks');
const RS = new Map(), BR = new Map(); for (const i of everLiq) { RS.set(i, new Float32Array(T).fill(NaN)); BR.set(i, new Float32Array(T).fill(NaN)); }
const spyR20 = (t) => { const a = spyC[t], b = t >= 20 ? spyC[t - 20] : NaN; return a > 0 && b > 0 ? a / b - 1 : NaN; };
for (let t = 0; t < T; t++) { const rows = liqList(t).map(i => ({ i, sec: SEC[i], r63: FT.get(i).r63[t], r20: FT.get(i).r20[t] })), m = sectorFeatures(rows, spyR20(t));
  for (const [i, x] of m) { RS.get(i)[t] = x.rsSec; BR.get(i)[t] = x.breadthSec; } }
log('sector features done');
function featAt(i, t) { const F = FT.get(i), f = {}; for (const k of PRICE_FEATURES) f[k] = F[k][t]; f.rsSec = RS.get(i)[t]; f.breadthSec = BR.get(i)[t];
  const rows = shRows(i), d = D[t]; f.dShares = rows ? sharesChange(rows, d) : NaN; const sh = rows ? sharesAt(rows, d) : null; f.logMcap = sh > 0 && CA[i * T + t] > 0 ? Math.log10(sh * CA[i * T + t]) : NaN;
  const e = earnFeatures(REP.get(SYMS[i]), d); f.earnDays = e.earnDays; f.surprise = e.surprise; return f; }
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';

if (DIAG) { W('data/squad7-diag.json', { generatedAt: new Date().toISOString(), mode: MODE, data: STATUS, sample: featAt(everLiq[0], T - 1) }); console.log('SQUAD 7 DIAG ' + JSON.stringify(STATUS)); process.exit(0); }

// ================= 4A. STAGE 1: DISCOVERY (older half only) =================
if (MODE === 'dna') {
  const out = { generatedAt: new Date().toISOString(), stage: 1, note: 'DISCOVERY ON THE OLDER HALF ONLY: every case, look-alike and population row has its whole label window before ' + SPLIT + '. Nothing here is a verdict. Lift = how much more often the decile holds a winner than the matched sample overall; popWin / popLose / popFwd = whole-market winner rate, loser rate and average forward return (entry open to the window\'s last close, capped at +300%) of liquid stock-days in that decile.',
    window: [D[0], D[tSplit - 1]], data: STATUS, describe: DESCRIBE, horizons: {} };
  for (const [name, H] of [['W20', W20], ['W120', W120]]) {
    const lastSig = tSplit - 1 - H.len; const L = new Map(); for (const i of everLiq) L.set(i, labelSeries(sub(OA, i), sub(CA, i), H));
    const elig = (i) => (t) => t >= 0 && t <= lastSig && LIQ[i * T + t] === 1 && L.get(i).known[t] === 1;
    const casesByT = new Map(); let nCases = 0; for (const i of everLiq) for (const t of episodeStarts(L.get(i).win, elig(i), H.len)) { (casesByT.get(t) || casesByT.set(t, []).get(t)).push(i); nCases++; }
    const rows = [], caseList = []; let noCtrl = 0, loose = 0;
    for (const [t, cs] of [...casesByT].sort((a, b) => a[0] - b[0])) { const cells = new Map(), lcells = new Map();
      for (const i of liqList(t)) { if (!elig(i)(t) || L.get(i).win[t]) continue; const f = FT.get(i), k = cellKey(CA[i * T + t], DV20[i * T + t], f.r20[t], SEC[i]); (cells.get(k) || cells.set(k, []).get(k)).push(i); (lcells.get(looseKey(k)) || lcells.set(looseKey(k), []).get(looseKey(k))).push(i); }
      for (const i of cs) { const f = FT.get(i), k = cellKey(CA[i * T + t], DV20[i * T + t], f.r20[t], SEC[i]); let pool = SEC[i] ? cells.get(k) : null; if (!pool || !pool.length) { pool = lcells.get(looseKey(k)); if (pool && pool.length) loose++; }
        if (!pool || !pool.length) { noCtrl++; continue; } const ctl = pickN(pool, CONTROLS, name + '|' + D[t] + '|' + SYMS[i]);
        rows.push({ y: 1, f: featAt(i, t) }); caseList.push({ s: SYMS[i], d: D[t], fwd: r4(L.get(i).fwd[t]) }); for (const j of ctl) rows.push({ y: 0, f: featAt(j, t) }); } }
    const pop = []; for (let t = 0; t <= lastSig; t++) for (const i of liqList(t)) { if ((i * 31 + t) % POP_EVERY || !elig(i)(t)) continue; const l = L.get(i); pop.push({ win: l.win[t], lose: l.lose[t], fwd: l.fwd[t], f: featAt(i, t) }); }
    const lt = liftTable(rows, pop, FEATURES);
    const med = (k, y) => { const s = rows.filter(r => r.y === y && ok(r.f[k])).map(r => r.f[k]).sort((a, b) => a - b); return s.length ? r4(s[s.length >> 1]) : null; };
    for (const x of lt) { x.medianWinner = med(x.feature, 1); x.medianLookalike = med(x.feature, 0); }
    const top = lt.filter(x => !['r20', 'dv20'].includes(x.feature) && x.strength !== null && x.coverage >= 0.5).slice(0, 12).map(x => bestQuintile(rows, x.feature, x.direction)).filter(Boolean);
    const pairs = pairTable(rows, pop, top);
    out.horizons[name] = { def: H, lastSignal: D[lastSig], cases: rows.filter(r => r.y).length, episodesFound: nCases, controls: rows.filter(r => !r.y).length, casesWithoutLookalike: noCtrl, matchedWithoutSector: loose,
      population: { n: pop.length, winRate: r4(pop.reduce((s, p) => s + p.win, 0) / Math.max(1, pop.length)), loseRate: r4(pop.reduce((s, p) => s + p.lose, 0) / Math.max(1, pop.length)), fwd: r4(mean(pop.filter(p => ok(p.fwd)).map(p => capG(p.fwd)))) },
      features: lt, quintiles: top.map(q => ({ ...q, cut: r4(q.cut) })), pairs, sampleCases: caseList.slice(-60) };
    log(name + ': ' + out.horizons[name].cases + ' winners, ' + out.horizons[name].controls + ' look-alikes, population ' + pop.length);
    for (const x of lt.slice(0, 15)) log('  ' + x.feature.padEnd(10) + ' AUC ' + x.auc + ' ' + x.direction + ' liftTop ' + x.liftTop + ' liftBottom ' + x.liftBottom + ' best: popWin ' + pc(x.bestDecile.popWin) + ' popLose ' + pc(x.bestDecile.popLose) + ' popFwd ' + pc(x.bestDecile.popFwd) + ' (all ' + pc(x.popAll.fwd) + ')');
    for (const p of pairs.slice(0, 10)) log('  PAIR ' + p.pair + ' lift ' + p.lift + ' pop ' + p.pop + ' win ' + pc(p.popWin) + ' lose ' + pc(p.popLose) + ' fwd ' + pc(p.popFwd) + ' vs ' + pc(p.popFwdAll));
    L.clear(); }
  fs.writeFileSync(DNA, JSON.stringify(out, null, 1));
  console.log('SQUAD 7 STAGE 1 written to ' + DNA); process.exit(0); }

// ================= 4B. STAGE 2: 5-YEAR ONE-SHOT =================
const need = IDS.filter(id => !FROZEN[id]), RES = {}, COUNTS = {};
// signals of a rule on sessions [a, b]: liquid at t, every condition met, at most maxPerDay ranked by the registered rank feature
function signalsOf(id, a, b) { const R = RULES[id], out = [];
  for (let t = Math.max(0, a); t <= b; t++) { const hits = []; for (const i of liqList(t)) { const f = featAt(i, t); if (ruleOk(id, f)) hits.push({ i, t, r: f[R.rank[0]] }); }
    hits.sort((p, q) => R.rank[1] === 'high' ? q.r - p.r : p.r - q.r); for (const h of hits.slice(0, R.maxPerDay)) out.push({ ...h, k: t + 1, x: t + R.hold, future: t + 1 > T - 1 }); }
  return out; }
function tradesOf(id, sigs) { const out = [], busyUntil = new Map(), spans = new Map();
  for (const z of sigs) { if (z.x >= T || z.future) continue; if ((busyUntil.get(z.i) ?? -1) >= z.k) continue; const g0 = ret(z.i, z.k, z.x); if (g0 === null || !isFinite(g0)) continue; const g = capG(g0), c = ctrlSpan(z.k, z.x); if (c === null) continue;
    busyUntil.set(z.i, z.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, z.x]); out.push({ t: z.t, s: SYMS[z.i], i: z.i, k: z.k, x: z.x, g, c, half: halfOf(D[z.t]) }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.x - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 253, to: T - 1, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  return out; }
const shapeOf = (tr) => { const net = tr.map(z => z.g - COST), by = {}; tr.forEach((z, k) => { const y = D[z.t].slice(0, 4); (by[y] = by[y] || []).push(net[k]); });
  return { trades: tr.length, win: tr.length ? r4(net.filter(x => x > 0).length / tr.length) : null, byYear: Object.fromEntries(Object.keys(by).sort().map(y => [y, { n: by[y].length, avg: r4(mean(by[y])) }])) }; };
const dataOk = STATUS.price.ok && STATUS.shares.ok && STATUS.earn.ok;
log('5-year one-shot for ' + need.length + ' rules not yet frozen (data ' + (dataOk ? 'ok' : 'INCOMPLETE: ' + JSON.stringify({ shares: STATUS.shares, earn: STATUS.earn })) + ')');
for (const id of need) { const uses = RULES[id].when.map(w => w[0]), needEarn = uses.some(k => k === 'earnDays' || k === 'surprise'), needSh = uses.some(k => k === 'dShares' || k === 'logMcap');
  if (!STATUS.price.ok || (needEarn && !STATUS.earn.ok) || (needSh && !STATUS.shares.ok)) { RES[id] = { verdict: 'NOT RUN', why: 'data not complete this run: ' + JSON.stringify(STATUS).slice(0, 300) }; continue; }
  if (left() < 10 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const sigs = signalsOf(id, 252, T - 1), tr = tradesOf(id, sigs), hold = RULES[id].hold;
  COUNTS[id] = { older: sigs.filter(z => halfOf(D[z.t]) === 'older').length, newer: sigs.filter(z => halfOf(D[z.t]) === 'newer').length };
  const R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) }, v = judge(R, { bar: BAR });
  RES[id] = { ...v, results: R, shape: shapeOf(tr), hold, name: RULES[id].name, rule: RULES[id].rule, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1 corrected: trades and yardstick capped at +300% alike)',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + v.verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + v.why.slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), (r) => r && r.verdict && r.verdict !== 'NOT RUN');

// ================= 5. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const scanned = new Set(lines.filter(x => x.type === 'day').map(x => x.d)), sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id));
const newLines = [], openBy = new Map(), sigIds = new Set(sigLines.map(x => x.id)), lastT = T - 1, fromT = D.findIndex(d => d >= START);
for (const x of sigLines) if (!resolved.has(x.id)) openBy.set(x.m + '|' + x.sym, true);
if (fromT >= 0) { const toScan = []; for (let t = fromT; t <= lastT; t++) if (!scanned.has(D[t])) toScan.push(t);
  for (const id of IDS) for (const t of toScan) for (const z of signalsOf(id, t, t)) { const sym = SYMS[z.i], key = id + '|' + sym; if (openBy.get(key)) continue;
    const entryDate = z.k <= lastT ? D[z.k] : nextSession(D[lastT]), late = t < lastT && z.k <= lastT;
    const line = { type: 'signal', id: id + '|' + sym + '|' + D[t], m: id, sym, d: D[t], close: r4(CA[z.i * T + t]), halal: halal(sym), hold: RULES[id].hold, entryDate, late, recordedAfter: D[lastT],
      plan: (late ? 'LATE (recorded after its entry day): ' : '') + 'buy at the open of ' + entryDate + ', hold ' + RULES[id].hold + ' sessions' };
    if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); }
  for (const t of toScan) newLines.push({ type: 'day', d: D[t] }); }
const board = {}, today = {};
for (const x of sigLines) { const k = tOf.get(x.entryDate); if (k === undefined || k >= T) { x._state = 'waiting'; continue; } const xi = k + x.hold - 1, i = SY.get(x.sym);
  if (xi > T - 1) { x._state = 'open'; x._k = k; x._mark = ret(i, k, T - 1); continue; }
  const g = ret(i, k, xi), c = ctrlSpan(k, xi); x._state = 'closed'; x._g = g; x._c = c; x._k = k;
  if (!resolved.has(x.id) && g !== null) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[xi], g: r4(g), net: r4(capG(g) - COST), avgStock: c === null ? null : r4(c - COST) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
for (const id of IDS) { const mine = sigLines.filter(x => x.m === id), closed = mine.filter(x => x._state === 'closed' && x._g !== null).map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c, halal: x.halal })), fr = firstRun[id], st = boardStats(closed);
  board[id] = { name: RULES[id].name, hold: RULES[id].hold, signals: mine.length, waiting: mine.filter(x => x._state === 'waiting').length, open: mine.filter(x => x._state === 'open').length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: paperReady(st), fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  today[id] = { name: RULES[id].name, hold: RULES[id].hold, tier: fr ? fr.verdict : null, newSignals: mine.filter(x => x.recordedAfter === D[lastT] && newLines.includes(x) && !x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, buy: D[x._k], sinceBuy: r4(x._mark ?? NaN), exitAfter: x.hold + ' sessions' })) }; }
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, note: 'PAPER ONLY. Squad 7 (winner DNA) rules recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a frozen 5-year verdict that meets the TRY SMALL standard (data/squad7-lab.json firstRun) or 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.filter(x => x.type === 'signal').length + ' new signals; ' + sigLines.length + ' in all');

// ================= 6. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), squad: 7, philosophy: 'winner DNA: what was visible before big winners moved, versus matched look-alikes (stage 1 on the older half only: data/squad7-dna.json), turned into rules registered before the newer half was looked at',
  preRegistered: 'squad7-core.mjs RULES (24 Oct 2026, after stage 1, before any newer-half number) + data/strategy-library.json SQ7-*', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS, signalCounts: COUNTS,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= ' + TIER2_T + ' -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN. Gross returns capped at +300% for trades and yardsticks alike (AUD-1).',
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-400)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'squad7-lab.mjs -> data/squad7-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: [R.older.win, R.newer.win], why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad7-lab: library not updated: ' + e.message); }
console.log('SQUAD 7 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + Object.entries(STATUS).map(([k, s]) => k + (s.ok ? ' ok' : ' MISSING')).join(', '));
