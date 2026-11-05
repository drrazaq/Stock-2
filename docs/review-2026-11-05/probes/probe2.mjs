import fs from 'node:fs';
const W=process.argv[2];const {runResearchDataset}=await import(W+'/reclaim-research-runner.mjs');const {evaluateObservation}=await import(W+'/reclaim-research-workflow.mjs');
const ds=JSON.parse(fs.readFileSync(W+'/docs/a-catalyst-reclaim-pilot/storage/example.synthetic/input.synthetic.json','utf8'));
const ok=ds.observations.find(o=>evaluateObservation(o,ds.policy).result.status==='PAPER_SETUP_ONLY');
const dup=structuredClone(ok);dup.observationId=ok.observationId+'_REPEAT';
const d2={...structuredClone(ds),observations:[...ds.observations,dup],exits:{...ds.exits,[dup.observationId]:ds.exits[ok.observationId]}};
const r=runResearchDataset(d2);console.log(JSON.stringify({cards:r.cards.length,resolved:r.summary?.resolvedModeledUnits??r.descriptiveSummary?.resolvedModeledUnits,sum:r.summary?.sumIndependentUnitNetUsd??r.descriptiveSummary?.sumIndependentUnitNetUsd}));
