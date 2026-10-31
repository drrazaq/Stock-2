// Inactive capture lifecycle; all time decisions use the same injectable clock.
// Source observation is an independent process and is never cancelled here.
import {immutableRead} from './paper-capture-wrapper.mjs';
import {captureJson} from './capture-json.mjs';
import {validatePlan} from './prospective-paper-capture.mjs';
const need=(v,c)=>{if(!v)throw Error(c);};
export const SYSTEM_CAPTURE_CLOCK={now:()=>Date.now(),sleep:ms=>new Promise(r=>setTimeout(r,ms)),setTimeout:(f,ms)=>setTimeout(f,ms),clearTimeout:id=>clearTimeout(id)};
export function pinnedCaptureSchedule({file,sha256},now,{shutdownMarginMs=30000}={}){
 const bytes=immutableRead(file,65536);need(bytes.hash===sha256,'HOST_PLAN_PIN');const document=captureJson(bytes.bytes.toString()),plan=validatePlan(document.plan||document);need(Number.isInteger(shutdownMarginMs)&&shutdownMarginMs>=5000&&shutdownMarginMs<=60000,'HOST_SHUTDOWN_MARGIN');const start=Date.parse(plan.start),end=Date.parse(plan.end),enrollmentEnd=Date.parse(plan.enrollmentEnd);need(Number.isFinite(now)&&now>=start-4*60*60000,'HOST_STARTUP_OUTSIDE_BOUNDS');
 return {plan,planFile:file,planSha256:sha256,start,end,enrollmentEnd,warmupAt:start-30000,latestLaunchAt:start-10000,terminateAt:end+shutdownMarginMs-2000,deadline:end+shutdownMarginMs,shutdownMarginMs};
}
export async function orchestratePinnedCapture({schedule,clock=SYSTEM_CAPTURE_CLOCK,parentAllowed,prefixReady,healthy,startCapture}){
 const timers=[];let last=clock.now();const time=()=>{const t=clock.now();need(Number.isFinite(t)&&t>=last,'HOST_CLOCK_REGRESSION');last=t;return t;},checkPin=()=>need(immutableRead(schedule.planFile,65536).hash===schedule.planSha256,'HOST_PLAN_CHANGED');
 if(!parentAllowed)return {status:'PARENT_INCOMPLETE',captureStarted:false,deadline:schedule.deadline};
 if(time()>schedule.latestLaunchAt)return {status:time()>schedule.enrollmentEnd?'CAPTURE_ENROLLMENT_EXPIRED':'LATEST_START_MISSED',captureStarted:false,deadline:schedule.deadline};
 if(time()<schedule.warmupAt)await clock.sleep(schedule.warmupAt-time());
 let ready=false;for(let polls=0;polls<=21&&time()<=schedule.latestLaunchAt;polls++){checkPin();if(!healthy())break;try{ready=await prefixReady(new Date(time()).toISOString());}catch{ready=false;}if(ready&&time()<=schedule.latestLaunchAt)break;ready=false;if(time()<schedule.latestLaunchAt)await clock.sleep(Math.min(1000,schedule.latestLaunchAt-time()));else break;}
 if(!ready)return {status:'NATIVE_PREFIX_NOT_READY_BY_START',captureStarted:false,deadline:schedule.deadline};checkPin();need(time()<=schedule.latestLaunchAt,'HOST_LATEST_START');
 const capture=startCapture();let closed=false,monitorTimer,controlActive=true;
 const exited=Promise.resolve(capture.completion).then(code=>{closed=true;return code;});
 const awaitClose=()=>Promise.race([exited.catch(()=>new Promise(()=>{})),new Promise(resolve=>timers.push(clock.setTimeout(resolve,2000)))]);
 const control=new Promise((_,reject)=>{const inspect=()=>{if(!controlActive)return;try{time();checkPin();need(healthy(),'HOST_SOURCE_OR_RESOURCE_UNHEALTHY');}catch(error){reject(error);return;}monitorTimer=clock.setTimeout(inspect,1000);};monitorTimer=clock.setTimeout(inspect,1000);});
 const deadline=new Promise(resolve=>{
  timers.push(clock.setTimeout(()=>capture.terminate('SIGTERM'),Math.max(0,schedule.terminateAt-time())));
  timers.push(clock.setTimeout(()=>{capture.terminate('SIGKILL');resolve({status:'CAPTURE_DEADLINE',captureStarted:true,deadline:schedule.deadline});},Math.max(0,schedule.deadline-time())));
 });
 try{const outcome=await Promise.race([exited.then(code=>({status:time()>=schedule.terminateAt?'CAPTURE_DEADLINE':code===0?'CAPTURE_FINISHED':'CAPTURE_FAILED',captureStarted:true,deadline:schedule.deadline})),deadline,control]);if(outcome.status==='CAPTURE_DEADLINE'&&!closed)await awaitClose();checkPin();return {...outcome,shutdownConfirmed:closed};}
 catch(error){
  // A failed completion port, changed plan or unhealthy source must not clear
  // the deadline while leaving an orphan capture process. Never signal source.
  if(!closed){capture.terminate('SIGTERM');await Promise.race([exited.catch(()=>new Promise(()=>{})),new Promise(resolve=>timers.push(clock.setTimeout(resolve,2000)))]);if(!closed){capture.terminate('SIGKILL');await awaitClose();}}
  return {status:'CAPTURE_CONTROL_FAILED',reason:['HOST_CLOCK_REGRESSION','HOST_PLAN_CHANGED','HOST_SOURCE_OR_RESOURCE_UNHEALTHY'].includes(error.message)?error.message:'HOST_CAPTURE_COMPLETION_FAILED',captureStarted:true,shutdownConfirmed:closed,deadline:schedule.deadline};
 }finally{controlActive=false;clock.clearTimeout(monitorTimer);for(const timer of timers)clock.clearTimeout(timer);}
}
