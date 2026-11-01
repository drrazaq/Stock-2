// HISTORY-03 regression harness, part 1: CURRENT POLICY (reviewer: Claude).
// These tests assert behaviour that is correct under the owner's current written policy (CLAUDE.md, 27-28 Oct decisions). They must
// pass on main f6a9b166 AND keep passing after Codex's wording repairs. Synthetic fixtures only; no network, no owner data.
// Run: node --test docs/history-03/harness/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { REPO, mod, loadScan, blocked, lift, SYN } from './history03-env.mjs';

test('[CURRENT POLICY] paper vs approved: early paper alerts are recorded but NOT sent while opportunitiesOnly is on (default)', async () => {
  const { sendAlert, oppOnly } = await mod('opp-mode.mjs');
  assert.equal(oppOnly({}), true, 'opportunitiesOnly defaults to on');
  assert.equal(sendAlert({ early: true }, {}), false, 'early (paper, NOT PROVEN) alert is not sent by default');
  assert.equal(sendAlert({ early: false }, {}), true, 'an alert from a rule that passed its history test is sent');
  assert.equal(sendAlert({ early: true }, { opportunitiesOnly: false }), true, 'documented switch: opportunitiesOnly false sends early paper alerts too');
});

test('[CURRENT POLICY] radar panels A and B are labelled NOT AN APPROVED BUY and hard-blocked names never appear as leads', async () => {
  const RC = await mod('radar-v3-core.mjs'), { ctx, snap } = await lift('test/radar-v3-core.test.mjs', ['ctx', 'snap']);
  const t = RC.buildMidday(snap(), ctx).text;
  assert.match(t, /B\. SHORT SETUPS \(PAPER, NOT AN APPROVED BUY\)/);
  assert.match(t, /A\. LIVE RESEARCH LEADS \(NOT AN APPROVED BUY\)/);
  for (const s of ['BAD', 'DIL', 'JUMP']) assert.doesNotMatch(t.split('BLOCKED by hard rules')[0], new RegExp('^- ' + s + '\\b', 'm'), s + ' must not be a lead');
  assert.match(t, /BLOCKED by hard rules \(not leads\):/);
  assert.match(t, /history (?:test |verdict )?REJECTED/, 'a rejected rule shows its verdict next to its paper record');
});

test('[CURRENT POLICY] early alerts: every message is labelled research/paper, and the delivery scorecard counts what was actually sent', async () => {
  const EA0 = await mod('early-alerts.mjs'), { lead, make } = await lift('test/early-alerts.test.mjs', ['lead', 'make']);
  const { EA, sent } = make();
  for (const s of ['GOOD', 'BAD', 'DIL', 'JUMP', 'NOSEC']) EA.noteLead(lead(s));
  for (let i = 0; i < 6; i++) EA.noteLead(lead('S' + i));
  EA.notePaper({ sym: 'GOOD', rule: 'IG1', m: 590, price: 3.1 }, 0.12);
  await EA.process();
  for (const m of sent) { assert.match(m, /NOT AN APPROVED BUY/); assert.match(m, /never approved BUY eligibility/); }
  const leadMsgs = sent.filter(m => /RESEARCH LEADS/.test(m)), names = new Set(leadMsgs.flatMap(m => [...m.matchAll(/^- ([A-Z0-9.]+) /gm)].map(x => x[1])));
  const { summary } = EA.finish({ S0: 12.6, S1: 11.5, S2: 12, S3: 12, S4: 12, S5: 13, BAD: 15, GOOD: 3.0 }, null, 0);
  const paperNames = new Set(sent.filter(m => /PAPER SETUP/.test(m)).flatMap(m => [...m.matchAll(/^- ([A-Z0-9.]+):/gm)].map(x => x[1])));
  assert.equal(summary.delivered, names.size + paperNames.size, 'DELIVERED equals the distinct names actually present in sent messages');
  assert.match(EA0.scorecardText({ ...summary, approved: 0 }), new RegExp('DELIVERED ' + summary.delivered + ' '));
  for (const s of ['BAD', 'DIL', 'JUMP', 'NOSEC']) assert.equal(names.has(s), false, s + ' is hard-blocked');
});

test('[CURRENT POLICY] conflicting advice: the holdings TAKE PROFIT OPTION gate and the rebuy reply agree (switch NOT PROVEN by A-SWR1)', async () => {
  const S = await loadScan({ files: { 'data/settings.json': {}, 'data/rebuy.json': SYN.rebuyBelowBar, 'data/agent-a-lab.json': { verdicts: { 'A-SWR1/STRETCH/LOWER10': 'NOT PROVEN', 'A-SWR1/SPIKE/LOWER10': 'NOT PROVEN' } } } });
  const r = SYN.rebuyBelowBar.results['STRETCH/LOWER10'];
  assert.equal(S.fn('swTier')(r), null, 'no TAKE PROFIT OPTION may fire');
  assert.match(S.fn('rebuyText')(), /DECISION: no switch beat holding/);
  assert.equal(blocked.length, 0);
});

test('[CURRENT POLICY] conflicting advice: when the switch is admitted at tier 2, both replies change together', async () => {
  const S = await loadScan({ files: { 'data/settings.json': {}, 'data/rebuy.json': SYN.rebuyBelowBar, 'data/agent-a-lab.json': { verdicts: { 'A-SWR1/STRETCH/LOWER10': 'TRADABLE SMALL', 'A-SWR1/SPIKE/LOWER10': 'NOT PROVEN' } } } });
  const r = SYN.rebuyBelowBar.results['STRETCH/LOWER10'];
  assert.equal(S.fn('swTier')(r), 'small');
  assert.match(S.fn('rebuyText')(), /DECISION: the 10%-lower buy-back passes the existing switch gate; NOT PROVEN/);
  assert.equal(blocked.length, 0);
});

test('[CURRENT POLICY] the two danger-filing SELL reasons quote the frozen Squad 29 numbers and period', async () => {
  const s = (await import('node:fs')).readFileSync(REPO + '/scan.mjs', 'utf8');
  assert.match(s, /such stocks lagged the average stock by about 12-16% over the next 60 sessions in 5 years of tests/);
  assert.match(s, /delisting \/ listing-standard notice \(8-K 3\.01/);
});

test('[CURRENT POLICY] stronger stored switch verdict remains visible without changing its gate or calling it newly proven',async()=>{
 const rb=structuredClone(SYN.rebuyBelowBar);rb.results['STRETCH/LOWER10'].verdict='SWITCH WINS';const S=await loadScan({files:{'data/settings.json':{},'data/rebuy.json':rb,'data/agent-a-lab.json':{verdicts:{'A-SWR1/STRETCH/LOWER10':'PROVEN','A-SWR1/SPIKE/LOWER10':'NOT PROVEN'}}}});
 assert.equal(S.fn('swTier')(rb.results['STRETCH/LOWER10']),'proven');assert.match(S.fn('rebuyText')(),/stored switch-study verdict SWITCH WINS \(not independently reproduced here\)/);
});
