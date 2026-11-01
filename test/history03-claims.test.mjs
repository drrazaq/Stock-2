// Adapted from Claude 5bcf4d29. Corrected behavior only: no assertion requires a known defect.
// Policy-dependent proposals remain TODO; see docs/history-03/ERRATA-01.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mod, loadScan, blocked, lift, src } from './history03-env.mjs';

const SETTINGS = { focus: true };   // committed settings leave quiet, tier2, opportunitiesOnly unset
const sig = (extra = {}) => ({ session: '2026-10-27', market: { above50: true, up: true }, stocks: [{ sym: 'ZZA', last: 10 }], ...extra });
async function actions(files = {}, s = sig()) {
  const S = await loadScan({ files: { 'data/settings.json': SETTINGS, 'data/signals.json': s, ...files }, env: { TD_BASE: 'http://127.0.0.1:9', FH_BASE: 'http://127.0.0.1:9', SEC_BASE: 'http://127.0.0.1:9' } });
  return { S, t: await S.fn('actionsText')(s, S.fn('loadPos')(), null, 'ACTIONS TEST') };
}
const section = (t, name, next) => { const i = t.indexOf('\n' + name); if (i < 0) return ''; const j = next ? t.indexOf('\n' + next, i + 1) : -1; return j < 0 ? t.slice(i) : t.slice(i, j); };

// ---- B01 / D15: delivery counts, paper versus approved -------------------------------------------------------------------------------
test('[CORRECTED B01] radar separates acknowledged gate-qualified and early-paper messages from recorded/uncertain events',async()=>{
 const RC=await mod('radar-v3-core.mjs'),{alertDeliveryCounts}=await mod('radar-v3-core.mjs'),{ctx,snap}=await lift('test/radar-v3-core.test.mjs',['ctx','snap']);
 const events=[{d:'2026-10-30',sym:'ZZQ',rule:'IG8',m:600,deliveryKind:'EARLY_PAPER',deliveryState:'UNSENT'},{d:'2026-10-30',sym:'ZZP',rule:'IG8',m:600,deliveryKind:'EARLY_PAPER',deliveryState:'UNCERTAIN'}];
 const alertCounts=alertDeliveryCounts(events,0),text=RC.buildMidday(snap({alerts:0,alertCounts}),ctx).text;assert.match(text,/HISTORY\/PAPER-GATE QUALIFIED: 0 recorded, 0 sent/);assert.match(text,/EARLY PAPER ALERTS \(NOT PROVEN\): 2 recorded, 0 sent \(acknowledged\), 1 unsent, 1 uncertain/);assert.doesNotMatch(text,/tested alerts sent|APPROVED SIGNALS/);assert.match(text,/not current purchase or ZAD approval/);
 const close=RC.buildClose('2026-10-30',{day:'2026-10-30',alerts:0,alertCounts},[],{});assert.match(close,/EARLY PAPER ALERTS \(NOT PROVEN\): 2 recorded/);
});

// ---- C01 / B02: paper alert body ----------------------------------------------------------------------------------------------------
test.todo('[POLICY TODO C01] P1: decide whether paper records may produce trade instructions');

// ---- D06: tier-2 lanes print plain BUY lines -----------------------------------------------------------------------------------------
const DISC = { 'data/discovery2-today.json': { rules: { 'D2-SYN': 'TRADABLE SMALL' }, sessions: ['2026-10-28'], buys: [{ sym: 'ZZD', rule: 'D2-SYN', buy: '2026-10-28', sell: '2026-11-25', hold: 20, combo: 'synthetic combo', lastClose: 10, halal: 'ok' }] },
  'data/halal.json': { ZZD: { s: 'ok', d: new Date().toISOString().slice(0, 10) } } };
test.todo('[POLICY TODO D06] P4: decide authorization of tier-2 and auto-discovered lanes');

