import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {collectDiscovery,discoveryState,updateDiscovery,discoveryReport} from '../discovery-runtime.mjs';
const root=new URL('..',import.meta.url).pathname,cutoff='2026-10-29T14:00:00Z',header='Description: synthetic SEC quarterly index\nCIK|Company Name|Form Type|Date Filed|Filename\n-----\n';
const filing=(cik,date='2026-10-26',form='S-8')=>[cik,'Fixture',form,date,'edgar/data/'+cik+'/'+String(cik).padStart(10,'0')+'-26-000001.txt'].join('|');
async function fixture(t,opts={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-supply-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));for(const d of ['data','study-cache/edgar-idx'])fs.mkdirSync(path.join(dir,d),{recursive:true});
 const days={};for(let i=0;i<300;i++){const d=new Date(Date.UTC(2026,0,1+i)).toISOString().slice(0,10);days[d]={T:['AAA-B','AAA.B','SPY'],o:[10,20,100],h:[11,21,101],l:[9,19,99],c:[10,20,100],v:[1e6,1e6,1e6]};}
 if(opts.ample)for(const x of Object.values(days)){x.T=['AAA-B','AAA.B',...Array.from({length:68},(_,n)=>'S'+String(n).padStart(3,'0')),'SPY'];x.o=Array(71).fill(10);x.c=Array(71).fill(10);x.v=Array(71).fill(1e6);}
 const price=path.join(dir,'study-cache/grouped.json.gz');fs.writeFileSync(price,zlib.gzipSync(JSON.stringify({days})));
 for(const y of [2025,2026])for(let q=1;q<=4;q++)fs.writeFileSync(path.join(dir,'study-cache/edgar-idx',y+'Q'+q+'.json'),'[]');
 const legacyTicker=JSON.stringify({at:'2099-01-01T00:00:00Z',m:{1:['AAA.B']}});fs.writeFileSync(path.join(dir,'study-cache/edgar-idx/tickers.json'),legacyTicker);
 const clock=path.join(dir,'clock.mjs');fs.writeFileSync(clock,`const D=Date;globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:['${cutoff}']));}static now(){return D.parse('${cutoff}');}};const wait=setTimeout;globalThis.setTimeout=(fn,ms,...a)=>wait(fn,Math.min(ms,1),...a);const real=fetch;globalThis.fetch=(u,o)=>{const x=new URL(u);if(x.protocol!=='http:'||!['127.0.0.1','localhost'].includes(x.hostname))throw Error('NETWORK_FORBIDDEN');return real(u,o);};`);
 let variant=opts.variant||'valid',requests=[],followed=0;
 const server=http.createServer((req,res)=>{
  requests.push(req.url);if(req.url==='/redirect-target'){followed++;res.end(header);return;}
  const ticker=req.url.includes('company_tickers'),current=req.url.includes('/2026/QTR4/');
  if(ticker&&opts.ample){res.end(JSON.stringify(Object.fromEntries(['AAA-B','AAA.B',...Array.from({length:68},(_,n)=>'S'+String(n).padStart(3,'0'))].map((s,i)=>[i,{cik_str:i+1,ticker:s}]))));return;}
  if(ticker){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(variant==='ticker-revision'?{0:{cik_str:1,ticker:'RENAMED'},1:{cik_str:2,ticker:'AAA.B'}}:variant==='bad-ticker'?{error:'fixture'}:variant==='null-ticker'?{0:null,1:{cik_str:1,ticker:'AAA-B'}}:variant==='ambiguous'?{0:{cik_str:1,ticker:'AAA-B'},1:{cik_str:1,ticker:'AAA.B'}}:{0:{cik_str:1,ticker:'AAA-B'},1:{cik_str:2,ticker:'AAA.B'}}));return;}
  if(current&&['http','rate'].includes(variant)){res.writeHead(variant==='rate'?429:503);res.end('fixture');return;}
  if(current&&variant==='redirect'){res.writeHead(302,{Location:'/redirect-target'});res.end();return;}
  if(current&&variant==='advertised'){res.writeHead(200,{'Content-Length':String(17*1024*1024)});res.end();return;}
  if(current&&variant==='stream'){res.writeHead(200);const chunk=Buffer.alloc(1024*1024);let n=17;const send=()=>{while(n>0&&!res.destroyed){n--;if(!res.write(chunk)){res.once('drain',send);return;}}if(!res.destroyed)res.end();};send();return;}
  if(current&&variant==='broken'){res.writeHead(200,{'Content-Length':100});res.write('broken');setImmediate(()=>res.destroy());return;}
  const lines=current&&variant==='only-bad'?'bad row\n':!current||variant==='empty'?'':filing(1,variant==='revised'?'2026-10-25':'2026-10-26')+'\n'+filing(2)+'\n'+(variant==='partial'?'bad row\n':variant==='duplicate-conflict'?filing(1,'2026-10-24')+'\n':'');
  const historical=opts.ample&&req.url.includes('/2026/')&&!current?Array.from({length:70},(_,i)=>filing(i+1,req.url.includes('QTR1')?'2026-03-20':req.url.includes('QTR2')?'2026-06-20':'2026-09-20')).join('\n')+'\n':'';
  const text=current&&variant==='header'?'not an SEC index':header+historical+lines;
  const bytes=current&&variant==='gzip'?Buffer.from([31,139,0]):zlib.gzipSync(current&&variant==='inflate'?header+'X'.repeat(65*1024*1024):text);
  res.end(bytes);
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 const read=p=>fs.readFileSync(path.join(dir,p),'utf8'),put=(p,x)=>fs.writeFileSync(path.join(dir,p),typeof x==='string'?x:JSON.stringify(x));
 const run=(script='share-supply.mjs',extra={},expected=0)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--import',clock,path.join(root,script)],{cwd:dir,env:{PATH:process.env.PATH,SEC_BASE:'http://127.0.0.1:'+server.address().port,SEC_UA:'fixture@example.invalid',...extra}});let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);child.on('error',reject);child.on('exit',code=>{try{assert.equal(code,expected,out);resolve(expected?out:JSON.parse(read('data/'+(script==='discovery2.mjs'?'discovery2':'share-supply')+'.json')));}catch(e){reject(e);}});});
 return {dir,run,read,put,days,price,variant:v=>variant=v,setTime:stamp=>fs.writeFileSync(clock,fs.readFileSync(clock,'utf8').replaceAll(cutoff,stamp)),requests:()=>requests,followed:()=>followed,legacyTicker};
}
test('actual Share-supply preserves literal classes and original legacy caches; source IDs/clocks survive restored jobs',async t=>{
 const f=await fixture(t),a=await f.run();assert.equal(a.status,'OK');assert.deepEqual(a.now.map(x=>x.sym).sort(),['AAA-B','AAA.B']);assert.ok(a.now.every(x=>x.sourceId.includes('edgar/data/')&&x.publicationDay==='2026-10-26'&&x.materiality==='NOT_ESTABLISHED'));const before=a.now[0].firstObservedAt;
 assert.equal(f.read('study-cache/edgar-idx/tickers.json'),f.legacyTicker);assert.equal(f.read('study-cache/edgar-idx/2026Q4.json'),'[]');
 const b=await f.run();assert.equal(b.now[0].firstObservedAt,before);assert.equal(f.requests().filter(x=>x.includes('company_tickers')).length,1);
 const i=collectDiscovery({cutoff,readText:f.read});assert.equal(i.observations.length,2);assert.ok(i.observations.every(x=>x.reportedPublicationDay==='2026-10-26'&&x.publicationBasis==='DERIVED_OUTPUT_AVAILABLE'));
});
for(const variant of ['header','gzip','http','rate','redirect','advertised','stream','broken','inflate','bad-ticker','ambiguous']){
 test('actual Share-supply keeps '+variant+' incomplete; no new frozen verdict',async t=>{
  const f=await fixture(t,{variant}),out=await f.run();assert.equal(out.status,'PARTIAL_OR_UNKNOWN');assert.equal(out.firstRun,null);assert.equal(out.now.length,0);assert.equal(f.followed(),0);if(variant==='rate')assert.equal(out.sourceTelemetry.rateLimited,true);
 });
}
test('genuine header-only index is observed empty, not an API/schema failure',async t=>{const f=await fixture(t,{variant:'empty'}),out=await f.run();assert.equal(out.status,'OK');assert.equal(out.now.length,0);assert.equal(out.sourceStatus.SEC_INDEX.status,'OBSERVED');});
test('malformed index sibling does not suppress valid rows or complete coverage',async t=>{const f=await fixture(t,{variant:'partial'}),out=await f.run();assert.equal(out.status,'PARTIAL_OR_UNKNOWN');assert.equal(out.now.length,2);assert.equal(out.sourceArtifacts.find(x=>x.quarter==='2026Q4').rejectedRows,1);assert.equal(collectDiscovery({cutoff,readText:f.read}).observations.length,2);});
test('duplicate/revised filing identities latch conflict, preserve originals and revoke prior discovery',async t=>{
 const f=await fixture(t);await f.run();const state=discoveryState();updateDiscovery(state,{...collectDiscovery({cutoff,readText:f.read}),cutoff,rows:[]});
 f.variant('revised');const b=await f.run();assert.equal(b.now.length,1);const book=JSON.parse(f.read('study-cache/edgar-idx/2026Q4.source.json'));assert.equal(Object.values(book.records).find(x=>x.row[0]===1).row[2],'2026-10-26');assert.ok(b.quarantinedSourceIds.length>=2);
 updateDiscovery(state,{...collectDiscovery({cutoff,readText:f.read}),cutoff,rows:[]});assert.equal(discoveryReport(state,{cutoff,sources:[]}).sourceConflictCount,1);
 f.variant('valid');const again=await f.run();assert.equal(again.now.length,1);assert.ok(again.quarantinedSourceIds.length>=2);
});
test('conflicting siblings within the first response are never admitted as valid events',async t=>{const f=await fixture(t,{variant:'duplicate-conflict'}),out=await f.run();assert.equal(out.now.length,1);assert.equal(out.now[0].sym,'AAA.B');assert.equal(out.status,'PARTIAL_OR_UNKNOWN');});
test('failed current-quarter refresh never reuses old coverage as complete; frozen result is retained',async t=>{
 const f=await fixture(t),a=await f.run(),firstRun={at:'2020-01-01T00:00:00Z',bar:4,to:'2020-01-01',results:{S8A:{...a.latest.results.S8A,verdict:'REJECTED'}}};f.put('data/share-supply.json',{...a,firstRun});f.variant('http');const b=await f.run();assert.deepEqual(b.firstRun,firstRun);assert.equal(b.sourceStatus.SEC_INDEX.status,'PARTIAL_OR_UNKNOWN');assert.equal(b.now.length,0);assert.equal(b.status,'PARTIAL_OR_UNKNOWN');
});
test('unreadable/future source journal is preserved and cannot reset source identity',async t=>{const f=await fixture(t);await f.run();const p='study-cache/edgar-idx/2026Q4.source.json',book=JSON.parse(f.read(p));book.records[Object.keys(book.records)[0]].firstObservedAt='2099-01-01T00:00:00Z';f.put(p,book);const original=f.read(p),out=await f.run();assert.equal(out.status,'PARTIAL_OR_UNKNOWN');assert.equal(f.read(p),original);assert.equal(out.now.length,0);});
test('missing prices preserves frozen result/report clock and exposes unavailable source',async t=>{const f=await fixture(t),a=await f.run();fs.unlinkSync(f.price);const b=await f.run();assert.equal(b.status,'NOT RUN');assert.equal(b.generatedAt,a.generatedAt);assert.equal(collectDiscovery({cutoff,readText:f.read}).observations.length,0);});
test('secondary Discovery2 producer refuses corrupt shared index even with a frozen pool and missing-source override',async t=>{
 const f=await fixture(t);await f.run();f.put('study-cache/edgar-idx/2026Q4.source.json','{broken');const days={};for(let i=0;i<600;i++)days[new Date(Date.UTC(2025,2,8+i)).toISOString().slice(0,10)]={T:['AAA-B','AAA.B','SPY'],o:[10,20,100],c:[10,20,100],v:[1e6,1e6,1e6]};fs.writeFileSync(f.price,zlib.gzipSync(JSON.stringify({days})));
 const firstRun={at:'2020-01-01',results:{keep:{verdict:'REJECTED'}}},pool=[{id:'frozen'}];f.put('data/discovery2.json',{firstRun,pool,generatedAt:cutoff});f.put('data/discovery2-today.json',{generatedAt:cutoff,rules:{one:'TRADABLE SMALL'},buys:[{sym:'AAA-B',rule:'one'}]});
 const out=await f.run('discovery2.mjs',{D2_ALLOW_MISSING:'1'});assert.deepEqual(out.firstRun,firstRun);assert.deepEqual(out.pool,pool);const today=JSON.parse(f.read('data/discovery2-today.json'));assert.equal(today.buys.length,0);assert.equal(today.retainedBuys.length,1);assert.equal(today.generatedAt,cutoff);assert.equal(today.sourceStatus.SEC_INDEX.status,'UNKNOWN');
});
test('strict SEC base rejects lookalike hosts before any fetch',async t=>{const f=await fixture(t);const out=await f.run('share-supply.mjs',{SEC_BASE:'http://localhost.evil.invalid'},1);assert.match(out,/INVALID_SEC_BASE/);assert.equal(f.requests().length,0);});

