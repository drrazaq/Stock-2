import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {nov2Fixture,defaultRoot} from './watcher-nov2-fixture.mjs';
const root=process.env.NOV2_TREE||defaultRoot;
const {guardDecide,watcherJobEvidence}=await import(pathToFileURL(path.join(root,'watcher-guard-core.mjs')));
const {watcherAdmission,watcherDayBounds}=await import(pathToFileURL(path.join(root,'watcher-schedule.mjs')));
const {readGuardHistory}=await import(pathToFileURL(path.join(root,'watcher-guard-history.mjs')));
const at=Date.parse('2026-11-02T19:50:00Z');
function runs(second='in_progress'){
 const first=watcherJobEvidence({id:101,status:'completed',created_at:'2026-11-02T13:53:37Z'},[{name:'watch',status:'completed',started_at:'2026-11-02T13:53:40Z',completed_at:'2026-11-02T19:39:14Z',steps:[{name:'Run set -o pipefail',status:'completed',started_at:'2026-11-02T13:53:53Z',completed_at:'2026-11-02T19:38:57Z'}]}],at);
 const late=watcherJobEvidence({id:202,status:'in_progress',created_at:'2026-11-02T14:38:21Z',run_started_at:'2026-11-02T14:38:21Z'},[{name:'watch',status:second,started_at:second==='queued'?null:'2026-11-02T19:39:17Z'}],at);return [first,late];
}
for(const second of ['in_progress','queued'])test('first verified job and early stop survive later '+second+' duplicate',()=>{
 const r=runs(second),o=guardDecide(at,r,{});assert.equal(o.state.started,533);assert.equal(o.state.startedRunId,101);assert.match(o.alerts.join('\n'),/STOPPED EARLY/);assert.doesNotMatch(o.alerts.join('\n'),/WATCHER STARTED LATE|open was not watched/);assert.equal(o.dispatch,false);
 const again=guardDecide(at,r,o.state);assert.doesNotMatch(again.alerts.join('\n'),/STOPPED EARLY/);assert.equal(again.state.started,533);
});
test('verified no-op with long queue time is not observation and does not consume the start',()=>{
 const noOp=watcherJobEvidence({id:3,status:'completed',created_at:'2026-11-02T12:45:00Z'},[{name:'watch',status:'completed',started_at:'2026-11-02T13:53:40Z',completed_at:'2026-11-02T13:54:00Z',steps:[{name:'Check watcher admission',conclusion:'success',status:'completed'},{name:'Observe configured session',conclusion:'skipped',status:'completed'}]}],at);
 assert.equal(noOp.jobEvidence,'NON_OBSERVING');const x=guardDecide(Date.parse('2026-11-02T14:12:00Z'),[noOp],{});assert.equal(x.dispatch,true);assert.equal(x.state.started,null);
});
test('unavailable job evidence never becomes a creation-time start',()=>{
 const r=watcherJobEvidence({id:202,status:'in_progress',created_at:'2026-11-02T14:38:21Z'},null,at),o=guardDecide(at,[r],{});assert.equal(o.state.started,null);assert.equal(o.dispatch,false);assert.match(o.alerts.join(),/UNVERIFIED/);
});
test('configured boundary15:00 is independent of16:00 exchange close',()=>{
 const o=guardDecide(Date.parse('2026-11-02T20:04:00Z'),runs(),{});assert.match(o.alerts.join(),/configured 15:00/);assert.doesNotMatch(o.alerts.join(),/configured 16:00/);
});
test('day query bounds follow New York across23/25-hour DST days',()=>{
 assert.deepEqual(watcherDayBounds('2026-11-02'),{from:'2026-11-02T05:00:00.000Z',to:'2026-11-03T04:59:59.000Z'});
 const a=watcherDayBounds('2026-11-01'),b=watcherDayBounds('2026-03-08');assert.equal(Date.parse(a.to)+1000-Date.parse(a.from),25*3600000);assert.equal(Date.parse(b.to)+1000-Date.parse(b.from),23*3600000);
});
test('manual/guard admission is bounded; late legitimate collection stays explicitly partial',()=>{
 assert.equal(watcherAdmission({nowMs:Date.parse('2026-11-02T14:10:00Z'),eventName:'workflow_dispatch'}).reason,'PREOPEN_WAIT');
 assert.equal(watcherAdmission({nowMs:Date.parse('2026-11-02T19:39:00Z'),eventName:'schedule',schedule:'45 13 * * 1-5'}).reason,'LATE_PARTIAL_START');
 assert.equal(watcherAdmission({nowMs:Date.parse('2026-11-02T20:02:00Z'),eventName:'workflow_dispatch'}).reason,'CONFIGURED_WINDOW_ENDED');
 assert.equal(watcherAdmission({nowMs:Date.parse('2026-11-02T14:10:00Z'),eventName:'schedule',schedule:'unknown'}).run,false);
});
test('complete daily pagination is independent of lifetime runs and uses actual jobs',async()=>{
 const listed=Array.from({length:101},(_,i)=>({id:i+1,status:'completed',created_at:'2026-11-02T14:00:00Z'}));let calls=0;
 const h=await readGuardHistory({base:'https://synthetic.invalid/repos/x/y',headers:{},day:'2026-11-02',nowMs:at,maxReads:200,fetchImpl:async url=>{calls++;const u=new URL(url);assert.ok(u.searchParams.get('page'));assert.equal(u.searchParams.get('per_page'),'100');if(u.pathname.endsWith('/runs')){assert.match(u.searchParams.get('created'),/2026-11-02T05:00/);const page=+u.searchParams.get('page');return {ok:true,json:async()=>({total_count:101,workflow_runs:listed.slice((page-1)*100,page*100)})};}return {ok:true,json:async()=>({total_count:1,jobs:[{name:'watch',status:'completed',started_at:'2026-11-02T14:00:00Z',completed_at:'2026-11-02T14:01:00Z'}]})};}});
 assert.equal(h.complete,true);assert.equal(h.runs.length,101);assert.equal(calls,103);
});
test('history request cap and failed jobs are UNKNOWN, never proof of an earlier observation or permission to dispatch',async()=>{
 for(const fail of [false,true]){let calls=0;const h=await readGuardHistory({base:'https://synthetic.invalid/repos/x/y',headers:{},day:'2026-11-02',nowMs:at,maxReads:2,fetchImpl:async url=>{calls++;if(url.includes('/workflows/'))return {ok:true,json:async()=>({workflow_runs:[1,2,3].map(id=>({id,status:'completed',created_at:'2026-11-02T14:00:00Z'}))})};return {ok:!fail,json:async()=>({jobs:[]})};}});assert.equal(h.complete,false);assert.ok(calls<=2);const o=guardDecide(at,h.runs,{},undefined,{historyComplete:h.complete});assert.equal(o.dispatch,false);assert.match(o.alerts.join(),/UNKNOWN|UNVERIFIED/);}
});
test('actual guard handles metadata failure without declaring a start or dispatching',async()=>{
 const f=await nov2Fixture();try{f.state.failHistory=true;const x=await f.run('watcher-guard.mjs',{start:'2026-11-02T14:20:00Z'});assert.equal(x.code,0,x.output);assert.match(x.output+'\n'+f.state.messages.join('\n'),/HISTORY UNKNOWN/);assert.equal(f.state.dispatches,0);assert.equal(f.read('data/watcher-guard.json').started,null);}finally{f.close();}
});

