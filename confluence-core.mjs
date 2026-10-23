// CONFLUENCE LAB CORE (24 Oct 2026; owner: "multiple real ways to make money before Monday's open"; this lab's angle: COMBINE the weak
// edges and measure them as a PORTFOLIO). Pure functions, no network, no files; confluence-lab.mjs does the reading and writing.
//
// PRE-REGISTERED 24 Oct 2026, BEFORE any run (library ids CONF-2 and CONF-3; the same text is written into data/strategy-library.json):
// INPUT RULES = every rule whose FROZEN first run (5 years, whole market incl. dead stocks) made money after the 1.2% stress cost AND beat
// the average stock in BOTH halves, read from the lab files on 24 Oct 2026, plus the near-misses the owner named (each listed with the gate
// it failed). Hold-lab rules (H-*: averaging down / get-even on stocks already held) are position management, not entry signals: not used.
// Winners-autopsy (WIN-*): all rejected. Families (a stock must be picked by 2+ DIFFERENT families; two momentum rules agreeing count once):
//   VALUE       B-FCF1 (cash-rich, growing, low debt; hold 63)        B-BASK1_3m (V15 F-score-uptrend top 10 monthly basket; hold 63)
//   MOMENTUM    ANOM-52WH (near the 52-week high; 126)  ANOM-RESMOM (residual momentum; 63)  DEC-FROG (frog in the pan; 126)
//               DEC2-MINTT (Minervini trend template; NEAR-MISS: newer-half edge < 0; hold for confluence = its block, 60)
//   EARNINGS    ANOM-SUESURGE (earnings AND revenue surprise; 60)
//   PULLBACK    DEC2-TPS (Connors TPS, RSI(2) dip above the 200-day; its own exit is RSI(2) > 70; hold for confluence = its block, 10)
//   SMART MONEY EXP-13F2 (2+ top 13F managers; NEAR-MISS: older half -0.3% after cost; 126)
//               EXP-INS1 (top-10% insider purchase; NEAR-MISS: newer-half edge < 0; 126)
//   EVENT       ANOM-SPIN (spin-offs; too few cases, positive in both halves; 126)
// SIGNAL of an input rule = one trade of its frozen 5-year trade list (stock, signal session: everything used is known at that close).
// CONF-2: at the close of session t a stock has signals from 2+ different families with signal sessions in [t-5, t], at least one of them
//         at t (it fires on the completing signal). Buy the next open (t+1). Hold = the SHORTEST hold among the input rules with a signal in
//         that window; stop = sell at the next open after a close 15% under the buy (35% when the hold is 126 sessions, a 6-month hold).
//         One open CONF trade per stock (signals while one is open are ignored).
// CONF-3: the same with 3+ different families.
// JUDGED ONCE at the system's tier-2 standard (value-core judge): halves = signal before / from 2024-01-01; > 0 after 0.8% and 1.2% cost;
// better than the average liquid stock over the same entry-to-exit sessions; better than the same stock on its other days; > 0 without the
// 2 best; block t >= 2.5 with blocks of 63 sessions (fixed in advance: most input holds are 63) -> TRADABLE SMALL; block t >= the proof bar
// -> PROVEN. First complete verdict frozen in data/confluence-lab.json firstRun (first-run.mjs freezeEach). The pair-by-pair split and
// the portfolio simulation are INFORMATION ONLY (no verdict, never in firstRun).
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', WINDOW = 5, BLOCK = 63, PAPER_START = '2026-10-23';   // paper: signals from the 23 Oct close (bought at Monday's open)
export const RULES = {
  'B-FCF1':        { family: 'VALUE',       hold: 63,  lab: 'value-lab',       why: 'positive after 1.2% cost and beat the average stock in both halves' },
  'B-BASK1_3m':    { family: 'VALUE',       hold: 63,  lab: 'value-lab',       why: 'positive after 1.2% cost and beat the average stock in both halves (basket of 10 V15 names a month)' },
  'ANOM-52WH':     { family: 'MOMENTUM',    hold: 126, lab: 'anomaly-lab',     why: 'positive after 1.2% cost and beat the average stock in both halves' },
  'ANOM-RESMOM':   { family: 'MOMENTUM',    hold: 63,  lab: 'anomaly-lab',     why: 'positive after 1.2% cost and beat the average stock in both halves' },
  'DEC-FROG':      { family: 'MOMENTUM',    hold: 126, lab: 'decoded-history', why: 'positive after 1.2% cost and beat the average stock in both halves' },
  'DEC2-MINTT':    { family: 'MOMENTUM',    hold: 60,  lab: 'decoded-history', why: 'NEAR-MISS named by the owner: newer half +0.01% after 1.2% cost, edge vs the average stock -3.0%', nearMiss: true },
  'ANOM-SUESURGE': { family: 'EARNINGS',    hold: 60,  lab: 'anomaly-lab',     why: 'positive after 1.2% cost and beat the average stock in both halves' },
  'DEC2-TPS':      { family: 'PULLBACK',    hold: 10,  lab: 'decoded-history', why: 'PROVEN at its own standard (per dollar invested); hold for confluence = its 10-session block' },
  'EXP-13F2':      { family: 'SMART MONEY', hold: 126, lab: 'expert-lab',      why: 'NEAR-MISS named by the owner: older half -0.7% after 1.2% cost (edge +2.9%)', nearMiss: true },
  'EXP-INS1':      { family: 'SMART MONEY', hold: 126, lab: 'expert-lab',      why: 'NEAR-MISS named by the owner (insider quality): newer-half edge vs the average stock -2.5%', nearMiss: true },
  'ANOM-SPIN':     { family: 'EVENT',       hold: 126, lab: 'anomaly-lab',     why: 'positive in both halves but TOO FEW CASES (21 / 17); named by the owner' },
};
export const VERSIONS = {
  'CONF-2': { minFam: 2, name: 'Confluence: a stock picked by 2+ different rule families within 5 sessions' },
  'CONF-3': { minFam: 3, name: 'Confluence: a stock picked by 3+ different rule families within 5 sessions' },
};
// the current TRY SMALL lane (scan.mjs tryQualifies on 24 Oct 2026) with the lane's own hold and stop, for the portfolio simulation
export const TRY_SMALL = { 'B-FCF1': 63, 'DEC-FROG': 126, 'ANOM-52WH': 126, 'ANOM-RESMOM': 63, 'ANOM-SUESURGE': 60 };
export const stopFor = (hold) => hold >= 100 ? 0.35 : 0.15;
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const r2 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(2);

