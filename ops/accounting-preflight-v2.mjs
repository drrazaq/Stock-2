// Offline, read-only pending-sale gate (v2.1). Never import scan.mjs or recover a sale.
// Output contract: exactly one line, PASS, ERROR, or BLOCKED followed by one fixed reason code (REASONS below).
// Codes carry no data: no symbol, amount, identifier or exception text. Exit 0 PASS, 2 BLOCKED, 1 ERROR.
//   node accounting-preflight-v2.mjs ROOT          the protected check (needs PRIVATE_KEY)
//   node accounting-preflight-v2.mjs --fresh ROOT  offline comparison of HEAD with an already-fetched FETCH_HEAD
//                                                  (current main): any change to a dependency invalidates PASS
// Owner decision (30 Oct 2026): data/leaderdip-ledger.jsonl may be ABSENT only as an unused optional ledger, when
//  1. history: complete local history of HEAD (not shallow, no grafts, every reachable commit/tree present, no lazy
//     fetch, replace objects ignored) shows the path never existed;
//  2. privacy mode is off in BOTH the HEAD tree and the working tree (the ledger is not stored elsewhere);
//  3. code: HEAD's scan.mjs is a reviewed production version that treats the file as optional;
//  4. state: authenticated encrypted state has no pending sale or other intent, every sale receipt is consistent
//     with the journal, and no completed LEADER DIP full sale is recorded (its result row belongs in the ledger).
// An open LEADER DIP position does not itself require a ledger or a sale. Ledger rows come from offer logging
// (nightly scan) and from sale results; an absent, never-committed ledger means neither has been recorded.
// The other inputs are mandatory; missing state is never read as an empty account. Every dependency path must
// match HEAD in the working tree, and HEAD must not move during the check.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,createDecipheriv} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const LEDGER='data/leaderdip-ledger.jsonl',MARKER='.github/private-data-mode',SCAN='scan.mjs';
const INPUTS=[['data/private.enc',8*1024*1024],['data/my-positions.json',16*1024*1024],['data/my-trades.jsonl',64*1024*1024],[LEDGER,64*1024*1024]];
const DEPENDENCIES=[...INPUTS.map(x=>x[0]),SCAN,MARKER];
// scan.mjs SHA256 of production main 4dfecf30d8ef0ecab57e899d0be510c410e44184 (reviewed: ldipRows() returns [] when the
// ledger is absent; ldipAppend() creates it). Any other scan.mjs makes absence BLOCK.
const OPTIONAL_LEDGER_CODE=new Set(['dec6e8d4be099949b7515c173e3be90adf150975840c32696db61a6c8c8e392c']);
const RECEIPT_CAP=500;   // the approved accounting patch keeps the last 500 receipts; past the cap, older ids are unprovable
const REASONS=new Set(['MISSING_KEY','MISSING_REQUIRED_INPUT','PENDING_SALE','STATE_INTENT','RECEIPT_MALFORMED','RECEIPT_DUPLICATE','RECEIPT_UNMATCHED','RECEIPT_AMBIGUOUS','JOURNAL_UNRECEIPTED','LEADER_DIP_RESULT_WITHOUT_LEDGER','LEDGER_EXISTED','LEDGER_HISTORY_UNCERTAIN','PRIVACY_MODE','CODE_UNREVIEWED','LOCAL_STATE_DIFFERS','STATE_CHANGED']);
class Blocked{constructor(code){if(!REASONS.has(code))throw Error();this.code=code;}}
const block=code=>{throw new Blocked(code);};
const LEADER_DIP=/leader\s*dip/i,ID=/^[a-f0-9]{64}$/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const git=(root,args,{allowFail=false}={})=>{try{return execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:6000,maxBuffer:64*1024*1024,stdio:['ignore','pipe','ignore'],env:{PATH:process.env.PATH||'',HOME:process.env.HOME||'',LC_ALL:'C',GIT_NO_LAZY_FETCH:'1',GIT_NO_REPLACE_OBJECTS:'1',GIT_CONFIG_NOSYSTEM:'1',GIT_TERMINAL_PROMPT:'0'}}).trim();}catch(e){if(allowFail)return null;throw e;}};
const isLeaderDip=r=>LEADER_DIP.test(String(r.src||''))||LEADER_DIP.test(String(r.kind||''));
const isFullSale=r=>!Object.hasOwn(r,'part')&&!r.half;   // part sales carry 'part', half sales 'half': neither writes a result row
function repository(root){
 if(git(root,['rev-parse','--is-inside-work-tree'])!=='true'||fs.realpathSync(git(root,['rev-parse','--show-toplevel']))!==fs.realpathSync(root))throw Error();
 return git(root,['rev-parse','--verify','HEAD^{commit}']);
}
// HEAD tree entry (blob id) or null; the working-tree file must be identical to it (or both absent)
function matchesHead(root,rel){
 const entry=git(root,['ls-tree','HEAD','--',rel]),file=path.join(root,rel);let st=null;try{st=fs.lstatSync(file);}catch(e){if(e.code!=='ENOENT')throw e;}
 if(!entry)return st===null;
 const m=/^100644 blob ([a-f0-9]{40,64})\t/.exec(entry);if(!m||!st||!st.isFile()||st.isSymbolicLink())return false;
 return git(root,['hash-object','--no-filters','--',rel])===m[1];
}
function historyComplete(root){
 if(git(root,['rev-parse','--is-shallow-repository'])!=='false')return false;
 if(fs.existsSync(path.resolve(root,git(root,['rev-parse','--git-path','info/grafts']))))return false;
 if(!git(root,['rev-list','--max-parents=0','HEAD']))return false;
 return git(root,['rev-list','--objects','--filter=blob:none','--missing=error','HEAD'],{allowFail:true})!==null;   // null: a commit/tree is missing
}
function readInputs(root){
 const out={};
 for(const [rel,limit] of INPUTS){const file=path.join(root,rel);let st;try{st=fs.lstatSync(file);}catch(e){if(e.code==='ENOENT'){if(rel===LEDGER){out[rel]=null;continue;}block('MISSING_REQUIRED_INPUT');}throw e;}
  if(!st.isFile()||st.isSymbolicLink()||st.size>limit)throw Error();const b=fs.readFileSync(file);if(b.length>limit)throw Error();out[rel]=b;}
 return out;
}
function decrypt(bytes){
 const encoded=bytes.toString('utf8').trim();if(!encoded||!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)||encoded.length%4!==0)throw Error();
 const b=Buffer.from(encoded,'base64');if(b.length<29)throw Error();const key=createHash('sha256').update(process.env.PRIVATE_KEY).digest(),d=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));let plain;
 try{plain=Buffer.concat([d.update(b.subarray(28)),d.final()]);}finally{key.fill(0);}
 let state;try{state=JSON.parse(plain.toString('utf8'));}finally{plain.fill(0);}if(!object(state))throw Error();return state;
}
const jsonl=bytes=>bytes.toString('utf8').split('\n').filter(l=>l.trim()).map(l=>{const r=JSON.parse(l);if(!object(r))throw Error();return r;});
// Receipts are completed sales. Each must match exactly one journal row and, for a LEADER DIP full sale, exactly one
// ledger result; every journal/ledger sale id must carry a receipt (provable only below the receipt cap).
function receiptsConsistent(state,journal,ledger){
 const receipts=state.saleReceipts===undefined?[]:state.saleReceipts;
 if(!Array.isArray(receipts)||receipts.some(x=>typeof x!=='string'||!ID.test(x)))block('RECEIPT_MALFORMED');
 if(new Set(receipts).size!==receipts.length)block('RECEIPT_DUPLICATE');
 const ids=rows=>{const m=new Map();for(const r of rows){if(!Object.hasOwn(r,'saleId'))continue;if(typeof r.saleId!=='string'||!ID.test(r.saleId))block('RECEIPT_MALFORMED');m.set(r.saleId,[...(m.get(r.saleId)||[]),r]);}return m;};
 const j=ids(journal),l=ids(ledger||[]),have=new Set(receipts),capped=receipts.length>=RECEIPT_CAP;
 for(const rows of [...j.values(),...l.values()])if(rows.length>1)block('RECEIPT_AMBIGUOUS');
 for(const id of receipts){const row=j.get(id)?.[0];if(!row)block('RECEIPT_UNMATCHED');
  if(isLeaderDip(row)&&isFullSale(row)){if(ledger===null)block('LEADER_DIP_RESULT_WITHOUT_LEDGER');const res=l.get(id)?.[0];if(!res||res.kind!=='result')block('RECEIPT_UNMATCHED');}}
 for(const id of [...j.keys(),...l.keys()]){if(!j.has(id))block('RECEIPT_UNMATCHED');if(!have.has(id))block(capped?'RECEIPT_AMBIGUOUS':'JOURNAL_UNRECEIPTED');}
}
function check(root){
 if(!process.env.PRIVATE_KEY)block('MISSING_KEY');
 const head=repository(root),inputs=readInputs(root),state=decrypt(inputs['data/private.enc']);
 if(Object.hasOwn(state,'pendingSale'))block('PENDING_SALE');
 if(Object.keys(state).some(k=>/pending|intent|recover/i.test(k)))block('STATE_INTENT');
 if(state.shares!==undefined&&!object(state.shares)||state.closed!==undefined&&!Array.isArray(state.closed))throw Error();
 if(!object(JSON.parse(inputs['data/my-positions.json'].toString('utf8'))))throw Error();
 const journal=jsonl(inputs['data/my-trades.jsonl']),ledger=inputs[LEDGER]===null?null:jsonl(inputs[LEDGER]);
 receiptsConsistent(state,journal,ledger);
 // the local copy must be the authoritative HEAD state for every dependency (a locally deleted marker, an edited
 // scan.mjs or an uncommitted input cannot steer the result)
 for(const rel of DEPENDENCIES)if(!matchesHead(root,rel))block('LOCAL_STATE_DIFFERS');
 if(ledger===null){
  if(git(root,['ls-tree','HEAD','--',MARKER])!==''||fs.existsSync(path.join(root,MARKER)))block('PRIVACY_MODE');
  let code=null;try{const f=path.join(root,SCAN),st=fs.lstatSync(f);if(st.isFile()&&!st.isSymbolicLink())code=sha(fs.readFileSync(f));}catch{}   // identical to HEAD:scan.mjs (checked above)
  if(!OPTIONAL_LEDGER_CODE.has(code))block('CODE_UNREVIEWED');
  if(journal.some(r=>isLeaderDip(r)&&isFullSale(r)))block('LEADER_DIP_RESULT_WITHOUT_LEDGER');
  if(!historyComplete(root))block('LEDGER_HISTORY_UNCERTAIN');
  if(git(root,['log','--full-history','--no-renames','--format=%H','HEAD','--',LEDGER])!=='')block('LEDGER_EXISTED');
 }
 // a moving local copy: inputs must be byte-identical at the end, and HEAD must not have moved
 for(const [rel] of INPUTS){const file=path.join(root,rel);if(inputs[rel]===null){let gone=false;try{fs.lstatSync(file);}catch(e){gone=e.code==='ENOENT';}if(!gone)block('STATE_CHANGED');continue;}
  const st=fs.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||!fs.readFileSync(file).equals(inputs[rel]))block('STATE_CHANGED');}
 if(git(root,['rev-parse','--verify','HEAD^{commit}'])!==head)block('STATE_CHANGED');
 return 'PASS';
}
// After the protected check: the workflow fetches current main into FETCH_HEAD; any dependency change since the
// checked-out HEAD (net change, or any commit touching a dependency, or rewritten history) invalidates PASS.
function fresh(root){
 const head=repository(root),current=git(root,['rev-parse','--verify','FETCH_HEAD^{commit}']);
 if(current===head)return 'PASS';
 if(git(root,['merge-base','--is-ancestor',head,current],{allowFail:true})===null)block('STATE_CHANGED');
 if(git(root,['diff','--name-only',head,current,'--',...DEPENDENCIES])!=='')block('STATE_CHANGED');
 if(git(root,['log','--full-history','--no-renames','--format=%H',head+'..'+current,'--',...DEPENDENCIES])!=='')block('STATE_CHANGED');
 return 'PASS';
}
let status='ERROR';
try{const a=process.argv.slice(2);if(a.length===1&&!a[0].startsWith('-'))status=check(path.resolve(a[0]));else if(a.length===2&&a[0]==='--fresh')status=fresh(path.resolve(a[1]));}
catch(e){if(e instanceof Blocked)status='BLOCKED '+e.code;}
process.stdout.write(status+'\n');process.exitCode=status==='PASS'?0:status.startsWith('BLOCKED ')?2:1;
