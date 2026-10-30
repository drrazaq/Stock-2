import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
for(const workflow of ['catalyst-lab','discovery2','chain-decoder','comeback','leaders-study','confluence-lab']){
 const text=fs.readFileSync(new URL('../.github/workflows/'+workflow+'.yml',import.meta.url),'utf8');
 const runs=[...text.matchAll(/^        run: \|\n((?:          .*\n|\n)+)/gm)].map(x=>x[1].split('\n').map(l=>l.replace(/^          /,'')).join('\n'));
 const script=runs.find(s=>s.includes('git push'));assert.ok(script,'actual publication block');
 const file=script.match(/FILES="([^" ]+)/)[1];
 for(const fault of ['stage_refused','commit_refused','pull_refused','push_refused','frozen_conflict','library_conflict','nonconflicting_race','success'])test(workflow+' exact publication: '+fault,t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-lab-writer-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const env={PATH:process.env.PATH,HOME:dir,RUNNER_TEMP:path.join(dir,'artifact'),GIT_AUTHOR_NAME:'fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};fs.mkdirSync(env.RUNNER_TEMP);
  const run=(cmd,args,cwd=dir,e=env)=>spawnSync(cmd,args,{cwd,env:e,encoding:'utf8'});
  const git=(cwd,...args)=>{const r=run('git',args,cwd);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
  const real=run('sh',['-c','command -v git']).stdout.trim(),origin=path.join(dir,'origin.git'),job=path.join(dir,'job');
  git(dir,'init','--bare',origin);git(dir,'clone',origin,job);git(job,'checkout','-b','fixture');fs.mkdirSync(path.join(job,'data'));fs.writeFileSync(path.join(job,file),'base\n');if(workflow==='confluence-lab')fs.writeFileSync(path.join(job,'data/confluence-signals.json.gz'),'synthetic market-cache sentinel\n');if(workflow==='leaders-study')fs.writeFileSync(path.join(job,'data/calendar.enc'),'synthetic opaque sentinel\n');fs.writeFileSync(path.join(job,'data/strategy-library.json'),'{"strategies":[]}\n');fs.copyFileSync(new URL('../library-merge.mjs',import.meta.url),path.join(job,'library-merge.mjs'));fs.copyFileSync(path.join(job,'data/strategy-library.json'),path.join(env.RUNNER_TEMP,'library-base.json'));git(job,'add','.');git(job,'commit','-m','seed');git(job,'push','-u','origin','fixture');const seed=git(job,'rev-parse','HEAD');
  fs.writeFileSync(path.join(job,file),'job frozen result\n');fs.writeFileSync(path.join(job,'data/strategy-library.json'),'{"strategies":[{"id":"job"}]}\n');
  let expected=seed;
  if(['frozen_conflict','library_conflict','nonconflicting_race'].includes(fault)){
   const other=path.join(dir,'other');git(dir,'clone','--branch','fixture',origin,other);fs.writeFileSync(path.join(other,fault==='frozen_conflict'?file:fault==='library_conflict'?'data/strategy-library.json':'data/unrelated.json'),fault==='library_conflict'?'{"strategies":[{"id":"other"}]}\n':'upstream result\n');git(other,'add','data');git(other,'commit','-m','upstream');git(other,'push');expected=git(other,'rev-parse','HEAD');
  }
  const bin=path.join(dir,'bin');fs.mkdirSync(bin);const executable=(n,s)=>fs.writeFileSync(path.join(bin,n),s,{mode:0o755});executable('sleep','#!/bin/sh\nexit 0\n');
  if(fault==='commit_refused')fs.writeFileSync(path.join(job,'.git/hooks/pre-commit'),'#!/bin/sh\necho reached > "$RUNNER_TEMP/fault-reached"\nexit 1\n',{mode:0o755});
  if(['stage_refused','pull_refused','push_refused'].includes(fault))executable('git','#!/bin/sh\nif [ "$1" = '+(fault==='stage_refused'?'add':fault==='pull_refused'?'pull':'push')+' ]; then echo reached > "$RUNNER_TEMP/fault-reached"; exit 1; fi\nexec '+real+' "$@"\n');
  const r=run('bash',['-c',script],job,{...env,PATH:bin+path.delimiter+env.PATH});const success=['success','nonconflicting_race'].includes(fault);assert.equal(r.status,success?0:1,r.stdout+r.stderr);
  if(workflow==='confluence-lab'){assert.equal(fs.existsSync(path.join(env.RUNNER_TEMP,'run-out/data/confluence-signals.json.gz')),false);assert.equal(fs.existsSync(path.join(env.RUNNER_TEMP,'run-out/data/confluence-run.log')),false);assert.equal(fs.existsSync(path.join(env.RUNNER_TEMP,'run-out/data/strategy-library.json')),true);assert.match(text,/retention-days: 3/);}
  if(workflow==='leaders-study'){assert.equal(fs.existsSync(path.join(env.RUNNER_TEMP,'run-out/data/calendar.enc')),false);assert.equal(fs.existsSync(path.join(env.RUNNER_TEMP,'run-out/run.log')),false);assert.match(text,/retention-days: 3/);}
  if(['stage_refused','commit_refused','pull_refused','push_refused'].includes(fault))assert.equal(fs.readFileSync(path.join(env.RUNNER_TEMP,'fault-reached'),'utf8').trim(),'reached');
  const remote=git(dir,'--git-dir='+origin,'rev-parse','refs/heads/fixture');assert.equal(fs.readFileSync(path.join(env.RUNNER_TEMP,'run-out',file),'utf8'),'job frozen result\n');assert.equal(fs.readFileSync(path.join(job,file),'utf8'),'job frozen result\n');
  if(success){assert.notEqual(remote,seed);assert.equal(git(dir,'--git-dir='+origin,'show','refs/heads/fixture:'+file),'job frozen result');if(fault==='nonconflicting_race')assert.equal(git(dir,'--git-dir='+origin,'show','refs/heads/fixture:data/unrelated.json'),'upstream result');}
  else {assert.equal(remote,expected);if(fault==='library_conflict'){assert.equal(git(job,'show','HEAD:data/strategy-library.json'),'{"strategies":[{"id":"job"}]}');assert.equal(git(dir,'--git-dir='+origin,'show','refs/heads/fixture:data/strategy-library.json'),'{"strategies":[{"id":"other"}]}');}if(fault==='frozen_conflict'){assert.equal(git(job,'show','HEAD:'+file),'job frozen result');assert.equal(git(dir,'--git-dir='+origin,'show','refs/heads/fixture:'+file),'upstream result');}}
 });
}
