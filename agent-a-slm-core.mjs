// AGENT A: A-SLM1 STOP-LOSS MOMENTUM (Agent A league catch-up run for Sun 15 Nov 2026, run Tue 17 Nov 2026).
// PRE-REGISTERED 17 Nov 2026 BEFORE ANY RUN. The rule is the library entry A-SLM1 as written on 10 Nov 2026; this header fixes the
// details and the judging before the first run. Research only: never a buy line, never an order, no Telegram, never edits scan.mjs or
// another lab. Run ONCE by agent-a-slm-lab.mjs (one-shot workflow agent-a-slm-lab.yml); the first complete result is frozen in
// data/agent-a-slm-lab.json firstRun (first-run.mjs freezeEach); later runs only refresh `latest` (monitoring).
//
// SOURCE: Han, Zhou & Zhu (2016), "Taming momentum crashes: a simple stop-loss strategy", SSRN 2407199; CEPR DP19030 (2024).
//
// RULE (A-SLM1):
//   Formation: the close of the last session of every calendar month t (t >= 252 sessions into the data).
//   Universe: the 1,000 most-traded stocks by 63-session average traded value among LIQUID stocks at t (close 5 USD+ and 20-session
//   average traded value 5M USD+; system convention, dead stocks included), with a close 252 and 21 sessions before t.
//   Momentum 12-1 = close(t - 21) / close(t - 252) - 1. Picks: the top 10% (100 stocks), equal money.
//   Entry: the open of session k0 = t + 1. Regular exit: the open of k1 = the next formation's entry session (re-formed monthly; every
//   position pays a full round trip every month, even when picked again: conservative, the same for both books).
//   STOP: if any close from k0 to k1 - 1 is 10% or more under the entry open (close <= 0.9 x entry), the stock is sold at the NEXT open
//   (a gap below the stop counts in full) and that money waits in cash at 0% until k1. A stock that stops trading is valued at its last close.
//   NO-STOP BOOK (yardstick for the exit): the same picks, entries and k1 exits, no stop.
//   Costs: 0.8% a round trip (1.2% stress) per trade. Returns capped at +300% for the rule and every yardstick alike.
//   A pick whose price series has a split artifact inside k0..k1 is dropped from both books (system convention).
//   Halves by the formation date: older before 2024-01-01, newer from 2024-01-01.
//
// JUDGING (CLAUDE.md section 4; per half, on the STOP book's trades):
//   G1 profit: average trade after 0.8% > 0 and after the 1.2% stress cost > 0.
//   G2 beats the average stock: average of (trade - cost - the average liquid stock bought at the same open k0 and sold at the open k1) > 0.
//   G3 beats the same stock on its other days: average of (trade - the same stock's average open-to-open return over the same number of
//      sessions on every 3rd session of the same half) > 0.
//   G4 beats SPY per year: the book's compounded return per year over the half's months (each month = the average of its trades after 0.8%)
//      > SPY's (open k0 to open k1, no cost) over the same months.
//   G5 still positive without its 2 best trades (after 0.8%).
//   G6 block t >= 2.5: t of the monthly edge over the average stock (one block = one formation month).
//   G7 n >= 20 trades on 10+ distinct entry days (= formation months).
//   PROVEN = G1-G7 in both halves AND block t >= the league luck bar (data/agent-league.json bar) in both halves.
//   TIER 2 (22 Oct update): G1 at 1.2% in both halves, G2 and G5 in both halves, block t >= 2.5 in both halves.
//   TRY SMALL bar: G1 at 1.2% in both halves, G2 and G5 in both halves, 20+ trades and 3+ blocks in each half.
//   EXIT VERDICT (the question A-SLM1 asks): STOP HELPS = in BOTH halves at BOTH costs, the stop book's average trade is higher than the
//      no-stop book's AND its max drawdown on monthly equity is no deeper. Otherwise STOP DOES NOT HELP.
//   Reported besides: trades, distinct stocks, distinct entry days, stop exits and their distinct days, median trade, worst trade,
//   worst month (the worst entry day's book), max drawdown, per-year return of both books and SPY.
// Library check (17 Nov 2026): SQ3-CUTRUN (-8% cut + 50-day trail on rule trades: rejected), A-LDX1 (exits on the leader-dip lane:
// do not adopt), A-RMOM1 (book-level volatility sizing: not adopted). None is a fixed 10% stop on a monthly 12-1 winner book.
export const REGISTERED = '2026-11-17', SPLIT = '2024-01-01', COST = 0.008, STRESS = 0.012, STOP = 0.10, TOPN = 1000, PICK = 0.10, CAP = 3;
export const T2 = 2.5, MIN_N = 20, MIN_DAYS = 10, MIN_BLOCKS = 3, ID = 'A-SLM1';
export const r4 = (x) => typeof x === 'number' && isFinite(x) ? Math.round(x * 1e4) / 1e4 : null;
export const mean = (a) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
export const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((u, w) => u + (w - m) ** 2, 0) / (a.length - 1)); };
export const tStat = (a) => { if (a.length < 2) return null; const s = sd(a); return s > 0 ? mean(a) / s * Math.sqrt(a.length) : null; };
export const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';
export const cap = (g) => Math.min(g, CAP);

