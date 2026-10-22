// Seam: tradeWords() in scan.mjs, which rewrites every Telegram message before the command handlers see it.
// Guards audit C1 (22 Oct): "bought option ..." / "sold option ..." were rewritten into STOCK trades
// ("bought HQY 2.4 95 shares"), so the options trial was recorded as a 95-share stock position.
// Run: node test/trade-words.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';

const S = await loadScan();
const tradeWords = S.fn('tradeWords');

test('an options-trial buy is passed through unchanged, not turned into a stock trade', () => {
  assert.equal(tradeWords('bought option HQY 95 2026-11-21 2.40'), 'bought option HQY 95 2026-11-21 2.40');
});

test('an options-trial sale is passed through unchanged', () => {
  assert.equal(tradeWords('sold option HQY 95 2026-11-21 3.10'), 'sold option HQY 95 2026-11-21 3.10');
});

test('a standard stock buy with shares still reads as a stock trade', () => {
  assert.equal(tradeWords('bought VRTX 500.55 20 shares'), 'bought VRTX 500.55 20 shares');
});

test('a plain-English stock buy is still rewritten to the standard form', () => {
  // worked example from the comment above tradeWords in scan.mjs
  assert.equal(tradeWords('I bought 10 shares of RELL at 21.19'), 'bought RELL 21.19 10 shares');
});

test('no network was touched', () => assert.deepEqual(blocked, []));
