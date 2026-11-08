// R1 migration (sealed-migrate.mjs), rev3: bound to one approved source commit, manifest, complete-set verification, safe recovery.
// Synthetic throw-away repositories only. Includes Codex's re-review reproductions for blockers 1 (export escape) and 4 (provenance).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sealedKey, readSealedText, readSealed, writeSealed, appendSealedLines } from '../sealed-store.mjs';
import { plan, apply, verifyTree, exportTo, MANIFEST, makeKeyCheck, checkKey } from '../sealed-migrate.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'synthetic-migrate-secret', K = sealedKey(SECRET);
const ENV = { ...process.env, SEALED_SECRET: SECRET, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', NODE_OPTIONS: '' };
const git = (cwd, args) => execFileSync('git', args, { cwd, env: ENV }).toString();
const FIX = {
  'data/opp-ledger.jsonl': '{"sym":"ZZA","px":2.5}\n', 'data/premarket.jsonl': '{"rows":[{"s":"ZZB","p":3}]}\n', 'data/ignition-live.json': '{"day":"2026-01-02"}',
  'data/ignition-runs/2026-01-02/1-1.json': '{"run":1}', 'data/ignition-runs/2026-01-02/1-1-progress.json': '{"p":1}', 'data/options-shadow.json': '{"open":[],"real":[]}',
  'data/options-spread-survey.md': '| ZZC | 4.10 |', 'data/opp-days.jsonl': '{"n":1}\n', 'data/signals.json': '{"ok":1}',
};
function repo(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sealed-mig-')); t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const r = path.join(d, 'repo'); git(d, ['init', '-q', '-b', 'main', 'repo']);
  for (const f of ['sealed-store.mjs', 'sealed-migrate.mjs', 'sealed-guard.mjs', 'sealed-merge.mjs', '.gitattributes']) fs.copyFileSync(path.join(ROOT, f), path.join(r, f));
  for (const [f, v] of Object.entries(FIX)) { fs.mkdirSync(path.dirname(path.join(r, f)), { recursive: true }); fs.writeFileSync(path.join(r, f), v); }
  fs.mkdirSync(path.join(r, 'data/shadow'), { recursive: true }); fs.writeFileSync(path.join(r, 'data/shadow/2026-01-02.jsonl.gz'), zlib.gzipSync('{"bid":1.1}\n'));
  git(r, ['add', '-A']); git(r, ['commit', '-q', '-m', 'base']);
  return { d, r, head: git(r, ['rev-parse', 'HEAD']).trim() };
}
const T1N = 8;
const migrateCommit = (r, head) => { apply({ key: K, cwd: r, source: head }); git(r, ['commit', '-q', '-m', 'R1']); };

test('plan: exactly the T1 plaintext paths of the given tree (no key needed); neighbours untouched', (t) => {
  const { r } = repo(t);
  assert.deepEqual(plan(r), ['data/ignition-live.json', 'data/ignition-runs/2026-01-02/1-1-progress.json', 'data/ignition-runs/2026-01-02/1-1.json', 'data/opp-ledger.jsonl',
    'data/options-shadow.json', 'data/options-spread-survey.md', 'data/premarket.jsonl', 'data/shadow/2026-01-02.jsonl.gz']);
});

test('apply + receipt: ciphertext only, manifest of every source path/size/hash, parent = approved source; history not rewritten', (t) => {
  const { r, head } = repo(t);
  const done = apply({ key: K, cwd: r, source: head });
  assert.equal(done.length, T1N);
  assert.equal(git(r, ['diff', '--cached', '--name-status']).split('\n').filter((l) => /^D\t/.test(l)).length, T1N, 'every plaintext deletion staged');
  git(r, ['commit', '-q', '-m', 'R1']);
  const man = JSON.parse(fs.readFileSync(path.join(r, MANIFEST), 'utf8'));
  assert.equal(man.source, head); assert.equal(man.count, T1N); assert.ok(man.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256) && f.bytes > 0));
  assert.doesNotMatch(JSON.stringify(man), /ZZA|ZZB|ZZC/, 'the manifest holds paths, sizes and hashes only');
  const v = verifyTree('HEAD', { key: K, cwd: r });
  assert.deepEqual(v.problems, []); assert.equal(v.sealedT1, T1N); assert.equal(v.manifestCount, T1N);
  assert.equal(readSealedText(path.join(r, 'data/opp-ledger.jsonl'), K), FIX['data/opp-ledger.jsonl']);
  assert.equal(zlib.gunzipSync(readSealed(path.join(r, 'data/shadow/2026-01-02.jsonl.gz'), K)).toString(), '{"bid":1.1}\n');
  assert.match(git(r, ['show', 'HEAD~1:data/opp-ledger.jsonl']), /ZZA/, 'earlier commit still holds plaintext: R1 does not remove history');
});

