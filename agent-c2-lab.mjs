// AGENT C LAB 2 (Crowd lane; the 5 Nov 2026 run, restarted 6 Nov). The exact pre-registered rules are in the agent-c2-core.mjs header
// (C-CT1a, C-CT1b, C-INS3-20, C-INS3-60). Research only: never places an order, no Telegram, no paper lane.
// MODE=diag (last line of run-agent-c2-now.txt = DIAG): data coverage, amount coverage (the C-CT1 stop rule), signal counts per half and
//   samples; NO returns, no verdict. MODE=lab (otherwise): the same data, then the 5-year one-shot for every rule not frozen yet.
// DATA (GitHub Actions only; keys from secrets, never printed; official public sources only):
//   prices   = study-cache/grouped.json.gz (whole market incl. dead stocks, RESTORED READ ONLY) + sessions since (Massive grouped daily).
//   8-K 1.01 = squad 21's cached EDGAR full-text search (squad21-cache/efts, RESTORED READ ONLY); missing months fetched into agentc2-cache.
//   identity = squad 4's point-in-time Form 3/4/5 ticker map (squad4-cache/f345, READ ONLY), then the search's tickers, then today's list.
//   documents= the primary 8-K document and its .hdr.sgml (sec.gov Archives), read once, parsed results cached in agentc2-cache.
//   facts    = value-lab's companyfacts cache (value-cache/facts.json.gz, READ ONLY); share counts data/shares.json.gz.
//   insiders = SEC insider-transactions data sets 2018 Q1 on, parsed into agentc2-cache/ins3 (P and S rows).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, ttmAt, TIER2_T } from './value-core.mjs';
import { ownAverage, relFlags, isInsider } from './squad1-core.mjs';
import { insiderClusters } from './agent-c-core.mjs';
import { eftsHits, mainDoc, hasItem, html2text, dealType } from './squad21-core.mjs';
import { PARSER_V, COST, CT, INS3, RULE_IDS, mean, r4, halfOf, capG, item101Section, contractAmount, acceptance, reactionSession, burnCovered, classify, trySmallBar, spyGate, preRegister } from './agent-c2-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', EFTS = local(env.EFTS_BASE) || 'https://efts.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.AGC2_CACHE || 'agentc2-cache', SC21 = env.SQ21_CACHE || 'squad21-cache', SC4 = env.SQ4_CACHE || 'squad4-cache', VC = env.VALUE_CACHE || 'value-cache';
const OUT = 'data/agent-c2-lab.json', DIAGF = 'data/agent-c2-diag.json', LIB = 'data/strategy-library.json';
const MODE = env.MODE === 'diag' || env.DIAG ? 'diag' : 'lab';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const addDays = (d, n) => iso(Date.parse(d + 'T00:00:00Z') + n * 864e5);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.AGC2_MINUTES || 290) * 60e3, left = () => BUDGET - (Date.now() - t0);
const redact = (s) => String(s).replace(/(apiKey|token)=[^&\s]+/gi, '$1=***');
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};
log('agent C lab 2, mode ' + MODE + '; frozen already: ' + (Object.keys(FROZEN).join(', ') || 'none') + '; proof bar ' + BAR);
if (MODE === 'lab') { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' Agent C entries written now'); }

