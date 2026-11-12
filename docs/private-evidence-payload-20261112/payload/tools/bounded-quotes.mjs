// Finite transport adapter over the unchanged reviewed snapshots client.
import {snapshots,resetFeed,feedEvidence} from '../alpaca-feed.mjs';
import {performance} from 'node:perf_hooks';
const allowed=['https://data.alpaca.markets/v2/stocks/snapshots?feed=sip&symbols=TWLO,COST','https://data.alpaca.markets/v2/stocks/snapshots?feed=iex&symbols=TWLO,COST'];
export function boundedQuoteFetcher({fetcher=fetch,monotonic=()=>performance.now(),perRequestMs=10000,phaseMs=30000}={}){
 const started=monotonic();let calls=0,total=0,lastStatus=null,stopped=false;
 const bounded=async(url,opts={})=>{
  const elapsed=monotonic()-started;
  if(stopped||elapsed<0||elapsed>=phaseMs||calls>=2||url!==allowed[calls]||calls===1&&lastStatus!==403||opts.method!=='GET'||opts.redirect!=='error')throw Error('QUOTE_REQUEST_SCOPE_OR_DEADLINE');
  calls++;lastStatus=null;
  const controller=new AbortController(),remaining=Math.min(perRequestMs,phaseMs-elapsed);
  const timer=setTimeout(()=>controller.abort(),remaining);
  let response,reader;
  try{
   response=await fetcher(url,{...opts,signal:opts.signal?AbortSignal.any([opts.signal,controller.signal]):controller.signal});
   if(response.redirected||!Number.isInteger(response.status))throw Error('QUOTE_RESPONSE');
   const encoding=response.headers?.get('content-encoding');if(encoding&&encoding!=='identity')throw Error('QUOTE_ENCODING');
   const length=response.headers?.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>1048576))throw Error('QUOTE_BODY_CAP');
   const chunks=[];let bytes=0;reader=response.body?.getReader();
   if(reader)for(;;){
    const {done,value}=await reader.read();if(done)break;
    bytes+=value.byteLength;total+=value.byteLength;
    if(bytes>1048576||total>2097152||monotonic()-started>=phaseMs)throw Error('QUOTE_BODY_OR_PHASE_CAP');
    chunks.push(Buffer.from(value));
   }
   if(controller.signal.aborted||monotonic()-started>=phaseMs)throw Error('QUOTE_TIMEOUT');
   lastStatus=response.status;
   const raw=Buffer.concat(chunks);
   return {ok:response.ok,status:response.status,headers:response.headers,json:async()=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw))};
  }catch{stopped=true;controller.abort();try{await reader?.cancel();}catch{}throw Error('BOUNDED_QUOTE_TRANSPORT_STOP');}
  finally{clearTimeout(timer);}
 };
 return {fetch:bounded,report:()=>({calls,bodyBytes:total,stopped,phaseElapsedMs:monotonic()-started})};
}
export async function captureTwoQuotes({headers,onReceipt,fetcher,monotonic}={}){
 // External feed preferences are not allowed to alter this one-run contract.
 if(process.env.ALPACA_FEED)throw Error('QUOTE_FEED_OVERRIDE_FORBIDDEN');
 resetFeed();const bounded=boundedQuoteFetcher({fetcher,monotonic});
 const payload=await snapshots('https://data.alpaca.markets',['TWLO','COST'],{headers},bounded.fetch,onReceipt);
 return {payload,transport:bounded.report(),feed:feedEvidence()};
}