test('sufficient-case actual study cannot freeze partial sources, then preserves the first complete verdict',async t=>{const f=await fixture(t,{ample:true,variant:'header'}),a=await f.run();assert.ok(a.latest.results.S8A.results.older.n>=20);assert.ok(a.latest.results.S8A.results.newer.n>=20);assert.notEqual(a.latest.results.S8A.verdict,'TOO FEW CASES');assert.equal(a.firstRun,null);f.variant('valid');const b=await f.run();assert.ok(b.firstRun.results.S8A);f.variant('http');const c=await f.run();assert.deepEqual(c.firstRun,b.firstRun);});
test('malformed ticker siblings survive as partial literal mappings',async t=>{const f=await fixture(t,{variant:'null-ticker'}),out=await f.run();assert.equal(out.sourceStatus.SEC_TICKERS.status,'PARTIAL_OR_UNKNOWN');assert.deepEqual(out.now.map(x=>x.sym),['AAA-B']);assert.equal(out.firstRun,null);});
test('future ticker clock cannot suppress source refresh by masquerading as complete coverage',async t=>{const f=await fixture(t);await f.run();const p='study-cache/edgar-idx/tickers.source.json',book=JSON.parse(f.read(p));book.checkedAt='2099-01-01T00:00:00Z';f.put(p,book);const before=f.read(p),out=await f.run();assert.equal(out.sourceStatus.SEC_TICKERS.status,'UNKNOWN');assert.equal(out.now.length,0);assert.equal(f.read(p),before);});
test('changed current ticker mapping preserves original class and revokes prior admission; reversion cannot clear conflict',async t=>{const f=await fixture(t);await f.run();f.setTime('2026-11-06T14:00:00Z');f.variant('ticker-revision');const out=await f.run();assert.equal(out.sourceStatus.SEC_TICKERS.status,'CONFLICT');assert.ok(out.quarantinedSourceIds.some(x=>x.includes('/1/')));const book=JSON.parse(f.read('study-cache/edgar-idx/tickers.source.json'));assert.deepEqual(book.m['1'],['AAA-B']);f.variant('valid');const reverted=await f.run();assert.equal(reverted.sourceStatus.SEC_TICKERS.status,'CONFLICT');assert.ok(reverted.quarantinedSourceIds.some(x=>x.includes('/1/')));});