// ================= 1. PRICES (agent-c-lab pattern) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('agent-c2-lab: no price cache; nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(); let freshN = 0;
for (let ms = Date.parse(cacheLast) + 864e5; ms <= Date.now(); ms += 864e5) { const d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; freshN++; }
log('cache to ' + cacheLast + '; fresh sessions: ' + freshN);
const D = Object.keys(store.days).sort(), T = D.length;
const firstAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo; };
const onOrAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
const SY = new Map(); for (const d of D) { for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size); const x = store.days[d].x; if (x) for (const s of x.T) if (/^[A-Z]{1,5}$/.test(s) && !SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const O = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; MAIN[k] = 1; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; C[k] = x.x.c[j]; O[k] = x.x.o ? x.x.o[j] : NaN; V[k] = x.x.v ? x.x.v[j] : NaN; } });
store = null;
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; C[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY');
const LIQ = new Uint8Array(N); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? C[b + t] * V[b + t] : NaN; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const w = MAIN[b + t - 20] ? C[b + t - 20] * V[b + t - 20] : NaN; if (isFinite(w)) { s -= w; n--; } } if (t >= 19 && n === 20 && C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqAt = new Map(), liqList = (t) => { if (!liqAt.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqAt.set(t, a); } return liqAt.get(t); };
const closeAt = (i, x, k) => { for (let q = Math.min(x, T - 1); q >= k; q--) { const z = C[i * T + q]; if (z > 0) return z; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1) return null; const e = O[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const spyRet = (k, x) => spyI === undefined ? null : ret(spyI, k, x);
const hasPx = (i, t) => { for (let q = Math.max(0, t - 5); q <= Math.min(T - 1, t + 5); q++) if (C[i * T + q] > 0) return true; return false; };
const cMemo = new Map(), ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
STATUS.price = { ok: T >= 1000 && spyI !== undefined, sessions: T, from: D[0], to: D[T - 1], stocks: NS };
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS);
function tradesOf(sigs, hold, end = T - 1) { const out = [], busy = new Map(), spans = new Map();
  for (const z of [...sigs].sort((p, q) => p.k - q.k || p.i - q.i)) { if ((busy.get(z.i) ?? -1) >= z.k) continue; const x = z.k + hold - 1; if (x > end) continue; const g = ret(z.i, z.k, x); if (g === null || !isFinite(g)) continue;
    const c = ctrlSpan(z.k, x); if (c === null) continue; busy.set(z.i, x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, x]); const sp = spyRet(z.k, x);
    out.push({ t: z.k, s: SYMS[z.i], i: z.i, k: z.k, x, g: capG(g), c, spy: sp === null ? NaN : capG(sp), half: halfOf(z.d), d: z.d, info: z.info }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.x - z.k + 1, key = z.i + '|' + len + '|' + z.half;
    if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 253, to: end, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  return out; }
const halves = (tr, h) => ({ older: halfStat(tr.filter(z => z.half === 'older'), h), newer: halfStat(tr.filter(z => z.half === 'newer'), h), all: halfStat(tr, h) });
const shapeOf = (tr) => { const net = tr.map(z => z.g - COST), byDay = new Map(); for (const z of tr) (byDay.get(z.k) || byDay.set(z.k, []).get(z.k)).push(z.g - COST);
  return { trades: tr.length, stocks: new Set(tr.map(z => z.s)).size, days: byDay.size, median: r4([...net].sort((a, b) => a - b)[net.length >> 1]), worst: r4(Math.min(...net)), worstDay: r4(Math.min(...[...byDay.values()].map(mean))),
    vsSpy: r4(mean(tr.filter(z => isFinite(z.spy)).map(z => z.g - COST - z.spy))), byYear: Object.fromEntries([...new Set(tr.map(z => z.d.slice(0, 4)))].sort().map(y => { const v = tr.filter(z => z.d.slice(0, 4) === y).map(z => z.g - COST); return [y, { n: v.length, avg: r4(mean(v)) }]; })) }; };
const tradeRows = (tr) => tr.map(z => ({ s: z.s, sig: z.d, buy: D[z.k], sell: D[z.x], net: r4(z.g - COST), avgStock: r4(z.c - COST), spy: r4(z.spy), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST), ...(z.info || {}) }));
const fmt = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' med ' + pc(h.median) + ' worst ' + pc(h.worst);

// ================= 2. SEC SOURCES =================
let nextSec = 0, secReq = 0, secFail = 0; const SECFAILS = [], GAP = local(env.SEC_BASE) || local(env.EFTS_BASE) ? 0 : 125;   // one shared slot queue: at most 8 requests a second over all workers
async function sec(url, kind = 'json') { for (let a = 0; a < 4; a++) { const slot = Math.max(Date.now(), nextSec); nextSec = slot + GAP; if (slot > Date.now()) await sleep(slot - Date.now()); secReq++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(60000) }); if (r.status === 404 || r.status === 410) return kind === 'text' ? '' : null;
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; } if (!r.ok) { secFail++; if (SECFAILS.length < 20) SECFAILS.push('HTTP ' + r.status + ' ' + url.slice(0, 200)); return undefined; }
      return kind === 'json' ? await r.json() : await r.text(); } catch (e) { await sleep(1000 * (a + 1)); } }
  secFail++; if (SECFAILS.length < 20) SECFAILS.push('gave up ' + url.slice(0, 200)); return undefined; }
function download(url, file) { try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : (/^\d{4}-\d\d-\d\d/.test(String(s || '')) ? String(s).slice(0, 10) : null); };
const months = (from) => { const out = [], now = new Date(); for (let y = +from.slice(0, 4), m = +from.slice(5, 7); y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1); m === 12 ? (y++, m = 1) : m++) out.push(y + '-' + String(m).padStart(2, '0')); return out; };
const monthEnd = (m) => iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0));
const quarters = (fromY) => { const qs = [], now = new Date(); for (let y = fromY; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, q * 3, 1)) < now) qs.push(y + 'q' + q); return qs; };

