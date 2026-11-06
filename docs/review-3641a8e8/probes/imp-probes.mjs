import fs from 'node:fs';import {createHash,generateKeyPairSync} from 'node:crypto';
const W='<NEW_WORKTREE>';const {nativeImportFixture}=await import('./fx.mjs');const {importNativeAEvidence}=await import(W+'/a-native-evidence-importer.mjs');const {createAFencedStore}=await import(W+'/a-fenced-store.mjs');
const H=b=>createHash('sha256').update(b).digest('hex');const out={};
const run=f=>importNativeAEvidence({store:f.store,token:f.token,originalsDirectory:f.directory,request:f.request()});
const S=r=>({status:r.status,reason:r.cases?.[0]?.reason??r.reason,card:/UNKNOWN/.test(r.cases?.[0]?.paperCard||'')?'UNKNOWN_CARD':(/RESEARCH \/ PAPER ONLY/.test(r.cases?.[0]?.paperCard||'')?'PAPER_CARD':'?'),outcome:r.cases?.[0]?.outcome?.status,allowBuy:r.allowBuy,synthetic:r.synthetic,srcAuth:r.sourceAuthentication});
const P=(name,opts,mut)=>{const f=nativeImportFixture(opts);try{mut&&mut(f);out[name]=S(run(f));}catch(e){out[name]='PROBE_THROW:'+e.message;}finally{f.cleanup();}};
const resign=(f,ref,role,edit)=>{const p=JSON.parse(fs.readFileSync(f.directory+'/'+ref.file));edit(p);return f.signed(f.raw(p),role,ref.receipt.body.recordedAt);};
const envEdit=(f,ref,edit)=>resign(f,ref,'CAPTURE',p=>{const body=JSON.parse(Buffer.from(p.bodyBase64,'base64'));edit(body,p);const b=Buffer.from(JSON.stringify(body));p.bodyBase64=b.toString('base64');p.bodySha256=H(b);});
P('baseline_synthetic',{});
P('baseline_loss',{loss:true});
// identity mismatches
P('id_massiveCikDiffers',{},f=>{const id=f.bundle.nativeBinding.identity;id.sources.massive=envEdit(f,id.sources.massive,b=>{b.results.cik='2';});});
P('id_figiDiffers',{},f=>{const id=f.bundle.nativeBinding.identity;id.sources.massive=envEdit(f,id.sources.massive,b=>{b.results.share_class_figi='BBG000000002';});});
P('id_alpacaExchangeDiffers',{},f=>{const id=f.bundle.nativeBinding.identity;id.sources.alpaca=envEdit(f,id.sources.alpaca,b=>{b.exchange='NYSE';});});
P('id_alpacaSymbolDiffers',{},f=>{const id=f.bundle.nativeBinding.identity;id.sources.alpaca=envEdit(f,id.sources.alpaca,b=>{b.symbol='TEST2';});});
P('id_reviewWindowExpired',{},f=>{const r=f.bundle.nativeBinding.identity.review;f.bundle.nativeBinding.identity.review=resign(f,r,'REVIEW',v=>{v.validUntil='2026-11-04T00:00:00Z';});});
P('id_closeUsesOtherIdentity',{},f=>{const c=f.bundle.nativeBinding.closes[2];const id=structuredClone(c.identity);id.sources.alpaca=envEdit(f,id.sources.alpaca,b=>{b.tradable=false;});c.identity=id;});
// omitted / conflicting evidence
P('omit_closeBinding',{},f=>{f.bundle.nativeBinding.closes.pop();});
P('dup_closeBinding',{},f=>{const c=f.bundle.nativeBinding.closes;c[1]=structuredClone(c[0]);});
P('omit_exitQuotes',{},f=>{f.bundle.nativeBinding.exitQuotes=[];});
P('omit_entryQuote',{},f=>{delete f.bundle.nativeBinding.entryQuote;});
P('omit_finality',{},f=>{delete f.bundle.nativeBinding.closes[0].finality;});
P('omit_archive',{},f=>{delete f.bundle.nativeBinding.archive;});
P('close_priceChangedInTape',{},f=>{const recs=f.records.map(e=>e.type==='CLOSE'&&e.record.sessionDate==='2026-11-05'?{...e,record:{...e.record,close:13}}:e);f.bundle.outcomes=f.seal(f.makeTape(recs));f.syncWitness(recs);});
P('close_omittedFromTapeAndBinding',{},f=>{const recs=f.records.filter(e=>!(e.type==='CLOSE'&&e.record.sessionDate==='2026-11-05'));f.bundle.nativeBinding.closes=f.bundle.nativeBinding.closes.filter(c=>c.sessionDate!=='2026-11-05');f.bundle.outcomes=f.seal(f.makeTape(recs));f.syncWitness(recs);});
P('exit_slotNarrowedToHideAdverse',{loss:true},f=>{const x=f.bundle.nativeBinding.exitQuotes[0];x.slot={...x.slot,start:'2026-11-05T14:30:01Z'};const recs=f.records.filter(e=>e.type!=='BBO'||e.record.bid!==9.2);f.bundle.outcomes=f.seal(f.makeTape(recs));f.syncWitness(recs);});
// invalid clocks
P('clk_primaryObservedShift',{},f=>{f.input.catalyst.observedAt='2026-11-04T13:01:01Z';f.refreshDecision();});
P('clk_publishedAtFromAtom',{},f=>{f.input.catalyst.publishedAt='2026-11-04T12:59:59Z';f.refreshDecision();});
P('clk_closeAvailableBeforeClose',{},f=>{const c=f.bundle.nativeBinding.closes[0];c.envelope=resign(f,c.envelope,'CAPTURE',p=>{p.bodyReceivedAt=p.headersReceivedAt=p.observedAt=p.requestStartedAt=c.sessionDate+'T20:59:00Z';});});
P('clk_entryQuoteNoZone',{},f=>{const b=f.bundle.nativeBinding;b.entryQuote=resign(f,b.entryQuote,'CAPTURE',p=>{p.bodyReceivedAt=p.bodyReceivedAt.replace('Z','');});});
P('clk_provenanceAfterAsOf',{},f=>{const b=f.bundle.nativeBinding;b.provenance=f.signed(f.raw(JSON.parse(fs.readFileSync(f.directory+'/'+b.provenance.file))),'REVIEW','2026-11-10T00:00:00Z');});
P('clk_closeFinalityAfterAvailable',{},f=>{const c=f.bundle.nativeBinding.closes[0];c.finality=f.signed(f.raw(JSON.parse(fs.readFileSync(f.directory+'/'+c.finality.file))),'REVIEW','2026-11-12T00:00:00Z');});
// independence
P('host_sameHostId',{},f=>{const b=f.bundle.nativeBinding,pv=JSON.parse(fs.readFileSync(f.directory+'/'+b.provenance.file));const w=JSON.parse(fs.readFileSync(f.directory+'/'+pv.witnessHost.file));w.hostId='SYNTHETIC_HOST_CAPTURE';pv.witnessHost=f.signed(f.raw(w),'WITNESS',pv.witnessHost.receipt.body.recordedAt);b.provenance=f.signed(f.raw(pv),'REVIEW',b.provenance.receipt.body.recordedAt);});
P('closeContract_adopted',{},f=>{const b=f.bundle.nativeBinding;b.closeContract=resign(f,b.closeContract,'REVIEW',v=>{v.adopted=true;});});
// origin labelling
const ra=()=>{const k=generateKeyPairSync('ed25519');return {id:'PROBE',publicKey:k.publicKey.export({type:'spki',format:'pem'})};};
P('origin_synthFixtureIntoRetained',{storeOrigin:'RETAINED_RESEARCH',reviewOrigin:'RETAINED_RESEARCH',authority:ra()},f=>{f.dataset.origin='RETAINED_RESEARCH';});
P('origin_declaredNativeButSyntheticStore',{nativeProv:'DECLARED_UNAUDITED_NATIVE'},null);
P('origin_reviewSaysSyntheticInRetained',{storeOrigin:'RETAINED_RESEARCH',nativeProv:'DECLARED_UNAUDITED_NATIVE',authority:ra()},f=>{f.dataset.origin='RETAINED_RESEARCH';});
P('origin_requestLabelMismatch',{},f=>{const r=f.request;f.request=()=>({...r(),storeOrigin:'RETAINED_RESEARCH'});});
P('origin_selfDeclaredNativeFixture',{storeOrigin:'RETAINED_RESEARCH',reviewOrigin:'RETAINED_RESEARCH',nativeProv:'DECLARED_UNAUDITED_NATIVE',authority:ra()},f=>{f.dataset.origin='RETAINED_RESEARCH';});
// interrupted writes during import (synthetic only), then exact retry
for(const stage of ['AFTER_RECORD','AFTER_COMMIT']){const f=nativeImportFixture();try{const req=f.request(),append=f.store.append;let n=0;f.store.append=(...a)=>{n++;return n===3?append(...a.slice(0,5),stage):append(...a);};const a=S(importNativeAEvidence({store:f.store,token:f.token,originalsDirectory:f.directory,request:req}));f.store=createAFencedStore(f.root+'/store');const b=S(importNativeAEvidence({store:f.store,token:f.token,originalsDirectory:f.directory,request:req}));out['interrupt_'+stage]={first:a.status+'/'+a.reason,retry:b.status,pending:f.store.head().pending};}catch(e){out['interrupt_'+stage]='PROBE_THROW:'+e.message;}finally{f.cleanup();}}
{const f=nativeImportFixture();try{const req=f.request(),ev=f.store.evaluate;f.store.evaluate=(...a)=>ev(...a.slice(0,4),'AFTER_INTENT');const a=S(importNativeAEvidence({store:f.store,token:f.token,originalsDirectory:f.directory,request:req}));f.store=createAFencedStore(f.root+'/store');const b=S(importNativeAEvidence({store:f.store,token:f.token,originalsDirectory:f.directory,request:req}));out.interrupt_EVALUATE_AFTER_INTENT={first:a.status+'/'+a.reason,retry:b.status+'/'+(b.reason||'')};}catch(e){out.interrupt_EVALUATE_AFTER_INTENT='PROBE_THROW:'+e.message;}finally{f.cleanup();}}
// lost-body intent during import -> dispose -> import shows UNKNOWN
{const f=nativeImportFixture({});try{const append=f.store.append;let n=0;f.store.append=(...a)=>{n++;return n===2?append(...a.slice(0,5),'AFTER_INTENT'):append(...a);};const a=S(run(f));out.lostBodyDuringImport={first:a.status+'/'+a.reason,second:S(run(f)).reason};}finally{f.cleanup();}}
console.log(JSON.stringify(out,null,1));
