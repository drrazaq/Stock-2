// R1 rev3: reproductions of Codex's re-review blockers on ae8cbb63 (PR #1 comment 6717623537) and of the owner-state race, each run
// against the corrected code. Synthetic only: invented keys and values, throw-away local git repositories, loopback stubs, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sealedKey, writeSealed, writeSealedJson, readSealedJson, sealedPath, sealedIO } from '../sealed-store.mjs';
import { mergeKeyed } from '../sealed-merge.mjs';
import { gate, OPEN_STATUSES } from '../r1-writer-gate.mjs';
import { loadScan, blocked, TEST_SEALED_SECRET } from './load-scan.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'synthetic-blocker-secret', K = sealedKey(SECRET);
const ENV = { ...process.env, SEALED_SECRET: SECRET, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', NODE_OPTIONS: '' };
const git = (cwd, args) => execFileSync('git', args, { cwd, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const sh = (cwd, script, env = ENV) => spawnSync('bash', ['-c', script], { cwd, env, encoding: 'utf8' });
const tmpdir = (t, p) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), p)); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

// ---------- blocker 2: durability errors are not swallowed; short writes are completed ----------
test('blocker 2: a directory-fsync EIO fails the write and the original plaintext is KEPT (Codex injected EIO twice)', (t) => {
  const d = tmpdir(t, 'b2-'), p = path.join(d, 'data', 'options-shadow.json');
  fs.mkdirSync(path.dirname(p)); fs.writeFileSync(p, '{"real":[1]}');
  const real = sealedIO.fsyncSync, dirs = new Set(); let n = 0;
  const realOpen = sealedIO.openSync; sealedIO.openSync = (f, m) => { const fd = realOpen(f, m); if (m === 'r') dirs.add(fd); return fd; };
  sealedIO.fsyncSync = (fd) => { if (dirs.has(fd)) { n++; throw Object.assign(new Error('EIO: injected'), { code: 'EIO' }); } return real(fd); };
  try { assert.throws(() => writeSealedJson(p, { real: [1, 2] }, K), { code: 'EIO' }); }
  finally { sealedIO.fsyncSync = real; sealedIO.openSync = realOpen; }
  assert.ok(n >= 1); assert.equal(fs.readFileSync(p, 'utf8'), '{"real":[1]}', 'original plaintext retained');
  assert.deepEqual(fs.readdirSync(path.dirname(p)).filter((f) => /\.tmp-/.test(f)), [], 'no temp file left');
});

test('blocker 2: EINVAL/ENOTSUP from a directory fsync (unsupported) is tolerated; short writes are completed, a zero write fails', (t) => {
  const d = tmpdir(t, 'b2s-'), p = path.join(d, 'data', 'opp-ledger.jsonl');
  const real = { f: sealedIO.fsyncSync, w: sealedIO.writeSync, o: sealedIO.openSync }, dirs = new Set();
  sealedIO.openSync = (f, m) => { const fd = real.o(f, m); if (m === 'r') dirs.add(fd); return fd; };
  sealedIO.fsyncSync = (fd) => { if (dirs.has(fd)) throw Object.assign(new Error('EINVAL'), { code: 'EINVAL' }); return real.f(fd); };
  let calls = 0; sealedIO.writeSync = (fd, buf, off, len) => { calls++; return real.w(fd, buf, off, Math.min(len, 7)); };   // 7 bytes at a time
  try { writeSealed(p, 'x'.repeat(500) + '\n', K); assert.ok(calls > 5); assert.equal(readSealedJson.length >= 0, true); }
  finally { Object.assign(sealedIO, { fsyncSync: real.f, writeSync: real.w, openSync: real.o }); }
  sealedIO.writeSync = () => 0;
  try { assert.throws(() => writeSealed(p, 'y\n', K), { code: 'EIO' }); } finally { sealedIO.writeSync = real.w; }
  assert.equal(execFileSync(process.execPath, ['-e', `import('${path.join(ROOT, 'sealed-store.mjs')}').then(S=>process.stdout.write(S.readSealedText(${JSON.stringify(p)},S.sealedKey('${SECRET}'))))`]).toString(), 'x'.repeat(500) + '\n', 'the failed write left the previous sealed copy intact');
});

