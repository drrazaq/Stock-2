// LEADERS FAIR TEST. The nightly LEADERS rule is tested on today's well-known companies only, which flatters it: companies that
// collapsed, were delisted or were bought are missing. This job tests the SAME rule on the WHOLE US market as it was on each day,
// using Massive's daily prices for every stock that traded that day, including stocks that later disappeared.
// It chooses the rule version on the older half of the data and judges it ONLY on the newer half, at three cost levels.
// Weekly. Read-only. Writes data/leaders-study.json and sends one Telegram message. The price cache lives in the Actions cache,
// not in the repository (it is far too big for a repository).
import fs from 'node:fs';
import zlib from 'node:zlib';

const env = process.env;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;   // test hooks: localhost only
const TEST = local(env.MASSIVE_BASE), PX = TEST || 'https://api.massive.com', TG = local(env.TG_BASE) || 'https://api.telegram.org';
if (!env.MASSIVE_KEY) { console.error('Missing secret MASSIVE_KEY'); process.exit(1); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
const pc = (x, d = 1) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
const PAID = Boolean(env.MASSIVE_PAID), WANT = Math.min(1300, +(env.SESSIONS || (PAID ? 1260 : 520)));   // paid plan: about five years of sessions; free: two
const MAX_CALLS = +(env.MAX_CALLS || (PAID ? 2500 : 700));
const CACHE_DIR = 'study-cache', CACHE = CACHE_DIR + '/grouped.json.gz';
fs.mkdirSync(CACHE_DIR, { recursive: true }); fs.mkdirSync('data', { recursive: true });

// ---- 1. The cache: one compact record per trading day, only rows that could ever qualify (price 3 USD+, 1M USD+ traded)
let store = { days: {}, gone: [], ref: null };
try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(CACHE)).toString()); } catch (e) { console.log('no cache yet: building from scratch'); }
store.days = store.days || {}; store.gone = store.gone || [];
const save = () => fs.writeFileSync(CACHE, zlib.gzipSync(JSON.stringify(store)));
let calls = 0;
async function api(path) {             // free plan: 5 calls a minute
  for (let a = 0; a < 4; a++) {
    if (calls && !TEST) await sleep(PAID ? 150 : 12500);   // paid plan: unlimited calls
    calls++;
    let r; try { r = await fetch(PX + path + (path.includes('?') ? '&' : '?') + 'apiKey=' + encodeURIComponent(env.MASSIVE_KEY)); } catch (e) { await sleep(TEST ? 5 : 5000); continue; }
    if (r.status === 429) { await sleep(TEST ? 5 : 61000); continue; }
    if (r.status === 401) { console.error('The MASSIVE_KEY secret was rejected.'); process.exit(1); }
    if (r.status === 403) return { refused: true };
    if (!r.ok) { await sleep(TEST ? 5 : 5000); continue; }
    return await r.json().catch(() => null);
  }
  return null;
}
// Common stocks and ADRs only, active and delisted, so funds (leveraged ETFs especially) cannot dominate a momentum ranking.
async function refList() {
  const out = new Set(); let complete = true;
  for (const [type, active] of [['CS', true], ['ADRC', true], ['CS', false], ['ADRC', false]]) {
    let path = `/v3/reference/tickers?market=stocks&type=${type}&active=${active}&limit=1000`, pages = 0;
    while (path && pages < 60 && calls < MAX_CALLS) {
      const j = await api(path); pages++;
      if (!j || j.refused || !Array.isArray(j.results)) { complete = false; break; }
      for (const x of j.results) if (/^[A-Z]{1,5}$/.test(x.ticker || '')) out.add(x.ticker);
      path = j.next_url ? j.next_url.replace(/^https?:\/\/[^/]+/, '') : null;
    }
    if (path) complete = false;
  }
  return { at: iso(Date.now()), complete, syms: [...out] };
}
if (!store.ref || !store.ref.complete || Date.now() - Date.parse(store.ref.at) > 30 * 86400000) {
  const r = await refList(); if (r.syms.length > 1000) store.ref = r; save();
  console.log('company list:', r.syms.length, 'tickers', r.complete ? '(complete)' : '(INCOMPLETE)');
}
const CS = new Set(store.ref ? store.ref.syms : []);
// Walk back from yesterday until about two years of sessions are held, or the plan refuses older dates.
let refusedAt = null, added = 0;
for (let k = 1, have = Object.keys(store.days).length; have < WANT && k < WANT * 1.6 && calls < MAX_CALLS; k++) {
  const ms = Date.now() - k * 86400000, d = iso(ms), wd = new Date(ms).getUTCDay();
  if (wd === 0 || wd === 6 || d in store.days || store.gone.includes(d)) continue;
  const j = await api(`/v2/aggs/grouped/locale/us/market/stocks/${d}?adjusted=true`);
  if (j && j.refused) { refusedAt = d; break; }                       // older than the plan allows
  if (!j) continue;                                                    // a failed call: try again next week
  const rows = (j.results || []).filter(x => x && /^[A-Z]{1,5}$/.test(x.T || '') && x.c >= 3 && x.c * x.v >= 1e6 && (CS.has(x.T) || x.T === 'SPY' || !CS.size));
  if (!rows.length) { if (k > 4) store.gone.push(d); continue; }       // a market holiday
  store.days[d] = { T: rows.map(x => x.T), o: rows.map(x => +x.o.toFixed(4)), h: rows.map(x => +x.h.toFixed(4)), l: rows.map(x => +x.l.toFixed(4)), c: rows.map(x => +x.c.toFixed(4)), v: rows.map(x => Math.round(x.v)) };
  have++; added++; if (added % 25 === 0) { save(); console.log('sessions held:', have); }
}
// keep only the newest WANT sessions
const allDays = Object.keys(store.days).sort(); for (const d of allDays.slice(0, Math.max(0, allDays.length - WANT))) delete store.days[d];
save();
const D = Object.keys(store.days).sort(), T = D.length;
console.log('sessions:', T, D[0], 'to', D[T - 1], '| added', added, '| calls', calls, refusedAt ? '| plan limit reached at ' + refusedAt : '');

