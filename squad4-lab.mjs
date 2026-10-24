// SQUAD 4 LAB: BIG WINNERS, THEMES AND COMPOUNDERS (24 Oct 2026; 4-squad competition for the owner). Research + a FORWARD PAPER lane; never
// places an order; no Telegram. Rules: squad4-core.mjs (SQ4-*, pre-registered 24 Oct 2026 before any run; the lab writes the same rule text
// into data/strategy-library.json before computing anything) and the B-100X1 10x study spec (TENX_SPEC).
// 1. DATA (GitHub Actions only; keys only from secrets, never printed):
//    prices  = the 5-year whole-market cache of the Sunday job (study-cache/grouped.json.gz, RESTORED READ ONLY; stocks under the cache filter,
//              dead ones included, in its x rows with volume) + the sessions since (Massive grouped daily) + splits since the cache day.
//              NO pre-window history is used (Nasdaq only knows survivors): every rule needing 12 months of prices starts ~Oct 2022.
//    facts   = SEC XBRL company facts (bulk companyfacts.zip, else one request per company), point in time; own cache squad4-cache.
//    insiders + historical ticker map = SEC Form 3/4/5 data sets 2021q1.. (own cache squad4-cache/f345): officer/director holdings and every
//              ticker an issuer used (so delisted stocks get their SEC company number and fundamentals: no survivorship by mapping).
//    industry = SIC 4-digit (the cache's, data/sec-ciks.json, else the EDGAR submissions API by company; current code).
//    SPUS / HLAL daily (Massive, else Nasdaq) for return per year on capital.
// 2. PART A (B-100X1): every sustained 5x / 10x in the window, snapshots 12/6/3 months before the start, look-alikes, profile precision.
// 3. PART B: 5-YEAR ONE-SHOT of every SQ4 rule not yet frozen; first complete verdict frozen in data/squad4-lab.json firstRun
//    (results.older / results.newer as value-lab.json); later runs = monitoring only.
// 4. PAPER LANE from Monday 26 Oct 2026: data/squad4-paper.jsonl, data/squad4-today.json (methods[id] = { name, hold, newSignals: [{ sym,
//    close, halal }] }), data/squad4-board.json (READY = 30+ closed paper trades on 10+ days, average > 0 after 0.8%).
// DIAG=1: coverage and data-set headers only, nothing judged or written in data/.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { freezeEach, latestBlock } from './first-run.mjs';
import { halfStat, TIER2_T } from './value-core.mjs';
import { judgeHold } from './hold-core.mjs';
import { nextSession } from './anomaly-core.mjs';
import { RULES, IDS, planOf, INFO_PLANS, COST, STRESS, SPLIT, PAPER_START, HOLD, BLOCK, H2Y, CAP, runPlan, weighted, perYearOf, payoff, failures, fundamentals, holdingsOf, insiderOwnAt, cikFromSpans,
  growLeadOk, rule40Ok, insiderOk, rdCompOk, qualDipOk, ipoLeadOk, profileOk, themeGrowPick, sustainedFwd, artifactJumps, hasArtifact, profileKey, precision, splitFix, sharesAt, rawSharesNear,
  monthStarts, preRegister, boardStats, paperReady, dedupeByCompany, mean, median, r4, halfOf, addDays, daysBetween, TENX_SPEC, PROFILES, SUSTAIN } from './squad4-core.mjs';
const SUSTAIN_K = SUSTAIN;
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com', NQ = local(env.NASDAQ_BASE) || 'https://api.nasdaq.com', SEC = local(env.SEC_BASE) || 'https://www.sec.gov', SECD = local(env.SEC_BASE) || 'https://data.sec.gov';
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', SC = env.SQ4_CACHE || 'squad4-cache';
const OUT = env.SQ4_OUT || 'data/squad4-lab.json', TENX = env.SQ4_TENX || 'data/squad4-tenx.json', PAPER = env.SQ4_PAPER || 'data/squad4-paper.jsonl', TODAY = env.SQ4_TODAY || 'data/squad4-today.json', BOARD = env.SQ4_BOARD || 'data/squad4-board.json', LIB = env.SQ4_LIB || 'data/strategy-library.json';
const START = env.PAPER_START || PAPER_START;
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o)); }, WZ = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); fs.writeFileSync(f, zlib.gzipSync(JSON.stringify(o))); };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const ok = (x) => typeof x === 'number' && isFinite(x);
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a), BUDGET = (+env.SQ4_MINUTES || 280) * 60e3, left = () => BUDGET - (Date.now() - t0);
fs.mkdirSync(SC, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, LEAGUE = J('data/agent-league.json', {}), BAR = Math.max(TIER2_T, +LEAGUE.bar || 0, 4.0), STATUS = {};

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' SQ4 / B-100X1 entries written now'); }

// ================= 1. PRICES =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('squad4-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (OFFLINE || (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE))) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6 || DIAG || OFFLINE) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none'));
const D = Object.keys(store.days).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const CA = new Float32Array(N).fill(NaN), OA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);   // closes / opens / volume of main + x rows; MAIN = in the cache filter
let xDays = 0;
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; MAIN[k] = 1; }
  if (x.x) { xDays++; for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o[j]; VA[k] = x.x.v ? x.x.v[j] : NaN; } } });
const SIC0 = store.sic || {}; store = null;
if (!DIAG && !OFFLINE) { const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), cl = (i) => CA.subarray(i * T, i * T + T), CC = (i, t) => CA[i * T + t], OO = (i, t) => OA[i * T + t];
const lastI = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; }
const GONE = 5, vanishedI = (i) => lastI[i] >= 0 && lastI[i] < T - 1 - GONE, deadI = (i) => vanishedI(i) && CA[i * T + lastI[i]] < 3;
const serMemo = new Map(), ser = (i) => { if (!serMemo.has(i)) serMemo.set(i, { o: (k) => OA[i * T + k], c: (k) => CA[i * T + k], last: lastI[i], T }); return serMemo.get(i); };
// liquid (main rows, the system's bar): close >= 5 USD and 20-session average traded value >= 5M USD. ELIG (Part A): close >= 2 USD and
// 20-session average volume >= 200k shares (main or x rows, 15+ of the 20 sessions present).
const LIQ = new Uint8Array(N), DV20 = new Float32Array(N), ELG = new Uint8Array(N);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0, vs = 0, vn = 0;
  for (let t = 0; t < T; t++) { const m = MAIN[b + t], v = m ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; } const u = VA[b + t]; if (u >= 0 && CA[b + t] > 0) { vs += u; vn++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN; if (isFinite(w)) { s -= w; n--; } const uu = VA[k]; if (uu >= 0 && CA[k] > 0) { vs -= uu; vn--; } }
    if (t >= 19) { if (n === 20) { DV20[b + t] = s / 20; if (CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } if (vn >= 15 && CA[b + t] >= 2 && vs / vn >= 2e5) ELG[b + t] = 1; } } }
const liqMemo = new Map(), liqList = (t) => { if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const everLiq = new Uint8Array(NS); for (let i = 0; i < NS; i++) for (let t = 0; t < T; t++) if (LIQ[i * T + t]) { everLiq[i] = 1; break; }
// rolling 252-session high (90%+ present) and 200-session average (90%+ present) for every stock ever liquid
const HI = new Map(), MA = new Map();
function rollers(i) { if (HI.has(i)) return; const c = cl(i), hi = new Float32Array(T).fill(NaN), ma = new Float32Array(T).fill(NaN), dq = []; let have = 0, sum = 0, mh = 0;
  for (let t = 0; t < T; t++) { const z = c[t]; if (z > 0) { while (dq.length && c[dq[dq.length - 1]] <= z) dq.pop(); dq.push(t); have++; sum += z; mh++; }
    const out = t - 252; if (out >= 0 && c[out] > 0) have--; while (dq.length && dq[0] <= t - 252) dq.shift(); if (t >= 251 && have >= 252 * 0.9 && dq.length) hi[t] = c[dq[0]];
    const o2 = t - 200; if (o2 >= 0 && c[o2] > 0) { sum -= c[o2]; mh--; } if (t >= 199 && mh >= 180) ma[t] = sum / mh; }
  HI.set(i, hi); MA.set(i, ma); }
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks, x rows on ' + xDays + ' days)');

// ---- SPUS / HLAL (price only) ----
const NQ_HEAD = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36', Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
async function getJ(url, headers = {}) { if (OFFLINE) return null; for (let a = 0; a < 3; a++) { try { const r = await fetch(url, { headers, signal: AbortSignal.timeout(45000) }); if (r.status === 404) return null; if (r.status === 429 || r.status >= 500) { await sleep(2500 * (a + 1)); continue; } if (!r.ok) return null; return await r.json(); } catch (e) { await sleep(2000 * (a + 1)); } } return null; }
const nnum = (v) => { const x = parseFloat(String(v || '').replace(/[$,]/g, '')); return isFinite(x) && x > 0 ? x : NaN; };
async function fundBars(sym) { if (DIAG) return null; const j = await api('/v2/aggs/ticker/' + sym + '/range/1/day/2019-01-01/' + iso(Date.now()) + '?adjusted=true&sort=asc&limit=50000');
  if (j && Array.isArray(j.results) && j.results.length > 100) return j.results.map(b => ({ d: iso(b.t), o: b.o, c: b.c }));
  const q = await getJ(NQ + '/api/quote/' + sym + '/historical?assetclass=etf&fromdate=2019-01-01&todate=' + iso(Date.now()) + '&limit=9999', NQ_HEAD), rows = q && q.data && q.data.tradesTable && q.data.tradesTable.rows;
  if (!Array.isArray(rows) || rows.length < 100) return null; return rows.map(r => { const m = String(r.date || '').match(/^(\d\d)\/(\d\d)\/(\d{4})$/); return m ? { d: m[3] + '-' + m[1] + '-' + m[2], o: nnum(r.open), c: nnum(r.close) } : null; }).filter(b => b && b.c > 0).sort((a, b) => a.d < b.d ? -1 : 1); }
