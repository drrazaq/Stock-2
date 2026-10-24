// Seams: squad12-core.mjs (SQUAD 12, 24 Oct 2026: events in the 300 largest companies). Session helpers (reaction session of an
// earnings report, first session after a filing, the latest month start), the price triggers (gap that holds in the upper half of the
// day, 52-week closing high, 8-K confirmation by a higher close), the SEC quarterly figures (point in time, Q4 derived from the year,
// year-on-year growth, two accelerations in a row, diluted EPS growth, filings of a company), one open trade per stock, the EDGAR
// full-text rows and 8-K item filter, the calendar-year table and the idempotent library pre-registration.
// Pure functions, no network, no files. Run: node test/squad12-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, IDS, HOLD, onOrAfter, after, reactionIdx, reactionFromAcceptance, earnings8k, monthStartFor, gapHolds, newHigh, confirmIdx, quarterValues, yoy, growth3, accel2, revGrowth, epsGrowth, filingsOf,
  firstPer, oneOpen, eftsRows, invItemsOk, byYear, preRegister, halfOf } from '../squad12-core.mjs';
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
const D = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05', '2024-01-08'];

test('six rules, each with a paper URL, a rule text, the 63-session hold and a library check', () => {
  assert.equal(IDS.length, 6); for (const id of IDS) { const r = RULES[id]; assert.ok(/^SQ12-/.test(id)); assert.equal(r.hold, HOLD); assert.ok(r.papers.length && r.papers.every(p => /^https?:\/\//.test(p.url)), id); assert.ok(r.rule.length > 80 && r.lib, id); }
  assert.equal(HOLD, 63); assert.equal(halfOf('2023-12-29'), 'older'); assert.equal(halfOf('2024-01-02'), 'newer');
});

test('sessions: before-open report reacts the same day, after-close the next session, weekend and no time flag handled', () => {
  assert.equal(onOrAfter(D, '2024-01-03'), 1); assert.equal(after(D, '2024-01-03'), 2); assert.equal(onOrAfter(D, '2024-01-06'), 4); assert.equal(after(D, '2024-01-08'), 5);
  assert.equal(reactionIdx(D, '2024-01-03', 'bmo'), 1); assert.equal(reactionIdx(D, '2024-01-03', 'amc'), 2); assert.equal(reactionIdx(D, '2024-01-05', 'amc'), 4); assert.equal(reactionIdx(D, '2024-01-03', null), -1);
  assert.equal(reactionFromAcceptance(D, '2024-01-03T12:05:00.000Z'), 1);     // 07:05 New York: before the open -> that day
  assert.equal(reactionFromAcceptance(D, '2024-01-03T21:05:00.000Z'), 2);     // 16:05 New York: after the close -> next session
  assert.equal(reactionFromAcceptance(D, '2024-01-03T16:00:00.000Z'), -1);    // 11:00 New York: during the session -> skipped
  assert.equal(reactionFromAcceptance(D, '2024-01-05T21:30:00.000Z'), 4);     // Friday evening -> Monday
  assert.equal(reactionFromAcceptance(D, '2024-01-03'), -1);                  // no time
  assert.deepEqual(earnings8k({ form: ['8-K', '8-K/A', '8-K', '10-Q', '8-K'], items: ['2.02,9.01', '2.02', '7.01,9.01', '', '5.02,2.02'], accessionNumber: ['a', 'b', 'c', 'd', 'e'], filingDate: ['d1', 'd2', 'd3', 'd4', 'd5'], acceptanceDateTime: ['t1', 't2', 't3', 't4', 't5'] }),
    [['a', 'd1', 't1'], ['e', 'd5', 't5']]);
  assert.equal(monthStartFor([3, 25, 46], 30), 25); assert.equal(monthStartFor([3, 25, 46], 25), 25); assert.equal(monthStartFor([3, 25, 46], 2), -1);
});

test('gap that holds: 3%+ gap, close in the upper half of the range and above the previous close', () => {
  assert.equal(gapHolds({ pc: 100, o: 103, h: 106, l: 102, c: 105 }), true);
  assert.equal(gapHolds({ pc: 100, o: 102.9, h: 106, l: 102, c: 105 }), false);            // gap under 3%
  assert.equal(gapHolds({ pc: 100, o: 104, h: 110, l: 101, c: 104 }), false);              // lower half of the range
  assert.equal(gapHolds({ pc: 100, o: 103, h: 103, l: 99, c: 101.5 }), true);              // upper half (0.625), above the previous close
  assert.equal(gapHolds({ pc: 100, o: 103, h: 103, l: 97, c: 99.9 }), false);              // closed under the previous close
  assert.equal(gapHolds({ pc: 100, o: 103, h: 103, l: 103, c: 103 }), false);              // no range
  assert.equal(gapHolds({ pc: NaN, o: 103, h: 106, l: 102, c: 105 }), false);
});

test('52-week closing high needs 252 earlier sessions (90% present) and a close above all of them', () => {
  const c = Array.from({ length: 260 }, (_, k) => 100 + (k % 7)); c[259] = 107; assert.equal(newHigh(c, 259), true); c[259] = 106; assert.equal(newHigh(c, 259), false);
  assert.equal(newHigh(c.slice(0, 200), 199), false);
  const g = c.slice(); g[259] = 107; for (let k = 0; k < 40; k++) g[10 + k] = NaN; assert.equal(newHigh(g, 259), false);   // too many missing
});

test('8-K confirmation: close after the filing date above the close before it (weekend filing, no rise)', () => {
  const c = [10, 11, 12, 11.5, 13];
  assert.equal(confirmIdx(D, c, '2024-01-03'), 2);       // filed Wed: base = Tue 11, first session after = Thu 12
  assert.equal(confirmIdx(D, c, '2024-01-04'), 3);       // filed Thu: base = Wed 11, Fri 11.5 is higher
  assert.equal(confirmIdx(D, [10, 11, 12, 13, 12.5], '2024-01-06'), -1);   // Saturday: base Fri 13, Mon 12.5 not higher
  assert.equal(confirmIdx(D, c, '2024-01-08'), -1);      // no session after the filing yet
});

// quarterly revenue rows of one tag (s, e, v, f, form, accn)
const R = (s, e, v, f, form = '10-Q', accn = 'a' + f) => ({ s, e, v, f, form, accn });
const REV = [
  R('2022-01-01', '2022-03-31', 100, '2022-05-01'), R('2022-04-01', '2022-06-30', 100, '2022-08-01'), R('2022-07-01', '2022-09-30', 100, '2022-11-01'), R('2022-01-01', '2022-12-31', 420, '2023-02-15', '10-K'),
  R('2022-01-01', '2022-09-30', 300, '2022-11-01'),
  R('2023-01-01', '2023-03-31', 105, '2023-05-01'), R('2022-01-01', '2022-03-31', 100, '2023-05-01', '10-Q', 'a2023-05-01'),
  R('2023-04-01', '2023-06-30', 115, '2023-08-01'), R('2023-07-01', '2023-09-30', 130, '2023-11-01'), R('2023-01-01', '2023-09-30', 350, '2023-11-01'),
  R('2023-01-01', '2023-12-31', 500, '2024-02-15', '10-K', 'k24'), R('2022-01-01', '2022-12-31', 420, '2024-02-15', '10-K', 'k24'),
];

test('quarter values are point in time; the fourth quarter = the year minus nine months (else minus three quarters)', () => {
  const q22 = quarterValues(REV, '2023-02-15'); assert.equal(q22.get('2022-12-31'), 120); assert.equal(q22.size, 4);
  assert.equal(quarterValues(REV, '2023-02-14').has('2022-12-31'), false);           // the 10-K not filed yet
  const q = quarterValues(REV, '2024-02-15'); assert.equal(q.get('2023-12-31'), 150); assert.equal(q.get('2023-09-30'), 130);
  const no9 = REV.filter(r => !(r.s === '2023-01-01' && r.e === '2023-09-30')); assert.equal(quarterValues(no9, '2024-02-15').get('2023-12-31'), 150);   // 500 - 105 - 115 - 130
  assert.ok(near(yoy(q, '2023-12-31'), 0.25)); assert.ok(near(yoy(q, '2023-09-30'), 0.3)); assert.ok(near(yoy(q, '2023-03-31'), 0.05)); assert.equal(yoy(q, '2022-12-31'), null);
});

test('growth of three quarters and two accelerations in a row', () => {
  const q = quarterValues(REV, '2023-11-01'); assert.deepEqual(growth3(q, '2023-09-30').map(x => +x.toFixed(4)), [0.3, 0.15, 0.05]);
  assert.equal(accel2([0.3, 0.15, 0.05]), true); assert.equal(accel2([0.3, 0.35, 0.05]), false); assert.equal(accel2([-0.01, -0.05, -0.1]), false); assert.equal(accel2(null), false);
  const q4 = quarterValues(REV, '2024-02-15'); assert.equal(accel2(growth3(q4, '2023-12-31')), false);   // 25% after 30%: slowed
  const rg = revGrowth({ Revenues: REV }, '2023-11-01', '2023-09-30'); assert.equal(rg.tag, 'Revenues'); assert.ok(near(rg.g0, 0.3));
  const two = revGrowth({ SalesRevenueNet: REV.slice(0, 2), Revenues: REV }, '2023-11-01', '2023-09-30'); assert.equal(two.tag, 'Revenues');   // first tag that has the quarter
});

test('diluted EPS growth needs a prior-year EPS above zero; filings of a company (originals only, latest end)', () => {
  const E = [R('2022-07-01', '2022-09-30', 1.0, '2022-11-01'), R('2023-07-01', '2023-09-30', 1.2, '2023-11-01'), R('2022-07-01', '2022-09-30', 1.0, '2023-11-01', '10-Q', 'a2023-11-01')];
  const g = epsGrowth(E, '2023-11-01', '2023-09-30'); assert.ok(near(g.g, 0.2)); assert.equal(g.prior, 1);
  assert.equal(epsGrowth([R('2022-07-01', '2022-09-30', -0.5, '2022-11-01'), R('2023-07-01', '2023-09-30', 1.2, '2023-11-01')], '2023-11-01', '2023-09-30'), null);
  const F = filingsOf({ Revenues: [...REV, R('2023-07-01', '2023-09-30', 131, '2023-12-20', '10-Q/A', 'amend')] });
  assert.ok(!F.some(f => f.accn === 'amend')); const k = F.find(f => f.accn === 'k24'); assert.equal(k.form, '10-K'); assert.equal(k.end, '2023-12-31'); assert.equal(k.qEnd, null);
  const q3 = F.find(f => f.accn === 'a2023-11-01'); assert.equal(q3.qEnd, '2023-09-30'); assert.ok(F.every((f, j) => !j || F[j - 1].f <= f.f));
});

test('one open trade per stock (exit = close of t + 63; a signal on that exit session may enter next morning), first event per company', () => {
  const s = oneOpen([{ i: 1, t: 10 }, { i: 1, t: 50 }, { i: 1, t: 73 }, { i: 1, t: 74 }, { i: 2, t: 50 }, { i: 2, t: 50 }], 63);
  assert.deepEqual(s.map(x => x.i + '@' + x.t), ['1@10', '2@50', '1@73']);
  const f = firstPer([{ key: 'A', d: '2024-01-01' }, { key: 'A', d: '2024-02-15' }, { key: 'A', d: '2024-03-02' }, { key: 'B', d: '2024-01-05' }], 60);
  assert.deepEqual(f.map(e => e.key + e.d), ['A2024-01-01', 'B2024-01-05', 'A2024-03-02']);
});

test('EDGAR full-text rows keep the 8-K items; the investor-day item filter', () => {
  const j = { hits: { hits: [{ _id: '0000320193-24-000001:ex99.htm', _source: { adsh: '0000320193-24-000001', ciks: ['0000320193'], file_date: '2024-03-01', items: ['7.01', '9.01'], display_names: ['Apple Inc.  (AAPL)  (CIK 0000320193)'] } },
    { _id: '0000789019-24-000002:d.htm', _source: { ciks: ['0000789019'], file_date: '2024-03-02', display_names: ['MICROSOFT CORP  (MSFT)  (CIK 0000789019)'] } }] } };
  const r = eftsRows(j); assert.deepEqual(r[0], ['0000320193-24-000001', '320193', '2024-03-01', ['7.01', '9.01'], ['AAPL']]); assert.equal(r[1][0], '0000789019-24-000002'); assert.equal(r[1][3], null); assert.deepEqual(r[1][4], ['MSFT']);
  assert.equal(invItemsOk(['7.01', '9.01']), true); assert.equal(invItemsOk(['8.01']), true); assert.equal(invItemsOk(['2.02', '7.01', '9.01']), false); assert.equal(invItemsOk(['5.02']), false); assert.equal(invItemsOk(null), false);
});

test('calendar-year table by entry year vs SPY on the same days', () => {
  const y = byYear([{ buy: '2023-02-01', net: 0.05, spy: 0.02, avg: 0.01 }, { buy: '2023-05-01', net: -0.01, spy: 0.04, avg: 0 }, { buy: '2024-01-03', net: 0.1, spy: 0.03, avg: null }]);
  assert.deepEqual(Object.keys(y), ['2023', '2024']); assert.equal(y['2023'].n, 2); assert.equal(y['2023'].net, 0.02); assert.equal(y['2023'].spy, 0.03); assert.equal(y['2023'].beatsSpy, false); assert.equal(y['2024'].beatsSpy, true); assert.equal(y['2024'].avgStock, null);
});

test('library pre-registration is idempotent and carries the rule text, papers and the overlap check', () => {
  const LB = { strategies: [{ id: 'X1' }] }; assert.equal(preRegister(LB), 6); assert.equal(preRegister(LB), 0); assert.equal(LB.strategies.length, 7);
  const e = LB.strategies.find(x => x.id === 'SQ12-EGAPHOLD'); assert.ok(/upper half/.test(e.explain) && /300 largest/.test(e.explain) && /Paper/.test(e.explain)); assert.ok(/ANG-LCGAP/.test(e.libraryCheck)); assert.ok(/pre-registered/.test(e.status));
  assert.equal(preRegister(null), 0);
});
