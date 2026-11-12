// AGENT C LAB 3 (Crowd lane; the Thu 12 Nov 2026 run). The exact pre-registered rules are in the agent-c3-core.mjs header (C-IC1,
// C-SI1, C-SI1-DTC). Research only: never places an order, no Telegram, no paper lane.
// MODE=diag (last line of run-agent-c3-now.txt = DIAG): data coverage, signal counts per half and samples; NO returns, no verdict.
// MODE=lab (otherwise): the same data, then the 5-year one-shot for every rule not frozen yet.
// DATA (GitHub Actions only; keys from secrets, never printed; official public sources only):
//   prices   = study-cache/grouped.json.gz (whole market incl. dead stocks, RESTORED READ ONLY) + sessions since (Massive grouped daily).
//   identity = squad 4's point-in-time Form 3/4/5 ticker map (squad4-cache/f345, READ ONLY), then today's list.
//   8-K 1.01 = squad 21's cached EDGAR full-text search (READ ONLY), then agent C lab 2's cache (READ ONLY); missing months fetched here.
//   accept.  = agent C lab 2's .hdr.sgml cache (READ ONLY); missing headers of matched filings fetched here.
//   insiders = agent C lab 2's parsed SEC insider-transactions data sets (agentc2-cache/ins3, READ ONLY); a missing quarter is downloaded.
//   short    = FINRA equity short-interest files (cdn.finra.org, official, free), parsed into agentc3-cache/finra.
//   shares   = data/shares.json.gz (SEC cover counts by CIK).
// The code that loads prices and builds trades is agent-c2-lab.mjs's (copied unchanged), so the yardsticks are the same.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, TIER2_T as VC_T2 } from './value-core.mjs';
import { ownAverage, relFlags, isInsider } from './squad1-core.mjs';
import { insiderClusters } from './agent-c-core.mjs';
import { eftsHits, mainDoc, hasItem } from './squad21-core.mjs';
import { acceptance, reactionSession } from './agent-c2-core.mjs';
import { COST, IC, SI, RULE_IDS, AVOID_IDS, mean, r4, halfOf, capG, icSignals, parseFinra, isListed, siCheck, dtcCut, settleCandidates, avoidStat, avoidJudge, trySmallBar, spyGate, preRegister } from './agent-c3-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', EFTS = local(env.EFTS_BASE) || 'https://efts.sec.gov', FINRA = local(env.FINRA_BASE) || 'https://cdn.finra.org';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.AGC3_CACHE || 'agentc3-cache', SC2 = env.AGC2_CACHE || 'agentc2-cache', SC21 = env.SQ21_CACHE || 'squad21-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = 'data/agent-c3-lab.json', DIAGF = 'data/agent-c3-diag.json', LIB = 'data/strategy-library.json';
const MODE = env.MODE === 'diag' || env.DIAG ? 'diag' : 'lab';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const addDays = (d, n) => iso(Date.parse(d + 'T00:00:00Z') + n * 864e5);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.AGC3_MINUTES || 200) * 60e3, left = () => BUDGET - (Date.now() - t0);
const redact = (s) => String(s).replace(/(apiKey|token)=[^&\s]+/gi, '$1=***');
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(VC_T2, +LEAGUE.bar || 0, 4.0), STATUS = {};
log('agent C lab 3, mode ' + MODE + '; frozen already: ' + (Object.keys(FROZEN).join(', ') || 'none') + '; proof bar ' + BAR);
if (MODE === 'lab') { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' Agent C entries written now'); }

// ================= 1. PRICES (agent-c2-lab.mjs, copied unchanged) =================
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

// ================= 2. SEC SOURCES (agent-c2-lab pattern) =================
let nextSec = 0, secReq = 0, secFail = 0; const SECFAILS = [], GAP = local(env.SEC_BASE) || local(env.EFTS_BASE) ? 0 : 125;
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
const quarterEnd = (q) => iso(Date.UTC(+q.slice(0, 4), +q.slice(5) * 3, 0));

