// Execute the actual workflow run bodies with generated local bytes and stubbed producers/saves.
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import {spawnSync} from 'node:child_process';
const root=path.resolve(import.meta.dirname,'..');
const y=fs.readFileSync(path.join(root,'.github/workflows/Smart-money.yml'),'utf8');
const blocks=y.split(/^      - /m).slice(1);
const producer=blocks.find(b=>b.includes('node events-study.mjs'));
const saver=blocks.find(b=>b.includes('PF=0; if'));
function body(b){const m=b.match(/        run: \|\n([\s\S]*?)(?=^        [a-z]|$(?![\s\S]))/m);assert.ok(m);return m[1].split('\n').map(l=>l.replace(/^          /,'')).join('\n');}
for(const [name,rc,skipped] of [['successful',0,false],['UNKNOWN',3,false],['failed',1,false],['skipped',0,true]])test(name+' staging selects only the safe save route',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'smart-stage-'));
 try{
 fs.mkdirSync(path.join(d,'.github'));fs.mkdirSync(path.join(d,'data'));fs.mkdirSync(path.join(d,'bin'));
 fs.writeFileSync(path.join(d,'data/events-cache.json.gz'),'original canonical');
 fs.writeFileSync(path.join(d,'.github/private-cache.sh'),`exit ${rc}\n`);
 fs.writeFileSync(path.join(d,'.github/private-outputs.sh'),'printf "%s\\n" "$1" >> calls\n');
 fs.writeFileSync(path.join(d,'bin/node'),'#!/bin/sh\nexit 0\n',{mode:0o755});
 const env={...process.env,PATH:path.join(d,'bin')+':'+process.env.PATH,GITHUB_OUTPUT:path.join(d,'output')};
 const p=skipped?null:spawnSync('bash',['-eo','pipefail','-c',body(producer)],{cwd:d,env,encoding:'utf8'});
 if(p)assert.equal(p.status,rc);
 const outcome=skipped?'skipped':p.status===0?'success':'failure';
 const outputs=fs.existsSync(env.GITHUB_OUTPUT)?fs.readFileSync(env.GITHUB_OUTPUT,'utf8'):'';
 // GitHub continue-on-error changes conclusion, but never outcome; success() alone is true here.
 let script=body(saver).split('git config user.name')[0];
 script=script.replace(/\$\{\{\s*(.*?)\s*\}\}/g,(_,expr)=>{
 const e=expr.replace(/success\(\)/g,'true').replace(/steps\.evstudy\.outcome/g,JSON.stringify(outcome)).replace(/steps\.evstudy\.outputs\.staged/g,JSON.stringify(outputs.includes('staged=1')?'1':''));
 assert.match(e,/^[\w\s"'=.&|!()-]+$/);return String(Function('return ('+e+')')());
 });
 script+='\n[ "$PF" = 0 ] || exit 1\n';
 const s=spawnSync('bash',['-e','-c',script],{cwd:d,env,encoding:'utf8'});
 assert.equal(fs.readFileSync(path.join(d,'calls'),'utf8').trim(),name==='successful'?'save':'retain-failed');
 assert.equal(s.status,name==='successful'?0:1,'non-success remains visibly failed');
 assert.equal(fs.readFileSync(path.join(d,'data/events-cache.json.gz'),'utf8'),'original canonical');
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});
