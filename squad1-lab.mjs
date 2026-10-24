// SQUAD 1 LAB: INFORMATION EDGE (24 Oct 2026; the owner's 4-squad competition). Research + a FORWARD PAPER lane; never places an order;
// no Telegram. Rules: squad1-core.mjs RULES (pre-registered 24 Oct 2026 before any run; library ids SQ1-*; the lab writes the same rule
// text into data/strategy-library.json before computing anything).
// 1. DATA (GitHub Actions only; keys only from secrets, never printed; official sources, no scraping):
//    prices   = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY, dead stocks' later prices in
//               its x rows) + the sessions since from Massive grouped daily bars + splits since the cache day (anomaly-lab pattern).
//    insiders = SEC Form 3/4/5 quarterly data sets (2021 on) with each reporting owner's role and title; forward: the EDGAR daily index +
//               each new Form 4 document (from the paper start).
//    8-K text = SEC EDGAR full-text search (efts.sec.gov) per phrase and month; buyback documents are read for the authorized size.
//    customer = data/chain-graph.json (chain-decoder.mjs: 10-K / 10-Q major-customer sentences, dated by filing).
//    short    = FINRA consolidated short interest (public API; anomaly-cache/finra read only when present).
//    analysts = Finnhub recommendation trends (FINNHUB_KEY). dividends = Massive dividends (MASSIVE_KEY). shares = data/shares.json.gz.
//    A source that does not load completely makes ITS rules "NOT RUN" (no verdict frozen); the others run.
// 2. 5-YEAR ONE-SHOT for every rule not yet frozen (value-core judge; halves = signal before / from 2024-01-01; capped yardstick AUD-1).
//    First complete verdict frozen in data/squad1-lab.json firstRun (first-run.mjs freezeEach); later runs = monitoring only.
// 3. PAPER LANE from Monday 26 Oct 2026: data/squad1-paper.jsonl, data/squad1-today.json (methods[id].newSignals), data/squad1-board.json.
// DIAG=1: coverage check only (data loaded and cached, signal counts per rule and half), no returns computed, no verdict, no paper line.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, judge, TIER2_T } from './value-core.mjs';
import { RULES, IDS, ONE_OPEN, COST, SPLIT, PAPER_START, BUYBACK_PHRASES, GUIDE_PHRASES, mean, r4, halfOf, capG, pickFrac, monthStarts, firstAfter as fAfter, nextSession, addDays, ownAverage,
  relFlags, isInsider, isTopOfficer, clusterEvents, topOfficerBuys, parseForm4, parseDailyIdx, html2text, buybackAmount, buybackSize, firstPerCompany, eftsHits, linkActive, recChange, recUp,
  divHikes, siKnown, lowShort, avoidVerdict, boardStats, paperReady, shapeOf, preRegister, pitPick, sharesAt } from './squad1-core.mjs';
const env = process.env, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', EFTS = local(env.EFTS_BASE) || 'https://efts.sec.gov',
  FINRA = local(env.FINRA_BASE) || 'https://api.finra.org', FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ1_CACHE || 'squad1-cache', OUT = 'data/squad1-lab.json', PAPER = 'data/squad1-paper.jsonl', TODAY = 'data/squad1-today.json', BOARD = 'data/squad1-board.json';
const DIAG = !!env.DIAG, START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ1_MINUTES || 280) * 60e3, left = () => BUDGET - (Date.now() - t0);
const redact = (s) => String(s).replace(/(apiKey|token)=[^&\s]+/gi, '$1=***');
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0);
log('squad 1 lab' + (DIAG ? ' (DIAG: coverage only, no returns)' : '') + '; frozen already: ' + Object.keys(FROZEN).length + '/' + IDS.length);

// ================= 0. PRE-REGISTRATION in the library (before any computation; idempotent) =================
{ const LB = J('data/strategy-library.json', null), ch = preRegister(LB); if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ1 entries pre-registered now'); }

// ================= 1. PRICES (anomaly-lab pattern) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad1-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
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
// liquidity: close 5 USD+ and 20-session average traded value 5M USD+ (main rows only)
const LIQ = new Uint8Array(N); for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = C[b + t] * V[b + t]; if (isFinite(v)) { s += v; n++; } if (t >= 20) { const w = C[b + t - 20] * V[b + t - 20]; if (isFinite(w)) { s -= w; n--; } } if (t >= 19 && n === 20 && C[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqAt = new Map(); const liqList = (t) => { if (!liqAt.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqAt.set(t, a); } return liqAt.get(t); };
const liqOn = (i, t) => t >= 0 && t < T && LIQ[i * T + t] === 1;
const closeAt = (i, x, k) => { for (let q = x; q >= k; q--) { const z = C[i * T + q]; if (z > 0) return z; const y = CX[i * T + q]; if (y > 0) return y; } return null; };
const ret = (i, k, x) => { if (x >= T || k < 1) return null; const e = O[i * T + k]; if (!(e > 0)) return null; const y = closeAt(i, x, k); return y > 0 ? y / e - 1 : null; };
// the average liquid stock (every second one, as the other labs), each gross return capped at +300% like the trades (AUD-1 corrected rule)
const cMemo = new Map(); const ctrlSpan = (k, x) => { const key = k * 8192 + x; if (cMemo.has(key)) return cMemo.get(key); const v = [];
  for (const i of liqList(k - 1)) { if (i % 2) continue; const g = ret(i, k, x); if (g !== null && isFinite(g)) v.push(capG(g)); } const m = v.length >= 50 ? mean(v) : null; cMemo.set(key, m); return m; };
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {}, c: {} });
const symCik = (s) => { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) return String(a); const y = SECCIK[s]; return y ? String(y[0]) : null; };
const cikSyms = new Map(); for (const s of SYMS) { const c = symCik(s); if (c) (cikSyms.get(c) || cikSyms.set(c, []).get(c)).push(s); }
const sharesKnown = (cik, d) => { const a = SH.c[cik]; if (!a) return null; const lim = iso(Date.parse(d + 'T00:00:00Z') - 30 * 864e5); let v = null; for (const [e, n] of a) if (e <= lim) v = n; return v; };
// share count known on d: the filing's own CIK, else the point-in-time CIK of the ticker (EVID), else today's ticker list (survivorship fix)
const sharesOf = (s, d, filingCik) => sharesAt({ sym: s, d, filingCik, evidence: EVID, todayCik: symCik, series: sharesKnown });
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
const FORM_M = monthStarts(D), STATUS = {};
const hasPx = (i, t) => { for (let q = Math.max(0, t - 5); q <= Math.min(T - 1, t + 5); q++) if (C[i * T + q] > 0 || CX[i * T + q] > 0) return true; return false; };
// the stock behind a filing: a display-name ticker with prices, else a ticker of the CIK with prices near the date
const symFor = (cik, tickers, d) => { const t = Math.min(firstAfter(d), T - 1); for (const s of tickers || []) { const i = SY.get(s); if (i !== undefined && hasPx(i, t)) return s; }
  const p = pitPick(CIKSYM.get(String(+cik)), d); if (p && SY.has(p) && hasPx(SY.get(p), t)) return p;   // point-in-time ticker of the CIK (delisted companies too)
  for (const s of cikSyms.get(String(+cik)) || []) if (hasPx(SY.get(s), t)) return s; return null; };

