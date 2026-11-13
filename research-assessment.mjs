// Development-only research presentation. No rule adoption, trading gate or side effect.
import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {marketSymbol} from './market-symbol.mjs';
import {assessmentRuleIdentity} from './discovery-runtime.mjs';
import {validatedPrivateRoot,boundedPrivateFile,atomicPrivateFile} from './private-quote-retention.mjs';
const text=(x,n=220)=>typeof x==='string'?x.replace(/[\r\n]+/g,' ').slice(0,n):'';
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function researchRuleAssessment(record){
 if(!record||typeof record!=='object')return {state:'NO_RESEARCH_RULE',label:'No research rule supplied',actionAuthority:false};
 // An external ID or a legacy verdict does not authenticate the rule definition.
 const d=record.definition,identified=typeof record.id==='string'&&record.id.length>0&&d&&typeof d==='object'&&!Array.isArray(d)&&typeof d.entry==='string'&&d.entry.trim()&&typeof d.exit==='string'&&d.exit.trim()&&d.parameters&&typeof d.parameters==='object'&&!Array.isArray(d.parameters);
 const scanner=d?.schema==='SCANNER_RULE_DEFINITION_V1'?assessmentRuleIdentity({rule:d.ruleText,assessmentRule:{definition:d,ruleId:record.id,ruleVersion:record.version}}):null;
 if(scanner?.ruleIdentityState==='IDENTIFIED'){const failed=/^(?:tested:\s*)?(?:rejected|failed(?: discovery)?|stop)(?:$|[\s(_;:-])/i.test(record.verdict||'');return {state:failed?'FAILED_RESEARCH_RULE':record.adopted===true?'UNPROVEN_RESEARCH_RULE':'UNADOPTED_RESEARCH_RULE',ruleId:record.id,ruleVersion:record.version,label:(failed?'FAILED_RESEARCH_RULE':record.adopted===true?'UNPROVEN_RESEARCH_RULE':'UNADOPTED_RESEARCH_RULE')+'; rule NOT PROVEN',entry:text(d.ruleText),exit:JSON.stringify(d.exitPolicy),holdSessions:d.variant.maxHold||d.config.TIME_STOP_DAYS,actionAuthority:false};}
 const version=identified?digest(canonical(d)):null;
 const matches=identified&&record.version===version;
 const state=!identified?'UNKEYED_RESEARCH_RULE':!matches?'RULE_VERSION_UNVERIFIED':/^(?:tested:\s*)?(?:rejected|failed(?: discovery)?|stop)(?:$|[\s(_;:-])/i.test(typeof record.verdict==='string'?record.verdict.trim():'')?'FAILED_RESEARCH_RULE':record.adopted!==true?'UNADOPTED_RESEARCH_RULE':'UNPROVEN_RESEARCH_RULE';
 return {state,ruleId:identified?record.id:null,ruleVersion:matches?version:null,label:state+'; rule NOT PROVEN',actionAuthority:false,entry:matches?text(d.entry):null,exit:matches?text(d.exit):null,holdSessions:matches&&Number.isInteger(d.holdSessions)&&d.holdSessions>0?d.holdSessions:null,verdict:matches?text(record.verdict):'UNKNOWN',note:'Research evidence only; adoption and live gates remain with the existing caller'};
}
function canonical(x){if(Array.isArray(x))return x.map(canonical);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])]));return x;}
export function researchRuleVersion(definition){return digest(canonical(definition));}
export function conciseResearchDecision({symbol,record,asOf,now=Date.now(),existingExit}={}){
 const rule=researchRuleAssessment(record),at=Date.parse(asOf||''),validClock=typeof asOf==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(asOf)&&Number.isFinite(at)&&Number.isFinite(now)&&at<=now;
 // Only preserve an explicitly supplied, still-valid existing holding exit. Never derive a sell from research.
 const e=existingExit,until=Date.parse(e?.expiresAt||''),observed=Date.parse(e?.evidenceAt||'');
 let checked=false;try{checked=e?.authority==='ACTUAL_HOLDING_REVIEW'&&e.symbol===symbol&&typeof e.currentEvidence==='function'&&e.currentEvidence(now)===true;}catch{}
 const runtimeExit=checked&&e.status==='SELL'&&typeof e.reason==='string'&&e.reason.trim()&&typeof e.condition==='string'&&e.condition.trim();
 const sell=runtimeExit||validClock&&e?.authority==='EXISTING_HOLDING_EXIT'&&e?.symbol===symbol&&e?.status==='SELL'&&typeof e.reason==='string'&&e.reason.trim()&&typeof e.condition==='string'&&e.condition.trim()&&Number.isFinite(observed)&&observed<=at&&Number.isFinite(until)&&until>now&&positive(e.quantity)&&Number.isInteger(e.quantity);
 const unverifiedExit=existingExit!==undefined&&existingExit!==null&&!sell;
 const status=sell?'SELL':checked&&e.status==='HOLD'?'HOLD':unverifiedExit?'HOLDING_EXIT_UNVERIFIED':rule.state==='FAILED_RESEARCH_RULE'?'NO BUY':'WAIT';
 return {symbol:text(symbol,16)||'UNKNOWN',status,asOf:validClock?asOf:null,expiresAt:sell?e.expiresAt:null,entry:null,quantity:sell&&Number.isInteger(e.quantity)&&e.quantity>0?e.quantity:null,exit:sell?text(e.condition):null,horizon:sell?text(e.horizon):rule.holdSessions?rule.holdSessions+' research sessions; not adopted':null,costs:'$3 each executed side; spread/slippage additional; $1,000 whole-share research reference',reason:sell||checked&&e.status==='HOLD'?text(e.reason):unverifiedExit?'Supplied holding exit is unverified — check holding; '+text(e?.reason||'do not replace it with a new-entry decision'):!validClock?'Assessment clock UNKNOWN; no action supported':rule.state==='FAILED_RESEARCH_RULE'?'Exact research rule failed; no entry authority':rule.state==='NO_RESEARCH_RULE'?'No adopted entry/exit evidence supplied':rule.label,ruleState:rule.state,zad:'UNKNOWN; existing owner ZAD evidence remains authoritative',buyAuthority:false,details:'check '+(text(symbol,16)||'UNKNOWN')};
}
export function conciseResearchDecisionText(input){const r=conciseResearchDecision(input);return [r.status+' '+r.symbol,r.quantity?'quantity '+r.quantity:null,r.exit?'exit '+r.exit:null,'as of '+(r.asOf||'UNKNOWN')+(r.expiresAt?'; expires '+r.expiresAt:'; action expiry not established'),r.horizon,r.costs,r.reason,'ZAD '+r.zad,'Details: '+r.details].filter(Boolean).join(' | ');}

