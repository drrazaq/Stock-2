// HUNTING LAB. New ways to catch moves, each written as a complete trade (entry, stop, exit) and tested on two years of the
// WHOLE US market, stocks that later collapsed included, after costs. The rules are fixed in advance (no tuning), and each must
// make money in BOTH the older and the newer year, beat the S&P 500 over the same days, and beat buying a random stock the same
// way. A rule that passes goes on paper on the new days that arrive each week; only a passing paper record could ever make it
// a BUY. Uses the price cache built by leaders-study.mjs (same weekly job). No data calls. Read-only.
import fs from 'node:fs';
import zlib from 'node:zlib';

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

// ---- the rules (fixed in advance)
const RULES = [
  { key: 'tight', name: 'Tight base breakout', how: 'uptrend (50 day over 200 day average), 15 quiet days in a range under 15% on drying volume, then a close above that range on 2x volume in the top quarter of the day; buy next open, stop at the range low (risk 5% or less), out after 10 sessions' },
  { key: 'leader', name: 'Holds up while the market falls', how: 'S&P 500 down 3%+ over 5 days while the stock is down under 1% (or up) on 1.5x volume; next day the market is up and the stock breaks the previous high; stop at the 5 day low, out after 5 sessions' },
  { key: 'day2', name: 'Second day after a big up day', how: 'day 0 up 10%+ on 5x volume, closed in the top quarter; day 1 holds above day 0 low, not down over 3%, on less volume; buy a break of the day 1 high on day 2, stop at the day 1 low, out after 5 sessions' },
  { key: 'htf', name: 'Strict high tight flag', how: 'up 20%+ on 5x volume, then 3 to 5 quiet days in a range of 12% or less on falling volume with no down day over 4%; buy a break of the quiet high on 2x volume, stop at the quiet low, out after 5 sessions' },
  { key: 'brk20q', name: '20 day high, quality version', how: 'close at a 20 day high on 2x volume in the top quarter of the day, price 10 USD+, S&P 500 above its 50 day average; buy next open if not 5% above the close, stop at the 10 day low or 2 daily moves (the closer), target 2x the risk, out after 10 sessions' }];
// 6. VOLUME BUILD-UP NEAR THE HIGH (the "profit tournament" idea, tested fairly). Many versions are tried, but the version is
// CHOSEN ON THE OLDER YEAR ONLY; the newer year then judges that one version with the same gates as every other rule.
// Under 5 USD an extra 0.4% cost is charged (wider spreads).
const BU = [];
for (const volR of [2, 3]) for (const [lo5, hi5] of [[0, 0.08], [0, 0.18], [-0.05, 0.12]]) for (const hold of [5, 8]) for (const stopP of [0.06, 0.10]) for (const tgtP of [0.10, 0.20]) for (const maxPx of [20, 1e9])
  BU.push({ volR, lo5, hi5, hold, stopP, tgtP, maxPx, key: 'bu' + BU.length });
RULES.push({ key: 'jumpgo', name: 'Fast mover continuation (next day breaks the jump-day high)', how: 'up 20%+ on 2x the volume of the 5 days before, closed in the top third of the day; the NEXT day only if it trades above the jump-day high (skip if it opens over 1% above that), stop at the jump-day low or 2 daily moves under the entry (the higher), stop no wider than 18%, target 2.5x the risk, out after 3 sessions' });
RULES.push({ key: 'buildup', name: 'Volume build-up near the high', how: 'set below after the older-year choice' });
const trades = Object.fromEntries([...RULES.map(r => [r.key, []]), ...BU.map(g => [g.key, []])]), base = [];
for (const [sym, c] of bars) {
  if (sym === 'SPY' || c.length < 230) continue;
  const cl = c.map(x => x.c), vol = c.map(x => x.v), v50 = avg(vol, 50), m50 = avg(cl, 50), m200 = avg(cl, 200);
  const tr = c.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)) : x.h - x.l), a14 = avg(tr, 14);
  const free = Object.fromEntries([...RULES.map(r => [r.key, -1]), ...BU.map(g => [g.key, -1])]); let bFree = -1;
  const v5 = avg(vol, 5), v20 = avg(vol, 20);
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
    // 7. fast mover continuation (the "conditional fast-mover plan"), fixed in advance
    if (i > free.jumpgo && up >= 0.20 && b.c * b.v >= 2e6 && a14[i] && i >= 6) {
      let vs = 0; for (let k = i - 5; k < i; k++) vs += c[k].v; const vm = vs > 0 ? b.v / (vs / 5) : 0, loc3 = b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0.5, trig = b.h * 1.003;
      if (vm >= 2 && loc3 >= 0.65 && n1.h > trig && n1.o <= trig * 1.01) {
        const entry = Math.max(n1.o, trig), stop = Math.max(b.l, entry - 2 * a14[i]), risk = entry - stop;
        if (risk > 0 && risk / entry <= 0.18) add('jumpgo', i, trade(c, i + 1, entry, stop, entry + 2.5 * risk, 3), entry, n1.t);
      }
    }
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
    r.how = 'chosen on the older year from ' + BU.length + ' versions: last 5 days\u2019 volume ' + g.volR + 'x the 20 days before, 5 day change ' + pc(g.lo5, 0) + ' to ' + pc(g.hi5, 0) + ', close within 5% of the 25 day high' + (g.maxPx < 1e6 ? ', price ' + g.maxPx + ' USD or less' : '') + '; buy next open, stop ' + pc(-g.stopP, 0) + ', target ' + pc(g.tgtP, 0) + ', out after ' + g.hold + ' sessions'; r.config = g; }
  else r.how = 'no version had 30 older-year trades'; }
