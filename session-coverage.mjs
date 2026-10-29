import {marketSession} from './market-session.mjs';
// A complete session means every scheduled minute, including the closing minute
// bar (15:59 normally; 12:59 on reviewed half days). Gaps remain visible.
export function sessionCoverage(beat, day) {
  const s=day?marketSession(day):{closed:false,open:570,close:960};
  const expected=s.closed?0:s.close-s.open;
  const minutes = new Set((beat||[]).map(b => b?.m).filter(m => Number.isInteger(m) && !s.closed && m >= s.open && m < s.close));
  return { expectedMinutes: expected, observedMinutes: minutes.size, rate: expected?+(minutes.size / expected).toFixed(3):0, complete: expected>0 && minutes.size===expected };
}
