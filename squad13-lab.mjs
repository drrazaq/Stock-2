// SQUAD 13 LAB: RUNNER PULLBACKS AND INDUSTRY WAVES AMONG LARGE CAPS (24 Oct 2026). Research + a FORWARD PAPER lane; never places an
// order; no Telegram. Rules: squad13-core.mjs RULES + TH (pre-registered 24 Oct 2026 before any run; library ids SQ13-*; the lab writes
// the same rule text into data/strategy-library.json before computing anything).
// 1. DATA (GitHub Actions only; keys only from secrets, never printed; official sources / licensed APIs, no scraping):
//    prices = the 5-year whole-market cache (study-cache/grouped.json.gz, RESTORED READ ONLY; dead stocks in its x rows) + the sessions
//             since from Massive grouped daily bars + splits since the cache day (squad 6 / squad 8 pattern). SPY from the cache.
//    industry = the cache's SIC (Massive reference), else data/sec-ciks.json. CIK = data/shares.json SEC list, data/sec-ciks.json, Massive
//             reference (active AND delisted common stocks, so dead companies keep their CIK).
//    shares = data/shares.json.gz (SEC cover counts, 30 days late). splits = Massive split list from 2017 (reverse splits).
//    results 8-Ks = SEC submissions API (data.sec.gov) for the industry leaders only (item 2.02, filing date).
//    A source that does not load completely makes ITS rules "NOT RUN" (no verdict frozen); the others run.
// 2. 5-YEAR ONE-SHOT for every rule not yet frozen (value-core judge via hold-core judgeHold: per-year return vs SPY on the same days in
//    both halves; capped yardstick AUD-1). First complete verdict frozen in data/squad13-lab.json firstRun; later runs = monitoring only.
// 3. PAPER LANE from Monday 26 Oct 2026: data/squad13-paper.jsonl, data/squad13-today.json (methods[id].newSignals), data/squad13-board.json.
// DIAG=1: coverage check only (data loaded, signal counts per rule and half), no returns computed, no verdict, no paper line.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { artifactJumps, hasArtifact } from './squad4-core.mjs';
import { runnerAt, splitFix, sharesKnownAt, shareChange, reverseSplitWithin, ownAverage } from './squad8-core.mjs';
import { RULES, IDS, TH, COST, SPLIT, PAPER_START, mean, r4, halfOf, capG, sic3, smaArr, pullbackAfter, supplyPass, waveSessions, topBy, newHigh, firstHighIn, reactionSession, aboveHighBefore,
  followers, perYear, byYear, boardStats, paperReady, preRegister } from './squad13-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SECD = local(env.SEC_DATA_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ13_CACHE || 'squad13-cache', OUT = 'data/squad13-lab.json', PAPER = 'data/squad13-paper.jsonl', TODAY = 'data/squad13-today.json', BOARD = 'data/squad13-board.json', LIB = 'data/strategy-library.json';
const DIAG = !!env.DIAG, START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ13_MINUTES || 150) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0);
log('squad 13 lab' + (DIAG ? ' (DIAG: coverage only, no returns)' : '') + '; frozen already: ' + Object.keys(FROZEN).length + '/' + IDS.length);

// ================= 0. PRE-REGISTRATION in the library (before any computation; idempotent) =================
{ const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ13 entries pre-registered now'); }

// ================= 1. PRICES =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad13-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
async function get(url, opt = {}) { for (let a = 0; a < 3; a++) { try { const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(opt.timeout || 120000) }); if (r.status === 404) return { status: 404, ok: false }; if (r.status === 429 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; } return r; } catch (e) { await sleep(2000 * (a + 1)); } } return null; }
const CS0 = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS0.has(x.T) || x.T === 'SPY' || !CS0.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none') + (env.MASSIVE_KEY ? '' : ' (no MASSIVE_KEY)'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) { const x = store.days[d]; for (const s of x.T) if (!SY.has(s)) SY.set(s, SY.size); if (x.x) for (const s of x.x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; const put = (r, main) => { if (!r || !r.T) return; for (let j = 0; j < r.T.length; j++) { const q = SY.get(r.T[j]); if (q === undefined) continue; const k = q * T + t; if (!main && C[k] > 0) continue; O[k] = r.o ? r.o[j] : NaN; C[k] = r.c[j]; V[k] = r.v ? r.v[j] : NaN; } };
  put(x, true); put(x.x, false); });