// Assessment presentation over existing reviewed readers. No ranking, rule adoption, persistence or sends.
export function traceResearchDecision({symbol,record,quote,instrument,zad,coverage,asOf,now=Date.now(),existingExit}={}){
 const prior=record?.exactPriorFailure,rawRule=researchRuleAssessment(record),priorFailed=rawRule.ruleVersion&&prior?.ruleVersion===rawRule.ruleVersion&&/^[a-f0-9]{64}$/.test(prior.sourceSha256||'')&&/^https:\/\/github\.com\/drrazaq\/Stock-2\/pull\/1#issuecomment-\d+$/.test(prior.reviewComment||'')&&researchRuleAssessment({...record,verdict:prior.verdict}).state==='FAILED_RESEARCH_RULE';
 const effective=priorFailed?{...record,verdict:prior.verdict}:record,rule=researchRuleAssessment(effective),base=conciseResearchDecision({symbol,record:effective,asOf,now,existingExit});
 const q=quote||{},a=record?.evidence,clock=x=>typeof x==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(x)?Date.parse(x):NaN;
 const fresh=(x,end)=>Number.isFinite(clock(x))&&clock(x)<=now&&Number.isFinite(clock(end))&&clock(end)>now;
 const missing=[];const observedAt=clock(asOf),assessed=Number.isFinite(observedAt)&&observedAt<=now;
 const keyed=!!rule.ruleVersion,artifact=keyed&&a?.symbol===symbol&&a.ruleVersion===rule.ruleVersion&&typeof a.evidenceVersion==='string'&&/^[a-f0-9]{64}$/.test(a.evidenceVersion)&&/^[a-f0-9]{64}$/.test(a.sourceSha256||'')&&fresh(a.observedAt,a.expiresAt)&&clock(a.observedAt)<=observedAt;
 const identity=instrument?.status==='ELIGIBLE_COMMON_STOCK'&&!instrument.policyExcluded&&instrument.securityId,matchingQuoteIdentity=identity&&q.securityId===instrument.securityId;
 const quoteUntil=Number.isFinite(clock(q.quoteAsOf))?new Date(clock(q.quoteAsOf)+120000).toISOString():null;
 const quoteReady=q.currentBbo===true&&q.status==='FRESH_REVIEWED_BBO_CONTEXT'&&fresh(q.quoteAsOf,quoteUntil)&&clock(q.receiptAt)>=clock(q.quoteAsOf)&&clock(q.receiptAt)<=observedAt;
 if(!assessed)missing.push('ASSESSMENT_CLOCK_UNAVAILABLE');
 if(!identity)missing.push('VERIFIED_MATCHING_IDENTITY_REQUIRED');
 if(!quoteReady)missing.push('FRESH_COMPLETE_QUOTE_REQUIRED');
 const quoteRejectionReason=!quoteReady?text(q.reason||q.why||'QUOTE_UNAVAILABLE'):null;
 if(q.currentBbo&&!matchingQuoteIdentity)missing.push('QUOTE_IDENTITY_MISMATCH');
 if(!artifact)missing.push('CURRENT_EXACT_RULE_EVIDENCE_REQUIRED');
 const cover=coverage?.status==='COMPLETE'&&coverage.symbol===symbol&&coverage.ruleVersion===rule.ruleVersion&&coverage.evidenceVersion===a?.evidenceVersion&&coverage.quoteArchiveSha256===q.archiveSha256&&coverage.identityReferenceSha256===instrument?.referenceSha256&&coverage.review?.status==='INDEPENDENT_PROVENANCE_REVIEWED'&&/^https:\/\/github\.com\/drrazaq\/Stock-2\/pull\/1#issuecomment-\d+$/.test(coverage.review.comment||'')&&clock(coverage.review.at)<=observedAt&&typeof coverage.version==='string'&&/^[a-f0-9]{64}$/.test(coverage.version)&&fresh(coverage.observedAt,coverage.expiresAt)&&clock(coverage.observedAt)<=observedAt;
 if(!cover)missing.push(coverage?'PARTIAL_COVERAGE':'COVERAGE_UNAVAILABLE');
 const setup=artifact&&['QUALIFYING','NO_SETUP'].includes(a.setup)?a.setup:'UNKNOWN';
 const zadState=zad==='ok'?'OK':zad==='fail'?'FAIL':'UNKNOWN';if(zadState==='UNKNOWN')missing.push('ZAD_UNKNOWN');
 const affordable=quoteReady&&positive(q.ask)?Math.max(0,Math.floor((1000-3)/q.ask)):null;
 if(affordable===0)missing.push('NO_AFFORDABLE_WHOLE_SHARE');
 if(quoteReady&&(!Number.isInteger(q.askSizeShares)||q.askSizeShares<1))missing.push('DISPLAYED_LIQUIDITY_UNKNOWN');
 const any=!!record||q.currentBbo===true||instrument?.status==='ELIGIBLE_COMMON_STOCK';
 const coverageState=!any?'DATA_UNAVAILABLE':missing.some(x=>x!=='ZAD_UNKNOWN')?'PARTIAL_COVERAGE':'ADEQUATELY_OBSERVED';
 const blocked=instrument?.policyExcluded===true||zadState==='FAIL'||rule.state==='FAILED_RESEARCH_RULE'||affordable===0;
 let status=['SELL','HOLD','HOLDING_EXIT_UNVERIFIED'].includes(base.status)?base.status:blocked?'NO BUY':'WAIT';
 let reason=['SELL','HOLD','HOLDING_EXIT_UNVERIFIED'].includes(status)?base.reason:rule.state==='FAILED_RESEARCH_RULE'?'Exact rule failed; pass on this setup':instrument?.policyExcluded?'Instrument excluded from ordinary-stock queue':zadState==='FAIL'?'Existing ZAD mark blocks a new entry':affordable===0?'No affordable whole share after reserving the entry fee':missing.length?missing[0]+(missing[0]==='FRESH_COMPLETE_QUOTE_REQUIRED'?': '+quoteRejectionReason:''):setup==='NO_SETUP'?'No qualifying setup observed under the exact retained rule':setup==='QUALIFYING'?'Research setup only; no adopted/proven entry authority':'Current setup evidence unavailable';
 const expiry=quoteReady&&artifact?new Date(Math.min(clock(q.quoteAsOf)+120000,clock(a.expiresAt),cover?clock(coverage.expiresAt):Infinity)).toISOString():null;
 const projection=assessed&&matchingQuoteIdentity&&quoteReady&&artifact&&cover&&setup==='QUALIFYING'&&zadState==='OK'&&affordable>0?{label:record.synthetic===true?'SYNTHETIC SOFTWARE FIXTURE — NOT A BUY':'RESEARCH SCENARIO — NOT AN ORDER',askReference:q.ask,referenceWholeShares:affordable,entryFee:3,exitFeeIfExecuted:3,spread:'embedded in ask/bid, not added again',slippage:'UNKNOWN, not assumed zero',displayedAskShares:q.askSizeShares,fill:'UNKNOWN; displayed size is not fill capacity',entryCondition:rule.entry,exitCondition:rule.exit,horizon:rule.holdSessions?rule.holdSessions+' sessions':null}:null;
 const card={symbol,status,reason,coverage:coverageState,setup:coverageState==='ADEQUATELY_OBSERVED'&&setup==='NO_SETUP'?'NO_QUALIFYING_SETUP':setup,asOf:assessed?asOf:null,expiry:['SELL','HOLD','HOLDING_EXIT_UNVERIFIED'].includes(status)?base.expiresAt:expiry,ruleState:rule.state,ruleVersion:rule.ruleVersion||null,evidenceVersion:artifact?a.evidenceVersion:null,missing,quoteRejectionReason,holdingEvidence:existingExit?.authority==='ACTUAL_HOLDING_REVIEW'?{sourceSession:existingExit.sourceSession||null,observedAt:existingExit.observedAt||null}:null,zad:zadState,entry:null,quantity:status==='SELL'?base.quantity:null,exit:status==='SELL'?base.exit:null,researchScenario:projection,quote:q.currentBbo?{provider:q.provider,feed:q.feed,quoteAt:q.quoteAsOf,receivedAt:q.receiptAt,bid:q.bid,ask:q.ask,securityId:q.securityId}:null,fillStatus:record?.fillStatus==='OBSERVED_FILL'?'UNVERIFIED_FILL_CLAIM':'NO_OBSERVED_FILL',buyAuthority:false,delivery:'PROTOTYPE_ONLY_NO_SEND',details:'check '+text(symbol,16)};
 card.text=[record?.synthetic===true?'SYNTHETIC FIXTURE — NOT A RECOMMENDATION':null,status+' '+text(symbol,16),status==='SELL'?(base.quantity?'quantity '+base.quantity+'; ':'quantity UNKNOWN; ')+base.exit:null,reason,card.holdingEvidence?'holding basis '+(card.holdingEvidence.sourceSession||'UNKNOWN session')+'; observation '+(card.holdingEvidence.observedAt||'UNKNOWN'):null,'evidence '+coverageState,'ZAD '+zadState,'as of '+(card.asOf||'UNKNOWN')+(card.expiry?'; expires '+card.expiry:''),'$3 per executed side; spread/slippage separate',card.details].filter(Boolean).join(' | ');
 return card;
}
export function researchDecisionUpdate(previous,card,{now=Date.now()}={}){
 if(previous&&['RESERVED','UNCERTAIN'].includes(previous.delivery))return {shouldRender:false,reason:'DELIVERY_UNCERTAIN_REQUIRES_RECONCILIATION',nextState:previous};
 const meaningful={status:card.status,reason:card.reason,coverage:card.coverage,setup:card.setup,ruleVersion:card.ruleVersion,evidenceVersion:card.evidenceVersion,zad:card.zad,quantity:card.quantity,exit:card.exit,missing:card.missing,scenario:card.researchScenario?{entryCondition:card.researchScenario.entryCondition,exitCondition:card.researchScenario.exitCondition,horizon:card.researchScenario.horizon,referenceWholeShares:card.researchScenario.referenceWholeShares}:null};
 const key=digest(meaningful),expiry=Date.parse(previous?.expiry||''),expired=Number.isFinite(expiry)&&now>=expiry&&previous?.expiryReported!==previous?.expiry;
 const unconfirmed=!!previous&&previous.delivery!=='CONFIRMED_SENT';
 const shouldRender=!previous||unconfirmed||previous.key!==key||expired;
 return {shouldRender,reason:!previous?'INITIAL':unconfirmed?'NOT_CONFIRMED_SENT':expired?'EXPIRED':previous.key!==key?'MEANINGFUL_CHANGE':'UNCHANGED',nextState:shouldRender?{key,expiry:card.expiry,expiryReported:expired?previous.expiry:previous?.expiryReported||null,delivery:'PROPOSED_NOT_SENT'}:previous,noSend:true};
}

