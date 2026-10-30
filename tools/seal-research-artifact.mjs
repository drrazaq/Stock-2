// Encrypt the isolated research directory before any artifact upload. No plaintext
// quote payload, key, or owner data is logged. PRIVATE_KEY is environment-only.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,scryptSync,createCipheriv,createDecipheriv} from 'node:crypto';
const keyOf=secret=>{if(typeof secret!=='string'||secret.length<16)throw Error('ARTIFACT_KEY_UNAVAILABLE');return scryptSync(secret,'Stock2ResearchArtifactV1',32);};
export function sealResearch(bytes,secret,context){
 const iv=randomBytes(12),aad=Buffer.from(JSON.stringify({version:1,context})),cipher=createCipheriv('aes-256-gcm',keyOf(secret),iv);cipher.setAAD(aad);
 const ciphertext=Buffer.concat([cipher.update(bytes),cipher.final()]);
 return {version:1,context,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export function openResearch(envelope,secret){
 if(envelope.version!==1)throw Error('UNSUPPORTED_ARTIFACT');
 const decipher=createDecipheriv('aes-256-gcm',keyOf(secret),Buffer.from(envelope.iv,'base64'));
 decipher.setAAD(Buffer.from(JSON.stringify({version:1,context:envelope.context})));decipher.setAuthTag(Buffer.from(envelope.tag,'base64'));
 return Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'base64')),decipher.final()]);
}
export function sealDirectory(input,output,secret,sourceSha,maxBytes=96*1024*1024){
 if(!/^[a-f0-9]{40}$/.test(sourceSha)||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>128*1024*1024)throw Error('INVALID_ARTIFACT_SCOPE');
 const nested=path.relative(path.resolve(input),path.resolve(output));
 if(!nested||!nested.startsWith('..'+path.sep)&&!path.isAbsolute(nested))throw Error('DISTINCT_ARTIFACT_DIRECTORIES_REQUIRED');
 if(fs.lstatSync(input).isSymbolicLink())throw Error('ARTIFACT_SYMLINK_BLOCKED');
 keyOf(secret);fs.mkdirSync(output,{recursive:true});let files=0,bytes=0;
 const walk=dir=>{for(const name of fs.readdirSync(dir)){
  const file=path.join(dir,name),stat=fs.lstatSync(file);if(stat.isSymbolicLink())throw Error('ARTIFACT_SYMLINK_BLOCKED');
  if(stat.isDirectory()){walk(file);continue;}if(!stat.isFile())throw Error('ARTIFACT_TYPE_BLOCKED');
  const relative=path.relative(input,file);if(!/^[A-Za-z0-9_./-]+$/.test(relative)||relative.includes('..'))throw Error('ARTIFACT_PATH_BLOCKED');
  if(stat.size>maxBytes)throw Error('ARTIFACT_INPUT_BUDGET_EXCEEDED');
  const encoded=JSON.stringify(sealResearch(fs.readFileSync(file),secret,{sourceSha,path:relative}));bytes+=Buffer.byteLength(encoded);if(bytes>maxBytes)throw Error('SEALED_ARTIFACT_BUDGET_EXCEEDED');
  const dest=path.join(output,relative+'.enc');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,encoded,{flag:'wx'});files++;
 }};walk(input);return {files,bytes,sourceSha,plaintextUploaded:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv.length!==4)throw Error('usage: node tools/seal-research-artifact.mjs INPUT OUTPUT');
 console.log(JSON.stringify(sealDirectory(process.argv[2],process.argv[3],process.env.PRIVATE_KEY,process.env.STOCK2_SOURCE_SHA)));
}