// ---- 2a. point-in-time ticker map (squad 4's cache, read only) ----
const CIKMAP = new Map(), SYMMAP = new Map(); { const qs = quarters(2021), fail = []; let from4 = 0;
  for (const q of qs) { let x = JZ(SC4 + '/f345/' + q + '.json.gz', null); if (x) from4++; if (!x) x = JZ(SC2 + '/f345/' + q + '.json.gz', null);
    if (!x) { fail.push(q); continue; } for (const [sym, cik, f, l, n] of x.map) { (CIKMAP.get(cik) || CIKMAP.set(cik, []).get(cik)).push([sym, f, l, n]); (SYMMAP.get(sym) || SYMMAP.set(sym, []).get(sym)).push([cik, f, l, n]); } }
  STATUS.tickerMap = { ok: qs.slice(0, -1).every(q => !fail.includes(q)), quarters: qs.length, fromSquad4Cache: from4, missing: fail, ciks: CIKMAP.size };
  log('ticker map: ' + JSON.stringify(STATUS.tickerMap)); }
const SH = JZ('data/shares.json.gz', { t: {}, c: {} }), SECCIK = J('data/sec-ciks.json', {});
const todayCik = (s) => { const a = SH.t && (SH.t[s] || SH.t[s.replace(/\./g, '-')]); if (a) return String(+a); const y = SECCIK[s]; return y ? String(+y[0]) : null; };
const TODAYSYMS = new Map(); for (const s of SYMS) { const c = todayCik(s); if (c) (TODAYSYMS.get(c) || TODAYSYMS.set(c, []).get(c)).push(s); }
const symFor = (cik, tickers, d) => { const t = Math.min(onOrAfter(d), T - 1), c = String(+cik), sp = (CIKMAP.get(c) || []).filter(s => d >= addDays(s[1], -400) && d <= addDays(s[2], 400)).sort((a, b) => b[3] - a[3]);
  for (const s of [...sp.map(x => x[0]), ...(tickers || []), ...(TODAYSYMS.get(c) || [])]) { const i = SY.get(s); if (i !== undefined && hasPx(i, t)) return s; } return null; };
const cikFor = (sym, d) => { const sp = (SYMMAP.get(sym) || []).filter(s => d >= addDays(s[1], -400) && d <= addDays(s[2], 400)).sort((a, b) => b[3] - a[3]); return sp.length ? String(+sp[0][0]) : todayCik(sym); };
const sharesKnown = (cik, d) => { const a = SH.c && SH.c[String(+cik)]; if (!a) return null; const lim = addDays(d, -30); let v = null; for (const [e, n] of a) if (e <= lim) v = n; return v; };

// ================= 3. C-IC1 DATA =================
// ---- 3a. insider purchases (agent C lab 2's parsed data sets, read only; a missing quarter is downloaded into this lab's cache) ----
const BUYS = []; let insCut = null; { const qs = quarters(2021), fail = []; let got = 0, from2 = 0;
  const tsv = (zip, name) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const Ls = txt.split(/\r?\n/), H = Ls[0].split('\t'); return { H, rows: Ls.slice(1).filter(Boolean).map(l => l.split('\t')) }; };
  for (const q of qs) { let x = JZ(SC2 + '/ins3/' + q + '.json.gz', null); if (x) from2++; if (!x) x = JZ(SC + '/ins3/' + q + '.json.gz', null);
    if (!x && !local(env.SEC_BASE) && left() > 100 * 60e3) { const zip = SC + '/ins.zip';
      if (['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/'].some(p => download(SEC + p + q + '_form345.zip', zip))) { const S = tsv(zip, 'SUBMISSION.tsv'), Nt = tsv(zip, 'NONDERIV_TRANS.tsv'), RO = tsv(zip, 'REPORTINGOWNER.tsv'); try { fs.unlinkSync(zip); } catch (e) {}
        if (S && Nt && RO) { const own = new Map(), ri = (n) => RO.H.indexOf(n); for (const r of RO.rows) if (!own.has(r[ri('ACCESSION_NUMBER')])) own.set(r[ri('ACCESSION_NUMBER')], [String(+r[ri('RPTOWNERCIK')] || ''), r[ri('RPTOWNER_RELATIONSHIP')] || '']);
          const si = (n) => S.H.indexOf(n), ni = (n) => Nt.H.indexOf(n), sub = new Map();
          for (const r of S.rows) { const dt = String(r[si('DOCUMENT_TYPE')] || ''); if (/^[45](\/A)?$/.test(dt)) sub.set(r[si('ACCESSION_NUMBER')], { d: isoD(r[si('FILING_DATE')]), dt, sym: String(r[si('ISSUERTRADINGSYMBOL')] || '').toUpperCase().trim().replace(/-/g, '.'), cik: String(+r[si('ISSUERCIK')] || '') }); }
          const hist = new Set(), buys = [];
          for (const r of Nt.rows) { const code = r[ni('TRANS_CODE')]; if (code !== 'P' && code !== 'S') continue; const acc = r[ni('ACCESSION_NUMBER')], s = sub.get(acc), o = own.get(acc); if (!s || !o || !o[0]) continue; const td = isoD(r[ni('TRANS_DATE')]); if (!td) continue;
            hist.add(o[0] + '|' + td.slice(0, 7));
            if (code === 'P' && s.dt === '4' && r[ni('TRANS_ACQUIRED_DISP_CD')] === 'A' && s.d && /^[A-Z][A-Z0-9.]{0,6}$/.test(s.sym)) { const sh = +r[ni('TRANS_SHARES')], px = +r[ni('TRANS_PRICEPERSHARE')]; if (sh > 0 && px > 0) buys.push([s.sym, s.d, o[0], Math.round(sh * px), o[1], s.cik, td]); } }
          x = { v: 1, hist: [...hist], buys }; WZ(SC + '/ins3/' + q + '.json.gz', x); got++; } } }
    if (!x) { fail.push(q); continue; } insCut = quarterEnd(q); for (const b of x.buys) BUYS.push(b); }
  STATUS.insiders = { ok: !fail.some(q => q < qs[qs.length - 1]) && !!insCut, quarters: qs.length, fromLab2Cache: from2, downloadedNow: got, missing: fail, purchases: BUYS.length, lastQuarterEnd: insCut };
  log('insider data: ' + JSON.stringify(STATUS.insiders)); }
