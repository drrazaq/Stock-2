import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const root=process.argv[2],ref='46be903928963c96417b77bac375b28306ab9d7c',cutoff='2026-11-09T17:18:16Z';
const j=n=>JSON.parse(execFileSync('git',['show',ref+':data/'+n],{cwd:root,maxBuffer:64<<20}));
const {triageAssessments,assessmentJournalRows}=await import(pathToFileURL(root+'/discovery-runtime.mjs'));
const inp={signals:j('signals.json'),discovery:j('discovery.json'),earnings:j('earnings-recent.json'),events:j('events-recent.json'),quality:j('quality.json'),horizons:j('horizons.json'),radar:j('radar-universe.json'),leaders:j('leaders-universe.json'),cutoff};
let seen=[];for(let call=1;call<=3;call++){const q=triageAssessments({...inp,seenAssessmentIds:seen});const rows=assessmentJournalRows(q);seen=seen.concat(rows.map(r=>r.id));console.log('call',call,Object.fromEntries(Object.entries(q.batches).map(([h,v])=>[h,v.map(x=>x.symbol).join('/')])));}
const q2=triageAssessments({...inp,quality:{...inp.quality,generatedAt:'2026-11-09T00:00:00Z'},seenAssessmentIds:seen});console.log('after unrelated regeneration (quality generatedAt changed only):',Object.fromEntries(Object.entries(q2.batches).map(([h,v])=>[h,v.map(x=>x.symbol).join('/')])));
