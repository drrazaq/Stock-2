// Minimal evidence core for the EVENT_ORB_RETEST_15D_V1 research lane (event-orb-retest-core.mjs imports it).
// It provides exactly what that core needs: COST_SCENARIOS, DEFAULT_COST, simulateLong and metrics.
// Cost model = the Stock-2 house model, never lower: 0.8% of the trade per round trip (base) and 1.2% (stress).
// The lane's core asks for the scenario named "midpoint" (its ledger and study read scenarios.midpoint), so the
// base cost is published under that name and the stress cost under "worst". There is no cheaper "best" scenario.
// Fills: entry at the open of the entry bar (the plan's entryReference); the stop and the target are checked on the
// entry bar itself and on every later bar; a bar that touches both is a stop (stop first); otherwise flat at the close
// of the last bar of the entry session (the registered rule says "flat at the close"), never carried overnight.
export const COST_SCENARIOS = Object.freeze({
  midpoint: Object.freeze({ name: 'base', roundTripPct: 0.008, fill: 'entry bar open, stop first, flat at the session close' }),
  worst: Object.freeze({ name: 'stress', roundTripPct: 0.012, fill: 'entry bar open, stop first, flat at the session close' }),
});
export const DEFAULT_COST = Object.freeze({ referenceTradeUsd: 1000, roundTripPct: 0.008, stressRoundTripPct: 0.012, model: '0.8% of the trade per round trip (base), 1.2% (stress)' });

const NY_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const nyDate = (ms) => NY_DAY.format(new Date(ms));
const iso = (ms) => new Date(ms).toISOString();
const num = (x) => Number.isFinite(+x) ? +x : null;

/** One long paper trade from the plan's entry bar. Returns null when the inputs cannot give a fill. */
export function simulateLong({ symbol, signalAt, entryBar, futureBars, stop, target, maxBars, scenario = 'midpoint', tradeUsd, cost = DEFAULT_COST, metadata = null }) {
  const sc = COST_SCENARIOS[scenario]; if (!sc || !entryBar) return null;
  const entryPx = num(entryBar.o), stopPx = num(stop), targetPx = num(target);
  if (!(entryPx > 0) || !(stopPx > 0) || !(targetPx > entryPx) || !(stopPx < entryPx)) return null;
  const usd = num(tradeUsd) || num(cost && cost.referenceTradeUsd) || DEFAULT_COST.referenceTradeUsd;
  const day = nyDate(+entryBar.t), limit = Math.max(1, Math.min(+maxBars || 78, 1 + (futureBars || []).length));
  const path = [entryBar, ...(futureBars || [])].slice(0, limit);
  let exitPx = null, exitAt = null, exitReason = null, bars = 0;
  for (const b of path) {
    if (nyDate(+b.t) !== day) break;                    // flat at the close: never carried into the next session
    bars++;
    const l = num(b.l), h = num(b.h), c = num(b.c);
    if (l === null || h === null || c === null) return null;
    if (l <= stopPx) { exitPx = stopPx; exitAt = +b.t; exitReason = 'stop'; break; }   // stop first on a bar touching both
    if (h >= targetPx) { exitPx = targetPx; exitAt = +b.t; exitReason = 'target'; break; }
    exitPx = c; exitAt = +b.t; exitReason = 'session_close';
  }
  if (exitPx === null) return null;
  const grossPct = exitPx / entryPx - 1, costPct = sc.roundTripPct, netPct = grossPct - costPct;
  return {
    symbol, scenario, scenarioName: sc.name, signalAt: typeof signalAt === 'number' ? iso(signalAt) : String(signalAt),
    entryAt: iso(+entryBar.t), entryPx, exitAt: iso(exitAt), exitPx, exitReason, bars, day,
    stop: stopPx, target: targetPx, tradeUsd: usd,
    grossPct: +grossPct.toFixed(6), costPct, netPct: +netPct.toFixed(6), netUsd: +(netPct * usd).toFixed(2),
    metadata,
  };
}

const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +x.toFixed(4);

/** Scorecard of a list of trades (as simulateLong returns them). Per-trade net returns after costs; t over entry days. */
export function metrics(trades) {
  const T = (trades || []).filter(x => x && Number.isFinite(x.netPct));
  if (!T.length) return { n: 0, wins: 0, winRate: null, meanNet: null, medianNet: null, totalNetUsd: 0, profitFactor: null, best: null, worst: null, distinctDays: 0, distinctStocks: 0, dayT: null };
  const net = T.map(x => x.netPct), wins = net.filter(x => x > 0).length;
  const gp = net.filter(x => x > 0).reduce((a, b) => a + b, 0), gl = -net.filter(x => x < 0).reduce((a, b) => a + b, 0);
  const byDay = new Map(); for (const x of T) { const k = x.day || String(x.entryAt).slice(0, 10); (byDay.get(k) || byDay.set(k, []).get(k)).push(x.netPct); }
  const dayMeans = [...byDay.values()].map(mean), dm = mean(dayMeans);
  const sd = dayMeans.length > 1 ? Math.sqrt(dayMeans.reduce((a, v) => a + (v - dm) ** 2, 0) / (dayMeans.length - 1)) : null;
  const dayT = sd && sd > 0 ? dm / (sd / Math.sqrt(dayMeans.length)) : null;
  return {
    n: T.length, wins, winRate: r4(wins / T.length), meanNet: r4(mean(net)), medianNet: r4(median(net)),
    totalNetUsd: +T.reduce((a, x) => a + (x.netUsd || 0), 0).toFixed(2), profitFactor: gl > 0 ? r4(gp / gl) : (gp > 0 ? null : 0),
    best: r4(Math.max(...net)), worst: r4(Math.min(...net)),
    distinctDays: byDay.size, distinctStocks: new Set(T.map(x => x.symbol)).size, dayT: r4(dayT),
    exits: T.reduce((o, x) => { o[x.exitReason] = (o[x.exitReason] || 0) + 1; return o; }, {}),
  };
}
