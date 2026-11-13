// Private step shell (.github/private-shell.sh, Codex 6854715808): GitHub's own bash semantics (plain = bash -e, pipefail = bash
// --noprofile --norc -eo pipefail), every byte of step output kept in a private runner log outside the checkout, and ONLY a generic exit line
// in the public log (no `::` commands, masks, annotations or helper text pass through). Plus the workflow contract and the PARTIAL tail.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { spawnSync } from 'node:child_process';
const REPO = path.resolve(import.meta.dirname, '..'), SHELL = path.join(REPO, '.github/private-shell.sh'), WF = path.join(REPO, '.github/workflows');
const step = (rt, mode, body, env = {}) => { const f = path.join(rt, 'step-' + Math.random().toString(36).slice(2) + '.sh'); fs.writeFileSync(f, body);
  return spawnSync('bash', [SHELL, mode, f], { encoding: 'utf8', env: { PATH: process.env.PATH, RUNNER_TEMP: rt, ...env } }); };
const rt = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pshell-'));
test('plain mode = GitHub default bash -e: a failing command stops the step with its status; a failing pipe head does not', () => {
  const t = rt(); let r = step(t, 'plain', 'echo a\nfalse | true\necho b\n'); assert.equal(r.status, 0);
  r = step(t, 'plain', 'echo a\n( exit 7 )\necho never\n'); assert.equal(r.status, 7);
  const log = fs.readFileSync(path.join(t, 'private-step-logs/job.log'), 'utf8'); assert.match(log, /\na\n/); assert.doesNotMatch(log, /never/);
});
test('pipefail mode = GitHub shell: bash: a failing pipe head fails the step', () => {
  const t = rt(); assert.equal(step(t, 'pipefail', 'false | true\n').status, 1); assert.equal(step(t, 'pipefail', 'true | true\n').status, 0);
});
test('nothing the step prints reaches the public log: no :: commands, masks, annotations or helper-prefixed text; all of it is in the private log', () => {
  const t = rt(), payload = 'echo "::warning::ZZPRIVATE holding"\necho "::add-mask::x"\necho "private data: ZZPRIVATE"\necho "private outputs (x): ZZPRIVATE"\necho ZZPRIVATE >&2\n';
  const r = step(t, 'pipefail', payload); assert.equal(r.status, 0);
  assert.equal(r.stdout, 'private step 1: exit 0 (output kept privately)\n'); assert.equal(r.stderr, '');
  const log = fs.readFileSync(path.join(t, 'private-step-logs/job.log'), 'utf8'); assert.equal((log.match(/ZZPRIVATE/g) || []).length, 4);
  assert.equal(fs.statSync(path.join(t, 'private-step-logs')).mode & 0o077, 0, 'owner-only private log directory');
});
test('GITHUB_OUTPUT / GITHUB_STEP_SUMMARY files keep working; steps are numbered; a bad mode never runs the step', () => {
  const t = rt(), out = path.join(t, 'out'); fs.writeFileSync(out, '');
  step(t, 'plain', 'echo stage=judge >> "$GITHUB_OUTPUT"\n', { GITHUB_OUTPUT: out }); assert.equal(fs.readFileSync(out, 'utf8'), 'stage=judge\n');
  assert.match(step(t, 'plain', 'true\n').stdout, /^private step 2: exit 0/);
  const bad = step(t, 'other', 'touch ' + path.join(t, 'ran') + '\n'); assert.equal(bad.status, 2); assert.ok(!fs.existsSync(path.join(t, 'ran')));
});
const hydrated = fs.readdirSync(WF).filter(f => f.endsWith('.yml')).filter(f => fs.readFileSync(path.join(WF, f), 'utf8').includes('private-data.sh pull'));
test('every hydrated workflow runs ALL run steps through the private shell, with GitHub-equivalent modes', () => {
  assert.ok(hydrated.length >= 75, 'hydrated workflows: ' + hydrated.length);
  for (const f of hydrated) { const y = fs.readFileSync(path.join(WF, f), 'utf8');
    assert.match(y, /^defaults:\n  run:\n    shell: bash \.github\/private-shell\.sh plain \{0\}\n/m, f + ': default run shell is private');
    for (const m of y.matchAll(/^ {6,}(?:- )?shell: (.*)$/gm)) assert.equal(m[1].trim(), 'bash .github/private-shell.sh pipefail {0}', f + ': explicit shell must be the private pipefail shell');
    assert.doesNotMatch(y, /echo "::/, f + ': no workflow command printed by a step'); }
});
test('no hydrated workflow uploads a log or a data/ path as an artifact; the only remaining artifacts are the declared market-only work files', () => {
  const SAFE = { 'squad19-lab.yml': ['sq19-work/plan.json.gz', 'sq19-work/shard-${{ matrix.shard }}.json.gz', 'sq19-work/daily-out.json'], 'squad2-lab.yml': ['squad2-work/plan.json.gz', 'squad2-work/shard-${{ matrix.shard }}.json.gz'] };
  for (const f of hydrated) { const y = fs.readFileSync(path.join(WF, f), 'utf8');
    for (const m of y.matchAll(/uses: actions\/upload-artifact@[^\n]*\n(?:\s+[^\n]*\n)*?\s+path: (\|\n(?:\s{12,}[^\n]*\n)+|[^\n]+)/g)) {
      const paths = m[1].replace(/^\|\n/, '').split('\n').map(x => x.trim()).filter(Boolean);
      for (const p of paths) assert.ok((SAFE[f] || []).includes(p), f + ': artifact path ' + p + ' is not a declared safe exception'); } }
});
test('a private save carries a bounded, explicitly PARTIAL run-log tail (as-of time and omitted count), never presented as complete', () => {
  const t = rt(); fs.mkdirSync(path.join(t, 'private-step-logs')); fs.writeFileSync(path.join(t, 'private-step-logs/job.log'), Array.from({ length: 2500 }, (_, i) => 'line ' + i).join('\n') + '\n');
  const src = fs.readFileSync(path.join(REPO, '.github/private-data.sh'), 'utf8'), fn = src.slice(src.indexOf('RUNLOG_MAX_LINES='), src.indexOf('RUNLOG_NAME='));
  const r = spawnSync('bash', ['-c', 'say(){ :; }; ' + fn + 'runlog_tail "$1"', 'x', path.join(t, 'tail.log')], { encoding: 'utf8', env: { PATH: process.env.PATH, RUNNER_TEMP: t } });
  assert.equal(r.status, 0, r.stderr); const tail = fs.readFileSync(path.join(t, 'tail.log'), 'utf8');
  assert.match(tail.split('\n')[0], /^PARTIAL private run log, as of \d{4}-\d\d-\d\dT[\d:]+Z: the last 2000 of 2500 lines, at most 524288 bytes \(anything earlier is NOT retained here\)$/);
  assert.match(tail, /line 2499\n$/); assert.doesNotMatch(tail, /\nline 499\n/);
});
