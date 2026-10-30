// Synthetic tests for ops/accounting-preflight-v2.mjs (v2.1): run explicitly with  node --test ops/accounting-preflight-v2.test.mjs
// (ordinary CI runs test/ and tests/ only). Every repository, key, position, trade, receipt and state below is synthetic.
// The pinned production scan.mjs bytes are read from this checkout's root; cases that need them are skipped, with a reason,
// if that file is not the pinned version.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {spawnSync} from 'node:child_process';import {createHash,createCipheriv,randomBytes} from 'node:crypto';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),CHECKER=path.join(HERE,'accounting-preflight-v2.mjs'),PROD_SCAN=path.join(HERE,'..','scan.mjs');
const PINNED='dec6e8d4be099949b7515c173e3be90adf150975840c32696db61a6c8c8e392c',sha=b=>createHash('sha256').update(b).digest('hex');
const prodScan=fs.existsSync(PROD_SCAN)&&sha(fs.readFileSync(PROD_SCAN))===PINNED?fs.readFileSync(PROD_SCAN):null;
const needsScan=prodScan?{}:{skip:'checkout root scan.mjs is not the pinned production version'};
const KEY='synthetic-preflight-key',id=n=>sha('synthetic-sale-'+n);
const enc=(o,key=KEY)=>{const k=createHash('sha256').update(key).digest(),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',k,iv),e=Buffer.concat([c.update(JSON.stringify(o)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),e]).toString('base64');};
const G={GIT_AUTHOR_NAME:'fixture',GIT_AUTHOR_EMAIL:'fixture@example.test',GIT_COMMITTER_NAME:'fixture',GIT_COMMITTER_EMAIL:'fixture@example.test',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1'};
const git=(cwd,...a)=>{const r=spawnSync('git',a,{cwd,encoding:'utf8',env:{...process.env,...G}});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const dirs=[],tmp=p=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),p));dirs.push(d);return d;};test.after(()=>{for(const d of dirs)fs.rmSync(d,{recursive:true,force:true});});
const lines=rows=>rows.map(x=>JSON.stringify(x)).join('\n')+(rows.length?'\n':'');
const write=(d,rel,body)=>{fs.mkdirSync(path.dirname(path.join(d,rel)),{recursive:true});fs.writeFileSync(path.join(d,rel),body);};
// a clean synthetic production checkout: three mandatory inputs, optional ledger, every file committed (local = HEAD)
function repo({state={shares:{ZZA:10}},positions={ZZA:{entry:10,kind:'manual'}},trades=[{sym:'ZZB',kind:'manual',entry:5,exit:6}],ledger,scan=prodScan||'// not production\n',history=[]}={}){
 const dir=tmp('preflight-');git(dir,'init','-q','-b','main');
 write(dir,'scan.mjs',scan);write(dir,'data/private.enc',enc(state));write(dir,'data/my-positions.json',JSON.stringify(positions));write(dir,'data/my-trades.jsonl',lines(trades));
 if(ledger)write(dir,'data/leaderdip-ledger.jsonl',lines(ledger));git(dir,'add','-A');git(dir,'commit','-qm','seed');
 for(const step of history){step(dir);git(dir,'add','-A');git(dir,'commit','-qm','step','--allow-empty');}
 return dir;}
const run=(dir,env={PRIVATE_KEY:KEY},args=[dir])=>{const r=spawnSync(process.execPath,[CHECKER,...args],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:os.tmpdir(),...env}});return {status:r.stdout,code:r.status,stderr:r.stderr};};
const is=(r,s)=>{assert.equal(r.status,s+'\n');assert.equal(r.code,s==='PASS'?0:s==='ERROR'?1:2);assert.equal(r.stderr,'');if(s.startsWith('BLOCKED'))assert.match(s,/^BLOCKED [A-Z_]+$/);};
const L='data/leaderdip-ledger.jsonl',M='.github/private-data-mode';

