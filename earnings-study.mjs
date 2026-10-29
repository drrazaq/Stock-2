import {telegramFetch as sharedTelegramFetch} from './telegram-delivery.mjs';
const telegramFetch=(u,o)=>sharedTelegramFetch(u,o,{research:true});
// EARNINGS SURPRISE DRIFT (post-earnings announcement drift, "PEAD"). Read-only research; never places an order.
// Idea (well documented in finance research): after a clearly better-than-expected earnings report, the price often keeps
// drifting the same way for weeks. Stock-2 only uses it if it passes the same fair test as every other rule.
//
// MODE=fetch (weekdays, smart-money workflow): builds an earnings history file, a few hundred stocks a day, from
//   Alpha Vantage (EARNINGS, full history, 25 calls a day on the free plan) and FMP (if the key's plan allows it),
//   plus the last days' reports for ALL companies from Finnhub's earnings calendar (actual vs estimate), which also keeps
//   the history growing forward. Public company data only; stored in data/earnings-cache.json.gz.
// MODE=study (Sunday, leaders-study workflow, after the 5-year price cache is loaded): the fair test.
//   Rule fixed in advance: EPS beat the estimate by 10%+ (estimate at least 0.05 USD in size), the reaction day closed up 3%+
//   in the top half of its range, 5 USD+, 5M USD+ traded. Buy the next open (skip if 3%+ above the reaction close), stop
//   0.5% under the reaction-day low (15% or less), sell on a close under the 20 day average or after 40 sessions.
//   Judged on the older and newer half at 0.8% cost, 1.2% stress, last 12 months, against the S&P 500 and against ALL earnings
//   reactions bought the same way (so the surprise itself must add value). Since 22 Oct 2026 also the house gates (luck bar,
//   average stock, same stock on other days, without the 2 best trades; see MODE=study below) and a frozen first run.
//   Verdict saved in data/earnings-study.json.
import fs from 'node:fs';
import zlib from 'node:zlib';
const env = process.env, MODE = env.MODE === 'study' ? 'study' : 'fetch';
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const AV = local(env.AV_BASE) || 'https://www.alphavantage.co', FMPB = local(env.FMP_BASE) || 'https://financialmodelingprep.com', FH = local(env.FH_BASE) || 'https://finnhub.io/api/v1', TG = local(env.TG_BASE) || 'https://api.telegram.org';
const CACHE = 'data/earnings-cache.json.gz', OUT = 'data/earnings-study.json', RECENT = 'data/earnings-recent.json';
const sleep = (ms) => new Promise(r => setTimeout(r, ms)), iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const pc = (x, d = 1) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return d; } };
const QUIET = (() => { const s = readJson('data/settings.json', {}); return s.quiet !== false; })();
fs.mkdirSync('data', { recursive: true });
let cache = { syms: {}, tried: {} };
try { cache = JSON.parse(zlib.gunzipSync(fs.readFileSync(CACHE)).toString()); } catch (e) {}
cache.syms = cache.syms || {}; cache.tried = cache.tried || {};
const save = () => fs.writeFileSync(CACHE, zlib.gzipSync(JSON.stringify(cache)));
// one report: { d: report date, t: 'bmo'|'amc'|null, a: actual EPS, e: estimated EPS }
const eps=x=>typeof x==='number'&&Number.isFinite(x)?x:typeof x==='string'&&/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(x.trim())?Number(x):NaN;
const addRep = (sym, r) => { if (!r || typeof r.d!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.d)||!Number.isFinite(Date.parse(r.d+'T00:00:00Z'))||iso(Date.parse(r.d+'T00:00:00Z'))!==r.d||r.d>iso(Date.now())||!Number.isFinite(r.a)||!Number.isFinite(r.e)) return false; const L = cache.syms[sym] || (cache.syms[sym] = []); const k = L.findIndex(x => x.d === r.d);if(cache.revisionConflicts?.[sym+'|'+r.d])return false; if (k >= 0) {if(L[k].a!==r.a||L[k].e!==r.e||(L[k].t??null)!==(r.t??null)){cache.revisionConflicts||={};cache.revisionConflicts[sym+'|'+r.d]||={firstObservedAt:new Date().toISOString(),original:{...L[k]},reported:r};return false;}}else L.push({...r,firstObservedAt:new Date().toISOString()}); L.sort((x, y) => x.d < y.d ? -1 : 1);return true; };
async function getJson(url) { try { const r = await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)}); if (r.status === 401 || r.status === 403 || r.status === 402) return { refused: r.status }; if (!r.ok) return null; return await r.json(); } catch (e) { return null; } }

