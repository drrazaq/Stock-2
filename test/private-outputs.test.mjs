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
const pulled = (w) => { assert.equal(pd(w, 'check').status, 0); const r = pd(w, 'pull'); assert.equal(r.status, 0, r.stdout); fs.writeFileSync(path.join(w.run, 'private-pulled-ok'), '');
  assert.ok(fs.existsSync(path.join(w.run, 'private-baseline/RECEIPT')), 'the pull writes its immutable hydration receipt'); const a = po(w, 'admit', 'job'); assert.equal(a.status, 0, a.stdout); };
test('save outside private mode: explicit NOT DURABLE warning and summary, never a silent green, nothing published', () => {
  const w = world(false); const r = po(w, 'save', 'news');
  assert.equal(r.status, 0); assert.match(r.stdout, /::warning::news: owner-derived outputs are NOT published and NOT durable/); assert.match(R(w.run, 'summary.md'), /NOT DURABLE/);
});
test('save in private mode without a successful pull in this job: nothing pushed, fails', () => {
  const w = world(true); const r = po(w, 'save', 'news'); assert.equal(r.status, 1); assert.match(r.stdout, /not hydrated and admitted; nothing pushed/); assert.equal(remote(w, 'news-log.jsonl'), null);
});
test('save in private mode after a successful pull: verified private save', () => {
  const w = world(true); pulled(w); W(w.pub, 'data/news-log.jsonl', '{"old":1}\n{"new":2}\n');
  const r = po(w, 'save', 'news'); assert.equal(r.status, 0, r.stdout); assert.match(remote(w, 'news-log.jsonl'), /new/); assert.match(R(w.run, 'summary.md'), /stored privately \(verified\)/);
});
test('retain-failed without a successful pull: nothing quarantined or pushed (no stale owner files), fails', () => {
  const w = world(true); W(w.pub, 'data/news-log.jsonl', '{"partial":1}\n'); const r = po(w, 'retain-failed', 'news', 'news-log.jsonl');
  assert.equal(r.status, 1); assert.match(r.stdout, /UNRETAINED: this job was not hydrated and admitted/); assert.equal(R(w.pub, 'data/news-log.jsonl'), '{"partial":1}\n');
});
test('retain-failed after a successful pull: the changed output becomes private quarantine; the private canonical copy stays; step fails', () => {
  const w = world(true); pulled(w); const before = remote(w, 'news-log.jsonl'); W(w.pub, 'data/news-log.jsonl', '{"partial":1}\n');
  const r = po(w, 'retain-failed', 'news', 'news-log.jsonl', 'news-meta.json'); assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /1 changed outputs stored privately as UNRESOLVED quarantine \(not current state; no canonical file written\)/); assert.equal(remote(w, 'news-log.jsonl'), before, 'canonical private copy unchanged');
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
    for (const s of steps.filter(s => /private-outputs\.sh (save|retain-copy) /.test(s))) { n++;
      assert.match(s, /(?:\n        |^      - )env:\n(?:          [^\n]*\n)*?          PRIVATE_DATA_TOKEN: \$\{\{ secrets\.PRIVATE_DATA_TOKEN \}\}/, p + ': the save step has the private token');
      const after = s.slice(s.search(/private-outputs\.sh (save|retain-copy) /));
      assert.doesNotMatch(after, /\bnode\s+(?!\.github\/)[^\s|]+\.mjs/, p + ': a producer runs AFTER the private save in the same step (its outputs would not be saved)');
      assert.doesNotMatch(after.split(/git reset|git add|SAVE_GUARD_PHASE|for f in \$FILES/)[0], /(?:>\s*data\/|\bcp [^ ]+ data\/)/, p + ': a data file is written after the private save, before the publish');
      if (/LF=0/.test(s)) assert.match(s, /\[ "\$LF" = 0 \] \|\| exit 1/, p + ': a failed registry save fails the job');   // registry-only saves keep their failed copy inline (test/private-registry)
      if (!/PF=0/.test(s)) continue;
      assert.match(s, /\|\| PF=1[^\n]*\n          \[ "\$PF" != 1 \] \|\| \{[^\n]*exit 1; \}/, p + ': a failed private save stops IMMEDIATELY (before any reset/clean or registry merge)');
      if (/success\(\) \|\| failure\(\)|always\(\)/.test(s.split('\n')[0] + s.split('\n')[1])) assert.match(s, /else PF=2; [^\n]*retain-failed "/, p + ': a failed run in an always/failure step is retained BEFORE its reset/clean');
      assert.match(after, /\[ "\$PF" = 0 \] \|\| exit 1/, p + ': a failed private save fails the job');
      assert.match(y, /- if: failure\(\)\n\s+env:\n\s+PRIVATE_DATA_TOKEN[^\n]*\n\s+run: bash \.github\/private-outputs\.sh retain-failed/, p + ': failure retention step'); }
  }
  assert.ok(n >= 70, 'the contract covers every private save step (' + n + ')');
  for (const p of fs.readdirSync(dir).filter(f => f.endsWith('.yml'))) { const y = fs.readFileSync(path.join(dir, p), 'utf8'); if (!y.includes('private-outputs.sh')) continue;
    const pulls = (y.match(/private-data\.sh pull && touch/g) || []).length, admits = y.match(/\n      - name: Producer admission[^\n]*\n        if: hashFiles\('\.github\/private-data-mode'\) != ''\n        run: bash \.github\/private-outputs\.sh admit/g) || [];
    assert.equal(admits.length, pulls, p + ': every hydrated job records producer admission after its pull (and required-history check)'); }
});

