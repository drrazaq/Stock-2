// Seams: the Telegram setting commands (quiet, focus, tier2, fee, runners, decision) through tgCommands(), and the one-time migrations
// that run when scan.mjs loads. Telegram (the system boundary) is a local stub server.
// Guards review S-4 (22 Oct): every settings write was readJson('data/settings.json', {}) -> set one key -> write. If the file ever failed
// to parse, {} was written back and the owner's decision, focus, quiet, tier2 and fee were lost silently; a migration whose done-flag
// could not be read ran again. Now a write is a read-modify-write that ABORTS when the file exists but does not parse.
// Run: node test/settings-writes.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';

let queue = [], sent = [], uid = 500;
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  let out = { ok: true, result: true };
  if (/\/getUpdates/.test(req.url)) { out = { ok: true, result: queue.map(text => ({ update_id: ++uid, message: { message_id: uid, chat: { id: 42 }, text } })) }; queue = []; }
  else if (/\/sendMessage/.test(req.url)) { try { sent.push(JSON.parse(body).text); } catch (e) {} }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port;
const env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE };
test.after(() => server.close());
const send = async (S, text) => { queue = [text]; sent = []; await S.fn('tgCommands')(null); return sent.join('\n'); };

const DECISION = { text: 'If neither my trades nor the system beat the S&P 500 over 90 days, I stop trading.', set: '2026-10-22', due: '2027-01-20' };
// a settings file cut off in the middle (as after a bad merge): it does not parse
const BROKEN = '{"decision":{"text":"' + DECISION.text + '","set":"2026-10-22","due":"2027-01-20"},"focus":true,"tier2":tr';

for (const cmd of ['quiet on', 'focus off', 'tier2 off', 'fee 3', 'runners on', 'decision Keep trading whatever happens, and double the size.']) {
  test('"' + cmd.slice(0, 20) + '" with a settings file that does not parse: the file is left exactly as it is, and the owner is told', async () => {
    const S = await loadScan({ env });
    S.write('data/settings.json', BROKEN);
    const reply = await send(S, cmd);
    assert.equal(S.read('data/settings.json'), BROKEN);
    assert.match(reply, /settings file could not be read/);
  });
}

test('control: a setting command keeps every other key (the decision stays)', async () => {
  const S = await loadScan({ env, files: { 'data/settings.json': { decision: DECISION, focus: true, feeUSD: 3 } } });
  await send(S, 'quiet on');
  const st = S.readJson('data/settings.json');
  assert.equal(st.quiet, true);
  assert.deepEqual(st.decision, DECISION);
  assert.equal(st.focus, true);
  assert.equal(st.feeUSD, 3);
});

test('a one-time migration does not run again when its done-flag cannot be read', async () => {
  // the 18 Oct stop plan would set RKLB's stop to 48.74; the owner has since set his own stop at 60
  const pos = { RKLB: { entry: 75, since: '2026-09-01', stop: 60, own: true } };
  const S = await loadScan({ files: { 'data/settings.json': BROKEN, 'data/my-positions.json': pos } });
  assert.equal(S.readJson('data/my-positions.json').RKLB.stop, 60);
  assert.equal(S.read('data/settings.json'), BROKEN);
});

test('no network was touched', () => assert.deepEqual(blocked, []));
