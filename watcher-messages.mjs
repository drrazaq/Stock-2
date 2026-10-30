// Durable permission precedes transport; retries never turn uncertain delivery into permission.
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
export function createWatcherMessages({day,directory='runtime/watcher-message-state',persist=(_file,{record})=>({ok:true,record}),retryMs=60000,maxAttempts=8,now=Date.now}={}){
 if(!/^\d{4}-\d\d-\d\d$/.test(day||''))throw Error('invalid message-state day');
 if(!Number.isFinite(retryMs)||retryMs<0||!Number.isSafeInteger(maxAttempts)||maxAttempts<1||maxAttempts>32)throw Error('invalid retry policy');
 const dir=path.join(directory,day),owner=randomUUID(),cache=new Map(),stats={publicationFailures:0,acknowledged:0,uncertain:0,unsent:0,suppressed:0};
 const keyOf=key=>createHash('sha256').update(String(key)).digest('hex');
 const fileOf=digest=>path.join(dir,digest+'.json');
 const write=(digest,row)=>{try{fs.mkdirSync(dir,{recursive:true});const file=fileOf(digest),tmp=file+'.'+owner+'.tmp',fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(row));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);return true;}catch{return false;}};
 const read=digest=>{if(cache.has(digest))return cache.get(digest);try{const row=JSON.parse(fs.readFileSync(fs.existsSync(fileOf(digest))?fileOf(digest):path.join('data/watcher-message-state',day,digest+'.json'),'utf8'));if(row.version!==2||row.day!==day||row.keySha256!==digest||!['UNSENT','RESERVED','ACKNOWLEDGED','UNCERTAIN'].includes(row.state)||['attempts','publicationAttempts'].some(k=>row[k]!==undefined&&(!Number.isSafeInteger(row[k])||row[k]<0))||row.nextRetryAt!==undefined&&(!Number.isFinite(row.nextRetryAt)||row.nextRetryAt<0))return {state:'UNCERTAIN',reason:'LEGACY_OR_INVALID_STATE'};return row;}catch(e){return e.code==='ENOENT'?null:{state:'UNCERTAIN',reason:'UNREADABLE_STATE'};}};
 const publish=(digest,record,phase)=>{try{return persist(path.join('data/watcher-message-state',day,digest+'.json'),{record,phase})||{ok:false};}catch{return {ok:false};}};
 const delay=n=>Math.min(900000,retryMs*2**Math.min(20,Math.max(0,n-1)));
 const save=(digest,row)=>{cache.set(digest,row);if(!write(digest,row)){stats.publicationFailures++;return false;}return true;};
 const keys=()=>{const all=new Set(cache.keys());for(const base of [dir,path.join('data/watcher-message-state',day)])try{for(const f of fs.readdirSync(base))if(/^[a-f0-9]{64}\.json$/.test(f))all.add(f.slice(0,-5));}catch{}return all;};
 const maintain=()=>{ // One bounded publication per observation cycle. No transport here.
  for(const digest of keys()){const row=read(digest);if(!row?.pendingPublication||now()<(row.nextRetryAt||0)||(row.publicationAttempts||0)>=maxAttempts)continue;
   const candidate={...row,publicationAttempts:(row.publicationAttempts||0)+1,nextRetryAt:now()+delay((row.publicationAttempts||0)+1)};
   if(!save(digest,candidate))return false;
   const result=publish(digest,{...candidate,pendingPublication:false},'finish');
   if(result.ok){save(digest,{...candidate,pendingPublication:false});return true;}
   stats.publicationFailures++;return false;
  }return false;
 };
 return {
  maintain,
  reserve(key){const digest=keyOf(key),prior=read(digest);if(prior&&prior.state!=='UNSENT'){stats.suppressed++;return false;}if(prior?.pendingPublication||now()<(prior?.nextRetryAt||0)||(prior?.attempts||0)>=maxAttempts)return false;
   const attempts=(prior?.attempts||0)+1,row={version:2,day,keySha256:digest,owner,state:'UNSENT',at:new Date(now()).toISOString(),attempts,nextRetryAt:now()+delay(attempts)};
   if(!save(digest,row))return false;
   const candidate={...row,state:'RESERVED'},result=publish(digest,candidate,'reserve');
   if(!result.ok){const stored=result.record||{...row,reason:'PUBLICATION_UNCONFIRMED'};save(digest,stored);if(['EXISTING_RESERVATION','RETRY_NOT_DUE','STALE_RETRY_STATE'].includes(result.reason))stats.suppressed++;else stats.publicationFailures++;if(stored.state==='UNSENT')stats.unsent++;return false;}
   if(!save(digest,candidate))return false;return true;
  },
  finish(key,result={}){const digest=keyOf(key),prior=read(digest);if(prior?.owner!==owner||prior.state!=='RESERVED')return false;
   const state=result.ok?'ACKNOWLEDGED':result.definitelyUnsent?'UNSENT':'UNCERTAIN',row={...prior,state,at:new Date(now()).toISOString(),pendingPublication:true,publicationAttempts:1,nextRetryAt:now()+delay(prior.attempts||1)};
   // Persist the outcome before attempting publication; a crash never grants another send.
   if(!save(digest,row))return false;
   const stored=publish(digest,{...row,pendingPublication:false},'finish');if(stored.ok)save(digest,{...row,pendingPublication:false});else stats.publicationFailures++;
   if(state==='ACKNOWLEDGED')stats.acknowledged++;else if(state==='UNSENT')stats.unsent++;else stats.uncertain++;
   return !!stored.ok;
  },
  has(key){return read(keyOf(key))!==null;},
  state(key){return read(keyOf(key))?.state||'UNSENT';},
  report(){let retryWaiting=0,retryExhausted=0,pendingFinalizations=0,uncertainStates=0;for(const digest of keys()){const r=read(digest);if(r?.pendingPublication)pendingFinalizations++;if(['UNCERTAIN','RESERVED'].includes(r?.state))uncertainStates++;if(r?.state==='UNSENT'||r?.pendingPublication){if((r.attempts||0)>=maxAttempts&&!r.pendingPublication||(r.publicationAttempts||0)>=maxAttempts&&r.pendingPublication)retryExhausted++;else retryWaiting++;}}return {generatedAt:now(),...stats,retryWaiting,retryExhausted,pendingFinalizations,uncertainStates,unhealthy:retryWaiting+retryExhausted+pendingFinalizations+uncertainStates>0};},
 };
}
