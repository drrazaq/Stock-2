// Actual development callers, synthetic selection clocks, retained reviewed company facts.
import fs from 'node:fs';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import path from 'node:path';import {loadScan,blocked} from '/workspace/assessment-price-bridge-20261111/test/load-scan.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=process.cwd(),old=Date.now;
try{
 Date.now=()=>Date.parse('2026-11-12T06:50:00Z');
 const inv=JSON.parse(fs.readFileSync('/workspace/assessment-price-bridge-20261111/data/company-investigations.json'));
 const sig={session:'2026-11-11',generatedAt:'2026-11-12T01:00:00Z',stocks:[],uni:[],quick:[]};
 const s=await loadScan({files:{'data/company-investigations.json':{...inv,records:{SNDK:inv.records.SNDK}},'data/discovery.json':{session:'2026-11-11',generatedAt:'2026-11-12T01:00:00Z',candidates:[{sym:'SNDK',name:'Sandisk Corporation'}]},'data/discovery-journal.jsonl':[],'data/signals.json':sig}});
 const queue=s.fn('researchAssessmentCycle')(sig),text=s.fn('assessmentContext')('SNDK',sig,{},'WAIT: documentary research; no adopted entry rule');
 assert.match(text,/SHORT ACTION/);assert.match(text,/MID TERM/);assert.match(text,/LONG TERM/);assert.match(text,/PRIMARY COMPANY INVESTIGATION/);assert.match(text,/No adopted entry rule/);assert.match(text,/ZAD/);assert.match(text,/\$3 each executed side/);assert.equal(blocked.length,0);assert.equal(s.read('data/discovery-journal.jsonl'),'');
 fs.writeFileSync(path.join(here,'PIPELINE_DEMO.json'),JSON.stringify({kind:'DEVELOPMENT_DEMO_NOT_CURRENT_RECOMMENDATION',sourceCommit:'d2852739d96490e11e6e2ae79965b311627d9b07',fixture:'Synthetic discovery/session; retained reviewed SNDK facts; no current price or owner marks',actualCallers:['researchAssessmentCycle','assessmentContext'],queue,text,networkCalls:blocked.length,writes:'temporary fixture only; caller journal unchanged',researchRuleBoundary:'SQ4-GROWLEAD and new research rules are NOT adopted scanner rules. No trade outcome fabricated.'},null,2)+'\n');
 console.log('PASS actual queue/detail callers, three horizons, no adopted rule, costs, ZAD, no external calls or journal mutation');
}finally{Date.now=old;process.chdir(root);}
