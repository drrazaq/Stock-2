// Inactive retained-evidence adapter. No fetching, credentials, signatures or BUY route.
import {createHash,randomUUID} from 'node:crypto';
import {captureJson} from './capture-json.mjs';
import {readNativeRun,nativeRunDigest} from './native-sec-events.mjs';

export const sourceHash=b=>createHash('sha256').update(b).digest('hex');
const need=(ok,code)=>{if(!ok)throw Error(code);};
export function sourceInstant(value){
 const m=typeof value==='string'&&value.match(/^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d):(\d\d)(?:\.(\d{1,9}))?(Z|[+-]\d\d:\d\d)$/);
 if(!m||+m[2]>23||+m[3]>59||+m[4]>59)return null;
 const day=Date.parse(m[1]+'T00:00:00Z');
 if(!Number.isFinite(day)||new Date(day).toISOString().slice(0,10)!==m[1])return null;
 const z=m[6],h=z==='Z'?0:+z.slice(1,3),min=z==='Z'?0:+z.slice(4,6);
 if(h>23||min>59)return null;
 const offset=(z[0]==='-'?-1:1)*(h*60+min);
 return BigInt(day+(+m[2]*3600 + +m[3]*60 + +m[4])*1000-offset*60000)*1000000n+BigInt((m[5]||'').padEnd(9,'0'));
}
export function inspectSourceResponse(p){
 try{
  need(p&&typeof p.bodyBase64==='string','BODY_UNAVAILABLE');
  const bytes=Buffer.from(p.bodyBase64,'base64');
  need(bytes.length<=2097152&&bytes.toString('base64')===p.bodyBase64&&sourceHash(bytes)===p.bodySha256,'BODY_HASH_OR_BUDGET');
  const clocks=[p.requestStartedAt,p.headersReceivedAt,p.bodyReceivedAt,p.observedAt].map(sourceInstant);
  need(clocks.every(x=>x!==null)&&clocks.every((x,i)=>!i||x>=clocks[i-1]),'RESPONSE_CLOCKS_UNKNOWN');
  need(p.httpStatus===200,'SOURCE_FAILURE');
  need(p.url===p.responseUrl&&p.redirected===false,'RESPONSE_ORIGIN_UNVERIFIED');
  const u=new URL(p.url);need(u.protocol==='https:'&&!u.username&&!u.password&&!u.hash,'RESPONSE_ORIGIN_UNVERIFIED');
  return {status:'DIRECT_RESPONSE_METADATA_ONLY',bytes};
 }catch(e){return {status:'UNKNOWN',reason:/^[A-Z_]+$/.test(e.message)?e.message:'RESPONSE_INVALID'};}
}