// Delta A: exact evaluated-journal binding and private custody, no evaluator/admission changes.
const hashBytes=b=>createHash('sha256').update(b).digest('hex');
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const stamp=x=>typeof x==='string'&&/T.*Z$/.test(x)&&Number.isFinite(Date.parse(x));
const reviewOK=(x,now)=>x?.status==='INDEPENDENT_PROVENANCE_REVIEWED'&&/^https:\/\/github\.com\/drrazaq\/Stock-2\/pull\/1#issuecomment-\d+$/.test(x.comment||'')&&stamp(x.at)&&Date.parse(x.at)<=now;
function privateAssessmentScope({root,checkout=process.cwd(),policySha256,now=Date.now()}={}){
 root=validatedPrivateRoot(root,checkout);
 for(const n of fs.readdirSync(root))if(!/^(?:assessment-policy\.json|evaluation\.json|resolution\.json|book-current\.json|assessment-delivery\.jsonl|book-[a-f0-9]{64}\.json|journal-[a-f0-9]{64}\.jsonl|\.assessment-writer\.lock)$/.test(n))throw Error('PRIVATE_ASSESSMENT_FILE_ALLOWLIST');
 const read=(name,max=4*1024*1024)=>{const st=fs.lstatSync(path.join(root,name));if((st.mode&0o077)!==0)throw Error('PRIVATE_FILE_PERMISSIONS');return boundedPrivateFile(root,name,max);};
 const raw=read('assessment-policy.json',65536);if(!hex(policySha256)||hashBytes(raw)!==policySha256)throw Error('ASSESSMENT_POLICY_PIN');
 const policy=JSON.parse(raw);if(policy.kind!=='PRIVATE_ASSESSMENT_POLICY_V1'||!reviewOK(policy.review,now)||!hex(policy.evaluationSha256))throw Error('ASSESSMENT_POLICY_SCHEMA');
 return {root,read,policy};
}
function locked(scope,fn){const lock=path.join(scope.root,'.assessment-writer.lock');try{fs.mkdirSync(lock,{mode:0o700});}catch(e){if(e.code==='EEXIST')throw Error('LOCK_HELD_OR_STALE_RECONCILE');throw e;}const meta=path.join(lock,'owner.json');try{const fd=fs.openSync(meta,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify({owner:randomUUID(),pid:process.pid,createdAt:new Date(Date.now()).toISOString()}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return fn();}finally{fs.unlinkSync(meta);fs.rmdirSync(lock);}}
function checkBook(b){if(b?.kind!=='PRIVATE_ASSESSMENT_BOOK_V1'||!hex(b.journalSha256)||!hex(b.evaluationSha256)||!Array.isArray(b.entries)||b.entries.length>400)throw Error('ASSESSMENT_BOOK_SCHEMA');return b;}
export function bindEvaluatedAssessments(journalBytes,evaluationBytes,{now=Date.now()}={}){
 if(!Buffer.isBuffer(journalBytes)||journalBytes.length>16*1024*1024||!Buffer.isBuffer(evaluationBytes)||evaluationBytes.length>4*1024*1024)throw Error('BINDING_INPUT_BOUND');
 const journal=journalBytes.toString('utf8').split('\n').filter(Boolean).map(x=>JSON.parse(x));
 const e=JSON.parse(evaluationBytes);if(e.kind!=='EVALUATED_ASSESSMENT_INPUT_V1'||!reviewOK(e.review,now)||e.journalSha256!==hashBytes(journalBytes)||!Array.isArray(e.evaluations)||e.evaluations.length>400)throw Error('EVALUATION_SCHEMA_OR_JOURNAL_PIN');
 const entries=[];const seen=new Set();
 for(const v of e.evaluations){
  const rows=journal.filter(a=>a.type==='assessment'&&a.id===v.assessmentId);if(rows.length!==1)throw Error('NO_UNIQUE_ASSESSMENT');const a=rows[0];
  const rule=assessmentRuleIdentity({rule:a.ruleDefinition?.ruleText,assessmentRule:{definition:a.ruleDefinition,ruleId:a.ruleId,ruleVersion:a.ruleVersion}});
  if(a.ruleIdentityState!=='IDENTIFIED'||rule.ruleIdentityState!=='IDENTIFIED'||a.symbol!==v.symbol||a.ruleId!==v.ruleId||a.ruleVersion!==v.ruleVersion||a.evidenceVersion!==v.evidenceVersion||!hex(a.evidenceVersion)||v.definitionSha256!==hashBytes(Buffer.from(JSON.stringify(canonical(a.ruleDefinition))))||!hex(v.sourceSha256))throw Error('EXACT_RULE_EVIDENCE_BINDING');
  if(!stamp(v.observedAt)||!stamp(v.expiresAt)||Date.parse(v.observedAt)>now||Date.parse(v.expiresAt)<=Date.parse(v.observedAt)||!['QUALIFYING','NO_SETUP','UNKNOWN'].includes(v.setup))throw Error('EVALUATION_CLOCK_OR_SETUP');
  if(seen.has(a.symbol))throw Error('AMBIGUOUS_SYMBOL_EVALUATION');seen.add(a.symbol);
  const complete=v.population?.status==='COMPLETE'&&Array.isArray(v.population.symbols)&&v.population.symbols.length>0&&v.population.symbols.length<=400&&v.population.symbols.every(x=>typeof x==='string'&&marketSymbol(x)===x)&&new Set(v.population.symbols).size===v.population.symbols.length&&v.population.symbols.includes(a.symbol)&&v.population.sha256===digest(v.population.symbols)&&hex(v.quoteArchiveSha256)&&hex(v.identityReferenceSha256);
  const record={id:a.ruleId,version:a.ruleVersion,definition:a.ruleDefinition,verdict:v.verdict||'NOT PROVEN',adopted:false,synthetic:e.synthetic===true,evidence:{symbol:a.symbol,ruleVersion:a.ruleVersion,evidenceVersion:a.evidenceVersion,sourceSha256:v.sourceSha256,observedAt:v.observedAt,expiresAt:v.expiresAt,setup:v.setup},journalBinding:{assessmentId:a.id,horizon:a.horizon,journalSha256:hashBytes(journalBytes)}};
  const coverage={status:complete?'COMPLETE':'PARTIAL',symbol:a.symbol,ruleVersion:a.ruleVersion,evidenceVersion:a.evidenceVersion,version:digest(v),quoteArchiveSha256:v.quoteArchiveSha256,identityReferenceSha256:v.identityReferenceSha256,review:e.review,observedAt:v.observedAt,expiresAt:v.expiresAt};
  entries.push({symbol:a.symbol,record,coverage});
 }
 return checkBook({kind:'PRIVATE_ASSESSMENT_BOOK_V1',journalSha256:hashBytes(journalBytes),evaluationSha256:hashBytes(evaluationBytes),entries});
}
export function publishPrivateAssessmentBook(journalBytes,options){const s=privateAssessmentScope(options);return locked(s,()=>{
 const evaluation=s.read('evaluation.json');if(hashBytes(evaluation)!==s.policy.evaluationSha256)throw Error('EVALUATION_PIN');
 const book=bindEvaluatedAssessments(journalBytes,evaluation,options),jname='journal-'+book.journalSha256+'.jsonl';
 const raw=Buffer.from(JSON.stringify(book)),sha256=hashBytes(raw),name='book-'+sha256+'.json';
 if(raw.length>4*1024*1024)throw Error('BOOK_BYTE_BOUND');
 const present=fs.readdirSync(s.root).filter(x=>x!=='.assessment-writer.lock');
 const added=(present.includes(jname)?0:journalBytes.length)+(present.includes(name)?0:raw.length)+4096;
 if(present.reduce((n,x)=>n+s.read(x,16*1024*1024).length,0)+added>44*1024*1024)throw Error('ASSESSMENT_ROOT_BOUND'); // reserve4MiB for delivery; hard total48MiB
 const names=fs.readdirSync(s.root).filter(x=>/^book-[a-f0-9]{64}\.json$/.test(x));if(!names.includes(name)&&(names.length>=8||names.reduce((n,x)=>n+s.read(x).length,0)+raw.length>16*1024*1024))throw Error('BOOK_RETENTION_BOUND');
 if(!present.includes(jname)){const fd=fs.openSync(path.join(s.root,jname),'wx',0o600);try{fs.writeFileSync(fd,journalBytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}else if(!s.read(jname,16*1024*1024).equals(journalBytes))throw Error('IMMUTABLE_JOURNAL_CONFLICT');
 const dest=path.join(s.root,name);if(fs.existsSync(dest)){if(!s.read(name).equals(raw))throw Error('IMMUTABLE_BOOK_CONFLICT');}else{const fd=fs.openSync(dest,'wx',0o600);try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
 atomicPrivateFile(s.root,'book-current.json',Buffer.from(JSON.stringify({kind:'PRIVATE_ASSESSMENT_POINTER_V1',path:name,sha256})));
 return {sha256,entries:book.entries.length};
 });}
export function readPrivateAssessment(symbol,options){try{const s=privateAssessmentScope(options),ptr=JSON.parse(s.read('book-current.json',65536));if(ptr.kind!=='PRIVATE_ASSESSMENT_POINTER_V1'||!hex(ptr.sha256)||ptr.path!=='book-'+ptr.sha256+'.json')throw Error('BOOK_POINTER');const raw=s.read(ptr.path);if(hashBytes(raw)!==ptr.sha256)throw Error('BOOK_HASH');const b=checkBook(JSON.parse(raw));if(b.evaluationSha256!==s.policy.evaluationSha256)throw Error('BOOK_EVALUATION_PIN');const evaluation=s.read('evaluation.json');if(hashBytes(evaluation)!==s.policy.evaluationSha256)throw Error('EVALUATION_PIN');const original=s.read('journal-'+b.journalSha256+'.jsonl',16*1024*1024);if(hashBytes(original)!==b.journalSha256||JSON.stringify(bindEvaluatedAssessments(original,evaluation,options))!==JSON.stringify(b))throw Error('BOOK_DERIVATION');const xs=b.entries.filter(x=>x.symbol===symbol);if(xs.length!==1)throw Error('NO_UNIQUE_PRIVATE_RECORD');return {...xs[0],bookSha256:ptr.sha256};}catch{return {record:null,coverage:null,reason:'PRIVATE_ASSESSMENT_UNAVAILABLE'};}}
function deliveryRows(s){let b;try{b=s.read('assessment-delivery.jsonl');}catch(e){if(e.code==='ENOENT')return [];throw e;}const lines=b.toString().split('\n').filter(Boolean);if(lines.length>4096||b.length&&!b.toString().endsWith('\n'))throw Error('DELIVERY_JOURNAL_UNREADABLE');const rows=lines.map(JSON.parse);for(const r of rows)if(r.kind!=='ASSESSMENT_DELIVERY_V1'||!hex(r.key)||!['RESERVED','CONFIRMED_SENT','UNCERTAIN','PROPOSED_NOT_SENT'].includes(r.delivery)||!stamp(r.at)||typeof r.symbol!=='string'||typeof r.token!=='string')throw Error('DELIVERY_SCHEMA');return rows;}
export function readAssessmentDelivery(symbol,options){const s=privateAssessmentScope(options);return deliveryRows(s).filter(x=>x.symbol===symbol).at(-1)||null;}
function appendDelivery(s,row){const old=deliveryRows(s);const b=Buffer.from(JSON.stringify(row)+'\n');if(old.length>=4096||old.reduce((n,x)=>n+Buffer.byteLength(JSON.stringify(x))+1,0)+b.length>4*1024*1024)throw Error('DELIVERY_BOUND');const fd=fs.openSync(path.join(s.root,'assessment-delivery.jsonl'),fs.constants.O_APPEND|fs.constants.O_CREAT|fs.constants.O_WRONLY|fs.constants.O_NOFOLLOW,0o600);try{fs.writeFileSync(fd,b);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}const d=fs.openSync(s.root,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
export function reserveAssessmentDelivery(symbol,card,options){const s=privateAssessmentScope(options);return locked(s,()=>{const prior=deliveryRows(s).filter(x=>x.symbol===symbol).at(-1)||null;const u=researchDecisionUpdate(prior,card,{now:options.now??Date.now()});if(!u.shouldRender&&!(options.explicitRequest===true&&prior?.delivery==='CONFIRMED_SENT'))throw Error(u.reason);const r={kind:'ASSESSMENT_DELIVERY_V1',symbol,...u.nextState,delivery:'RESERVED',token:randomUUID(),at:new Date(options.now??Date.now()).toISOString()};appendDelivery(s,r);return r;});}
export function settleAssessmentDelivery(reservation,delivery,options){if(!['CONFIRMED_SENT','UNCERTAIN','PROPOSED_NOT_SENT'].includes(delivery))throw Error('DELIVERY_STATE');const s=privateAssessmentScope(options);return locked(s,()=>{const prior=deliveryRows(s).filter(x=>x.symbol===reservation.symbol).at(-1);if(prior?.token!==reservation.token||prior.delivery!=='RESERVED')throw Error('RESERVATION_OWNERSHIP');const r={...prior,delivery,at:new Date(options.now??Date.now()).toISOString()};appendDelivery(s,r);return r;});}

// Explicit owner-reviewed recovery only; never resets uncertainty from elapsed time/new evidence.
export function reconcileAssessmentDelivery(symbol,resolutionBytes,options){const s=privateAssessmentScope(options);if(!Buffer.isBuffer(resolutionBytes)||resolutionBytes.length>65536||!hex(s.policy.resolutionSha256)||hashBytes(resolutionBytes)!==s.policy.resolutionSha256)throw Error('PINNED_OWNER_RESOLUTION_REQUIRED');const w=JSON.parse(resolutionBytes);if(w.kind!=='OWNER_ASSESSMENT_DELIVERY_RESOLUTION_V1'||w.symbol!==symbol||!reviewOK(w.review,options.now??Date.now())||!['DEFINITELY_NOT_SENT','ACKNOWLEDGED_DELIVERED'].includes(w.disposition)||w.disposition==='ACKNOWLEDGED_DELIVERED'&&!Number.isSafeInteger(w.messageId))throw Error('OWNER_RESOLUTION_SCHEMA');return locked(s,()=>{const prior=deliveryRows(s).filter(x=>x.symbol===symbol).at(-1);if(!prior||!['RESERVED','UNCERTAIN'].includes(prior.delivery)||prior.token!==w.token||prior.key!==w.key)throw Error('OWNER_RESOLUTION_BINDING');const row={...prior,delivery:w.disposition==='DEFINITELY_NOT_SENT'?'PROPOSED_NOT_SENT':'CONFIRMED_SENT',at:new Date(options.now??Date.now()).toISOString(),resolution:{sha256:hashBytes(resolutionBytes),previous:prior.delivery,witness:w}};appendDelivery(s,row);return row;});}