if (MODE === 'fetch') {
  const sig = readJson('data/signals.json', {}), order = [...new Set([...(sig.stocks || []).map(x => x.sym), ...((sig.uni || []).map(x => x.sym))])].filter(s => /^[A-Z]{1,5}$/.test(s));
  const today = iso(Date.now()), stale = (s) => !cache.tried[s] || (Date.now() - Date.parse(cache.tried[s])) / 864e5 > 100;
  const todo = order.filter(stale); let av = 0, fmp = 0, fmpOff = false, avOff = false;
  // 1. Alpha Vantage: full quarterly history with report date and time (free plan: 25 calls a day, 5 a minute)
  if (env.ALPHAVANTAGE_KEY) for (const sym of todo) { if (av >= +(env.AV_CALLS || 25) || avOff) break;
    const j = await getJson(AV + '/query?function=EARNINGS&symbol=' + sym + '&apikey=' + encodeURIComponent(env.ALPHAVANTAGE_KEY)); av++;
    if (j && (j.Note || j.Information)) { avOff = true; console.log('Alpha Vantage limit reached:', String(j.Note || j.Information).slice(0, 120)); break; }
    if (j && Array.isArray(j.quarterlyEarnings)) { for (const q of j.quarterlyEarnings) addRep(sym, { d: q.reportedDate, t: /pre/i.test(q.reportTime || '') ? 'bmo' : /post/i.test(q.reportTime || '') ? 'amc' : null, a: eps(q.reportedEPS), e: eps(q.estimatedEPS) }); cache.tried[sym] = today; }
    if (!local(env.AV_BASE)) await sleep(13000); }
  // 2. FMP (only if the key's plan includes earnings history): report dates, actual and estimated EPS
  if (env.FMP_KEY) for (const sym of todo.filter(s => cache.tried[s] !== today)) { if (fmp >= +(env.FMP_CALLS || 200) || fmpOff) break;
    const j = await getJson(FMPB + '/stable/earnings?symbol=' + sym + '&limit=40&apikey=' + encodeURIComponent(env.FMP_KEY)); fmp++;
    if (j && j.refused) { fmpOff = true; console.log('FMP earnings history is not in this plan (HTTP ' + j.refused + '); Alpha Vantage and Finnhub only.'); break; }
    if (Array.isArray(j)) { for (const q of j) addRep(sym, { d: String(q.date || '').slice(0, 10), t: null, a: eps(q.epsActual), e: eps(q.epsEstimated) }); cache.tried[sym] = today; }
    if (!local(env.FMP_BASE)) await sleep(300); }
  // 3. Finnhub calendar: the last 10 days of reports for every company (actual vs estimate, before/after the market)
  let recent = [], calendarStatus='NOT_FETCHED',calendarRejected=0;
  if (env.FINNHUB_KEY) { const j = await getJson(FH + '/calendar/earnings?from=' + iso(Date.now() - 10 * 864e5) + '&to=' + today + '&token=' + encodeURIComponent(env.FINNHUB_KEY));
    const rows = j&&!j.error&&Array.isArray(j.earningsCalendar)?j.earningsCalendar:[];calendarStatus=j&&!j.error&&Array.isArray(j.earningsCalendar)?'OBSERVED':'UNKNOWN';
    for (const q of rows) { if (!q||typeof q!=='object'||!/^[A-Z]{1,5}$/.test(q.symbol || '')) {calendarRejected++;continue;}
      const r = { d: q.date, t: q.hour === 'bmo' ? 'bmo' : q.hour === 'amc' ? 'amc' : null, a: eps(q.epsActual), e: eps(q.epsEstimate) }; if(!addRep(q.symbol,r)){calendarRejected++;continue;}const stored=cache.syms[q.symbol].find(x=>x.d===r.d);recent.push({ sym: q.symbol,...r,sourceId:q.symbol+'|'+r.d,firstObservedAt:stored.firstObservedAt||null }); } }
  fs.writeFileSync(RECENT, JSON.stringify({ updated: new Date().toISOString(), reports: recent,sourceStatus:{FINNHUB_CALENDAR:{status:calendarRejected&&calendarStatus==='OBSERVED'?'PARTIAL_OR_UNKNOWN':calendarStatus,rejectedRows:calendarRejected}} }, null, 1));
  save();
  console.log('earnings history: ' + Object.keys(cache.syms).length + ' stocks (' + Object.values(cache.syms).reduce((a, x) => a + x.length, 0) + ' reports) | today: Alpha Vantage ' + av + ' calls, FMP ' + fmp + (fmpOff ? ' (not in plan)' : '') + ', Finnhub calendar ' + recent.length + ' recent reports | still to fetch ' + todo.filter(s => cache.tried[s] !== today).length);
  process.exit(0);
}

