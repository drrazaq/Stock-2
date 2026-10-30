// Seam: buyToday(sym, sig) in scan.mjs, the one source of "HOLD and ADD 1,000 USD" (ADD TO A STOCK YOU OWN in ACTIONS / my stocks) and
// of "Yes: add 1,000 USD" (should I buy more SYM).
// Guards review S-16 (22 Oct): buyToday checked only the evidence bar and `demoted`, so with FOCUS on ACTIONS said "no new trading buys"
// and still listed an ADD for a quick or swing setup, even from an engine LOSING live. It must pass the same gates as every other buy:
// planCands ok for that setup's kind (FOCUS, live-losing block, lottery, FADE, halal), and gateVerdict.
// Run: node test/buy-more.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const today = new Date().toISOString().slice(0, 10);
const quick = (sym) => ({ sym, n: 60, avgPct: 0.02, win: 0.6, last: 50, buyLo: 49, buyHi: 51, stop: 45, maxHold: 5 });
const swing = (sym) => ({ sym, state: 'Buy watch', n: 60, avgPct: 0.02, win: 0.6, last: 50, buyLo: 48, buyHi: 52, stop: 44, exitBelow: 46 });
const sig = (extra = {}) => ({ session: '2026-10-21', market: { above50: true, up: true }, quick: [quick('AAA')], stocks: [], ...extra });
const fullQuick = { n: 40, winRate: 0.6, avgPct: 0.02, avgSpy: 0.005, days: 12, stocks: 25 };
// a quick-trade live record that is LOSING: 25 trades, -2% a trade vs +0.5% for the S&P
const losing = { n: 25, winRate: 0.3, avgPct: -0.02, avgSpy: 0.005, days: 12, stocks: 20 };
const bt = async (settings, s, files = {}) => (await loadScan({ files: { 'data/settings.json': settings, 'data/signals.json': s, 'data/halal.json':{AAA:{s:'ok',d:new Date().toISOString().slice(0,10)}}, ...files } })).fn('buyToday')('AAA', s);

test('control: focus off, a quick setup with its own minimum live record on a stock you own is an add, with its range and stop', async () => {
  assert.deepEqual(await bt({ focus: false }, sig({quickRecord:fullQuick})), { lo: 49, hi: 51, stop: 45, n: 60, thin: false });
});

test('FOCUS on and the quick engine not proven live: no add', async () => {
  assert.equal(await bt({ focus: true }, sig()), null);
});

test('FOCUS on and the quick engine proven live under the full bar: the add is back', async () => {
  assert.deepEqual(await bt({ focus: true }, sig({ quickRecord: fullQuick })), { lo: 49, hi: 51, stop: 45, n: 60, thin: false });
});

test('the quick engine LOSING on its live record: no add, even with focus off', async () => {
  assert.equal(await bt({ focus: false }, sig({ quickRecord: losing })), null);
});

test('a stock you marked NOT halal: no add', async () => {
  assert.equal(await bt({ focus: false }, sig(), { 'data/halal.json': { AAA: { s: 'fail', d: today, by: 'ZAD (you)' } } }), null);
});

test('lottery-like (15%+ one-day jump in the last month): no add', async () => {
  assert.equal(await bt({ focus: false }, sig({ lottery: { AAA: 0.2 } })), null);
});

test('FOCUS on with only quick trades working: a swing setup on the stock is not an add', async () => {
  const s = sig({ quick: [], stocks: [swing('AAA')], quickRecord: fullQuick });
  assert.equal(await bt({ focus: true }, s), null);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
