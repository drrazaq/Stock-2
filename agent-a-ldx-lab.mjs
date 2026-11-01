// AGENT A LEADER DIP EXITS LAB (A-LDX1; 1 Nov 2026). agent-a-ldx-core.mjs = the pre-registered questions (written before any run).
// On the owner's live LEADER DIP lane (SQ11-PB12 entries, +20% sell limit, 126-session time exit, no stop, 3 slots): would a halfway check
// (LDX-HALF63), a 200-day trend-break exit (LDX-T200) or a longer 189-session time exit (LDX-TIME189) have done better, trade by trade AND as
// the real 3-slot account? Research only; never places an order; no Telegram; never edits scan.mjs or another lab.
// DATA: exactly agent-a-tgt-lab.mjs's price section (study-cache/grouped.json.gz RESTORED READ ONLY, highs and lows, dead stocks in x rows;
// the sessions since from Massive grouped daily; splits since repaired). Trades: data/squad11-lab.json SQ11-PB12 (as REPLAY-PB12T20).
// Run ONCE: the first complete result is frozen in data/agent-a-ldx-lab.json firstRun; later runs only refresh `latest` (monitoring).
// DIAG=1: data check only (rebuilt trade counts vs the replay's check); nothing judged or written in data/.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { freezeEach, latestBlock } from './first-run.mjs';
import { artifactJumps } from './squad4-core.mjs';
import { holdFrom } from './squad20-core.mjs';
import { simulate, buyHold } from './account-replay-core.mjs';
import { VARIANTS, IDS, COST, STRESS, SPLIT, HOLD, REGISTERED, r4, mean, halfOf, liveExit, halfwayExit, trendExit, smaOf, armStats, compare, adoptLdx, preRegister } from './agent-a-ldx-core.mjs';
const env = process.env, DIAG = !!env.DIAG, OFFLINE = !!env.OFFLINE, local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const PX = local(env.MASSIVE_BASE) || 'https://api.massive.com';
const OUT = env.ALDX_OUT || 'data/agent-a-ldx-lab.json', LIB = env.ALDX_LIB || 'data/strategy-library.json';
const J = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } }, JZ = (f, d) => { try { return JSON.parse(zlib.gunzipSync(fs.readFileSync(f)).toString()); } catch (e) { return d; } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (x) => new Date(x).toISOString().slice(0, 10), pc = (x) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%';
const t0 = Date.now(), log = (...a) => console.log('[' + ((Date.now() - t0) / 1000).toFixed(0) + 's]', ...a);
fs.mkdirSync('data', { recursive: true });
const PREV = J(OUT, {}), FROZEN = PREV.firstRun || {}, STATUS = {};

// ================= 0. PRE-REGISTRATION (before any computation; idempotent) =================
if (!DIAG) { const LB = J(LIB, null), ch = preRegister(LB); if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); log('library: ' + ch + ' A-LDX entries written now'); }

// ================= 1. PRICES (agent-a-tgt-lab.mjs section 1, unchanged) =================
let store = JZ(env.CACHE || 'study-cache/grouped.json.gz', null);
if (!store || !store.days) { console.log('agent-a-ldx-lab: no price cache (study-cache from the Sunday job); nothing done'); process.exit(0); }
let calls = 0; async function api(path) { if (OFFLINE || (!env.MASSIVE_KEY && !local(env.MASSIVE_BASE))) return null;
  for (let a = 0; a < 4; a++) { if (calls) await sleep(local(env.MASSIVE_BASE) ? 0 : 120); calls++; let r;
    try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY || ''), { signal: AbortSignal.timeout(60000) }); } catch (e) { await sleep(3000); continue; }
    if (r.status === 429) { await sleep(61000); continue; } if (r.status === 401) { console.log('Error: the MASSIVE_KEY secret was rejected'); return null; } if (r.status === 403 || r.status === 404) return { refused: true, status: r.status };
    if (!r.ok) { await sleep(3000); continue; } return await r.json().catch(() => null); } return null; }
