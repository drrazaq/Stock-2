import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {generateKeyPairSync,sign,createHash} from 'node:crypto';
const W='<WORKTREE_118ED4C5>';const {neutralEnrollment}=await import(W+'/test/helper-retained-enrollment.mjs');const {createAFencedStore}=await import(W+'/a-fenced-store.mjs');const {evidenceHash}=await import(W+'/reclaim-research-workflow.mjs');
const h='a'.repeat(64),at='2026-11-05T12:00:00Z',later='2026-11-05T12:01:00Z',out={};
const T=f=>{try{const r=f();return r&&typeof r==='object'?JSON.stringify(r).slice(0,160):String(r);}catch(e){return 'THROW:'+e.message;}};
const tmp=()=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),'p6-'));fs.chmodSync(p,0o700);return p;};
const key=()=>{const pair=generateKeyPairSync('ed25519');return {pair,ra:{id:'PROBE_OWNER',publicKey:pair.publicKey.export({type:'spki',format:'pem'})}};};
const mk=(origin='SYNTHETIC',withAuth=true)=>{const p=tmp(),k=key();const s=createAFencedStore(p+'/store',{origin,cohortHash:h,contractHash:h,...(withAuth?{recoveryAuthority:k.ra}:{}),...(withAuth&&origin!=='SYNTHETIC'?{retainedEnrollment:neutralEnrollment(k.ra)}:{})});const t=s.claim({expectedToken:null,owner:'G1',at,boundaryEvidenceHash:h}).token;return {p,dir:p+'/store',s,t,...k};};
const signBody=(x,action,o={})=>{const v=x.s.recoveryView(),body={schema:1,action,storeId:v.storeId,cohortHash:v.cohortHash,contractHash:v.contractHash,expectedHeadHash:v.expectedHeadHash,nextOwner:'NEW',at:later,boundaryEvidenceHash:h,pending:v.pending,residues:v.residues,...o};return {keyId:x.ra.id,body,signature:sign(null,Buffer.from(evidenceHash(body)),x.pair.privateKey).toString('base64')};};
const src=(x,a,mode=0o600,name='req.json')=>{const d=x.p+'/auth';fs.mkdirSync(d,{recursive:true,mode:0o700});const b=Buffer.from(JSON.stringify(a)+'\n');fs.writeFileSync(d+'/'+name,b,{mode});fs.chmodSync(d+'/'+name,mode);return {directory:d,file:name,sha256:createHash('sha256').update(b).digest('hex')};};
// ---- L1
out.L1_initRetainedNoAuthority=T(()=>{const p=tmp();createAFencedStore(p+'/s',{origin:'RETAINED_RESEARCH',cohortHash:h,contractHash:h});return 'CREATED';});
out.L1_initRetainedWithAuthority=T(()=>{const x=mk('RETAINED_RESEARCH');return x.s.head().authorityEnrolled;});
// previous-version (2c9) store created by the frozen 2c9 module source, RETAINED without authority
{const p=tmp(),mod=W+'/.p6-2c9.mjs';fs.copyFileSync(W+'/docs/a-native-importer/fixtures/a-fenced-store-2c9.source',mod);
 try{const old=await import(mod);const s=old.createAFencedStore(p+'/s',{origin:'RETAINED_RESEARCH',cohortHash:h,contractHash:h});const t=s.claim({expectedToken:null,owner:'G1',at,boundaryEvidenceHash:h}).token;out.L1_prev_oldModuleAppend=T(()=>s.append(t,'ACQUISITION','pre',{}).status);
  const n=createAFencedStore(p+'/s');out.L1_prev_head=T(()=>{const r=n.head();return {gen:r.head.generation,authorityEnrolled:r.authorityEnrolled};});out.L1_prev_view=T(()=>Object.keys(n.recoveryView()).join(','));out.L1_prev_attempt=T(()=>n.generationAttempt().status);
  out.L1_prev_append=T(()=>n.append(t,'ACQUISITION','x',{}));out.L1_prev_lookup=T(()=>n.lookup(t,'ACQUISITION','pre'));out.L1_prev_claim=T(()=>n.claim({expectedToken:t,owner:'N',at:later,boundaryEvidenceHash:h}));out.L1_prev_evaluate=T(()=>n.evaluate(t,'e',{},{}));
  out.L1_prev_addAuthorityByReinit=T(()=>createAFencedStore(p+'/s',{origin:'RETAINED_RESEARCH',cohortHash:h,contractHash:h,recoveryAuthority:key().ra}));
  out.L1_prev_storeJsonOverwrite=T(()=>{fs.writeFileSync(p+'/s/STORE.json','x');return 'WROTE';});
 }finally{fs.rmSync(mod,{force:true});}}
// ---- L2 durable signed request on non-synthetic store
{const x=mk('RETAINED_RESEARCH');const a=signBody(x,'CLAIM_GENERATION');
 out.L2_inlineOnly=T(()=>x.s.claim({authorization:a}));
 out.L2_sourceMode644=T(()=>x.s.claim({authorizationSource:src(x,a,0o644,'r644.json')}));
 const s=src(x,a);out.L2_sourceHashWrong=T(()=>x.s.claim({authorizationSource:{...s,sha256:'0'.repeat(64)}}));
 out.L2_sourceInlineConflict=T(()=>x.s.claim({authorizationSource:s,authorization:signBody(x,'CLAIM_GENERATION',{nextOwner:'OTHER'})}));
 out.L2_unsignedClaim=T(()=>x.s.claim({expectedToken:x.t,owner:'X',at:later,boundaryEvidenceHash:h}));
 out.L2_appendAfterTornFault=T(()=>x.s.claim({authorizationSource:s,fault:'AFTER_REQUEST_ARCHIVE'}));
 const r=x.s.claim({authorizationSource:s});out.L2_validClaim=JSON.stringify({gen:r.head.generation});
 out.L2_archiveFiles=fs.readdirSync(x.dir).filter(n=>/request-/.test(n)).length;
 out.L2_staleAppend=T(()=>x.s.append(x.t,'ACQUISITION','s',{}));out.L2_newAppend=T(()=>x.s.append(r.token,'ACQUISITION','s',{}).status);
 out.L2_replaySameAuth=T(()=>x.s.claim({authorizationSource:s}));fs.rmSync(x.p,{recursive:true,force:true});}
