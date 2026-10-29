import fs from 'node:fs';
// Telegram delivery must be acknowledged. A resolved HTTP request is not proof of delivery.
export async function sendTelegramMessage({fetcher=fetch,base='https://api.telegram.org',token,chat,text,replyMarkup,timeoutMs=10000}) {
 if(!token||!chat) return {ok:false,reason:'MISSING_CREDENTIALS'};
 if(typeof text!=='string'||!text.length||text.length>4096)return {ok:false,reason:'INVALID_TEXT_LENGTH'};
 try {
  const res=await fetcher(base+'/bot'+token+'/sendMessage',{method:'POST',signal:AbortSignal.timeout(timeoutMs),headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text,disable_web_page_preview:true,...(replyMarkup?{reply_markup:replyMarkup}:{})})});
  if(!res.ok) {let retryAfter=null;if(res.status===429){try{const b=await res.json();if(Number.isFinite(b?.parameters?.retry_after)&&b.parameters.retry_after>=0)retryAfter=b.parameters.retry_after;}catch{}}return {ok:false,reason:'HTTP_'+res.status,...(retryAfter!==null?{retryAfter}: {})};}
  const body=await res.json();
  return body?.ok===true&&Number.isInteger(body?.result?.message_id)&&body.result.message_id>0 ? {ok:true,messageId:body.result.message_id}:{ok:false,reason:'TELEGRAM_NOT_ACKNOWLEDGED'};
 } catch(e) {return {ok:false,reason:'NETWORK_ERROR'};}
}
export function splitTelegramText(text,limit=3900){
 if(!Number.isInteger(limit)||limit<2||limit>4096)throw Error('invalid Telegram part limit');
 const parts=[];let rest=String(text);
 while(rest.length>limit){let n=rest.lastIndexOf('\n',limit);if(n<limit/2)n=limit;if(/[\uD800-\uDBFF]/.test(rest[n-1]))n--;parts.push(rest.slice(0,n));rest=rest.slice(n);}
 if(rest)parts.push(rest);return parts;
}
// Compatibility facade for scheduled reports and rich bot replies. API failure
// becomes ok:false even if HTTP was 200; only explicit 429 is retried. An
// ambiguous network outcome is never automatically resent.
export async function telegramFetch(url,options,{fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),recordFailure=true,research=false,retry429=true}={}){
 const u=new URL(url);if(!((u.protocol==='https:'&&u.hostname==='api.telegram.org')||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname))))throw Error('invalid Telegram host');
 const m=/^\/bot([^/]+)\/sendMessage$/.exec(u.pathname);if(!m)throw Error('not a Telegram message endpoint');
 const body=JSON.parse(options.body),text=(research&&!/NOT AN APPROVED BUY|RESEARCH ONLY|PAPER ONLY/i.test(body.text)?'RESEARCH REPORT — NOT AN APPROVED BUY\n':'')+String(body.text||'');
 const parts=splitTelegramText(text);let result={ok:false,reason:'INVALID_TEXT_LENGTH'},deliveredParts=0;
 for(let i=0;i<parts.length;i++){
  for(let attempt=0;attempt<3;attempt++){
   result=await sendTelegramMessage({fetcher,base:u.origin,token:m[1],chat:body.chat_id,text:parts[i],replyMarkup:i===parts.length-1?body.reply_markup:null});
   if(result.ok||!retry429||result.reason!=='HTTP_429'||attempt===2)break;
   const wait=result.retryAfter??1;if(wait>5)break;await sleep(wait*1000);
  }
  if(!result.ok)break;deliveredParts++;
 }
 const ok=parts.length>0&&deliveredParts===parts.length;
 if(!ok&&recordFailure){
  const status=result.reason?.startsWith('HTTP_')?Number(result.reason.slice(5)):result.reason;
  console.error('TELEGRAM DELIVERY UNCONFIRMED: '+result.reason+'; acknowledged parts '+deliveredParts+'/'+parts.length);
  try{fs.mkdirSync('data',{recursive:true});fs.appendFileSync('data/tg-failures.jsonl',JSON.stringify({at:new Date().toISOString(),status,why:result.reason,head:text.split('\n')[0].slice(0,80),deliveredParts,totalParts:parts.length})+'\n');}catch{console.error('TELEGRAM FAILURE RECORD COULD NOT BE SAVED');}
 }
 const response=ok?{ok:true,result:{message_id:result.messageId}}:{ok:false,description:result.reason,parameters:{retry_after:result.retryAfter??1}};
 return {ok,status:ok?200:result.reason?.startsWith('HTTP_')?Number(result.reason.slice(5)):502,json:async()=>response,text:async()=>JSON.stringify(response),deliveredParts,totalParts:parts.length};
}
