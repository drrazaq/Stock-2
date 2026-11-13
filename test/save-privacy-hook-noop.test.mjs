// The actual pre-push hook on a push that updates no ref. Git runs pre-push even when everything is up to date, with EMPTY stdin; many
// lab workflows run `git pull --rebase && git push` whether or not they committed. Nothing is transmitted in that case, so the hook
// must let it pass, while any push that does update a ref keeps the full check. Disposable local Git fixtures only; no network.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(import.meta.dirname, '..');
const env = { PATH: process.env.PATH, HOME: os.tmpdir(), GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'fixture', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'fixture', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' };
const git = (cwd, ...a) => execFileSync('git', a, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
function world() { const top = fs.mkdtempSync(path.join(os.tmpdir(), 'privacy-hook-noop-')), remote = path.join(top, 'remote.git'), job = path.join(top, 'job');
  git(top, 'init', '-q', '--bare', '-b', 'main', remote); git(top, 'clone', '-q', remote, job); fs.mkdirSync(path.join(job, 'data')); fs.mkdirSync(path.join(job, '.github/hooks'), { recursive: true });
  for (const f of ['save-privacy-guard.mjs', 'hooks/pre-push', 'private-files.txt']) fs.copyFileSync(path.join(ROOT, '.github', f), path.join(job, '.github', f));
  fs.chmodSync(path.join(job, '.github/hooks/pre-push'), 0o755); fs.writeFileSync(path.join(job, 'data/signals.json'), 'public0');
  git(job, 'add', '.'); git(job, 'commit', '-qm', 'seed'); git(job, 'push', '-qu', 'origin', 'main');
  execFileSync('bash', ['-c', 'test -x .github/hooks/pre-push && git config core.hooksPath .github/hooks'], { cwd: job, env });   // the exact workflow step
  return { top, remote, job }; }
test('an up-to-date push (nothing committed) passes through the actual hook, as in the lab save loops', () => {
  const w = world(); try {
    execFileSync('bash', ['-c', 'git diff --cached --quiet || git commit -m x; ok=0; for i in 1 2; do if git pull -q --rebase && git push -q; then ok=1; break; fi; done; [ "$ok" = 1 ]'], { cwd: w.job, env, stdio: ['ignore', 'pipe', 'pipe'] });
  } finally { fs.rmSync(w.top, { recursive: true, force: true }); } });
test('a push that does update main still runs the full check (private listed file refused)', () => {
  const w = world(); try { const before = git(w.top, '--git-dir', w.remote, 'rev-parse', 'main');
    fs.writeFileSync(path.join(w.job, 'data/my-positions.json'), 'synthetic-only-private'); git(w.job, 'add', '--', 'data/my-positions.json'); git(w.job, 'commit', '-qm', 'x');
    assert.throws(() => git(w.job, 'push', '-q')); assert.equal(git(w.top, '--git-dir', w.remote, 'rev-parse', 'main'), before);
  } finally { fs.rmSync(w.top, { recursive: true, force: true }); } });
