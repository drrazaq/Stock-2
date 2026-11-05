// Inactive Linux-only A research store. No provider, environment credential, workflow or production caller.
// Every mutation is executed inside one kernel flock; the lock file is permanent, never deleted or aged out.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {randomUUID,createHash,createPublicKey,verify} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {evidenceHash,evidenceTime} from './reclaim-research-workflow.mjs';
import {runAEvidenceDataset} from './a-evidence-contract.mjs';
import {captureJson} from './capture-json.mjs';
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
function immutable(d,name,bytes,control){
 need(/^[a-zA-Z0-9_.-]+$/.test(name),'STORE_NAME_INVALID');
 if(fs.existsSync(d.anchor+'/'+name)){need(safeRead(d.anchor+'/'+name).equals(bytes),'IMMUTABLE_RECORD_CONFLICT');return;}
 capacity(d,bytes.length);const tmp=control?`.control-${control.generation}-${control.requestHash}-${control.stage}-${randomUUID()}`:'.partial-'+randomUUID(),f=fs.openSync(d.anchor+'/'+tmp,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);
 try{if(control&&control.request.fault==='DURING_'+control.stage+'_WRITE'){fs.writeFileSync(f,bytes.subarray(0,Math.max(1,Math.floor(bytes.length/2))));fs.fsyncSync(f);fault(d,control.request,'DURING_'+control.stage+'_WRITE');}fs.writeFileSync(f,bytes);fs.fsyncSync(f);}finally{fs.closeSync(f);}
 // A failed/interrupted temp stays visible; no truncation or replacement of original evidence.
 if(control){
  // Every control publisher holds the same kernel lock. Never replace an existing attempt.
  // Rename avoids a crash window with an extra hard link to authoritative control bytes.
  if(fs.existsSync(d.anchor+'/'+name)){need(safeRead(d.anchor+'/'+name).equals(bytes),'IMMUTABLE_RECORD_CONFLICT');return;}
  fs.renameSync(d.anchor+'/'+tmp,d.anchor+'/'+name);
 }else{fs.linkSync(d.anchor+'/'+tmp,d.anchor+'/'+name);fs.unlinkSync(d.anchor+'/'+tmp);}
 fs.fsyncSync(d.fd);
}
const encoded=o=>Buffer.from(JSON.stringify(o)+'\n');
function head(d){return fs.existsSync(d.anchor+'/HEAD.json')?json(d.anchor+'/HEAD.json'):null;}
function current(d,token,readOnly=false){
 const h=head(d);need(h&&evidenceHash(h)===token,'STALE_FENCE');const store=json(d.anchor+'/STORE.json');let cursor=h;
 while(cursor){need(Number.isSafeInteger(cursor.generation)&&cursor.generation>0,'CONTROL_CHAIN_INVALID');const g=json(d.anchor+`/generation-${cursor.generation}.json`);need(evidenceHash(g)===cursor.generationHash&&g.generation===cursor.generation&&(g.previous?.generation||0)===cursor.generation-1,'CONTROL_CHAIN_INVALID');if(fs.existsSync(d.anchor+'/'+attemptName(cursor.generation))){const a=readAttempt(d,store,cursor.generation);need(evidenceHash(a.generationRecord)===cursor.generationHash,'CONTROL_CHAIN_INVALID');}cursor=g.previous;}
 if(!readOnly)need(!transition(d),'GENERATION_TRANSITION_PENDING');return h;
}
function validateLock(d){const a=fs.fstatSync(3),b=fs.lstatSync(d.anchor+'/.a-writer.lock'),r=fs.lstatSync(d.root);need(a.ino===b.ino&&a.dev===b.dev&&!b.isSymbolicLink()&&r.ino===d.initial.ino&&r.dev===d.initial.dev&&!r.isSymbolicLink(),'STORE_OR_LOCK_REPLACED');}
function pending(d){return names(d).filter(n=>/^intent-[a-f0-9]{64}\.json$/.test(n)&&!fs.existsSync(d.anchor+'/'+n.replace('intent-','commit-'))&&!fs.existsSync(d.anchor+'/'+n.replace('intent-','unresolved-')));}
function fault(d,r,at){if(r.fault===at){need(json(d.anchor+'/STORE.json').origin==='SYNTHETIC','FAULT_INJECTION_REFUSED');process.kill(process.pid,'SIGKILL');}}
const attemptName=n=>`generation-attempt-${n}.json`,completeName=n=>`generation-complete-${n}.json`;
function controlTemps(d,n){return names(d).filter(x=>new RegExp('^\\.control-'+n+'-[a-f0-9]{64}-[A-Z_]+-').test(x));}
function archivedRequests(d,n){
 const expected=head(d);if(n!==(expected?.generation||0)+1)return [];
 return names(d).filter(x=>/^(?:takeover|claim)-request-[a-f0-9]{64}\.json$/.test(x)).filter(name=>{
  const value=json(d.anchor+'/'+name),request=value.body||value;
  return (request.expectedHeadHash??request.expectedToken??null)===(expected?evidenceHash(expected):null);
 }).map(name=>name.slice(name.lastIndexOf('-')+1,-5));
}
function transition(d){
 const h=head(d),n=h?.generation||0;
 if(n&&fs.existsSync(d.anchor+'/'+attemptName(n))){
  if(!fs.existsSync(d.anchor+'/'+completeName(n)))return n;
  const receipt=json(d.anchor+'/'+completeName(n)),a=json(d.anchor+'/'+attemptName(n));need(receipt.requestHash===a.requestHash&&evidenceHash(receipt.head)===evidenceHash(h),'CONTROL_CHAIN_INVALID');
 }
 if(fs.existsSync(d.anchor+'/'+attemptName(n+1))||fs.existsSync(d.anchor+`/generation-${n+1}.json`)||controlTemps(d,n+1).length||archivedRequests(d,n+1).length)return n+1;
 return null;
}
function recoveryRoot(input){
 need(input&&typeof input.id==='string'&&/^[A-Za-z0-9_-]{1,80}$/.test(input.id)&&typeof input.publicKey==='string'&&input.publicKey.startsWith('-----BEGIN PUBLIC KEY-----'),'RECOVERY_AUTHORITY_INVALID');
 const key=createPublicKey(input.publicKey);need(key.asymmetricKeyType==='ed25519','RECOVERY_AUTHORITY_INVALID');
 const publicKey=key.export({type:'spki',format:'pem'});need(publicKey===input.publicKey,'RECOVERY_AUTHORITY_NONCANONICAL');
 return {id:input.id,publicKey,fingerprint:hash(key.export({type:'spki',format:'der'}))};
}
function intentDescriptor(d,name){
 const bytes=safeRead(d.anchor+'/'+name),i=JSON.parse(bytes),key=name.slice(7,-5);
 need(i.schema===1&&i.key===key&&evidenceHash({kind:i.record.kind,logicalId:i.record.logicalId})===key&&evidenceHash(i.record)===i.recordHash,'PENDING_INTENT_CORRUPT');
 return {key,intentHash:hash(bytes),recordHash:i.recordHash,kind:i.record.kind,logicalId:i.record.logicalId};
}
function view(d,store){
 const h=head(d);if(h)current(d,evidenceHash(h),true);
 const count=unresolved(d,store).length;
 return {storeId:store.storeId??null,cohortHash:store.cohortHash,contractHash:store.contractHash,expectedHeadHash:h?evidenceHash(h):null,pending:pending(d).sort().map(n=>intentDescriptor(d,n)),residues:residueDescriptors(d),unresolved:count,transition:transition(d)};
}
function residueDescriptors(d,requestHash){return names(d).filter(n=>n.startsWith('.partial-')).sort().filter(file=>{const f=d.anchor+'/unresolved-'+evidenceHash({residue:file})+'.json';return !fs.existsSync(f)||(requestHash&&json(f).requestHash===requestHash);}).map(file=>({file,sha256:hash(safeRead(d.anchor+'/'+file))}));}
function authorization(d,store,a,action){
 need(store.recoveryAuthority&&store.storeId,'RECOVERY_AUTHORITY_NOT_CONFIGURED');
 const root=recoveryRoot(store.recoveryAuthority),b=a?.body;
 need(a&&Object.keys(a).sort().join(',')==='body,keyId,signature','RECOVERY_AUTH_CONTEXT_MISMATCH');
 need(a&&a.keyId===root.id&&b?.schema===1&&b.action===action&&b.storeId===store.storeId&&b.cohortHash===store.cohortHash&&b.contractHash===store.contractHash,'RECOVERY_AUTH_CONTEXT_MISMATCH');
 need(Object.keys(b).sort().join(',')==='action,at,boundaryEvidenceHash,cohortHash,contractHash,expectedHeadHash,nextOwner,pending,residues,schema,storeId','RECOVERY_AUTH_CONTEXT_MISMATCH');
 need(typeof a.signature==='string'&&/^[A-Za-z0-9+/]{86}==$/.test(a.signature)&&verify(null,Buffer.from(evidenceHash(b)),root.publicKey,Buffer.from(a.signature,'base64')),'RECOVERY_AUTH_SIGNATURE_INVALID');
 need(Array.isArray(b.pending)&&b.pending.length<=MAX_FILES&&Array.isArray(b.residues)&&b.residues.length<=MAX_FILES,'RECOVERY_AUTH_CONTEXT_MISMATCH');
 return b;
}
function signedRequestSource(store,r,retainedBytes){
 let bytes;
 if(retainedBytes)bytes=retainedBytes;
 else if(r.authorizationSource){
  const s=r.authorizationSource;need(typeof s.file==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/.test(s.file)&&hex(s.sha256),'SIGNED_REQUEST_SOURCE_REQUIRED');
  const d=directory(s.directory);let f;try{f=fs.openSync(d.anchor+'/'+s.file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const stat=fs.fstatSync(f);need(stat.isFile()&&stat.nlink===1&&!(stat.mode&0o077)&&stat.size<=1048576,'UNSAFE_SIGNED_REQUEST_SOURCE');bytes=fs.readFileSync(f);need(hash(bytes)===s.sha256,'SIGNED_REQUEST_SOURCE_CHANGED');fs.fsyncSync(f);fs.fsyncSync(d.fd);const end=fs.lstatSync(d.anchor+'/'+s.file);need(end.ino===stat.ino&&end.dev===stat.dev&&end.size===bytes.length&&end.mtimeMs===stat.mtimeMs&&!end.isSymbolicLink(),'SIGNED_REQUEST_SOURCE_CHANGED');}finally{if(f!==undefined)fs.closeSync(f);fs.closeSync(d.fd);}
 }else{need(store.origin==='SYNTHETIC','DURABLE_SIGNED_REQUEST_REQUIRED');need(r.authorization,'RECOVERY_AUTH_CONTEXT_MISMATCH');bytes=encoded(r.authorization);}
 need(bytes.length<=1048576,'SIGNED_REQUEST_SOURCE_CAP');const a=captureJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(r.authorization!==undefined)need(evidenceHash(a)===evidenceHash(r.authorization),'SIGNED_REQUEST_SOURCE_CONFLICT');return {bytes,authorization:a};
}
function retainedGenerationRequest(d,store,n,requestHash){
 const signed=d.anchor+'/takeover-request-'+requestHash+'.json',plain=d.anchor+'/claim-request-'+requestHash+'.json';
 if(fs.existsSync(signed)){
  const bytes=safeRead(signed),a=captureJson(bytes.toString()),b=authorization(d,store,a,a.body?.action);
  need(['DISPOSE_INCOMPLETE_AND_ADVANCE','CLAIM_GENERATION'].includes(b.action),'RECOVERY_AUTH_CONTEXT_MISMATCH');
  const mode=b.action==='CLAIM_GENERATION'?'CLAIM':'RECOVERY',request={mode,expectedToken:b.expectedHeadHash,owner:b.nextOwner,at:b.at,boundaryEvidenceHash:b.boundaryEvidenceHash,authorization:a,authorizationRawHash:hash(bytes)};
  need(evidenceHash(request)===requestHash,'SIGNED_REQUEST_SOURCE_CHANGED');return {request,bytes};
 }
 if(fs.existsSync(plain)){const request=json(plain);need(request.mode==='CLAIM'&&request.authorization===null&&evidenceHash(request)===requestHash,'GENERATION_ATTEMPT_CORRUPT');return {request,bytes:null};}
 return null;
}
function readAttempt(d,store,n){
 const a=json(d.anchor+'/'+attemptName(n));need(a.schema===1&&a.generation===n&&a.requestHash===evidenceHash(a.request)&&a.generationRecord.generation===n&&a.generationRecord.cohortHash===store.cohortHash&&a.generationRecord.contractHash===store.contractHash,'GENERATION_ATTEMPT_CORRUPT');
 need(evidenceHash(a.generationRecord.previous)===evidenceHash(a.previous)&&a.request.expectedToken===(a.previous?evidenceHash(a.previous):null),'GENERATION_ATTEMPT_CORRUPT');
 need(n===(a.previous?.generation||0)+1&&a.generationRecord.owner===a.request.owner&&a.generationRecord.at===a.request.at&&a.generationRecord.boundaryEvidenceHash===a.request.boundaryEvidenceHash,'GENERATION_ATTEMPT_CORRUPT');
 if(a.legacyGenerationHash)need(hash(safeRead(d.anchor+`/generation-${n}.json`))===a.legacyGenerationHash,'GENERATION_ATTEMPT_CORRUPT');else need(a.generationRecord.claimRequestHash===a.requestHash,'GENERATION_ATTEMPT_CORRUPT');
 let b;
 if(a.request.mode==='RECOVERY')b=authorization(d,store,a.request.authorization,'DISPOSE_INCOMPLETE_AND_ADVANCE');
 else{need(a.request.mode==='CLAIM','GENERATION_ATTEMPT_CORRUPT');if(store.recoveryAuthority&&a.previous)b=authorization(d,store,a.request.authorization,'CLAIM_GENERATION');}
 if(b)need(b.expectedHeadHash===a.request.expectedToken&&b.nextOwner===a.request.owner&&b.at===a.request.at&&b.boundaryEvidenceHash===a.request.boundaryEvidenceHash,'RECOVERY_AUTH_CONTEXT_MISMATCH');
 if(a.request.authorizationRawHash){const bytes=safeRead(d.anchor+'/takeover-request-'+a.requestHash+'.json');need(hash(bytes)===a.request.authorizationRawHash&&evidenceHash(captureJson(bytes.toString()))===evidenceHash(a.request.authorization),'SIGNED_REQUEST_SOURCE_CHANGED');}
 return a;
}
function unresolved(d,store){
 return names(d).filter(n=>/^unresolved-[a-f0-9]{64}\.json$/.test(n)).map(n=>{
  const u=json(d.anchor+'/'+n),a=readAttempt(d,store,u.generation),b=authorization(d,store,a.request.authorization,'DISPOSE_INCOMPLETE_AND_ADVANCE');
  need(u.status==='UNRESOLVED'&&u.allowBuy===false&&u.requestHash===a.requestHash&&u.storeId===store.storeId,'UNRESOLVED_RECORD_CORRUPT');
  if(u.target.type==='INTENT'){need(n==='unresolved-'+u.target.key+'.json'&&u.target.descriptor.key===u.target.key,'UNRESOLVED_RECORD_CORRUPT');need(!fs.existsSync(d.anchor+'/commit-'+u.target.key+'.json'),'DISPOSITION_COMMIT_CONFLICT');need(b.pending.some(x=>evidenceHash(x)===evidenceHash(u.target.descriptor))&&evidenceHash(intentDescriptor(d,'intent-'+u.target.key+'.json'))===evidenceHash(u.target.descriptor),'UNRESOLVED_RECORD_CORRUPT');}
  else need(u.target.type==='RESIDUE'&&n==='unresolved-'+evidenceHash({residue:u.target.descriptor.file})+'.json'&&b.residues.some(x=>evidenceHash(x)===evidenceHash(u.target.descriptor))&&hash(safeRead(d.anchor+'/'+u.target.descriptor.file))===u.target.descriptor.sha256,'UNRESOLVED_RECORD_CORRUPT');
  return u;
 });
}
function finishGeneration(d,store,a,r){
 const checked=readAttempt(d,store,a.generation);need(evidenceHash(checked)===evidenceHash(a),'GENERATION_ATTEMPT_CORRUPT');
 const next={generation:a.generation,generationHash:evidenceHash(a.generationRecord)},now=head(d);
 need(evidenceHash(now)===evidenceHash(a.previous)||evidenceHash(now)===evidenceHash(next),'CONTROL_CAS_FAILED');
 const put=(name,value,stage)=>immutable(d,name,encoded(value),{generation:a.generation,requestHash:a.requestHash,stage,request:r});
 if(a.request.mode==='RECOVERY'){
  const b=authorization(d,store,a.request.authorization,'DISPOSE_INCOMPLETE_AND_ADVANCE');
  const relevant=names(d).filter(n=>/^intent-[a-f0-9]{64}\.json$/.test(n)&&!fs.existsSync(d.anchor+'/'+n.replace('intent-','commit-'))).filter(n=>{const f=d.anchor+'/'+n.replace('intent-','unresolved-');return !fs.existsSync(f)||json(f).requestHash===a.requestHash;}).sort().map(n=>intentDescriptor(d,n));
  const residues=residueDescriptors(d,a.requestHash);
  need(evidenceHash(b.pending)===evidenceHash(relevant)&&evidenceHash(b.residues)===evidenceHash(residues),'RECOVERY_INVENTORY_CHANGED');

 }
 const gf=d.anchor+`/generation-${a.generation}.json`;
 if(fs.existsSync(gf))need(evidenceHash(json(gf))===evidenceHash(a.generationRecord),'GENERATION_ATTEMPT_CONFLICT');else put(`generation-${a.generation}.json`,a.generationRecord,'GENERATION');
 fault(d,r,'AFTER_GENERATION');validateLock(d);
 if(evidenceHash(head(d))===evidenceHash(a.previous)){
  const tmp=`.head-${a.requestHash}`;put(tmp,next,'HEAD');fault(d,r,'BEFORE_HEAD');need(evidenceHash(head(d))===evidenceHash(a.previous),'CONTROL_CAS_FAILED');
  // Retain the staged control bytes as part of the attempt; use a fresh derived pointer copy.
  const swap='.head-switch-'+randomUUID();put(swap,next,'SWITCH');fault(d,r,'AFTER_SWITCH_WRITE');
  fs.renameSync(d.anchor+'/'+swap,d.anchor+'/HEAD.json');fs.fsyncSync(d.fd);
 }
 fault(d,r,'AFTER_HEAD');validateLock(d);need(evidenceHash(head(d))===evidenceHash(next),'CONTROL_CAS_FAILED');
 if(a.request.mode==='RECOVERY'){const b=a.request.authorization.body;
  for(const desc of b.pending){const u={schema:1,status:'UNRESOLVED',allowBuy:false,storeId:store.storeId,generation:a.generation,requestHash:a.requestHash,at:b.at,target:{type:'INTENT',key:desc.key,descriptor:desc}};put('unresolved-'+desc.key+'.json',u,'DISPOSITION');fault(d,r,'AFTER_DISPOSITION');}
  for(const desc of b.residues){const key=evidenceHash({residue:desc.file}),u={schema:1,status:'UNRESOLVED',allowBuy:false,storeId:store.storeId,generation:a.generation,requestHash:a.requestHash,at:b.at,target:{type:'RESIDUE',descriptor:desc}};put('unresolved-'+key+'.json',u,'DISPOSITION');fault(d,r,'AFTER_DISPOSITION');}
 }
 put(completeName(a.generation),{schema:1,requestHash:a.requestHash,head:next},'RECEIPT');fault(d,r,'AFTER_CLAIM_RECEIPT');
 return {head:next,token:evidenceHash(next),status:'GENERATION_READY',unresolved:unresolved(d,store).length};
}
function beginGeneration(d,store,r,mode,retainedBytes=null){
 const old=head(d),expected=old?evidenceHash(old):null;
 let b=null,source=null;if(mode==='RECOVERY'){source=signedRequestSource(store,r,retainedBytes);b=authorization(d,store,source.authorization,'DISPOSE_INCOMPLETE_AND_ADVANCE');}
 else if(store.recoveryAuthority&&old){source=signedRequestSource(store,r,retainedBytes);b=authorization(d,store,source.authorization,'CLAIM_GENERATION');}
 if(b){need(b.expectedHeadHash===expected,'CONTROL_CAS_FAILED');r={...r,expectedToken:b.expectedHeadHash,owner:b.nextOwner,at:b.at,boundaryEvidenceHash:b.boundaryEvidenceHash};}
 need(expected===r.expectedToken,'CONTROL_CAS_FAILED');
 need(typeof r.owner==='string'&&r.owner.length>0&&r.owner.length<=100&&Number.isFinite(evidenceTime(r.at))&&hex(r.boundaryEvidenceHash),'BOUNDARY_CONTEXT_REQUIRED');
 if(old){current(d,expected,true);need(evidenceTime(r.at)>=evidenceTime(json(d.anchor+`/generation-${old.generation}.json`).at),'BOUNDARY_CLOCK_REGRESSION');}
 const request={mode,expectedToken:r.expectedToken,owner:r.owner,at:r.at,boundaryEvidenceHash:r.boundaryEvidenceHash,authorization:b?source.authorization:null,authorizationRawHash:source?hash(source.bytes):null},requestHash=evidenceHash(request),n=(old?.generation||0)+1;
 const reservation=transition(d);need(!reservation||reservation===n,'GENERATION_TRANSITION_PENDING');
 if(fs.existsSync(d.anchor+'/'+attemptName(n))){const a=readAttempt(d,store,n);need(a.requestHash===requestHash,'GENERATION_ATTEMPT_CONFLICT');return finishGeneration(d,store,a,r);}
 need(controlTemps(d,n).every(name=>name.split('-')[2]===requestHash)&&archivedRequests(d,n).every(hash=>hash===requestHash),'GENERATION_ATTEMPT_CONFLICT');
 const currentView=view(d,store);
 if(mode==='RECOVERY'){
  need(b.pending.length||b.residues.length,'NO_UNRESOLVED_EVIDENCE');need(evidenceHash(b.pending)===evidenceHash(currentView.pending)&&evidenceHash(b.residues)===evidenceHash(currentView.residues),'RECOVERY_INVENTORY_CHANGED');
 }else{need(!currentView.pending.length,'PENDING_INTENT_REQUIRES_RECOVERY');need(!currentView.residues.length,'UNRESOLVED_PARTIAL_ARTIFACTS');if(b)need(!b.pending.length&&!b.residues.length,'RECOVERY_AUTH_CONTEXT_MISMATCH');}
 const gf=d.anchor+`/generation-${n}.json`;let legacyGenerationHash;
 let generationRecord={schema:1,generation:n,previous:old,owner:r.owner,at:r.at,boundaryEvidenceHash:r.boundaryEvidenceHash,cohortHash:store.cohortHash,contractHash:store.contractHash,claimRequestHash:requestHash};
 if(fs.existsSync(gf)){const g=json(gf),{claimRequestHash:unused,...expectedGeneration}=generationRecord;need(mode==='CLAIM'&&evidenceHash(g)===evidenceHash(expectedGeneration),'GENERATION_ATTEMPT_CONFLICT');legacyGenerationHash=hash(safeRead(gf));generationRecord=g;}
 const a={schema:1,generation:n,previous:old,request,requestHash,generationRecord,...(legacyGenerationHash?{legacyGenerationHash}:{})};
 // The complete original request is durable before the first generation-attempt mutation.
 immutable(d,(source?'takeover-request-':'claim-request-')+requestHash+'.json',source?source.bytes:encoded(request),{generation:n,requestHash,stage:'REQUEST_ARCHIVE',request:r});fault(d,r,'AFTER_REQUEST_ARCHIVE');
 immutable(d,attemptName(n),encoded(a),{generation:n,requestHash,stage:'ATTEMPT',request:r});fault(d,r,'AFTER_CLAIM_ATTEMPT');
 return finishGeneration(d,store,a,r);
}
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
 const dataset=read(datasetRef),contract=read(contractRef);need(dataset.origin===store.origin,'STORE_ORIGIN_MISMATCH');need(evidenceHash(contract)===store.contractHash,'STORE_CONTRACT_MISMATCH');
 return runAEvidenceDataset(dataset,contract,d.root);
}
function worker(root,r){
 const d=directory(root);try{
 validateLock(d);
 if(r.op==='INIT'){
  need(!head(d)&&['SYNTHETIC','RETAINED_RESEARCH'].includes(r.origin)&&hex(r.cohortHash)&&hex(r.contractHash),'STORE_CONTEXT_REQUIRED');
  need(r.origin==='SYNTHETIC'||r.recoveryAuthority,'RECOVERY_AUTHORITY_ENROLLMENT_REQUIRED');
  immutable(d,'STORE.json',encoded({kind:'A_FENCED_INACTIVE_RESEARCH_V1',storeId:randomUUID(),origin:r.origin,cohortHash:r.cohortHash,contractHash:r.contractHash,...(r.recoveryAuthority?{recoveryAuthority:recoveryRoot(r.recoveryAuthority)}:{}),allowBuy:false}));return {status:'INITIALIZED'};
 }
 const store=json(d.anchor+'/STORE.json');need(store.kind==='A_FENCED_INACTIVE_RESEARCH_V1','NOT_A_FENCED_STORE');if(r.fault)need(store.origin==='SYNTHETIC','FAULT_INJECTION_REFUSED');
 if(store.origin!=='SYNTHETIC'&&!store.recoveryAuthority)need(['HEAD','RECOVERY_VIEW','GENERATION_ATTEMPT'].includes(r.op),'RECOVERY_AUTHORITY_ENROLLMENT_REQUIRED');
 if(r.op==='HEAD'){const h=head(d);if(h)current(d,evidenceHash(h),true);return {head:h,token:h?evidenceHash(h):null,pending:pending(d).length,unresolved:unresolved(d,store).length,transition:transition(d),origin:store.origin,authorityEnrolled:!!store.recoveryAuthority};}
 if(r.op==='RECOVERY_VIEW')return view(d,store);
 if(r.op==='CLAIM')return beginGeneration(d,store,r,'CLAIM');
 if(r.op==='DISPOSE')return beginGeneration(d,store,r,'RECOVERY');
 if(r.op==='GENERATION_ATTEMPT'){
  const n=r.generation??transition(d)??(head(d)?.generation||1);need(Number.isSafeInteger(n)&&n>0,'GENERATION_REQUIRED');
  if(fs.existsSync(d.anchor+'/'+attemptName(n))){const a=readAttempt(d,store,n);return {status:'RECORDED',generation:n,attemptHash:a.requestHash,request:a.request};}
  if(fs.existsSync(d.anchor+`/generation-${n}.json`))return {status:'LEGACY_GENERATION',generation:n,attemptHash:hash(safeRead(d.anchor+`/generation-${n}.json`)),original:json(d.anchor+`/generation-${n}.json`)};
  const hashes=[...new Set([...controlTemps(d,n).map(name=>name.split('-')[2]),...archivedRequests(d,n)])];if(hashes.length===1&&retainedGenerationRequest(d,store,n,hashes[0]))return {status:'RECORDED_REQUEST',generation:n,attemptHash:hashes[0]};return {status:hashes.length?'ORIGINAL_REQUEST_REQUIRED':'NONE',generation:n,attemptHashes:hashes};
 }
 if(r.op==='RESUME_CLAIM'){
  need(Number.isSafeInteger(r.generation)&&r.generation>0&&hex(r.attemptHash),'GENERATION_ATTEMPT_PIN_REQUIRED');
  if(!fs.existsSync(d.anchor+'/'+attemptName(r.generation))){const saved=retainedGenerationRequest(d,store,r.generation,r.attemptHash);if(saved){const q=saved.request;return beginGeneration(d,store,{...r,expectedToken:q.expectedToken,owner:q.owner,at:q.at,boundaryEvidenceHash:q.boundaryEvidenceHash},q.mode,saved.bytes);}const f=d.anchor+`/generation-${r.generation}.json`;need(fs.existsSync(f),'ORIGINAL_REQUEST_REQUIRED');need(hash(safeRead(f))===r.attemptHash,'GENERATION_ATTEMPT_PIN_MISMATCH');const g=json(f);return beginGeneration(d,store,{...r,expectedToken:g.previous?evidenceHash(g.previous):null,owner:g.owner,at:g.at,boundaryEvidenceHash:g.boundaryEvidenceHash},'CLAIM');}
  const a=readAttempt(d,store,r.generation);need(a.requestHash===r.attemptHash,'GENERATION_ATTEMPT_PIN_MISMATCH');return finishGeneration(d,store,a,r);
 }
 current(d,r.token);validateLock(d);const unresolvedRecords=unresolved(d,store);
 if(r.op==='LOOKUP'){
  const key=evidenceHash({kind:r.kind,logicalId:r.logicalId}),file=d.anchor+'/commit-'+key+'.json';const u=unresolvedRecords.find(u=>u.target.type==='INTENT'&&u.target.key===key);if(u)return {status:'UNRESOLVED',allowBuy:false,disposition:u,originalIntent:json(d.anchor+'/intent-'+key+'.json')};if(r.kind==='EVALUATION'&&unresolvedRecords.length)return {status:'UNRESOLVED_STORE_EVIDENCE',allowBuy:false};if(!fs.existsSync(file))return {status:'NOT_COMMITTED'};
  const c=json(file),record=json(d.anchor+'/record-'+key+'.json');need(evidenceHash(record)===c.recordHash,'COMMITTED_RECORD_CORRUPT');return {status:'FOUND',record,receipt:c};
 }
 if(r.op==='APPEND'){
  need(['TRANSPORT','ORIGINAL','ACQUISITION'].includes(r.kind),'STRICT_EVALUATOR_REQUIRED');
  const key=evidenceHash({kind:r.kind,logicalId:r.logicalId});need(!unresolvedRecords.some(u=>u.target.type==='INTENT'&&u.target.key===key),'INTENT_PERMANENTLY_UNRESOLVED');need(pending(d).every(n=>n==='intent-'+key+'.json'),'PENDING_INTENT_REQUIRES_RECOVERY');
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
  if(unresolvedRecords.length)return {status:'UNRESOLVED_STORE_EVIDENCE',allowBuy:false,result:{status:'UNRESOLVED_STORE_EVIDENCE',allowBuy:false,prospectiveAdmissions:0,unresolvedRecords:unresolvedRecords.length}};
  need(pending(d).length===0||pending(d).every(n=>n==='intent-'+evidenceHash({kind:'EVALUATION',logicalId:r.logicalId})+'.json'),'PENDING_INTENT_REQUIRES_RECOVERY');
  const result=strictEvaluation(d,store,r.dataset,r.contract);
  return {...transact(d,r,'EVALUATION',r.logicalId,{dataset:r.dataset,contract:r.contract,result}),result};
 }
 throw Error('OPERATION_REFUSED');
 }finally{fs.closeSync(d.fd);}
}
export function createAFencedStore(root,context){
 if(context&&context.origin!=='SYNTHETIC')need(context.recoveryAuthority,'RECOVERY_AUTHORITY_ENROLLMENT_REQUIRED');
 if(context?.recoveryAuthority)recoveryRoot(context.recoveryAuthority);
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
 return {head:()=>invoke({op:'HEAD'}),recoveryView:()=>invoke({op:'RECOVERY_VIEW'}),generationAttempt:generation=>invoke({op:'GENERATION_ATTEMPT',generation}),claim:r=>invoke({...r,op:'CLAIM'}),recoverUnresolved:r=>invoke({...r,op:'DISPOSE'}),resumeClaim:r=>invoke({...r,op:'RESUME_CLAIM'}),lookup:(token,kind,logicalId)=>invoke({op:'LOOKUP',token,kind,logicalId}),append:(token,kind,logicalId,payload,bytes,fault)=>invoke({op:'APPEND',token,kind,logicalId,payload,...(bytes?{bytes:Buffer.from(bytes).toString('base64')}:{}),fault}),recover:token=>invoke({op:'RECOVER',token}),evaluate:(token,logicalId,dataset,contract,fault)=>invoke({op:'EVALUATE',token,logicalId,dataset,contract,fault})};
}
if(process.argv[2]==='--fenced-worker'&&import.meta.url===pathToFileURL(process.argv[1]).href){try{const input=fs.readFileSync(0);need(input.length<=MAX,'REQUEST_CAP');const value=worker(process.argv[3],JSON.parse(input));process.stdout.write(JSON.stringify({ok:true,value}));}catch(e){process.stdout.write(JSON.stringify({ok:false,code:/^[A-Z_]+$/.test(e.message)?e.message:'STORE_IO_ERROR'}));process.exitCode=2;}}
