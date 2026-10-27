// SQUAD 26 LAB (27 Oct 2026): the one-shot historical test SQ26-FIRSTMIN (squad26-core.mjs header = the exact pre-registered rule).
// Research only; never places an order; no Telegram. Keys only from secrets via env, never printed. Official APIs only.
// DATA: prices for the yardsticks = study-cache/grouped.json.gz (RESTORED READ ONLY; dead stocks included); ticker spans = squad4-cache
//   Form 3/4/5 (READ ONLY); 8-K hits = EDGAR full-text search per alias and month (own cache squad26-cache/efts); each candidate filing =
//   its EDGAR full submission text; trade prices = Alpaca SIP (1-minute raw bars around the acceptance, daily raw bars for the filters
//   and exits). The run resumes from its own cache until every input is complete; the first complete verdict is frozen (firstRun).
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { ownAverage } from './anomaly-core.mjs';
import { artifactJumps, hasArtifact } from './squad4-core.mjs';
import { eftsHits, html2text } from './squad21-core.mjs';
import { nyParts } from './sec-time.mjs';
import { ID, VERSIONS, TH, EXITS, COST, SPLIT, EVENT_FROM, EVENT_TO, MEGACAP_SHA, mean, median, r4, halfOf, capG, firstOnOrAfter, etToIso, listOn, allCiks, eventOf,
  priorSession, sessionAfter, openSessionAfter, firstEntry, priorStats, passPrior, exitTrade, grossOf, jumpIn, isRegular, preRegister } from './squad26-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const SEC = local(env.SEC_BASE) || 'https://www.sec.gov', EFTS = local(env.EFTS_BASE) || 'https://efts.sec.gov', AD = local(env.ALPACA_DATA_BASE) || 'https://data.alpaca.markets';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ26_CACHE || 'squad26-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = 'data/squad26-lab.json', LIB = 'data/strategy-library.json', MCF = 'data/squad24-megacaps.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o, pretty) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, pretty ? 1 : 0)); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x), addDays = (d, n) => iso(Date.parse(d + 'T00:00:00Z') + n * 864e5);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ26_MINUTES || 280) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};
log('squad 26 lab; frozen already: ' + (Object.keys(FROZEN).join(', ') || 'none'));

// ================= 0. PRE-REGISTRATION (idempotent) =================
{ const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' squad 26 entries written now'); }

if (VERSIONS.every(v => FROZEN[v.id]) && !env.HISTORY) { log('every version is frozen already (run once); nothing to do'); process.exit(0); }

// ================= 1. NETWORK =================
let lastSec = 0, secReq = 0, secFail = 0; const SECFAILS = [];
async function sec(url, kind = 'json') { for (let a = 0; a < 4; a++) { const w = (local(env.SEC_BASE) || local(env.EFTS_BASE) ? 0 : 125) - (Date.now() - lastSec); if (w > 0) await sleep(w); lastSec = Date.now(); secReq++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(90000) }); if (r.status === 404 || r.status === 410) return kind === 'text' ? '' : null;
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; } if (!r.ok) { secFail++; if (SECFAILS.length < 20) SECFAILS.push('HTTP ' + r.status + ' ' + url.slice(0, 160)); return undefined; }
      if (kind === 'json') return await r.json(); const b = Buffer.from(await r.arrayBuffer()); return b.subarray(0, 15e6).toString('latin1'); } catch (e) { await sleep(1000 * (a + 1)); } }
  secFail++; if (SECFAILS.length < 20) SECFAILS.push('gave up ' + url.slice(0, 160)); return undefined; }
