// Synthetic actual-caller display regression; existing warning entry block is preserved.
import test from 'node:test';import assert from 'node:assert/strict';
import {loadScan,blocked} from './load-scan.mjs';
const oldNow=Date.now;
test('Leader Dip warning remains blocked and visible without inventing a stop',async()=>{Date.now=()=>Date.parse('2026-11-13T12:00:00Z');try{
 const shared={'data/halal.json':{ZZA:{s:'ok',d:'2026-11-13',by:'synthetic'}},'data/squad11-today.json':{generatedAt:'2026-11-12T23:00:00Z',lastClose:'2026-11-12',methods:{'SQ11-PB12':{newSignals:[{sym:'ZZA',close:20,d:'2026-11-12'}]}}}};
 for(const threat of [{'data/events-study.json':{fam:{TEST:{warn:true,name:'SYNTHETIC warning',drift:{newer:{vs:-.02,n:40}}}}},'data/events-recent.json':{events:[{sym:'ZZA',f:'TEST',p:'2026-11-12T12:00:00Z'}]}},{'data/squad29-flags-today.json':{flags:[{sym:'ZZA',verdict:'SELL-WARNING',flag:'F6',filed:'2026-11-12',items:'3.01',url:'https://example.invalid/synthetic'}]}}]){
 const S=await loadScan({files:{...shared,...threat}}),text=S.fn('ldipLines')({}, {}, [], '2026-11-12').join('\n');assert.match(text,/NO BUY ZZA/);assert.match(text,/warning|DANGER/i);assert.doesNotMatch(text,/- BUY|Keep your stop firm/);assert.throws(()=>S.read('data/leaderdip-ledger.jsonl'));}
 const S=await loadScan({files:shared}),text=S.fn('ldipLines')({}, {}, [], '2026-11-12').join('\n');assert.match(text,/- BUY ZZA/);assert.equal(blocked.length,0);
}finally{Date.now=oldNow;}});
