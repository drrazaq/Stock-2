// Merge existing scanner evidence at the two existing Git save boundaries.
// No provider/network calls; no owner-file access; no UNKNOWN/RESERVED reset.
import fs from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const same=(a,b)=>isDeepStrictEqual(a,b);
function parse(x){
 if(!object(x)||typeof x.day!=='string'||!object(x.sent)||x.delivery!==undefined&&!object(x.delivery))throw Error('ALERT_STATE_UNREADABLE: original evidence retained');
 if(x.day!==''&&(!/^\d{4}-\d{2}-\d{2}$/.test(x.day)||!Number.isFinite(Date.parse(x.day+'T12:00:00Z'))||new Date(x.day+'T12:00:00Z').toISOString().slice(0,10)!==x.day))throw Error('ALERT_DAY_UNREADABLE');
 for(const v of Object.values(x.delivery||{}))if(!object(v)||!['RESERVED','UNKNOWN'].includes(v.status))throw Error('ALERT_DELIVERY_UNREADABLE');
 return x;
}
export function mergeAlertState(remote,local){
 if(remote===null)return parse(local);if(local===null)return parse(remote);parse(remote);parse(local);
 const day=remote.day>local.day?remote.day:local.day,out={...remote,...local,day},sent={};
 for(const k of new Set([...Object.keys(remote),...Object.keys(local)]))if(!['day','sent','delivery'].includes(k)&&k in remote&&k in local&&!same(remote[k],local[k]))throw Error('ALERT_METADATA_CONFLICT: evidence retained');
 // sent is a legacy suppression flag, NOT a hosted ACK.
 for(const x of [remote,local])if(x.day===day)for(const [k,v]of Object.entries(x.sent))if(v||!(k in sent))sent[k]=sent[k]==='UNKNOWN'||v==='UNKNOWN'?'UNKNOWN':v;
 out.sent=sent;const delivery={};
 for(const x of [remote,local])for(const [k,v]of Object.entries(x.delivery||{})){
  if(!delivery[k]){delivery[k]=v;continue;}
  const old=delivery[k];if(same(old,v))continue;
  const alternatives=[...(old.alternatives||[old]),...(v.alternatives||[v])];
  const unique=[...new Map(alternatives.map(a=>[JSON.stringify(a),a])).values()];
  if(unique.length>128)throw Error('ALERT_CONFLICT_LIMIT: evidence retained');
  delivery[k]={status:'UNKNOWN',alternatives:unique};
 }
 if(Object.keys(delivery).length||remote.delivery!==undefined||local.delivery!==undefined)out.delivery=delivery;
 return out;
}
export function reconcileAlertFile(){
 execFileSync('git',['rev-parse','--verify','origin/main'],{stdio:'pipe'});
 const p='data/alert-state.json';let remote=null,local=null,raw;
 try{raw=fs.readFileSync(p,'utf8');local=JSON.parse(raw);}catch(e){if(e.code!=='ENOENT')throw e;}
 const entry=execFileSync('git',['ls-tree','origin/main','--',p],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
 if(entry&&!/^100644 blob [a-f0-9]{40}\tdata\/alert-state\.json$/.test(entry))throw Error('ALERT_REMOTE_ENTRY_UNREADABLE');
 const exists=entry!=='';
 if(exists)remote=JSON.parse(execFileSync('git',['show','origin/main:'+p],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
 if(remote===null&&local===null)return;
 const merged=mergeAlertState(remote,local);
 if(local!==null&&same(merged,local))return;
 fs.mkdirSync('data',{recursive:true});fs.writeFileSync(p,JSON.stringify(merged));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)reconcileAlertFile();
