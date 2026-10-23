// DISCOVERY ENGINE v2 (owner, 23 Oct 2026: "I want the system to come up with new paths by itself, not me pushing"). Research + a weekly
// live list; never places an order. Rules in discovery2-core.mjs (pure, tested in test/discovery2-core.test.mjs).
// 1. WHAT PRECEDED THE BIG MOVES. From the 5-year whole-market cache incl. dead stocks (study-cache/grouped.json.gz, read only):
//    every RUNNER = a tradable stock (3 USD+, 20-day dollar volume 2M USD+) whose close rose 25%+ over the next 10 sessions (R10), and
//    separately 50%+ over the next 60 sessions (R60); one runner per stock per window. ~65 features known at the close BEFORE the move
//    (discovery2-core FEATURES: price/volume shape, relative strength vs the market and the industry, gaps, 8-K items in 60 sessions
//    (ev-cache, New York session by sec-time.mjs), earnings surprises (data/earnings-cache.json.gz), insider buys (study-cache/insider),
//    point-in-time chain layers and their heat (data/chain-graph.json), offering / registration filings (EDGAR full index: cat-cache/idx +
//    study-cache/edgar-idx), share-count change (data/shares.json.gz), F-score (study-cache/fund.json.gz), tracked traders' bullish
//    mentions (data/follow-calls.jsonl + data/follow-board.json)). Compared with up to 3 MATCHED LOOK-ALIKES per runner: same session,
//    same price bucket, same dollar-volume bucket, same 2-digit SEC industry, that did NOT run.
// 2. DISCOVERY ON THE OLDER HALF ONLY: signals before 2024-01-01 whose whole forward window also ends before 2024-01-01. Single features
//    and 2-3 feature combinations ranked by the lower 95% bound of their lift (share among runners / share among look-alikes);
//    non-redundant. The first complete run FREEZES the ranked pool (100) and the top 10 as rules (entry next open, hold 10 or 60 sessions
//    matching the runner definition, stop 15%), writes them to data/discovery2.json and data/strategy-library.json BEFORE any newer-half
//    session is read.
// 3. TEST ON THE NEWER HALF ONLY (signals from 2024-01-01), each frozen rule ONCE, at the tier-2 standard (discovery2-core judgeNewer):
//    net positive after 0.8% and 1.2%, better than the average stock bought the same day with the same exit, better than the same stock on
//    its other newer-half days, positive without the 2 best trades, day t and block t >= the luck bar max(2.5, zInv(1 - 0.05/m)) where m =
//    rules tested so far (10 for the first batch). Same house gates in the test and live: no 15%+ one-day jump in the last 21 sessions, no
//    424B4/424B5 offering in the last 20 sessions. The first judged verdict of each rule is frozen (firstRun); later runs are monitoring.
// 4. COST REALITY (report only, changes no verdict): stored trades of other studies at 0.8% / 0.4% / 0.2% round trip.
// 5. LIVE: a rule at TRADABLE SMALL writes its signals at the last close to data/discovery2-today.json (scan.mjs shows them under
//    DISCOVERED in ACTIONS and logs them to data/tier2-ledger.jsonl as discovery:<id>).
// WEEKLY: a run at least 6 days after the last batch adds the next 10 UNTESTED rules of the frozen pool; the luck bar uses every rule
//    tested so far (counter testedTotal), so each new batch faces a higher bar. The pool itself is never re-learned.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { secNY } from './sec-time.mjs';
import { freezeEach, latestBlock } from './first-run.mjs';
import { tradingSessions, firstOnOrAfter } from './catalyst-core.mjs';
import * as K from './discovery2-core.mjs';
const env = process.env, OUT = env.OUT || 'data/discovery2.json', TODAY_OUT = env.TODAY_OUT || 'data/discovery2-today.json', LIB = env.LIB || 'data/strategy-library.json';
const CDIR = env.CACHE_DIR || 'study-cache', CATD = env.CAT_CACHE || 'cat-cache', START_D = 200, POOL = 100, BATCH = 10, T0 = Date.now();
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, gz = (f) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return null; } };
const JL = (f) => { try { return fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean); } catch (e) { return []; } };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null, r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4);
const pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(2) + '%';
const W = (f, o) => { fs.mkdirSync(f.replace(/\/[^/]+$/, '') || '.', { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 1)); };
const secs = () => Math.round((Date.now() - T0) / 1000);
const PREV = J(OUT, {}) || {};

