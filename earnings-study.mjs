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
//   reactions bought the same way (so the surprise itself must add value). Verdict saved in data/earnings-study.json.
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
const addRep = (sym, r) => { if (!r || !r.d || !isFinite(r.a) || !isFinite(r.e)) return; const L = cache.syms[sym] || (cache.syms[sym] = []); const k = L.findIndex(x => x.d === r.d); if (k >= 0) L[k] = { ...L[k], ...r }; else L.push(r); L.sort((x, y) => x.d < y.d ? -1 : 1); };
async function getJson(url) { try { const r = await fetch(url); if (r.status === 401 || r.status === 403 || r.status === 402) return { refused: r.status }; if (!r.ok) return null; return await r.json(); } catch (e) { return null; } }

if (MODE === 'fetch') {
  const sig = readJson('data/signals.json', {}), order = [...new Set([...(sig.stocks || []).map(x => x.sym), ...((sig.uni || []).map(x => x.sym))])].filter(s => /^[A-Z]{1,5}$/.test(s));
  const today = iso(Date.now()), stale = (s) => !cache.tried[s] || (Date.now() - Date.parse(cache.tried[s])) / 864e5 > 100;
  const todo = order.filter(stale); let av = 0, fmp = 0, fmpOff = false, avOff = false;
  // 1. Alpha Vantage: full quarterly history with report date and time (free plan: 25 calls a day, 5 a minute)
  if (env.ALPHAVANTAGE_KEY) for (const sym of todo) { if (av >= +(env.AV_CALLS || 25) || avOff) break;
    const j = await getJson(AV + '/query?function=EARNINGS&symbol=' + sym + '&apikey=' + encodeURIComponent(env.ALPHAVANTAGE_KEY)); av++;
    if (j && (j.Note || j.Information)) { avOff = true; console.log('Alpha Vantage limit reached:', String(j.Note || j.Information).slice(0, 120)); break; }
    if (j && Array.isArray(j.quarterlyEarnings)) { for (const q of j.quarterlyEarnings) addRep(sym, { d: q.reportedDate, t: /pre/i.test(q.reportTime || '') ? 'bmo' : /post/i.test(q.reportTime || '') ? 'amc' : null, a: +q.reportedEPS, e: +q.estimatedEPS }); cache.tried[sym] = today; }
    if (!local(env.AV_BASE)) await sleep(13000); }
  // 2. FMP (only if the key's plan includes earnings history): report dates, actual and estimated EPS
  if (env.FMP_KEY) for (const sym of todo.filter(s => cache.tried[s] !== today)) { if (fmp >= +(env.FMP_CALLS || 200) || fmpOff) break;
    const j = await getJson(FMPB + '/stable/earnings?symbol=' + sym + '&limit=40&apikey=' + encodeURIComponent(env.FMP_KEY)); fmp++;
    if (j && j.refused) { fmpOff = true; console.log('FMP earnings history is not in this plan (HTTP ' + j.refused + '); Alpha Vantage and Finnhub only.'); break; }
    if (Array.isArray(j)) { for (const q of j) addRep(sym, { d: String(q.date || '').slice(0, 10), t: null, a: q.epsActual === null ? NaN : +q.epsActual, e: q.epsEstimated === null ? NaN : +q.epsEstimated }); cache.tried[sym] = today; }
    if (!local(env.FMP_BASE)) await sleep(300); }
  // 3. Finnhub calendar: the last 10 days of reports for every company (actual vs estimate, before/after the market)
  let recent = [];
  if (env.FINNHUB_KEY) { const j = await getJson(FH + '/calendar/earnings?from=' + iso(Date.now() - 10 * 864e5) + '&to=' + today + '&token=' + encodeURIComponent(env.FINNHUB_KEY));
    const rows = (j && j.earningsCalendar) || [];
    for (const q of rows) { if (!/^[A-Z]{1,5}$/.test(q.symbol || '') || q.epsActual === null || q.epsEstimate === null) continue;
      const r = { d: q.date, t: q.hour === 'bmo' ? 'bmo' : q.hour === 'amc' ? 'amc' : null, a: +q.epsActual, e: +q.epsEstimate }; addRep(q.symbol, r); recent.push({ sym: q.symbol, ...r }); } }
  fs.writeFileSync(RECENT, JSON.stringify({ updated: new Date().toISOString(), reports: recent }, null, 1));
  save();
  console.log('earnings history: ' + Object.keys(cache.syms).length + ' stocks (' + Object.values(cache.syms).reduce((a, x) => a + x.length, 0) + ' reports) | today: Alpha Vantage ' + av + ' calls, FMP ' + fmp + (fmpOff ? ' (not in plan)' : '') + ', Finnhub calendar ' + recent.length + ' recent reports | still to fetch ' + todo.filter(s => cache.tried[s] !== today).length);
  process.exit(0);
}

