import test from 'node:test';
import assert from 'node:assert/strict';
import { isFreshPriceAge, paperSignalAgeReason } from '../ignition-gates.mjs';
import { scoreIgnitionPaper } from '../ignition-paper.mjs';

test('freshness gate accepts only known, finite ages from 0 through 3 minutes', () => {
  for (const n of [0, 0.1, 1, 3]) assert.equal(isFreshPriceAge(n), true, `${n} should be fresh`);
  for (const n of [-0.01, 3.001, NaN, Infinity, -Infinity, null, undefined, '1']) assert.equal(isFreshPriceAge(n), false, `${String(n)} should not be fresh`);
});

test('age rejection distinguishes stale, unknown, and future-dated prices', () => {
  assert.match(paperSignalAgeReason(3.1), /stale signal/);
  assert.match(paperSignalAgeReason(undefined), /unknown signal price age/);
  assert.match(paperSignalAgeReason(NaN), /unknown signal price age/);
  assert.match(paperSignalAgeReason(-0.5), /future-dated/);
  assert.equal(paperSignalAgeReason(3), null);
});

const bars = { results: [
  { t: Date.UTC(2026, 9, 20, 14, 0), o: 10, h: 10, l: 10, c: 10, v: 1000 },
  { t: Date.UTC(2026, 9, 20, 14, 1), o: 10, h: 10.5, l: 10, c: 10.5, v: 1000 },
  { t: Date.UTC(2026, 9, 20, 19, 59), o: 11, h: 11, l: 11, c: 11, v: 1000 },
] };
const signal = (sym, delay) => ({ v: 3, d: '2026-10-20', sym, rule: 'IG8', m: 600, price: 10, prevC: 9, delay });

async function run(L, IR = { done: {} }) {
  const asked = [];
  const out = await scoreIgnitionPaper(L, IR, { today: '2026-10-22', minuteBars: async (sym, d) => { asked.push(sym + ' ' + d); return bars; } });
  return { ...out, IR, asked };
}

test('paper scoring excludes missing, non-finite, negative, and stale signal ages', async () => {
  const r = await run([signal('FRESH', 1), signal('MISSING', undefined), signal('NAN', NaN), signal('FUTURE', -2), signal('STALE', 4)]);
  assert.deepEqual(r.asked, ['FRESH 2026-10-20']);
  assert.equal(r.record['IG8/close'].n, 1);
  assert.match(r.IR.done['2026-10-20|MISSING|IG8'].res, /unknown signal price age/);
  assert.match(r.IR.done['2026-10-20|NAN|IG8'].res, /unknown signal price age/);
  assert.match(r.IR.done['2026-10-20|FUTURE|IG8'].res, /future-dated/);
  assert.match(r.IR.done['2026-10-20|STALE|IG8'].res, /stale signal/);
});

test('legacy scored outcomes with missing or invalid signal age are removed from aggregate records', async () => {
  const old = { done: {
    '2026-10-19|OLDM|IG8': { d: '2026-10-19', sym: 'OLDM', rule: 'IG8', close: 0.5, close_s: 0.49 },
    '2026-10-19|OLDF|IG8': { d: '2026-10-19', sym: 'OLDF', rule: 'IG8', close: 0.4, close_s: 0.39 },
  } };
  const r = await run([{ ...signal('OLDM', undefined), d: '2026-10-19' }, { ...signal('OLDF', -1), d: '2026-10-19' }, signal('FRESH', 1)], old);
  assert.match(r.IR.done['2026-10-19|OLDM|IG8'].res, /unknown signal price age/);
  assert.match(r.IR.done['2026-10-19|OLDF|IG8'].res, /future-dated/);
  assert.equal(r.record['IG8/close'].n, 1);
});
