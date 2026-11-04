// Seams: research-core.mjs IDEA 9 (daily researcher, 4 Nov 2026): goodwill impairments as an AVOID / SELL-warning check. Rows from SEC
// company facts (durations + assets), the new-impairment netting, event timing, the assets floor, the data rule and pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, GWI_IDS, GWI, gwiRows, gwiEvents, gwiDataRule, preRegister, ONE_OPEN } from '../research-core.mjs';

const d = (start, end, val, filed, form = '10-Q') => ({ start, end, val, filed, form });
const a = (end, val, filed, form = '10-Q') => ({ end, val, filed, form });
const cf = (imp, assets) => ({ facts: { 'us-gaap': { GoodwillImpairmentLoss: { units: { USD: imp } }, Assets: { units: { USD: assets } } } } });

test('three GWI rules, all AVOID (never buys); holds and thresholds fixed; one open trade per stock', () => {
  assert.deepEqual(GWI_IDS, ['RQ-GWI-AV126', 'RQ-GWI-AV63', 'RQ-GWI-BIG126']);
  assert.deepEqual(GWI_IDS.map(id => RULES[id].hold), [126, 63, 126]);
  assert.deepEqual(GWI_IDS.map(id => RULES[id].min), [0.01, 0.01, 0.05]);
  for (const id of GWI_IDS) { assert.equal(RULES[id].kind, 'avoid'); assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); assert.ok(!BUY_IDS.includes(id)); }
  assert.equal(GWI.tag, 'GoodwillImpairmentLoss'); assert.equal(GWI.maxLag, 120); assert.equal(GWI.minAssets, 10e6);
});

test('rows: durations only, original 10-Q/10-K, deduplicated; assets instants > 0', () => {
  const r = gwiRows(cf([d('2023-01-01', '2023-03-31', 5e6, '2023-05-01'), d('2023-01-01', '2023-03-31', 5e6, '2023-05-01'), { end: '2023-03-31', val: 1, filed: '2023-05-01', form: '10-Q' },
    d('2023-01-01', '2023-03-31', 9e6, '2023-06-01', '10-Q/A'), d('2023-01-01', '2023-03-31', -1, '2023-05-01')], [a('2023-03-31', 100e6, '2023-05-01'), a('2023-03-31', 0, '2023-05-01')]));
  assert.deepEqual(r.f, [['2023-01-01', '2023-03-31', 5e6, '2023-05-01', '10-Q']]);
  assert.deepEqual(r.a, [['2023-03-31', 100e6, '2023-05-01']]);
  assert.deepEqual(gwiRows(null), { f: [], a: [] });
});

test('events: new impairment nets the same-start year-to-date already reported; zero-increment and late filings are no events', () => {
  const rows = gwiRows(cf([
    d('2022-01-01', '2022-03-31', 2e6, '2022-05-02'),                                   // Q1: 2M new
    d('2022-04-01', '2022-06-30', 0, '2022-08-01'), d('2022-01-01', '2022-06-30', 2e6, '2022-08-01'), // Q2: YTD unchanged -> no event
    d('2022-01-01', '2022-12-31', 12e6, '2023-02-20', '10-K'),                          // 10-K: 12M annual - 2M YTD = 10M new
    d('2023-01-01', '2023-03-31', 3e6, '2023-09-30')],                                  // 183 days late -> no event
    [a('2022-03-31', 100e6, '2022-05-02'), a('2022-06-30', 100e6, '2022-08-01'), a('2022-12-31', 200e6, '2023-02-20', '10-K'), a('2023-03-31', 200e6, '2023-09-30')]));
  const ev = gwiEvents(rows);
  assert.deepEqual(ev.map(e => [e.d, e.end, e.form, e.imp, e.s]), [['2022-05-02', '2022-03-31', '10-Q', 2e6, 0.02], ['2023-02-20', '2022-12-31', '10-K', 10e6, 0.05]]);
});

test('events: small companies (assets under 10M) and missing assets give no event; an older period filed later is no event', () => {
  const rows = gwiRows(cf([d('2022-01-01', '2022-03-31', 1e6, '2022-05-02'), d('2022-04-01', '2022-06-30', 1e6, '2022-08-01'), d('2021-10-01', '2021-12-31', 5e6, '2022-09-01')],
    [a('2022-03-31', 5e6, '2022-05-02')]));
  assert.deepEqual(gwiEvents(rows), []);
});

test('data rule: coverage, mapping and the event count reader check', () => {
  assert.equal(gwiDataRule({ ciks: 100, looked: 96, liqMonths: 100, liqMapped: 90, events: 300 }).ok, true);
  const bad = gwiDataRule({ ciks: 100, looked: 90, liqMonths: 100, liqMapped: 80, events: 299 });
  assert.equal(bad.ok, false); assert.match(bad.why, /95% needed/); assert.match(bad.why, /85% needed/); assert.match(bad.why, /300 needed/);
});

test('pre-registration writes the three GWI entries once, as avoid checks', () => {
  const LB = { strategies: [] }; preRegister(LB); const g = LB.strategies.filter(x => /^RQ-GWI-/.test(x.id));
  assert.deepEqual(g.map(x => x.id), GWI_IDS); assert.ok(g.every(x => x.kind === 'avoid' && /pre-registered 2026-11-04/.test(x.status) && /Never a buy/.test(x.explain)));
  const n = LB.strategies.length; preRegister(LB); assert.equal(LB.strategies.length, n);
});
