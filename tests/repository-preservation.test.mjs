import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {repositoryPolicy,verifyRepositoryChange} from '../repository-preservation.mjs';
const manifest=JSON.parse(fs.readFileSync(new URL('../docs/repository-ownership.json',import.meta.url),'utf8'));
const policy={ownerPaths:manifest.ownerPaths,frozenPaths:manifest.frozenRegistry.map(x=>x.path)};
const row=(path,letter='a',mode='100644')=>({path,blobSha:letter.repeat(40),mode});
test('authority map covers every baseline blob without pretending behavioral review',()=>{
 assert.equal(manifest.entries.length,manifest.counts.blobs);assert.equal(new Set(manifest.entries.map(x=>x.path)).size,manifest.entries.length);
 for(const e of manifest.entries)assert.equal(repositoryPolicy(e.path,policy),e.policy,e.path);
 assert.equal(manifest.counts.productionData,399);assert.equal(manifest.frozenRegistry.length,51);
 assert.match(manifest.scope,/not a claim/);
});
test('real Git tree metadata preserves all production and frozen baseline blobs without reading bodies',()=>{
 const r=spawnSync('git',['ls-tree','-r','-z','HEAD'],{encoding:'utf8',maxBuffer:4*1024*1024});assert.equal(r.status,0,r.stderr);
 const current=r.stdout.split('\0').filter(Boolean).map(x=>{const [header,path]=x.split('\t'),[mode,type,blobSha]=header.split(' ');return {path,mode,type,blobSha};}).filter(x=>x.type==='blob');
 const map=new Map(current.map(x=>[x.path,x]));
 // PR merge fixtures can contain authorized concurrent main data updates. Push CI
 // validates every protected branch blob; PR CI validates frozen study blobs.
 // Exact-source checkout is verified by the dedicated preservation CI job.
 // The ordinary PR merge checkout may legitimately have newer main data blobs.
 if(process.env.GITHUB_HEAD_REF&&process.env.STOCK2_EXACT_SOURCE_TREE!=='1'){assert.ok(current.every(x=>repositoryPolicy(x.path,policy)!=='INVALID_PATH'));return;}
 const protectedPolicies=['OWNER_PRIVATE_DATA','FROZEN_RESEARCH','PRODUCTION_DATA','OWNER_ACTIVATION','OWNER_SECURITY_CONFIGURATION'];
 for(const e of manifest.entries.filter(x=>protectedPolicies.includes(x.policy))){assert.equal(map.get(e.path)?.blobSha,e.blobSha,e.path);assert.equal(map.get(e.path)?.mode,e.mode,e.path);}
 for(const frozen of manifest.frozenRegistry)assert.equal(map.get(frozen.path)?.blobSha,frozen.sha,frozen.path);
 assert.ok(current.every(x=>repositoryPolicy(x.path,policy)!=='INVALID_PATH'));
});
test('only explicitly reviewed branch source changes pass',()=>{
 const baseline=[row('scan.mjs')],next=[row('scan.mjs','b')];
 assert.equal(verifyRepositoryChange({baseline,next,allowedPaths:['scan.mjs'],...policy}).status,'EXPLICIT_BRANCH_CHANGES_ONLY');
 assert.equal(verifyRepositoryChange({baseline,next,allowedPaths:[],...policy}).status,'BLOCKED');
});
test('allowlists cannot authorize owner-data, frozen-result or activation changes',()=>{
 for(const path of ['data/my-positions.json',manifest.frozenRegistry[0].path,'run-phase-a-keyproof-once.txt','.github/workflows/premarket-research-validation.yml','docs/validation/phase-a-2026-10-30.candidate.json']){
  assert.equal(verifyRepositoryChange({baseline:[row(path)],next:[row(path,'b')],allowedPaths:[path],...policy}).status,'BLOCKED',path);
 }
});
test('deletions and mode changes cannot bypass preserved-data checks',()=>{
 const baseline=[row('data/fixture-production.json')];
 assert.equal(verifyRepositoryChange({baseline,next:[],allowedPaths:['data/fixture-production.json'],...policy}).status,'BLOCKED');
 assert.equal(verifyRepositoryChange({baseline,next:[row('data/fixture-production.json','a','120000')],allowedPaths:['data/fixture-production.json'],...policy}).status,'BLOCKED');
});
test('invalid or duplicate tree entries fail closed',()=>{
 for(const next of [[row('../outside')],[row('/absolute')],[row('scan.mjs'),row('scan.mjs')],[{...row('scan.mjs'),blobSha:'wrong'}]]){
  assert.equal(verifyRepositoryChange({baseline:[],next,allowedPaths:['scan.mjs'],...policy}).status,'BLOCKED');
 }
 assert.equal(repositoryPolicy('a\\b'), 'INVALID_PATH');
});
test('new unreviewed source files remain blocked; known source additions require explicit review',()=>{
 const next=[row('new-engineering.mjs')];
 assert.equal(verifyRepositoryChange({baseline:[],next,allowedPaths:[],...policy}).status,'BLOCKED');
 assert.equal(verifyRepositoryChange({baseline:[],next,allowedPaths:['new-engineering.mjs'],...policy}).status,'EXPLICIT_BRANCH_CHANGES_ONLY');
 assert.equal(repositoryPolicy('unknown-format.asset'),'MANUAL_REVIEW');
});
