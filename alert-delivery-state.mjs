import fs from 'node:fs';
// Existing intraday state, not a new permission or external service. Never store bodies.
export function readAlertState(file,day){
 let book;if(!fs.existsSync(file))book={day,sent:{}};else book=JSON.parse(fs.readFileSync(file,'utf8'));
 if(!book||typeof book!=='object'||Array.isArray(book)||!book.sent||typeof book.sent!=='object'||Array.isArray(book.sent)||book.delivery!==undefined&&(!book.delivery||typeof book.delivery!=='object'||Array.isArray(book.delivery)))throw Error('ALERT_STATE_UNREADABLE');
 if(book.day!==day){book.day=day;book.sent={};book.delivery={};}book.delivery||={};return book;
}
export function saveAlertState(file,book){
 const tmp=file+'.tmp-'+process.pid+'-'+Math.random().toString(16).slice(2);
 try{const fd=fs.openSync(tmp,'wx');try{fs.writeFileSync(fd,JSON.stringify(book));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
}
export const alertAvailable=(book,key)=>!book.sent[key]&&!['PENDING','UNKNOWN','ACK'].includes(book.delivery?.[key]?.status);
export async function deliverAlertOnce({book,keys,send,save,at=new Date().toISOString()}){
 if(!keys.length||keys.some(k=>!alertAvailable(book,k)))return {ok:false,reason:'ALREADY_RESERVED_OR_ACKED'};
 for(const key of keys)book.delivery[key]={status:'PENDING',at};
 try{save();}catch{return {ok:false,reason:'INTENT_NOT_DURABLE'};}
 let result;try{result=await send();}catch{result={ok:false,reason:'NETWORK_ERROR'};}
 for(const key of keys){
  if(result?.ok===true){book.sent[key]=1;book.delivery[key]={status:'ACK',at};}
  else if(/^HTTP_(?:400|401|403|404|429)$/.test(result?.reason||'')&&!result?.deliveredParts)delete book.delivery[key];
  else book.delivery[key]={status:'UNKNOWN',at,reason:result?.reason||'NO_ACK'};
 }
 try{save();}catch{return {ok:false,reason:'ACK_STATE_NOT_DURABLE'};}
 return result||{ok:false,reason:'NO_ACK'};
}
