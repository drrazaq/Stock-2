// Seam: early-alerts.mjs (owner, 28 Oct 2026: prompt early alerts + the Opportunity Delivery Scorecard). Safety invariants: research
// leads, paper setups and approved alerts are separate and labelled; hard rules (under 1 USD, NOT HALAL, AVOID list, SEC danger, failed
// SEC check) block every kind; the owner's level and the daily caps are obeyed; every candidate ends with a traceable decision.
// Run: node --test test/early-alerts.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEarlyAlerts, leadSoftReason, hardReason, alertLevel, levelAllows, summarize, scorecardText, LEAD } from '../early-alerts.mjs';

const lead = (sym, o = {}) => ({ sym, m: 600, price: 12, chg: 0.04, score: 90, rvT: 3, dollarVol: 2e6, live: true, ...o });
function make(o = {}) {
  const sent = [];
  const EA = createEarlyAlerts({ day: '2026-10-29', level: 'all', now: () => 601, lottery: { JUMP: 0.4 }, record: { 'IG1/close': { n: 68, avg: 0.021, noTop2: -0.002 } }, lab: { 'IG1/close': { verdict: 'REJECTED' } },
    send: async (t) => { sent.push(t); return { ok: o.sendOk !== false, why: o.sendOk === false ? 'HTTP 429' : '' }; },
    secRisk: async (s) => (s === 'DIL' ? { known: true, tags: ['share sale / registration (S-1)'] } : s === 'NOSEC' ? { known: false, tags: [] } : { known: true, tags: [] }),
    notHalal: (s) => s === 'BAD', halalOk: (s) => s === 'GOOD', ...o });
  return { EA, sent };
}

