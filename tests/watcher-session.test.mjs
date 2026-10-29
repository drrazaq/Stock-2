import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {sessionFinished,preferSession,runIdentity,chooseDailySummary,sessionEvidence} from '../watcher-session.mjs';
const full={day:'2026-10-28',heartbeat:Array.from({length:390},(_,i)=>({m:570+i,received:100,evaluated:100}))};
const late={day:full.day,heartbeat:[{m:959},{m:960}]};
test('October 28 queued late run cannot replace opening-session record',()=>{
 assert.equal(preferSession(full,late),false);
 assert.equal(preferSession(late,full),true);
 assert.equal(sessionFinished(full,full.day),true);
 assert.equal(sessionFinished(late,late.day),false);
 assert.equal(sessionEvidence({...full,heartbeat:[...full.heartbeat,...full.heartbeat]}).minutes,390);
 assert.equal(preferSession(full,full),false);
});
test('different dates and legacy records do not fabricate complete coverage',()=>{
 assert.equal(sessionFinished(full,'2026-10-29'),false);
 assert.equal(preferSession(full,{...late,day:'2026-10-29'}),true);
 assert.equal(sessionFinished({day:full.day,coverage:{minutesWatched:330}},full.day),false);
});
test('duplicate daily scorecard chooses coverage/evidence, never highest return',()=>{
 const first={day:full.day,detected:1558,delivered:9,deliveredAvgNet:-0.008};
 const last={day:full.day,detected:588,delivered:0,deliveredAvgNet:1};
 assert.equal(chooseDailySummary([first,last],full.day),first);
 const a={...first,sessionMinutes:322},b={...last,sessionMinutes:2,detected:9999};
 assert.equal(chooseDailySummary([a,b],full.day),a);
});
test('run archive identity rejects path traversal and distinguishes rerun attempts',()=>{
 assert.equal(runIdentity({GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'2'}),'123-2');
 assert.throws(()=>runIdentity({GITHUB_RUN_ID:'../../bad'}));
});
test('real watcher entry exits before network or writes for an already complete session',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-duplicate-'));
 try {
 fs.mkdirSync(path.join(dir,'data'));const file=path.join(dir,'data/ignition-live.json'),bytes=JSON.stringify(full);fs.writeFileSync(file,bytes);
 const r=spawnSync(process.execPath,[new URL('../ignition-watch.mjs',import.meta.url).pathname],{cwd:dir,env:{PATH:process.env.PATH,IG_DAY:full.day,IG_FAKE_MIN:'959'},encoding:'utf8',timeout:10000});
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/session already recorded/);assert.equal(fs.readFileSync(file,'utf8'),bytes);assert.deepEqual(fs.readdirSync(path.join(dir,'data')),['ignition-live.json']);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('a full timer with zero usable data cannot replace richer observations or suppress a retry',()=>{
 const empty={...full,heartbeat:full.heartbeat.map(x=>({...x,received:0,evaluated:0}))};
 assert.equal(sessionFinished(empty,full.day),false);assert.equal(preferSession(full,empty),false);
});


test('a two-minute retry cannot overwrite a longer legacy record without heartbeat telemetry',()=>{
 const legacy={day:full.day,coverage:{minutesWatched:322}};
 const retry={day:full.day,heartbeat:[{m:898,received:100,evaluated:100},{m:899,received:100,evaluated:100}]};
 assert.equal(preferSession(legacy,retry),false);
 assert.equal(preferSession(legacy,full),true);
});
