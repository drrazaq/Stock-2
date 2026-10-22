// INSIDER CLUSTER BUYING STUDY. When several company insiders (officers, directors) buy shares with their OWN money on the open
// market within a few days, do the shares beat the market afterwards? Source: the SEC "Insider Transactions Data Sets" (free, official,
// quarterly ZIPs of every Form 3/4/5 since 2006: www.sec.gov/dera/data/form-345). Only Form 4, transaction code P (open-market
// purchase), acquired, price > 0. Grants, option exercises and sales are ignored.
// Point in time: the signal day is the FILING date of the purchase that completes the cluster (that is when the public could know);
// the buy is at the open of the next trading day. Versions: CLUSTER3 (3+ different insiders within 10 days), CLUSTER2 (2+), BIG1 (one
// insider buying 250,000 USD or more). Held 20 and 60 sessions. 0.8% costs (1.2% stress). Compared with (1) the average liquid stock
// bought the same day and (2) the same stock on its other days in the same half. Both halves, date-clustered t, luck bar for the
// 6 versions, must survive without its 2 best trades. Output: data/insider-study.json (+ today's fresh clusters as a watch list).
import fs from 'node:fs';
import { belowLeague, BELOW } from './league-bar.mjs';   // a passing verdict must also clear the league luck bar (22 Oct 2026)
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';   // run once per version: first judged verdict frozen (22 Oct 2026)
import { execFileSync } from 'node:child_process';
const env = process.env, OUT = 'data/insider-study.json', DIR = (env.CACHE_DIR || 'study-cache') + '/insider', COST = 0.008, STRESS = 0.012, HOLDS = [20, 60];
const UA = env.SEC_UA || 'stock-signal-board admin@users.noreply.github.com', local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null, BASE = local(env.SEC_BASE) || 'https://www.sec.gov';
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
fs.mkdirSync(DIR, { recursive: true }); fs.mkdirSync('data', { recursive: true });
// ---- 1. prices (the same 5-year whole-market cache as the other studies)
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no price cache' })); console.log('insider: no price cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 300) { console.log('insider: too few sessions'); process.exit(0); }
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN);
// CX: closes of a stock AFTER it fell out of the cache's 3 USD / 1M USD filter (study-cache x rows, 22 Oct 2026). Used only to value an
// exit (a held stock that collapsed under 3 USD keeps its real price); never for an entry.
const CX = new Float32Array(NS * T).fill(NaN);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; }  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; }}); store = null;
const spyI = SY.get('SPY');
// ---- 2. insider purchases, quarter by quarter (each finished quarter is downloaded once and kept compact in the cache)
const MON = { JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06', JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12' };
const isoD = (s) => { const m = /^(\d{1,2})-([A-Z]{3})-(\d{4})/.exec(String(s || '').toUpperCase()); return m ? m[3] + '-' + MON[m[2]] + '-' + m[1].padStart(2, '0') : null; };
const tsv = (zip, name) => { let txt; try { txt = execFileSync('unzip', ['-p', zip, name], { maxBuffer: 1 << 30 }).toString(); } catch (e) { return null; } const L = txt.split(/\r?\n/), H = L[0].split('\t'); return { H, rows: L.slice(1).filter(Boolean).map(l => l.split('\t')) }; };
const now = new Date(), qs = []; for (let y = +D[0].slice(0, 4); y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) { const end = new Date(Date.UTC(y, q * 3, 1)); if (end < now) qs.push(y + 'q' + q); }
let fetched = 0, failed = [];
for (const q of qs) { const cf = DIR + '/' + q + '.json'; if (fs.existsSync(cf)) continue;
  let ok = false; for (const path of ['/files/structureddata/data/insider-transactions-data-sets/', '/files/datastandardsinnovation/data/insider-transactions-data-sets/']) {
    await sleep(local(env.SEC_BASE) ? 0 : 300); let r; try { r = await fetch(BASE + path + q + '_form345.zip', { headers: { 'User-Agent': UA } }); } catch (e) { continue; } if (!r.ok) continue;
    const zip = DIR + '/' + q + '.zip'; fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer())); fetched++;
    const S = tsv(zip, 'SUBMISSION.tsv'), N = tsv(zip, 'NONDERIV_TRANS.tsv'), RO = tsv(zip, 'REPORTINGOWNER.tsv'); fs.unlinkSync(zip); if (!S || !N) continue;
    const own = new Map(); if (RO) { const ri = (n) => RO.H.indexOf(n); for (const x of RO.rows) if (!own.has(x[ri('ACCESSION_NUMBER')])) own.set(x[ri('ACCESSION_NUMBER')], x[ri('RPTOWNERCIK')]); }
    const si = (n) => S.H.indexOf(n), ni = (n) => N.H.indexOf(n), sub = new Map();
    for (const x of S.rows) if (x[si('DOCUMENT_TYPE')] === '4') sub.set(x[si('ACCESSION_NUMBER')], { d: isoD(x[si('FILING_DATE')]), sym: String(x[si('ISSUERTRADINGSYMBOL')] || '').toUpperCase().trim().replace(/-/g, '.') });
    const buys = []; for (const x of N.rows) { if (x[ni('TRANS_CODE')] !== 'P' || x[ni('TRANS_ACQUIRED_DISP_CD')] !== 'A') continue; const s = sub.get(x[ni('ACCESSION_NUMBER')]); if (!s || !s.d || !/^[A-Z][A-Z0-9.]{0,6}$/.test(s.sym)) continue;
      const sh = +x[ni('TRANS_SHARES')], px = +x[ni('TRANS_PRICEPERSHARE')]; if (!(sh > 0) || !(px > 0)) continue; buys.push([s.sym, s.d, own.get(x[ni('ACCESSION_NUMBER')]) || x[ni('ACCESSION_NUMBER')], Math.round(sh * px)]); }
    fs.writeFileSync(cf, JSON.stringify(buys)); ok = true; break; }
  if (!ok) failed.push(q); }
