// Synthetic tests for ops/accounting-preflight-v2.mjs: run with  node --test ops/accounting-preflight-v2.test.mjs
// Every repository, key, position, trade and state below is synthetic. The pinned production scan.mjs bytes are
// read from this checkout's root (cases that need them are skipped, with a reason, if that file differs).
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';import {createHash,createCipheriv,randomBytes} from 'node:crypto';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),CHECKER=path.join(HERE,'accounting-preflight-v2.mjs'),PROD_SCAN=path.join(HERE,'..','scan.mjs');
const PINNED='dec6e8d4be099949b7515c173e3be90adf150975840c32696db61a6c8c8e392c',sha=b=>createHash('sha256').update(b).digest('hex');
const prodScan=fs.existsSync(PROD_SCAN)&&sha(fs.readFileSync(PROD_SCAN))===PINNED?fs.readFileSync(PROD_SCAN):null;
const needsScan=prodScan?{}:{skip:'checkout root scan.mjs is not the pinned production version'};
const KEY='synthetic-preflight-key';
const enc=(o,key=KEY)=>{const k=createHash('sha256').update(key).digest(),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',k,iv),e=Buffer.concat([c.update(JSON.stringify(o)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),e]).toString('base64');};
const G={GIT_AUTHOR_NAME:'fixture',GIT_AUTHOR_EMAIL:'fixture@example.test',GIT_COMMITTER_NAME:'fixture',GIT_COMMITTER_EMAIL:'fixture@example.test',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
const git=(cwd,...a)=>{const r=spawnSync('git',a,{cwd,encoding:'utf8',env:{...process.env,...G}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const dirs=[];test.after(()=>{for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});});
// a clean synthetic production checkout: three mandatory inputs, no ledger ever, privacy mode off
function repo({state={shares:{ZZA:10}},positions={ZZA:{entry:10,kind:'manual'}},trades=[{sym:'ZZB',kind:'manual',entry:5,exit:6}],scan=prodScan||'// not production\n',history=[]}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'preflight-'));dirs.push(dir);git(dir,'init','-q','-b','main');fs.mkdirSync(path.join(dir,'data'));
 fs.writeFileSync(path.join(dir,'scan.mjs'),scan);fs.writeFileSync(path.join(dir,'data/private.enc'),enc(state));fs.writeFileSync(path.join(dir,'data/my-positions.json'),JSON.stringify(positions));
 fs.writeFileSync(path.join(dir,'data/my-trades.jsonl'),trades.map(x=>JSON.stringify(x)).join('\n')+(trades.length?'\n':''));git(dir,'add','-A');git(dir,'commit','-qm','seed');
 for(const step of history){step(dir);git(dir,'add','-A');git(dir,'commit','-qm','step','--allow-empty');}
 return dir;}
const run=(dir,env={PRIVATE_KEY:KEY})=>{const r=spawnSync(process.execPath,[CHECKER,dir],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:os.tmpdir(),...env}});return {status:r.stdout,code:r.status,stderr:r.stderr};};
const is=(r,s)=>{assert.equal(r.status,s+'\n');assert.equal(r.code,{PASS:0,BLOCKED:2,ERROR:1}[s]);assert.equal(r.stderr,'');};
const ledgerFile=d=>path.join(d,'data/leaderdip-ledger.jsonl');