const FUND = {}; for (const f of ['SPUS', 'HLAL']) { const i = SY.get(f); if (i !== undefined && lastI[i] === T - 1) { const m = new Map(); for (let t = 0; t < T; t++) if (CC(i, t) > 0) m.set(D[t], { o: OO(i, t), c: CC(i, t) }); FUND[f] = m; continue; }
  const b = await fundBars(f); FUND[f] = b ? new Map(b.map(x => [x.d, x])) : null; }
STATUS.funds = { ok: !!(FUND.SPUS && FUND.HLAL), SPUS: FUND.SPUS ? FUND.SPUS.size : 0, HLAL: FUND.HLAL ? FUND.HLAL.size : 0 };
const idxRet = (kind) => (kIn, x, at) => { if (kind === 'SPY') { const a = OO(spyI, kIn), b = at === 'o' ? OO(spyI, x) : CC(spyI, x); return a > 0 && b > 0 ? b / a - 1 : null; }
  const M = FUND[kind]; if (!M) return null; const a = M.get(D[kIn]), b = M.get(D[x]); const pa = a ? (a.o > 0 ? a.o : a.c) : NaN, pb = b ? (at === 'o' ? (b.o > 0 ? b.o : b.c) : b.c) : NaN; return pa > 0 && pb > 0 ? pb / pa - 1 : null; };

// ================= 2. SEC: Form 3/4/5 data sets (insider holdings + historical ticker map) =================
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : (/^\d{4}-\d\d-\d\d/.test(String(s || '')) ? String(s).slice(0, 10) : null); };
const tsv = (zip, name) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1.9e9 }).toString(); } catch (e) { return null; } const L = txt.split(/\r?\n/), H = L[0].split('\t'); return { H, rows: L.slice(1).filter(Boolean).map(l => l.split('\t')) }; };
function download(url, file) { if (OFFLINE) return false; try { execFileSync('curl', ['-sS', '-f', '-L', '--retry', '3', '--noproxy', '127.0.0.1,localhost', '-A', UA, '-o', file, url], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 40 * 60e3 }); return fs.statSync(file).size > 200; } catch (e) { return false; } }
// one quarter -> { map: [[sym, issuerCik, firstFiled, lastFiled, filings]], hold: [[issuerCik, ownerCik, filed, shares, officerOrDirector 1/0, form]] }
function parse345(zip, q) {
  const S = tsv(zip, 'SUBMISSION.tsv'), RO = tsv(zip, 'REPORTINGOWNER.tsv'), NT = tsv(zip, 'NONDERIV_TRANS.tsv'), NH = tsv(zip, 'NONDERIV_HOLDING.tsv'); if (!S || !RO || !NT) return { err: 'missing tables' };
  const need = { S: ['ACCESSION_NUMBER', 'FILING_DATE', 'DOCUMENT_TYPE', 'ISSUERCIK', 'ISSUERTRADINGSYMBOL'], RO: ['ACCESSION_NUMBER', 'RPTOWNERCIK', 'RPTOWNER_RELATIONSHIP'], NT: ['ACCESSION_NUMBER', 'SECURITY_TITLE', 'TRANS_DATE', 'SHRS_OWND_FOLWNG_TRANS', 'DIRECT_INDIRECT_OWNERSHIP', 'NATURE_OF_OWNERSHIP'] };
  const ix = (tb, k) => tb.H.indexOf(k), miss = [...need.S.filter(k => ix(S, k) < 0), ...need.RO.filter(k => ix(RO, k) < 0), ...need.NT.filter(k => ix(NT, k) < 0)]; if (miss.length) return { err: 'columns missing: ' + miss.join(','), headers: { S: S.H, RO: RO.H, NT: NT.H } };
  const sub = new Map(), map = new Map();
  for (const r of S.rows) { const acc = r[ix(S, 'ACCESSION_NUMBER')], d = isoD(r[ix(S, 'FILING_DATE')]), form = String(r[ix(S, 'DOCUMENT_TYPE')] || ''), cik = String(+r[ix(S, 'ISSUERCIK')] || ''), sym = String(r[ix(S, 'ISSUERTRADINGSYMBOL')] || '').toUpperCase().trim().replace(/-/g, '.');
    if (!d || !cik) continue; sub.set(acc, { d, form, cik }); if (/^[A-Z][A-Z0-9.]{0,6}$/.test(sym) && sym !== 'NONE' && sym !== 'NA') { const k = sym + '|' + cik, o = map.get(k); if (!o) map.set(k, [sym, cik, d, d, 1]); else { if (d < o[2]) o[2] = d; if (d > o[3]) o[3] = d; o[4]++; } } }
  const owner = new Map(); for (const r of RO.rows) { const acc = r[ix(RO, 'ACCESSION_NUMBER')]; if (owner.has(acc)) continue; owner.set(acc, { o: String(+r[ix(RO, 'RPTOWNERCIK')] || ''), rel: /director|officer/i.test(r[ix(RO, 'RPTOWNER_RELATIONSHIP')] || '') ? 1 : 0 }); }
  const rows = new Map(), push = (acc, x) => { (rows.get(acc) || rows.set(acc, []).get(acc)).push(x); };
  NT.rows.forEach((r, n) => push(r[ix(NT, 'ACCESSION_NUMBER')], { title: r[ix(NT, 'SECURITY_TITLE')], di: r[ix(NT, 'DIRECT_INDIRECT_OWNERSHIP')], nature: r[ix(NT, 'NATURE_OF_OWNERSHIP')], sh: +r[ix(NT, 'SHRS_OWND_FOLWNG_TRANS')], date: isoD(r[ix(NT, 'TRANS_DATE')]) || '', seq: n }));
  if (NH && ix(NH, 'SHRS_OWND_FOLWNG_TRANS') >= 0) NH.rows.forEach((r, n) => push(r[ix(NH, 'ACCESSION_NUMBER')], { title: r[ix(NH, 'SECURITY_TITLE')], di: r[ix(NH, 'DIRECT_INDIRECT_OWNERSHIP')], nature: r[ix(NH, 'NATURE_OF_OWNERSHIP')], sh: +r[ix(NH, 'SHRS_OWND_FOLWNG_TRANS')], date: '', seq: -1e9 + n }));
  const hold = []; for (const [acc, rs] of rows) { const s = sub.get(acc), ow = owner.get(acc); if (!s || !ow || !ow.o) continue; const h = holdingsOf(rs); if (h === null || !(h >= 0)) continue; hold.push([s.cik, ow.o, s.d, Math.round(h), ow.rel, s.form]); }
  return { map: [...map.values()], hold };
}
const F345 = { map: new Map(), hold: new Map() }; { const qs = [], now = new Date(); for (let y = 2021; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) if (new Date(Date.UTC(y, q * 3, 1)) < now) qs.push(y + 'q' + q);
  const fail = []; let got = 0, holds = 0; const sample = {};
  for (const q of qs) { const f = SC + '/f345/' + q + '.json.gz'; let x = JZ(f, null);
    if (!x && !OFFLINE) { for (const p of ['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/']) { const zip = SC + '/f345.zip'; if (!download(SEC + p + q + '_form345.zip', zip)) continue;
        const r = parse345(zip, q); try { fs.unlinkSync(zip); } catch (e) {} if (r.err) { sample[q] = r; continue; } x = r; WZ(f, x); got++; break; } }
    if (!x) { fail.push(q); continue; }
    for (const m of x.map) { (F345.map.get(m[0]) || F345.map.set(m[0], []).get(m[0])).push([m[1], m[2], m[3], m[4]]); }
    for (const h of x.hold) { const mp = F345.hold.get(h[0]) || F345.hold.set(h[0], new Map()).get(h[0]); (mp.get(h[1]) || mp.set(h[1], []).get(h[1])).push(h); holds++; } }
  // merge the spans of a ticker+company across quarters
  for (const [s, a] of F345.map) { const by = new Map(); for (const [c, f, l, n] of a) { const o = by.get(c); if (!o) by.set(c, [c, f, l, n]); else { if (f < o[1]) o[1] = f; if (l > o[2]) o[2] = l; o[3] += n; } } F345.map.set(s, [...by.values()]); }
  const lastDone = qs.slice(0, -1); STATUS.f345 = { ok: lastDone.every(q => !fail.includes(q)), quarters: qs.length, downloadedNow: got, missing: fail, tickers: F345.map.size, issuers: F345.hold.size, holdingRows: holds, problems: Object.keys(sample).length ? sample : undefined };
  log('Form 3/4/5: ' + F345.map.size + ' tickers, ' + F345.hold.size + ' issuers, ' + holds + ' holding rows; missing ' + (fail.join(' ') || 'none')); }

