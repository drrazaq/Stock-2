// HUNTING LAB. New ways to catch moves, each written as a complete trade (entry, stop, exit) and tested on two years of the
// WHOLE US market, stocks that later collapsed included, after costs. The rules are fixed in advance (no tuning), and each must
// make money in BOTH the older and the newer half, beat the S&P 500 over the same days, and beat buying a random stock the same
// way. A rule that passes goes on paper on the new days that arrive each week; only a passing paper record could ever make it
// a BUY. Uses the price cache built by leaders-study.mjs (same weekly job). No data calls. Read-only.
import fs from 'node:fs';
import zlib from 'node:zlib';
const QUIET = (() => { try { return JSON.parse(fs.readFileSync('data/settings.json', 'utf8')).quiet !== false; } catch (e) { return true; } })();   // quiet mode (default): research messages are kept in the files, not sent

const env = process.env;
const local = (u) => u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(u) ? u : null;
const TG = local(env.TG_BASE) || 'https://api.telegram.org';
const pc = (x, d = 1) => x === null || x === undefined || !isFinite(x) ? 'n/a' : (x >= 0 ? '+' : '') + (x * 100).toFixed(d) + '%';
const OUT = 'data/hunting-lab.json', PAPER = 'data/hunting-paper.json';
fs.mkdirSync('data', { recursive: true });
let store;
try { store = JSON.parse(zlib.gunzipSync(fs.readFileSync(env.CACHE || 'study-cache/grouped.json.gz')).toString()); }
catch (e) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'no price cache yet' })); console.log('hunting lab: no cache'); process.exit(0); }
const D = Object.keys(store.days || {}).sort(), T = D.length;
if (T < 300) { fs.writeFileSync(OUT, JSON.stringify({ status: 'NOT RUN', why: 'only ' + T + ' sessions' })); process.exit(0); }

// ---- series
const bars = new Map();
D.forEach((d, t) => { const x = store.days[d]; for (let j = 0; j < x.T.length; j++) { let a = bars.get(x.T[j]); if (!a) bars.set(x.T[j], a = []); a.push({ t, o: x.o[j], h: x.h[j], l: x.l[j], c: x.c[j], v: x.v[j] }); } });
const avg = (a, p) => { const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++) { s += a[i]; if (i >= p) s -= a[i - p]; if (i >= p - 1) o[i] = s / p; } return o; };
const spyB = bars.get('SPY'); if (!spyB) { console.log('hunting lab: SPY missing'); process.exit(0); }
const spyC = new Array(T).fill(null); spyB.forEach(b => spyC[b.t] = b.c);
const spy50 = (() => { const o = new Array(T).fill(null); for (let t = 49; t < T; t++) { let s = 0, k = 0; for (let u = t - 49; u <= t; u++) if (spyC[u] !== null) { s += spyC[u]; k++; } o[t] = k > 40 ? s / k : null; } return o; })();
const spyRet = (t0, t1) => spyC[t0] && spyC[t1] ? spyC[t1] / spyC[t0] - 1 : null;
const GONE = -0.30, COST = { low: 0.004, base: 0.008 }, mid = Math.floor((220 + T) / 2);

// One complete trade. Entry at bar e at price `entry`. Stop checked first on every bar (gaps fill at the open). Optional target.
// Out at the close after `hold` bars. A stock that vanishes from the data (delisted, or fell under 3 USD / 1M USD a day) = -30%.
function trade(c, e, entry, stop, target, hold) {
  if (!(entry > stop) || !c[e]) return null;
  for (let j = e; j < c.length && c[j].t <= c[e].t + hold - 1; j++) {
    const b = c[j];
    if (j > e && b.o <= stop) return { exit: b.o, why: 'stop', j };
    if (b.l <= stop) return { exit: stop, why: 'stop', j };
    if (target && j > e && b.o >= target) return { exit: b.o, why: 'target', j };
    if (target && b.h >= target) return { exit: target, why: 'target', j };
  }
  let j = e; while (j + 1 < c.length && c[j + 1].t <= c[e].t + hold - 1) j++;
  if (c[j].t === c[e].t + hold - 1 || c[j + 1]) return { exit: c[j].c, why: 'time', j };
  if (c[e].t + hold - 1 < T - 1) return { exit: entry * (1 + GONE), why: 'gone', j };
  return null;     // not finished yet
}

