import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const workflow=fs.readFileSync(new URL('../.github/workflows/bot.yml',import.meta.url),'utf8');
const match=/^ {10}save\(\) \{[\s\S]*?^ {10}\}/m.exec(workflow);assert.ok(match,'save function exists');
const saveFunction=match[0].split('\n').map(x=>x.slice(10)).join('\n');
function git(cwd,...args){const r=spawnSync('git',args,{cwd,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});assert.equal(r.status,0,r.stderr);return r.stdout;}
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-git-state-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const origin=path.join(dir,'origin.git');git(dir,'init','--bare','--initial-branch=main',origin);
 const seed=path.join(dir,'seed');git(dir,'clone',origin,seed);
 const config=p=>{git(p,'config','user.name','fixture');git(p,'config','user.email','fixture@example.invalid');};
 config(seed);fs.mkdirSync(path.join(seed,'data'));fs.writeFileSync(path.join(seed,'data/bot.json'),'base\n');fs.writeFileSync(path.join(seed,'data/lab.json'),'base\n');git(seed,'add','data');git(seed,'commit','-m','fixture baseline');git(seed,'push','origin','main');
 const left=path.join(dir,'left'),right=path.join(dir,'right');git(dir,'clone',origin,left);git(dir,'clone',origin,right);config(left);config(right);
 const put=(repo,file,value)=>fs.writeFileSync(path.join(repo,'data',file),value+'\n');
 const publishRight=(file,value)=>{put(right,file,value);git(right,'add','data');git(right,'commit','-m','concurrent fixture');git(right,'push');};
 const save=()=>spawnSync('bash',['-c','sleep(){ :; }\n'+saveFunction+'\nif save; then exit 0; else exit 1; fi'],{cwd:left,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
 const remote=file=>git(dir,'--git-dir='+origin,'show','main:data/'+file).trim();
 return {dir,left,right,origin,put,publishRight,save,remote};
}
test('bot save preserves concurrent nonconflicting data with real disposable Git repos',t=>{
 const f=fixture(t);f.put(f.left,'bot.json','bot update');f.publishRight('lab.json','lab update');
 const r=f.save();assert.equal(r.status,0,r.stderr);assert.equal(f.remote('bot.json'),'bot update');assert.equal(f.remote('lab.json'),'lab update');
});
test('conflicting owner-state writes fail instead of discarding either side',t=>{
 const f=fixture(t);f.put(f.left,'bot.json','local owner update');f.publishRight('bot.json','remote owner update');
 const r=f.save();assert.notEqual(r.status,0);assert.equal(f.remote('bot.json'),'remote owner update');assert.equal(fs.readFileSync(path.join(f.left,'data/bot.json'),'utf8').trim(),'local owner update');assert.match(git(f.left,'log','-1','--format=%s'),/^bot /);
});
test('publication refusal and commit failure cannot return successful save',t=>{
 const f=fixture(t);f.put(f.left,'bot.json','not published');git(f.left,'remote','set-url','--push','origin',path.join(f.dir,'missing.git'));
 assert.notEqual(f.save().status,0);assert.equal(f.remote('bot.json'),'base');assert.equal(fs.readFileSync(path.join(f.left,'data/bot.json'),'utf8').trim(),'not published');
 const g=fixture(t);g.put(g.left,'bot.json','commit blocked');const hook=path.join(g.left,'.git/hooks/pre-commit');fs.writeFileSync(hook,'#!/bin/sh\nexit 1\n',{mode:0o700});
 assert.notEqual(g.save().status,0);assert.equal(g.remote('bot.json'),'base');
});
test('bot refuses side effects on state-sync failure and never uses automatic theirs resolution',()=>{
 assert.doesNotMatch(workflow,/-X theirs/);assert.match(workflow,/state sync failed; refusing bot side effects/);assert.match(workflow,/save \|\| exit 1/);
});
