// Stable immutable prefix handoff while later responses append. No cursor trust,
// lock stealing, request, clock repair or relaxation of incomplete-file checks.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {nativeRunDigest,nativeEventsForCapture} from './native-sec-events.mjs';import {validateNativeEvidenceAsset} from './native-sec-handoff.mjs';import {immutableRead} from './paper-capture-wrapper.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
export function colocatedPrefixPort({directory,expectedRunId,expectedSourceSha,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 const delays=[10,25,50,100,200,400,400];
 return async({at,identities})=>{for(let attempt=0;attempt<=delays.length;attempt++)try{
  const prefix=nativeRunDigest(directory),asset={kind:'NATIVE_SEC_COMMITTED_PREFIX_V1',runId:expectedRunId,sourceSha:expectedSourceSha,...prefix},archive=validateNativeEvidenceAsset(asset);
  // A newly appended immutable successor does not alter this already captured
  // chain prefix. Recheck every selected original byte, not a mutable cursor.
  for(const f of prefix.files)if(sha(immutableRead(path.join(directory,f.name),8*1024*1024).bytes)!==sha(Buffer.from(f.bodyBase64,'base64')))throw Error('COLOCATED_PREFIX_CHANGED');
  const names=fs.readdirSync(directory);if(names.some(n=>!['run.json','lineage.json','.cursor.json'].includes(n)&&!/^response-\d{6}\.json$/.test(n)))throw Error('COLOCATED_PREFIX_INCOMPLETE');
  return {raw:JSON.stringify(nativeEventsForCapture(archive,{at,identities})),evidenceAssets:[asset]};
 }catch(e){if(attempt===delays.length)throw e;await wait(delays[attempt]);}};
}