const CLUST = []; { const rows = []; let notIns = 0;
  for (const [sym, d, who, usd, rel] of BUYS) { if (d < IC.fromDate || (insCut && d > insCut)) continue; if (!isInsider(relFlags(rel))) { notIns++; continue; } rows.push({ sym, d, who, usd, insider: true }); }
  const ev = insiderClusters(rows, onOrAfter, { window: IC.window, minPeople: IC.minPeople, minUsd: 1 }); let noPx = 0;
  for (const e of ev) { const i = SY.get(e.sym), Sc = onOrAfter(e.d), Kc = firstAfter(e.d); if (i === undefined || Kc >= T || !hasPx(i, Math.min(Kc, T - 1))) { noPx++; continue; } CLUST.push({ i, Sc, Kc, d: e.d, people: e.people, usd: e.usd }); }
  STATUS.clusters = { insiderRows: rows.length, notInsider: notIns, clusterDays: ev.length, withPrice: CLUST.length, noPrice: noPx }; log('clusters: ' + JSON.stringify(STATUS.clusters)); }

// ---- 3b. 8-K item 1.01 hits (squad 21's cache, then lab 2's cache, read only; missing months fetched into this lab's cache) ----
async function efts(phrase, a, b) { const hits = []; for (let from = 0; from < 10000; from += 100) {
    const j = await sec(EFTS + '/LATEST/search-index?q=' + encodeURIComponent('"' + phrase + '"') + '&forms=8-K&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from);
    if (!j || !j.hits) return null; const tot = (j.hits.total && j.hits.total.value) || 0;
    if (from === 0 && tot >= 9900 && a < b) { const mid = iso((Date.parse(a) + Date.parse(b)) / 2), x = await efts(phrase, a, mid), y = await efts(phrase, addDays(mid, 1), b); return x && y ? x.concat(y) : null; }
    const h = eftsHits(j); hits.push(...h); if (h.length < 100 || from + 100 >= tot) break; } return hits; }
const H101 = [], FT = { complete: true, fromSquad21: 0, fromLab2: 0, fetched: 0, missing: [] }, ICEND = insCut ? addDays(insCut, 20) : iso(Date.now());
for (const m of months('2021-08')) { if (m > ICEND.slice(0, 7)) break; const slug = 'material-definitive-agreement', recent = m >= iso(Date.now() - 10 * 864e5).slice(0, 7);
  let h = recent ? null : J(SC21 + '/efts/' + slug + '/' + m + '.json', null); if (h) FT.fromSquad21++;
  if (!h && !recent) { h = J(SC2 + '/efts/' + m + '.json', null); if (h) FT.fromLab2++; } if (!h && !recent) h = J(SC + '/efts/' + m + '.json', null);
  if (!h) { h = await efts('Material Definitive Agreement', m + '-01', monthEnd(m)); if (h) { h = h.filter(x => hasItem(x, '1.01')); W(SC + '/efts/' + m + '.json', h); FT.fetched++; } }
  if (!h) { FT.complete = false; FT.missing.push(m); continue; } H101.push(...h); }
STATUS.efts = { ok: FT.complete, ...FT, hits: H101.length, through: ICEND }; log('8-K 1.01 search: ' + JSON.stringify(STATUS.efts));
const EV = []; { const seen = new Set(); let noSym = 0, earn = 0;
  for (const h of H101) { if (!mainDoc(h) || !h[1] || seen.has(h[1]) || !hasItem(h, '1.01')) continue; seen.add(h[1]); if (hasItem(h, '2.02')) { earn++; continue; }
    const sym = symFor(h[2], h[7], h[3]); if (!sym) { noSym++; continue; } if (onOrAfter(h[3]) >= T) continue;
    EV.push({ adsh: h[1], cik: String(+h[2]), d: h[3], sym, i: SY.get(sym) }); }
  STATUS.events = { filings: seen.size, earningsDay: earn, noStock: noSym, withStock: EV.length }; log('item 1.01 main documents: ' + JSON.stringify(STATUS.events)); }
// ---- 3c. acceptance times of the 8-Ks near a cluster (lab 2's header cache read only; missing ones fetched) and the matches ----
const HDR2 = J(SC2 + '/hdr.json', {}), HDR = J(SC + '/hdr.json', {}), CONTRACTS = [];
{ const near = new Map(); for (const q of CLUST) (near.get(q.i) || near.set(q.i, []).get(q.i)).push(q.Sc);
  const cand = EV.filter(e => { const a = near.get(e.i); if (!a) return false; const r0 = onOrAfter(e.d); return a.some(s => Math.abs(s - r0) <= IC.matchGap + 3); });
  let read = 0, ix = 0, fromLab2 = 0; const todo = cand.filter(e => !(e.adsh in HDR2) && !(e.adsh in HDR));
  const work = async () => { while (ix < todo.length) { const e = todo[ix++]; if (left() < 40 * 60e3) break; const a = e.adsh.replace(/-/g, ''); const t = await sec(SEC + '/Archives/edgar/data/' + e.cik + '/' + a + '/' + e.adsh + '.hdr.sgml', 'text');
      if (t === undefined) continue; HDR[e.adsh] = acceptance(t); read++; } };
  await Promise.all([work(), work()]); W(SC + '/hdr.json', HDR);
  for (const e of cand) { const acc = e.adsh in HDR2 ? HDR2[e.adsh] : HDR[e.adsh] || null; if (e.adsh in HDR2) fromLab2++; const R = reactionSession(D, acc, e.d); if (R >= T - 1) continue; CONTRACTS.push({ i: e.i, R, d: e.d, acc: !!acc }); }
  STATUS.icHeaders = { candidates: cand.length, fromLab2, readNow: read, withTime: CONTRACTS.filter(c => c.acc).length, notRead: todo.length - read }; log('C-IC1 8-K headers: ' + JSON.stringify(STATUS.icHeaders)); }
const IC_SIG = icSignals(CLUST, CONTRACTS).filter(z => z.k < T && z.k >= 1 && LIQ[z.i * T + z.k - 1]).map(z => ({ i: z.i, k: z.k, d: z.d, info: { cluster: z.dc, contract: z.d8, gap: z.Sc - z.R } }));
const cnt = (a, h) => ({ older: a.filter(z => halfOf(z.d) === 'older' && z.k + h - 1 < T).length, newer: a.filter(z => halfOf(z.d) === 'newer' && z.k + h - 1 < T).length });
STATUS.icCounts = cnt(IC_SIG, IC.hold); log('C-IC1 liquid signals: ' + JSON.stringify(STATUS.icCounts));
const IC_OK = STATUS.price.ok && STATUS.insiders.ok && STATUS.efts.ok && STATUS.tickerMap.ok;

// ================= 4. C-SI1 DATA (FINRA) =================
let finReq = 0, nextF = 0; async function finra(date) { const f = SC + '/finra/' + date + '.json.gz', c = JZ(f, null); if (c) return c;
  for (let a = 0; a < 3; a++) { const slot = Math.max(Date.now(), nextF); nextF = slot + (local(env.FINRA_BASE) ? 0 : 150); if (slot > Date.now()) await sleep(slot - Date.now()); finReq++; let r;
    try { r = await fetch(FINRA + '/equity/otcmarket/biweekly/shrt' + date.replace(/-/g, '') + '.csv', { headers: { 'User-Agent': 'stock-2 research' }, signal: AbortSignal.timeout(90000) }); } catch (e) { await sleep(2000 * (a + 1)); continue; }
    if (r.status === 404 || r.status === 403) return null; if (r.status === 429 || r.status >= 500) { await sleep(5000 * (a + 1)); continue; } if (!r.ok) return null;
    const p = parseFinra(await r.text()); if (!p.header || !p.rows.length) return null; const all = p.rows.length;
    const rows = p.rows.filter(x => isListed(x.mkt)).map(x => [x.sym, x.short, x.split ? 1 : 0, isFinite(x.dtc) ? x.dtc : null, x.mkt]); const o = { date, settle: p.rows[0].settle, all, rows }; WZ(f, o); return o; }
  return null; }
const FILES = []; { const ms = months(SI.from); let expected = 0, found = 0, lastFound = null; const groups = [];
  for (const m of ms) for (const g of settleCandidates(m)) groups.push(g);
  for (const g of groups) { if (g[g.length - 1] > iso(Date.now() - 864e5)) continue; let got = null; for (const d of g) { if (d > iso(Date.now())) continue; const x = await finra(d); if (x) { got = x; break; } } if (got) { FILES.push(got); lastFound = got.date; } }
  for (const g of groups) if (lastFound && g[g.length - 1] <= lastFound) expected++; found = FILES.length;
  const first = FILES[0]; STATUS.finra = { ok: found >= SI.minFiles * expected && !!first && first.rows.length > 1000, files: found, expected, first: first ? first.date : null, last: lastFound, requests: finReq,
    firstListedRows: first ? first.rows.length : 0, firstAllRows: first ? first.all : 0, markets: first ? [...new Set(first.rows.map(r => r[4]))].slice(0, 12) : [] };
  log('FINRA: ' + JSON.stringify(STATUS.finra)); }
const SI_SIG = [], DTC_SIG = [], SI_DROP = { noStock: 0, notLiquid: 0, split: 0, noShares: 0, dataError: 0, tooLate: 0, dtcFileSkipped: 0 }, RATIOS = [];
for (const F of FILES) { const S = onOrAfter(F.settle || F.date), k = S + SI.pubLag; if (k >= T) { SI_DROP.tooLate += F.rows.length; continue; } const liq = [];
  for (const [sym, short, split, dtc] of F.rows) { const i = SY.get(sym.replace(/\//g, '.')); if (i === undefined || i === spyI) { SI_DROP.noStock++; continue; } if (!LIQ[i * T + k - 1]) { SI_DROP.notLiquid++; continue; } if (split) { SI_DROP.split++; continue; }
    liq.push([i, dtc]); const cik = cikFor(SYMS[i], F.date), sh = cik ? sharesKnown(cik, D[k]) : null, c = siCheck(short, sh);
    if (c.why === 'noShares' || c.why === 'noShort') SI_DROP.noShares++; else if (c.why === 'dataError') SI_DROP.dataError++; else { RATIOS.push(c.ratio); if (c.flag) SI_SIG.push({ i, k, d: F.date, info: { ratio: r4(c.ratio), dtc } }); } }
  const cut = dtcCut(liq.map(x => x[1])); if (cut === null) { SI_DROP.dtcFileSkipped++; continue; } for (const [i, dtc] of liq) if (isFinite(dtc) && dtc !== null && dtc >= cut) DTC_SIG.push({ i, k, d: F.date, info: { dtc, cut } }); }
{ const q = (p) => { const a = [...RATIOS].sort((x, y) => x - y); return a.length ? r4(a[Math.floor(p * (a.length - 1))]) : null; };
  STATUS.si = { dropped: SI_DROP, ratioRows: RATIOS.length, ratioP50: q(0.5), ratioP90: q(0.9), ratioP99: q(0.99), over20: RATIOS.filter(x => x > SI.minRatio).length, flagsSI: SI_SIG.length, flagsDTC: DTC_SIG.length,
    counts: { 'C-SI1': cnt(SI_SIG, SI.hold), 'C-SI1-DTC': cnt(DTC_SIG, SI.hold) } }; log('C-SI1 flags: ' + JSON.stringify(STATUS.si)); }
const SI_OK = STATUS.price.ok && STATUS.finra.ok && STATUS.tickerMap.ok;
if (SECFAILS.length) log('SEC requests ' + secReq + ', failed ' + secFail + ': ' + SECFAILS.slice(0, 3).map(redact).join(' | '));

// ================= 5. DIAG =================
if (MODE === 'diag') { const samp = (a, f) => a.filter((z, j) => j % Math.max(1, Math.floor(a.length / 20)) === 0).slice(0, 20).map(f);
  W(DIAGF, { generatedAt: new Date().toISOString(), note: 'DIAG: data coverage, signal counts and samples only; no returns computed, no verdict', window: [D[0], D[T - 1]], data: STATUS,
    icSample: samp(IC_SIG, z => ({ sym: SYMS[z.i], buy: D[z.k], ...z.info })), siSample: samp(SI_SIG, z => ({ sym: SYMS[z.i], settle: z.d, buy: D[z.k], ...z.info })), dtcSample: samp(DTC_SIG, z => ({ sym: SYMS[z.i], settle: z.d, buy: D[z.k], ...z.info })) });
  console.log('AGENT C3 DIAG | IC1 data ' + (IC_OK ? 'ok' : 'NOT OK') + ' ' + JSON.stringify(STATUS.icCounts) + ' | SI data ' + (SI_OK ? 'ok' : 'NOT OK') + ' ' + JSON.stringify(STATUS.si.counts));
  process.exit(0); }

// ================= 6. 5-YEAR ONE-SHOT (each rule once; first complete verdict frozen) =================
const RES = {}, need = RULE_IDS.filter(id => !FROZEN[id]);
const base = (extra) => ({ at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, yardstick: 'capBoth (AUD-1)', ...extra });
if (need.includes('C-IC1')) { if (!IC_OK) { RES['C-IC1'] = { verdict: 'NOT RUN', why: 'data incomplete: ' + JSON.stringify({ insiders: STATUS.insiders.ok, efts: STATUS.efts.ok, tickerMap: STATUS.tickerMap.ok }) }; log('- C-IC1: NOT RUN'); }
  else { const tr = tradesOf(IC_SIG, IC.hold), R = halves(tr, IC.hold), v = judge(R, { bar: BAR, extra: spyGate(tr) });
    RES['C-IC1'] = base({ cost: COST, ...v, trySmallBar: trySmallBar(R), results: R, shape: shapeOf(tr), hold: IC.hold, counts: STATUS.icCounts, trades: tradeRows(tr) });
    log('- C-IC1: ' + v.verdict + ' | older ' + fmt(R.older || {}) + ' | newer ' + fmt(R.newer || {}) + ' | ' + v.why); } }
for (const [id, sigs] of [['C-SI1', SI_SIG], ['C-SI1-DTC', DTC_SIG]]) { if (!need.includes(id)) continue;
  if (!SI_OK) { RES[id] = base({ verdict: 'NEEDS DATA', level: 'NONE', why: 'data stop (pre-registered): ' + JSON.stringify(STATUS.finra).slice(0, 300) }); log('- ' + id + ': NEEDS DATA'); continue; }
  const tr = tradesOf(sigs, SI.hold), a = tr.map(z => ({ t: z.k, s: z.s, g: z.g, c: z.c, sp: isFinite(z.spy) ? z.spy : null, ob: typeof z.own === 'number' ? z.own : null, half: z.half, d: z.d }));
  const R = { older: avoidStat(a.filter(z => z.half === 'older'), SI.hold), newer: avoidStat(a.filter(z => z.half === 'newer'), SI.hold) }, v = avoidJudge(R, BAR);
  const byDay = new Map(); for (const z of a) (byDay.get(z.t) || byDay.set(z.t, []).get(z.t)).push(z.g - z.c);
  RES[id] = base({ cost: 'none (avoid test: costs cancel)', ...v, results: R, hold: SI.hold, counts: STATUS.si.counts[id], shape: { trades: a.length, stocks: new Set(a.map(z => z.s)).size, days: byDay.size, worstDayEdge: r4(Math.min(...[...byDay.values()].map(mean))), bestDayEdge: r4(Math.max(...[...byDay.values()].map(mean))),
    byYear: Object.fromEntries([...new Set(a.map(z => z.d.slice(0, 4)))].sort().map(y => { const v2 = a.filter(z => z.d.slice(0, 4) === y).map(z => z.g - z.c); return [y, { n: v2.length, edge: r4(mean(v2)) }]; })) }, trades: tradeRows(tr) });
  const f2 = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd) edge ' + pc(h.edge) + ' t ' + h.t + ' (day ' + h.tDay + ', block ' + h.tBlock + ') vsSpy ' + pc(h.vsSpy) + ' own ' + pc(h.vsOwn) + ' (t ' + h.tOwn + ') noWorst2 ' + pc(h.noWorst2);
  log('- ' + id + ': ' + v.verdict + ' / ' + v.level + ' | older ' + f2(R.older) + ' | newer ' + f2(R.newer) + ' | ' + v.why); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])), (r) => r && r.verdict && r.verdict !== 'NOT RUN');
