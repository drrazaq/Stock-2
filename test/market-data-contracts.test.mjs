// Market-data contracts (inactive module): sum of returned qualifying SIP minute bars, revisions, gate evidence and the three price roles.
// Synthetic bars and quotes shaped like the documented Alpaca responses; no network. Run: node --test test/market-data-contracts.test.mjs
// The "regression" tests each reproduce a defect found in d3bf78ba (see docs/market-data-contracts-2026-11-01.md, section 9).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isIso, isCalendarDay, nyLocalToUtc, aggregateTimedVolume, reconcileRevisions, volumeMeetsGateEvidence, premarketInfo, priorCloseExit, entryQuoteEvidence, planBarRequests, VOLUME_CLASS, COVERAGE_LIMITS } from '../market-data-contracts.mjs';

const MIN = 60000, day = '2026-10-30', open = nyLocalToUtc(day, 570);   // 13:30Z (EDT)
const bar = (ms, v = 100, extra = {}) => ({ t: new Date(ms).toISOString().replace('.000', ''), o: 10, h: 10.2, l: 9.9, c: 10.1, v, n: 3, vw: 10.05, ...extra });
const minutes = (from, count, v = 100) => Array.from({ length: count }, (_, i) => bar(from + i * MIN, v));
const agg = (bars, o = {}) => { const asOf = o.asOf ?? open + 10 * MIN; return aggregateTimedVolume(bars, { day, asOf, retrievedAt: asOf + 120000, feed: 'sip', ...o }); };
const Q = { bp: 10, ap: 10.02, bs: 300, as: 200, t: '2026-11-02T14:35:00Z', c: ['R'], bx: 'Q', ax: 'P', z: 'C' }, QAT = Date.parse('2026-11-02T14:35:30Z');
const QOPT = { nowMs: QAT, feed: 'sip', maxAgeMs: 60000, maxSpreadPct: 0.01, minAskShares: 100, phase: 'REGULAR' };

test('New York session boundaries follow daylight saving (EDT 30 Oct, EST 2 Nov 2026)', () => {
  assert.equal(new Date(nyLocalToUtc('2026-10-30', 570)).toISOString(), '2026-10-30T13:30:00.000Z');
  assert.equal(new Date(nyLocalToUtc('2026-11-02', 570)).toISOString(), '2026-11-02T14:30:00.000Z');
  assert.equal(new Date(nyLocalToUtc('2026-11-02', 240)).toISOString(), '2026-11-02T09:00:00.000Z');
});

test('sum of returned bars through the as-of boundary; inside-grace volume reported separately; open minute never counted', () => {
  const asOf = open + 10 * MIN, v = aggregateTimedVolume([...minutes(open, 10), bar(asOf, 999)], { day, asOf, retrievedAt: asOf + 20000, feed: 'sip' });
  assert.equal(v.volumeClass, VOLUME_CLASS.RETURNED_BAR_SUM); assert.equal(v.status, 'COMPUTED'); assert.equal(v.evidence, 'SUM_OF_RETURNED_QUALIFYING_SIP_MINUTE_BARS');
  assert.equal(v.returnedBarSum, 1000); assert.equal(v.volumeInsideGrace, 100); assert.equal(v.volumeOutsideGrace, 900);
  assert.equal(v.graceBoundary, new Date(asOf - MIN).toISOString());
  assert.ok(v.issues.some(i => i.code === 'BAR_NOT_CLOSED_AT_RETRIEVAL'));
  assert.deepEqual(v.coverage.limits, COVERAGE_LIMITS); assert.ok(!('settledVolume' in v) && !('settledThrough' in v), 'no "settled" claim');
});

test('minutes without a returned bar are listed; the label says so; a gate may refuse them', () => {
  const v = agg(minutes(open, 10).filter((_, i) => i !== 3 && i !== 4));
  assert.equal(v.coverage.minutesWithoutReturnedBar, 2); assert.equal(v.coverage.label, 'SOME_MINUTES_RETURNED_NO_BAR');
  assert.deepEqual(v.coverage.minutesWithoutBar, [{ from: new Date(open + 3 * MIN).toISOString(), to: new Date(open + 5 * MIN).toISOString() }]);
  assert.equal(volumeMeetsGateEvidence(v, { nowMs: open + 12 * MIN, maxAgeMs: 300000, allowMinutesWithoutBar: false }).reason, 'MINUTES_WITHOUT_BAR_NOT_ALLOWED');
  assert.equal(volumeMeetsGateEvidence(v, { nowMs: open + 12 * MIN, maxAgeMs: 300000 }).minutesWithoutReturnedBar, 2);
});

