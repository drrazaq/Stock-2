// Seams: planCands(sig) (every buy line in scan.mjs comes from it) and gateVerdict(sym, sig) (the one gate used by check, tips,
// sector, penny and source replies). Guards audit A1/A4-A6/A11/A12 and B1 (22 Oct): the gates lived in ACTIONS only, so alerts,
// buttons and replies printed BUY lines for stocks the owner marked NOT halal, lottery-like stocks, FADE tips and engines in
// FOCUS mode; and earnings drift must follow the CURRENT study verdict (32ffebd).
// Run: node test/buy-gates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const today = new Date().toISOString().slice(0, 10);
// A quick trade that clears every evidence bar on its own: 60 unseen trades, +2% gross a trade (+1.3% after costs), 60% won.
const quick = (sym) => ({ sym, n: 60, avgPct: 0.02, win: 0.6, last: 50, buyLo: 49, buyHi: 51, stop: 45, maxHold: 5 });
// A live earnings-drift signal (beat by 12%, closed up 5% on the news).
const pead = (sym) => ({ sym, live: true, inTest: true, buyLo: 30, buyHi: 31, stop: 27, hold: 40, sma20: 29, sur: 0.12, up: 0.05, test: { n: 176, avg: 0.018, win: 0.55 } });
const sig = (extra = {}) => ({ session: '2026-10-21', market: { above50: true, up: true }, quick: [quick('AAA')], ...extra });
// a quick-trade live record that the scorecard calls POSITIVE (40 trades, +2% a trade vs +0.5% for the S&P): one WORKING engine
const working = { n: 40, winRate: 0.6, avgPct: 0.02, avgSpy: 0.005 };
const find = (S, s, sym) => S.fn('planCands')(s, {}).find(x => x.sym === sym);

test('control: with focus off and no other gate, the proven quick trade is a buy', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { focus: false }, 'data/signals.json': sig() } });
  const x = find(S, sig(), 'AAA');
  assert.equal(x.ok, true);
  assert.equal(S.fn('gateVerdict')('AAA', sig()), null);
});

test('a stock the owner marked NOT halal in ZAD is never a buy and the gate says why', async () => {
  const files = { 'data/settings.json': { focus: false }, 'data/halal.json': { AAA: { s: 'fail', d: today, by: 'ZAD (you)' } }, 'data/signals.json': sig() };
  const S = await loadScan({ files });
  assert.equal(S.fn('planCands')(sig(), {}).some(x => x.sym === 'AAA' && x.ok), false);
  assert.match(S.fn('gateVerdict')('AAA', sig()), /NOT halal/);
});

test('a 15%+ one-day jump in the last month (lottery-like) blocks the buy', async () => {
  const s = sig({ lottery: { AAA: 0.18 } });
  const S = await loadScan({ files: { 'data/settings.json': { focus: false }, 'data/signals.json': s } });
  const x = find(S, s, 'AAA');
  assert.equal(x.ok, false); assert.equal(x.lottery, 0.18);
  assert.match(S.fn('gateVerdict')('AAA', s), /lottery/);
});

test('a stock tipped by a FADE source blocks the buy', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { focus: false }, 'data/signals.json': sig(), 'data/tip-score.json': { fade: [{ sym: 'AAA', src: 'Loud Channel' }] } } });
  const x = find(S, sig(), 'AAA');
  assert.equal(x.ok, false); assert.equal(x.fade, 'Loud Channel');
  assert.match(S.fn('gateVerdict')('AAA', sig()), /FADE/);
});

test('FOCUS on and no WORKING engine: the quick trade is paper only, on every path', async () => {
  const S = await loadScan({ files: { 'data/settings.json': { focus: true }, 'data/signals.json': sig() } });
  const x = find(S, sig(), 'AAA');
  assert.equal(x.ok, false); assert.equal(x.paperOnly, true);
  assert.match(S.fn('gateVerdict')('AAA', sig()), /focus mode/);
});

test('FOCUS on with a WORKING engine: the quick trade is a buy again', async () => {
  const s = sig({ quickRecord: working });
  const S = await loadScan({ files: { 'data/settings.json': { focus: true }, 'data/signals.json': s } });
  assert.equal(find(S, s, 'AAA').ok, true);
});

test('FOCUS on: earnings drift stays a buy while the earnings study verdict is PROMISING', async () => {
  const s = sig({ pead: [pead('EEE')] });
  const S = await loadScan({ files: { 'data/settings.json': { focus: true }, 'data/signals.json': s, 'data/earnings-study.json': { verdict: 'PROMISING' } } });
  const x = find(S, s, 'EEE');
  assert.equal(x.kind, 'earnings drift'); assert.equal(x.ok, true);
});

test('earnings drift is not offered at all once the current study verdict is not PROMISING', async () => {
  const s = sig({ pead: [pead('EEE')] });
  const S = await loadScan({ files: { 'data/settings.json': { focus: false }, 'data/signals.json': s, 'data/earnings-study.json': { verdict: 'NOT PROVEN' } } });
  assert.equal(find(S, s, 'EEE'), undefined);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
