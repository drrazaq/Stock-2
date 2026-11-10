// SCANNER GUARD (development proposal, 10 Nov 2026; NOT deployed, needs its own owner approval). Pure decision; scanner-guard.mjs does
// the GitHub and Telegram calls.
// WHY: GitHub created no main.yml run at all for most scheduled scanner slots from 30 Oct to 9 Nov (no queued, cancelled or failed run
// exists for them; the workflow is active). GitHub documents that scheduled events "can be delayed during periods of high loads" and
// that "some queued jobs may be dropped". On 9 Nov no daily-mode run was created; the only run (42716422194, 22:57 UTC) was a late
// intraday event that correctly exited "Market closed". The bot job (bot.yml) runs one long loop at a time and already starts the live
// watcher the same way (watcher-guard.mjs), so it is the host for this guard.
// WHAT: every 5 minutes inside the bot loop, three bounded decisions:
//   1. NIGHTLY: the nightly scan for the latest completed session L is due when data/signals.json still shows an older session.
//      Dispatch main.yml with mode=daily only from 22:15 UTC on L (45 minutes after the 21:30 cron) until 06:00 UTC the next morning,
//      only when no main.yml run is queued or running, at most 2 attempts per session at least 60 minutes apart. daily() itself
//      refuses a session it already has (no FORCE), so a duplicate run cannot send a second ACTIONS message.
//   2. INTRADAY: on an open market day, from open+10 to close-10 minutes New York, dispatch main.yml with mode=intraday when no main.yml
//      run was created in the last 40 minutes and none is queued or running; at most one guard dispatch per 30 minutes, 14 a day.
//   3. BOT SUCCESSOR: when the current bot loop has under 45 minutes left and no other bot.yml run is waiting, dispatch bot.yml once,
//      so the guard's own host does not depend on the 30-minute cron either. The bot concurrency group keeps at most one waiting run.
// A dispatch is a request, never proof of execution: verification still reads the run that actually executed. An answer that is not a
// definite 2xx/4xx is UNCERTAIN and is never retried inside the same slot. Unknown calendar years fail closed (no dispatch).
import { marketSession } from './market-session.mjs';

export const VERSION = 1;
export const LIMITS = { nightlyFromUtcMin: 22 * 60 + 15, nightlyUntilUtcMin: 6 * 60, nightlyMaxAttempts: 2, nightlyGapMin: 60,
  intradayIdleMin: 40, intradayGapMin: 30, intradayMaxPerDay: 14, successorLeadMin: 45 };
const ACTIVE = ['queued', 'in_progress', 'waiting', 'requested', 'pending'];

export function nyParts(ms) {
  const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value);
  return { d: p.year + '-' + p.month + '-' + p.day, min: +p.hour * 60 + +p.minute };
}
const addDays = (d, k) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const utcMs = (d, min) => Date.parse(d + 'T00:00:00Z') + min * 60000;

// The latest session whose close (plus 60 minutes for daily bars) is at or before now, searched back at most 10 days.
// Returns { day } or { unknown: true } when the reviewed calendar does not cover a day it needed.
export function latestCompletedSession(nowMs) {
  const n = nyParts(nowMs);
  for (let k = 0; k <= 10; k++) {
    const d = addDays(n.d, -k), s = marketSession(d);
    if (!s.known) return { unknown: true, day: d };
    if (s.closed) continue;
    if (k > 0 || n.min >= s.close + 60) return { day: d };
  }
  return { unknown: true, day: null };
}

const fresh = (state0, botRunId) => ({ version: VERSION, nightly: { ...((state0 && state0.nightly) || {}) }, intraday: { ...((state0 && state0.intraday) || {}) },
  successor: { ...((state0 && state0.successor) || {}) }, alerted: { ...((state0 && state0.alerted) || {}) }, log: [...((state0 && state0.log) || [])].slice(-200), botRunId });

