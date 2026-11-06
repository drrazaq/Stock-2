import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const W='<NEW_WORKTREE>';const old=await import(W+'/docs/a-native-importer/fixtures/a-fenced-store-2c9.source'.replace(/$/,'')).catch(()=>null);
const h='a'.repeat(64),out={};const T=f=>{try{const r=f();return typeof r==='object'?JSON.stringify(r).slice(0,160):String(r);}catch(e){return 'THROW:'+e.message;}};
const p=fs.mkdtempSync(path.join(os.tmpdir(),'p7n4-'));const mod=W+'/.p7-2c9.mjs';fs.copyFileSync(W+'/docs/a-native-importer/fixtures/a-fenced-store-2c9.source',mod);
try{const o=await import(mod);const s=o.createAFencedStore(p+'/s',{origin:'RETAINED_RESEARCH',cohortHash:h,contractHash:h});const t=s.claim({expectedToken:null,owner:'G1',at:'2026-11-05T12:00:00Z',boundaryEvidenceHash:h}).token;s.append(t,'ORIGINAL','x',{},Buffer.from('BYTES'));T(()=>s.append(t,'ORIGINAL','lost',{},Buffer.from('LOST'),'AFTER_INTENT'));}finally{fs.rmSync(mod,{force:true});}
const snap=d=>Object.fromEntries(fs.readdirSync(d).map(n=>[n,createHash('sha256').update(fs.readFileSync(d+'/'+n)).digest('hex')]));const before=snap(p+'/s');
const cli=spawnSync(process.execPath,[W+'/tools/a-legacy-store-export.mjs',p+'/s'],{encoding:'utf8'});out.cliExit=cli.status;out.cliOut=cli.stdout.slice(0,300);out.cliErr=cli.stderr.slice(0,200);
out.sourceUnchanged=JSON.stringify(snap(p+'/s'))===JSON.stringify(before);
const ex=await import(W+'/a-legacy-store-export.mjs');const {createAFencedStore}=await import(W+'/a-fenced-store.mjs');
let snapRes;out.plan=T(()=>{snapRes=ex.planLegacyCopyOut(createAFencedStore(p+'/s'));return Object.keys(snapRes);});
const mh=snapRes?.manifestHash||snapRes?.manifest?.sha256;
fs.mkdirSync(p+'/out',{mode:0o755});fs.chmodSync(p+'/out',0o755);out.copyToWorldReadableDir=T(()=>ex.writeLegacyCopyOut({snapshot:snapRes.snapshot||snapRes,outputDirectory:p+'/out',filename:'c.json',expectedManifestHash:mh}));
fs.chmodSync(p+'/out',0o700);fs.writeFileSync(p+'/out/exists.json','x',{mode:0o600});out.copyOverExisting=T(()=>ex.writeLegacyCopyOut({snapshot:snapRes.snapshot||snapRes,outputDirectory:p+'/out',filename:'exists.json',expectedManifestHash:mh}));
out.copyWrongManifest=T(()=>ex.writeLegacyCopyOut({snapshot:snapRes.snapshot||snapRes,outputDirectory:p+'/out',filename:'w.json',expectedManifestHash:'0'.repeat(64)}));
out.copyOk=T(()=>ex.writeLegacyCopyOut({snapshot:snapRes.snapshot||snapRes,outputDirectory:p+'/out',filename:'ok.json',expectedManifestHash:mh}));
out.sourceUnchangedAfterCopy=JSON.stringify(snap(p+'/s'))===JSON.stringify(before);out.migrationPlan=T(()=>ex.prepareLegacyMigration(snapRes.snapshot||snapRes));
console.log(JSON.stringify(out,null,1));fs.rmSync(p,{recursive:true,force:true});
