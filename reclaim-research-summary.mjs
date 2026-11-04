// Descriptive research arithmetic only. No threshold admits a strategy or a BUY.
const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : null;
export function summarizeResearchRun(run) {
  if(run?.status!=='OFFLINE_RESEARCH_ONLY'||run.allowBuy!==false||!run.policyHash||!Array.isArray(run.outcomes)||!Array.isArray(run.ledger?.events))throw new Error('INVALID_RESEARCH_RUN');
  const events=new Map(run.ledger.events.map(e=>[e.observationId,e]));
  const seen=new Set(),rows=[],unresolved=[];
  for(const o of run.outcomes){
    if(seen.has(o.observationId))throw new Error('DUPLICATE_OUTCOME');seen.add(o.observationId);
    const e=events.get(o.observationId);
    if(!e)throw new Error('ORPHAN_OUTCOME');
    if(o.status!=='MODELED_PAPER_ECONOMICS_ONLY'){unresolved.push(o.observationId);continue;}
    if(o.allowBuy!==false||o.policyHash!==run.policyHash||o.inputHash!==e.inputHash||e.result.status!=='PAPER_SETUP_ONLY'||![o.netUsd,o.returnOnBudgetPct].every(Number.isFinite))throw new Error('OUTCOME_BINDING_OR_ARITHMETIC_INVALID');
    const budget=e.result.card.paperBudgetUsd;
    if(Math.abs(o.returnOnBudgetPct-o.netUsd/budget*100)>1e-8)throw new Error('RETURN_DENOMINATOR_MISMATCH');
    rows.push({id:o.observationId,symbol:e.symbol,date:e.asOf.slice(0,10),netUsd:o.netUsd,unitReturnPct:o.returnOnBudgetPct});
  }
  const grossWins=rows.filter(r=>r.netUsd>0).reduce((s,r)=>s+r.netUsd,0),grossLosses=-rows.filter(r=>r.netUsd<0).reduce((s,r)=>s+r.netUsd,0);
  const returns=rows.map(r=>r.unitReturnPct),sorted=[...returns].sort((a,b)=>b-a);
  const days=new Map();for(const r of rows){if(!days.has(r.date))days.set(r.date,[]);days.get(r.date).push(r.unitReturnPct);}
  const daily=[...days.values()].map(mean),m=mean(daily),sd=daily.length>1?Math.sqrt(daily.reduce((s,x)=>s+(x-m)**2,0)/(daily.length-1)):null;
  const missing=run.ledger.events.filter(e=>e.result.status==='PAPER_SETUP_ONLY'&&!rows.some(r=>r.id===e.observationId)).map(e=>e.observationId);
  return {status:'DESCRIPTIVE_RESEARCH_ONLY',allowBuy:false,origin:run.origin,datasetHash:run.datasetHash,policyHash:run.policyHash,
    observations:run.ledger.events.length,resolvedModeledUnits:rows.length,missingOutcomeIds:missing,unresolvedOutcomeIds:unresolved,
    uniqueSymbols:new Set(rows.map(r=>r.symbol)).size,uniqueUtcDecisionDays:days.size,
    meanCashInclusiveUnitReturnPct:mean(returns),meanUnitNetUsd:mean(rows.map(r=>r.netUsd)),sumIndependentUnitNetUsd:rows.reduce((s,r)=>s+r.netUsd,0),
    winRate:rows.length?rows.filter(r=>r.netUsd>0).length/rows.length:null,
    profitFactor:grossLosses>0?grossWins/grossLosses:null,profitFactorUndefined:grossLosses===0,
    withoutTwoBestMeanUnitReturnPct:sorted.length>2?mean(sorted.slice(2)):null,
    utcDayClusterT:sd>0?m/(sd/Math.sqrt(daily.length)):null,
    liveBuyAdmission:false,strategyVerdict:'NOT_PROVEN',
    blockers:['No independently authenticated input archive in this runner','Matched same-stock and market controls not evaluated','No account-equity replay; units may overlap','No untouched holdout or multiple-testing assessment','Synthetic rows are software tests, never market evidence'],
    limits:'Descriptive figures only. UTC decision-day clustering is labeled; it is not the system\u2019s required session/block evidence test. Positive figures or sample counts cannot promote a strategy.'};
}
