// EXPERT LAB (23 Oct 2026; owner: "TipRanks, Investing.com, Yahoo Finance and more have analyst profiles and portfolios showing their
// trades: find out how they won their trades and make the system smarter"). Research + a FORWARD PAPER lane; never places an order; no
// Telegram. Rules (pre-registered BEFORE any run): expert-core.mjs header + library entries EXP-*.
// SOURCES (official / licensed only; no scraping): SEC Form 13F data sets (www.sec.gov, fair-access rules, SEC_UA) and live EDGAR filings
// of the top managers / insiders for the paper lane; the SEC Form 4 purchases already kept by insider-study.mjs (study-cache/insider,
// RESTORED READ ONLY); FMP analyst grades (FMP_KEY, plan permitting, small daily budget: the free plan's 250 calls a day are shared);
// Massive daily bars (prices before the 5-year cache, fresh sessions, CUSIP -> ticker); eToro public API (only with the owner's keys).
// TipRanks / Investing.com / Yahoo pages are NOT read: TipRanks' API gives today's rankings only (a list of past winners, no history to
// test without hindsight; its terms forbid republishing; the monthly quota is shared with the bot); Investing.com and Yahoo have no
// official API for analyst records. Nothing from FMP is written to the public files except symbols, dates and computed returns.
// 1. PRICES: the 5-year whole-market cache (study-cache/grouped.json.gz, READ ONLY) + PRE-HISTORY from 2019-07-01 (Massive grouped daily,
//    kept in expert-cache; used ONLY to resolve expert calls made before the cache window, so rankings exist from the window's start) +
//    the sessions since the cache day (Massive) with the same split repair as decoded-lab.mjs.
// 2. 5-YEAR ONE-SHOT for each rule not yet frozen and whose data is complete: trades only inside the cache window, judged with
//    value-core.mjs judge + the registered SKILL gate; first complete verdict frozen in data/expert-lab.json (same format as
//    data/value-lab.json: firstRun[id].results.older/newer from halfStat). DIAG=1: data and coverage only, NO returns computed, nothing frozen.
// 3. PAPER LANE (weekdays after the close, from 23 Oct 2026): new signals of the CURRENT top experts -> data/expert-paper.jsonl,
//    data/expert-today.json (methods[id].newSignals = [{sym, close, halal}]), data/expert-board.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { spawn, execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, r4, TIER2_T } from './value-core.mjs';
import { RULES, COST, analystEvent, walkHold, markOpen, PITRanker, clusterSignals, normName, valueDollars, holdingChanges, topWeights, parse13FXml, parseForm4Xml, etoroNewLongs, boardStats, trySmallReady, midSplit } from './expert-core.mjs';
const env = process.env, DIAG = !!env.DIAG, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SECW = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov', FMP = local(env.FMP_BASE) || 'https://financialmodelingprep.com';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', EC = env.EXPERT_CACHE || 'expert-cache', START = env.PAPER_START || '2026-10-23', PRE_FROM = env.PRE_FROM || '2019-07-01';
const LAB = 'data/expert-lab.json', PAPER = 'data/expert-paper.jsonl', TODAY = 'data/expert-today.json', BOARD = 'data/expert-board.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const WZ = (f, o) => fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))), mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), MINUTES = +(env.EXPERT_MINUTES || 150), left = () => MINUTES * 60e3 - (Date.now() - t0), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
fs.mkdirSync(EC + '/13f', { recursive: true }); fs.mkdirSync('data', { recursive: true });
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { s = String(s || '').trim().toUpperCase(); if (/^\d{4}-\d\d-\d\d/.test(s)) return s.slice(0, 10); const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(s); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : null; };
const STATUS = {};   // per rule: data coverage and why a rule was or was not run

// ================= 1. PRICES =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('expert-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(30000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const grouped = async (d) => { const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) return null;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && x.c > 0); return { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x) && (CS.has(x.T) || !CS.size))) }; };
const cacheDays = Object.keys(store.days).sort(), cacheFirst = cacheDays[0], cacheLast = cacheDays[cacheDays.length - 1];
// pre-history (expert-cache/pre.json.gz): weekdays from PRE_FROM to the day before the cache window; fetched once, then reused
let PRE = JZ(EC + '/pre.json.gz', { days: {} }); { let got = 0, miss = 0;
  if (env.MASSIVE_KEY) for (let ms = Date.parse(PRE_FROM); iso(ms) < cacheFirst; ms += 864e5) { const d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6 || PRE.days[d] || (PRE.none || []).includes(d)) continue; if (left() < 100 * 60e3) break;
    const g = await grouped(d); if (g) { PRE.days[d] = g; got++; } else { (PRE.none = PRE.none || []).push(d); miss++; } }
  if (got || miss) WZ(EC + '/pre.json.gz', PRE); log('pre-history: ' + Object.keys(PRE.days).length + ' sessions before ' + cacheFirst + ' (' + got + ' fetched now, ' + miss + ' holidays/none)'); }
for (const [d, x] of Object.entries(PRE.days)) if (d < cacheFirst) store.days[d] = x; PRE = null;
const fresh = []; for (let ms = Date.parse(cacheLast) + 864e5; ms <= Date.now(); ms += 864e5) { const d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6) continue; const g = await grouped(d); if (g) { store.days[d] = g; fresh.push(d); } }
log('cache ' + cacheFirst + ' to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none') + (env.MASSIVE_KEY ? '' : ' (no MASSIVE_KEY)'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t])), W0 = tOf.get(cacheFirst);   // W0 = first session of the 5-year window
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, O = new Float32Array(N).fill(NaN), C = new Float32Array(N).fill(NaN), V = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
D.forEach((d, t) => { const x = store.days[d]; const put = (r, main) => { for (let j = 0; j < r.T.length; j++) { const i = SY.get(r.T[j]); if (i === undefined) continue; const k = i * T + t; if (!main && MAIN[k]) continue; O[k] = r.o[j]; C[k] = r.c[j]; V[k] = r.v[j]; if (main) MAIN[k] = 1; } };
  put(x, true); if (x.x) put(x.x, false); });
