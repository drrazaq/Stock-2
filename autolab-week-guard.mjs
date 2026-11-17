// AUTOLAB WEEK GUARD (Agent A repair, 17 Nov 2026). Pure decision, used by autolab.mjs.
// WHY: on Sun 15 Nov the "Leaders fair test" ran twice. GitHub started the 06:00 UTC cron 7 hours late (13:17 UTC), after a
// manual run (11:50 UTC) had already finished, and autolab tested a second batch of 60 new rules for the same price week
// (week 2026-11-13: 120 rules). Extra tries only raise the luck bar, so no verdict was harmed, but one batch a week is the design.
// RULE: a new batch is due unless the last batch was for the SAME last session AND was made under 5 days ago.
// The 5-day clause keeps a stale price cache from blocking a real new week (25 Oct and 1 Nov both read week 2026-10-19).
// AUTO_FORCE=1 still forces a batch (a deliberate one-shot run). Live-paper scoring of earlier picks runs either way.
export const MIN_GAP_MS = 5 * 86400000;
export function batchDue(last, lastAt, week, now, force) {
  if (force) return true;
  if (!last || last.week !== week) return true;
  const at = Date.parse(lastAt || '');
  if (!isFinite(at)) return true;
  return now - at >= MIN_GAP_MS;
}