// ---- 2a. point-in-time ticker map (squad 4's cache, read only; else downloaded into this lab's cache) ----
const CIKMAP = new Map(); { const qs = quarters(2021);
  const parseMap = (zip) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, 'SUBMISSION.tsv'], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const L = txt.split(/\r?\n/), H = L[0].split('\t'), ix = (k) => H.indexOf(k);
    const a = ix('FILING_DATE'), c = ix('ISSUERCIK'), s = ix('ISSUERTRADINGSYMBOL'); if (a < 0 || c < 0 || s < 0) return null; const map = new Map();
    for (const l of L.slice(1)) { if (!l) continue; const r = l.split('\t'), d = isoD(r[a]), cik = String(+r[c] || ''), sym = String(r[s] || '').toUpperCase().trim().replace(/-/g, '.'); if (!d || !cik || !/^[A-Z][A-Z0-9.]{0,6}$/.test(sym) || sym === 'NONE' || sym === 'NA') continue;
      const k = sym + '|' + cik, o = map.get(k); if (!o) map.set(k, [sym, cik, d, d, 1]); else { if (d < o[2]) o[2] = d; if (d > o[3]) o[3] = d; o[4]++; } } return { map: [...map.values()] }; };
  const fail = []; let from4 = 0, got = 0;
  for (const q of qs) { let x = JZ(SC4 + '/f345/' + q + '.json.gz', null); if (x) from4++; if (!x) x = JZ(SC + '/f345/' + q + '.json.gz', null);
    if (!x && !local(env.SEC_BASE)) { const zip = SC + '/f345.zip'; if (download(SEC + '/files/structureddata/data/insider-transactions-data-sets/' + q + '_form345.zip', zip)) { const r = parseMap(zip); try { fs.unlinkSync(zip); } catch (e) {} if (r) { x = r; WZ(SC + '/f345/' + q + '.json.gz', x); got++; } } }
    if (!x) { fail.push(q); continue; } for (const [sym, cik, f, l, n] of x.map) (CIKMAP.get(cik) || CIKMAP.set(cik, []).get(cik)).push([sym, f, l, n]); }
  STATUS.tickerMap = { ok: qs.slice(0, -1).every(q => !fail.includes(q)), quarters: qs.length, fromSquad4Cache: from4, downloadedNow: got, missing: fail, ciks: CIKMAP.size };
  log('ticker map: ' + JSON.stringify(STATUS.tickerMap)); }
const SH = JZ('data/shares.json.gz', { t: {}, c: {} }), SECCIK = J('data/sec-ciks.json', {});
const todayCik = (s) => { const a = SH.t && (SH.t[s] || SH.t[s.replace(/\./g, '-')]); if (a) return String(+a); const y = SECCIK[s]; return y ? String(+y[0]) : null; };
const TODAYSYMS = new Map(); for (const s of SYMS) { const c = todayCik(s); if (c) (TODAYSYMS.get(c) || TODAYSYMS.set(c, []).get(c)).push(s); }
const symFor = (cik, tickers, d) => { const t = Math.min(onOrAfter(d), T - 1), c = String(+cik), sp = (CIKMAP.get(c) || []).filter(s => d >= addDays(s[1], -400) && d <= addDays(s[2], 400)).sort((a, b) => b[3] - a[3]);
  for (const s of [...sp.map(x => x[0]), ...(tickers || []), ...(TODAYSYMS.get(c) || [])]) { const i = SY.get(s); if (i !== undefined && hasPx(i, t)) return s; } return null; };
const sharesKnown = (cik, d) => { const a = SH.c && SH.c[String(+cik)]; if (!a) return null; const lim = addDays(d, -30); let v = null; for (const [e, n] of a) if (e <= lim) v = n; return v; };

