// Seams: value-core.mjs drPair / drevAt / revGrowthAt (B-DREV1) and oeAt (B-OE1), Agent B 17 Nov 2026 (pre-registered before any run).
import test from 'node:test';
import assert from 'node:assert/strict';
import { drPair, drevAt, revGrowthAt, oeAt } from '../value-core.mjs';

const I = (e, v, f) => ({ s: '', e, v, f });                 // an instant (balance) fact
const P = (s, e, v, f) => ({ s, e, v, f });                  // a duration fact

test('drPair: first family known at both dates; noncurrent added where reported', () => {
  const dr = { ContractWithCustomerLiabilityCurrent: [I('2024-06-30', 100, '2024-08-01'), I('2023-06-30', 80, '2023-08-01')],
    ContractWithCustomerLiabilityNoncurrent: [I('2024-06-30', 20, '2024-08-01')],
    DeferredRevenueCurrent: [I('2024-06-30', 999, '2024-08-01'), I('2023-06-30', 1, '2023-08-01')] };
  assert.deepEqual(drPair(dr, '2024-08-02', '2024-06-30'), { now: 120, prior: 80 });
  assert.equal(drPair(dr, '2024-08-01', '2024-06-30'), null);   // filed that day: not yet known
  assert.deepEqual(drPair({ ContractWithCustomerLiability: [I('2024-06-30', 5, '2024-08-01')], DeferredRevenue: [I('2024-06-29', 7, '2024-08-01'), I('2023-07-01', 4, '2023-08-01')] }, '2024-08-02', '2024-06-30'), { now: 7, prior: 4 });
});
test('drevAt: change over assets, 2% floor, data error bound', () => {
  const co = { dr: { ContractWithCustomerLiability: [I('2024-06-30', 300, '2024-08-01'), I('2023-06-30', 200, '2023-08-01')] }, assets: { Assets: [I('2024-06-30', 1000, '2024-08-01')] } };
  const r = drevAt(co, '2024-08-02', '2024-06-30'); assert.equal(r.drev, 0.1); assert.equal(r.dr, 300);
  co.assets.Assets = [I('2024-06-30', 20000, '2024-08-01')]; assert.equal(drevAt(co, '2024-08-02', '2024-06-30'), null);   // 1.5% of assets
  assert.equal(drevAt({ dr: co.dr, assets: {} }, '2024-08-02', '2024-06-30'), null);
});
test('revGrowthAt: same quarter a year earlier', () => {
  const co = { rev: { Revenues: [P('2024-04-01', '2024-06-30', 120, '2024-08-01'), P('2023-04-01', '2023-06-30', 100, '2023-08-01')] } };
  assert.ok(Math.abs(revGrowthAt(co, '2024-08-02', '2024-06-30') - 0.2) < 1e-9);
  assert.equal(revGrowthAt(co, '2023-09-01', '2024-06-30'), null);
});
test('oeAt: owner earnings = rev - cogs - sga - dWC(assets) + dWC(liabilities) - capex, over market value', () => {
  const Y = (v) => [P('2023-01-01', '2023-12-31', v, '2024-02-20')];
  const B = (a, b) => [I('2023-12-31', a, '2024-02-20'), I('2022-12-31', b, '2023-02-20')];
  const co = { rev: { Revenues: Y(1000) }, cogs: { CostOfRevenue: Y(400) }, capex: { PaymentsToAcquirePropertyPlantAndEquipment: Y(50) },
    sga: { SellingGeneralAndAdministrativeExpense: Y(200) },
    wc: { AccountsReceivableNetCurrent: B(130, 100), InventoryNet: B(90, 100), AccountsPayableCurrent: B(60, 50), AccruedLiabilitiesCurrent: B(40, 30) },
    dr: { DeferredRevenue: B(25, 20) } };
  // 1000 - 400 - 200 - 30 - (-10) + 10 + 10 + 5 - 50 = 355
  const r = oeAt(co, '2024-03-01', 3550); assert.equal(r.oe, 355); assert.ok(Math.abs(r.y - 0.1) < 1e-9);
  // combined payables tag used only when AccountsPayableCurrent is not known at both dates (then accrued is not added again)
  const co2 = { ...co, wc: { AccountsPayableAndAccruedLiabilitiesCurrent: B(100, 70), AccruedLiabilitiesCurrent: B(40, 30) } };
  assert.equal(oeAt(co2, '2024-03-01', 3550).oe, 1000 - 400 - 200 + 30 + 5 - 50);
  // SG&A from selling + G&A when the total is missing; no SG&A at all -> null
  const co3 = { ...co, sga: { SellingAndMarketingExpense: Y(120), GeneralAndAdministrativeExpense: Y(80) } }; assert.equal(oeAt(co3, '2024-03-01', 3550).oe, 355);
  assert.equal(oeAt({ ...co, sga: {} }, '2024-03-01', 3550), null);
  assert.equal(oeAt(co, '2024-03-01', 355), null);              // yield 100%: data error
  assert.equal(oeAt(co, '2024-12-01', 3550), null);             // TTM ended 200+ days before: stale
  assert.equal(oeAt({ ...co, capex: {} }, '2024-03-01', 3550), null);
});
