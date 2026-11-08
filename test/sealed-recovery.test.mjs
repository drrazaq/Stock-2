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
  assert.match(s.stdout, /save recovery: the unpublished commit is kept on branch save-recovery\/Telegram-bot-777-1-\d{8}T\d{15}Z-[0-9a-f]{12}/);
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

// ---------- rev6: Codex review of d02cdfea (boundaries.mjs) ----------
test('Codex d02cdfea #1: main positions {} -> NEW -> {} after the checkpoint base: the OLD checkpoint is REFUSED (causal history, not blob equality)', (t) => {
  const w = world(t), a = seedOwner(w), br = w.clone('save');
  fs.writeFileSync(path.join(br, 'data/my-positions.json'), '{"OLD":{}}'); git(br, ['commit', '-qam', 'unpublished old position']); git(br, ['push', '-q', 'origin', 'HEAD:refs/heads/save-recovery/test']);
  fs.writeFileSync(path.join(a, 'data/my-positions.json'), '{"NEW":{}}'); git(a, ['commit', '-qam', 'new position']);
  fs.writeFileSync(path.join(a, 'data/my-positions.json'), '{}'); git(a, ['commit', '-qam', 'new position closed']); git(a, ['push', '-q']);
  const r = recover(a);
  assert.match(r.stdout, /save-recovery\/test REFUSED \(data\/my-positions\.json changed on main since this save; a stale state is never replayed\); kept/); assert.match(r.stdout, /rc=1/);
  assert.equal(fs.readFileSync(path.join(w.clone('c'), 'data/my-positions.json'), 'utf8'), '{}', 'the closed position is not resurrected');
});

test('Codex d02cdfea #2: a merge commit (data-only parents, code introduced by the merge) is REFUSED; code on main unchanged', (t) => {
  const w = world(t), a = seedOwner(w), p = w.clone('save'), base = git(p, ['rev-parse', 'HEAD']).trim();
  git(p, ['checkout', '-qb', 'left']); fs.writeFileSync(path.join(p, 'data/left.json'), '{}'); git(p, ['add', '-A']); git(p, ['commit', '-qm', 'left data']);
  git(p, ['checkout', '-qb', 'right', base]); fs.writeFileSync(path.join(p, 'data/right.json'), '{}'); git(p, ['add', '-A']); git(p, ['commit', '-qm', 'right data']);
  git(p, ['checkout', '-q', 'left']); git(p, ['merge', '--no-ff', '--no-commit', 'right']);
  fs.writeFileSync(path.join(p, 'sentinel.mjs'), '// code introduced only by merge\n'); git(p, ['add', '-A']); git(p, ['commit', '-qm', 'merge with non-data resolution']);
  git(p, ['push', '-q', 'origin', 'HEAD:refs/heads/save-recovery/test']);
  const r = recover(a);
  assert.match(r.stdout, /REFUSED \(contains a merge commit; a checkpoint must be a linear chain of saves\); kept/); assert.match(r.stdout, /rc=1/);
  assert.equal(fs.readFileSync(path.join(w.clone('c'), 'sentinel.mjs'), 'utf8'), '// current reviewed code\n');
});

