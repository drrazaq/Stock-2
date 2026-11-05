import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {generateKeyPairSync,createPublicKey} from 'node:crypto';
const W=process.argv[2];
const {evidenceFixture}=await import(W+'/test/helper-a-evidence.mjs');
const C=await import(W+'/a-evidence-contract.mjs');const WF=await import(W+'/reclaim-research-workflow.mjs');const RR=await import(W+'/reclaim-research-runner.mjs');const ST=await import(W+'/tools/a-catalyst-reclaim-store.mjs');const PR=await import(W+'/catalyst-reclaim-prototype.mjs');
const out={};const run=f=>{f.request();try{return C.runAEvidenceDataset(f.dataset,f.contract,f.directory).results.map(x=>x.status+(x.reason?':'+x.reason:'')+(x.derived?.outcome?.netUsd!==undefined?' net='+x.derived.outcome.netUsd.toFixed(2):''));}catch(e){return 'THROW:'+e.message;}};
const cli=f=>{f.request();const r=spawnSync(process.execPath,[W+'/tools/a-evidence-runner.mjs',f.directory],{encoding:'utf8',env:{PATH:process.env.PATH}});let rep=null;try{rep=JSON.parse(fs.readFileSync(path.join(f.directory,'evidence-report.json'),'utf8')).results.map(x=>x.status+(x.reason?':'+x.reason:''));}catch{}return {exit:r.status,stdout:r.stdout.trim(),stderr:r.stderr.trim(),report:rep};};
const worse=(f)=>{const q=f.records.find(r=>r.type==='BBO').record;return {type:'BBO',record:{...q,evidenceId:q.evidenceId+'_LATER_WORSE',at:new Date(Date.parse(q.at)+500).toISOString(),bid:q.bid*0.5,ask:q.ask*0.5}};};
{const f=evidenceFixture();out.baseline=run(f);out.baselineCLI=cli(f);f.cleanup();}
// F1 omitted quote: witness has it, tape omits it
{const f=evidenceFixture();const all=[...f.records,worse(f)];f.syncWitness(all);f.bundle.outcomes=f.seal(f.makeTape(f.records));out.omitTapeWitnessFull=run(f);out.omitTapeWitnessFullCLI=cli(f);f.cleanup();}
{const f=evidenceFixture();const all=[...f.records,worse(f)];f.syncWitness(all);f.bundle.outcomes=f.seal(f.makeTape(all));out.bothFull=run(f);f.cleanup();}
// collusion: witness also omits
{const f=evidenceFixture();f.syncWitness(f.records);f.bundle.outcomes=f.seal(f.makeTape(f.records));out.witnessAlsoOmits_sameAsBaseline=run(f);f.cleanup();}
// witness missing
{const f=evidenceFixture();delete f.bundle.coverage;out.noWitness=run(f);f.cleanup();}
// key reuse probes
{const f=evidenceFixture();const k=(c)=>{try{C.validateTrustContract(c);return 'ACCEPTED';}catch(e){return e.message;}};
 const c1=structuredClone(f.contract);c1.roots[1].publicKey=c1.roots[0].publicKey;out.samePemTwoRoles=k(c1);
 const c2=structuredClone(f.contract);const der=createPublicKey(c2.roots[0].publicKey).export({type:'spki',format:'der'});c2.roots[1].publicKey={key:der,format:'der',type:'spki'};out.sameKeyDerEncoding=k(c2);
 const c3=structuredClone(f.contract);const pem=c3.roots[0].publicKey.replace(/\n/g,'\r\n');c3.roots[1].publicKey=pem;out.sameKeyCRLFPem=k(c3);
 const c4=structuredClone(f.contract);const jwk=createPublicKey(c4.roots[0].publicKey).export({format:'jwk'});c4.roots[1].publicKey={key:jwk,format:'jwk'};out.sameKeyJwk=k(c4);
 const c5=structuredClone(f.contract);c5.roots[0].roles=['OWNER','CAPTURE'];out.oneRootTwoRoles=k(c5);
 const c6=structuredClone(f.contract);c6.collectors[1].keyId=c6.collectors[0].keyId;out.witnessCollectorOnCaptureKey=k(c6);
 const c7=structuredClone(f.contract);c7.roots.push({id:'X',roles:['WITNESS'],publicKey:generateKeyPairSync('ed25519').publicKey.export({type:'spki',format:'pem'})});c7.collectors=[];out.noCollectors=k(c7);
 f.cleanup();}
// invalid delays: input quote and tape BBO
for(const v of [NaN,-1,Infinity,'5',null,'MISSING']){const f=evidenceFixture();if(v==='MISSING')delete f.input.quote.sourceDelayMs;else f.input.quote.sourceDelayMs=v;let r;try{r=run(f);}catch(e){r='THROW:'+e.message;}out['inputDelay_'+String(v)]=r;f.cleanup();}
for(const v of [-1,'5',null,'MISSING']){const f=evidenceFixture();const rec=structuredClone(f.records);const q=rec.find(r=>r.type==='BBO').record;if(v==='MISSING')delete q.sourceDelayMs;else q.sourceDelayMs=v;try{f.syncWitness(rec);f.bundle.outcomes=f.seal(f.makeTape(rec));out['tapeDelay_'+String(v)]=run(f);}catch(e){out['tapeDelay_'+String(v)]='FIXTURE:'+e.message;}f.cleanup();}
// legacy gates
{const f=evidenceFixture();const i=structuredClone(f.input);i.zadAsOf='2024-01-02T00:00:00Z';out.legacyEvaluate2024=WF.evaluateObservation(i,f.policy).result;out.legacyAssess=PR.assessReclaim(i,f.policy);out.legacyMeasure=WF.measurePaperExit(i,f.policy,f.exit);
 for(const [n,fn] of [['runResearchDataset',()=>RR.runResearchDataset({...f.dataset})],['persistResearchDataset',()=>ST.persistResearchDataset(f.dataset,f.directory)],['appendObservation',()=>WF.appendObservation({},i,f.policy)],['storeNoMode',()=>new ST.ReclaimResearchStore({directory:f.directory,policy:f.policy,origin:'RETAINED_RESEARCH',implementationId:'x'})],['structuralRetained',()=>RR.runStructuralRehearsal({...f.dataset,origin:'RETAINED_RESEARCH',exits:{}})],['storeRehearsalRetained',()=>new ST.ReclaimResearchStore({directory:f.directory,policy:f.policy,origin:'RETAINED_RESEARCH',implementationId:'x',mode:'SYNTHETIC_REHEARSAL'})]]){try{fn();out['legacy_'+n]='NO_THROW';}catch(e){out['legacy_'+n]=e.message;}}
 // structural rehearsal still accepts 2024 mark but labelled
 out.structural2024=(()=>{const e=WF.evaluateStructuralRehearsal(i,f.policy);return {status:e.result.status,evidenceAuthenticated:e.evidenceAuthenticated,rehearsal:e.rehearsal};})();
 f.cleanup();}
console.log(JSON.stringify(out,null,1));
