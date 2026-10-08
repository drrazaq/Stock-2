// WINNERS STUDY. Learns from the stocks that became big winners, without fooling itself.
// 1. AUTOPSY: every stock that rose 30%+ within 20 sessions, on the whole US market (dead stocks included): what did it look
//    like the day before the move started, compared with all stocks on all days? (common among winners is NOT the same as
//    predictive: most stocks with a winner's look do not win.)
// 2. TEST: each look (and each pair of looks) is turned into a plain buy rule: buy at the next open, stop 2 daily moves below,
//    sell after 10 sessions. Rules are ranked on the OLDER half only and judged on the NEWER half only, after costs, against
//    the S&P 500 and against buying a random stock. Only a rule that passes there is marked PROMISING, and even then it is
//    paper only until its live paper record also passes.
// Uses the price cache built by leaders-study.mjs (run that first in the same job). No data calls. Read-only. Weekly.
import fs from 'node:fs';
import zlib from 'node:zlib';

const env = process.env;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const TG = local(env.TG_BASE) || 'https://api.telegram.org';
const pc = (x, d = 1) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
fs.mkdirSync('data', { recursive: true });
const OUT = 'data/winners-study.json';
let store;
try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); }
catch (e) { fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), status: 'NOT RUN', why: 'no price cache yet (the fair test builds it)' }, null, 1)); console.log('winners study: no cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length;
if (T < 320) { fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), status: 'NOT RUN', why: 'only ' + T + ' sessions' }, null, 1)); console.log('winners study: too few sessions'); process.exit(0); }

// ---- Per-stock series
const bars = new Map();
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { let a = bars.get(x.T[j]); if (!a) bars.set(x.T[j], a = []); a.push({ t, o: x.o[j], h: x.h[j], l: x.l[j], c: x.c[j], v: x.v[j] }); } });
function ema(v, p) { const o = new Array(v.length).fill(null); if (v.length < p) return o; let x = v.slice(0, p).reduce((a, b) => a + b, 0) / p; o[p - 1] = x; const k = 2 / (p + 1); for (let i = p; i < v.length; i++) { x = v[i] * k + x * (1 - k); o[i] = x; } return o; }
const trOf = (c, i) => i === 0 ? c[i].h - c[i].l : Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
function avgOf(arr, p) { const o = new Array(arr.length).fill(null); let s = 0; for (let i = 0; i < arr.length; i++) { s += arr[i]; if (i >= p) s -= arr[i - p]; if (i >= p - 1) o[i] = s / p; } return o; }
const spyBars = bars.get('SPY'); if (!spyBars) { console.log('winners study: SPY missing'); process.exit(0); }
const spyC = new Array(T).fill(null), spyO = new Array(T).fill(null); spyBars.forEach(b => { spyC[b.t] = b.c; spyO[b.t] = b.o; });
const spyE50 = (() => { const o = new Array(T).fill(null); let x = null; const k = 2 / 51; for (let t = 0; t < T; t++) { if (spyC[t] === null) { o[t] = x; continue; } x = x === null ? spyC[t] : spyC[t] * k + x * (1 - k); o[t] = t >= 50 ? x : null; } return o; })();

// ---- The looks (features), fixed in advance. Measured at the CLOSE of the day before the entry.
const F = [
  { k: 'high52', name: 'within 5% of its 52 week high' },
  { k: 'vol2x', name: 'volume at least twice its 50 day average' },
  { k: 'strongClose', name: 'closed in the top fifth of the day’s range' },
  { k: 'bigUp', name: 'up 4% to 20% on the day' },
  { k: 'trend', name: 'price above the 50 day average, which is above the 200 day average' },
  { k: 'tight', name: 'quiet base: last 10 days’ moves under 75% of the 50 day norm' },
  { k: 'mom50', name: 'up 50% or more in 6 months' },
  { k: 'smallDv', name: 'thinly followed: under 20M USD traded a day' },
  { k: 'gapUp', name: 'opened 3% or more above the previous close' },
  { k: 'mktUp', name: 'S&P 500 above its 50 day average' }];
