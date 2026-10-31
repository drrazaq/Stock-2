// Synthetic actual ingress; no provider requests or live credentials.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {alpacaSnapshot} from '../snapshot-fields.mjs';
import {marketSymbol} from '../market-symbol.mjs';
test('actual watcher alpacaAll keeps literal classes and refuses invented calendar clocks across all fields',async()=>{
 const source=fs.readFileSync(new URL('../ignition-watch.mjs',import.meta.url),'utf8'),body=source.slice(source.indexOf('async function alpacaAll('),source.indexOf('async function snap()'));
 const bad='2026-02-30T14:30:00Z',good='2026-11-02T09:30:00-05:00';let calls=0;
 const payload={'BRK.B':{latestTrade:{p:10,t:bad},latestQuote:{bp:9,ap:11,t:bad},dailyBar:{v:100,t:bad}},'BRK-B':{latestTrade:{p:12,t:good},latestQuote:{bp:11,ap:13,t:good},dailyBar:{v:200,t:good}}};
 const caller=Function('snapshots','snapshotFeed','marketSymbol','alpacaSnapshot','env','ALPD','AH','request','note',body+';return alpacaAll;')(async(_base,symbols)=>{calls++;assert.deepEqual(symbols,['BRK.B','BRK-B']);return payload;},()=> 'sip',marketSymbol,alpacaSnapshot,{ALPACA_KEY:'synthetic',ALPACA_SECRET:'synthetic'},'https://fixture.invalid',()=>({}),()=>{throw Error('NO_NETWORK_AUTHORIZED');},'');
 const rows=await caller(['BRK.B','BRK-B']);assert.equal(calls,1);assert.equal(rows.size,2);assert.equal(rows.get('BRK.B').t,0);assert.equal(rows.get('BRK.B').qt,0);assert.equal(rows.get('BRK.B').vt,0);assert.equal(rows.get('BRK-B').t,Date.parse('2026-11-02T14:30:00Z'));assert.equal(rows.get('BRK-B').qt,rows.get('BRK-B').t);assert.equal(rows.get('BRK-B').vt,rows.get('BRK-B').t);
});
