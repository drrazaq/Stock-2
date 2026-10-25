// AGENT A TARGETS STUDY CORE (A-TGT1; 25 Oct 2026; Stock-2). Pure functions, no network, no files. Used by agent-a-tgt-lab.mjs and
// test/agent-a-tgt-core.test.mjs. Long only; never places an order; never gives a halal ruling.
//
// THE QUESTION (owner, 20-21 Oct: "buy this, sell this, target reached, next"): on the live TRY SMALL rules that hold for months, does a
// PROFIT TARGET, a TRAILING STOP or a plain STOP from the buy beat the current exit (sell at the close of the fixed hold)?
//
// WHAT WAS ALREADY LEARNED (library, read before writing this): SQ20-X* (sell half / all on a +25% / +40% DAY while held: hurt on all 9
// live rules, do not adopt); SQ3-CUTRUN (cut at -8%, 50-day trail on a combined account: rejected); DEC2-X-* (stop / trail grid on the
// decoded breakout entries, live paper); HOLD-GETEVEN (sell 5-10% above the buy, no stop: not proven). NONE is a fixed % target, a
// trailing % stop or a stop from the buy on SQ11-PB12 / SQ6-MTUM / SQ6-QMOM. The SWITCH (sell stretched, buy back 10% lower) is itself an
// exit rule at tier 2 and is NOT re-tuned here (no adaptive levels on a live rule). T1 (6-month leaders) keeps no trade list in
// data/leaders-study.json; SQ6-MTUM (risk-adjusted 6 + 12 month leaders) stands in for "6-month leaders".
//
// PRE-REGISTERED 25 Oct 2026 BEFORE ANY RESULT WAS SEEN (one version each, ids A-TGT-<exit>-<base>; the lab writes the same text into
// data/strategy-library.json before computing anything). Each rule runs ONCE on the 5-year window; the first complete verdict is frozen
// in data/agent-a-tgt-lab.json firstRun (first-run.mjs freezeEach). No tuning on results; no second set of levels.
//
// BASES (rebuilt exactly as squad20-lab.mjs did; a base whose rebuilt count is not within 10% of its frozen count is NOT RUN):
//   PB12 = SQ11-PB12 hold 126 (block 63), the frozen trade list in data/squad11-lab.json; MTUM = SQ6-MTUM hold 126; QMOM = SQ6-QMOM hold 63
//   (both rebuilt with squad6-core mtumPick / qmomPick). Buy the open of the session after the signal close (px0 at session k); the
//   ORIGINAL exit = the close of session x = k + hold - 1 (a stock whose bars stop early: its last close, 'gone').
// EXITS (applied to the SAME trades; the time exit at x stays as the backstop):
//   TGT10 / TGT15 / TGT20: target L = px0 x (1 + p), p = 10% / 15% / 20%. The first session q, k <= q <= x, whose HIGH reaches L (no high
//     on that row: its close) -> sold at L, or at the OPEN of q when the stock opened at or above L (gap through the target). On the buy
//     day the open is px0 < L, so the sale is at L.
//   TRAIL10: trailing stop 10% under the highest CLOSE since the buy (the buy price counts as the first high): at the first close q,
//     k <= q < x, with close <= 0.90 x that high -> sold at the OPEN of q + 1 (no next bar and the stock is gone: that close).
//   STOP10 (Han, Zhou & Zhu, "Taming momentum crashes: a simple stop-loss strategy", 2016-18; a 10% stop from the BUY price, the money
//     then held in cash): at the first close q, k <= q < x, with close <= 0.90 x px0 -> sold at the OPEN of q + 1.
// COST 0.8% of the money per round trip (1.2% stress), unchanged by the exit. Halves by signal date (before / from 2024-01-01).
// JUDGED (the full standard, as squads 11 / 18 / 20, hold-core judgeHold): the changed rule's trades end at their new sale (yardstick =
//   the average liquid stock bought and sold at the same moments, capped +300%; the same stock held as long on its other days; SPY on
//   the same days) -> REJECTED / NOT PROVEN / TRADABLE SMALL / PROVEN.
// ADOPT (pre-registered; decides whether the exit should replace the current exit of that live rule), in BOTH halves:
//   (1) the exit fired on 10+ trades;
//   (2) SAME MONEY, SAME WINDOW: the average over ALL trades of (new result - original result) > 0, where after an early sale the money
//       earns 0% until the original sell date (one slot, no reinvestment: the owner's real case);
//   (3) the return per year of capital tied up (early sales free the money) is not below the base rule's.
//   Otherwise DO NOT ADOPT. An exit is never a buy signal.
export const COST = 0.008, STRESS = 0.012, SPLIT = '2024-01-01', YEAR = 252, REGISTERED = '2026-10-25';
export const r4 = (x) => x === null || x === undefined || !isFinite(x) ? null : +(+x).toFixed(4);
export const ok = (x) => typeof x === 'number' && isFinite(x);
export const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
export const sd = (a) => { if (a.length < 2) return null; const m = mean(a); return Math.sqrt(a.reduce((u, w) => u + (w - m) ** 2, 0) / (a.length - 1)); };
export const tStat = (a) => { const s = sd(a); return a.length >= 3 && s > 0 ? +(mean(a) / (s / Math.sqrt(a.length))).toFixed(2) : null; };
export const median = (a) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
export const halfOf = (d) => d < SPLIT ? 'older' : 'newer';

