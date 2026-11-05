import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {generateKeyPairSync,sign} from 'node:crypto';
const W=process.argv[2];const {createAFencedStore}=await import(W+'/a-fenced-store.mjs');const {evidenceHash}=await import(W+'/reclaim-research-workflow.mjs');
const h='a'.repeat(64),at='2026-11-05T12:00:00Z',later='2026-11-05T12:01:00Z',later2='2026-11-05T12:02:00Z',out={};
const T=f=>{try{const r=f();return r&&typeof r==='object'?JSON.stringify(r).slice(0,140):String(r);}catch(e){return 'THROW:'+e.message;}};
const mk=(authority=true)=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),'p5-'));fs.chmodSync(p,0o700);const pair=generateKeyPairSync('ed25519'),ra={id:'PROBE_OWNER',publicKey:pair.publicKey.export({type:'spki',format:'pem'})};const s=createAFencedStore(p+'/store',{origin:'SYNTHETIC',cohortHash:h,contractHash:h,...(authority?{recoveryAuthority:ra}:{})});const t=s.claim({expectedToken:null,owner:'G1',at,boundaryEvidenceHash:h}).token;return {p,dir:p+'/store',s,t,pair,ra};};
const auth=(x,o={},key)=>{const v=x.s.recoveryView(),body={schema:1,action:'DISPOSE_INCOMPLETE_AND_ADVANCE',storeId:v.storeId,cohortHash:v.cohortHash,contractHash:v.contractHash,expectedHeadHash:v.expectedHeadHash,nextOwner:'NEW',at:later,boundaryEvidenceHash:h,pending:v.pending,residues:v.residues,...o};return {keyId:x.ra.id,body,signature:sign(null,Buffer.from(evidenceHash(body)),(key||x.pair).privateKey).toString('base64')};};
const lose=(x,id='lost')=>T(()=>x.s.append(x.t,'ORIGINAL',id,{d:1},Buffer.from('BYTES-'+id),'AFTER_INTENT'));
// K1 reproduction
{const x=mk();out.k1_append=lose(x);out.k1_otherAppendOldGen=T(()=>x.s.append(x.t,'ACQUISITION','other',{}));out.k1_recover=T(()=>x.s.recover(x.t));
 out.k1_unsignedClaim=T(()=>x.s.claim({expectedToken:x.t,owner:'X',at:later,boundaryEvidenceHash:h}));
 const evil=generateKeyPairSync('ed25519');out.k1_wrongKey=T(()=>x.s.recoverUnresolved({authorization:auth(x,{},evil)}));
 out.k1_wrongAction=T(()=>x.s.recoverUnresolved({authorization:auth(x,{action:'CLAIM_GENERATION'})}));
 const good=auth(x);out.k1_inventoryChanged=(()=>{const y=good;return 'n/a';})();
 const r=x.s.recoverUnresolved({authorization:good});out.k1_dispose=JSON.stringify({gen:r.head.generation,unresolved:r.unresolved});
 out.k1_replaySameAuth=T(()=>x.s.recoverUnresolved({authorization:good}));
 out.k1_staleAppend=T(()=>x.s.append(x.t,'ACQUISITION','z',{}));out.k1_lookup=T(()=>x.s.lookup(r.token,'ORIGINAL','lost'));
 out.k1_reappendLost=T(()=>x.s.append(r.token,'ORIGINAL','lost',{d:1},Buffer.from('BYTES-lost')));
 out.k1_evaluate=T(()=>x.s.evaluate(r.token,'e',{},{}));out.k1_rawInvented=fs.existsSync(x.dir+'/raw-'+'x');fs.rmSync(x.p,{recursive:true,force:true});}
// K1 inventory changed between signing and use
{const x=mk();lose(x,'a');const a=auth(x);fs.writeFileSync(x.dir+'/.partial-probe',Buffer.from('residue'),{mode:0o600});out.k1_inventoryChangedAfterSign=T(()=>x.s.recoverUnresolved({authorization:a}));fs.rmSync(x.p,{recursive:true,force:true});}
// K1 without configured authority: permanent?
{const x=mk(false);lose(x);out.noAuth_dispose=T(()=>x.s.recoverUnresolved({authorization:{keyId:'x',body:{},signature:'x'}}));out.noAuth_claim=T(()=>x.s.claim({expectedToken:x.t,owner:'X',at:later,boundaryEvidenceHash:h}));out.noAuth_append=T(()=>x.s.append(x.t,'ACQUISITION','o',{}));fs.rmSync(x.p,{recursive:true,force:true});}
// K2: interrupted claim attempts
for(const fault of ['AFTER_CLAIM_ATTEMPT','DURING_ATTEMPT_WRITE','AFTER_GENERATION','BEFORE_HEAD','AFTER_SWITCH_WRITE']){const x=mk();const a1=auth(x,{action:'CLAIM_GENERATION',pending:[],residues:[],nextOwner:'C1'});
 const first=T(()=>x.s.claim({authorization:a1,fault}));const att=T(()=>x.s.generationAttempt());
 const a2=auth(x,{action:'CLAIM_GENERATION',pending:[],residues:[],nextOwner:'C2',at:later2});const other=T(()=>x.s.claim({authorization:a2}));
 let resume='';try{const g=x.s.generationAttempt();resume=g.status==='RECORDED'?T(()=>x.s.resumeClaim({generation:g.generation,attemptHash:g.attemptHash})):T(()=>x.s.claim({authorization:a1}));}catch(e){resume='THROW:'+e.message;}
 const staleAfter=T(()=>x.s.append(x.t,'ACQUISITION','s',{}));
 out['k2_'+fault]={first:first.slice(0,40),attempt:att.slice(0,80),conflictingTakeover:other.slice(0,60),resumeOrIdentical:resume.slice(0,60),staleOld:staleAfter.slice(0,40)};fs.rmSync(x.p,{recursive:true,force:true});}
// K2 torn attempt with lost original request: can an authorized DISPOSE clear it?
{const x=mk();const a1=auth(x,{action:'CLAIM_GENERATION',pending:[],residues:[],nextOwner:'C1'});T(()=>x.s.claim({authorization:a1,fault:'DURING_ATTEMPT_WRITE'}));
 out.k2torn_view=T(()=>x.s.recoveryView());out.k2torn_attempt=T(()=>x.s.generationAttempt());
 out.k2torn_dispose=T(()=>x.s.recoverUnresolved({authorization:auth(x)}));out.k2torn_newClaim=T(()=>x.s.claim({authorization:auth(x,{action:'CLAIM_GENERATION',pending:[],residues:[],nextOwner:'C3',at:later2})}));
 out.k2torn_identical=T(()=>x.s.claim({authorization:a1}));fs.rmSync(x.p,{recursive:true,force:true});}
console.log(JSON.stringify(out,null,1));
