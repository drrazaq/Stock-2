// FAST-MOVER LAB. Can the system catch the stocks that jump 20-80% in a day, in and out the same day or overnight, and make money
// AFTER costs? It answers with five years of the WHOLE US market including 1-3 USD stocks (the LEADERS cache drops stocks under
// 3 USD, so most runners were invisible to the other tests). Read-only; never places an order.
//
// Three parts:
// 1. DECODE: what did the day BEFORE a +20% jump look like (volume, price, earlier runs, position in the year's range...)? Each
//    pattern's lift (how much more often a jump followed than for a random stock-day) and what buying it actually earned.
//    Patterns are FOUND on the older half only and CONFIRMED on the newer half they never saw.
// 2. DAY-TRADE AND OVERNIGHT RULES, fixed in advance: gap-ups, day 2 of a runner, repeat runners, first lower open after a run,
//    earnings gaps, heavy quiet volume before a jump. Conservative fills: bought at the open (or the close), stop 8% under the
//    entry checked FIRST (if the day's low touched it, the trade is counted as stopped even if the stock closed higher), sold at
//    the close. Costs by price: 1.6% a round trip under 5 USD, 0.9% 5-20 USD, 0.8% above (the house floor; your 3 USD + 3 USD fee included).
//    A rule passes only with 30+ trades in each half, profit in both halves, profit at 1.5x cost, profit factor above 1.15, profit
//    in the last 12 months, and no single trade making 40% of the gains.
// 3. LIVE (MODE=live, each morning before the open): tomorrow's candidates of every rule, logged on PAPER and scored the next day.
//    Only rules that passed the five-year test are sent to you as a DAY-TRADE LIST.
// MODE=study: Sunday (leaders-study workflow, paid Massive plan). MODE=live: weekdays 7 am Kuwait (movers workflow).
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, MODE = ['live', 'intraday'].includes(env.MODE) ? env.MODE : 'study';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const TEST = local(env.MASSIVE_BASE), PX = TEST || 'https://api.massive.com', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const pc = (x, d = 1) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const QUIET = readJson('data/settings.json', {}).quiet !== false;
const CDIR = env.FM_CACHE_DIR || 'fm-cache', CACHE = CDIR + '/fm.json.gz', OUT = 'data/fastmover-lab.json', LIVE = 'data/fastmover-live.json', PAPER = 'data/fastmover-paper.json';
fs.mkdirSync(CDIR, { recursive: true }); fs.mkdirSync('data', { recursive: true });
const PAID = Boolean(env.MASSIVE_PAID), WANT = Math.min(1300, +(env.SESSIONS || (PAID ? 1260 : 400))), MAX_CALLS = +(env.MAX_CALLS || (PAID ? 1500 : 60));

let store = { days: {}, gone: [] };
try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(CACHE)).toString()); } catch (e) { console.log('fast-mover cache: building from scratch'); }
store.days = store.days || {}; store.gone = store.gone || [];
// PENNY LANE (14 Oct): the cache now keeps stocks from 0.10 USD (it kept 1 USD+), so the Saturday minute-bar test can measure
// sub-1-USD runners (TGL, NIVF...) as their own group. The daily rules below still use 1 USD+ only, exactly as before.
const MINPX = 0.10; if (MODE !== 'live' && store.minPx !== MINPX) { console.log('fast-mover cache: rebuilding with stocks from ' + MINPX + ' USD'); store.days = {}; store.gone = []; store.minPx = MINPX; }
const save = () => fs.writeFileSync(CACHE, zlib.gzipSync(JSON.stringify(store)));
let calls = 0;
async function api(path) {
  if (!env.MASSIVE_KEY) return null;
  for (let a = 0; a < 4; a++) {
    if (calls && !TEST) await sleep(PAID ? 150 : 12500); calls++;
    let r; try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY)); } catch (e) { await sleep(TEST ? 5 : 5000); continue; }
    if (r.status === 429) { await sleep(TEST ? 5 : 61000); continue; }
    if (r.status === 401 || r.status === 403) return { refused: true };
    if (!r.ok) { await sleep(TEST ? 5 : 5000); continue; }
    return await r.json().catch(() => null);
  }
  return null;
}
// common stocks and ADRs only (the LEADERS cache keeps that list); funds and warrants are left out
let CS = (() => { try { const s = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); return new Set(s.ref ? s.ref.syms : []); } catch (e) { return new Set(); } })();
if (CS.size) store.cs = [...CS]; else if (store.cs) CS = new Set(store.cs);   // the live job has no LEADERS cache: it uses the list saved by the study
async function addDay(d) {
  const j = await api(`/v2/aggs/grouped/locale/us/market/stocks/${d}?adjusted=true`); if (!j) return 'fail'; if (j.refused) return 'refused';
  const rows = (j.results || []).filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && x.c >= MINPX && x.c * x.v >= 3e5 && x.o > 0 && (CS.has(x.T) || x.T === 'SPY' || !CS.size));
  if (!rows.length) return 'empty';
  store.days[d] = { T: rows.map(x => x.T), o: rows.map(x => +x.o.toFixed(4)), h: rows.map(x => +x.h.toFixed(4)), l: rows.map(x => +x.l.toFixed(4)), c: rows.map(x => +x.c.toFixed(4)), v: rows.map(x => Math.round(x.v)) }; return 'ok';
}
// ---- fill the cache: walk back from yesterday (study), or just the missing recent days (live)
{ let have = Object.keys(store.days).length, added = 0;
  const maxBack = MODE === 'live' ? 12 : Math.ceil(WANT * 1.6);
  for (let k = 1; k <= maxBack && calls < MAX_CALLS && (MODE === 'live' || have < WANT); k++) {
    const ms = Date.now() - k * 864e5, d = iso(ms), wd = new Date(ms).getUTCDay(); if (wd === 0 || wd === 6 || d in store.days || store.gone.includes(d)) continue;
    const r = await addDay(d); if (r === 'refused') break; if (r === 'empty') { if (k > 4) store.gone.push(d); continue; } if (r !== 'ok') continue;
    have++; added++; if (MODE !== 'live' && added % 50 === 0) { save(); console.log('fast-mover cache: ' + have + ' sessions'); } }
  const all = Object.keys(store.days).sort(); for (const d of all.slice(0, Math.max(0, all.length - WANT))) delete store.days[d];
  if (added && MODE !== 'live') save(); if (added) console.log('fast-mover cache: +' + added + ' sessions, ' + calls + ' calls'); }

