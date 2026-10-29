// One bounded observation, not a collector, recommendation engine or order client.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {marketSymbol} from '../market-symbol.mjs';
import {marketSession} from '../market-session.mjs';
export const AUDIT_SYMBOLS=Object.freeze(['AAPL','SPY','MSFT','NVDA','TSLA','AMZN','META','GOOGL','QQQ','IWM','BRK.B','BF.B','F','SNDL','SOFI','PLTR','AMD','INTC','HOOD','GME','AMC','RIVN','SPUS','IAUM']);
export const AUDIT_LIMITS=Object.freeze({requests:11,responseBytes:32*1024*1024,totalBytes:64*1024*1024,wallMs:180000,requestMs:15000,artifactBytes:1024*1024});
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const clock=x=>typeof x==='string'&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const quantile=(xs,p)=>xs.length?[...xs].sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))]:null;
export function auditSession(now){
 const p={};new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).forEach(x=>p[x.type]=x.value);
 const day=`${p.year}-${p.month}-${p.day}`,minute=Number(p.hour)*60+Number(p.minute),s=marketSession(day);
 return {day,minute,state:s.closed?'CLOSED':minute<240?'OVERNIGHT':minute<570?'PREMARKET':minute<s.close?'REGULAR':'POSTMARKET'};
}
function fieldEvidence(x,kind,now){
 const t=clock(x?.t),valid=kind==='trade'?positive(x?.p):positive(x?.bp)&&positive(x?.ap)&&x.ap>=x.bp;
 const age=t===null?null:now-t;
 return {valid,asOf:t===null?null:new Date(t).toISOString(),ageMs:age,fresh:valid&&age!==null&&age>=0&&age<=180000,future:age!==null&&age<0,spreadBps:kind==='quote'&&valid?10000*((x.ap-x.bp)/x.ap)/(0.5+0.5*x.bp/x.ap):null};
}
export function summarizeAlpaca(rows,{kind='snapshot',now,requested=null}={}){
 if(!rows||typeof rows!=='object'||Array.isArray(rows))throw Error('INVALID_MAP');
 if(rows.message||rows.error||rows.code)throw Error('ERROR_SHAPED_MAP');
 const allowed=requested?new Set(requested):null,entries=Object.entries(rows),symbols=new Set(),perSymbol=[];
 const result={received:entries.length,validSymbols:0,invalidSymbols:0,unexpectedSymbols:0,missingRequested:null,trade:{valid:0,fresh:0,unknownClock:0,futureClock:0},quote:{valid:0,fresh:0,unknownClock:0,futureClock:0}};
 const tradeAges=[],quoteAges=[],spreads=[];
 for(const [symbol,row]of entries){
  if(marketSymbol(symbol)!==symbol){result.invalidSymbols++;continue;}
  if(allowed&&!allowed.has(symbol)){result.unexpectedSymbols++;continue;}
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('INVALID_ROW');
  symbols.add(symbol);result.validSymbols++;
  const record={symbol};
  for(const type of ['trade','quote']){
   if(kind!=='snapshot'&&type!==kind)continue;
   const x=kind==='snapshot'?row[type==='trade'?'latestTrade':'latestQuote']:row;
   const e=fieldEvidence(x,type,now);record[type]=e;const c=result[type];
   if(e.valid)c.valid++;if(e.fresh)c.fresh++;if(e.asOf===null)c.unknownClock++;if(e.future)c.futureClock++;
   if(e.valid&&e.ageMs!==null&&e.ageMs>=0)(type==='trade'?tradeAges:quoteAges).push(e.ageMs);
   if(type==='quote'&&e.fresh)spreads.push(e.spreadBps);
  }
  if(allowed)perSymbol.push(record);
 }
 result.missingRequested=allowed?[...allowed].filter(x=>!symbols.has(x)):null;
 for(const [type,ages]of [['trade',tradeAges],['quote',quoteAges]]){
  result[type].ageP50Ms=quantile(ages,.5);result[type].ageP95Ms=quantile(ages,.95);
  result[type].freshPctOfRequested=allowed?100*result[type].fresh/allowed.size:null;
  result[type].freshPctOfReturned=result.validSymbols?100*result[type].fresh/result.validSymbols:null;
 }
 result.freshQuoteSpreadP95Bps=quantile(spreads,.95);
 if(allowed)result.perSymbol=perSymbol;
 return {summary:result,symbols};
}
async function boundedJson(response,budget,signal){
 const length=response.headers?.get?.('content-length');if(length&&Number(length)>AUDIT_LIMITS.responseBytes){await response.body?.cancel?.();throw Error('BYTE_LIMIT');}
 const reader=response.body?.getReader?.();if(!reader)throw Error('NO_BOUNDED_BODY');
 let bytes=0;const chunks=[];
 try{while(true){if(signal.aborted)throw Error('TIMEOUT');const r=await reader.read();if(r.done)break;bytes+=r.value.byteLength;budget.bytes+=r.value.byteLength;if(bytes>AUDIT_LIMITS.responseBytes||budget.bytes>AUDIT_LIMITS.totalBytes)throw Error('BYTE_LIMIT');chunks.push(r.value);}}
 finally{await reader.cancel().catch(()=>{});}
 return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function auditAlpaca({env={},fetcher=fetch,now=()=>Date.now()}={}){
 const began=now(),budget={requests:0,bytes:0},results=[],blocked=new Set(),universe={},broad={};let stop=null;
 const headers={'APCA-API-KEY-ID':env.ALPACA_KEY,'APCA-API-SECRET-KEY':env.ALPACA_SECRET};
 const request=async(id,path,feed,scope,decode,{origin='https://data.alpaca.markets'}={})=>{
  if(!env.ALPACA_KEY||!env.ALPACA_SECRET){results.push({id,status:'NOT_CONFIGURED'});return;}
  if(stop||blocked.has(feed)){results.push({id,status:'SKIPPED',reason:stop||'FEED_REFUSED'});return;}
  if(budget.requests>=AUDIT_LIMITS.requests||now()-began>=AUDIT_LIMITS.wallMs){stop='BUDGET_EXHAUSTED';results.push({id,status:'SKIPPED',reason:stop});return;}
  const started=now(),signal=AbortSignal.timeout(AUDIT_LIMITS.requestMs);budget.requests++;
  const record={id,feed,scope,requestedAt:new Date(started).toISOString()};
  try{
   const r=await fetcher(origin+path,{method:'GET',headers,redirect:'error',signal});
   record.httpStatus=r.status;record.responseAt=new Date(now()).toISOString();
   record.rateLimit=Object.fromEntries(['limit','remaining','reset'].map(k=>{const v=r.headers?.get?.('x-ratelimit-'+k);return [k,v&&/^\d{1,16}$/.test(v)?Number(v):null];}));
   if(!r.ok){record.status='HTTP_REFUSED';if(r.status===429||r.status===401)stop='HTTP_'+r.status;if(r.status===403)blocked.add(feed);await r.body?.cancel?.();}
   else{const body=await boundedJson(r,budget,signal);decode(body,record,now());record.status='OBSERVED';}
  }catch(e){record.status='FAILED';record.reason=['BYTE_LIMIT','NO_BOUNDED_BODY','TIMEOUT'].includes(e.message)?e.message:'NETWORK_OR_SCHEMA_ERROR';if(record.reason==='BYTE_LIMIT')stop='BYTE_LIMIT';}
  record.latencyMs=now()-started;results.push(record);
 };
 const symbolQuery=AUDIT_SYMBOLS.map(encodeURIComponent).join(',');
 for(const feed of ['sip','iex']){
  for(const kind of ['snapshot','trade','quote']){
   const endpoint=kind==='snapshot'?'snapshots':kind==='trade'?'trades/latest':'quotes/latest';
   await request(`${feed}_${kind}`,`/v2/stocks/${endpoint}?feed=${feed}&symbols=${symbolQuery}`,feed,'FIXED_24_SYMBOL_SAMPLE',(j,r,at)=>{const rows=kind==='snapshot'?j:j[kind==='trade'?'trades':'quotes'];r.measurements=summarizeAlpaca(rows,{kind,now:at,requested:AUDIT_SYMBOLS}).summary;});
  }
  await request(`${feed}_broad_snapshot`,`/v2/stocks/snapshots?feed=${feed}`,feed,'ALL_RETURNED_SNAPSHOT_REQUEST_NOT_ASSUMED_COMPLETE',(j,r,at)=>{const v=summarizeAlpaca(j,{now:at});r.measurements=v.summary;broad[feed]=v.symbols;});
 }
 await request('active_assets','/v2/assets?status=active&asset_class=us_equity','assets','ACTIVE_ASSET_REFERENCE_NOT_HISTORICAL_UNIVERSE',(j,r)=>{
  if(!Array.isArray(j))throw Error('INVALID_ASSETS');const active=new Set(),tradable=new Set();let invalid=0;
  for(const x of j){if(!x||marketSymbol(x.symbol)!==x.symbol||x.status!=='active'||x.class!=='us_equity'){invalid++;continue;}active.add(x.symbol);if(x.tradable===true)tradable.add(x.symbol);}
  universe.active=active;universe.tradable=tradable;r.measurements={rows:j.length,activeValidSymbols:active.size,tradableValidSymbols:tradable.size,invalidOrOutOfScope:invalid};
 },{origin:'https://paper-api.alpaca.markets'});
 const end=new Date(began).toISOString(),start=new Date(began-300000).toISOString();
 for(const kind of ['trades','quotes'])await request(`sip_recent_${kind}`,`/v2/stocks/${kind}?feed=sip&symbols=AAPL,SPY&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&limit=1000&sort=asc`,'sip','FIVE_MINUTE_AAPL_SPY_ONE_PAGE',(j,r)=>{
  if(!j||!j[kind]||typeof j[kind]!=='object'||Array.isArray(j[kind]))throw Error('INVALID_HISTORY');let records=0,validClocks=0;for(const [sym,rows]of Object.entries(j[kind])){if(!['AAPL','SPY'].includes(sym)||!Array.isArray(rows))throw Error('INVALID_HISTORY');for(const x of rows){records++;const t=clock(x?.t);if(t!==null&&t>=began-300000&&t<=began)validClocks++;}}
  r.measurements={records,clocksWithinRequestedWindow:validClocks,hasMore:typeof j.next_page_token==='string'&&j.next_page_token.length>0,pageLimit:1000,pagesFetched:1,completeCoverage:false};
 });
 const coverage={};for(const [feed,syms]of Object.entries(broad)){coverage[feed]={returnedValidSymbols:syms.size,activeReferenceAvailable:!!universe.active,tradableReferenceAvailable:!!universe.tradable};for(const k of ['active','tradable'])if(universe[k]){const common=[...universe[k]].filter(s=>syms.has(s)).length;Object.assign(coverage[feed],{[k+'Reference']:universe[k].size,[k+'Returned']:common,[k+'Missing']:universe[k].size-common});}}
 const finished=now();return {kind:'BOUNDED_ALPACA_ACCESS_AUDIT_V1',sourceSha:env.GITHUB_SHA||null,startedAt:new Date(began).toISOString(),finishedAt:new Date(finished).toISOString(),session:auditSession(began),limits:AUDIT_LIMITS,budget,stopReason:stop,results,coverage,claims:{accountPlan:'NOT_INFERRED',entitlement:'ENDPOINT_AND_TIME_SPECIFIC_HTTP_OBSERVATIONS_ONLY',wholeMarketRealTimeDiscovery:'NOT_ESTABLISHED',fullSessionReliability:'NOT_ESTABLISHED',fills:'NOT_TESTED',profitability:'NOT_TESTED'},notes:['Independent trade/quote clocks; fresh means valid nonfuture clock at most180seconds old at receipt.','All-symbol request may be refused or incomplete. Active/tradable asset list is a current reference, not proof of historical or real-time universe completeness.','Single endpoint latency and reported rate-limit headers do not prove sustained throughput. No stress test, retries, pagination, orders or Telegram.','Fixed sample is not statistically representative. Missing symbols remain in the requested denominator.']};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.GITHUB_ACTIONS&&(process.env.GITHUB_REF_NAME!=='Stock2-safety-fixes'||process.env.GITHUB_EVENT_NAME!=='push'))throw Error('AUDIT_BRANCH_EVENT_REFUSED');
 const at=Date.now();if(at<Date.parse('2026-10-29T11:40:00Z')||at>=Date.parse('2026-10-29T13:00:00Z'))throw Error('AUDIT_WINDOW_EXPIRED');
 const r=await auditAlpaca({env:process.env}),out=JSON.stringify(r,null,2);if(Buffer.byteLength(out)>AUDIT_LIMITS.artifactBytes)throw Error('ARTIFACT_LIMIT');
 fs.mkdirSync('probe-output',{recursive:true});fs.writeFileSync('probe-output/alpaca-access-audit.json',out);console.log(out);
}
