// Inactive V2 worker; adding credentials cannot activate a mode or change frozen policy.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {captureJson} from '../capture-json.mjs';import {immutableRead} from '../paper-capture-wrapper.mjs';
import {prepareInactiveV2Binding,runInactiveV2Capture,writeInactiveV2Result} from '../sec-v2-host-binding.mjs';
export async function runInactiveV2Worker({file,sha256,historyFile,historySha256}){
 const raw=immutableRead(file,1048576);if(raw.hash!==sha256)throw Error('V2_WORKER_INPUT_PIN');const c=captureJson(raw.bytes.toString());
 const prepared=prepareInactiveV2Binding(c,{inputFile:file,inputSha256:sha256,historyFile,historySha256});
 // No ambient network even when a binding module is loaded. Services must be explicit.
 globalThis.fetch=async()=>{throw Error('INACTIVE_NETWORK_FORBIDDEN');};prepared.revalidate();
 if(prepared.history.state!=='VERIFIED_NO_EARLIER_SAME_DAY_RUN'||prepared.history.lookupStatus!=='COMPLETE')throw Error('V2_WORKER_HISTORY_BLOCKED');
 const module=await import(pathToFileURL(c.bindingModule.file));prepared.revalidate();if(typeof module.createV2Bindings!=='function')throw Error('V2_WORKER_EXPLICIT_CLIENTS');
 let result=await runInactiveV2Capture(c,prepared,await module.createV2Bindings(c));try{prepared.revalidate();}catch{result={...result,status:'INCOMPLETE',reason:'V2_WORKER_INPUT_CHANGED'};}writeInactiveV2Result(c,result);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{if(process.argv.length!==6)throw Error('V2_WORKER_ARGS');const r=await runInactiveV2Worker({file:process.argv[2],sha256:process.argv[3],historyFile:process.argv[4],historySha256:process.argv[5]});console.log(r.status);if(r.status!=='COMPLETE')process.exitCode=1;}catch{console.log('V2_CAPTURE_BLOCKED');process.exitCode=1;}}
