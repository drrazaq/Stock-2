// Read-only synthetic checks. Pass extracted rev2 overlay module and exact bound gate paths.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const [overlayFile,gateFile,censusFile]=process.argv.slice(2);
const {overlay,O1_ADDED,NON_PUBLISHERS}=await import(pathToFileURL(path.resolve(overlayFile)));
const {gate,OPEN_STATUSES,WRITER_WORKFLOWS}=await import(pathToFileURL(path.resolve(gateFile)));
const census=JSON.parse(fs.readFileSync(censusFile,'utf8'));
const now=Date.parse('2026-11-14T17:10:00Z'),repo='drrazaq/Stock-2';
const query=(o,runs=[])=>({...o,per_page:100,pages:[{page:1,total_count:runs.length,workflow_runs:runs}]});
const capture=()=>({repository:repo,captured_at:new Date(now-60000).toISOString(),queries:[...OPEN_STATUSES.map(status=>query({kind:'status',status})),query({kind:'created',workflow:'*',from:new Date(now-32*864e5).toISOString(),to:new Date(now-60000).toISOString()})],overlayQueries:[query({kind:'created',workflow:'*',from:new Date(now-32*864e5).toISOString(),to:new Date(now-60000).toISOString()})]});
const run=(p,status)=>({id:1,path:p,status,created_at:new Date(now-3600000).toISOString(),repository:{full_name:repo}});
let checked=0;const check=(c,want)=>{const before=JSON.stringify(c);const result=overlay(c,gate,{now});assert.equal(result.pass,want,JSON.stringify(result));assert.equal(JSON.stringify(c),before,'raw capture mutated');checked++;return result;};
check(capture(),true);
for(const row of census){const p='.github/workflows/'+row.workflow+'.yml';
 assert.equal(NON_PUBLISHERS.includes(p),!row.possiblePublisher,'census/classification drift '+p);
 for(const status of OPEN_STATUSES){const c=capture(),r=run(p,status);c.queries.find(q=>q.kind==='status'&&q.status===status).pages[0]={page:1,total_count:1,workflow_runs:[r]};c.queries.find(q=>q.kind==='created').pages[0]={page:1,total_count:1,workflow_runs:[structuredClone(r)]};check(c,!row.possiblePublisher);}
 const c=capture();c.overlayQueries[0].pages[0]={page:1,total_count:1,workflow_runs:[run(p,'new_noncompleted_status')]};check(c,!row.possiblePublisher);
}
for(const status of OPEN_STATUSES){const c=capture();c.queries.find(q=>q.status===status).pages[0]={page:1,total_count:1,workflow_runs:[run('.github/workflows/unreviewed.yml',status)]};check(c,false);}
const variants=[
 ['missing migration coverage',c=>{c.queries=c.queries.filter(q=>q.kind==='status');for(const workflow of WRITER_WORKFLOWS.filter(w=>!w.endsWith('/r1-migrate.yml')))c.queries.push(query({kind:'created',workflow,from:new Date(now-32*864e5).toISOString(),to:c.captured_at}));}],
 ['missing addition coverage',c=>{c.overlayQueries=[];}],
 ['missing status query',c=>{c.queries=c.queries.filter(q=>q.status!=='waiting');}],
 ['wrong repository',c=>{c.repository='wrong/repository';}],
 ['stale',c=>{c.captured_at=new Date(now-600001).toISOString();}],
 ['future outside inherited tolerance',c=>{c.captured_at=new Date(now+60001).toISOString();}],
 ['incomplete overlay pages',c=>{c.overlayQueries[0].pages[0].total_count=101;}],
 ['overlay API cap exceeded',c=>{c.overlayQueries[0].pages[0].total_count=1001;}],
 ['wrong overlay run repository',c=>{const r=run(O1_ADDED[0],'completed');r.repository.full_name='wrong/repo';c.overlayQueries[0].pages[0]={page:1,total_count:1,workflow_runs:[r]};}],
 ['foreign per-workflow run',c=>{c.overlayQueries[0].workflow=O1_ADDED[0];c.overlayQueries[0].pages[0]={page:1,total_count:1,workflow_runs:[run(O1_ADDED[1],'completed')]};}],
 ['overlay range gap',c=>{c.overlayQueries[0].from=new Date(now-30*864e5).toISOString();}]
];
for(const [,alter]of variants){const c=capture();alter(c);check(c,false);}
const result={verdict:'PASS',cases:checked,publisherDefinitions:census.filter(r=>r.possiblePublisher).length,scheduledPublishers:census.filter(r=>r.possiblePublisher&&r.scheduled).length,statuses:OPEN_STATUSES,all80PathsAllSixStatuses:true,all80UnknownCreatedStatuses:true,unknownPathAllSixStatusesRefused:true,negativeControls:variants.map(x=>x[0]),rawCaptureNeverMutated:true,network:'NONE; source imports and synthetic captures only',scope:'Overlay semantics only; not operational readiness, future attendance or market evidence'};
fs.writeFileSync(new URL('independent-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
