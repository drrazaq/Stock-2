// SQUAD 25 LAB (27 Oct 2026): "a giant newly owns a small company" (squad25-core.mjs header = the exact pre-registered rules).
// Research + forward PAPER lane (RECORD ONLY: no Telegram, no buy message); never places an order. Keys only from secrets via env, never
// printed. Official APIs / public SEC files only, SEC rate limit respected (8 requests a second), everything cached in squad25-cache.
// MODES (env MODE, or the last line of run-squad25-now.txt via the workflow):
//   BUILD = EDGAR quarterly master index 2013Q1.. (13F / 13D / 13G forms) -> giant-name CIK candidates + SIC of each candidate and of every
//           Squad 24 top-100 company -> data/squad25-giants-build.json (NO prices, NO returns). The frozen list data/squad25-giants.json is
//           written by hand from it BEFORE the rule run and its SHA-256 goes into the core header.
//   RUN   = the 5-year one-shot (only if data/squad25-giants.json matches GIANTS_SHA), then the paper lane.
//   PAPER = (weekday schedule) the paper lane, and the one-shot if it is not frozen yet and the list is in place.
// DATA: prices = study-cache/grouped.json.gz (RESTORED READ ONLY; dead stocks and under-3-USD rows included) + sessions since (Massive grouped
//   daily); ticker spans = squad4-cache Form 3/4/5 (READ ONLY); filings = EDGAR full-index master (quarters) + each giant CIK's submissions
//   JSON (fresh days); each filing's own header (ACCEPTANCE-DATETIME, FILED BY / SUBJECT COMPANY) and 13F information table; CUSIP ->
//   symbol = SEC fails-to-deliver files; shares = data/shares.json.gz; Alpaca SIP minute bars for entry B.
import fs from 'node:fs';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { ownAverage, nextSession } from './anomaly-core.mjs';
import { artifactJumps, hasArtifact } from './squad4-core.mjs';
import { nyParts } from './sec-time.mjs';
import { IDS, RULES, FALLBACK_OF, TH, COST, STRESS, SLIP, EXT_SLIP, SPLIT, PAPER_START, GIANTS_SHA, FORMS, is13F, isDG, isAmend, mean, r4, halfOf, capG, addDays, firstOnOrAfter,
  masterRow, adshOf, parseHeader, parseInfoTable, equityIssuers, firstAppearances, coverCusip, dgEvents, ftdSym, etToIso, sessionsOf, isExtHm, fillBar, bSession, sharesKnown,
  universeFail, exitFrom, grossSlip, perYear, shapeOf, boardStats, giantIndex, giantOn, preRegister } from './squad25-core.mjs';
const env = process.env, MODE = String(env.MODE || 'PAPER').toUpperCase(), local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', DSEC = local(env.SEC_DATA_BASE) || 'https://data.sec.gov', AD = local(env.ALPACA_DATA_BASE) || 'https://data.alpaca.markets';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ25_CACHE || 'squad25-cache', SC4 = env.SQ4_CACHE || 'squad4-cache';
const OUT = 'data/squad25-lab.json', PAPER = 'data/squad25-paper.jsonl', TODAY = 'data/squad25-today.json', BOARD = 'data/squad25-board.json', LIB = 'data/strategy-library.json';
const GF = 'data/squad25-giants.json', GB = 'data/squad25-giants-build.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o, pretty) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, pretty ? 1 : 0)); };
const WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ25_MINUTES || 280) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};
log('squad 25 lab, mode ' + MODE + '; frozen already: ' + (Object.keys(FROZEN).join(', ') || 'none'));

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
{ const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' squad 25 entries written now'); }

// ================= 1. NETWORK =================
let mvGap = 0;
async function mv(path) { if (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE)) return null; const url = PX + path;
  for (let a = 0; a < 5; a++) { const w = mvGap - Date.now(); if (w > 0) await sleep(w); mvGap = Date.now() + (local(env.MASSIVE_BASE) ? 0 : 70); let r;
    try { r = await fetch(url + (url.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(15000 * (a + 1)); continue; } if (r.status === 404) return { notFound: true }; if (r.status === 401 || r.status === 403) return { refused: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
let lastSec = 0, secReq = 0, secFail = 0; const SECFAILS = [];
async function sec(url, kind = 'json') { for (let a = 0; a < 4; a++) { const w = (local(env.SEC_BASE) ? 0 : 125) - (Date.now() - lastSec); if (w > 0) await sleep(w); lastSec = Date.now(); secReq++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(90000) }); if (r.status === 404 || r.status === 410) return kind === 'text' ? '' : null;
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; } if (!r.ok) { secFail++; if (SECFAILS.length < 20) SECFAILS.push('HTTP ' + r.status + ' ' + url.slice(0, 160)); return undefined; }
      if (kind === 'json') return await r.json(); const b = Buffer.from(await r.arrayBuffer()); return b.subarray(0, 25e6).toString('latin1'); } catch (e) { await sleep(1000 * (a + 1)); } }
  secFail++; if (SECFAILS.length < 20) SECFAILS.push('gave up ' + url.slice(0, 160)); return undefined; }