// ---- baseline and v1 behaviour
test('PASS: ledger never existed in complete history, reviewed code, clean authenticated state',needsScan,()=>is(run(repo()),'PASS'));
test('existing valid ledger passes with any scan.mjs',()=>is(run(repo({scan:'// other code\n',ledger:[{kind:'offer',sym:'ZZC',d:'2026-10-01'}]})),'PASS'));
test('existing empty ledger file passes',()=>{const d=repo({history:[x=>write(x,L,'')]});is(run(d),'PASS');});
test('existing malformed ledger is ERROR',()=>{const d=repo({history:[x=>write(x,L,'{"kind":"result"\n')]});is(run(d),'ERROR');});
test('existing ledger with a non-object row is ERROR',()=>{const d=repo({history:[x=>write(x,L,'[1,2]\n')]});is(run(d),'ERROR');});
test('existing ledger that is a symlink or directory is ERROR',()=>{let d=repo();fs.symlinkSync(path.join(d,'data/my-trades.jsonl'),path.join(d,L));is(run(d),'ERROR');d=repo();fs.mkdirSync(path.join(d,L));is(run(d),'ERROR');});
test('missing mandatory inputs BLOCK; missing state is never an empty account',needsScan,()=>{for(const f of ['private.enc','my-positions.json','my-trades.jsonl']){const d=repo();fs.unlinkSync(path.join(d,'data',f));is(run(d),'BLOCKED MISSING_REQUIRED_INPUT');}});
test('no PRIVATE_KEY BLOCKS',needsScan,()=>is(run(repo(),{}),'BLOCKED MISSING_KEY'));
test('wrong key (unauthenticated state) is ERROR',needsScan,()=>is(run(repo(),{PRIVATE_KEY:'not-the-key'}),'ERROR'));
test('malformed positions or journal is ERROR',needsScan,()=>{let d=repo({history:[x=>write(x,'data/my-positions.json','[')]});is(run(d),'ERROR');d=repo({history:[x=>fs.appendFileSync(path.join(x,'data/my-trades.jsonl'),'not json\n')]});is(run(d),'ERROR');});
test('argument errors are ERROR',()=>{for(const args of [[],['--fresh'],['a','b'],['--other','x']])is(run(null,{PRIVATE_KEY:KEY},args),'ERROR');});
test('pending sale BLOCKS (ledger absent and present)',needsScan,()=>{is(run(repo({state:{pendingSale:{id:id(1)}}})),'BLOCKED PENDING_SALE');is(run(repo({state:{pendingSale:{id:id(1)}},ledger:[]})),'BLOCKED PENDING_SALE');});
test('other retained intents BLOCK',needsScan,()=>{for(const state of [{pendingStrategy:{}},{recoveryIntent:1},{saleIntent:{}}])is(run(repo({state})),'BLOCKED STATE_INTENT');});

// ---- ledger history and code
test('ledger deleted in history BLOCKS',needsScan,()=>is(run(repo({history:[x=>write(x,L,'{"kind":"offer"}\n'),x=>fs.unlinkSync(path.join(x,L))]})),'BLOCKED LEDGER_EXISTED'));
test('ledger renamed away in history BLOCKS',needsScan,()=>is(run(repo({history:[x=>write(x,L,'{"kind":"offer"}\n'),x=>fs.renameSync(path.join(x,L),path.join(x,'data/old.jsonl'))]})),'BLOCKED LEDGER_EXISTED'));
test('ledger tracked at HEAD but removed locally BLOCKS',needsScan,()=>{const d=repo({history:[x=>write(x,L,'{"kind":"offer"}\n')]});fs.unlinkSync(path.join(d,L));is(run(d),'BLOCKED LOCAL_STATE_DIFFERS');});
test('shallow or grafted history BLOCKS',needsScan,()=>{const src=repo({history:[x=>write(x,'note','1')]}),d=path.join(tmp('preflight-shallow-'),'c');git(os.tmpdir(),'clone','-q','--depth','1','file://'+src,d);is(run(d),'BLOCKED LEDGER_HISTORY_UNCERTAIN');
 const g=repo({history:[x=>write(x,'note','1')]});fs.writeFileSync(path.join(g,'.git/info/grafts'),git(g,'rev-parse','HEAD')+'\n');is(run(g),'BLOCKED LEDGER_HISTORY_UNCERTAIN');});
