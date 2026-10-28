// Telegram delivery must be acknowledged. A resolved HTTP request is not proof of delivery.
export async function sendTelegramMessage({fetcher=fetch,base='https://api.telegram.org',token,chat,text}) {
 if(!token||!chat) return {ok:false,reason:'MISSING_CREDENTIALS'};
 try {
  const res=await fetcher(base+'/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text,disable_web_page_preview:true})});
  if(!res.ok) return {ok:false,reason:'HTTP_'+res.status};
  const body=await res.json();
  return body?.ok===true&&body?.result?.message_id ? {ok:true,messageId:body.result.message_id}:{ok:false,reason:'TELEGRAM_NOT_ACKNOWLEDGED'};
 } catch(e) {return {ok:false,reason:'NETWORK_ERROR'};}
}
