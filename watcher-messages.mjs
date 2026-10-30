// Reservation permission is remote-confirmed before transport. Publication failure is UNSENT, not a consumed send.
import fs from 'node:fs';import path from 'node:path';import {createHash,randomUUID} from 'node:crypto';
export function createWatcherMessages({day,directory='runtime/watcher-message-state',persist=(_file,{record})=>({ok:true,record}),retryMs=60000,now=Date.now}={}){
 if(!/^\d{4}-\d\d-\d\d$/.test(day||''))throw Error('invalid message-state day');
 const dir=path.join(directory,day),owner=randomUUID(),cache=new Map(),retry=new Map(),stats={publicationFailures:0,acknowledged:0,uncertain:0,unsent:0,suppressed:0};
 const keyOf=key=>createHash('sha256').update(String(key)).digest('hex');
 const fileOf=digest=>path.join(dir,digest+'.json');
 const write=(digest,row)=>{try{fs.mkdirSync(dir,{recursive:true});const file=fileOf(digest),tmp=file+'.'+owner+'.tmp',fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(row));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);return true;}catch{return false;}};
 const read=digest=>{if(cache.has(digest))return cache.get(digest);try{const row=JSON.parse(fs.readFileSync(fs.existsSync(fileOf(digest))?fileOf(digest):path.join('data/watcher-message-state',day,digest+'.json'),'utf8'));if(row.version!==2||row.day!==day||row.keySha256!==digest||!['UNSENT','RESERVED','ACKNOWLEDGED','UNCERTAIN'].includes(row.state))return {state:'UNCERTAIN',reason:'LEGACY_OR_INVALID_STATE'};return row;}catch(e){return e.code==='ENOENT'?null:{state:'UNCERTAIN',reason:'UNREADABLE_STATE'};}};
 const publish=(digest,record,phase)=>{try{return persist(path.join('data/watcher-message-state',day,digest+'.json'),{record,phase})||{ok:false};}catch{return {ok:false};}};
 return {
  reserve(key){const digest=keyOf(key),prior=read(digest);if(prior&&prior.state!=='UNSENT'){stats.suppressed++;return false;}if(now()<(retry.get(digest)||0))return false;
   const row={version:2,day,keySha256:digest,owner,state:'UNSENT',at:new Date(now()).toISOString()};
   if(!write(digest,row)){stats.publicationFailures++;return false;}
   const candidate={...row,state:'RESERVED'},result=publish(digest,candidate,'reserve');
   if(!result.ok){const stored=result.record||{...row,reason:'PUBLICATION_UNCONFIRMED'};cache.set(digest,stored);write(digest,stored);retry.set(digest,now()+retryMs);stats.publicationFailures++;stats.unsent++;return false;}
   cache.set(digest,candidate);if(!write(digest,candidate)){stats.publicationFailures++;return false;}return true;
  },
  finish(key,result={}){const digest=keyOf(key),prior=read(digest);if(prior?.owner!==owner||prior.state!=='RESERVED')return false;
   const state=result.ok?'ACKNOWLEDGED':result.definitelyUnsent?'UNSENT':'UNCERTAIN',row={...prior,state,at:new Date(now()).toISOString()};
   const stored=publish(digest,row,'finish');cache.set(digest,row);write(digest,row);if(!stored.ok)stats.publicationFailures++;
   if(state==='ACKNOWLEDGED')stats.acknowledged++;else if(state==='UNSENT'){stats.unsent++;retry.set(digest,now()+retryMs);}else stats.uncertain++;
   return !!stored.ok;
  },
  has(key){return read(keyOf(key))!==null;},
  state(key){return read(keyOf(key))?.state||'UNSENT';},
  report(){return {...stats};},
 };
}
