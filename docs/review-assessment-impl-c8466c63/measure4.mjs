import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const root=process.argv[2];const {loadScan}=await import(pathToFileURL(root+'/test/load-scan.mjs'));
const rd=p=>JSON.parse(fs.readFileSync(root+'/'+p));
const files={'data/horizons.json':rd('data/horizons.json'),'data/quality.json':rd('data/quality.json'),'market-session.mjs':fs.readFileSync(root+'/market-session.mjs','utf8')};
const S=await loadScan({files,env:{}});const A=S.fn('assessmentContext');
const pos={ZZL:{entry:100,src:'leader dip',ldHold:126,own:true,stopWhy:'no stop by design (tested without one)',target:120,since:'2026-10-01',boughtSession:'2026-10-01'}};
const row='ZZL +2.0%: HOLD, target 120.00 (sell limit at your broker), time exit about 2027-04-01. No stop by design (tested without one).';
console.log(A('ZZL',{session:'2026-11-06'},pos,row,true));const f=A('ZZL',{session:'2026-11-06'},pos,'HOLD');console.log(f.split('\n')[2]);
