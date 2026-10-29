// WATCHER GUARD (owner, 28 Oct 2026, V3.0 item 4 "startup reliability"). Pure decision; watcher-guard.mjs does the GitHub and Telegram calls.
// WHY: GitHub's cron queue started the live watcher 33-44 minutes late every day (9:38-9:49 New York) and about 2 hours late on 26 Oct
// (11:10), so moving the cron earlier cannot be trusted alone. The bot job runs all day (one ~5.5 h run after another), so every 5 minutes
// it asks GitHub whether the watcher is running and, if it is not running by 9:10 New York on a market day, starts it with a
// workflow_dispatch (GitHub allows that event from the job's own token) and tells the owner. It also measures the real start time.
// New York time comes from Intl (America/New_York), so daylight saving is automatic (summer UTC-4, winter UTC-5 from 1 Nov 2026).
// Market holidays: the NYSE full-day closures below (update every December); half days still run.
export const HOLIDAYS = ['2026-11-26', '2026-12-25', '2027-01-01', '2027-01-18', '2027-02-15', '2027-03-26', '2027-05-31', '2027-06-18', '2027-07-05', '2027-09-06', '2027-11-25', '2027-12-24'];
export const WINDOW = { from: 550, to: 895, startUntil: 840, wantBy: 565 };   // check 9:10-14:55 New York, start it until 14:00; it should run by 9:25
export const fmt = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
export function nyParts(ms) {
  const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value);
  return { d: p.year + '-' + p.month + '-' + p.day, min: +p.hour * 60 + +p.minute, wd: p.weekday };
}
export const marketDay = (n, holidays = HOLIDAYS) => !['Sat', 'Sun'].includes(n.wd) && !holidays.includes(n.d);

// Run-level run_started_at can equal queue creation (October 28 incident).
// Only the actual `watch` job establishes job start; it still does not prove
// fresh quotes, minute-loop activity or complete market-session coverage.
export function watcherJobEvidence(run, jobs, nowMs = Date.now()) {
  const unknown = {...run, jobEvidence:'UNKNOWN', jobStartedAt:null, jobCompletedAt:null};
  if (!Array.isArray(jobs)) return unknown;
  const matching = jobs.filter(j=>j?.name==='watch');
  if (matching.length !== 1) return unknown;
  const job=matching[0], started=Date.parse(job.started_at), completed=Date.parse(job.completed_at);
  const active=['in_progress','completed'].includes(job.status);
  const measured=active && Number.isFinite(started) && started<=nowMs;
  return {...unknown, jobEvidence:measured?'MEASURED':'UNKNOWN', jobStatus:job.status,
    jobStartedAt:measured?job.started_at:null,
    jobCompletedAt:measured&&Number.isFinite(completed)&&completed>=started&&completed<=nowMs?job.completed_at:null};
}

