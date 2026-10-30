import {quoteEvidenceState} from './research-quote-followups.mjs';
import fs from 'node:fs';
import {writeRuntimeJson} from './watcher-heartbeat.mjs';
export function readCheckpoint(file,{day,sourceSha,beforeMinute=960,requireResearch=false}) {
 try{
  if(fs.statSync(file).size>128*1024*1024)return null;
  const x=JSON.parse(fs.readFileSync(file,'utf8'));
  if(x.version!==1||x.day!==day||x.sourceSha!==sourceSha||!Array.isArray(x.beat)||!x.state||!x.early||!Array.isArray(x.shadow))return null;
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if(['seen','orb','vis','ser','pull','earlyWave','preIgnition','STOP_SENT','vcToday','RADAR'].some(k=>!object(x.state[k]))||!Array.isArray(x.state.triggers)||!object(x.early.seen)||!object(x.early.sent)||
    x.beat.some(b=>!b||!Number.isInteger(b.m)||b.m<540||b.m>=beforeMinute)||JSON.stringify(x).includes('"__proto__":'))return null;
  if(!Number.isInteger(x.state.alerts)||x.state.alerts<0||!Number.isInteger(x.state.earlyAlerts)||x.state.earlyAlerts<0)return null;
  if(requireResearch){
   const d=x.state.DISCOVERY,clock=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v)),nonnegative=v=>Number.isInteger(v)&&v>=0;
   if(!object(d)||!['observations','crossings','firstFresh','funnel','suppressed','sourceReliability'].every(k=>object(d[k]))||Object.keys(d.observations).length>20000||!['attempts','accepted','duplicates','invalid','unknownPrice'].every(k=>nonnegative(d.funnel[k]))||d.funnel.accepted>d.funnel.attempts)return null;
   if(d.lastCycleAt!==undefined&&(!clock(d.lastCycleAt)||Date.parse(d.lastCycleAt)>Date.now()))return null;
   if(Object.values(d.observations).some(o=>!object(o)||typeof o.symbol!=='string'||!clock(o.observedAt)||!clock(o.asOf)||Date.parse(o.asOf)>Date.parse(o.observedAt)||o.priceAtDetection!==null&&!(typeof o.priceAtDetection==='number'&&Number.isFinite(o.priceAtDetection)&&o.priceAtDetection>0)))return null;
   if(d.paperQuoteEvidence!==undefined){const q=d.paperQuoteEvidence;if(!object(q)||q.version!==1||!['events','quotes','metadata','counters','sourceStatus'].every(k=>object(q[k]))||Object.keys(quoteEvidenceState().counters).some(k=>!nonnegative(q.counters[k]))||!(q.lastCycleAt===null||clock(q.lastCycleAt)&&Date.parse(q.lastCycleAt)<=Date.now())||Object.keys(q.events).length>1000||Object.keys(q.quotes).length>30000||Object.keys(q.metadata).length>2000||Object.values(q.events).some(e=>!object(e)||typeof e.eventId!=='string'||typeof e.symbol!=='string'||!clock(e.observedAt))||Object.values(q.quotes).some(p=>!object(p)||typeof p.symbol!=='string'||!clock(p.at)||!clock(p.quoteAsOf)||Date.parse(p.quoteAsOf)>Date.parse(p.at)||typeof p.bid!=='number'||!Number.isFinite(p.bid)||p.bid<=0||typeof p.ask!=='number'||!Number.isFinite(p.ask)||p.ask<p.bid))return null;}
  }
  return x;
 }catch{return null;}
}
export function saveCheckpoint(file,value) {writeRuntimeJson(file,{...value,version:1});}