const SIC = store.sic || {}; store = null;
const splitList = (J('data/splits.json', {}).splits || []).slice();
{ const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'); const rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f; splitList.push({ s, d, r }); const i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue;
    let pre = null, post = null; for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (C[i * T + k] > 0) pre = C[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (C[i * T + k] > 0) post = C[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; O[q] /= r; C[q] /= r; V[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const splitFactor = (sym, after) => splitList.filter(z => z.s === sym && z.d > after && z.d <= D[T - 1]).reduce((a, z) => a * z.r, 1);
log('sessions ' + T + ' (' + D[0] + ' to ' + D[T - 1] + '; 5-year window from ' + cacheFirst + ', session ' + W0 + '), stocks ' + NS);
const spyI = SY.get('SPY');
// liquidity the system uses for buys: close >= 5 USD and 20-day average traded value >= 5M USD (15+ of the 20 sessions known)
const LIQ = new Uint8Array(N); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let dv = 0, n = 0;
  for (let t = 0; t < T; t++) { const k = b + t, x = C[k] * V[k]; if (MAIN[k] && isFinite(x)) { dv += x; n++; } if (t >= 20) { const q = b + t - 20, y = C[q] * V[q]; if (MAIN[q] && isFinite(y)) { dv -= y; n--; } } if (MAIN[k] && C[k] >= 5 && n >= 15 && dv / n >= 5e6) LIQ[k] = 1; } }
const firstAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo; };   // first session strictly AFTER date d
const lastOnOrBefore = (d) => firstAfter(d) - 1;
const series = (i) => { const b = i * T; return { o: O.subarray(b, b + T), c: C.subarray(b, b + T) }; };
const closeAt = (i, t) => { for (let k = t; k >= Math.max(0, t - 7); k--) { const c = C[i * T + k]; if (c > 0) return c; } return null; };
const liqSample = new Map(), sampleAt = (t) => { if (!liqSample.has(t)) { const a = []; for (let i = 0; i < NS; i += 4) if (LIQ[i * T + t]) a.push(i); liqSample.set(t, a); } return liqSample.get(t); };
// the average liquid stock bought at the open of k and sold at the close of x (its last known close if it stopped trading)
const cMemo = new Map(), ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of sampleAt(k - 1)) { const e = O[i * T + k]; let y = NaN; for (let q = x; q >= k && !(y > 0); q--) y = C[i * T + q]; if (e > 0 && y > 0 && Math.abs(y / e - 1) < 3) v.push(y / e - 1); }
  const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';

// ================= 2. EXPERT DATA =================
// ---- A. insiders: SEC Form 4 open-market purchases kept by insider-study.mjs ([symbol, filing date, owner CIK, USD]); read only
const INS = []; { const dir = (env.CACHE_DIR || 'study-cache') + '/insider'; let files = []; try { files = fs.readdirSync(dir).filter(f => /^\d{4}q\d\.json$/.test(f)).sort(); } catch (e) {}
  for (const f of files) { try { for (const b of JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'))) INS.push({ sym: b[0], d: b[1], who: String(b[2]), usd: +b[3] || 0 }); } catch (e) {} }
  const qs = []; for (let y = +cacheFirst.slice(0, 4); y <= +D[T - 1].slice(0, 4); y++) for (let q = 1; q <= 4; q++) { const end = iso(Date.UTC(y, q * 3, 1) - 864e5); if (end >= cacheFirst && Date.parse(end) + 45 * 864e5 < Date.now()) qs.push(y + 'q' + q); }
  const have = new Set(files.map(f => f.replace('.json', ''))), missing = qs.filter(q => !have.has(q));
  STATUS['EXP-INS1'] = { source: 'SEC Form 4 data sets (insider-study.mjs cache, read only)', quarters: files.length, purchases: INS.length, missingQuarters: missing, complete: INS.length > 1000 && missing.length <= 1 };
  log('insiders: ' + INS.length + ' purchases from ' + files.length + ' quarters' + (missing.length ? ' (missing ' + missing.join(' ') + ')' : '')); }

// ---- B. 13F: SEC Form 13F data sets, compact per file in expert-cache/13f (kept filings: 13F-HR originals, 10-150 share positions, 100M USD+)
const F13 = []; const NAMES = new Map(); { const st = { files: 0, fetched: 0, failed: [] };
  let list = []; try { const r = await fetch(SECW + '/data-research/sec-markets-data/form-13f-data-sets', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); const t = await r.text();
    list = [...new Set([...t.matchAll(/href="([^"]*form13f\.zip)"/gi)].map(m => m[1]))]; } catch (e) { st.failed.push('list: ' + e.message); }
  const yr = (u) => { const m = /(\d{4})q(\d)_form13f/.exec(u); if (m) return m[1] + '-' + String(m[2] * 3).padStart(2, '0'); const n = /(\d{2})([a-z]{3})(\d{4})-(\d{2})([a-z]{3})(\d{4})_form13f/i.exec(u); return n ? n[6] + '-' + MON[n[5].toUpperCase()] : '0000'; };
  const want = list.filter(u => yr(u) >= PRE_FROM.slice(0, 7)).sort((a, b) => yr(a) < yr(b) ? -1 : 1);
  const tsvSmall = (zip, name) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30 }).toString(); } catch (e) { return null; } const L = txt.split(/\r?\n/), H = L[0].split('\t'); return { H, rows: L.slice(1).filter(Boolean).map(l => l.split('\t')) }; };
  for (const u of want) { const name = u.split('/').pop().replace('.zip', ''), cf = EC + '/13f/' + name + '.json.gz'; st.files++;
    if (fs.existsSync(cf)) continue; if (left() < 70 * 60e3) { st.failed.push(name + ' (time)'); continue; }
    const zip = EC + '/tmp13f.zip'; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '-A', UA, '-o', zip, (u.startsWith('http') ? '' : SECW) + u], { stdio: 'inherit', timeout: 15 * 60e3 }); } catch (e) { st.failed.push(name); continue; }
    await sleep(300); st.fetched++;
    const S = tsvSmall(zip, 'SUBMISSION.tsv'), CP = tsvSmall(zip, 'COVERPAGE.tsv'); if (!S) { st.failed.push(name + ' (no SUBMISSION)'); continue; }
    const si = (n) => S.H.indexOf(n), amend = new Set(); if (CP) { const ci = (n) => CP.H.indexOf(n); for (const x of CP.rows) if (String(x[ci('ISAMENDMENT')] || '').toUpperCase() === 'Y') amend.add(x[ci('ACCESSION_NUMBER')]); }
    const keep = new Map(); for (const x of S.rows) { if (x[si('SUBMISSIONTYPE')] !== '13F-HR' || amend.has(x[si('ACCESSION_NUMBER')])) continue; const f = isoD(x[si('FILING_DATE')]), p = isoD(x[si('PERIODOFREPORT')]); if (f && p) keep.set(x[si('ACCESSION_NUMBER')], { a: x[si('ACCESSION_NUMBER')], c: String(+x[si('CIK')]), f, p, h: new Map() }); }
    // INFOTABLE is large: streamed; share positions only (no put / call rows, type SH), aggregated per CUSIP
    await new Promise((res) => { const ch = spawn('unzip', ['-p', zip, 'INFOTABLE.tsv']), rl = readline.createInterface({ input: ch.stdout }); let H = null, ia, ic, iv, is, it, ip, inm;
      rl.on('line', (l) => { const x = l.split('\t'); if (!H) { H = x; ia = H.indexOf('ACCESSION_NUMBER'); ic = H.indexOf('CUSIP'); iv = H.indexOf('VALUE'); is = H.indexOf('SSHPRNAMT'); it = H.indexOf('SSHPRNAMTTYPE'); ip = H.indexOf('PUTCALL'); inm = H.indexOf('NAMEOFISSUER'); return; }
        const k = keep.get(x[ia]); if (!k || (x[ip] && x[ip].trim()) || String(x[it] || '').toUpperCase() !== 'SH') return; const cu = String(x[ic] || '').toUpperCase().trim(); if (cu.length < 8) return;
        const v = valueDollars(+x[iv] || 0, k.f), sh = +x[is] || 0; const h = k.h.get(cu) || [0, 0]; h[0] += v; h[1] += sh; k.h.set(cu, h); if (!NAMES.has(cu)) NAMES.set(cu, x[inm]); });
      rl.on('close', res); ch.on('error', res); });
    const out = []; for (const k of keep.values()) { const n = k.h.size, tot = [...k.h.values()].reduce((u, h) => u + h[0], 0); if (n < 10 || n > 150 || tot < 1e8) continue; out.push({ a: k.a, c: k.c, f: k.f, p: k.p, h: [...k.h].map(([cu, h]) => [cu, Math.round(h[0]), Math.round(h[1])]) }); }
    const nm = {}; for (const k of out) for (const [cu] of k.h) if (NAMES.has(cu)) nm[cu] = NAMES.get(cu);
    WZ(cf, { filings: out, names: nm }); try { fs.unlinkSync(zip); } catch (e) {} log('13F ' + name + ': ' + keep.size + ' 13F-HR originals, ' + out.length + ' kept (10-150 positions, 100M USD+)'); }
  for (const u of want) { const name = u.split('/').pop().replace('.zip', ''), z = JZ(EC + '/13f/' + name + '.json.gz', null); if (!z) continue; for (const [cu, n] of Object.entries(z.names || {})) if (!NAMES.has(cu)) NAMES.set(cu, n); for (const f of z.filings) F13.push(f); }
  // one original per manager and period: the FIRST filed (a later original for the same period is ignored)
  { const firstBy = new Map(); for (const f of F13) { const key = f.c + '|' + f.p; if (!firstBy.has(key) || f.f < firstBy.get(key).f) firstBy.set(key, f); } F13.length = 0; F13.push(...[...firstBy.values()].sort((a, b) => a.f < b.f ? -1 : a.f > b.f ? 1 : 0)); }
  STATUS['EXP-13F1'] = { source: 'SEC Form 13F data sets', dataSets: want.length, cached: st.files - st.failed.length, fetchedNow: st.fetched, failed: st.failed, filingsKept: F13.length, complete: want.length >= 20 && !st.failed.length };
  log('13F: ' + F13.length + ' filings kept from ' + want.length + ' data sets (' + st.fetched + ' downloaded now' + (st.failed.length ? ', failed ' + st.failed.join(' ') : '') + ')'); }

