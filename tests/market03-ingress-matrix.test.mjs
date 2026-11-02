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
