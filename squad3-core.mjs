// SQUAD 3 (MONEY MANAGEMENT) CORE (24 Oct 2026; 4-squad competition). Pure functions, no network, no files; squad3-lab.mjs reads and writes.
// Idea: professionals make money less from entries than from HOW MUCH they put in, when they add and how fast they cut. Until now the
// system judged rules one trade at a time with fixed 1,000 USD tickets. This lab runs the rules that already made money in both halves
// through a REALISTIC ACCOUNT (10,000 / 25,000 / 50,000 USD, cash, 3 USD per buy and per sale + 0.8% cost) under different
// money-management POLICIES and compares each with the same rules on plain 1,000 USD tickets and with SPUS (halal S&P fund).
//
// PRE-REGISTERED 24 Oct 2026, BEFORE any run (library ids SQ3-*; the same text is written into data/strategy-library.json):
// INPUT SIGNALS = each rule's frozen 5-year trade list (stock, signal session): B-FCF1 (63), B-BASK1_3m (the V15 / LONGER HOLDS monthly
//   top-10 basket, each name a signal, 63), DEC-FROG (126), ANOM-52WH (126), ANOM-RESMOM (63), ANOM-SUESURGE (60), MACRO-GOLD-S20 (20),
//   MACRO-USD-E60 (60). Rule exit = its own hold (sold at the close of the last session) and stop (sell at the next open after a close
//   15% under the buy, 35% for 126-session holds), exactly as the TRY SMALL lane and the confluence portfolio simulation.
//   Stocks on the owner's ZAD not-halal list are left out; halal-UNKNOWN stocks are included and counted (flagged) in every result.
// ACCOUNT: cash only, no margin, fractional shares. Buy at the next open after the signal, size by the policy; when the cash does not
//   cover size + 0.4% + 3 USD, buy what the cash covers if that is at least HALF the size, else skip (cash is never negative). Several signals at one open: pyramid adds first, then new signals by
//   20-session average traded value (most liquid first). One position per stock (a new signal of a held stock is ignored). Sales at an
//   open are done before buys (their cash is available to the buys). Cost: 0.4% of the money on each buy and each sale (0.8% round
//   trip; stress 0.6% + 0.6%) + 3 USD per buy (each add is a buy) and per sale. Open positions are marked at the last close (no sale
//   cost); a stock with no bars keeps its last close; a pending sale with no bar for 10 sessions is done at the last close.
// WINDOWS: older half = buys from 2021-10-12 to 2023-12-29; newer half = buys from 2024-01-02 to the last session whose signals are
//   complete in every list (the labs keep only trades that ENDED inside their window, so the last 126 sessions are under-filled):
//   END = session T-1-126. Each half is a SEPARATE account that starts in cash with the full capital; open positions are marked at the
//   half's last close. The run to the last day (T-1) is information only.
// YARDSTICKS: (1) PLAIN = the same signals, 1,000 USD per signal, the rules' own exits, same account and cash limits; (2) SPUS = the
//   whole capital in SPUS at the first open of the window (3 USD + 0.05%), held.
// POLICIES (exact parameters in POLICIES below; each changes ONE thing vs PLAIN unless it says COMBO):
//   SQ3-VOLRISK  volatility-targeted size: size = 1% of equity / (3 x 20-session stdev of daily returns), at most 20% of equity, skip
//                under 250 USD (the same risk per trade instead of the same dollars).
//   SQ3-PYRAMID  add 50% of the first buy ONCE at the next open after a close >= +10% over the buy AND above its 20-session average.
//   SQ3-CUTRUN   cut losers fast: sell at the next open after a close 8% under the buy (replaces the rule's stop); let winners run: when
//                the rule's hold ends with the close above the buy AND above its 50-session average, keep it and sell at the next
//                open after a close under the 50-session average (or at the close of session 252 after the buy).
//   SQ3-REGIME   market-regime exposure: new tickets x1 when SPY closes above its 200-session average AND breadth (share of liquid
//                stocks above their own 200-session average) > 50%; x0.5 otherwise; no new buys in a crash (SPY 15%+ under its
//                252-session high close). Positions already held are not touched. SPY history before the window is used for its
//                averages; while breadth is unknown (first 200 sessions of stock data) the SPY test alone decides.
//   SQ3-ROTATE   rank-and-rotate: every 5th session (close) rank the LIVE signals (a signal is live from its signal session for its
//                rule's hold) by their 126-session return; hold the top 10 at equity/10 each; sell a holding when it is no longer
//                live or ranks below 20; stop 15% (next open), and a stopped stock is not bought again for 21 sessions.
//   SQ3-FAMEQ    equal risk across rule families: 4 family sleeves (VALUE, MOMENTUM, EARNINGS, MACRO), each at most 25% of equity in
//                open positions, positions of equity/12 (3 per family); an empty sleeve's money stays in cash.
//   SQ3-SECTOR   1,000 USD tickets; a buy is skipped when its sector (SIC major group, 2 digits; funds their own group) would
//                exceed 25% of equity at market value.
//   SQ3-DDBRAKE  drawdown brake: tickets halve (500 USD) while equity is 10%+ under its running peak, full again once within 5%.
//   SQ3-SLOT10   compounding slots: each new position = 10% of equity (at the last close). "% of equity" everywhere = the cash the
//                buy uses, cost and fee included, so N positions of 1/N fit exactly.
//   SQ3-SLOT5    concentrated compounding slots: each new position = 20% of equity.
//   SQ3-COMBO    SLOT10 sizing x REGIME multiplier x DDBRAKE factor, CUTRUN exits, SECTOR 25% cap (one combined policy).
// GATES (a policy PASSES at a capital only if ALL hold in BOTH halves; a policy PASSES only if it passes at all three capitals):
//   1. profit > PLAIN profit (same rules, plain 1,000 USD tickets, same account);   2. profit > SPUS held with the same capital;
//   3. max drawdown (% of peak equity) no worse than SPUS's by more than 5 points;  4. profit minus its 2 best trades > PLAIN profit.
// Reported: 5-year USD profit, USD per month (median, worst, average), max drawdown, % positive months, trades, halal mix, invested
// share. First complete verdicts frozen in data/squad3-lab.json firstRun (first-run.mjs freezeEach); never re-run to pass.
// A policy is NOT a buy signal: data/squad3-today.json carries methods = {}.
export const MIN_FILL = 0.5, COST = 0.008, STRESS = 0.012, FEE = 3, SPLIT = '2024-01-01', START = '2021-10-12', TAIL = 126, CAPITALS = [10000, 25000, 50000], PRIMARY = 10000;
export const RULES = {
  'B-FCF1':         { family: 'VALUE',    hold: 63,  lab: 'value-lab' },
  'B-BASK1_3m':     { family: 'VALUE',    hold: 63,  lab: 'value-lab', note: 'V15 / LONGER HOLDS: the monthly top-10 F-score-uptrend basket, each name one signal' },
  'DEC-FROG':       { family: 'MOMENTUM', hold: 126, lab: 'decoded-history' },
  'ANOM-52WH':      { family: 'MOMENTUM', hold: 126, lab: 'anomaly-lab' },
  'ANOM-RESMOM':    { family: 'MOMENTUM', hold: 63,  lab: 'anomaly-lab' },
  'ANOM-SUESURGE':  { family: 'EARNINGS', hold: 60,  lab: 'anomaly-lab' },
  'MACRO-GOLD-S20': { family: 'MACRO',    hold: 20,  lab: 'macro-lab' },
  'MACRO-USD-E60':  { family: 'MACRO',    hold: 60,  lab: 'macro-lab' },
};
export const stopFor = (hold) => hold >= 100 ? 0.35 : 0.15;
const FIXED = { kind: 'fixed', usd: 1000 };
const REGIME = { spySma: 200, breadthMin: 0.5, crashDd: 0.15, crashLookback: 252, full: 1, weak: 0.5, crash: 0 };
const CUT = { cut: 0.08, trailSma: 50, maxSessions: 252 };
export const PLAIN = { id: 'PLAIN', name: 'Plain 1,000 USD tickets (the yardstick)', size: FIXED };
export const POLICIES = {
  'SQ3-VOLRISK': { name: 'Volatility-targeted size (same risk per trade)', size: { kind: 'vol', riskPct: 0.01, sigmaMult: 3, sigmaLookback: 20, capPct: 0.20, minUsd: 250 } },
  'SQ3-PYRAMID': { name: 'Pyramid: add 50% once at +10% above the 20-day', size: FIXED, pyramid: { trigger: 0.10, sma: 20, addFrac: 0.5, maxAdds: 1 } },
  'SQ3-CUTRUN':  { name: 'Cut losers at -8%, let winners run on a 50-day trail', size: FIXED, exit: CUT },
  'SQ3-REGIME':  { name: 'Market-regime exposure (SPY 200-day + breadth; none in a crash)', size: FIXED, regime: REGIME },
  'SQ3-ROTATE':  { name: 'Rank-and-rotate: hold the top 10 live signals by 6-month strength', size: { kind: 'equity', frac: 0.10 }, rotate: { n: 10, keepRank: 20, every: 5, lookback: 126, stop: 0.15, cooldown: 21 } },
  'SQ3-FAMEQ':   { name: 'Equal risk across rule families (4 sleeves x 25%)', size: { kind: 'equity', frac: 1 / 12 }, familyCap: 0.25 },
  'SQ3-SECTOR':  { name: 'At most 25% of equity per sector', size: FIXED, sectorCap: 0.25 },
  'SQ3-DDBRAKE': { name: 'Drawdown brake: half size after a 10% equity drop', size: FIXED, brake: { dd: 0.10, factor: 0.5, resume: 0.05 } },
  'SQ3-SLOT10':  { name: 'Compounding slots: 10% of equity per position', size: { kind: 'equity', frac: 0.10 } },
  'SQ3-SLOT5':   { name: 'Concentrated compounding slots: 20% of equity per position', size: { kind: 'equity', frac: 0.20 } },
  'SQ3-COMBO':   { name: 'Combo: 10% slots x regime x brake, cut -8% / 50-day trail, 25% sector cap', size: { kind: 'equity', frac: 0.10 }, regime: REGIME, brake: { dd: 0.10, factor: 0.5, resume: 0.05 }, exit: CUT, sectorCap: 0.25 },
};
const r2 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(2);
const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export { r2, r4 };
const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;