// One position. o[j], c[j] = open / close of session k0 + j (j = 0..h); o[0] = entry, o[h] = the regular exit open; NaN = no bar.
// last = the index of the stock's last bar (j) if it stops trading inside the hold, else >= h. Returns gross returns (before cost).
export function slmTrade(o, c, h, last = Infinity) {
  const e = o[0]; if (!(e > 0)) return null;
  const lastClose = (j) => { for (let q = Math.min(j, o.length - 1); q >= 0; q--) if (c[q] > 0) return c[q]; return e; };
  const regular = (h <= last && o[h] > 0) ? o[h] : (h > last ? lastClose(last) : null);
  if (regular === null) return null;
  let stop = null, stopJ = null;
  for (let j = 0; j < h; j++) { if (j > last) break; if (c[j] > 0 && c[j] <= (1 - STOP) * e) {
    const nx = j + 1; stopJ = j; stop = (nx <= last && o[nx] > 0) ? o[nx] : nx > last ? lastClose(last) : (nx === h ? regular : (() => { for (let q = nx + 1; q <= h; q++) if (o[q] > 0) return o[q]; return regular; })()); break; } }
  return { noStop: cap(regular / e - 1), stop: cap((stop !== null ? stop : regular) / e - 1), stopped: stop !== null, stopJ };
}

// trades: [{ d (formation date), s (symbol), g (stop book gross), g0 (no-stop gross), c (average stock k0->k1), own (same stock other days), spy, stopped, stopDay }]
export function halfStats(trades, key, cost) {
  const n = trades.length; if (!n) return { n: 0 };
  const net = trades.map(z => z[key] - cost), byM = {}; for (const z of trades) (byM[z.d] = byM[z.d] || []).push(z);
  const months = Object.keys(byM).sort(), mBook = months.map(d => mean(byM[d].map(z => z[key] - cost))), mEdge = months.map(d => mean(byM[d].map(z => z[key] - cost - z.c)));
  const mSpy = months.map(d => byM[d][0].spy);
  let e = 1, pk = 1, dd = 0, es = 1; mBook.forEach((r, j) => { e *= 1 + r; pk = Math.max(pk, e); dd = Math.min(dd, e / pk - 1); es *= 1 + mSpy[j]; });
  const sorted = [...net].sort((a, b) => b - a), ownD = trades.filter(z => typeof z.own === 'number');
  return { n, days: months.length, stocks: new Set(trades.map(z => z.s)).size, avg: r4(mean(net)), median: r4(median(net)), worst: r4(Math.min(...net)), best: r4(Math.max(...net)),
    win: r4(net.filter(x => x > 0).length / n), noTop2: r4(mean(sorted.slice(2))), edge: r4(mean(trades.map(z => z[key] - cost - z.c))), blockT: r4(tStat(mEdge)),
    vsOwn: ownD.length ? r4(mean(ownD.map(z => z[key] - z.own))) : null, worstMonth: r4(Math.min(...mBook)), maxDD: r4(dd),
    perYear: r4(Math.pow(e, 12 / months.length) - 1), spyPerYear: r4(Math.pow(es, 12 / months.length) - 1),
    stopped: key === 'g' ? trades.filter(z => z.stopped).length : undefined, stopDays: key === 'g' ? new Set(trades.filter(z => z.stopped).map(z => z.stopDay)).size : undefined };
}

