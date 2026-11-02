// INACTIVE, offline review companion. No production caller imports this module.
// PASS covers new staged writes only; it is never cutover approval or proof that history is private.
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const reasons=new Set(['STAGING_CLEAN','PRIVATE_PATH_STAGED','UNREVIEWED_DATA_WRITE','UNREVIEWED_DATA_REMOVAL','SYMLINK_STAGED','INDEX_UNREADABLE']);
export function assessPublicStaging(root,{privatePaths=[],reviewedPublicPaths=[]}={}){
 const verdict=(status,reason)=>({status,reason,scope:'NEW_STAGED_WRITES_ONLY_HISTORY_UNCHANGED'});
 const canonical=p=>typeof p==='string'&&/^data\/[A-Za-z0-9_.-]+$/.test(p);
 if(!privatePaths.every(canonical)||!reviewedPublicPaths.every(canonical)||privatePaths.some(p=>reviewedPublicPaths.includes(p)))return verdict('ERROR','INDEX_UNREADABLE');
 try{
  const options={cwd:root,encoding:'utf8',timeout:5000,maxBuffer:1024*1024,stdio:['ignore','pipe','pipe'],env:{PATH:process.env.PATH,GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'}};
  const entries=execFileSync('git',['-c','core.fsmonitor=false','diff','--no-ext-diff','--no-textconv','--no-renames','--cached','--name-status','-z'],options).split('\0').filter(Boolean);
  if(entries.length%2)return verdict('ERROR','INDEX_UNREADABLE');
  const changed=[];for(let i=0;i<entries.length;i+=2)changed.push({status:entries[i],path:entries[i+1]});
  const index=execFileSync('git',['-c','core.fsmonitor=false','ls-files','--stage','-z'],options).split('\0').filter(Boolean);
  const modes=new Map(index.map(line=>{const a=line.indexOf('\t');return [line.slice(a+1),line.slice(0,6)];}));
  for(const change of changed){const p=change.path;if(p==='data'||p.startsWith('data/')){
   if(modes.get(p)==='120000')return verdict('BLOCKED','SYMLINK_STAGED');
   if(privatePaths.includes(p))return verdict('BLOCKED','PRIVATE_PATH_STAGED');
   if(change.status==='D')return verdict('BLOCKED','UNREVIEWED_DATA_REMOVAL');
   if(!reviewedPublicPaths.includes(p))return verdict('BLOCKED','UNREVIEWED_DATA_WRITE');
  }}
  return verdict('PASS','STAGING_CLEAN');
 }catch{return verdict('ERROR','INDEX_UNREADABLE');}
}
export function resultLine(result){const expected={PASS:['STAGING_CLEAN'],BLOCKED:['PRIVATE_PATH_STAGED','UNREVIEWED_DATA_WRITE','UNREVIEWED_DATA_REMOVAL','SYMLINK_STAGED'],ERROR:['INDEX_UNREADABLE']};if(!result||!reasons.has(result.reason)||!expected[result.status]?.includes(result.reason))return {text:'ERROR:INDEX_UNREADABLE',exit:2};return {text:result.status+':'+result.reason,exit:result.status==='PASS'?0:result.status==='BLOCKED'?1:2};}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const root=path.resolve(process.argv[2]||'.');
 // Exact private names must come from the reviewed cutover manifest. Default refuses ALL data writes.
 const result=resultLine(assessPublicStaging(root));process.stdout.write(result.text+'\n');process.exitCode=result.exit;
}