// ---- INDICATORS on one stock's close series (gaps carry the last close; NaN until enough history) ----
export function indicators(C) {
  const T = C.length, f = new Float64Array(T); let last = NaN;
  for (let t = 0; t < T; t++) { if (C[t] > 0) last = C[t]; f[t] = last; }
  const sma = (n) => { const o = new Float64Array(T).fill(NaN); let s = 0, k = 0;
    for (let t = 0; t < T; t++) { const v = f[t]; if (v > 0) { s += v; k++; } if (t >= n) { const w = f[t - n]; if (w > 0) { s -= w; k--; } } if (t >= n - 1 && k === n) o[t] = s / n; } return o; };
  const sig = (n) => { const o = new Float64Array(T).fill(NaN);
    for (let t = n; t < T; t++) { let s = 0, s2 = 0, k = 0; for (let u = t - n + 1; u <= t; u++) { if (f[u] > 0 && f[u - 1] > 0) { const r = f[u] / f[u - 1] - 1; s += r; s2 += r * r; k++; } }
      if (k >= n * 0.75) { const m = s / k; o[t] = Math.sqrt(Math.max(0, s2 / k - m * m)); } } return o; };
  return { f, sma20: sma(20), sma50: sma(50), sig20: sig(20), sma200: null };
}
// ---- MARKET REGIME at the close of session q (known at that close): 'full' | 'weak' | 'crash' ----
// spyC: SPY closes, which may START EARLIER than the window: spyC[q + off] is session q (off = sessions of SPY history before the
// first session, so the 200-day and the 252-day high exist from day one); breadth[q]: share of liquid stocks above their own 200-session
// average. Breadth unknown (the first 200 sessions of the stock data) -> the SPY test alone decides.
export function regimeAt(q, { spyC, breadth, off = 0 }, p = REGIME) {
  const Q = q + off; let hi = 0; for (let u = Math.max(0, Q - p.crashLookback + 1); u <= Q; u++) if (spyC[u] > hi) hi = spyC[u];
  let c = NaN; for (let u = Q; u >= 0 && u >= Q - 10; u--) if (spyC[u] > 0) { c = spyC[u]; break; }
  if (!(c > 0)) return 'weak';
  if (hi > 0 && c <= hi * (1 - p.crashDd)) return 'crash';
  let s = 0, k = 0; for (let u = Q - p.spySma + 1; u <= Q; u++) if (u >= 0 && spyC[u] > 0) { s += spyC[u]; k++; }
  const above = k >= p.spySma * 0.9 && c > s / k, b = breadth ? breadth[q] : NaN;
  return above && (!isFinite(b) || b > p.breadthMin) ? 'full' : 'weak';
}
export const regimeMult = (state, p = REGIME) => state === 'full' ? p.full : state === 'crash' ? p.crash : p.weak;

