// P0 Route A (development): the PUBLIC save always protects private paths, including without a cutover marker, and never
// commits the owner's private files, even when private-data.sh pull has put current copies into data/; public files still save, a
// concurrent origin change still rebases, and the private repository's own save (SAVE_PRIVATE_REPO=1) keeps everything. Throw-away repos.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const ROOT = path.resolve(import.meta.dirname, '..');
const SCRIPT=process.env.SAVE_REVIEW_SCRIPT||path.join(ROOT,'.github/save-data.sh');
const g = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
function world(marker) {
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'save-guard-')), origin = path.join(top, 'origin.git'), job = path.join(top, 'job'), other = path.join(top, 'other');
  g(top, 'init', '-q', '--bare', '-b', 'main', origin); g(top, 'clone', '-q', origin, job);
  fs.mkdirSync(path.join(job, '.github'), { recursive: true }); fs.mkdirSync(path.join(job, 'data'));
  for (const f of ['save-data.sh', 'merge-alert-state.mjs', 'save-privacy-guard.mjs']) fs.copyFileSync(f==='save-data.sh'?SCRIPT:path.join(ROOT, '.github', f), path.join(job, '.github', f));
  fs.writeFileSync(path.join(job, '.github/private-files.txt'), '# list\nmy-positions.json\nsignals-private.json\n');
  fs.writeFileSync(path.join(job, 'data/my-positions.json'), '{"OLD":1}\n'); fs.writeFileSync(path.join(job, 'data/signals.json'), '{"v":0}\n');
  g(job, 'add', '-A'); g(job, 'commit', '-qm', 'base'); g(job, 'push', '-q', 'origin', 'HEAD:main'); g(job, 'branch', '-q', '--set-upstream-to=origin/main');
  g(top, 'clone', '-q', origin, other); fs.writeFileSync(path.join(other, 'data/other.json'), '{}\n'); g(other, 'add', '-A'); g(other, 'commit', '-qm', 'concurrent'); g(other, 'push', '-q');
  if (marker) { fs.writeFileSync(path.join(job, '.github', marker), 'on\n'); }
  // what private-data.sh pull does in private mode: current private copies land in data/
  fs.writeFileSync(path.join(job, 'data/my-positions.json'), '{"PRIVATE_NOW":1}\n'); fs.writeFileSync(path.join(job, 'data/signals-private.json'), '{"posVerdict":{}}\n');
  fs.writeFileSync(path.join(job, 'data/signals.json'), '{"v":1}\n');
  return { top, origin, job };
}
const run = (job, env = {}) => /* PRIVATE_SAVE_OK defaults on for the marker tests below; the floor test overrides */ execFileSync('bash', ['.github/save-data.sh', 'scan test'], { cwd: job, encoding: 'utf8', env: { ...process.env, SAVE_SLEEP: '0', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', ...env } });
const atOrigin = (w, p) => { try { return g(w.top, '--git-dir', w.origin, 'show', 'main:' + p); } catch { return null; } };
for (const marker of ['private-data-mode', 'private-data-sealed']) test('public save with ' + marker + ': private files never published, public files and rebase still work', () => {
  const w = world(marker); try {
    run(w.job, { PRIVATE_SAVE_OK: '1' });   // private persistence confirmed by the private route
    assert.equal(atOrigin(w, 'data/my-positions.json'), '{"OLD":1}\n', 'the stale public copy is not replaced by the private one');
    assert.equal(atOrigin(w, 'data/signals-private.json'), null, 'the private scan record is never published');
    assert.equal(atOrigin(w, 'data/signals.json'), '{"v":1}\n'); assert.equal(atOrigin(w, 'data/other.json'), '{}\n', 'concurrent origin change kept (rebase ran)');
    assert.equal(fs.readFileSync(path.join(w.job, 'data/my-positions.json'), 'utf8'), '{"PRIVATE_NOW":1}\n', 'the job keeps its private working copy');
  } finally { fs.rmSync(w.top, { recursive: true, force: true }); }
});
test('privacy floor without any marker: private files are never published, and unconfirmed private persistence fails visibly (exit 3)', () => {
  const w = world(null); try {
    let code = 0; try { run(w.job); } catch (e) { code = e.status; }
    assert.equal(code, 3, 'owner update not acked as durable');
    assert.equal(atOrigin(w, 'data/my-positions.json'), '{"OLD":1}\n'); assert.equal(atOrigin(w, 'data/signals-private.json'), null);
    assert.equal(atOrigin(w, 'data/signals.json'), '{"v":1}\n', 'public part still saved');
    run(w.job, { PRIVATE_SAVE_OK: '1' });   // after a verified private push the same save succeeds without publishing private files
    assert.equal(atOrigin(w, 'data/my-positions.json'), '{"OLD":1}\n');
  } finally { fs.rmSync(w.top, { recursive: true, force: true }); }
});
test('the private repository save (SAVE_PRIVATE_REPO=1) keeps the private files even with the marker present', () => {
  const w = world('private-data-mode'); try { run(w.job, { SAVE_PRIVATE_REPO: '1', SAVE_PRIVATE_EXPECTED_ORIGIN:w.origin }); assert.equal(atOrigin(w, 'data/my-positions.json'), '{"PRIVATE_NOW":1}\n'); } finally { fs.rmSync(w.top, { recursive: true, force: true }); }
});

// Additional publication-floor controls: only disposable local bare origins; no workflow or provider operations.
const originHead=w=>g(w.top,'--git-dir',w.origin,'rev-parse','main').trim();
function expectRefused(w,extra={}){const before=originHead(w);let code=0;try{run(w.job,extra);}catch(e){code=e.status;}assert.notEqual(code,0,'unsafe publication must stop');assert.equal(originHead(w),before,'public origin must not advance');}
test('outgoing private update already committed locally never reaches public origin',()=>{
 const w=world('private-data-sealed');try{g(w.job,'add','--','data/my-positions.json');g(w.job,'commit','-qm','pending earlier private write');expectRefused(w,{PRIVATE_SAVE_OK:'1'});assert.equal(atOrigin(w,'data/my-positions.json'),'{"OLD":1}\n');assert.equal(fs.readFileSync(path.join(w.job,'data/my-positions.json'),'utf8'),'{"PRIVATE_NOW":1}\n');}finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
test('outgoing private add then revert is rejected even when the final tree is harmless',()=>{
 const w=world(null);try{g(w.job,'add','--','data/my-positions.json');g(w.job,'commit','-qm','private payload');fs.writeFileSync(path.join(w.job,'data/my-positions.json'),'{"OLD":1}\n');g(w.job,'add','--','data/my-positions.json');g(w.job,'commit','-qm','revert payload');expectRefused(w,{PRIVATE_SAVE_OK:'1'});}finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
test('merged side-branch private history is rejected even with no net private merge change',()=>{
 const w=world(null);try{g(w.job,'checkout','-qb','side');g(w.job,'add','--','data/my-positions.json');g(w.job,'commit','-qm','side private payload');fs.writeFileSync(path.join(w.job,'data/my-positions.json'),'{"OLD":1}\n');g(w.job,'add','--','data/my-positions.json');g(w.job,'commit','-qm','side revert');g(w.job,'checkout','-q','main');g(w.job,'merge','--no-ff','-qm','merge side','side');expectRefused(w,{PRIVATE_SAVE_OK:'1'});}finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
test('already staged tracked, new and nested private paths remain local while public changes save',()=>{
 const w=world(null);try{fs.mkdirSync(path.join(w.job,'data/private-cache'),{recursive:true});fs.writeFileSync(path.join(w.job,'data/private-cache/record.json'),'synthetic-private');g(w.job,'add','data');run(w.job,{PRIVATE_SAVE_OK:'1'});assert.equal(atOrigin(w,'data/my-positions.json'),'{"OLD":1}\n');assert.equal(atOrigin(w,'data/signals-private.json'),null);assert.equal(atOrigin(w,'data/private-cache/record.json'),null);assert.equal(fs.readFileSync(path.join(w.job,'data/private-cache/record.json'),'utf8'),'synthetic-private');assert.equal(atOrigin(w,'data/signals.json'),'{"v":1}\n');}finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
test('ignored private update cannot receive a durable-save success without private persistence',()=>{
 const w=world(null);try{fs.writeFileSync(path.join(w.job,'data/my-positions.json'),'{"OLD":1}\n');fs.rmSync(path.join(w.job,'data/signals-private.json'));fs.writeFileSync(path.join(w.job,'.gitignore'),'data/private-*\n');g(w.job,'add','.gitignore');g(w.job,'commit','-qm','ignore private payloads');fs.writeFileSync(path.join(w.job,'data/private-hidden.json'),'synthetic-only');let code=0;try{run(w.job);}catch(e){code=e.status;}assert.equal(code,3,'ignored new state is not durably saved');assert.equal(atOrigin(w,'data/private-hidden.json'),null);assert.equal(atOrigin(w,'data/signals.json'),'{"v":1}\n');}finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
test('private binding is mandatory before any private-role save',()=>{const w=world(null);try{expectRefused(w,{SAVE_PRIVATE_REPO:'1',SAVE_PRIVATE_EXPECTED_ORIGIN:''});}finally{fs.rmSync(w.top,{recursive:true,force:true});}});
test('private binding must match the exact origin, including case-sensitive local paths',()=>{const w=world(null);try{expectRefused(w,{SAVE_PRIVATE_REPO:'1',SAVE_PRIVATE_EXPECTED_ORIGIN:w.origin.toUpperCase()});}finally{fs.rmSync(w.top,{recursive:true,force:true});}});
test('rejected push preserves private working copies and leaves origin owner state unchanged',()=>{
 const w=world(null);try{const hook=path.join(w.origin,'hooks/pre-receive');fs.writeFileSync(hook,'#!/bin/sh\nexit 1\n',{mode:0o755});let code=0;try{run(w.job,{PRIVATE_SAVE_OK:'1'});}catch(e){code=e.status;}assert.notEqual(code,0);assert.equal(atOrigin(w,'data/my-positions.json'),'{"OLD":1}\n');assert.equal(fs.readFileSync(path.join(w.job,'data/my-positions.json'),'utf8'),'{"PRIVATE_NOW":1}\n');assert.equal(fs.readFileSync(path.join(w.job,'data/signals-private.json'),'utf8'),'{"posVerdict":{}}\n');}finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
test('staged private removal requires separate migration and preserves index and owner working bytes',()=>{
 const w=world(null);try{g(w.job,'rm','--cached','-q','--','data/my-positions.json');expectRefused(w,{PRIVATE_SAVE_OK:'1'});assert.equal(g(w.job,'diff','--cached','--name-only','--diff-filter=D').trim(),'data/my-positions.json');assert.equal(fs.readFileSync(path.join(w.job,'data/my-positions.json'),'utf8'),'{"PRIVATE_NOW":1}\n');}finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
