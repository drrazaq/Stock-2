// RESEARCH LAB (daily researcher; first build 25 Oct 2026). Research + a FORWARD PAPER lane; never places an order; no Telegram.
// Rules: research-core.mjs RULES (pre-registered before any run; library ids RQ-*; the lab writes the same rule text into
// data/strategy-library.json before computing anything). Idea 1 = LAZY PRICES (10-K text change, Cohen, Malloy and Nguyen 2020).
// 1. DATA (GitHub Actions only; keys only from secrets, never printed; official sources, no scraping):
//    prices = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY, dead stocks' later prices
//             in its x rows) + the sessions since from Massive grouped daily bars + splits since the cache day (squad1-lab pattern).
//    10-K   = SEC EDGAR official files: data.sec.gov submissions JSON per company (the 10-K list with acceptance time and primary
//             document) and each 10-K primary document from www.sec.gov/Archives (8 requests a second at most, declared User-Agent).
//             Collected over one or more runs into research-cache (this lab's own cache); the verdict waits for the data rule.
//    company identity = data/shares.json.gz + data/sec-ciks.json (today's lists) AND the point-in-time ticker <-> CIK pairs of the SEC
//             Form 3/4/5 data sets already cached by Squad 1 (squad1-cache/insider2, RESTORED READ ONLY), so delisted, renamed and
//             taken-over companies keep their 10-Ks (survivorship).
// 2. 5-YEAR ONE-SHOT for every rule not yet frozen, on the first run where the data rule passes (value-core judge; halves = signal before /
//    from 2024-01-01; capped yardstick AUD-1). First complete verdict frozen in data/research-lab.json firstRun (first-run.mjs freezeEach).
// 3. PAPER LANE from Monday 26 Oct 2026: new 10-Ks from the EDGAR daily index; data/research-paper.jsonl, data/research-today.json
//    (methods[id].newSignals: read by the TRY SMALL lane in scan.mjs), data/research-board.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, TIER2_T } from './value-core.mjs';
import { parseDailyIdx } from './squad1-core.mjs';
import { RULES, IDS, LAZY_IDS, TENDER_IDS, TO, parseSubmission, offerPrice, spreadOf, saneSpread, inSpread, tenderExit, tenderDataRule, ONE_OPEN, COST, SPLIT, PAPER_START, LP, mean, r4, halfOf, capG, addDays, firstAfter as fAfter, nextSession, ownAverage, pitPick, avoidVerdict, boardStats, paperReady, shapeOf,
  preRegister, termFreq, tenKs, docUrl, pairPrev, pairSim, makeRanker, sideOf, dataComplete,
  ISC, ISC_IDS, sdOf, isShock, eightKs, reactionDate, isEarnings, newsOk, iscDataRule, RPO, RPO_IDS, rpoRows, rpoEvents, rpoDataRule,
  EAT, EAT_IDS, eatAnnouncements, eatEvents, eatDataRule, TAX, TAX_IDS, taxRows, taxEvents, taxDataRule,
  RDI, RDI_IDS, rdiRows, rdiEvents, rdiDataRule, INV, INV_IDS, invRows, invEvents, invDataRule,
  GWI, GWI_IDS, gwiRows, gwiEvents, gwiDataRule, GPC, GPC_IDS, gpcRows, gpcEvents, gpcDataRule, DVC, DVC_IDS, dvcRows, dvcEvents, dvcDataRule, DST, DST_IDS, dstRows, dstEvents, dstMarket, dstScore, dstShares, dstDataRule, OC, OC_IDS, ocRows, ocEvents, ocDataRule, WIKI, WIKI_IDS, WIKI_SPARQL, wikiMap, wikiSeries, wikiAppend, wikiEnd, wikiScore, wikiRank, wikiSpikes, wikiDataRule, PRE, PRE_IDS, preMom, preRank, preWindow, preDataRule, SVOL, SVOL_IDS, svolUrl, svolParse, weekStarts, svolScore, svolRank, svolSide, svolDataRule, SBC, SBC_IDS, sbcRows, sbcEvents, sbcDataRule } from './research-core.mjs';
import { execFileSync } from 'node:child_process';
import { secNY } from './sec-time.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SECD_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', RC = env.RQ_CACHE || 'research-cache', OUT = 'data/research-lab.json', PAPER = 'data/research-paper.jsonl', TODAY = 'data/research-today.json', BOARD = 'data/research-board.json';
const START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.RQ_MINUTES || 280) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(RC + '/lp', { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0);
log('research lab; frozen already: ' + Object.keys(FROZEN).length + '/' + IDS.length);

// ================= 0. PRE-REGISTRATION in the library (before any computation; idempotent) =================
{ const LB = J('data/strategy-library.json', null), ch = preRegister(LB); if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); log('library: ' + ch + ' RQ entries pre-registered now'); }

// ================= 1. PRICES (squad1-lab pattern) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('research-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let ms = Date.parse(cacheLast) + 864e5; ms <= Date.now(); ms += 864e5) { const d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none') + (env.MASSIVE_KEY ? '' : ' (no MASSIVE_KEY)'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t])), firstAfter = (d) => fAfter(D, d);
const SY = new Map(); for (const d of D) { for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN), CX = new Float32Array(N).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; } });
store = null;
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; C[q] /= r; CX[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY');
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '), stocks ' + NS);
const LIQ = new Uint8Array(N); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = C[b + t] * V[b + t]; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const w = C[b + t - 20] * V[b + t - 20]; if (isFinite(w)) { s -= w; n--; } } if (t >= 19 && n === 20 && C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqAt = new Map(); const liqList = (t) => { if (!liqAt.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqAt.set(t, a); } return liqAt.get(t); };
const liqOn = (i, t) => t >= 0 && t < T && LIQ[i * T + t] === 1;
const closeAt = (i, x, k) => { for (let q = x; q >= k; q--) { const z = C[i * T + q]; if (z > 0) return z; const y = CX[i * T + q]; if (y > 0) return y; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1) return null; const e = O[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const cMemo = new Map(); const ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
const hasPx = (i, t) => { for (let q = Math.max(0, t - 5); q <= Math.min(T - 1, t + 5); q++) if (C[i * T + q] > 0 || CX[i * T + q] > 0) return true; return false; };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';

// ================= 2. UNIVERSE AND COMPANY IDENTITY =================
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {} });
const todayCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(+a); const y = SECCIK[s]; return y ? String(+y[0]) : null; };
const EVID = new Map(), CIKSYM = new Map(); const addEv = (sym, cik, d) => { if (!sym || !cik || !d || !/^[A-Z][A-Z0-9.]{0,6}$/.test(sym)) return; const c = String(+cik); if (!(+c > 0)) return;
  (EVID.get(sym) || EVID.set(sym, []).get(sym)).push([d, c]); (CIKSYM.get(c) || CIKSYM.set(c, []).get(c)).push([d, sym]); };
let evFiles = 0; try { for (const f of fs.readdirSync('squad1-cache/insider2')) { const x = J('squad1-cache/insider2/' + f, null); if (!x) continue; evFiles++; for (const [sy, ck, a, b] of x.pairs || []) { addEv(sy, ck, a); if (b !== a) addEv(sy, ck, b); } } } catch (e) {}
log('point-in-time ticker <-> CIK evidence: ' + evFiles + ' quarter files, ' + EVID.size + ' tickers');
const cikOfSym = (s, d) => pitPick(EVID.get(s), d) || todayCik(s);
const FORM_M = []; for (let t = 1; t < T; t++) if (D[t].slice(0, 7) !== D[t - 1].slice(0, 7)) FORM_M.push(t);
const UNI = new Set(); let liqMonths = 0, liqMapped = 0; const todaySyms = new Map();
for (const s of SYMS) { const c = todayCik(s); if (c) (todaySyms.get(c) || todaySyms.set(c, []).get(c)).push(s); }
for (const t of FORM_M) for (const i of liqList(t)) { liqMonths++; const c = cikOfSym(SYMS[i], D[t]); if (c) { liqMapped++; UNI.add(c); } }
const CIKS = [...UNI].sort((a, b) => +a - +b);
log('universe: ' + CIKS.length + ' companies (liquid at a month start in the window); liquid stock-months mapped ' + liqMapped + '/' + liqMonths);
// the stock behind a CIK's filing on d: a point-in-time ticker of the CIK with prices near d, else a today-list ticker with prices
const symFor = (cik, d) => { const t = Math.min(firstAfter(d), T - 1); const p = pitPick(CIKSYM.get(cik), d); if (p && SY.has(p) && hasPx(SY.get(p), t)) return p;
  for (const s of todaySyms.get(cik) || []) if (hasPx(SY.get(s), t)) return s; return null; };

// ================= 3. SEC 10-K COLLECTION (cached per company; continues across runs) =================
let secReq = 0, secFail = 0, bytes = 0, gate = Promise.resolve(); const SECFAILS = [];
// one request start every 125 ms at most (8 a second, under the SEC's 10), shared by all workers: a serial gate, not a per-worker timer
const slot = () => { const p = gate.then(() => sleep(local(env.SEC_BASE) || local(env.SECD_BASE) ? 0 : 125)); gate = p; return p; };
async function sec(url, kind = 'json') { for (let a = 0; a < 4; a++) { await slot(); secReq++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(90000) }); if (r.status === 404 || r.status === 410) return null;
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(3000 * (a + 1)); continue; } if (!r.ok) { secFail++; if (SECFAILS.length < 20) SECFAILS.push('HTTP ' + r.status + ' ' + url.slice(0, 160)); return undefined; }
      const txt = await r.text(); bytes += txt.length; if (txt.length > 80e6) return null; return kind === 'json' ? JSON.parse(txt) : txt; } catch (e) { await sleep(1500 * (a + 1)); } }
  secFail++; if (SECFAILS.length < 20) SECFAILS.push('gave up ' + url.slice(0, 160)); return undefined; }
const pad = (c) => String(c).padStart(10, '0'), cfile = (c) => RC + '/lp/' + c + '.json';
async function filingList(cik) { const j = await sec(SECD + '/submissions/CIK' + pad(cik) + '.json'); if (j === undefined) return undefined; if (j === null) return [];
  const list = tenKs(j.filings && j.filings.recent), rec = (j.filings && j.filings.recent && j.filings.recent.filingDate) || [], oldest = rec.length ? rec[rec.length - 1] : '';
  if (oldest > LP.fetchFrom) for (const f of (j.filings && j.filings.files) || []) { if (String(f.filingTo || '') < LP.fetchFrom) continue; const x = await sec(SECD + '/submissions/' + f.name); if (x === undefined) return undefined; if (x) list.push(...tenKs(x)); }
  const seen = new Set(); return list.filter(f => !seen.has(f.acc) && seen.add(f.acc)); }
// one company: its 10-K list, each document's word count and each pair's similarity; saved when the company is finished
async function doCompany(cik) { const prev = J(cfile(cik), null); if (prev && prev.done) return prev;
  let list = prev && prev.k ? prev.k : null;
  if (!list) { const L = await filingList(cik); if (L === undefined) return { cik, subsOk: false }; list = L.map(f => ({ ...f, w: null, s: null, p: null, miss: false, tries: 0 })); }
  const P = pairPrev(list), tf = new Map(); for (const f of list) f.p = P.get(f.acc) || null;
  const need = new Set(); for (const f of list) { if (f.miss) continue; if (f.w === null || (f.p && f.s === null && !f.sDone)) need.add(f.acc); if (f.p && f.s === null && !f.sDone) need.add(f.p); }
  let failed = false;
  for (const f of [...list].sort((a, b) => a.date < b.date ? -1 : 1)) { if (!need.has(f.acc) || f.miss) continue;
    const html = await sec(SEC + docUrl(cik, f), 'text'); if (html === undefined) { f.tries = (f.tries || 0) + 1; if (f.tries >= 3) f.miss = true; else failed = true; continue; } if (html === null) { f.miss = true; continue; }
    const m = termFreq(html); f.w = m.total; tf.set(f.acc, m); }
  for (const f of list) { if (!f.p || f.sDone) continue; const a = tf.get(f.acc), b = tf.get(f.p), pf = list.find(x => x.acc === f.p);
    if (a && b) { f.s = pairSim(a, b); f.sDone = true; } else if (f.miss || (pf && pf.miss) || (f.w !== null && f.w < LP.minWords) || (pf && pf.w !== null && pf.w < LP.minWords)) { f.s = null; f.sDone = true; } }
  const done = !failed && list.every(f => f.miss || (f.w !== null && (!f.p || f.sDone)));
  const out = { cik, subsOk: true, at: new Date().toISOString(), done, k: list }; W(cfile(cik), out); return out; }
const COMP = new Map(); let processed = 0;
{ const queue = [...CIKS]; const worker = async () => { while (queue.length && left() > 25 * 60e3) { const c = queue.shift(); try { COMP.set(c, await doCompany(c)); } catch (e) { log('company ' + c + ': ' + e.message); } processed++;
    if (processed % 250 === 0) log('10-K collection: ' + processed + '/' + CIKS.length + ' companies, ' + secReq + ' SEC requests, ' + (bytes / 1e9).toFixed(2) + ' GB, ' + secFail + ' failures'); } };
  await Promise.all(Array.from({ length: 6 }, worker));
  for (const c of CIKS) if (!COMP.has(c)) { const x = J(cfile(c), null); if (x) COMP.set(c, x); } }
let subsOk = 0, docsNeeded = 0, docsDone = 0; const SIMS = [];
for (const c of CIKS) { const x = COMP.get(c); if (!x || !x.subsOk) continue; subsOk++; for (const f of x.k || []) { docsNeeded++; if (f.miss || f.w !== null) docsDone++;
  if (typeof f.s === 'number') { const d = String(f.accept || f.date); SIMS.push({ cik: c, acc: f.acc, accept: d, d: nyDate(d), s: f.s }); } } }
function nyDate(s) { if (!/T/.test(s)) return s.slice(0, 10); const ms = Date.parse(s); if (!isFinite(ms)) return s.slice(0, 10);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)).map(x => [x.type, x.value])); return p.year + '-' + p.month + '-' + p.day; }
const DATA = dataComplete({ ciks: CIKS.length, subsOk, docsNeeded, docsDone, liqMonths, liqMapped });
const STATUS = { companies: CIKS.length, subsOk, docsNeeded, docsDone, similarities: SIMS.length, liqMonths, liqMapped, evidenceFiles: evFiles, secRequests: secReq, secFailures: secFail, gb: +(bytes / 1e9).toFixed(2), failSample: SECFAILS.slice(0, 5), complete: DATA.ok, ratios: DATA.ratios, why: DATA.why };
log('data: ' + JSON.stringify(STATUS));

// ================= 4. SIGNALS =================
const rank = makeRanker(SIMS), H = (id) => RULES[id].hold, EVENTS = { top: [], bottom: [] };
let mapped = 0, unmapped = 0;
for (const z of SIMS) { const p = rank(z.d, z.s), side = sideOf(p); if (side !== 'top' && side !== 'bottom') continue; const sym = symFor(z.cik, z.d); if (!sym) { unmapped++; continue; } mapped++;
  const i = SY.get(sym), k = firstAfter(z.d), t = k - 1; if (t < 1) continue; const tt = Math.min(t, T - 1); if (!liqOn(i, tt)) continue; EVENTS[side].push({ t: tt, i, k, d: z.d, p: r4(p), s: r4(z.s), future: k >= T }); }
STATUS.events = { top: EVENTS.top.length, bottom: EVENTS.bottom.length, extremeMapped: mapped, extremeUnmapped: unmapped };
log('events (liquid, mapped): non-changers ' + EVENTS.top.length + ', big changers ' + EVENTS.bottom.length + '; extreme filings without a priced ticker ' + unmapped);
const signalsOf = (id, a, b) => EVENTS[RULES[id].side].filter(z => z.t >= a && z.t <= b).map(z => ({ ...z, x: z.k + H(id) - 1 }));

