// Explicit source availability; an unavailable response is never empty news.
export async function readNewsSource(fetcher,url,{observedAt=new Date().toISOString()}={}) {
 try {
  const r=await fetcher(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)return {status:r.status===429?'RATE_LIMITED':'HTTP_ERROR',httpStatus:r.status,observedAt,rows:null};
  let body;try{body=await r.json();}catch{return {status:'INVALID_JSON',observedAt,rows:null};}
  if(!Array.isArray(body))return {status:'INVALID_SCHEMA',observedAt,rows:null};
  const rows=body.filter(x=>x&&typeof x==='object'&&!Array.isArray(x)&&typeof x.headline==='string'&&x.headline.trim()&&typeof x.datetime==='number'&&Number.isFinite(x.datetime)&&x.datetime>0&&x.datetime*1000<=Date.parse(observedAt));
  return {status:rows.length===body.length?'OBSERVED':'PARTIAL',observedAt,received:body.length,rejected:body.length-rows.length,rows};
 }catch{return {status:'NETWORK_ERROR',observedAt,rows:null};}
}
