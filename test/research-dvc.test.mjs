// Seams: research-core.mjs IDEA 11 (daily researcher, 7 Nov 2026): dividend cuts as an AVOID / SELL-warning check (Michaely, Thaler and
// Womack 1995). Rows from SEC company facts (discrete quarters, tag order), the event rule, the year-ago match (filing's own comparative
// first), the split guard, the data rule and the pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, DVC_IDS, DVC, dvcRows, dvcEvents, dvcDataRule, splitShaped, preRegister, ONE_OPEN } from '../research-core.mjs';

const q = (start, end, val, filed, form = '10-Q') => ({ start, end, val, filed, form, accn: 'x' });
const cf = (dps, tot, tag = 'CommonStockDividendsPerShareDeclared') => ({ facts: { 'us-gaap': { [tag]: { units: { 'USD/shares': dps } }, ...(tot ? { DividendsCommonStock: { units: { USD: tot } } } : {}) } } });
test('three DIVCUT rules, all avoid checks (never buys), holds fixed, one open trade per stock', () => {
  assert.deepEqual(DVC_IDS, ['RQ-DIVCUT-AV126', 'RQ-DIVCUT-AV63', 'RQ-DIVCUT-BIG126']);
  assert.deepEqual(DVC_IDS.map(id => RULES[id].hold), [126, 63, 126]);
  assert.deepEqual(DVC_IDS.map(id => RULES[id].max), [0.75, 0.75, 0.5]);
  for (const id of DVC_IDS) { assert.equal(RULES[id].kind, 'avoid'); assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); assert.ok(!BUY_IDS.includes(id)); }
});
test('rows: discrete quarters only, original 10-Q/10-K, zero kept, tag order (Declared first, else CashPaid)', () => {
  const r = dvcRows(cf([q('2023-01-01', '2023-03-31', 0.5, '2023-05-01'), q('2023-01-01', '2023-03-31', 0.5, '2023-05-01'), q('2022-07-01', '2023-03-31', 1.5, '2023-05-01'),
    q('2023-04-01', '2023-06-30', 0, '2023-08-01'), q('2023-04-01', '2023-06-30', 0.1, '2023-08-01', '10-Q/A')]));
  assert.deepEqual(r.q, [['2023-01-01', '2023-03-31', 0.5, '2023-05-01', '10-Q'], ['2023-04-01', '2023-06-30', 0, '2023-08-01', '10-Q']]);
  assert.deepEqual(r.t, []);
  assert.equal(dvcRows(cf([q('2023-01-01', '2023-03-31', 0.2, '2023-05-01')], null, 'CommonStockDividendsPerShareCashPaid')).q.length, 1);
  assert.deepEqual(dvcRows(null), { q: [], t: [] });
});
test('events: new timely quarter vs the same quarter a year before; ratio; cut to zero counts', () => {
  const ev = dvcEvents(dvcRows(cf([
    q('2022-01-01', '2022-03-31', 0.40, '2022-05-02'), q('2022-04-01', '2022-06-30', 0.40, '2022-08-02'),
    q('2023-01-01', '2023-03-31', 0.20, '2023-05-03'),
    q('2023-04-01', '2023-06-30', 0, '2023-12-20'),                     // late (173 days): no event
    q('2024-01-01', '2024-03-31', 0.20, '2024-05-02')])));
  assert.deepEqual(ev.map(e => [e.d, e.end, e.ratio, e.guard]), [['2023-05-03', '2023-03-31', 0.5, 'shape'], ['2024-05-02', '2024-03-31', 1, null]]);
  const ev0 = dvcEvents(dvcRows(cf([q('2022-01-01', '2022-03-31', 0.40, '2022-05-02'), q('2023-01-01', '2023-03-31', 0, '2023-05-03')])));
  assert.deepEqual(ev0.map(e => [e.ratio, e.guard]), [[0, null]]);
  // no year-ago dividend (prior 0 or missing): no event
  assert.deepEqual(dvcEvents(dvcRows(cf([q('2022-01-01', '2022-03-31', 0, '2022-05-02'), q('2023-01-01', '2023-03-31', 0.1, '2023-05-03')]))), []);
});
test('year-ago value taken from the filing itself first (split-restated comparative)', () => {
  const ev = dvcEvents(dvcRows(cf([q('2022-01-01', '2022-03-31', 0.80, '2022-05-02'), q('2023-01-01', '2023-03-31', 0.40, '2023-05-03'), q('2022-01-01', '2022-03-31', 0.40, '2023-05-03')])));
  assert.deepEqual(ev.map(e => [e.prior, e.ratio]), [[0.40, 1]]);
});
test('split guard: per-share cut but total dividends kept -> guard "total"; total cut -> kept as a real cut', () => {
  const dps = [q('2022-01-01', '2022-03-31', 0.60, '2022-05-02'), q('2023-01-01', '2023-03-31', 0.30, '2023-05-03')];
  const keep = dvcEvents(dvcRows(cf(dps, [q('2022-01-01', '2022-03-31', 60e6, '2022-05-02'), q('2023-01-01', '2023-03-31', 59e6, '2023-05-03')])));
  assert.deepEqual(keep.map(e => [e.ratio, e.tot, e.guard]), [[0.5, 0.983333, 'total']]);
  const cut = dvcEvents(dvcRows(cf(dps, [q('2022-01-01', '2022-03-31', 60e6, '2022-05-02'), q('2023-01-01', '2023-03-31', 30e6, '2023-05-03')])));
  assert.deepEqual(cut.map(e => [e.ratio, e.tot, e.guard]), [[0.5, 0.5, null]]);
  assert.ok(splitShaped(0.5) && splitShaped(1 / 3) && splitShaped(0.25) && splitShaped(0.2) && !splitShaped(0.6) && !splitShaped(0) && !splitShaped(0.45));
});
test('data rule and pre-registration', () => {
  assert.equal(dvcDataRule({ ciks: 100, looked: 96, liqMonths: 100, liqMapped: 90, events: 150 }).ok, true);
  const bad = dvcDataRule({ ciks: 100, looked: 90, liqMonths: 100, liqMapped: 80, events: 10 });
  assert.equal(bad.ok, false); assert.match(bad.why, /95% needed/); assert.match(bad.why, /85% needed/); assert.match(bad.why, /150 needed/);
  const LB = { strategies: [] }; preRegister(LB);
  const mine = LB.strategies.filter(x => /^RQ-DIVCUT/.test(x.id));
  assert.equal(mine.length, 3); assert.ok(mine.every(x => /pre-registered 2026-11-07/.test(x.status) && x.kind === 'avoid'));
  assert.equal(preRegister(LB), 0);
});
