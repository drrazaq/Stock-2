// Seams: value-core.mjs spinOffFlag / recentFilings (dips watch list spin-off check in quality.mjs), Agent B 17 Nov 2026.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spinOffFlag, recentFilings } from '../value-core.mjs';

const dates = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06'];
const spun = [64, 65, 65.5, 9.6, 9.5, 9.4, 9.43];   // CTVA-like: the distribution day falls 85%

test('spin-off: 8-K item 2.01 within 10 days after a 15%+ one-day fall is flagged', () => {
  const f = spinOffFlag(dates, spun, [{ form: '8-K', d: '2026-10-05', items: '1.01,2.01,9.01' }], '2025-11-01');
  assert.equal(f.filed, '2026-10-05'); assert.equal(f.day, '2026-10-01'); assert.ok(f.drop < -0.8);
});
test('spin-off: no item 2.01, or 2.01 without a big fall, is not flagged', () => {
  assert.equal(spinOffFlag(dates, spun, [{ form: '8-K', d: '2026-10-05', items: '2.02,9.01' }], '2025-11-01'), null);
  assert.equal(spinOffFlag(dates, spun, [{ form: '8-K', d: '2026-10-05', items: '12.01' }], '2025-11-01'), null);   // not item 2.01
  const flat = [64, 65, 65.5, 60, 59, 58, 58];   // a 8% fall: an acquisition closing, not a spin-off
  assert.equal(spinOffFlag(dates, flat, [{ form: '8-K', d: '2026-10-05', items: '2.01,9.01' }], '2025-11-01'), null);
  assert.equal(spinOffFlag(dates, spun, [{ form: '10-Q', d: '2026-10-05', items: '2.01' }], '2025-11-01'), null);   // 8-K only
});
test('spin-off: filing outside the window or the fall more than 10 days before the filing is not flagged', () => {
  assert.equal(spinOffFlag(dates, spun, [{ form: '8-K', d: '2026-10-05', items: '2.01' }], '2026-10-06'), null);
  assert.equal(spinOffFlag(dates, spun, [{ form: '8-K', d: '2026-10-20', items: '2.01' }], '2025-11-01'), null);
  assert.ok(spinOffFlag(dates, spun, [{ form: '8-K/A', d: '2026-10-06', items: '2.01' }], '2025-11-01'));
});
test('recentFilings reads the SEC submissions layout', () => {
  const j = { filings: { recent: { form: ['8-K', '10-Q'], filingDate: ['2026-10-05', '2026-11-05'], items: ['1.01,2.01,9.01', ''] } } };
  assert.deepEqual(recentFilings(j), [{ form: '8-K', d: '2026-10-05', items: '1.01,2.01,9.01' }, { form: '10-Q', d: '2026-11-05', items: '' }]);
  assert.deepEqual(recentFilings(null), []);
});