const CS = new Set(store.ref ? store.ref.syms : []), qualifies = (x) => x.c >= 3 && x.c * x.v >= 1e6;
const pack = (rows) => ({ T: rows.map(x => x.T), o: rows.map(x => x.o), h: rows.map(x => x.h), l: rows.map(x => x.l), c: rows.map(x => x.c), v: rows.map(x => x.v) });
const cacheLast = Object.keys(store.days).sort().pop(), fresh = [];
for (let x = Date.parse(cacheLast) + 864e5; x <= Date.now(); x += 864e5) { const d = iso(x), wd = new Date(x).getUTCDay(); if (wd === 0 || wd === 6 || OFFLINE) continue;
  const j = await api('/v2/aggs/grouped/locale/us/market/stocks/' + d + '?adjusted=true'); if (!j || j.refused || !Array.isArray(j.results) || !j.results.length) continue;
  const all = j.results.filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && (CS.has(x.T) || x.T === 'SPY' || !CS.size) && x.c > 0);
  store.days[d] = { ...pack(all.filter(qualifies)), x: pack(all.filter(x => !qualifies(x))) }; fresh.push(d); }
log('cache to ' + cacheLast + '; fresh sessions: ' + (fresh.join(', ') || 'none'));
const D = Object.keys(store.days).sort(), T = D.length;
const SY = new Map(); for (const d of D) for (const s of store.days[d].T) if (!SY.has(s)) SY.set(s, SY.size);
for (const d of D) { const x = store.days[d].x; if (x) for (const s of x.T) if (!SY.has(s)) SY.set(s, SY.size); }
const NS = SY.size, SYMS = [...SY.keys()], N = NS * T;
const CA = new Float32Array(N).fill(NaN), OA = new Float32Array(N).fill(NaN), HA = new Float32Array(N).fill(NaN), LA = new Float32Array(N).fill(NaN), VA = new Float32Array(N).fill(NaN), MAIN = new Uint8Array(N);
let withHL = 0, rowsAll = 0;
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { const k = SY.get(x.T[j]) * T + t; OA[k] = x.o[j]; CA[k] = x.c[j]; VA[k] = x.v[j]; HA[k] = x.h ? x.h[j] : NaN; LA[k] = x.l ? x.l[j] : NaN; MAIN[k] = 1; rowsAll++; if (x.h && x.l && x.h[j] > 0) withHL++; }
  if (x.x) for (let j = 0; j < x.x.T.length; j++) { const q = SY.get(x.x.T[j]); if (q === undefined) continue; const k = q * T + t; if (MAIN[k]) continue; CA[k] = x.x.c[j]; OA[k] = x.x.o[j]; VA[k] = x.x.v ? x.x.v[j] : NaN; HA[k] = x.x.h ? x.x.h[j] : NaN; LA[k] = x.x.l ? x.x.l[j] : NaN; } });
const SIC = store.sic || {}; store = null;
if (!OFFLINE) { const j = await api('/stocks/v1/splits?execution_date.gte=' + cacheLast + '&limit=1000'), rows = j && Array.isArray(j.results) ? j.results : []; let fixed = 0;
  for (const x of rows) { const s = String(x.ticker || '').toUpperCase(), d = String(x.execution_date || ''), f = +x.split_from, to = +x.split_to; if (!s || !d || !(f > 0) || !(to > 0) || f === to || /dividend/i.test(String(x.adjustment_type || ''))) continue;
    const r = to / f, i = SY.get(s), ta = D.findIndex(z => z >= d); if (i === undefined || ta <= 0) continue; let pre = null, post = null;
    for (let k = ta - 1; k >= Math.max(0, ta - 10) && pre === null; k--) if (CA[i * T + k] > 0) pre = CA[i * T + k]; for (let k = ta; k < Math.min(T, ta + 10) && post === null; k++) if (CA[i * T + k] > 0) post = CA[i * T + k];
    if (!(pre > 0) || !(post > 0)) continue; const jump = Math.log(pre / post); if (!(Math.abs(jump - Math.log(r)) < Math.abs(jump))) continue;
    for (let k = 0; k < ta; k++) { const q = i * T + k; OA[q] /= r; HA[q] /= r; LA[q] /= r; CA[q] /= r; VA[q] *= r; } fixed++; }
  log('splits since ' + cacheLast + ': ' + rows.length + ' listed, ' + fixed + ' repaired'); }
