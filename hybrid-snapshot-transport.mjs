// Explicitly injected GET transport. No default fetch, CLI, secrets lookup,
// broker mutation, feed fallback, retry or collection activation.
import {marketSymbol} from './market-symbol.mjs';
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
export function createHybridSnapshotTransport({fetcher,credentials={},now=Date.now,limits={},origin='https://data.alpaca.markets',resume=null}={}){
 if(typeof fetcher!=='function'||typeof now!=='function')throw Error('EXPLICIT_TRANSPORT_REQUIRED');
 const cap={maxRequests:420,requestsPerMinute:80,maxBatchSymbols:200,maxResponseBytes:8*1024*1024,maxTotalBytes:64*1024*1024,maxDurationMs:60000,requestTimeoutMs:10000,...limits};
 if(!object(limits)||Object.keys(limits).some(k=>!['maxRequests','requestsPerMinute','maxBatchSymbols','maxResponseBytes','maxTotalBytes','maxDurationMs','requestTimeoutMs'].includes(k))||!object(credentials))throw Error('INVALID_TRANSPORT_CONFIGURATION');
 for(const [k,min,max]of [['maxRequests',1,30000],['requestsPerMinute',1,1000],['maxBatchSymbols',1,200],['maxResponseBytes',1,32*1024*1024],['maxTotalBytes',1,1024*1024*1024],['maxDurationMs',1,21600000],['requestTimeoutMs',1,60000]])if(!integer(cap[k],min,max))throw Error('INVALID_TRANSPORT_LIMIT');
 if(cap.maxResponseBytes>cap.maxTotalBytes||cap.requestTimeoutMs>cap.maxDurationMs)throw Error('INVALID_TRANSPORT_LIMIT');
 const u=new URL(origin);if(!(u.origin==='https://data.alpaca.markets'||u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname))||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error('INVALID_DATA_ORIGIN');
 const observed=now(),start=resume?Date.parse(resume.startedAt):observed;if(!integer(start,0,8640000000000000)||!integer(observed,0,8640000000000000))throw Error('INVALID_TRANSPORT_CLOCK');
 const state={startedAt:new Date(start).toISOString(),requests:0,bytes:0,lastClock:start,bucket:Math.floor(start/60000),bucketRequests:0,halted:null,statuses:{}};let busy=false,activeCancel=null;
 if(resume){
  if(!object(resume)||resume.kind!=='BOUNDED_RESEARCH_TRANSPORT'||JSON.stringify(resume.limits)!==JSON.stringify(cap)||!integer(resume.requests,0,cap.maxRequests)||!integer(resume.bytes,0,cap.maxTotalBytes)||!integer(resume.lastClock,start,observed)||!integer(resume.bucket,0,Math.floor(observed/60000))||!integer(resume.bucketRequests,0,cap.requestsPerMinute)||resume.bucketRequests>resume.requests||!object(resume.statuses)||Object.values(resume.statuses).some(v=>!integer(v,0,resume.requests))||Object.values(resume.statuses).reduce((a,v)=>a+v,0)!==resume.requests||!(resume.halted===null||['CANCELLED','CLOCK_REGRESSED_OR_INVALID','DEADLINE_EXCEEDED','REQUEST_BUDGET_EXHAUSTED','TOTAL_BYTE_BUDGET','RESPONSE_BYTE_BUDGET','REQUEST_TIMEOUT','RATE_LIMITED','ACCESS_REFUSED','AUTHENTICATION_REFUSED'].includes(resume.halted)))throw Error('INVALID_TRANSPORT_RESUME');
  for(const k of ['requests','bytes','lastClock','bucket','bucketRequests','halted','statuses'])state[k]=structuredClone(resume[k]);
 }
 const halt=reason=>{state.halted||=reason;return {status:'BLOCKED',reason:state.halted};};
 const tick=()=>{const t=now();if(!integer(t,0,8640000000000000)||t<state.lastClock){halt('CLOCK_REGRESSED_OR_INVALID');return null;}state.lastClock=t;return t;};
 const cancel=()=>{const result=halt('CANCELLED');activeCancel?.();return result;};
 async function snapshots(symbols,{feed='sip',signal}={}){
  if(state.halted)return {status:'BLOCKED',reason:state.halted};if(busy)return {status:'BUSY'};
  if(!Array.isArray(symbols)||!symbols.length||symbols.length>cap.maxBatchSymbols||symbols.some(s=>typeof s!=='string'||marketSymbol(s)!==s)||new Set(symbols).size!==symbols.length||!['sip','iex'].includes(feed))return {status:'INVALID_SCOPE'};
  if(typeof credentials.key!=='string'||!credentials.key||typeof credentials.secret!=='string'||!credentials.secret)return {status:'NOT_CONFIGURED'};
  const began=tick();if(began===null)return halt('CLOCK_REGRESSED_OR_INVALID');
  if(signal?.aborted)return halt('CANCELLED');if(began-start>=cap.maxDurationMs)return halt('DEADLINE_EXCEEDED');if(state.requests>=cap.maxRequests)return halt('REQUEST_BUDGET_EXHAUSTED');
  if(state.bytes>=cap.maxTotalBytes)return halt('TOTAL_BYTE_BUDGET');
  const bucket=Math.floor(began/60000);if(bucket!==state.bucket){state.bucket=bucket;state.bucketRequests=0;}
  if(state.bucketRequests>=cap.requestsPerMinute)return {status:'PACED',retryAt:new Date((bucket+1)*60000).toISOString()};
  const controller=new AbortController(),remaining=Math.min(cap.requestTimeoutMs,cap.maxDurationMs-(began-start));let timer,abortListener,reader;
  const result={feed,requestedAt:new Date(began).toISOString(),receivedAt:null,httpStatus:null,status:'FAILED'};
  state.requests++;state.bucketRequests++;busy=true;
  const work=async()=>{
   const r=await fetcher(u.origin+'/v2/stocks/snapshots?feed='+feed+'&symbols='+symbols.map(encodeURIComponent).join(','),{method:'GET',redirect:'error',headers:{'APCA-API-KEY-ID':credentials.key,'APCA-API-SECRET-KEY':credentials.secret},signal:controller.signal});
   if(controller.signal.aborted){await r.body?.cancel?.().catch(()=>{});throw Error('CANCELLED');}
   result.httpStatus=r.status;
   if([401,403,429].includes(r.status)){halt(r.status===429?'RATE_LIMITED':r.status===403?'ACCESS_REFUSED':'AUTHENTICATION_REFUSED');await r.body?.cancel?.();result.status='HTTP_REFUSED';return;}
   if(!r.ok){await r.body?.cancel?.();result.status='HTTP_ERROR';return;}
   const length=r.headers?.get?.('content-length');if(length&&Number(length)>cap.maxResponseBytes){await r.body?.cancel?.();halt('RESPONSE_BYTE_BUDGET');throw Error('RESPONSE_BYTE_BUDGET');}
   reader=r.body?.getReader?.();if(!reader)throw Error('UNBOUNDED_BODY_REFUSED');
   const chunks=[];let size=0;
   while(true){const c=await reader.read();if(controller.signal.aborted||state.halted)throw Error('CANCELLED');if(c.done)break;size+=c.value.byteLength;state.bytes+=c.value.byteLength;
    if(size>cap.maxResponseBytes||state.bytes>cap.maxTotalBytes){halt(size>cap.maxResponseBytes?'RESPONSE_BYTE_BUDGET':'TOTAL_BYTE_BUDGET');throw Error('BYTE_BUDGET');}chunks.push(c.value);
   }
   const payload=JSON.parse(Buffer.concat(chunks).toString('utf8')),requested=new Set(symbols);
   if(!object(payload)||payload.message||payload.error||Object.entries(payload).some(([s,row])=>!requested.has(s)||!object(row)||!['latestTrade','latestQuote','dailyBar','prevDailyBar','minuteBar'].some(k=>Object.hasOwn(row,k))||['latestTrade','latestQuote','dailyBar','prevDailyBar','minuteBar'].some(k=>row[k]!==undefined&&row[k]!==null&&!object(row[k]))))throw Error('INVALID_SNAPSHOT_SCHEMA');
   result.rows=payload;result.status='RESPONSE_OBSERVED';
  };
  try{
   const aborted=new Promise((_,reject)=>{
    abortListener=()=>{halt('CANCELLED');controller.abort();reject(Error('CANCELLED'));};activeCancel=abortListener;signal?.addEventListener('abort',abortListener,{once:true});
    timer=setTimeout(()=>{halt('REQUEST_TIMEOUT');controller.abort();reject(Error('REQUEST_TIMEOUT'));},remaining);
   });
   await Promise.race([work(),aborted]);
   const ended=tick();if(ended===null||ended-start>=cap.maxDurationMs){delete result.rows;result.status='FAILED';halt('DEADLINE_EXCEEDED');}
   result.receivedAt=ended===null?null:new Date(ended).toISOString();
  }catch{delete result.rows;result.status='FAILED';result.reason=state.halted||'NETWORK_OR_SCHEMA_ERROR';const t=tick();result.receivedAt=t===null?null:new Date(t).toISOString();}
  finally{clearTimeout(timer);signal?.removeEventListener('abort',abortListener);activeCancel=null;controller.abort();if(reader)void reader.cancel().catch(()=>{});busy=false;}
  const key=feed+':'+(result.httpStatus??result.reason??result.status);state.statuses[key]=(state.statuses[key]||0)+1;
  if(state.halted)result.halted=state.halted;return result;
 }
 return {snapshots,cancel,report:()=>({kind:'BOUNDED_RESEARCH_TRANSPORT',...structuredClone(state),limits:{...cap},credentialsStoredInReport:false,orders:false,approvedBuy:false})};
}
