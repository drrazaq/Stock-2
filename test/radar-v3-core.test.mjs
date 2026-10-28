// Seam: radar-v3-core.mjs (DAILY OPPORTUNITY RADAR, owner approved 28 Oct 2026). Safety invariants: every A/B line is labelled NOT AN
// APPROVED BUY, hard blocks (under 1 USD, NOT HALAL, SEC danger, one-day-jump AVOID) never become leads, an empty day still says
// "0 approved" and why, and the 2% net arithmetic includes both 3 USD fees and the spread.
// Run: node --test test/radar-v3-core.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { radarOn, netHurdle, netOf, blockOf, halalMap, catalystOf, closestRule, topSilence, buildMidday, buildClose, scoreboard, NOT_APPROVED } from '../radar-v3-core.mjs';

const ctx = { halal: { GOOD: 'ok', BAD: 'fail' }, events: { DIL: [{ sym: 'DIL', f: 'OFFERING', p: '2026-10-27T08:00-04:00' }], NEWSY: [{ sym: 'NEWSY', f: 'CONTRACT', p: '2026-10-27T07:00-04:00' }] },
  lottery: { JUMP: 0.5 }, record: { 'IG1/close': { n: 68, days: 8, avg: 0.021, stress: 0.012 }, 'IG5/close': { n: 60, days: 9, avg: -0.05, stress: -0.06 } }, lab: { 'IG1/close': { verdict: 'REJECTED' } } };
const snap = (o = {}) => ({ day: '2026-10-28', at: '11:15', firstMinute: '09:26', scanned: 12700, live: 5400, alerts: 0, tally: { UNDER_1_USD: 3, GAPPED_AT_OPEN: 5 },
  movers: [{ sym: 'RUNR', code: 'GAPPED_AT_OPEN', maxUp: 0.6, firstSeen: '09:31', firstSeenUp: 0.5 }],
  hits: [{ sym: 'GOOD', rule: 'IG1', m: 589, price: 3.1 }, { sym: 'BAD', rule: 'IG1', m: 590, price: 5 }, { sym: 'GOOD', rule: 'IG5', m: 600, price: 3.3 }],
  early: [{ sym: 'NEWSY', change: 0.04, rvT: 3, price: 12, score: 90, firstMinute: '09:40' }, { sym: 'PENNY', change: 0.05, rvT: 9, price: 0.5, score: 95, firstMinute: '09:35' },
    { sym: 'HOT', change: 0.35, rvT: 9, price: 8, score: 99, firstMinute: '09:35' }, { sym: 'DIL', change: 0.06, rvT: 4, price: 6, score: 92, firstMinute: '09:36' }, { sym: 'JUMP', change: 0.05, rvT: 4, price: 6, score: 91, firstMinute: '09:36' }],
  now: { GOOD: { px: 3.4, chg: 0.6 } }, ...o });

test('on by default; off only when radar is false', () => { assert.equal(radarOn({}), true); assert.equal(radarOn(null), true); assert.equal(radarOn({ radar: false }), false); assert.equal(radarOn({ quiet: true, opportunitiesOnly: true, focus: true }), true); });
test('2% net needs 2% + 0.6% fees + spread: 3.6% under 5 USD, 2.9% above (1,000 USD)', () => {
  assert.equal(netHurdle(3), 0.036); assert.equal(netHurdle(50), 0.029); assert.equal(netHurdle(50, 2000), 0.026);
  assert.equal(netOf(10, 10.2), 0.011);   // a +2% price move is only +1.1% profit after fees and spread
  assert.equal(netOf(0, 1), null);
});
test('hard blocks: under 1 USD, NOT HALAL, SEC danger, one-day-jump AVOID; a normal 8-K is a catalyst, not a block', () => {
  assert.match(blockOf('X', 0.9, ctx), /under 1 USD/); assert.match(blockOf('BAD', 5, ctx), /NOT HALAL/); assert.match(blockOf('DIL', 5, ctx), /offering/); assert.match(blockOf('JUMP', 5, ctx), /AVOID/);
  assert.equal(blockOf('NEWSY', 5, ctx), null); assert.match(catalystOf('NEWSY', ctx), /SEC 8-K contract/); assert.match(catalystOf('GOOD', ctx), /NO VERIFIED CATALYST/);
});
test('halal map: ZAD list fills in, a newer own mark wins, marks older than 90 days expire', () => {
  const now = Date.parse('2026-10-28');
  const m = halalMap({ effective: '2026-10-22', notHalal: ['A', 'B'], newHalal: ['C'] }, { B: { s: 'ok', d: '2026-10-25' }, A: { s: 'ok', d: '2026-10-01' }, OLD: { s: 'fail', d: '2026-06-01' } }, now);
  assert.equal(m.A, 'fail'); assert.equal(m.B, 'ok'); assert.equal(m.C, 'ok'); assert.equal(m.OLD, undefined);
});
test('closest rule names its history verdict and what is missing; a rejected rule is never called approvable', () => {
  const c = closestRule(ctx.record, ctx.lab); assert.equal(c.rule, 'IG1'); assert.equal(c.history, 'REJECTED');
  assert.ok(c.missing.some(x => /REJECTED/.test(x))); assert.ok(c.missing.some(x => /2 more trading days/.test(x)));
  assert.equal(closestRule({ 'IG5/close': { n: 60, days: 9, avg: -0.05 } }, {}), null);
});
test('silence reason picks the biggest code and its kind', () => { const t = topSilence({ UNDER_1_USD: 3, GAPPED_AT_OPEN: 5, ALERTED: 9 }); assert.equal(t.code, 'GAPPED_AT_OPEN'); assert.equal(t.kind, 'timing problem'); assert.equal(topSilence({}), null); });

