// Seams: research-core.mjs IDEA 12 (daily researcher, 8 Nov 2026): distress risk (Campbell, Hilscher and Szilagyi 2008 failure probability)
// as an AVOID / SELL-warning check. Rows from SEC company facts, quarterly net income (incl. the derived Q4), the event rule, market inputs,
// the logit score, the split guard on share counts, the data rule and the pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, DST_IDS, DST, dstRows, dstEvents, dstQuarterNI, dstMarket, dstScore, dstShares, dstDataRule, preRegister, ONE_OPEN } from '../research-core.mjs';

const d = (start, end, val, filed, form = '10-Q') => ({ start, end, val, filed, form });
const i = (end, val, filed, form = '10-Q') => ({ end, val, filed, form });
const cf = (ni, inst = {}) => ({ facts: { 'us-gaap': { NetIncomeLoss: { units: { USD: ni } }, ...Object.fromEntries(Object.entries(inst).map(([k, v]) => [k, { units: { USD: v } }])) } } });

test('three DIST rules, all avoid checks (never buys), holds and thresholds fixed, one open trade per stock', () => {
  assert.deepEqual(DST_IDS, ['RQ-DIST-AV126', 'RQ-DIST-AV63', 'RQ-DIST-T10']);
  assert.deepEqual(DST_IDS.map(id => RULES[id].hold), [126, 63, 126]);
  assert.deepEqual(DST_IDS.map(id => RULES[id].min), [0.95, 0.95, 0.90]);
  for (const id of DST_IDS) { assert.equal(RULES[id].kind, 'avoid'); assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); assert.ok(!BUY_IDS.includes(id)); }
  assert.deepEqual(DST.coef, { c: -9.164, nimta: -20.264, tlmta: 1.416, exret: -7.129, sigma: 1.411, rsize: -0.045, cashmta: -2.132, mb: 0.075, price: -0.058 });
});

test('rows: quarter / 9-month / year durations of net income, originals only; instants by key', () => {
  const r = dstRows(cf([d('2023-01-01', '2023-03-31', 10, '2023-05-01'), d('2023-01-01', '2023-06-30', 20, '2023-08-01'), d('2023-01-01', '2023-09-30', 30, '2023-11-01'),
    d('2023-01-01', '2023-12-31', 45, '2024-02-20', '10-K'), d('2023-01-01', '2023-03-31', 11, '2023-06-01', '10-Q/A')], { Liabilities: [i('2023-03-31', 500, '2023-05-01')], Assets: [i('2023-03-31', 900, '2023-05-01')] }));
  assert.deepEqual(r.n.map(x => x[5]), [89, 272, 364]);            // the 6-month row is dropped, the amendment too
  assert.deepEqual(r.i, { L: [['2023-03-31', 500, '2023-05-01']] });
  assert.deepEqual(dstRows(null), { n: [], i: {} });
});

test('quarter net income: discrete first, else fiscal year minus the 9 months with the same start', () => {
  const r = dstRows(cf([d('2023-01-01', '2023-09-30', 30, '2023-11-01'), d('2023-01-01', '2023-12-31', 45, '2024-02-20', '10-K'), d('2023-07-01', '2023-09-30', 8, '2023-11-01')]));
  assert.equal(dstQuarterNI(r.n, '2023-12-31', '2024-02-20'), 15);
  assert.equal(dstQuarterNI(r.n, '2023-09-30', '2024-02-20'), 8);
  assert.equal(dstQuarterNI(r.n, '2023-12-31', '2024-02-19'), null);   // not public yet
});

test('events: new timely quarter, NI for E plus 1+ earlier quarter, liabilities fallback, cash + short-term investments', () => {
  const ni = [d('2022-10-01', '2022-12-31', 5, '2023-02-01'), d('2023-01-01', '2023-03-31', -10, '2023-05-01'), d('2023-04-01', '2023-06-30', -20, '2023-12-20')];
  const inst = { LiabilitiesAndStockholdersEquity: [i('2023-03-31', 1000, '2023-05-01')], StockholdersEquity: [i('2023-03-31', 300, '2023-05-01'), i('2022-12-31', 320, '2023-02-01')],
    CashAndCashEquivalentsAtCarryingValue: [i('2023-03-31', 50, '2023-05-01')], ShortTermInvestments: [i('2023-03-31', 25, '2023-05-01')] };
  const ev = dstEvents(dstRows(cf(ni, inst)));
  assert.equal(ev.length, 1);   // 2022-12-31: no balance sheet at E; 2023-06-30 filed 173 days late
  assert.deepEqual(ev[0], { d: '2023-05-01', end: '2023-03-31', form: '10-Q', ni: [-10, 5, null, null], tl: 700, be: 300, cash: 75 });
  // only one quarter of NI: dropped
  assert.deepEqual(dstEvents(dstRows(cf([d('2023-01-01', '2023-03-31', -10, '2023-05-01')], inst))), []);
});

