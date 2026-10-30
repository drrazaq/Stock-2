// At-most-once attempt reservations; no message text, holdings, amounts or credentials are persisted.
// An uncertain send is not automatically retried. Cross-run durability still requires the workflow's confirmed publication.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function createWatcherMessages({day,directory='data/watcher-message-state',persist=()=>{}}={}){
 if(!/^\d{4}-\d\d-\d\d$/.test(day||''))throw Error('invalid message-state day');
 const dir=path.join(directory,day);fs.mkdirSync(dir,{recursive:true});
 return {reserve(key){
   const digest=createHash('sha256').update(String(key)).digest('hex'),file=path.join(dir,digest+'.json');let fd;
   try{fd=fs.openSync(file,'wx',0o600);fs.writeFileSync(fd,JSON.stringify({version:1,day,keySha256:digest,state:'ATTEMPTED_DELIVERY_UNKNOWN',at:new Date().toISOString()}));fs.fsyncSync(fd);persist(file);return true;}
   catch(e){if(e.code==='EEXIST'){const x=JSON.parse(fs.readFileSync(file,'utf8'));if(x.version!==1||x.day!==day||x.keySha256!==digest||x.state!=='ATTEMPTED_DELIVERY_UNKNOWN')throw Object.assign(Error('invalid prior message reservation'),{code:'WATCHER_MESSAGE_STATE'});return false;}e.code='WATCHER_MESSAGE_STATE';throw e;}
   finally{if(fd!==undefined)fs.closeSync(fd);}
 }};
}
