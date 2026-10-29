import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import {sealDirectory} from '../tools/seal-research-artifact.mjs';
import {recoverDirectory} from '../tools/recover-research-artifact.mjs';
const key='fixture-key-never-real',sha='7dd702d5d2ed3578f7558bc4f7fcc211f3619669';
function fixture(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'s2-recovery-')),raw=path.join(dir,'raw'),sealed=path.join(dir,'sealed');fs.mkdirSync(path.join(raw,'123-1'),{recursive:true});fs.writeFileSync(path.join(raw,'123-1/000.json.gz'),zlib.gzipSync(JSON.stringify({kind:'RESEARCH_ONLY',claims:{orders:false,approvedBuy:false}})));fs.writeFileSync(path.join(raw,'123-1/summary.json'),JSON.stringify({sourceSha:sha,cycles:1,executionWindowComplete:false}));sealDirectory(raw,sealed,key,sha);return {dir,raw,sealed};}
test('offline recovery authenticates pinned files and explicitly reports a partial session',()=>{
 const f=fixture();try{const out=path.join(f.dir,'recovered'),r=recoverDirectory(f.sealed,out,key,sha);assert.equal(r.authenticated,true);assert.equal(r.status,'AUTHENTICATED_INCOMPLETE');assert.equal(r.summaries[0].cycles,1);assert.deepEqual(fs.readFileSync(path.join(out,'123-1/000.json.gz')),fs.readFileSync(path.join(f.raw,'123-1/000.json.gz')));assert.throws(()=>recoverDirectory(f.sealed,out,key,sha),/ALREADY_EXISTS/);}finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('wrong keys, tampering, scope mismatch and symlinks create no plaintext output',()=>{
 const f=fixture();try{const out=path.join(f.dir,'recovered');assert.throws(()=>recoverDirectory(f.sealed,out,'incorrect-fixture-key',sha));assert.equal(fs.existsSync(out),false);assert.throws(()=>recoverDirectory(f.sealed,out,key,'b'.repeat(40)),/SCOPE/);const file=path.join(f.sealed,'123-1/000.json.gz.enc'),e=JSON.parse(fs.readFileSync(file));e.tag=Buffer.alloc(16).toString('base64');fs.writeFileSync(file,JSON.stringify(e));assert.throws(()=>recoverDirectory(f.sealed,out,key,sha));assert.equal(fs.existsSync(out),false);fs.symlinkSync(file,path.join(f.sealed,'link.enc'));assert.throws(()=>recoverDirectory(f.sealed,out,key,sha));}finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
test('missing encrypted cycles cannot be silently called a complete recovered session',()=>{
 const f=fixture();try{fs.unlinkSync(path.join(f.sealed,'123-1/000.json.gz.enc'));const r=recoverDirectory(f.sealed,path.join(f.dir,'recovered'),key,sha);assert.equal(r.status,'AUTHENTICATED_INCOMPLETE');assert.ok(r.summaries[0].problems.includes('MISSING_OR_EXTRA_CYCLE_FILES'));}finally{fs.rmSync(f.dir,{recursive:true,force:true});}
});