test('scope: pre-market minutes count only in an extended scope', () => {
  const pre = nyLocalToUtc(day, 540), asOf = open + 2 * MIN, bars = [bar(pre, 50), ...minutes(open, 2)];
  assert.equal(agg(bars, { asOf, scope: 'REGULAR' }).returnedBarSum, 200);
  assert.equal(agg(bars, { asOf, scope: 'PRE_AND_REGULAR' }).returnedBarSum, 250);
});

test('malformed, duplicate, other-session and inconsistent bars make the evidence invalid', () => {
  const asOf = open + 2 * MIN;
  for (const bars of [[...minutes(open, 2), bar(open, 5)], [bar(open - 86400000), ...minutes(open, 2)], [bar(open, 0), bar(open + MIN)], [bar(open, 100, { h: 9 })],
    [null, bar(open)], [bar(open, 100, { vw: 11 })], [bar(open, 100, { c: NaN })], [bar(open, 100, { t: 'yesterday' })], [bar(open + 1000)]])
    assert.equal(agg(bars, { asOf }).status, 'INVALID_EVIDENCE', JSON.stringify(bars).slice(0, 80));
});

test('consistency with a later daily total: the returned-bar sum may be lower, never higher', () => {
  const asOf = open + 3 * MIN;
  assert.deepEqual(agg(minutes(open, 3), { asOf, dailyVolume: 450 }).consistency, { status: 'NOT_CONTRADICTED', returnedBarSum: 300, dailyVolume: 450, notInReturnedBars: 150 });
  assert.equal(agg(minutes(open, 3), { asOf, dailyVolume: 250 }).status, 'INVALID_EVIDENCE');
});

test('revisions: every field of every minute is compared; added and removed minutes are listed', () => {
  const r = reconcileRevisions(minutes(open, 3), [bar(open, 100), bar(open + MIN, 130, { n: 4 }), bar(open + 3 * MIN, 70)]);
  assert.equal(r.comparable, true); assert.deepEqual(r.changes.map(c => [c.kind, c.dv]), [['CHANGED', 30], ['REMOVED', -100], ['ADDED', 70]]);
  assert.deepEqual(r.changes[0].fields, ['v', 'n']);
});

test('price roles carry evidence labels, not execution claims', () => {
  const now = Date.parse('2026-11-02T13:40:00Z');
  const info = premarketInfo({ p: 9.9, t: '2026-11-02T13:35:00Z' }, { nowMs: now, day: '2026-11-02', feed: 'sip' });
  assert.equal(info.status, 'REPORTED_TRADE'); assert.equal(info.informationOnly, true); assert.equal(info.phase, 'PRE'); assert.equal(info.ageMs, 300000); assert.ok(!('executable' in info));
  assert.equal(premarketInfo({ p: 9, t: '2026-11-02T00:30:00Z' }, { nowMs: now, day: '2026-11-02' }).status, 'NOT_THIS_SESSION_DAY');
  const exit = priorCloseExit({ c: 8.8, t: '2026-10-30T04:00:00Z' }, { stop: 9, day: '2026-11-02' });
  assert.equal(exit.status, 'PRIOR_CLOSE_REPORTED'); assert.equal(exit.stopHit, true); assert.equal(exit.instructionForTheOpen, true); assert.ok(!('executable' in exit));
  assert.equal(priorCloseExit({ c: 8.8, t: '2026-10-30T04:00:00Z' }, { stop: null, day: '2026-11-02' }).stopHit, null);
  const e = entryQuoteEvidence(Q, QOPT);
  assert.equal(e.passesQuoteChecks, true); assert.equal(e.evidenceLabel, 'QUOTE_CHECKS_PASSED_AT_QUOTE_TIME_NOT_A_FILL_GUARANTEE'); assert.ok(!('executable' in e));
  for (const [why, over, opts] of [['NOT_CONSOLIDATED_FEED', {}, { feed: 'iex' }], ['QUOTE_OLDER_THAN_LIMIT', {}, { nowMs: QAT + 120000 }], ['ONE_SIDED_OR_NO_MARKET', { bp: 0 }, {}], ['CROSSED', { ap: 9.9 }, {}],
    ['SPREAD_ABOVE_LIMIT', { ap: 10.5 }, {}], ['ASK_SIZE_BELOW_LIMIT_OR_MALFORMED', { as: 50 }, {}], ['QUOTE_CLOCK_AFTER_NOW', {}, { nowMs: QAT - 60000 }], ['OTHER_SESSION_PHASE', { t: '2026-11-02T13:35:00Z' }, { nowMs: Date.parse('2026-11-02T13:35:30Z') }],
    ['SIZE_UNIT_ROUND_LOTS_BEFORE_2025_11_03', { t: '2025-10-31T14:35:00Z' }, { nowMs: Date.parse('2025-10-31T14:35:30Z') }]])
    assert.equal(entryQuoteEvidence({ ...Q, ...over }, { ...QOPT, ...opts }).reason, why);
});

