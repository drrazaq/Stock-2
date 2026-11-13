// Failure controls for .github/private-data.sh (Codex 6851680092), on throw-away local repositories only: a failed copy never confirms a
// private save; a failure before the copy/commit/push keeps the owner's update PENDING and a later pull never overwrites it (it retries
// the save first, else exits 3 with the newest local state kept); pull stages every copy and installs nothing on a copy failure; required
// files must exist privately and a missing optional file is never left as a stale local copy. The bot pauses owner commands on exit 3
// while its protective checks keep running. No real private repository, token or provider call.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
const REPO = path.resolve(import.meta.dirname, '..');
const ENV0 = { PATH: process.env.PATH, HOME: process.env.HOME, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', SAVE_SLEEP: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const sh = (cmd, cwd) => execSync(cmd, { cwd, env: ENV0, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const W = (dir, f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };
const R = (dir, f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return null; } };
const REAL_CP = execSync('command -v cp', { encoding: 'utf8', shell: '/bin/bash' }).trim();
const REAL_MV = execSync('command -v mv', { encoding: 'utf8', shell: '/bin/bash' }).trim();
function world() {
  const pub = tmp('pdf-pub-'), bare = tmp('pdf-priv-'), seed = tmp('pdf-seed-'), dir = path.join(tmp('pdf-run-'), 'private-data'), shim = tmp('pdf-shim-');
  for (const f of ['.github/private-data.sh', '.github/private-files.txt', '.github/save-data.sh', '.github/merge-alert-state.mjs', '.github/save-privacy-guard.mjs']) W(pub, f, fs.readFileSync(path.join(REPO, f)));
  W(pub, 'data/my-positions.json', '{"AAA":{"entry":10}}\n'); W(pub, 'data/halal.json', '{"AAA":{"s":"ok"}}\n'); W(pub, 'data/settings.json', '{"focus":true}\n');
  sh('git init -q --bare -b main ' + bare, seed); sh('git init -q -b main && echo x > README.md && git add -A && git -c commit.gpgsign=false commit -qm init && git remote add origin ' + bare + ' && git push -q origin main', seed);
  W(shim, 'cp', '#!/bin/bash\nsrc=; for a in "$@"; do case "$a" in -*) ;; *) src=$a; break;; esac; done\nfor a in "$@"; do case "$a" in *"$FAIL_CP") [ -n "$FAIL_CP" ] && { echo "cp: synthetic failure" >&2; exit 1; };; esac; done\ncase "$src" in *"$FAIL_CP_SRC"*) [ -n "$FAIL_CP_SRC" ] && { echo "cp: synthetic failure" >&2; exit 1; };; esac\nexec ' + REAL_CP + ' "$@"\n'); fs.chmodSync(path.join(shim, 'cp'), 0o755);
  W(shim, 'mv', '#!/bin/bash\nsrc=; for a in "$@"; do case "$a" in -*) ;; *) src=$a; break;; esac; done\ncase "$src" in *"$FAIL_MV") [ -n "$FAIL_MV" ] && { echo "mv: synthetic failure" >&2; exit 1; };; esac\nexec ' + REAL_MV + ' "$@"\n'); fs.chmodSync(path.join(shim, 'mv'), 0o755);
  return { pub, bare, dir, shim };
}
const run = (w, mode, extra = {}) => spawnSync('bash', ['.github/private-data.sh', mode], { cwd: w.pub, encoding: 'utf8', env: { ...ENV0, PATH: w.shim + ':' + ENV0.PATH, PRIVATE_DATA_URL: w.bare, PRIVATE_DATA_DIR: w.dir, ...extra } });
const remote = (w, f) => { try { return sh('git --git-dir=' + w.bare + ' show main:data/' + f, os.tmpdir()); } catch { return null; } };
const init = (w) => { const r = run(w, 'check'); assert.equal(r.status, 0, r.stdout + r.stderr); };
test('push: a failed copy is never a confirmed save; the update stays pending and local', () => {
  const w = world(); init(w); W(w.pub, 'data/my-positions.json', '{"AAA":{"entry":10},"BBB":{"entry":5}}\n');
  const r = run(w, 'push', { FAIL_CP: 'my-positions.json' });
  assert.equal(r.status, 1); assert.match(r.stdout, /private save NOT confirmed \(copy failed\)/);
  assert.doesNotMatch(remote(w, 'my-positions.json'), /BBB/, 'nothing new reached the private repository'); assert.ok(fs.existsSync(w.dir + '.pending'), 'pending kept');
  assert.match(R(w.pub, 'data/my-positions.json'), /BBB/, 'local intent preserved');
});
test('failure BEFORE the copy (private repository unreachable): pending kept; pull refuses to overwrite (exit 3); once reachable, pull saves first, then pulls', () => {
  const w = world(); init(w); assert.equal(run(w, 'pull').status, 0);
  W(w.pub, 'data/my-positions.json', '{"AAA":{"entry":10},"CCC":{"entry":7}}\n');
  sh('git remote set-url origin /nonexistent/private.git', w.dir);
  let r = run(w, 'push'); assert.notEqual(r.status, 0); assert.ok(fs.existsSync(w.dir + '.pending'));
  r = run(w, 'pull'); assert.equal(r.status, 3, r.stdout); assert.match(r.stdout, /pull refused, owner commands paused/);
  assert.match(R(w.pub, 'data/my-positions.json'), /CCC/, 'the newer local update was NOT overwritten by the older private copy');
  sh('git remote set-url origin ' + w.bare, w.dir);
  r = run(w, 'pull'); assert.equal(r.status, 0, r.stdout + r.stderr); assert.match(remote(w, 'my-positions.json'), /CCC/, 'the pending update reached the private repository first');
  assert.ok(!fs.existsSync(w.dir + '.pending')); assert.match(R(w.pub, 'data/my-positions.json'), /CCC/);
});
test('pull: a failed copy installs nothing (no mixed old/new state)', () => {
  const w = world(); init(w); assert.equal(run(w, 'pull').status, 0);
  const other = tmp('pdf-other-'); sh('git clone -q ' + w.bare + ' o && cd o && printf \'{"NEW":{"entry":1}}\\n\' > data/my-positions.json && printf \'{"NEW":{"s":"ok"}}\\n\' > data/halal.json && git add -A && git -c commit.gpgsign=false commit -qm bot && git push -q', other);
  const before = { p: R(w.pub, 'data/my-positions.json'), h: R(w.pub, 'data/halal.json') };
  const r = run(w, 'pull', { FAIL_CP: 'halal.json' }); assert.equal(r.status, 1); assert.match(r.stdout, /nothing installed/);
  assert.equal(R(w.pub, 'data/my-positions.json'), before.p, 'positions not installed alone'); assert.equal(R(w.pub, 'data/halal.json'), before.h);
  assert.equal(run(w, 'pull').status, 0); assert.match(R(w.pub, 'data/my-positions.json'), /NEW/); assert.match(R(w.pub, 'data/halal.json'), /NEW/);
});
test('pull: a missing REQUIRED file stops; a missing optional file is set aside, never kept as current', () => {
  const w = world(); init(w); assert.equal(run(w, 'pull').status, 0);
  W(w.pub, 'data/tips.jsonl', '{"stale":1}\n');   // local copy of an optional file the private repository does not have
  let r = run(w, 'pull'); assert.equal(r.status, 0); assert.equal(R(w.pub, 'data/tips.jsonl'), null); assert.equal(R(w.pub, 'data/private-stale-tips.jsonl'), '{"stale":1}\n');
  assert.match(r.stdout, /optional tips\.jsonl is absent privately; the local copy was set aside/);
  const other = tmp('pdf-other-'); sh('git clone -q ' + w.bare + ' o && cd o && git rm -q data/settings.json && git -c commit.gpgsign=false commit -qm rm && git push -q', other);
  const s0 = R(w.pub, 'data/settings.json'); r = run(w, 'pull'); assert.equal(r.status, 1); assert.match(r.stdout, /no data\/settings\.json; stopping/); assert.equal(R(w.pub, 'data/settings.json'), s0);
});
test('push verifies CONTENT: success only when the stored bytes are this job\'s (or a save-data.sh hunk merge); then pending is cleared', () => {
  const w = world(); init(w); assert.equal(run(w, 'pull').status, 0); W(w.pub, 'data/halal.json', '{"AAA":{"s":"ok"},"DDD":{"s":"fail"}}\n');
  const r = run(w, 'push'); assert.equal(r.status, 0, r.stdout + r.stderr); assert.equal(remote(w, 'halal.json'), '{"AAA":{"s":"ok"},"DDD":{"s":"fail"}}\n'); assert.ok(!fs.existsSync(w.dir + '.pending'));
  const src = fs.readFileSync(path.join(REPO, '.github/private-data.sh'), 'utf8'); assert.match(src, /rev-parse "origin\/\$BR:data\/\$f"/); assert.match(src, /git hash-object "\$ROOT\/data\/\$f"/);
});
test('bot: pull exit 3 pauses owner commands (not consumed) while protective checks run; other failures skip the cycle', () => {
  const y = fs.readFileSync(path.join(REPO, '.github/workflows/bot.yml'), 'utf8'), at = y.indexOf('export OWNER_MUTATIONS_PAUSED=');
  const block = y.slice(at, y.indexOf('now=$(date +%s)', at));
  assert.match(block, /if \[ "\$pr" = 3 \]; then export OWNER_MUTATIONS_PAUSED=1/); assert.match(block, /elif \[ "\$pr" != 0 \]; then .*cycle skipped.*continue/);
  assert.ok(y.indexOf('node scan.mjs', at) > at, 'the protective full check still runs after a paused pull');
  const scan = fs.readFileSync(path.join(REPO, 'scan.mjs'), 'utf8'), t = scan.indexOf('async function tgCommands('), g = scan.indexOf('getUpdates', t);
  assert.ok(scan.slice(t, g).includes('if (env.OWNER_MUTATIONS_PAUSED)'), 'paused before any Telegram read');
});