// ---------------- MODE=study ----------------
// HOUSE GATES (22 Oct 2026, audit item 1; the rule itself is unchanged): for the main rule, in the older half, the newer half and
// the whole period, at 0.8% cost: 30+ trades; average after costs above 0; date-clustered t (one average per entry day, t over the
// days) at or above the luck bar = max(3.0, data/agent-league.json `bar`); better than the average stock bought on the same entry
// days for the same holding window (needs the whole-market study cache, study-cache/grouped.json.gz); better than the S&P 500 over
// the same days; better than the same stocks bought on random NON-earnings days with the same exit rule (and t 2+ on that); still
// above 0 without the 2 best trades; and still above 0 at 1.2% cost. Distinct entry days and distinct stocks are reported.
// RUN ONCE AS WRITTEN: the first complete verdict (both halves 30+ trades and every yardstick computed) is frozen in `firstRun` and
// never overwritten; later runs go to `latest` (label "monitoring"). The top-level `verdict` is always firstRun.verdict once it exists.
const PREV = readJson(OUT, {});
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) {
  console.log('earnings study: no price cache (study-cache/grouped.json.gz); previous result kept');   // never wipe a frozen first run
  fs.writeFileSync(OUT, JSON.stringify({ ...PREV, lastAttempt: { at: new Date().toISOString(), status: 'NOT RUN', why: 'no price cache' } }, null, 1)); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const bars = new Map(); D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { let a = bars.get(x.T[j]); if (!a) bars.set(x.T[j], a = []); a.push({ t, o: x.o[j], h: x.h[j], l: x.l[j], c: x.c[j], v: x.v[j] }); } });
