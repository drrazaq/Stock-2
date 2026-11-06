// Passive MARKET-03 evidence only. No network, messages, orders, strategy threshold or eligibility decision.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {isCalendarDay,nyDay} from './market-data-contracts.mjs';
export const OBSERVER_LIMITS=Object.freeze({open:570,endExclusive:901,records:331,recordBytes:6144,rows:20000,maxBytes:2033664});
const hash=b=>createHash('sha256').update(b).digest('hex'),finite=x=>typeof x==='number'&&Number.isFinite(x),positive=x=>finite(x)&&x>0;
function summary(rows,now){
 if(!Array.isArray(rows)||rows.length>OBSERVER_LIMITS.rows||!finite(now))throw Error('OBSERVER_INPUT');
 const count={rows:rows.length,priceClockMissing:0,priceClockFuture:0,quoteClockMissing:0,quoteClockFuture:0,oneSided:0,crossed:0,sizeUnknown:0,volumeAsOfUnknown:0,volumeClockFuture:0},providers={},feeds={};
 for(const r of rows){
  if(!r||typeof r!=='object')throw Error('OBSERVER_INPUT');
  const p=['ALPACA','MASSIVE'].includes(r.quoteProvider)?r.quoteProvider:'UNKNOWN',f=['sip','iex'].includes(r.quoteFeed)?r.quoteFeed:'UNKNOWN';
  providers[p]=(providers[p]||0)+1;feeds[f]=(feeds[f]||0)+1;
  if(!positive(r.t))count.priceClockMissing++;else if(r.t>now)count.priceClockFuture++;
  if(!positive(r.qt))count.quoteClockMissing++;else if(r.qt>now)count.quoteClockFuture++;
  if(!positive(r.bid)||!positive(r.ask))count.oneSided++;else if(r.ask<r.bid)count.crossed++;
  if(r.quoteSizeUnit!=='SHARES'||!Number.isSafeInteger(r.quoteAskSizeRaw)||r.quoteAskSizeRaw<0||!Number.isSafeInteger(r.quoteBidSizeRaw)||r.quoteBidSizeRaw<0)count.sizeUnknown++;
  if(!positive(r.vt))count.volumeAsOfUnknown++;else if(r.vt>now)count.volumeClockFuture++;
 }
 return {counts:count,quoteProviders:providers,quoteFeeds:feeds,entryPolicy:'NOT_ADOPTED_NOT_EVALUATED',volumeMeaning:'PROVIDER_FIELD_AS_REPORTED_NOT_TOTAL_TRADED_OR_FRESHNESS_PROOF',fillGuarantee:false};
}
// Linux Actions runtime: walk user path components with O_NOFOLLOW, then use
// the verified directory descriptor for every write. O_NOFOLLOW on the leaf
// alone cannot protect against replacement of an ancestor by a symlink.
function safeDirectory(dir,io,create=false){
 let fd=io.openSync('/',fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);
 try{for(const part of path.resolve(dir).split(path.sep).filter(Boolean)){
  const name='/proc/self/fd/'+fd+'/'+part;
  if(create)try{io.mkdirSync(name,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}
  const next=io.openSync(name,fs.constants.O_RDONLY|fs.constants.O_DIRECTORY|fs.constants.O_NOFOLLOW);io.closeSync(fd);fd=next;
 }return fd;}catch(e){io.closeSync(fd);throw e;}
}
function readRecord(file,io){const fd=io.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);try{const s=io.fstatSync(fd);if(!s.isFile()||s.size>6144)throw Error('OBSERVER_FILE');return io.readFileSync(fd);}finally{io.closeSync(fd);}}
function sameDirectory(root,fd,io){const current=safeDirectory(root,io);try{const a=io.fstatSync(fd),b=io.fstatSync(current);if(a.dev!==b.dev||a.ino!==b.ino)throw Error('OBSERVER_DIRECTORY_CHANGED');}finally{io.closeSync(current);}}
export function createContractObserver({enabled=false,directory='data/ignition-runs',day,runId,sourceSha,io=fs}={}){
 let state=enabled?'ACTIVE':'OFF',records=0,root=null;
 const health=()=>({state,records,configuredWindow:{open:570,endExclusive:901},fullSession:false,sourceCoverageVerified:false,policyApproved:false});
 const quarantine=()=>{state='QUARANTINED';let dir,fd;try{if(root){dir=safeDirectory(root,io);fd=io.openSync('/proc/self/fd/'+dir+'/QUARANTINED',fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);io.writeFileSync(fd,'OBSERVER_PERSISTENCE_OR_CONFLICT\n');io.fsyncSync(fd);io.fsyncSync(dir);}}catch{}finally{if(fd!==undefined)try{io.closeSync(fd);}catch{}if(dir!==undefined)try{io.closeSync(dir);}catch{}}};
 const validate=(raw,name)=>{const e=JSON.parse(raw),s=JSON.stringify(e.record);if(e.sha256!==hash(s)||e.record.kind!=='PASSIVE_CONTRACT_OBSERVATION_V1'||e.record.day!==day||e.record.runId!==runId||e.record.sourceSha!==sourceSha||name!=='beat-'+String(e.record.minute).padStart(4,'0')+'.json'||e.record.minute<570||e.record.minute>900)throw Error('OBSERVER_RECORD');};
 let opening;
 if(enabled)try{
  if(!isCalendarDay(day)||!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(runId||'')||!/^[a-f0-9]{40}$/.test(sourceSha||''))throw Error('OBSERVER_SCOPE');
  root=path.join(directory,day,runId+'.contracts');opening=safeDirectory(root,io,true);const anchored='/proc/self/fd/'+opening;
  const names=io.readdirSync(anchored);if(names.includes('QUARANTINED')||names.length>331)throw Error('OBSERVER_QUARANTINE');
  for(const name of names){if(!/^beat-0[5-9][0-9]{2}\.json$/.test(name))throw Error('OBSERVER_FILE');const file=path.join(anchored,name),s=io.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.size>6144)throw Error('OBSERVER_FILE');validate(readRecord(file,io).toString(),name);records++;}
 }catch{quarantine();}finally{if(opening!==undefined)try{io.closeSync(opening);}catch{}}
 return {health,record({minute,rows,nowMs}){
  if(state!=='ACTIVE')return false;
  if(!Number.isInteger(minute)||minute<570||minute>900)return false;
  let directoryFd;try{
   directoryFd=safeDirectory(root,io);const anchored='/proc/self/fd/'+directoryFd;if(io.existsSync(path.join(anchored,'QUARANTINED')))throw Error('OBSERVER_QUARANTINE');
   if(!finite(nowMs)||nyDay(nowMs)!==day)throw Error('OBSERVER_CLOCK');
   const record={kind:'PASSIVE_CONTRACT_OBSERVATION_V1',day,runId,sourceSha,minute,observedAt:new Date(nowMs).toISOString(),...summary(rows,nowMs)},s=JSON.stringify(record),payload=Buffer.from(JSON.stringify({record,sha256:hash(s)})+'\n');
   if(payload.length>6144)throw Error('OBSERVER_BUDGET');
   const name='beat-'+String(minute).padStart(4,'0')+'.json',file=path.join(anchored,name);
   if(io.existsSync(file)){const st=io.lstatSync(file);if(!st.isFile()||st.isSymbolicLink()||st.size>6144)throw Error('OBSERVER_CONFLICT');const old=readRecord(file,io);validate(old.toString(),name);if(!old.equals(payload))throw Error('OBSERVER_CONFLICT');return true;}
   const fd=io.openSync(file,fs.constants.O_WRONLY|fs.constants.O_CREAT|fs.constants.O_EXCL|fs.constants.O_NOFOLLOW,0o600);try{let n=0;while(n<payload.length){const wrote=io.writeSync(fd,payload,n,payload.length-n);if(!(wrote>0))throw Error('OBSERVER_SHORT_WRITE');n+=wrote;}io.fsyncSync(fd);}finally{io.closeSync(fd);}
   io.fsyncSync(directoryFd);sameDirectory(root,directoryFd,io);records++;return true;
  }catch{quarantine();return false;}finally{if(directoryFd!==undefined)try{io.closeSync(directoryFd);}catch{}}
 }};
}
