// Explicit private offline research storage. No collection, Telegram or live entry.
import fs from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {compareAssessmentOrder,evidenceHash,evaluateObservation,freezeProposal,measurePaperExit,renderDecisionCard} from '../reclaim-research-workflow.mjs';
import {runResearchDataset} from '../reclaim-research-runner.mjs';

const NAMES=Object.freeze({observations:'a-catalyst-reclaim-observations.jsonl',outcomes:'a-catalyst-reclaim-outcomes.jsonl',transactions:'a-catalyst-reclaim-transactions.jsonl'});
const LIMIT=64*1024*1024;
const pick=(object,keys)=>Object.fromEntries(keys.map(k=>[k,object?.[k]??null]));
function observationEvidence(input){return {
  issuer:pick(input,['issuerId','issuerEvidenceId','securityId','identityEvidenceId','identityAsOf']),
  clocks:pick(input,['asOf','sessionOpen','sessionClose']),
  catalyst:pick(input.catalyst,['sourceId','sourceUrl','documentHash','publishedAt','observedAt','verification','contractValueUsd','priorMarketCapUsd','marketCapAsOf','currency','contractValueBasis']),
  quote:pick(input.quote,['symbol','securityId','source','evidenceId','at','observedAt','sourceDelayMs','bid','ask','bidSize','askSize','sizeUnits']),
  zad:pick(input,['zad','zadAsOf','zadEvidenceId']),
  liquidity:pick(input,['prior20DayDollarVolume','liquidityAsOf','liquidityEvidenceId']),
  bars:(Array.isArray(input.bars)?input.bars:[]).map(b=>pick(b,['evidenceId','start','end','availableAt','open','high','low','close','volume','priorVolumeEvidenceId'])),
  delivery:{status:'NOT_APPLICABLE_OFFLINE',sentAt:null,acknowledgedAt:null,delayMs:null}
};}
function reasonCode(reason){if(!reason)return null;if(reason.includes('STALE'))return 'STALE_QUOTE';if(reason.includes('SPREAD'))return 'SPREAD_TOO_WIDE';if(reason.includes('ZAD')||reason==='CANDIDATE_ALREADY_CARDED')return 'RESEARCH_ONLY';if(/LIQUIDITY|UNSUPPORTED_INSTRUMENT|PRICE_BELOW|DISPLAYED.*SIZE/.test(reason))return 'NOT_TRADABLE';if(/NO_COMPLETED|OPENING_LOW|OPENING_VOLUME|BELOW_PROPOSED|OUTSIDE_ENTRY/.test(reason))return 'NO_QUALIFYING_SETUP';return 'MISSING_DATA';}