// ---- 4. COST REALITY and the diagnosis (no price cache needed) ------------------------------------------------------------------------
function costRows() {
  const rows = [], add = (x) => rows.push(x);
  for (const [src, f] of [['catalyst-lab', 'data/catalyst-lab.json'], ['chain-decoder', 'data/chain-decoder.json']]) { const o = J(f, null); if (!o || !o.trades) continue;
    for (const [rule, tr] of Object.entries(o.trades)) { const v = tr.filter(z => typeof z.net === 'number'); if (!v.length) continue; const g = v.map(z => z.net + 0.008), eg = v.filter(z => typeof z.avgStock === 'number');
      add({ source: src, rule, verdict: o.results && o.results[rule] && o.results[rule].verdict, gross: g, edgeGross: eg.length ? mean(eg.map(z => z.net + 0.008 - z.avgStock)) : null }); } }
  { const o = J('data/ignition-results.json', null), by = {}; for (const v of Object.values((o && o.done) || {})) if (typeof v.close === 'number' && typeof v.close_s === 'number') (by[v.rule] = by[v.rule] || []).push(v.close + 2 * (v.close - v.close_s));
    for (const [rule, g] of Object.entries(by)) add({ source: 'ignition-results', rule, name: 'fast alert ' + rule + ' (paper, sold at the close; own cost model 1.2-2.1%)', gross: g }); }
  const halves = (src, id, name, verdict, R) => { if (!R) return; const H = ['older', 'newer'].map(k => R[k]).filter(h => h && typeof h.avg === 'number' && h.n > 0); if (!H.length) return; const n = H.reduce((a, h) => a + h.n, 0);
    const eg = H.every(h => typeof h.edge === 'number') ? H.reduce((a, h) => a + (h.edge + 0.008) * h.n, 0) / n : null;
    add({ source: src, rule: id, name, verdict, avgGross: H.reduce((a, h) => a + (h.avg + 0.008) * h.n, 0) / n, n, edgeGross: eg }); };
  { const o = J('data/swing-lab.json', null), R = (o && ((o.firstRun && o.firstRun.results) || o.results)) || {}; for (const [k, r] of Object.entries(R)) halves('swing-lab', k, r.name, r.verdict, r.results); }
  { const o = J('data/chain-ripple.json', null), R = (o && ((o.firstRun && o.firstRun.results) || o.results)) || {}; for (const [k, r] of Object.entries(R)) halves('chain-ripple', k, r.name, r.verdict, r.results); }
  { const o = J('data/earnings-study.json', null); for (const [k, r] of Object.entries((o && o.results) || {})) halves('earnings-study', k, 'earnings drift (' + k + ')', o.verdict, r); }
  { const o = J('data/leaders-study.json', null); for (const r of (o && o.rows) || []) { const b = r.test && r.test.base; if (b && typeof b.avg === 'number' && b.n > 0) add({ source: 'leaders-study', rule: r.key, name: 'leaders ' + r.key + ' (newer-half test)', verdict: r.key === o.chosen ? o.verdict : null, avgGross: b.avg + 0.008, n: b.n }); } }
  { const o = J('data/autolab.json', null); for (const [id, r] of Object.entries((o && o.tried) || {})) { const d = r.discovery; if (d && typeof d.avg === 'number' && d.n >= 40) add({ source: 'autolab', rule: id, name: r.name, verdict: r.verdict, avgGross: d.avg + 0.008, n: d.n, edgeGross: typeof d.edge === 'number' ? d.edge + 0.008 : null }); } }
  return rows;
}
function costBlock() {
  const rows = K.costReality(costRows()), by = {};
  for (const r of rows) { const s = by[r.source] = by[r.source] || { rules: 0, trades: 0, positiveAt08: 0, positiveAt04: 0, positiveAt02: 0, flips: 0, edgeFlips: 0 };
    s.rules++; s.trades += r.n || 0; if (r.at08 > 0) s.positiveAt08++; if (r.at04 > 0) s.positiveAt04++; if (r.at02 > 0) s.positiveAt02++; if (r.flip) s.flips++; if (r.edgeFlip) s.edgeFlips++; }
  return { note: 'Report only: no verdict is changed. 0.8% = a 1,000 USD position with 3 USD fees each way (0.6%) plus about 0.2% spread; 0.4% = a 5,000 USD position (0.12% fees + spread); 0.2% = a zero-commission broker (spread only). The average after costs is exact for any cost (the mean shifts by the cost difference), so stored averages are used where a study keeps no per-trade list (method). "Edge" = vs the average stock bought the same day, which pays no cost in the house yardstick.',
    bySource: by, flips: rows.filter(r => r.flip || r.edgeFlip), rows: rows.filter(r => r.source !== 'autolab' || r.flip || r.edgeFlip) };
}
function diagnosis() {
  const days = JL('data/ignition-days.jsonl'), tally = {}; let movers = 0, alerts = 0, feedFix = 0, gapLike = 0, live = [];
  for (const d of days) { movers += d.movers || 0; alerts += d.alerts || 0; feedFix += d.feedFix || 0; gapLike += d.feedGapLike || 0; if (typeof d.liveRate === 'number') live.push(d.liveRate); for (const [k, v] of Object.entries(d.tally || {})) tally[k] = (tally[k] || 0) + v; }
  const B = J('data/follow-board.json', {}) || {};
  return { ignitionDays: { days: days.length, from: days[0] && days[0].day, to: days.length ? days[days.length - 1].day : null, movers, alerted: tally.ALERTED || 0, missed: movers - (tally.ALERTED || 0), alertsSent: alerts, tally, feedFixable: feedFix, feedGapLike: gapLike, liveRateAvg: r4(mean(live)) },
    followBoard: { at: B.generatedAt || null, screened: B.screened || 0, judged: B.judged || 0, counts: B.counts || {}, luck: B.luck || null, calls: B.calls || null } };
}

// ---- 1. prices (read only) -----------------------------------------------------------------------------------------------------------
let store = gz(env.CACHE || CDIR + '/grouped.json.gz');
const D = store && store.days ? Object.keys(store.days).sort() : [], T = D.length;
if (T < 600) {
  const out = { ...PREV, generatedAt: new Date().toISOString(), status: 'NO PRICE CACHE (' + T + ' sessions): nothing discovered or tested this run; earlier frozen results kept', costReality: costBlock(), diagnosis: diagnosis() };
  W(OUT, out); console.log('discovery2: ' + out.status); process.exit(0);
}
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T, Om = new Float32Array(N).fill(NaN), Hm = new Float32Array(N).fill(NaN), Lm = new Float32Array(N).fill(NaN), Cm = new Float32Array(N).fill(NaN), Vm = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
// merged series: the main rows (3 USD+, 1M USD+: the only rows an entry may use) and the x rows (a stock that fell out of the filter
// keeps its later prices, so features see its history and an exit or a stop sees its real fall)
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; Om[k] = x.o[j]; Hm[k] = x.h ? x.h[j] : x.c[j]; Lm[k] = x.l ? x.l[j] : x.c[j]; Cm[k] = x.c[j]; Vm[k] = x.v[j]; MAIN[k] = 1; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; Om[k] = x.x.o[j]; Hm[k] = x.x.h ? x.x.h[j] : x.x.c[j]; Lm[k] = x.x.l ? x.x.l[j] : x.x.c[j]; Cm[k] = x.x.c[j]; Vm[k] = x.x.v[j]; } });
const SIC = store.sic || {}; store = null;
const spyI = SY.get('SPY'), sic2 = SYMS.map(s => SIC[s] && SIC[s].c ? String(SIC[s].c).slice(0, 2) : null);
const tNew = firstOnOrAfter(D, K.SPLIT), last = D[T - 1];
console.log('discovery2: ' + NS + ' stocks, ' + T + ' sessions ' + D[0] + ' to ' + last + ', newer half from ' + D[tNew] + ' (' + secs() + 's)');

// ---- pass 0: tradable flags, dollar volume, 20/60-day returns for the cross-section --------------------------------------------------
const TR = new Uint8Array(N), LQ = new Uint8Array(N), DV = new Float32Array(N).fill(NaN), R20 = new Float32Array(N).fill(NaN), R60 = new Float32Array(N).fill(NaN);
for (let i = 0; i < NS; i++) { const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const c = Cm[b + t], v = Vm[b + t]; if (c > 0 && v >= 0) { s += c * v; n++; } if (t >= 20) { const c0 = Cm[b + t - 20], v0 = Vm[b + t - 20]; if (c0 > 0 && v0 >= 0) { s -= c0 * v0; n--; } }
    if (n >= 10) DV[b + t] = s / n; if (!MAIN[b + t] || i === spyI) continue; const dv = DV[b + t];
    if (c >= 3 && dv >= 1e6) LQ[b + t] = 1; if (c >= 3 && dv >= 2e6) TR[b + t] = 1;
    if (t >= 20 && Cm[b + t - 20] > 0) R20[b + t] = c / Cm[b + t - 20] - 1; if (t >= 60 && Cm[b + t - 60] > 0) R60[b + t] = c / Cm[b + t - 60] - 1; } }
const rsSorted = new Array(T), indMed = new Array(T);
for (let t = 0; t < T; t++) { const a = [], g = new Map(); for (let i = 0; i < NS; i++) { const k = i * T + t; if (!TR[k]) continue; if (isFinite(R60[k])) a.push(R60[k]); if (isFinite(R20[k]) && sic2[i]) (g.get(sic2[i]) || g.set(sic2[i], []).get(sic2[i])).push(R20[k]); }
  rsSorted[t] = Float32Array.from(a).sort(); const m = new Map(); for (const [k, v] of g) if (v.length >= 5) { v.sort((x, y) => x - y); m.set(k, v[v.length >> 1]); } indMed[t] = m; }
