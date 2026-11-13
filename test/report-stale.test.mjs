// The owner's manual  report  reply (tgCommands) after a nightly whose owner state went stale (Codex 6852412505): the private report was
// built from the holdings the pass started with, so it must reach the owner labelled NOT CURRENT / HISTORICAL, never as fresh guidance.
// Real tgCommands through a loopback fake Telegram; synthetic files only; no network.
import test from 'node:test'; import assert from 'node:assert/strict'; import http from 'node:http';
import { loadScan, blocked } from './load-scan.mjs';
let queue = [], sent = [], uid = 900;
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  let out = { ok: true, result: true };
  if (/\/getUpdates/.test(req.url)) { out = { ok: true, result: queue.map(t => ({ update_id: ++uid, message: { message_id: uid, chat: { id: 42 }, text: t } })) }; queue = []; }
  else if (/\/sendMessage/.test(req.url)) { let j = {}; try { j = JSON.parse(body); } catch (e) {} out = { ok: true, result: { message_id: ++uid } }; sent.push(j.text); }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port, env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE, SEC_BASE: BASE };
const ask = async (S, t) => { queue = [t]; sent = []; await S.fn('tgCommands')(null); return sent.find(m => /YOUR STOCKS: ZZA/.test(m)) || '';   // the report reply itself (a first-contact menu may precede it)
};
const REPORT = 'NIGHTLY REPORT\nYOUR STOCKS: ZZA hold, stop 9 (synthetic)';
const SIGP = { session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000-05:00', stocks: [] };
const PV = { v: 1, session: '2026-11-12', generatedAt: '2026-11-12T21:40:00.000-05:00', posVerdict: { ZZA: 'SELL: synthetic' } };
test('report reply: a run labelled ownerStale reaches the owner as NOT CURRENT / HISTORICAL, never as fresh guidance', async () => {
  const S = await loadScan({ env, files: { 'data/scan-report.txt': REPORT, 'data/signals-private.json': { ...PV, ownerStale: true } } });
  const r = await ask(S, 'report'); assert.match(r, /^NOT CURRENT:/); assert.match(r, /HISTORICAL only: nothing in it is a new sale or entry/); assert.match(r, /YOUR STOCKS: ZZA hold/);
});
test('control: a current run\'s report is sent as it is', async () => {
  const S = await loadScan({ env, files: { 'data/scan-report.txt': REPORT, 'data/signals-private.json': PV, 'data/signals.json': SIGP } });
  const r = await ask(S, 'report'); assert.doesNotMatch(r, /NOT CURRENT|NOT CONFIRMED/); assert.match(r, /^NIGHTLY REPORT/);
});
for (const [name, files] of [['private record missing', { 'data/signals.json': SIGP }], ['private record unreadable', { 'data/signals.json': SIGP, 'data/signals-private.json': '{not json' }],
  ['private record from another run', { 'data/signals.json': SIGP, 'data/signals-private.json': { ...PV, generatedAt: '2026-11-11T21:40:00.000-05:00' } }]])
  test('report reply: ' + name + ' -> NOT CONFIRMED / HISTORICAL, original report text kept readable (Codex 6852490901)', async () => {
    const S = await loadScan({ env, files: { 'data/scan-report.txt': REPORT, ...files } });
    const r = await ask(S, 'report'); assert.match(r, /^NOT CONFIRMED:/); assert.match(r, /HISTORICAL only: nothing in it is a new sale or entry/); assert.match(r, /YOUR STOCKS: ZZA hold/);
    assert.equal(S.read('data/scan-report.txt'), REPORT, 'retained report bytes unchanged');
  });
test('the send-time gate labels both the private verdict record and the report file, once', async () => {
  const S = await loadScan({ env, files: { 'data/scan-report.txt': REPORT, 'data/signals-private.json': PV } });
  S.fn('markVerdictStale')(); S.fn('markVerdictStale')();
  assert.equal(S.readJson('data/signals-private.json').ownerStale, true);
  const t = S.read('data/scan-report.txt'); assert.match(t, /^NOT CURRENT:/); assert.equal((t.match(/NOT CURRENT:/g) || []).length, 1, 'labelled once');
  assert.deepEqual(blocked, []); server.close();
});
