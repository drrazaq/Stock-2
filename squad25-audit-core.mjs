// SQUAD 25 AUDIT CORE (27 Oct 2026; Stock-2 label audit): what kind of "new holding" each SQ25-GIANTSTAKE event really is.
// Pure functions, no network, no files. Used by squad25-lab.mjs MODE=AUDIT (the ONE corrected re-run) and its forward paper lane, and by
// test/squad25-audit-core.test.mjs. Never places an order.
//
// ================= PRE-REGISTERED 27 Oct 2026, WRITTEN BEFORE ANY CORRECTED RETURN WAS COMPUTED OR LOOKED AT =========================
// WHY (outside reviewer, confirmed by the lead): 36 of the 61 older-half SQ25-GIANTSTAKE trades come from Alphabet 13F-HR filings accepted on
// ONE evening (2022-11-14, CIK 1652044): a batch of catch-up filings, the first 13Fs ever filed under that CIK. A holding that is "new"
// against a filing accepted minutes earlier the same evening (or against nothing at all) is FIRST OBSERVED, NO BASELINE: nobody could see
// a purchase; the market saw a portfolio for the first time. The same applies to every giant's first 13F (NVIDIA Feb 2024, Qualcomm Feb
// 2022 in our data) and to holdings that only look new because an amendment / confidential treatment hid them before.
// CLASSES (each event gets exactly one):
//   13F-HR events (f = the event filing of CIK c; "earlier" = c's 13F-HR or 13F-HR/A accepted on an EARLIER CALENDAR DAY, New York clock):
//   1 FIRST_OBSERVED_NO_BASELINE: no earlier 13F of c exists in the data (13F filings since 2019-01-01: the lab's set), OR none of the earlier
//     ones covers the quarter right before f's period (a gap: no baseline for that quarter). Same-day batches count as no baseline.
//   2 LATE_FILING: f was accepted more than 75 calendar days after its period end (the deadline is 45): it reports an old portfolio, so a
//     "new" holding is stale news. (Checked after class 1.)
//   3 AMENDED_OR_CONFIDENTIAL: a 13F-HR/A of c for the previous quarter (accepted at ANY time, before or after f) lists the issuer: the
//     stake was held before and only hidden (confidential treatment) or left out and amended in.
//   4 NEW_POSITION_CONFIRMED: an earlier-day 13F of c for the previous quarter exists, f is on time, and no filing of c for that quarter
//     (original or amendment) lists the issuer.
//   13D / 13G events (the lab's dgEvents: originals, and an amendment only when it is the group's first filing on that subject):
//   5 13D/13G_FIRST: an ORIGINAL SC 13D / SC 13G / SCHEDULE 13D / 13G that is the giant group's first 13D/13G on that subject in EDGAR (2013 on).
//   3 AMENDED_OR_CONFIDENTIAL: an amendment that is the group's first filing on the subject (the original predates EDGAR full text / another
//     CIK: the stake was already public).
//   6 13D/13G_REPEAT: an original that is NOT the group's first filing on that subject (the stake was public before).
// COUNTED (the corrected rule): NEW_POSITION_CONFIRMED and 13D/13G_FIRST only. Everything else is dropped and reported with its count.
// THE ONE CORRECTED RUN (squad25-lab.mjs MODE=AUDIT -> data/squad25-lab.json correctedRun; firstRun is never touched): the frozen event
//   set and every frozen filter / entry / exit / cost / yardstick / bar unchanged, kept only for COUNTED classes; the same window as the
//   frozen run (to its last session); SQ25-GIANTSTAKE-A and -B. Case counts per half are reported FIRST; a half under 20 cases = TOO FEW
//   CASES (said plainly). As pre-registered in squad25-core, the WIDE fallback (SQ25-GIANTWIDE-A / -B, same classes) is judged only for an
//   entry version whose corrected BASE rule is TOO FEW CASES; otherwise it is information only. Run once; the bar is never lowered.
export const CLASSES = ['NEW_POSITION_CONFIRMED', '13D/13G_FIRST', 'FIRST_OBSERVED_NO_BASELINE', 'LATE_FILING', 'AMENDED_OR_CONFIDENTIAL', '13D/13G_REPEAT'];
export const COUNTED = ['NEW_POSITION_CONFIRMED', '13D/13G_FIRST'];
export const LATE_DAYS = 75;
const day = (accept) => String(accept || '').slice(0, 8);                         // 'YYYYMMDD' (New York clock, as in the EDGAR header)
const isoOf = (d8) => d8.slice(0, 4) + '-' + d8.slice(4, 6) + '-' + d8.slice(6, 8);
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
// the quarter end before a period end 'YYYY-MM-DD' (e.g. 2024-03-31 -> 2023-12-31)
export function prevQuarterEnd(p) { const y = +p.slice(0, 4), m = +p.slice(5, 7); return new Date(Date.UTC(y, m - 3, 0)).toISOString().slice(0, 10); }
// ev = { adsh, cusip6 | cusip }; filings = all 13F-HR and 13F-HR/A of the SAME CIK: [{ adsh, form, accept, period, issuers: Map|Set of cusip6 }]
// -> { cls, why }
export function classify13F(ev, filings) { const fl = (filings || []).filter(g => g && g.accept), f = fl.find(g => g.adsh === ev.adsh), c6 = String(ev.cusip6 || ev.cusip || '').slice(0, 6).toUpperCase();
  if (!f) return { cls: 'FIRST_OBSERVED_NO_BASELINE', why: 'event filing not in the data' };
  const has = (g) => g.issuers && (g.issuers.has ? g.issuers.has(c6) : false), d = day(f.accept), earlier = fl.filter(g => day(g.accept) < d);
  if (!earlier.length) return { cls: 'FIRST_OBSERVED_NO_BASELINE', why: 'no 13F of this filer accepted on an earlier day (first 13F, or a same-day batch)' };
  if (f.period && daysBetween(f.period, isoOf(d)) > LATE_DAYS) return { cls: 'LATE_FILING', why: 'accepted ' + daysBetween(f.period, isoOf(d)) + ' days after its period end ' + f.period };
  if (!f.period) return { cls: 'FIRST_OBSERVED_NO_BASELINE', why: 'no period of report' };
  const pq = prevQuarterEnd(f.period), base = earlier.filter(g => g.period === pq);
  if (!base.length) return { cls: 'FIRST_OBSERVED_NO_BASELINE', why: 'no earlier-day 13F for the previous quarter ' + pq };
  const amendPrev = fl.filter(g => g.period === pq && /\/A$/.test(g.form || ''));
  if (amendPrev.some(has)) return { cls: 'AMENDED_OR_CONFIDENTIAL', why: 'listed in a 13F-HR/A for ' + pq };
  if (base.some(has)) return { cls: 'AMENDED_OR_CONFIDENTIAL', why: 'already held in ' + pq };
  return { cls: 'NEW_POSITION_CONFIRMED', why: 'not held in the on-record 13F for ' + pq }; }
// ev = { kind / form, firstOnSubject } -> { cls, why }
export function classifyDG(ev) { const form = String(ev.form || ev.kind || ''); if (/\/A$/.test(form)) return { cls: 'AMENDED_OR_CONFIDENTIAL', why: 'an amendment is the first filing on the subject (stake public before)' };
  return ev.firstOnSubject ? { cls: '13D/13G_FIRST', why: 'the group\'s first 13D/13G on this subject' } : { cls: '13D/13G_REPEAT', why: 'not the group\'s first 13D/13G on this subject' }; }
export const classifyEvent = (ev, filingsOfCik) => /^13F/.test(String(ev.kind || '')) ? classify13F(ev, filingsOfCik) : classifyDG(ev);
export const counted = (cls) => COUNTED.includes(cls);
