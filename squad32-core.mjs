// SQUAD 32: PATHWAYS LAB core (owner, 17 Nov 2026: "find me pathways strategy that can win trades ... don't stop until you find
// something"). Pure functions only (test/squad32-core.test.mjs); squad32-lab.mjs does the data. Research and paper only: never an order.
//
// WHY THESE: with ZAD's ~3 USD per order, a 1,000 USD trade pays ~0.6% round trip before the spread, so short holds need a large edge
// per trade. Every earlier short-hold family failed (squads 1-31). These are EVENT rules with months-long holds, where the cost is small
// next to the move, and none of them was tested before in this repo (strategy library: E7 spin-offs "queued", E6 index inclusion "needs
// data", C-SPEC1 index additions "queued").
//
// RULES, PRE-REGISTERED 17 Nov 2026 BEFORE ANY 5-YEAR NUMBER WAS SEEN (the first verdict is frozen):
//   SPIN-21-126  spin-off (SEC Form 10-12B filer whose stock first trades after the filing): buy the open of its 22nd session (after
//                the index-fund forced selling of the first month; Cusatis, Miles and Woolridge 1993; Greenblatt 1997), hold 126 sessions
//   SPIN-21-252  the same, hold 252 sessions (one year)
//   SPIN-2-126   buy the open of its 2nd session, hold 126 (control: no waiting)
//   SPDEL-63     S&P 500 deletion for market-cap reasons (keeps trading): buy the open of the first session on or after the effective
//                date, hold 63 sessions (deletion rebound; Chen, Noronha and Singal 2004)
//   SPDEL-126    the same, hold 126
//   SPADD-RUN    S&P 500 addition: buy the open of the first session after the announcement date, sell the close of the last session
//                before the effective date (the classic pre-inclusion run-up; Lynch and Mendenhall 1997)
//   SPADD-63     S&P 500 addition: buy the open of the first session on or after the effective date, hold 63 (expected weak: control)
// BATCH 2, PRE-REGISTERED 17 Nov 2026 AFTER batch 1 was seen (disclosed: chosen because SPADD-RUN beat SPY in both halves but lost in
// absolute terms in the older half). The SAME SPADD-RUN rule, unchanged, on a new and independent sample: S&P MidCap 400 and SmallCap
// 600 additions (Wikipedia change tables; announcement = the date in the S&P press-release URL, else its cite date; kept if 0-30 days
// before the effective date). This is a replication test, nothing was tuned:
//   MID-ADD-RUN  S&P MidCap 400 additions     SML-ADD-RUN  S&P SmallCap 600 additions     ALL-ADD-RUN  both pooled (the primary test)
// COSTS: hunter-core costOf (0.6% fees + spread by price). Delisting inside the hold: last close -20% (hunter-core exitTrade).
// VERDICT, two bars, both reported:
//   MAKES MONEY  = hunter-core verdict (60+ trades, > 0 after costs in both halves, day-clustered t >= 2.5, > 0 at 1.5x costs and
//                  without the 2 best trades) -> TRY SMALL.
//   BEATS SPY    = excess over SPY on the same days (SPY bought at the same open, sold at the same close, same costs): > 0 in both
//                  halves AND month-clustered t >= 2.0 (overlapping long holds make a day-clustered t look better than it is).
//   A rule is a WINNER only if it is TRY SMALL and BEATS SPY. Halves split by entry date at SPLIT.
import { exitTrade, costOf, stats, verdict } from './hunter-core.mjs';

