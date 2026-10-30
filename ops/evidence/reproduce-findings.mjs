// Usage: node ops/evidence/reproduce-findings.mjs <reviewed d3596bf checker> ops/accounting-preflight-v2.mjs scan.mjs
// reviewer scratch: the three Codex findings on the reviewed d3596bf checker vs the v2.1 checker (synthetic only)
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash,createCipheriv,randomBytes} from 'node:crypto';
const [OLD,NEW,SCAN]=process.argv.slice(2),scan=fs.readFileSync(SCAN),KEY='k',id=n=>createHash('sha256').update('s'+n).digest('hex');
const enc=o=>{const k=createHash('sha256').update(KEY).digest(),iv=randomBytes(12),c=createCipheriv('aes-256-gcm',k,iv),e=Buffer.concat([c.update(JSON.stringify(o)),c.final()]);return Buffer.concat([iv,c.getAuthTag(),e]).toString('base64');};
const E={...process.env,GIT_AUTHOR_NAME:'f',GIT_AUTHOR_EMAIL:'f@x',GIT_COMMITTER_NAME:'f',GIT_COMMITTER_EMAIL:'f@x',GIT_CONFIG_GLOBAL:'/dev/null'},g=(c,...a)=>spawnSync('git',a,{cwd:c,env:E,encoding:'utf8'}).stdout.trim();
const repo=(state,trades)=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'rp-'));g(d,'init','-q','-b','main');fs.mkdirSync(d+'/data');fs.writeFileSync(d+'/scan.mjs',scan);fs.writeFileSync(d+'/data/private.enc',enc(state));fs.writeFileSync(d+'/data/my-positions.json','{}');fs.writeFileSync(d+'/data/my-trades.jsonl',trades.map(x=>JSON.stringify(x)).join('\n')+'\n');g(d,'add','-A');g(d,'commit','-qm','s');return d;};
const run=(c,...a)=>spawnSync(process.execPath,[c,...a],{encoding:'utf8',env:{PATH:process.env.PATH,HOME:os.tmpdir(),PRIVATE_KEY:KEY}}).stdout.trim();
const out={};
// finding 2
let d=repo({shares:{}},[{sym:'Z',kind:'manual'}]);fs.mkdirSync(d+'/.github');fs.writeFileSync(d+'/.github/private-data-mode','');g(d,'add','-A');g(d,'commit','-qm','m');fs.unlinkSync(d+'/.github/private-data-mode');
out.finding2_markerCommittedDeletedLocally={reviewed:run(OLD,d),fixed:run(NEW,d)};
// finding 3
d=repo({shares:{},saleReceipts:[id(1)]},[{sym:'Z',kind:'manual',saleId:id(1)}]);out.finding3_legitimateReceipt={reviewed:run(OLD,d),fixed:run(NEW,d)};
d=repo({shares:{},saleReceipts:[id(2)]},[{sym:'Z',kind:'manual',saleId:id(1)}]);out.finding3_unmatchedReceipt={reviewed:run(OLD,d),fixed:run(NEW,d)};
// finding 1: scan.mjs changes on main during preflight; reviewed workflow diffed only the four data paths
d=repo({shares:{}},[{sym:'Z',kind:'manual'}]);const src=d,job=fs.mkdtempSync(path.join(os.tmpdir(),'rj-'))+'/c';g(os.tmpdir(),'clone','-q','file://'+src,job);fs.appendFileSync(src+'/scan.mjs','\n');g(src,'commit','-qam','code');g(job,'fetch','-q','file://'+src,'refs/heads/main');
const oldEmit=spawnSync('git',['diff','--quiet','HEAD','FETCH_HEAD','--','data/private.enc','data/my-positions.json','data/my-trades.jsonl','data/leaderdip-ledger.jsonl'],{cwd:job}).status===0?'PASS (change not seen)':'BLOCKED';
out.finding1_scanChangedDuringPreflight={reviewedWorkflowFreshness:oldEmit,fixed:run(NEW,'--fresh',job)};
console.log(JSON.stringify(out,null,1));