test('level: all by default; paper / approved / off narrow it; unknown values fall back to all', () => {
  assert.equal(alertLevel({}), 'all'); assert.equal(alertLevel({ alerts: 'paper' }), 'paper'); assert.equal(alertLevel({ alerts: 'loud' }), 'all');
  assert.equal(levelAllows('all', 'lead'), true); assert.equal(levelAllows('paper', 'lead'), false); assert.equal(levelAllows('paper', 'paper'), true); assert.equal(levelAllows('approved', 'paper'), false); assert.equal(levelAllows('off', 'paper'), false);
});
test('lead trigger EW-ALERT-1 (pre-registered): +3% to +8%, score 80+, 1M USD traded, live, 9:35-11:30', () => {
  assert.equal(leadSoftReason(lead('A')), null);
  assert.match(leadSoftReason(lead('A', { chg: 0.12 })), /extended/); assert.match(leadSoftReason(lead('A', { chg: 0.02 })), /under \+3%/);
  assert.match(leadSoftReason(lead('A', { score: 70 })), /score/); assert.match(leadSoftReason(lead('A', { dollarVol: 5e5 })), /1M USD/);
  assert.match(leadSoftReason(lead('A', { live: false })), /fresh/); assert.match(leadSoftReason(lead('A', { m: 560 })), /before/); assert.match(leadSoftReason(lead('A', { m: 700 })), /after/);
  assert.deepEqual(LEAD, { minScore: 80, chgMin: 0.03, chgMax: 0.08, minDollarVol: 1e6, from: 575, to: 690, perDay: 5 });   // frozen: changing it is a new pre-registered trigger
});
test('hard rules: under 1 USD, NOT HALAL, AVOID list, SEC danger, and a FAILED SEC check all block', () => {
  assert.match(hardReason({ price: 0.8, sec: { known: true, tags: [] } }), /under 1 USD/); assert.match(hardReason({ price: 5, halalFail: true, sec: { known: true, tags: [] } }), /NOT HALAL/);
  assert.match(hardReason({ price: 5, lottery: 0.3, sec: { known: true, tags: [] } }), /AVOID/); assert.match(hardReason({ price: 5, sec: { known: false } }), /SEC check failed/);
  assert.match(hardReason({ price: 5, sec: { known: true, tags: ['late financial report (NT 10-Q)'] } }), /SEC danger/); assert.equal(hardReason({ price: 5, sec: { known: true, tags: [] } }), null);
});
test('leads: one message, labelled NOT AN APPROVED BUY, hard blocks never sent, each stock decided once', async () => {
  const { EA, sent } = make();
  for (const s of ['GOOD', 'BAD', 'DIL', 'JUMP', 'NOSEC']) EA.noteLead(lead(s)); EA.noteLead(lead('PENNY', { price: 0.9 }));
  await EA.process(); assert.equal(sent.length, 1);
  assert.match(sent[0], /^EARLY WATCH: RESEARCH LEAD \(NOT AN APPROVED BUY\) 10:00 New York/); assert.match(sent[0], /- GOOD \+4\.0% at \$12\.00.*Halal \(your ZAD mark\)/); assert.match(sent[0], /UNPROVEN/);
  for (const s of ['BAD', 'DIL', 'JUMP', 'NOSEC', 'PENNY']) assert.doesNotMatch(sent[0], new RegExp('- ' + s + ' '));
  EA.noteLead(lead('GOOD', { m: 610 })); await EA.process(); assert.equal(sent.length, 1);   // once a day
  const d = Object.fromEntries(Object.values(EA.S.seen).map(r => [r.sym, r.decision]));
  assert.equal(d.GOOD, 'SENT'); assert.match(d.BAD, /^HARD: NOT HALAL/); assert.match(d.DIL, /^HARD: SEC danger/); assert.match(d.JUMP, /^HARD: AVOID/); assert.match(d.NOSEC, /^HARD: SEC check failed/); assert.match(d.PENNY, /^HARD: under 1 USD/);
});
test('a stock under the trigger is re-checked until it qualifies; an extended one is final', async () => {
  const { EA, sent } = make();
  EA.noteLead(lead('A', { chg: 0.02 })); EA.noteLead(lead('B', { chg: 0.2 })); await EA.process(); assert.equal(sent.length, 0);
  EA.noteLead(lead('A', { chg: 0.05 })); EA.noteLead(lead('B', { chg: 0.05 })); await EA.process(); assert.equal(sent.length, 1); assert.match(sent[0], /- A /); assert.doesNotMatch(sent[0], /- B /);
});
test('daily cap: 5 leads, the rest logged as LIMIT; level paper mutes leads but logs them', async () => {
  let { EA, sent } = make(); for (let i = 0; i < 7; i++) EA.noteLead(lead('S' + i)); await EA.process();
  assert.equal((sent[0].match(/\n- S/g) || []).length, 5); assert.equal(Object.values(EA.S.seen).filter(r => /^LIMIT/.test(r.decision)).length, 2);
  ({ EA, sent } = make({ level: 'paper' })); EA.noteLead(lead('GOOD')); await EA.process(); assert.equal(sent.length, 0); assert.equal(EA.S.seen['lead|GOOD'].decision, 'MUTED: alerts paper');
});
test('paper setups: separate message with the rule record, the without-2-best figure and the 5-year verdict; none after 11:30', async () => {
  const { EA, sent } = make();
  EA.notePaper({ sym: 'GOOD', rule: 'IG1', m: 590, price: 3.1 }, 0.12); EA.notePaper({ sym: 'LATE', rule: 'IG1', m: 700, price: 5 }, 0.12); await EA.process();
  assert.equal(sent.length, 1); assert.match(sent[0], /^EARLY WATCH: PAPER SETUP \(NOT AN APPROVED BUY\)/); assert.match(sent[0], /68 paper trades, \+2\.1% a trade after costs, -0\.2% without its 2 best; minute-bar history verdict REJECTED/);
  assert.match(EA.S.seen['paper|LATE'].decision, /after 11:30/);
});
test('a failed Telegram send is recorded as SEND FAILED, not as delivered; latency is measured', async () => {
  const { EA } = make({ sendOk: false }); EA.noteLead(lead('GOOD')); await EA.process();
  assert.match(EA.S.seen['lead|GOOD'].decision, /^SEND FAILED: HTTP 429/);
  const g = make(); g.EA.noteLead(lead('GOOD')); await g.EA.process(); assert.equal(g.EA.S.seen['lead|GOOD'].latencyMin, 1);
});
test('scorecard: funnel counts, results after costs at 15:00, and every eligible +2% net candidate that was not delivered, with why', async () => {
  const { EA } = make();
  for (let i = 0; i < 6; i++) EA.noteLead(lead('S' + i)); EA.noteLead(lead('BAD')); EA.noteLead(lead('SOFTY', { chg: 0.01 })); EA.notePaper({ sym: 'GOOD', rule: 'IG1', m: 590, price: 3.1 }, 0.12);
  await EA.process();
  const px = { S0: 12.6, S1: 11.5, S2: 12, S3: 12, S4: 12, S5: 13, BAD: 15, GOOD: 3.0 }, { rows, summary: d } = EA.finish(px, null, 0);
  assert.equal(d.detected, 9); assert.equal(d.metTrigger, 8); assert.equal(d.eligible, 7); assert.deepEqual(d.hard, { 'NOT HALAL (ZAD)': 1 }); assert.deepEqual(d.soft, { 'move under +3% so far': 1 });
  assert.equal(d.delivered, 6); assert.equal(d.limited, 1); assert.equal(d.deliveredScored, 6); assert.equal(d.deliveredWon, 1);
  assert.deepEqual(d.missedGood.map(x => x.sym + ' ' + x.why), ['S5 LIMIT: 5 a day reached']);
  assert.equal(rows.find(r => r.sym === 'S0').net, 0.041);   // 12 -> 12.6 is +5% gross, +4.1% after 0.6% fees and 0.3% spread
  const t = scorecardText({ ...d, approved: 0 });
  assert.match(t, /detected 9 .*met the alert trigger 8; eligible 7; blocked by hard rules 1 \(NOT HALAL \(ZAD\) 1\).*DELIVERED 6 \(median 1 min after detection\); approved alerts 0\./);
  assert.match(t, /NOT delivered: S5 10:00 \+7\.4% \(limit: 5 a day reached\)/);
  assert.match(scorecardText(null), /no record for today/);
});