test('midday: labelled panels, hard blocks shown as BLOCKED never as leads, one line per stock, extended stocks left out', () => {
  const r = buildMidday(snap(), ctx), t = r.text;
  for (const p of ['A. LIVE RESEARCH LEADS (' + NOT_APPROVED, 'B. SHORT SETUPS (PAPER, ' + NOT_APPROVED, 'C. APPROVED SIGNALS: 0 so far today', 'D. RUNNERS SO FAR']) assert.ok(t.includes(p), p);
  assert.match(t, /- GOOD: IG1 at 09:49 \$3\.10, now \$3\.40/); assert.equal((t.match(/- GOOD:/g) || []).length, 1);
  assert.match(t, /5-year test REJECTED/); assert.match(t, /halal \(your ZAD mark\)/);
  assert.match(t, /- NEWSY \+4%.*HALAL UNKNOWN/); assert.match(t, /SEC 8-K contract/);
  assert.match(t, /BLOCKED by hard rules \(not leads\):.*BAD \(NOT HALAL/); assert.match(t, /DIL \(SEC danger filing: offering\)/); assert.match(t, /JUMP \(AVOID list/); assert.match(t, /PENNY \(under 1 USD\)/);
  assert.doesNotMatch(t, /- HOT /); assert.doesNotMatch(t, /- PENNY /); assert.doesNotMatch(t, /- BAD:/);
  assert.match(t, /Closest: IG1.*Missing: its 5-year history test \(REJECTED\)/); assert.match(t, /RUNR up to \+60%.*gapped up before the open/);
  assert.match(t, /Top reason for silence: gapped up before the open \(5, timing problem\)/);
  assert.doesNotMatch(t.split(NOT_APPROVED).join(''), /\bBUY\b/);   // the only BUY word is inside the label assert.doesNotMatch(t, /index fund/i);
  assert.deepEqual(r.rows.map(x => x.panel + x.sym), ['BGOOD', 'ANEWSY']); assert.equal(r.rows[0].px, 3.4);
});
test('midday: an empty day still says 0 approved, no leads, and why; a late watcher is named', () => {
  const t = buildMidday(snap({ firstMinute: '11:10', hits: [], early: [], movers: [], tally: {} }), {}).text;
  assert.match(t, /WATCHER STARTED LATE today \(11:10\)/);
  assert.doesNotMatch(t, /NO MARKET DATA/);
  assert.match(buildMidday(snap({ scanned: 0, mode: 'NO_USABLE_MARKET_DATA', hits: [], early: [] }), {}).text, /NO MARKET DATA right now.*data problem, not a quiet market[\s\S]*Scanned 0 stocks \(5400/); assert.match(t, /B\. SHORT SETUPS.*: none before 11:00\./); assert.match(t, /A\. LIVE RESEARCH LEADS.*: none right now\./); assert.match(t, /C\. APPROVED SIGNALS: 0 so far today\./);
});
test('midday: tested alerts are counted as approved', () => assert.match(buildMidday(snap({ alerts: 2 }), ctx).text, /C\. APPROVED SIGNALS: 2 tested alerts sent today/));

test('scorecard: same-day net after costs vs the market; 5-session net vs SPY', () => {
  const L = [{ type: 'list', d: '2026-10-28', panel: 'A', sym: 'X', px: 10 }, { type: 'close', d: '2026-10-28', sym: 'X', px: 11, mkt: 0.01 },
    { type: 'list', d: '2026-10-28', panel: 'B', sym: 'Y', px: 4 }, { type: 'close', d: '2026-10-28', sym: 'Y', px: 3.8, mkt: 0.01 },
    { type: 's5', d: '2026-10-28', sym: 'X', panel: 'A', px5: 12, net: 0.191, spy: 0.01 }];
  const s = scoreboard(L); assert.equal(s.sessions, 1); assert.equal(s.panels.A.avgNet, 0.091); assert.equal(s.panels.A.beatMkt, 1); assert.equal(s.panels.A.beatSpy5, 1);
  assert.equal(s.panels.B.avgNet, -0.066); assert.equal(s.panels.B.win, 0);
});
test('after the close: scores today, lists missed runners with reasons, says when the watcher saved nothing', () => {
  const L = [{ type: 'list', d: '2026-10-28', panel: 'A', sym: 'X', px: 10 }, { type: 'close', d: '2026-10-28', sym: 'X', px: 11, mkt: 0.01 }];
  const live = { day: '2026-10-28', alerts: 0, coverage: { firstMinute: '09:26' }, tally: { UNDER_1_USD: 4 }, missed: [{ sym: 'OPENZ', code: 'UNDER_1_USD', maxUp: 0.73, firstSeen: '09:49', firstSeenUp: 0.56, afterFirstSeen: { last: -0.12 } }, { sym: 'BRAI', code: 'CAUGHT_RULE_NOT_PASSED', maxUp: 0.95, firstSeen: '09:49', firstSeenUp: 0.47, afterFirstSeen: { last: 0.28 } }, { sym: 'MSGR', code: 'CAUGHT_RULE_NOT_PASSED', maxUp: 12.9, firstSeen: '09:49', firstSeenUp: 12.1, afterFirstSeen: { last: 0.05 } }] };
  const t = buildClose('2026-10-28', live, L, {});
  assert.match(t, /- A X: \$10\.00 to \$11\.00, net \+9\.1% \(\+8\.1% vs the average stock\)/); assert.doesNotMatch(t, /- OPENZ/); assert.match(t, /\+1 under 1 USD, mostly warrants/); assert.match(t, /- BRAI up to \+95% \(first seen 09:49 at \+47%; \+28% from there to 15:00\): a rule caught it/);
  assert.match(t, /MSGR up to \+1290% \(LIKELY A SPLIT OR DATA ERROR/); assert.match(t, /Top reason for silence today: under 1 USD \(4 of 4 movers/);
  assert.match(t, /C\. APPROVED SIGNALS today: 0/); assert.match(t, /RADAR SCORECARD \(1 session; verdict after 10\)/);
  assert.match(buildClose('2026-10-29', live, [], {}), /saved no results for today/);
});

test('(28 Oct fix) with the live SEC check in the snapshot: a share-sale filing or a failed / missing check blocks a lead; the live catalyst is shown', () => {
  const t = buildMidday(snap({ hits: [], sec: { NEWSY: { known: true, tags: [] }, SHR: { known: true, tags: ['share sale / registration (S-1)'] } }, cat: { NEWSY: 'VERIFIED: SEC 8-K item 8.01 accepted 07:02 New York' },
    early: [{ sym: 'NEWSY', change: 0.04, rvT: 3, price: 12, score: 90, firstMinute: '09:40' }, { sym: 'SHR', change: 0.05, rvT: 3, price: 12, score: 91, firstMinute: '09:40' }, { sym: 'NOCHK', change: 0.05, rvT: 3, price: 12, score: 92, firstMinute: '09:40' }] }), ctx).text;
  assert.match(t, /- NEWSY \+4%/); assert.match(t, /VERIFIED: SEC 8-K item 8\.01 accepted 07:02/);
  assert.doesNotMatch(t, /- SHR /); assert.match(t, /SHR \(SEC danger filing: share sale/); assert.doesNotMatch(t, /- NOCHK /); assert.match(t, /NOCHK \(SEC check failed or not done\)/);
});
