// Inactive, explicit-transport implementation of the pinned official Actions
// artifact JSON + Azure block-blob protocol. No SDK code, credentials from env,
// network defaults, automatic redirects, retries or activation entry point.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {immutableRead} from './paper-capture-wrapper.mjs';
import {captureJson} from './capture-json.mjs';
import {crc32} from './capture-artifact.mjs';
import {validateLineageBundle} from './native-sec-lineage-history.mjs';
import {validateCompleteNativeBundle} from './native-sec-parent-client.mjs';
const need=(value,code)=>{if(!value)throw Error(code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const instant=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
export const ARTIFACT_WIRE_CAPS=Object.freeze({archiveBytes:16*1024*1024,chunkBytes:8*1024*1024,responseBytes:65536,requestsPerUpload:5,uploadMs:6500,retries:0});
export function singleFileArtifactZip(name,body){
 need(/^(checkpoint-\d{3}\.enc|native-sec-run\.json)$/.test(name)&&Buffer.isBuffer(body)&&body.length>0,'ARTIFACT_WIRE_ZIP_SCOPE');
 const n=Buffer.from(name),local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22),crc=crc32(body);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(33,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(body.length,18);local.writeUInt32LE(body.length,22);local.writeUInt16LE(n.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(33,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(body.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(n.length,28);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+n.length,12);end.writeUInt32LE(local.length+n.length+body.length,16);
 const zip=Buffer.concat([local,n,body,central,n,end]);need(zip.length<=ARTIFACT_WIRE_CAPS.archiveBytes,'ARTIFACT_WIRE_ARCHIVE_BUDGET');return zip;
}
function tokenBackendIds(token){
 need(typeof token==='string'&&token.length<=32768&&/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token),'ARTIFACT_WIRE_TOKEN_SCHEMA');let payload;try{payload=captureJson(Buffer.from(token.split('.')[1],'base64url').toString());}catch{throw Error('ARTIFACT_WIRE_TOKEN_SCHEMA');}
 const scopes=typeof payload.scp==='string'?payload.scp.split(' ').filter(s=>s.startsWith('Actions.Results:')):[];need(scopes.length===1,'ARTIFACT_WIRE_TOKEN_SCOPE');const parts=scopes[0].split(':'),backendId=/^[A-Za-z0-9_.-]{1,128}$/;need(parts.length===3&&backendId.test(parts[1])&&backendId.test(parts[2]),'ARTIFACT_WIRE_TOKEN_SCOPE');
 // Claim decoding is not JWT signature verification; the service authenticates
 // this explicit runtime token. Never log the token, backend IDs or signed URL.
 return {workflow_run_backend_id:parts[1],workflow_job_run_backend_id:parts[2]};
}
export function createArtifactWireClient({fetcher,runtimeToken,resultsOrigin,allowedResultsOrigins,storageOrigins,profile='CAPTURE',nativeBundleVersion=1,uploadTimeoutMs=6500,now=()=>new Date().toISOString()}){
 need(typeof fetcher==='function'&&['CAPTURE','NATIVE_PARENT'].includes(profile)&&Array.isArray(allowedResultsOrigins)&&allowedResultsOrigins.includes(resultsOrigin)&&Array.isArray(storageOrigins)&&storageOrigins.length>0,'ARTIFACT_WIRE_EXPLICIT_BINDING');
 for(const origin of [resultsOrigin,...allowedResultsOrigins,...storageOrigins]){const u=new URL(origin);need(u.origin===origin&&u.protocol==='https:'&&!u.username&&!u.password,'ARTIFACT_WIRE_ORIGIN_SCOPE');}
 need(Number.isInteger(uploadTimeoutMs)&&uploadTimeoutMs>0&&uploadTimeoutMs<=6500,'ARTIFACT_WIRE_TIMEOUT_SCOPE');need([1,2].includes(nativeBundleVersion),'ARTIFACT_WIRE_BUNDLE_VERSION');const backend=tokenBackendIds(runtimeToken),maxUploads=profile==='CAPTURE'?41:1,storageLimit=profile==='CAPTURE'?164*1024*1024:16*1024*1024;
 let gate=null,session=null,attempted=0,completed=0,requests=0,archiveBytes=0,requestBodyBytes=0,failed=false,lastState='UNSENT';const ids=new Set();
 const stats=()=>({uploads:attempted,completed,requests,retries:0,archiveBytes,requestBodyBytes,failed,state:lastState});
 const cancelActiveUpload=()=>{if(session){session.active=false;session.controller.abort();session.rejectAbort?.(Error('ARTIFACT_WIRE_ABORTED'));}};
 async function uploadArtifact(name,files,root,options){
  need(!session&&!failed&&attempted<maxUploads,'ARTIFACT_WIRE_ATTEMPT_BUDGET');need(typeof gate==='function','ARTIFACT_WIRE_PRE_REQUEST_GATE_REQUIRED');
  const sequence=attempted,expectedName=profile==='CAPTURE'?'paper-capture-'+String(sequence).padStart(3,'0'):nativeBundleVersion===2?'native-sec-available-run-v2':'native-sec-complete-run-v1',fileName=profile==='CAPTURE'?'checkpoint-'+String(sequence).padStart(3,'0')+'.enc':'native-sec-run.json',retention=profile==='CAPTURE'?3:7;
  need(name===expectedName&&Array.isArray(files)&&files.length===1&&path.basename(files[0])===fileName&&path.dirname(path.resolve(files[0]))===path.resolve(root)&&options?.retentionDays===retention&&Object.keys(options).join('|')==='retentionDays','ARTIFACT_WIRE_FILE_SCOPE');
  const original=immutableRead(files[0],16*1024*1024);if(profile==='CAPTURE'){const e=captureJson(original.bytes.toString(),16*1024*1024);need(e.version===1&&e.context?.kind==='GUARDED_PAPER_CAPTURE_V1'&&e.context.cohort==='CALIBRATION'&&e.context.sequence===sequence&&typeof e.iv==='string'&&Buffer.from(e.iv,'base64').length===12&&typeof e.tag==='string'&&Buffer.from(e.tag,'base64').length===16&&typeof e.ciphertext==='string'&&Buffer.from(e.ciphertext,'base64').length>0&&Buffer.from(e.ciphertext,'base64').length<=8*1024*1024,'ARTIFACT_WIRE_ENCRYPTED_INPUT_REQUIRED');}
  else {const b=captureJson(original.bytes.toString(),16*1024*1024);if(nativeBundleVersion===2)validateLineageBundle(b,{runId:b.asset?.runId,sourceSha:b.asset?.sourceSha});else validateCompleteNativeBundle(b,{expectedRunId:b.asset?.runId,expectedSourceSha:b.asset?.sourceSha});}
  const zip=singleFileArtifactZip(fileName,original.bytes),digest=hash(zip);need(archiveBytes+zip.length<=storageLimit,'ARTIFACT_WIRE_TOTAL_STORAGE_BUDGET');const clock=now();need(instant(clock),'ARTIFACT_WIRE_CLOCK');const expires=new Date(Date.parse(clock)+retention*86400000).toISOString();
  attempted++;archiveBytes+=zip.length;lastState='UNSENT';const current={controller:new AbortController(),active:true,requests:0,start:performance.now()};session=current;let timer;const aborted=new Promise((_,reject)=>{current.rejectAbort=reject;});
  const unchanged=()=>{const latest=immutableRead(files[0],16*1024*1024);need(latest.hash===original.hash&&latest.signature===original.signature,'ARTIFACT_WIRE_FILE_CHANGED');};
  async function send(url,method,headers,body,status,{json=false}={}){
   need(current.active&&!current.controller.signal.aborted&&performance.now()-current.start<uploadTimeoutMs,'ARTIFACT_WIRE_ABORTED');unchanged();need(current.requests<5&&requests<maxUploads*5,'ARTIFACT_WIRE_REQUEST_BUDGET');
   const bytes=Buffer.isBuffer(body)?body:Buffer.from(body);gate({retry:0,bytes:bytes.length});current.requests++;requests++;requestBodyBytes+=bytes.length;lastState=url.endsWith('/CreateArtifact')?'CREATE_UNCERTAIN':url.endsWith('/FinalizeArtifact')?'FINALIZE_UNCERTAIN':'BLOB_UNCERTAIN';
   const r=await fetcher(url,{method,headers,body:bytes,redirect:'manual',credentials:'omit',signal:current.controller.signal});need(current.active&&!current.controller.signal.aborted,'ARTIFACT_WIRE_ABORTED');need(r.status===status&&r.redirected!==true,'ARTIFACT_WIRE_SERVICE_ERROR');
   const parts=[];let size=0;if(r.body){const reader=r.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;need(current.active&&!current.controller.signal.aborted,'ARTIFACT_WIRE_ABORTED');size+=value.length;need(size<=65536,'ARTIFACT_WIRE_RESPONSE_BUDGET');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}}
   const raw=Buffer.concat(parts);return json?captureJson(raw.toString()):null;
  }
  const service=resultsOrigin+'/twirp/github.actions.results.api.v1.ArtifactService/',auth={'Content-Type':'application/json',Authorization:'Bearer '+runtimeToken};
  const operation=(async()=>{
   const created=await send(service+'CreateArtifact','POST',auth,JSON.stringify({...backend,name,expires_at:expires,version:7,mime_type:'application/zip'}),200,{json:true});need(created.ok===true,'ARTIFACT_WIRE_CREATE_REJECTED');
   need(!(created.signed_upload_url!==undefined&&created.signedUploadUrl!==undefined),'ARTIFACT_WIRE_RESPONSE_SCHEMA');const blob=new URL(created.signed_upload_url||created.signedUploadUrl);need(storageOrigins.includes(blob.origin)&&blob.protocol==='https:'&&!blob.username&&!blob.password&&!blob.hash&&!blob.searchParams.has('comp')&&!blob.searchParams.has('blockid')&&blob.searchParams.has('sig'),'ARTIFACT_WIRE_STORAGE_ORIGIN');
   const blockIds=[];for(let offset=0;offset<zip.length;offset+=8*1024*1024){const blockId=Buffer.from(String(blockIds.length).padStart(8,'0')).toString('base64'),url=new URL(blob);url.searchParams.set('comp','block');url.searchParams.set('blockid',blockId);await send(url.href,'PUT',{'Content-Type':'application/octet-stream','x-ms-version':'2026-02-06'},zip.subarray(offset,offset+8*1024*1024),201);blockIds.push(blockId);}
   const commit=new URL(blob);commit.searchParams.set('comp','blocklist');await send(commit.href,'PUT',{'Content-Type':'application/xml','x-ms-version':'2026-02-06','x-ms-blob-content-type':'application/zip'},'<?xml version="1.0" encoding="utf-8"?><BlockList>'+blockIds.map(id=>'<Latest>'+id+'</Latest>').join('')+'</BlockList>',201);
   const finalized=await send(service+'FinalizeArtifact','POST',auth,JSON.stringify({...backend,name,size:String(zip.length),hash:'sha256:'+digest}),200,{json:true});need(finalized.ok===true&&!(finalized.artifact_id!==undefined&&finalized.artifactId!==undefined),'ARTIFACT_WIRE_FINALIZE_REJECTED');const rawId=finalized.artifact_id??finalized.artifactId;need(typeof rawId==='string'&&/^[1-9]\d*$/.test(rawId)||typeof rawId==='number'&&Number.isSafeInteger(rawId)&&rawId>0,'ARTIFACT_WIRE_ID_SCHEMA');const id=String(rawId);need(Number.isSafeInteger(Number(id))&&!ids.has(id),'ARTIFACT_WIRE_ID_SCHEMA');unchanged();ids.add(id);completed++;lastState='ACKNOWLEDGED';return {id:Number(id),size:zip.length,digest};
  })();
  try{return await Promise.race([operation,aborted,new Promise((_,reject)=>timer=setTimeout(()=>{current.active=false;current.controller.abort();reject(Error('ARTIFACT_WIRE_TIMEOUT'));},uploadTimeoutMs))]);}
  catch(e){failed=true;throw Error(/^ARTIFACT_WIRE_[A-Z_]+$/.test(e.message)?e.message:'ARTIFACT_WIRE_TRANSPORT_OR_SCHEMA_ERROR');}
  finally{clearTimeout(timer);current.active=false;current.controller.abort();session=null;}
 }
 return {uploadArtifact,installWireGate(fn){need(!gate&&typeof fn==='function','ARTIFACT_WIRE_GATE_ALREADY_BOUND');gate=fn;},wireStats:()=>({requests,retries:0}),stats,cancelActiveUpload};
}