const error=s=>{throw new Error(s);};
const json=x=>JSON.stringify(x)+'\n';
function syncDir(directory){const fd=fs.openSync(directory,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function privateDirectory(directory){const st=fs.lstatSync(directory);if(!st.isDirectory()||st.isSymbolicLink()||fs.realpathSync(directory)!==path.resolve(directory)||(st.mode&0o077))error('PRIVATE_0700_REAL_DIRECTORY_REQUIRED');}
function readSafe(file){const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const st=fs.fstatSync(fd);if(!st.isFile()||(st.mode&0o077)||st.size>LIMIT)error('UNSAFE_OR_OVERSIZE_FILE');return fs.readFileSync(fd,'utf8');}finally{fs.closeSync(fd);}}
function exclusive(file,content){const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,content);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}syncDir(path.dirname(file));}
function readLog(file){if(!fs.existsSync(file))return [];const raw=readSafe(file);if(raw&&!raw.endsWith('\n'))error('TRUNCATED_LOG_NO_AUTOMATIC_REPAIR');let previous='GENESIS';const rows=[];for(const line of raw.split('\n').filter(Boolean)){if(Buffer.byteLength(line)>1024*1024)error('LOG_LINE_CAP');const row=JSON.parse(line),{hash,...body}=row;if(body.sequence!==rows.length||body.previousHash!==previous||evidenceHash(body)!==hash)error('LOG_INTEGRITY_FAILURE');rows.push(row);previous=hash;}return rows;}
function cardPath(directory,id){if(!/^[a-f0-9]{64}$/.test(id))error('INVALID_CARD_ID');return path.join(directory,'cards',id+'.json');}
function stateOf(directory){
 privateDirectory(directory);const manifest=JSON.parse(readSafe(path.join(directory,'manifest.json')));
 if(manifest.schema!==1||manifest.allowBuy!==false||!['SYNTHETIC','RETAINED_RESEARCH'].includes(manifest.origin))error('INVALID_MANIFEST');
 const logs=Object.fromEntries(Object.entries(NAMES).map(([k,n])=>[k,readLog(path.join(directory,n))]));
 const cards=new Map();privateDirectory(path.join(directory,'cards'));
 const files=fs.readdirSync(path.join(directory,'cards'));if(files.length>10000)error('CARD_COUNT_CAP');
 for(const file of files){if(!/^[a-f0-9]{64}\.json$/.test(file))error('UNEXPECTED_CARD_FILE');const c=JSON.parse(readSafe(path.join(directory,'cards',file)));if(c.cardId!==file.slice(0,-5)||c.origin!==manifest.origin||c.policyHash!==manifest.policyHash||c.allowBuy!==false)error('CARD_MANIFEST_MISMATCH');cards.set(c.cardId,c);}
 const intents=new Map(),committed=new Set();
 for(const row of logs.transactions){const r=row.record;if(r.type==='INTENT'){if(intents.has(r.operationId))error('DUPLICATE_TRANSACTION_INTENT');intents.set(r.operationId,r);}else if(r.type==='COMMIT'){if(!intents.has(r.operationId)||committed.has(r.operationId))error('INVALID_TRANSACTION_COMMIT');committed.add(r.operationId);}else error('INVALID_TRANSACTION_TYPE');}
 for(const tx of intents.values()){if(!['observations','outcomes'].includes(tx.log)||typeof tx.id!=='string'||!tx.id||tx.operationId!==evidenceHash({log:tx.log,id:tx.id,payload:tx.payload})||tx.payload.origin!==manifest.origin||tx.payload.policyHash!==manifest.policyHash)error('INVALID_TRANSACTION_BINDING');}
 const pending=[...intents.values()].filter(r=>!committed.has(r.operationId));
 // Log entries need their original intent; committed intents need exact materialization.
 for(const name of ['observations','outcomes']){
   const seen=new Set();for(const row of logs[name]){const r=row.record;if(seen.has(r.id))error('DUPLICATE_LOG_ID');seen.add(r.id);const tx=intents.get(r.operationId);if(!tx||tx.log!==name||evidenceHash(tx.payload)!==evidenceHash(r.payload))error('UNBOUND_LOG_RECORD');}
 }
 for(const id of committed){const tx=intents.get(id),rows=logs[tx.log];if(!rows?.some(r=>r.record.operationId===id))error('COMMITTED_RECORD_MISSING');if(tx.card&&(!cards.has(tx.card.cardId)||evidenceHash(cards.get(tx.card.cardId))!==evidenceHash(tx.card)))error('COMMITTED_CARD_MISSING_OR_CHANGED');}
 const candidates=new Set();for(const card of cards.values()){if(candidates.has(card.candidateId))error('DUPLICATE_CANDIDATE_CARD');candidates.add(card.candidateId);const tx=[...intents.values()].find(t=>t.card?.cardId===card.cardId);if(!tx||evidenceHash(tx.card)!==evidenceHash(card))error('ORPHAN_OR_CHANGED_CARD');}
 for(const name of ['observations','outcomes'])for(const row of logs[name]){
   const p=row.record.payload;if(p.origin!==manifest.origin||p.policyHash!==manifest.policyHash)error('LOG_MANIFEST_MISMATCH');
   if(p.cardId){const c=cards.get(p.cardId);if(!c||p.cardHash!==evidenceHash(c))error('CARD_LINK_MISMATCH');if(name==='outcomes'&&(p.inputHash!==c.inputHash||p.observationId!==c.observationId))error('OUTCOME_ORIGINAL_CARD_MISMATCH');}
 }
 return {manifest,logs,cards,pending};
}
export class ReclaimResearchStore {
 constructor({directory,policy,origin,implementationId,fault=()=>{}}){
   privateDirectory(directory);if(!['SYNTHETIC','RETAINED_RESEARCH'].includes(origin)||typeof implementationId!=='string'||!implementationId)error('OFFLINE_ORIGIN_AND_IMPLEMENTATION_PIN_REQUIRED');
   this.directory=directory;this.policy=structuredClone(policy);this.policyHash=freezeProposal(policy).policyHash;this.origin=origin;this.fault=fault;this.closed=false;this.token=randomBytes(16).toString('hex');this.lock=path.join(directory,'.a-reclaim-writer.lock');
   exclusive(this.lock,this.token+'\n');
   try{
     const manifest={schema:1,origin,policyHash:this.policyHash,implementationId,allowBuy:false};const file=path.join(directory,'manifest.json');
     if(!fs.existsSync(file)){
       if(fs.readdirSync(directory).some(n=>n!=='.a-reclaim-writer.lock'))error('NONEMPTY_UNINITIALIZED_DIRECTORY');
       exclusive(file,json(manifest));
     }else if(evidenceHash(JSON.parse(readSafe(file)))!==evidenceHash(manifest))error('STORE_POLICY_OR_ORIGIN_CONFLICT');
     if(!fs.existsSync(path.join(directory,'cards'))){fs.mkdirSync(path.join(directory,'cards'),{mode:0o700});syncDir(directory);}
     for(const n of Object.values(NAMES))if(!fs.existsSync(path.join(directory,n)))exclusive(path.join(directory,n),'');
     this.state=stateOf(directory);
   }catch(e){this.close();throw e;}
 }
 check(){if(this.closed)error('STORE_CLOSED');if(readSafe(this.lock)!==this.token+'\n')error('WRITER_LOCK_CHANGED');if(freezeProposal(this.policy).policyHash!==this.policyHash)error('POLICY_CHANGED');this.state=stateOf(this.directory);}
 totalBytes(){let n=0;for(const f of ['manifest.json',...Object.values(NAMES)])n+=fs.lstatSync(path.join(this.directory,f)).size;for(const f of fs.readdirSync(path.join(this.directory,'cards')))n+=fs.lstatSync(path.join(this.directory,'cards',f)).size;return n;}
 append(log,record){const file=path.join(this.directory,NAMES[log]),rows=readLog(file),body={sequence:rows.length,previousHash:rows.at(-1)?.hash||'GENESIS',record},line=json({...body,hash:evidenceHash(body)});if(Buffer.byteLength(line)>1024*1024||this.totalBytes()+Buffer.byteLength(line)>LIMIT)error('STORE_SIZE_CAP');const fd=fs.openSync(file,fs.constants.O_WRONLY|fs.constants.O_APPEND|fs.constants.O_NOFOLLOW);try{fs.writeFileSync(fd,line);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return rows.length;}
 materialize(tx){
   if(tx.card){const file=cardPath(this.directory,tx.card.cardId);if(fs.existsSync(file)){if(evidenceHash(JSON.parse(readSafe(file)))!==evidenceHash(tx.card))error('IMMUTABLE_CARD_CONFLICT');}else{const content=json(tx.card);if(this.totalBytes()+Buffer.byteLength(content)>LIMIT)error('STORE_SIZE_CAP');exclusive(file,content);}}
   this.fault('AFTER_CARD');
   const rows=readLog(path.join(this.directory,NAMES[tx.log])),existing=rows.find(r=>r.record.id===tx.id);
   if(existing){if(existing.record.operationId!==tx.operationId||evidenceHash(existing.record.payload)!==evidenceHash(tx.payload))error('IMMUTABLE_LOG_CONFLICT');}
   else this.append(tx.log,{id:tx.id,operationId:tx.operationId,payload:tx.payload});
   this.fault('AFTER_LOG');this.append('transactions',{type:'COMMIT',operationId:tx.operationId});this.fault('AFTER_COMMIT');
 }
 transact(log,id,payload,card=null){
   this.check();if(this.state.pending.length)error('PENDING_TRANSACTION_RECOVERY_REQUIRED');
   const old=this.state.logs[log].find(r=>r.record.id===id);if(old){if(evidenceHash(old.record.payload)!==evidenceHash(payload))error('IMMUTABLE_LOG_CONFLICT');return old.record.payload;}
   const tx={type:'INTENT',operationId:evidenceHash({log,id,payload}),log,id,payload,card};
   this.append('transactions',tx);this.fault('AFTER_INTENT');this.materialize(tx);this.state=stateOf(this.directory);return payload;
 }
 recordObservation(input){
   this.check();if(this.state.pending.length)error('PENDING_TRANSACTION_RECOVERY_REQUIRED');
   let event=evaluateObservation(input,this.policy);if(event.result.status==='PAPER_SETUP_ONLY'&&(typeof input.issuerId!=='string'||!input.issuerId.trim()||input.issuerId!==input.issuerId.trim()||typeof input.issuerEvidenceId!=='string'||!input.issuerEvidenceId.trim()))event={...event,result:{status:'UNKNOWN',reason:'ISSUER_MAPPING_REQUIRED',actionable:false,realDollars:0}};if(!event.observationId)error('OBSERVATION_ID_REQUIRED');
   const prior=this.state.logs.observations.find(r=>r.record.id===event.observationId);
   if(prior){if(prior.record.payload.inputHash!==event.inputHash)error('OBSERVATION_ID_CONFLICT');return prior.record.payload;}
   const candidateId=input.issuerId?evidenceHash({issuerId:input.issuerId,sessionOpen:input.sessionOpen,policyHash:this.policyHash}):null;
   let card=null,linked=null;
   if(event.result.status==='PAPER_SETUP_ONLY'){
     linked=[...this.state.cards.values()].find(c=>c.candidateId===candidateId);
     if(!linked){const cardId=evidenceHash({candidateId,observationId:event.observationId,inputHash:event.inputHash});card={schema:1,cardId,candidateId,origin:this.origin,policyHash:this.policyHash,inputHash:event.inputHash,observationId:event.observationId,securityId:event.securityId,issuerId:input.issuerId,issuerEvidenceId:input.issuerEvidenceId,allowBuy:false,realDollars:0,assessment:event.result,rendered:'Origin: '+this.origin+'\n'+renderDecisionCard(event)};linked=card;}
   }
   const payload={schema:1,origin:this.origin,policyHash:this.policyHash,observationId:event.observationId,candidateId,inputHash:event.inputHash,event,cardId:linked?.cardId||null,cardHash:linked?evidenceHash(linked):null,newPaperEntry:!!card,qualifies:!!card,decisionEvidence:observationEvidence(input),reasonCode:reasonCode(linked&&!card?'CANDIDATE_ALREADY_CARDED':event.result.reason||null),reason:linked&&!card?'CANDIDATE_ALREADY_CARDED':event.result.reason||null};
   return this.transact('observations',event.observationId,payload,card);
 }
 recordOutcome(input,exitEvidence){
   this.check();if(this.state.pending.length)error('PENDING_TRANSACTION_RECOVERY_REQUIRED');
   const observation=this.state.logs.observations.find(r=>r.record.id===input?.observationId)?.record.payload;
   if(!observation?.cardId)error('ORIGINAL_PAPER_CARD_REQUIRED');const card=this.state.cards.get(observation.cardId);
   if(evidenceHash(input)!==card.inputHash||input.observationId!==card.observationId)error('OUTCOME_ORIGINAL_INPUT_MISMATCH');
   const outcome=measurePaperExit(input,this.policy,exitEvidence),exitHash=evidenceHash(exitEvidence),id=evidenceHash({cardId:card.cardId,exitHash});
   const old=this.state.logs.outcomes.find(r=>r.record.id===id);if(old)return old.record.payload;
   if(this.state.logs.outcomes.some(r=>r.record.payload.cardId===card.cardId&&r.record.payload.outcome.status==='MODELED_PAPER_ECONOMICS_ONLY'))error('RESOLVED_OUTCOME_IMMUTABLE');
   const payload={schema:1,origin:this.origin,policyHash:this.policyHash,observationId:card.observationId,inputHash:card.inputHash,cardId:card.cardId,cardHash:evidenceHash(card),exitEvidenceHash:exitHash,exitEvidence:{asOf:exitEvidence.asOf??null,quote:pick(exitEvidence.quote,['symbol','securityId','source','evidenceId','at','observedAt','sourceDelayMs','bid','ask','bidSize','askSize','sizeUnits']),sessionCloses:exitEvidence.sessionCloses??null},controls:{status:'NOT_IMPLEMENTED',sameStockOtherDays:null,eligibleStocksSamePeriod:null},outcome};
   return this.transact('outcomes',id,payload);
 }
 appendOutcomeReviewNote({targetOutcomeId,reason,correctedRunReference=null}){
   this.check();if(this.state.pending.length)error('PENDING_TRANSACTION_RECOVERY_REQUIRED');
   const target=this.state.logs.outcomes.find(r=>r.record.id===targetOutcomeId)?.record.payload;
   if(!target||target.outcome.status==='REVIEW_NOTE_NOT_AN_OUTCOME'||typeof reason!=='string'||!reason.trim())error('ORIGINAL_OUTCOME_AND_REVIEW_REASON_REQUIRED');
   if(correctedRunReference!==null&&(typeof correctedRunReference!=='string'||!correctedRunReference.trim()))error('INVALID_CORRECTION_REFERENCE');
   const payload={schema:1,origin:this.origin,policyHash:this.policyHash,observationId:target.observationId,inputHash:target.inputHash,cardId:target.cardId,cardHash:target.cardHash,outcome:{status:'REVIEW_NOTE_NOT_AN_OUTCOME',allowBuy:false,targetOutcomeId,reason,correctedRunReference}};
   return this.transact('outcomes',evidenceHash(payload),payload);
 }
 recoverPending(){this.check();for(const tx of this.state.pending){this.materialize(tx);}this.state=stateOf(this.directory);return{pending:this.state.pending.length,allowBuy:false};}
 close(){if(this.closed)return;if(fs.existsSync(this.lock)){if(readSafe(this.lock)!==this.token+'\n')error('WRITER_LOCK_CHANGED');fs.unlinkSync(this.lock);syncDir(this.directory);}this.closed=true;}
 static inspect(directory){const s=stateOf(directory),notes=s.logs.outcomes.filter(r=>r.record.payload.outcome.status==='REVIEW_NOTE_NOT_AN_OUTCOME').length;return{origin:s.manifest.origin,observations:s.logs.observations.length,outcomes:s.logs.outcomes.length-notes,reviewNotes:notes,requiresReview:notes>0,cards:s.cards.size,pendingOperationIds:s.pending.map(t=>t.operationId),lockPresent:fs.existsSync(path.join(directory,'.a-reclaim-writer.lock')),automaticRecovery:false,allowBuy:false};}
}
export function persistResearchDataset(dataset,directory){
 const report=runResearchDataset(dataset); // Validate the entire explicit dataset before any write.
 const implementationId=evidenceHash({format:'A_PRIVATE_OFFLINE_STORE_V1',files:[fs.readFileSync(fileURLToPath(import.meta.url),'utf8'),fs.readFileSync(new URL('../reclaim-research-workflow.mjs',import.meta.url),'utf8'),fs.readFileSync(new URL('../catalyst-reclaim-prototype.mjs',import.meta.url),'utf8')]});
 const store=new ReclaimResearchStore({directory,policy:dataset.policy,origin:dataset.origin,implementationId});
 const byId=new Map(dataset.observations.map(input=>[input.observationId,input]));
 try{for(const input of [...dataset.observations].sort(compareAssessmentOrder))store.recordObservation(input);for(const a of report.admissions)if(dataset.exits?.[a.observationId])store.recordOutcome(byId.get(a.observationId),dataset.exits[a.observationId]);}finally{store.close();}
 return {...ReclaimResearchStore.inspect(directory),unappliedExitEvidence:report.unappliedExitEvidence};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{if(process.argv.length!==6||process.argv[2]!=='--input'||process.argv[4]!=='--output')error('Usage: node tools/a-catalyst-reclaim-store.mjs --input explicit-dataset.json --output existing-private-0700-directory');if(fs.statSync(process.argv[3]).size>25*1024*1024)error('INPUT_SIZE_CAP');const result=persistResearchDataset(JSON.parse(fs.readFileSync(process.argv[3],'utf8')),process.argv[5]);process.stdout.write(JSON.stringify(result)+'\n');}catch(e){const code=/^[A-Z][A-Z0-9_]{0,79}$/.test(e.message)?e.message:e.code==='EEXIST'?'WRITER_OR_TARGET_EXISTS':e instanceof SyntaxError?'INVALID_JSON_OR_LOG_RECORD':'STORAGE_IO_OR_VALIDATION_ERROR';process.stderr.write('OFFLINE STORE FAILED: '+code+'\n');process.exitCode=1;}
}
