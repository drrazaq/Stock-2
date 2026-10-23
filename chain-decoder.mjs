// CHAIN DECODER (the owner, 23 Oct 2026: "AI needs cloud services, it is a chain; everything is related to something that happened in
// the past. Follow the source and you will see the relations and the repetition"). Research + the weekly chain list; never places an order.
// PRE-REGISTERED 23 Oct 2026 in data/strategy-library.json BEFORE any run: CHAIN-MOM1, CHAIN-DEMAND1, CHAIN-LAG1, CHAIN-READ1. Every rule
// is in chain-core.mjs and data/chain-defs.json and is not tuned after the first run. RUN ONCE AS WRITTEN: the first complete verdict of
// each rule is frozen (firstRun); later runs are monitoring only.
// 1. GRAPH, point in time, official dated sources only (data/chain-graph.json):
//    - layer membership: a stock is a member of a layer from the first EDGAR filing of its own CIK whose text has a layer keyword
//      (SEC full-text search); none = 'today-only', excluded from every history test;
//    - major-customer links (10-K / 10-Q / 20-F "X accounted for ..."), verified on the filing's own text, active 400 days after the
//      latest filing that showed them;
//    - material agreements (8-K items 1.01 / 7.01 / 8.01 naming the customer), with first_public_at, source_url, evidence excerpt and
//      materiality (stated value / the supplier's annual revenue from SEC XBRL);
//    - SIC industry codes (context).
// 2. TESTS on the 5-year whole-market price cache (study-cache/grouped.json.gz, read only): data/chain-decoder.json.
// 3. LIVE list (data/chain-today.json): today's hot layers and the buys of any rule whose frozen verdict is TRADABLE SMALL or PROVEN;
//    scan.mjs shows them in ACTIONS only then.
// Everything fetched is kept in chain-cache/ (its own Actions cache), so a run that runs out of time resumes; a verdict is frozen only
// from a complete run.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { secNY, secPhase } from './sec-time.mjs';
import { html2text, tradingSessions, firstOnOrAfter, dilutedBefore, lotteryJump, verdictOf, DILUTION_FORMS } from './catalyst-core.mjs';
import { demandSignal, readThrough, customerSentence, linkActive, agreementEvidence, momSelect, lagLearn, lagPredict, stopExit, LINK_DAYS } from './chain-core.mjs';
const env = process.env, OUT = env.OUT || 'data/chain-decoder.json', GRAPH_OUT = env.GRAPH_OUT || 'data/chain-graph.json', TODAY_OUT = env.TODAY_OUT || 'data/chain-today.json', CD = env.CHAIN_CACHE || 'chain-cache';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const EFTS = local(env.EFTS_BASE) || 'https://efts.sec.gov', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', DATA = local(env.DATA_BASE) || 'https://data.sec.gov', PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', BUDGET_MS = (+env.CHAIN_MINUTES || 70) * 60e3, T0 = Date.now(), outOfTime = () => Date.now() - T0 > BUDGET_MS;
const COST = 0.008, STRESS = 0.012, START = 70, MOM_HOLD = 21, DEM_HOLD = 40, READ_HOLD = 20, STOP = 0.2, RISE_MAX = 0.05, LINKS_FROM = 2016;
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%', r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]+$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), pad10 = (c) => String(c).padStart(10, '0'), slug = (p) => String(p).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 80);
fs.mkdirSync(CD, { recursive: true });
const DEFS = J('data/chain-defs.json', null); if (!DEFS) { console.log('chain-decoder: no data/chain-defs.json'); process.exit(0); }

// ---- prices (read only) ----
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('chain-decoder: no price cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 300) { console.log('chain-decoder: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), H = new Float32Array(N).fill(NaN), L = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN), OX = new Float32Array(N).fill(NaN), LX = new Float32Array(N).fill(NaN), CX = new Float32Array(N).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; H[k] = x.h ? x.h[j] : x.c[j]; L[k] = x.l ? x.l[j] : Math.min(x.o[j], x.c[j]); C[k] = x.c[j]; V[k] = x.v[j]; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) { const k = q * T + t; CX[k] = x.x.c[j]; if (x.x.o) OX[k] = x.x.o[j]; if (x.x.l) LX[k] = x.x.l[j]; } } });
const SIC = store.sic || {}; store = null;
const spyI = SY.get('SPY'), CC = (i, t) => { const z = C[i * T + t]; return isFinite(z) ? z : CX[i * T + t]; };
const dv20 = (i, t) => { let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) { if (k < 0) continue; const c1 = C[i * T + k], v = V[i * T + k]; if (isFinite(c1) && isFinite(v)) { dv += c1 * v; n++; } } return n >= 10 ? dv / n : 0; };
const gateOk = (i, t) => C[i * T + t] >= 2 && dv20(i, t) >= 2e6;
const liquidCtrl = (i, t) => C[i * T + t] >= 3 && dv20(i, t) >= 1e6;
const lottery = (i, t) => { const a = []; for (let k = Math.max(0, t - 21); k <= t; k++) a[k] = CC(i, k); return lotteryJump(a, t); };
const sma50 = (i, t) => { let s = 0, n = 0; for (let k = t - 49; k <= t; k++) { if (k < 0) continue; const z = CC(i, k); if (isFinite(z)) { s += z; n++; } } return n >= 40 ? s / n : null; };
const ret = (i, a, b) => { const x = CC(i, a), y = CC(i, b); return x > 0 && y > 0 ? y / x - 1 : null; };
// buy the open of t+1, sell the close of t+h (a stock that left the cache keeps its real later price via CX; else its last close)
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k > t; k--) { const z = CC(i, k); if (isFinite(z)) { last = z; break; } } return last === null ? null : last / e - 1; }
const barsOf = new Map(); const bars = (i) => { if (barsOf.has(i)) return barsOf.get(i); const a = new Array(T); for (let k = 0; k < T; k++) { const q = i * T + k, c = isFinite(C[q]) ? C[q] : CX[q]; a[k] = isFinite(c) ? { o: isFinite(O[q]) ? O[q] : OX[q], l: isFinite(L[q]) ? L[q] : LX[q], c } : null; } if (barsOf.size > 3000) barsOf.clear(); barsOf.set(i, a); return a; };
const fwdStop = (i, t, h) => { const r = stopExit(bars(i), t + 1, h, STOP); return r && Math.abs(r.ret) < 3 ? r : null; };
const ctrlC = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlC) return ctrlC[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && liquidCtrl(i, t)) { const g = fwd(i, t, h); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[key] = v.length >= 30 ? mean(v) : null); };
const midT = Math.floor((START + T) / 2), half = (t) => t < midT ? 0 : 1;
// same stock on its other days (every 2nd session of the same half, not within h of this entry), with the same stop and hold
const ownS = {}; const ownStop = (i, t, h) => { const hf = half(t), key = i + '_' + h + '_' + hf; let arr = ownS[key];
  if (!arr) { arr = []; for (let k = hf ? midT : START; k < (hf ? T - 1 : midT); k += 2) if (liquidCtrl(i, k)) { const r = fwdStop(i, k, h); if (r) arr.push([k, r.ret]); } ownS[key] = arr; }
  const v = arr.filter(([k]) => Math.abs(k - t) > h).map(x => x[1]); return v.length >= 20 ? mean(v) : null; };
