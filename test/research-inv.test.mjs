// Seams: research-core.mjs IDEA 8 (daily researcher, 3 Nov 2026): inventory changes (Thomas and Zhang 2002). Rows from SEC company facts
// (instants only), the event rule, the year-ago match, the average-assets scaling and floor, the data rule and the pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, INV_IDS, INV, invRows, invEvents, invDataRule, preRegister, ONE_OPEN } from '../research-core.mjs';

const v = (end, val, filed, form = '10-Q') => ({ end, val, filed, form, accn: 'x' });
const cf = (inv, assets) => ({ facts: { 'us-gaap': { InventoryNet: { units: { USD: inv } }, Assets: { units: { USD: assets } } } } });

test('three INV rules: two buys (bottom), one avoid (top); holds fixed; one open trade per stock', () => {
  assert.deepEqual(INV_IDS, ['RQ-INV-LOW126', 'RQ-INV-LOW252', 'RQ-INV-TOP126']);
  assert.deepEqual(INV_IDS.map(id => RULES[id].hold), [126, 252, 126]);
  assert.deepEqual(INV_IDS.map(id => RULES[id].kind), ['buy', 'buy', 'avoid']);
  assert.deepEqual(INV_IDS.map(id => RULES[id].side), ['bottom', 'bottom', 'top']);
  for (const id of INV_IDS) { assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); }
  assert.ok(BUY_IDS.includes('RQ-INV-LOW126') && !BUY_IDS.includes('RQ-INV-TOP126'));
  assert.equal(INV.minAssets, 10e6); assert.equal(INV.maxLag, 120); assert.equal(INV.tag, 'InventoryNet');
});

test('rows: instants only, original 10-Q/10-K, deduplicated, zero inventory kept, negative dropped', () => {
  const r = invRows(cf([v('2023-03-31', 5e6, '2023-05-01'), v('2023-03-31', 5e6, '2023-05-01'), { start: '2023-01-01', end: '2023-03-31', val: 1, filed: '2023-05-01', form: '10-Q' },
    v('2023-03-31', 1e6, '2023-05-01', '10-Q/A'), v('2022-03-31', 0, '2022-05-02'), v('2022-06-30', -1, '2022-08-01')],
    [v('2022-03-31', 100e6, '2022-05-02'), v('2022-03-31', 0, '2022-05-02')]));
  assert.deepEqual(r.v, [['2022-03-31', 0, '2022-05-02', '10-Q'], ['2023-03-31', 5e6, '2023-05-01', '10-Q']]);
  assert.deepEqual(r.a, [['2022-03-31', 100e6, '2022-05-02']]);
  assert.deepEqual(invRows(null), { v: [], a: [] });
});

test('events: new latest balance, timely, (current - year-ago) / average assets; 10-K year ends count', () => {
  const rows = invRows(cf([
    v('2021-12-31', 20e6, '2022-02-20', '10-K'), v('2022-03-31', 10e6, '2022-05-02'),
    v('2022-12-31', 26e6, '2023-02-21', '10-K'), v('2021-12-31', 20e6, '2023-02-21', '10-K'),
    v('2023-03-31', 4e6, '2023-05-04'), v('2022-12-31', 26e6, '2023-05-04'),
    v('2023-06-30', 9e6, '2023-12-20'),            // late (173 days): no event
    v('2022-09-30', 7e6, '2023-07-01')],           // older balance filed later: no event
    [v('2021-12-31', 100e6, '2022-02-20', '10-K'), v('2022-03-31', 100e6, '2022-05-02'), v('2022-12-31', 140e6, '2023-02-21', '10-K'), v('2023-03-31', 200e6, '2023-05-04')]));
  const ev = invEvents(rows);
  assert.deepEqual(ev.map(e => [e.d, e.end, e.form, e.g]), [['2023-02-21', '2022-12-31', '10-K', 0.05], ['2023-05-04', '2023-03-31', '10-Q', -0.04]]);
  assert.equal(ev[1].prior, 10e6); assert.equal(ev[1].a0, 100e6); assert.equal(ev[1].a1, 200e6);
});

test('events: no year-ago inventory, zero year-ago inventory, assets unknown by F, or assets under 10M -> no event', () => {
  const two = (p, as) => invEvents(invRows(cf([v('2022-03-31', p, '2022-05-02'), v('2023-03-31', 5e6, '2023-05-02')], as)));
  assert.deepEqual(two(0, [v('2022-03-31', 50e6, '2022-05-02'), v('2023-03-31', 50e6, '2023-05-02')]), []);
  assert.deepEqual(two(2e6, [v('2022-03-31', 50e6, '2023-06-01'), v('2023-03-31', 50e6, '2023-05-02')]), []);
  assert.deepEqual(two(2e6, [v('2022-03-31', 9e6, '2022-05-02'), v('2023-03-31', 50e6, '2023-05-02')]), []);
  assert.equal(two(2e6, [v('2022-03-31', 50e6, '2022-05-02'), v('2023-03-31', 50e6, '2023-05-02')])[0].g, 0.06);
  assert.deepEqual(invEvents(invRows(cf([v('2023-03-31', 5e6, '2023-05-02')], [v('2023-03-31', 50e6, '2023-05-02')]))), []);
});

test('data rule: 95% looked up, 85% mapped, 10,000 events', () => {
  assert.equal(invDataRule({ ciks: 100, looked: 96, liqMonths: 100, liqMapped: 90, events: 12000 }).ok, true);
  const bad = invDataRule({ ciks: 100, looked: 90, liqMonths: 100, liqMapped: 80, events: 900 });
  assert.equal(bad.ok, false); assert.match(bad.why, /95% needed/); assert.match(bad.why, /85% needed/); assert.match(bad.why, /10,000 needed/);
});

test('pre-registration: three RQ-INV entries, once, with sources and holds', () => {
  const LB = { strategies: IDS.filter(id => !INV_IDS.includes(id)).map(id => ({ id })) };
  assert.equal(preRegister(LB), 3); assert.equal(preRegister(LB), 0);
  const e = LB.strategies.filter(x => x.id.startsWith('RQ-INV'));
  assert.deepEqual(e.map(x => x.hold), [126, 252, 126]);
  for (const x of e) { assert.match(x.status, /pre-registered 2026-11-03/); assert.ok(x.sources.length >= 1); assert.match(x.explain, /IDEA 8/); }
});
