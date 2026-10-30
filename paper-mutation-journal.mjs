// Private, remotely confirmed intent before any future separately approved PAPER
// order. No live broker host, default activation, plaintext body or retry.
import {createHash} from 'node:crypto';
import {validPaperOrder} from './paper-transport.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{40}$/.test(x);
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const recordValid=(r,id)=>object(r)&&Object.keys(r).length===6&&r.version===1&&r.operationHash===id&&typeof r.contentHash==='string'&&/^[a-f0-9]{64}$/.test(r.contentHash)&&['PENDING','UNKNOWN','REFUSED','ACK'].includes(r.status)&&typeof r.at==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(r.at)&&Number.isFinite(Date.parse(r.at))&&(r.status==='ACK'?uuid(r.brokerId):r.brokerId===null);
export async function paperMutationOnce({enabled=false,accountKey,method,path,body,store,send,at=new Date().toISOString()}){
 if(enabled!==true)return {error:'ORDER_MUTATIONS_DISABLED'};
 const orderId=typeof path==='string'?path.split('/').at(-1):null;
 if(typeof accountKey!=='string'||!accountKey||!['POST','DELETE'].includes(method)||method==='POST'&&(path!=='/v2/orders'||!validPaperOrder(body))||method==='DELETE'&&(path!=='/v2/orders/'+orderId||!uuid(orderId)||body!==undefined)||!Number.isFinite(Date.parse(at))||typeof store?.read!=='function'||typeof store?.write!=='function'||typeof send!=='function')return {error:'PAPER_JOURNAL_SCOPE_INVALID'};
 const id=hash([accountKey,method,method==='POST'?body.client_order_id:path]),contentHash=hash(body??null);let observed;
 try{observed=await store.read(id);}catch{return {error:'PAPER_INTENT_NOT_REMOTELY_DURABLE'};}
 if(!object(observed)||typeof observed.exists!=='boolean'||observed.exists&&(!hex(observed.sha)||!recordValid(observed.record,id))||!observed.exists&&(observed.sha!==null||observed.record!==null))return {error:'PAPER_JOURNAL_UNREADABLE'};
 if(observed.exists){if(observed.record.contentHash!==contentHash)return {error:'PAPER_OPERATION_CONTENT_CONFLICT'};return {error:observed.record.status==='ACK'?'PAPER_OPERATION_ALREADY_RECORDED':'PAPER_OPERATION_QUARANTINED',brokerId:observed.record.brokerId};}
 // A new client_order_id must not evade an older unknown account operation.
 // Hold an account-wide CAS lock until the operation AND its ACK are durable.
 const lockId=hash([accountKey,'ACCOUNT_EXECUTION_LOCK_V1']);let lock,locked;
 try{lock=await store.read(lockId);}catch{return {error:'PAPER_INTENT_NOT_REMOTELY_DURABLE'};}
 if(!object(lock)||typeof lock.exists!=='boolean'||lock.exists&&(!hex(lock.sha)||!recordValid(lock.record,lockId))||!lock.exists&&(lock.sha!==null||lock.record!==null))return {error:'PAPER_JOURNAL_UNREADABLE'};
 if(lock.exists&&lock.record.status!=='ACK')return {error:'PAPER_ACCOUNT_QUARANTINED'};
 const accountPending={version:1,operationHash:lockId,contentHash:id,status:'PENDING',at,brokerId:null};
 try{locked=await store.write(lockId,lock.exists?lock.sha:null,accountPending);if(!hex(locked?.sha))throw Error();}catch{return {error:'PAPER_INTENT_NOT_REMOTELY_DURABLE'};}
 const pending={version:1,operationHash:id,contentHash,status:'PENDING',at,brokerId:null};let reserved;
 try{reserved=await store.write(id,null,pending);if(!hex(reserved?.sha))throw Error();}catch{return {error:'PAPER_INTENT_NOT_REMOTELY_DURABLE'};}
 let result;try{result=await send();}catch{result={error:'BROKER_OUTCOME_UNCONFIRMED'};}
 const ack=method==='POST'?result&&!result.error&&uuid(result.id)&&result.symbol===body.symbol&&result.side===body.side&&result.client_order_id===body.client_order_id:result&&!result.error&&result.id===orderId&&(result.cancelled===true||result.status==='canceled');
 const final={...pending,status:ack?'ACK':[400,401,403,404,422,429].includes(result?.error)?'REFUSED':'UNKNOWN',brokerId:ack?result.id:null};
 try{const saved=await store.write(id,reserved.sha,final);if(!hex(saved?.sha))throw Error();}catch{return {error:'PAPER_ACK_NOT_REMOTELY_DURABLE'};}
 if(ack){try{const released=await store.write(lockId,locked.sha,{...accountPending,status:'ACK',brokerId:result.id});if(!hex(released?.sha))throw Error();}catch{return {error:'PAPER_ACCOUNT_RELEASE_UNCONFIRMED'};}}
 return ack?result:result?.error?result:{error:'BROKER_OUTCOME_UNCONFIRMED'};
}
export function createPrivatePaperJournal({token,fetcher=fetch,base='https://api.github.com',timeoutMs=10000}={}){
 const u=new URL(base);if(!(u.origin===base&&(base==='https://api.github.com'||u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))||typeof token!=='string'||!token||!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('PRIVATE_PAPER_JOURNAL_SCOPE');
 const endpoint=id=>{if(typeof id!=='string'||!/^[a-f0-9]{64}$/.test(id))throw Error('JOURNAL_KEY_INVALID');return base+'/repos/drrazaq/stock-2-private-data/contents/data/broker-intents/'+id+'.json';};
 async function api(url,method,body){
  const controller=new AbortController();let timer,reader;
  try{return await Promise.race([(async()=>{const r=await fetcher(url,{method,redirect:'error',signal:controller.signal,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   if(controller.signal.aborted){await r.body?.cancel?.();throw Error();}if(!r.ok){await r.body?.cancel?.();if(method==='GET'&&r.status===404)return null;throw Error('PRIVATE_JOURNAL_API_REFUSED');}
   const length=r.headers?.get?.('content-length');if(length&&Number(length)>128*1024){await r.body?.cancel?.();throw Error();}reader=r.body?.getReader?.();if(!reader)throw Error();const chunks=[];let size=0;while(true){const c=await reader.read();if(c.done)break;size+=c.value.byteLength;if(size>128*1024||controller.signal.aborted)throw Error();chunks.push(c.value);}return JSON.parse(Buffer.concat(chunks).toString('utf8'));})(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('PRIVATE_JOURNAL_TIMEOUT'));},timeoutMs);})]);
  }finally{clearTimeout(timer);controller.abort();if(reader)void reader.cancel().catch(()=>{});}
 }
 async function read(id){const j=await api(endpoint(id)+'?ref=main','GET');if(j===null)return {exists:false,sha:null,record:null};if(!hex(j.sha)||j.encoding!=='base64'||typeof j.content!=='string'||j.content.length>32768)throw Error('PRIVATE_JOURNAL_RECORD_INVALID');const record=JSON.parse(Buffer.from(j.content,'base64').toString('utf8'));return {exists:true,sha:j.sha,record};}
 async function write(id,expected,record){if(!(expected===null||hex(expected))||!recordValid(record,id))throw Error('PRIVATE_JOURNAL_RECORD_INVALID');const j=await api(endpoint(id),'PUT',{message:'paper mutation journal',branch:'main',content:Buffer.from(JSON.stringify(record)).toString('base64'),...(expected?{sha:expected}:{})});
  if(!hex(j?.content?.sha)||!hex(j?.commit?.sha))throw Error('PRIVATE_JOURNAL_WRITE_UNCONFIRMED');const confirmed=await read(id);if(!confirmed.exists||confirmed.sha!==j.content.sha||JSON.stringify(confirmed.record)!==JSON.stringify(record))throw Error('PRIVATE_JOURNAL_READBACK_UNCONFIRMED');return {sha:confirmed.sha};
 }
 return {read,write};
}
