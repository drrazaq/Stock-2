import {guardDecide,watcherJobEvidence} from './watcher-guard-core.mjs';
const T=s=>Date.parse('2026-11-04T'+s+'Z'); // winter, NY = UTC-5
// tick 1 at 09:30 NY: opposite-season noop run in progress, admission step still running
const noopRun={id:1,status:'in_progress',created_at:'2026-11-04T14:29:00Z'};
const jobsInProg=[{name:'watch',status:'in_progress',started_at:'2026-11-04T14:29:30Z',steps:[{name:'Check watcher admission',status:'in_progress',conclusion:null},{name:'Observe configured session',status:'queued',conclusion:null}]}];
let r1=guardDecide(T('14:30:00'),[watcherJobEvidence(noopRun,jobsInProg,T('14:30:00'))],{});
console.log('tick1',r1.why,r1.dispatch,r1.state.started,r1.alerts);
// tick 2 at 09:35: noop completed
const jobsDone=[{name:'watch',status:'completed',started_at:'2026-11-04T14:29:30Z',completed_at:'2026-11-04T14:30:10Z',steps:[{name:'Check watcher admission',conclusion:'success'},{name:'Observe configured session',conclusion:'skipped'}]}];
let r2=guardDecide(T('14:35:00'),[watcherJobEvidence({...noopRun,status:'completed'},jobsDone,T('14:35:00'))],r1.state);
console.log('tick2',r2.why,r2.dispatch,r2.state.started,r2.alerts);
// tick 3 at 09:45: dispatched run started 09:37
const real={id:2,status:'in_progress',created_at:'2026-11-04T14:35:05Z'};
const rj=[{name:'watch',status:'in_progress',started_at:'2026-11-04T14:37:00Z',steps:[{name:'Check watcher admission',conclusion:'success'},{name:'Observe configured session',status:'in_progress',started_at:'2026-11-04T14:38:00Z'}]}];
let r3=guardDecide(T('14:45:00'),[watcherJobEvidence({...noopRun,status:'completed'},jobsDone,T('14:45:00')),watcherJobEvidence(real,rj,T('14:45:00'))],r2.state);
console.log('tick3',r3.why,r3.state.started,r3.state.startedRunId,r3.alerts);
