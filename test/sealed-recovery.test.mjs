// R1 rev4: save recovery (a save that cannot reach main is pushed to a save-recovery/* branch and merged back by the bot).
// Synthetic only: throw-away local repositories (a pre-receive hook plays "main refuses pushes"), invented values, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sealedKey, writeSealedJson, readSealedJson, appendSealedLines, readSealedText } from '../sealed-store.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SECRET = 'synthetic-recovery-secret', K = sealedKey(SECRET);
const ENV = { ...process.env, SEALED_SECRET: SECRET, SEALED_MERGE_FAVOR: 'theirs', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', NODE_OPTIONS: '', GITHUB_WORKFLOW: 'Telegram bot', GITHUB_RUN_ID: '777', GITHUB_RUN_ATTEMPT: '1', TG_TOKEN: '', TG_CHAT: '' };
const git = (cwd, args) => execFileSync('git', args, { cwd, env: ENV, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const sh = (cwd, script, env = ENV) => spawnSync('bash', ['-c', script], { cwd, env, encoding: 'utf8' });
const P = (r) => path.join(r, 'data/options-shadow.json');
const REFUSE_MAIN = '#!/bin/sh\nwhile read o n r; do [ "$r" = refs/heads/main ] && exit 1; done; exit 0\n', REFUSE_ALL = '#!/bin/sh\nexit 1\n';

function world(t) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'sealed-rec-')); t.after(() => fs.rmSync(d, { recursive: true, force: true }));
  git(d, ['init', '-q', '-b', 'main', '--bare', 'origin.git']);
  const a = path.join(d, 'a'); git(d, ['init', '-q', '-b', 'main', 'a']); git(a, ['remote', 'add', 'origin', '../origin.git']);
  for (const f of ['sealed-store.mjs', 'sealed-merge.mjs', 'sealed-guard.mjs', 'sealed-recover.mjs', '.gitattributes', '.gitignore', '.github/sealed-git.sh', '.github/save-data.sh', '.github/bot-save.sh']) { fs.mkdirSync(path.dirname(path.join(a, f)), { recursive: true }); fs.copyFileSync(path.join(ROOT, f), path.join(a, f)); }
  writeSealedJson(P(a), { real: [], open: [] }, K); fs.writeFileSync(path.join(a, 'data/tg-state.json'), '{"offset":1}');
  git(a, ['add', '-A']); git(a, ['commit', '-q', '-m', 'base']); git(a, ['push', '-q', '-u', 'origin', 'main']);
  const hook = (body) => { const h = path.join(d, 'origin.git/hooks/pre-receive'); if (body) fs.writeFileSync(h, body, { mode: 0o755 }); else fs.rmSync(h, { force: true }); };
  const clone = (n) => { git(d, ['clone', '-q', 'origin.git', n]); return path.join(d, n); };
  const remoteRefs = () => git(d, ['--git-dir=origin.git', 'for-each-ref', '--format=%(refname)']).split('\n').filter(Boolean);
  return { d, clone, hook, remoteRefs };
}

test('a bot save that cannot reach main is kept on a recovery branch, then merged into main by the next recovery pass and deleted', (t) => {
  const w = world(t), bot = w.clone('bot');
  w.hook(REFUSE_MAIN);
  writeSealedJson(P(bot), { real: [{ sym: 'ZZR', paid: 2.4 }], open: [] }, K); fs.writeFileSync(path.join(bot, 'data/tg-state.json'), '{"offset":2}');
  const s = sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save; cat run.log');
  assert.match(s.stdout, /save recovery: the unpublished commit is kept on branch save-recovery\/Telegram-bot-777-1-\d{8}T\d{6}Z-[0-9a-f]{12}/);
  assert.equal(w.remoteRefs().filter((x) => /save-recovery\/Telegram-bot-777-1-/.test(x)).length, 1);
  assert.deepEqual(readSealedJson(P(w.clone('c1')), null, K).real, [], 'main unchanged while it refuses');
  // meanwhile the nightly scan saves paper calls to main (from another runner, after main accepts again)
  w.hook(null);
  const scan = w.clone('scan'); writeSealedJson(P(scan), { real: [], open: [{ sym: 'ZZP' }] }, K);
  assert.equal(sh(scan, 'SAVE_SLEEP=0 bash .github/save-data.sh scan').status, 0);
  // the NEXT bot run (a fresh runner) recovers
  const next = w.clone('next');
  const r = sh(next, 'source .github/bot-save.sh && : > run.log && bot_recover; cat run.log');
  assert.match(r.stdout, /save recovery: save-recovery\/Telegram-bot-777-1-\S+ merged into main; branch deleted at [0-9a-f]{12}/);
  const o = w.clone('check');
  assert.deepEqual(readSealedJson(P(o), null, K), { real: [{ sym: 'ZZR', paid: 2.4 }], open: [{ sym: 'ZZP' }] }, 'owner trade and paper calls both kept');
  assert.equal(fs.readFileSync(path.join(o, 'data/tg-state.json'), 'utf8'), '{"offset":2}', 'the Telegram offset is published together with the record it acknowledged');
  assert.ok(!w.remoteRefs().some((x) => /save-recovery/.test(x)), 'recovery branch deleted after the merge');
});