// ---- 2b. 8-K item 1.01 hits (squad 21's cache first, read only) ----
async function efts(phrase, a, b) { const hits = []; for (let from = 0; from < 10000; from += 100) {
    const j = await sec(EFTS + '/LATEST/search-index?q=' + encodeURIComponent('"' + phrase + '"') + '&forms=8-K&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from);
    if (!j || !j.hits) return null; const tot = (j.hits.total && j.hits.total.value) || 0;
    if (from === 0 && tot >= 9900 && a < b) { const mid = iso((Date.parse(a) + Date.parse(b)) / 2), x = await efts(phrase, a, mid), y = await efts(phrase, addDays(mid, 1), b); return x && y ? x.concat(y) : null; }
    const h = eftsHits(j); hits.push(...h); if (h.length < 100 || from + 100 >= tot) break; } return hits; }
const H101 = [], FT = { complete: true, fromSquad21: 0, fetched: 0, missing: [] };
for (const m of months('2021-08')) { const slug = 'material-definitive-agreement', recent = m >= iso(Date.now() - 10 * 864e5).slice(0, 7);
  let h = recent ? null : J(SC21 + '/efts/' + slug + '/' + m + '.json', null); if (h) FT.fromSquad21++; if (!h && !recent) h = J(SC + '/efts/' + m + '.json', null);
  if (!h) { h = await efts('Material Definitive Agreement', m + '-01', monthEnd(m)); if (h) { h = h.filter(x => hasItem(x, '1.01')); W(SC + '/efts/' + m + '.json', h); FT.fetched++; } }
  if (!h) { FT.complete = false; FT.missing.push(m); continue; } H101.push(...h); }
STATUS.efts = { ok: FT.complete, ...FT, hits: H101.length }; log('8-K 1.01 search: ' + JSON.stringify(STATUS.efts));
const EV = []; { const seen = new Set(); let noSym = 0, earn = 0;
  for (const h of H101) { if (!mainDoc(h) || !h[1] || seen.has(h[1]) || !hasItem(h, '1.01')) continue; seen.add(h[1]); if (hasItem(h, '2.02')) { earn++; continue; }
    const sym = symFor(h[2], h[7], h[3]); if (!sym) { noSym++; continue; } const f = onOrAfter(h[3]); if (f >= T) continue;
    EV.push({ adsh: h[1], file: String(h[0]).split(':')[1], cik: String(+h[2]), d: h[3], sym, i: SY.get(sym) }); }
  STATUS.events = { filings: seen.size, earningsDay: earn, noStock: noSym, withStock: EV.length }; log('item 1.01 main documents: ' + JSON.stringify(STATUS.events)); }

// ---- 2c. the primary documents. The item 1.01 section text is cached (agentc2-cache/sections.json.gz) so a parser change re-reads no
// document; the parsed result is cached by accession with the parser version: [PARSER_V, section 0/1, figures, counted, amount, snippet, dealType]
const SECT = JZ(SC + '/sections.json.gz', {}), DOCS0 = J(SC + '/docs2.json', {}), DOCS = {};
{ let read = 0, miss = 0, reparsed = 0, ix = 0; const parse = (e, sec1) => { const a = contractAmount(sec1 || ''); DOCS[e.adsh] = [PARSER_V, sec1 ? 1 : 0, a.figures, a.counted, a.amount, a.snippet, a.snippet ? dealType('', a.snippet) : null].slice(1); DOCS0[e.adsh] = [PARSER_V, ...DOCS[e.adsh]]; };
  const todo = []; for (const e of EV) { const c = DOCS0[e.adsh]; if (c && c[0] === PARSER_V) DOCS[e.adsh] = c.slice(1); else if (e.adsh in SECT) { parse(e, SECT[e.adsh]); reparsed++; } else todo.push(e); }
  log('documents parsed already ' + (EV.length - todo.length - reparsed) + ', re-parsed from cached sections ' + reparsed + ', to read ' + todo.length);
  const save = () => { WZ(SC + '/sections.json.gz', SECT); W(SC + '/docs2.json', DOCS0); };
  const work = async () => { while (ix < todo.length) { const e = todo[ix++]; if (left() < 45 * 60e3) { miss++; continue; }
      const html = await sec(SEC + '/Archives/edgar/data/' + e.cik + '/' + e.adsh.replace(/-/g, '') + '/' + e.file, 'text'); if (html === undefined) { miss++; continue; }
      const sec1 = item101Section(html2text(String(html).slice(0, 3000000))); SECT[e.adsh] = sec1 ? sec1.slice(0, 40000) : ''; parse(e, SECT[e.adsh]);
      read++; if (read % 2000 === 0) { save(); log('documents read now: ' + read); } } };
  await Promise.all([work(), work(), work()]); save();
  const got = EV.filter(e => DOCS[e.adsh]); STATUS.docs = { ok: miss <= EV.length * 0.01, parser: PARSER_V, events: EV.length, readNow: read, reparsed, notRead: miss, withSection: got.filter(e => DOCS[e.adsh][0]).length,
    withAnyFigure: got.filter(e => DOCS[e.adsh][1] > 0).length, withCounted: got.filter(e => DOCS[e.adsh][3] > 0).length };
  STATUS.docs.statedShare = r4(STATUS.docs.withAnyFigure / Math.max(1, got.length)); STATUS.docs.stopRule = STATUS.docs.statedShare >= CT.minStated ? 'passed' : 'NEEDS DATA (under 40% state an amount)';
  log('documents: ' + JSON.stringify(STATUS.docs)); }
// ---- 2d. market cap, acceptance time, the two rules ----
const FX = JZ(VC + '/facts.json.gz', null); STATUS.facts = { ok: !!(FX && FX.c && Object.keys(FX.c).length > 500), companies: FX && FX.c ? Object.keys(FX.c).length : 0 };
const CFO = ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'];
const cfoTtm = (cik, asOf) => { const c = FX && FX.c && FX.c[String(+cik)]; if (!c) return null; for (const tag of CFO) if (c[tag]) { const r = ttmAt(c[tag].map(([s, e, v, f]) => ({ s, e, v, f })), asOf); if (r) return r; } return null; };
const HDR = J(SC + '/hdr.json', {}); const CT_EV = [], CT_DROP = { noAmount: 0, noShares: 0, noClose: 0, small: 0 };
{ const pre = []; for (const e of EV) { const x = DOCS[e.adsh]; if (!x || !(x[3] > 0)) { CT_DROP.noAmount++; continue; } const f = onOrAfter(e.d), sh = sharesKnown(e.cik, D[Math.min(f, T - 1)]), px = C[e.i * T + Math.min(f, T - 1)];
    if (!(sh > 0)) { CT_DROP.noShares++; continue; } if (!(px > 0)) { CT_DROP.noClose++; continue; } if (x[3] >= CT.prefilter * sh * px) pre.push(e); else CT_DROP.small++; }
  let hdrRead = 0, ix = 0; const todo = pre.filter(e => !(e.adsh in HDR));
  const work = async () => { while (ix < todo.length) { const e = todo[ix++]; if (left() < 30 * 60e3) break; const a = e.adsh.replace(/-/g, ''); const t = await sec(SEC + '/Archives/edgar/data/' + e.cik + '/' + a + '/' + e.adsh + '.hdr.sgml', 'text');
      if (t === undefined) continue; HDR[e.adsh] = acceptance(t); hdrRead++; } };
  await Promise.all([work(), work()]); W(SC + '/hdr.json', HDR);
  for (const e of pre) { const acc = HDR[e.adsh] || null, R = reactionSession(D, acc, e.d); if (R >= T - 1) continue; const sh = sharesKnown(e.cik, D[R]), px = C[e.i * T + R]; if (!(sh > 0) || !(px > 0)) { CT_DROP.noClose++; continue; }
    const cap = sh * px, amt = DOCS[e.adsh][3]; if (!(amt >= CT.minShare * cap)) { CT_DROP.small++; continue; }
    const ttm = cfoTtm(e.cik, addDays(D[R], -30)); CT_EV.push({ ...e, R, k: R + 1, cap, amt, ratio: amt / cap, acc: !!acc, burn: burnCovered(amt, ttm), ttm: ttm ? ttm.val : null, deal: DOCS[e.adsh][5], merger: /merger|acquisition|acquire/i.test(DOCS[e.adsh][4] || '') }); }
  STATUS.ct = { prefiltered: pre.length, headersReadNow: hdrRead, headersKnown: pre.filter(e => HDR[e.adsh]).length, events10pct: CT_EV.length, dropped: CT_DROP };
  log('C-CT1 events: ' + JSON.stringify(STATUS.ct)); }
const gap60 = (evs) => { const last = new Map(), out = []; for (const e of [...evs].sort((a, b) => a.R - b.R || a.i - b.i)) { if (last.has(e.i) && e.R < last.get(e.i) + CT.gap) continue; last.set(e.i, e.R); out.push(e); } return out; };
const ctSigs = (evs) => gap60(evs).filter(e => e.k < T && LIQ[e.i * T + e.R]).map(e => ({ i: e.i, k: e.k, d: e.d, info: { ratio: r4(e.ratio), amt: e.amt, deal: e.deal, merger: e.merger } }));
const CT1A = ctSigs(CT_EV), CT1B = ctSigs(CT_EV.filter(e => e.burn));
const cnt = (a, h) => ({ older: a.filter(z => halfOf(z.d) === 'older' && z.k + h - 1 < T).length, newer: a.filter(z => halfOf(z.d) === 'newer' && z.k + h - 1 < T).length });
STATUS.ctCounts = { 'C-CT1a': cnt(CT1A, CT.hold), 'C-CT1b': cnt(CT1B, CT.hold), mergerWording: CT1A.filter(z => z.info.merger).length, financingType: CT1A.filter(z => z.info.deal === 'financing/corporate').length };
log('C-CT1 liquid signals: ' + JSON.stringify(STATUS.ctCounts));

// ================= 3. C-INS3 DATA =================
const HIST = new Map(), BUYS3 = []; { const qs = quarters(INS3.fromYear), fail = []; let got = 0;
  const tsv = (zip, name) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const Ls = txt.split(/\r?\n/), H = Ls[0].split('\t'); return { H, rows: Ls.slice(1).filter(Boolean).map(l => l.split('\t')) }; };
  for (const q of qs) { const cf = SC + '/ins3/' + q + '.json.gz'; let x = JZ(cf, null);
    if (!x && !local(env.SEC_BASE) && left() > 100 * 60e3) { const zip = SC + '/ins3.zip';
      if (['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/'].some(p => download(SEC + p + q + '_form345.zip', zip))) { const S = tsv(zip, 'SUBMISSION.tsv'), Nt = tsv(zip, 'NONDERIV_TRANS.tsv'), RO = tsv(zip, 'REPORTINGOWNER.tsv'); try { fs.unlinkSync(zip); } catch (e) {}
        if (S && Nt && RO) { const own = new Map(), ri = (n) => RO.H.indexOf(n); for (const r of RO.rows) if (!own.has(r[ri('ACCESSION_NUMBER')])) own.set(r[ri('ACCESSION_NUMBER')], [String(+r[ri('RPTOWNERCIK')] || ''), r[ri('RPTOWNER_RELATIONSHIP')] || '']);
          const si = (n) => S.H.indexOf(n), ni = (n) => Nt.H.indexOf(n), sub = new Map();
          for (const r of S.rows) { const dt = String(r[si('DOCUMENT_TYPE')] || ''); if (/^[45](\/A)?$/.test(dt)) sub.set(r[si('ACCESSION_NUMBER')], { d: isoD(r[si('FILING_DATE')]), dt, sym: String(r[si('ISSUERTRADINGSYMBOL')] || '').toUpperCase().trim().replace(/-/g, '.'), cik: String(+r[si('ISSUERCIK')] || '') }); }
          const hist = new Set(), buys = [];
          for (const r of Nt.rows) { const code = r[ni('TRANS_CODE')]; if (code !== 'P' && code !== 'S') continue; const acc = r[ni('ACCESSION_NUMBER')], s = sub.get(acc), o = own.get(acc); if (!s || !o || !o[0]) continue; const td = isoD(r[ni('TRANS_DATE')]); if (!td) continue;
            hist.add(o[0] + '|' + td.slice(0, 7));
            if (code === 'P' && s.dt === '4' && r[ni('TRANS_ACQUIRED_DISP_CD')] === 'A' && s.d && /^[A-Z][A-Z0-9.]{0,6}$/.test(s.sym)) { const sh = +r[ni('TRANS_SHARES')], px = +r[ni('TRANS_PRICEPERSHARE')]; if (sh > 0 && px > 0) buys.push([s.sym, s.d, o[0], Math.round(sh * px), o[1], s.cik, td]); } }
          x = { v: 1, hist: [...hist], buys }; WZ(cf, x); got++; } } }
    if (!x) { fail.push(q); continue; } for (const h of x.hist) { const [o, m] = h.split('|'); (HIST.get(o) || HIST.set(o, new Set()).get(o)).add(m); } for (const b of x.buys) BUYS3.push(b); }
  STATUS.ins3 = { ok: !fail.some(q => q < qs[qs.length - 1]), quarters: qs.length, downloadedNow: got, missing: fail, owners: HIST.size, purchases: BUYS3.length };
  log('C-INS3 data: ' + JSON.stringify(STATUS.ins3)); }
