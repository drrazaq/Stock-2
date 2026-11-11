// R1 rev17 (Codex 6725877594): a BUY NOW card long enough to need several Telegram parts is checked at EVERY part's own network attempt,
// including a retry of a later part. If the price stops being under 20 minutes old after an earlier part was sent, the rest of the card is
// NOT sent; one WITHDRAWN note (no price claim, no buttons) says so, and the card is unmarked so the next run checks it again.
// Synthetic only: the ACTUAL intraday() caller and telegramLive(), invented records (four synthetic earnings-drift candidates for one
// symbol make the card span two parts), loopback services, no owner records or real messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { loadScan, blocked } from './load-scan.mjs';

const T = Date.parse('2026-11-05T14:40:00Z');
const SESSION_SRC = fs.readFileSync(new URL('../market-session.mjs', import.meta.url), 'utf8');
const rec = (n) => ({ sym: 'ZZE', live: true, buyLo: 100, buyHi: 110, stop: 90, hold: 10, sma20: 90, sur: 0.2, up: 0.1, test: { n, avg: 0.02, win: 0.6 } });
const SIG = { pead: [rec(40), rec(41), rec(42), rec(43)] };
const EXTRA = { 'data/earnings-study.json': { verdict: 'PROMISING' }, 'data/halal.json': { ZZE: { s: 'ok' } } };
// afterFirstBuyPart: ms added to the clock once the first BUY NOW part is accepted; limitSecond: the next part first gets a 429
async function run(t, { ageSec, afterFirstBuyPart = 0, limitSecond = 0 }) {
  const msgs = []; let clock = T, buyParts = 0, limited = false;
  const server = http.createServer((req, res) => { let b = ''; req.on('data', x => b += x); req.on('end', () => { res.setHeader('content-type', 'application/json');
    if (req.url.includes('/getUpdates')) return res.end(JSON.stringify({ ok: true, result: [] }));
    if (req.url.includes('/sendMessage')) { const m = JSON.parse(b);
      const inCard = buyParts > 0 && buyParts < 99, isBuy = /^BUY NOW/.test(m.text) || inCard;
      if (isBuy && buyParts === 1 && limitSecond && !limited) { limited = true; clock += limitSecond; res.statusCode = 429; return res.end(JSON.stringify({ ok: false, parameters: { retry_after: 1 } })); }
      msgs.push({ at: clock, text: m.text, buttons: !!m.reply_markup });
      if (/^BUY NOW: /.test(m.text)) { buyParts = 1; clock += afterFirstBuyPart; } else if (inCard) buyParts = 99;
      return res.end(JSON.stringify({ ok: true, result: { message_id: msgs.length } })); }
    if (req.url.includes('/quote')) return res.end(JSON.stringify({ c: 105, t: (clock - ageSec * 1000) / 1000 }));
    res.statusCode = 404; res.end('{}'); }); });
  await new Promise(r => server.listen(0, '127.0.0.1', r)); t.after(() => new Promise(r => server.close(r)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const files = { 'data/my-positions.json': {}, 'data/signals.json': { session: '2026-11-04', stocks: [], quick: [], leaders: [], ...SIG }, 'data/tg-state.json': { offset: 42 }, 'market-session.mjs': SESSION_SRC, 'data/settings.json': { quiet: false }, ...EXTRA };
  const S = await loadScan({ files, env: { BOT_ONLY: '', MODE: 'intraday', TG_TOKEN: 'x', TG_CHAT: '1', TG_BASE: base, FH_BASE: base, FINNHUB_KEY: 'x', TD_BASE: base } });
  const real = Date.now; Date.now = () => clock;
  try { await S.fn('intraday')(false); } finally { Date.now = real; }
  const i = msgs.findIndex(m => /^BUY NOW: /.test(m.text));
  return { card: i < 0 ? [] : msgs.slice(i), state: JSON.parse(S.read('data/alert-state.json') || '{}') };
}

test('control: a timely two-part card is sent whole, buttons on its last part, and marked', async t => {
  const r = await run(t, { ageSec: 10 });
  assert.equal(r.card.length, 2, 'the fixture really spans two parts');
  assert.equal(r.card[0].buttons, false); assert.equal(r.card[1].buttons, true);
  assert.doesNotMatch(r.card.map(m => m.text).join('\n'), /WITHDRAWN/); assert.equal(r.state.sent.ZZEbuynow, 1);
});
test('part 1 sent at 1190 s, 30 s pass: part 2 is not sent; a WITHDRAWN note without price or buttons follows; card unmarked', async t => {
  const r = await run(t, { ageSec: 1190, afterFirstBuyPart: 30000 });
  assert.equal(r.card.length, 2, JSON.stringify(r.card.map(m => m.text.slice(0, 80))));
  assert.match(r.card[1].text, /^BUY NOW ZZE WITHDRAWN: the price in the card above is no longer current \(the latest price is 20 min old \(limit 20 min\)\), so the rest of the card is not sent\. Do not buy from it/);
  assert.doesNotMatch(r.card[1].text, /105\.00|OK to buy|Amount|BUY 1000/, 'no current-price or entry claim after expiry');
  assert.equal(r.card[1].buttons, false, 'no buy buttons on a withdrawn card'); assert.equal(r.state.sent.ZZEbuynow, undefined);
});
test('a 429 on part 2 with 30 s waited: the retry is checked again and withdraws instead of sending the stale remainder', async t => {
  const r = await run(t, { ageSec: 1190, limitSecond: 30000 });
  assert.equal(r.card.length, 2); assert.match(r.card[1].text, /^BUY NOW ZZE WITHDRAWN:/); assert.equal(r.card[1].buttons, false);
  assert.equal(r.state.sent.ZZEbuynow, undefined);
});
test('all requests stayed synthetic and on loopback', () => assert.deepEqual(blocked, []));
