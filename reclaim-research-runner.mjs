// Explicit local-file runner. No default data path, network, notifications or writes.
import {readFileSync,statSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {appendObservation,evidenceHash,freezeProposal,measurePaperExit,renderDecisionCard} from './reclaim-research-workflow.mjs';
import {summarizeResearchRun} from './reclaim-research-summary.mjs';
export function runResearchDataset(dataset) {
  if(!dataset || dataset.schemaVersion!==1 || !['SYNTHETIC','RETAINED_RESEARCH'].includes(dataset.origin) || !dataset.datasetId || !Array.isArray(dataset.observations) || !dataset.observations.length)throw new Error('EXPLICIT_DATASET_AND_ORIGIN_REQUIRED');
  const {policyHash}=freezeProposal(dataset.policy);
  let ledger=null;
  for(const input of dataset.observations)ledger=appendObservation(ledger,input,dataset.policy);
  const byId=new Map(dataset.observations.map(x=>[x.observationId,x]));
  const observations=ledger.events;
  const outcomes=[];
  for(const event of observations){
    const exit=dataset.exits?.[event.observationId];
    if(exit)outcomes.push({observationId:event.observationId,...measurePaperExit(byId.get(event.observationId),dataset.policy,exit)});
  }
  const reasons={};for(const e of observations)if(e.result.reason)reasons[e.result.reason]=(reasons[e.result.reason]||0)+1;
  const report={schemaVersion:1,status:'OFFLINE_RESEARCH_ONLY',allowBuy:false,realDollars:0,datasetId:dataset.datasetId,origin:dataset.origin,datasetHash:evidenceHash(dataset),policyHash,ledger,cards:observations.map(renderDecisionCard),outcomes,
    summary:{supplied:dataset.observations.length,uniqueObservations:observations.length,paperSetups:observations.filter(x=>x.result.status==='PAPER_SETUP_ONLY').length,unknown:observations.filter(x=>x.result.status==='UNKNOWN').length,reasons,modeledOutcomes:outcomes.filter(x=>x.status==='MODELED_PAPER_ECONOMICS_ONLY').length,missingOutcomes:observations.filter(x=>x.result.status==='PAPER_SETUP_ONLY'&&!outcomes.some(o=>o.observationId===x.observationId&&o.status==='MODELED_PAPER_ECONOMICS_ONLY')).length},
    readiness:{software:'Offline candidate-to-card and supplied-quote economics implemented',marketInputs:'Supplied assertions/provenance are checked structurally, not independently authenticated',strategy:'NOT_PROVEN',controls:'Not evaluated by this runner',production:'NOT_CONNECTED',promotion:'NONE; no count or positive return can enable BUY'}};
  report.descriptiveSummary=summarizeResearchRun(report);
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{
    if(process.argv.length!==4||process.argv[2]!=='--input')throw new Error('Usage: node reclaim-research-runner.mjs --input explicit-local-dataset.json');
    const file=process.argv[3];if(statSync(file).size>25*1024*1024)throw new Error('INPUT_TOO_LARGE');
    const result=runResearchDataset(JSON.parse(readFileSync(file,'utf8')));
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  }catch(error){process.stderr.write('RESEARCH RUN FAILED: '+error.message+'\n');process.exitCode=1;}
}
