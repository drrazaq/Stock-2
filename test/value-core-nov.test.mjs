// Seams: value-core.mjs latestReport (B-FCF-EM1) and npyAt (V17 net payout yield), Agent B 3 Nov 2026. Pure functions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { latestReport, npyAt } from '../value-core.mjs';

const R = [{ d: '2023-02-01', t: 'amc', a: 1.0, e: 0.9 }, { d: '2023-05-02', t: 'bmo', a: 0.8, e: 0.85 }, { d: '2023-08-01', t: 'amc', a: 1.1, e: 1.1 }];
test('latestReport uses only reports dated before the day, not older than 120 days', () => {
  assert.deepEqual(latestReport(R, '2023-05-03'), { d: '2023-05-02', a: 0.8, e: 0.85, beat: false });
  assert.equal(latestReport(R, '2023-05-02').beat, true);                 // the report of that day is not used yet
  assert.equal(latestReport(R, '2023-08-02').beat, false);                // equal is not a beat
  assert.equal(latestReport(R, '2024-01-15'), null);                      // last report 167 days old
  assert.equal(latestReport([{ d: '2023-01-01', a: null, e: 1 }], '2023-01-05').beat, null);
});

const yr = (v, f = '2023-02-20') => [{ s: '2022-01-01', e: '2022-12-31', v, f }];
test('npyAt = (dividends + buybacks - issuance) / market value, point in time', () => {
  const co = { div: { PaymentsOfDividends: yr(30) }, rep: { PaymentsForRepurchaseOfCommonStock: yr(50) }, iss: { ProceedsFromIssuanceOfCommonStock: yr(10) } };
  assert.equal(npyAt(co, '2023-03-01', 1000).npy, 0.07);
  assert.equal(npyAt(co, '2023-02-20', 1000), null);                      // filed that day: not known yet
  assert.equal(npyAt({ div: {}, rep: {}, iss: co.iss }, '2023-03-01', 1000), null);   // no payout known: not ranked
  assert.equal(npyAt({ div: {}, rep: co.rep, iss: {} }, '2023-03-01', 1000).npy, 0.05);
  assert.equal(npyAt(co, '2023-09-01', 1000), null);                      // period ended 244 days before: stale
  assert.equal(npyAt(co, '2023-03-01', 100), null);                       // 70% yield: data error
  const other = { ...co, iss: { ProceedsFromIssuanceOfCommonStock: [{ s: '2021-07-01', e: '2022-06-30', v: 999, f: '2022-08-01' }] } };
  assert.equal(npyAt(other, '2023-03-01', 1000).npy, 0.08);               // issuance of another period end counts 0
});