// Records the clocks where an existing transport hands over bytes. It cannot certify TLS or source truth.
// The caller must not use this to relabel a retained response as a contemporaneous response.
export function createPrimaryResponsePort({store,token,runId,clock=Date.now,maxResponses=100,maxBytes=2097152}){
 need(/^[A-Za-z0-9_-]{1,80}$/.test(runId||'')&&Number.isInteger(maxResponses)&&maxResponses>0&&maxResponses<=100&&Number.isInteger(maxBytes)&&maxBytes>0&&maxBytes<=2097152,'PORT_BOUNDS');
 const active=new Map(),instance=randomUUID();let count=0;
 const now=()=>new Date(clock()).toISOString();
 return {
  begin(url){const requestStartedAt=now();need(count<maxResponses,'PORT_REQUEST_CAP');const u=new URL(url);need(u.origin==='https://www.sec.gov'&&!u.username&&!u.password&&!u.search&&!u.hash&&/^\/Archives\/edgar\/data\/\d+\/\d{18}\/[A-Za-z0-9_.-]+$/.test(u.pathname)&&!u.pathname.includes('..'),'PRIMARY_URL_UNSUPPORTED');const id=runId+':'+instance+':'+count++;active.set(id,{url,requestStartedAt});return id;},
  headers(id,{httpStatus,responseUrl,redirected}){const headersReceivedAt=now(),r=active.get(id);need(r&&!r.headersReceivedAt,'PORT_PHASE');Object.assign(r,{headersReceivedAt,httpStatus,responseUrl,redirected});},
  complete(id,body){const bodyReceivedAt=now(),r=active.get(id);need(r?.headersReceivedAt,'PORT_PHASE');need(Buffer.isBuffer(body)&&body.length<=maxBytes,'BODY_HASH_OR_BUDGET');const p={...r,bodyReceivedAt,observedAt:bodyReceivedAt,bodyBase64:body.toString('base64'),bodySha256:sourceHash(body)};
   // Exact retry of an uncertain local write is possible with the same id/body/clocks. Never consume first.
   const pending=r.pending??p;need(pending.bodySha256===p.bodySha256,'PORT_RETRY_BODY_CONFLICT');r.pending=pending;
   store.append(token,'ORIGINAL','PRIMARY_RESPONSE:'+id,pending,body);active.delete(id);
   // Unverifiable clocks must not discard the original body or become valid source evidence.
   need([pending.requestStartedAt,pending.headersReceivedAt,pending.bodyReceivedAt].map(sourceInstant).every((x,i,a)=>x!==null&&(!i||x>=a[i-1])),'RESPONSE_CLOCKS_UNKNOWN');return pending;
  },
  stats:()=>({started:count,incomplete:active.size})
 };
}

function keep(store,token,id,payload,body){
 const old=store.lookup(token,'ACQUISITION',id);
 if(old.status==='FOUND')return old.record.payload;
 try{store.append(token,'ACQUISITION',id,payload,body);return payload;}
 catch(e){if(e.message!=='LOGICAL_RECORD_CONFLICT')throw e;const prior=store.lookup(token,'ACQUISITION',id);need(prior.status==='FOUND','WRITE_OUTCOME_UNKNOWN');return prior.record.payload;}
}
function retain(store,token,label,p){
 const bytes=Buffer.from(p.bodyBase64||'','base64');need(bytes.length<=2097152,'BODY_HASH_OR_BUDGET');
 store.append(token,'ORIGINAL',label+':'+sourceHash(JSON.stringify(p)),p,bytes);
}
const documentName=x=>typeof x==='string'&&/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,199}$/.test(x)&&!x.includes('..');

