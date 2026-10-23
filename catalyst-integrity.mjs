// Catalyst date-integrity and impact-evidence helpers. Research only: never creates orders.
// Unknown/approximate event dates are never silently converted into a tradable exact date.

export function parseEventDatePrecision(value, declaredPrecision = null) {
  const s = String(value ?? '').trim();
  const p = String(declaredPrecision ?? '').toLowerCase();
  const exactShape = /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (exactShape) {
    const d = new Date(s + 'T00:00:00Z');
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && (!p || ['day','exact','date'].includes(p)))
      return { precision: 'DAY', date: s, eligibleForRunup: true, reason: 'exact calendar day supplied' };
  }
  const month = s.match(/^(\d{4})-(\d{2})$/);
  if (month && +month[2] >= 1 && +month[2] <= 12)
    return { precision: 'MONTH', date: null, periodStart: `${month[1]}-${month[2]}-01`, eligibleForRunup: false, reason: 'month-only date; do not substitute its first day' };
  const q = s.match(/^(\d{4})\s*[- ]?Q([1-4])$/i) || s.match(/^Q([1-4])\s+(\d{4})$/i);
  if (q) {
    const year = q[2] && q[2].length === 4 ? q[2] : q[1];
    const quarter = q[2] && q[2].length === 4 ? q[1] : q[2];
    const monthNum = (Number(quarter) - 1) * 3 + 1;
    return { precision: 'QUARTER', date: null, periodStart: `${year}-${String(monthNum).padStart(2,'0')}-01`, eligibleForRunup: false, reason: 'quarter-only date; no exact event day known' };
  }
  if (/\b(first|second|third|fourth) quarter\b|\bQ[1-4]\b|\b(first|second) half\b|\bH[12]\b|\b(by|during|in)\s+(late\s+)?(20\d{2}|Q[1-4])\b/i.test(s) || ['month','quarter','half','year','approximate','estimated'].includes(p))
    return { precision: p.toUpperCase() || 'PERIOD', date: null, eligibleForRunup: false, reason: 'approximate period; do not invent a date' };
  return { precision: 'UNKNOWN', date: null, eligibleForRunup: false, reason: 'date precision cannot be established' };
}

// Caller must pass the event-date information that was publicly known as of planned entry.
export function checkRunupEligibility({ announcedAt, entryAt, eventDate, datePrecision, plannedExitAt, actualOutcomeAt = null }) {
  const parsed = parseEventDatePrecision(eventDate, datePrecision);
  if (!parsed.eligibleForRunup) return { eligible: false, code: 'DATE_NOT_EXACT', ...parsed };
  const announced = Date.parse(announcedAt || ''), entry = Date.parse(entryAt || ''), exit = Date.parse(plannedExitAt || '');
  if (![announced, entry, exit].every(Number.isFinite)) return { eligible: false, code: 'BAD_TIMESTAMPS', reason: 'announcement, entry, and planned exit timestamps are required' };
  if (announced > entry) return { eligible: false, code: 'DATE_NOT_KNOWN_AT_ENTRY', reason: 'event date was not public by planned entry' };
  if (!(exit < Date.parse(parsed.date + 'T00:00:00Z'))) return { eligible: false, code: 'EXIT_NOT_BEFORE_EVENT', reason: 'planned exit is not before the known event date' };
  const actual = actualOutcomeAt ? Date.parse(actualOutcomeAt) : NaN;
  const exitExposure = Number.isFinite(actual) && actual <= exit;
  return { eligible: true, code: exitExposure ? 'EVENT_BEFORE_PLANNED_EXIT' : 'ELIGIBLE_EXACT_DATE', precision: parsed.precision, eventDate: parsed.date,
    eventBeforePlannedExit: exitExposure,
    reason: exitExposure ? 'event actually occurred before planned exit; must be modelled as event exposure, not a clean pre-event exit' : 'exact date was public before entry and planned exit precedes scheduled event' };
}

const num = (x) => Number.isFinite(Number(x)) ? Number(x) : null;
// Structured evidence gate for the NEW value-change hypothesis. Missing data never receives a passing default.
export function assessCatalystImpact(e = {}) {
  const blockers = [], evidence = [];
  const kind = String(e.eventKind || '').toLowerCase();
  const approvedKinds = ['pivotal_trial_success','first_or_core_product_approval','material_partnership_upfront','material_contract'];
  if (!approvedKinds.includes(kind)) blockers.push('event is not one of the pre-registered material event types');
  if (!e.publicAt || !e.sourceUrl || e.verifiedPrimarySource !== true) blockers.push('event lacks a verified primary source and public timestamp');
  if (e.isGenuinelyNew !== true) blockers.push('novelty versus previously public information is not established');
  const runway = num(e.cashRunwayMonths);
  if (runway === null) blockers.push('cash runway is missing'); else if (runway < 12) blockers.push('cash runway is under 12 months'); else evidence.push('cash runway >= 12 months');
  const mcap = num(e.marketCapUsd), upfront = num(e.upfrontPaymentUsd), annualRevenue = num(e.annualRevenueUsd), contractValue = num(e.contractValueUsd);
  const value = upfront !== null ? upfront : contractValue;
  const ratioBase = mcap !== null && mcap > 0 ? mcap : null;
  const impactToCap = value !== null && ratioBase ? value / ratioBase : null;
  const impactToRevenue = value !== null && annualRevenue !== null && annualRevenue > 0 ? value / annualRevenue : null;
  if (value === null || (impactToCap === null && impactToRevenue === null)) blockers.push('quantified economic value and a valid scale denominator are missing');
  else if (!((impactToCap !== null && impactToCap >= 0.05) || (impactToRevenue !== null && impactToRevenue >= 0.25))) blockers.push('stated economic value is below pre-registered materiality (5% of market cap or 25% of annual revenue)');
  else evidence.push('quantified value clears materiality threshold');
  if (e.shareSaleWithin30Days !== false) blockers.push('no-share-sale-in-last-30-days gate not verified'); else evidence.push('no share sale in prior 30 days');
  if (e.badClinicalOrRegulatoryEvidence === true) blockers.push('negative clinical/regulatory evidence present');
  if (e.competitorContextVerified !== true) blockers.push('competitor/standard-of-care context not verified');
  if (e.priceReactionMeasured !== true) blockers.push('post-news price reaction/remaining opportunity not measured');
  return { status: blockers.length ? 'RESEARCH_ONLY_NOT_ELIGIBLE' : 'ELIGIBLE_FOR_FROZEN_BACKTEST_ONLY', blockers, evidence,
    metrics: { impactToMarketCap: impactToCap, impactToAnnualRevenue: impactToRevenue },
    note: 'Eligibility means only that a case may enter a frozen historical study. It is not a buy recommendation or proof of edge.' };
}