// ================= 2. DATA SOURCES =================
let lastSec = 0, secReq = 0, secFail = 0; const SECFAILS = [];
async function sec(url, kind = 'json', host = 'sec') { for (let a = 0; a < 4; a++) { const w = (local(env.SEC_BASE) || local(env.EFTS_BASE) ? 0 : 125) - (Date.now() - lastSec); if (w > 0) await sleep(w); lastSec = Date.now(); secReq++;
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' }, signal: AbortSignal.timeout(60000) }); if (r.status === 404 || r.status === 410) return kind === 'text' ? '' : null;
      if (r.status === 429 || r.status === 403 || r.status >= 500) { await sleep(2000 * (a + 1)); continue; } if (!r.ok) { secFail++; if (SECFAILS.length < 20) SECFAILS.push('HTTP ' + r.status + ' ' + url.slice(0, 200)); return undefined; }
      return kind === 'json' ? await r.json() : await r.text(); } catch (e) { await sleep(1000 * (a + 1)); } }
  secFail++; if (SECFAILS.length < 20) SECFAILS.push('gave up ' + url.slice(0, 200)); return undefined; }
async function download(url, file) { try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 30 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
const tsv = (zip, name) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const L = txt.split(/\r?\n/), H = L[0].split('\t'); return { H, rows: L.slice(1).filter(Boolean).map(l => l.split('\t')) }; };
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : /^\d{4}-\d\d-\d\d/.test(String(s || '')) ? String(s).slice(0, 10) : null; };
const months = (from) => { const out = [], now = new Date(); for (let y = +from.slice(0, 4), m = +from.slice(5, 7); y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1); m === 12 ? (y++, m = 1) : m++) out.push(y + '-' + String(m).padStart(2, '0')); return out; };
const monthEnd = (m) => iso(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)), thisMonth = iso(Date.now()).slice(0, 7), slug = (p) => p.toLowerCase().replace(/[^a-z0-9]+/g, '-');

// ---- 2a. SEC insider data sets (2021 on) with roles; forward: EDGAR daily index + Form 4 documents ----
// point-in-time identity evidence (survivorship fix, 24 Oct 2026): ticker -> [[date, CIK]] and CIK -> [[date, ticker]] from every Form 3/4/5
// submission (issuer ticker + issuer CIK on its filing date) and from EDGAR full-text hits, so taken-over / renamed / delisted companies keep
// their share counts and tickers (TODAY's ticker list alone dropped them)
const EVID = new Map(), CIKSYM = new Map(); const addEv = (sym, cik, d) => { if (!sym || !cik || !d || !/^[A-Z][A-Z0-9.]{0,6}$/.test(sym)) return; const c = String(+cik); if (!(+c > 0)) return;
  (EVID.get(sym) || EVID.set(sym, []).get(sym)).push([d, c]); (CIKSYM.get(c) || CIKSYM.set(c, []).get(c)).push([d, sym]); };