test('a lead that never met the trigger keeps the reason that blocked it inside the window, not "after 11:30"', () => {
  const { EA } = make(); EA.noteLead(lead('LOW', { score: 60 })); EA.noteLead(lead('LOW', { score: 60, m: 700 }));
  assert.equal(EA.S.seen['lead|LOW'].decision, 'SOFT: early-wave score under 80 (until 11:30)');
});

test('(owner approved 28 Oct) the alert shows the REAL spread and the gross move +2% net needs; a stale quote falls back to the assumed spread and says so', async () => {
  const { spreadHurdle } = await import('../early-alerts.mjs');
  assert.equal(spreadHurdle({ price: 5, bid: 4.95, ask: 5.05, qAgeSec: 3 }), 'Spread now 2.00% (bid $4.95 / ask $5.05, quote 3 s old): +2% net on 1,000 USD needs at least +4.6% gross.');
  assert.match(spreadHurdle({ price: 50, bid: 49.99, ask: 50.01, qAgeSec: 10 }), /Spread now 0\.04%.*needs at least \+2\.6% gross/);
  assert.match(spreadHurdle({ price: 5, bid: 4.95, ask: 5.05, qAgeSec: 400 }), /^Spread: no fresh quote \(last 2\.0%, 400 s old\); at an assumed 0\.3% spread \+2% net needs at least \+2\.9% gross/);
  assert.match(spreadHurdle({ price: 3 }), /no fresh quote; at an assumed 1% spread \+2% net needs at least \+3\.6% gross/);
  const { EA, sent } = make(); EA.noteLead(lead('GOOD', { bid: 11.99, ask: 12.01, qAgeSec: 2 })); await EA.process(); assert.match(sent[0], /Spread now 0\.17% \(bid \$11\.99 \/ ask \$12\.01/);
  assert.equal(EA.S.seen['lead|GOOD'].decision, 'SENT');   // display only: the decision is unchanged
});