const SIC = store.sic || {}; store = null;
{ let j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'); if (!j || j.refused) j = await api('/v3/reference/splits?execution_date.gte=' + cacheLast + '&limit=1000'); const rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; C[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), ser = (A, i) => A.subarray(i * T, i * T + T);
const STATUS = { price: { ok: T > 1000 && spyI !== undefined && [...Array(T).keys()].filter(t => C[spyI * T + t] > 0).length >= T * 0.95, sessions: T, from: D[0], to: D[T - 1], stocks: NS } };
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS + ', SPY ' + (STATUS.price.ok ? 'ok' : 'MISSING'));
// liquidity (close 5+, 20-session average traded value 5M+), 63-session average traded value, last close per stock
const LIQ = new Uint8Array(N), TV63 = new Float32Array(N).fill(NaN), LAST = new Int32Array(NS).fill(-1);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0, s6 = 0, n6 = 0;
  for (let t = 0; t < T; t++) { const v = C[b + t] * V[b + t]; if (C[b + t] > 0) LAST[i] = t;
    if (isFinite(v)) { s += v; n++; s6 += v; n6++; } if (t >= 20) { const w = C[b + t - 20] * V[b + t - 20]; if (isFinite(w)) { s -= w; n--; } } if (t >= 63) { const w = C[b + t - 63] * V[b + t - 63]; if (isFinite(w)) { s6 -= w; n6--; } }
    if (t >= 19 && n === 20 && C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; if (t >= 62 && n6 >= 57) TV63[b + t] = s6 / n6; } }
const liqAt = new Map(); const liqList = (t) => { if (t < 0) return []; if (!liqAt.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqAt.set(t, a); } return liqAt.get(t); };
// size rank among liquid stocks by 63-session traded value (1 = most traded), top TH.bigN only
const RK = new Int16Array(N); for (let t = 62; t < T; t++) { const top = topBy(liqList(t).map(i => ({ key: i, v: TV63[i * T + t] })), TH.bigN); top.forEach((i, r) => { RK[i * T + t] = r + 1; }); }
const closeAt = (i, x) => { for (let q = Math.min(x, T - 1); q >= 0; q--) { const z = C[i * T + q]; if (z > 0) return z; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1 || k >= T) return null; const e = O[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x); return y > 0 ? y / e - 1 : null; };
const spyRet = (k, x) => { const e = O[spyI * T + k], y = closeAt(spyI, x); return e > 0 && y > 0 ? y / e - 1 : null; };
const JUMPS = new Map(); const jumpsOf = (i) => { if (!JUMPS.has(i)) JUMPS.set(i, artifactJumps(ser(C, i))); return JUMPS.get(i); };
// the average liquid stock (every second one), artifacts left out, each gross return capped at +300% like the trades (AUD-1)
const cMemo = new Map(); const ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2 || hasArtifact(jumpsOf(i), k, x)) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };

// ================= 2. IDENTITIES, INDUSTRY, SHARES, SPLITS =================
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {}, c: {} });
const REF = { ok: false, cik: {} }; { const f = SC + '/ref.json.gz'; let x = JZ(f, null);
  if (!x || Date.now() - Date.parse(x.at) > 20 * 864e5) { const cik = {}; let n = 0, okAll = true;
    for (const active of [true, false]) { let path = '/v3/reference/tickers?market=stocks&type=CS&active=' + active + '&limit=1000', pages = 0;
      while (path && pages < 200) { const j = await api(path); pages++; if (!j || j.refused || !Array.isArray(j.results)) { okAll = false; break; } for (const r of j.results) if (r && /^[A-Z.]{1,6}$/.test(r.ticker || '')) { n++; if (r.cik && !cik[r.ticker]) cik[r.ticker] = String(+r.cik); }
        path = j.next_url ? j.next_url.replace(/^https?:\/\/[^/]+/, '') : null; } }
    if (okAll && n > 3000) { x = { at: new Date().toISOString(), cik }; WZ(f, x); } else log('Massive reference incomplete (' + n + ' tickers)'); }
  if (x) { REF.ok = true; REF.cik = x.cik || {}; } log('reference: ' + Object.keys(REF.cik).length + ' tickers with a CIK'); }
const symCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(a); const y = SECCIK[s]; if (y) return String(y[0]); return REF.cik[s] || null; };
const CIK = SYMS.map(s => symCik(s));
const sicOf = (s) => { const x = SIC[s]; if (x && x.c) return String(x.c); const y = SECCIK[s]; return y && y[1] ? String(y[1]) : null; };
const GRP = SYMS.map(s => sic3(sicOf(s)));
const SHROWS = new Map(); const shRows = (cik) => { if (!SHROWS.has(cik)) SHROWS.set(cik, SH.c[cik] ? splitFix(SH.c[cik]) : null); return SHROWS.get(cik); };
STATUS.shares = { ok: Object.keys(SH.c || {}).length > 3000, companies: Object.keys(SH.c || {}).length, at: SH.at || null, lagDays: 30 };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const SPL = new Map(); { const f = SC + '/splits.json.gz'; let x = JZ(f, null);
  if (!x || Date.now() - Date.parse(x.at) > 6 * 864e5) { const rows = []; let done = false;
    for (const base of ['/stocks/v1/splits?execution_date.gte=2017-01-01&limit=1000', '/v3/reference/splits?execution_date.gte=2017-01-01&limit=1000']) { let path = base, pages = 0; rows.length = 0;
      while (path && pages < 500) { const j = await api(path); pages++; if (!j || j.refused || !Array.isArray(j.results)) break; for (const r of j.results) if (r && r.ticker && r.execution_date && !/dividend/i.test(String(r.adjustment_type || ''))) rows.push([String(r.ticker).toUpperCase(), r.execution_date, +r.split_from, +r.split_to]);
        if (!j.next_url) { done = true; break; } path = j.next_url.replace(/^https?:\/\/[^/]+/, ''); }
      if (done && rows.length > 500) break; done = false; }
    if (done && rows.length > 500) { x = { at: new Date().toISOString(), rows: [...rows] }; WZ(f, x); } else log('splits: download incomplete (' + rows.length + ' rows)'); }
  let first = null; if (x) for (const [sym, d, from, to] of x.rows) { if (!(from > 0 && to > 0)) continue; (SPL.get(sym) || SPL.set(sym, []).get(sym)).push({ d, from, to }); if (!first || d < first) first = d; }
  STATUS.splits = { ok: !!x && x.rows.length > 500 && !!first && first <= '2018-12-31', rows: x ? x.rows.length : 0, reverse: x ? x.rows.filter(r => r[3] < r[2]).length : 0, first, at: x && x.at }; log('splits: ' + STATUS.splits.rows + ' rows from ' + first); }

// ================= 3. INDUSTRY GROUPS AMONG THE 1,000 LARGEST (one ticker per company) =================
// GR[t] = Map group -> [i ...] members of U_t ranked by traded value (one per CIK)
const GR = new Array(T); let inU = 0, inUsic = 0, inUcik = 0;
for (let t = 62; t < T; t++) { const m = new Map(), seen = new Set(); const rows = []; for (const i of liqList(t)) { const r = RK[i * T + t]; if (r > 0) rows.push([r, i]); } rows.sort((a, b) => a[0] - b[0]);
  for (const [, i] of rows) { inU++; if (CIK[i]) inUcik++; const g = GRP[i]; if (!g) continue; inUsic++; const key = CIK[i] ? 'c' + CIK[i] : 's' + i; if (seen.has(key)) continue; seen.add(key); (m.get(g) || m.set(g, []).get(g)).push(i); }
  GR[t] = m; }
STATUS.industry = { ok: inU > 0 && inUsic / inU >= 0.85, shareOfLargeCapsWithSic: r4(inUsic / Math.max(1, inU)), shareWithCik: r4(inUcik / Math.max(1, inU)) };
log('industry: ' + pc(inUsic / Math.max(1, inU)) + ' of large-cap rows have a SIC, ' + pc(inUcik / Math.max(1, inU)) + ' a CIK');
// 50-session averages (stocks ever in U) and breadth per group
const SMA50 = new Map(); const sma50 = (i) => { if (!SMA50.has(i)) SMA50.set(i, smaArr(ser(C, i), 50)); return SMA50.get(i); };
const BR = new Map(); for (let t = 62; t < T; t++) for (const [g, mem] of GR[t]) { let n = 0, up = 0; for (const i of mem) { const s = sma50(i)[t], z = C[i * T + t]; if (!(s > 0) || !(z > 0)) continue; n++; if (z > s) up++; }
  if (n >= TH.minMembers) { if (!BR.has(g)) BR.set(g, new Float32Array(T).fill(NaN)); BR.get(g)[t] = up / n; } }