// ---------- blocker 3: no key + ABSENT record: write-capable lanes stop before any request, ticket or mutation ----------
let queue = [], sent = [], uid = 1;
const server = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { let out = { ok: true, result: true };
  if (/getUpdates/.test(req.url)) { out = { ok: true, result: queue.map(text => ({ update_id: ++uid, message: { message_id: uid, chat: { id: 42 }, text } })) }; queue = []; }
  else if (/sendMessage/.test(req.url)) { try { sent.push(JSON.parse(b).text); } catch { sent.push(decodeURIComponent((b.match(/text=([^&]*)/) || [])[1] || '').replace(/\+/g, ' ')); } }
  res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(out)); }); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const TB = 'http://127.0.0.1:' + server.address().port, TENV = { TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: TB, TD_BASE: TB, FH_BASE: TB };

test('blocker 3 (Codex reproduction): no key and NO options record -> the nightly options lane makes no request and sends nothing', async () => {
  const S = await loadScan({ env: { ...TENV, SEALED_SECRET: '', ALPACA_KEY: 'synthetic', ALPACA_SECRET: 'synthetic' }, files: { 'data/signals.json': { stocks: [{ sym: 'ZZQ', last: 90 }] }, 'data/quality.json': { picks: [{ sym: 'ZZQ' }] } } });
  assert.equal(fs.existsSync(path.join(S.dir, 'data/options-shadow.json.sealed')), false);
  const nb = blocked.length; sent = [];
  assert.match(await S.fn('optionsShadow')(), /the options record: UNKNOWN \(its sealed provider-data file cannot be read: SEALED_KEY_MISSING\)\. The lane did not run/);
  assert.equal(blocked.length, nb, 'no market request attempted'); assert.deepEqual(sent, []);
  assert.deepEqual(fs.readdirSync(path.join(S.dir, 'data')).filter((f) => /options-shadow/.test(f)), [], 'nothing created');
});

test('blocker 3: no key and no record -> an owner option command is NOT RECORDED; with the key and no record it is recorded (absent != unreadable)', async () => {
  const today = new Date().toISOString().slice(0, 10), H = { HQY: { s: 'ok', d: today, by: 'ZAD (you)' } };
  const S = await loadScan({ env: { ...TENV, SEALED_SECRET: '' }, files: { 'data/halal.json': H, 'data/my-positions.json': {} } });
  queue = ['bought option HQY 95 2026-11-21 2.40']; sent = []; await S.fn('tgCommands')(null);
  assert.match(sent.join('\n'), /OPTIONS TRIAL: NOT RECORDED\..*SEALED_KEY_MISSING/s);
  const C = await loadScan({ env: TENV, files: { 'data/halal.json': H, 'data/my-positions.json': {} } });
  queue = ['bought option HQY 95 2026-11-21 2.40']; sent = []; await C.fn('tgCommands')(null);
  assert.match(sent.join('\n'), /OPTIONS TRIAL: recorded 1 x HQY/); assert.equal(C.readJson('data/options-shadow.json').real.length, 1);
});

