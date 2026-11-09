import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const root=process.argv[2];const {loadScan}=await import(pathToFileURL(root+'/test/load-scan.mjs'));
const rd=p=>JSON.parse(fs.readFileSync(root+'/'+p));
const files={'data/horizons.json':rd('data/horizons.json'),'data/quality.json':rd('data/quality.json'),'market-session.mjs':fs.readFileSync(root+'/market-session.mjs','utf8')};
try{files['data/discovery.json']=rd('data/discovery.json')}catch{}
const S=await loadScan({files,env:{}});const A=S.fn('assessmentContext');
const pos={ETON:{entry:100,stop:80,kind:'manual',since:'2026-11-05'}};
for(const [sym,p] of [['ETON',{}],['CNNE',{}],['ETON',pos]]){const t=A(sym,{session:'2026-11-06',stocks:[]},p,'HOLD: test');console.log(sym,Object.keys(p).length?'held':'', 'chars',t.length,'lines',t.split('\n').length);}
const D=files['data/discovery.json'];console.log('discovery candidates',D?.candidates?.length);
console.log('---SAMPLE\n'+A('ETON',{session:'2026-11-06',stocks:[]},{},'WAIT: research lead; no entry granted'));
