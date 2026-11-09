import fs from 'node:fs';import {pathToFileURL} from 'node:url';
const root=process.argv[2];const {loadScan}=await import(pathToFileURL(root+'/test/load-scan.mjs'));
const rd=p=>JSON.parse(fs.readFileSync(root+'/'+p));const H=rd('data/horizons.json');const pb=(H.today.PB_UP||[])[0];
const S=await loadScan({files:{'data/horizons.json':H,'data/quality.json':rd('data/quality.json'),'market-session.mjs':fs.readFileSync(root+'/market-session.mjs','utf8')},env:{}});
const t=S.fn('assessmentContext')(pb,{session:'2026-11-06'},{},'WAIT');const mid=t.split('\n').find(l=>l.startsWith('MID TERM')),lng=t.split('\n').find(l=>l.startsWith('LONG TERM'));
console.log('mid SPY raw x',(mid.match(/SPY raw/g)||[]).length,'worst x',(mid.match(/worst model trade/g)||[]).length,'margins',(mid.match(/older (met|NOT MET), newer (met|NOT MET)/g)||[]));
console.log('long SPY raw x',(lng.match(/SPY raw/g)||[]).length,'worst x',(lng.match(/worst/g)||[]).length,'ellipsis',(t.match(/…/g)||[]).length);
console.log(mid.slice(0,420));