// ---- ticker -> SEC company on a date: Form 3/4/5 history first, then the SEC ticker list and data/sec-ciks.json ----
const SECCIK = J('data/sec-ciks.json', {}), SH = JZ('data/shares.json.gz', { t: {}, c: {} });
const cikMemo = new Map(); function cikAt(i, d) { const s = SYMS[i], k = i + '|' + d.slice(0, 7); if (cikMemo.has(k)) return cikMemo.get(k);
  let c = cikFromSpans(F345.map.get(s) || F345.map.get(s.replace(/\./g, '-')), d); if (!c && (!vanishedI(i) || lastI[i] >= T - 260)) { const a = SH.t[s] || SH.t[s.replace(/\./g, '-')]; if (a) c = String(a); else { const y = SECCIK[s]; if (y) c = String(y[0]); } }
  cikMemo.set(k, c || null); return c || null; }

// ================= 3. SEC company facts (bulk file, else per company), compact, own cache =================
const TAGS = { rev: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], gp: ['GrossProfit'], cogs: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'],
  rd: ['ResearchAndDevelopmentExpense', 'ResearchAndDevelopmentExpenseExcludingAcquiredInProcessCost'], op: ['OperatingIncomeLoss'], cfo: ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  capex: ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets'], eq: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  debt: ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtCurrent', 'DebtCurrent'], cash: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'] };
const ALLTAGS = [...new Set(Object.values(TAGS).flat())], hasRev = (a) => !!a && TAGS.rev.some(t => a[t]);
const compact = (j) => { const out = {}, g = j && j.facts && j.facts['us-gaap']; if (!g) return out; let first = null;
  for (const v of Object.values(g)) for (const arr of Object.values((v && v.units) || {})) if (Array.isArray(arr)) for (const x of arr) if (x && x.filed && (!first || x.filed < first)) first = x.filed;
  for (const tag of ALLTAGS) { const u = g[tag] && g[tag].units && g[tag].units.USD; if (!Array.isArray(u)) continue; const rows = [], seen = new Set();
    for (const x of [...u].sort((a, b) => a.filed < b.filed ? -1 : 1)) { if (!x || !x.end || !x.filed || !isFinite(x.val) || x.end < '2017-01-01') continue; if (x.start) { const dd = (Date.parse(x.end) - Date.parse(x.start)) / 864e5 + 1; if (!((dd >= 80 && dd <= 100) || (dd >= 170 && dd <= 190) || (dd >= 260 && dd <= 285) || (dd >= 350 && dd <= 380))) continue; } const k = (x.start || '') + '|' + x.end + '|' + x.val; if (seen.has(k)) continue; seen.add(k); rows.push([x.start || '', x.end, x.val, x.filed]); }
    if (rows.length) out[tag] = rows; }
  const dei = j.facts.dei && j.facts.dei.EntityCommonStockSharesOutstanding && j.facts.dei.EntityCommonStockSharesOutstanding.units && j.facts.dei.EntityCommonStockSharesOutstanding.units.shares;
  if (Array.isArray(dei)) { const m = new Map(); for (const x of dei) if (x && x.end && isFinite(x.val) && x.val > 0 && x.end >= '2015-01-01') m.set(x.end, (m.get(x.end) || 0) < x.val ? x.val : m.get(x.end)); out._sh = [...m.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1); }
  out._first = first; return out; };
// sharded on disk (one JSON string per shard stays far under V8's string limit)
const NSH = 16, shardOf = (c) => +c % NSH, FX = { at: null, c: {} }; { const meta = J(SC + '/facts-meta.json', {}); FX.at = meta.at || null; for (let k = 0; k < NSH; k++) Object.assign(FX.c, JZ(SC + '/facts-' + k + '.json.gz', {}));
  if (!Object.keys(FX.c).length) { const old = JZ(SC + '/facts.json.gz', null); if (old) { FX.at = old.at; FX.c = old.c; } } }
const saveFX = () => { const parts = Array.from({ length: NSH }, () => ({})); for (const [c, v] of Object.entries(FX.c)) parts[shardOf(c)][c] = v; parts.forEach((o, k) => WZ(SC + '/facts-' + k + '.json.gz', o)); W(SC + '/facts-meta.json', { at: FX.at }); try { fs.unlinkSync(SC + '/facts.json.gz'); } catch (e) {} };
const NEED = new Set(); { const ms0 = monthStarts(D); for (const t of ms0) for (let i = 0; i < NS; i++) if (ELG[i * T + t] || LIQ[i * T + t]) { const c = cikAt(i, D[t]); if (c) NEED.add(c); } }
{ const stale = !FX.at || Date.now() - Date.parse(FX.at) > 6 * 864e5, todo = [...NEED].filter(c => stale || !(c in FX.c)); let got = 0, fail = 0, mode = 'cache';
  if (todo.length && !OFFLINE) { const zip = SC + '/companyfacts.zip'; let zipOk = false;
    if (todo.length > 300 && !local(env.SEC_BASE)) { zipOk = download(SEC + '/Archives/edgar/daily-index/xbrl/companyfacts.zip', zip) && fs.statSync(zip).size > 1e8; }
    if (zipOk) { mode = 'bulk'; const tmp = SC + '/cf-tmp'; for (let a = 0; a < todo.length; a += 400) { const part = todo.slice(a, a + 400), names = part.map(c => 'CIK' + c.padStart(10, '0') + '.json'); fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });
        try { execFileSync('unzip', ['-o', '-qq', zip, ...names, '-d', tmp], { stdio: 'ignore', maxBuffer: 1e8 }); } catch (e) {}   // exit 11 = some names absent: the rest is extracted
        for (const c of part) { const f = tmp + '/CIK' + c.padStart(10, '0') + '.json'; let j = null; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {} FX.c[c] = j ? compact(j) : {}; if (j) got++; } }
      fs.rmSync(tmp, { recursive: true, force: true }); try { fs.unlinkSync(zip); } catch (e) {} }
    else { mode = 'api'; for (const c of todo) { if (left() < 150 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null; try { r = await fetch(SECD + '/api/xbrl/companyfacts/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); } catch (e) {}
        if (r && r.ok) { const j = await r.json().catch(() => null); if (j) { FX.c[c] = compact(j); got++; } } else if (r && r.status === 404) FX.c[c] = {}; else fail++; } }
    FX.at = new Date().toISOString(); saveFX(); }
  const cov = [...NEED].filter(c => hasRev(FX.c[c])).length;
  STATUS.facts = { ok: NEED.size > 0 && [...NEED].filter(c => c in FX.c).length >= NEED.size * 0.95 && cov >= NEED.size * 0.5, companies: NEED.size, answered: [...NEED].filter(c => c in FX.c).length, withRevenue: cov, fetchedNow: got, failed: fail, mode, at: FX.at };
  log('SEC facts: ' + JSON.stringify(STATUS.facts)); }
const coMemo = new Map(); const coOf = (cik) => { if (!cik) return null; if (coMemo.has(cik)) return coMemo.get(cik); const a = FX.c[cik]; let o = null;
  if (hasRev(a)) { o = {}; for (const [g, tags] of Object.entries(TAGS)) { o[g] = {}; for (const t of tags) if (a[t]) o[g][t] = a[t].map(([s0, e, v, f]) => ({ s: s0, e, v, f })); } } coMemo.set(cik, o); return o; };
const fMemo = new Map(), fundAt = (cik, d) => { if (!cik) return null; const k = cik + '|' + d; if (!fMemo.has(k)) { const co = coOf(cik); fMemo.set(k, co ? fundamentals(co, d) : null); } return fMemo.get(k); };
// share counts: data/shares.json.gz (split jumps repaired), else the as-reported cover-page count of the facts (repaired the same way)
const shMemo = new Map(), shRows = (cik) => { if (!shMemo.has(cik)) { const a = SH.c[cik] && SH.c[cik].length ? SH.c[cik] : (FX.c[cik] && FX.c[cik]._sh) || null; shMemo.set(cik, a && a.length ? splitFix(a) : null); } return shMemo.get(cik); };
// insider (officer + director) ownership: each filing's shares over the as-reported shares outstanding near that filing
const ownMemo = new Map(); function ownersOf(cik) { if (ownMemo.has(cik)) return ownMemo.get(cik); const H = F345.hold.get(cik); let out = null;
  if (H) { const raw = (FX.c[cik] && FX.c[cik]._sh) || SH.c[cik] || []; out = new Map(); for (const [o, rows] of H) { const recs = []; for (const h of rows.sort((a, b) => a[2] < b[2] ? -1 : 1)) { const so = rawSharesNear(raw, h[2], 200); if (so > 0) recs.push([h[2], h[3] / so, !!h[4]]); } if (recs.length) out.set(o, recs); } }
  ownMemo.set(cik, out); return out; }
const insAt = (cik, d) => { const o = ownersOf(cik); return o ? insiderOwnAt(o, d) : null; };

// ---- industry (SIC 4-digit): the cache's, data/sec-ciks.json, else the EDGAR submissions API (own cache) ----
const SICC = J(SC + '/sic.json', {}); let sicFetched = 0;
const sicOfSym = (s) => { const x = SIC0[s]; if (x && x.c) return String(x.c).padStart(4, '0'); const y = SECCIK[s]; return y && y[1] ? String(y[1]).padStart(4, '0') : null; };
{ const want = new Set(); for (const t of monthStarts(D)) for (const i of liqList(t)) { if (sicOfSym(SYMS[i])) continue; const c = cikAt(i, D[t]); if (c && !(c in SICC)) want.add(c); }
  if (!OFFLINE) for (const c of want) { if (left() < 160 * 60e3) break; await sleep(local(env.SEC_BASE) ? 0 : 110); let r = null; try { r = await fetch(SECD + '/submissions/CIK' + c.padStart(10, '0') + '.json', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }); } catch (e) {}
    if (r && r.ok) { const j = await r.json().catch(() => null); SICC[c] = j && j.sic ? String(j.sic).padStart(4, '0') : ''; sicFetched++; } else if (r && r.status === 404) SICC[c] = ''; }
  if (sicFetched) W(SC + '/sic.json', SICC); STATUS.sic = { askedNow: sicFetched, wanted: want.size }; }
