import fs from 'node:fs';
const OLD='<A32539F5_WORKTREE>',NEW='<NEW_WORKTREE>';const {nativeImportFixture}=await import('./fx-old.mjs');
const oldImp=(await import(OLD+'/a-native-evidence-importer.mjs')).importNativeAEvidence,newImp=(await import(NEW+'/a-native-evidence-importer.mjs')).importNativeAEvidence,newStore=(await import(NEW+'/a-fenced-store.mjs')).createAFencedStore;
const snap=d=>Object.fromEntries(fs.readdirSync(d).map(n=>[n,fs.readFileSync(d+'/'+n)]));const kept=(a,d)=>Object.entries(a).every(([n,b])=>fs.existsSync(d+'/'+n)&&fs.readFileSync(d+'/'+n).equals(b));
const out={};const R=(imp,f,req,store)=>{const r=imp({store,token:f.token,originalsDirectory:f.directory,request:req});return r.status+'/'+(r.reason||r.cases?.[0]?.reason||'');};
for(const [idx,stage] of [[2,'AFTER_INTENT'],[2,'AFTER_RECORD'],[5,'AFTER_INTENT'],['eval','AFTER_INTENT']]){const f=nativeImportFixture();try{const req=f.request();
 if(idx==='eval'){const ev=f.store.evaluate;f.store.evaluate=(...a)=>ev(...a.slice(0,4),stage);}else{const ap=f.store.append;let n=0;f.store.append=(...a)=>{n++;return n===idx?ap(...a.slice(0,5),stage):ap(...a);};}
 const o={oldFirst:R(oldImp,f,req,f.store)};const before=snap(f.root+'/store');const s=newStore(f.root+'/store');o.newRetry=R(newImp,f,req,s);o.pending=s.head().pending;o.oldBytesPreserved=kept(before,f.root+'/store');o.legacyReceipts=fs.readdirSync(f.root+'/store').filter(n=>n.startsWith('legacy-import-replay-')).length;out['old_'+idx+'_'+stage]=o;}finally{f.cleanup();}}
console.log(JSON.stringify(out,null,1));
