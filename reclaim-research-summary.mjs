// Descriptive research arithmetic only. No threshold admits a strategy or a BUY.
import {compareAssessmentOrder,issuerSessionCandidate} from './reclaim-research-workflow.mjs';
const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
export function summarizeResearchRun(run) {
  if(run?.status!=='OFFLINE_RESEARCH_ONLY'||run.allowBuy!==false||!run.policyHash||!Array.isArray(run.outcomes)||!Array.isArray(run.ledger?.events))throw new Error('INVALID_RESEARCH_RUN');
  const events=new Map(run.ledger.events.map(e=>[e.observationId,e]));
  if(events.size!==run.ledger.events.length)throw new Error('DUPLICATE_OBSERVATION_EVENT');
  if(!Array.isArray(run.admissions))throw new Error('ADMISSION_MANIFEST_REQUIRED');
  const candidateSeen=new Set(),admitted=new Map(),expectedFirst=new Map();
  const chronological=[...events.values()].filter(e=>e.result.status==='PAPER_SETUP_ONLY').sort(compareAssessmentOrder);
  for(const e of chronological){const key=issuerSessionCandidate(e);if(key&&!expectedFirst.has(key))expectedFirst.set(key,e.observationId);}
  for(const a of run.admissions){
    if(candidateSeen.has(a.candidateId))throw new Error('DUPLICATE_ISSUER_SESSION_ADMISSION');candidateSeen.add(a.candidateId);
    const e=events.get(a.observationId);
    if(!e||e.result.status!=='PAPER_SETUP_ONLY'||issuerSessionCandidate(e)!==a.candidateId||a.issuerId!==e.issuerId||a.sessionOpen!==e.sessionOpen||a.policyHash!==run.policyHash||a.policyHash!==e.policyHash||a.inputHash!==e.inputHash||expectedFirst.get(a.candidateId)!==a.observationId)throw new Error('INVALID_ADMISSION');
    admitted.set(a.observationId,e);
  }
  if(admitted.size!==expectedFirst.size)throw new Error('INCOMPLETE_ADMISSION_MANIFEST');
  const seen=new Set(),rows=[],unresolved=[];
  for(const o of run.outcomes){
    if(seen.has(o.observationId))throw new Error('DUPLICATE_OUTCOME');seen.add(o.observationId);
    const e=events.get(o.observationId);
    if(!e)throw new Error('ORPHAN_OUTCOME');
    if(!admitted.has(o.observationId))throw new Error('OUTCOME_NOT_ADMITTED');
    if(o.status!=='MODELED_PAPER_ECONOMICS_ONLY'){unresolved.push(o.observationId);continue;}
    if(o.allowBuy!==false||o.policyHash!==run.policyHash||o.inputHash!==e.inputHash||e.result.status!=='PAPER_SETUP_ONLY'||![o.netUsd,o.returnOnBudgetPct].every(Number.isFinite))throw new Error('OUTCOME_BINDING_OR_ARITHMETIC_INVALID');
    const card=e.result.card;
    if(o.shares!==card.paperShares||![o.modeledEntry,o.modeledExit,card.sizingEntryPrice].every(Number.isFinite)||Math.abs(o.modeledEntry-card.sizingEntryPrice)>1e-12||o.commissionsUsd!==6||Math.abs(o.netUsd-(o.shares*(o.modeledExit-o.modeledEntry)-6))>1e-8)throw new Error('OUTCOME_CARD_ECONOMICS_MISMATCH');
    const budget=e.result.card.paperBudgetUsd;
    if(Math.abs(o.returnOnBudgetPct-o.netUsd/budget*100)>1e-8)throw new Error('RETURN_DENOMINATOR_MISMATCH');
    rows.push({id:o.observationId,symbol:e.symbol,date:e.asOf.slice(0,10),netUsd:o.netUsd,unitReturnPct:o.returnOnBudgetPct});
  }
  const grossWins=rows.filter(r=>r.netUsd>0).reduce((s,r)=>s+r.netUsd,0),grossLosses=-rows.filter(r=>r.netUsd<0).reduce((s,r)=>s+r.netUsd,0);
  const returns=rows.map(r=>r.unitReturnPct),sorted=[...returns].sort((a,b)=>b-a);
  const days=new Map();for(const r of rows){if(!days.has(r.date))days.set(r.date,[]);days.get(r.date).push(r.unitReturnPct);}
  const daily=[...days.values()].map(mean),m=mean(daily),sd=daily.length>1?Math.sqrt(daily.reduce((s,x)=>s+(x-m)**2,0)/(daily.length-1)):null;
  const missing=[...admitted.keys()].filter(id=>!rows.some(r=>r.id===id));
  const subset={meanCashInclusiveUnitReturnPct:mean(returns),meanUnitNetUsd:mean(rows.map(r=>r.netUsd)),sumIndependentUnitNetUsd:rows.reduce((s,r)=>s+r.netUsd,0),winRate:rows.length?rows.filter(r=>r.netUsd>0).length/rows.length:null,profitFactor:grossLosses>0?grossWins/grossLosses:null,profitFactorUndefined:grossLosses===0,withoutTwoBestMeanUnitReturnPct:sorted.length>2?mean(sorted.slice(2)):null,utcDayClusterT:sd>0?m/(sd/Math.sqrt(daily.length)):null};
  let lowerNet=subset.sumIndependentUnitNetUsd;const lowerReturns=[...returns];let lowerBoundKnown=true;
  for(const id of missing){const c=admitted.get(id).result.card;if(!Number.isInteger(c.paperShares)||c.paperShares<1||!Number.isFinite(c.sizingEntryPrice)||c.sizingEntryPrice<=0||!Number.isFinite(c.paperBudgetUsd)||c.paperBudgetUsd<1000){lowerBoundKnown=false;continue;}const lower=-c.paperShares*c.sizingEntryPrice-6;lowerNet+=lower;lowerReturns.push(lower/c.paperBudgetUsd*100);}
  const headline=missing.length?Object.fromEntries(Object.keys(subset).map(k=>[k,null])):subset;
  return {status:'DESCRIPTIVE_RESEARCH_ONLY',allowBuy:false,origin:run.origin,datasetHash:run.datasetHash,policyHash:run.policyHash,
    observations:run.ledger.events.length,admittedUnits:admitted.size,resolvedModeledUnits:rows.length,missingOutcomeIds:missing,unresolvedOutcomeIds:unresolved,
    uniqueSymbols:new Set(rows.map(r=>r.symbol)).size,uniqueUtcDecisionDays:days.size,
    ...headline,resolvedSubsetOnly:subset,
    missingness:{overallEconomicsStatus:missing.length?'INCOMPLETE':admitted.size?'COMPLETE_SUPPLIED_MODEL_COHORT':'NO_ADMITTED_ENTRIES',conditionalLowerNetUsdBound:lowerBoundKnown?lowerNet:null,conditionalLowerMeanUnitReturnPct:lowerBoundKnown?mean(lowerReturns):null,upperNetUsdBound:missing.length?null:subset.sumIndependentUnitNetUsd,assumptions:'Conditional supplied-model bound only: known entry units, zero missing exit proceeds, exactly USD3 each side, no leverage or additional charges. Not authenticated real execution or a risk guarantee.',candidateDenominatorStatus:'SUPPLIED_ONLY_NOT_COMPLETE_RISK_SET'},
    sourceAndExitAuthentication:'NOT_IMPLEMENTED',pilotReadiness:'BLOCKED',
    liveBuyAdmission:false,strategyVerdict:'NOT_PROVEN',
    blockers:['No independently authenticated input archive in this runner','Matched same-stock and market controls not evaluated','No account-equity replay; units may overlap','No untouched holdout or multiple-testing assessment','Synthetic rows are software tests, never market evidence'],
    limits:'Descriptive figures only. UTC decision-day clustering is labeled; it is not the system\u2019s required session/block evidence test. Positive figures or sample counts cannot promote a strategy.'};
}
