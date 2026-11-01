// CATALYST-03 / MARKET-03 end to end (Claude, 2 Nov 2026): representative provider responses -> the ACTUAL producer scripts ->
// their output files -> discovery-runtime normalization -> candidate eligibility -> the evidence fields a research record shows.
// Local fake providers on 127.0.0.1 only; no credentials, no network, no Telegram; strategy rules and frozen results untouched.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import {spawn} from 'node:child_process';
import {collectDiscovery,discoveryState,updateDiscovery} from '../discovery-runtime.mjs';
import {withComebackProvenance} from '../comeback-provenance.mjs';
import {latestCompletedSession,nextSession} from '../source-contract.mjs';
const root=path.resolve(import.meta.dirname,'..');
const day=ms=>new Date(ms).toISOString().slice(0,10),now=Date.now(),cutoff=new Date(now).toISOString();
const prevSession=d=>{let x=d;for(let i=0;i<10;i++){x=day(Date.parse(x+'T12:00:00Z')-864e5);if(nextSession(x,{inclusive:true})===x)return x;}return null;};

async function provider(t,route){
 const hits=[];const server=http.createServer(async(req,res)=>{const u=new URL(req.url,'http://x');hits.push(u.pathname+'?'+u.searchParams.get('symbol'));const [status,body]=await route(u,hits);res.statusCode=status;res.setHeader('content-type','application/json');res.end(typeof body==='string'?body:JSON.stringify(body));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>server.close());return {base:'http://127.0.0.1:'+server.address().port,hits};
}
function workdir(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'c03-'));fs.mkdirSync(path.join(dir,'data'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 return {dir,put:(f,v)=>fs.writeFileSync(path.join(dir,f),typeof v==='string'?v:JSON.stringify(v)),read:f=>fs.readFileSync(path.join(dir,f),'utf8'),json:f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'))};}
const run=(dir,script,env)=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,[path.join(root,script)],{cwd:dir,env:{PATH:process.env.PATH,...env}});let out='';c.stdout.on('data',x=>out+=x);c.stderr.on('data',x=>out+=x);c.on('exit',code=>code===0?resolve(out):reject(Error(script+' exit '+code+': '+out.slice(-1500))));});

// ---------------------------------------------------------------- earnings -----------------------------------------------------
const d3=day(now-3*864e5),d2=day(now-2*864e5),d1=day(now-1*864e5);
function earningsRoute({fhAAA=1.2300001}={}){
 return async u=>{
  if(u.pathname==='/query'){const s=u.searchParams.get('symbol');
   if(s==='AAA')return [200,{symbol:'AAA',quarterlyEarnings:[{fiscalDateEnding:'2026-09-30',reportedDate:d3,reportedEPS:'1.23',estimatedEPS:'1.00',reportTime:'pre-market'},{fiscalDateEnding:'2026-12-31',reportedDate:d1,reportedEPS:'None',estimatedEPS:'1.10'}]}];
   if(s==='BBB')return [200,{symbol:'XYZ',quarterlyEarnings:[{reportedDate:d3,reportedEPS:'9',estimatedEPS:'1'}]}];   // answers for another ticker
   return [200,{Information:'rate limit reached'}];}
  if(u.pathname==='/stable/earnings'){const s=u.searchParams.get('symbol');
   if(s==='BBB')return [200,[{symbol:'BBB',date:d3,epsActual:2,epsEstimated:1},{symbol:'BBB.W',date:d2,epsActual:5,epsEstimated:1}]];
   return [402,{error:'plan'}];}
  if(u.pathname==='/calendar/earnings')return [200,{earningsCalendar:[
   {symbol:'AAA',date:d3,hour:'',epsActual:fhAAA,epsEstimate:1.0},              // same report as Alpha Vantage, to the cent
   {symbol:'DDD',date:d2,hour:'dmh',epsActual:2,epsEstimate:1},                  // during market hours
   {symbol:'EEE',date:d1,hour:'amc',epsActual:null,epsEstimate:0.4},             // scheduled, not reported yet
   {symbol:'BRK.B',date:d2,hour:'bmo',epsActual:3,epsEstimate:2},                // share class: not mapped to a plain key
   {symbol:'FFF',date:d1,hour:'amc',epsActual:0.5,epsEstimate:0.4},
   {symbol:'GGG',date:d1,hour:'bmo',epsActual:false,epsEstimate:1}]}];          // malformed
  return [404,{}];};
}
async function earningsRun(t,w,p){
 return run(w.dir,'earnings-study.mjs',{ALPHAVANTAGE_KEY:'fixture',AV_BASE:p.base,FMP_KEY:'fixture',FMP_BASE:p.base,FINNHUB_KEY:'fixture',FH_BASE:p.base,AV_CALLS:'5'});
}

