// Inactive co-located read-only handoff. No network, credentials or clock repair.
import {createHash} from 'node:crypto';
import {nativeRunDigest,readNativeRun,nativeEventsForCapture} from './native-sec-events.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const need=(x,c)=>{if(!x)throw Error(c);};
export const NATIVE_HANDOFF_BYTES=4*1024*1024;
export function validateNativeEvidenceAsset(asset){
 need(asset?.kind==='NATIVE_SEC_COMMITTED_PREFIX_V1'&&/^[a-f0-9]{40}$/.test(asset.sourceSha||'')&&/^[A-Za-z0-9_-]{1,80}$/.test(asset.runId||'')&&Array.isArray(asset.files)&&asset.files.length<=258,'NATIVE_HANDOFF_SCHEMA');
 need(Buffer.byteLength(JSON.stringify(asset))<=NATIVE_HANDOFF_BYTES&&sha(JSON.stringify(asset.files))===asset.sha256,'NATIVE_HANDOFF_HASH_OR_BUDGET');
 need(new Set(asset.files.map(x=>x.name)).size===asset.files.length&&asset.files.every(x=>typeof x.bodyBase64==='string'&&(x.name==='run.json'||x.name==='lineage.json'||/^response-\d{6}\.json$/.test(x.name))),'NATIVE_HANDOFF_FILES');
 const archive=readNativeRun({expectedRunId:asset.runId,expectedSourceSha:asset.sourceSha,_files:asset.files});
 need(archive.status==='INTEGRITY_CHECKED_UNAUDITED','NATIVE_HANDOFF_INCOMPLETE');return archive;
}
export function nativeHandoffPort({directory,expectedRunId,expectedSourceSha,attempts=3,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 need(Number.isInteger(attempts)&&attempts>=1&&attempts<=3,'NATIVE_HANDOFF_RETRY_BUDGET');
 return async({at,identities})=>{
  for(let attempt=0;attempt<attempts;attempt++)try{
   // Only a stable committed prefix is eligible. Cursor hints never establish integrity.
   const prefix=nativeRunDigest(directory),asset={kind:'NATIVE_SEC_COMMITTED_PREFIX_V1',runId:expectedRunId,sourceSha:expectedSourceSha,...prefix};
   const archive=validateNativeEvidenceAsset(asset);
   need(nativeRunDigest(directory).sha256===prefix.sha256,'NATIVE_HANDOFF_CHANGED');
   return {raw:JSON.stringify(nativeEventsForCapture(archive,{at,identities})),evidenceAssets:[asset]};
  }catch(e){if(attempt+1===attempts)throw e;await wait(10);}
 };
}
export function validateNativeEventAssets(raw,assets){
 const doc=JSON.parse(raw),archives=assets.map(validateNativeEvidenceAsset);
 for(const event of doc.events||[]){if(!event?.producerRunId)continue;
  need(archives.some(archive=>nativeEventsForCapture(archive,{at:event.recordedObservedAt,identities:[{issuerCik:event.issuerCik,symbol:event.symbol,securityId:event.securityId,asOf:event.observedAt,identityAudit:'DOCUMENTED_SOURCE_REVIEW'}]}).events.some(candidate=>JSON.stringify(candidate)===JSON.stringify(event))),'NATIVE_EVENT_ASSET_JOIN');
 }
}