test('missing history objects, no repository or no git is never PASS',needsScan,()=>{let d=repo({history:[x=>write(x,'note','1')]});const first=git(d,'rev-list','--max-parents=0','HEAD');fs.rmSync(path.join(d,'.git/objects',first.slice(0,2),first.slice(2)));assert.notEqual(run(d).status,'PASS\n');
 d=repo();fs.rmSync(path.join(d,'.git'),{recursive:true});is(run(d),'ERROR');d=repo();const r=spawnSync(process.execPath,[CHECKER,d],{encoding:'utf8',env:{PATH:'/nonexistent',HOME:os.tmpdir(),PRIVATE_KEY:KEY}});assert.equal(r.stdout,'ERROR\n');});
test('unreviewed or deleted scan.mjs at HEAD BLOCKS absence',()=>{is(run(repo({scan:'// some other version\n'})),'BLOCKED CODE_UNREVIEWED');const d=repo({history:[x=>fs.unlinkSync(path.join(x,'scan.mjs'))]});is(run(d),'BLOCKED CODE_UNREVIEWED');});
test('local scan.mjs cannot steer the result: pinned bytes on disk over unreviewed HEAD code BLOCK',needsScan,()=>{const d=repo({scan:'// unreviewed\n'});fs.writeFileSync(path.join(d,'scan.mjs'),prodScan);is(run(d),'BLOCKED LOCAL_STATE_DIFFERS');});
test('uncommitted change to any input BLOCKS',needsScan,()=>{for(const f of ['data/my-trades.jsonl','data/my-positions.json']){const d=repo();fs.appendFileSync(path.join(d,f),f.endsWith('json')?' ':'\n');is(run(d),'BLOCKED LOCAL_STATE_DIFFERS');}});

// ---- finding 2: privacy state from the authoritative HEAD tree as well as local files
test('FINDING 2: committed privacy marker deleted locally BLOCKS (no exemption)',needsScan,()=>{const d=repo({history:[x=>write(x,M,'')]});fs.unlinkSync(path.join(d,M));is(run(d),'BLOCKED LOCAL_STATE_DIFFERS');});
test('privacy marker committed and present BLOCKS',needsScan,()=>is(run(repo({history:[x=>write(x,M,'')]})),'BLOCKED PRIVACY_MODE'));
test('privacy marker only local (uncommitted) BLOCKS',needsScan,()=>{const d=repo();write(d,M,'');is(run(d),'BLOCKED LOCAL_STATE_DIFFERS');});
test('control: privacy marker committed then removed in history, absent now, PASSes (privacy mode off at HEAD)',needsScan,()=>is(run(repo({history:[x=>write(x,M,''),x=>fs.unlinkSync(path.join(x,M))]})),'PASS'));

