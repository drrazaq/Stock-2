// R1 migration (sealed-migrate.mjs): synthetic throw-away repositories only. Plan, apply, verify, interruption, refusal, recovery.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sealedKey, readSealedText, readSealed } from '../sealed-store.mjs';
import { plan, apply, verifyTree, exportTo } from '../sealed-migrate.mjs';

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
  fs.mkdirSync(path.join(r, 'data/shadow'), { recursive: true });
  fs.writeFileSync(path.join(r, 'data/shadow/2026-01-02.jsonl.gz'), zlib.gzipSync('{"bid":1.1}\n'));
  git(r, ['add', '-A']); git(r, ['commit', '-q', '-m', 'base']);
  return { d, r };
}
const T1N = 8;

test('plan: exactly the tracked T1 plaintext paths (no key needed); neighbours untouched', (t) => {
  const { r } = repo(t);
  assert.deepEqual(plan(r), ['data/ignition-live.json', 'data/ignition-runs/2026-01-02/1-1-progress.json', 'data/ignition-runs/2026-01-02/1-1.json', 'data/opp-ledger.jsonl',
    'data/options-shadow.json', 'data/options-spread-survey.md', 'data/premarket.jsonl', 'data/shadow/2026-01-02.jsonl.gz']);
});

test('apply: one verified staged change; commit has ciphertext only; history keeps the old plaintext (not rewritten)', (t) => {
  const { r } = repo(t);
  const done = apply({ key: K, cwd: r });
  assert.equal(done.length, T1N);
  assert.equal(git(r, ['diff', '--cached', '--name-status']).split('\n').filter((l) => /^D\t/.test(l)).length, T1N, 'every plaintext deletion staged');
  git(r, ['commit', '-q', '-m', 'R1']);
  const v = verifyTree('HEAD', { key: K, cwd: r });
  assert.deepEqual(v.plaintextT1, []); assert.equal(v.sealedT1, T1N); assert.deepEqual(v.unreadable, []);
  assert.equal(readSealedText(path.join(r, 'data/opp-ledger.jsonl'), K), FIX['data/opp-ledger.jsonl']);
  assert.equal(zlib.gunzipSync(readSealed(path.join(r, 'data/shadow/2026-01-02.jsonl.gz'), K)).toString(), '{"bid":1.1}\n');
  assert.equal(fs.readFileSync(path.join(r, 'data/signals.json'), 'utf8'), '{"ok":1}', 'non-T1 untouched');
  assert.match(git(r, ['show', 'HEAD~1:data/opp-ledger.jsonl']), /ZZA/, 'earlier commit still holds plaintext: R1 does not remove history');
  assert.doesNotMatch(git(r, ['log', '-p', '-1', '--', 'data/opp-ledger.jsonl.sealed']), /ZZA/);
  assert.deepEqual(apply({ key: K, cwd: r }), [], 'idempotent: nothing left to do');
});

test('refusals: no key; a working copy that differs from the commit; nothing committed and plaintext stays', (t) => {
  const { r } = repo(t);
  assert.throws(() => apply({ key: null, cwd: r }), { code: 'SEALED_KEY_MISSING' });
  fs.appendFileSync(path.join(r, 'data/premarket.jsonl'), '{"unreviewed":1}\n');
  assert.throws(() => apply({ key: K, cwd: r }), /working copy differs from the committed file: data\/premarket\.jsonl/);
  assert.equal(git(r, ['rev-list', '--count', 'HEAD']).trim(), '1');
  assert.ok(fs.existsSync(path.join(r, 'data/premarket.jsonl')));
});

test('interrupted migration (killed mid-way): no commit, partial tree refused by the guard, a fresh checkout restarts cleanly', (t) => {
  const { d, r } = repo(t);
  // simulate a crash after some files were sealed: seal two by hand, leave the rest
  const partial = spawnSync('node', ['-e', "import('./sealed-store.mjs').then(S=>{for(const f of ['data/opp-ledger.jsonl','data/premarket.jsonl']){S.writeSealed(f,require('fs').readFileSync(f));}})"], { cwd: r, env: ENV, encoding: 'utf8' });
  assert.equal(partial.status, 0, partial.stderr);
  git(r, ['add', '-A', 'data']);
  assert.notEqual(spawnSync('node', ['sealed-guard.mjs', '--all'], { cwd: r, env: ENV }).status, 0, 'partial state is not publishable as "migrated"');
  git(r, ['reset', '-q', '--hard']); git(r, ['clean', '-fdq']);
  assert.equal(apply({ key: K, cwd: r }).length, T1N, 'restart from a clean checkout completes');
  assert.equal(spawnSync('node', ['sealed-guard.mjs', '--all'], { cwd: r, env: ENV }).status, 0);
});

test('a pre-existing sealed copy that does not match the plaintext stops the migration', (t) => {
  const { r } = repo(t);
  fs.writeFileSync(path.join(r, 'data/ignition-live.json.sealed'), Buffer.from('S2SEAL'));   // not a valid sealed file for that path
  assert.throws(() => apply({ key: K, cwd: r }), (e) => /SEALED_UNREADABLE|existing sealed copy differs/.test(e.code + ' ' + e.message));
  assert.ok(fs.existsSync(path.join(r, 'data/ignition-live.json')), 'plaintext kept');
});

test('recovery export writes only OUTSIDE the repository (recovery never re-publishes plaintext here)', (t) => {
  const { d, r } = repo(t); apply({ key: K, cwd: r }); git(r, ['commit', '-q', '-m', 'R1']);
  assert.throws(() => exportTo(path.join(r, 'restore'), { key: K, cwd: r }), /outside the repository/);
  assert.throws(() => exportTo(r, { key: K, cwd: r }), /outside the repository/);
  const out = path.join(d, 'private-restore');
  assert.equal(exportTo(out, { key: K, cwd: r }), T1N);
  assert.equal(fs.readFileSync(path.join(out, 'data/opp-ledger.jsonl'), 'utf8'), FIX['data/opp-ledger.jsonl']);
});

test('CLI: --plan needs no key; --apply without a key stops; --verify-tree reports counts only', (t) => {
  const { r } = repo(t), run = (args, env = ENV) => spawnSync('node', ['sealed-migrate.mjs', ...args], { cwd: r, env, encoding: 'utf8' });
  const p = run(['--plan'], { ...ENV, SEALED_SECRET: '' }); assert.equal(p.status, 0); assert.match(p.stdout, /8 tracked T1 plaintext path\(s\)/);
  const n = run(['--apply'], { ...ENV, SEALED_SECRET: '' }); assert.notEqual(n.status, 0); assert.match(n.stderr, /SEALED_KEY_MISSING/);
  assert.equal(run(['--apply']).status, 0); git(r, ['commit', '-q', '-m', 'R1']);
  const v = run(['--verify-tree', 'HEAD']); assert.equal(v.status, 0); assert.match(v.stdout, /plaintext T1 0, sealed T1 8, unreadable 0/); assert.doesNotMatch(v.stdout + v.stderr, /ZZ[ABC]/);
  assert.notEqual(run(['--verify-tree', 'HEAD~1']).status, 0, 'the pre-migration commit fails verification');
});