const spyF = (t, h) => spyI === undefined ? null : fwd(spyI, t, h);

// ---- network (SEC: at most ~8 requests a second, with the declared User-Agent) ----
let lastReq = 0, nReq = 0, nFail = 0;
async function get(url, kind = 'json', headers = { 'User-Agent': UA }) {
  for (let a = 0; a < 4; a++) { const w = (local(env.EFTS_BASE) ? 0 : 125) - (Date.now() - lastReq); if (w > 0) await sleep(w); lastReq = Date.now(); nReq++;
    try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(45000) }); if (r.status === 404 || r.status === 410) return kind === 'text' ? '' : null; if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; } if (!r.ok) return null;
      return kind === 'json' ? await r.json() : kind === 'bin' ? Buffer.from(await r.arrayBuffer()) : await r.text(); } catch (e) { await sleep(1000 * (a + 1)); } }
  nFail++; return null; }
const DATA_OK = { complete: true, missing: [] }; const miss = (what) => { DATA_OK.complete = false; if (DATA_OK.missing.length < 40) DATA_OK.missing.push(what); };
// one full-text query -> compact hits [id, adsh, cik, fileDate, sic, tickers, items, form] (splits the range near EDGAR's 10,000 cap)
async function efts(q, forms, a, b, ciks, onePage) {
  const hits = []; for (let from = 0; from < (onePage ? 100 : 10000); from += 100) {
    const j = await get(EFTS + '/LATEST/search-index?q=' + encodeURIComponent(q) + '&forms=' + forms + (ciks ? '&ciks=' + ciks : '') + '&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from);
    if (!j || !j.hits) return null; const tot = (j.hits.total && j.hits.total.value) || 0;
    if (!onePage && from === 0 && tot >= 9900 && a < b) { const mid = new Date((Date.parse(a) + Date.parse(b)) / 2).toISOString().slice(0, 10), x = await efts(q, forms, a, mid, ciks), y = await efts(q, forms, new Date(Date.parse(mid) + 864e5).toISOString().slice(0, 10), b, ciks); return x && y ? x.concat(y) : null; }
    for (const h of j.hits.hits || []) { const s = h._source || {}, tk = []; for (const dn of s.display_names || []) { const m = dn.match(/\(([A-Z0-9.,\s-]+)\)\s+\(CIK/); if (m) tk.push(...m[1].split(',').map(x => x.trim()).filter(Boolean)); }
      hits.push([h._id, s.adsh, +((s.ciks || [])[0] || 0), s.file_date, (s.sics || [])[0] || '', tk, s.items || [], s.form || (s.root_forms || [])[0] || '']); }
    if ((j.hits.hits || []).length < 100 || from + 100 >= tot) break; }
  return hits; }
const thisYear = new Date().getUTCFullYear(), thisMonth = new Date().toISOString().slice(0, 7);
// cached query: a closed period (not the current year/month) is fetched once
async function cachedEfts(file, q, forms, a, b, ciks, open) { const had = J(file, null); if (had && !open) return had;
  if (outOfTime()) { miss(file); return had; } const h = await efts(q, forms, a, b, ciks); if (!h) { miss(file); return had; } W(file, h); return h; }
const docUrl = (cik, adsh, file) => SEC + '/Archives/edgar/data/' + cik + '/' + String(adsh).replace(/-/g, '') + '/' + file;
const PUBLIC = (cik, adsh, file) => 'https://www.sec.gov/Archives/edgar/data/' + cik + '/' + String(adsh).replace(/-/g, '') + '/' + (file || '');
async function docText(cik, adsh, file) { const html = await get(docUrl(cik, adsh, file), 'text'); return html === null ? null : html2text(html.slice(0, 4000000)); }

// ---- CIK <-> tickers ----
async function secTickers() { const f = CD + '/company_tickers.json', had = J(f, null); if (had && Date.now() - Date.parse(had.at) < 7 * 864e5) return had.m;
  const j = await get(SEC + '/files/company_tickers.json'); if (!j) { if (!had) miss('company_tickers'); return had ? had.m : {}; }
  const m = {}; for (const x of Object.values(j)) if (x && x.ticker) m[String(x.ticker).toUpperCase().replace(/-/g, '.')] = +x.cik_str; W(f, { at: new Date().toISOString(), m }); return m; }
async function massiveRef() { const f = CD + '/ref.json', had = J(f, null); if (had && Date.now() - Date.parse(had.at) < 30 * 864e5) return had.m; if (!env.MASSIVE_KEY) return had ? had.m : {};
  const m = {}; for (const [type, active] of [['CS', true], ['ADRC', true], ['CS', false], ['ADRC', false]]) { let path = '/v3/reference/tickers?market=stocks&type=' + type + '&active=' + active + '&limit=1000', pages = 0;
    while (path && pages < 80) { const j = await get(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), 'json', {}); pages++; if (!j || !Array.isArray(j.results)) break;
      for (const x of j.results) if (x.cik && /^[A-Z.]{1,6}$/.test(x.ticker || '')) { const c = +x.cik; (m[c] = m[c] || []).includes(x.ticker) || m[c].push(x.ticker); }
      path = j.next_url ? j.next_url.replace(/^https?:\/\/[^/]+/, '') : null; } }
  if (Object.keys(m).length > 1000) W(f, { at: new Date().toISOString(), m }); return Object.keys(m).length > 1000 ? m : had ? had.m : {}; }

// ---- EDGAR quarterly full index: dilution filings by CIK (own cache) ----
async function dilutionIndex() { const by = new Map(); let ok = 0, all = 0; const y0 = +D[0].slice(0, 4), now = new Date();
  for (let y = y0; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) { if (y === now.getUTCFullYear() && (q - 1) * 3 > now.getUTCMonth()) continue; all++;
    const f = CD + '/idx/' + y + 'Q' + q + '.json', cur = y === now.getUTCFullYear() && Math.floor(now.getUTCMonth() / 3) + 1 === q; let rows = J(f, null);
    if (!rows || cur) { const buf = outOfTime() && rows ? null : await get(SEC + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.gz', 'bin');
      if (buf) { let txt; try { txt = zlib.gunzipSync(buf).toString('latin1'); } catch (e) { txt = buf.toString('latin1'); } rows = [];
        for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length < 5) continue; const form = p[2].trim(); if (DILUTION_FORMS.has(form)) rows.push([+p[0], form, p[3].trim()]); } W(f, rows); } }
    if (rows) { ok++; for (const [cik, form, d] of rows) { if (!by.has(cik)) by.set(cik, []); by.get(cik).push({ form, d }); } } else miss('index ' + y + 'Q' + q); }
  return { by, ok, all }; }