function download(url, file) { const w = 125 - (Date.now() - lastSec); if (w > 0) execFileSync('sleep', [String(w / 1000)]); lastSec = Date.now(); secReq++;
  try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--retry-delay', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 20 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
const AH = { 'APCA-API-KEY-ID': env.ALPACA_KEY || '', 'APCA-API-SECRET-KEY': env.ALPACA_SECRET || '' };
async function alp(path) { if (!env.ALPACA_KEY && !local(env.ALPACA_DATA_BASE)) return null;
  for (let a = 0; a < 5; a++) { let r; try { r = await fetch(AD + path, { headers: AH, signal: AbortSignal.timeout(120000) }); } catch (e) { await sleep(2000 * (a + 1)); continue; }
    if (r.status === 429) { await sleep(3000 * (a + 1)); continue; } if (!r.ok) return { bad: r.status }; return await r.json().catch(() => null); } return null; }
async function alpBars(sym, tf, start, end, adj) { const out = []; let tok = null;
  do { const j = await alp('/v2/stocks/bars?symbols=' + encodeURIComponent(sym) + '&timeframe=' + tf + '&start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end) + '&adjustment=' + adj + '&feed=sip&sort=asc&limit=10000' + (tok ? '&page_token=' + encodeURIComponent(tok) : ''));
    if (!j || j.bad) return { bars: out, err: j ? 'HTTP ' + j.bad : 'no answer' }; out.push(...(((j.bars || {})[sym]) || [])); tok = j.next_page_token; } while (tok);
  return { bars: out }; }
const pad10 = (c) => String(+c).padStart(10, '0');
const txtUrl = (cik, adsh) => SEC + '/Archives/edgar/data/' + (+cik) + '/' + adsh.replace(/-/g, '') + '/' + adsh + '.txt';
const hdrUrl = (cik, adsh) => SEC + '/Archives/edgar/data/' + (+cik) + '/' + adsh.replace(/-/g, '') + '/' + adsh + '-index-headers.html';

// ================= 2. EDGAR MASTER INDEX (13F / 13D / 13G rows, every filer) =================
function quarters(fromY = 2013) { const out = [], now = new Date(); for (let y = fromY; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (Date.UTC(y, (q - 1) * 3, 1) <= now.getTime()) out.push([y, q]); return out; }
function masterRows() { const all = [], fail = []; let got = 0;
  for (const [y, q] of quarters()) { const key = y + 'q' + q, cf = SC + '/master/' + key + '.json.gz', cur = Date.now() < Date.UTC(y, q * 3, 1) + 7 * 864e5; let x = cur ? null : JZ(cf, null);
    if (!x) { const gz = SC + '/master.gz'; if (download(SEC + '/Archives/edgar/full-index/' + y + '/QTR' + q + '/master.gz', gz)) { let txt = null; try { txt = zlib.gunzipSync(fs.readFileSync(gz)).toString('latin1'); } catch (e) {} try { fs.unlinkSync(gz); } catch (e) {}
        if (txt) { x = []; for (const line of txt.split('\n')) { const r = masterRow(line); if (r) x.push(r); } if (x.length > 1000) { WZ(cf, x); got++; } else x = null; } } }
    if (!x) { fail.push(key); continue; } for (const r of x) all.push(r); }
  // the last 10 calendar days from the daily index (the full index runs to the previous business day)
  for (let k = 10; k >= 0; k--) { const d = iso(Date.now() - k * 864e5), wd = new Date(d).getUTCDay(); if (wd === 0 || wd === 6) continue; const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, f = SC + '/daily/' + d + '.json';
    let x = J(f, null); if (!x) { const tmp = SC + '/daily.idx'; if (download(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx', tmp)) { x = []; for (const line of fs.readFileSync(tmp, 'latin1').split('\n')) { const r = masterRow(line); if (r) x.push(r); } try { fs.unlinkSync(tmp); } catch (e) {} if (k > 0) W(f, x); } }
    if (x) for (const r of x) all.push(r); }
  STATUS.master = { ok: !fail.length, quarters: quarters().length, downloadedNow: got, missing: fail, rows: all.length }; log('master index: ' + all.length + ' 13F/13D/13G rows' + (fail.length ? ', MISSING ' + fail.join(' ') : '')); return all; }

// ================= 3. BUILD: giant CIK candidates (no prices, no returns) =================
const BASE_RE = { NVDA: /NVIDIA|NVENTURES/, GOOGL: /ALPHABET|GOOGLE|^GV\b|GV MANAGEMENT|^GV 20\d\d|CAPITALG/, AMZN: /AMAZON/, MSFT: /MICROSOFT/, AAPL: /^APPLE INC/, META: /META PLATFORMS|FACEBOOK/,
  INTC: /^INTEL CORP|INTEL CAPITAL/, QCOM: /QUALCOMM/, CRM: /SALESFORCE/, CSCO: /^CISCO/, ORCL: /^ORACLE/, SAMSUNG: /SAMSUNG/, SONY: /\bSONY\b/, TM: /TOYOTA|WOVEN (BY|PLANET|CAPITAL)/ };
async function build() { const rows = masterRows(), MC = J('data/squad24-megacaps.json', { companies: {}, quarters: {} }), by = new Map();
  const wideRe = []; for (const [cik, c] of Object.entries(MC.companies)) for (const al of c.aliases || []) if (al && al.length >= 3) wideRe.push([cik, new RegExp('(^|[^A-Z0-9])' + al.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Z0-9]|$)')]);
  for (const [cik, name, form, d] of rows) { const N = name.toUpperCase(); let hit = null; for (const [k, re] of Object.entries(BASE_RE)) if (re.test(N)) { hit = 'base:' + k; break; }
    if (!hit && MC.companies[cik]) hit = 'top100:' + cik; if (!hit) for (const [c, re] of wideRe) if (re.test(N)) { hit = 'wide-name:' + c; break; } if (!hit) continue;
    const o = by.get(cik) || by.set(cik, { cik, names: new Set(), hit, f13: 0, dg: 0, first13F: null, last13F: null, firstDG: null, lastDG: null }).get(cik); o.names.add(name);
    if (is13F(form)) { o.f13++; if (!o.first13F || d < o.first13F) o.first13F = d; if (!o.last13F || d > o.last13F) o.last13F = d; } else { o.dg++; if (!o.firstDG || d < o.firstDG) o.firstDG = d; if (!o.lastDG || d > o.lastDG) o.lastDG = d; } }
  // SIC + entity type of every candidate with base / top-100 hits, and of name matches (capped)
  const need = [...new Set([...Object.keys(MC.companies), ...[...by.values()].filter(o => o.hit.startsWith('base') || o.hit.startsWith('top100') || o.f13 > 0 || o.dg >= 3).map(o => o.cik)])].slice(0, 2500);
  const SUBC = J(SC + '/subinfo.json', {});
  for (const c of need) { if (c in SUBC) continue; if (left() < 30 * 60e3) break; const j = await sec(DSEC + '/submissions/CIK' + pad10(c) + '.json');
    SUBC[c] = j ? { name: j.name, sic: j.sic || null, sicDesc: j.sicDescription || null, type: j.entityType || null, tickers: j.tickers || [], former: (j.formerNames || []).map(x => x.name).slice(0, 5) } : null; }
  W(SC + '/subinfo.json', SUBC);
  // PROBE (plumbing only, no prices): NVIDIA's 13F text and three 13D/13G headers parse; one fails-to-deliver file reads
  const probe = {}; try { const nv = rows.filter(r => r[0] === '1045810'), f13 = nv.filter(r => r[2] === '13F-HR').sort((a, b) => a[3] < b[3] ? -1 : 1)[0], dg = nv.filter(r => isDG(r[2])).slice(-3);
    if (f13) { const a = adshOf(f13[4]), txt = await sec(txtUrl('1045810', a), 'text'), h = parseHeader(txt), inf = [...equityIssuers(parseInfoTable(txt)).values()]; probe.nvda13F = { adsh: a, header: h, issuers: inf }; }
    probe.nvdaDG = []; for (const r of dg) { const a = adshOf(r[4]), txt = await sec(hdrUrl('1045810', a), 'text'); probe.nvdaDG.push({ adsh: a, form: r[2], header: parseHeader(String(txt || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')), raw: String(txt || '').slice(0, 1500) });
      const full = await sec(txtUrl('1045810', a), 'text'); probe.nvdaDG[probe.nvdaDG.length - 1].cusip = coverCusip(full); }
    const zf = SC + '/probe.zip'; if (download(SEC + '/files/data/fails-deliver-data/cnsfails202402a.zip', zf)) { const t = execFileSync('unzip', ['-p', zf], { maxBuffer: 512e6 }).toString('latin1').split('\n'); probe.ftd = { lines: t.length, head: t.slice(0, 3), soun: t.filter(l => /\|SOUN\|/.test(l)).slice(0, 2) }; } else probe.ftd = 'download failed';
  } catch (e) { probe.error = String(e && e.message || e).slice(0, 300); }
  log('PROBE ' + JSON.stringify(probe).slice(0, 4000));
  const cand = [...by.values()].map(o => ({ cik: o.cik, hit: o.hit, names: [...o.names].slice(0, 4), f13: o.f13, dg: o.dg, first13F: o.first13F, last13F: o.last13F, firstDG: o.firstDG, lastDG: o.lastDG, sub: SUBC[o.cik] || null }))
    .sort((a, b) => a.hit < b.hit ? -1 : a.hit > b.hit ? 1 : b.f13 + b.dg - a.f13 - a.dg);
  const top = Object.entries(MC.companies).map(([cik, c]) => ({ cik, name: c.name, tickers: c.tickers, sub: SUBC[cik] || null, quarters: Object.entries(MC.quarters).filter(([, a]) => a.map(String).includes(cik)).map(([q]) => q), f13: (by.get(cik) || {}).f13 || 0, dg: (by.get(cik) || {}).dg || 0 }));
  W(GB, { generatedAt: new Date().toISOString(), note: 'BUILD output: EDGAR 13F/13D/13G filer CIK candidates by name and the SIC of each Squad 24 top-100 company. NO prices, NO returns. The frozen list is data/squad25-giants.json (written by hand from this file before the rule run).', master: STATUS.master, probe, top100: top, candidates: cand }, true);
  log('BUILD: ' + cand.length + ' candidate CIKs, ' + top.length + ' top-100 companies; SEC requests ' + secReq + ', failed ' + secFail + ' ' + SECFAILS.slice(0, 3).join(' | ')); }
if (MODE === 'BUILD') { await build(); process.exit(0); }

// ================= 4. THE FROZEN GIANTS =================
const GRAW = (() => { try { return fs.readFileSync(GF); } catch (e) { return null; } })(), GSHA = GRAW ? crypto.createHash('sha256').update(GRAW).digest('hex') : null;
STATUS.giants = { ok: !!GRAW && !!GIANTS_SHA && GSHA === GIANTS_SHA, sha: GSHA, expected: GIANTS_SHA };
if (!STATUS.giants.ok) { log('frozen giants list missing or not the registered one (' + GSHA + ' vs ' + GIANTS_SHA + '): nothing run'); W(OUT, { ...PREV, generatedAt: new Date().toISOString(), data: STATUS }, true); process.exit(0); }
const G = JSON.parse(GRAW.toString()), GI = giantIndex(G), GCIK = new Set(GI.keys());
log('frozen giants: ' + G.giants.length + ' giants (' + G.giants.filter(g => g.group === 'base').length + ' base), ' + GCIK.size + ' CIKs');

// ================= 5. PRICES (squad 21 / 24 pattern) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad25-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop();
for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6) continue;
  const j = await mv('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || j.notFound || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; }
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (/^[A-Z]{1,5}$/.test(s) && !SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const CA = new Float32Array(N).fill(NaN), OA = new Float32Array(N).fill(NaN), HA = new Float32Array(N).fill(NaN), LA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; HA[k] = x.h ? x.h[j] : NaN; LA[k] = x.l ? x.l[j] : NaN; MAIN[k] = 1; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o ? x.x.o[j] : NaN; VA[k] = x.x.v ? x.x.v[j] : NaN; HA[k] = x.x.h ? x.x.h[j] : NaN; LA[k] = x.x.l ? x.x.l[j] : NaN; } });
store = null;
const SPL = J('data/splits.json', { splits: [] }), SPLITS = new Map(); for (const x of SPL.splits || []) { if (!x || !x.s || !(x.r > 0)) continue; (SPLITS.get(x.s) || SPLITS.set(x.s, []).get(x.s)).push(x); }
{ let fixed = 0; for (const [s, a] of SPLITS) { const i = SY.get(s); if (i === undefined) continue; for (const x of a) { if (x.d <= cacheLast || x.d > D[T - 1]) continue; const r = x.r, ta = D.findIndex(z => z >= x.d); if (ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; HA[q] /= r; LA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; } } log('splits after the cache: ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'); if (spyI === undefined) { console.log('squad25-lab: SPY missing; nothing done'); process.exit(0); }
const ser = (A, i) => A.subarray(i * T, i * T + T), series = (i) => ({ o: ser(OA, i), h: ser(HA, i), l: ser(LA, i), c: ser(CA, i), v: ser(VA, i) });
const LIQ = new Uint8Array(N), DV = new Float32Array(N).fill(NaN);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0, s2 = 0, n2 = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN, w2 = CA[b + t] * VA[b + t]; if (isFinite(v)) { s += v; n++; } if (isFinite(w2)) { s2 += w2; n2++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN, z = CA[k] * VA[k]; if (isFinite(w)) { s -= w; n--; } if (isFinite(z)) { s2 -= z; n2--; } }
    if (t >= 19 && n === 20 && CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; if (t >= 19 && n2 >= 18) DV[b + t] = s2 / n2; } }
STATUS.price = { ok: T >= 1000, sessions: T, from: D[0], to: D[T - 1], stocks: NS };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks)');
const closeAt = (i, x, k) => { for (let q = Math.min(x, T - 1); q >= k; q--) { const z = CA[i * T + q]; if (z > 0) return z; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1 || x < k) return null; const e = OA[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
const JUMPS = new Map(), artifactIn = (i, a, b) => { if (!JUMPS.has(i)) JUMPS.set(i, artifactJumps(ser(CA, i))); return hasArtifact(JUMPS.get(i), a, b); };
const inU = (i, t) => t >= 0 && t < T && i !== spyI && CA[i * T + t] >= TH.minClose && DV[i * T + t] >= TH.minDv;
const spyRet = (k, x) => { const e = OA[spyI * T + k], y = closeAt(spyI, x, k); return e > 0 && y > 0 ? y / e - 1 : null; };

// ================= 6. IDENTITY: point-in-time ticker spans (squad 4 cache, read only) + fails-to-deliver CUSIPs =================
const CIKMAP = new Map(); { let q = 0; for (const f of (() => { try { return fs.readdirSync(SC4 + '/f345'); } catch (e) { return []; } })()) { const x = JZ(SC4 + '/f345/' + f, null); if (!x) continue; q++;
    for (const [sym, cik, a, b, n] of x.map) (CIKMAP.get(cik) || CIKMAP.set(cik, []).get(cik)).push([sym, a, b, n]); } STATUS.tickerMap = { ok: q >= 20, quarters: q, ciks: CIKMAP.size }; log('ticker map: ' + JSON.stringify(STATUS.tickerMap)); }
const SH = JZ('data/shares.json.gz', { t: {}, c: {} }), SECCIK = J('data/sec-ciks.json', {});
const todayCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(+a); const y = SECCIK[s]; return y ? String(+y[0]) : null; };
const TODAYSYMS = new Map(); for (const s of SYMS) { const c = todayCik(s); if (c) (TODAYSYMS.get(c) || TODAYSYMS.set(c, []).get(c)).push(s); }
const hasPx = (i, t) => { for (let q = Math.max(0, t - 5); q <= Math.min(T - 1, t + 5); q++) if (CA[i * T + q] > 0) return true; return false; };
const symFor = (cik, d) => { const t = Math.min(firstOnOrAfter(D, d), T - 1), c = String(+cik), sp = (CIKMAP.get(c) || []).filter(s => d >= addDays(s[1], -400) && d <= addDays(s[2], 400)).sort((a, b) => b[3] - a[3]);
  for (const s of [...sp.map(x => x[0]), ...(TODAYSYMS.get(c) || [])]) { const i = SY.get(s); if (i !== undefined && hasPx(i, t)) return s; } return null; };
const SPANCIK = new Map(); for (const [cik, a] of CIKMAP) for (const [sym, f, l, n] of a) (SPANCIK.get(sym) || SPANCIK.set(sym, []).get(sym)).push([cik, f, l, n]);
const cikOn = (sym, d) => { const a = (SPANCIK.get(sym) || []).filter(s => d >= addDays(s[1], -400) && d <= addDays(s[2], 400)).sort((x, y) => y[3] - x[3]); return a.length ? String(+a[0][0]) : todayCik(sym); };
const splitFactorAfter = (sym, d) => (SPLITS.get(sym) || []).filter(x => x.d > d && x.d <= D[T - 1]).reduce((a, x) => a * x.r, 1);
// fails-to-deliver: cusip -> [[date, sym]] (one per file and symbol change), from 2019
const FTD = new Map(); { const fail = []; let files = 0;
  for (let y = 2019; y <= new Date().getUTCFullYear(); y++) for (let m = 1; m <= 12; m++) for (const h of ['a', 'b']) { const key = y + String(m).padStart(2, '0') + h, cf = SC + '/ftd/' + key + '.json.gz';
    if (Date.UTC(y, m - 1, h === 'a' ? 20 : 35) > Date.now() - 10 * 864e5) continue; let x = JZ(cf, null);
    if (!x) { const zf = SC + '/ftd.zip'; if (download(SEC + '/files/data/fails-deliver-data/cnsfails' + key + '.zip', zf)) { let txt = null; try { txt = execFileSync('unzip', ['-p', zf], { maxBuffer: 512e6 }).toString('latin1'); } catch (e) {} try { fs.unlinkSync(zf); } catch (e) {}
        if (txt) { const o = {}; for (const line of txt.split('\n')) { const p = line.split('|'); if (p.length < 5 || !/^\d{8}$/.test(p[0].trim())) continue; const c = p[1].trim().toUpperCase(), s = p[2].trim().toUpperCase(), d = p[0].trim(); if (!c || !s) continue; const dd = d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6); if (!o[c] || o[c][0] > dd) o[c] = [dd, s]; }
          x = Object.entries(o).map(([c, [d, s]]) => [c, d, s]); if (x.length > 500) WZ(cf, x); else x = null; } } }
    if (!x) { fail.push(key); continue; } files++; for (const [c, d, s] of x) { const a = FTD.get(c) || FTD.set(c, []).get(c); a.push([d, s]); const c8 = c.slice(0, 8); if (c8 !== c) { const b = FTD.get(c8) || FTD.set(c8, []).get(c8); b.push([d, s]); } } }
  for (const a of FTD.values()) a.sort((x, y) => x[0] < y[0] ? -1 : 1);
  STATUS.ftd = { ok: fail.length <= 3, files, missing: fail.slice(0, 20), cusips: FTD.size }; log('fails-to-deliver: ' + files + ' files, ' + FTD.size + ' CUSIP keys' + (fail.length ? ', missing ' + fail.length + ' ' + fail.slice(0, 6).join(' ') : '')); }

// ================= 7. GIANT FILINGS =================
const rows = masterRows(); const GROWS = new Map();   // adsh -> { adsh, ciks:Set (giant ciks), form, date }
for (const [cik, , form, d, file] of rows) { if (!GCIK.has(cik)) continue; const a = adshOf(file); if (!a) continue; const o = GROWS.get(a) || GROWS.set(a, { adsh: a, ciks: new Set(), form, date: d, fileCik: cik }).get(a); o.ciks.add(cik); }
// fresh days: each giant CIK's submissions JSON (recent filings only)
{ let fresh = 0; const since = addDays(iso(Date.now()), -20);
  for (const cik of GCIK) { const j = await sec(DSEC + '/submissions/CIK' + pad10(cik) + '.json'); const R = j && j.filings && j.filings.recent; if (!R) continue;
    for (let k = 0; k < (R.form || []).length; k++) { const form = R.form[k], d = R.filingDate[k], a = R.accessionNumber[k]; if (!FORMS.has(form) || d < since) continue; const o = GROWS.get(a) || GROWS.set(a, { adsh: a, ciks: new Set(), form, date: d, fileCik: cik }).get(a); if (!o.ciks.has(cik)) { o.ciks.add(cik); fresh++; } } }
  log('submissions JSON: ' + fresh + ' recent giant filings added'); }
// headers (cached): adsh -> { a: accept, f: form, p: period, by: [..], sub: [..], fil: [..], nm: { cik: name } }
const HDR = J(SC + '/headers.json', {}), INFO = J(SC + '/info13f.json', {}), CUS = J(SC + '/cusips.json', {}); let hdrNow = 0, hdrMiss = 0;
const want = [...GROWS.values()].filter(o => (is13F(o.form) && o.date >= '2019-01-01') || isDG(o.form));
for (const o of want) { if (o.adsh in HDR && (!is13F(o.form) || o.adsh in INFO)) continue; if (left() < 60 * 60e3) { hdrMiss++; continue; }
  if (is13F(o.form)) { const txt = await sec(txtUrl(o.fileCik, o.adsh), 'text'); if (!txt) { hdrMiss++; continue; } const h = parseHeader(txt); HDR[o.adsh] = { a: h.accept, f: h.form, p: h.period, by: h.filedBy, sub: h.subject, fil: h.filer, nm: h.names };
    INFO[o.adsh] = [...equityIssuers(parseInfoTable(txt))].map(([k, v]) => [k, v.cusip, v.name]); }
  else { const txt = await sec(hdrUrl(o.fileCik, o.adsh), 'text'); if (!txt) { hdrMiss++; continue; } const h = parseHeader(txt.replace(/&lt;/g, '<').replace(/&gt;/g, '>')); HDR[o.adsh] = { a: h.accept, f: h.form, p: h.period, by: h.filedBy, sub: h.subject, fil: h.filer, nm: h.names }; }
  hdrNow++; if (hdrNow % 400 === 0) { W(SC + '/headers.json', HDR); W(SC + '/info13f.json', INFO); log('headers read: ' + hdrNow); } }
W(SC + '/headers.json', HDR); W(SC + '/info13f.json', INFO);
STATUS.filings = { ok: hdrMiss <= Math.max(3, want.length * 0.005), giantFilings: want.length, readNow: hdrNow, notRead: hdrMiss }; log('giant filings: ' + want.length + ' (13F since 2019 + all 13D/13G since 2013), headers read now ' + hdrNow + ', not read ' + hdrMiss);

// ================= 8. EVENTS =================
const accIsoOf = (a) => etToIso(a, nyParts), RAW = [], FUN = { f13Filings: 0, f13New: 0, dgFilings: 0, dgAsSubject: 0, dgEvents: 0 };
// 13D / 13G per giant group
const byGiant = new Map(); for (const o of want) { if (!isDG(o.form)) continue; const h = HDR[o.adsh]; if (!h || !h.a) continue; FUN.dgFilings++; const sub = (h.sub || [])[0]; if (!sub) continue;
  const gc = [...o.ciks].filter(c => c !== sub && (!(h.by || []).length || h.by.includes(c))); if (!gc.length || GCIK.has(sub) && GI.get(sub) === GI.get(gc[0])) { FUN.dgAsSubject++; continue; }
  const g = GI.get(gc[0]); (byGiant.get(g.id) || byGiant.set(g.id, []).get(g.id)).push({ adsh: o.adsh, form: h.f || o.form, accept: h.a, subject: sub, giant: g.id, cik: gc[0], subjName: (h.nm || {})[sub] || null }); }
const DGALL = new Map();   // giant id -> [{ subject, accept }] (for the 13F 'already public' check)
for (const [gid, fl] of byGiant) { DGALL.set(gid, fl.map(f => ({ subject: f.subject, accept: f.accept }))); for (const e of dgEvents(fl)) { FUN.dgEvents++; RAW.push({ kind: e.form.replace(/^SCHEDULE /, 'SC '), giant: gid, cik: e.cik, adsh: e.adsh, accept: e.accept, subject: e.subject, name: e.subjName, firstOnSubject: e.firstOnSubject }); } }
// 13F first appearances per CIK
{ const by = new Map(); for (const o of want) { if (!is13F(o.form)) continue; const h = HDR[o.adsh], inf = INFO[o.adsh]; if (!h || !h.a || !inf) continue; FUN.f13Filings++;
    for (const c of o.ciks) (by.get(c) || by.set(c, []).get(c)).push({ adsh: o.adsh, form: h.f || o.form, accept: h.a, period: h.p, issuers: new Map(inf.map(([k, cu, nm]) => [k, { cusip: cu, name: nm }])) }); }
  for (const [cik, fl] of by) for (const e of firstAppearances(fl)) { FUN.f13New++; const f = fl.find(x => x.adsh === e.adsh); RAW.push({ kind: '13F-HR', giant: GI.get(cik).id, cik, adsh: e.adsh, accept: f.accept, cusip: e.cusip, name: e.name, firstEver: e.firstEver }); } }
log('raw events: ' + RAW.length + ' ' + JSON.stringify(FUN));
// issuer -> symbol, filters, market value
const DET = J(SC + '/details.json', {}), CUSQ = J(SC + '/cusipq.json', {});
async function details(sym, d) { const key = sym + '|' + d; if (!(key in DET)) { const j = await mv('/v3/reference/tickers/' + encodeURIComponent(sym) + '?date=' + d), x = j && j.results; DET[key] = x ? { type: x.type || null, mc: x.market_cap || null, ws: x.weighted_shares_outstanding || x.share_class_shares_outstanding || null, cik: x.cik ? String(+x.cik) : null, name: x.name || null } : (j && j.notFound ? { nf: 1 } : null); } return DET[key]; }
async function cusipMassive(cusip, d, name) { const key = cusip + '|' + d; if (!(key in CUSQ)) { const j = await mv('/v3/reference/tickers?cusip=' + encodeURIComponent(cusip) + '&date=' + d + '&limit=5'), r = (j && j.results) || [];
    const w = String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 4); CUSQ[key] = r.length >= 1 && r.length <= 2 && w && r.every(x => String(x.name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').startsWith(w)) ? r[0].ticker : null; } return CUSQ[key]; }
const COUNT = { raw: RAW.length, before: 0, noSym: 0, noPx: 0, giantIssuer: 0, alreadyPublic: 0, filters: {}, events: 0 }, EVENTS = [];
for (const e of RAW) { const accIso = accIsoOf(e.accept); if (!accIso) continue; const accMs = Date.parse(accIso), x = nyParts(accMs); if (x.d < addDays(D[0], 40)) { COUNT.before++; continue; }
  let sym = null, via = null;
  if (e.subject) { sym = symFor(e.subject, x.d); via = 'f345'; if (!sym) { let cu = CUS[e.adsh]; if (cu === undefined) { const o = GROWS.get(e.adsh), txt = await sec(txtUrl(o.fileCik, e.adsh), 'text'); cu = CUS[e.adsh] = txt ? coverCusip(txt) : null; } if (cu) { sym = ftdSym(FTD, cu, x.d); via = 'ftd'; } } }
  else { sym = ftdSym(FTD, e.cusip, x.d); via = 'ftd'; if (!sym) { sym = await cusipMassive(e.cusip, x.d, e.name); via = 'massive'; } }
  if (!sym) { COUNT.noSym++; continue; } const i = SY.get(sym); if (i === undefined) { COUNT.noPx++; continue; }
  const S0 = sessionsOf(D, x), p = S0.p; if (p < 21 || p >= T || !(CA[i * T + p] > 0)) { COUNT.noPx++; continue; }
  const icik = e.subject || cikOn(sym, D[p]); if (icik && GCIK.has(String(+icik))) { COUNT.giantIssuer++; continue; }
  if (e.kind === '13F-HR' && icik) { const pub = (DGALL.get(e.giant) || []).some(f => f.subject === String(+icik) && f.accept < e.accept); if (pub) { COUNT.alreadyPublic++; continue; } }
  const close = CA[i * T + p], dv = DV[i * T + p]; let why = universeFail(close, dv, 1); if (why) { COUNT.filters[why] = (COUNT.filters[why] || 0) + 1; continue; }
  const det = await details(sym, D[p]); if (det && det.type && !/^(CS|ADRC|OS|GDR|NYRS)$/.test(det.type)) { COUNT.filters['not a company share (' + det.type + ')'] = (COUNT.filters['not a company share (' + det.type + ')'] || 0) + 1; continue; }
  let sh = icik ? sharesKnown(SH.c[String(+icik)], D[p]) : null, shSrc = 'sec'; if (!sh) { const dd = addDays(D[p], -TH.shareLag), d2 = await details(sym, dd); if (d2 && d2.ws > 0) { sh = d2.ws * splitFactorAfter(sym, dd); shSrc = 'massive'; } }
  const cap = sh ? sh * close : null; why = universeFail(close, dv, cap); if (why) { COUNT.filters[why] = (COUNT.filters[why] || 0) + 1; continue; }
  COUNT.events++; EVENTS.push({ ...e, sym, i, via, icik, accIso, accMs, ny: x, p, kA: S0.kA, phase: S0.phase, close, dv, cap, shSrc, small: cap < TH.smallCap, g: G.giants.find(z => z.id === e.giant) }); }
W(SC + '/details.json', DET); W(SC + '/cusipq.json', CUSQ); W(SC + '/cusips.json', CUS);
EVENTS.sort((a, b) => a.accMs - b.accMs || a.i - b.i);
STATUS.dataOk = STATUS.price.ok && STATUS.master.ok && STATUS.tickerMap.ok && STATUS.filings.ok && STATUS.ftd.ok && STATUS.giants.ok;
const inGroup = (z, grp) => giantOn(z.g, grp, z.ny.d);
const evOf = (grp) => { const seen = new Set(); return EVENTS.filter(z => inGroup(z, grp)).filter(z => { const k = z.sym + '|' + z.accMs; if (seen.has(k)) return false; seen.add(k); return true; }); };
const countsOf = (evs) => ({ older: evs.filter(z => halfOf(D[z.p]) === 'older').length, newer: evs.filter(z => halfOf(D[z.p]) === 'newer').length });
const EV = { base: evOf('base'), wide: evOf('wide') }, COUNTS = { base: countsOf(EV.base), wide: countsOf(EV.wide) };
log('funnel ' + JSON.stringify(COUNT) + ' | CASE COUNTS base older ' + COUNTS.base.older + ' newer ' + COUNTS.base.newer + ' | wide older ' + COUNTS.wide.older + ' newer ' + COUNTS.wide.newer);

// ================= 9. ENTRY B: Alpaca SIP minute bars =================
const MB = J(SC + '/minutes.json', {});   // adsh|sym -> { bar: { t, o, hm, d }, s1Open } | { none: reason }
async function bFill(z) { const key = z.adsh + '|' + z.sym; if (MB[key] && !(MB[key].none && MB[key].retry)) return MB[key];
  const start = new Date(z.accMs).toISOString(), end = new Date(z.accMs + 5 * 864e5).toISOString(), m = await alpBars(z.sym, '1Min', start, end, 'raw');
  if (m.err && !m.bars.length) return (MB[key] = { none: 'alpaca ' + m.err, retry: true });
  const M = m.bars.map(b => { const t = Date.parse(b.t); return { ms: t, o: b.o, ny: nyParts(t) }; }), fb = fillBar(M, z.accMs); if (!fb) return (MB[key] = { none: 'no minute bar' });
  const bs = bSession(D, fb.ny); if (bs.s1 >= T) return (MB[key] = { none: 'after the window', retry: true });
  const dd = await alpBars(z.sym, '1Day', D[bs.s1] + 'T00:00:00Z', D[bs.s1] + 'T23:59:00Z', 'raw'), db = (dd.bars || []).find(b => nyParts(Date.parse(b.t)).d === D[bs.s1] || b.t.slice(0, 10) === D[bs.s1]);
  return (MB[key] = { bar: { ms: fb.ms, o: fb.o, d: fb.ny.d, hm: fb.ny.hm }, s1: D[bs.s1], preOpen: bs.preOpen, s1Open: db ? db.o : null }); }

// ================= 10. TRADES AND THE ONE-SHOT =================
const liqMemo = new Map(), liqList = (t) => { if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const uMemo = new Map(), uList = (t) => { if (!uMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (inU(i, t)) a.push(i); uMemo.set(t, a); if (uMemo.size > 60) uMemo.delete(uMemo.keys().next().value); } return uMemo.get(t); };
const avgOver = (list, k, x) => { const v = []; for (const i of list) { if (artifactIn(i, k - 1, x)) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } return v.length >= 50 ? mean(v) : null; };
async function tradesOf(evs, ver, end = T - 1) { const out = [], busy = new Map(), spans = new Map(); let artifacts = 0, noYard = 0, noOpen = 0, noB = 0; const noBWhy = {};
  for (const z of evs) { const S = series(z.i); let s1, e, openCheck1, ext = false, fill = null;
    if (ver === 'A') { s1 = z.kA; if (s1 > end) continue; e = OA[z.i * T + s1]; openCheck1 = false; if (!(e > 0)) { noOpen++; continue; } }
    else { const b = await bFill(z); if (!b || b.none) { noB++; noBWhy[b ? b.none : 'none'] = (noBWhy[b ? b.none : 'none'] || 0) + 1; continue; } s1 = tOf.get(b.s1); if (s1 === undefined || s1 > end) { noB++; continue; }
      const co = OA[z.i * T + s1]; if (!(co > 0) || !(b.s1Open > 0)) { noB++; noBWhy['no session-1 open'] = (noBWhy['no session-1 open'] || 0) + 1; continue; } e = b.bar.o * (co / b.s1Open); openCheck1 = b.preOpen; ext = isExtHm(b.bar.hm); fill = b.bar; }
    if ((busy.get(z.i) ?? -1) >= s1) continue; const ex = exitFrom(S, s1, e, openCheck1, end + 1); if (!ex) { noOpen++; continue; } if (ex.open) continue;
    if (artifactIn(z.i, z.p - 1, ex.x)) { artifacts++; continue; } const lc = Math.max(s1, ex.lastClose), c = avgOver(uList(z.p), s1, lc); if (c === null) { noYard++; continue; }
    busy.set(z.i, ex.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([s1, ex.x]);
    const s0 = ext ? EXT_SLIP : 0, g0 = grossSlip(e, ex.px, s0);
    out.push({ t: z.p, s: z.sym, i: z.i, k: s1, x: ex.x, lc, kind: ex.kind, days: Math.max(1, ex.held), g: capG(g0), g0, gs: capG(grossSlip(e * (1 + s0), ex.px * (1 - s0), SLIP)), ext, fill, c, liq: avgOver(liqList(z.p), s1, lc), spy: spyRet(s1, lc), half: halfOf(D[z.p]), small: z.small, ev: z }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.lc - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 30, to: end, len, step: 5, busy: spans.get(z.i) || [], mode: 'capBoth', okAt: (u) => inU(z.i, u - 1) && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(key); }
  out.artifacts = artifacts; out.noYard = noYard; out.noOpen = noOpen; out.noB = noB; out.noBWhy = noBWhy; return out; }
function judgeTrades(id, tr, counts) { const B = TH.block, R = { older: halfStat(tr.filter(z => z.half === 'older'), B), newer: halfStat(tr.filter(z => z.half === 'newer'), B), all: halfStat(tr, B) };
  const H3 = ['older', 'newer', 'all'], inH = (z, h) => h === 'all' || z.half === h;
  const slipH = Object.fromEntries(H3.map(h => { const a = tr.filter(z => inH(z, h)); return [h, { n: a.length, avg: r4(mean(a.map(z => z.gs - COST))) }]; }));
  const liqH = Object.fromEntries(H3.map(h => { const a = tr.filter(z => inH(z, h) && ok(z.liq)); return [h, { n: a.length, edge: r4(mean(a.map(z => z.g - z.liq))) }]; }));
  const smallH = Object.fromEntries(H3.map(h => { const a = tr.filter(z => inH(z, h) && z.small); return [h, { n: a.length, avg: r4(mean(a.map(z => z.g - COST))), stress: r4(mean(a.map(z => z.g - STRESS))), slip: r4(mean(a.map(z => z.gs - COST))), edge: r4(mean(a.map(z => z.g - z.c))) }]; }));
  const kindH = Object.fromEntries(['13F-HR', 'SC 13D', 'SC 13G', 'SC 13D/A', 'SC 13G/A'].map(k => { const a = tr.filter(z => z.ev.kind === k); return [k, { n: a.length, avg: r4(mean(a.map(z => z.g - COST))), slip: r4(mean(a.map(z => z.gs - COST))), edge: r4(mean(a.map(z => z.g - z.c))) }]; }));
  const PY = Object.fromEntries(['older', 'newer'].map(h => { const a = tr.filter(z => z.half === h); return [h, { rule: r4(perYear(a)), spy: r4(perYear(a.filter(z => ok(z.spy)).map(z => ({ g: z.spy, days: z.days })), 'g', 0)), avgStock: r4(perYear(a.map(z => ({ g: z.c, days: z.days })), 'g', 0)) }]; }));
  const extra = []; for (const h of ['older', 'newer']) if (!(slipH[h].avg > 0)) extra.push('loses with 2% slippage each way in the ' + h + ' half (' + pc(slipH[h].avg) + ')');
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] }, extra });
  return { ...v, name: RULES[id].name, kind: 'buy', family: RULES[id].family, hold: TH.hold, block: B, group: RULES[id].group, entry: RULES[id].entry, caseCounts: counts, results: R, slippage: slipH, perYear: PY,
    underTwoBillion: { note: 'information: market value under 2B USD at the last close before acceptance', ...smallH }, byForm: kindH, liquidYardstick: { note: 'information: edge vs the average liquid stock (5 USD+, 5M USD+ a day)', ...liqH },
    extHoursFills: tr.filter(z => z.ext).length, shape: shapeOf(tr), artifactsLeftOut: tr.artifacts, noYardstick: tr.noYard, noEntryOpen: tr.noOpen, noMinuteFill: tr.noB, noMinuteWhy: tr.noBWhy,
    funnel: COUNT, split: SPLIT, cost: COST, yardstick: 'average stock (close 1 USD+, 20-day traded value 0.5M USD+) on the same sessions; capBoth (AUD-1)' }; }
const RES = {}, INFO2 = {}, TRS = {}; const need = Object.values(IDS).filter(id => !FROZEN[id]);
const fmt = (h) => (h.n || 0) + ' (' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock;
if (need.length || env.HISTORY || MODE === 'RUN') {
  if (!STATUS.dataOk) { for (const id of need) RES[id] = { verdict: 'NOT RUN', why: 'data not complete this run: ' + JSON.stringify({ master: STATUS.master.ok, tickerMap: STATUS.tickerMap.ok, filings: STATUS.filings, ftd: STATUS.ftd.ok }).slice(0, 400) }; log('NOT RUN (data)'); }
  else { for (const id of [IDS.A, IDS.B, IDS.WA, IDS.WB]) { const R = RULES[id], tr = TRS[id] = await tradesOf(EV[R.group], R.entry), r = judgeTrades(id, tr, COUNTS[R.group]);
      if (FALLBACK_OF[id]) { const base = RES[FALLBACK_OF[id]] || FROZEN[FALLBACK_OF[id]]; if (!base || base.verdict !== 'TOO FEW CASES') { INFO2[id] = { ...r, verdict: 'INFORMATION ONLY (fallback not needed: ' + FALLBACK_OF[id] + ' had enough cases)', why: r.why }; log('- ' + id + ' (information): ' + r.verdict + ' | older ' + fmt(r.results.older) + ' | newer ' + fmt(r.results.newer)); continue; } }
      RES[id] = r; log('- ' + id + ': ' + r.verdict + ' | older ' + fmt(r.results.older) + ' | newer ' + fmt(r.results.newer) + ' | slippage ' + pc(r.slippage.older.avg) + ' / ' + pc(r.slippage.newer.avg) + ' | ' + String(r.why).slice(0, 300)); } }
  W(SC + '/minutes.json', MB); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), (r) => r && r.verdict && r.verdict !== 'NOT RUN');

// ================= 11. CASE LIST + SOUN =================
const tradeBy = (id) => new Map((TRS[id] || []).map(z => [z.ev.adsh + '|' + z.s, z]));
const TA = tradeBy(IDS.A), TB = tradeBy(IDS.B), TWA = tradeBy(IDS.WA), TWB = tradeBy(IDS.WB);
const tRow = (t) => t ? { buy: D[t.k], fill: t.fill ? t.fill.d + ' ' + t.fill.hm : 'open', ext: t.ext, sell: D[t.x], exit: t.kind, held: t.days, gross: r4(t.g0), net: r4(t.g - COST), netSlip: r4(t.gs - COST), avgStock: r4(t.c - COST), sameStock: r4(ok(t.own) ? t.own - COST : null), spy: r4(t.spy) } : null;
const caseRow = (z) => ({ sym: z.sym, giant: z.giant, giantCik: z.cik, form: z.kind, adsh: z.adsh, acceptedNY: z.ny.d + ' ' + z.ny.hm, phase: z.phase, issuer: z.name, cusip: z.cusip || null, subjectCik: z.subject || null, mappedVia: z.via,
  firstEver13F: z.firstEver || false, lastClose: r4(z.close), marketCap: Math.round(z.cap), under2B: z.small, base: inGroup(z, 'base'),
  A: tRow(TA.get(z.adsh + '|' + z.sym) || TWA.get(z.adsh + '|' + z.sym)), B: tRow(TB.get(z.adsh + '|' + z.sym) || TWB.get(z.adsh + '|' + z.sym)) });
const caseList = EVENTS.map(caseRow);
const soun = (() => { const raw = RAW.filter(e => /SOUNDHOUND/i.test(e.name || '') || e.subject === '1840856'), ev = caseList.filter(c => c.sym === 'SOUN');
  return { note: 'The owner\'s +93% day: NVIDIA\'s first 13F-HR (accepted 2024-02-14 16:12 New York) showed SOUN.', rawEvents: raw.map(e => ({ giant: e.giant, form: e.kind, adsh: e.adsh, acceptedNY: e.accept ? nyParts(Date.parse(accIsoOf(e.accept))).d + ' ' + nyParts(Date.parse(accIsoOf(e.accept))).hm : null, cusip: e.cusip || null, firstEver: e.firstEver || false })),
    caught: ev.length > 0, events: ev }; })();
log('SOUN: ' + JSON.stringify(soun).slice(0, 900));

// ================= 12. PAPER LANE (from PAPER_START; RECORD ONLY) =================
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const sigIds = new Set(lines.filter(x => x.type === 'signal').map(x => x.id)), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), newLines = [], lastT = T - 1;
if (STATUS.filings.ok) for (const z of EVENTS) { if (z.ny.d < PAPER_START) continue;
  for (const id of Object.values(IDS)) { const R = RULES[id]; if (!inGroup(z, R.group)) continue; const sid = id + '|' + z.sym + '|' + z.adsh; if (sigIds.has(sid)) continue; const late = R.entry === 'A' ? z.kA <= lastT : true;
    let b = null; if (R.entry === 'B') { try { b = await bFill(z); } catch (e) {} }
    const line = { type: 'signal', id: sid, m: id, sym: z.sym, d: z.ny.d, acceptedNY: z.ny.d + ' ' + z.ny.hm, giant: z.giant, form: z.kind, adsh: z.adsh, close: r4(z.close), marketCap: Math.round(z.cap), halal: halal(z.sym), hold: TH.hold, recordedAfter: D[lastT],
      entryDate: R.entry === 'A' ? (z.kA <= lastT ? D[z.kA] : nextSession(D[lastT])) : (b && b.s1) || null, fill: R.entry === 'B' && b && b.bar ? { at: b.bar.d + ' ' + b.bar.hm, price: b.bar.o, ext: isExtHm(b.bar.hm) } : null, late,
      plan: 'PAPER ONLY (record, no alert): ' + (R.entry === 'A' ? 'buy at the open of ' + (z.kA <= lastT ? D[z.kA] : nextSession(D[lastT])) : 'buy the first minute after acceptance' + (b && b.bar ? ' (' + b.bar.d + ' ' + b.bar.hm + ' at ' + b.bar.o + ')' : '')) + '; stop 25% under the fill; sell at the close of the 10th session' };
    sigIds.add(sid); newLines.push(line); lines.push(line); } }
for (const x of lines.filter(x => x.type === 'signal')) { const i = SY.get(x.sym), k = tOf.get(x.entryDate); if (i === undefined || k === undefined) { x._state = 'waiting'; continue; }
  const isB = /-B$/.test(x.m), e = isB ? null : OA[i * T + k]; let entry = e, ext = false, pre = false;
  if (isB) { if (!x.fill || !(x.fill.price > 0)) { x._state = 'void'; continue; } entry = x.fill.price; ext = !!x.fill.ext; pre = ext; }
  const ex = exitFrom(series(i), k, entry, pre, T); if (!ex) { x._state = 'void'; continue; } if (ex.open) { x._state = 'open'; x._mark = ex.mark; continue; }
  const lc = Math.max(k, ex.lastClose), s0 = ext ? EXT_SLIP : 0, g = grossSlip(entry, ex.px, s0), c = avgOver(uList(Math.max(0, k - 1)), k, lc); x._state = 'closed'; x._g = g; x._c = c;
  if (!resolved.has(x.id)) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[ex.x], exit: ex.kind, held: ex.held, g: r4(g), net: r4(capG(g) - COST), avgStock: c === null ? null : r4(c - COST), spy: r4(spyRet(k, lc)) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
const mine = (id) => lines.filter(x => x.type === 'signal' && x.m === id);
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: PAPER_START, note: 'PAPER ONLY, RECORD ONLY (no Telegram, no buy message from this lab). A rule is a buy only if its frozen 5-year verdict meets the TRY SMALL standard (data/squad25-lab.json firstRun). Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.',
  methods: Object.fromEntries(Object.values(IDS).map(id => [id, { name: RULES[id].name, hold: TH.hold, tier: firstRun[id] ? firstRun[id].verdict : null,
    newSignals: mine(id).filter(x => x.recordedAfter === D[lastT] && !(RULES[id].entry === 'A' && x.late)).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, giant: x.giant, form: x.form, plan: x.plan })),
    open: mine(id).filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, sinceBuy: r4(x._mark ?? NaN) })) }])) }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: PAPER_START, cost: COST, methods: Object.fromEntries(Object.values(IDS).map(id => { const m = mine(id), closed = m.filter(x => x._state === 'closed').map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c }));
  return [id, { name: RULES[id].name, hold: TH.hold, signals: m.length, open: m.filter(x => x._state === 'open').length, waiting: m.filter(x => x._state === 'waiting').length, closed: boardStats(closed), frozen: firstRun[id] ? { verdict: firstRun[id].verdict, frozenAt: firstRun[id].frozenAt } : null }]; })) }, null, 1));

