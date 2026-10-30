import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {newCapture,appendCapture,checkpointCapture,recoverCapture,finishCapture,sha,frameFromSnapshots} from '../prospective-paper-capture.mjs';
import {replayFixture} from '../tools/replay-prospective-capture.mjs';
const key='synthetic-paper-capture-key-only';
const t=n=>new Date(Date.parse('2026-11-05T14:30:00Z')+n*60000).toISOString();
function fixture(cohort='CALIBRATION'){
 const universe=['AAA','BBB','CCC','DDD','EEE','FFF'];
 const plan={rule:'EXISTING_STREAM_SEC_30M_V1',cohort,day:'2026-11-05',start:t(0),enrollmentEnd:t(4),end:t(40),universe,sourceSha:'a'.repeat(40),enrollmentManifestSha256:'b'.repeat(64)};
 const metadata=universe.map((symbol,i)=>({symbol,securityId:'synthetic-security-'+i,industry:'synthetic-industry-'+Math.floor(i/2),asOf:t(-1),instrumentType:'CS',identityAudit:'DOCUMENTED_SOURCE_REVIEW',zad:'PASS',referenceSha256:'c'.repeat(64)}));
 const events=[0,2].map(i=>({eventId:'synthetic-original-'+i,symbol:universe[i],lane:'SEC_EVENT',sourceNamespace:'SEC',sourceId:'0000000001-26-000001',sourceRevisionId:'d'.repeat(64),sourceAt:t(-1),firstIngestedAt:t(0),observedAt:t(0)}));
 const frames=Array.from({length:41},(_,i)=>{
  const quotes=metadata.map((m,j)=>({symbol:m.symbol,securityId:m.securityId,at:t(i),quoteAsOf:t(i),bid:i>=31&&j===0?10.99:i>=31&&j===2?8.99:9.99,ask:11.01,dollarVolume:2e6,dollarVolumeAsOf:t(i),bidSizeShares:1000,askSizeShares:1000}));
  for(const q of quotes)if(q.bid===9.99)q.ask=10.01;if(i>=31)quotes[2].ask=9.01;
  const rawResponse=JSON.stringify(Object.fromEntries(quotes.map(q=>[q.symbol,{latestQuote:{t:q.quoteAsOf,bp:q.bid,ap:q.ask,bs:q.bidSizeShares,as:q.askSizeShares},minuteBar:{t:t(i-1),l:9,v:250000}}])));
  const frame=frameFromSnapshots({sequence:i,requestedAt:t(i),receivedAt:t(i),rawResponse,events:i===0?events:[],metadata,universe});frame.metadata=i===0?metadata:[];return frame;
 });return {synthetic:true,plan,frames};
}
const build=x=>x.frames.reduce(appendCapture,newCapture(x.plan));
test('complete synthetic candidate/control paths retain winners and losers, exact fees and capacity, no admissions',()=>{
 const r=finishCapture(build(fixture()));assert.equal(r.evaluation.counts.resolved,2);assert.equal(r.evaluation.counts.resolvedWithVerifiedDisplayedSize,2);assert.equal(r.genuineAdmissions,0);assert.equal(r.confirmationEligible,false);assert.equal(r.coverage.continuousPathVerified,true);
 assert.equal(r.evaluation.cases[0].candidate.netAfterSpreadAndFees,(99*(10.99-10.01)-6)/1000);assert.ok(r.evaluation.cases[1].candidate.netAfterSpreadAndFees<0);assert.ok(r.evaluation.cases[0].candidate.stressNet<r.evaluation.cases[0].candidate.netAfterSpreadAndFees);
});
test('authenticated restart preserves identical result; tamper, wrong key, cohort/source drift refused',()=>{
 const x=fixture(),half={...x,frames:x.frames.slice(0,12)};let s=build(half);const sealed=checkpointCapture(s,key);s=recoverCapture(sealed,key,x.plan);for(const f of x.frames.slice(12))s=appendCapture(s,f);assert.deepEqual(finishCapture(s),finishCapture(build(x)));
 assert.throws(()=>recoverCapture(sealed,'wrong-synthetic-key',x.plan));assert.throws(()=>recoverCapture({...sealed,context:{...sealed.context,cohort:'EVALUATION'}},key,x.plan));assert.throws(()=>recoverCapture(sealed,key,{...x.plan,cohort:'EVALUATION'}));
 const broken=structuredClone(sealed);broken.ciphertext=Buffer.from('interrupted').toString('base64');assert.throws(()=>recoverCapture(broken,key,x.plan));
});
test('missing horizon remains unresolved; skipped frames and missing controls remain visible, no late backfill',()=>{
 const x=fixture();for(const f of x.frames.filter(f=>f.sequence>=31&&f.sequence<=34))f.quotes=f.quotes.filter(q=>q.symbol!=='AAA');const r=finishCapture(build(x));assert.equal(r.evaluation.counts.resolved,1);assert.equal(r.evaluation.cases[0].candidate.reason,'NO_FRESH_HORIZON_EXIT');assert.equal(r.coverage.continuousPathVerified,false);assert.equal(r.coverage.missingSymbols.length,4);
 const y=fixture();y.frames.splice(5,1);y.frames.forEach((f,i)=>f.sequence=i);assert.deepEqual(finishCapture(build(y)).coverage.missingMinuteSlots,[5]);
});
test('unknown identity retains original research; metadata cannot backfill an earlier detection',()=>{
 for(const change of [m=>m.zad='UNKNOWN',m=>m.instrumentType='UNKNOWN',m=>m.asOf=t(1)]){const x=fixture();change(x.frames[0].metadata[0]);if(x.frames[0].metadata[0].asOf===t(1)){x.frames[1].metadata=[x.frames[0].metadata.shift()];}const r=finishCapture(build(x));assert.equal(r.attempts[0].reason,'IDENTITY_INDUSTRY_OR_ZAD_UNKNOWN');assert.equal(r.evaluation.counts.attempted,1);assert.equal(build(x).frames[0].frame.events.length,2);}
});
test('same event/restart does not reenroll; conflicting payload quarantines both and fixed cutoff retains late context',()=>{
 const x=fixture();x.frames[1].events=[{...x.frames[0].events[0]}];let r=finishCapture(build(x));assert.equal(r.evaluation.counts.attempted,2);assert.equal(r.attempts[2].reason,'REPEATED_EVENT_CONTEXT');
 x.frames[1].events[0].sourceRevisionId='e'.repeat(64);r=finishCapture(build(x));assert.equal(r.evaluation.counts.attempted,1);assert.equal(r.attempts[0].reason,'CONFLICTING_EVENT_ID');
 const y=fixture();y.frames[5].events=[{...y.frames[0].events[0],eventId:'late',observedAt:t(5)}];r=finishCapture(build(y));assert.equal(r.attempts.at(-1).reason,'ENROLLMENT_CLOSED_RETAINED_CONTEXT');
});
test('bounded input/time/feed/raw integrity and sequential single-writer frames fail closed',()=>{
 const x=fixture(),s=newCapture(x.plan);for(const mutation of [f=>f.sequence=1,f=>f.feed='iex',f=>f.receivedAt=t(-1),f=>f.rawResponse+='changed',f=>f.at=t(41),f=>f.events=Array(21).fill({}),f=>f.rawResponse='x'.repeat(65537)]){const f=structuredClone(x.frames[0]);mutation(f);assert.throws(()=>appendCapture(s,f));}
 const next=appendCapture(s,x.frames[0]);assert.throws(()=>appendCapture(next,x.frames[0]));assert.throws(()=>newCapture({...x.plan,start:'2026-11-07T14:30:00Z',day:'2026-11-07',enrollmentEnd:'2026-11-07T14:34:00Z',end:'2026-11-07T15:10:00Z'}));
});
test('offline actual CLI, encrypted write/recovery, overwrite refusal and interrupted checkpoint preserve original bytes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'paper-capture-'));try{
  const input=path.join(dir,'fixture.json'),out=path.join(dir,'sealed');fs.writeFileSync(input,JSON.stringify(fixture()));const original=fs.readFileSync(input);
  const cli=JSON.parse(execFileSync(process.execPath,['tools/replay-prospective-capture.mjs','--synthetic',input,out],{encoding:'utf8'}));assert.equal(cli.simulatedResolved,2);assert.equal(cli.providerRequests,0);assert.equal(fs.readdirSync(out).length,41);assert.deepEqual(fs.readFileSync(input),original);
  assert.throws(()=>replayFixture(input,out,key));const p=fixture().plan;const good=JSON.parse(fs.readFileSync(path.join(out,'39.enc')));fs.writeFileSync(path.join(out,'40.enc'),'interrupted');const recovered=recoverCapture(good,key,p);assert.equal(recovered.frames.length,40);assert.equal(finishCapture(recovered).coverage.continuousPathVerified,false);assert.throws(()=>JSON.parse(fs.readFileSync(path.join(out,'40.enc'))));
  assert.ok(!fs.readFileSync(path.join(out,'0.enc'),'utf8').includes('synthetic-security'));assert.equal(fs.readdirSync(dir).length,2);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('raw snapshot mapper keeps independent BBO/size clocks and only completed regular-session dollar lower bounds',()=>{
 const x=fixture(),f=x.frames[1];assert.equal(f.quotes[0].dollarVolume,2250000);assert.equal(f.quotes[0].quoteAsOf,t(1));assert.equal(x.frames[0].quotes[0].dollarVolume,null);
 const raw=JSON.parse(f.rawResponse);raw.AAA.latestQuote.t=t(-5);raw.AAA.latestTrade={t:t(1),p:1000,s:1000000};raw.AAA.minuteBar.t=t(1);
 const mapped=frameFromSnapshots({...f,rawResponse:JSON.stringify(raw),metadata:x.frames[0].metadata,universe:x.plan.universe});assert.equal(mapped.quotes[0].quoteAsOf,t(-5));assert.equal(mapped.quotes[0].dollarVolume,null);assert.equal(mapped.quotes[0].bidSizeShares,1000);
 raw.AAA.minuteBar={t:t(0),l:1e308,v:100};assert.equal(frameFromSnapshots({...f,rawResponse:JSON.stringify(raw),metadata:[],universe:x.plan.universe}).quotes[0].dollarVolume,null);
 assert.throws(()=>frameFromSnapshots({...f,rawResponse:'{"message":"not entitled"}',universe:x.plan.universe}));
});
test('insufficient displayed capacity is recorded rather than called executable; no spread double charge',()=>{
 const x=fixture();for(const f of x.frames)for(const q of f.quotes){q.askSizeShares=1;q.bidSizeShares=1;}
 const r=finishCapture(build(x));assert.equal(r.evaluation.counts.resolved,2);assert.equal(r.evaluation.counts.resolvedWithVerifiedDisplayedSize,0);assert.equal(r.displayedCapacityUnverified,2);assert.equal(r.genuineAdmissions,0);
});

test('injected bounded transport executes raw snapshots through checkpoint ACK and unchanged evaluator',async()=>{
 const {runCalibration}=await import('../prospective-capture-transport.mjs');const x=fixture();let clock=Date.parse(t(0)),calls=0,uploads=0;
 const r=await runCalibration({plan:x.plan,now:()=>clock,wait:async ms=>{clock+=ms;},metadata:x.frames[0].metadata,readEvents:async at=>at===t(0)?x.frames[0].events:[],persist:async s=>{uploads++;assert.equal(recoverCapture(checkpointCapture(s,key),key,x.plan).chain,s.chain);return true;},transport:async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.match(url,/^https:\/\/data.alpaca.markets\/v2\/stocks\/snapshots\?/);assert.equal(new URL(url).searchParams.get('feed'),'sip');return new Response(x.frames[calls++].rawResponse,{status:200});}});
 assert.equal(r.status,'CAPTURE_COMPLETE');assert.equal(r.providerAttempts,41);assert.equal(uploads,41);assert.equal(r.evaluation.counts.resolved,2);assert.equal(r.genuineAdmissions,0);
});
test('rate limits, malformed/oversized responses, unconfirmed checkpoint and failed upload stop without retries',async()=>{
 const {runCalibration}=await import('../prospective-capture-transport.mjs');const x=fixture();
 for(const kind of ['429','503','malformed','oversized','upload','throw']){
  let clock=Date.parse(t(0)),calls=0;
  const r=await runCalibration({plan:x.plan,now:()=>clock,wait:async ms=>{clock+=ms;},metadata:x.frames[0].metadata,readEvents:async()=>[],persist:async()=>{if(kind==='throw')throw Error('synthetic');return kind!=='upload';},transport:async()=>{calls++;return new Response(kind==='malformed'?'not-json':kind==='oversized'?'x'.repeat(65537):x.frames[0].rawResponse,{status:/^\d/.test(kind)?Number(kind):200});}});
  assert.equal(calls,1);assert.notEqual(r.status,'CAPTURE_COMPLETE');assert.equal(r.genuineAdmissions,0);assert.equal(r.providerAttempts,1);
 }
});

