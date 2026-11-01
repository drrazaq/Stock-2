// AGENT C LAB (Crowd lane; 1 Nov 2026). The exact pre-registered rules are in the agent-c-core.mjs header (C-INSQ1, C-CONG1-20,
// C-CONG1-60, EXP-CONG1). Research only: never places an order, no Telegram, no paper lane (a pass goes to forward paper first).
// MODE=diag (last line of run-agent-c-now.txt = DIAG): data coverage, signal counts per half, PTR parse samples; NO returns, no verdict.
// MODE=lab  (otherwise): the same data, then the 5-year one-shot for every rule not frozen yet (data/agent-c-lab.json firstRun).
// DATA (GitHub Actions only; keys from secrets, never printed; official public sources only, no scraping of logged-in pages):
//   prices   = study-cache/grouped.json.gz (Sunday job's whole-market cache incl. dead stocks, RESTORED READ ONLY) + sessions since (Massive).
//   insiders = squad 1's parsed SEC Form 3/4/5 data sets (squad1-cache/insider2, RESTORED READ ONLY); a missing quarter is downloaded from
//              the SEC into this lab's own cache (agentc-cache/insider2).
//   B-FCF1   = value-lab's SEC companyfacts cache (value-cache/facts.json.gz, READ ONLY) + data/shares.json.gz (share counts by CIK).
//   Congress = House Clerk yearly index ZIPs + PTR PDFs (disclosures-clerk.house.gov, public), pdftotext -layout; parsed rows cached in
//              agentc-cache/ptr (raw PDFs are not kept).
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, fcfCheck, TIER2_T } from './value-core.mjs';
import { ownAverage, relFlags, isInsider } from './squad1-core.mjs';
import { RULES as XRULES, walkHold, PITRanker, midSplit } from './expert-core.mjs';
import { COST, INSQ, CONG, RULE_IDS, mean, r4, halfOf, capG, insiderClusters, stopWalk, sma200, parseFdIndex, parsePtrText, isScanned, purchases, congDataOk, trySmallBar, preRegister } from './agent-c-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', HOUSE = local(env.HOUSE_BASE) || 'https://disclosures-clerk.house.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.AGC_CACHE || 'agentc-cache', SC1 = env.SQ1_CACHE || 'squad1-cache', VC = env.VALUE_CACHE || 'value-cache';
const OUT = 'data/agent-c-lab.json', DIAGF = 'data/agent-c-diag.json', LIB = 'data/strategy-library.json', PTRF = 'data/house-ptr.json.gz';
const MODE = env.MODE === 'diag' || env.DIAG ? 'diag' : 'lab';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const addDays = (d, n) => iso(Date.parse(d + 'T00:00:00Z') + n * 864e5);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.AGC_MINUTES || 280) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};
log('agent C lab, mode ' + MODE + '; frozen already: ' + (Object.keys(FROZEN).join(', ') || 'none') + '; proof bar ' + BAR);

// ================= 0. PRE-REGISTRATION (library, before any computation) =================
if (MODE === 'lab') { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' Agent C entries written now'); }

