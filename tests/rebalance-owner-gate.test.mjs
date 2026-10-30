import test from 'node:test';
import assert from 'node:assert/strict';
import {loadScan} from '../test/load-scan.mjs';
const day=new Date().toISOString().slice(0,10),yes={s:'ok',d:day,by:'ZAD (you)'};
async function fixture(marks,list={notHalal:[]}){
 const positions={AAA:{entry:10,stop:5},BBB:{entry:10,stop:5}};
 const S=await loadScan({env:{PRIVATE_KEY:'disposable-fixture-only-not-owner-key'},files:{'data/my-positions.json':positions,'data/halal.json':marks,'data/zad-list.json':list}});
 assert.equal(S.fn('privWrite')({shares:{AAA:10,BBB:1000},buys:[],budget:50000}),true);
 return {S,positions:S.read('data/my-positions.json'),marks:S.read('data/halal.json'),render:stocks=>S.fn('rebalanceText')({stocks})};
}
test('underweight profitable holding cannot receive ADD with missing/stale/rejected/third-party ZAD',async()=>{
 for(const mark of [undefined,{s:'fail',d:day},{s:'ok',d:'2020-01-01'},{s:'ok',d:'2099-01-01'},{s:'ok',d:'bad'},{s:'ok',d:day,by:'Zoya'}]){
  const f=await fixture(mark?{AAA:mark}:{}),text=f.render([{sym:'AAA',last:11},{sym:'BBB',last:10}]);assert.doesNotMatch(text,/AAA: ADD/);assert.match(text,/NO ADD APPROVAL: AAA/);assert.equal(f.S.read('data/my-positions.json'),f.positions);assert.equal(f.S.read('data/halal.json'),f.marks);
 }
});
test('current owner yes permits existing allocation logic; quarterly exclusion and malformed list block',async()=>{
 const f=await fixture({AAA:yes}),text=f.render([{sym:'AAA',last:11},{sym:'BBB',last:10}]);assert.match(text,/AAA: ADD up to/);
 for(const list of [{notHalal:['AAA']},{notHalal:'AAA'},null]){const x=await fixture({AAA:yes},list);assert.doesNotMatch(x.render([{sym:'AAA',last:11},{sym:'BBB',last:10}]),/AAA: ADD/);}
});
test('an old recorded entry cannot stand in for an available finite recent price',async()=>{
 for(const last of [undefined,'11',Infinity,NaN]){const f=await fixture({AAA:yes}),text=f.render([{sym:'AAA',last},{sym:'BBB',last:10}]);assert.doesNotMatch(text,/AAA: ADD/);}
});