// ---- CONFLUENCE MATCHING ----
// inputs: [{ rule, sym, t }] (t = signal session index). Returns the candidate fires [{ sym, t, fams: [...], rules: [...], hold, stop }]:
// every session t at which some input of the stock lands and the stock has signals from >= minFam distinct families in [t-window, t].
// Several inputs of one stock on one session give one candidate. One-open-per-stock is applied later (oneOpen), on the walked exits.
export function confluence(inputs, { minFam, window = WINDOW, rules = RULES } = {}) {
  const bySym = new Map(); for (const z of inputs) { if (!rules[z.rule] || !(z.t >= 0)) continue; (bySym.get(z.sym) || bySym.set(z.sym, []).get(z.sym)).push(z); }
  const out = [];
  for (const [sym, a] of bySym) { a.sort((p, q) => p.t - q.t); const ts = [...new Set(a.map(z => z.t))];
    for (const t of ts) { const win = a.filter(z => z.t >= t - window && z.t <= t), fams = [...new Set(win.map(z => rules[z.rule].family))];
      if (fams.length < minFam) continue; const rs = [...new Set(win.map(z => z.rule))].sort(), hold = Math.min(...rs.map(r => rules[r].hold));
      out.push({ sym, t, fams: fams.sort(), rules: rs, hold, stop: stopFor(hold) }); } }
  return out.sort((p, q) => p.t - q.t || (p.sym < q.sym ? -1 : 1));
}
// one open trade per stock: keep a candidate only if it starts after the previous kept trade of the stock has exited.
// exitOf(c) -> exit session index of the trade (null = cannot be walked: skipped, does not block)
export function oneOpen(cands, exitOf) { const busy = new Map(), out = [];
  for (const c of cands) { if ((busy.get(c.sym) ?? -1) >= c.t + 1) continue; const x = exitOf(c); if (x === null || x === undefined) continue; busy.set(c.sym, x); out.push({ ...c, x }); }
  return out; }