// ================= 5. 5-YEAR ONE-SHOT (only when the data rule passes) =================
const need = LAZY_IDS.filter(id => !FROZEN[id]); const RES = {}, COUNTS = {};
function tradesOf(id, sigs, end = T - 1) { const out = [], busyUntil = new Map(), spans = new Map();
  for (const z of [...sigs].sort((p, q) => p.t - q.t || p.i - q.i)) { if (z.x >= T || z.x > end || z.future) continue;
    if (ONE_OPEN.has(id) && (busyUntil.get(z.i) ?? -1) >= z.k) continue; const g0 = ret(z.i, z.k, z.x); if (g0 === null || !isFinite(g0)) continue; const g = capG(g0), c = ctrlSpan(z.k, z.x); if (c === null) continue;
    busyUntil.set(z.i, z.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, z.x]); out.push({ t: z.t, s: SYMS[z.i], i: z.i, k: z.k, x: z.x, g, c, p: z.p, half: halfOf(D[z.t]) }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.x - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 253, to: end, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  return out; }
for (const id of LAZY_IDS) { const sigs = signalsOf(id, 0, T - 1).filter(z => !z.future && z.x < T); COUNTS[id] = { older: sigs.filter(z => halfOf(D[z.t]) === 'older').length, newer: sigs.filter(z => halfOf(D[z.t]) === 'newer').length }; }
log('signals with a complete hold: ' + LAZY_IDS.map(id => id + ' ' + COUNTS[id].older + '/' + COUNTS[id].newer).join(', '));
for (const id of need) { if (!DATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'data rule not met yet: ' + DATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, signalsOf(id, 0, T - 1)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const v = RULES[id].kind === 'avoid' ? avoidVerdict(R) : judge(R, { bar: BAR });
  RES[id] = { ...v, results: R, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: RULES[id].kind, family: RULES[id].family, name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1: trades and yardstick capped at +300% alike)',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], pct: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + RES[id].why.slice(0, 300)); }

// ================= 5b. IDEA 2: CASH TENDER OFFERS (pre-registered 26 Oct 2026; research-core.mjs IDEA 2) =================
// Data: the SEC daily index files (official, master.YYYYMMDD.idx) from TO.idxFrom, each original 'SC TO-T' that names a universe company
// (or a priced ticker) on any of its index rows, and that filing's full submission text (header: SUBJECT COMPANY + acceptance time;
// documents SC TO-T / EX-99 for the offer price). Cached in research-cache/to (continues across runs). No verdict before the data rule.
const TODIR = RC + '/to'; fs.mkdirSync(TODIR + '/f', { recursive: true });
const TIDX = J(TODIR + '/idx.json', { days: {} }), TSTAT = { idxNeed: 0, idxRead: 0, idxFail: 0, filNeed: 0, filRead: 0, filMiss: 0, subjNoCik: 0, subjUnmapped: 0, subjIlliquid: 0, subjPriced: 0, subjOffer: 0, insane: 0, cvr: 0, events: 0 };
const TEV = [];
{ const today = iso(Date.now()), idxDays = [];
  for (let d = TO.idxFrom; d <= D[T - 1]; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd !== 0 && wd !== 6) idxDays.push(d); }
  for (let d = addDays(D[T - 1], 1); d <= today; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd !== 0 && wd !== 6) idxDays.push(d); }   // paper days after the last close
  TSTAT.idxNeed = idxDays.filter(d => d <= D[T - 1]).length;
  for (const d of idxDays) { if (TIDX.days[d] !== undefined) continue; if (left() < 40 * 60e3) break;
    const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, idx = await sec(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx', 'text');
    if (idx === undefined) { TSTAT.idxFail++; continue; } if (idx === null) { if (d < iso(Date.now() - 2 * 864e5)) TIDX.days[d] = []; continue; }   // no file: a holiday (or not yet published)
    TIDX.days[d] = parseDailyIdx(idx, new Set(['SC TO-T']), () => true).map(r => [r.cik, r.file]); }
  W(TODIR + '/idx.json', TIDX); TSTAT.idxRead = idxDays.filter(d => d <= D[T - 1] && TIDX.days[d] !== undefined).length;
  const fil = new Map(); for (const [d, rows] of Object.entries(TIDX.days)) for (const [cik, file] of rows) { const f = fil.get(file) || fil.set(file, { d, ciks: [] }).get(file); f.ciks.push(cik); }
  const uniSet = new Set(CIKS), want = [...fil.entries()].filter(([, f]) => f.ciks.some(c => uniSet.has(c) || !!symFor(c, f.d))).sort((a, b) => a[1].d < b[1].d ? -1 : 1);
  const ffile = (file) => TODIR + '/f/' + file.replace(/[^0-9A-Za-z-]/g, '_') + '.json', READ = new Map();
  const queue = want.filter(([file]) => { const x = J(ffile(file), null); if (x) { READ.set(file, x); return false; } return true; });
  const worker = async () => { while (queue.length && left() > 30 * 60e3) { const [file] = queue.shift(); const txt = await sec(SEC + '/Archives/' + file, 'text'); if (txt === undefined) continue;
    let rec; if (txt === null) rec = { miss: true }; else { const p = parseSubmission(txt), o = offerPrice(p.docs); rec = { subjectCik: p.subjectCik, accept: p.accept, date: p.date, px: o.px, n: o.n, cvr: o.cvr }; }
    W(ffile(file), rec); READ.set(file, rec); } };
  await Promise.all(Array.from({ length: 4 }, worker));
  TSTAT.filNeed = want.filter(([, f]) => f.d <= D[T - 1]).length; TSTAT.filRead = want.filter(([file, f]) => f.d <= D[T - 1] && READ.has(file)).length;
  const pxAt = (i, t) => { const c = C[i * T + t]; if (c > 0) return c; const y = CX[i * T + t]; return y > 0 ? y : null; };
  for (const [file, f] of want) { const r = READ.get(file); if (!r) continue; if (r.miss) { TSTAT.filMiss++; continue; } if (!r.subjectCik) { TSTAT.subjNoCik++; continue; }
    const date = r.date || f.d, sym = symFor(r.subjectCik, date); if (!sym) { TSTAT.subjUnmapped++; continue; }
    const i = SY.get(sym), k = firstAfter(date), t0 = Math.min(k - 1, T - 1); if (t0 < 1) continue; if (!liqOn(i, t0)) { TSTAT.subjIlliquid++; continue; }
    TSTAT.subjPriced++; if (!(r.px > 0)) continue; TSTAT.subjOffer++; if (r.cvr) TSTAT.cvr++; const c0 = pxAt(i, t0), sp = spreadOf(r.px, c0);
    if (!saneSpread(sp)) { TSTAT.insane++; continue; }
    TEV.push({ t: t0, i, k, d: date, s: r4(sp), c0, offer: r.px, cvr: !!r.cvr, acc: file.split('/').pop().replace(/\.txt$/, ''), future: k >= T }); }
  TSTAT.events = TEV.length; TSTAT.spreadCounts = Object.fromEntries(TENDER_IDS.map(id => [id, TEV.filter(z => inSpread(id, z.s)).length]));
  globalThis.__pxAt = pxAt; }
const TDATA = tenderDataRule(TSTAT); TSTAT.complete = TDATA.ok; TSTAT.ratios = TDATA.ratios; TSTAT.why = TDATA.why;
log('tender data: ' + JSON.stringify(TSTAT));
const tPx = (i) => (t) => globalThis.__pxAt(i, t);
function tenderTrades(id) { const out = [], busyUntil = new Map(), spans = new Map();
  for (const z of TEV.filter(e => !e.future && inSpread(id, e.s)).sort((p, q) => p.t - q.t || p.i - q.i)) {
    if ((busyUntil.get(z.i) ?? -1) >= z.k) continue; const ex = tenderExit({ k: z.k, c0: z.c0, T, px: tPx(z.i) }); if (!ex) continue;
    const g0 = ret(z.i, z.k, ex.x); if (g0 === null || !isFinite(g0)) continue; const g = capG(g0), c = ctrlSpan(z.k, ex.x); if (c === null) continue;
    busyUntil.set(z.i, ex.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, ex.x]);
    out.push({ t: z.t, s: SYMS[z.i], i: z.i, k: z.k, x: ex.x, g, c, p: z.s, why: ex.why, cvr: z.cvr, offer: z.offer, half: halfOf(D[z.t]) }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.x - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 253, to: T - 1, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  return out; }
for (const id of TENDER_IDS.filter(x => !FROZEN[x])) { if (!TDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'tender data rule not met yet: ' + TDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tenderTrades(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), TO.maxHold), newer: halfStat(tr.filter(z => z.half === 'newer'), TO.maxHold), all: halfStat(tr, TO.maxHold) }, v = judge(R, { bar: BAR });
  const exits = {}; for (const w of ['closed', 'break', 'time']) { const a = tr.filter(z => z.why === w); exits[w] = { n: a.length, avgNet: a.length ? r4(mean(a.map(z => z.g - COST))) : null, avgSessions: a.length ? r4(mean(a.map(z => z.x - z.k + 1))) : null }; }
  RES[id] = { ...v, results: R, exits, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold: TO.maxHold, kind: 'buy', family: 'tender', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the SAME entry-to-exit sessions',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], exit: z.why, spread: z.p, offer: z.offer, cvr: z.cvr, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | exits ' + JSON.stringify(exits) + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5c. IDEA 3: INFORMATION-SHOCK CONTINUATION (pre-registered 27 Oct 2026; research-core.mjs IDEA 3, C-ISC1) =================
// Data: each universe company's 8-K list (acceptance time + items) from the official data.sec.gov submissions JSON (recent + older
// pages back to 2021-09), cached in research-cache/isc (continues across runs). Prices: the same arrays as ideas 1-2 (dead stocks kept).
const ISCDIR = RC + '/isc'; fs.mkdirSync(ISCDIR, { recursive: true });
const ISTAT = { companies: CIKS.length, subsOk: 0, eightKs: 0, liqMonths, liqMapped, newsSessions: 0, noSym: 0, notLiquid: 0, noSigma: 0, shocks: 0, shocksE: 0, shocksNE: 0, lottery: 0 };
async function eightKList(cik) { const j = await sec(SECD + '/submissions/CIK' + pad(cik) + '.json'); if (j === undefined) return undefined; if (j === null) return [];
  const list = eightKs(j.filings && j.filings.recent), rec = (j.filings && j.filings.recent && j.filings.recent.filingDate) || [], oldest = rec.length ? rec[rec.length - 1] : '';
  if (oldest > ISC.from) for (const f of (j.filings && j.filings.files) || []) { if (String(f.filingTo || '') < ISC.from) continue; const x = await sec(SECD + '/submissions/' + f.name); if (x === undefined) return undefined; if (x) list.push(...eightKs(x)); }
  const seen = new Set(); return list.filter(z => { const k = z[0] + '|' + z[1]; if (seen.has(k)) return false; seen.add(k); return true; }); }
const ifile = (c) => ISCDIR + '/' + c + '.json', EK = new Map();
{ const queue = []; for (const c of CIKS) { const x = J(ifile(c), null); if (x && Array.isArray(x.k)) EK.set(c, x.k); else queue.push(c); }
  log('8-K lists cached ' + EK.size + '/' + CIKS.length + '; to read now ' + queue.length);
  let n = 0; const worker = async () => { while (queue.length && left() > 22 * 60e3) { const c = queue.shift(); let L; try { L = await eightKList(c); } catch (e) { L = undefined; } if (L === undefined) continue;
    W(ifile(c), { cik: c, at: new Date().toISOString(), k: L }); EK.set(c, L); if (++n % 500 === 0) log('8-K lists: ' + n + ' read now, ' + secReq + ' SEC requests, ' + secFail + ' failures'); } };
  await Promise.all(Array.from({ length: 6 }, worker)); }
ISTAT.subsOk = CIKS.filter(c => EK.has(c)).length; for (const c of CIKS) ISTAT.eightKs += (EK.get(c) || []).length;
const IDATA = iscDataRule({ ...ISTAT, ciks: CIKS.length }); ISTAT.complete = IDATA.ok; ISTAT.ratios = IDATA.ratios; ISTAT.why = IDATA.why;
// the average liquid stock's close-to-close return each session (stocks liquid on t-1), capped like every return (AUD-1)
const pxA = (i, t) => { if (t < 0 || t >= T) return null; const c = C[i * T + t]; if (c > 0) return c; const y = CX[i * T + t]; return y > 0 ? y : null; };
const r1 = (i, t) => { const a = pxA(i, t - 1), b = pxA(i, t); return a > 0 && b > 0 ? capG(b / a - 1) : null; };
const MKT = new Float64Array(T).fill(NaN); for (let t = 1; t < T; t++) { let s = 0, n = 0; for (const i of liqList(t - 1)) { const r = r1(i, t); if (r !== null) { s += r; n++; } } if (n >= 50) MKT[t] = s / n; }
const arOf = (i, t) => { const r = r1(i, t); return r !== null && isFinite(MKT[t]) ? r - MKT[t] : null; };
const sigmaOf = (i, t) => { const a = []; for (let u = t - ISC.win; u < t; u++) if (u >= 1) { const x = arOf(i, u); if (x !== null) a.push(x); } return sdOf(a); };
const sessOnOrAfter = (d) => fAfter(D, addDays(d, -1));
const IEV = []; { const seen = new Set();
  for (const c of CIKS) { const by = new Map(); for (const [acc, items] of EK.get(c) || []) { const rd = reactionDate(acc, secNY); if (!rd) continue; const t = sessOnOrAfter(rd); if (t >= T || t < ISC.win + 1) continue; (by.get(t) || by.set(t, []).get(t)).push(isEarnings(items)); }
    for (const [t, kinds] of by) { ISTAT.newsSessions++; const sym = symFor(c, D[t]); if (!sym) { ISTAT.noSym++; continue; } const i = SY.get(sym); if (!liqOn(i, t)) { ISTAT.notLiquid++; continue; }
      const ar = arOf(i, t); if (ar === null || ar < ISC.minAR) continue; const sg = sigmaOf(i, t); if (sg === null) { ISTAT.noSigma++; continue; } if (!isShock(ar, sg)) continue;
      const key = i + '|' + t; if (seen.has(key)) continue; seen.add(key); const e = kinds.some(Boolean); ISTAT.shocks++; if (e) ISTAT.shocksE++; else ISTAT.shocksNE++; if (ar >= ISC.lottery) ISTAT.lottery++;
      IEV.push({ t, i, k: t + 1, d: D[t], kinds, p: r4(ar), sg: r4(sg), future: t + 1 >= T }); } } }
log('info-shock data: ' + JSON.stringify(ISTAT));
const iscSignals = (id) => IEV.filter(z => newsOk(id, z.kinds)).map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of ISC_IDS.filter(x => !FROZEN[x])) { if (!IDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'info-shock data rule not met yet: ' + IDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, iscSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) }, v = judge(R, { bar: BAR });
  const lot = tr.filter(z => z.p >= ISC.lottery), rest = tr.filter(z => z.p < ISC.lottery), avgN = (a) => a.length ? r4(mean(a.map(z => z.g - COST))) : null, edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null;
  const lotterySplit = { lottery15: { n: lot.length, avgNet: avgN(lot), edge: edgeN(lot) }, under15: { n: rest.length, avgNet: avgN(rest), edge: edgeN(rest) } };
  RES[id] = { ...v, results: R, lotterySplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: 'buy', family: 'isc', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], ar: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(lotterySplit) + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5d. IDEA 4: ORDER BACKLOG (RPO) GROWTH (pre-registered 28 Oct 2026; research-core.mjs IDEA 4) =================
// Data: us-gaap:RevenueRemainingPerformanceObligation from the official SEC bulk company facts file (companyfacts.zip, read once into
// research-cache/rpo.json.gz; only the universe companies, only this tag). Paper lane: companyconcept JSON for companies that filed a
// 10-Q/10-K on a day since the paper start (SEC daily index).
const RPOF = RC + '/rpo.json.gz', RSTAT = { companies: CIKS.length, looked: 0, withRpo: 0, rows: 0, events: 0, liqMonths, liqMapped, noSym: 0, notLiquid: 0, ranked: 0, top: 0, bottom: 0 };
let RX = JZ(RPOF, { at: null, c: {} });
{ const todo = CIKS.filter(c => RX.c[c] === undefined);
  if (todo.length && left() > 50 * 60e3 && !local(env.SEC_BASE)) { const zip = RC + '/companyfacts.zip';
    let zipOk = false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); zipOk = fs.statSync(zip).size > 1e8; } catch (e) { log('companyfacts.zip download failed: ' + String(e.message).slice(0, 200)); }
    if (zipOk) { let n = 0; const names = new Set(execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean));
      for (const c of todo) { if (left() < 30 * 60e3) break; const name = 'CIK' + pad(c) + '.json'; if (!names.has(name)) { RX.c[c] = []; continue; }
        try { RX.c[c] = rpoRows(JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString())); } catch (e) { continue; }
        if (++n % 1000 === 0) log('company facts (RPO): ' + n + ' read'); }
      try { fs.unlinkSync(zip); } catch (e) {} RX.at = new Date().toISOString(); fs.writeFileSync(RPOF, zlib.gzipSync(JSON.stringify(RX))); } } }
const REV = [];   // every growth event (reference set for the ranker), with the company
for (const c of CIKS) { const rows = RX.c[c]; if (rows === undefined) continue; RSTAT.looked++; if (!rows.length) continue; RSTAT.withRpo++; RSTAT.rows += rows.length;
  for (const e of rpoEvents(rows)) REV.push({ cik: c, ...e, s: e.g }); }
RSTAT.events = REV.filter(e => e.d >= RPO.eventsFrom && e.d <= D[T - 1]).length;
const RDATA = rpoDataRule({ ...RSTAT, ciks: CIKS.length }); RSTAT.complete = RDATA.ok; RSTAT.ratios = RDATA.ratios; RSTAT.why = RDATA.why;
const rrank = makeRanker(REV), REVENTS = { top: [], bottom: [] };
for (const z of REV) { if (z.d < RPO.eventsFrom) continue; const p = rrank(z.d, z.g), side = sideOf(p); if (p === null) continue; RSTAT.ranked++; if (side !== 'top' && side !== 'bottom') continue;
  const sym = symFor(z.cik, z.d); if (!sym) { RSTAT.noSym++; continue; } const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, T - 1); if (t < 1) continue; if (!liqOn(i, t)) { RSTAT.notLiquid++; continue; }
  RSTAT[side]++; REVENTS[side].push({ t, i, k, d: z.d, p: r4(p), g: z.g, end: z.end, future: k >= T }); }