// Codex 6853280425: retention compares against the IMMUTABLE hydration receipt, not the mutable clone that a failed save's copy changed.
test('retain-failed after a REJECTED save still sees the change (immutable receipt, not the mutable clone) and keeps it as quarantine', () => {
  const w = world(true); pulled(w); W(w.pub, 'data/news-log.jsonl', '{"NEW_OWNER_EVENT":1}\n');
  const hook = path.join(w.bare, 'hooks/pre-receive'); fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n'); fs.chmodSync(hook, 0o755);
  assert.equal(po(w, 'save', 'news').status, 1, 'the rejected save fails');
  const r = po(w, 'retain-failed', 'news', 'news-log.jsonl'); assert.equal(r.status, 1);
  assert.doesNotMatch(r.stdout, /changed no owner-derived output/); assert.match(r.stdout, /NOT DURABLE: the quarantine could not be stored privately/);
  const q = fs.readdirSync(path.join(w.pub, 'data')).filter(n => /^private-failed-pass-.*__news-log\.jsonl$/.test(n)); assert.equal(q.length, 1);
  assert.match(R(w.pub, 'data/' + q[0]), /NEW_OWNER_EVENT/, 'the unconfirmed bytes are kept on the runner as quarantine');
  fs.rmSync(hook); assert.equal(spawnSync('bash', ['.github/private-data.sh', 'push-quarantine'], { cwd: w.pub, encoding: 'utf8', env: { ...ENV0, PRIVATE_DATA_URL: w.bare, PRIVATE_DATA_DIR: w.dir, RUNNER_TEMP: w.run } }).status, 0, 'a later quarantine push stores it');
  assert.doesNotMatch(remote(w, 'news-log.jsonl'), /NEW_OWNER_EVENT/, 'the canonical private copy never takes the failed bytes');
});

