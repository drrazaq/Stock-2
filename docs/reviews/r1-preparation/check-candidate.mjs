// Independent synthetic-only probe. Explicit candidate path, no network/default
// env key or production calls; never run a producer/workflow or read real data.
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {pathToFileURL} from 'node:url';
const root=process.argv[2];if(!root)throw Error('EXPLICIT_CANDIDATE_ROOT_REQUIRED');
const m=await import(pathToFileURL(path.resolve(root,'sealed-store.mjs')).href),k=m.sealedKey('SYNTHETIC_NOT_REAL_KEY'),d=fs.mkdtempSync(path.join(os.tmpdir(),'R1-review-only-'));
try{const a=path.join(d,'a.json'),b=path.join(d,'b.json');m.writeSealedJson(a,{kind:'SYNTHETIC_A'},k);m.writeSealedJson(b,{kind:'SYNTHETIC_B'},k);fs.copyFileSync(m.sealedPath(a),m.sealedPath(b));let crossAccepted=false;try{crossAccepted=m.readSealedJson(b,null,k).kind==='SYNTHETIC_A';}catch{}
const p=path.join(d,'legacy.json');fs.writeFileSync(p,'{"kind":"SYNTHETIC_LEGACY"}');let legacyMissingKeyRefused=false;try{m.readSealedJson(p,null,null);}catch{legacyMissingKeyRefused=true;}
const raw=fs.readFileSync(m.sealedPath(a),'utf8');fs.writeFileSync(m.sealedPath(a),'!'+raw+'!');let noncanonicalAccepted=false;try{noncanonicalAccepted=m.readSealedJson(a,null,k).kind==='SYNTHETIC_A';}catch{}
console.log(JSON.stringify({syntheticOnly:true,crossFileCiphertextAccepted:crossAccepted,legacyReadWithMissingKeyRefused:legacyMissingKeyRefused,noncanonicalBase64Accepted:noncanonicalAccepted,providerCalls:0,productionWrites:0},null,2));
}finally{fs.rmSync(d,{recursive:true,force:true});k.fill(0);}
