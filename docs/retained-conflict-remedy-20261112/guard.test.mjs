import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import zlib from 'node:zlib';
const source=fs.readFileSync(new URL('./leaders-study.candidate.mjs',import.meta.url),'utf8');
const functionSource=source.slice(source.indexOf('function cacheDayLabelDuplicateCounts'),source.indexOf('\nconst retainedDuplicateCounts ='));
const helper=vm.runInNewContext(functionSource+'\n({counts:cacheDayLabelDuplicateCounts,check:assertNoNewCacheOverlap})');
const part=(T,c=T.map(()=>10))=>({T:[...T],o:[...c],h:c.map(x=>x+1),l:c.map(x=>x-1),c:[...c],v:T.map(()=>1000000)}),row=(a,b)=>({...a,...(b?{x:b}:{})});
test('retained conflicting keys are observed unchanged, not rejected or repaired',()=>{
 const days={'2023-01-03':row(part(['SYN'],[10]),part(['SYN'],[2]))},before=JSON.stringify(days),baseline=helper.counts(days);assert.equal(baseline.size,1);assert.equal([...baseline.values()][0],2);helper.check(days,baseline);assert.equal(JSON.stringify(days),before);
});
test('new cross-array, identical and within-array duplicates all refuse new writes',()=>{
 for(const x of [row(part(['SYN']),part(['SYN'])),row(part(['SYN','SYN'])),row(part(['OTHER']),part(['SYN','SYN']))])assert.throws(()=>helper.check({'2023-01-03':x},new Map()),/NEW_CACHE_DAY_LABEL_CONFLICT_UNRESOLVED/);
});
test('increased multiplicity is refused even for an already-conflicted key',()=>{
 const days={'2023-01-03':row(part(['SYN']),part(['SYN']))},baseline=helper.counts(days);days['2023-01-03'].x=part(['SYN','SYN']);assert.throws(()=>helper.check(days,baseline),/NEW_CACHE_DAY_LABEL_CONFLICT_UNRESOLVED/);
});
test('literal labels, cross-day reuse and missing legacy tails are unchanged',()=>{
 const days={'2023-01-03':row(part(['SYN','syn','SYN.A','SYN-A'])),'2023-01-04':row(part(['SYN']),part(['OTHER']))},before=JSON.stringify(days);helper.check(days,new Map());assert.equal(JSON.stringify(days),before);
});
test('ordinary rolling-window removal is not a selection performed by the guard',()=>{
 const old={'2023-01-03':row(part(['SYN']),part(['SYN']))},baseline=helper.counts(old);helper.check({},baseline);assert.ok(old['2023-01-03']);
});
test('schema failures are generic and do not expose labels or days',()=>{
 for(const x of [[],{'private-day':null},{'private-day':{T:['PRIVATE_LABEL',null]}},{'private-day':{T:['PRIVATE_LABEL'],x:{T:7}}}])assert.throws(()=>helper.counts(x),e=>/^CACHE_[A-Z_]+$/.test(e.message));
});
function startup(days){
 let writes=0,network=0;const logs=[],compressed=zlib.gzipSync(JSON.stringify({days,ref:null,gone:[]}));
 const context={Buffer,Date,JSON,Set,Map,console:{log:(...x)=>logs.push(x.join(' ')),error:()=>{}},setTimeout,process:{env:{MASSIVE_KEY:'SYNTHETIC_NO_REAL_KEY'},exit:()=>{throw Error('UNEXPECTED_EXIT');}},fs:{mkdirSync:()=>{},readFileSync:p=>p==='data/settings.json'?Buffer.from('{}'):compressed,writeFileSync:()=>{writes++;}},zlib,fetch:()=>{network++;throw Error('NETWORK_FORBIDDEN');}};
 const prefix=source.slice(0,source.indexOf('// Common stocks and ADRs only')).replace(/^import .*;\n/gm,'');return {context,prefix,logs,counts:()=>({writes,network})};
}
test('actual producer startup flags retained conflicts without stopping or acquiring',()=>{
 const f=startup({'2023-01-03':row(part(['SYN']),part(['SYN'],[2]))});vm.runInNewContext(f.prefix,f.context);assert.deepEqual(f.counts(),{writes:0,network:0});assert.match(f.logs.join('\n'),/retained unresolved duplicate keys: 1/);assert.doesNotMatch(f.logs.join('\n'),/SYN|2023-01-03/);
});
test('actual save preserves old conflicts but refuses a newly introduced overlap before disk write',()=>{
 const f=startup({'2023-01-03':row(part(['SYN']),part(['SYN'],[2]))});vm.runInNewContext(f.prefix+'\nglobalThis.s=store;globalThis.commit=save;',f.context);const before=JSON.stringify(f.context.s.days);f.context.commit();assert.equal(JSON.stringify(f.context.s.days),before);assert.deepEqual(f.counts(),{writes:1,network:0});f.context.s.days['2023-01-04']=row(part(['NEW']),part(['NEW'],[2]));assert.throws(()=>f.context.commit(),/NEW_CACHE_DAY_LABEL_CONFLICT_UNRESOLVED/);assert.deepEqual(f.counts(),{writes:1,network:0});
});
test('valid fresh-day output and prices remain byte-for-byte unchanged through save',()=>{
 const days={'2023-01-03':row(part(['SYN'],[10.25]),part(['OTHER'],[1.25]))},f=startup(days);vm.runInNewContext(f.prefix+'\nglobalThis.s=store;globalThis.commit=save;',f.context);const before=JSON.stringify(f.context.s.days);f.context.commit();assert.equal(JSON.stringify(f.context.s.days),before);assert.deepEqual(f.counts(),{writes:1,network:0});
});
test('near-observed guard scan remains bounded local overhead, no data processing claimed',()=>{
 const labels=Array.from({length:5462},(_,i)=>'S'+i),r=part(labels),days={};for(let i=0;i<1260;i++)days['SYNTHETIC-DAY-'+i]=r;const begin=performance.now();helper.check(days,new Map());console.log(JSON.stringify({kind:'SYNTHETIC_GUARD_ONLY_OVERHEAD',rows:6882120,elapsedMs:performance.now()-begin}));days['SYNTHETIC-DAY-1259']={...r,x:part(['S0'])};assert.throws(()=>helper.check(days,new Map()),/NEW_CACHE_DAY_LABEL_CONFLICT_UNRESOLVED/);
});
test('same-response contradictory provider labels can create cross-array only duplicates',()=>{
 const excerpt=fs.readFileSync(new URL('../ra2-duplicate-diagnostic-20261112/producer-excerpt.mjs',import.meta.url),'utf8'),split=excerpt.indexOf('// x rows'),c={};vm.runInNewContext(excerpt.slice(0,split)+'\nglobalThis.q=qualifies;globalThis.p=pack;',c);
 const provider=[{T:'SYN',o:10,h:11,l:9,c:10,v:1000000},{T:'SYN',o:2,h:3,l:1,c:2,v:1000000}],main=c.p(provider.filter(c.q)),tail=c.p(provider.filter(x=>!c.q(x)&&x.c>0));assert.equal(main.T.length,1);assert.equal(tail.T.length,1);assert.equal(main.T[0],tail.T[0]);assert.notEqual(main.c[0],tail.c[0]);assert.throws(()=>helper.check({'2023-01-03':{...main,x:tail}},new Map()),/NEW_CACHE_DAY_LABEL_CONFLICT_UNRESOLVED/);
});
