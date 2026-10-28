// Seam: watcher-guard-core.mjs (owner, 28 Oct 2026: startup reliability). The live watcher must be running by 9:25 New York on market
// days; the guard starts it when GitHub has not, alerts when it is late, queued, stopped or down, and handles daylight saving.
// Run: node --test test/watcher-guard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { guardDecide, nyParts, marketDay } from '../watcher-guard-core.mjs';
import { nyOffset } from '../ignition-core.mjs';

const at = (iso) => Date.parse(iso);
test('daylight saving: New York is UTC-4 until 1 Nov 2026, UTC-5 after; the 12:45 / 13:45 UTC crons are both 8:45 New York in their season', () => {
  assert.equal(nyOffset('2026-10-30'), -240); assert.equal(nyOffset('2026-11-02'), -300);
  assert.equal(nyParts(at('2026-10-30T12:45:00Z')).min, 8 * 60 + 45); assert.equal(nyParts(at('2026-11-02T13:45:00Z')).min, 8 * 60 + 45);
  assert.equal(nyParts(at('2026-11-02T12:45:00Z')).min, 7 * 60 + 45);   // winter: the first cron is 7:45 and exits; the second one watches
  assert.equal(nyParts(at('2026-11-02T03:30:00Z')).d, '2026-11-01');     // date follows New York, not UTC
});
test('market days: weekends and NYSE holidays are skipped', () => {
  assert.equal(marketDay(nyParts(at('2026-10-31T14:00:00Z'))), false); assert.equal(marketDay(nyParts(at('2026-11-26T15:00:00Z'))), false); assert.equal(marketDay(nyParts(at('2026-10-29T14:00:00Z'))), true);
});
test('nothing is done outside 9:10-14:55 New York; no start after 14:00', () => {
  let o = guardDecide(at('2026-10-29T13:00:00Z'), [], {}); assert.equal(o.dispatch, false); assert.deepEqual(o.alerts, []);
  o = guardDecide(at('2026-10-29T18:05:00Z'), [], {}); assert.equal(o.dispatch, false);
});
test('not running at 9:12 New York: starts it once, then waits 15 minutes before a second attempt, at most 3, then one DOWN alert', () => {
  let o = guardDecide(at('2026-10-29T13:12:00Z'), [], {}); assert.equal(o.dispatch, true); assert.match(o.alerts[0], /WATCHER NOT STARTED by 09:12.*attempt 1 of 3/);
  o = guardDecide(at('2026-10-29T13:20:00Z'), [], o.state); assert.equal(o.dispatch, false);
  o = guardDecide(at('2026-10-29T13:27:00Z'), [], o.state); assert.equal(o.dispatch, true);
  o = guardDecide(at('2026-10-29T13:42:00Z'), [], o.state); assert.equal(o.dispatch, true); assert.match(o.alerts[0], /attempt 3 of 3/);
  o = guardDecide(at('2026-10-29T13:58:00Z'), [], o.state); assert.equal(o.dispatch, false); assert.match(o.alerts[0], /WATCHER DOWN/);
  o = guardDecide(at('2026-10-29T14:10:00Z'), [], o.state); assert.deepEqual(o.alerts, []);
});
test('running on time: no alert, start time recorded; running late (GitHub delay like 11:10 on 26 Oct): one LATE alert', () => {
  let o = guardDecide(at('2026-10-29T13:30:00Z'), [{ status: 'in_progress', created_at: '2026-10-29T13:20:00Z', run_started_at: '2026-10-29T13:20:30Z' }], {});
  assert.deepEqual(o.alerts, []); assert.equal(o.state.started, 9 * 60 + 20);
  o = guardDecide(at('2026-10-26T15:15:00Z'), [{ status: 'in_progress', created_at: '2026-10-26T15:10:00Z', run_started_at: '2026-10-26T15:10:11Z' }], {});
  assert.match(o.alerts[0], /WATCHER STARTED LATE: .* 11:10 New York.*GitHub started it late/);
  o = guardDecide(at('2026-10-26T15:20:00Z'), [{ status: 'in_progress', created_at: '2026-10-26T15:10:00Z', run_started_at: '2026-10-26T15:10:11Z' }], o.state); assert.deepEqual(o.alerts, []);
});
test('queued but not started by 9:25: one WAITING alert and no extra dispatch (concurrency would only queue it)', () => {
  const q = [{ status: 'queued', created_at: '2026-10-29T13:20:00Z' }];
  let o = guardDecide(at('2026-10-29T13:26:00Z'), q, {}); assert.equal(o.dispatch, false); assert.match(o.alerts[0], /WATCHER WAITING/);
  o = guardDecide(at('2026-10-29T13:31:00Z'), q, o.state); assert.deepEqual(o.alerts, []);
});
test('a run that watched and then ended before 11:00 is reported once, not restarted; a quick early exit (winter 7:45 run) does not count', () => {
  const crashed = [{ status: 'completed', created_at: '2026-10-29T13:20:00Z', run_started_at: '2026-10-29T13:20:00Z', updated_at: '2026-10-29T14:00:00Z' }];
  let o = guardDecide(at('2026-10-29T14:05:00Z'), crashed, {}); assert.equal(o.dispatch, false); assert.match(o.alerts[0], /STOPPED EARLY/);
  const earlyExit = [{ status: 'completed', created_at: '2026-11-02T13:20:00Z', run_started_at: '2026-11-02T13:20:00Z', updated_at: '2026-11-02T13:21:00Z' }];
  o = guardDecide(at('2026-11-02T14:12:00Z'), earlyExit, {}); assert.equal(o.dispatch, true);
});
test('yesterday\'s runs do not count for today', () => {
  const o = guardDecide(at('2026-10-29T13:12:00Z'), [{ status: 'in_progress', created_at: '2026-10-28T13:20:00Z', run_started_at: '2026-10-28T13:20:00Z' }], { d: '2026-10-28', started: 560, dispatched: [], alerted: {} });
  assert.equal(o.dispatch, true); assert.equal(o.state.d, '2026-10-29');
});
