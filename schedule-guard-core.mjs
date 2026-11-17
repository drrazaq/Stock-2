// SCHEDULE GUARD (owner, 17 Nov 2026: "The system is not working at all"). Pure decision; schedule-guard.mjs does the GitHub calls.
// WHY: GitHub's cron queue for this repository (80+ scheduled workflows) runs hours late or not at all. Measured 9-16 Nov 2026:
// the 21:30 UTC closing scan did not start on 16 Nov (the only scanner run was a 13:10-20:40 intraday slot that GitHub started at
// 22:50 UTC, after the close, so it printed "Market closed. Nothing to do."), the 08:40 New York pre-market check ran at 17:30, and
// the scanner's 16 intraday slots collapsed to about one a day. workflow_dispatch runs start at once, so the always-on bot job asks
// this module every 5 minutes which owner-facing jobs are due and starts the ones GitHub has not started. Read-only on the market;
// it only starts workflows that already exist and never places an order.
// New York time via Intl (daylight saving automatic). Holidays: watcher-guard-core.mjs HOLIDAYS (update every December).
import { nyParts, marketDay, HOLIDAYS, fmt } from './watcher-guard-core.mjs';

const every = (from, to, step) => { const o = []; for (let m = from; m <= to; m += step) o.push(m); return o; };
// at: New York minutes after midnight; win: minutes after "at" during which a missing run is still worth starting
export const SLOTS = [
  { wf: 'premarket.yml', name: 'Pre-market check', at: [520], win: 40 },                                   // 08:40
  { wf: 'news.yml', name: 'News watch', at: every(360, 945, 15), win: 12 },                                // 06:00-15:45 every 15 min
  { wf: 'main.yml', name: 'Stock scanner (intraday)', at: every(580, 940, 30), win: 25, inputs: { mode: 'intraday' } },   // 09:40-15:40
  { wf: 'intraday-radar.yml', name: 'Whole-market intraday radar', at: every(575, 950, 15), win: 12, inputs: { scheduled: 'true' } },   // 09:35-15:50
  { wf: 'opportunity-radar.yml', name: 'Opportunity radar (after the close)', at: [940], win: 120 },        // 15:40
  { wf: 'calendar.yml', name: 'Economic calendar', at: [945], win: 120 },                                   // 15:45
  // hunter lab (17 Nov): the gappers before the open and the next-open list after the close
  { wf: 'squad30-lab.yml', name: 'Hunt before the open', at: [555], win: 30, inputs: { mode: 'pre' } },   // 09:15
  { wf: 'squad30-lab.yml', name: 'Hunt list after the close', at: [1080], win: 240, inputs: { mode: 'today' } },   // 18:00
  // who is buying (17 Nov): yesterday's insider (SEC Form 4) and House filings, before the open
  { wf: 'squad31-buyers.yml', name: 'Who is buying', at: [480], win: 90, inputs: { mode: 'daily' } },   // 08:00
  // overnight jobs for the session that closed the evening before (prev: true = the previous New York day was a market day);
  // both skip by themselves when that session is already done ("No new session since")
  { wf: 'movers.yml', name: 'Movers radar', at: [10], win: 420, prev: true, inputs: { scheduled: 'true' } },        // 00:10 (cron 04:00 UTC)
  { wf: 'discover.yml', name: 'Discovery engine', at: [40], win: 420, prev: true, inputs: { scheduled: 'true' } },  // 00:40 (cron 05:30 UTC)
];
export const MANAGED = [...new Set(SLOTS.map(s => s.wf))];
export const DAILY = { wf: 'main.yml', after: 990, gap: 45, tries: 6 };   // closing scan from 16:30 New York, 45 min apart, 6 tries per close
const ACTIVE = ['queued', 'waiting', 'requested', 'pending', 'in_progress'];

// the latest session whose closing scan should exist by now
export function expectedSession(nowMs, holidays = HOLIDAYS) {
  for (let k = 0; k < 12; k++) {
    const x = nyParts(nowMs - k * 86400000);
    if (!marketDay(x, holidays)) continue;
    if (k === 0 && x.min < DAILY.after) continue;
    return x.d;
  }
  return '';
}
// New York wall-clock minute m on day d -> epoch ms (handles daylight saving by probing both offsets)
export function nyToMs(d, m) {
  for (const off of [4, 5]) { const t = Date.parse(d + 'T00:00:00Z') + (m + off * 60) * 60000; const p = nyParts(t); if (p.d === d && p.min === m) return t; }
  return Date.parse(d + 'T00:00:00Z') + (m + 300) * 60000;
}

