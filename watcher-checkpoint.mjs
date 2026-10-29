import fs from 'node:fs';
import {writeRuntimeJson} from './watcher-heartbeat.mjs';
export function readCheckpoint(file,{day,sourceSha,beforeMinute=960}) {
 try{
  const x=JSON.parse(fs.readFileSync(file,'utf8'));
  if(x.version!==1||x.day!==day||x.sourceSha!==sourceSha||!Array.isArray(x.beat)||!x.state||!x.early||!Array.isArray(x.shadow))return null;
  const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
  if(['seen','orb','vis','ser','pull','earlyWave','preIgnition','STOP_SENT','vcToday','RADAR'].some(k=>!object(x.state[k]))||!Array.isArray(x.state.triggers)||!object(x.early.seen)||!object(x.early.sent)||
    x.beat.some(b=>!b||!Number.isInteger(b.m)||b.m<540||b.m>=beforeMinute)||JSON.stringify(x).includes('"__proto__":'))return null;
  if(!Number.isInteger(x.state.alerts)||x.state.alerts<0||!Number.isInteger(x.state.earlyAlerts)||x.state.earlyAlerts<0)return null;
  return x;
 }catch{return null;}
}
export function saveCheckpoint(file,value) {writeRuntimeJson(file,{...value,version:1});}