const BUYS = []; { const qs = [], now = new Date(); for (let y = 2021; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, q * 3, 1)) < now) qs.push(y + 'q' + q);
  let got = 0; const fail = [];
  for (const q of qs) { const cf = SC + '/insider2/' + q + '.json'; let x = J(cf, null);
    if (!x && left() > 100 * 60e3) { for (const p of ['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/']) { const zip = SC + '/ins.zip'; if (local(env.SEC_BASE) || !(await download(SEC + p + q + '_form345.zip', zip))) continue;
        const S = tsv(zip, 'SUBMISSION.tsv'), Nt = tsv(zip, 'NONDERIV_TRANS.tsv'), RO = tsv(zip, 'REPORTINGOWNER.tsv'); try { fs.unlinkSync(zip); } catch (e) {} if (!S || !Nt || !RO) continue;
        const own = new Map(), ri = (n) => RO.H.indexOf(n); for (const r of RO.rows) if (!own.has(r[ri('ACCESSION_NUMBER')])) own.set(r[ri('ACCESSION_NUMBER')], [r[ri('RPTOWNERCIK')], r[ri('RPTOWNER_RELATIONSHIP')] || '', r[ri('RPTOWNER_TITLE')] || '']);
        const si = (n) => S.H.indexOf(n), ni = (n) => Nt.H.indexOf(n), sub = new Map();
        const pairs = new Map(); for (const r of S.rows) { const d0 = isoD(r[si('FILING_DATE')]), sy = String(r[si('ISSUERTRADINGSYMBOL')] || '').toUpperCase().trim().replace(/-/g, '.'), ck = String(+r[si('ISSUERCIK')] || '');
          if (d0 && sy && +ck > 0) { const k = sy + '|' + ck, pr = pairs.get(k); if (!pr) pairs.set(k, [sy, ck, d0, d0]); else { if (d0 < pr[2]) pr[2] = d0; if (d0 > pr[3]) pr[3] = d0; } }
          if (r[si('DOCUMENT_TYPE')] === '4') sub.set(r[si('ACCESSION_NUMBER')], { d: d0, sym: sy, cik: ck }); }
        const rows = []; for (const r of Nt.rows) { if (r[ni('TRANS_CODE')] !== 'P' || r[ni('TRANS_ACQUIRED_DISP_CD')] !== 'A') continue; const s = sub.get(r[ni('ACCESSION_NUMBER')]); if (!s || !s.d || !/^[A-Z][A-Z0-9.]{0,6}$/.test(s.sym)) continue;
          const o = own.get(r[ni('ACCESSION_NUMBER')]); if (!o) continue; const sh = +r[ni('TRANS_SHARES')], px = +r[ni('TRANS_PRICEPERSHARE')]; if (sh > 0 && px > 0) rows.push([s.sym, s.d, o[0], Math.round(sh * px), o[1], o[2], s.cik]); }
        x = { rows, pairs: [...pairs.values()] }; W(cf, x); got++; break; } }
    if (!x) { fail.push(q); continue; } for (const r of x.rows) BUYS.push(r); for (const [sy, ck, a, b] of x.pairs || []) { addEv(sy, ck, a); if (b !== a) addEv(sy, ck, b); } }
  const dataEnd = (() => { const ok = qs.filter(q => !fail.includes(q)), last = ok[ok.length - 1]; return last ? iso(Date.UTC(+last.slice(0, 4), +last.slice(5) * 3, 0)) : null; })();
  // forward: Form 4s filed from the paper start (EDGAR daily index), cached per day once the day's index answered
  let fwdDays = 0, fwdDocs = 0, fwdMiss = [];
  if (dataEnd) { const from = START > dataEnd ? START : addDays(dataEnd, 1), uni = (r) => cikSyms.has(r.cik) || CIKSYM.has(r.cik);
    for (let d = from; d <= iso(Date.now()); d = addDays(d, 1)) { const wd = new Date(d + 'T00:00:00Z').getUTCDay(); if (wd === 0 || wd === 6) continue; const cf = SC + '/f4/' + d + '.json'; let x = J(cf, null);
      if (!x && left() > 40 * 60e3) { const q = Math.floor((+d.slice(5, 7) - 1) / 3) + 1, txt = await sec(SEC + '/Archives/edgar/daily-index/' + d.slice(0, 4) + '/QTR' + q + '/master.' + d.replace(/-/g, '') + '.idx', 'text');
        if (txt) { const files = parseDailyIdx(txt, new Set(['4']), uni), rows = []; let bad = 0;
          for (const f of files) { const doc = await sec(SEC + '/Archives/' + f.file, 'text'); if (doc === undefined) { bad++; continue; } const p = parseForm4(doc); if (!p || !p.buys.length || !p.owners.length) continue; fwdDocs++;
            const o = p.owners[0], rel = [o.officer && 'Officer', o.director && 'Director', o.ten && 'TenPercentOwner', o.other && 'Other'].filter(Boolean).join(','), sym = p.sym || (cikSyms.get(String(+p.issuerCik)) || [])[0];
            if (sym && p.issuerCik) addEv(sym, p.issuerCik, d); for (const b of p.buys) if (sym) rows.push([sym, d, o.cik, Math.round(b.usd), rel, o.title, String(+p.issuerCik || '')]); }
          if (bad <= files.length * 0.02) { x = { rows, files: files.length }; W(cf, x); } else fwdMiss.push(d + ' (' + bad + ' documents not read)'); }
        else if (d < iso(Date.now())) fwdMiss.push(d); }
      if (x) { fwdDays++; for (const r of x.rows) { BUYS.push(r); if (r[6]) addEv(r[0], r[6], r[1]); } } } }
  STATUS.insider = { ok: !fail.some(q => q < qs[qs.length - 1]), quarters: qs.length, downloadedNow: got, missing: fail, purchases: BUYS.length, dataSetsTo: dataEnd, forwardDays: fwdDays, forwardDocsWithBuys: fwdDocs, forwardMissing: fwdMiss.slice(0, 10) };
  log('insider: ' + BUYS.length + ' purchase rows, data sets to ' + dataEnd + ', missing ' + (fail.join(' ') || 'none') + '; forward days ' + fwdDays + (fwdMiss.length ? ' (not yet: ' + fwdMiss.slice(0, 3).join(', ') + ')' : '')); }
const BUYROWS = BUYS.map(([sym, d, who, usd, rel, title, cik]) => { const f = relFlags(rel); if (cik) addEv(sym, cik, d); return { sym, d, who, usd, cik: cik || null, officer: f.officer, insider: isInsider(f), top: f.officer && isTopOfficer(title) }; });

// ---- 2b. FINRA consolidated short interest (public API; the anomaly lab's monthly files read only when present) ----
const SI = new Map(); { let ok = 0, tried = 0, fromA = 0, note = ''; const ms0 = months(D[0].slice(0, 7));
  const pick = (r, ks) => { for (const k of ks) if (r[k] !== undefined && r[k] !== null && r[k] !== '') return r[k]; return null; };
  for (const m of ms0) { const cur = m >= iso(Date.now() - 40 * 864e5).slice(0, 7), cf = SC + '/finra/' + m + '.json'; let rows = cur ? null : J(cf, null);
    if (!rows && !cur) { rows = J('anomaly-cache/finra/' + m + '.json', null); if (rows) fromA++; }
    if (!rows && !note && left() > 60 * 60e3) { tried++; rows = []; let off = 0, okm = true;
      while (true) { let r = null; try { r = await fetch(FINRA + '/data/group/otcMarket/name/consolidatedShortInterest', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(60000),
          body: JSON.stringify({ limit: 5000, offset: off, dateRangeFilters: [{ fieldName: 'settlementDate', startDate: m + '-01', endDate: monthEnd(m) }] }) }); } catch (e) { r = null; }
        if (!r || !r.ok) { okm = false; note = 'FINRA API answered ' + (r ? r.status : 'nothing') + ' for ' + m; break; } const a = await r.json().catch(() => null); if (!Array.isArray(a)) { okm = false; note = 'FINRA API: not a list for ' + m; break; }
        if (a.length && a.some(x => !String(pick(x, ['settlementDate']) || '').startsWith(m))) { okm = false; note = 'FINRA API ignored the date filter for ' + m; break; }
        for (const x of a) { const s = pick(x, ['symbolCode', 'issueSymbolIdentifier']), d = pick(x, ['settlementDate']), q = +pick(x, ['currentShortPositionQuantity', 'currentShortShareNumber']), dtc = +pick(x, ['daysToCoverQuantity', 'daysToCoverNumber']);
          if (s && d && isFinite(q)) rows.push([String(s).toUpperCase(), String(d).slice(0, 10), q, isFinite(dtc) && dtc < 999 ? dtc : null]); }
        if (a.length < 5000) break; off += 5000; if (off >= 200000) { okm = false; note = 'FINRA paging did not end for ' + m; break; } await sleep(200); }
      if (!okm) rows = null; else if (!cur && rows.length) W(cf, rows); }
    if (rows && rows.length) { ok++; for (const [s, d, q, dtc] of rows) (SI.get(s) || SI.set(s, []).get(s)).push([d, q, dtc]); } }
  for (const a of SI.values()) { a.sort((x, y) => x[0] < y[0] ? -1 : 1); for (let j = a.length - 1; j > 0; j--) if (a[j][0] === a[j - 1][0]) a.splice(j, 1); }
  const past = ms0.filter(m => m < thisMonth).length; STATUS.si = { ok: ok >= past * 0.95, months: ms0.length, withData: ok, fromAnomalyCache: fromA, tried, note }; log('short interest: ' + ok + '/' + ms0.length + ' months' + (note ? ' (' + note + ')' : '')); }

