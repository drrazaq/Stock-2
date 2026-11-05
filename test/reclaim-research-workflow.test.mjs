import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {appendStructuralObservationRehearsal as appendObservation,evaluateStructuralRehearsal as evaluateObservation,evidenceHash,evidenceTime,freezeProposal,measureStructuralExitRehearsal as measurePaperExit,renderDecisionCard} from '../reclaim-research-workflow.mjs';
import {runStructuralRehearsal as runResearchDataset} from '../reclaim-research-runner.mjs';
import {summarizeResearchRun} from '../reclaim-research-summary.mjs';
import {researchFixture} from './helper-reclaim-fixture.mjs';

test('end-to-end supplied evidence becomes paper card and costed outcome, never BUY',()=>{
 const {input,policy,exit}=researchFixture(),before=JSON.stringify({input,policy,exit});
 const event=evaluateObservation(input,policy);assert.equal(event.result.status,'PAPER_SETUP_ONLY');
 const result=measurePaperExit(input,policy,exit);assert.equal(result.status,'MODELED_PAPER_ECONOMICS_ONLY');assert.equal(result.allowBuy,false);assert.equal(result.realDollars,0);assert.equal(result.shares,94);assert.equal(result.commissionsUsd,6);assert.ok(Math.abs(result.netUsd-35.9475)<1e-8);assert.ok(Math.abs(result.returnOnBudgetPct-3.59475)<1e-8);
 assert.match(renderDecisionCard(event),/PAPER ONLY/);assert.match(renderDecisionCard(event),/No fill established/);assert.equal(JSON.stringify({input,policy,exit}),before);
});
const cases=[
 ['impossible date',x=>x.asOf='2026-02-30T14:45:05Z','INVALID_AS_OF'],
 ['ambiguous date',x=>x.asOf='2026-11-04T14:45:05','INVALID_AS_OF'],
 ['no security identity',x=>delete x.securityId,'MISSING_SECURITY_IDENTITY_EVIDENCE'],
 ['wrong quote security',x=>x.quote.securityId='OTHER','QUOTE_AVAILABILITY_OR_IDENTITY_UNKNOWN'],
 ['unconverted quote lots',x=>x.quote.sizeUnits='LOTS','QUOTE_AVAILABILITY_OR_IDENTITY_UNKNOWN'],
 ['wrong catalyst security',x=>x.catalyst.securityId='OTHER','UNRESOLVED_CONTRACT_EVIDENCE'],
 ['quote capture in future',x=>x.quote.observedAt='2026-11-04T15:00:00Z','QUOTE_AVAILABILITY_OR_IDENTITY_UNKNOWN'],
 ['delayed quote not observable',x=>x.quote.sourceDelayMs=900000,'QUOTE_AVAILABILITY_OR_IDENTITY_UNKNOWN'],
 ['bar unavailable at decision',x=>x.bars[2].availableAt='2026-11-04T15:00:00Z','BAR_AVAILABILITY_OR_PANEL_UNKNOWN'],
 ['bar published before completion',x=>x.bars[2].availableAt='2026-11-04T14:44:00Z','BAR_AVAILABILITY_OR_PANEL_UNKNOWN'],
 ['wrong bar security',x=>x.bars[1].securityId='OTHER','BAR_AVAILABILITY_OR_PANEL_UNKNOWN'],
 ['missing panel provenance',x=>delete x.liquidityEvidenceId,'MISSING_PRIOR_PANEL_OR_OWNER_EVIDENCE'],
 ['low opening volume',x=>x.bars[0].volume=1000,'OPENING_VOLUME_GATE_NOT_MET'],
 ['unknown contract currency',x=>x.catalyst.currency='UNKNOWN','UNRESOLVED_CONTRACT_EVIDENCE'],
 ['award ceiling not booked commitment',x=>x.catalyst.contractValueBasis='CEILING','UNRESOLVED_CONTRACT_EVIDENCE'],
 ['missing document hash',x=>x.catalyst.documentHash='prefix','UNRESOLVED_CONTRACT_EVIDENCE'],
 ['missing supplied calendar',x=>delete x.calendar,'MISSING_CALENDAR_EVIDENCE'],
 ['wrong session',x=>x.sessionOpen='2026-11-04T14:31:00Z','SESSION_NOT_IN_SUPPLIED_CALENDAR'],
 ['old catalyst not first session',x=>x.catalyst.publishedAt='2026-11-03T13:00:00Z','FIRST_SESSION_OR_PRIOR_CLOSE_NOT_ESTABLISHED'],
 ['quote stale',x=>{x.quote.at='2026-11-04T14:44:00Z';},'STALE_OR_INVALID_QUOTE_CLOCK'],
 ['ZAD no',x=>x.zad='NO','ZAD_NOT_CONFIRMED'],
 ['options never admitted',x=>x.instrument='OPTION','UNSUPPORTED_INSTRUMENT'],
 ['expired trigger even with fresh quote',x=>{x.asOf='2026-11-04T14:46:05Z';x.quote.at='2026-11-04T14:46:04Z';x.quote.observedAt=x.asOf;},'TRIGGER_EXPIRED']
];
for(const [name,change,reason]of cases)test(name,()=>{const {input,policy}=researchFixture();change(input);const r=evaluateObservation(input,policy);assert.equal(r.result.reason,reason);assert.equal(r.result.actionable,false);assert.equal(r.result.card,undefined);});
test('calendar supports supplied early close',()=>{const {input,policy}=researchFixture();input.sessionClose='2026-11-04T18:00:00Z';input.calendar.sessions[1].close=input.sessionClose;assert.equal(evaluateObservation(input,policy).result.status,'PAPER_SETUP_ONLY');});
test('date parsing rejects impossible month/day/time',()=>{for(const t of ['2026-99-99T10:00:00Z','2026-02-30T10:00:00Z','2026-11-04T24:00:00Z','2026-11-04T10:60:00Z'])assert.ok(Number.isNaN(evidenceTime(t)));assert.ok(Number.isFinite(evidenceTime('2028-02-29T10:00:00Z')));});
test('proposed exit must be internally consistent, not two conflicting stops',()=>{const {policy}=researchFixture();policy.exitContract='15% stop plus 35% disaster';assert.throws(()=>freezeProposal(policy),/AMBIGUOUS_EXIT_CONTRACT/);});
test('no real-mode or adoption switch',()=>{const {policy}=researchFixture();policy.adopted=true;assert.throws(()=>freezeProposal(policy),/UNAPPROVED_RESEARCH_POLICY_REQUIRED/);});
test('stable hash is key-order independent and rejects non-JSON evidence',()=>{assert.equal(evidenceHash({b:2,a:1}),evidenceHash({a:1,b:2}));assert.throws(()=>evidenceHash({a:NaN}),/NON_JSON_EVIDENCE/);});
test('ledger retains rejection, is idempotent and detects changed input',()=>{const {input,policy}=researchFixture();const first=appendObservation(null,input,policy),old=JSON.stringify(first);assert.deepEqual(appendObservation(first,input,policy),first);input.observationId='REJECTED';input.quote.at='2026-11-04T14:40:00Z';const second=appendObservation(first,input,policy);assert.equal(second.events.length,2);assert.equal(second.events[1].result.status,'UNKNOWN');assert.equal(JSON.stringify(first),old);input.observationId='SYNTHETIC_OBSERVATION_1';assert.throws(()=>appendObservation(first,input,policy),/CONTENT_CONFLICT/);});
test('ledger detects tampering and prevents silent policy changes',()=>{const {input,policy}=researchFixture();const l=appendObservation(null,input,policy);l.events[0].symbol='CHANGED';assert.throws(()=>appendObservation(l,input,policy),/INTEGRITY/);const clean=appendObservation(null,input,policy);policy.minPrice=3;assert.throws(()=>appendObservation(clean,input,policy),/POLICY_OR_SCHEMA_CONFLICT/);});
test('invalidated daily close selects next-open exit and permits gap loss',()=>{const {input,policy,exit}=researchFixture();exit.sessionCloses[0].close=9;exit.asOf='2026-11-05T14:31:00Z';exit.quote.at='2026-11-05T14:30:00Z';exit.quote.observedAt=exit.quote.at;exit.quote.bid=8;exit.quote.ask=8.01;const r=measurePaperExit(input,policy,exit);assert.equal(r.status,'MODELED_PAPER_ECONOMICS_ONLY');assert.equal(r.exitKind,'CLOSE_INVALIDATION_NEXT_OPEN');assert.ok(r.netUsd<0);assert.equal(r.ruleExitAt,'2026-11-05T14:30:00.000Z');});
test('maximum holding exit wins over last-day invalidation, never silently extends to session six',()=>{const {input,policy,exit}=researchFixture();exit.sessionCloses.at(-1).close=9;const r=measurePaperExit(input,policy,exit);assert.equal(r.status,'MODELED_PAPER_ECONOMICS_ONLY');assert.equal(r.exitKind,'MAX_SESSION_CLOSE');assert.equal(r.ruleExitAt,'2026-11-10T21:00:00.000Z');});
const exits=[
 ['unobserved close',e=>e.sessionCloses[0].availableAt='2026-11-11T21:00:00Z','INVALID_CLOSE_EVIDENCE'],
 ['missing close',e=>e.sessionCloses.shift(),'MISSING_OR_DUPLICATE_SESSION_CLOSE'],
 ['duplicate close',e=>e.sessionCloses.push(e.sessionCloses[0]),'MISSING_OR_DUPLICATE_SESSION_CLOSE'],
 ['exit too early',e=>{e.quote.at='2026-11-10T20:00:00Z';e.quote.observedAt=e.quote.at;},'EXIT_QUOTE_NOT_PAIRED_TO_RULE_CLOCK'],
 ['exit wrong identity',e=>e.quote.securityId='OTHER','INVALID_EXIT_QUOTE'],
 ['exit future capture',e=>e.quote.observedAt='2026-11-11T21:00:00Z','INVALID_EXIT_QUOTE'],
 ['exit insufficient size',e=>e.quote.bidSize=1,'INSUFFICIENT_DISPLAYED_EXECUTION_SIZE'],
 ['exit outcome not yet due',e=>e.asOf='2026-11-04T20:00:00Z','HOLDING_PATH_NOT_YET_OBSERVABLE']
];
for(const [name,change,reason]of exits)test(name,()=>{const {input,policy,exit}=researchFixture();change(exit);assert.deepEqual(measurePaperExit(input,policy,exit),{status:'UNRESOLVED',reason,allowBuy:false});});
test('batch retains both success and failure without promoting a positive result',()=>{const {input,policy,exit}=researchFixture();const bad=structuredClone(input);bad.observationId='BAD';bad.quote.askSize=1;const r=runResearchDataset({schemaVersion:1,origin:'SYNTHETIC',datasetId:'TEST',policy,observations:[input,bad,input],exits:{[input.observationId]:exit}});assert.equal(r.summary.supplied,3);assert.equal(r.summary.uniqueObservations,2);assert.equal(r.summary.paperSetups,1);assert.equal(r.summary.modeledOutcomes,1);assert.equal(r.summary.reasons.INSUFFICIENT_DISPLAYED_ENTRY_SIZE,1);assert.equal(r.allowBuy,false);assert.equal(r.readiness.strategy,'NOT_PROVEN');});
test('missing outcomes remain counted',()=>{const {input,policy}=researchFixture();const r=runResearchDataset({schemaVersion:1,origin:'SYNTHETIC',datasetId:'TEST',policy,observations:[input]});assert.equal(r.summary.missingOutcomes,1);assert.equal(r.summary.modeledOutcomes,0);});
test('positive synthetic returns are descriptive, never proof or account return',()=>{const {input,policy,exit}=researchFixture();const run=runResearchDataset({schemaVersion:1,origin:'SYNTHETIC',datasetId:'TEST',policy,observations:[input],exits:{[input.observationId]:exit}});const s=run.descriptiveSummary;assert.equal(s.strategyVerdict,'NOT_PROVEN');assert.equal(s.liveBuyAdmission,false);assert.equal(s.resolvedModeledUnits,1);assert.ok(s.meanUnitNetUsd>0);assert.equal(s.profitFactor,null);assert.equal(s.withoutTwoBestMeanUnitReturnPct,null);assert.equal(s.utcDayClusterT,null);});
test('summary detects duplicate, orphan and wrong-policy outcomes',()=>{const {input,policy,exit}=researchFixture();const build=()=>runResearchDataset({schemaVersion:1,origin:'SYNTHETIC',datasetId:'TEST',policy,observations:[input],exits:{[input.observationId]:exit}});let r=build();r.outcomes.push(r.outcomes[0]);assert.throws(()=>summarizeResearchRun(r),/DUPLICATE_OUTCOME/);r=build();r.outcomes[0].observationId='OTHER';assert.throws(()=>summarizeResearchRun(r),/ORPHAN_OUTCOME/);r=build();r.outcomes[0].policyHash='OTHER';assert.throws(()=>summarizeResearchRun(r),/BINDING/);r=build();r.outcomes[0].returnOnBudgetPct=90;assert.throws(()=>summarizeResearchRun(r),/DENOMINATOR/);});
test('retired runner CLI cannot evaluate unauthenticated input or edit it',()=>{const {input,policy,exit}=researchFixture(),dir=mkdtempSync(join(tmpdir(),'reclaim-cli-'));try{const file=join(dir,'input.json'),dataset={schemaVersion:1,origin:'SYNTHETIC',datasetId:'TEST',policy,observations:[input],exits:{[input.observationId]:exit}};writeFileSync(file,JSON.stringify(dataset));const before=readFileSync(file,'utf8'),r=spawnSync(process.execPath,[fileURLToPath(new URL('../reclaim-research-runner.mjs',import.meta.url)),'--input',file],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/AUTHENTICATED_A_EVIDENCE_REQUIRED/);assert.equal(readFileSync(file,'utf8'),before);}finally{rmSync(dir,{recursive:true,force:true});}});
