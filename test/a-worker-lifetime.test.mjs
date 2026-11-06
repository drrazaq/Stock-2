// Synthetic only: exercise the actual store worker's unchanged15s bound, lock and explicit recovery.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
test('stopped actual writer is killed within its existing bound; intent/loss/lock survive explicit recovery',t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'a-worker-bound-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const result=spawnSync('python3',[fileURLToPath(new URL('./helper-a-worker-lifetime.py',import.meta.url)),root,process.execPath,dir],{encoding:'utf8',timeout:35000,maxBuffer:1024*1024});
 assert.equal(result.error,undefined,result.error?.message);assert.equal(result.status,0,result.stderr+result.stdout);
 const value=JSON.parse(result.stdout);assert.equal(value.parentTimedOut,false);assert.equal(value.sawStoppedWorker,true);assert.equal(value.lockWhileStopped,73);assert.equal(value.liveWorkerAfterParent,false);
 const r=value.result;assert.equal(r.status,'SYNTHETIC_TIMEOUT_RECOVERY_VERIFIED');assert.equal(r.error,'WRITE_OUTCOME_UNKNOWN');assert.equal(r.cause.errorCode,'ETIMEDOUT');assert.equal(r.cause.signal,'SIGKILL');
 assert.ok(r.elapsedMs>=14500&&r.elapsedMs<22000,JSON.stringify(r));assert.equal(r.pendingBeforeRecovery,1);assert.equal(r.pendingAfterRecovery,0);assert.equal(r.lossUsd,-42);assert.equal(r.idempotent,true);assert.equal(r.commitCount,1);assert.equal(r.originalBytesPreserved,true);assert.equal(r.lockIdentityPreserved,true);
});
