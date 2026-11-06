// Inactive proposed evidence contract. No network, credentials, enrolment or BUY wiring.
import fs from 'node:fs';
import path from 'node:path';
import {createHash,createPublicKey,verify} from 'node:crypto';
import {evidenceHash,evidenceTime,measureStructuralExitRehearsal,freezeProposal} from './reclaim-research-workflow.mjs';
import {runStructuralRehearsal} from './reclaim-research-runner.mjs';
import {aCoveragePlan,verifyIndependentCoverage} from './a-independent-coverage.mjs';
import {nativeAliasedRead,verifyNativeAInput,verifyNativeAOutcome,deriveNativeAInputFields} from './a-native-evidence-contract.mjs';
const fail = code => {throw Error(code);};
const need = (ok,code) => {if(!ok)fail(code);};
const time = value => {const t=evidenceTime(value);need(Number.isFinite(t),'INVALID_EVIDENCE_CLOCK');return t;};
const validDelay=q=>typeof q?.sourceDelayMs==='number'&&Number.isFinite(q.sourceDelayMs)&&q.sourceDelayMs>=0;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export function validateTrustContract(contract){
 need(contract?.id==='A_EVIDENCE_PROPOSAL_V2'&&contract.version===2&&contract.adopted===false,'UNADOPTED_CONTRACT_REQUIRED');
 need(contract.zadValidity==='EXPLICIT_OWNER_INTERVAL_LATEST_KNOWN'&&contract.exitSampling==='FIRST_POST_OPEN_OR_LAST_PRE_CLOSE_BBO'&&contract.originalsMaxBytes===16*1024*1024,'UNSUPPORTED_EVIDENCE_CONTRACT');
 need(/^[a-f0-9]{64}$/.test(contract.strategyPolicyHash||''),'STRATEGY_POLICY_PIN_REQUIRED');
 need(Array.isArray(contract.roots)&&contract.roots.length<=20,'TRUST_ROOTS_REQUIRED');
 need(contract.coverage==='INDEPENDENT_EXIT_WINDOW_FRAMES_V1','INDEPENDENT_COVERAGE_CONTRACT_REQUIRED');
 const ids=new Set(),keys=new Set();
 for(const root of contract.roots){
  need(typeof root.id==='string'&&!ids.has(root.id)&&Array.isArray(root.roles)&&root.roles.length===1&&['OWNER','CAPTURE','REVIEW','WITNESS'].includes(root.roles[0]),'ONE_ROLE_PER_KEY_REQUIRED');ids.add(root.id);
  const key=createPublicKey(root.publicKey);need(key.asymmetricKeyType==='ed25519','ED25519_REQUIRED');
  const fingerprint=hash(key.export({type:'spki',format:'der'}));need(!keys.has(fingerprint),'UNDERLYING_KEY_REUSED');keys.add(fingerprint);
 }
 need(Array.isArray(contract.collectors)&&contract.collectors.length<=10,'COLLECTOR_PROVENANCE_REQUIRED');
 const collectors=new Set();
 for(const c of contract.collectors){need(typeof c.id==='string'&&c.id&&!collectors.has(c.id)&&['CAPTURE','WITNESS'].includes(c.role)&&contract.roots.some(r=>r.id===c.keyId&&r.roles[0]===c.role)&&typeof c.provenanceReference==='string'&&c.provenanceReference,'COLLECTOR_PROVENANCE_REQUIRED');collectors.add(c.id);}

 return evidenceHash(contract);
}
// Directory fd anchors all reads: no symlink traversal, mutable path re-opening or network.
export function withOriginals(directory,fn){
 const root=path.resolve(directory),st=fs.lstatSync(root);
 need(st.isDirectory()&&!st.isSymbolicLink()&&fs.realpathSync(root)===root&&!(st.mode&0o077),'PRIVATE_ORIGINALS_REQUIRED');
 const fd=fs.openSync(root,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);let total=0;const seen=new Map();
 const read=(reference,control=false)=>{
  need(reference&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/.test(reference.file||'')&&(control||/^[a-f0-9]{64}$/.test(reference.sha256||'')),'ORIGINAL_REFERENCE_REQUIRED');
  const file=`/proc/self/fd/${fd}/${reference.file}`,f=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try{const before=fs.fstatSync(f);need(before.isFile()&&!(before.mode&0o077)&&before.size<=16*1024*1024,'UNSAFE_ORIGINAL');const bytes=fs.readFileSync(f),after=fs.fstatSync(f);need(before.size===after.size&&before.mtimeMs===after.mtimeMs&&(control||hash(bytes)===reference.sha256),'ORIGINAL_BYTES_CHANGED');if(!seen.has(reference.file))total+=bytes.length;need(total<=16*1024*1024,'ORIGINALS_CAP');need(seen.size<=10005,'ORIGINAL_COUNT_CAP');const actualHash=hash(bytes),old=seen.get(reference.file);need(!old||old.sha256===actualHash,'ORIGINAL_REFERENCE_CONFLICT');seen.set(reference.file,{...reference,sha256:actualHash,ino:before.ino});return bytes;}finally{fs.closeSync(f);}
 };
 read.control=file=>read({file},true);
 try{const result=fn(read);for(const ref of seen.values())read(ref);const end=fs.lstatSync(root);need(end.ino===st.ino&&end.dev===st.dev&&!end.isSymbolicLink(),'ORIGINALS_DIRECTORY_CHANGED');return result;}finally{fs.closeSync(fd);}
}
function signedOriginal(ref,role,contract,read,securityId){
 const receipt=ref?.receipt,body=receipt?.body,root=contract.roots.find(k=>k.id===receipt?.keyId&&k.roles.includes(role));
 need(root&&body?.role===role&&body.contractHash===evidenceHash(contract)&&body.securityId===securityId&&body.sha256===ref.sha256,'UNTRUSTED_RECEIPT');
 need(typeof receipt.signature==='string'&&/^[A-Za-z0-9+/]{86}==$/.test(receipt.signature)&&verify(null,Buffer.from(evidenceHash(body)),root.publicKey,Buffer.from(receipt.signature,'base64')),'RECEIPT_SIGNATURE_INVALID');
 if(['CAPTURE','WITNESS'].includes(role))need(contract.collectors.some(c=>c.keyId===root.id&&c.role===role&&c.id===body.collectorId),'COLLECTOR_PROVENANCE_REQUIRED');
 time(body.recordedAt);const bytes=read(ref);return {body,bytes};
}
function parse(bytes){try{return JSON.parse(bytes.toString('utf8'));}catch{fail('INVALID_ORIGINAL_JSON');}}
export function verifyAObservation(input,bundle,contract,read,policy){
 need(validDelay(input.quote),'INVALID_SOURCE_DELAY');
 const contractHash=validateTrustContract(contract),decision=time(input.asOf),securityId=input.securityId;
 const decisionOriginal=signedOriginal(bundle?.decision,'CAPTURE',contract,read,securityId);
 need(evidenceHash(parse(decisionOriginal.bytes))===evidenceHash(input)&&time(decisionOriginal.body.recordedAt)===decision&&decisionOriginal.body.strategyPolicyHash===contract.strategyPolicyHash,'DECISION_SNAPSHOT_NOT_CONTEMPORANEOUS');
 need(decisionOriginal.body.outcomeCoveragePlanHash===evidenceHash(aCoveragePlan(input,policy)),'COVERAGE_PLAN_NOT_PINNED_AT_ENTRY');
 // Explicit intervals replace arbitrary mark-age guesses only in this unadopted path.
 need(Array.isArray(bundle.zad)&&bundle.zad.length>0&&bundle.zad.length<=100,'ZAD_HISTORY_REQUIRED');
 const known=bundle.zad.map(ref=>{const {body,bytes}=signedOriginal(ref,'OWNER',contract,read,securityId),r=parse(bytes);need(r.securityId===securityId&&r.issuerId===input.issuerId&&typeof r.evidenceId==='string'&&['YES','NO','UNKNOWN'].includes(r.decision),'INVALID_OWNER_ATTESTATION');need(time(r.decidedAt)<=time(body.recordedAt)&&time(r.validFrom)>=time(r.decidedAt)&&time(r.validUntil)>time(r.validFrom),'INVALID_OWNER_VALIDITY');return {...r,recordedAt:body.recordedAt};}).filter(r=>time(r.recordedAt)<=decision).sort((a,b)=>time(b.decidedAt)-time(a.decidedAt));
 need(known.length,'ZAD_NOT_KNOWN_AT_DECISION');const last=known[0];
 need(known.filter(r=>r.decidedAt===last.decidedAt).every(r=>evidenceHash(r)===evidenceHash(last)),'ZAD_CONFLICT');
 need(last.decision==='YES'&&time(last.validFrom)<=decision&&decision<time(last.validUntil),'ZAD_NOT_VALID_AT_DECISION');
 need(input.zad==='YES'&&input.zadEvidenceId===last.evidenceId&&input.zadAsOf===last.decidedAt,'ZAD_INPUT_MISMATCH');
 const source=signedOriginal(bundle.source,'CAPTURE',contract,read,securityId),c=input.catalyst;
 need(source.body.sourceUrl===c.sourceUrl&&/^https:\/\//.test(c.sourceUrl)&&source.body.sha256===c.documentHash&&source.body.recordedAt===c.observedAt&&time(c.publishedAt)<=time(c.observedAt)&&time(c.observedAt)<=decision,'SOURCE_RECEIPT_MISMATCH');
 const review=signedOriginal(bundle.review,'REVIEW',contract,read,securityId),r=parse(review.bytes);
 need(time(source.body.recordedAt)<=time(review.body.recordedAt)&&time(review.body.recordedAt)<=decision&&r.sourceSha256===c.documentHash&&evidenceHash(r.claims)===evidenceHash(c),'SOURCE_CLAIMS_NOT_REVIEWED');
 return {status:'VERIFIED_UNDER_SUPPLIED_TRUST_CONTRACT',contractHash,inputHash:evidenceHash(input),sourceHash:hash(source.bytes),ownerEvidenceId:last.evidenceId,independentTruth:'NOT_ESTABLISHED_BY_SIGNATURE_ALONE'};
}
export function deriveAExit(input,policy,reference,contract,read,coverageReference){
 const {body,bytes}=signedOriginal(reference,'CAPTURE',contract,read,input.securityId),tape=parse(bytes);
 const policyHash=freezeProposal(policy).policyHash;
 const holding=input.calendar.sessions.filter(s=>time(s.open)>=time(input.sessionOpen)).slice(0,policy.maxHoldSessions);
 need(holding.length===policy.maxHoldSessions,'INCOMPLETE_HOLDING_CALENDAR');
 const end=time(holding.at(-1).close)+policy.maxExitQuoteAgeMs;
 need(tape.schema===1&&tape.complete===true&&tape.inputHash===evidenceHash(input)&&tape.policyHash===policyHash&&tape.securityId===input.securityId&&tape.startAt===input.asOf&&time(tape.endAt)===end&&time(body.recordedAt)>=end,'COMPLETE_BOUND_TAPE_REQUIRED');
 need(Array.isArray(tape.events)&&tape.events.length<=10000,'OUTCOME_EVENT_CAP');
 let previous='GENESIS',lastSeen=time(input.asOf);const ids=new Set(),sourceIds=new Set(),closes=[],quotes=[];
 for(const e of tape.events){if(e.type==='BBO')need(validDelay(e.record),'INVALID_SOURCE_DELAY');const {hash:eventHash,...content}=e;need(typeof e.id==='string'&&e.id.length>0&&e.sequence===ids.size&&e.previousHash===previous&&evidenceHash(content)===eventHash&&!ids.has(e.id),'OUTCOME_CHAIN_CONFLICT');ids.add(e.id);previous=eventHash;
  need(['CLOSE','BBO'].includes(e.type)&&e.record.securityId===input.securityId&&evidenceHash(parse(read(e.original)))===evidenceHash(e.record),'OUTCOME_ORIGINAL_MISMATCH');
  const sourceId=e.type+':'+e.record.evidenceId;need(typeof e.record.evidenceId==='string'&&e.record.evidenceId&&!sourceIds.has(sourceId)&&!e.record.revisionOf,'OUTCOME_REVISION_CONFLICT');sourceIds.add(sourceId);
  const at=time(e.record.at),seen=time(e.type==='CLOSE'?e.record.availableAt:e.record.observedAt);need(at<=seen&&seen>=lastSeen&&at>=time(input.asOf)&&seen<=end,'OUTCOME_CLOCK_ORDER');lastSeen=seen;
  if(e.type==='CLOSE'){need(typeof e.record.close==='number'&&Number.isFinite(e.record.close)&&e.record.close>0,'INVALID_SESSION_CLOSE');closes.push(e.record);}else quotes.push(e.record);
 }
 need(closes.length===holding.length&&holding.every(s=>closes.filter(c=>c.sessionDate===s.date&&c.at===s.close).length===1),'MISSING_OR_DUPLICATE_CLOSES');
 let target=time(holding.at(-1).close),kind='MAX_SESSION_CLOSE';
 for(let i=0;i<holding.length-1;i++){const close=closes.find(c=>c.sessionDate===holding[i].date);need(typeof close.close==='number'&&Number.isFinite(close.close)&&close.close>0,'INVALID_SESSION_CLOSE');need(time(close.availableAt)<=time(holding[i+1].open),'CLOSE_NOT_KNOWN_BY_NEXT_OPEN');if(close.close<input.bars[0].low){target=time(holding[i+1].open);kind='CLOSE_INVALIDATION_NEXT_OPEN';break;}}
 const eligible=quotes.filter(q=>kind==='MAX_SESSION_CLOSE'?time(q.at)>=target-policy.maxExitQuoteAgeMs&&time(q.at)<target:time(q.at)>=target&&time(q.at)<=target+policy.maxExitQuoteAgeMs).sort((a,b)=>kind==='MAX_SESSION_CLOSE'?time(b.at)-time(a.at):time(a.at)-time(b.at));
 need(eligible.length,'RULE_EXIT_QUOTE_MISSING');const quote=eligible[0];need(eligible.filter(q=>q.at===quote.at).every(q=>evidenceHash(q)===evidenceHash(quote)),'RULE_EXIT_QUOTE_CONFLICT');
 const receiptDeadline=kind==='MAX_SESSION_CLOSE'?target:target+policy.maxExitQuoteAgeMs;
 need(time(quote.observedAt)<=receiptDeadline&&time(quote.at)+quote.sourceDelayMs<=receiptDeadline,'RULE_EXIT_RECEIPT_LATE');
 // Never skip a selected invalid/undersized quote for a more favourable one.
 const exitEvidence={asOf:body.recordedAt,sessionCloses:closes,quote},outcome=measureStructuralExitRehearsal(input,policy,exitEvidence);
 const coverage=outcome.status==='MODELED_PAPER_ECONOMICS_ONLY'?verifyIndependentCoverage({input,policy,tape,reference:coverageReference,contract,read,signedOriginal}):{status:'UNRESOLVED_INPUT_NOT_COVERAGE_VERIFIED'};
 return {outcome,exitEvidence,coverage,tapeHash:hash(bytes),selectedQuoteHash:evidenceHash(quote),sampling:contract.exitSampling};
}
export function runAEvidenceDataset(dataset,contract,directory,storeContext=null){
 if(Array.isArray(dataset?.observations))for(const input of dataset.observations)need(validDelay(input?.quote),'INVALID_SOURCE_DELAY');
 validateTrustContract(contract);need(freezeProposal(dataset.policy).policyHash===contract.strategyPolicyHash,'STRATEGY_POLICY_PIN_MISMATCH');need(!Object.hasOwn(dataset,'exits'),'CALLER_SELECTED_EXITS_FORBIDDEN');
 need(['SYNTHETIC','RETAINED_RESEARCH'].includes(dataset.origin),'OFFLINE_ORIGIN_REQUIRED');
 const structural={...runStructuralRehearsal({...dataset,origin:'SYNTHETIC',exits:{}}),inputOrigin:dataset.origin,calculationOnly:true},results=[];
 return withOriginals(directory,originalRead=>{
  const read=dataset.nativeImport?nativeAliasedRead(originalRead,dataset.nativeImport.files):originalRead;
  for(const input of dataset.observations){let evidence,derived,native,nativeOutcome;try{if(dataset.origin==='RETAINED_RESEARCH'||dataset.nativeImport||dataset.evidence?.[input.observationId]?.nativeBinding){need(dataset.nativeImport?.version===1,'NATIVE_IMPORT_REQUIRED');native=verifyNativeAInput({input,bundle:dataset.evidence[input.observationId],contract,read,signedOriginal,origin:dataset.origin,policy:dataset.policy,storeContext});}evidence=verifyAObservation(input,dataset.evidence?.[input.observationId],contract,read,dataset.policy);if(native&&structural.admissions.some(a=>a.observationId===input.observationId))nativeOutcome=verifyNativeAOutcome({input,bundle:dataset.evidence[input.observationId],contract,read,signedOriginal});if(structural.admissions.some(a=>a.observationId===input.observationId))derived=deriveAExit(input,dataset.policy,dataset.evidence[input.observationId].outcomes,contract,read,dataset.evidence[input.observationId].coverage);results.push({observationId:input.observationId,status:derived&&derived.outcome.status!=='MODELED_PAPER_ECONOMICS_ONLY'?'OUTCOME_UNRESOLVED':'VERIFIED_UNDER_SUPPLIED_TRUST_CONTRACT',evidence,derived:derived||null,...(native?{native}:{}),...(nativeOutcome?{nativeOutcome}:{})});}catch(e){results.push({observationId:input.observationId,status:'UNRESOLVED',reason:/^[A-Z_]+$/.test(e.message)?e.message:'EVIDENCE_IO_OR_SCHEMA_ERROR'});}}
  return {schema:1,status:'INACTIVE_UNADOPTED_EVIDENCE_RESEARCH',origin:dataset.origin,synthetic:dataset.origin==='SYNTHETIC',allowBuy:false,realDollars:0,prospectiveAdmissions:0,contractHash:evidenceHash(contract),structuralNotAuthenticated:structural,results,limitations:['Trusted signer honesty and complete acquisition require separately reviewed live integration','Retained originals and signatures do not establish independent source truth','No controls, representative population or trading edge established','No current ZAD policy or frozen cohort changed']};
 });
}

// Read-only G2 assembly through the same role verification used by strict evaluation.
export function deriveAOriginalInput({input,bundle,contract,read,policy}){
 validateTrustContract(contract);need(freezeProposal(policy).policyHash===contract.strategyPolicyHash,'STRATEGY_POLICY_PIN_MISMATCH');
 return deriveNativeAInputFields({input,bundle,contract,read,signedOriginal,policy});
}
