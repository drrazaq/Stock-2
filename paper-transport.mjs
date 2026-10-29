// The only broker mutation adapter. Default is read-only, including paper.
// Research collectors must never import this module.
export async function paperRequest({base='https://paper-api.alpaca.markets',method='GET',path,body,key,secret,enableOrders=false,fetcher=fetch}){
 let u;try{u=new URL(base);}catch{return {error:'INVALID_BROKER_BASE'};}
 const allowed=u.origin===base&&(base==='https://paper-api.alpaca.markets'||u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname));
 if(!allowed||typeof path!=='string'||!/^\/v2\/[a-z]/.test(path)||path.includes('\\')||path.includes('#')||new URL(path,base).origin!==base)return {error:'BROKER_ENDPOINT_BLOCKED'};
 if(!['GET','POST','DELETE','PATCH'].includes(method))return {error:'BROKER_METHOD_BLOCKED'};
 if(method!=='GET'){
  if(!enableOrders)return {error:'ORDER_MUTATIONS_DISABLED'};
  if(!/^\/v2\/orders(?:\/[A-Za-z0-9-]+)?$/.test(path))return {error:'BROKER_MUTATION_PATH_BLOCKED'};
  if(method==='POST'&&(!body||!['buy','sell'].includes(body.side)||typeof body.symbol!=='string'||!/^[A-Z][A-Z0-9.\-]{0,9}$/.test(body.symbol)||!['string','number'].includes(typeof body.qty)||!/^\d+(?:\.\d+)?$/.test(String(body.qty))||!Number.isFinite(Number(body.qty))||Number(body.qty)<=0))return {error:'INVALID_PAPER_ORDER'};
 }
 if(!key||!secret)return null;
 try{
  const r=await fetcher(base+path,{method,redirect:'error',signal:AbortSignal.timeout(10000),headers:{'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  if(!r.ok)return {error:r.status};
  return await r.json();
 }catch{return {error:'BROKER_OUTCOME_UNCONFIRMED'};}
}