// Bullish candles on completed daily bars (same definitions the per-stock tests use)
function bullishCandle(c, i) {
  if (i < 2) return 0;
  const b = c[i], p = c[i - 1], pp = c[i - 2], body = Math.abs(b.c - b.o), rng = b.h - b.l, pbody = Math.abs(p.c - p.o);
  if (!(rng > 0)) return 0;
  const lower = Math.min(b.o, b.c) - b.l, upper = b.h - Math.max(b.o, b.c);
  if (body <= 0.3 * rng && lower >= 2 * body && upper <= 0.15 * rng) return 1;
  if (p.c < p.o && b.c > b.o && b.o <= p.c && b.c >= p.o && body > pbody) return 2;
  if (p.c < p.o && b.c > b.o && b.o < p.l && b.c > (p.o + p.c) / 2 && b.c < p.o) return 3;
  if (pp.c < pp.o && Math.abs(pp.c - pp.o) > 0.6 * (pp.h - pp.l) && pbody <= 0.3 * Math.abs(pp.c - pp.o) && b.c > b.o && b.c > (pp.o + pp.c) / 2) return 4;
  if (p.c < p.o && pbody > 0.6 * (p.h - p.l) && b.c > b.o && b.o > p.c && b.c < p.o && body < 0.5 * pbody) return 5;
  return 0;
}
// ---- the rules (fixed in advance)
const RULES = [
  { key: 'tight', name: 'Tight base breakout', how: 'uptrend (50 day over 200 day average), 15 quiet days in a range under 15% on drying volume, then a close above that range on 2x volume in the top quarter of the day; buy next open, stop at the range low (risk 5% or less), out after 10 sessions' },
  { key: 'leader', name: 'Holds up while the market falls', how: 'S&P 500 down 3%+ over 5 days while the stock is down under 1% (or up) on 1.5x volume; next day the market is up and the stock breaks the previous high; stop at the 5 day low, out after 5 sessions' },
  { key: 'day2', name: 'Second day after a big up day', how: 'day 0 up 10%+ on 5x volume, closed in the top quarter; day 1 holds above day 0 low, not down over 3%, on less volume; buy a break of the day 1 high on day 2, stop at the day 1 low, out after 5 sessions' },
  { key: 'htf', name: 'Strict high tight flag', how: 'up 20%+ on 5x volume, then 3 to 5 quiet days in a range of 12% or less on falling volume with no down day over 4%; buy a break of the quiet high on 2x volume, stop at the quiet low, out after 5 sessions' },
  { key: 'brk20q', name: '20 day high, quality version', how: 'close at a 20 day high on 2x volume in the top quarter of the day, price 10 USD+, S&P 500 above its 50 day average; buy next open if not 5% above the close, stop at the 10 day low or 2 daily moves (the closer), target 2x the risk, out after 10 sessions' }];
// 6. VOLUME BUILD-UP NEAR THE HIGH (the "profit tournament" idea, tested fairly). Many versions are tried, but the version is
// CHOSEN ON THE OLDER YEAR ONLY; the newer half then judges that one version with the same gates as every other rule.
// Under 5 USD an extra 0.4% cost is charged (wider spreads).
const BU = [];
for (const volR of [2, 3]) for (const [lo5, hi5] of [[0, 0.08], [0, 0.18], [-0.05, 0.12]]) for (const hold of [5, 8]) for (const stopP of [0.06, 0.10]) for (const tgtP of [0.10, 0.20]) for (const maxPx of [20, 1e9])
  BU.push({ volR, lo5, hi5, hold, stopP, tgtP, maxPx, key: 'bu' + BU.length });
