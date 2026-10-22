// RUN ONCE AS WRITTEN (shared helper; imported, not run by a workflow). A pre-registered study is judged ONCE: its first complete
// verdict is stored in `firstRun` and no later run may overwrite it. Later runs write `latest`, which is monitoring on newer data,
// clearly labelled, and never a new verdict; the library reads firstRun only. Used by regime-gate, insider-study, chain-ripple,
// events-study, tip-score and event-orb-retest-gates (22 Oct 2026), the same pattern ew-stack/orb-study/quality B-FS2 already use.
export const MONITOR_LABEL = 'MONITORING ONLY: a later run on newer data. It is NOT a new verdict and changes nothing; the verdict is firstRun (frozen at the first complete run, never overwritten).';
const now = () => new Date().toISOString();
// Whole study: keep the previous firstRun; else freeze this run if it is complete; else null (no verdict yet, keep trying).
export function freezeFirst(prev, thisRun, complete) {
  if (prev && prev.firstRun && typeof prev.firstRun === 'object') return prev.firstRun;
  return complete ? { ...thisRun, frozenAt: now() } : null;
}
// Per version (results keyed by version name): a version already in firstRun keeps its frozen result; a version seen for the first
// time (or judged for the first time, when isJudged says so) is added once with its own frozenAt. Nothing is ever replaced.
export function freezeEach(prevFirst, results, isJudged = () => true) {
  const out = { ...(prevFirst || {}) }, at = now();
  for (const [k, r] of Object.entries(results || {})) if (!(k in out) && isJudged(r)) out[k] = { ...r, frozenAt: at };
  return out;
}
export const latestBlock = (thisRun) => ({ label: MONITOR_LABEL, ...thisRun });