export const BASES = {
  PB12: { id: 'SQ11-PB12', hold: 126, block: 63,  name: 'Leader 12% pullback (SQ11-PB12)' },
  MTUM: { id: 'SQ6-MTUM',  hold: 126, block: 126, name: 'MSCI-style momentum (SQ6-MTUM)' },
  QMOM: { id: 'SQ6-QMOM',  hold: 63,  block: 63,  name: 'Quantitative momentum (SQ6-QMOM)' },
};
export const BASE_KEYS = Object.keys(BASES);
export const EXITS = {
  TGT10:   { kind: 'target', p: 0.10, label: 'sell at a +10% profit target' },
  TGT15:   { kind: 'target', p: 0.15, label: 'sell at a +15% profit target' },
  TGT20:   { kind: 'target', p: 0.20, label: 'sell at a +20% profit target' },
  TRAIL10: { kind: 'trail',  p: 0.10, label: 'trailing stop 10% under the highest close since the buy' },
  STOP10:  { kind: 'stop',   p: 0.10, label: 'stop 10% under the buy price (Han, Zhou & Zhu), then cash' },
};
export const EXIT_KEYS = Object.keys(EXITS);
export const ADOPT = { minFired: 10 };
export const SOURCES = { STOP10: ['https://alphaarchitect.com/2016/08/taming-the-momentum-roller-coaster-fact-or-fiction/', 'https://www.cxoadvisory.com/?p=25071'] };

const COMMON = 'Common (agent-a-tgt-core.mjs header, pre-registered 25 Oct 2026 before any run): the base rule rebuilt exactly as squad20-lab.mjs did (SQ11-PB12 from data/squad11-lab.json; SQ6-MTUM / SQ6-QMOM with squad6-core), buy the next open, the original exit = the close of the hold; the new exit applied to the SAME trades with the time exit kept as the backstop. Cost 0.8% (1.2% stress). Judged once (first complete run frozen in data/agent-a-tgt-lab.json firstRun) with hold-core judgeHold on both halves (signal before / from 2024-01-01). ADOPT only if in BOTH halves the exit fired on 10+ trades, the same-window average change over all trades (cash 0% after an early sale) is > 0, and the per-year return of capital is not below the base rule\'s.';
const CHECK = 'Library check 25 Oct 2026: SQ20-X* (sell on a +25% / +40% DAY: do not adopt), SQ3-CUTRUN (-8% cut + 50-day trail on an account: rejected), DEC2-X-* (stop / trail grid on breakout entries), HOLD-GETEVEN (sell 5-10% over the buy, no stop): none is a fixed % target, a % trailing stop or a % stop from the buy on SQ11-PB12 / SQ6-MTUM / SQ6-QMOM.';
export const RULES = {};
for (const b of BASE_KEYS) { const B = BASES[b]; for (const x of EXIT_KEYS) { const X = EXITS[x];
  RULES['A-TGT-' + x + '-' + b] = { base: b, exit: x, hold: B.hold, block: B.block, name: B.name + ', ' + X.label + ' (time exit at ' + B.hold + ' kept)',
    rule: B.id + ' trades (buy the next open). ' + (X.kind === 'target' ? 'Sell at buy x ' + (1 + X.p).toFixed(2) + ' on the first session whose high reaches it (at the open if the stock opened above it)'
      : X.kind === 'trail' ? 'Sell at the next open after a close 10% or more under the highest close since the buy (the buy price counts as the first high)'
      : 'Sell at the next open after a close 10% or more under the buy price (money then in cash)') + '; otherwise sell at the close of session ' + B.hold + '. Judged under the full standard; ADOPT only if, in both halves, it fired on 10+ trades, improved the same-window average over all trades (cash 0% after an early sale) and did not lower the per-year return of capital.',
    papers: SOURCES[x] }; } }
export const IDS = Object.keys(RULES);

// ---------------- the exits ----------------
// S = { o, h, c } arrays; tr = { k, x, px0 } (x = the original sell session, already capped at the stock's last bar); last = the stock's
// last session with a close; T = sessions in the data. Returns { q, px, how } (q = the sale session, px = the sale price) or null when the
// exit did not fire before / at the original sale.
export function targetExit(S, tr, p) { const L = tr.px0 * (1 + p);
  for (let q = tr.k; q <= tr.x; q++) { const o = S.o[q], h = S.h ? S.h[q] : NaN, c = S.c[q];
    if (q > tr.k && o > 0 && o >= L) return { q, px: o, how: 'gap over the target' };
    const top = h > 0 ? h : c; if (top > 0 && top >= L - 1e-12) return { q, px: L, how: 'target' }; }
  return null; }
