// Exact private-route identity: local Git config only; no remote/network operation.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {guardPublicSave} from '../.github/save-privacy-guard.mjs';
test('a private-role flag can never authorize the known public Stock-2 origin',()=>{
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'private-origin-'));try{
  const git=(...a)=>execFileSync('git',a,{cwd,stdio:['ignore','pipe','pipe']});git('init','-q','-b','main');git('remote','add','origin','https://github.com/drrazaq/Stock-2.git');
  for(const url of ['https://github.com/drrazaq/Stock-2.git','https://github.com:443/drrazaq/Stock-2.git','ssh://git@github.com:22/drrazaq/Stock-2.git','git@github.com:drrazaq/Stock-2.git','https://github.com/drrazaq/STOCK-2.GIT/']){
   git('remote','set-url','origin',url);assert.throws(()=>guardPublicSave({cwd,phase:'assert',env:{SAVE_PRIVATE_REPO:'1',SAVE_PRIVATE_EXPECTED_ORIGIN:url}}),/PRIVATE_SAVE_PUBLIC_ORIGIN_FORBIDDEN/);
  }
 }finally{fs.rmSync(cwd,{recursive:true,force:true});}
});