const INS3_SIG = []; { const cls = { routine: 0, opportunistic: 0, unclassified: 0, notInsider: 0 };
  const rows = []; for (const [sym, d, who, usd, rel, cik, td] of BUYS3) { if (d < '2021-06-01') continue; if (!isInsider(relFlags(rel))) { cls.notInsider++; continue; } const c = classify(HIST, who, +td.slice(0, 4)); cls[c]++;
    if (c === 'opportunistic') rows.push({ sym, d, who, usd, cik, insider: true }); }
  const ev = insiderClusters(rows, onOrAfter, { window: INS3.window, minPeople: INS3.minPeople, minUsd: 1 }); let noPx = 0;
  for (const e of ev) { const i = SY.get(e.sym), k = firstAfter(e.d); if (i === undefined || k >= T || !hasPx(i, k)) { noPx++; continue; } if (k < 1 || !LIQ[i * T + k - 1]) continue; INS3_SIG.push({ i, k, d: e.d, info: { people: e.people, usd: e.usd } }); }
  STATUS.ins3.classes = cls; STATUS.ins3.clusters = ev.length; STATUS.ins3.noPrice = noPx; STATUS.ins3.liquidSignals = INS3_SIG.length;
  STATUS.ins3Counts = Object.fromEntries(INS3.holds.map(h => ['C-INS3-' + h, cnt(INS3_SIG, h)]));
  log('C-INS3: ' + JSON.stringify({ classes: cls, clusters: ev.length, liquid: INS3_SIG.length, counts: STATUS.ins3Counts })); }