// DEAD STOCKS (review S-18, 22 Oct): x rows = the same stocks after they fell under the cache's 3 USD / 1M USD filter. Before, a stock
// bought on a beat that then collapsed vanished before its exit and the trade was DROPPED (survivorship bias). The x rows are used to
// value EXITS only (trade walk, stop, 20-day average, the average-stock yardstick), never an entry: entries are still picked from the
// main rows exactly as before.
const xbars = new Map(); D.forEach((d, t) => { const x = store.days[d].x; if (x && x.T) for (let j = 0; j < x.T.length; j++) { if (!(x.c[j] > 0)) continue; let a = xbars.get(x.T[j]); if (!a) xbars.set(x.T[j], a = []); a.push({ t, o: x.o[j], h: x.h[j], l: x.l[j], c: x.c[j], v: x.v[j], x: true }); } });
const withX = (sym) => { const c = bars.get(sym), a = xbars.get(sym); if (!c || !a || !a.length) return c; const seen = new Set(c.map(b => b.t)); return [...c, ...a.filter(b => !seen.has(b.t))].sort((p, q) => p.t - q.t); };
const spy = bars.get('SPY'), spyC = new Array(T).fill(null), spyO = new Array(T).fill(null); if (spy) spy.forEach(b => { spyC[b.t] = b.c; spyO[b.t] = b.o; });
const spyRet = (a, b) => spyC[a] && spyC[b] ? spyC[b] / spyC[a] - 1 : null, mid = Math.floor(T / 2), COST = 0.008, STRESS = 0.012;
const spyWin = (a, b, k) => { const x = spyO[a], y = k === 'o' ? spyO[b] : spyC[b]; return x && y ? y / x - 1 : null; };   // S&P 500 from the entry open to the exit price of the same kind
const nreps = Object.values(cache.syms).reduce((a, x) => a + x.length, 0);
const LG = readJson('data/agent-league.json', {}), LEAGUE_BAR = typeof LG.bar === 'number' ? LG.bar : null, BAR = Math.max(3.0, LEAGUE_BAR || 0);
const avg = (a, p) => { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= p) s -= a[i - p]; if (i >= p - 1) o[i] = s / p; } return o; };
function tradeMA(c, e, entry, stop, ma, hold) {   // stop first (gaps fill at the open); else next open after a close under the average; else the close after `hold` sessions
  for (let j = e; j < c.length && c[j].t <= c[e].t + hold - 1; j++) { const b = c[j];
    if (j > e && b.o <= stop) return { exit: b.o, j, k: 'o' }; if (b.l <= stop) return { exit: stop, j, k: 'c' };
    if (ma[j] && b.c < ma[j]) { const n = c[j + 1]; if (!n) return null; return { exit: n.o, j: j + 1, k: 'o' }; } }
  let j = e; while (j + 1 < c.length && c[j + 1].t <= c[e].t + hold - 1) j++; return c[j].t === c[e].t + hold - 1 || c[j + 1] ? { exit: c[j].c, j, k: 'c' } : null;
}
// ---- yardstick 1: the average stock, bought at the same entry open, sold at the same exit day (whole-market cache only)
const WHOLE = bars.size >= 1000;   // a whole-market cache has thousands of stocks; a small/partial price file cannot stand for "the average stock"
const mktMemo = new Map(); let OPEN = null, CLOSE = null, LIQ = null;
let XOPEN = null, XCLOSE = null;   // exit prices of stocks after they fell under the filter (review S-18)
if (WHOLE) { const syms = [...bars.keys()].filter(s => s !== 'SPY'), NS = syms.length; OPEN = new Float32Array(NS * T).fill(NaN); CLOSE = new Float32Array(NS * T).fill(NaN); const V = new Float32Array(NS * T).fill(NaN);
  syms.forEach((s, i) => { for (const b of bars.get(s)) { OPEN[i * T + b.t] = b.o; CLOSE[i * T + b.t] = b.c; V[i * T + b.t] = b.v; } });
  XOPEN = new Float32Array(NS * T).fill(NaN); XCLOSE = new Float32Array(NS * T).fill(NaN); syms.forEach((s, i) => { for (const b of xbars.get(s) || []) { XOPEN[i * T + b.t] = b.o; XCLOSE[i * T + b.t] = b.c; } });
  LIQ = Array.from({ length: T }, () => []); for (let i = 0; i < NS; i++) for (let t = 1; t < T; t++) { const pc0 = CLOSE[i * T + t - 1]; if (pc0 >= 5 && pc0 * V[i * T + t - 1] >= 5e6 && OPEN[i * T + t] > 0) LIQ[t].push(i); } }
const mktWin = (a, b, k) => { if (!WHOLE) return null; const key = a + '_' + b + k; if (mktMemo.has(key)) return mktMemo.get(key); const A = k === 'o' ? OPEN : CLOSE; let s = 0, n = 0;
  const AX = k === 'o' ? XOPEN : XCLOSE;
  for (const i of LIQ[a]) { const x = OPEN[i * T + a]; let y = A[i * T + b]; if (!(y > 0)) y = AX[i * T + b]; if (x > 0 && y > 0) { const r = y / x - 1; if (Math.abs(r) <= 3) { s += r; n++; } } } const v = n >= 50 ? s / n : null; mktMemo.set(key, v); return v; };
