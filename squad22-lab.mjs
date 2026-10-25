// SQUAD 22 LAB (25 Oct 2026): new-mechanism rules (squad22-core.mjs header = the exact pre-registered rules and the library check).
// Research + FORWARD PAPER lanes; never places an order; no Telegram.
// 1. DATA (GitHub Actions only; keys only from secrets, never printed; official sources, no scraping):
//    prices  = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY; dead stocks and the
//              under-3-USD rows included) + the sessions since (Massive grouped daily) + splits since.
//    facts   = SEC XBRL companyfacts (bulk zip; each fact with its filed date), compacted to the tags RULE 1 needs, for every CIK that maps
//              to a stock in the price data (point-in-time Form 3/4/5 ticker spans, then today's SEC list).
//    filings = SEC EDGAR quarterly master index: 424B5 / S-1 (RULE 3 supply), 10-12B / 10-12G (RULE 2).
//    V15     = quality.mjs's yearly SEC frames cache (study-cache/fund.json.gz, READ ONLY) + data/shares.json.gz, as V15 runs live.
// 2. 5-YEAR ONE-SHOT for each rule not yet frozen (first complete verdict frozen in data/squad22-lab.json firstRun). SQ22-SPINOFF: count
//    first; under 20 cases in a half -> TOO FEW CASES with no return computed.
// 3. PAPER LANES from 26 Oct 2026 (data/squad22-paper.jsonl, data/squad22-today.json, data/squad22-board.json).
// DIAG=1: data coverage and case counts only; no returns, no verdict; writes data/squad22-diag.json only.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { ownAverage, nextSession } from './anomaly-core.mjs';
import { artifactJumps, hasArtifact } from './squad4-core.mjs';
import { RULES, TEST_IDS, NOT_RUN, TH, COST, SPLIT, PAPER_START, mean, r4, halfOf, capG, addDays, XTAGS, compactFacts, factsOf, cashConvAt, filingDates, v15Fscore, v15Year, v15Pick,
  exitHold, exitNegl, quantile, crashedBase, neglPrice, neglWhy, quietCrashed, sharesUp, dilutedAt, spinCases, perMonth, perYear, shapeOf, boardStats, preRegister } from './squad22-core.mjs';
const env = process.env, DIAG = !!env.DIAG, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ22_CACHE || 'squad22-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = 'data/squad22-lab.json', PAPER = 'data/squad22-paper.jsonl', TODAY = 'data/squad22-today.json', BOARD = 'data/squad22-board.json', LIB = 'data/strategy-library.json';
const START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ22_MINUTES || 280) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};
log('squad 22 lab' + (DIAG ? ' (DIAG: coverage and counts only, no returns)' : '') + '; frozen already: ' + (Object.keys(FROZEN).join(', ') || 'none'));

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' squad 22 entries written now'); }

// ================= 1. PRICES =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad22-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none') + (env.MASSIVE_KEY ? '' : ' (no MASSIVE_KEY)'));
const SICP = store.sic || {};
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (/^[A-Z]{1,5}$/.test(s) && !SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const CA = new Float32Array(N).fill(NaN), OA = new Float32Array(N).fill(NaN), HA = new Float32Array(N).fill(NaN), LA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
let withHL = 0, rowsAll = 0;
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; HA[k] = x.h ? x.h[j] : NaN; LA[k] = x.l ? x.l[j] : NaN; MAIN[k] = 1; rowsAll++; if (x.h && x.l && x.h[j] > 0) withHL++; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o ? x.x.o[j] : NaN; VA[k] = x.x.v ? x.x.v[j] : NaN; HA[k] = x.x.h ? x.x.h[j] : NaN; LA[k] = x.x.l ? x.x.l[j] : NaN; } });
store = null;
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; HA[q] /= r; LA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'); if (spyI === undefined) { console.log('squad22-lab: SPY missing; nothing done'); process.exit(0); }
const ser = (A, i) => A.subarray(i * T, i * T + T), series = (i) => ({ o: ser(OA, i), h: ser(HA, i), l: ser(LA, i), c: ser(CA, i), v: ser(VA, i) });
// LIQ = the average liquid stock (close 5+, 5M USD+ a day on the main rows); DVA = 20-session average traded value on ALL rows (20 present)
const LIQ = new Uint8Array(N), DVA = new Float32Array(N).fill(NaN), FIRST = new Int32Array(NS).fill(-1);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0, s2 = 0, n2 = 0;
  for (let t = 0; t < T; t++) { if (FIRST[i] < 0 && CA[b + t] > 0) FIRST[i] = t; const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN, w2 = CA[b + t] * VA[b + t]; if (isFinite(v)) { s += v; n++; } if (isFinite(w2)) { s2 += w2; n2++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN, z = CA[k] * VA[k]; if (isFinite(w)) { s -= w; n--; } if (isFinite(z)) { s2 -= z; n2--; } }
    if (t >= 19 && n === 20 && CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; if (t >= 19 && n2 === 20) DVA[b + t] = s2 / 20; } }
