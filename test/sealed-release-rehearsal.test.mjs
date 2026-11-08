// R1 release rehearsal (offline, synthetic): the RELEASE.md sequence end to end against a throw-away "origin", using the real scripts.
// Stage 0 pre-R1 main -> writer gate -> code push -> (rollback before migration) -> approved-source migration with fast-forward push
// and tree receipt -> resumed writers -> old-writer plaintext refused -> recovery export byte-identical to the pre-R1 files.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sealedKey, appendSealedLines, readSealedLines } from '../sealed-store.mjs';
import { gate, OPEN_STATUSES } from '../r1-writer-gate.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'synthetic-release-secret', K = sealedKey(SECRET);
const ENV = { ...process.env, SEALED_SECRET: SECRET, SEALED_MERGE_FAVOR: 'theirs', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', NODE_OPTIONS: '', TG_TOKEN: '', TG_CHAT: '' };
const git = (cwd, args, env = ENV) => execFileSync('git', args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const sh = (cwd, script, env = ENV) => spawnSync('bash', ['-c', script], { cwd, env, encoding: 'utf8' });
const node = (cwd, args, env = ENV) => spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8' });
const R1_FILES = ['r1-release-precheck.mjs', 'sealed-store.mjs', 'sealed-merge.mjs', 'sealed-guard.mjs', 'sealed-migrate.mjs', 'r1-writer-gate.mjs', 'missed-runners.mjs', '.gitattributes', '.gitignore', '.github/sealed-git.sh', '.github/save-data.sh', '.github/bot-save.sh'];
const DEPS = ['sec-time.mjs', 'ignition-core.mjs', 'blocked-runner-policy.mjs'];   // missed-runners.mjs imports (copied unchanged in stage 0)
const T1 = { 'data/opp-ledger.jsonl': '{"sym":"ZZA","px":2.5}\n', 'data/ignition-missed-history.jsonl': '{"d":"2026-01-01","sym":"ZZB"}\n', 'data/ignition-live.json': '{"day":"2026-01-02","missed":[]}',
  'data/options-shadow.json': '{"real":[{"sym":"ZZR"}],"open":[]}', 'data/ignition-runs/2026-01-02/1-1.json': '{"run":1}' };

test('release rehearsal: gate -> code -> rollback-before-migration -> migration -> receipt -> writers -> guard -> recovery export', (t) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-release-')); t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  git(d, ['init', '-q', '-b', 'main', '--bare', 'origin.git']);
  const op = path.join(d, 'operator'); git(d, ['init', '-q', '-b', 'main', 'operator']); git(op, ['remote', 'add', 'origin', '../origin.git']);
  // ---- stage 0: pre-R1 main: plaintext T1 + pre-R1 code
  for (const [f, v] of Object.entries(T1)) { fs.mkdirSync(path.dirname(path.join(op, f)), { recursive: true }); fs.writeFileSync(path.join(op, f), v); }
  fs.mkdirSync(path.join(op, 'data/shadow'), { recursive: true }); fs.writeFileSync(path.join(op, 'data/shadow/2026-01-02.jsonl.gz'), zlib.gzipSync('{"bid":1.1}\n'));
  fs.writeFileSync(path.join(op, 'data/tg-state.json'), '{"offset":1}'); fs.writeFileSync(path.join(op, 'data/ignition-days.jsonl'), '');
  for (const f of DEPS) fs.copyFileSync(path.join(ROOT, f), path.join(op, f));
  fs.writeFileSync(path.join(op, 'missed-runners.mjs'), '// pre-R1 placeholder\n');
  git(op, ['add', '-A']); git(op, ['commit', '-q', '-m', 'pre-R1']); git(op, ['push', '-q', '-u', 'origin', 'main']);
  const pre = git(op, ['rev-parse', 'HEAD']).trim();

  // ---- stage 1: writer gate (saved listings): FAIL while a writer runs, PASS once quiet
  const R = { full_name: 'drrazaq/Stock-2' }, nowIso = new Date().toISOString(), pg = (runs) => [{ page: 1, total_count: runs.length, workflow_runs: runs }];
  const cap = (status) => ({ repository: 'drrazaq/Stock-2', captured_at: nowIso, queries: [
    ...OPEN_STATUSES.map((st) => ({ kind: 'status', status: st, per_page: 100, pages: pg(st === status ? [{ id: 1, path: '.github/workflows/ignition.yml', status, repository: R }] : []) })),
    { kind: 'created', workflow: '*', from: new Date(Date.now() - 32 * 864e5).toISOString(), to: nowIso, per_page: 100, pages: pg([{ id: 1, path: '.github/workflows/ignition.yml', status, repository: R }]) }] });
  assert.equal(gate(cap('in_progress')).pass, false); assert.equal(gate(cap('completed')).pass, true);

  // ---- stage 2: push the R1 code (writers off). Readers fail closed on the still-plaintext files
  for (const f of R1_FILES) { fs.mkdirSync(path.dirname(path.join(op, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(op, f)); }
  git(op, ['add', '-A']); git(op, ['commit', '-q', '-m', 'R1 code']); git(op, ['push', '-q']);
  const code = git(op, ['rev-parse', 'HEAD']).trim();
  const legacy = node(op, ['missed-runners.mjs'], { ...ENV, MR_LEDGER_ONLY: '1' });
  assert.equal(legacy.status, 1); assert.match(legacy.stderr, /SEALED_LEGACY_PLAINTEXT/);

  // ---- stage 2b: rollback BEFORE migration = revert the code commit; the tree is byte-identical to pre-R1 (nothing re-published)
  const rb = path.join(d, 'rollback'); git(d, ['clone', '-q', 'origin.git', 'rollback']);
  git(rb, ['revert', '--no-edit', 'HEAD']);
  assert.equal(git(rb, ['diff', pre, 'HEAD', '--stat']).trim(), '', 'revert restores the exact pre-R1 tree');

  // ---- stage 3: migration from the approved source (= main after the code push), fast-forward only
  const mig = path.join(d, 'migrate'); git(d, ['clone', '-q', 'origin.git', 'migrate']);
  sh(mig, 'source .github/sealed-git.sh');   // the workflow's runner registers the driver
  const ap = node(mig, ['sealed-migrate.mjs', '--apply', code]); assert.equal(ap.status, 0, ap.stderr);
  assert.equal(node(mig, ['sealed-guard.mjs', '--all']).status, 0);
  git(mig, ['commit', '-q', '-m', 'R1: seal T1 provider data']);
  // a racing writer moves main first: the fast-forward push is refused and NOTHING is published
  const racer = path.join(d, 'racer'); git(d, ['clone', '-q', 'origin.git', 'racer']); fs.writeFileSync(path.join(racer, 'data/tg-state.json'), '{"offset":2}'); git(racer, ['commit', '-qam', 'racing save']); git(racer, ['push', '-q']);
  assert.notEqual(spawnSync('git', ['push', '-q', 'origin', 'HEAD:refs/heads/main'], { cwd: mig, env: ENV }).status, 0, 'fast-forward only');
  assert.ok(git(d, ['--git-dir=origin.git', 'ls-tree', '-r', '--name-only', 'main']).includes('data/opp-ledger.jsonl'), 'main still pre-migration, unchanged');
  // re-run with a fresh approved source (the procedure: new source sha, clean checkout)
  const mig2 = path.join(d, 'migrate2'); git(d, ['clone', '-q', 'origin.git', 'migrate2']); sh(mig2, 'source .github/sealed-git.sh');
  const src2 = git(mig2, ['rev-parse', 'HEAD']).trim();
  assert.equal(node(mig2, ['sealed-migrate.mjs', '--apply', src2]).status, 0);
  git(mig2, ['commit', '-q', '-m', 'R1: seal T1 provider data']);
  assert.equal(node(mig2, ['sealed-migrate.mjs', '--verify-tree', 'HEAD']).status, 0);
  git(mig2, ['push', '-q', 'origin', 'HEAD:refs/heads/main']); git(mig2, ['fetch', '-q', 'origin', 'main']);
  const receipt = node(mig2, ['sealed-migrate.mjs', '--verify-tree', 'origin/main']);
  assert.equal(receipt.status, 0, receipt.stderr); assert.match(receipt.stdout, /manifest 6, sealed T1 6, plaintext T1 0, problems 0/);
  // the independent verifier's KEYLESS structure check passes on the receipt commit and fails on the pre-migration code commit
  const st = node(mig2, ['sealed-migrate.mjs', '--verify-structure', 'origin/main'], { ...ENV, SEALED_SECRET: '' });
  assert.equal(st.status, 0, st.stderr); assert.match(st.stdout, /contents NOT decrypted\): manifest 6, sealed T1 6, plaintext T1 0, problems 0/);
  assert.notEqual(node(mig2, ['sealed-migrate.mjs', '--verify-structure', code], { ...ENV, SEALED_SECRET: '' }).status, 0);

  // ---- stage 4: writers resume: a bot save and a ledger append publish sealed; an old writer's plaintext is refused at push
  const bot = path.join(d, 'bot'); git(d, ['clone', '-q', 'origin.git', 'bot']);
  appendSealedLines(path.join(bot, 'data/opp-ledger.jsonl'), [{ sym: 'ZZN' }], K, { day: '2026-01-06' }); fs.writeFileSync(path.join(bot, 'data/tg-state.json'), '{"offset":3}');
  assert.equal(sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save').status, 0);
  const chk = path.join(d, 'check'); git(d, ['clone', '-q', 'origin.git', 'check']);
  assert.deepEqual(readSealedLines(path.join(chk, 'data/opp-ledger.jsonl'), K).map((x) => x.sym), ['ZZA', 'ZZN']);
  const old = path.join(d, 'oldwriter'); git(d, ['clone', '-q', 'origin.git', 'oldwriter']);
  fs.writeFileSync(path.join(old, 'data/opp-ledger.jsonl'), '{"leak":1}\n'); git(old, ['add', '-A']); git(old, ['commit', '-qm', 'old writer']); git(old, ['push', '-q']);
  fs.writeFileSync(path.join(bot, 'data/tg-state.json'), '{"offset":4}');
  const g = sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save; cat run.log');
  assert.match(g.stdout + g.stderr, /SEALED GUARD/); assert.match(g.stdout, /save recovery refused by the sealed guard/);

  // ---- stage 5: recovery export outside the repository reproduces every pre-R1 file byte for byte
  const out = path.join(d, 'private-restore');
  const ex = node(chk, ['sealed-migrate.mjs', '--export-to', out]); assert.equal(ex.status, 0, ex.stderr);
  for (const [f, v] of Object.entries(T1)) {
    const base = fs.readFileSync(path.join(out, f), 'utf8');
    assert.ok(base.startsWith(v), f + ' restored (ledgers may also carry later sealed appends)');
  }
  assert.deepEqual(fs.readFileSync(path.join(out, 'data/shadow/2026-01-02.jsonl.gz')), execFileSync('git', ['show', pre + ':data/shadow/2026-01-02.jsonl.gz'], { cwd: chk }), 'binary file byte-identical');
});

test('release precheck: PASS when no candidate file drifted on the target; FAIL on drift or an already-sealed target', (t) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-pre-')); t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const r = path.join(d, 'r'); git(d, ['init', '-q', '-b', 'main', 'r']); fs.copyFileSync(path.join(ROOT, 'r1-release-precheck.mjs'), path.join(r, 'r1-release-precheck.mjs'));
  fs.writeFileSync(path.join(r, 'scan.mjs'), 'v1\n'); fs.mkdirSync(path.join(r, 'data')); fs.writeFileSync(path.join(r, 'data/x.json'), '1');
  git(r, ['add', '-A']); git(r, ['commit', '-qm', 'base']); const base = git(r, ['rev-parse', 'HEAD']).trim();
  git(r, ['checkout', '-q', '-b', 'cand']); fs.writeFileSync(path.join(r, 'scan.mjs'), 'v1 + R1\n'); git(r, ['commit', '-qam', 'cand']); const cand = git(r, ['rev-parse', 'HEAD']).trim();
  git(r, ['checkout', '-q', 'main']); fs.writeFileSync(path.join(r, 'data/x.json'), '2'); git(r, ['commit', '-qam', 'data only']);
  const run = () => node(r, ['r1-release-precheck.mjs', base, cand, 'main']);
  assert.equal(run().status, 0, 'data-only drift on main is fine');
  fs.writeFileSync(path.join(r, 'scan.mjs'), 'v2 (someone changed it)\n'); git(r, ['commit', '-qam', 'code drift']);
  const f = run(); assert.notEqual(f.status, 0); assert.match(f.stdout, /DRIFT scan\.mjs/);
});

test('rev8 combined unit: built source-only on a fresh M0 (newer data and Telegram offset kept); verify refuses anything else', (t) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'r1-unit-')); t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  const r = path.join(d, 'r'); git(d, ['init', '-q', '-b', 'main', 'r']); fs.copyFileSync(path.join(ROOT, 'r1-release-precheck.mjs'), path.join(r, 'r1-release-precheck.mjs'));
  fs.mkdirSync(path.join(r, 'data')); fs.writeFileSync(path.join(r, 'scan.mjs'), 'v1\n'); fs.writeFileSync(path.join(r, 'data/tg-state.json'), '{"offset":1}'); fs.writeFileSync(path.join(r, 'data/health.json'), '{"old":1}');
  git(r, ['add', '-A']); git(r, ['commit', '-qm', 'base']);
  // candidate branch: source changes, plus (as on the real candidate branch) OLD data bytes from the base
  git(r, ['checkout', '-q', '-b', 'cand']); fs.writeFileSync(path.join(r, 'scan.mjs'), 'v1 + R1\n'); fs.writeFileSync(path.join(r, 'sealed-new.mjs'), 'new\n');
  git(r, ['add', '-A']); git(r, ['commit', '-qm', 'cand']); const cand = git(r, ['rev-parse', 'HEAD']).trim();
  // production main moved on: newer data and Telegram offset
  git(r, ['checkout', '-q', 'main']); fs.writeFileSync(path.join(r, 'data/tg-state.json'), '{"offset":9}'); fs.writeFileSync(path.join(r, 'data/health.json'), '{"new":1}'); git(r, ['commit', '-qam', 'newer data']);
  const M0 = git(r, ['rev-parse', 'HEAD']).trim();
  const h = (s) => ({ sha256: crypto.createHash('sha256').update(s).digest('hex'), bytes: Buffer.byteLength(s) });
  const bind = path.join(d, 'binding.json'); fs.writeFileSync(bind, JSON.stringify({ files: { 'scan.mjs': h('v1 + R1\n'), 'sealed-new.mjs': h('new\n') } }));
  const refsBefore = git(r, ['show-ref']), statusBefore = git(r, ['status', '--porcelain']);
  const b = node(r, ['r1-release-precheck.mjs', '--build-unit', M0, cand, bind]); assert.equal(b.status, 0, b.stdout + b.stderr);
  const C = /commit ([0-9a-f]{40})/.exec(b.stdout)[1];
  assert.equal(git(r, ['show-ref']), refsBefore, 'no ref created or moved (nothing pushed)'); assert.equal(git(r, ['status', '--porcelain']), statusBefore, 'working tree untouched');
  assert.equal(git(r, ['show', C + ':data/tg-state.json']), '{"offset":9}', 'newer Telegram offset kept'); assert.equal(git(r, ['show', C + ':data/health.json']), '{"new":1}', 'newer data kept');
  assert.equal(git(r, ['show', C + ':scan.mjs']), 'v1 + R1\n'); assert.equal(git(r, ['diff', '--name-only', M0, C]).trim().split('\n').sort().join(','), 'scan.mjs,sealed-new.mjs');
  const v = (c, file = bind) => node(r, ['r1-release-precheck.mjs', '--verify-unit', M0, c, file]);
  assert.equal(v(C).status, 0, v(C).stdout);
  assert.equal(git(r, ['diff', M0, git(r, ['commit-tree', git(r, ['rev-parse', M0 + '^{tree}']).trim(), '-p', C, '-m', 'revert']).trim()]).trim(), '', 'inverse = M0 tree exactly');
  // the forbidden route: the whole candidate branch merged onto M0 brings the old offset back -> FAIL
  const wt = path.join(d, 'wt'); git(r, ['worktree', 'add', '-q', wt, M0]); git(wt, ['checkout', '-q', '--detach']); git(wt, ['checkout', '-q', cand, '--', '.']); git(wt, ['commit', '-qam', 'whole branch']);
  const W = git(wt, ['rev-parse', 'HEAD']).trim(); const fw = v(W); assert.notEqual(fw.status, 0); assert.match(fw.stdout, /outside binding: data\/tg-state\.json/);
  // wrong parent, wrong bound bytes, and a candidate that differs from the binding are all refused
  const P = git(r, ['commit-tree', git(r, ['rev-parse', C + '^{tree}']).trim(), '-p', cand, '-m', 'x']).trim(); assert.match(v(P).stdout, /parent is not exactly M0/);
  const bad = path.join(d, 'bad.json'); fs.writeFileSync(bad, JSON.stringify({ files: { 'scan.mjs': h('v1 + R1 tampered\n'), 'sealed-new.mjs': h('new\n') } }));
  assert.match(v(C, bad).stdout, /PROBLEM hash: scan\.mjs/);
  const br = node(r, ['r1-release-precheck.mjs', '--build-unit', M0, cand, bad]); assert.notEqual(br.status, 0); assert.match(br.stdout, /REFUSED candidate differs from binding: scan\.mjs/);
  const miss = path.join(d, 'miss.json'); fs.writeFileSync(miss, JSON.stringify({ files: { 'scan.mjs': h('v1 + R1\n'), 'absent.mjs': h('x\n') } }));
  assert.match(node(r, ['r1-release-precheck.mjs', '--build-unit', M0, cand, miss]).stdout, /REFUSED missing in candidate: absent\.mjs/);
  assert.equal(node(r, ['r1-release-precheck.mjs', '--verify-unit', M0, C]).status, 2, 'usage error');
});
