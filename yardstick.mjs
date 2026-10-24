// YARDSTICK (engine audit 24 Oct 2026, bug AUD-1). Pure helpers, no network, no files; test/audit-engines.test.mjs.
// The labs' average-stock yardstick (and the same-stock-other-days yardstick) dropped every stock whose gross return over the window was
// +300% or more (|g| < 3), while the strategy's own trades were never capped. The yardstick and the strategy must treat big winners the
// same way. Modes:
//   'asFrozen'  the old rule, kept only to reproduce the frozen first runs: yardstick drops |g| >= 3, trades uncapped.
//   'capBoth'   THE CORRECTED RULE: every gross return, trade and yardstick stock alike, is capped at +300% (winsorised, never dropped;
//               the cap stays as a guard against a bad price row such as an unadjusted reverse split).
//   'raw'       no cap on either side (sensitivity only).
export const CAP = 3, MODES = ['asFrozen', 'capBoth', 'raw'];
const ok = (x) => typeof x === 'number' && isFinite(x);
export const capG = (g) => ok(g) ? Math.min(g, CAP) : g;
// the strategy's gross return as the yardstick of the same mode treats it
export const tradeG = (g, mode) => mode === 'capBoth' ? capG(g) : g;
// add one yardstick stock's gross return to v
export function yardPush(v, g, mode = 'asFrozen') { if (!ok(g)) return; if (mode === 'asFrozen') { if (Math.abs(g) < CAP) v.push(g); return; } v.push(mode === 'capBoth' ? capG(g) : g); }
// the mean of v, null under minN values (the labs' 50-stock minimum)
export const yardMean = (v, minN = 50) => v.length >= minN ? v.reduce((a, b) => a + b, 0) / v.length : null;

// ---- the corrected-run entry (written next to the frozen firstRun; first-run.mjs effectiveRuns reads it) ----
export const AUDIT = {
  'AUD-1': 'The average-stock yardstick (and the same-stock-other-days yardstick) dropped every stock that gained +300% or more over the window, while the rule\'s own trades were not capped: the yardstick was lower than the real average stock. Corrected: every gross return, the rule\'s and the yardstick\'s, capped at +300% the same way (winsorised, nothing dropped). Same window, entries, exits and costs as the frozen run.',
  'AUD-2': 'ANOM-SUESURGE only: the top-30% revenue-surprise cut-off also counted surprises from SEC filings made after the trade was bought (look-ahead in the threshold). Corrected: only filings public by the entry session count.',
};
const brief = (h) => h && h.n ? { n: h.n, days: h.days, blocks: h.blocks, avg: h.avg, avgStress: h.avgStress, ctrl: h.ctrl, edge: h.edge, vsOwn: h.vsOwn, noTop2: h.noTop2, tBlock: h.tBlock, best: h.best } : { n: 0 };
// the asFrozen recomputation matches the frozen numbers (same data, same engine) within rounding
export function sameHalf(a, b, tol = 5e-4) { if (!a || !b) return false; if ((a.n || 0) !== (b.n || 0)) return false; for (const k of ['avg', 'edge', 'ctrl', 'noTop2']) { const x = a[k], y = b[k]; if (x === null && y === null) continue; if (!(Math.abs(x - y) <= tol)) return false; } return true; }
// frozen = the firstRun entry; fixed / asFrozen / raw = { verdict, why, R: { older, newer, all } } of the three modes
export function correctedEntry({ frozen, fixed, asFrozen, raw, bugs, window, extra = {} }) {
  const rep = ['older', 'newer'].every(h => sameHalf(frozen.results && frozen.results[h], asFrozen.R[h]));
  return { at: new Date().toISOString(), bugs, explanation: bugs.map(b => b + ': ' + AUDIT[b]).join(' '), window, frozenAt: frozen.frozenAt || frozen.at || null, bar: frozen.bar ?? null,
    verdict: fixed.verdict, why: fixed.why, results: fixed.R, ...extra,
    reproduced: { matchesFrozen: rep, note: rep ? 'the old engine on this run\'s data gives the frozen numbers: the change is the fix alone' : 'the old engine on this run\'s data does NOT give the frozen numbers exactly (data refreshed since the freeze); compare corrected with this reproduction, not with the frozen numbers', verdict: asFrozen.verdict, older: brief(asFrozen.R.older), newer: brief(asFrozen.R.newer) },
    noCapEitherSide: { note: 'sensitivity only: no cap on the rule or the yardstick', verdict: raw.verdict, older: brief(raw.R.older), newer: brief(raw.R.newer) } };
}