// CUSIP -> ticker: (1) cached, (2) SEC company_tickers.json by normalised name, (3) Massive reference by CUSIP; a NAME match must agree with the
// 13F's own price (value / shares within 30% of the close at the period end, latest appearance); a CUSIP match is taken as given.
const CMAP = J(EC + '/cusip.json', {}); let secNames = null; const cst = { cached: 0, byName: 0, byMassive: 0, none: 0, lookups: 0 };
async function loadSecNames() { if (secNames) return; secNames = new Map(); try { const r = await fetch(SECW + '/files/company_tickers.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); const j = await r.json();
  for (const v of Object.values(j || {})) { const k = normName(v.title), s = String(v.ticker || '').toUpperCase().replace(/-/g, '.'); if (k && !secNames.has(k) && SY.has(s)) secNames.set(k, s); } } catch (e) {} }
const lastSeen = new Map(); for (const f of F13) for (const [cu, v, sh] of f.h) lastSeen.set(cu, { p: f.p, px: sh > 0 ? v / sh : null });
async function mapCusips(cusips, budget) { await loadSecNames(); let used = 0;
  for (const cu of cusips) { if (cu in CMAP) { cst.cached++; continue; } const ls = lastSeen.get(cu), okPx = (s) => { const i = SY.get(s); if (i === undefined || !ls || !(ls.px > 0)) return false; const c = closeAt(i, lastOnOrBefore(ls.p)); return c > 0 && ls.px / c > 0.7 && ls.px / c < 1.43; };
    const byName = secNames.get(normName(NAMES.get(cu))); if (byName && okPx(byName)) { CMAP[cu] = byName; cst.byName++; continue; }
    if (used >= budget || left() < 40 * 60e3) continue; used++; cst.lookups++;
    let s = null; for (const q of ['', '&active=false']) { const j = await api('/v3/reference/tickers?cusip=' + cu + q + '&limit=1'); const r = j && j.results && j.results[0]; if (r && r.ticker) { s = String(r.ticker).toUpperCase(); break; } }
    if (s && SY.has(s)) { CMAP[cu] = s; cst.byMassive++; } else { CMAP[cu] = null; cst.none++; } }
  fs.writeFileSync(EC + '/cusip.json', JSON.stringify(CMAP)); }

// ---- C. analyst grades (FMP /stable/grades, one call per stock, firm level); small daily budget, cached; the test waits for the whole universe
const GR = JZ(EC + '/grades.json.gz', { syms: {} }); { const budget = +(env.EXPERT_FMP_CALLS ?? 20); let used = 0, stop = '';
  const dv = []; for (let i = 0; i < NS; i++) { if (i === spyI) continue; let n = 0, s = 0; for (let t = Math.max(W0, T - 252); t < T; t++) { const k = i * T + t; if (LIQ[k]) { n++; s += C[k] * V[k]; } } if (n >= 100) dv.push([SYMS[i], s / n]); }
  const UNI = dv.sort((a, b) => b[1] - a[1]).slice(0, +(env.EXPERT_AN_UNIVERSE || 1500)).map(x => x[0]);
  if (env.FMP_KEY && !DIAG) for (const s of UNI) { if (GR.syms[s] || used >= budget) continue; used++;
    try { const r = await fetch(FMP + '/stable/grades?symbol=' + encodeURIComponent(s) + '&apikey=' + encodeURIComponent(env.FMP_KEY), { signal: AbortSignal.timeout(30000) });
      if (r.status === 429) { stop = 'daily limit (HTTP 429)'; break; } if (r.status === 401) { stop = 'key rejected'; break; }
      if (!r.ok) { GR.syms[s] = { at: iso(Date.now()), denied: r.status }; continue; } const j = await r.json().catch(() => null);
      if (!Array.isArray(j)) { const m = j && (j['Error Message'] || j.message) || ''; if (/limit/i.test(m)) { stop = 'daily limit'; break; } GR.syms[s] = { at: iso(Date.now()), denied: 'not a list' }; continue; }
      GR.syms[s] = { at: iso(Date.now()), rows: j.filter(x => x && x.date && x.gradingCompany).map(x => [String(x.date).slice(0, 10), String(x.gradingCompany).slice(0, 60), String(x.previousGrade || ''), String(x.newGrade || ''), String(x.action || '')]) }; }
    catch (e) { stop = 'network: ' + e.message; break; } await sleep(250); }
  if (used) WZ(EC + '/grades.json.gz', GR);
  const tried = UNI.filter(s => GR.syms[s]).length, withRows = UNI.filter(s => GR.syms[s] && GR.syms[s].rows).length;
  STATUS['EXP-AN1'] = STATUS['EXP-AN2'] = { source: 'FMP /stable/grades (firm level; the only analyst history on the current plans: Finnhub upgrade-downgrade and Massive Benzinga ratings answer 403, FMP price-target-news 402)', universe: UNI.length, tried, withHistory: withRows,
    deniedByPlan: tried - withRows, callsNow: used, budgetPerRun: budget, stop: stop || null, complete: tried === UNI.length && withRows >= 300,
    note: tried < UNI.length ? 'collecting: ' + tried + ' of ' + UNI.length + ' stocks tried at ' + budget + ' calls per run (the FMP free plan allows 250 calls a day, shared with earnings-study and discover). An FMP Starter plan (EXPERT_FMP_CALLS=2000) finishes it in one run.' : 'collected' };
  log('analyst grades: ' + tried + ' of ' + UNI.length + ' stocks tried, ' + withRows + ' with history (' + used + ' FMP calls now' + (stop ? '; stopped: ' + stop : '') + ')'); }
STATUS['EXP-CONG1'] = { source: 'none on the current plans', complete: false, note: 'needs data: FMP senate/house trades answer 402 on this plan; Finnhub congressional-trading 403; Alpha Vantage CONGRESS_TRADES works but its 25 calls a day are already used by follow-lane.mjs (members scored there as tip sources) and earnings-study.mjs. Unlock: FMP Starter (senate-trades / house-trades with disclosure dates) or an Alpha Vantage premium key.' };
STATUS['EXP-ETORO1'] = { source: 'eToro public API', complete: false, keys: !!(env.ETORO_KEY && env.ETORO_USER_KEY), note: 'forward paper only (the API gives live portfolios and aggregate stats, not a dated trade history). Needs the owner\'s ETORO_KEY and ETORO_USER_KEY secrets.' };

// ================= 3. CALLS, RANKINGS, SIGNALS (point in time) =================
// Each expert call: { who, i (stock), k (buy session), x (last session of its ranking window), ex (excess over the average stock) }.
function callAt(i, k, h) { if (k < 1 || k + h - 1 >= T) return null; const r = walkHold(series(i).o, series(i).c, k, h, 1); if (!r) return null; const c = ctrlSpan(k, r.x); return c === null ? null : { x: r.x, ex: r.g - c }; }
// sweep: candidate signals sorted by k; ranker fed with all calls (tRes = x); a signal counts if its expert is in topAt(k)
function sweepTop(calls, cands, rank) { const R = new PITRanker(rank), byK = [...calls].sort((a, b) => a.k - b.k); let q = 0; const out = [];
  for (const s of [...cands].sort((a, b) => a.k - b.k)) { while (q < byK.length && byK[q].k <= s.k) { const c = byK[q++]; if (c.x !== undefined) R.add(c.who, c.x, c.ex); } const top = R.topAt(s.k); if (top.top.has(s.who)) out.push({ ...s, eligible: top.eligible }); }
  const R2 = new PITRanker(rank); for (const c of calls) if (c.x !== undefined) R2.add(c.who, c.x, c.ex); const now = R2.topAt(T + 1000);
  return { signals: out, topNow: [...now.top], eligibleNow: now.eligible }; }
const SIG = {}, CTRL = {}, TOPNOW = {};
// ---- insiders
{ const rule = RULES['EXP-INS1'], P = INS.filter(p => p.usd >= rule.minUsd && SY.has(p.sym)).sort((a, b) => a.d < b.d ? -1 : 1), last = new Map(), calls = [], cands = [];
  for (const p of P) { const key = p.who + '|' + p.sym; if (last.has(key) && Date.parse(p.d) - Date.parse(last.get(key)) < 30 * 864e5) continue; last.set(key, p.d);   // one call per insider and stock per 30 days
    const i = SY.get(p.sym), k = firstAfter(p.d); if (k >= T || !(O[i * T + k] > 0)) continue; const c = DIAG ? null : callAt(i, k, rule.rank.horizon); calls.push({ who: p.who, i, k, ...(c || {}) }); cands.push({ who: p.who, i, k, sym: p.sym, d: p.d, usd: p.usd }); }
  const sw = DIAG ? { signals: [], topNow: [], eligibleNow: 0 } : sweepTop(calls, cands, rule.rank); SIG['EXP-INS1'] = sw.signals; CTRL['EXP-INS1'] = cands; TOPNOW['EXP-INS1'] = sw.topNow;
  Object.assign(STATUS['EXP-INS1'], { purchaseDays: cands.length, insiders: new Set(cands.map(c => c.who)).size, topInsidersNow: sw.topNow.length, eligibleNow: sw.eligibleNow }); }
// ---- 13F
let mapStat = null; { const rule = RULES['EXP-13F1'], byMgr = new Map(); for (const f of F13) (byMgr.get(f.c) || byMgr.set(f.c, []).get(f.c)).push(f);
  // CUSIPs that matter: each filing's 20 largest positions (follow return) and every position of 1%+ (possible signal)
  const need = new Set(); for (const f of F13) { const tot = f.h.reduce((u, h) => u + h[1], 0); [...f.h].sort((a, b) => b[1] - a[1]).forEach((h, j) => { if (j < 20 || h[1] / tot >= 0.01) need.add(h[0]); }); }
  await mapCusips([...need].sort((a, b) => (lastSeen.get(b) || {}).p > (lastSeen.get(a) || {}).p ? 1 : -1), +(env.EXPERT_CUSIP_LOOKUPS || 9000));
  const mapped = (cu) => CMAP[cu] || null; let wAll = 0, wMapped = 0;
  const calls = [], cands = [];
  for (const [cik, fs0] of byMgr) { fs0.sort((a, b) => a.p < b.p ? -1 : 1); let prev = null;
    for (const f of fs0) { const k = firstAfter(f.f); const tPer = lastOnOrBefore(f.p); const cur = new Map();
      for (const [cu, v] of f.h) { const s = mapped(cu), i = s ? SY.get(s) : undefined; cur.set(cu, { v, sym: s, i, px: i !== undefined && tPer >= 0 ? closeAt(i, tPer) : null }); }
      const tot = f.h.reduce((u, h) => u + h[1], 0); for (const [cu, v] of [...f.h].sort((a, b) => b[1] - a[1]).slice(0, 20)) { wAll += v / tot; if (mapped(cu)) wMapped += v / tot; }
      if (k < T) { // follow return of this filing (ranking call): its 20 largest MAPPED positions, value weights
        if (!DIAG) { const tw = topWeights([...cur.values()].filter(h => h.i !== undefined && O[h.i * T + k] > 0).map(h => ({ sym: h.sym, v: h.v })), 20); let g = 0, wsum = 0, x = null;
          if (tw.length >= 5 && k + rule.rank.horizon - 1 < T) { for (const { sym, w } of tw) { const r = walkHold(series(SY.get(sym)).o, series(SY.get(sym)).c, k, rule.rank.horizon, 1); if (r) { g += w * r.g; wsum += w; x = r.x; } }
            const c = x !== null ? ctrlSpan(k, x) : null; if (wsum >= 0.6 && c !== null) calls.push({ who: cik, k, x, ex: g / wsum - c }); } }
        const prevOk = prev && Date.parse(f.p) - Date.parse(prev.p) <= 200 * 864e5 ? prev.m : null;
        for (const ch of holdingChanges(prevOk, cur, 0.01)) { const h = cur.get(ch.id); if (h.i === undefined) continue; cands.push({ who: cik, i: h.i, k, sym: h.sym, d: f.f, kind: ch.kind, w: r4(ch.w), acc: f.a }); } }
      prev = { p: f.p, m: cur }; } }
  mapStat = { ...cst, top20WeightMapped: r4(wMapped / (wAll || 1)) }; STATUS['EXP-13F1'].mapping = mapStat; if (mapStat.top20WeightMapped < 0.7) STATUS['EXP-13F1'].complete = false;
  const sw = DIAG ? { signals: [], topNow: [], eligibleNow: 0 } : sweepTop(calls, cands, rule.rank); SIG['EXP-13F1'] = sw.signals; CTRL['EXP-13F1'] = cands; TOPNOW['EXP-13F1'] = sw.topNow;
  Object.assign(STATUS['EXP-13F1'], { managers: byMgr.size, followCalls: calls.length, moves: cands.length, topManagersNow: sw.topNow.length, eligibleNow: sw.eligibleNow });
  // 13F2: 2+ top managers, filing dates within 45 days (calendar days); bought after the completing filing
  const day = (d) => Math.round(Date.parse(d) / 864e5), cl = (arr) => clusterSignals(arr.map(s => ({ sym: s.sym, t: day(s.d), who: s.who, s })), RULES['EXP-13F2'].cluster.days, 2).map(c => { const d = iso(c.t * 864e5); return { who: c.who.join('+'), i: SY.get(c.sym), k: firstAfter(d), sym: c.sym, d, n: c.who.length }; });
  SIG['EXP-13F2'] = cl(SIG['EXP-13F1']); CTRL['EXP-13F2'] = cl(cands); STATUS['EXP-13F2'] = { ...STATUS['EXP-13F1'], clusters: SIG['EXP-13F2'].length }; }
// ---- analysts
if (STATUS['EXP-AN1'].complete) { const rule = RULES['EXP-AN1'], calls = [], cands = [];
  for (const [sym, g] of Object.entries(GR.syms)) { const i = SY.get(sym); if (i === undefined || !g.rows) continue;
    for (const [d, firm, prev, nw, action] of g.rows) { const ev = analystEvent({ action, previousGrade: prev, newGrade: nw }); if (!ev) continue; const k = firstAfter(d); if (k >= T || !(O[i * T + k] > 0)) continue;
      const c = DIAG ? null : callAt(i, k, rule.rank.horizon); calls.push({ who: firm, i, k, ...(c || {}) }); cands.push({ who: firm, i, k, sym, d, kind: ev }); } }
  const sw = DIAG ? { signals: [], topNow: [], eligibleNow: 0 } : sweepTop(calls, cands, { ...rule.rank, maxAge: 756 }); SIG['EXP-AN1'] = sw.signals; CTRL['EXP-AN1'] = cands; TOPNOW['EXP-AN1'] = sw.topNow;
  const cl = (arr) => clusterSignals(arr.map(s => ({ sym: s.sym, t: s.k, who: s.who })), RULES['EXP-AN2'].cluster.window, 2).map(c => ({ who: c.who.join('+'), i: SY.get(c.sym), k: c.t, sym: c.sym, d: D[c.t - 1] || D[c.t], n: c.who.length }));
  SIG['EXP-AN2'] = cl(SIG['EXP-AN1']); CTRL['EXP-AN2'] = cl(cands); Object.assign(STATUS['EXP-AN1'], { buyCalls: cands.length, firms: new Set(cands.map(c => c.who)).size, topFirmsNow: sw.topNow.length }); }
log('signals: ' + Object.entries(SIG).map(([k, v]) => k + ' ' + v.length + ' (all experts ' + (CTRL[k] || []).length + ')').join(', '));

// ================= 4. 5-YEAR ONE-SHOT =================
const LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), PREV = J(LAB, {});
function tradesOf(sigs, rule, mid0) { const by = new Map(); for (const s of sigs) if (s.k >= W0 && s.k < T && s.i !== undefined && LIQ[s.i * T + s.k - 1]) (by.get(s.i) || by.set(s.i, []).get(s.i)).push(s);
  const out = []; for (const [i, a] of by) { a.sort((x, y) => x.k - y.k); let free = -1; const S = series(i), mine = [];
    for (const s of a) { if (s.k <= free) continue; const r = walkHold(S.o, S.c, s.k, rule.hold, rule.stop); if (!r) { free = Infinity; continue; } free = r.x; const c = ctrlSpan(s.k, r.x); if (c === null) continue; mine.push({ t: s.k, s: SYMS[i], i, k: s.k, x: r.x, g: r.g, c, kind: r.kind, who: s.who, d: s.d }); }
    const spans = mine.map(z => [z.k, z.x]); for (const z of mine) { const len = z.x - z.k + 1, v = []; for (let u = W0 + 1; u + len < T; u += 10) { if (!LIQ[i * T + u - 1] || spans.some(([p, q]) => u <= q && u + len >= p)) continue; const e = O[i * T + u], y = C[i * T + u + len - 1]; if (e > 0 && y > 0) v.push({ u, g: y / e - 1 }); } z.ownAll = v; }
    out.push(...mine); }
  const mid = mid0 ?? midSplit(out.map(z => z.t)); for (const z of out) { z.half = z.t < mid ? 'older' : 'newer'; const v = z.ownAll.filter(q => (q.u < mid) === (z.t < mid)).map(q => q.g); z.own = v.length >= 3 ? mean(v) : null; delete z.ownAll; }
  return { trades: out, mid }; }
