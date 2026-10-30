// Seam: .github/private-data.sh, the connection between this public repository and the owner's private data repository (privacy
// migration, owner approved 28 Oct 2026). Driven on throw-away local repositories (PRIVATE_DATA_URL points at a local bare repository).
// Invariants: no token -> nothing happens; mirror waits for the owner's connection check; check copies every private file and proves the
// read-back is identical; no file content and no token ever appears in the output or on disk; pull fails loudly without holdings (so no
// job runs on an empty positions file); push keeps the bot's newer positions on a conflict (save-data.sh rule); the website publishes
// only index.html.
// Run: node --test test/private-data.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV0 = { PATH: process.env.PATH, HOME: process.env.HOME, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', SAVE_SLEEP: '0' };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));
const sh = (cmd, cwd) => execSync(cmd, { cwd, env: ENV0, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const W = (dir, f, s) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), s); };
const FILES = fs.readFileSync(path.join(REPO, '.github/private-files.txt'), 'utf8').split('\n').filter(l => l.trim() && !l.startsWith('#'));
const SECRET = 'HOLDING-SENTINEL-7781';

// a fake "public" checkout (the script + file list + save-data.sh + private files) and a fake private repository with a README
function world() {
  const pub = tmp('pub-'), bare = tmp('priv-'), seed = tmp('seed-'), dir = path.join(tmp('run-'), 'private-data');
  for (const f of ['.github/private-data.sh', '.github/private-files.txt', '.github/save-data.sh']) W(pub, f, fs.readFileSync(path.join(REPO, f)));
  W(pub,'docs/repository-ownership.json',fs.readFileSync(path.join(REPO,'docs/repository-ownership.json')));
  W(pub, 'data/my-positions.json', '{"AAA":{"entry":10,"note":"' + SECRET + '"}}\n'); W(pub, 'data/halal.json', '{\n "AAA": {"s":"ok"}\n}\n');
  W(pub, 'data/settings.json', '{"focus":true}\n'); W(pub, 'data/my-trades.jsonl', '{"sym":"BBB"}\n'); W(pub, 'data/signals.json', '{"public":1}\n');
  sh('git init -q --bare -b main ' + bare, seed);
  sh('git init -q -b main && echo "# private" > README.md && git add -A && git -c commit.gpgsign=false commit -qm init && git remote add origin ' + bare + ' && git push -q origin main', seed);
  return { pub, bare, dir };
}
const run = (w, mode, extra = {}) => spawnSync('bash', ['.github/private-data.sh', mode], { cwd: w.pub, encoding: 'utf8', env: { ...ENV0, PRIVATE_DATA_URL: w.bare, PRIVATE_DATA_DIR: w.dir, ...extra } });
const show = (w, f) => { try { return sh('git --git-dir=' + w.bare + ' show main:' + f, os.tmpdir()); } catch { return null; } };
const out = (r) => r.stdout + r.stderr;

