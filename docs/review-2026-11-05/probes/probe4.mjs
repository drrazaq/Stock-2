import fs from 'node:fs';import path from 'node:path';
const W=process.argv[2];const {runResearchDataset}=await import(W+'/reclaim-research-runner.mjs');const {evaluateObservation}=await import(W+'/reclaim-research-workflow.mjs');const {persistResearchDataset,ReclaimResearchStore}=await import(W+'/tools/a-catalyst-reclaim-store.mjs');
const ds=JSON.parse(fs.readFileSync(W+'/docs/a-catalyst-reclaim-pilot/storage/example.synthetic/input.synthetic.json','utf8'));
const ok=ds.observations.find(o=>evaluateObservation(o,ds.policy).result.status==='PAPER_SETUP_ONLY');
// later duplicate placed FIRST in the input, asOf 1 s later (still valid)
const later=structuredClone(ok);later.observationId='ZZ_LATER';const t=new Date(Date.parse(ok.asOf)+1000).toISOString().replace('.000Z','Z');later.asOf=t;
const d2={...structuredClone(ds),observations:[later,...ds.observations],exits:{...ds.exits,ZZ_LATER:ds.exits[ok.observationId]}};
const lstat=evaluateObservation(later,ds.policy).result.status;
const r=runResearchDataset(d2);const dir=fs.mkdtempSync(path.join(process.argv[3],'s-'));fs.chmodSync(dir,0o700);const p=persistResearchDataset(d2,dir);
const cardObs=fs.readdirSync(path.join(dir,'cards')).map(f=>JSON.parse(fs.readFileSync(path.join(dir,'cards',f),'utf8')).observationId);
console.log(JSON.stringify({laterStatus:lstat,runnerAdmitted:r.admissions.map(a=>a.observationId),duplicates:r.duplicateCandidateAssessments.map(d=>d.observationId),unapplied:r.unappliedExitEvidence.map(u=>u.observationId),storeCardsFor:cardObs,storeOutcomes:p.outcomes}));
const miss=structuredClone(ok);miss.observationId='ZZ_NOEXIT';miss.issuerId=ok.issuerId+'_2';
const m=runResearchDataset({...structuredClone(ds),observations:[...ds.observations,miss]}).descriptiveSummary;
console.log(JSON.stringify({headlineMean:m.meanUnitNetUsd,subsetSum:m.resolvedSubsetOnly.sumIndependentUnitNetUsd,missingness:m.missingness}).slice(0,600));