const P33 = new Float64Array(T).fill(NaN); for (let t = 19; t < T; t++) { const v = []; for (let i = 0; i < NS; i++) { if (i === spyI) continue; const x = DVA[i * T + t]; if (x > 0) v.push(x); } if (v.length >= 500) P33[t] = quantile(v, TH.negl.pct); }
const liqMemo = new Map(), liqList = (t) => { if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); if (liqMemo.size > 3000) liqMemo.delete(liqMemo.keys().next().value); } return liqMemo.get(t); };
const closeAt = (i, x, k) => { for (let q = Math.min(x, T - 1); q >= k; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1 || x < k) return null; const e = OA[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const JUMPS = new Map(), jumpsOf = (i) => { if (!JUMPS.has(i)) JUMPS.set(i, artifactJumps(ser(CA, i))); return JUMPS.get(i); };
const artifactIn = (i, a, b) => hasArtifact(jumpsOf(i), a, b);
const cMemo = new Map(); const ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; if (artifactIn(i, k - 1, x)) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
const spyRet = (k, x) => { const e = OA[spyI * T + k], y = closeAt(spyI, x, k); return e > 0 && y > 0 ? y / e - 1 : null; };
STATUS.price = { ok: T >= 1000 && withHL >= rowsAll * 0.9, sessions: T, from: D[0], to: D[T - 1], stocks: NS, rowsWithHighLow: r4(withHL / Math.max(1, rowsAll)), p33Days: [...P33].filter(x => x > 0).length };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks), rows with high/low ' + pc(withHL / Math.max(1, rowsAll)));

// ================= 2. SEC SOURCES =================
function download(url, file) { try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : (/^\d{4}-\d\d-\d\d/.test(String(s || '')) ? String(s).slice(0, 10) : null); };
// ---- 2a. point-in-time ticker map (SEC Form 3/4/5 SUBMISSION tables: issuer ticker + issuer CIK on each filing date) ----
const CIKMAP = new Map(); { const qs = [], now = new Date(); for (let y = 2021; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, q * 3, 1)) < now) qs.push(y + 'q' + q);
  const parseMap = (zip) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, 'SUBMISSION.tsv'], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const L = txt.split(/\r?\n/), H = L[0].split('\t'), ix = (k) => H.indexOf(k);
    const a = ix('FILING_DATE'), c = ix('ISSUERCIK'), s = ix('ISSUERTRADINGSYMBOL'); if (a < 0 || c < 0 || s < 0) return null; const map = new Map();
    for (const l of L.slice(1)) { if (!l) continue; const r = l.split('\t'), d = isoD(r[a]), cik = String(+r[c] || ''), sym = String(r[s] || '').toUpperCase().trim().replace(/-/g, '.'); if (!d || !cik || !/^[A-Z][A-Z0-9.]{0,6}$/.test(sym) || sym === 'NONE' || sym === 'NA') continue;
      const k = sym + '|' + cik, o = map.get(k); if (!o) map.set(k, [sym, cik, d, d, 1]); else { if (d < o[2]) o[2] = d; if (d > o[3]) o[3] = d; o[4]++; } } return { map: [...map.values()] }; };
  const fail = []; let got = 0, from4 = 0;
  for (const q of qs) { let x = JZ(SC4 + '/f345/' + q + '.json.gz', null); if (x) from4++; if (!x) x = JZ(SC + '/f345/' + q + '.json.gz', null);
    if (!x && !local(env.SEC_BASE) && left() > 150 * 60e3) { for (const p of ['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/']) { const zip = SC + '/f345.zip'; if (!download(SEC + p + q + '_form345.zip', zip)) continue;
      const r = parseMap(zip); try { fs.unlinkSync(zip); } catch (e) {} if (r) { x = r; WZ(SC + '/f345/' + q + '.json.gz', x); got++; break; } } }
    if (!x) { fail.push(q); continue; } for (const [sym, cik, f, l, n] of x.map) (CIKMAP.get(cik) || CIKMAP.set(cik, []).get(cik)).push([sym, f, l, n]); }
  STATUS.tickerMap = { ok: qs.slice(0, -1).every(q => !fail.includes(q)), quarters: qs.length, fromSquad4Cache: from4, downloadedNow: got, missing: fail, ciks: CIKMAP.size };
  log('ticker map: ' + JSON.stringify(STATUS.tickerMap)); }
const SH = JZ('data/shares.json.gz', { t: {}, c: {} }), SECCIK = J('data/sec-ciks.json', {});
const todayCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(+a); const y = SECCIK[s]; return y ? String(+y[0]) : null; };
const TODAYSYMS = new Map(); for (const s of SYMS) { const c = todayCik(s); if (c) (TODAYSYMS.get(c) || TODAYSYMS.set(c, []).get(c)).push(s); }
const hasPx = (i, t) => { for (let q = Math.max(0, t - 5); q <= Math.min(T - 1, t + 5); q++) if (CA[i * T + q] > 0) return true; return false; };
const firstOnOrAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
const firstAfter = (d) => firstOnOrAfter(addDays(d, 1));
// the stock of CIK on date d: the Form 3/4/5 ticker of that CIK whose span covers d (+-400 days, most filings first), then today's list; with prices near d
const candSyms = (cik, d) => { const c = String(+cik), sp = (CIKMAP.get(c) || []).filter(s => !d || (d >= addDays(s[1], -400) && d <= addDays(s[2], 400))).sort((a, b) => b[3] - a[3]); return [...new Set([...sp.map(x => x[0]), ...(TODAYSYMS.get(c) || [])])]; };
const symFor = (cik, d) => { const t = Math.min(firstOnOrAfter(d), T - 1); for (const s of candSyms(cik, d)) { const i = SY.get(s); if (i !== undefined && hasPx(i, t)) return s; } return null; };