// ---- 2c. EDGAR full-text search: buyback authorizations and guidance raises (8-K incl. exhibits), cached per phrase and month ----
async function efts(phrase, a, b) { const hits = []; for (let from = 0; from < 10000; from += 100) {
    const j = await sec(EFTS + '/LATEST/search-index?q=' + encodeURIComponent('"' + phrase + '"') + '&forms=8-K&dateRange=custom&startdt=' + a + '&enddt=' + b + '&from=' + from);
    if (!j || !j.hits) return null; const tot = (j.hits.total && j.hits.total.value) || 0;
    if (from === 0 && tot >= 9900 && a < b) { const mid = iso((Date.parse(a) + Date.parse(b)) / 2), x = await efts(phrase, a, mid), y = await efts(phrase, addDays(mid, 1), b); return x && y ? x.concat(y) : null; }
    const h = eftsHits(j); hits.push(...h); if (h.length < 100 || from + 100 >= tot) break; } return hits; }
const FT = { complete: true, monthsFetched: 0, missing: [] }, FROM8K = '2021-07';
async function phraseHits(phrase) { const out = [];
  for (const m of months(FROM8K)) { const f = SC + '/efts/' + slug(phrase) + '/' + m + '.json', had = J(f, null), recent = m >= iso(Date.now() - 10 * 864e5).slice(0, 7);
    if (had && !recent) { out.push(...had); continue; } if (left() < 50 * 60e3) { if (had) out.push(...had); else { FT.complete = false; FT.missing.push(phrase + ' ' + m); } continue; }
    const h = await efts(phrase, m + '-01', monthEnd(m)); FT.monthsFetched++; if (!h) { if (had) out.push(...had); else { FT.complete = false; FT.missing.push(phrase + ' ' + m); } continue; } W(f, h); out.push(...h); }
  return out; }
const BBHITS = [], GUHITS = []; for (const p of BUYBACK_PHRASES) BBHITS.push(...(await phraseHits(p))); for (const p of GUIDE_PHRASES) GUHITS.push(...(await phraseHits(p)));
for (const h of [...BBHITS, ...GUHITS]) if ((h[5] || []).length === 1) addEv(h[5][0], h[2], h[3]);   // a single-ticker filer: point-in-time evidence
if (!FT.complete && left() > 60 * 60e3) { await sleep(30000); const miss = FT.missing.splice(0); FT.complete = true;   // one more try for refused phrase-months
  for (const x of miss) { const m = x.slice(-7), ph = x.slice(0, -8), h = await efts(ph, m + '-01', monthEnd(m)); if (!h) { FT.complete = false; FT.missing.push(x); continue; } W(SC + '/efts/' + slug(ph) + '/' + m + '.json', h); (BUYBACK_PHRASES.includes(ph) ? BBHITS : GUHITS).push(...h); } }
STATUS.efts = { ok: FT.complete, monthsFetchedNow: FT.monthsFetched, missing: FT.missing.slice(0, 20), buybackHits: BBHITS.length, guidanceHits: GUHITS.length };
log('full-text search: ' + BBHITS.length + ' buyback hits, ' + GUHITS.length + ' guidance hits, ' + FT.monthsFetched + ' phrase-months fetched now' + (FT.complete ? '' : ', INCOMPLETE ' + FT.missing.length));
// buyback documents: the matched document of every filing of a universe company is read once for the authorized size
const BBDOC = J(SC + '/bbdocs.json', {}); { let read = 0, miss = 0; const want = new Map();
  for (const h of BBHITS) { if (!cikSyms.has(String(h[2])) && !CIKSYM.has(String(+h[2])) && !(h[5] || []).some(s => SY.has(s))) continue; if (h[3] < '2021-07-01') continue; if (!want.has(h[0])) want.set(h[0], h); }
  for (const [id, h] of want) { if (id in BBDOC) continue; if (left() < 45 * 60e3) { miss++; continue; }
    const file = String(id).split(':')[1], html = await sec(SEC + '/Archives/edgar/data/' + h[2] + '/' + String(h[1]).replace(/-/g, '') + '/' + file, 'text');
    if (html === undefined) { miss++; continue; } const a = buybackAmount(html2text(String(html).slice(0, 800000))); BBDOC[id] = [a.usd, a.shares]; read++; if (read % 500 === 0) { W(SC + '/bbdocs.json', BBDOC); log('buyback documents read: ' + read); } }
  W(SC + '/bbdocs.json', BBDOC); STATUS.buyback = { ok: FT.complete && miss <= want.size * 0.02, documents: want.size, readNow: read, notRead: miss, withAmount: [...want.keys()].filter(id => BBDOC[id] && (BBDOC[id][0] || BBDOC[id][1])).length };
  log('buyback documents: ' + want.size + ' (' + read + ' read now, ' + miss + ' not read, ' + STATUS.buyback.withAmount + ' with a size)'); }
STATUS.guidance = { ok: FT.complete, hits: GUHITS.length };

// ---- 2d. customer links (chain-graph.json) ----
const CG = J('data/chain-graph.json', {}), CLINKS = (CG.links || []).filter(l => l && l.type === 'customer' && l.supplier && l.customer && SY.has(l.supplier) && SY.has(l.customer));
STATUS.customer = { ok: !!CG.complete && CLINKS.length >= 100, links: (CG.links || []).filter(l => l && l.type === 'customer').length, usable: CLINKS.length, suppliers: new Set(CLINKS.map(l => l.supplier)).size, graphAt: CG.generatedAt || null };
log('customer links: ' + CLINKS.length + ' usable, ' + STATUS.customer.suppliers + ' suppliers');