const spyC = (t) => spyI === undefined ? NaN : Cm[spyI * T + t], spyR = (t, k) => t >= k && spyC(t - k) > 0 ? spyC(t) / spyC(t - k) - 1 : NaN;
const spyA200 = new Float32Array(T).fill(NaN); for (let t = 199; t < T; t++) { let s = 0, n = 0; for (let k = t - 199; k <= t; k++) if (spyC(k) > 0) { s += spyC(k); n++; } if (n >= 180) spyA200[t] = spyC(t) > s / n ? 1 : 0; }
console.log('discovery2: pass 0 done (' + secs() + 's)');

// ---- side data (each optional; what is missing is reported and its features stay unknown) -------------------------------------------
const SRC = {}, sessOf = (p, afterCloseNext = true) => { const x = secNY(p); if (!x) return null; let s = firstOnOrAfter(D, x.d); if (afterCloseNext && x.hm && x.hm >= '16:00' && D[s] === x.d) s++; return s < T ? s : null; };
const EVd = gz(env.EV_CACHE || 'ev-cache/events-cache.json.gz'); SRC.secEvents = EVd && EVd.syms ? Object.values(EVd.syms).filter(S => S.old).length + ' companies with full SEC history' : null;
const FAMF = { CONTRACT: 'eCon', ACQUIRED: 'eAcq', EARN: 'eEarn', MGMT: 'eMgmt', NEWS: 'eNews', BIO_NEWS: 'eNews', DILUTION: 'eDil', DELIST: 'eDel', RESTRUCTURE: 'eRes', ACTIVIST: 'eAct', FDA_APPROVAL: 'eFda', FDA_NEW_USE: 'eFda', CONTRACT_END: 'eNeg', AUDITOR: 'eNeg', RESTATE: 'eNeg' };
const ES = gz(env.EARN || 'data/earnings-cache.json.gz'); SRC.earnings = ES && ES.syms ? Object.keys(ES.syms).length + ' companies' : null;
const INS = new Map(); { let n = 0; try { for (const f of fs.readdirSync(CDIR + '/insider').filter(f => f.endsWith('.json'))) for (const b of J(CDIR + '/insider/' + f, [])) { if (!SY.has(b[0])) continue; const s = firstOnOrAfter(D, String(b[1]).slice(0, 10)); if (s >= T) continue; (INS.get(b[0]) || INS.set(b[0], []).get(b[0])).push([s, b[2]]); n++; } } catch (e) {} SRC.insider = n ? n + ' purchase filings' : null; }
const SH = gz(env.SHARES || 'data/shares.json.gz'); SRC.shares = SH && SH.t ? Object.keys(SH.t).length + ' tickers' : null;
const cikOf = (s) => SH && SH.t ? (SH.t[s] || SH.t[s.replace(/\./g, '-')] || null) : null;
const IDX = new Map(); { let q1 = 0, q2 = 0; const symsByCik = new Map(); if (SH && SH.t) for (const [s, c] of Object.entries(SH.t)) if (SY.has(s)) (symsByCik.get(+c) || symsByCik.set(+c, []).get(+c)).push(s);
  const addRows = (rows) => { for (const [cik, form, d] of rows || []) { const ss = symsByCik.get(+cik); if (!ss) continue; const s = firstOnOrAfter(D, d); if (s >= T) continue; const kind = form === '424B4' || form === '424B5' ? 'off' : form === 'S-8' ? 's8' : /^S-[13]/.test(form) ? 'shelf' : null; if (!kind) continue; for (const sym of ss) (IDX.get(sym) || IDX.set(sym, []).get(sym)).push([s, kind]); } };
  try { for (const f of fs.readdirSync(CATD + '/idx').filter(f => /^\d{4}Q\d\.json$/.test(f))) { addRows(J(CATD + '/idx/' + f, [])); q1++; } } catch (e) {}
  try { for (const f of fs.readdirSync(CDIR + '/edgar-idx').filter(f => /^\d{4}Q\d\.json$/.test(f))) { addRows(J(CDIR + '/edgar-idx/' + f, [])); q2++; } } catch (e) {}
  SRC.edgarIndex = q1 && q2 ? q1 + ' quarters (424B5, S-1, S-3) + ' + q2 + ' quarters (424B4, S-8)' : null; SRC.edgarIndexParts = { catCache: q1, studyCache: q2 }; }
const FUND = gz(env.FUND_CACHE || CDIR + '/fund.json.gz'); SRC.fund = FUND && FUND.v ? Object.keys(FUND.v).length + ' companies' : null;
const GRAPH = J(env.CHAIN_GRAPH || 'data/chain-graph.json', null); SRC.chainGraph = GRAPH && GRAPH.chains ? (GRAPH.counts && GRAPH.counts.pointInTime) + ' point-in-time memberships' : null;
const BOARD = J('data/follow-board.json', {}) || {}, tracked = new Set((BOARD.traders || []).filter(t => t.level === 'FOLLOW' || t.level === 'WATCH').map(t => t.tr));
const FOL = new Map(); let folStart = null; { const calls = JL('data/follow-calls.jsonl').filter(c => c.bull === 1 && tracked.has(c.tr) && SY.has(c.sym)), byM = {};
  for (const c of calls) { const s = sessOf(c.pub); if (s === null) continue; (FOL.get(c.sym) || FOL.set(c.sym, []).get(c.sym)).push(s); byM[String(c.pub).slice(0, 7)] = (byM[String(c.pub).slice(0, 7)] || 0) + 1; }
  const m0 = Object.keys(byM).sort().find(m => byM[m] >= 100); folStart = m0 ? firstOnOrAfter(D, m0 + '-01') : null; SRC.follow = calls.length ? calls.length + ' bullish calls by ' + tracked.size + ' tracked traders, known from ' + (folStart !== null ? D[folStart] : 'n/a') : null; }
// chain layers: point-in-time members, daily layer excess return (63 sessions) vs the S&P 500, top 3 = hot
const LAY = [], memberOf = new Map(); if (GRAPH && GRAPH.chains) for (const [chain, g] of Object.entries(GRAPH.chains)) for (const L of g.layers || []) { const m = (L.members || []).filter(x => x.status === 'point-in-time' && x.since && SY.has(x.sym)).map(x => ({ i: SY.get(x.sym), s0: firstOnOrAfter(D, x.since) })); if (!m.length) continue; const li = LAY.length; LAY.push({ key: chain + '|' + L.layer, m }); for (const x of m) (memberOf.get(x.i) || memberOf.set(x.i, []).get(x.i)).push({ li, s0: x.s0 }); }
const LEX = new Float32Array(LAY.length * T).fill(NaN), LHOT = new Uint8Array(LAY.length * T);
for (let t = 63; t < T; t++) { const sp = spyR(t, 63), ex = []; LAY.forEach((L, li) => { const v = []; for (const x of L.m) { if (x.s0 > t) continue; const a = Cm[x.i * T + t - 63], c = Cm[x.i * T + t]; if (a > 0 && c > 0) v.push(c / a - 1); } if (v.length >= 3 && isFinite(sp)) { LEX[li * T + t] = mean(v) - sp; ex.push([li, mean(v) - sp]); } });
  ex.sort((a, b) => b[1] - a[1]); for (const [li] of ex.slice(0, 3)) LHOT[li * T + t] = 1; }