// Uses the real native reader, including pinned parent bytes and original receipt clocks.
export function joinNativePrimary({native,primaryResponses=[],store,token}){
 need(store.head().pending===0,'PENDING_INTENT_REQUIRES_RECOVERY');
 let snapshot;try{snapshot=nativeRunDigest(native.directory);}catch{/* An incomplete archive cannot establish complete lineage. */}
 const archive=readNativeRun(native);
 if(archive.status==='INTEGRITY_CHECKED_UNAUDITED'){
  need(snapshot&&nativeRunDigest(native.directory).sha256===snapshot.sha256,'NATIVE_ARCHIVE_CHANGED');
 }
 need(primaryResponses.length<=100,'PRIMARY_RESPONSE_CAP');
 const submissions=archive.acceptanceResponses;
 const results=[];
 for(const event of archive.observations){
  const reasons=new Set(),original=event.observations[0];
  const eventId='SEC_FILING_V1:'+event.issuerCik+':'+event.accession;
  const candidates=[];
  for(const p of submissions){
   const envelope={...p,bodySha256:p.sha256,bodyReceivedAt:p.receivedAt},v=inspectSourceResponse(envelope);
   if(v.status==='UNKNOWN')continue;
   if(p.url!=='https://data.sec.gov/submissions/CIK'+event.issuerCik+'.json')continue;
   let d;try{d=captureJson(new TextDecoder('utf-8',{fatal:true}).decode(v.bytes));}catch{reasons.add('SUBMISSIONS_MALFORMED');continue;}
   const r=d.filings?.recent;
   if(Number(d.cik)!==Number(event.issuerCik)||!Array.isArray(r?.accessionNumber)){reasons.add('SUBMISSIONS_IDENTITY_UNKNOWN');continue;}
   // Reject a malformed matching row only; preserve valid neighboring rows.
   for(let i=0;i<r.accessionNumber.length;i++)if(r.accessionNumber[i]===event.accession){
    const at=r.acceptanceDateTime?.[i],doc=r.primaryDocument?.[i];
    if(sourceInstant(at)===null||sourceInstant(at)>sourceInstant(p.receivedAt)||r.form?.[i]!==event.form||!documentName(doc)){reasons.add('MATCHING_SUBMISSIONS_ROW_INVALID');continue;}
    candidates.push({acceptanceAt:at,primaryDocument:doc,receivedAt:p.receivedAt,sha256:p.sha256});
   }
  }
  const nativeIds=event.observations.map(x=>x.nativeSourceId);
  if(nativeIds.some(id=>id!=='urn:tag:sec.gov,2008:accession-number='+event.accession))reasons.add('NATIVE_IDENTIFIER_UNVERIFIED');
  if(event.observations.some(x=>x.transportEvidence.status!=='DIRECT_RESPONSE_URL_MATCH'))reasons.add('ATOM_ORIGIN_UNVERIFIED');
  if(archive.status!=='INTEGRITY_CHECKED_UNAUDITED'||archive.issues.length)reasons.add('NATIVE_ARCHIVE_INCOMPLETE');
  const timely=candidates.filter(p=>sourceInstant(p.receivedAt)<=sourceInstant(original.observedAt));
  if(!candidates.length)reasons.add('ACCEPTANCE_OR_DOCUMENT_UNAVAILABLE');
  else if(!timely.length)reasons.add('LATE_ACCEPTANCE_RESEARCH_ONLY');
  const proof=timely[0]||candidates[0]||null;
  const expectedUrls=[...new Set(candidates.map(p=>'https://www.sec.gov/Archives/edgar/data/'+Number(event.issuerCik)+'/'+event.accession.replaceAll('-','')+'/'+p.primaryDocument))];
  const matched=primaryResponses.filter(p=>expectedUrls.includes(p.url));
  if(!matched.length)reasons.add('PRIMARY_RESPONSE_MISSING');
  const valid=matched.filter(p=>{const v=inspectSourceResponse(p);if(v.status==='UNKNOWN')reasons.add(v.reason);return v.status!=='UNKNOWN'&&v.bytes.length>0;}).sort((a,b)=>sourceInstant(a.bodyReceivedAt)<sourceInstant(b.bodyReceivedAt)?-1:sourceInstant(a.bodyReceivedAt)>sourceInstant(b.bodyReceivedAt)?1:a.bodySha256.localeCompare(b.bodySha256));
  if(matched.some(p=>Buffer.from(p.bodyBase64,'base64').length===0))reasons.add('PRIMARY_BODY_EMPTY');
  const variants={atom:[...new Set(event.observations.map(p=>p.rawEntrySha256))],acceptance:[...new Set(candidates.map(p=>String(sourceInstant(p.acceptanceAt))+':'+p.primaryDocument))],primary:[...new Set(valid.map(p=>p.bodySha256))]};
  const originalEvidence={eventId,atomHash:original.rawEntrySha256,firstObservedAt:original.observedAt,firstSystemReceiptAt:original.systemReceiptAt,firstBodyIngestedAt:original.bodyIngestedAt,acceptanceAt:proof?.acceptanceAt??null,primaryHash:valid[0]?.bodySha256??null};
  const first=keep(store,token,'SEC_FIRST:'+eventId,originalEvidence);
  const firstPrimary=valid.length?keep(store,token,'SEC_PRIMARY_FIRST:'+eventId,{sha256:valid[0].bodySha256,receivedAt:valid[0].bodyReceivedAt}):null;
  const firstProof=proof?keep(store,token,'SEC_ACCEPTANCE_FIRST:'+eventId,proof):null;
  const changed=first.atomHash!==originalEvidence.atomHash||(firstProof&&candidates.some(p=>sourceInstant(firstProof.acceptanceAt)!==sourceInstant(p.acceptanceAt)||firstProof.primaryDocument!==p.primaryDocument))||(firstPrimary&&valid.some(p=>p.bodySha256!==firstPrimary.sha256));
  const conflict=Object.values(variants).some(v=>v.length>1)||changed;
  if(conflict)keep(store,token,'SEC_FIRST_CONFLICT:'+eventId,{eventId,first,observed:originalEvidence,variants});
  const oldConflict=store.lookup(token,'ACQUISITION','SEC_FIRST_CONFLICT:'+eventId);
  if(oldConflict.status==='FOUND')reasons.add('REVISION_CONFLICT_PERSISTENT');
  if(original.originalSeenBeforeArchive)reasons.add('ORIGINAL_INGESTION_UNAVAILABLE');
  const result={eventId,issuerCik:event.issuerCik,accession:event.accession,form:event.form,original:first,reportedAtomUpdatedAt:original.reportedAtomUpdatedAt,acceptanceAt:proof?.acceptanceAt??null,acceptanceKnownAt:proof?.receivedAt??null,primaryUrls:expectedUrls,primaryResponseHashes:valid.map(p=>p.bodySha256),primaryResponseClocks:valid.map(p=>({sha256:p.bodySha256,requestStartedAt:p.requestStartedAt,headersReceivedAt:p.headersReceivedAt,bodyReceivedAt:p.bodyReceivedAt,observedAt:p.observedAt})),firstConflict:oldConflict.status==='FOUND'?oldConflict.record.payload:null,joinStatus:reasons.size?'UNKNOWN':'MATCHED_RESEARCH_ONLY',reasons:[...reasons].sort(),sourceAuthentication:'UNVERIFIED',globalFirstIngestionEstablished:false,lineageScope:'AVAILABLE_PINNED_NATIVE_LINEAGE_ONLY',executionEligibility:'UNKNOWN',allowBuy:false};
  results.push(result);
 }
 // Monotonic first/conflict decisions precede body imports. A partial decision blocks completion
 // until explicit fenced recovery; a committed conflict survives any later import interruption.
 if(archive.status==='INTEGRITY_CHECKED_UNAUDITED')for(const f of snapshot.files){const bytes=Buffer.from(f.bodyBase64,'base64');store.append(token,'ORIGINAL','NATIVE_ARCHIVE_FILE:'+sourceHash(bytes),{name:f.name,sha256:sourceHash(bytes)},bytes);}
 for(const p of primaryResponses)retain(store,token,'SEC_PRIMARY',p);
 for(const p of submissions)retain(store,token,'SEC_SUBMISSIONS',{...p,bodySha256:p.sha256,bodyReceivedAt:p.receivedAt});
 for(const r of archive.responses)retain(store,token,'SEC_NATIVE',r.payload);
 const state=store.head();need(!state.transition,'GENERATION_TRANSITION_PENDING');
 if(state.unresolved>0)for(const result of results){result.joinStatus='UNKNOWN';result.reasons=[...new Set([...result.reasons,'STORE_EVIDENCE_UNRESOLVED'])].sort();}
 for(const result of results)keep(store,token,'SEC_JOIN:'+result.eventId+':'+sourceHash(JSON.stringify(result)),result);
 const end=store.head();need(end.pending===0,'PENDING_INTENT_REQUIRES_RECOVERY');need(!end.transition,'GENERATION_TRANSITION_PENDING');need(end.token===token,'STALE_FENCE');
 return {status:archive.status,results,genuineAdmissions:0,allowBuy:false};
}
