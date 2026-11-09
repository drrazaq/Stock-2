import test from 'node:test';import assert from 'node:assert/strict';import fs from'node:fs';import os from'node:os';import path from'node:path';import {fileURLToPath}from'node:url';import {execFile}from'node:child_process';import {promisify}from'node:util';
import {triageAssessments,assessmentJournalRows,assessmentSourceStatus,linkAssessmentOutcomes,assessmentCycleKey,frozenAssessmentQueue,assessmentCycleRows,makeScannerAssessmentRule,assessmentRuleIdentity}from'../discovery-runtime.mjs';
import {appendRadarRows,readRadarLedger}from'../radar-ledger.mjs';
import {loadScan,blocked}from'./load-scan.mjs';
const T='2026-11-09T17:18:16Z',root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=()=>({cutoff:T,signals:{session:'2026-11-06',generatedAt:'2026-11-07T01:00:00Z',stocks:[{sym:'AAA',state:'Buy watch',rule:'frozen',key:'frozen',last:20},{sym:'BBB',state:'No action',last:10}]},earnings:{reports:[{sym:'CCC',d:'2026-11-06',a:1,e:.5},{sym:'DDD',d:'2026-11-06',a:.2,e:.3}]},quality:{generatedAt:'2026-11-08T06:00:00Z',today:[{sym:'EEE',q:.9},{sym:'FFF',q:.8}],rank:{EEE:.9}},events:{events:[{sym:'BBB',p:'2026-11-06T22:00:00Z',f:'EARN'}]}});
test('population distinguishes overlapping rows, ticker labels and unverified issuer counts',()=>{const x=input();x.events.events.push({sym:'AAA',p:'2026-11-06T21:00:00Z'},null);const q=triageAssessments(x);assert.equal(q.population.uniqueSymbolLabels,6);assert.equal(q.population.verifiedEligibleIssuers,0);assert.equal(q.population.identityUnknownSymbols,6);assert.equal(q.population.invalidRows,1);assert.equal(q.population.sources.SEC.rows,3);assert.equal(q.decisions.filter(r=>r.symbol==='AAA'&&r.horizon==='SHORT').length,1);});
test('attention selection is horizon bounded, includes negative earnings and cannot use subsequent returns',()=>{const x=input(),q=triageAssessments(x);assert.deepEqual(Object.values(q.batches).map(a=>a.map(r=>r.symbol)),[['AAA','BBB'],['CCC','DDD'],['EEE','FFF']]);x.signals.stocks[0].subsequentReturn=999;x.earnings.reports[1].subsequentReturn=-.99;assert.deepEqual(triageAssessments(x).batches,q.batches);x.reviewedSymbols=['AAA'];x.excludedSymbols=['CCC'];const z=triageAssessments(x);assert.equal(z.counts.EXISTING_EXCLUSION,1);assert.equal(z.counts.ALREADY_INVESTIGATED_THIS_BATCH,1);assert.equal(z.batches.MID[0].symbol,'DDD');});
test('fresh completed session differs from live quote, then becomes stale after Monday close',()=>{assert.equal(assessmentSourceStatus(input().signals,T).status,'LATEST_COMPLETED_CLOSE_REFERENCE');assert.equal(assessmentSourceStatus(input().signals,'2026-11-09T21:01:00Z').status,'STALE_COMPLETED_CLOSE_REFERENCE');assert.equal(assessmentSourceStatus(input().signals,T).executableQuote,'UNKNOWN');assert.equal(assessmentSourceStatus({...input().signals,generatedAt:'2026-11-10T00:00:00Z'},T).status,'UNKNOWN_FUTURE_OUTPUT_CLOCK');assert.equal(assessmentSourceStatus({...input().signals,session:'2026-11-10'},T).status,'FUTURE_SOURCE');assert.equal(assessmentSourceStatus(input().signals,'2028-01-03T12:00:00Z').status,'UNKNOWN');});
test('future output clock cannot seed attention candidates',()=>{const x=input();x.quality.generatedAt='2027-01-01T00:00:00Z';assert.equal(triageAssessments(x).batches.LONG.length,0);});
test('existing journal preserves legacy bytes, deduplicates assessment versions and refuses corrupt append',()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'assessment-journal-'));try{const f=path.join(d,'journal.jsonl'),old='{"sym":"OLD","d":"2020-01-01","price":1,"spy":1}\n';fs.writeFileSync(f,old);const rows=assessmentJournalRows(triageAssessments(input()));assert.ok(rows.every(x=>x.sym===undefined&&x.d===undefined&&x.price===undefined));assert.ok(!new Set([JSON.parse(old),...rows].map(x=>x.sym)).has('AAA'));assert.equal(appendRadarRows(f,rows).appended,6);assert.equal(appendRadarRows(f,rows).appended,0);assert.ok(fs.readFileSync(f,'utf8').startsWith(old));assert.equal(readRadarLedger(f).length,7);const before=fs.readFileSync(f);assert.throws(()=>appendRadarRows(f,[{...rows[0],evidenceVersion:'0'.repeat(64)}]));assert.deepEqual(fs.readFileSync(f),before);fs.writeFileSync(f,'{"sym":"BROKEN"');assert.throws(()=>appendRadarRows(f,rows));assert.equal(fs.readFileSync(f,'utf8'),'{"sym":"BROKEN"');}finally{fs.rmSync(d,{recursive:true,force:true});}});
test('concurrent legacy discovery and assessment saves retain both under the existing lock',async()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'assessment-race-'));try{const f=path.join(d,'journal.jsonl'),rows=assessmentJournalRows(triageAssessments(input()));const run=promisify(execFile),src=path.join(root,'radar-ledger.mjs');await Promise.all([rows,[{sym:'LEGACY',d:'2026-11-06',price:10,spy:600}]].map(a=>run(process.execPath,['--input-type=module','-e',`import {appendRadarRows} from ${JSON.stringify(src)}; appendRadarRows(${JSON.stringify(f)},${JSON.stringify(a)});`])));assert.equal(readRadarLedger(f).length,7);assert.equal(readRadarLedger(f).filter(x=>x.sym==='LEGACY').length,1);}finally{fs.rmSync(d,{recursive:true,force:true});}});
test('exact outcome versions retain losses, no-fills and missing cases; cannot turn an aggregate/label into performance',async()=>{const S=await loadScan();try{
 const x=input(),L=S.value('L'),v=L.BASE,b=S.fn('scannerAssessmentRule')({v,tgt:null});
 x.signals.stocks=['AAA','BBB','CCC','DDD','EEE','FFF'].map(sym=>({sym,state:sym==='AAA'?'Buy watch':'No action',rule:L.ruleText(v),assessmentRule:b,key:L.vkey(v)}));
 const a=assessmentJournalRows(triageAssessments(x)),outcomes=a.slice(0,3).map((r,i)=>({assessmentId:r.id,evidenceVersion:r.evidenceVersion,ruleId:r.ruleId,ruleVersion:r.ruleVersion,horizon:r.horizon,status:['LOSS','NO_FILL','MISSING'][i],economicBasis:'MODELED',netAfterCosts:999}));
 const joined=linkAssessmentOutcomes(a,outcomes);assert.deepEqual(joined.slice(0,3).map(x=>x.status),['LOSS','NO_FILL','MISSING']);assert.ok(joined.every(x=>x.netAfterCosts===null));outcomes[0].evidenceVersion='wrong';assert.match(linkAssessmentOutcomes(a,outcomes)[0].status,/UNRESOLVED/);
 }finally{process.chdir(root);}});