// The market's own state is never a rule on its own (that is just "buy anything when the market is up"); it can only be paired.
const CANDS = [...F.map((f, a) => [a]).filter(([a]) => F[a].k !== 'mktUp'), ...F.flatMap((f, a) => F.map((g, b) => [a, b]).filter(([x, y]) => y > x))].map(ix => ({ ix, mask: ix.reduce((m, i) => m | (1 << i), 0), name: ix.map(i => F[i].name).join(' + ') }));
const HOLD = 10, STOP_ATR = 2, COST = { low: 0.004, base: 0.008 }, GONE = -0.30, WIN = 0.30, WIN_DAYS = 20, mid = Math.floor((210 + T) / 2);

const signals = CANDS.map(() => []), base = [], winners = [], featAll = new Array(F.length).fill(0), featWin = new Array(F.length).fill(0);
let allDays = 0, gone = 0;
for (const [sym, c] of bars) {
  if (sym === 'SPY' || c.length < 230) continue;
  const cl = c.map(x => x.c), e50 = ema(cl, 50), e200 = ema(cl, 200), tr = c.map((x, i) => trOf(c, i)), a14 = avgOf(tr, 14), a10 = avgOf(tr, 10), a50 = avgOf(tr, 50), v50 = avgOf(c.map(x => x.v), 50), dv20 = avgOf(c.map(x => x.c * x.v), 20);
  const cool = new Array(CANDS.length).fill(-1); let winCool = -1, baseCool = -1, i126 = 0;
  const memo = new Map();
  const outcome = (i) => {           // buy at the next open, stop 2 daily moves under the signal close, sell at the close 10 sessions later
    if (memo.has(i)) return memo.get(i);
    let r = null; const n = c[i + 1];
    if (n && n.t === c[i].t + 1 && a14[i] > 0) {
      const entry = n.o, stop = c[i].c - STOP_ATR * a14[i]; let exit = null, j = i + 1;
      if (entry > stop) {
        for (; j < c.length && c[j].t <= n.t + HOLD - 1; j++) { if (c[j].l <= stop) { exit = c[j].o < stop ? c[j].o : stop; break; } }
        if (exit === null) { const last = c[j - 1];
          if (last.t === n.t + HOLD - 1 || c[j]) exit = last.c;                                   // normal end, or a gap in the data while the stock still trades later
          else if (n.t + HOLD - 1 < T - 1) { exit = entry * (1 + GONE); gone++; } }             // vanished (delisted, or fell under 3 USD / 1M USD a day): counted as a 30% loss
        if (exit !== null) { const tEnd = Math.min(T - 1, n.t + HOLD - 1); r = { t: c[i].t, gross: exit / entry - 1, spy: spyO[n.t] && spyC[tEnd] ? spyC[tEnd] / spyO[n.t] - 1 : null }; }
      }
    }
    memo.set(i, r); return r;
  };
  for (let i = 210; i < c.length - 1; i++) {
    const b = c[i], p = c[i - 1], t = b.t; if (p.t !== t - 1) continue;
    let hi = 0; for (let k = Math.max(0, i - 251); k <= i; k++) if (c[k].h > hi) hi = c[k].h;
    while (c[i126].t < t - 126) i126++;
    const chg = b.c / p.c - 1;
    const f = [b.c >= 0.95 * hi, v50[i] > 0 && b.v >= 2 * v50[i], b.h > b.l && (b.c - b.l) / (b.h - b.l) >= 0.8, chg >= 0.04 && chg <= 0.2, e50[i] !== null && e200[i] !== null && b.c > e50[i] && e50[i] > e200[i],
      a10[i] !== null && a50[i] > 0 && a10[i] / a50[i] < 0.75, i126 >= 0 && i126 < i && b.c / c[i126].c - 1 >= 0.5, dv20[i] !== null && dv20[i] < 2e7, b.o >= 1.03 * p.c, spyE50[t] !== null && spyC[t] > spyE50[t]];
    const mask = f.reduce((m, x, k) => m | (x ? 1 << k : 0), 0);
    allDays++; f.forEach((x, k) => { if (x) featAll[k]++; });
    // the autopsy: did a 30% move start right after this day?
    if (i > winCool && c[i + 1] && c[i + 1].t === t + 1) { const e = c[i + 1].o; let mx = 0; for (let j = i + 1; j < c.length && c[j].t <= t + WIN_DAYS; j++) mx = Math.max(mx, c[j].h); if (mx >= e * (1 + WIN) && t + WIN_DAYS < T) { winners.push({ sym, d: D[t] }); f.forEach((x, k) => { if (x) featWin[k]++; }); winCool = i + WIN_DAYS; } }
    if (i > baseCool) { const o = outcome(i); if (o) base.push(o); baseCool = i + HOLD; }
    for (let q = 0; q < CANDS.length; q++) { if ((mask & CANDS[q].mask) !== CANDS[q].mask || i <= cool[q]) continue; const o = outcome(i); if (o) { signals[q].push(o); cool[q] = i + HOLD; } }
  }
}

