// Bounded GitHub control-plane reads; no dispatch/provider/Telegram operation.
import {watcherDayBounds} from './watcher-schedule.mjs';
import {watcherJobEvidence,nyParts} from './watcher-guard-core.mjs';
export async function readGuardHistory({base,headers,day,nowMs=Date.now(),fetchImpl=fetch,maxReads=24,maxPages=2,deadlineMs=30000}) {
 const began=performance.now();let reads=0,errorCode=null;const rawRuns=[],runs=[];
 const get=async url=>{const left=deadlineMs-(performance.now()-began);if(reads>=maxReads||left<=0)throw Error('CONTROL_PLANE_BUDGET');reads++;const r=await fetchImpl(url,{headers,signal:AbortSignal.timeout(Math.max(1,Math.min(10000,Math.floor(left))))});if(!r.ok)throw Error('GITHUB_HISTORY_UNAVAILABLE');return r.json();};
 const pages=async (url,key)=>{const rows=[];for(let page=1;page<=maxPages;page++){const j=await get(url+(url.includes('?')?'&':'?')+'per_page=100&page='+page);const a=j?.[key];if(!Array.isArray(a))throw Error('GITHUB_HISTORY_UNAVAILABLE');rows.push(...a);const total=Number.isInteger(j.total_count)&&j.total_count>=0?j.total_count:null;if(total!==null&&rows.length>=total)return rows;if(a.length<100){if(total!==null&&rows.length<total)throw Error('GITHUB_HISTORY_INCOMPLETE');return rows;}}throw Error('GITHUB_HISTORY_INCOMPLETE');};
 try {const {from,to}=watcherDayBounds(day);rawRuns.push(...await pages(base+'/actions/workflows/ignition.yml/runs?created='+encodeURIComponent(from+'..'+to),'workflow_runs'));}
 catch(e){errorCode=['CONTROL_PLANE_BUDGET','GITHUB_HISTORY_INCOMPLETE'].includes(e.message)?e.message:'GITHUB_HISTORY_UNAVAILABLE';}
 for(const run of rawRuns){if(!/^\d+$/.test(String(run?.id))||!Number.isFinite(Date.parse(run?.created_at))||!['queued','waiting','requested','pending','in_progress','completed'].includes(run?.status)){errorCode='GITHUB_HISTORY_UNAVAILABLE';continue;}if(nyParts(Date.parse(run.created_at)).d!==day){errorCode='GITHUB_HISTORY_INCOMPLETE';continue;}let jobs=null;
  try{jobs=await pages(base+'/actions/runs/'+run.id+'/jobs?filter=latest','jobs');}
  catch(e){errorCode=['CONTROL_PLANE_BUDGET','GITHUB_HISTORY_INCOMPLETE'].includes(e.message)?e.message:'GITHUB_HISTORY_UNAVAILABLE';}
  runs.push(watcherJobEvidence(run,jobs,nowMs));
 }
 return {rawRuns,runs,complete:errorCode===null,errorCode,reads};
}
