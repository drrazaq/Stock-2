// Desired-behavior review regressions; all inputs and endpoints are synthetic. Not a frozen experiment or live probe.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const root=path.resolve(process.env.REVIEW_TREE||process.cwd());
const {parseSourceTime,latestCompletedSession}=await import(pathToFileURL(path.join(root,'source-contract.mjs')));
const {collectDiscovery}=await import(pathToFileURL(path.join(root,'discovery-runtime.mjs')));
test('malformed months return INVALID without throwing',()=>{
 for(const value of ['2026-13-01','2026-00-10'])assert.equal(parseSourceTime(value,{kind:'date',at:'2026-11-02T16:00:00Z'}).status,'INVALID');
});
test('actual discovery caller isolates malformed publication day before a valid row',()=>{
 const cutoff='2026-11-02T16:00:00Z',base={d:'2026-11-02',a:2,e:1,t:'bmo',timing:'BMO',src:'FINNHUB'};
 const reports=[{...base,sym:'BAD',publicationDay:'2026-13-01'},{...base,sym:'AAA',publicationDay:'2026-11-02'}];
 const out=collectDiscovery({cutoff,readText:p=>{if(p!=='data/earnings-recent.json')throw Error('absent');return JSON.stringify({updated:cutoff,reports,sourceStatus:{FINNHUB_CALENDAR:{status:'OBSERVED'}}});}});
 assert.deepEqual(out.observations.map(x=>x.symbol),['AAA']);
 assert.equal(out.sources.find(x=>x.lane==='EARNINGS_SURPRISE').status,'READ');
});
async function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'market03-review-'));fs.mkdirSync(path.join(dir,'data'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 let response={},calls=0;const server=http.createServer((q,s)=>{calls++;s.setHeader('content-type','application/json');s.end(JSON.stringify(response));});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 const run=async()=>{const child=spawn(process.execPath,[path.join(root,'comeback-lab.mjs')],{cwd:dir,env:{PATH:process.env.PATH,MASSIVE_KEY:'synthetic',MASSIVE_BASE:base},stdio:['ignore','pipe','pipe']});let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);const timer=setTimeout(()=>child.kill('SIGKILL'),5000);const code=await new Promise(r=>child.on('close',r));clearTimeout(timer);assert.equal(code,0,log);return JSON.parse(fs.readFileSync(path.join(dir,'data/comeback-today.json'),'utf8'));};
 return {dir,run,set:x=>response=x,calls:()=>calls};
}
test('actual comeback producer rejects a structurally empty success envelope',async t=>{
 const f=await fixture(t);f.set({});const out=await f.run();assert.equal(f.calls(),1);assert.equal(out.sourceStatus.SPY_BARS.status,'MALFORMED');
});
test('actual comeback producer keeps unresolved cached revision status after a reversion',async t=>{
 const f=await fixture(t),day=latestCompletedSession(Date.now());const bar={t:Date.parse(day+'T05:00:00Z'),o:500,c:501};
 fs.writeFileSync(path.join(f.dir,'data/comeback-spy.json'),JSON.stringify({bars:{[day]:{o:500,c:501}}}));
 f.set({ticker:'SPY',status:'OK',results:[{...bar,c:999}]});assert.equal((await f.run()).sourceStatus.SPY_BARS.status,'CONFLICT');
 f.set({ticker:'SPY',status:'OK',results:[bar]});const out=await f.run();assert.equal(f.calls(),2);assert.equal(out.sourceStatus.SPY_BARS.status,'CONFLICT');
});
