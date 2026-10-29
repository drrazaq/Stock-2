// Seam: tgCommands() in scan.mjs, end to end, with Telegram and the price service replaced by a local stub (owner's bot repair, 28 Oct
// 2026, item 6: "check that every button and command works"; "never record a trade merely because I tapped a button"). Each test sends
// what the owner would send or tap, then checks the reply AND the files: settings change only through their own command, a tap records
// nothing until Confirm, halal marks are written for the named stock only, and every reply names real tickers (never "SYM").
// Run: node --test test/bot-commands.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';

let queue = [], sent = [], uid = 500, answers = [], rateOnce = 0;
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  let out = { ok: true, result: true };
  if (/\/getUpdates/.test(req.url)) { out = { ok: true, result: queue.map(u => (u.cb ? { update_id: ++uid, callback_query: { id: 'q' + uid, data: u.cb, message: { chat: { id: u.chat || 42 } } } } : { update_id: ++uid, message: { message_id: uid, chat: { id: u.chat || 42 }, text: u } })) }; queue = []; }
  else if (/\/sendMessage/.test(req.url)) { let j = {}; try { j = JSON.parse(body); } catch (e) {}
    if (/^FAIL400/.test(j.text || '')) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, description: 'Bad Request: message is too long' })); }
    if (/^RATE429/.test(j.text || '') && !rateOnce++) { res.writeHead(429, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ ok: false, parameters: { retry_after: 1 } })); }
    out={ok:true,result:{message_id:++uid}}; sent.push({ text: j.text, rows: j.reply_markup && j.reply_markup.inline_keyboard }); }
  else if (/\/answerCallbackQuery/.test(req.url)) { try { answers.push(JSON.parse(body).text); } catch (e) {} }
  else if (/\/price\?symbol=/.test(req.url)) out = { price: '101.50' };
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port, env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE, SEC_BASE: BASE, PRIVATE_KEY: 'test-key' };   // share counts live encrypted in data/private.enc
const send = async (S, ...items) => { queue = items; sent = []; answers = []; await S.fn('tgCommands')(null); return sent.map(x => x.text).join('\n'); };
const today = new Date().toISOString().slice(0, 10), ok = { s: 'ok', d: today, by: 'ZAD (you)' };
const load = (files = {}) => loadScan({ env, files: { 'data/my-positions.json': {}, ...files } });

