// Seams: catalyst-core.mjs, the pure rules of the CATALYST RUN-UP lane (pre-registered 23 Oct 2026 as CAT-RUN1 / CAT-NEWS1):
//   extractCatalysts(text, filingDate)  -> the dated catalysts an 8-K states (PDUFA, advisory committee, topline), earliest possible day
//   tradingSessions(from, to) / runUpPlan(sessions, eventDate) -> buy the open 30 sessions before, sell the close 2 sessions before
//   dilutedBefore(filings, sessions, entryIdx) -> a 424B5 / S-1 / S-3 in the 20 sessions before entry excludes the trade
// Run: node test/catalyst-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCatalysts, tradingSessions, runUpPlan, dilutedBefore, html2text } from '../catalyst-core.mjs';

test('PDUFA target action date with an exact day', () => {
  const r = extractCatalysts('The FDA accepted the NDA and assigned a PDUFA target action date of March 15, 2025.', '2024-11-04');
  assert.deepEqual(r.map(x => [x.kind, x.date, x.precision]), [['PDUFA', '2025-03-15', 'day']]);
});

test('topline data expected in a quarter -> the first day of that quarter (the earliest it could come)', () => {
  const r = extractCatalysts('Topline data are expected in the second quarter of 2025.', '2025-01-10');
  assert.deepEqual(r.map(x => [x.kind, x.date, x.precision]), [['TOPLINE', '2025-04-01', 'quarter']]);
});

test('other stated forms: Q3 2025, 1H 2026, a month, an advisory committee day', () => {
  const t = 'We expect topline results in Q3 2025. The company plans to report top-line data in 1H 2026. ' +
    'An advisory committee meeting is scheduled for June 5, 2025. Topline data from the Phase 3 trial is anticipated in September 2025.';
  const r = extractCatalysts(t, '2025-02-01').map(x => [x.kind, x.date, x.precision]);
  assert.deepEqual(r, [['TOPLINE', '2025-07-01', 'quarter'], ['TOPLINE', '2026-01-01', 'half'], ['ADCOM', '2025-06-05', 'day'], ['TOPLINE', '2025-09-01', 'month']]);
});

test('past dates, vague timing and topline sentences without an expectation are not catalysts', () => {
  const t = 'In January 2024 we reported topline data showing benefit. Topline data are expected in mid-2025. ' +
    'The PDUFA date of December 1, 2024 passed. We announced topline results in the third quarter of 2025.';
  assert.deepEqual(extractCatalysts(t, '2025-01-15'), []);
});

test('the U.S. abbreviation does not cut the sentence away from its date', () => {
  const r = extractCatalysts('The U.S. Food and Drug Administration set a Prescription Drug User Fee Act (PDUFA) goal date of January 31, 2026 for the U.S. filing.', '2025-08-01');
  assert.deepEqual(r.map(x => [x.kind, x.date]), [['PDUFA', '2026-01-31']]);
});

test('html2text strips tags and entities from an exhibit', () => {
  assert.equal(html2text('<p>PDUFA&nbsp;date of<b> March&#160;15,</b>&#8203; 2025&amp;more</p>'), 'PDUFA date of March 15, 2025&more');
});

test('trading sessions skip weekends and NYSE holidays (Good Friday, Juneteenth, Christmas observed)', () => {
  const s = tradingSessions('2025-04-16', '2025-04-22');
  assert.deepEqual(s, ['2025-04-16', '2025-04-17', '2025-04-21', '2025-04-22']);   // 18 Apr 2025 Good Friday, then a weekend
  assert.ok(!tradingSessions('2025-06-18', '2025-06-20').includes('2025-06-19'));
  assert.deepEqual(tradingSessions('2027-12-23', '2027-12-28'), ['2027-12-23', '2027-12-27', '2027-12-28']);   // 25 Dec 2027 is a Saturday: closed Fri 24th
  assert.deepEqual(tradingSessions('2022-12-30', '2023-01-03'), ['2022-12-30', '2023-01-03']);                // 1 Jan 2023 Sunday: closed Mon 2nd
  assert.deepEqual(tradingSessions('2021-12-30', '2022-01-03'), ['2021-12-30', '2021-12-31', '2022-01-03']);  // 1 Jan 2022 Saturday: 31 Dec stays open
});

test('run-up plan: buy the open 30 sessions before the event session, sell the close 2 sessions before', () => {
  const S = tradingSessions('2025-01-02', '2025-06-30');
  const p = runUpPlan(S, '2025-03-15');   // a Saturday: the event session is Monday 17 March
  assert.equal(p.eventSession, '2025-03-17');
  assert.equal(p.sell, '2025-03-13');      // 2 sessions before: Fri 14 is 1 before, Thu 13 is 2 before
  assert.equal(p.buy, '2025-01-31');       // 30 sessions before 17 Mar, across Presidents Day (17 Feb)
  assert.equal(p.held, 29);
  assert.equal(runUpPlan(S, '2025-01-20'), null);   // not enough sessions before the start of the calendar
});

test('dilution: a 424B5, S-1 or S-3 filed in the 20 sessions before entry excludes the trade', () => {
  const S = tradingSessions('2025-01-02', '2025-03-31'), entry = S.indexOf('2025-03-03');
  assert.equal(dilutedBefore([{ form: '424B5', d: '2025-02-28' }], S, entry), '424B5 2025-02-28');
  assert.equal(dilutedBefore([{ form: 'S-3', d: S[entry - 20] }], S, entry), 'S-3 ' + S[entry - 20]);
  assert.equal(dilutedBefore([{ form: 'S-1', d: S[entry - 21] }], S, entry), null);           // 21 sessions before: outside the window
  assert.equal(dilutedBefore([{ form: '424B5', d: '2025-03-03' }], S, entry), null);         // filed on the entry day: not before it
  assert.equal(dilutedBefore([{ form: '8-K', d: '2025-02-28' }, { form: 'S-8', d: '2025-02-27' }], S, entry), null);   // not offerings
  assert.equal(dilutedBefore([{ form: '424B5', d: '2025-02-15' }], S, entry), '424B5 2025-02-15');   // a Saturday filing date counts from the next session
});

test('verdict: the registered tier-2 gates (both halves, 0.8% and 1.2% cost, average stock, same stock, without the 2 best, t >= 2.5)', async () => {
  const { verdictOf } = await import('../catalyst-core.mjs');
  const half = (o = {}) => ({ n: 40, avg: 0.03, avgStress: 0.026, edge: 0.02, t: 2.8, vsOwn: 0.01, noTop2: 0.012, ...o });
  assert.equal(verdictOf({ older: half(), newer: half() }, 4.0).verdict, 'TRADABLE SMALL');
  assert.equal(verdictOf({ older: half({ t: 4.2 }), newer: half({ t: 4.1 }) }, 4.0).verdict, 'PROVEN');
  assert.equal(verdictOf({ older: half(), newer: half({ avgStress: -0.001 }) }, 4.0).verdict, 'NOT PROVEN');
  assert.equal(verdictOf({ older: half(), newer: half({ t: 2.4 }) }, 4.0).verdict, 'NOT PROVEN');
  assert.equal(verdictOf({ older: half({ vsOwn: -0.002 }), newer: half() }, 4.0).verdict, 'NOT PROVEN');
  assert.equal(verdictOf({ older: half({ edge: -0.01 }), newer: half() }, 4.0).verdict, 'REJECTED');
  assert.equal(verdictOf({ older: half({ n: 19 }), newer: half() }, 4.0).verdict, 'TOO FEW CASES');
});