// ---- statistics (date-clustered: one average per entry day) ----
const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = {}; for (const z of a) { const x = f(z); if (x === null || x === undefined || !isFinite(x)) continue; (o[z.t] = o[z.t] || []).push(x); } return Object.values(o).map(mean); };
function stat(a) { if (!a.length) return { n: 0 };
  const net = a.map(z => z.g - COST), sorted = [...net].sort((x, y) => y - x), v = byDay(a, z => z.g - COST - z.c), ov = byDay(a, z => typeof z.ob === 'number' ? z.g - z.ob : null), sv = byDay(a, z => typeof z.sp === 'number' ? z.g - COST - z.sp : null);
  return { n: a.length, days: new Set(a.map(z => z.t)).size, stocks: new Set(a.map(z => z.s)).size, win: r4(net.filter(x => x > 0).length / net.length), avg: r4(mean(net)), median: r4(median(net)), worst: r4(Math.min(...net)), best: r4(Math.max(...net)),
    avgStress: r4(mean(a.map(z => z.g - STRESS))), ctrl: r4(mean(a.map(z => z.c))), edge: r4(mean(v)), t: tOf(v), vsOwn: ov.length ? r4(mean(ov)) : null, tOwn: tOf(ov), ownCases: a.filter(z => typeof z.ob === 'number').length, vsSpy: sv.length ? r4(mean(sv)) : null, noTop2: r4(mean(sorted.slice(2))) }; }
const judge = (trades, bar, split = midT) => { const R = { all: stat(trades), older: stat(trades.filter(z => z.t < split)), newer: stat(trades.filter(z => z.t >= split)) }; return { ...verdictOf(R, bar), results: R }; };

