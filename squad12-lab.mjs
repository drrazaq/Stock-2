// SQUAD 12 LAB: "EVENTS IN BIG COMPANIES ONLY" (24 Oct 2026; the owner's squad competition). Research + a FORWARD PAPER lane; never
// places an order; no Telegram. Rules: squad12-core.mjs (SQ12-*, pre-registered 24 Oct 2026 before any run; the lab writes the same rule
// text into data/strategy-library.json before computing anything).
// 1. DATA (GitHub Actions only; keys only from secrets, never printed; official / public sources):
//    prices   = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY, dead stocks included, with
//               highs and lows) + the sessions since (Massive grouped daily) + splits since the cache day.
//    universe = Squad 5's point-in-time market values (squad5-core capAt / byCap): ticker map, SEC facts, statement share counts, split list
//               and domicile read from Squad 4's / Squad 5's caches (RESTORED READ ONLY, never saved under their keys); anything missing is
//               fetched into this lab's own cache (squad12-cache).
//    earnings = the Nasdaq earnings calendar (date + before-open / after-close), from Agent A's / the angles lab's caches (read only),
//               the missing days fetched into squad12-cache.
//    SEC XBRL = company facts (revenue tags + diluted EPS, with filing date, form and accession) of every company that was among the 300
//               largest at a month start, fetched by CIK into squad12-cache (refreshed for today's 300 largest each run: the paper lane).
//    8-K text = SEC EDGAR full-text search: Squad 1's guidance-raise hits (squad1-cache, read only, else fetched here) and the investor /
//               analyst day phrases (fetched here, with the 8-K item numbers).
// 2. 5-YEAR ONE-SHOT of every SQ12 rule not yet frozen; first complete verdict frozen in data/squad12-lab.json firstRun.
// 3. PAPER LANE from Monday 26 Oct 2026: data/squad12-paper.jsonl, data/squad12-today.json (methods[id].newSignals), data/squad12-board.json.
// DIAG=1: coverage + event counts per rule and half (no returns, nothing judged, nothing written in data/).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { cikFromSpans, artifactJumps, hasArtifact } from './squad4-core.mjs';
import { byCap, capAt, usCompany, monthStarts } from './squad5-core.mjs';
import { GUIDE_PHRASES } from './squad1-core.mjs';
import { RULES, IDS, COST, STRESS, SPLIT, PAPER_START, CAP, HOLD, YEAR, TOPN, TOP100, GUIDE_GAP_DAYS, INV_GAP_DAYS, INV_PHRASES, mean, r4, halfOf, addDays,
  onOrAfter, after, reactionIdx, monthStartFor, gapHolds, newHigh, confirmIdx, filingsOf, revGrowth, epsGrowth, accel2, firstPer, oneOpen, eftsRows, invItemsOk, byYear,
  boardStats, paperReady, preRegister, GROW } from './squad12-core.mjs';
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov', EFTS = local(env.EFTS_BASE) || 'https://efts.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ12_CACHE || 'squad12-cache', SC4 = 'squad4-cache', SC5 = 'squad5-cache', SC1 = 'squad1-cache';
const OUT = env.SQ12_OUT || 'data/squad12-lab.json', PAPER = 'data/squad12-paper.jsonl', TODAY = 'data/squad12-today.json', BOARD = 'data/squad12-board.json', LIB = env.SQ12_LIB || 'data/strategy-library.json';
const START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ12_MINUTES || 150) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};
log('squad 12 lab' + (DIAG ? ' (DIAG: coverage and event counts only)' : '') + '; frozen already: ' + Object.keys(FROZEN).length + '/' + IDS.length);

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ12 entries written now'); }

// ================= 1. PRICES (squad5-lab pattern, with highs and lows) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad12-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
let hlRows = 0, allRows = 0;
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; MAIN[k] = 1; allRows++; if (x.h && x.l) { HA[k] = x.h[j]; LA[k] = x.l[j]; if (x.h[j] > 0) hlRows++; } }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o[j]; VA[k] = x.x.v ? x.x.v[j] : NaN; if (x.x.h && x.x.l) { HA[k] = x.x.h[j]; LA[k] = x.x.l[j]; } } });
store = null; STATUS.highLow = { ok: hlRows >= allRows * 0.98, rows: allRows, withHighLow: hlRows };
if (!OFFLINE) { const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; CA[q] /= r; HA[q] /= r; LA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), cl = (i) => CA.subarray(i * T, i * T + T), CC = (i, t) => CA[i * T + t], OO = (i, t) => OA[i * T + t];
if (spyI === undefined) { console.log('squad12-lab: SPY missing from the cache; nothing done'); process.exit(0); }
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