// ================= 1. PRICES (squad 1 pattern, with lows) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('agent-c-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let ms = Date.parse(cacheLast) + 864e5; ms <= Date.now(); ms += 864e5) { const d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + fresh.length + (env.MASSIVE_KEY ? '' : ' (no MASSIVE_KEY)'));
const D = Object.keys(store.days).sort(), T = D.length;
const firstAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo; };   // first session strictly after d
const onOrAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
const SY = new Map(); for (const d of D) { for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size); const x = store.days[d].x; if (x) for (const s of x.T) if (/^[A-Z]{1,5}$/.test(s) && !SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const O = new Float32Array(N).fill(NaN), L = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; L[k] = x.l ? x.l[j] : NaN; C[k] = x.c[j]; V[k] = x.v[j]; MAIN[k] = 1; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; C[k] = x.x.c[j]; O[k] = x.x.o ? x.x.o[j] : NaN; L[k] = x.x.l ? x.x.l[j] : NaN; V[k] = x.x.v ? x.x.v[j] : NaN; } });
store = null;
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; L[q] /= r; C[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY');
const LIQ = new Uint8Array(N); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? C[b + t] * V[b + t] : NaN; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const w = MAIN[b + t - 20] ? C[b + t - 20] * V[b + t - 20] : NaN; if (isFinite(w)) { s -= w; n--; } } if (t >= 19 && n === 20 && C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqAt = new Map(), liqList = (t) => { if (!liqAt.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqAt.set(t, a); } return liqAt.get(t); };
const closeAt = (i, x, k) => { for (let q = x; q >= k; q--) { const z = C[i * T + q]; if (z > 0) return z; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1) return null; const e = O[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const series = (i) => { const b = i * T; return { o: O.subarray(b, b + T), l: L.subarray(b, b + T), c: C.subarray(b, b + T) }; };
const hasPx = (i, t) => { for (let q = Math.max(0, t - 5); q <= Math.min(T - 1, t + 5); q++) if (C[i * T + q] > 0) return true; return false; };
const cMemo = new Map(), ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
STATUS.price = { ok: T >= 1000, sessions: T, from: D[0], to: D[T - 1], stocks: NS };
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS);

// one-open-trade engine for event rules (squad 1 pattern): sigs [{ t (signal session), i, k, d }], walk(i, k) -> { x, g, kind } | null
function tradesOf(sigs, walk, end = T - 1) { const out = [], busy = new Map(), spans = new Map();
  for (const z of [...sigs].sort((p, q) => p.k - q.k || p.i - q.i)) { if ((busy.get(z.i) ?? -1) >= z.k) continue; const w = walk(z.i, z.k); if (!w || w.x > end) continue;
    const c = ctrlSpan(z.k, w.x); if (c === null) continue; busy.set(z.i, w.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, w.x]);
    out.push({ t: z.k, s: SYMS[z.i], i: z.i, k: z.k, x: w.x, g: capG(w.g), c, kind: w.kind, half: halfOf(z.d), d: z.d, who: z.who }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.x - z.k + 1, key = z.i + '|' + len + '|' + z.half;
    if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 253, to: end, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  return out; }
const halves = (tr, h) => ({ older: halfStat(tr.filter(z => z.half === 'older'), h), newer: halfStat(tr.filter(z => z.half === 'newer'), h), all: halfStat(tr, h) });
const shapeOf = (tr) => { const net = tr.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), s = (a) => a.reduce((x, y) => x + y, 0);
  return { trades: tr.length, stocks: new Set(tr.map(z => z.s)).size, days: new Set(tr.map(z => z.k)).size, win: r4(w.length / (tr.length || 1)), avgWin: r4(mean(w)), avgLoss: r4(mean(l)), pf: l.length ? r4(s(w) / -s(l)) : null,
    stops: tr.filter(z => z.kind === 'stop').length, worst: r4(Math.min(...net)), byYear: Object.fromEntries([...new Set(tr.map(z => z.d.slice(0, 4)))].sort().map(y => { const v = tr.filter(z => z.d.slice(0, 4) === y).map(z => z.g - COST); return [y, { n: v.length, avg: r4(mean(v)) }]; })) }; };
const tradeRows = (tr) => tr.map(z => ({ s: z.s, sig: z.d, buy: D[z.k], sell: D[z.x], exit: z.kind, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST), ...(z.who ? { who: String(z.who).slice(0, 40) } : {}) }));
const fmt = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win) + ' med ' + pc(h.median) + ' worst ' + pc(h.worst);