// ---- SIZING (USD of one new position, before the cash check). eq = equity at the last close. ----
// 'equity' = the CASH the buy uses (costs and fee included), so N positions of 1/N fit exactly.
export function sizeFor(sz, { eq, sigma, cost = COST, fee = FEE }) {
  if (sz.kind === 'fixed') return sz.usd;
  if (sz.kind === 'equity') return netOf(eq * sz.frac, cost, fee);
  if (sz.kind === 'vol') { if (!(sigma > 0)) return 0; const usd = Math.min(eq * sz.riskPct / (sz.sigmaMult * sigma), eq * sz.capPct); return usd >= sz.minUsd ? usd : 0; }
  throw new Error('unknown size kind ' + sz.kind);
}
// cost of buying `usd` worth: usd + half the round-trip cost + fee; proceeds of selling `value`: value - half cost - fee
export const buyCash = (usd, cost = COST, fee = FEE) => usd * (1 + cost / 2) + fee;
export const netOf = (cashOut, cost = COST, fee = FEE) => Math.max(0, (cashOut - fee) / (1 + cost / 2));   // the stock bought for a given cash outlay
export const sellCash = (value, cost = COST, fee = FEE) => value * (1 - cost / 2) - fee;

// ---- THE ACCOUNT ----
// D: dates; a..b: the window (buys only at opens a..b; everything marked at the close of b); cands: [{ sym, rule, t, k (=t+1), hold,
// stop, liq, family, sector, halal }]; series(sym) -> { O, C } (length T, NaN = no bar); ind(sym) -> indicators(C) (memoised by the
// caller); ctx: { spyC, breadth } (only for regime policies). Returns the daily equity (a..b), the trades (closed + open marked) and counts.
export function runAccount({ D, a, b, cands, series, ind, ctx = {}, capital, policy, cost = COST, fee = FEE }) {
  const T = D.length; ind = ind || ((s) => { const z = series(s); return z ? indicators(z.C) : null; });
  const P = policy, rot = P.rotate || null, ex = P.exit || null, pyr = P.pyramid || null;
  let cash = capital, peak = capital, braking = false, partial = 0, nBuys = 0, nSales = 0, skippedCash = 0, skippedCap = 0, investedSum = 0, days = 0;
  const pos = new Map(), trades = [], eq = new Float64Array(T).fill(NaN), regimeDays = { full: 0, weak: 0, crash: 0 };
  const byK = new Map(); if (!rot) for (const c of cands) if (c.k >= a && c.k <= b) (byK.get(c.k) || byK.set(c.k, []).get(c.k)).push(c);
  let lastEq = capital, regime = 'full', pendingRot = [];
  const cooldown = new Map();
  const live = rot ? liveIndex(cands) : null;
  if (P.regime && a > 0) regime = regimeAt(a - 1, ctx, P.regime);   // the state known at the close before the first open
  const value = (p) => p.shares * p.last;
  const exposure = (key, val) => { let s = 0; for (const p of pos.values()) if (p[key] === val) s += value(p); return s; };
  const close = (p, q, px, why) => { const v = p.shares * px; cash += sellCash(v, cost, fee); p.got += sellCash(v, cost, fee); nSales++; pos.delete(p.sym);
    trades.push({ sym: p.sym, rule: p.rule, family: p.family, halal: p.halal, k: p.k, x: q, why, usd: p.got - p.paid, paid: p.paid, adds: p.adds, ret: p.got / p.paid - 1 }); };
  const buy = (c, q, usd, isAdd) => { const s = series(c.sym), o = s ? s.O[q] : NaN; if (!(o > 0) || !(usd > 0)) return false;
    let need = buyCash(usd, cost, fee);
    if (cash + 1e-9 < need) { const avail = netOf(cash, cost, fee); if (avail < usd * MIN_FILL) { skippedCash++; return false; } usd = avail; need = buyCash(usd, cost, fee); partial++; }
    cash -= need; nBuys++;
    if (isAdd) { const p = pos.get(c.sym); p.shares += usd / o; p.paid += need; p.adds++; p.last = o; return true; }
    pos.set(c.sym, { sym: c.sym, rule: c.rule, family: c.family, sector: c.sector, halal: c.halal, k: q, e: o, first: usd, shares: usd / o, paid: need, got: 0, adds: 0, last: o,
      holdEnd: rot ? Infinity : q + c.hold - 1, stopPx: o * (1 - (rot ? rot.stop : ex ? ex.cut : c.stop)), trailing: false, sellAt: null, addAt: null, pendSince: null });
    return true; };
  for (let q = a; q <= b; q++) {
    // ---- OPEN: pending sales first ----
    for (const p of [...pos.values()]) { if (p.sellAt === null || p.sellAt > q) continue; const s = series(p.sym), o = s.O[q], c = s.C[q];
      if (o > 0) close(p, q, o, p.sellWhy); else if (c > 0) close(p, q, c, p.sellWhy); else if (q - p.sellAt >= 10) close(p, q, p.last, p.sellWhy); }
    // pyramid adds (decided at the last close), then new signals by liquidity
    const sizeMult = (P.regime ? regimeMult(regime, P.regime) : 1) * (P.brake && braking ? P.brake.factor : 1);
    if (pyr) for (const p of [...pos.values()]) { if (p.addAt !== q) continue; p.addAt = null; buy(p, q, p.first * pyr.addFrac, true); }
    const todays = rot ? pendingRot.splice(0) : (byK.get(q) || []).slice().sort((x, y) => (y.liq || 0) - (x.liq || 0) || (x.sym < y.sym ? -1 : 1));
    for (const c of todays) { if (pos.has(c.sym)) continue;
      let usd = rot ? c.usd : sizeFor(P.size, { eq: lastEq, sigma: P.size.kind === 'vol' ? (ind(c.sym) || {}).sig20?.[q - 1] : null, cost, fee }) * sizeMult; if (!(usd > 0)) continue;
      if (P.sectorCap && exposure('sector', c.sector) + usd > P.sectorCap * lastEq) { skippedCap++; continue; }
      if (P.familyCap && exposure('family', c.family) + usd > P.familyCap * lastEq + 1e-6) { skippedCap++; continue; }
      buy(c, q, usd, false); }
    // ---- CLOSE ----
    for (const p of [...pos.values()]) { const s = series(p.sym), c = s.C[q]; if (c > 0) p.last = c; const I = (ex || pyr) ? ind(p.sym) : null;
      if (p.sellAt !== null) continue;
      if (!rot && !p.trailing && q === p.holdEnd) {
        if (ex && p.last > p.e && I && p.last > I.sma50[q]) { p.trailing = true; }
        else { close(p, q, p.last, 'time'); continue; } }
      if (p.trailing) { if (q - p.k + 1 >= ex.maxSessions) { close(p, q, p.last, 'max'); continue; }
        if (c > 0 && I && c < I.sma50[q]) { p.sellAt = q + 1; p.sellWhy = 'trail'; continue; } }
      if (c > 0 && c < p.stopPx) { p.sellAt = q + 1; p.sellWhy = 'stop'; if (rot) cooldown.set(p.sym, q + rot.cooldown); continue; }
      if (pyr && p.adds < pyr.maxAdds && c > 0 && c >= p.e * (1 + pyr.trigger) - 1e-9 && I && c > I.sma20[q]) p.addAt = q + 1; }
    let mv = 0; for (const p of pos.values()) mv += value(p);
    const e = cash + mv; eq[q] = e; lastEq = e; investedSum += e > 0 ? mv / e : 0; days++;
    if (P.brake) { peak = Math.max(peak, e); if (!braking && e <= peak * (1 - P.brake.dd)) braking = true; else if (braking && e >= peak * (1 - P.brake.resume)) braking = false; }
    if (P.regime) { regime = regimeAt(q, ctx, P.regime); regimeDays[regime]++; }
    // rank-and-rotate at every `every`-th close: orders for the next open
    if (rot && (q - a) % rot.every === 0 && q < b) {
      const L = [...(live.at(q) || [])].filter(sym => !(cooldown.get(sym) > q)), str = (sym) => { const I = ind(sym); if (!I) return -Infinity; const x = I.f[q], y = q - rot.lookback >= 0 ? I.f[q - rot.lookback] : NaN; return x > 0 && y > 0 ? x / y - 1 : -Infinity; };
      const ranked = L.map(sym => [sym, str(sym)]).filter(z => z[1] > -Infinity).sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)), rank = new Map(ranked.map((z, i) => [z[0], i + 1]));
      let keep = 0; for (const p of pos.values()) { if (p.sellAt !== null) continue; const r = rank.get(p.sym); if (!r || r > rot.keepRank) { p.sellAt = q + 1; p.sellWhy = r ? 'rank' : 'not live'; } else keep++; }
      const meta = live.meta;
      for (const [sym] of ranked.slice(0, rot.n)) { if (keep >= rot.n) break; if (pos.has(sym)) continue; const m = meta.get(sym); pendingRot.push({ ...m, sym, usd: netOf(e / rot.n, cost, fee) }); keep++; } } }
  // marks at the close of b
  for (const p of pos.values()) trades.push({ sym: p.sym, rule: p.rule, family: p.family, halal: p.halal, k: p.k, x: null, why: 'open', usd: p.shares * p.last - p.paid, paid: p.paid, adds: p.adds, ret: p.shares * p.last / p.paid - 1 });
  return { eq, trades, cash, nBuys, nSales, partial, skippedCash, skippedCap, avgInvested: days ? investedSum / days : 0, regimeDays: P.regime ? regimeDays : null, openAtEnd: pos.size };
}
// live windows for rank-and-rotate: a signal at t with hold h makes the stock live at sessions t..t+h-1 (at the close)
export function liveIndex(cands) { const by = new Map(), meta = new Map();
  for (const c of cands) { for (let u = c.t; u <= c.t + c.hold - 1; u++) (by.get(u) || by.set(u, new Set()).get(u)).add(c.sym); if (!meta.has(c.sym)) meta.set(c.sym, { rule: c.rule, family: c.family, sector: c.sector, halal: c.halal, liq: c.liq }); }
  return { at: (u) => by.get(u), meta }; }

