import fs from 'node:fs';
// These are scan measurements, never profitability or executable-fill claims.
export function cycleHeartbeat({day,runId,sourceSha,startedAt,completedAt,minute,received,evaluated,fresh,priceAgeP50Min,priceAgeP95Min,requests,lastSuccessfulCycle=null}) {
 const errors=requests.filter(x=>!x.ok),latencies=requests.map(x=>x.ms).filter(Number.isFinite).sort((a,b)=>a-b);
 const successful=evaluated>0&&fresh>0;
 return {version:1,day,runId,sourceSha,startedAt,completedAt,lastCompletedCycle:completedAt,
  lastSuccessfulCycle:successful?completedAt:lastSuccessfulCycle,minute,received,evaluated,fresh,
  freshPct:evaluated>0?+(100*fresh/evaluated).toFixed(2):null,priceAgeP50Min,priceAgeP95Min,
  cycleMs:Date.parse(completedAt)-Date.parse(startedAt),requestCount:requests.length,errorCount:errors.length,
  requestP95Ms:latencies.length?latencies[Math.min(latencies.length-1,Math.floor(latencies.length*.95))]:null,
  errors:errors.map(({source,status})=>({source,status})),successful};
}
export function heartbeatHealth(beat,{day,now=Date.now(),maxAgeMs=5*60000}={}) {
 const t=Date.parse(beat?.lastCompletedCycle),ageMs=now-t;
 if(!beat||beat.day!==day||!Number.isFinite(t)||ageMs<0)return {status:'UNVERIFIED',ageMs:null};
 if(!Number.isInteger(beat.evaluated)||beat.evaluated<0||!Number.isInteger(beat.fresh)||beat.fresh<0||beat.fresh>beat.evaluated||
    !Number.isInteger(beat.errorCount)||beat.errorCount<0||typeof beat.successful!=='boolean'||
    (beat.evaluated>0&&(!Number.isFinite(beat.freshPct)||Math.abs(beat.freshPct-100*beat.fresh/beat.evaluated)>.011)))return {status:'UNVERIFIED',ageMs};
 if(ageMs>maxAgeMs)return {status:'STALLED',ageMs};
 if(!beat.successful||beat.freshPct===null||beat.freshPct<50||beat.errorCount>0)return {status:'DEGRADED',ageMs};
 return {status:'SCANNING',ageMs};
}
export function writeRuntimeJson(file,value) {
 fs.mkdirSync(file.slice(0,file.lastIndexOf('/'))||'.',{recursive:true});
 fs.writeFileSync(file+'.tmp',JSON.stringify(value));fs.renameSync(file+'.tmp',file);
}
export async function publishHeartbeat(beat,{fetcher=fetch,api='https://api.github.com',repo,branch,token}={}) {
 if(!token||!repo||!branch)return {ok:false,reason:'NOT_CONFIGURED'};
 if(!/^[\w.-]+\/[\w.-]+$/.test(repo)||!/^[\w.-]+$/.test(beat.runId)||!/^\d{4}-\d{2}-\d{2}$/.test(beat.day))return {ok:false,reason:'INVALID_IDENTITY'};
 const path='data/watcher-heartbeats/'+beat.day+'/'+beat.runId+'.json',url=api+'/repos/'+repo+'/contents/'+path;
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json'};
 try{
  const existing=await fetcher(url+'?ref='+encodeURIComponent(branch),{headers,signal:AbortSignal.timeout(10000)});
  if(!existing.ok&&existing.status!==404)return {ok:false,reason:'READ_HTTP_'+existing.status};
  const previous=existing.ok?await existing.json():null;
  const r=await fetcher(url,{method:'PUT',headers,signal:AbortSignal.timeout(10000),body:JSON.stringify({message:'watcher heartbeat '+beat.runId,branch,sha:previous?.sha,content:Buffer.from(JSON.stringify(beat)).toString('base64')})});
  if(!r.ok)return {ok:false,reason:'WRITE_HTTP_'+r.status};
  const ack=await r.json();
  return ack?.content?.sha?{ok:true,reason:null}:{ok:false,reason:'WRITE_UNCONFIRMED'};
 }catch{return {ok:false,reason:'NETWORK_ERROR'};}
}