const sicAt = (i, cik) => sicOfSym(SYMS[i]) || (cik && SICC[cik]) || null;
const HAL = J('data/halal.json', {}), ZBAD = new Set(J('data/zad-list.json', {}).notHalal || []), halal = (s) => ZBAD.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';

// ================= 4. UNIVERSES =================
const MS = monthStarts(D), MSET = new Set(MS);
// the rule universe at a session: liquid, SEC company known, one ticker per company; features attached lazily
const uniMemo = new Map();
function universe(t) { if (uniMemo.has(t)) return uniMemo.get(t); const rows = []; let noCik = 0, noCikGone = 0;
  for (const i of liqList(t)) { const cik = cikAt(i, D[t]); if (!cik) { noCik++; if (vanishedI(i)) noCikGone++; continue; } rollers(i); const c = CC(i, t), hi = HI.get(i)[t], ma = MA.get(i)[t], c12 = CC(i, t - 252);
    const sh = sharesAt(shRows(cik), D[t]); rows.push({ key: i, i, cik, dv: DV20[i * T + t], close: c, off52: hi > 0 ? c / hi : null, ret12: t >= 252 && c12 > 0 ? c / c12 - 1 : null, above200: ma > 0 ? c > ma : null, cap: sh ? c * sh : null }); }
  const u = dedupeByCompany(rows), r12 = u.filter(r => ok(r.ret12)).sort((a, b) => b.ret12 - a.ret12); r12.forEach((r, k) => { r.rsPct = (k + 1) / r12.length; });
  const out = { rows: u, noCik, noCikGone, liquid: liqList(t).length }; uniMemo.set(t, out); return out; }
const featOf = (r, t) => { if (!r.f) r.f = fundAt(r.cik, D[t]); return r.f; };

// ================= 5. SIGNALS (shared by the 5-year test and the paper lane) =================
const themeLog = [];
function monthlySignals(t) { const out = Object.fromEntries(IDS.map(id => [id, []])); const U = universe(t), d = D[t];
  for (const r of U.rows) { const f = featOf(r, t); if (!f || !ok(f.revG)) continue; const info = { revG: f.revG, off52: r.off52, capB: r.cap ? r.cap / 1e9 : null };
    if (growLeadOk(f, r.off52)) out['SQ4-GROWLEAD'].push({ i: r.i, info: { ...info, g0: f.g0, g1: f.g1, gm: f.gm, gmPrev: f.gmPrev } });
    const sic = sicAt(r.i, r.cik); if (rule40Ok(f, sic)) out['SQ4-RULE40'].push({ i: r.i, info: { ...info, sic, fcfM: f.fcfM } });
    if (f.revG >= 0.20 && r.above200 === true) { const own = insAt(r.cik, d); if (insiderOk(f, own, r.above200)) out['SQ4-INSIDER'].push({ i: r.i, info: { ...info, insiderOwn: own } }); }
    if (rdCompOk(f)) out['SQ4-RDCOMP'].push({ i: r.i, info: { ...info, rdInt: f.rdInt, opM: f.opM, opMPrev: f.opMPrev } });
    const ff = FX.c[r.cik] && FX.c[r.cik]._first; if (ipoLeadOk(f, ff, d, r.off52)) out['SQ4-IPOLEAD'].push({ i: r.i, info: { ...info, firstFiled: ff, rev2y: f.rev2y, rev: f.rev } });
    if (profileOk(f, r.cap, r.rsPct, r.off52)) out['SQ4-PROFILE'].push({ i: r.i, info: { ...info, gm: f.gm, rsPct: r.rsPct } }); }
  // theme: SIC 4-digit industries of the universe
  const by = new Map(); for (const r of U.rows) { const s = sicAt(r.i, r.cik); if (!s) continue; (by.get(s) || by.set(s, []).get(s)).push(r); }
  const inds = [...by.entries()].map(([ind, a]) => ({ ind, n: a.length, nRet: a.filter(r => ok(r.ret12)).length, ret12: median(a.map(r => r.ret12)), members: a.map(r => ({ key: r.i, revG: (featOf(r, t) || {}).revG ?? null })) }));
  const pick = themeGrowPick(inds); if (pick) { for (const i of pick.picks) { const r = U.rows.find(z => z.i === i); out['SQ4-THEMEGROW'].push({ i, info: { ind: pick.ind, indRet12: pick.ret12, revG: r.f.revG, capB: r.cap ? r.cap / 1e9 : null } }); }
    if (!themeLog.some(x => x.d === d)) themeLog.push({ d, ind: pick.ind, ret12: r4(pick.ret12), picks: pick.picks.map(i => SYMS[i]) }); }
  return out; }
// QUALDIP (daily): price first (cheap), then fundamentals for the few crossings
function dipSignals(t) { const out = []; if (t < 263) return out; const cand = [];
  for (const i of liqList(t)) { rollers(i); const hi = HI.get(i), ma = MA.get(i), c = CC(i, t), cp = CC(i, t - 1); if (!(hi[t] > 0) || !(hi[t - 1] > 0) || !(c <= hi[t] * 0.8 * (1 + 1e-9)) || !(cp > hi[t - 1] * 0.8)) continue;
    if (!(ma[t] > ma[t - 63])) continue; const cik = cikAt(i, D[t]); if (!cik) continue; cand.push({ key: i, i, cik, dv: DV20[i * T + t], c, cp, hi, ma }); }
  for (const r of dedupeByCompany(cand)) { const f = fundAt(r.cik, D[t]), i = r.i, sh = sharesAt(shRows(r.cik), D[t]);
    if (qualDipOk(f, { close: r.c, prevClose: r.cp, hi: r.hi[t], prevHi: r.hi[t - 1], maNow: r.ma[t], maThen: r.ma[t - 63] })) out.push({ i, info: { roic: f.roic, de: f.de, revG: f.revG, off52: r.c / r.hi[t], capB: sh ? r.c * sh / 1e9 : null } }); }
  return out; }
function signalsAt(t, { monthly = MSET.has(t) } = {}) { const s = monthly && t >= 252 ? monthlySignals(t) : Object.fromEntries(IDS.map(id => [id, []])); s['SQ4-QUALDIP'] = dipSignals(t); return s; }

const DIAGS = { window: [D[0], D[T - 1]], sessions: T, stocks: NS, data: STATUS };
{ const t = MS[MS.length - 1], U = universe(t); let withF = 0; for (const r of U.rows.slice(0, 400)) if (featOf(r, t) && ok(r.f.revG)) withF++;
  DIAGS.lastMonthStart = { date: D[t], liquid: U.liquid, companies: U.rows.length, noCik: U.noCik, withRevenueGrowthOfFirst400: withF };
  // survivorship check: the share of liquid month-start rows of stocks that later VANISHED that got an SEC company number
  let g = 0, gc = 0, a = 0, ac = 0; for (const tt of MS) for (const i of liqList(tt)) { const c = cikAt(i, D[tt]); if (vanishedI(i)) { g++; if (c) gc++; } else { a++; if (c) ac++; } }
  STATUS.cikCover = { ok: g === 0 || gc / g >= 0.75, vanished: g, vanishedWithCik: gc, alive: a, aliveWithCik: ac, vanishedShare: r4(g ? gc / g : null), aliveShare: r4(a ? ac / a : null) }; }
if (DIAG) { console.log('SQUAD 4 DIAGNOSTICS (coverage only, nothing judged or written)'); console.log(JSON.stringify(DIAGS, null, 1).slice(0, 20000)); process.exit(0); }

// ================= 6. YARDSTICKS =================
// artifacts (unadjusted splits) per stock: a path containing one is left out on BOTH sides
const ART = new Map(), artOf = (i) => { if (!ART.has(i)) ART.set(i, artifactJumps(cl(i))); return ART.get(i); };
// the average liquid stock bought at the open of session te (liquid the session before) and held: curve by offset (every second stock; a dead
// stock counts 0 after it vanished; raw = uncapped, cap = each stock capped at +300%)
const curveMemo = new Map();
function curve(te, len) { const m = curveMemo.get(te); if (m && m.raw.length >= Math.min(len, T - te)) return m; const L = Math.min(len, T - te), sR = new Float64Array(L), sC = new Float64Array(L), cnt = new Uint32Array(L), lq = liqList(te - 1);
  for (let q = 0; q < lq.length; q += 2) { const i = lq[q], e = OO(i, te); if (!(e > 0)) continue; if (hasArtifact(artOf(i), te - 1, te + L - 1)) continue; const li = lastI[i], van = vanishedI(i), dead = deadI(i); let lc = NaN;
    for (let off = 0; off < L; off++) { const k = te + off; let v; if (van && k > li) v = dead ? 0 : CC(i, li); else { const z = CC(i, k); if (z > 0) lc = z; v = lc; } if (!(v >= 0)) continue; sR[off] += v / e; sC[off] += Math.min(v / e, 1 + CAP); cnt[off]++; } }
  const raw = new Float32Array(L), cap = new Float32Array(L); for (let off = 0; off < L; off++) { raw[off] = cnt[off] >= 50 ? sR[off] / cnt[off] - 1 : NaN; cap[off] = cnt[off] >= 50 ? sC[off] / cnt[off] - 1 : NaN; } const o = { raw, cap }; curveMemo.set(te, o); return o; }
