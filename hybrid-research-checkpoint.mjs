// Immutable encrypted checkpoints; synthetic-key tests only until separately approved.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {randomBytes} from 'node:crypto';
import {sealResearch,openResearch} from './tools/seal-research-artifact.mjs';
import {observeResearchSweep,planResearchSweeps} from './hybrid-research-session.mjs';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const scope=s=>typeof s==='string'&&/^[a-f0-9]{40}$/.test(s);
const filename=n=>'checkpoint-'+String(n).padStart(3,'0')+'.json.gz';
function noSymlinks(file){let p=path.resolve(file);while(true){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('CHECKPOINT_SYMLINK_BLOCKED');const parent=path.dirname(p);if(parent===p)break;p=parent;}}
function validate(payload,sourceSha){
 if(!object(payload)||payload.kind!=='HYBRID_RESEARCH_CHECKPOINT_V1'||payload.sourceSha!==sourceSha||payload.orders!==false||payload.approvedBuy!==false||!Number.isInteger(payload.sequence)||payload.sequence<0||payload.sequence>=330||!object(payload.state)||payload.state.cycles!==payload.sequence+1||!object(payload.transport)||!object(payload.cycle)||payload.cycle.at!==payload.state.lastCycleAt)throw Error('INVALID_CHECKPOINT_STATE');
 const expected=planResearchSweeps(payload.universe,payload.plan);if(JSON.stringify(expected)!==JSON.stringify(payload.plan)||payload.plan.liveAuthorized!==false)throw Error('CHECKPOINT_PLAN_CHANGED');
 const result=observeResearchSweep(structuredClone(payload.state),{universe:payload.universe,plan:payload.plan,cutoff:payload.state.lastCycleAt,responses:[]});
 if(result.status!=='DUPLICATE_OR_RETROGRADE'||payload.state.day!==payload.cycle.session?.day)throw Error('CHECKPOINT_SESSION_MISMATCH');
 return payload;
}
export function readHybridCheckpoint(file,{secret,expectedSourceSha,maxInputBytes=12*1024*1024,maxPlainBytes=8*1024*1024,notAfter=null}={}){
 if(!scope(expectedSourceSha)||!Number.isSafeInteger(maxInputBytes)||maxInputBytes<1||maxInputBytes>96*1024*1024||!Number.isSafeInteger(maxPlainBytes)||maxPlainBytes<1||maxPlainBytes>128*1024*1024)throw Error('INVALID_CHECKPOINT_SCOPE');
 noSymlinks(file);const stat=fs.lstatSync(file);if(!stat.isFile()||stat.size>maxInputBytes)throw Error('CHECKPOINT_INPUT_BUDGET');
 const envelope=JSON.parse(fs.readFileSync(file,'utf8')),match=/^checkpoint-(\d{3})\.json\.gz\.enc$/.exec(path.basename(file));
 if(!match||envelope.context?.sourceSha!==expectedSourceSha||envelope.context?.path!==filename(Number(match[1])))throw Error('CHECKPOINT_SOURCE_OR_PATH_MISMATCH');
 const plain=zlib.gunzipSync(openResearch(envelope,secret),{maxOutputLength:maxPlainBytes}),payload=validate(JSON.parse(plain),expectedSourceSha);
 if(payload.sequence!==Number(match[1]))throw Error('CHECKPOINT_SEQUENCE_MISMATCH');
 if(notAfter!==null&&(!Number.isFinite(Date.parse(notAfter))||Date.parse(payload.state.lastCycleAt)>Date.parse(notAfter)))throw Error('CHECKPOINT_FROM_FUTURE');
 return payload;
}
export function createHybridCheckpointJournal({directory,secret,sourceSha,maxBytes=96*1024*1024,maxPlainBytes=8*1024*1024,resume=false}={}){
 if(!scope(sourceSha)||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>96*1024*1024||!Number.isSafeInteger(maxPlainBytes)||maxPlainBytes<1||maxPlainBytes>8*1024*1024)throw Error('INVALID_CHECKPOINT_SCOPE');
 noSymlinks(directory);let bytes=0,next=0,last=null,sessionId=null,stagingFiles=0;const committed=[];
 // Validate the provided key before creating or changing a directory.
 sealResearch(Buffer.alloc(0),secret,{sourceSha,path:'key-shape-check'});
 if(!resume)fs.mkdirSync(directory,{mode:0o700});else{
  if(!fs.statSync(directory).isDirectory())throw Error('CHECKPOINT_DIRECTORY_REQUIRED');
  for(const name of fs.readdirSync(directory).sort()){
   noSymlinks(path.join(directory,name));
   if(name.startsWith('.pending-')){const stat=fs.lstatSync(path.join(directory,name));if(!stat.isFile())throw Error('CHECKPOINT_TYPE_BLOCKED');bytes+=stat.size;stagingFiles++;if(bytes>maxBytes)throw Error('CHECKPOINT_TOTAL_BUDGET');continue;}
   const file=path.join(directory,name),payload=readHybridCheckpoint(file,{secret,expectedSourceSha:sourceSha,maxPlainBytes});
   if(payload.sequence!==next++)throw Error('CHECKPOINT_GAP_OR_DUPLICATE');
   const id=payload.state.day+'|'+payload.universe.universeId;if(sessionId&&sessionId!==id)throw Error('CHECKPOINT_MIXED_SESSION');sessionId=id;bytes+=fs.statSync(file).size;if(bytes>maxBytes)throw Error('CHECKPOINT_TOTAL_BUDGET');last=file;committed.push(name);
  }
 }
 function append({universe,plan,state,transport,cycle}){
  const payload=validate({kind:'HYBRID_RESEARCH_CHECKPOINT_V1',sourceSha,sequence:next,universe,plan,state,transport,cycle,orders:false,approvedBuy:false},sourceSha),id=state.day+'|'+universe.universeId;
  if(sessionId&&sessionId!==id)throw Error('CHECKPOINT_MIXED_SESSION');
  const plain=Buffer.from(JSON.stringify(payload));if(plain.length>maxPlainBytes)throw Error('CHECKPOINT_PLAIN_BUDGET');
  const relative=filename(next),encoded=Buffer.from(JSON.stringify(sealResearch(zlib.gzipSync(plain),secret,{sourceSha,path:relative})));if(bytes+encoded.length>maxBytes)throw Error('CHECKPOINT_TOTAL_BUDGET');
  noSymlinks(directory);const tmp=path.join(directory,'.pending-'+randomBytes(12).toString('hex')),dest=path.join(directory,relative+'.enc');
  try{const fd=fs.openSync(tmp,'wx',0o600);try{fs.writeFileSync(fd,encoded);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
   // link is atomic and refuses an existing destination, unlike rename overwrite.
   fs.linkSync(tmp,dest);const fdDir=fs.openSync(directory,'r');try{fs.fsyncSync(fdDir);}finally{fs.closeSync(fdDir);}
  }finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}
  next++;bytes+=encoded.length;last=dest;sessionId=id;committed.push(path.basename(dest));return {file:path.basename(dest),bytes:encoded.length,sourceSha};
 }
 return {append,report:()=>({kind:'ENCRYPTED_RESEARCH_CHECKPOINT_JOURNAL',sourceSha,files:next,bytes,ignoredStagingFiles:stagingFiles,lastCheckpoint:last?path.basename(last):null,committed:[...committed],plaintextFiles:0,artifactUploaded:false,remoteDurability:'NOT_ESTABLISHED'})};
}
