// INACTIVE SIP-access diagnostic. No ambient fetch, credentials, messages, orders or strategy inputs.
// Application traffic only: exactly the seven fixed GET slots below; no retries or pagination followups.
export const LIMITS=Object.freeze({requests:7,bodyBytes:131072,totalBytes:917504,reportBytes:16384,requestMs:10000,wallMs:180000,repeatMs:90000});
export const DIAGNOSTIC_TIMING=Object.freeze({earlyStartMs:600000,latestStartMs:30000,runnerMs:790000,shutdownMs:10000});
const ORIGIN='https://data.alpaca.markets',SYMBOLS='SPY,AAPL';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const fail=code=>{throw Object.assign(Error(code),{code});};
const jsonBytes=x=>new TextEncoder().encode(JSON.stringify(x)).length;
function instant(s){
 if(typeof s!=='string'||!/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?Z$/.test(s))return null;
 const d=new Date(s.slice(0,10)+'T00:00:00Z'),n=Date.parse(s);
 return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s.slice(0,10)&&Number.isFinite(n)?n:null;
}
const nyDay=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(t));
export function validatePlan(p){
 if(!p||p.kind!=='SIP_ACCESS_SAMPLE_V1'||p.approved!==false||p.symbols?.join(',')!==SYMBOLS||Object.keys(LIMITS).some(k=>p.limits?.[k]!==LIMITS[k]))fail('INVALID_PLAN');
 const t=instant(p.t0),prev=instant(p.previousSession+'T00:00:00Z');
 if(t===null||prev===null||nyDay(t)!==p.sessionDay||!(p.previousSession<p.sessionDay))fail('INVALID_PLAN');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/New_York',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
 const minute=+parts.hour*60+ +parts.minute;
 if([0,6].includes(new Date(t).getUTCDay())||minute<575||minute>945||t%60000)fail('INVALID_PLAN');
 return {t0:t,deadline:t+LIMITS.wallMs};
}

export async function waitDiagnosticStart(plan,{now,monotonic,wait,signal}){
 const {t0,deadline}=validatePlan(plan);let last=now(),mono=monotonic();
 if(!finite(last)||!finite(mono))fail('CLOCK');
 if(last<t0-DIAGNOSTIC_TIMING.earlyStartMs)fail('START_TOO_EARLY');
 if(last>t0+DIAGNOSTIC_TIMING.latestStartMs)fail('START_TOO_LATE');
 const began=mono;
 if(signal?.aborted)fail(signal.reason==='DEADLINE'?'DEADLINE':'INTERRUPTED');
 while(last<t0){
  if(signal?.aborted)fail(signal.reason==='DEADLINE'?'DEADLINE':'INTERRUPTED');
  await wait(Math.min(1000,t0-last));
  const n=now(),m=monotonic();if(!finite(n)||n<last||!finite(m)||m<mono)fail('CLOCK');last=n;mono=m;
  if(m-began>DIAGNOSTIC_TIMING.earlyStartMs+DIAGNOSTIC_TIMING.shutdownMs)fail('DEADLINE');
 }
 if(signal?.aborted)fail(signal.reason==='DEADLINE'?'DEADLINE':'INTERRUPTED');
 if(last>t0+DIAGNOSTIC_TIMING.latestStartMs)fail('START_TOO_LATE');
 return {t0,deadline};
}