test('push: a refusal by the shared save (EXACT_ORIGIN: another declared address than the clone) is never relabelled verified (Codex 6851790645)', () => {
  const w = world(); init(w); assert.equal(run(w, 'pull').status, 0);
  const other = tmp('pdf-other-bare-'); sh('git init -q --bare -b main ' + other, os.tmpdir());
  const r = run(w, 'push', { PRIVATE_DATA_URL: other });
  assert.notEqual(r.status, 0, r.stdout); assert.match(r.stdout, /private save NOT confirmed/);   // refused by the clone binding (read and write) or, behind it, by the shared save assert.doesNotMatch(r.stdout, /private save verified/);
  assert.ok(fs.existsSync(w.dir + '.pending'), 'pending kept');
});
test('pull: an install failure part-way rolls every installed file back; nothing new is current', () => {
  const w = world(); init(w); assert.equal(run(w, 'pull').status, 0);
  const other = tmp('pdf-other-'); sh('git clone -q ' + w.bare + ' o && cd o && for f in my-positions settings halal; do printf \'{"NEW":1}\\n\' > data/$f.json; done && git add -A && git -c commit.gpgsign=false commit -qm bot && git push -q', other);
  const before = Object.fromEntries(['my-positions.json', 'settings.json', 'halal.json'].map(f => [f, R(w.pub, 'data/' + f)]));
  const r = run(w, 'pull', { FAIL_MV: 'halal.json' }); assert.equal(r.status, 1); assert.match(r.stdout, /every installed file was rolled back/);
  for (const [f, v] of Object.entries(before)) assert.equal(R(w.pub, 'data/' + f), v, f + ' rolled back');
  assert.ok(!fs.existsSync(w.dir + '.install-incomplete'));
  assert.equal(run(w, 'pull').status, 0); for (const f of Object.keys(before)) assert.match(R(w.pub, 'data/' + f), /NEW/);
});
test('pull: install AND rollback failure leaves an incomplete marker; the failure is visible and the next complete pull clears it', () => {
  const w = world(); init(w); assert.equal(run(w, 'pull').status, 0);
  const other = tmp('pdf-other-'); sh('git clone -q ' + w.bare + ' o && cd o && for f in my-positions settings halal; do printf \'{"NEW":2}\\n\' > data/$f.json; done && git add -A && git -c commit.gpgsign=false commit -qm bot && git push -q', other);
  const r = run(w, 'pull', { FAIL_MV: 'halal.json', FAIL_CP_SRC: '.bak/' }); assert.equal(r.status, 1); assert.match(r.stdout, /rollback failed; owner files are marked incomplete/);
  assert.ok(fs.existsSync(w.dir + '.install-incomplete'));
  const bak = fs.readdirSync(path.dirname(w.dir)).filter(n => /\.stage\.\d+\.bak$/.test(n)); assert.equal(bak.length, 1, 'the pre-install backup is KEPT while unresolved (Codex 6852322719)');
  assert.ok(fs.readdirSync(path.join(path.dirname(w.dir), bak[0])).some(n => n === 'my-positions.json'), 'backup holds the pre-install owner files');
  const r2 = run(w, 'pull'); assert.equal(r2.status, 0); assert.match(r2.stdout, /an earlier install was incomplete/); assert.ok(!fs.existsSync(w.dir + '.install-incomplete'));
  for (const f of ['my-positions.json', 'settings.json', 'halal.json']) assert.match(R(w.pub, 'data/' + f), /NEW/);
});