RULES.push({ key: 'jumpgo', name: 'Fast mover continuation (next day breaks the jump-day high)', how: 'up 20%+ on 2x the volume of the 5 days before, closed in the top third of the day; the NEXT day only if it trades above the jump-day high (skip if it opens over 1% above that), stop at the jump-day low or 2 daily moves under the entry (the higher), stop no wider than 18%, target 2.5x the risk, out after 3 sessions' });
RULES.push({ key: 'reclaim', name: 'Undercut and reclaim (dips under yesterday\u2019s low, closes back above it)', how: 'uptrend (above the 200 day average, 50 over 200), 5 USD+, 2M USD+ traded; the day trades under the previous day\u2019s low but closes back above it, in the top half of its range; the NEXT day only if it trades above that day\u2019s high (skip if it opens over 1% above it); stop just under the undercut low, no wider than 12%, target 1.5x the risk, out after 5 sessions' });
RULES.push({ key: 'loser1', name: 'Deep loser bought at the close, sold the next day', how: 'down 7% or more on the day, 5 USD+, 5M USD+ traded; buy at the close, sell at the next day\u2019s close (no stop)' });
RULES.push({ key: 'loser5', name: 'Deep loser in an uptrend, bought at the close', how: 'down 7% or more on the day while it was above its 200 day average (50 over 200), 5 USD+, 5M USD+ traded; buy at the close, stop 2 daily moves under it, target 1 daily move over it, out after 5 sessions' });
RULES.push({ key: 'crowd', name: 'Most traded and strongest (follow the crowd and the trend)', how: 'each day: the 100 most traded US companies (20 day average in dollars); of those, the 10 that rose most in 20 days and close above their 50 day average; buy the next open, stop 2 daily moves, out after 5 sessions' });
RULES.push({ key: 'candle50', name: 'Bullish candle at the 50 day average in an uptrend (hammer, engulfing, piercing, morning star, harami)', how: 'uptrend (50 over 200 day average), the low touches within 3% of the 50 day average and the close is above it, a bullish candle on 1.5x the 20 day volume, 5 USD+, 2M USD+ traded; buy next open, stop just under the candle low (no wider than 12%), target 2x the risk, out after 10 sessions' });
RULES.push({ key: 'drift', name: 'Big news gap held for weeks (post-earnings drift style)', how: 'opens 5%+ above the previous close on 3x the 50 day volume and closes at or above its open (the gain held all day), 5 USD+, 5M USD+ traded; buy the next open if not 3% above that close, stop just under the gap-day low (no wider than 15%), no target, out after 40 sessions' });
RULES.push({ key: 'strong', name: 'Top-10% strength, tight base, breakout (pre-registered, held up to 40 sessions)', how: 'six-month gain vs the S&P 500 in the top 10% of liquid stocks (5 USD+, 5M USD+ traded a day); above a rising 50 day and the 200 day average; the last 15 sessions within 15% and calmer than before; close above the prior 20 session high on 1.5x the 20 day volume; buy the next open, stop 2 daily moves under it, no target, out after 40 sessions (earnings dates are not in this history)' });
RULES.push({ key: 'buildup', name: 'Volume build-up near the high', how: 'set below after the older-year choice' });
const trades = Object.fromEntries([...RULES.map(r => [r.key, []]), ...BU.map(g => [g.key, []])]), base = [];
// EXIT TEST: the same quick-dip entries sold two ways. A = today's quick-trade exit (first close above the 5 day average,
// the stop, or 5 sessions). B = "take half, let the rest run": half is sold at target 1 (one daily move above the entry); the
// stop on the other half moves to the entry price, then trails 3 daily moves under the highest close, for up to 30 sessions.
const exitA = [], exitB = [];
// CROWD picks, per day: top 100 by 20 day dollar volume, then the 10 strongest over 20 days that close above their 50 day average
const crowdPick = new Set();
{ const perT = Array.from({ length: T }, () => []);
  for (const [sym, c] of bars) { if (sym === 'SPY' || c.length < 60) continue; let dv = 0; const cl = c.map(x => x.c), m50 = avg(cl, 50);
    for (let i = 0; i < c.length; i++) { dv += c[i].c * c[i].v; if (i >= 20) dv -= c[i - 20].c * c[i - 20].v;
      if (i >= 49 && c[i - 20].t === c[i].t - 20 && c[i].c >= 5 && m50[i] && c[i].c > m50[i]) perT[c[i].t].push([dv / 20, c[i].c / c[i - 20].c - 1, sym]); } }
  for (let t = 0; t < T; t++) { const a = perT[t]; if (a.length < 100) { perT[t] = null; continue; } a.sort((x, y) => y[0] - x[0]); a.length = 100; a.sort((x, y) => y[1] - x[1]); for (const r of a.slice(0, 10)) crowdPick.add(r[2] + '|' + t); perT[t] = null; } }
// TOP-10% STRENGTH per day: six-month return minus the S&P 500's, among liquid stocks
const strongTop = new Set();
{ const perT = Array.from({ length: T }, () => []);
  for (const [sym, c] of bars) { if (sym === 'SPY' || c.length < 140) continue; let dv = 0;
    for (let i = 0; i < c.length; i++) { dv += c[i].c * c[i].v; if (i >= 20) dv -= c[i - 20].c * c[i - 20].v;
      if (i >= 126 && c[i - 126].t === c[i].t - 126 && c[i].c >= 5 && dv / 20 >= 5e6 && spyC[c[i].t] && spyC[c[i].t - 126]) perT[c[i].t].push([c[i].c / c[i - 126].c - spyC[c[i].t] / spyC[c[i].t - 126], sym]); } }
  for (let t = 0; t < T; t++) { const a = perT[t]; if (a.length >= 50) { a.sort((x, y) => y[0] - x[0]); for (const r of a.slice(0, Math.ceil(a.length * 0.1))) strongTop.add(r[1] + '|' + t); } perT[t] = null; } }
