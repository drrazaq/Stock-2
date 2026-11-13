// Private DIRECTORY route (Codex 6853502834) and the fresh-runner listing fix: .github/private-data.sh expands exactly three allowlisted
// directory entries (shadow/, ignition-runs/, shadow-outcomes/) to their regular files on both sides, refuses symlinks, special files,
// unsafe path parts and unlisted directories, stops on the admission bound without pruning, and re-lists after the private clone is
// opened so a fresh runner installs every private-* and directory file. Local throw-away repositories only; all data synthetic.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
const REPO = path.resolve(import.meta.dirname, '..');
const ENV0 = { PATH: process.env.PATH, HOME: process.env.HOME, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', SAVE_SLEEP: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const sh = (cmd, cwd) => execSync(cmd, { cwd, env: ENV0, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const W = (dir, f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };
const R = (dir, f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return null; } };
const DIRS = 'shadow/\nignition-runs/\nshadow-outcomes/\n';
function world({ priv = {}, manifestExtra = DIRS } = {}) {
  const pub = tmp('pd-pub-'), bare = tmp('pd-priv-'), seed = tmp('pd-seed-'), run = tmp('pd-run-'), dir = path.join(run, 'private-data');
  for (const f of ['.github/private-data.sh', '.github/private-outputs.sh', '.github/save-data.sh', '.github/save-privacy-guard.mjs', '.github/merge-alert-state.mjs']) W(pub, f, fs.readFileSync(path.join(REPO, f)));
  W(pub, '.github/private-files.txt', fs.readFileSync(path.join(REPO, '.github/private-files.txt'), 'utf8') + '# directory entries (fixture)\n' + manifestExtra);
  W(pub, '.github/private-data-mode', ''); W(pub, 'data/.keep', '');
  const base = { 'data/my-positions.json': '{}\n', 'data/halal.json': '{}\n', 'data/settings.json': '{}\n', ...priv };
  sh('git init -q --bare -b main ' + bare, seed); for (const [f, v] of Object.entries(base)) W(seed, f, v);
  sh('git init -q -b main && git add -A && git -c commit.gpgsign=false commit -qm s && git remote add origin ' + bare + ' && git push -q origin main', seed);
  const env = { ...ENV0, PRIVATE_DATA_URL: bare, PRIVATE_DATA_DIR: dir, RUNNER_TEMP: run };
  return { pub, bare, run, env, pd: (m, extra = {}) => spawnSync('bash', ['.github/private-data.sh', m], { cwd: pub, encoding: 'utf8', env: { ...env, ...extra } }) };
}
test('fresh runner: pull installs private-* caches and every file of the private directories (listing re-run after the clone opens)', () => {
  const w = world({ priv: { 'data/private-models.json': '{"P":1}\n', 'data/private-signals.json': '{"S":1}\n', 'data/shadow/2026-11-12.jsonl.gz': 'gz', 'data/ignition-runs/2026-11-12/r1-progress.json': '{"r":1}\n', 'data/shadow-outcomes/2026-11-12.json.gz': 'o' } });
  const r = w.pd('pull'); assert.equal(r.status, 0, r.stdout);
  for (const f of ['private-models.json', 'private-signals.json', 'shadow/2026-11-12.jsonl.gz', 'ignition-runs/2026-11-12/r1-progress.json', 'shadow-outcomes/2026-11-12.json.gz']) assert.ok(R(w.pub, 'data/' + f) !== null, 'installed: ' + f);
  assert.ok(fs.existsSync(path.join(w.run, 'private-baseline/data/ignition-runs/2026-11-12/r1-progress.json')), 'nested files are in the immutable receipt');
});
test('a local directory file absent privately is set aside under a flat private-stale name (never used as current, never a nested stale path)', () => {
  const w = world(); W(w.pub, 'data/shadow/2026-10-01.jsonl.gz', 'old');
  const r = w.pd('pull'); assert.equal(r.status, 0, r.stdout);
  assert.equal(R(w.pub, 'data/shadow/2026-10-01.jsonl.gz'), null); assert.equal(R(w.pub, 'data/private-stale-shadow__2026-10-01.jsonl.gz'), 'old');
});
for (const [name, setup, re] of [
  ['a symlink inside a private directory', (w) => { fs.mkdirSync(path.join(w.pub, 'data/shadow'), { recursive: true }); fs.symlinkSync('/etc/hostname', path.join(w.pub, 'data/shadow/x.json')); }, /symlink or special file; refusing/],
  ['the private directory itself as a symlink', (w) => { fs.mkdirSync(path.join(w.pub, 'elsewhere')); fs.symlinkSync(path.join(w.pub, 'elsewhere'), path.join(w.pub, 'data/shadow')); }, /data\/shadow is a symlink; refusing/],
  ['an unsafe path part', (w) => W(w.pub, 'data/shadow/bad name.json', 'x'), /unsafe path under data\/shadow; refusing/],
]) test('refused before anything is copied: ' + name, () => {
  const w = world({ priv: { 'data/shadow/a.json': 'a' } }); setup(w); const r = w.pd('pull');
  assert.equal(r.status, 1); assert.match(r.stdout, re); assert.equal(R(w.pub, 'data/my-positions.json'), null, 'nothing installed');
});
test('only the three allowlisted directory entries are accepted', () => {
  const w = world({ manifestExtra: DIRS + 'news/\n' }); const r = w.pd('pull'); assert.equal(r.status, 1); assert.match(r.stdout, /directory entry news\/ is not one of the allowlisted private directories/);
});
test('admission bound: a directory over the declared bound stops the operation; nothing is pruned or truncated', () => {
  const w = world({ priv: { 'data/shadow/a.json': 'a', 'data/shadow/b.json': 'b', 'data/shadow/c.json': 'c' } });
  W(w.pub, 'data/shadow/local.json', 'keep');
  const r = w.pd('pull', { PRIVATE_DIR_MAX_FILES: '2' }); assert.equal(r.status, 1); assert.match(r.stdout, /ADMISSION: data\/shadow holds 3 files .*\(nothing pruned or truncated\)/);
  assert.equal(R(w.pub, 'data/shadow/local.json'), 'keep'); assert.equal(sh('git --git-dir=' + w.bare + ' ls-tree -r --name-only main', os.tmpdir()).split('\n').filter(n => n.startsWith('data/shadow/')).length, 3, 'private copy untouched');
});
test('retain-failed on a nested directory output: flat quarantine name, stored by quarantine-only push, canonical private file unchanged', () => {
  const w = world({ priv: { 'data/ignition-runs/2026-11-12/r1-progress.json': '{"r":1}\n' } });
  assert.equal(w.pd('pull').status, 0); fs.writeFileSync(path.join(w.run, 'private-pulled-ok'), '');
  const po = (...a) => spawnSync('bash', ['.github/private-outputs.sh', ...a], { cwd: w.pub, encoding: 'utf8', env: w.env });
  assert.equal(po('admit').status, 0); W(w.pub, 'data/ignition-runs/2026-11-12/r1-progress.json', '{"r":2,"partial":true}\n');
  const r = po('retain-failed', 'watcher', 'ignition-runs/2026-11-12/r1-progress.json'); assert.equal(r.status, 1); assert.match(r.stdout, /1 changed outputs stored privately as UNRESOLVED quarantine/);
  const names = sh('git --git-dir=' + w.bare + ' ls-tree -r --name-only main', os.tmpdir()).split('\n');
  assert.ok(names.some(n => /^data\/private-failed-pass-[^/]+__ignition-runs__2026-11-12__r1-progress\.json$/.test(n)));
  assert.equal(sh('git --git-dir=' + w.bare + ' show main:data/ignition-runs/2026-11-12/r1-progress.json', os.tmpdir()), '{"r":1}\n');
});
test('two-pass runner: a listed directory makes its root and every descendant private (prefix rule)', async () => {
  const { isPrivate } = await import('../scan-passes.mjs');
  const listed = fs.readFileSync(path.join(REPO, '.github/private-files.txt'), 'utf8').split('\n').map(l => l.trim());
  for (const d of ['shadow', 'ignition-runs', 'shadow-outcomes']) { assert.ok(listed.includes(d + '/'), 'the REAL manifest declares ' + d + '/'); assert.ok(isPrivate(d)); assert.ok(isPrivate(d + '/2026-11-12/x.json')); }
  assert.equal(listed.filter(l => l.endsWith('/')).length, 3, 'exactly three directory entries');
  assert.ok(!isPrivate('shadowx.json') && !isPrivate('shadow-report-public.json'), 'no accidental prefix match without the slash');
});