test('actual opportunities caller is read-only across repeated full and compact replies',async()=>{const old=Date.now;Date.now=()=>Date.parse(T);try{const x=input(),S=await loadScan({files:{'data/signals.json':x.signals,'data/earnings-recent.json':x.earnings,'data/events-recent.json':x.events,'data/quality.json':x.quality,'data/discovery-journal.jsonl':'{"sym":"OLD","d":"2026-11-06","price":10,"spy":600}\n'}});const text=S.fn('opportunitiesText')(x.signals,false);assert.match(text,/BOUNDED INVESTIGATION QUEUE/);for(const h of ['SHORT','MID','LONG'])assert.match(text,new RegExp(h+':'));assert.match(text,/READ_ONLY_NOT_FROZEN/);const again=S.fn('opportunitiesText')(x.signals,false);assert.equal(again,text);S.fn('opportunitiesText')(x.signals,true);const rows=S.read('data/discovery-journal.jsonl').trim().split('\n').map(JSON.parse);assert.equal(rows.length,1);assert.ok(rows.filter(x=>x.type==='assessment').every(x=>!('owner' in x)&&!('halal' in x)&&!('holdings' in x)));assert.match(S.fn('assessmentContext')('AAA',x.signals,{},'WAIT'),/current completed close is not a current quote/);assert.match(S.fn('assessmentContext')('CCC',x.signals,{},'WAIT'),/cached actual 1 vs estimate 0.5.*not a verified surprise/);assert.equal(blocked.length,0);}finally{Date.now=old;process.chdir(root);}});