// ================= 13. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), squad: 25, philosophy: 'a giant (NVIDIA, Alphabet, Amazon ...) newly shows a stake in a 1 USD+, under-10B company (13F-HR first appearance, or 13D / 13G); bought at the next open (A) or the first minute after the SEC acceptance (B); held 10 sessions',
  preRegistered: 'squad25-core.mjs header (27 Oct 2026, before any run) + data/strategy-library.json ' + Object.values(IDS).join(', ') + '; frozen giants ' + GF + ' sha256 ' + GIANTS_SHA, window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS,
  caseCounts: COUNTS, funnel: { ...FUN, ...COUNT },
  standard: 'both halves (acceptance session before / from ' + SPLIT + '): > 0 after 0.8% and 1.2%, > 0 with 2% slippage each way, better than the average stock (1 USD+, 0.5M USD+ a day) over the same sessions, better than the same stock on its other days, > 0 without its 2 best, 20+ trades and 3+ blocks of 10 sessions, block t >= ' + TIER2_T + ', return per year above SPY -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN. +300% cap on every gross return (AUD-1).',
  firstRun, fallbackInfo: Object.keys(INFO2).length ? Object.fromEntries(Object.entries(INFO2).map(([k, r]) => [k, strip(r)])) : (PREV.fallbackInfo || null),
  latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }), soun: soun.caught || soun.rawEvents.length ? soun : (PREV.soun || soun), cases: caseList };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = 0; for (const id of Object.values(IDS)) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || !r.results || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + '; forward paper lane from ' + PAPER_START + ' (record only)'; e.tested = String(r.window[1]); e.study = 'squad25-lab.mjs -> data/squad25-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg ?? null, R.newer.avg ?? null], stress: [R.older.avgStress ?? null, R.newer.avgStress ?? null], slippage: [r.slippage.older.avg, r.slippage.newer.avg], edge: [R.older.edge ?? null, R.newer.edge ?? null],
      vsOwn: [R.older.vsOwn ?? null, R.newer.vsOwn ?? null], noTop2: [R.older.noTop2 ?? null, R.newer.noTop2 ?? null], tBlock: [R.older.tBlock ?? null, R.newer.tBlock ?? null], perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], why: r.why }; ch++; }
  for (const [id, r] of Object.entries(INFO2)) { const e = LB && LB.strategies.find(x => x.id === id); if (e && !e.result && !/information only/.test(e.status || '')) { e.status = 'not judged: fallback not needed (' + FALLBACK_OF[id] + ' had enough cases); information result in data/squad25-lab.json fallbackInfo'; ch++; } }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad25-lab: library not updated: ' + e.message); }
if (SECFAILS.length) log('SEC requests ' + secReq + ', failed ' + secFail + ': ' + SECFAILS.slice(0, 3).join(' | '));
console.log('SQUAD 25 LAB ' + D[0] + ' to ' + D[T - 1] + ' | cases base ' + COUNTS.base.older + '/' + COUNTS.base.newer + ' wide ' + COUNTS.wide.older + '/' + COUNTS.wide.newer + ' | ' + Object.entries(firstRun).map(([k, r]) => k + ' ' + r.verdict).join(', ') + ' | ' + ['price', 'master', 'tickerMap', 'filings', 'ftd', 'giants'].map(k => k + (STATUS[k] && STATUS[k].ok ? ' ok' : ' MISSING')).join(', '));