// ---- 2. Per-stock series on its own trading days, with the live rule's exact formulas (EMA 50 and 200, 14-day Wilder ATR)
function ema(v, p) { const o = new Array(v.length).fill(null); if (v.length < p) return o; let x = v.slice(0, p).reduce((a, b) => a + b, 0) / p; o[p - 1] = x; const k = 2 / (p + 1); for (let i = p; i < v.length; i++) { x = v[i] * k + x * (1 - k); o[i] = x; } return o; }
function atr(c, p) { const o = new Array(c.length).fill(null); if (c.length <= p) return o; const tr = c.map((x, i) => i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c))); let v = tr.slice(1, p + 1).reduce((a, b) => a + b, 0) / p; o[p] = v; for (let i = p + 1; i < c.length; i++) { v = (v * (p - 1) + tr[i]) / p; o[i] = v; } return o; }
const bars = new Map();
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { let a = bars.get(x.T[j]); if (!a) bars.set(x.T[j], a = []); a.push({ t, o: x.o[j], h: x.h[j], l: x.l[j], c: x.c[j], v: x.v[j] }); } });
const S = new Map();
for (const [sym, c] of bars) {
  if (c.length < 230) continue;
  const closes = c.map(x => x.c), at = new Int32Array(T).fill(-1); c.forEach((x, i) => { at[x.t] = i; });
  const dv = new Array(c.length).fill(null); let s = 0; for (let i = 0; i < c.length; i++) { s += c[i].c * c[i].v; if (i >= 20) s -= c[i - 20].c * c[i - 20].v; if (i >= 19) dv[i] = s / 20; }
  S.set(sym, { c, at, e50: ema(closes, 50), e200: ema(closes, 200), a: atr(c, 14), dv });
}
const spy = S.get('SPY');
if (!spy || T < 300) {
  const why = !spy ? 'the S&P 500 fund is missing from the data' : 'only ' + T + ' sessions are available; about 300 are needed';
  fs.writeFileSync('data/leaders-study.json', JSON.stringify({ generatedAt: new Date().toISOString(), verdict: 'NOT RUN', why }, null, 1));
  console.log('not run:', why); process.exit(0);
}
const spyAt = (t) => spy.at[t] >= 0 ? spy.c[spy.at[t]] : null, mktOk = (t) => { const i = spy.at[t]; return i >= 0 && spy.e200[i] !== null && spy.c[i].c > spy.e200[i]; };