// ---- FUND HELD: the whole capital at the first open of the window (3 USD + 0.05%), marked at each close ----
export function holdFund({ O, C }, a, b, capital, { fee = FEE, cost = 0.001 } = {}) { const T = C.length, eq = new Float64Array(T).fill(NaN); let q0 = -1;
  for (let q = a; q <= b; q++) if (O[q] > 0) { q0 = q; break; } if (q0 < 0) return null;
  const sh = (capital - fee - capital * cost / 2) / O[q0]; let lc = O[q0];
  for (let q = a; q <= b; q++) { if (q >= q0 && C[q] > 0) lc = C[q]; eq[q] = q < q0 ? capital : sh * lc; } return eq; }

// ---- STATS of an equity curve a..b that started at `capital` ----
export function curve(eq, D, a, b, capital) {
  const months = []; let prev = capital, peak = capital, dd = 0, ddUsd = 0;
  for (let q = a; q <= b; q++) { const e = eq[q]; if (!isFinite(e)) continue; if (e > peak) peak = e; dd = Math.min(dd, e / peak - 1); ddUsd = Math.min(ddUsd, e - peak);
    if (q === b || D[q + 1].slice(0, 7) !== D[q].slice(0, 7)) { months.push({ m: D[q].slice(0, 7), usd: e - prev, ret: e / prev - 1 }); prev = e; } }
  const usd = months.map(m => m.usd).sort((x, y) => x - y), med = usd.length ? (usd.length % 2 ? usd[usd.length >> 1] : (usd[usd.length / 2 - 1] + usd[usd.length / 2]) / 2) : null;
  const end = eq[b];
  return { profit: r2(end - capital), endEquity: r2(end), ret: r4(end / capital - 1), months: months.length, perMonthAvg: r2((end - capital) / (months.length || 1)), perMonthMedian: r2(med), worstMonth: r2(usd[0]), bestMonth: r2(usd[usd.length - 1]),
    monthsPositive: r4(months.filter(m => m.usd > 0).length / (months.length || 1)), maxDD: r4(dd), maxDDUsd: r2(ddUsd), monthly: months.map(m => [m.m, r2(m.usd), r4(m.ret)]) };
}
export function top2Usd(trades) { return [...trades].map(z => z.usd).sort((x, y) => y - x).slice(0, 2).reduce((x, y) => x + Math.max(0, y), 0); }

