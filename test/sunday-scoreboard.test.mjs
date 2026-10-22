// Seams: sundayScoreboard(now) (run by the bot's full check every 5 minutes, intraday(true)), saveSpyCloses(candles) (run by the nightly
// scan with the SPY candles it already loaded) and scoreboardText().
// Guards review S-2 and S-3 (22 Oct): the SCOREBOARD with the owner's written 90-day decision was attached only to an ACTIONS message
// built on a UTC Sunday, and nothing builds one on Sundays, so the decision never reached the owner. And data/spy-closes.json was
// never written, so the scoreboard had no S&P 500 number ("n/a") and the 90-day comparison the decision depends on could not be made.
// Now the bot sends the scoreboard once every Sunday (Kuwait time, from 08:00), and the nightly writes the SPY closes.
// Run: node test/sunday-scoreboard.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';

let sent = [];
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  if (/\/sendMessage/.test(req.url)) { try { sent.push(JSON.parse(body).text); } catch (e) {} }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, result: true })); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE };
test.after(() => server.close());

const SUN_10_KW = Date.parse('2026-10-25T07:00:00Z');   // Sunday 25 Oct, 10:00 Kuwait (UTC+3)
const SUN_07_KW = Date.parse('2026-10-25T04:00:00Z');   // Sunday 25 Oct, 07:00 Kuwait
const SAT_10_KW = Date.parse('2026-10-24T07:00:00Z');   // Saturday 24 Oct, 10:00 Kuwait
const DECISION = { text: 'If neither my trades nor the system beat the S&P 500 over 90 days, I stop trading.', set: '2026-10-22', due: '2027-01-20' };
const files = () => ({ 'data/settings.json': { decision: DECISION }, 'data/tg-state.json': { offset: 7 } });

test('on a Sunday morning (Kuwait) the bot sends the scoreboard with the owner\'s decision, once', async () => {
  const S = await loadScan({ env, files: files() });
  sent = [];
  await S.fn('sundayScoreboard')(SUN_10_KW);
  assert.equal(sent.length, 1);
  assert.match(sent[0], /^SCOREBOARD/);
  assert.match(sent[0], /YOUR DECISION \(written 2026-10-22, due 2027-01-20/);
  assert.equal(S.readJson('data/tg-state.json').scoreboardSent, '2026-10-25');
  assert.equal(S.readJson('data/tg-state.json').offset, 7);   // the rest of the bot state is kept
  await S.fn('sundayScoreboard')(SUN_10_KW + 3600e3);
  assert.equal(sent.length, 1);
});

test('not on a Saturday, and not before 08:00 Kuwait on Sunday', async () => {
  const S = await loadScan({ env, files: files() });
  sent = [];
  await S.fn('sundayScoreboard')(SAT_10_KW);
  await S.fn('sundayScoreboard')(SUN_07_KW);
  assert.equal(sent.length, 0);
});

test('the nightly SPY closes give the scoreboard its S&P 500 numbers (week and 90 days)', async () => {
  const S = await loadScan({ files: { 'data/settings.json': {} } });
  // 100 sessions at 100, the last at 110: +10.0% over the last 5 sessions and over the last 63
  const candles = Array.from({ length: 100 }, (_, i) => ({ d: 'd' + i, c: i === 99 ? 110 : 100 }));
  S.fn('saveSpyCloses')(candles);
  assert.equal(S.readJson('data/spy-closes.json').length, 100);
  const t = S.fn('scoreboardText')();
  assert.match(t, /S&P 500 this week: \+10\.0%/);
  assert.match(t, /S&P 500 \+10\.0% over the same period/);
});

test('control: without the SPY closes the scoreboard says n/a', async () => {
  const S = await loadScan({ files: { 'data/settings.json': {} } });
  assert.match(S.fn('scoreboardText')(), /S&P 500 this week: n\/a/);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
