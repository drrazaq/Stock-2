// Actual scanner and bot Git save/rebase paths; synthetic state, bare local remote only.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
import {mergeAlertState} from '../.github/merge-alert-state.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const env={PATH:process.env.PATH,GIT_AUTHOR_NAME:'synthetic',GIT_AUTHOR_EMAIL:'synthetic@example.invalid',GIT_COMMITTER_NAME:'synthetic',GIT_COMMITTER_EMAIL:'synthetic@example.invalid',SAVE_SLEEP:'0'};
const cmd=(cwd,args)=>execFileSync('git',args,{cwd,env,stdio:['ignore','pipe','pipe']}).toString();
const write=(d,p,v)=>{fs.mkdirSync(path.dirname(path.join(d,p)),{recursive:true});fs.writeFileSync(path.join(d,p),typeof v==='string'?v:JSON.stringify(v));};
const A={day:'2026-11-10',sent:{},delivery:{AAA:{status:'UNKNOWN',at:'2026-11-10T15:00:00Z'}}},B={day:'2026-11-10',sent:{BBB:1},delivery:{}};
test('merge is monotonic for unknown intent, suppression, divergent reservations and corrupt originals',()=>{
 for(const [a,b]of [[A,B],[B,A]]){const x=mergeAlertState(a,b);assert.equal(x.delivery.AAA.status,'UNKNOWN');assert.equal(x.sent.BBB,1);}
 const x=mergeAlertState(A,{...B,delivery:{AAA:{status:'RESERVED',at:'2026-11-10T15:01:00Z'}}});assert.equal(x.delivery.AAA.status,'UNKNOWN');assert.equal(x.delivery.AAA.alternatives.length,2);
 for(const v of [{},[],{day:'bad',sent:{}},{day:'2026-11-10',sent:{},delivery:[]}])assert.throws(()=>mergeAlertState(A,v));
});
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'actual-save-evidence-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const bare=path.join(dir,'remote.git'),seed=path.join(dir,'seed'),scanner=path.join(dir,'scanner'),bot=path.join(dir,'bot');
 fs.mkdirSync(seed);cmd(seed,['init','--bare','-b','main',bare]);cmd(seed,['init','-b','main']);
 for(const p of ['.github/save-data.sh','.github/merge-alert-state.mjs','.github/workflows/bot.yml'])write(seed,p,fs.readFileSync(path.join(root,p),'utf8'));
 write(seed,'data/alert-state.json',{day:'2026-11-10',sent:{}});write(seed,'data/my-positions.json','{ "AAA": {"entry":10,"stop":8} }\n');write(seed,'data/my-trades.jsonl','{"synthetic":"original"}\n');write(seed,'data/tg-state.json','{"offset":42}\n');
 cmd(seed,['add','.']);cmd(seed,['commit','-qm','synthetic baseline']);cmd(seed,['remote','add','origin',bare]);cmd(seed,['push','-u','origin','main']);cmd(dir,['clone',bare,scanner]);cmd(dir,['clone',bare,bot]);
 const yaml=fs.readFileSync(path.join(bot,'.github/workflows/bot.yml'),'utf8'),match=yaml.match(/          save\(\) \{\n[\s\S]*?\n          \}/);assert.ok(match,'actual workflow save function located');
 const body=match[0].split('\n').map(l=>l.slice(10)).join('\n');write(bot,'actual-bot-save.sh',body+'\nsave\n');
 return {dir,bare,scanner,bot,read:p=>cmd(seed,['--git-dir='+bare,'show','main:'+p])};
}
for(const order of ['scanner-first','bot-first'])test('actual two-clone save/rebase preserves UNKNOWN and owner bytes: '+order,async t=>{
 const f=await fixture(t);write(f.scanner,'data/alert-state.json',A);write(f.bot,'data/alert-state.json',B);
 const owner='{ "AAA": {"entry":10,"stop":9}, "BBB":{"entry":20} }\n',trade='{"synthetic":"original"}\n{"synthetic":"new owner record"}\n';
 write(f.bot,'data/my-positions.json',owner);write(f.bot,'data/my-trades.jsonl',trade);write(f.bot,'data/tg-state.json','{"offset":43}\n');
 const scan=()=>execFileSync('bash',[path.join(f.scanner,'.github/save-data.sh'),'synthetic scanner save'],{cwd:f.scanner,env,stdio:['ignore','pipe','pipe']});
 const bot=()=>execFileSync('bash',['actual-bot-save.sh'],{cwd:f.bot,env,stdio:['ignore','pipe','pipe']});
 if(order==='scanner-first'){scan();bot();}else{bot();scan();}
 const x=JSON.parse(f.read('data/alert-state.json'));assert.equal(x.delivery.AAA.status,'UNKNOWN');assert.equal(x.sent.BBB,1);
 assert.equal(f.read('data/my-positions.json'),owner);assert.equal(f.read('data/my-trades.jsonl'),trade);assert.equal(f.read('data/tg-state.json'),'{"offset":43}\n');
});
test('actual scanner save refuses corrupt remote evidence without replacing its bytes',async t=>{
 const f=await fixture(t);write(f.scanner,'data/alert-state.json',A);const broken='{SYNTHETIC CORRUPT ORIGINAL';write(f.bot,'data/alert-state.json',broken);cmd(f.bot,['add','data']);cmd(f.bot,['commit','-qm','synthetic corrupt evidence']);cmd(f.bot,['push']);
 assert.throws(()=>execFileSync('bash',[path.join(f.scanner,'.github/save-data.sh'),'synthetic rejected save'],{cwd:f.scanner,env,stdio:['ignore','pipe','pipe']}));assert.equal(f.read('data/alert-state.json'),broken);
});

