// Seams: squad10-core.mjs (SQUAD 10, 24 Oct 2026: halal core baskets vs SPUS). Shariah screen (business, debt / cash+investments /
// receivables vs the 36-month average market value, interest income), balance sheet point in time, cap weights, the 15% cap, the MSCI
// momentum tilt, the bottom-third momentum cut, review months and the idempotent library pre-registration.
import test from 'node:test';
import assert from 'node:assert/strict';
import { impliedSplits, balanceAt, shariahPass, avgLast, capWeights, capAtMax, momTilt, dropBottomThird, weightsFor, reviewMonth, periodHold, preRegister, IDS, RULES } from '../squad10-core.mjs';

const near = (a, b, e = 1e-9) => Math.abs(a - b) < e, sum = (m) => [...m.values()].reduce((a, b) => a + b, 0);

test('Shariah screen: business, each ratio vs the average market value, interest income', () => {
  const base = { sic: '7372', mvAvg: 100, debt: 10, cashInv: 10, recv: 10, intInc: 1, rev: 100 };
  assert.equal(shariahPass(base).ok, true);
  assert.equal(shariahPass({ ...base, debt: 33 }).why, 'debt 33%+');
  assert.equal(shariahPass({ ...base, cashInv: 40 }).why, 'cash 33%+');
  assert.equal(shariahPass({ ...base, recv: 35 }).why, 'receivables 33%+');
  assert.equal(shariahPass({ ...base, intInc: 6 }).why, 'interest income 5%+');
  assert.equal(shariahPass({ ...base, intInc: null }).ok, true, 'interest income not reported = pass');
  assert.equal(shariahPass({ ...base, sic: '6022' }).why, 'business'); assert.equal(shariahPass({ ...base, sic: null }).ok, false);
  assert.equal(shariahPass({ ...base, debt: null }).why, 'debt unknown'); assert.equal(shariahPass({ ...base, cashInv: null }).why, 'cash unknown');
  assert.equal(avgLast([null, 50, 150]), 100); assert.equal(avgLast([1, 2, 3, 4], 2), 3.5); assert.equal(avgLast([null]), null);
});

test('balance sheet point in time: filed before the day, debt parts, cash + investments, receivables, TTM interest / revenue', () => {
  const r = (e, v, f, s) => ({ s: s || '', e, v, f });
  const co = { eq: { StockholdersEquity: [r('2024-03-31', 100, '2024-05-01'), r('2024-06-30', 120, '2024-08-01')] },
    nc: { LongTermDebtNoncurrent: [r('2024-06-30', 20, '2024-08-01')] }, cur: { LongTermDebtCurrent: [r('2024-06-30', 5, '2024-08-01')] }, short: { CommercialPaper: [r('2024-06-30', 3, '2024-08-01')] },
    cash: { CashAndCashEquivalentsAtCarryingValue: [r('2024-03-31', 9, '2024-05-01'), r('2024-06-30', 7, '2024-08-01')] }, sti: { ShortTermInvestments: [r('2024-06-30', 4, '2024-08-01')] },
    recv: { AccountsReceivableNetCurrent: [r('2024-06-30', 11, '2024-08-01')] },
    intInc: { InvestmentIncomeInterest: [r('2024-06-30', 2, '2024-08-01', '2023-07-01')] }, rev: { Revenues: [r('2024-06-30', 200, '2024-08-01', '2023-07-01')] } };
  const b = balanceAt(co, '2024-08-02'); assert.deepEqual(b, { end: '2024-06-30', debt: 28, cashInv: 11, recv: 11, intInc: 2, rev: 200 });
  const a = balanceAt(co, '2024-08-01'); assert.equal(a.end, '2024-03-31'); assert.equal(a.cashInv, 9); assert.equal(a.debt, 0, 'no debt item filed before the day = none');
  assert.equal(balanceAt({ eq: co.eq, cash: co.cash }, '2024-08-02').debt, 0, 'never reported debt = none');
  assert.equal(balanceAt(co, '2025-06-01').end, null, 'a balance sheet 200+ days old is unknown');
  // a bogus total of 0 does not hide the parts; the largest total wins; DebtCurrent replaces current LTD + short-term borrowings
  assert.equal(balanceAt({ ...co, tot: { LongTermDebt: [r('2024-06-30', 0, '2024-08-01')], DebtLongtermAndShorttermCombinedAmount: [r('2024-06-30', 40, '2024-08-01')] } }, '2024-08-02').debt, 40);
  assert.equal(balanceAt({ ...co, debtC: { DebtCurrent: [r('2024-06-30', 6, '2024-08-01')] } }, '2024-08-02').debt, 26);
  // nothing at the balance-sheet date: the latest item within 120 days before it
  assert.equal(balanceAt({ eq: co.eq, cash: co.cash, nc: { LongTermDebtNoncurrent: [r('2024-04-02', 50, '2024-05-01')] } }, '2024-08-02').debt, 50);
});

