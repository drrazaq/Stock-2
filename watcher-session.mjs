// Session identity and publication policy. Selection uses observation coverage, never returns.
import { sessionCoverage } from './session-coverage.mjs';
import {marketSession} from './market-session.mjs';
export function sessionEvidence(snapshot) {
  if (!snapshot || typeof snapshot.day !== 'string') return {minutes:0,usableMinutes:0,first:null,last:null,complete:false};
  const session=marketSession(snapshot.day), close=session.close||960;
  if (Array.isArray(snapshot.heartbeat) && snapshot.heartbeat.length) {
    const ms=[...new Set(snapshot.heartbeat.map(x=>x.m).filter(m=>Number.isInteger(m)&&m>=570&&m<close))].sort((a,b)=>a-b);
    const c=sessionCoverage(snapshot.heartbeat,snapshot.day);
    const useful=new Set(snapshot.heartbeat.filter(x=>x.received>0&&x.evaluated>0&&Number.isInteger(x.m)&&x.m>=570&&x.m<close).map(x=>x.m)).size;
    return {minutes:ms.length,usableMinutes:useful,first:ms[0]??null,last:ms.at(-1)??null,complete:c.complete};
  }
  // Legacy daily summaries lack per-minute proof. Use their counts only to avoid replacing
  // an existing longer record; never upgrade them to a verified complete session.
  const c=snapshot.coverage||snapshot, minutes=Number.isFinite(c.observedMinutes)?c.observedMinutes:Number.isFinite(c.minutesWatched)?c.minutesWatched:Number.isFinite(c.minutes)?c.minutes:0;
  return {minutes:Math.max(0,minutes),usableMinutes:0,first:null,last:null,complete:false};
}
export function sessionFinished(snapshot, day) {
  const e=sessionEvidence(snapshot);
  const s=marketSession(day);
  return snapshot?.day===day && !s.closed && e.complete && e.usableMinutes>=s.close-s.open && e.last>=s.close-1;
}
export function preferSession(existing, candidate) {
  if (!candidate || !candidate.day) return false;
  if (!existing || existing.day!==candidate.day) return true;
  const a=sessionEvidence(existing),b=sessionEvidence(candidate);
  // Legacy duration protects the recorded day when heartbeat proof is absent.
  // A short retry cannot outrank it solely because it has newer telemetry.
  if ((!Array.isArray(existing.heartbeat) || !existing.heartbeat.length) && b.minutes < a.minutes) return false;
  if(b.usableMinutes!==a.usableMinutes)return b.usableMinutes>a.usableMinutes;
  if(b.minutes!==a.minutes)return b.minutes>a.minutes;
  if(b.first!==null && a.first!==null && b.first!==a.first)return b.first<a.first;
  // An equal-size rerun must not overwrite earlier evidence or duplicate its messages.
  return false;
}
export function runIdentity(env={}, now=Date.now()) {
  const id=String(env.GITHUB_RUN_ID||'local-'+now),attempt=String(env.GITHUB_RUN_ATTEMPT||1);
  if(!/^[A-Za-z0-9_-]+$/.test(id)||!/^\d+$/.test(attempt))throw new Error('invalid watcher run identity');
  const segment=env.IG_SEGMENT;
  if(segment && !['open','close'].includes(segment))throw new Error('invalid watcher segment');
  return id+'-'+attempt+(segment?'-'+segment:'');
}
export function chooseDailySummary(rows,day) {
  const same=rows.filter(x=>x?.day===day);
  return same.reduce((best,x)=>{
    if(!best)return x;
    // Never select by P&L. Legacy summaries use discovery counts only when duration
    // was not recorded; this fallback is explicitly measurement quality, not coverage proof.
    const rank=r=>[Number.isFinite(r.sessionMinutes)?r.sessionMinutes:0,Number.isFinite(r.detected)?r.detected:0];
    const a=rank(best),b=rank(x);return b[0]>a[0]||(b[0]===a[0]&&b[1]>a[1])?x:best;
  },null);
}
