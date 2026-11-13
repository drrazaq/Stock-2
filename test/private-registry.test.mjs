// The research registry (data/strategy-library.json) is PRIVATE under its canonical name (Codex 6852885259 / 6852935516). Every writer
// merges ONLY its own run's changes onto the NEWEST private registry (library-merge.mjs; a rejected push re-fetches and re-merges), so
// concurrent labs never lose each other's entries, rejected/unproven verdicts or trial accounting. A missing private registry is UNKNOWN
// (the writer does not run), never a fresh first run. Local throw-away repositories only; no research is run.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
const REPO = path.resolve(import.meta.dirname, '..');
const ENV0 = { PATH: process.env.PATH, HOME: process.env.HOME, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', SAVE_SLEEP: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const sh = (cmd, cwd) => execSync(cmd, { cwd, env: ENV0, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const W = (dir, f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), typeof s === 'string' ? s : JSON.stringify(s)); };
const LIB0 = { strategies: [{ id: 'R-OLD', verdict: 'REJECTED', trials: 7 }, { id: 'R-KEEP', verdict: 'NOT PROVEN', trials: 3 }] };
function world(withRegistry = true) {
  const bare = tmp('reg-priv-'), seed = tmp('reg-seed-');
  sh('git init -q --bare -b main ' + bare, seed);
  W(seed, 'data/my-positions.json', '{}'); W(seed, 'data/halal.json', '{}'); W(seed, 'data/settings.json', '{}'); if (withRegistry) W(seed, 'data/strategy-library.json', LIB0);
  sh('git init -q -b main && git add -A && git -c commit.gpgsign=false commit -qm init && git remote add origin ' + bare + ' && git push -q origin main', seed);
  return { bare };
}
function runner(w) {   // one lab job: a public checkout with the scripts, the private mode marker and its own private clone
  const pub = tmp('reg-pub-'), run = tmp('reg-run-');
  for (const f of ['.github/private-data.sh', '.github/private-files.txt', '.github/save-data.sh', '.github/merge-alert-state.mjs', '.github/save-privacy-guard.mjs', 'library-merge.mjs']) W(pub, f, fs.readFileSync(path.join(REPO, f), 'utf8'));
  W(pub, '.github/private-data-mode', '');
  const env = { ...ENV0, PRIVATE_DATA_URL: w.bare, PRIVATE_DATA_DIR: path.join(run, 'private-data'), RUNNER_TEMP: run };
  const pd = (...a) => spawnSync('bash', ['.github/private-data.sh', ...a], { cwd: pub, encoding: 'utf8', env });
  return { pub, run, pd };
}
const remoteLib = (w) => JSON.parse(sh('git --git-dir=' + w.bare + ' show main:data/strategy-library.json', os.tmpdir()));
const startLab = (r) => { assert.equal(r.pd('pull').status, 0); assert.equal(r.pd('require', 'strategy-library.json').status, 0); fs.copyFileSync(path.join(r.pub, 'data/strategy-library.json'), path.join(r.run, 'base.json')); };
const finishLab = (r, mutate) => { const lib = JSON.parse(fs.readFileSync(path.join(r.run, 'base.json'), 'utf8')); mutate(lib); W(r.run, 'run.json', lib); return r.pd('merge-library', path.join(r.run, 'base.json'), path.join(r.run, 'run.json')); };
test('two concurrent labs: each run\'s changes are merged onto the newest private registry; nothing is lost', () => {
  const w = world(), a = runner(w), b = runner(w); startLab(a); startLab(b);
  let r = finishLab(b, (L) => L.strategies.push({ id: 'R-B', verdict: 'REJECTED', trials: 1 })); assert.equal(r.status, 0, r.stdout + r.stderr);
  r = finishLab(a, (L) => { L.strategies.push({ id: 'R-A', verdict: 'NOT PROVEN', trials: 1 }); L.strategies.find(e => e.id === 'R-KEEP').trials = 4; }); assert.equal(r.status, 0, r.stdout + r.stderr);
  const lib = remoteLib(w), ids = lib.strategies.map(e => e.id).sort();
  assert.deepEqual(ids, ['R-A', 'R-B', 'R-KEEP', 'R-OLD'], 'both labs\' entries kept, the rejected verdict preserved');
  assert.equal(lib.strategies.find(e => e.id === 'R-KEEP').trials, 4); assert.equal(lib.strategies.find(e => e.id === 'R-OLD').verdict, 'REJECTED');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(a.pub, 'data/strategy-library.json'), 'utf8')), lib, 'the local copy is refreshed to the merged registry');
});
test('a rejected push re-fetches and re-merges (no last-writer-wins)', () => {
  const w = world(), a = runner(w); startLab(a);
  W(w.bare, 'hooks/pre-receive', '#!/bin/sh\nif [ ! -e "$GIT_DIR/rejected-once" ]; then touch "$GIT_DIR/rejected-once"; echo synthetic >&2; exit 1; fi\nexit 0\n'); fs.chmodSync(path.join(w.bare, 'hooks/pre-receive'), 0o755);
  const r = finishLab(a, (L) => L.strategies.push({ id: 'R-A2', verdict: 'NOT PROVEN', trials: 1 })); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.ok(remoteLib(w).strategies.some(e => e.id === 'R-A2')); assert.ok(fs.existsSync(path.join(w.bare, 'rejected-once')));
});
test('a missing private registry is UNKNOWN: require fails and merge-library refuses (never a fresh registry)', () => {
  const w = world(false), a = runner(w); assert.equal(a.pd('pull').status, 0);
  const q = a.pd('require', 'strategy-library.json'); assert.equal(q.status, 1); assert.match(q.stdout, /required history data\/strategy-library.json is missing privately: UNKNOWN/);
  W(a.run, 'base.json', { strategies: [] }); W(a.run, 'run.json', { strategies: [{ id: 'R-NEW' }] });
  const r = a.pd('merge-library', path.join(a.run, 'base.json'), path.join(a.run, 'run.json')); assert.equal(r.status, 1); assert.match(r.stdout, /private registry is missing: UNKNOWN/);
  assert.throws(() => remoteLib(w), 'no registry was created');
});
test('every registry workflow: pull before require and the base copy, private merge only on success, visible failure, no public add', () => {
  const WF = path.join(REPO, '.github/workflows'); let n = 0;
  for (const f of fs.readdirSync(WF)) { const y = fs.readFileSync(path.join(WF, f), 'utf8'); if (!y.includes('strategy-library.json')) continue; n++;
    const pull = y.indexOf('private-data.sh pull'), req = y.indexOf('private-data.sh require strategy-library.json'), merge = y.indexOf('private-data.sh merge-library');
    assert.ok(pull > 0 && req > pull && merge > req, f + ': pull -> require/base -> merge');
    assert.match(y, /if \[ "\$\{\{ success\(\) \}\}" != true \]; then cp "\$RUNNER_TEMP\/library-run\.json" "data\/private-failed-pass-/, f);
    assert.match(y, /\[ "\$LF" = 0 \] \|\| exit 1/, f); assert.doesNotMatch(y, /node library-merge\.mjs/, f); assert.doesNotMatch(y, /(git add|for f in)[^#\n]*data\/strategy-library\.json/, f); }
  assert.ok(n >= 56, 'registry workflows: ' + n);
});
test('a generic private push (producer saves) never writes the registry: only merge-library does (no last-writer-wins via push)', () => {
  const w = world(), a = runner(w), b = runner(w); startLab(a); startLab(b);
  assert.equal(finishLab(b, (L) => L.strategies.push({ id: 'R-B', verdict: 'REJECTED', trials: 1 })).status, 0);
  W(a.pub, 'data/strategy-library.json', { strategies: [{ id: 'R-A-ONLY' }] });   // a's unmerged run copy, sitting at the canonical path
  const r = a.pd('push'); assert.equal(r.status, 0, r.stdout + r.stderr);
  const ids = remoteLib(w).strategies.map(e => e.id).sort(); assert.deepEqual(ids, ['R-B', 'R-KEEP', 'R-OLD'], 'the registry was not overwritten by a generic push');
});