log('backlog (RPO) data: ' + JSON.stringify(RSTAT));
const rpoSignals = (id) => REVENTS[RULES[id].side].map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of RPO_IDS.filter(x => !FROZEN[x])) { if (!RDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'backlog data rule not met yet: ' + RDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, rpoSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const v = RULES[id].kind === 'avoid' ? avoidVerdict(R) : judge(R, { bar: BAR });
  RES[id] = { ...v, results: R, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: RULES[id].kind, family: 'rpo', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], pct: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5e. IDEA 5: EARNINGS ANNOUNCEMENT TIMING (pre-registered 31 Oct 2026; research-core.mjs IDEA 5) =================
// Data: the same cached 8-K lists as idea 3 (research-cache/isc; acceptance time + items, from 2021-09-01). No new SEC reads for the 5-year test.
const ESTAT = { companies: CIKS.length, subsOk: ISTAT.subsOk, liqMonths, liqMapped, announcements: 0, events: 0, adv: 0, del: 0, noSym: 0, notLiquid: 0, multi: { adv: 0, del: 0 } };
const EEV = { adv: [], del: [] };
for (const c of CIKS) { const L = EK.get(c); if (!L) continue; const anns = eatAnnouncements(L, secNY); ESTAT.announcements += anns.length;
  for (const e of eatEvents(anns)) { if (e.d < EAT.from || e.d > D[T - 1]) continue; ESTAT.events++; if (!e.side) continue;
    const rd = reactionDate(e.accept, secNY); if (!rd) continue; const t = sessOnOrAfter(rd); if (t >= T || t < 1) continue;
    const sym = symFor(c, D[t]); if (!sym) { ESTAT.noSym++; continue; } const i = SY.get(sym); if (!liqOn(i, t)) { ESTAT.notLiquid++; continue; }
    ESTAT[e.side]++; if (e.n > 1) ESTAT.multi[e.side]++; EEV[e.side].push({ t, i, k: t + 1, d: e.d, p: e.shift, prev: e.prev, n: e.n, future: t + 1 >= T }); } }
const EDATA = eatDataRule({ ...ESTAT, ciks: CIKS.length }); ESTAT.complete = EDATA.ok; ESTAT.ratios = EDATA.ratios; ESTAT.why = EDATA.why;
log('earnings timing data: ' + JSON.stringify(ESTAT));
const eatSignals = (id) => EEV[RULES[id].side].map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of EAT_IDS.filter(x => !FROZEN[x])) { if (!EDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'earnings timing data rule not met yet: ' + EDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, eatSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const gross = (a) => a.map(z => ({ ...z, g: z.g + COST })), Rg = RULES[id].kind === 'avoid' ? { older: halfStat(gross(tr.filter(z => z.half === 'older')), hold), newer: halfStat(gross(tr.filter(z => z.half === 'newer')), hold) } : null;
  const v = RULES[id].kind === 'avoid' ? { ...avoidVerdict(Rg), grossEdge: { older: Rg.older.edge ?? null, newer: Rg.newer.edge ?? null }, grossTBlock: { older: Rg.older.tBlock ?? null, newer: Rg.newer.tBlock ?? null } } : judge(R, { bar: BAR });
  const big = tr.filter(z => z.p <= -21 || z.p >= 21), small = tr.filter(z => !(z.p <= -21 || z.p >= 21)), avgN = (a) => a.length ? r4(mean(a.map(z => z.g - COST))) : null, edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null;
  const shiftSplit = { over3weeks: { n: big.length, avgNet: avgN(big), edge: edgeN(big) }, oneToThreeWeeks: { n: small.length, avgNet: avgN(small), edge: edgeN(small) } };
  RES[id] = { ...v, results: R, shiftSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: RULES[id].kind, family: 'eat', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], shift: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(shiftSplit) + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5f. IDEA 6: TAX EXPENSE MOMENTUM (pre-registered 1 Nov 2026; research-core.mjs IDEA 6) =================
// Data: us-gaap:IncomeTaxExpenseBenefit (discrete quarters) + us-gaap:Assets from the official SEC bulk company facts file (companyfacts.zip,
// read once into research-cache/tax.json.gz; only the universe companies, only these two tags). Paper lane: companyconcept JSON (two tags)
// for companies that filed a 10-Q/10-K on a day since the paper start (SEC daily index).
const TAXF = RC + '/tax.json.gz', XSTAT = { companies: CIKS.length, looked: 0, withTax: 0, quarters: 0, events: 0, liqMonths, liqMapped, noSym: 0, notLiquid: 0, ranked: 0, top: 0, bottom: 0, q4: 0 };
let TXC = JZ(TAXF, { at: null, c: {} });
{ const todo = CIKS.filter(c => TXC.c[c] === undefined);
  if (todo.length && left() > 50 * 60e3 && !local(env.SEC_BASE)) { const zip = RC + '/companyfacts.zip';
    let zipOk = false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); zipOk = fs.statSync(zip).size > 1e8; } catch (e) { log('companyfacts.zip download failed (tax): ' + String(e.message).slice(0, 200)); }
    if (zipOk) { let n = 0; const names = new Set(execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean));
      for (const c of todo) { if (left() < 30 * 60e3) break; const name = 'CIK' + pad(c) + '.json'; if (!names.has(name)) { TXC.c[c] = { q: [], a: [] }; continue; }
        try { TXC.c[c] = taxRows(JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString())); } catch (e) { continue; }
        if (++n % 1000 === 0) log('company facts (tax): ' + n + ' read'); }
      try { fs.unlinkSync(zip); } catch (e) {} TXC.at = new Date().toISOString(); fs.writeFileSync(TAXF, zlib.gzipSync(JSON.stringify(TXC))); } } }
const TEVS = [];   // every tax surprise event (reference set for the ranker), with the company
for (const c of CIKS) { const rows = TXC.c[c]; if (rows === undefined) continue; XSTAT.looked++; if (!rows.q.length) continue; XSTAT.withTax++; XSTAT.quarters += rows.q.length;
  for (const e of taxEvents(rows)) TEVS.push({ cik: c, ...e, s: e.g }); }
XSTAT.events = TEVS.filter(e => e.d >= TAX.eventsFrom && e.d <= D[T - 1]).length; XSTAT.q4 = TEVS.filter(e => e.d >= TAX.eventsFrom && e.form === '10-K').length;
const XDATA = taxDataRule({ ...XSTAT, ciks: CIKS.length }); XSTAT.complete = XDATA.ok; XSTAT.ratios = XDATA.ratios; XSTAT.why = XDATA.why;
const xrank = makeRanker(TEVS), XEV = { top: [], bottom: [] };
for (const z of TEVS) { if (z.d < TAX.eventsFrom) continue; const p = xrank(z.d, z.g), side = sideOf(p); if (p === null) continue; XSTAT.ranked++; if (side !== 'top' && side !== 'bottom') continue;
  const sym = symFor(z.cik, z.d); if (!sym) { XSTAT.noSym++; continue; } const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, T - 1); if (t < 1) continue; if (!liqOn(i, t)) { XSTAT.notLiquid++; continue; }
  XSTAT[side]++; XEV[side].push({ t, i, k, d: z.d, p: r4(p), g: z.g, end: z.end, future: k >= T }); }
log('tax surprise data: ' + JSON.stringify(XSTAT));
const taxSignals = (id) => XEV[RULES[id].side].map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of TAX_IDS.filter(x => !FROZEN[x])) { if (!XDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'tax surprise data rule not met yet: ' + XDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, taxSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const gross = (a) => a.map(z => ({ ...z, g: z.g + COST })), Rg = RULES[id].kind === 'avoid' ? { older: halfStat(gross(tr.filter(z => z.half === 'older')), hold), newer: halfStat(gross(tr.filter(z => z.half === 'newer')), hold) } : null;
  const v = RULES[id].kind === 'avoid' ? { ...avoidVerdict(Rg), grossEdge: { older: Rg.older.edge ?? null, newer: Rg.newer.edge ?? null }, grossTBlock: { older: Rg.older.tBlock ?? null, newer: Rg.newer.tBlock ?? null } } : judge(R, { bar: BAR });
  const big = tr.filter(z => z.p >= 0.95 || z.p <= 0.05), rest = tr.filter(z => !(z.p >= 0.95 || z.p <= 0.05)), avgN = (a) => a.length ? r4(mean(a.map(z => z.g - COST))) : null, edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null;
  const tailSplit = { extreme5pct: { n: big.length, avgNet: avgN(big), edge: edgeN(big) }, rest: { n: rest.length, avgNet: avgN(rest), edge: edgeN(rest) } };
  RES[id] = { ...v, results: R, tailSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: RULES[id].kind, family: 'tax', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], pct: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(tailSplit) + (RES[id].grossEdge ? ' | gross edge ' + JSON.stringify(RES[id].grossEdge) + ' t ' + JSON.stringify(RES[id].grossTBlock) : '') + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5g. IDEA 7: R&D INCREASES (pre-registered 2 Nov 2026; research-core.mjs IDEA 7) =================
// Data: us-gaap:ResearchAndDevelopmentExpense (or the ExcludingAcquiredInProcessCost tag) discrete quarters + us-gaap:Assets from the official
// SEC bulk company facts file (companyfacts.zip, read once into research-cache/rdi.json.gz; universe companies only). Paper lane: companyconcept.
const RDIF = RC + '/rdi.json.gz', DSTAT = { companies: CIKS.length, looked: 0, withRd: 0, fallbackTag: 0, quarters: 0, events: 0, qualifying: 0, liqMonths, liqMapped, noSym: 0, notLiquid: 0, signals: 0, q4: 0 };
let RDC = JZ(RDIF, { at: null, c: {} });
{ const todo = CIKS.filter(c => RDC.c[c] === undefined);
  if (todo.length && left() > 50 * 60e3 && !local(env.SEC_BASE)) { const zip = RC + '/companyfacts.zip';
    let zipOk = false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); zipOk = fs.statSync(zip).size > 1e8; } catch (e) { log('companyfacts.zip download failed (rdi): ' + String(e.message).slice(0, 200)); }
    if (zipOk) { let n = 0; const names = new Set(execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean));
      for (const c of todo) { if (left() < 30 * 60e3) break; const name = 'CIK' + pad(c) + '.json'; if (!names.has(name)) { RDC.c[c] = { q: [], a: [], tag: null }; continue; }
        try { RDC.c[c] = rdiRows(JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString())); } catch (e) { continue; }
        if (++n % 1000 === 0) log('company facts (rdi): ' + n + ' read'); }
      try { fs.unlinkSync(zip); } catch (e) {} RDC.at = new Date().toISOString(); fs.writeFileSync(RDIF, zlib.gzipSync(JSON.stringify(RDC))); } } }
const DEVS = [];
for (const c of CIKS) { const rows = RDC.c[c]; if (rows === undefined) continue; DSTAT.looked++; if (!rows.q.length) continue; DSTAT.withRd++; if (rows.tag === RDI.tags[1]) DSTAT.fallbackTag++; DSTAT.quarters += rows.q.length;
  for (const e of rdiEvents(rows)) DEVS.push({ cik: c, ...e }); }
{ const inW = DEVS.filter(e => e.d >= RDI.eventsFrom && e.d <= D[T - 1]); DSTAT.events = inW.length; DSTAT.qualifying = inW.filter(e => e.qualifies).length; DSTAT.q4 = inW.filter(e => e.form === '10-K').length; }
const DDATA = rdiDataRule({ ...DSTAT, ciks: CIKS.length }); DSTAT.complete = DDATA.ok; DSTAT.ratios = DDATA.ratios; DSTAT.why = DDATA.why;
const DEV = [];
for (const z of DEVS) { if (z.d < RDI.eventsFrom || !z.qualifies) continue;
  const sym = symFor(z.cik, z.d); if (!sym) { DSTAT.noSym++; continue; } const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, T - 1); if (t < 1) continue; if (!liqOn(i, t)) { DSTAT.notLiquid++; continue; }
  DSTAT.signals++; DEV.push({ t, i, k, d: z.d, p: z.g, g: z.g, end: z.end, future: k >= T }); }
log('R&D increase data: ' + JSON.stringify(DSTAT));
const rdiSignals = (id) => DEV.map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of RDI_IDS.filter(x => !FROZEN[x])) { if (!DDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'R&D increase data rule not met yet: ' + DDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, rdiSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const v = judge(R, { bar: BAR });
  const big = tr.filter(z => z.p >= 1), rest = tr.filter(z => !(z.p >= 1)), avgN = (a) => a.length ? r4(mean(a.map(z => z.g - COST))) : null, edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null;
  const tailSplit = { rdDoubled: { n: big.length, avgNet: avgN(big), edge: edgeN(big) }, rest: { n: rest.length, avgNet: avgN(rest), edge: edgeN(rest) } };
  RES[id] = { ...v, results: R, tailSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: RULES[id].kind, family: 'rdi', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], rdGrowth: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(tailSplit) + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5h. IDEA 8: INVENTORY CHANGES (pre-registered 3 Nov 2026; research-core.mjs IDEA 8) =================
// Data: us-gaap:InventoryNet + us-gaap:Assets (instants) from the official SEC bulk company facts file (companyfacts.zip, read once into
// research-cache/inv.json.gz; universe companies only). Paper lane: companyconcept JSON (two tags).
const INVF = RC + '/inv.json.gz', VSTAT = { companies: CIKS.length, looked: 0, withInv: 0, balances: 0, events: 0, liqMonths, liqMapped, noSym: 0, notLiquid: 0, ranked: 0, top: 0, bottom: 0, q4: 0 };
let IVC = JZ(INVF, { at: null, c: {} });
{ const todo = CIKS.filter(c => IVC.c[c] === undefined);
  if (todo.length && left() > 50 * 60e3 && !local(env.SEC_BASE)) { const zip = RC + '/companyfacts.zip';
    let zipOk = false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); zipOk = fs.statSync(zip).size > 1e8; } catch (e) { log('companyfacts.zip download failed (inv): ' + String(e.message).slice(0, 200)); }
    if (zipOk) { let n = 0; const names = new Set(execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean));
      for (const c of todo) { if (left() < 30 * 60e3) break; const name = 'CIK' + pad(c) + '.json'; if (!names.has(name)) { IVC.c[c] = { v: [], a: [] }; continue; }
        try { IVC.c[c] = invRows(JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString())); } catch (e) { continue; }
        if (++n % 1000 === 0) log('company facts (inv): ' + n + ' read'); }
      try { fs.unlinkSync(zip); } catch (e) {} IVC.at = new Date().toISOString(); fs.writeFileSync(INVF, zlib.gzipSync(JSON.stringify(IVC))); } } }
const VEVS = [];
for (const c of CIKS) { const rows = IVC.c[c]; if (rows === undefined) continue; VSTAT.looked++; if (!rows.v.length) continue; VSTAT.withInv++; VSTAT.balances += rows.v.length;
  for (const e of invEvents(rows)) VEVS.push({ cik: c, ...e, s: e.g }); }
VSTAT.events = VEVS.filter(e => e.d >= INV.eventsFrom && e.d <= D[T - 1]).length; VSTAT.q4 = VEVS.filter(e => e.d >= INV.eventsFrom && e.form === '10-K').length;
const VDATA = invDataRule({ ...VSTAT, ciks: CIKS.length }); VSTAT.complete = VDATA.ok; VSTAT.ratios = VDATA.ratios; VSTAT.why = VDATA.why;
const vrank = makeRanker(VEVS), VEV = { top: [], bottom: [] };
for (const z of VEVS) { if (z.d < INV.eventsFrom) continue; const p = vrank(z.d, z.g), side = sideOf(p); if (p === null) continue; VSTAT.ranked++; if (side !== 'top' && side !== 'bottom') continue;
  const sym = symFor(z.cik, z.d); if (!sym) { VSTAT.noSym++; continue; } const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, T - 1); if (t < 1) continue; if (!liqOn(i, t)) { VSTAT.notLiquid++; continue; }
  VSTAT[side]++; VEV[side].push({ t, i, k, d: z.d, p: r4(p), g: z.g, end: z.end, future: k >= T }); }
log('inventory change data: ' + JSON.stringify(VSTAT));
const invSignals = (id) => VEV[RULES[id].side].map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of INV_IDS.filter(x => !FROZEN[x])) { if (!VDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'inventory change data rule not met yet: ' + VDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, invSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const gross = (a) => a.map(z => ({ ...z, g: z.g + COST })), Rg = RULES[id].kind === 'avoid' ? { older: halfStat(gross(tr.filter(z => z.half === 'older')), hold), newer: halfStat(gross(tr.filter(z => z.half === 'newer')), hold) } : null;
  const v = RULES[id].kind === 'avoid' ? { ...avoidVerdict(Rg), grossEdge: { older: Rg.older.edge ?? null, newer: Rg.newer.edge ?? null }, grossTBlock: { older: Rg.older.tBlock ?? null, newer: Rg.newer.tBlock ?? null } } : judge(R, { bar: BAR });
  const big = tr.filter(z => z.p >= 0.95 || z.p <= 0.05), rest = tr.filter(z => !(z.p >= 0.95 || z.p <= 0.05)), avgN = (a) => a.length ? r4(mean(a.map(z => z.g - COST))) : null, edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null;
  const tailSplit = { extreme5pct: { n: big.length, avgNet: avgN(big), edge: edgeN(big) }, rest: { n: rest.length, avgNet: avgN(rest), edge: edgeN(rest) } };
  RES[id] = { ...v, results: R, tailSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: RULES[id].kind, family: 'inv', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], pct: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(tailSplit) + (RES[id].grossEdge ? ' | gross edge ' + JSON.stringify(RES[id].grossEdge) + ' t ' + JSON.stringify(RES[id].grossTBlock) : '') + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5i. IDEA 9: GOODWILL IMPAIRMENTS, AVOID / SELL-warning check (pre-registered 4 Nov 2026; research-core.mjs IDEA 9) =================
// Data: us-gaap:GoodwillImpairmentLoss (durations) + us-gaap:Assets from the official SEC bulk company facts file (companyfacts.zip, read
// once into research-cache/gwi.json.gz; universe companies only). Avoid checks only: no paper buy lane.
const GWIF = RC + '/gwi.json.gz', GSTAT = { companies: CIKS.length, looked: 0, withImp: 0, facts: 0, events: 0, liqMonths, liqMapped, noSym: 0, notLiquid: 0, small: 0, big: 0, q4: 0 };
let GWC = JZ(GWIF, { at: null, c: {} });
{ const todo = CIKS.filter(c => GWC.c[c] === undefined);
  if (todo.length && left() > 50 * 60e3 && !local(env.SEC_BASE)) { const zip = RC + '/companyfacts.zip';
    let zipOk = false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); zipOk = fs.statSync(zip).size > 1e8; } catch (e) { log('companyfacts.zip download failed (gwi): ' + String(e.message).slice(0, 200)); }
    if (zipOk) { let n = 0; const names = new Set(execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean));
      for (const c of todo) { if (left() < 30 * 60e3) break; const name = 'CIK' + pad(c) + '.json'; if (!names.has(name)) { GWC.c[c] = { f: [], a: [] }; continue; }
        try { GWC.c[c] = gwiRows(JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString())); } catch (e) { continue; }
        if (++n % 1000 === 0) log('company facts (gwi): ' + n + ' read'); }
      try { fs.unlinkSync(zip); } catch (e) {} GWC.at = new Date().toISOString(); fs.writeFileSync(GWIF, zlib.gzipSync(JSON.stringify(GWC))); } } }
