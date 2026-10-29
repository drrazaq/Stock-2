// Research-only capture of actually observed regular-session BBOs.
// No fetch, Telegram, order, lab or strategy-promotion imports.
import {marketSession} from './market-session.mjs';
import {identityAt} from './historical-integrity.mjs';
const stamp=x=>typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)&&Number.isFinite(Date.parse(x))?Date.parse(x):NaN;
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const symbol=x=>typeof x==='string'&&/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x);
function ny(at){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)).map(x=>[x.type,x.value]));const day=p.year+'-'+p.month+'-'+p.day;return {day,minute:Number(p.hour)*60+Number(p.minute),...marketSession(day)};}
function recordMetadata(state,sym,cutoff,records){
 const now=stamp(cutoff),identity=identityAt(sym,cutoff,records),securityId=identity.status==='DOCUMENTED_MAPPING'?identity.securityId:null;
 const candidates=records.filter(x=>x&&x.symbol===sym&&x.securityId===securityId&&Number.isFinite(stamp(x.knownAt))&&stamp(x.knownAt)<=now&&stamp(x.validFrom)<=now&&(x.validTo===null||stamp(x.validTo)>now)&&typeof x.industry==='string'&&x.industry.trim());
 const latest=candidates.length?Math.max(...candidates.map(x=>stamp(x.knownAt))):null,current=candidates.filter(x=>stamp(x.knownAt)===latest);
 const industry=new Set(current.map(x=>x.industry.trim())).size===1?current[0].industry.trim():null;
 if(securityId&&industry){const key=sym+'|'+securityId+'|'+industry;if(!state.metadata[key]){if(Object.keys(state.metadata).length<2000)state.metadata[key]={symbol:sym,securityId,industry,asOf:cutoff,sourceAuthenticity:'UNVERIFIED_SOURCE_DOCUMENT'};else state.counters.droppedMetadata++;}}
 return securityId;
}
export const quoteEvidenceState=()=>({version:1,events:{},quotes:{},metadata:{},lastCycleAt:null,counters:{cycles:0,duplicateOrRetrograde:0,staleOrMissingBbo:0,unknownIdentity:0,unknownLiquidity:0,targetSymbolObservations:0,missingSymbolRows:0,conflictingQuoteRows:0,freshBboObservations:0,droppedMetadata:0,droppedEvents:0,droppedSymbols:0,droppedQuotes:0},sourceStatus:{}});
export function readResearchIdentities(readText){
 try{const d=JSON.parse(readText('data/research-security-identities.json'));if(!d||!Array.isArray(d.records)||d.records.length>30000)throw Error();return {records:d.records,status:'DOCUMENT_SHAPE_ONLY_NOT_AUTHENTICATED'};}
 catch(error){return {records:[],status:error?.code==='ENOENT'?'MISSING':'MISSING_OR_MALFORMED'};}
}
export function captureResearchQuotes(state,{events,rows,identities=[],identityStatus='UNVERIFIED',cutoff,maxEvents=1000,maxSymbols=250,maxQuotes=30000}){
 const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
 const now=stamp(cutoff);if(!Number.isFinite(now)||!object(state)||state.version!==1||!['events','quotes','metadata','counters','sourceStatus'].every(k=>object(state[k]))||!(state.lastCycleAt===null||Number.isFinite(stamp(state.lastCycleAt)))||Object.keys(quoteEvidenceState().counters).some(k=>!Number.isInteger(state.counters[k])||state.counters[k]<0)||!Array.isArray(events)||!Array.isArray(rows)||!Array.isArray(identities)||typeof identityStatus!=='string'||!identityStatus||identityStatus.length>80||['__proto__','constructor','prototype'].includes(identityStatus))throw Error('INVALID_QUOTE_EVIDENCE_INPUT');
 for(const [n,limit]of [[maxEvents,1000],[maxSymbols,250],[maxQuotes,30000]])if(!Number.isInteger(n)||n<1||n>limit)throw Error('INVALID_QUOTE_EVIDENCE_BUDGET');
 if(Number.isFinite(stamp(state.lastCycleAt))&&now<=stamp(state.lastCycleAt)){state.counters.duplicateOrRetrograde++;return [];}
 state.lastCycleAt=cutoff;state.counters.cycles++;state.sourceStatus[identityStatus]=(state.sourceStatus[identityStatus]||0)+1;
 const current=ny(now);
 for(const e of events){
  if(!e||typeof e.eventId!=='string'||!e.eventId||!symbol(e.symbol)||!Number.isFinite(stamp(e.observedAt))||stamp(e.observedAt)>now||state.events[e.eventId])continue;
  if(Object.keys(state.events).length>=maxEvents){state.counters.droppedEvents++;continue;}
  state.events[e.eventId]={eventId:e.eventId,symbol:e.symbol,observedAt:e.observedAt,classification:'RESEARCH_ONLY'};
 }
 const identityBySymbol=new Map();for(const record of identities)if(record&&symbol(record.symbol)){const list=identityBySymbol.get(record.symbol)||[];list.push(record);identityBySymbol.set(record.symbol,list);}
 const controls=identities.filter(x=>x&&x.eligibleControl===true&&symbol(x.symbol)&&Number.isFinite(stamp(x.knownAt))&&stamp(x.knownAt)<=now&&stamp(x.validFrom)<=now&&(x.validTo===null||stamp(x.validTo)>now)).map(x=>x.symbol).sort();
 // Record metadata availability when actually ingested, including premarket;
 // do not falsely postpone it to the first regular-session quote.
 for(const sym of [...new Set([...Object.values(state.events).map(e=>e.symbol),'SPY',...controls])].slice(0,maxSymbols))recordMetadata(state,sym,cutoff,identityBySymbol.get(sym)||[]);
 if(!current.known||current.closed||current.minute<current.open||current.minute>=current.close)return [];
 const noon=Date.parse(current.day+'T12:00:00Z'),openAt=noon+(current.open-ny(noon).minute)*60000;
 const active=Object.values(state.events).filter(e=>{const detected=stamp(e.observedAt);return ny(detected).day===current.day&&now<=Math.max(detected,openAt)+36*60000;});

 const wanted=[...new Set([...active.map(e=>e.symbol),'SPY',...controls])];
 if(wanted.length>maxSymbols)state.counters.droppedSymbols+=wanted.length-maxSymbols;
 const targets=new Set(wanted.slice(0,maxSymbols)),added=[],bySymbol=new Map(),conflicts=new Set();
 state.counters.targetSymbolObservations+=targets.size;
 for(const row of rows){
  if(!row||!targets.has(row.sym))continue;
  const signature=JSON.stringify([row.bid,row.ask,row.qt,row.dollarVolume,row.dollarVolumeAsOf]);
  if(bySymbol.has(row.sym)&&bySymbol.get(row.sym).signature!==signature)conflicts.add(row.sym);else if(!bySymbol.has(row.sym))bySymbol.set(row.sym,{row,signature});
 }
 state.counters.missingSymbolRows+=targets.size-bySymbol.size;
 for(const {row}of bySymbol.values()){
  if(conflicts.has(row.sym)){state.counters.conflictingQuoteRows++;continue;}
  if(!positive(row.bid)||!positive(row.ask)||row.ask<row.bid||!positive(row.qt)||row.qt>now||now-row.qt>120000){state.counters.staleOrMissingBbo++;continue;}
  const key=row.sym+'|'+cutoff;if(state.quotes[key])continue;
  if(Object.keys(state.quotes).length>=maxQuotes){state.counters.droppedQuotes++;continue;}
  const securityId=recordMetadata(state,row.sym,cutoff,identityBySymbol.get(row.sym)||[]);if(!securityId)state.counters.unknownIdentity++;
  const vt=stamp(row.dollarVolumeAsOf),liquid=positive(row.dollarVolume)&&Number.isFinite(vt)&&vt<=now&&now-vt<=15*60000&&ny(vt).day===current.day;
  if(!liquid)state.counters.unknownLiquidity++;
  const q={symbol:row.sym,securityId,at:cutoff,quoteAsOf:new Date(row.qt).toISOString(),bid:row.bid,ask:row.ask,spread:(row.ask-row.bid)/(row.ask/2+row.bid/2),dollarVolume:liquid?row.dollarVolume:null,dollarVolumeAsOf:liquid?row.dollarVolumeAsOf:null,source:'WATCHER_NORMALIZED_BBO',fillClaim:false};
  state.quotes[key]=q;added.push(q);state.counters.freshBboObservations++;
 }
 return added;
}
export function quoteEvidenceReport(state){
 return {kind:'RESEARCH_ONLY',events:Object.keys(state.events).length,quotes:Object.keys(state.quotes).length,metadata:Object.keys(state.metadata).length,counters:state.counters,sourceStatus:state.sourceStatus,coverage:'BOUNDED_OBSERVATIONS_ONLY',paperInputsReady:'Requires independently verified identity, matching controls, liquidity and source audit',approvedBuy:false,orders:false};
}