// ---- 2b. EDGAR quarterly master index: 424B5 / S-1 by CIK (supply) and 10-12B / 10-12G (spin-offs) ----
const DIL = new Map(), FORM10 = []; { const qs = [], now = new Date(); for (let y = 2020; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) { const s = new Date(Date.UTC(y, (q - 1) * 3, 1)); if (s <= now) qs.push([y, q]); }
  const fail = []; let got = 0, rows = 0; const want = new Set(['424B5', 'S-1', '10-12B', '10-12G']);
  for (const [y, q] of qs) { const key = y + 'q' + q, cf = SC + '/master/' + key + '.json', cur = Date.now() < Date.UTC(y, q * 3, 1) + 5 * 864e5; let x = cur && !local(env.SEC_BASE) ? null : J(cf, null);
    if (!x && !local(env.SEC_BASE)) { const gz = SC + '/master.gz'; if (download(SEC + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.gz', gz)) { let txt = null; try { txt = zlib.gunzipSync(fs.readFileSync(gz)).toString('latin1'); } catch (e) {} try { fs.unlinkSync(gz); } catch (e) {}
        if (txt) { x = []; for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length !== 5 || !/^\d+$/.test(p[0].trim())) continue; const form = p[2].trim(); if (want.has(form)) x.push([String(+p[0]), form, p[3].trim()]); }
          if (x.length > 100) { W(cf, x); got++; } else x = null; } } }
    if (!x) { fail.push(key); continue; } for (const r of x) { rows++; if (r[1] === '424B5' || r[1] === 'S-1') (DIL.get(r[0]) || DIL.set(r[0], []).get(r[0])).push(r[2]); else FORM10.push(r); } }
  for (const a of DIL.values()) a.sort();
  STATUS.master = { ok: !fail.length, quarters: qs.length, downloadedNow: got, missing: fail, rows, form10: FORM10.length };
  log('master index: ' + rows + ' rows (' + FORM10.length + ' Form 10-12B / 10-12G)' + (fail.length ? ', MISSING ' + fail.join(' ') : '')); }

// ---- 2c. SEC companyfacts (bulk zip), compact, for every CIK that maps to a stock in the price data ----
const WANTCIK = new Set(); for (const [c, sp] of CIKMAP) if (sp.some(s => SY.has(s[0]))) WANTCIK.add(c); for (const c of TODAYSYMS.keys()) WANTCIK.add(c);
let FX = JZ(SC + '/facts.json.gz', { at: null, c: {} });
{ const age = FX.at ? Date.now() - Date.parse(FX.at) : Infinity, todo = age > 6 * 864e5 ? [...WANTCIK] : [];   // refreshed once a week (new CIKs wait for the next refresh)
  if (todo.length && !DIAG || (todo.length && DIAG && !FX.at)) { const zip = SC + '/companyfacts.zip'; let zipOk = false, got = 0, miss = 0;
    if (!local(env.SEC_BASE)) zipOk = download(SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip', zip) && fs.statSync(zip).size > 1e8;
    if (zipOk) { const names = new Set(execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean)); const NC = { at: new Date().toISOString(), c: {} };
      for (const c of [...WANTCIK]) { const name = 'CIK' + c.padStart(10, '0') + '.json'; if (!names.has(name)) { NC.c[c] = null; miss++; continue; }
        let j = null; try { j = JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString()); } catch (e) { j = null; }
        NC.c[c] = j ? compactFacts(j) : null; if (j) got++; if ((got + miss) % 2000 === 0) log('companyfacts: ' + (got + miss) + ' of ' + WANTCIK.size); }
      try { fs.unlinkSync(zip); } catch (e) {} FX = NC; WZ(SC + '/facts.json.gz', FX); log('companyfacts: ' + got + ' companies read, ' + miss + ' not in the bulk file'); }
    else log('companyfacts: the bulk file did not download; using the cache from ' + FX.at); }
  const withF = [...WANTCIK].filter(c => FX.c[c] && Object.keys(FX.c[c]).length).length;
  STATUS.facts = { ok: !!FX.at && Date.now() - Date.parse(FX.at) < 8 * 864e5 && withF >= WANTCIK.size * 0.5, at: FX.at, ciks: WANTCIK.size, withFacts: withF }; log('companyfacts: ' + JSON.stringify(STATUS.facts)); }
const coOf = (cik) => { const c = FX.c[cik]; if (!c) return null; const o = {}; for (const [g, tags] of Object.entries(XTAGS)) { o[g] = {}; for (const t of tags) if (c[t]) o[g][t] = factsOf(c[t]); } return o; };

