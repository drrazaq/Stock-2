import assert from 'node:assert/strict';
import {
  EVENT_ORB_RETEST_RULE_HASH,
  appendPaperLedger,
  buildEventOrbRetestPlan,
  validatePrimaryEvent,
} from '../event-orb-retest-core.mjs';

const base = Date.UTC(2026, 0, 5, 14, 30); // Monday 09:30 New York
const bar = (i, o, h, l, c, v = 1000) => ({ t: base + i * 5 * 60_000, o, h, l, c, v, vw: c });
const event = {
  eventId: 'evt-1', sym: 'TEST', kind: 'verified_contract', sourceUrl: 'https://issuer.example/evt-1',
  verificationStatus: 'VERIFIED_PRIMARY_CONTENT', tradableUniverseVerified: true, blocked: false,
  publishedAt: new Date(base - 10 * 60_000).toISOString(),
  capturedAt: new Date(base - 9 * 60_000).toISOString(),
  availableAt: new Date(base - 5 * 60_000).toISOString(),
};
const validBars = [
  bar(0, 10, 10.20, 9.90, 10.15),
  bar(1, 10.15, 10.30, 10.05, 10.25),
  bar(2, 10.25, 10.40, 10.10, 10.35), // opening trigger=10.40, stop=9.90
  bar(3, 10.41, 10.42, 10.39, 10.41), // retest: close above trigger and low within 0.2%
  bar(4, 10.42, 10.55, 10.41, 10.52), // confirmation above retest high / VWAP
  bar(5, 10.52, 10.55, 10.50, 10.53),
  bar(6, 10.53, 10.56, 10.51, 10.54),
  bar(7, 10.54, 10.57, 10.52, 10.55),
  bar(8, 10.45, 10.70, 10.44, 10.65), // delayed entry at 10:10 New York
];
const asOf = new Date(base + 12 * 5 * 60_000).toISOString();

const checked = validatePrimaryEvent(event);
assert.equal(checked.ok, true);
assert.equal(EVENT_ORB_RETEST_RULE_HASH.length, 64);
assert.equal(validatePrimaryEvent({ ...event, availableAt: '2026-01-05T14:25:00' }).reason, 'missing_or_invalid_event_timestamps');
const plan = buildEventOrbRetestPlan({ event, bars: validBars, asOf });
assert.equal(plan.status, 'PAPER_PLAN_ONLY');
assert.equal(plan.allowBuy, false);
assert.equal(plan.setupId, 'EVENT_ORB_RETEST_15D_V1');
assert.equal(plan.plan.entryReference, 10.45);
assert.ok(plan.plan.stop < plan.plan.entryReference && plan.plan.target > plan.plan.entryReference);

// A confirmation bar not yet available under the explicit 15-minute delay cannot create a plan.
const delayed = buildEventOrbRetestPlan({ event, bars: validBars, asOf: new Date(base + 11 * 5 * 60_000).toISOString() });
assert.equal(delayed.status, 'REJECTED');
assert.equal(delayed.reason, 'bar_not_observable_by_as_of');

// A stop break before the retest invalidates the paper setup.
const broken = buildEventOrbRetestPlan({ event, bars: validBars.map((b, i) => i === 3 ? { ...b, l: 9.80 } : b), asOf });
assert.equal(broken.status, 'REJECTED');
assert.equal(broken.reason, 'stop_invalidated_before_retest');

const duplicate = buildEventOrbRetestPlan({ event, bars: [...validBars, { ...validBars[0] }], asOf });
assert.equal(duplicate.status, 'REJECTED');
assert.equal(duplicate.reason, 'duplicate_or_invalid_bar');

// Re-observing the same plan cannot rewrite its immutable original plan hash.
const conflictPlan = { ...plan, planHash: 'a'.repeat(64) };
const ledger = appendPaperLedger(null, [plan], { TEST: validBars }, asOf);
const updated = appendPaperLedger(ledger, [conflictPlan], { TEST: validBars }, asOf);
assert.equal(updated.records.length, 1);
assert.equal(updated.records[0].planHash, plan.planHash);
assert.equal(updated.records[0].history.some(x => x.type === 'PLAN_HASH_CONFLICT'), true);
assert.equal(updated.allowBuy, false);

console.log('event ORB retest validation passed');
