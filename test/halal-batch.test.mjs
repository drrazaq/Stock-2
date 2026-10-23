// Seam: halalBatch(text) in scan.mjs. Owner, 23 Oct 2026: sent 15 ZAD marks in ONE message ("• halal QLYS yes  halal TPC yes ... halal
// MPC no • halal DINO yes") and the bot did nothing: the halal command only matched a message that was exactly one command.
// Run: node test/halal-batch.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadScan, blocked } from './load-scan.mjs';
const S = await loadScan(); const hb = S.fn('halalBatch');
const MSG = '• halal QLYS yes  halal TPC yes  halal EBAY yes. halal PCTY no  halal NEM yes   halal QTWO yes   halal MITK yes • halal IBEX yes halal USPH yes halal ADUS yes halal LAUR yes halal RELY yes halal CART yes halal MPC no • halal DINO yes.     No action from the bot';
test('every mark in one message is read, yes and no', () => {
  const r = hb(MSG);
  assert.equal(r.length, 15);
  assert.deepEqual(r.filter(x => x[1]).map(x => x[0]), ['PCTY', 'MPC']);
  assert.deepEqual(r.slice(0, 3).map(x => x[0]), ['QLYS', 'TPC', 'EBAY']);
});
test('one per line also works; a single command still works; plain text gives nothing', () => {
  assert.equal(hb('halal AAPL yes\nhalal TSLA no').length, 2);
  assert.deepEqual(hb('halal BFLY no'), [['BFLY', true]]);
  assert.deepEqual(hb('is NVDA halal?'), []);
});
test('no network was used', () => assert.deepEqual(blocked, []));

// 23 Oct: "Halal pr,lly,rell,app,ccj,grml yes": one verdict for a comma list.
test('a comma list with one verdict marks every ticker', () => {
  assert.deepEqual(hb('Halal pr,lly,rell,app,ccj,grml yes'), [['PR', false], ['LLY', false], ['RELL', false], ['APP', false], ['CCJ', false], ['GRML', false]]);
  assert.deepEqual(hb('halal AAA, BBB no'), [['AAA', true], ['BBB', true]]);
});
