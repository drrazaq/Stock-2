// NYSE cash-equity calendar, explicitly bounded to reviewed 2026/2027 dates.
// Source: https://www.nyse.com/markets/hours-calendars . Unknown years fail closed.
const holidays=new Set(['2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25','2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24']);
const early=new Set(['2026-11-27','2026-12-24','2027-11-26']);
export function marketSession(day) {
 const valid=typeof day==='string'&&/^202[67]-\d{2}-\d{2}$/.test(day)&&Number.isFinite(Date.parse(day+'T12:00:00Z'))&&new Date(day+'T12:00:00Z').toISOString().slice(0,10)===day;
 const closed=!valid||[0,6].includes(new Date(day+'T12:00:00Z').getUTCDay())||holidays.has(day);
 return {day,known:valid,closed,open:closed?null:570,close:closed?null:early.has(day)?780:960};
}

export function marketClock(ms=Date.now()) {
 if(typeof ms!=='number'||!Number.isFinite(ms))return {known:false,day:null,phase:'UNKNOWN',minutes:null};
 const p={};new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(ms)).forEach(x=>p[x.type]=x.value);
 const day=p.year+'-'+p.month+'-'+p.day,minutes=Number(p.hour)*60+Number(p.minute),s=marketSession(day);
 const phase=!s.known?'UNKNOWN':s.closed?'CLOSED':minutes>=240&&minutes<s.open?'PRE_MARKET':minutes>=s.open&&minutes<s.close?'REGULAR':minutes>=s.close&&minutes<1200?'AFTER_HOURS':'CLOSED';
 return {...s,minutes,seconds:Number(p.second),phase};
}
export function completedMarketSession(ms=Date.now()) {
 const n=marketClock(ms);if(!n.known)return null;
 for(let k=0;k<10;k++){const day=new Date(Date.parse(n.day+'T12:00:00Z')-k*864e5).toISOString().slice(0,10),s=marketSession(day);
  if(!s.known)return null;if(s.closed||k===0&&n.minutes<s.close)continue;return day;
 }return null;
}

export function nightlyScanEvidence(snapshot,now=Date.now()){
 const n=marketClock(now),expected=completedMarketSession(now),due=!!expected&&(n.day>expected||n.minutes>=1230);
 const have=snapshot?.session,s=marketSession(have),generated=typeof snapshot?.generatedAt==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(snapshot.generatedAt)?Date.parse(snapshot.generatedAt):NaN;
 const valid=s.known&&!s.closed&&typeof have==='string'&&!!expected&&have<=expected;
 const state=!expected||!valid||!Number.isFinite(generated)||generated>now||completedMarketSession(generated)!==have?'UNKNOWN':have===expected?'CURRENT':due?'LATE':'PENDING';
 return {expected,have:valid?have:null,due,state,generatedAt:Number.isFinite(generated)&&generated<=now?snapshot.generatedAt:null};
}
