import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {sealResearch} from '../tools/seal-research-artifact.mjs';
import {recoverDirectory} from '../tools/recover-research-artifact.mjs';
import {spawnSync} from 'node:child_process';
const sha='7dd702d5d2ed3578f7558bc4f7fcc211f3619669';
test('installed isolated proof remains byte-for-byte the explicitly reviewed workflow',()=>{
 const installed=fs.readFileSync(new URL('../.github/workflows/phase-a-key-proof.yml',import.meta.url));
 const reviewed=fs.readFileSync(new URL('../docs/validation/key-recovery-proof.yml.proposed',import.meta.url));
 assert.deepEqual(installed,reviewed);
 assert.equal(createHash('sha1').update(Buffer.from('blob '+installed.length+'\0')).update(installed).digest('hex'),'33f11cb8cf2cd7363e13603e20febfcb30148658');
 assert.equal(fs.existsSync(new URL('../.github/workflows/premarket-research-validation.yml',import.meta.url)),false);
});
test('the reviewed non-sensitive challenge recovers offline without a market-session summary',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-key-challenge-'));try{
  const key='fixture-recovery-copy-only',marker='Stock2 Phase A recovery challenge v1',input=path.join(dir,'encrypted'),out=path.join(dir,'recovered');fs.mkdirSync(input);
  fs.writeFileSync(path.join(input,'key-check.txt.enc'),JSON.stringify(sealResearch(Buffer.from(marker),key,{sourceSha:sha,path:'key-check.txt'})));
  const r=recoverDirectory(input,out,key,sha);assert.equal(r.authenticated,true);assert.equal(r.files,1);assert.equal(fs.readFileSync(path.join(out,'key-check.txt'),'utf8'),marker);
  assert.equal(r.status,'AUTHENTICATED_INCOMPLETE'); // Expected: this is a challenge, not a collected market session.
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('offline key prompt never forwards legacy credentials or Node preloads to its child',()=>{
 const script=new URL('../tools/recover-research-artifact.py',import.meta.url).pathname;
 const code=`import os,sys,runpy,getpass,subprocess,types\nos.environ={'PATH':'fixture-bin','SystemRoot':'fixture-system','PRIVATE_KEY':'fixture-legacy-do-not-forward','NODE_OPTIONS':'--import unsafe-preload','UNRELATED_SECRET':'fixture-unrelated'}\nsys.stdin=types.SimpleNamespace(isatty=lambda:True)\nsys.argv=[${JSON.stringify(script)},'encrypted','new-output','${sha}']\ngetpass.getpass=lambda prompt:'fixture-research-copy'\ndef run(cmd,env):\n assert set(env)=={'PATH','SystemRoot','RESEARCH_ARTIFACT_KEY'}\n assert env['RESEARCH_ARTIFACT_KEY']=='fixture-research-copy'\n assert 'fixture-research-copy' not in cmd\n assert 'PRIVATE_KEY' not in env and 'NODE_OPTIONS' not in env\n return types.SimpleNamespace(returncode=0)\nsubprocess.run=run\ntry:runpy.run_path(${JSON.stringify(script)},run_name='__main__')\nexcept SystemExit as e:assert e.code==0\nprint('PASS isolated offline child')`;
 const r=spawnSync('python3',['-c',code],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/PASS isolated/);assert.doesNotMatch(r.stdout,/fixture-research-copy|fixture-legacy/);
});
