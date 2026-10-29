import test from 'node:test';
import assert from 'node:assert/strict';
import {identityAt,auditHistoricalEvidence,auditFrozenDocument} from '../historical-integrity.mjs';
const at='2024-01-02T14:00:00Z',source='https://www.sec.gov/fixture';
const mapping=(symbol,securityId,from,to=null,known=from)=>({symbol,securityId,issuerCik:'1234',validFrom:from,validTo:to,knownAt:known,source});
const old='2021-01-01T00:00:00Z';
test('ticker reuse is resolved by security interval, not issuer CIK or current ticker',()=>{
 const records=[mapping('AAA','old-security',old,'2023-01-01T00:00:00Z'),mapping('AAA','new-security','2023-01-01T00:00:00Z')];
 assert.equal(identityAt('AAA','2022-01-01T00:00:00Z',records).securityId,'old-security');assert.equal(identityAt('AAA',at,records).securityId,'new-security');
 assert.equal(identityAt('AAA','2020-01-01T00:00:00Z',records).status,'UNRESOLVED');
 assert.equal(identityAt('AAA',at,[...records,mapping('AAA','other-class',old)]).reason,'AMBIGUOUS_SECURITY_IDENTITY');
 assert.equal(identityAt('AAA',at,[mapping('AAA','future-known',old,null,'2025-01-01T00:00:00Z')]).status,'UNRESOLVED');
});
const evidence=()=>({cutoff:'2024-02-01T00:00:00Z',protocol:{registeredAt:old,trainEnd:'2023-11-01T00:00:00Z',holdoutStart:'2024-01-01T00:00:00Z',holdoutEnd:'2024-01-31T23:59:59Z',parameterHash:'a'.repeat(64),registeredParameterHash:'a'.repeat(64),selectedUsingHoldout:false,universeBasis:'POINT_IN_TIME'},
 identities:[mapping('AAA','security',old)],universe:[{securityId:'security',knownAt:old,validFrom:old,validTo:null,source}],
 trades:[{id:'fixture',symbol:'AAA',securityId:'security',decisionAt:at,entryAt:'2024-01-03T14:30:00Z',exitAt:'2024-01-05T21:00:00Z',split:'holdout',priceBasis:'raw',entryPriceBasis:'raw',exitPriceBasis:'raw',entryPrice:10,exitPrice:11,costs:6}]});
test('well-shaped historical evidence still cannot approve profitability or BUY',()=>{
 const r=auditHistoricalEvidence(evidence());assert.equal(r.status,'STRUCTURE_VALID_ONLY');assert.equal(r.approvedBuy,false);
});
test('training overlap, retuned holdout and current-only membership are explicit blockers',()=>{
 for(const mutate of [x=>x.trades[0].split='train',x=>x.protocol.selectedUsingHoldout=true,x=>x.protocol.parameterHash='b'.repeat(64),x=>x.universe[0].knownAt='2025-01-01T00:00:00Z',x=>x.protocol.universeBasis='CURRENT_MEMBERS']){
  const x=evidence();mutate(x);assert.equal(auditHistoricalEvidence(x).status,'INELIGIBLE_FOR_PERFORMANCE_CLAIM');
 }
});
test('delisted terminal missing value stays unresolved and documented worthless value is retained',()=>{
 const x=evidence();x.trades[0].delisted=true;delete x.trades[0].exitPrice;
 assert.ok(auditHistoricalEvidence(x).errors.some(x=>x.reason==='DELISTING_TERMINAL_VALUE_UNVERIFIED'));
 Object.assign(x.trades[0],{exitPrice:0,terminalSource:source,terminalKnownAt:'2024-01-05T21:00:00Z'});assert.equal(auditHistoricalEvidence(x).status,'STRUCTURE_VALID_ONLY');
 x.trades[0].exitPriceBasis='split_adjusted';assert.ok(auditHistoricalEvidence(x).errors.some(x=>/BASIS_MISMATCH/.test(x.reason)));
});
test('frozen metadata audit retains rejected/corrected verdicts without changing source',()=>{
 const doc={firstRun:{A:{verdict:'REJECTED'}},correctedRun:{A:{verdict:'NOT PROVEN',protocol:'documented correction'}}},before=JSON.stringify(doc),r=auditFrozenDocument(doc);
 assert.equal(r.verdictCounts.REJECTED,1);assert.equal(r.firstRunPaths.length,1);assert.equal(r.correctedRunPaths.length,1);assert.equal(JSON.stringify(doc),before);assert.ok(r.warnings.includes('HOLDOUT_BOUNDARIES_NOT_STRUCTURED_HERE'));
});