// a trade bought at the CLOSE of day i: a gap below the stop next morning fills at that open
const closeTrade = (c, i, entry, stop, target, hold) => { const n = c[i + 1]; if (!n || n.t !== c[i].t + 1) return null; if (n.o <= stop) return { exit: n.o, why: 'stop', j: i + 1 }; if (target && n.o >= target) return { exit: n.o, why: 'target', j: i + 1 }; return trade(c, i + 1, entry, stop, target, hold); };
for (const [sym, c] of bars) {
  if (sym === 'SPY' || c.length < 230) continue;
  const cl = c.map(x => x.c), vol = c.map(x => x.v), v50 = avg(vol, 50), m50 = avg(cl, 50), m200 = avg(cl, 200);
  const tr = c.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)) : x.h - x.l), a14 = avg(tr, 14);
  const free = Object.fromEntries([...RULES.map(r => [r.key, -1]), ...BU.map(g => [g.key, -1])]); let bFree = -1;
  const v5 = avg(vol, 5), v20 = avg(vol, 20);
  const sma5 = avg(cl, 5), rsi2 = (() => { const o = new Array(c.length).fill(null); let ag = 0, al = 0; for (let i = 1; i < c.length; i++) { const d = cl[i] - cl[i - 1], g = Math.max(d, 0), l = Math.max(-d, 0); if (i <= 2) { ag += g / 2; al += l / 2; if (i === 2) o[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); continue; } ag = (ag + g) / 2; al = (al + l) / 2; o[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al); } return o; })();
  let exFree = -1;
  const add = (k, i, res, entry, tEntry) => { if (!res) return; const tEnd = c[res.j].t; trades[k].push({ sym, t: tEntry, gross: res.exit / entry - 1, why: res.why, spy: spyRet(tEntry, tEnd) }); free[k] = res.j; };
  for (let i = 210; i < c.length - 2; i++) {
    const b = c[i], p = c[i - 1], n1 = c[i + 1]; if (p.t !== b.t - 1 || !n1 || n1.t !== b.t + 1) continue;
    const loc = b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5, up = b.c / p.c - 1, vx = v50[i - 1] > 0 ? b.v / v50[i - 1] : 0;
    if (i > bFree && b.c >= 5 && b.c * b.v >= 2e6) { const r = trade(c, i + 1, n1.o, n1.o * 0.9, null, 10); if (r) { base.push({ t: b.t, gross: r.exit / n1.o - 1, spy: spyRet(n1.t, c[r.j].t) }); bFree = r.j; } }
    // 1. tight base breakout
    if (i > free.tight && b.c >= 10 && m50[i] > m200[i] && b.c > m50[i]) {
      let hh = 0, ll = Infinity; for (let k = i - 15; k < i; k++) { hh = Math.max(hh, c[k].h); ll = Math.min(ll, c[k].l); }
      const dry = [i - 3, i - 2, i - 1].every(k => v50[k] > 0 && c[k].v < v50[k]);
      if ((hh - ll) / hh < 0.15 && dry && b.c > hh && vx >= 2 && loc >= 0.75 && (n1.o - ll) / n1.o <= 0.05) add('tight', i, trade(c, i + 1, n1.o, ll, null, 10), n1.o, n1.t);
    }
    // 2. holds up while the market falls (entry on the day after the signal day)
    if (i > free.leader && b.c >= 5 && spyRet(b.t - 5, b.t) <= -0.03 && i >= 5 && b.c / c[i - 5].c - 1 >= -0.01 && vx >= 1.5 && spyRet(b.t, n1.t) > 0 && n1.h > b.h) {
      let lo5 = Infinity; for (let k = i - 4; k <= i; k++) lo5 = Math.min(lo5, c[k].l);
      const entry = Math.max(n1.o, b.h + 0.01); add('leader', i, trade(c, i + 1, entry, lo5, null, 5), entry, n1.t);
    }
    // 3. second day after a big up day: b = day 0, n1 = day 1, n2 = day 2
    const n2 = c[i + 2];
    if (i > free.day2 && b.c >= 5 && up >= 0.10 && vx >= 5 && loc >= 0.75 && n2 && n2.t === b.t + 2 && n1.l > b.l && n1.c / b.c - 1 > -0.03 && n1.v < b.v && n2.h > n1.h) {
      const entry = Math.max(n2.o, n1.h + 0.01); add('day2', i, trade(c, i + 2, entry, n1.l, null, 5), entry, n2.t);
    }
    // 4. strict high tight flag: b = the jump day; look 3 to 5 quiet days ahead, then a break
    if (i > free.htf && b.c >= 5 && up >= 0.20 && vx >= 5) {
      for (let q = 3; q <= 5; q++) {
        const f = c.slice(i + 1, i + 1 + q); if (f.length < q || f.some((x, k) => x.t !== b.t + 1 + k)) break;
        const fh = Math.max(...f.map(x => x.h)), fl = Math.min(...f.map(x => x.l)), falling = f.every((x, k) => k === 0 || x.v <= f[k - 1].v), calm = f.every((x, k) => (k ? f[k - 1].c : b.c) * 0.96 <= x.c);
        if ((fh - fl) / fh > 0.12 || !falling || !calm) continue;
        const bi = i + 1 + q, bk = c[bi]; if (!bk || bk.t !== b.t + 1 + q) break;
        if (bk.h > fh && v50[i - 1] > 0 && bk.v >= 2 * v50[i - 1]) { const entry = Math.max(bk.o, fh + 0.01); add('htf', i, trade(c, bi, entry, fl, null, 5), entry, bk.t); }
        break;
      }
    }
    // 6. volume build-up near the high: last 5 days' volume vs the 20 days before, 5 day change in a band, close within 5% of
    // the 25 day closing high, 1M USD+ traded; buy next open, fixed stop and target, out after the hold.
    if (i >= 30 && v20[i - 5] > 0 && v5[i] && b.c * b.v >= 1e6 && c[i - 5].t === b.t - 5) {
      let h25 = 0; for (let k = i - 24; k <= i; k++) h25 = Math.max(h25, c[k].c);
      const ratio = v5[i] / v20[i - 5], chg5 = b.c / c[i - 5].c - 1;
      if (b.c >= 0.95 * h25 && ratio >= 2) for (const g of BU) {
        if (i <= free[g.key] || ratio < g.volR || chg5 < g.lo5 || chg5 > g.hi5 || b.c > g.maxPx) continue;
        const e = n1.o, res = trade(c, i + 1, e, e * (1 - g.stopP), e * (1 + g.tgtP), g.hold);
        if (res) { trades[g.key].push({ sym, t: n1.t, gross: res.exit / e - 1 - (e < 5 ? 0.004 : 0), why: res.why, spy: spyRet(n1.t, c[res.j].t) }); free[g.key] = res.j; }
      }
    }
    // exit test entries: a quick dip in an uptrend (2 day RSI under 10, above the 200 day average, 50 over 200), 5 USD+
    if (i > exFree && b.c >= 5 && rsi2[i] !== null && rsi2[i] < 10 && m200[i] && b.c > m200[i] && m50[i] > m200[i] && a14[i] && b.c * b.v >= 2e6) {
      const e = n1.o, a = a14[i], stop0 = e - 2 * a, t1 = e + a; let A = null, B = null, half = null, hi = e, trail = stop0, endJ = i + 1;
      for (let j = i + 1; j < c.length && c[j].t <= c[i + 1].t + 29; j++) { const k = c[j];
        if (A === null) { if (k.o <= stop0 && j > i + 1) A = k.o / e - 1; else if (k.l <= stop0) A = stop0 / e - 1; else if (j > i + 1 && k.c > sma5[j]) A = k.c / e - 1; else if (k.t >= c[i + 1].t + 4) A = k.c / e - 1; }
        if (B === null) {
          if (half === null) { if (j > i + 1 && k.o <= stop0) B = k.o / e - 1; else if (k.l <= stop0) B = stop0 / e - 1; else if (k.h >= t1) { half = t1 / e - 1; trail = e; } }
          else { if (k.o <= trail) B = (half + (k.o / e - 1)) / 2; else if (k.l <= trail) B = (half + (trail / e - 1)) / 2; }
          if (B === null && half !== null) { hi = Math.max(hi, k.c); trail = Math.max(trail, hi - 3 * a); }
          if (B === null && k.t >= c[i + 1].t + 29) B = half !== null ? (half + (k.c / e - 1)) / 2 : k.c / e - 1;
        }
        endJ = j; if (A !== null && B !== null) break;
      }
      if (A !== null && B !== null) { exitA.push({ t: n1.t, gross: A, spy: null }); exitB.push({ t: n1.t, gross: B, spy: null }); exFree = endJ; }
    }
    // 7. fast mover continuation (the "conditional fast-mover plan"), fixed in advance
    if (i > free.jumpgo && up >= 0.20 && b.c * b.v >= 2e6 && a14[i] && i >= 6) {
      let vs = 0; for (let k = i - 5; k < i; k++) vs += c[k].v; const vm = vs > 0 ? b.v / (vs / 5) : 0, loc3 = b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5, trig = b.h * 1.003;
      if (vm >= 2 && loc3 >= 0.65 && n1.h > trig && n1.o <= trig * 1.01) {
        const entry = Math.max(n1.o, trig), stop = Math.max(b.l, entry - 2 * a14[i]), risk = entry - stop;
        if (risk > 0 && risk / entry <= 0.18) add('jumpgo', i, trade(c, i + 1, entry, stop, entry + 2.5 * risk, 3), entry, n1.t);
      }
    }
    // 8. undercut and reclaim (a daily version of the "liquidity sweep and retest" price-action idea), fixed in advance
    if (i > free.reclaim && b.c >= 5 && b.c * b.v >= 2e6 && m200[i] && b.c > m200[i] && m50[i] > m200[i] && b.l < p.l && b.c > p.l && loc >= 0.5) {
      const trig = b.h * 1.001;
      if (n1.h > trig && n1.o <= trig * 1.01) { const entry = Math.max(n1.o, trig), stop = b.l * 0.998, risk = entry - stop;
        if (risk > 0 && risk / entry <= 0.12) add('reclaim', i, trade(c, i + 1, entry, stop, entry + 1.5 * risk, 5), entry, n1.t); }
    }
    // 9 and 10. deep loser bought at the close
    if (up <= -0.07 && b.c >= 5 && b.c * b.v >= 5e6) {
      if (i > free.loser1) add('loser1', i, closeTrade(c, i, b.c, b.c * 0.01, null, 1), b.c, b.t);
      if (i > free.loser5 && a14[i] && m200[i - 1] && p.c > m200[i - 1] && m50[i - 1] > m200[i - 1]) add('loser5', i, closeTrade(c, i, b.c, b.c - 2 * a14[i], b.c + a14[i], 5), b.c, b.t);
    }
    // 12. bullish candle at the 50 day average in an uptrend, on volume
    if (i > free.candle50 && b.c >= 5 && b.c * b.v >= 2e6 && m50[i] && m200[i] && m50[i] > m200[i] && b.l <= m50[i] * 1.03 && b.c > m50[i] && v20[i - 1] > 0 && b.v >= 1.5 * v20[i - 1] && bullishCandle(c, i)) {
      const e = n1.o, stop = b.l * 0.995, risk = e - stop;
      if (risk > 0 && risk / e <= 0.12) add('candle50', i, trade(c, i + 1, e, stop, e + 2 * risk, 10), e, n1.t);
    }
    // 13. big news gap held for weeks: the gap usually comes from earnings or other company news (no news history to check, so price and volume stand in)
    if (i > free.drift && b.c >= 5 && b.c * b.v >= 5e6 && b.o >= p.c * 1.05 && b.c >= b.o && v50[i - 1] > 0 && b.v >= 3 * v50[i - 1] && n1.o <= b.c * 1.03) {
      const e = n1.o, stop = b.l * 0.995;
      if (e > stop && (e - stop) / e <= 0.15) add('drift', i, trade(c, i + 1, e, stop, null, 40), e, n1.t);
    }
    // 14. top-10% strength, tight calmer base, breakout on volume (pre-registered, fixed)
    if (i > free.strong && i >= 30 && a14[i] && a14[i - 15] && m50[i] && m50[i - 5] && m200[i] && b.c > m50[i] && m50[i] > m50[i - 5] && b.c > m200[i] && v20[i - 1] > 0 && b.v >= 1.5 * v20[i - 1] && strongTop.has(sym + '|' + b.t)) {
      let h20 = 0, bh = 0, bl = Infinity; for (let k = i - 20; k < i; k++) h20 = Math.max(h20, c[k].h); for (let k = i - 15; k < i; k++) { bh = Math.max(bh, c[k].h); bl = Math.min(bl, c[k].l); }
      if (b.c > h20 && (bh - bl) / b.c <= 0.15 && a14[i - 1] < a14[i - 15]) { const e = n1.o; add('strong', i, trade(c, i + 1, e, e - 2 * a14[i], null, 40), e, n1.t); }
    }
    // 11. most traded and strongest
    if (i > free.crowd && a14[i] && crowdPick.has(sym + '|' + b.t)) { const e = n1.o; add('crowd', i, trade(c, i + 1, e, e - 2 * a14[i], null, 5), e, n1.t); }
    // 5. 20 day high, quality version
    if (i > free.brk20q && b.c >= 10 && vx >= 2 && loc >= 0.75 && spy50[b.t] && spyC[b.t] > spy50[b.t]) {
      let h20 = 0, l10 = Infinity; for (let k = i - 20; k < i; k++) h20 = Math.max(h20, c[k].h); for (let k = i - 9; k <= i; k++) l10 = Math.min(l10, c[k].l);
      if (b.c > h20 && n1.o <= b.c * 1.05 && a14[i]) { const stop = Math.max(l10, n1.o - 2 * a14[i]), entry = n1.o; add('brk20q', i, trade(c, i + 1, entry, stop, entry + 2 * (entry - stop), 10), entry, n1.t); }
    }
  }
}

