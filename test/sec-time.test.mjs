// SEC acceptance times are UTC: check the New York session mapping used by events-study, ew-stack, fulfilling, octopus,
// sequence-study and missed-runners (sec-time.mjs). Run: node test/sec-time.test.mjs
import assert from 'node:assert/strict';
import { secNY, secPhase, nyStamp } from '../sec-time.mjs';
// 13:00 New York in summer (17:00 UTC) is DURING the session, not after the close
assert.equal(secPhase('2026-10-21T17:00'), 'during'); assert.equal(secPhase('2026-10-21T17:00Z'), 'during');
// 07:30 New York pre-market earnings release (11:30 UTC) is BEFORE the open of that day
assert.equal(secPhase('2026-10-21T11:30'), 'before'); assert.equal(secNY('2026-10-21T11:30').d, '2026-10-21');
// 16:05 New York (20:05 UTC) is after the close
assert.equal(secPhase('2026-10-21T20:05:12.000Z'), 'after');
// 22:00 New York on the 21st is 02:00 UTC on the 22nd: New York date is the 21st, after the close
assert.deepEqual([secNY('2026-10-22T02:00').d, secPhase('2026-10-22T02:00')], ['2026-10-21', 'after']);
// winter (EST, UTC-5): 14:00 UTC = 09:00 New York, before the open
assert.equal(secPhase('2026-12-01T14:00'), 'before'); assert.equal(nyStamp('2026-12-01T14:00'), '2026-12-01T09:00-05:00');
// events-recent format round-trips and keeps the New York date in its first 10 characters
assert.equal(nyStamp('2026-10-21T12:05'), '2026-10-21T08:05-04:00'); assert.equal(secNY('2026-10-21T08:05-04:00').ms, Date.parse('2026-10-21T12:05:00Z'));
// date-only values stay dates
assert.deepEqual(secNY('2026-10-21'), { d: '2026-10-21', hm: null, ms: null }); assert.equal(secPhase('2026-10-21'), null);
console.log('sec-time validation passed');