(async () => {
  const PREV = J(OUT, {}) || {}, LG = J('data/agent-league.json', {}), BAR = +Math.max(2.5, typeof LG.bar === 'number' ? LG.bar : 0, 4.0).toFixed(2);
  const WSTART = D[0], last = D[T - 1];
  // 1. tickers and CIKs
  const TK = await secTickers(), REF = await massiveRef(), cikTick = new Map(), addT = (cik, t) => { if (!cik || !t) return; if (!cikTick.has(cik)) cikTick.set(cik, []); if (!cikTick.get(cik).includes(t)) cikTick.get(cik).push(t); };
  for (const [t, c] of Object.entries(TK)) addT(c, t); for (const [c, ts] of Object.entries(REF)) for (const t of ts) addT(+c, t);
  for (const [s, al] of Object.entries(DEFS.tickerAliases || {})) for (const a of al) if (TK[s]) addT(TK[s], a);
  const cikOf = (sym) => { if (TK[sym]) return TK[sym]; const cur = Object.entries(DEFS.tickerAliases || {}).find(([, al]) => al.includes(sym)); return cur && TK[cur[0]] ? TK[cur[0]] : null; };
  const symAt = (cik, t) => { for (const s of cikTick.get(cik) || []) { const i = SY.get(s); if (i !== undefined && i !== spyI && isFinite(C[i * T + t])) return i; } return undefined; };

  // 2. LAYER MEMBERSHIP, point in time: first own filing with a layer keyword
  const MEMF = CD + '/members.json', MEM = J(MEMF, {}), FORMS_M = '10-K,10-Q,20-F,40-F,8-K,6-K,S-1,F-1,424B4';
  async function firstFiling(cik, keywords) { const key = cik + '|' + keywords.join('/'); if (key in MEM) return MEM[key]; if (outOfTime()) { miss('member ' + key); return undefined; }
    const q = keywords.map(k => '"' + k + '"').join(' OR '), ck = pad10(cik), first = (h) => h.sort((a, b) => a[3] < b[3] ? -1 : 1)[0];
    let h = await efts(q, FORMS_M, '2001-01-01', WSTART, ck, true); if (h === null) { miss('member ' + key); return undefined; }
    let found = h.length ? first(h) : null;
    for (let y = +WSTART.slice(0, 4); !found && y <= thisYear; y++) { const a = y === +WSTART.slice(0, 4) ? WSTART : y + '-01-01', yh = await efts(q, FORMS_M, a, y + '-12-31', ck, true); if (yh === null) { miss('member ' + key); return undefined; } if (yh.length) found = first(yh); }
    MEM[key] = found ? { d: found[3], adsh: found[1], file: String(found[0]).split(':')[1] || '', form: found[7] } : null;
    if (Object.keys(MEM).length % 50 === 0) W(MEMF, MEM); return MEM[key]; }
  const LAYERS = [], memberCounts = { pointInTime: 0, todayOnly: 0, noCik: 0, noFiling: 0, pending: 0 }, graphChains = {};
  for (const [chain, cdef] of Object.entries(DEFS.chains)) { graphChains[chain] = { source: cdef.source, layers: [] };
    for (const [li, Ldef] of cdef.layers.entries()) { const key = chain + '|' + Ldef.layer, members = [], gm = [];
      for (const sym of Ldef.syms) { const cik = cikOf(sym); if (!cik) { memberCounts.todayOnly++; memberCounts.noCik++; gm.push({ sym, status: 'today-only', why: 'no SEC CIK for this ticker' }); continue; }
        const f = await firstFiling(cik, Ldef.keywords); if (f === undefined) { memberCounts.pending++; gm.push({ sym, cik, status: 'today-only', why: 'not checked yet (run out of time)' }); continue; }
        if (!f) { memberCounts.todayOnly++; memberCounts.noFiling++; gm.push({ sym, cik, status: 'today-only', why: 'no EDGAR filing of its own with a layer keyword' }); continue; }
        memberCounts.pointInTime++; const since = firstOnOrAfter(D, f.d); members.push({ sym, cik, since });
        gm.push({ sym, cik, status: 'point-in-time', since: f.d, evidence: { form: f.form, filed: f.d, url: PUBLIC(cik, f.adsh, f.file) }, sic: SIC[sym] ? SIC[sym].c : null }); }
      LAYERS.push({ key, chain, layer: Ldef.layer, li, members }); graphChains[chain].layers.push({ layer: Ldef.layer, source: Ldef.source, keywords: Ldef.keywords, members: gm }); } }
  W(MEMF, MEM);
  console.log('chain-decoder: ' + LAYERS.length + ' layers; members point-in-time ' + memberCounts.pointInTime + ', today-only ' + memberCounts.todayOnly + ' (no CIK ' + memberCounts.noCik + ', no filing ' + memberCounts.noFiling + '), not checked ' + memberCounts.pending);
  const pitAt = (L, t) => L.members.filter(m => m.since <= t);
  const layersOfCik = (cik, t) => LAYERS.filter(L => L.members.some(m => m.cik === cik && m.since <= t));

  // 3. MAJOR-CUSTOMER LINKS and MATERIAL AGREEMENTS (official, dated)
  const NODES = DEFS.demandNodes.map(n => ({ ...n, cik: cikOf(n.sym) }));
  const CUSTQ = (a) => ['"' + a + ' accounted for"', '"sales to ' + a + '"', '"revenue from ' + a + '"', '"revenues from ' + a + '"', '"net revenue from ' + a + '"', '"' + a + ' represented"', '"' + a + ' comprised"', '"' + a + ' was our largest customer"', '"' + a + ' is our largest customer"', '"' + a + ', our largest customer"'].join(' OR ');
  const AGRQ = (a) => ['"agreement with ' + a + '"', '"contract with ' + a + '"', '"order from ' + a + '"', '"purchase order from ' + a + '"', '"partnership with ' + a + '"', '"collaboration with ' + a + '"', '"' + a + ' agreed"'].join(' OR ');
  const VERF = CD + '/verified.json', VER = J(VERF, {}), links = [], agreements = [];
  let docsRead = 0, docsLeft = 0;
  for (const n of NODES) { if (!n.cik) continue;
    const cust = new Map(), agr = [];
    for (const a of n.aliases) for (let y = LINKS_FROM; y <= thisYear; y++) {
      const h1 = await cachedEfts(CD + '/cust/' + slug(a) + '/' + y + '.json', CUSTQ(a), '10-K,10-Q,20-F', y + '-01-01', y + '-12-31', null, y === thisYear);
      for (const h of h1 || []) { if (!h[2] || h[2] === n.cik) continue; if (!cust.has(h[2])) cust.set(h[2], []); cust.get(h[2]).push(h); }
      const h2 = await cachedEfts(CD + '/agr/' + slug(a) + '/' + y + '.json', AGRQ(a), '8-K', y + '-01-01', y + '-12-31', null, y === thisYear);
      for (const h of h2 || []) { if (!h[2] || h[2] === n.cik || !(h[6] || []).some(it => ['1.01', '7.01', '8.01'].includes(String(it)))) continue; agr.push(h); } }
    // customer links: verify on the earliest filing (up to 3 tried); every later hit dates the link's renewal
    for (const [cik, hs] of cust) { const byA = new Map(); for (const h of hs) byA.set(h[1], h); const sorted = [...byA.values()].sort((a, b) => a[3] < b[3] ? -1 : 1); let ok = null;
      for (const h of sorted.slice(0, 3)) { const id = h[0]; if (!(id in VER)) { if (outOfTime()) { docsLeft++; miss('doc ' + id); break; } const tx = await docText(h[2], h[1], String(id).split(':')[1]); if (tx === null) { docsLeft++; miss('doc ' + id); break; } docsRead++; VER[id] = customerSentence(tx, n.aliases); if (docsRead % 100 === 0) W(VERF, VER); }
        if (VER[id]) { ok = { h, text: VER[id] }; break; } }
      if (!ok) continue; const dates = sorted.filter(h => h[3] >= ok.h[3]).map(h => h[3]);
      links.push({ type: 'customer', supplierCik: cik, supplier: (cikTick.get(cik) || sorted[0][5] || [])[0] || null, customer: n.sym, customerCik: n.cik, first_public_at: ok.h[3], filings: [...new Set(dates)], source_url: PUBLIC(cik, ok.h[1], String(ok.h[0]).split(':')[1]), evidence: ok.text }); }
    // agreements: every verified 8-K is its own dated edge
    const seenA = new Set(); for (const h of agr.sort((a, b) => a[3] < b[3] ? -1 : 1)) { if (seenA.has(h[1])) continue; seenA.add(h[1]); const id = h[0];
      if (!(id in VER)) { if (outOfTime()) { docsLeft++; miss('doc ' + id); continue; } const tx = await docText(h[2], h[1], String(id).split(':')[1]); if (tx === null) { docsLeft++; miss('doc ' + id); continue; } docsRead++; VER[id] = agreementEvidence(tx, n.aliases); if (docsRead % 100 === 0) W(VERF, VER); }
      const ev = VER[id]; if (!ev) continue; agreements.push({ type: 'agreement', supplierCik: h[2], supplier: (cikTick.get(h[2]) || h[5] || [])[0] || null, customer: n.sym, customerCik: n.cik, first_public_at: h[3], items: h[6], source_url: PUBLIC(h[2], h[1], String(id).split(':')[1]), evidence: ev.text, value: ev.value }); } }
  W(VERF, VER);
  // materiality: stated value / the supplier's latest annual revenue filed before the agreement (SEC XBRL company concept)
  const REVF = CD + '/revenue.json', REVC = J(REVF, {});
  async function annualRevenue(cik) { if (cik in REVC) return REVC[cik]; if (outOfTime()) return undefined; const rows = [];
    for (const tag of ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet']) { const j = await get(DATA + '/api/xbrl/companyconcept/CIK' + pad10(cik) + '/us-gaap/' + tag + '.json'); for (const u of ((j && j.units && j.units.USD) || [])) if (u.fp === 'FY' && /^10-K|^20-F/.test(u.form || '') && u.filed && u.val > 0) rows.push([u.filed, u.end, u.val]); }
    REVC[cik] = rows; return rows; }
  for (const e of agreements) { if (!e.value) { e.materiality = null; continue; } const rows = await annualRevenue(e.supplierCik); if (!rows) { e.materiality = null; continue; }
    const before = rows.filter(r => r[0] <= e.first_public_at).sort((a, b) => a[1] < b[1] ? 1 : -1)[0]; e.supplierRevenue = before ? before[2] : null; e.materiality = before ? r4(e.value / before[2]) : null; }
  W(REVF, REVC);
  console.log('chain-decoder: ' + links.length + ' major-customer links, ' + agreements.length + ' material agreements (' + docsRead + ' documents read now, ' + docsLeft + ' not read yet)');

  // 4. demand-node earnings 8-Ks (item 2.02) from EDGAR submissions; exhibit 99 text -> demand signal
  const D8F = CD + '/demand8k.json', D8 = J(D8F, {}), demandEvents = [];
  for (const n of NODES) { if (!n.cik) continue; const sf = CD + '/subs/' + n.cik + '.json'; let subs = J(sf, null);
    if (!subs || Date.now() - Date.parse(subs.at) > 6 * 864e5) { if (outOfTime()) { if (!subs) { miss('submissions ' + n.sym); continue; } } else { const j = await get(DATA + '/submissions/CIK' + pad10(n.cik) + '.json');
      if (!j || !j.filings) { if (!subs) { miss('submissions ' + n.sym); continue; } } else { const rows = []; const add = (r) => { if (!r || !r.form) return; for (let k = 0; k < r.form.length; k++) if (r.form[k] === '8-K' && String(r.items[k] || '').includes('2.02')) rows.push([r.accessionNumber[k], r.filingDate[k], r.acceptanceDateTime[k], r.primaryDocument[k]]); };
        add(j.filings.recent); for (const f of j.filings.files || []) if (f.filingTo >= WSTART) { const o = await get(DATA + '/submissions/' + f.name); if (o) add(o); else miss('submissions ' + f.name); }
        subs = { at: new Date().toISOString(), rows }; W(sf, subs); } } }
    for (const [acc, fd, accept, prim] of subs.rows) { if (fd < WSTART) continue;
      if (!(acc in D8)) { if (outOfTime()) { miss('8-K ' + acc); continue; }
        // the filing index page labels each document's type (EX-99.1 ...); exhibit 99 documents are the earnings release
        const idx = await get(SEC + '/Archives/edgar/data/' + n.cik + '/' + acc.replace(/-/g, '') + '/' + acc + '-index.htm', 'text'), names = [];
        for (const row of String(idx || '').split(/<tr/i)) if (/>\s*EX-99[^<]*</i.test(row)) { const m = row.match(/href="([^"]+\.(?:htm|html|txt))"/i); if (m) names.push(m[1].split('/').pop()); }
        let tx = ''; for (const nm of (names.length ? names : [prim]).slice(0, 3)) { const t1 = await docText(n.cik, acc, nm); if (t1) tx += ' ' + t1; }
        if (idx === null && !tx) { miss('8-K ' + acc); continue; } const s = demandSignal(tx); D8[acc] = { hit: s.hit, kind: s.kind, text: s.text, file: names[0] || prim };
        if (Object.keys(D8).length % 50 === 0) W(D8F, D8); }
      const x = D8[acc]; demandEvents.push({ node: n.sym, cik: n.cik, acc, filed: fd, accept, ...x, url: PUBLIC(n.cik, acc, x.file) }); } }
  W(D8F, D8);
  console.log('chain-decoder: ' + demandEvents.length + ' demand-node earnings 8-Ks, ' + demandEvents.filter(e => e.hit).length + ' with raised guidance or capital spending');

  // 5. CHAIN-READ1 candidates: 8-Ks with raised-guidance phrases (item 2.02) from point-in-time chain members
  const READ_PHRASES = ['raised guidance', 'raises guidance', 'raising guidance', 'raised its guidance', 'raises its guidance', 'increased guidance', 'increases guidance', 'raised outlook', 'raises outlook', 'raising outlook', 'raised its outlook', 'raises its outlook', 'raised full-year', 'raises full-year', 'raising full-year', 'raised its full-year', 'raises its full-year', 'raised fiscal', 'raises fiscal'];
  const memberCiks = new Set(LAYERS.flatMap(L => L.members.map(m => m.cik))), RDF = CD + '/read.json', RD = J(RDF, {}), readEvents = [];
  const months = []; for (let y = +WSTART.slice(0, 4), m = +WSTART.slice(5, 7); y < thisYear || (y === thisYear && m <= new Date().getUTCMonth() + 1); m === 12 ? (y++, m = 1) : m++) months.push(y + '-' + String(m).padStart(2, '0'));
  for (const ym of months) { const end = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).toISOString().slice(0, 10);
    const hits = await cachedEfts(CD + '/readq/' + ym + '.json', READ_PHRASES.map(p => '"' + p + '"').join(' OR '), '8-K', ym + '-01', end, null, ym === thisMonth);
    for (const h of hits || []) { if (!memberCiks.has(h[2]) || !(h[6] || []).some(it => String(it) === '2.02')) continue; const id = h[0];
      if (!(id in RD)) { if (outOfTime()) { miss('read doc ' + id); continue; } const tx = await docText(h[2], h[1], String(id).split(':')[1]); if (tx === null) { miss('read doc ' + id); continue; } const r = readThrough(tx); RD[id] = { hit: r.hit, growth: r.growth, text: r.text }; if (Object.keys(RD).length % 100 === 0) W(RDF, RD); }
      readEvents.push({ cik: h[2], filed: h[3], id, url: PUBLIC(h[2], h[1], String(id).split(':')[1]), ...RD[id] }); } }
  W(RDF, RD);
  console.log('chain-decoder: ' + readEvents.length + ' chain-member 8-Ks with raised-guidance words, ' + readEvents.filter(e => e.hit).length + ' also with revenue up 10%+ on the prior year');

  const DIL = await dilutionIndex();
  const complete = DATA_OK.complete && memberCounts.pending === 0 && DIL.ok === DIL.all && Object.keys(TK).length > 1000;
  const gatesAt = (cik, i, t) => { if (!gateOk(i, t)) return 'gate'; if (lottery(i, t)) return 'lottery'; if (dilutedBefore(DIL.by.get(cik), D, t + 1)) return 'dilution'; return null; };

  // 6a. CHAIN-MOM1
  const mom = [], momFunnel = { rebalances: 0, picks: 0, gate: 0, lottery: 0, dilution: 0, below50: 0 }, momHistory = [], ownMom = new Map();
  const layerInputs = (t, withGates) => LAYERS.map(L => ({ key: L.key, members: pitAt(L, t).map(m => { const i = symAt(m.cik, t); if (i === undefined || i === spyI) return null; const r63 = ret(i, t - 63, t), s50 = sma50(i, t);
    const g = withGates ? gatesAt(m.cik, i, t) : null; return { s: SYMS[i], cik: m.cik, i, r63, above50: s50 !== null && CC(i, t) > s50, ok: !g, why: g }; }).filter(Boolean) }));
  for (let t = START; t + MOM_HOLD < T; t += MOM_HOLD) { const spy = spyI === undefined ? 0 : ret(spyI, t - 63, t); if (spy === null) continue; momFunnel.rebalances++;
    const LI = layerInputs(t, true), sel = momSelect(LI, spy), topKeys = new Set(sel.top.map(x => x.key)); momHistory.push({ d: D[t], top: sel.top.map(x => ({ layer: x.key, excess: r4(x.excess), n: x.n })) });
    for (const L of LI) for (const m of L.members) { if (topKeys.has(L.key)) { if (!m.ok) momFunnel[m.why]++; else if (!m.above50) momFunnel.below50++; } }
    // same stock, months none of its layers was top 3 (it was a point-in-time member somewhere)
    const inTop = new Set(LI.filter(L => topKeys.has(L.key)).flatMap(L => L.members.map(m => m.cik))), seen = new Set();
    for (const L of LI) for (const m of L.members) { if (inTop.has(m.cik) || seen.has(m.cik)) continue; seen.add(m.cik); if (!liquidCtrl(m.i, t)) continue; const g = fwd(m.i, t, MOM_HOLD); if (g === null || Math.abs(g) > 3) continue; const k = m.cik + '_' + half(t); if (!ownMom.has(k)) ownMom.set(k, []); ownMom.get(k).push(g); }
    const c0 = ctrl(t, MOM_HOLD); if (c0 === null) continue;
    for (const b of sel.buys) { const m = LI.flatMap(L => L.members).find(x => x.s === b.s); const g = fwd(m.i, t, MOM_HOLD); if (g === null || Math.abs(g) > 3) continue; momFunnel.picks++;
      mom.push({ t, s: b.s, cik: m.cik, g, c: c0, sp: spyF(t, MOM_HOLD), layers: b.layers }); } }
  for (const z of mom) { const v = ownMom.get(z.cik + '_' + half(z.t)); z.ob = v && v.length >= 3 ? mean(v) : null; }

  // 6b. CHAIN-DEMAND1
  const upstreamOf = (cik, t) => { const out = new Map(); for (const L of layersOfCik(cik, t)) { const up = LAYERS.find(x => x.chain === L.chain && x.li === L.li - 1); if (up) for (const m of pitAt(up, t)) if (m.cik !== cik) out.set(m.cik, 'upstream layer: ' + up.key); } return out; };
  const officialOf = (cik, t) => { const out = new Map(), day = D[t]; for (const l of links) if (l.customerCik === cik && linkActive(l.filings, day)) out.set(l.supplierCik, 'customer disclosure');
    for (const e of agreements) if (e.customerCik === cik && linkActive([e.first_public_at], day) && !out.has(e.supplierCik)) out.set(e.supplierCik, 'material agreement'); return out; };
  const signalSession = (accept, filed) => { const p = secPhase(accept), x = secNY(accept), d = x ? x.d : filed, s = firstOnOrAfter(D, d); if (p === 'after' && D[s] === d) return { s: s + 1, base: s }; return { s, base: s - 1 }; };
  const dem = [], demFunnel = { signals: 0, suppliers: 0, rose5: 0, gate: 0, lottery: 0, dilution: 0, overlap: 0, noPrice: 0 }, openD = new Map();
  for (const e of demandEvents.filter(e => e.hit).sort((a, b) => a.filed < b.filed ? -1 : 1)) { const { s, base } = signalSession(e.accept, e.filed); if (s < START || s >= T - 1 || base < 0) continue; demFunnel.signals++;
    const sup = officialOf(e.cik, s); for (const [k, v] of upstreamOf(e.cik, s)) if (!sup.has(k)) sup.set(k, v);
    for (const [cik, via] of sup) { demFunnel.suppliers++; const i = symAt(cik, s); if (i === undefined) { demFunnel.noPrice++; continue; } const rise = ret(i, base, s); if (rise === null || rise >= RISE_MAX) { demFunnel.rose5++; continue; }
      const g0 = gatesAt(cik, i, s); if (g0) { demFunnel[g0]++; continue; } if ((openD.get(i) || -1) >= s + 1) { demFunnel.overlap++; continue; }
      const r = fwdStop(i, s, DEM_HOLD), c0 = ctrl(s, DEM_HOLD); if (!r || c0 === null) continue; openD.set(i, r.at);
      dem.push({ t: s, s: SYMS[i], g: r.ret, why: r.why, c: c0, ob: ownStop(i, s, DEM_HOLD), sp: spyF(s, DEM_HOLD), node: e.node, via, filed: e.filed, url: e.url, kind: e.kind }); } }

  // 6c. CHAIN-LAG1: monthly layer excess returns; learn on the first half, trade the second half only
  const blocks = []; for (let t = START; t < T; t += 21) blocks.push(t);
  const series = {}; for (const L of LAYERS) series[L.key] = blocks.map(t => { if (t - 21 < 0) return null; const sp = spyI === undefined ? 0 : ret(spyI, t - 21, t); const v = pitAt(L, t).map(m => { const i = symAt(m.cik, t); return i === undefined ? null : ret(i, t - 21, t); }).filter(x => x !== null && Math.abs(x) < 3); return v.length >= 3 && sp !== null ? mean(v) - sp : null; });
  const firstIdx = blocks.map((t, m) => m).filter(m => m + 1 < blocks.length && blocks[m + 1] < midT), learnS = {}; for (const [k, s] of Object.entries(series)) learnS[k] = s.slice(0, firstIdx.length + 1);
  const pairs = lagLearn(learnS), lag = [], lagOwn = new Map(), mid2 = Math.floor((midT + T) / 2); let lagHits = 0, lagCalls = 0;
  for (let m = 0; m < blocks.length; m++) { const t = blocks[m]; if (t < midT || t + 21 >= T) continue; const buyKeys = new Set();
    for (const p of pairs) { const a = series[p.from][m]; if (lagPredict(p, a)) { buyKeys.add(p.to); lagCalls++; const nb = series[p.to][m + 1]; if (typeof nb === 'number' && nb > 0) lagHits++; } }
    const c0 = ctrl(t, 21), bought = new Set();
    for (const L of LAYERS) for (const mm of pitAt(L, t)) { const i = symAt(mm.cik, t); if (i === undefined) continue; const pick = buyKeys.has(L.key) && !bought.has(mm.cik);
      if (pick && !gatesAt(mm.cik, i, t) && c0 !== null) { const g = fwd(i, t, 21); if (g !== null && Math.abs(g) < 3) { bought.add(mm.cik); lag.push({ t, s: SYMS[i], cik: mm.cik, g, c: c0, sp: spyF(t, 21), layer: L.key }); } } }
    const seen = new Set(); for (const L of LAYERS) for (const mm of pitAt(L, t)) { if (bought.has(mm.cik) || seen.has(mm.cik)) continue; seen.add(mm.cik); const i = symAt(mm.cik, t); if (i === undefined || !liquidCtrl(i, t)) continue; const g = fwd(i, t, 21); if (g === null || Math.abs(g) > 3) continue; const k = mm.cik + '_' + (t < mid2 ? 0 : 1); if (!lagOwn.has(k)) lagOwn.set(k, []); lagOwn.get(k).push(g); } }
  for (const z of lag) { const v = lagOwn.get(z.cik + '_' + (z.t < mid2 ? 0 : 1)); z.ob = v && v.length >= 3 ? mean(v) : null; }
  // information: which layer led each calendar year (12-month excess return of its point-in-time members)
  const leadersByYear = {}; for (let y = +D[START].slice(0, 4); y <= +last.slice(0, 4); y++) { const a = firstOnOrAfter(D, y + '-01-01'), b = Math.min(T - 1, firstOnOrAfter(D, (y + 1) + '-01-01') - 1); if (b - a < 60) continue;
    const sp = spyI === undefined ? 0 : ret(spyI, a, b); const rows = LAYERS.map(L => { const v = pitAt(L, a).map(m => { const i = symAt(m.cik, a); return i === undefined ? null : ret(i, a, b); }).filter(x => x !== null && Math.abs(x) < 10); return v.length >= 3 ? { layer: L.key, excess: r4(mean(v) - sp), n: v.length } : null; }).filter(Boolean).sort((p, q) => q.excess - p.excess);
    leadersByYear[y] = { from: D[a], to: D[b], top5: rows.slice(0, 5) }; }

  // 6d. CHAIN-READ1
  const rd = [], rdFunnel = { signals: 0, peers: 0, rose5: 0, gate: 0, lottery: 0, dilution: 0, overlap: 0, noPrice: 0 }, openR = new Map();
  const seenR = new Set(); for (const e of readEvents.filter(e => e.hit).sort((a, b) => a.filed < b.filed ? -1 : 1)) { const s = firstOnOrAfter(D, e.filed), base = s - 1; if (s < START || s >= T - 1 || seenR.has(e.cik + '|' + s)) continue; seenR.add(e.cik + '|' + s);
    const Ls = layersOfCik(e.cik, s); if (!Ls.length) continue; rdFunnel.signals++; const peers = new Map(); for (const L of Ls) for (const m of pitAt(L, s)) if (m.cik !== e.cik && !peers.has(m.cik)) peers.set(m.cik, L.key);
    for (const [cik, layer] of peers) { rdFunnel.peers++; const i = symAt(cik, s); if (i === undefined) { rdFunnel.noPrice++; continue; } const rise = ret(i, base, s); if (rise === null || rise >= RISE_MAX) { rdFunnel.rose5++; continue; }
      const g0 = gatesAt(cik, i, s); if (g0) { rdFunnel[g0]++; continue; } if ((openR.get(i) || -1) >= s + 1) { rdFunnel.overlap++; continue; }
      const r = fwdStop(i, s, READ_HOLD), c0 = ctrl(s, READ_HOLD); if (!r || c0 === null) continue; openR.set(i, r.at);
      rd.push({ t: s, s: SYMS[i], g: r.ret, why: r.why, c: c0, ob: ownStop(i, s, READ_HOLD), sp: spyF(s, READ_HOLD), by: (cikTick.get(e.cik) || [])[0] || String(e.cik), layer, growth: e.growth, filed: e.filed, url: e.url }); } }

  // 7. verdicts (frozen at the first complete run)
  const RES = {
    'CHAIN-MOM1': { name: 'Hot layer of an active chain: members of the top 3 layers (3-month return vs S&P 500) above their 50-day, held 1 month', ...judge(mom, BAR), funnel: momFunnel },
    'CHAIN-DEMAND1': { name: 'Demand signal at the source: suppliers of a demand node that raised guidance or capital spending, under +5% since; 40 sessions, stop 20%', ...judge(dem, BAR), funnel: demFunnel },
    'CHAIN-LAG1': pairs.length ? { name: 'Repetition: layer A leads layer B by a month (learned on the first half, traded on the second only)', ...judge(lag, BAR, mid2), pairs, hitRate: lagCalls ? r4(lagHits / lagCalls) : null, calls: lagCalls }
      : { name: 'Repetition: layer A leads layer B by a month (learned on the first half, traded on the second only)', verdict: 'NO REPEATING ORDER FOUND', why: 'no same-chain layer pair reached |t| 3.0 on the first half', results: { all: { n: 0 }, older: { n: 0 }, newer: { n: 0 } }, pairs: [] },
    'CHAIN-READ1': { name: 'Earnings read-through: same-layer peers of a chain company with revenue up 10%+ and raised guidance, under +5% since; 20 sessions, stop 20%', ...judge(rd, BAR), funnel: rdFunnel } };
  { const by = {}; for (const v of ['customer disclosure', 'material agreement']) by[v] = stat(dem.filter(z => z.via === v)); by['upstream layer'] = stat(dem.filter(z => /^upstream/.test(z.via))); RES['CHAIN-DEMAND1'].information = { byEdge: by, byKind: { guidance: stat(dem.filter(z => z.kind === 'guidance')), capex: stat(dem.filter(z => z.kind === 'capex')) } }; }
  const judged = (r) => r.verdict !== 'TOO FEW CASES';
  const FR = complete ? freezeEach(PREV.firstRun && PREV.firstRun.results, RES, judged) : { ...((PREV.firstRun && PREV.firstRun.results) || {}) };
  const firstRun = Object.keys(FR).length ? { at: (PREV.firstRun && PREV.firstRun.at) || new Date().toISOString(), bar: (PREV.firstRun && PREV.firstRun.bar) || BAR, results: FR } : null;
  const results = Object.fromEntries(Object.keys(RES).map(k => [k, FR[k] || { ...RES[k], verdict: 'NO VERDICT YET (' + RES[k].verdict + (complete ? '' : ', data still loading') + ')' }]));
  const tierOf = (id) => { const r = FR[id]; return r && (r.verdict === 'PROVEN' || r.verdict === 'TRADABLE SMALL') ? r.verdict : null; };

  // 8. GRAPH file
  const allLinks = [...links, ...agreements], symOfCik = (c) => (cikTick.get(c) || [])[0] || null;
  W(GRAPH_OUT, { generatedAt: new Date().toISOString(), defined: DEFS.defined, window: [WSTART, last], complete,
    counts: { chains: Object.keys(DEFS.chains).length, layers: LAYERS.length, memberships: memberCounts.pointInTime + memberCounts.todayOnly + memberCounts.pending, pointInTime: memberCounts.pointInTime, todayOnly: memberCounts.todayOnly, todayOnlyNoCik: memberCounts.noCik, todayOnlyNoFiling: memberCounts.noFiling, notCheckedYet: memberCounts.pending, customerLinks: links.length, agreements: agreements.length, agreementsWithValue: agreements.filter(e => e.value).length, demandNodes: NODES.length, demandNodesWithCik: NODES.filter(n => n.cik).length },
    note: 'Official dated sources only. Membership: point-in-time from the first own EDGAR filing with a layer keyword; today-only members are excluded from every history test. Customer links: active 400 days after the latest filing showing them; agreements: 400 days after the filing. Layers come from web research (source link per layer) and carry hindsight: CHAIN-MOM1 is judged against the same stocks in months their layer was not hot, to remove it.',
    chains: graphChains, links: allLinks.map(e => ({ ...e, supplier: e.supplier || symOfCik(e.supplierCik), supplierSic: SIC[e.supplier] ? SIC[e.supplier].c : null })), linkDays: LINK_DAYS,
    industries: Object.fromEntries(Object.entries(SIC).filter(([, x]) => x && x.c).map(([s, x]) => [s, x.c])) });

  // 9. LIVE list: today's hot layers, and the buys of any rule that reached tier 2 or proven (gates on the last cached close)
  const future = tradingSessions(new Date(Date.parse(last) + 864e5).toISOString().slice(0, 10), new Date(Date.parse(last) + 120 * 864e5).toISOString().slice(0, 10));
  const HAL = J('data/halal.json', {}), ZAD = J('data/zad-list.json', {}), zbad = new Set(ZAD.notHalal || []), halOf = (s) => zbad.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
  const tL = T - 1, spyNow = spyI === undefined ? 0 : ret(spyI, tL - 63, tL), selNow = momSelect(layerInputs(tL, true), spyNow || 0);
  const buys = [];
  if (tierOf('CHAIN-MOM1')) for (const b of selNow.buys) { const i = SY.get(b.s); buys.push({ rule: 'CHAIN-MOM1', sym: b.s, buy: future[0], sell: future[MOM_HOLD - 1], stopPct: null, lastClose: r4(CC(i, tL)), chainLayer: b.layers.join(' + '), event: 'layer in the top 3 of ' + selNow.ranked.length + ' by 3-month return vs the S&P 500 (' + b.layers.map(k => pc((selNow.top.find(x => x.key === k) || {}).excess)).join(', ') + ')', halal: halOf(b.s) }); }
  if (tierOf('CHAIN-DEMAND1')) for (const e of demandEvents.filter(e => e.hit)) { const { s, base } = signalSession(e.accept, e.filed); if (s !== tL) continue; const sup = officialOf(e.cik, s); for (const [k, v] of upstreamOf(e.cik, s)) if (!sup.has(k)) sup.set(k, v);
    for (const [cik, via] of sup) { const i = symAt(cik, s); if (i === undefined) continue; const rise = ret(i, base, s); if (rise === null || rise >= RISE_MAX || gatesAt(cik, i, s)) continue;
      buys.push({ rule: 'CHAIN-DEMAND1', sym: SYMS[i], buy: future[0], sell: future[DEM_HOLD - 1], stopPct: STOP, lastClose: r4(CC(i, tL)), chainLayer: via, event: e.node + ' earnings 8-K filed ' + e.filed + ': ' + String(e.text || '').slice(0, 120), source: e.url, halal: halOf(SYMS[i]) }); } }
  if (tierOf('CHAIN-READ1')) for (const e of readEvents.filter(e => e.hit)) { const s = firstOnOrAfter(D, e.filed); if (s !== tL) continue; for (const L of layersOfCik(e.cik, s)) for (const m of pitAt(L, s)) { if (m.cik === e.cik) continue; const i = symAt(m.cik, s); if (i === undefined) continue; const rise = ret(i, s - 1, s); if (rise === null || rise >= RISE_MAX || gatesAt(m.cik, i, s)) continue;
    buys.push({ rule: 'CHAIN-READ1', sym: SYMS[i], buy: future[0], sell: future[READ_HOLD - 1], stopPct: STOP, lastClose: r4(CC(i, tL)), chainLayer: L.key, event: ((cikTick.get(e.cik) || [])[0] || e.cik) + ' revenue ' + pc(e.growth) + ' on the prior year and raised guidance (8-K filed ' + e.filed + ')', source: e.url, halal: halOf(SYMS[i]) }); } }
  if (tierOf('CHAIN-LAG1') && pairs.length) { const m = blocks.length - 1; for (const p of pairs) { const a = series[p.from][m]; if (!lagPredict(p, a)) continue; const L = LAYERS.find(x => x.key === p.to); for (const mm of pitAt(L, tL)) { const i = symAt(mm.cik, tL); if (i === undefined || gatesAt(mm.cik, i, tL)) continue;
    buys.push({ rule: 'CHAIN-LAG1', sym: SYMS[i], buy: future[0], sell: future[20], stopPct: null, lastClose: r4(CC(i, tL)), chainLayer: p.to, event: p.from + ' ' + pc(a) + ' vs the S&P 500 last month; it led ' + p.to + ' (t ' + p.t + ' on the first half)', halal: halOf(SYMS[i]) }); } } }
  const memberOf = {}; for (const [chain, g] of Object.entries(graphChains)) g.layers.forEach((Lg, li) => { for (const m of Lg.members) (memberOf[m.sym] = memberOf[m.sym] || []).push({ chain, layer: Lg.layer, li, of: g.layers.length, since: m.since || null, status: m.status }); });
  W(TODAY_OUT, { generatedAt: new Date().toISOString(), lastClose: last, sessions: future.slice(0, 60), rules: { 'CHAIN-MOM1': tierOf('CHAIN-MOM1'), 'CHAIN-DEMAND1': tierOf('CHAIN-DEMAND1'), 'CHAIN-LAG1': tierOf('CHAIN-LAG1'), 'CHAIN-READ1': tierOf('CHAIN-READ1') }, verdicts: Object.fromEntries(Object.entries(results).map(([k, r]) => [k, r.verdict])),
    hot: selNow.ranked.slice(0, 8).map(x => ({ layer: x.key, excess: r4(x.excess), n: x.n })), cold: selNow.ranked.slice(-3).reverse().map(x => ({ layer: x.key, excess: r4(x.excess), n: x.n })), spy63: r4(spyNow),
    recentDemand: demandEvents.filter(e => e.hit && e.filed >= D[Math.max(0, T - 30)]).map(e => ({ node: e.node, filed: e.filed, kind: e.kind, text: String(e.text || '').slice(0, 160), url: e.url })).slice(-10),
    buys, members: memberOf, buyUpToPct: 0.03,
    note: 'Hot layers = the 3-month return of each layer\'s point-in-time members vs the S&P 500 at the last cached close. buys holds lines only for a rule whose frozen verdict is TRADABLE SMALL or PROVEN; halal from data/halal.json + ZAD (unknown = check ZAD first); gates (price, dollar volume, lottery, dilution) on the last cached close.' });

  const out = { generatedAt: new Date().toISOString(), preRegistered: '2026-10-23', window: [D[START], last], sessions: T - START, split: { half: D[midT], lag1SecondHalfSplit: D[mid2] }, bar: BAR, complete,
    data: { requests: nReq, failedRequests: nFail, missing: DATA_OK.missing, members: memberCounts, customerLinks: links.length, agreements: agreements.length, demandNode8K: demandEvents.length, demandSignals: demandEvents.filter(e => e.hit).length, readCandidates: readEvents.length, readSignals: readEvents.filter(e => e.hit).length, dilutionIndexQuarters: DIL.ok + ' of ' + DIL.all, secTickers: Object.keys(TK).length, massiveRefCiks: Object.keys(REF).length },
    caveat: 'Prices: 5-year whole-market cache incl. dead stocks (3 USD+, 1M USD+ rows). Chains and layers were chosen in Oct 2026 (hindsight); membership is dated by the companies\' own filings and today-only members are excluded. EDGAR full-text search gives filing dates only (READ1 signals count from the first session on/after that date); DEMAND1 uses the exact acceptance time. Keyword rules read words, not meaning: some hits are mentions. results = frozen first verdict (firstRun); latest = monitoring only.',
    results, firstRun, latest: latestBlock({ at: new Date().toISOString(), to: last, results: RES }), momHistory: momHistory.slice(-24), leadersByYear,
    trades: { 'CHAIN-MOM1': mom.map(z => ({ s: z.s, buy: D[z.t + 1], sell: D[z.t + MOM_HOLD], layers: z.layers, net: r4(z.g - COST), avgStock: r4(z.c), sameStock: r4(z.ob) })),
      'CHAIN-DEMAND1': dem.map(z => ({ s: z.s, buy: D[z.t + 1], node: z.node, via: z.via, kind: z.kind, filed: z.filed, exit: z.why, net: r4(z.g - COST), avgStock: r4(z.c), sameStock: r4(z.ob), source: z.url })),
      'CHAIN-LAG1': lag.map(z => ({ s: z.s, buy: D[z.t + 1], sell: D[z.t + 21], layer: z.layer, net: r4(z.g - COST), avgStock: r4(z.c), sameStock: r4(z.ob) })),
      'CHAIN-READ1': rd.map(z => ({ s: z.s, buy: D[z.t + 1], by: z.by, layer: z.layer, growth: r4(z.growth), filed: z.filed, exit: z.why, net: r4(z.g - COST), avgStock: r4(z.c), sameStock: r4(z.ob), source: z.url })) } };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('CHAIN DECODER (' + D[START] + ' to ' + last + ', bar t ' + BAR + (complete ? '' : '; DATA INCOMPLETE: no verdict frozen, ' + DATA_OK.missing.length + ' items missing') + ')');
  for (const [k, r] of Object.entries(RES)) { const a = r.results.all || {}, o = r.results.older || {}, n = r.results.newer || {};
    console.log('- ' + k + ': ' + r.verdict + ' | ' + (a.n || 0) + ' trades, ' + (a.days || 0) + ' days, ' + (a.stocks || 0) + ' stocks, win ' + (a.win !== undefined ? Math.round(a.win * 100) + '%' : 'n/a') + ', avg ' + pc(a.avg) + ' | older ' + (o.n || 0) + ' edge ' + pc(o.edge) + ' t ' + o.t + ' vsOwn ' + pc(o.vsOwn) + ' | newer ' + (n.n || 0) + ' edge ' + pc(n.edge) + ' t ' + n.t + ' vsOwn ' + pc(n.vsOwn) + ' | ' + String(r.why).split(';')[0]); }
  console.log('LAG1 pairs learned on the first half: ' + (pairs.map(p => p.from + ' -> ' + p.to + ' (t ' + p.t + ')').join(', ') || 'none'));
  console.log('hot layers now: ' + selNow.top.map(x => x.key + ' ' + pc(x.excess)).join(', '));
  // library: from firstRun only
  try { const LB = J('data/strategy-library.json', null); let ch = false;
    for (const id of Object.keys(RES)) { const e = LB && LB.strategies.find(x => x.id === id), r = FR[id]; if (!e || !r) continue; const R = r.results;
      e.status = 'tested: ' + r.verdict.toLowerCase(); e.tested = firstRun.at.slice(0, 10); e.study = 'chain-decoder.mjs -> data/chain-decoder.json (run once as written, first complete run frozen)';
      e.result = { t: (R.newer || {}).t, tOlder: (R.older || {}).t, edge: (R.newer || {}).edge, edgeOlder: (R.older || {}).edge, vsOwn: (R.newer || {}).vsOwn, vsOwnOlder: (R.older || {}).vsOwn, n: [(R.older || {}).n || 0, (R.newer || {}).n || 0], avg: (R.all || {}).avg, win: (R.all || {}).win, bar: firstRun.bar, why: r.why }; ch = true; }
    if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('chain-decoder: library not updated: ' + e.message); }
})();