test('PASS: ledger never existed in complete history, reviewed code, clean authenticated state',needsScan,()=>is(run(repo()),'PASS'));
test('v1 behaviour kept: an existing valid ledger passes with any scan.mjs',()=>{const d=repo({scan:'// other code\n',history:[x=>fs.writeFileSync(ledgerFile(x),JSON.stringify({kind:'offer',sym:'ZZC'})+'\n')]});is(run(d),'PASS');});
test('v1 behaviour kept: an existing empty ledger file passes',()=>{const d=repo({history:[x=>fs.writeFileSync(ledgerFile(x),'')]});is(run(d),'PASS');});
test('existing malformed ledger is ERROR',()=>{const d=repo({history:[x=>fs.writeFileSync(ledgerFile(x),'{"kind":"result"\n')]});is(run(d),'ERROR');});
test('existing ledger with a non-object row is ERROR',()=>{const d=repo({history:[x=>fs.writeFileSync(ledgerFile(x),'[1,2]\n')]});is(run(d),'ERROR');});
test('existing ledger that is a symlink is ERROR',()=>{const d=repo();fs.symlinkSync(path.join(d,'data/my-trades.jsonl'),ledgerFile(d));is(run(d),'ERROR');});
test('existing ledger that is a directory is ERROR',()=>{const d=repo();fs.mkdirSync(ledgerFile(d));is(run(d),'ERROR');});
test('ledger deleted in history BLOCKS',needsScan,()=>{const d=repo({history:[x=>fs.writeFileSync(ledgerFile(x),'{"kind":"offer"}\n'),x=>fs.unlinkSync(ledgerFile(x))]});is(run(d),'BLOCKED');});
test('ledger renamed away in history BLOCKS',needsScan,()=>{const d=repo({history:[x=>fs.writeFileSync(ledgerFile(x),'{"kind":"offer"}\n'),x=>fs.renameSync(ledgerFile(x),path.join(x,'data/old-ledger.jsonl'))]});is(run(d),'BLOCKED');});
test('ledger tracked at HEAD but missing from the working tree BLOCKS',needsScan,()=>{const d=repo({history:[x=>fs.writeFileSync(ledgerFile(x),'{"kind":"offer"}\n')]});fs.unlinkSync(ledgerFile(d));is(run(d),'BLOCKED');});
test('shallow history (incomplete) BLOCKS',needsScan,()=>{const src=repo({history:[x=>fs.writeFileSync(path.join(x,'note'),'1')]}),d=fs.mkdtempSync(path.join(os.tmpdir(),'preflight-shallow-'));dirs.push(d);fs.rmSync(d,{recursive:true});git(os.tmpdir(),'clone','-q','--depth','1','file://'+src,d);is(run(d),'BLOCKED');});
test('grafted history BLOCKS',needsScan,()=>{const d=repo({history:[x=>fs.writeFileSync(path.join(x,'note'),'1')]});fs.writeFileSync(path.join(d,'.git/info/grafts'),git(d,'rev-parse','HEAD')+'\n');is(run(d),'BLOCKED');});
test('missing history objects (uncertain) is not PASS',needsScan,()=>{const d=repo({history:[x=>fs.writeFileSync(path.join(x,'note'),'1')]}),first=git(d,'rev-list','--max-parents=0','HEAD'),obj=path.join(d,'.git/objects',first.slice(0,2),first.slice(2));fs.rmSync(obj);assert.notEqual(run(d).status,'PASS\n');});
test('not a git checkout (history unavailable) is not PASS',needsScan,()=>{const d=repo();fs.rmSync(path.join(d,'.git'),{recursive:true});assert.notEqual(run(d).status,'PASS\n');});
test('git unavailable is not PASS',needsScan,()=>{const d=repo(),r=spawnSync(process.execPath,[CHECKER,d],{encoding:'utf8',env:{PATH:path.dirname(process.execPath)==='/usr/bin'?'/nonexistent':path.dirname(process.execPath),HOME:os.tmpdir(),PRIVATE_KEY:KEY}});assert.notEqual(r.stdout,'PASS\n');});
test('privacy mode marker present BLOCKS (ledger may live elsewhere)',needsScan,()=>{const d=repo({history:[x=>{fs.mkdirSync(path.join(x,'.github'),{recursive:true});fs.writeFileSync(path.join(x,'.github/private-data-mode'),'');}]});is(run(d),'BLOCKED');});
test('unreviewed scan.mjs BLOCKS absence',()=>is(run(repo({scan:'// some other production version\n'})),'BLOCKED'));
test('scan.mjs missing BLOCKS absence',needsScan,()=>{const d=repo();fs.unlinkSync(path.join(d,'scan.mjs'));is(run(d),'BLOCKED');});
test('pending sale BLOCKS (absent ledger)',needsScan,()=>is(run(repo({state:{shares:{},pendingSale:{id:'x'}}})),'BLOCKED'));
test('pending sale BLOCKS (existing ledger, v1 rule)',()=>{const d=repo({state:{pendingSale:{id:'x'}},history:[x=>fs.writeFileSync(ledgerFile(x),'')]});is(run(d),'BLOCKED');});
test('other intent or receipt in state BLOCKS absence',needsScan,()=>{for(const state of [{saleReceipts:['a'.repeat(64)]},{pendingStrategy:{}},{recoveryIntent:1}])is(run(repo({state})),'BLOCKED');});
test('a LEADER DIP journal row BLOCKS absence (its ledger result would be missing)',needsScan,()=>{for(const row of [{sym:'ZZD',src:'leader dip',entry:50,exit:40},{sym:'ZZD',kind:'Leader Dip',entry:50,exit:40}])is(run(repo({trades:[row]})),'BLOCKED');});
test('an open LEADER DIP position alone does not block (held state, not a transaction; production records it without a ledger row)',needsScan,()=>is(run(repo({positions:{ZZE:{entry:50,src:'leader dip',kind:'leader dip'}}})),'PASS'));
test('an open LEADER DIP position plus a completed LEADER DIP sale BLOCKS absence',needsScan,()=>is(run(repo({positions:{ZZE:{entry:50,src:'leader dip'}},trades:[{sym:'ZZF',src:'leader dip',entry:50,exit:40}]})),'BLOCKED'));
test('missing mandatory inputs still BLOCK; missing state is never an empty account',needsScan,()=>{for(const f of ['private.enc','my-positions.json','my-trades.jsonl']){const d=repo();fs.unlinkSync(path.join(d,'data',f));is(run(d),'BLOCKED');}});
test('empty mandatory journal file is allowed only as an existing file',needsScan,()=>is(run(repo({trades:[]})),'PASS'));
test('no PRIVATE_KEY BLOCKS',needsScan,()=>is(run(repo(),{}),'BLOCKED'));
test('wrong key (unauthenticated state) is ERROR',needsScan,()=>is(run(repo(),{PRIVATE_KEY:'not-the-key'}),'ERROR'));
test('malformed positions or journal is ERROR',needsScan,()=>{let d=repo();fs.writeFileSync(path.join(d,'data/my-positions.json'),'[');is(run(d),'ERROR');d=repo();fs.appendFileSync(path.join(d,'data/my-trades.jsonl'),'not json\n');is(run(d),'ERROR');});
test('wrong argument count is ERROR',()=>{const r=spawnSync(process.execPath,[CHECKER],{encoding:'utf8',env:{PATH:process.env.PATH,PRIVATE_KEY:KEY}});assert.equal(r.stdout,'ERROR\n');assert.equal(r.status,1);});
const snapshot=d=>spawnSync('sh',['-c','find . -type f -not -path "./.git/index" -print0 | sort -z | xargs -0 sha256sum'],{cwd:d}).stdout.toString();
test('read-only: no file or git state changes, output is status only',needsScan,()=>{const d=repo(),before=git(d,'status','--porcelain','--ignored'),head=git(d,'rev-parse','HEAD'),snap=snapshot(d);is(run(d),'PASS');assert.equal(snapshot(d),snap);assert.equal(git(d,'status','--porcelain','--ignored'),before);assert.equal(git(d,'rev-parse','HEAD'),head);});
test('blob-free full clone (what the amended checkout produces) passes offline; a blob-free shallow clone blocks',needsScan,()=>{const src=repo({history:[x=>fs.writeFileSync(path.join(x,'note'),'1')]});git(src,'config','uploadpack.allowFilter','true');
 const full=fs.mkdtempSync(path.join(os.tmpdir(),'preflight-partial-'));dirs.push(full);fs.rmSync(full,{recursive:true});git(os.tmpdir(),'clone','-q','--filter=blob:none','file://'+src,full);is(run(full),'PASS');
 const shallow=fs.mkdtempSync(path.join(os.tmpdir(),'preflight-partial-shallow-'));dirs.push(shallow);fs.rmSync(shallow,{recursive:true});git(os.tmpdir(),'clone','-q','--filter=blob:none','--depth','1','file://'+src,shallow);is(run(shallow),'BLOCKED');});
