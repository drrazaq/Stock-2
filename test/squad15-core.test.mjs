// Seams: squad15-core.mjs (SQUAD 15, 24 Oct 2026: long calls on the large, liquid winners). Black-Scholes price / delta / implied vol,
// the expiry (longest 150-270 days), the ATM and delta picks (first of 8 with a bar on the entry day), the exit session (stock sell or
// expiry - 30 days), the exit price (close, late close, intrinsic floor), the option net after spread and 5 USD fees, the snapshot
// half-spread, one open call per stock, the judge (halves 2024 / 2025-26) and the idempotent library pre-registration.
// Run: node --test test/squad15-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, isMonthly, expiryOrder, bsCall, bsDelta, impliedVol, pickExpiry, pickAtm, pickDelta, exitIndex, exitPrice, optionNet, premiumOf, halfSpread, snapPick, onePerStock, judge, halfStats, preRegister, halfOf } from '../squad15-core.mjs';

test('black-scholes: price, delta and implied vol round trip', () => {
  const p = bsCall(100, 100, 0.5, 0.045, 0.3); assert.ok(p > 9 && p < 10, 'ATM 6-month call near 9.4: ' + p);
  assert.ok(Math.abs(bsDelta(100, 100, 0.5, 0.045, 0.3) - 0.587) < 0.01);
  assert.ok(Math.abs(impliedVol(p, 100, 100, 0.5) - 0.3) < 1e-4);
  assert.equal(impliedVol(0.0001, 100, 50, 0.5), null, 'under intrinsic -> null');
  assert.ok(bsDelta(100, 80, 0.5, 0.045, 0.3) > 0.85);
});
test('expiry: the longest 150-270 calendar days out', () => {
  assert.equal(pickExpiry(['2024-06-21', '2024-07-19', '2024-09-20', '2024-12-20', '2025-01-17'], '2024-02-01'), '2024-09-20');
  assert.equal(pickExpiry(['2024-03-15'], '2024-02-01'), null);
  assert.equal(pickExpiry(['2024-09-20', '2024-10-25'], '2024-02-01'), '2024-09-20', 'a weekly (the 25th) is never picked');
  assert.ok(isMonthly('2025-04-17'), 'Thursday before Good Friday'); assert.ok(!isMonthly('2025-05-02'));
  assert.deepEqual(expiryOrder(['2024-07-19', '2024-09-20', '2024-08-16', '2024-08-23'], '2024-02-01'), ['2024-09-20', '2024-08-16', '2024-07-19']);
});
test('contract picks: nearest strike with a bar that day; delta target uses the ATM implied vol', () => {
  const chain = [90, 95, 100, 105, 110].map(k => ({ occ: 'X' + k, k })), day = '2024-03-01';
  const bars = { X100: [{ t: '2024-02-29', o: 9, c: 9 }], X105: [{ t: '2024-03-01T05:00:00Z', o: 7, c: 7 }], X95: [{ t: '2024-03-01', o: 11.5, c: 11 }], X90: [{ t: '2024-03-01', o: 14.5, c: 14 }] };
  const a = pickAtm(chain, bars, day, 101); assert.equal(a.occ, 'X105', 'X100 did not trade that day; X105 (4 away) before X95 (6 away)'); assert.equal(a.open, 7);
  const iv = impliedVol(10, 100, 100, 0.6), d = pickDelta(chain, bars, day, 100, 0.6, iv, 0.70); assert.ok(d && (d.occ === 'X90' || d.occ === 'X95')); assert.ok(d.delta > 0.6 && d.delta < 0.85);
});
test('exit session: the stock sell or the last session on/before expiry - 30 days, whichever first', () => {
  const S = ['2024-05-01', '2024-05-02', '2024-05-03', '2024-05-06', '2024-05-07'];
  assert.equal(exitIndex(S, 4, '2024-06-03'), 2, 'expiry - 30 = 2024-05-04 -> 2024-05-03');
  assert.equal(exitIndex(S, 1, '2024-06-03'), 1);
});
test('exit price: close, then a late close within 5 sessions, then intrinsic', () => {
  const S = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7', 'd8'];
  assert.deepEqual(exitPrice([{ t: 'd2', c: 3 }], S, 2, () => 50, 45), { px: 3, by: 'close', x: 2 });
  assert.deepEqual(exitPrice([{ t: 'd4', c: 4 }], S, 2, () => 50, 45), { px: 4, by: 'lateClose', x: 4 });
  assert.deepEqual(exitPrice([{ t: 'd8', c: 4 }], S, 2, () => 50, 45), { px: 5, by: 'intrinsic', x: 2 });
  assert.deepEqual(exitPrice([], S, 2, () => 40, 45), { px: 0, by: 'intrinsic', x: 2 });
});
test('option net: spread on both sides, 5 USD a side, worthless = -100%', () => {
  assert.ok(Math.abs(optionNet(10, 10, 0.01) - ((100 * 10 * 0.99 - 5) / (100 * 10 * 1.01 + 5) - 1)) < 1e-12);
  assert.equal(optionNet(2, 0.01, 0.02), -1);
  assert.equal(premiumOf(2.5, 0.02), 260);
});
test('half-spread from snapshot rows: floor 1%, nearest target', () => {
  const rows = [{ k: 100, delta: 0.55, ap: 10.2, bp: 9.8 }, { k: 90, delta: 0.70, ap: 16.4, bp: 15.6 }, { k: 80, delta: 0.85, ap: 24.1, bp: 23.9 }];
  assert.ok(Math.abs(halfSpread(rows.slice(0, 1), 100, 'ATM') - 0.02) < 1e-9);
  assert.equal(halfSpread([rows[2]], 100, 'DEEP85'), 0.01, 'floor');
  assert.equal(halfSpread([], 100, 'ATM'), null);
  const s = snapPick(rows.map(r => ({ ...r, occ: 'A' + r.k, exp: '2027-06-17' })), 100, 'ITM70', '2026-10-27'); assert.equal(s.occ, 'A90');
});
test('one open call per stock', () => {
  const k = onePerStock([{ sym: 'A', entryIdx: 1, exitIdx: 10 }, { sym: 'A', entryIdx: 5, exitIdx: 20 }, { sym: 'A', entryIdx: 11, exitIdx: 30 }, { sym: 'B', entryIdx: 5, exitIdx: 9 }]);
  assert.deepEqual(k.map(x => x.sym + x.entryIdx), ['A1', 'B5', 'A11']);
});
test('judge: halves 2024 / 2025-26, too few, rejected when the stock is better', () => {
  assert.equal(halfOf('2024-12-31'), 'older'); assert.equal(halfOf('2025-01-02'), 'newer');
  const mk = (entry, e, net, stock) => ({ sym: 'S' + e, entry, e, net, netStress: net - 0.02, stock, days: 100, spy: 0.05, h: 0.01, premium: 500, by: 'close' });
  const few = judge([mk('2024-03-01', 10, 0.2, 0.1)]); assert.equal(few.verdict, 'TOO FEW CASES');
  const tr = []; for (let i = 0; i < 30; i++) { tr.push(mk('2024-0' + (1 + (i % 9)) + '-10', i * 7, 0.1 + (i % 5) * 0.01, 0.2)); tr.push(mk('2025-0' + (1 + (i % 9)) + '-10', 300 + i * 7, 0.1 + (i % 5) * 0.01, 0.2)); }
  const v = judge(tr); assert.equal(v.verdict, 'REJECTED'); assert.match(v.why, /did not beat the same stock/);
  const w = judge(tr.map(z => ({ ...z, stock: 0 }))); assert.ok(['TRADABLE SMALL', 'PROVEN'].includes(w.verdict), w.verdict + ' ' + w.why);
  assert.equal(judge(tr, { info: true }).verdict, 'INFORMATION (REJECTED)');
  const h = halfStats(tr); assert.equal(h.premium.atOrUnder300, 0); assert.equal(h.perYear.spy, 0.126);
});
test('library pre-registration is idempotent', () => {
  const LB = { strategies: [] }; assert.equal(preRegister(LB), IDS.length); assert.equal(preRegister(LB), 0);
  assert.ok(LB.strategies.every(e => e.agent === 'squad15' && /LONG CALLS ONLY/.test(e.explain)));
  assert.ok(RULES['SQ15-DIP'].info);
});
