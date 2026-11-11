// Cross-runner save paths, real temporary Git repositories, no network/provider.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const bot=read('.github/workflows/bot.yml'),discovery=read('.github/workflows/discover.yml');
const saveBot=bot.match(/          save\(\) \{([\s\S]*?)\n          \}/)?.[0].split('\n').map(x=>x.slice(10)).join('\n');
const saveDiscovery=discovery.slice(discovery.indexOf('          git config user.name'),discovery.indexOf('      # If anything above failed')).split('\n').map(x=>x.startsWith('          ')?x.slice(10):x).join('\n');
assert.ok(saveBot?.includes('git pull -q --rebase'));assert.ok(saveDiscovery.includes('git pull --rebase -X theirs'));
const source=read('discover.mjs'),start=source.indexOf("{\n const journal=readRadarLedger('data/discovery-journal.jsonl');"),end=source.indexOf("\n}\n",start)+2,producer=source.slice(start,end);
assert.ok(start>0&&producer.includes('assessmentCycleRows(queue)'));
for(const order of ['bot-first','discovery-first'])test('actual '+order+' saves preserve discovery and assessment rows',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'assessment-git-save-'));
 try{
 const remote=path.join(tmp,'origin.git'),seed=path.join(tmp,'seed');
 fs.mkdirSync(seed);git(tmp,'init','--bare',remote);git(seed,'init','-b','main');git(seed,'config','user.name','test');git(seed,'config','user.email','test@example.invalid');
 fs.mkdirSync(path.join(seed,'data'));fs.writeFileSync(path.join(seed,'data/discovery-journal.jsonl'),'{"sym":"OLD","d":"2020-01-01","price":1,"spy":1}\n');
 fs.writeFileSync(path.join(seed,'data/signals.json'),JSON.stringify({session:'2026-11-06',stocks:[{sym:'AAA',state:'Buy watch',rule:'retained rule'}]}));
 fs.writeFileSync(path.join(seed,'data/quality.json'),JSON.stringify({to:'2026-11-06',today:[{sym:'CCC',q:.9}]}));
 fs.writeFileSync(path.join(seed,'data/earnings-recent.json'),JSON.stringify({reports:[{sym:'BBB',d:'2026-11-06',a:-1,e:-.5}]}));
 fs.mkdirSync(path.join(seed,'.github'));fs.writeFileSync(path.join(seed,'.github/merge-alert-state.mjs'),read('.github/merge-alert-state.mjs'));
 git(seed,'add','.');git(seed,'commit','-m','seed');git(seed,'remote','add','origin',remote);git(seed,'push','-u','origin','main');git(tmp,'--git-dir='+remote,'symbolic-ref','HEAD','refs/heads/main');
 const dirs={};for(const n of ['bot','discovery']){dirs[n]=path.join(tmp,n);git(tmp,'clone',remote,dirs[n]);git(dirs[n],'config','user.name','test');git(dirs[n],'config','user.email','test@example.invalid');}
 // Actual discover.mjs producer block, importing the candidate implementation.
 const moduleURL=p=>'file://'+path.join(root,p);
 const js="import fs from 'node:fs';import {appendRadarRows,readRadarLedger} from "+JSON.stringify(moduleURL('radar-ledger.mjs'))+";import {frozenAssessmentQueue,assessmentCycleRows} from "+JSON.stringify(moduleURL('discovery-runtime.mjs'))+";const now=Date.parse('2026-11-09T17:18:16Z');const readJson=(p,d)=>{try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return d}};"+producer;
 execFileSync(process.execPath,['--input-type=module','-e',js],{cwd:dirs.discovery});
 execFileSync(process.execPath,['--input-type=module','-e',js],{cwd:dirs.discovery});
 fs.appendFileSync(path.join(dirs.discovery,'data/discovery-journal.jsonl'),'{"sym":"NEW","d":"2026-11-06","price":2,"spy":600}\n');
 // Read-only bot caller is checked in assessment-triage actual-caller test.
 // Its real save path still publishes unrelated Telegram state concurrently.
 fs.writeFileSync(path.join(dirs.bot,'data/tg-state.json'),'{"offset":42}\n');
 const commands={bot:saveBot+'\nsave\n',discovery:saveDiscovery};
 for(const n of (order==='bot-first'?['bot','discovery']:['discovery','bot']))execFileSync('bash',['-e','-c',commands[n]],{cwd:dirs[n],encoding:'utf8',timeout:30000});
 const result=git(seed,'--git-dir='+remote,'show','main:data/discovery-journal.jsonl'),rows=result.trim().split('\n').map(JSON.parse);
 assert.equal(rows.filter(r=>r.type==='assessment-cycle').length,1);
 assert.equal(rows.filter(r=>r.type==='assessment').length,3);
 assert.equal(rows.filter(r=>r.sym==='OLD').length,1);assert.equal(rows.filter(r=>r.sym==='NEW').length,1);
 assert.equal(JSON.parse(git(seed,'--git-dir='+remote,'show','main:data/tg-state.json')).offset,42);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
