import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {V2_HOST_FILES} from '../sec-v2-host-binding.mjs';
test('HISTORY-03 radar counters remain inside the existing inactive worker dependency closure',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'history03-closure-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 for(const file of V2_HOST_FILES){const p=path.join(dir,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(new URL('../'+file,import.meta.url),p);}
 // Missing input must reach the guarded refusal. A missing imported module is an integration failure, not a safe refusal.
 const r=spawnSync(process.execPath,['tools/native-sec-v2-capture-worker.mjs'],{cwd:dir,env:{PATH:process.env.PATH},encoding:'utf8',timeout:10000});
 assert.equal(r.status,1);assert.equal(r.stdout.trim(),'V2_CAPTURE_BLOCKED');assert.doesNotMatch(r.stderr,/ERR_MODULE_NOT_FOUND|Cannot find module/);
});
