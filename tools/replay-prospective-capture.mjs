// Fixture-only offline integration entry point. Intentionally no live mode.
import fs from 'node:fs';
import path from 'node:path';
import {newCapture,appendCapture,checkpointCapture,recoverCapture,finishCapture} from '../prospective-paper-capture.mjs';
export function replayFixture(input,output,key){
 const st=fs.lstatSync(input);if(!st.isFile()||st.isSymbolicLink()||st.size>8*1024*1024)throw Error('FIXTURE_INPUT_SCOPE');
 const x=JSON.parse(fs.readFileSync(input));if(x.synthetic!==true||!Array.isArray(x.frames)||x.frames.length>41)throw Error('SYNTHETIC_ONLY');
 if(fs.existsSync(output))throw Error('OUTPUT_ALREADY_EXISTS');
 // Key validity before any output is created. Key supplied by test harness, never real bindings.
 let s=newCapture(x.plan);checkpointCapture(s,key);fs.mkdirSync(output,{mode:0o700});let total=0;
 for(const f of x.frames){
  s=appendCapture(s,f);const envelope=checkpointCapture(s,key),encoded=Buffer.from(JSON.stringify(envelope));total+=encoded.length;
  if(total>160*1024*1024)throw Error('SEALED_STORAGE_STOP');
  const file=path.join(output,`${f.sequence}.enc`);fs.writeFileSync(file,encoded,{flag:'wx',mode:0o600});
  // Exercise authenticated recovery before processing another frame. Never fabricate gaps on restart.
  s=recoverCapture(JSON.parse(fs.readFileSync(file)),key,x.plan);
 }
 return {...finishCapture(s),encryptedFiles:x.frames.length,sealedBytes:total};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+path.resolve(process.argv[1])).href){
 try{
  if(process.argv.length!==5||process.argv[2]!=='--synthetic')throw Error('FIXTURE_ONLY');
  // Deliberately public fixture key: no real environment or secret lookup in this tool.
  const r=replayFixture(process.argv[3],process.argv[4],'synthetic-paper-capture-key-only');
  console.log(JSON.stringify({status:'SYNTHETIC_COMPLETE',frames:r.encryptedFiles,simulatedResolved:r.evaluation.counts.resolved,genuineAdmissions:0,providerRequests:0}));
 }catch{console.error('OFFLINE_CAPTURE_ERROR');process.exitCode=1;}
}
