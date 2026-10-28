import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedQuoteGate} from '../approved-quote-gate.mjs';
const q={price:3,bid:2.99,ask:3.01,quoteAgeSec:30};
test('fresh valid quote passes without approving a strategy',()=>{const v=approvedQuoteGate(q);assert.equal(v.ok,true);assert.ok(v.spreadPct<0.03)});
test('missing, future and stale quotes block live BUY messages',()=>{
  for(const o of [{bid:0},{bid:NaN},{ask:Infinity},{ask:2.5},{quoteAgeSec:null},{quoteAgeSec:-1},{quoteAgeSec:121}]) assert.equal(approvedQuoteGate({...q,...o}).ok,false);
});
test('wide spread blocks even a price that moved dramatically',()=>{
  const x=approvedQuoteGate({price:3,bid:2.9,ask:3.1,quoteAgeSec:1});assert.equal(x.reason,'SPREAD_TOO_WIDE');
  assert.equal(approvedQuoteGate({price:10,bid:9.85,ask:10.15,quoteAgeSec:1}).reason,'SPREAD_TOO_WIDE');
});
test('under-dollar quotes are not approved',()=>assert.equal(approvedQuoteGate({price:0.5,bid:0.49,ask:0.51,quoteAgeSec:1}).ok,false));
