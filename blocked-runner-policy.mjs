// Counterfactual safety-filter policy for the missed-runner autopsy.
// This decides whether the sample supports KEEP, REVIEW, or UNRESOLVED; it never loosens a safety gate automatically.
export const BLOCKED_RUNNER_MIN_N = 30;
export const BLOCKED_RUNNER_FADE_BAR = 0.55;

export function blockedRunnerPolicy({ blockedIsLargest, sampleN = 0, fadeShare = null }) {
  if (!blockedIsLargest) return { branch: 'NOT_APPLICABLE', reason: 'blocked runners are not the largest miss category' };
  if (!Number.isFinite(sampleN) || sampleN < BLOCKED_RUNNER_MIN_N || !Number.isFinite(fadeShare)) {
    return {
      branch: 'BLOCKS_UNRESOLVED',
      reason: `only ${Number.isFinite(sampleN) ? sampleN : 0} valid 5-session outcomes; need ${BLOCKED_RUNNER_MIN_N}. Keep current protections; collect more matched outcomes.`,
    };
  }
  if (fadeShare >= BLOCKED_RUNNER_FADE_BAR) {
    return {
      branch: 'KEEP_BLOCKS',
      reason: `${Math.round(fadeShare * 100)}% of the blocked-runner sample faded over the next 5 sessions (bar ${Math.round(BLOCKED_RUNNER_FADE_BAR * 100)}%); retain protections, then review each block type separately.`,
    };
  }
  return {
    branch: 'BLOCKS_NEED_REVIEW',
    reason: `${Math.round(fadeShare * 100)}% faded over the next 5 sessions, below the ${Math.round(BLOCKED_RUNNER_FADE_BAR * 100)}% bar. Do not remove protections wholesale; inspect each block reason against matched forward outcomes.`,
  };
}