const GEVS = [];
for (const c of CIKS) { const rows = GWC.c[c]; if (rows === undefined) continue; GSTAT.looked++; if (!rows.f.length) continue; GSTAT.withImp++; GSTAT.facts += rows.f.length;
  for (const e of gwiEvents(rows)) GEVS.push({ cik: c, ...e }); }
const gIn = GEVS.filter(e => e.d >= GWI.eventsFrom && e.d <= D[T - 1]);
GSTAT.events = gIn.filter(e => e.s >= GWI.small).length; GSTAT.eventsAny = gIn.length; GSTAT.eventsBig = gIn.filter(e => e.s >= GWI.big).length; GSTAT.q4 = gIn.filter(e => e.form === '10-K' && e.s >= GWI.small).length;
const GDATA = gwiDataRule({ ...GSTAT, ciks: CIKS.length }); GSTAT.complete = GDATA.ok; GSTAT.ratios = GDATA.ratios; GSTAT.why = GDATA.why;
const GEV = [];
for (const z of gIn) { if (!(z.s >= GWI.small)) continue; const sym = symFor(z.cik, z.d); if (!sym) { GSTAT.noSym++; continue; } const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, T - 1); if (t < 1) continue; if (!liqOn(i, t)) { GSTAT.notLiquid++; continue; }
  GSTAT.small++; if (z.s >= GWI.big) GSTAT.big++; GEV.push({ t, i, k, d: z.d, p: z.s, end: z.end, future: k >= T }); }
log('goodwill impairment data: ' + JSON.stringify(GSTAT));
const gwiSignals = (id) => GEV.filter(z => z.p >= RULES[id].min).map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of GWI_IDS.filter(x => !FROZEN[x])) { if (!GDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'goodwill impairment data rule not met yet: ' + GDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, gwiSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const gross = (a) => a.map(z => ({ ...z, g: z.g + COST })), Rg = { older: halfStat(gross(tr.filter(z => z.half === 'older')), hold), newer: halfStat(gross(tr.filter(z => z.half === 'newer')), hold) };
  const v = { ...avoidVerdict(Rg), grossEdge: { older: Rg.older.edge ?? null, newer: Rg.newer.edge ?? null }, grossTBlock: { older: Rg.older.tBlock ?? null, newer: Rg.newer.tBlock ?? null } };
  const big = tr.filter(z => z.p >= GWI.big), rest = tr.filter(z => z.p < GWI.big), edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null, avgG = (a) => a.length ? r4(mean(a.map(z => z.g))) : null;
  const sizeSplit = { big5pct: { n: big.length, avgGross: avgG(big), edge: edgeN(big) }, under5pct: { n: rest.length, avgGross: avgG(rest), edge: edgeN(rest) } };
  RES[id] = { ...v, results: R, sizeSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: 'avoid', family: 'gwi', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions; judged gross vs gross',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], size: z.p, gross: r4(z.g), avgStock: r4(z.c), sameStock: r4(z.own === null || z.own === undefined ? null : z.own) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(sizeSplit) + ' | gross edge ' + JSON.stringify(RES[id].grossEdge) + ' t ' + JSON.stringify(RES[id].grossTBlock) + ' | ' + RES[id].why.slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
// ================= 5f. IDEA 6: GPC EXPENSE MOMENTUM (pre-registered 1 Nov 2026; research-core.mjs IDEA 6) =================
// Data: us-gaap:GrossProfit (discrete quarters) + us-gaap:Assets from the official SEC bulk company facts file (companyfacts.zip,
// read once into research-cache/tax.json.gz; only the universe companies, only these two tags). Paper lane: companyconcept JSON (two tags)
// for companies that filed a 10-Q/10-K on a day since the paper start (SEC daily index).
const GPCF = RC + '/gpc.json.gz', PSTAT = { companies: CIKS.length, looked: 0, withGp: 0, quarters: 0, events: 0, liqMonths, liqMapped, noSym: 0, notLiquid: 0, ranked: 0, top: 0, bottom: 0, q4: 0 };
let PGC = JZ(GPCF, { at: null, c: {} });
{ const todo = CIKS.filter(c => PGC.c[c] === undefined);
  if (todo.length && left() > 50 * 60e3 && !local(env.SEC_BASE)) { const zip = RC + '/companyfacts.zip';
    let zipOk = false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); zipOk = fs.statSync(zip).size > 1e8; } catch (e) { log('companyfacts.zip download failed (gpc): ' + String(e.message).slice(0, 200)); }
    if (zipOk) { let n = 0; const names = new Set(execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean));
      for (const c of todo) { if (left() < 30 * 60e3) break; const name = 'CIK' + pad(c) + '.json'; if (!names.has(name)) { PGC.c[c] = { q: [], a: [] }; continue; }
        try { PGC.c[c] = gpcRows(JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString())); } catch (e) { continue; }
        if (++n % 1000 === 0) log('company facts (gpc): ' + n + ' read'); }
      try { fs.unlinkSync(zip); } catch (e) {} PGC.at = new Date().toISOString(); fs.writeFileSync(GPCF, zlib.gzipSync(JSON.stringify(PGC))); } } }
const PEVS = [];   // every tax surprise event (reference set for the ranker), with the company
for (const c of CIKS) { const rows = PGC.c[c]; if (rows === undefined) continue; PSTAT.looked++; if (!rows.q.length) continue; PSTAT.withGp++; PSTAT.quarters += rows.q.length;
  for (const e of gpcEvents(rows)) PEVS.push({ cik: c, ...e, s: e.g }); }
PSTAT.events = PEVS.filter(e => e.d >= GPC.eventsFrom && e.d <= D[T - 1]).length; PSTAT.q4 = PEVS.filter(e => e.d >= GPC.eventsFrom && e.form === '10-K').length;
const PDATA = gpcDataRule({ ...PSTAT, ciks: CIKS.length }); PSTAT.complete = PDATA.ok; PSTAT.ratios = PDATA.ratios; PSTAT.why = PDATA.why;
const pgrank = makeRanker(PEVS), PEV = { top: [], bottom: [] };
for (const z of PEVS) { if (z.d < GPC.eventsFrom) continue; const p = pgrank(z.d, z.g), side = sideOf(p); if (p === null) continue; PSTAT.ranked++; if (side !== 'top' && side !== 'bottom') continue;
  const sym = symFor(z.cik, z.d); if (!sym) { PSTAT.noSym++; continue; } const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, T - 1); if (t < 1) continue; if (!liqOn(i, t)) { PSTAT.notLiquid++; continue; }
  PSTAT[side]++; PEV[side].push({ t, i, k, d: z.d, p: r4(p), g: z.g, end: z.end, future: k >= T }); }
log('gross profit change data: ' + JSON.stringify(PSTAT));
const gpcSignals = (id) => PEV[RULES[id].side].map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of GPC_IDS.filter(x => !FROZEN[x])) { if (!PDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'gross profit change data rule not met yet: ' + PDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, gpcSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const gross = (a) => a.map(z => ({ ...z, g: z.g + COST })), Rg = RULES[id].kind === 'avoid' ? { older: halfStat(gross(tr.filter(z => z.half === 'older')), hold), newer: halfStat(gross(tr.filter(z => z.half === 'newer')), hold) } : null;
  const v = RULES[id].kind === 'avoid' ? { ...avoidVerdict(Rg), grossEdge: { older: Rg.older.edge ?? null, newer: Rg.newer.edge ?? null }, grossTBlock: { older: Rg.older.tBlock ?? null, newer: Rg.newer.tBlock ?? null } } : judge(R, { bar: BAR });
  const big = tr.filter(z => z.p >= 0.95 || z.p <= 0.05), rest = tr.filter(z => !(z.p >= 0.95 || z.p <= 0.05)), avgN = (a) => a.length ? r4(mean(a.map(z => z.g - COST))) : null, edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null;
  const tailSplit = { extreme5pct: { n: big.length, avgNet: avgN(big), edge: edgeN(big) }, rest: { n: rest.length, avgNet: avgN(rest), edge: edgeN(rest) } };
  RES[id] = { ...v, results: R, tailSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: RULES[id].kind, family: 'gpc', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], pct: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(tailSplit) + (RES[id].grossEdge ? ' | gross edge ' + JSON.stringify(RES[id].grossEdge) + ' t ' + JSON.stringify(RES[id].grossTBlock) : '') + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5k. IDEA 11: DIVIDEND CUTS, AVOID / SELL-warning check (pre-registered 7 Nov 2026; research-core.mjs IDEA 11) =================
// Data: dividend per share (Declared, else CashPaid) + total common dividends from the official SEC bulk company facts file (companyfacts.zip,
// read once into research-cache/dvc.json.gz; universe companies only). Avoid checks only: no paper buy lane.
const DVCF = RC + '/dvc.json.gz', CSTAT = { companies: CIKS.length, looked: 0, payers: 0, quarters: 0, withTotals: 0, events: 0, eventsAll: 0, cutsRaw: 0, guardTotal: 0, guardShape: 0, omissions: 0, liqMonths, liqMapped, noSym: 0, notLiquid: 0, cut: 0, big: 0, q4: 0 };
let CVC = JZ(DVCF, { at: null, c: {} });
{ const todo = CIKS.filter(c => CVC.c[c] === undefined);
  if (todo.length && left() > 50 * 60e3 && !local(env.SEC_BASE)) { const zip = RC + '/companyfacts.zip';
    let zipOk = false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); zipOk = fs.statSync(zip).size > 1e8; } catch (e) { log('companyfacts.zip download failed (dvc): ' + String(e.message).slice(0, 200)); }
    if (zipOk) { let n = 0; const names = new Set(execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean));
      for (const c of todo) { if (left() < 30 * 60e3) break; const name = 'CIK' + pad(c) + '.json'; if (!names.has(name)) { CVC.c[c] = { q: [], t: [] }; continue; }
        try { CVC.c[c] = dvcRows(JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString())); } catch (e) { continue; }
        if (++n % 1000 === 0) log('company facts (dvc): ' + n + ' read'); }
      try { fs.unlinkSync(zip); } catch (e) {} CVC.at = new Date().toISOString(); fs.writeFileSync(DVCF, zlib.gzipSync(JSON.stringify(CVC))); } } }
const CEVS = [];
for (const c of CIKS) { const rows = CVC.c[c]; if (rows === undefined) continue; CSTAT.looked++; if (!rows.q.length) continue; CSTAT.payers++; CSTAT.quarters += rows.q.length; if (rows.t.length) CSTAT.withTotals++;
  for (const e of dvcEvents(rows)) CEVS.push({ cik: c, ...e }); }
const cIn = CEVS.filter(e => e.d >= DVC.eventsFrom && e.d <= D[T - 1]);
CSTAT.eventsAll = cIn.length; CSTAT.cutsRaw = cIn.filter(e => e.ratio <= DVC.cut).length; CSTAT.guardTotal = cIn.filter(e => e.guard === 'total').length; CSTAT.guardShape = cIn.filter(e => e.guard === 'shape').length;
const cCuts = cIn.filter(e => e.ratio <= DVC.cut && !e.guard); CSTAT.events = cCuts.length; CSTAT.omissions = cCuts.filter(e => e.ratio === 0).length; CSTAT.q4 = cCuts.filter(e => e.form === '10-K').length;
const CDATA = dvcDataRule({ ...CSTAT, ciks: CIKS.length }); CSTAT.complete = CDATA.ok; CSTAT.ratios = CDATA.ratios; CSTAT.why = CDATA.why;
const CEV = [];
for (const z of cCuts) { const sym = symFor(z.cik, z.d); if (!sym) { CSTAT.noSym++; continue; } const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, T - 1); if (t < 1) continue; if (!liqOn(i, t)) { CSTAT.notLiquid++; continue; }
  CSTAT.cut++; if (z.ratio <= DVC.big) CSTAT.big++; CEV.push({ t, i, k, d: z.d, p: z.ratio, end: z.end, future: k >= T }); }
log('dividend cut data: ' + JSON.stringify(CSTAT));
const dvcSignals = (id) => CEV.filter(z => z.p <= RULES[id].max).map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of DVC_IDS.filter(x => !FROZEN[x])) { if (!CDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'dividend cut data rule not met yet: ' + CDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, dvcSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const gross = (a) => a.map(z => ({ ...z, g: z.g + COST })), Rg = { older: halfStat(gross(tr.filter(z => z.half === 'older')), hold), newer: halfStat(gross(tr.filter(z => z.half === 'newer')), hold) };
  const v = { ...avoidVerdict(Rg), grossEdge: { older: Rg.older.edge ?? null, newer: Rg.newer.edge ?? null }, grossTBlock: { older: Rg.older.tBlock ?? null, newer: Rg.newer.tBlock ?? null } };
  const om = tr.filter(z => z.p === 0), rest = tr.filter(z => z.p > 0), edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null, avgG = (a) => a.length ? r4(mean(a.map(z => z.g))) : null;
  const sizeSplit = { omitted: { n: om.length, avgGross: avgG(om), edge: edgeN(om) }, cutNotZero: { n: rest.length, avgGross: avgG(rest), edge: edgeN(rest) } };
  RES[id] = { ...v, results: R, sizeSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: 'avoid', family: 'dvc', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions; judged gross vs gross',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], ratio: z.p, gross: r4(z.g), avgStock: r4(z.c), sameStock: r4(z.own === null || z.own === undefined ? null : z.own) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(sizeSplit) + ' | gross edge ' + JSON.stringify(RES[id].grossEdge) + ' t ' + JSON.stringify(RES[id].grossTBlock) + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5l. IDEA 12: DISTRESS RISK (failure probability), AVOID / SELL-warning check (pre-registered 8 Nov 2026; research-core.mjs IDEA 12) =================
// Data: net income, liabilities, equity, cash from the official SEC bulk company facts file (companyfacts.zip, read once into
// research-cache/dst.json.gz; universe companies only) + the price file + data/shares.json.gz cover counts. Avoid checks only: no paper buy lane.
const DSTF = RC + '/dst.json.gz', SSTAT = { companies: CIKS.length, looked: 0, withNI: 0, events: 0, liqMonths, liqMapped, noSym: 0, notLiquid: 0, shortHist: 0, noShares: 0, splitDrop: 0, noMarket: 0, scored: 0, ranked: 0, top5: 0, top10: 0, q4: 0 };
let DSC = JZ(DSTF, { at: null, c: {} });
{ const todo = CIKS.filter(c => DSC.c[c] === undefined);
  if (todo.length && left() > 50 * 60e3 && !local(env.SEC_BASE)) { const zip = RC + '/companyfacts.zip';
    let zipOk = false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); zipOk = fs.statSync(zip).size > 1e8; } catch (e) { log('companyfacts.zip download failed (dst): ' + String(e.message).slice(0, 200)); }
    if (zipOk) { let n = 0; const names = new Set(execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean));
      for (const c of todo) { if (left() < 30 * 60e3) break; const name = 'CIK' + pad(c) + '.json'; if (!names.has(name)) { DSC.c[c] = { n: [], i: {} }; continue; }
        try { DSC.c[c] = dstRows(JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString())); } catch (e) { continue; }
        if (++n % 1000 === 0) log('company facts (dst): ' + n + ' read'); }
      try { fs.unlinkSync(zip); } catch (e) {} DSC.at = new Date().toISOString(); fs.writeFileSync(DSTF, zlib.gzipSync(JSON.stringify(DSC))); } } }
const SEVS = [];
for (const c of CIKS) { const rows = DSC.c[c]; if (rows === undefined) continue; SSTAT.looked++; if (!rows.n.length) continue; SSTAT.withNI++;
  for (const e of dstEvents(rows)) SEVS.push({ cik: c, ...e }); }
const SPYC = spyI === undefined ? null : C.subarray(spyI * T, spyI * T + T), SCORED = [];
for (const z of SEVS) { if (z.d < DST.eventsFrom || z.d > D[T - 1]) continue; SSTAT.events++; const sym = symFor(z.cik, z.d); if (!sym) { SSTAT.noSym++; continue; }
  const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, T - 1); if (t < 1) continue; if (!liqOn(i, t)) { SSTAT.notLiquid++; continue; } if (t < DST.minHist) { SSTAT.shortHist++; continue; }
  const shr = dstShares(SH.c[z.cik], D[t]); if (!shr) { SSTAT.noShares++; continue; } if (shr.split) { SSTAT.splitDrop++; continue; }
  const px = C[i * T + t], spy = SPYC ? SPYC[t] : null, mk = SPYC ? dstMarket(C.subarray(i * T, i * T + T), SPYC, t) : { exret: null, sigma: null };
  const sc = dstScore({ ni: z.ni, tl: z.tl, be: z.be, cash: z.cash, me: px * shr.sh, exret: mk.exret, sigma: mk.sigma, price: px, spy }); if (!sc) { SSTAT.noMarket++; continue; }
  SSTAT.scored++; if (z.form === '10-K') SSTAT.q4++; SCORED.push({ t, i, k, d: z.d, s: sc.lp, parts: sc.parts, end: z.end, future: k >= T }); }