if (SECFAILS.length) log('SEC requests ' + secReq + ', failed ' + secFail + ': ' + SECFAILS.slice(0, 3).map(redact).join(' | '));
const CT_OK = STATUS.price.ok && STATUS.efts.ok && STATUS.tickerMap.ok && STATUS.docs.ok && STATUS.facts.ok;

// ================= 4. DIAG =================
if (MODE === 'diag') { const samp = (a) => a.filter((z, j) => j % Math.max(1, Math.floor(a.length / 25)) === 0).slice(0, 25);
  W(DIAGF, { generatedAt: new Date().toISOString(), note: 'DIAG: data coverage, amount coverage (C-CT1 stop rule), signal counts and samples only; no returns computed, no verdict', window: [D[0], D[T - 1]], data: STATUS,
    ctSample: samp(CT_EV.map(e => ({ sym: e.sym, filed: e.d, R: D[e.R], acc: e.acc, amt: e.amt, cap: Math.round(e.cap), ratio: r4(e.ratio), burn: e.burn, ttm: e.ttm, deal: e.deal, snippet: (DOCS[e.adsh][4] || '').slice(0, 240), adsh: e.adsh }))),
    docSample: samp(EV.filter(e => DOCS[e.adsh]).map(e => ({ sym: e.sym, filed: e.d, adsh: e.adsh, doc: DOCS[e.adsh].slice(0, 4), snippet: (DOCS[e.adsh][4] || '').slice(0, 200) }))),
    noSectionSample: EV.filter(e => DOCS[e.adsh] && !DOCS[e.adsh][0]).slice(0, 15).map(e => ({ sym: e.sym, filed: e.d, url: SEC + '/Archives/edgar/data/' + e.cik + '/' + e.adsh.replace(/-/g, '') + '/' + e.file })) });
  console.log('AGENT C2 DIAG | ct data ' + (CT_OK ? 'ok' : 'NOT OK') + ', stated ' + STATUS.docs.statedShare + ' | CT1a ' + JSON.stringify(STATUS.ctCounts['C-CT1a']) + ' CT1b ' + JSON.stringify(STATUS.ctCounts['C-CT1b']) + ' | INS3 ' + (STATUS.ins3.ok ? 'ok ' : 'MISSING ') + JSON.stringify(STATUS.ins3Counts));
  process.exit(0); }

