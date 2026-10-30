// End-to-end OFFLINE fixture runner. Never selects global fetch or provider keys.
import {createHybridSnapshotTransport} from './hybrid-snapshot-transport.mjs';
import {freezeResearchUniverse,planResearchSweeps,hybridSessionState,observeResearchSweep,hybridSessionReport} from './hybrid-research-session.mjs';
import {researchSession} from './research-collector.mjs';
export async function runHybridFixture(fixture,{resumeCheckpoint=null,onCycle=null}={}){
 if(!fixture||fixture.version!==1||!Array.isArray(fixture.cycles)||!fixture.cycles.length||fixture.cycles.length>330)throw Error('INVALID_HYBRID_FIXTURE');
 const universe=freezeResearchUniverse(fixture.universe),plan=planResearchSweeps(universe,fixture.planOptions);if(plan.status!=='FIXTURE_PLANNABLE_NOT_LIVE_APPROVAL')throw Error('FIXTURE_PLAN_BLOCKED');
 let clock=Date.parse(fixture.cycles[0].cutoff),current=null,call=0;const state=resumeCheckpoint?structuredClone(resumeCheckpoint.state):hybridSessionState(),results=[];let ignoredCycles=0,termination='FIXTURE_END';
 const transport=createHybridSnapshotTransport({credentials:{key:'fixture-only',secret:'fixture-only'},now:()=>clock,resume:resumeCheckpoint?.transport||null,limits:{maxRequests:plan.maxRequests,requestsPerMinute:plan.requestsPerMinute,maxDurationMs:21600000,requestTimeoutMs:1000,...fixture.transportLimits},fetcher:async(url,options)=>{
  if(options.method!=='GET'||new URL(url).origin!=='https://data.alpaca.markets')throw Error('FIXTURE_SCOPE');
  const record=current.responses?.find(x=>x.batch===call++);clock+=10;
  if(record?.networkError)throw Error('FIXTURE_FEED_INTERRUPTED');
  return new Response(JSON.stringify(record?.rows||{}),{status:record?.httpStatus??503});
 }});
 for(const cycle of fixture.cycles){
  const at=Date.parse(cycle.cutoff);if(!Number.isFinite(at)||typeof cycle.cutoff!=='string'||!/T.*(?:Z|[+-]\d\d:\d\d)$/.test(cycle.cutoff))throw Error('INVALID_FIXTURE_CLOCK');
  if(!researchSession(at).eligible){termination='OUTSIDE_PREMARKET';break;}
  if(state.lastCycleAt&&at<=Date.parse(state.lastCycleAt)||state.minutes.includes(researchSession(at).minute)){ignoredCycles++;continue;}
  if(at<clock)throw Error('FIXTURE_CLOCK_REGRESSED');clock=at;current=cycle;call=0;
  if(cycle.cancel===true){transport.cancel();termination='CANCELLED';break;}
  if(!Array.isArray(cycle.responses)||cycle.responses.some(x=>!x||!Number.isInteger(x.batch)||x.batch<0||x.batch>=plan.batches.length)||new Set(cycle.responses.map(x=>x.batch)).size!==cycle.responses.length)throw Error('INVALID_FIXTURE_RESPONSE_SCOPE');
  const responses=[];for(let batch=0;batch<plan.batches.length;batch++){
   // Align missing batch fixtures without creating false duplicate requests.
   call=batch;const r=await transport.snapshots(plan.batches[batch],{feed:'sip'});responses.push({batch,...r});
   if(transport.report().halted){termination=transport.report().halted;break;}
  }
  const cutoff=new Date(clock).toISOString();const result=observeResearchSweep(state,{universe,plan,cutoff,responses,delayedRows:cycle.delayedRows||[],readText:path=>{if(!Object.hasOwn(cycle.files||{},path))throw Error('MISSING_FIXTURE_SOURCE');const text=cycle.files[path];return typeof text==='string'?text:JSON.stringify(text);}});results.push(result);
  if(onCycle)await onCycle({universe,plan,state,transport:transport.report(),cycle:result});
  if(transport.report().halted)break;
 }
 const cutoff=state.lastCycleAt||fixture.cycles[0].cutoff;
 return {kind:'OFFLINE_HYBRID_FIXTURE_ONLY',termination,ignoredCycles,universe,plan,state,cycles:results,transport:transport.report(),report:hybridSessionReport(state,{cutoff}),liveCollection:false,approvedBuy:false,orders:false};
}