// ---- 2e. Finnhub recommendation trends (probe the history first; whole history fetched only if it is deep enough) ----
const REC = new Map(); { const cf = SC + '/rec.json.gz', had = JZ(cf, { at: null, depth: null, m: {} }); let st = { ok: false };
  const fh = async (sym) => { for (let a = 0; a < 3; a++) { await sleep(local(env.FH_BASE) ? 0 : 1050); let r; try { r = await fetch(FH + '/stock/recommendation?symbol=' + encodeURIComponent(sym) + '&token=' + encodeURIComponent(env.FINNHUB_KEY || ''), { signal: AbortSignal.timeout(30000) }); } catch (e) { continue; }
      if (r.status === 429) { await sleep(20000); continue; } if (!r.ok) return { status: r.status }; const j = await r.json().catch(() => null); return Array.isArray(j) ? j.map(x => ({ period: x.period, strongBuy: x.strongBuy, buy: x.buy, hold: x.hold, sell: x.sell, strongSell: x.strongSell })) : null; } return null; };
  if (!env.FINNHUB_KEY && !had.depth) st = { ok: false, note: 'no FINNHUB_KEY' };
  else { let depth = had.depth;
    if (!depth && env.FINNHUB_KEY) { const probes = {}; for (const s of ['AAPL', 'MSFT', 'JPM', 'XOM', 'PFE']) { const a = await fh(s); probes[s] = Array.isArray(a) && a.length ? a.map(x => x.period).sort()[0] : (a && a.status ? 'HTTP ' + a.status : 'none'); }
      const firsts = Object.values(probes).filter(x => /^\d{4}-/.test(x)).sort(); depth = { probes, earliest: firsts[Math.floor(firsts.length / 2)] || null }; }
    const deep = depth && depth.earliest && depth.earliest <= '2021-06-01';
    if (!deep) st = { ok: false, note: 'Finnhub history too short for a 5-year test (median earliest month of 5 large stocks: ' + (depth && depth.earliest) + '; needs 2021-06 or earlier)', depth };
    else { const want = new Map(); for (const t of FORM_M) for (const i of liqList(t)) want.set(i, (want.get(i) || 0) + 1);
      const syms = [...want].sort((a, b) => b[1] - a[1]).slice(0, +env.SQ1_REC_MAX || 2500).map(([i]) => SYMS[i]); const stale = !had.at || Date.now() - Date.parse(had.at) > 25 * 864e5; let got = 0, fail = 0;
      for (const s of syms) { if (had.m[s] && !stale) continue; if (left() < 60 * 60e3) break; const a = await fh(s); if (Array.isArray(a)) { had.m[s] = a; got++; } else fail++; }
      const cov = syms.filter(s => had.m[s]).length; if (got) { had.at = new Date().toISOString(); had.depth = depth; WZ(cf, had); }
      st = { ok: cov >= syms.length * 0.95, universe: syms.length, withData: cov, fetchedNow: got, failed: fail, depth, note: 'the most-often-liquid ' + syms.length + ' stocks (dead stocks Finnhub no longer covers are missing: survivorship risk)' }; }
    for (const [s, a] of Object.entries(had.m || {})) REC.set(s, a); if (depth && depth.earliest && !had.depth) { had.depth = depth; WZ(cf, had); } }
  STATUS.analyst = st; log('analyst consensus: ' + JSON.stringify(st).slice(0, 300)); }

// ---- 2f. Massive dividends with amounts (declaration dates) ----
const DIVS = []; { const cf = SC + '/divs.json.gz'; let x = JZ(cf, null), ok = false; const row = (r) => [r.ticker, r.declaration_date, r.dividend_type || '', +r.frequency || 0, +r.cash_amount || 0];
  if (!x || Date.now() - Date.parse(x.at) > 6 * 864e5) { const rows = []; let path = '/v3/reference/dividends?declaration_date.gte=2020-06-01&order=asc&sort=declaration_date&limit=1000', pages = 0, done = false;
    while (path && pages < 3000 && left() > 50 * 60e3) { const j = await api(path); pages++; if (!j || j.refused || !Array.isArray(j.results)) break; for (const r of j.results) if (r && r.ticker && r.declaration_date) rows.push(row(r));
      if (!j.next_url) { done = true; break; } path = j.next_url.replace(/^https?:\/\/[^/]+/, ''); }
    if (done && rows.length > 1000) { x = { at: new Date().toISOString(), rows }; WZ(cf, x); } else log('dividends: download incomplete (' + pages + ' pages, ' + rows.length + ' rows)'); }
  else { const j = await api('/v3/reference/dividends?declaration_date.gte=' + iso(Date.now() - 20 * 864e5) + '&limit=1000'); if (j && Array.isArray(j.results)) { const seen = new Set(x.rows.map(r => r.join('|'))); for (const r of j.results) if (r && r.ticker && r.declaration_date) { const a = row(r); if (!seen.has(a.join('|'))) x.rows.push(a); } } }
  if (x && x.rows) { ok = x.rows.some(r => r[4] > 0); for (const r of x.rows) DIVS.push({ sym: r[0], decl: r[1], type: r[2], freq: r[3], amt: r[4] }); } STATUS.divs = { ok, rows: DIVS.length, at: x && x.at }; log('dividends: ' + DIVS.length + ' rows'); }
STATUS.price = { ok: T >= 1000 && spyI !== undefined, sessions: T };
if (SECFAILS.length) log('SEC requests: ' + secReq + ', failed ' + secFail + ': ' + SECFAILS.slice(0, 3).map(redact).join(' | '));

// ================= 3. SIGNALS =================
// { t (signal session: everything used is known at its close), i, k (entry: bought at its OPEN), x (exit: sold at its close) }; k/x may lie
// beyond T-1 (paper lane). Events: k = the first session strictly after the public date.
const H = (id) => RULES[id].hold, EVENTS = {}, evPush = (id, e) => (EVENTS[id] = EVENTS[id] || []).push(e);
const evAt = (id, sym, d, check) => { const i = SY.get(sym); if (i === undefined || !d) return; const k = firstAfter(d), t = k - 1; if (t < 1) return;
  const tt = Math.min(t, T - 1); if (!liqOn(i, tt)) return; if (check && !check(i, tt)) return; evPush(id, { t: tt, i, k, x: k + H(id) - 1, d, future: k >= T }); };