function stats(a, cost) {
  if (!a.length) return { n: 0 };
  const p = a.map(x => x.gross - cost), w = p.filter(x => x > 0), l = p.filter(x => x <= 0), sum = z => z.reduce((x, y) => x + y, 0), sp = a.filter(x => x.spy !== null).map(x => x.spy);
  return { n: p.length, win: w.length / p.length, avg: sum(p) / p.length, pf: l.length && sum(l) < 0 ? sum(w) / -sum(l) : null, spy: sp.length ? sum(sp) / sp.length : null, bestShare: sum(w) > 0 ? Math.max(...w) / sum(w) : null, stops: a.filter(x => x.why === 'stop').length / a.length };
}
const older = a => a.filter(x => x.t < mid), newer = a => a.filter(x => x.t >= mid);
{ let best = null; for (const g of BU) { const o = stats(older(trades[g.key]), COST.base); if (o.n >= 30 && (!best || o.avg > best.o.avg)) best = { g, o }; }
  const r = RULES.find(x => x.key === 'buildup');
  if (best) { const g = best.g; trades.buildup = trades[g.key];
    r.how = 'chosen on the older half from ' + BU.length + ' versions: last 5 days\u2019 volume ' + g.volR + 'x the 20 days before, 5 day change ' + pc(g.lo5, 0) + ' to ' + pc(g.hi5, 0) + ', close within 5% of the 25 day high' + (g.maxPx < 1e6 ? ', price ' + g.maxPx + ' USD or less' : '') + '; buy next open, stop ' + pc(-g.stopP, 0) + ', target ' + pc(g.tgtP, 0) + ', out after ' + g.hold + ' sessions'; r.config = g; }
  else r.how = 'no version had 30 older-year trades'; }
