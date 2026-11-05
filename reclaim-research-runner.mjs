// Explicit local-file runner. No default data path, network, notifications or writes.
import {readFileSync,statSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {appendObservation,compareAssessmentOrder,evidenceHash,freezeProposal,issuerSessionCandidate,measurePaperExit,renderDecisionCard} from './reclaim-research-workflow.mjs';
import {summarizeResearchRun} from './reclaim-research-summary.mjs';
export function runResearchDataset(dataset) {
  if(!dataset || dataset.schemaVersion!==1 || !['SYNTHETIC','RETAINED_RESEARCH'].includes(dataset.origin) || !dataset.datasetId || !Array.isArray(dataset.observations) || !dataset.observations.length)throw new Error('EXPLICIT_DATASET_AND_ORIGIN_REQUIRED');
  const {policyHash}=freezeProposal(dataset.policy);
  let ledger=null;
  for(const input of dataset.observations)ledger=appendObservation(ledger,input,dataset.policy);
  const byId=new Map(dataset.observations.map(x=>[x.observationId,x]));
  const observations=ledger.events;
  for(const id of Object.keys(dataset.exits||{}))if(!byId.has(id))throw new Error('ORPHAN_EXIT_EVIDENCE');
  const ordered=observations.filter(e=>e.result.status==='PAPER_SETUP_ONLY').sort(compareAssessmentOrder);
  const admittedByCandidate=new Map(),admissions=[],duplicateCandidateAssessments=[],admissionRejections=[];
  for(const e of ordered){
    const candidateId=issuerSessionCandidate(e);
    if(!candidateId){admissionRejections.push({observationId:e.observationId,reason:'ISSUER_MAPPING_REQUIRED'});continue;}
    const first=admittedByCandidate.get(candidateId);
    if(first){duplicateCandidateAssessments.push({observationId:e.observationId,admittedObservationId:first.observationId,candidateId,reason:'CANDIDATE_ALREADY_CARDED'});continue;}
    const admission={observationId:e.observationId,issuerId:e.issuerId,sessionOpen:e.sessionOpen,candidateId,inputHash:e.inputHash,policyHash};
    admittedByCandidate.set(candidateId,admission);admissions.push(admission);
  }
  const admittedIds=new Set(admissions.map(a=>a.observationId)),unappliedExitEvidence=[];
  const outcomes=[];
  for(const event of observations){
    const exit=dataset.exits?.[event.observationId];
    if(exit&&admittedIds.has(event.observationId))outcomes.push({observationId:event.observationId,...measurePaperExit(byId.get(event.observationId),dataset.policy,exit)});
    else if(exit)unappliedExitEvidence.push({observationId:event.observationId,exitEvidenceHash:evidenceHash(exit),reason:'NOT_AN_ADMITTED_PAPER_ENTRY'});
  }
  const reasons={};for(const e of observations)if(e.result.reason)reasons[e.result.reason]=(reasons[e.result.reason]||0)+1;
  const byEventId=new Map(observations.map(e=>[e.observationId,e]));
  const report={schemaVersion:1,status:'OFFLINE_RESEARCH_ONLY',allowBuy:false,realDollars:0,datasetId:dataset.datasetId,origin:dataset.origin,datasetHash:evidenceHash(dataset),policyHash,ledger,admissions,duplicateCandidateAssessments,admissionRejections,unappliedExitEvidence,cards:admissions.map(a=>renderDecisionCard(byEventId.get(a.observationId))),assessmentMessages:observations.map(e=>admittedIds.has(e.observationId)||e.result.status!=='PAPER_SETUP_ONLY'?renderDecisionCard(e):`${e.symbol}: RESEARCH_ONLY — no new issuer/session entry admitted.`),outcomes,
    summary:{supplied:dataset.observations.length,uniqueObservations:observations.length,qualifyingAssessments:ordered.length,paperSetups:admissions.length,duplicateCandidateAssessments:duplicateCandidateAssessments.length,unknown:observations.filter(x=>x.result.status==='UNKNOWN').length,reasons,modeledOutcomes:outcomes.filter(x=>x.status==='MODELED_PAPER_ECONOMICS_ONLY').length,missingOutcomes:admissions.filter(x=>!outcomes.some(o=>o.observationId===x.observationId&&o.status==='MODELED_PAPER_ECONOMICS_ONLY')).length},
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
