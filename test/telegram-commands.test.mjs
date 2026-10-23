// Seam: the Telegram command  decision TEXT , through tgCommands() in scan.mjs, with Telegram (the system boundary) replaced by a
// local stub server. The owner's written 90-day decision (22 Oct) is write-once: a second  decision ...  before the due date must
// not overwrite the first; that is the point of writing it before the result is known.
// Also the end-to-end path of audit C1: "bought option ..." / "sold option ..." must reach the options-trial handler. Fixing tradeWords
// alone was not enough: the stock "bought SYM" / "sold SYM" handlers read "option" as a ticker (found by this test on 22 Oct).
// Run: node test/telegram-commands.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';

// Telegram stub: hands out the queued messages once, records every reply
let queue = [], sent = [], uid = 100;
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  let out = { ok: true, result: true };
  if (/\/getUpdates/.test(req.url)) { out = { ok: true, result: queue.map(text => ({ update_id: ++uid, message: { message_id: uid, chat: { id: 42 }, text } })) }; queue = []; }
  else if (/\/sendMessage/.test(req.url)) { try { sent.push(JSON.parse(body).text); } catch (e) {} }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE };
const send = async (S, text) => { queue = [text]; sent = []; await S.fn('tgCommands')(null); return sent.join('\n'); };

const FIRST = 'If by this date neither my real trades nor the system paper trades beat the S&P 500 over the 90 days, I stop trading.';
const SECOND = 'Changed my mind after a good week: keep trading whatever happens and double the size.';
const isoIn = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

test('the first decision is saved with a due date 90 days later', async () => {
  const S = await loadScan({ env });
  await send(S, 'decision ' + FIRST);
  const d = S.readJson('data/settings.json').decision;
  assert.equal(d.text, FIRST);
  assert.equal(d.due, isoIn(90));
});

test('a second decision before the due date does not overwrite the first', async () => {
  const S = await loadScan({ env, files: { 'data/settings.json': { decision: { text: FIRST, set: isoIn(-10), due: isoIn(80) } } } });
  const reply = await send(S, 'decision ' + SECOND);
  assert.equal(S.readJson('data/settings.json').decision.text, FIRST);
  assert.match(reply, /You already wrote your decision/);
});

test('control: once the due date has passed, a new decision can be written', async () => {
  const S = await loadScan({ env, files: { 'data/settings.json': { decision: { text: FIRST, set: isoIn(-100), due: isoIn(-10) } } } });
  await send(S, 'decision ' + SECOND);
  assert.equal(S.readJson('data/settings.json').decision.text, SECOND);
});

test('"bought option ..." is recorded in the options trial, never as a stock position', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const S = await loadScan({ env, files: { 'data/halal.json': { HQY: { s: 'ok', d: today, by: 'ZAD (you)' } }, 'data/options-shadow.json': { open: [], real: [] }, 'data/my-positions.json': {} } });
  await send(S, 'bought option HQY 95 2026-11-21 2.40');
  assert.equal(S.readJson('data/my-positions.json').HQY, undefined);
  const real = S.readJson('data/options-shadow.json').real;
  assert.equal(real.length, 1);
  assert.equal(real[0].sym, 'HQY');
});

test('"sold option ..." closes the trial contract and scores it in USD after the ZAD fees', async () => {
  const S = await loadScan({ env, files: { 'data/options-shadow.json': { open: [], real: [{ d: '2026-10-22', sym: 'HQY', strike: 95, exp: '2026-11-21', paid: 2.40, cost: 245 }] }, 'data/my-positions.json': {} } });
  await send(S, 'sold option HQY 95 2026-11-21 3.10');
  const o = S.readJson('data/options-shadow.json').real[0];
  assert.equal(o.closed, true);
  // (3.10 - 2.40) x 100 shares - 5 USD fee each way = +60 USD
  assert.equal(o.pnl, 60);
  assert.equal(S.readJson('data/my-positions.json').HQY, undefined);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
test.after(() => server.close());

// 23 Oct: 15 ZAD marks sent in one message got no action from the bot. End to end: every mark is saved and the reply lists them.
test('many halal marks in one message are all saved', async () => {
  const S = await loadScan({ env });
  const reply = await send(S, '• halal QLYS yes  halal TPC yes  halal EBAY yes. halal PCTY no  halal NEM yes   halal QTWO yes   halal MITK yes • halal IBEX yes halal USPH yes halal ADUS yes halal LAUR yes halal RELY yes halal CART yes halal MPC no • halal DINO yes.     No action from the bot');
  const h = S.readJson('data/halal.json');
  assert.equal(h.QLYS.s, 'ok'); assert.equal(h.DINO.s, 'ok'); assert.equal(h.PCTY.s, 'fail'); assert.equal(h.MPC.s, 'fail');
  assert.match(reply, /Recorded 15 ZAD marks/);
  assert.match(reply, /NOT HALAL: PCTY, MPC/);
});
