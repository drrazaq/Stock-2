import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const root=process.argv[2];const {loadScan}=await import(pathToFileURL(root+'/test/load-scan.mjs'));
const rd=p=>JSON.parse(fs.readFileSync(root+'/'+p));
const H=rd('data/horizons.json'); const pb=(H.today.PB_UP||[])[0];
const files={'data/horizons.json':H,'data/quality.json':rd('data/quality.json'),'market-session.mjs':fs.readFileSync(root+'/market-session.mjs','utf8')};
try{files['data/discovery.json']=rd('data/discovery.json')}catch{}
const S=await loadScan({files,env:{}});const A=S.fn('assessmentContext');
const sig={session:'2026-11-06',stocks:[],quick:[]};
const cases={ quick:{[pb]:{entry:10,stop:8,kind:'quick',maxHold:5,since:'2026-11-05'}}, leader:{[pb]:{entry:10,kind:'leader',since:'2026-10-01'}}, manualNoStop:{[pb]:{entry:10,kind:'manual',since:'2026-10-01'}} };
for(const [k,pos] of Object.entries(cases)){const t=A(pb,sig,pos,pb+': HOLD, '+(k==='leader'?'leader dip rule. No stop by design (tested without one).':'stop 8.00, ...'),true);console.log(k,t.length,'\n ',t);
 const full=A(pb,sig,pos,'HOLD');console.log('  full SHORT:',full.split('\n')[2].slice(0,330));}
const D=files['data/discovery.json'];const lens=(D?.candidates||[]).slice(0,8).map(x=>A(x.sym,sig,{},'WAIT: research lead; no entry granted',true).length);console.log('discovery compact lens',lens);