test('no token and no address: every mode does nothing; check and pull report failure, mirror does not', () => {
  const w = world();
  for (const m of ['mirror', 'check', 'pull']) { const r = spawnSync('bash', ['.github/private-data.sh', m], { cwd: w.pub, encoding: 'utf8', env: { ...ENV0, PRIVATE_DATA_DIR: w.dir } });
    assert.match(out(r), /not connected \(no PRIVATE_DATA_TOKEN secret\), nothing done/); assert.equal(r.status, m === 'mirror' ? 0 : 1, m); }
  assert.equal(show(w, 'data/my-positions.json'), null);
});
test('mirror waits for the owner\'s connection check: nothing is copied before it', () => {
  const w = world(); const r = run(w, 'mirror');
  assert.equal(r.status, 0); assert.match(out(r), /mirror waits for the connection check/); assert.equal(show(w, 'data/my-positions.json'), null);
  assert.equal(out(run(w, 'mirror')), '', 'a second try within 10 minutes makes no network call and no noise');
  fs.rmSync(w.dir + '.wait'); run(w, 'check'); fs.rmSync(path.join(w.dir, '.mirrored'), { force: true }); W(w.pub, 'data/settings.json', '{"focus":false}\n');
  assert.equal(run(w, 'mirror').status, 0); assert.equal(show(w, 'data/settings.json'), '{"focus":false}\n');
});
test('check: reads, writes, copies every private file that exists, reads it back identical; prints names and counts, never contents', () => {
  const w = world(); const r = run(w, 'check');
  assert.equal(r.status, 0, out(r)); assert.match(out(r), /read OK[\s\S]*write OK[\s\S]*4 of 4 private files copied and read back identical[\s\S]*CHECK PASSED/);
  assert.doesNotMatch(out(r), new RegExp(SECRET));
  for (const f of ['my-positions.json', 'halal.json', 'settings.json', 'my-trades.jsonl']) assert.equal(show(w, 'data/' + f), fs.readFileSync(path.join(w.pub, 'data', f), 'utf8'), f);
  assert.equal(show(w, 'data/signals.json'), null, 'public files are not copied');
  assert.match(show(w, 'CONNECTION-CHECK.md'), /Last successful check/); assert.match(show(w, 'README.md'), /private/);
  assert.ok(fs.readFileSync(path.join(w.pub, 'data/my-positions.json'), 'utf8').includes(SECRET), 'the public copy is not touched by check');
});
test('mirror after the check: a change is copied once; an unchanged state makes no commit', () => {
  const w = world(); run(w, 'check');
  W(w.pub, 'data/my-positions.json', '{"AAA":{"entry":11}}\n'); let r = run(w, 'mirror');
  assert.equal(r.status, 0, out(r)); assert.equal(show(w, 'data/my-positions.json'), '{"AAA":{"entry":11}}\n');
  const n = sh('git --git-dir=' + w.bare + ' rev-list --count main', os.tmpdir()); r = run(w, 'mirror');
  assert.equal(sh('git --git-dir=' + w.bare + ' rev-list --count main', os.tmpdir()), n);
});
test('the token never reaches the output or the disk (it travels in the environment only)', () => {
  const w = world(); const TOK = 'github_pat_TESTTOKEN_123456';
  const r = run(w, 'check', { PRIVATE_DATA_TOKEN: TOK }); assert.equal(r.status, 0, out(r));
  assert.doesNotMatch(out(r), /TESTTOKEN/); assert.doesNotMatch(out(r), new RegExp(Buffer.from('x-access-token:' + TOK).toString('base64').slice(0, 20)));
  assert.doesNotMatch(fs.readFileSync(path.join(w.dir, '.git/config'), 'utf8'), /TESTTOKEN|AUTHORIZATION/i);
  assert.doesNotMatch(sh('git --git-dir=' + w.bare + ' log -p --all', os.tmpdir()), /TESTTOKEN/);
});
test('pull: private copies replace the public ones; with no positions file in the private repository it stops (exit 1)', () => {
  const w = world(); let r = run(w, 'pull'); assert.equal(r.status, 1); assert.match(out(r), /has no data\/my-positions.json; stopping/);
  run(w, 'check'); W(w.pub, 'data/halal.json', '{}\n');   // a stale public copy
  r = run(w, 'pull'); assert.equal(r.status, 0, out(r)); assert.match(fs.readFileSync(path.join(w.pub, 'data/halal.json'), 'utf8'), /"AAA"/);
  const bad = { ...w, bare: w.bare + '-missing' }; r = run(bad, 'pull', { PRIVATE_DATA_DIR: w.dir + '-x' }); assert.equal(r.status, 1); assert.match(out(r), /cannot read the private repository/);
});
test('push: a bought/sold/halal change is saved; on a conflict the bot\'s newer positions are kept (save-data.sh rule)', () => {
  const w = world(); run(w, 'check'); run(w, 'pull');
  const other = tmp('other-'); sh('git clone -q ' + w.bare + ' ' + other, os.tmpdir());
  W(other, 'data/my-positions.json', '{"AAA":{"entry":10,"stop":9.5}}\n'); sh('git add -A && git -c commit.gpgsign=false commit -qm bot && git push -q', other);
  W(w.pub, 'data/my-positions.json', '{"AAA":{"entry":10,"stop":8}}\n'); W(w.pub, 'data/halal.json', '{\n "AAA": {"s":"ok"},\n "CCC": {"s":"fail"}\n}\n');
  const r = run(w, 'push'); assert.equal(r.status, 0, out(r));
  assert.match(show(w, 'data/my-positions.json'), /"stop":9\.5/); assert.match(show(w, 'data/halal.json'), /"CCC"/);
});
test('the website workflow publishes index.html only (nothing from data/)', () => {
  const y = fs.readFileSync(path.join(REPO, '.github/workflows/pages.yml'), 'utf8');
  assert.match(y, /cp index\.html _site\//); assert.doesNotMatch(y, /cp[^\n]*data\//); assert.match(y, /grep -vE '\^_site\/index\\\.html\$'/);
});
test('every private file in the list exists today or is a ledger created later; the list holds no public research files', () => {
  for (const f of FILES) assert.ok(fs.existsSync(path.join(REPO, 'data', f)) || /ledger/.test(f), f);
  assert.ok(!FILES.includes('signals.json') && !FILES.includes('strategy-library.json'));
});