// ---- THE WALK of one trade on daily bars ----
// O = opens, C = closes (NaN / 0 = no bar; the caller merges the stock's main and thin-trading rows), k = buy session (its open),
// hold = sessions held (sold at the close of k + hold - 1), stop = fraction: a close under buy x (1 - stop) sells at the next session's
// open (if that session has no open: its close; if the stock has no later bar at all: that close). Gaps: the last known close is used.
// Returns { x, px, atOpen, g, kind } or null (no buy-day open) or { open: true } (the hold has not ended at the last session).
export function walk(O, C, k, hold, stop) {
  const e = O[k], T = C.length; if (!(e > 0)) return null; const last = k + hold - 1;
  for (let q = k; q <= Math.min(last, T - 1); q++) { const c = C[q]; if (!(c > 0 && c < e * (1 - stop))) continue;
    if (q === last) return { x: q, px: c, atOpen: false, g: c / e - 1, kind: 'stop' };
    for (let u = q + 1; u < T && u <= q + 10; u++) { if (O[u] > 0) return { x: u, px: O[u], atOpen: true, g: O[u] / e - 1, kind: 'stop' }; if (C[u] > 0) return { x: u, px: C[u], atOpen: false, g: C[u] / e - 1, kind: 'stop' }; }
    if (q + 1 >= T) return { open: true, stopHit: q }; return { x: q, px: c, atOpen: false, g: c / e - 1, kind: 'stop' }; }
  if (last >= T) return { open: true };
  for (let q = last; q >= k; q--) { const c = C[q]; if (c > 0) return { x: last, px: c, atOpen: false, g: c / e - 1, kind: 'time' }; }
  return null;
}

// ---- COST MATH (portfolio) ----
// one trade of `size` USD: net USD = size x (gross return - cost) - fee on the buy - fee on the sell
export const tradeUsd = (size, g, { cost = COST, fee = 3 } = {}) => size * (g - cost) - 2 * fee;