// ================= 2. UNIVERSE: Squad 5's point-in-time market values =================
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : (/^\d{4}-\d\d-\d\d/.test(String(s || '')) ? String(s).slice(0, 10) : null); };
function download(url, file) { if (OFFLINE) return false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
function parseMap(zip) { let txt; try { txt = execFileSync('unzip', ['-p', zip, 'SUBMISSION.tsv'], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const L = txt.split(/\r?\n/), H = L[0].split('\t'), ix = (k) => H.indexOf(k);
  const a = ix('FILING_DATE'), c = ix('ISSUERCIK'), s = ix('ISSUERTRADINGSYMBOL'); if (a < 0 || c < 0 || s < 0) return null; const map = new Map();
  for (const l of L.slice(1)) { if (!l) continue; const r = l.split('\t'), d = isoD(r[a]), cik = String(+r[c] || ''), sym = String(r[s] || '').toUpperCase().trim().replace(/-/g, '.'); if (!d || !cik || !/^[A-Z][A-Z0-9.]{0,6}$/.test(sym) || sym === 'NONE' || sym === 'NA') continue;
    const k = sym + '|' + cik, o = map.get(k); if (!o) map.set(k, [sym, cik, d, d, 1]); else { if (d < o[2]) o[2] = d; if (d > o[3]) o[3] = d; o[4]++; } }
  return { map: [...map.values()] }; }
const TMAP = new Map(); { const qs = [], now = new Date(); for (let y = 2021; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, q * 3, 1)) < now) qs.push(y + 'q' + q);
  const fail = []; let got = 0;
  for (const q of qs) { let x = JZ(SC4 + '/f345/' + q + '.json.gz', null) || JZ(SC5 + '/f345/' + q + '.json.gz', null) || JZ(SC + '/f345/' + q + '.json.gz', null);
    if (!x && !OFFLINE) { for (const p of ['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/']) { const zip = SC + '/f345.zip'; if (!download(SEC + p + q + '_form345.zip', zip)) continue;
      const r = parseMap(zip); try { fs.unlinkSync(zip); } catch (e) {} if (r) { x = r; WZ(SC + '/f345/' + q + '.json.gz', x); got++; break; } } }
    if (!x) { fail.push(q); continue; } for (const m of x.map) (TMAP.get(m[0]) || TMAP.set(m[0], []).get(m[0])).push([m[1], m[2], m[3], m[4]]); }
  for (const [s, a] of TMAP) { const by = new Map(); for (const [c, f, l, n] of a) { const o = by.get(c); if (!o) by.set(c, [c, f, l, n]); else { if (f < o[1]) o[1] = f; if (l > o[2]) o[2] = l; o[3] += n; } } TMAP.set(s, [...by.values()]); }
  STATUS.tickerMap = { ok: qs.slice(0, -1).every(q => !fail.includes(q)), quarters: qs.length, downloadedNow: got, missing: fail, tickers: TMAP.size }; log('ticker map: ' + JSON.stringify(STATUS.tickerMap)); }
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {}, c: {} });
const cikMemo = new Map(); function cikAt(i, d) { const s = SYMS[i], k = i + '|' + d.slice(0, 7); if (cikMemo.has(k)) return cikMemo.get(k);
  let c = cikFromSpans(TMAP.get(s) || TMAP.get(s.replace(/\./g, '-')), d); if (!c && (!vanishedI(i) || lastI[i] >= T - 260)) { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) c = String(a); else { const y = SECCIK[s]; if (y) c = String(y[0]); } }
  cikMemo.set(k, c || null); return c || null; }
// SEC facts (Squad 4 / Squad 5 caches, read only): revenue presence (= operating company) + cover-page share counts
const REV_TAGS = ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'];
const FXC = {}; let fromCaches = 0; for (const dir of [SC4, SC5]) for (let k = 0; k < 16; k++) { const a = JZ(dir + '/facts-' + k + '.json.gz', null); if (a) for (const [c, v] of Object.entries(a)) if (!(c in FXC)) { FXC[c] = v; fromCaches++; } }
const MS = monthStarts(D);
{ const need = new Set(); for (const t of MS) for (const i of liqList(t)) { const c = cikAt(i, D[t]); if (c) need.add(c); }
  const ans = [...need].filter(c => c in FXC).length; STATUS.facts = { ok: need.size > 0 && ans >= need.size * 0.95, companies: need.size, answered: ans, fromCaches }; log('SEC facts (Squad 4/5 caches): ' + JSON.stringify(STATUS.facts)); }
const hasRev = (cik) => { const a = FXC[cik]; return !!a && REV_TAGS.some(t => a[t]); };
const coverRows = (cik) => SH.raw && SH.raw[cik] && SH.raw[cik].length ? SH.raw[cik] : (FXC[cik] && FXC[cik]._sh) || null;
const ALT = { ...J(SC5 + '/alt-shares-v3.json', {}), ...J(SC + '/alt-shares-v3.json', {}) }, SUBS = { ...J(SC5 + '/subs.json', {}), ...J(SC + '/subs.json', {}) };
const ALT_TAGS = ['WeightedAverageNumberOfSharesOutstandingBasic', 'WeightedAverageNumberOfDilutedSharesOutstanding', 'CommonStockSharesOutstanding'];
function altFrom(j) { const g = j && j.facts && j.facts['us-gaap']; if (!g) return []; const m = new Map();
  for (const tag of ALT_TAGS) { const u = g[tag] && g[tag].units && g[tag].units.shares; if (!Array.isArray(u)) continue; const cur = new Map();
    for (const x of u) { if (!x || !x.filed || !x.end || !(x.val > 0) || x.end < '2019-01-01') continue; if (x.start) { const dd = (Date.parse(x.end) - Date.parse(x.start)) / 864e5 + 1; if (!((dd >= 80 && dd <= 100) || (dd >= 350 && dd <= 380))) continue; }
      const o = cur.get(x.filed); if (!o || x.end > o[1] || (x.end === o[1] && x.val > o[2])) cur.set(x.filed, [x.filed, x.end, x.val]); }
    for (const [f, r] of cur) { const o = m.get(f); if (!o || r[1] > o[1] || (r[1] === o[1] && r[2] > o[2])) m.set(f, r); } }
  return [...m.values()].sort((a, b) => a[0] < b[0] ? -1 : 1); }