const AH = { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' }; let alpGap = 0, alpReq = 0;
async function alp(path) { if (!env.ALPACA_KEY && !local(env.ALPACA_DATA_BASE)) return null;
  for (let a = 0; a < 6; a++) { const w = alpGap - Date.now(); if (w > 0) await sleep(w); alpGap = Date.now() + (local(env.ALPACA_DATA_BASE) ? 0 : 320); alpReq++; let r;
    try { r = await fetch(AD + path, { headers: AH, signal: AbortSignal.timeout(120000) }); } catch (e) { await sleep(2000 * (a + 1)); continue; }
    if (r.status === 429) { await sleep(5000 * (a + 1)); continue; } if (r.status >= 500) { await sleep(3000); continue; } if (!r.ok) return { bad: r.status }; return await r.json().catch(() => null); } return null; }
async function alpBars(sym, tf, start, end) { const out = []; let tok = null;
  do { const j = await alp('/v2/stocks/bars?symbols=' + encodeURIComponent(sym) + '&timeframe=' + tf + '&start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end) + '&adjustment=raw&feed=sip&sort=asc&limit=10000' + (tok ? '&page_token=' + encodeURIComponent(tok) : ''));
    if (!j || j.bad) return { bars: out, err: j ? 'HTTP ' + j.bad : 'no answer' }; out.push(...(((j.bars || {})[sym]) || [])); tok = j.next_page_token; } while (tok);
  return { bars: out }; }
const monthsFrom = (from, to) => { const out = []; for (let y = +from.slice(0, 4), m = +from.slice(5, 7); y < +to.slice(0, 4) || (y === +to.slice(0, 4) && m <= +to.slice(5, 7)); m === 12 ? (y++, m = 1) : m++) out.push(y + '-' + String(m).padStart(2, '0')); return out; };
const monthEnd = (m) => iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)), slug = (p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-');
function parseSubmission(txt) { const s = String(txt || ''), hdrEnd = s.search(/<DOCUMENT>/i), hdr = hdrEnd > 0 ? s.slice(0, hdrEnd) : s.slice(0, 20000);
  const acc = /<ACCEPTANCE-DATETIME>\s*(\d{14})/i.exec(hdr) || /ACCEPTANCE-DATETIME:\s*(\d{14})/i.exec(hdr), form = /CONFORMED SUBMISSION TYPE:\s*([^\n]+)/i.exec(hdr);
  const docs = []; const re = /<DOCUMENT>([\s\S]*?)<\/DOCUMENT>/gi; let m;
  while ((m = re.exec(s)) !== null) { const body = m[1], type = ((/<TYPE>([^\n<]+)/i.exec(body) || [])[1] || '').trim().toUpperCase(), file = ((/<FILENAME>([^\n<]+)/i.exec(body) || [])[1] || '').trim();
    if (!(type === '8-K' || /^EX-99/.test(type) || /^EX-10/.test(type))) continue; if (/\.(pdf|jpg|jpeg|png|gif|xlsx?|zip)$/i.test(file)) continue;
    docs.push({ type, file, text: html2text(body.slice(0, 3e6)) }); }
  return { accept: acc ? acc[1] : null, form: form ? form[1].trim() : null, docs }; }
const subUrl = (cik, adsh) => SEC + '/Archives/edgar/data/' + (+cik) + '/' + adsh.replace(/-/g, '') + '/' + adsh + '.txt';
async function efts(q, a, b, extra = '') { const hits = []; for (let from = 0; from < 10000; from += 100) {
    const j = await sec(EFTS + '/LATEST/search-index?q=' + encodeURIComponent('"' + q + '"') + extra + '&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from);
    if (!j || !j.hits) return null; const tot = (j.hits.total && j.hits.total.value) || 0;
    if (from === 0 && tot >= 9900 && a < b) { const mid = iso((Date.parse(a) + Date.parse(b)) / 2), x = await efts(q, a, mid, extra), y = await efts(q, addDays(mid, 1), b, extra); return x && y ? x.concat(y) : null; }
    const h = eftsHits(j); hits.push(...h); if (h.length < 100 || from + 100 >= tot) break; } return hits; }

// ================= 2. PRICES (cache, for the yardsticks and the prefilter) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad26-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t])), isSession = (d) => tOf.has(d);
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (/^[A-Z]{1,5}$/.test(s) && !SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const CA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; CA[k] = x.c[j]; VA[k] = x.v[j]; MAIN[k] = 1; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; VA[k] = x.x.v ? x.x.v[j] : NaN; } });
store = null;
const SPL = J('data/splits.json', { splits: [] }), SPLITS = new Map(); for (const x of SPL.splits || []) { if (!x || !x.s || !(x.r > 0)) continue; (SPLITS.get(x.s) || SPLITS.set(x.s, []).get(x.s)).push(x); }
const spyI = SY.get('SPY'); if (spyI === undefined) { console.log('squad26-lab: SPY missing; nothing done'); process.exit(0); }
const DV = new Float32Array(N).fill(NaN);
for (let i = 0; i < NS; i++) { const b = i * T; let s = 0, n = 0; for (let t = 0; t < T; t++) { const v = CA[b + t] * VA[b + t]; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const z = CA[b + t - 20] * VA[b + t - 20]; if (isFinite(z)) { s -= z; n--; } } if (t >= 19 && n >= 18) DV[b + t] = s / n; } }
STATUS.price = { ok: T >= 1000, sessions: T, from: D[0], to: D[T - 1], stocks: NS }; log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks)');
const ser = (i) => CA.subarray(i * T, i * T + T);
const JUMPS = new Map(), artifactIn = (i, a, b) => { if (!JUMPS.has(i)) JUMPS.set(i, artifactJumps(ser(i))); return hasArtifact(JUMPS.get(i), a, b); };
const inU = (i, t) => t >= 0 && t < T && i !== spyI && CA[i * T + t] >= TH.minClose && CA[i * T + t] <= TH.maxClose && DV[i * T + t] >= TH.minDv;
const closeAt = (i, x, k) => { for (let q = Math.min(x, T - 1); q >= k; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const cc = (i, p, x) => { const a = CA[i * T + p], y = closeAt(i, x, p + 1); return a > 0 && y > 0 ? y / a - 1 : null; };   // close p -> close x
const uMemo = new Map(), uList = (t) => { if (!uMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (inU(i, t)) a.push(i); uMemo.set(t, a); if (uMemo.size > 60) uMemo.delete(uMemo.keys().next().value); } return uMemo.get(t); };
const avgStock = (p, x) => { const v = []; for (const i of uList(p)) { if (artifactIn(i, p, x)) continue; const g = cc(i, p, x); if (g !== null && isFinite(g)) v.push(capG(g)); } return v.length >= TH.minYard ? mean(v) : null; };

// ================= 3. IDENTITY (squad 4 cache, read only) =================
const CIKMAP = new Map(); { let q = 0; for (const f of (() => { try { return fs.readdirSync(SC4 + '/f345'); } catch (e) { return []; } })()) { const x = JZ(SC4 + '/f345/' + f, null); if (!x) continue; q++;
    for (const [sym, cik, a, b, n] of x.map) (CIKMAP.get(cik) || CIKMAP.set(cik, []).get(cik)).push([sym, a, b, n]); } STATUS.tickerMap = { ok: q >= 20, quarters: q, ciks: CIKMAP.size }; log('ticker map: ' + JSON.stringify(STATUS.tickerMap)); }
const SH = JZ('data/shares.json.gz', { t: {}, c: {} }), SECCIK = J('data/sec-ciks.json', {});
const todayCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(+a); const y = SECCIK[s]; return y ? String(+y[0]) : null; };
const TODAYSYMS = new Map(); for (const s of SYMS) { const c = todayCik(s); if (c) (TODAYSYMS.get(c) || TODAYSYMS.set(c, []).get(c)).push(s); }
const hasPx = (i, t) => { for (let q = Math.max(0, t - 5); q <= Math.min(T - 1, t + 5); q++) if (CA[i * T + q] > 0) return true; return false; };
const symFor = (cik, tickers, d) => { const t = Math.min(firstOnOrAfter(D, d), T - 1), c = String(+cik), sp = (CIKMAP.get(c) || []).filter(s => d >= addDays(s[1], -400) && d <= addDays(s[2], 400)).sort((a, b) => b[3] - a[3]);
  for (const s of [...sp.map(x => x[0]), ...(tickers || []), ...(TODAYSYMS.get(c) || [])]) { const i = SY.get(s); if (i !== undefined && hasPx(i, t)) return s; } return null; };
const splitFactorAfter = (sym, d) => (SPLITS.get(sym) || []).filter(x => x.d > d).reduce((a, x) => a * x.r, 1);

// ================= 4. THE FROZEN LIST =================
const MCRAW = (() => { try { return fs.readFileSync(MCF); } catch (e) { return null; } })(), MCSHA = MCRAW ? crypto.createHash('sha256').update(MCRAW).digest('hex') : null;
STATUS.megacaps = { ok: !!MCRAW && MCSHA === MEGACAP_SHA, sha: MCSHA };
if (!STATUS.megacaps.ok) { log('mega-cap list missing or changed (' + MCSHA + '): nothing run'); W(OUT, { ...PREV, generatedAt: new Date().toISOString(), data: STATUS }, true); process.exit(0); }
const MC = JSON.parse(MCRAW.toString()), MCALL = allCiks(MC), COS = (cik) => ({ cik, aliases: (MC.companies[cik] || {}).aliases || [] });
const ALIASES = [...new Set(Object.values(MC.companies).flatMap(c => c.aliases || []))].sort();
log('frozen list: ' + Object.keys(MC.quarters).length + ' quarters, ' + MCALL.size + ' companies, ' + ALIASES.length + ' aliases');

// ================= 5. EDGAR: 8-K hits per alias and month (items 1.01, or 8.01 in an EX-99.1) =================
const FT = { complete: true, fetched: 0, missing: [] }, HITS = new Map();
for (const al of ALIASES) { for (const m of monthsFrom(EVENT_FROM.slice(0, 7), EVENT_TO.slice(0, 7))) { const f = SC + '/efts/' + slug(al) + '/' + m + '.json'; let h = J(f, null);
    if (!h) { if (left() < 150 * 60e3) { FT.complete = false; if (FT.missing.length < 50) FT.missing.push(al + ' ' + m); continue; }
      const x = await efts(al, m === EVENT_FROM.slice(0, 7) ? EVENT_FROM : m + '-01', m === EVENT_TO.slice(0, 7) ? EVENT_TO : monthEnd(m), '&forms=8-K'); FT.fetched++;
      if (!x) { FT.complete = false; if (FT.missing.length < 50) FT.missing.push(al + ' ' + m); continue; }
      h = x.filter(z => (!z[6] || z[6] === '8-K') && ((z[4] || []).some(it => String(it).trim() === '1.01') || ((z[4] || []).some(it => String(it).trim() === '8.01') && /^EX-99\.1$/i.test(z[5] || '')))).map(z => [z[0], z[1], z[2], z[3], z[4], z[7]]); W(f, h);
      if (FT.fetched % 500 === 0) log('alias-months fetched: ' + FT.fetched + ' (' + al + ' ' + m + ')'); }
    for (const z of h) { if (!z[1] || !z[2]) continue; const o = HITS.get(z[1]) || HITS.set(z[1], { adsh: z[1], cik: String(+z[2]), d: z[3], items: (z[4] || []).map(x => String(x).trim()), tickers: z[5] || [] }).get(z[1]); } } }
STATUS.efts = { ok: FT.complete, fetchedNow: FT.fetched, missing: FT.missing.slice(0, 20), filings: HITS.size };
log('full-text search: ' + HITS.size + ' filings; fetched now ' + FT.fetched + (FT.complete ? '' : ', INCOMPLETE (' + FT.missing.length + '+ missing)'));

// ================= 6. CANDIDATES AND THE DOCUMENT TEST =================
const sessOf = (d) => firstOnOrAfter(D, d), COUNT = { filings: HITS.size, filerIsMegacap: 0, noStock: 0, prefilterOut: 0, candidates: 0, notRead: 0, notPlain8K: 0, noAccept: 0, noCounterparty: 0, set101: 0, set801: 0 };
const CAND = [];
for (const h of HITS.values()) { if (MCALL.has(h.cik)) { COUNT.filerIsMegacap++; continue; } const sym = symFor(h.cik, h.tickers, h.d); if (!sym) { COUNT.noStock++; continue; } const i = SY.get(sym), s0 = sessOf(h.d), fac = splitFactorAfter(sym, h.d);
  let pre = false; for (const f of [s0 - 2, s0 - 1, s0]) if (f >= 0 && f < T) { const c = CA[i * T + f]; if ((c >= 0.5 && c <= 20) || (c * fac >= 0.5 && c * fac <= 20)) if (DV[i * T + f] >= 2.5e5) pre = true; }
  if (!pre) { COUNT.prefilterOut++; continue; } COUNT.candidates++; CAND.push({ ...h, sym, i }); }
const SUBS = J(SC + '/subs.json', {});   // adsh -> { a, f, ev: { set, cik, alias, sentence, doc } | null }
{ let read = 0; for (const e of CAND) { if (e.adsh in SUBS) continue; if (left() < 60 * 60e3) { COUNT.notRead++; continue; }
    const txt = await sec(subUrl(e.cik, e.adsh), 'text'); if (txt === undefined || !txt) { COUNT.notRead++; continue; } const p = parseSubmission(txt);
    const cos = listOn(MC, e.d).map(String).map(COS), ev = eventOf({ items: e.items, docs: p.docs }, cos);
    SUBS[e.adsh] = { a: p.accept, f: p.form, ev: ev ? { set: ev.set, cik: ev.match.cik, alias: ev.match.alias, sentence: ev.match.sentence.slice(0, 400), doc: ev.doc } : null }; read++;
    if (read % 300 === 0) { W(SC + '/subs.json', SUBS); log('submissions read: ' + read + ' / ' + CAND.length); } }
  W(SC + '/subs.json', SUBS); COUNT.readNow = read; }
STATUS.docs = { ok: COUNT.notRead <= Math.max(3, CAND.length * 0.01), candidates: CAND.length, notRead: COUNT.notRead };
const EVENTS = [];
for (const e of CAND) { const s = SUBS[e.adsh]; if (!s) continue; if (s.f && s.f !== '8-K') { COUNT.notPlain8K++; continue; } const accIso = etToIso(s.a, nyParts); if (!accIso) { COUNT.noAccept++; continue; }
  if (!s.ev) { COUNT.noCounterparty++; continue; } const accMs = Date.parse(accIso), acc = nyParts(accMs); if (acc.d < EVENT_FROM || acc.d > EVENT_TO) continue;
  COUNT['set' + s.ev.set]++; EVENTS.push({ ...e, accMs, acc, accNY: acc.d + ' ' + acc.hm, set: s.ev.set, cpCik: s.ev.cik, cp: (MC.companies[s.ev.cik] || {}).name || s.ev.alias, alias: s.ev.alias, sentence: s.ev.sentence, doc: s.ev.doc }); }
EVENTS.sort((a, b) => a.accMs - b.accMs);
log('funnel ' + JSON.stringify(COUNT));

// ================= 7. ALPACA: raw daily (filters, exits) + 1-minute bars (entry, session-1 stop) =================
const AC = J(SC + '/alpaca.json', {});   // key adsh -> { daily: [[d,o,h,l,c,v]], mins: [[ms,o,h,l,c,v]], err }
const regularAt = (ms) => isRegular(nyParts(ms), isSession);
const nyIso = (d, hm) => etToIso(d.replace(/-/g, '') + hm.replace(':', '') + '00', nyParts);
const AL = { needed: 0, fetchedNow: 0, missing: 0, errors: 0 };
for (const e of EVENTS) { const p = priorSession(D, e.acc), s1 = sessionAfter(D, e.acc), k0 = openSessionAfter(D, e.acc); e.p = p; e.s1 = s1; e.k0 = k0; if (p < 25 || s1 >= T) continue; AL.needed++;
  if (AC[e.adsh] && !AC[e.adsh].err) continue; if (left() < 25 * 60e3) { AL.missing++; continue; }
  const lastQ = Math.min(T - 1, Math.max(s1, k0) + 12), dly = await alpBars(e.sym, '1Day', addDays(D[p - 30] || D[0], 0) + 'T00:00:00Z', D[lastQ] + 'T23:59:00Z');
  const sEnd = e.acc.hm >= '15:29' && e.acc.hm < '16:00' && s1 + 1 < T ? s1 + 1 : s1, mins = await alpBars(e.sym, '1Min', new Date(e.accMs).toISOString(), nyIso(D[sEnd], '16:00'));
  AC[e.adsh] = { daily: dly.bars.map(b => [nyParts(Date.parse(b.t)).d, b.o, b.h, b.l, b.c, b.v]), mins: mins.bars.map(b => [Date.parse(b.t), b.o, b.h, b.l, b.c, b.v]), err: dly.err || mins.err || null }; AL.fetchedNow++;
  if (AC[e.adsh].err) AL.errors++; if (AL.fetchedNow % 100 === 0) { W(SC + '/alpaca.json', AC); log('alpaca events fetched: ' + AL.fetchedNow); } }
W(SC + '/alpaca.json', AC);
STATUS.alpaca = { ok: AL.missing === 0 && AL.errors <= Math.max(3, AL.needed * 0.02), ...AL, requests: alpReq };
log('alpaca: ' + JSON.stringify(STATUS.alpaca));

// ================= 8. TRADES =================
const TC = {};   // per version: why events did not trade
const bump = (v, k) => { TC[v] = TC[v] || {}; TC[v][k] = (TC[v][k] || 0) + 1; };
function tradeOf(e, V) { const A = AC[e.adsh]; if (!A) return { why: 'no alpaca data' }; if (A.err) return { why: 'alpaca error' };
  const daily = A.daily.map(([d, o, h, l, c, v]) => ({ d, o, h, l, c, v })), bar = new Map(daily.map(b => [b.d, b])), pd = D[e.p], ps = priorStats(daily, pd);
  if (!ps) return { why: 'no prior bar' }; if (!passPrior(ps)) return { why: ps.close < TH.minClose || ps.close > TH.maxClose ? 'prior close not 1-10' : 'traded value' };
  const mins = A.mins.map(([ms, o, h, l, c, v]) => ({ ms, o, h, l, c, v }));
  let fill, s1, slipIn, entryMs, minutesAfter = null;
  if (V.entry === 'first') { const en = firstEntry(mins, e.accMs, regularAt); if (!en) return { why: 'no print in 30 minutes' }; fill = en.px; slipIn = en.slip; entryMs = en.ms; s1 = sessionAfter(D, nyParts(en.ms));
    const s1Close = Date.parse(nyIso(D[s1] || pd, '16:00')); minutesAfter = mins.slice(en.j + 1).filter(m => m.ms < s1Close); }
  else { s1 = e.k0; if (s1 >= T) return { why: 'open' }; const b = bar.get(D[s1]); if (!b || !(b.o > 0)) return { why: 'no open' }; fill = b.o * (1 + TH.slipReg); slipIn = TH.slipReg; entryMs = Date.parse(nyIso(D[s1], '09:30')); }
  if (s1 >= T) return { why: 'open' };
  const ex = exitTrade({ D, bar, s1, n: V.n, fill, stop: V.exit === '10d', minutes: minutesAfter, regularAt, lastData: T - 1 }); if (!ex) return { why: 'no exit price' }; if (ex.open) return { why: 'open' };
  const pY = V.entry === 'first' ? e.p : s1 - 1;   // the yardstick window starts at the last close before the entry
  const raw = daily.filter(b => b.d >= D[Math.max(0, pY - 1)] && b.d <= D[ex.x]).map(b => b.c); if (jumpIn(raw) || artifactIn(e.i, pY - 1, ex.x)) return { why: 'split artifact' };
  const c = avgStock(pY, ex.x); if (c === null) return { why: 'no yardstick' };
  const g = grossOf(fill, ex.px, ex.slip), spy = cc(spyI, pY, ex.x);
  return { t: s1, s: e.sym, i: e.i, k: s1, x: ex.x, pY, days: Math.max(1, ex.x - s1 + 1), g, c, spy, half: halfOf(e.acc.d), kind: ex.kind, fill: r4(fill), exitPx: r4(ex.px), slipIn, slipOut: ex.slip, entryNY: (() => { const q = nyParts(entryMs); return q.d + ' ' + q.hm; })(),
    priorClose: ps.close, dv20: Math.round(ps.dv), ev: e }; }
const RES = {}, TRADES = {}, need = VERSIONS.filter(v => !FROZEN[v.id]);
STATUS.dataOk = STATUS.price.ok && STATUS.efts.ok && STATUS.docs.ok && STATUS.tickerMap.ok && STATUS.megacaps.ok && STATUS.alpaca.ok;
const COUNTS = {}; for (const set of ['101', '801']) COUNTS[set] = { older: EVENTS.filter(e => e.set === set && halfOf(e.acc.d) === 'older').length, newer: EVENTS.filter(e => e.set === set && halfOf(e.acc.d) === 'newer').length };
log('EVENT COUNTS (before the price filter and the 30-minute print check): ' + JSON.stringify(COUNTS));
if (need.length || env.HISTORY) {
  if (!STATUS.dataOk) { for (const v of need) RES[v.id] = { verdict: 'NOT RUN', why: 'data not complete this run: ' + JSON.stringify({ efts: STATUS.efts.ok, docs: STATUS.docs, alpaca: STATUS.alpaca, tickerMap: STATUS.tickerMap.ok }).slice(0, 400) }; log('NOT RUN (data incomplete; resume next run)'); }
  else for (const V of VERSIONS) { const tr = [], busy = new Map();
    for (const e of EVENTS) { if (e.set !== V.set) continue; if (e.p < 25 || e.s1 >= T) { bump(V.id, 'outside data'); continue; } const z = tradeOf(e, V); if (z.why) { bump(V.id, z.why); continue; }
      if ((busy.get(e.i) ?? -1) >= z.k) { bump(V.id, 'already holding'); continue; } busy.set(e.i, z.x); tr.push(z); }
    const spans = new Map(); for (const z of tr) (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, z.x]);
    const ownMemo = new Map(); for (const z of tr) { const len = z.x - z.pY, key = z.i + '|' + len + '|' + z.half;
      if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 30, to: T - 1, len, step: 5, busy: spans.get(z.i) || [], mode: 'capBoth', okAt: (u) => inU(z.i, u - 1) && halfOf(D[u]) === z.half, ret: (u, x) => cc(z.i, u - 1, x) })); z.own = ownMemo.get(key); }
    const B = TH.block, R = { older: halfStat(tr.filter(z => z.half === 'older'), B), newer: halfStat(tr.filter(z => z.half === 'newer'), B), all: halfStat(tr, B) };
    const perYear = (a, key, cost) => { const v = a.filter(z => ok(z[key])); const y = v.reduce((s, z) => s + z.days / 252, 0); return v.length && y > 0 ? v.reduce((s, z) => s + z[key] - cost, 0) / y : null; };
    const PY = Object.fromEntries(['older', 'newer'].map(h => { const a = tr.filter(z => z.half === h); return [h, { rule: r4(perYear(a, 'g', COST)), spy: r4(perYear(a, 'spy', 0)), avgStock: r4(perYear(a, 'c', 0)) }]; }));
    const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] } });
    const ext = tr.filter(z => z.slipIn > TH.slipReg), reg = tr.filter(z => z.slipIn === TH.slipReg), sub = (a) => ({ n: a.length, avg: r4(mean(a.map(z => z.g - COST))), median: r4(median(a.map(z => z.g - COST))), edge: r4(mean(a.map(z => z.g - COST - z.c))) });
    RES[V.id] = { ...v, set: V.set, entry: V.entry, exit: V.exit, hold: V.n, primary: V.primary, canQualify: V.primary, eventCounts: COUNTS[V.set], tradeCounts: { older: R.older.n || 0, newer: R.newer.n || 0 }, results: R, perYear: PY, notTraded: TC[V.id] || {},
      entrySplit: { extendedHours: sub(ext), regularHours: sub(reg) }, exits: tr.reduce((o, z) => (o[z.kind] = (o[z.kind] || 0) + 1, o), {}), medianNet: r4(median(tr.map(z => z.g - COST))) };
    TRADES[V.id] = tr;
    const f = (h) => (h.n || 0) + ' (' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock;
    log('- ' + V.id + ': ' + v.verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | not traded ' + JSON.stringify(TC[V.id] || {})); } }

// ================= 9. OUTPUT =================
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.some(v => v.id === k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), (r) => r && r.verdict && r.verdict !== 'NOT RUN');
const row = (z) => ({ sym: z.s, accepted: z.ev.accNY, set: z.ev.set, counterparty: z.ev.cp, alias: z.ev.alias, doc: z.ev.doc, sentence: (z.ev.sentence || '').slice(0, 260), adsh: z.ev.adsh, entry: z.entryNY, fill: z.fill, slipIn: z.slipIn,
  priorClose: z.priorClose, exitSession: D[z.x], exitPx: z.exitPx, exit: z.kind, net: r4(z.g - COST), avg1to10: r4(z.c), sameStock: r4(ok(z.own) ? z.own : null), spy: r4(z.spy) });
