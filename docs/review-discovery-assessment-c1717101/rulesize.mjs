import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const root=process.argv[2];const {loadScan}=await import(pathToFileURL(root+'/test/load-scan.mjs'));
const S=await loadScan({files:{'market-session.mjs':fs.readFileSync(root+'/market-session.mjs','utf8')},env:{}});
const f=S.fn('scannerAssessmentRule');
for(const v of [{fam:'cross',fast:9,slow:21,mult:1.5,tp:3,mf:false},{fam:'pull',fast:10,slow:20,mult:1.5,tp:null,mf:true,maxHold:20}]){const r=f({v,tgt:null});console.log(v.fam,'assessmentRule bytes',JSON.stringify(r).length,'x2187 rows ≈',Math.round(JSON.stringify(r).length*2187/1024),'KiB');}