test('Codex blocker 4: an unreviewed staged T1 addition, a dirty tree or HEAD != approved source are all refused; nothing changes', (t) => {
  const { r, head } = repo(t);
  assert.throws(() => apply({ key: null, cwd: r, source: head }), { code: 'SEALED_KEY_MISSING' });
  assert.throws(() => apply({ key: K, cwd: r }), /approved full source commit id is required/);
  fs.writeFileSync(path.join(r, 'data/early-wave-obs.jsonl'), '{"unreviewed":1}\n'); git(r, ['add', 'data/early-wave-obs.jsonl']);   // Codex's staged addition
  assert.throws(() => apply({ key: K, cwd: r, source: head }), /not clean/);
  git(r, ['reset', '-q']); assert.throws(() => apply({ key: K, cwd: r, source: head }), /not clean/, 'untracked T1 file refused too');
  fs.rmSync(path.join(r, 'data/early-wave-obs.jsonl'));
  fs.appendFileSync(path.join(r, 'data/premarket.jsonl'), '{"x":1}\n'); assert.throws(() => apply({ key: K, cwd: r, source: head }), /not clean/);
  git(r, ['checkout', '-q', '--', 'data/premarket.jsonl']);
  fs.writeFileSync(path.join(r, 'note.txt'), 'x'); git(r, ['add', 'note.txt']); git(r, ['commit', '-q', '-m', 'later']);
  assert.throws(() => apply({ key: K, cwd: r, source: head }), /is not the approved source/);
  assert.equal(fs.existsSync(path.join(r, 'data/premarket.jsonl.sealed')), false); assert.equal(fs.existsSync(path.join(r, MANIFEST)), false);
});

test('Codex blocker 4: verification refuses zero files, a missing or extra sealed file, a changed one, and a commit rebased off the source', (t) => {
  const { r, head } = repo(t);
  assert.match(verifyTree('HEAD', { key: K, cwd: r }).problems.join(), /manifest missing, empty or inconsistent/, 'pre-migration tree (0 sealed) fails');
  const empty = repo(t); fs.rmSync(path.join(empty.r, 'data'), { recursive: true }); git(empty.r, ['add', '-A']); git(empty.r, ['commit', '-q', '-m', 'no data']);
  assert.throws(() => apply({ key: K, cwd: empty.r, source: git(empty.r, ['rev-parse', 'HEAD']).trim() }), /nothing to migrate/);
  migrateCommit(r, head);
  git(r, ['rm', '-q', 'data/premarket.jsonl.sealed']); git(r, ['commit', '-q', '-m', 'drop one']);
  assert.match(verifyTree('HEAD', { key: K, cwd: r }).problems.join(), /sealed copy missing: data\/premarket\.jsonl/);
  git(r, ['reset', '-q', '--hard', 'HEAD~1']);
  writeSealed(path.join(r, 'data/early-wave-obs.jsonl'), '{"later":1}\n', K); git(r, ['add', '-A']); git(r, ['commit', '-q', '-m', 'extra']);
  assert.match(verifyTree('HEAD', { key: K, cwd: r }).problems.join(), /sealed file not in the manifest: data\/early-wave-obs\.jsonl/);
  git(r, ['reset', '-q', '--hard', 'HEAD~1']);
  writeSealed(path.join(r, 'data/opp-ledger.jsonl'), 'changed\n', K); git(r, ['add', '-A']); git(r, ['commit', '-q', '--amend', '-m', 'R1 tampered']);
  assert.match(verifyTree('HEAD', { key: K, cwd: r }).problems.join(), /sealed copy differs from the source: data\/opp-ledger\.jsonl/);
  // rebased onto newer data: parent is no longer the approved source
  const b = repo(t); fs.writeFileSync(path.join(b.r, 'n.txt'), '1'); git(b.r, ['add', 'n.txt']); git(b.r, ['commit', '-q', '-m', 'n']);
  const src2 = b.head; git(b.r, ['checkout', '-q', src2]); apply({ key: K, cwd: b.r, source: src2 }); git(b.r, ['commit', '-q', '-m', 'R1']);
  const mig = git(b.r, ['rev-parse', 'HEAD']).trim(); git(b.r, ['checkout', '-q', 'main']); git(b.r, ['cherry-pick', mig]);
  assert.match(verifyTree('HEAD', { key: K, cwd: b.r }).problems.join(), /parent .* is not the approved source/);
});

