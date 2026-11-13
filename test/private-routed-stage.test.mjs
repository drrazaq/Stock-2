// Every owner-derived output routed private in P0 is excluded by the REAL save guard's stage phase with the REAL manifest, including workflows
// that stage all of data/ (guard stage) rather than naming files (Codex 6855791440: fastmover-live.json was publicly staged by movers.yml).
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process'; import { pathToFileURL } from 'node:url';
const ROOT = path.resolve(import.meta.dirname, '..');
const { guardPublicSave } = await import(pathToFileURL(path.join(ROOT, '.github/save-privacy-guard.mjs')).href);
const ENV = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' };
const g = (cwd, ...a) => execFileSync('git', a, { cwd, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const ROUTED = ['events-cache.json.gz', 'evr-sec.json.gz', 'evr-min.json.gz', 'squad29-cache.tar.gz', 'fastmover-live.json', 'hold-lab.json', 'squad29-lab.json', 'squad29-flags-today.json', 'squad29-diag.json', 'tip-score.json', 'agent-c-tip-score.json', 'smart-money.json', 'calendar.enc', 'calendar-status.json', 'hold-lab-run.log', 'squad3-run.log', 'shadow/2026-11-12.jsonl.gz', 'ignition-runs/2026-11-12/r-progress.json', 'shadow-outcomes/2026-11-12.json.gz', 'watcher-message-state/2026-11-12/' + 'c'.repeat(64) + '.json'];
test('guard stage with the real manifest excludes every routed owner-derived output, while a public file is staged', () => {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'routed-stage-')), origin = path.join(top, 'o.git'), job = path.join(top, 'job');
  g(top, 'init', '-q', '--bare', '-b', 'main', origin); g(top, 'clone', '-q', origin, job);
  fs.mkdirSync(path.join(job, '.github'), { recursive: true }); fs.copyFileSync(path.join(ROOT, '.github/private-files.txt'), path.join(job, '.github/private-files.txt'));
  fs.mkdirSync(path.join(job, 'data'), { recursive: true }); fs.writeFileSync(path.join(job, 'data/public.json'), '{}');
  g(job, 'add', '-A'); g(job, 'commit', '-qm', 'b'); g(job, 'push', '-qu', 'origin', 'main');
  for (const f of ROUTED) { fs.mkdirSync(path.dirname(path.join(job, 'data', f)), { recursive: true }); fs.writeFileSync(path.join(job, 'data', f), 'synthetic owner-derived'); }
  fs.writeFileSync(path.join(job, 'data/public.json'), '{"v":1}'); g(job, 'add', 'data');
  guardPublicSave({ cwd: job, manifest: path.join(job, '.github/private-files.txt'), phase: 'stage', env: ENV });
  assert.deepEqual(g(job, 'diff', '--cached', '--name-only').trim().split('\n'), ['data/public.json']);
  fs.rmSync(top, { recursive: true, force: true });
});

test('the owner-universe SEC event cache never uses the public Actions cache; the producer saves it privately and stops (UNKNOWN) without it', () => {
  const WF = path.join(ROOT, '.github/workflows');
  for (const f of fs.readdirSync(WF).filter(x => x.endsWith('.yml'))) { const L = fs.readFileSync(path.join(WF, f), 'utf8').split('\n');   // line-based (no backtracking)
    L.forEach((l, i) => { if (/uses: actions\/cache/.test(l)) assert.ok(!L.slice(i + 1, i + 6).some(x => /^\s+path: ev-cache\b/.test(x)), f + ': ev-cache in the Actions cache'); }); }
  const y = fs.readFileSync(path.join(WF, 'Smart-money.yml'), 'utf8');
  assert.match(y, /private-cache\.sh install-file events-cache\.json\.gz ev-cache\/events-cache\.json\.gz/);
  { const a = y.indexOf("if: always() && steps.evc.outputs.ok == '1'"), b = y.indexOf('node events-study.mjs', a), c = y.indexOf('stage-file ev-cache/events-cache.json.gz events-cache.json.gz', b); assert.ok(a > 0 && b > a && c > b && c - b < 300, 'events-study gated on the install and staged right after'); }
  assert.ok(y.indexOf('stage-file ev-cache/events-cache.json.gz events-cache.json.gz') < y.indexOf('private-outputs.sh save "events study'), 'staged before the private save');
  for (const l of y.split('\n').filter(l => l.includes('retain-failed "events study'))) assert.match(l, /events-cache\.json\.gz/);
});