// ---- finding 3: receipts are checked for consistency, never rejected wholesale
const sale=(n,o={})=>({sym:'ZZS'+n,kind:'manual',entry:10,exit:11,out:'2026-11-0'+(n%9+1),saleId:id(n),...o});
test('FINDING 3 control: a completed manual sale with its receipt PASSes (ledger absent)',needsScan,()=>is(run(repo({state:{saleReceipts:[id(1)]},trades:[sale(1)]})),'PASS'));
test('control: several receipts, legacy rows without saleId, all consistent, PASS',needsScan,()=>is(run(repo({state:{saleReceipts:[id(1),id(2)]},trades:[{sym:'ZZL',kind:'manual',entry:1,exit:2},sale(1),sale(2,{part:'2 of 5'})]})),'PASS'));
test('control: completed LEADER DIP full sale with receipt and matching ledger result PASSes',()=>is(run(repo({scan:'// any\n',state:{saleReceipts:[id(3)]},trades:[sale(3,{kind:'leader dip',src:'leader dip'})],ledger:[{kind:'offer',sym:'ZZS3',d:'2026-10-01'},{kind:'result',sym:'ZZS3',pct:-0.2,saleId:id(3)}]})),'PASS'));
test('control: LEADER DIP part or half sale needs no ledger result (ledger absent) and PASSes',needsScan,()=>{is(run(repo({state:{saleReceipts:[id(4)]},trades:[sale(4,{kind:'leader dip',part:'1 of 3'})]})),'PASS');is(run(repo({state:{saleReceipts:[id(5)]},trades:[sale(5,{kind:'leader dip',half:true})]})),'PASS');});
test('receipts malformed BLOCK',needsScan,()=>{for(const saleReceipts of [['not-hex'],[1],'x',[id(1).toUpperCase()]])is(run(repo({state:{saleReceipts},trades:[sale(1)]})),'BLOCKED RECEIPT_MALFORMED');is(run(repo({trades:[sale(1,{saleId:'short'})]})),'BLOCKED RECEIPT_MALFORMED');});
test('duplicate receipts BLOCK',needsScan,()=>is(run(repo({state:{saleReceipts:[id(1),id(1)]},trades:[sale(1)]})),'BLOCKED RECEIPT_DUPLICATE'));
test('receipt without its journal row BLOCKS',needsScan,()=>is(run(repo({state:{saleReceipts:[id(1),id(9)]},trades:[sale(1)]})),'BLOCKED RECEIPT_UNMATCHED'));
test('journal sale without its receipt BLOCKS (an unfinished transaction)',needsScan,()=>is(run(repo({state:{saleReceipts:[id(1)]},trades:[sale(1),sale(2)]})),'BLOCKED JOURNAL_UNRECEIPTED'));
test('two journal rows with one sale id BLOCK',needsScan,()=>is(run(repo({state:{saleReceipts:[id(1)]},trades:[sale(1),sale(1,{sym:'ZZX'})]})),'BLOCKED RECEIPT_AMBIGUOUS'));
test('at the 500-receipt cap an unreceipted journal sale is ambiguous; a fully matched cap PASSes',needsScan,()=>{const ids=[...Array(500)].map((_,i)=>id(100+i)),rows=ids.map((_,i)=>sale(100+i));
 is(run(repo({state:{saleReceipts:ids},trades:rows})),'PASS');is(run(repo({state:{saleReceipts:ids},trades:[sale(99),...rows]})),'BLOCKED RECEIPT_AMBIGUOUS');});
test('receipted LEADER DIP full sale without a ledger BLOCKS',needsScan,()=>is(run(repo({state:{saleReceipts:[id(6)]},trades:[sale(6,{src:'leader dip',kind:'leader dip'})]})),'BLOCKED LEADER_DIP_RESULT_WITHOUT_LEDGER'));
test('receipted LEADER DIP full sale whose ledger lacks the result BLOCKS',()=>is(run(repo({scan:'// any\n',state:{saleReceipts:[id(7)]},trades:[sale(7,{kind:'leader dip'})],ledger:[{kind:'offer',sym:'ZZS7'}]})),'BLOCKED RECEIPT_UNMATCHED'));
test('ledger result sale id without receipt or journal row BLOCKS',()=>{is(run(repo({scan:'// any\n',state:{saleReceipts:[]},trades:[sale(8,{kind:'leader dip'})],ledger:[{kind:'result',sym:'ZZS8',saleId:id(8)}]})),'BLOCKED JOURNAL_UNRECEIPTED');
 is(run(repo({scan:'// any\n',state:{saleReceipts:[]},trades:[],ledger:[{kind:'result',sym:'ZZS8',saleId:id(8)}]})),'BLOCKED RECEIPT_UNMATCHED');});
test('legacy completed LEADER DIP full sale (no sale id) BLOCKS absence; legacy part sale does not',needsScan,()=>{for(const row of [{sym:'ZZD',src:'leader dip',entry:50,exit:40},{sym:'ZZD',kind:'Leader Dip',entry:50,exit:40}])is(run(repo({trades:[row]})),'BLOCKED LEADER_DIP_RESULT_WITHOUT_LEDGER');
 is(run(repo({trades:[{sym:'ZZD',kind:'leader dip',entry:50,exit:55,part:'1 of 2'}]})),'PASS');});
test('an open LEADER DIP position alone does not require a ledger or a sale',needsScan,()=>is(run(repo({positions:{ZZE:{entry:50,src:'leader dip',kind:'leader dip'}}})),'PASS'));
test('the checker never clears receipts or writes ledger rows',needsScan,()=>{const d=repo({state:{saleReceipts:[id(6)]},trades:[sale(6,{src:'leader dip'})]}),before=fs.readFileSync(path.join(d,'data/private.enc'));is(run(d),'BLOCKED LEADER_DIP_RESULT_WITHOUT_LEDGER');assert.deepEqual(fs.readFileSync(path.join(d,'data/private.enc')),before);assert.equal(fs.existsSync(path.join(d,L)),false);});