// Torn stages with original request then LOST (synthetic store: faults refused elsewhere)
for(const stage of ['AFTER_REQUEST_ARCHIVE','DURING_ATTEMPT_WRITE','AFTER_CLAIM_ATTEMPT','AFTER_GENERATION','BEFORE_HEAD','AFTER_SWITCH_WRITE']){
 const x=mk('SYNTHETIC');const a=signBody(x,'CLAIM_GENERATION');const s=src(x,a);const r1=T(()=>x.s.claim({authorizationSource:s,fault:stage}));fs.rmSync(x.p+'/auth',{recursive:true,force:true});
 const g=T(()=>x.s.generationAttempt());let ga;try{ga=x.s.generationAttempt();}catch{}
 const old=T(()=>x.s.append(x.t,'ACQUISITION','o',{}));const b=signBody(x,'CLAIM_GENERATION',{nextOwner:'THIEF',expectedHeadHash:x.t});const conflict=T(()=>x.s.claim({authorization:b}));
 const resume=ga?.attemptHash?T(()=>x.s.resumeClaim({generation:ga.generation,attemptHash:ga.attemptHash}).head.generation):'NO_PIN';
 const after=T(()=>x.s.append(x.t,'ACQUISITION','o2',{}));
 out['L2_torn_'+stage]={fault:r1.slice(0,40),attempt:g.slice(0,90),oldTokenDuring:old,conflictingTakeover:conflict,resumeWithoutOriginal:resume,oldTokenAfter:after};fs.rmSync(x.p,{recursive:true,force:true});}
// Torn DISPOSE with lost intent, original request lost
{const x=mk('SYNTHETIC');T(()=>x.s.append(x.t,'ORIGINAL','lost',{},Buffer.from('B'),'AFTER_INTENT'));const a=signBody(x,'DISPOSE_INCOMPLETE_AND_ADVANCE');const s=src(x,a);out.L2_dispose_torn=T(()=>x.s.recoverUnresolved({authorizationSource:s,fault:'AFTER_REQUEST_ARCHIVE'}));fs.rmSync(x.p+'/auth',{recursive:true,force:true});
 const ga=x.s.generationAttempt();out.L2_dispose_attempt=ga.status;out.L2_dispose_resume=T(()=>{const r=x.s.resumeClaim({generation:ga.generation,attemptHash:ga.attemptHash});return {gen:r.head.generation,unresolved:r.unresolved};});fs.rmSync(x.p,{recursive:true,force:true});}
// Tampered archive
{const x=mk('SYNTHETIC');const s=src(x,signBody(x,'CLAIM_GENERATION'));T(()=>x.s.claim({authorizationSource:s,fault:'AFTER_REQUEST_ARCHIVE'}));const f=fs.readdirSync(x.dir).find(n=>n.startsWith('takeover-request-'));const ga=x.s.generationAttempt();const j=JSON.parse(fs.readFileSync(x.dir+'/'+f));j.body.nextOwner='TAMPER';fs.chmodSync(x.dir+'/'+f,0o600);fs.writeFileSync(x.dir+'/'+f,JSON.stringify(j)+'\n');out.L2_tamperedArchive_attempt=T(()=>x.s.generationAttempt());out.L2_tamperedArchive_resume=T(()=>x.s.resumeClaim({generation:ga.generation,attemptHash:ga.attemptHash}));fs.rmSync(x.p,{recursive:true,force:true});}
// Planted unauthorized request file in a RETAINED store (local write access)
for(const kind of ['plainClaim','badSignature']){const x=mk('RETAINED_RESEARCH');let body,name;
 if(kind==='plainClaim'){body={mode:'CLAIM',expectedToken:x.t,owner:'PLANT',at:later,boundaryEvidenceHash:h,authorization:null,authorizationRawHash:null};name='claim-request-'+evidenceHash(body)+'.json';}
 else{const a=signBody(x,'CLAIM_GENERATION');a.signature='A'.repeat(86)+'==';body=a;name='takeover-request-'+'c'.repeat(64)+'.json';}
 fs.writeFileSync(x.dir+'/'+name,JSON.stringify(body)+'\n',{mode:0o600});
 const legit=src(x,signBody(x,'CLAIM_GENERATION'));
 out['plant_'+kind]={append:T(()=>x.s.append(x.t,'ACQUISITION','q',{})),attempt:T(()=>x.s.generationAttempt()),legitClaim:T(()=>x.s.claim({authorizationSource:legit})),dispose:T(()=>x.s.recoverUnresolved({authorizationSource:src(x,signBody(x,'DISPOSE_INCOMPLETE_AND_ADVANCE'),0o600,'d.json')}))};fs.rmSync(x.p,{recursive:true,force:true});}
console.log(JSON.stringify(out,null,1));
