// Observation-only ingress and prospective timing measurement. Never imports
// order, Telegram, strategy-promotion or recommendation code; never runs labs.
import {createHash} from 'node:crypto';
import {LANES,assembleMultiAngle} from './multi-angle-discovery.mjs';
import {isFreshPriceAge} from './ignition-gates.mjs';
const clock=x=>typeof x==='string'&&/T.*(Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
const symbol=x=>typeof x==='string'&&/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
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
 switch(lane) {
  case 'SEC_EVENT':return doc.events||[];
  case 'INSIDER_CLUSTER':return (doc.recent||[]).filter(r=>Number.isInteger(r.n)&&r.n>=2);
  case 'EARNINGS_SURPRISE':return (doc.reports||[]).filter(r=>Number.isFinite(r.a)&&Number.isFinite(r.e)&&r.a!==r.e);
  case 'INDUSTRY_RIPPLE':return doc.todayMovers||[];
  case 'SUPPLY_SHIFT':return doc.now||[];
  case 'TECHNICAL_BUILDUP':return doc.buys||[];
  case 'MARKET_DISLOCATION':return Object.entries(doc.methods||{}).flatMap(([rule,m])=>(m.newSignals||[]).map(r=>({...r,rule})));
  default:return [];
 }
}
export function collectDiscovery({readText,cutoff,live=[]}) {
 if(!clock(cutoff))throw new TypeError('discovery cutoff needs timezone');
 const at=Date.parse(cutoff),observations=[...live],sources=[{lane:'PRE_IGNITION',status:'LIVE_RUNTIME',rows:live.filter(x=>x.lane==='PRE_IGNITION').length}];
 for(const source of DISCOVERY_SOURCES){
  let text;try{text=readText(source.path);}catch{sources.push({...source,status:'MISSING',rows:0});continue;}
  try{
   let rows,generated;
   if(source.lane==='NEWS_CATALYST'){
    rows=text.split(/\r?\n/).filter(Boolean).map(x=>JSON.parse(x)).filter(x=>x.h&&x.sym).sort((a,b)=>(b.t||0)-(a.t||0));
   }else{const doc=JSON.parse(text);generated=doc.generatedAt||doc.updated;rows=rowsOf(source.lane,doc);}
   if(!Array.isArray(rows))throw Error('invalid rows');
   if(source.lane!=='NEWS_CATALYST'&&!clock(generated)){sources.push({...source,status:'MISSING_OUTPUT_TIMESTAMP',rows:rows.length});continue;}
   if(generated&&(Date.parse(generated)>at||at-Date.parse(generated)>source.hours*3600000)){sources.push({...source,status:Date.parse(generated)>at?'FUTURE':'STALE',rows:rows.length});continue;}
   let accepted=0,rejected=0;
   for(const row of rows.slice(0,500)){
    const sym=row.sym||row.symbol;if(!symbol(sym)){rejected++;continue;}
    const rawPublic=source.lane==='NEWS_CATALYST'&&typeof row.t==='number'&&Number.isFinite(row.t)?new Date(row.t).toISOString():source.lane==='SEC_EVENT'?row.p:null;
    // Generated output time is conservative availability of DERIVED analysis;
    // it is never passed off as the original earnings/insider publication time.
    const primary=clock(rawPublic),asOf=primary?rawPublic:generated;
    if(!clock(asOf)||Date.parse(asOf)>at||at-Date.parse(asOf)>source.hours*3600000){rejected++;continue;}
    const eventKey=[source.path,sym,row.sourceId||row.id||row.url||row.rule||'',row.p||row.d||row.filed||row.signalDay||'',row.h||row.f||row.chain||''];
    observations.push({symbol:sym,lane:source.lane,asOf,observedAt:cutoff,sourceId:hash(eventKey),
     description:source.lane+': '+String(row.h||row.rule||row.f||row.chain||'derived collector observation').slice(0,400),
     publicationBasis:primary?'SOURCE_PUBLIC_TIMESTAMP':'DERIVED_OUTPUT_AVAILABLE',
     caveat:primary?'Source report; materiality/direction not established by lane presence':'Original public event time unavailable; generatedAt is derived output availability only',
     sourcePath:source.path,sourceCapturedAt:source.lane==='NEWS_CATALYST'?row.at:generated});accepted++;
   }
   sources.push({...source,status:'READ',rows:rows.length,accepted,rejected,truncated:Math.max(0,rows.length-500),generatedAt:generated||null});
  }catch{sources.push({...source,status:'MALFORMED',rows:0});}
 }
 return {observations,sources};
}
export const discoveryState=()=>({observations:{},crossings:{},firstFresh:{},capacityDroppedAttempts:0});
export function updateDiscovery(state,{observations,rows,cutoff}) {
 const now=Date.parse(cutoff),fresh=new Map();
 for(const r of rows){
  if(!symbol(r.sym)||!Number.isFinite(r.price)||r.price<=0||!Number.isFinite(r.prevC)||r.prevC<=0||!Number.isFinite(r.t)||!isFreshPriceAge(r.t>0?(now-r.t)/60000:null))continue;
  const change=r.price/r.prevC-1;fresh.set(r.sym,{price:r.price,change});
  if(!state.firstFresh[r.sym])state.firstFresh[r.sym]={at:cutoff,change};
  const crossings=state.crossings[r.sym]||(state.crossings[r.sym]={});
  for(const level of [5,10,15])if(change>=level/100&&!crossings[level])crossings[level]={at:cutoff,change};
 }
 const added=[];let count=Object.keys(state.observations).length;
 for(const o of observations){
  if(assembleMultiAngle([o],{cutoff}).count!==1)continue;
  const key=hash([o.symbol,o.lane,o.sourceId]);if(state.observations[key])continue;
  if(count>=20000){state.capacityDroppedAttempts=(state.capacityDroppedAttempts||0)+1;continue;}
  const q=fresh.get(o.symbol);
  const record={...o,eventId:key,observedAt:cutoff,priceAtDetection:q?.price??null,changeAtDetection:q?.change??null,classification:'RESEARCH ONLY',status:'NOT AN APPROVED BUY'};
  state.observations[key]=record;added.push(record);count++;
 }
 return added;
}
export function discoveryReport(state,{cutoff,sources,completeSession=false}) {
 const records=Object.values(state.observations),board=assembleMultiAngle(records,{cutoff});
 const lanes=LANES.map(l=>{
  const a=records.filter(x=>x.lane===l.id),bySymbol=new Map();for(const x of a)if(!bySymbol.has(x.symbol)||x.observedAt<bySymbol.get(x.symbol).observedAt)bySymbol.set(x.symbol,x);
  const first=[...bySymbol.values()],before=first.filter(x=>x.changeAtDetection!==null&&x.changeAtDetection<.05&&state.crossings[x.symbol]?.[10]&&Date.parse(x.observedAt)<Date.parse(state.crossings[x.symbol][10].at));
  return {lane:l.id,events:a.length,symbols:first.length,pricedAtDetection:first.filter(x=>x.priceAtDetection!==null).length,
   beforeObservedPlus10:before.length,leadMinutes:before.map(x=>+( (Date.parse(state.crossings[x.symbol][10].at)-Date.parse(x.observedAt))/60000).toFixed(3)),
   alreadyPlus5AtDetection:first.filter(x=>x.changeAtDetection!==null&&x.changeAtDetection>=.05).length,
   noObservedPlus10Yet:first.filter(x=>!state.crossings[x.symbol]?.[10]).length};
 });
 return {...board,sources,lanes,completeSession,capacityDroppedAttempts:state.capacityDroppedAttempts||0,observedPlus10Symbols:Object.keys(state.crossings).filter(s=>state.crossings[s][10]).length,
  measurementNote:'Prospective first-ingestion vs first OBSERVED fresh +10% crossing, requiring detection below +5%. Unknown/stale prices earn no lead credit. No observed crossing is unresolved, not a false-positive verdict. Lane breadth is correlated evidence, not independent confirmation, profitability or BUY eligibility.'};
}
