// ACCOUNT REPLAY CORE (27 Oct 2026; Stock-2). Pure functions, no network, no files. Used by account-replay-lab.mjs and
// test/account-replay-core.test.mjs. Long only; never places an order; never gives a halal ruling.
//
// THE QUESTION (owner's reviewer, 27 Oct 2026): the live TRY SMALL rules were each tested on ALL their trades independently. The real account
// is different: at most 2 open TRY SMALL positions, 1,000 USD per buy, picks taken in a fixed order, a stock already held is skipped, and a
// rule switches itself off once it has 10+ finished results with a negative average (scan.mjs tryLedgerOff). Does THAT account make money
// over the 5-year window, and does it beat simply holding SPY with the same 2,000 USD? Also: B-FCF1 is offered up to 5 sessions after its
// monthly formation (scan.mjs within5), but it was tested buying at the next open after formation. Is the later entry still OK?
//
// PRE-REGISTERED 27 Oct 2026 BEFORE ANY RESULT WAS SEEN (frozen policy; the order is NOT optimised; each replay is run ONCE).
//
// THE RULES AND THEIR PRIORITY (= the order scan.mjs trySmallLines pushes them into `src`, 27 Oct 2026):
//   1 B-FCF1 (value lab, hold 63)  2 DEC-FROG (decoded lab, hold 126)  3 ANOM-RESMOM (anomaly lab, hold 63)
//   4 MACRO-GOLD-S20 (hold 20)  5 MACRO-USD-E60 (hold 60, XLK)  6 SQ6-MTUM (hold 126)  7 SQ6-QMOM (hold 63)  8 SQ11-PB12 (hold 126).
//   ANOM-SUESURGE is left out of the main replay (the brief treats it as paused); it is run once as an INFORMATION variant (+SUESURGE, at
//   its anomaly-lab place right after ANOM-RESMOM) because the live code no longer pauses it (it has a correctedRun).
//   Within one rule on one day: the order of that rule's own saved / rebuilt pick list. Because that order is not certain to equal the live
//   newSignals order, an INFORMATION sensitivity re-runs the main replay with the picks of each rule shuffled within each day (200 seeded
//   shuffles; rule priority unchanged) and reports the spread. The main number is the saved-order run.
//
// SIGNALS: each rule's real signal list (the same lists squad 20 rebuilt and matched to the frozen trade counts): data/value-lab.json
//   trades B-FCF1 (d = formation close), data/decoded-history.json DEC-FROG, data/confluence-signals.json.gz ANOM-RESMOM / ANOM-SUESURGE,
//   data/macro-lab.json MACRO-GOLD-S20 / MACRO-USD-E60, data/squad11-lab.json SQ11-PB12; SQ6-MTUM / SQ6-QMOM rebuilt with squad6-core
//   (mtumPick / qmomPick, squad 18 / 20 construction). Every input is dated at its signal close; nothing after the entry open is used.
//   The saved lists hold only trades that FINISHED inside each lab's frozen window, so the newest months are incomplete. The replay therefore
//   ENDS at CUT = the last session through which every included rule's list is complete (window end minus that rule's hold, the earliest
//   over the rules). An INFORMATION run to the newest session with whatever signals exist is labelled INCOMPLETE.
//
// EXITS: each rule's OWN tested exit. Checked 27 Oct in each lab: none of the 8 tests used a stop (squad11-core: "No stops (the hold is
//   the plan)"; squad6-lab MTUM / QMOM: sell at the close of session 126 / 63; decoded DEC-FROG engine TIME; value / anomaly / macro labs:
//   fixed hold). So the main replays sell at the close of session `hold` counted from the buy day (a stock whose bars stop early: its last
//   close, 'gone'), exactly squad20-core holdFrom. INFORMATION variant LIVESTOP: the live lane stop instead (scan.mjs: 35% when hold > 100,
//   else 15%; a close at or below buy x (1 - stop) sells at the next open; squad20-core holdStop).
//
// REPLAY-2SLOT (main): a new account with 2,000 USD cash reserved for TRY SMALL; at most 2 open; 1,000 USD per buy (or all remaining cash
//   if less), whole shares; cost 0.8% round trip = 0.4% on each side (1.2% stress = 0.6% a side); entry at the open after each rule's own
//   signal close (as tested); the rule's own exit; a rule is OFF while it has 10+ finished results in THIS account with a negative average
//   after cost (finished = sold at or before the previous close; it can come back on if open trades finish positive, as the live check is
//   recomputed each day); a symbol already held is skipped; a pick with no slot left is counted as SKIPPED FOR FULL SLOTS. Order inside a
//   session: entries at the open (the slot count includes positions being sold at that open: in the live flow the sale is not yet done
//   when the buy list is made), then stop sales at the open, then time sales at the close, then the day is marked at the close.
//   Positions still open at the end are marked at the last close (unrealised; no sale cost charged, as for SPY).
//   Reported: daily equity, realised and unrealised P&L, max drawdown, trades taken per rule, skipped signals (full slots / already held /
//   rule off / too expensive for the cash), total return, return per year (compound, 252 sessions), calendar-year returns, versus SPY
//   bought with the same 2,000 USD at the open of the same start day (whole shares, 0.4% buy cost, held, marked at the close), and SPUS the
//   same way when its prices exist. Three accounts: OLDER half (start 2021-10-12 = first session, end 2023-12-29), NEWER half (start
//   2024-01-02, end CUT), FULL (start 2021-10-12, end CUT). Each is a fresh account (empty ledger). INFORMATION: the older half also from
//   2022-11-01 (the first month in which every momentum rule can fire: before then the account is mostly cash because the rules need
//   12 months of history, which is not skill).
// REPLAY-2SLOT-LATE: identical, but every B-FCF1 entry is at the open 5 sessions after formation (session t+5, the latest the live code
//   allows), still held 63 sessions from that buy. INFORMATION: B-FCF1 alone on ALL its trades, the average after 1.2% cost for entry at
//   +1 (= the tested next open), +3 and +5 sessions after formation, each held 63 sessions from its own buy; also per half.
// Halal: past ZAD marks cannot be known; the replay runs on the full universe (data/halal.json marks are TODAY's only). Said plainly in
//   the result. Dividends are not in the price data (split-adjusted only) for the stocks or for SPY / SPUS alike.