// runs: [{ path, event, status, created_at, run_started_at }] for the managed workflows (newest first, any event)
// signalsSession: data/signals.json "session"; state: previous output state
// returns { state, dispatch: [{ wf, inputs, why }], alerts: [text] }
export function scheduleDecide(nowMs, runs = [], signalsSession = '', state0 = {}, holidays = HOLIDAYS) {
  const n = nyParts(nowMs), alerts = [], dispatch = [];
  const state = state0 && state0.d === n.d ? { ...state0, done: { ...(state0.done || {}) } } : { d: n.d, done: {}, daily: state0 && state0.daily || {} };
  state.daily = { ...(state.daily || {}) };
  const wfOf = (r) => String(r.path || '').split('/').pop();
  // cron-started copies are skipped by the workflows' "slot" job while this guard is alive, so they do not count as started; one that
  // has been running for over 5 minutes is a real run (the guard was down when it began)
  const real = (r) => r.event !== 'schedule' || (r.status === 'in_progress' && nowMs - Date.parse(r.run_started_at || r.created_at) > 5 * 60000);
  const of = (wf) => runs.filter(r => wfOf(r) === wf && real(r));
  const busy = (wf) => of(wf).some(r => ACTIVE.includes(r.status));
  const today = marketDay(n, holidays), yesterday = marketDay(nyParts(nowMs - 86400000), holidays);
  {
    for (const s of SLOTS) {
      if (!(s.prev ? yesterday : today)) continue;
      // only the newest due slot of each job matters: starting three missed news runs at once helps nobody
      const due = s.at.filter(a => n.min >= a && n.min < a + s.win); if (!due.length) continue;
      const a = due[due.length - 1], key = s.wf + '@' + fmt(a);
      if (state.done[key]) continue;
      const since = nyToMs(n.d, a) - 3 * 60000;
      if (of(s.wf).some(r => Date.parse(r.created_at) >= since)) { state.done[key] = 'github'; continue; }   // GitHub (or a person) started it
      if (busy(s.wf)) continue;                                                                               // one is queued or running: do not stack; look again in 5 minutes
      state.done[key] = 'guard'; dispatch.push({ wf: s.wf, inputs: s.inputs || {}, why: s.name + ' ' + fmt(a) + ' New York not started by GitHub' });
    }
  }
  // closing scan catch-up: "the nightly scan for the close has not completed" -> start it, up to 6 times, 45 minutes apart
  const E = expectedSession(nowMs, holidays);
  if (E && signalsSession && signalsSession < E) {
    const D = state.daily[E] || { tries: 0, last: 0 };
    if (busy(DAILY.wf)) { /* a scanner run is queued or running; wait for it */ }
    else if (D.tries >= DAILY.tries) { if (!D.gaveUp) { D.gaveUp = true; alerts.push('SCHEDULER: the closing scan for ' + E + ' still has not completed after ' + DAILY.tries + ' automatic starts. In GitHub open Actions, then Stock scanner, and send Claude the red lines.'); } }
    else if (!D.last || nowMs - D.last >= DAILY.gap * 60000) {
      D.tries++; D.last = nowMs;
      dispatch.push({ wf: DAILY.wf, inputs: { mode: 'daily' }, why: 'closing scan for ' + E + ' missing (last completed ' + signalsSession + ')' });
      if (D.tries === 1) alerts.push('SCHEDULER: GitHub had not run the closing scan for ' + E + ' (last completed ' + signalsSession + '), so Stock-2 started it itself. Tonight\'s ACTIONS follow when it finishes. Nothing for you to do.');
    }
    state.daily[E] = D;
  }
  for (const k of Object.keys(state.daily)) if (k < E && Object.keys(state.daily).length > 5) delete state.daily[k];
  state.beat = nowMs;
  return { state, dispatch, alerts };
}