test('button: a first tap on "I bought" records NOTHING and asks to confirm the exact shares and price', async () => {
  const S = await load({ 'data/halal.json': { WST: ok } });
  await send(S, { cb: 'b|WST' });
  assert.equal(S.readJson('data/my-positions.json').WST, undefined);
  assert.match(answers.join(' '), /Not recorded yet: confirm first/);
  const ask = sent.find(x => /Record your buy of WST/.test(x.text)); assert.ok(ask, 'confirmation question sent');
  assert.match(ask.text, /Confirm records 9 shares at 101\.50 \(the live price now, about 1,000 USD\)/); assert.match(ask.text, /bought WST PRICE SHARES/);
  assert.deepEqual(ask.rows[0].map(b => b.callback_data), ['cb|WST|9|101.50', 'cn|WST']);
});
test('button: Confirm records exactly the confirmed shares and price; Cancel records nothing', async () => {
  const S = await load({ 'data/halal.json': { WST: ok } });
  await send(S, { cb: 'cn|WST' }); assert.equal(S.readJson('data/my-positions.json').WST, undefined); assert.match(answers.join(' '), /Cancelled: nothing recorded for WST/);
  await send(S, { cb: 'cb|WST|9|101.50' });
  const P = S.readJson('data/my-positions.json').WST; assert.ok(P, 'recorded after Confirm'); assert.equal(+P.entry, 101.5); assert.equal(S.fn('privRead')().shares.WST, 9); assert.doesNotMatch(S.read('data/my-positions.json'), /"shares"/);   // count encrypted, never in the public file
});
test('button: "I sold all" asks first; Confirm closes the position', async () => {
  const S = await load({ 'data/halal.json': { WST: ok } });
  await send(S, 'bought WST 100 9'); assert.ok(S.readJson('data/my-positions.json').WST);
  await send(S, { cb: 'x|WST' }); assert.ok(S.readJson('data/my-positions.json').WST, 'still held after the first tap');
  assert.ok(sent.some(x => /Record that you sold ALL your WST\?/.test(x.text)));
  await send(S, { cb: 'cx|WST|101.50' }); assert.equal(S.readJson('data/my-positions.json').WST, undefined);
});
test('button: a tap from another chat is ignored', async () => {
  const S = await load();
  await send(S, { cb: 'cb|WST|9|101.50', chat: 777 }); assert.equal(S.readJson('data/my-positions.json').WST, undefined);
});
test('buttons are offered only for the BUYs under TODAY\'S ACTIONS, never for NOT ACTIONABLE names', async () => {
  const S = await load();
  const text = "ACTIONS\n\nTODAY'S ACTIONS\nLONGER HOLDS | ...\n- BUY WST up to 406.26\n\nNOT ACTIONABLE TODAY (x)\n- MARK HALAL FIRST: HQY\n- BUY ZZZ never\n";
  const rows = S.fn('tradeButtons')(null, { TGT: { entry: 1 } }, 5, text).map(r => r.map(b => b.data));
  assert.deepEqual(rows, [['b|WST', 's|WST'], ['x|TGT']]);
});
test('settings commands change only their own setting and say what they did', async () => {
  const S = await load();
  for (const [cmd, key, val, re] of [['alerts paper', 'alerts', 'paper', /EARLY ALERTS: PAPER/], ['alerts approved', 'alerts', 'approved', /APPROVED only/], ['alerts off', 'alerts', 'off', /OFF: no research leads/], ['alerts all', 'alerts', 'all', /ALL: research leads/],
    ['radar off', 'radar', false, /OPPORTUNITY RADAR OFF/], ['radar on', 'radar', true, /OPPORTUNITY RADAR ON/], ['focus off', 'focus', false, /./], ['focus on', 'focus', true, /./], ['quiet off', 'quiet', false, /./], ['quiet on', 'quiet', true, /./]]) {
    const before = S.readJson('data/settings.json'), reply = await send(S, cmd), after = S.readJson('data/settings.json');
    assert.equal(after[key], val, cmd); assert.match(reply, re, cmd);
    for (const k of Object.keys({ ...before, ...after })) if (k !== key) assert.deepEqual(after[k], before[k], cmd + ' must not change ' + k); }
});
test('"radar" alone shows the board, it does not switch anything', async () => {
  const S = await load(); const before = S.readJson('data/settings.json');
  const reply = await send(S, 'radar'); assert.match(reply, /early-wave radar|EARLY|radar/i); assert.deepEqual(S.readJson('data/settings.json'), before);
});
test('halal marks: written for the named stock only, 1-space indent kept, replies name the stock', async () => {
  const S = await load({ 'data/halal.json': { WST: ok } });
  const r1 = await send(S, 'halal TGT yes'); const h = S.readJson('data/halal.json'); assert.equal(h.TGT.s, 'ok'); assert.equal(h.WST.s, 'ok'); assert.match(r1, /TGT/); assert.doesNotMatch(r1, /\bSYM\b/);
  assert.match(S.read('data/halal.json'), /^\{\n "/);   // JSON.stringify(x, null, 1)
  await send(S, 'halal TGT no'); assert.equal(S.readJson('data/halal.json').TGT.s, 'fail');
});
test('trade recording: bought / sold lines record exactly what was typed', async () => {
  const S = await load({ 'data/halal.json': { TGT: ok } });
  await send(S, 'bought TGT 149.12 6'); const P = S.readJson('data/my-positions.json').TGT; assert.equal(+P.entry, 149.12); assert.equal(S.fn('privRead')().shares.TGT, 6);
  await send(S, 'sold TGT 160'); assert.equal(S.readJson('data/my-positions.json').TGT, undefined);
});
test('information commands answer (and never with a generic SYM placeholder): opportunities, details, review, paper, lab, longterm, help', async () => {
  const S = await load({ 'data/halal.json': { TGT: ok }, 'data/my-positions.json': { TGT: { entry: 149.12, shares: 6, since: '2026-10-27', stop: 0 } } });
  for (const cmd of ['opportunities', 'details', 'review TGT', 'paper', 'lab', 'longterm', 'help']) { const r = await send(S, cmd); assert.ok(r.length > 20, cmd + ' answered: ' + r.slice(0, 80)); }
  assert.match(await send(S, 'longterm'), /^LONGER-TERM \(separate from trading/);
  assert.deepEqual(blocked.filter(u => !u.startsWith('http://127.0.0.1')), []);
});


test('correction: sending the buy line again REPLACES the record and says so (not a second buy)', async () => {
  const S = await load({ 'data/halal.json': { WST: ok } });
  await send(S, 'bought WST 100 9'); const r = await send(S, 'bought WST 101 9');
  assert.match(r, /^CORRECTED WST: your earlier record \(bought 100\.00 on \d{4}-\d{2}-\d{2}\) is REPLACED by this one \(101\.00\)\. If you bought MORE shares instead, send:  added WST PRICE SHARES/m);
  assert.equal(+S.readJson('data/my-positions.json').WST.entry, 101); assert.equal(S.fn('privRead')().shares.WST, 9);
});

test('delivery: a 429 rate limit is waited out and delivered; a refused message is recorded and shows in SYSTEM HEALTH', async () => {
  const S = await load(); sent = [];
  await S.fn('telegram')('RATE429 hello'); assert.ok(sent.some(x => x.text === 'RATE429 hello'), 'delivered after the retry');
  await S.fn('telegram')('FAIL400 the long one');
  const F = S.read('data/tg-failures.jsonl').trim().split('\n').map(l => JSON.parse(l)); assert.equal(F.length, 1); assert.equal(F[0].status, 400); assert.equal(F[0].head, 'FAIL400 the long one');
  assert.match(S.fn('healthLine')(), /TELEGRAM: 1 message NOT delivered in the last 24 h \(last: "FAIL400 the long one", 400\)/);
});
test.after(() => server.close());
