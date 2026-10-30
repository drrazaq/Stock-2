// Bounded fast-forward compare-and-publish, using an isolated index. Active HEAD, index and source files never move.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {randomUUID} from 'node:crypto';
export function publishWatcherReservation(file,{cwd=process.cwd(),record,phase='reserve',git=execFileSync,budgetMs=4000,maxAttempts=3}={}){
 if(!/^data\/watcher-message-state\/\d{4}-\d\d-\d\d\/[a-f0-9]{64}\.json$/.test(file)||record?.version!==2)return {ok:false,reason:'INVALID_RESERVATION'};
 const deadline=Date.now()+Math.min(10000,Math.max(100,budgetMs)),dir=fs.mkdtempSync(path.join(os.tmpdir(),'watcher-publish-')),ref='refs/stock2-message/'+randomUUID();
 const run=(args,input)=>{if(Date.now()>=deadline)throw Error('budget');return git('git',args,{cwd,input,encoding:'utf8',env:{...process.env,GIT_INDEX_FILE:path.join(dir,'index')},stdio:['pipe','pipe','pipe'],timeout:Math.max(1,Math.min(1500,deadline-Date.now())),maxBuffer:1024*1024}).trim();};
 try{
  const upstream=run(['rev-parse','--symbolic-full-name','@{upstream}']);if(!upstream.startsWith('refs/remotes/origin/'))return {ok:false,reason:'UNSUPPORTED_UPSTREAM'};const branch=upstream.slice('refs/remotes/origin/'.length);if(!/^[A-Za-z0-9._/-]+$/.test(branch))return {ok:false,reason:'INVALID_UPSTREAM'};
  for(let attempt=0;attempt<Math.min(5,maxAttempts);attempt++){
   try{
    run(['fetch','--no-tags','origin','refs/heads/'+branch+':'+ref]);const parent=run(['rev-parse',ref]);let prior=null;
    if(run(['ls-tree',parent,'--',file])){try{prior=JSON.parse(run(['show',parent+':'+file]));}catch{return {ok:false,reason:'REMOTE_STATE_UNREADABLE'};}}
    if(prior&&(['attempts','publicationAttempts'].some(k=>prior[k]!==undefined&&(!Number.isSafeInteger(prior[k])||prior[k]<0))||prior.nextRetryAt!==undefined&&(!Number.isFinite(prior.nextRetryAt)||prior.nextRetryAt<0)))return {ok:false,reason:'REMOTE_STATE_UNREADABLE',record:{...prior,state:'UNCERTAIN',reason:'INVALID_REMOTE_RETRY_STATE'}};
    if(phase==='reserve'){
     if(prior?.owner===record.owner&&prior?.state==='RESERVED')return {ok:true,record:prior};
     if(prior&&(prior.version!==2||prior.state!=='UNSENT'))return {ok:false,reason:'EXISTING_RESERVATION',record:prior};
     // A stale local checkout must not bypass another writer's durable cooldown/budget.
     if(prior&&Number.isFinite(prior.nextRetryAt)&&Date.now()<prior.nextRetryAt)return {ok:false,reason:'RETRY_NOT_DUE',record:prior};
     if(prior&&Number.isSafeInteger(record.attempts)&&record.attempts!==(prior.attempts||0)+1)return {ok:false,reason:'STALE_RETRY_STATE',record:prior};
    }else if(prior?.owner!==record.owner)return {ok:false,reason:'RESERVATION_OWNER_CHANGED',record:prior};
    // Only this one protected path differs from the latest remote tree. No checkout, pull or rebase.
    run(['read-tree',parent]);const blob=run(['hash-object','-w','--stdin'],JSON.stringify(record));run(['update-index','--add','--cacheinfo','100644',blob,file]);const tree=run(['write-tree']);
    const commit=run(['-c','user.name=scanner','-c','user.email=scanner@users.noreply.github.com','commit-tree',tree,'-p',parent],phase==='reserve'?'watcher message reservation\n':'watcher delivery state\n');
    run(['push','origin',commit+':refs/heads/'+branch]);return {ok:true,record};
   }catch{/* A racing fast-forward or uncertain push is resolved by the next bounded fetch, never by forcing. */}
  }
  return {ok:false,reason:'PUBLICATION_UNCONFIRMED'};
 }catch{return {ok:false,reason:'PUBLICATION_UNCONFIRMED'};}
 finally{try{git('git',['update-ref','-d',ref],{cwd,stdio:'ignore',timeout:1000});}catch{}fs.rmSync(dir,{recursive:true,force:true});}
}
