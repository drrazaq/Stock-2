// Development-only research presentation. No rule adoption, trading gate or side effect.
import {createHash} from 'node:crypto';
const text=(x,n=220)=>typeof x==='string'?x.replace(/[\r\n]+/g,' ').slice(0,n):'';
const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function researchRuleAssessment(record){
 if(!record||typeof record!=='object')return {state:'NO_RESEARCH_RULE',label:'No research rule supplied',actionAuthority:false};
 // An external ID or a legacy verdict does not authenticate the rule definition.
 const d=record.definition,identified=typeof record.id==='string'&&record.id.length>0&&d&&typeof d==='object'&&!Array.isArray(d)&&typeof d.entry==='string'&&d.entry.trim()&&typeof d.exit==='string'&&d.exit.trim()&&d.parameters&&typeof d.parameters==='object'&&!Array.isArray(d.parameters);
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
 const sell=validClock&&e?.authority==='EXISTING_HOLDING_EXIT'&&e?.symbol===symbol&&e?.status==='SELL'&&typeof e.reason==='string'&&e.reason.trim()&&typeof e.condition==='string'&&e.condition.trim()&&Number.isFinite(observed)&&observed<=at&&Number.isFinite(until)&&until>now&&positive(e.quantity)&&Number.isInteger(e.quantity);
 const status=sell?'SELL':rule.state==='FAILED_RESEARCH_RULE'?'NO BUY':'WAIT';
 return {symbol:text(symbol,16)||'UNKNOWN',status,asOf:validClock?asOf:null,expiresAt:sell?e.expiresAt:null,entry:null,quantity:sell?e.quantity:null,exit:sell?text(e.condition):null,horizon:sell?text(e.horizon):rule.holdSessions?rule.holdSessions+' research sessions; not adopted':null,costs:'$3 each executed side; spread/slippage additional; $1,000 whole-share research reference',reason:sell?text(e.reason):!validClock?'Assessment clock UNKNOWN; no action supported':rule.state==='FAILED_RESEARCH_RULE'?'Exact research rule failed; no entry authority':rule.state==='NO_RESEARCH_RULE'?'No adopted entry/exit evidence supplied':rule.label,ruleState:rule.state,zad:'UNKNOWN; existing owner ZAD evidence remains authoritative',buyAuthority:false,details:'check '+(text(symbol,16)||'UNKNOWN')};
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
 let status=base.status==='SELL'?'SELL':blocked?'NO BUY':'WAIT';
 let reason=status==='SELL'?base.reason:rule.state==='FAILED_RESEARCH_RULE'?'Exact rule failed; pass on this setup':instrument?.policyExcluded?'Instrument excluded from ordinary-stock queue':zadState==='FAIL'?'Existing ZAD mark blocks a new entry':affordable===0?'No affordable whole share after reserving the entry fee':missing.length?missing[0]:setup==='NO_SETUP'?'No qualifying setup observed under the exact retained rule':setup==='QUALIFYING'?'Research setup only; no adopted/proven entry authority':'Current setup evidence unavailable';
 const expiry=quoteReady&&artifact?new Date(Math.min(clock(q.quoteAsOf)+120000,clock(a.expiresAt),cover?clock(coverage.expiresAt):Infinity)).toISOString():null;
 const projection=assessed&&matchingQuoteIdentity&&quoteReady&&artifact&&cover&&setup==='QUALIFYING'&&zadState==='OK'&&affordable>0?{label:record.synthetic===true?'SYNTHETIC SOFTWARE FIXTURE — NOT A BUY':'RESEARCH SCENARIO — NOT AN ORDER',askReference:q.ask,referenceWholeShares:affordable,entryFee:3,exitFeeIfExecuted:3,spread:'embedded in ask/bid, not added again',slippage:'UNKNOWN, not assumed zero',displayedAskShares:q.askSizeShares,fill:'UNKNOWN; displayed size is not fill capacity',entryCondition:rule.entry,exitCondition:rule.exit,horizon:rule.holdSessions?rule.holdSessions+' sessions':null}:null;
 const card={symbol,status,reason,coverage:coverageState,setup:coverageState==='ADEQUATELY_OBSERVED'&&setup==='NO_SETUP'?'NO_QUALIFYING_SETUP':setup,asOf:assessed?asOf:null,expiry:status==='SELL'?base.expiresAt:expiry,ruleState:rule.state,ruleVersion:rule.ruleVersion||null,evidenceVersion:artifact?a.evidenceVersion:null,missing,zad:zadState,entry:null,quantity:status==='SELL'?base.quantity:null,exit:status==='SELL'?base.exit:null,researchScenario:projection,quote:q.currentBbo?{provider:q.provider,feed:q.feed,quoteAt:q.quoteAsOf,receivedAt:q.receiptAt,bid:q.bid,ask:q.ask,securityId:q.securityId}:null,fillStatus:record?.fillStatus==='OBSERVED_FILL'?'UNVERIFIED_FILL_CLAIM':'NO_OBSERVED_FILL',buyAuthority:false,delivery:'PROTOTYPE_ONLY_NO_SEND',details:'check '+text(symbol,16)};
 card.text=[status+' '+text(symbol,16),status==='SELL'?'quantity '+base.quantity+'; '+base.exit:null,reason,'evidence '+coverageState,'ZAD '+zadState,'as of '+(card.asOf||'UNKNOWN')+(card.expiry?'; expires '+card.expiry:''),'$3 per executed side; spread/slippage separate',card.details].filter(Boolean).join(' | ');
 return card;
}
export function researchDecisionUpdate(previous,card,{now=Date.now()}={}){
 if(previous&&['RESERVED','UNCERTAIN'].includes(previous.delivery))return {shouldRender:false,reason:'DELIVERY_UNCERTAIN_REQUIRES_RECONCILIATION',nextState:previous};
 const meaningful={status:card.status,reason:card.reason,coverage:card.coverage,setup:card.setup,ruleVersion:card.ruleVersion,evidenceVersion:card.evidenceVersion,zad:card.zad,quantity:card.quantity,exit:card.exit,missing:card.missing,scenario:card.researchScenario?{entryCondition:card.researchScenario.entryCondition,exitCondition:card.researchScenario.exitCondition,horizon:card.researchScenario.horizon,referenceWholeShares:card.researchScenario.referenceWholeShares}:null};
 const key=digest(meaningful),expiry=Date.parse(previous?.expiry||''),expired=Number.isFinite(expiry)&&now>=expiry&&previous?.expiryReported!==previous?.expiry;
 const shouldRender=!previous||previous.key!==key||expired;
 return {shouldRender,reason:!previous?'INITIAL':expired?'EXPIRED':previous.key!==key?'MEANINGFUL_CHANGE':'UNCHANGED',nextState:shouldRender?{key,expiry:card.expiry,expiryReported:expired?previous.expiry:previous?.expiryReported||null,delivery:'PROPOSED_NOT_SENT'}:previous,noSend:true};
}