const ctrlRet = (kind) => (kIn, x, at) => { const cv = curve(kIn, HOLD + 1)[kind], off = (at === 'o' ? x - 1 : x) - kIn; const v = off >= 0 && off < cv.length ? cv[off] : NaN; return isFinite(v) ? v : null; };
// the same stock with the same plan on its other days (every 21st session, starts 63+ sessions away from this entry)
const ownL = new Map(), ownList = (i, id) => { const k0 = i + '|' + RULES[id].plan; if (!ownL.has(k0)) { const a = []; for (let k = 1; k + HOLD <= T; k += 21) { const r = runPlan(ser(i), k, planOf(id)); if (r && !hasArtifact(artOf(i), k - 1, r.x)) a.push({ k, g: r.g }); } ownL.set(k0, a); } return ownL.get(k0); };
const ownOf = (i, te, id, cap = false) => { const a = ownList(i, id).filter(z => Math.abs(z.k - te) >= 63).map(z => cap ? Math.min(z.g, CAP) : z.g); return a.length ? mean(a) : null; };
const exitPx = (i, r) => r.kind === 'dead' ? 0 : r.at === 'o' ? OO(i, r.x) : CC(i, r.x);
function evalSignal(id, i, t, info) { const te = t + 1; if (te >= T) return { censored: true }; const r = runPlan(ser(i), te, planOf(id)); if (!r) return { censored: true };
  if (hasArtifact(artOf(i), te - 1, r.x)) return { artifact: true };
  const plans = Object.fromEntries(Object.entries(INFO_PLANS).map(([k, p]) => { const z = runPlan(ser(i), te, p); return [k, z && !hasArtifact(artOf(i), te - 1, z.x) ? { g: z.g, w: z.w, unitYears: z.unitYears, kind: z.kind } : null]; }));
  return { t, s: SYMS[i], i, half: halfOf(D[t]), sig: D[t], buy: D[te], sell: D[r.x], kind: r.kind, g: r.g, w: r.w, n: r.units.length, unitYears: r.unitYears, worst: r.worst, best: r.best, days: r.days, endVsFirst: exitPx(i, r) / r.units[0].px - 1,
    c: weighted(r.units, r.x, r.at, ctrlRet('raw')) ?? NaN, cCap: weighted(r.units, r.x, r.at, ctrlRet('cap')) ?? NaN, own: ownOf(i, te, id), ownCap: ownOf(i, te, id, true),
    spy: weighted(r.units, r.x, r.at, idxRet('SPY')), spus: weighted(r.units, r.x, r.at, idxRet('SPUS')), hlal: weighted(r.units, r.x, r.at, idxRet('HLAL')), plans, info }; }

// ================= 7. PART B: 5-YEAR ONE-SHOT =================
const need = IDS.filter(id => !(id in FROZEN)), LIGHT = env.SQ4_LIGHT === '1' && !!PREV.tenX && Object.keys(FROZEN).length > 0;   // weekday evenings after the first full run: paper lane only (rules still pending wait for Sunday)
const SIGS = Object.fromEntries(IDS.map(id => [id, []])), CENS = Object.fromEntries(IDS.map(id => [id, 0])), ARTN = Object.fromEntries(IDS.map(id => [id, 0])), RAW = Object.fromEntries(IDS.map(id => [id, 0]));
if (!LIGHT) { const openUntil = Object.fromEntries(IDS.map(id => [id, new Map()]));
  const take = (id, list, t) => { for (const z of list) { const ou = openUntil[id].get(z.i); if (ou !== undefined && t <= ou) continue; RAW[id]++; const e = evalSignal(id, z.i, t, z.info);
      if (e.censored) { CENS[id]++; openUntil[id].set(z.i, T); continue; } if (e.artifact) { ARTN[id]++; continue; } SIGS[id].push(e); openUntil[id].set(z.i, tOf.get(e.sell)); } };
  for (let t = 252; t < T - 1; t++) { if (left() < 70 * 60e3) { log('time budget: the scan stopped at ' + D[t]); STATUS.scan = { ok: false, stoppedAt: D[t] }; break; }
    const s = signalsAt(t); for (const id of IDS) if (s[id].length) take(id, s[id], t); if (MSET.has(t) && t % 63 < 21) log('scan ' + D[t] + ': ' + IDS.map(id => id.slice(4) + ' ' + SIGS[id].length).join(', ')); }
  if (!STATUS.scan) STATUS.scan = { ok: true };
  log('signals: ' + IDS.map(id => id + ' ' + SIGS[id].length + (CENS[id] ? ' (+' + CENS[id] + ' too recent)' : '') + (ARTN[id] ? ' (' + ARTN[id] + ' split artifacts left out)' : '')).join(', ')); }
const benchPY = (rows, key) => { const v = rows.filter(z => ok(z[key])); const y = v.reduce((a, z) => a + z.unitYears, 0); return v.length && y > 0 ? r4(v.reduce((a, z) => a + z[key] * z.w, 0) / y) : null; };
const RES = {};
for (const id of LIGHT ? [] : IDS) { const tr = SIGS[id], by = { older: tr.filter(z => z.half === 'older'), newer: tr.filter(z => z.half === 'newer') };
  const R = { older: halfStat(by.older, BLOCK), newer: halfStat(by.newer, BLOCK), all: halfStat(tr, BLOCK) };
  const py = (a) => ({ rule: r4(perYearOf(a)), spy: benchPY(a, 'spy'), spus: benchPY(a, 'spus'), hlal: benchPY(a, 'hlal'), avgStock: benchPY(a, 'c') });
  const PY = { older: py(by.older), newer: py(by.newer), all: py(tr) };
  const v = judgeHold(R, { bar: BAR, ownName: 'the same stocks with the same plan on their other days', perYear: { older: [PY.older.rule, PY.older.spy], newer: [PY.newer.rule, PY.newer.spy] } });
  // sensitivity (not the verdict): every return capped at +300% on both sides
  const capd = (a) => a.map(z => ({ ...z, g: Math.min(z.g, CAP), c: z.cCap, own: z.ownCap }));
  const RC = { older: halfStat(capd(by.older), BLOCK), newer: halfStat(capd(by.newer), BLOCK) }, vc = judgeHold(RC, { bar: BAR, perYear: { older: [r4(perYearOf(capd(by.older))), PY.older.spy], newer: [r4(perYearOf(capd(by.newer))), PY.newer.spy] } });
  const plans = Object.fromEntries(['REGISTERED', ...Object.keys(INFO_PLANS)].map(k => { const f = (a) => { const vv = k === 'REGISTERED' ? a : a.map(z => z.plans[k] ? { ...z.plans[k] } : null).filter(Boolean);
      return { n: vv.length, avg: r4(mean(vv.map(z => z.g - COST))), median: r4(median(vv.map(z => z.g - COST))), perYear: r4(perYearOf(vv)) }; }; return [k, { older: f(by.older), newer: f(by.newer), all: f(tr) }]; }));
  const worst = [...tr].sort((a, b) => a.g - b.g).slice(0, 10).map(z => ({ s: z.s, sig: z.sig, sell: z.sell, kind: z.kind, net: r4(z.g - COST), worstOnTheWay: r4(z.worst) }));
  const best = [...tr].sort((a, b) => b.g - a.g).slice(0, 10).map(z => ({ s: z.s, sig: z.sig, sell: z.sell, kind: z.kind, net: r4(z.g - COST), bestOnTheWay: r4(z.best) }));
  RES[id] = { ...v, name: RULES[id].name, plan: RULES[id].plan, hold: HOLD, cost: COST, split: SPLIT, results: R, perYear: PY, sensitivityCap300: { verdict: vc.verdict, why: vc.why, older: { avg: RC.older.avg, edge: RC.older.edge, tBlock: RC.older.tBlock }, newer: { avg: RC.newer.avg, edge: RC.newer.edge, tBlock: RC.newer.tBlock } },
    plans, payoff: { older: payoff(by.older), newer: payoff(by.newer), all: payoff(tr) }, failures: { older: failures(by.older), newer: failures(by.newer), all: failures(tr) }, worst, best,
    signals: tr.length, tooRecent: CENS[id], splitArtifactsLeftOut: ARTN[id], stocks: new Set(tr.map(z => z.s)).size,
    byYear: Object.fromEntries([...new Set(tr.map(z => z.sig.slice(0, 4)))].sort().map(y => { const a = tr.filter(z => z.sig.startsWith(y)); return [y, { n: a.length, avg: r4(mean(a.map(z => z.g - COST))), avgStock: r4(mean(a.filter(z => ok(z.c)).map(z => z.c - COST))) }]; })),
    trades: tr.map(z => ({ s: z.s, sig: z.sig, buy: z.buy, sell: z.sell, kind: z.kind, units: z.n, net: r4(z.g - COST), avgStock: r4(ok(z.c) ? z.c - COST : null), sameStock: r4(z.own === null ? null : z.own - COST), spy: r4(z.spy), worst: r4(z.worst), best: r4(z.best), info: Object.fromEntries(Object.entries(z.info || {}).map(([k, x]) => [k, typeof x === 'number' ? r4(x) : x])) })) };
  const f = (h) => (h.n || 0) + ' (' + (h.days || 0) + 'd, ' + (h.blocks || 0) + 'bl) avg ' + pc(h.avg) + ' stress ' + pc(h.avgStress) + ' edge ' + pc(h.edge) + ' own ' + pc(h.vsOwn) + ' no2 ' + pc(h.noTop2) + ' tB ' + h.tBlock;
  log('- ' + id + ': ' + RES[id].verdict + ' | older ' + f(R.older) + ' /yr ' + pc(PY.older.rule) + ' SPY ' + pc(PY.older.spy) + ' | newer ' + f(R.newer) + ' /yr ' + pc(PY.newer.rule) + ' SPY ' + pc(PY.newer.spy) + ' | cap300: ' + vc.verdict + ' | ' + RES[id].why.slice(0, 300)); }

