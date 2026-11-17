// Agent A repair, 17 Nov 2026: E3's `recent` list also reads live EDGAR Form 4 buys (data/buyers-live.json), so the champion is not
// empty between the SEC's quarterly insider data sets. The cluster rule itself must not change.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { liveToPurchases, cluster2, recentClusters } from '../insider-recent.mjs';

const NOW = Date.parse('2026-11-17T14:00:00Z');
const q = (sym, d, who, usd = 10000) => ({ sym, d, who, usd });
const L = (sym, filed, name, sh = 1000, px = 10) => ({ sym, issuer: sym + ' INC', filed, tdate: filed, name, rel: 'Director', title: '', sh, px });

test('live rows become purchases only after the last quarterly date, with valid symbols and prices', () => {
  const live = { ins: [L('ABC', '2026-09-30', 'A'), L('ABC', '2026-11-16', 'Smith  John'), L('brk-b', '2026-11-16', 'B'), L('BAD SYM', '2026-11-16', 'C'), L('XYZ', '2026-11-16', 'D', 0, 5)] };
  const p = liveToPurchases(live, '2026-09-30');
  assert.deepEqual(p.map(x => x.sym), ['ABC', 'BRK.B']);
  assert.equal(p[0].who, 'N:SMITH JOHN');
  assert.equal(p[0].usd, 10000);
  assert.equal(p[0].src, 'live');
  assert.deepEqual(liveToPurchases(null, ''), []);
});

test('cluster rule: 2+ distinct insiders within 10 days, then a 30-day gap per stock (same as insider-study.mjs)', () => {
  const ev = cluster2([q('AAA', '2026-01-01', 'x'), q('AAA', '2026-01-05', 'y'), q('AAA', '2026-01-08', 'z'), q('AAA', '2026-02-20', 'x'), q('AAA', '2026-02-22', 'w'),
    q('BBB', '2026-01-01', 'x'), q('BBB', '2026-01-20', 'y'), q('CCC', '2026-01-02', 'x'), q('CCC', '2026-01-03', 'x')]);
  assert.deepEqual(ev.map(e => [e.sym, e.d, e.n]), [['AAA', '2026-01-05', 2], ['AAA', '2026-02-22', 2]]);
});

test('E3 gets live 3-insider clusters between quarterly files; quarterly-only input gives the old list', () => {
  const Q = [q('OLD', '2026-09-25', '1'), q('OLD', '2026-09-28', '2'), q('OLD', '2026-09-30', '3')];
  const live = { ins: [L('NEW', '2026-11-10', 'Ann'), L('NEW', '2026-11-12', 'Bob'), L('NEW', '2026-11-16', 'Cy'), L('TWO', '2026-11-16', 'Ann'), L('TWO', '2026-11-16', 'Dee'), L('GONE', '2026-11-16', 'X'), L('GONE', '2026-11-16', 'Y')] };
  const keep = (s) => s !== 'GONE';
  const r = recentClusters(Q, live, keep, NOW);
  assert.deepEqual(r.map(e => [e.sym, e.n, e.src]), [['TWO', 2, 'live'], ['NEW', 2, 'live']]);
  // the 30-day gap keeps NEW at its first event (2 insiders on 12 Nov); the 3rd insider on 16 Nov does not make a new event
  assert.equal(r.find(e => e.sym === 'NEW').d, '2026-11-12');
  assert.deepEqual(recentClusters(Q, null, keep, NOW), [], 'quarterly data ending 30 Sep has no cluster in the last 30 days');
});

test('a 3-insider live cluster on one day reaches E3 (league min n 3)', () => {
  const live = { ins: [L('TRIO', '2026-11-16', 'A'), L('TRIO', '2026-11-16', 'B'), L('TRIO', '2026-11-16', 'C')] };
  const r = recentClusters([q('OLD', '2026-09-30', '1')], live, () => true, NOW);
  assert.deepEqual(r.map(e => [e.sym, e.n, e.d]), [['TRIO', 3, '2026-11-16']]);
  assert.equal(r.filter(e => e.n >= 3).length, 1);
});

test('insider-study.mjs feeds only `recent` from the live file; trades still come from the quarterly events', () => {
  const src = fs.readFileSync(new URL('../insider-study.mjs', import.meta.url), 'utf8');
  assert.match(src, /const recent = recentClusters\(P, LIVE, \(s\) => SY\.has\(s\), Date\.now\(\)\)/);
  assert.match(src, /for \(const \[key, ev\] of Object\.entries\(EV\)\)/, 'trades still loop over the quarterly EV');
  const before = src.split("// `recent` (E3's league picks)")[0];
  assert.ok(before.length < src.length, 'marker comment present');
  assert.doesNotMatch(before.split('\n').filter(l => !/^import /.test(l)).join('\n'), /LIVE|liveToPurchases\(|recentClusters\(/, 'live rows must not reach the tested events');
});
