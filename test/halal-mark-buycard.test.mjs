// F2 (13 Nov 2026): a ZAD 'yes' mark recorded while a LEADER DIP signal is still inside its next-open window returns the same gated
// BUY card ACTIONS would show, as a SEPARATE message re-checked before every Telegram attempt; a card that would arrive after the open
// is never delivered (the ZAD mark is kept). Clock frozen: the 2026-11-12 close, next open 2026-11-13 14:30Z. No skips.
// Run: node --test test/halal-mark-buycard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan } from './load-scan.mjs';

const realNow = Date.now, LAST = '2026-11-12', GEN = '2026-11-12T23:00:00Z', PRE = Date.parse('2026-11-13T12:00:00Z'), OPEN = Date.parse('2026-11-13T14:30:00Z');
let clock = PRE, queue = [], sent = [], uid = 900, rate = null;
Date.now = () => clock;
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  let out = { ok: true, result: true };
  if (/\/getUpdates/.test(req.url)) { out = { ok: true, result: queue.map(t => ({ update_id: ++uid, message: { message_id: uid, chat: { id: 42 }, date: Math.floor(clock / 1000), text: t } })) }; queue = []; }
  else if (/\/sendMessage/.test(req.url)) { let j = {}; try { j = JSON.parse(body); } catch (e) {}
    if (rate && /^NOW A PERMITTED BUY/.test(j.text || '')) { clock = rate; rate = null; res.writeHead(429, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, parameters: { retry_after: 1 } })); }
    sent.push(j.text); out = { ok: true, result: { message_id: ++uid } }; }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
test.after(() => { server.close(); Date.now = realNow; });
const BASE = 'http://127.0.0.1:' + server.address().port, env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE, SEC_BASE: BASE, PRIVATE_KEY: 'test-key' };
const send = async (S, ...t) => { queue = t; sent = []; await S.fn('tgCommands')({ session: LAST }); return sent.filter(x => !/^MENU: /.test(x)); };   // the one-time menu keyboard is not part of this reply
const ok = { s: 'ok', d: '2026-10-27', by: 'you' };
const files = (syms, lastClose = LAST, hal = {}, pos = {}) => ({ 'data/my-positions.json': pos, 'data/halal.json': hal,
  'data/squad11-today.json': { generatedAt: GEN, lastClose, methods: { 'SQ11-PB12': { hold: 126, newSignals: syms.map(sym => ({ sym, close: 100, halal: 'unknown', d: lastClose })) } } } });
const offers = (S) => { try { return S.read('data/leaderdip-ledger.jsonl').trim().split('\n').filter(Boolean).map(x => JSON.parse(x)); } catch (e) { return []; } };
const load = async (f, at = PRE) => { clock = at; return loadScan({ env, files: f }); };