// F-score (the quality.mjs formula), latest 10-K year public on the day (100 days after Dec 31)
const knownY = (d) => { const y = +d.slice(0, 4); return d.slice(5) >= '04-10' ? y - 1 : y - 2; };
const shAtYE = (cik, y) => { const a = SH && SH.c && SH.c[cik]; if (!a) return null; let v = null; for (const [e, n] of a) if (e <= y + '-12-31' && e >= y + '-07-01') v = n; return v; };
const okn = (...v) => v.every(u => typeof u === 'number' && isFinite(u));
function fscore(cik, y) { const c = FUND && FUND.v && FUND.v[cik]; if (!c || !c[y] || !c[y - 1] || !c[y - 2]) return null; const a = c[y], b = c[y - 1], z = c[y - 2];
  if (!okn(a.ni, b.ni, a.cfo, a.ltd, b.ltd, a.acur, b.acur, a.gp, b.gp) || !(a.assets > 0 && b.assets > 0 && z.assets > 0) || !(a.lcur > 0 && b.lcur > 0)) return null;
  const rk = okn(a.rev, b.rev) ? 'rev' : okn(a.rev2, b.rev2) ? 'rev2' : null; if (!rk || !(a[rk] > 0 && b[rk] > 0)) return null; const s1 = shAtYE(cik, y), s0 = shAtYE(cik, y - 1); if (!(s1 > 0 && s0 > 0)) return null;
  return [a.ni > 0, a.cfo > 0, a.ni / b.assets > b.ni / z.assets, a.cfo > a.ni, a.ltd / ((a.assets + b.assets) / 2) < b.ltd / ((b.assets + z.assets) / 2), a.acur / a.lcur > b.acur / b.lcur, s1 <= s0, a.gp / a[rk] > b.gp / b[rk], a[rk] / b.assets > b[rk] / z.assets].filter(Boolean).length; }
const REQUIRED = ['secEvents', 'earnings', 'insider', 'edgarIndex', 'fund', 'chainGraph', 'shares'], missing = REQUIRED.filter(k => !SRC[k]);
const complete = !missing.length || env.D2_ALLOW_MISSING === '1';
console.log('discovery2: sources ' + JSON.stringify(SRC) + (missing.length ? ' | MISSING ' + missing.join(', ') : '') + ' (' + secs() + 's)');

