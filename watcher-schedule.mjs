// Shared, inactive scheduling contract. No provider/client imports or credentials.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {marketSession} from './market-session.mjs';
export function watcherClock(ms=Date.now()) {
 const p={};new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZoneName:'shortOffset'}).formatToParts(new Date(ms)).forEach(x=>p[x.type]=x.value);
 const o=String(p.timeZoneName).match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
 return {day:p.year+'-'+p.month+'-'+p.day,minute:+p.hour*60+ +p.minute,offset:o?(o[1]==='-'?-1:1)*(+o[2]*60+ +(o[3]||0)):null};
}
export function watcherDayBounds(day) {
 const midnight=d=>{let t=Date.parse(d+'T00:00:00Z');for(let i=0;i<3;i++)t=Date.parse(d+'T00:00:00Z')-watcherClock(t).offset*60000;return t;};
 const next=new Date(Date.parse(day+'T12:00:00Z')+864e5).toISOString().slice(0,10);
 return {from:new Date(midnight(day)).toISOString(),to:new Date(midnight(next)-1000).toISOString()};
}
export function watcherAdmission({nowMs=Date.now(),eventName,schedule,day,minute,earliestMinute=550,endMinute=900}={}) {
 const c=watcherClock(nowMs),d=day||c.day,m=minute??c.minute,session=marketSession(d);
 const context={eventName:eventName||'local',schedule:schedule||null,utcOffsetMinutes:c.offset};
 const no=reason=>({run:false,reason,day:d,minute:m,endMinute,...context});
 if(session.closed)return no('CLOSED_OR_UNKNOWN_SESSION');
 if(eventName==='schedule') {
  const crons={'45 12 * * 1-5':-240,'45 13 * * 1-5':-300,'10 13 * * 1-5':-240,'10 14 * * 1-5':-300};
  if(!(schedule in crons))return no('UNSUPPORTED_CRON');
  if(crons[schedule]!==c.offset)return no('OPPOSITE_DST_CRON');
 } else if(eventName&&!['workflow_dispatch'].includes(eventName))return no('UNSUPPORTED_EVENT');
 if(!Number.isInteger(m)||m<earliestMinute)return no('TOO_EARLY_FOR_BOUNDED_JOB');
 if(m>endMinute)return no('CONFIGURED_WINDOW_ENDED');
 return {run:true,reason:m<565?'PREOPEN_WAIT':m>565?'LATE_PARTIAL_START':'READY',day:d,minute:m,endMinute,...context};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 const x=watcherAdmission({eventName:process.env.GITHUB_EVENT_NAME,schedule:process.env.IG_SCHEDULE});
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'run='+x.run+'\nreason='+x.reason+'\n');
 console.log('watcher admission: '+JSON.stringify(x));
}
