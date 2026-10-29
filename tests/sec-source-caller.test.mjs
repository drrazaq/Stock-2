import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {collectDiscovery,discoveryState,updateDiscovery} from '../discovery-runtime.mjs';
const root=new URL('..',import.meta.url).pathname;
async function fixture(t,{legacy=false,status=200,archive=false,budget=20}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-sec-caller-'));fs.mkdirSync(path.join(dir,'data'));fs.mkdirSync(path.join(dir,'ev-cache'));const now=Date.now()-120000,stamp=new Date(now).toISOString(),date=stamp.slice(0,10),ids=['0000000001-26-000001','0000000001-26-000002'];fs.writeFileSync(path.join(dir,'data/signals.json'),JSON.stringify({uni:[{sym:'AAA'}]}));
 if(legacy)fs.writeFileSync(path.join(dir,'ev-cache/events-cache.json.gz'),zlib.gzipSync(JSON.stringify({ciks:{AAA:[1,'Fixture']},ciksAt:new Date().toISOString(),syms:{AAA:{cik:1,t:new Date().toISOString().slice(0,10),old:true,ev:[{a:ids[0],p:stamp.slice(0,16)+'Z',f:'CONTRACT'}]}}})));
 let requests=0;const server=http.createServer((req,res)=>{
  res.setHeader('Content-Type','application/json');let body={};
  if(req.url.includes('company_tickers'))body={0:{ticker:'AAA',cik_str:1,title:'Fixture'}};
  else if(req.url.includes('submissions')){requests++;res.statusCode=status;body=status===200?{sic:'1000',name:'Fixture',filings:{recent:{form:['8-K','8-K'],accessionNumber:ids,acceptanceDateTime:[stamp,stamp],filingDate:[date,date],items:['1.01','1.01']},files:archive?[{name:'CIK0000000001-submissions-001.json',filingTo:date}]:[]}}:{error:'fixture'};if(req.url.includes('submissions-001'))body={error:'archive refused'};}
  res.end(JSON.stringify(body));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.close();fs.rmSync(dir,{recursive:true,force:true});});
 const run=()=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'events-study.mjs')],{cwd:dir,env:{PATH:process.env.PATH,SEC_BASE:'http://127.0.0.1:'+server.address().port,FDA_CALLS:'0',EV_CALLS:String(budget)}});let out='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>out+=d);child.on('error',reject);child.on('exit',code=>code===0?resolve(out):reject(Error(out)));});
 const read=p=>fs.readFileSync(path.join(dir,p),'utf8');return {run,read,requests:()=>requests,ids,stamp,cache:()=>JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir,'ev-cache/events-cache.json.gz'))))};
}
test('real SEC fetch producer retains accessions and clocks through discovery and a second process',async t=>{
 const f=await fixture(t);await f.run();const doc=JSON.parse(f.read('data/events-recent.json'));assert.equal(doc.events.length,2);assert.deepEqual(doc.events.map(x=>x.sourceId).sort(),f.ids);assert.ok(doc.events.every(x=>x.publicationAt===f.stamp&&Number.isFinite(Date.parse(x.firstObservedAt))));const cutoff=new Date().toISOString(),i=collectDiscovery({readText:f.read,cutoff});const state=discoveryState();updateDiscovery(state,{...i,rows:[],cutoff});assert.equal(Object.keys(state.observations).length,2);assert.ok(i.observations.every(x=>x.sourceCapturedAt!==null&&x.asOf===f.stamp&&x.sourceNamespace==='SEC_EDGAR'));const first=doc.events[0].firstObservedAt;await f.run();assert.equal(JSON.parse(f.read('data/events-recent.json')).events[0].firstObservedAt,first);assert.equal(f.requests(),1);
});
test('legacy cache identity survives but its unknown ingestion clock is never backfilled',async t=>{
 const f=await fixture(t,{legacy:true});await f.run();const doc=JSON.parse(f.read('data/events-recent.json'));assert.equal(doc.events[0].firstObservedAt,null);const i=collectDiscovery({readText:f.read,cutoff:new Date().toISOString()});assert.equal(i.observations[0].sourceCapturedAt,null);assert.equal(i.observations[0].reportedSourceId,f.ids[0]);assert.equal(f.requests(),0);
});
for(const opts of [{status:503},{status:429},{archive:true}])test('real SEC caller retains UNKNOWN/incomplete state '+JSON.stringify(opts),async t=>{
 const f=await fixture(t,opts);await f.run();assert.equal(JSON.parse(f.read('data/sec-status.json')).ok,false);assert.equal(f.cache().syms.AAA.old,false);assert.equal(f.cache().syms.AAA.t,undefined);if(opts.status===429)assert.equal(f.requests(),4);
});

test('SEC retries share the actual caller request budget',async t=>{const f=await fixture(t,{status:429,budget:2});await f.run();assert.equal(f.requests(),1);assert.equal(JSON.parse(f.read('data/sec-status.json')).ok,false);assert.equal(f.cache().syms.AAA.t,undefined);});
test('malformed/future/pre-publication SEC ingestion clocks reject only those rows',()=>{const at=new Date().toISOString(),pub=new Date(Date.now()-60000).toISOString(),good={sym:'AAA',p:pub,firstObservedAt:at,sourceId:'one'};const files={'data/events-recent.json':JSON.stringify({updated:at,events:[good,{...good,sourceId:'two',firstObservedAt:'bad'},{...good,sourceId:'three',firstObservedAt:new Date(Date.now()+3600000).toISOString()},{...good,sourceId:'four',firstObservedAt:new Date(Date.parse(pub)-1000).toISOString()}]})};const i=collectDiscovery({cutoff:at,readText:p=>{if(!(p in files))throw Error();return files[p];}});assert.equal(i.observations.length,1);assert.equal(i.sources.find(x=>x.lane==='SEC_EVENT').rejected,3);});
