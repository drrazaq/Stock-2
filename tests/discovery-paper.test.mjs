import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluatePaperEvidence} from '../discovery-paper.mjs';
const t=m=>new Date(Date.parse('2026-10-29T14:00:00Z')+m*60000).toISOString();
const event={symbol:'AAA',eventId:'fixture-1',observedAt:t(0)};
const meta=['AAA','BBB'].map((symbol,i)=>({symbol,securityId:'fixture-security-'+i,industry:'fixture-sector',asOf:t(-1)}));
const q=(symbol,m,bid,ask,extra={})=>({symbol,securityId:'fixture-security-'+(symbol==='AAA'?0:1),at:t(m),bid,ask,quoteAsOf:t(m),dollarVolume:2e6,dollarVolumeAsOf:t(m),...extra});
const prices=[q('AAA',1,9.99,10.01),q('BBB',1,9.99,10.01),q('AAA',15,8.99,9.01),q('AAA',31,10.99,11.01),q('BBB',31,10.19,10.21)];
test('matched paper uses next observed ask, actual bid, whole shares, two fees and stressed slippage',()=>{
 const r=evaluatePaperEvidence([event],prices,meta,{cutoff:t(32)}),c=r.cases[0];assert.equal(c.status,'MATCHED_PAPER_RESOLVED');assert.equal(c.candidate.quantity,99);
 assert.ok(Math.abs(c.candidate.netAfterSpreadAndFees-(99*(10.99-10.01)-6)/1000)<1e-12);assert.ok(c.candidate.stressNet<c.candidate.netAfterSpreadAndFees);assert.ok(c.candidate.observedLiquidationDrawdown<-.1);assert.match(r.conclusion,/NO STRATEGY VERDICT/);
});
test('future metadata, stale entry and absent controls earn no matched result',()=>{
 for(const [metadata,quotes,reason] of [[meta.map(x=>({...x,asOf:t(2)})),prices,'NO_POINT_IN_TIME_SECURITY_METADATA'],[meta,prices.map(x=>({...x,quoteAsOf:t(-10)})),'NO_FRESH_EXECUTABLE_ENTRY_EVIDENCE'],[meta.slice(0,1),prices,'NO_SAME_TIME_INDUSTRY_LIQUIDITY_CONTROL']]){
  const r=evaluatePaperEvidence([event],quotes,metadata,{cutoff:t(32)});assert.equal(r.cases[0].reason,reason);assert.equal(r.counts.resolved,0);
 }
});
test('missing horizon quote stays unresolved; a later recovery cannot be backfilled',()=>{
 const r=evaluatePaperEvidence([event],prices.filter(x=>x.at!==t(31)).concat(q('AAA',40,12,12.02)),meta,{cutoff:t(45)});assert.equal(r.counts.resolved,0);assert.equal(r.cases[0].status,'UNRESOLVED');assert.equal(r.cases[0].matchedEdge,null);assert.ok(r.cases[0].candidate.maxObservedGrossMove<.01);
});
test('future discovery membership cannot change an earlier matched-control choice',()=>{
 const future={symbol:'BBB',eventId:'future',observedAt:t(20)};
 const r=evaluatePaperEvidence([event,future],prices,meta,{cutoff:t(32)});assert.equal(r.cases[0].status,'MATCHED_PAPER_RESOLVED');assert.equal(r.cases[0].control.symbol,'BBB');
});
test('a wide exit remains a loss instead of being filtered away',()=>{
 const quotes=prices.map(x=>x.symbol==='AAA'&&x.at===t(31)?{...x,bid:8,ask:11}:x);const c=evaluatePaperEvidence([event],quotes,meta,{cutoff:t(32)}).cases[0];assert.ok(c.candidate.netAfterSpreadAndFees<0);assert.equal(c.candidate.exitBid,8);
});