// ---- 2d. V15 inputs (quality.mjs yearly frames cache, read only) ----
const FUND = JZ(env.FUND_CACHE || 'study-cache/fund.json.gz', { v: {} });
STATUS.fund = { ok: Object.keys(FUND.v || {}).length > 3000, companies: Object.keys(FUND.v || {}).length };
const v15Cik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; return a ? String(+a) : null; };   // as quality.mjs (V15 as it runs live)
const sharesYE = (cik, y) => { const a = SH.c[cik]; if (!a) return null; let v = null; for (const [e, n] of a) { if (e <= y + '-12-31' && e >= y + '-07-01') v = n; } return v; };
const finCo = (s) => { const x = SICP[s]; return !!(x && x.c && String(x.c)[0] === '6'); };
const above200 = (i, t) => { if (t < 199) return null; let s = 0; for (let k = t - 199; k <= t; k++) { const c = CA[i * T + k]; if (!(c > 0)) return null; s += c; } return CA[i * T + t] > s / 200; };
const v15Memo = new Map(); const v15At = (t) => { if (v15Memo.has(t)) return v15Memo.get(t); const y = v15Year(D[t]), rows = [];
  for (const i of liqList(t)) { const s = SYMS[i]; if (finCo(s)) continue; const cik = v15Cik(s); if (!cik) continue; const c = FUND.v[cik]; if (!c) continue; const fs0 = v15Fscore(c, y, sharesYE(cik, y), sharesYE(cik, y - 1)); if (fs0 === null) continue; if (above200(i, t) !== true) continue; rows.push({ key: i, fs: fs0 }); }
  const p = v15Pick(rows); v15Memo.set(t, p); return p; };
const v15Span = (t, k, x) => { const v = []; for (const i of v15At(t)) { if (artifactIn(i, k - 1, x)) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } return v.length >= 5 ? mean(v) : null; };

// ================= 3. CASES AND SIGNALS =================
const SIGS = {};
// ---- RULE 1: SQ22-CASHCONV ----
{ const out = [], why = {}; let checked = 0, noSym = 0, notLiq = 0; const from = addDays(D[0], -1);
  for (const cik of WANTCIK) { const co = FX.c[cik] ? coOf(cik) : null; if (!co) continue;
    for (const F of filingDates(co, from)) { checked++; const r = cashConvAt(co, F); if (!r.ok) { why[r.why] = (why[r.why] || 0) + 1; continue; }
      const sym = symFor(cik, F); if (!sym) { noSym++; continue; } const i = SY.get(sym), k = firstAfter(F), t = k - 1; if (t < 30) continue;
      if (k < T && !LIQ[i * T + t]) { notLiq++; continue; } if (k >= T && !LIQ[i * T + T - 1]) { notLiq++; continue; }
      out.push({ id: 'SQ22-CASHCONV', cik, sym, i, F, t: Math.min(t, T - 1), k, E0: r.E0, r: r.r, gm: r.gm, dil: r.dil }); } }
  SIGS['SQ22-CASHCONV'] = out.sort((a, b) => a.k - b.k || a.i - b.i);
  STATUS.cashconv = { filingsChecked: checked, passed: out.length + noSym + notLiq, noStock: noSym, notLiquid: notLiq, signals: out.length, failedBy: why };
  log('CASHCONV: ' + checked + ' filing dates checked, ' + out.length + ' liquid signals; ' + JSON.stringify(why)); }
// ---- RULE 2: SQ22-SPINOFF (cases; count first) ----
{ const firstTrade = (cik, d) => { let best = -1; for (const s of candSyms(cik, null)) { const i = SY.get(s); if (i === undefined || FIRST[i] < 5) continue; const f = FIRST[i]; if (D[f] >= d && (best < 0 || f < best)) best = f; } return best; };
  const cases = spinCases(FORM10, firstTrade, D), out = []; let notLiq = 0, noData = 0;
  for (const z of cases) { let sym = null; for (const s of candSyms(z.cik, null)) { const i = SY.get(s); if (i !== undefined && FIRST[i] === z.s1) { sym = s; break; } } if (!sym) continue;
    const i = SY.get(sym), k = z.s1 + TH.spin.wait, t = k - 1; if (t >= T) { out.push({ id: 'SQ22-SPINOFF', ...z, sym, i, t: T - 1, k, pending: true }); continue; }
    let full = true; for (let q = z.s1; q <= t; q++) if (!(CA[i * T + q] > 0) || !(VA[i * T + q] >= 0)) full = false; if (!full) { noData++; continue; }
    let dv = 0; for (let q = t - 19; q <= t; q++) dv += CA[i * T + q] * VA[i * T + q]; if (!(CA[i * T + t] >= TH.spin.minClose) || !(dv / 20 >= TH.spin.minDv)) { notLiq++; continue; }
    out.push({ id: 'SQ22-SPINOFF', ...z, sym, i, t, k }); }
  SIGS['SQ22-SPINOFF'] = out; const cnt = { older: out.filter(z => !z.pending && z.k < T && halfOf(D[z.k]) === 'older').length, newer: out.filter(z => !z.pending && z.k < T && halfOf(D[z.k]) === 'newer').length };
  STATUS.spinoff = { form10Ciks: new Set(FORM10.map(r => r[0])).size, newListings: cases.length, notLiquid: notLiq, missingSessions: noData, cases: cnt, sample: out.slice(0, 60).map(z => [z.sym, z.form, z.filed, D[Math.min(z.s1, T - 1)]]) };
  log('SPINOFF: ' + cases.length + ' new listings after a Form 10; liquid cases by entry half ' + JSON.stringify(cnt)); }