const levelOf = (id, r) => !r ? 'NOT JUDGED YET' : AVOID_IDS.includes(id) ? (r.level || 'NONE') : r.verdict === 'PROVEN' ? 'PROVEN' : r.verdict === 'TRADABLE SMALL' ? 'TIER 2 (TRADABLE SMALL)' : r.trySmallBar ? 'TRY SMALL bar only (NOT PROVEN)' : 'NONE';

// ================= 7. OUTPUT + LIBRARY =================
const tradesOut = Object.fromEntries(Object.entries(RES).filter(([k, r]) => r.trades && !FROZEN[k]).map(([k, r]) => [k, r.trades.slice(0, 4000)]));
W(OUT, { generatedAt: new Date().toISOString(), agent: 'C', about: 'Agent C (Crowd) one-shot tests of 12 Nov 2026: C-IC1 insider cluster + 8-K 1.01; C-SI1 / C-SI1-DTC high short interest / days-to-cover (avoid). Research only; never an order.',
  preRegistered: 'agent-c3-core.mjs header (12 Nov 2026, before any result)', window: [D[0], D[T - 1]], bar: BAR, data: STATUS,
  levels: Object.fromEntries(RULE_IDS.map(id => [id, { verdict: firstRun[id] ? firstRun[id].verdict : 'NOT JUDGED YET', level: levelOf(id, firstRun[id]) }])), firstRun,
  latest: latestBlock({ at: new Date().toISOString(), data: STATUS }), trades: { ...(PREV.trades || {}), ...tradesOut } });