// runs: GitHub workflow runs of ignition.yml [{ id, status, conclusion, created_at, run_started_at, updated_at }]
// state: { d, started, dispatched: [min...], alerted: {kind: true} }   returns { state, dispatch, alerts: [text] }
export function guardDecide(nowMs, runs = [], state0 = {}, holidays = HOLIDAYS) {
  const n = nyParts(nowMs), alerts = []; let dispatch = false;
  const state = state0 && state0.d === n.d ? { ...state0, dispatched: [...(state0.dispatched || [])], alerted: { ...(state0.alerted || {}) } } : { d: n.d, started: null, dispatched: [], alerted: {} };
  // Old `dispatched` entries were recorded before HTTP acknowledgment. Retain
  // them as unknown attempts for rate limiting, never as accepted requests.
  state.attempts = state.version===2 ? (state.attempts||[]).map(x=>({...x})) : state.dispatched.map(min=>({min,status:'UNCONFIRMED_LEGACY'}));
  if(state.version!==2) state.dispatched=[];
  state.version=2;
  if (state.startedSource !== 'github_job') state.started = null;
  if (!marketDay(n, holidays) || n.min < WINDOW.from || n.min > WINDOW.to) return { state, dispatch, alerts, why: 'outside the check window' };
  const today = runs.filter(r => Number.isFinite(Date.parse(r?.created_at)) && nyParts(Date.parse(r.created_at)).d === n.d);
  const waiting = r => ['queued','waiting','requested','pending'].includes(r.status) ||
    (r.status==='in_progress' && ['queued','waiting','pending'].includes(r.jobStatus));
  const running = today.filter(r => r.status === 'in_progress' && !waiting(r)), queued = today.filter(waiting);
  // a run that finished within 10 minutes was an early exit (outside its window), not a watch
  const watchedAlready = today.some(r => r.status === 'completed' && r.jobEvidence==='MEASURED' && Date.parse(r.jobCompletedAt) - Date.parse(r.jobStartedAt) > 10 * 60000);
  if (running.length) {
    const starts=running.filter(r=>r.jobEvidence==='MEASURED').map(r=>Date.parse(r.jobStartedAt)).filter(t=>Number.isFinite(t)&&t<=nowMs);
    if(!starts.length) {
      if(n.min>=WINDOW.wantBy && !state.alerted.unverified) {state.alerted.unverified=true;alerts.push('WATCHER JOB UNVERIFIED: GitHub reports an active workflow, but the watch job start is unavailable. Queue creation is not a watcher start; market coverage is unknown.');}
      return {state,dispatch,alerts,why:'workflow active; job start unverified'};
    }
    const sm = nyParts(Math.min(...starts)).min;
    if (state.started === null) state.started = sm;
    state.startedSource='github_job';
    if (sm > WINDOW.wantBy + 10 && !state.alerted.late) { state.alerted.late = true; alerts.push('WATCHER STARTED LATE: the watch job started at ' + fmt(sm) + ' New York (it should run by 9:25). This run cannot establish opening coverage; job activity is not proof of fresh market data' + (state.dispatched.length ? '; the guard requested a start.' : '; GitHub started it late.')); }
    return { state, dispatch, alerts, why: 'watch job running since ' + fmt(sm) + '; market coverage unverified' };
  }
  if (watchedAlready) { if (!state.alerted.stopped) { state.alerted.stopped = true; alerts.push('WATCHER STOPPED EARLY: today\'s watch job ended before 14:55 New York. Job duration alone does not establish market coverage. No automatic restart; preserve session evidence for recovery review.'); }
    return { state, dispatch, alerts, why: 'watched today, then stopped' }; }
  if (today.some(r=>r.status==='completed' && (r.jobEvidence!=='MEASURED' || !r.jobCompletedAt))) {
    if(!state.alerted.unverified) {state.alerted.unverified=true;alerts.push('WATCHER JOB UNVERIFIED: a workflow completed without valid watch-job timing. Coverage is unknown; no duplicate start requested.');}
    return {state,dispatch,alerts,why:'completed workflow; job duration unverified'};
  }
  if (queued.length) {
    if (n.min >= WINDOW.wantBy && !state.alerted.queued) { state.alerted.queued = true; alerts.push('WATCHER WAITING: GitHub has the live watcher queued but has not started it (' + fmt(n.min) + ' New York). Nothing is watched until it starts.'); }
    return { state, dispatch, alerts, why: 'queued' };
  }
  const last = state.attempts.length ? state.attempts[state.attempts.length - 1].min : null;
  if (n.min > WINDOW.startUntil) return { state, dispatch, alerts, why: 'not running, too late to start' };
  if (state.attempts.length < 3 && (last === null || n.min - last >= 15)) {
    dispatch = true; state.attempts.push({min:n.min,status:'PENDING'});
    alerts.push('WATCHER NOT STARTED by ' + fmt(n.min) + ' New York: requesting a start (attempt ' + state.attempts.length + ' of 3); execution is not confirmed.');
  } else if (state.attempts.length >= 3 && !state.alerted.gaveUp) { state.alerted.gaveUp = true; alerts.push('WATCHER DOWN: 3 start attempts without confirmed execution (last ' + fmt(last) + ' New York). No live watch confirmed. Send this to Claude.'); }
  return { state, dispatch, alerts, why: 'not running' };
}
