import fs from 'node:fs';
const W=process.argv[2];const {evaluateObservation,measurePaperExit}=await import(W+'/reclaim-research-workflow.mjs');const {summarizeResearchRun}=await import(W+'/reclaim-research-summary.mjs');const {runResearchDataset}=await import(W+'/reclaim-research-runner.mjs');
const ds=JSON.parse(fs.readFileSync(W+'/docs/a-catalyst-reclaim-pilot/storage/example.synthetic/input.synthetic.json','utf8'));
const ok=ds.observations.find(o=>evaluateObservation(o,ds.policy).result.status==='PAPER_SETUP_ONLY');
// missing outcome: one card with no exit evidence alongside one resolved
const miss=structuredClone(ok);miss.observationId=ok.observationId+'_NOEXIT';miss.issuerId=(ok.issuerId||'I')+'_2';
const r=runResearchDataset({...structuredClone(ds),observations:[...ds.observations,miss]});
const s=r.descriptiveSummary||r.summary;console.log(JSON.stringify({resolved:s.resolvedModeledUnits,missingOutcomeIds:s.missingOutcomeIds,meanUnitNetUsd:s.meanUnitNetUsd,sum:s.sumIndependentUnitNetUsd}));