//
// SECOND REPLAY, PRE-REGISTERED 27 Oct 2026 (coordinator's request) BEFORE IT WAS RUN (same machinery; run ONCE with MODE=pb12t20):
// REPLAY-PB12T20 (primary): ONE rule, SQ11-PB12 entries exactly as squad11 tested (data/squad11-lab.json trade list: first close 12% under
//   the 50-day high, still above the 200-day, top-300 leaders; buy the open after the signal close). EXIT = agent-a-tgt-core targetExit
//   with p = 20% (A-TGT-TGT20-PB12): a SELL LIMIT at buy x 1.20, filled at the target on the first session k..x whose HIGH reaches it (no
//   high: its close), or at that session's OPEN when the stock opens at or above it (gap over); else sold at the close of session 126 counted
//   from the buy (a stock whose bars stop early: its last close). NO stop. A target sale frees the slot for the NEXT session's entries.
//   Account: 3,000 USD start, at most 3 open, 1,000 USD per buy (or all remaining cash if less), whole shares, signals in the lab's own
//   pick order within a day (no ranking by returns), held symbols skipped, cost 0.8% round trip (1.2% stress), the 10-result switch-off
//   kept as in the live lane. Windows as the first replay: OLDER 2021-10-12..2023-12-29, NEWER 2024-01-02..CUT, FULL 2021-10-12..CUT
//   (CUT = SQ11-PB12's list complete-through date), plus INFORMATION older from 2022-11-01 (PB12's first signals). Benchmarks SPY and SPUS
//   bought with the same 3,000 USD at the open of the same start day (SPUS n/a when it has no bar that day).
//   Reported per window: end USD, per year vs SPY / SPUS, max drawdown vs SPY, trades, WIN RATE (net after cost > 0, closed trades),
//   average win, average loss, worst trade, share of closed trades reaching the target (target or gap over), signals skipped for full
//   slots; and 200 seeded shuffles of the same-day pick order: median end USD and share of shuffles ending above SPY.
//   CHECK: the rebuilt PB12 +20% trades must reproduce agent-a-tgt-lab A-TGT-TGT20-PB12 (n 99 / 256, win 72.7% / 74.6%).
//   INFORMATION variants (same account): (a) TGT15 and TGT10 exits; (b) 2 slots / 2,000 USD instead of 3 / 3,000; (c) only stocks marked
//   ok in TODAY's data/halal.json, labelled "today's marks only, hindsight".
// VERDICT QUESTION (pre-registered): does the 3-slot PB12 +20% account end above SPY in BOTH halves AND have a 70%+ win rate in both?
export const REGISTERED = '2026-10-27';
export const PB12T = { rule: 'SQ11-PB12', hold: 126, target: 0.20, infoTargets: [0.15, 0.10], cash0: 3000, maxOpen: 3, perBuy: 1000, info2: { cash0: 2000, maxOpen: 2 } };
// the profit target (agent-a-tgt-core targetExit, copied): first session k..x whose high (else close) reaches L = px0 (1 + p); a gap over
// L after the buy day sells at that open. Returns { q, px, how } or null when the target was not reached by x.
export function targetExit(S, tr, p) { const L = tr.px0 * (1 + p);
  for (let q = tr.k; q <= tr.x; q++) { const o = S.o[q], h = S.h ? S.h[q] : NaN, c = S.c[q];
    if (q > tr.k && o > 0 && o >= L) return { q, px: o, how: 'gap' };
    const top = h > 0 ? h : c; if (top > 0 && top >= L - 1e-12) return { q, px: L, how: 'target' }; }
  return null; }
