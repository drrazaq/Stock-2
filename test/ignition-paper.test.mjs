// Seam: scoreIgnitionPaper(signals, results, { today, minuteBars }) in ignition-paper.mjs (the morning paper scoring of fast alerts,
// called by fastmover-lab.mjs MODE=live). Guards the 22 Oct outside-review fix: a signal whose price was more than 3 minutes old
// when it fired is not a fair paper trade, so it must not enter the record (55 of 768 were stale). minuteBars is the Massive API
// (the system boundary), replaced here by fixed minute bars.
// Run: node test/ignition-paper.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreIgnitionPaper } from '../ignition-paper.mjs';

// 20 Oct 2026 is New York summer time: 10:00 New York = 14:00 UTC.
const at = (h, m) => Date.UTC(2026, 9, 20, h, m);
// the alert minute (10:00, 10.00), the fill minute (10:01, opens 10.00), and the last regular minute (15:59, closes 11.00)
const bars = { results: [
  { t: at(14, 0), o: 10, h: 10, l: 10, c: 10, v: 1000 },
  { t: at(14, 1), o: 10, h: 10.5, l: 10, c: 10.5, v: 1000 },
  { t: at(19, 59), o: 11, h: 11, l: 11, c: 11, v: 1000 },
] };
const signal = (sym, delay) => ({ v: 3, d: '2026-10-20', sym, rule: 'IG8', m: 600, price: 10, prevC: 9, delay });

async function run(L, IR = { done: {} }) {
  const asked = [];
  const out = await scoreIgnitionPaper(L, IR, { today: '2026-10-22', minuteBars: async (sym, d) => { asked.push(sym + ' ' + d); return bars; } });
  return { ...out, IR, asked };
}

test('a fresh signal is scored: bought 10.00 at the next minute open, sold 11.00 at the close, minus 1.4% cost = +8.6%', async () => {
  const r = await run([signal('FRSH', 1)]);
  assert.deepEqual(r.asked, ['FRSH 2026-10-20']);
  // cost at 10 USD = 0.9% + 0.5% (buying into a fast move); stress = 1.5x cost = 2.1%
  assert.equal(r.IR.done['2026-10-20|FRSH|IG8'].close, 0.086);
  assert.equal(r.IR.done['2026-10-20|FRSH|IG8'].close_s, 0.079);
  assert.equal(r.record['IG8/close'].n, 1);
});

test('a signal on a price more than 3 minutes old is not scored and not in the record', async () => {
  const r = await run([signal('FRSH', 1), signal('STAL', 8.8)]);
  assert.deepEqual(r.asked, ['FRSH 2026-10-20']);
  assert.match(r.IR.done['2026-10-20|STAL|IG8'].res, /stale signal/);
  assert.equal(r.record['IG8/close'].n, 1);
  assert.equal(r.record['IG8/close'].avg, 0.086);
});

test('a stale signal scored before the fix is taken out of the record', async () => {
  const old = { done: { '2026-10-19|OLDS|IG8': { d: '2026-10-19', sym: 'OLDS', rule: 'IG8', close: 0.5, close_s: 0.49, trail: 0.5, trail_s: 0.49, trail5: 0.5, trail5_s: 0.49 } } };
  const r = await run([{ ...signal('OLDS', 5), d: '2026-10-19' }, signal('FRSH', 0)], old);
  assert.match(r.IR.done['2026-10-19|OLDS|IG8'].res, /stale signal/);
  assert.equal(r.record['IG8/close'].n, 1);
});

test('exactly 3 minutes old still counts as fresh', async () => {
  const r = await run([signal('EDGE', 3)]);
  assert.equal(r.record['IG8/close'].n, 1);
});
