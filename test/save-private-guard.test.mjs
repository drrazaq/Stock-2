// P0 Route A (development): after the private-data cutover (marker) or once sealed (a rollback never removes it), the PUBLIC save never
// commits the owner's private files, even when private-data.sh pull has put current copies into data/; public files still save, a
// concurrent origin change still rebases, and the private repository's own save (SAVE_PRIVATE_REPO=1) keeps everything. Throw-away repos.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(import.meta.dirname, '..');
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
function world(marker) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'save-guard-')), origin = path.join(top, 'origin.git'), job = path.join(top, 'job'), other = path.join(top, 'other');
  g(top, 'init', '-q', '--bare', '-b', 'main', origin); g(top, 'clone', '-q', origin, job);
  fs.mkdirSync(path.join(job, '.github'), { recursive: true }); fs.mkdirSync(path.join(job, 'data'));
  for (const f of ['save-data.sh', 'merge-alert-state.mjs']) fs.copyFileSync(path.join(ROOT, '.github', f), path.join(job, '.github', f));
  fs.writeFileSync(path.join(job, '.github/private-files.txt'), '# list\nmy-positions.json\nsignals-private.json\n');
  fs.writeFileSync(path.join(job, 'data/my-positions.json'), '{"OLD":1}\n'); fs.writeFileSync(path.join(job, 'data/signals.json'), '{"v":0}\n');
  g(job, 'add', '-A'); g(job, 'commit', '-qm', 'base'); g(job, 'push', '-q', 'origin', 'HEAD:main'); g(job, 'branch', '-q', '--set-upstream-to=origin/main');
  g(top, 'clone', '-q', origin, other); fs.writeFileSync(path.join(other, 'data/other.json'), '{}\n'); g(other, 'add', '-A'); g(other, 'commit', '-qm', 'concurrent'); g(other, 'push', '-q');
  if (marker) { fs.writeFileSync(path.join(job, '.github', marker), 'on\n'); }
  // what private-data.sh pull does in private mode: current private copies land in data/
  fs.writeFileSync(path.join(job, 'data/my-positions.json'), '{"PRIVATE_NOW":1}\n'); fs.writeFileSync(path.join(job, 'data/signals-private.json'), '{"posVerdict":{}}\n');
  fs.writeFileSync(path.join(job, 'data/signals.json'), '{"v":1}\n');
  return { top, origin, job };
}
const run = (job, env = {}) => execFileSync('bash', ['.github/save-data.sh', 'scan test'], { cwd: job, encoding: 'utf8', env: { ...process.env, SAVE_SLEEP: '0', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', ...env } });
const atOrigin = (w, p) => { try { return g(w.top, '--git-dir', w.origin, 'show', 'main:' + p); } catch { return null; } };
for (const marker of ['private-data-mode', 'private-data-sealed']) test('public save with ' + marker + ': private files never published, public files and rebase still work', () => {
  const w = world(marker); try {
    run(w.job);
    assert.equal(atOrigin(w, 'data/my-positions.json'), '{"OLD":1}\n', 'the stale public copy is not replaced by the private one');
    assert.equal(atOrigin(w, 'data/signals-private.json'), null, 'the private scan record is never published');
    assert.equal(atOrigin(w, 'data/signals.json'), '{"v":1}\n'); assert.equal(atOrigin(w, 'data/other.json'), '{}\n', 'concurrent origin change kept (rebase ran)');
    assert.equal(fs.readFileSync(path.join(w.job, 'data/my-positions.json'), 'utf8'), '{"PRIVATE_NOW":1}\n', 'the job keeps its private working copy');
  } finally { fs.rmSync(w.top, { recursive: true, force: true }); }
});
test('before any cutover (no marker) the save is unchanged: everything in data/ is committed as today', () => {
  const w = world(null); try { run(w.job); assert.equal(atOrigin(w, 'data/my-positions.json'), '{"PRIVATE_NOW":1}\n'); } finally { fs.rmSync(w.top, { recursive: true, force: true }); }
});
test('the private repository save (SAVE_PRIVATE_REPO=1) keeps the private files even with the marker present', () => {
  const w = world('private-data-mode'); try { run(w.job, { SAVE_PRIVATE_REPO: '1' }); assert.equal(atOrigin(w, 'data/my-positions.json'), '{"PRIVATE_NOW":1}\n'); } finally { fs.rmSync(w.top, { recursive: true, force: true }); }
});
