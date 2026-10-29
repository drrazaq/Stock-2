import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const workflow=fs.readFileSync(new URL('../.github/workflows/Smart-money.yml',import.meta.url),'utf8');
const block=workflow.split('      - if: always()\n        run: |\n')[1]?.split('\n      - if:')[0];
assert.ok(block,'actual workflow publication block must exist');
const script=block.split('\n').map(x=>x.replace(/^          /,'')).join('\n');
for(const fault of ['commit_refused','all_pushes_refused','frozen_conflict','success'])test('Smart-money exact save block: '+fault,t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stock2-writer-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const env={PATH:process.env.PATH,HOME:dir,GIT_AUTHOR_NAME:'fixture',GIT_AUTHOR_EMAIL:'fixture@example.invalid',GIT_COMMITTER_NAME:'fixture',GIT_COMMITTER_EMAIL:'fixture@example.invalid',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'};
 const run=(cmd,args,cwd=dir,e=env)=>spawnSync(cmd,args,{cwd,env:e,encoding:'utf8'});
 const git=(cwd,...args)=>{const r=run('git',args,cwd);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 const real=run('sh',['-c','command -v git']).stdout.trim(),origin=path.join(dir,'origin.git'),job=path.join(dir,'job');
 git(dir,'init','--bare',origin);git(dir,'clone',origin,job);git(job,'checkout','-b','fixture');fs.mkdirSync(path.join(job,'data'));const file='data/events-study.json';fs.writeFileSync(path.join(job,file),'original\n');git(job,'add','data');git(job,'commit','-m','seed');git(job,'push','-u','origin','fixture');const seed=git(job,'rev-parse','HEAD');fs.writeFileSync(path.join(job,file),'local new frozen result\n');
 const bin=path.join(dir,'bin');fs.mkdirSync(bin);const executable=(name,text)=>{const p=path.join(bin,name);fs.writeFileSync(p,text,{mode:0o755});};executable('sleep','#!/bin/sh\nexit 0\n');
 if(fault==='commit_refused')fs.writeFileSync(path.join(job,'.git/hooks/pre-commit'),'#!/bin/sh\nexit 1\n',{mode:0o755});
 if(fault==='all_pushes_refused')executable('git','#!/bin/sh\nif [ "$1" = push ]; then exit 1; fi\nexec '+real+' "$@"\n');
 let remoteExpected=seed;
 if(fault==='frozen_conflict'){
  const other=path.join(dir,'other');git(dir,'clone','--branch','fixture',origin,other);fs.writeFileSync(path.join(other,file),'upstream frozen result\n');git(other,'add','data');git(other,'commit','-m','concurrent result');git(other,'push');remoteExpected=git(other,'rev-parse','HEAD');
 }
 const result=run('bash',['-c',script],job,{...env,PATH:bin+path.delimiter+env.PATH});
 assert.equal(result.status,fault==='success'?0:1,result.stdout+result.stderr);
 const remote=git(dir,'--git-dir='+origin,'rev-parse','refs/heads/fixture');
 if(fault==='success'){assert.notEqual(remote,seed);assert.equal(git(dir,'--git-dir='+origin,'show','refs/heads/fixture:'+file),'local new frozen result');}
 else {assert.equal(remote,remoteExpected);assert.equal(fs.readFileSync(path.join(job,file),'utf8'),'local new frozen result\n');if(fault==='frozen_conflict')assert.equal(git(job,'show','HEAD:'+file),'local new frozen result');}
});
