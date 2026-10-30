// Confirm only the existing public hash/state journal, using the existing repo
// permission. No other workspace files, credential reads, force push or retry.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
export const newsStateDigest=bytes=>bytes===null?null:createHash('sha256').update(bytes).digest('hex');
export function createNewsStatePublication({cwd=process.cwd(),expectedDigest,allowLocalOrigin=false,env=process.env}={}){
 if(expectedDigest!==null&&!/^[a-f0-9]{64}$/.test(expectedDigest||''))throw Error('NEWS_PUBLICATION_BASE_UNKNOWN');
 const file='data/news-delivery.json';let expected=expectedDigest;
 const git=(args,where=cwd)=>{const r=spawnSync('git',args,{cwd:where,env,encoding:null,timeout:20000,maxBuffer:8*1024*1024});if(r.error||r.status!==0)throw Error('NEWS_STATE_PUBLICATION_UNCONFIRMED');return r.stdout;};
 return {publish(){let temp=null,registered=false;
  try{
   if(!allowLocalOrigin&&(env.GITHUB_ACTIONS!=='true'||env.GITHUB_REPOSITORY!=='drrazaq/Stock-2'))throw Error();
   const origin=git(['remote','get-url','origin']).toString().trim();
   if(allowLocalOrigin){if(!path.isAbsolute(origin)||!fs.statSync(origin).isDirectory())throw Error();}
   else if(!/^https:\/\/github\.com\/drrazaq\/Stock-2(?:\.git)?$/.test(origin))throw Error();
   const branch=git(['symbolic-ref','--short','HEAD']).toString().trim();
   if(!/^[A-Za-z0-9_.-]+$/.test(branch)||!allowLocalOrigin&&!['main','Stock2-safety-fixes'].includes(branch))throw Error();
   const bytes=fs.readFileSync(path.join(cwd,file));if(bytes.length>8*1024*1024)throw Error();
   git(['fetch','--no-tags','origin','refs/heads/'+branch]);const base=git(['rev-parse','FETCH_HEAD']).toString().trim();if(!/^[a-f0-9]{40}$/.test(base))throw Error();
   const listed=git(['ls-tree','--name-only',base,'--',file]).toString().trim();
   const remote=listed?git(['show',base+':'+file]):null;
   if(newsStateDigest(remote)!==expected)throw Error('NEWS_STATE_CAS_CONFLICT');
   const digest=newsStateDigest(bytes);if(digest===expected)return {ok:true,sha:base,digest};
   temp=fs.mkdtempSync(path.join(os.tmpdir(),'stock2-news-state-'));const tree=path.join(temp,'tree');git(['worktree','add','--detach',tree,base]);registered=true;
   fs.mkdirSync(path.join(tree,'data'),{recursive:true});fs.writeFileSync(path.join(tree,file),bytes);
   git(['add','--',file],tree);git(['-c','user.name=scanner','-c','user.email=scanner@users.noreply.github.com','-c','commit.gpgsign=false','commit','-m','news journal reservation/ack'],tree);
   const sha=git(['rev-parse','HEAD'],tree).toString().trim();
   git(['push','origin',sha+':refs/heads/'+branch],tree);
   git(['fetch','--no-tags','origin','refs/heads/'+branch]);const actual=git(['rev-parse','FETCH_HEAD']).toString().trim();
   if(newsStateDigest(git(['show',actual+':'+file]))!==digest)throw Error();expected=digest;
   return {ok:true,sha:actual,digest};
  }catch{return {ok:false,reason:'NEWS_STATE_PUBLICATION_UNCONFIRMED'};}
  finally{if(registered)try{git(['worktree','remove','--force',path.join(temp,'tree')]);}catch{}if(temp)fs.rmSync(temp,{recursive:true,force:true});}
 }};
}