const SPL = new Map(); { let rows = J(SC5 + '/splits.json', null), pages = 0; const mine = J(SC + '/splits.json', null); if (mine && (!rows || mine.length >= rows.length)) rows = mine;
  if (!OFFLINE) { const got = []; let path = '/stocks/v1/splits?execution_date.gte=2021-01-01&limit=1000', ok2 = false;
    while (path && pages < 80) { const j = await api(path); pages++; if (!j || j.refused || !Array.isArray(j.results)) break; got.push(...j.results); if (!j.next_url) { ok2 = true; break; } path = String(j.next_url).replace(/^https?:\/\/[^/]+/, ''); }
    if (ok2 && got.length > 500) { rows = got.map(x => [String(x.ticker || '').toUpperCase(), String(x.execution_date || ''), +x.split_from, +x.split_to, String(x.adjustment_type || '')]); W(SC + '/splits.json', rows); } }
  for (const [t, d, f, to, kind] of rows || []) { if (!t || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(kind)) continue; (SPL.get(t) || SPL.set(t, []).get(t)).push([d, to / f]); }
  for (const a of SPL.values()) a.sort((x, y) => x[0] < y[0] ? -1 : 1);
  STATUS.splits = { ok: (rows || []).length > 500, rows: (rows || []).length, tickers: SPL.size, pagesNow: pages }; log('split list: ' + JSON.stringify(STATUS.splits)); }
const capOf = (i, cik, t) => { const r = capAt({ adjClose: CC(i, t), d: D[t], splits: SPL.get(SYMS[i]) || SPL.get(SYMS[i].replace(/\./g, '-')), cover: coverRows(cik), alt: ALT[cik] }); return r ? r.cap : null; };
const coverOk = (cik, d) => { const lim = addDays(d, -30); return (coverRows(cik) || []).some(([e, n]) => e <= lim && n > 0); };
function rowsAt(t, useDom) { const rows = new Map(); let noCik = 0, noFacts = 0, noShares = 0, foreign = 0;
  for (const i of liqList(t)) { const cik = cikAt(i, D[t]); if (!cik) { noCik++; continue; } if (!hasRev(cik)) { noFacts++; continue; } if (useDom && SUBS[cik] && SUBS[cik].us === false) { foreign++; continue; } const cap = capOf(i, cik, t); if (!cap) noShares++;
    const r = { key: i, i, cik, dv: DV20[i * T + t], close: CC(i, t), cap }, o = rows.get(cik); if (!o || r.dv > o.dv) rows.set(cik, r); }
  return { rows: [...rows.values()], noCik, noFacts, noShares, foreign }; }
const secGet = async (url) => { await sleep(local(env.SEC_BASE) ? 0 : 110); try { const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); if (r.ok) return { ok: true, j: await r.json().catch(() => null) }; return { ok: false, status: r.status }; } catch (e) { return { ok: false, status: 0 }; } };
const FORM_T = [...MS.filter(x => x >= 19), T - 1];
{ const want = new Set(); for (const t of FORM_T) { for (const i of liqList(t)) { const cik = cikAt(i, D[t]); if (cik && hasRev(cik) && !coverOk(cik, D[t]) && !(cik in ALT)) want.add(cik); }
    for (const r of byCap(rowsAt(t, false).rows).slice(0, 500)) if (!(r.cik in ALT)) want.add(r.cik); }
  let got = 0; if (!OFFLINE) for (const c of want) { if (left() < 100 * 60e3) break; const r = await secGet(SECD + '/api/xbrl/companyfacts/CIK' + c.padStart(10, '0') + '.json'); if (r.ok && r.j) { ALT[c] = altFrom(r.j); got++; } else if (r.status === 404) ALT[c] = []; }
  if (got) W(SC + '/alt-shares-v3.json', ALT); STATUS.altShares = { ok: [...want].filter(c => !(c in ALT)).length <= Math.max(5, want.size * 0.02), wanted: want.size, fetchedNow: got }; log('statement share counts: ' + JSON.stringify(STATUS.altShares)); }
{ const want = new Set(); for (const t of FORM_T) for (const r of byCap(rowsAt(t, false).rows).slice(0, 500)) if (!(r.cik in SUBS)) want.add(r.cik);
  let got = 0; if (!OFFLINE) for (const c of want) { if (left() < 100 * 60e3) break; const r = await secGet(SECD + '/submissions/CIK' + c.padStart(10, '0') + '.json');
    if (r.ok && r.j) { const j = r.j, st = j.addresses && j.addresses.business && j.addresses.business.stateOrCountry, forms = (j.filings && j.filings.recent && j.filings.recent.form) || []; SUBS[c] = { st: st || null, us: usCompany(st, forms), sic: j.sic ? String(j.sic).padStart(4, '0') : '' }; got++; } else if (r.status === 404) SUBS[c] = { st: null, us: false, sic: '' }; }
  if (got) W(SC + '/subs.json', SUBS); const still = [...want].filter(c => !(c in SUBS)).length; STATUS.domicile = { ok: still <= Math.max(5, want.size * 0.02), wanted: want.size, fetchedNow: got, missing: still }; log('domicile: ' + JSON.stringify(STATUS.domicile)); }
const uniMemo = new Map();
function universe(t) { if (uniMemo.has(t)) return uniMemo.get(t); const X = rowsAt(t, true), ranked = byCap(X.rows); ranked.forEach((r, j) => { r.rank = j; });
  const byCik = new Map(ranked.map(r => [r.cik, r])), byI = new Map(ranked.map(r => [r.i, r])); const out = { ranked, byCik, byI, companies: X.rows.length }; uniMemo.set(t, out); return out; }
// rank (0-based) of a company at the latest month start on or before t: by CIK, else by the stock; null if not ranked / not in the top TOPN
const rankAt = (t, cik, i) => { const m = monthStartFor(MS, t); if (m < 19) return null; const U = universe(m), r = (cik && U.byCik.get(String(cik))) || (i !== null && i !== undefined ? U.byI.get(i) : null); return r && r.rank < TOPN ? r : null; };
const BIGCIK = new Set(); for (const t of FORM_T) for (const r of universe(t).ranked.slice(0, TOPN)) BIGCIK.add(r.cik);
log('companies ever among the ' + TOPN + ' largest at a month start: ' + BIGCIK.size);