// ================= 2. C-INSQ1 DATA =================
async function download(url, file) { try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 30 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
const tsv = (zip, name) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const Ls = txt.split(/\r?\n/), H = Ls[0].split('\t'); return { H, rows: Ls.slice(1).filter(Boolean).map(l => l.split('\t')) }; };
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : /^\d{4}-\d\d-\d\d/.test(String(s || '')) ? String(s).slice(0, 10) : null; };
const BUYS = []; { const qs = [], now = new Date(); for (let y = 2021; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, q * 3, 1)) < now) qs.push(y + 'q' + q);
  let from1 = 0, got = 0; const fail = [];
  for (const q of qs) { let x = J(SC1 + '/insider2/' + q + '.json', null); if (x) from1++; if (!x) x = J(SC + '/insider2/' + q + '.json', null);
    if (!x && !local(env.SEC_BASE) && left() > 150 * 60e3) for (const p of ['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/']) { const zip = SC + '/ins.zip'; if (!(await download(SEC + p + q + '_form345.zip', zip))) continue;
      const S = tsv(zip, 'SUBMISSION.tsv'), Nt = tsv(zip, 'NONDERIV_TRANS.tsv'), RO = tsv(zip, 'REPORTINGOWNER.tsv'); try { fs.unlinkSync(zip); } catch (e) {} if (!S || !Nt || !RO) continue;
      const own = new Map(), ri = (n) => RO.H.indexOf(n); for (const r of RO.rows) if (!own.has(r[ri('ACCESSION_NUMBER')])) own.set(r[ri('ACCESSION_NUMBER')], [r[ri('RPTOWNERCIK')], r[ri('RPTOWNER_RELATIONSHIP')] || '', r[ri('RPTOWNER_TITLE')] || '']);
      const si = (n) => S.H.indexOf(n), ni = (n) => Nt.H.indexOf(n), sub = new Map();
      for (const r of S.rows) if (r[si('DOCUMENT_TYPE')] === '4') sub.set(r[si('ACCESSION_NUMBER')], { d: isoD(r[si('FILING_DATE')]), sym: String(r[si('ISSUERTRADINGSYMBOL')] || '').toUpperCase().trim().replace(/-/g, '.'), cik: String(+r[si('ISSUERCIK')] || '') });
      const rows = []; for (const r of Nt.rows) { if (r[ni('TRANS_CODE')] !== 'P' || r[ni('TRANS_ACQUIRED_DISP_CD')] !== 'A') continue; const s = sub.get(r[ni('ACCESSION_NUMBER')]); if (!s || !s.d || !/^[A-Z][A-Z0-9.]{0,6}$/.test(s.sym)) continue;
        const o = own.get(r[ni('ACCESSION_NUMBER')]); if (!o) continue; const sh = +r[ni('TRANS_SHARES')], px = +r[ni('TRANS_PRICEPERSHARE')]; if (sh > 0 && px > 0) rows.push([s.sym, s.d, o[0], Math.round(sh * px), o[1], o[2], s.cik]); }
      x = { rows }; W(SC + '/insider2/' + q + '.json', x); got++; break; }
    if (!x) { fail.push(q); continue; } for (const r of x.rows) BUYS.push(r); }
  STATUS.insider = { ok: !fail.some(q => q < qs[qs.length - 1]), quarters: qs.length, fromSquad1Cache: from1, downloadedNow: got, missing: fail, purchases: BUYS.length };
  log('insider: ' + JSON.stringify(STATUS.insider)); }
const FX = JZ(VC + '/facts.json.gz', null), SH = JZ('data/shares.json.gz', { c: {} });
STATUS.facts = { ok: !!(FX && FX.c && Object.keys(FX.c).length > 500), companies: FX && FX.c ? Object.keys(FX.c).length : 0, shareSeries: Object.keys(SH.c || {}).length };
log('facts: ' + JSON.stringify(STATUS.facts));
const TAGS = { cfo: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'], capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'],
  rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], cogs: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'],
  inv: ['InventoryNet'], eq: ['StockholdersEquity'], debt: ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent', 'ShortTermBorrowings'] };   // decoded-lab.mjs, unchanged
const coMemo = new Map(), coOf = (cik) => { if (!cik || !FX || !FX.c) return null; if (coMemo.has(cik)) return coMemo.get(cik); const c = FX.c[String(+cik)]; let r = null;
  if (c) { const m = (tags) => { const o = {}; for (const t of tags) if (c[t]) o[t] = c[t].map(([s, e, v, f]) => ({ s, e, v, f })); return o; }; r = { cfo: m(TAGS.cfo), capex: m(TAGS.capex), rev: m(TAGS.rev), cogs: m(TAGS.cogs), inv: m(TAGS.inv), eq: m(TAGS.eq), debt: m(TAGS.debt) }; }
  coMemo.set(cik, r); return r; };
