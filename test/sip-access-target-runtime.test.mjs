// Verification only: use an already provisioned exact runtime; never download/install dependencies.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),manifest=JSON.parse(fs.readFileSync(new URL('docs/validation/sip-access-diagnostic-manifest.json',root)));
const executable='/opt/hostedtoolcache/node/22.22.0/x64/bin/node';
test('exact proposed Node22.22 runtime executes reviewed synthetic runner/client/wrapper suite',t=>{
 for(const [name,digest]of Object.entries(manifest.sourceHashes))assert.equal(createHash('sha256').update(fs.readFileSync(new URL(name,root))).digest('hex'),digest,name);
 if(!fs.existsSync(executable)){t.skip('TARGET_NODE_22_22_NOT_PROVISIONED; no installation or network attempt');return;}
 const version=spawnSync(executable,['--version'],{encoding:'utf8',timeout:3000});assert.equal(version.status,0);assert.equal(version.stdout.trim(),'v22.22.0');
 const files=['test/sip-access-diagnostic.test.mjs','test/sip-access-corrections.test.mjs','test/sip-access-workflow.test.mjs','test/sip-access-package.test.mjs'];
 const r=spawnSync(executable,['--test',...files],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
 assert.equal(r.status,0,r.error?.message||r.stderr+r.stdout);assert.match(r.stdout,/# fail 0/);assert.match(r.stdout,/# tests 24/);assert.doesNotMatch(r.stdout,/# skip(?:ped)? [1-9]/);
 console.log('TARGET_NODE_22_22_SYNTHETIC_24_PASS');
});
