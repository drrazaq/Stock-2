// Seams: squad25-audit-core.mjs (Stock-2 label audit, 27 Oct 2026). Regression tests: Alphabet's same-evening batch of first 13Fs
// (2022-11-14, CIK 1652044), a first-ever 13F (NVIDIA Feb 2024), late filings, amended / confidential holdings, 13D/13G first vs repeat.
// Run: node --test test/squad25-audit-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify13F, classifyDG, classifyEvent, prevQuarterEnd, counted, COUNTED, CLASSES } from '../squad25-audit-core.mjs';

const F = (adsh, form, accept, period, cus) => ({ adsh, form, accept, period, issuers: new Set(cus) });
test('quarter arithmetic and registry', () => {
  assert.equal(prevQuarterEnd('2024-03-31'), '2023-12-31'); assert.equal(prevQuarterEnd('2022-09-30'), '2022-06-30'); assert.equal(prevQuarterEnd('2022-12-31'), '2022-09-30');
  assert.deepEqual(COUNTED, ['NEW_POSITION_CONFIRMED', '13D/13G_FIRST']); assert.equal(CLASSES.length, 6); assert.equal(counted('LATE_FILING'), false);
});
test('Alphabet 2022-11-14: a same-evening batch of first 13Fs is FIRST_OBSERVED_NO_BASELINE, never a new purchase', () => {
  const fl = [F('a1', '13F-HR', '20221114183100', '2022-06-30', ['AAA111']), F('a2', '13F-HR', '20221114194000', '2022-09-30', ['AAA111', 'BBB222'])];
  assert.equal(classify13F({ adsh: 'a1', cusip6: 'AAA111' }, fl).cls, 'FIRST_OBSERVED_NO_BASELINE', 'first ever');
  assert.equal(classify13F({ adsh: 'a2', cusip6: 'BBB222' }, fl).cls, 'FIRST_OBSERVED_NO_BASELINE', 'baseline filed minutes earlier the same evening');
});
test('NVIDIA 2024-02-14 first-ever 13F (SOUN) has no baseline', () => {
  assert.equal(classify13F({ adsh: 'n1', cusip: '836100107' }, [F('n1', '13F-HR', '20240214161200', '2023-12-31', ['836100'])]).cls, 'FIRST_OBSERVED_NO_BASELINE');
});
test('a real new position: an on-time 13F against the previous quarter filed on an earlier day', () => {
  const fl = [F('q1', '13F-HR', '20240214160000', '2023-12-31', ['AAA111']), F('q2', '13F-HR', '20240514160000', '2024-03-31', ['AAA111', 'CCC333'])];
  assert.equal(classify13F({ adsh: 'q2', cusip6: 'CCC333' }, fl).cls, 'NEW_POSITION_CONFIRMED');
  const gap = [F('g1', '13F-HR', '20230214160000', '2022-12-31', ['AAA111']), F('g2', '13F-HR', '20240514160000', '2024-03-31', ['CCC333'])];
  assert.equal(classify13F({ adsh: 'g2', cusip6: 'CCC333' }, gap).cls, 'FIRST_OBSERVED_NO_BASELINE', 'previous quarter missing');
});
test('late filings and amended / confidential holdings', () => {
  const late = [F('l1', '13F-HR', '20230214160000', '2022-12-31', ['AAA111']), F('l2', '13F-HR', '20231101160000', '2023-03-31', ['CCC333'])];
  assert.equal(classify13F({ adsh: 'l2', cusip6: 'CCC333' }, late).cls, 'LATE_FILING');
  const conf = [F('c1', '13F-HR', '20240214160000', '2023-12-31', ['AAA111']), F('c2', '13F-HR', '20240514160000', '2024-03-31', ['CCC333']), F('c3', '13F-HR/A', '20240901160000', '2023-12-31', ['CCC333'])];
  assert.equal(classify13F({ adsh: 'c2', cusip6: 'CCC333' }, conf).cls, 'AMENDED_OR_CONFIDENTIAL', 'a later amendment for the previous quarter shows it was held');
});
test('13D / 13G', () => {
  assert.equal(classifyDG({ kind: 'SC 13G', firstOnSubject: true }).cls, '13D/13G_FIRST'); assert.equal(classifyDG({ kind: 'SC 13G', firstOnSubject: false }).cls, '13D/13G_REPEAT');
  assert.equal(classifyDG({ kind: 'SC 13G/A', firstOnSubject: true }).cls, 'AMENDED_OR_CONFIDENTIAL');
  assert.equal(classifyEvent({ kind: 'SC 13D', firstOnSubject: true }, []).cls, '13D/13G_FIRST'); assert.equal(classifyEvent({ kind: '13F-HR', adsh: 'x' }, []).cls, 'FIRST_OBSERVED_NO_BASELINE');
});