// closed-trade statistics of an account (net after cost)
export function tradeStats(closed) { const n = closed.map(z => z.net).filter(x => typeof x === 'number'), w = n.filter(x => x > 0), l = n.filter(x => x <= 0);
  return { closed: n.length, winRate: n.length ? r4(w.length / n.length) : null, avgWin: w.length ? r4(mean(w)) : null, avgLoss: l.length ? r4(mean(l)) : null, worst: n.length ? r4(Math.min(...n)) : null,
    avgNet: n.length ? r4(mean(n)) : null, hitTarget: closed.length ? r4(closed.filter(z => z.kind === 'target' || z.kind === 'gap').length / closed.length) : null }; }
export const COST = 0.008, STRESS = 0.012, CASH0 = 2000, PER_BUY = 1000, MAX_OPEN = 2, OFF_N = 10, LATE_SHIFT = 5, YEAR = 252;
export const SHUFFLES = 200, SPLIT = '2024-01-01', OLDER_END = '2023-12-29', ALL_ACTIVE = '2022-11-01';
// priority order = scan.mjs src order; base = squad20-core BASES key; hold = the rule's tested hold; liveStop = scan.mjs stopPct
export const RULES = [
  { id: 'B-FCF1', base: 'FCF1', hold: 63, liveStop: 0.15, lab: 'value' },
  { id: 'DEC-FROG', base: 'FROG', hold: 126, liveStop: 0.35, lab: 'decoded' },
  { id: 'ANOM-RESMOM', base: 'RESMOM', hold: 63, liveStop: 0.15, lab: 'anomaly' },
  { id: 'ANOM-SUESURGE', base: 'SUESURGE', hold: 60, liveStop: 0.15, lab: 'anomaly', infoOnly: true },
  { id: 'MACRO-GOLD-S20', base: 'GOLD', hold: 20, liveStop: 0.15, lab: 'macro' },
  { id: 'MACRO-USD-E60', base: 'USD', hold: 60, liveStop: 0.15, lab: 'macro' },
  { id: 'SQ6-MTUM', base: 'MTUM', hold: 126, liveStop: 0.35, lab: 'squad6' },
  { id: 'SQ6-QMOM', base: 'QMOM', hold: 63, liveStop: 0.15, lab: 'squad6' },
  { id: 'SQ11-PB12', base: 'PB12', hold: 126, liveStop: 0.35, lab: 'squad11' },
];
export const MAIN_IDS = RULES.filter(r => !r.infoOnly).map(r => r.id);
export const liveStopOf = (hold) => hold > 100 ? 0.35 : 0.15;   // scan.mjs: stopPct: hold > 100 ? 0.35 : 0.15 (value lab 0.15, decoded 0.35)

export const r4 = (x) => typeof x === 'number' && isFinite(x) ? Math.round(x * 1e4) / 1e4 : null;
export const r2 = (x) => typeof x === 'number' && isFinite(x) ? Math.round(x * 100) / 100 : null;
export const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;

