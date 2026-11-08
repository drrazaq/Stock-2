// R1 readers fail closed (synthetic, offline): an unreadable, keyless or unmigrated sealed T1 file is shown as UNKNOWN with its code,
// is never treated as empty, and is never overwritten. Covers the bot (scan.mjs), health, watcher evidence, and the ledger jobs.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadScan, blocked, TEST_SEALED_SECRET } from './load-scan.mjs';
import { sealedKey, writeSealed, writeSealedJson, appendSealedLines, readSealedText } from '../sealed-store.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OTHER = sealedKey('some-other-secret'), TK = sealedKey(TEST_SEALED_SECRET);
let queue = [], sent = [], uid = 100;
const server = http.createServer((req, res) => { let body = ''; req.on('data', c => body += c); req.on('end', () => {
  let out = { ok: true, result: true };
  if (/\/getUpdates/.test(req.url)) { out = { ok: true, result: queue.map(text => ({ update_id: ++uid, message: { message_id: uid, chat: { id: 42 }, text } })) }; queue = []; }
  else if (/\/sendMessage/.test(req.url)) { try { sent.push(JSON.parse(body).text); } catch (e) {} }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + server.address().port, env = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: BASE, TD_BASE: BASE, FH_BASE: BASE };
const send = async (S, text) => { queue = [text]; sent = []; await S.fn('tgCommands')(null); return sent.join('\n'); };
const today = new Date().toISOString().slice(0, 10), HALAL = { HQY: { s: 'ok', d: today, by: 'ZAD (you)' } };

test('bot: an options record sealed under another key -> "bought option" is NOT RECORDED and the record bytes stay identical', async () => {
  const S = await loadScan({ env, files: { 'data/halal.json': HALAL, 'data/my-positions.json': {} } });
  writeSealedJson(path.join(S.dir, 'data/options-shadow.json'), { open: [], real: [{ sym: 'ZZR', strike: 1, exp: '2026-12-18', paid: 1 }] }, OTHER);
  const before = fs.readFileSync(path.join(S.dir, 'data/options-shadow.json.sealed'));
  const reply = await send(S, 'bought option HQY 95 2026-11-21 2.40');
  assert.match(reply, /OPTIONS TRIAL: NOT RECORDED\. The options record: UNKNOWN \(its sealed provider-data file cannot be read: SEALED_UNREADABLE\)\. Nothing was changed/);
  assert.deepEqual(fs.readFileSync(path.join(S.dir, 'data/options-shadow.json.sealed')), before);
  assert.equal(fs.existsSync(path.join(S.dir, 'data/options-shadow.json')), false, 'no plaintext created');
  assert.deepEqual(S.readJson('data/my-positions.json'), {}, 'never recorded as a stock either');
  assert.match(S.fn('optionsText')(), /^OPTIONS LAB: the options record: UNKNOWN \(its sealed provider-data file cannot be read: SEALED_UNREADABLE\)/);
});

test('bot: without the key the same command is NOT RECORDED (SEALED_KEY_MISSING); with it, recorded and still sealed (control)', async () => {
  const S = await loadScan({ env: { ...env, SEALED_SECRET: '' }, files: { 'data/halal.json': HALAL, 'data/options-shadow.json': { open: [], real: [] }, 'data/my-positions.json': {} } });
  assert.match(await send(S, 'bought option HQY 95 2026-11-21 2.40'), /NOT RECORDED.*SEALED_KEY_MISSING/s);
  const C = await loadScan({ env, files: { 'data/halal.json': HALAL, 'data/options-shadow.json': { open: [], real: [] }, 'data/my-positions.json': {} } });
  assert.match(await send(C, 'bought option HQY 95 2026-11-21 2.40'), /OPTIONS TRIAL: recorded 1 x HQY/);
  assert.equal(C.readJson('data/options-shadow.json').real.length, 1);
  assert.equal(fs.existsSync(path.join(C.dir, 'data/options-shadow.json')), false); assert.ok(fs.existsSync(path.join(C.dir, 'data/options-shadow.json.sealed')));
});

test('nightly options lane: an unreadable options record stops the lane BEFORE any ticket, request or paper change', async () => {
  const S = await loadScan({ env: { ...env, ALPACA_KEY: 'synthetic', ALPACA_SECRET: 'synthetic' }, files: { 'data/signals.json': { stocks: [{ sym: 'HQY', last: 90 }] } } });
  writeSealedJson(path.join(S.dir, 'data/options-shadow.json'), { open: [{ sym: 'ZZR' }], done: [], real: [{ sym: 'ZZR' }] }, OTHER);
  const before = fs.readFileSync(path.join(S.dir, 'data/options-shadow.json.sealed')), nBlocked = blocked.length; sent = [];
  const out = await S.fn('optionsShadow')();
  assert.match(out, /^Options lab: the options record: UNKNOWN \(its sealed provider-data file cannot be read: SEALED_UNREADABLE\)\. The lane did not run/);
  assert.deepEqual(sent, [], 'no ticket sent'); assert.equal(blocked.length, nBlocked, 'no market request attempted');
  assert.deepEqual(fs.readFileSync(path.join(S.dir, 'data/options-shadow.json.sealed')), before);
});

test('bot: an unmigrated plaintext movers file is UNKNOWN (SEALED_LEGACY_PLAINTEXT), not "not produced yet"', async () => {
  const S = await loadScan({ env });
  fs.writeFileSync(path.join(S.dir, 'data/movers-state.json'), JSON.stringify({ study: 'synthetic', sessions: 3 }));
  assert.match(S.fn('moverEvidence')(), /Movers radar study: UNKNOWN \(its sealed provider-data file cannot be read: SEALED_LEGACY_PLAINTEXT\)/);
  assert.equal(blocked.length, 0);
});

function job(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sealed-readers-')); t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith('.mjs'))) fs.copyFileSync(path.join(ROOT, f), path.join(d, f));
  fs.mkdirSync(path.join(d, 'data')); return d;
}
const node = (cwd, file, extra = {}) => spawnSync(process.execPath, [file], { cwd, encoding: 'utf8', env: { PATH: process.env.PATH, SEALED_SECRET: TEST_SEALED_SECRET, ...extra }, timeout: 60000 });

test('health: a tampered watcher live file is a named problem with state UNKNOWN; the watcher evidence line says UNKNOWN', (t) => {
  const d = job(t);
  writeSealedJson(path.join(d, 'data/ignition-live.json'), { day: '2026-01-02' }, TK);
  const f = path.join(d, 'data/ignition-live.json.sealed'), b = fs.readFileSync(f); b[b.length - 1] ^= 1; fs.writeFileSync(f, b);
  fs.writeFileSync(path.join(d, 'data/health.json'), '{}');
  const r = node(d, 'health.mjs');
  assert.match(r.stdout, /fast-mover watcher \(live session\): its sealed provider-data file cannot be read \(SEALED_UNREADABLE\), so its state is UNKNOWN \(data\/ignition-live\.json\)/, r.stderr);
  assert.match(r.stdout, /watcher evidence UNKNOWN: the sealed watcher records cannot be read \(SEALED_UNREADABLE\)/);
  const k = node(d, 'health.mjs', { SEALED_SECRET: '' });
  assert.match(k.stdout, /\(SEALED_KEY_MISSING\), so its state is UNKNOWN/);
});

test('missed-runner ledger: unmigrated plaintext history stops the job (exit 1) and is left untouched; sealed input appends sealed', (t) => {
  const d = job(t), H = path.join(d, 'data/ignition-missed-history.jsonl');
  fs.writeFileSync(H, '{"d":"2026-01-01","sym":"ZZA"}\n');
  writeSealedJson(path.join(d, 'data/ignition-live.json'), { day: '2026-01-02', mode: 'x', missed: [{ sym: 'ZZB', code: 'NOT_VISIBLE_LIVE' }] }, TK);
  const r = node(d, 'missed-runners.mjs', { MR_LEDGER_ONLY: '1' });
  assert.equal(r.status, 1); assert.match(r.stderr, /missed-runner ledger: SEALED_LEGACY_PLAINTEXT \(T1 sealed data unavailable; nothing written\)/);
  assert.equal(fs.readFileSync(H, 'utf8'), '{"d":"2026-01-01","sym":"ZZA"}\n'); assert.equal(fs.existsSync(H + '.sealed'), false);
  fs.rmSync(H); appendSealedLines(H, [{ d: '2026-01-01', sym: 'ZZA' }], TK);
  const ok = node(d, 'missed-runners.mjs', { MR_LEDGER_ONLY: '1' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.deepEqual(readSealedText(H, TK).trim().split('\n').map((l) => JSON.parse(l).sym), ['ZZA', 'ZZB']);
  assert.equal(fs.existsSync(H), false);
  const nk = node(d, 'missed-runners.mjs', { MR_LEDGER_ONLY: '1', SEALED_SECRET: '' });
  assert.equal(nk.status, 1); assert.match(nk.stderr, /SEALED_KEY_MISSING/);
});

test('shadow outcomes: a sealed day file under another key stops the step with its code; nothing is written', (t) => {
  const d = job(t);
  writeSealed(path.join(d, 'data/shadow/2026-01-02.jsonl.gz'), Buffer.from([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0]), OTHER);
  const r = node(d, 'shadow-outcomes.mjs');
  assert.equal(r.status, 1); assert.match(r.stderr, /shadow outcomes: SEALED_UNREADABLE \(T1 sealed data unavailable; nothing written\)/);
  assert.equal(fs.existsSync(path.join(d, 'data/shadow-report.json')), false);
});

test('watcher evidence (watcher-reporting): an unmigrated plaintext run archive makes the evidence UNKNOWN and actionable', async (t) => {
  const d = job(t), { readWatcherReport } = await import(path.join(d, 'watcher-reporting.mjs'));
  fs.writeFileSync(path.join(d, 'data/ignition-days.jsonl'), JSON.stringify({ day: '2026-01-02', minutes: 300 }) + '\n');
  fs.mkdirSync(path.join(d, 'data/ignition-runs/2026-01-02'), { recursive: true }); fs.writeFileSync(path.join(d, 'data/ignition-runs/2026-01-02/r-1.json'), '{}');
  const keep = process.env.SEALED_SECRET; process.env.SEALED_SECRET = TEST_SEALED_SECRET;
  try { const r = readWatcherReport(path.join(d, 'data')); assert.equal(r.actionable, true); assert.match(r.text, /watcher evidence UNKNOWN: .*SEALED_LEGACY_PLAINTEXT/); }
  finally { if (keep === undefined) delete process.env.SEALED_SECRET; else process.env.SEALED_SECRET = keep; }
});

test('all requests stayed on loopback', () => { assert.deepEqual(blocked, []); server.close(); });