// ---- GATES of one policy at one capital in one half ----
// pol / plain / spus: curve() results; pTrades: the policy's trades (closed + open marks) in that half account.
export function gates(pol, plain, spus, pTrades) {
  const noTop2 = pol.profit - top2Usd(pTrades);
  const g = { beatsPlain: pol.profit > plain.profit, beatsSPUS: pol.profit > spus.profit, drawdownOk: pol.maxDD >= spus.maxDD - 0.05, noTop2BeatsPlain: noTop2 > plain.profit };
  return { ...g, pass: Object.values(g).every(Boolean), noTop2Profit: r2(noTop2) };
}
// firstRun half block (format of the other labs: n, blocks, avg, avgStress, edge, noTop2, tBlock), all PER MONTH:
//   n = trades (closed + still open at the half end), blocks = months, avg = mean monthly return (0.8% cost), avgStress = the same at
//   1.2%, edge = mean monthly return minus SPUS held (same months), noTop2 = (profit - 2 best trades - PLAIN profit) / capital / months
//   (> 0 = gate 4 holds), tBlock = t of the monthly differences vs SPUS. Plus vsPlain (monthly), usd, plain, spus, gates.
export function halfBlock({ pol, polStress, plain, spus, trades, capital, g }) {
  const pm = pol.monthly.map(x => x[2]), sm = spus.monthly.map(x => x[2]), dif = pm.map((x, i) => x - (sm[i] ?? 0)), md = mean(dif);
  const sd = dif.length > 1 ? Math.sqrt(dif.reduce((s, x) => s + (x - md) ** 2, 0) / (dif.length - 1)) : null;
  const strip = (c) => { const { monthly, ...rest } = c; return rest; };
  const hal = { ok: 0, unknown: 0 }; for (const z of trades) hal[z.halal === 'ok' ? 'ok' : 'unknown']++;
  return { n: trades.length, blocks: pm.length, avg: r4(mean(pm)), avgStress: r4(mean(polStress.monthly.map(x => x[2]))), edge: r4(md), noTop2: r4((g.noTop2Profit - plain.profit) / capital / (pm.length || 1)),
    tBlock: sd > 0 ? r2(md / (sd / Math.sqrt(dif.length))) : null, vsPlain: r4((pol.profit - plain.profit) / capital / (pm.length || 1)), halalMix: hal,
    usd: strip(pol), stressUsd: { profit: polStress.profit }, plain: strip(plain), spus: strip(spus), gates: g };
}