for(const order of ['bot-first','nightly-first'])test('B1 actual nightly reset/save then next-day reader: '+order,async t=>{
 const f=await fixture(t),old={day:'2026-11-10',sent:{AAAmyst:'UNKNOWN'},delivery:{AAAmyst:{status:'UNKNOWN',at:'2026-11-10T15:00:00Z'}}};
 write(f.bot,'data/alert-state.json',old);write(f.scanner,'data/alert-state.json',{day:'',sent:{}});
 const scan=()=>execFileSync('bash',[path.join(f.scanner,'.github/save-data.sh'),'synthetic nightly reset'],{cwd:f.scanner,env,stdio:['ignore','pipe','pipe']});
 const bot=()=>execFileSync('bash',['actual-bot-save.sh'],{cwd:f.bot,env,stdio:['ignore','pipe','pipe']});
 if(order==='bot-first'){bot();scan();}else{scan();bot();}
 const saved=JSON.parse(f.read('data/alert-state.json'));assert.equal(saved.delivery.AAAmyst.status,'UNKNOWN','same-day ambiguous evidence remains quarantined');
 const src=fs.readFileSync(path.join(root,'scan.mjs'),'utf8'),start=src.indexOf("const st = readJson('data/alert-state.json'"),end=src.indexOf('  const OKI =',start);assert.ok(start>=0&&end>start);
 const reader=new Function('readJson','ny','now',src.slice(start,end)+';return {st,stopAvailable};');
 const same=reader(()=>structuredClone(saved),()=>({d:'2026-11-10'}),0);assert.equal(same.stopAvailable('AAAmyst'),false);
 const next=reader(()=>structuredClone(saved),()=>({d:'2026-11-11'}),0);assert.equal(next.stopAvailable('AAAmyst'),true);
 write(f.scanner,'data/alert-state.json',next.st);scan();
 const persisted=JSON.parse(f.read('data/alert-state.json'));assert.equal(persisted.day,'2026-11-11');assert.equal(persisted.delivery?.AAAmyst,undefined,'older remote side must not re-import yesterday quarantine');
});