// ---- the feature series of one stock (every feature at every tradable session; unknown = NaN) -----------------------------------------
const NF = K.FEATURES.length, FX = K.FIDX, FV = new Float32Array(NF * T);
const cs = new Float64Array(T), os = new Float64Array(T), hs = new Float64Array(T), ls = new Float64Array(T), vs = new Float64Array(T), dr = new Float64Array(T);
const pre = () => ({ s: new Float64Array(T + 1), q: new Float64Array(T + 1), n: new Float64Array(T + 1) }), PC = pre(), PV = pre(), PD = pre(), PR = pre(), PU = pre(), PUV = pre(), PVD = pre(), PGU = pre(), PGD = pre();
const fill = (P, f) => { for (let t = 0; t < T; t++) { const x = f(t), ok = x !== null && isFinite(x); P.s[t + 1] = P.s[t] + (ok ? x : 0); P.q[t + 1] = P.q[t] + (ok ? x * x : 0); P.n[t + 1] = P.n[t] + (ok ? 1 : 0); } };
const wMean = (P, t, w, mn) => { const a = Math.max(0, t + 1 - w), n = P.n[t + 1] - P.n[a]; return n >= mn ? (P.s[t + 1] - P.s[a]) / n : NaN; };
const wSum = (P, t, w) => { const a = Math.max(0, t + 1 - w); return P.s[t + 1] - P.s[a]; };
const wStd = (P, t, w, mn) => { const a = Math.max(0, t + 1 - w), n = P.n[t + 1] - P.n[a]; if (n < mn) return NaN; const m = (P.s[t + 1] - P.s[a]) / n, v = (P.q[t + 1] - P.q[a]) / n - m * m; return Math.sqrt(Math.max(0, v)); };
const HI = new Float64Array(T), LO = new Float64Array(T), dq = new Int32Array(T);
function rollExt(src, w, isMax, out) { let h = 0, tl = 0; for (let t = 0; t < T; t++) { const x = src[t]; if (x > 0) { while (tl > h && (isMax ? src[dq[tl - 1]] <= x : src[dq[tl - 1]] >= x)) tl--; dq[tl++] = t; } while (tl > h && dq[h] <= t - w) h++; out[t] = tl > h ? src[dq[h]] : NaN; } }
function windowCounts(list, w) { const mark = new Float64Array(T + 1); for (const s of list) if (s >= 0 && s < T) mark[s + 1] += 1; for (let t = 1; t <= T; t++) mark[t] += mark[t - 1]; return (t) => mark[t + 1] - mark[Math.max(0, t + 1 - w)]; }
function featureSeries(i, only) {   // only: null = every tradable session, else a Set of sessions
  FV.fill(NaN); const b = i * T, sym = SYMS[i]; let first = -1;
  for (let t = 0; t < T; t++) { cs[t] = Cm[b + t] > 0 ? Cm[b + t] : NaN; os[t] = Om[b + t] > 0 ? Om[b + t] : NaN; hs[t] = Hm[b + t]; ls[t] = Lm[b + t]; vs[t] = Vm[b + t] >= 0 ? Vm[b + t] : NaN; dr[t] = t && cs[t] > 0 && cs[t - 1] > 0 ? cs[t] / cs[t - 1] - 1 : NaN; if (first < 0 && cs[t] > 0) first = t; }
  fill(PC, t => cs[t]); fill(PV, t => vs[t]); fill(PD, t => dr[t]); fill(PR, t => cs[t] > 0 && hs[t] >= ls[t] ? (hs[t] - ls[t]) / cs[t] : NaN);
  fill(PU, t => isFinite(dr[t]) ? (dr[t] > 0 ? 1 : 0) : NaN); fill(PUV, t => isFinite(dr[t]) && vs[t] >= 0 ? (dr[t] > 0 ? vs[t] : 0) : NaN); fill(PVD, t => isFinite(dr[t]) && vs[t] >= 0 ? vs[t] : NaN);
  fill(PGU, t => t && os[t] > 0 && cs[t - 1] > 0 ? (os[t] / cs[t - 1] - 1 >= 0.05 ? 1 : 0) : NaN); fill(PGD, t => t && os[t] > 0 && cs[t - 1] > 0 ? (os[t] / cs[t - 1] - 1 <= -0.05 ? 1 : 0) : NaN);
  rollExt(cs, 252, true, HI); rollExt(cs, 252, false, LO);
  // events, earnings, insiders, supply, follow (window counts per family)
  const S = EVd && EVd.syms ? EVd.syms[sym] : null, evOk = !!(S && S.old), fam = {}; if (evOk) { const all = []; for (const e of S.ev || []) { const s = sessOf(e.p); if (s === null) continue; all.push(s); for (const f of String(e.f).split(',')) { const k = FAMF[f]; if (k) (fam[k] = fam[k] || []).push(s); } } fam.eAll = all; }
  const evC = {}; if (evOk) for (const k of ['eAll', 'eCon', 'eAcq', 'eEarn', 'eMgmt', 'eNews', 'eDil', 'eDel', 'eRes', 'eAct', 'eFda', 'eNeg']) evC[k] = windowCounts(fam[k] || [], 60);
  const ER = ES && ES.syms && ES.syms[sym] ? ES.syms[sym].filter(x => x && x.d && typeof x.a === 'number' && typeof x.e === 'number').map(x => { let s = firstOnOrAfter(D, x.d); if (x.t !== 'bmo' && D[s] === x.d) s++; return { s, sur: (x.a - x.e) / Math.max(Math.abs(x.e), 0.01), beat: x.a > x.e ? 1 : 0 }; }).filter(x => x.s < T).sort((a, b) => a.s - b.s) : null;
  const ins = INS.get(sym) || [], insC = windowCounts(ins.map(x => x[0]), 60), insOk = SRC.insider !== null;
  const idx = IDX.get(sym) || [], idxOk = !!SRC.edgarIndex && !!cikOf(sym), offC = windowCounts(idx.filter(x => x[1] === 'off').map(x => x[0]), 60), shC = windowCounts(idx.filter(x => x[1] === 'shelf').map(x => x[0]), 60), s8C = windowCounts(idx.filter(x => x[1] === 's8').map(x => x[0]), 60), off20 = windowCounts(idx.filter(x => x[1] === 'off').map(x => x[0]), 20);
  const fol = FOL.get(sym) || [], f10 = windowCounts(fol, 10), f60 = windowCounts(fol, 60);
  const cik = cikOf(sym), shA = cik && SH && SH.c ? SH.c[cik] : null, lag = SH ? (+SH.lagDays || 30) * 864e5 : 0;
  const shK = (ms) => { if (!shA) return null; const lim = new Date(ms - lag).toISOString().slice(0, 10); let v = null; for (const [d, n] of shA) { if (d <= lim) v = n; else break; } return v; };
  const fsC = {}, mem = memberOf.get(i) || [];
  let ei = -1, streak = 0;
  for (let t = 0; t < T; t++) {
    streak = dr[t] > 0 ? Math.min(10, streak + 1) : isFinite(dr[t]) ? 0 : streak; if (ER) while (ei + 1 < ER.length && ER[ei + 1].s <= t) ei++;
    if (!TR[b + t] || (only && !only.has(t))) continue; const c = cs[t], put = (k, v) => { FV[FX[k] * T + t] = v === null || v === undefined || !isFinite(v) ? NaN : v; }, ret = (k) => t >= k && cs[t - k] > 0 ? c / cs[t - k] - 1 : NaN;
    const r20 = ret(20), r60 = ret(60), sm = (w) => wMean(PC, t, w, Math.ceil(w * 0.9));
    put('r1', ret(1)); put('r5', ret(5)); put('r20', r20); put('r60', r60); put('r120', ret(120));
    const s20 = sm(20), s50 = sm(50), s200 = sm(200); put('sma20', c / s20 - 1); put('sma50', c / s50 - 1); put('sma200', c / s200 - 1); put('s50v200', s50 / s200 - 1);
    const n252 = PC.n[t + 1] - PC.n[Math.max(0, t - 251)]; if (n252 >= 200) { put('hi52', c / HI[t] - 1); put('lo52', c / LO[t] - 1); }
    { let mx = -Infinity, mn = Infinity, n = 0; for (let k = Math.max(0, t - 19); k <= t; k++) if (cs[k] > 0) { n++; if (cs[k] > mx) mx = cs[k]; if (cs[k] < mn) mn = cs[k]; } if (n >= 15) { put('hi20', c / mx - 1); put('rng20', (mx - mn) / c); } }
    put('volC', wStd(PD, t, 10, 9) / wStd(PD, t, 60, 50)); put('vol20', wStd(PD, t, 20, 18)); put('atrC', wMean(PR, t, 10, 9) / wMean(PR, t, 60, 50));
    const v50 = wMean(PV, t, 50, 40); if (v50 > 0) { put('vDry', wMean(PV, t, 10, 9) / v50); put('vNow', vs[t] / v50); put('v3', wMean(PV, t, 3, 3) / v50); }
    { const v60 = wMean(PV, t, 60, 50); if (v60 > 0) put('vTrend', wMean(PV, t, 20, 18) / v60); }
    { const tv = wSum(PVD, t, 20); if (tv > 0 && PVD.n[t + 1] - PVD.n[Math.max(0, t - 19)] >= 15) put('upVol', wSum(PUV, t, 20) / tv); }
    put('dv20', Math.log10(DV[b + t])); put('px', Math.log10(c)); put('rsM20', r20 - spyR(t, 20)); put('rsM60', r60 - spyR(t, 60));
    if (isFinite(R60[b + t])) { const a = rsSorted[t]; let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < R60[b + t]) lo = m + 1; else hi = m; } if (a.length > 50) put('rsPct', lo / (a.length - 1)); }
    if (sic2[i] && indMed[t].has(sic2[i])) put('rsInd', r20 - indMed[t].get(sic2[i]));
    if (PGU.n[t + 1] - PGU.n[Math.max(0, t - 59)] >= 50) { put('gapUp60', wSum(PGU, t, 60)); put('gapDn60', wSum(PGD, t, 60)); }
    put('gap', t && cs[t - 1] > 0 ? os[t] / cs[t - 1] - 1 : NaN); put('upD20', wMean(PU, t, 20, 15)); put('clv', hs[t] > ls[t] ? (c - ls[t]) / (hs[t] - ls[t]) : 0.5); put('streak', streak);
    { let mx = -Infinity, mn = Infinity, n = 0; for (let k = Math.max(1, t - 19); k <= t; k++) if (isFinite(dr[k])) { n++; if (dr[k] > mx) mx = dr[k]; if (dr[k] < mn) mn = dr[k]; } if (n >= 15) { put('bigUp', mx); put('bigDn', mn); } }
    put('age', Math.min(252, t - first)); put('spy200', spyA200[t]); put('spyR20', spyR(t, 20));
    if (evOk) for (const [k, f] of Object.entries(evC)) put(k, f(t));
    if (ER && ei >= 0) { const L = ER.slice(Math.max(0, ei - 3), ei + 1); put('surp', Math.max(-5, Math.min(5, ER[ei].sur))); if (L.length === 4) put('beats4', L.reduce((a, x) => a + x.beat, 0)); put('sinceE', t - ER[ei].s); }
    if (insOk) { put('ins60', insC(t)); const ws = new Set(ins.filter(x => x[0] <= t && x[0] > t - 60).map(x => x[1])); put('insW', ws.size); }
    if (GRAPH) { let m = 0, hot = 0, ex = -Infinity; for (const x of mem) { if (x.s0 > t) continue; m = 1; if (LHOT[x.li * T + t]) hot = 1; const e = LEX[x.li * T + t]; if (isFinite(e) && e > ex) ex = e; } put('chain', m); put('chainHot', hot); if (ex > -Infinity) put('chainEx', ex); }
    if (idxOk) { put('off60', offC(t)); put('shelf60', shC(t)); put('s8', s8C(t)); }
    if (shA) { const ms = Date.parse(D[t]), n1 = shK(ms), n0 = shK(ms - 90 * 864e5); if (n1 > 0 && n0 > 0) put('shChg', n1 / n0 - 1); }
    if (cik && FUND) { const y = knownY(D[t]); if (!(y in fsC)) fsC[y] = fscore(cik, y); if (fsC[y] !== null) put('fscore', fsC[y]); }
    if (folStart !== null && t >= folStart) { put('fol10', f10(t)); put('fol60', f60(t)); }
  }
  return { off20: idxOk ? off20 : null };
}
const vecAt = (t) => { const v = new Float32Array(NF); for (let j = 0; j < NF; j++) v[j] = FV[j * T + t]; return v; };
// a close after t+h that is missing (stock left the data) -> the last known close inside the window
const closeAt = (b, t, h) => { for (let k = t + h; k > t; k--) if (Cm[b + k] > 0) return Cm[b + k]; return null; };
const lotteryAt = (b, t) => { for (let k = Math.max(1, t - 20); k <= t; k++) { const a = Cm[b + k - 1], z = Cm[b + k]; if (a > 0 && z > 0 && z / a - 1 >= 0.15) return true; } return false; };
const hsh = (q) => { let h = 2166136261; for (let k = 0; k < q.length; k++) { h ^= q.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; };

(async () => {
  let state = { pool: PREV.pool || null, frozenAt: PREV.frozenAt || null, batches: PREV.batches || [], discovery: PREV.discovery || null };
  // ---- 1+2. discovery on the older half, once (the first complete run freezes the pool) ----
  if (!state.pool && complete) {
    const defs = {}, sampleAt = new Map(), runnersByYear = {}, funnel = {};
    for (const [def, R] of Object.entries(K.RUNNERS)) { const runners = [], need = new Map(); funnel[def] = { runners: 0, matchedRunners: 0, controls: 0 };
      for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let free = 0;
        for (let t = START_D; t + R.h < T && D[t + R.h] < K.SPLIT; t++) { if (t < free || !TR[b + t] || !(Om[b + t + 1] > 0)) continue; const e = closeAt(b, t, R.h); if (e === null || !(e / Cm[b + t] - 1 >= R.rise)) continue;
          const key = t + '|' + (Cm[b + t] < 5 ? 0 : Cm[b + t] < 10 ? 1 : Cm[b + t] < 20 ? 2 : Cm[b + t] < 50 ? 3 : 4) + '|' + (DV[b + t] < 5e6 ? 0 : DV[b + t] < 2e7 ? 1 : DV[b + t] < 1e8 ? 2 : 3) + '|' + (sic2[i] || 'NA');
          runners.push({ i, t, key }); (need.get(key) || need.set(key, { n: 0, c: [] }).get(key)).n += 3; free = t + R.h; runnersByYear[def + ' ' + D[t].slice(0, 4)] = (runnersByYear[def + ' ' + D[t].slice(0, 4)] || 0) + 1; } }
      // look-alikes: same session, price bucket, dollar-volume bucket and 2-digit industry; did not run; the lowest-hash candidates are kept (fixed, repeatable)
      for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T;
        for (let t = START_D; t + R.h < T && D[t + R.h] < K.SPLIT; t++) { if (!TR[b + t] || !(Om[b + t + 1] > 0)) continue;
          const key = t + '|' + (Cm[b + t] < 5 ? 0 : Cm[b + t] < 10 ? 1 : Cm[b + t] < 20 ? 2 : Cm[b + t] < 50 ? 3 : 4) + '|' + (DV[b + t] < 5e6 ? 0 : DV[b + t] < 2e7 ? 1 : DV[b + t] < 1e8 ? 2 : 3) + '|' + (sic2[i] || 'NA'), g = need.get(key); if (!g) continue;
          const e = closeAt(b, t, R.h); if (e === null || e / Cm[b + t] - 1 >= R.rise) continue; const hv = hsh(def + SYMS[i] + t);
          if (g.c.length < g.n) g.c.push([hv, i, t]); else { let w = 0; for (let q = 1; q < g.c.length; q++) if (g.c[q][0] > g.c[w][0]) w = q; if (hv < g.c[w][0]) g.c[w] = [hv, i, t]; } } }
      const controls = []; for (const g of need.values()) for (const [, i, t] of g.c) controls.push({ i, t });
      funnel[def] = { runners: runners.length, groups: need.size, groupsWithLookAlikes: [...need.values()].filter(g => g.c.length).length, controls: controls.length };
      defs[def] = { runners: [], controls: [], h: R.h, R: runners, C: controls };
      for (const x of runners) (sampleAt.get(x.i) || sampleAt.set(x.i, []).get(x.i)).push([x.t, def, 'runners']);
      for (const x of controls) (sampleAt.get(x.i) || sampleAt.set(x.i, []).get(x.i)).push([x.t, def, 'controls']);
      console.log('discovery2: ' + def + ' ' + runners.length + ' runners, ' + controls.length + ' look-alikes (' + secs() + 's)'); }
    for (const [i, L] of sampleAt) { featureSeries(i, new Set(L.map(x => x[0]))); for (const [t, def, kind] of L) defs[def][kind].push(vecAt(t)); }
    console.log('discovery2: features for ' + sampleAt.size + ' stocks (' + secs() + 's)');
    const out = K.discover(Object.fromEntries(Object.entries(defs).map(([k, d]) => [k, { runners: d.runners, controls: d.controls, h: d.h }])), { top: BATCH, pool: POOL, minRunners: 40 });
    const pool = out.pool.map((r, k) => { const id = 'D2-' + String(k + 1).padStart(3, '0'); const x = { id, def: r.def, hold: r.hold, stop: r.stop, entry: r.entry, conds: r.conds, lift: r.lift, liftLow: r.liftLow, shareRunners: r.shareRunners, shareControls: r.shareControls, runnersWith: r.runnersWith, runnersKnown: r.runnersKnown, controlsWith: r.controlsWith, controlsKnown: r.controlsKnown }; x.spec = K.ruleText(x); return x; });
    // average feature value among runners vs look-alikes (information for the report)
    const featTable = {}; for (const [def, d] of Object.entries(defs)) featTable[def] = K.FEATURES.map((F, j) => { const a = d.runners.map(v => v[j]).filter(isFinite), c = d.controls.map(v => v[j]).filter(isFinite); return { k: F.k, runnersKnown: a.length, runnersMedian: r4(a.sort((x, y) => x - y)[a.length >> 1]), lookAlikesMedian: r4(c.sort((x, y) => x - y)[c.length >> 1]) }; });
    state = { pool, frozenAt: new Date().toISOString(), batches: [{ n: 1, at: new Date().toISOString(), ...K.nextBatch(pool, [], BATCH) }],
      discovery: { window: [D[START_D], K.SPLIT + ' (signals and their whole forward window before this day)'], funnel, runnersByYear, coverage: out.coverage, topSingles: out.singles, featureMedians: featTable, conditionsTried: out.conds.length, combinationsKept: out.candidates, sources: SRC } };
    // FREEZE BEFORE THE NEWER HALF: specs to the output and the library now; nothing after 2024-01-01 has been read yet
    W(OUT, { ...PREV, generatedAt: new Date().toISOString(), status: 'FROZEN, newer half not yet tested', ...state, results: PREV.results || {}, firstRun: PREV.firstRun || null });
    libraryWrite(state, PREV.firstRun ? PREV.firstRun.results : {});
    console.log('discovery2: FROZE ' + pool.length + ' candidate rules (' + BATCH + ' in batch 1) before the newer half (' + secs() + 's)');
  } else if (state.pool && complete) {
    const lastB = state.batches[state.batches.length - 1], tested = state.batches.flatMap(b => b.ids);
    if (!lastB || Date.now() - Date.parse(lastB.at) >= 6 * 864e5) { const nb = K.nextBatch(state.pool, tested, BATCH); if (nb) { state.batches.push({ n: state.batches.length + 1, at: new Date().toISOString(), ...nb }); console.log('discovery2: weekly batch ' + state.batches.length + ': ' + nb.ids.join(', ') + ', luck bar ' + nb.bar + ' (' + nb.testedTotal + ' rules tested in all)'); } }
  }
  if (!state.pool) { const out = { ...PREV, generatedAt: new Date().toISOString(), status: 'DATA LOADING: missing ' + missing.join(', ') + ' (nothing frozen; the next run tries again)', sources: SRC, costReality: costBlock(), diagnosis: diagnosis() }; W(OUT, out); console.log('discovery2: ' + out.status); return; }

  // ---- 3. the newer half: each rule in a batch, at its batch's luck bar ----
  const batchOf = new Map(); for (const b of state.batches) for (const id of b.ids) batchOf.set(id, b);
  const rules = state.pool.filter(r => batchOf.has(r.id)), trades = Object.fromEntries(rules.map(r => [r.id, []])), live = Object.fromEntries(rules.map(r => [r.id, []]));
  const ctrlC = new Map(), ctrl = (t, h) => { const key = t * 100 + h; if (ctrlC.has(key)) return ctrlC.get(key); const v = []; for (let i = 0; i < NS; i += 2) { if (!LQ[i * T + t]) continue; const g = K.holdReturn(Om, Lm, Cm, i * T, t, h, K.STOP, T); if (g !== null && Math.abs(g) < 3) v.push(g); } const m = v.length >= 30 ? mean(v) : null; ctrlC.set(key, m); return m; };
  const ownL = new Map(), own = (i, t, h) => { const key = i + '_' + h; let L = ownL.get(key); if (!L) { L = []; for (let k = tNew; k + h < T; k += 2) if (LQ[i * T + k]) { const g = K.holdReturn(Om, Lm, Cm, i * T, k, h, K.STOP, T); if (g !== null && Math.abs(g) < 3) L.push([k, g]); } ownL.set(key, L); }
    const v = L.filter(x => Math.abs(x[0] - t) > h).map(x => x[1]); return v.length >= 20 ? mean(v) : null; };
  const gateFunnel = Object.fromEntries(rules.map(r => [r.id, { fired: 0, lottery: 0, offering: 0, busy: 0, noExit: 0, traded: 0 }]));
  for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let anyTR = false; for (let t = tNew; t < T; t++) if (TR[b + t]) { anyTR = true; break; } if (!anyTR) continue;
    const ex = featureSeries(i, null);
    for (const r of rules) { let free = 0; const F = gateFunnel[r.id];
      for (let t = tNew; t < T; t++) { if (!TR[b + t]) continue; let on = true; for (const c of r.conds) { const x = FV[FX[c.f] * T + t], e = 1e-6 * Math.max(1, Math.abs(c.x)); if (!(isFinite(x) && (c.op === '>=' ? x >= c.x - e : x <= c.x + e))) { on = false; break; } } if (!on) continue; F.fired++;
        if (lotteryAt(b, t)) { F.lottery++; continue; } if (ex.off20 && ex.off20(t) > 0) { F.offering++; continue; }
        if (t === T - 1) { live[r.id].push({ sym: SYMS[i], lastClose: r4(Cm[b + t]), features: r.conds.map(c => c.f + ' ' + r4(FV[FX[c.f] * T + t])).join(', ') }); continue; }
        if (t < free) { F.busy++; continue; } const g = K.holdReturn(Om, Lm, Cm, b, t, r.hold, K.STOP, T), c0 = g === null ? null : ctrl(t, r.hold); if (g === null || c0 === null || Math.abs(g) > 3) { F.noExit++; continue; }
        trades[r.id].push({ t, s: SYMS[i], g, c: c0, ob: own(i, t, r.hold), h: r.hold, stopped: Math.abs(g + K.STOP) < 1e-6 || g < -K.STOP }); F.traded++; free = t + r.hold; } } }
  console.log('discovery2: newer-half test done (' + secs() + 's)');
  const RES = {}; for (const r of rules) { const b = batchOf.get(r.id), j = K.judgeNewer(trades[r.id], b.bar); RES[r.id] = { name: r.spec, def: r.def, batch: b.n, bar: b.bar, verdict: j.verdict, why: j.why, newer: j.stat, funnel: gateFunnel[r.id], window: [D[tNew], D[Math.max(tNew, T - 1 - r.hold)]] }; }
  const FR = freezeEach(PREV.firstRun && PREV.firstRun.results, RES, (x) => x.verdict !== 'TOO FEW CASES');
  const firstRun = Object.keys(FR).length ? { at: (PREV.firstRun && PREV.firstRun.at) || new Date().toISOString(), results: FR } : null;
  const results = Object.fromEntries(Object.keys(RES).map(k => [k, FR[k] || { ...RES[k], verdict: 'NO VERDICT YET (' + RES[k].verdict + ')' }]));
  const tierOf = (id) => FR[id] && FR[id].verdict === 'TRADABLE SMALL' ? 'TRADABLE SMALL' : null;

  // ---- 5. LIVE list: signals at the last close of every rule that reached tier 2 ----
  const future = tradingSessions(new Date(Date.parse(last) + 864e5).toISOString().slice(0, 10), new Date(Date.parse(last) + 140 * 864e5).toISOString().slice(0, 10));
  const HAL = J('data/halal.json', {}) || {}, ZAD = J('data/zad-list.json', {}) || {}, zbad = new Set(ZAD.notHalal || []), halOf = (s) => zbad.has(s) ? 'fail' : (HAL[s] && HAL[s].s) || 'unknown';
  const buys = []; for (const r of rules) if (tierOf(r.id)) for (const x of live[r.id]) buys.push({ rule: r.id, sym: x.sym, buy: future[0], sell: future[r.hold - 1], hold: r.hold, stopPct: K.STOP, lastClose: x.lastClose, combo: r.conds.map(K.condText).join(' AND '), features: x.features, halal: halOf(x.sym) });
  W(TODAY_OUT, { generatedAt: new Date().toISOString(), lastClose: last, sessions: future.slice(0, 90), rules: Object.fromEntries(rules.map(r => [r.id, tierOf(r.id)])), verdicts: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.verdict])), buys, buyUpToPct: 0.03,
    note: 'Signals of the discovered rules at the last cached close. buys holds lines only for a rule whose frozen newer-half verdict is TRADABLE SMALL; gates in the test and here: 3 USD+, 2M USD+ a day, no 15%+ one-day jump in 21 sessions, no 424B4/424B5 in 20 sessions; halal from data/halal.json + ZAD (unknown = check ZAD first).' });

  const out = { generatedAt: new Date().toISOString(), status: 'OK', preRegistered: state.frozenAt, window: [D[0], last], split: K.SPLIT, newerHalfFrom: D[tNew], complete, sources: SRC, missing,
    standard: 'TRADABLE SMALL (tier 2) on the newer half only: net > 0 after 0.8% and 1.2%, edge vs the average stock (same day, same exit) > 0, vs the same stock on its other newer-half days > 0, positive without the 2 best, 20+ trades, day t and block t >= max(2.5, zInv(1 - 0.05/m)), m = rules tested in all when its batch was added. Never PROVEN from this engine: the older half was used to find the rule.',
    testedTotal: state.batches.length ? state.batches[state.batches.length - 1].testedTotal : 0, batches: state.batches, discovery: state.discovery, pool: state.pool, frozenAt: state.frozenAt,
    results, firstRun, latest: latestBlock({ at: new Date().toISOString(), to: last, results: RES }),
    // per-trade rows (gross, before costs); a rule with more than 3,000 trades keeps a fixed every-k-th sample (its statistics use all trades)
    trades: Object.fromEntries(rules.map(r => { const a = trades[r.id], k = Math.ceil(a.length / 3000); return [r.id, a.filter((_, q) => q % k === 0).map(z => ({ s: z.s, buy: D[z.t + 1], sell: D[Math.min(T - 1, z.t + r.hold)], gross: r4(z.g), avgStock: r4(z.c), sameStock: r4(z.ob) }))]; })),
    tradesSampled: Object.fromEntries(rules.filter(r => trades[r.id].length > 3000).map(r => [r.id, 'every ' + Math.ceil(trades[r.id].length / 3000) + 'th of ' + trades[r.id].length])),
    costReality: costBlock(), diagnosis: diagnosis(), seconds: secs() };
  W(OUT, out); libraryWrite(state, FR);
  console.log('DISCOVERY ENGINE v2 (newer half ' + D[tNew] + ' to ' + last + ', ' + out.testedTotal + ' rules tested in all)');
  for (const r of rules) { const x = results[r.id], s = RES[r.id].newer || {}; console.log('- ' + r.id + ' [' + r.def + ', bar ' + RES[r.id].bar + '] ' + x.verdict + ' | ' + (s.n || 0) + ' trades, avg ' + pc(s.avg) + ' (1.2%: ' + pc(s.avgStress) + '), edge ' + pc(s.edge) + ' t ' + s.t + ' block t ' + s.tBlock + ', vs own ' + pc(s.vsOwn) + ', no top 2 ' + pc(s.noTop2) + ' | ' + r.conds.map(K.condText).join(' AND ')); }
  const cr = out.costReality; console.log('cost reality: ' + Object.entries(cr.bySource).map(([k, v]) => k + ' ' + v.rules + ' rules, +at 0.8% ' + v.positiveAt08 + ', +at 0.4% ' + v.positiveAt04 + ', +at 0.2% ' + v.positiveAt02).join(' | '));
  console.log('live: ' + buys.length + ' discovered buys (' + rules.filter(r => tierOf(r.id)).length + ' rules at tier 2)');
})().catch(e => { console.log('Error: discovery2 crashed: ' + (e && e.stack || e)); process.exitCode = 1; });