function route(path,params){return ORIGIN+path+'?'+Object.entries(params).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&');}
export function requestsFor(p){
 const {t0}=validatePlan(p),closed=new Date(t0-1).toISOString(),start=new Date(t0-5*60000).toISOString();
 const bars={symbols:SYMBOLS,timeframe:'1Min',start,end:closed,feed:'sip',adjustment:'raw',limit:10000,sort:'asc'};
 return [
 {id:'snapshots',url:route('/v2/stocks/snapshots',{symbols:SYMBOLS,feed:'sip'})},
 {id:'quotes',url:route('/v2/stocks/quotes/latest',{symbols:SYMBOLS,feed:'sip'})},
 {id:'trades-latest',url:route('/v2/stocks/trades/latest',{symbols:SYMBOLS,feed:'sip'})},
 {id:'bars-initial',url:route('/v2/stocks/bars',bars)},
 {id:'bars-repeat',url:route('/v2/stocks/bars',bars),due:t0+LIMITS.repeatMs},
 {id:'prior-daily',url:route('/v2/stocks/bars',{symbols:SYMBOLS,timeframe:'1Day',start:p.previousSession+'T00:00:00Z',end:p.sessionDay+'T00:00:00Z',feed:'sip',adjustment:'raw',limit:10000,sort:'asc'})},
 {id:'trades-window',url:route('/v2/stocks/trades',{symbols:'AAPL',start:new Date(t0-10000).toISOString(),end:closed,feed:'sip',limit:10000,sort:'asc'})}
 ];
}
function mapOf(body,key){
 const map=key?body?.[key]:body;
 if(!map||typeof map!=='object'||Array.isArray(map)||Object.keys(map).some(s=>!['SPY','AAPL'].includes(s)))fail('SCHEMA_ERROR');
 return map;
}
function summarize(slot,body,receivedAt){
 if(!body||typeof body!=='object'||Array.isArray(body)||body.message||body.error)fail('SCHEMA_ERROR');
 if(body.next_page_token)fail('INCOMPLETE_PAGE');
 const key=slot.id==='quotes'?'quotes':slot.id==='trades-latest'||slot.id==='trades-window'?'trades':slot.id.startsWith('bars-')||slot.id==='prior-daily'?'bars':null;
 const map=mapOf(body,key),symbols=Object.keys(map);
 if(slot.id==='trades-window'&&symbols.some(s=>s!=='AAPL'))fail('SCHEMA_ERROR');
 let rowCount=0,clocked=0,future=0,unknownClock=0;const ages=[];
 for(const row of Object.values(map)){
  const values=Array.isArray(row)?row:[row];
  if((key==='bars'||slot.id==='trades-window')&&!Array.isArray(row))fail('SCHEMA_ERROR');
  for(const value of values){
   if(!value||typeof value!=='object'||Array.isArray(value))fail('SCHEMA_ERROR');
   rowCount++;const ts=slot.id==='snapshots'?value.latestQuote?.t:value.t;
   const n=instant(ts);if(n===null)unknownClock++;else if(n>receivedAt)future++;else{clocked++;ages.push(receivedAt-n);}
  }
 }
 ages.sort((a,b)=>a-b);
 return {receivedSymbols:symbols.length,missingSymbols:(slot.id==='trades-window'?1:2)-symbols.length,rowCount,clocked,future,unknownClock,ageP50Ms:ages.length?ages[Math.floor((ages.length-1)*.5)]:null,ageMaxMs:ages.length?ages.at(-1):null};
}
function revisionCount(a,b){
 const index=body=>{const out=new Map();for(const [s,rows]of Object.entries(mapOf(body,'bars'))){if(!Array.isArray(rows))fail('SCHEMA_ERROR');for(const r of rows){if(!r||instant(r.t)===null||out.has(s+'|'+r.t))fail('SCHEMA_ERROR');out.set(s+'|'+r.t,JSON.stringify(['o','h','l','c','v','n','vw'].map(k=>r[k])));}}return out;};
 const x=index(a),y=index(b),keys=new Set([...x.keys(),...y.keys()]);return [...keys].filter(k=>x.get(k)!==y.get(k)).length;
}
const CODES=new Set(['INVALID_PLAN','CLOCK','DEADLINE','TIMEOUT','TOO_LARGE','HTTP_401','HTTP_403','HTTP_429','HTTP_ERROR','INVALID_JSON','SCHEMA_ERROR','INCOMPLETE_PAGE','TRANSPORT_ERROR','INTERRUPTED']);
export async function runSipDiagnostic(plan,{request,now,wait,approval,signal}={}){
 const {t0,deadline}=validatePlan(plan);
 if(typeof request!=='function'||typeof now!=='function'||typeof wait!=='function'||approval?.granted!==true||approval.scope!=='SIP_ACCESS_SAMPLE_V1')fail('APPROVAL_REQUIRED');
 let last=now(),bytes=0,attempts=0,initial=null;const results=[];
 if(!finite(last)||last<t0||last>t0+30000)fail('CLOCK');
 const check=()=>{if(signal?.aborted)fail(signal.reason==='DEADLINE'?'DEADLINE':'INTERRUPTED');const t=now();if(!finite(t)||t<last)fail('CLOCK');last=t;if(t>deadline)fail('DEADLINE');return t;};
 let status='COMPLETE_SAMPLED',reason=null;
 for(const slot of requestsFor(plan)){
  try{
   let t=check();if(slot.due&&t<slot.due){await wait(slot.due-t);t=check();if(t<slot.due)fail('CLOCK');}
   const timeoutMs=Math.min(LIMITS.requestMs,deadline-t);if(timeoutMs<=0)fail('DEADLINE');
   attempts++;const response=await request({...slot,timeoutMs,maxBytes:LIMITS.bodyBytes});const receivedAt=check();
   if(!response||!Number.isSafeInteger(response.bytes)||response.bytes<0)fail('TRANSPORT_ERROR');
   bytes+=response.bytes;if(response.bytes>LIMITS.bodyBytes||bytes>LIMITS.totalBytes)fail('TOO_LARGE');
   if(response.status!==200)fail([401,403,429].includes(response.status)?'HTTP_'+response.status:'HTTP_ERROR');
   const summary=summarize(slot,response.body,receivedAt);
   const result={id:slot.id,status:'RESPONSE_SAMPLED',httpStatus:response.status,latencyMs:receivedAt-t,rateLimitSample:response.rateLimitSample||null,...summary};
   if(slot.id==='bars-initial')initial=response.body;
   if(slot.id==='bars-repeat')result.changedMinutes=revisionCount(initial,response.body);
   results.push(result);
  }catch(e){status='STOPPED';reason=CODES.has(e?.code)?e.code:'TRANSPORT_ERROR';results.push({id:slot.id,status:'STOPPED',reason});break;}
 }
 const report={kind:'SIP_ACCESS_SAMPLE_REPORT_V1',status,reason,sessionDay:plan.sessionDay,applicationAttempts:attempts,responseBytes:bytes,results,claims:{sampledResponsesOnly:true,generalCoverageEstablished:false,settlementEstablished:false,rateGuaranteeEstablished:false,fillGuarantee:false,strategyEvaluation:false}};
 if(jsonBytes(report)>LIMITS.reportBytes)fail('TOO_LARGE');return report;
}
// This adapter is inert until a future, separately approved runner injects fetch and the existing binding.
// A timeout covers fetch AND body reads, including a non-cooperative transport. Error text/body is never returned.
export function createBoundedSipRequest({fetcher,headers,signal}={}){
 if(typeof fetcher!=='function'||!headers||Object.keys(headers).sort().join(',')!=='APCA-API-KEY-ID,APCA-API-SECRET-KEY'||Object.values(headers).some(x=>typeof x!=='string'||!x))fail('TRANSPORT_ERROR');
 return async slot=>{
  const u=new URL(slot.url);
  if(u.origin!==ORIGIN||u.username||u.password||u.hash||u.searchParams.get('feed')!=='sip'||!['/v2/stocks/snapshots','/v2/stocks/quotes/latest','/v2/stocks/trades/latest','/v2/stocks/bars','/v2/stocks/trades'].includes(u.pathname))fail('TRANSPORT_ERROR');
  if(!finite(slot.timeoutMs)||slot.timeoutMs<=0||slot.timeoutMs>LIMITS.requestMs||slot.maxBytes!==LIMITS.bodyBytes)fail('TRANSPORT_ERROR');
  const abort=new AbortController();let timer,reader,cancel;const stopped=()=>fail(signal?.reason==='DEADLINE'?'DEADLINE':'INTERRUPTED');if(signal?.aborted)stopped();
  try{return await Promise.race([
   (async()=>{const r=await fetcher(slot.url,{method:'GET',redirect:'error',headers,signal:signal?AbortSignal.any([abort.signal,signal]):abort.signal});
    if(r.status!==200)return {status:r.status,bytes:0,body:null};
    if(!r.body?.getReader)fail('TRANSPORT_ERROR');reader=r.body.getReader();let bytes=0,text='';const decoder=new TextDecoder('utf-8',{fatal:true});
    while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>slot.maxBytes)fail('TOO_LARGE');text+=decoder.decode(next.value,{stream:true});}
    text+=decoder.decode();let body;try{body=JSON.parse(text);}catch{fail('INVALID_JSON');}const header=n=>{const x=r.headers?.get?.(n);return typeof x==='string'&&/^\d{1,10}$/.test(x)&&Number.isSafeInteger(Number(x))?Number(x):null;};return {status:r.status,bytes,body,rateLimitSample:{limit:header('x-ratelimit-limit'),remaining:header('x-ratelimit-remaining'),reset:header('x-ratelimit-reset')}};
   })(),
   new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('TIMEOUT'),{code:'TIMEOUT'})),slot.timeoutMs);if(signal){cancel=()=>reject(Object.assign(Error(signal.reason==='DEADLINE'?'DEADLINE':'INTERRUPTED'),{code:signal.reason==='DEADLINE'?'DEADLINE':'INTERRUPTED'}));signal.addEventListener('abort',cancel,{once:true});}})
  ]);}finally{clearTimeout(timer);if(cancel)signal.removeEventListener('abort',cancel);abort.abort();if(reader)Promise.resolve(reader.cancel()).catch(()=>{});}
 };
}
