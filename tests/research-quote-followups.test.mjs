import {evaluatePaperEvidence} from '../discovery-paper.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {captureResearchQuotes,quoteEvidenceState,quoteEvidenceReport} from '../research-quote-followups.mjs';
const at='2026-10-29T14:00:00Z',ms=Date.parse(at);
const event={eventId:'fixture-event',symbol:'AAA',observedAt:at};
const row={sym:'AAA',bid:9.99,ask:10.01,qt:ms,t:ms,price:10,dollarVolume:2e6,dollarVolumeAsOf:at};
const identity={symbol:'AAA',securityId:'fixture-security',issuerCik:'1234',industry:'fixture-industry',knownAt:'2026-10-01T00:00:00Z',validFrom:'2026-01-01T00:00:00Z',validTo:null,source:'https://www.sec.gov/fixture'};
test('fresh trades never refresh absent, stale or future bid/ask clocks',()=>{
 for(const qt of [0,ms-121000,ms+1]){const s=quoteEvidenceState();assert.equal(captureResearchQuotes(s,{events:[event],rows:[{...row,qt}],identities:[identity],cutoff:at}).length,0);assert.equal(s.counters.staleOrMissingBbo,1);}
});
test('point-in-time identity and independent liquidity clocks accompany actual BBO observations',()=>{
 const s=quoteEvidenceState(),quotes=captureResearchQuotes(s,{events:[event],rows:[row],identities:[identity],cutoff:at});
 assert.equal(quotes[0].securityId,'fixture-security');assert.equal(quotes[0].dollarVolume,2e6);assert.equal(quotes[0].fillClaim,false);assert.equal(Object.values(s.metadata)[0].asOf,at);
 const unknown=quoteEvidenceState(),q=captureResearchQuotes(unknown,{events:[event],rows:[{...row,dollarVolume:undefined,vol:1e9,vt:ms}],identities:[],cutoff:at})[0];
 assert.equal(q.securityId,null);assert.equal(q.dollarVolume,null);assert.equal(quoteEvidenceReport(unknown).approvedBuy,false);
});
test('JSON-restored state rejects duplicate/backward cycles and never backfills detection metadata',()=>{
 const original=quoteEvidenceState();captureResearchQuotes(original,{events:[event],rows:[row],identities:[],cutoff:at});
 const restored=JSON.parse(JSON.stringify(original));assert.equal(captureResearchQuotes(restored,{events:[event],rows:[row],identities:[identity],cutoff:at}).length,0);
 const later='2026-10-29T14:01:00Z';captureResearchQuotes(restored,{events:[],rows:[{...row,qt:Date.parse(later),dollarVolumeAsOf:later}],identities:[identity],cutoff:later});
 assert.equal(Object.values(restored.metadata)[0].asOf,later);assert.equal(Object.values(restored.quotes)[0].securityId,null);assert.equal(restored.counters.duplicateOrRetrograde,1);
});
test('premarket observations wait for regular session; half-day close and capacity remain explicit',()=>{
 const s=quoteEvidenceState(),pre='2026-11-27T13:00:00Z',open='2026-11-27T14:30:00Z',close='2026-11-27T18:00:00Z',e={...event,observedAt:pre};
 assert.equal(captureResearchQuotes(s,{events:[e],rows:[{...row,qt:Date.parse(pre)}],cutoff:pre}).length,0);
 assert.equal(captureResearchQuotes(s,{events:[],rows:[{...row,qt:Date.parse(open)}],cutoff:open,maxQuotes:1}).length,1);
 const later='2026-11-27T14:31:00Z';captureResearchQuotes(s,{events:[],rows:[{...row,qt:Date.parse(later)}],cutoff:later,maxQuotes:1});assert.equal(s.counters.droppedQuotes,1);
 assert.equal(captureResearchQuotes(s,{events:[],rows:[{...row,qt:Date.parse(close)}],cutoff:close}).length,0);
});

test('declared point-in-time controls and next observed BBOs form paper-only matched input',()=>{
 const s=quoteEvidenceState(),control={...identity,symbol:'BBB',securityId:'fixture-control',eligibleControl:true},identities=[identity,control];
 const run=(minutes,price)=>{const cutoff=new Date(ms+minutes*60000).toISOString();return captureResearchQuotes(s,{events:minutes===0?[event]:[],rows:[{...row,qt:Date.parse(cutoff),bid:price-.01,ask:price+.01,dollarVolumeAsOf:cutoff},{...row,sym:'BBB',qt:Date.parse(cutoff),dollarVolumeAsOf:cutoff}],identities,cutoff});};
 run(0,10);run(1,10);run(31,11);
 const result=evaluatePaperEvidence(Object.values(s.events),Object.values(s.quotes),Object.values(s.metadata),{cutoff:new Date(ms+32*60000).toISOString()});
 assert.equal(result.counts.resolved,1);assert.match(result.provenance,/SIMULATION/);assert.match(result.conclusion,/NO STRATEGY VERDICT/);
});
test('conflicting provider rows are rejected and absent target rows remain measurable',()=>{
 const s=quoteEvidenceState();captureResearchQuotes(s,{events:[event],rows:[row,{...row,ask:11}],cutoff:at});
 assert.equal(Object.keys(s.quotes).length,0);assert.equal(s.counters.conflictingQuoteRows,1);assert.equal(s.counters.targetSymbolObservations,2);assert.equal(s.counters.missingSymbolRows,1);
});

test('premarket identity availability is retained before the first regular-session quote',()=>{
 const s=quoteEvidenceState(),pre='2026-10-29T13:00:00Z',open='2026-10-29T13:30:00Z';
 captureResearchQuotes(s,{events:[{...event,observedAt:pre}],rows:[],identities:[identity],cutoff:pre});
 captureResearchQuotes(s,{events:[],rows:[{...row,qt:Date.parse(open)}],identities:[identity],cutoff:open});
 assert.equal(Object.values(s.metadata)[0].asOf,pre);
});

test('malformed checkpoint components fail before mutating observed evidence',()=>{
 for(const change of [s=>s.events=[],s=>s.counters.cycles=null,s=>s.lastCycleAt='invalid',s=>s.sourceStatus=null]){
  const state=quoteEvidenceState();change(state);const before=JSON.stringify(state);assert.throws(()=>captureResearchQuotes(state,{events:[event],rows:[row],cutoff:at}),/INVALID_QUOTE_EVIDENCE_INPUT/);assert.equal(JSON.stringify(state),before);
 }
});
