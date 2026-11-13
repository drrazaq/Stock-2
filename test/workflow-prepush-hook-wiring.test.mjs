// P0 Route A: every workflow job that publishes (git push, or the shared save-data.sh) installs the repository pre-push privacy hook
// (.github/hooks/pre-push, Codex's contract 6851131591) right after each checkout and before its first push, fail-closed if the hook is
// missing; nothing bypasses it (--no-verify, another hooksPath). A disposable local fixture shows the exact step blocks a refused push.
// Static source checks plus a local fixture only: no hook is installed in this checkout, and no network.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(import.meta.dirname, '..'), WF = path.join(ROOT, '.github/workflows');
const STEP_RUN = 'test -x .github/hooks/pre-push && git config core.hooksPath .github/hooks';
const PUSH = /git push|save-data\.sh/;
function jobs(src) { const out = []; let cur = null, inJobs = false;
  for (const l of src.split('\n')) { if (/^jobs:/.test(l)) { inJobs = true; continue; } if (inJobs && /^\S/.test(l)) inJobs = false;
    if (inJobs && /^  [A-Za-z0-9_-]+:\s*$/.test(l)) { cur = { name: l.trim(), lines: [] }; out.push(cur); continue; } if (cur && inJobs) cur.lines.push(l); }
  return out; }
const files = fs.readdirSync(WF).filter(f => f.endsWith('.yml'));
test('every publishing job installs the pre-push hook after each checkout and before its first push', () => {
  let n = 0;
  for (const f of files) { const src = fs.readFileSync(path.join(WF, f), 'utf8');
    for (const j of jobs(src)) { const L = j.lines, firstPush = L.findIndex(l => PUSH.test(l) && !/^\s*#/.test(l)); if (firstPush < 0) continue; n++;
      const checkouts = L.map((l, i) => /- uses: actions\/checkout@/.test(l) ? i : -1).filter(i => i >= 0);
      assert.ok(checkouts.length, f + ' ' + j.name + ': publishing job has a checkout');
      for (const c of checkouts) { const hook = L.findIndex((l, i) => i > c && l.includes(STEP_RUN)), nextStep = L.findIndex((l, i) => i > c && /^      - /.test(l));
        assert.ok(hook > c && hook === nextStep + 1, f + ' ' + j.name + ': hook step immediately follows the checkout at job line ' + c); }
      assert.ok(L.findIndex(l => l.includes(STEP_RUN)) < firstPush, f + ' ' + j.name + ': hook installed before the first push'); } }
  assert.ok(n >= 75, 'all publishing jobs counted (' + n + ')');
});
test('no workflow or save script bypasses or redirects the hook', () => {
  for (const f of [...files.map(f => path.join(WF, f)), path.join(ROOT, '.github/save-data.sh'), path.join(ROOT, '.github/private-data.sh')]) {
    const src = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /--no-verify|core\.hooksPath(?! \.github\/hooks)|-c\s+core\.hooksPath/, path.basename(f));
    for (const m of src.matchAll(/core\.hooksPath\s+(\S+)/g)) assert.equal(m[1], '.github/hooks', path.basename(f)); }
});
test('local fixture: the exact workflow step fails without the hook and, once installed, a refusing hook blocks git push', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'prepush-wiring-'));
  try {
    const sh = (cmd, cwd) => execFileSync('bash', ['-c', cmd], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: process.env.PATH, HOME: d, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' } }).toString();
    sh('git init -q --bare remote.git && git init -q -b main work && cd work && git config user.email t@t && git config user.name t && echo a > f && git add f && git commit -qm a && git remote add origin ../remote.git && git push -q origin main', d);
    const w = path.join(d, 'work');
    assert.throws(() => sh(STEP_RUN, w), 'step is fail-closed when the hook file is absent');
    fs.mkdirSync(path.join(w, '.github/hooks'), { recursive: true }); fs.writeFileSync(path.join(w, '.github/hooks/pre-push'), '#!/bin/sh\ncat >/dev/null\necho refused >&2\nexit 1\n', { mode: 0o755 });
    sh(STEP_RUN, w); sh('echo b >> f && git commit -qam b', w);
    assert.throws(() => sh('git push -q origin main', w), 'a refusing hook blocks the push');
    assert.notEqual(sh('git rev-parse main', path.join(d, 'remote.git')).trim(), sh('git rev-parse HEAD', w).trim(), 'remote unchanged');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