test('one producer cycle freezes the same batch; regeneration clocks cannot make completed names new',()=>{
 const x=input(),q=frozenAssessmentQueue(x),journal=assessmentCycleRows(q);
 const changed=structuredClone(x);changed.quality.generatedAt='2026-11-09T12:00:00Z';
 assert.equal(assessmentCycleKey(changed),q.cycleKey);
 assert.deepEqual(Object.values(triageAssessments(changed).batches).flat().map(r=>r.id),Object.values(triageAssessments(x).batches).flat().map(r=>r.id));
 // New symbols/ranks within the same session cannot expand a persisted cycle.
 changed.quality.today.unshift({sym:'ZZZ',q:1});changed.seenAssessmentIds=journal.filter(r=>r.type==='assessment').map(r=>r.id);
 const repeat=frozenAssessmentQueue(changed,journal);
 assert.equal(repeat.frozen,true);assert.deepEqual(repeat.batches,q.batches);
 assert.equal(Object.values(repeat.batches).flat().length,6);
 changed.signals.session='2026-11-09';assert.notEqual(assessmentCycleKey(changed),q.cycleKey);
});
test('cycle + assessment append is idempotent, preserves originals and distinguishes derived rule from absent rule',()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'assessment-cycle-'));try{
 const f=path.join(d,'journal.jsonl'),before='{"sym":"LEGACY","d":"2020-01-01","price":1,"spy":1}\n';
 fs.writeFileSync(f,before);const x=input();delete x.signals.stocks[0].key;
 const q=frozenAssessmentQueue(x),rows=assessmentCycleRows(q);
 assert.equal(rows[1].ruleIdentityState,'RULE_UNKEYED');
 assert.equal(rows[1].ruleId,null);
 assert.equal(rows.find(r=>r.symbol==='CCC').ruleIdentityState,'NO_ADOPTED_RULE_SUPPLIED');
 assert.equal(appendRadarRows(f,rows).appended,7);
 assert.equal(appendRadarRows(f,rows).appended,0);
 assert.ok(fs.readFileSync(f,'utf8').startsWith(before));
 const frozen=frozenAssessmentQueue(x,readRadarLedger(f));assert.equal(frozen.frozen,true);assert.deepEqual(frozen.batches,q.batches);
 }finally{fs.rmSync(d,{recursive:true,force:true});}
});

