// Exact actual producer expressions, synthetic marks only; never runs a lab or fetches data.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../squad11-lab.mjs',import.meta.url),'utf8');
const definition=source.split('\n').find(l=>/^const (?:HAL|ZBAD) =/.test(l)&&l.includes('halal ='));
function labels(privateMark,publicBad=[]){const reads=[],J=(p,d)=>{reads.push(p);return p==='data/halal.json'?{ZZA:{s:privateMark}}:p==='data/zad-list.json'?{notHalal:publicBad}:d;};const fn=vm.runInNewContext(definition+'\nhalal',{J});return {value:fn('ZZA'),reads};}
test('public publisher label is independent of private owner marks and preserves public exclusions',()=>{
 for(const mark of ['ok','fail']){const out=labels(mark);assert.equal(out.value,'unknown');assert.ok(!out.reads.includes('data/halal.json'));}
 assert.equal(labels('ok',['ZZA']).value,'fail');assert.doesNotMatch(source,/data\/halal\.json/);
});
test('actual public board keeps all-case statistics but does not publish a private marked subset',()=>{
 const line=source.split('\n').find(l=>l.trimStart().startsWith('board[id] = {')),board={},st={n:17,avg:-.01};
 vm.runInNewContext(line,{board,id:'SYNTHETIC',RULES:{SYNTHETIC:{name:'SYNTHETIC',hold:126}},mine:[],TR:{SYNTHETIC:[]},fromT:0,st,fr:null,closed:[{halal:'ok'}],boardStats:()=>{throw Error('private subset aggregation must not be exported');},paperReady:()=>false});
 assert.equal(board.SYNTHETIC.closed,st);assert.equal(board.SYNTHETIC.halalOk.n,null);assert.equal(board.SYNTHETIC.halalOk.state,'PRIVATE_OWNER_MARKS_NOT_EXPORTED');
});
