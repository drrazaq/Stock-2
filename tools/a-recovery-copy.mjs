// Secondary reconstruction only. Never unlock, truncate, or resume the original.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {pathToFileURL} from 'node:url';
import {ReclaimResearchStore} from './a-catalyst-reclaim-store.mjs';import {evidenceHash,freezeProposal} from '../reclaim-research-workflow.mjs';
const fail=s=>{throw Error(s);};const hash=b=>createHash('sha256').update(b).digest('hex');
const logNames=['observations','outcomes','transactions'].map(n=>`a-catalyst-reclaim-${n}.jsonl`);
function snapshot(root){
 const st=fs.lstatSync(root);if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(root)!==path.resolve(root)||(st.mode&0o077))fail('PRIVATE_SOURCE_REQUIRED');
 const rootfd=fs.openSync(root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW),files=new Map();let total=0;
 function walk(fd,prefix=''){
  for(const n of fs.readdirSync(`/proc/self/fd/${fd}`).sort()){
   const p=`/proc/self/fd/${fd}/${n}`,s=fs.lstatSync(p);
   if(s.isSymbolicLink())fail('SYMLINK_REFUSED');
   if(s.isDirectory()){
    if(prefix||n!=='cards'||s.mode&0o077)fail('UNEXPECTED_DIRECTORY');const d=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);try{walk(d,'cards/');}finally{fs.closeSync(d);}
   }else{
    if(!s.isFile()||s.mode&0o077||files.size>=10005||(total+=s.size)>64*1024*1024)fail('SOURCE_CAP_OR_PERMISSIONS');
    if(prefix?!/^[a-f0-9]{64}\.json$/.test(n):!['manifest.json','.a-reclaim-writer.lock',...logNames].includes(n))fail('UNEXPECTED_SOURCE_FILE');
    const f=fs.openSync(p,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const before=fs.fstatSync(f);if(before.size!==s.size||before.ino!==s.ino)fail('SOURCE_CHANGED');const b=fs.readFileSync(f),after=fs.fstatSync(f);if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)fail('SOURCE_CHANGED');files.set(prefix+n,b);}finally{fs.closeSync(f);}
   }
  }
 }
 try{walk(rootfd);const end=fs.lstatSync(root);if(end.ino!==st.ino||end.dev!==st.dev||end.isSymbolicLink())fail('SOURCE_CHANGED');return files;}finally{fs.closeSync(rootfd);}
}
function identity(files){return [...files].map(([file,bytes])=>({file,bytes:bytes.length,sha256:hash(bytes)}));}
function write(file,bytes){
 const parent=path.dirname(file);if(fs.realpathSync(parent)!==path.resolve(parent))fail('DESTINATION_SYMLINK');
 const d=fs.openSync(parent,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
 try{if(fs.realpathSync(`/proc/self/fd/${d}`)!==path.resolve(parent))fail('DESTINATION_CHANGED');const fd=fs.openSync(`/proc/self/fd/${d}/${path.basename(file)}`,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.fsyncSync(d);}finally{fs.closeSync(d);}
}
function validatedPrefix(bytes){
 const raw=bytes.toString('utf8'),cut=raw.lastIndexOf('\n')+1,prefix=raw.slice(0,cut);let previous='GENESIS',sequence=0;
 for(const line of prefix.split('\n').filter(Boolean)){if(Buffer.byteLength(line)>1024*1024)fail('LOG_LINE_CAP');const row=JSON.parse(line),{hash:h,...body}=row;if(body.sequence!==sequence++||body.previousHash!==previous||evidenceHash(body)!==h)fail('NONTAIL_CORRUPTION');previous=h;}
 return {bytes:Buffer.from(prefix),discardedFromSecondaryOnly:bytes.length-Buffer.byteLength(prefix)};
}
export function recoverSecondaryCopy({source,destination,policy,fault=()=>{}}){
 source=path.resolve(source);destination=path.resolve(destination);const parent=path.dirname(destination),p=fs.lstatSync(parent);
 if(!p.isDirectory()||p.isSymbolicLink()||fs.realpathSync(parent)!==parent||p.mode&0o077||destination===source||destination.startsWith(source+'/'))fail('PRIVATE_INDEPENDENT_DESTINATION_REQUIRED');
 const originals=snapshot(source),manifest=JSON.parse(originals.get('manifest.json')||'null');
 if(!manifest||manifest.policyHash!==freezeProposal(policy).policyHash||!['SYNTHETIC','RETAINED_RESEARCH'].includes(manifest.origin)||manifest.allowBuy!==false)fail('MANIFEST_POLICY_REQUIRED');
 for(const name of logNames)if(!originals.has(name))fail('MISSING_ORIGINAL_LOG');
 // Exclusive directory creation is the recovery-attempt lock; never remove another attempt.
 fs.mkdirSync(destination,{mode:0o700});
 const originalDir=path.join(destination,'original'),secondary=path.join(destination,'secondary');
 fs.mkdirSync(originalDir,{mode:0o700});fs.mkdirSync(secondary,{mode:0o700});
 fs.mkdirSync(path.join(originalDir,'cards'),{mode:0o700});fs.mkdirSync(path.join(secondary,'cards'),{mode:0o700});
 const notes=[];
 write(path.join(destination,'RECOVERY_STARTED.json'),JSON.stringify({schema:1,status:'INCOMPLETE_UNTIL_COMPLETE_RECEIPT',sourceFiles:identity(originals),originalLockPreserved:originals.has('.a-reclaim-writer.lock'),primaryResumeAuthorized:false})+'\n');
 for(const [name,bytes] of originals){write(path.join(originalDir,name),bytes);if(name==='.a-reclaim-writer.lock')continue;let next=bytes;
  if(logNames.includes(name)){const prefix=validatedPrefix(bytes);next=prefix.bytes;if(prefix.discardedFromSecondaryOnly)notes.push({file:name,secondaryTailExcludedBytes:prefix.discardedFromSecondaryOnly,originalPreserved:true});}
  // Only a pending intent may reconstruct a partial card; full malformed cards fail closed.
  if(name.startsWith('cards/')){try{JSON.parse(bytes);}catch{notes.push({file:name,partialCardPendingValidation:true,originalPreserved:true});continue;}}
  write(path.join(secondary,name),next);
 }
 fault('AFTER_COPY');
 const txRows=fs.readFileSync(path.join(secondary,logNames[2]),'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l).record),commits=new Set(txRows.filter(r=>r.type==='COMMIT').map(r=>r.operationId));
 for(const note of notes.filter(n=>n.partialCardPendingValidation)){
  const intents=txRows.filter(r=>r.type==='INTENT'&&r.card&&`cards/${r.card.cardId}.json`===note.file&&!commits.has(r.operationId));
  if(intents.length!==1)fail('DAMAGED_CARD_WITHOUT_UNIQUE_PENDING_INTENT');
 }
 const store=new ReclaimResearchStore({directory:secondary,policy,origin:manifest.origin,implementationId:manifest.implementationId,fault});
 try{store.recoverPending();}finally{store.close();}
 fault('AFTER_REPLAY');
 const state=ReclaimResearchStore.inspect(secondary);if(state.pendingOperationIds.length)fail('RECOVERY_PENDING');
 // Fence the secondary at the manifest boundary. The unchanged store's exact-manifest
 // comparison refuses reopening it as a normal writer, even with the old implementation ID.
 const labelled={...manifest,secondaryRecovery:{schema:1,primaryResumeAuthorized:false,sourceSnapshotHash:evidenceHash(identity(originals))}};
 write(path.join(secondary,'manifest.secondary.json'),JSON.stringify(labelled)+'\n');
 const d=fs.openSync(secondary,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
 try{if(fs.realpathSync(`/proc/self/fd/${d}`)!==secondary)fail('DESTINATION_CHANGED');fs.renameSync(`/proc/self/fd/${d}/manifest.secondary.json`,`/proc/self/fd/${d}/manifest.json`);fs.fsyncSync(d);}finally{fs.closeSync(d);}

 if(evidenceHash(identity(snapshot(source)))!==evidenceHash(identity(originals)))fail('SOURCE_CHANGED');
 const receipt={schema:1,status:'SECONDARY_RECONSTRUCTION_ONLY',allowBuy:false,originalBytesChanged:false,primaryResumeAuthorized:false,readOnlySecondaryFence:true,sourceAuthenticity:'NOT_ESTABLISHED',originalFiles:identity(originals),secondaryFiles:identity(snapshot(secondary)),notes,state};
 write(path.join(destination,'RECOVERY_COMPLETE.json'),JSON.stringify(receipt)+'\n');return receipt;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{if(process.argv.length!==5)fail('ARGS');const policy=JSON.parse(fs.readFileSync(process.argv[4],'utf8'));const r=recoverSecondaryCopy({source:process.argv[2],destination:process.argv[3],policy});process.stdout.write(JSON.stringify({status:r.status,primaryResumeAuthorized:false})+'\n');}catch{process.stderr.write('A_RECOVERY_ERROR_OR_INCOMPLETE\n');process.exitCode=1;}}