// ================= 3. SEC XBRL quarterly revenue + diluted EPS of the big companies (own cache, by CIK) =================
const EPS_TAGS = ['EarningsPerShareDiluted', 'EarningsPerShareBasicAndDiluted', 'EarningsPerShareBasic'];
function compact12(j) { const g = j && j.facts && j.facts['us-gaap']; if (!g) return { rev: {}, eps: null };
  const rowsOf = (u) => { const out = [], seen = new Set(); for (const x of u || []) { if (!x || !x.end || !x.filed || !isFinite(x.val) || x.end < '2018-01-01' || !x.start) continue; const k = x.start + '|' + x.end + '|' + x.val + '|' + x.accn; if (seen.has(k)) continue; seen.add(k); out.push([x.start, x.end, x.val, x.filed, x.form || '', x.accn || '']); } return out; };
  const rev = {}; for (const t of REV_TAGS) { const u = g[t] && g[t].units && g[t].units.USD; if (Array.isArray(u)) { const r = rowsOf(u); if (r.length) rev[t] = r; } }
  let eps = null; for (const t of EPS_TAGS) { const u = g[t] && g[t].units && g[t].units['USD/shares']; if (Array.isArray(u)) { const r = rowsOf(u); if (r.length) { eps = r; break; } } }
  return { rev, eps }; }
const NSH = 8, F12 = {}; for (let k = 0; k < NSH; k++) Object.assign(F12, JZ(SC + '/facts12-' + k + '.json.gz', {}));
{ const nowTop = new Set(universe(T - 1).ranked.slice(0, TOPN).map(r => r.cik)), stale = (c) => !F12[c] || (nowTop.has(c) && Date.now() - Date.parse(F12[c].at || 0) > 18 * 3600e3);
  const todo = [...BIGCIK].filter(c => !F12[c] || (!DIAG && stale(c))); let got = 0, fail = 0;
  if (!OFFLINE) for (const c of todo) { if (left() < 70 * 60e3) break; const r = await secGet(SECD + '/api/xbrl/companyfacts/CIK' + c.padStart(10, '0') + '.json');
    if (r.ok && r.j) { F12[c] = { at: new Date().toISOString(), ...compact12(r.j) }; got++; } else if (r.status === 404) { F12[c] = { at: new Date().toISOString(), rev: {}, eps: null }; got++; } else fail++;
    if (got && got % 200 === 0) log('XBRL facts fetched: ' + got + '/' + todo.length); }
  if (got) { const parts = Array.from({ length: NSH }, () => ({})); for (const [c, v] of Object.entries(F12)) parts[+c % NSH][c] = v; parts.forEach((o, k) => WZ(SC + '/facts12-' + k + '.json.gz', o)); }
  const have = [...BIGCIK].filter(c => F12[c]).length, withRev = [...BIGCIK].filter(c => F12[c] && Object.keys(F12[c].rev || {}).length).length;
  STATUS.xbrl = { ok: have >= BIGCIK.size * 0.98 && withRev >= BIGCIK.size * 0.9, companies: BIGCIK.size, have, withRevenue: withRev, withEps: [...BIGCIK].filter(c => F12[c] && F12[c].eps).length, fetchedNow: got, failed: fail };
  log('XBRL (revenue + EPS): ' + JSON.stringify(STATUS.xbrl)); }
const taggedOf = (cik) => { const f = F12[cik]; if (!f) return null; const out = {}; for (const t of REV_TAGS) if (f.rev && f.rev[t]) out[t] = f.rev[t].map(([s, e, v, fd, form, accn]) => ({ s, e, v, f: fd, form, accn })); return out; };
const epsRows = (cik) => { const f = F12[cik]; return f && f.eps ? f.eps.map(([s, e, v, fd, form, accn]) => ({ s, e, v, f: fd, form, accn })) : null; };

// ================= 4. Nasdaq earnings calendar (other labs' caches read only; missing days fetched into the own cache) =================
const NQ_HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
const REPORTS = []; { const days = [], old = iso(Date.now() - 7 * 864e5), today = iso(Date.now()); for (let x = Date.parse(D[0] + 'T12:00:00Z'); x <= Date.now(); x += 864e5) { const w = new Date(x).getUTCDay(); if (w > 0 && w < 6) days.push(iso(x)); }
  let fetched = 0, miss = 0, fromOthers = 0;
  for (const d of days) { let rows = null; if (d < old) { rows = J(SC + '/nasdaq/' + d + '.json', null); if (!rows) for (const dir of ['angles-cache', 'anomaly-cache', 'a-cache']) { rows = J(dir + '/nasdaq/' + d + '.json', null); if (rows) { fromOthers++; break; } } }
    if (!rows) { if (OFFLINE || left() < 60 * 60e3) { miss++; continue; } await sleep(local(env.NASDAQ_BASE) ? 0 : 350); fetched++; let j = null;
      try { const r = await fetch(NQ + '/api/calendar/earnings?date=' + d, { headers: NQ_HEAD, signal: AbortSignal.timeout(30000) }); j = r.ok ? await r.json().catch(() => null) : null; } catch (e) { j = null; }
      if (!j || !j.data) { if (d < today) miss++; continue; } rows = (j.data.rows || []).map(x => { const s = String(x.symbol || '').trim(); if (!/^[A-Z]{1,5}$/.test(s)) return null; return [s, x.time === 'time-pre-market' ? 'bmo' : x.time === 'time-after-hours' ? 'amc' : null]; }).filter(Boolean); W(SC + '/nasdaq/' + d + '.json', rows); }
    for (const r of rows) REPORTS.push({ sym: r[0], d, time: r[1] || null }); }
  STATUS.earn = { ok: miss <= days.length * 0.03, days: days.length, missing: miss, fromOtherCaches: fromOthers, fetchedNow: fetched, reports: REPORTS.length, timed: REPORTS.filter(r => r.time).length };
  log('Nasdaq calendar: ' + JSON.stringify(STATUS.earn)); }

