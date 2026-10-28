// Seams: planCands(sig) and gateVerdict(sym, sig) (FOCUS mode), scorecardText() (what the live record counts).
// Guards review S-14 (22 Oct): FOCUS was lifted for EVERY engine as soon as any scorecard row said POSITIVE, including the TRADABLE
// SMALL (tier-2) ledger rows and the Alpaca rows of other kinds, and even with  tier2 off . Now FOCUS is lifted only for the engine
// kind whose OWN live record is POSITIVE under the full live bar (30+ trades, 10+ distinct days, 20+ stocks). Tier-2 ledger rows
// never lift FOCUS, and with tier2 off they are not shown or counted at all (exactly as before tier 2).
// Run: node test/focus-per-kind.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

// a quick trade and a swing trade that both clear every evidence bar on their own (60 unseen trades, +2% gross, 60% won)
const quick = (sym) => ({ sym, n: 60, avgPct: 0.02, win: 0.6, last: 50, buyLo: 49, buyHi: 51, stop: 45, maxHold: 5 });
const swing = (sym) => ({ sym, state: 'Buy watch', n: 60, avgPct: 0.02, win: 0.6, last: 50, buyLo: 49, buyHi: 51, stop: 45, exitBelow: 46 });
const sig = (extra = {}) => ({ session: '2026-10-21', market: { above50: true, up: true }, quick: [quick('AAA')], stocks: [swing('BBB')], ...extra });
// the full live bar: 40 trades on 12 distinct days in 25 stocks, +2% a trade vs +0.5% for the S&P 500
const quickFull = { n: 40, winRate: 0.6, avgPct: 0.02, avgSpy: 0.005, days: 12, stocks: 25 };
// 30 resolved rows on 10 distinct days in 30 stocks, all +9%: POSITIVE under the full bar
const rows30 = (mk) => Array.from({ length: 30 }, (_, i) => mk(i, '2026-09-' + String(10 + (i % 10)).padStart(2, '0')));
const tier2Ledger = rows30((i, d) => ({ d, sym: 'T' + i, kind: 'longer hold', px: 10, px1: 10.9, pct: 0.09, out: '2026-10-20' }));
const alpaca = (engine) => ({ closed: rows30((i, d) => ({ engine, sym: 'P' + i, net: 0.02, out: d })) });
const ok = (S, s) => Object.fromEntries(S.fn('planCands')(s, {}).filter(x => ['AAA', 'BBB'].includes(x.sym)).map(x => [x.sym, x.ok]));

test('control: FOCUS on and no live record anywhere: both are paper only', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { focus: true }, 'data/signals.json': sig() } });
  assert.deepEqual(ok(S, sig()), { AAA: false, BBB: false });
});

test('a POSITIVE TRADABLE SMALL ledger never lifts FOCUS for the engines', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { focus: true, tier2: true }, 'data/signals.json': sig(), 'data/tier2-ledger.jsonl': tier2Ledger } });
  assert.deepEqual(ok(S, sig()), { AAA: false, BBB: false });
  assert.match(S.fn('gateVerdict')('AAA', sig()), /focus mode/);
});

test('a POSITIVE Alpaca record of another kind does not lift FOCUS for quick or swing trades', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { focus: true }, 'data/signals.json': sig(), 'data/alpaca-paper.json': alpaca('event drift') } });
  assert.deepEqual(ok(S, sig()), { AAA: false, BBB: false });
});

test('the quick-trade record POSITIVE under the full bar lifts FOCUS for quick trades only', async () => {
  const s = sig({ quickRecord: quickFull });
  const S = await loadScan({ files: { 'data/settings.json': { focus: true }, 'data/signals.json': s } });
  assert.deepEqual(ok(S, s), { AAA: true, BBB: false });
  assert.equal(S.fn('gateVerdict')('AAA', s), null);
  assert.match(S.fn('gateVerdict')('BBB', s), /focus mode/);
});