// the live switch-off (scan.mjs tryLedgerOff): 10+ finished results with a negative average
export function ledgerOff(results, n = OFF_N) { return results.length >= n && results.reduce((s, x) => s + x, 0) / results.length < 0; }

// net return of one round trip with cost c (round trip) split evenly over buy and sell
export const netOf = (px0, px1, c) => (px1 * (1 - c / 2)) / (px0 * (1 + c / 2)) - 1;

// shares bought with `budget` at price px including the buy-side cost
export function sharesFor(budget, px, c) { if (!(px > 0) || !(budget > 0)) return 0; return Math.floor(budget / (px * (1 + c / 2)) + 1e-9); }

// seeded random (mulberry32) for the order sensitivity
export function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// shuffle the within-rule order of picks that share a rule and an entry session (rule priority untouched)
export function shuffleWithin(cands, rand) { const groups = new Map(); for (const c of cands) { const k = c.id + '|' + c.k; (groups.get(k) || groups.set(k, []).get(k)).push(c); }
  const out = []; for (const g of groups.values()) { const a = g.map(c => ({ ...c })); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } a.forEach((c, i) => { c.ord = i; }); out.push(...a); } return out; }

// THE ACCOUNT. cands: [{ id, sym, k (entry session), x (exit session, null = still open at the data end), exitAt 'o'|'c', px0, px1, ord }].
// closeOf(sym, t) -> the close (or the last known close) of sym at session t, for the daily mark. D = session dates. start / end = sessions.
export function simulate({ cands, D, closeOf, start, end, priority, cost = COST, cash0 = CASH0, perBuy = PER_BUY, maxOpen = MAX_OPEN, offN = OFF_N }) {
  const rank = new Map(priority.map((id, i) => [id, i])), byK = new Map();
  for (const c of cands) { if (!rank.has(c.id) || c.k < start || c.k > end) continue; (byK.get(c.k) || byK.set(c.k, []).get(c.k)).push(c); }
  for (const a of byK.values()) a.sort((p, q) => rank.get(p.id) - rank.get(q.id) || (p.ord || 0) - (q.ord || 0));
  let cash = cash0; const open = [], closed = [], equity = [], ledger = new Map(priority.map(id => [id, []]));
  const per = Object.fromEntries(priority.map(id => [id, { taken: 0, closed: 0, wins: 0, realised: 0, unrealised: 0, open: 0, offDays: 0, sumNet: 0 }]));
  const skipped = { fullSlots: 0, held: 0, ruleOff: 0, tooExpensive: 0 }, offSeen = new Set();
  const sell = (P, t, px, kind) => { const proceeds = P.sh * px * (1 - cost / 2); cash += proceeds; const pnl = proceeds - P.paid, net = netOf(P.px0, px, cost);
    const z = { id: P.id, sym: P.sym, buy: D[P.k], sell: D[t], px0: P.px0, px1: px, shares: P.sh, paid: r2(P.paid), proceeds: r2(proceeds), pnl: r2(pnl), net: r4(net), kind };
    closed.push(z); const R = per[P.id]; R.closed++; R.realised += pnl; R.sumNet += net; if (pnl > 0) R.wins++; ledger.get(P.id).push(net); open.splice(open.indexOf(P), 1); };
  for (let t = start; t <= end; t++) {
    // 1) the buy list at the open (rule on/off judged on results finished by the previous close)
    for (const c of byK.get(t) || []) {
      if (ledgerOff(ledger.get(c.id), offN)) { skipped.ruleOff++; if (!offSeen.has(c.id + '|' + t)) { offSeen.add(c.id + '|' + t); per[c.id].offDays++; } continue; }
      if (open.some(P => P.sym === c.sym)) { skipped.held++; continue; }
      if (open.length >= maxOpen) { skipped.fullSlots++; continue; }
      const sh = sharesFor(Math.min(perBuy, cash), c.px0, cost); if (sh < 1) { skipped.tooExpensive++; continue; }
      const paid = sh * c.px0 * (1 + cost / 2); cash -= paid; per[c.id].taken++;
      open.push({ ...c, sh, paid }); }
    // 2) stop sales at the open, 3) time / gone sales at the close
    for (const P of open.filter(P => P.x === t && P.exitAt === 'o')) sell(P, t, P.px1, P.kind || 'stop');
    for (const P of open.filter(P => P.x === t && P.exitAt !== 'o')) sell(P, t, P.px1, P.kind || 'time');
    // 4) mark at the close
    let v = cash; for (const P of open) { const px = closeOf(P.sym, t); v += P.sh * (px > 0 ? px : P.px0); }
    equity.push({ d: D[t], v: r2(v), cash: r2(cash), open: open.length });
  }
  let unreal = 0; for (const P of open) { const px = closeOf(P.sym, end), val = P.sh * (px > 0 ? px : P.px0); const u = val - P.paid; unreal += u; per[P.id].unrealised += u; per[P.id].open++; }
  const v0 = cash0, v1 = equity.length ? equity[equity.length - 1].v : cash0, sessions = equity.length;
  const realised = closed.reduce((s, z) => s + z.pnl, 0);
  for (const R of Object.values(per)) { R.realised = r2(R.realised); R.unrealised = r2(R.unrealised); R.avgNet = R.closed ? r4(R.sumNet / R.closed) : null; delete R.sumNet; }
  return { start: D[start], end: D[end], sessions, v0, v1: r2(v1), totalReturn: r4(v1 / v0 - 1), perYear: r4(cagr(v0, v1, sessions)), maxDD: r4(maxDrawdown(equity.map(e => e.v))),
    realised: r2(realised), unrealised: r2(unreal), trades: closed.length + open.length, closedTrades: closed.length, openAtEnd: open.map(P => ({ id: P.id, sym: P.sym, buy: D[P.k] })),
    perRule: per, skipped, byCalendarYear: calendarYears(equity, cash0), timeInMarket: r4(equity.filter(e => e.open > 0).length / Math.max(1, sessions)), equity, closed };
}

