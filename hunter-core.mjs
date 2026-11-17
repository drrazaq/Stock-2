// HUNTER LAB core (squad 30; owner, 17 Nov 2026: "penny stock is one of the biggest sources that can make money ... hunt the strategy
// and do chain study back ... which stock if it goes up might affect the market ... which if it goes down will push the trader to safety").
// Pure functions only (tested in test/hunter-core.test.mjs); squad30-lab.mjs does the data. Research and paper only: never an order.
// Rules are PRE-REGISTERED here (17 Nov 2026) before any 5-year number was seen; the first verdict of each rule is frozen.
//
// WHAT IS NEW vs earlier labs: every earlier whole-market study used the price cache of 3 USD+ rows (leaders-study.mjs) or a 1 USD floor
// (winners-autopsy-lab.mjs), so stocks under 3 USD and under 1 USD were never tested on history. This lab uses Massive grouped daily
// bars of EVERY US stock on each day (dead stocks included, split-adjusted), keeps common stocks and ADRs only (warrants, units,
// rights, ETFs and funds excluded by the Massive reference type), and charges penny-size costs.

// COSTS on a 1,000 USD trade, round trip: 6 USD fees (0.6%) + spread and slippage by entry price (pennies have wide spreads).
export function costOf(px, mult = 1) {
  const spread = px < 0.5 ? 0.04 : px < 1 ? 0.03 : px < 3 ? 0.015 : px < 10 ? 0.006 : 0.003;
  return (0.006 + spread) * mult;
}
export const tierOf = (px) => px < 1 ? 'U1' : px < 3 ? 'P1_3' : px < 5 ? 'P3_5' : 'S5';

// s: one symbol's series { d: [dayIndex...], o, h, l, c, v } (arrays, sorted by day, gaps where the stock did not trade)
// k: position in s. Returns null when a needed bar is missing.
const ok = (x) => Number.isFinite(x) && x > 0;
export function bar(s, k) { if (k < 0 || k >= s.d.length) return null; const b = { di: s.d[k], o: s.o[k], h: s.h[k], l: s.l[k], c: s.c[k], v: s.v[k] }; return ok(b.o) && ok(b.c) && ok(b.h) && ok(b.l) ? b : null; }
// consecutive: bar k+1 is the next market day after bar k
export const next = (s, k) => k + 1 < s.d.length && s.d[k + 1] === s.d[k] + 1;
export function medVol(s, k, n = 20) { const a = []; for (let j = Math.max(0, k - n); j < k; j++) if (ok(s.v[j])) a.push(s.v[j]); if (a.length < Math.min(10, n)) return null; a.sort((x, y) => x - y); return a[a.length >> 1]; }
export function highClose(s, k, n = 60) { let m = -Infinity, cnt = 0; for (let j = Math.max(0, k - n); j < k; j++) { if (ok(s.c[j])) { m = Math.max(m, s.c[j]); cnt++; } } return cnt >= 40 ? m : null; }
// a day move above +400% or below -90% is almost always a reverse split or a data error in daily data: never a signal
export const sane = (p, x) => ok(p) && ok(x) && x / p < 5 && x / p > 0.1;

// exit: buy at the OPEN of bar e, hold up to `hold` market days (1 = sell the same close), optional stop (fraction below entry).
// A stop hit exits at min(open, stop) less 1% extra slippage (pennies gap through stops). If the stock stops trading inside the hold,
// the last close is used and 20% is taken off (delisting / halt risk). Returns { entry, exit, gross, days, how } or null.
export function exitTrade(s, e, hold, stop = null) {
  const b0 = bar(s, e); if (!b0) return null; const entry = b0.o, sp = stop ? entry * (1 - stop) : null;
  let k = e;
  for (let n = 0; n < hold; n++) {
    const b = bar(s, k); if (!b) return null;
    if (sp !== null) { const hitOpen = n > 0 && b.o <= sp; if (hitOpen || b.l <= sp) { const px = (hitOpen ? b.o : sp) * 0.99; return { entry, exit: px, gross: px / entry - 1, days: n + 1, how: 'stop' }; } }
    if (n === hold - 1) return { entry, exit: b.c, gross: b.c / entry - 1, days: n + 1, how: 'time' };
    if (!next(s, k)) { const px = b.c * 0.8; return { entry, exit: px, gross: px / entry - 1, days: n + 1, how: 'stopped trading' }; }
    k++;
  }
  return null;
}