const cases = TRADES[ID] ? TRADES[ID].map(row) : (PREV.cases || []);
const ctl = TRADES['SQ26-V-101-open-3d'] ? new Map(TRADES['SQ26-V-101-open-3d'].map(z => [z.ev.adsh, z])) : null;
const paired = ctl && TRADES[ID] ? (() => { const a = TRADES[ID].filter(z => ctl.has(z.ev.adsh)); return { n: a.length, firstMinuteAvg: r4(mean(a.map(z => z.g - COST))), nextOpenAvg: r4(mean(a.map(z => ctl.get(z.ev.adsh).g - COST))), note: 'the same events traded both ways (exit b)' }; })() : PREV.paired || null;
const out = { generatedAt: new Date().toISOString(), squad: 26, question: 'does buying in the FIRST MINUTES after a material deal filing with a top-100 company pay, after honest costs?',
  preRegistered: 'squad26-core.mjs header (27 Oct 2026, before any run) + data/strategy-library.json ' + ID + '; frozen list ' + MCF + ' sha256 ' + MEGACAP_SHA, window: [D[0], D[T - 1]], events: [EVENT_FROM, EVENT_TO], bar: BAR, split: SPLIT, cost: COST,
  data: STATUS, eventCounts: COUNTS, funnel: COUNT, standard: 'primary SQ26-FIRSTMIN only: both halves > 0 after slippage (1% regular / 3% extended each way) and 0.8% / 1.2% costs, better than the average 1-10 USD stock over the same window, better than the same stock on other days, > 0 without its 2 best, 20+ trades and 3+ blocks a half, block t >= ' + TIER2_T + ', return per year above SPY. +300% cap (AUD-1).',
  firstRun, paired, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }), cases,
  events801: TRADES['SQ26-V-801-first-3d'] ? TRADES['SQ26-V-801-first-3d'].map(row) : (PREV.events801 || []) };