const drank = makeRanker(SCORED), SDEV = [];
for (const z of SCORED) { const p = drank(z.d, z.s); if (p === null) continue; SSTAT.ranked++; if (p >= 0.90) SSTAT.top10++; if (p >= 0.95) SSTAT.top5++; if (p >= 0.90) SDEV.push({ ...z, p: r4(p) }); }
const SDATA = dstDataRule({ ...SSTAT, ciks: CIKS.length, scored: SSTAT.scored, top: SSTAT.top5 }); SSTAT.complete = SDATA.ok; SSTAT.ratios = SDATA.ratios; SSTAT.why = SDATA.why;
log('distress data: ' + JSON.stringify(SSTAT));
const dstSignals = (id) => SDEV.filter(z => z.p >= RULES[id].min).map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of DST_IDS.filter(x => !FROZEN[x])) { if (!SDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'distress data rule not met yet: ' + SDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, dstSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const gross = (a) => a.map(z => ({ ...z, g: z.g + COST })), Rg = { older: halfStat(gross(tr.filter(z => z.half === 'older')), hold), newer: halfStat(gross(tr.filter(z => z.half === 'newer')), hold) };
  const v = { ...avoidVerdict(Rg), grossEdge: { older: Rg.older.edge ?? null, newer: Rg.newer.edge ?? null }, grossTBlock: { older: Rg.older.tBlock ?? null, newer: Rg.newer.tBlock ?? null } };
  const edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null, avgG = (a) => a.length ? r4(mean(a.map(z => z.g))) : null, lo = tr.filter(z => C[z.i * T + z.t] < 15), hi = tr.filter(z => !(C[z.i * T + z.t] < 15));
  const priceSplit = { under15: { n: lo.length, avgGross: avgG(lo), edge: edgeN(lo) }, from15: { n: hi.length, avgGross: avgG(hi), edge: edgeN(hi) } };
  RES[id] = { ...v, results: R, priceSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: 'avoid', family: 'dst', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions; judged gross vs gross',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], pct: z.p, gross: r4(z.g), avgStock: r4(z.c), sameStock: r4(z.own === null || z.own === undefined ? null : z.own) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(priceSplit) + ' | gross edge ' + JSON.stringify(RES[id].grossEdge) + ' t ' + JSON.stringify(RES[id].grossTBlock) + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5m. IDEA 13: ORGANIZATION CAPITAL (pre-registered 9 Nov 2026; research-core.mjs IDEA 13) =================
// Data: annual us-gaap:SellingGeneralAndAdministrativeExpense (10-K) + us-gaap:Assets from the official SEC bulk company facts file
// (companyfacts.zip, read once into research-cache/oc.json.gz; universe companies only). Paper lane: companyconcept JSON (two tags) for
// companies that filed a 10-K on a day since the paper start (SEC daily index).
const OCF = RC + '/oc.json.gz', OSTAT = { companies: CIKS.length, looked: 0, withSga: 0, years: 0, events: 0, liqMonths, liqMapped, noSym: 0, notLiquid: 0, ranked: 0, top: 0, medianYears: null };
let OCC = JZ(OCF, { at: null, c: {} });
{ const todo = CIKS.filter(c => OCC.c[c] === undefined);
  if (todo.length && left() > 50 * 60e3 && !local(env.SEC_BASE)) { const zip = RC + '/companyfacts.zip';
    let zipOk = false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); zipOk = fs.statSync(zip).size > 1e8; } catch (e) { log('companyfacts.zip download failed (oc): ' + String(e.message).slice(0, 200)); }
    if (zipOk) { let n = 0; const names = new Set(execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean));
      for (const c of todo) { if (left() < 30 * 60e3) break; const name = 'CIK' + pad(c) + '.json'; if (!names.has(name)) { OCC.c[c] = { y: [], a: [] }; continue; }
        try { OCC.c[c] = ocRows(JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString())); } catch (e) { continue; }
        if (++n % 1000 === 0) log('company facts (oc): ' + n + ' read'); }
      try { fs.unlinkSync(zip); } catch (e) {} OCC.at = new Date().toISOString(); fs.writeFileSync(OCF, zlib.gzipSync(JSON.stringify(OCC))); } } }
const OEVS = [];   // every organization capital event (reference set for the ranker), with the company
for (const c of CIKS) { const rows = OCC.c[c]; if (rows === undefined) continue; OSTAT.looked++; if (!rows.y.length) continue; OSTAT.withSga++; OSTAT.years += rows.y.length;
  for (const e of ocEvents(rows)) OEVS.push({ cik: c, ...e, s: e.g }); }
{ const inW = OEVS.filter(e => e.d >= OC.eventsFrom && e.d <= D[T - 1]); OSTAT.events = inW.length; const ys = inW.map(e => e.years).sort((p, q) => p - q); OSTAT.medianYears = ys.length ? ys[ys.length >> 1] : null; }
const ODATA = ocDataRule({ ...OSTAT, ciks: CIKS.length }); OSTAT.complete = ODATA.ok; OSTAT.ratios = ODATA.ratios; OSTAT.why = ODATA.why;
const ocrank = makeRanker(OEVS), OEV = { top: [] };
for (const z of OEVS) { if (z.d < OC.eventsFrom) continue; const p = ocrank(z.d, z.g), side = sideOf(p); if (p === null) continue; OSTAT.ranked++; if (side !== 'top') continue;
  const sym = symFor(z.cik, z.d); if (!sym) { OSTAT.noSym++; continue; } const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, T - 1); if (t < 1) continue; if (!liqOn(i, t)) { OSTAT.notLiquid++; continue; }
  OSTAT.top++; OEV.top.push({ t, i, k, d: z.d, p: r4(p), g: z.g, end: z.end, future: k >= T }); }
log('organization capital data: ' + JSON.stringify(OSTAT));
const ocSignals = (id) => OEV.top.map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of OC_IDS.filter(x => !FROZEN[x])) { if (!ODATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'organization capital data rule not met yet: ' + ODATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, ocSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const v = judge(R, { bar: BAR });
  const big = tr.filter(z => z.p >= 0.95), rest = tr.filter(z => !(z.p >= 0.95)), avgN = (a) => a.length ? r4(mean(a.map(z => z.g - COST))) : null, edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null;
  const tailSplit = { top5pct: { n: big.length, avgNet: avgN(big), edge: edgeN(big) }, rest: { n: rest.length, avgNet: avgN(rest), edge: edgeN(rest) } };
  RES[id] = { ...v, results: R, tailSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: 'buy', family: 'oc', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], pct: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(tailSplit) + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5n. IDEA 14: WIKIPEDIA ATTENTION (pre-registered 10 Nov 2026; research-core.mjs IDEA 14) =================
// Data: Wikidata Query Service (every item with SEC CIK P5531 and its English Wikipedia article; research-cache/wiki-map.json, refreshed
// every 30 days) + Wikimedia Pageviews REST API per article (agent=user, daily, from 2021-07-01; research-cache/wiki.json.gz, extended each run).
// Official, free, no key; descriptive User-Agent with the repo link (no personal contact sent). Paper lane: the same refreshed series.
const WUA = 'stock-2-research/1.0 (https://github.com/drrazaq/Stock-2; daily researcher)', WQS = local(env.WQS_BASE) || 'https://query.wikidata.org', WPV = local(env.WPV_BASE) || 'https://wikimedia.org';
const WSTAT = { companies: CIKS.length, wikidataItems: 0, dupCiks: 0, articles: 0, answered: 0, withViews: 0, fetchedNow: 0, failed: 0, months: 0, monthSignals: 0, spikes: 0, spikeSignals: 0, noSym: 0, notLiquid: 0, mapAt: null };
let wReq = 0; async function wget(url) { for (let a = 0; a < 4; a++) { if (wReq++) await sleep(local(env.WPV_BASE) ? 0 : 40);
    try { const r = await fetch(url, { headers: { 'User-Agent': WUA, Accept: 'application/json' }, signal: AbortSignal.timeout(120000) }); if (r.status === 404) return null;
      if (r.status === 429 || r.status >= 500) { await sleep(5000 * (a + 1)); continue; } if (!r.ok) return undefined; return await r.json(); } catch (e) { await sleep(2000 * (a + 1)); } } return undefined; }
let WMAP = J(RC + '/wiki-map.json', null);
if ((!WMAP || !WMAP.at || Date.now() - Date.parse(WMAP.at) > 30 * 864e5) && left() > 40 * 60e3) { const j = await wget(WQS + '/sparql?format=json&query=' + encodeURIComponent(WIKI_SPARQL));
  if (j) { const m = wikiMap(j); WMAP = { at: new Date().toISOString(), map: m.map, items: m.items, dupCiks: m.dupCiks }; W(RC + '/wiki-map.json', WMAP); } else log('wikidata query failed'); }
WMAP = WMAP || { map: {} }; WSTAT.mapAt = WMAP.at || null; WSTAT.wikidataItems = WMAP.items || 0; WSTAT.dupCiks = WMAP.dupCiks || 0;
const WCIKS = CIKS.filter(c => WMAP.map[c]); WSTAT.articles = WCIKS.length;
const WC = JZ(RC + '/wiki.json.gz', { c: {} }), yday = iso(Date.now() - 864e5), ymd = (d) => d.replace(/-/g, '');
for (const c of WCIKS) { if (left() < 40 * 60e3) break; const title = WMAP.map[c]; let e = WC.c[c]; if (e && e.t !== title) e = null;
  const from = e && e.s ? addDays(wikiEnd(e.s), 1) : WIKI.from; if (e && (e.none || from > yday) && (!e.none || Date.now() - Date.parse(e.at) < 30 * 864e5)) continue;
  const j = await wget(WPV + '/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/' + encodeURIComponent(title) + '/daily/' + ymd(from) + '00/' + ymd(yday) + '00'); WSTAT.fetchedNow++;
  if (j === undefined) { WSTAT.failed++; continue; } const s = j === null ? null : wikiSeries(j, from);
  WC.c[c] = e && e.s ? { t: title, at: new Date().toISOString(), s: s ? wikiAppend(e.s, s) : e.s } : (s ? { t: title, at: new Date().toISOString(), s } : { t: title, at: new Date().toISOString(), none: true });
  if (WSTAT.fetchedNow % 500 === 0) log('page views: ' + WSTAT.fetchedNow + ' articles fetched'); }
if (WSTAT.fetchedNow) fs.writeFileSync(RC + '/wiki.json.gz', zlib.gzipSync(JSON.stringify(WC)));
for (const c of WCIKS) { const e = WC.c[c]; if (!e || e.t !== WMAP.map[c]) continue; WSTAT.answered++; if (e.s) WSTAT.withViews++; }
// monthly cross-sections: the first session of each month (and the next session when it opens a new month: a future paper signal)
const WEV = { month: [], spike: [] }; { const starts = FORM_M.filter(t => D[t] >= WIKI.signalFrom).map(t => ({ k: t, d: D[t] })); const nx = nextSession(D[T - 1]); if (nx.slice(0, 7) !== D[T - 1].slice(0, 7)) starts.push({ k: T, d: nx });
  for (const st of starts) { const t = Math.min(st.k - 1, T - 1), ym = st.d.slice(0, 7), list = [], seen = new Set();
    for (const c of WCIKS) { const e = WC.c[c]; if (!e || !e.s) continue; const sym = symFor(c, st.d); if (!sym || seen.has(sym)) continue; const i = SY.get(sym); if (!liqOn(i, t)) continue; const s = wikiScore(e.s, ym); if (s === null) continue; seen.add(sym); list.push({ key: sym, s, i }); }
    const R = wikiRank(list); if (!R.size) continue; WSTAT.months++;
    for (const x of list) { const p = R.get(x.key); if (!(p >= WIKI.top)) continue; WSTAT.monthSignals++; WEV.month.push({ t, i: x.i, k: st.k, d: st.d, p: r4(p), score: r4(x.s), future: st.k >= T }); } } }
for (const c of WCIKS) { const e = WC.c[c]; if (!e || !e.s) continue;
  for (const z of wikiSpikes(e.s, WIKI.signalFrom)) { WSTAT.spikes++; const sym = symFor(c, z.d); if (!sym) { WSTAT.noSym++; continue; } const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, T - 1); if (t < 1) continue;
    if (!liqOn(i, t)) { WSTAT.notLiquid++; continue; } WSTAT.spikeSignals++; WEV.spike.push({ t, i, k, d: z.d, p: z.ratio, base: z.base, future: k >= T }); } }
const WDATA = wikiDataRule({ articles: WSTAT.articles, answered: WSTAT.answered, months: WSTAT.months, spikes: WSTAT.spikes }); WSTAT.complete = WDATA.ok; WSTAT.ratios = WDATA.ratios; WSTAT.why = WDATA.why;
log('wikipedia attention data: ' + JSON.stringify(WSTAT));
const wikiSignals = (id) => (RULES[id].side === 'spike' ? WEV.spike : WEV.month).map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of WIKI_IDS.filter(x => !FROZEN[x])) { if (!WDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'wikipedia attention data rule not met yet: ' + WDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, wikiSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const v = judge(R, { bar: BAR }), edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null, avgN = (a) => a.length ? r4(mean(a.map(z => z.g - COST))) : null;
  const jump = tr.filter(z => { const c0 = C[z.i * T + z.t], c1 = C[z.i * T + z.t - 1]; return c0 > 0 && c1 > 0 && Math.abs(c0 / c1 - 1) >= 0.05; }), calm = tr.filter(z => !jump.includes(z));
  const moveSplit = { priceMove5pct: { n: jump.length, avgNet: avgN(jump), edge: edgeN(jump) }, calm: { n: calm.length, avgNet: avgN(calm), edge: edgeN(calm) } };
  RES[id] = { ...v, results: R, moveSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: 'buy', family: 'wiki', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], pct: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(moveSplit) + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5o. IDEA 15: FINRA DAILY SHORT SALE VOLUME (pre-registered 11 Nov 2026; research-core.mjs IDEA 15) =================
// Data: FINRA Reg SHO consolidated daily short sale volume files (official, free, no key; cdn.finra.org), one per session from 2021-07-01,
// cached in research-cache/svol.json.gz as { d: { date: { SYM: ratio } } } for stocks LIQUID that session only (extended each run).
const SVF = RC + '/svol.json.gz', FB = local(env.FINRA_BASE), SVC = JZ(SVF, { d: {}, miss: {} });
const VSTAT2 = { sessions: 0, files: 0, fetchedNow: 0, missingNow: 0, liqRows: 0, liqWithRow: 0, weeks: 0, low: 0, high: 0, lowP: 0, crossMin: null, crossMax: null };
{ const todo = D.filter(d => d >= SVOL.from && !SVC.d[d] && !(SVC.miss[d] && Date.now() - Date.parse(SVC.miss[d]) < 3 * 864e5)); let q = 0;
  const one = async (d) => { const url = FB ? FB + '/CNMSshvol' + d.replace(/-/g, '') + '.txt' : svolUrl(d), t = tOf.get(d);
    for (let a = 0; a < 4; a++) { let r; try { r = await fetch(url, { headers: { 'User-Agent': 'stock-2-research/1.0 (https://github.com/drrazaq/Stock-2; daily researcher)' }, signal: AbortSignal.timeout(90000) }); } catch (e) { await sleep(2000 * (a + 1)); continue; }
      if (r.status === 403 || r.status === 404) { SVC.miss[d] = new Date().toISOString(); VSTAT2.missingNow++; return; } if (!r.ok) { await sleep(3000 * (a + 1)); continue; }
      const m = svolParse(await r.text()), o = {}; if (!m.size) { SVC.miss[d] = new Date().toISOString(); VSTAT2.missingNow++; return; }
      for (const [s, x] of m) { const i = SY.get(s); if (i !== undefined && LIQ[i * T + t]) o[s] = Math.round(x * 1e4) / 1e4; }
      SVC.d[d] = o; delete SVC.miss[d]; VSTAT2.fetchedNow++; return; } };
  const workers = Array.from({ length: 6 }, async () => { while (q < todo.length && left() > 30 * 60e3) { const d = todo[q++]; await one(d); } });
  await Promise.all(workers); if (VSTAT2.fetchedNow || VSTAT2.missingNow) fs.writeFileSync(SVF, zlib.gzipSync(JSON.stringify(SVC)));
  log('finra short volume files: ' + todo.length + ' to read, ' + VSTAT2.fetchedNow + ' read now, ' + VSTAT2.missingNow + ' missing'); }
const SVR = new Float32Array(N).fill(NaN); for (let t = 0; t < T; t++) { const o = SVC.d[D[t]]; if (!o) continue; for (const s in o) { const i = SY.get(s); if (i !== undefined) SVR[i * T + t] = o[s]; } }
for (let t = 0; t < T; t++) { if (D[t] < SVOL.from) continue; VSTAT2.sessions++; if (SVC.d[D[t]]) VSTAT2.files++; if (D[t] < SVOL.signalFrom) continue;
  for (const i of liqList(t)) { VSTAT2.liqRows++; if (SVR[i * T + t] >= 0) VSTAT2.liqWithRow++; } }
const SVEV = { short: { low: [], high: [] }, long: { low: [] } };
{ const ks = weekStarts(D).filter(k => D[k] >= SVOL.signalFrom); const nx = nextSession(D[T - 1]); if (weekStarts([D[T - 1], nx]).length) ks.push(T);
  for (const k of ks) { const t = Math.min(k - 1, T - 1), d = k < T ? D[k] : nextSession(D[T - 1]), Ls = [], Ll = [];
    for (const i of liqList(t)) { const get = (u) => { const r = SVR[i * T + u]; return r >= 0 ? r : null; };
      const a = svolScore(get, k, SVOL.short, SVOL.shortMin); if (a !== null) Ls.push({ key: i, s: a, i }); const b = svolScore(get, k, SVOL.long, SVOL.longMin); if (b !== null) Ll.push({ key: i, s: b, i }); }
    const Rs = svolRank(Ls), Rl = svolRank(Ll); if (!Rs.size) continue; VSTAT2.weeks++; VSTAT2.crossMin = Math.min(VSTAT2.crossMin ?? 1e9, Rs.size); VSTAT2.crossMax = Math.max(VSTAT2.crossMax ?? 0, Rs.size);
    for (const x of Ls) { const p = Rs.get(x.key), side = svolSide(p); if (!side) continue; VSTAT2[side]++; SVEV.short[side].push({ t, i: x.i, k, d, p: r4(p), score: r4(x.s), future: k >= T }); }
    for (const x of Ll) { const p = Rl.get(x.key); if (svolSide(p) !== 'low') continue; VSTAT2.lowP++; SVEV.long.low.push({ t, i: x.i, k, d, p: r4(p), score: r4(x.s), future: k >= T }); } } }
const SVDATA = svolDataRule(VSTAT2); VSTAT2.complete = SVDATA.ok; VSTAT2.ratios = SVDATA.ratios; VSTAT2.why = SVDATA.why;
log('finra short volume data: ' + JSON.stringify(VSTAT2));
const svolSignals = (id) => SVEV[RULES[id].win][RULES[id].side].map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of SVOL_IDS.filter(x => !FROZEN[x])) { if (!SVDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'finra short volume data rule not met yet: ' + SVDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, svolSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const gross = (a) => a.map(z => ({ ...z, g: z.g + COST })), Rg = RULES[id].kind === 'avoid' ? { older: halfStat(gross(tr.filter(z => z.half === 'older')), hold), newer: halfStat(gross(tr.filter(z => z.half === 'newer')), hold) } : null;
  const v = RULES[id].kind === 'avoid' ? { ...avoidVerdict(Rg), grossEdge: { older: Rg.older.edge ?? null, newer: Rg.newer.edge ?? null }, grossTBlock: { older: Rg.older.tBlock ?? null, newer: Rg.newer.tBlock ?? null } } : judge(R, { bar: BAR });
  const ext = tr.filter(z => z.p <= 0.05 || z.p >= 0.95), rest = tr.filter(z => !(z.p <= 0.05 || z.p >= 0.95)), avgN = (a) => a.length ? r4(mean(a.map(z => z.g - COST))) : null, edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null;
  const tailSplit = { extreme5pct: { n: ext.length, avgNet: avgN(ext), edge: edgeN(ext) }, rest: { n: rest.length, avgNet: avgN(rest), edge: edgeN(rest) } };
  RES[id] = { ...v, results: R, tailSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: RULES[id].kind, family: 'svol', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], pct: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(tailSplit) + (RES[id].grossEdge ? ' | gross edge ' + JSON.stringify(RES[id].grossEdge) + ' t ' + JSON.stringify(RES[id].grossTBlock) : '') + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5p. IDEA 16: PRE-EARNINGS RUN-UP OF PAST WINNERS (pre-registered 12 Nov 2026; research-core.mjs IDEA 16) =================
// Data: the same cached 8-K lists as ideas 3 and 5 (item 2.02 announcements) + the price cache (12-month returns). No new reads.
const PSTAT2 = { companies: CIKS.length, subsOk: ISTAT.subsOk, liqMonths, liqMapped, announcements: 0, inWindow: 0, ranked: 0, noSym: 0, notLiquid: 0, noMom: 0, rankDays: 0, crossMin: null, crossMax: null, w1: 0, w10: 0 };
const PWV = { pre: [], post: [] }, pxOf = (i) => (u) => { const a = C[i * T + u]; if (a > 0) return a; const b = CX[i * T + u]; return b > 0 ? b : null; }, prMemo = new Map();
const preRankAt = (t) => { if (prMemo.has(t)) return prMemo.get(t); const L = []; for (const i of liqList(t)) { const m = preMom(pxOf(i), t); if (m !== null && isFinite(m)) L.push({ key: i, s: m }); }
  const R = preRank(L); if (R.size) { PSTAT2.rankDays++; PSTAT2.crossMin = Math.min(PSTAT2.crossMin ?? 1e9, R.size); PSTAT2.crossMax = Math.max(PSTAT2.crossMax ?? 0, R.size); } prMemo.set(t, R); return R; };
for (const c of CIKS) { const L = EK.get(c); if (!L) continue; const anns = eatAnnouncements(L, secNY); PSTAT2.announcements += anns.length;
  for (const a of anns) { if (a.d < PRE.from || a.d > D[T - 1]) continue; const rd = reactionDate(a.accept, secNY); if (!rd) continue; const r = sessOnOrAfter(rd); if (r >= T) continue;
    const w = preWindow(r, 'pre', T); if (!w) continue; PSTAT2.inWindow++; const sym = symFor(c, D[w.t]); if (!sym) { PSTAT2.noSym++; continue; } const i = SY.get(sym); if (i === undefined || !liqOn(i, w.t)) { PSTAT2.notLiquid++; continue; }
    const R = preRankAt(w.t); if (!R.size) continue; const p = R.get(i); if (p === undefined) { PSTAT2.noMom++; continue; } PSTAT2.ranked++; if (p < PRE.w10) continue; if (p >= PRE.w1) PSTAT2.w1++; PSTAT2.w10++;
    PWV.pre.push({ t: w.t, i, k: w.k, x: w.x, d: a.d, p: r4(p), r }); const q = preWindow(r, 'post', T); PWV.post.push({ t: q.t, i, k: q.k, x: q.x, d: a.d, p: r4(p), r, future: !!q.future }); } }
const PRDATA = preDataRule({ ...PSTAT2, ciks: CIKS.length }); PSTAT2.complete = PRDATA.ok; PSTAT2.ratios = PRDATA.ratios; PSTAT2.why = PRDATA.why;
log('pre-earnings winners data: ' + JSON.stringify(PSTAT2));
const preSignals = (id) => PWV[RULES[id].side].filter(z => z.p >= RULES[id].cut);
for (const id of PRE_IDS.filter(x => !FROZEN[x])) { if (!PRDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'pre-earnings data rule not met yet: ' + PRDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, preSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const gross = (a) => a.map(z => ({ ...z, g: z.g + COST })), Rg = RULES[id].kind === 'avoid' ? { older: halfStat(gross(tr.filter(z => z.half === 'older')), hold), newer: halfStat(gross(tr.filter(z => z.half === 'newer')), hold) } : null;
  const v = RULES[id].kind === 'avoid' ? { ...avoidVerdict(Rg), grossEdge: { older: Rg.older.edge ?? null, newer: Rg.newer.edge ?? null }, grossTBlock: { older: Rg.older.tBlock ?? null, newer: Rg.newer.tBlock ?? null } } : judge(R, { bar: BAR });
  const top = tr.filter(z => z.p >= 0.995), rest = tr.filter(z => z.p < 0.995), avgN = (a) => a.length ? r4(mean(a.map(z => z.g - COST))) : null, edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null;
  const tailSplit = {}; tailSplit.top05pct = { n: top.length, avgNet: avgN(top), edge: edgeN(top) }; tailSplit.rest = { n: rest.length, avgNet: avgN(rest), edge: edgeN(rest) };
  RES[id] = { ...v, results: R, tailSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: RULES[id].kind, family: 'pre', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], pct: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(tailSplit) + (RES[id].grossEdge ? ' | gross edge ' + JSON.stringify(RES[id].grossEdge) + ' t ' + JSON.stringify(RES[id].grossTBlock) : '') + ' | ' + RES[id].why.slice(0, 300)); }
// ================= 5q. IDEA 17: STOCK-BASED COMPENSATION INTENSITY (pre-registered 14 Nov 2026; research-core.mjs IDEA 17) =================
// Data: annual us-gaap SBC (ShareBasedCompensation, else AllocatedShareBasedCompensationExpense) + annual sales tags from the official SEC
// bulk company facts file (companyfacts.zip, read once into research-cache/sbc.json.gz; universe companies only). No paper lane at first.
const SBCF = RC + '/sbc.json.gz', BSTAT = { companies: CIKS.length, looked: 0, withSbc: 0, years: 0, events: 0, liqMonths, liqMapped, noSym: 0, notLiquid: 0, ranked: 0, top: 0, bottom: 0, zeroSbc: 0, medianScore: null };
let SBCC = JZ(SBCF, { at: null, c: {} });
{ const todo = CIKS.filter(c => SBCC.c[c] === undefined);
  if (todo.length && left() > 50 * 60e3 && !local(env.SEC_BASE)) { const zip = RC + '/companyfacts.zip';
    let zipOk = false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip'], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); zipOk = fs.statSync(zip).size > 1e8; } catch (e) { log('companyfacts.zip download failed (sbc): ' + String(e.message).slice(0, 200)); }
    if (zipOk) { let n = 0; const names = new Set(execFileSync('unzip', ['-Z1', zip], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean));
      for (const c of todo) { if (left() < 30 * 60e3) break; const name = 'CIK' + pad(c) + '.json'; if (!names.has(name)) { SBCC.c[c] = { s: [], r: [] }; continue; }
        try { SBCC.c[c] = sbcRows(JSON.parse(execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'ignore'] }).toString())); } catch (e) { continue; }
        if (++n % 1000 === 0) log('company facts (sbc): ' + n + ' read'); }
      try { fs.unlinkSync(zip); } catch (e) {} SBCC.at = new Date().toISOString(); fs.writeFileSync(SBCF, zlib.gzipSync(JSON.stringify(SBCC))); } } }
