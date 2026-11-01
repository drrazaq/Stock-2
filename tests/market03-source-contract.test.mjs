// MARKET-03 source contract: identity, units, clocks, sessions, timing, adjustment basis, revisions (Claude, 2 Nov 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import {providerSymbol,strictNumber,parseSourceTime,sessionPhase,nextSession,earningsTiming,reactionSession,adjustmentBasis,observeRevision,validRevisionBook,combineStatus} from '../source-contract.mjs';
const AT='2026-11-02T16:00:00Z';

test('share classes and preferreds stay distinct or fail closed; no alias is guessed', () => {
 const dot=providerSymbol('BRK.B',{provider:'FINNHUB'}),dash=providerSymbol('BRK-B',{provider:'FMP'});
 assert.equal(dot.status,'OK');assert.equal(dash.status,'OK');assert.notEqual(dot.symbol,dash.symbol);
 assert.equal(dot.identityBasis,'PROVIDER_CLASS_SYMBOL_UNMAPPED');
 for(const raw of ['BRK/B','BRK B','XYZpA','^SPX','ABC.WS.A','TOOLONGX'])assert.equal(providerSymbol(raw).status,'INVALID',raw);
 assert.equal(providerSymbol('PBR.A').status,'OK');                                   // class kept literally, never mapped to PBR-A
 assert.equal(providerSymbol(null).status,'MISSING');assert.equal(providerSymbol('').status,'MISSING');
 assert.equal(providerSymbol(' aapl ').symbol,'AAPL');
});

test('a provider answering for a different ticker (ticker change, alias, share class) is an identity mismatch', () => {
 assert.equal(providerSymbol('META',{requested:'FB'}).status,'IDENTITY_MISMATCH');
 assert.equal(providerSymbol('BRK-B',{requested:'BRK.B'}).status,'IDENTITY_MISMATCH');
 assert.equal(providerSymbol('BRKB',{requested:'BRK.B'}).status,'IDENTITY_MISMATCH');
 assert.equal(providerSymbol('aapl',{requested:'AAPL'}).status,'OK');
});

test('numbers: missing tokens are MISSING, coercions are INVALID, ranges are explicit', () => {
 for(const x of [null,undefined,'','None','  n/a ','-'])assert.equal(strictNumber(x).status,'MISSING',String(x));
 for(const x of [false,true,'1,2','12abc','0x10',NaN,Infinity,{},[]])assert.equal(strictNumber(x).status,'INVALID',String(x));
 assert.deepEqual(strictNumber(' -0.25 '),{status:'OK',value:-0.25});
 assert.equal(strictNumber(-1,{min:0}).status,'OUT_OF_RANGE');
});

test('clocks: unit mix-ups, zone-less ISO, impossible dates, future and stale are distinct statuses', () => {
 assert.equal(parseSourceTime(1762099200000,{kind:'epoch_s',at:AT}).status,'UNIT_MISMATCH');
 assert.equal(parseSourceTime(1762099200,{kind:'epoch_ms',at:AT}).status,'UNIT_MISMATCH');
 assert.equal(parseSourceTime(1762099200,{kind:'epoch_s',at:AT}).status,'OK');
 assert.equal(parseSourceTime('2026-11-02T09:30:00',{kind:'iso',at:AT}).status,'AMBIGUOUS_ZONE');
 assert.equal(parseSourceTime('2026-02-30',{kind:'date',at:AT}).status,'INVALID');
 assert.equal(parseSourceTime('2026-02-30T10:00:00Z',{kind:'iso',at:AT}).status,'INVALID');
 assert.equal(parseSourceTime('2026-11-03',{kind:'date',at:AT}).status,'FUTURE');
 assert.equal(parseSourceTime('2026-11-02T16:00:01Z',{kind:'iso',at:AT}).status,'FUTURE');
 assert.equal(parseSourceTime('2026-10-20',{kind:'date',at:AT,maxAgeMs:5*864e5}).status,'STALE');
 assert.equal(parseSourceTime(undefined,{kind:'iso',at:AT}).status,'MISSING');
 assert.throws(()=>parseSourceTime('2026-11-02',{kind:'date'}),/observation clock/);
});

