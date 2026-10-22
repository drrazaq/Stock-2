// SEC FILING TIMES -> NEW YORK CLOCK AND TRADING SESSION (shared helper; imported, not run by a workflow).
// EDGAR's acceptanceDateTime is UTC (it ends in "Z"). Until 22 Oct 2026 events-study.mjs stored it cut to the minute WITHOUT the
// "Z" ('YYYY-MM-DDTHH:MM') and five modules read that clock time as New York time, which moved noon-to-close filings and
// 05:30-09:30 pre-market filings to the wrong session. Formats accepted here:
//   'YYYY-MM-DDTHH:MMZ' or any ISO string with Z / +hh:mm / -hh:mm   -> that exact moment
//   'YYYY-MM-DDTHH:MM' (no zone)                                      -> UTC (the legacy EDGAR cut; the ev-cache still holds these)
//   'YYYY-MM-DD'                                                      -> a date only (US date, e.g. SEC filing date, FDA approval date)
// Session rule (New York clock): before 09:30 -> that day's session (the public knows it before the open);
// 09:30 to 15:59 -> that day's session reacts, a trade enters at the NEXT open; 16:00 or later -> the NEXT session.
const NYF = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function nyParts(ms) { const p = Object.fromEntries(NYF.formatToParts(new Date(ms)).map(x => [x.type, x.value])); return { d: p.year + '-' + p.month + '-' + p.day, hm: p.hour + ':' + p.minute }; }
// p -> { d: New York date, hm: 'HH:MM' New York or null for a date-only value, ms: UTC milliseconds or null } ; null if unreadable
export function secNY(p) {
  const s = String(p || '').trim(); if (!/^\d{4}-\d\d-\d\d/.test(s)) return null;
  if (s.length === 10) return { d: s, hm: null, ms: null };
  const zoned = /(Z|[+-]\d\d:?\d\d)$/.test(s), ms = Date.parse(zoned ? s : s.slice(0, 16) + ':00Z'); if (!isFinite(ms)) return { d: s.slice(0, 10), hm: null, ms: null };
  return { ...nyParts(ms), ms };
}
// 'before' (pre-market, < 09:30), 'during' (09:30-15:59), 'after' (>= 16:00), or null for a date-only value
export const secPhase = (p) => { const x = secNY(p); return !x || !x.hm ? null : x.hm < '09:30' ? 'before' : x.hm < '16:00' ? 'during' : 'after'; };
// New York local time with its UTC offset, e.g. '2026-10-21T08:05-04:00': slice(0, 10) is the New York date, Date.parse reads it exactly
export function nyStamp(p) { const x = secNY(p); if (!x || !x.hm) return x ? x.d : null;
  const off = Math.round((Date.parse(x.d + 'T' + x.hm + ':00Z') - Math.floor(x.ms / 60000) * 60000) / 60000), a = Math.abs(off);
  return x.d + 'T' + x.hm + (off < 0 ? '-' : '+') + String(Math.floor(a / 60)).padStart(2, '0') + ':' + String(a % 60).padStart(2, '0'); }
