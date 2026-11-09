// WATCHER GUARD (owner, 28 Oct 2026, V3.0 item 4 "startup reliability"). Pure decision; watcher-guard.mjs does the GitHub and Telegram calls.
// WHY: GitHub's cron queue started the live watcher 33-44 minutes late every day (9:38-9:49 New York) and about 2 hours late on 26 Oct
// (11:10), so moving the cron earlier cannot be trusted alone. The bot job runs all day (one ~5.5 h run after another), so every 5 minutes
// it asks GitHub whether the watcher is running and, if it is not running by 9:10 New York on a market day, starts it with a
// workflow_dispatch (GitHub allows that event from the job's own token) and tells the owner. It also measures the real start time.
// New York time comes from Intl (America/New_York), so daylight saving is automatic (summer UTC-4, winter UTC-5 from 1 Nov 2026).
// Market holidays: the NYSE full-day closures below (update every December); half days still run.
export const HOLIDAYS = ['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'];
import {marketSession} from './market-session.mjs';
export const WINDOW = { from: 550, to: 955, startUntil: 930, wantBy: 565 };
export const fmt = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
export function nyParts(ms) {
  const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value);
  return { d: p.year + '-' + p.month + '-' + p.day, min: +p.hour * 60 + +p.minute, wd: p.weekday };
}
export const marketDay = (n, holidays = HOLIDAYS) => !marketSession(n.d).closed && !holidays.includes(n.d);

// Run-level run_started_at can equal queue creation (October 28 incident).
// Only the actual `watch` job establishes job start; it still does not prove
// fresh quotes, minute-loop activity or complete market-session coverage.
export function watcherJobEvidence(run, jobs, nowMs = Date.now()) {
  const unknown={...run,jobEvidence:'UNKNOWN',jobStartedAt:null,jobCompletedAt:null};
  if(!Array.isArray(jobs))return unknown;
  const all=jobs.filter(j=>['watch','close'].includes(j?.name));
  if(!all.length||new Set(all.map(j=>j.name)).size!==all.length)return unknown;
  const isNoop=j=>j.steps?.some(x=>x.name==='Check watcher admission'&&x.conclusion==='success')&&j.steps?.some(x=>x.name==='Observe configured session'&&x.conclusion==='skipped');
  const matching=all.filter(j=>!isNoop(j));
  if(!matching.length)return {...unknown,jobEvidence:'NON_OBSERVING',jobStatus:'completed',observationState:'SKIPPED_ADMISSION'};
  const job=matching.find(j=>j.status==='in_progress')||matching.find(j=>['queued','waiting','pending'].includes(j.status))||matching.at(-1);
  const steps=job.steps,admission=steps?.find(x=>x.name==='Check watcher admission'),observe=steps?.find(x=>x.name==='Observe configured session'||x.name==='Run set -o pipefail');
  const noOp=admission?.conclusion==='success'&&observe?.conclusion==='skipped';
  if(noOp)return {...unknown,jobEvidence:'NON_OBSERVING',jobStatus:job.status,observationState:'SKIPPED_ADMISSION'};
  const valid=t=>Number.isFinite(Date.parse(t))&&Date.parse(t)<=nowMs;
  const starts=matching.filter(j=>['in_progress','completed'].includes(j.status)&&valid(j.started_at)).map(j=>j.started_at).sort((a,b)=>Date.parse(a)-Date.parse(b));
  const measured=starts.length>0;
  const completed=measured&&valid(job.completed_at)&&Date.parse(job.completed_at)>=Date.parse(job.started_at);
  return {...unknown,jobEvidence:measured?'MEASURED':'UNKNOWN',jobStatus:job.status,
    jobStartedAt:measured?starts[0]:null,jobCompletedAt:completed?job.completed_at:null,
    observationStartedAt:valid(observe?.started_at)&&observe?.conclusion!=='skipped'?observe.started_at:null,
    observationCompletedAt:valid(observe?.completed_at)&&observe?.conclusion!=='skipped'?observe.completed_at:null,
    observationState:observe?.status||'UNKNOWN'};
}

