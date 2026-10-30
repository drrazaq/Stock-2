// Read-only reporting. A process start, a summary count and an observed market minute are distinct evidence.
import fs from 'node:fs';
import path from 'node:path';
import {marketSession} from './market-session.mjs';
const day=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\d$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const minute=x=>typeof x==='string'&&/^\d\d:\d\d$/.test(x)&&+x.slice(0,2)<24&&+x.slice(3)<60?+x.slice(0,2)*60+ +x.slice(3):null;
export const watchMinute=m=>m===null?'UNKNOWN':String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
export function uniqueWatcherDays(rows){
 const by=new Map();let rejected=0,duplicates=0;
 for(const x of rows||[]){if(!x||!day(x.day)){rejected++;continue;}const prior=by.get(x.day);if(prior)duplicates++;
  const count=r=>Number.isSafeInteger(r.minutes)&&r.minutes>=0?r.minutes:0;
  // A poorer late duplicate cannot replace the longer recorded population. Ties retain the first, never best P&L.
  if(!prior||count(x)>count(prior))by.set(x.day,x);
 }
 return {rows:[...by.values()].sort((a,b)=>a.day.localeCompare(b.day)),duplicates,rejected};
}
export function watcherReport(summaries=[],snapshots=[]){
 const u=uniqueWatcherDays(summaries),days=[...u.rows.map(x=>x.day),...snapshots.filter(x=>day(x?.day)).map(x=>x.day)].sort(),latest=days.at(-1);
 if(!latest)return {day:null,opening:'UNKNOWN',complete:false,actionable:true,text:'watcher coverage UNKNOWN: no dated observation evidence'};
 const s=marketSession(latest),open=s.open||570,close=s.close||960,beats=new Map();
 for(const x of snapshots.filter(x=>x?.day===latest))for(const b of Array.isArray(x.heartbeat)?x.heartbeat:[]){if(Number.isInteger(b?.m)&&b.m>=0&&b.m<1440&&b.received>0&&b.evaluated>0)beats.set(b.m,b);}
 const minutes=[...beats.keys()].sort((a,b)=>a-b),regular=minutes.filter(m=>m>=open&&m<close),missing=Array.from({length:close-open},(_,i)=>open+i).filter(m=>!beats.has(m));
 const daily=u.rows.find(x=>x.day===latest),firsts=summaries.filter(x=>x?.day===latest).map(x=>minute(x.firstMinute)).filter(x=>x!==null),firstReported=firsts.length?Math.min(...firsts):null;
 const opening=beats.has(open)?'OBSERVED':'UNKNOWN',complete=s.known&&!s.closed&&missing.length===0;
 const legacyOnly=!!daily&&(daily.minutes||0)>regular.length;
 const declared=snapshots.filter(x=>x?.day===latest&&x.configuredWindow?.open===open&&Number.isInteger(x.configuredWindow?.endExclusive)&&x.configuredWindow.endExclusive>open&&x.configuredWindow.endExclusive<=close).map(x=>x.configuredWindow.endExclusive);
 const configuredEnd=declared.length?Math.max(...declared):Math.min(close,901), configuredExpected=configuredEnd-open, configuredMissing=missing.filter(m=>m<configuredEnd), configuredMinutes=configuredExpected-configuredMissing.length;
 let longestGap=0,streak=0;for(let m=open;m<configuredEnd;m++){streak=beats.has(m)?0:streak+1;longestGap=Math.max(longestGap,streak);}
 const configuredComplete=s.known&&!s.closed&&configuredMissing.length===0;
 const delivery=snapshots.filter(x=>x?.day===latest&&Number.isFinite(x.messageDelivery?.generatedAt)).sort((a,b)=>b.messageDelivery.generatedAt-a.messageDelivery.generatedAt)[0]?.messageDelivery;
 const actionable=delivery?.unhealthy===true||!s.known||(!s.closed&&(opening!=='OBSERVED'||configuredMissing.length/configuredExpected>0.05||longestGap>=3));
 const outside=regular.filter(m=>m>=configuredEnd).length, outsideExpected=close-configuredEnd;
 const text='watcher evidence on '+latest+': opening minute '+opening+'; configured '+watchMinute(open)+'–'+watchMinute(configuredEnd-1)+' inclusive: '+configuredMinutes+'/'+configuredExpected+' usable minutes ('+configuredMissing.length+' gaps; longest '+longestGap+'); full cash session '+regular.length+'/'+(close-open)+' usable retained regular-session minutes; '+watchMinute(configuredEnd)+'–'+watchMinute(close-1)+' outside configured window: '+outside+'/'+outsideExpected+' observed (known coverage limit, not a daily fault)'+(minutes.length?'; first retained observation '+watchMinute(minutes[0])+' New York':'')+(firstReported!==null?'; daily summaries report first '+watchMinute(firstReported)+' (summary only)':'')+(legacyOnly?'; earlier summary has additional minutes without retained heartbeat proof':'')+'; '+(complete?'full-session minute coverage observed':'full-session coverage NOT ESTABLISHED')+(u.duplicates?'; '+u.duplicates+' duplicate daily summaries excluded':'')+(delivery?'; message recovery: '+delivery.retryWaiting+' waiting, '+delivery.retryExhausted+' exhausted, '+delivery.pendingFinalizations+' unpublished outcomes, '+delivery.uncertainStates+' reserved/uncertain (never replayed)':'');
 return {day:latest,opening,complete,configuredComplete,actionable,messageDelivery:delivery,configuredExpected,configuredMinutes,configuredMissing,longestGap,outsideExpected,outside,regularMinutes:regular.length,expected:close-open,first:minutes[0]??null,missing,firstReported,legacyOnly,duplicateSummaries:u.duplicates,text};
}
export function readWatcherReport(directory='data'){
 const read=p=>{try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return null;}}, rows=[];
 try{for(const l of fs.readFileSync(path.join(directory,'ignition-days.jsonl'),'utf8').split('\n')){try{rows.push(JSON.parse(l));}catch{}}}catch{}
 const snapshots=[read(path.join(directory,'ignition-live.json'))].filter(Boolean),date=uniqueWatcherDays(rows).rows.at(-1)?.day||snapshots[0]?.day;
 if(day(date)){const dir=path.join(directory,'ignition-runs',date);try{for(const f of fs.readdirSync(dir).filter(f=>/^[A-Za-z0-9_-]+\.json$/.test(f))){const x=read(path.join(dir,f));if(x)snapshots.push(x);}}catch{}}
 return watcherReport(rows,snapshots);
}
export function missedRunnerPopulation(rows){
 const u=uniqueWatcherDays(rows),tally={};for(const r of u.rows)for(const [k,v]of Object.entries(r.tally||{}))if(Number.isSafeInteger(v)&&v>=0)tally[k]=(tally[k]||0)+v;
 return {...u,tally,count:Object.values(tally).reduce((a,b)=>a+b,0),alerts:u.rows.reduce((n,x)=>n+(Number.isSafeInteger(x.alerts)&&x.alerts>=0?x.alerts:0),0),coverageKnownComplete:u.rows.length>0&&u.rows.every(x=>x.sessionComplete===true),instrumentScope:'UNVERIFIED_MIXED_INSTRUMENTS',uniqueSecurityDays:'NOT_ESTABLISHED_FROM_AGGREGATE_TALLIES'};
}
export function uniqueMoverRows(rows){
 const by=new Map();let duplicates=0,rejected=0,conflicts=0;
 for(const x of rows||[]){if(!x||!day(x.d)||typeof x.sym!=='string'||!/^[A-Z][A-Z0-9.\-]{0,14}$/.test(x.sym)){rejected++;continue;}const k=x.d+'|'+x.sym;if(by.has(k)){duplicates++;if(JSON.stringify(by.get(k))!==JSON.stringify(x))conflicts++;continue;}by.set(k,x);}
 return {rows:[...by.values()],duplicates,rejected,conflicts,identity:'LITERAL_SYMBOL_DAY_ONLY_NOT_AUTHENTICATED_SECURITY'};
}
