// Revision evidence only; never authorizes a message or treats a revision as an
// independent catalyst. Legacy reservations remain unresolved, never replayed.
import {createHash} from 'node:crypto';
const object=x=>x&&typeof x==='object'&&!Array.isArray(x);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function validNewsRevisions(rows){
 return object(rows)&&Object.keys(rows).length<=10000&&Object.entries(rows).every(([key,x])=>/^[a-f0-9]{64}$/.test(key)&&object(x)&&['OBSERVED','CONFLICT','LEGACY_UNRESOLVED'].includes(x.status)&&/^[a-f0-9]{64}$/.test(x.firstRevision)&&object(x.revisions)&&Object.keys(x.revisions).length<=32&&Object.entries(x.revisions).every(([k,v])=>/^[a-f0-9]{64}$/.test(k)&&object(v)&&typeof v.firstObservedAt==='string'&&Number.isFinite(Date.parse(v.firstObservedAt)))&&!!x.revisions[x.firstRevision]);
}
export function observeNewsRevision(book,{key,row,at,legacyReserved=false}){
 if(!object(book)||typeof key!=='string'||!key||!Number.isFinite(Date.parse(at)))throw Error('NEWS_REVISION_STATE_UNREADABLE');
 if(!row||row.id!=null&&!(typeof row.id==='number'&&Number.isFinite(row.id)&&row.id>0||typeof row.id==='string'&&row.id.trim().length>0&&row.id.length<=256)||typeof row.headline!=='string'||typeof row.datetime!=='number'||!Number.isFinite(row.datetime)||row.datetime<=0||row.datetime*1000>Date.parse(at)||row.summary!=null&&typeof row.summary!=='string'||row.url!=null&&typeof row.url!=='string')return {eligible:false,reason:'INVALID_REVISION_RECORD'};
 const revision=hash([row.headline.trim(),row.summary||'',row.url||'',row.datetime]),id=hash(key);let entry=book[id];if(entry&&!validNewsRevisions({[id]:entry}))throw Error('NEWS_REVISION_STATE_UNREADABLE');if(entry&&Date.parse(entry.revisions[entry.firstRevision].firstObservedAt)>Date.parse(at))return {eligible:false,reason:'INVALID_REVISION_CHRONOLOGY'};
 if(!entry){if(Object.keys(book).length>=10000)return {eligible:false,reason:'REVISION_CAPACITY'};entry=book[id]={status:legacyReserved?'LEGACY_UNRESOLVED':'OBSERVED',firstRevision:revision,revisions:{[revision]:{firstObservedAt:at}}};}
 else if(!entry.revisions[revision]){entry.status='CONFLICT';if(Object.keys(entry.revisions).length<32)entry.revisions[revision]={firstObservedAt:at};}
 return {eligible:entry.status==='OBSERVED',reason:entry.status,revision,logicalId:id,firstObservedAt:entry.revisions[entry.firstRevision].firstObservedAt};
}
