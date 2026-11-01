// Offline policy prototype for independent review. Never called by V1 or a workflow.
import {createHash} from 'node:crypto';
import {readNativeRun,nativeRunDigest} from './native-sec-events.mjs';import {readSelectionTelemetry,SEC_SELECTION_SCOPE} from './sec-selection-telemetry.mjs';
import {dEligible} from './rank-models.mjs';import {PAPER_PROTOCOL} from './discovery-paper.mjs';import {captureJson} from './capture-json.mjs';import {alpacaSnapshot} from './snapshot-fields.mjs';import {marketSession} from './market-session.mjs';
export const PROOF_READY_PROPOSAL='SEC_PROOF_READY_V2_REVIEW_ONLY';
const sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex'),need=(x,c)=>{if(!x)throw Error(c);};
const time=x=>{if(typeof x!=='string'||!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)$/.test(x))return NaN;const d=new Date(x.slice(0,10)+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===x.slice(0,10)?Date.parse(x):NaN;};
const ny=x=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(x)).map(p=>[p.type,p.value]));return {day:p.year+'-'+p.month+'-'+p.day,minute:+p.hour*60+ +p.minute};};
function previousSession(day){for(let i=0;i<10;i++){day=new Date(Date.parse(day+'T12:00:00Z')-86400000).toISOString().slice(0,10);const s=marketSession(day);if(!s.known)return null;if(!s.closed)return day;}return null;}
const nySeconds=x=>ny(x).minute*60+new Date(x).getUTCSeconds()+new Date(x).getUTCMilliseconds()/1000;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const reject=reason=>{throw Error(reason);};
const preparedSources=new WeakMap();
export function prepareProposedV2Source({archiveDirectory,telemetryDirectory,runId,sourceSha,history,now=()=>new Date().toISOString()}){
 const before=nativeRunDigest(archiveDirectory),source=readNativeRun({directory:archiveDirectory,expectedRunId:runId,expectedSourceSha:sourceSha}),telemetry=readSelectionTelemetry(telemetryDirectory,{runId,sourceSha});
 need(source.status==='INTEGRITY_CHECKED_UNAUDITED'&&source.sourceStatus==='OBSERVED'&&nativeRunDigest(archiveDirectory).sha256===before.sha256,'PROPOSAL_SOURCE_CHANGED_OR_INCOMPLETE');
 need(readSelectionTelemetry(telemetryDirectory,{runId,sourceSha}).lastHash===telemetry.lastHash,'PROPOSAL_TELEMETRY_CHANGED');need(Buffer.byteLength(JSON.stringify(before))+telemetry.bytes<=8*1024*1024,'PROPOSAL_SOURCE_CONTEXT_BUDGET');
 const observedAt=now(),at=time(observedAt);need(Number.isFinite(at)&&time(source.lastObservedAt)<=at&&(!telemetry.lastAt||time(telemetry.lastAt)<=at),'PROPOSAL_INCOMPLETE_OR_FUTURE_PREFIX');
 const handle=Object.freeze({kind:'PROPOSED_V2_READ_ONLY_SOURCE_HANDLE',runId,sourceSha,observedAt,nativePrefixSha256:before.sha256,telemetryLastHash:telemetry.lastHash});preparedSources.set(handle,{source,telemetry,history:structuredClone(history)});return handle;
}
export function proposeProofReadyFrame({sourceHandle,frame,state=null}){
 const prepared=preparedSources.get(sourceHandle);need(prepared,'PROPOSAL_SOURCE_HANDLE_REQUIRED');const {source,telemetry,history}=prepared,{runId,sourceSha}=sourceHandle;
 need(frame?.sourceHandoffAt===sourceHandle.observedAt,'PROPOSAL_HANDOFF_HANDLE_MISMATCH');
 const handoff=time(frame?.sourceHandoffAt),at=time(frame?.at);need(Number.isFinite(handoff)&&Number.isFinite(at)&&handoff<at&&at-handoff<=180000,'PROPOSAL_HANDOFF_CLOCK');
 const day=ny(handoff).day;need(marketSession(day).known&&!marketSession(day).closed&&ny(at).day===day,'PROPOSAL_SESSION');
 const prior=state?structuredClone(state):{protocol:PROOF_READY_PROPOSAL,runId,sourceSha,day,frames:0,used:[],pairs:[],lastAt:null};
 if(state){const {checksum,...body}=state;need(checksum===sha(body),'PROPOSAL_STATE_HASH');}
 delete prior.checksum;need(prior.protocol===PROOF_READY_PROPOSAL&&prior.runId===runId&&prior.sourceSha===sourceSha&&prior.day===day&&prior.frames===frame.sequence&&prior.frames<41&&(!prior.lastAt||time(prior.lastAt)<at),'PROPOSAL_STATE_OR_RESTART');
 need(frame.provider==='ALPACA'&&frame.feed==='sip'&&typeof frame.rawResponse==='string'&&sha(frame.rawResponse)===frame.rawResponseSha256&&Buffer.byteLength(frame.rawResponse)<=65536,'PROPOSAL_FRAME_SOURCE');

 const ledger=[],members=[],raw=captureJson(frame.rawResponse),used=new Set(prior.used);const historyKnown=history?.state==='VERIFIED_NO_EARLIER_SAME_DAY_RUN'&&history.scope==='MAIN_PRODUCER_SAME_DAY';
 // First calibration proposal deliberately excludes earlier-run and UNKNOWN histories; no continuity policy is adopted.
 for(const event of source.observations){const identity=frame.metadata?.find(m=>m.symbol&&SEC_SELECTION_SCOPE.includes(m.symbol)&&String(m.issuerCik).padStart(10,'0')===event.issuerCik);if(!identity){ledger.push({eventId:event.eventId,status:'UNRESOLVED',reason:'IDENTITY_UNMATCHED'});continue;}
 const row={eventId:event.eventId,symbol:identity.symbol,firstIngestedAt:event.firstIngestedAt,firstObservedAt:event.firstObservedAt,sourceReadyAt:frame.sourceHandoffAt,status:'EXCLUDED',reason:null};ledger.push(row);
 try{
  if(!historyKnown)reject('HISTORY_UNKNOWN_OR_EARLIER_POLICY_NOT_ADOPTED');
  if(event.originalSeenBeforeArchive||!Number.isFinite(time(event.firstIngestedAt))||!Number.isFinite(time(event.firstObservedAt)))reject('ORIGINAL_INGESTION_UNAVAILABLE');
  if(event.revisionCount!==1||event.nativeEvidenceStatus.includes('CONFLICT'))reject('REVISION_OR_CONFLICT');
  if(event.transportEvidence.status!=='DIRECT_RESPONSE_URL_MATCH')reject('SOURCE_ORIGIN_UNVERIFIED');
  const first=ny(time(event.firstObservedAt));if(first.day!==day||first.minute<570)reject('PREMARKET_SECONDARY_NOT_ENABLED');if(nySeconds(time(event.firstObservedAt))>574*60||nySeconds(handoff)>574*60||nySeconds(handoff)<570*60)reject('OUTSIDE_PRIMARY_READY_WINDOW');
  if(!identity.securityId||identity.commonStock!==true||identity.zad!=='PASS'||!/^\d{4}$/.test(identity.sic)||!Number.isFinite(time(identity.asOf))||time(identity.asOf)>time(event.firstObservedAt))reject('IDENTITY_INDUSTRY_OR_ZAD_UNESTABLISHED');
  if(frame.metadata.filter(m=>m.symbol===identity.symbol).length!==1||frame.metadata.filter(m=>m.securityId===identity.securityId).length!==1||frame.metadata.filter(m=>String(m.issuerCik).padStart(10,'0')===event.issuerCik).length!==1)reject('AMBIGUOUS_SECURITY_MAPPING');
  const decisions=telemetry.records.filter(r=>r.payload.type==='D_EVENT_DECISION'&&r.payload.event.symbol===identity.symbol&&r.payload.event.accession===event.accession&&time(r.at)<=handoff),record=decisions.at(-1),d=record?.payload,c=d?.cache;
  if(!d||!d.legacyDecision?.eligible||!dEligible({...d.predicates,sec:{known:true,tags:[]}}).eligible)reject(d?.reason||'NO_RECORDED_D_DECISION');
  if(c?.state!=='DOCUMENTED_RESPONSE'||c.route!=='D'||!c.accessionMatched||!c.directOrigin||!dEligible({...c.requestPredicates,sec:{known:true,tags:[]}}).eligible)reject('NO_DOCUMENTED_MATCHING_D_PROOF');
  const origin=source.observations.find(e=>e.issuerCik===event.issuerCik&&e.accession===c.requestPredicates.triggerAccession&&e.reportedAtomUpdatedAt===c.requestPredicates.triggerAtomUpdatedAt&&e.revisionCount===1&&Number.isFinite(time(e.firstObservedAt))&&time(e.firstObservedAt)<=time(c.requestedAt));if(!origin)reject('CACHE_TRIGGER_EVENT_UNRESOLVED');
  if(!Number.isFinite(time(c.requestedAt))||!Number.isFinite(time(c.responseRecordedAt))||time(c.requestedAt)>time(c.responseRecordedAt)||time(c.responseRecordedAt)>time(record.at)||ny(time(c.requestedAt)).day!==day)reject('CACHE_CLOCK_OR_VINTAGE_UNKNOWN');
  const proofs=source.acceptanceResponses.filter(p=>p.sha256===c.bodySha256&&p.transportEvidence.status==='DIRECT_RESPONSE_URL_MATCH'&&time(p.receivedAt)<=handoff);let acceptance=null;
  for(const p of proofs){const doc=captureJson(Buffer.from(p.bodyBase64,'base64').toString()),idx=doc.filings?.recent?.accessionNumber?.indexOf(event.accession);if(String(doc.cik).padStart(10,'0')!==event.issuerCik||!(idx>=0))continue;const value=doc.filings.recent.acceptanceDateTime[idx];if(value===c.reportedAcceptanceAt&&Number.isFinite(time(value)))acceptance=value;}
  if(!acceptance||time(acceptance)>time(event.firstObservedAt)||ny(time(acceptance)).day!==day||ny(time(acceptance)).minute<240||ny(time(acceptance)).minute>660)reject('ACCEPTANCE_PROOF_JOIN_UNRESOLVED');
  const q=frame.quotes?.find(q=>q.symbol===identity.symbol&&q.securityId===identity.securityId),snapshot=raw[identity.symbol],live=alpacaSnapshot(identity.symbol,snapshot,true),qt=time(q?.quoteAsOf),vt=time(q?.dollarVolumeAsOf);
  if(!q||q.provider!=='ALPACA'||q.feed!=='sip'||q.at!==frame.at||!positive(q.ask)||!positive(q.bid)||q.ask<q.bid||!Number.isFinite(qt)||qt<=handoff||qt>at||at-qt>120000||(q.ask-q.bid)/(q.ask/2+q.bid/2)>.02)reject('ENTRY_BBO_NOT_FRESH_AFTER_READY');
  if(q.bid!==live.bid||q.ask!==live.ask||qt!==time(snapshot?.latestQuote?.t)||q.askSizeShares!==(Number.isInteger(snapshot?.latestQuote?.as)&&snapshot.latestQuote.as>=0?snapshot.latestQuote.as:null)||q.bidSizeShares!==(Number.isInteger(snapshot?.latestQuote?.bs)&&snapshot.latestQuote.bs>=0?snapshot.latestQuote.bs:null))reject('QUOTE_RAW_JOIN_MISMATCH');
  if(!(live.t>0)||live.t>at||at-live.t>120000||!positive(live.prevC)||!Number.isSafeInteger(snapshot?.prevDailyBar?.v)||snapshot.prevDailyBar.v<=0||!Number.isFinite(time(snapshot?.prevDailyBar?.t))||ny(time(snapshot.prevDailyBar.t)).day!==previousSession(day))reject('TRADE_OR_PREVIOUS_SESSION_UNKNOWN');
  const current=dEligible({...d.predicates,decM:ny(at).minute,price:live.price,chg:live.price/live.prevC-1,prevDollarVol:live.prevC*snapshot.prevDailyBar.v,spread:(q.ask-q.bid)/(q.ask/2+q.bid/2),spreadFresh:true,halalFail:false,sec:{known:true,tags:[]}});if(!current.eligible)reject('CURRENT_PRE_ENTRY_D_CONDITIONS_FAIL');
  if(!positive(q.dollarVolume)||!positive(q.dollarVolumeUpperBound)||q.dollarVolumeUpperBound<q.dollarVolume||q.dollarVolumeBasis!=='CONTIGUOUS_SESSION_MINUTE_LOW_HIGH_VOLUME_BOUNDS'||!Number.isFinite(vt)||vt>at||at-vt>900000||ny(vt).day!==day||q.dollarVolume<1e6)reject('CUMULATIVE_LIQUIDITY_UNRESOLVED');
  const quantity=Math.floor((PAPER_PROTOCOL.notional-PAPER_PROTOCOL.feePerOrder)/q.ask);if(!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(q.askSizeShares)||q.askSizeShares<quantity)reject('ENTRY_CAPACITY_UNRESOLVED');
  if(at-handoff>180000||nySeconds(at)>577*60)reject('ENTRY_EXPIRED');if(used.has(identity.securityId))reject('SECURITY_DAY_ALREADY_ASSIGNED');
  Object.assign(row,{status:'PROPOSED_RISK_SET',acceptanceAt:acceptance,proofBodySha256:c.bodySha256,route:c.route,decisionRecordedAt:record.at,quantity,entryAsk:q.ask,entryAt:frame.at,executionAssumption:'OBSERVED_ASK_NOT_A_FILL',priceMoveBeforeDetectionBasis:'REQUIRES_CONTEMPORANEOUS_ACCEPTANCE_PRICE_NOT_AVAILABLE_FROM_THIS_JOIN'});members.push({event,row,identity,q});
 }catch(e){row.reason=e.message;}}
 const incompletePool=ledger.some(r=>r.reason==='CUMULATIVE_LIQUIDITY_UNRESOLVED');if(incompletePool)for(const m of members){m.row.status='UNRESOLVED';m.row.reason='LIQUIDITY_MATCH_POOL_INCOMPLETE';}
 members.sort((a,b)=>time(a.event.firstObservedAt)-time(b.event.firstObservedAt)||a.event.eventId.localeCompare(b.event.eventId));const firstSecurity=new Set(),riskSet=members.filter(m=>{if(firstSecurity.has(m.identity.securityId)){m.row.status='EXCLUDED';m.row.reason='LATER_ELIGIBLE_EVENT_SAME_SECURITY_DAY';return false;}firstSecurity.add(m.identity.securityId);return true;}),pairs=[];
 for(const a of riskSet){if(incompletePool)continue;if(used.has(a.identity.securityId))continue;let uncertain=false;const pool=riskSet.filter(b=>{if(b===a||used.has(b.identity.securityId)||b.identity.issuerCik===a.identity.issuerCik||b.identity.sic!==a.identity.sic||b.q.ask<a.q.ask/2||b.q.ask>a.q.ask*2)return false;const inside=b.q.dollarVolume>=a.q.dollarVolumeUpperBound/5&&b.q.dollarVolumeUpperBound<=a.q.dollarVolume*5,outside=b.q.dollarVolumeUpperBound<a.q.dollarVolume/5||b.q.dollarVolume>a.q.dollarVolumeUpperBound*5;if(!inside&&!outside)uncertain=true;return inside;});
  if(uncertain){a.row.status='UNRESOLVED';a.row.reason='LIQUIDITY_MATCH_POOL_UNCERTAIN';continue;}pool.sort((b,c)=>sha(day+'|'+a.event.eventId+'|'+b.identity.securityId).localeCompare(sha(day+'|'+a.event.eventId+'|'+c.identity.securityId)));const b=pool[0];if(!b){a.row.status='UNRESOLVED';a.row.reason='NO_SYMMETRIC_SEC_EVENT_CONTROL';continue;}
  for(const x of [a,b]){used.add(x.identity.securityId);x.row.status='PAIRED_PROPOSAL_ONLY';}
  const pair={candidate:a.row,control:b.row,eligibleControlPool:pool.map(x=>x.identity.securityId),poolHash:sha(pool.map(x=>x.identity.securityId)),entryAt:frame.at,exitDueAt:new Date(at+1800000).toISOString(),primaryAdmission:false};pairs.push(pair);
 }
 const next={...prior,frames:prior.frames+1,lastAt:frame.at,used:[...used],pairs:[...prior.pairs,...pairs]};return {protocol:PROOF_READY_PROPOSAL,policyApproved:false,primaryAdmission:false,genuineAdmissions:0,sourceAudit:'NOT_ESTABLISHED_BY_THIS_CODE',pairs,ledger,sourceBindings:{nativeLastHash:source.lastHash,telemetryLastHash:telemetry.lastHash,rawQuoteSha256:frame.rawResponseSha256},state:{...next,checksum:sha(next)},costs:PAPER_PROTOCOL,followups:'All41planned frames;firstfresh bid at/afterentry+30minutes within3minutes;both legs full exit bid size required;missing paths unresolved;outcome adapter not activated'};
}
