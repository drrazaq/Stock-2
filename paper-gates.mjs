// Fail-closed paper-performance gates for research alerts.
// Missing stress or no-top-two results are not evidence of profitability.
const positive = x => typeof x === 'number' && Number.isFinite(x) && x > 0;
export function paperRecordApproved(r, liveOnly = false) {
  if (!r || !Number.isInteger(r.n) || r.n < (liveOnly ? 60 : 30)) return false;
  if (!positive(r.avg) || !positive(r.stress) || !positive(r.noTop2)) return false;
  return !liveOnly || (Number.isFinite(r.days) && r.days >= 30 && Number.isFinite(r.stocks) && r.stocks >= 20 && positive(r.pf) && r.pf >= 1.2);
}
export function earlyPaperEligible(r) {
  return !!r && Number.isInteger(r.n) && r.n >= 20 && positive(r.avg) && positive(r.stress) && positive(r.noTop2);
}