const halves = (tr, h) => ({ older: halfStat(tr.filter(z => z.half === 'older'), h), newer: halfStat(tr.filter(z => z.half === 'newer'), h), all: halfStat(tr, h) });
const RES = {}; const need = Object.keys(SIG).filter(id => !(PREV.firstRun || {})[id] || env.HISTORY);
if (!DIAG) for (const id of need) { const rule = RULES[id], st = STATUS[id] || {}; if (!st.complete) { log(id + ': data not complete, not run'); continue; }
  const { trades, mid } = tradesOf(SIG[id], rule), ctl = tradesOf(CTRL[id] || [], rule, mid).trades, R = halves(trades, rule.hold), RC = halves(ctl, rule.hold), extra = [];
  for (const k of ['older', 'newer']) if (!(R[k].n && RC[k].n && R[k].avg > RC[k].avg && R[k].edge > RC[k].edge)) extra.push('SKILL gate: not better than the same rule using every expert (no ranking) in the ' + k + ' half (' + pc(R[k].avg) + ' vs ' + pc(RC[k].avg) + ' after cost; edge ' + pc(R[k].edge) + ' vs ' + pc(RC[k].edge) + ')');
  const net = trades.map(z => z.g - COST), w = net.filter(x => x > 0), l = net.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  const shape = { trades: trades.length, win: r4(w.length / (trades.length || 1)), avgWin: r4(mean(w) ?? NaN), avgLoss: r4(mean(l) ?? NaN), pf: l.length ? r4(sum(w) / -sum(l)) : null, stops: trades.filter(z => z.kind === 'stop').length, avgSessions: r4(mean(trades.map(z => z.x - z.k + 1)) ?? NaN),
    byYear: Object.fromEntries([...new Set(trades.map(z => D[z.t].slice(0, 4)))].sort().map(y => { const v = trades.filter(z => D[z.t].slice(0, 4) === y).map(z => z.g - COST); return [y, { n: v.length, avg: r4(mean(v)), win: r4(v.filter(x => x > 0).length / v.length) }]; })),
    bySector: (() => { const o = {}; for (const z of trades) { const s = SIC[z.s] && SIC[z.s].n ? SIC[z.s].n : '?'; (o[s] = o[s] || []).push(z.g - COST); } return Object.fromEntries(Object.entries(o).sort((a, b) => b[1].length - a[1].length).slice(0, 8).map(([k, v]) => [k, { n: v.length, avg: r4(mean(v)) }])); })() };
  RES[id] = { ...judge(R, { bar: BAR, extra }), results: R, allExperts: { older: RC.older, newer: RC.newer }, shape, hold: rule.hold, stop: rule.stop, split: D[mid], cost: COST,
    trades: trades.map(z => ({ s: z.s, sig: z.d, buy: D[z.k], sell: D[z.x], exit: z.kind, net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null ? null : z.own - COST), who: String(z.who).slice(0, 40) })) }; }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = DIAG ? (PREV.firstRun || {}) : freezeEach(PREV.firstRun, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { at: new Date().toISOString(), window: [cacheFirst, D[T - 1]], bar: BAR, ...strip(r) }])), (r) => ((r.results && r.results.all && r.results.all.n) || 0) >= 20);
