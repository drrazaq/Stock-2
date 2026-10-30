// Read-only branch diagnostic: fixed GET endpoints, no orders/messages, no raw
// responses/URLs/credentials in output. Existing account access only; no retries.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {massiveSnapshot,alpacaSnapshot} from '../snapshot-fields.mjs';
import {marketSymbol} from '../market-symbol.mjs';
import {marketSession} from '../market-session.mjs';
const numeric=x=>typeof x==='string'&&/^\d+$/.test(x)?Number(x):null;
export async function probeProviders({env={},fetcher=fetch,now=Date.now()}={}) {
 const results=[];
 const get=async(provider,url,headers,decode)=>{
  const started=Date.now();
  try{
   const r=await fetcher(url,{method:'GET',headers,redirect:'error',signal:AbortSignal.timeout(15000)});
   const base={provider,httpStatus:r.status,latencyMs:Date.now()-started,rateLimit:{limit:numeric(r.headers?.get?.('x-ratelimit-limit')),remaining:numeric(r.headers?.get?.('x-ratelimit-remaining')),reset:numeric(r.headers?.get?.('x-ratelimit-reset'))}};
   if(!r.ok)return {...base,status:'HTTP_REFUSED'};
   const summary=decode(await r.json());return {...base,status:'RESPONSE_OBSERVED',...summary};
  }catch{return {provider,status:'NETWORK_OR_PARSE_ERROR',latencyMs:Date.now()-started};}
 };
 const fieldStats=(rows,value,clock)=>{
  const valid=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
  const known=rows.filter(r=>valid(r[clock]));
  const ages=known.filter(r=>r[clock]<=now).map(r=>(now-r[clock])/60000).sort((a,b)=>a-b);
  const fresh=rows.filter(r=>value(r)&&valid(r[clock])&&now-r[clock]>=0&&now-r[clock]<=180000).length;
  return {fresh,unknownTimestamp:rows.length-known.length,futureTimestamp:known.filter(r=>r[clock]>now).length,
   freshPct:rows.length?+(100*fresh/rows.length).toFixed(2):null,
   ageP95Min:ages.length?ages[Math.min(ages.length-1,Math.floor(ages.length*.95))]:null};
 };
 const quoteStats=rows=>{
  const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
  const price=fieldStats(rows,r=>positive(r.price),'t');
  const bbo=fieldStats(rows,r=>positive(r.bid)&&positive(r.ask)&&r.ask>=r.bid,'qt');
  const volume=fieldStats(rows,r=>positive(r.vol),'vt');
  return {received:rows.length,fresh:price.fresh,unknownTimestamp:price.unknownTimestamp,
   futureTimestamp:price.futureTimestamp,freshPct:price.freshPct,priceAgeP95Min:price.ageP95Min,
   fields:{price,bbo,volume},freshnessWindowMs:180000};
 };
 const snapshotKeys=['latestTrade','latestQuote','minuteBar','dailyBar','prevDailyBar'];
 const requested=['AAPL','SPY','BRK.B'];
 const alpacaRows=(j,feed)=>{
  if(!j||typeof j!=='object'||Array.isArray(j)||j.message||j.error)throw Error();
  const entries=Object.entries(j);
  if(entries.some(([sym,x])=>!requested.includes(sym)||!x||typeof x!=='object'||Array.isArray(x)||!snapshotKeys.some(k=>Object.hasOwn(x,k))||snapshotKeys.some(k=>Object.hasOwn(x,k)&&x[k]!==null&&(typeof x[k]!=='object'||Array.isArray(x[k])))))throw Error();
  return {...quoteStats(entries.map(([sym,x])=>alpacaSnapshot(sym,x,feed==='sip'))),
   requestedSymbols:requested.length,missingSymbols:requested.filter(sym=>!Object.hasOwn(j,sym)),
   scope:'TARGETED_DIAGNOSTIC_NOT_WHOLE_MARKET',access:entries.length?'SNAPSHOT_ROWS_OBSERVED':'NO_SNAPSHOT_ROWS'};
 };
 if(env.MASSIVE_KEY)results.push(await get('MASSIVE_SNAPSHOT','https://api.massive.com/v2/snapshot/locale/us/markets/stocks/tickers?apiKey='+encodeURIComponent(env.MASSIVE_KEY),{},j=>{if(!j||!Array.isArray(j.tickers))throw Error();const seen=new Set();let invalidSymbols=0,duplicateSymbols=0;const rows=[];for(const x of j.tickers){if(!x||typeof x!=='object'||Array.isArray(x)||typeof x.ticker!=='string'||marketSymbol(x.ticker)!==x.ticker){invalidSymbols++;continue;}if(seen.has(x.ticker)){duplicateSymbols++;continue;}seen.add(x.ticker);rows.push(massiveSnapshot(x));}return {...quoteStats(rows),receivedRaw:j.tickers.length,invalidSymbols,duplicateSymbols};}));
 else results.push({provider:'MASSIVE_SNAPSHOT',status:'NOT_CONFIGURED'});
 if(env.ALPACA_KEY&&env.ALPACA_SECRET){
  const headers={'APCA-API-KEY-ID':env.ALPACA_KEY,'APCA-API-SECRET-KEY':env.ALPACA_SECRET};
  for(const feed of ['sip','iex']){
   if(results.some(x=>x.provider.startsWith('ALPACA_')&&x.httpStatus===429)){results.push({provider:'ALPACA_'+feed.toUpperCase(),status:'SKIPPED_RATE_LIMIT'});continue;}
   results.push(await get('ALPACA_'+feed.toUpperCase(),'https://data.alpaca.markets/v2/stocks/snapshots?feed='+feed+'&symbols=AAPL,SPY,BRK.B',headers,j=>alpacaRows(j,feed)));
  }
 }else for(const feed of ['SIP','IEX'])results.push({provider:'ALPACA_'+feed,status:'NOT_CONFIGURED'});
 if(env.FINNHUB_KEY)results.push(await get('FINNHUB_GENERAL_NEWS','https://finnhub.io/api/v1/news?category=general&token='+encodeURIComponent(env.FINNHUB_KEY),{},j=>{if(!Array.isArray(j))throw Error();return {records:j.length,knownPublicationTimestamp:j.filter(x=>typeof x.datetime==='number'&&Number.isFinite(x.datetime)).length};}));
 else results.push({provider:'FINNHUB_GENERAL_NEWS',status:'NOT_CONFIGURED'});
 results.push(await get('SEC_TICKER_MAP','https://www.sec.gov/files/company_tickers.json',{'User-Agent':env.SEC_UA||'Stock2 engineering admin@users.noreply.github.com'},j=>{if(!j||typeof j!=='object'||Array.isArray(j))throw Error();return {records:Object.keys(j).length};}));
 const p={};new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).forEach(x=>p[x.type]=x.value);
 const day=p.year+'-'+p.month+'-'+p.day,minute=Number(p.hour)*60+Number(p.minute),schedule=marketSession(day);
 const session={day,minute,state:schedule.closed?'CLOSED':minute<240?'OVERNIGHT':minute<570?'PREMARKET':minute<schedule.close?'REGULAR':'POSTMARKET'};
 return {kind:'READ_ONLY_PROVIDER_PROBE',observedAt:new Date(now).toISOString(),session,results,claims:{accountPlan:'NOT_INFERRED',tradableUniverseCoverage:'NOT_ESTABLISHED',executionFills:'NOT_TESTED',profitability:'NOT_TESTED'},note:'HTTP status/targeted freshness are observations, not evidence of full-session or premarket entitlement. Outside-session old trades do not alone establish an outage. No raw payloads or credentials retained.'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.GITHUB_ACTIONS&&process.env.GITHUB_REF_NAME!=='Stock2-safety-fixes')throw Error('provider probe restricted to development branch');
 const report=await probeProviders({env:process.env});fs.mkdirSync('probe-output',{recursive:true});fs.writeFileSync('probe-output/provider-readiness.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}