const drop = (i, t, n) => { const a = closeAt(i, t - n, Math.max(0, t - n - 5)), b = C[i * T + t] > 0 ? C[i * T + t] : closeAt(i, t, t - 3); return a > 0 && b > 0 ? b / a - 1 : null; };
// insiders
for (const e of clusterEvents(BUYROWS, { minPeople: 3, minUsd: 300000, needOfficer: true })) evAt('SQ1-INSCLU', e.sym, e.d);
for (const e of topOfficerBuys(BUYROWS, 100000)) evAt('SQ1-CEODIP', e.sym, e.d, (i, t) => { const r = drop(i, t, 126); return r !== null && r <= -0.25; });
for (const e of clusterEvents(BUYROWS, { minPeople: 2, minUsd: 100000, needOfficer: false })) evAt('SQ1-INSLOWSI', e.sym, e.d, (i, t) => { const s = SYMS[i], a = SI.get(s); return lowShort(siKnown(a, D[t]), siKnown(a, D[t], 2), sharesOf(s, D[t], e.cik)); });
// buybacks: one size per filing (largest over its matched documents)
{ const byF = new Map(); for (const h of BBHITS) { const a = BBDOC[h[0]]; if (!a) continue; const f = byF.get(h[1]) || byF.set(h[1], { cik: h[2], d: h[3], tk: h[5], usd: null, shares: null }).get(h[1]);
    if (a[0] && (f.usd === null || a[0] > f.usd)) f.usd = a[0]; if (a[1] && (f.shares === null || a[1] > f.shares)) f.shares = a[1]; }
  const q5 = [], q3 = []; for (const f of byF.values()) { const sym = symFor(f.cik, f.tk, f.d); if (!sym) continue; const i = SY.get(sym), t = Math.min(firstAfter(f.d), T) - 1; if (t < 1) continue;
    const px = C[i * T + t] > 0 ? C[i * T + t] : closeAt(i, t, t - 5), sz = buybackSize(f, sharesOf(sym, D[t], f.cik), px); if (sz === null || sz >= 0.4) continue;
    if (sz >= 0.05) q5.push({ sym, d: f.d, sz }); if (sz >= 0.03) { const r = drop(i, t, 63); if (r !== null && r <= -0.15) q3.push({ sym, d: f.d, sz }); } }
  for (const e of firstPerCompany(q5, 180)) evAt('SQ1-BBAUTH', e.sym, e.d); for (const e of firstPerCompany(q3, 180)) evAt('SQ1-BBDIP', e.sym, e.d);
  STATUS.buyback.filings = byF.size; STATUS.buyback.size5 = q5.length; STATUS.buyback.size3dip = q3.length; }
// guidance raises
{ const ev = []; const seen = new Set(); for (const h of GUHITS) { if (seen.has(h[1])) continue; seen.add(h[1]); const sym = symFor(h[2], h[5], h[3]); if (sym) ev.push({ sym, d: h[3] }); }
  for (const e of firstPerCompany(ev, 60)) evAt('SQ1-GUIDEUP', e.sym, e.d); }
// dividend hikes
for (const e of divHikes(DIVS, { from: '2021-07-01' })) evAt('SQ1-DIVHIKE', e.sym, e.d);
// monthly sorts
const SORTS = {
  'SQ1-CUSTMOM': (t) => { if (t < 22) return []; const d = D[t], by = new Map(); for (const l of CLINKS) { if (!linkActive(l, d)) continue; (by.get(l.supplier) || by.set(l.supplier, new Set()).get(l.supplier)).add(l.customer); }
    const rows = []; for (const [s, cs] of by) { const i = SY.get(s); if (!liqOn(i, t)) continue; const r = [...cs].map(c => { const j = SY.get(c), a = C[j * T + t - 21], b = C[j * T + t]; return a > 0 && b > 0 ? b / a - 1 : null; }).filter(x => x !== null);
      if (r.length) rows.push({ key: i, v: mean(r) }); } return pickFrac(rows, 0.2, 'top', 10); },
  'SQ1-RECUP': (t) => liqList(t).filter(i => REC.has(SYMS[i]) && recUp(recChange(REC.get(SYMS[i]), D[t]))),
  'SQ1-SIAVOID': (t) => liqList(t).filter(i => { const s = SYMS[i], a = siKnown(SI.get(s), D[t]), sh = sharesOf(s, D[t]); return a && sh > 0 && a.q / sh >= 0.15; }),
};
function signalsOf(id, a, b) { if (SORTS[id]) return FORM_M.filter(t => t >= a && t <= b && t >= 21).flatMap(t => SORTS[id](t).map(i => ({ t, i, k: t + 1, x: t + H(id) })));
  return (EVENTS[id] || []).filter(z => z.t >= a && z.t <= b); }
const FAMILY_OK = { insider: () => STATUS.insider.ok, 'insider+si': () => STATUS.insider.ok && STATUS.si.ok, buyback: () => STATUS.buyback.ok, customer: () => STATUS.customer.ok,
  guidance: () => STATUS.guidance.ok, analyst: () => STATUS.analyst.ok, divs: () => STATUS.divs.ok, si: () => STATUS.si.ok };
const familyOk = (id) => STATUS.price.ok && !!FAMILY_OK[RULES[id].family]();
const familyNote = (id) => { const f = RULES[id].family; return f + ' data: ' + JSON.stringify(f === 'insider+si' ? { insider: STATUS.insider, si: STATUS.si } : STATUS[{ customer: 'customer', guidance: 'guidance', analyst: 'analyst', divs: 'divs', si: 'si', buyback: 'buyback', insider: 'insider' }[f]] || {}).slice(0, 400); };

// ================= 4. 5-YEAR ONE-SHOT =================
const need = IDS.filter(id => !FROZEN[id]);
const RES = {}, COUNTS = {};
function tradesOf(id, sigs, end = T - 1) { const out = [], busyUntil = new Map(), spans = new Map();
  for (const z of [...sigs].sort((p, q) => p.t - q.t || p.i - q.i)) { if (z.x >= T || z.x > end || z.future) continue;
    if (ONE_OPEN.has(id) && (busyUntil.get(z.i) ?? -1) >= z.k) continue; const g0 = ret(z.i, z.k, z.x); if (g0 === null || !isFinite(g0)) continue; const g = capG(g0), c = ctrlSpan(z.k, z.x); if (c === null) continue;
    busyUntil.set(z.i, z.x); (spans.get(z.i) || spans.set(z.i, []).get(z.i)).push([z.k, z.x]); out.push({ t: z.t, s: SYMS[z.i], i: z.i, k: z.k, x: z.x, g, c, half: halfOf(D[z.t]) }); }
  const ownMemo = new Map();
  for (const z of out) { const len = z.x - z.k + 1, key = z.i + '|' + len + '|' + z.half; if (!ownMemo.has(key)) ownMemo.set(key, ownAverage({ from: 253, to: end, len, step: 10, busy: spans.get(z.i) || [], okAt: (u) => LIQ[z.i * T + u - 1] === 1 && halfOf(D[u]) === z.half, ret: (u, x) => ret(z.i, u, x) }));
    z.own = ownMemo.get(z.i + '|' + len + '|' + z.half); }
  return out; }
for (const id of IDS) { const sigs = familyOk(id) ? signalsOf(id, 0, T - 1).filter(z => !z.future && z.x < T) : []; COUNTS[id] = { dataOk: familyOk(id), older: sigs.filter(z => halfOf(D[z.t]) === 'older').length, newer: sigs.filter(z => halfOf(D[z.t]) === 'newer').length }; }
log('signals with a complete hold (before one-open / yardstick filters): ' + IDS.map(id => id + ' ' + (COUNTS[id].dataOk ? COUNTS[id].older + '/' + COUNTS[id].newer : 'NO DATA')).join(', '));
if (DIAG) { W('data/squad1-diag.json', { generatedAt: new Date().toISOString(), note: 'DIAG: data coverage and signal counts only; no returns computed, no verdict', window: [D[0], D[T - 1]], data: STATUS, signals: COUNTS });
  console.log('SQUAD 1 DIAG ' + D[0] + ' to ' + D[T - 1] + ' | ' + Object.entries(STATUS).map(([k, s]) => k + (s.ok ? ' ok' : ' MISSING')).join(', ')); process.exit(0); }