test('earnings: every provider outcome is distinct; identity, pending, class and malformed rows never read as an observed empty check', async t=>{
 const w=workdir(t),p=await provider(t,earningsRoute());w.put('data/signals.json',{stocks:[{sym:'AAA'},{sym:'BBB'},{sym:'CCC'}]});
 await earningsRun(t,w,p);const doc=w.json('data/earnings-recent.json'),S=doc.sourceStatus;
 assert.equal(S.ALPHA_VANTAGE.status,'RATE_LIMITED');assert.equal(S.ALPHA_VANTAGE.identityMismatch,1);assert.equal(S.ALPHA_VANTAGE.pendingRows,1);
 assert.equal(S.FMP.status,'REFUSED');assert.equal(S.FMP.identityMismatch,1);
 const cache=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(w.dir,'data/earnings-cache.json.gz'))));
 assert.equal(cache.syms.BBB,undefined,'a response carrying another symbol stores nothing');assert.equal(cache.syms.XYZ,undefined);
 assert.equal(S.FINNHUB_CALENDAR.status,'PARTIAL_OR_UNKNOWN','one malformed row (GGG) keeps the calendar from reading clean');
 assert.equal(S.FINNHUB_CALENDAR.pendingRows,1);assert.equal(S.FINNHUB_CALENDAR.unsupportedClassRows,1);assert.equal(S.FINNHUB_CALENDAR.malformedRows,1);
 const by=Object.fromEntries(doc.reports.map(r=>[r.sym,r]));assert.deepEqual(Object.keys(by).sort(),['AAA','DDD','FFF']);
 assert.deepEqual(by.AAA.corroboratedBy,['ALPHA_VANTAGE']);assert.equal(by.AAA.t,'bmo','Alpha Vantage timing fills the unknown Finnhub hour');
 assert.equal(by.DDD.timing,'DMH');assert.equal(by.DDD.t,null,'study timing keeps its meaning (null)');
 assert.equal(by.FFF.reactionSession,nextSession(d1,{inclusive:true})===d1?nextSession(d1):nextSession(d1,{inclusive:true}),'after-the-close report reacts at the next session');
 assert.equal(by.AAA.timing,'BMO');assert.equal(by.AAA.timingFrom,'ALPHA_VANTAGE');
 // -> discovery: eligible observations carry the report's provider, timing and reaction session; failures are visible.
 const cut=new Date().toISOString(),i=collectDiscovery({readText:f=>w.read(f),cutoff:cut});const src=i.sources.find(x=>x.lane==='EARNINGS_SURPRISE');
 assert.equal(src.producerStatus.ALPHA_VANTAGE.status,'RATE_LIMITED');assert.equal(src.producerStatus.FMP.status,'REFUSED');
 const obs=Object.fromEntries(i.observations.filter(o=>o.lane==='EARNINGS_SURPRISE').map(o=>[o.symbol,o]));
 assert.deepEqual(Object.keys(obs).sort(),['AAA','DDD','FFF']);
 assert.equal(obs.DDD.earnings.timing,'DMH');assert.equal(obs.AAA.reportedPublicationDay,d3);assert.equal(obs.AAA.publicationBasis,'DERIVED_OUTPUT_AVAILABLE');
 const state=discoveryState();updateDiscovery(state,{observations:i.observations,rows:[],cutoff:cut,sources:i.sources});
 const rec=Object.values(state.observations).find(o=>o.symbol==='AAA');assert.equal(rec.classification,'RESEARCH ONLY');assert.equal(rec.status,'NOT AN APPROVED BUY');
 assert.equal(state.sourceReliability.EARNINGS_SURPRISE.lastProducerStatus.ALPHA_VANTAGE.status,'RATE_LIMITED');
});

