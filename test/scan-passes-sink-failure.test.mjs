// Codex failure-path repro (PR #1 comment 6850735938), verbatim except the orchestrator source path (this tree's scan-passes.mjs).
// It FAILED on e06fef45 (private values reached the public models.json when the private stdout sink could not be written).
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
const SRC = process.env.SCAN_PASSES_REVIEW_SOURCE || path.resolve(import.meta.dirname, '..', 'scan-passes.mjs');
test('failure to retain private stdout never leaves private values in a public data path',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scan-export-review-'));
 try{
  fs.mkdirSync(path.join(root,'.github'));fs.mkdirSync(path.join(root,'data'));fs.writeFileSync(path.join(root,'.github/private-files.txt'),'signals-private.json\n');
  fs.copyFileSync(SRC,path.join(root,'scan-passes.mjs'));
  fs.writeFileSync(path.join(root,'data/models.json'),JSON.stringify({PUBLIC_BASE:true}));
  fs.mkdirSync(path.join(root,'data/private-scan-stdout.log'));
  fs.writeFileSync(path.join(root,'scan.mjs'),`import fs from 'node:fs';if(process.env.SCAN_PASS==='public'){fs.writeFileSync('data/signals.json',JSON.stringify({session:'2026-11-12',generatedAt:'2026-11-13T10:00:00.000Z'}));console.log('public');}else{fs.writeFileSync('data/models.json',JSON.stringify({PRIVATE_ONLY_SYNTHETIC:true}));console.log('private');}`);
  const result=spawnSync(process.execPath,['scan-passes.mjs'],{cwd:root,env:{PATH:process.env.PATH},encoding:'utf8'});
  assert.notEqual(result.status,0,'synthetic private sink failure is visible');
  const after=fs.readFileSync(path.join(root,'data/models.json'),'utf8');
  assert.doesNotMatch(after,/PRIVATE_ONLY_SYNTHETIC/,'a failed private phase must never contaminate a publishable filename');
  // added (Claude): private state stays recoverable after the sink failure
  assert.match(fs.readFileSync(path.join(root,'data/private-models.json'),'utf8'),/PRIVATE_ONLY_SYNTHETIC/,'private result kept privately');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