const spyI = SY.get('SPY'), cl = (i) => CA.subarray(i * T, i * T + T);
if (spyI === undefined) { console.log('agent-a-ldx-lab: SPY missing from the cache; nothing done'); process.exit(0); }
const lastI = new Int32Array(NS).fill(-1); for (let i = 0; i < NS; i++) for (let t = T - 1; t >= 0; t--) if (CA[i * T + t] > 0) { lastI[i] = t; break; }
const LIQ = new Uint8Array(N);
for (let i = 0; i < NS; i++) { if (i === spyI) continue; const b = i * T; let s = 0, n = 0;
  for (let t = 0; t < T; t++) { const v = MAIN[b + t] ? CA[b + t] * VA[b + t] : NaN; if (isFinite(v)) { s += v; n++; }
    if (t >= 20) { const k = b + t - 20, w = MAIN[k] ? CA[k] * VA[k] : NaN; if (isFinite(w)) { s -= w; n--; } }
    if (t >= 19 && n === 20 && CA[b + t] >= 5 && s / 20 >= 5e6) LIQ[b + t] = 1; } }
const liqMemo = new Map(), liqList = (t) => { if (t < 0) return []; if (!liqMemo.has(t)) { const a = []; for (let i = 0; i < NS; i++) if (LIQ[i * T + t]) a.push(i); liqMemo.set(t, a); } return liqMemo.get(t); };
const SPYC = cl(spyI);
STATUS.price = { ok: T >= 1000 && withHL >= rowsAll * 0.9 && SPYC.filter(x => x > 0).length >= T * 0.95, sessions: T, from: D[0], to: D[T - 1], stocks: NS, rowsWithHighLow: r4(withHL / Math.max(1, rowsAll)) };
log('window ' + D[0] + '..' + D[T - 1] + ' (' + T + ' sessions, ' + NS + ' stocks), rows with high/low ' + pc(withHL / Math.max(1, rowsAll)));
const SPYCD = Float64Array.from(SPYC), SPYO = Float64Array.from(OA.subarray(spyI * T, spyI * T + T));
const tOf = new Map(D.map((d, t) => [d, t])), sessionOf = (d) => { if (tOf.has(d)) return tOf.get(d); let lo = 0, hi = T; while (lo < hi) { const m = (lo + hi) >> 1; if (D[m] <= d) lo = m + 1; else hi = m; } return lo - 1; };
const ser = (A, i) => A.subarray(i * T, i * T + T);
const JUMPS = new Map(); const artOf = (i) => { if (!JUMPS.has(i)) JUMPS.set(i, new Set(artifactJumps(cl(i)))); return JUMPS.get(i); };
const hasArt = (i, a, b) => { for (const k of artOf(i)) if (k > a && k <= b) return true; return false; };
const SER = new Map(); const seriesOf = (i) => { if (!SER.has(i)) SER.set(i, { o: ser(OA, i), h: ser(HA, i), c: ser(CA, i), last: lastI[i] }); return SER.get(i); };