// ================= 5. 5-YEAR ONE-SHOT (each rule once; first complete verdict frozen) =================
const RES = {}, need = RULE_IDS.filter(id => !FROZEN[id]);
const base = (extra) => ({ at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, cost: COST, yardstick: 'capBoth (AUD-1)', ...extra });
const runRule = (id, sigs, hold, extraInfo = {}) => { const tr = tradesOf(sigs, hold), R = halves(tr, hold), v = judge(R, { bar: BAR, extra: spyGate(tr) });
  RES[id] = base({ ...v, trySmallBar: trySmallBar(R), results: R, shape: shapeOf(tr), hold, ...extraInfo, trades: tradeRows(tr) });
  log('- ' + id + ': ' + v.verdict + ' | older ' + fmt(R.older || {}) + ' | newer ' + fmt(R.newer || {}) + ' | ' + v.why); };
for (const [id, sigs] of [['C-CT1a', CT1A], ['C-CT1b', CT1B]]) { if (!need.includes(id)) continue;
  if (!CT_OK) { RES[id] = { verdict: 'NOT RUN', why: 'data incomplete: ' + JSON.stringify({ efts: STATUS.efts.ok, tickerMap: STATUS.tickerMap.ok, docs: STATUS.docs, facts: STATUS.facts.ok }).slice(0, 400) }; log('- ' + id + ': NOT RUN'); continue; }
  if (STATUS.docs.statedShare < CT.minStated) { RES[id] = base({ verdict: 'NEEDS DATA', level: 'NONE', why: 'stop rule (pre-registered): only ' + pc(STATUS.docs.statedShare) + ' of item 1.01 filings state an amount (40% needed); no return computed' }); log('- ' + id + ': NEEDS DATA'); continue; }
  runRule(id, sigs, CT.hold, { counts: STATUS.ctCounts[id], docs: STATUS.docs }); }