// each purchase: [symbol, filing date, insider (reporting owner CIK), USD]; distinct insiders are counted by their CIK
const P = []; for (const q of qs) { try { for (const b of JSON.parse(fs.readFileSync(DIR + '/' + q + '.json', 'utf8'))) P.push({ sym: b[0], d: b[1], who: b[2], usd: b[3] }); } catch (e) {} }
console.log('insider: ' + P.length + ' open-market purchases loaded from ' + qs.length + ' quarters (' + fetched + ' downloaded now' + (failed.length ? ', missing ' + failed.join(' ') : '') + ')');
// ---- 3. events
const dayIdx = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo; };   // first session strictly AFTER date d
const bySym = {}; for (const p of P) if (SY.has(p.sym)) (bySym[p.sym] = bySym[p.sym] || []).push(p);
const EV = { CLUSTER3: [], CLUSTER2: [], BIG1: [] };
for (const [sym, a] of Object.entries(bySym)) { a.sort((x, y) => x.d < y.d ? -1 : 1); let lastC3 = '0', lastC2 = '0', lastB = '0';
  for (let k = 0; k < a.length; k++) { const p = a[k], from = new Date(Date.parse(p.d) - 10 * 864e5).toISOString().slice(0, 10), win = a.filter(z => z.d >= from && z.d <= p.d);
    const n = new Set(win.map(z => z.who)).size; const add = (key, last) => { if (p.d <= last) return last; EV[key].push({ sym, d: p.d, n, usd: win.reduce((s, z) => s + z.usd, 0) }); return new Date(Date.parse(p.d) + 30 * 864e5).toISOString().slice(0, 10); };
    if (n >= 3) lastC3 = add('CLUSTER3', lastC3); if (n >= 2) lastC2 = add('CLUSTER2', lastC2); if (p.usd >= 250000) lastB = add('BIG1', lastB); } }