const bOld = stats(older(base), COST.base), bNew = stats(newer(base), COST.base);
const rows = RULES.map(r => {
  const a = trades[r.key], o = stats(older(a), COST.base), nw = stats(newer(a), COST.base), lo = stats(newer(a), COST.low), why = [];
  let v = 'PROMISING';
  if (o.n < 20 || nw.n < 20) { v = 'NOT PROVEN'; why.push('too few trades (' + o.n + ' older, ' + nw.n + ' newer; 20 each needed)'); }
  else if (!(lo.avg > 0)) { v = 'REJECTED'; why.push('lost money in the newer year even at the lowest cost'); }
  else {
    if (!(o.avg > 0)) why.push('lost money in the older year');
    if (!(nw.avg > 0)) why.push('average under zero at 0.8% cost');
    if (!(nw.pf > 1.2)) why.push('profit factor ' + (nw.pf ? nw.pf.toFixed(2) : 'n/a'));
    if (nw.spy !== null && !(nw.avg > nw.spy)) why.push('no better than the S&P 500 over the same days');
    if (bNew.n && !(nw.avg > bNew.avg + 0.0025)) why.push('not clearly better than a random stock');
    if (nw.bestShare > 0.5) why.push('one trade made half the gains');
    if (why.length) v = 'NOT PROVEN';
  }
  return { ...r, verdict: v, why: why.join('; ') || 'passed in both years. Paper only until its new-day record also passes', older: o, newer: nw, newerLow: lo };
});
// forward paper record for passing rules, on days that arrive after they passed
const FP = (() => { try { return JSON.parse(fs.readFileSync(PAPER, 'utf8')); } catch (e) { return { rules: {} }; } })();
for (const r of rows.filter(x => x.verdict === 'PROMISING')) if (!FP.rules[r.key]) FP.rules[r.key] = { name: r.name, since: D[T - 1], ...(r.config ? { cfgKey: r.config.key, how: r.how } : {}) };   // the build-up version is frozen when it goes on paper
for (const [k, p] of Object.entries(FP.rules)) { const st = stats((trades[p.cfgKey || k] || []).filter(x => D[x.t] > p.since), COST.base); p.forward = st; p.status = st.n >= 30 && st.avg > 0 && (st.pf === null || st.pf > 1.2) && (st.spy === null || st.avg > st.spy) ? 'GRADUATED' : st.n >= 30 ? 'DROPPED' : 'ON PAPER'; }
fs.writeFileSync(PAPER, JSON.stringify(FP, null, 1));
const line = s => !s || !s.n ? 'no trades' : s.n + ' trades, ' + Math.round(s.win * 100) + '% won, average ' + pc(s.avg) + (s.pf ? ', profit factor ' + s.pf.toFixed(2) : '');
const msg = ['HUNTING LAB, ' + D[T - 1], RULES.length + ' new ways to catch moves, each a complete trade, tested on the whole US market ' + D[0] + ' to ' + D[T - 1] + ' (collapsed stocks included), 0.8% cost. Rules fixed in advance (the build-up version is chosen on the older year only); each must pass in BOTH years.', '',
  ...rows.map(r => r.verdict + ': ' + r.name + (r.key === 'buildup' ? '\n  version: ' + r.how : '') + '\n  older year: ' + line(r.older) + '\n  newer year: ' + line(r.newer) + (r.newer.n ? ', stopped out ' + Math.round(r.newer.stops * 100) + '%' : '') + '\n  ' + r.why), '',
  'Buying a random stock for 10 days, newer year: ' + line(bNew) + '.',
  ...(Object.keys(FP.rules).length ? ['', 'ON PAPER (new days only)', ...Object.values(FP.rules).map(p => p.status + ': ' + p.name + ' since ' + p.since + ', ' + (p.forward && p.forward.n ? line(p.forward) : 'no new trade yet'))] : []),
  '', rows.some(r => r.verdict === 'PROMISING') ? 'A rule that passed goes on paper; it becomes a BUY only if its new-day record passes too.' : 'No new way passed. Nothing to act on. The lab repeats every Sunday as new days come in.',
  'Not tested here (no history to test on): Reddit or YouTube mentions plus a breakout, and news-tag rules. Those are scored forward instead (sources, movers journal).',
  'Daily prices only; fills at the open or the stated level are assumed. Research, not an order. Not financial advice, not a halal ruling.'];
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), status: 'OK', from: D[0], to: D[T - 1], splitAt: D[mid], rules: rows, base: { older: bOld, newer: bNew }, text: msg.join('\n') }, null, 1));
if (env.TG_TOKEN && env.TG_CHAT) await fetch(TG + '/bot' + env.TG_TOKEN + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: env.TG_CHAT, text: msg.join('\n').slice(0, 3900), disable_web_page_preview: true }) }).catch(() => {});
console.log(msg.join('\n'));