test('a recovery branch that clashes with main on the owner\'s trades is KEPT (not dropped) and reported; it merges once main allows', (t) => {
  const w = world(t), bot = w.clone('bot');
  w.hook(REFUSE_MAIN); writeSealedJson(P(bot), { real: [{ sym: 'ZZR' }], open: [] }, K);
  sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save');
  w.hook(null);
  const other = w.clone('other'); writeSealedJson(P(other), { real: [{ sym: 'ZZX' }], open: [] }, K); git(other, ['commit', '-qam', 'other real']); git(other, ['push', '-q']);
  const next = w.clone('next');
  const r = sh(next, 'source .github/bot-save.sh && : > run.log && bot_recover; cat run.log');
  assert.match(r.stdout, /save recovery: save-recovery\/Telegram-bot-777-1-\S+ REFUSED \(data\/options-shadow\.json\.sealed: both sides changed "real"\); kept/);
  assert.match(r.stdout, /a save-recovery branch could not be merged yet/);
  assert.ok(w.remoteRefs().some((x) => /save-recovery\/Telegram-bot-777-1-/.test(x)), 'kept');
  assert.deepEqual(readSealedJson(P(w.clone('c')), null, K).real, [{ sym: 'ZZX' }], 'main untouched');
  assert.deepEqual(git(next, ['worktree', 'list']).trim().split('\n').length, 1, 'no worktree left behind');
});

test('every save path uses recovery on final failure: nightly save-data.sh and append ledgers (segments) are recovered too', (t) => {
  const w = world(t), scan = w.clone('scan');
  w.hook(REFUSE_MAIN);
  appendSealedLines(path.join(scan, 'data/movers-journal.jsonl'), [{ d: 'scan' }], K, { day: '2026-01-05' });
  const s = sh(scan, 'SAVE_SLEEP=0 bash .github/save-data.sh scan', { ...ENV, GITHUB_WORKFLOW: 'Daily scan', GITHUB_RUN_ID: '88' });
  assert.notEqual(s.status, 0, 'the run still fails loudly'); assert.match(s.stdout + s.stderr, /kept on branch save-recovery\/Daily-scan-88-1-/);
  w.hook(null);
  const next = w.clone('next'); assert.equal(sh(next, 'source .github/bot-save.sh && : > run.log && bot_recover').status, 0);
  assert.deepEqual(readSealedText(path.join(w.clone('c'), 'data/movers-journal.jsonl'), K).trim().split('\n'), ['{"d":"scan"}']);
});

test('remaining limit, explicit: when the remote refuses BOTH main and recovery pushes, the commit exists only on that runner', (t) => {
  const w = world(t), bot = w.clone('bot');
  w.hook(REFUSE_ALL); writeSealedJson(P(bot), { real: [{ sym: 'ZZR' }], open: [] }, K);
  const s = sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save; cat run.log');
  assert.match(s.stdout, /save recovery push failed too: the unpublished commit exists only on this runner/);
  assert.equal(git(bot, ['rev-list', '--count', 'origin/main..HEAD']).trim(), '1', 'still kept locally for the next save in this run');
});