// ================= 2. THE TRADES (REPLAY-PB12T20 construction) =================
const S11 = J('data/squad11-lab.json', {}), fr11 = (S11.firstRun || {})['SQ11-PB12'] || {}, SIG = ((S11.trades || {})['SQ11-PB12'] || []).map(z => [z.s, z.sig]);
const winEnd = (fr11.window && fr11.window[1]) || (S11.window && S11.window[1]) || null, cutT = winEnd ? Math.max(0, sessionOf(winEnd) - HOLD) : T - 1 - HOLD, CUT = D[cutT];
const note = { signals: SIG.length, noPrice: 0, notBought: 0, open: 0, artifacts: 0, open189: 0 }, ROWS = { live: [], 'LDX-HALF63': [], 'LDX-T200': [], 'LDX-TIME189': [] }, CANDS = { live: [], 'LDX-HALF63': [], 'LDX-T200': [], 'LDX-TIME189': [] }, dayIdx = new Map();
const smaMemo = new Map(), smaFor = (i) => { if (!smaMemo.has(i)) smaMemo.set(i, smaOf(Array.from(seriesOf(i).c), 200)); return smaMemo.get(i); };
for (const [sym, d] of SIG) { const t = sessionOf(d); if (t < 0) { note.noPrice++; continue; } const i = SY.get(sym); if (i === undefined) { note.noPrice++; continue; } const S = seriesOf(i);
  const base = holdFrom(S, t + 1, S.last, T, HOLD); if (!base) { note.notBought++; continue; } if (base.pending || base.open) { note.open++; continue; } if (hasArt(i, base.k, base.x)) { note.artifacts++; continue; }
  const ord = dayIdx.get(D[t]) || 0; dayIdx.set(D[t], ord + 1);
  const live = liveExit(S, base), common = { sym, sig: D[t], half: halfOf(D[t]), k: base.k, px0: base.px0, xT: base.x };
  const alts = { 'LDX-HALF63': halfwayExit(S, base, live, VARIANTS['LDX-HALF63'].check), 'LDX-T200': trendExit(S, base, live, smaFor(i)) };
  const b189 = holdFrom(S, t + 1, S.last, T, VARIANTS['LDX-TIME189'].hold);
  if (b189 && !b189.pending && !b189.open && !hasArt(i, b189.k, b189.x)) alts['LDX-TIME189'] = liveExit(S, b189); else note.open189++;
  for (const [id, a] of Object.entries(alts)) ROWS[id].push({ ...common, base: live, alt: a });
  ROWS.live.push({ ...common, base: live, alt: live });
  const cand = (e) => ({ id: 'SQ11-PB12', sym, t, sig: D[t], ord, k: base.k, x: e.q, px0: base.px0, px1: e.px, kind: e.how, exitAt: e.atOpen ? 'o' : 'c' });
  CANDS.live.push(cand(live)); CANDS['LDX-HALF63'].push(cand(alts['LDX-HALF63'])); CANDS['LDX-T200'].push(cand(alts['LDX-T200']));
  // TIME189 in the account: every trade (a 189-session trade still running at a window end is marked there, as any open position)
  const b189a = b189 && !b189.pending && !hasArt(i, b189.k, b189.open ? Math.min(T - 1, S.last) : b189.x) ? b189 : null;
  if (b189a && !b189a.open) CANDS['LDX-TIME189'].push(cand(liveExit(S, b189a)));
  else { const tg = (() => { const L = base.px0 * 1.2; for (let q = base.k; q <= Math.min(T - 1, S.last); q++) { const o = S.o[q], h = S.h[q], c = S.c[q]; if (q > base.k && o > 0 && o >= L) return { q, px: o }; const top = h > 0 ? h : c; if (top > 0 && top >= L - 1e-12) return { q, px: L }; } return null; })();
    CANDS['LDX-TIME189'].push(tg ? { id: 'SQ11-PB12', sym, t, sig: D[t], ord, k: base.k, x: tg.q, px0: base.px0, px1: tg.px, kind: 'target', exitAt: 'c' } : { id: 'SQ11-PB12', sym, t, sig: D[t], ord, k: base.k, x: null, px0: base.px0, px1: null, kind: 'open', exitAt: 'c' }); } }