const D = Object.keys(store.days).sort(), T = D.length;
if (T < (MODE === 'live' ? 30 : 300)) { const why = 'only ' + T + ' sessions in the fast-mover cache'; console.log('fast-mover lab: ' + why); if (MODE === 'study') fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why })); process.exit(0); }
const FIRST = MODE === 'live' ? Math.max(0, T - 300) : 0;
const bars = new Map(); for (let t = FIRST; t < T; t++) { const x = store.days[D[t]]; for (let j = 0; j < x.T.length; j++) { if (MODE !== 'intraday' && !(x.c[j] >= 1)) continue; let a = bars.get(x.T[j]); if (!a) bars.set(x.T[j], a = []); a.push({ t, o: x.o[j], h: x.h[j], l: x.l[j], c: x.c[j], v: x.v[j] }); } }
const mid = Math.floor((FIRST + T) / 2), STOP = 0.08;
const costOf = (p) => p < 5 ? 0.016 : p < 20 ? 0.009 : 0.008;   // house floor 0.8% a round trip (was 0.7% above 20 USD until 22 Oct 2026); stress 1.5x = 1.2%+

// ---- per-stock helpers (all from bars BEFORE or ON the day named; nothing from the future)
function prep(c) { const n = c.length, av = new Array(n).fill(null), hi52 = new Array(n).fill(null), lo52 = new Array(n).fill(null), run20 = new Array(n).fill(false), run30 = new Array(n).fill(false);
  let s = 0; for (let i = 0; i < n; i++) { if (i >= 20) av[i] = s / 20; s += c[i].v; if (i >= 20) s -= c[i - 20].v; }
  let last20 = -99, last30 = -99; for (let i = 1; i < n; i++) { const r = c[i].t === c[i - 1].t + 1 ? c[i].c / c[i - 1].c - 1 : 0; run20[i] = i - last20 <= 20; run30[i] = i - last30 <= 20; if (r >= 0.2) last20 = i; if (r >= 0.3) last30 = i; }
  if (n > 252) { for (let i = 252; i < n; i++) { let h = 0, l = Infinity; for (let j = i - 252; j < i; j++) { if (c[j].h > h) h = c[j].h; if (c[j].l < l) l = c[j].l; } hi52[i] = h; lo52[i] = l; } }
  return { av, hi52, lo52, run20, run30 }; }   // run20[i]/run30[i]: a +20% / +30% day in the 20 sessions BEFORE bar i
const cons = (c, i, k = 1) => i - k >= 0 && c[i].t === c[i - k].t + k;
const gapOf = (c, i) => c[i].o / c[i - 1].c - 1, chgOf = (c, i) => c[i].c / c[i - 1].c - 1, locOf = (b) => b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5;
const liquid = (c, i) => c[i].c >= 1 && c[i].c * c[i].v >= 1e6;                   // the day BEFORE the trade: 1 USD+, 1M USD+ traded
const isRunner = (c, i, X) => cons(c, i) && chgOf(c, i) >= 0.2 && locOf(c[i]) >= 0.7 && X.av[i] && c[i].v >= 3 * X.av[i];
const quietHeavy = (c, i, X) => cons(c, i) && X.av[i] && c[i].v >= 4 * X.av[i] && Math.abs(chgOf(c, i)) <= 0.03 && locOf(c[i]) >= 0.75 && c[i].c >= 1 && c[i].c <= 20;
// earnings days (reaction sessions) from the earnings history, if present
const EARN = (() => { const m = new Map(); try { const E = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/earnings-cache.json.gz')).toString()).syms || {}, tOf = new Map(D.map((d, t) => [d, t]));
  for (const [s, L] of Object.entries(E)) { const set = new Set(); for (const r of L) { let t = tOf.get(r.d); if (t === undefined) continue; if (r.t === 'amc') t++; set.add(t); if (!r.t) set.add(t + 1); } m.set(s, set); } } catch (e) {} return m; })();