function stats(a, cost) {
  if (!a.length) return { n: 0 };
  const p = a.map(x => x.gross - cost), w = p.filter(x => x > 0), l = p.filter(x => x <= 0), sum = z => z.reduce((x, y) => x + y, 0), m = sum(p) / p.length;
  const sd = Math.sqrt(sum(p.map(x => (x - m) ** 2)) / Math.max(1, p.length - 1)), sp = a.filter(x => x.spy !== null).map(x => x.spy);
  return { n: p.length, win: w.length / p.length, avg: m, t: sd > 0 ? m / sd * Math.sqrt(p.length) : 0, pf: l.length && sum(l) < 0 ? sum(w) / -sum(l) : null, spy: sp.length ? sum(sp) / sp.length : null, bestShare: sum(w) > 0 ? Math.max(...w) / sum(w) : null };
}
const older = (a) => a.filter(x => x.t < mid), newer = (a) => a.filter(x => x.t >= mid);
const baseOld = stats(older(base), COST.base), baseNew = stats(newer(base), COST.base);
const rows = CANDS.map((cd, q) => ({ name: cd.name, keys: cd.ix.map(i => F[i].k), sel: stats(older(signals[q]), COST.base), test: { low: stats(newer(signals[q]), COST.low), base: stats(newer(signals[q]), COST.base) } }));
// choose on the older half: enough trades, positive, ranked by how reliable the edge looked (t-statistic)
const chosen = rows.filter(r => r.sel.n >= 50 && r.sel.avg > 0).sort((a, b) => b.sel.t - a.sel.t).slice(0, 5);
function verdict(r) {
  const b = r.test.base, lo = r.test.low;
  if (!b.n || b.n < 30) return { v: 'NOT PROVEN', why: 'only ' + (b.n || 0) + ' trades in the newer half' };
  if (!(lo.avg > 0)) return { v: 'REJECTED', why: 'lost money in the newer half even at the lowest cost' };
  const f = [];
  if (!(b.avg > 0)) f.push('average under zero at 0.8% cost');
  if (!(b.pf > 1.2)) f.push('profit factor ' + (b.pf ? b.pf.toFixed(2) : 'n/a'));
  if (b.spy !== null && !(b.avg > b.spy)) f.push('no better than the S&P 500 over the same days');
  if (baseNew.n && !(b.avg > baseNew.avg + 0.0025)) f.push('not clearly better than buying a random stock (needs +0.25% a trade more)');
  if (b.bestShare > 0.5) f.push('one trade made half the gains');
  return f.length ? { v: 'NOT PROVEN', why: f.join('; ') } : { v: 'PROMISING', why: 'passed on the newer half. Paper only until its live paper record also passes' };
}
chosen.forEach(r => Object.assign(r, { verdict: verdict(r) }));
const lift = F.map((f, k) => ({ name: f.name, key: f.k, inWinners: winners.length ? featWin[k] / winners.length : null, inAll: allDays ? featAll[k] / allDays : null }))
  .map(x => ({ ...x, lift: x.inAll > 0 && x.inWinners !== null ? x.inWinners / x.inAll : null })).sort((a, b) => (b.lift || 0) - (a.lift || 0));