const sharesKnown = (cik, d) => { const a = SH.c && SH.c[String(+cik)]; if (!a) return null; const lim = addDays(d, -30); let v = null; for (const [e, n] of a) if (e <= lim) v = n; return v; };
const SMA = new Map(), smaAt = (i, t) => { if (!SMA.has(i)) SMA.set(i, sma200(C.subarray(i * T, i * T + T))); return SMA.get(i)[t]; };
const INSQ_SIG = [], INSQ_DROP = { noPrice: 0, early: 0, notLiquid: 0, under200: 0, noCompany: 0, noShares: 0, fcfFail: 0 };
if (STATUS.insider.ok && STATUS.facts.ok) {
  const rows = BUYS.map(([sym, d, who, usd, rel, , cik]) => ({ sym, d, who, usd, cik: cik || null, insider: isInsider(relFlags(rel)) }));
  const ev = insiderClusters(rows, onOrAfter); STATUS.insider.clusters = ev.length;
  for (const e of ev) { const i = SY.get(e.sym); const k = firstAfter(e.d), t = k - 1; if (i === undefined || !hasPx(i, Math.min(k, T - 1))) { INSQ_DROP.noPrice++; continue; } if (t < 200 || k >= T) { INSQ_DROP.early++; continue; }
    if (!LIQ[i * T + t]) { INSQ_DROP.notLiquid++; continue; } if (!(C[i * T + t] > smaAt(i, t))) { INSQ_DROP.under200++; continue; }
    const co = coOf(e.cik); if (!co) { INSQ_DROP.noCompany++; continue; } const sh = sharesKnown(e.cik, D[t]); if (!(sh > 0)) { INSQ_DROP.noShares++; continue; }
    const f = fcfCheck(co, D[t], C[i * T + t], sh); if (!f.ok) { INSQ_DROP.fcfFail++; continue; }
    INSQ_SIG.push({ t, i, k, d: e.d, sym: e.sym, people: e.people, usd: e.usd, fcfy: r4(f.fcfy), growth: r4(f.growth), de: r4(f.de) }); } }
const insqCount = { older: INSQ_SIG.filter(z => halfOf(z.d) === 'older' && z.k + INSQ.hold - 1 < T).length, newer: INSQ_SIG.filter(z => halfOf(z.d) === 'newer' && z.k + INSQ.hold - 1 < T).length, dropped: INSQ_DROP };
log('C-INSQ1 signals with a complete hold, older / newer: ' + insqCount.older + ' / ' + insqCount.newer + ' | dropped ' + JSON.stringify(INSQ_DROP));

// ================= 3. C-CONG1 DATA (House Clerk) =================
const now = new Date(), YEARS = []; for (let y = CONG.fromYear; y <= now.getUTCFullYear(); y++) YEARS.push(y);
let lastH = 0; async function house(url, kind) { for (let a = 0; a < 4; a++) { const w = (local(env.HOUSE_BASE) ? 0 : 250) - (Date.now() - lastH); if (w > 0) await sleep(w); lastH = Date.now();
    try { const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) }); if (r.status === 404) return null; if (r.status === 429 || r.status >= 500 || r.status === 403) { await sleep(5000 * (a + 1)); continue; } if (!r.ok) return undefined;
      return kind === 'buf' ? Buffer.from(await r.arrayBuffer()) : await r.text(); } catch (e) { await sleep(2000 * (a + 1)); } } return undefined; }
const IDX = [], idxStat = { years: YEARS.length, ok: 0, failed: [] };
for (const y of YEARS) { const cf = SC + '/house/idx-' + y + '.json'; let rows = J(cf, null); const stale = !rows || y >= now.getUTCFullYear() - 1;
  if (stale) { const buf = await house(HOUSE + '/public_disc/financial-pdfs/' + y + 'FD.zip', 'buf'); if (buf && buf.length > 200) { const zf = SC + '/fd.zip'; fs.writeFileSync(zf, buf);
      let xml = null; try { xml = execFileSync('unzip', ['-p', zf, y + 'FD.xml'], { maxBuffer: 5e8 }).toString(); } catch (e) {} try { fs.unlinkSync(zf); } catch (e) {}
      const p = xml ? parseFdIndex(xml) : []; if (p.length) { rows = p.filter(r => r.type === 'P'); W(cf, rows); } } }
  if (rows) { idxStat.ok++; for (const r of rows) IDX.push({ ...r, y }); } else idxStat.failed.push(y); }