test('duplicate discoveries cannot inflate resolved paper sample counts',()=>{
 const r=evaluatePaperEvidence([event,{...event},null],prices,meta,{cutoff:t(32)});
 assert.equal(r.counts.resolved,1);assert.equal(r.cases[1].reason,'DUPLICATE_DISCOVERY_EVENT');assert.equal(r.cases[2].reason,'INVALID_DISCOVERY_EVENT');
});
test('ticker ambiguity and conflicting quote clocks cannot select favorable paper prices',()=>{
 const ambiguous=meta.concat({...meta[0],securityId:'other-share-class'});
 assert.equal(evaluatePaperEvidence([event],prices,ambiguous,{cutoff:t(32)}).cases[0].reason,'NO_POINT_IN_TIME_SECURITY_METADATA');
 const conflicted=prices.concat({...prices[0],ask:9.5});
 const r=evaluatePaperEvidence([event],conflicted,meta,{cutoff:t(32)});
 assert.equal(r.counts.resolved,0);assert.equal(r.quoteIntegrity.conflictingClocks,1);
 const identical=evaluatePaperEvidence([event],prices.concat({...prices[0]}),meta,{cutoff:t(32)});
 assert.equal(identical.counts.resolved,1);assert.equal(identical.quoteIntegrity.duplicates,1);
});
test('quotes from an unverified or reused security identity never become entries or exits',()=>{
 assert.equal(evaluatePaperEvidence([event],prices.map(({securityId,...q})=>q),meta,{cutoff:t(32)}).counts.resolved,0);
 const wrongExit=prices.map(q=>q.symbol==='AAA'&&q.at===t(31)?{...q,securityId:'reused-ticker'}:q);
 assert.equal(evaluatePaperEvidence([event],wrongExit,meta,{cutoff:t(32)}).cases[0].status,'UNRESOLVED');
 const newer=meta.concat({...meta[0],securityId:'replacement-security',asOf:t(0)});
 assert.equal(evaluatePaperEvidence([event],prices,newer,{cutoff:t(32)}).counts.resolved,0);
});

test('quoted paper returns never imply sufficient displayed size or an actual fill',()=>{
 const unverified=evaluatePaperEvidence([event],prices,meta,{cutoff:t(32)});
 assert.equal(unverified.counts.resolved,1);assert.equal(unverified.counts.resolvedWithVerifiedDisplayedSize,0);assert.equal(unverified.cases[0].candidate.entryDisplayedSizeVerified,false);
 const enough=evaluatePaperEvidence([event],prices.map(q=>({...q,bidSizeShares:200,askSizeShares:200})),meta,{cutoff:t(32)});
 assert.equal(enough.counts.resolvedWithVerifiedDisplayedSize,1);assert.match(enough.cases[0].candidate.fillClaim,/NONE/);
 const small=evaluatePaperEvidence([event],prices.map(q=>({...q,bidSizeShares:1,askSizeShares:1})),meta,{cutoff:t(32)});assert.equal(small.counts.resolvedWithVerifiedDisplayedSize,0);
 const conflict=evaluatePaperEvidence([event],prices.map(q=>({...q,bidSizeShares:200,askSizeShares:200})).concat({...prices[0],bidSizeShares:1,askSizeShares:1}),meta,{cutoff:t(32)});assert.equal(conflict.counts.resolved,0);assert.equal(conflict.quoteIntegrity.conflictingClocks,1);
});

test('unrepresentable whole-share quantities remain blocked, never infinite paper positions',()=>{
 const tiny=prices.map(q=>({...q,bid:9.999e-309,ask:1e-308}));
 const r=evaluatePaperEvidence([event],tiny,meta,{cutoff:t(32)});assert.equal(r.counts.resolved,0);assert.equal(r.cases[0].candidate.reason,'NOTIONAL_QUANTITY_UNREPRESENTABLE');
});
test('finite quote inputs cannot overflow into resolved or profitable paper evidence',()=>{
 const extreme=prices.map(q=>q.symbol==='AAA'&&q.at===t(31)?{...q,bid:1e308,ask:1.001e308}:q);
 const r=evaluatePaperEvidence([event],extreme,meta,{cutoff:t(32)});assert.equal(r.counts.resolved,0);assert.equal(r.cases[0].candidate.reason,'NONFINITE_PAPER_ARITHMETIC');
});