test('earnings: a later cross-provider disagreement is a conflict that revokes the shown observation in the next cycle', async t=>{
 const w=workdir(t);w.put('data/signals.json',{stocks:[{sym:'AAA'}]});
 const p1=await provider(t,earningsRoute());await earningsRun(t,w,p1);
 const c1=new Date().toISOString(),state=discoveryState(),i1=collectDiscovery({readText:f=>w.read(f),cutoff:c1});updateDiscovery(state,{observations:i1.observations,rows:[],cutoff:c1,sources:i1.sources});
 assert.ok(Object.values(state.observations).some(o=>o.symbol==='AAA'&&!o.sourceConflict));
 const p2=await provider(t,earningsRoute({fhAAA:1.31}));await earningsRun(t,w,p2);              // Finnhub now reports 1.31 for the same report
 const doc=w.json('data/earnings-recent.json');assert.equal(doc.reports.some(r=>r.sym==='AAA'),false);assert.ok(doc.quarantinedSourceIds.includes('AAA|'+d3));
 const cache=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(w.dir,'data/earnings-cache.json.gz'))));
 assert.equal(cache.revisionConflicts['AAA|'+d3].kind,'CROSS_PROVIDER');assert.equal(cache.syms.AAA.find(x=>x.d===d3).a,1.23,'the original report is kept');
 const later=new Date(Date.now()+1000).toISOString(),i2=collectDiscovery({readText:f=>w.read(f),cutoff:later});updateDiscovery(state,{observations:i2.observations,rows:[],cutoff:later,sources:i2.sources});
 const rec=Object.values(state.observations).find(o=>o.symbol==='AAA');assert.equal(rec.sourceConflict,true);assert.equal(rec.sourceConflictReason,'SOURCE_REVISION_CONFLICT');
});

test('earnings: an old report is not a fresh catalyst even when the file was generated just now', ()=>{
 const doc={updated:cutoff,reports:[{sym:'OLD',d:day(now-9*864e5),a:2,e:1,t:'bmo',publicationDay:day(now-9*864e5),timing:'BMO',src:'FINNHUB'},{sym:'NEW',d:d1,a:2,e:1,t:'bmo',publicationDay:d1,timing:'BMO',src:'FINNHUB'},
  {sym:'LEG',d:day(now-9*864e5),a:2,e:1,t:'bmo'}],sourceStatus:{FINNHUB_CALENDAR:{status:'OBSERVED'}}};
 const i=collectDiscovery({readText:f=>{if(f==='data/earnings-recent.json')return JSON.stringify(doc);throw Error('absent');},cutoff});
 const syms=i.observations.map(o=>o.symbol).sort();assert.deepEqual(syms,['LEG','NEW'],'legacy rows without a report day keep their earlier handling; dated old rows are refused');
 assert.equal(i.sources.find(x=>x.lane==='EARNINGS_SURPRISE').producerStatus.ALPHA_VANTAGE.status,'LEGACY_UNSTATED');
});

// ------------------------------------------------------------ discovery2 / comeback ----------------------------------------------
test('daily-close producers: freshness counts sessions, so Friday\'s close is current on Monday and a week-old close is refused', ()=>{
 const latest=latestCompletedSession(now),older=prevSession(prevSession(prevSession(latest)));
 const file=(buys,sourceStatus)=>JSON.stringify({generatedAt:cutoff,buys,...(sourceStatus?{sourceStatus}:{})});
 const fresh={sym:'AAA',rule:'r1',lastCloseDay:latest,sourceId:'x',priceBasis:'SPLIT_ADJUSTED_AS_OF_FETCH',sourceIdentityBasis:'PRICE_CACHE_TICKER_NOT_SECURITY_ID'},old={...fresh,sym:'BBB',lastCloseDay:older,sourceId:'y'};
 const read=doc=>f=>{if(f==='data/discovery2-today.json')return doc;throw Error('absent');};
 let i=collectDiscovery({readText:read(file([fresh,old],{SEC_INDEX:{status:'OBSERVED'},PRICE_CACHE:{status:'OBSERVED'}})),cutoff});
 assert.deepEqual(i.observations.map(o=>o.symbol),['AAA']);assert.equal(i.observations[0].closeLagSessions,0);assert.equal(i.observations[0].lastCloseDay,latest);
 i=collectDiscovery({readText:read(file([fresh],{SEC_INDEX:{status:'OBSERVED'},PRICE_CACHE:{status:'STALE'}})),cutoff});
 assert.equal(i.observations.length,0,'a producer that says its prices are stale admits nothing');
 i=collectDiscovery({readText:read(file([{sym:'AAA',rule:'legacy'}])),cutoff});
 assert.equal(i.observations.length,1);assert.equal(i.sources.find(x=>x.lane==='TECHNICAL_BUILDUP').producerStatus.PRICE_CACHE.status,'LEGACY_UNSTATED');
});

