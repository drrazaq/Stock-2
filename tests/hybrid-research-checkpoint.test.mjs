import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHybridCheckpointJournal,readHybridCheckpoint} from '../hybrid-research-checkpoint.mjs';
import {runHybridFixture} from '../hybrid-research-fixture.mjs';
import {createHybridSnapshotTransport} from '../hybrid-snapshot-transport.mjs';
const sha='b'.repeat(40),secret='stock2-hybrid-public-fixture-key',base=Date.parse('2026-10-29T08:00:00Z'),iso=n=>new Date(n).toISOString();
export const fixture={version:1,universe:{records:[{symbol:'AAA',id:'fixture-id',status:'active',class:'us_equity',tradable:true}],asOf:iso(base-1000),knownAt:iso(base-1000)},cycles:Array.from({length:3},(_,i)=>({cutoff:iso(base+i*60000),responses:[{batch:0,httpStatus:200,rows:{AAA:{latestTrade:{p:10,t:iso(base+i*60000-1000)},latestQuote:{bp:9.99,ap:10.01,t:iso(base+i*60000-1000)},prevDailyBar:{c:10}}}}]}))};
function root(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-hybrid-cp-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;}
test('encrypted immutable checkpoints restore a separate job without resetting requests, bytes, clock or evidence',async t=>{
 const dir=path.join(root(t),'sealed'),journal=createHybridCheckpointJournal({directory:dir,secret,sourceSha:sha});const first=await runHybridFixture({...fixture,cycles:fixture.cycles.slice(0,2)},{onCycle:x=>journal.append(x)});
 assert.equal(journal.report().files,2);const file=path.join(dir,journal.report().lastCheckpoint),restored=readHybridCheckpoint(file,{secret,expectedSourceSha:sha,notAfter:iso(base+2*60000)});
 const continued=createHybridCheckpointJournal({directory:dir,secret,sourceSha:sha,resume:true});const last=await runHybridFixture({...fixture,cycles:fixture.cycles.slice(2)},{resumeCheckpoint:restored,onCycle:x=>continued.append(x)});
 assert.equal(last.transport.requests,3);assert.ok(last.transport.bytes>first.transport.bytes);assert.equal(last.transport.startedAt,first.transport.startedAt);assert.equal(last.state.cycles,3);assert.equal(continued.report().files,3);
 assert.ok(fs.readdirSync(dir).every(n=>n.endsWith('.enc')));assert.doesNotMatch(fs.readFileSync(file,'utf8'),/fixture-id|latestTrade|stock2-hybrid-public/);
});
test('wrong key, tampered ciphertext and renamed/source-swapped envelopes cannot restore',async t=>{
 const dir=path.join(root(t),'sealed'),j=createHybridCheckpointJournal({directory:dir,secret,sourceSha:sha});await runHybridFixture({...fixture,cycles:fixture.cycles.slice(0,1)},{onCycle:x=>j.append(x)});const file=path.join(dir,j.report().lastCheckpoint),bytes=fs.readFileSync(file),env=JSON.parse(bytes);
 assert.throws(()=>readHybridCheckpoint(file,{secret:'wrong-public-fixture-key',expectedSourceSha:sha}));assert.throws(()=>readHybridCheckpoint(file,{secret,expectedSourceSha:'c'.repeat(40)}));
 env.ciphertext=Buffer.from('tampered').toString('base64');fs.writeFileSync(file,JSON.stringify(env));assert.throws(()=>readHybridCheckpoint(file,{secret,expectedSourceSha:sha}));fs.writeFileSync(file,bytes);
 fs.renameSync(file,path.join(dir,'checkpoint-001.json.gz.enc'));assert.throws(()=>readHybridCheckpoint(path.join(dir,'checkpoint-001.json.gz.enc'),{secret,expectedSourceSha:sha}));
});
test('budgets, existing files, future state and symlink paths fail without overwriting a checkpoint',async t=>{
 const r=root(t),dir=path.join(r,'sealed'),j=createHybridCheckpointJournal({directory:dir,secret,sourceSha:sha});let payload;await runHybridFixture({...fixture,cycles:fixture.cycles.slice(0,1)},{onCycle:x=>{payload=structuredClone(x);j.append(x);}});const file=path.join(dir,j.report().lastCheckpoint),before=fs.readFileSync(file);
 assert.throws(()=>createHybridCheckpointJournal({directory:dir,secret,sourceSha:sha}));assert.throws(()=>readHybridCheckpoint(file,{secret,expectedSourceSha:sha,notAfter:iso(base-1)}));
 const small=createHybridCheckpointJournal({directory:path.join(r,'small'),secret,sourceSha:sha,maxBytes:1});assert.throws(()=>small.append(payload),/BUDGET/);assert.deepEqual(fs.readdirSync(path.join(r,'small')),[]);
 fs.symlinkSync(dir,path.join(r,'alias'));assert.throws(()=>readHybridCheckpoint(path.join(r,'alias',path.basename(file)),{secret,expectedSourceSha:sha}),/SYMLINK/);assert.deepEqual(fs.readFileSync(file),before);
});
test('a resumed transport preserves exhausted budgets, halted outcomes and refuses changed limits',async()=>{
 const limits={maxRequests:1},c=createHybridSnapshotTransport({credentials:{key:'fixture',secret:'fixture'},fetcher:async()=>new Response('{}'),limits,now:()=>base});await c.snapshots(['AAA']);const report=c.report();
 const resumed=createHybridSnapshotTransport({credentials:{key:'fixture',secret:'fixture'},fetcher:()=>{throw Error('must not fetch');},limits,now:()=>base+1,resume:report});assert.equal((await resumed.snapshots(['AAA'])).reason,'REQUEST_BUDGET_EXHAUSTED');
 assert.throws(()=>createHybridSnapshotTransport({credentials:{},fetcher:async()=>{},limits:{maxRequests:2},now:()=>base+1,resume:report}),/RESUME/);
});
