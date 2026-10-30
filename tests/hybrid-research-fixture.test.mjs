import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {runHybridFixture} from '../hybrid-research-fixture.mjs';
const base=Date.parse('2026-10-29T08:00:00Z'),iso=t=>new Date(t).toISOString();
function fixture(n=1){return {version:1,universe:{records:['AAA','BBB'].map(symbol=>({symbol,id:symbol,status:'active',class:'us_equity',tradable:true})),asOf:iso(base-60000),knownAt:iso(base-60000)},cycles:Array.from({length:n},(_,i)=>({cutoff:iso(base+i*60000),responses:[{batch:0,httpStatus:200,rows:Object.fromEntries(['AAA','BBB'].map(s=>[s,{latestTrade:{p:i<20?10:12.5,t:iso(base+i*60000-1000)},latestQuote:{bp:9.99,ap:10.01,t:iso(base+i*60000-1000)},prevDailyBar:{c:10}}]))}],files:{'data/news-log.jsonl':JSON.stringify({sym:'AAA',h:'fixture catalyst',t:base-1000,at:iso(base-1000),sourceId:'stable'})}}))};}
test('330-minute transport-to-nine-lane simulation records outages, stale quotes, first detection and request budgets',async()=>{
 const f=fixture(330);f.cycles[10].responses[0].networkError=true;f.cycles[11].responses[0].rows.AAA.latestQuote.t=iso(base);
 const r=await runHybridFixture(f);assert.equal(r.transport.requests,330);assert.equal(r.report.clockWindowComplete,true);assert.equal(r.report.allDeclaredSweepsReturned,false);assert.equal(r.report.telemetry.incompleteSweeps,1);assert.equal(r.cycles[11].metrics.freshBbo,1);
 assert.equal(Object.values(r.state.discovery.observations)[0].priceAtDetection,10);assert.equal(r.state.discovery.crossings.AAA[25].at,iso(base+20*60000+10));assert.equal(r.cycles[0].discovery.sources.length,9);assert.equal(r.liveCollection,false);assert.equal(r.orders,false);
});
test('duplicate cycles do not fetch, while rate refusal and cancellation remain incomplete',async()=>{
 const f=fixture(2);f.cycles.splice(1,0,f.cycles[0]);const r=await runHybridFixture(f);assert.equal(r.ignoredCycles,1);assert.equal(r.transport.requests,2);
 const d=fixture(3);d.cycles[1].responses[0].httpStatus=429;const limited=await runHybridFixture(d);assert.equal(limited.transport.requests,2);assert.equal(limited.termination,'RATE_LIMITED');assert.equal(limited.report.clockWindowComplete,false);
 d.cycles[0].cancel=true;const cancelled=await runHybridFixture(d);assert.equal(cancelled.transport.requests,0);assert.equal(cancelled.termination,'CANCELLED');
});
test('CLI rejects default/live modes and existing output; fixture mode never uses inherited keys',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'stock2-hybrid-cli-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const input=path.join(dir,'fixture.json'),out=path.join(dir,'output');fs.writeFileSync(input,JSON.stringify(fixture()));
 const cli=new URL('../tools/hybrid-research-fixture.mjs',import.meta.url).pathname,env={PATH:process.env.PATH};
 const child=args=>{const r=spawnSync(process.execPath,[cli,...args],{env,encoding:'utf8'});assert.equal(r.error,undefined,r.error?.message);return r;};
 for(const args of [[],['--collect','anything'],['--fixture',input,dir]])assert.notEqual(child(args).status,0);
 const r=child(['--fixture',input,out]);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).liveCollection,false);assert.equal(JSON.parse(fs.readFileSync(path.join(out,'fixture-result.json'))).transport.requests,1);
});