// ---- seeded random numbers (same sample every run for the same data)
const rng = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let z = Math.imul(seed ^ seed >>> 15, 1 | seed); z = z + Math.imul(z ^ z >>> 7, 61 | z) ^ z; return ((z ^ z >>> 14) >>> 0) / 4294967296; };
const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const CTRL_PER_SYM = 40;   // random non-earnings entry days per stock (whole period) for the same-stock yardstick
const groups = { main: [], noPrice: [], all: [], neg: [] }, ownCtrl = new Map();   // ownCtrl: sym -> [{ t, g }]
for (const [sym, reps] of Object.entries(cache.syms)) {
  const c = bars.get(sym); if (!c || c.length < 60) continue; const idx = new Map(c.map((b, i) => [b.t, i])); let free = -1; const near = new Set();
  // exits walk the series with the x rows (review S-18); `free` (no overlapping trades) is kept on the main rows as before
  const cx = withX(sym), idxX = new Map(cx.map((b, i) => [b.t, i])), m20 = avg(cx.map(x => x.c), 20), lastMainAt = (t) => { let k = idx.has(t) ? idx.get(t) : -1; if (k < 0) for (k = c.length - 1; k >= 0 && c[k].t > t; k--); return k; }, exitAt = (t, e, stop) => { const r = tradeMA(cx, idxX.get(t), e, stop, m20, 40); return r ? { ...r, t: cx[r.j].t } : null; };
  for (const r of reps) {
    // the reaction day: before the open -> that session; after the close -> the next session; unknown -> the bigger gap of the two
    let t0 = null; for (let k = 0; k < 5 && t0 === null; k++) { const d = iso(Date.parse(r.d + 'T12:00:00Z') + k * 864e5); if (tOf.has(d)) t0 = tOf.get(d); }
    if (t0 === null) continue; let i = idx.get(t0); if (i === undefined) continue; for (let k = i - 2; k <= i + 7; k++) near.add(k);   // no control entries around any report
    if (i < 25) continue;
    if (r.t === 'amc') i = i + 1; else if (r.t !== 'bmo' && c[i + 1] && c[i + 1].t === c[i].t + 1) { const g0 = Math.abs(c[i].o / c[i - 1].c - 1), g1 = Math.abs(c[i + 1].o / c[i].c - 1); if (g1 > g0) i = i + 1; }
    const b = c[i], p = c[i - 1], n1 = c[i + 1]; if (!b || !p || !n1 || n1.t !== b.t + 1) continue;
    if (!(b.c >= 5) || b.c * b.v < 5e6 || !(Math.abs(r.e) >= 0.05)) continue;
    const sur = (r.a - r.e) / Math.abs(r.e), up = b.c / p.c - 1, loc = b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5, e = n1.o, stop = b.l * 0.995;
    if (!(e > stop) || (e - stop) / e > 0.15 || e > b.c * 1.03) continue;
    const res = exitAt(n1.t, e, stop); if (!res) continue; const tx = res.t;
    const tr = { sym, t: n1.t, tx, gross: res.exit / e - 1, spy: spyRet(n1.t, tx), spyW: spyWin(n1.t, tx, res.k), mkt: mktWin(n1.t, tx, res.k), sur };
    const priceOk = up >= 0.03 && loc >= 0.5;
    groups.all.push(tr); if (sur >= 0.10) groups.noPrice.push(tr); if (sur >= 0.10 && priceOk && i > free) { groups.main.push(tr); free = lastMainAt(tx); } if (sur <= -0.10) groups.neg.push(tr);
  }
  // ---- yardstick 3: the same stock on random non-earnings days: buy the open, stop 0.5% under the prior day's low (15% or less), same exits
  const cand = []; for (let k = 26; k < c.length - 1; k++) if (!near.has(k) && !near.has(k - 1) && c[k].t === c[k - 1].t + 1) cand.push(k);
  const R0 = rng(hash(sym)), picks = new Set(); for (let tries = 0; picks.size < Math.min(CTRL_PER_SYM, cand.length) && tries < CTRL_PER_SYM * 5; tries++) picks.add(cand[Math.floor(R0() * cand.length)]);
  const L = []; for (const k of [...picks].sort((x, y) => x - y)) { const p = c[k - 1], e = c[k].o, stop = p.l * 0.995;
    if (!(p.c >= 5) || p.c * p.v < 5e6 || !(e > stop) || (e - stop) / e > 0.15) continue; const res = exitAt(c[k].t, e, stop); if (res) L.push({ t: c[k].t, g: res.exit / e - 1 }); }
  ownCtrl.set(sym, L);
}
const ownMean = (sym, lo, hi) => { const L = (ownCtrl.get(sym) || []).filter(z => z.t >= lo && z.t < hi); return L.length >= 3 ? L.reduce((a, z) => a + z.g, 0) / L.length : null; };
const mean = (v) => v.reduce((a, x) => a + x, 0) / v.length;
const tStat = (v) => { if (v.length < 2) return null; const m = mean(v), sd = Math.sqrt(v.reduce((u, w) => u + (w - m) ** 2, 0) / (v.length - 1)); return sd > 0 ? +(m / (sd / Math.sqrt(v.length))).toFixed(2) : null; };
const byDay = (a, f) => { const o = new Map(); for (const z of a) { const x = f(z); if (x === null || x === undefined || !isFinite(x)) continue; (o.get(z.t) || o.set(z.t, []).get(z.t)).push(x); } return [...o.values()].map(mean); };
const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4);
function stats(a, cost) { if (!a.length) return { n: 0 }; const p = a.map(x => x.gross - cost), w = p.filter(x => x > 0), l = p.filter(x => x <= 0), sum = z => z.reduce((x, y) => x + y, 0), sp = a.filter(x => x.spy !== null).map(x => x.spy);
  return { n: p.length, win: w.length / p.length, avg: sum(p) / p.length, pf: l.length && sum(l) < 0 ? sum(w) / -sum(l) : null, spy: sp.length ? sum(sp) / sp.length : null, bestShare: sum(w) > 0 ? Math.max(...w) / sum(w) : null }; }
