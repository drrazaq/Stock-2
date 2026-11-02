// Actual scan module loader; different synthetic source versions must never share a cached CJS module.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {loadScan} from './load-scan.mjs';
test('two actual scanner loads in the same clock tick keep their own logic bytes',async()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),clock=Date.now;Date.now=()=>1762000000000+process.pid;
 const source=tag=>html.replace(/(<script id="logic">[\s\S]*?)(<\/script>)/,(_,body,end)=>body+'\n;module.exports.__syntheticVersion='+JSON.stringify(tag)+';\n'+end);
 try{const a=await loadScan({files:{'index.html':source('SYNTHETIC_A')}}),b=await loadScan({files:{'index.html':source('SYNTHETIC_B')}});assert.equal(a.value('L').__syntheticVersion,'SYNTHETIC_A');assert.equal(b.value('L').__syntheticVersion,'SYNTHETIC_B');}finally{Date.now=clock;}
});
