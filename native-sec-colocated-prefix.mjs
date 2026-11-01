// Stable immutable prefix handoff while later responses append. No cursor trust,
// lock stealing, request, clock repair or inclusion of any in-flight bytes.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {nativeRunDigest,nativeEventsForCapture,NATIVE_SEC_CAPS} from './native-sec-events.mjs';import {validateNativeEvidenceAsset} from './native-sec-handoff.mjs';import {immutableRead} from './paper-capture-wrapper.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function colocatedPrefixPort({directory,expectedRunId,expectedSourceSha,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const delays=[10,25,50,100,200,400,400];
 return async({at,identities})=>{for(let attempt=0;attempt<=delays.length;attempt++)try{
  const prefix=nativeRunDigest(directory),asset={kind:'NATIVE_SEC_COMMITTED_PREFIX_V1',runId:expectedRunId,sourceSha:expectedSourceSha,...prefix},archive=validateNativeEvidenceAsset(asset);
  // A newly appended immutable successor does not alter this already captured
  // chain prefix. Recheck every selected original byte, not a mutable cursor.
  for(const f of prefix.files)if(sha(immutableRead(path.join(directory,f.name),8*1024*1024).bytes)!==sha(Buffer.from(f.bodyBase64,'base64')))throw Error('COLOCATED_PREFIX_CHANGED');
  const names=fs.readdirSync(directory),selected=new Set(prefix.files.map(f=>f.name)),count=prefix.files.filter(f=>/^response-\d{6}\.json$/.test(f.name)).length;
  // The initial digest above remains STRICT: pre-existing locks/partial files
  // never qualify. A writer that starts only AFTER that validated snapshot may
  // append a successor without invalidating the selected immutable prefix.
  if(names.length>NATIVE_SEC_CAPS.responses+7||[...selected].some(n=>!names.includes(n)))throw Error('COLOCATED_PREFIX_INCOMPLETE');
  for(const n of names){
   if(['run.json','lineage.json','.cursor.json'].includes(n)||/^response-\d{6}\.json$/.test(n))continue;
   const successor=/^response-(\d{6})\.json\.pending-[a-f0-9]{16}$/.exec(n),cursor=/^\.cursor\.json\.pending-[a-f0-9]{16}$/.test(n);
   if(n!=='.writer-lock'&&!cursor&&!(successor&&Number(successor[1])>=count&&Number(successor[1])<NATIVE_SEC_CAPS.responses))throw Error('COLOCATED_PREFIX_INCOMPLETE');
   try{const stat=fs.lstatSync(path.join(directory,n));if(stat.isSymbolicLink()||(n==='.writer-lock'?!stat.isDirectory():!stat.isFile()))throw Error('COLOCATED_PREFIX_INCOMPLETE');}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  return {raw:JSON.stringify(nativeEventsForCapture(archive,{at,identities})),evidenceAssets:[asset]};
 }catch(e){if(attempt===delays.length)throw e;await wait(delays[attempt]);}};
}