// ---- 3. The rule, exactly as the nightly scan runs it, on the whole market. Gross results; costs are taken off later.
const N = 5, VARIANTS = [63, 126, 252].flatMap(LOOK => [2, 3, 4].map(ATR => ({ LOOK, ATR, key: LOOK + '-' + ATR })));
function run(v, t0, t1) {
  const open = [], done = [];
  for (let t = t0; t < Math.min(t1, T - 1); t++) {
    for (let k = open.length - 1; k >= 0; k--) {
      const p = open[k], x = S.get(p.sym), i = x.at[t]; if (i < 0 || i < p.i0) continue;
      const cl = x.c[i].c;
      if (cl < p.stop || cl < x.e50[i]) {
        const nx = x.c[i + 1]; if (!nx) continue;                     // no next bar yet: decided next time
        done.push({ sym: p.sym, d: D[p.t], out: D[nx.t], gross: nx.o / p.entry - 1, why: cl < p.stop ? 'stop' : 'trend', gap: cl < p.stop && nx.o < p.stop ? (p.stop - nx.o) / p.entry : 0, days: nx.t - p.t, spy: spyAt(nx.t) && spyAt(p.t) ? spyAt(nx.t).o / spyAt(p.t).o - 1 : null });
        open.splice(k, 1);
      } else p.stop = Math.max(p.stop, cl - v.ATR * x.a[i]);
    }
    if (open.length >= N || !mktOk(t)) continue;
    const ranked = [];
    for (const [sym, x] of S) {
      if (sym === 'SPY') continue;
      const i = x.at[t]; if (i < 200 || i <= v.LOOK) continue;
      const px = x.c[i].c, e50 = x.e50[i], e200 = x.e200[i], a = x.a[i];
      if (!(px >= 5) || !(a > 0) || !(px > e50 && e50 > e200) || !(x.dv[i] >= 2e6)) continue;
      const mom = px / x.c[i - v.LOOK].c - 1; if (mom > 0) ranked.push({ sym, i, px, a, mom });
    }
    ranked.sort((a, b) => b.mom - a.mom);
    for (const r of ranked) {
      if (open.length >= N) break;
      if (open.some(p => p.sym === r.sym)) continue;
      const nx = S.get(r.sym).c[r.i + 1]; if (!nx || nx.t !== t + 1) continue;
      if (nx.o > r.px + 0.5 * r.a || nx.o <= r.px - v.ATR * r.a) continue;      // opened above the buy range, or under the stop: skipped
      open.push({ sym: r.sym, entry: nx.o, i0: r.i + 1, t: nx.t, stop: r.px - v.ATR * r.a });
    }
  }
  return done;
}
function stats(tr, cost) {
  if (!tr.length) return null;
  const p = tr.map(x => x.gross - cost), w = p.filter(x => x > 0), l = p.filter(x => x <= 0), sum = (a) => a.reduce((x, y) => x + y, 0);
  let eq = 0, peak = 0, dd = 0; for (const x of [...tr].sort((a, b) => a.out < b.out ? -1 : 1).map(x => x.gross - cost)) { eq += x / N; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  const sp = tr.filter(x => x.spy !== null).map(x => x.spy), best = Math.max(...p), days = tr.map(x => x.days).sort((a, b) => a - b);
  return { n: p.length, win: w.length / p.length, avg: sum(p) / p.length, avgWin: w.length ? sum(w) / w.length : null, avgLoss: l.length ? sum(l) / l.length : null, pf: l.length && sum(l) < 0 ? sum(w) / -sum(l) : null,
    dd, spy: sp.length ? sum(sp) / sp.length : null, bestShare: sum(w) > 0 ? best / sum(w) : null, worst: Math.min(...p), worstGap: Math.max(0, ...tr.map(x => x.gap)), medDays: days[Math.floor(days.length / 2)], stops: tr.filter(x => x.why === 'stop').length / tr.length };
}

// ---- 4. Choose on the older half, judge on the newer half
const tStart = 253, mid = tStart + Math.floor((T - 1 - tStart) / 2);
const COSTS = { low: 0.004, base: 0.008, stress: 0.015 };
const rows = VARIANTS.map(v => { const sel = run(v, tStart, mid), test = run(v, mid, T); return { v, sel: stats(sel, COSTS.base), test: Object.fromEntries(Object.entries(COSTS).map(([k, c]) => [k, stats(test, c)])) }; });
const eligible = rows.filter(r => r.sel && r.sel.n >= 20).sort((a, b) => b.sel.avg - a.sel.avg), chosen = eligible[0] || null;
const live = (() => { try { return JSON.parse(fs.readFileSync('data/leaders.json', 'utf8')).rule || '126-3'; } catch (e) { return '126-3'; } })(), liveRow = rows.find(r => r.v.key === live);
const spyHalf = spyAt(mid) && spyAt(T - 1) ? spyAt(T - 1).c / spyAt(mid).c - 1 : null;
function verdictOf(r) {
  if (!r) return { v: 'NOT PROVEN', why: 'no version had enough trades in the older half to be chosen' };
  const b = r.test.base, lo = r.test.low;
  if (!b || b.n < 30) return { v: 'NOT PROVEN', why: 'only ' + (b ? b.n : 0) + ' trades in the newer half; 30 are needed' };
  if (!(lo.avg > 0)) return { v: 'REJECTED', why: 'it lost money in the newer half even at the lowest cost' };
  const fails = [];
  if (!(b.avg > 0)) fails.push('average under zero at the 0.8% cost');
  if (!(b.pf > 1.2)) fails.push('profit factor ' + (b.pf ? b.pf.toFixed(2) : 'n/a') + ', under 1.2');
  if (b.spy !== null && !(b.avg > b.spy)) fails.push('no better than holding the S&P 500 over the same days');
  if (b.bestShare !== null && b.bestShare > 0.5) fails.push('one trade made over half of all the gains');
  return fails.length ? { v: 'NOT PROVEN', why: fails.join('; ') } : { v: 'PROVISIONALLY PROMISING', why: 'it passed in the newer half at the 0.8% cost. Live paper trades must still confirm it' };
}
const verdict = verdictOf(chosen), liveVerdict = verdictOf(liveRow);
const fundsOk = Boolean(store.ref && store.ref.complete);
const line = (s) => !s ? 'no trades' : s.n + ' trades, ' + Math.round(s.win * 100) + '% won, average ' + pc(s.avg) + ' a trade, profit factor ' + (s.pf ? s.pf.toFixed(2) : 'n/a') + ', deepest fall ' + pc(-s.dd);
const name = (v) => 'strength over ' + Math.round(v.LOOK / 21) + ' months, stop ' + v.ATR + ' daily moves';
const out = {
  generatedAt: new Date().toISOString(), from: D[0], to: D[T - 1], sessions: T, stocks: S.size, splitAt: D[mid], fundsFiltered: fundsOk, planLimit: refusedAt,
  chosen: chosen ? chosen.v.key : null, verdict: verdict.v, why: verdict.why, live, liveVerdict: liveVerdict.v, liveWhy: liveVerdict.why,
  rows: rows.map(r => ({ key: r.v.key, sel: r.sel, test: r.test })), spyNewerHalf: spyHalf
};
fs.writeFileSync('data/leaders-study.json', JSON.stringify(out, null, 1));
const b = chosen ? chosen.test : null, lb = liveRow ? liveRow.test : null;
const msg = ['LEADERS FAIR TEST, ' + D[T - 1],
  'The LEADERS rule run on the whole US market as it was each day, ' + D[0] + ' to ' + D[T - 1] + ', including stocks that later collapsed or disappeared (' + S.size + ' stocks with enough history). Version chosen on the older half, judged only on the newer half (from ' + D[mid] + ').', '',
  'VERDICT: ' + verdict.v + '. ' + verdict.why + '.', '',
  'Chosen version: ' + (chosen ? name(chosen.v) : 'none'),
  'Newer half, 0.4% cost: ' + line(b && b.low), 'Newer half, 0.8% cost: ' + line(b && b.base), 'Newer half, 1.5% cost: ' + line(b && b.stress),
  b && b.base ? 'S&P 500 over the same days: ' + pc(b.base.spy) + ' a trade. Worst trade ' + pc(b.base.worst) + ', worst overnight gap past the stop ' + pc(-b.base.worstGap) + '. Typical hold ' + b.base.medDays + ' sessions.' : '',
  'S&P 500 over the whole newer half: ' + pc(spyHalf), '',
  'Version the nightly scan uses now (' + (liveRow ? name(liveRow.v) : live) + '): ' + liveVerdict.v + '. ' + line(lb && lb.base) + ' at the 0.8% cost.', '',
  fundsOk ? 'Funds are excluded: only companies and ADRs are ranked.' : 'WARNING: the company list could not be loaded completely, so some funds may be in the ranking. Treat the result with extra caution.',
  refusedAt ? 'The data plan allows prices back to about ' + D[0] + ', so this is about ' + Math.round(T / 252 * 10) / 10 + ' years. One period, one market climate.' : '',
  'Limits: stocks that changed ticker are counted as two; a reused ticker can mix two companies; daily prices only.',
  'Research, not an order. Not financial advice, not a halal ruling.'].filter(x => x !== '');
if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
console.log(msg.join('\n'));
