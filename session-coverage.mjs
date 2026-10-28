// Session coverage is judged against the full 09:30–15:00 NY window, never just elapsed runtime.
export function sessionCoverage(beat) {
  const minutes = new Set(beat.map(b => b.m).filter(m => Number.isInteger(m) && m >= 570 && m < 900));
  const first = [...minutes].some(m => m <= 575);
  const last = [...minutes].some(m => m >= 895);
  return { expectedMinutes: 330, observedMinutes: minutes.size, rate: +(minutes.size / 330).toFixed(3), complete: first && last && minutes.size >= 315 };
}
