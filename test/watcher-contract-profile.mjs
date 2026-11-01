// Test-only source selection: deployed15:00 and development full-session are distinct contracts.
// This does not configure a watcher, infer real coverage or authorize a deployment.
export function watcherContractProfile(source,profile='production-15'){
 if(!['production-15','development-full'].includes(profile)||typeof source!=='string')throw Error('WATCHER_TEST_PROFILE_UNKNOWN');
 const expected=profile==='production-15'?/configuredWindow:\s*\{open:570,endExclusive:901\}/:/configuredWindow:\s*\{open:570,endExclusive:SESSION\.close\}/;
 if(!expected.test(source))throw Error('WATCHER_TEST_PROFILE_SOURCE_MISMATCH');
 return {profile,open:570,endExclusive:profile==='production-15'?901:960,minutes:profile==='production-15'?331:390};
}
import fs from 'node:fs';import path from 'node:path';
export function copyFixtureModuleClosure(root,destination,entry){
 const base=path.resolve(root),seen=new Set();
 const copy=file=>{const rel=path.relative(base,file);if(rel.startsWith('..'+path.sep)||path.isAbsolute(rel)||fs.lstatSync(file).isSymbolicLink())throw Error('FIXTURE_MODULE_SCOPE');if(seen.has(file))return;seen.add(file);const bytes=fs.readFileSync(file),target=path.join(destination,rel);fs.mkdirSync(path.dirname(target),{recursive:true});if(fs.existsSync(target)){if(!fs.readFileSync(target).equals(bytes))throw Error('FIXTURE_MODULE_CONFLICT');}else fs.writeFileSync(target,bytes,{flag:'wx'});for(const m of bytes.toString().matchAll(/\b(?:from\s*|import\s*)['"](\.[^'"]+\.mjs)['"]/g))copy(path.resolve(path.dirname(file),m[1]));};
 copy(path.resolve(base,entry));return [...seen].map(p=>path.relative(base,p)).sort();
}