test('partial refresh retains original book but cannot re-admit target rows absent from that response',async t=>{const f=await fixture(t);await f.run();f.variant('only-bad');const out=await f.run();assert.equal(out.status,'PARTIAL_OR_UNKNOWN');assert.equal(out.now.length,0);const book=JSON.parse(f.read('study-cache/edgar-idx/2026Q4.source.json'));assert.equal(Object.keys(book.records).length,2);assert.equal(book.lastObservedIds.length,0);});

test('secondary producer missing prices cannot leave stale discovered buys actionable',async t=>{const f=await fixture(t);const firstRun={at:'2020-01-01',results:{keep:{verdict:'REJECTED'}}};f.put('data/discovery2.json',{firstRun,generatedAt:cutoff});f.put('data/discovery2-today.json',{generatedAt:cutoff,buys:[{sym:'AAA-B',rule:'one'}]});fs.unlinkSync(f.price);const out=await f.run('discovery2.mjs');assert.deepEqual(out.firstRun,firstRun);assert.equal(out.generatedAt,cutoff);const today=JSON.parse(f.read('data/discovery2-today.json'));assert.equal(today.buys.length,0);assert.equal(today.retainedBuys.length,1);assert.equal(today.sourceStatus.SEC_INDEX.status,'UNKNOWN');});
test('unreadable secondary frozen output is preserved without recomputation',async t=>{const f=await fixture(t);f.put('data/discovery2.json','{broken');await f.run('discovery2.mjs',{},1);assert.equal(f.read('data/discovery2.json'),'{broken');});