test('read paths are bound to the declared private origin: pull with another declared address reads nothing and changes nothing (Codex 6852260667)', () => {
  const w = world(); init(w); assert.equal(run(w, 'pull').status, 0);
  const other = tmp('pdf-other-bare-'); sh('git init -q --bare -b main ' + other, os.tmpdir());
  const before = R(w.pub, 'data/my-positions.json'); const r = run(w, 'pull', { PRIVATE_DATA_URL: other });
  assert.equal(r.status, 1); assert.match(r.stdout, /not bound to the declared private repository/); assert.doesNotMatch(r.stdout + r.stderr, new RegExp(other.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(R(w.pub, 'data/my-positions.json'), before); assert.ok(fs.existsSync(path.join(w.dir, '.git')), 'clone kept');
  const p = run(w, 'push', { PRIVATE_DATA_URL: other }); assert.equal(p.status, 1); assert.match(p.stdout, /not bound to the declared private repository/); assert.ok(fs.existsSync(w.dir + '.pending'));
});
test('push: with the clone correctly bound, a failure INSIDE the shared save (the private repository rejects the push) is never verified', () => {
  const w = world(); init(w); assert.equal(run(w, 'pull').status, 0); W(w.pub, 'data/halal.json', '{"AAA":{"s":"ok"},"EEE":{"s":"ok"}}\n');
  W(w.bare, 'hooks/pre-receive', '#!/bin/sh\necho "synthetic rejection" >&2\nexit 1\n'); fs.chmodSync(path.join(w.bare, 'hooks/pre-receive'), 0o755);
  const r = run(w, 'push'); assert.equal(r.status, 1, r.stdout); assert.match(r.stdout, /private save NOT confirmed \(the shared save refused or failed\)/);
  assert.doesNotMatch(r.stdout, /private save verified/); assert.ok(fs.existsSync(w.dir + '.pending')); assert.doesNotMatch(remote(w, 'halal.json'), /EEE/);
});

test('pull: an optional stale copy that cannot be set aside fails the pull (nonzero, incomplete kept) and is never presented as complete (Codex 6852322719)', () => {
  const w = world(); init(w); assert.equal(run(w, 'pull').status, 0); W(w.pub, 'data/tips.jsonl', '{"stale":1}\n');
  const r = run(w, 'pull', { FAIL_MV: 'tips.jsonl' }); assert.notEqual(r.status, 0); assert.match(r.stdout, /could not be set aside/);
  assert.ok(fs.existsSync(w.dir + '.install-incomplete'), 'incomplete kept'); assert.doesNotMatch(r.stdout, /pulled \d+ files/);
  const r2 = run(w, 'pull'); assert.equal(r2.status, 0); assert.equal(R(w.pub, 'data/tips.jsonl'), null); assert.ok(!fs.existsSync(w.dir + '.install-incomplete'));
});