// the gate numbers for one set of trades (lo..hi = the period, for the same-stock yardstick)
function gates(a, cost, lo, hi) { if (!a.length) return { n: 0 };
  const net = a.map(x => x.gross - cost), srt = [...net].sort((x, y) => y - x), dm = byDay(a, z => z.gross - cost);
  const ed = byDay(a, z => z.mkt === null ? null : z.gross - cost - z.mkt), sv = byDay(a, z => z.spyW === null ? null : z.gross - cost - z.spyW);
  const ov = byDay(a, z => { const m = ownMean(z.sym, lo, hi); return m === null ? null : z.gross - m; }), withMkt = a.filter(z => z.mkt !== null).length;
  return { n: a.length, distinctDays: dm.length, distinctStocks: new Set(a.map(z => z.sym)).size, avg: r4(mean(net)), win: r4(net.filter(x => x > 0).length / net.length),
    t: tStat(dm), vsAvgStock: WHOLE && ed.length ? r4(mean(ed)) : null, tAvgStock: WHOLE ? tStat(ed) : null, avgStockCovered: withMkt,
    vsSpy: sv.length ? r4(mean(sv)) : null, tSpy: tStat(sv), vsOwn: ov.length ? r4(mean(ov)) : null, tOwn: tStat(ov), ownCovered: ov.length,
    without2Best: srt.length > 2 ? r4(mean(srt.slice(2))) : null, worstDay: r4(Math.min(...dm)), bestDay: r4(Math.max(...dm)) }; }
