import {marketSymbol} from './market-symbol.mjs';
// Request preference never substitutes for provenance of a different response.
let preferred=null,observed=new Set(),metadata=new WeakMap(),cooldownUntil=0,evidence={requests:0,statuses:{},lastFailure:null,invalidSymbolInputs:0,requestedSymbolAttempts:0};
export const resetFeed=()=>{preferred=null;observed=new Set();metadata=new WeakMap();cooldownUntil=0;evidence={requests:0,statuses:{},lastFailure:null,invalidSymbolInputs:0,requestedSymbolAttempts:0};};
export const feedUsed=()=>observed.size>1?'mixed':[...observed][0]||'unobserved';
export const snapshotFeed=payload=>payload&&typeof payload==='object'?metadata.get(payload)||'unknown':'unknown';
export const feedEvidence=()=>structuredClone(evidence);
export async function snapshots(base,syms,opts={},fetcher=fetch) {
 let u;try{u=new URL(base);}catch{evidence.lastFailure='INVALID_PROVIDER_BASE';return null;}
 if(!(u.origin==='https://data.alpaca.markets'||u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname))||u.pathname!=='/'||u.search||u.hash||u.username||u.password){evidence.lastFailure='INVALID_PROVIDER_BASE';return null;}
 if(!Array.isArray(syms)||!syms.length){evidence.lastFailure='INVALID_SYMBOL_SCOPE';return null;}
 const valid=syms.filter(x=>typeof x==='string'&&marketSymbol(x)===x);evidence.invalidSymbolInputs+=syms.length-valid.length;
 syms=[...new Set(valid)];if(!syms.length){evidence.lastFailure='INVALID_SYMBOL_SCOPE';return null;}base=u.origin;const requestedSymbols=new Set(syms);
 const forced=process.env.ALPACA_FEED;
 if(Date.now()<cooldownUntil){evidence.lastFailure='RATE_LIMIT_COOLDOWN';return null;}
 if(forced&&!['sip','iex'].includes(forced)){evidence.lastFailure='INVALID_FEED_CONFIGURATION';return null;}
 const ask=async feed=>{
  let response;evidence.requests++;evidence.requestedSymbolAttempts+=syms.length;
  try{response=await fetcher(base+'/v2/stocks/snapshots?feed='+feed+'&symbols='+syms.map(encodeURIComponent).join(','),{...opts,method:'GET',redirect:'error',signal:opts.signal||AbortSignal.timeout(10000)});}
  catch{evidence.lastFailure='NETWORK_ERROR';const k=feed+':NETWORK_ERROR';evidence.statuses[k]=(evidence.statuses[k]||0)+1;return {status:null};}
  const key=feed+':'+response.status;evidence.statuses[key]=(evidence.statuses[key]||0)+1;
  const header=name=>response.headers?.get?.(name);
  evidence.rateLimit={limit:header('x-ratelimit-limit')||null,remaining:header('x-ratelimit-remaining')||null,reset:header('x-ratelimit-reset')||null};
  if(response.status===429){const raw=header('retry-after'),seconds=raw&&/^\d+$/.test(raw)?Math.min(Number(raw),86400):null;const until=seconds!==null?Date.now()+seconds*1000:Date.parse(raw);cooldownUntil=Number.isFinite(until)&&until>Date.now()?until:Date.now()+60000;evidence.cooldownUntil=new Date(cooldownUntil).toISOString();}
  if(!response.ok){evidence.lastFailure='HTTP_'+response.status;return {status:response.status};}
  try{
   const payload=await response.json();
   if(!payload||typeof payload!=='object'||Array.isArray(payload)||payload.error||payload.message)throw Error('invalid snapshot map');
   if(Object.entries(payload).some(([symbol,row])=>!requestedSymbols.has(symbol)||!row||typeof row!=='object'||Array.isArray(row)||!['latestTrade','latestQuote','minuteBar','dailyBar','prevDailyBar'].some(k=>Object.hasOwn(row,k))))throw Error('invalid symbol snapshot');
   metadata.set(payload,feed);observed.add(feed);return {payload,status:response.status};
  }catch{evidence.lastFailure='INVALID_SNAPSHOT_JSON';return {status:response.status};}
 };
 const requested=forced||preferred||'sip',result=await ask(requested);
 if(result.payload)return result.payload;
 // 422 can mean invalid parameters, not entitlement. 403 is a coverage
 // downgrade, not evidence of a particular subscription. 429 is never retried here.
 if(requested==='sip'&&result.status===403&&forced!=='sip'){
  preferred='iex';return (await ask('iex')).payload||null;
 }
 return null;
}