const bOld = stats(older(base), COST.base), bNew = stats(newer(base), COST.base);
const rows = RULES.map(r => {
  const a = trades[r.key], o = stats(older(a), COST.base), nw = stats(newer(a), COST.base), lo = stats(newer(a), COST.low), why = [];
  let v = 'PROMISING';
  if (o.n < 20 || nw.n < 20) { v = 'NOT PROVEN'; why.push('too few trades (' + o.n + ' older, ' + nw.n + ' newer; 20 each needed)'); }
  else if (!(lo.avg > 0)) { v = 'REJECTED'; why.push('lost money in the newer half even at the lowest cost'); }
  else {
    if (!(o.avg > 0)) why.push('lost money in the older half');
    if (!(nw.avg > 0)) why.push('average under zero at 0.8% cost');
    if (!(nw.pf > 1.2)) why.push('profit factor ' + (nw.pf ? nw.pf.toFixed(2) : 'n/a'));
    if (nw.spy !== null && !(nw.avg > nw.spy)) why.push('no better than the S&P 500 over the same days');
    if (bNew.n && !(nw.avg > bNew.avg + 0.0025)) why.push('not clearly better than a random stock');
    if (nw.bestShare > 0.5) why.push('one trade made half the gains');
    { const hi = stats(newer(a), COST.base + 0.004); if (!(hi.avg > 0)) why.push('loses at higher costs (1.2% a trade)'); }   // stress test: costs half again
    { const rc = stats(a.filter(x => x.t >= T - 252), COST.base); if (rc.n >= 10 && !(rc.avg > 0)) why.push('lost money in the last 12 months (' + rc.n + ' trades, ' + pc(rc.avg) + ')'); }   // the newest year on its own
    if (why.length) v = 'NOT PROVEN';
  }
  // MARKET TYPE: the same trades split by whether the S&P 500 was above its 50 day average at entry (a rising market) or not
  const up = (x) => spy50[x.t] && spyC[x.t] > spy50[x.t], ro = stats(older(a).filter(up), COST.base), rn = stats(newer(a).filter(up), COST.base), fo = stats(older(a).filter(x => !up(x)), COST.base), fn = stats(newer(a).filter(x => !up(x)), COST.base);
  const risingOnly = ro.n >= 20 && rn.n >= 20 && ro.avg > 0 && rn.avg > 0 && (rn.pf || 0) > 1.2;
  return { ...r, verdict: v, why: why.join('; ') || 'passed in both halves. Paper only until its new-day record also passes', older: o, newer: nw, newerLow: lo, market: { risingOld: ro, risingNew: rn, fallingOld: fo, fallingNew: fn, risingOnly } };
});
// forward paper record for passing rules, on days that arrive after they passed
const FP = (() => { try { return JSON.parse(fs.readFileSync(PAPER, 'utf8')); } catch (e) { return { rules: {} }; } })();
for (const r of rows.filter(x => x.verdict === 'PROMISING')) if (!FP.rules[r.key]) FP.rules[r.key] = { name: r.name, since: D[T - 1], ...(r.config ? { cfgKey: r.config.key, how: r.how } : {}) };   // the build-up version is frozen when it goes on paper
for (const [k, p] of Object.entries(FP.rules)) { const st = stats((trades[p.cfgKey || k] || []).filter(x => D[x.t] > p.since), COST.base); p.forward = st; p.status = st.n >= 30 && st.avg > 0 && (st.pf === null || st.pf > 1.2) && (st.spy === null || st.avg > st.spy) ? 'GRADUATED' : st.n >= 30 ? 'DROPPED' : 'ON PAPER'; }
fs.writeFileSync(PAPER, JSON.stringify(FP, null, 1));
const line = s => !s || !s.n ? 'no trades' : s.n + ' trades, ' + Math.round(s.win * 100) + '% won, average ' + pc(s.avg) + (s.pf ? ', profit factor ' + s.pf.toFixed(2) : '');
const EX = (() => { const aO = stats(older(exitA), COST.base), aN = stats(newer(exitA), COST.base), bO = stats(older(exitB), COST.base + 0.004), bN = stats(newer(exitB), COST.base + 0.004);   // B pays one extra sale fee
  const ok = aO.n >= 30 && aN.n >= 30 && bO.avg > aO.avg && bN.avg > aN.avg && bN.avg > 0;
  return { aO, aN, bO, bN, verdict: aO.n < 30 || aN.n < 30 ? 'NOT ENOUGH CASES' : ok ? 'TAKE HALF, LET THE REST RUN wins in both halves' : 'KEEP THE CURRENT QUICK EXIT' }; })();