log('House index: ' + JSON.stringify(idxStat) + '; PTRs listed ' + IDX.length);
const PTR = new Map(); let downloaded = 0, fetchedNow = 0, dlFail = 0; const SAMPLE_TXT = [];
{ const todo = []; for (const r of IDX) { const f = SC + '/ptr/' + r.y + '/' + r.docId + '.json', x = J(f, null); if (x) { PTR.set(r.docId, x); downloaded++; } else todo.push(r); }
  log('PTRs cached ' + downloaded + ', to read ' + todo.length);
  let ix = 0; const work = async () => { while (ix < todo.length) { const r = todo[ix++]; if (left() < 90 * 60e3) { dlFail++; continue; }
      const buf = await house(HOUSE + '/public_disc/ptr-pdfs/' + r.y + '/' + r.docId + '.pdf', 'buf'); if (!buf) { dlFail++; continue; }
      const pf = SC + '/tmp-' + r.docId + '.pdf'; fs.writeFileSync(pf, buf); let txt = ''; try { txt = execFileSync('pdftotext', ['-layout', pf, '-'], { maxBuffer: 1e8, timeout: 60000 }).toString(); } catch (e) { txt = ''; } try { fs.unlinkSync(pf); } catch (e) {}
      const p = parsePtrText(txt), x = { docId: r.docId, chars: p.chars, anchors: p.anchors, st: p.st, stTicker: p.stTicker, rows: p.rows };
      if (SAMPLE_TXT.length < 4 && p.anchors > 0) SAMPLE_TXT.push({ docId: r.docId, head: txt.split('\n').slice(0, 60).join('\n').slice(0, 4000) });
      W(SC + '/ptr/' + r.y + '/' + r.docId + '.json', x); PTR.set(r.docId, x); downloaded++; fetchedNow++; if (fetchedNow % 500 === 0) log('PTR PDFs read now: ' + fetchedNow); } };
  await Promise.all([work(), work(), work()]); }
const scanned = [...PTR.values()].filter(isScanned).length, stRows = [...PTR.values()].reduce((u, p) => u + p.st, 0), stTick = [...PTR.values()].reduce((u, p) => u + p.stTicker, 0);
STATUS.congress = { indexYears: idxStat, ptrs: IDX.length, downloaded, fetchedNow, failed: dlFail, scanned, stRows: stRows, stWithTicker: stTick };
STATUS.congress.check = congDataOk({ years: YEARS.length, yearsOk: idxStat.ok, ptrs: IDX.length, downloaded, scanned, st: stRows, stTicker: stTick }); STATUS.congress.ok = STATUS.congress.check.ok;
log('congress: ' + JSON.stringify(STATUS.congress));
// purchase events: one per (filing, ticker); member id = name + state
const CONG_EV = []; let noPx = 0;
for (const r of IDX) { const p = PTR.get(r.docId); if (!p || !r.filed) continue; const who = (r.last + ', ' + r.first + ' (' + r.state + ')').trim(), seen = new Set();
  for (const row of purchases(p)) { if (seen.has(row.ticker)) continue; seen.add(row.ticker); const i = SY.get(row.ticker), k = firstAfter(r.filed);
    if (i === undefined || k >= T || !hasPx(i, k)) { noPx++; continue; } CONG_EV.push({ i, k, t: k, d: r.filed, sym: row.ticker, who, trade: row.trade, lo: row.lo, hi: row.hi, docId: r.docId }); } }
STATUS.congress.events = CONG_EV.length; STATUS.congress.noPrice = noPx;
const congLiq = CONG_EV.filter(e => e.k >= 1 && LIQ[e.i * T + e.k - 1]);
const congCount = Object.fromEntries(CONG.holds.map(H => [H, { older: congLiq.filter(e => halfOf(e.d) === 'older' && e.k + H - 1 < T).length, newer: congLiq.filter(e => halfOf(e.d) === 'newer' && e.k + H - 1 < T).length }]));
log('C-CONG1 purchase events ' + CONG_EV.length + ' (liquid ' + congLiq.length + ', no price ' + noPx + '); complete holds ' + JSON.stringify(congCount));
// the parsed PTR purchases as a data file (dated by filing; for tip-score / follow lanes)
WZ(PTRF, { generatedAt: new Date().toISOString(), source: 'House Clerk PTRs (disclosures-clerk.house.gov), parsed by agent-c-core.mjs parsePtrText; filed = signal date; House only; scanned PTRs not read', note: 'research data, not advice',
  rows: CONG_EV.map(e => [e.d, e.sym, e.who, e.trade, e.lo, e.hi, e.docId]) });