export function gates(R) {   // R = { base, stress } halfStats of the stop book for ONE half
  const b = R.base, s = R.stress;
  return { G1: b.avg > 0 && s.avg > 0, G2: b.edge > 0, G3: typeof b.vsOwn === 'number' && b.vsOwn > 0, G4: b.perYear > b.spyPerYear, G5: b.noTop2 > 0,
    G6: typeof b.blockT === 'number' && b.blockT >= T2, G7: b.n >= MIN_N && b.days >= MIN_DAYS };
}

// H = { older: { stop: { base, stress }, noStop: { base, stress } }, newer: ... }
export function judgeSlm(H, luckBar) {
  const halves = ['older', 'newer'], G = Object.fromEntries(halves.map(h => [h, gates(H[h].stop)])), why = [];
  const NAMES = { G1: 'profit after 0.8% and 1.2%', G2: 'beats the average stock', G3: 'beats the same stock on its other days', G4: 'beats SPY per year', G5: 'positive without its 2 best trades', G6: 'block t >= ' + T2, G7: MIN_N + '+ trades on ' + MIN_DAYS + '+ days' };
  for (const h of halves) for (const [k, ok] of Object.entries(G[h])) if (!ok) why.push('fails "' + NAMES[k] + '" in the ' + h + ' half');
  const all = halves.every(h => Object.values(G[h]).every(Boolean));
  const proven = all && halves.every(h => H[h].stop.base.blockT >= luckBar);
  const tier2 = halves.every(h => H[h].stop.stress.avg > 0 && G[h].G2 && G[h].G5 && G[h].G6);
  const trySmall = halves.every(h => H[h].stop.stress.avg > 0 && G[h].G2 && G[h].G5 && H[h].stop.base.n >= MIN_N && H[h].stop.base.days >= MIN_BLOCKS);
  const helps = halves.every(h => ['base', 'stress'].every(c => H[h].stop[c].avg > H[h].noStop[c].avg && H[h].stop[c].maxDD >= H[h].noStop[c].maxDD));
  const level = proven ? 'PROVEN' : tier2 ? 'tier 2' : trySmall ? 'TRY SMALL bar' : 'none';
  const verdict = (proven ? 'PROVEN' : tier2 ? 'TIER 2' : trySmall ? 'NOT PROVEN (TRY SMALL bar only)' : all ? 'NOT PROVEN' : 'REJECTED') + '; ' + (helps ? 'STOP HELPS' : 'STOP DOES NOT HELP');
  if (!helps) why.push('the 10% stop does not beat the same book without it (average trade and drawdown, both halves, both costs)');
  return { verdict, level, stopHelps: helps, gates: G, why };
}

export const JUDGING = 'JUDGING (agent-a-slm-core.mjs header, written ' + REGISTERED + ' before any run): monthly 12-1 top 10% of the 1,000 most-traded liquid stocks, next open, re-formed monthly; 10% stop on the entry open (close <= 0.9 x entry -> next open, cash to month end); 0.8% / 1.2% per trade; +300% cap both sides; gates G1-G7 of CLAUDE.md section 4 per half (before / from 2024); PROVEN = all + block t >= league bar; tier 2 / TRY SMALL bar as written; STOP HELPS = stop book beats the no-stop book on average trade and drawdown in both halves at both costs.';
export function preRegister(LB, today = REGISTERED) { if (!LB || !Array.isArray(LB.strategies)) return 0; const e = LB.strategies.find(x => x.id === ID); if (!e || e.judging) return 0;
  e.judging = JUDGING; e.status = 'pre-registered ' + today + ' (Agent A); 5-year one-shot pending (agent-a-slm-lab.mjs)'; LB.updated = today; return 1; }
export function recordResult(LB, first) { if (!LB || !Array.isArray(LB.strategies)) return 0; const e = LB.strategies.find(x => x.id === ID), r = first && first[ID]; if (!e || !r || !r.judged) return 0;
  if (e.result && e.result.frozenAt === r.frozenAt) return 0; const v = r.judged.verdict;
  e.status = 'tested: ' + (v.startsWith('PROVEN') ? 'proven' : v.startsWith('TIER 2') ? 'tier 2' : v.startsWith('NOT PROVEN (TRY') ? 'not proven (TRY SMALL bar only)' : v.startsWith('NOT PROVEN') ? 'not proven' : 'rejected') + (r.judged.stopHelps ? '; stop helps' : '; stop does not help');
  e.result = { verdict: v, level: r.judged.level, why: r.judged.why, frozenAt: r.frozenAt, summary: r.summary }; return 1; }