// runs: GitHub workflow runs of ignition.yml [{ id, status, conclusion, created_at, run_started_at, updated_at }]
// state: { d, started, dispatched: [min...] (every reservation; legacy-compatible), attempts: [{min,status}], alerted: {kind: true} }   returns { state, dispatch, alerts: [text] }
export function guardDecide(nowMs, runs = [], state0 = {}, holidays = HOLIDAYS, config = {}) {
  const n = nyParts(nowMs), alerts = []; let dispatch = false;
  const session=marketSession(n.d),configuredEnd=Math.min(config.endMinute??900,session.close||900),windowEnd=session.closed?0:configuredEnd+5,startUntil=session.closed?0:Math.min(840,configuredEnd-30);
  const state = state0 && state0.d === n.d ? { ...state0, dispatched: [...(state0.dispatched || [])], alerted: { ...(state0.alerted || {}) } } : { d: n.d, started: null, dispatched: [], alerted: {} };
  // Old `dispatched` entries were recorded before HTTP acknowledgment. Retain
  // them as unknown attempts for rate limiting, never as accepted requests.
  state.attempts = state.version===2 ? (state.attempts||[]).map(x=>({...x})) : state.dispatched.map(min=>({min,status:'UNCONFIRMED_LEGACY'}));
  // Rollback compatibility (standalone rev3, Codex 6733778910 R-B): `dispatched` mirrors EVERY start reservation (the pre-repair guard's
  // own meaning, recorded before acknowledgment), so a pre-repair guard restored by a rollback keeps its 15-minute spacing and 3-attempt
  // cap. A pre-repair guard copies version-2 fields forward but appends only to `dispatched`; any reservation it added there is
  // reconciled here as an UNCONFIRMED_LEGACY attempt, never as an accepted request. Acceptance is read from attempt statuses only.
  if(state.version===2){const left=state.attempts.map(a=>a.min);for(const m of state.dispatched){const i=left.indexOf(m);if(i>=0)left.splice(i,1);else state.attempts.push({min:m,status:'UNCONFIRMED_LEGACY'});}state.attempts.sort((a,b)=>a.min-b.min);}
  state.dispatched=state.attempts.map(a=>a.min);
  state.version=2;
  if (state.startedSource !== 'github_job') state.started = null;
  if (!marketDay(n, holidays) || n.min < WINDOW.from || n.min > windowEnd) return { state, dispatch, alerts, why: 'outside the check window' };
  const today=runs.filter(r=>[r?.created_at,r?.jobStartedAt].some(t=>Number.isFinite(Date.parse(t))&&nyParts(Date.parse(t)).d===n.d));
  const relevant=today.filter(r=>r.jobEvidence!=='NON_OBSERVING');
  const waiting=r=>['queued','waiting','requested','pending'].includes(r.status)||(['queued','waiting','pending'].includes(r.jobStatus));
  const queued=relevant.filter(waiting),running=relevant.filter(r=>r.status==='in_progress'&&!waiting(r));
  const measured=relevant.filter(r=>r.jobEvidence==='MEASURED'&&Number.isFinite(Date.parse(r.jobStartedAt))&&Date.parse(r.jobStartedAt)<=nowMs);
  const earliest=measured.slice().sort((a,b)=>Date.parse(a.jobStartedAt)-Date.parse(b.jobStartedAt))[0];
  if(earliest){const sm=nyParts(Date.parse(earliest.jobStartedAt)).min;if(state.started===null||sm<state.started){state.started=sm;state.startedRunId=earliest.id??null;}state.startedSource='github_job';}
  const completed=measured.filter(r=>r.status==='completed'&&Number.isFinite(Date.parse(r.jobCompletedAt)));
  const watched=completed.filter(r=>Date.parse(r.jobCompletedAt)-Date.parse(r.jobStartedAt)>10*60000);
  const early=watched.filter(r=>nyParts(Date.parse(r.observationCompletedAt||r.jobCompletedAt)).min<configuredEnd);
  // Inspect ended runs before the active/queued branches: a later duplicate must not hide the first stop.
  if(early.length&&!state.alerted.stopped){state.alerted.stopped=true;state.earlyStops=early.map(r=>({runId:r.id??null,endedAt:r.observationCompletedAt||r.jobCompletedAt}));alerts.push('WATCHER STOPPED EARLY: a verified earlier watch job ended before the configured '+fmt(configuredEnd)+' New York boundary. A later active/queued run does not erase this earlier stop. Observation gaps require retained heartbeat evidence; job duration alone does not establish coverage. No automatic restart; preserve both run archives.');}
  if(earliest&&config.historyComplete!==false&&!relevant.some(r=>!waiting(r)&&r.jobEvidence!=='MEASURED')&&state.started>WINDOW.wantBy+10&&!state.alerted.late){state.alerted.late=true;alerts.push('WATCHER STARTED LATE: the earliest verified watch job in the inspected day records started at '+fmt(state.started)+' New York (it should run by 9:25). Run creation is not job start; opening coverage remains unverified.');}
  if(running.length){
    if(!running.some(r=>r.jobEvidence==='MEASURED')){if(n.min>=WINDOW.wantBy&&!state.alerted.unverified){state.alerted.unverified=true;alerts.push('WATCHER JOB UNVERIFIED: active workflow without a verified watch-job start; coverage unknown.');}return {state,dispatch,alerts,why:'workflow active; job start unverified'};}
    state.activeJobs=running.filter(r=>r.jobEvidence==='MEASURED').map(r=>({runId:r.id??null,startedAt:r.jobStartedAt}));state.activeRunIds=state.activeJobs.map(r=>r.runId);
    return {state,dispatch,alerts,why:'active watch job(s) '+state.activeJobs.map(r=>String(r.runId??'unidentified')+' since '+fmt(nyParts(Date.parse(r.startedAt)).min)).join(', ')+'; earliest verified day job '+String(state.startedRunId??'unidentified')+' at '+fmt(state.started)+'; market coverage unverified'};
  }
  if(queued.length){if(n.min>=WINDOW.wantBy&&!state.alerted.queued){state.alerted.queued=true;alerts.push('WATCHER WAITING: GitHub has another watcher queued at '+fmt(n.min)+' New York. A queue is not observation evidence.');}return {state,dispatch,alerts,why:'queued; prior session evidence retained'};}
  if(config.historyComplete===false){if(!state.alerted.historyUnknown){state.alerted.historyUnknown=true;alerts.push('WATCHER HISTORY UNKNOWN: bounded GitHub history/job lookup incomplete; no start inferred or duplicate requested.');}return {state,dispatch,alerts,why:'history incomplete'};}
  if(watched.length)return {state,dispatch,alerts,why:early.length?'watched today, then stopped':'job ended at configured boundary; inspect heartbeat coverage'};
  if(relevant.some(r=>r.status==='completed'&&(r.jobEvidence!=='MEASURED'||!r.jobCompletedAt))){if(!state.alerted.unverified){state.alerted.unverified=true;alerts.push('WATCHER JOB UNVERIFIED: completed workflow without valid watch-job timing; coverage unknown.');}return {state,dispatch,alerts,why:'completed workflow; job duration unverified'};}
  const last = state.attempts.length ? state.attempts[state.attempts.length - 1].min : null;
  if (n.min > startUntil) return { state, dispatch, alerts, why: 'not running, too late to start' };
  if (state.attempts.length < 3 && (last === null || n.min - last >= 15)) {
    dispatch = true; state.attempts.push({min:n.min,status:'PENDING'}); state.dispatched.push(n.min);
    alerts.push('WATCHER NOT STARTED by ' + fmt(n.min) + ' New York: requesting a start (attempt ' + state.attempts.length + ' of 3); execution is not confirmed.');
  } else if (state.attempts.length >= 3 && !state.alerted.gaveUp) { state.alerted.gaveUp = true; alerts.push('WATCHER DOWN: 3 start attempts without confirmed execution (last ' + fmt(last) + ' New York). No live watch confirmed. Send this to Claude.'); }
  return { state, dispatch, alerts, why: 'not running' };
}
