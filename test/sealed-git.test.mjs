// R1: the sealed files through REAL git (throw-away local repositories, synthetic values, no network): the publishing path.
// Reproduces and closes Codex's Stage 1 findings R1-C2 (plaintext left in HEAD) and R1-C5 (encrypted ledger append lost on rebase).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sealedKey, writeSealed, writeSealedJson, appendSealedLines, readSealedText, readSealedJson, readSealed } from '../sealed-store.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'synthetic-git-secret', K = sealedKey(SECRET);
const ENV = { ...process.env, SEALED_SECRET: SECRET, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', NODE_OPTIONS: '' };
const FILES = ['sealed-store.mjs', 'sealed-merge.mjs', 'sealed-guard.mjs', '.gitattributes', '.github/sealed-git.sh', '.github/save-data.sh'];
const git = (cwd, args, env = ENV) => execFileSync('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const sh = (cwd, script, env = ENV) => spawnSync('bash', ['-c', script], { cwd, env, encoding: 'utf8' });
const tree = (cwd, ref = 'HEAD') => git(cwd, ['ls-tree', '-r', '--name-only', ref]).split('\n').filter(Boolean);

function world(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sealed-git-')); t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  git(d, ['init', '-q', '-b', 'main', '--bare', 'origin.git']);
  const a = path.join(d, 'a'); git(d, ['init', '-q', '-b', 'main', 'a']); git(a, ['remote', 'add', 'origin', '../origin.git']);
  for (const f of FILES) { fs.mkdirSync(path.dirname(path.join(a, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(a, f)); }
  const clone = (name) => { git(d, ['clone', '-q', 'origin.git', name]); return path.join(d, name); };
  return { d, a, clone, at: (r, p) => path.join(r, p) };
}
const commitAll = (r, m) => { git(r, ['add', '-A']); git(r, ['commit', '-q', '-m', m]); };

test('R1-C2: staging only the .sealed name leaves plaintext in HEAD (the trap); sealed_stage + guard leave ciphertext only', (t) => {
  const w = world(t), r = w.a, p = w.at(r, 'data/opp-ledger.jsonl');
  fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, '{"sym":"ZZQ","px":1.5}\n'); fs.writeFileSync(w.at(r, 'data/opp-days.jsonl'), '{"n":1}\n');
  commitAll(r, 'base');
  writeSealed(p, fs.readFileSync(p), K);   // plaintext removed from the working tree
  git(r, ['add', 'data/opp-ledger.jsonl.sealed']); git(r, ['commit', '-q', '-m', 'naive']);
  assert.ok(tree(r).includes('data/opp-ledger.jsonl'), 'Codex reproduction: plaintext still in HEAD');
  assert.notEqual(spawnSync('node', ['sealed-guard.mjs', '--tree', 'HEAD'], { cwd: r, env: ENV }).status, 0, 'guard --tree catches it');
  const s = sh(r, 'source .github/sealed-git.sh && sealed_stage data/opp-ledger.jsonl data/opp-ledger.jsonl.sealed && sealed_guard && git commit -q -m fixed && node sealed-guard.mjs --tree HEAD');
  assert.equal(s.status, 0, s.stderr);
  assert.deepEqual(tree(r).filter((x) => x.startsWith('data/')).sort(), ['data/opp-days.jsonl', 'data/opp-ledger.jsonl.sealed']);
  assert.doesNotMatch(git(r, ['show', 'HEAD:data/opp-ledger.jsonl.sealed']), /ZZQ/);
});

test('guard --staged: refuses an added/modified plaintext T1 path or temp file; allows its deletion and unrelated saves', (t) => {
  const w = world(t), r = w.a;
  fs.mkdirSync(w.at(r, 'data'), { recursive: true }); fs.writeFileSync(w.at(r, 'data/premarket.jsonl'), '{"a":1}\n'); fs.writeFileSync(w.at(r, 'data/tg-state.json'), '{"offset":1}');
  commitAll(r, 'base (pre-migration: plaintext tracked)');
  const guard = () => sh(r, 'source .github/sealed-git.sh && sealed_guard');
  fs.writeFileSync(w.at(r, 'data/tg-state.json'), '{"offset":2}'); git(r, ['add', 'data']);
  assert.equal(guard().status, 0, 'an unrelated save (the bot offset) is not blocked by pre-migration plaintext');
  fs.appendFileSync(w.at(r, 'data/premarket.jsonl'), '{"a":2}\n'); git(r, ['add', 'data']);
  const g = guard(); assert.notEqual(g.status, 0); assert.match(g.stderr, /data\/premarket\.jsonl/); assert.doesNotMatch(g.stderr, /"a"/, 'paths only, never content');
  git(r, ['reset', '-q']); git(r, ['checkout', '-q', '--', 'data/premarket.jsonl']);
  writeSealed(w.at(r, 'data/premarket.jsonl'), fs.readFileSync(w.at(r, 'data/premarket.jsonl')), K);
  assert.equal(sh(r, 'source .github/sealed-git.sh && git add -A data && sealed_guard').status, 0, 'plaintext deletion + sealed addition pass');
  fs.writeFileSync(w.at(r, 'data/x.json.sealed.tmp-1-ab'), 'x'); git(r, ['add', 'data']);
  assert.notEqual(guard().status, 0, 'a temp file is refused');
  git(r, ['reset', '-q']); fs.rmSync(w.at(r, 'data/x.json.sealed.tmp-1-ab'));
  git(r, ['config', '--unset', 'merge.sealed.driver']); git(r, ['add', 'data']);
  assert.match(spawnSync('node', ['sealed-guard.mjs', '--staged'], { cwd: r, env: ENV, encoding: 'utf8' }).stderr, /merge driver is not registered/);
});

function concurrentAppends(t, register) {
  const w = world(t), a = w.a, p = (r) => w.at(r, 'data/opp-ledger.jsonl');
  appendSealedLines(p(a), [{ n: 0 }], K); commitAll(a, 'base'); git(a, ['push', '-q', '-u', 'origin', 'main']);
  const b = w.clone('b');
  appendSealedLines(p(a), [{ side: 'a' }], K); commitAll(a, 'a'); git(a, ['push', '-q']);
  appendSealedLines(p(b), [{ side: 'b' }], K); commitAll(b, 'b');
  const env = { ...ENV, SEALED_MERGE_FAVOR: 'theirs' };
  const s = sh(b, (register ? 'source .github/sealed-git.sh && ' : '') + 'git pull -q --rebase -X theirs && git push -q', env);
  return { s, b, lines: () => readSealedText(p(b), K).trim().split('\n') };
}

test('R1-C5 reproduced: WITHOUT the driver, pull --rebase -X theirs silently keeps one side of a sealed ledger', (t) => {
  const r = concurrentAppends(t, false);
  assert.equal(r.s.status, 0); assert.deepEqual(r.lines(), ['{"n":0}', '{"side":"b"}'], 'side a lost: why the guard refuses to commit without the driver');
});

test('R1-C5 closed: WITH sealed-git.sh, concurrent appends from two runs are both kept (decrypt, line union, re-encrypt)', (t) => {
  const r = concurrentAppends(t, true);
  assert.equal(r.s.status, 0, r.s.stderr);
  assert.deepEqual(r.lines(), ['{"n":0}', '{"side":"a"}', '{"side":"b"}']);
  assert.match(r.s.stderr, /sealed merge: merged data\/opp-ledger\.jsonl/); assert.doesNotMatch(r.s.stderr, /side/, 'no content in logs');
});

test('JSON state: non-overlapping edits merge; an overlapping edit follows SEALED_MERGE_FAVOR; without it the save fails, nothing lost', (t) => {
  const w = world(t), a = w.a, p = (r) => w.at(r, 'data/movers-state.json');
  const base = { a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1, h: 1 };
  writeSealed(p(a), JSON.stringify(base, null, 1), K); commitAll(a, 'base'); git(a, ['push', '-q', '-u', 'origin', 'main']);
  const b = w.clone('b'), b2 = w.clone('b2');
  writeSealed(p(a), JSON.stringify({ ...base, a: 2 }, null, 1), K); commitAll(a, 'a'); git(a, ['push', '-q']);
  writeSealed(p(b), JSON.stringify({ ...base, h: 3 }, null, 1), K); commitAll(b, 'b');
  assert.equal(sh(b, 'source .github/sealed-git.sh && git pull -q --rebase', { ...ENV, SEALED_MERGE_FAVOR: '' }).status, 0);
  assert.deepEqual(readSealedJson(p(b), null, K), { ...base, a: 2, h: 3 }, 'both edits kept');
  writeSealed(p(b2), JSON.stringify({ ...base, a: 9 }, null, 1), K); commitAll(b2, 'b2');
  const strict = sh(b2, 'source .github/sealed-git.sh && git pull -q --rebase', { ...ENV, SEALED_MERGE_FAVOR: '' });
  assert.notEqual(strict.status, 0, 'a real conflict without a declared preference fails loudly'); sh(b2, 'git rebase --abort');
  assert.deepEqual(readSealedJson(p(b2), null, K), { ...base, a: 9 }, 'local run data intact for the retry');
  assert.equal(sh(b2, 'source .github/sealed-git.sh && git pull -q --rebase -X theirs', { ...ENV, SEALED_MERGE_FAVOR: 'theirs' }).status, 0);
  assert.deepEqual(readSealedJson(p(b2), null, K), { ...base, a: 9 }, '-X theirs semantics: the replayed run wins the overlapping hunk only');
});

test('binary (.gz) changed on both sides, or no key at merge time: conflict, never one side, never plaintext', (t) => {
  const w = world(t), a = w.a, p = (r) => w.at(r, 'data/shadow/2026-01-02.jsonl.gz');
  writeSealed(p(a), zlib.gzipSync('{"r":0}\n'), K); commitAll(a, 'base'); git(a, ['push', '-q', '-u', 'origin', 'main']);
  const b = w.clone('b'), c = w.clone('c');
  writeSealed(p(a), zlib.gzipSync('{"r":"a"}\n'), K); commitAll(a, 'a'); git(a, ['push', '-q']);
  writeSealed(p(b), zlib.gzipSync('{"r":"b"}\n'), K); commitAll(b, 'b');
  const s = sh(b, 'source .github/sealed-git.sh && git pull -q --rebase -X theirs', { ...ENV, SEALED_MERGE_FAVOR: 'theirs' });
  assert.notEqual(s.status, 0); assert.match(s.stderr, /CONFLICT data\/shadow\/2026-01-02\.jsonl\.gz/);
  appendSealedLines(w.at(c, 'data/opp-ledger.jsonl'), ['{"c":1}'], K); commitAll(c, 'c');
  appendSealedLines(w.at(a, 'data/opp-ledger.jsonl'), ['{"a":1}'], K); commitAll(a, 'a2'); git(a, ['push', '-q']);
  const nk = sh(c, 'source .github/sealed-git.sh && git pull -q --rebase -X theirs', { ...ENV, SEALED_SECRET: '', SEALED_MERGE_FAVOR: 'theirs' });
  assert.notEqual(nk.status, 0); assert.match(nk.stderr, /SEALED_KEY_MISSING/);
  for (const r of [b, c]) assert.equal(git(r, ['ls-files']).split('\n').filter((x) => /\.(jsonl|gz)$/.test(x)).length, 0, 'no plaintext staged');
});

test('save-data.sh (nightly scan save) end to end: sealed ledger merged with a concurrent bot save; guard blocks plaintext', (t) => {
  const w = world(t), a = w.a, led = (r) => w.at(r, 'data/options-shadow.json'), mv = (r) => w.at(r, 'data/movers-journal.jsonl');
  writeSealedJson(led(a), { open: [], done: [] }, K); appendSealedLines(mv(a), [{ d: 1 }], K); fs.writeFileSync(w.at(a, 'data/tg-state.json'), '{"offset":1}');
  commitAll(a, 'base'); git(a, ['push', '-q', '-u', 'origin', 'main']);
  const scan = w.clone('scan');
  appendSealedLines(mv(a), [{ d: 'bot' }], K); fs.writeFileSync(w.at(a, 'data/tg-state.json'), '{"offset":2}'); commitAll(a, 'bot'); git(a, ['push', '-q']);
  appendSealedLines(mv(scan), [{ d: 'scan' }], K);
  const s = sh(scan, 'SAVE_SLEEP=0 bash .github/save-data.sh "scan test"', { ...ENV, SEALED_MERGE_FAVOR: 'theirs' });
  assert.equal(s.status, 0, s.stdout + s.stderr);
  const o = w.clone('check');
  assert.deepEqual(readSealedText(mv(o), K).trim().split('\n'), ['{"d":1}', '{"d":"bot"}', '{"d":"scan"}']);
  assert.equal(fs.readFileSync(w.at(o, 'data/tg-state.json'), 'utf8'), '{"offset":2}');
  fs.writeFileSync(w.at(scan, 'data/premarket.jsonl'), '{"leak":1}\n');
  const bad = sh(scan, 'SAVE_SLEEP=0 bash .github/save-data.sh "leak test"', ENV);
  assert.notEqual(bad.status, 0); assert.match(bad.stdout + bad.stderr, /refusing to publish T1 provider data in plaintext/);
  assert.ok(!tree(w.clone('check2')).includes('data/premarket.jsonl'));
});

test('leaders-study copy-back: the CLI three-way merge of a history segment keeps the watcher\'s appends made during the 2-hour run', (t) => {
  const w = world(t), r = w.a, H = 'data/ignition-missed-history.jsonl', SEG = H + '.d/2026-01-04.jsonl', base = path.join(w.d, 'base.sealed'), run = path.join(w.d, 'run.sealed');
  const app = (x) => appendSealedLines(w.at(r, H), [x], K, { day: '2026-01-04' });
  app({ d: 1 }); fs.copyFileSync(w.at(r, SEG + '.sealed'), base);
  app({ d: 'study' }); fs.copyFileSync(w.at(r, SEG + '.sealed'), run);
  fs.copyFileSync(base, w.at(r, SEG + '.sealed')); app({ d: 'watcher' });   // fresh main
  const s = spawnSync('node', ['sealed-merge.mjs', base, SEG + '.sealed', run, SEG + '.sealed'], { cwd: r, env: { ...ENV, SEALED_MERGE_FAVOR: 'theirs' }, encoding: 'utf8' });
  assert.equal(s.status, 0, s.stderr);
  assert.deepEqual(readSealedText(w.at(r, H), K).trim().split('\n'), ['{"d":1}', '{"d":"watcher"}', '{"d":"study"}']);
});