function jobDir(t) { const d = tmpdir(t, 'b3-'); for (const f of fs.readdirSync(ROOT).filter((f) => f.endsWith('.mjs'))) fs.copyFileSync(path.join(ROOT, f), path.join(d, f)); fs.mkdirSync(path.join(d, 'data')); return d; }
test('blocker 3: every keyless writer job stops at once with SEALED_KEY_MISSING (before any request); readers report it even when files are absent', (t) => {
  const d = jobDir(t), guard = path.join(d, 'no-fetch.mjs');
  fs.writeFileSync(guard, "globalThis.fetch=()=>{require('fs').writeFileSync('FETCHED','1');throw new Error('fetch attempted');};".replace("require('fs')", "process.getBuiltinModule?process.getBuiltinModule('fs'):null") );
  fs.writeFileSync(guard, "import fs from 'node:fs'; globalThis.fetch = () => { fs.writeFileSync('FETCHED', '1'); throw new Error('fetch attempted'); };");
  const run = (file, extra = {}) => spawnSync(process.execPath, ['--import', guard, file], { cwd: d, encoding: 'utf8', timeout: 60000, env: { PATH: process.env.PATH, SEALED_SECRET: '', MASSIVE_KEY: 'x', ALPACA_KEY: 'x', ALPACA_SECRET: 'x', FINNHUB_KEY: 'x', ...extra } });
  for (const [file, extra, what] of [['missed-runners.mjs', {}, 'missed-runner ledger'], ['shadow-outcomes.mjs', {}, 'shadow outcomes'], ['scorecard-1023.mjs', {}, 'scorecard'],
    ['movers.mjs', {}, 'movers'], ['options-survey.mjs', {}, 'options survey'], ['fastmover-lab.mjs', { MODE: 'live' }, 'fast-mover live']]) {
    const r = run(file, extra);
    assert.equal(r.status, 1, file + ' ' + r.stderr.slice(0, 300)); assert.match(r.stderr, new RegExp(what + ': SEALED_KEY_MISSING'), file);
  }
  assert.equal(fs.existsSync(path.join(d, 'FETCHED')), false, 'no request was attempted by any of them');
  assert.deepEqual(fs.readdirSync(path.join(d, 'data')), [], 'nothing written');
  fs.writeFileSync(path.join(d, 'data/health.json'), '{}');
  const h = run('health.mjs');
  assert.match(h.stdout, /fast-mover watcher \(live session\): its sealed provider-data file cannot be read \(SEALED_KEY_MISSING\), so its state is UNKNOWN/);
  assert.match(h.stdout, /watcher evidence UNKNOWN: the sealed watcher records cannot be read \(SEALED_KEY_MISSING\)/);
});