// library: every rule in a batch gets its written spec (pre-registered, frozen before the newer half); status from firstRun only
function libraryWrite(state, FR) { try { const LB = J(LIB, null); if (!LB || !Array.isArray(LB.strategies)) return; const inBatch = new Map(); for (const b of state.batches) for (const id of b.ids) inBatch.set(id, b);
  for (const r of state.pool) { const b = inBatch.get(r.id); if (!b) continue; let e = LB.strategies.find(x => x.id === r.id);
    if (!e) { e = { id: r.id, family: 'Discovered (Discovery Engine v2)', agent: 'D2', name: r.conds.map(K.condText).join(' AND ') + '; hold ' + r.hold + ', stop 15%', explain: 'DISCOVERED BY THE SYSTEM (discovery2.mjs), frozen ' + state.frozenAt.slice(0, 10) + ' BEFORE any newer-half session was read. ' + r.spec + ' Tested ONCE on signals from ' + K.SPLIT + ' (newer half) at the tier-2 standard with luck bar t ' + b.bar + ' (batch ' + b.n + ', ' + b.testedTotal + ' rules tested in all).', status: 'pre-registered: frozen from the older half; newer half not yet judged', note: 'Discovery Engine v2 batch ' + b.n }; LB.strategies.push(e); }
    const x = FR && FR[r.id]; if (x) { const s = x.newer || {}; e.status = 'tested: ' + x.verdict.toLowerCase(); e.tested = String(x.frozenAt || '').slice(0, 10); e.study = 'discovery2.mjs -> data/discovery2.json (newer half only, tested once, first judged run frozen)';
      e.result = { n: s.n, avg: s.avg, avgStress: s.avgStress, edge: s.edge, t: s.t, tBlock: s.tBlock, vsOwn: s.vsOwn, noTop2: s.noTop2, win: s.win, bar: x.bar, why: x.why }; } }
  fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('discovery2: library not updated: ' + e.message); } }
