// P0 Route A (development): after the private-data cutover, a reply to a command that changed an owner file says it is recorded on this
// run and that private storage is confirmed separately (one SAVE FAILED warning on failure, no repeat requested). Before the cutover,
// replies are unchanged. Actual tgCommands caller with a loopback Telegram stub; synthetic data only.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import http from 'node:http'; import { loadScan } from './load-scan.mjs';
let queue = [], sent = []; const server = http.createServer((req, res) => { let body = ''; req.on('data', x => body += x); req.on('end', () => { let out = { ok: true, result: true }; if (req.url.includes('/getUpdates')) { out = { ok: true, result: queue }; queue = []; } else if (req.url.includes('/sendMessage')) { sent.push(JSON.parse(body).text); out = { ok: true, result: { message_id: 1 } }; } else if (req.url.includes('/price?')) out = { price: '101.5' }; res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
test.after(() => server.close());
const load = (privateMode) => loadScan({ env: { TG_BASE: base, TD_BASE: base, FH_BASE: base, SEC_BASE: base, TG_TOKEN: 'fixture', TG_CHAT: '42', PRIVATE_KEY: 'synthetic' }, files: { 'data/my-positions.json': {}, 'data/halal.json': { ZZA: { s: 'ok', d: new Date().toISOString().slice(0, 10), by: 'ZAD (you)' } }, '.github/private-files.txt': 'my-positions.json\nmy-trades.jsonl\nhalal.json\n', ...(privateMode ? { '.github/private-data-mode': 'on\n' } : {}) } });
const send = async (S, text, id = 200) => { sent = []; queue = [{ update_id: id, message: { message_id: id, chat: { id: 42 }, text } }]; await S.fn('tgCommands')(null); return sent.join('\n'); };
test('private mode: an owner-file change reply carries the pending-private-storage note; a read-only command does not', async () => {
  const S = await load(true);
  assert.match(await send(S, 'bought ZZA 100 10', 300), /Recorded on this run\. Private storage is confirmed separately: if it fails you get one SAVE FAILED message\. Do not repeat the command\./);
  assert.doesNotMatch(await send(S, 'help', 301), /Private storage is confirmed separately/);
});
test('before the cutover the reply is unchanged (no note)', async () => {
  const S = await load(false);
  assert.doesNotMatch(await send(S, 'bought ZZA 100 10', 400), /Private storage is confirmed separately/);
});
test('bot.yml: a failed save sends ONE owner warning per failure streak, only in private mode, without asking to repeat', () => {
  const b = fs.readFileSync(new URL('../.github/workflows/bot.yml', import.meta.url), 'utf8');
  assert.match(b, /if \[ -z "\$\{SAVE_WARNED:-\}" \] && \[ -e \.github\/private-data-mode \]; then SAVE_WARNED=1/);
  assert.match(b, /SAVE FAILED: your last recorded update is kept on the running bot but is NOT yet stored privately\. It will be retried automatically; do not repeat the command\./);
  assert.match(b, /then SAVE_WARNED=; return 0; fi/);
});