log('5-year one-shot for ' + need.length + ' rules not yet frozen');
for (const id of [...new Set([...need, ...(env.HISTORY ? IDS : [])])]) { if (left() < 8 * 60e3) { RES[id] = { verdict: 'NOT RUN', why: 'time budget used up this run' }; continue; }
  if (!familyOk(id)) { RES[id] = { verdict: 'NOT RUN', why: 'data not available this run: ' + familyNote(id) }; log('- ' + id + ': NOT RUN (' + RULES[id].family + ' data)'); continue; }
  const tr = tradesOf(id, signalsOf(id, 0, T - 1)), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const v = RULES[id].kind === 'avoid' ? avoidVerdict(R) : judge(R, { bar: BAR });
  RES[id] = { ...v, results: R, shape: shapeOf(tr, z => D[z.t].slice(0, 4)), hold, kind: RULES[id].kind, family: RULES[id].family, name: RULES[id].name, split: SPLIT, cost: COST, yardstick: 'capBoth (AUD-1 corrected: trades and yardstick capped at +300% alike)',
    trades: tr.map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], net: r4(z.g - COST), avgStock: r4(z.c - COST), sameStock: r4(z.own === null || z.own === undefined ? null : z.own - COST) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock + ' win ' + pc(h.win);
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer) + ' | ' + RES[id].why.slice(0, 300)); }
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const isJudged = (r) => r && r.verdict && r.verdict !== 'NOT RUN';
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], bar: BAR, ...strip(r) }])), isJudged);

// ---- CORRECTED RUN (24 Oct 2026, independent re-check verify-lab.mjs): share counts and filing tickers were looked up through TODAY's SEC ticker
// list, so taken-over / renamed / delisted companies (DAY, SMAR, HOLX, AVDX, VRNT, LNW ...) lost their share count or ticker and their trades were
// silently dropped (survivorship bias). Fixed: the filing's own CIK, else the point-in-time CIK / ticker from Form 3/4/5 submissions and EDGAR hits,
// else today's list. Each affected rule is re-run ONCE on its frozen window and written to correctedRun next to firstRun (never over it).
const PIT_IDS = ['SQ1-BBAUTH', 'SQ1-BBDIP', 'SQ1-INSLOWSI', 'SQ1-SIAVOID', 'SQ1-GUIDEUP'];
const PIT_WHY = { 'SQ1-BBAUTH': 'buyback size needs the share count; the filer\'s ticker came from today\'s list when the EDGAR hit named none', 'SQ1-BBDIP': 'as SQ1-BBAUTH', 'SQ1-INSLOWSI': 'short interest / share count needs the share count of the issuer', 'SQ1-SIAVOID': 'short interest / share count needs the share count', 'SQ1-GUIDEUP': 'the filer\'s ticker came from today\'s list when the EDGAR hit named none (no share count used)' };
const correctedRun = { ...(PREV.correctedRun || {}) }, brief = (h) => h && h.n ? { n: h.n, blocks: h.blocks, avg: h.avg, avgStress: h.avgStress, edge: h.edge, vsOwn: h.vsOwn, noTop2: h.noTop2, tBlock: h.tBlock, win: h.win } : { n: 0 };
for (const id of PIT_IDS) { const fr = firstRun[id]; if (!fr || !fr.results || correctedRun[id] || !familyOk(id)) continue; const end = tOf.get(String((fr.window || [])[1])); if (end === undefined) { log('correction ' + id + ': frozen window end not in the data'); continue; }
  const tr = tradesOf(id, signalsOf(id, 0, T - 1), end), hold = H(id), R = { older: halfStat(tr.filter(z => z.half === 'older'), hold), newer: halfStat(tr.filter(z => z.half === 'newer'), hold), all: halfStat(tr, hold) };
  const v = RULES[id].kind === 'avoid' ? avoidVerdict(R) : judge(R, { bar: fr.bar });
  correctedRun[id] = { at: new Date().toISOString(), frozenAt: fr.frozenAt || fr.at || null, window: [D[0], D[end]], bar: fr.bar, bugs: ['SQ1-PIT'], hold, kind: RULES[id].kind, name: RULES[id].name,
    explanation: 'SQ1-PIT (survivorship): company identity was taken from TODAY\'s SEC ticker list, so companies taken over, renamed or delisted since (e.g. DAY, SMAR, HOLX, AVDX, VRNT, LNW) got no share count or no ticker and their trades were silently dropped. Here: ' + PIT_WHY[id] + '. Corrected: the filing\'s own CIK, else the point-in-time CIK/ticker from Form 3/4/5 submissions and EDGAR hits on that date, else today\'s list. Same rule text, same window, same costs and gates; run once.',
    verdict: v.verdict, why: v.why, results: R, frozen: { verdict: fr.verdict, older: brief(fr.results.older), newer: brief(fr.results.newer) },
    trades: tr.slice(-400).map(z => ({ s: z.s, sig: D[z.t], buy: D[z.k], sell: D[z.x], net: r4(z.g - COST), avgStock: r4(z.c - COST) })) };
  const f = (h) => (h.n || 0) + ' avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tBlock ' + h.tBlock;
  log('CORRECTED ' + id + ': ' + fr.verdict + ' -> ' + v.verdict + ' | older ' + f(R.older) + ' | newer ' + f(R.newer)); }
{ const fr = firstRun['SQ1-INSCLU'], end = fr ? tOf.get(String(fr.window[1])) : undefined; if (fr && end !== undefined && familyOk('SQ1-INSCLU')) { const tr = tradesOf('SQ1-INSCLU', signalsOf('SQ1-INSCLU', 0, T - 1), end);
  log('reproduction check (unaffected rule SQ1-INSCLU): trades older/newer ' + tr.filter(z => z.half === 'older').length + '/' + tr.filter(z => z.half === 'newer').length + ' vs frozen ' + fr.results.older.n + '/' + fr.results.newer.n); } }