// ---- RULE 3: SQ22-NEGLECTED (+ the same-day quiet crashed yardstick pool) ----
const QUIET = new Map(), NWHY = {}; { const out = [], N0 = TH.negl; let base = 0, price = 0, supply = 0, noShares = 0; const sessOf = (d) => firstOnOrAfter(d);
  for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let S = null; const cik = todayCik(SYMS[i]);
    for (let t = 252; t < T; t++) { const c = CA[b + t], dv = DVA[b + t]; if (!(c >= N0.minClose) || !(dv >= N0.minDv) || !(dv < P33[t])) continue; const c63 = CA[b + t - 63]; if (!(c63 > 0) || !(c / c63 - 1 <= N0.r63)) continue;
      if (!S) S = series(i); if (!crashedBase(S, t, dv, P33[t])) continue; base++;
      if (quietCrashed(S, t)) (QUIET.get(t) || QUIET.set(t, []).get(t)).push(i);
      if (DIAG) { const w = neglWhy(S, t) || 'passed'; NWHY[w] = (NWHY[w] || 0) + 1; if (MAIN[b + t]) NWHY.mainRow = (NWHY.mainRow || 0) + 1; }
      if (!neglPrice(S, t)) continue; price++;
      const cikT = symCikAt(SYMS[i], D[t]) || cik, sh = cikT ? SH.c[cikT] : null; if (!sh) noShares++; const up = sh ? sharesUp(sh, D[t]) : null; if (up === null || !(up < N0.shareUp)) continue;
      if (cikT && dilutedAt(DIL.get(cikT), t, sessOf, N0.dilSess)) continue; supply++;
      out.push({ id: 'SQ22-NEGLECTED', sym: SYMS[i], i, t, k: t + 1, stop: LA[b + t], cik: cikT }); } }
  SIGS['SQ22-NEGLECTED'] = out.sort((a, b) => a.t - b.t || a.i - b.i);
  STATUS.neglected = { baseStockDays: base, priceStockDays: price, signals: supply, noShareSeries: noShares, quietDays: QUIET.size, baseDayReasons: DIAG ? NWHY : undefined, older: out.filter(z => halfOf(D[z.t]) === 'older').length, newer: out.filter(z => halfOf(D[z.t]) === 'newer').length };
  log('NEGLECTED: ' + JSON.stringify(STATUS.neglected)); }
// the CIK of a ticker on a date: a Form 3/4/5 span of that ticker covering the date (most filings), else null (the caller falls back on today's list)
function symCikAt(sym, d) { if (!SYMCIK) { SYMCIK = new Map(); for (const [cik, sp] of CIKMAP) for (const [s, f, l, n] of sp) (SYMCIK.get(s) || SYMCIK.set(s, []).get(s)).push([cik, f, l, n]); }
  const a = (SYMCIK.get(sym) || []).filter(x => d >= addDays(x[1], -400) && d <= addDays(x[2], 400)).sort((p, q) => q[3] - p[3]); return a.length ? a[0][0] : null; }
var SYMCIK;
STATUS.dataOk = !!(STATUS.price.ok && STATUS.tickerMap.ok && STATUS.master.ok && STATUS.facts.ok && STATUS.fund.ok);
const COUNTS = Object.fromEntries(TEST_IDS.map(id => { const a = SIGS[id] || [], h = id === 'SQ22-SPINOFF' ? (z) => D[Math.min(z.k, T - 1)] : (z) => D[z.t]; return [id, { older: a.filter(z => z.k < T && halfOf(h(z)) === 'older').length, newer: a.filter(z => z.k < T && halfOf(h(z)) === 'newer').length }]; }));
log('signals (before one-open-per-stock): ' + JSON.stringify(COUNTS));
if (DIAG) { const samp = (id, f) => (SIGS[id] || []).filter((z, j, a) => j % Math.max(1, Math.floor(a.length / 25)) === 0).slice(0, 25).map(f);
  const perYr = Object.fromEntries(TEST_IDS.map(id => [id, (SIGS[id] || []).reduce((a, z) => { const y = D[Math.min(z.t, T - 1)].slice(0, 4); a[y] = (a[y] || 0) + 1; return a; }, {})]));
  W('data/squad22-diag.json', { generatedAt: new Date().toISOString(), note: 'DIAG: data coverage, case counts and samples only; no returns computed, no verdict', window: [D[0], D[T - 1]], data: STATUS, signals: COUNTS, signalsByYear: perYr,
    sample: { cashconv: samp('SQ22-CASHCONV', z => ({ sym: z.sym, cik: z.cik, filed: z.F, E0: z.E0, r: z.r, gm: z.gm, dil: z.dil })), neglected: samp('SQ22-NEGLECTED', z => ({ sym: z.sym, d: D[z.t], close: r4(CA[z.i * T + z.t]) })) } });
  console.log('SQUAD 22 DIAG ' + D[0] + ' to ' + D[T - 1] + ' | ' + ['price', 'tickerMap', 'master', 'facts', 'fund'].map(k => k + (STATUS[k] && STATUS[k].ok ? ' ok' : ' MISSING')).join(', ') + ' | ' + JSON.stringify(COUNTS)); process.exit(0); }

