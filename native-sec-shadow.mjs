// Shadow-only hook for already returned response bytes. No provider calls,
// messages, scoring, legacy mutation or default activation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {openNativeRun,appendNativeResponse,appendNativeSubmissions,nativeWriterStats,markNativeRunIncomplete} from './native-sec-events.mjs';
export function createNativeSecShadow({enabled=false,directory,runId,sourceSha,provenance='DECLARED_UNAUDITED_NATIVE',parent=null,parentManifestFile=null,parentManifestSha256=null,now=()=>new Date().toISOString()}){
 let store=null;
 const getParent=()=>{if(!parentManifestFile)return parent;const fd=fs.openSync(parentManifestFile,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const st=fs.fstatSync(fd);if(!st.isFile()||st.size>8192)throw Error('NATIVE_PARENT_MANIFEST');const b=fs.readFileSync(fd);if(createHash('sha256').update(b).digest('hex')!==parentManifestSha256)throw Error('NATIVE_PARENT_MANIFEST');const p=JSON.parse(b);if(typeof p.directory!=='string'||!path.resolve(p.directory).startsWith(path.resolve('runtime/native-sec-parents')+path.sep))throw Error('NATIVE_PARENT_MANIFEST');return p;}finally{fs.closeSync(fd);}};
 const state={enabled,responses:0,archived:0,failures:0,status:enabled?'NOT_OBSERVED':'DISABLED',lastReason:null};
 const api={observe(input){if(!enabled)return {status:'DISABLED'};state.responses++;try{store=store||openNativeRun({directory,runId,sourceSha,provenance,parent:getParent()});const r=input.kind==='SEC_SUBMISSIONS_RESPONSE_V1'?appendNativeSubmissions(store,input):appendNativeResponse(store,input);state.archived++;state.status=state.failures?'ARCHIVED_WITH_GAPS':'ARCHIVED_UNAUDITED';return {status:state.status,...r};}catch(e){state.failures++;state.status='UNKNOWN';try{markNativeRunIncomplete({directory,runId,sourceSha},input.observedAt);}catch{}state.lastReason=['NATIVE_INPUT_SCOPE','NATIVE_INTERRUPTED_WRITE','NATIVE_STORAGE_BUDGET','NATIVE_RESPONSE_BUDGET'].includes(e.message)?e.message:'ARCHIVE_FAILURE';return {status:'UNKNOWN',reason:state.lastReason};}},report(){return {...state,writer:store?nativeWriterStats(store):null};},
 // Tee the actual existing submissions response once; the caller still parses its original JSON.
 async readSubmissions(response,{url,requestStartedAt}){
  if(!enabled)return response.ok?response.json():null;
  const headersReceivedAt=now();if(!response.ok){api.observe({kind:'SEC_SUBMISSIONS_RESPONSE_V1',body:Buffer.alloc(0),url,responseUrl:response.url||null,redirected:response.redirected??null,httpStatus:response.status,requestStartedAt,headersReceivedAt,bodyReceivedAt:null,observedAt:now()});return null;}
  let body;try{body=Buffer.from(await response.arrayBuffer());}catch(e){api.observe({kind:'SEC_SUBMISSIONS_RESPONSE_V1',body:Buffer.alloc(0),url,responseUrl:response.url||null,redirected:response.redirected??null,httpStatus:0,requestStartedAt,headersReceivedAt,bodyReceivedAt:null,observedAt:now()});throw e;}
  const bodyReceivedAt=now();api.observe({kind:'SEC_SUBMISSIONS_RESPONSE_V1',body,url,responseUrl:response.url||null,redirected:response.redirected??null,httpStatus:response.status,requestStartedAt,headersReceivedAt,bodyReceivedAt,observedAt:now()});return JSON.parse(new TextDecoder().decode(body));
 }};return api;
}