log('breadth series: ' + BR.size + ' industries with ' + TH.minMembers + '+ large-cap members at some point');

// ================= 4. SIGNALS =================
const SIGS = Object.fromEntries(IDS.map(id => [id, []])), add = (id, t, i, why) => SIGS[id].push({ t, i, k: t + 1, x: t + RULES[id].hold, why });
// ---- A. runner pullbacks ----
let nRun = 0, nPb = 0, supKnown = 0;
for (let i = 0; i < NS; i++) { if (i === spyI) continue; let any = false; for (let t = 0; t < T; t++) if (LIQ[i * T + t]) { any = true; break; } if (!any) continue;
  const c = ser(C, i), o = ser(O, i), s20 = smaArr(c, TH.sma), cik = CIK[i], rows = cik ? shRows(cik) : null, spl = SPL.get(SYMS[i]) || null;
  for (let t = 12; t < T; t++) { if (!LIQ[i * T + t]) continue; if (runnerAt(c, o, t) === null) continue; nRun++;
    const pb = pullbackAfter(c, s20, t, (u) => LIQ[i * T + u] === 1); if (!pb) continue; nPb++; const u = pb.u, d = D[u];
    add('SQ13-RPB', u, i, 'runner ' + D[t]);
    const r = RK[i * T + t]; if (r > 0 && r <= TH.largeN) add('SQ13-RPB-LARGE', u, i, 'runner ' + D[t] + ' (size rank ' + r + ')');
    const shChg = rows ? shareChange(rows, d) : null, rs3 = STATUS.splits.ok ? reverseSplitWithin(spl, d, TH.rsDays) : null; if (shChg !== null) supKnown++;
    for (const id of ['SQ13-RPB-CLEAN', 'SQ13-RPB-BUYBACK']) if (supplyPass(id, shChg, rs3) === true) add(id, u, i, 'runner ' + D[t] + ', shares ' + pc(shChg)); } }
log('runners ' + nRun + ', pullback signals ' + nPb + ' (share change known for ' + supKnown + ')');
// ---- B1. industry waves ----
const WAVES = [];
for (const [g, br] of BR) for (const t of waveSessions(br)) { const mem = GR[t].get(g) || []; WAVES.push({ g, t, n: mem.length, br: r4(br[t]) });
  for (const i of topBy(mem.map(i => ({ key: i, v: TV63[i * T + t] })), TH.pick)) add('SQ13-WAVE-BIG', t, i, 'industry ' + g + ' breadth ' + pc(br[t]));
  for (const i of topBy(mem.map(i => ({ key: i, v: t >= 63 && C[i * T + t - 63] > 0 && C[i * T + t] > 0 ? C[i * T + t] / C[i * T + t - 63] - 1 : NaN })), TH.pick)) add('SQ13-WAVE-STRONG', t, i, 'industry ' + g + ' breadth ' + pc(br[t])); }
log('industry waves: ' + WAVES.length);
// ---- B2. leader rules ----
const leaderOf = (g, t) => { const m = GR[t] && GR[t].get(g); return m && m.length >= TH.leadMin ? m : null; };
const LEADERS = new Map();   // i -> groups where it led at some session
for (let t = 62; t < T; t++) for (const [g, m] of GR[t]) if (m.length >= TH.leadMin) { const L = m[0]; (LEADERS.get(L) || LEADERS.set(L, new Set()).get(L)).add(g); }
const cr = (i, a, b) => { const x = C[i * T + a], y = C[i * T + b]; return x > 0 && y > 0 ? y / x - 1 : NaN; };
for (const [L, gs] of LEADERS) { const c = ser(C, L); for (const g of gs) for (let t = TH.hiLook; t < T; t++) { const m = leaderOf(g, t); if (!m || m[0] !== L || !LIQ[L * T + t]) continue; if (!firstHighIn(c, t)) continue;
    for (const f of followers(m, (k) => cr(k, t - TH.followLook, t))) add('SQ13-LEADH', t, f, 'leader ' + SYMS[L] + ' first 52-week high in 63 sessions'); } }
