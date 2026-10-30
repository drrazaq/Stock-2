import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sealResearch,openResearch,sealDirectory} from '../tools/seal-research-artifact.mjs';
const key='fixture-key-never-real',sha='a'.repeat(40);
test('authenticated artifacts roundtrip, use random nonces, and reject modified scope/key/ciphertext',()=>{
 const body=Buffer.from('fixture quotes'),a=sealResearch(body,key,{sourceSha:sha,path:'fixture'}),b=sealResearch(body,key,{sourceSha:sha,path:'fixture'});
 assert.deepEqual(openResearch(a,key),body);assert.notEqual(a.iv,b.iv);assert.throws(()=>openResearch(a,'another-fixture-secret'));
 assert.throws(()=>openResearch({...a,context:{sourceSha:'b'.repeat(40),path:'fixture'}},key));
 assert.throws(()=>openResearch({...a,ciphertext:Buffer.from('tampered').toString('base64')},key));
});
test('sealing writes only encrypted copies, leaves source untouched and refuses symlinks/budgets',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-seal-'));try{
  const input=path.join(dir,'input');fs.mkdirSync(input);fs.writeFileSync(path.join(input,'fixture.json'),'fixture plaintext');
  const out=path.join(dir,'sealed'),r=sealDirectory(input,out,key,sha);assert.equal(r.files,1);assert.equal(r.plaintextUploaded,false);
  const encoded=fs.readFileSync(path.join(out,'fixture.json.enc'),'utf8');assert.doesNotMatch(encoded,/fixture plaintext/);assert.equal(openResearch(JSON.parse(encoded),key).toString(),'fixture plaintext');assert.equal(fs.readFileSync(path.join(input,'fixture.json'),'utf8'),'fixture plaintext');
  assert.throws(()=>sealDirectory(input,path.join(dir,'small'),key,sha,1),/BUDGET/);
  fs.symlinkSync(path.join(input,'fixture.json'),path.join(input,'linked'));assert.throws(()=>sealDirectory(input,path.join(dir,'links'),key,sha),/SYMLINK/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
