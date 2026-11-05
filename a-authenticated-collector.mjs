// Inactive A acquisition adapters: callers must supply reviewed transports/signers. No network default, environment keys or live mode.
import {createHash,verify} from 'node:crypto';
import {validateTrustContract} from './a-evidence-contract.mjs';
import {evidenceHash,evidenceTime} from './reclaim-research-workflow.mjs';
const need=(v,c)=>{if(!v)throw Error(c);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const time=s=>{const n=evidenceTime(s);need(Number.isFinite(n),'CLOCK_INVALID');return n;};
const iso=n=>new Date(n).toISOString();
const ref=b=>({file:'raw-'+hash(b)+'.bin',sha256:hash(b)});
function checkedSignature(receipt,role,contract,body){
 const root=contract.roots.find(r=>r.id===receipt?.keyId&&r.roles[0]===role);
 need(root&&receipt?.body&&Object.entries(body).every(([k,v])=>evidenceHash(receipt.body[k])===evidenceHash(v))&&typeof receipt.signature==='string'&&verify(null,Buffer.from(evidenceHash(receipt.body)),root.publicKey,Buffer.from(receipt.signature,'base64')),'SIGNER_OR_RECEIPT_INVALID');return receipt;
}
function nativeNs(s){
 need(typeof s==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?Z$/.test(s),'NATIVE_QUOTE_CLOCK_INVALID');
 const [main,fraction='']=s.slice(0,-1).split('.');return BigInt(time(main+'Z'))*1000000n+BigInt(fraction.padEnd(9,'0'));
}
export function normalizeAlpacaAQuotes(payload,{symbol,securityId,slot,receivedAt,profile}){
 need(payload&&Object.getPrototypeOf(payload)===Object.prototype&&Array.isArray(payload.quotes)&&payload.next_page_token===null&&(!payload.symbol||payload.symbol===symbol),'QUOTE_ENVELOPE_OR_PAGINATION_UNKNOWN');
 need(profile?.sizeUnits==='SHARES'&&Array.isArray(profile.firmConditions)&&profile.firmConditions.length>0,'QUOTE_SEMANTICS_UNVERIFIED');
 need(payload.quotes.length<=10000,'QUOTE_COUNT_CAP');need(payload.quotes.length||profile.emptyMeansNoEvents===true,'EMPTY_RESPONSE_UNVERIFIED');
 const seen=new Map(),events=[];
 for(const q of payload.quotes){
  const n=nativeNs(q?.t),start=BigInt(time(slot.start))*1000000n,end=BigInt(time(slot.end))*1000000n;
  need(n>=start&&(slot.atEndInclusive?n<=end:n<end)&&n<=BigInt(time(receivedAt))*1000000n,'QUOTE_OUTSIDE_WINDOW_OR_FUTURE');
  need(['bp','ap','bs','as'].every(k=>typeof q[k]==='number'&&Number.isFinite(q[k])&&q[k]>0)&&q.ap>=q.bp&&Number.isInteger(q.bs)&&Number.isInteger(q.as),'QUOTE_VALUES_UNKNOWN');
  need(Array.isArray(q.c)&&q.c.length>0&&q.c.every(c=>profile.firmConditions.includes(c))&&typeof q.bx==='string'&&typeof q.ax==='string'&&typeof q.z==='string','QUOTE_FIRMNESS_UNKNOWN');
  const id=evidenceHash({symbol,native:q});if(seen.has(id))continue;seen.set(id,true);
  events.push({type:'BBO',record:{symbol,securityId,source:'ALPACA_SIP',evidenceId:'ALPACA_NATIVE_'+id,at:iso(Number(n/1000000n)),nativeTimestamp:q.t,nativeTimestampNs:n.toString(),observedAt:receivedAt,sourceDelayMs:0,sizeUnits:'SHARES',bid:q.bp,ask:q.ap,bidSize:q.bs,askSize:q.as,conditions:q.c,bidExchange:q.bx,askExchange:q.ax,tape:q.z}});
 }
 events.sort((a,b)=>BigInt(a.record.nativeTimestampNs)<BigInt(b.record.nativeTimestampNs)?-1:BigInt(a.record.nativeTimestampNs)>BigInt(b.record.nativeTimestampNs)?1:0);
 return events;
}
export function createACollector({store,token,contract,role,collectorId,signReceipt,transport,clock=Date.now,limits}){
 validateTrustContract(contract);need(['CAPTURE','WITNESS'].includes(role)&&typeof signReceipt==='function'&&typeof transport==='function','COLLECTOR_BINDINGS_REQUIRED');
 const registration=contract.collectors.find(c=>c.id===collectorId&&c.role===role);need(registration,'COLLECTOR_PROVENANCE_REQUIRED');
 need(Number.isInteger(limits?.requests)&&limits.requests>0&&limits.requests<=32&&Number.isInteger(limits.bodyBytes)&&limits.bodyBytes>0&&limits.bodyBytes<=1024*1024&&Number.isInteger(limits.totalBytes)&&limits.totalBytes>=limits.bodyBytes&&limits.totalBytes<=8*1024*1024&&Number.isInteger(limits.timeoutMs)&&limits.timeoutMs>0&&limits.timeoutMs<=20000&&Number.isInteger(limits.durationMs)&&limits.durationMs>0&&limits.durationMs<=600000,'COLLECTOR_LIMITS_REQUIRED');
 const started=clock();need(Number.isFinite(started),'CLOCK_INVALID');let requests=0,bytes=0,stopped=false;
 const signed=(original,securityId,recordedAt,extra={})=>{
  const body={role,collectorId,contractHash:evidenceHash(contract),securityId,sha256:original.sha256,recordedAt,...extra},receipt=signReceipt(body);
  checkedSignature(receipt,role,contract,body);need(receipt.keyId===registration.keyId,'COLLECTOR_KEY_MISMATCH');return {...original,receipt};
 };
 function persist(kind,id,value,original){const b=original===undefined?Buffer.from(JSON.stringify(value)):Buffer.from(original);const result=store.append(token,kind,id,value,b);return {reference:ref(b),receipt:result};}
 function reserveRequest(id,context){need(store.lookup(token,'TRANSPORT',id+':REQUEST').status==='NOT_COMMITTED','EARLIER_REQUEST_OUTCOME_UNKNOWN');store.append(token,'TRANSPORT',id+':REQUEST',{...context,startedAt:iso(clock())});}
 function lookup(id){const old=store.lookup(token,'ACQUISITION',id);return old.status==='FOUND'?old.record.payload:null;}
 async function fetchBody(url){
  need(!stopped&&requests<limits.requests&&clock()>=started&&clock()-started<limits.durationMs,'COLLECTOR_BUDGET_OR_DEADLINE');requests++;
  const begin=clock(),abort=new AbortController(),chunks=[];let timer,count=0,responseStatus=null;
  const work=(async()=>{
   const response=await transport({method:'GET',url,signal:abort.signal,bodyLimit:limits.bodyBytes,attempt:1});
   need(response?.url===url&&Number.isInteger(response.status),'TRANSPORT_CONTEXT_UNKNOWN');
   responseStatus=response.status;need(response.body&&typeof response.body[Symbol.asyncIterator]==='function','BOUNDED_RESPONSE_STREAM_REQUIRED');
   for await(const chunk of response.body){need(!abort.signal.aborted,'TRANSPORT_DEADLINE');const b=Buffer.from(chunk),keep=Math.max(0,Math.min(b.length,limits.bodyBytes-count,limits.totalBytes-bytes));if(keep)chunks.push(b.subarray(0,keep));count+=b.length;bytes+=b.length;need(count<=limits.bodyBytes&&bytes<=limits.totalBytes,'RESPONSE_BYTE_CAP');}
   return {status:response.status,bytes:Buffer.concat(chunks),startedAt:iso(begin),receivedAt:iso(clock()),transportId:response.transportId};
  })();
  try{const out=await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('TRANSPORT_DEADLINE'));},Math.min(limits.timeoutMs,limits.durationMs-(clock()-started)));})]);need(time(out.receivedAt)>=begin&&clock()-started<=limits.durationMs,'COLLECTOR_CLOCK_OR_DEADLINE');return out;}catch(e){stopped=true;abort.abort();e.partial={bytes:Buffer.concat(chunks),receivedAt:iso(clock()),status:responseStatus};throw e;}finally{clearTimeout(timer);}
 }
 async function quoteFrame({plan,slot,symbol,securityId,profile,profileReceipt}){
  need(plan?.securityId===securityId&&plan.slots.some(s=>evidenceHash(s)===evidenceHash(slot))&&slot.type==='BBO'&&/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol||''),'FRAME_CONTEXT_REQUIRED');
  const planHash=evidenceHash(plan),id=collectorId+':'+planHash+':'+slot.id,old=lookup(id),contextHash=evidenceHash({planHash,symbol,securityId,profile,role,collectorId});if(old){need(old.contextHash===contextHash,'FRAME_REVISION_CONFLICT');return {...old,reused:true};}
  const u=new URL('https://data.alpaca.markets/v2/stocks/'+symbol+'/quotes');u.search=new URLSearchParams({feed:'sip',start:slot.start,end:slot.end,limit:'10000',sort:'asc'}).toString();
  let response,code='COMPLETE',events=[];
  try{
   // A signed semantics proposal is necessary but not owner adoption or evidence of real subscription access.
   const b=Buffer.from(JSON.stringify(profile));checkedSignature(profileReceipt,'REVIEW',contract,{role:'REVIEW',contractHash:evidenceHash(contract),securityId,sha256:hash(b),recordedAt:profileReceipt?.body?.recordedAt});
   need(time(profileReceipt.body.recordedAt)<=clock(),'SEMANTICS_REVIEW_FUTURE');
   need(clock()>=time(slot.end),'FRAME_NOT_ENDED');
   reserveRequest(id,{contextHash,route:u.href});response=await fetchBody(u.href);
   persist('TRANSPORT',id,{url:u.href,role,collectorId,status:response.status,startedAt:response.startedAt,receivedAt:response.receivedAt,transportId:response.transportId},response.bytes);
   need(response.transportId===registration.provenanceReference,'TRANSPORT_PROVENANCE_MISMATCH');
   need(response.status===200,'SOURCE_HTTP_FAILURE');
   const parsed=JSON.parse(response.bytes.toString());events=normalizeAlpacaAQuotes(parsed,{symbol,securityId,slot,receivedAt:response.receivedAt,profile});
   // Retrospective retrieval does not backdate observations: a late response stays incomplete for timely evidence.
   need(time(response.receivedAt)<=time(slot.end),'LATE_FRAME_HANDOFF');
  }catch(e){if(e.partial?.bytes.length)persist('TRANSPORT',id+':PARTIAL',{status:'INCOMPLETE_RAW_PREFIX',receivedAt:e.partial.receivedAt,sourceStatus:e.partial.status},e.partial.bytes);code=/^[A-Z_]+$/.test(e.message)?e.message:'SOURCE_SCHEMA_OR_IO_ERROR';}
  const receivedAt=response?.receivedAt||iso(clock()),complete=code==='COMPLETE';
  for(const event of events)persist('ORIGINAL',collectorId+':'+event.record.evidenceId,event.record);
  const original=Buffer.from(JSON.stringify({schema:'A_INDEPENDENT_FRAME_V1',planHash,slotId:slot.id,securityId,events}));
  const native=persist('ORIGINAL',id+':FRAME',null,original).reference;
  const result={contextHash,slotId:slot.id,start:slot.start,end:slot.end,status:complete?'COMPLETE':'INCOMPLETE',reason:code,transportComplete:complete,nextPage:complete?null:'UNKNOWN',receivedAt,recordCount:events.length,original:native,originalReceipt:signed(native,securityId,receivedAt),requestUrl:u.href};
  persist('ACQUISITION',id,result);return result;
 }
 async function observeQuoteWindow({plan,slot,symbol,securityId,profile,profileReceipt,client}){
  need(plan?.securityId===securityId&&plan.slots.some(s=>evidenceHash(s)===evidenceHash(slot))&&slot.type==='BBO','FRAME_CONTEXT_REQUIRED');
  const planHash=evidenceHash(plan),id=collectorId+':'+planHash+':'+slot.id,old=lookup(id),contextHash=evidenceHash({planHash,symbol,securityId,profile,role,collectorId});if(old){need(old.contextHash===contextHash,'FRAME_REVISION_CONFLICT');return {...old,reused:true};}
  const profileBytes=Buffer.from(JSON.stringify(profile));checkedSignature(profileReceipt,'REVIEW',contract,{role:'REVIEW',contractHash:evidenceHash(contract),securityId,sha256:hash(profileBytes),recordedAt:profileReceipt?.body?.recordedAt});
  need(time(profileReceipt.body.recordedAt)<=clock()&&client&&typeof client.observe==='function','SEMANTICS_OR_CLIENT_REQUIRED');
  need(!stopped&&requests<limits.requests&&clock()>=started&&clock()-started<limits.durationMs,'COLLECTOR_BUDGET_OR_DEADLINE');requests++;
  const abort=new AbortController();let timer,wire,code='COMPLETE',events=[];
  try{
   reserveRequest(id,{contextHash,route:'wss://stream.data.alpaca.markets/v2/sip'});
   const duration=Math.min(time(slot.end)-clock()+1000,limits.durationMs-(clock()-started));need(duration>0,'COLLECTOR_BUDGET_OR_DEADLINE');
   wire=await Promise.race([client.observe({symbol,start:slot.start,end:slot.end,signal:abort.signal}),new Promise((_,reject)=>{timer=setTimeout(()=>{abort.abort();reject(Error('TRANSPORT_DEADLINE'));},duration);})]);
   need(wire&&Array.isArray(wire.messages)&&wire.messages.length<=10000,'WIRE_HISTORY_UNKNOWN');
   for(let i=0;i<wire.messages.length;i++){
    const message=wire.messages[i],raw=Buffer.from(message.base64,'base64');bytes+=raw.length;need(raw.length<=limits.bodyBytes&&bytes<=limits.totalBytes,'RESPONSE_BYTE_CAP');
    persist('TRANSPORT',id+':WIRE:'+i,{provider:'ALPACA_SIP',route:'wss://stream.data.alpaca.markets/v2/sip',receivedAt:message.receivedAt,collectorId},raw);
    const quotes=JSON.parse(raw.toString()).filter(q=>q.T==='q'&&q.S===symbol);
    if(quotes.length)events.push(...normalizeAlpacaAQuotes({quotes,next_page_token:null},{symbol,securityId,slot,receivedAt:message.receivedAt,profile}));
   }
   need(wire.status==='COMPLETE'&&wire.coveredFrom===slot.start&&wire.coveredUntil===slot.end,'SOURCE_WINDOW_INCOMPLETE');
   need(clock()>=time(slot.end)&&clock()-started<=limits.durationMs,'COLLECTOR_CLOCK_OR_DEADLINE');
  }catch(e){code=/^[A-Z_]+$/.test(e.message)?e.message:'SOURCE_SCHEMA_OR_IO_ERROR';stopped=true;}finally{clearTimeout(timer);abort.abort();}
  // Deduplicate only exact native events; competing revisions/ties remain visible to the strict verifier.
  events=[...new Map(events.map(e=>[e.record.evidenceId,e])).values()];
  for(const event of events)persist('ORIGINAL',collectorId+':'+event.record.evidenceId,event.record);
  const raw=Buffer.from(JSON.stringify({schema:'A_INDEPENDENT_FRAME_V1',planHash,slotId:slot.id,securityId,events})),original=persist('ORIGINAL',id+':FRAME',null,raw).reference;
  const receivedAt=iso(clock()),complete=code==='COMPLETE',result={contextHash,slotId:slot.id,start:slot.start,end:slot.end,status:complete?'COMPLETE':'INCOMPLETE',reason:code,transportComplete:complete,nextPage:complete?null:'UNKNOWN',receivedAt,recordCount:events.length,original,originalReceipt:signed(original,securityId,receivedAt)};
  persist('ACQUISITION',id,result);return result;
 }
 function retainPrimaryOriginal({logicalId,securityId,sourceUrl,bytes:body,observedAt}){
  // Capture our first observation before blocking persistence/hash/signing work; never reconstruct it afterward.
  const receivedAt=iso(clock());
  need(role==='CAPTURE'&&/^https:\/\//.test(sourceUrl||''),'SOURCE_CONTEXT_REQUIRED');
  const id=collectorId+':SOURCE:'+logicalId,b=Buffer.from(body),old=lookup(id);
  need(b.length>0&&b.length<=limits.bodyBytes,'RESPONSE_BYTE_CAP');
  if(old){
   need(time(old.receipt.body.recordedAt)<=time(receivedAt),'SOURCE_CLOCK_ORDER_UNKNOWN');
   need(store.lookup(token,'ACQUISITION',id+':CONFLICT').status==='NOT_COMMITTED','PERSISTENT_SOURCE_CONFLICT');
   if(old.sha256!==hash(b)||old.receipt.body.sourceUrl!==sourceUrl||old.receipt.body.securityId!==securityId){
    persist('ORIGINAL',id+':REVISION:'+hash(b),{observedAt:iso(clock())},b);
    persist('ACQUISITION',id+':CONFLICT',{firstHash:old.sha256,revisionHash:hash(b),firstConflictAt:iso(clock())});throw Error('SOURCE_REVISION_CONFLICT');
   }
   return {...old,reused:true};
  }
  need(observedAt===undefined||time(observedAt)===time(receivedAt),'SOURCE_RECEIPT_NOT_CONTEMPORANEOUS');
  const original=persist('ORIGINAL',id,null,b).reference,result=signed(original,securityId,observedAt??receivedAt,{sourceUrl});persist('ACQUISITION',id,result);return result;
 }
 function sealCoverage(plan,frames){
  need(role==='WITNESS'&&Array.isArray(frames)&&frames.length===plan.slots.length&&new Set(frames.map(f=>f.slotId)).size===plan.slots.length,'COVERAGE_SLOT_MISSING_OR_DUPLICATE');
  need(plan.slots.every(s=>frames.some(f=>f.slotId===s.id&&f.start===s.start&&f.end===s.end)),'COVERAGE_PLAN_MISMATCH');
  const recordedAt=iso(clock());need(plan.slots.every(s=>time(s.end)<=clock()),'COVERAGE_SEAL_EARLY');
  const value={schema:1,complete:frames.every(f=>f.status==='COMPLETE'),planHash:evidenceHash(plan),inputHash:plan.inputHash,policyHash:plan.policyHash,securityId:plan.securityId,frames};
  const b=Buffer.from(JSON.stringify(value)),original=persist('ORIGINAL',collectorId+':COVERAGE:'+evidenceHash(plan),null,b).reference;return signed(original,plan.securityId,recordedAt);
 }
 return {quoteFrame,observeQuoteWindow,retainPrimaryOriginal,sealCoverage,stats:()=>({requests,bytes,stopped,allowBuy:false,prospectiveAdmissions:0})};
}