for (const h of INS3.holds) { const id = 'C-INS3-' + h; if (!need.includes(id)) continue;
  if (!STATUS.ins3.ok || !STATUS.price.ok) { RES[id] = { verdict: 'NOT RUN', why: 'data incomplete: ' + JSON.stringify(STATUS.ins3).slice(0, 300) }; log('- ' + id + ': NOT RUN'); continue; }
  runRule(id, INS3_SIG, h, { counts: STATUS.ins3Counts[id], classes: STATUS.ins3.classes }); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])), (r) => r && r.verdict && r.verdict !== 'NOT RUN');
const levelOf = (r) => !r ? 'NOT JUDGED YET' : r.verdict === 'PROVEN' ? 'PROVEN' : r.verdict === 'TRADABLE SMALL' ? 'TIER 2 (TRADABLE SMALL)' : r.trySmallBar ? 'TRY SMALL bar only (NOT PROVEN)' : 'NONE';

// ================= 6. OUTPUT + LIBRARY =================
const tradesOut = Object.fromEntries(Object.entries(RES).filter(([k, r]) => r.trades && !FROZEN[k]).map(([k, r]) => [k, r.trades]));
W(OUT, { generatedAt: new Date().toISOString(), agent: 'C', about: 'Agent C (Crowd) one-shot tests of 6 Nov 2026: C-CT1a/b contract size vs market cap (8-K 1.01); C-INS3-20/60 opportunistic insider clusters (CMP 2012). Research only; never an order.',
  preRegistered: 'agent-c2-core.mjs header (6 Nov 2026, before any result)', window: [D[0], D[T - 1]], bar: BAR, data: STATUS,
  levels: Object.fromEntries(RULE_IDS.map(id => [id, { verdict: firstRun[id] ? firstRun[id].verdict : 'NOT JUDGED YET', level: levelOf(firstRun[id]) }])), firstRun,
  latest: latestBlock({ at: new Date().toISOString(), data: STATUS }), trades: { ...(PREV.trades || {}), ...tradesOut } });
try { const LB = J(LIB, null); let ch = false;
  for (const id of RULE_IDS) { const r = firstRun[id], e = LB && LB.strategies.find(x => x.id === id); if (!e || !r || e.tested) continue;
    const h = (k) => r.results && r.results[k] && r.results[k].n ? r.results[k].n + ' trades, ' + r.results[k].days + ' days, avg ' + pc(r.results[k].avg) + ' (stress ' + pc(r.results[k].avgStress) + '), edge ' + pc(r.results[k].edge) + ', t ' + r.results[k].tBlock : 'n/a';
    e.tested = r.frozenAt.slice(0, 10); e.agent = 'C';
    e.status = r.verdict === 'PROVEN' ? 'tested: passed (PROVEN, agent-c2-lab)' : r.verdict === 'TRADABLE SMALL' ? 'tested: tier 2 TRADABLE SMALL (agent-c2-lab); forward paper first' : 'tested: ' + r.verdict.toLowerCase() + ' (agent-c2-lab, frozen ' + e.tested + ')';
    e.result = { verdict: r.verdict, level: levelOf(r), why: r.why, older: h('older'), newer: h('newer') }; ch = true; }
  for (const [p, a, b] of [['C-CT1', 'C-CT1a', 'C-CT1b'], ['C-INS3', 'C-INS3-20', 'C-INS3-60']]) { const e = LB && LB.strategies.find(x => x.id === p), x = firstRun[a], y = firstRun[b];
    if (e && x && y && !e.tested) { e.tested = y.frozenAt.slice(0, 10); e.status = 'tested (agent-c2-lab): ' + a + ' ' + x.verdict + ', ' + b + ' ' + y.verdict; ch = true; } }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('agent-c2-lab: library not updated: ' + e.message); }
console.log('AGENT C LAB 2 done: ' + RULE_IDS.map(id => id + ' ' + (firstRun[id] ? firstRun[id].verdict : 'NOT JUDGED YET')).join(', '));
