// INACTIVE ORIGINAL-RUN OBSERVER. No financial write, offset update, recovery, delivery or workflow control.
// A PASS is observed-cycle persistence only; an authenticated host/control-plane boundary is still required.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {performance} from 'node:perf_hooks';

export const LIMITS=Object.freeze({files:8192,fileBytes:134217728,totalBytes:1073741824,cycles:4096,commits:1024,gitBytes:8388608,gitMs:5000,finalMs:45000});
const HEX=/^[a-f0-9]{40}$/,SHA=/^[a-f0-9]{64}$/;
const gitEnv={PATH:'/usr/bin:/bin',GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0',GIT_OPTIONAL_LOCKS:'0',GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null',GIT_PAGER:'cat'};
class Refusal extends Error{constructor(){super('BLOCKED');}}
const block=()=>{throw new Refusal();};
const validPath=p=>typeof p==='string'&&p.length<512&&!p.includes('\\')&&!p.includes('\0')&&!p.startsWith('/')&&p.split('/').every(s=>s&&s!=='.'&&s!=='..');
function git(root,args){try{return execFileSync('/usr/bin/git',['-c','core.fsmonitor=false','-c','core.hooksPath=/dev/null','-c','protocol.allow=never','-c','credential.helper=',...args],{cwd:root,env:gitEnv,encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:LIMITS.gitBytes,timeout:LIMITS.gitMs});}catch{block();}}
const sameStat=(a,b)=>a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;
function checkRoot(root){if(typeof root!=='string'||!path.isAbsolute(root)||fs.realpathSync(root)!==root||!fs.lstatSync(root).isDirectory())block();return root;}
function readAnchored(root,relative,budget){
 if(!validPath(relative))block();const opened=[];let leaf;
 try{
  let fd=fs.openSync(root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);opened.push(fd);
  const dirs=[{p:root,s:fs.fstatSync(fd,{bigint:true})}];let current=root;const parts=relative.split('/');
  for(const name of parts.slice(0,-1)){fd=fs.openSync('/proc/self/fd/'+fd+'/'+name,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);opened.push(fd);current=path.join(current,name);dirs.push({p:current,s:fs.fstatSync(fd,{bigint:true})});}
  leaf=fs.openSync('/proc/self/fd/'+fd+'/'+parts.at(-1),fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const before=fs.fstatSync(leaf,{bigint:true});
  if(!before.isFile()||before.size>BigInt(LIMITS.fileBytes))block();budget.bytes+=Number(before.size);if(budget.bytes>LIMITS.totalBytes||performance.now()>budget.end)block();
  const blob=crypto.createHash('sha1').update('blob '+before.size+'\0'),sha=crypto.createHash('sha256');const chunk=Buffer.alloc(65536),small=[];let size=0;
  for(;;){const n=fs.readSync(leaf,chunk,0,chunk.length,null);if(!n)break;size+=n;blob.update(chunk.subarray(0,n));sha.update(chunk.subarray(0,n));if(relative==='data/tg-state.json'){if(size>65536)block();small.push(Buffer.from(chunk.subarray(0,n)));}if(performance.now()>budget.end)block();}
  if(size!==Number(before.size)||!sameStat(before,fs.fstatSync(leaf,{bigint:true})))block();
  for(const d of dirs){const now=fs.lstatSync(d.p,{bigint:true});if(!now.isDirectory()||now.isSymbolicLink()||now.dev!==d.s.dev||now.ino!==d.s.ino)block();}
  const now=fs.lstatSync(path.join(root,relative),{bigint:true});if(now.isSymbolicLink()||!sameStat(before,now))block();
  return {oid:blob.digest('hex'),sha256:sha.digest('hex'),stat:before,offsetBytes:relative==='data/tg-state.json'?Buffer.concat(small):null};
 }catch(e){if(e instanceof Refusal)throw e;block();}finally{if(leaf!==undefined)fs.closeSync(leaf);for(const fd of opened.reverse())fs.closeSync(fd);}
}
function tree(root,sha,prefix=''){
 if(!HEX.test(sha))block();const out=new Map();
 for(const line of git(root,['ls-tree','-rz','--full-tree',sha,...(prefix?['--',prefix]:[])]).split('\0').filter(Boolean)){
  const m=line.match(/^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/s);if(!m||!validPath(m[3]))block();out.set(m[3],{mode:m[1],oid:m[2]});if(out.size>LIMITS.files)block();
 }return out;
}
function allDataFiles(root){const found=[],stack=['data'];while(stack.length){const dir=stack.pop();if(dir.split('/').length>20)block();const base=path.join(root,dir),st=fs.lstatSync(base);if(st.isSymbolicLink()||!st.isDirectory())block();for(const d of fs.readdirSync(base,{withFileTypes:true})){const rel=dir+'/'+d.name;if(!validPath(rel)||d.isSymbolicLink())block();if(d.isDirectory())stack.push(rel);else if(d.isFile())found.push(rel);else block();if(found.length+stack.length>LIMITS.files)block();}}return found.sort();}
function indexMatches(root,head,paths){const wanted=new Set(paths),entries=new Map();for(const line of git(root,['ls-files','--stage','-z']).split('\0').filter(Boolean)){const m=line.match(/^(\d+) ([a-f0-9]{40}) (\d)\t(.+)$/s);if(!m)block();if(wanted.has(m[4])){if(m[3]!=='0')block();entries.set(m[4],m[1]+':'+m[2]);}}
 const t=tree(root,head);for(const p of paths){const a=t.get(p);if((a?a.mode+':'+a.oid:undefined)!==entries.get(p))block();}}
function sourceContext(root,pins,budget){const values=new Map();for(const [p,expected]of Object.entries(pins)){if(!validPath(p)||p.startsWith('data/')||!SHA.test(expected))block();const v=readAnchored(root,p,budget);if(v.sha256!==expected)block();values.set(p,v);}if(values.size<1||values.size>64)block();return values;}
function interval(root,head,start,sourcePaths,end){
 const seen=new Set(),stack=[head];let reached=false;
 while(stack.length){if(performance.now()>end)block();const c=stack.pop();if(c===start){reached=true;continue;}if(seen.has(c))continue;seen.add(c);if(seen.size>LIMITS.commits)block();const raw=git(root,['cat-file','-p',c]),header=raw.split('\n\n')[0],parents=[...header.matchAll(/^parent ([a-f0-9]{40})$/gm)].map(x=>x[1]);if(!parents.length)block();
  if(git(root,['diff-tree','--no-ext-diff','--no-textconv','--no-renames','-m','--no-commit-id','--name-only','-r',c,'--',...sourcePaths]).trim())block();stack.push(...parents);
 }if(!reached)block();
}
export class ReceiptSession{
 #root;#protected;#required;#pins;#identity;#start;#initialTree;#initialOffset;#everPresent=new Set();#phase='IDLE';#busy=false;#failed=false;#cycles=0;#commits=new Set();#last=null;#beforeCode=null;#sealed=false;
 constructor({root,protectedPaths,requiredPaths=['data/tg-state.json','data/my-positions.json'],sourcePins,identity}){
  this.#root=checkRoot(root);if(!Array.isArray(protectedPaths)||protectedPaths.length>128||!protectedPaths.includes('data/tg-state.json')||protectedPaths.some(p=>!validPath(p)||!p.startsWith('data/')))block();
  this.#protected=[...new Set(protectedPaths)].sort();this.#required=requiredPaths;if(requiredPaths.some(p=>!this.#protected.includes(p))||!sourcePins||typeof sourcePins!=='object'||this.#protected.length+Object.keys(sourcePins).length>128)block();this.#pins=sourcePins;this.#identity=identity;
  if(!identity||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(identity.repository)||!/^\d+$/.test(identity.runId)||!Number.isSafeInteger(identity.attempt)||identity.attempt<1||!HEX.test(identity.workflowCommit))block();
  if(fs.existsSync(path.join(root,'.github/private-data-mode')))block();
  if(git(root,['rev-parse','--show-object-format']).trim()!=='sha1')block();this.#start=git(root,['rev-parse','HEAD']).trim();this.#initialTree=tree(root,this.#start);const s=this.#snapshot();this.#initialOffset=s.offset;
 }
 #budget(){return{bytes:0,end:performance.now()+LIMITS.finalMs};}
 #snapshot(){if(fs.existsSync(path.join(this.#root,'.github/private-data-mode')))block();const budget=this.#budget(),code=sourceContext(this.#root,this.#pins,budget),values=new Map();let offset;
  for(const p of this.#protected){let exists=true;try{fs.lstatSync(path.join(this.#root,p));}catch(e){if(e.code==='ENOENT')exists=false;else block();}if(!exists){if(this.#required.includes(p)||this.#initialTree?.has(p)||this.#everPresent.has(p))block();values.set(p,null);continue;}const v=readAnchored(this.#root,p,budget);this.#everPresent.add(p);values.set(p,v);if(p==='data/tg-state.json'){let j;try{j=JSON.parse(v.offsetBytes);}catch{block();}if(!j||typeof j!=='object'||Array.isArray(j)||!Number.isSafeInteger(j.offset)||j.offset<0)block();offset=j.offset;}}
  if(offset===undefined)block();return{code,values,offset};
 }
 beginCycle(){if(this.#busy||this.#sealed){this.#failed=true;return false;}this.#busy=true;this.#phase='CHILD';try{this.#beforeCode=this.#snapshot().code;return true;}catch{this.#failed=true;return true;}}
 prepareSave({childOK=true}={}){if(!this.#busy||this.#phase!=='CHILD'){this.#failed=true;return;}this.#phase='SAVE';if(!childOK)this.#failed=true;try{const s=this.#snapshot();for(const[p,v]of s.code){const b=this.#beforeCode?.get(p);if(!b||!sameStat(b.stat,v.stat))block();}if(s.offset<this.#initialOffset||this.#last&&s.offset<this.#last.offset)block();this.#last=s;}catch{this.#failed=true;}}
 confirmSave(){if(!this.#busy||this.#phase!=='SAVE'){this.#failed=true;return;}try{if(!this.#last)block();const head=git(this.#root,['rev-parse','HEAD']).trim(),t=tree(this.#root,head),now=this.#snapshot();
   for(const[p,v]of this.#last.values){if((v?.oid??null)!==(t.get(p)?.oid??null)||(v?.oid??null)!==(now.values.get(p)?.oid??null))block();}for(const[p,v]of now.code)if(!t.has(p)||t.get(p).oid!==v.oid)block();
   indexMatches(this.#root,head,[...this.#protected,...Object.keys(this.#pins)]);this.#commits.add(head);if(this.#commits.size>LIMITS.cycles)block();this.#cycles++;
  }catch{this.#failed=true;}finally{this.#busy=false;this.#phase='IDLE';}}
 fail(){this.#failed=true;}
 cycleOutcome(){return{status:this.#failed?'BLOCKED':'OBSERVED'};}
 async finalize(client){
  if(this.#sealed)return{status:'BLOCKED'};this.#sealed=true;
  try{
   if(this.#busy||this.#failed||!this.#cycles||!this.#last)block();const budget=this.#budget(),head=git(this.#root,['rev-parse','HEAD']).trim();interval(this.#root,head,this.#start,Object.keys(this.#pins),budget.end);
   for(const c of this.#commits){if(performance.now()>budget.end)block();try{git(this.#root,['merge-base','--is-ancestor',c,head]);}catch{block();}}
   const data=tree(this.#root,head,'data'),disk=allDataFiles(this.#root);if(JSON.stringify(disk)!==JSON.stringify([...data.keys()].sort()))block();
   const diskWitness=new Map();for(const p of disk){const v=readAnchored(this.#root,p,budget);if(v.oid!==data.get(p).oid)block();diskWitness.set(p,v);}indexMatches(this.#root,head,[...data.keys(),...Object.keys(this.#pins)]);
   const finalLocal=this.#snapshot();for(const[p,v]of this.#last.values)if((v?.oid??null)!==(finalLocal.values.get(p)?.oid??null))block();
   const remote=await client.main();if(!HEX.test(remote))block();await client.ancestor(head,remote);const remoteEntries=await client.entries(remote,[...this.#protected,...Object.keys(this.#pins)]);
   for(const[p,v]of finalLocal.values)if((v?.oid??null)!==(remoteEntries.get(p)?.oid??null))block();for(const[p,v]of finalLocal.code)if(v.oid!==remoteEntries.get(p)?.oid)block();
   const closing=this.#snapshot();if(git(this.#root,['rev-parse','HEAD']).trim()!==head)block();for(const[p,v]of finalLocal.values){const a=closing.values.get(p);if((v?.oid??null)!==(a?.oid??null)||v&&a&&!sameStat(v.stat,a.stat))block();}for(const[p,v]of finalLocal.code)if(!sameStat(v.stat,closing.code.get(p).stat))block();
   if(JSON.stringify(allDataFiles(this.#root))!==JSON.stringify(disk))block();for(const[p,v]of diskWitness){const a=readAnchored(this.#root,p,budget);if(a.oid!==v.oid||!sameStat(v.stat,a.stat))block();}indexMatches(this.#root,head,[...data.keys(),...Object.keys(this.#pins)]);if(await client.main()!==remote||git(this.#root,['rev-parse','HEAD']).trim()!==head||performance.now()>budget.end)block();
   return{status:'PASS',receipt:Object.freeze({schema:'MENTOR_PERSISTENCE_RECEIPT_V1',scope:'OBSERVED_CYCLES_PERSISTED_NOT_CONTROL_PLANE_OR_ACCOUNTING_APPROVAL',repository:this.#identity.repository,runId:this.#identity.runId,attempt:this.#identity.attempt,workflowCommit:this.#identity.workflowCommit,startCommit:this.#start,savedCommit:head,observedMain:remote,checkedAt:new Date().toISOString()})};
  }catch(e){return{status:e instanceof Refusal?'BLOCKED':'ERROR'};}
 }
}
export async function observeExistingCycle(session,{runExistingChild,saveExistingState}){
 if(!session.beginCycle())return{status:'BLOCKED'};let childOK=true,saveOK=true;
 try{await runExistingChild();}catch{childOK=false;session.fail();}
 session.prepareSave({childOK});try{await saveExistingState();}catch{saveOK=false;session.fail();}session.confirmSave();return session.cycleOutcome();
}

// Output is operational metadata only. No financial fingerprints, record paths, offsets or decrypted values leave the session.
export function publishReceipt(outputDir,runnerRoot,result){
 const keys=['schema','scope','repository','runId','attempt','workflowCommit','startCommit','savedCommit','observedMain','checkedAt'];const r=result?.receipt;
 if(!r||Object.keys(r).sort().join('|')!==keys.sort().join('|')||r.schema!=='MENTOR_PERSISTENCE_RECEIPT_V1'||r.scope!=='OBSERVED_CYCLES_PERSISTED_NOT_CONTROL_PLANE_OR_ACCOUNTING_APPROVAL'||![r.workflowCommit,r.startCommit,r.savedCommit,r.observedMain].every(x=>HEX.test(x))||!/^\d+$/.test(r.runId)||!Number.isSafeInteger(r.attempt)||r.attempt<1||!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(r.checkedAt)||!Number.isFinite(Date.parse(r.checkedAt))||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(r.repository))block();
 if(result.status!=='PASS'||!result.receipt)block();const dir=checkRoot(outputDir),root=checkRoot(runnerRoot);if(dir===root||dir.startsWith(root+'/')||root.startsWith(dir+'/'))block();
 const st=fs.lstatSync(dir);if(st.mode&0o077)block();const fd=fs.openSync(dir,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW),prefix='/proc/self/fd/'+fd+'/',name='.receipt-'+crypto.randomBytes(16).toString('hex');let tmp,linked=false;
 try{tmp=fs.openSync(prefix+name,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);fs.writeFileSync(tmp,JSON.stringify(result.receipt)+'\n');fs.fsyncSync(tmp);const created=fs.fstatSync(tmp);fs.linkSync(prefix+name,prefix+'receipt.json');linked=true;const actual=fs.lstatSync(prefix+'receipt.json');if(actual.isSymbolicLink()||actual.ino!==created.ino||actual.dev!==created.dev)block();fs.fsyncSync(fd);const after=fs.lstatSync(dir);if(after.isSymbolicLink()||after.ino!==st.ino||after.dev!==st.dev)block();return{status:'PASS'};
 }catch(e){return{status:e.code==='EEXIST'||e instanceof Refusal?'BLOCKED':'ERROR'};}finally{if(tmp!==undefined)fs.closeSync(tmp);try{fs.unlinkSync(prefix+name);}catch{}fs.closeSync(fd);}
}