test('push round trip through the real save guard: nested directory files are stored and content-verified privately', () => {
  const w = world({ manifestExtra: '' });   // the real manifest already declares the three directories
  assert.equal(w.pd('pull').status, 0); W(w.pub, 'data/ignition-runs/2026-11-13/r2-delivery.json', '{"d":1}\n'); W(w.pub, 'data/shadow/2026-11-13.jsonl.gz', 'gz2');
  const r = w.pd('push'); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(r.stdout, /private save verified/);
  assert.equal(sh('git --git-dir=' + w.bare + ' show main:data/ignition-runs/2026-11-13/r2-delivery.json', os.tmpdir()), '{"d":1}\n');
  assert.equal(sh('git --git-dir=' + w.bare + ' show main:data/shadow/2026-11-13.jsonl.gz', os.tmpdir()), 'gz2');
});
test('retain-failed with a directory argument quarantines every changed file under it (flat names), never a symlinked directory', () => {
  const w = world({ manifestExtra: '', priv: { 'data/shadow/a.jsonl.gz': 'A' } });
  assert.equal(w.pd('pull').status, 0); fs.writeFileSync(path.join(w.run, 'private-pulled-ok'), '');
  const po = (...a) => spawnSync('bash', ['.github/private-outputs.sh', ...a], { cwd: w.pub, encoding: 'utf8', env: w.env });
  assert.equal(po('admit').status, 0); W(w.pub, 'data/shadow/b.jsonl.gz', 'B-partial');
  const r = po('retain-failed', 'watcher', 'shadow/'); assert.match(r.stdout, /1 changed outputs stored privately/);
  assert.equal(R(w.pub, 'data/shadow/a.jsonl.gz'), 'A', 'unchanged file stays');
  assert.ok(fs.readdirSync(path.join(w.pub, 'data')).some(n => /^private-failed-pass-.*__shadow__b\.jsonl\.gz$/.test(n)));
});