// results 8-Ks of the leaders (SEC submissions; cached; refreshed when older than 20 hours for leaders of the last 30 sessions)
const NEWS = JZ(SC + '/news.json.gz', { c: {} }); { const need = new Map(); for (const [L] of LEADERS) { const c = CIK[L]; if (!c) continue; let recent = false; for (let t = T - 30; t < T; t++) for (const [, m] of GR[t] || []) if (m[0] === L) recent = true; need.set(c, (need.get(c) || false) || recent); }
  let req = 0, fail = 0, got = 0;
  for (const [cik, recent] of need) { const have = NEWS.c[cik], age = have ? Date.now() - Date.parse(have.at) : Infinity; if (have && (age < (recent ? 20 * 3600e3 : 30 * 864e5))) continue; if (left() < 60 * 60e3) break;
    const pad = 'CIK' + cik.padStart(10, '0'), list = []; let okc = true;
    const eat = (o) => { const n = (o.form || []).length; for (let q = 0; q < n; q++) if (o.form[q] === '8-K' && o.filingDate[q] >= '2020-09-01' && String((o.items || [])[q] || '').split(/[,\s]+/).includes('2.02')) list.push(o.filingDate[q]); };
    await sleep(local(env.SEC_DATA_BASE) ? 0 : 120); req++; const r = await get(SECD + '/submissions/' + pad + '.json', { headers: { 'User-Agent': UA }, timeout: 60000 }); const j = r && r.ok ? await r.json().catch(() => null) : null;
    if (!j || !j.filings || !j.filings.recent) { fail++; continue; } eat(j.filings.recent);
    for (const fl of j.filings.files || []) { if (!(fl.filingTo >= '2020-09-01')) continue; await sleep(local(env.SEC_DATA_BASE) ? 0 : 120); req++; const r2 = await get(SECD + '/submissions/' + fl.name, { headers: { 'User-Agent': UA }, timeout: 60000 }); const j2 = r2 && r2.ok ? await r2.json().catch(() => null) : null; if (!j2) { okc = false; break; } eat(j2); }
    if (!okc) { fail++; continue; } NEWS.c[cik] = { at: new Date().toISOString(), f: [...new Set(list)].sort() }; got++; }
  if (req) WZ(SC + '/news.json.gz', NEWS); const cov = [...need.keys()].filter(c => NEWS.c[c]).length, noCik = [...LEADERS.keys()].filter(L => !CIK[L]).length;
  STATUS.results8k = { ok: need.size > 0 && cov >= need.size * 0.9 && noCik <= LEADERS.size * 0.1, leaders: LEADERS.size, leadersWithoutCik: noCik, companies: need.size, withFilings: cov, requests: req, failed: fail, fetchedNow: got };
  log('SEC results 8-Ks: ' + cov + '/' + need.size + ' leader companies (' + req + ' requests, ' + fail + ' failed; ' + noCik + ' leaders without a CIK)'); }
for (const [L, gs] of LEADERS) { const nw = CIK[L] && NEWS.c[CIK[L]]; if (!nw) continue; const c = ser(C, L);
  for (const F of nw.f) { const r0 = reactionSession(D, F); if (r0 === null || r0 < TH.hiLook) continue;
    for (const g of gs) for (let t = r0 + TH.reactFrom; t <= Math.min(T - 1, r0 + TH.reactTo); t++) { const m = leaderOf(g, t); if (!m || m[0] !== L || !LIQ[L * T + t]) continue; if (!aboveHighBefore(c, r0, t)) continue;
      for (const f of followers(m, (k) => cr(k, r0 - 1, t))) add('SQ13-LEADF', t, f, 'leader ' + SYMS[L] + ' results ' + F + ', above its pre-results 52-week high'); break; } } }
const FAMILY_OK = { pullback: () => true, 'pullback+supply': () => STATUS.shares.ok && STATUS.splits.ok, wave: () => STATUS.industry.ok, leader: () => STATUS.industry.ok && STATUS.results8k.ok, 'leader-price': () => STATUS.industry.ok };
const familyOk = (id) => STATUS.price.ok && !!FAMILY_OK[RULES[id].family]();
const COUNTS = {}; for (const id of IDS) { const s = SIGS[id].filter(z => z.x < T); COUNTS[id] = { dataOk: familyOk(id), older: s.filter(z => halfOf(D[z.t]) === 'older').length, newer: s.filter(z => halfOf(D[z.t]) === 'newer').length }; }
log('signals with a complete hold (before one-open filter): ' + IDS.map(id => id + ' ' + (COUNTS[id].dataOk ? COUNTS[id].older + '/' + COUNTS[id].newer : 'NO DATA')).join(', '));
if (DIAG) { fs.writeFileSync('data/squad13-diag.json', JSON.stringify({ generatedAt: new Date().toISOString(), note: 'DIAG: data coverage and signal counts only; no returns computed, no verdict', window: [D[0], D[T - 1]], data: STATUS, signals: COUNTS, waves: WAVES.length, runners: nRun, pullbacks: nPb }, null, 1));
  console.log('SQUAD 13 DIAG ' + D[0] + ' to ' + D[T - 1] + ' | ' + Object.entries(STATUS).map(([k, s]) => k + (s.ok ? ' ok' : ' MISSING')).join(', ')); process.exit(0); }