for (const [k, r] of Object.entries(RES)) { const f = (h) => h.n + ' (' + h.days + ' days) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  console.log('- ' + k + ': ' + r.verdict + ' | older ' + f(r.results.older) + ' | newer ' + f(r.results.newer) + ' | all experts: older ' + pc(r.allExperts.older.avg) + ' / newer ' + pc(r.allExperts.newer.avg) + ' | ' + r.why); }

// ================= 5. PAPER LANE (current top experts; live EDGAR filings; signals dated from START) =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const have = new Set(lines.filter(x => x.type === 'signal').map(x => x.id)), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id)), newLines = [];
const LIVE = J(EC + '/live.json', { f13: {}, f4: {}, etoro: {} }); let secCalls = 0;
async function sec(url, text) { if (secCalls >= +(env.SEC_CALLS || 1500) || left() < 8 * 60e3) return null; secCalls++; await sleep(local(env.SEC_BASE) ? 0 : 130);
  try { const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30000) }); if (!r.ok) return null; return text ? await r.text() : await r.json(); } catch (e) { return null; } }
const addSignal = (m, sym, d, info) => { if (!SY.has(sym) || d < START) return; const id = m + '|' + sym + '|' + d; if (have.has(id)) return; have.add(id); const i = SY.get(sym), t = lastOnOrBefore(d);
  newLines.push({ type: 'signal', id, m, sym, d, close: t >= 0 ? r4(closeAt(i, t)) : null, halal: halal(sym), info, plan: 'buy the next open after ' + d + ', hold ' + RULES[m].hold + ' sessions, stop 35% under the buy' }); };
