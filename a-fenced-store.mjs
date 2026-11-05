// Inactive Linux-only A research store. No provider, environment credential, workflow or production caller.
// Every mutation is executed inside one kernel flock; the lock file is permanent, never deleted or aged out.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {evidenceHash,evidenceTime} from './reclaim-research-workflow.mjs';
import {runAEvidenceDataset} from './a-evidence-contract.mjs';
const need=(ok,code)=>{if(!ok)throw Error(code);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const moduleFile=new URL(import.meta.url).pathname;
const MAX=16*1024*1024,MAX_FILES=2000;
function directory(root){
 root=path.resolve(root);const s=fs.lstatSync(root);
 need(s.isDirectory()&&!s.isSymbolicLink()&&fs.realpathSync(root)===root&&!(s.mode&0o077),'PRIVATE_STORE_REQUIRED');
 const fd=fs.openSync(root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
 return {root,fd,anchor:`/proc/self/fd/${fd}`,initial:s};
}
function safeRead(p){const f=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const s=fs.fstatSync(f);need(s.isFile()&&s.nlink===1&&!(s.mode&0o077)&&s.size<=MAX,'UNSAFE_STORE_FILE');return fs.readFileSync(f);}finally{fs.closeSync(f);}}
function json(p){return JSON.parse(safeRead(p).toString());}
function names(d){const n=fs.readdirSync(d.anchor);need(n.length<=MAX_FILES,'STORE_FILE_CAP');return n;}
function capacity(d,extra){let total=0;for(const n of names(d)){const s=fs.lstatSync(d.anchor+'/'+n);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&!(s.mode&0o077),'UNSAFE_STORE_FILE');total+=s.size;}need(total+extra<=MAX,'STORE_BYTE_CAP');}
function immutable(d,name,bytes){
 need(/^[a-zA-Z0-9_.-]+$/.test(name),'STORE_NAME_INVALID');
 if(fs.existsSync(d.anchor+'/'+name)){need(safeRead(d.anchor+'/'+name).equals(bytes),'IMMUTABLE_RECORD_CONFLICT');return;}
 capacity(d,bytes.length);const tmp='.partial-'+randomUUID(),f=fs.openSync(d.anchor+'/'+tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{fs.writeFileSync(f,bytes);fs.fsyncSync(f);}finally{fs.closeSync(f);}
 // A failed/interrupted temp stays visible; no truncation or replacement of original evidence.
 fs.linkSync(d.anchor+'/'+tmp,d.anchor+'/'+name);fs.unlinkSync(d.anchor+'/'+tmp);fs.fsyncSync(d.fd);
}
const encoded=o=>Buffer.from(JSON.stringify(o)+'\n');
function head(d){return fs.existsSync(d.anchor+'/HEAD.json')?json(d.anchor+'/HEAD.json'):null;}
function current(d,token){const h=head(d);need(h&&evidenceHash(h)===token,'STALE_FENCE');const g=json(d.anchor+`/generation-${h.generation}.json`);need(evidenceHash(g)===h.generationHash,'CONTROL_CHAIN_INVALID');return h;}
function validateLock(d){const a=fs.fstatSync(3),b=fs.lstatSync(d.anchor+'/.a-writer.lock'),r=fs.lstatSync(d.root);need(a.ino===b.ino&&a.dev===b.dev&&!b.isSymbolicLink()&&r.ino===d.initial.ino&&r.dev===d.initial.dev&&!r.isSymbolicLink(),'STORE_OR_LOCK_REPLACED');}
function pending(d){return names(d).filter(n=>/^intent-[a-f0-9]{64}\.json$/.test(n)&&!fs.existsSync(d.anchor+'/'+n.replace('intent-','commit-')));}
function fault(d,r,at){if(r.fault===at){need(json(d.anchor+'/STORE.json').origin==='SYNTHETIC','FAULT_INJECTION_REFUSED');process.kill(process.pid,'SIGKILL');}}
function transact(d,r,kind,logicalId,payload,original){
 need(typeof logicalId==='string'&&logicalId.length>0&&logicalId.length<=300,'LOGICAL_ID_REQUIRED');
 const key=evidenceHash({kind,logicalId}),record={kind,logicalId,payload,original:original?{file:'raw-'+hash(original)+'.bin',sha256:hash(original)}:null},recordHash=evidenceHash(record);
 const n='intent-'+key+'.json',c='commit-'+key+'.json';
 if(fs.existsSync(d.anchor+'/'+c)){const old=json(d.anchor+'/'+c);need(old.recordHash===recordHash,'LOGICAL_RECORD_CONFLICT');need(evidenceHash(json(d.anchor+'/record-'+key+'.json'))===recordHash,'COMMITTED_RECORD_CORRUPT');return {...old,idempotent:true};}
 current(d,r.token);validateLock(d);
 immutable(d,n,encoded({schema:1,key,recordHash,record,generation:head(d).generation}));fault(d,r,'AFTER_INTENT');
 current(d,r.token);validateLock(d);
 if(original)immutable(d,record.original.file,original);
 immutable(d,'record-'+key+'.json',encoded(record));fault(d,r,'AFTER_RECORD');
 current(d,r.token);validateLock(d);
 const receipt={schema:1,key,recordHash,generation:head(d).generation,status:'LOCAL_DURABLE_COMMIT',allowBuy:false};immutable(d,c,encoded(receipt));fault(d,r,'AFTER_COMMIT');return receipt;
}
function strictEvaluation(d,store,datasetRef,contractRef){
 const read=ref=>{need(/^raw-[a-f0-9]{64}\.bin$/.test(ref?.file||'')&&hex(ref.sha256),'ORIGINAL_REFERENCE_REQUIRED');const b=safeRead(d.anchor+'/'+ref.file);need(hash(b)===ref.sha256,'ORIGINAL_BYTES_CHANGED');return JSON.parse(b);};
 const dataset=read(datasetRef),contract=read(contractRef);need(evidenceHash(contract)===store.contractHash,'STORE_CONTRACT_MISMATCH');
 return runAEvidenceDataset(dataset,contract,d.root);
}
function worker(root,r){
 const d=directory(root);try{
 validateLock(d);
 if(r.op==='INIT'){
  need(!head(d)&&['SYNTHETIC','RETAINED_RESEARCH'].includes(r.origin)&&hex(r.cohortHash)&&hex(r.contractHash),'STORE_CONTEXT_REQUIRED');
  immutable(d,'STORE.json',encoded({kind:'A_FENCED_INACTIVE_RESEARCH_V1',origin:r.origin,cohortHash:r.cohortHash,contractHash:r.contractHash,allowBuy:false}));return {status:'INITIALIZED'};
 }
 const store=json(d.anchor+'/STORE.json');need(store.kind==='A_FENCED_INACTIVE_RESEARCH_V1','NOT_A_FENCED_STORE');
 if(r.op==='HEAD')return {head:head(d),token:head(d)?evidenceHash(head(d)):null,pending:pending(d).length};
 if(r.op==='CLAIM'){
  const old=head(d);need((old?evidenceHash(old):null)===r.expectedToken,'CONTROL_CAS_FAILED');need(pending(d).length===0,'PENDING_INTENT_REQUIRES_RECOVERY');
  need(typeof r.owner==='string'&&r.owner.length>0&&r.owner.length<=100&&Number.isFinite(evidenceTime(r.at))&&hex(r.boundaryEvidenceHash),'BOUNDARY_CONTEXT_REQUIRED');
  const g={schema:1,generation:(old?.generation||0)+1,previous:old,owner:r.owner,at:r.at,boundaryEvidenceHash:r.boundaryEvidenceHash,cohortHash:store.cohortHash,contractHash:store.contractHash};
  immutable(d,`generation-${g.generation}.json`,encoded(g));validateLock(d);
  const h={generation:g.generation,generationHash:evidenceHash(g)},tmp='.head-'+randomUUID();immutable(d,tmp,encoded(h));
  // Only the mutable control pointer changes; every generation/original/intent/commit remains retained.
  if(old)need(evidenceHash(head(d))===r.expectedToken,'CONTROL_CAS_FAILED');
  fs.renameSync(d.anchor+'/'+tmp,d.anchor+'/HEAD.json');fs.fsyncSync(d.fd);return {head:h,token:evidenceHash(h)};
 }
 current(d,r.token);validateLock(d);
 if(r.op==='LOOKUP'){
  const key=evidenceHash({kind:r.kind,logicalId:r.logicalId}),file=d.anchor+'/commit-'+key+'.json';if(!fs.existsSync(file))return {status:'NOT_COMMITTED'};
  const c=json(file),record=json(d.anchor+'/record-'+key+'.json');need(evidenceHash(record)===c.recordHash,'COMMITTED_RECORD_CORRUPT');return {status:'FOUND',record,receipt:c};
 }
 if(r.op==='APPEND'){
  need(['TRANSPORT','ORIGINAL','ACQUISITION'].includes(r.kind),'STRICT_EVALUATOR_REQUIRED');
  const original=r.bytes===undefined?null:Buffer.from(r.bytes,'base64');return transact(d,r,r.kind,r.logicalId,r.payload,original);
 }
 if(r.op==='RECOVER'){
  const recovered=[];for(const n of pending(d)){
   current(d,r.token);validateLock(d);const i=json(d.anchor+'/'+n);need(evidenceHash(i.record)===i.recordHash,'PENDING_INTENT_CORRUPT');
   // Missing original bytes cannot be invented. Caller must retry the original append with the identical retained body.
   if(i.record.kind==='EVALUATION')need(evidenceHash(strictEvaluation(d,store,i.record.payload.dataset,i.record.payload.contract))===evidenceHash(i.record.payload.result),'EVALUATION_RECOVERY_SOURCE_CHANGED');
   if(i.record.original)need(fs.existsSync(d.anchor+'/'+i.record.original.file)&&hash(safeRead(d.anchor+'/'+i.record.original.file))===i.record.original.sha256,'PENDING_ORIGINAL_UNAVAILABLE');
   immutable(d,'record-'+i.key+'.json',encoded(i.record));current(d,r.token);validateLock(d);
   const c={schema:1,key:i.key,recordHash:i.recordHash,generation:head(d).generation,status:'LOCAL_DURABLE_COMMIT',allowBuy:false};immutable(d,'commit-'+i.key+'.json',encoded(c));recovered.push(i.key);
  }return {status:'LOCAL_RECOVERY_COMPLETE',recovered};
 }
 if(r.op==='EVALUATE'){
  const result=strictEvaluation(d,store,r.dataset,r.contract);
  return {...transact(d,r,'EVALUATION',r.logicalId,{dataset:r.dataset,contract:r.contract,result}),result};
 }
 throw Error('OPERATION_REFUSED');
 }finally{fs.closeSync(d.fd);}
}
export function createAFencedStore(root,context){
 if(context){fs.mkdirSync(root,{mode:0o700});const d=directory(root);try{const f=fs.openSync(d.anchor+'/.a-writer.lock',fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);fs.fsyncSync(f);fs.closeSync(f);fs.fsyncSync(d.fd);}finally{fs.closeSync(d.fd);}}
 function invoke(request){
  const d=directory(root);let f;try{
   f=fs.openSync(d.anchor+'/.a-writer.lock',fs.constants.O_RDWR|fs.constants.O_NOFOLLOW);const st=fs.fstatSync(f);need(st.isFile()&&st.nlink===1&&!(st.mode&0o077),'UNSAFE_LOCK');
   const input=encoded(request);need(input.length<=MAX,'REQUEST_CAP');
   const child=spawnSync('flock',['--exclusive','--nonblock','--conflict-exit-code','73','/proc/self/fd/3',process.execPath,moduleFile,'--fenced-worker',d.root],{input,stdio:['pipe','pipe','pipe',f],timeout:15000,maxBuffer:MAX,env:{PATH:process.env.PATH}});
   // flock's dedicated refusal is terminal NOT STARTED even if the unused stdin pipe reports EPIPE.
   if(child.status===73&&!child.signal&&!child.stdout.length)throw Error('WRITER_BUSY');
   if(child.signal||child.error)throw Object.assign(Error('WRITE_OUTCOME_UNKNOWN'),{cause:{status:child.status,signal:child.signal,errorCode:child.error?.code||null,stdoutBytes:child.stdout?.length||0}});
   let output;try{output=JSON.parse(child.stdout.toString());}catch{throw Error('WRITE_OUTCOME_UNKNOWN');}
   need(child.status===0&&output.ok,output.code||'WRITE_OUTCOME_UNKNOWN');return output.value;
  }finally{if(f!==undefined)fs.closeSync(f);fs.closeSync(d.fd);}
 }
 if(context)invoke({op:'INIT',...context});
 return {head:()=>invoke({op:'HEAD'}),claim:r=>invoke({op:'CLAIM',...r}),lookup:(token,kind,logicalId)=>invoke({op:'LOOKUP',token,kind,logicalId}),append:(token,kind,logicalId,payload,bytes,fault)=>invoke({op:'APPEND',token,kind,logicalId,payload,...(bytes?{bytes:Buffer.from(bytes).toString('base64')}:{}),fault}),recover:token=>invoke({op:'RECOVER',token}),evaluate:(token,logicalId,dataset,contract,fault)=>invoke({op:'EVALUATE',token,logicalId,dataset,contract,fault})};
}
if(process.argv[2]==='--fenced-worker'&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const input=fs.readFileSync(0);need(input.length<=MAX,'REQUEST_CAP');const value=worker(process.argv[3],JSON.parse(input));process.stdout.write(JSON.stringify({ok:true,value}));}catch(e){process.stdout.write(JSON.stringify({ok:false,code:/^[A-Z_]+$/.test(e.message)?e.message:'STORE_IO_ERROR'}));process.exitCode=2;}}
