import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
const tree=process.argv[2];assert.ok(tree,'Pass exact source-only built unit path');
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:tree,encoding:'utf8'}).trim(),'fb830ee6cba24290683d9ddb981ac8b5f30ac62b');
const {gate,OPEN_STATUSES,WRITER_WORKFLOWS}=await import(pathToFileURL(path.resolve(tree,'r1-writer-gate.mjs')));
const {watcherAdmission}=await import(pathToFileURL(path.resolve(tree,'watcher-schedule.mjs')));
const now=Date.parse('2026-11-14T17:00:00Z'),repo='drrazaq/Stock-2';
const capture=()=>({repository:repo,captured_at:new Date(now).toISOString(),queries:[...OPEN_STATUSES.map(status=>({kind:'status',status,per_page:100,pages:[{page:1,total_count:0,workflow_runs:[]}]})),{kind:'created',workflow:'*',from:new Date(now-31*864e5).toISOString(),to:new Date(now).toISOString(),per_page:100,pages:[{page:1,total_count:0,workflow_runs:[]}]}]});
const counterexamples=[];
for(const [i,name]of ['discover','ml-lab','options-lab','squad26-lab'].entries()){
 const c=capture(),q=c.queries.find(x=>x.status==='in_progress');q.pages[0].total_count=1;q.pages[0].workflow_runs=[{id:100+i,path:'.github/workflows/'+name+'.yml',status:'in_progress',created_at:new Date(now-3600000).toISOString(),repository:{full_name:repo}}];const created=c.queries.find(x=>x.kind==='created');created.pages[0].total_count=1;created.pages[0].workflow_runs=structuredClone(q.pages[0].workflow_runs);
 const result=gate(c,{now});assert.equal(result.pass,true);assert.equal(result.notDone.length,0);counterexamples.push({workflow:name,expectedO1:'REFUSE_OPEN_WRITER',actualBoundGate:result});
}
const unknownCreated=[];for(const [i,name]of ['discover','ml-lab','options-lab','squad26-lab'].entries()){const c=capture(),q=c.queries.find(x=>x.kind==='created');q.pages[0].total_count=1;q.pages[0].workflow_runs=[{id:200+i,path:'.github/workflows/'+name+'.yml',status:'unrecognized_pending_state',created_at:new Date(now-3600000).toISOString(),repository:{full_name:repo}}];const result=gate(c,{now});assert.equal(result.pass,true);unknownCreated.push({workflow:name,expectedO1:'REFUSE_UNRECOGNIZED_NONCOMPLETED_WRITER',actualBoundGate:result});}
const ten=capture();ten.queries=ten.queries.filter(x=>x.kind!=='created');for(const workflow of WRITER_WORKFLOWS.filter(x=>!x.endsWith('/r1-migrate.yml')))ten.queries.push({kind:'created',workflow,from:new Date(now-31*864e5).toISOString(),to:new Date(now).toISOString(),per_page:100,pages:[{page:1,total_count:0,workflow_runs:[]}]});
const tenResult=gate(ten,{now});assert.equal(tenResult.pass,false);assert.ok(tenResult.why.some(x=>x.includes('r1-migrate.yml')));
const watcher=[['2026-11-16T13:10:00Z','10 13 * * 1-5'],['2026-11-16T14:10:00Z','10 14 * * 1-5']].map(([time,schedule])=>({time,result:watcherAdmission({nowMs:Date.parse(time),eventName:'schedule',schedule})}));assert.equal(watcher[0].result.reason,'OPPOSITE_DST_CRON');assert.equal(watcher[1].result.run,true);
const out={source:'rev17 fresh unit fb830ee6cba24290683d9ddb981ac8b5f30ac62b built on6e72a8d0; no changes',counterexamples,unknownCreated,tenCreatedOnly:tenResult,watcher,network:'NONE; original imported pure/offline functions, synthetic captures only'};
fs.writeFileSync(new URL('reproductions.json',import.meta.url),JSON.stringify(out,null,2)+'\n');console.log('Four ignored-open-writer counterexamples, migration coverage refusal and winter watcher admission independently reproduced');
