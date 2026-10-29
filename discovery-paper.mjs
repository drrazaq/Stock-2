// Pre-registered PAPER EVIDENCE V1. No orders, synthetic fill claims, approval
// verdicts or frozen lab writes. A live verdict needs prospective observations.
import {createHash} from 'node:crypto';
import {marketSession} from './market-session.mjs';
export const PAPER_PROTOCOL=Object.freeze({id:'DISCOVERY_PAPER_V1',notional:1000,feePerOrder:3,holdMinutes:30,maxEntryWaitMinutes:3,maxExitWaitMinutes:3,maxQuoteAgeSeconds:120,maxEntrySpread:.02,minDollarVolume:1e6,stressSlippagePerSide:.005});
const time=x=>typeof x==='string'&&/T.*(Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x))?Date.parse(x):NaN;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const sessionAt=ms=>{const p={};new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).forEach(x=>p[x.type]=x.value);const day=p.year+'-'+p.month+'-'+p.day;return {day,minute:Number(p.hour)*60+Number(p.minute),...marketSession(day)};};
function quoteOk(q,decision,{entry=false}={}) {
 if(!q||!finite(q.bid)||!finite(q.ask)||q.bid<=0||q.ask<q.bid)return false;
 const observed=time(q.at),qt=time(q.quoteAsOf),vt=time(q.dollarVolumeAsOf);
 if(!Number.isFinite(observed)||observed>decision||!Number.isFinite(qt)||qt>observed||observed-qt>120000)return false;
 const session=sessionAt(observed);if(session.closed||session.minute<session.open||session.minute>=session.close)return false;
 if(entry&&(!finite(q.dollarVolume)||q.dollarVolume<PAPER_PROTOCOL.minDollarVolume||!Number.isFinite(vt)||vt>observed||observed-vt>15*60000||sessionAt(vt).day!==session.day||(q.ask-q.bid)/(q.ask/2+q.bid/2)>PAPER_PROTOCOL.maxEntrySpread))return false;
 return true;
}
function pathOutcome(symbol,securityId,entry,quotes,cutoff) {
 const p=PAPER_PROTOCOL,qty=Math.floor((p.notional-p.feePerOrder)/entry.ask);
 if(!Number.isSafeInteger(qty))return {status:'BLOCKED',reason:'NOTIONAL_QUANTITY_UNREPRESENTABLE'};
 if(qty<1)return {status:'BLOCKED',reason:'NOTIONAL_TOO_SMALL'};
 const from=time(entry.at),due=from+p.holdMinutes*60000;
 const observed=quotes.filter(q=>q.symbol===symbol&&q.securityId===securityId&&time(q.at)>=from&&time(q.at)<=Math.min(cutoff,due+p.maxExitWaitMinutes*60000)&&quoteOk(q,cutoff)).sort((a,b)=>time(a.at)-time(b.at));
 const exit=observed.find(q=>time(q.at)>=due&&time(q.at)<=due+p.maxExitWaitMinutes*60000);
 let peak=p.notional,drawdown=0,maxBid=entry.bid,numericOverflow=false;
 for(const q of observed.filter(q=>!exit||time(q.at)<=time(exit.at))){const equity=p.notional-p.feePerOrder+qty*(q.bid-entry.ask)-p.feePerOrder;if(!Number.isFinite(equity)){numericOverflow=true;break;}peak=Math.max(peak,equity);drawdown=Math.min(drawdown,equity/peak-1);maxBid=Math.max(maxBid,q.bid);}
 const common={symbol,entryDisplayedSizeVerified:Number.isInteger(entry.askSizeShares)&&entry.askSizeShares>=qty,liquidationAssumption:'FULL_QUANTITY_AT_DISPLAYED_BID; displayed capacity recorded separately; not a fill',entryAt:entry.at,entryAsk:entry.ask,quantity:qty,entrySpread:(entry.ask-entry.bid)/(entry.ask/2+entry.bid/2),observedLiquidationDrawdown:drawdown,maxObservedGrossMove:maxBid/entry.ask-1,fillClaim:'NONE — recorded quote paper assumption'};
 if(numericOverflow||!Number.isFinite(common.maxObservedGrossMove)||!Number.isFinite(common.observedLiquidationDrawdown))return {...common,status:'UNRESOLVED',reason:'NONFINITE_PAPER_ARITHMETIC'};
 if(!exit)return {...common,status:'UNRESOLVED',reason:'NO_FRESH_HORIZON_EXIT'};
 const net=qty*(exit.bid-entry.ask)-2*p.feePerOrder,stress=qty*(exit.bid*(1-p.stressSlippagePerSide)-entry.ask*(1+p.stressSlippagePerSide))-2*p.feePerOrder;
 if(!Number.isFinite(net)||!Number.isFinite(stress))return {...common,status:'UNRESOLVED',reason:'NONFINITE_PAPER_ARITHMETIC'};
 return {...common,status:'PAPER_RESOLVED',exitDisplayedSizeVerified:Number.isInteger(exit.bidSizeShares)&&exit.bidSizeShares>=qty,exitAt:exit.at,exitBid:exit.bid,netAfterSpreadAndFees:net/p.notional,stressNet:stress/p.notional,observedTargetHit:maxBid>=entry.ask*1.1};
}
// Evidence admission revision only: frozen V1 thresholds/costs/horizons are unchanged.
function metadataAt(symbol,at,metadata){
 const candidates=metadata.filter(m=>m&&m.symbol===symbol&&typeof m.securityId==='string'&&m.securityId&&typeof m.industry==='string'&&m.industry&&Number.isFinite(time(m.asOf))&&time(m.asOf)<=at);
 if(!candidates.length)return null;
 const latest=Math.max(...candidates.map(m=>time(m.asOf))),current=candidates.filter(m=>time(m.asOf)===latest);
 return new Set(current.map(m=>JSON.stringify([m.securityId,m.industry]))).size===1?current[0]:null;
}
function normalizeQuotes(input){
 const map=new Map(),conflicts=new Set();let duplicates=0,invalid=0;
 for(const q of input){
  if(!q||typeof q!=='object'||typeof q.symbol!=='string'||!Number.isFinite(time(q.at))){invalid++;continue;}
  const key=JSON.stringify([q.symbol,q.at]),signature=JSON.stringify([q.securityId,q.bid,q.ask,q.quoteAsOf,q.dollarVolume,q.dollarVolumeAsOf,q.bidSizeShares,q.askSizeShares]);
  if(map.has(key)){if(map.get(key).signature===signature)duplicates++;else conflicts.add(key);}
  else map.set(key,{q,signature});
 }
 return {quotes:[...map.entries()].filter(([k])=>!conflicts.has(k)).map(([,v])=>v.q),duplicates,conflictingClocks:conflicts.size,invalid};
}
export function evaluatePaperEvidence(events,quotes,metadata,{cutoff,prospective=false}={}) {
 if(!Array.isArray(events)||!Array.isArray(quotes)||!Array.isArray(metadata))throw Error('paper evidence arrays required');
 const normalized=normalizeQuotes(quotes);quotes=normalized.quotes;
 const seenEvents=new Set();
 const at=time(cutoff);if(!Number.isFinite(at))throw Error('paper cutoff invalid');
 const p=PAPER_PROTOCOL,cases=[];
 for(const event of events){
  if(!event||typeof event.eventId!=='string'||!event.eventId||typeof event.symbol!=='string'){cases.push({eventId:event?.eventId??null,status:'BLOCKED',reason:'INVALID_DISCOVERY_EVENT'});continue;}
  if(seenEvents.has(event.eventId)){cases.push({eventId:event.eventId,status:'BLOCKED',reason:'DUPLICATE_DISCOVERY_EVENT'});continue;}seenEvents.add(event.eventId);
  const detected=time(event.observedAt),meta=metadataAt(event.symbol,detected,metadata);
  const discovered=new Set(events.filter(x=>x&&time(x.observedAt)<=detected).map(x=>x.symbol));
  if(!Number.isFinite(detected)||detected>at){cases.push({eventId:event.eventId,status:'BLOCKED',reason:'INVALID_DETECTION_TIME'});continue;}
  if(!meta){cases.push({eventId:event.eventId,status:'BLOCKED',reason:'NO_POINT_IN_TIME_SECURITY_METADATA'});continue;}
  const entry=quotes.filter(q=>q.symbol===event.symbol&&q.securityId===meta.securityId&&time(q.at)>detected&&time(q.at)<=detected+p.maxEntryWaitMinutes*60000&&quoteOk(q,at,{entry:true})).sort((a,b)=>time(a.at)-time(b.at))[0];
  if(!entry){cases.push({eventId:event.eventId,status:'BLOCKED',reason:'NO_FRESH_EXECUTABLE_ENTRY_EVIDENCE'});continue;}
  const controls=[...new Set(metadata.filter(m=>m&&typeof m.symbol==='string').map(m=>m.symbol))].map(symbol=>metadataAt(symbol,detected,metadata)).filter(Boolean);
  const pool=controls.filter(m=>m.symbol!==event.symbol&&!discovered.has(m.symbol)&&m.securityId!==meta.securityId&&m.industry===meta.industry).flatMap(m=>{
   const q=quotes.find(q=>q.symbol===m.symbol&&q.securityId===m.securityId&&q.at===entry.at&&quoteOk(q,at,{entry:true})&&q.ask>=entry.ask/2&&q.ask<=entry.ask*2&&q.dollarVolume>=entry.dollarVolume/5&&q.dollarVolume<=entry.dollarVolume*5);
   return q?[{meta:m,quote:q,order:createHash('sha256').update(String(event.eventId)+'|'+m.securityId).digest('hex')}]:[];
  }).sort((a,b)=>a.order.localeCompare(b.order));
  if(!pool.length){cases.push({eventId:event.eventId,status:'BLOCKED',reason:'NO_SAME_TIME_INDUSTRY_LIQUIDITY_CONTROL'});continue;}
  const candidate=pathOutcome(event.symbol,meta.securityId,entry,quotes,at),control=pathOutcome(pool[0].meta.symbol,pool[0].meta.securityId,pool[0].quote,quotes,at);
  cases.push({eventId:event.eventId,status:candidate.status==='PAPER_RESOLVED'&&control.status==='PAPER_RESOLVED'?'MATCHED_PAPER_RESOLVED':'UNRESOLVED',candidate,control,
   matchedEdge:candidate.status==='PAPER_RESOLVED'&&control.status==='PAPER_RESOLVED'?candidate.netAfterSpreadAndFees-control.netAfterSpreadAndFees:null});
 }
 const resolved=cases.filter(x=>x.status==='MATCHED_PAPER_RESOLVED');
 return {protocol:p,evidenceAdmissionRevision:'IDENTITY_EVENT_QUOTES_V2',quoteIntegrity:{duplicates:normalized.duplicates,conflictingClocks:normalized.conflictingClocks,invalid:normalized.invalid},cutoff,provenance:prospective?'DECLARED_PROSPECTIVE_INPUT_REQUIRES_SOURCE_AUDIT':'SIMULATION_OR_UNVERIFIED_INPUT',cases,
  counts:{attempted:cases.length,blocked:cases.filter(x=>x.status==='BLOCKED').length,unresolved:cases.filter(x=>x.status==='UNRESOLVED').length,resolved:resolved.length,resolvedWithVerifiedDisplayedSize:resolved.filter(x=>x.candidate.entryDisplayedSizeVerified&&x.candidate.exitDisplayedSizeVerified&&x.control.entryDisplayedSizeVerified&&x.control.exitDisplayedSizeVerified).length,targetNotObserved:resolved.filter(x=>!x.candidate.observedTargetHit).length},
  conclusion:'NO STRATEGY VERDICT — quote assumptions are not fills; fixtures cannot establish profitability, predictive validity or approved BUY eligibility.'};
}
