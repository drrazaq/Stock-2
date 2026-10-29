// C-S8 and C-LOCK SHARE-SUPPLY AVOID BLOCKS (Agent C, Crowd). Research only; no orders; no Telegram. Output: data/share-supply.json.
// PRE-REGISTERED 22 Oct 2026, written before any result was seen. RUN ONCE AS WRITTEN (each version's first judged verdict frozen).
// Question: do new shares about to reach the market (employee-plan registrations, IPO lock-up expiries) predict that a stock lags?
//   If yes, the rule is an AVOID block (never a short, never a buy).
// DATA (official, free): SEC EDGAR quarterly full index (www.sec.gov/Archives/edgar/full-index/<year>/QTR<n>/master.gz: CIK, form,
//   filing date, for EVERY filer, including companies that later delisted), cached in study-cache/edgar-idx; CIK -> ticker from the
//   SEC company list (current tickers only: delisted companies drop out, stated in the output); share counts from data/shares.json.gz
//   (quarterly cover counts, treated as known 30 days after their date); prices from the 5-year whole-market cache.
//   Point in time: EDGAR gives the filing DATE only, so every trade starts at the open of the session AFTER the first session on or
//   after the filing date (a filing after the close is never used early).
// VERSIONS (all fixed now):
//   S8A  any Form S-8 (not S-8 POS); one event per stock per 60 sessions; hold 20 sessions.
//   S8B  (the library rule C-S8, nearest measure the data allows) S-8 AND the latest known share count up over 2% vs the count known
//        90 days earlier (the share data is quarterly, so "2% in 30 days" cannot be measured; stated here before the run); hold 20.
//   L180 (the library rule C-LOCK) IPO lock-up expiry = date of the company's first 424B4 + 180 calendar days, counted as an IPO only
//        when the stock first appears in the price cache within 15 sessions after that 424B4 and not before it; enter the open of the
//        first session on/after the expiry date, hold 10 sessions.
//   L180W (the published window, Field and Hanka 2001, Journal of Finance 56(2), "The Expiration of IPO Share Lockups": negative
//        abnormal returns around the expiry day) enter the open 5 sessions before the expiry session, sell at the close of the session
//        after expiry (7 sessions).
//   L90  same as L180 with 90 days (information only: some lock-ups are 90 days; not a candidate rule).
// TEST FOR AN AVOID RULE: edge = flagged stock's return minus the average tradable stock (3 USD+, 1M USD+ a day) bought the same day
//   for the same sessions. Both pay the same costs, so costs cancel and are not applied (a stress cost would only flatter an avoid).
//   Date-clustered t. Also vs the S&P 500 and vs the same stock on its other days.
//   PROVEN AVOID: in BOTH halves edge < 0 with t <= -max(own bar, league bar, 4.0), worse than the S&P 500, worse than the same stock on
//     its other days (t <= -2), and still negative without its 2 WORST trades (the mirror of "without the 2 best").
//   TRADABLE SMALL (tier 2) AVOID: in BOTH halves edge < 0, t <= -2.5, still negative without its 2 worst trades.
//   Otherwise NOT PROVEN (negative in both halves but weaker) or REJECTED (not worse than the average stock in a half).
//   20+ cases per half are needed for any verdict.
import fs from 'node:fs';
import {createSupplySource,supplyBase} from './share-supply-source.mjs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
const env = process.env, OUT = env.OUT || 'data/share-supply.json', IDIR = (env.CACHE_DIR || 'study-cache') + '/edgar-idx', SEC = supplyBase(env.SEC_BASE);
const UA = env.SEC_UA || 'stock-2 research admin@users.noreply.github.com', TIER2_T = 2.5, LEAGUE_FLOOR = 4.0, NV = 4;
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, gz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return null; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let PREV={};try{if(fs.existsSync(OUT)){const b=fs.readFileSync(OUT);if(b.length>8*1024*1024)throw Error();PREV=JSON.parse(b.toString());if(!PREV||typeof PREV!=='object'||Array.isArray(PREV))throw Error();}}catch{console.error('share-supply: prior output unreadable; original preserved');process.exit(1);}
const unavailable=why=>{fs.mkdirSync(OUT.slice(0,OUT.lastIndexOf('/'))||'.',{recursive:true});fs.writeFileSync(OUT,JSON.stringify({...PREV,status:'NOT RUN',sourceStatus:{SEC_INDEX:{status:'UNKNOWN'},SEC_TICKERS:{status:'UNKNOWN'}},lastAttempt:{at:new Date().toISOString(),why}}));console.log('share-supply: '+why);process.exit(0);};
let store = gz(env.CACHE || 'study-cache/grouped.json.gz'); if (!store) unavailable('no price cache');
const SHR = gz(env.SHARES || 'data/shares.json.gz');
const D = Object.keys(store.days || {}).sort(), T = D.length; if (T < 300) unavailable('too few sessions');
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], O = new Float32Array(NS * T).fill(NaN), C = new Float32Array(NS * T).fill(NaN), V = new Float32Array(NS * T).fill(NaN), CX = new Float32Array(NS * T).fill(NaN), FIRST = new Int32Array(NS).fill(-1);
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const q = SY.get(x.T[j]), k = q * T + t; O[k] = x.o[j]; C[k] = x.c[j]; V[k] = x.v[j]; if (FIRST[q] < 0) FIRST[q] = t; } if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q !== undefined) CX[q * T + t] = x.x.c[j]; } }); store = null;
const spyI = SY.get('SPY');
fs.mkdirSync(IDIR, { recursive: true });
const SOURCE=createSupplySource({dir:IDIR,base:env.SEC_BASE,ua:UA});
// ---- 2. statistics ----
const firstOnOrAfter = (d) => { let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] < d) lo = m + 1; else hi = m; } return lo; };
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const lag = SHR ? (+SHR.lagDays || 30) * 864e5 : 0, sharesKnown = (a, ms) => { const lim = new Date(ms - lag).toISOString().slice(0, 10); let v = null; for (const [d, n] of a) { if (d <= lim) v = n; else break; } return v; };
const tradable = (i, t) => { const c = C[i * T + t]; if (!(c >= 3)) return false; let dv = 0, n = 0; for (let k = t - 19; k <= t; k++) { if (k < 0) continue; const c1 = C[i * T + k], v = V[i * T + k]; if (isFinite(c1) && isFinite(v)) { dv += c1 * v; n++; } } return n >= 10 && dv / n >= 1e6; };
// buy at the open of session t+1, sell at the close of session t+h (a stock that left the cache keeps its real later price, CX)
function fwd(i, t, h) { const b = i * T, e = O[b + t + 1]; if (!(e > 0) || t + h >= T) return null; let last = null; for (let k = t + h; k > t; k--) { const z = isFinite(C[b + k]) ? C[b + k] : CX[b + k]; if (isFinite(z)) { last = z; break; } } return last === null ? null : last / e - 1; }
const ctrlC = {}; const ctrl = (t, h) => { const key = t + '_' + h; if (key in ctrlC) return ctrlC[key]; const v = []; for (let i = 0; i < NS; i += 2) if (i !== spyI && tradable(i, t)) { const g = fwd(i, t, h); if (g !== null && isFinite(g) && Math.abs(g) < 3) v.push(g); } return (ctrlC[key] = v.length >= 30 ? mean(v) : null); };
const spyF = (t, h) => spyI === undefined ? null : fwd(spyI, t, h);
const START = 60, midT = Math.floor((START + T) / 2), ownC = {}; const own = (i, t, h) => { const half = t < midT ? 0 : 1, key = i + '_' + h + '_' + half; if (key in ownC) return ownC[key]; const v = []; for (let k = half ? midT : START; k < (half ? T - 1 : midT); k += 2) { if (Math.abs(k - t) <= h + 5) continue; if (tradable(i, k)) { const g = fwd(i, k, h); if (g !== null && Math.abs(g) < 3) v.push(g); } } return (ownC[key] = v.length >= 20 ? mean(v) : null); };
const tOf = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = {}; for (const z of a) { const x = f(z); if (x === null || !isFinite(x)) continue; (o[z.t] = o[z.t] || []).push(x); } return Object.values(o).map(mean); };
const stat = (a) => { if (a.length < 20) return { n: a.length };
  const v = byDay(a, z => z.g - z.c), ov = byDay(a, z => typeof z.ob === 'number' ? z.g - z.ob : null), sv = byDay(a, z => typeof z.sp === 'number' ? z.g - z.sp : null), ex = a.map(z => z.g - z.c).sort((x, y) => x - y);
  return { n: a.length, days: v.length, stocks: new Set(a.map(z => z.s)).size, avg: +mean(a.map(z => z.g)).toFixed(4), ctrl: +mean(a.map(z => z.c)).toFixed(4), edge: +mean(v).toFixed(4), t: tOf(v), vsSpy: sv.length ? +mean(sv).toFixed(4) : null, tSpy: tOf(sv), vsOwn: ov.length ? +mean(ov).toFixed(4) : null, tOwn: tOf(ov), lagged: +(ex.filter(x => x < 0).length / ex.length).toFixed(3), noWorst2: +mean(ex.slice(2)).toFixed(4) }; };
