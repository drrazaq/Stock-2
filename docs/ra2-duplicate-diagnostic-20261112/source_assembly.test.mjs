import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('./producer-excerpt.mjs',import.meta.url),'utf8');
async function backfill(main,provider){
 const store={days:{'2023-01-03':main}};let calls=0;
 const context={store,env:{TAIL_CALLS:1},CS:new Set(['SYN']),api:async()=>{calls++;return {results:provider};},iso:()=> '2026-11-01',save:()=>{},console:{log:()=>{}},Date};
 await vm.runInNewContext('(async()=>{'+source+'})()',context);assert.equal(calls,1);return store.days['2023-01-03'];
}
const bar=(c=4,v=300000)=>({T:'SYN',o:c,h:c+.2,l:c-.2,c,v});
const main=x=>({T:[x.T],o:[x.o],h:[x.h],l:[x.l],c:[x.c],v:[x.v]});
test('actual retained producer backfill permits overlap with older main at changed adjusted price',async()=>{
 const x=await backfill(main(bar()),[bar(2,600000)]);assert.deepEqual([...x.T],['SYN']);assert.deepEqual([...x.x.T],['SYN']);assert.equal(x.c[0],4);assert.equal(x.x.c[0],2);
});
test('later independent main split adjustment can leave identical duplicate bars; no authentic cause inferred',async()=>{
 const x=await backfill(main({T:'SYN',o:4,h:4.4,l:3.6,c:4,v:300000}),[{T:'SYN',o:2,h:2.2,l:1.8,c:2,v:600000}]);
 // Exact already-existing producer split transform; demonstrates possibility only.
 for(const f of ['o','h','l','c'])x[f][0]=+(x[f][0]/2).toFixed(4);x.v[0]=Math.round(x.v[0]*2);
 for(const f of ['T','o','h','l','c','v'])assert.equal(x[f][0],x.x[f][0]);
});
test('same-source duplicate provider labels survive actual pack/backfill within tail',async()=>{
 const x=await backfill(main(bar()),[bar(2,600000),bar(2.1,600000)]);assert.deepEqual([...x.x.T],['SYN','SYN']);assert.equal(x.x.c[0],2);assert.equal(x.x.c[1],2.1);
});
test('same-response unique-label qualify partitions are disjoint; no normalizer collapses aliases',()=>{
 const split=source.indexOf('// x rows');const ctx={};vm.runInNewContext(source.slice(0,split)+'\nglobalThis.q=qualifies;globalThis.p=pack;',ctx);
 const rows=[bar(),{...bar(2,100),'T':'OTHER'}];assert.equal(rows.filter(ctx.q).length,1);assert.equal(rows.filter(x=>!ctx.q(x)&&x.c>0).length,1);
 assert.deepEqual([...ctx.p([{...bar(),T:'SYN'},{...bar(),T:'syn'},{...bar(),T:'SYN.A'}]).T],['SYN','syn','SYN.A']);
});