test('cap weights and the 15% cap: excess re-spread pro rata until none is above', () => {
  const w = capWeights([{ key: 'a', cap: 50 }, { key: 'b', cap: 30 }, { key: 'c', cap: 10 }, { key: 'd', cap: 10 }]); assert.ok(near(w.get('a'), 0.5));
  const c = capAtMax(new Map([['a', 0.4], ['b', 0.3], ['c', 0.1], ...Array.from({ length: 4 }, (_, k) => ['x' + k, 0.05])]), 0.15);
  assert.ok(near(sum(c), 1)); assert.ok([...c.values()].every(v => v <= 0.15 + 1e-9)); assert.ok(near(c.get('a'), 0.15)); assert.ok(near(c.get('b'), 0.15));
  assert.ok(near(c.get('c'), 0.15)); assert.ok(near(c.get('x0'), 0.1375) && near(c.get('x3'), 0.1375), 'the rest re-spread pro rata');
  assert.ok(near(sum(capAtMax(new Map([['a', 0.6], ['b', 0.4]]), 0.15)), 0.3), 'too few stocks: the rest stays cash');
});

test('MSCI momentum tilt: 1 + z above the mean, 1 / (1 - z) below; no history = neutral', () => {
  const rows = [{ key: 'a', cap: 1, mom: 0.3 }, { key: 'b', cap: 1, mom: 0.1 }, { key: 'c', cap: 1, mom: -0.1 }, { key: 'd', cap: 1, mom: null }];
  const w = momTilt(rows); assert.ok(near(sum(w), 1));
  // mean 0.1, sd 0.2: z(a) = 1 -> 2; z(b) = 0 -> 1; z(c) = -1 -> 1 / 2; d (no history) = 1
  assert.ok(near(w.get('a') / w.get('d'), 2, 1e-9)); assert.ok(near(w.get('b') / w.get('d'), 1, 1e-9)); assert.ok(near(w.get('c') / w.get('d'), 0.5, 1e-9));
});

test('bottom third by 12-1 return is dropped; members without one stay', () => {
  const rows = [1, 2, 3, 4, 5, 6, 7].map(k => ({ key: 'k' + k, cap: 10 - k, mom: k === 7 ? null : k / 10 }));
  assert.deepEqual(dropBottomThird(rows).map(r => r.key), ['k3', 'k4', 'k5', 'k6', 'k7']);
});

test('rule weights: CW uncapped by default, C15 capped, overrides for the sensitivity', () => {
  const rows = [{ key: 'a', cap: 60 }, ...Array.from({ length: 9 }, (_, k) => ({ key: 'x' + k, cap: 40 / 9 }))];
  assert.ok(near(weightsFor('SQ10-SH10', rows).get('a'), 0.6)); assert.ok(near(weightsFor('SQ10-SH10-C15', rows).get('a'), 0.15));
  assert.ok(near(weightsFor('SQ10-SH10', rows, 0.1).get('a'), 0.1)); assert.ok(near(weightsFor('SQ10-SH10-C15', rows, null).get('a'), 0.6));
  assert.ok(near(sum(weightsFor('SQ10-SH50-XMOM', rows.map((r, k) => ({ ...r, mom: k / 10 })))), 1));
});

test('review months and holds; library pre-registration is idempotent', () => {
  assert.equal(reviewMonth('SQ10-SH20', '2024-04-01'), true); assert.equal(reviewMonth('SQ10-SH20', '2024-05-01'), false);
  assert.equal(reviewMonth('SQ10-SH20-C15-Y', '2024-04-01'), false); assert.equal(reviewMonth('SQ10-SH20-C15-Y', '2025-01-02'), true);
  assert.equal(periodHold('SQ10-SH20-C15-Y'), 252); assert.equal(periodHold('SQ10-SH10'), 63);
  const LB = { strategies: [{ id: 'X' }] }; assert.equal(preRegister(LB), IDS.length); assert.equal(preRegister(LB), 0); assert.equal(IDS.length, 8);
  const e = LB.strategies.find(x => x.id === 'SQ10-SH30-MOM'); assert.match(e.explain, /momentum/); assert.match(e.status, /pre-registered/); assert.ok(RULES['SQ10-SH50-XMOM'].mom);
});

test('implied splits: a near-whole jump in the statement share count with no listed split', () => {
  const alt = [['2022-04-27', '2022-03-31', 658763000], ['2022-07-27', '2022-06-30', 13078000000], ['2022-10-26', '2022-09-30', 12971000000]];
  assert.deepEqual(impliedSplits(alt, []), [['2022-07-27', 20]]);
  assert.deepEqual(impliedSplits(alt, [['2022-07-18', 20]]), [], 'already listed');
  assert.deepEqual(impliedSplits([['2022-01-01', '', 100], ['2022-04-01', '', 130]], []), [], 'a 30% rise is not a split');
  assert.deepEqual(impliedSplits([['2022-01-01', '', 1000], ['2022-04-01', '', 100]], []), [['2022-04-01', 0.1]]);
  assert.deepEqual(impliedSplits([['2021-01-01', '', 100], ['2022-04-01', '', 200]], []), [], 'filings too far apart');
});