test('the recovery push is guarded: new T1 plaintext is never pushed to a recovery branch either', (t) => {
  const w = world(t), bot = w.clone('bot');
  w.hook(REFUSE_MAIN);
  fs.writeFileSync(path.join(bot, 'data/premarket.jsonl'), '{"leak":1}\n'); git(bot, ['add', '-A']); git(bot, ['commit', '-qm', 'leak (bypassing the staged guard)']);
  const s = sh(bot, 'source .github/sealed-git.sh && sealed_recovery_push');
  assert.notEqual(s.status, 0); assert.match(s.stdout + s.stderr, /SEALED GUARD.*data\/premarket\.jsonl/s);
  assert.ok(!w.remoteRefs().some((x) => /save-recovery/.test(x)));
});

test('an interrupted sealed write leaves a temp file that is ignored by git (it can never block or join a save)', (t) => {
  const w = world(t), bot = w.clone('bot');
  fs.writeFileSync(path.join(bot, 'data/options-shadow.json.sealed.tmp-123-ab'), 'partial');
  fs.writeFileSync(path.join(bot, 'data/tg-state.json'), '{"offset":5}');
  const s = sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save');
  assert.equal(s.status, 0, s.stderr);
  assert.ok(!git(w.clone('c'), ['ls-files']).includes('tmp-123'), 'never published');
  assert.equal(fs.readFileSync(path.join(w.clone('c2'), 'data/tg-state.json'), 'utf8'), '{"offset":5}', 'the save itself went through');
});

// ---------- rev5: Codex review of 292557c2 (recovery-check.mjs) reproduced against the corrected consumer ----------
const recover = (r, env = ENV) => sh(r, 'source .github/sealed-git.sh; sealed_recover; echo "rc=$?"', env);
function seedOwner(w) {
  const a = w.clone('seed'); fs.writeFileSync(path.join(a, 'data/tg-state.json'), '{"offset":1}'); fs.writeFileSync(path.join(a, 'data/my-positions.json'), '{}');
  fs.writeFileSync(path.join(a, 'sentinel.mjs'), '// current reviewed code\n'); git(a, ['add', '-A']); git(a, ['commit', '-qm', 'owner base']); git(a, ['push', '-q']); return a;
}
test('Codex #1+#2: a stale recovery (offset 2, STALE positions, plus a code file) is REFUSED: main keeps offset 9, NEW positions, current code', (t) => {
  const w = world(t), a = seedOwner(w), br = w.clone('branch');
  fs.writeFileSync(path.join(br, 'data/tg-state.json'), '{"offset":2}'); fs.writeFileSync(path.join(br, 'data/my-positions.json'), '{"STALE":{"entry":1}}'); fs.writeFileSync(path.join(br, 'sentinel.mjs'), '// stale unpublished code\n');
  git(br, ['commit', '-qam', 'old save plus code']); git(br, ['push', '-q', 'origin', 'HEAD:refs/heads/save-recovery/example']);
  fs.writeFileSync(path.join(a, 'data/tg-state.json'), '{"offset":9}'); fs.writeFileSync(path.join(a, 'data/my-positions.json'), '{"NEW":{"entry":2}}'); git(a, ['commit', '-qam', 'newer owner state']); git(a, ['push', '-q']);
  const r = recover(a);
  assert.match(r.stdout, /REFUSED \(not a data-only save; e\.g\. sentinel\.mjs\); kept/); assert.match(r.stdout, /rc=1/);
  const c = w.clone('c');
  assert.equal(fs.readFileSync(path.join(c, 'data/tg-state.json'), 'utf8'), '{"offset":9}'); assert.equal(fs.readFileSync(path.join(c, 'data/my-positions.json'), 'utf8'), '{"NEW":{"entry":2}}');
  assert.equal(fs.readFileSync(path.join(c, 'sentinel.mjs'), 'utf8'), '// current reviewed code\n');
  assert.ok(w.remoteRefs().includes('refs/heads/save-recovery/example'), 'kept for a human, not dropped');
  // the same stale DATA-ONLY recovery (no code file) is still refused: main changed the offset and positions since
  const br2 = w.clone('branch2'); git(br2, ['reset', '-q', '--hard', 'HEAD~1']);
  fs.writeFileSync(path.join(br2, 'data/tg-state.json'), '{"offset":2}'); git(br2, ['commit', '-qam', 'old offset only']); git(br2, ['push', '-q', 'origin', 'HEAD:refs/heads/save-recovery/example2']);
  const r2 = recover(a); assert.match(r2.stdout, /save-recovery\/example2 REFUSED \(data\/tg-state\.json changed on main since this save; a stale state is never replayed\); kept/);
  assert.equal(fs.readFileSync(path.join(w.clone('c2'), 'data/tg-state.json'), 'utf8'), '{"offset":9}', 'the offset never rewinds');
});