// input: { nowMs, mainRuns:[{id,status,created_at}], botRuns:[{id,status}], signalsSession, state, botRunId, loopEndMs }
// output: { state, dispatches:[{workflow, inputs, kind, key}], alerts:[text], why:[text] }
export function scannerGuardDecide(input) {
  const { nowMs, mainRuns = [], botRuns = [], signalsSession = null, botRunId = null, loopEndMs = null } = input;
  const state = fresh(input.state, botRunId), dispatches = [], alerts = [], why = [], n = nyParts(nowMs);
  const mainActive = mainRuns.some(r => ACTIVE.includes(r.status));
  const alertOnce = (key, text) => { if (!state.alerted[key]) { state.alerted[key] = nowMs; alerts.push(text); } };

  // 1. NIGHTLY
  const L = latestCompletedSession(nowMs);
  if (L.unknown) { why.push('nightly: calendar does not cover ' + L.day + ', no dispatch'); alertOnce('calendar:' + L.day, 'SCANNER GUARD: the market calendar does not cover ' + L.day + '. It will not start any scan until the calendar is updated. Send this to Claude.'); }
  else if (signalsSession && signalsSession >= L.day) why.push('nightly: signals already at ' + signalsSession);
  else {
    const from = utcMs(L.day, LIMITS.nightlyFromUtcMin), until = utcMs(addDays(L.day, 1), LIMITS.nightlyUntilUtcMin), rec = state.nightly[L.day] || { attempts: [] };
    if (nowMs < from) why.push('nightly: due for ' + L.day + ', waiting for the scheduled run until 22:15 UTC');
    else if (nowMs > until) { why.push('nightly: window for ' + L.day + ' closed'); alertOnce('nightly-missed:' + L.day, 'NIGHTLY SCAN NOT DONE for the ' + L.day + ' session (last scan: ' + (signalsSession || 'none') + '). GitHub did not run it and the guard could not complete it by 06:00 UTC. The ACTIONS message for that night is missing; nothing was traded. Send this to Claude.'); }
    else if (mainActive) why.push('nightly: a scanner run is queued or running');
    else if (rec.attempts.length >= LIMITS.nightlyMaxAttempts) { why.push('nightly: attempt limit reached for ' + L.day); alertOnce('nightly-limit:' + L.day, 'NIGHTLY SCAN NOT DONE for the ' + L.day + ' session after ' + rec.attempts.length + ' guard starts. Send this to Claude.'); }
    else if (rec.attempts.length && nowMs - rec.attempts[rec.attempts.length - 1].at < LIMITS.nightlyGapMin * 60000) why.push('nightly: waiting after the previous guard start');
    else { const key = 'nightly:' + L.day + ':' + (rec.attempts.length + 1);
      dispatches.push({ workflow: 'main.yml', inputs: { mode: 'daily', slot: key }, kind: 'nightly', key, day: L.day }); why.push('nightly: start the ' + L.day + ' scan'); }
  }

  // 2. INTRADAY
  const s = marketSession(n.d);
  if (!s.known) why.push('intraday: calendar does not cover ' + n.d);
  else if (s.closed || n.min < s.open + 10 || n.min > s.close - 10) why.push('intraday: outside the market window');
  else {
    const rec = state.intraday[n.d] || { attempts: [] }, lastRun = Math.max(0, ...mainRuns.map(r => Date.parse(r.created_at) || 0)), lastGuard = rec.attempts.length ? rec.attempts[rec.attempts.length - 1].at : 0;
    if (mainActive) why.push('intraday: a scanner run is queued or running');
    else if (nowMs - lastRun < LIMITS.intradayIdleMin * 60000) why.push('intraday: a scanner run started recently');
    else if (nowMs - lastGuard < LIMITS.intradayGapMin * 60000) why.push('intraday: waiting after the previous guard start');
    else if (rec.attempts.length >= LIMITS.intradayMaxPerDay) why.push('intraday: daily limit reached');
    else if (dispatches.length) why.push('intraday: nightly start takes priority');
    else { const key = 'intraday:' + n.d + ':' + (rec.attempts.length + 1);
      dispatches.push({ workflow: 'main.yml', inputs: { mode: 'intraday', slot: key }, kind: 'intraday', key, day: n.d }); why.push('intraday: start a check'); }
  }

  // 3. BOT SUCCESSOR
  if (botRunId && Number.isFinite(loopEndMs) && loopEndMs - nowMs < LIMITS.successorLeadMin * 60000) {
    const waiting = botRuns.some(r => String(r.id) !== String(botRunId) && ACTIVE.includes(r.status) && r.status !== 'in_progress');
    if (state.successor[botRunId]) why.push('successor: already requested by this bot run');
    else if (waiting) why.push('successor: a bot run is already waiting');
    else { const key = 'successor:' + botRunId; dispatches.push({ workflow: 'bot.yml', inputs: {}, kind: 'successor', key }); why.push('successor: request the next bot run'); }
  }
  return { state, dispatches, alerts, why };
}

// Two-step record. reserveDispatch BEFORE the request: a RESERVED entry already counts as an attempt, so a crash between the request and
// the outcome can never cause a second request for the same key. finishDispatch afterwards: 2xx ACCEPTED, definite 4xx REFUSED, anything
// else (timeout, network error, 5xx) UNCERTAIN. RESERVED/UNCERTAIN are never retried blindly; the run list decides the next slot.
export const outcomeOf = (http) => http >= 200 && http < 300 ? 'ACCEPTED' : http >= 400 && http < 500 ? 'REFUSED' : 'UNCERTAIN';
export function reserveDispatch(state, d, nowMs) {
  const entry = { at: nowMs, key: d.key, kind: d.kind, outcome: 'RESERVED', http: null };
  if (d.kind === 'nightly' || d.kind === 'intraday') { const r = state[d.kind][d.day] || { attempts: [] }; state[d.kind][d.day] = { attempts: [...r.attempts, entry] }; }
  if (d.kind === 'successor') state.successor[d.key.split(':')[1]] = entry;
  state.log = [...state.log, entry].slice(-200);
  return entry;
}
export function finishDispatch(state, d, http) {
  const outcome = outcomeOf(http), set = (e) => e && e.key === d.key && e.outcome === 'RESERVED' ? Object.assign(e, { outcome, http: Number.isFinite(http) ? http : null }) : e;
  if (d.kind === 'nightly' || d.kind === 'intraday') (state[d.kind][d.day] || { attempts: [] }).attempts.forEach(set);
  if (d.kind === 'successor') set(state.successor[d.key.split(':')[1]]);
  state.log.forEach(set);
  return outcome;
}

// Keep the state small: drop per-day records older than 14 days.
export function pruneState(state, nowMs) {
  const cut = new Date(nowMs - 14 * 864e5).toISOString().slice(0, 10), keep = (o) => Object.fromEntries(Object.entries(o).filter(([d]) => d >= cut));
  return { ...state, nightly: keep(state.nightly), intraday: keep(state.intraday), successor: Object.fromEntries(Object.entries(state.successor).filter(([, v]) => v.at >= nowMs - 14 * 864e5)),
    alerted: Object.fromEntries(Object.entries(state.alerted).filter(([, at]) => at >= nowMs - 14 * 864e5)) };
}