// ================= 8. PART A: THE 10x STUDY (B-100X1) =================
let TENXOUT = LIGHT ? (J(TENX, null) || PREV.tenX) : null;
if (!LIGHT) { const tA = Date.now();
  // eligible panel at a month start: one row per company (or per ticker without a company number); features for look-alikes and precision
  const panMemo = new Map();
  function panel(t) { if (panMemo.has(t)) return panMemo.get(t); const rows = [];
    for (let i = 0; i < NS; i++) { if (i === spyI || !ELG[i * T + t]) continue; const cik = cikAt(i, D[t]), c = CC(i, t), c12 = t >= 252 ? CC(i, t - 252) : NaN; let hi = null; if (t >= 251) { let m = 0, h = 0; for (let k = t - 251; k <= t; k++) { const z = CC(i, k); if (z > 0) { h++; if (z > m) m = z; } } if (h >= 227) hi = m; }
      const sh = cik ? sharesAt(shRows(cik), D[t]) : null; rows.push({ i, key: i, cik, dv: c * (VA[i * T + t] || 0), close: c, off52: hi ? c / hi : null, ret12: c12 > 0 ? c / c12 - 1 : null, cap: sh ? c * sh : null }); }
    const u = dedupeByCompany(rows), r12 = u.filter(r => ok(r.ret12)).sort((a, b) => b.ret12 - a.ret12); r12.forEach((r, k) => { r.rsPct = (k + 1) / r12.length; }); panMemo.set(t, u); return u; }
  const featRow = (r, t) => { if (r.x) return r.x; const f = r.cik ? fundAt(r.cik, D[t]) : null, d = D[t], ff = r.cik && FX.c[r.cik] ? FX.c[r.cik]._first : null, shr = r.cik ? shRows(r.cik) : null;
    const s0 = shr ? sharesAt(shr, d) : null, s1 = shr ? sharesAt(shr, addDays(d, -365)) : null;
    r.x = { revG: f ? f.revG : null, accel: f ? f.accel : null, gm: f ? f.gm : null, gmUp: f ? f.gmUp : null, rdInt: f ? f.rdInt : null, opUp: f ? f.opUp : null, fcfM: f ? f.fcfM : null, roic: f ? f.roic : null, de: f ? f.de : null,
      rev: f ? f.rev : null, rev2y: f ? f.rev2y : null, cap: r.cap, rsPct: r.rsPct ?? null, off52: r.off52, ret12: r.ret12, own: r.cik ? insAt(r.cik, d) : null, ipoYears: ff ? daysBetween(ff, d) / 365.25 : null, sharesYoY: s0 && s1 ? s0 / s1 - 1 : null, sic: sicAt(r.i, r.cik) };
    return r.x; };
  // per stock: the forward sustained level (20 sessions), with split artifacts as walls (a window or a path may not cross one)
  const M20 = new Map(); const m20Of = (i) => { if (M20.has(i)) return M20.get(i); const c = cl(i), m = sustainedFwd(c), aj = artOf(i); for (const a of aj) for (let k = Math.max(0, a - 19); k <= a; k++) if (k < a) m[k] = NaN; M20.set(i, m); return m; };
  const wall = (i, a, b) => hasArtifact(artOf(i), a, b);
  // suffix max of the sustained level per stock, reset at artifact walls (lazy, cached)
  const SMM = new Map(); const smOf = (i) => { if (SMM.has(i)) return SMM.get(i); const m = m20Of(i), walls = new Set(artOf(i)), SM = new Float64Array(T + 1).fill(NaN);
    for (let k = T - 1; k >= 0; k--) { const nx = walls.has(k + 1) ? NaN : SM[k + 1], v = m[k]; SM[k] = v > 0 ? (nx > v ? nx : v) : nx; } SMM.set(i, SM); return SM; };
  // best sustained multiple of close[f] within H sessions (no artifact between f and the level's window)
  function multFrom(i, f, H = Infinity) { const c = cl(i), m = m20Of(i), e = c[f]; if (!(e > 0)) return null; if (H === Infinity) { if (artOf(i).includes(f + 1)) return null; const v = smOf(i)[f + 1]; return v > 0 ? v / e : null; } let best = NaN, last = Math.min(T - 1, f + H); for (const a of artOf(i)) if (a > f) { last = Math.min(last, a - 1); break; } for (let k = f + 1; k <= last; k++) { const v = m[k]; if (v > 0 && !(v / e <= best)) best = v / e; } return isFinite(best) ? best : null; }
  // ---- A1. every sustained 5x / 10x of the window (one entry per stock: its best start) ----
  const WIN = [];
  for (let i = 0; i < NS; i++) { if (i === spyI) continue; const c = cl(i), m = m20Of(i), aj = artOf(i); let any = false; for (let t = 0; t < T; t++) if (ELG[i * T + t]) { any = true; break; } if (!any) continue;
    const SM = smOf(i), walls = new Set(aj);
    let best = 0, t0 = -1; for (let t = 0; t < T - SUSTAIN_K; t++) { if (!ELG[i * T + t]) continue; if (walls.has(t + 1)) continue; const v = SM[t + 1]; if (v > 0 && v / c[t] > best * (1 + 1e-9)) { best = v / c[t]; t0 = t; } }
    if (best < 5) continue; const e = c[t0], first = (mult) => { for (let k = t0 + 1; k < T; k++) { if (walls.has(k)) break; if (m[k] >= e * mult * (1 - 1e-9)) return k; } return -1; };
    let peak = 0, pk = t0; for (let k = t0; k < T; k++) { if (walls.has(k) && k > t0) break; if (c[k] > peak) { peak = c[k]; pk = k; } }
    const cik = cikAt(i, D[t0]), sh = cik ? sharesAt(shRows(cik), D[t0]) : null, k5 = first(5), k10 = first(10);
    WIN.push({ i, sym: SYMS[i], cik, sic: sicAt(i, cik), start: D[t0], t0, startClose: r4(e), startCapM: sh ? r4(e * sh / 1e6) : null, liquidAtStart: !!LIQ[i * T + t0], best: r4(best), x5: D[k5] || null, sessionsTo5x: k5 > 0 ? k5 - t0 : null, x10: k10 > 0 ? D[k10] : null, sessionsTo10x: k10 > 0 ? k10 - t0 : null,
      peak: r4(peak / e), peakDate: D[pk], latest: vanishedI(i) ? (deadI(i) ? 'dead' : 'gone') : r4(c[lastI[i]] / e), lastDate: D[lastI[i]], fromPeakToLast: r4(c[lastI[i]] / peak - 1) }); }
  WIN.sort((a, b) => b.best - a.best); log('10x study: ' + WIN.length + ' stocks with a sustained 5x+, ' + WIN.filter(w => w.best >= 10).length + ' with 10x+ (' + ((Date.now() - tA) / 1000).toFixed(0) + 's)');
  // ---- A2. snapshots 12 / 6 / 3 months before the start and at the start (the month start on or before each date) ----
  const msBefore = (t) => { let b = -1; for (const m of MS) { if (m <= t) b = m; else break; } return b; };
  const OFFS = [['m12', 252], ['m6', 126], ['m3', 63], ['start', 0]];
  for (const w of WIN) { w.snap = {}; for (const [nm, off] of OFFS) { const f = msBefore(w.t0 - off); if (f < 0) { w.snap[nm] = null; continue; } const P = panel(f), r = P.find(z => z.i === w.i) || (w.cik ? P.find(z => z.cik === w.cik) : null);
      if (!r) { w.snap[nm] = { d: D[f], inPanel: false, close: r4(CC(w.i, f)) }; continue; } const x = featRow(r, f); w.snap[nm] = { d: D[f], inPanel: true, key: profileKey(x), ...Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'number' ? r4(v) : v])) }; } }
  // ---- A3. what the winners looked like vs every eligible stock on the same month starts ----
  const FLAGS = { 'revenue +30%+': (x) => x.revG >= 0.3, 'revenue +100%+': (x) => x.revG >= 1, 'revenue falling': (x) => x.revG < 0, 'growth accelerating': (x) => x.accel === true, 'gross margin rising': (x) => x.gmUp === true, 'gross margin 40%+': (x) => x.gm >= 0.4,
    'R&D 10%+ of revenue': (x) => x.rdInt >= 0.1, 'operating margin rising': (x) => x.opUp === true, 'market cap under 300M': (x) => x.cap > 0 && x.cap < 3e8, 'market cap 0.3-2B': (x) => x.cap >= 3e8 && x.cap < 2e9, 'market cap 10B+': (x) => x.cap >= 1e10,
    '12-month return top 20%': (x) => ok(x.rsPct) && x.rsPct <= 0.2, 'within 5% of 52-week high': (x) => x.off52 >= 0.95, '40%+ under 52-week high': (x) => ok(x.off52) && x.off52 <= 0.6, 'officers/directors own 10%+': (x) => x.own >= 0.1, 'share count +10%+ in a year': (x) => x.sharesYoY >= 0.1,
    'listed 2-5 years (first XBRL filing)': (x) => x.ipoYears >= 2 && x.ipoYears <= 5, 'no revenue data': (x) => !ok(x.revG) };
  const looked = {};
  for (const [nm] of OFFS) { const ws = WIN.filter(w => w.snap[nm] && w.snap[nm].inPanel); if (!ws.length) { looked[nm] = { winners: 0 }; continue; } const byF = new Map(); for (const w of ws) (byF.get(w.snap[nm].d) || byF.set(w.snap[nm].d, []).get(w.snap[nm].d)).push(w);
    const out = { winners: ws.length, months: byF.size, flags: {}, medians: {} };
    for (const [fl, fn] of Object.entries(FLAGS)) { let wy = 0, base = 0; for (const [d, a] of byF) { const t = tOf.get(d), P = panel(t); let n = 0, y = 0; for (const r of P) { const x = featRow(r, t); n++; if (fn(x)) y++; } base += a.length * (n ? y / n : 0); for (const w of a) if (fn(w.snap[nm])) wy++; }
      out.flags[fl] = { winners: r4(wy / ws.length), allStocks: r4(base / ws.length), lift: base > 0 ? r4(wy / base) : null }; }
    for (const k of ['revG', 'gm', 'rdInt', 'cap', 'rsPct', 'off52', 'own', 'sharesYoY']) { const wv = ws.map(w => w.snap[nm][k]).filter(ok); let av = []; for (const [d] of byF) { const t = tOf.get(d); av = av.concat(panel(t).map(r => featRow(r, t)[k]).filter(ok)); }
      out.medians[k] = { winners: r4(median(wv)), allStocks: r4(median(av)), winnersKnown: wv.length }; }
    looked[nm] = out; log('10x study: snapshot ' + nm + ' done (' + ws.length + ' winners)'); }
  // industries of the winners (SIC 2-digit) vs the eligible universe at the last month start
  const ind2 = {}; for (const w of WIN) { const s = w.sic ? w.sic.slice(0, 2) : '??'; ind2[s] = (ind2[s] || 0) + 1; }
  const uLast = panel(MS[MS.length - 1]), indBase = {}; for (const r of uLast) { const s = sicAt(r.i, r.cik), k = s ? s.slice(0, 2) : '??'; indBase[k] = (indBase[k] || 0) + 1; }
  const industries = Object.entries(ind2).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, n]) => ({ sic2: k, winners: n, share: r4(n / WIN.length), universeShare: r4((indBase[k] || 0) / uLast.length) }));
  // ---- A4. look-alikes: same month start, same visible bucket, followed to the end of the data ----
  const fate = new Map(); const fateOf = (i, f) => { const k = i * 1e5 + f; if (!fate.has(k)) { const m = multFrom(i, f), dead = deadI(i) && lastI[i] > f; fate.set(k, { m, dead }); } return fate.get(k); };
  const LA = {}; for (const nm of ['m6', 'start']) { let n = 0, x5 = 0, x10 = 0, dead = 0, wins = 0; const per = [];
    for (const w of WIN) { const s = w.snap[nm]; if (!s || !s.inPanel) continue; const t = tOf.get(s.d), P = panel(t); let ln = 0, l5 = 0, l10 = 0, ld = 0;
      for (const r of P) { if (r.i === w.i || (w.cik && r.cik === w.cik)) continue; const x = featRow(r, t); if ((r.pk || (r.pk = profileKey(x))) !== s.key) continue; const fz = fateOf(r.i, t); ln++; if (fz.m >= 5) l5++; if (fz.m >= 10) l10++; if (fz.dead) ld++; }
      wins++; n += ln; x5 += l5; x10 += l10; dead += ld; per.push({ sym: w.sym, at: s.d, key: s.key, lookAlikes: ln, reached5x: l5, died: ld }); }
    LA[nm] = { winners: wins, lookAlikes: n, lookAlikesPerWinner: r4(wins ? n / wins : null), reached5x: x5, reached10x: x10, died: dead, share5x: r4(n ? x5 / n : null), shareDied: r4(n ? dead / n : null), examples: per.sort((a, b) => b.lookAlikes - a.lookAlikes).slice(0, 25) }; }
  log('10x study: look-alikes done');
  // ---- A5. precision of pre-listed profiles: monthly panel with a full 2-year horizon (Oct 2022 - ~Sep 2024) ----
  const PF = MS.filter(t => t >= 252 && t + H2Y + SUSTAIN_K <= T - 1), prow = []; let artLeft = 0;
  for (const t of PF) { for (const r of panel(t)) { if (wall(r.i, t, Math.min(T - 1, t + H2Y + SUSTAIN_K))) { artLeft++; continue; } const x = featRow(r, t), m = multFrom(r.i, t, H2Y), s = ser(r.i), end = Math.min(T - 1, t + H2Y);
      const dead = deadI(r.i) && lastI[r.i] > t && lastI[r.i] <= end, mk = s.c(t) > 0 ? (dead ? 0 : (() => { for (let k = end; k > t; k--) { const z = s.c(k); if (z > 0) return z; } return s.c(t); })()) : null;
      prow.push({ sym: SYMS[r.i], t, x, m: m ?? 1, dead, ret: mk !== null ? mk / s.c(t) - 1 : null }); } }
  const base = precision(prow); const PREC = { all: base };
  for (const p of PROFILES) PREC[p.id] = { name: p.name, ...precision(prow.filter(z => p.test(z.x)), base) };
  log('10x study: precision panel ' + prow.length + ' stock-months on ' + PF.length + ' month starts');
  TENXOUT = { spec: TENX_SPEC, at: new Date().toISOString(), window: [D[0], D[T - 1]], counts: { x5: WIN.length, x10: WIN.filter(w => w.best >= 10).length, x5Dead: WIN.filter(w => w.latest === 'dead').length, x5LiquidAtStart: WIN.filter(w => w.liquidAtStart).length,
      x5StillAbove5xNow: WIN.filter(w => typeof w.latest === 'number' && w.latest >= 5).length, medianSessionsTo5x: median(WIN.map(w => w.sessionsTo5x).filter(ok)), medianFromPeakToLast: r4(median(WIN.map(w => w.fromPeakToLast).filter(ok))) },
    lookedLike: looked, industries, lookAlikes: LA, precision: { months: PF.map(t => D[t]), rows: prow.length, splitArtifactsLeftOut: artLeft, horizonSessions: H2Y, profiles: PREC },
    winners: WIN.map(({ i, t0, ...w }) => w) };
  W(TENX, TENXOUT); log('10x study written (' + ((Date.now() - tA) / 1000).toFixed(0) + 's)'); }

