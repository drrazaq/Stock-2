import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {watcherContractProfile,copyFixtureModuleClosure} from './watcher-contract-profile.mjs';
test('test profiles reject a mistaken source rather than silently changing a coverage assertion',()=>{
 assert.equal(watcherContractProfile('configuredWindow:{open:570,endExclusive:901}').minutes,331);
 assert.equal(watcherContractProfile('configuredWindow:{open:570,endExclusive:SESSION.close}','development-full').minutes,390);
 assert.throws(()=>watcherContractProfile('configuredWindow:{open:570,endExclusive:901}','development-full'),/MISMATCH/);
 assert.throws(()=>watcherContractProfile('configuredWindow:{open:570,endExclusive:901}','guessed'),/UNKNOWN/);
});
test('fixture closure copies actual transitive bytes; rejects conflicting bytes and source symlinks',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'fixture-closure-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const src=path.join(dir,'src'),dest=path.join(dir,'dest');fs.mkdirSync(src);fs.mkdirSync(dest);
 fs.writeFileSync(path.join(src,'a.mjs'),"import {b} from './b.mjs';\n");fs.writeFileSync(path.join(src,'b.mjs'),'export const b=1;\n');
 assert.deepEqual(copyFixtureModuleClosure(src,dest,'a.mjs'),['a.mjs','b.mjs']);assert.deepEqual(fs.readFileSync(path.join(src,'b.mjs')),fs.readFileSync(path.join(dest,'b.mjs')));
 fs.writeFileSync(path.join(dest,'b.mjs'),'changed');assert.throws(()=>copyFixtureModuleClosure(src,dest,'a.mjs'),/CONFLICT/);
 fs.symlinkSync('b.mjs',path.join(src,'link.mjs'));assert.throws(()=>copyFixtureModuleClosure(src,dest,'link.mjs'),/SCOPE/);
});
