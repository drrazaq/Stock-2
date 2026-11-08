// R1 rev4: save recovery (a save that cannot reach main is pushed to a save-recovery/* branch and merged back by the bot).
// Synthetic only: throw-away local repositories (a pre-receive hook plays "main refuses pushes"), invented values, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {pathToFileURL} from 'node:url';
const ROOT=process.env.REVIEW_TREE; if(!ROOT)throw Error('set REVIEW_TREE');
const {sealedKey,writeSealedJson,readSealedJson,appendSealedLines,readSealedText}=await import(pathToFileURL(ROOT+'/sealed-store.mjs'));


const SECRET = 'synthetic-recovery-secret', K = sealedKey(SECRET);
const ENV = { PATH:path.dirname(process.execPath)+':'+process.env.PATH, SEALED_SECRET: SECRET, SEALED_MERGE_FAVOR: 'theirs', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', NODE_OPTIONS: '', GITHUB_WORKFLOW: 'Telegram bot', GITHUB_RUN_ID: '777', GITHUB_RUN_ATTEMPT: '1', TG_TOKEN: '', TG_CHAT: '' };
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
const BOT={...ENV,GITHUB_WORKFLOW_REF:'drrazaq/Stock-2/.github/workflows/bot.yml@refs/heads/main'};
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const recover=c=>sh(c,'source .github/sealed-git.sh; sealed_recover; echo "rc=$?"',BOT);
const checkpoints=w=>w.remoteRefs().filter(x=>x.startsWith('refs/heads/save-recovery/'));
const remoteTip=(w,ref)=>git(w.d,['--git-dir=origin.git','rev-parse',ref]).trim();
function checkpoint(t){const w=world(t),bot=w.clone('bot');fs.writeFileSync(path.join(bot,'data/tg-state.json'),'{"offset":2}');git(bot,['commit','-qam','state A']);const state=path.join(w.d,'state.sh');const r=sh(bot,'source .github/sealed-git.sh; sealed_recovery_push; declare -p SEALED_RECOVERY_LAST SEALED_RECOVERY_REF SEALED_RECOVERY_SLOT > '+quote(state),BOT);assert.equal(r.status,0,r.stdout+r.stderr);return{w,bot,state};}
test('required warning remains reachable and the bot loop continues under actual bash -e -o pipefail',t=>{
 const w=world(t),bot=w.clone('bot');w.hook(REFUSE_ALL);fs.writeFileSync(path.join(bot,'data/tg-state.json'),'{"offset":2}');const warned=path.join(w.d,'warned');
 const r=spawnSync('bash',['--noprofile','--norc','-e','-o','pipefail','-c','source .github/bot-save.sh; BOT_SAVE_WARNED='+quote(warned)+'; BOT_SAVE_SLEEP=0 save; echo AFTER_SAVE'],{cwd:bot,env:BOT,encoding:'utf8'});
 console.log(JSON.stringify({case:'actual_shell_flags',status:r.status,warningReached:fs.existsSync(warned),continued:r.stdout.includes('AFTER_SAVE')}));assert.equal(r.status,0,'unconfirmed save must not exit before warning/continuation');assert.ok(fs.existsSync(warned));assert.match(r.stdout,/AFTER_SAVE/);
});
test('same-run later state progresses after an accepted replacement loses both reply and its first read-back',t=>{
 const {w,bot,state}=checkpoint(t);fs.writeFileSync(path.join(bot,'data/tg-state.json'),'{"offset":3}');git(bot,['commit','-qam','state B']);
 const r=sh(bot,`source .github/sealed-git.sh; source ${quote(state)}; git(){ if [ "$1" = push ]; then command git "$@"; return 1; fi; if [ "$1" = ls-remote ]; then return 1; fi; command git "$@"; }; sealed_recovery_push; echo first_rc=$?; unset -f git; echo '{"offset":4}' > data/tg-state.json; command git commit -qam 'state C'; sealed_recovery_push; echo next_rc=$?`,BOT);
 const expected=git(bot,['rev-parse','HEAD']).trim(),actual=remoteTip(w,'refs/heads/r1-recovery-slot/bot');console.log(JSON.stringify({case:'accepted_replace_then_readback_loss',laterStateDurable:actual===expected,stdout:r.stdout}));assert.equal(actual,expected,'next save with working network must reconcile its own pending B before advancing to C');assert.equal(checkpoints(w).length,1);
});
test('cleanup winning the old pair race allows this same run to readmit its later descendant',t=>{
 const {w,bot,state}=checkpoint(t);const r=recover(w.clone('consumer'));assert.match(r.stdout,/rc=0/);assert.equal(checkpoints(w).length,0);
 fs.writeFileSync(path.join(bot,'data/tg-state.json'),'{"offset":3}');git(bot,['commit','-qam','state B']);const next=sh(bot,'source .github/sealed-git.sh; source '+quote(state)+'; sealed_recovery_push',BOT);assert.equal(next.status,0,next.stdout+next.stderr);assert.equal(checkpoints(w).length,1);assert.equal(remoteTip(w,'refs/heads/r1-recovery-slot/bot'),git(bot,['rev-parse','HEAD']).trim());
 const done=recover(w.clone('consumer2'));assert.match(done.stdout,/rc=0/);assert.equal(checkpoints(w).length,0);assert.equal(fs.readFileSync(path.join(w.clone('final'),'data/tg-state.json'),'utf8'),'{"offset":3}');
});
test('replacement winning after recovery publishes old state makes stale paired deletion fail without deleting newer checkpoint',t=>{
 const {w,bot,state}=checkpoint(t);fs.writeFileSync(path.join(bot,'data/tg-state.json'),'{"offset":3}');git(bot,['commit','-qam','state B']);const expected=git(bot,['rev-parse','HEAD']).trim(),advance=path.join(w.d,'advance.sh'),out=path.join(w.d,'advance.out');
 fs.writeFileSync(advance,'#!/bin/bash\nunset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_ALTERNATE_OBJECT_DIRECTORIES\ncd '+quote(bot)+'\nsource .github/sealed-git.sh\nsource '+quote(state)+'\nsealed_recovery_push\n');
 fs.writeFileSync(path.join(w.d,'origin.git/hooks/post-receive'),'#!/bin/sh\nwhile read old new ref; do if [ "$ref" = refs/heads/main ]; then bash '+quote(advance)+' > '+quote(out)+' 2>&1; fi; done\n',{mode:0o755});
 const r=recover(w.clone('consumer'));assert.match(fs.readFileSync(out,'utf8'),/replacing this run/);assert.match(r.stdout,/KEPT for the next pass/);assert.equal(checkpoints(w).length,1);assert.equal(remoteTip(w,'refs/heads/r1-recovery-slot/bot'),expected);
 fs.rmSync(path.join(w.d,'origin.git/hooks/post-receive'));const done=recover(w.clone('consumer2'));assert.match(done.stdout,/rc=0/);assert.equal(checkpoints(w).length,0);assert.equal(fs.readFileSync(path.join(w.clone('final'),'data/tg-state.json'),'utf8'),'{"offset":3}');
});
test('same GitHub run final always-save shell can advance its earlier loop checkpoint',t=>{
 const w=world(t),bot=w.clone('bot'),env={...BOT,RUNNER_TEMP:w.d};fs.writeFileSync(path.join(bot,'data/tg-state.json'),'{"offset":2}');git(bot,['commit','-qam','loop state A']);
 const first=sh(bot,'source .github/bot-save.sh; sealed_recovery_push',env);assert.equal(first.status,0,first.stdout+first.stderr);
 w.hook(REFUSE_MAIN);fs.writeFileSync(path.join(bot,'data/tg-state.json'),'{"offset":3}');const last=sh(bot,'source .github/bot-save.sh; BOT_SAVE_SLEEP=0 save; echo FINAL_ATTEMPT_COMPLETE',env);
 const wanted=git(bot,['rev-parse','HEAD']).trim(),actual=remoteTip(w,'refs/heads/r1-recovery-slot/bot');console.log(JSON.stringify({case:'new_shell_same_run_final_save',sameRunId:env.GITHUB_RUN_ID,latestStateDurable:actual===wanted,stdout:last.stdout}));assert.equal(actual,wanted,'same run finalizer must recover verified ownership rather than falsely treating its own earlier slot as another run');assert.equal(checkpoints(w).length,1);
});