const older = a => a.filter(x => x.t < mid), newer = a => a.filter(x => x.t >= mid);
const R = Object.fromEntries(Object.entries(groups).map(([k, a]) => [k, { older: stats(older(a), COST), newer: stats(newer(a), COST), stress: stats(newer(a), STRESS), last12: stats(a.filter(x => x.t >= T - 252), COST) }]));
const Mt = groups.main, G = { older: gates(older(Mt), COST, 0, mid), newer: gates(newer(Mt), COST, mid, T), whole: gates(Mt, COST, 0, T),
  stressOlder: gates(older(Mt), STRESS, 0, mid), stressNewer: gates(newer(Mt), STRESS, mid, T), stressWhole: gates(Mt, STRESS, 0, T) };
const M = R.main, why = [], needCache = [], pcx = (x) => x === null ? 'n/a' : pc(x, 2);
const enough = (G.older.n || 0) >= 30 && (G.newer.n || 0) >= 30;
if (!enough) why.push('too few trades yet (' + (G.older.n || 0) + ' older, ' + (G.newer.n || 0) + ' newer; 30 each needed)');
else for (const h of ['older', 'newer']) { const g = G[h], s = G['stress' + h[0].toUpperCase() + h.slice(1)];
  if (!(g.avg > 0)) why.push('lost money after 0.8% costs in the ' + h + ' half (' + pcx(g.avg) + ')');
  if (!(g.t !== null && g.t >= BAR)) why.push('could be luck in the ' + h + ' half (date-clustered t ' + g.t + ', luck bar ' + BAR.toFixed(2) + ')');
  if (!WHOLE) needCache.push(h); else if (!(g.vsAvgStock > 0)) why.push('not better than the average stock on the same days in the ' + h + ' half (' + pcx(g.vsAvgStock) + ')');
  if (!(g.vsSpy > 0)) why.push('not better than the S&P 500 over the same days in the ' + h + ' half (' + pcx(g.vsSpy) + ')');
  if (!(g.vsOwn > 0 && g.tOwn >= 2)) why.push('not clearly better than the same stocks on their non-earnings days in the ' + h + ' half (' + pcx(g.vsOwn) + ', t ' + g.tOwn + ')');
  if (!(g.without2Best > 0)) why.push('loses without its 2 best trades in the ' + h + ' half (' + pcx(g.without2Best) + ')');
  if (!(s.avg > 0)) why.push('loses at 1.2% cost in the ' + h + ' half (' + pcx(s.avg) + ')'); }
if (enough) {   // the original checks stay
  if (!((M.newer.pf || 0) > 1.2)) why.push('profit factor ' + (M.newer.pf ? M.newer.pf.toFixed(2) : 'n/a') + ' in the newer half (1.2 needed)');
  if (R.all.newer.n && !(M.newer.avg > R.all.newer.avg + 0.005)) why.push('not clearly better than buying every earnings reaction the same way (the surprise adds too little)');
  if (M.last12.n >= 10 && !(M.last12.avg > 0)) why.push('lost money in the last 12 months'); if (M.newer.bestShare > 0.5) why.push('one trade made half the gains'); }