// ---- PORTFOLIO SIMULATION (information only) ----
// cands: [{ id, sym, k (buy session), liq (traded value, for priority), hold, stop, rule }], series(sym) -> { O, C } (arrays of length T),
// bench: { O, C } of a fund (or null). At each open: stop sales due at that open are done first (their slot frees), then buys due that
// open are taken by liquidity (highest first), skipping a stock already held, up to `slots` open positions. Time sales happen at the close
// and free the slot from the next open. Each buy: `size` USD (fractional shares), fee on buy and sell, cost on the gross return (half at
// the buy, half at the sale for the daily marks). The same dollars in the fund on the same buy and sale sessions are the mirror (fund
// cost fundCost). Returns the trades taken and the daily equity (realized + open marks) of the strategy and of the mirror.
export function simulate({ T, cands, series, slots, size, fee = 3, cost = COST, bench = null, fundCost = 0.001 }) {
  const byK = new Map(); for (const c of cands) (byK.get(c.k) || byK.set(c.k, []).get(c.k)).push(c);
  const open = [], trades = [], eq = new Float64Array(T), meq = new Float64Array(T); let real = 0, mreal = 0, skipped = 0;
  const bO = bench ? bench.O : null, bC = bench ? bench.C : null;
  const close = (p, q) => { const net = tradeUsd(size, p.w.g, { cost, fee }); real += net + size * cost / 2 + fee; // entry part was charged at the buy
    let mnet = null; if (p.me > 0) { const mx = p.w.atOpen ? bO[q] : bC[q], mpx = mx > 0 ? mx : lastBench(q); mnet = mpx > 0 ? tradeUsd(size, mpx / p.me - 1, { cost: fundCost, fee }) : null; if (mnet !== null) mreal += mnet + size * fundCost / 2 + fee; }
    trades.push({ id: p.c.id, sym: p.c.sym, rule: p.c.rule, k: p.c.k, x: q, g: p.w.g, kind: p.w.kind, usd: net, fundUsd: mnet }); };
  const lastBench = (q) => { for (let u = q; u >= 0; u--) if (bC && bC[u] > 0) return bC[u]; return null; };
  for (let q = 0; q < T; q++) {
    for (let j = open.length - 1; j >= 0; j--) { const p = open[j]; if (p.w.x === q && p.w.atOpen) { close(p, q); open.splice(j, 1); } }
    const today = (byK.get(q) || []).slice().sort((a, b) => (b.liq || 0) - (a.liq || 0) || (a.sym < b.sym ? -1 : 1));
    for (const c of today) { if (open.some(p => p.c.sym === c.sym)) continue; if (open.length >= slots) { skipped++; continue; } const s = series(c.sym); if (!s) continue;
      let w = walk(s.O, s.C, c.k, c.hold, c.stop); if (!w) continue; if (w.open) w = { x: Infinity, atOpen: false, g: null, kind: 'open' };   // still running at the last session: marked, never sold
      real -= fee + size * cost / 2; const me = bO && bO[q] > 0 ? bO[q] : null; if (me) mreal -= fee + size * fundCost / 2; open.push({ c, w, e: s.O[c.k], s, me }); }
    for (let j = open.length - 1; j >= 0; j--) { const p = open[j]; if (p.w.x === q && !p.w.atOpen) { close(p, q); open.splice(j, 1); } }
    let mark = 0, mmark = 0; for (const p of open) { let c = NaN; for (let u = q; u >= p.c.k; u--) if (p.s.C[u] > 0) { c = p.s.C[u]; break; } mark += isFinite(c) ? size * (c / p.e - 1) : 0;
      if (p.me) { const b = lastBench(q); if (b > 0) mmark += size * (b / p.me - 1); } }
    eq[q] = real + mark; meq[q] = mreal + mmark; }
  return { trades, eq, meq, skipped, stillOpen: open.length };
}
// summary of a daily equity curve (USD) between sessions a..b (inclusive) on dates D: profit, months, drawdown
export function curveStats(eq, D, a, b, capital) {
  if (b < a) return null; const base = a > 0 ? eq[a - 1] : 0, months = []; let prev = base, peak = base, dd = 0;
  for (let q = a; q <= b; q++) { peak = Math.max(peak, eq[q]); dd = Math.min(dd, eq[q] - peak); if (q === b || D[q + 1].slice(0, 7) !== D[q].slice(0, 7)) { months.push({ m: D[q].slice(0, 7), usd: eq[q] - prev }); prev = eq[q]; } }
  const v = months.map(m => m.usd).sort((x, y) => x - y), med = v.length ? (v.length % 2 ? v[v.length >> 1] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : null;
  let run = 0, worstRun = 0; for (const m of months) { run = m.usd < 0 ? run + 1 : 0; worstRun = Math.max(worstRun, run); }
  const profit = eq[b] - base;
  return { profit: r2(profit), returnOnCapital: r4(profit / capital), months: months.length, perMonthAvg: r2(profit / (months.length || 1)), perMonthMedian: r2(med), worstMonth: r2(v[0]), bestMonth: r2(v[v.length - 1]),
    monthsPositive: r4(months.filter(m => m.usd > 0).length / (months.length || 1)), maxDrawdown: r2(dd), maxDrawdownPct: r4(dd / capital), worstLosingMonthsInARow: worstRun };
}
// longest run of losing trades (by sale session) and its USD
export function losingStreak(trades) { const a = [...trades].sort((p, q) => p.x - q.x || p.k - q.k); let n = 0, usd = 0, best = { n: 0, usd: 0 };
  for (const z of a) { if (z.usd < 0) { n++; usd += z.usd; if (n > best.n || (n === best.n && usd < best.usd)) best = { n, usd: r2(usd) }; } else { n = 0; usd = 0; } } return best; }

// ---- library pre-registration (idempotent; written before any run) ----
export function preRegister(LB, date = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  const list = Object.entries(RULES).map(([id, r]) => id + ' (' + r.family + ', hold ' + r.hold + (r.nearMiss ? ', near-miss' : '') + ')').join('; ');
  for (const [id, v] of Object.entries(VERSIONS)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Confluence (combined rules)', name: v.name,
      explain: 'At the close of session t a stock has signals from ' + v.minFam + '+ DIFFERENT rule families with signal sessions in [t-5, t], one of them at t. Buy the next open; hold = the shortest hold of the input rules in the window; stop: next open after a close 15% under the buy (35% for a 126-session hold); one open trade per stock. Input rules (frozen 5-year trade lists): ' + list + '. Families: VALUE, MOMENTUM, EARNINGS, PULLBACK, SMART MONEY, EVENT (two rules of one family agreeing count once).',
      status: 'pre-registered ' + date + ' (confluence lab); 5-year one-shot pending', agent: 'confluence',
      note: 'Pre-registered ' + date + ' BEFORE any run (confluence-core.mjs header = the exact rule; versions CONF-2 and CONF-3 only). Judged once at the tier-2 standard (both halves before / from 2024-01-01, 0.8% and 1.2% cost, vs the average stock, vs the same stock on other days, without the 2 best, block t with 63-session blocks); first complete verdict frozen in data/confluence-lab.json; forward paper lane (data/confluence-paper.jsonl) from 26 Oct 2026. Input selection: frozen first run > 0 after 1.2% cost AND edge > 0 in both halves, plus the near-misses the owner named (EXP-13F2, EXP-INS1, DEC2-MINTT, ANOM-SPIN).' }); ch++; }
  if (ch) LB.updated = date; return ch; }