// ================= 4. TRADES AND THE 5-YEAR ONE-SHOT =================
const UNIV = { 'SQ22-CASHCONV': (i, t) => !!LIQ[i * T + t], 'SQ22-SPINOFF': (i, t) => !!LIQ[i * T + t], 'SQ22-NEGLECTED': (i, t) => CA[i * T + t] >= TH.negl.minClose && DVA[i * T + t] >= TH.negl.minDv };
const exitFor = (id, z, end) => { const S = series(z.i); return id === 'SQ22-NEGLECTED' ? exitNegl(S, z.k, z.stop, end + 1) : exitHold(S, z.k, id === 'SQ22-CASHCONV' ? TH.cash.stop : TH.spin.stop, id === 'SQ22-CASHCONV' ? TH.cash.hold : TH.spin.hold, end + 1); };
const quietSpan = (t, k, x, self) => { const v = []; for (const j of QUIET.get(t) || []) { if (j === self || artifactIn(j, k - 1, x)) continue; const g = ret(j, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } return v.length >= TH.negl.ctlMin ? mean(v) : null; };
function tradesOf(id, sigs, end = T - 1) { const out = [], busy = new Map(), spans = new Map(); let artifacts = 0, noYard = 0;
  for (const z of sigs) { if (z.pending || z.k > end) continue; if ((busy.get(z.i) ?? -1) >= z.k) continue; const ex = exitFor(id, z, end); if (!ex || ex.open) continue;
    if (artifactIn(z.i, Math.max(0, z.t - 29), ex.x)) { artifacts++; continue; } const e = OA[z.i * T + z.k], g = ex.px / e - 1, lc = Math.max(z.k, ex.lastClose), c = ctrlSpan(z.k, lc); if (c === null) { noYard++; continue; }
    busy.set(z.i, ex.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, ex.x]);
    const hd = id === 'SQ22-SPINOFF' ? D[z.k] : D[z.t];
    out.push({ t: z.t, s: z.sym, i: z.i, k: z.k, x: ex.x, lc, kind: ex.kind, days: Math.max(1, ex.held), g: capG(g), g0: g, c, spy: spyRet(z.k, lc), half: halfOf(hd),
      y2: id === 'SQ22-CASHCONV' ? v15Span(z.t, z.k, lc) : id === 'SQ22-NEGLECTED' ? quietSpan(z.t, z.k, lc, z.i) : null, F: z.F || z.filed || null, cik: z.cik, r: z.r, gm: z.gm, dil: z.dil }); }
  const ownMemo = new Map(), U = UNIV[id];
  for (const z of out) { const len = z.lc - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 30, to: end, len, step: 10, busy: spans.get(z.i) || [], mode: 'capBoth', okAt: (u) => U(z.i, u - 1) && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  out.artifacts = artifacts; out.noYard = noYard; return out; }
const RES = {}, need = TEST_IDS.filter(id => !FROZEN[id]), lastFull = (() => { const m = D[T - 1].slice(0, 7), mm = +m.slice(5, 7), yy = +m.slice(0, 4); return mm === 1 ? (yy - 1) + '-12' : yy + '-' + String(mm - 1).padStart(2, '0'); })();
const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
for (const id of TEST_IDS) { if (!need.includes(id) && !env.HISTORY) continue; const R0 = RULES[id], B = R0.block;
  if (!STATUS.dataOk) { RES[id] = { verdict: 'NOT RUN', why: 'data not complete this run: ' + JSON.stringify({ price: STATUS.price.ok, tickerMap: STATUS.tickerMap.ok, master: STATUS.master.ok, facts: STATUS.facts, fund: STATUS.fund }).slice(0, 400) }; log('- ' + id + ': NOT RUN (data)'); continue; }
  if (id === 'SQ22-SPINOFF') { const cn = COUNTS[id]; if (cn.older < TH.spin.minPerHalf || cn.newer < TH.spin.minPerHalf) {
    RES[id] = { verdict: 'TOO FEW CASES', name: R0.name, kind: 'buy', family: R0.family, hold: R0.hold, block: B, cases: cn, why: 'count first (pre-registered): ' + cn.older + ' liquid cases in the older half and ' + cn.newer + ' in the newer half (20 needed in each); no return was computed', spinoff: STATUS.spinoff };
    log('- ' + id + ': TOO FEW CASES ' + JSON.stringify(cn) + ' (no return computed)'); continue; } }
  const tr = tradesOf(id, SIGS[id]), R = { older: halfStat(tr.filter(z => z.half === 'older'), B), newer: halfStat(tr.filter(z => z.half === 'newer'), B), all: halfStat(tr, B) };
  const PY = Object.fromEntries(['older', 'newer'].map(h => { const a = tr.filter(z => z.half === h); return [h, { rule: r4(perYear(a)), spy: r4(perYear(a.filter(z => ok(z.spy)).map(z => ({ g: z.spy, days: z.days })), 'g', 0)), avgStock: r4(perYear(a.map(z => ({ g: z.c, days: z.days })), 'g', 0)) }]; }));
  const extra = []; let Y2 = null;
  if (id === 'SQ22-CASHCONV' || id === 'SQ22-NEGLECTED') { const nm = id === 'SQ22-CASHCONV' ? 'V15 picks bought and sold on the same sessions' : 'same-day crashed neglected stocks without the 2x volume';
    Y2 = Object.fromEntries(['older', 'newer'].map(h => { const a = tr.filter(z => z.half === h && ok(z.y2)); return [h, { n: a.length, rule: r4(mean(a.map(z => z.g - COST))), yardstick: r4(mean(a.map(z => z.y2 - COST))), edge: r4(mean(a.map(z => z.g - z.y2))) }]; }));
    Y2.name = nm; for (const h of ['older', 'newer']) if (!(Y2[h].edge > 0)) extra.push('not better than ' + nm + ' in the ' + h + ' half (' + pc(Y2[h].edge) + ' a trade over ' + Y2[h].n + ' trades)'); }
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] }, extra });
  const hd = id === 'SQ22-SPINOFF' ? (z) => D[z.k] : (z) => D[z.t], pm = perMonth(tr.map(hd), D[30].slice(0, 7), lastFull), pmSig = perMonth(SIGS[id].filter(z => z.k < T && !z.pending).map(hd), D[30].slice(0, 7), lastFull);
  const byY = {}; for (const z of tr) { const y = hd(z).slice(0, 4); (byY[y] = byY[y] || []).push(z); }
  RES[id] = { ...v, name: R0.name, kind: 'buy', family: R0.family, hold: R0.hold, block: B, results: R, perYear: PY, secondYardstick: Y2,
    signalsPerMonth: { trades: { mean: pm.mean, median: pm.median, min: pm.min, max: pm.max, zeroMonths: pm.zeroMonths, months: pm.months }, signalsBeforeOneOpen: { mean: pmSig.mean, median: pmSig.median, min: pmSig.min, max: pmSig.max, zeroMonths: pmSig.zeroMonths }, byMonth: pm.byMonth },
    calendarYears: Object.fromEntries(Object.keys(byY).sort().map(y => [y, { n: byY[y].length, avg: r4(mean(byY[y].map(z => z.g - COST))), perYear: r4(perYear(byY[y])), spyPerYear: r4(perYear(byY[y].filter(z => ok(z.spy)).map(z => ({ g: z.spy, days: z.days })), 'g', 0)) }])),
    shape: shapeOf(tr), artifactsLeftOut: tr.artifacts, noYardstick: tr.noYard, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1: trades and every yardstick capped at +300% alike)', cases: COUNTS[id],
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], filed: z.F, buy: D[z.k], sell: D[z.x], exit: z.kind, held: z.days, net: r4(z.g - COST), avgStock: r4(z.c - COST), second: r4(ok(z.y2) ? z.y2 - COST : null), sameStock: r4(ok(z.own) ? z.own - COST : null), spy: r4(z.spy), r: z.r, gm: z.gm, dil: z.dil })) };
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + (Y2 ? ' | 2nd yardstick edge ' + pc(Y2.older.edge) + ' / ' + pc(Y2.newer.edge) : '') + ' | per year ' + pc(PY.older.rule) + ' vs SPY ' + pc(PY.older.spy) + ' / ' + pc(PY.newer.rule) + ' vs ' + pc(PY.newer.spy) + ' | per month ' + pm.mean + ' | ' + RES[id].why.slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);