if (needCache.length) why.push('average-stock yardstick needs the study cache (whole-market study-cache/grouped.json.gz; this price file has ' + bars.size + ' stocks)');
const verdict = !enough ? 'NOT PROVEN' : !why.length ? 'PROMISING' : (G.older.avg > 0 && G.newer.avg > 0 ? 'NOT PROVEN' : 'REJECTED');
const whyText = why.join('; ') || 'passed every gate in both halves: beyond the luck bar, better than the average stock, the S&P 500 and the same stocks on other days, without its 2 best trades, at 1.2% cost, in the last 12 months, and beat buying every earnings reaction';
const complete = enough && WHOLE;   // only a run with every yardstick computed may become the frozen first run
const thisRun = { at: new Date().toISOString(), from: D[0], to: D[T - 1], stocks: Object.keys(cache.syms).length, priced: bars.size, reports: nreps, bar: +BAR.toFixed(2), leagueBar: LEAGUE_BAR, verdict, why: whyText, gates: G, results: R };
const firstRun = PREV.firstRun && PREV.firstRun.verdict ? PREV.firstRun : (complete ? { ...thisRun, label: 'first run (frozen)' } : null);
const topVerdict = firstRun ? firstRun.verdict : (verdict === 'PROMISING' ? 'NOT PROVEN' : verdict);   // nothing becomes a buy without a frozen complete run
const out = { generatedAt: new Date().toISOString(), status: 'OK', from: D[0], to: D[T - 1], stocks: Object.keys(cache.syms).length, reports: nreps,
  verdict: topVerdict, why: firstRun ? firstRun.why : whyText + (complete ? '' : ' (not frozen: the first complete run needs 30+ trades per half and the whole-market cache)'),
  results: R, gates: G, bar: +BAR.toFixed(2), leagueBar: LEAGUE_BAR, firstRun, latest: { ...thisRun, label: firstRun && firstRun.at !== thisRun.at ? 'monitoring (does not change the verdict)' : 'this run' },
  preGates: PREV.preGates || (PREV.verdict && !PREV.firstRun ? { verdict: PREV.verdict, at: PREV.generatedAt, note: 'verdict given before the house gates existed; not used' } : undefined),
  rule: { minSurprise: 0.10, minUp: 0.03, minLoc: 0.5, maxGap: 0.03, maxStop: 0.15, exitMA: 20, hold: 40 },
  syms: Object.keys(cache.syms).sort() };   // the tested set (22 Oct): live signals outside it are kept as a separate paper record
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const line = s => !s || !s.n ? 'no trades' : s.n + ' trades, ' + Math.round(s.win * 100) + '% won, average ' + pc(s.avg) + (s.pf ? ', profit factor ' + s.pf.toFixed(2) : '');
const gl = g => !g || !g.n ? 'no trades' : g.n + ' trades on ' + g.distinctDays + ' days in ' + g.distinctStocks + ' stocks, average ' + pcx(g.avg) + ', t ' + g.t + ' (bar ' + BAR.toFixed(2) + '), vs average stock ' + (WHOLE ? pcx(g.vsAvgStock) : 'needs the study cache') + ', vs S&P 500 ' + pcx(g.vsSpy) + ', vs same stocks other days ' + pcx(g.vsOwn) + ' (t ' + g.tOwn + '), without 2 best ' + pcx(g.without2Best);
const msg = ['EARNINGS SURPRISE DRIFT, fair test ' + D[T - 1], 'Earnings history: ' + out.stocks + ' stocks, ' + nreps + ' reports. Prices ' + D[0] + ' to ' + D[T - 1] + ', 0.8% cost.', '',
  'Rule (fixed): EPS 10%+ above the estimate, reaction day up 3%+ closing in the top half, buy the next open, stop under the reaction-day low, sell on a close under the 20 day average or after 40 sessions.',
  'older half: ' + gl(G.older), 'newer half: ' + gl(G.newer), 'whole: ' + gl(G.whole), 'at 1.2% cost: older ' + pcx(G.stressOlder.avg) + ', newer ' + pcx(G.stressNewer.avg) + '; last 12 months: ' + line(M.last12), '',
  'Same, without the price check: newer ' + line(R.noPrice.newer), 'Every earnings reaction bought the same way: newer ' + line(R.all.newer), 'Big misses (control): newer ' + line(R.neg.newer), '',
  'THIS RUN: ' + verdict + '. ' + whyText + '.', 'VERDICT: ' + out.verdict + (firstRun ? ' (frozen first run of ' + firstRun.at.slice(0, 10) + '; later runs are monitoring only)' : ' (no frozen first run yet)') + '.',
  out.verdict === 'PROMISING' ? 'It stays on the nightly list as "earnings drift" buys; live paper results keep checking it.' : 'Earnings drift is NOT offered as a buy. Nothing changes in your ACTIONS.',
  'Research, not an order. Not financial advice, not a halal ruling.'];
console.log(msg.join('\n'));
const changed = PREV.verdict !== out.verdict;
if (env.TG_TOKEN && env.TG_CHAT && (!QUIET || changed)) await telegramFetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n'), disable_web_page_preview: true }) }).catch(() => {});
