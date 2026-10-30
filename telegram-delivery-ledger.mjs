// Opt-in cross-job delivery journal. No environment lookup or implicit live I/O.
// No body, raw chat ID or token is written to the journal. Deployment is separate.
import {createHash} from 'node:crypto';
const digest=x=>createHash('sha256').update(x).digest('hex');
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const sha=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const clock=x=>typeof x==='string'&&/T.*(?:Z|[+-]\\d\\d:\\d\\d)$/.test(x)&&Number.isFinite(Date.parse(x));
function validRecord(r,key){
 return object(r)&&r.version===1&&r.key===key&&/^[a-f0-9]{64}$/.test(r.fingerprint)&&['PENDING','ACK','UNKNOWN','REJECTED'].includes(r.status)&&clock(r.at)&&Number.isInteger(r.attempts)&&r.attempts>=1&&r.attempts<=3&&(r.status!=='ACK'||Number.isInteger(r.messageId)&&r.messageId>0);
}
export function createGitHubDeliveryStore({repository,branch,token,fetcher=fetch,base='https://api.github.com'}={}){
 if(repository!=='drrazaq/Stock-2'||!['main','Stock2-safety-fixes'].includes(branch)||typeof token!=='string'||!token)throw Error('DELIVERY_STORE_SCOPE_REQUIRED');
 const u=new URL(base);if(!((u.protocol==='https:'&&u.hostname==='api.github.com')||(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))||u.pathname!=='/'||u.search||u.hash)throw Error('DELIVERY_STORE_BASE_BLOCKED');
 const endpoint=key=>{if(!/^[a-f0-9]{64}$/.test(key))throw Error('INVALID_DELIVERY_KEY');return u.origin+'/repos/'+repository+'/contents/data/telegram-delivery-ledger/'+key+'.json';};
 async function request(url,options){
  try{return await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'}});}catch{throw Error('DELIVERY_STORE_REQUEST_UNCONFIRMED');}
 }
 return {
  async read(key){
   const r=await request(endpoint(key)+'?ref='+encodeURIComponent(branch),{method:'GET'});
   if(r.status===404)return {exists:false,sha:null,record:null};
   if(!r.ok)throw Error('DELIVERY_STORE_READ_REFUSED');
   try{const b=await r.json();if(b.type!=='file'||b.encoding!=='base64'||!sha(b.sha)||typeof b.content!=='string'||b.content.length>16384)throw Error();
    const record=JSON.parse(Buffer.from(b.content,'base64').toString('utf8'));if(!validRecord(record,key))throw Error();return {exists:true,sha:b.sha,record};
   }catch{throw Error('DELIVERY_STORE_STATE_UNREADABLE');}
  },
  async write(key,expectedSha,record){
   if(expectedSha!==null&&!sha(expectedSha)||!validRecord(record,key))throw Error('DELIVERY_STORE_INVALID_WRITE');
   const body={message:'Telegram delivery journal '+record.status,branch,content:Buffer.from(JSON.stringify(record)).toString('base64'),...(expectedSha?{sha:expectedSha}:{})};
   const r=await request(endpoint(key),{method:'PUT',body:JSON.stringify(body)});
   if(!r.ok)throw Error([409,422].includes(r.status)?'DELIVERY_STORE_CAS_CONFLICT':'DELIVERY_STORE_WRITE_REFUSED');
   let b;try{b=await r.json();}catch{throw Error('DELIVERY_STORE_WRITE_UNCONFIRMED');}
   if(!sha(b?.content?.sha)||!sha(b?.commit?.sha))throw Error('DELIVERY_STORE_WRITE_UNCONFIRMED');
   return {exists:true,sha:b.content.sha,record};
  }
 };
}
export async function deliverTelegramDurably({store,scope,eventId,message,send,at=new Date().toISOString()}){
 if(!store||typeof store.read!=='function'||typeof store.write!=='function'||typeof send!=='function'||typeof scope!=='string'||!scope||scope.length>1024||typeof eventId!=='string'||!eventId||eventId.length>1024||typeof message!=='string'||!clock(at))return {ok:false,reason:'INVALID_DURABLE_DELIVERY_SCOPE'};
 const key=digest(JSON.stringify([scope,eventId])),fingerprint=digest(message);let previous;
 try{previous=await store.read(key);}catch{return {ok:false,reason:'DELIVERY_STATE_UNREADABLE'};}
 if(!object(previous)||typeof previous.exists!=='boolean'||previous.exists&&(!sha(previous.sha)||!validRecord(previous.record,key)))return {ok:false,reason:'DELIVERY_STATE_UNREADABLE'};
 if(previous.exists){
  const r=previous.record;
  if(r.fingerprint!==fingerprint)return {ok:false,reason:'DELIVERY_KEY_CONTENT_CONFLICT'};
  if(r.status==='ACK')return {ok:true,messageId:r.messageId,deliveredParts:r.deliveredParts??1,totalParts:r.totalParts??r.deliveredParts??1,deduplicated:true};
  if(r.status!=='REJECTED')return {ok:false,reason:'DELIVERY_OUTCOME_UNKNOWN',deduplicated:true};
  if(r.attempts>=3)return {ok:false,reason:'DELIVERY_RETRY_LIMIT'};
 }
 const pending={version:1,key,fingerprint,status:'PENDING',at,attempts:(previous.record?.attempts||0)+1};let reserved;
 try{reserved=await store.write(key,previous.exists?previous.sha:null,pending);if(!object(reserved)||!sha(reserved.sha))throw Error();}catch{return {ok:false,reason:'INTENT_NOT_REMOTELY_DURABLE'};}
 let result;try{result=await send();}catch{result={ok:false,reason:'NETWORK_ERROR'};}
 const ack=result?.ok===true&&Number.isInteger(result.messageId)&&result.messageId>0;
 const rejected=result?.ok!==true&&/^HTTP_(?:400|401|403|404|429)$/.test(result?.reason||'')&&!(result?.deliveredParts>0);
 const final={...pending,status:ack?'ACK':rejected?'REJECTED':'UNKNOWN',...(ack?{messageId:result.messageId,deliveredParts:result.deliveredParts??1,totalParts:result.totalParts??result.deliveredParts??1}:{reason:rejected?result.reason:'UNCONFIRMED_DELIVERY'})};
 try{const saved=await store.write(key,reserved.sha,final);if(!object(saved)||!sha(saved.sha))throw Error();}catch{return {ok:false,reason:'ACK_STATE_NOT_REMOTELY_DURABLE',messageMayHaveBeenDelivered:true,deliveredParts:result?.deliveredParts??(ack?1:0)};}
 return ack?{...result,deduplicated:false}:{ok:false,reason:rejected?result.reason:'DELIVERY_OUTCOME_UNKNOWN',deliveredParts:result?.deliveredParts??0,deduplicated:false};
}
