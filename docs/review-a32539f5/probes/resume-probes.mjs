import fs from 'node:fs';
const W='<WORKTREE>';const {nativeImportFixture}=await import('./fx.mjs');const {importNativeAEvidence}=await import(W+'/a-native-evidence-importer.mjs');const {createAFencedStore}=await import(W+'/a-fenced-store.mjs');
const out={};const T=f=>{try{const r=f();return typeof r==='object'?JSON.stringify(r).slice(0,110):String(r);}catch(e){return 'THROW:'+e.message;}};
const R=(f,req)=>{const r=importNativeAEvidence({store:f.store,token:f.token,originalsDirectory:f.directory,request:req});return r.status+'/'+(r.reason||r.cases?.[0]?.reason||'');};
for(const [idx,stage] of [[1,'AFTER_INTENT'],[2,'AFTER_INTENT'],[2,'AFTER_RECORD'],[5,'AFTER_INTENT'],[2,'AFTER_COMMIT']]){const f=nativeImportFixture();try{const req=f.request(),append=f.store.append;let n=0;let captured;f.store.append=(...a)=>{n++;if(n===idx){captured=a;return append(...a.slice(0,5),stage);}return append(...a);};
 const k='append#'+idx+'_'+stage,o={first:R(f,req)};f.store=createAFencedStore(f.root+'/store');o.exactImporterRetry=R(f,req);o.pending=f.store.head().pending;
 if(o.pending){o.storeRecover=T(()=>f.store.recover(f.token).status);o.pendingAfterRecover=f.store.head().pending;if(o.pendingAfterRecover){o.manualExactSingleAppend=T(()=>f.store.append(...captured).status);}o.importerAfter=R(f,req);}
 out[k]=o;}finally{f.cleanup();}}
{const f=nativeImportFixture();try{const req=f.request(),ev=f.store.evaluate;f.store.evaluate=(...a)=>ev(...a.slice(0,4),'AFTER_INTENT');const o={first:R(f,req)};f.store=createAFencedStore(f.root+'/store');o.exactImporterRetry=R(f,req);o.storeRecover=T(()=>f.store.recover(f.token));o.importerAfter=R(f,req);out.evaluate_AFTER_INTENT=o;}finally{f.cleanup();}}
console.log(JSON.stringify(out,null,1));
