// Shared save boundary. Public-role checks use path/commit metadata and never print owner payloads.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const refuse=code=>{throw Error(code);};
function git(cwd,...args){try{return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch{refuse('PUBLIC_SAVE_GIT_METADATA_UNAVAILABLE');}}
const nul=s=>s.split('\0').filter(Boolean);
const PRIVATE_DIRECTORIES=new Set(['shadow','ignition-runs','shadow-outcomes']);
function privatePaths(file){let raw;try{raw=fs.readFileSync(file,'utf8');}catch{refuse('PUBLIC_SAVE_PRIVATE_MANIFEST_UNAVAILABLE');}
 const names=raw.split('\n').map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
 const entries=names.map(x=>({name:x.endsWith('/')?x.slice(0,-1):x,dir:x.endsWith('/')}));
 if(!entries.length||entries.some(({name,dir})=>!/^[-a-zA-Z0-9._/]+$/.test(name)||name.startsWith('/')||name.split('/').some(p=>p==='.'||p==='..'||!p)||
   (dir?!PRIVATE_DIRECTORIES.has(name):PRIVATE_DIRECTORIES.has(name))))refuse('PUBLIC_SAVE_PRIVATE_MANIFEST_INVALID');
 // Git exclusions use the directory root without a slash, protecting a root symlink/file too. Metadata checks cover every descendant,
 // including reverted/merged outgoing history; the helper that copies directory bytes separately rejects physical symlinks.
 const paths=entries.map(x=>'data/'+x.name),listed=new Set(paths),prefixes=entries.filter(x=>x.dir).map(x=>'data/'+x.name+'/');
 return {paths,isPrivate:p=>listed.has(p)||prefixes.some(prefix=>p.startsWith(prefix))||p.startsWith('data/private-')};}
function isKnownPublicOrigin(raw){
 let host='',repo='';try{if(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)){const u=new URL(raw);host=u.hostname;repo=u.pathname;}else{const m=raw.match(/^(?:[^@]+@)?([^:/]+):(.+)$/);if(m){host=m[1];repo=m[2];}}}catch{return false;}
 return host.toLowerCase()==='github.com'&&repo.replace(/^\/+|\/+$/g,'').replace(/\.git$/i,'').toLowerCase()==='drrazaq/stock-2';
}
function privateRole(cwd,env,target){
 const origin=git(cwd,'remote','get-url','origin').trim();
 if(env.SAVE_PRIVATE_REPO!=='1')return false;
 const expected=env.SAVE_PRIVATE_EXPECTED_ORIGIN;
 if([origin,expected,target].some(x=>typeof x==='string'&&isKnownPublicOrigin(x)))refuse('PRIVATE_SAVE_PUBLIC_ORIGIN_FORBIDDEN');
 if(!expected||origin.trim()!==expected.trim()||(target!==undefined&&target.trim()!==expected.trim()))refuse('PRIVATE_SAVE_EXACT_ORIGIN_REQUIRED');
 return true;
}
function auditOutgoing(cwd,base,head,isPrivate){
 const commits=git(cwd,'rev-list','--topo-order',base+'..'+head).trim().split('\n').filter(Boolean);
 for(const c of commits){if(!/^[a-f0-9]{40}$/.test(c))refuse('PUBLIC_SAVE_COMMIT_ID_INVALID');
  const paths=nul(git(cwd,'diff-tree','--root','-m','--no-commit-id','-r','--name-only','--no-renames','--diff-filter=ACDMRTUXB','-z',c,'--','data'));
  if(paths.some(isPrivate))refuse('PUBLIC_SAVE_PRIVATE_HISTORY_OUTGOING');}
 return commits.length;
}
export function guardPublicSave({cwd=process.cwd(),manifest=path.join(cwd,'.github/private-files.txt'),phase='prepare',remoteRef='origin/main',env=process.env}={}){
 if(!['stage','prepare','assert'].includes(phase))refuse('PUBLIC_SAVE_PHASE_INVALID');
 if(privateRole(cwd,env)){
  if(phase==='stage')git(cwd,'add','data');
  return {role:'private',stagedPrivateUnstaged:0,outgoingCommits:0};
 }
 const {paths:listed,isPrivate}=privatePaths(manifest);
 git(cwd,'rev-parse','--verify',remoteRef);
 if(nul(git(cwd,'diff','--cached','--name-only','--no-renames','--diff-filter=D','-z','--','data')).some(isPrivate))refuse('PUBLIC_SAVE_PRIVATE_REMOVAL_REQUIRES_MIGRATION');
 const staged=()=>nul(git(cwd,'diff','--cached','--name-only','--no-renames','--diff-filter=ACMRTUXB','-z','--','data')).filter(isPrivate);
 let bad=staged();const count=bad.length;
 if(bad.length&&phase!=='assert'){git(cwd,'reset','-q','HEAD','--',...bad);bad=staged();}
 if(bad.length)refuse('PUBLIC_SAVE_PRIVATE_PATH_STAGED');
 if(phase==='stage'){git(cwd,'add','--all','--','data',':(exclude,top)data/private-*',...listed.map(p=>':(exclude,top,literal)'+p));if(staged().length)refuse('PUBLIC_SAVE_PRIVATE_PATH_STAGED');}
 // All ancestry matters, including reverted payloads and private commits in a merged side branch.
 return {role:'public',stagedPrivateUnstaged:count,outgoingCommits:auditOutgoing(cwd,remoteRef,'HEAD',isPrivate)};
}
const ZERO='0'.repeat(40),OID=/^[a-f0-9]{40}$/;
export function guardPushUpdates({cwd=process.cwd(),manifest=path.join(cwd,'.github/private-files.txt'),target,updates,env=process.env}={}){
 if(typeof target!=='string'||!target||!Array.isArray(updates)||updates.length>128)refuse('PUBLIC_PUSH_CONTEXT_UNAVAILABLE');
 const isPrivateRepo=privateRole(cwd,env,target),policy=isPrivateRepo?null:privatePaths(manifest);let commits=0;
 for(const u of updates){
  if(!OID.test(u.localSha||'')||!OID.test(u.remoteSha||'')||u.remoteRef!=='refs/heads/main')refuse('PUBLIC_PUSH_UNSUPPORTED_REF');
  if(u.localSha===ZERO)refuse('PUBLIC_PUSH_REF_DELETION_REFUSED');
  git(cwd,'rev-parse','--verify',u.localSha+'^{commit}');
  if(u.remoteSha===ZERO){if(!isPrivateRepo)refuse('PUBLIC_PUSH_NEW_REF_REQUIRES_REVIEW');}
  else{git(cwd,'rev-parse','--verify',u.remoteSha+'^{commit}');git(cwd,'merge-base','--is-ancestor',u.remoteSha,u.localSha);}
  if(!isPrivateRepo)commits+=auditOutgoing(cwd,u.remoteSha,u.localSha,policy.isPrivate);
 }
 return {role:isPrivateRepo?'private':'public',outgoingCommits:commits};
}
function pushInput(){let text='',bytes=0;const chunk=Buffer.alloc(4096);for(;;){const n=fs.readSync(0,chunk,0,chunk.length,null);if(!n)break;bytes+=n;if(bytes>65536)refuse('PUBLIC_PUSH_CONTEXT_TOO_LARGE');text+=chunk.toString('utf8',0,n);}
 return text.trim().split('\n').filter(Boolean).map(l=>{const a=l.trim().split(/\s+/);if(a.length!==4)refuse('PUBLIC_PUSH_CONTEXT_INVALID');return{localRef:a[0],localSha:a[1],remoteRef:a[2],remoteSha:a[3]};});}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){try{
 const manifest=path.join(import.meta.dirname,'private-files.txt');
 const r=process.argv[2]==='pre-push'?guardPushUpdates({manifest,target:process.env.SAVE_PUSH_REMOTE_URL,updates:pushInput()}):guardPublicSave({manifest,phase:process.env.SAVE_GUARD_PHASE||'prepare'});
 console.log('save privacy guard: '+r.role+' metadata verified');
}catch(e){console.error(String(e.message));process.exitCode=1;}}
