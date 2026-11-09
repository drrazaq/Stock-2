// Existing Git objects -> actual scan caller -> existing journal, all in the
// disposable load-scan fixture. No producers, provider calls or production save.
import fs from 'node:fs';import path from 'node:path';import {execFileSync}from'node:child_process';import {createHash}from'node:crypto';import {fileURLToPath}from'node:url';
import {loadScan,blocked}from'../test/load-scan.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [ref,cutoff,outArg]=process.argv.slice(2);if(!/^[a-f0-9]{40}$/.test(ref||'')||!Number.isFinite(Date.parse(cutoff||''))||!outArg)throw Error('supply pinned Git commit, explicit cutoff, output directory');
const output=path.resolve(outArg),files={},fingerprints={};
for(const name of ['signals.json','discovery.json','earnings-recent.json','events-recent.json','quality.json','horizons.json','radar-universe.json','leaders-universe.json','zad-list.json','discovery-journal.jsonl','outcomes.json','names.json']){
 const b=execFileSync('git',['show',ref+':data/'+name],{cwd:root,maxBuffer:8*1024*1024});
 fingerprints[name]=createHash('sha256').update(b).digest('hex');files['data/'+name]=name.endsWith('.jsonl')?b.toString():JSON.parse(b);
}
// Only these six prior published cases are deferred for this NEW investigation
// batch, not excluded from future versions or from the underlying population.
const reviewedSymbols=['GRMN','TIGO','ETON','KNSA','CEG','BE'];
const old=Date.now;Date.now=()=>Date.parse(cutoff);
try{
 const S=await loadScan({files});
 const cycle=S.fn('researchAssessmentCycle')(files['data/signals.json'],{cutoff,reviewedSymbols});
 if(cycle.error)throw Error(cycle.error);
 const cards=cycle.records.map(r=>({symbol:r.sym,horizon:r.horizon,id:r.id,output:S.fn('assessmentContext')(r.sym,files['data/signals.json'],{},'INVESTIGATE / WAIT: research attention only; no entry granted')}));
 if(blocked.length)throw Error('external request attempted');
 fs.mkdirSync(output,{recursive:true});
 const original=files['data/discovery-journal.jsonl'],saved=S.read('data/discovery-journal.jsonl');
 if(!saved.startsWith(original))throw Error('journal prefix not preserved');
 const selected=new Set(cycle.records.map(x=>x.id)),result={sourceRef:ref,cutoff,clockMeaning:'Present research replay clock, not original bot detection',sourceFingerprints:fingerprints,reviewedSymbols,queue:cycle.queue,records:cycle.records,cards,
  feedback:cycle.feedback.filter(x=>selected.has(x.assessmentId)),persistence:cycle.persistence,legacyJournalPrefixPreserved:true,externalRequests:blocked.length,productionWrites:0};
 fs.writeFileSync(path.join(output,'flow-result.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({population:cycle.queue.population,counts:cycle.queue.counts,selected:cycle.records.map(x=>({symbol:x.sym,horizon:x.horizon,id:x.id})),sourceFreshness:cycle.queue.sourceFreshness,feedback:result.feedback,persistence:cycle.persistence,externalRequests:0},null,2));
}finally{Date.now=old;process.chdir(root);}