const BEVS = [];   // every SBC intensity event (reference set for the ranker), with the company
for (const c of CIKS) { const rows = SBCC.c[c]; if (rows === undefined) continue; BSTAT.looked++; if (!rows.s.length) continue; BSTAT.withSbc++; BSTAT.years += rows.s.length;
  for (const e of sbcEvents(rows)) BEVS.push({ cik: c, ...e, s: e.g }); }
{ const inW = BEVS.filter(e => e.d >= SBC.eventsFrom && e.d <= D[T - 1]); BSTAT.events = inW.length; BSTAT.zeroSbc = inW.filter(e => e.g === 0).length;
  const gs = inW.map(e => e.g).sort((p, q) => p - q); BSTAT.medianScore = gs.length ? gs[gs.length >> 1] : null; }
const BDATA = sbcDataRule({ ...BSTAT, ciks: CIKS.length }); BSTAT.complete = BDATA.ok; BSTAT.ratios = BDATA.ratios; BSTAT.why = BDATA.why;
const sbrank = makeRanker(BEVS), BEV = { top: [], bottom: [] };
for (const z of BEVS) { if (z.d < SBC.eventsFrom) continue; const p = sbrank(z.d, z.g), side = sideOf(p); if (p === null) continue; BSTAT.ranked++; if (side !== 'top' && side !== 'bottom') continue;
  const sym = symFor(z.cik, z.d); if (!sym) { BSTAT.noSym++; continue; } const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, T - 1); if (t < 1) continue; if (!liqOn(i, t)) { BSTAT.notLiquid++; continue; }
  BSTAT[side]++; BEV[side].push({ t, i, k, d: z.d, p: r4(p), g: z.g, end: z.end, future: k >= T }); }
log('SBC intensity data: ' + JSON.stringify(BSTAT));
const sbcSignals = (id) => BEV[RULES[id].side].map(z => ({ ...z, x: z.k + H(id) - 1 }));
for (const id of SBC_IDS.filter(x => !FROZEN[x])) { if (!BDATA.ok) { RES[id] = { verdict: 'NOT RUN', why: 'SBC intensity data rule not met yet: ' + BDATA.why }; continue; } if (left() < 6 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  const tr = tradesOf(id, sbcSignals(id)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const gross = (a) => a.map(z => ({ ...z, g: z.g + COST })), Rg = RULES[id].kind === 'avoid' ? { older: halfStat(gross(tr.filter(z => z.half === 'older')), hold), newer: halfStat(gross(tr.filter(z => z.half === 'newer')), hold) } : null;
  const v = RULES[id].kind === 'avoid' ? { ...avoidVerdict(Rg), grossEdge: { older: Rg.older.edge ?? null, newer: Rg.newer.edge ?? null }, grossTBlock: { older: Rg.older.tBlock ?? null, newer: Rg.newer.tBlock ?? null } } : judge(R, { bar: BAR });
  const avgN = (a) => a.length ? r4(mean(a.map(z => z.g - COST))) : null, edgeN = (a) => a.length ? r4(mean(a.map(z => z.g - z.c))) : null;
  // zero-SBC split: taken from the signal list (z.g on a trade is its gross return)
  const zs = new Set(BEV[RULES[id].side].filter(z => z.g === 0).map(z => z.i + '|' + z.k)), zt = tr.filter(z => zs.has(z.i + '|' + z.k)), nt = tr.filter(z => !zs.has(z.i + '|' + z.k));
  const tailSplit = { zeroSbc: { n: zt.length, avgNet: avgN(zt), edge: edgeN(zt) }, rest: { n: nt.length, avgNet: avgN(nt), edge: edgeN(nt) } };
  RES[id] = { ...v, results: R, tailSplit, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: RULES[id].kind, family: 'sbc', name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1); the average liquid stock over the same entry-to-exit sessions' + (RULES[id].kind === 'avoid' ? '; judged gross vs gross' : ''),
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], pct: z.p, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + JSON.stringify(tailSplit) + (RES[id].grossEdge ? ' | gross edge ' + JSON.stringify(RES[id].grossEdge) + ' t ' + JSON.stringify(RES[id].grossTBlock) : '') + ' | ' + RES[id].why.slice(0, 300)); }
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, data: RULES[k].family === 'tender' ? { ...TSTAT } : RULES[k].family === 'isc' ? { ...ISTAT } : RULES[k].family === 'rpo' ? { ...RSTAT } : RULES[k].family === 'eat' ? { ...ESTAT, multi: { ...ESTAT.multi } } : RULES[k].family === 'tax' ? { ...XSTAT } : RULES[k].family === 'rdi' ? { ...DSTAT } : RULES[k].family === 'inv' ? { ...VSTAT } : RULES[k].family === 'gwi' ? { ...GSTAT } : RULES[k].family === 'gpc' ? { ...PSTAT } : RULES[k].family === 'dvc' ? { ...CSTAT } : RULES[k].family === 'dst' ? { ...SSTAT } : RULES[k].family === 'oc' ? { ...OSTAT } : RULES[k].family === 'wiki' ? { ...WSTAT } : RULES[k].family === 'svol' ? { ...VSTAT2 } : RULES[k].family === 'pre' ? { ...PSTAT2 } : RULES[k].family === 'sbc' ? { ...BSTAT } : { ...STATUS, failSample: undefined }, ...strip(r) }])), isJudged);

// ================= 6. PAPER LANE (from 26 Oct 2026; only once the data rule has passed, so the ranking has its full reference set) =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), newLines = [], lastT = T - 1;
const sigIds = new Set(sigLines.map(x => x.id)), openBy = new Map(); for (const x of sigLines) if (!resolved.has(x.id)) openBy.set(x.m + '|' + x.sym, true);
const PSIM = J(RC + '/paper-sims.json', []);   // similarities of 10-Ks filed from the paper start (added to the reference set)
if (DATA.ok && Object.keys(firstRun).length) {
  const daysDone = new Set(J(RC + '/paper-days.json', [])), uniSet = new Set(CIKS);
  for (let d = START; d <= iso(Date.now()) && left() > 8 * 60e3; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6 || daysDone.has(d)) continue;
    const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, idx = await sec(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx', 'text');
    if (idx === undefined) break; if (idx === null) { if (d < iso(Date.now() - 2 * 864e5)) daysDone.add(d); continue; }
    let bad = false; for (const r of parseDailyIdx(idx, new Set(['10-K']), (r) => uniSet.has(r.cik) || !!symFor(r.cik, d))) { const L = await filingList(r.cik); if (L === undefined) { bad = true; break; }
      const P = pairPrev(L), cur = L.filter(f => f.date === d)[0]; if (!cur || !P.get(cur.acc) || PSIM.some(z => z.acc === cur.acc)) continue; const pv = L.find(f => f.acc === P.get(cur.acc));
      const a = await sec(SEC + docUrl(r.cik, cur), 'text'), b = a ? await sec(SEC + docUrl(r.cik, pv), 'text') : null; if (a === undefined || b === undefined) { bad = true; break; }
      const s = a && b ? pairSim(termFreq(a), termFreq(b)) : null; if (typeof s === 'number') PSIM.push({ cik: r.cik, acc: cur.acc, accept: cur.accept, d: nyDate(cur.accept || cur.date), s: r4(s) }); }
    if (!bad) daysDone.add(d); else break; }
  W(RC + '/paper-days.json', [...daysDone].sort()); W(RC + '/paper-sims.json', PSIM);
  const prank = makeRanker([...SIMS, ...PSIM]);
  for (const z of PSIM) { const p = prank(z.d, z.s), side = sideOf(p), sym = symFor(z.cik, z.d); if (!sym || (side !== 'top' && side !== 'bottom')) continue; const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, lastT);
    if (!liqOn(i, t)) continue;
    for (const id of LAZY_IDS.filter(x => RULES[x].side === side && RULES[x].kind === 'buy')) { const key = id + '|' + sym; if (ONE_OPEN.has(id) && openBy.get(key)) continue;
      const late = k <= lastT, entryDate = late ? null : (z.d >= D[lastT] ? nextSession(z.d) : nextSession(D[lastT]));
      const line = { type: 'signal', id: id + '|' + sym + '|' + z.d, m: id, sym, d: z.d, event: z.acc, pct: r4(p), sim: z.s, close: r4(C[i * T + t] > 0 ? C[i * T + t] : closeAt(i, t, t - 5)), halal: halal(sym), hold: H(id),
        plan: late ? 'LATE (found after the rule\'s entry): buy at the next open after ' + D[lastT] + ', hold ' + H(id) + ' sessions' : 'buy at the open of ' + entryDate + ', hold ' + H(id) + ' sessions', entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } } }
