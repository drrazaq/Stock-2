// Seams: research-core.mjs IDEA 5 (daily researcher, 31 Oct 2026): earnings announcement timing (Johnson and So 2018). Grouping of
// item-2.02 8-Ks into announcements, the year-ago match (364 days +-30), the shift thresholds, the data rule and the pre-registration. No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, BUY_IDS, EAT_IDS, EAT, eatAnnouncements, eatEvents, eatDataRule, preRegister, ONE_OPEN } from '../research-core.mjs';
import { secNY } from '../sec-time.mjs';

test('three EAT rules: two buys (21, 63), one avoid; one open trade per stock', () => {
  assert.deepEqual(EAT_IDS, ['RQ-EAT-ADV-21', 'RQ-EAT-ADV-63', 'RQ-EAT-DEL-21']);
  assert.deepEqual(EAT_IDS.map(id => RULES[id].hold), [21, 63, 21]);
  assert.deepEqual(EAT_IDS.map(id => RULES[id].kind), ['buy', 'buy', 'avoid']);
  assert.deepEqual(EAT_IDS.map(id => RULES[id].side), ['adv', 'adv', 'del']);
  for (const id of EAT_IDS) { assert.ok(IDS.includes(id)); assert.ok(ONE_OPEN.has(id)); }
  assert.ok(BUY_IDS.includes('RQ-EAT-ADV-21') && !BUY_IDS.includes('RQ-EAT-DEL-21'));
  assert.equal(EAT.year, 364); assert.equal(EAT.adv, -7); assert.equal(EAT.del, 7); assert.equal(EAT.gap, 30); assert.equal(EAT.window, 30);
});
test('announcements: only item 2.02, New York date, filings within 30 days grouped (first one dates it)', () => {
  const L = [['2023-02-02T21:05:00.000Z', '2.02,9.01'], ['2023-02-03T01:30:00.000Z', '2.02'], ['2023-02-20T12:00:00.000Z', '2.02,7.01'],   // 20:30 NY on 2 Feb
    ['2023-03-15T12:00:00.000Z', '5.02'], ['2023-05-04T11:00:00.000Z', '2.02'], ['2023-05-05T11:00:00.000Z', '12.02'], ['bad', '2.02']];
  const a = eatAnnouncements(L, secNY);
  assert.deepEqual(a.map(x => [x.d, x.n]), [['2023-02-02', 3], ['2023-05-04', 1]]);
  assert.equal(a[0].accept, '2023-02-02T21:05:00.000Z');
  assert.deepEqual(eatAnnouncements([], secNY), []); assert.deepEqual(eatAnnouncements(null, secNY), []);
});
test('events: shift vs year-ago + 364 days; closest match within +-30; advancer / delayer / neither', () => {
  const an = (d, n = 1) => ({ d, accept: d + 'T12:00:00.000Z', n });
  const anns = [an('2022-02-03'), an('2022-05-05'), an('2022-08-04'), an('2023-01-26'), an('2023-05-18'), an('2023-08-04'), an('2024-03-20')];
  const e = eatEvents(anns), by = Object.fromEntries(e.map(x => [x.d, x]));
  assert.equal(by['2023-01-26'].prev, '2022-02-03'); assert.equal(by['2023-01-26'].shift, -7); assert.equal(by['2023-01-26'].side, 'adv');   // 2022-02-03 + 364 = 2023-02-02
  assert.equal(by['2023-05-18'].shift, 14); assert.equal(by['2023-05-18'].side, 'del');
  assert.equal(by['2023-08-04'].shift, 1); assert.equal(by['2023-08-04'].side, null);
  assert.ok(!by['2022-02-03'] && !by['2024-03-20']);   // no year-ago within 30 days (2023-01-26 + 364 = 2024-01-25: 55 days)
  assert.equal(e.length, 3);
  // the closest of two candidates wins; a 31-day gap is outside the window
  const e2 = eatEvents([an('2022-01-10'), an('2022-02-01'), an('2023-01-31')]); assert.equal(e2.length, 1); assert.equal(e2[0].prev, '2022-02-01'); assert.equal(e2[0].shift, 0);
  assert.equal(eatEvents([an('2022-01-01'), an('2023-01-31')]).length, 0);   // 2023-01-31 - 364 = 2022-02-01: 31 days away
});
test('data rule: 95% 8-K lists, 85% mapping, 5,000 matched announcements', () => {
  assert.equal(eatDataRule({ ciks: 100, subsOk: 96, liqMonths: 100, liqMapped: 90, events: 6000 }).ok, true);
  const r = eatDataRule({ ciks: 100, subsOk: 90, liqMonths: 100, liqMapped: 80, events: 10 });
  assert.equal(r.ok, false); assert.match(r.why, /95% needed/); assert.match(r.why, /85% needed/); assert.match(r.why, /5,000 needed/);
});
test('pre-registration writes the three EAT entries once, never over a result', () => {
  const LB = { strategies: [] }; preRegister(LB); const n = LB.strategies.length;
  for (const id of EAT_IDS) { const e = LB.strategies.find(x => x.id === id); assert.ok(e); assert.match(e.status, /pre-registered 2026-10-31/); assert.equal(e.hold, RULES[id].hold); }
  assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, n);
});