(async () => {
  const y0 = +D[0].slice(0, 4) - 1, now = new Date(), rows = [],sourceArtifacts=[],conflicts=[]; let qOk = 0, qAll = 0;   // one year earlier than prices: 424B4 dates of IPOs whose lock-up ends inside the window
  for (let y = y0; y <= now.getUTCFullYear(); y++) for (let q = 1; q <= 4; q++) { if (y === now.getUTCFullYear() && (q - 1) * 3 > now.getUTCMonth()) continue; qAll++;const quarter=y+'Q'+q,r=await SOURCE.quarter(quarter);sourceArtifacts.push({quarter,status:r.status,reason:r.reason,firstObservedAt:r.firstObservedAt,rejectedRows:r.rejectedRows});if(r.status==='OBSERVED')qOk++;rows.push(...r.rows);conflicts.push(...r.conflicts); }
  const tick=await SOURCE.tickers(),sourceComplete=qOk===qAll&&tick.status==='OBSERVED';
  for(const row of rows)if(tick.conflicts?.includes(String(row[0])))conflicts.push(row[3]);
  const quarantinedSourceIds=[...new Set([...(Array.isArray(PREV.quarantinedSourceIds)?PREV.quarantinedSourceIds:[]),...conflicts.flatMap(id=>['SEC_INDEX:'+id+':S8','SEC_INDEX:'+id+':LOCK180'])])];
  const sourceStatus={SEC_INDEX:{status:qOk===qAll?'OBSERVED':'PARTIAL_OR_UNKNOWN',quarters:qAll,completeQuarters:qOk},SEC_TICKERS:{status:tick.status}};
  const base = { sourceStatus,sourceArtifacts,sourceTelemetry:SOURCE.telemetry(),quarantinedSourceIds,identityCaveat:'Current SEC literal ticker mapping is not authenticated historical security/class identity; no hyphen/dot guessing.',generatedAt: new Date().toISOString(), agent: 'C', ids: ['C-S8', 'C-LOCK'], preRegistered: '2026-10-22', window: [D[START], D[T - 1]], indexQuarters: qOk + ' of ' + qAll, universe: 'companies in today\'s SEC ticker list that are in the price cache (delisted companies are missing: their S-8 and lock-up events are not counted)' };
  const byCik = {};for(const [cik,form,d,filingPath,firstObservedAt,revisionId] of rows){const ss=tick.m?.[cik];if(!ss||ss.length!==1||tick.conflicts?.includes(String(cik))||!SY.has(ss[0]))continue;(byCik[ss[0]]??=[]).push([form,d,filingPath,firstObservedAt,revisionId]);}
  const VERS = { S8A: 20, S8B: 20, L180: 10, L180W: 7, L90: 10 }, trades = {}, counts = {}; for (const k in VERS) { trades[k] = []; counts[k] = 0; }
  const add = (k, i, t, extra) => { counts[k]++; const h = VERS[k], g = fwd(i, t, h), c0 = ctrl(t, h), ob = own(i, t, h), sp = spyF(t, h); if (g === null || c0 === null || Math.abs(g) > 3) return; trades[k].push({ t, s: SYMS[i], g, c: c0, ob, sp, ...extra }); };
  const nowList = [];
  for (const [sym, list] of Object.entries(byCik)) { const i = SY.get(sym); if (i === undefined || i === spyI) continue; const A = SHR && SHR.c && SHR.t && sym in SHR.t ? SHR.c[SHR.t[sym]] : null; list.sort((x, y) => x[1] < y[1] ? -1 : 1);
    // S-8: the trade is bought at the open after the first session on/after the filing date (t = that session; fwd buys t+1)
    let lastS8 = -999; for (const [form, d,filingPath,firstObservedAt,revisionId] of list) { if (form !== 'S-8') continue; const t = firstOnOrAfter(d); if (t < START || t >= T) continue; if (t >= T - 21) nowList.push({sym,rule:'S-8 filed',filed:d,publicationDay:d,filingPath,firstObservedAt,sourceId:'SEC_INDEX:'+filingPath+':S8',sourceRevisionId:revisionId,derivedAvailableAt:firstObservedAt,sourceIdentityBasis:'REPORTED_SEC_INDEX_PATH_CURRENT_LITERAL_TICKER',sourceClockBasis:'FILING_DAY_ONLY_ACCESS_KNOWN',materiality:'NOT_ESTABLISHED',sourceDataDay:D[T-1]}); if (t - lastS8 <= 60 || !tradable(i, t) || t + 1 >= T) continue; lastS8 = t; add('S8A', i, t, { d });
      if (A) { const ms = Date.parse(D[t]), n1 = sharesKnown(A, ms), n0 = sharesKnown(A, ms - 90 * 864e5); if (n1 > 0 && n0 > 0 && n1 / n0 - 1 > 0.02) add('S8B', i, t, { d, up: +(n1 / n0 - 1).toFixed(3) }); } }
    // IPO: the first 424B4, and the stock first appears in the price cache within 15 sessions after it (not before it)
    const ipo = list.find(([form]) => form === '424B4'); if (!ipo) continue; const tI = firstOnOrAfter(ipo[1]); if (!(FIRST[i] >= tI && FIRST[i] - tI <= 15 && tI > 0)) continue;
    for (const [k, days] of [['L180', 180], ['L90', 90]]) { const ex = addDays(ipo[1], days), te = firstOnOrAfter(ex); if (te >= T) { if (k === 'L180' && te - T < 30) nowList.push({sym,rule:'lock-up expiry about '+ex,ipo:ipo[1],publicationDay:ipo[1],filingPath:ipo[2],firstObservedAt:ipo[3],sourceId:'SEC_INDEX:'+ipo[2]+':LOCK180',sourceRevisionId:ipo[4],derivedAvailableAt:ipo[3],sourceIdentityBasis:'REPORTED_SEC_INDEX_PATH_CURRENT_LITERAL_TICKER',sourceClockBasis:'FILING_DAY_ONLY_ACCESS_KNOWN',materiality:'NOT_ESTABLISHED',hypothesis:'IPO_DATE_PLUS180_NOT_VERIFIED_LOCKUP',sourceDataDay:D[T-1]}); continue; } if (te < START + 6) continue;
      if (te - 1 >= 0 && tradable(i, te - 1)) add(k, i, te - 1, { ipo: ipo[1], expiry: ex });   // fwd buys the open of session te
      if (k === 'L180' && te - 6 >= START && tradable(i, te - 6)) add('L180W', i, te - 6, { ipo: ipo[1], expiry: ex }); } }   // buys the open 5 sessions before expiry, sells the close of the session after
  const OWN_BAR = 2.4 + 0.1 * NV / 2, LG = J('data/agent-league.json', {}), BAR = Math.max(OWN_BAR, typeof LG.bar === 'number' ? LG.bar : 0, LEAGUE_FLOOR);
  const NAMES = { S8A: 'Any Form S-8 filed (avoid 20 sessions)', S8B: 'Form S-8 filed and share count up over 2% vs 90 days earlier (avoid 20 sessions) = C-S8', L180: 'IPO lock-up expiry (first 424B4 + 180 days), the 10 sessions after = C-LOCK', L180W: 'IPO lock-up expiry window, 5 sessions before to 1 after (Field and Hanka 2001)', L90: 'IPO + 90 days, 10 sessions after (information only)' }, RES = {};
  for (const [k, a] of Object.entries(trades)) { const R = { older: stat(a.filter(z => z.t < midT)), newer: stat(a.filter(z => z.t >= midT)) }, why = [], why2 = [];
    for (const hf of ['older', 'newer']) { const r = R[hf]; if (!(r.n >= 20)) { why.push('too few cases in the ' + hf + ' half (' + (r.n || 0) + ')'); why2.push('too few cases'); continue; }
      if (!(r.edge < 0)) why.push('not worse than an average stock in the ' + hf + ' half (' + pc(r.edge) + ')');
      if (!(r.t <= -BAR)) why.push('could be luck in the ' + hf + ' half (t ' + r.t + ', -' + BAR.toFixed(2) + ' needed)');
      if (!(r.vsSpy < 0)) why.push('not worse than the S&P 500 in the ' + hf + ' half');
      if (!(r.vsOwn < 0 && r.tOwn <= -2)) why.push('not clearly worse than the same stock on its other days in the ' + hf + ' half (' + pc(r.vsOwn) + ', t ' + r.tOwn + ')');
      if (!(r.noWorst2 < 0)) why.push('not worse without its 2 worst cases in the ' + hf + ' half');
      if (!(r.edge < 0)) why2.push(hf + ': not worse than the average stock'); if (!(r.t <= -TIER2_T)) why2.push(hf + ': t ' + r.t + ' not at or below -2.5'); if (!(r.noWorst2 < 0)) why2.push(hf + ': not worse without its 2 worst cases'); }
    const verdict = !(R.older.n >= 20 && R.newer.n >= 20) ? 'TOO FEW CASES' : !why.length ? 'PROVEN AVOID' : R.older.edge < 0 && R.newer.edge < 0 ? 'NOT PROVEN' : 'REJECTED';
    const level = verdict === 'PROVEN AVOID' ? 'PROVEN' : verdict !== 'TOO FEW CASES' && !why2.length ? 'TRADABLE SMALL (tier 2) avoid' : 'NONE';
    RES[k] = { name: NAMES[k], signals: counts[k], info: k === 'L90', verdict: k === 'L90' ? 'INFORMATION: ' + verdict : verdict, level: k === 'L90' ? 'information only' : level, why: why.join('; ') || 'every gate passed', whyTier2: why2.join('; ') || 'tier-2 test passed', results: R }; }
  const thisRun = { at: new Date().toISOString(), from: D[START], to: D[T - 1], bar: +BAR.toFixed(2), results: RES };
  const frozen = freezeEach(PREV.firstRun && PREV.firstRun.results, RES, (r) => sourceComplete&&!/TOO FEW/.test(r.verdict)), firstRun = Object.keys(frozen).length ? { at: (PREV.firstRun && PREV.firstRun.at) || thisRun.at, bar: (PREV.firstRun && PREV.firstRun.bar) || thisRun.bar, to: (PREV.firstRun && PREV.firstRun.to) || thisRun.to, results: frozen } : null;
  fs.writeFileSync(OUT, JSON.stringify({ ...base, status:sourceComplete?'OK':'PARTIAL_OR_UNKNOWN', versions: NV, bar: +BAR.toFixed(2), firstRun, latest: latestBlock(thisRun), now: nowList.slice(-60), examples: Object.fromEntries(Object.entries(trades).map(([k, a]) => [k, a.slice(-6).map(z => ({ s: z.s, d: D[z.t], ret: +z.g.toFixed(3), avgStock: +z.c.toFixed(3) }))])) }, null, 1));
  console.log('SHARE SUPPLY (avoid blocks), ' + D[START] + ' to ' + D[T - 1] + ', bar t ' + BAR.toFixed(2));
  for (const k of Object.keys(RES)) { const f = (firstRun && firstRun.results[k]) || RES[k], o = f.results.older, n = f.results.newer; console.log('- ' + k + ' ' + f.verdict + ' / ' + f.level + ' | ' + f.signals + ' signals | older ' + (o.n || 0) + ' edge ' + pc(o.edge) + ' t ' + o.t + ' | newer ' + (n.n || 0) + ' edge ' + pc(n.edge) + ' t ' + n.t + (f.verdict === 'PROVEN AVOID' ? '' : ' (' + f.why.split(';')[0] + ')')); }
  // library: C-S8 <- S8B, C-LOCK <- L180 (frozen first run only; the other versions are reported in the result)
  try { const LB = J('data/strategy-library.json', null); if (LB && firstRun&&sourceComplete) { let ch = false;
    for (const [id, main, alt] of [['C-S8', 'S8B', 'S8A'], ['C-LOCK', 'L180', 'L180W']]) { const e = LB.strategies.find(x => x.id === id), r = firstRun.results[main]; if (!e || !r || /^tested/.test(e.status || '')) continue; const R = r.results, a2 = firstRun.results[alt];
      e.agent = 'C'; e.status = 'tested: ' + r.verdict.toLowerCase() + (r.level !== 'NONE' ? ' (' + r.level + ')' : ''); e.tested = firstRun.to; e.study = 'share-supply.mjs -> data/share-supply.json (run once, first run frozen)';
      e.result = { version: main, level: r.level, t: R.newer.t, tOlder: R.older.t, edge: R.newer.edge, edgeOlder: R.older.edge, vsSpy: R.newer.vsSpy, vsOwn: R.newer.vsOwn, n: [R.older.n || 0, R.newer.n || 0], bar: firstRun.bar, why: main + ' ' + r.verdict + ': ' + r.why.split(';')[0] + (a2 ? ' | ' + alt + ' ' + a2.verdict + ' / ' + a2.level : '') }; ch = true; }
    if (ch) fs.writeFileSync('data/strategy-library.json', JSON.stringify(LB, null, 1)); } } catch (e) {}
})();
