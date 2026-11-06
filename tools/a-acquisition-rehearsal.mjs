// Inactive programmatic host binding; CLI ONLY inspects pinned plans. No keys/default clients/live mode.
import {pathToFileURL} from 'node:url';
import {withOriginals} from '../a-evidence-contract.mjs';
import {captureJson} from '../capture-json.mjs';
import {nativeResponseRequirements,runAResponseBoundImport,validateAResponsePlan} from '../a-source-acquisition-bridge.mjs';
const pinned=(directory,requestRef,planRef)=>withOriginals(directory,read=>({request:captureJson(read(requestRef).toString()),plan:captureJson(read(planRef).toString())}));
export function runASourceEvidenceBindings({originalsDirectory,requestRef,planRef,store,contexts}){const {request,plan}=pinned(originalsDirectory,requestRef,planRef);return runAResponseBoundImport({store,token:request.fenceToken,request,originalsDirectory,plan,contexts});}
export function inspectASourcePlan(originalsDirectory,requestRef,planRef){const {request,plan}=pinned(originalsDirectory,requestRef,planRef),required=nativeResponseRequirements({request,originalsDirectory});validateAResponsePlan(required,plan);return {status:'SYNTHETIC_REHEARSAL_PLAN_INSPECTION_ONLY',potentialMaximumRequests:required.items.length*2,providerCalls:0,runAuthorized:false,activation:false};}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{if(process.argv.length!==8||process.argv[2]!=='--inspect-plan')throw Error('ARGS');process.stdout.write(JSON.stringify(inspectASourcePlan(process.argv[3],{file:process.argv[4],sha256:process.argv[5]},{file:process.argv[6],sha256:process.argv[7]}))+'\n');}catch{process.stdout.write('ERROR\n');process.exitCode=1;}}