test('request budget: per-minute polling of a few hundred symbols uses a tiny share of the documented 10,000 calls/min', () => {
  assert.deepEqual(planBarRequests({ symbols: 300 }), { chunks: 2, pagesPerChunk: 1, callsPerPoll: 2, callsPerMinute: 2, shareOfLimit: 0.0002, withinLimit: true });
  assert.equal(planBarRequests({ symbols: 300, minutesPerPoll: 390 }).callsPerPoll, 16);
  assert.throws(() => planBarRequests({ symbols: NaN }), /INVALID_ARGUMENT_PLAN/);
});

// ---- regressions: each reproduced in d3bf78ba ----
test('regression: entry quote checks reject missing, NaN, infinite or out-of-range limits instead of passing', () => {
  for (const [opt, val] of [['maxSpreadPct', undefined], ['maxSpreadPct', NaN], ['maxSpreadPct', Infinity], ['maxSpreadPct', 0], ['maxAgeMs', undefined], ['maxAgeMs', NaN], ['maxAgeMs', -1],
    ['minAskShares', undefined], ['minAskShares', 0], ['minAskShares', -1], ['minAskShares', 1.5], ['nowMs', NaN], ['nowMs', undefined], ['phase', 'LUNCH']])
    assert.throws(() => entryQuoteEvidence(Q, { ...QOPT, [opt]: val }), /INVALID_ARGUMENT_/, opt + '=' + val);
});
test('regression: non-finite quote prices never pass (Infinity ask with an infinite spread limit used to pass)', () => {
  assert.equal(entryQuoteEvidence({ ...Q, ap: Infinity }, QOPT).reason, 'NON_FINITE_PRICE');
  assert.equal(entryQuoteEvidence({ ...Q, bp: NaN }, QOPT).reason, 'NON_FINITE_PRICE');
});
test('regression: NaN clock is an argument error, not a "future quote" reason', () => {
  assert.throws(() => entryQuoteEvidence(Q, { ...QOPT, nowMs: NaN }), /INVALID_ARGUMENT_NOW_MS/);
});
test('regression: pre-market information rejects infinite prices and NaN clocks', () => {
  assert.equal(premarketInfo({ p: Infinity, t: '2026-11-02T13:35:00Z' }, { nowMs: Date.parse('2026-11-02T13:40:00Z'), day: '2026-11-02' }).status, 'MISSING_OR_MALFORMED');
  assert.throws(() => premarketInfo({ p: 9, t: '2026-11-02T13:35:00Z' }, { nowMs: NaN, day: '2026-11-02' }), /INVALID_ARGUMENT_NOW_MS/);
  assert.throws(() => premarketInfo({ p: 9, t: '2026-11-02T13:35:00Z' }, { nowMs: 1, day: 'today' }), /INVALID_ARGUMENT_DAY/);
});
test('regression: prior-close instruction rejects an infinite close and an invalid stop', () => {
  assert.equal(priorCloseExit({ c: Infinity, t: '2026-10-30T04:00:00Z' }, { stop: 9, day: '2026-11-02' }).status, 'MISSING_OR_MALFORMED');
  for (const stop of [NaN, Infinity, 0, -1, undefined, '9']) assert.throws(() => priorCloseExit({ c: 8, t: '2026-10-30T04:00:00Z' }, { stop, day: '2026-11-02' }), /INVALID_ARGUMENT_STOP/, String(stop));
});
test('regression: graceMs must be an integer between 0 and 15 minutes', () => {
  for (const graceMs of [NaN, -60000, Infinity, 1.5, 16 * MIN, '60000']) assert.throws(() => agg(minutes(open, 2), { graceMs }), /INVALID_ARGUMENT_GRACE_MS/, String(graceMs));
  assert.equal(agg(minutes(open, 2), { graceMs: 0 }).status, 'COMPUTED');
});
test('regression: an infinite or non-integer daily total is an argument error, not a silent "consistent"', () => {
  for (const dailyVolume of [Infinity, NaN, -1, 1.5]) assert.throws(() => agg(minutes(open, 2), { dailyVolume }), /INVALID_ARGUMENT_DAILY_VOLUME/, String(dailyVolume));
});
test('regression: other aggregate arguments are validated (feed, bars, scope, day, as-of, retrieval)', () => {
  assert.throws(() => agg(minutes(open, 2), { feed: 'iex' }), /FEED_MUST_BE_SIP/);
  assert.throws(() => aggregateTimedVolume('bars', { day, asOf: open, retrievedAt: open, feed: 'sip' }), /INVALID_ARGUMENT_BARS/);
  assert.throws(() => agg([], { scope: 'toString' }), /INVALID_ARGUMENT_SCOPE/);
  assert.throws(() => agg([], { asOf: open + 1 }), /INVALID_ARGUMENT_AS_OF/);
  assert.throws(() => aggregateTimedVolume([], { day, asOf: open, retrievedAt: open - 1, feed: 'sip' }), /INVALID_ARGUMENT_RETRIEVED_AT/);
});
test('regression: revisions in open, high, low or VWAP are detected (only v/n/c were compared)', () => {
  const r = reconcileRevisions([bar(open)], [bar(open, 100, { h: 10.5, l: 9.5, o: 9.95, vw: 10.2 })]);
  assert.equal(r.changes.length, 1); assert.deepEqual(r.changes[0].fields, ['o', 'h', 'l', 'vw']); assert.equal(r.changes[0].dv, 0);
});
test('regression: malformed and duplicate revision evidence is reported, never silently dropped', () => {
  const m = reconcileRevisions([bar(open), { t: 'x' }], [bar(open)]);
  assert.equal(m.comparable, false); assert.deepEqual(m.evidenceIssues.map(i => [i.side, i.code, i.problem]), [['before', 'MALFORMED_BAR', 'BAD_TIMESTAMP']]);
  const d = reconcileRevisions([bar(open, 100), bar(open, 50)], [bar(open, 50)]);
  assert.equal(d.comparable, false); assert.deepEqual(d.evidenceIssues.map(i => [i.side, i.code]), [['before', 'DUPLICATE_MINUTE']]);
  assert.throws(() => reconcileRevisions(null, []), /INVALID_ARGUMENT_REVISION_INPUTS/);
});
test('regression: gate evidence requires a finite clock and a stated age limit (a missing limit used to accept any age)', () => {
  const v = agg(minutes(open, 2));
  assert.throws(() => volumeMeetsGateEvidence(v, { nowMs: open + 86400000 }), /INVALID_ARGUMENT_MAX_AGE_MS/);
  assert.throws(() => volumeMeetsGateEvidence(v, { nowMs: NaN, maxAgeMs: 1 }), /INVALID_ARGUMENT_NOW_MS/);
  assert.equal(volumeMeetsGateEvidence(v, { nowMs: open + 86400000, maxAgeMs: 180000 }).reason, 'BOUNDARY_TOO_OLD');
  assert.equal(volumeMeetsGateEvidence({ volumeClass: VOLUME_CLASS.UNTIMED_DAILY }, { nowMs: open, maxAgeMs: 1e9 }).reason, 'NOT_A_COMPUTED_RETURNED_BAR_SUM');
});
test('regression: no "settled" or "executable" wording in outputs or exports', async () => {
  const mod = await import('../market-data-contracts.mjs'), outputs = JSON.stringify([agg(minutes(open, 2)), entryQuoteEvidence(Q, QOPT), premarketInfo({ p: 9, t: '2026-10-30T13:00:00Z' }, { nowMs: open, day }), priorCloseExit({ c: 8, t: '2026-10-29T04:00:00Z' }, { stop: 9, day })]);
  assert.doesNotMatch(outputs, /settled|executable/i); assert.equal(Object.keys(mod).some(k => /executable|eligible/i.test(k)), false);
});