test('the Alpaca quick record POSITIVE under the full bar lifts quick trades only', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { focus: true }, 'data/signals.json': sig(), 'data/alpaca-paper.json': alpaca('quick') } });
  assert.deepEqual(ok(S, sig()), { AAA: true, BBB: false });
});

test('a quick-trade record POSITIVE on 40 trades but without its days and stocks known does not lift FOCUS (full bar not shown)', async () => {
  const s = sig({ quickRecord: { n: 40, winRate: 0.6, avgPct: 0.02, avgSpy: 0.005 } });
  const S = await loadScan({ files: { 'data/settings.json': { focus: true }, 'data/signals.json': s } });
  assert.deepEqual(ok(S, s), { AAA: false, BBB: false });
});

test('a quick-trade record on 40 trades but only 5 distinct days does not lift FOCUS', async () => {
  const s = sig({ quickRecord: { ...quickFull, days: 5 } });
  const S = await loadScan({ files: { 'data/settings.json': { focus: true }, 'data/signals.json': s } });
  assert.deepEqual(ok(S, s), { AAA: false, BBB: false });
});

test('FOCUS on: a ticker with no tested setup is blocked even when one engine kind is working', async () => {
  const s = sig({ quickRecord: quickFull });
  const S = await loadScan({ files: { 'data/settings.json': { focus: true }, 'data/signals.json': s } });
  assert.match(S.fn('gateVerdict')('ZZZ', s), /focus mode/);
});

test('tier2 off: the TRADABLE SMALL ledger rows are not shown or counted in the scorecard', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { tier2: false }, 'data/signals.json': sig(), 'data/tier2-ledger.jsonl': tier2Ledger } });
  assert.doesNotMatch(S.fn('scorecardText')(), /TRADABLE SMALL/);
  assert.equal(S.value('SC_ROWS').some(r => /TRADABLE SMALL/.test(r.engine)), false);
});

test('control: tier2 on: the ledger row is shown in the scorecard', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { tier2: true }, 'data/signals.json': sig(), 'data/tier2-ledger.jsonl': tier2Ledger } });
  assert.match(S.fn('scorecardText')(), /TRADABLE SMALL ledger, longer hold/);
});

test('ACTIONS: a POSITIVE tier-2 ledger alone keeps the FOCUS MODE notice and does not open the opportunities board', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { focus: true, tier2: true }, 'data/signals.json': sig(), 'data/tier2-ledger.jsonl': tier2Ledger } });
  const t = await S.fn('actionsText')(sig(), {}, {});
  assert.match(t, /FOCUS MODE/);
  assert.doesNotMatch(t, /OPPORTUNITIES BEYOND/);
});

test('ACTIONS (V3.0 fix 3, 28 Oct): long-term advice sits under its own LONG-TERM heading at the end, never in the trading part', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { focus: true, tier2: true }, 'data/signals.json': sig(), 'data/tier2-ledger.jsonl': tier2Ledger } });
  const t = await S.fn('actionsText')(sig(), {}, {}), lt = t.indexOf('LONG-TERM (separate from trading');
  assert.ok(lt > 0, 'LONG-TERM heading present');
  assert.ok(t.indexOf('BEST USE OF YOUR NEXT 1,000 USD') > lt, 'index-fund advice after the heading');
  assert.ok(t.indexOf('What to do instead of engine buys') > lt);
  assert.doesNotMatch(t.slice(0, lt), /index fund/i);
  assert.match(t.slice(0, lt), /OPPORTUNITY RADAR at 11:15 New York/);
});

test('CONCLUSION: with only quick trades working, the same stock as a swing setup is not printed as a swing BUY', async () => {
  const s = sig({ quickRecord: quickFull, stocks: [swing('AAA')] });
  const S = await loadScan({ files: { 'data/settings.json': { focus: true }, 'data/signals.json': s } });
  const t = S.fn('conclusion')(s, {}).join('\n');
  assert.match(t, /AAA: BUY .*out after 5 sessions/);
  assert.doesNotMatch(t, /AAA: BUY .*swing trade/);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