// THE RULES (fixed in advance). day: bought at the open of bar i, sold at its close. ovn: bought at the close of bar i, sold next open.
// ovc: bought at the close of bar i, sold at the next close. Each `when` is what must be known BEFORE buying.
const RULES = [
  { id: 'DT1', kind: 'day', name: 'Gap-up 10%+ at the open', live: 'gap', fire: (c, i) => cons(c, i) && liquid(c, i - 1) && gapOf(c, i) >= 0.10 },
  { id: 'DT2', kind: 'day', name: 'Gap-up 10%+ after an up day (5%+)', live: 'gap', fire: (c, i) => cons(c, i, 2) && liquid(c, i - 1) && gapOf(c, i) >= 0.10 && chgOf(c, i - 1) >= 0.05 },
  { id: 'DT3', kind: 'day', name: 'Day 2 of a runner (up 20%+ yesterday on 3x volume, closed near the high), opens -5% to +15%', live: 'list', fire: (c, i, X) => cons(c, i, 2) && liquid(c, i - 1) && isRunner(c, i - 1, X) && gapOf(c, i) >= -0.05 && gapOf(c, i) <= 0.15, cond: { lo: -0.05, hi: 0.15 }, pick: (c, i, X) => isRunner(c, i, X) },
  { id: 'DT4', kind: 'day', name: 'Day 2 of a runner, opening 3%+ higher again', live: 'list', fire: (c, i, X) => cons(c, i, 2) && liquid(c, i - 1) && isRunner(c, i - 1, X) && gapOf(c, i) >= 0.03, cond: { lo: 0.03, hi: 0.5 }, pick: (c, i, X) => isRunner(c, i, X) },
  { id: 'DT5', kind: 'day', name: 'Repeat runner (a 30%+ day in the last 20 sessions) gapping up 5%+', live: 'list', fire: (c, i, X) => cons(c, i) && liquid(c, i - 1) && X.run30[i] && !(cons(c, i - 1) && chgOf(c, i - 1) >= 0.3) && gapOf(c, i) >= 0.05, cond: { lo: 0.05, hi: 0.5 }, pick: (c, i, X) => X.run30[i] && !(cons(c, i) && chgOf(c, i) >= 0.3) },
  { id: 'DT6', kind: 'day', name: 'First lower open (5%+ down) after a 40%+ two-day run', live: 'list', fire: (c, i) => cons(c, i, 3) && liquid(c, i - 1) && c[i - 1].c / c[i - 3].c >= 1.4 && gapOf(c, i) <= -0.05, cond: { lo: -0.5, hi: -0.05 }, pick: (c, i) => cons(c, i, 2) && c[i].c / c[i - 2].c >= 1.4 },
  { id: 'EG', kind: 'day', name: 'Earnings reaction gap 5%+, day trade', live: 'gap', fire: (c, i, X, s) => cons(c, i) && liquid(c, i - 1) && gapOf(c, i) >= 0.05 && EARN.has(s) && EARN.get(s).has(c[i].t) },
  { id: 'ON1', kind: 'ovn', name: 'Heavy quiet volume (4x, price flat, closed near the high), bought at the close, sold next open', live: 'close', fire: (c, i, X) => liquid(c, i) && quietHeavy(c, i, X) },
  { id: 'ON2', kind: 'ovc', name: 'Heavy quiet volume, bought at the close, held to the next close', live: 'close', fire: (c, i, X) => liquid(c, i) && quietHeavy(c, i, X) },
  { id: 'ON3', kind: 'day', name: 'Heavy quiet volume yesterday, bought at the open, sold at the close', live: 'list', fire: (c, i, X) => cons(c, i) && liquid(c, i - 1) && quietHeavy(c, i - 1, X), cond: { lo: -0.5, hi: 0.5 }, pick: (c, i, X) => liquid(c, i) && quietHeavy(c, i, X) },
];
function outcome(rule, c, i) {   // gross return, plus the best the day offered (what you SEE on a chart), or null
  if (rule.kind === 'day') { const b = c[i], e = b.o, st = e * (1 - STOP); if (!(e > 0)) return null; const x = b.l <= st ? st : b.c; return { e, g: x / e - 1, best: b.h / e - 1 }; }
  const n1 = c[i + 1]; if (!n1 || n1.t !== c[i].t + 1) return null; const e = c[i].c;
  if (rule.kind === 'ovn') return { e, g: n1.o / e - 1, best: n1.o / e - 1 };
  const st = e * (1 - STOP), x = n1.o <= st ? n1.o : n1.l <= st ? st : n1.c; return { e, g: x / e - 1, best: n1.h / e - 1 };
}
function stats(a, mult = 1) { if (!a.length) return { n: 0 }; const p = a.map(x => x.g - costOf(x.e) * mult), w = p.filter(x => x > 0), l = p.filter(x => x <= 0), sum = z => z.reduce((x, y) => x + y, 0), srt = [...p].sort((x, y) => x - y);
  return { n: p.length, win: w.length / p.length, avg: sum(p) / p.length, med: srt[Math.floor(srt.length / 2)], pf: l.length && sum(l) < 0 ? sum(w) / -sum(l) : w.length ? 99 : null, bestShare: sum(w) > 0 ? Math.max(...w) / sum(w) : null, big: a.filter(x => x.g >= 0.10).length / a.length, stopped: a.filter(x => x.g <= -STOP + 1e-9).length / a.length, best: sum(a.map(x => x.best)) / a.length }; }