// ---- library pre-registration (idempotent; written before any run) ----
export function preRegister(LB, date = '2026-10-24') { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  const inputs = Object.entries(RULES).map(([id, r]) => id + ' (' + r.family + ', hold ' + r.hold + ')').join('; ');
  for (const [id, p] of Object.entries(POLICIES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Money management (squad 3)', name: p.name,
      explain: 'Money-management policy, NOT a buy signal. Exact parameters: ' + JSON.stringify(p) + '. Applied to the frozen 5-year signal lists of ' + inputs + ' (each rule\'s own hold and stop unless the policy changes the exit), in a cash account of 10,000 / 25,000 / 50,000 USD with 3 USD per buy and per sale + 0.8% cost, full size (or what the cash covers if at least half, else skip), sales before buys, most liquid signal first, ZAD not-halal stocks out, halal-unknown in and flagged.',
      status: 'pre-registered ' + date + ' (squad 3); one-shot pending', agent: 'squad3',
      note: 'Pre-registered ' + date + ' BEFORE any run (squad3-core.mjs header = the exact rules). Gates in BOTH halves (separate accounts: buys 2021-10-12..2023-12-29 and 2024-01-02..the last complete signal session, T-1-126) at ALL three capitals: profit > the same rules on plain 1,000 USD tickets; profit > SPUS held with the same capital; max drawdown no worse than SPUS by more than 5 points; profit without its 2 best trades > plain tickets. First complete verdict frozen in data/squad3-lab.json firstRun.' }); ch++; }
  if (ch) LB.updated = date; return ch; }