const paperNote = {};
if (!DIAG) {
  // 13F: new 13F-HR filings of the CURRENT top managers (EDGAR submissions); compared with their latest earlier holdings
  { const top = TOPNOW['EXP-13F1'] || [], lastHold = new Map(); for (const f of F13) lastHold.set(f.c, f); let filings = 0;
    for (const cik of top) { const sub = await sec(SECD + '/submissions/CIK' + String(cik).padStart(10, '0') + '.json'); if (!sub || !sub.filings) continue; const R = sub.filings.recent;
      for (let q = 0; q < (R.form || []).length; q++) { if (R.form[q] !== '13F-HR' || R.filingDate[q] < START || LIVE.f13[R.accessionNumber[q]]) continue; const acc = R.accessionNumber[q], dir = SECW + '/Archives/edgar/data/' + cik + '/' + acc.replace(/-/g, '');
        const idx = await sec(dir + '/index.json'); const xn = idx && ((idx.directory && idx.directory.item) || []).map(z => z.name).find(n => /\.xml$/i.test(n) && !/primary_doc/i.test(n)); if (!xn) continue; const xml = await sec(dir + '/' + xn, true); if (!xml) continue;
        const rows = parse13FXml(xml).filter(r => !r.putCall && /^SH$/i.test(r.type)), agg = new Map(); for (const r of rows) { const h = agg.get(r.cusip) || [0, 0]; h[0] += valueDollars(r.value, R.filingDate[q]); h[1] += r.shares; agg.set(r.cusip, h); if (!NAMES.has(r.cusip)) NAMES.set(r.cusip, r.name); }
        const per = R.reportDate ? R.reportDate[q] : null; for (const [cu, h] of agg) lastSeen.set(cu, { p: per || R.filingDate[q], px: h[1] > 0 ? h[0] / h[1] : null }); await mapCusips([...agg.keys()], 300);
        const tp = lastOnOrBefore(per || R.filingDate[q]), cur = new Map([...agg].map(([cu, h]) => { const s = CMAP[cu], i = s ? SY.get(s) : undefined; return [cu, { v: h[0], sym: s, i, px: i !== undefined ? closeAt(i, tp) : null }]; }));
        const dsf = lastHold.get(String(cik)), lv = (LIVE.h13 || {})[cik], pf = lv && (!dsf || lv.p > dsf.p) ? lv : dsf, prev = pf && pf.p < (per || R.filingDate[q]) ? new Map(pf.h.map(([cu, v]) => { const s = CMAP[cu], i = s ? SY.get(s) : undefined; return [cu, { v, px: i !== undefined ? closeAt(i, lastOnOrBefore(pf.p)) : null }]; })) : null;
        (LIVE.h13 = LIVE.h13 || {})[cik] = { p: per || R.filingDate[q], h: [...agg].map(([cu, h]) => [cu, Math.round(h[0])]) };
        for (const ch of holdingChanges(prev, cur, 0.01)) { const h = cur.get(ch.id); if (h.sym) addSignal('EXP-13F1', h.sym, R.filingDate[q], { manager: sub.name || cik, kind: ch.kind, weight: r4(ch.w) }); }
        LIVE.f13[acc] = R.filingDate[q]; filings++; } }
    paperNote['EXP-13F1'] = top.length + ' top managers checked, ' + filings + ' new 13F filings since ' + START; }
  // Form 4: new purchases by the CURRENT top insiders (EDGAR submissions of each insider)
  { const top = TOPNOW['EXP-INS1'] || []; let forms = 0;
    for (const cik of top) { const sub = await sec(SECD + '/submissions/CIK' + String(cik).padStart(10, '0') + '.json'); if (!sub || !sub.filings) continue; const R = sub.filings.recent;
      for (let q = 0; q < (R.form || []).length; q++) { if (R.form[q] !== '4' || R.filingDate[q] < START || LIVE.f4[R.accessionNumber[q]]) continue; const acc = R.accessionNumber[q], doc = R.primaryDocument ? R.primaryDocument[q] : null;
        const xml = doc ? await sec(SECW + '/Archives/edgar/data/' + cik + '/' + acc.replace(/-/g, '') + '/' + String(doc).replace(/^xsl[^/]*\//, ''), true) : null; LIVE.f4[acc] = R.filingDate[q]; if (!xml) continue; forms++;
        const p = parseForm4Xml(xml), usd = p.buys.reduce((u, b) => u + b.usd, 0); if (usd >= RULES['EXP-INS1'].minUsd && p.sym) addSignal('EXP-INS1', p.sym.replace(/-/g, '.'), R.filingDate[q], { insider: sub.name || cik, usd }); } }
    paperNote['EXP-INS1'] = top.length + ' top insiders checked, ' + forms + ' new Form 4 since ' + START; }
  // analysts: only when the history is complete AND the plan gives today's grades in bulk (grades-latest-news, 100 a page)
  if (STATUS['EXP-AN1'].complete && env.FMP_KEY) { const top = new Set(TOPNOW['EXP-AN1'] || []); let got = 0;
    try { const r = await fetch(FMP + '/stable/grades-latest-news?page=0&limit=100&apikey=' + encodeURIComponent(env.FMP_KEY), { signal: AbortSignal.timeout(30000) }); const j = r.ok ? await r.json() : null;
      for (const x of Array.isArray(j) ? j : []) { const d = String(x.publishedDate || '').slice(0, 10), ev = analystEvent(x); got++; if (ev && top.has(x.gradingCompany)) addSignal('EXP-AN1', String(x.symbol || '').toUpperCase(), d, { firm: x.gradingCompany, kind: ev }); }
      paperNote['EXP-AN1'] = r.ok ? got + ' latest grades read' : 'grades-latest-news HTTP ' + r.status + ' on this plan: forward analyst lane off'; } catch (e) { paperNote['EXP-AN1'] = 'grades-latest-news unreachable'; } }
  else paperNote['EXP-AN1'] = 'off until the analyst history is complete (' + STATUS['EXP-AN1'].note + ')';
  // eToro (disabled until the owner adds ETORO_KEY and ETORO_USER_KEY): the ranked Popular Investors' NEW long, unleveraged US-stock positions
  if (env.ETORO_KEY && env.ETORO_USER_KEY) { const EB = local(env.ETORO_BASE) || 'https://public-api.etoro.com', H = () => ({ 'x-api-key': env.ETORO_KEY, 'x-user-key': env.ETORO_USER_KEY, 'x-request-id': crypto.randomUUID() });
    const eg = async (p) => { try { const r = await fetch(EB + p, { headers: H(), signal: AbortSignal.timeout(30000) }); return r.ok ? await r.json() : { status: r.status }; } catch (e) { return null; } };
    const rk = await eg('/api/v2/portfolios/rankings?period=LastTwoYears&sort=-gain&popularInvestor=true&riskScoreMax=5&copiersMin=50&page=1&pageSize=20'); const users = ((rk && rk.results) || []).map(u => u.username).filter(Boolean);
    let opened = 0; const inst = new Map();
    for (const u of users) { const pf = await eg('/api/v1/user-info/people/' + encodeURIComponent(u) + '/portfolio/live'); if (!pf || !Array.isArray(pf.positions)) continue; const prev = LIVE.etoro[u] || null;
      const nl = etoroNewLongs(prev, pf.positions); LIVE.etoro[u] = pf.positions.map(p => ({ positionId: p.positionId, instrumentId: p.instrumentId, isBuy: p.isBuy, leverage: p.leverage }));
      const ids = [...new Set(nl.map(p => p.instrumentId))].filter(id => !inst.has(id)); if (ids.length) { const j = await eg('/api/v1/market-data/instruments?instrumentIds=' + ids.join(',')); for (const x of (j && (j.instrumentDisplayDatas || j.instruments || j.results)) || []) inst.set(x.instrumentID ?? x.instrumentId, String(x.symbolFull || x.symbol || '').toUpperCase()); }
      for (const p of nl) { const s = inst.get(p.instrumentId); if (s && /^[A-Z]{1,5}$/.test(s)) { addSignal('EXP-ETORO1', s, String(p.openTimestamp || iso(Date.now())).slice(0, 10), { investor: u }); opened++; } } }
    paperNote['EXP-ETORO1'] = users.length + ' ranked Popular Investors snapshotted, ' + opened + ' new long US-stock positions'; }
  else paperNote['EXP-ETORO1'] = 'disabled: add the ETORO_KEY and ETORO_USER_KEY secrets (eToro API portal) to switch it on';
  paperNote['EXP-CONG1'] = STATUS['EXP-CONG1'].note;
  fs.writeFileSync(EC + '/live.json', JSON.stringify(LIVE)); fs.writeFileSync(EC + '/cusip.json', JSON.stringify(CMAP));
}
const allSig = [...lines.filter(x => x.type === 'signal'), ...newLines.filter(x => x.type === 'signal')], live = [];
for (const x of allSig) { const i = SY.get(x.sym), k = firstAfter(x.d), rule = RULES[x.m]; let st = { state: 'waiting' };
  if (i !== undefined && k < T) { const S = series(i), r = walkHold(S.o, S.c, k, rule.hold, rule.stop); if (r) st = { state: 'closed', k, x: r.x, g: r.g, kind: r.kind }; else { const m = markOpen(S.o, S.c, k, rule.stop); st = m && !m.stopHit ? { state: 'open', k, g: m.g } : m && m.stopHit !== undefined ? { state: 'open', k, g: null } : { state: 'waiting' }; } }
  live.push({ x, r: st });
  if (st.state === 'closed' && !resolved.has(x.id)) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[st.k], sell: D[st.x], exit: st.kind, g: r4(st.g), net: r4(st.g - COST) }); } }