// ================= 5. EDGAR full-text search (8-K): guidance raises (Squad 1 cache read only) + investor / analyst days =================
let lastSec = 0; async function efj(url) { for (let a = 0; a < 4; a++) { const w = (local(env.EFTS_BASE) ? 0 : 125) - (Date.now() - lastSec); if (w > 0) await sleep(w); lastSec = Date.now();
    try { const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); if (r.status === 404) return null; if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; } if (!r.ok) return undefined; return await r.json(); } catch (e) { await sleep(1000 * (a + 1)); } } return undefined; }
async function efts(phrase, a, b) { const hits = []; for (let from = 0; from < 10000; from += 100) {
    const j = await efj(EFTS + '/LATEST/search-index?q=' + encodeURIComponent('"' + phrase + '"') + '&forms=8-K&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from);
    if (!j || !j.hits) return null; const tot = (j.hits.total && j.hits.total.value) || 0;
    if (from === 0 && tot >= 9900 && a < b) { const mid = iso((Date.parse(a) + Date.parse(b)) / 2), x = await efts(phrase, a, mid), y = await efts(phrase, addDays(mid, 1), b); return x && y ? x.concat(y) : null; }
    const h = eftsRows(j); hits.push(...h); if ((j.hits.hits || []).length < 100 || from + 100 >= tot) break; } return hits; }
const months = (from) => { const out = [], now = new Date(); for (let y = +from.slice(0, 4), m = +from.slice(5, 7); y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1); m === 12 ? (y++, m = 1) : m++) out.push(y + '-' + String(m).padStart(2, '0')); return out; };
const monthEnd = (m) => iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)), slug = (p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-'), FROM8K = D[0].slice(0, 7);
const FT = { complete: true, fetchedNow: 0, fromSquad1: 0, missing: [] };
async function phraseHits(phrase, useSq1) { const out = [];
  for (const m of months(FROM8K)) { const recent = m >= iso(Date.now() - 10 * 864e5).slice(0, 7), f = SC + '/efts/' + slug(phrase) + '/' + m + '.json'; let had = J(f, null);
    if (!had && useSq1 && !recent) { const s1 = J(SC1 + '/efts/' + slug(phrase) + '/' + m + '.json', null); if (s1) { had = s1.map(h => [h[1], String(+h[2]), h[3], null, h[5] || []]); FT.fromSquad1++; } }
    if (had && !recent) { out.push(...had); continue; } if (OFFLINE || left() < 50 * 60e3) { if (had) out.push(...had); else { FT.complete = false; FT.missing.push(phrase + ' ' + m); } continue; }
    const h = await efts(phrase, m + '-01', monthEnd(m)); FT.fetchedNow++; if (!h) { if (had) out.push(...had); else { FT.complete = false; FT.missing.push(phrase + ' ' + m); } continue; } W(f, h); out.push(...h); }
  return out; }
const GUHITS = [], INVHITS = []; for (const p of GUIDE_PHRASES) GUHITS.push(...(await phraseHits(p, true))); for (const p of INV_PHRASES) INVHITS.push(...(await phraseHits(p, false)));
STATUS.efts = { ok: FT.complete, fetchedNow: FT.fetchedNow, fromSquad1: FT.fromSquad1, missing: FT.missing.slice(0, 20), guidanceHits: GUHITS.length, investorDayHits: INVHITS.length, investorDayWithItems: INVHITS.filter(h => Array.isArray(h[3])).length };
STATUS.invItems = { ok: INVHITS.length > 0 && STATUS.efts.investorDayWithItems >= INVHITS.length * 0.9, hits: INVHITS.length, withItems: STATUS.efts.investorDayWithItems };
log('full-text search: ' + JSON.stringify(STATUS.efts));

// ================= 6. EVENTS -> signals { i, t, cik, rank } =================
const SIG = Object.fromEntries(IDS.map(id => [id, []])), CNT = Object.fromEntries(IDS.map(id => [id, { raw: 0, big: 0 }]));
const push = (id, i, t, cik, extra = {}) => { CNT[id].raw++; if (t < 1 || t > T - 1 || i === undefined || i === null || i < 0) return; const r = rankAt(t, cik, i); if (!r) return; CNT[id].big++; SIG[id].push({ i, t, cik: r.cik, rank: r.rank, ...extra }); };
// earnings (Nasdaq calendar; the ticker as it traded that day)
{ const seen = new Set(); for (const e of REPORTS) { const i = SY.get(e.sym); if (i === undefined) continue; const R = reactionIdx(D, e.d, e.time); if (R < 1 || R > T - 1) continue; const k = i + '|' + R; if (seen.has(k)) continue; seen.add(k);
    const cik = cikAt(i, D[R]), b = i * T + R, pcl = (() => { for (let q = R - 1; q >= Math.max(0, R - 5); q--) if (CA[i * T + q] > 0) return CA[i * T + q]; return NaN; })();
    if (gapHolds({ pc: pcl, o: OA[b], h: HA[b], l: LA[b], c: CA[b] })) push('SQ12-EGAPHOLD', i, R, cik, { ev: e.d + ' ' + e.time });
    if (newHigh(cl(i), R)) push('SQ12-EARN52H', i, R, cik, { ev: e.d + ' ' + e.time }); } }
// SEC filings (by CIK): the signal session = the last session on / before the filing date (entry = the first session after it)
for (const cik of BIGCIK) { const tagged = taggedOf(cik); if (!tagged) continue; const eps = epsRows(cik);
  for (const F of filingsOf(tagged)) { const ta = after(D, F.f); if (ta < 1 || ta > T) continue; const t = ta - 1; const r = rankAt(t, cik, null); if (!r) continue;
    if (F.form === '10-Q' && F.qEnd) { const rg = revGrowth(tagged, F.f, F.qEnd), eg = eps ? epsGrowth(eps, F.f, F.qEnd) : null; if (rg && ok(rg.g0) && eg && rg.g0 >= GROW && eg.g >= GROW) push('SQ12-REVEPS', r.i, t, cik, { ev: F.form + ' ' + F.f + ' q ' + F.qEnd + ' rev ' + pc(rg.g0) + ' eps ' + pc(eg.g) }); }
    const end = F.form === '10-Q' ? F.qEnd : F.end; if (end) { const rg = revGrowth(tagged, F.f, end); if (rg && accel2(rg.g)) push('SQ12-ACCEL2', r.i, t, cik, { ev: F.form + ' ' + F.f + ' q ' + end + ' growth ' + rg.g.map(pc).join(' > ') }); } } }
// 8-K text (by the filer's CIK; confirmed by a higher close)
const eightK = (hits, filterItems) => { const by = new Map(); for (const h of hits) { const [adsh, cik, d, items] = h; if (!adsh || !cik || !d) continue; const o = by.get(adsh); if (!o) by.set(adsh, { adsh, cik: String(+cik), d, items: items ? [...items] : null }); else if (items && !o.items) o.items = [...items]; }
  return [...by.values()].filter(x => !filterItems || invItemsOk(x.items)).map(x => ({ ...x, key: x.cik })); };
for (const [id, hits, gap, fil] of [['SQ12-RAISECONF', GUHITS, GUIDE_GAP_DAYS, false], ['SQ12-INVDAY', INVHITS, INV_GAP_DAYS, true]]) {
  const big = eightK(hits, fil).filter(x => BIGCIK.has(x.cik)); for (const e of firstPer(big, gap)) { const tb = onOrAfter(D, e.d) - 1; if (tb < 1) continue; const r0 = rankAt(tb, e.cik, null); if (!r0) continue;
    const i = r0.i, t = confirmIdx(D, cl(i), e.d); CNT[id].candidates = (CNT[id].candidates || 0) + 1; if (t < 0) continue; push(id, i, t, e.cik, { ev: '8-K ' + e.d + ' ' + e.adsh }); } }
for (const id of IDS) SIG[id] = oneOpen(SIG[id], HOLD);
const half = (a) => ({ older: a.filter(s => halfOf(D[s.t]) === 'older').length, newer: a.filter(s => halfOf(D[s.t]) === 'newer').length });
const DIAGS = { window: [D[0], D[T - 1]], sessions: T, data: STATUS, bigCompanies: BIGCIK.size,
  top300Now: universe(T - 1).ranked.slice(0, 20).map(r => SYMS[r.i] + ' ' + (r.cap / 1e9).toFixed(0) + 'B'), rank300Cap: (() => { const r = universe(T - 1).ranked[TOPN - 1]; return r ? r4(r.cap / 1e9) : null; })(),
  events: Object.fromEntries(IDS.map(id => [id, { ...CNT[id], afterOneOpen: SIG[id].length, halves: half(SIG[id]), top100: half(SIG[id].filter(s => s.rank < TOP100)), sample: SIG[id].slice(-3).map(s => SYMS[s.i] + ' ' + D[s.t] + ' ' + (s.ev || '')) }])) };
if (DIAG) { console.log('SQUAD 12 DIAGNOSTICS (coverage and event counts only; nothing judged or written)'); console.log(JSON.stringify(DIAGS, null, 1).slice(0, 30000)); process.exit(0); }

// ================= 7. YARDSTICKS (as squad5-lab) =================
const ART = new Map(), artOf = (i) => { if (!ART.has(i)) ART.set(i, artifactJumps(cl(i))); return ART.get(i); };
const lastCloseI = (i, k) => { for (let q = Math.min(k, T - 1); q >= 0; q--) { const z = CC(i, q); if (z > 0) return z; } return null; };
const exitVal = (i, x) => { if (vanishedI(i) && x > lastI[i]) return deadI(i) ? 0 : CC(i, lastI[i]); return lastCloseI(i, x); };
const curveMemo = new Map();
function curve(te) { if (curveMemo.has(te)) return curveMemo.get(te); const L = Math.min(T - te, HOLD + 1), sR = new Float64Array(L), sC = new Float64Array(L), cnt = new Uint32Array(L), lq = liqList(te - 1);
  for (let q = 0; q < lq.length; q += 2) { const i = lq[q], e = OO(i, te); if (!(e > 0)) continue; const aj = artOf(i), li = lastI[i], van = vanishedI(i), dead = deadI(i); let lc = NaN, wall = L;
    for (const a of aj) if (a > te - 1) { wall = a - te; break; }
    for (let off = 0; off < Math.min(L, wall); off++) { const k = te + off; let v; if (van && k > li) v = dead ? 0 : CC(i, li); else { const z = CC(i, k); if (z > 0) lc = z; v = lc; } if (!(v >= 0)) continue; sR[off] += v / e; sC[off] += Math.min(v / e, 1 + CAP); cnt[off]++; } }
  const raw = new Float32Array(L), cap = new Float32Array(L); for (let off = 0; off < L; off++) { raw[off] = cnt[off] >= 50 ? sR[off] / cnt[off] - 1 : NaN; cap[off] = cnt[off] >= 50 ? sC[off] / cnt[off] - 1 : NaN; }
  const o = { raw, cap }; curveMemo.set(te, o); return o; }
const ctrl = (te, x, kind) => { const cv = curve(te)[kind], off = x - te; const v = off >= 0 && off < cv.length ? cv[off] : NaN; return isFinite(v) ? v : null; };
function ownOf(i, te, x, capIt) { const L = x - te, out = [];
  for (let k = 1; k < T; k += 21) { if (Math.abs(k - te) < 63) continue; const xe = k + L; if (xe > T - 1) break; const e = OO(i, k); if (!(e > 0)) continue; if (hasArtifact(artOf(i), k - 1, xe)) continue;
    const v = exitVal(i, xe); if (!(v >= 0)) continue; const g = v / e - 1; out.push(capIt ? Math.min(g, CAP) : g); }
  return out.length ? mean(out) : null; }
const spyRet = (te, x) => { const a = OO(spyI, te), b = SPYC[x]; return a > 0 && b > 0 ? b / a - 1 : null; };

// ================= 8. 5-YEAR ONE-SHOT =================
const pyOf = (a, key, cost) => { const v = a.filter(z => ok(z[key])), y = v.reduce((s, z) => s + z.unitYears, 0); return v.length && y > 0 ? r4(v.reduce((s, z) => s + z[key] - cost, 0) / y) : null; };
function evaluate(sigs) { const tr = []; let art = 0, open = 0, noEntry = 0;
  for (const s of sigs) { const i = s.i, te = s.t + 1, x = s.t + HOLD; if (x > T - 1) { open++; continue; } const e = OO(i, te); if (!(e > 0)) { noEntry++; continue; } if (hasArtifact(artOf(i), te - 1, x)) { art++; continue; }
    const v = exitVal(i, x); if (!(v >= 0)) continue; const g = v / e - 1;
    tr.push({ t: s.t, s: SYMS[i], i, rank: s.rank, half: halfOf(D[s.t]), sig: D[s.t], buy: D[te], sell: D[x], ev: s.ev, gRaw: g, g: Math.min(g, CAP), c: ctrl(te, x, 'cap') ?? NaN, cRaw: ctrl(te, x, 'raw') ?? NaN,
      own: ownOf(i, te, x, true), ownRaw: ownOf(i, te, x, false), spy: spyRet(te, x), unitYears: HOLD / YEAR, dead: vanishedI(i) && x > lastI[i] && deadI(i) }); }
  return { tr, art, open, noEntry }; }
function judgeSet(tr) { const by = { older: tr.filter(z => z.half === 'older'), newer: tr.filter(z => z.half === 'newer') };
  const R = { older: halfStat(by.older, HOLD), newer: halfStat(by.newer, HOLD), all: halfStat(tr, HOLD) };
  const PY = Object.fromEntries(['older', 'newer'].map(h => [h, { rule: pyOf(by[h], 'g', COST), spy: pyOf(by[h], 'spy', 0), avgStock: pyOf(by[h], 'c', 0) }]));
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks held 63 sessions on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] } });
  const raw = (a) => a.map(z => ({ ...z, g: z.gRaw, c: z.cRaw, own: z.ownRaw })), RU = { older: halfStat(raw(by.older), HOLD), newer: halfStat(raw(by.newer), HOLD) };
  const vu = judgeHold(RU, { bar: BAR, perYear: { older: [pyOf(raw(by.older), 'g', COST), PY.older.spy], newer: [pyOf(raw(by.newer), 'g', COST), PY.newer.spy] } });
  const years = byYear(tr.map(z => ({ buy: z.buy, net: z.gRaw - COST, spy: z.spy, avg: ok(z.cRaw) ? z.cRaw : null })));
  return { v, R, PY, years, uncapped: { verdict: vu.verdict, older: { avg: RU.older.avg, edge: RU.older.edge, tBlock: RU.older.tBlock }, newer: { avg: RU.newer.avg, edge: RU.newer.edge, tBlock: RU.newer.tBlock } } }; }