// ---- PRE-REGISTERED RULES (17 Nov 2026). signal(s, k, ctx) -> entry position e (buy at its open) or -1. ctx: { prevDollar }
// Liquidity floor for every penny rule: previous day's dollar volume >= 300,000 USD (a 1,000 USD order is under 0.4% of it).
const liquid = (s, k) => ok(s.c[k]) && ok(s.v[k]) && s.c[k] * s.v[k] >= 3e5;
export const RULES = {
  'PNY-GAP1': { text: 'Penny gap-and-go: previous close 0.20-3 USD, opens 20%+ above it; buy the open, sell the same close', hold: 1, stop: null,
    sig: (s, k) => { const p = bar(s, k - 1), b = bar(s, k); if (!p || !b || s.d[k] !== s.d[k - 1] + 1) return -1; if (p.c < 0.2 || p.c >= 3 || !liquid(s, k - 1) || !sane(p.c, b.o)) return -1; return b.o / p.c - 1 >= 0.2 ? k : -1; } },
  'PNY-GAP2': { text: 'PNY-GAP1 with a 10% stop under the open', hold: 1, stop: 0.10, same: 'PNY-GAP1' },
  'PNY-GAP3': { text: 'PNY-GAP1 but only moderate gaps (20-60%); sell the same close', hold: 1, stop: null,
    sig: (s, k) => { const e = RULES['PNY-GAP1'].sig(s, k); if (e < 0) return -1; const g = s.o[k] / s.c[k - 1] - 1; return g <= 0.6 ? k : -1; } },
  'PNY-RUN2': { text: 'Penny day-2: closed 40%+ up, in the top 20% of its range, 1M USD+ traded, 0.20-3 USD; buy next open, sell next close', hold: 1, stop: null,
    sig: (s, k) => { const p = bar(s, k - 1), b = bar(s, k); if (!p || !b || s.d[k] !== s.d[k - 1] + 1 || !next(s, k)) return -1; if (b.c < 0.2 || b.c >= 3 || b.c * b.v < 1e6 || !sane(p.c, b.c)) return -1;
      const up = b.c / p.c - 1, pos = b.h > b.l ? (b.c - b.l) / (b.h - b.l) : 0; return up >= 0.4 && pos >= 0.8 ? k + 1 : -1; } },
  'PNY-RUN3': { text: 'PNY-RUN2 entry, hold 3 days, 15% stop', hold: 3, stop: 0.15, same: 'PNY-RUN2' },
  'PNY-VOL5': { text: 'Penny volume burst: volume 10x its 20-day median, closed 20%+ up, 0.30-5 USD; buy next open, hold 5 days, 20% stop', hold: 5, stop: 0.20,
    sig: (s, k) => { const p = bar(s, k - 1), b = bar(s, k); if (!p || !b || s.d[k] !== s.d[k - 1] + 1 || !next(s, k)) return -1; if (b.c < 0.3 || b.c >= 5 || !liquid(s, k) || !sane(p.c, b.c)) return -1;
      const m = medVol(s, k); return m && b.v >= 10 * m && b.c / p.c - 1 >= 0.2 ? k + 1 : -1; } },
  'PNY-BRK': { text: 'Penny breakout: close at a 60-day closing high, 10%+ up, volume 5x median, 1-5 USD; buy next open, hold 10 days, 15% stop', hold: 10, stop: 0.15,
    sig: (s, k) => { const p = bar(s, k - 1), b = bar(s, k); if (!p || !b || s.d[k] !== s.d[k - 1] + 1 || !next(s, k)) return -1; if (b.c < 1 || b.c >= 5 || !liquid(s, k) || !sane(p.c, b.c)) return -1;
      const m = medVol(s, k), hc = highClose(s, k); return m && hc && b.c > hc && b.v >= 5 * m && b.c / p.c - 1 >= 0.1 ? k + 1 : -1; } },
  'PNY-DIP': { text: 'Penny crash bounce: closed 30%+ down (not a split), 0.30-5 USD, 500k USD+ traded the day before; buy next open, hold 3 days', hold: 3, stop: null,
    sig: (s, k) => { const p = bar(s, k - 1), b = bar(s, k); if (!p || !b || s.d[k] !== s.d[k - 1] + 1 || !next(s, k)) return -1; if (p.c < 0.3 || p.c >= 5 || p.c * p.v < 5e5 || !sane(p.c, b.c)) return -1; return b.c / p.c - 1 <= -0.3 ? k + 1 : -1; } },
  'PNY-FADE': { text: 'INFORMATION: penny that doubled (closed 100%+ up, 0.20-5 USD): what buying the next open and holding 5 days did', hold: 5, stop: null, info: true,
    sig: (s, k) => { const p = bar(s, k - 1), b = bar(s, k); if (!p || !b || s.d[k] !== s.d[k - 1] + 1 || !next(s, k)) return -1; if (b.c < 0.2 || b.c >= 5 || !liquid(s, k) || !sane(p.c, b.c)) return -1; return b.c / p.c - 1 >= 1 ? k + 1 : -1; } },
  // NEWS BEFORE THE OPEN (any price 0.30 USD+): gap 10%+ at the open; the lab marks each gap with/without a Massive news story published
  // between the previous 16:00 and 09:25 New York. NEWS-GAP1 = with news, NEWS-GAP0 = without (the control). Buy the open, sell the close.
  'NEWS-GAP1': { text: 'Gap 10%+ at the open WITH a news story between the previous close and 09:25 New York (0.30 USD+, 300k USD+ traded); buy the open, sell the close', hold: 1, stop: null, news: true,
    sig: (s, k) => { const p = bar(s, k - 1), b = bar(s, k); if (!p || !b || s.d[k] !== s.d[k - 1] + 1) return -1; if (p.c < 0.3 || !liquid(s, k - 1) || !sane(p.c, b.o)) return -1; return b.o / p.c - 1 >= 0.1 ? k : -1; } },
  'NEWS-GAP0': { text: 'Control: the same gaps WITHOUT news before the open', hold: 1, stop: null, news: false, same: 'NEWS-GAP1' },
  'NEWS-GAP2': { text: 'NEWS-GAP1 held 3 days with a 12% stop', hold: 3, stop: 0.12, news: true, same: 'NEWS-GAP1' },
};
export const sigOf = (id) => RULES[id].sig || RULES[RULES[id].same].sig;

