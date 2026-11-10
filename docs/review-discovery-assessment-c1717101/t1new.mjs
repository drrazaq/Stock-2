import {execFileSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
const root=process.argv[2],ref='46be903928963c96417b77bac375b28306ab9d7c',cutoff='2026-11-09T17:18:16Z';
const j=n=>JSON.parse(execFileSync('git',['show',ref+':data/'+n],{cwd:root,maxBuffer:64<<20}));
const R=await import(pathToFileURL(root+'/discovery-runtime.mjs'));
const inp={signals:j('signals.json'),discovery:j('discovery.json'),earnings:j('earnings-recent.json'),events:j('events-recent.json'),quality:j('quality.json'),horizons:j('horizons.json'),radar:j('radar-universe.json'),leaders:j('leaders-universe.json'),cutoff};
const show=q=>Object.fromEntries(Object.entries(q.batches).map(([h,v])=>[h,v.map(x=>x.symbol).join('/')]));
let journal=[];const q0=R.frozenAssessmentQueue(inp,journal);console.log('producer first:',q0.frozen,show(q0));
const rows=R.assessmentCycleRows(q0);journal=journal.concat(rows);console.log('cycle row bytes',JSON.stringify(rows[0]).length,'assessment rows',rows.length-1);
for(let i=1;i<=3;i++){const q=R.frozenAssessmentQueue({...inp,seenAssessmentIds:journal.filter(r=>r.type==='assessment').map(r=>r.id)},journal);console.log('read',i,q.frozen,show(q));}
const q2=R.frozenAssessmentQueue({...inp,quality:{...inp.quality,generatedAt:'2026-11-09T00:00:00Z'},seenAssessmentIds:journal.filter(r=>r.type==='assessment').map(r=>r.id)},journal);console.log('after generatedAt-only change:',q2.frozen,q2.cycleKey===q0.cycleKey,show(q2));
console.log('ruleIdentity states',rows.slice(1).map(r=>r.symbol+':'+r.ruleIdentityState));