test('market inputs: excess return vs SPY (weights halve every 3 months), annualised volatility, minimum history', () => {
  const t = 130, c = Array.from({ length: t + 1 }, (_, k) => 100 * Math.exp(0.001 * k)), s = Array.from({ length: t + 1 }, () => 400);
  const m = dstMarket(c, s, t);
  assert.equal(m.months, 6); assert.ok(Math.abs(m.exret - 0.021) < 1e-9); assert.ok(m.sigma < 1e-9); assert.equal(m.rets, 63);
  const short = dstMarket(c, s, 70); assert.equal(short.exret, null);                 // 3 months only (4 needed)
  const cz = c.slice(); for (let k = 80; k <= 130; k++) cz[k] = NaN; assert.equal(dstMarket(cz, s, t).sigma, null);
});

test('score: the published logit; worse finances -> higher failure probability', () => {
  const base = { ni: [10, 10, 10, 10], tl: 400, be: 600, cash: 100, me: 1000, exret: 0, sigma: 0.3, price: 50, spy: 500 };
  const a = dstScore(base);
  const P = { nimta: 10 / 1400, tlmta: 400 / 1400, exret: 0, sigma: 0.3, rsize: Math.log(1000 / (500 * 8.6e10)), cashmta: 100 / 1400, mb: 1000 / (600 + 40), price: Math.log(15) };
  let lp = -9.164; for (const k of Object.keys(P)) lp += DST.coef[k] * P[k];
  assert.ok(Math.abs(a.lp - lp) < 1e-5);
  const b = dstScore({ ...base, ni: [-200, -150, null, null], exret: -0.2, sigma: 1.2, price: 6, me: 300 });
  assert.ok(b.lp > a.lp + 3);
  assert.equal(dstScore({ ...base, ni: [null, 1, 1, 1] }), null); assert.equal(dstScore({ ...base, exret: null }), null);
  assert.ok(dstScore({ ...base, be: -5000 }).parts.mb === 1000);       // adjusted book equity floored at 1 USD
});

test('share counts: 30-day lag; a split-shaped jump after the count drops it', () => {
  const rows = [['2023-01-31', 100e6], ['2023-04-30', 102e6], ['2023-07-31', 104e6]];
  assert.deepEqual(dstShares(rows, '2023-06-15'), { sh: 102e6, at: '2023-04-30' });
  assert.equal(dstShares(rows, '2023-02-15'), null);
  assert.deepEqual(dstShares([['2023-01-31', 100e6], ['2023-04-30', 400e6]], '2023-03-15'), { split: true });
  assert.deepEqual(dstShares([['2023-01-31', 100e6], ['2023-04-30', 170e6]], '2023-03-15'), { sh: 100e6, at: '2023-01-31' });   // dilution, not a split
});

test('data rule and pre-registration', () => {
  assert.equal(dstDataRule({ ciks: 100, looked: 96, liqMonths: 100, liqMapped: 90, scored: 9000, top: 200 }).ok, true);
  const bad = dstDataRule({ ciks: 100, looked: 96, liqMonths: 100, liqMapped: 90, scored: 7000, top: 100 });
  assert.equal(bad.ok, false); assert.match(bad.why, /8000 needed/); assert.match(bad.why, /150 needed/);
  const LB = { strategies: [] }; preRegister(LB, '2026-10-25');
  const mine = LB.strategies.filter(x => DST_IDS.includes(x.id));
  assert.equal(mine.length, 3); for (const x of mine) { assert.match(x.status, /pre-registered 2026-11-08/); assert.equal(x.kind, 'avoid'); }
  const n = LB.strategies.length; preRegister(LB); assert.equal(LB.strategies.length, n);
});