const brief = (h) => h && h.n ? { n: h.n, days: h.days, blocks: h.blocks, avg: h.avg, avgStress: h.avgStress, edge: h.edge, vsOwn: h.vsOwn, noTop2: h.noTop2, tBlock: h.tBlock } : { n: 0 };
const RES = {}, need = IDS.filter(id => !(id in FROZEN)), TRADES = {};
const SRC_OK = { 'SQ12-EGAPHOLD': ['earn', 'highLow'], 'SQ12-EARN52H': ['earn'], 'SQ12-REVEPS': ['xbrl'], 'SQ12-ACCEL2': ['xbrl'], 'SQ12-RAISECONF': ['efts'], 'SQ12-INVDAY': ['efts', 'invItems'] };
const BASE_OK = ['tickerMap', 'facts', 'splits', 'altShares', 'domicile'].every(k => STATUS[k] && STATUS[k].ok) && T >= 1000;
for (const id of IDS) { const E = evaluate(SIG[id]), J0 = judgeSet(E.tr), E100 = J0 && judgeSet(E.tr.filter(z => z.rank < TOP100));
  const srcOk = BASE_OK && SRC_OK[id].every(k => STATUS[k] && STATUS[k].ok);
  RES[id] = { ...J0.v, name: RULES[id].name, hold: HOLD, cost: COST, split: SPLIT, universe: 'top ' + TOPN + ' by point-in-time market value', results: J0.R, perYear: J0.PY, calendarYears: J0.years, uncappedSensitivity: J0.uncapped,
    top100: { note: 'information only (pre-registered cut): the same trades restricted to the 100 largest; not used for the verdict or TRY SMALL', verdict: E100.v.verdict, why: E100.v.why, older: brief(E100.R.older), newer: brief(E100.R.newer), perYear: E100.PY, calendarYears: E100.years },
    counts: { signals: SIG[id].length, trades: E.tr.length, stillOpen: E.open, noEntryOpen: E.noEntry, splitArtifactsLeftOut: E.art, dead: E.tr.filter(z => z.dead).length, stocks: new Set(E.tr.map(z => z.s)).size, events: CNT[id] }, sourcesOk: srcOk };
  TRADES[id] = E.tr.map(z => ({ s: z.s, sig: z.sig, buy: z.buy, sell: z.sell, rank: z.rank + 1, ev: z.ev, net: r4(z.gRaw - COST), avgStock: r4(ok(z.cRaw) ? z.cRaw - COST : null), sameStock: r4(z.ownRaw === null ? null : z.ownRaw - COST), spy: r4(z.spy) }));
  const R = J0.R, f = (h) => (h.n || 0) + ' (' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tB ' + h.tBlock;
  log('- ' + id + ': ' + RES[id].verdict + (srcOk ? '' : ' (SOURCE INCOMPLETE: not frozen)') + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | per year rule/SPY older ' + pc(J0.PY.older.rule) + '/' + pc(J0.PY.older.spy) + ' newer ' + pc(J0.PY.newer.rule) + '/' + pc(J0.PY.newer.spy) + ' | top100 ' + E100.v.verdict + ' | ' + String(RES[id].why).slice(0, 220)); }

// ================= 9. FREEZE =================
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k, r]) => need.includes(k) && r.sourcesOk && r.results).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], to: D[T - 1], bar: BAR, ...r }])), (r) => r.verdict !== 'TOO FEW CASES' || (r.results && r.results.all && r.results.all.n > 0));