test('DST: the repeated 01:30 New York hour on 1 Nov 2026 is two distinct instants when offsets are explicit', () => {
 const edt=parseSourceTime('2026-11-01T01:30:00-04:00',{kind:'iso',at:AT}),est=parseSourceTime('2026-11-01T01:30:00-05:00',{kind:'iso',at:AT});
 assert.equal(edt.status,'OK');assert.equal(est.status,'OK');assert.equal(est.ms-edt.ms,3600e3);
 assert.equal(edt.nyDay,'2026-11-01');
 // first trading day after DST: 9:30 New York is 14:30 UTC, not 13:30
 assert.equal(sessionPhase(Date.parse('2026-11-02T14:29:00Z')).phase,'PREMARKET');
 assert.equal(sessionPhase(Date.parse('2026-11-02T14:30:00Z')).phase,'REGULAR');
 assert.equal(sessionPhase(Date.parse('2026-10-30T13:30:00Z')).phase,'REGULAR');            // still EDT on 30 Oct
});

test('sessions: half day, holiday, weekend and beyond-calendar days', () => {
 const half=sessionPhase(Date.parse('2026-11-27T18:30:00Z'));                              // 13:30 New York, after the 13:00 close
 assert.equal(half.phase,'AFTER_HOURS');assert.equal(half.halfDay,true);
 assert.equal(sessionPhase(Date.parse('2026-11-27T17:59:00Z')).phase,'REGULAR');
 assert.equal(sessionPhase(Date.parse('2026-11-26T15:00:00Z')).phase,'CLOSED');           // Thanksgiving
 assert.equal(sessionPhase(Date.parse('2030-01-02T15:00:00Z')).phase,'CALENDAR_UNKNOWN');
 assert.equal(nextSession('2026-11-25'),'2026-11-27');assert.equal(nextSession('2026-11-28',{inclusive:true}),'2026-11-30');
});

test('earnings timing: provider codes map explicitly, unknown timing returns both candidate reaction sessions', () => {
 assert.equal(earningsTiming('FINNHUB','dmh'),'DMH');assert.equal(earningsTiming('ALPHA_VANTAGE','post-market'),'AMC');
 assert.equal(earningsTiming('FMP',undefined),'UNKNOWN');assert.equal(earningsTiming('FINNHUB',''),'UNKNOWN');
 assert.deepEqual(reactionSession('2026-11-25','AMC'),{status:'OK',session:'2026-11-27'});   // after the close before Thanksgiving
 assert.deepEqual(reactionSession('2026-11-02','BMO'),{status:'OK',session:'2026-11-02'});
 assert.deepEqual(reactionSession('2026-11-02','UNKNOWN'),{status:'AMBIGUOUS',session:null,candidates:['2026-11-02','2026-11-03']});
 assert.deepEqual(reactionSession('2026-11-01','AMC'),{status:'OK',session:'2026-11-02'});   // weekend report
 assert.equal(reactionSession('2030-01-02','BMO').status,'CALENDAR_UNKNOWN');
});

test('adjustment basis is labelled from the request, never assumed', () => {
 assert.equal(adjustmentBasis({provider:'MASSIVE',adjusted:true}),'SPLIT_ADJUSTED_AS_OF_FETCH');
 assert.equal(adjustmentBasis({provider:'MASSIVE',adjusted:false}),'RAW_UNADJUSTED');
 assert.equal(adjustmentBasis({provider:'MASSIVE'}),'UNKNOWN');assert.equal(adjustmentBasis({provider:'TWELVE'}),'UNKNOWN');
});

