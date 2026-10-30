// Offline, read-only pending-sale gate (v2). Never import scan.mjs or recover a sale.
// Output contract: exactly PASS, BLOCKED or ERROR; no exception/data/identifier output.
// v2 change (owner decision, 30 Oct 2026): data/leaderdip-ledger.jsonl may be ABSENT only as an unused
// optional ledger, and only when ALL of these hold; otherwise absence still BLOCKS:
//  1. history: a complete (non-shallow, no grafts, every reachable commit/tree present, no lazy fetch)
//     local history of HEAD shows the path never existed in any commit, and privacy mode is off;
//  2. code: the checked-out scan.mjs is a reviewed production version that treats the file as optional;
//  3. state: authenticated encrypted state has no pending sale, receipt or other intent, and no
//     completed LEADER DIP sale is in the journal (its result row would have to be in that ledger).
//     An OPEN LEADER DIP position does not block: production legitimately records one without any
//     ledger row (ldipHit() falls back to the published SQ11-PB12 list), and only a sale writes one.
// Missing state is never read as an empty account: the other three inputs stay mandatory, and an
// existing ledger is validated exactly as in v1 (unreadable or malformed = ERROR).
import fs from 'node:fs';
import path from 'node:path';
import {createHash,createDecipheriv} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const LEDGER='leaderdip-ledger.jsonl';
// scan.mjs SHA256 of production main 4dfecf30d8ef0ecab57e899d0be510c410e44184 (reviewed: ldipRows() returns []
// when the file is absent; ldipAppend creates it). Any other scan.mjs makes absence BLOCK.
const OPTIONAL_LEDGER_CODE=new Set(['dec6e8d4be099949b7515c173e3be90adf150975840c32696db61a6c8c8e392c']);
const LEADER_DIP=/leader\s*dip/i;
const sha=b=>createHash('sha256').update(b).digest('hex');
function git(root,args){return execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:6000,maxBuffer:64*1024*1024,stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH||'',HOME:process.env.HOME||'',LC_ALL:'C',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'}}).trim();}
function ledgerNeverExisted(root){
 if(fs.existsSync(path.join(root,'.github','private-data-mode')))return false;
 if(git(root,['rev-parse','--is-inside-work-tree'])!=='true'||fs.realpathSync(git(root,['rev-parse','--show-toplevel']))!==fs.realpathSync(root))return false;
 if(git(root,['rev-parse','--is-shallow-repository'])!=='false')return false;
 if(fs.existsSync(path.resolve(root,git(root,['rev-parse','--git-path','info/grafts']))))return false;
 if(!git(root,['rev-list','--max-parents=0','HEAD']))return false;
 git(root,['rev-list','--objects','--filter=blob:none','--missing=error','HEAD']);   // throws on any missing commit/tree
 const p='data/'+LEDGER;
 return git(root,['ls-tree','HEAD','--',p])===''&&git(root,['log','--full-history','--no-renames','--format=%H','HEAD','--',p])==='';
}
function check(root){
 if(!process.env.PRIVATE_KEY)return 'BLOCKED';
 const specs=[['private.enc',8*1024*1024],['my-positions.json',16*1024*1024],['my-trades.jsonl',64*1024*1024],[LEDGER,64*1024*1024]],buffers=[];
 for(const [name,limit] of specs){const file=path.join(root,'data',name);let stat;try{stat=fs.lstatSync(file);}catch(e){if(e.code==='ENOENT'){if(name===LEDGER){buffers.push(null);continue;}return 'BLOCKED';}throw e;}if(!stat.isFile()||stat.isSymbolicLink()||stat.size>limit)throw Error();const b=fs.readFileSync(file);if(b.length>limit)throw Error();buffers.push(b);}
 const encoded=buffers[0].toString('utf8').trim();if(!encoded||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||encoded.length%4!==0)throw Error();
 const b=Buffer.from(encoded,'base64');if(b.length<29)throw Error();const key=createHash('sha256').update(process.env.PRIVATE_KEY).digest(),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));let plain;
 try{plain=Buffer.concat([d.update(b.subarray(28)),d.final()]);}finally{key.fill(0);}
 let state;try{state=JSON.parse(plain.toString('utf8'));}finally{plain.fill(0);}if(!object(state))throw Error();
 // Conservatively block every retained intent, even if apparently complete. Reconciliation
 // belongs to a separately scoped operator; this checker never identifies/repairs it.
 const pending=Object.hasOwn(state,'pendingSale');
 if(state.shares!==undefined&&!object(state.shares)||state.closed!==undefined&&!Array.isArray(state.closed)||state.saleReceipts!==undefined&&(!Array.isArray(state.saleReceipts)||state.saleReceipts.some(x=>typeof x!=='string')))throw Error();
 const positions=JSON.parse(buffers[1].toString('utf8'));if(!object(positions))throw Error();
 const journals=buffers.slice(2).map(bytes=>bytes===null?null:bytes.toString('utf8').split('\n').filter(line=>line.trim()).map(line=>{const row=JSON.parse(line);if(!object(row))throw Error();return row;}));
 let optionalAbsent=false;
 if(buffers[3]===null){
  const ledgerState=!pending&&Object.keys(state).every(k=>!/pending|intent|recover/i.test(k))&&!(state.saleReceipts||[]).length,
   unused=!journals[0].some(r=>LEADER_DIP.test(String(r.src||''))||LEADER_DIP.test(String(r.kind||''))),
   code=(()=>{try{const f=path.join(root,'scan.mjs'),st=fs.lstatSync(f);return st.isFile()&&!st.isSymbolicLink()&&OPTIONAL_LEDGER_CODE.has(sha(fs.readFileSync(f)));}catch{return false;}})();
  if(!ledgerState||!unused||!code||!ledgerNeverExisted(root))return 'BLOCKED';
  optionalAbsent=true;
 }
 // Detect an unprotected/moving local copy. An immutable source snapshot and external
 // current-main revalidation are still required; this is not a production locking claim.
 for(let i=0;i<specs.length;i++){const file=path.join(root,'data',specs[i][0]);if(buffers[i]===null){let gone=false;try{fs.lstatSync(file);}catch(e){gone=e.code==='ENOENT';}if(!gone)throw Error();continue;}const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink()||stat.size>specs[i][1]||!fs.readFileSync(file).equals(buffers[i]))throw Error();}
 return pending?'BLOCKED':optionalAbsent||buffers[3]!==null?'PASS':'BLOCKED';
}
let status='ERROR';try{if(process.argv.length!==3)throw Error();status=check(path.resolve(process.argv[2]));}catch{}process.stdout.write(status+'\n');process.exitCode=status==='PASS'?0:status==='BLOCKED'?2:1;