// DATA CHECK (fixed 1 Nov 2026 after the first attempt stopped here, BEFORE anything was judged: the first version compared ALL rebuilt trades
// with REPLAY-PB12T20's counts, but 2 more trades have finished since that run, so it could never match). The check now compares the trades
// whose 126-session sale is inside A-TGT-TGT20-PB12's frozen window with that frozen first run (n and win per half), which is exactly the
// population REPLAY-PB12T20 also reproduced. Rule, data and adoption test unchanged; the study itself still uses every finished trade.
const AT = J('data/agent-a-tgt-lab.json', {}), atFr = (AT.firstRun || {})['A-TGT-TGT20-PB12'] || {}, atEnd = (atFr.window || [])[1] || null;
const liveCheck = Object.fromEntries(['older', 'newer'].map(h => { const r = ROWS.live.filter(z => z.half === h && atEnd && D[z.xT] <= atEnd); return [h, { n: r.length, win: r4(r.filter(z => z.base.px / z.px0 - 1 - COST > 0).length / Math.max(1, r.length)) }]; }));
const repCheck = atFr.results ? { through: atEnd, older: { n: atFr.results.older.n, win: atFr.results.older.win }, newer: { n: atFr.results.newer.n, win: atFr.results.newer.win } } : null;
STATUS.trades = { ...note, rebuilt: ROWS.live.length, liveCheck, replayCheck: repCheck, reproduces: !!repCheck && ['older', 'newer'].every(h => repCheck[h].n === liveCheck[h].n && Math.abs(repCheck[h].win - liveCheck[h].win) < 0.002) };
log('trades: ' + JSON.stringify(STATUS.trades) + ' | CUT ' + CUT);
if (DIAG) { log('DIAG: nothing judged or written'); process.exit(0); }
if (!STATUS.price.ok || !STATUS.trades.reproduces) { log('NOT RUN: ' + (!STATUS.price.ok ? 'price data incomplete' : 'the rebuilt live trades do not reproduce REPLAY-PB12T20 (n / win per half)') + '; nothing frozen');
  fs.writeFileSync(OUT, JSON.stringify({ ...PREV, generatedAt: new Date().toISOString(), data: STATUS, latest: latestBlock({ at: new Date().toISOString(), note: 'not run: data check failed' }) }, null, 1)); process.exit(0); }

// ================= 3. TRADE LEVEL =================
const halves = (rows, f) => Object.fromEntries(['older', 'newer'].map(h => [h, f(rows.filter(z => z.half === h))]));
// ================= 4. THE REAL ACCOUNT (3 slots, 3,000 USD; REPLAY-PB12T20 settings) =================
const SPY = { o: Float64Array.from(OA.subarray(spyI * T, spyI * T + T)), c: SPYCD };
const closeOf = (sym, t) => { const i = SY.get(sym); if (i === undefined) return null; for (let q = t; q >= 0; q--) { const c = CA[i * T + q]; if (c > 0) return c; } return null; };
const OLDER_END = '2023-12-29', W = { older: [0, sessionOf(OLDER_END)], newer: [D.findIndex(d => d >= SPLIT), cutT], full: [0, cutT] };
const acct = (cands, cost) => Object.fromEntries(Object.entries(W).map(([w, [a, z]]) => { const s = simulate({ cands, D, closeOf, start: a, end: z, priority: ['SQ11-PB12'], cost, cash0: 3000, maxOpen: 3, perBuy: 1000 }), spy = buyHold({ o: SPY.o, c: SPY.c, D, start: a, end: z, cash0: 3000, cost });
  return [w, { start: s.start, end: s.end, v1: s.v1, perYear: s.perYear, maxDD: s.maxDD, trades: s.trades, closed: s.closedTrades, fullSlotSkips: s.skipped.fullSlots, ruleOffSkips: s.skipped.ruleOff, timeInMarket: s.timeInMarket, spyEnd: spy && spy.v1, beatsSpy: !!(spy && s.v1 > spy.v1) }]; }));
