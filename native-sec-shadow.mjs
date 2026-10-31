// Shadow-only hook for already returned response bytes. No provider calls,
// messages, scoring, legacy mutation or default activation.
import fs from 'node:fs';
import path from 'node:path';
import {openNativeRun,appendNativeResponse} from './native-sec-events.mjs';
export function createNativeSecShadow({enabled=false,directory,runId,sourceSha,provenance='DECLARED_UNAUDITED_NATIVE'}){
 let store=null;const state={enabled,responses:0,archived:0,failures:0,status:enabled?'NOT_OBSERVED':'DISABLED',lastReason:null};
 return {observe(input){if(!enabled)return {status:'DISABLED'};state.responses++;try{store=store||openNativeRun({directory,runId,sourceSha,provenance});const r=appendNativeResponse(store,input);state.archived++;state.status='ARCHIVED_UNAUDITED';return {status:state.status,...r};}catch(e){state.failures++;state.status='UNKNOWN';try{if(store)fs.writeFileSync(path.join(store.directory,'health-incomplete.json'),JSON.stringify({kind:'NATIVE_ARCHIVE_FAILURE_NOT_AN_EVENT',at:input.observedAt,reason:'ARCHIVE_WRITE_FAILED',primaryAdmissionAllowed:false}),{flag:'wx',mode:0o600});}catch{}state.lastReason=['NATIVE_INPUT_SCOPE','NATIVE_INTERRUPTED_WRITE','NATIVE_STORAGE_BUDGET','NATIVE_RESPONSE_BUDGET'].includes(e.message)?e.message:'ARCHIVE_FAILURE';return {status:'UNKNOWN',reason:state.lastReason};}},report(){return {...state};}};
}