test('interrupted migration: no commit, the guard refuses the partial state, a clean checkout of the source restarts', (t) => {
  const { r, head } = repo(t);
  const partial = spawnSync('node', ['-e', "import('./sealed-store.mjs').then(S=>{for(const f of ['data/opp-ledger.jsonl','data/premarket.jsonl'])S.writeSealed(f,require('fs').readFileSync(f));})"], { cwd: r, env: ENV, encoding: 'utf8' });
  assert.equal(partial.status, 0, partial.stderr);
  git(r, ['add', '-A', 'data']);
  assert.notEqual(spawnSync('node', ['sealed-guard.mjs', '--all'], { cwd: r, env: ENV }).status, 0);
  assert.throws(() => apply({ key: K, cwd: r, source: head }), /not clean/);
  git(r, ['reset', '-q', '--hard']); git(r, ['clean', '-fdq']);
  assert.equal(apply({ key: K, cwd: r, source: head }).length, T1N);
  assert.equal(spawnSync('node', ['sealed-guard.mjs', '--all'], { cwd: r, env: ENV }).status, 0);
});

test('Codex blocker 1: recovery export refuses the checkout by real path, symlink escapes, symlinks below it, and overwrites', (t) => {
  const { d, r, head } = repo(t); migrateCommit(r, head);
  assert.throws(() => exportTo(path.join(r, 'restore'), { key: K, cwd: r }), /outside the repository/);
  assert.throws(() => exportTo(path.dirname(r), { key: K, cwd: r }), /outside the repository/, 'an ancestor of the checkout is refused');
  const link = path.join(d, 'looks-outside'); fs.symlinkSync(r, link);   // Codex's reproduction: outside name, inside target
  assert.throws(() => exportTo(link, { key: K, cwd: r }), /outside the repository/);
  assert.throws(() => exportTo(path.join(link, 'sub'), { key: K, cwd: r }), /outside the repository/);
  assert.equal(fs.existsSync(path.join(r, 'data/options-shadow.json')), false, 'no plaintext recreated in the checkout');
  const out = path.join(d, 'restore'); fs.mkdirSync(path.join(out, 'data'), { recursive: true }); fs.symlinkSync(r, path.join(out, 'data', 'ignition-runs'));
  assert.throws(() => exportTo(out, { key: K, cwd: r }), /new or empty|symlink/);
  const out2 = path.join(d, 'restore2'); fs.mkdirSync(out2); fs.writeFileSync(path.join(out2, 'keep.txt'), 'x');
  assert.throws(() => exportTo(out2, { key: K, cwd: r }), /new or empty/, 'never writes into a non-empty folder');
  const ok = path.join(d, 'private-restore');
  assert.equal(exportTo(ok, { key: K, cwd: r }), T1N);
  assert.equal(fs.readFileSync(path.join(ok, 'data/opp-ledger.jsonl'), 'utf8'), FIX['data/opp-ledger.jsonl']);
  assert.equal(fs.statSync(path.join(ok, 'data/opp-ledger.jsonl')).mode & 0o777, 0o600);
  assert.throws(() => exportTo(ok, { key: K, cwd: r }), /new or empty/, 'a second export never overwrites');
});

test('CLI: --plan needs no key; --apply needs the key and the approved source; --verify-tree reports counts only', (t) => {
  const { r, head } = repo(t), run = (args, env = ENV) => spawnSync('node', ['sealed-migrate.mjs', ...args], { cwd: r, env, encoding: 'utf8' });
  const p = run(['--plan'], { ...ENV, SEALED_SECRET: '' }); assert.equal(p.status, 0); assert.match(p.stdout, /8 tracked T1 plaintext path\(s\)/);
  assert.match(run(['--apply', head], { ...ENV, SEALED_SECRET: '' }).stderr, /SEALED_KEY_MISSING/);
  assert.notEqual(run(['--apply']).status, 0);
  assert.equal(run(['--apply', head]).status, 0); git(r, ['commit', '-q', '-m', 'R1']);
  const v = run(['--verify-tree', 'HEAD']); assert.equal(v.status, 0); assert.match(v.stdout, /manifest 8, sealed T1 8, plaintext T1 0, problems 0/); assert.doesNotMatch(v.stdout + v.stderr, /ZZ[ABC]/);
  assert.notEqual(run(['--verify-tree', 'HEAD~1']).status, 0, 'the pre-migration commit fails verification');
});

