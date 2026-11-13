// F2 (13 Nov 2026): a ZAD 'yes' mark recorded while a LEADER DIP signal is still inside its next-open window returns the same gated
// BUY card ACTIONS would show; outside the window, for a 'no' mark, with full slots or for a stock that is not a pick: nothing extra.
// Run: node --test test/halal-mark-buycard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan } from './load-scan.mjs';

let queue = [], sent = [], uid = 900;
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  let out = { ok: true, result: true };
  if (/\/getUpdates/.test(req.url)) { out = { ok: true, result: queue.map(t => ({ update_id: ++uid, message: { message_id: uid, chat: { id: 42 }, date: Math.floor(Date.now() / 1000), text: t } })) }; queue = []; }
  else if (/\/sendMessage/.test(req.url)) { let j = {}; try { j = JSON.parse(body); } catch (e) {} sent.push(j.text); out = { ok: true, result: { message_id: ++uid } }; }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port, env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE, SEC_BASE: BASE, PRIVATE_KEY: 'test-key' };
const send = async (S, ...t) => { queue = t; sent = []; await S.fn('tgCommands')(null); return sent.join('\n'); };
const now = new Date().toISOString(), S0 = await loadScan({}), isS = S0.fn('isSession'), nyd = S0.fn('ny')(Date.now()).d;
const sessAgo = (n) => { let x = nyd, k = 0; while (k < n) { x = new Date(Date.parse(x) - 864e5).toISOString().slice(0, 10); if (isS(x)) k++; } return x; };
const ok = { s: 'ok', d: '2026-10-27', by: 'you' };
const files = (syms, lastClose, hal = {}, pos = {}) => ({ 'data/my-positions.json': pos, 'data/halal.json': hal,
  'data/squad11-today.json': { generatedAt: now, lastClose, methods: { 'SQ11-PB12': { hold: 126, newSignals: syms.map(sym => ({ sym, close: 100, halal: 'unknown', d: lastClose })) } } } });
const offers = (S) => { try { return S.read('data/leaderdip-ledger.jsonl').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } };

test('in-window pick: "halal SYM yes" returns the gated BUY card (sell limit, no stop, time exit) and logs only that offer', async (t) => {
  const LAST = sessAgo(1), S = await loadScan({ env, files: files(['AAA', 'NEW'], LAST, { AAA: ok }) });
  if (S.fn('ldipEntryWindow')(LAST, now, LAST).state !== 'IN_WINDOW') return t.skip('the previous close is no longer before its next open at this test time');
  const r = await send(S, 'halal NEW yes');
  assert.match(r, /NEW: marked HALAL/); assert.match(r, /NOW A PERMITTED BUY \(LEADER DIP/); assert.match(r, /- BUY NEW 1,000 USD at the open/);
  assert.match(r, /SELL LIMIT at your buy price \+20%/); assert.match(r, /No stop/); assert.doesNotMatch(r, /BUY AAA/);
  assert.deepEqual(offers(S).map(x => x.sym), ['NEW']);
});
test('no extra card for a "no" mark, a non-pick, an expired window or full slots', async () => {
  const LAST = sessAgo(1);
  { const S = await loadScan({ env, files: files(['NEW'], LAST) }); const r = await send(S, 'halal NEW no'); assert.doesNotMatch(r, /PERMITTED BUY|- BUY/); }
  { const S = await loadScan({ env, files: files(['AAA'], LAST) }); const r = await send(S, 'halal ZZZ yes'); assert.doesNotMatch(r, /PERMITTED BUY|- BUY/); }
  { const S = await loadScan({ env, files: files(['NEW'], sessAgo(3)) }); const r = await send(S, 'halal NEW yes'); assert.doesNotMatch(r, /PERMITTED BUY|- BUY/); assert.deepEqual(offers(S), []); }
  { const full = { X1: { entry: 1, src: 'leader dip' }, X2: { entry: 1, src: 'leader dip' }, X3: { entry: 1, src: 'leader dip' } };
    const S = await loadScan({ env, files: files(['NEW'], LAST, {}, full) }); const r = await send(S, 'halal NEW yes'); assert.doesNotMatch(r, /PERMITTED BUY|- BUY NEW/); }
});
test('a batch of marks returns the card only for the newly marked in-window halal picks', async (t) => {
  const LAST = sessAgo(1), S = await loadScan({ env, files: files(['NEW', 'BAD'], LAST) });
  if (S.fn('ldipEntryWindow')(LAST, now, LAST).state !== 'IN_WINDOW') return t.skip('outside the next-open window at this test time');
  const r = await send(S, 'halal NEW yes\nhalal BAD no');
  assert.match(r, /Recorded 2 ZAD marks/); assert.match(r, /- BUY NEW 1,000 USD/); assert.doesNotMatch(r, /BUY BAD/);
});
test.after(() => server.close());