test('never-resolving provider is interrupted at ten seconds, no retry or speculative completion',async()=>{
 const {runCalibration}=await import('../prospective-capture-transport.mjs');const x=fixture();let signal;
 const r=await runCalibration({plan:x.plan,now:()=>Date.parse(t(0)),wait:async()=>{},metadata:[],readEvents:async()=>[],persist:async()=>true,transport:async(_,o)=>{signal=o.signal;return new Promise(()=>{});}});
 assert.equal(r.status,'REQUEST_TIMEOUT_STOP');assert.equal(signal.aborted,true);assert.equal(r.providerAttempts,1);assert.equal(r.evaluation.counts.attempted,0);
});

test('rolling request cap stops a faulty scheduler before a third attempt within sixty seconds',async()=>{
 const {runCalibration}=await import('../prospective-capture-transport.mjs');const x=fixture();let clock=Date.parse(t(0)),calls=0;
 const r=await runCalibration({plan:x.plan,now:()=>clock,wait:async()=>{clock+=1000;},metadata:x.frames[0].metadata,readEvents:async()=>[],persist:async()=>true,transport:async()=>{calls++;return new Response(x.frames[0].rawResponse);}});
 assert.equal(r.status,'RATE_BUDGET_STOP');assert.equal(calls,2);assert.equal(r.providerAttempts,2);
});


test('late original event handoff cannot select an entry captured before the paper system learned the event',()=>{
 const x=fixture(),e=x.frames[0].events.shift();x.frames[5].events=[e];const r=finishCapture(build(x));assert.equal(r.evaluation.counts.attempted,1);assert.equal(r.attempts.at(-1).reason,'LATE_EVENT_HANDOFF_NO_RETROSPECTIVE_ENTRY');assert.equal(r.attempts.at(-1).paperHandoffAt,t(5));assert.equal(r.attempts.at(-1).originalObservedAt,t(0));
 const y=fixture(),timely=y.frames[0].events.shift();timely.observedAt=new Date(Date.parse(t(0))+30000).toISOString();y.frames[1].events=[timely];const s=finishCapture(build(y));assert.equal(s.evaluation.counts.resolved,2);assert.equal(s.evaluation.cases.find(c=>c.eventId===timely.eventId).candidate.entryAt,t(1));
});