if (newLines.length && !DIAG) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x)).join('\n') + '\n');
const tierOf = (id) => { const r = firstRun[id]; return r ? r.verdict : null; }, lastD = D[T - 1], board = {}, today = {};
for (const m of Object.keys(RULES)) { const mine = live.filter(z => z.x.m === m), closed = mine.filter(z => z.r.state === 'closed').map(z => ({ d: z.x.d, sym: z.x.sym, g: z.r.g, halal: z.x.halal })), all = boardStats(closed);
  board[m] = { name: RULES[m].name, hold: RULES[m].hold, stop: RULES[m].stop, data: STATUS[m] || null, signals: mine.length, waiting: mine.filter(z => z.r.state === 'waiting').length, open: mine.filter(z => z.r.state === 'open').length,
    closed: all, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), trySmallReady: trySmallReady(all), fiveYear: firstRun[m] ? { verdict: firstRun[m].verdict, why: firstRun[m].why } : null, paper: paperNote[m] || null };
  today[m] = { tier: tierOf(m), newSignals: mine.filter(z => z.x.d >= D[Math.max(0, T - 1)] || (z.r.state === 'waiting' && z.x.d >= iso(Date.now() - 4 * 864e5))).map(z => ({ sym: z.x.sym, close: z.x.close, halal: z.x.halal, signal: z.x.d, info: z.x.info })),
    open: mine.filter(z => z.r.state === 'open').map(z => ({ sym: z.x.sym, halal: z.x.halal, signal: z.x.d, buy: D[z.r.k], sinceBuy: r4(z.r.g) })), note: paperNote[m] || null }; }