// ================= 5. PAPER LANES (from 26 Oct 2026) =================
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), sigIds = new Set(sigLines.map(x => x.id)), newLines = [], lastT = T - 1;
const exitLine = (x, i, k) => x.m === 'SQ22-NEGLECTED' ? exitNegl(series(i), k, x.stop, T) : exitHold(series(i), k, x.m === 'SQ22-CASHCONV' ? TH.cash.stop : TH.spin.stop, x.hold, T);
const busyNow = (x) => { if (x.late || resolved.has(x.id)) return false; const i = SY.get(x.sym), k = x.entryDate ? tOf.get(x.entryDate) : undefined; if (i === undefined || k === undefined || k >= T) return true; const ex = exitLine(x, i, k); return !!ex && (ex.open || ex.x >= T); };
if (STATUS.dataOk) for (const id of TEST_IDS) { const openStock = new Set(sigLines.filter(x => x.m === id && busyNow(x)).map(x => x.sym)), hold = RULES[id].hold;
  for (const z of SIGS[id] || []) { if (z.k > T) continue; const sd = id === 'SQ22-CASHCONV' ? z.F : D[z.k - 1]; if (sd < START) continue;
    const key = id === 'SQ22-CASHCONV' ? z.F : id === 'SQ22-SPINOFF' ? z.filed : sd, sid = id + '|' + z.sym + '|' + key; if (sigIds.has(sid) || openStock.has(z.sym)) continue;
    const late = z.k <= lastT, entry = z.k === T ? nextSession(D[lastT]) : z.k < T ? D[z.k] : null;
    const plan = id === 'SQ22-NEGLECTED' ? 'buy at the open of ' + entry + ' (that session only); stop ' + r4(z.stop) + ' (the signal-day low); sell at the next open after a close below the 10-day average; at most 21 sessions'
      : 'buy at the open of ' + entry + ' (that session only); stop 35% under the entry; sell at the close of the 126th session';
    const line = { type: 'signal', id: sid, m: id, sym: z.sym, d: sd, filed: z.F || z.filed || null, close: r4(CA[z.i * T + Math.min(z.t, T - 1)]), stop: id === 'SQ22-NEGLECTED' ? r4(z.stop) : null, halal: halal(z.sym), hold,
      entryDate: late ? null : entry, late, recordedAfter: D[lastT], plan: (late ? 'LATE (data arrived after the entry session): not a paper trade; ' : '') + plan };
    sigIds.add(sid); if (!late) openStock.add(z.sym); newLines.push(line); sigLines.push(line); } }