// ---------- blocker 5: guard the exact reconciled tree before each push ----------
function world(t) {
  const d = tmpdir(t, 'b5-');
  git(d, ['init', '-q', '-b', 'main', '--bare', 'origin.git']);
  const a = path.join(d, 'a'); git(d, ['init', '-q', '-b', 'main', 'a']); git(a, ['remote', 'add', 'origin', '../origin.git']);
  for (const f of ['sealed-store.mjs', 'sealed-merge.mjs', 'sealed-guard.mjs', '.gitattributes', '.github/sealed-git.sh', '.github/save-data.sh', '.github/bot-save.sh']) { fs.mkdirSync(path.dirname(path.join(a, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(a, f)); }
  const clone = (n) => { git(d, ['clone', '-q', 'origin.git', n]); return path.join(d, n); };
  return { d, a, clone };
}
const commitAll = (r, m) => { git(r, ['add', '-A']); git(r, ['commit', '-q', '-m', m]); };

test('blocker 5: pre-migration, offset-only bot saves still publish; plaintext T1 that an old writer added is refused at push only once migrated', (t) => {
  const w = world(t), a = w.a;
  fs.mkdirSync(path.join(a, 'data')); fs.writeFileSync(path.join(a, 'data/premarket.jsonl'), '{"p":1}\n'); fs.writeFileSync(path.join(a, 'data/tg-state.json'), '{"offset":1}');
  commitAll(a, 'base (pre-migration)'); git(a, ['push', '-q', '-u', 'origin', 'main']);
  const old = w.clone('oldwriter'), bot = w.clone('bot');
  fs.appendFileSync(path.join(old, 'data/premarket.jsonl'), '{"p":2}\n'); commitAll(old, 'old writer'); git(old, ['push', '-q']);
  fs.writeFileSync(path.join(bot, 'data/tg-state.json'), '{"offset":2}');
  const s = sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save && git log -1 --format=%s origin/main', ENV);
  assert.equal(s.status, 0, s.stderr); assert.match(s.stdout, /^bot /m, 'pre-migration: the offset save published (already-public plaintext is not new)');
  // a migrated tree: manifest present. An old writer pushes plaintext T1 to origin; our next save must refuse to publish it again
  const m = w.clone('mig'); fs.mkdirSync(path.join(m, '.github'), { recursive: true }); fs.writeFileSync(path.join(m, '.github/r1-migration-manifest.json'), '{"version":1}');
  writeSealed(path.join(m, 'data/premarket.jsonl'), fs.readFileSync(path.join(m, 'data/premarket.jsonl')), K); commitAll(m, 'R1 migrated'); git(m, ['push', '-q']);
  const old2 = w.clone('oldwriter2'); fs.writeFileSync(path.join(old2, 'data/premarket.jsonl'), '{"leak":1}\n'); commitAll(old2, 'old writer after migration'); git(old2, ['push', '-q']);
  const bot2 = w.clone('bot2'); git(bot2, ['reset', '-q', '--hard', 'HEAD~1']);   // the bot's checkout predates the old writer's push
  fs.writeFileSync(path.join(bot2, 'data/tg-state.json'), '{"offset":3}');
  const before = git(w.d, ['--git-dir=origin.git', 'rev-parse', 'main']).trim();
  const r = sh(bot2, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save; cat run.log', ENV);
  assert.match(r.stderr + r.stdout, /SEALED GUARD: .*would be published \(--push\):\s+data\/premarket\.jsonl/s);
  assert.match(r.stdout, /could not save the data folder/);
  assert.equal(git(w.d, ['--git-dir=origin.git', 'rev-parse', 'main']).trim(), before, 'nothing pushed over the leaked plaintext');
});

// ---------- the owner-state race: the bot's real option trades vs the scan's paper lane ----------
test('owner-state race (Codex reproduction): bot records a real trade while the scan saves paper calls -> both kept', (t) => {
  const w = world(t), a = w.a, P = (r) => path.join(r, 'data/options-shadow.json');
  writeSealedJson(P(a), { real: [], open: [] }, K); fs.writeFileSync(path.join(a, 'data/tg-state.json'), '{"offset":1}');
  commitAll(a, 'base'); git(a, ['push', '-q', '-u', 'origin', 'main']);
  const bot = w.clone('bot'), scan = w.clone('scan');
  writeSealedJson(P(bot), { real: [{ sym: 'ZZR', paid: 2.4 }], open: [] }, K);   // owner command
  assert.equal(sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save', ENV).status, 0);
  writeSealedJson(P(scan), { real: [], open: [{ sym: 'ZZP', ask: 1.1 }] }, K);   // nightly paper lane, from the older base
  const s = sh(scan, 'SAVE_SLEEP=0 bash .github/save-data.sh "scan"', { ...ENV, SEALED_MERGE_FAVOR: 'theirs' });
  assert.equal(s.status, 0, s.stdout + s.stderr);
  const o = w.clone('check');
  assert.deepEqual(readSealedJson(P(o), null, K), { real: [{ sym: 'ZZR', paid: 2.4 }], open: [{ sym: 'ZZP', ask: 1.1 }] }, 'before rev3, -X theirs kept real:[] here');
});

test('owner-state race: a real clash on the owner\'s trades is REFUSED (never one side), the bot keeps and retries its commit, the owner is warned once', (t) => {
  const w = world(t), a = w.a, P = (r) => path.join(r, 'data/options-shadow.json');
  writeSealedJson(P(a), { real: [], open: [] }, K); commitAll(a, 'base'); git(a, ['push', '-q', '-u', 'origin', 'main']);
  const bot = w.clone('bot'), other = w.clone('other');
  writeSealedJson(P(other), { real: [{ sym: 'ZZX' }], open: [] }, K); commitAll(other, 'other real change'); git(other, ['push', '-q']);
  writeSealedJson(P(bot), { real: [{ sym: 'ZZR' }], open: [] }, K);
  sent = [];
  const env = { ...ENV, TG_TOKEN: 'T', TG_CHAT: '42', TG_BASE: TB, RUNNER_TEMP: w.d };
  const r = sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save; save; cat run.log', env);
  assert.match(r.stderr, /sealed merge: CONFLICT data\/options-shadow\.json \(both sides changed "real"\)/);
  assert.match(r.stdout, /could not save the data folder to the repository \(kept in the local commit; retried at the next save\)/);
  assert.equal(readSealedJson(P(w.clone('check')), null, K).real[0].sym, 'ZZX', 'origin unchanged: nothing overwritten');
  assert.equal(git(bot, ['rev-list', '--count', 'origin/main..HEAD']).trim(), '1', 'the owner\'s change is kept in the local commit');
  assert.equal(readSealedJson(P(bot), null, K).real[0].sym, 'ZZR');
  return new Promise((res) => setTimeout(() => { assert.equal(sent.filter((x) => /SAVE NOT CONFIRMED/.test(x)).length, 1, 'warned once per run, not per attempt'); res(); }, 200));
});

test('an unpublished commit is retried by the next save even when nothing new is staged (before rev3 it stayed behind)', (t) => {
  const w = world(t), a = w.a;
  fs.mkdirSync(path.join(a, 'data')); fs.writeFileSync(path.join(a, 'data/tg-state.json'), '{"offset":1}'); commitAll(a, 'base'); git(a, ['push', '-q', '-u', 'origin', 'main']);
  const bot = w.clone('bot'), hook = path.join(w.d, 'origin.git', 'hooks', 'pre-receive');
  fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 });   // the remote refuses (outage)
  fs.writeFileSync(path.join(bot, 'data/tg-state.json'), '{"offset":2}');
  sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save', ENV);
  assert.equal(git(bot, ['rev-list', '--count', 'origin/main..HEAD']).trim(), '1');
  fs.rmSync(hook);
  const s = sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save', ENV);   // nothing new staged
  assert.equal(s.status, 0); assert.equal(git(bot, ['rev-list', '--count', 'origin/main..HEAD']).trim(), '0', 'published at the next save');
});

test('keyed merge unit: one-sided and identical changes merge, deletions respected, clashes refused, non-objects refused', () => {
  const O = '{"real":[],"open":[],"cc":{"n":1}}';
  assert.deepEqual(JSON.parse(mergeKeyed(O, '{"real":[1],"open":[],"cc":{"n":1}}', '{"real":[],"open":[2],"cc":{"n":1}}').text), { real: [1], open: [2], cc: { n: 1 } });
  assert.deepEqual(JSON.parse(mergeKeyed(O, '{"real":[1],"open":[]}', '{"real":[1],"open":[],"cc":{"n":1}}').text), { real: [1], open: [] }, 'a deletion on one side wins over no change');
  assert.equal(mergeKeyed(O, '{"real":[1],"open":[]}', '{"real":[2],"open":[]}').ok, false);
  assert.equal(mergeKeyed(O, '[1]', '{}').ok, false);
});

test('writer quiescence gate (rev6 capture v2): open-status census + 31-day created coverage, complete pages, cap, repository, freshness', () => {
  const NOW = Date.parse('2026-11-14T08:00:00Z'), CAP = '2026-11-14T07:58:00Z', REPO = { full_name: 'drrazaq/Stock-2' };
  const run = (id, p, status) => ({ id, path: '.github/workflows/' + p, status, repository: REPO });
  const page = (runs, total = runs.length) => [{ page: 1, total_count: total, workflow_runs: runs }];
  const statusQ = (st, runs = []) => ({ kind: 'status', status: st, per_page: 100, pages: page(runs) });
  const createdQ = (from, to, runs = [], wf = '*') => ({ kind: 'created', workflow: wf, from, to, per_page: 100, pages: page(runs) });
  const base = () => ({ repository: 'drrazaq/Stock-2', captured_at: CAP, queries: [...OPEN_STATUSES.map((s) => statusQ(s)),
    createdQ('2026-10-14T00:00:00Z', '2026-10-30T00:00:00Z', [run(1, 'bot.yml', 'completed')]), createdQ('2026-10-30T00:00:00Z', CAP, [run(2, 'ignition.yml', 'completed'), run(3, 'pages.yml', 'in_progress')])] });
  const G = (e) => gate(e, { now: NOW });
  assert.equal(G(base()).pass, true, G(base()).why.join('; '));
  // Codex: an OLD run (created weeks ago) re-run or waiting is caught by the status census, whatever its creation date
  const old = base(); old.queries[OPEN_STATUSES.indexOf('waiting')] = statusQ('waiting', [run(9, 'main.yml', 'waiting')]);
  assert.match(G(old).why.join(), /writer run not completed: \.github\/workflows\/main\.yml run 9 \(waiting\)/);
  const miss = base(); miss.queries = miss.queries.filter((q) => q.status !== 'action_required');
  assert.match(G(miss).why.join(), /status query "action_required": expected exactly one, found 0/);
  const gap = base(); gap.queries[OPEN_STATUSES.length] = createdQ('2026-10-20T00:00:00Z', '2026-10-30T00:00:00Z');
  assert.match(G(gap).why.join(), /do not cover the last 31 days/, 'only 25 days covered');
  const unknown = base(); unknown.queries[OPEN_STATUSES.length + 1].pages = page([run(4, 'movers.yml', 'some_new_status')]);
  assert.match(G(unknown).why.join(), /movers\.yml run 4 \(some_new_status\)/, 'a future status fails closed via the created family');
  const capped = base(); capped.queries[OPEN_STATUSES.length].pages = [{ page: 1, total_count: 1200, workflow_runs: [] }];
  assert.match(G(capped).why.join(), /exceeds the 1,000-result API cap/);
  const partial = base(); partial.queries[0] = { kind: 'status', status: 'queued', per_page: 1, pages: [{ page: 1, total_count: 2, workflow_runs: [run(5, 'pages.yml', 'queued')] }] };
  assert.match(G(partial).why.join(), /pages \[1\], expected 1\.\.2/);
  const repo = base(); repo.queries[0].pages = page([{ ...run(6, 'pages.yml', 'queued'), repository: { full_name: 'x/y' } }]);
  assert.match(G(repo).why.join(), /run 6 is not from/);
  assert.match(G({ ...base(), captured_at: '2026-11-14T07:30:00Z' }).why.join(), /stale/);
  assert.equal(G({ total_count: 0, workflow_runs: [] }).pass, false, 'a bare listing is not a capture');
});

test('Codex rev3 #1: an identical RETRY after a directory-fsync EIO keeps the plaintext (durability first, then removal)', (t) => {
  const d = tmpdir(t, 'b2r-'), p = path.join(d, 'data', 'options-shadow.json');
  fs.mkdirSync(path.dirname(p)); fs.writeFileSync(p, '{"real":[1]}');
  const real = { f: sealedIO.fsyncSync, o: sealedIO.openSync }, dirs = new Set();
  sealedIO.openSync = (f, m) => { const fd = real.o(f, m); if (m === 'r') dirs.add(fd); return fd; };
  sealedIO.fsyncSync = (fd) => { if (dirs.has(fd)) throw Object.assign(new Error('EIO'), { code: 'EIO' }); return real.f(fd); };
  try {
    assert.throws(() => writeSealedJson(p, { real: [1] }, K), { code: 'EIO' });
    assert.ok(fs.existsSync(sealedPath(p)), 'the renamed sealed copy exists but is not acknowledged durable');
    assert.throws(() => writeSealedJson(p, { real: [1] }, K), { code: 'EIO' }, 'identical retry');
    assert.equal(fs.readFileSync(p, 'utf8'), '{"real":[1]}', 'plaintext still kept');
  } finally { Object.assign(sealedIO, { fsyncSync: real.f, openSync: real.o }); }
  assert.equal(writeSealedJson(p, { real: [1] }, K), false, 'once durable, the identical retry completes'); assert.equal(fs.existsSync(p), false);
});

test('all scan requests stayed on loopback', () => { assert.deepEqual(blocked.filter((u) => !/data\.alpaca\.markets/.test(u)), []); server.close(); });
