// .github/private-outputs.sh: the failure contract for workflow producers with owner-derived outputs (Codex 6852749074). Local throw-away
// repositories only. Never a silent green: outside private mode the outcome is an explicit NOT DURABLE warning; nothing is pushed unless
// this job's private pull succeeded; a failed producer's changed outputs become private quarantine (never current state; the private
// canonical copy stays as it was) and the step still fails.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
const REPO = path.resolve(import.meta.dirname, '..');
const ENV0 = { PATH: process.env.PATH, HOME: process.env.HOME, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', SAVE_SLEEP: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const sh = (cmd, cwd) => execSync(cmd, { cwd, env: ENV0, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const W = (dir, f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };
const R = (dir, f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return null; } };
function world(privateMode) {
  const pub = tmp('po-pub-'), bare = tmp('po-priv-'), seed = tmp('po-seed-'), run = tmp('po-run-'), dir = path.join(run, 'private-data');
  for (const f of ['.github/private-data.sh', '.github/private-outputs.sh', '.github/private-files.txt', '.github/save-data.sh', '.github/merge-alert-state.mjs', '.github/save-privacy-guard.mjs']) W(pub, f, fs.readFileSync(path.join(REPO, f)));
  if (privateMode) W(pub, '.github/private-data-mode', '');
  W(pub, 'data/my-positions.json', '{"AAA":{"entry":10}}\n'); W(pub, 'data/halal.json', '{"AAA":{"s":"ok"}}\n'); W(pub, 'data/settings.json', '{}\n'); W(pub, 'data/news-log.jsonl', '{"old":1}\n');
  sh('git init -q --bare -b main ' + bare, seed); sh('git init -q -b main && echo x > README.md && git add -A && git -c commit.gpgsign=false commit -qm init && git remote add origin ' + bare + ' && git push -q origin main', seed);
  return { pub, bare, dir, run, summary: path.join(run, 'summary.md') };
}
const pd = (w, mode) => spawnSync('bash', ['.github/private-data.sh', mode], { cwd: w.pub, encoding: 'utf8', env: { ...ENV0, PRIVATE_DATA_URL: w.bare, PRIVATE_DATA_DIR: w.dir, RUNNER_TEMP: w.run } });
const po = (w, ...a) => spawnSync('bash', ['.github/private-outputs.sh', ...a], { cwd: w.pub, encoding: 'utf8', env: { ...ENV0, PRIVATE_DATA_URL: w.bare, PRIVATE_DATA_DIR: w.dir, RUNNER_TEMP: w.run, GITHUB_STEP_SUMMARY: path.join(w.run, 'summary.md') } });
const remote = (w, f) => { try { return sh('git --git-dir=' + w.bare + ' show main:data/' + f, os.tmpdir()); } catch { return null; } };
const pulled = (w) => { assert.equal(pd(w, 'check').status, 0); const r = pd(w, 'pull'); assert.equal(r.status, 0, r.stdout); fs.writeFileSync(path.join(w.run, 'private-pulled-ok'), ''); };
test('save outside private mode: explicit NOT DURABLE warning and summary, never a silent green, nothing published', () => {
  const w = world(false); const r = po(w, 'save', 'news');
  assert.equal(r.status, 0); assert.match(r.stdout, /::warning::news: owner-derived outputs are NOT published and NOT durable/); assert.match(R(w.run, 'summary.md'), /NOT DURABLE/);
});
test('save in private mode without a successful pull in this job: nothing pushed, fails', () => {
  const w = world(true); const r = po(w, 'save', 'news'); assert.equal(r.status, 1); assert.match(r.stdout, /private pull did not succeed/); assert.equal(remote(w, 'news-log.jsonl'), null);
});
test('save in private mode after a successful pull: verified private save', () => {
  const w = world(true); pulled(w); W(w.pub, 'data/news-log.jsonl', '{"old":1}\n{"new":2}\n');
  const r = po(w, 'save', 'news'); assert.equal(r.status, 0, r.stdout); assert.match(remote(w, 'news-log.jsonl'), /new/); assert.match(R(w.run, 'summary.md'), /stored privately \(verified\)/);
});
test('retain-failed without a successful pull: nothing quarantined or pushed (no stale owner files), fails', () => {
  const w = world(true); W(w.pub, 'data/news-log.jsonl', '{"partial":1}\n'); const r = po(w, 'retain-failed', 'news', 'news-log.jsonl');
  assert.equal(r.status, 1); assert.match(r.stdout, /private pull had not succeeded: nothing retained or pushed/); assert.equal(R(w.pub, 'data/news-log.jsonl'), '{"partial":1}\n');
});
test('retain-failed after a successful pull: the changed output becomes private quarantine; the private canonical copy stays; step fails', () => {
  const w = world(true); pulled(w); const before = remote(w, 'news-log.jsonl'); W(w.pub, 'data/news-log.jsonl', '{"partial":1}\n');
  const r = po(w, 'retain-failed', 'news', 'news-log.jsonl', 'news-meta.json'); assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /1 changed outputs stored privately as UNRESOLVED quarantine/); assert.equal(remote(w, 'news-log.jsonl'), before, 'canonical private copy unchanged');
  const q = sh('git --git-dir=' + w.bare + ' ls-tree -r --name-only main', os.tmpdir()).split('\n').filter(n => /private-failed-pass-.*__news-log\.jsonl$/.test(n)); assert.equal(q.length, 1);
  assert.equal(R(w.pub, 'data/news-log.jsonl'), null, 'the partial output is no longer at its canonical name');
});
test('retain-failed outside private mode: quarantined on the runner, explicitly NOT DURABLE, fails', () => {
  const w = world(false); fs.writeFileSync(path.join(w.run, 'private-pulled-ok'), ''); W(w.pub, 'data/news-log.jsonl', '{"partial":1}\n');
  const r = po(w, 'retain-failed', 'news', 'news-log.jsonl'); assert.equal(r.status, 1); assert.match(r.stdout, /::warning::news: failed producer output quarantined on this runner but NOT durable/);
});
test('workflows: producers save through the contract, steps that also run on failure save only on success, and each has a failure retention step', () => {
  for (const w of ['news', 'options-survey', 'account-replay', 'agent-a-lab', 'leaders-study', 'event-orb-retest-research']) { const y = fs.readFileSync(path.join(REPO, '.github/workflows', w + '.yml'), 'utf8');
    assert.match(y, /private-outputs\.sh save/, w); assert.match(y, /- if: failure\(\)\n\s+env:\n\s+PRIVATE_DATA_TOKEN[^\n]*\n\s+run: bash \.github\/private-outputs\.sh retain-failed/, w);
    const k = y.indexOf('private-outputs.sh save'), stepStart = y.lastIndexOf('\n      - ', k), cond = y.slice(stepStart, y.indexOf('\n', stepStart + 1) + 200);
    if (/always\(\)|failure\(\)/.test(cond)) assert.match(y.slice(k - 200, k), /\$\{\{ success\(\) \}\}/, w + ': save only on success'); }
  for (const p of fs.readdirSync(path.join(REPO, '.github/workflows'))) { const y = fs.readFileSync(path.join(REPO, '.github/workflows', p), 'utf8');
    if (y.includes('run: bash .github/private-data.sh pull')) assert.match(y, /private-data\.sh pull && touch "\$RUNNER_TEMP\/private-pulled-ok"/, p + ': pull writes the marker'); }
});