// ================= 4. DIAG =================
if (MODE === 'diag') { const lagDays = CONG_EV.filter(e => e.trade).map(e => (Date.parse(e.d) - Date.parse(e.trade)) / 864e5).sort((a, b) => a - b);
  W(DIAGF, { generatedAt: new Date().toISOString(), note: 'DIAG: data coverage, signal counts and parse samples only; no returns computed, no verdict', window: [D[0], D[T - 1]], data: STATUS,
    insq: insqCount, cong: congCount, members: new Set(CONG_EV.map(e => e.who)).size, medianFilingLagDays: lagDays.length ? lagDays[lagDays.length >> 1] : null,
    sampleRows: CONG_EV.filter((e, j) => j % Math.max(1, Math.floor(CONG_EV.length / 25)) === 0).slice(0, 25).map(e => ({ d: e.d, sym: e.sym, who: e.who, trade: e.trade, lo: e.lo, hi: e.hi, docId: e.docId })),
    sampleText: SAMPLE_TXT, scannedSample: [...PTR.values()].filter(isScanned).slice(0, 10).map(p => p.docId),
    noTickerSample: [...PTR.values()].filter(p => p.st > p.stTicker).slice(0, 10).map(p => ({ docId: p.docId, st: p.st, stTicker: p.stTicker, rows: p.rows.filter(r => r.asset === 'ST' && !r.ticker).slice(0, 3) })),
    noTickerText: await (async () => { const out = []; for (const p of [...PTR.values()].filter(p => p.st > p.stTicker).slice(0, 8)) { const r = IDX.find(x => x.docId === p.docId); if (!r) continue;
        const buf = await house(HOUSE + '/public_disc/ptr-pdfs/' + r.y + '/' + r.docId + '.pdf', 'buf'); if (!buf) continue; const pf = SC + '/dbg.pdf'; fs.writeFileSync(pf, buf); let txt = ''; try { txt = execFileSync('pdftotext', ['-layout', pf, '-'], { maxBuffer: 1e8 }).toString(); } catch (e) {}
        const Ls = txt.split('\n'), hit = Ls.map((l, j) => /\[ST\]/.test(l) ? j : -1).filter(j => j >= 0).slice(0, 6); out.push({ docId: p.docId, lines: hit.map(j => Ls.slice(Math.max(0, j - 3), j + 4).join('\n')) }); } return out; })(),
    insqSample: INSQ_SIG.slice(0, 20).map(z => ({ sym: z.sym, d: z.d, people: z.people, usd: z.usd, fcfy: z.fcfy, growth: z.growth, de: z.de })) });
  console.log('AGENT C DIAG | insider ' + (STATUS.insider.ok ? 'ok' : 'MISSING') + ', facts ' + (STATUS.facts.ok ? 'ok' : 'MISSING') + ', congress ' + (STATUS.congress.ok ? 'ok' : 'NOT OK: ' + STATUS.congress.check.why.join('; ')) + ' | INSQ ' + insqCount.older + '/' + insqCount.newer + ' | CONG60 ' + congCount[60].older + '/' + congCount[60].newer);
  process.exit(0); }

// ================= 5. 5-YEAR ONE-SHOT (each rule once; first complete verdict frozen) =================
const RES = {}, need = RULE_IDS.filter(id => !FROZEN[id]);
const base = (extra) => ({ at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, cost: COST, yardstick: 'capBoth (AUD-1: trades and yardstick capped at +300% alike)', ...extra });
if (need.includes('C-INSQ1')) { if (!STATUS.insider.ok || !STATUS.facts.ok || !STATUS.price.ok) RES['C-INSQ1'] = { verdict: 'NOT RUN', why: 'data incomplete: ' + JSON.stringify({ insider: STATUS.insider, facts: STATUS.facts }).slice(0, 300) };
  else if (insqCount.older < INSQ.minCount || insqCount.newer < INSQ.minCount) RES['C-INSQ1'] = base({ verdict: 'TOO FEW CASES', level: 'NONE', why: 'count first (pre-registered): ' + insqCount.older + ' / ' + insqCount.newer + ' signals with a complete hold (20 per half needed); no return computed', counts: insqCount, hold: INSQ.hold });
  else { const tr = tradesOf(INSQ_SIG, (i, k) => { const S = series(i); return stopWalk(S.o, S.l, S.c, k, INSQ.hold, INSQ.stop); }), R = halves(tr, INSQ.hold), v = judge(R, { bar: BAR });
    RES['C-INSQ1'] = base({ ...v, trySmallBar: trySmallBar(R), results: R, counts: insqCount, shape: shapeOf(tr), hold: INSQ.hold, stop: INSQ.stop, v15SameDates: 'not computed (no point-in-time V15 list in this lab; not a gate)', trades: tradeRows(tr) }); }
  log('- C-INSQ1: ' + RES['C-INSQ1'].verdict + (RES['C-INSQ1'].results ? ' | older ' + fmt(RES['C-INSQ1'].results.older) + ' | newer ' + fmt(RES['C-INSQ1'].results.newer) : '') + ' | ' + RES['C-INSQ1'].why); }
