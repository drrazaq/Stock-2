// Seams: research-core.mjs IDEA 13 (daily researcher, 9 Nov 2026): organization capital (Eisfeldt and Papanikolaou 2013). Rows from SEC
// company facts (annual SG&A from 10-Ks, assets), the year chain, the perpetual inventory, the event rule, the assets scaling and floor,
// the data rule and the pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, OC_IDS, OC, ocRows, ocStock, ocChain, ocEvents, ocDataRule, preRegister, ONE_OPEN } from '../research-core.mjs';

const y = (start, end, val, filed, form = '10-K') => ({ start, end, val, filed, form, accn: 'x' });
const a = (end, val, filed, form = '10-K') => ({ end, val, filed, form, accn: 'x' });
const cf = (sga, assets) => ({ facts: { 'us-gaap': { SellingGeneralAndAdministrativeExpense: { units: { USD: sga } }, Assets: { units: { USD: assets } } } } });
// a 10-K per year 2014..2023 (fiscal year = calendar year), each restating the prior 2 years
const years = (vals, first = 2014) => { const out = []; vals.forEach((v, k) => { const yr = first + k, filed = (yr + 1) + '-02-20';
  for (let b = 0; b <= Math.min(2, k); b++) out.push(y((yr - b) + '-01-01', (yr - b) + '-12-31', vals[k - b], filed)); }); return out; };

test('two OC buy rules; holds fixed; one open trade per stock', () => {
  assert.deepEqual(OC_IDS, ['RQ-OC-126', 'RQ-OC-252']);
  assert.deepEqual(OC_IDS.map(id => RULES[id].hold), [126, 252]);
  for (const id of OC_IDS) { assert.equal(RULES[id].kind, 'buy'); assert.equal(RULES[id].side, 'top'); assert.ok(IDS.includes(id)); assert.ok(BUY_IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); }
  assert.equal(OC.dep, 0.15); assert.equal(OC.g, 0.10); assert.equal(OC.minYears, 5); assert.equal(OC.minAssets, 10e6);
});
test('rows: annual durations from original 10-Ks only, deduplicated; assets instants', () => {
  const r = ocRows(cf([y('2020-01-01', '2020-12-31', 5e6, '2021-02-20'), y('2020-01-01', '2020-12-31', 5e6, '2021-02-20'), y('2020-10-01', '2020-12-31', 1e6, '2021-02-20'),
    y('2020-01-01', '2020-12-31', 4e6, '2021-03-01', '10-K/A'), y('2020-01-01', '2020-12-31', 4e6, '2020-11-01', '10-Q'), y('2006-01-01', '2006-12-31', 1e6, '2007-02-01')],
    [a('2020-12-31', 100e6, '2021-02-20'), a('2020-12-31', 100e6, '2021-02-20'), { start: '2020-01-01', end: '2020-12-31', val: 1, filed: '2021-02-20', form: '10-K' }]));
  assert.deepEqual(r.y, [['2020-01-01', '2020-12-31', 5e6, '2021-02-20']]);
  assert.deepEqual(r.a, [['2020-12-31', 100e6, '2021-02-20']]);
  assert.deepEqual(ocRows(null), { y: [], a: [] });
});
test('perpetual inventory: initial s1 / 0.25, then 0.85 OC + s each year; 5+ positive years', () => {
  assert.equal(ocStock([1, 1, 1, 1]), null);
  assert.equal(ocStock([1, 1, 0, 1, 1]), null);
  let oc = 10 / 0.25; for (const v of [10, 10, 10, 10, 10]) oc = 0.85 * oc + v;
  assert.ok(Math.abs(ocStock([10, 10, 10, 10, 10]) - oc) < 1e-9);
  // with 10% growth from the start, OC tracks s_t / (g + dep) x (1 + g) (the initial stock assumption is consistent)
  const gr = [100, 110, 121, 133.1, 146.41]; assert.ok(Math.abs(ocStock(gr) - 146.41 * 1.1 / 0.25) < 1e-6);
});
test('chain: consecutive years known on F, stops at a gap, point in time', () => {
  const r = ocRows(cf(years([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), []));
  assert.deepEqual(ocChain(r.y, '2023-12-31', '2024-02-20'), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(ocChain(r.y, '2023-12-31', '2024-02-19'), []);     // the 10-K was not public yet
  assert.deepEqual(ocChain(r.y, '2020-12-31', '2021-02-20'), [1, 2, 3, 4, 5, 6, 7]);
  const gap = ocRows(cf(years([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).filter(x => x.end !== '2017-12-31'), []));
  assert.deepEqual(ocChain(gap.y, '2023-12-31', '2024-02-20'), [5, 6, 7, 8, 9, 10]);
});
test('events: new year end, timely, OC / assets at E, assets floor, 5-year minimum, endFrom', () => {
  const sga = years([10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
  const assets = [a('2019-12-31', 200e6, '2020-02-20'), a('2020-12-31', 200e6, '2021-02-20'), a('2021-12-31', 5e6, '2022-02-20'), a('2022-12-31', 100e6, '2023-02-20'), a('2023-12-31', 100e6, '2024-02-20')];
  const ev = ocEvents(ocRows(cf(sga, assets)));
  assert.deepEqual(ev.map(e => e.d), ['2020-02-20', '2021-02-20', '2023-02-20', '2024-02-20']);   // 2022: assets under 10M
  const last = ev.at(-1); assert.equal(last.end, '2023-12-31'); assert.equal(last.years, 10);
  assert.ok(Math.abs(last.g - ocStock(Array(10).fill(10)) / 100e6) < 1e-6);
  // late filing (over 120 days) and a too-short history are not events
  const late = ocEvents(ocRows(cf([...years([1, 1, 1, 1, 1], 2016).map(x => ({ ...x, filed: x.filed === '2021-02-20' ? '2021-06-01' : x.filed }))], [a('2020-12-31', 50e6, '2021-06-01')])));
  assert.equal(late.length, 0);
  const short = ocEvents(ocRows(cf(years([1, 1, 1, 1], 2017), [a('2020-12-31', 50e6, '2021-02-20')])));
  assert.equal(short.length, 0);
});
test('data rule and pre-registration', () => {
  assert.equal(ocDataRule({ ciks: 100, looked: 96, liqMonths: 100, liqMapped: 90, events: 3000 }).ok, true);
  const bad = ocDataRule({ ciks: 100, looked: 90, liqMonths: 100, liqMapped: 80, events: 10 });
  assert.equal(bad.ok, false); assert.match(bad.why, /95% needed/); assert.match(bad.why, /85% needed/); assert.match(bad.why, /3,000 needed/);
  const LB = { strategies: [] }; preRegister(LB); const mine = LB.strategies.filter(x => OC_IDS.includes(x.id));
  assert.equal(mine.length, 2); assert.match(mine[0].status, /pre-registered 2026-11-09/); assert.match(mine[0].explain, /IDEA 13/);
  assert.equal(preRegister(LB), 0);
});