const ACC = { live: { cost: acct(CANDS.live, COST), stress: acct(CANDS.live, STRESS) } };
log('LIVE account: ' + JSON.stringify({ older: ACC.live.cost.older.v1, newer: ACC.live.cost.newer.v1, spyOlder: ACC.live.cost.older.spyEnd, spyNewer: ACC.live.cost.newer.spyEnd }));
const RES = {};
for (const id of IDS) { const rows = ROWS[id], cmp = halves(rows, compare), live = halves(rows, r => armStats(r, 'base')), alt = halves(rows, r => armStats(r, 'alt')), liveS = halves(rows, r => armStats(r, 'base', STRESS)), altS = halves(rows, r => armStats(r, 'alt', STRESS));
  ACC[id] = { cost: acct(CANDS[id], COST), stress: acct(CANDS[id], STRESS) };
  const accEnds = Object.fromEntries(['older', 'newer'].map(h => [h, { cost: { alt: ACC[id].cost[h].v1, live: ACC.live.cost[h].v1 }, stress: { alt: ACC[id].stress[h].v1, live: ACC.live.stress[h].v1 } }]));
  const ad = adoptLdx(cmp, live, alt, accEnds), hows = {}; for (const z of rows) if (z.alt.q !== z.base.q || z.alt.px !== z.base.px) hows[z.alt.how] = (hows[z.alt.how] || 0) + 1;
  RES[id] = { name: VARIANTS[id].name, verdict: ad.adopt ? 'ADOPT' : 'DO NOT ADOPT', why: ad.why, compare: cmp, live, variant: alt, atStress: { live: liveS, variant: altS }, account: { variant: ACC[id], live: ACC.live }, changedBy: hows };
  log(id + ': ' + RES[id].verdict + ' | older diff ' + pc(cmp.older.diff) + ' fired ' + cmp.older.fired + ' | newer diff ' + pc(cmp.newer.diff) + ' fired ' + cmp.newer.fired + ' | acct older ' + ACC[id].cost.older.v1 + ' vs ' + ACC.live.cost.older.v1 + ', newer ' + ACC[id].cost.newer.v1 + ' vs ' + ACC.live.cost.newer.v1 + ' | ' + ad.why.slice(0, 300)); }

// ================= 5. FREEZE, WRITE, LIBRARY =================
const firstRun = freezeEach(FROZEN, Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { at: new Date().toISOString(), window: [D[0], D[T - 1]], cut: CUT, ...r }])), (r) => r && r.verdict);
const out = { generatedAt: new Date().toISOString(), study: 'A-LDX1 exit questions on the live LEADER DIP lane (Agent A)', preRegistered: 'agent-a-ldx-core.mjs header (1 Nov 2026, before any run) + data/strategy-library.json LDX-*', registered: REGISTERED,
  live: 'SQ11-PB12 entries, +20% sell limit, else the close of session 126, no stop; 3 slots x 1,000 USD (NOT re-tested; the reference)', window: [D[0], D[T - 1]], cut: CUT, split: SPLIT, cost: COST, stress: STRESS, data: STATUS,
  halal: 'full universe (past ZAD marks unknown), as REPLAY-PB12T20', firstRun,
  advice: Object.fromEntries(IDS.map(id => [id, firstRun[id] ? firstRun[id].verdict : 'not run'])),
  latest: latestBlock({ at: new Date().toISOString(), results: Object.fromEntries(Object.entries(RES).map(([k, r]) => [k, { verdict: r.verdict, compare: r.compare }])) }) };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
try { const LB = J(LIB, null); let ch = false;
  for (const id of IDS) { const e = LB && LB.strategies.find(x => x.id === id), r = firstRun[id]; if (!e || !r || e.result) continue;
    e.status = 'tested: ' + (r.verdict === 'ADOPT' ? 'ADOPT as the lane exit (owner decides)' : 'do not adopt (exit)');
    e.result = { at: r.at, verdict: r.verdict, why: r.why, older: { fired: r.compare.older.fired, diff: r.compare.older.diff, liveAvg: r.live.older.avg, variantAvg: r.variant.older.avg, acct: r.account.variant.cost.older.v1, liveAcct: r.account.live.cost.older.v1 },
      newer: { fired: r.compare.newer.fired, diff: r.compare.newer.diff, liveAvg: r.live.newer.avg, variantAvg: r.variant.newer.avg, acct: r.account.variant.cost.newer.v1, liveAcct: r.account.live.cost.newer.v1 } }; ch = true; }
  if (ch) fs.writeFileSync(LIB, JSON.stringify(LB, null, 1)); } catch (e) { console.log('agent-a-ldx-lab: library not updated: ' + e.message); }
console.log('AGENT A LEADER DIP EXITS ' + D[0] + ' to ' + D[T - 1] + ' | cut ' + CUT + ' | ' + IDS.map(id => id + ' ' + (firstRun[id] ? firstRun[id].verdict : 'not run')).join(' | '));