test('every private producer save (all classes): token in its own step env, saved AFTER the producer and after in-step data writes, failure is visible, retention step present, no duplicate step keys', () => {
  const dir = path.join(REPO, '.github/workflows'); let n = 0;
  for (const p of fs.readdirSync(dir).filter(f => f.endsWith('.yml'))) { const y = fs.readFileSync(path.join(dir, p), 'utf8');
    const steps = y.split(/\n(?=      - )/);
    for (const s of steps.filter(s => s.startsWith("      - "))) { const keys = [...s.matchAll(/^(?:      - |        )([a-z][a-z-]*):/gm)].map(m => m[1]);
      for (const k of new Set(keys)) assert.equal(keys.filter(x => x === k).length, 1, p + ': duplicate step key ' + k + ' (a later key silently replaces the earlier one)'); }
    for (const s of steps.filter(s => /private-outputs\.sh save /.test(s))) { n++;
      assert.match(s, /(?:\n        |^      - )env:\n(?:          [^\n]*\n)*?          PRIVATE_DATA_TOKEN: \$\{\{ secrets\.PRIVATE_DATA_TOKEN \}\}/, p + ': the save step has the private token');
      const after = s.slice(s.indexOf('private-outputs.sh save '));
      assert.doesNotMatch(after, /\bnode\s+(?!\.github\/)[^\s|]+\.mjs/, p + ': a producer runs AFTER the private save in the same step (its outputs would not be saved)');
      assert.doesNotMatch(after.split(/git reset|git add|SAVE_GUARD_PHASE|for f in \$FILES/)[0], /(?:>\s*data\/|\bcp [^ ]+ data\/)/, p + ': a data file is written after the private save, before the publish');
      if (/LF=0/.test(s)) assert.match(s, /\[ "\$LF" = 0 \] \|\| exit 1/, p + ': a failed registry save fails the job');   // registry-only saves keep their failed copy inline (test/private-registry)
      if (!/PF=0/.test(s)) continue;
      assert.match(after, /\[ "\$PF" = 0 \] \|\| exit 1/, p + ': a failed private save fails the job');
      assert.match(y, /- if: failure\(\)\n\s+env:\n\s+PRIVATE_DATA_TOKEN[^\n]*\n\s+run: bash \.github\/private-outputs\.sh retain-failed/, p + ': failure retention step'); }
  }
  assert.ok(n >= 60, 'the contract covers every private save step (' + n + ')');
});
