// EARNINGS DRIFT reaction session across market holidays (Claude, 2 Nov 2026). Synthetic only: no prices, no providers.
// Ships with docs/earnings-holiday/scan-earnings-holiday.patch; to integrate, copy to test/earnings-holiday.test.mjs with the patch.
// Before the patch: the lane used a weekday-only next day, so an after-the-close report before a holiday mapped to the holiday
// (never a session) and was silently skipped; a before-the-open report dated on a closed day was never matched either.
// Run: node test/earnings-holiday.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadScan } from './load-scan.mjs';
const S = await loadScan({ files: { 'data/settings.json': {} } });
const reacts = S.fn('peadReactsOn'), isSession = S.fn('isSession');
const on = (d, t) => { const out = []; for (let ms = Date.parse(d + 'T12:00:00Z'), k = 0; k < 10; k++, ms += 864e5) { const s = new Date(ms).toISOString().slice(0, 10); if (reacts({ d, t }, s)) out.push(s); } return out; };

test('after-the-close reports before holidays react on the next session, not the holiday', () => {
  assert.deepEqual(on('2026-11-25', 'amc'), ['2026-11-27']);   // Thanksgiving 26 Nov; 27 Nov is a half day
  assert.deepEqual(on('2027-03-25', 'amc'), ['2027-03-29']);   // Good Friday 26 Mar 2027
  assert.deepEqual(on('2026-07-02', 'amc'), ['2026-07-06']);   // Independence Day observed Fri 3 Jul 2026
  assert.deepEqual(on('2026-06-18', 'amc'), ['2026-06-22']);   // Juneteenth Fri 19 Jun 2026
  assert.deepEqual(on('2026-12-24', 'amc'), ['2026-12-28']);   // Christmas Fri 25 Dec 2026
  assert.deepEqual(on('2027-01-15', 'amc'), ['2027-01-19']);   // MLK Day Mon 18 Jan 2027
});

test('before-the-open reports dated on a closed day react on the next session', () => {
  assert.deepEqual(on('2026-11-26', 'bmo'), ['2026-11-27']);   // dated Thanksgiving
  assert.deepEqual(on('2026-11-28', 'bmo'), ['2026-11-30']);   // Saturday
  assert.deepEqual(on('2026-11-27', 'bmo'), ['2026-11-27']);   // half day is still a session
  assert.deepEqual(on('2026-11-27', 'amc'), ['2026-11-30']);   // after the 13:00 close of the half day
});

test('unknown timing keeps both candidate sessions, skipping holidays', () => {
  assert.deepEqual(on('2026-11-25', null), ['2026-11-25', '2026-11-27']);
  assert.deepEqual(on('2026-11-26', null), ['2026-11-27']);    // a closed day has one candidate
  assert.deepEqual(on('2026-11-02', null), ['2026-11-02', '2026-11-03']);
});

test('malformed report dates never match', () => {
  for (const d of [null, undefined, '', '2026-13-01x', 20261125]) assert.equal(reacts({ d, t: 'amc' }, '2026-11-27'), false);
  assert.equal(reacts(null, '2026-11-27'), false);
});

test('ordinary trading days keep exactly the old behaviour (every day of 2026-2027, all timings)', () => {
  const oldNext = (d) => { let ms = Date.parse(d + 'T12:00:00Z'); do { ms += 864e5; } while ([0, 6].includes(new Date(ms).getUTCDay())); return new Date(ms).toISOString().slice(0, 10); };
  const oldReacts = (r, s) => { const react = r.t === 'bmo' ? r.d : r.t === 'amc' ? oldNext(r.d) : null; return react ? react === s : (r.d === s || oldNext(r.d) === s); };
  let compared = 0, changed = 0;
  for (let ms = Date.parse('2026-01-01T12:00:00Z'); ms < Date.parse('2028-01-01T12:00:00Z'); ms += 864e5) {
    const d = new Date(ms).toISOString().slice(0, 10);
    for (const t of ['bmo', 'amc', null]) for (let k = 0; k < 6; k++) { const s = new Date(ms + k * 864e5).toISOString().slice(0, 10); if (!isSession(s)) continue; compared++;
      const a = oldReacts({ d, t }, s), b = reacts({ d, t }, s); if (a === b) continue; changed++;
      // a difference is allowed only where the old rule pointed at a non-session day (holiday or weekend)
      const oldTarget = t === 'bmo' ? d : oldNext(d), oldCand = t === null ? [d, oldNext(d)] : [oldTarget];
      assert.ok(oldCand.some(x => !isSession(x)), 'unexpected change on an ordinary day: ' + JSON.stringify({ d, t, s, old: a, new: b })); } }
  // 9,039 comparisons; 302 change, every one where the old rule pointed at a holiday or a weekend date (asserted above).
  assert.ok(compared > 7000 && changed > 0, JSON.stringify({ compared, changed }));
});

test('the EARNINGS DRIFT loop uses the calendar rule (no weekday-only next day left in it)', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'scan.mjs'), 'utf8'), i = src.indexOf('peadFunnel = {'), block = src.slice(i, i + 2500);
  assert.ok(i > 0 && /if \(!peadReactsOn\(r, session\)\) continue;/.test(block));
  assert.doesNotMatch(block, /\[0, 6\]\.includes\(new Date\(ms\)\.getUTCDay\(\)\)/);
});
