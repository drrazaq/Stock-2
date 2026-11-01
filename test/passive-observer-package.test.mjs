import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..'),read=p=>fs.readFileSync(path.join(root,p)),hash=b=>createHash('sha256').update(b).digest('hex');
test('exact runtime patch applies to pinned production source and yields all reviewed hashes; activation stays separate',t=>{
 const m=JSON.parse(read('docs/validation/passive-contract-observer-manifest.json')),saved=JSON.parse(read('docs/validation/observer-baseline-source.json')),dir=fs.mkdtempSync(path.join(os.tmpdir(),'observer-patch-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const git=(...args)=>{const x=spawnSync('git',args,{cwd:dir,encoding:'utf8',env:{PATH:process.env.PATH}});assert.equal(x.status,0,x.stderr);};
 git('init','-q');for(const [name,source]of Object.entries(saved.files))fs.writeFileSync(path.join(dir,name),source);
 const runtime=path.join(root,'docs/validation/passive-contract-observer-runtime.patch');assert.equal(hash(fs.readFileSync(runtime)),m.runtimePatchSha256);
 git('apply','--check',runtime);git('apply',runtime);for(const [name,digest]of Object.entries(m.runtimeFiles))assert.equal(hash(fs.readFileSync(path.join(dir,name))),digest,name);
 assert.equal(hash(fs.readFileSync(path.join(dir,'market-data-contracts.mjs'))),'269626fa8da5c2a12234a0baf028b560bb7838f468a9e52a428208574a091cbe');
 const testsPatch=path.join(root,'docs/validation/passive-contract-observer-tests.patch');assert.equal(hash(fs.readFileSync(testsPatch)),m.testsPatchSha256);git('apply','--check',testsPatch);git('apply',testsPatch);for(const file of ['test/watcher-contract-observer.test.mjs','test/watcher-contract-parity.test.mjs','test/passive-observer-package.test.mjs','test/market-data-contracts.test.mjs'])assert.ok(fs.readFileSync(path.join(dir,file)).equals(read(file)),file);
 fs.mkdirSync(path.join(dir,'.github/workflows'),{recursive:true});fs.writeFileSync(path.join(dir,'.github/workflows/ignition.yml'),read('.github/workflows/ignition.yml'));
 const activation=path.join(root,'docs/validation/passive-contract-observer-activation.patch.proposed');assert.equal(hash(fs.readFileSync(activation)),m.activationPatchSha256);git('apply','--check',activation);
 assert.doesNotMatch(read('.github/workflows/ignition.yml').toString(),/CONTRACT_OBSERVER:/);assert.equal(m.activationApproved,false);
});