// ======================= MODE=intraday (Saturday) =======================
// The minute-by-minute test of the IGNITION rules (ignition-core.mjs). Sample: EVERY stock-day of the last ~2 years on which the
// stock touched +10% over the previous close at some point (the ones that faded included), so nothing is picked with hindsight.
// Minute bars come from the paid Massive plan, a budget per Saturday; the sample grows each week. Only each day's results are kept.
if (MODE === 'intraday') {
  const { IG_RULES, EXITS, trigger, simulate, toBars, passes, costOf: igCost0, IG_VERSION } = await import('./ignition-core.mjs');
  const igCost = (e) => e < 1 ? 0.035 : igCost0(e);   // sub-1 USD: wide spreads, halts and slippage cost far more
  const MIN = CDIR + '/ign.json.gz', FLT = CDIR + '/floats.json', IGOUT = 'data/ignition-lab.json';
  let mc = {}; try { mc = JSON.parse(zlib.gunzipSync(fs.readFileSync(MIN)).toString()); } catch (e) {}
  if (mc._v !== IG_VERSION) { mc = { _v: IG_VERSION }; console.log('ignition rules changed: every day is tested again'); }
  const floats = readJson(FLT, {}), LOOK = Math.min(T - 25, +(env.IG_LOOK || 500)), BUDGET = calls + +(env.IG_CALLS || 12000), t0 = Date.now(), MAXMS = +(env.IG_MINUTES || 200) * 60000;
  const firstT = new Map(); for (const [s, c] of bars) firstT.set(s, c[0].t);
  const cand = [];
  for (const [sym, c] of bars) { if (sym === 'SPY') continue;
    for (let i = 21; i < c.length; i++) { if (c[i].t < T - LOOK || !cons(c, i)) continue; const p = c[i - 1]; if (!(p.c >= MINPX) || p.c * p.v < (p.c >= 1 ? 5e5 : 3e5) || !(c[i].h >= p.c * 1.10)) continue;
      let sv = 0; for (let k = i - 20; k < i; k++) sv += c[k].v; const ft = firstT.get(sym);
      cand.push({ sym, d: D[c[i].t], t: c[i].t, prevC: p.c, avgVol: sv / 20, age: ft > 5 ? c[i].t - ft : (c[i].t >= 250 ? 999 : null) }); } }
  const key = (x) => x.sym + '|' + x.d, hsh = (q) => { let h = 2166136261; for (let k = 0; k < q.length; k++) { h ^= q.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; };
  const BASE = IG_RULES.filter(R => !R.base), todo = cand.filter(x => !(key(x) in mc)).sort((a, b) => hsh(key(a)) - hsh(key(b)));   // random order: every week adds evenly across the two years
  const saveMc = () => fs.writeFileSync(MIN, zlib.gzipSync(JSON.stringify(mc)));
  let got = 0, refused = false;
  for (const x of todo) { if (calls >= BUDGET || Date.now() - t0 > MAXMS) break;
    const j = await api(`/v2/aggs/ticker/${x.sym}/range/1/minute/${x.d}/${x.d}?adjusted=true&sort=asc&limit=50000`); if (j && j.refused) { refused = true; break; } if (!j) continue;
    const b = toBars(j.results, x.d), rec = {};
    for (const R of BASE) { const tr = trigger(b, x.prevC, x.avgVol, null, { ...R, float: undefined, maxPx: undefined, young: undefined });   // stock filters are applied when the results are counted
      if (!tr) continue; for (const X of EXITS) { const o = simulate(b, x.prevC, tr, R, X); if (o && isFinite(o.g) && o.g < 5) rec[R.id + '/' + X.id] = [+o.g.toFixed(4), +o.best.toFixed(4), +o.e.toPrecision(6), tr.m]; } }
    mc[key(x)] = rec; got++; if (got % 500 === 0) { saveMc(); console.log('minute days tested: ' + Object.keys(mc).length); } }
  saveMc();
  // floats (shares outstanding) for the sampled stocks; today's number is used for the past (a known approximation)
  for (const sy of new Set(cand.filter(x => key(x) in mc).map(x => x.sym))) { if (Date.now() - t0 > MAXMS + 20 * 60000) break; const f = floats[sy]; if (f && Date.now() - Date.parse(f.at) < 60 * 864e5) continue;
    const j = await api('/v3/reference/tickers/' + sy), r = j && j.results; floats[sy] = { f: r ? (r.share_class_shares_outstanding || r.weighted_shares_outstanding || null) : null, at: new Date().toISOString() }; }
  fs.writeFileSync(FLT, JSON.stringify(floats));
  const midT = T - Math.floor(LOOK / 2), res = {};
  for (const R of IG_RULES) for (const X of EXITS) { res[R.id + '/' + X.id] = []; res['PENNY ' + R.id + '/' + X.id] = []; }
  // share count KNOWN ON THAT DAY (SEC cover-page counts, public 30 days after their date); today's count only when the SEC has none
  let SHR = null; try { SHR = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/shares.json.gz')).toString()); } catch (e) {}
  const sharesAt = (sym, d) => { if (!SHR) return null; const a = SHR.c[SHR.t[sym]]; if (!a) return null; const lim = new Date(Date.parse(d) - (SHR.lagDays || 30) * 864e5).toISOString().slice(0, 10); let v = null; for (const [e, n] of a) { if (e <= lim) v = n; else break; } return v; };
  let have = 0, pitN = 0, todayN = 0;
  for (const x of cand) { const rec = mc[key(x)]; if (!rec) continue; have++; const pit = sharesAt(x.sym, x.d); if (pit) pitN++; else if (floats[x.sym] && floats[x.sym].f) todayN++;
    const meta = { float: pit || (floats[x.sym] && floats[x.sym].f), age: x.age };
    for (const R of IG_RULES) { if (!passes(R, x.prevC, meta)) continue; for (const X of EXITS) { const o = rec[(R.base || R.id) + '/' + X.id]; if (o) res[(x.prevC < 1 ? 'PENNY ' : '') + R.id + '/' + X.id].push({ t: x.t, sym: x.sym, d: x.d, g: o[0], best: o[1], e: o[2] }); } } }
  const st = (a, mult = 1) => { if (!a.length) return { n: 0 }; const p = a.map(x => x.g - igCost(x.e) * mult), w = p.filter(x => x > 0), l = p.filter(x => x <= 0), sum = z => z.reduce((u, v) => u + v, 0), srt = [...p].sort((u, v) => u - v);
    return { n: p.length, win: w.length / p.length, avg: sum(p) / p.length, med: srt[Math.floor(srt.length / 2)], pf: l.length && sum(l) < 0 ? sum(w) / -sum(l) : w.length ? 99 : null, bestShare: sum(w) > 0 ? Math.max(...w) / sum(w) : null, best: sum(a.map(x => x.best)) / a.length, big: a.filter(x => x.g >= 0.15).length / a.length }; };
  const OUTR = {};
  for (const pre of ['', 'PENNY ']) for (const R of IG_RULES) for (const X of EXITS) { const id = pre + R.id + '/' + X.id, a = res[id], o = a.filter(x => x.t < midT), w = a.filter(x => x.t >= midT), why = [];
    const Rr = { older: st(o), newer: st(w), stress: st(w, 1.5), last6: st(a.filter(x => x.t >= T - 126)) }; let verdict = 'PROMISING';
    if ((Rr.older.n || 0) < 30 || (Rr.newer.n || 0) < 30) { verdict = 'NOT PROVEN'; why.push('too few trades yet (' + (Rr.older.n || 0) + ' / ' + (Rr.newer.n || 0) + '; the sample grows every Saturday)'); }
    else { if (!(Rr.older.avg > 0)) why.push('lost money in the older year'); if (!(Rr.newer.avg > 0)) why.push('lost money in the newer year'); if (!(Rr.stress.avg > 0)) why.push('loses at 1.5x costs');
      // stricter than the daily rules: many rule/exit variants are tested on a hand-picked kind of stock
      const ses = new Set(a.map(x => x.d)).size, syms = new Set(a.map(x => x.sym)).size; if (ses < 30) why.push('only ' + ses + ' different days'); if (syms < 20) why.push('only ' + syms + ' different stocks');
      if (!((Rr.newer.pf || 0) >= 1.2)) why.push('profit factor ' + (Rr.newer.pf ? Rr.newer.pf.toFixed(2) : 'n/a') + ' (1.20 needed)'); if (Rr.newer.bestShare > 0.2) why.push('one trade made 20%+ of the gains'); { const bySym = {}; let tot = 0; for (const x of w) { const g = x.g - igCost(x.e); if (g > 0) { bySym[x.sym] = (bySym[x.sym] || 0) + g; tot += g; } } const top = Math.max(0, ...Object.values(bySym)); if (tot > 0 && top / tot > 0.25) why.push('one stock made over 25% of the gains'); }
      { const net = w.map(x => x.g - igCost(x.e)).sort((u, v) => v - u); if (net.length > 2 && !(net.slice(2).reduce((u, v) => u + v, 0) / (net.length - 2) > 0)) why.push('loses without its 2 best trades'); } if (Rr.last6.n >= 10 && !(Rr.last6.avg > 0)) why.push('lost money in the last 6 months');
      if (why.length) verdict = Rr.older.avg > 0 && Rr.newer.avg > 0 ? 'NOT PROVEN' : 'REJECTED'; }
    OUTR[id] = { rule: R.id, exit: X.id, penny: !!pre, name: (pre ? 'PENNY (0.10-1 USD): ' : '') + R.name, exitName: X.name, verdict, why: why.join('; ') || 'passed both years, 1.5x costs, the last 6 months, 30+ days, 20+ stocks, no single-trade luck. Next gate: 30+ positive live paper trades before any alert', results: Rr, days: new Set(a.map(x => x.d)).size, stocks: new Set(a.map(x => x.sym)).size }; }
  const variants = Object.keys(OUTR).length, passing = Object.values(OUTR).filter(x => x.verdict === 'PROMISING').length;
  const out = { version: IG_VERSION, variants, passing, generatedAt: new Date().toISOString(), status: 'OK', window: D[T - LOOK] + ' to ' + D[T - 1], candidates: cand.length, tested: have, floatSource: { knownThatDay: pitN, todaysCount: todayN, none: have - pitN - todayN }, addedThisRun: got, refused, rules: OUTR };
  fs.writeFileSync(IGOUT, JSON.stringify(out, null, 1));
  const ln = (q) => !q || !q.n ? 'no trades' : q.n + ' trades, ' + Math.round(q.win * 100) + '% won, avg ' + pc(q.avg) + ', median ' + pc(q.med) + ', best moment ' + pc(q.best);
  const pass = Object.values(OUTR).filter(x => x.verdict === 'PROMISING');
  const msg = ['IGNITION TEST (minute by minute: buying a stock WHILE it starts to run), ' + out.window, have + ' of ' + cand.length + ' days on which a stock touched +10% are tested so far (+' + got + ' this week' + (refused ? '; the data plan refused minute bars' : '') + ').', '',
    ...Object.values(OUTR).map(x => '- ' + x.rule + ' ' + x.name + ' | ' + x.exit + ': ' + x.verdict + ' | newer year ' + ln(x.results.newer)), '',
    variants + ' rule/exit versions were tested, so ' + Math.max(1, Math.round(variants * 0.05)) + ' could pass by luck alone: a pass still needs 30+ positive live paper trades (at 1.5x costs) before any alert.',
    pass.length ? 'PASSED THE HISTORY TEST: ' + pass.map(x => x.rule + '/' + x.exit).join(', ') + '. Now on live paper.' : 'Nothing passed yet: the live watcher logs every ignition on PAPER only.', 'Research, not an order. Not financial advice, not a halal ruling.'];
  console.log(msg.join('\n'));
  if (env.TG_TOKEN && env.TG_CHAT && (!QUIET || pass.length)) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
  process.exit(0);
}

// ======================= MODE=study =======================
if (MODE === 'study') {
  const trades = Object.fromEntries(RULES.map(r => [r.id, []]));
  // DECODE: feature values of each stock-day, and whether a +20% close-to-close jump followed the next day
  const FEAT = [['vol', ['volume under 1x its 20 day average', 'volume 1-2x', 'volume 2-4x', 'volume 4x+']], ['day', ['fell 5%+', 'fell 0-5%', 'rose 0-5%', 'rose 5-15%', 'rose 15%+']], ['px', ['price 1-3 USD', 'price 3-10 USD', 'price 10-50 USD', 'price 50+ USD']],
    ['run', ['no 20%+ day in the last 20 sessions', 'a 20%+ day in the last 20 sessions']], ['loc', ['closed in the bottom quarter of its range', 'closed mid-range', 'closed in the top quarter']], ['r5', ['5 days: down 20%+', '5 days: down 0-20%', '5 days: up 0-20%', '5 days: up 20%+']],
    ['y52', ['within 20% of its 1-year low', 'mid-range of its year', 'within 10% of its 1-year high', 'under a year of history']], ['dv', ['traded under 1M USD', 'traded 1-5M USD', 'traded 5-25M USD', 'traded 25M USD+']]];
  const OFF = []; let nv = 0; for (const [, vals] of FEAT) { OFF.push(nv); nv += vals.length; }
  const LBL = FEAT.flatMap(([, v]) => v), NF = FEAT.length, NP = nv * nv;
  const S = [0, 1].map(() => ({ n: new Float64Array(nv), y: new Float64Array(nv), r: new Float64Array(nv), pn: new Float64Array(NP), py: new Float64Array(NP), pr: new Float64Array(NP), N: 0, Y: 0, R: 0 }));
  const fv = new Int32Array(NF);
  for (const [sym, c] of bars) { if (sym === 'SPY' || c.length < 30) continue; const X = prep(c);
    for (let i = 21; i < c.length; i++) {
      for (const r of RULES) { if (r.fire(c, i, X, sym)) { const o = outcome(r, c, i); if (o && isFinite(o.g) && o.g < 5) trades[r.id].push({ t: c[i].t, sym, ...o }); } }
      // decode sample: stock-day i with a next session
      const n1 = c[i + 1]; if (!n1 || n1.t !== c[i].t + 1 || !cons(c, i, 5) || !X.av[i]) continue; const b = c[i], dv = b.c * b.v; if (!(b.c >= 1) || dv < 3e5) continue;
      const vr = b.v / X.av[i], ch = chgOf(c, i), r5 = b.c / c[i - 5].c - 1, lo = locOf(b);
      fv[0] = vr < 1 ? 0 : vr < 2 ? 1 : vr < 4 ? 2 : 3; fv[1] = ch <= -0.05 ? 0 : ch < 0 ? 1 : ch < 0.05 ? 2 : ch < 0.15 ? 3 : 4; fv[2] = b.c < 3 ? 0 : b.c < 10 ? 1 : b.c < 50 ? 2 : 3; fv[3] = X.run20[i] ? 1 : 0;
      fv[4] = lo <= 0.25 ? 0 : lo >= 0.75 ? 2 : 1; fv[5] = r5 <= -0.2 ? 0 : r5 < 0 ? 1 : r5 < 0.2 ? 2 : 3; fv[6] = X.hi52[i] === null ? 3 : b.c <= X.lo52[i] * 1.2 ? 0 : b.c >= X.hi52[i] * 0.9 ? 2 : 1; fv[7] = dv < 1e6 ? 0 : dv < 5e6 ? 1 : dv < 25e6 ? 2 : 3;
      const ret = Math.max(-0.9, Math.min(3, n1.c / b.c - 1)), y = ret >= 0.2 ? 1 : 0, rr = ret - costOf(b.c), H = S[b.t < mid ? 0 : 1];
      H.N++; H.Y += y; H.R += rr;
      for (let a = 0; a < NF; a++) { const ga = OFF[a] + fv[a]; H.n[ga]++; H.y[ga] += y; H.r[ga] += rr; for (let q = a + 1; q < NF; q++) { const k = ga * nv + OFF[q] + fv[q]; H.pn[k]++; H.py[k] += y; H.pr[k] += rr; } } } }
  // rule verdicts
  const RES = {};
  for (const r of RULES) { const a = trades[r.id], o = a.filter(x => x.t < mid), w = a.filter(x => x.t >= mid), why = [];
    const R = { older: stats(o), newer: stats(w), stress: stats(w, 1.5), last12: stats(a.filter(x => x.t >= T - 252)) };
    let verdict = 'PROMISING';
    if ((R.older.n || 0) < 30 || (R.newer.n || 0) < 30) { verdict = 'NOT PROVEN'; why.push('too few trades (' + (R.older.n || 0) + ' / ' + (R.newer.n || 0) + ')'); }
    else { if (!(R.older.avg > 0)) why.push('lost money in the older half'); if (!(R.newer.avg > 0)) why.push('lost money in the newer half'); if (!(R.stress.avg > 0)) why.push('loses at 1.5x costs');
      if (!((R.newer.pf || 0) > 1.15)) why.push('profit factor ' + (R.newer.pf ? R.newer.pf.toFixed(2) : 'n/a'));
      { const net = w.map(x => x.g - costOf(x.e)).sort((u, v) => v - u); if (net.length > 2 && !(net.slice(2).reduce((u, v) => u + v, 0) / (net.length - 2) > 0)) why.push('loses without its 2 best trades'); } if (R.last12.n >= 10 && !(R.last12.avg > 0)) why.push('lost money in the last 12 months'); if (R.newer.bestShare > 0.4) why.push('one trade made 40%+ of the gains');
      if (why.length) verdict = R.older.avg > 0 && R.newer.avg > 0 ? 'NOT PROVEN' : 'REJECTED'; }
    RES[r.id] = { name: r.name, kind: r.kind, live: r.live, verdict, why: why.join('; ') || 'passed both halves, 1.5x costs, the last 12 months, no single-trade luck', results: R, examples: w.filter(x => x.g >= 0.15).slice(-5).map(x => ({ sym: x.sym, d: D[x.t], g: +x.g.toFixed(3) })) }; }
  // decode report: single features and pairs. FOUND on the older half (lift 2x+, 300+ cases), CONFIRMED on the newer half.
  const base = S.map(H => ({ p: H.Y / H.N, ev: H.R / H.N, n: H.N }));
  const single = [];
  for (let g = 0; g < nv; g++) { const o = S[0], w = S[1]; if (o.n[g] < 300 || w.n[g] < 300) continue; single.push({ what: LBL[g], older: { n: o.n[g], p: o.y[g] / o.n[g], lift: o.y[g] / o.n[g] / base[0].p, ev: o.r[g] / o.n[g] }, newer: { n: w.n[g], p: w.y[g] / w.n[g], lift: w.y[g] / w.n[g] / base[1].p, ev: w.r[g] / w.n[g] } }); }
  single.sort((a, b) => b.older.lift - a.older.lift);
  const pairs = [];
  for (let a = 0; a < nv; a++) for (let b = a + 1; b < nv; b++) { const k = a * nv + b, o = S[0], w = S[1]; if (o.pn[k] < 300) continue; const lo = o.py[k] / o.pn[k] / base[0].p; if (lo < 2) continue;
    pairs.push({ what: LBL[a] + ' + ' + LBL[b], k, older: { n: o.pn[k], p: o.py[k] / o.pn[k], lift: lo, ev: o.pr[k] / o.pn[k] }, newer: { n: w.pn[k], p: w.pn[k] ? w.py[k] / w.pn[k] : null, lift: w.pn[k] ? w.py[k] / w.pn[k] / base[1].p : null, ev: w.pn[k] ? w.pr[k] / w.pn[k] : null } }); }
  pairs.sort((a, b) => b.older.lift - a.older.lift);
  const confirmed = pairs.filter(x => x.newer.n >= 100 && x.newer.lift >= 2);
  // the ONE pattern chosen on the older half by what buying it EARNED (close, held to the next close, after costs); judged only on the newer half
  const byEv = pairs.filter(x => x.older.n >= 300).sort((a, b) => b.older.ev - a.older.ev)[0] || null;
  const chosen = byEv ? { what: byEv.what, older: byEv.older, newer: byEv.newer, verdict: byEv.newer.n >= 50 && byEv.newer.ev > 0 && byEv.older.ev > 0 ? 'HOLDS UP on unseen data (paper next)' : 'FAILED on unseen data', note: 'bought at the close, sold at the next close, after costs, no stop' } : null;
  // MANIFEST: what the five years really contain, so "whole market, dead stocks included" can be checked
  const lastSeen = new Map(), counts = []; D.forEach((d, t) => { const x = store.days[d]; counts.push(x.T.length); for (const s of x.T) lastSeen.set(s, t); });
  const manifest = { first: D[0], last: D[T - 1], sessions: T, symbols: lastSeen.size, perDayAvg: Math.round(counts.reduce((a, b) => a + b, 0) / T), perDayMin: Math.min(...counts), stoppedTradingBeforeEnd: [...lastSeen.values()].filter(t => t < T - 10).length,
    filter: 'common stocks and ADRs (Massive reference list), 1 USD+ and 300K USD+ traded that day', prices: 'split-adjusted (Massive adjusted=true); ticker changes are NOT linked (a renamed company shows as two stocks)', floats: 'SEC share counts known on each day (data/shares.json.gz) where available; today\u2019s count only as a fallback (approximation)' };
  const out = { generatedAt: new Date().toISOString(), status: 'OK', from: D[0], to: D[T - 1], sessions: T, manifest, rules: RES, decode: { base, single: single.slice(0, 40), pairs: pairs.slice(0, 40), confirmed: confirmed.slice(0, 15), chosen } };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  const ln = (s) => !s || !s.n ? 'no trades' : s.n + ' trades, ' + Math.round(s.win * 100) + '% won, avg ' + pc(s.avg) + ', median ' + pc(s.med) + (s.pf ? ', PF ' + s.pf.toFixed(2) : '') + ', stopped ' + Math.round(s.stopped * 100) + '%';
  const pass = Object.values(RES).filter(x => x.verdict === 'PROMISING');
  const msg = ['FAST-MOVER LAB (whole market incl. 1-3 USD stocks, ' + D[0] + ' to ' + D[T - 1] + ', conservative fills, costs by price)', '',
    'A +20% next-day jump follows ' + (base[1].p * 100).toFixed(2) + '% of stock-days (newer half). Buying a random stock at the close and selling the next close earned ' + pc(base[1].ev) + ' after costs.', '',
    'WHAT CAME BEFORE THE JUMPS (found on the older half, checked on the newer half; lift = how many times more often than a random stock-day):',
    ...confirmed.slice(0, 6).map(x => '- ' + x.what + ': lift ' + x.older.lift.toFixed(1) + 'x -> ' + x.newer.lift.toFixed(1) + 'x; but buying it earned ' + pc(x.older.ev) + ' / ' + pc(x.newer.ev)), ...(confirmed.length ? [] : ['- no pattern kept its lift on unseen data']),
    ...(chosen ? ['Best pattern by profit (chosen on the older half): ' + chosen.what + ' -> unseen half ' + pc(chosen.newer.ev) + ' a trade (' + chosen.newer.n + ' cases): ' + chosen.verdict + '.'] : []), '',
    'DAY-TRADE AND OVERNIGHT RULES (newer half):', ...Object.entries(RES).map(([k, x]) => '- ' + x.name + ': ' + x.verdict + ' | ' + ln(x.results.newer) + ' | the best moment of the day averaged ' + pc(x.results.newer.best)), '',
    pass.length ? 'PASSED: ' + pass.map(x => x.name).join('; ') + '. From tomorrow its candidates come each morning as a DAY-TRADE LIST (paper record keeps checking).' : 'Nothing passed. Each morning the candidates are still logged on PAPER, so a rule can prove itself on new days. Nothing changes in ACTIONS.',
    'Note the gap between "best moment of the day" and the real result: that is the money a chart shows but a trader rarely gets.', 'Research, not an order. Not financial advice, not a halal ruling.'];
  console.log(msg.join('\n'));
  if (env.TG_TOKEN && env.TG_CHAT && (!QUIET || pass.length)) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
  process.exit(0);
}

// ======================= MODE=live =======================
// 1. score yesterday's paper candidates on the newest session; 2. build today's candidates; 3. send the list for passing rules
const LAB = readJson(OUT, null), P = readJson(PAPER, { open: [], done: [] }), last = T - 1, lastD = D[last];
P.open = P.open || []; P.done = P.done || [];
const at = (sym, t) => { const c = bars.get(sym); if (!c) return null; for (let k = c.length - 1; k >= 0 && c[k].t >= t; k--) if (c[k].t === t) return { c, i: k }; return null; };
const still = [];
for (const x of P.open) { const t = D.indexOf(x.day); if (t < 0) { if (x.day > lastD) still.push(x); else P.done.push({ ...x, res: 'no data' }); continue; }
  const r = RULES.find(q => q.id === x.rule), a = at(x.sym, t); if (!r || !a) { P.done.push({ ...x, res: 'no trade (not traded that day)' }); continue; }
  const { c, i } = a; if (!cons(c, i)) { P.done.push({ ...x, res: 'no trade' }); continue; }
  const g = gapOf(c, i); if (r.cond && (g < r.cond.lo || g > r.cond.hi)) { P.done.push({ ...x, res: 'skipped: opened ' + pc(g) + ', outside the rule' }); continue; }
  const o = outcome(r, c, i); if (!o) { P.done.push({ ...x, res: 'no trade' }); continue; }
  P.done.push({ ...x, res: 'traded', g: +o.g.toFixed(4), net: +(o.g - costOf(o.e)).toFixed(4), e: o.e }); }
P.open = still; P.done = P.done.slice(-3000);
const nextDay = (() => { let ms = Date.parse(lastD + 'T12:00:00Z'); do { ms += 864e5; } while ([0, 6].includes(new Date(ms).getUTCDay())); return iso(ms); })();
const today = [];
for (const [sym, c] of bars) { if (sym === 'SPY') continue; const i = c.length - 1; if (i < 25 || c[i].t !== last) continue; const X = prep(c);
  for (const r of RULES) { if (r.live !== 'list' || !r.pick || !liquid(c, i) || !r.pick(c, i, X)) continue;
    const b = c[i]; today.push({ rule: r.id, sym, day: nextDay, prev: +b.c.toFixed(2), lo: +(b.c * (1 + r.cond.lo)).toFixed(2), hi: +(b.c * (1 + r.cond.hi)).toFixed(2), chg: +chgOf(c, i).toFixed(3) }); } }
{ const have = new Set(P.open.map(x => x.rule + x.sym + x.day)); for (const x of today) if (!have.has(x.rule + x.sym + x.day)) P.open.push(x); }
const stat = (id) => { const a = P.done.filter(x => x.rule === id && x.res === 'traded'); return a.length ? { n: a.length, avg: a.reduce((s, x) => s + x.net, 0) / a.length, win: a.filter(x => x.net > 0).length / a.length } : { n: 0 }; };
const paper = Object.fromEntries(RULES.map(r => [r.id, stat(r.id)]));
P.record = paper; P.updated = new Date().toISOString(); fs.writeFileSync(PAPER, JSON.stringify(P));
// IGNITION paper: the watcher's ignitions of earlier days, scored on minute bars exactly like the Saturday test.
// Up to 400 a morning (was 80): IG8 alone logs 50-230 a day, so 80 left a growing backlog and scored only each day's EARLIEST alerts.
// Paid Massive plan: 400 calls take about a minute.
{ const { scoreIgnitionPaper } = await import('./ignition-paper.mjs');   // the scoring itself lives in ignition-paper.mjs (tested: test/ignition-paper.test.mjs)
  const L = fs.existsSync('data/ignition-paper.jsonl') ? fs.readFileSync('data/ignition-paper.jsonl', 'utf8').split('\n').filter(Boolean).map(x => { try { return JSON.parse(x); } catch (e) { return null; } }).filter(Boolean) : [];
  const IR = readJson('data/ignition-results.json', { done: {} });
  const { asked, record: rec } = await scoreIgnitionPaper(L, IR, { today: iso(Date.now()), max: +(env.IG_EVAL || 400), minuteBars: (sym, d) => api(`/v2/aggs/ticker/${sym}/range/1/minute/${d}/${d}?adjusted=true&sort=asc&limit=50000`) });
  IR.updated = new Date().toISOString(); fs.writeFileSync('data/ignition-results.json', JSON.stringify(IR));
  if (asked) console.log('ignition paper: ' + asked + ' ignitions scored; record ' + Object.entries(rec).map(([k, r]) => k + ' ' + r.n + '/' + pc(r.avg)).join(', ')); }
const passed = new Set(LAB && LAB.rules ? Object.entries(LAB.rules).filter(([, x]) => x.verdict === 'PROMISING').map(([k]) => k) : []);
const halal = readJson('data/halal.json', {}), notHalal = (s) => halal[s] && halal[s].s === 'fail';
const list = today.filter(x => passed.has(x.rule) && !notHalal(x.sym)).sort((a, b) => b.chg - a.chg).slice(0, 12);
fs.writeFileSync(LIVE, JSON.stringify({ updated: new Date().toISOString(), day: nextDay, from: lastD, list, logged: today.length, paper }, null, 1));
console.log('fast-mover live: ' + today.length + ' paper candidates for ' + nextDay + ', ' + list.length + ' from passed rules; paper record: ' + RULES.map(r => r.id + ' ' + (paper[r.id].n ? paper[r.id].n + ' / ' + pc(paper[r.id].avg) : '0')).join(', '));
if (list.length && env.TG_TOKEN && env.TG_CHAT) {
  const name = (id) => (LAB.rules[id] || {}).name || id, t = (id) => (LAB.rules[id] || {}).results;
  const msg = ['DAY-TRADE LIST for ' + nextDay + ' (rules that passed the 5-year fast-mover test; paper keeps checking them)', '',
    ...list.map(x => x.sym + ' (closed ' + x.prev + ', ' + pc(x.chg) + ' yesterday): BUY AT THE OPEN only if it opens between ' + x.lo + ' and ' + x.hi + '. STOP 8% under your price. SELL AT THE CLOSE (before 11 pm Kuwait), same day.\n  rule: ' + name(x.rule) + ' | tested: ' + (t(x.rule) ? Math.round(t(x.rule).newer.win * 100) + '% won, average ' + pc(t(x.rule).newer.avg) + ' a trade' : 'n/a')),
    '', 'Check ZAD first. 1,000 USD per trade at most: these are the riskiest trades in the system. Not financial advice, not a halal ruling.'];
  await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
}