// ---- finding 1: freshness, the authoritative comparison after the protected check (--fresh, offline on FETCH_HEAD)
function fetched(change){const src=repo({history:[x=>write(x,'note','1')]});git(src,'config','uploadpack.allowFilter','true');const job=path.join(tmp('preflight-job-'),'c');git(os.tmpdir(),'clone','-q','--filter=blob:none','file://'+src,job);
 if(change)change(src);git(job,'fetch','-q','file://'+src,'refs/heads/main');return job;}
const commit=(f)=>src=>{f(src);git(src,'add','-A');git(src,'commit','-qm','change','--allow-empty');};
test('FINDING 1 control: unchanged main, or only unrelated files changed, stays PASS',needsScan,()=>{is(run(null,{},['--fresh',fetched()]),'PASS');is(run(null,{},['--fresh',fetched(commit(x=>write(x,'data/other.json','{}')))]),'PASS');});
test('FINDING 1: a change to scan.mjs or the privacy marker during preflight invalidates PASS',needsScan,()=>{is(run(null,{},['--fresh',fetched(commit(x=>fs.appendFileSync(path.join(x,'scan.mjs'),'\n')))]),'BLOCKED STATE_CHANGED');is(run(null,{},['--fresh',fetched(commit(x=>write(x,M,'')))]),'BLOCKED STATE_CHANGED');});
test('FINDING 1: a ledger added then removed (no net change) still invalidates PASS',needsScan,()=>is(run(null,{},['--fresh',fetched(src=>{commit(x=>write(x,L,'{"kind":"offer"}\n'))(src);commit(x=>fs.unlinkSync(path.join(x,L)))(src);})]),'BLOCKED STATE_CHANGED'));
test('FINDING 1: a change to any mandatory input invalidates PASS',needsScan,()=>{for(const f of ['data/private.enc','data/my-positions.json','data/my-trades.jsonl'])is(run(null,{},['--fresh',fetched(commit(x=>fs.appendFileSync(path.join(x,f),'\n')))]),'BLOCKED STATE_CHANGED');});
test('FINDING 1: rewritten history (checked-out HEAD not an ancestor of main) invalidates PASS',needsScan,()=>is(run(null,{},['--fresh',fetched(src=>{git(src,'reset','-q','--hard','HEAD~1');commit(x=>write(x,'other','2'))(src);})]),'BLOCKED STATE_CHANGED'));
test('freshness without a fetched main is ERROR',needsScan,()=>is(run(null,{},['--fresh',repo()]),'ERROR'));

// ---- integration and read-only
test('blob-free full clone (the amended checkout) passes offline; a blob-free shallow clone blocks',needsScan,()=>{const src=repo({history:[x=>write(x,'note','1')]});git(src,'config','uploadpack.allowFilter','true');
 const full=path.join(tmp('preflight-partial-'),'c');git(os.tmpdir(),'clone','-q','--filter=blob:none','file://'+src,full);is(run(full),'PASS');
 const shallow=path.join(tmp('preflight-partial-shallow-'),'c');git(os.tmpdir(),'clone','-q','--filter=blob:none','--depth','1','file://'+src,shallow);is(run(shallow),'BLOCKED LEDGER_HISTORY_UNCERTAIN');});
const snapshot=d=>spawnSync('sh',['-c','find . -type f -not -path "./.git/index" -print0 | sort -z | xargs -0 sha256sum'],{cwd:d}).stdout.toString();
test('read-only: no file or git state changes in either mode; output is one status line',needsScan,()=>{const d=fetched(),before=git(d,'status','--porcelain','--ignored'),head=git(d,'rev-parse','HEAD'),snap=snapshot(d);
 is(run(d),'PASS');is(run(null,{},['--fresh',d]),'PASS');assert.equal(snapshot(d),snap);assert.equal(git(d,'status','--porcelain','--ignored'),before);assert.equal(git(d,'rev-parse','HEAD'),head);});