// ---- 4. returns and controls
const liquid = (i, t) => { const c = C[i * T + t]; if (!(c >= 3)) return false; let dv = 0, n = 0; for (let k = Math.max(0, t - 19); k <= t; k++) { const c1 = C[i * T + k], v = V[i * T + k]; if (isFinite(c1) && isFinite(v)) { dv += c1 * v; n++; } } return n >= 15 && dv / n >= 1e6; };
function fwd(i, t, h) { const b = i * T, e = O[b + t]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k >= t; k--) { const z = isFinite(C[b + k]) ? C[b + k] : CX[b + k]; if (isFinite(z)) { last = z; break; } } return last === null ? null : last / e - 1; }   // bought at the open of session t
const cc = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in cc) return cc[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && liquid(i, t - 1)) { const g = fwd(i, t, h); if (g !== null && Math.abs(g) < 3) v.push(g); } return (cc[key] = v.length >= 30 ? mean(v) : null); };
const midT = Math.floor(T / 2), oc = {}; const own = (i, t, h) => { const half = t < midT ? 0 : 1, key = i + '_' + h + '_' + half; if (key in oc) return oc[key]; const v = []; for (let k = half ? midT : 1; k < (half ? T - 1 : midT); k += 3) { const g = fwd(i, k, h); if (g !== null && Math.abs(g) < 3) v.push(g); } return (oc[key] = v.length >= 20 ? mean(v) : null); };
const trades = {}; for (const [key, ev] of Object.entries(EV)) for (const h of HOLDS) { const a = trades[key + '_' + h] = []; for (const e of ev) { const i = SY.get(e.sym), t = dayIdx(e.d); if (t >= T || t < 1 || !liquid(i, t - 1)) continue; const g = fwd(i, t, h), c0 = ctrl(t, h), ob = own(i, t, h); if (g === null || c0 === null || ob === null || Math.abs(g) > 3) continue; a.push({ t, s: e.sym, g, c: c0, ob }); } }
const NV = Object.keys(trades).length, BAR = 2.4 + 0.05 * NV;
const stat = (a, cost) => { if (a.length < 20) return { n: a.length }; const tt = (f) => { const by = {}; for (const z of a) (by[z.t] = by[z.t] || []).push(f(z)); const v = Object.values(by).map(mean), m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / Math.max(1, v.length - 1)); return [m, sd > 0 ? m / (sd / Math.sqrt(v.length)) : 0, v.length]; };
  const [e1, t1, days] = tt(z => z.g - cost - z.c), [e2, t2] = tt(z => z.g - z.ob), p = a.map(z => z.g - cost).sort((x, y) => y - x), byS = {}; let pos = 0; for (const z of a) { const r = z.g - cost; if (r > 0) { byS[z.s] = (byS[z.s] || 0) + r; pos += r; } }
  return { n: a.length, days, avg: +mean(a.map(z => z.g - cost)).toFixed(4), ctrl: +mean(a.map(z => z.c)).toFixed(4), edge: +e1.toFixed(4), t: +t1.toFixed(2), vsOwn: +e2.toFixed(4), tOwn: +t2.toFixed(2), win: +(a.filter(z => z.g - cost > 0).length / a.length).toFixed(3), noTop2: +mean(p.slice(2)).toFixed(4), topStock: pos > 0 ? +(Math.max(...Object.values(byS)) / pos).toFixed(3) : null }; };
const RES = {}, NAMES = { CLUSTER3: '3+ different insiders buying within 10 days', CLUSTER2: '2+ different insiders buying within 10 days', BIG1: 'one insider buying 250,000 USD or more' };
for (const [k, a] of Object.entries(trades)) { const R = { older: stat(a.filter(z => z.t < midT), COST), newer: stat(a.filter(z => z.t >= midT), COST), stress: stat(a.filter(z => z.t >= midT), STRESS) }, why = [];
  for (const hf of ['older', 'newer']) { const r = R[hf]; if (!(r.n >= 20)) { why.push('too few cases in the ' + hf + ' half (' + (r.n || 0) + ')'); continue; } if (!(r.edge > 0 && r.t >= BAR)) why.push('not clearly better than the average stock in the ' + hf + ' half (' + pc(r.edge) + ', t ' + r.t + ', ' + BAR.toFixed(1) + ' needed)'); if (!(r.vsOwn > 0 && r.tOwn >= 2)) why.push('not clearly better than the same stock on other days in the ' + hf + ' half (' + pc(r.vsOwn) + ', t ' + r.tOwn + ')'); if (!(r.avg > 0)) why.push('lost money after costs in the ' + hf + ' half'); }
  if (R.stress.n >= 20 && !(R.stress.avg > 0)) why.push('loses at 1.2% costs'); if (R.newer.n >= 20 && !(R.newer.noTop2 > 0)) why.push('loses without its 2 best trades'); if (R.newer.topStock > 0.25) why.push('one stock made over 25% of the profit');
  const [key, h] = [k.replace(/_\d+$/, ''), k.split('_').pop()];
  RES[k] = { name: NAMES[key] + ', bought the next open after the filing, held ' + h + ' sessions', verdict: !(R.older.n >= 20 && R.newer.n >= 20) ? 'TOO FEW CASES' : !why.length ? 'PROMISING' : R.older.edge > 0 && R.newer.edge > 0 ? 'NOT PROVEN' : 'REJECTED', why: why.join('; ') || 'beat the average stock and the same stock’s other days in both halves, beyond luck, at stress cost', results: R }; }