// the next open after q (within the data); the stock gone after q: its close at q
function nextOpen(S, q, last, T) { for (let u = q + 1; u <= Math.min(T - 1, last); u++) if (S.o[u] > 0) return { q: u, px: S.o[u] }; if (last < T - 6) return { q, px: S.c[q] }; return null; }
export function trailExit(S, tr, p, last, T) { let hi = tr.px0;
  for (let q = tr.k; q < tr.x; q++) { const c = S.c[q]; if (!(c > 0)) continue; if (c <= hi * (1 - p) + 1e-12) { const n = nextOpen(S, q, last, T); return n ? { ...n, how: 'trail', at: q } : { open: true }; } if (c > hi) hi = c; }
  return null; }
export function stopExit(S, tr, p, last, T) { const lv = tr.px0 * (1 - p);
  for (let q = tr.k; q < tr.x; q++) { const c = S.c[q]; if (!(c > 0)) continue; if (c <= lv + 1e-12) { const n = nextOpen(S, q, last, T); return n ? { ...n, how: 'stop', at: q } : { open: true }; } }
  return null; }
export function applyExit(S, tr, exitKey, last, T) { const X = EXITS[exitKey];
  if (X.kind === 'target') return targetExit(S, tr, X.p); if (X.kind === 'trail') return trailExit(S, tr, X.p, last, T); return stopExit(S, tr, X.p, last, T); }

// ---------------- reporting and adoption ----------------
export function perYearOf(rows, key, cost) { const v = rows.filter(z => ok(z[key]) && z.days > 0); const y = v.reduce((a, z) => a + z.days / YEAR, 0); return v.length && y > 0 ? v.reduce((a, z) => a + z[key] - cost, 0) / y : null; }
// same-window comparison: rows { g (new, raw), base (original, raw), fired } -> over ALL trades
export function sameWindow(rows) { const v = rows.filter(z => ok(z.g) && ok(z.base)); if (!v.length) return { n: 0 }; const d = v.map(z => z.g - z.base), f = v.filter(z => z.fired);
  return { n: v.length, fired: f.length, newAvg: r4(mean(v.map(z => z.g - COST))), originalAvg: r4(mean(v.map(z => z.base - COST))), diff: r4(mean(d)), t: tStat(d),
    newMedian: r4(median(v.map(z => z.g - COST))), originalMedian: r4(median(v.map(z => z.base - COST))), newWorst: r4(Math.min(...v.map(z => z.g - COST))), originalWorst: r4(Math.min(...v.map(z => z.base - COST))),
    firedDiff: f.length ? r4(mean(f.map(z => z.g - z.base))) : null, firedBetter: f.length ? r4(f.filter(z => z.g > z.base + 1e-12).length / f.length) : null,
    newWin: r4(v.filter(z => z.g - COST > 0).length / v.length), originalWin: r4(v.filter(z => z.base - COST > 0).length / v.length) }; }
const pct = (x) => ok(x) ? (x >= 0 ? '+' : '') + (x * 100).toFixed(1) + '%' : 'n/a';
// sw = { older, newer } sameWindow(); py / basePy = { older, newer } per-year numbers
export function adoptExit(sw, py, basePy, A = ADOPT) { const why = [];
  for (const h of ['older', 'newer']) { const s = sw[h] || {};
    if (!(s.fired >= A.minFired)) why.push(h + ': fired on only ' + (s.fired || 0) + ' trades');
    if (!(ok(s.diff) && s.diff > 0)) why.push(h + ': same-window average change ' + pct(s.diff) + ' (not > 0)');
    if (!(ok(py[h]) && ok(basePy[h]) && py[h] >= basePy[h])) why.push(h + ': per year ' + pct(py[h]) + ' below the base ' + pct(basePy[h])); }
  return { adopt: !why.length, why: why.length ? why.join('; ') : 'fired on 10+ trades, improved the same-window average and kept the per-year return in both halves' }; }

// ---------------- library pre-registration (idempotent; before any computation) ----------------
export function preRegister(LB, today = REGISTERED) { if (!LB || !Array.isArray(LB.strategies)) return 0; let ch = 0;
  for (const [id, r] of Object.entries(RULES)) { if (LB.strategies.some(e => e.id === id)) continue;
    LB.strategies.push({ id, family: 'Targets and trailing exits on the live rules (Agent A, A-TGT1)', name: r.name, explain: 'RULE: ' + r.rule + ' ' + COMMON, status: 'pre-registered ' + today + ' (Agent A); 5-year one-shot pending',
      agent: 'A', registered: today, hold: r.hold, kind: 'exit', libraryCheck: CHECK, sources: r.papers || undefined,
      note: 'Pre-registered ' + today + ' BEFORE any run (agent-a-tgt-core.mjs = the exact rule; one version). 5-year one-shot by agent-a-tgt-lab.mjs, first complete verdict frozen; an exit overlay (no buy signal), adoption decided by the pre-registered test.' }); ch++; }
  if (ch) LB.updated = today; return ch; }