// buy and hold one fund with the same cash at the open of `start` (whole shares, buy cost), marked at the close
export function buyHold({ o, c, D, start, end, cash0 = CASH0, cost = COST }) {
  if (!(o[start] > 0)) return null; const sh = sharesFor(cash0, o[start], cost), left = cash0 - sh * o[start] * (1 + cost / 2), equity = []; let last = o[start];
  for (let t = start; t <= end; t++) { if (c[t] > 0) last = c[t]; equity.push({ d: D[t], v: r2(left + sh * last) }); }
  const v1 = equity[equity.length - 1].v;
  return { start: D[start], end: D[end], sessions: equity.length, v0: cash0, v1, totalReturn: r4(v1 / cash0 - 1), perYear: r4(cagr(cash0, v1, equity.length)), maxDD: r4(maxDrawdown(equity.map(e => e.v))), byCalendarYear: calendarYears(equity, cash0), equity };
}

export function cagr(v0, v1, sessions) { if (!(v0 > 0) || !(v1 > 0) || !(sessions > 1)) return null; return Math.pow(v1 / v0, YEAR / sessions) - 1; }
export function maxDrawdown(vals) { let peak = -Infinity, dd = 0; for (const v of vals) { if (v > peak) peak = v; if (peak > 0) dd = Math.min(dd, v / peak - 1); } return dd; }
// calendar-year return of an equity curve (first year from the start value, each later year from the previous year's last close)
export function calendarYears(eq, v0) { const out = {}; let prev = v0 ?? (eq.length ? eq[0].v : null), year = null, last = null;
  for (const e of eq) { const y = e.d.slice(0, 4); if (year !== null && y !== year) { out[year] = r4(last / prev - 1); prev = last; } year = y; last = e.v; }
  if (year !== null) out[year] = r4(last / prev - 1); return out; }

// B-FCF1 late-entry information: average net after `cost` per shift
export function shiftStats(rows, cost) { const v = rows.filter(z => typeof z.g === 'number' && isFinite(z.g)); if (!v.length) return { n: 0, avg: null, win: null };
  const nets = v.map(z => (1 + z.g) * (1 - cost / 2) / (1 + cost / 2) - 1); return { n: v.length, avg: r4(mean(nets)), median: r4([...nets].sort((a, b) => a - b)[Math.floor(nets.length / 2)]), win: r4(nets.filter(x => x > 0).length / nets.length) }; }

// percentiles of a list (sensitivity)
export function pct(a, p) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), i = Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1)))); return s[i]; }