const msg = ['HUNTING LAB, ' + D[T - 1], RULES.length + ' new ways to catch moves, each a complete trade, tested on the whole US market ' + D[0] + ' to ' + D[T - 1] + ' (collapsed stocks included), 0.8% cost. Rules fixed in advance (the build-up version is chosen on the older half only); each must pass in BOTH halves.', '',
  ...(rows.some(r => r.verdict === 'REJECTED') ? ['REJECTED (lost money on the newer half even at the lowest cost): ' + rows.filter(r => r.verdict === 'REJECTED').map(r => r.name.replace(/ \(.*\)$/, '') + ' ' + pc(r.newer.avg)).join('; ') + '.', ''] : []),
  ...rows.filter(r => r.verdict !== 'REJECTED').map(r => r.verdict + ': ' + r.name + (r.key === 'buildup' ? '\n  version: ' + r.how : '') + '\n  older half: ' + line(r.older) + '\n  newer half: ' + line(r.newer) + (r.newer.n ? ', stopped out ' + Math.round(r.newer.stops * 100) + '%' : '') + '\n  ' + r.why), '',
  ...(rows.some(r => r.market.risingOnly) ? ['RISING MARKETS ONLY (S&P 500 above its 50 day average at entry): ' + rows.filter(r => r.market.risingOnly).map(r => r.name.replace(/ \(.*\)$/, '') + ': older ' + pc(r.market.risingOld.avg) + ' (' + r.market.risingOld.n + '), newer ' + pc(r.market.risingNew.avg) + ' (' + r.market.risingNew.n + ')').join('; ') + '. Promising only when the market is rising; to be tested as its own rule.', ''] : ['Market type check: no rule made money in rising markets in both halves.', '']),
  'Buying a random stock for 10 days, newer half: ' + line(bNew) + '.',
  '', 'EXIT TEST on the same quick-dip entries (' + EX.aO.n + ' + ' + EX.aN.n + ' trades)',
  '  current exit (5 day average or 5 days): older ' + line(EX.aO) + ' | newer ' + line(EX.aN),
  '  take half at +1 daily move, let the rest run (trailing stop, up to 30 days): older ' + line(EX.bO) + ' | newer ' + line(EX.bN),
  '  RESULT: ' + EX.verdict + '.',
  ...(Object.keys(FP.rules).length ? ['', 'ON PAPER (new days only)', ...Object.values(FP.rules).map(p => p.status + ': ' + p.name + ' since ' + p.since + ', ' + (p.forward && p.forward.n ? line(p.forward) : 'no new trade yet'))] : []),
  '', rows.some(r => r.verdict === 'PROMISING') ? 'A rule that passed goes on paper; it becomes a BUY only if its new-day record passes too.' : 'No new way passed. Nothing to act on. The lab repeats every Sunday as new days come in.',
  'Not tested here (no history to test on): Reddit or YouTube mentions plus a breakout, and news-tag rules. Those are scored forward instead (sources, movers journal).',
  'Daily prices only; fills at the open or the stated level are assumed. Research, not an order. Not financial advice, not a halal ruling.'];
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), status: 'OK', from: D[0], to: D[T - 1], splitAt: D[mid], exitTest: EX, rules: rows, base: { older: bOld, newer: bNew }, text: msg.join('\n') }, null, 1));
if (env.TG_TOKEN && env.TG_CHAT && (!QUIET || rows.some(r => r.verdict === 'PROMISING' || r.market.risingOnly) || Object.values(FP.rules).some(p => p.status === 'GRADUATED'))) { let rest = msg.join('\n'); const parts = []; while (rest.length > 3800) { let cut = rest.lastIndexOf('\n\n', 3800); if (cut < 1500) cut = rest.lastIndexOf('\n', 3800); if (cut < 1500) cut = 3800; parts.push(rest.slice(0, cut)); rest = rest.slice(cut).replace(/^\n+/, ''); } parts.push(rest);
  for (const part of parts) { await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: part, disable_web_page_preview: true }) }).catch(() => {}); await new Promise(r => setTimeout(r, 700)); } }
console.log(msg.join('\n'));
