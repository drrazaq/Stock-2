// Seam: tgCommands() in scan.mjs, owner trade-recording replies (independent review handoff, 30 Oct 2026). Synthetic tickers ZZA/ZZB/ZZC
// and synthetic prices only; no owner data. Each test fails on the code before this change (proved by running it with SCAN_SRC set to
// the previous scan.mjs) and passes after it:
//   1. "sold SYM PRICE N shares" with no stored share count used to fall through to the full-sale handler and delete the position (and
//      its stop / sell alerts). Now it asks and records nothing.
//   2. "sold half SYM" on a 1-share position booked -2 fees and logged a half-sale row while removing 0 shares. Now nothing is recorded.
//   3. "add more SYM PRICE N shares" was caught by the check command ("check MORE"). Now it updates the average like "added".
//   4. "at the stop ... would lose about -X USD" when the stop is above the buy price. Now a kept gain; the round-trip fee is included.
// Control: a part sale with a known share count is unchanged.
// Run: node --test test/accounting-fixes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { loadScan } from './load-scan.mjs';

let queue = [], sent = [], uid = 700;
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  let out = { ok: true, result: true };
  if (/\/getUpdates/.test(req.url)) { out = { ok: true, result: queue.map(t => ({ update_id: ++uid, message: { message_id: uid, chat: { id: 42 }, text: t } })) }; queue = []; }
  else if (/\/sendMessage/.test(req.url)) { let j = {}; try { j = JSON.parse(body); } catch (e) {} out = { ok: true, result: { message_id: ++uid } }; sent.push(j.text); }
  else if (/\/price\?symbol=/.test(req.url)) out = { price: '101.50' };
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port, env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE, SEC_BASE: BASE, PRIVATE_KEY: 'synthetic-test-key' };
const send = async (S, ...items) => { queue = items; sent = []; await S.fn('tgCommands')(null); return sent.join('\n'); };
const ok = { s: 'ok', d: new Date().toISOString().slice(0, 10), by: 'ZAD (you)' };
const load = (files = {}) => loadScan({ env, files: { 'data/my-positions.json': {}, 'data/halal.json': { ZZA: ok, ZZB: ok, ZZC: ok }, ...files } });
const trades = (S) => fs.existsSync(S.dir + '/data/my-trades.jsonl') ? S.read('data/my-trades.jsonl') : '';

test('1. a part sale with no stored share count asks; the position and its alerts stay, nothing is recorded', async () => {
  const S = await load({ 'data/my-positions.json': { ZZA: { entry: 50, stop: 45, since: '2026-10-01' } } });
  const r = await send(S, 'sold ZZA 55 5 shares');
  assert.match(r, /I do not know how many ZZA shares you held, so I did not record this sale.*If you sold ALL of them, send:  sold ZZA 55/s);
  assert.ok(S.readJson('data/my-positions.json').ZZA, 'still tracked'); assert.doesNotMatch(trades(S), /"ZZA"/);
});
test('control: a part sale with a known share count works as before', async () => {
  const S = await load(); await send(S, 'bought ZZB 100 10');
  const r = await send(S, 'sold ZZB 110 4 shares');
  assert.match(r, /Sold 4 of your 10 ZZB/); assert.equal(S.fn('privRead')().shares.ZZB, 6); assert.ok(S.readJson('data/my-positions.json').ZZB);
});
test('2. "sold half" of a 1-share position records nothing and says why', async () => {
  const S = await load(); await send(S, 'bought ZZC 100 1');
  const r = await send(S, 'sold half ZZC 110');
  assert.match(r, /You hold 1 ZZC share: it cannot be sold in half, so nothing was recorded/);
  assert.doesNotMatch(trades(S), /"half":true/); assert.equal(S.fn('privRead')().shares.ZZC, 1);
});
test('3. "add more SYM PRICE N shares" updates the average (it used to run "check MORE")', async () => {
  const S = await load(); await send(S, 'bought ZZB 100 10');
  const r = await send(S, 'add more ZZB 110 10 shares');
  assert.match(r, /Added 10 ZZB at 110\.00\. You now hold 20 shares at an average of 105\.00/); assert.equal(+S.readJson('data/my-positions.json').ZZB.entry, 105);
});
test('4. at the stop: a loss under the buy price, a kept gain above it, fees included, never a negative loss', async () => {
  const S = await load(), t = S.fn('atStopText');
  assert.equal(t(10, 100, 90, 'this position'), 'at the stop this position would lose about 106.00 USD (after fees; a gap can make it worse)');
  assert.equal(t(10, 100, 103, 'this position'), 'at the stop this position would still keep about +24.00 USD (after fees; a gap can make it worse)');
  assert.doesNotMatch(t(10, 100, 103, 'x'), /lose about -/);
});
test.after(() => server.close());