test('a recovery commit records Recovered-From: <tip>; only that lineage counts as "ours" on a later pass', (t) => {
  const w = world(t), a = seedOwner(w), race = w.clone('race');
  fs.writeFileSync(path.join(race, 'data/x.json'), '{"v":1}'); git(race, ['add', '-A']); git(race, ['commit', '-qm', 'cp1']); git(race, ['push', '-q', 'origin', 'HEAD:refs/heads/save-recovery/a']);
  assert.match(recover(a).stdout, /rc=0/);
  const msg = git(w.clone('c'), ['log', '-1', '--format=%B']);
  assert.match(msg, /^Recovered-From: [0-9a-f]{40}$/m);
  // a DIFFERENT lineage changing the same file after that recovery is refused (not ours), not silently replayed
  const other = w.clone('other'); git(other, ['reset', '-q', '--hard', 'HEAD~1']);
  fs.writeFileSync(path.join(other, 'data/x.json'), '{"v":"other"}'); git(other, ['add', '-A']); git(other, ['commit', '-qm', 'other lineage']); git(other, ['push', '-q', 'origin', 'HEAD:refs/heads/save-recovery/b']);
  assert.match(recover(a).stdout, /save-recovery\/b REFUSED \(data\/x\.json changed on main since this save/);
});

test('a newer checkpoint processed first supersedes its older ancestor (deleted as contained, not refused)', (t) => {
  const w = world(t), a = seedOwner(w), bot = w.clone('bot');
  fs.writeFileSync(path.join(bot, 'data/tg-state.json'), '{"offset":2}'); git(bot, ['commit', '-qam', 'c1']); const c1 = git(bot, ['rev-parse', 'HEAD']).trim();
  fs.writeFileSync(path.join(bot, 'data/tg-state.json'), '{"offset":3}'); git(bot, ['commit', '-qam', 'c2']);
  git(bot, ['push', '-q', 'origin', 'HEAD:refs/heads/save-recovery/a-newer']); git(bot, ['push', '-q', 'origin', c1 + ':refs/heads/save-recovery/b-older']);
  const r = recover(a);
  assert.match(r.stdout, /a-newer merged into main/); assert.match(r.stdout, /b-older already contained in main/); assert.match(r.stdout, /rc=0/);
  assert.equal(fs.readFileSync(path.join(w.clone('c'), 'data/tg-state.json'), 'utf8'), '{"offset":3}');
  assert.ok(!w.remoteRefs().some((x) => /save-recovery\//.test(x)));
});

// ---- rev13: bounded recovery slots (Codex c4a4fc4f7 design, reviewed): 4 fixed reservation refs, atomic admission, no UNKNOWN bypass ----
const BOT_REF = { ...ENV, GITHUB_WORKFLOW: 'Telegram bot', GITHUB_RUN_ID: '901', GITHUB_WORKFLOW_REF: 'drrazaq/Stock-2/.github/workflows/bot.yml@refs/heads/main' };
const slotRefs = (w) => w.remoteRefs().filter((x) => x.startsWith('refs/heads/r1-recovery-slot/'));
const cpRefs = (w) => w.remoteRefs().filter((x) => x.startsWith('refs/heads/save-recovery/'));
const remoteSha = (w, ref) => git(w.d, ['--git-dir=origin.git', 'rev-parse', ref]).trim();

test('rev13: the bot has ONE slot; a second bot run with a different unpublished state finds it full and evicts nothing', (t) => {
  const w = world(t); w.hook(REFUSE_MAIN);
  const b1 = w.clone('b1'); fs.writeFileSync(path.join(b1, 'data/tg-state.json'), '{"offset":2}');
  const s1 = sh(b1, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save; cat run.log', BOT_REF);
  assert.match(s1.stdout, /kept on branch save-recovery\/Telegram-bot-901-1-\S+ \(slot bot;/);
  assert.deepEqual(slotRefs(w), ['refs/heads/r1-recovery-slot/bot']); assert.equal(cpRefs(w).length, 1);
  assert.equal(remoteSha(w, 'refs/heads/r1-recovery-slot/bot'), remoteSha(w, cpRefs(w)[0]), 'the slot holds the checkpoint tip');
  const b2 = w.clone('b2'); fs.writeFileSync(path.join(b2, 'data/tg-state.json'), '{"offset":5}');
  const s2 = sh(b2, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save; cat run.log', { ...BOT_REF, GITHUB_RUN_ID: '902' });
  assert.match(s2.stdout, /slot bot is occupied by an earlier unmerged save/); assert.match(s2.stdout, /SAVE RECOVERY FULL[^\n]*nothing was evicted[^\n]*exists only on this runner/);
  assert.equal(cpRefs(w).length, 1, 'no extra checkpoint'); assert.equal(slotRefs(w).length, 1);
  assert.equal(git(b2, ['rev-list', '--count', 'origin/main..HEAD']).trim(), '1', 'still kept locally for later saves in that run');
});

test('rev13: one bot run\'s later state ADVANCES its own slot atomically (old checkpoint replaced, never more than one); recovery releases the pair', (t) => {
  const w = world(t), a = seedOwner(w), bot = w.clone('bot'); w.hook(REFUSE_MAIN);
  const s = sh(bot, `source .github/bot-save.sh && echo '{"offset":2}' > data/tg-state.json && BOT_SAVE_SLEEP=0 save && save && echo '{"offset":3}' > data/tg-state.json && save; cat run.log`, BOT_REF);
  assert.match(s.stdout, /slot bot; merged/); assert.match(s.stdout, /this unpublished state is already kept on save-recovery\//, 'the same state is not pushed twice (state survives between saves)');
  assert.match(s.stdout, /\(slot bot, replacing this run's earlier save-recovery\//);
  assert.equal(cpRefs(w).length, 1, 'exactly one checkpoint'); assert.equal(remoteSha(w, 'refs/heads/r1-recovery-slot/bot'), remoteSha(w, cpRefs(w)[0]));
  assert.equal(git(w.d, ['--git-dir=origin.git', 'show', remoteSha(w, cpRefs(w)[0]) + ':data/tg-state.json']), '{"offset":3}\n');
  w.hook(null);
  const r = recover(w.clone('next')); assert.match(r.stdout, /merged into main; branch deleted at [0-9a-f]{12} \(r1-recovery-slot\/bot released\)/); assert.match(r.stdout, /rc=0/);
  assert.equal(fs.readFileSync(path.join(w.clone('c'), 'data/tg-state.json'), 'utf8'), '{"offset":3}\n');
  assert.deepEqual(cpRefs(w), []); assert.deepEqual(slotRefs(w), [], 'slot released only together with its merged checkpoint');
});

test('rev13: shared writers get at most two slots; a third is refused with nothing created; size over the limit is refused before any push', (t) => {
  const w = world(t); w.hook(REFUSE_MAIN);
  const run = (n, id, env = {}) => { const c = w.clone(n); fs.writeFileSync(path.join(c, 'data/x-' + n + '.json'), '{"v":"' + n + '"}'); git(c, ['add', '-A']); git(c, ['commit', '-qm', n]);
    return sh(c, 'source .github/sealed-git.sh && sealed_recovery_push; echo "rc=$?"', { ...ENV, GITHUB_WORKFLOW: 'Movers', GITHUB_RUN_ID: id, ...env }); };
  assert.match(run('m1', '1').stdout, /slot shared-0/); assert.match(run('m2', '2').stdout, /slot shared-0 is occupied[\s\S]*slot shared-1;/);
  const third = run('m3', '3'); assert.match(third.stdout, /SAVE RECOVERY FULL/); assert.match(third.stdout, /rc=1/);
  assert.equal(cpRefs(w).length, 2, 'no leaked checkpoint from the refused admission'); assert.equal(slotRefs(w).length, 2);
  const big = run('m4', '4', { SEALED_RECOVERY_TEST_MAX: '10' }); assert.match(big.stdout, /refused: the unpublished data is \d+ bytes \(limit 10\)/); assert.equal(cpRefs(w).length, 2);
  const lift = run('m5', '5', { SEALED_RECOVERY_TEST_MAX: String(64 * 1024 * 1024) }); assert.match(lift.stdout, /SAVE RECOVERY FULL/, 'the test override can only LOWER the 32 MiB limit');
});

test('rev13: two writers that both saw one free slot: the server-side lease admits exactly one; the loser leaks no checkpoint', (t) => {
  const w = world(t); w.hook(REFUSE_MAIN);
  const mk = (n) => { const c = w.clone(n); fs.writeFileSync(path.join(c, 'data/' + n + '.json'), '1'); git(c, ['add', '-A']); git(c, ['commit', '-qm', n]); return c; };
  const a = mk('ra'), b = mk('rb');
  // both read the bot slot as free before pushing; the second push meets the first one's slot (atomic lease, not a listing, decides)
  const go = (c, id) => spawnSync('bash', ['-c', 'source .github/sealed-git.sh && sealed_recovery_push; echo "rc=$?"'], { cwd: c, env: { ...BOT_REF, GITHUB_RUN_ID: id }, encoding: 'utf8' });
  const ra = go(a, '11'), rb = go(b, '12');
  assert.equal([ra, rb].filter((x) => /rc=0/.test(x.stdout)).length, 1, ra.stdout + rb.stdout);
  assert.equal(cpRefs(w).length, 1); assert.equal(slotRefs(w).length, 1);
});

test('rev13: an unclear push reply is reconciled read-only (no second checkpoint); a failed read-back is UNKNOWN and tries no other slot', (t) => {
  const w = world(t); w.hook(REFUSE_MAIN);
  const c = w.clone('amb'); fs.writeFileSync(path.join(c, 'data/a.json'), '1'); git(c, ['add', '-A']); git(c, ['commit', '-qm', 'a']);
  // the push lands but its reply is lost (exit 1)
  const amb = sh(c, 'source .github/sealed-git.sh && git() { if [ "$1" = push ]; then command git "$@"; return 1; fi; command git "$@"; }; sealed_recovery_push; echo "rc=$?"', ENV);
  assert.match(amb.stdout, /slot shared-0; confirmed after an unclear reply/); assert.match(amb.stdout, /rc=0/); assert.equal(cpRefs(w).length, 1);
  const d = w.clone('unk'); fs.writeFileSync(path.join(d, 'data/b.json'), '1'); git(d, ['add', '-A']); git(d, ['commit', '-qm', 'b']);
  const unk = sh(d, 'source .github/sealed-git.sh && git() { case "$1" in push|ls-remote) return 1 ;; esac; command git "$@"; }; sealed_recovery_push; echo "rc=$?"', ENV);
  assert.match(unk.stdout, /save recovery state UNKNOWN \(the recovery branches could not be read back\); no further attempt/); assert.match(unk.stdout, /rc=1/);
  assert.equal(cpRefs(w).length, 1, 'nothing more created'); assert.equal(slotRefs(w).length, 1);
});

test('rev13: cleanup deletes a checkpoint and its slot together or not at all; a slot without a checkpoint is kept and reported', (t) => {
  const w = world(t), a = seedOwner(w), bot = w.clone('bot'); w.hook(REFUSE_MAIN);
  fs.writeFileSync(path.join(bot, 'data/tg-state.json'), '{"offset":2}'); sh(bot, 'source .github/bot-save.sh && BOT_SAVE_SLEEP=0 save', BOT_REF);
  w.hook(null);
  // a racing producer moves the slot after the pass read it: the paired delete fails, both stay
  fs.writeFileSync(path.join(w.d, 'origin.git/hooks/post-receive'), '#!/bin/sh\nwhile read old new ref; do [ "$ref" = refs/heads/main ] && git update-ref refs/heads/r1-recovery-slot/bot $(git rev-parse refs/heads/main); done; exit 0\n', { mode: 0o755 });
  const r = recover(w.clone('n1')); assert.match(r.stdout, /could not be deleted after merging [0-9a-f]{12}; KEPT for the next pass/); assert.match(r.stdout, /rc=1/);
  assert.equal(cpRefs(w).length, 1, 'checkpoint kept'); assert.equal(slotRefs(w).length, 1, 'slot kept');
  fs.rmSync(path.join(w.d, 'origin.git/hooks/post-receive'));
  // now the slot holds a tip that no checkpoint has: reported, never released silently
  const r2 = recover(w.clone('n2')); assert.match(r2.stdout, /r1-recovery-slot\/bot holds [0-9a-f]{12} but no save-recovery branch has that tip; slot KEPT/); assert.match(r2.stdout, /rc=1/);
  assert.equal(slotRefs(w).length, 1);
});
