import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {nov2Fixture} from './watcher-nov2-fixture.mjs';
async function scenario(fn){const f=await nov2Fixture();try{return await fn(f);}finally{f.close();}}
for(const [day,start,cron] of [['2026-10-30','2026-10-30T18:39:00Z','45 13 * * 1-5'],['2026-11-02','2026-11-02T19:39:00Z','45 12 * * 1-5']])test('actual workflow refuses opposite-DST queued start without source I/O '+day,()=>scenario(async f=>{
 const r=await f.workflow({start,event:'schedule',schedule:'OPPOSITE_CRON'});assert.equal(r.code,0,r.output);assert.equal(r.skipped,true,r.output);assert.equal(f.state.providerRequests,0);assert.equal(f.state.messages.length,0);assert.match(r.output,/OPPOSITE_DST_CRON/);
}));
for(const [day,start,cron] of [['2026-10-30','2026-10-30T13:10:00Z','45 12 * * 1-5'],['2026-11-02','2026-11-02T14:10:00Z','45 13 * * 1-5']])test('actual workflow preserves configured virtual schedule and observation budget after early wait '+day,()=>scenario(async f=>{
 const r=await f.workflow({start,event:'schedule',schedule:'CURRENT_CRON'});assert.equal(r.code,0,r.output);assert.equal(r.skipped,false);const j=f.read('data/ignition-runs/'+day+'/101-1.json');const minutes=new Set(j.heartbeat.map(x=>x.m));assert.equal(Math.max(...minutes),f.expectedLastMinute);assert.ok(minutes.has(570));assert.ok(minutes.has(f.expectedLastMinute));assert.ok(r.trace.waits.some(x=>x.ms===20000));assert.ok(r.trace.ended-Date.parse(start)>345*60000,'pre-open wait must not consume the345min observation limit');assert.ok(f.state.providerRequests>300);assert.ok(r.trace.ended<=Date.parse(start)+360*60000,'declared360min job envelope');
}));
test('correct-season setup too early for the single-job envelope is explicitly refused; existing09:10 guard path remains available',()=>scenario(async f=>{
 const r=await f.workflow({start:'2026-11-02T13:53:00Z',event:'workflow_dispatch'});assert.equal(r.code,0);assert.equal(r.skipped,true);assert.match(r.output,/TOO_EARLY_FOR_BOUNDED_JOB/);assert.equal(f.state.providerRequests,0);
}));
test('correct-season late start remains labelled partial, archives both attempts and preserves richer canonical/delivery state',()=>scenario(async f=>{
 f.write('data/my-positions.json',{ZZQ:{entry:12,stop:11}});
 let r=await f.workflow({start:'2026-11-02T14:10:00Z',id:'101',IG_RUN_MIN:'313'});assert.equal(r.code,0,r.output);const first=f.read('data/ignition-runs/2026-11-02/101-1.json');assert.ok(Math.max(...first.heartbeat.map(x=>x.m))<900);
 const canonical=fs.readFileSync(path.join(f.dir,'data/ignition-live.json')),sent=f.state.messages.filter(x=>/STOP HIT NOW/.test(x)).length;assert.equal(sent,1);
 r=await f.workflow({start:'2026-11-02T19:39:00Z',id:'202',event:'workflow_dispatch'});assert.equal(r.code,0,r.output);const second=f.read('data/ignition-runs/2026-11-02/202-1.json');assert.equal(second.processStart,'14:39');assert.equal(Math.max(...second.heartbeat.map(x=>x.m)),f.expectedLastMinute);assert.ok(second.heartbeat.length<first.heartbeat.length);assert.deepEqual(fs.readFileSync(path.join(f.dir,'data/ignition-live.json')),canonical);assert.equal(f.state.messages.filter(x=>/STOP HIT NOW/.test(x)).length,sent);
 f.state.runs=[{id:101,status:'completed',created_at:'2026-11-02T14:10:00Z',updated_at:'2026-11-02T19:38:10Z'},{id:202,status:'in_progress',created_at:'2026-11-02T14:38:21Z',run_started_at:'2026-11-02T14:38:21Z'}];
 f.state.jobs={101:[{name:'watch',status:'completed',started_at:'2026-11-02T14:10:00Z',completed_at:'2026-11-02T19:38:10Z'}],202:[{name:'watch',status:'in_progress',started_at:'2026-11-02T19:39:17Z'}]};
 const guard=await f.run('watcher-guard.mjs',{start:'2026-11-02T19:50:00Z'});assert.equal(guard.code,0,guard.output);assert.match(guard.output+'\n'+f.state.messages.join('\n'),/STOPPED EARLY/);assert.doesNotMatch(guard.output,/WATCHER STARTED LATE/);assert.equal(f.read('data/watcher-guard.json').started,550);assert.equal(f.state.dispatches,0);
}));
test('slow sources leave explicit missing slots and do not extend beyond configured end',()=>scenario(async f=>{
 f.state.slowMs=80000;const r=await f.workflow({start:'2026-11-02T14:10:00Z'});assert.equal(r.code,0,r.output);const j=f.read('data/ignition-runs/2026-11-02/101-1.json'),m=new Set(j.heartbeat.map(x=>x.m));assert.ok(m.size<331);assert.ok(Math.max(...m)<=900);
}));

test('setup/cache delays preserve original chronological clocks and label the resulting late start',()=>scenario(async f=>{
 const start='2026-11-02T14:10:00Z',r=await f.workflow({start,event:'schedule',schedule:'CURRENT_CRON',setupMinutes:5,cacheMinutes:20});assert.equal(r.code,0,r.output);assert.match(r.output,/LATE_PARTIAL_START/);const j=f.read('data/ignition-runs/2026-11-02/101-1.json');assert.equal(j.processStart,'09:35');assert.equal(j.heartbeat[0].m,575);assert.equal(Math.max(...j.heartbeat.map(x=>x.m)),f.expectedLastMinute);assert.ok(r.trace.ended-Date.parse(start)<360*60000);assert.equal(j.heartbeat.some(x=>x.m===570),false);
}));
test('setup/cache delays beyond the configured window never manufacture observations',()=>scenario(async f=>{
 const r=await f.workflow({start:'2026-11-02T19:50:00Z',event:'schedule',schedule:'CURRENT_CRON',cacheMinutes:20});assert.equal(r.code,0,r.output);assert.equal(r.skipped,true);assert.match(r.output,/CONFIGURED_WINDOW_ENDED/);assert.equal(f.state.providerRequests,0);assert.equal(fs.existsSync(path.join(f.dir,'data/ignition-runs/2026-11-02/101-1.json')),false);
}));