// ---- STATISTICS and the VERDICT (registered with the rules)
// trades: [{ di (entry day index), net, gross, px }]. Day-clustered t: the average of each entry day's trades, then t over days.
export function stats(trades) {
  const n = trades.length; if (!n) return { n: 0 };
  const net = trades.map(t => t.net).sort((a, b) => a - b), avg = net.reduce((a, b) => a + b, 0) / n;
  const byDay = new Map(); for (const t of trades) { const a = byDay.get(t.di) || []; a.push(t.net); byDay.set(t.di, a); }
  const dm = [...byDay.values()].map(a => a.reduce((x, y) => x + y, 0) / a.length), m = dm.reduce((a, b) => a + b, 0) / dm.length;
  const sd = Math.sqrt(dm.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, dm.length - 1)), t = sd > 0 ? m / sd * Math.sqrt(dm.length) : 0;
  const wo2 = n > 2 ? net.slice(0, n - 2).reduce((a, b) => a + b, 0) / (n - 2) : null;
  return { n, days: dm.length, avg, median: net[n >> 1], win: net.filter(x => x > 0).length / n, t, dayAvg: m, withoutBest2: wo2 };
}
// PASS = TRY SMALL: 60+ trades; average after costs > 0 in BOTH halves; day-clustered t >= 2.5; still > 0 at 1.5x costs and without
// the 2 best trades. Average > 0 but a test missed = NOT PROVEN. Average <= 0 = REJECTED. Information rules: INFORMATION.
export function verdict(all, older, newer, at15, rule = {}) {
  if (rule.info) return { verdict: 'INFORMATION', why: 'not a buy rule' };
  if (all.n < 60) return { verdict: 'TOO FEW', why: all.n + ' trades (60 needed)' };
  const miss = [];
  if (!(older.avg > 0)) miss.push('lost money in the older half'); if (!(newer.avg > 0)) miss.push('lost money in the newer half');
  if (!(all.t >= 2.5)) miss.push('t ' + (all.t || 0).toFixed(2) + ' under 2.5'); if (!(at15.avg > 0)) miss.push('loses at 1.5x costs');
  if (!(all.withoutBest2 > 0)) miss.push('loses without its 2 best trades');
  if (!(all.avg > 0)) return { verdict: 'REJECTED', why: 'lost money after costs (' + (all.avg * 100).toFixed(2) + '% a trade); ' + miss.join('; ') };
  return miss.length ? { verdict: 'NOT PROVEN', why: miss.join('; ') } : { verdict: 'TRY SMALL', why: 'passed every registered test' };
}
