import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash,generateKeyPairSync,sign} from 'node:crypto';
import {evidenceHash} from '../reclaim-research-workflow.mjs';import {aCoveragePlan} from '../a-independent-coverage.mjs';import {researchFixture} from './helper-reclaim-fixture.mjs';
export function evidenceFixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'a-evidence-'));fs.chmodSync(directory,0o700);const pairs=Object.fromEntries(['OWNER','CAPTURE','REVIEW','WITNESS'].map(role=>[role,generateKeyPairSync('ed25519')]));
 const {input,exit,policy}=researchFixture();
 const contract={id:'A_EVIDENCE_PROPOSAL_V2',version:2,adopted:false,strategyPolicyHash:evidenceHash(policy),zadValidity:'EXPLICIT_OWNER_INTERVAL_LATEST_KNOWN',exitSampling:'FIRST_POST_OPEN_OR_LAST_PRE_CLOSE_BBO',originalsMaxBytes:16*1024*1024,coverage:'INDEPENDENT_EXIT_WINDOW_FRAMES_V1',roots:Object.entries(pairs).map(([role,pair])=>({id:'SYNTHETIC_'+role,roles:[role],publicKey:pair.publicKey.export({type:'spki',format:'pem'})})),collectors:['CAPTURE','WITNESS'].map(role=>({id:'SYNTHETIC_COLLECTOR_'+role,role,keyId:'SYNTHETIC_'+role,provenanceReference:'SYNTHETIC_TEST_ONLY_NOT_INDEPENDENT_REAL_COLLECTION'}))};
 let serial=0;
 const raw=(value,name=`original-${serial++}.json`)=>{const bytes=Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value));fs.writeFileSync(path.join(directory,name),bytes,{mode:0o600});return {file:name,sha256:createHash('sha256').update(bytes).digest('hex')};};
 const signed=(ref,role,recordedAt,extra={})=>{const body={role,collectorId:'SYNTHETIC_COLLECTOR_'+role,outcomeCoveragePlanHash:evidenceHash(aCoveragePlan(input,policy)),strategyPolicyHash:contract.strategyPolicyHash,securityId:input.securityId,sha256:ref.sha256,recordedAt,contractHash:evidenceHash(contract),...extra};return {...ref,receipt:{keyId:'SYNTHETIC_'+role,body,signature:sign(null,Buffer.from(evidenceHash(body)),pairs[role].privateKey).toString('base64')}};};
 const source=raw(Buffer.from('SYNTHETIC ONLY: committed contract USD20m, prior cap USD100m; not a filing.'));input.catalyst.documentHash=source.sha256;
 const zadRecord={securityId:input.securityId,issuerId:input.issuerId,evidenceId:input.zadEvidenceId,decision:'YES',decidedAt:input.zadAsOf,validFrom:input.zadAsOf,validUntil:'2026-11-11T00:00:00Z'};
 const bundle={decision:signed(raw(input),'CAPTURE',input.asOf),zad:[signed(raw(zadRecord),'OWNER',input.zadAsOf)],source:signed(source,'CAPTURE',input.catalyst.observedAt,{sourceUrl:input.catalyst.sourceUrl}),review:signed(raw({sourceSha256:source.sha256,claims:input.catalyst}),'REVIEW','2026-11-04T13:02:00Z')};
 let records=exit.sessionCloses.map(record=>({type:'CLOSE',record}));records.push({type:'BBO',record:exit.quote});
 const makeTape=(rows=records)=>{rows=structuredClone(rows).sort((a,b)=>Date.parse(a.record.availableAt||a.record.observedAt)-Date.parse(b.record.availableAt||b.record.observedAt));let prev='GENESIS';const events=rows.map((r,i)=>{const b={sequence:i,previousHash:prev,id:`SYNTHETIC_EVENT_${i}`,type:r.type,record:r.record,original:raw(r.record)};const e={...b,hash:evidenceHash(b)};prev=e.hash;return e;});return {schema:1,complete:true,inputHash:evidenceHash(input),policyHash:evidenceHash(policy),securityId:input.securityId,startAt:input.asOf,endAt:'2026-11-10T21:00:30Z',events};};
 const seal=tape=>signed(raw(tape),'CAPTURE',tape.endAt);
 bundle.outcomes=seal(makeTape());
 const syncWitness=(rows=records)=>{
  const plan=aCoveragePlan(input,policy),planHash=evidenceHash(plan);
  const frames=plan.slots.map(slot=>{const events=rows.filter(e=>{const t=Date.parse(e.record.at);return e.type===slot.type&&t>=Date.parse(slot.start)&&(slot.atEndInclusive?t<=Date.parse(slot.end):t<Date.parse(slot.end));});return {slotId:slot.id,start:slot.start,end:slot.end,status:'COMPLETE',transportComplete:true,nextPage:null,receivedAt:slot.end,recordCount:events.length,original:raw({schema:'A_INDEPENDENT_FRAME_V1',planHash,slotId:slot.id,securityId:input.securityId,events})};});
  bundle.coverage=signed(raw({schema:1,complete:true,planHash,inputHash:evidenceHash(input),policyHash:evidenceHash(policy),securityId:input.securityId,frames}),'WITNESS',plan.slots.reduce((a,s)=>Date.parse(s.end)>Date.parse(a)?s.end:a,plan.slots[0].end));return bundle.coverage;
 };syncWitness();
 const dataset={schemaVersion:1,origin:'SYNTHETIC',datasetId:'SYNTHETIC_NOT_PROSPECTIVE',policy,observations:[input],evidence:{[input.observationId]:bundle}};
 const request=()=>{const r={dataset:raw(dataset,'dataset.json'),contract:raw(contract,'contract.json')};fs.writeFileSync(path.join(directory,'request.json'),JSON.stringify(r),{mode:0o600});return r;};
 return {directory,input,exit,policy,contract,dataset,bundle,zadRecord,raw,signed,records,makeTape,seal,request,syncWitness,refreshDecision:()=>bundle.decision=signed(raw(input),'CAPTURE',input.asOf),cleanup:()=>fs.rmSync(directory,{recursive:true,force:true})};
}
