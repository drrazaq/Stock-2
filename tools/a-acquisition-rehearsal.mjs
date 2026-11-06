// Inactive programmatic host binding; CLI ONLY inspects pinned plans. No keys/default clients/live mode.
import {pathToFileURL} from 'node:url';
import {withOriginals} from '../a-evidence-contract.mjs';
import {captureJson} from '../capture-json.mjs';
import {nativeResponseRequirements,runAResponseBoundImport,validateAResponsePlan,runAFirstCaptureStep} from '../a-source-acquisition-bridge.mjs';
const pinned=(directory,requestRef,planRef)=>withOriginals(directory,read=>({request:captureJson(read(requestRef).toString()),plan:captureJson(read(planRef).toString())}));
export function runASourceEvidenceBindings({originalsDirectory,requestRef,planRef,store,contexts}){const {request,plan}=pinned(originalsDirectory,requestRef,planRef);return runAResponseBoundImport({store,token:request.fenceToken,request,originalsDirectory,plan,contexts});}
export function inspectASourcePlan(originalsDirectory,requestRef,planRef){const {request,plan}=pinned(originalsDirectory,requestRef,planRef),required=nativeResponseRequirements({request,originalsDirectory});validateAResponsePlan(required,plan);return {status:'SYNTHETIC_REHEARSAL_PLAN_INSPECTION_ONLY',potentialMaximumRequests:required.items.length*2,providerCalls:0,runAuthorized:false,activation:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{if(process.argv.length!==8||process.argv[2]!=='--inspect-plan')throw Error('ARGS');process.stdout.write(JSON.stringify(inspectASourcePlan(process.argv[3],{file:process.argv[4],sha256:process.argv[5]},{file:process.argv[6],sha256:process.argv[7]}))+'\n');}catch{process.stdout.write('ERROR\n');process.exitCode=1;}}

// Explicit first-capture phases through the same actual host. No new CLI execution mode.
export async function runASourceFirstCaptureBindings({originalsDirectory,planRef,contractRef,decisionRef,requestRef,nativeRef,action,...bindings}){
 try{const input=withOriginals(originalsDirectory,read=>({plan:captureJson(read(planRef).toString()),contract:captureJson(read(contractRef).toString()),...(nativeRef?{native:captureJson(read(nativeRef).toString())}:{}),...(decisionRef?{decision:captureJson(read(decisionRef).toString())}:{}),...(requestRef?{request:captureJson(read(requestRef).toString())}:{})}));return await runAFirstCaptureStep({...bindings,...input,action,originalsDirectory});}
 catch{return {status:'UNKNOWN',reason:'FIRST_HOST_PIN_OR_INPUT_UNKNOWN',allowBuy:false,prospectiveAdmissions:0,activation:false};}
}

// Tick-driven host driver. Finite synchronous store work belongs in a capture worker, not the watcher event loop.
// References are supplied by existing reviewed producers/reviewers. The driver does not manufacture inputs.
export async function advanceASourceFirstCaptureBindings(options){
 try{
  const {plan}=withOriginals(options.originalsDirectory,read=>({plan:captureJson(read(options.planRef).toString())}));
  const now=()=>options.clock?options.clock():Date.now(),wait=(reason,nextAt=null)=>({status:'WAIT',reason,nextAt,allowBuy:false,prospectiveAdmissions:0,activation:false});
  const invoke=(action,extra={})=>runASourceFirstCaptureBindings({...options,decisionRef:undefined,requestRef:undefined,action,...extra});
  const started=await invoke('prepare');if(!['FIRST_PLAN_DURABLE','FIRST_PLAN_ALREADY_DURABLE'].includes(started.status))return started;
  const scope=started.planHash,done=item=>options.contexts.every(c=>c.store.lookup(c.token,'ACQUISITION','A_SOURCE_PAIR:'+scope+':'+item.id+':RESPONSE').status==='FOUND'),ordered=[...plan.items].sort((a,b)=>Date.parse(a.notBefore)-Date.parse(b.notBefore)||a.id.localeCompare(b.id));
  for(const item of ordered.filter(i=>i.phase==='ENTRY')){if(done(item))continue;if(now()<Date.parse(item.notBefore))return wait('WAIT_ENTRY_WINDOW',item.notBefore);const r=await invoke('capture',{itemId:item.id});if(r.status!=='FIRST_RESPONSE_DURABLE')return r;}
  const old=options.store.lookup(options.token,'ORIGINAL','A_FIRST_CAPTURE_DECISION_V1');
  if(old.status!=='FOUND'){
   if(now()>Date.parse(plan.decisionDeadline))return {status:'UNKNOWN',reason:'FIRST_DECISION_LATE',allowBuy:false,prospectiveAdmissions:0,activation:false};
   if(!options.decisionRef)return wait('WAIT_DECISION_ORIGINAL');
   const r=await invoke('freeze-decision',{decisionRef:options.decisionRef});if(!['FIRST_DECISION_DURABLE','FIRST_DECISION_ALREADY_DURABLE'].includes(r.status))return r;
  }
  for(const item of ordered.filter(i=>i.phase==='FOLLOWUP')){if(done(item))continue;if(now()<Date.parse(item.notBefore))return wait('WAIT_FOLLOWUP_WINDOW',item.notBefore);const r=await invoke('capture',{itemId:item.id});if(r.status!=='FIRST_RESPONSE_DURABLE')return r;}
  if(!options.requestRef)return wait('WAIT_NATIVE_EVIDENCE_ORIGINALS');
  return invoke('evaluate',{requestRef:options.requestRef});
 }catch{return {status:'UNKNOWN',reason:'FIRST_HOST_PIN_OR_INPUT_UNKNOWN',allowBuy:false,prospectiveAdmissions:0,activation:false};}
}
