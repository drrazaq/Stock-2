// Broker adapter: fixed PAPER origin, default-off mutations, no retries.
const uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const decimal=x=>['string','number'].includes(typeof x)&&/^\d+(?:\.\d+)?$/.test(String(x))&&Number.isFinite(Number(x))&&Number(x)>0;
const symbol=x=>typeof x==='string'&&/^[A-Z][A-Z0-9.\-]{0,9}$/.test(x);
export function validPaperOrder(body){
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['symbol','qty','side','type','time_in_force','client_order_id','limit_price','order_class','stop_loss'].includes(k))||!symbol(body.symbol)||!decimal(body.qty)||Number(body.qty)>Number.MAX_SAFE_INTEGER||!['buy','sell'].includes(body.side)||body.time_in_force!=='day'||typeof body.client_order_id!=='string'||!/^[A-Za-z0-9_.-]{1,48}$/.test(body.client_order_id))return false;
 if(body.side==='sell')return body.type==='market'&&body.limit_price===undefined&&body.order_class===undefined&&body.stop_loss===undefined;
 return body.type==='limit'&&decimal(body.limit_price)&&Number.isFinite(Number(body.limit_price)*Number(body.qty))&&body.order_class==='oto'&&body.stop_loss&&typeof body.stop_loss==='object'&&!Array.isArray(body.stop_loss)&&Object.keys(body.stop_loss).length===1&&decimal(body.stop_loss.stop_price)&&Number(body.stop_loss.stop_price)<Number(body.limit_price);
}
export async function paperRequest({base='https://paper-api.alpaca.markets',method='GET',path,body,key,secret,enableOrders=false,fetcher=fetch,timeoutMs=10000}){
 let u,target;try{u=new URL(base);target=new URL(path,base);}catch{return {error:'INVALID_BROKER_BASE'};}
 const allowed=u.origin===base&&(base==='https://paper-api.alpaca.markets'||u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname));
 if(!allowed||typeof path!=='string'||!/^\/v2\/[a-z]/.test(path)||path.includes('\\')||path.includes('#')||target.origin!==base)return {error:'BROKER_ENDPOINT_BLOCKED'};
 if(!['GET','POST','DELETE'].includes(method))return {error:'BROKER_METHOD_BLOCKED'};
 if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)return {error:'INVALID_BROKER_TIMEOUT'};
 const match=/^\/v2\/orders\/([^/]+)$/.exec(path);
 if(method!=='GET'){
  if(enableOrders!==true)return {error:'ORDER_MUTATIONS_DISABLED'};
  if(method==='POST'&&path!=='/v2/orders'||method==='DELETE'&&(!match||!uuid(match[1])))return {error:'BROKER_MUTATION_PATH_BLOCKED'};
  if(method==='POST'&&!validPaperOrder(body))return {error:'INVALID_PAPER_ORDER'};
  if(method==='DELETE'&&body!==undefined)return {error:'BROKER_BODY_BLOCKED'};
 }else if(body!==undefined)return {error:'BROKER_BODY_BLOCKED'};
 if(typeof key!=='string'||!key||typeof secret!=='string'||!secret)return null;
 const controller=new AbortController();let timer,reader;
 try{
  const request=async()=>{
   const r=await fetcher(base+path,{method,redirect:'error',signal:controller.signal,headers:{'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   if(controller.signal.aborted){await r.body?.cancel?.();throw Error();}
   if(!r.ok){await r.body?.cancel?.();return {error:r.status};}
   if(method==='DELETE'&&r.status===204)return {cancelled:true,id:match[1]};
   const length=r.headers?.get?.('content-length');if(length&&Number(length)>128*1024){await r.body?.cancel?.();throw Error();}
   reader=r.body?.getReader?.();if(!reader)throw Error();const chunks=[];let size=0;
   while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>128*1024||controller.signal.aborted)throw Error();chunks.push(part.value);}
   const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(method==='POST'&&(!result||!uuid(result.id)||result.symbol!==body.symbol||result.side!==body.side||result.client_order_id!==body.client_order_id))return {error:'BROKER_OUTCOME_UNCONFIRMED'};
   if(method==='DELETE'&&(!result||result.id!==match[1]||result.status!=='canceled'))return {error:'BROKER_OUTCOME_UNCONFIRMED'};
   return result;
  };
  return await Promise.race([request(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error());},timeoutMs);})]);
 }catch{return {error:'BROKER_OUTCOME_UNCONFIRMED'};}finally{clearTimeout(timer);controller.abort();if(reader)void reader.cancel().catch(()=>{});}
}