test('Codex rev3 #3: deleting a sealed file AND its manifest entry no longer yields a clean receipt (expected set recomputed from the source)', (t) => {
  const { r, head } = repo(t); migrateCommit(r, head);
  const m = JSON.parse(fs.readFileSync(path.join(r, MANIFEST), 'utf8'));
  m.files = m.files.filter((f) => f.rel !== 'data/premarket.jsonl'); m.count = m.files.length;
  fs.writeFileSync(path.join(r, MANIFEST), JSON.stringify(m)); git(r, ['rm', '-q', 'data/premarket.jsonl.sealed']); git(r, ['add', '-A']);
  git(r, ['commit', '-q', '--amend', '-m', 'R1 (one file silently dropped)']);
  const v = verifyTree('HEAD', { key: K, cwd: r });
  assert.match(v.problems.join('\n'), /source file missing from the manifest: data\/premarket\.jsonl/);
  assert.match(v.problems.join('\n'), /manifest count 7 != source T1 plaintext count 8/);
  m.files[0].sha256 = '0'.repeat(64); fs.writeFileSync(path.join(r, MANIFEST), JSON.stringify(m)); git(r, ['commit', '-qam', 'hash forged']);
  assert.match(verifyTree('HEAD', { key: 'STRUCTURE_ONLY', cwd: r }).problems.join('\n'), /manifest size\/hash differs from the source file/, 'also caught by the keyless check');
});

test('Codex rev3 #2: a segmented ledger is exported ONCE as its logical file (base + segments), never duplicated by its segments', (t) => {
  const { d, r, head } = repo(t); migrateCommit(r, head);
  appendSealedLines(path.join(r, 'data/opp-ledger.jsonl'), [{ n: 'B' }], K, { day: '2026-01-03' }); appendSealedLines(path.join(r, 'data/opp-ledger.jsonl'), [{ n: 'C' }], K, { day: '2026-01-04' });
  appendSealedLines(path.join(r, 'data/movers-journal.jsonl'), [{ n: 'only-segment' }], K, { day: '2026-01-04' });
  git(r, ['add', '-A']); git(r, ['commit', '-q', '-m', 'appends']);
  const out = path.join(d, 'exp'); exportTo(out, { key: K, cwd: r });
  assert.equal(fs.readFileSync(path.join(out, 'data/opp-ledger.jsonl'), 'utf8'), FIX['data/opp-ledger.jsonl'] + '{"n":"B"}\n{"n":"C"}\n', 'A+B+C exactly once');
  assert.equal(fs.existsSync(path.join(out, 'data/opp-ledger.jsonl.d')), false, 'no segment files exported');
  assert.equal(fs.readFileSync(path.join(out, 'data/movers-journal.jsonl'), 'utf8'), '{"n":"only-segment"}\n', 'a ledger with segments only is exported too');
});

test('backup-key check vector: reveals neither value nor key; the right backup passes, any other secret fails; CLI exit codes', (t) => {
  const v = makeKeyCheck(K);
  assert.deepEqual(Object.keys(v).sort(), ['purpose', 'sealed', 'sha256', 'version']);
  assert.equal(checkKey(v, K), true); assert.equal(checkKey(v, sealedKey('a different secret')), false);
  assert.equal(checkKey({ ...v, sha256: '0'.repeat(64) }, K), false);
  assert.throws(() => makeKeyCheck(null), { code: 'SEALED_KEY_MISSING' });
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'kc-')); t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const f = path.join(d, 'vector.json'); fs.writeFileSync(f, JSON.stringify(v));
  const run = (secret) => spawnSync(process.execPath, [path.join(ROOT, 'sealed-migrate.mjs'), '--key-check', f], { env: { ...ENV, SEALED_SECRET: secret }, encoding: 'utf8' });
  assert.equal(run(SECRET).status, 0); assert.match(run(SECRET).stdout, /key check: PASS/);
  assert.equal(run('wrong-backup').status, 1); assert.match(run('wrong-backup').stdout, /key check: FAIL/);
  const mk = spawnSync(process.execPath, [path.join(ROOT, 'sealed-migrate.mjs'), '--key-check-make'], { env: ENV, encoding: 'utf8' });
  assert.match(mk.stdout, /^R1 KEY CHECK VECTOR \{/); assert.doesNotMatch(mk.stdout, new RegExp(SECRET));
});
