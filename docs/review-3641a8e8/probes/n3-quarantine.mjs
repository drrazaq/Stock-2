import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {generateKeyPairSync,sign,createHash} from 'node:crypto';
const W=process.argv[2];const {createAFencedStore}=await import(W+'/a-fenced-store.mjs');const {evidenceHash}=await import(W+'/reclaim-research-workflow.mjs');const {neutralEnrollment}=await import(W+'/test/helper-retained-enrollment.mjs');
const h='a'.repeat(64),at='2026-11-05T12:00:00Z',later='2026-11-05T12:01:00Z',out={};const dg=b=>createHash('sha256').update(b).digest('hex');
const T=f=>{try{const r=f();return typeof r==='object'?JSON.stringify(r).slice(0,150):String(r);}catch(e){return 'THROW:'+e.message;}};
function mk(origin){const p=fs.mkdtempSync(path.join(os.tmpdir(),'p7q-')),pair=generateKeyPairSync('ed25519'),ra={id:'OWNER_RECOVERY_01',publicKey:pair.publicKey.export({type:'spki',format:'pem'})};const s=createAFencedStore(p+'/s',{origin,cohortHash:h,contractHash:h,recoveryAuthority:ra,...(origin!=='SYNTHETIC'?{retainedEnrollment:neutralEnrollment(ra)}:{})});const t=s.claim({expectedToken:null,owner:'G1',at,boundaryEvidenceHash:h}).token;return {p,dir:p+'/s',s,t,pair,ra};}
const signed=(x,body)=>({keyId:x.ra.id,body,signature:sign(null,Buffer.from(evidenceHash(body)),x.pair.privateKey).toString('base64')});
const src=(x,a,name)=>{const d=x.p+'/auth';fs.mkdirSync(d,{recursive:true,mode:0o700});const b=Buffer.from(JSON.stringify(a)+'\n');fs.writeFileSync(d+'/'+name,b,{mode:0o600});return {directory:d,file:name,sha256:dg(b)};};
const qbody=(x,file)=>({schema:1,action:'QUARANTINE_INVALID_REQUEST',storeId:x.s.inspectRequest(file).storeId,cohortHash:h,contractHash:h,expectedHeadHash:x.t,reason:'UNVERIFIABLE_UNREFERENCED_RESERVATION',requestFile:file,requestSha256:dg(fs.readFileSync(x.dir+'/'+file)),boundaryEvidenceHash:h,at:later});
const claimBody=(x,o={})=>{const v=x.s.recoveryView();return {schema:1,action:'CLAIM_GENERATION',storeId:v.storeId,cohortHash:v.cohortHash,contractHash:v.contractHash,expectedHeadHash:v.expectedHeadHash,nextOwner:'NEW',at:later,boundaryEvidenceHash:h,pending:[],residues:[],...o};};
for(const kind of ['plainUnsignedClaim','badSignatureTakeover','validSignedReservation']){const x=mk('RETAINED_RESEARCH');let file;
 if(kind==='plainUnsignedClaim'){const b={mode:'CLAIM',expectedToken:x.t,owner:'PLANT',at:later,boundaryEvidenceHash:h,authorization:null,authorizationRawHash:null};file='claim-request-'+evidenceHash(b)+'.json';fs.writeFileSync(x.dir+'/'+file,JSON.stringify(b)+'\n',{mode:0o600});}
 else if(kind==='badSignatureTakeover'){const a=signed(x,claimBody(x));a.signature='A'.repeat(86)+'==';file='takeover-request-'+'c'.repeat(64)+'.json';fs.writeFileSync(x.dir+'/'+file,JSON.stringify(a)+'\n',{mode:0o600});}
 else{const a=signed(x,claimBody(x)),s=src(x,a,'legit.json');T(()=>x.s.claim({authorizationSource:s}));/* not torn: completes; instead create torn via copy */}
 const o={};
 if(kind==='validSignedReservation'){// build a genuine reserved-but-unfinished request on a SYNTHETIC store via fault
  const y=mk('SYNTHETIC');const a=signed(y,claimBody(y)),s=src(y,a,'r.json');T(()=>y.s.claim({authorizationSource:s,fault:'AFTER_REQUEST_ARCHIVE'}));file=fs.readdirSync(y.dir).find(n=>n.startsWith('takeover-request-'));
  const qa=signed(y,qbody(y,file));o.quarantineValid=T(()=>y.s.quarantineRequest({authorizationSource:src(y,qa,'q.json')}));o.stillResumable=T(()=>{const g=y.s.generationAttempt();return y.s.resumeClaim({generation:g.generation,attemptHash:g.attemptHash}).head.generation;});out[kind]=o;continue;}
 const before=fs.readFileSync(x.dir+'/'+file);
 o.inspect=T(()=>x.s.inspectRequest(file));
 const qa=signed(x,qbody(x,file));
 o.quarantineInlineOnly=T(()=>x.s.quarantineRequest({authorization:qa}));
 o.quarantineWrongKey=T(()=>{const ev=generateKeyPairSync('ed25519');return x.s.quarantineRequest({authorizationSource:src(x,{...qa,signature:sign(null,Buffer.from(evidenceHash(qa.body)),ev.privateKey).toString('base64')},'bad.json')});});
 o.quarantine=T(()=>x.s.quarantineRequest({authorizationSource:src(x,qa,'q.json')}));
 o.originalRetained=fs.existsSync(x.dir+'/'+file)&&fs.readFileSync(x.dir+'/'+file).equals(before);
 o.headUnchanged=T(()=>x.s.head().head.generation);
 o.appendOldTokenAfter=T(()=>x.s.append(x.t,'ACQUISITION','z',{}).status);
 o.resumePlanted=T(()=>x.s.resumeClaim({generation:2,attemptHash:file.slice(file.lastIndexOf('-')+1,-5)}));
 o.legitClaimAfter=T(()=>x.s.claim({authorizationSource:src(x,signed(x,claimBody(x)),'c.json')}).head.generation);
 out[kind]=o;}
console.log(JSON.stringify(out,null,1));
