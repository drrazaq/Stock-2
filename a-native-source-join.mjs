// Inactive retained-evidence adapter. No fetching, credentials, signatures or BUY route.
import {createHash,randomUUID} from 'node:crypto';
import {captureJson} from './capture-json.mjs';
import {evidenceHash} from './reclaim-research-workflow.mjs';
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

// Raw aggregate concordance only: calendar/security continuity and correction/finality
// semantics still require independent evidence. No provider route or strategy is added.
const panelTime=v=>{const n=sourceInstant(v);need(n!==null&&n%1000000n===0n,'FIRST_ENTRY_BARS_UNKNOWN');return Number(n/1000000n);};
const panelIso=t=>new Date(t).toISOString();
export function deriveNativeAEntryPanels(input,entries){
 const sources=entries.filter(x=>{const u=new URL(x.envelope.url);return u.origin==='https://data.alpaca.markets'&&u.pathname.endsWith('/bars');});
 if(!sources.length)return {status:'UNKNOWN',reason:'NATIVE_BARS_AND_PRIOR_PANELS_MISSING',originTable:[]};
 const now=panelTime(input.asOf),start=panelTime(input.sessionOpen),end=panelTime(input.sessionClose),calendar=input.calendar?.sessions;
 need(Array.isArray(calendar)&&calendar.length<=300&&Array.isArray(input.bars)&&input.bars.length>=3&&input.bars.length<=390,'FIRST_ENTRY_PANEL_UNKNOWN');
 const sessions=calendar.map(s=>({...s,openMs:panelTime(s.open),closeMs:panelTime(s.close)}));
 need(sessions.every((s,i)=>s.openMs<s.closeMs&&(!i||s.openMs>sessions[i-1].closeMs)),'FIRST_ENTRY_PANEL_UNKNOWN');
 const index=sessions.findIndex(s=>s.openMs===start&&s.closeMs===end),prior=sessions.slice(index-20,index);
 need(index>=20&&prior.length===20&&new Set(prior.map(s=>s.date)).size===20,'FIRST_ENTRY_PANEL_UNKNOWN');
 const interval=panelTime(input.bars[0].end)-panelTime(input.bars[0].start);
 need(Number.isSafeInteger(interval)&&interval>=60000&&interval<=59*60000&&interval%60000===0,'FIRST_ENTRY_BARS_UNKNOWN');
 const timeframe=(interval/60000)+'Min',groups=new Map(),originTable=[];
 for(const source of sources){
  const e=source.envelope,u=new URL(e.url),checked=inspectSourceResponse(e);
  need(checked.status!=='UNKNOWN'&&u.pathname==='/v2/stocks/'+input.symbol+'/bars'&&u.searchParams.get('feed')==='sip'&&u.searchParams.get('adjustment')==='raw','FIRST_ENTRY_BARS_UNKNOWN');
  need([...u.searchParams.keys()].every(k=>['feed','adjustment','timeframe','start','end','limit','sort'].includes(k))&&[...u.searchParams.keys()].every(k=>u.searchParams.getAll(k).length===1)&&(!u.searchParams.has('sort')||u.searchParams.get('sort')==='asc'),'FIRST_ENTRY_BARS_UNKNOWN');
  const frame=u.searchParams.get('timeframe');need(frame===timeframe||frame==='1Day','FIRST_ENTRY_BARS_UNKNOWN');
  const a=panelTime(u.searchParams.get('start')),b=panelTime(u.searchParams.get('end')),received=panelTime(e.bodyReceivedAt);
  need(a<b&&b<=now&&received<=now&&sourceInstant(e.observedAt)<=BigInt(now)*1000000n,'FIRST_ENTRY_BARS_UNKNOWN');
  const body=captureJson(checked.bytes.toString());
  need(body.symbol===input.symbol&&Array.isArray(body.bars)&&body.bars.length>0&&body.bars.length<=10000&&body.next_page_token===null,'FIRST_ENTRY_BARS_UNKNOWN');
  const rows=[];let previous=-Infinity;
  for(const r of body.bars){
   const instant=sourceInstant(r.t);need(instant!==null&&instant%1000000n===0n,'FIRST_ENTRY_BARS_UNKNOWN');const at=Number(instant/1000000n);need(at>previous&&at>=a&&at<=b&&['o','h','l','c','vw'].every(k=>Number.isFinite(r[k])&&r[k]>0)&&Number.isSafeInteger(r.v)&&r.v>=0&&r.l<=Math.min(r.o,r.c,r.vw)&&r.h>=Math.max(r.o,r.c,r.vw)&&Number.isFinite(r.v*r.vw),'FIRST_ENTRY_BARS_UNKNOWN');
   previous=at;rows.push({raw:r,at});
  }
  const group={source,rows,start:a,end:b,received};if(!groups.has(frame))groups.set(frame,[]);groups.get(frame).push(group);
 }
 const minute=groups.get(timeframe)||[],daily=groups.get('1Day')||[],last=panelTime(input.bars.at(-1).end);
 const current=minute.filter(g=>g.start===start&&g.end===last-1),history=minute.filter(g=>g.start===prior[0].openMs&&g.end===start-1);
 need(current.length===1&&history.length===1&&minute.length===2&&daily.length===1&&sources.length===3,'FIRST_ENTRY_PANEL_UNKNOWN');
 const live=current[0],past=history[0],day=daily[0];
 need(live.received>=last&&live.rows.length===input.bars.length&&last<=end&&live.rows.every((r,i)=>r.at===start+i*interval&&r.at+interval<=last),'FIRST_ENTRY_BARS_UNKNOWN');
 need(past.received<start&&day.received<start&&prior.every(s=>s.openMs+live.rows.length*interval<=past.received)&&day.start===day.rows[0].at&&day.start<=prior[0].openMs&&day.end===prior.at(-1).closeMs,'FIRST_ENTRY_PANEL_UNKNOWN');
 // Compare the same offsets, never whole-day volume to an opening bar. No
 // interpolation, forward-fill, duplicate/revision selection or missing-day drop.
 const byTime=new Map(past.rows.map(r=>[r.at,r.raw]));
 const expected=new Set(prior.flatMap(s=>live.rows.map((_,i)=>s.openMs+i*interval)));
 need(past.rows.length>=expected.size&&[...expected].every(at=>byTime.has(at))&&prior.every(s=>s.openMs+live.rows.length*interval<=s.closeMs),'FIRST_ENTRY_PANEL_UNKNOWN');
 const sourceOf=(field,g,extra={})=>({field,itemId:g.source.itemId,envelopeHash:evidenceHash(g.source.envelope),bodySha256:g.source.envelope.bodySha256,receivedAt:g.source.envelope.bodyReceivedAt,...extra});
 const bars=live.rows.map(({raw:r,at},i)=>{
  const panel=prior.map(s=>byTime.get(s.openMs+i*interval)),volumes=panel.map(r=>r.v).sort((a,b)=>a-b),median=(volumes[9]+volumes[10])/2;
  need(median>0,'FIRST_ENTRY_PANEL_UNKNOWN');
  const evidenceId='A_NATIVE_BAR_'+evidenceHash({symbol:input.symbol,securityId:input.securityId,native:r,body:live.source.envelope.bodySha256}),priorVolumeEvidenceId='A_NATIVE_PRIOR_VOLUME_'+evidenceHash({symbol:input.symbol,securityId:input.securityId,offsetMs:i*interval,native:panel,body:past.source.envelope.bodySha256});
  originTable.push(sourceOf('bars['+i+']',live,{nativeTimestamp:r.t}),sourceOf('bars['+i+'].prior20SessionMedianVolume',past,{offsetMs:i*interval,sessionDates:prior.map(s=>s.date),calculation:'median of exactly 20 comparable raw bar volumes'}));
  return {symbol:input.symbol,securityId:input.securityId,start:panelIso(at),end:panelIso(at+interval),availableAt:panelIso(live.received),open:r.o,high:r.h,low:r.l,close:r.c,volume:r.v,dollarVolume:r.v*r.vw,prior20SessionMedianVolume:median,priorVolumeEvidenceId,evidenceId};
 });
 // Native daily timestamps are local midnight, not an invented close timestamp.
 const nyDate=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 need(day.rows.length===20&&day.rows.every((r,i)=>nyDate(r.at)===prior[i].date&&r.at<=prior[i].openMs&&prior[i].closeMs<=day.received),'FIRST_ENTRY_LIQUIDITY_UNKNOWN');
 const prior20DayDollarVolume=day.rows.reduce((sum,r)=>sum+r.raw.v*r.raw.vw,0)/20;
 need(Number.isFinite(prior20DayDollarVolume)&&prior20DayDollarVolume>0,'FIRST_ENTRY_LIQUIDITY_UNKNOWN');
 const liquidityAsOf=panelIso(day.received),liquidityEvidenceId='A_NATIVE_LIQUIDITY_'+evidenceHash({symbol:input.symbol,securityId:input.securityId,body:day.source.envelope.bodySha256,sessionDates:prior.map(s=>s.date)});
 originTable.push(sourceOf('prior20DayDollarVolume',day,{calculation:'mean of 20 raw daily volume * VWAP aggregates; not all-trades dollar turnover',sessionDates:prior.map(s=>s.date)}));
 return {status:'SOURCE_DERIVED_UNDER_SUPPLIED_CALENDAR',bars,prior20DayDollarVolume,liquidityAsOf,liquidityEvidenceId,originTable,unresolved:['SOURCE_AUTHENTICITY','HISTORICAL_SECURITY_CONTINUITY','CALENDAR_PROVENANCE','BAR_CORRECTION_AND_AVAILABILITY_SEMANTICS','AGGREGATE_VOLUME_COVERAGE']};
}