// ================= 10. TODAY + PAPER LANE =================
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const seen = new Set(lines.map(x => x.type + '|' + x.id)), newLines = [], today = {}, board = {};
for (const id of IDS) { const fr = firstRun[id] || {}, paper = SIG[id].filter(s => s.t + 1 <= T && (s.t + 1 < T ? D[s.t + 1] : iso(Date.now() + 864e5)) >= START);
  for (const s of paper) { const sid = id + '|' + SYMS[s.i] + '|' + D[s.t];
    if (!seen.has('signal|' + sid)) { seen.add('signal|' + sid); newLines.push({ type: 'signal', id: sid, m: id, sym: SYMS[s.i], d: D[s.t], close: r4(CC(s.i, s.t)), rank: s.rank + 1, ev: s.ev, halal: halal(SYMS[s.i]), recordedAfter: D[T - 1] }); }
    const x = s.t + HOLD; if (x <= T - 1 && !seen.has('result|' + sid)) { const e = OO(s.i, s.t + 1), v = exitVal(s.i, x); if (e > 0 && v >= 0) { seen.add('result|' + sid); const g = v / e - 1, c = ctrl(s.t + 1, x, 'raw');
      newLines.push({ type: 'result', id: sid, m: id, sym: SYMS[s.i], d: D[s.t], buy: D[s.t + 1], sell: D[x], g: r4(g), net: r4(g - COST), avgStock: c === null ? null : r4(c - COST) }); } } }
  const closed = [...lines, ...newLines].filter(x => x.type === 'result' && x.m === id).map(x => ({ d: x.d, sym: x.sym, g: x.g, c: x.avgStock === null ? NaN : x.avgStock + COST })), st = boardStats(closed);
  const now = SIG[id].filter(s => s.t === T - 1);
  today[id] = { name: RULES[id].name, hold: HOLD, tier: fr.verdict || null, newSignals: now.map(s => ({ sym: SYMS[s.i], close: r4(CC(s.i, T - 1)), halal: halal(SYMS[s.i]), rank: s.rank + 1, ev: s.ev })) };
  board[id] = { name: RULES[id].name, paperSignals: paper.length, closed: st, ready: paperReady(st), fiveYear: fr.verdict ? { verdict: fr.verdict, why: fr.why } : null }; }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