// ---- D01 (corrected by ERRATA-01): TAKE PROFIT OPTION wording --------------------------------------------------------------------------
test('[CORRECTED D01] a tier-2 switch option is labelled NOT PROVEN (below the luck bar), never "tested" or "passed"', () => {
  const s = src('scan.mjs');
  assert.doesNotMatch(s, /TAKE PROFIT OPTION \(tested on 5 years/);
  assert.doesNotMatch(s, /passed on 5 years of history; LIVE PAPER CHECK/);
});

// ---- Wording findings on owner-facing replies -------------------------------------------------------------------------------------------
test.todo('[POLICY TODO W01] owner confirmation of the current ways/portfolio description');
test('[CORRECTED W04] HELP does not call any buy proven', async () => {
  const S = await loadScan({ files: {} }); assert.doesNotMatch(S.value('HELP'), /proven buy/);
});
const NP = { generatedAt: '2026-11-01T00:00:00Z', results: { synthetic: { verdict: 'NOT PROVEN' } } };
test('[CORRECTED W03] longterm says no method has passed the full test (and does not claim the S&P 500 beat them all)', async () => {
  const S = await loadScan({ files: { 'data/horizons.json': NP, 'data/quality.json': NP } }), t = S.fn('longTermLines')().join('\n');
  assert.doesNotMatch(t, /beat every long-term/); assert.match(t, /no long-term stock-picking method has passed the full test/i);
});
const SM = { at: '2026-11-01', verdict: 'NOT PROVEN', why: 'lost money in the older half', rising: { older: { n: 166, avg: 0.0012, spy: 0.0031 }, newer: { n: 265, avg: 0.0606, spy: 0.0114 } } };
const HL = { rules: [{ name: 'synthetic rule', verdict: 'NOT PROVEN' }] };
test('[CORRECTED A01] the insider line states NOT PROVEN and the older-half S&P 500 comparison', async () => {
  const { t } = await actions({ 'data/smart-money-study.json': SM, 'data/hunting-lab.json': HL });
  assert.doesNotMatch(t, /insider buying works/); assert.match(t, /Insider buying[^\n]*NOT PROVEN/); assert.match(t,/older \+0\.1% vs S&P 500 \+0\.3%/); assert.match(t,/not prospective evidence/);
});
test('[CORRECTED D02] check SYM calls stops, trim and AVOID risk rules in use and the switch NOT PROVEN', async () => {
  const S = await loadScan({ files: { 'data/settings.json': SETTINGS } }), t = [].concat(S.fn('sixAngles')('ZZA', sig(), {})).join('\n');
  assert.doesNotMatch(t, /proven: stops/); assert.match(t, /no buy rule is proven/i);
});
test('[CORRECTED D03] actual earnings card keeps the existing gated lane without inventing a pass or fixed return', async () => {
 const pead={sym:'EEE',live:true,inTest:true,buyLo:30,buyHi:31,stop:27,hold:40,sma20:29,sur:0.12,up:0.05,test:{n:176,avg:0.018,win:0.55}};
 const {t}=await actions({'data/earnings-study.json':{verdict:'PROMISING'},'data/halal.json':{EEE:{s:'ok',d:new Date().toISOString().slice(0,10)}},'data/names.json':{EEE:'Synthetic issuer'}},sig({pead:[pead]}));
 assert.match(t,/EARNINGS DRIFT \|[^\n]*NOT PROVEN/);assert.match(t,/- BUY EEE/);assert.doesNotMatch(t,/passed its own 5-year test|\+1\.8% a trade over 176/);assert.deepEqual(blocked,[]);
});
test('[CORRECTED B04/E01] the MARKET SHOCK figures are labelled as past test trades of pre-selected stocks, not expected returns', () => {
  const s = src('news-watch.mjs'); assert.doesNotMatch(s, /Decided by the system from the 5-year market-day test/); assert.match(s, /not an expected return/);
});

test.todo('[POLICY TODO] P2: per-stock history checks and engine eligibility');
test.todo('[POLICY TODO] P3: below-bar switch sell options (ERRATA-01: existing gate is already present)');
test.todo('[POLICY TODO] Confirm the automatic stop default for own-pick buys');
