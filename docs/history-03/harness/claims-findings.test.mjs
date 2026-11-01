// HISTORY-03 regression harness, part 2: FINDINGS and PROPOSED corrections (reviewer: Claude). Synthetic and offline only.
//   [FINDING Xnn]   characterizes the defect as it is on main f6a9b166. It PASSES now. When Codex repairs the finding it starts failing:
//                   then delete it and remove the todo flag from the matching [PROPOSED] test (that test becomes the regression gate).
//   [PROPOSED Xnn]  the corrected behaviour (proposed wording from RANKED-FINDINGS-v3.md). Marked todo: it is reported, never fails the run.
//                   "(owner Pn)" means the expected behaviour depends on an owner policy answer and must not be adopted before it.
// Run: node --test docs/history-03/harness/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mod, loadScan, blocked, lift, src } from './_env.mjs';

const SETTINGS = { focus: true };   // committed settings leave quiet, tier2, opportunitiesOnly unset
const sig = (extra = {}) => ({ session: '2026-10-27', market: { above50: true, up: true }, stocks: [{ sym: 'ZZA', last: 10 }], ...extra });
async function actions(files = {}, s = sig()) {
  const S = await loadScan({ files: { 'data/settings.json': SETTINGS, 'data/signals.json': s, ...files }, env: { TD_BASE: 'http://127.0.0.1:9', FH_BASE: 'http://127.0.0.1:9', SEC_BASE: 'http://127.0.0.1:9' } });
  return { S, t: await S.fn('actionsText')(s, S.fn('loadPos')(), null, 'ACTIONS TEST') };
}
const section = (t, name, next) => { const i = t.indexOf('\n' + name); if (i < 0) return ''; const j = next ? t.indexOf('\n' + next, i + 1) : -1; return j < 0 ? t.slice(i) : t.slice(i, j); };