test('a runner\'s successive checkpoints (immutable refs) merge in order: offset 2 then 3, never back', (t) => {
  const w = world(t), a = seedOwner(w), bot = w.clone('bot');
  w.hook(REFUSE_MAIN);
  fs.writeFileSync(path.join(bot, 'data/tg-state.json'), '{"offset":2}'); sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save');
  fs.writeFileSync(path.join(bot, 'data/tg-state.json'), '{"offset":3}'); sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save');
  assert.equal(w.remoteRefs().filter((x) => /save-recovery\//.test(x)).length, 2, 'two immutable checkpoints, nothing overwritten');
  w.hook(null);
  const r = recover(w.clone('next')); assert.match(r.stdout, /rc=0/, r.stdout);
  assert.equal(fs.readFileSync(path.join(w.clone('c'), 'data/tg-state.json'), 'utf8'), '{"offset":3}');
  assert.ok(!w.remoteRefs().some((x) => /save-recovery\//.test(x)));
});

test('Codex #3 race: a ref advanced after its merge is NOT deleted (compare-and-delete); the newer checkpoint merges next pass', (t) => {
  const w = world(t), a = seedOwner(w), race = w.clone('race');
  fs.writeFileSync(path.join(race, 'data/recovery-proof.json'), '{"version":1}'); git(race, ['add', '-A']); git(race, ['commit', '-qm', 'checkpoint one']); git(race, ['push', '-q', 'origin', 'HEAD:refs/heads/save-recovery/race']);
  fs.writeFileSync(path.join(race, 'data/recovery-proof.json'), '{"version":2}'); git(race, ['commit', '-qam', 'checkpoint two']); const newer = git(race, ['rev-parse', 'HEAD']).trim();
  git(race, ['push', '-q', 'origin', 'HEAD:refs/heads/object-transfer']); git(race, ['push', '-q', 'origin', '--delete', 'object-transfer']);
  fs.writeFileSync(path.join(w.d, 'origin.git/hooks/post-receive'), '#!/bin/sh\nwhile read old new ref; do [ "$ref" = refs/heads/main ] && git update-ref refs/heads/save-recovery/race ' + newer + '; done\nexit 0\n', { mode: 0o755 });
  const r = recover(a);
  assert.match(r.stdout, /save-recovery\/race advanced or could not be deleted after merging [0-9a-f]{12}; KEPT for the next pass/); assert.match(r.stdout, /rc=1/);
  assert.ok(w.remoteRefs().includes('refs/heads/save-recovery/race'), 'the newer checkpoint is still there');
  fs.rmSync(path.join(w.d, 'origin.git/hooks/post-receive'));
  const r2 = recover(a); assert.match(r2.stdout, /rc=0/, r2.stdout);
  assert.equal(fs.readFileSync(path.join(w.clone('c'), 'data/recovery-proof.json'), 'utf8'), '{"version":2}', 'checkpoint two reached main (lineage rule)');
});

test('Codex #4: a failed recovery fetch is UNKNOWN (exit 2), visible, and the bot warns; nothing is assumed merged', (t) => {
  const w = world(t), a = seedOwner(w);
  const r = sh(a, 'source .github/sealed-git.sh; git remote set-url origin /nonexistent/origin.git; sealed_recover; echo "rc=$?"');
  assert.match(r.stdout, /UNKNOWN: save-recovery listing\/fetch failed/); assert.match(r.stdout, /rc=2/);
  const b = sh(a, 'source .github/bot-save.sh; git remote set-url origin /nonexistent/origin.git; : > run.log; bot_recover; cat run.log', { ...ENV, RUNNER_TEMP: w.d });
  assert.match(b.stdout, /save recovery state UNKNOWN/);
});
