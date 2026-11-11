// MARKET-03 ingress matrix drift guard (Claude, 2 Nov 2026): every provider host a source file can call is classified, and the
// committed matrix equals what the sources produce now. A new provider call fails here until it is classified and reviewed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {buildMatrix,CONTRACTS} from '../tools/market03-ingress-matrix.mjs';
const root=path.resolve(import.meta.dirname,'..');
test('no provider host is unclassified', () => { assert.deepEqual(buildMatrix(root).summary.unclassified,[]); });
test('the committed matrix matches the current sources', () => {
 const committed=JSON.parse(fs.readFileSync(path.join(root,'docs/validation/market03-ingress-matrix.json'),'utf8'));
 assert.deepEqual(buildMatrix(root),committed,'run: node tools/market03-ingress-matrix.mjs --write, and review the change');
});
test('every reviewed contract names its package and uses the Y/P/N/NA scale', () => {
 for(const [k,c] of Object.entries(CONTRACTS)){assert.ok(c.by,k);for(const d of ['identity','units','clock','session','adjustment','revision','status'])assert.ok(['Y','P','N','NA'].includes(c[d]),k+' '+d);}
});
test('inactive A adapters are explicit partial contracts, never frozen-input or deployed capability claims',()=>{
 for(const file of ['a-authenticated-collector.mjs','a-sip-window-client.mjs']){const rows=buildMatrix(root).pairs.filter(p=>p.file===file&&p.kind==='PROVIDER');assert.equal(rows.length,1);assert.equal(rows[0].role,'INACTIVE_RESEARCH_ADAPTER');assert.equal(rows[0].contract.identity,'P');assert.equal(rows[0].contract.units,'P');}
 assert.equal(buildMatrix(root).pairs.find(p=>p.file==='a-sip-window-client.mjs'&&p.host==='docs.alpaca.markets').kind,'REFERENCE_ONLY');
});

test('instrument exclusion citations are reference-only, not acquisition endpoints',()=>{
 const rows=buildMatrix(root).pairs.filter(p=>p.file==='instrument-type.mjs');assert.equal(rows.length,5);assert.ok(rows.every(p=>p.kind==='REFERENCE_ONLY'));
});
