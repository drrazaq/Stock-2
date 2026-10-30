// SEC index/ticker source contract. Legacy compact caches remain untouched.
// Reported filing paths are identities, not independent filing-body authenticity.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createHash,randomUUID} from 'node:crypto';
import {marketSymbol} from './market-symbol.mjs';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x),hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const clock=x=>typeof x==='string'&&/T.*Z$/.test(x)&&Number.isFinite(Date.parse(x));
const day=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
export function supplyBase(value){
 if(value===undefined)return 'https://www.sec.gov';
 let u;try{u=new URL(value);}catch{throw Error('INVALID_SEC_BASE');}
 if(u.protocol!=='http:'||!['127.0.0.1','localhost'].includes(u.hostname)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error('INVALID_SEC_BASE');
 return u.origin;
}
function read(file){let fd;try{fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const s=fs.fstatSync(fd);if(!s.isFile()||s.size>32*1024*1024)throw Error();return JSON.parse(fs.readFileSync(fd,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw Error('SOURCE_CACHE_SCHEMA_OR_BUDGET');}finally{if(fd!==undefined)fs.closeSync(fd);}}
function write(file,x){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(x),{flag:'wx'});fs.renameSync(tmp,file);}finally{try{fs.unlinkSync(tmp);}catch{}}}
function rowValid(r,q,now){
 if(!Array.isArray(r)||r.length!==4||!Number.isSafeInteger(r[0])||r[0]<=0||!['S-8','424B4'].includes(r[1])||!day(r[2])||Date.parse(r[2])>now||r[2].slice(0,4)!==q.slice(0,4)||Math.floor((+r[2].slice(5,7)-1)/3)+1!==+q.slice(-1)||typeof r[3]!=='string')return false;
 const m=/^edgar\/data\/(\d{1,10})\/(\d{10}-\d{2}-\d{6})\.txt$/.exec(r[3]);return !!m&&Number(m[1])===r[0];
}
export function readSupplyIndex(dir,q,now=Date.now()){
 if(!/^\d{4}Q[1-4]$/.test(q))throw Error('INVALID_QUARTER');
 const d=read(path.join(dir,q+'.source.json'));if(!d)return null;
 if(!object(d)||d.protocol!=='SEC_INDEX_IDENTITY_V1'||d.quarter!==q||!clock(d.firstObservedAt)||Date.parse(d.firstObservedAt)>now||!clock(d.lastAttempt?.at)||Date.parse(d.lastAttempt.at)>now||Date.parse(d.lastAttempt.at)<Date.parse(d.firstObservedAt)||!Array.isArray(d.lastObservedIds)||d.lastObservedIds.length>10000||!object(d.records)||d.lastObservedIds.some(id=>typeof id!=='string'||!Object.hasOwn(d.records,id))||Object.keys(d.records).length>10000||!['OBSERVED','PARTIAL_OR_UNKNOWN','UNKNOWN','CONFLICT'].includes(d.status))throw Error('INDEX_CACHE_SCHEMA');
 for(const [id,r] of Object.entries(d.records))if(!object(r)||!rowValid(r.row,q,now)||id!==r.row[3]||r.revisionId!==hash(r.row)||!clock(r.firstObservedAt)||Date.parse(r.firstObservedAt)>now||Date.parse(r.firstObservedAt)<Date.parse(r.row[2])||!['OBSERVED','CONFLICT'].includes(r.status))throw Error('INDEX_CACHE_RECORD_SCHEMA');
 if(d.status==='OBSERVED'&&(d.rejectedRows||Object.values(d.records).some(r=>r.status==='CONFLICT')))throw Error('INDEX_CACHE_STATUS_CONFLICT');
 return d;
}
function indexResult(d,status=d?.status||'UNKNOWN',reason=null){
 const records=d?Object.values(d.records):[],conflicts=records.filter(r=>r.status==='CONFLICT');
 return {status,reason,rows:['OBSERVED','PARTIAL_OR_UNKNOWN','CONFLICT'].includes(status)?records.filter(r=>r.status==='OBSERVED'&&d.lastObservedIds.includes(r.row[3])).map(r=>[...r.row,r.firstObservedAt,r.revisionId]):[],conflicts:conflicts.map(r=>r.row[3]),firstObservedAt:d?.firstObservedAt||null,rejectedRows:d?.rejectedRows||0};
}
export function createSupplySource({dir,base,ua,fetcher=fetch,now=()=>Date.now()}){
 base=supplyBase(base);let attempts=0,bytes=0,paused=false,lastRequest=null;const started=performance.now(),errors=[];
 async function get(endpoint){
  if(paused||attempts>=64||performance.now()-started>=180000)throw Error(paused?'RATE_LIMIT_PAUSE':'REQUEST_TIME_BUDGET');
  if(base==='https://www.sec.gov'&&lastRequest!==null){const wait=250-(performance.now()-lastRequest);if(wait>0)await new Promise(r=>setTimeout(r,wait));}lastRequest=performance.now();
  attempts++;const r=await fetcher(base+endpoint,{method:'GET',redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(15000,180000-(performance.now()-started)))),headers:{'User-Agent':ua}});
  if(!r.ok){await r.body?.cancel();if(r.status===429)paused=true;throw Error('HTTP_'+r.status);}
  const len=r.headers.get('content-length');if(len!==null&&(!/^\d+$/.test(len)||Number(len)>16*1024*1024)){await r.body?.cancel();throw Error('SOURCE_BYTE_BUDGET');}
  if(!r.body)throw Error('SOURCE_BODY_MISSING');const chunks=[],reader=r.body.getReader();let size=0;
  try{while(true){const v=await reader.read();if(v.done)break;size+=v.value.length;bytes+=v.value.length;if(size>16*1024*1024||bytes>128*1024*1024){await reader.cancel();throw Error('SOURCE_BYTE_BUDGET');}chunks.push(v.value);}return Buffer.concat(chunks,size);}finally{reader.releaseLock();}
 }
 async function quarter(q,{allowFetch=true}={}){
  let prior;try{prior=readSupplyIndex(dir,q,now());}catch(e){return indexResult(null,'UNKNOWN',e.message);}
  const current=q===new Date(now()).getUTCFullYear()+'Q'+(Math.floor(new Date(now()).getUTCMonth()/3)+1);
  if(prior&&!current&&['OBSERVED','CONFLICT'].includes(prior.status))return indexResult(prior);
  if(!allowFetch)return indexResult(prior,'UNKNOWN','NO_VERIFIED_REFRESH');
  const file=path.join(dir,q+'.source.json');
  try{
   const buf=await get('/Archives/edgar/full-index/'+q.slice(0,4)+'/QTR'+q.slice(-1)+'/master.gz');
   const text=(buf[0]===31&&buf[1]===139?zlib.gunzipSync(buf,{maxOutputLength:64*1024*1024}):buf).toString('latin1');
   const lines=text.split(/\r?\n/),header=lines.findIndex(x=>x.trim()==='CIK|Company Name|Form Type|Date Filed|Filename');
   if(header<0||lines.length>500000)throw Error('INDEX_HEADER_OR_ROW_BUDGET');
   const rows=new Map(),localConflicts=new Set();let rejected=0;
   for(const line of lines.slice(header+1)){if(!line.trim()||/^-+$/.test(line.trim()))continue;const p=line.split('|').map(x=>x.trim());if(p.length!==5||!/^\d{1,10}$/.test(p[0])||!p[1]||!p[2]||!day(p[3])){rejected++;continue;}if(!['S-8','424B4'].includes(p[2]))continue;
    const row=[Number(p[0]),p[2],p[3],p[4]];if(!rowValid(row,q,now())){rejected++;continue;}const old=rows.get(row[3]);if(old&&hash(old)!==hash(row)){rejected++;localConflicts.add(row[3]);continue;}rows.set(row[3],row);
   }
   if(rows.size>10000)throw Error('INDEX_IDENTITY_BUDGET');
   const at=new Date(now()).toISOString(),d=prior||{protocol:'SEC_INDEX_IDENTITY_V1',quarter:q,firstObservedAt:at,records:{}};
   d.records=structuredClone(d.records);
   for(const [id,row] of rows){const old=d.records[id];if(old){if(old.revisionId!==hash(row)){old.status='CONFLICT';old.lastConflictingRevision=hash(row);}}else d.records[id]={row,revisionId:hash(row),firstObservedAt:at,status:'OBSERVED'};}
   for(const id of localConflicts)if(d.records[id])d.records[id].status='CONFLICT';
   if(!rejected)for(const [id,r] of Object.entries(d.records))if(!rows.has(id))r.status='CONFLICT';
   if(Object.keys(d.records).length>10000)throw Error('INDEX_IDENTITY_BUDGET');
   d.lastObservedIds=[...rows.keys()];d.rejectedRows=rejected;d.bodyDigest=createHash('sha256').update(buf).digest('hex');d.status=Object.values(d.records).some(r=>r.status==='CONFLICT')?'CONFLICT':rejected?'PARTIAL_OR_UNKNOWN':'OBSERVED';d.lastAttempt={at,status:d.status};write(file,d);return indexResult(d);
  }catch(e){const reason=/^(HTTP_\d+|RATE_LIMIT_PAUSE|REQUEST_TIME_BUDGET|SOURCE_BYTE_BUDGET|SOURCE_BODY_MISSING|INDEX_HEADER_OR_ROW_BUDGET|INDEX_IDENTITY_BUDGET)$/.test(e.message)?e.message:'FETCH_OR_INDEX_UNAVAILABLE';errors.push({source:q,reason});if(prior){prior.status='UNKNOWN';prior.lastAttempt={at:new Date(now()).toISOString(),status:'UNKNOWN',reason};write(file,prior);}return indexResult(prior,'UNKNOWN',reason);}
 }
 async function tickers(){
  const file=path.join(dir,'tickers.source.json');let prior;
  try{prior=read(file);if(prior&&(!object(prior)||prior.protocol!=='SEC_TICKER_LITERAL_V1'||!clock(prior.firstObservedAt)||Date.parse(prior.firstObservedAt)>now()||!clock(prior.checkedAt)||Date.parse(prior.checkedAt)>now()||Date.parse(prior.checkedAt)<Date.parse(prior.firstObservedAt)||!object(prior.m)||!Array.isArray(prior.conflicts)||prior.conflicts.length>20000||prior.conflicts.some(c=>typeof c!=='string'||!/^\d+$/.test(c))||Object.keys(prior.m).length>20000||!['OBSERVED','PARTIAL_OR_UNKNOWN','UNKNOWN','CONFLICT'].includes(prior.status)||Object.entries(prior.m).some(([c,ss])=>!/^\d{1,10}$/.test(c)||Number(c)<=0||!Array.isArray(ss)||!ss.length||ss.some(s=>marketSymbol(s)!==s)||prior.status==='OBSERVED'&&ss.length!==1)))throw Error('TICKER_CACHE_SCHEMA');}catch(e){return {status:'UNKNOWN',m:{},reason:e.message};}
  if(prior&&prior.status==='OBSERVED'&&now()-Date.parse(prior.checkedAt)<=7*864e5)return prior;
  try{const bytes=await get('/files/company_tickers.json'),j=JSON.parse(bytes.toString());if(!object(j)||j.error||j.errors||Object.keys(j).length>20000)throw Error('TICKER_SCHEMA');
   const m=Object.create(null);let rejected=0;for(const x of Object.values(j)){const s=marketSymbol(x?.ticker),c=x?.cik_str;if(!s||!Number.isSafeInteger(c)||c<=0){rejected++;continue;}(m[c]??=[]).push(s);}
   if(!Object.keys(m).length)throw Error('TICKER_EMPTY_UNIVERSE');
   for(const c of Object.keys(m))m[c]=[...new Set(m[c])].sort();
   const conflicts=new Set(prior?.conflicts||[]),original=structuredClone(prior?.m||{});
   if(prior)for(const [c,ss] of Object.entries(prior.m))if(hash(ss)!==hash(m[c]||[]))conflicts.add(c);
   for(const [c,ss] of Object.entries(m))if(!original[c])original[c]=ss;
   const ambiguous=Object.values(m).filter(ss=>ss.length!==1).length,at=new Date(now()).toISOString();
   const d={protocol:'SEC_TICKER_LITERAL_V1',firstObservedAt:prior?.firstObservedAt||at,checkedAt:at,m:original,conflicts:[...conflicts],rejectedRows:rejected,ambiguousCiks:ambiguous,status:conflicts.size?'CONFLICT':rejected||ambiguous?'PARTIAL_OR_UNKNOWN':'OBSERVED'};
   write(file,d);return d;
  }catch(e){const reason=/^(HTTP_\d+|RATE_LIMIT_PAUSE|REQUEST_TIME_BUDGET|SOURCE_BYTE_BUDGET|SOURCE_BODY_MISSING|TICKER_SCHEMA|TICKER_EMPTY_UNIVERSE)$/.test(e.message)?e.message:'FETCH_OR_TICKER_UNAVAILABLE';errors.push({source:'tickers',reason});if(prior)write(file,{...prior,status:'UNKNOWN',lastAttempt:{at:new Date(now()).toISOString(),reason}});return {status:'UNKNOWN',m:{},reason};}
 }
 return {quarter,tickers,telemetry:()=>({attempts,bytes,rateLimited:paused,errors})};
}
