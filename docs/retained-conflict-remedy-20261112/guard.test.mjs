import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import zlib from 'node:zlib';
const source=fs.readFileSync(new URL('./leaders-study.candidate.mjs',import.meta.url),'utf8');
const functionSource=source.slice(source.indexOf('function assertCacheDayLabelUniqueness'),source.indexOf('\nassertCacheDayLabelUniqueness(store.days);'));
const guard=vm.runInNewContext('('+functionSource+')');
const part=(T,c=T.map(()=>10))=>({T,o:[...c],h:c.map(x=>x+1),l:c.map(x=>x-1),c:[...c],v:T.map(()=>1000000)}),row=(a,b)=>({...a,...(b?{x:b}:{})});
test('conflicting cross main/tail is rejected unchanged; no price or source preference',()=>{
 const days={'2023-01-03':row(part(['SYN'],[10]),part(['SYN'],[2]))},before=JSON.stringify(days);assert.throws(()=>guard(days),/CACHE_DAY_LABEL_CONFLICT_UNRESOLVED/);assert.equal(JSON.stringify(days),before);
});
test('identical duplicates and repeated labels within either partition also stop',()=>{
 for(const x of [row(part(['SYN']),part(['SYN'])),row(part(['SYN','SYN'])),row(part(['OTHER']),part(['SYN','SYN']))])assert.throws(()=>guard({'2023-01-03':x}),/CACHE_DAY_LABEL_CONFLICT_UNRESOLVED/);
});
test('literal labels and cross-day reuse remain distinct; legacy missing tail remains unchanged',()=>{
 const days={'2023-01-03':row(part(['SYN','syn','SYN.A','SYN-A'])), '2023-01-04':row(part(['SYN']),part(['OTHER']))},before=JSON.stringify(days);guard(days);assert.equal(JSON.stringify(days),before);
});
test('schema failures are generic and never expose a label/day/value',()=>{
 for(const x of [[],{'private-day':null},{'private-day':{T:['PRIVATE_LABEL',null]}},{'private-day':{T:['PRIVATE_LABEL'],x:{T:7}}}])assert.throws(()=>guard(x),e=>/^CACHE_[A-Z_]+$/.test(e.message));
});
function startup(days){
 let writes=0,network=0;const compressed=zlib.gzipSync(JSON.stringify({days,ref:null,gone:[]}));
 const context={Buffer,Date,JSON,Set,Map,console:{log:()=>{},error:()=>{}},setTimeout,process:{env:{MASSIVE_KEY:'SYNTHETIC_NO_REAL_KEY'},exit:()=>{throw Error('UNEXPECTED_EXIT');}},fs:{mkdirSync:()=>{},readFileSync:p=>p==='data/settings.json'?Buffer.from('{}'):compressed,writeFileSync:()=>{writes++;}},zlib,fetch:()=>{network++;throw Error('NETWORK_FORBIDDEN');}};
 const prefix=source.slice(0,source.indexOf('// Common stocks and ADRs only')).replace(/^import .*;\n/gm,'');
 return {context,prefix,counts:()=>({writes,network})};
}
test('actual producer startup stops retained conflicts before any provider read or save',()=>{
 const f=startup({'2023-01-03':row(part(['SYN']),part(['SYN'],[2]))});assert.throws(()=>vm.runInNewContext(f.prefix,f.context),/CACHE_DAY_LABEL_CONFLICT_UNRESOLVED/);assert.deepEqual(f.counts(),{writes:0,network:0});
});
test('actual save boundary refuses a newly introduced overlap before write; valid save unchanged',()=>{
 const f=startup({'2023-01-03':row(part(['SYN']),part(['OTHER']))});vm.runInNewContext(f.prefix+'\nglobalThis.s=store;globalThis.commit=save;',f.context);f.context.commit();assert.deepEqual(f.counts(),{writes:1,network:0});f.context.s.days['2023-01-03'].x=part(['SYN']);assert.throws(()=>f.context.commit(),/CACHE_DAY_LABEL_CONFLICT_UNRESOLVED/);assert.deepEqual(f.counts(),{writes:1,network:0});
});
test('near-observed row-count guard cost with duplicate at the end; caps not raised',()=>{
 const labels=Array.from({length:5462},(_,i)=>'S'+i),r=part(labels),days={};for(let i=0;i<1260;i++)days['SYNTHETIC-DAY-'+i]=r;
 const begin=performance.now();guard(days);const elapsed=performance.now()-begin;days['SYNTHETIC-DAY-1259']={...r,x:part(['S0'])};assert.throws(()=>guard(days),/CACHE_DAY_LABEL_CONFLICT_UNRESOLVED/);console.log(JSON.stringify({kind:'SYNTHETIC_GUARD_OVERHEAD_NOT_MARKET_EVIDENCE',rows:6882120,validGuardMs:elapsed}));
});
