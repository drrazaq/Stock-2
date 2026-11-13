// Shared save boundary. Public-role checks use path/commit metadata and never print owner payloads.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const refuse=code=>{throw Error(code);};
function git(cwd,...args){try{return execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']});}catch{refuse('PUBLIC_SAVE_GIT_METADATA_UNAVAILABLE');}}
const nul=s=>s.split('\0').filter(Boolean);
function privatePaths(file){let raw;try{raw=fs.readFileSync(file,'utf8');}catch{refuse('PUBLIC_SAVE_PRIVATE_MANIFEST_UNAVAILABLE');}
 const names=raw.split('\n').map(x=>x.trim()).filter(x=>x&&!x.startsWith('#'));
 if(!names.length||names.some(x=>!/^[-a-zA-Z0-9._/]+$/.test(x)||x.startsWith('/')||x.split('/').some(p=>p==='.'||p==='..'||!p)))refuse('PUBLIC_SAVE_PRIVATE_MANIFEST_INVALID');
 const paths=names.map(x=>'data/'+x),listed=new Set(paths);return {paths,isPrivate:p=>listed.has(p)||p.startsWith('data/private-')};}
function isKnownPublicOrigin(raw){
 let host='',repo='';try{if(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)){const u=new URL(raw);host=u.hostname;repo=u.pathname;}else{const m=raw.match(/^(?:[^@]+@)?([^:/]+):(.+)$/);if(m){host=m[1];repo=m[2];}}}catch{return false;}
 return host.toLowerCase()==='github.com'&&repo.replace(/^\/+|\/+$/g,'').replace(/\.git$/i,'').toLowerCase()==='drrazaq/stock-2';
}
export function guardPublicSave({cwd=process.cwd(),manifest=path.join(cwd,'.github/private-files.txt'),phase='prepare',remoteRef='origin/main',env=process.env}={}){
 if(!['stage','prepare','assert'].includes(phase))refuse('PUBLIC_SAVE_PHASE_INVALID');
 const origin=git(cwd,'remote','get-url','origin').trim();
 if(env.SAVE_PRIVATE_REPO==='1'){
  const expected=env.SAVE_PRIVATE_EXPECTED_ORIGIN;
  if(!expected||origin.trim()!==expected.trim())refuse('PRIVATE_SAVE_EXACT_ORIGIN_REQUIRED');
  if(isKnownPublicOrigin(origin))refuse('PRIVATE_SAVE_PUBLIC_ORIGIN_FORBIDDEN');
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
 // All outgoing ancestry matters: even an add later reverted or hidden in a merged side branch exposes the original payload.
 const commits=git(cwd,'rev-list','--topo-order',remoteRef+'..HEAD').trim().split('\n').filter(Boolean);
 for(const c of commits){if(!/^[a-f0-9]{40}$/.test(c))refuse('PUBLIC_SAVE_COMMIT_ID_INVALID');
  const paths=nul(git(cwd,'diff-tree','--root','-m','--no-commit-id','-r','--name-only','--no-renames','--diff-filter=ACDMRTUXB','-z',c,'--','data'));
  if(paths.some(isPrivate))refuse('PUBLIC_SAVE_PRIVATE_HISTORY_OUTGOING');}
 return {role:'public',stagedPrivateUnstaged:count,outgoingCommits:commits.length};
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){try{const r=guardPublicSave({manifest:path.join(import.meta.dirname,'private-files.txt'),phase:process.env.SAVE_GUARD_PHASE||'prepare'});console.log('save privacy guard: '+r.role+' metadata verified');}catch(e){console.error(String(e.message));process.exitCode=1;}}