try { const LB = J(LIB, null); let ch = false;
  for (const id of RULE_IDS) { const r = firstRun[id], e = LB && LB.strategies.find(x => x.id === id); if (!e || !r || e.tested === r.frozenAt.slice(0, 10)) continue;
    const h = (k) => { const x = r.results && r.results[k]; if (!x || !x.n) return 'n/a'; return AVOID_IDS.includes(id) ? x.n + ' cases, ' + x.days + ' days, edge ' + pc(x.edge) + ' vs the average stock, t ' + x.t : x.n + ' trades, ' + x.days + ' days, avg ' + pc(x.avg) + ' (stress ' + pc(x.avgStress) + '), edge ' + pc(x.edge) + ', t ' + x.tBlock; };
    e.tested = r.frozenAt.slice(0, 10); e.agent = 'C';
    e.status = r.verdict === 'PROVEN' || r.verdict === 'PROVEN AVOID' ? 'tested: passed (' + r.verdict + ', agent-c3-lab)' : r.verdict === 'TRADABLE SMALL' || /tier 2/.test(r.level || '') ? 'tested: tier 2 (agent-c3-lab, ' + r.verdict + '); forward paper first' : 'tested: ' + r.verdict.toLowerCase() + ' (agent-c3-lab, frozen ' + e.tested + ')';
    e.result = { verdict: r.verdict, level: levelOf(id, r), why: r.why, older: h('older'), newer: h('newer') }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('agent-c3-lab: library not updated: ' + e.message); }
console.log('AGENT C LAB 3 done: ' + RULE_IDS.map(id => id + ' ' + (firstRun[id] ? firstRun[id].verdict : 'NOT JUDGED YET')).join(', '));