for (const H of CONG.holds) { const id = 'C-CONG1-' + H; if (!need.includes(id)) continue;
  if (!STATUS.congress.ok || !STATUS.price.ok) { RES[id] = { verdict: 'NOT RUN', why: 'NEEDS DATA: ' + STATUS.congress.check.why.join('; ') }; log('- ' + id + ': NOT RUN (' + RES[id].why + ')'); continue; }
  const tr = tradesOf(congLiq, (i, k) => { const x = k + H - 1; if (x >= T) return null; const g = ret(i, k, x); return g === null ? null : { x, g, kind: 'time' }; }), R = halves(tr, H), v = judge(R, { bar: BAR });
  RES[id] = base({ ...v, trySmallBar: trySmallBar(R), results: R, counts: congCount[H], shape: shapeOf(tr), hold: H, members: new Set(tr.map(z => z.who)).size, trades: tradeRows(tr) });
  log('- ' + id + ': ' + v.verdict + ' | older ' + fmt(R.older) + ' | newer ' + fmt(R.newer) + ' | ' + v.why); }
if (need.includes('EXP-CONG1')) { const rule = XRULES['EXP-CONG1'];
  if (!STATUS.congress.ok || !STATUS.price.ok) RES['EXP-CONG1'] = { verdict: 'NOT RUN', why: 'NEEDS DATA: ' + STATUS.congress.check.why.join('; ') };
  else { // calls: one per member and stock per 30 days (expert-lab convention), resolved over 126 sessions without a stop
    const last = new Map(), calls = [], cands = [];
    for (const e of [...CONG_EV].sort((a, b) => a.d < b.d ? -1 : 1)) { const key = e.who + '|' + e.sym; if (last.has(key) && Date.parse(e.d) - Date.parse(last.get(key)) < 30 * 864e5) continue; last.set(key, e.d);
      const S = series(e.i), w = e.k + rule.rank.horizon - 1 < T ? walkHold(S.o, S.c, e.k, rule.rank.horizon, 1) : null, c = w ? ctrlSpan(e.k, w.x) : null;
      calls.push({ who: e.who, i: e.i, k: e.k, ...(w && c !== null ? { x: w.x, ex: w.g - c } : {}) }); cands.push({ who: e.who, i: e.i, k: e.k, t: e.k, sym: e.sym, d: e.d }); }
    const R0 = new PITRanker(rule.rank), byK = [...calls].sort((a, b) => a.k - b.k), sig = []; let q = 0, eligMax = 0;
    for (const s of [...cands].sort((a, b) => a.k - b.k)) { while (q < byK.length && byK[q].k <= s.k) { const c = byK[q++]; if (c.x !== undefined) R0.add(c.who, c.x, c.ex); } const top = R0.topAt(s.k); eligMax = Math.max(eligMax, top.eligible); if (top.top.has(s.who)) sig.push(s); }
    const walk = (i, k) => { const S = series(i); return walkHold(S.o, S.c, k, rule.hold, rule.stop); };
    const liqOk = (a) => a.filter(s => s.k >= 1 && LIQ[s.i * T + s.k - 1]);
    const split = (tr, mid) => { for (const z of tr) z.half = z.t < mid ? 'older' : 'newer'; return tr; };
    const tr0 = tradesOf(liqOk(sig), walk), mid = midSplit(tr0.map(z => z.t)), tr = split(tr0, mid), trAll = split(tradesOf(liqOk(cands), walk), mid);
    // the same-stock yardstick per half is recomputed by halfStat from z.own (computed by tradesOf on the 2024 split); the split here is the expert convention
    const Rr = halves(tr, rule.hold), RC = halves(trAll, rule.hold), extra = [];
    for (const k of ['older', 'newer']) if (!(Rr[k].n && RC[k].n && Rr[k].avg > RC[k].avg && Rr[k].edge > RC[k].edge)) extra.push('SKILL gate: not better than every member (no ranking) in the ' + k + ' half (' + pc(Rr[k].avg) + ' vs ' + pc(RC[k].avg) + ' after cost; edge ' + pc(Rr[k].edge) + ' vs ' + pc(RC[k].edge) + ')');
    const v = judge(Rr, { bar: BAR, extra });
    RES['EXP-CONG1'] = base({ ...v, trySmallBar: trySmallBar(Rr), results: Rr, allMembers: { older: RC.older, newer: RC.newer }, split: mid !== null ? D[mid] : null, eligibleMaxMembers: eligMax, hold: rule.hold, stop: rule.stop, shape: shapeOf(tr), trades: tradeRows(tr),
      note: 'rule from expert-core.mjs (pre-registered 23 Oct 2026), unchanged; same-stock yardstick windows use the 2024 split (agent-c-lab tradesOf), halves use the median signal session' });
    log('- EXP-CONG1: ' + v.verdict + ' | older ' + fmt(Rr.older) + ' | newer ' + fmt(Rr.newer) + ' | all members older ' + pc(RC.older.avg) + ' newer ' + pc(RC.newer.avg) + ' | eligible max ' + eligMax + ' | ' + v.why); } }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])), (r) => r && r.verdict && r.verdict !== 'NOT RUN');
