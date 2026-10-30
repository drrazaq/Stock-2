// Offline preparation only. No network, environment keys, orders or activation path.
import {createHash} from 'node:crypto';
import {marketSession} from './market-session.mjs';
import {evaluatePaperEvidence} from './discovery-paper.mjs';
import {sealResearch,openResearch} from './tools/seal-research-artifact.mjs';
export const CAPTURE_RULE='EXISTING_STREAM_SEC_30M_V1';
export const CAPTURE_LIMITS=Object.freeze({frames:41,symbols:6,eventsPerFrame:20,frameBytes:131072,totalBytes:8388608});
export const sha=x=>createHash('sha256').update(x).digest('hex');
const iso=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT.*Z$/.test(x)&&Number.isFinite(Date.parse(x));
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function assert(ok,reason){if(!ok)throw Error(reason);}
export function validatePlan(p){
 assert(p&&p.rule===CAPTURE_RULE&&['CALIBRATION','EVALUATION'].includes(p.cohort),'PLAN_RULE_OR_COHORT');
 assert(hash(p.enrollmentManifestSha256)&&/^[a-f0-9]{40}$/.test(p.sourceSha),'PLAN_PINS');
 assert(iso(p.start)&&iso(p.enrollmentEnd)&&iso(p.end)&&Date.parse(p.enrollmentEnd)-Date.parse(p.start)===4*60000&&Date.parse(p.end)-Date.parse(p.start)===40*60000,'PLAN_WINDOW');
 assert(Array.isArray(p.universe)&&p.universe.length===6&&new Set(p.universe).size===6&&p.universe.every(x=>/^[A-Z]{1,5}$/.test(x)),'PLAN_UNIVERSE');
 // Current proposal is deliberately one fixed short regular-session window, not a rolling session adapter.
 const ny=new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(p.start));
 assert(ny==='09:30'&&new Date(p.start).toISOString().slice(0,10)===p.day,'PLAN_SESSION');
 assert(!marketSession(p.day).closed,'PLAN_SESSION');
 return p;
}
// Actual Alpaca snapshot schema: quote clocks and sizes come from latestQuote,
// never latestTrade. Contiguous completed minute low/high * volume sums bound
// cumulative session dollars. A missing/revised minute invalidates those bounds.
export function frameFromSnapshots({sequence,requestedAt,receivedAt,rawResponse,events=[],metadata=[],universe,priorFrames=[],sourceHandoffAt=receivedAt}){
 assert(typeof rawResponse==='string'&&Buffer.byteLength(rawResponse)<=65536,'RAW_RESPONSE_BUDGET');
 assert(iso(receivedAt)&&iso(requestedAt),'SNAPSHOT_CLOCK');
 const body=JSON.parse(rawResponse);assert(body&&typeof body==='object'&&!Array.isArray(body)&&!body.error&&!body.message,'SNAPSHOT_ERROR_ENVELOPE');
 const ny=ms=>Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
 const dayAt=ms=>{const x=ny(ms);return x.year+'-'+x.month+'-'+x.day;};
 const minuteAt=ms=>{const x=ny(ms);return Number(x.hour)*60+Number(x.minute);};
 const quotes=[];for(const symbol of universe){
  const snap=body[symbol];if(!snap)continue;
  const q=snap.latestQuote||{},now=Date.parse(receivedAt),id=metadata.filter(m=>m.symbol===symbol&&iso(m.asOf)&&Date.parse(m.asOf)<=now).at(-1);
  const bars=new Map();let conflict=false;
  for(const f of [...priorFrames.map(x=>x.frame||x),{rawResponse}]){
   const bar=JSON.parse(f.rawResponse)[symbol]?.minuteBar;if(!bar||!iso(bar.t))continue;
   const at=Date.parse(bar.t);if(at+60000>now||dayAt(at)!==dayAt(now)||minuteAt(at)<570)continue;
   const signature=JSON.stringify([bar.l,bar.h,bar.v]);if(bars.has(at)&&bars.get(at).signature!==signature)conflict=true;else bars.set(at,{...bar,signature});
  }
  let lower=0,upper=0,latest=null,complete=!conflict&&minuteAt(now)>570;
  for(let minute=570;minute<minuteAt(now);minute++){
   const at=now-(minuteAt(now)-minute)*60000-new Date(now).getUTCSeconds()*1000-new Date(now).getUTCMilliseconds(),bar=bars.get(at);
   if(!bar||!Number.isFinite(bar.l)||bar.l<=0||!Number.isFinite(bar.h)||bar.h<bar.l||!Number.isSafeInteger(bar.v)||bar.v<0){complete=false;break;}
   lower+=bar.l*bar.v;upper+=bar.h*bar.v;latest=bar.t;
  }
  const liquid=complete&&Number.isFinite(lower)&&Number.isFinite(upper)&&lower>0;

  quotes.push({symbol,securityId:id?.securityId??null,at:receivedAt,quoteAsOf:iso(q.t)?q.t:null,bid:q.bp??null,ask:q.ap??null,bidSizeShares:Number.isInteger(q.bs)&&q.bs>=0?q.bs:null,askSizeShares:Number.isInteger(q.as)&&q.as>=0?q.as:null,dollarVolume:liquid?lower:null,dollarVolumeUpperBound:liquid?upper:null,dollarVolumeAsOf:liquid?latest:null,dollarVolumeBasis:'CONTIGUOUS_SESSION_MINUTE_LOW_HIGH_VOLUME_BOUNDS',provider:'ALPACA',feed:'sip'});
 }
 return {sequence,at:receivedAt,requestedAt,receivedAt,sourceHandoffAt,provider:'ALPACA',feed:'sip',rawResponse,rawResponseSha256:sha(rawResponse),events,metadata,quotes};
}
export function newCapture(p){validatePlan(p);return {version:1,plan:p,frames:[],bytes:0,chain:'0'.repeat(64)};}
export function appendCapture(s,frame){
 validatePlan(s.plan);const bytes=Buffer.from(JSON.stringify(frame));
 assert(s.frames.length<CAPTURE_LIMITS.frames&&bytes.length<=CAPTURE_LIMITS.frameBytes&&s.bytes+bytes.length<=CAPTURE_LIMITS.totalBytes,'CAPTURE_BUDGET_STOP');
 assert(frame&&Number.isInteger(frame.sequence)&&frame.sequence===s.frames.length&&iso(frame.at)&&iso(frame.requestedAt)&&iso(frame.receivedAt),'FRAME_CLOCK_OR_SEQUENCE');
 assert(Date.parse(frame.at)===Date.parse(frame.receivedAt)&&Date.parse(frame.requestedAt)<=Date.parse(frame.at)&&Date.parse(frame.at)-Date.parse(frame.requestedAt)<=10000,'FRAME_REQUEST_WINDOW');
 assert((frame.sourceHandoffAt===undefined||iso(frame.sourceHandoffAt)&&Date.parse(frame.sourceHandoffAt)<=Date.parse(frame.requestedAt)),'FRAME_SOURCE_HANDOFF_CLOCK');
 assert(Date.parse(frame.at)>=Date.parse(s.plan.start)&&Date.parse(frame.at)<=Date.parse(s.plan.end)&&(!s.frames.length||Date.parse(frame.at)>Date.parse(s.frames.at(-1).frame.at)),'FRAME_OUTSIDE_WINDOW_OR_REPLAY');
 assert(frame.provider==='ALPACA'&&frame.feed==='sip'&&hash(frame.rawResponseSha256)&&typeof frame.rawResponse==='string'&&Buffer.byteLength(frame.rawResponse)<=65536&&sha(frame.rawResponse)===frame.rawResponseSha256,'FRAME_FEED_PROVENANCE');
 assert(Array.isArray(frame.quotes)&&frame.quotes.length<=6&&Array.isArray(frame.events)&&frame.events.length<=20&&Array.isArray(frame.metadata)&&frame.metadata.length<=6,'FRAME_ARRAY_LIMIT');
 assert(frame.quotes.every(q=>s.plan.universe.includes(q.symbol)&&q.at===frame.at)&&new Set(frame.quotes.map(q=>q.symbol)).size===frame.quotes.length,'FRAME_QUOTE_SCOPE');
 assert(frame.metadata.every(m=>s.plan.universe.includes(m.symbol)&&iso(m.asOf)&&Date.parse(m.asOf)<=Date.parse(frame.at)),'FRAME_METADATA_CLOCK');
 const chain=sha(s.chain+bytes.toString());
 return {...s,frames:[...s.frames,{frame:JSON.parse(bytes),previous:s.chain,chain}],bytes:s.bytes+bytes.length,chain};
}
// Each bounded immutable encrypted checkpoint contains the complete state. No plaintext disk or logs required.
export function checkpointCapture(s,key){return sealResearch(Buffer.from(JSON.stringify(s)),key,{kind:'PAPER_CAPTURE_OFFLINE_V1',sourceSha:s.plan.sourceSha,cohort:s.plan.cohort,chain:s.chain});}
export function recoverCapture(envelope,key,expectedPlan){
 validatePlan(expectedPlan);assert(Buffer.byteLength(JSON.stringify(envelope))<=16*1024*1024,'SEALED_BUDGET');
 const raw=JSON.parse(openResearch(envelope,key));assert(JSON.stringify(raw.plan)===JSON.stringify(expectedPlan),'RECOVERY_PLAN_MISMATCH');
 let s=newCapture(expectedPlan);assert(Array.isArray(raw.frames)&&raw.frames.length<=41,'RECOVERY_FRAME_LIMIT');
 for(const x of raw.frames){assert(x.previous===s.chain,'RECOVERY_CHAIN');s=appendCapture(s,x.frame);assert(x.chain===s.chain,'RECOVERY_CHAIN');}
 assert(raw.version===1&&raw.bytes===s.bytes&&raw.chain===s.chain&&envelope.context.kind==='PAPER_CAPTURE_OFFLINE_V1'&&envelope.context.sourceSha===expectedPlan.sourceSha&&envelope.context.cohort===expectedPlan.cohort&&envelope.context.chain===s.chain,'RECOVERY_CONTEXT');return s;
}
export function finishCapture(s){
 const p=s.plan,attempts=[],events=[],quotes=[],metadata=[],seenEvents=new Map(),seenSecurity=new Set();
 const signatures=new Map(),conflicts=new Set();
 for(const {frame:f} of s.frames)for(const e of f.events){if(e&&typeof e==='object'&&typeof e.eventId==='string'){const sig=sha(JSON.stringify(e));if(signatures.has(e.eventId)&&signatures.get(e.eventId)!==sig)conflicts.add(e.eventId);else signatures.set(e.eventId,sig);}}
 for(const {frame:f} of s.frames){
  quotes.push(...f.quotes);metadata.push(...f.metadata);
  for(const e of f.events){
   const base={eventId:e?.eventId??null,symbol:e?.symbol??null,paperHandoffAt:f.sourceHandoffAt||f.at,originalObservedAt:e?.observedAt??null};let reason=null;
   if(!e||typeof e!=='object'||Array.isArray(e))reason='MALFORMED_DISCOVERY_EVENT';
   else if(conflicts.has(e.eventId))reason='CONFLICTING_EVENT_ID';
   else if(!p.universe.includes(e.symbol))reason='OUTSIDE_FIXED_UNIVERSE';
   else if(e.lane!=='SEC_EVENT'||e.sourceNamespace!=='SEC'||typeof e.sourceId!=='string'||!/^\d{10}-\d{2}-\d{6}$/.test(e.sourceId)||!hash(e.sourceRevisionId))reason='UNVERIFIED_SEC_SOURCE_REVISION';
   else if(!iso(e.sourceAt)||!iso(e.firstIngestedAt)||!iso(e.observedAt)||Date.parse(e.sourceAt)>Date.parse(e.firstIngestedAt)||Date.parse(e.firstIngestedAt)>Date.parse(e.observedAt)||Date.parse(e.observedAt)>Date.parse(f.sourceHandoffAt||f.at)||Date.parse(e.observedAt)<Date.parse(p.start))reason='NONCONTEMPORANEOUS_EVENT_CLOCKS';
   else if(Date.parse(e.observedAt)>Date.parse(p.enrollmentEnd))reason='ENROLLMENT_CLOSED_RETAINED_CONTEXT';
   else if(typeof e.eventId!=='string'||!e.eventId)reason='MISSING_ORIGINAL_EVENT_ID';
   else if(seenEvents.has(e.eventId))reason=seenEvents.get(e.eventId)===sha(JSON.stringify(e))?'REPEATED_EVENT_CONTEXT':'CONFLICTING_EVENT_ID';
   else if(s.frames.some(({frame:prior})=>Date.parse(prior.at)<Date.parse(f.at)&&Date.parse(prior.at)>Date.parse(e.observedAt)&&prior.quotes.some(q=>q.symbol===e.symbol)))reason='LATE_EVENT_HANDOFF_NO_RETROSPECTIVE_ENTRY';
   else {
    seenEvents.set(e.eventId,sha(JSON.stringify(e)));
    const m=metadata.filter(m=>m.symbol===e.symbol&&Date.parse(m.asOf)<=Date.parse(e.observedAt)).at(-1);
    if(!m||m.instrumentType!=='CS'||m.identityAudit!=='DOCUMENTED_SOURCE_REVIEW'||m.zad!=='PASS'||!m.securityId||!m.industry||!hash(m.referenceSha256))reason='IDENTITY_INDUSTRY_OR_ZAD_UNKNOWN';
    else if(seenSecurity.has(m.securityId))reason='ALREADY_ENROLLED_SECURITY_DAY';
    else {seenSecurity.add(m.securityId);events.push(e);}
   }
   attempts.push({...base,status:reason?'RETAINED_NOT_ENROLLED':'ENROLLED_REQUIRES_SOURCE_AUDIT',reason});
  }
 }
 // All records survive in original encrypted frames. Only contemporaneously eligible metadata enters matching.
 const eligible=metadata.filter(m=>m.instrumentType==='CS'&&m.identityAudit==='DOCUMENTED_SOURCE_REVIEW'&&m.zad==='PASS'&&m.securityId&&m.industry&&hash(m.referenceSha256));
 const evaluation=evaluatePaperEvidence(events,quotes,eligible,{cutoff:p.end,prospective:false});
 const liquidityMatching=evaluation.cases.map(c=>{
  if(!c.candidate?.entryAt||!c.control?.entryAt)return {eventId:c.eventId,status:'UNRESOLVED',reason:'NO_MATCHED_PATH'};
  const e=events.find(e=>e.eventId===c.eventId),cq=quotes.find(q=>q.symbol===c.candidate.symbol&&Date.parse(q.at)===Date.parse(c.candidate.entryAt)),mq=eligible.find(m=>m.symbol===e.symbol);
  const uncertain=[];
  for(const sym of new Set(eligible.filter(m=>m.industry===mq?.industry&&m.symbol!==e.symbol&&!events.some(x=>x.symbol===m.symbol&&Date.parse(x.observedAt)<=Date.parse(e.observedAt))).map(m=>m.symbol))){
   const q=quotes.find(q=>q.symbol===sym&&Date.parse(q.at)===Date.parse(cq?.at));if(!q)continue;
   if(q.ask<cq.ask/2||q.ask>cq.ask*2)continue;
   if(!Number.isFinite(q.dollarVolumeUpperBound)||!Number.isFinite(cq.dollarVolumeUpperBound)||!q.dollarVolume||!cq.dollarVolume){uncertain.push(sym);continue;}
   const minRatio=q.dollarVolume/cq.dollarVolumeUpperBound,maxRatio=q.dollarVolumeUpperBound/cq.dollarVolume;
   const excluded=q.dollarVolumeUpperBound<1e6||maxRatio<.2||minRatio>5;
   const included=q.dollarVolume>=1e6&&minRatio>=.2&&maxRatio<=5;
   if(!excluded&&!included)uncertain.push(sym);
  }
  return {eventId:c.eventId,status:uncertain.length?'UNRESOLVED':'BOUNDED_MATCH_ELIGIBILITY_VERIFIED',reason:uncertain.length?'CUMULATIVE_LIQUIDITY_POOL_AMBIGUOUS':null,uncertainSymbols:uncertain};
 });
 const gaps=[];for(let i=0;i<40;i++){const expected=Date.parse(p.start)+i*60000;if(!s.frames.some(x=>Date.parse(x.frame.at)>=expected&&Date.parse(x.frame.at)<expected+60000))gaps.push(i);}
 const missingSymbols=s.frames.flatMap(({frame:f})=>p.universe.filter(sym=>!f.quotes.some(q=>q.symbol===sym)).map(symbol=>({sequence:f.sequence,symbol})));
 const invalidOrStaleQuotes=s.frames.flatMap(({frame:f})=>f.quotes.filter(q=>!Number.isFinite(q.bid)||q.bid<=0||!Number.isFinite(q.ask)||q.ask<q.bid||!iso(q.quoteAsOf)||Date.parse(q.quoteAsOf)>Date.parse(f.at)||Date.parse(f.at)-Date.parse(q.quoteAsOf)>120000).map(q=>({sequence:f.sequence,symbol:q.symbol})));
 const finalWindowObserved=s.frames.some(x=>Date.parse(x.frame.at)>=Date.parse(p.end)-10000);
 const missingSize=evaluation.counts.resolved-evaluation.counts.resolvedWithVerifiedDisplayedSize;
 return {kind:'OFFLINE_PREPARATION_NOT_REAL_ADMISSIONS',cohort:p.cohort,chain:s.chain,attempts,evaluation,coverage:{missingMinuteSlots:gaps,missingSymbols,invalidOrStaleQuotes,finalWindowObserved,sampleScheduleComplete:finalWindowObserved&&gaps.length===0&&missingSymbols.length===0&&invalidOrStaleQuotes.length===0},liquidityMatching,displayedCapacityUnverified:missingSize,genuineAdmissions:0,requires:['OFFICIAL_ENTITLEMENTS','INDEPENDENT_SOURCE_AUDIT','DATED_OWNER_APPROVAL','LIVE_ADAPTER_REVIEW'],confirmationEligible:false};
}
