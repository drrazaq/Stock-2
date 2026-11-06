import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {generateKeyPairSync} from 'node:crypto';
const W=process.argv[2];const {createAFencedStore}=await import(W+'/a-fenced-store.mjs');const {evidenceHash}=await import(W+'/reclaim-research-workflow.mjs');const {neutralEnrollment:NE}=await import(W+'/test/helper-retained-enrollment.mjs');
const h='a'.repeat(64),out={};const T=f=>{try{return JSON.stringify(f()).slice(0,120);}catch(e){return 'THROW:'+e.message;}};
for(const origin of ['RETAINED_RESEARCH','SYNTHETIC']){const p=fs.mkdtempSync(path.join(os.tmpdir(),'p6p-')),pair=generateKeyPairSync('ed25519');
 const s=(()=>{const ra={id:'K',publicKey:pair.publicKey.export({type:'spki',format:'pem'})};return createAFencedStore(p+'/s',{origin,cohortHash:h,contractHash:h,recoveryAuthority:ra,...(origin!=='SYNTHETIC'?{retainedEnrollment:NE(ra)}:{})});})(),t=s.claim({expectedToken:null,owner:'G1',at:'2026-11-05T12:00:00Z',boundaryEvidenceHash:h}).token;
 const body={mode:'CLAIM',expectedToken:t,owner:'PLANT',at:'2026-11-05T12:01:00Z',boundaryEvidenceHash:h,authorization:null,authorizationRawHash:null},hh=evidenceHash(body);fs.writeFileSync(p+'/s/claim-request-'+hh+'.json',JSON.stringify(body)+'\n',{mode:0o600});
 out[origin]={resumePlanted:T(()=>s.resumeClaim({generation:2,attemptHash:hh})),headAfter:T(()=>s.head().head.generation),oldTokenAfter:T(()=>s.append(t,'ACQUISITION','z',{}))};
 // operator removes planted file -> store usable again?
 fs.unlinkSync(p+'/s/claim-request-'+hh+'.json');out[origin].afterManualRemoval=T(()=>s.append(t,'ACQUISITION','z',{}).status);fs.rmSync(p,{recursive:true,force:true});}
console.log(JSON.stringify(out,null,1));