test('revision book: first, same, conflict latches through reversion, capacity and chronology are explicit', () => {
 const book={},a={eps:1.2},b={eps:1.3};
 assert.equal(observeRevision(book,{key:'AAA|2026-10-29',content:a,at:'2026-10-30T00:00:00Z'}).status,'FIRST');
 assert.equal(observeRevision(book,{key:'AAA|2026-10-29',content:{...a},at:'2026-10-31T00:00:00Z'}).status,'SAME');
 assert.equal(observeRevision(book,{key:'AAA|2026-10-29',content:b,at:'2026-11-01T00:00:00Z'}).status,'CONFLICT');
 assert.equal(observeRevision(book,{key:'AAA|2026-10-29',content:a,at:'2026-11-02T00:00:00Z'}).status,'CONFLICT');
 assert.equal(observeRevision(book,{key:'AAA|2026-10-29',content:a,at:'2026-10-01T00:00:00Z'}).status,'CHRONOLOGY');
 assert.ok(validRevisionBook(book));
 const full={};observeRevision(full,{key:'x',content:1,at:AT,capacity:1});
 assert.equal(observeRevision(full,{key:'y',content:1,at:AT,capacity:1}).status,'CAPACITY');
 assert.equal(validRevisionBook({bad:{}}),false);                                    // a corrupt book is refused at load
 const corrupt={};observeRevision(corrupt,{key:'z',content:1,at:AT});const id=Object.keys(corrupt)[0];corrupt[id].first='0'.repeat(64);
 assert.throws(()=>observeRevision(corrupt,{key:'z',content:1,at:AT}),/UNREADABLE/);      // a corrupt entry is never overwritten
});

test('combined status: one failing provider keeps the lane from reading as a successful check', () => {
 assert.equal(combineStatus(['OBSERVED','OBSERVED']),'OBSERVED');
 assert.equal(combineStatus(['EMPTY','EMPTY']),'EMPTY');
 assert.equal(combineStatus(['OBSERVED','RATE_LIMITED']),'PARTIAL');
 assert.equal(combineStatus(['REFUSED','MALFORMED']),'UNKNOWN');
 assert.equal(combineStatus(['OBSERVED','CONFLICT']),'CONFLICT');
 assert.equal(combineStatus([]),'NOT_FETCHED');
});

test('bounded JSON transport: a hung fetcher times out, an oversized or invalid body is never an observed answer', async () => {
 const {readJsonSource}=await import('../source-contract.mjs');
 const hung=()=>new Promise(()=>{});                                                          // ignores AbortSignal entirely
 assert.equal((await readJsonSource(hung,'http://x',{timeoutMs:30})).status,'TIMEOUT');
 const big=()=>Promise.resolve(new Response('['+'1,'.repeat(3000)+'1]'));
 assert.equal((await readJsonSource(big,'http://x',{maxBytes:1000})).status,'BODY_LIMIT');
 assert.equal((await readJsonSource(()=>Promise.resolve(new Response('{oops')),'http://x')).status,'INVALID_JSON');
 assert.equal((await readJsonSource(()=>Promise.resolve(new Response('x',{status:402})),'http://x')).status,'REFUSED');
 assert.equal((await readJsonSource(()=>Promise.resolve(new Response('x',{status:429})),'http://x')).status,'RATE_LIMITED');
 assert.equal((await readJsonSource(()=>Promise.reject(Error('dns')),'http://x')).status,'NETWORK_ERROR');
 const ok=await readJsonSource(()=>Promise.resolve(new Response('{"a":1}')),'http://x');assert.equal(ok.status,'OK');assert.deepEqual(ok.body,{a:1});
});

test('session-based close freshness: weekends and holidays do not age a close', async () => {
 const {latestCompletedSession,closeLagSessions}=await import('../source-contract.mjs');
 assert.equal(latestCompletedSession(Date.parse('2026-11-02T15:00:00Z')),'2026-10-30');      // Monday 10:00 New York: Friday is current
 assert.equal(latestCompletedSession(Date.parse('2026-11-02T21:05:00Z')),'2026-11-02');      // after Monday's 16:00 close
 assert.equal(latestCompletedSession(Date.parse('2026-11-27T18:05:00Z')),'2026-11-27');      // half day: closed at 13:00
 assert.equal(closeLagSessions('2026-10-30',Date.parse('2026-11-02T15:00:00Z')),0);
 assert.equal(closeLagSessions('2026-10-29',Date.parse('2026-11-02T15:00:00Z')),1);
 assert.equal(closeLagSessions('2026-11-25',Date.parse('2026-11-30T15:00:00Z')),1);           // Thanksgiving is not a session
 assert.equal(closeLagSessions('2026-11-03',Date.parse('2026-11-02T15:00:00Z')),-1);
 assert.equal(latestCompletedSession(Date.parse('2031-01-02T15:00:00Z')),null);
});
