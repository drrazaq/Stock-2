// Offline staging of independently pinned PUBLIC SEC run bytes. No retrieval/activation.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {nativeRunDigest,readNativeRun} from '../native-sec-events.mjs';
const [mode,directory,runId,sourceSha,digest,out]=process.argv.slice(2);
if(process.argv.length!==8||mode!=='--offline'||!/^[A-Za-z0-9_-]{1,80}$/.test(runId||'')||!/^[a-f0-9]{40}$/.test(sourceSha||'')||!/^[a-f0-9]{64}$/.test(digest||'')||!out)throw Error('EXACT_OFFLINE_PARENT_PINS_REQUIRED');
const destination=path.resolve(out),root=path.resolve('runtime/native-sec-parents');
if(!destination.startsWith(root+path.sep)||fs.existsSync(destination)||fs.existsSync(destination+'.parent.json'))throw Error('NEW_PARENT_DESTINATION_REQUIRED');
for(let p=path.dirname(destination);;p=path.dirname(p)){if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('PARENT_DESTINATION_SYMLINK');if(path.dirname(p)===p)break;}
const snapshot=nativeRunDigest(directory),archive=readNativeRun({directory,expectedRunId:runId,expectedSourceSha:sourceSha});
if(snapshot.sha256!==digest||archive.status!=='INTEGRITY_CHECKED_UNAUDITED')throw Error('PARENT_SOURCE_NOT_VERIFIED');
fs.mkdirSync(path.dirname(destination),{recursive:true,mode:0o700});fs.mkdirSync(destination,{mode:0o700});
const write=(file,b)=>{const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,b);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
for(const f of snapshot.files)write(path.join(destination,f.name),Buffer.from(f.bodyBase64,'base64'));
if(nativeRunDigest(destination).sha256!==digest||nativeRunDigest(directory).sha256!==digest)throw Error('PARENT_CHANGED_DURING_STAGING');
const fd=fs.openSync(destination,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
const manifest=Buffer.from(JSON.stringify({directory:destination,runId,sourceSha,sha256:digest}));write(destination+'.parent.json',manifest);
console.log(JSON.stringify({status:'PREPARED_UNAUDITED_NOT_ACTIVATED',manifestFile:destination+'.parent.json',manifestSha256:createHash('sha256').update(manifest).digest('hex')}));