const NOTE = 'PAPER ONLY. Squad 12: events in the 300 largest US companies (SQ12-*). newSignals = signals on the last close (buy at the next open, hold 63 sessions). Nothing here is a buy by itself: a rule needs a frozen 5-year verdict that qualifies (data/squad12-lab.json firstRun). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.';
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, note: NOTE, methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.length + ' new line(s)');

// ================= 11. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), preRegistered: 'squad12-core.mjs RULES + data/strategy-library.json SQ12-* (24 Oct 2026, before any run)', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, stress: STRESS, data: STATUS, diagnostics: DIAGS,
  standard: 'Per trade: entry next open after the signal session, exit close of session 63; both halves by signal date (before / from ' + SPLIT + '): > 0 after 0.8% and 1.2%, better than the average liquid stock over the same sessions, better than the same stock held 63 sessions on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= ' + TIER2_T + ' (63-session blocks) -> TRADABLE SMALL; >= ' + BAR + ' -> PROVEN; plus return per year of capital tied up above SPY on the same days in both halves (perYear). All gross returns capped at +300% on both sides (AUD-1 capBoth); uncapped = sensitivity. Universe: top ' + TOPN + ' by point-in-time market value (top-' + TOP100 + ' cut = information).',
  halalNote: 'No point-in-time halal status exists in the repository; the tests run on the largest companies regardless of halal status. Today\'s signals carry the owner\'s ZAD mark.',
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: RES }), trades: TRADES };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result || !r.results) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.to); e.study = 'squad12-lab.mjs -> data/squad12-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock],
      perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], top100: r.top100 ? r.top100.verdict : null, why: r.why }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad12-lab: library not updated: ' + e.message); }
console.log('SQUAD 12 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + (BASE_OK ? '' : ' | INCOMPLETE: ' + Object.entries(STATUS).filter(([, s]) => s && s.ok === false).map(([k]) => k).join(', ')));