const levelOf = (r) => !r ? 'NOT JUDGED YET' : r.verdict === 'PROVEN' ? 'PROVEN' : r.verdict === 'TRADABLE SMALL' ? 'TIER 2 (TRADABLE SMALL)' : r.trySmallBar ? 'TRY SMALL bar only (NOT PROVEN)' : 'NONE';

// ================= 6. OUTPUT + LIBRARY =================
const tradesOut = Object.fromEntries(Object.entries(RES).filter(([k, r]) => r.trades && !FROZEN[k]).map(([k, r]) => [k, r.trades]));
W(OUT, { generatedAt: new Date().toISOString(), agent: 'C', about: 'Agent C (Crowd) one-shot tests: C-INSQ1 insider cluster + B-FCF1 quality; C-CONG1-20/60 House members\' purchases by filing date; EXP-CONG1 top-10% members. Research only; never an order.',
  preRegistered: 'agent-c-core.mjs header (1 Nov 2026, before any result); EXP-CONG1 = expert-core.mjs (23 Oct 2026)', window: [D[0], D[T - 1]], bar: BAR, data: STATUS, counts: { insq: insqCount, cong: congCount },
  levels: Object.fromEntries(RULE_IDS.map(id => [id, { verdict: firstRun[id] ? firstRun[id].verdict : 'NOT JUDGED YET', level: levelOf(firstRun[id]) }])), firstRun,
  latest: latestBlock({ at: new Date().toISOString(), counts: { insq: insqCount, cong: congCount }, data: STATUS }), trades: { ...(PREV.trades || {}), ...tradesOut } });
try { const LB = J(LIB, null); let ch = false;
  for (const id of RULE_IDS) { const r = firstRun[id], e = LB && LB.strategies.find(x => x.id === id); if (!e || !r || e.tested) continue;
    const h = (k) => r.results && r.results[k] && r.results[k].n ? r.results[k].n + ' trades, ' + r.results[k].days + ' days, avg ' + pc(r.results[k].avg) + ' (stress ' + pc(r.results[k].avgStress) + '), edge ' + pc(r.results[k].edge) + ', t ' + r.results[k].tBlock : 'n/a';
    e.tested = r.frozenAt.slice(0, 10); e.agent = e.agent || 'C';
    e.status = r.verdict === 'PROVEN' ? 'tested: passed (PROVEN, agent-c-lab)' : r.verdict === 'TRADABLE SMALL' ? 'tested: tier 2 TRADABLE SMALL (agent-c-lab); forward paper first' : 'tested: ' + r.verdict.toLowerCase() + ' (agent-c-lab, frozen ' + e.tested + ')';
    e.result = { verdict: r.verdict, level: levelOf(r), why: r.why, older: h('older'), newer: h('newer') }; ch = true; }
  { const e = LB && LB.strategies.find(x => x.id === 'C-CONG1'), a = firstRun['C-CONG1-20'], b = firstRun['C-CONG1-60']; if (e && a && b && !e.tested) { e.tested = b.frozenAt.slice(0, 10); e.status = 'tested (agent-c-lab): 20 sessions ' + a.verdict + ', 60 sessions ' + b.verdict; ch = true; } }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('agent-c-lab: library not updated: ' + e.message); }
console.log('AGENT C LAB done: ' + RULE_IDS.map(id => id + ' ' + (firstRun[id] ? firstRun[id].verdict : 'NOT JUDGED YET')).join(', '));