if (!DIAG) { fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: lastD, paperStart: START, stopPct: 0.35,
    note: 'PAPER ONLY. Expert-follow rules (EXP-*): signals of experts ranked by the lab itself, point in time. Nothing here is a buy unless a rule\'s frozen 5-year verdict passes the TRY SMALL test (data/expert-lab.json firstRun) or its paper record has 30+ resolved trades on 10+ days with a positive average after 0.8% cost. Halal = the owner\'s ZAD mark; "unknown" must be checked first.',
    methods: today }, null, 1));
  fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: lastD, paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1)); }
const out = { generatedAt: new Date().toISOString(), diag: DIAG || undefined, preRegistered: 'expert-core.mjs header + data/strategy-library.json EXP-* (23 Oct 2026, before any run)', window: [cacheFirst, D[T - 1]], preHistoryFrom: D[0], bar: BAR, leagueBar: LEAGUE.bar || null,
  standard: 'both halves (split at the median signal session): > 0 after 0.8% and 1.2% cost, better than the average liquid stock bought and sold on the same sessions, better than the same stock on its other days, > 0 without the 2 best, block t >= ' + TIER2_T + ' -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN; plus the SKILL gate (better than the same rule with every expert, no ranking, in both halves)',
  survivorship: 'Platform rankings list past winners. Here every expert is ranked only on calls whose window ENDED before the signal day; nothing about later success is used.',
  data: STATUS, firstRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }), trades: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, r.trades.slice(-2000)])) };
if (!DIAG) fs.writeFileSync(LAB, JSON.stringify(out, null, 1)); else { console.log('EXPERT LAB DIAGNOSTICS (data and coverage only; no returns computed; nothing written)'); console.log(JSON.stringify(STATUS, null, 1).slice(0, 8000)); }
log('paper: ' + newLines.filter(x => x.type === 'signal').length + ' new signals, ' + allSig.length + ' in all; SEC calls ' + secCalls + '; Massive calls ' + calls);
for (const m of Object.keys(RULES)) console.log('- ' + m + ': ' + (board[m] ? board[m].signals + ' paper signals, closed ' + board[m].closed.n : '') + ' | ' + (paperNote[m] || '') + (firstRun[m] ? ' | 5-year: ' + firstRun[m].verdict : ''));
// library: the frozen verdict only
if (!DIAG) try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const m of Object.keys(RULES)) { const e = LB && LB.strategies.find(x => x.id === m); if (!e) continue; const r = firstRun[m];
    if (r && !e.result) { const R = r.results; e.tested = String(r.window[1]); e.status = 'tested: ' + r.verdict.toLowerCase() + ' (5-year one-shot); live paper from 26 Oct (expert lane)'; e.study = 'expert-lab.mjs -> data/expert-lab.json (run once as written, first complete run frozen)';
      e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: r.shape.win, why: r.why }; ch = true; } }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('expert-lab: library not updated: ' + e.message); }
