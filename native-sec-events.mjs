// Offline/native tee adapter. No requests, keys, messages, scoring or clock synthesis.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {parseAtom} from './edgar-feed.mjs';
import {captureJson} from './capture-json.mjs';
export const NATIVE_SEC_CAPS=Object.freeze({responses:256,responseBytes:2097152,entryBytes:65536,totalStoredBytes:67108864,proofs:100});
const sha=b=>createHash('sha256').update(b).digest('hex');
const instant=x=>{if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(x)||!Number.isFinite(Date.parse(x)))return NaN;const day=new Date(x.slice(0,10)+'T00:00:00Z');return Number.isFinite(+day)&&day.toISOString().slice(0,10)===x.slice(0,10)?Date.parse(x):NaN;};
const need=(x,c)=>{if(!x)throw Error(c);};
const json=x=>JSON.stringify(x);
function regular(file,max){for(let p=path.resolve(file);;p=path.dirname(p)){need(!fs.lstatSync(p).isSymbolicLink(),'NATIVE_SYMLINK');if(path.dirname(p)===p)break;}const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const a=fs.fstatSync(fd);need(a.isFile()&&a.size<=max,'NATIVE_FILE_BUDGET');const b=fs.readFileSync(fd),s=fs.lstatSync(file);need(s.ino===a.ino&&s.dev===a.dev&&s.size===b.length,'NATIVE_READ_RACE');return b;}finally{fs.closeSync(fd);}}
function exclusive(file,bytes){const temp=file+'.pending-'+randomBytes(8).toString('hex');const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.linkSync(temp,file);fs.unlinkSync(temp);const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
function origin(url){try{const u=new URL(url);return u.origin==='https://www.sec.gov'&&u.pathname==='/cgi-bin/browse-edgar'&&u.searchParams.get('action')==='getcurrent'&&u.searchParams.get('output')==='atom'&&!u.username&&!u.password;}catch{return false;}}
function acceptance(entry,proofs,observedAt){
 const found=[];
 for(const p of proofs){
  try{const bytes=Buffer.from(p.bodyBase64,'base64');need(bytes.length<=2097152&&sha(bytes)===p.sha256,'PROOF_BYTES');need(p.url==='https://data.sec.gov/submissions/CIK'+String(entry.cik).padStart(10,'0')+'.json'&&p.httpStatus===200&&instant(p.receivedAt)<=instant(observedAt),'PROOF_ORIGIN_OR_CLOCK');const doc=captureJson(bytes.toString());need(Number(doc.cik)===entry.cik,'PROOF_CIK');const r=doc.filings?.recent;need(Array.isArray(r?.accessionNumber),'PROOF_SCHEMA');for(let i=0;i<r.accessionNumber.length;i++)if(r.accessionNumber[i]===entry.acc){const v=r.acceptanceDateTime?.[i];if(Number.isFinite(instant(v))&&instant(v)<=instant(observedAt))found.push({at:v,sha256:p.sha256,receivedAt:p.receivedAt,url:p.url});}
  }catch{/* Invalid proof remains preserved, never becomes acceptance. */}
 }
 const values=new Set(found.map(x=>instant(x.at)));return values.size===1?{status:'EXPLICIT_SEC_SUBMISSIONS_VALUE_UNAUDITED',...found[0]}:{status:values.size>1?'CONFLICTING_ACCEPTANCE_PROOFS':'UNAVAILABLE',at:null};
}
export function decodeNativeResponse(input){
 const body=Buffer.from(input.bodyBase64||'','base64');need(body.length<=NATIVE_SEC_CAPS.responseBytes&&sha(body)===input.bodySha256,'NATIVE_BODY_HASH_OR_BUDGET');
 need(origin(input.url)&&Number.isFinite(instant(input.observedAt))&&Number.isFinite(instant(input.requestStartedAt))&&instant(input.requestStartedAt)<=instant(input.observedAt),'NATIVE_ORIGIN_OR_CLOCK');
 if(input.httpStatus!==200)return {status:'SOURCE_FAILURE',entries:[],rejections:[{reason:'HTTP_OR_TRANSPORT_FAILURE'}]};
 need(Number.isFinite(instant(input.headersReceivedAt))&&Number.isFinite(instant(input.bodyReceivedAt))&&instant(input.requestStartedAt)<=instant(input.headersReceivedAt)&&instant(input.headersReceivedAt)<=instant(input.bodyReceivedAt)&&instant(input.bodyReceivedAt)<=instant(input.observedAt),'NATIVE_RECEIPT_CLOCKS');
 let xml;try{new TextDecoder('utf-8',{fatal:true}).decode(body);xml=body.toString('utf8');}catch{return {status:'MALFORMED_FEED',entries:[],rejections:[{reason:'INVALID_UTF8'}]};}
 const matches=[...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)],entries=[],rejections=[];
 if(matches.length>100)return {status:'MALFORMED_FEED',entries:[],rejections:[{reason:'ENTRY_COUNT_BUDGET'}]};
 if(!/<feed(?:\s[^>]*)?>/.test(xml)||!/<\/feed>\s*$/.test(xml)||(xml.match(/<entry\b/g)||[]).length!==matches.length)return {status:'MALFORMED_FEED',entries:[],rejections:[{reason:'UNSUPPORTED_OR_PARTIAL_XML'}]};
 for(const m of matches){const offset=Buffer.byteLength(xml.slice(0,m.index)),raw=body.subarray(offset,offset+Buffer.byteLength(m[0]));if(raw.length>NATIVE_SEC_CAPS.entryBytes){rejections.push({reason:'ENTRY_BUDGET',offset});continue;}
  const parsed=parseAtom(m[0]);if(parsed.length!==1||!/^\d{10}-\d{2}-\d{6}$/.test(parsed[0].acc)||!Number.isInteger(parsed[0].cik)||parsed[0].cik<=0||!parsed[0].form||!Number.isFinite(instant(parsed[0].at))){rejections.push({reason:'LEGACY_PARSER_REJECTED_OR_UNSUPPORTED_ENTRY',offset,rawSha256:sha(raw)});continue;}
  const e=parsed[0],key=e.acc+'|'+e.cik,proof=acceptance(e,input.acceptanceProofs||[],input.observedAt);
  entries.push({key,eventId:'SEC_ATOM_V1:'+sha(key),accession:e.acc,issuerCik:String(e.cik).padStart(10,'0'),form:e.form,role:e.role,items:e.items,reportedAtomUpdatedAt:e.at,atomTimestampBasis:'ATOM_UPDATED_NOT_VERIFIED_ACCEPTANCE',acceptance:proof,rawEntryBase64:raw.toString('base64'),rawEntrySha256:sha(raw),sourceRevisionId:sha(raw),nativeSourceId:(m[0].match(/<id>([^<]+)<\/id>/)||[])[1]||null,byteOffset:offset,originalSeenBeforeArchive:input.priorSeenKeys.includes(key),requestStartedAt:input.requestStartedAt,systemReceiptAt:input.headersReceivedAt,bodyIngestedAt:input.bodyReceivedAt,observedAt:input.observedAt});
 }
 return {status:rejections.length?'PARTIAL':'PARSED',entries,rejections};
}
export function openNativeRun({directory,runId,sourceSha,provenance}){
 need(/^[A-Za-z0-9_-]{1,80}$/.test(runId||'')&&/^[a-f0-9]{40}$/.test(sourceSha||'')&&['SYNTHETIC_FIXTURE','DECLARED_UNAUDITED_NATIVE'].includes(provenance),'NATIVE_RUN_IDENTITY');
 if(!fs.existsSync(directory)){for(let p=path.dirname(path.resolve(directory));;p=path.dirname(p)){if(fs.existsSync(p))need(!fs.lstatSync(p).isSymbolicLink(),'NATIVE_SYMLINK');if(path.dirname(p)===p)break;}fs.mkdirSync(directory,{recursive:true,mode:0o700});}
 const meta={kind:'NATIVE_SEC_RUN_V1',runId,sourceSha,provenance};const file=path.join(directory,'run.json');if(!fs.existsSync(file))exclusive(file,Buffer.from(json(meta)));else need(regular(file,4096).toString()===json(meta),'NATIVE_RUN_REUSE_MISMATCH');
 return {directory,runId,sourceSha,provenance};
}
export function readNativeRun({directory,expectedRunId,expectedSourceSha}){
 const meta=captureJson(regular(path.join(directory,'run.json'),4096).toString());need(meta.kind==='NATIVE_SEC_RUN_V1'&&meta.runId===expectedRunId&&meta.sourceSha===expectedSourceSha,'NATIVE_RUN_PIN');
 const names=fs.readdirSync(directory),files=names.filter(x=>/^response-\d{6}\.json$/.test(x)).sort(),issues=names.filter(x=>x!=='run.json'&&!/^response-\d{6}\.json$/.test(x)).map(x=>({reason:'UNCOMMITTED_OR_UNEXPECTED_FILE',name:x}));need(files.length<=256,'NATIVE_RESPONSE_BUDGET');let prev='0'.repeat(64),bytes=Buffer.byteLength(json(meta));const responses=[],groups=new Map();
 for(let i=0;i<files.length;i++){need(files[i]==='response-'+String(i).padStart(6,'0')+'.json','NATIVE_SEQUENCE_GAP');const b=regular(path.join(directory,files[i]),4*1024*1024);bytes+=b.length;need(bytes<=NATIVE_SEC_CAPS.totalStoredBytes,'NATIVE_TOTAL_BUDGET');const r=captureJson(b.toString());need(r.sequence===i&&r.previousHash===prev&&r.recordHash===sha(json(r.payload))&&r.chainHash===sha(prev+r.recordHash),'NATIVE_RECORD_CHAIN');const decoded=decodeNativeResponse(r.payload);prev=r.chainHash;responses.push({file:files[i],sha256:sha(b),...r,decoded});
  if(decoded.status!=='PARSED')issues.push({reason:decoded.status,sequence:i});for(const entry of decoded.entries){const a=groups.get(entry.key)||[];a.push({...entry,responseSequence:i,responseSha256:sha(b)});groups.set(entry.key,a);}
 }
 const observations=[...groups.values()].map(list=>{const first=list[0],versions=new Set(list.map(x=>x.rawEntrySha256));let state='COMPLETE_ORIGINAL_EVIDENCE';if(first.originalSeenBeforeArchive)state='ORIGINAL_FIRST_INGESTION_UNAVAILABLE';else if(versions.size>1)state=list.some((x,i)=>list.some((y,j)=>j<i&&x.observedAt===y.observedAt&&x.rawEntrySha256!==y.rawEntrySha256))?'CONFLICTING_SAME_OBSERVATION':'REVISION_REQUIRES_REVIEW';else if(list.some(x=>x.acceptance.status==='CONFLICTING_ACCEPTANCE_PROOFS')||new Set(list.filter(x=>x.acceptance.at!==null).map(x=>instant(x.acceptance.at))).size>1)state='CONFLICTING_ACCEPTANCE_PROOFS';else if(first.acceptance.at===null)state=list.some(x=>x.acceptance.at!==null)?'LATE_ACCEPTANCE_SUPPLEMENT_RESEARCH_ONLY':'ACCEPTANCE_UNAVAILABLE';return {...first,firstSystemReceiptAt:first.originalSeenBeforeArchive?null:first.systemReceiptAt,firstIngestedAt:first.originalSeenBeforeArchive?null:first.bodyIngestedAt,firstObservedAt:first.originalSeenBeforeArchive?null:first.observedAt,firstObservationScope:'AVAILABLE_PRODUCER_RUN_LINEAGE_NOT_GLOBAL_HISTORY',nativeEvidenceStatus:state,observations:list,duplicateCount:list.length-versions.size,revisionCount:versions.size,sourceAuditRequired:true,genuineProspectiveEvidence:false};});
 return {meta,status:issues.some(x=>x.reason==='UNCOMMITTED_OR_UNEXPECTED_FILE')?'INCOMPLETE':'INTEGRITY_CHECKED_UNAUDITED',sourceStatus:issues.length?'PARTIAL_OR_UNKNOWN':'OBSERVED',issues,responses,observations,bytes,lastHash:prev,genuineAdmissions:0};
}
export function appendNativeResponse(store,{body,url,httpStatus=200,requestStartedAt,headersReceivedAt,bodyReceivedAt,observedAt,legacySeen,acceptanceProofs=[]}){
 need(Buffer.isBuffer(body)&&body.length<=NATIVE_SEC_CAPS.responseBytes&&legacySeen instanceof Set&&acceptanceProofs.length<=100&&Buffer.byteLength(json(acceptanceProofs))<=1048576,'NATIVE_INPUT_SCOPE');
 const lock=path.join(store.directory,'.writer-lock');fs.mkdirSync(lock);try{
  // Ignore this live lock only while this writer owns it. Incomplete prior writes block continuation.
  const names=fs.readdirSync(store.directory);need(!names.some(x=>x.includes('.pending-')),'NATIVE_INTERRUPTED_WRITE');
  const archive=readNativeRun({directory:store.directory,expectedRunId:store.runId,expectedSourceSha:store.sourceSha});need(archive.issues.filter(x=>x.reason==='UNCOMMITTED_OR_UNEXPECTED_FILE').every(x=>x.name==='.writer-lock'),'NATIVE_PRIOR_ARCHIVE_INCOMPLETE');
  const nativeKeys=parseAtom(body.toString('utf8')).map(e=>e.acc+'|'+e.cik),payload={url,httpStatus,bodyCaptureStatus:httpStatus===200?'RESPONSE_BODY_AS_DELIVERED_BY_FETCH':'ERROR_BODY_COMPLETENESS_UNAVAILABLE',requestStartedAt,headersReceivedAt:headersReceivedAt??null,bodyReceivedAt:bodyReceivedAt??null,observedAt,bodyBase64:body.toString('base64'),bodySha256:sha(body),priorSeenKeys:[...new Set(nativeKeys.filter(k=>legacySeen.has(k)))],acceptanceProofs};decodeNativeResponse(payload);
  const sequence=archive.responses.length;need(sequence<256,'NATIVE_RESPONSE_BUDGET');const recordHash=sha(json(payload)),record={sequence,previousHash:archive.lastHash,recordHash,chainHash:sha(archive.lastHash+recordHash),payload},bytes=Buffer.from(json(record));need(bytes.length<=4*1024*1024&&archive.bytes+bytes.length<=67100672,'NATIVE_STORAGE_BUDGET');exclusive(path.join(store.directory,'response-'+String(sequence).padStart(6,'0')+'.json'),bytes);return {sequence,recordHash,bytes:bytes.length};
 }finally{fs.rmdirSync(lock);}
}
export function nativeEventsForCapture(archive,{identities,at}){
 need(archive.status==='INTEGRITY_CHECKED_UNAUDITED','NATIVE_ARTIFACT_INCOMPLETE');need(Array.isArray(identities),'NATIVE_IDENTITIES_REQUIRED');const events=[],unmapped=[];
 for(const row of archive.observations){if(instant(row.observedAt)>instant(at))continue;const candidates=identities.filter(m=>m.issuerCik===row.issuerCik&&instant(m.asOf)<=instant(row.observedAt)&&m.identityAudit==='DOCUMENTED_SOURCE_REVIEW');if(!candidates.length){unmapped.push({eventId:row.eventId,reason:'NO_CONTEMPORANEOUS_ISSUER_CLASS_MAPPING'});continue;}
  for(const m of candidates)events.push({eventId:row.eventId+':'+m.securityId,symbol:m.symbol,securityId:m.securityId,issuerCik:row.issuerCik,lane:'SEC_EVENT',sourceNamespace:'SEC',sourceId:row.accession,sourceRevisionId:row.sourceRevisionId,sourceAt:row.acceptance.at,firstSystemReceiptAt:row.firstSystemReceiptAt,firstIngestedAt:row.firstIngestedAt,observedAt:row.firstObservedAt,recordedObservedAt:row.observedAt,firstObservationScope:row.firstObservationScope,nativeEvidenceStatus:row.nativeEvidenceStatus,reportedAtomUpdatedAt:row.reportedAtomUpdatedAt,acceptanceEvidence:row.acceptance,rawEntryBase64:row.rawEntryBase64,rawEntrySha256:row.rawEntrySha256,nativeSourceId:row.nativeSourceId,producerRunId:archive.meta.runId,producerSourceSha:archive.meta.sourceSha,producerProvenance:archive.meta.provenance,genuineProspectiveEvidence:false});
 }
 need(events.length>0||archive.sourceStatus==='OBSERVED','NATIVE_SOURCE_UNAVAILABLE');
 return {events,unmapped,sourceStatus:archive.sourceStatus,sourceIssues:archive.issues,sourceAuditRequired:true,artifactStatus:archive.status,artifactResponses:archive.responses.map(r=>({file:r.file,sha256:r.sha256})),genuineAdmissions:0};
}