// ---------------- MODE=study ----------------
let store; try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); } catch (e) { console.log('earnings study: no price cache'); fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no price cache' })); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length, tOf = new Map(D.map((d, t) => [d, t]));
const bars = new Map(); D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { let a = bars.get(x.T[j]); if (!a) bars.set(x.T[j], a = []); a.push({ t, o: x.o[j], h: x.h[j], l: x.l[j], c: x.c[j], v: x.v[j] }); } });
const spy = bars.get('SPY'), spyC = new Array(T).fill(null); if (spy) spy.forEach(b => spyC[b.t] = b.c);
const spyRet = (a, b) => spyC[a] && spyC[b] ? spyC[b] / spyC[a] - 1 : null, mid = Math.floor(T / 2), COST = 0.008;
const nreps = Object.values(cache.syms).reduce((a, x) => a + x.length, 0);
const avg = (a, p) => { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= p) s -= a[i - p]; if (i >= p - 1) o[i] = s / p; } return o; };
function tradeMA(c, e, entry, stop, ma, hold) {   // stop first (gaps fill at the open); else next open after a close under the average; else the close after `hold` sessions
  for (let j = e; j < c.length && c[j].t <= c[e].t + hold - 1; j++) { const b = c[j];
    if (j > e && b.o <= stop) return { exit: b.o, j }; if (b.l <= stop) return { exit: stop, j };
    if (ma[j] && b.c < ma[j]) { const n = c[j + 1]; if (!n) return null; return { exit: n.o, j: j + 1 }; } }
  let j = e; while (j + 1 < c.length && c[j + 1].t <= c[e].t + hold - 1) j++; return c[j].t === c[e].t + hold - 1 || c[j + 1] ? { exit: c[j].c, j } : null;
}
const groups = { main: [], noPrice: [], all: [], neg: [] };
for (const [sym, reps] of Object.entries(cache.syms)) {
  const c = bars.get(sym); if (!c || c.length < 60) continue; const idx = new Map(c.map((b, i) => [b.t, i])), m20 = avg(c.map(x => x.c), 20); let free = -1;
  for (const r of reps) {
    // the reaction day: before the open -> that session; after the close -> the next session; unknown -> the bigger gap of the two
    let t0 = null; for (let k = 0; k < 5 && t0 === null; k++) { const d = iso(Date.parse(r.d + 'T12:00:00Z') + k * 864e5); if (tOf.has(d)) t0 = tOf.get(d); }
    if (t0 === null) continue; let i = idx.get(t0); if (i === undefined || i < 25) continue;
    if (r.t === 'amc') i = i + 1; else if (r.t !== 'bmo' && c[i + 1] && c[i + 1].t === c[i].t + 1) { const g0 = Math.abs(c[i].o / c[i - 1].c - 1), g1 = Math.abs(c[i + 1].o / c[i].c - 1); if (g1 > g0) i = i + 1; }
    const b = c[i], p = c[i - 1], n1 = c[i + 1]; if (!b || !p || !n1 || n1.t !== b.t + 1) continue;
    if (!(b.c >= 5) || b.c * b.v < 5e6 || !(Math.abs(r.e) >= 0.05)) continue;
    const sur = (r.a - r.e) / Math.abs(r.e), up = b.c / p.c - 1, loc = b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5, e = n1.o, stop = b.l * 0.995;
    if (!(e > stop) || (e - stop) / e > 0.15 || e > b.c * 1.03) continue;
    const res = tradeMA(c, i + 1, e, stop, m20, 40); if (!res) continue;
    const tr = { sym, t: n1.t, gross: res.exit / e - 1, spy: spyRet(n1.t, c[res.j].t), sur };
    const priceOk = up >= 0.03 && loc >= 0.5;
    groups.all.push(tr); if (sur >= 0.10) groups.noPrice.push(tr); if (sur >= 0.10 && priceOk && i > free) { groups.main.push(tr); free = res.j; } if (sur <= -0.10) groups.neg.push(tr);
  }
}
function stats(a, cost) { if (!a.length) return { n: 0 }; const p = a.map(x => x.gross - cost), w = p.filter(x => x > 0), l = p.filter(x => x <= 0), sum = z => z.reduce((x, y) => x + y, 0), sp = a.filter(x => x.spy !== null).map(x => x.spy);
  return { n: p.length, win: w.length / p.length, avg: sum(p) / p.length, pf: l.length && sum(l) < 0 ? sum(w) / -sum(l) : null, spy: sp.length ? sum(sp) / sp.length : null, bestShare: sum(w) > 0 ? Math.max(...w) / sum(w) : null }; }
