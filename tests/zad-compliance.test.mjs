import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {zadApproved} from '../zad-compliance.mjs';
test('only explicit owner ZAD yes is eligible; exclusion takes precedence',()=>{
 const marks={YES:{s:'ok'},NO:{s:'fail'},MAYBE:{s:'unknown'}};
 assert.equal(zadApproved('YES',marks,new Set()),true);
 for(const sym of ['NO','MAYBE','MISSING','toString'])assert.equal(zadApproved(sym,marks,new Set()),false);
 assert.equal(zadApproved('YES',marks,new Set(['YES'])),false);
 for(const marks of [null,{}, {YES:{status:'halal'}}])assert.equal(zadApproved('YES',marks,new Set()),false);
 assert.equal(zadApproved('YES',{YES:{s:'ok'}},null),false);
});
test('watcher gates approved wording before quote check and Telegram send',()=>{
 const s=fs.readFileSync(new URL('../ignition-watch.mjs',import.meta.url),'utf8');
 const body=s.slice(s.indexOf('async function maybeAlert'),s.indexOf('// ---- pre-market record'));
 assert.match(body,/if \(!early && !zadApproved\(r.sym, halal, zadNot\)\).*ZAD_NOT_CONFIRMED.*return;/);
 assert.ok(body.indexOf('ZAD_NOT_CONFIRMED')<body.indexOf('approvedQuoteGate('));
 assert.ok(body.indexOf('ZAD_NOT_CONFIRMED')<body.indexOf('await tg('));
});
test('watcher outcome ledger is included in durable workflow save list',()=>{
 const s=fs.readFileSync(new URL('../.github/workflows/ignition.yml',import.meta.url),'utf8');
 assert.match(s,/for f in [^\n]*data\/pre-ignition-days\.jsonl[^\n]*git add/);
});