export const SPLIT = '2024-03-01';
export const RULES32 = {
  'SPIN-21-126': { kind: 'spin', wait: 21, hold: 126, text: 'Spin-off: buy the open of its 22nd session, hold 126 sessions' },
  'SPIN-21-252': { kind: 'spin', wait: 21, hold: 252, text: 'Spin-off: buy the open of its 22nd session, hold 252 sessions' },
  'SPIN-2-126': { kind: 'spin', wait: 1, hold: 126, text: 'Spin-off: buy the open of its 2nd session, hold 126 sessions (control)' },
  'SPDEL-63': { kind: 'del', hold: 63, text: 'S&P 500 deletion (market cap): buy the open on/after the effective date, hold 63' },
  'SPDEL-126': { kind: 'del', hold: 126, text: 'S&P 500 deletion (market cap): buy the open on/after the effective date, hold 126' },
  'SPADD-RUN': { kind: 'addrun', text: 'S&P 500 addition: buy the open after the announcement, sell the close before the effective date' },
  'SPADD-63': { kind: 'add', hold: 63, text: 'S&P 500 addition: buy the open on/after the effective date, hold 63 (control)' },
  'MID-ADD-RUN': { kind: 'addrun2', idx: ['400'], text: 'S&P MidCap 400 addition: buy the open after the announcement, sell the close before the effective date' },
  'SML-ADD-RUN': { kind: 'addrun2', idx: ['600'], text: 'S&P SmallCap 600 addition: buy the open after the announcement, sell the close before the effective date' },
  'ALL-ADD-RUN': { kind: 'addrun2', idx: ['400', '600'], text: 'S&P 400 + 600 additions pooled: buy the open after the announcement, sell the close before the effective date' }
};
// the run window of one addition: first position after the announcement day .. last position before the effective day
export function runWindow(s, days, ann, eff) { let e = -1, x = -1; for (let k = 0; k < s.d.length; k++) { const d = days[s.d[k]]; if (e < 0 && d > ann) e = k; if (d < eff) x = k; }
  return e >= 0 && x >= e ? [e, x] : null; }

// first position in s whose day (days[s.d[k]]) is >= iso, or -1
export function posOnOrAfter(s, days, iso) { for (let k = 0; k < s.d.length; k++) if (days[s.d[k]] >= iso) return k; return -1; }

// spin-off listing check: the stock's first bar must come after the filing, within 540 days, and not in the first 5 sessions of the data
// (a stock already trading when the data starts is not a new listing)
export function spinStart(s, days, filed) {
  if (!s || !s.d.length) return -1; const first = days[s.d[0]];
  if (s.d[0] < 5 || first <= filed) return -1;
  if ((Date.parse(first) - Date.parse(filed)) / 864e5 > 540) return -1;
  return 0;
}

// one trade: entry position e (buy its open) .. hold sessions, or an explicit last position x (sell its close)
export function tradeOf(s, e, hold, x = null) {
  if (e < 0 || e >= s.d.length) return null;
  const h = x === null ? hold : x - e + 1; if (!(h >= 1)) return null;
  const r = exitTrade(s, e, h); if (!r) return null;
  return { ...r, e, x: e + r.days - 1 };
}

// SPY over the same calendar sessions: open of the entry day to the close of the exit day
export function spyOver(spy, spyAt, di0, di1) {
  const a = spyAt.get(di0), b = spyAt.get(di1); if (a === undefined || b === undefined) return null;
  const o = spy.o[a], c = spy.c[b]; return o > 0 && c > 0 ? c / o - 1 : null;
}

// month-clustered t of the excess (one mean per entry month)
export function monthT(rows) {
  const m = new Map(); for (const r of rows) { const k = r.day.slice(0, 7); (m.get(k) || m.set(k, []).get(k)).push(r.ex); }
  const v = [...m.values()].map(a => a.reduce((x, y) => x + y, 0) / a.length); if (v.length < 3) return { months: v.length, t: null, avg: null };
  const mu = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length - 1));
  return { months: v.length, avg: mu, t: sd > 0 ? mu / sd * Math.sqrt(v.length) : null };
}

// rows: [{ di, day, sym, px, gross, spy }] -> full judgement
export function judge(rows, rule = {}) {
  const mk = (a, mult = 1) => a.map(r => ({ di: r.di, net: r.gross - costOf(r.px, mult), gross: r.gross, px: r.px }));
  const old = rows.filter(r => r.day < SPLIT), neu = rows.filter(r => r.day >= SPLIT);
  const all = stats(mk(rows)), older = stats(mk(old)), newer = stats(mk(neu)), at15 = stats(mk(rows, 1.5));
  const v = verdict(all, older, newer, at15, rule);
  const exr = (a) => a.filter(r => r.spy !== null).map(r => ({ day: r.day, ex: r.gross - r.spy }));
  const exAll = monthT(exr(rows)), exOld = monthT(exr(old)), exNew = monthT(exr(neu));
  const beats = exOld.avg > 0 && exNew.avg > 0 && exAll.t !== null && exAll.t >= 2.0;
  return { all, older, newer, at15, verdict: v.verdict, why: v.why, vsSpy: { all: exAll, older: exOld, newer: exNew, beats },
    winner: v.verdict === 'TRY SMALL' && beats };
}