const older = a => a.filter(x => x.t < mid), newer = a => a.filter(x => x.t >= mid);
const R = Object.fromEntries(Object.entries(groups).map(([k, a]) => [k, { older: stats(older(a), COST), newer: stats(newer(a), COST), stress: stats(newer(a), COST + 0.004), last12: stats(a.filter(x => x.t >= T - 252), COST) }]));
const M = R.main, why = [];
let verdict = 'PROMISING';
if (!M.older.n || M.older.n < 30 || !M.newer.n || M.newer.n < 30) { verdict = 'NOT PROVEN'; why.push('too few trades yet (' + (M.older.n || 0) + ' older, ' + (M.newer.n || 0) + ' newer; 30 each needed). The earnings history grows every weekday'); }
else {
  if (!(M.older.avg > 0)) why.push('lost money in the older half'); if (!(M.newer.avg > 0)) why.push('lost money in the newer half');
  if (!(M.stress.avg > 0)) why.push('loses at 1.2% cost'); if (!((M.newer.pf || 0) > 1.2)) why.push('profit factor ' + (M.newer.pf ? M.newer.pf.toFixed(2) : 'n/a'));
  if (M.newer.spy !== null && !(M.newer.avg > M.newer.spy)) why.push('no better than the S&P 500 over the same days');
  if (R.all.newer.n && !(M.newer.avg > R.all.newer.avg + 0.005)) why.push('not clearly better than buying every earnings reaction the same way (the surprise adds too little)');
  if (M.last12.n >= 10 && !(M.last12.avg > 0)) why.push('lost money in the last 12 months'); if (M.newer.bestShare > 0.5) why.push('one trade made half the gains');
  if (why.length) verdict = M.newer.avg > 0 && M.older.avg > 0 ? 'NOT PROVEN' : 'REJECTED';
}
const line = s => !s || !s.n ? 'no trades' : s.n + ' trades, ' + Math.round(s.win * 100) + '% won, average ' + pc(s.avg) + (s.pf ? ', profit factor ' + s.pf.toFixed(2) : '');
const out = { generatedAt: new Date().toISOString(), status: 'OK', from: D[0], to: D[T - 1], stocks: Object.keys(cache.syms).length, reports: nreps, verdict, why: why.join('; ') || 'passed in both halves, at stress cost, in the last 12 months, and beat buying every earnings reaction', results: R,
  rule: { minSurprise: 0.10, minUp: 0.03, minLoc: 0.5, maxGap: 0.03, maxStop: 0.15, exitMA: 20, hold: 40 },
  syms: Object.keys(cache.syms).sort() };   // the tested set (22 Oct): live signals outside it are kept as a separate paper record
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const msg = ['EARNINGS SURPRISE DRIFT, fair test ' + D[T - 1], 'Earnings history: ' + out.stocks + ' stocks, ' + nreps + ' reports. Prices ' + D[0] + ' to ' + D[T - 1] + ', 0.8% cost.', '',
  'Rule (fixed): EPS 10%+ above the estimate, reaction day up 3%+ closing in the top half, buy the next open, stop under the reaction-day low, sell on a close under the 20 day average or after 40 sessions.',
  'older half: ' + line(M.older), 'newer half: ' + line(M.newer), 'newer half at 1.2% cost: ' + line(M.stress), 'last 12 months: ' + line(M.last12), '',
  'Same, without the price check: newer ' + line(R.noPrice.newer), 'Every earnings reaction bought the same way: newer ' + line(R.all.newer), 'Big misses (control): newer ' + line(R.neg.newer), '',
  'VERDICT: ' + verdict + '. ' + out.why + '.', verdict === 'PROMISING' ? 'It now goes on the nightly list as "earnings drift" buys; live paper results keep checking it.' : 'Nothing changes in your ACTIONS. The test repeats every Sunday as more earnings history arrives.',
  'Research, not an order. Not financial advice, not a halal ruling.'];
console.log(msg.join('\n'));
if (env.TG_TOKEN && env.TG_CHAT && (!QUIET || verdict === 'PROMISING')) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
