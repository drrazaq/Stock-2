// Whole-snapshot observation only. No broker, Telegram, recommendation or lab imports.
import {createHash} from 'node:crypto';
import {marketSymbol} from './market-symbol.mjs';
import {marketSession} from './market-session.mjs';
import {massiveSnapshot} from './snapshot-fields.mjs';
import {collectDiscovery,discoveryState,updateDiscovery,discoveryReport} from './discovery-runtime.mjs';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const sym=x=>typeof x==='string'&&/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x);
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const fresh=(t,now)=>positive(t)&&now-t>=0&&now-t<=180000;
const q=(a,p)=>a.length?a.slice().sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))]:null;
export function researchSession(now){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).map(x=>[x.type,x.value]));
 const day=parts.year+'-'+parts.month+'-'+parts.day,minute=Number(parts.hour)*60+Number(parts.minute),market=marketSession(day);
 return {day,minute,market,eligible:market.known&&!market.closed&&minute>=240&&minute<570};
}
function base(value,fallback){if(value===undefined)return fallback;if(typeof value==='string'&&/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(value))return value;throw Error('RESEARCH_BASE_BLOCKED');}
export function createResearchCollector({env={},fetcher=fetch,maxRequests=420}={}){
 if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>420)throw Error('INVALID_REQUEST_BUDGET');
 const mv=base(env.MASSIVE_BASE,'https://api.massive.com'),fh=base(env.FH_BASE,'https://finnhub.io/api/v1');
 const state={day:null,requests:0,cycles:0,cooldowns:{},discovery:discoveryState(),lastSuccessfulCycle:null,minutes:[],sourceCounts:{}};
 async function get(provider,url,now){
  if(state.requests>=maxRequests)return {provider,status:'REQUEST_BUDGET_EXHAUSTED'};
  if((state.cooldowns[provider]||0)>now)return {provider,status:'RATE_LIMIT_COOLDOWN',until:state.cooldowns[provider]};
  const started=Date.now();state.requests++;
  try{
   const r=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(15000)});
   const header=n=>r.headers?.get?.(n)||null;
   const evidence={provider,httpStatus:r.status,requestLatencyMs:Math.max(0,Date.now()-started),rateLimit:{limit:header('x-ratelimit-limit'),remaining:header('x-ratelimit-remaining'),reset:header('x-ratelimit-reset')}};
   if(r.status===429){const retry=header('retry-after'),n=/^\d+$/.test(retry||'')?Math.min(Number(retry),86400)*1000:Date.parse(retry)-now;state.cooldowns[provider]=now+(Number.isFinite(n)&&n>0?Math.min(n,86400000):60000);return {...evidence,status:'RATE_LIMITED',until:state.cooldowns[provider]};}
   if(!r.ok)return {...evidence,status:'HTTP_ERROR'};
   try{return {...evidence,status:'RESPONSE_OBSERVED',payload:await r.json()};}catch{return {...evidence,status:'INVALID_JSON'};}
  }catch{return {provider,status:'NETWORK_ERROR',requestLatencyMs:Math.max(0,Date.now()-started)};}
 }
 async function cycle({now=Date.now(),readText=()=>{throw Error('unavailable');}}={}){
  const session=researchSession(now),at=new Date(now).toISOString();
  if(!session.eligible)return {kind:'RESEARCH_ONLY',status:'OUTSIDE_PREMARKET',at,session,requests:state.requests};
  if(state.day&&state.day!==session.day)throw Error('RESEARCH_SESSION_CHANGED');state.day=session.day;
  if(state.minutes.includes(session.minute))return {kind:'RESEARCH_ONLY',status:'DUPLICATE_CYCLE',at,session,requests:state.requests};
  state.minutes.push(session.minute);state.cycles++;
  let snapshot=env.MASSIVE_KEY?await get('MASSIVE_FULL_SNAPSHOT',mv+'/v2/snapshot/locale/us/markets/stocks/tickers?apiKey='+encodeURIComponent(env.MASSIVE_KEY),now):{provider:'MASSIVE_FULL_SNAPSHOT',status:'MISSING_CREDENTIALS'};
  let raw=[];if(snapshot.status==='RESPONSE_OBSERVED'){
   if(object(snapshot.payload))snapshot.providerDeclaredStatus=typeof snapshot.payload.status==='string'?snapshot.payload.status.slice(0,80):null;
   if(object(snapshot.payload)&&Array.isArray(snapshot.payload.tickers)&&!snapshot.payload.error&&!['ERROR','NOT_AUTHORIZED'].includes(snapshot.payload.status))raw=snapshot.payload.tickers;
   else snapshot.status='INVALID_SCHEMA';
  }
  const bySymbol=new Map();let invalid=0,duplicates=0;
  if(raw.length>30000){snapshot.status='ROW_BUDGET_EXCEEDED';raw=[];}
  for(const x of raw){
   if(!object(x)||!marketSymbol(x.ticker)){invalid++;continue;}
   const canonical=marketSymbol(x.ticker),row={...massiveSnapshot({...x,ticker:canonical}),originalSymbol:x.ticker,previousSessionClock:positive(x.prevDay?.t)?x.prevDay.t:null};if(bySymbol.has(row.sym)){duplicates++;const prior=bySymbol.get(row.sym);if(fresh(prior.t,now)&&(!fresh(row.t,now)||row.t<=prior.t))continue;}
   bySymbol.set(row.sym,row);
  }
  const rows=[...bySymbol.values()],freshRows=rows.filter(r=>positive(r.price)&&fresh(r.t,now)),ages=rows.filter(r=>positive(r.t)&&r.t<=now).map(r=>(now-r.t)/60000);
  // Persist executable quote clocks separately from last-trade clocks. A fresh
  // last trade never proves that a bid/ask is fresh, or a fill was available.
  const metrics={received:raw.length,uniqueSymbols:rows.length,invalidRows:invalid,duplicateSymbols:duplicates,freshPrices:freshRows.length,freshPricePct:rows.length?100*freshRows.length/rows.length:null,
   freshBidAsk:rows.filter(r=>positive(r.bid)&&positive(r.ask)&&r.ask>=r.bid&&fresh(r.qt,now)).length,unknownPriceClocks:rows.filter(r=>!positive(r.t)).length,futurePriceClocks:rows.filter(r=>r.t>now).length,priceAgeP50Min:q(ages,.5),priceAgeP95Min:q(ages,.95),denominator:'RECEIVED_SYMBOLS; SECURITY_TYPES_AND_TRADABLE_UNIVERSE_UNVERIFIED',previousCloseBasis:'PROVIDER_PREV_DAY; SESSION_IDENTITY_NOT_VERIFIED'};
  if(freshRows.length)state.lastSuccessfulCycle=at;
  let news={provider:'FINNHUB_GENERAL_NEWS',status:'NOT_DUE'},newsRows=[];
  if(state.cycles%5===1){news=env.FINNHUB_KEY?await get('FINNHUB_GENERAL_NEWS',fh+'/news?category=general&token='+encodeURIComponent(env.FINNHUB_KEY),now):{provider:'FINNHUB_GENERAL_NEWS',status:'MISSING_CREDENTIALS'};
   if(news.status==='RESPONSE_OBSERVED'){
    if(!Array.isArray(news.payload)||news.payload.length>1000)news.status='INVALID_SCHEMA';
    else {news.received=news.payload.length;news.rejected=0;for(const x of news.payload){
     if(!object(x)||typeof x.headline!=='string'||!positive(x.datetime)||!Number.isFinite(x.datetime*1000)||x.datetime*1000>now||now-x.datetime*1000>7200000){news.rejected++;continue;}
     const symbols=String(x.related||x.symbol||'').split(',').map(x=>x.trim().toUpperCase()).filter(sym).slice(0,20);
     if(!symbols.length){news.rejected++;continue;}
     for(const symbol of new Set(symbols))newsRows.push({sym:symbol,h:x.headline,t:x.datetime*1000,at,sourceId:String(x.id||createHash('sha256').update(x.headline+'|'+x.datetime).digest('hex'))});
    }}
   }
  }
  const ingress=collectDiscovery({cutoff:at,readText:path=>path==='data/news-log.jsonl'&&newsRows.length?newsRows.map(x=>JSON.stringify(x)).join('\n'):readText(path)});
  const sourceStatus=new Map([['NEWS_CATALYST',news.status==='RESPONSE_OBSERVED'?'HTTP_RESPONSE_OBSERVED':news.status]]);
  // Provider failure is retained alongside file availability; cached/derived
  // adapters are never relabelled live or independent confirmations.
  ingress.sources[0]={lane:'PRE_IGNITION',status:'NOT_APPLICABLE_PREMARKET',rows:0};
  const added=updateDiscovery(state.discovery,{...ingress,rows,cutoff:at});
  const providers=[snapshot,news].map(({payload,...safe})=>safe);
  for(const p of providers){const k=p.provider+':'+p.status;state.sourceCounts[k]=(state.sourceCounts[k]||0)+1;}
  return {kind:'RESEARCH_ONLY',status:freshRows.length?'OBSERVED':'NO_FRESH_PRICES',at,session,metrics,providers,sourceStatus:Object.fromEntries(sourceStatus),lastSuccessfulCycle:state.lastSuccessfulCycle,requests:state.requests,
   quotes:rows,news:newsRows,discovery:{added,sources:ingress.sources,funnel:state.discovery.funnel,priceCoverage:state.discovery.priceCoverage},claims:{approvedBuy:false,orders:false,filledTrades:false,profitability:'NOT_ESTABLISHED'}};
 }
 return {cycle,state,report:cutoff=>discoveryReport(state.discovery,{cutoff,sources:[],completeSession:state.minutes.length===330})};
}
