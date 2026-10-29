// Observation-only ingress and prospective timing measurement. Never imports
// order, Telegram, strategy-promotion or recommendation code; never runs labs.
import {createHash} from 'node:crypto';
import {LANES,assembleMultiAngle} from './multi-angle-discovery.mjs';
import {isFreshPriceAge} from './ignition-gates.mjs';
const clock=x=>typeof x==='string'&&/T.*(Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
const symbol=x=>typeof x==='string'&&/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x);
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
   let rows,generated,preRejected=0,malformedLines=0,inputRows=null,inputTruncated=0,parsedObjects=0,producerStatus=null;const rejectionReasons={};
   const reject=reason=>{preRejected++;rejectionReasons[reason]=(rejectionReasons[reason]||0)+1;};
   if(source.lane==='NEWS_CATALYST'){
    const lines=text.split(/\r?\n/).filter(x=>x.trim());inputRows=lines.length;inputTruncated=Math.max(0,lines.length-10000);rows=[];
    for(const line of lines.slice(-10000)){
     let row;try{row=JSON.parse(line);}catch{malformedLines++;reject('MALFORMED_JSON_LINE');continue;}
     if(!object(row)){reject('NON_OBJECT_ROW');continue;}parsedObjects++;
     if(typeof row.h!=='string'||!row.h.trim()||!symbol(row.sym)){reject('NOT_A_VALID_HEADLINE_RECORD');continue;}
     if(typeof row.t!=='number'||!Number.isFinite(row.t)||row.t<=0||row.t>8640000000000000){reject('INVALID_PUBLICATION_CLOCK');continue;}
     if(row.t>at||at-row.t>source.hours*3600000){reject(row.t>at?'FUTURE_PUBLICATION':'STALE_PUBLICATION');continue;}
     if(row.at!==undefined&&(!clock(row.at)||Date.parse(row.at)>at||Date.parse(row.at)<row.t)){reject('INVALID_OR_FUTURE_INGESTION_CLOCK');continue;}
     rows.push(row);
    }
    if(!parsedObjects&&preRejected){sources.push({...source,status:'MALFORMED',rows:0,inputRows,rejected:preRejected,malformedLines,truncated:inputTruncated,rejectionReasons});continue;}
    rows.sort((a,b)=>b.t-a.t);
   }else{const doc=JSON.parse(text);if(!object(doc))throw Error('invalid source object');if(doc.error||doc.errors||doc.ok===false)throw Error('source error envelope');generated=doc.generatedAt!==undefined?doc.generatedAt:doc.updated;rows=rowsOf(source.lane,doc);if(source.lane==='SEC_EVENT'){producerStatus={};for(const name of ['SEC','OPENFDA']){const v=doc.sourceStatus?.[name];producerStatus[name]={status:object(v)&&['OBSERVED','UNKNOWN','NOT_FETCHED','PARTIAL_OR_UNKNOWN'].includes(v.status)?v.status:'UNKNOWN'};}}}
   if(!Array.isArray(rows))throw Error('invalid rows');
   if(source.lane!=='NEWS_CATALYST'&&!clock(generated)){sources.push({...source,status:'MISSING_OUTPUT_TIMESTAMP',rows:rows.length});continue;}
   if(generated&&(Date.parse(generated)>at||at-Date.parse(generated)>source.hours*3600000)){sources.push({...source,status:Date.parse(generated)>at?'FUTURE':'STALE',rows:rows.length});continue;}
   let accepted=0,rejected=preRejected;
   for(const row of rows.slice(0,500)){
    if(!object(row)){rejected++;continue;}
    const sym=row.sym||row.symbol;if(!symbol(sym)){rejected++;continue;}
    // A finite number can still exceed JavaScript's representable date range.
    // Reject that row without making every valid headline in the file unavailable.
    const newsTime=source.lane==='NEWS_CATALYST'&&typeof row.t==='number'&&Number.isFinite(row.t)&&Math.abs(row.t)<=8640000000000000?row.t:null;
    const rawPublic=newsTime!==null?new Date(newsTime).toISOString():source.lane==='SEC_EVENT'?(row.publicationAt??row.p):null;
    // Generated output time is conservative availability of DERIVED analysis;
    // it is never passed off as the original earnings/insider publication time.
    if(source.lane==='SEC_EVENT'&&rawPublic!==undefined&&!clock(rawPublic)){rejected++;continue;}
    const primary=clock(rawPublic),asOf=primary?rawPublic:generated;
    if(source.lane==='SEC_EVENT'&&row.firstObservedAt!=null&&(!clock(row.firstObservedAt)||Date.parse(row.firstObservedAt)>at||primary&&Date.parse(row.firstObservedAt)<Date.parse(rawPublic))){rejected++;continue;}
    if(!clock(asOf)||Date.parse(asOf)>at||at-Date.parse(asOf)>source.hours*3600000){rejected++;continue;}
    const eventKey=[source.path,sym,row.sourceId||row.id||row.url||row.rule||'',row.p||row.d||row.filed||row.signalDay||'',row.h||row.f||row.chain||''];
    observations.push({symbol:sym,lane:source.lane,asOf,observedAt:cutoff,sourceId:hash(eventKey),
     description:source.lane+': '+String(row.h||row.rule||row.f||row.chain||'derived collector observation').slice(0,400),
     publicationBasis:primary?'SOURCE_PUBLIC_TIMESTAMP':'DERIVED_OUTPUT_AVAILABLE',
     caveat:primary?'Source report; materiality/direction not established by lane presence':'Original public event time unavailable; generatedAt is derived output availability only',
     sourcePath:source.path,sourceCapturedAt:source.lane==='NEWS_CATALYST'?row.at:source.lane==='SEC_EVENT'?(clock(row.firstObservedAt)?row.firstObservedAt:null):generated,
     ...(source.lane==='SEC_EVENT'?{reportedSourceId:row.sourceId||null,sourceNamespace:row.sourceNamespace||'UNKNOWN',outputAvailableAt:generated}:{} )});accepted++;
   }
   sources.push({...source,status:'READ',rows:rows.length,accepted,rejected,truncated:inputTruncated+Math.max(0,rows.length-500),generatedAt:generated||null,...(producerStatus?{producerStatus}:{}),...(source.lane==='NEWS_CATALYST'?{inputRows,malformedLines,rejectionReasons,partial:rejected>0||inputTruncated>0}:{} )});
  }catch{sources.push({...source,status:'MALFORMED',rows:0});}
 }
 return {observations,sources};
}
export const discoveryState=()=>({observations:{},crossings:{},firstFresh:{},capacityDroppedAttempts:0,funnel:{attempts:0,accepted:0,duplicates:0,invalid:0,unknownPrice:0},suppressed:{},sourceReliability:{}});
export function updateDiscovery(state,{observations,rows,cutoff,sources=[]}) {
 if(!clock(cutoff))throw new TypeError('discovery cutoff needs timezone');
 state.funnel||={attempts:0,accepted:0,duplicates:0,invalid:0,unknownPrice:0};state.suppressed||={};state.sourceReliability||={};
 for(const source of sources){const r=state.sourceReliability[source.lane]||={cycles:0,statusCounts:{},acceptedAttempts:0,rejectedAttempts:0,truncatedAttempts:0};r.cycles++;r.statusCounts[source.status]=(r.statusCounts[source.status]||0)+1;r.acceptedAttempts+=source.accepted||0;r.rejectedAttempts+=source.rejected||0;r.truncatedAttempts+=source.truncated||0;
  if(source.upstream){r.upstreamStatusCounts||={};r.upstreamStatusCounts[source.upstream.status]=(r.upstreamStatusCounts[source.upstream.status]||0)+1;r.lastUpstream={...source.upstream};}
  if(source.producerStatus){r.producerStatusCounts||={};for(const name of ['SEC','OPENFDA']){const v=source.producerStatus[name];if(!v)continue;const counts=r.producerStatusCounts[name]||={};counts[v.status]=(counts[v.status]||0)+1;}r.lastProducerStatus=structuredClone(source.producerStatus);}
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
  const key=hash([o.symbol,o.lane,o.sourceId]);if(state.observations[key]){state.funnel.duplicates++;continue;}
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
 const records=Object.values(state.observations),board=assembleMultiAngle(records,{cutoff});
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
  detectionCount:records.length,displayedDetections:Math.min(records.length,1000),detections:records.slice(0,1000),missedCount:missed.length,missedCandidates:missed.slice(0,100),dedupScope:'CURRENT_SESSION',
  capacityDroppedAttempts:state.capacityDroppedAttempts||0,observedPlus10Symbols:Object.keys(state.crossings).filter(s=>state.crossings[s][10]).length,
  rejectedOutOfOrderCycles:state.rejectedOutOfOrderCycles||0,identityScope:'CURRENT_SESSION_SYMBOL; independent security identity remains unverified',
  measurementNote:'Prospective first-ingestion vs first OBSERVED fresh +10% crossing, requiring detection below +5%. Unknown/stale prices earn no lead credit. No observed crossing is unresolved, not a false-positive verdict. Lane breadth is correlated evidence, not independent confirmation, profitability or BUY eligibility.'};
}
