import fs from 'node:fs';import {generateKeyPairSync,sign} from 'node:crypto';
const W=process.argv[2];
const {evidenceFixture}=await import(W+'/test/helper-a-evidence.mjs');
const C=await import(W+'/a-evidence-contract.mjs');const WF=await import(W+'/reclaim-research-workflow.mjs');
const out={};const run=f=>{f.request();try{const r=C.runAEvidenceDataset(f.dataset,f.contract,f.directory);return r.results.map(x=>x.status+(x.reason?':'+x.reason:''));}catch(e){return 'THROW:'+e.message;}};
// baseline
{const f=evidenceFixture();out.baseline=run(f);f.cleanup();}
// shipped contract (no roots)
{const f=evidenceFixture();const shipped=JSON.parse(fs.readFileSync(W+'/docs/a-evidence-recovery/trust-contract.proposed.json'));out.shippedRoots=shipped.roots.length;out.shippedAdopted=shipped.adopted;
 try{C.validateTrustContract(shipped);out.shippedValidates=true;}catch(e){out.shippedValidates=e.message;}
 const fx={...f.contract,roots:[]};f.contract.roots=[];out.noRootsRun=run(f);f.cleanup();}
// A3 legacy path: 2024 mark still accepted by unchanged evaluator?
{const f=evidenceFixture();const i=structuredClone(f.input);i.zadAsOf='2024-01-02T00:00:00Z';out.legacy2024=WF.evaluateObservation(i,f.policy).result.status;f.cleanup();}
// A3 new path: owner signs 2024 decision valid until 2030 -> accepted?
{const f=evidenceFixture();f.input.zadAsOf='2024-01-02T00:00:00Z';const z={...f.zadRecord,decidedAt:'2024-01-02T00:00:00Z',validFrom:'2024-01-02T00:00:00Z',validUntil:'2030-01-01T00:00:00Z'};f.bundle.zad=[f.signed(f.raw(z),'OWNER','2024-01-02T00:00:00Z')];f.refreshDecision();f.bundle.outcomes=f.seal(f.makeTape());out.newPath2024LongInterval=run(f);
 const z2={...z,validUntil:'2025-01-01T00:00:00Z'};f.bundle.zad=[f.signed(f.raw(z2),'OWNER','2024-01-02T00:00:00Z')];out.newPath2024Expired=run(f);f.cleanup();}
// A4: fabricated URL signed by a self-supplied capture/review key
{const f=evidenceFixture();f.input.catalyst.sourceUrl='https://example.invalid/fabricated-8k';f.bundle.source=f.signed({file:f.bundle.source.file,sha256:f.bundle.source.sha256},'CAPTURE',f.input.catalyst.observedAt,{sourceUrl:f.input.catalyst.sourceUrl});f.bundle.review=f.signed(f.raw({sourceSha256:f.bundle.source.sha256,claims:f.input.catalyst}),'REVIEW','2026-11-04T13:02:00Z');f.refreshDecision();f.bundle.outcomes=f.seal(f.makeTape());out.fabricatedUrlSelfSigned=run(f);f.cleanup();}
// role separation: one key holds OWNER+CAPTURE+REVIEW
{const f=evidenceFixture();out.singleKeyAllRoles=f.contract.roots.length===1&&f.contract.roots[0].roles.length===3;try{C.validateTrustContract(f.contract);out.singleKeyAllRolesAccepted=true;}catch(e){out.singleKeyAllRolesAccepted=e.message;}f.cleanup();}
// A5: late-received pre-close quote
{const f=evidenceFixture();const rec=structuredClone(f.records);const q=rec.find(r=>r.type==='BBO').record;const closeT=Date.parse(f.exit.sessionCloses.at(-1).at);q.observedAt=new Date(closeT+60000).toISOString();out.quoteObservedAfterClose=(()=>{f.bundle.outcomes=f.seal(f.makeTape(rec));return run(f);})();
 const rec2=structuredClone(f.records);const q2=rec2.find(r=>r.type==='BBO').record;q2.sourceDelayMs=-86400000;out.negativeSourceDelay=(()=>{f.bundle.outcomes=f.seal(f.makeTape(rec2));return run(f);})();
 const rec3=structuredClone(f.records);delete rec3.find(r=>r.type==="BBO").record.sourceDelayMs;out.missingSourceDelay=(()=>{f.bundle.outcomes=f.seal(f.makeTape(rec3));return run(f);})();
 out.baselineQuote={at:f.exit.quote.at,observedAt:f.exit.quote.observedAt,sourceDelayMs:f.exit.quote.sourceDelayMs};f.cleanup();}
// A5: omitted unfavourable quote -> signer completeness is attestation only
{const f=evidenceFixture();const rec=structuredClone(f.records);const q=rec.find(r=>r.type==='BBO').record;const worse={...q,evidenceId:q.evidenceId+'_EARLIER',at:new Date(Date.parse(q.at)+500).toISOString(),observedAt:q.observedAt,bid:q.bid*0.5,ask:q.ask*0.5};
 const withWorse=[...rec,{type:'BBO',record:worse}];f.bundle.outcomes=f.seal(f.makeTape(withWorse));const a=C.runAEvidenceDataset((f.request(),f.dataset),f.contract,f.directory).results[0];
 out.tapeWithBothQuotes={status:a.status,net:a.derived?.outcome?.netUsd};f.bundle.outcomes=f.seal(f.makeTape(rec));const b=C.runAEvidenceDataset(f.dataset,f.contract,f.directory).results[0];out.tapeOmittingOne={status:b.status,net:b.derived?.outcome?.netUsd};f.cleanup();}
console.log(JSON.stringify(out,null,1));