// ---- B01 / D15: delivery counts, paper versus approved -------------------------------------------------------------------------------
test('[FINDING B01] radar panel C prints the watcher alert count as "APPROVED ... tested alerts sent"', async () => {
  const RC = await mod('radar-v3-core.mjs'), { ctx, snap } = await lift('test/radar-v3-core.test.mjs', ['ctx', 'snap']);
  assert.match(RC.buildMidday(snap({ alerts: 2 }), ctx).text, /C\. APPROVED SIGNALS: 2 tested alerts sent today/);
});
test('[FINDING B01/D15] source contract: the watcher counts an alert before the send check and for the early paper kind too', () => {
  const s = src('ignition-watch.mjs'), a = s.indexOf('alerts++; if (early) earlyAlerts++'), b = s.indexOf('if (!sendAlert({ early }');
  assert.ok(a > 0 && b > a, 'alerts++ (shared by approved and early paper alerts) runs before sendAlert decides whether anything is sent');
  assert.match(s, /writeFileSync\('data\/radar-v3-snap\.json', JSON\.stringify\(\{[^}]*\balerts,/, 'the snapshot carries that single counter');
});
test('[PROPOSED B01] radar panel C counts only approved alerts that were actually sent, and lists early paper alerts separately', { todo: 'Codex: split the counter (approved/early paper, sent/recorded); snapshot field names are a proposal' }, async () => {
  const RC = await mod('radar-v3-core.mjs'), { ctx, snap } = await lift('test/radar-v3-core.test.mjs', ['ctx', 'snap']);
  const t = RC.buildMidday(snap({ alerts: { approvedSent: 0, earlyPaperRecorded: 2, earlyPaperSent: 0 } }), ctx).text;
  assert.match(t, /C\. APPROVED SIGNALS: 0/);
  assert.match(t, /EARLY PAPER ALERTS \(NOT PROVEN\): 2 recorded, 0 sent/);
  assert.doesNotMatch(t, /tested alerts sent/);
});

// ---- C01 / B02: paper alert body ----------------------------------------------------------------------------------------------------
test('[FINDING C01] source contract: the early paper alert (NOT PROVEN) uses the approved alert body with a BUY line', () => {
  const s = src('ignition-watch.mjs'), i = s.indexOf("'EARLY WAVE ALERT [PAPER, NOT PROVEN]"), j = s.indexOf("'BUY only up to '", i);
  assert.ok(i > 0 && j > i && !/early \?[^\n]*'BUY only up to '/.test(s.slice(i, j + 20)), 'the BUY line is not conditioned on the alert kind');
});
test('[PROPOSED C01] (owner P1) an early paper alert carries no BUY / STOP / EXIT instruction', { todo: 'owner P1 first; then Codex aligns ignition-watch.mjs' }, () => {
  const s = src('ignition-watch.mjs'), i = s.indexOf("'EARLY WAVE ALERT [PAPER, NOT PROVEN]");
  assert.match(s.slice(i, i + 3000), /early \? 'PAPER ONLY/);
});

// ---- D06: tier-2 lanes print plain BUY lines -----------------------------------------------------------------------------------------
const DISC = { 'data/discovery2-today.json': { rules: { 'D2-SYN': 'TRADABLE SMALL' }, sessions: ['2026-10-28'], buys: [{ sym: 'ZZD', rule: 'D2-SYN', buy: '2026-10-28', sell: '2026-11-25', hold: 20, combo: 'synthetic combo', lastClose: 10, halal: 'ok' }] },
  'data/halal.json': { ZZD: { s: 'ok', d: new Date().toISOString().slice(0, 10) } } };
test('[FINDING D06] with settings.tier2 unset and focus on, a tier-2 DISCOVERED rule prints a plain "- BUY" in TODAY\'S ACTIONS', async () => {
  const { t } = await actions(DISC);
  const today = section(t, "TODAY'S ACTIONS", 'NOT ACTIONABLE TODAY');
  assert.match(today, /DISCOVERED \(tier 2, TRADABLE SMALL/);
  assert.match(today, /^- BUY ZZD at the open on 2026-10-28/m);
  assert.equal(blocked.length, 0);
});
test('[PROPOSED D06] (owner P4) tier-2 lanes that are not owner lanes appear as PAPER lines, never as "- BUY"', { todo: 'owner P4 first; then Codex aligns the tier-2 lanes' }, async () => {
  const { t } = await actions(DISC);
  assert.doesNotMatch(section(t, "TODAY'S ACTIONS", 'NOT ACTIONABLE TODAY'), /^- BUY ZZD/m);
});

// ---- D01 (corrected by ERRATA-01): TAKE PROFIT OPTION wording --------------------------------------------------------------------------
test('[FINDING D01] the ideas list hard-codes "passed on 5 years of history" for the buy-back switch', () => {
  assert.match(src('scan.mjs'), /'Sell a stretched stock, buy back 10% lower', 'passed on 5 years of history; LIVE PAPER CHECK running/);
});
test('[FINDING D01] when the switch is admitted at tier 2 (below the luck bar), the option text says "tested on 5 years of history"', () => {
  assert.match(src('scan.mjs'), /TAKE PROFIT OPTION \(tested on 5 years of history, not yet confirmed live/);
});
test('[PROPOSED D01] a tier-2 switch option is labelled NOT PROVEN (below the luck bar), never "tested" or "passed"', { todo: 'Codex wording (and owner P3 on whether tier-2 sell options stay)' }, () => {
  const s = src('scan.mjs');
  assert.doesNotMatch(s, /TAKE PROFIT OPTION \(tested on 5 years/);
  assert.doesNotMatch(s, /passed on 5 years of history; LIVE PAPER CHECK/);
});

// ---- Wording findings on owner-facing replies -------------------------------------------------------------------------------------------
test('[FINDING W01] ways describes the pre-27-Oct plan (65% / 35% cash for Basket 1; TRY SMALL buys) and omits LEADER DIP', async () => {
  const S = await loadScan({ files: { 'data/settings.json': SETTINGS } }), t = S.fn('waysText')();
  assert.match(t, /65% of ~1,000 USD/); assert.match(t, /TRY SMALL: 1,000 USD buys/); assert.doesNotMatch(t, /LEADER DIP/);
});
test('[PROPOSED W01] ways describes the current plan', { todo: 'owner confirms the text; Codex edits waysText' }, async () => {
  const S = await loadScan({ files: { 'data/settings.json': SETTINGS } }), t = S.fn('waysText')();
  assert.doesNotMatch(t, /65% of ~1,000 USD/); assert.match(t, /SPUS 54% \+ IAUM 46%/); assert.match(t, /LEADER DIP/); assert.match(t, /TRY SMALL[^\n]*paper only/i);
});
test('[FINDING W04] HELP promises "every proven buy" although no rule is proven', async () => {
  const S = await loadScan({ files: {} });
  assert.match(S.value('HELP'), /real fills on every proven buy/); assert.match(S.value('HELP'), /every proven buy is listed/);
});
test('[PROPOSED W04] HELP does not call any buy proven', { todo: 'Codex wording' }, async () => {
  const S = await loadScan({ files: {} }); assert.doesNotMatch(S.value('HELP'), /proven buy/);
});
const NP = { generatedAt: '2026-11-01T00:00:00Z', results: { synthetic: { verdict: 'NOT PROVEN' } } };
test('[FINDING W03] longterm turns "nothing PROMISING" into "the S&P 500 beat every long-term stock-picking method tested"', async () => {
  const S = await loadScan({ files: { 'data/horizons.json': NP, 'data/quality.json': NP } });
  assert.match(S.fn('longTermLines')().join('\n'), /the S&P 500 beat every long-term stock-picking method tested/);
});
test('[PROPOSED W03] longterm says no method has passed the full test (and does not claim the S&P 500 beat them all)', { todo: 'Codex wording' }, async () => {
  const S = await loadScan({ files: { 'data/horizons.json': NP, 'data/quality.json': NP } }), t = S.fn('longTermLines')().join('\n');
  assert.doesNotMatch(t, /beat every long-term/); assert.match(t, /no long-term stock-picking method has passed the full test/i);
});
const SM = { at: '2026-11-01', verdict: 'NOT PROVEN', why: 'lost money in the older half', rising: { older: { n: 166, avg: 0.0012, spy: 0.0031 }, newer: { n: 265, avg: 0.0606, spy: 0.0114 } } };
const HL = { rules: [{ name: 'synthetic rule', verdict: 'NOT PROVEN' }] };
test('[FINDING A01] ACTIONS says insider buying "works in rising markets" for a NOT PROVEN study that trailed the S&P 500 in the older half', async () => {
  const { t } = await actions({ 'data/smart-money-study.json': SM, 'data/hunting-lab.json': HL });
  assert.match(t, /insider buying works in rising markets \(\+0\.1% \/ \+6\.1% a trade\)/);
});
test('[PROPOSED A01] the insider line states NOT PROVEN and the older-half S&P 500 comparison', { todo: 'Codex wording' }, async () => {
  const { t } = await actions({ 'data/smart-money-study.json': SM, 'data/hunting-lab.json': HL });
  assert.doesNotMatch(t, /insider buying works/); assert.match(t, /Insider buying[^\n]*NOT PROVEN/);
});
test('[FINDING D02] check SYM hard-codes "proven: stops, trim, switch, avoid rules"', async () => {
  const S = await loadScan({ files: { 'data/settings.json': SETTINGS } });
  assert.match([].concat(S.fn('sixAngles')('ZZA', sig(), {})).join('\n'), /proven: stops, trim, switch, avoid rules/);
});
test('[PROPOSED D02] check SYM calls stops, trim and AVOID risk rules in use and the switch NOT PROVEN', { todo: 'Codex wording' }, async () => {
  const S = await loadScan({ files: { 'data/settings.json': SETTINGS } }), t = [].concat(S.fn('sixAngles')('ZZA', sig(), {})).join('\n');
  assert.doesNotMatch(t, /proven: stops/); assert.match(t, /no buy rule is proven/i);
});
test('[FINDING D03] the EARNINGS DRIFT lane card says "passed its own 5-year test" (frozen earnings study: NOT PROVEN)', () => {
  assert.match(src('scan.mjs'), /EARNINGS DRIFT \| horizon: the tested hold \| YOUR CHOICE \(21 Oct\): passed its own 5-year test/);
});
test('[PROPOSED D03] the EARNINGS DRIFT card keeps the owner lane but states NOT PROVEN for its 5-year test', { todo: 'Codex wording' }, () => {
  const s = src('scan.mjs'); assert.doesNotMatch(s, /passed its own 5-year test/); assert.match(s, /EARNINGS DRIFT \| [^']*NOT PROVEN/);
});
test('[FINDING B04/E01] the live MARKET SHOCK message presents the market-day study as "tested buys" and "Decided by the system"', () => {
  const s = src('news-watch.mjs'); assert.match(s, /the system’s tested buys made /); assert.match(s, /Decided by the system from the 5-year market-day test/);
});
test('[PROPOSED B04/E01] the MARKET SHOCK figures are labelled as past test trades of pre-selected stocks, not expected returns', { todo: 'Codex wording' }, () => {
  const s = src('news-watch.mjs'); assert.doesNotMatch(s, /Decided by the system from the 5-year market-day test/); assert.match(s, /not an expected return/);
});
