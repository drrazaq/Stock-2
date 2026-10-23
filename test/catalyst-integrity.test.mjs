import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEventDatePrecision, checkRunupEligibility, assessCatalystImpact } from '../catalyst-integrity.mjs';

test('exact day is accepted only as an exact day', () => {
  assert.equal(parseEventDatePrecision('2026-12-03').eligibleForRunup, true);
  assert.equal(parseEventDatePrecision('2026-12').eligibleForRunup, false);
  assert.equal(parseEventDatePrecision('2026-Q4').eligibleForRunup, false);
  assert.equal(parseEventDatePrecision('Q4 2026').eligibleForRunup, false);
  assert.equal(parseEventDatePrecision('results expected in Q4').eligibleForRunup, false);
});

test('month-only event never becomes first-of-month trade date', () => {
  const r = parseEventDatePrecision('2024-11');
  assert.equal(r.date, null); assert.equal(r.periodStart, '2024-11-01'); assert.equal(r.eligibleForRunup, false);
});

test('exact event date must have been public before entry', () => {
  const r = checkRunupEligibility({announcedAt:'2026-10-20T12:00:00Z', entryAt:'2026-10-21T13:30:00Z', eventDate:'2026-11-20', datePrecision:'DAY', plannedExitAt:'2026-11-18T20:00:00Z'});
  assert.equal(r.code, 'ELIGIBLE_EXACT_DATE');
  const late = checkRunupEligibility({announcedAt:'2026-10-22T12:00:00Z', entryAt:'2026-10-21T13:30:00Z', eventDate:'2026-11-20', datePrecision:'DAY', plannedExitAt:'2026-11-18T20:00:00Z'});
  assert.equal(late.code, 'DATE_NOT_KNOWN_AT_ENTRY');
});

test('early actual event is explicitly flagged as event exposure', () => {
  const r = checkRunupEligibility({announcedAt:'2024-10-01T12:00:00Z', entryAt:'2024-10-02T13:30:00Z', eventDate:'2024-12-01', datePrecision:'DAY', plannedExitAt:'2024-11-27T20:00:00Z', actualOutcomeAt:'2024-11-25T12:00:00Z'});
  assert.equal(r.eligible, true); assert.equal(r.eventBeforePlannedExit, true); assert.equal(r.code, 'EVENT_BEFORE_PLANNED_EXIT');
});

test('value-change gate fails closed on missing runway, novelty, share-supply or competitor evidence', () => {
  const r = assessCatalystImpact({eventKind:'pivotal_trial_success', publicAt:'2026-01-01T12:00:00Z', sourceUrl:'https://sec.gov/test', verifiedPrimarySource:true, isGenuinelyNew:true, cashRunwayMonths:18, marketCapUsd:100000000, upfrontPaymentUsd:10000000, shareSaleWithin30Days:false, competitorContextVerified:true, priceReactionMeasured:true});
  assert.equal(r.status, 'ELIGIBLE_FOR_FROZEN_BACKTEST_ONLY');
  const bad = assessCatalystImpact({eventKind:'pivotal_trial_success'});
  assert.equal(bad.status, 'RESEARCH_ONLY_NOT_ELIGIBLE'); assert.ok(bad.blockers.length >= 6);
});

test('materiality requires quantified value to be meaningful relative to scale', () => {
  const base = {eventKind:'material_partnership_upfront', publicAt:'2026-01-01T12:00:00Z', sourceUrl:'https://sec.gov/test', verifiedPrimarySource:true, isGenuinelyNew:true, cashRunwayMonths:18, marketCapUsd:1000000000, upfrontPaymentUsd:1000000, shareSaleWithin30Days:false, competitorContextVerified:true, priceReactionMeasured:true};
  assert.ok(assessCatalystImpact(base).blockers.includes('stated economic value is below pre-registered materiality (5% of market cap or 25% of annual revenue)'));
});