// ================= 5. 5-YEAR ONE-SHOT =================
const need = IDS.filter(id => !FROZEN[id]);
function tradesOf(sigs) { const out = [], busyUntil = new Map(), spans = new Map(); let artifacts = 0;
  for (const z of [...sigs].sort((p, q) => p.t - q.t || p.i - q.i)) { if (z.x >= T) continue; if ((busyUntil.get(z.i) ?? -1) >= z.k) continue;
    const g0 = ret(z.i, z.k, z.x); if (g0 === null || !isFinite(g0)) continue; if (hasArtifact(jumpsOf(z.i), z.k, z.x)) { artifacts++; continue; }
    const g = capG(g0), c = ctrlSpan(z.k, z.x); if (c === null) continue;
    busyUntil.set(z.i, z.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, z.x]);
    out.push({ t: z.t, s: SYMS[z.i], i: z.i, k: z.k, x: z.x, g, c, spy: spyRet(z.k, z.x), days: z.x - z.k + 1, half: halfOf(D[z.t]), why: z.why }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.x - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 64, to: T - 1, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  out.artifacts = artifacts; return out; }
const brief = (h) => h && h.n ? { n: h.n, avg: h.avg, avgStress: h.avgStress, edge: h.edge, vsOwn: h.vsOwn, noTop2: h.noTop2, tBlock: h.tBlock, win: h.win } : { n: 0 };
const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
log('5-year one-shot for ' + need.length + ' rules not yet frozen');
const RES = {};
for (const id of need) { if (left() < 8 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  if (!familyOk(id)) { RES[id] = { verdict: 'NOT RUN', why: 'data not available this run: ' + JSON.stringify(STATUS).slice(0, 500) }; log('- ' + id + ': NOT RUN (' + RULES[id].family + ' data)'); continue; }
  const hold = RULES[id].hold, tr = tradesOf(SIGS[id]), by = { older: tr.filter(z => z.half === 'older'), newer: tr.filter(z => z.half === 'newer') };
  const R = { older: halfStat(by.older, hold), newer: halfStat(by.newer, hold), all: halfStat(tr, hold) };
  const PY = Object.fromEntries(['older', 'newer'].map(h => [h, { rule: r4(perYear(by[h])), spy: r4(perYear(by[h], 'spy', 0)), avgStock: r4(perYear(by[h], 'c', 0)) }]));
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] } });
  RES[id] = { ...v, name: RULES[id].name, family: RULES[id].family, hold, results: R, perYear: PY, calendarYears: byYear(tr, z => D[z.t].slice(0, 4)), artifactsLeftOut: tr.artifacts, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1: trades and yardstick capped at +300% alike)',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], net: r4(z.g - COST), avgStock: r4(z.c - COST), spy: r4(z.spy), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST), why: z.why })) };
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | per year ' + pc(PY.older.rule) + ' vs SPY ' + pc(PY.older.spy) + ' / ' + pc(PY.newer.rule) + ' vs SPY ' + pc(PY.newer.spy) + ' | ' + String(v.why).slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);