// ================= 5. PAPER LANE (buy rules; the avoid rule lists its stocks in today.avoid) =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const scanned = new Set(lines.filter(x => x.type === 'day').map(x => x.d)), sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id));
const toScan = []; for (let t = 0; t < T; t++) if (D[t] >= START && !scanned.has(D[t])) toScan.push(t);
const newLines = [], openBy = new Map(), sigIds = new Set(sigLines.map(x => x.id)), lastT = T - 1;
for (const x of sigLines) if (!resolved.has(x.id)) openBy.set(x.m + '|' + x.sym, true);
const fromT = D.findIndex(d => d >= START);
if (fromT >= 0) { for (const id of IDS) { if (RULES[id].kind !== 'buy' || !familyOk(id)) continue; let sigs; try { sigs = signalsOf(id, fromT, lastT); } catch (e) { log('paper ' + id + ': ' + e.message); continue; }
    for (const z of sigs) { const sym = SYMS[z.i], key = id + '|' + sym; if (ONE_OPEN.has(id) && openBy.get(key)) continue;
      const late = z.k <= lastT; let entryDate = null, d = D[lastT]; if (!late) { if (z.d && z.d > d) entryDate = nextSession(z.d); else { for (let q = lastT; q < z.k; q++) d = nextSession(d); entryDate = d; } }
      const line = { type: 'signal', id: id + '|' + sym + '|' + D[z.t], m: id, sym, d: D[z.t], event: z.d || null, close: r4(C[z.i * T + z.t]), halal: halal(sym), hold: z.x - z.k + 1,
        plan: late ? 'LATE (data arrived after the rule\'s entry): buy at the next open after ' + D[lastT] + ', hold ' + (z.x - z.k + 1) + ' sessions' : 'buy at the open of ' + entryDate + ', hold ' + (z.x - z.k + 1) + ' sessions', entryDate, late, recordedAfter: D[lastT] };
      if (sigIds.has(line.id)) continue; sigIds.add(line.id); newLines.push(line); sigLines.push(line); openBy.set(key, true); } }
  for (const t of toScan) newLines.push({ type: 'day', d: D[t] }); }
const board = {}, today = {};
for (const x of sigLines) { const k = x.entryDate ? tOf.get(x.entryDate) : x.late ? firstAfter(x.recordedAfter) : undefined; if (k === undefined || k >= T) { x._state = 'waiting'; continue; } const xi = k + x.hold - 1, i = SY.get(x.sym);
  if (xi > T - 1) { x._state = 'open'; x._k = k; x._mark = ret(i, k, T - 1); continue; }
  const g = ret(i, k, xi), c = ctrlSpan(k, xi); x._state = 'closed'; x._g = g; x._c = c; x._k = k;
  if (!resolved.has(x.id) && g !== null) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[xi], g: r4(g), net: r4(capG(g) - COST), avgStock: c === null ? null : r4(c - COST) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
for (const id of IDS) { const mine = sigLines.filter(x => x.m === id), closed = mine.filter(x => x._state === 'closed' && x._g !== null).map(x => ({ d: x.d, sym: x.sym, g: x._g, c: x._c, halal: x.halal })), fr = firstRun[id], st = boardStats(closed);
  board[id] = { name: RULES[id].name, kind: RULES[id].kind, hold: H(id), family: RULES[id].family, dataOk: familyOk(id), signals: mine.length, waiting: mine.filter(x => x._state === 'waiting').length, open: mine.filter(x => x._state === 'open').length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: RULES[id].kind === 'buy' && paperReady(st),
    fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  if (RULES[id].kind !== 'buy') continue;
  today[id] = { name: RULES[id].name, hold: H(id), tier: fr ? fr.verdict : null, newSignals: mine.filter(x => x.recordedAfter === D[lastT] && newLines.includes(x) && !x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, event: x.event, plan: x.plan })),
    late: mine.filter(x => x.recordedAfter === D[lastT] && newLines.includes(x) && x.late).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, buy: D[x._k], sinceBuy: r4(x._mark ?? NaN), exitAfter: x.hold + ' sessions' })) }; }
const avoidNow = familyOk('SQ1-SIAVOID') ? liqList(lastT).filter(i => { const s = SYMS[i], a = siKnown(SI.get(s), D[lastT]), sh = sharesOf(s, D[lastT]); return a && sh > 0 && a.q / sh >= 0.15; }).map(i => SYMS[i]).sort() : [];
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, note: 'PAPER ONLY. Squad 1 (information edge) rules recording forward from 26 Oct 2026. Nothing here is a buy by itself: a rule needs a frozen 5-year verdict that meets the TRY SMALL standard (data/squad1-lab.json firstRun) or 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy. avoid = heavily shorted stocks (15%+ of shares), information only.', methods: today,
  avoid: { id: 'SQ1-SIAVOID', verdict: firstRun['SQ1-SIAVOID'] ? firstRun['SQ1-SIAVOID'].verdict : null, syms: avoidNow } }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[lastT], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: scanned ' + toScan.length + ' new session(s); ' + newLines.filter(x => x.type === 'signal').length + ' new signals; ' + sigLines.length + ' in all; avoid list ' + avoidNow.length);

// ================= 6. OUTPUT + LIBRARY =================
const out = { generatedAt: new Date().toISOString(), squad: 1, philosophy: 'information edge: official filings and data the market has not priced yet', preRegistered: 'squad1-core.mjs RULES (24 Oct 2026, before any run) + data/strategy-library.json SQ1-*',
  window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, data: STATUS, signalCounts: COUNTS,
  standard: 'both halves (signal before / from ' + SPLIT + '): > 0 after 0.8% and 1.2% cost, better than the average liquid stock over the same entry-to-exit sessions, better than the same stock on its other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= ' + TIER2_T + ' -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN. Gross returns capped at +300% for trades and yardsticks alike (AUD-1). The avoid rule is never a buy.',
  firstRun, correctedRun, latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }),
  trades: Object.fromEntries(Object.entries(RES).filter(([, r]) => r.trades).map(([k, r]) => [k, r.trades.slice(-400)])) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J('data/strategy-library.json', null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.window[1]); e.study = 'squad1-lab.mjs -> data/squad1-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], win: [R.older.win, R.newer.win], why: r.why }; ch = true; }
  for (const [id, c] of Object.entries(correctedRun)) { const e = LB && LB.strategies.find(x => x.id === id); if (!e || (e.corrected && e.corrected.at === c.at)) continue; const R = c.results;
    e.corrected = { at: c.at, bugs: c.bugs, verdict: c.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock], note: 'corrected run (survivorship fix SQ1-PIT); firstRun unchanged' }; ch = true; }
  if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad1-lab: library not updated: ' + e.message); }
console.log('SQUAD 1 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + ' | ' + Object.entries(STATUS).map(([k, s]) => k + (s.ok ? ' ok' : ' MISSING')).join(', '));
