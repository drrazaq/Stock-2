// Explicit source availability; an unavailable/over-budget response is never empty news.
export const NEWS_SOURCE_LIMITS=Object.freeze({bytes:2097152,rows:20000,timeoutMs:15000});
export async function readNewsSource(fetcher,url,{observedAt=null,timeoutMs=NEWS_SOURCE_LIMITS.timeoutMs}={}) {
 const controller=new AbortController();let reader,timer,requestStartedAt=new Date().toISOString(),headersReceivedAt=null,bodyReceivedAt=null;
 const unavailable=status=>({status,requestStartedAt,headersReceivedAt,bodyReceivedAt,observedAt:observedAt??new Date().toISOString(),rows:null});
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>NEWS_SOURCE_LIMITS.timeoutMs)return unavailable('INVALID_SOURCE_LIMITS');
 if(observedAt!==null&&(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt))))return unavailable('INVALID_OBSERVATION_CLOCK');
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('SOURCE_TIMEOUT'));},timeoutMs);});
 const task=async()=>{
  const r=await fetcher(url,{redirect:'error',signal:controller.signal});headersReceivedAt=new Date().toISOString();
  if(controller.signal.aborted){try{r.body?.cancel()?.catch(()=>{});}catch{}throw Error('SOURCE_TIMEOUT');}
  if(!r.ok){try{r.body?.cancel()?.catch(()=>{});}catch{}return {...unavailable(r.status===429?'RATE_LIMITED':'HTTP_ERROR'),httpStatus:r.status};}
  // Count actual bytes; content-length alone cannot establish or bound the body.
  if(!r.body?.getReader)return unavailable('INVALID_JSON');
  reader=r.body.getReader();const parts=[];let bytes=0;
  for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>NEWS_SOURCE_LIMITS.bytes)return unavailable('BODY_LIMIT');parts.push(Buffer.from(part.value));}
  bodyReceivedAt=new Date().toISOString();const clock=observedAt??bodyReceivedAt;
  let body;try{body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(parts)));}catch{return unavailable('INVALID_JSON');}
  if(!Array.isArray(body))return unavailable('INVALID_SCHEMA');
  if(body.length>NEWS_SOURCE_LIMITS.rows)return {...unavailable('ROW_LIMIT'),received:body.length};
  const rows=body.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)&&typeof x.headline==='string'&&x.headline.trim()&&typeof x.datetime==='number'&&Number.isFinite(x.datetime)&&x.datetime>0&&x.datetime*1000<=Date.parse(clock));
  return {status:rows.length===body.length?'OBSERVED':'PARTIAL',requestStartedAt,headersReceivedAt,bodyReceivedAt,observedAt:clock,received:body.length,rejected:body.length-rows.length,rows};
 };
 try{return await Promise.race([task(),deadline]);}catch(e){return unavailable(e.message==='SOURCE_TIMEOUT'?'TIMEOUT':'NETWORK_ERROR');}
 finally{clearTimeout(timer);controller.abort();try{reader?.cancel()?.catch(()=>{});}catch{}}
}