// ---- regression: impossible calendar dates were normalised by Date.parse (2026-02-30T14:35:00Z read as 2 March and passed) ----
test('regression: impossible dates are rejected, never normalised into another day', () => {
  for (const t of ['2026-02-30T14:35:00Z', '2026-02-29T14:35:00Z', '2025-02-29T00:00:00Z', '1900-02-29T00:00:00Z', '2026-04-31T13:00:00Z', '2026-06-31T13:00:00Z',
    '2026-09-31T13:00:00Z', '2026-11-31T13:00:00Z', '2026-13-01T00:00:00Z', '2026-00-10T00:00:00Z', '2026-01-00T00:00:00Z', '2026-01-32T00:00:00Z'])
    assert.equal(isIso(t), false, t);
  for (const d of ['2026-02-30', '2025-02-29', '1900-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-1-01', '26-01-01']) assert.equal(isCalendarDay(d), false, d);
});
test('regression: valid leap days and month boundaries are accepted', () => {
  for (const t of ['2024-02-29T12:00:00Z', '2000-02-29T00:00:00Z', '2028-02-29T23:59:59Z', '2026-01-31T23:59:59Z', '2026-02-28T23:59:59Z', '2026-03-01T00:00:00Z',
    '2026-04-30T00:00:00Z', '2026-12-31T23:59:59.999999999Z', '2027-01-01T00:00:00Z']) assert.equal(isIso(t), true, t);
  for (const d of ['2024-02-29', '2000-02-29', '2026-02-28', '2026-12-31']) assert.equal(isCalendarDay(d), true, d);
});
test('regression: supported timezone formats are exactly Z and +HH:MM / -HH:MM; out-of-range clock fields are rejected', () => {
  for (const t of ['2026-11-02T14:35:00Z', '2026-11-02T09:35:00-05:00', '2026-11-02T20:05:00+05:30', '2026-11-02T14:35:00+00:00', '2026-11-02T14:35:00.5Z', '2026-11-02T14:35:00.123456789-04:00'])
    assert.equal(isIso(t), true, t);
  for (const t of ['2026-11-02T14:35:00', '2026-11-02T14:35:00z', '2026-11-02t14:35:00Z', '2026-11-02T14:35:00+0530', '2026-11-02T14:35:00+05', '2026-11-02T14:35:00+24:00',
    '2026-11-02T14:35:00+05:60', '2026-11-02T24:00:00Z', '2026-11-02T14:60:00Z', '2026-11-02T14:35:60Z', '2026-11-02T14:35:00.1234567890Z', '2026-11-02 14:35:00Z', 20261102, null])
    assert.equal(isIso(t), false, String(t));
  assert.equal(Date.parse('2026-11-02T09:35:00-05:00'), Date.parse('2026-11-02T14:35:00Z'), 'offsets resolve to the same instant');
});
test('regression: every consumer refuses impossible dates (quote, pre-market trade, prior close, bars, session day)', () => {
  const quote = entryQuoteEvidence({ ...Q, t: '2026-02-30T14:35:00Z' }, { ...QOPT, nowMs: Date.parse('2026-03-02T14:35:30Z'), phase: undefined });
  assert.equal(quote.passesQuoteChecks, false); assert.equal(quote.reason, 'NO_VALID_QUOTE_CLOCK');
  assert.equal(premarketInfo({ p: 9, t: '2026-04-31T13:00:00Z' }, { nowMs: Date.parse('2026-05-01T13:05:00Z'), day: '2026-05-01' }).status, 'MISSING_OR_MALFORMED');
  assert.equal(priorCloseExit({ c: 8, t: '2026-02-30T05:00:00Z' }, { stop: 9, day: '2026-03-03' }).status, 'MISSING_OR_MALFORMED');
  assert.equal(agg([bar(open), { ...bar(open + MIN), t: '2026-10-32T13:31:00Z' }], { asOf: open + 2 * MIN }).status, 'INVALID_EVIDENCE');
  assert.throws(() => premarketInfo({ p: 9, t: '2026-03-02T13:00:00Z' }, { nowMs: Date.parse('2026-03-02T13:05:00Z'), day: '2026-02-30' }), /INVALID_ARGUMENT_DAY/);
  assert.throws(() => priorCloseExit({ c: 8, t: '2026-02-27T05:00:00Z' }, { stop: 9, day: '2026-02-30' }), /INVALID_ARGUMENT_DAY/);
  assert.throws(() => aggregateTimedVolume([], { day: '2026-02-30', asOf: open, retrievedAt: open, feed: 'sip' }), /INVALID_ARGUMENT_DAY/);
  assert.throws(() => nyLocalToUtc('2026-02-30', 570), /NY_LOCAL_ARGS/);
});

test('integration: only the reviewed passive observer imports the contracts module', () => {
  const root = path.resolve(import.meta.dirname, '..');
  const users = fs.readdirSync(root).filter(f => f.endsWith('.mjs') && f !== 'market-data-contracts.mjs').filter(f => fs.readFileSync(path.join(root, f), 'utf8').includes('market-data-contracts'));
  assert.deepEqual(users, ['watcher-contract-observer.mjs']);
});
