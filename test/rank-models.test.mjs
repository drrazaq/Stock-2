// Seams: rank-models.mjs (A/B/C/D shadow ranking, frozen 28 Oct 2026) and edgar-feed.mjs. Invariants: the models are frozen as approved;
// each decides at the candidate's own minute (no look-ahead); D's hard rules match the alert hard rules; the verdict cannot be reached
// before 20 counted sessions; the cap-cost comparison separates first five, after-cap and a hindsight bound.
// Run: node --test test/rank-models.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, FROZEN, pick, dEligible, evaluate, spr } from '../rank-models.mjs';
import { parseAtom, nyMinuteOf } from '../edgar-feed.mjs';

const e = (o = {}) => ({ d: '2026-10-29', sym: 'S', m: 600, chg: 0.04, cat: 'VERIFIED', rvT: 4, dollarVol: 3e6, bid: 9.99, ask: 10.01, e: { m: 600, px: 10, bid: 9.99, ask: 10.01, qAgeSec: 5 }, last: 10, ...o });

test('frozen as approved: dates, cap, B and C criteria', () => {
  assert.deepEqual(FROZEN, { date: '2026-10-28', evalFrom: '2026-10-29', cap: 5, minSessions: 20, minPicks: 50, controlsPerDay: 10 });
  assert.equal(MODELS.B.accept(e()), true); assert.equal(MODELS.B.accept(e({ cat: 'NONE' })), false); assert.equal(MODELS.B.accept(e({ chg: 0.07 })), false);
  assert.equal(MODELS.B.accept(e({ dollarVol: 1e6 })), false); assert.equal(MODELS.B.accept(e({ bid: 9.8, ask: 10.2 })), false); assert.equal(MODELS.B.accept(e({ bid: null, ask: null })), false);
  assert.equal(MODELS.C.accept(e({ rvT: 2.9 })), false); assert.equal(MODELS.C.accept(e({ cat: 'NONE' })), true);
  assert.equal(spr({ bid: 9.9, ask: 10.1 }).toFixed(3), '0.020');
});
test('online picking: time order, cap 5, only accepted candidates; random control is a fixed hash', () => {
  const day = Array.from({ length: 8 }, (_, i) => e({ sym: 'S' + i, m: 600 + i, cat: i % 2 ? 'NONE' : 'VERIFIED' }));
  assert.deepEqual(pick(day, MODELS.A).map(r => r.sym), ['S0', 'S1', 'S2', 'S3', 'S4']);
  assert.deepEqual(pick(day, MODELS.B).map(r => r.sym), ['S0', 'S2', 'S4', 'S6']);
  assert.deepEqual(pick(day, MODELS.R), pick(day.slice().reverse(), MODELS.R));
});
test('D criteria: fresh 8-K / 6-K, not negative or financing, not yet moved, liquid, 1 USD+, every hard rule', () => {
  const q = { form: '8-K', items: '8.01,9.01', atM: 425, decM: 571, chg: 0.01, price: 6, prevDollarVol: 3e6, spread: 0.004, spreadFresh: true, halalFail: false, lottery: 0, sec: { known: true, tags: [] } };
  assert.deepEqual(dEligible(q), { eligible: true, why: [] });
  for (const [o, re] of [[{ form: '8-K/A' }, /amendments/], [{ items: '3.01' }, /negative/], [{ items: '1.01,3.02' }, /financing/], [{ chg: 0.05 }, /already moved/], [{ chg: -0.04 }, /down over 3%/],
    [{ price: 0.9 }, /under 1 USD/], [{ prevDollarVol: 5e5 }, /1M USD/], [{ spread: 0.03 }, /spread/], [{ halalFail: true }, /NOT HALAL/], [{ lottery: 0.3 }, /AVOID/],
    [{ sec: { known: false } }, /SEC check failed/], [{ sec: { known: true, tags: ['share sale / registration (S-3)'] } }, /SEC danger/], [{ atM: 700, decM: 701 }, /outside|no live price/]])
    assert.match(dEligible({ ...q, ...o }).why.join('; '), re);
  assert.equal(dEligible({ ...q, form: '6-K', items: '' }).eligible, true);
});
test('evaluate: only counted sessions; COLLECTING before 20 sessions; cap cost shows first five vs after the cap vs a hindsight bound', () => {
  const E = [], out = {};
  for (let i = 0; i < 8; i++) { const r = e({ sym: 'S' + i, m: 600 + i }); E.push(r); out[r.d + '|' + r.sym] = { c0: i < 5 ? 9.8 : 10.6, c5: 10 }; }
  E.push(e({ d: '2026-10-28', sym: 'OLD' })); out['2026-10-28|OLD'] = { c0: 20 };
  const v = evaluate({ E, F: [], N: [] }, out);
  assert.equal(v.models.A.picks, 5); assert.equal(v.streams.E.candidates, 8); assert.ok(v.models.A.day.avg < 0);
  assert.ok(v.capCost.afterCap.day.avg > 0); assert.equal(v.capCost.afterCap.picks, 3); assert.ok(v.capCost.hindsightBestFive.day.avg > v.capCost.firstFive.day.avg);
  assert.match(v.models.B.verdict, /^COLLECTING \(1 of 20 sessions/);
  assert.equal(evaluate({ E, F: [], N: [] }, out, '2026-10-28').streams.E.candidates, 9);   // the pilot view includes 28 Oct
});
test('SEC feed parser: form, CIK, items, accession and acceptance time; New York minute', () => {
  const xml = `<feed><entry><title>8-K - ACME ROBOTICS INC (0001234567) (Filer)</title><link rel="alternate" type="text/html" href="https://www.sec.gov/Archives/edgar/data/1234567/000123456726000123/0001234567-26-000123-index.htm"/>
<summary type="html"> &lt;b&gt;Filed:&lt;/b&gt; 2026-10-29 &lt;b&gt;AccNo:&lt;/b&gt; 0001234567-26-000123 &lt;b&gt;Size:&lt;/b&gt; 300 KB&lt;br&gt;Item 1.01: Entry into a Material Definitive Agreement&lt;br&gt;Item 9.01: Financial Statements and Exhibits</summary>
<updated>2026-10-29T07:02:11-04:00</updated><category scheme="https://www.sec.gov/" label="form type" term="8-K"/><id>urn:tag:sec.gov,2008:accession-number=0001234567-26-000123</id></entry>
<entry><title>garbage</title></entry></feed>`;
  const a = parseAtom(xml); assert.equal(a.length, 1);
  assert.deepEqual(a[0], { acc: '0001234567-26-000123', form: '8-K', cik: 1234567, name: 'ACME ROBOTICS INC', role: 'Filer', at: '2026-10-29T07:02:11-04:00', items: '1.01,9.01' });
  assert.equal(nyMinuteOf(a[0].at), 7 * 60 + 2); assert.equal(nyMinuteOf('2026-11-02T08:00:00-05:00'), 8 * 60);
});
