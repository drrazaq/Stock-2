// Directory publication boundary: ONLY three canonical directory entries extend the accepted scalar/private-* guard.
// Real staging, outgoing history and native pre-push against disposable LOCAL bare repositories; synthetic bytes only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const ROOT=path.resolve(import.meta.dirname,'..');
const MODULE=process.env.SAVE_DIRECTORY_GUARD_MODULE||path.join(ROOT,'.github/save-privacy-guard.mjs');
const {guardPublicSave}=await import(pathToFileURL(MODULE).href);
const ENV={...process.env,GIT_AUTHOR_NAME:'t',GIT_AUTHOR_EMAIL:'t@t',GIT_COMMITTER_NAME:'t',GIT_COMMITTER_EMAIL:'t@t',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
const g=(cwd,...args)=>execFileSync('git',args,{cwd,env:ENV,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const put=(d,f,s)=>{fs.mkdirSync(path.dirname(path.join(d,f)),{recursive:true});fs.writeFileSync(path.join(d,f),s);};
const MANIFEST='my-positions.json\nshadow/\nignition-runs/\nshadow-outcomes/\n';
function world(oldPrivate=false){
 const top=fs.mkdtempSync(path.join(os.tmpdir(),'directory-guard-')),origin=path.join(top,'origin.git'),job=path.join(top,'job');
 g(top,'init','-q','--bare','-b','main',origin);g(top,'clone','-q',origin,job);
 put(job,'.github/private-files.txt',MANIFEST);put(job,'.github/save-privacy-guard.mjs',fs.readFileSync(MODULE));
 put(job,'.github/hooks/pre-push',fs.readFileSync(path.join(ROOT,'.github/hooks/pre-push')));fs.chmodSync(path.join(job,'.github/hooks/pre-push'),0o755);
 put(job,'data/public.json','{"v":0}\n');if(oldPrivate)put(job,'data/shadow/old.json','old synthetic evidence');
 g(job,'add','-A');g(job,'commit','-qm','baseline');g(job,'push','-qu','origin','main');g(job,'config','core.hooksPath','.github/hooks');
 return {top,origin,job,base:g(job,'rev-parse','HEAD').trim()};
}
const guard=(w,phase='stage')=>guardPublicSave({cwd:w.job,manifest:path.join(w.job,'.github/private-files.txt'),phase,env:ENV});
const head=w=>g(w.top,'--git-dir',w.origin,'rev-parse','main').trim();
test('stage excludes all private directory descendants, unstages earlier additions, and preserves similarly named public files',()=>{
 const w=world();try{
  for(const f of ['shadow/day.jsonl.gz','ignition-runs/day/deep/receipt.json','shadow-outcomes/day.json'])put(w.job,'data/'+f,'synthetic owner evidence');
  put(w.job,'data/public.json','{"v":1}\n');put(w.job,'data/shadow-sibling.json','public');g(w.job,'add','data');
  guard(w);assert.deepEqual(g(w.job,'diff','--cached','--name-only').trim().split('\n'),['data/public.json','data/shadow-sibling.json']);
  assert.equal(fs.readFileSync(path.join(w.job,'data/ignition-runs/day/deep/receipt.json'),'utf8'),'synthetic owner evidence');
 }finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
test('only the three canonical trailing-slash directory entries are accepted; malformed/traversing manifests leave the index unchanged',()=>{
 const w=world();try{put(w.job,'data/public.json','{"v":1}\n');g(w.job,'add','data');const before=g(w.job,'diff','--cached','--name-only');
  for(const entry of ['other-dir/','shadow','shadow//','shadow/../','shadow/./','shadow/nested/','/shadow/','data/shadow/','../shadow/']){
   put(w.job,'.github/private-files.txt','my-positions.json\n'+entry+'\n');assert.throws(()=>guard(w),/PRIVATE_MANIFEST_INVALID/,entry);
   assert.equal(g(w.job,'diff','--cached','--name-only'),before,'index preserved for '+entry);
  }
 }finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
test('native pre-push rejects private directory add-and-revert history even with no final private tree change',()=>{
 const w=world();try{put(w.job,'data/shadow/day.json','synthetic');g(w.job,'add','data');g(w.job,'commit','-qm','older writer payload');
  g(w.job,'rm','-q','data/shadow/day.json');g(w.job,'commit','-qm','revert payload');
  assert.throws(()=>g(w.job,'push'),/PRIVATE_HISTORY_OUTGOING/);assert.equal(head(w),w.base);
 }finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
test('native pre-push also protects the directory root when it is a symlink; never follows or removes it',()=>{
 const w=world();try{fs.symlinkSync('synthetic-target',path.join(w.job,'data/shadow'));g(w.job,'add','data');g(w.job,'commit','-qm','root symlink');
  assert.throws(()=>g(w.job,'push'),/PRIVATE_HISTORY_OUTGOING/);assert.equal(head(w),w.base);assert.ok(fs.lstatSync(path.join(w.job,'data/shadow')).isSymbolicLink());
 }finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
test('private directory removal remains a separate migration: index and retained working evidence are preserved',()=>{
 const w=world(true);try{g(w.job,'rm','-q','--cached','data/shadow/old.json');assert.throws(()=>guard(w),/PRIVATE_REMOVAL_REQUIRES_MIGRATION/);
  assert.equal(g(w.job,'diff','--cached','--name-only','--diff-filter=D').trim(),'data/shadow/old.json');
  assert.equal(fs.readFileSync(path.join(w.job,'data/shadow/old.json'),'utf8'),'old synthetic evidence');
 }finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
test('exact-bound private role still saves a nested directory through the native hook',()=>{
 const w=world();try{put(w.job,'data/ignition-runs/day/result.json','synthetic private result');
  const env={...ENV,SAVE_PRIVATE_REPO:'1',SAVE_PRIVATE_EXPECTED_ORIGIN:w.origin};
  guardPublicSave({cwd:w.job,manifest:path.join(w.job,'.github/private-files.txt'),phase:'stage',env});g(w.job,'commit','-qm','private result');
  execFileSync('git',['push'],{cwd:w.job,env,stdio:['ignore','pipe','pipe']});
  assert.equal(g(w.top,'--git-dir',w.origin,'show','main:data/ignition-runs/day/result.json'),'synthetic private result');
 }finally{fs.rmSync(w.top,{recursive:true,force:true});}
});