test('actual reply withholds a time-varying unfrozen preview and later reuses producer selection',async()=>{
 const old=Date.now;Date.now=()=>Date.parse(T);try{
 const x=input(),S=await loadScan({files:{'data/signals.json':x.signals,'data/earnings-recent.json':x.earnings,'data/events-recent.json':x.events,'data/quality.json':x.quality}});
 const before=S.fn('opportunitiesText')(x.signals,false);assert.match(before,/awaiting producer-frozen batch/);
 assert.doesNotMatch(before,/AAA \[INVESTIGATE|CCC \[INVESTIGATE/);
 const q=frozenAssessmentQueue(x);S.write('data/discovery-journal.jsonl',assessmentCycleRows(q));
 const first=S.fn('opportunitiesText')(x.signals,false);assert.match(first,/AAA \[INVESTIGATE/);
 const original=S.read('data/discovery-journal.jsonl');Date.now=()=>Date.parse('2026-11-13T17:18:16Z');
 const later=S.fn('opportunitiesText')(x.signals,false);assert.match(later,/AAA \[INVESTIGATE/);assert.match(later,/CCC \[INVESTIGATE/);
 assert.equal(S.read('data/discovery-journal.jsonl'),original);
 }finally{Date.now=old;process.chdir(root);}
});

test('actual scanner definition binds parameters, exits and implementation version without adopting the rule',async()=>{
 const S=await loadScan();try{
 const L=S.value('L'),v=L.VARIANTS.find(v=>v.fam==='cross'&&v.fast===10&&v.slow===30&&v.mult===1.5&&v.tp===3&&!v.mf&&!v.maxHold);
 const build=variant=>S.fn('scannerAssessmentRule')({v:variant,tgt:null}),a=build(v);
 assert.equal(a.definition.logicVersion,L.LOGIC_VERSION);assert.equal(a.definition.variantKey,L.vkey(v));
 assert.equal(a.definition.variant.mult,1.5);assert.equal(a.definition.config.ATR,L.CFG.ATR);
 assert.equal(a.definition.exitPolicy.modeled,'index.html#logic:followTrade/exitAt');
 assert.deepEqual(build({...v}),a);assert.deepEqual(build(Object.fromEntries(Object.entries(v).reverse())),a);
 const unTargeted={...v,tp:null};const t1=S.fn('scannerAssessmentRule')({v:unTargeted,tgt:{mode:'all',x:.1}}),t2=S.fn('scannerAssessmentRule')({v:unTargeted,tgt:{mode:'half',x:.1}});assert.notEqual(t1.ruleId,t2.ruleId);
 for(const patch of [{mult:2},{tp:2},{mf:true},{maxHold:20},{fast:9,slow:21}])assert.notEqual(build({...v,...patch}).ruleId,a.ruleId);
 const next=makeScannerAssessmentRule({...{logicVersion:L.LOGIC_VERSION+1,sourceHash:'f'.repeat(64),variant:v,config:L.CFG,ruleText:L.ruleText(v),variantKey:L.vkey(v)}});
 assert.notEqual(next.ruleId,a.ruleId);assert.notEqual(next.ruleVersion,a.ruleVersion);
 assert.equal(assessmentRuleIdentity({rule:L.ruleText(v)}).ruleIdentityState,'RULE_UNKEYED');
 assert.equal(assessmentRuleIdentity({}).ruleIdentityState,'NO_ADOPTED_RULE_SUPPLIED');
 assert.equal(assessmentRuleIdentity({rule:L.ruleText(v),assessmentRule:a}).ruleIdentityState,'IDENTIFIED');
 const tampered=structuredClone(a);tampered.definition.variant.mult=2;
 assert.equal(assessmentRuleIdentity({rule:L.ruleText(v),assessmentRule:tampered}).ruleIdentityState,'RULE_UNKEYED');
 }finally{process.chdir(root);}
});
test('newly recorded rows join only exact rule/version/evidence and never retrofit legacy identities',async()=>{
 const S=await loadScan();try{
 const x=input(),L=S.value('L'),v=L.BASE,definition=S.fn('scannerAssessmentRule')({v,tgt:null});
 x.signals.stocks[0]={sym:'AAA',state:'Buy watch',rule:L.ruleText(v),proven:false,assessmentRule:definition};
 const q=frozenAssessmentQueue(x),a=assessmentJournalRows(q).find(r=>r.symbol==='AAA');
 const out={assessmentId:a.id,evidenceVersion:a.evidenceVersion,ruleId:a.ruleId,ruleVersion:a.ruleVersion,horizon:a.horizon,status:'LOSS',economicBasis:'AUTHENTIC_EXECUTION',completeChain:true,controlVersion:'fixed-control-v1',reviewStatus:'INDEPENDENT_COMPLETE_CHAIN_REVIEWED',witnessId:'a'.repeat(64),netAfterCosts:-23};
 assert.equal(linkAssessmentOutcomes([a],[out])[0].netAfterCosts,-23);
 for(const patch of [{ruleId:'wrong'},{ruleVersion:'wrong'},{ruleVersion:undefined},{evidenceVersion:'wrong'},{assessmentId:'wrong'},{horizon:'LONG'}]){
  const feedback=linkAssessmentOutcomes([a],[{...out,...patch}])[0];assert.match(feedback.status,/UNRESOLVED/);assert.equal(feedback.netAfterCosts,null);
 }
 assert.match(linkAssessmentOutcomes([a],[out,out])[0].status,/UNRESOLVED/);
 const legacy={...a};delete legacy.ruleVersion;delete legacy.ruleIdentityState;delete legacy.ruleDefinition;
 const original=JSON.stringify(legacy);assert.equal(linkAssessmentOutcomes([legacy],[out])[0].netAfterCosts,null);assert.equal(JSON.stringify(legacy),original);
 const before=S.read('data/settings.json');S.write('data/signals.json',x.signals);S.write('data/discovery-journal.jsonl',assessmentCycleRows(q));
 const text=S.fn('opportunitiesText')(x.signals,false);assert.match(text,/AAA \[INVESTIGATE \/ WAIT; rule NOT PROVEN/);
 assert.equal(S.read('data/settings.json'),before);
 }finally{process.chdir(root);}
});

test('binding rollout preserves the pinned legacy cycle until real versioned inputs arrive',()=>{
 const x=input();assert.equal(assessmentCycleKey(x),'3ec0fdfc4050ebcffc18bbf9531650e06a8b370a3db6027855af4fad556e9d01');
 x.quality.generatedAt='2026-11-09T12:00:00Z';assert.equal(assessmentCycleKey(x),'3ec0fdfc4050ebcffc18bbf9531650e06a8b370a3db6027855af4fad556e9d01');
 x.signals.ruleIdentityVersion='SCANNER_RULE_DEFINITION_V1:16:'+'a'.repeat(64);assert.notEqual(assessmentCycleKey(x),'3ec0fdfc4050ebcffc18bbf9531650e06a8b370a3db6027855af4fad556e9d01');
});
