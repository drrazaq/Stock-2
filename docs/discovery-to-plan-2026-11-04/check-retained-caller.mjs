// Retained public inputs + synthetic all-yes counterfactual; never actual owner marks or trades.
import fs from 'node:fs';import crypto from 'node:crypto';
import {loadScan,blocked} from '../../test/load-scan.mjs';
import {loadPinnedRetainedInputs} from './assess-retained-candidates.mjs';
const {inputs}=loadPinnedRetainedInputs(...process.argv.slice(2)),{discovery,signals,squad,quality}=inputs,syms=discovery.candidates.map(x=>x.sym),real=Date.now;Date.now=()=>Date.parse('2026-11-04T15:00:00Z');
try{
 const marks=Object.fromEntries(syms.map(s=>[s,{s:'ok',d:'2026-11-03',by:'synthetic gate counterfactual'}]));
 const S=await loadScan({files:{'data/halal.json':marks,'data/settings.json':{focus:false},'data/discovery.json':discovery,'data/signals.json':signals,'data/squad11-today.json':squad,'data/quality.json':quality}});
 const beforeEvidence=S.fn('planCands0')(signals,{}).filter(x=>syms.includes(x.sym));
 const plans=S.fn('planCands')(signals,{}).filter(x=>syms.includes(x.sym));
 const rows=syms.map(s=>({symbol:s,gateReason:S.fn('gateVerdict')(s,signals),firstLine:S.fn('checkOne')(s,signals).split('\n')[0]}));
 if(beforeEvidence.length||plans.length||rows.some(x=>x.gateReason===null)||blocked.length)throw Error('unexpected qualification/network');
 const out={retrospective:true,sourceSnapshot:'a95af15061569854c89350a5fb0f981e99783822',policyFixture:'SYNTHETIC ALL TEN MARKED YES; NOT ACTUAL OWNER STATE',purpose:'Prove confirmation alone cannot generate a strategy plan; no fill/trade/message created',scanSHA256:crypto.createHash('sha256').update(fs.readFileSync(new URL('../../scan.mjs',import.meta.url))).digest('hex'),candidatePlansBeforeEvidenceGates:beforeEvidence.length,candidatePlans:plans.length,rows,externalRequests:blocked.length};
 console.log(JSON.stringify(out,null,2));
}finally{Date.now=real;}
