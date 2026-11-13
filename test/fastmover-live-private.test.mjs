// Owner-mark-filtered live output must use the canonical private route. Generated payload and disposable local repositories only.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
const ROOT = process.env.PRIVACY_ROUTE_REVIEW_ROOT || path.resolve(import.meta.dirname, '..');
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

test('actual manifest must keep owner-mark-filtered fastmover-live output out of the public stage',()=>{const w=world('private-data-mode');try{fs.copyFileSync(path.join(ROOT,'.github/private-files.txt'),path.join(w.job,'.github/private-files.txt'));fs.writeFileSync(path.join(w.job,'data/fastmover-live.json'),JSON.stringify({list:[{sym:'ZZOWNERFILTERED'}]}));execFileSync('node',['.github/save-privacy-guard.mjs'],{cwd:w.job,env:{...process.env,SAVE_GUARD_PHASE:'stage'}});assert.ok(!g(w.job,'diff','--cached','--name-only').split('\n').includes('data/fastmover-live.json'),'owner-derived live list must not be staged publicly');}finally{fs.rmSync(w.top,{recursive:true,force:true});}});

test('the live producer retains the private list on an interrupted or failed save',()=>{const s=fs.readFileSync(path.join(ROOT,'.github/workflows/movers.yml'),'utf8');assert.match(s,/MODE=live node fastmover-lab\.mjs/);const retain=s.split('\n').filter(x=>x.includes('private-outputs.sh retain-failed'));assert.equal(retain.length,2);for(const line of retain)assert.match(line,/\bfastmover-live\.json\b/);assert.match(s,/private-data\.sh pull/);assert.match(s,/private-outputs\.sh save/);});
