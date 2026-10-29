import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readAlertState,saveAlertState,deliverAlertOnce,alertAvailable} from '../alert-delivery-state.mjs';
test('ACK follows persisted intent; a process restart does not resend an acknowledged key',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-alert-')),file=path.join(dir,'state.json');try{
  const book=readAlertState(file,'2026-10-29');let calls=0;
  const r=await deliverAlertOnce({book,keys:['AAAstop'],save:()=>saveAlertState(file,book),send:async()=>{calls++;assert.equal(readAlertState(file,book.day).delivery.AAAstop.status,'PENDING');return {ok:true};}});assert.equal(r.ok,true);
  const recovered=readAlertState(file,book.day);assert.equal(recovered.sent.AAAstop,1);assert.equal(alertAvailable(recovered,'AAAstop'),false);
  await deliverAlertOnce({book:recovered,keys:['AAAstop'],save:()=>{},send:async()=>{calls++;}});assert.equal(calls,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('explicit refusal is retryable, while ambiguous/partial or server-error delivery stays unknown',async()=>{
 for(const result of [{ok:false,reason:'HTTP_403'},{ok:false,reason:'NETWORK_ERROR'},{ok:false,reason:'HTTP_503'},{ok:false,reason:'HTTP_429',deliveredParts:1}]){
  const book={day:'fixture',sent:{},delivery:{}};await deliverAlertOnce({book,keys:['key'],save:()=>{},send:async()=>result});
  assert.equal(book.sent.key,undefined);assert.equal(alertAvailable(book,'key'),result.reason==='HTTP_403');
 }
});
test('failed persistence blocks the network and malformed stored data never silently resets dedup',async()=>{
 let calls=0;const book={sent:{},delivery:{}};assert.equal((await deliverAlertOnce({book,keys:['key'],save:()=>{throw Error('disk');},send:async()=>{calls++;}})).reason,'INTENT_NOT_DURABLE');assert.equal(calls,0);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-alert-')),file=path.join(dir,'state.json');try{fs.writeFileSync(file,'{broken');assert.throws(()=>readAlertState(file,'2026-10-29'));assert.equal(fs.readFileSync(file,'utf8'),'{broken');}finally{fs.rmSync(dir,{recursive:true,force:true});}
});