for (const x of sigLines) { const i = SY.get(x.sym), k = x.entryDate ? tOf.get(x.entryDate) : undefined; if (x.late) { x._state = 'late'; continue; } if (i === undefined || k === undefined || k >= T) { x._state = 'waiting'; continue; }
  const ex = exitLine(x, i, k); if (!ex) { x._state = 'void'; continue; } if (ex.open) { x._state = 'open'; x._k = k; x._mark = ex.mark; continue; }
  const g = ex.px / OA[i * T + k] - 1, lc = Math.max(k, ex.lastClose), c = ctrlSpan(k, lc); x._state = 'closed'; x._g = g; x._c = c; x._k = k; x._spy = spyRet(k, lc); x._days = Math.max(1, ex.held);
  if (!resolved.has(x.id)) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[ex.x], exit: ex.kind, held: x._days, g: r4(g), net: r4(capG(g) - COST), avgStock: c === null ? null : r4(c - COST), spy: r4(x._spy) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
const board = {}, today = {};
for (const m of TEST_IDS) { const mine = sigLines.filter(x => x.m === m), closed = mine.filter(x => x._state === 'closed').map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c, spy: x._spy, days: x._days, halal: x.halal })), fr = firstRun[m];
  board[m] = { name: RULES[m].name, hold: RULES[m].hold, signals: mine.length, waiting: mine.filter(x => x._state === 'waiting').length, open: mine.filter(x => x._state === 'open').length, late: mine.filter(x => x._state === 'late').length,
    closed: boardStats(closed), halalOk: boardStats(closed.filter(z => z.halal === 'ok')), frozen: fr ? { verdict: fr.verdict, frozenAt: fr.frozenAt || null } : null };
  today[m] = { name: RULES[m].name, hold: RULES[m].hold, tier: fr ? fr.verdict : null,
    newSignals: mine.filter(x => x.recordedAfter === D[lastT] && !x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, stop: x.stop, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, buy: D[x._k], sinceBuy: r4(x._mark ?? NaN) })) }; }
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, note: 'PAPER ONLY. Squad 22 (new mechanisms). A rule is a buy only if its frozen 5-year verdict meets the TRY SMALL standard (data/squad22-lab.json firstRun). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, cost: COST, methods: board }, null, 1));
log('paper: ' + newLines.filter(x => x.type === 'signal').length + ' new signal lines, ' + newLines.filter(x => x.type === 'result').length + ' new results');

// ================= 6. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), squad: 22, philosophy: 'new mechanisms only (owner anti-fixation rules, 25 Oct 2026): cash-conversion inflection (SEC filing-date event), spin-offs after index selling (count first), neglected-then-noticed (outside reviewer, as written)',
  preRegistered: 'squad22-core.mjs header (25 Oct 2026, before any run) + data/strategy-library.json SQ22-*', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS, signalCounts: COUNTS,
  standard: 'both halves (before / from ' + SPLIT + '): > 0 after 0.8% and 1.2%, better than the average liquid stock over the same sessions, better than the same stock on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks, block t >= ' + TIER2_T + ', return per year of capital above SPY -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN; plus each rule\'s own extra yardstick (CASHCONV: V15 same sessions; NEGLECTED: same-day quiet crashed stocks). Every gross return capped at +300% (AUD-1).',
  notRun: NOT_RUN, firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-800)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of TEST_IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue;
    e.status = 'tested: ' + r.verdict.toLowerCase() + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'squad22-lab.mjs -> data/squad22-lab.json (run once as written, first complete run frozen)';
    if (r.results) { const R = r.results; e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn],
      noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy],
      secondYardstickEdge: r.secondYardstick ? [r.secondYardstick.older.edge, r.secondYardstick.newer.edge] : null, signalsPerMonth: r.signalsPerMonth.trades.mean, why: r.why }; }
    else e.result = { verdict: r.verdict, n: [r.cases ? r.cases.older : 0, r.cases ? r.cases.newer : 0], why: r.why };
    ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad22-lab: library not updated: ' + e.message); }
console.log('SQUAD 22 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | ' + (Object.entries(firstRun).map(([k, r]) => k + ' ' + r.verdict).join(', ') || 'nothing frozen') + ' | ' + ['price', 'tickerMap', 'master', 'facts', 'fund'].map(k => k + (STATUS[k] && STATUS[k].ok ? ' ok' : ' MISSING')).join(', '));