// ================= 6. PAPER LANE =================
const nextSess = (d) => { let x = Date.parse(d + 'T00:00:00Z') + 864e5; while ([0, 6].includes(new Date(x).getUTCDay()) || ['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06'].includes(iso(x))) x += 864e5; return iso(x); };
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), sigIds = new Set(sigLines.map(x => x.id)), newLines = [], openBy = new Map(), lastT = T - 1;
for (const x of sigLines) if (!resolved.has(x.id)) openBy.set(x.m + '|' + x.sym, true);
const fromT = D.findIndex(d => d >= START);
if (fromT >= 0) for (const id of IDS) { if (!familyOk(id)) continue; const hold = RULES[id].hold;
  for (const z of SIGS[id].filter(z => z.t >= fromT && z.t <= lastT).sort((p, q) => p.t - q.t)) { const sym = SYMS[z.i], key = id + '|' + sym; if (openBy.get(key)) continue;
    const late = z.k <= lastT, entryDate = late ? null : nextSess(D[lastT]);
    const line = { type: 'signal', id: id + '|' + sym + '|' + D[z.t], m: id, sym, d: D[z.t], close: r4(C[z.i * T + z.t]), halal: halal(sym), hold, why: z.why,
      plan: late ? 'LATE (data arrived after the rule\'s entry): buy at the next open after ' + D[lastT] + ', hold ' + hold + ' sessions' : 'buy at the open of ' + entryDate + ', hold ' + hold + ' sessions', entryDate, late, recordedAfter: D[lastT] };
    if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
const firstAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo; };
for (const x of sigLines) { const k = x.entryDate ? tOf.get(x.entryDate) : x.late ? firstAfter(x.recordedAfter) : undefined; if (k === undefined || k >= T) { x._state = 'waiting'; continue; } const xi = k + x.hold - 1, i = SY.get(x.sym);
  if (xi > T - 1) { x._state = 'open'; x._k = k; x._mark = i === undefined ? null : ret(i, k, T - 1); continue; }
  const g = i === undefined ? null : ret(i, k, xi), c = ctrlSpan(k, xi); x._state = 'closed'; x._g = g; x._c = c; x._k = k;
  if (!resolved.has(x.id) && g !== null) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[xi], g: r4(g), net: r4(capG(g) - COST), avgStock: c === null ? null : r4(c - COST), spy: r4(spyRet(k, xi)) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
const board = {}, today = {};
for (const id of IDS) { const mine = sigLines.filter(x => x.m === id), closed = mine.filter(x => x._state === 'closed' && x._g !== null && x._g !== undefined).map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c, halal: x.halal })), fr = firstRun[id], st = boardStats(closed);
  board[id] = { name: RULES[id].name, hold: RULES[id].hold, family: RULES[id].family, dataOk: familyOk(id), signals: mine.length, waiting: mine.filter(x => x._state === 'waiting').length, open: mine.filter(x => x._state === 'open').length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: paperReady(st),
    fiveYear: fr ? { verdict: fr.verdict, why: fr.why, perYear: fr.perYear } : null };
  today[id] = { name: RULES[id].name, hold: RULES[id].hold, tier: fr ? fr.verdict : null, newSignals: mine.filter(x => x.recordedAfter === D[lastT] && !x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan, why: x.why })),
    late: mine.filter(x => x.recordedAfter === D[lastT] && x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, buy: D[x._k], sinceBuy: r4(x._mark ?? NaN), exitAfter: RULES[id].hold + ' sessions' })) }; }
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, note: 'PAPER ONLY. Squad 13 (runner pullbacks and industry waves among large caps) recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a frozen 5-year verdict that meets the TRY SMALL standard (data/squad13-lab.json firstRun, both halves, per-year return above SPY) or 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.filter(x => x.type === 'signal').length + ' new signals; ' + sigLines.length + ' in all');

// ================= 7. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), squad: 13, philosophy: 'runner pullbacks (the flip side of squad 8) and industry waves among large caps (breadth thrusts, leader then followers)', preRegistered: 'squad13-core.mjs RULES + TH (24 Oct 2026, before any run) + data/strategy-library.json SQ13-*',
  window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS, signalCounts: COUNTS, waves: { count: WAVES.length, last: WAVES.sort((a, b) => b.t - a.t).slice(0, 15).map(w => ({ industry: w.g, d: D[w.t], members: w.n, breadth: w.br })) },
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock over the same sessions, better than the same stock on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks (blocks = the hold), block t >= ' + TIER2_T + ', return per year of capital above SPY on the same days -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN. Gross returns capped at +300% for trades and yardsticks alike (AUD-1).',
  rules: Object.fromEntries(IDS.map(id => [id, { name: RULES[id].name, hold: RULES[id].hold, rule: RULES[id].rule, papers: RULES[id].papers }])),
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-400)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'squad13-lab.mjs -> data/squad13-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: [R.older.win, R.newer.win],
      perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad13-lab: library not updated: ' + e.message); }
console.log('SQUAD 13 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + IDS.map(id => id + ' ' + (firstRun[id] ? firstRun[id].verdict : (RES[id] || {}).verdict)).join(', ') + ' | ' + Object.entries(STATUS).map(([k, s]) => k + (s.ok ? ' ok' : ' MISSING')).join(', '));