const promising = chosen.filter(r => r.verdict.v === 'PROMISING');
// ---- Forward paper record: once a pattern passes, every later signal of it is followed on the days that come in each week.
// Those days did not exist when it was chosen, so this record is truly unseen. 30+ trades that also pass = GRADUATED.
const FP = (() => { try { return JSON.parse(fs.readFileSync('data/winners-paper.json', 'utf8')); } catch (e) { return { patterns: {} }; } })();
for (const r of promising) { const k = r.keys.join('+'); if (!FP.patterns[k]) FP.patterns[k] = { name: r.name, since: D[T - 1] }; }
for (const [k, p] of Object.entries(FP.patterns)) {
  const q = CANDS.findIndex(cd => cd.ix.map(i => F[i].k).join('+') === k); if (q < 0) continue;
  const fwd = signals[q].filter(x => D[x.t] > p.since), st = stats(fwd, COST.base), lo = stats(fwd, COST.low);
  const bf = stats(base.filter(x => D[x.t] > p.since), COST.base);
  const beats = (st.spy === null || st.avg > st.spy) && (!bf.n || st.avg > bf.avg + 0.0025);
  p.forward = st; p.randomForward = bf.n ? bf.avg : null;
  p.status = st.n >= 30 && lo.avg > 0 && st.avg > 0 && (st.pf === null || st.pf > 1.2) && st.bestShare <= 0.5 && beats ? 'GRADUATED' : st.n >= 30 && (!(lo.avg > 0) || !beats) ? 'DROPPED' : 'ON PAPER';
}
fs.writeFileSync('data/winners-paper.json', JSON.stringify(FP, null, 1));
const fpLines = Object.values(FP.patterns).map(p => p.status + ': ' + p.name + ' (since ' + p.since + '): ' + (p.forward && p.forward.n ? p.forward.n + ' new trades, average ' + pc(p.forward.avg) : 'no new trade yet') + (p.status === 'ON PAPER' ? ', needs 30' : ''));
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), status: 'OK', from: D[0], to: D[T - 1], splitAt: D[mid], stocks: bars.size, winners: winners.length, winnerRate: allDays ? winners.length / allDays : null, gone,
  rules: { hold: HOLD, stopAtr: STOP_ATR, costs: COST, goneCountedAs: GONE, winner: '+' + WIN * 100 + '% within ' + WIN_DAYS + ' sessions' }, base: { older: baseOld, newer: baseNew }, lift, chosen, promising: promising.map(r => ({ name: r.name, keys: r.keys, test: r.test.base })), recentWinners: winners.slice(-40) }, null, 1));

const line = (s) => !s || !s.n ? 'no trades' : s.n + ' trades, ' + Math.round(s.win * 100) + '% won, average ' + pc(s.avg) + ' a trade' + (s.pf ? ', profit factor ' + s.pf.toFixed(2) : '');
const msg = ['WINNERS STUDY, ' + D[T - 1], 'Whole US market ' + D[0] + ' to ' + D[T - 1] + ', stocks that later collapsed included. ' + winners.length + ' times a stock rose 30%+ within 20 sessions.', '',
  'WHAT WINNERS LOOKED LIKE THE DAY BEFORE (how much more common than on an ordinary day)',
  ...lift.slice(0, 5).map(x => '- ' + x.name + ': ' + Math.round(x.inWinners * 100) + '% of winners vs ' + Math.round(x.inAll * 100) + '% of all days (' + (x.lift ? x.lift.toFixed(1) : 'n/a') + 'x)'),
  'Common among winners is not the same as a buy signal: most stocks with these looks do not become winners. So each look was tested as a buy rule:', '',
  'TESTED AS BUY RULES (buy next open, stop 2 daily moves, sell after 10 sessions; chosen on the older year, judged on the newer year from ' + D[mid] + ', 0.8% cost)',
  ...(chosen.length ? chosen.map(r => r.verdict.v + ': ' + r.name + '\n  ' + line(r.test.base) + '. ' + r.verdict.why) : ['No look made money on the older year with enough trades.']),
  'Buying a random stock the same way: ' + line(baseNew) + '.', '',
  ...(fpLines.length ? ['PATTERNS ON PAPER (followed forward on new days only)', ...fpLines, ''] : []),
  promising.length ? 'RESULT: ' + promising.length + ' pattern(s) passed. They go on paper first; nothing becomes a BUY before its live paper record passes too.' : 'RESULT: no winner pattern passed the fair test. Nothing to act on. The study repeats every week as new days come in.',
  'About 2 years, one market climate. Daily prices only. Research, not an order. Not financial advice, not a halal ruling.'];
{ const j = JSON.parse(fs.readFileSync(OUT, 'utf8')); j.text = msg.join('\n'); fs.writeFileSync(OUT, JSON.stringify(j, null, 1)); }
if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
console.log(msg.join('\n'));
