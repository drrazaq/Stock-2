// Reuse actual existing assessment caller with exact retained data; no provider or production writes.
import fs from 'node:fs';import path from 'node:path';import {execFileSync}from'node:child_process';import {createHash}from'node:crypto';import {loadScan,blocked}from'../test/load-scan.mjs';
const root=process.cwd(),ref='406daae866aae922a7be985a87261244db63623c',cutoff='2026-11-11T18:30:00Z',files={},hashes={};
for(const name of ['signals.json','discovery.json','events-recent.json','earnings-recent.json','horizons.json','quality.json','zad-list.json','halal.json','names.json']){
 const b=execFileSync('git',['show',ref+':data/'+name],{maxBuffer:16*1024*1024});hashes[name]=createHash('sha256').update(b).digest('hex');files['data/'+name]=JSON.parse(b);
}
files['data/company-investigations.json']=JSON.parse(fs.readFileSync('data/company-investigations.json'));
const original=Date.now;Date.now=()=>Date.parse(cutoff);
try{const s=await loadScan({files});const symbols=['FOSL','CRWV','AXTI','SNDK','MPWR'],records=symbols.map(symbol=>({symbol,detail:s.fn('assessmentContext')(symbol,files['data/signals.json'],{},'INVESTIGATE / WAIT: retained evidence only; no current entry granted')}));
 if(blocked.length)throw Error('unexpected network attempt');
 const result={label:'RETAINED_INPUT_DEMONSTRATION_NOT_CURRENT_RECOMMENDATIONS',callerSource:'passed5ba1606d with separate primary-context delta',retainedRef:ref,cutoff,meaning:'Cutoff is replay time, not historical detection. No position/trade/message/private account inputs loaded.',sourceHashes:hashes,records,externalRequests:0,productionWrites:0};
 process.chdir(root);fs.writeFileSync(path.join(root,'docs/assessment-primary-join-20261111/EXAMPLES.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({symbols,externalRequests:0,productionWrites:0}));
}finally{Date.now=original;process.chdir(root);}