test('a later completed duplicate reaching15:00 cannot erase the earlier stop',()=>{
 const r=runs();Object.assign(r[1],{status:'completed',jobStatus:'completed',jobCompletedAt:'2026-11-02T20:01:38Z'});const o=guardDecide(Date.parse('2026-11-02T20:04:00Z'),r,{});assert.match(o.alerts.join(),/STOPPED EARLY/);assert.equal(o.state.startedRunId,101);assert.equal(o.dispatch,false);
});
test('partial history does not mislabel a later job as the original late start',()=>{
 const r=runs();r[0]=watcherJobEvidence({...r[0]},null,at);const o=guardDecide(at,r,{},undefined,{historyComplete:false});assert.doesNotMatch(o.alerts.join(),/WATCHER STARTED LATE/);assert.equal(o.dispatch,false);
});

test('short attempts retain the existing bounded startup retry rule without claiming observation coverage',()=>{
 const r=watcherJobEvidence({id:7,status:'completed',created_at:'2026-11-02T14:25:00Z'},[{name:'watch',status:'completed',started_at:'2026-11-02T14:25:00Z',completed_at:'2026-11-02T14:26:00Z',steps:[{name:'Observe configured session',status:'completed',started_at:'2026-11-02T14:25:01Z',completed_at:'2026-11-02T14:25:50Z'}]}],at);const o=guardDecide(Date.parse('2026-11-02T15:40:00Z'),[r],{});assert.equal(o.dispatch,true);assert.doesNotMatch(o.alerts.join(),/STOPPED EARLY|coverage complete/);
});
test('earliest actual watcher job remains recorded when a later job in the same run is active',()=>{
 const r=watcherJobEvidence({id:8,status:'in_progress',created_at:'2026-11-02T14:10:00Z'},[{name:'watch',status:'completed',started_at:'2026-11-02T14:10:00Z',completed_at:'2026-11-02T19:00:00Z'},{name:'close',status:'in_progress',started_at:'2026-11-02T19:25:00Z'}],at);assert.equal(r.jobStartedAt,'2026-11-02T14:10:00Z');assert.equal(guardDecide(at,[r],{}).state.started,550);
});

test('malformed run identity/status never establishes an empty history or permits dispatch',async()=>{
 for(const row of [{created_at:'2026-11-02T14:00:00Z',status:'in_progress'},{id:5,created_at:'2026-11-02T14:00:00Z',status:'unexpected'},{id:5,status:'completed',created_at:'malformed'}]){const h=await readGuardHistory({base:'https://synthetic.invalid/repos/x/y',headers:{},day:'2026-11-02',nowMs:at,fetchImpl:async()=>({ok:true,json:async()=>({workflow_runs:[row]})})});assert.equal(h.complete,false);assert.equal(guardDecide(at,h.runs,{},undefined,{historyComplete:h.complete}).dispatch,false);}
});