W(OUT, out, true);
try { const LB = J(LIB, null); let ch = 0; for (const id of [ID, 'SQ26-V-801-first-3d', 'SQ26-V-101-open-3d']) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || !r.results || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (id === ID ? '' : ' (information only; cannot qualify)'); e.tested = String(r.window[1]); e.study = 'squad26-lab.mjs -> data/squad26-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg ?? null, R.newer.avg ?? null], stress: [R.older.avgStress ?? null, R.newer.avgStress ?? null], edge: [R.older.edge ?? null, R.newer.edge ?? null],
      vsOwn: [R.older.vsOwn ?? null, R.newer.vsOwn ?? null], noTop2: [R.older.noTop2 ?? null, R.newer.noTop2 ?? null], tBlock: [R.older.tBlock ?? null, R.newer.tBlock ?? null], perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], why: r.why }; ch++; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad26-lab: library not updated: ' + e.message); }
if (SECFAILS.length) log('SEC requests ' + secReq + ', failed ' + secFail + ': ' + SECFAILS.slice(0, 3).join(' | '));
console.log('SQUAD 26 LAB ' + D[0] + ' to ' + D[T - 1] + ' | events 101 ' + JSON.stringify(COUNTS['101']) + ' 801 ' + JSON.stringify(COUNTS['801']) + ' | ' + Object.entries(firstRun).map(([k, r]) => k + ' ' + r.verdict).join(', ') + ' | ' + ['price', 'efts', 'docs', 'tickerMap', 'megacaps', 'alpaca'].map(k => k + (STATUS[k] && STATUS[k].ok ? ' ok' : ' MISSING')).join(', '));