test('before the open: the receipt, then a separate gated BUY card with entry day, expiry and price basis; only that offer logged', async () => {
  const S = await load(files(['AAA', 'NEW'], LAST, { AAA: ok }));
  assert.equal(S.fn('ldipEntryWindow')(LAST, GEN, LAST).state, 'IN_WINDOW');
  const m = await send(S, 'halal NEW yes');
  assert.equal(m.length, 2); assert.match(m[0], /NEW: marked HALAL/); assert.doesNotMatch(m[0], /PERMITTED BUY/);
  assert.match(m[1], /^NOW A PERMITTED BUY \(LEADER DIP/); assert.match(m[1], /Entry only at the 2026-11-13 open/); assert.match(m[1], /expires then, no late entry/);
  assert.match(m[1], /- BUY NEW 1,000 USD at the open \(up to 103\.00\)/); assert.match(m[1], /SELL LIMIT at your buy price \+20%/); assert.match(m[1], /No stop/);
  assert.match(m[1], /Price basis: the 2026-11-12 close\. Live quote and spread: UNKNOWN/); assert.doesNotMatch(m.join('\n'), /BUY AAA|\blive price\b/);
  assert.deepEqual(offers(S).map(x => x.sym), ['NEW']); assert.equal(S.readJson('data/halal.json').NEW.s, 'ok');
});
test('window boundary: a mark at exactly the open still gets the card; one second later only the receipt', async () => {
  { const S = await load(files(['NEW']), OPEN); const m = await send(S, 'halal NEW yes'); assert.equal(m.length, 2); assert.match(m[1], /- BUY NEW/); }
  { const S = await load(files(['NEW']), OPEN + 1000); const m = await send(S, 'halal NEW yes'); assert.equal(m.length, 1); assert.match(m[0], /marked HALAL/); assert.deepEqual(offers(S), []); assert.equal(S.readJson('data/halal.json').NEW.s, 'ok'); }
});
test('a card delayed past the open by a 429 retry is NOT delivered; the ZAD receipt and mark stay', async () => {
  const S = await load(files(['NEW']), OPEN - 2000); rate = OPEN + 60000;
  const m = await send(S, 'halal NEW yes');
  assert.equal(rate, null, 'the 429 was served'); assert.equal(m.length, 1); assert.match(m[0], /NEW: marked HALAL/); assert.doesNotMatch(m.join('\n'), /PERMITTED BUY|- BUY/);
  assert.equal(S.readJson('data/halal.json').NEW.s, 'ok'); assert.deepEqual(offers(S), [], 'an undelivered card logs no offer');
});
test('one batch of updates: "yes" then "no" for the same stock sends no card and logs no offer; the final mark is fail', async () => {
  const S = await load(files(['NEW'])); const m = await send(S, 'halal NEW yes', 'halal NEW no');
  assert.doesNotMatch(m.join('\n'), /PERMITTED BUY|- BUY NEW/); assert.equal(S.readJson('data/halal.json').NEW.s, 'fail'); assert.deepEqual(offers(S), []);
});
test('one batch of updates: a "bought" that fills the last slot after the mark stops the card', async () => {
  const two = { X1: { entry: 1, src: 'leader dip' }, X2: { entry: 1, src: 'leader dip' } };
  const S = await load({ ...files(['NEW', 'ZZB'], LAST, { ZZB: ok }, two) });
  const m = await send(S, 'halal NEW yes', 'bought ZZB 100 5');
  assert.ok(S.readJson('data/my-positions.json').ZZB, 'the buy was recorded'); assert.doesNotMatch(m.join('\n'), /PERMITTED BUY/); assert.deepEqual(offers(S).filter(x => x.sym === 'NEW'), []);
});
test('no card for a "no" mark, a non-pick, a stale source or full slots', async () => {
  { const S = await load(files(['NEW'])); const m = await send(S, 'halal NEW no'); assert.equal(m.length, 1); assert.doesNotMatch(m[0], /PERMITTED BUY|- BUY/); }
  { const S = await load(files(['AAA'])); const m = await send(S, 'halal ZZZ yes'); assert.equal(m.length, 1); }
  { const S = await load(files(['NEW'], '2026-11-10')); const m = await send(S, 'halal NEW yes'); assert.equal(m.length, 1); assert.deepEqual(offers(S), []); }
  { const full = { X1: { entry: 1, src: 'leader dip' }, X2: { entry: 1, src: 'leader dip' }, X3: { entry: 1, src: 'leader dip' } };
    const S = await load(files(['NEW'], LAST, {}, full)); const m = await send(S, 'halal NEW yes'); assert.equal(m.length, 1); assert.doesNotMatch(m.join('\n'), /- BUY NEW/); }
});
test('a batch of marks: the card only for the newly marked in-window halal pick', async () => {
  const S = await load(files(['NEW', 'BAD'])); const m = await send(S, 'halal NEW yes\nhalal BAD no');
  assert.match(m[0], /Recorded 2 ZAD marks/); assert.equal(m.length, 2); assert.match(m[1], /- BUY NEW 1,000 USD/); assert.doesNotMatch(m.join('\n'), /BUY BAD/);
});