for (const r of Object.values(RES)) if (r.verdict === 'PROMISING') { const lw = belowLeague([r.results.older.t, r.results.newer.t], BAR); if (lw) { r.verdict = BELOW; r.why = 'beat the average stock and the same stock in both halves; ' + lw; } }
// RUN ONCE per version: the first run in which a version has 20+ cases in both halves (verdict other than TOO FEW CASES) is frozen in
// firstRun.results and never overwritten; this run's numbers go to `latest` (monitoring only). The library E3 reads firstRun only.
const PREV = (() => { try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (e) { return {}; } })() || {};
const FR = freezeEach(PREV.firstRun && PREV.firstRun.results, RES, (r) => r.verdict !== 'TOO FEW CASES');
const firstRun = Object.keys(FR).length ? { at: (PREV.firstRun && PREV.firstRun.at) || new Date().toISOString(), bar: (PREV.firstRun && PREV.firstRun.bar) || +BAR.toFixed(2), results: FR } : null;
const RESF = Object.fromEntries(Object.keys(RES).map(k => [k, FR[k] || { ...RES[k], verdict: 'NO VERDICT YET (' + RES[k].verdict + ')' }]));
const recent = EV.CLUSTER2.filter(e => e.d >= new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)).sort((a, b) => b.n - a.n || (a.d < b.d ? 1 : -1)).slice(0, 15);
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), status: 'OK', from: D[0], to: D[T - 1], purchases: P.length, events: Object.fromEntries(Object.entries(EV).map(([k, v]) => [k, v.length])), versions: NV, bar: +BAR.toFixed(2), note: 'SEC data sets are quarterly, so the newest weeks appear only after the quarter ends. results = the frozen first verdict of each version (firstRun); latest = monitoring only.', results: RESF, firstRun, latest: latestBlock({ at: new Date().toISOString(), to: D[T - 1], bar: +BAR.toFixed(2), results: RES }), recent }, null, 1));
console.log('INSIDER CLUSTER BUYING (' + D[0] + ' to ' + D[T - 1] + '; events: ' + Object.entries(EV).map(([k, v]) => k + ' ' + v.length).join(', ') + ')');
for (const r of Object.values(RESF)) console.log('- ' + r.name + ': ' + r.verdict + (r.results.newer.n ? ' | newer half ' + r.results.newer.n + ' trades, ' + pc(r.results.newer.avg) + ' a trade, ' + pc(r.results.newer.edge) + ' vs average stock (t ' + r.results.newer.t + '), ' + pc(r.results.newer.vsOwn) + ' vs same stock other days' : '') + (r.verdict !== 'PROMISING' ? ' (' + r.why.split(';')[0] + ')' : ''));
try { const LB = JSON.parse(fs.readFileSync('data/strategy-library.json', 'utf8')), order = ['PROMISING', 'NOT PROVEN', 'REJECTED', 'TOO FEW CASES'], best = Object.values(FR).map(r => r.verdict).sort((a, b) => order.indexOf(a) - order.indexOf(b))[0];
  if (best) for (const e of LB.strategies) if (e.id === 'E3') { e.agent = 'C'; e.status = 'tested: ' + best.toLowerCase(); e.tested = firstRun.at.slice(0, 10); e.study = 'insider-study.mjs -> data/insider-study.json (run once per version, first judged run frozen)'; e.note = 'insider-study.mjs (SEC Form 4 data sets): best of ' + Object.keys(FR).length + ' frozen versions.'; } fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } catch (e) {}
