import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const W=process.argv[2];const {createAFencedStore}=await import(W+'/a-fenced-store.mjs');const {evidenceHash}=await import(W+'/reclaim-research-workflow.mjs');
const h='a'.repeat(64),at='2026-11-05T12:00:00Z',out={};
const mk=()=>{const p=fs.mkdtempSync(path.join(os.tmpdir(),'p4-'));fs.chmodSync(p,0o700);const root=path.join(p,'store');const s=createAFencedStore(root,{origin:'SYNTHETIC',cohortHash:h,contractHash:h});const c=s.claim({expectedToken:null,owner:'G1',at,boundaryEvidenceHash:h});return {p,root,s,token:c.token};};
const tryit=f=>{try{const r=f();return r&&typeof r==='object'?JSON.stringify(r).slice(0,160):String(r);}catch(e){return 'THROW:'+e.message;}};
// P1 lost original body after intent: is there any terminal path?
{const {p,root,s,token}=mk();
 out.p1_append=tryit(()=>s.append(token,'ORIGINAL','body-lost',{x:1},Buffer.from('ORIGINAL BYTES NOW LOST'),'AFTER_INTENT'));
 out.p1_recover=tryit(()=>s.recover(token));
 out.p1_newClaim=tryit(()=>s.claim({expectedToken:token,owner:'G2',at,boundaryEvidenceHash:h}));
 out.p1_otherAppendSameGen=tryit(()=>s.append(token,'ACQUISITION','other',{y:1}));
 out.p1_head=tryit(()=>s.head());
 out.p1_pendingFiles=fs.readdirSync(root).filter(n=>n.startsWith('intent-')).length;
 fs.rmSync(p,{recursive:true,force:true});}
// P2 interrupted CLAIM residue: generation-(n+1) written but HEAD not moved (simulated), then a different claim
{const {p,root,s,token}=mk();
 const g={schema:1,generation:2,previous:s.head().head,owner:'CRASHED_CLAIM',at,boundaryEvidenceHash:h,cohortHash:h,contractHash:h};
 fs.writeFileSync(root+'/generation-2.json',JSON.stringify(g)+'\n',{mode:0o600});
 out.p2_differentClaim=tryit(()=>s.claim({expectedToken:token,owner:'G2',at,boundaryEvidenceHash:h}));
 out.p2_identicalRetry=tryit(()=>s.claim({expectedToken:token,owner:'CRASHED_CLAIM',at,boundaryEvidenceHash:h}));
 fs.rmSync(p,{recursive:true,force:true});}
// P3 fencing: token derivable by anyone from HEAD; stale writer refused after new claim
{const {p,s,token}=mk();const pub=s.head().token;out.p3_tokenPublicFromHead=pub===token;
 const t2=s.claim({expectedToken:pub,owner:'G2',at,boundaryEvidenceHash:h}).token;
 out.p3_staleAppend=tryit(()=>s.append(token,'ACQUISITION','z',{}));out.p3_newAppend=tryit(()=>s.append(t2,'ACQUISITION','z',{}));
 out.p3_staleRecover=tryit(()=>s.recover(token));fs.rmSync(p,{recursive:true,force:true});}
// P4 revision conflicts: pending intent with different payload; committed record with different payload; different original bytes same id
{const {p,s,token}=mk();
 tryit(()=>s.append(token,'ACQUISITION','rev',{v:1},undefined,'AFTER_INTENT'));
 out.p4_pendingDifferent=tryit(()=>s.append(token,'ACQUISITION','rev',{v:2}));
 out.p4_pendingSame=tryit(()=>s.append(token,'ACQUISITION','rev',{v:1}));
 out.p4_committedDifferent=tryit(()=>s.append(token,'ACQUISITION','rev',{v:2}));
 s.append(token,'ORIGINAL','o',{},Buffer.from('A'));out.p4_originalDifferentBytes=tryit(()=>s.append(token,'ORIGINAL','o',{},Buffer.from('B')));
 out.p4_genericEvaluation=tryit(()=>s.append(token,'EVALUATION','e',{status:'VERIFIED'}));
 fs.rmSync(p,{recursive:true,force:true});}
console.log(JSON.stringify(out,null,1));