// tender paper (idea 2): every cash tender filed from the paper start, once the tender data rule has passed and its verdicts are frozen
if (TDATA.ok && TENDER_IDS.some(id => firstRun[id])) for (const z of TEV.filter(e => e.d >= START)) { const sym = SYMS[z.i];
  for (const id of TENDER_IDS.filter(x => inSpread(x, z.s))) { const key = id + '|' + sym; if (openBy.get(key)) continue; const k = z.k, late = k <= lastT, entryDate = late ? null : (z.d >= D[lastT] ? nextSession(z.d) : nextSession(D[lastT]));
    const line = { type: 'signal', id: id + '|' + sym + '|' + z.d, m: id, sym, d: z.d, event: z.acc, offer: z.offer, spread: z.s, cvr: z.cvr, c0: r4(z.c0), close: r4(z.c0), halal: halal(sym), hold: TO.maxHold,
      plan: (late ? 'LATE (found after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + '; cash offer ' + z.offer + ' USD a share (spread ' + (z.s * 100).toFixed(1) + '% at the filing-day close' + (z.cvr ? ', plus a CVR' : '') + '); sell when the deal pays out, at a close under ' + r4(z.c0 * (1 - TO.breakDrop)) + ' (deal break), or after ' + TO.maxHold + ' sessions', entryDate, late, recordedAfter: D[lastT] };
    if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
// info-shock paper (idea 3, from the 27 Oct 2026 close; entries from 28 Oct): a price-only shock scan of every liquid stock on each
// session since, then the company's 8-K list is read FRESH from data.sec.gov for the few candidates (checked once, cached).
const ISC_PAPER_FROM = '2026-10-27';
if (IDATA.ok && ISC_IDS.some(id => firstRun[id])) { const checked = J(RC + '/isc-paper.json', {}); let reads = 0;
  for (let t = Math.max(ISC.win + 1, firstAfter(addDays(ISC_PAPER_FROM, -1))); t <= lastT && left() > 5 * 60e3; t++) {
    for (let i = 0; i < NS; i++) { if (i === spyI || !liqOn(i, t)) continue; const ar = arOf(i, t); if (ar === null || ar < ISC.minAR) continue; const sg = sigmaOf(i, t); if (!isShock(ar, sg)) continue;
      const sym = SYMS[i], key = sym + '|' + D[t]; let kinds = checked[key];
      if (kinds === undefined) { const cik = cikOfSym(sym, D[t]); if (!cik) { checked[key] = []; continue; } const L = await eightKList(cik); reads++; if (L === undefined) continue;
        kinds = []; for (const [acc, items] of L) { const rd = reactionDate(acc, secNY); if (rd && sessOnOrAfter(rd) === t) kinds.push(isEarnings(items)); } checked[key] = kinds; }
      if (!kinds.length) continue;
      for (const id of ISC_IDS.filter(x => newsOk(x, kinds))) { const okey = id + '|' + sym; if (openBy.get(okey)) continue; const k = t + 1, late = k <= lastT, entryDate = late ? null : nextSession(D[lastT]);
        const line = { type: 'signal', id: id + '|' + sym + '|' + D[t], m: id, sym, d: D[t], event: '8-K' + (kinds.some(Boolean) ? ' (earnings, item 2.02)' : ''), ar: r4(ar), sigma: r4(sg), close: r4(pxA(i, t)), halal: halal(sym), hold: H(id),
          plan: (late ? 'LATE (found after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + ', hold ' + H(id) + ' sessions (the stock beat the average stock by ' + (ar * 100).toFixed(1) + '% on ' + D[t] + ', ' + (ar / sg).toFixed(1) + ' sigma, with an 8-K)', entryDate, late, recordedAfter: D[lastT] };
        if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(okey, true); } } }
  W(RC + '/isc-paper.json', checked); log('info-shock paper: ' + reads + ' fresh 8-K list reads'); }
// backlog paper (idea 4, filings from 27 Oct 2026): 10-Q/10-K filers of each day (SEC daily index), their RPO facts read fresh from
// data.sec.gov companyconcept (cached once per company and day), ranked against the 5-year reference set plus the paper events.
const RPO_PAPER_FROM = '2026-10-27';
if (RDATA.ok && RPO_IDS.some(id => firstRun[id])) { const P = J(RC + '/rpo-paper.json', { days: [], refs: [] }), done = new Set(P.days), uniSet = new Set(CIKS); let reads = 0;
  for (let d = RPO_PAPER_FROM; d <= iso(Date.now()) && left() > 5 * 60e3; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6 || done.has(d)) continue;
    const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, idx = await sec(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx', 'text');
    if (idx === undefined) break; if (idx === null) { if (d < iso(Date.now() - 2 * 864e5)) done.add(d); continue; }
    let bad = false; const ciks = [...new Set(parseDailyIdx(idx, new Set(['10-Q', '10-K']), (r) => uniSet.has(r.cik) || !!symFor(r.cik, d)).map(r => r.cik))];
    for (const c of ciks) { const j = await sec(SECD + '/api/xbrl/companyconcept/CIK' + pad(c) + '/us-gaap/' + RPO.tag + '.json'); reads++; if (j === undefined) { bad = true; break; } if (!j) continue;
      for (const e of rpoEvents(rpoRows(j))) if (e.d === d && !P.refs.some(z => z.cik === c && z.d === d)) P.refs.push({ cik: c, ...e, s: e.g }); }
    if (!bad) done.add(d); else break; }
  P.days = [...done].sort(); W(RC + '/rpo-paper.json', P);
  const seenRef = new Set(REV.map(z => z.cik + '|' + z.d)), prank = makeRanker([...REV, ...P.refs.filter(z => !seenRef.has(z.cik + '|' + z.d))]);
  for (const z of P.refs) { const p = prank(z.d, z.g), side = sideOf(p), sym = symFor(z.cik, z.d); if (!sym || side !== 'top') continue; const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, lastT); if (!liqOn(i, t)) continue;
    for (const id of RPO_IDS.filter(x => RULES[x].side === side && RULES[x].kind === 'buy')) { const key = id + '|' + sym; if (openBy.get(key)) continue;
      const late = k <= lastT, entryDate = late ? null : (z.d >= D[lastT] ? nextSession(z.d) : nextSession(D[lastT]));
      const line = { type: 'signal', id: id + '|' + sym + '|' + z.d, m: id, sym, d: z.d, event: z.form + ' backlog ' + z.end, growth: z.g, pct: r4(p), close: r4(C[i * T + t] > 0 ? C[i * T + t] : closeAt(i, t, t - 5)), halal: halal(sym), hold: H(id),
        plan: (late ? 'LATE (found after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + ', hold ' + H(id) + ' sessions (backlog +' + (z.g * 100).toFixed(0) + '% on a year before)', entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
  log('backlog paper: ' + reads + ' companyconcept reads, ' + P.refs.length + ' paper events'); }
// earnings-timing paper (idea 5, announcements from 30 Oct 2026): 8-K filers of each day (SEC daily index) whose 8-K list is read FRESH
// from data.sec.gov (once per company and day); announcements dated from the paper start, matched to the year-ago date from the same list.
const EAT_PAPER_FROM = '2026-10-30';
if (EDATA.ok && EAT_IDS.some(id => firstRun[id])) { const P = J(RC + '/eat-paper.json', { days: [], k: {} }), done = new Set(P.days), uniSet = new Set(CIKS); let reads = 0;
  for (let d = EAT_PAPER_FROM; d <= iso(Date.now()) && left() > 5 * 60e3; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6 || done.has(d)) continue;
    const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, idx = await sec(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx', 'text');
    if (idx === undefined) break; if (idx === null) { if (d < iso(Date.now() - 2 * 864e5)) done.add(d); continue; }
    let bad = false; const ciks = [...new Set(parseDailyIdx(idx, new Set(['8-K']), (r) => uniSet.has(r.cik) || !!symFor(r.cik, d)).map(r => r.cik))];
    for (const c of ciks) { if (left() < 5 * 60e3) { bad = true; break; } const L = await eightKList(c); reads++; if (L === undefined) { bad = true; break; } P.k[c] = L; }
    if (!bad) done.add(d); else break; }
  P.days = [...done].sort(); W(RC + '/eat-paper.json', P);
  for (const [c, L] of Object.entries(P.k)) for (const e of eatEvents(eatAnnouncements(L, secNY))) { if (e.d < EAT_PAPER_FROM || e.side !== 'adv') continue;
    const rd = reactionDate(e.accept, secNY); if (!rd) continue; const t = Math.min(sessOnOrAfter(rd), lastT), sym = symFor(c, e.d); if (!sym) continue; const i = SY.get(sym); if (!liqOn(i, t)) continue;
    for (const id of EAT_IDS.filter(x => RULES[x].kind === 'buy')) { const key = id + '|' + sym; if (openBy.get(key)) continue; const rt = sessOnOrAfter(rd), k = rt + 1, late = k <= lastT, entryDate = late ? null : nextSession(rt <= lastT ? D[rt] : nextSession(addDays(rd, -1)));
      const line = { type: 'signal', id: id + '|' + sym + '|' + e.d, m: id, sym, d: e.d, event: '8-K item 2.02 (earnings) ' + (-e.shift) + ' days earlier than a year before (' + e.prev + ')', shift: e.shift, close: r4(pxA(i, t)), halal: halal(sym), hold: H(id),
        plan: (late ? 'LATE (found after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + ', hold ' + H(id) + ' sessions (earnings ' + (-e.shift) + ' days earlier than usual)', entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
  log('earnings timing paper: ' + reads + ' fresh 8-K list reads, ' + Object.keys(P.k).length + ' companies'); }
// tax-surprise paper (idea 6, filings from 30 Oct 2026): 10-Q/10-K filers of each day (SEC daily index), their tax and assets facts read
// fresh from data.sec.gov companyconcept (two reads, once per company and day), ranked against the 5-year reference set plus paper events.
const TAX_PAPER_FROM = '2026-10-30';
if (XDATA.ok && TAX_IDS.some(id => firstRun[id])) { const P = J(RC + '/tax-paper.json', { days: [], refs: [] }), done = new Set(P.days), uniSet = new Set(CIKS); let reads = 0;
  for (let d = TAX_PAPER_FROM; d <= iso(Date.now()) && left() > 5 * 60e3; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6 || done.has(d)) continue;
    const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, idx = await sec(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx', 'text');
    if (idx === undefined) break; if (idx === null) { if (d < iso(Date.now() - 2 * 864e5)) done.add(d); continue; }
    let bad = false; const ciks = [...new Set(parseDailyIdx(idx, new Set(['10-Q', '10-K']), (r) => uniSet.has(r.cik) || !!symFor(r.cik, d)).map(r => r.cik))];
    for (const c of ciks) { if (left() < 5 * 60e3) { bad = true; break; } const jt = await sec(SECD + '/api/xbrl/companyconcept/CIK' + pad(c) + '/us-gaap/' + TAX.tag + '.json'); reads++; if (jt === undefined) { bad = true; break; } if (!jt) continue;
      const ja = await sec(SECD + '/api/xbrl/companyconcept/CIK' + pad(c) + '/us-gaap/' + TAX.assets + '.json'); reads++; if (ja === undefined) { bad = true; break; } if (!ja) continue;
      for (const e of taxEvents(taxRows({ facts: { 'us-gaap': { [TAX.tag]: jt, [TAX.assets]: ja } } }))) if (e.d === d && !P.refs.some(z => z.cik === c && z.d === d)) P.refs.push({ cik: c, ...e, s: e.g }); }
    if (!bad) done.add(d); else break; }
  P.days = [...done].sort(); W(RC + '/tax-paper.json', P);
  const seenRef = new Set(TEVS.map(z => z.cik + '|' + z.d)), prank = makeRanker([...TEVS, ...P.refs.filter(z => !seenRef.has(z.cik + '|' + z.d))]);
  for (const z of P.refs) { const p = prank(z.d, z.g), side = sideOf(p), sym = symFor(z.cik, z.d); if (!sym || side !== 'top') continue; const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, lastT); if (!liqOn(i, t)) continue;
    for (const id of TAX_IDS.filter(x => RULES[x].side === side && RULES[x].kind === 'buy')) { const key = id + '|' + sym; if (openBy.get(key)) continue;
      const late = k <= lastT, entryDate = late ? null : (z.d >= D[lastT] ? nextSession(z.d) : nextSession(D[lastT]));
      const line = { type: 'signal', id: id + '|' + sym + '|' + z.d, m: id, sym, d: z.d, event: z.form + ' tax expense ' + z.end, dT: z.g, pct: r4(p), close: r4(C[i * T + t] > 0 ? C[i * T + t] : closeAt(i, t, t - 5)), halal: halal(sym), hold: H(id),
        plan: (late ? 'LATE (found after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + ', hold ' + H(id) + ' sessions (quarterly tax expense up ' + (z.g * 100).toFixed(2) + '% of assets on a year before)', entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
  log('tax surprise paper: ' + reads + ' companyconcept reads, ' + P.refs.length + ' paper events'); }
// organization-capital paper (idea 13, 10-Ks from 9 Nov 2026): 10-K filers of each day (SEC daily index), their annual SG&A and assets facts read
// fresh from data.sec.gov companyconcept (two reads, once per company and day), ranked against the 5-year reference set plus paper events.
const OC_PAPER_FROM = '2026-11-09';
if (ODATA.ok && OC_IDS.some(id => firstRun[id])) { const P = J(RC + '/oc-paper.json', { days: [], refs: [] }), done = new Set(P.days), uniSet = new Set(CIKS); let reads = 0;
  for (let d = OC_PAPER_FROM; d <= iso(Date.now()) && left() > 5 * 60e3; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6 || done.has(d)) continue;
    const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, idx = await sec(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx', 'text');
    if (idx === undefined) break; if (idx === null) { if (d < iso(Date.now() - 2 * 864e5)) done.add(d); continue; }
    let bad = false; const ciks = [...new Set(parseDailyIdx(idx, new Set(['10-K']), (r) => uniSet.has(r.cik) || !!symFor(r.cik, d)).map(r => r.cik))];
    for (const c of ciks) { if (left() < 5 * 60e3) { bad = true; break; } const jt = await sec(SECD + '/api/xbrl/companyconcept/CIK' + pad(c) + '/us-gaap/' + OC.tag + '.json'); reads++; if (jt === undefined) { bad = true; break; } if (!jt) continue;
      const ja = await sec(SECD + '/api/xbrl/companyconcept/CIK' + pad(c) + '/us-gaap/' + OC.assets + '.json'); reads++; if (ja === undefined) { bad = true; break; } if (!ja) continue;
      for (const e of ocEvents(ocRows({ facts: { 'us-gaap': { [OC.tag]: jt, [OC.assets]: ja } } }))) if (e.d === d && !P.refs.some(z => z.cik === c && z.d === d)) P.refs.push({ cik: c, ...e, s: e.g }); }
    if (!bad) done.add(d); else break; }
  P.days = [...done].sort(); W(RC + '/oc-paper.json', P);
  const seenRef = new Set(OEVS.map(z => z.cik + '|' + z.d)), prank = makeRanker([...OEVS, ...P.refs.filter(z => !seenRef.has(z.cik + '|' + z.d))]);
  for (const z of P.refs) { const p = prank(z.d, z.g), side = sideOf(p), sym = symFor(z.cik, z.d); if (!sym || side !== 'top') continue; const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, lastT); if (!liqOn(i, t)) continue;
    for (const id of OC_IDS) { const key = id + '|' + sym; if (openBy.get(key)) continue;
      const late = k <= lastT, entryDate = late ? null : (z.d >= D[lastT] ? nextSession(z.d) : nextSession(D[lastT]));
      const line = { type: 'signal', id: id + '|' + sym + '|' + z.d, m: id, sym, d: z.d, event: '10-K organization capital ' + z.end, ocPerAssets: z.g, pct: r4(p), close: r4(C[i * T + t] > 0 ? C[i * T + t] : closeAt(i, t, t - 5)), halal: halal(sym), hold: H(id),
        plan: (late ? 'LATE (found after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + ', hold ' + H(id) + ' sessions (organization capital ' + (z.g * 100).toFixed(0) + '% of assets)', entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
  log('organization capital paper: ' + reads + ' companyconcept reads, ' + P.refs.length + ' paper events'); }
// gross-profit-change paper (idea 10, filings from 5 Nov 2026): 10-Q/10-K filers of each day (SEC daily index), their gross profit and assets facts read
// fresh from data.sec.gov companyconcept (two reads, once per company and day), ranked against the 5-year reference set plus paper events.
const GPC_PAPER_FROM = '2026-11-05';
if (PDATA.ok && GPC_IDS.some(id => firstRun[id])) { const P = J(RC + '/gpc-paper.json', { days: [], refs: [] }), done = new Set(P.days), uniSet = new Set(CIKS); let reads = 0;
  for (let d = GPC_PAPER_FROM; d <= iso(Date.now()) && left() > 5 * 60e3; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6 || done.has(d)) continue;
    const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, idx = await sec(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx', 'text');
    if (idx === undefined) break; if (idx === null) { if (d < iso(Date.now() - 2 * 864e5)) done.add(d); continue; }
    let bad = false; const ciks = [...new Set(parseDailyIdx(idx, new Set(['10-Q', '10-K']), (r) => uniSet.has(r.cik) || !!symFor(r.cik, d)).map(r => r.cik))];
    for (const c of ciks) { if (left() < 5 * 60e3) { bad = true; break; } const jt = await sec(SECD + '/api/xbrl/companyconcept/CIK' + pad(c) + '/us-gaap/' + GPC.tag + '.json'); reads++; if (jt === undefined) { bad = true; break; } if (!jt) continue;
      const ja = await sec(SECD + '/api/xbrl/companyconcept/CIK' + pad(c) + '/us-gaap/' + GPC.assets + '.json'); reads++; if (ja === undefined) { bad = true; break; } if (!ja) continue;
      for (const e of gpcEvents(gpcRows({ facts: { 'us-gaap': { [GPC.tag]: jt, [GPC.assets]: ja } } }))) if (e.d === d && !P.refs.some(z => z.cik === c && z.d === d)) P.refs.push({ cik: c, ...e, s: e.g }); }
    if (!bad) done.add(d); else break; }
  P.days = [...done].sort(); W(RC + '/gpc-paper.json', P);
  const seenRef = new Set(PEVS.map(z => z.cik + '|' + z.d)), prank = makeRanker([...PEVS, ...P.refs.filter(z => !seenRef.has(z.cik + '|' + z.d))]);
  for (const z of P.refs) { const p = prank(z.d, z.g), side = sideOf(p), sym = symFor(z.cik, z.d); if (!sym || side !== 'top') continue; const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, lastT); if (!liqOn(i, t)) continue;
    for (const id of GPC_IDS.filter(x => RULES[x].side === side && RULES[x].kind === 'buy')) { const key = id + '|' + sym; if (openBy.get(key)) continue;
      const late = k <= lastT, entryDate = late ? null : (z.d >= D[lastT] ? nextSession(z.d) : nextSession(D[lastT]));
      const line = { type: 'signal', id: id + '|' + sym + '|' + z.d, m: id, sym, d: z.d, event: z.form + ' gross profit ' + z.end, dGP: z.g, pct: r4(p), close: r4(C[i * T + t] > 0 ? C[i * T + t] : closeAt(i, t, t - 5)), halal: halal(sym), hold: H(id),
        plan: (late ? 'LATE (found after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + ', hold ' + H(id) + ' sessions (quarterly gross profit up ' + (z.g * 100).toFixed(2) + '% of assets on a year before)', entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
  log('gross profit change paper: ' + reads + ' companyconcept reads, ' + P.refs.length + ' paper events'); }
// R&D-increase paper (idea 7, filings from 2 Nov 2026): 10-Q/10-K filers of each day (SEC daily index), R&D and assets read fresh from
// data.sec.gov companyconcept (main tag, fallback tag if missing, assets), qualifying events recorded as paper signals.
const RDI_PAPER_FROM = '2026-11-02';
if (DDATA.ok && RDI_IDS.some(id => firstRun[id])) { const P = J(RC + '/rdi-paper.json', { days: [], refs: [] }), done = new Set(P.days), uniSet = new Set(CIKS); let reads = 0;
  for (let d = RDI_PAPER_FROM; d <= iso(Date.now()) && left() > 5 * 60e3; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6 || done.has(d)) continue;
    const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, idx = await sec(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx', 'text');
    if (idx === undefined) break; if (idx === null) { if (d < iso(Date.now() - 2 * 864e5)) done.add(d); continue; }
    let bad = false; const ciks = [...new Set(parseDailyIdx(idx, new Set(['10-Q', '10-K']), (r) => uniSet.has(r.cik) || !!symFor(r.cik, d)).map(r => r.cik))];
    for (const c of ciks) { if (left() < 5 * 60e3) { bad = true; break; } let tag = RDI.tags[0], jr = await sec(SECD + '/api/xbrl/companyconcept/CIK' + pad(c) + '/us-gaap/' + tag + '.json'); reads++; if (jr === undefined) { bad = true; break; }
      if (!jr) { tag = RDI.tags[1]; jr = await sec(SECD + '/api/xbrl/companyconcept/CIK' + pad(c) + '/us-gaap/' + tag + '.json'); reads++; if (jr === undefined) { bad = true; break; } if (!jr) continue; }
      const ja = await sec(SECD + '/api/xbrl/companyconcept/CIK' + pad(c) + '/us-gaap/' + RDI.assets + '.json'); reads++; if (ja === undefined) { bad = true; break; } if (!ja) continue;
      for (const e of rdiEvents(rdiRows({ facts: { 'us-gaap': { [tag]: jr, [RDI.assets]: ja } } }))) if (e.d === d && e.qualifies && !P.refs.some(z => z.cik === c && z.d === d)) P.refs.push({ cik: c, ...e }); }
    if (!bad) done.add(d); else break; }
  P.days = [...done].sort(); W(RC + '/rdi-paper.json', P);
  for (const z of P.refs) { const sym = symFor(z.cik, z.d); if (!sym) continue; const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, lastT); if (!liqOn(i, t)) continue;
    for (const id of RDI_IDS) { const key = id + '|' + sym; if (openBy.get(key)) continue;
      const late = k <= lastT, entryDate = late ? null : (z.d >= D[lastT] ? nextSession(z.d) : nextSession(D[lastT]));
      const line = { type: 'signal', id: id + '|' + sym + '|' + z.d, m: id, sym, d: z.d, event: z.form + ' R&D ' + z.end + ' up ' + (z.g * 100).toFixed(0) + '% on a year before', rdGrowth: z.g, intensity: z.intensity, close: r4(C[i * T + t] > 0 ? C[i * T + t] : closeAt(i, t, t - 5)), halal: halal(sym), hold: H(id),
        plan: (late ? 'LATE (found after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + ', hold ' + H(id) + ' sessions (quarterly R&D up ' + (z.g * 100).toFixed(0) + '% on a year before)', entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
  log('R&D increase paper: ' + reads + ' companyconcept reads, ' + P.refs.length + ' paper events'); }
// inventory-change paper (idea 8, filings from 3 Nov 2026): 10-Q/10-K filers of each day (SEC daily index), inventory and assets read fresh
// from data.sec.gov companyconcept (two reads), ranked against the 5-year reference set plus paper events; bottom 20% recorded.
const INV_PAPER_FROM = '2026-11-03';
if (VDATA.ok && INV_IDS.some(id => firstRun[id])) { const P = J(RC + '/inv-paper.json', { days: [], refs: [] }), done = new Set(P.days), uniSet = new Set(CIKS); let reads = 0;
  for (let d = INV_PAPER_FROM; d <= iso(Date.now()) && left() > 5 * 60e3; d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6 || done.has(d)) continue;
    const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, idx = await sec(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx', 'text');
    if (idx === undefined) break; if (idx === null) { if (d < iso(Date.now() - 2 * 864e5)) done.add(d); continue; }
    let bad = false; const ciks = [...new Set(parseDailyIdx(idx, new Set(['10-Q', '10-K']), (r) => uniSet.has(r.cik) || !!symFor(r.cik, d)).map(r => r.cik))];
    for (const c of ciks) { if (left() < 5 * 60e3) { bad = true; break; } const jv = await sec(SECD + '/api/xbrl/companyconcept/CIK' + pad(c) + '/us-gaap/' + INV.tag + '.json'); reads++; if (jv === undefined) { bad = true; break; } if (!jv) continue;
      const ja = await sec(SECD + '/api/xbrl/companyconcept/CIK' + pad(c) + '/us-gaap/' + INV.assets + '.json'); reads++; if (ja === undefined) { bad = true; break; } if (!ja) continue;
      for (const e of invEvents(invRows({ facts: { 'us-gaap': { [INV.tag]: jv, [INV.assets]: ja } } }))) if (e.d === d && !P.refs.some(z => z.cik === c && z.d === d)) P.refs.push({ cik: c, ...e, s: e.g }); }
    if (!bad) done.add(d); else break; }
  P.days = [...done].sort(); W(RC + '/inv-paper.json', P);
  const seenRef = new Set(VEVS.map(z => z.cik + '|' + z.d)), prank = makeRanker([...VEVS, ...P.refs.filter(z => !seenRef.has(z.cik + '|' + z.d))]);
  for (const z of P.refs) { const p = prank(z.d, z.g), side = sideOf(p), sym = symFor(z.cik, z.d); if (!sym || side !== 'bottom') continue; const i = SY.get(sym), k = firstAfter(z.d), t = Math.min(k - 1, lastT); if (!liqOn(i, t)) continue;
    for (const id of INV_IDS.filter(x => RULES[x].side === side && RULES[x].kind === 'buy')) { const key = id + '|' + sym; if (openBy.get(key)) continue;
      const late = k <= lastT, entryDate = late ? null : (z.d >= D[lastT] ? nextSession(z.d) : nextSession(D[lastT]));
      const line = { type: 'signal', id: id + '|' + sym + '|' + z.d, m: id, sym, d: z.d, event: z.form + ' inventory ' + z.end, dInv: z.g, pct: r4(p), close: r4(C[i * T + t] > 0 ? C[i * T + t] : closeAt(i, t, t - 5)), halal: halal(sym), hold: H(id),
        plan: (late ? 'LATE (found after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + ', hold ' + H(id) + ' sessions (inventory change ' + (z.g * 100).toFixed(2) + '% of average assets on a year before)', entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
  log('inventory change paper: ' + reads + ' companyconcept reads, ' + P.refs.length + ' paper events'); }
// wikipedia-attention paper (idea 14, from 10 Nov 2026): the refreshed page-view series; monthly top 20% and spikes recorded as paper signals.
const WIKI_PAPER_FROM = '2026-11-10';
if (WDATA.ok && WIKI_IDS.some(id => firstRun[id])) { let n = 0;
  for (const id of WIKI_IDS) for (const z of (RULES[id].side === 'spike' ? WEV.spike : WEV.month)) { if (z.d < WIKI_PAPER_FROM) continue; const sym = SYMS[z.i], key = id + '|' + sym; if (openBy.get(key)) continue;
    const k = z.k, late = k <= lastT, entryDate = late ? null : (z.d >= D[lastT] ? (RULES[id].side === 'spike' ? nextSession(z.d) : z.d) : nextSession(D[lastT])), t = Math.min(k - 1, lastT);
    const line = { type: 'signal', id: id + '|' + sym + '|' + z.d, m: id, sym, d: z.d, event: RULES[id].side === 'spike' ? 'Wikipedia views ' + z.p + 'x the 8-week median' : 'Wikipedia views change last month (top 20%)', pct: z.p, close: r4(C[z.i * T + t] > 0 ? C[z.i * T + t] : closeAt(z.i, t, t - 5)), halal: halal(sym), hold: H(id),
      plan: (late ? 'LATE (found after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + ', hold ' + H(id) + ' sessions', entryDate, late, recordedAfter: D[lastT] };
    if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); n++; }
  log('wikipedia attention paper: ' + n + ' new signals'); }
// finra short volume paper (idea 15, from 11 Nov 2026): weekly bottom 20% (5-day and 63-day) recorded as paper signals.
const SVOL_PAPER_FROM = '2026-11-11';
if (SVDATA.ok && SVOL_IDS.some(id => firstRun[id])) { let n = 0;
  for (const id of SVOL_IDS.filter(x => RULES[x].kind === 'buy')) for (const z of SVEV[RULES[id].win][RULES[id].side]) { if (z.d < SVOL_PAPER_FROM) continue; const sym = SYMS[z.i], key = id + '|' + sym; if (openBy.get(key)) continue;
    const k = z.k, late = k <= lastT, entryDate = late ? null : z.d, t = Math.min(k - 1, lastT);
    const line = { type: 'signal', id: id + '|' + sym + '|' + z.d, m: id, sym, d: z.d, event: 'FINRA short ratio ' + (z.score * 100).toFixed(1) + '% (' + (RULES[id].win === 'long' ? '63' : '5') + '-day mean, bottom 20%)', pct: z.p, close: r4(C[z.i * T + t] > 0 ? C[z.i * T + t] : closeAt(z.i, t, t - 5)), halal: halal(sym), hold: H(id),
      plan: (late ? 'LATE (found after the rule\'s entry): buy at the next open after ' + D[lastT] : 'buy at the open of ' + entryDate) + ', hold ' + H(id) + ' sessions', entryDate, late, recordedAfter: D[lastT] };
    if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); n++; }
  log('finra short volume paper: ' + n + ' new signals'); }
const board = {}, today = {};
for (const x of sigLines) { const k = x.entryDate ? tOf.get(x.entryDate) : x.late ? firstAfter(x.recordedAfter) : undefined; if (k === undefined || k >= T) { x._state = 'waiting'; continue; } const i = SY.get(x.sym);
  let xi = k + x.hold - 1; if (RULES[x.m] && RULES[x.m].family === 'tender') { const ex = i === undefined ? null : tenderExit({ k, c0: x.c0, T, px: tPx(i) }); xi = ex ? ex.x : T; }
  if (xi > T - 1) { x._state = 'open'; x._k = k; x._mark = ret(i, k, T - 1); continue; }
  const g = ret(i, k, xi), c = ctrlSpan(k, xi); x._state = 'closed'; x._g = g; x._c = c; x._k = k;
  if (!resolved.has(x.id) && g !== null) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[xi], g: r4(g), net: r4(capG(g) - COST), avgStock: c === null ? null : r4(c - COST) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
for (const id of IDS) { const mine = sigLines.filter(x => x.m === id), closed = mine.filter(x => x._state === 'closed' && x._g !== null).map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c, halal: x.halal })), fr = firstRun[id], st = boardStats(closed);
  board[id] = { name: RULES[id].name, kind: RULES[id].kind, hold: H(id), family: RULES[id].family, dataOk: RULES[id].family === 'tender' ? TDATA.ok : RULES[id].family === 'isc' ? IDATA.ok : RULES[id].family === 'rpo' ? RDATA.ok : RULES[id].family === 'eat' ? EDATA.ok : RULES[id].family === 'tax' ? XDATA.ok : RULES[id].family === 'rdi' ? DDATA.ok : RULES[id].family === 'inv' ? VDATA.ok : RULES[id].family === 'gwi' ? GDATA.ok : RULES[id].family === 'gpc' ? PDATA.ok : RULES[id].family === 'dvc' ? CDATA.ok : RULES[id].family === 'dst' ? SDATA.ok : RULES[id].family === 'oc' ? ODATA.ok : RULES[id].family === 'wiki' ? WDATA.ok : RULES[id].family === 'svol' ? SVDATA.ok : RULES[id].family === 'pre' ? PRDATA.ok : RULES[id].family === 'sbc' ? BDATA.ok : DATA.ok, signals: mine.length, waiting: mine.filter(x => x._state === 'waiting').length, open: mine.filter(x => x._state === 'open').length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: RULES[id].kind === 'buy' && paperReady(st),
    fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  if (RULES[id].kind !== 'buy') continue;
  today[id] = { name: RULES[id].name, hold: H(id), tier: fr ? fr.verdict : null, newSignals: mine.filter(x => x.recordedAfter === D[lastT] && !x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, pct: x.pct, plan: x.plan })),
    late: mine.filter(x => x.recordedAfter === D[lastT] && x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, buy: D[x._k], sinceBuy: r4(x._mark ?? NaN), exitAfter: x.hold + ' sessions' })) }; }
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, note: 'PAPER ONLY. Daily-researcher rules (RQ-*) recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a frozen 5-year verdict that meets the TRY SMALL standard (data/research-lab.json firstRun) or 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.', methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: ' + newLines.filter(x => x.type === 'signal').length + ' new signals; ' + sigLines.length + ' in all; paper 10-K similarities ' + PSIM.length);

// ================= 7. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), lab: 'daily researcher', preRegistered: 'research-core.mjs RULES (25 Oct 2026, before any run) + data/strategy-library.json RQ-*',
  window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS, tenderData: TSTAT, rpoData: RSTAT, eatData: ESTAT, taxData: XSTAT, rdiData: DSTAT, invData: VSTAT, gwiData: GSTAT, gpcData: PSTAT, dvcData: CSTAT, dstData: SSTAT, ocData: OSTAT, wikiData: WSTAT, svolData: VSTAT2, preData: PSTAT2, sbcData: BSTAT, signalCounts: COUNTS,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= ' + TIER2_T + ' -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN. Gross returns capped at +300% for trades and yardsticks alike (AUD-1). The avoid check is never a buy.',
  firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-400)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'research-lab.mjs -> data/research-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: [R.older.win, R.newer.win], why: r.why }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('research-lab: library not updated: ' + e.message); }
console.log('RESEARCH LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | data ' + (DATA.ok ? 'complete' : 'collecting (' + DATA.why + ')') + ' | tender data ' + (TDATA.ok ? 'complete' : 'collecting (' + TDATA.why + ')') + ' | backlog data ' + (RDATA.ok ? 'complete' : 'collecting (' + RDATA.why + ')') + ' | earnings timing data ' + (EDATA.ok ? 'complete' : 'not met (' + EDATA.why + ')') + ' | tax surprise data ' + (XDATA.ok ? 'complete' : 'not met (' + XDATA.why + ')') + ' | R&D increase data ' + (DDATA.ok ? 'complete' : 'not met (' + DDATA.why + ')') + ' | inventory data ' + (VDATA.ok ? 'complete' : 'not met (' + VDATA.why + ')') + ' | goodwill data ' + (GDATA.ok ? 'complete' : 'not met (' + GDATA.why + ')') + ' | gross profit data ' + (PDATA.ok ? 'complete' : 'not met (' + PDATA.why + ')') + ' | dividend cut data ' + (CDATA.ok ? 'complete' : 'not met (' + CDATA.why + ')') + ' | wikipedia data ' + (WDATA.ok ? 'complete' : 'not met (' + WDATA.why + ')') + ' | short volume data ' + (SVDATA.ok ? 'complete' : 'not met (' + SVDATA.why + ')') + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length);