// Codex 6853118258 / 6853280425: the ACTUAL agent-a-lab save block, local bare repositories only, all data synthetic.
function labWorld({ privateSettings }) {
  const pubBare = tmp('po-pubbare-'), pub = tmp('po-pubck-'), bare = tmp('po-priv-'), seed = tmp('po-seed-'), run = tmp('po-run-'), dir = path.join(run, 'private-data');
  sh('git init -q --bare -b main ' + pubBare, seed); sh('git init -q --bare -b main ' + bare, seed);
  sh('git init -q -b main && git remote add origin ' + pubBare, pub);
  for (const f of ['.github/private-data.sh', '.github/private-outputs.sh', '.github/private-files.txt', '.github/save-data.sh', '.github/merge-alert-state.mjs', '.github/save-privacy-guard.mjs', 'library-merge.mjs']) if (fs.existsSync(path.join(REPO, f))) W(pub, f, fs.readFileSync(path.join(REPO, f)));
  W(pub, '.github/private-data-mode', '');
  W(pub, 'data/my-positions.json', '{"AAA":{"entry":10}}\n'); W(pub, 'data/halal.json', '{}\n'); W(pub, 'data/settings.json', '{}\n');   // OLD public copies (history)
  W(pub, 'data/strategy-library.json', '{"strategies":[{"id":"PUBLIC_OLD"}]}\n'); W(pub, 'data/agent-a-lab.json', '{"old":1}\n');
  sh('git add -A && git -c commit.gpgsign=false commit -qm init && git push -q -u origin main', pub);
  W(seed, 'p/data/my-positions.json', '{"NEWER_PRIVATE":{"entry":20}}\n'); W(seed, 'p/data/halal.json', '{}\n'); if (privateSettings) W(seed, 'p/data/settings.json', '{}\n');
  W(seed, 'p/data/strategy-library.json', '{"strategies":[{"id":"PRIVATE_REG"}]}\n'); W(seed, 'p/data/agent-a-lab.json', '{"private":1}\n');
  sh('git init -q -b main && git add -A && git -c commit.gpgsign=false commit -qm s && git remote add origin ' + bare + ' && git push -q origin main', path.join(seed, 'p'));
  const env = { ...ENV0, PRIVATE_DATA_URL: bare, PRIVATE_DATA_DIR: dir, RUNNER_TEMP: run, PRIVATE_DATA_TOKEN: '' };
  return { pub, bare, run, env };
}
function saveBlock(file, label, success) {
  const y = fs.readFileSync(path.join(REPO, '.github/workflows', file), 'utf8'), k = y.indexOf('private-outputs.sh save "' + label + '"');
  const start = y.lastIndexOf('        run: |\n', k) + '        run: |\n'.length, end = y.indexOf('\n      - ', k);
  return y.slice(start, end).split('\n').map(l => l.slice(10)).join('\n').replaceAll('${{ success() }}', success ? 'true' : 'false');
}
const runBlock = (w, script) => spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', script], { cwd: w.pub, encoding: 'utf8', env: w.env });
const remoteAt = (bare, f) => { try { return sh('git --git-dir=' + bare + ' show main:data/' + f, os.tmpdir()); } catch { return null; } };
test('actual agent-a-lab save block after a FAILED pull (required private file missing): nothing is pushed privately; newer private holdings stay', () => {
  const w = labWorld({ privateSettings: false });
  const p = spawnSync('bash', ['.github/private-data.sh', 'pull'], { cwd: w.pub, encoding: 'utf8', env: w.env }); assert.equal(p.status, 1, 'the pull fails before the producer');   // no marker, no admission
  W(w.pub, 'data/agent-a-lab.json', '{"partial":1}\n');
  const r = runBlock(w, saveBlock('agent-a-lab.yml', 'agent-a-lab', false)); assert.notEqual(r.status, 0, 'the job stays failed');
  assert.match(remoteAt(w.bare, 'my-positions.json'), /NEWER_PRIVATE/, 'authoritative private holdings unchanged (actual before the fix: the old public holdings)');
  assert.equal(remoteAt(w.bare, 'settings.json'), null, 'a missing required private file is never filled from old public bytes');
  assert.equal(sh('git --git-dir=' + w.bare + ' rev-list --count main', os.tmpdir()).trim(), '1', 'no private commit at all');
  assert.match(r.stdout, /UNRETAINED: this job was not hydrated and admitted/);
});
test('actual agent-a-lab save block after a hydrated, admitted, FAILED producer: outputs and registry kept as quarantine only; canonical private files untouched despite the reset to old public copies', () => {
  const w = labWorld({ privateSettings: true });
  const p = spawnSync('bash', ['.github/private-data.sh', 'pull'], { cwd: w.pub, encoding: 'utf8', env: w.env }); assert.equal(p.status, 0, p.stdout); fs.writeFileSync(path.join(w.run, 'private-pulled-ok'), '');
  assert.equal(spawnSync('bash', ['.github/private-outputs.sh', 'admit'], { cwd: w.pub, encoding: 'utf8', env: w.env }).status, 0);
  W(w.pub, 'data/agent-a-lab.json', '{"partial":1}\n'); W(w.pub, 'data/strategy-library.json', '{"strategies":[{"id":"PRIVATE_REG"},{"id":"FAILED_RUN_EDIT"}]}\n');
  const r = runBlock(w, saveBlock('agent-a-lab.yml', 'agent-a-lab', false)); assert.notEqual(r.status, 0, 'the job stays failed');
  assert.match(remoteAt(w.bare, 'my-positions.json'), /NEWER_PRIVATE/); assert.match(remoteAt(w.bare, 'agent-a-lab.json'), /"private"/, 'canonical output unchanged');
  assert.doesNotMatch(remoteAt(w.bare, 'strategy-library.json'), /FAILED_RUN_EDIT|PUBLIC_OLD/, 'canonical registry unchanged');
  const names = sh('git --git-dir=' + w.bare + ' ls-tree -r --name-only main', os.tmpdir()).split('\n');
  assert.ok(names.some(n => /private-failed-pass-.*__agent-a-lab\.json$/.test(n)), 'failed output kept as quarantine');
  const reg = names.find(n => /private-failed-pass-.*__strategy-library\.json$/.test(n)); assert.ok(reg, 'failed registry kept as quarantine\n' + r.stdout + r.stderr); assert.match(remoteAt(w.bare, reg.slice(5)), /FAILED_RUN_EDIT/);
});
test('actual agent-a-lab save block: a FAILED private save stops before reset/clean and the registry merge (unconfirmed bytes stay for retention)', () => {
  const w = labWorld({ privateSettings: true });
  assert.equal(spawnSync('bash', ['.github/private-data.sh', 'pull'], { cwd: w.pub, encoding: 'utf8', env: w.env }).status, 0); fs.writeFileSync(path.join(w.run, 'private-pulled-ok'), '');
  spawnSync('bash', ['.github/private-outputs.sh', 'admit'], { cwd: w.pub, env: w.env });
  W(w.pub, 'data/agent-a-lab.json', '{"fresh":1}\n'); fs.copyFileSync(path.join(w.pub, 'data/strategy-library.json'), path.join(w.run, 'library-base.json'));
  const hook = path.join(w.bare, 'hooks/pre-receive'); fs.writeFileSync(hook, '#!/bin/sh\nexit 1\n'); fs.chmodSync(hook, 0o755);
  const r = runBlock(w, saveBlock('agent-a-lab.yml', 'agent-a-lab', true)); assert.equal(r.status, 1);
  assert.match(r.stdout, /stopping BEFORE any reset\/clean/); assert.equal(R(w.pub, 'data/agent-a-lab.json'), '{"fresh":1}\n', 'the unconfirmed output is still in place');
  assert.doesNotMatch(r.stdout, /registry merged|registry merge/, 'no registry merge after a failed save');
});