// ================= 9. FREEZE =================
const complete = T >= 1000 && STATUS.facts.ok && STATUS.funds.ok && STATUS.cikCover.ok && (STATUS.scan || {}).ok !== false;
const dataOk = (id) => complete && (id !== 'SQ4-INSIDER' || STATUS.f345.ok);
const strip = (r) => { const { trades, ...rest } = r; return rest; };
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).filter(([k]) => need.includes(k) && dataOk(k)).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], to: D[T - 1], bar: BAR, ...strip(r) }])), (r) => r.verdict !== 'TOO FEW CASES');   // value-lab policy: TOO FEW CASES is not frozen

// ================= 10. PAPER LANE =================
const lines = (() => { try { return fs.readFileSync(PAPER, 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } })();
const scanned = new Set(lines.filter(x => x.type === 'day').map(x => x.d)), sigLines = lines.filter(x => x.type === 'signal'), resolved = new Set(lines.filter(x => x.type === 'result').map(x => x.id));
const newLines = [], sigIds = new Set(sigLines.map(x => x.id)), toScan = []; for (let t = 0; t < T; t++) if (D[t] >= START && !scanned.has(D[t])) toScan.push(t);
const openKey = new Set(); for (const x of sigLines) if (!resolved.has(x.id)) openKey.add(x.m + '|' + x.sym);
const planText = (id, entry) => RULES[id].plan === 'T' ? 'buy 1 unit at the open of ' + entry + '; add 0.5 unit at the next open after a close 15% under the first buy; sell all if the position is worth 65% or less of the money in (35% stop on the total); else sell at the close of session 252'
  : 'buy 1 unit at the open of ' + entry + '; sell at the next open after a close 35% under the buy (disaster stop); once it has doubled, sell at the next open after a close under its 50-day average; else sell at the close of session 252';
for (const t of toScan) { const all = signalsAt(t);
  for (const id of IDS) for (const z of all[id] || []) { const sym = SYMS[z.i], key = id + '|' + sym; if (openKey.has(key)) continue; const lid = id + '|' + sym + '|' + D[t]; if (sigIds.has(lid)) continue;
    const entryDate = t + 1 < T ? D[t + 1] : nextSession(D[t]);
    const line = { type: 'signal', id: lid, m: id, sym, d: D[t], close: r4(CC(z.i, t)), halal: halal(sym), hold: HOLD, info: Object.fromEntries(Object.entries(z.info || {}).map(([k, v]) => [k, typeof v === 'number' ? r4(v) : v])), plan: planText(id, entryDate), entryDate, recordedAfter: D[T - 1] };
    sigIds.add(lid); openKey.add(key); newLines.push(line); sigLines.push(line); } }
for (const t of toScan) newLines.push({ type: 'day', d: D[t] });
const board = {}, today = {};
for (const x of sigLines) { const k = tOf.get(x.entryDate); if (k === undefined) { x._state = 'waiting'; continue; } const i = SY.get(x.sym), r = i === undefined ? null : runPlan(ser(i), k, { ...planOf(x.m), partial: true }); if (!r) { x._state = 'waiting'; continue; }
  x._k = k; x._r = r; if (r.kind === 'open') { x._state = 'open'; continue; } x._state = 'closed'; x._c = weighted(r.units, r.x, r.at, ctrlRet('raw'));
  if (!resolved.has(x.id)) { resolved.add(x.id); newLines.push({ type: 'result', id: x.id, m: x.m, sym: x.sym, d: x.d, buy: D[k], sell: D[r.x], kind: r.kind, units: r.units.length, moneyIn: r4(r.w), g: r4(r.g), net: r4(r.g - COST), avgStock: x._c === null ? null : r4(x._c - COST) }); } }
if (newLines.length) fs.appendFileSync(PAPER, newLines.map(x => JSON.stringify(x, (k, v) => k[0] === '_' ? undefined : v)).join('\n') + '\n');
// what each monthly rule would pick if a month started at the latest close (information; new paper signals come only at month starts)
const nowSig = signalsAt(T - 1, { monthly: true });
for (const id of IDS) { const mine = sigLines.filter(x => x.m === id), closed = mine.filter(x => x._state === 'closed').map(x => ({ d: x.d, sym: x.sym, g: x._r.g, c: x._c, halal: x.halal })), fr = firstRun[id], st = boardStats(closed);
  board[id] = { name: RULES[id].name, hold: HOLD, plan: RULES[id].plan, signals: mine.length, waiting: mine.filter(x => x._state === 'waiting').length, open: mine.filter(x => x._state === 'open').length, closed: st, halalOk: boardStats(closed.filter(z => z.halal === 'ok')), ready: paperReady(st), fiveYear: fr ? { verdict: fr.verdict, why: fr.why } : null };
  today[id] = { name: RULES[id].name, hold: HOLD, tier: fr ? fr.verdict : null, newSignals: mine.filter(x => x.d === D[T - 1]).map(x => ({ sym: x.sym, close: x.close, halal: x.halal, d: x.d, plan: x.plan })),
    open: mine.filter(x => x._state === 'open').map(x => ({ sym: x.sym, halal: x.halal, signal: x.d, buy: D[x._k], units: x._r.units.length, sinceBuy: r4(x._r.g), exitPending: x._r.exitPending || null })),
    matchesNow: (nowSig[id] || []).map(z => ({ sym: SYMS[z.i], close: r4(CC(z.i, T - 1)), halal: halal(SYMS[z.i]), info: Object.fromEntries(Object.entries(z.info || {}).map(([k, v]) => [k, typeof v === 'number' ? r4(v) : v])) })) }; }
const NOTE = 'PAPER ONLY. Squad 4 rules (SQ4-*: big winners, themes and compounders) record forward from 26 Oct 2026; the monthly rules sign at the first session of each month (next: the first session of the coming month), SQ4-QUALDIP any day. newSignals = new paper signals of the latest session; matchesNow = what a monthly rule would pick if a month started at the latest close (information). Nothing here is a buy by itself: a rule needs a frozen 5-year verdict that passes (data/squad4-lab.json firstRun) or 30+ resolved paper trades on 10+ days with a positive average after 0.8% cost. Halal = the owner\'s ZAD mark; "unknown" must be checked before any real buy.';
fs.writeFileSync(TODAY, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, note: NOTE, methods: today }, null, 1));
fs.writeFileSync(BOARD, JSON.stringify({ generatedAt: new Date().toISOString(), lastClose: D[T - 1], paperStart: START, cost: COST, readiness: '30+ resolved paper trades on 10+ distinct signal days, average > 0 after 0.8% cost', methods: board }, null, 1));
log('paper lane: scanned ' + toScan.length + ' new session(s); ' + newLines.filter(x => x.type === 'signal').length + ' new signals; ' + sigLines.length + ' in all');

