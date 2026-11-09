// Observation-only ingress and prospective timing measurement. Never imports
// order, Telegram, strategy-promotion or recommendation code; never runs labs.
import {createHash} from 'node:crypto';
import {LANES,assembleMultiAngle} from './multi-angle-discovery.mjs';
import {isFreshPriceAge} from './ignition-gates.mjs';
import {marketSymbol} from './market-symbol.mjs';
import {SOURCE_STATUS,closeLagSessions,isDay,latestCompletedSession} from './source-contract.mjs';
const clock=x=>typeof x==='string'&&/T.*(Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
const symbol=x=>typeof x==='string'&&marketSymbol(x)===x;
// Provider statuses this package adds; absent ones are LEGACY_UNSTATED (labelled, never read as observed).
const ADDED_PRODUCERS=new Set(['ALPHA_VANTAGE','FMP','PRICE_CACHE','LAB_TODAY_FILES','SPY_BARS']);
const PRODUCER_STATUSES=new Set(['OBSERVED','UNKNOWN','NOT_FETCHED','PARTIAL_OR_UNKNOWN','CONFLICT',...SOURCE_STATUS]);
// Daily-close producers: a close older than the previous completed session is stale (sessions, not calendar hours).
const CLOSE_LAG_LIMIT=1;
const observationIdentity=(source,row,sym)=>[source.path,sym,row.sourceId||row.id||row.url||row.rule||'',row.p||row.d||row.filed||row.signalDay||'',row.h||row.f||row.chain||''];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
export const DISCOVERY_SOURCES=Object.freeze([
 {lane:'NEWS_CATALYST',path:'data/news-log.jsonl',hours:72},
 {lane:'SEC_EVENT',path:'data/events-recent.json',hours:240},
 {lane:'INSIDER_CLUSTER',path:'data/insider-study.json',hours:168},
 {lane:'EARNINGS_SURPRISE',path:'data/earnings-recent.json',hours:72},
 {lane:'INDUSTRY_RIPPLE',path:'data/chain-ripple.json',hours:72},
 {lane:'SUPPLY_SHIFT',path:'data/share-supply.json',hours:168},
 {lane:'TECHNICAL_BUILDUP',path:'data/discovery2-today.json',hours:72},
 {lane:'MARKET_DISLOCATION',path:'data/comeback-today.json',hours:72}
]);

// Research attention over EXISTING outputs. This is neither a strategy score nor
// trade admission. Source facts, not subsequent returns, determine the queue.
export const ASSESSMENT_TRIAGE_VERSION='EXISTING_HORIZON_ATTENTION_V1';
// Session identities, never Sunday/output-generation clocks. New event/report
// dates are relevant input versions; a refresh of an unchanged study is not.
export function assessmentCycleKey(input={}){
 const session=d=>d?.session||d?.to||null;
 return hash([ASSESSMENT_TRIAGE_VERSION,
  ['signals','discovery','quality','horizons','radar','leaders'].map(k=>[k,session(input[k])]),
  [...new Set((input.events?.events||[]).map(r=>r?.p).filter(clock))].sort(),
  [...new Set((input.earnings?.reports||[]).map(r=>r?.d).filter(isDay))].sort()]);
}
export function frozenAssessmentQueue(input={},journal=[]){
 const cycleKey=assessmentCycleKey(input),hits=journal.filter(r=>r.type==='assessment-cycle'&&r.cycleKey===cycleKey);
 if(hits.length>1)throw Error('CONFLICTING_ASSESSMENT_CYCLE_RECEIPTS');
 if(hits.length===1){
  const q=hits[0].queue;
  if(!q||q.cycleKey!==cycleKey||q.version!==ASSESSMENT_TRIAGE_VERSION||!q.batches||
   Object.values(q.batches).some(a=>!Array.isArray(a)||a.length>2||a.some(r=>r.id!==hash([ASSESSMENT_TRIAGE_VERSION,r.horizon,r.symbol,r.evidenceVersion]))))
   throw Error('INVALID_ASSESSMENT_CYCLE_RECEIPT');
  return {...q,frozen:true,sourceFreshness:assessmentSourceStatus(input.signals,input.cutoff)};
 }
 // Display size never changes selection. Existing recorded versions can defer
 // earlier investigations only when a NEW producer cycle is first selected.
 return {...triageAssessments({...input,perHorizon:2}),cycleKey,frozen:false};
}
export function assessmentCycleRows(queue){
 if(!/^[a-f0-9]{64}$/.test(queue.cycleKey||''))throw Error('MISSING_ASSESSMENT_CYCLE_KEY');
 const {decisions,invalid,...snapshot}=queue;
 return [{type:'assessment-cycle',version:1,cycleKey:queue.cycleKey,recordedAt:queue.cutoff,queue:snapshot},...assessmentJournalRows(queue)];
}
export function assessmentSourceStatus(signals,cutoff){
 if(!clock(cutoff))throw Error('INVALID_ASSESSMENT_CUTOFF');
 const now=Date.parse(cutoff),session=signals?.session||null,lag=closeLagSessions(session,now);
 return {session,expectedCompletedSession:latestCompletedSession(now),completedSessionLag:lag,
  status:clock(signals?.generatedAt)&&Date.parse(signals.generatedAt)>now?'UNKNOWN_FUTURE_OUTPUT_CLOCK':lag===null?'UNKNOWN':lag<0?'FUTURE_SOURCE':lag===0?'LATEST_COMPLETED_CLOSE_REFERENCE':'STALE_COMPLETED_CLOSE_REFERENCE',
  generatedAt:signals?.generatedAt||null,generatedClock:!clock(signals?.generatedAt)?'UNKNOWN':Date.parse(signals.generatedAt)>now?'FUTURE':'DATED_OUTPUT_NOT_QUOTE_RECEIPT',
  executableQuote:'UNKNOWN',intradayInvocation:'NOT_ESTABLISHED_BY_DAILY_OUTPUT'};
}
export function triageAssessments({signals={},discovery={},earnings={},events={},quality={},horizons={},radar={},leaders={},cutoff,reviewedSymbols=[],seenAssessmentIds=[],excludedSymbols=[],perHorizon=2}={}){
 if(!clock(cutoff)||![1,2,3].includes(perHorizon))throw Error('INVALID_ASSESSMENT_TRIAGE_SCOPE');
 const now=Date.parse(cutoff),array=x=>Array.isArray(x)?x:[],all=[],pools={SHORT:[],MID:[],LONG:[]};
 const dates=d=>({generatedAt:d?.generatedAt||null,session:d?.session||d?.to||null});
 const add=(source,rows,meta,project)=>{if(rows.length>20000)throw Error('ASSESSMENT_INPUT_ROW_CAP');for(const r of rows){const s=typeof r==='string'?r:r?.sym||r?.symbol;all.push({symbol:s,source,meta,facts:project&&r&&typeof r==='object'?project(r):{}});}};
 add('signals',array(signals.stocks),dates(signals),r=>({state:r.state,rule:r.rule,key:r.key,proven:r.proven,last:r.last,trigger:r.trigger,buyLo:r.buyLo,buyHi:r.buyHi,stop:r.stop,target:r.target,maxHold:r.maxHold,exitBelow:r.exitBelow,hardBlock:r.hardBlock}));
 add('discovery',array(discovery.candidates),dates(discovery),r=>({name:r.name,price:r.price,quarter:r.quarter,revGrowth:r.revGrowth,profitTrend:r.profitTrend,hardBlock:r.hardBlock}));
 add('earnings',array(earnings.reports),dates(earnings),r=>({day:r.d,actual:r.a,estimate:r.e,timing:r.t}));
 add('SEC',array(events.events),dates(events),r=>({publication:r.p,form:r.f,sourceId:r.sourceId||null}));
 add('quality',array(quality.today),dates(quality),r=>({rank:r.q,growth:r.growth,dilution:r.dilute}));
 add('quality-rank',Object.keys(quality.rank||{}),dates(quality));
 add('radar',array(radar.syms),dates(radar));add('leaders',array(leaders.syms),dates(leaders));
 for(const [setup,syms]of Object.entries(horizons.today||{}))add('horizons',array(syms),dates(horizons),()=>({setup}));
 const by=new Map(),invalid=[];for(const r of all){if(!symbol(r.symbol)){invalid.push({source:r.source,reason:'INVALID_SYMBOL'});continue;}if(!by.has(r.symbol))by.set(r.symbol,[]);by.get(r.symbol).push(r);}
 const excluded=new Set(excludedSymbols),reviewed=new Set(reviewedSymbols),seen=new Set(seenAssessmentIds);
 const eligibleSource=r=>!r.meta.generatedAt||clock(r.meta.generatedAt)&&Date.parse(r.meta.generatedAt)<=now;
 const offer=(h,r,priority,time=0)=>{if(!eligibleSource(r))return;pools[h].push({symbol:r.symbol,priority,time,source:r.source});};
 for(const r of all){if(!symbol(r.symbol))continue;
  if(r.source==='signals'&&r.facts.state==='Buy watch')offer('SHORT',r,0);
  if(r.source==='SEC'&&clock(r.facts.publication)){const t=Date.parse(r.facts.publication);if(t<=now&&now-t<=240*3600000)offer('SHORT',r,1,t);}
  if(r.source==='earnings'&&isDay(r.facts.day)){const t=Date.parse(r.facts.day+'T00:00:00Z');if(t<=now&&now-t<=(72+24)*3600000)offer('MID',r,0,t);}
  if(r.source==='horizons')offer('MID',r,1);
  if(r.source==='quality')offer('LONG',r,0,Number.isFinite(r.facts.rank)?r.facts.rank:0);
  if(r.source==='discovery')offer('LONG',r,1);
 }
 const decisions=[],batches={};for(const [h,pool]of Object.entries(pools)){
  pool.sort((a,b)=>a.priority-b.priority||b.time-a.time||a.symbol.localeCompare(b.symbol));const used=new Set();batches[h]=[];
  for(const r of pool){if(used.has(r.symbol))continue;used.add(r.symbol);const facts=by.get(r.symbol),evidenceVersion=hash(facts.map(({symbol,source,meta,facts})=>({symbol,source,session:meta.session,facts}))),id=hash([ASSESSMENT_TRIAGE_VERSION,h,r.symbol,evidenceVersion]);
   const reason=excluded.has(r.symbol)?'EXISTING_EXCLUSION':reviewed.has(r.symbol)?'ALREADY_INVESTIGATED_THIS_BATCH':seen.has(id)?'ASSESSMENT_VERSION_ALREADY_RECORDED':batches[h].length>=perHorizon?'DEFERRED_BATCH_CAP':'SELECTED';
   const row={...r,horizon:h,id,evidenceVersion,decision:reason,identity:'UNKNOWN_NOT_A_VERIFIED_ISSUER_COUNT',facts};decisions.push(row);if(reason==='SELECTED')batches[h].push(row);
  }
 }
 return {version:ASSESSMENT_TRIAGE_VERSION,cutoff,policy:'Existing trigger first / dated SEC; recent earnings then existing horizon setups; existing quality percentile then business shortlist. Newest source date, lexical ties. Research attention only; no return fields used.',sourceFreshness:assessmentSourceStatus(signals,cutoff),
  population:{rawRows:all.length,uniqueSymbolLabels:by.size,invalidRows:invalid.length,verifiedEligibleIssuers:0,verifiedEligibleInstruments:0,identityUnknownSymbols:by.size,issuerInstrumentDedup:'UNRESOLVED_NO_AUTHENTICATED_REFERENCE_JOIN',producerSweptCount:discovery.swept??null,producerStrongCount:discovery.strong??null,
   sources:Object.fromEntries([...new Set(all.map(x=>x.source))].map(s=>{const a=all.filter(x=>x.source===s);return[s,{rows:a.length,uniqueSymbolLabels:new Set(a.filter(x=>symbol(x.symbol)).map(x=>x.symbol)).size,asOf:a[0]?.meta||null}]}))},
  batches,decisions,counts:Object.fromEntries(['SELECTED','EXISTING_EXCLUSION','ALREADY_INVESTIGATED_THIS_BATCH','ASSESSMENT_VERSION_ALREADY_RECORDED','DEFERRED_BATCH_CAP'].map(k=>[k,decisions.filter(x=>x.decision===k).length])),invalid};
}
export function assessmentJournalRows(queue){
 return Object.values(queue.batches).flat().map(r=>({type:'assessment',version:1,cycleKey:queue.cycleKey||null,id:r.id,symbol:r.symbol,horizon:r.horizon,recordedAt:queue.cutoff,evidenceVersion:r.evidenceVersion,triageVersion:queue.version,
  decision:'INVESTIGATE_OR_WAIT_NOT_ENTRY',sourceReferences:r.facts.map(x=>({source:x.source,...x.meta})),
  ruleId:r.facts.find(x=>x.source==='signals')?.facts.key||(r.facts.find(x=>x.source==='signals')?.facts.rule?'DERIVED_RULE_SPEC_SHA256:'+hash(r.facts.find(x=>x.source==='signals').facts.rule):null),
  ruleIdentityBasis:r.facts.find(x=>x.source==='signals')?.facts.key?'RETAINED_RULE_KEY':r.facts.find(x=>x.source==='signals')?.facts.rule?'DERIVED_FROM_RETAINED_RULE_TEXT_NOT_ADOPTION':'NO_RULE_SUPPLIED',
  sourceSession:queue.sourceFreshness.session,
  quote:'UNKNOWN',execution:'NOT_OBSERVED',outcome:'UNRESOLVED',control:'UNLINKED',costConvention:{budget:1000,feeEachExecutedSide:3,wholeShares:true},
  caveat:'Assessment recording time is not original detection/receipt, a trade, or an outcome. No owner holdings/ZAD records stored.'}));
}
// Only exact, already computed outcome witnesses may join. Never use a later
// price or aggregate performance to fill an individual missing chain.
export function linkAssessmentOutcomes(assessments,outcomes=[]){
 return assessments.map(a=>{const hits=outcomes.filter(o=>o.assessmentId===a.id&&o.evidenceVersion===a.evidenceVersion&&o.ruleId===a.ruleId&&o.horizon===a.horizon);
  const o=hits.length===1?hits[0]:null;return {assessmentId:a.id,symbol:a.symbol,horizon:a.horizon,status:!o?'UNRESOLVED_NO_UNIQUE_VERSIONED_OUTCOME':o.status,
   economicBasis:o?.economicBasis||'UNKNOWN',fixedControl:o?.controlVersion||'UNKNOWN',netAfterCosts:a.ruleId&&o?.completeChain===true&&o?.controlVersion&&o?.economicBasis==='AUTHENTIC_EXECUTION'&&o?.reviewStatus==='INDEPENDENT_COMPLETE_CHAIN_REVIEWED'&&/^[a-f0-9]{64}$/.test(o?.witnessId||'')?o.netAfterCosts??null:null,
   sourceWitness:o?.witnessId||null};});
}
function rowsOf(lane,doc) {
 const fields={SEC_EVENT:'events',INSIDER_CLUSTER:'recent',EARNINGS_SURPRISE:'reports',INDUSTRY_RIPPLE:'todayMovers',SUPPLY_SHIFT:'now',TECHNICAL_BUILDUP:'buys'};
 if(fields[lane]&&!Array.isArray(doc[fields[lane]]))throw Error('missing or invalid rows');
 switch(lane) {
  case 'SEC_EVENT':return doc.events||[];
  case 'INSIDER_CLUSTER':return (doc.recent||[]).filter(r=>object(r)&&Number.isInteger(r.n)&&r.n>=2);
  case 'EARNINGS_SURPRISE':return (doc.reports||[]).filter(r=>object(r)&&Number.isFinite(r.a)&&Number.isFinite(r.e)&&r.a!==r.e);
  case 'INDUSTRY_RIPPLE':return doc.todayMovers||[];
  case 'SUPPLY_SHIFT':return doc.now||[];
  case 'TECHNICAL_BUILDUP':return doc.buys||[];
  case 'MARKET_DISLOCATION':if(!object(doc.methods))throw Error('invalid methods');return Object.entries(doc.methods||{}).flatMap(([rule,m])=>!object(m)?[null]:m.newSignals===undefined?[]:Array.isArray(m.newSignals)?m.newSignals.map(r=>object(r)?{...r,rule}:null):[null]);
  default:return [];
 }
}
export function collectDiscovery({readText,cutoff,live=[]}) {
 if(!clock(cutoff))throw new TypeError('discovery cutoff needs timezone');
 const at=Date.parse(cutoff),observations=[...live],sources=[{lane:'PRE_IGNITION',status:'LIVE_RUNTIME',rows:live.filter(x=>x.lane==='PRE_IGNITION').length}];
 for(const source of DISCOVERY_SOURCES){
  let text;try{text=readText(source.path);}catch{sources.push({...source,status:'MISSING',rows:0});continue;}
  try{
   if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>8*1024*1024){sources.push({...source,status:'INPUT_BUDGET_OR_TYPE_BLOCKED',rows:0});continue;}
   let rows,generated,preRejected=0,malformedLines=0,inputRows=null,inputTruncated=0,parsedObjects=0,producerStatus=null,revokedReportedIds=[];const revokedSourceIds=[];const rejectionReasons={};
   const reject=reason=>{preRejected++;rejectionReasons[reason]=(rejectionReasons[reason]||0)+1;};
   if(source.lane==='NEWS_CATALYST'){
    const lines=text.split(/\r?\n/).filter(x=>x.trim());inputRows=lines.length;inputTruncated=Math.max(0,lines.length-10000);rows=[];
    const quarantinedIds=new Set();for(const line of lines.slice(-10000)){try{const r=JSON.parse(line);if(r?.recordType==='SOURCE_REVISION_QUARANTINE'&&['string','number'].includes(typeof r.reportedId))quarantinedIds.add(String(r.reportedId));}catch{}}
    for(const line of lines.slice(-10000)){
     let row;try{row=JSON.parse(line);}catch{malformedLines++;reject('MALFORMED_JSON_LINE');continue;}
     if(!object(row)){reject('NON_OBJECT_ROW');continue;}parsedObjects++;
     if(row.sourceId!=null&&quarantinedIds.has(String(row.sourceId))){revokedSourceIds.push(hash(observationIdentity(source,row,row.sym)));reject('SOURCE_REVISION_CONFLICT');continue;}
     if(typeof row.h!=='string'||!row.h.trim()||!symbol(row.sym)){reject('NOT_A_VALID_HEADLINE_RECORD');continue;}
     if(typeof row.t!=='number'||!Number.isFinite(row.t)||row.t<=0||row.t>8640000000000000){reject('INVALID_PUBLICATION_CLOCK');continue;}
     if(row.t>at||at-row.t>source.hours*3600000){reject(row.t>at?'FUTURE_PUBLICATION':'STALE_PUBLICATION');continue;}
     if(row.at!==undefined&&(!clock(row.at)||Date.parse(row.at)>at||Date.parse(row.at)<row.t)){reject('INVALID_OR_FUTURE_INGESTION_CLOCK');continue;}
     rows.push(row);
    }
    if(!parsedObjects&&preRejected){sources.push({...source,status:'MALFORMED',rows:0,inputRows,rejected:preRejected,malformedLines,truncated:inputTruncated,rejectionReasons});continue;}
    rows.sort((a,b)=>b.t-a.t);
   }else{const doc=JSON.parse(text);if(!object(doc))throw Error('invalid source object');if(doc.error||doc.errors||doc.ok===false)throw Error('source error envelope');generated=doc.generatedAt!==undefined?doc.generatedAt:doc.updated;rows=rowsOf(source.lane,doc);if(Array.isArray(doc.quarantinedSourceIds))revokedReportedIds=doc.quarantinedSourceIds.filter(x=>typeof x==='string').slice(0,1000);if(['SEC_EVENT','EARNINGS_SURPRISE','INSIDER_CLUSTER','INDUSTRY_RIPPLE','SUPPLY_SHIFT','TECHNICAL_BUILDUP','MARKET_DISLOCATION'].includes(source.lane)){producerStatus={};for(const name of source.lane==='SEC_EVENT'?['SEC','OPENFDA']:source.lane==='INSIDER_CLUSTER'?['SEC_FORM4']:source.lane==='INDUSTRY_RIPPLE'?['CHAIN_ANALYSIS']:source.lane==='SUPPLY_SHIFT'?['SEC_INDEX','SEC_TICKERS']:source.lane==='TECHNICAL_BUILDUP'?['SEC_INDEX','PRICE_CACHE']:source.lane==='MARKET_DISLOCATION'?['LAB_TODAY_FILES','SPY_BARS']:['FINNHUB_CALENDAR','ALPHA_VANTAGE','FMP']){const v=doc.sourceStatus?.[name];producerStatus[name]={status:object(v)&&PRODUCER_STATUSES.has(v.status)?v.status:v===undefined&&ADDED_PRODUCERS.has(name)?'LEGACY_UNSTATED':'UNKNOWN'};}}if((source.lane==='INSIDER_CLUSTER'&&doc.sourceStatus?.SEC_FORM4?.status==='UNKNOWN')||(source.lane==='INDUSTRY_RIPPLE'&&doc.sourceStatus?.CHAIN_ANALYSIS?.status==='UNKNOWN')||(source.lane==='SUPPLY_SHIFT'&&['SEC_INDEX','SEC_TICKERS'].some(k=>doc.sourceStatus?.[k]?.status==='UNKNOWN'))||(source.lane==='TECHNICAL_BUILDUP'&&doc.sourceStatus?.SEC_INDEX?.status==='UNKNOWN')
    ||(source.lane==='TECHNICAL_BUILDUP'&&doc.sourceStatus?.PRICE_CACHE!==undefined&&producerStatus.PRICE_CACHE.status!=='OBSERVED')
    ||(source.lane==='MARKET_DISLOCATION'&&doc.sourceStatus?.LAB_TODAY_FILES!==undefined&&!['OBSERVED','EMPTY'].includes(producerStatus.LAB_TODAY_FILES.status))
    ||(source.lane==='EARNINGS_SURPRISE'&&doc.sourceStatus?.FINNHUB_CALENDAR?.status==='UNKNOWN')){preRejected+=rows.length;rows=[];}}
   if(!Array.isArray(rows))throw Error('invalid rows');
   if(source.lane!=='NEWS_CATALYST'&&!clock(generated)){sources.push({...source,status:'MISSING_OUTPUT_TIMESTAMP',rows:rows.length});continue;}
   if(generated&&(Date.parse(generated)>at||at-Date.parse(generated)>source.hours*3600000)){sources.push({...source,status:Date.parse(generated)>at?'FUTURE':'STALE',rows:rows.length});continue;}
   let accepted=0,rejected=preRejected,rowErrors=0;
   for(const row of rows.slice(0,500)){
    try{
    if(!object(row)){rejected++;continue;}
    if(row.revisionStatus==='CONFLICT'){rejected++;continue;}
    const sym=row.sym||row.symbol;if(!symbol(sym)){rejected++;continue;}
    // A finite number can still exceed JavaScript's representable date range.
    // Reject that row without making every valid headline in the file unavailable.
    const newsTime=source.lane==='NEWS_CATALYST'&&typeof row.t==='number'&&Number.isFinite(row.t)&&Math.abs(row.t)<=8640000000000000?row.t:null;
    const rawPublic=newsTime!==null?new Date(newsTime).toISOString():source.lane==='SEC_EVENT'?(row.publicationAt??row.p):null;
    // Generated output time is conservative availability of DERIVED analysis;
    // it is never passed off as the original earnings/insider publication time.
    if(source.lane==='SEC_EVENT'&&rawPublic!==undefined&&!clock(rawPublic)){rejected++;continue;}
    if(row.sourceDataDay!==undefined){const d=row.sourceDataDay,ms=typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)?Date.parse(d+'T00:00:00Z'):NaN;if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,10)!==d||ms>at||at-ms>source.hours*3600000){rejected++;continue;}}
    if(row.derivedAvailableAt!==undefined&&!clock(row.derivedAvailableAt)){rejected++;continue;}
    // Earnings rows carrying their report day: a report older than the lane window is not a fresh catalyst, whatever the
    // file's generatedAt says (day precision: one extra day of tolerance for the unknown time of day).
    if(source.lane==='EARNINGS_SURPRISE'&&row.publicationDay!==undefined){const d=row.publicationDay,ms=isDay(d)?Date.parse(d+'T00:00:00Z'):NaN;if(!Number.isFinite(ms)||ms>at||at-ms>(source.hours+24)*3600000){rejected++;continue;}}
    if(row.lastCloseDay!==undefined){const lag=closeLagSessions(row.lastCloseDay,at);if(lag===null||lag<0||lag>CLOSE_LAG_LIMIT){rejected++;continue;}}
    const primary=clock(rawPublic),asOf=primary?rawPublic:row.derivedAvailableAt??generated;
    if(source.lane==='SEC_EVENT'&&row.firstObservedAt!=null&&(!clock(row.firstObservedAt)||Date.parse(row.firstObservedAt)>at||primary&&Date.parse(row.firstObservedAt)<Date.parse(rawPublic))){rejected++;continue;}
    if(!clock(asOf)||Date.parse(asOf)>at||at-Date.parse(asOf)>source.hours*3600000){rejected++;continue;}
    const eventKey=observationIdentity(source,row,sym);
    observations.push({symbol:sym,lane:source.lane,asOf,observedAt:cutoff,sourceId:hash(eventKey),
     description:source.lane+': '+String(row.h||row.rule||row.f||row.chain||'derived collector observation').slice(0,400),
     publicationBasis:primary?'SOURCE_PUBLIC_TIMESTAMP':'DERIVED_OUTPUT_AVAILABLE',
     caveat:primary?'Source report; materiality/direction not established by lane presence':'Original public event time unavailable; generatedAt is derived output availability only',
     sourcePath:source.path,sourceCapturedAt:source.lane==='NEWS_CATALYST'?row.at:source.lane==='SEC_EVENT'?(clock(row.firstObservedAt)?row.firstObservedAt:null):(source.lane==='SUPPLY_SHIFT'&&clock(row.firstObservedAt)?row.firstObservedAt:row.derivedAvailableAt??generated),
     ...(source.lane!=='SEC_EVENT'?{reportedSourceId:row.sourceId||row.id||null,sourceRevisionId:row.sourceRevisionId||null,sourceIdentityBasis:row.sourceIdentityBasis||'UNVERIFIED',sourceDataDay:row.sourceDataDay||null,reportedPublicationDay:row.publicationDay||null,sourceClockBasis:row.sourceClockBasis||'UNKNOWN',priceBasis:row.priceBasis||'UNKNOWN'}:{}),
     ...(source.lane==='SEC_EVENT'?{reportedSourceId:row.sourceId||null,sourceNamespace:row.sourceNamespace||'UNKNOWN',outputAvailableAt:generated}:{} ),
     ...(source.lane==='EARNINGS_SURPRISE'&&row.timing!==undefined?{earnings:{provider:row.src||null,timing:row.timing,reactionSession:row.reactionSession??null,reactionStatus:row.reactionStatus||'UNKNOWN',reactionCandidates:Array.isArray(row.reactionCandidates)?row.reactionCandidates.slice(0,2):null,corroboratedBy:Array.isArray(row.corroboratedBy)?row.corroboratedBy.slice(0,4):[],epsUnit:row.epsUnit||'UNKNOWN'}}:{}),
     ...(row.lastCloseDay!==undefined?{lastCloseDay:row.lastCloseDay,closeLagSessions:closeLagSessions(row.lastCloseDay,at)}:{})});accepted++;
    }catch{rejected++;rowErrors++;}
   }
   sources.push({...source,status:'READ',revokedSourceIds,revokedReportedIds,rows:rows.length,accepted,rejected,...(rowErrors?{rowErrors}:{}),truncated:inputTruncated+Math.max(0,rows.length-500),generatedAt:generated||null,...(producerStatus?{producerStatus}:{}),...(source.lane==='NEWS_CATALYST'?{inputRows,malformedLines,rejectionReasons,partial:rejected>0||inputTruncated>0}:{} )});
  }catch{sources.push({...source,status:'MALFORMED',rows:0});}
 }
 return {observations,sources};
}
export const discoveryState=()=>({observations:{},crossings:{},firstFresh:{},capacityDroppedAttempts:0,funnel:{attempts:0,accepted:0,duplicates:0,invalid:0,unknownPrice:0},suppressed:{},sourceReliability:{}});
export function updateDiscovery(state,{observations,rows,cutoff,sources=[]}) {
 if(!clock(cutoff))throw new TypeError('discovery cutoff needs timezone');
 state.funnel||={attempts:0,accepted:0,duplicates:0,invalid:0,unknownPrice:0};state.suppressed||={};state.sourceReliability||={};
 for(const source of sources){const r=state.sourceReliability[source.lane]||={cycles:0,statusCounts:{},acceptedAttempts:0,rejectedAttempts:0,truncatedAttempts:0};r.cycles++;r.statusCounts[source.status]=(r.statusCounts[source.status]||0)+1;r.acceptedAttempts+=source.accepted||0;r.rejectedAttempts+=source.rejected||0;r.truncatedAttempts+=source.truncated||0;
  for(const o of Object.values(state.observations))if(o.lane===source.lane&&(source.revokedSourceIds?.includes(o.sourceId)||source.revokedReportedIds?.includes(String(o.reportedSourceId)))){o.sourceConflict=true;o.sourceConflictReason='SOURCE_REVISION_CONFLICT';}
  if(source.upstream){r.upstreamStatusCounts||={};r.upstreamStatusCounts[source.upstream.status]=(r.upstreamStatusCounts[source.upstream.status]||0)+1;r.lastUpstream={...source.upstream};}
  if(source.producerStatus){r.producerStatusCounts||={};for(const name of ['SEC','OPENFDA','FINNHUB_CALENDAR','SEC_FORM4','CHAIN_ANALYSIS','SEC_INDEX','SEC_TICKERS','ALPHA_VANTAGE','FMP','PRICE_CACHE','LAB_TODAY_FILES','SPY_BARS']){const v=source.producerStatus[name];if(!v)continue;const counts=r.producerStatusCounts[name]||={};counts[v.status]=(counts[v.status]||0)+1;}r.lastProducerStatus=structuredClone(source.producerStatus);}
  if(source.origin){r.originCounts||={};r.originCounts[source.origin]=(r.originCounts[source.origin]||0)+1;}
 }
 const suppress=(o,reason)=>{const key=hash([o?.symbol,o?.lane,o?.sourceId,reason]);if(!state.suppressed[key]&&Object.keys(state.suppressed).length<5000)state.suppressed[key]={symbol:o?.symbol||null,lane:o?.lane||null,sourceId:o?.sourceId||null,reason,firstObservedAt:cutoff};};
 const now=Date.parse(cutoff),fresh=new Map();
 if(clock(state.lastCycleAt)&&now<Date.parse(state.lastCycleAt)){state.rejectedOutOfOrderCycles=(state.rejectedOutOfOrderCycles||0)+1;return [];}
 state.lastCycleAt=cutoff;
 state.priceCoverage||={cycles:0,noFreshPriceCycles:0,quoteAttempts:0,freshQuoteAttempts:0};state.priceCoverage.cycles++;state.priceCoverage.quoteAttempts+=rows.length;
 for(const r of rows){
  if(!symbol(r.sym)||!Number.isFinite(r.price)||r.price<=0||!Number.isFinite(r.prevC)||r.prevC<=0||!Number.isFinite(r.t)||!isFreshPriceAge(r.t>0?(now-r.t)/60000:null))continue;
  const change=r.price/r.prevC-1;if(!Number.isFinite(change))continue;fresh.set(r.sym,{price:r.price,change,bid:r.bid??null,ask:r.ask??null,quoteAgeSec:Number.isFinite(r.qt)&&r.qt>0?(now-r.qt)/1000:null,priceAsOf:new Date(r.t).toISOString()});
  if(!state.firstFresh[r.sym])state.firstFresh[r.sym]={at:cutoff,change};
  const crossings=state.crossings[r.sym]||(state.crossings[r.sym]={});
  for(const level of [5,10,15,20,25])if(change>=level/100&&!crossings[level])crossings[level]={at:cutoff,change,sourceStates:sources.map(s=>({lane:s.lane,status:s.status}))};
 }
 state.priceCoverage.freshQuoteAttempts+=fresh.size;if(!fresh.size)state.priceCoverage.noFreshPriceCycles++;
 // Follow only actually observed fresh prices. Gaps remain gaps; this is
 // last-trade path measurement, not executable returns or an intrabar low.
 for(const o of Object.values(state.observations)){
  const q=fresh.get(o.symbol);if(!q||o.priceAtDetection===null||Date.parse(cutoff)<=Date.parse(o.observedAt))continue;
  const f=o.followup||={peak:o.priceAtDetection,trough:o.priceAtDetection,maxDrawdown:0};
  f.peak=Math.max(f.peak,q.price);f.trough=Math.min(f.trough,q.price);f.maxDrawdown=Math.min(f.maxDrawdown,q.price/f.peak-1);f.lastPrice=q.price;f.lastObservedAt=cutoff;f.observedRise=f.peak/o.priceAtDetection-1;f.worstVsDetection=f.trough/o.priceAtDetection-1;
 }
 const added=[];let count=Object.keys(state.observations).length;
 for(const o of observations){
  state.funnel.attempts++;
  const valid=assembleMultiAngle([o],{cutoff});
  if(valid.count!==1){state.funnel.invalid++;suppress(o,valid.ignored.future?'FUTURE_OR_INVALID_CHRONOLOGY':valid.ignored.unknownLane?'UNKNOWN_LANE':'INVALID_EVIDENCE');continue;}
  const key=hash([o.symbol,o.lane,o.sourceId]);if(state.observations[key]){const prior=state.observations[key];if(o.sourceRevisionId&&prior.sourceRevisionId&&o.sourceRevisionId!==prior.sourceRevisionId){prior.sourceConflict=true;prior.sourceConflictReason='SOURCE_REVISION_CONFLICT';}state.funnel.duplicates++;continue;}
  if(count>=20000){state.capacityDroppedAttempts=(state.capacityDroppedAttempts||0)+1;suppress(o,'SESSION_CAPACITY_LIMIT');continue;}
  const q=fresh.get(o.symbol);
  const record={...o,eventId:key,observedAt:cutoff,priceAtDetection:q?.price??null,changeAtDetection:q?.change??null,quoteAtDetection:q||null,classification:'RESEARCH ONLY',status:'NOT AN APPROVED BUY'};
  if(!q){state.funnel.unknownPrice++;suppress(o,'NO_FRESH_PRICE_AT_FIRST_DETECTION');}
  if(q?.change>=.05)suppress(o,'ALREADY_EXTENDED_AT_FIRST_DETECTION');
  state.observations[key]=record;added.push(record);count++;state.funnel.accepted++;
 }
 return added;
}
export function discoveryReport(state,{cutoff,sources,completeSession=false}) {
 const allRecords=Object.values(state.observations),records=allRecords.filter(x=>!x.sourceConflict),board=assembleMultiAngle(records,{cutoff});
 const lanes=LANES.map(l=>{
  const a=records.filter(x=>x.lane===l.id),bySymbol=new Map();for(const x of a)if(!bySymbol.has(x.symbol)||x.observedAt<bySymbol.get(x.symbol).observedAt)bySymbol.set(x.symbol,x);
  const first=[...bySymbol.values()],before=first.filter(x=>x.changeAtDetection!==null&&x.changeAtDetection<.05&&state.crossings[x.symbol]?.[10]&&Date.parse(x.observedAt)<Date.parse(state.crossings[x.symbol][10].at));
  const thresholds=[5,10,20,25].map(percent=>{const crossing=first.filter(x=>state.crossings[x.symbol]?.[percent]),before=crossing.filter(x=>x.changeAtDetection!==null&&x.changeAtDetection<percent/100&&Date.parse(x.observedAt)<Date.parse(state.crossings[x.symbol][percent].at));return {percent,observedCrossings:crossing.length,detectionsBeforeCrossing:before.length,earlyBelowPlus5BeforeCrossing:before.filter(x=>x.changeAtDetection<.05).length,leadMinutes:before.map(x=>(Date.parse(state.crossings[x.symbol][percent].at)-Date.parse(x.observedAt))/60000),noObservedCrossing:first.length-crossing.length};});
  return {lane:l.id,events:a.length,thresholds,symbols:first.length,pricedAtDetection:first.filter(x=>x.priceAtDetection!==null).length,
   beforeObservedPlus10:before.length,leadMinutes:before.map(x=>+( (Date.parse(state.crossings[x.symbol][10].at)-Date.parse(x.observedAt))/60000).toFixed(3)),
   alreadyPlus5AtDetection:first.filter(x=>x.changeAtDetection!==null&&x.changeAtDetection>=.05).length,
   noObservedPlus10Yet:first.filter(x=>!state.crossings[x.symbol]?.[10]).length};
 });
 const missed=Object.entries(state.crossings).filter(([,x])=>x[10]).flatMap(([symbol,c])=>{
  const a=records.filter(x=>x.symbol===symbol),early=a.some(x=>x.changeAtDetection!==null&&x.changeAtDetection<.05&&Date.parse(x.observedAt)<Date.parse(c[10].at));if(early)return [];
  const reason=!a.length?'NO_DISCOVERY_OBSERVED':a.every(x=>x.changeAtDetection===null)?'NO_FRESH_DETECTION_PRICE':a.every(x=>Date.parse(x.observedAt)>=Date.parse(c[10].at))?'DISCOVERY_AT_OR_AFTER_OBSERVED_MOVE':'ALREADY_EXTENDED_AT_DETECTION';
  return [{symbol,reason,firstObservedPlus10:c[10]}];
 });
 return {...board,sources,lanes,completeSession,funnel:state.funnel||null,priceCoverage:state.priceCoverage||null,sourceReliability:state.sourceReliability||{},suppressionReasons:Object.values(state.suppressed||{}),
  observedRecordCount:allRecords.length,sourceConflictCount:allRecords.length-records.length,conflictedDetections:allRecords.filter(x=>x.sourceConflict).slice(0,1000),detectionCount:records.length,displayedDetections:Math.min(records.length,1000),detections:records.slice(0,1000),missedCount:missed.length,missedCandidates:missed.slice(0,100),dedupScope:'CURRENT_SESSION',
  capacityDroppedAttempts:state.capacityDroppedAttempts||0,observedPlus10Symbols:Object.keys(state.crossings).filter(s=>state.crossings[s][10]).length,
  rejectedOutOfOrderCycles:state.rejectedOutOfOrderCycles||0,identityScope:'CURRENT_SESSION_SYMBOL; independent security identity remains unverified',
  measurementNote:'Prospective first-ingestion vs first OBSERVED fresh +10% crossing, requiring detection below +5%. Unknown/stale prices earn no lead credit. No observed crossing is unresolved, not a false-positive verdict. Lane breadth is correlated evidence, not independent confirmation, profitability or BUY eligibility.'};
}
