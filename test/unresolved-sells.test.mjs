// Seam: unresolvedSells(pos, lastPx, today) and halalGapLine(pos) in scan.mjs, both shown in ACTIONS.
// Guards the 23 Oct holdings review: TTD, RKLB, COHR and SYM were told SELL ALL on 14 Oct and were still held 9 days later, and the
// daily message showed them as a fresh SELL each day, so nothing said how long the sell had waited or what the wait cost. Closed
// trades showed the same leak (DOCN sold at 100 against a 120.81 stop, AEHR at 60.30 against 65.75). Also: 11 of 12 holdings had no
// halal mark of the owner's, with nothing in ACTIONS saying so.
// Run: node test/unresolved-sells.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const S = await loadScan({ files: { 'data/halal.json': { IESC: { s: 'ok', d: '2026-10-12', by: 'you' } } } });
const un = S.fn('unresolvedSells'), gap = S.fn('halalGapLine');

test('a SELL carried from an earlier day is listed with its age and the move since', () => {
  const pos = { TTD: { entry: 20.16, lastAct: { act: 'SELL ALL', why: 'trend broken', d: '2026-10-23', since: '2026-10-14', px0: 14.0 } },
    PR: { entry: 22.4, lastAct: { act: 'HOLD', d: '2026-10-23' } } };
  const L = un(pos, { TTD: 13.16 }, '2026-10-23');
  assert.equal(L.length, 1);
  assert.match(L[0], /^TTD: SELL since 2026-10-14 \(9 days\)/);
  assert.match(L[0], /14\.00 then, 13\.16 now \(-6\.0% since\)/);
});

test('a SELL first given today is not listed (it is already in SELL)', () => {
  const pos = { CIEN: { entry: 344, lastAct: { act: 'SELL ALL', d: '2026-10-23', since: '2026-10-23', px0: 322 } } };
  assert.deepEqual(un(pos, { CIEN: 322 }, '2026-10-23'), []);
});

test('an old record without since or price uses its date and leaves the price out', () => {
  const pos = { SYM: { entry: 61.58, lastAct: { act: 'SELL ALL', d: '2026-10-14' } } };
  const L = un(pos, {}, '2026-10-23');
  assert.match(L[0], /^SYM: SELL since 2026-10-14 \(9 days\)/);
  assert.doesNotMatch(L[0], /then/);
});

test('holdings without the owner\'s halal mark are named', () => {
  const line = gap({ IESC: {}, TTD: {}, PR: {} });
  assert.match(line, /TTD, PR/);
  assert.doesNotMatch(line, /IESC/);
  assert.equal(gap({ IESC: {} }), '');
});

test('no network was used', () => assert.deepEqual(blocked, []));