// ================= 11. OUTPUT + LIBRARY =================
const tenxSummary = TENXOUT ? { counts: TENXOUT.counts, lookAlikes: Object.fromEntries(Object.entries(TENXOUT.lookAlikes || {}).map(([k, v]) => [k, { ...v, examples: undefined }])), precision: Object.fromEntries(Object.entries((TENXOUT.precision || {}).profiles || {}).map(([k, v]) => [k, v])), file: TENX } : null;
const out = { generatedAt: new Date().toISOString(), preRegistered: 'squad4-core.mjs RULES + data/strategy-library.json SQ4-* (24 Oct 2026, before any run)', window: [D[0], D[T - 1]], bar: BAR, split: SPLIT, cost: COST, stress: STRESS, hold: HOLD, complete, data: STATUS, diagnostics: DIAGS,
  standard: 'both halves (signal before / from ' + SPLIT + '; first signal ~Oct 2022, 12 months of prices needed, no pre-window history used): > 0 after 0.8% and 1.2% cost per unit of money, better than the average liquid stock over the same unit-weighted days, better than the same stocks with the same plan on their other days, > 0 without the 2 best, 20+ trades and 3+ blocks, block t >= ' + TIER2_T + ' (63-session blocks; 12-month holds overlap so t is optimistic) -> TRADABLE SMALL; block t >= ' + BAR + ' -> PROVEN; plus return per year of capital tied up above SPY on the same days in both halves. Returns uncapped on both sides (split-artifact paths left out on both sides); +300% cap on both sides = sensitivity only',
  firstRun, latest: LIGHT ? PREV.latest : latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, strip(r)])) }), themes: LIGHT ? PREV.themes : themeLog, tenX: tenxSummary,
  trades: LIGHT ? PREV.trades : Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, r.trades])), light: LIGHT || undefined };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue; const R = r.results;
    e.status = 'tested: ' + r.verdict.toLowerCase() + (r.verdict === 'TRADABLE SMALL' ? ' (tier 2)' : '') + '; forward paper lane from 26 Oct 2026'; e.tested = String(r.to); e.study = 'squad4-lab.mjs -> data/squad4-lab.json (run once as written, first complete run frozen)';
    e.result = { verdict: r.verdict, n: [R.older.n || 0, R.newer.n || 0], avg: [R.older.avg, R.newer.avg], stress: [R.older.avgStress, R.newer.avgStress], edge: [R.older.edge, R.newer.edge], vsOwn: [R.older.vsOwn, R.newer.vsOwn], noTop2: [R.older.noTop2, R.newer.noTop2], tBlock: [R.older.tBlock, R.newer.tBlock],
      perYear: [r.perYear.older.rule, r.perYear.newer.rule], spyPerYear: [r.perYear.older.spy, r.perYear.newer.spy], top5Share: r.payoff && r.payoff.all ? r.payoff.all.top5Share : null, why: r.why }; ch = true; }
  const b = LB && LB.strategies.find(x => x.id === 'B-100X1'); if (b && TENXOUT && complete && !b.result) { const P = TENXOUT.precision.profiles;
    b.status = 'studied (Squad 4, ' + D[T - 1] + '): a precursor scorecard, not a buy rule'; b.study = 'squad4-lab.mjs -> ' + TENX;
    b.result = { x5: TENXOUT.counts.x5, x10: TENXOUT.counts.x10, x5Dead: TENXOUT.counts.x5Dead, lookAlikesAtStart: TENXOUT.lookAlikes.start ? { perWinner: TENXOUT.lookAlikes.start.lookAlikesPerWinner, share5x: TENXOUT.lookAlikes.start.share5x, shareDied: TENXOUT.lookAlikes.start.shareDied } : null,
      baseRate5xIn2y: P.all.x5, bestProfile: Object.entries(P).filter(([k, v]) => k !== 'all' && v.n >= 100).sort((a, b) => (b[1].x5 || 0) - (a[1].x5 || 0)).slice(0, 3).map(([k, v]) => ({ id: k, n: v.n, x5: v.x5, lift5: v.lift5, dead: v.dead })) }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('squad4-lab: library not updated: ' + e.message); }
console.log('SQUAD 4 LAB ' + D[0] + ' to ' + D[T - 1] + ' | bar ' + BAR + ' | frozen ' + Object.keys(firstRun).length + '/' + IDS.length + (complete ? '' : ' | INCOMPLETE: ' + Object.entries(STATUS).filter(([, s]) => s && s.ok === false).map(([k]) => k).join(', ')) + ' | ' + Object.entries(STATUS).map(([k, s]) => k + (s && s.ok === false ? ' MISSING' : ' ok')).join(', '));