test('no workflow uploads a private file, private directory, private-* cache or runtime owner state as an artifact (public-repo artifacts are downloadable)', () => {
  const dir = path.join(REPO, '.github/workflows'), priv = fs.readFileSync(path.join(REPO, '.github/private-files.txt'), 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
  const isPriv = (p) => { const r = p.replace(/^\.\//, ''); if (r.startsWith('runtime/') || r === 'data' || r === 'data/' || /^data\/\*/.test(r)) return true; if (!r.startsWith('data/')) return false; const n = r.slice(5);
    return n.startsWith('private-') || priv.some(e => e.endsWith('/') ? (n === e || n === e.slice(0, -1) || n.startsWith(e)) : n === e || n.startsWith(e + '.')) || ['shadow', 'ignition-runs', 'shadow-outcomes'].some(d => n === d || n.startsWith(d + '/')); };
  for (const p of fs.readdirSync(dir).filter(f => f.endsWith('.yml'))) { const y = fs.readFileSync(path.join(dir, p), 'utf8');
    for (const m of y.matchAll(/uses: actions\/upload-artifact@[^\n]*\n(?:\s+[^\n]*\n)*?\s+path: (\|\n(?:\s{12,}[^\n]*\n)+|[^\n]+)/g)) {
      const paths = m[1].replace(/^\|\n/, '').split('\n').map(x => x.trim()).filter(Boolean);
      for (const x of paths) assert.ok(!isPriv(x), p + ': artifact path ' + x + ' is private'); } }
});