test('comeback: signals from a missing, undated or stale lab file are withheld with the reason; fresh ones carry provenance', ()=>{
 const latest=latestCompletedSession(now),stale=prevSession(prevSession(prevSession(latest)));
 const doc={generatedAt:cutoff,methods:{
  'A-1':{lab:'alpha',newSignals:[{sym:'AAA',close:10,halal:'unknown'},{sym:'XYZpA',close:5}]},
  'B-1':{lab:'beta',newSignals:[{sym:'BBB',close:20}]},
  'C-1':{lab:'gamma',newSignals:[{sym:'CCC',close:30}]},
  'D-1':{lab:'delta',newSignals:[{sym:'DDD',close:40}]}}};
 const todays={alpha:{generatedAt:cutoff,lastClose:latest},beta:{generatedAt:cutoff,lastClose:stale},gamma:{generatedAt:cutoff}};
 const out=withComebackProvenance(doc,todays,{nowMs:now,spyStatus:{status:'UNAVAILABLE'}});
 assert.deepEqual(out.methods['A-1'].newSignals.map(x=>x.sym),['AAA']);assert.equal(out.methods['A-1'].retainedSignals[0].withheld,'SYMBOL_INVALID');
 assert.equal(out.methods['B-1'].retainedSignals[0].withheld,'LAB_TODAY_FILE_STALE');assert.equal(out.methods['C-1'].retainedSignals[0].withheld,'LAB_TODAY_FILE_MALFORMED');
 assert.equal(out.methods['D-1'].retainedSignals[0].withheld,'LAB_TODAY_FILE_MISSING');
 assert.equal(out.sourceStatus.LAB_TODAY_FILES.withheldLabs,3);assert.equal(out.sourceStatus.SPY_BARS.status,'UNAVAILABLE');
 const a=out.methods['A-1'].newSignals[0];assert.equal(a.lastCloseDay,latest);assert.equal(a.priceBasis,'LAB_REPORTED_BASIS_UNVERIFIED');assert.match(a.sourceId,/^[a-f0-9]{64}$/);
 const i=collectDiscovery({readText:f=>{if(f==='data/comeback-today.json')return JSON.stringify(out);throw Error('absent');},cutoff});
 assert.deepEqual(i.observations.map(o=>o.symbol),['AAA']);const o=i.observations[0];
 assert.equal(o.priceBasis,'LAB_REPORTED_BASIS_UNVERIFIED');assert.equal(o.sourceIdentityBasis,'PROVIDER_TICKER_NOT_SECURITY_ID');assert.equal(o.publicationBasis,'DERIVED_OUTPUT_AVAILABLE');
});

// --------------------------------------------------------------------- news --------------------------------------------------------
test('news: the same story re-attributed to other symbols is held back, with which field changed recorded and no text added', async t=>{
 const w=workdir(t),pub=Math.floor(now/1000)-120;let related='AAA';const sent=[];
 w.put('data/my-positions.json',{AAA:{entry:10,stop:9}});w.put('data/news-meta.json',{AAA:{at:cutoff,name:'Example',peers:[],words:[]}});
 const p=await provider(t,async(u)=>{
  if(u.pathname==='/company-news')return [200,[{id:77,headline:'AAA announces share offering',summary:'Offering of new shares.',url:'https://example.invalid/a',datetime:pub,related,source:'Wire',category:'company'}]];
  if(u.pathname==='/news')return [200,[]];
  if(u.pathname.includes('/sendMessage')){sent.push(1);return [200,{ok:true,result:{message_id:sent.length}}];}
  if(u.pathname.includes('/quote'))return [200,{c:10,pc:10,t:Math.floor(now/1000)}];
  return [200,{}];});
 const env={FINNHUB_KEY:'fixture',FH_BASE:p.base,TG_BASE:p.base,TG_TOKEN:'fixture',TG_CHAT:'fixture',ALPACA_KEY:'fixture',ALPACA_SECRET:'fixture',ALPACA_DATA_BASE:p.base};
 await run(w.dir,'news-watch.mjs',env);
 const book1=w.json('data/news-delivery.json');assert.equal(Object.keys(book1.sourceFieldArchive).length,1);
 const entry=Object.values(book1.sourceFieldArchive)[0];assert.equal(JSON.stringify(entry).includes('offering'),false,'no story text in the published state');
 related='AAA,ZZZ';await run(w.dir,'news-watch.mjs',env);
 const audits=w.read('data/news-log.jsonl').split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(x=>x.recordType==='SOURCE_REVISION_QUARANTINE');
 assert.equal(audits.length,1);assert.equal(audits[0].reason,'ATTRIBUTION_CONFLICT');assert.deepEqual(audits[0].changedFields,['attribution']);
 assert.equal(Object.values(w.json('data/news-delivery.json').sourceFieldArchive)[0].attributionConflict,true);
 related='AAA';await run(w.dir,'news-watch.mjs',env);                                             // reverting does not clear it
 assert.equal(w.read('data/news-log.jsonl').split('\n').filter(l=>l.includes('ATTRIBUTION_CONFLICT')).length,2);
});
