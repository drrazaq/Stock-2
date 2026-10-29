import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {collectDiscovery,discoveryState,updateDiscovery,discoveryReport} from '../discovery-runtime.mjs';
const script=new URL('../chain-ripple.mjs',import.meta.url).pathname,cutoff='2026-10-29T14:00:00Z';
function fixture(t,{ample=false}={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-chain-caller-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));fs.mkdirSync(path.join(dir,'study-cache'));fs.mkdirSync(path.join(dir,'data'));
 const days={};for(let i=0;i<(ample?400:300);i++){const d=new Date(ample?Date.UTC(2025,8,23+i):Date.UTC(2026,0,1+i)).toISOString().slice(0,10);days[d]=ample?{T:['AAA-B','AAA.B','SPY',...Array.from({length:67},(_,n)=>'C'+String(n).padStart(2,'0'))],o:Array(70).fill(10),c:[i%4===0||i===399?12:10,...Array(69).fill(10)],v:[i%4===0||i===399?3e6:1e6,...Array(69).fill(1e6)]}:{T:['AAA-B','AAA.B','SPY'],o:[10,10,100],c:[i===299?12:10,i===299?12:10,100],v:[i===299?3e6:1e6,i===299?3e6:1e6,1e6]};}
 const chains={chains:{Tech:[{layer:'suppliers',syms:['AAA-B','AAA.B']}]}},cache=path.join(dir,'study-cache/grouped.json.gz'),output=path.join(dir,'data/chain-ripple.json'),clock=path.join(dir,'clock.mjs');
 const writePrices=()=>fs.writeFileSync(cache,zlib.gzipSync(JSON.stringify({days}))),writeChains=()=>fs.writeFileSync(path.join(dir,'data/chains.json'),JSON.stringify(chains));writePrices();writeChains();
 const readText=p=>fs.readFileSync(path.join(dir,p),'utf8');
 const run=(now=cutoff,expect=0)=>{fs.writeFileSync(clock,`const D=Date;globalThis.Date=class extends D{constructor(...a){super(...(a.length?a:['${now}']));}static now(){return D.parse('${now}');}};globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN');};`);const r=spawnSync(process.execPath,['--import',clock,script],{cwd:dir,env:{PATH:process.env.PATH},encoding:'utf8'});assert.equal(r.status,expect,r.stdout+r.stderr);return expect===0?JSON.parse(fs.readFileSync(output,'utf8')):r;};
 return {days,chains,writePrices,writeChains,run,readText,removePrices:()=>fs.unlinkSync(cache),removeChains:()=>fs.unlinkSync(path.join(dir,'data/chains.json')),seed:x=>fs.writeFileSync(output,typeof x==='string'?x:JSON.stringify(x))};
}
test('actual chain producer preserves classes, derived identity and first-observed clock across jobs',t=>{
 const f=fixture(t),a=f.run(),b=f.run('2026-10-29T15:00:00Z');assert.equal(a.status,'OK');assert.deepEqual(a.todayMovers.map(x=>x.sym).sort(),['AAA-B','AAA.B']);assert.equal(a.todayMovers[0].derivedAvailableAt,b.todayMovers[0].derivedAvailableAt);assert.equal(a.todayMovers[0].sourceRevisionId,b.todayMovers[0].sourceRevisionId);
 const i=collectDiscovery({cutoff:'2026-10-29T15:00:00Z',readText:f.readText});assert.equal(i.observations.length,2);assert.ok(i.observations.every(x=>Date.parse(x.asOf)===Date.parse(cutoff)&&x.publicationBasis==='DERIVED_OUTPUT_AVAILABLE'&&Date.parse(x.sourceCapturedAt)===Date.parse(cutoff)&&x.sourceDataDay==='2026-10-27'&&x.priceBasis==='UNVERIFIED_CORPORATE_ACTION_BASIS'));
});
test('fresh report generation cannot revive old underlying daily bars',t=>{const f=fixture(t);f.run();f.run('2026-11-03T14:00:00Z');const i=collectDiscovery({cutoff:'2026-11-03T14:00:00Z',readText:f.readText});assert.equal(i.observations.length,0);assert.equal(i.sources.find(x=>x.lane==='INDUSTRY_RIPPLE').rejected,2);});
for(const missing of ['prices','chains'])test('unavailable '+missing+' preserves frozen output and original report clock but prevents admission',t=>{
 const f=fixture(t),a=f.run(),firstRun={at:'2020-01-01',results:{fixed:{verdict:'REJECTED'}}};f.seed({...a,firstRun});if(missing==='prices')f.removePrices();else f.removeChains();const out=f.run();assert.deepEqual(out.firstRun,firstRun);assert.equal(out.generatedAt,a.generatedAt);assert.equal(out.status,'NOT RUN');const i=collectDiscovery({cutoff,readText:f.readText});assert.equal(i.observations.length,0);assert.equal(i.sources.find(x=>x.lane==='INDUSTRY_RIPPLE').producerStatus.CHAIN_ANALYSIS.status,'UNKNOWN');
});
test('malformed chain siblings are isolated and incomplete source cannot freeze a new verdict',t=>{
 const f=fixture(t);f.chains.chains.Bad=null;f.chains.chains.Tech.push(null);f.chains.chains.Tech[0].syms.push(null);f.writeChains();const out=f.run();assert.equal(out.status,'PARTIAL_OR_UNKNOWN');assert.equal(out.sourceStatus.CHAIN_ANALYSIS.rejectedRows,3);assert.equal(out.todayMovers.length,2);assert.equal(out.firstRun,null);assert.equal(collectDiscovery({cutoff,readText:f.readText}).observations.length,2);
});
for(const change of ['sub-float-price','withdrawn-mover','removed-chain'])test('chain source revision persists, including '+change+', revokes discovery credit and never overwrites original',t=>{
 const f=fixture(t),a=f.run(),state=discoveryState();updateDiscovery(state,{...collectDiscovery({cutoff,readText:f.readText}),cutoff,rows:[]});
 if(change==='removed-chain'){delete f.chains.chains.Tech;f.writeChains();}else{f.days['2026-10-27'].c[0]=change==='withdrawn-mover'?10:12.00000001;f.writePrices();}
 const out=f.run();assert.ok(out.quarantinedSourceIds.length>=1);const row=out.todayMovers.find(x=>x.sym==='AAA-B');assert.equal(row.revisionStatus,'CONFLICT');assert.equal(row.move,a.todayMovers.find(x=>x.sym==='AAA-B').move);
 updateDiscovery(state,{...collectDiscovery({cutoff,readText:f.readText}),cutoff,rows:[]});assert.ok(discoveryReport(state,{cutoff,sources:[]}).sourceConflictCount>=1);
 f.days['2026-10-27'].c[0]=12;f.chains.chains.Tech=[{layer:'suppliers',syms:['AAA-B','AAA.B']}];f.writePrices();f.writeChains();const restored=f.run();assert.equal(restored.todayMovers.find(x=>x.sym==='AAA-B').revisionStatus,'CONFLICT');
});
test('malformed/future prices preserve prior evidence as UNKNOWN without retiming',t=>{const f=fixture(t),a=f.run();f.days['2026-10-30']=f.days['2026-10-27'];f.writePrices();const out=f.run();assert.equal(out.status,'NOT RUN');assert.equal(out.generatedAt,a.generatedAt);assert.equal(out.sourceStatus.CHAIN_ANALYSIS.status,'UNKNOWN');});
test('unreadable prior output is preserved and fails before recomputation',t=>{const f=fixture(t);f.seed('{broken');f.run(cutoff,1);assert.equal(f.readText('data/chain-ripple.json'),'{broken');});
test('corrupt explicit revision journal cannot silently reset identity',t=>{const f=fixture(t),a=f.run();f.seed({...a,sourceRevisions:false});const out=f.run();assert.equal(out.status,'NOT RUN');assert.equal(out.sourceStatus.CHAIN_ANALYSIS.status,'UNKNOWN');});

test('actual study with enough judged cases cannot freeze incomplete input, then preserves its first complete verdict',t=>{
 const f=fixture(t,{ample:true});f.chains.chains.Bad=null;f.writeChains();const partial=f.run();assert.notEqual(partial.latest.results.SAME_LAYER_3.verdict,'TOO FEW CASES');assert.ok(partial.latest.results.SAME_LAYER_3.results.older.n>=20);assert.ok(partial.latest.results.SAME_LAYER_3.results.newer.n>=20);assert.equal(partial.firstRun,null);
 delete f.chains.chains.Bad;f.writeChains();const complete=f.run();assert.ok(Object.keys(complete.firstRun.results).length>0);const saved=complete.firstRun;f.days['2026-10-27'].c[0]=11;f.writePrices();const revised=f.run();assert.deepEqual(revised.firstRun,saved);
});
