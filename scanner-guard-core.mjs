// SCANNER GUARD, revision 3 (development proposal; NOT deployed; dispatches only inside one separately approved pilot day). Pure decisions;
// scanner-guard.mjs does the remote state, GitHub and Telegram I/O.
// WHY: GitHub created main.yml runs late or not at all for most scheduled slots 30 Oct - 9 Nov (see docs/scanner-execution-20261110).
// Revision 2 answers Codex review 6758807819 (G1-G6):
//   G2 an attempt whose execution is unresolved (RESERVED, UNCERTAIN, or ACCEPTED without its run appearing) QUARANTINES its kind for
//      that session/day: no new key, no time gap and no budget reset can clear it. Only a positively matched run (its run-name carries
//      the attempt key) or a definite refusal resolves it.
//   G3 every input is validated strictly; anything malformed, incomplete, from the future or out of calendar makes the whole decision
//      UNKNOWN (no dispatch), never empty/current. Missing state (no remote branch yet) is distinct from corrupt state.
//   G5 alerts are delivery records (PENDING -> ACK | REFUSED | UNKNOWN), published before sending; UNKNOWN is never resent.
//   G6 nothing is dispatched unless an approval names ONE pilot NYSE day; then at most the 16 scheduled intraday slots of that day
//      (one assisted start per slot, shared with the natural schedule) and at most ONE conditional nightly for that session.
//      There is no self-renewing successor chain. Dispatch START cutoffs and COMPLETION bounds are explicit constants below.
// Revision 3 answers Codex 6761146322: natural + assisted share one slot identity; one-day 16-slot pilot + max 1 nightly; no successor.
import { marketSession } from './market-session.mjs';

export const VERSION = 2;
export const ACTIVE = ['queued', 'in_progress', 'waiting', 'requested', 'pending'];
export const RUN_STATUSES = [...ACTIVE, 'completed'];
export const LIMITS = {
  // Nightly: ONE conditional start, window 22:15-01:00 UTC after the pilot session; main.yml timeout 300 min, so it COMPLETES by 06:00 UTC,
  // which keeps 06:00-13:40 UTC free of guard scanner runs (the release Session A band).
  nightlyFromUtcMin: 22 * 60 + 15, nightlyStartCutoffUtcMin: 60, nightlyCompletionBoundUtcMin: 6 * 60, mainTimeoutMin: 300, nightlyMaxAttempts: 1,
  // Intraday: the 16 scheduled slots of main.yml ('10,40 13-20 * * 1-5', UTC). A slot's window is [slot, slot+30 min). The schedule has the
  // first 20 minutes to its own; only then may the guard assist, once, until the window ends. Any main.yml run created in the window covers it.
  slotWindowMin: 30, slotNaturalGraceMin: 20, maxDispatches: 16 + 1,
  unresolvedAlertMin: 30, alertMaxAttempts: 3, futureSlackMs: 5 * 60000, logMax: 200,
};
// The 16 scheduled intraday slot times (UTC minutes) of main.yml: 13:10, 13:40, ..., 20:40.
export const SLOTS = Array.from({ length: 16 }, (_, k) => 13 * 60 + 10 + 30 * k);
const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0');
export function nyParts(ms) {
  const p = {}; new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).forEach(x => p[x.type] = x.value);
  return { d: p.year + '-' + p.month + '-' + p.day, min: +p.hour * 60 + +p.minute };
}
const addDays = (d, k) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
const utcMs = (d, min) => Date.parse(d + 'T00:00:00Z') + min * 60000;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const isoMs = (x) => typeof x === 'string' && ISO.test(x) && Number.isFinite(Date.parse(x)) ? Date.parse(x) : null;
const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// The latest session whose close plus 60 minutes is at or before ms. { day } or { unknown } when the reviewed calendar does not cover it.
export function latestCompletedSession(ms) {
  const n = nyParts(ms);
  for (let k = 0; k <= 10; k++) {
    const d = addDays(n.d, -k), s = marketSession(d);
    if (!s.known) return { unknown: true, day: d };
    if (s.closed) continue;
    if (k > 0 || n.min >= s.close + 60) return { day: d };
  }
  return { unknown: true, day: null };
}

// ---------- G3: strict input validation ----------
export function validateRuns(body, nowMs) {
  if (!isObj(body) || !Number.isInteger(body.total_count) || body.total_count < 0 || !Array.isArray(body.workflow_runs)) return { ok: false, why: 'run list is not a complete GitHub run-list object' };
  if (body.workflow_runs.length > body.total_count) return { ok: false, why: 'run list longer than its total_count' };
  const runs = [];
  for (const r of body.workflow_runs) {
    const at = isObj(r) ? isoMs(r.created_at) : null;
    if (!isObj(r) || !Number.isSafeInteger(r.id) || r.id <= 0 || !RUN_STATUSES.includes(r.status) || at === null || at > nowMs + LIMITS.futureSlackMs || typeof r.display_title !== 'string')
      return { ok: false, why: 'malformed or future run entry' };
    runs.push({ id: r.id, status: r.status, createdMs: at, title: r.display_title, event: typeof r.event === 'string' ? r.event : null });
  }
  return { ok: true, runs };
}

// signals.json: the session must be a reviewed open session, not after the latest completed session, and generated after it completed.
export function validateSignals(sig, nowMs, L) {
  if (!isObj(sig) || typeof sig.session !== 'string' || !DAY.test(sig.session)) return { ok: false, why: 'saved scan session missing or malformed' };
  const s = marketSession(sig.session), gen = isoMs(sig.generatedAt);
  if (!s.known || s.closed) return { ok: false, why: 'saved scan session is not a reviewed open session' };
  if (sig.session > L) return { ok: false, why: 'saved scan session ' + sig.session + ' is after the latest completed session ' + L };
  if (gen === null || gen > nowMs + LIMITS.futureSlackMs) return { ok: false, why: 'saved scan generation time missing or in the future' };
  const atGen = latestCompletedSession(gen);
  if (atGen.unknown || atGen.day < sig.session) return { ok: false, why: 'saved scan was generated before its session completed' };
  return { ok: true, session: sig.session };
}

const ATTEMPT_OUTCOMES = ['RESERVED', 'ACCEPTED', 'REFUSED', 'UNCERTAIN'];
const ALERT_STATUS = ['PENDING', 'ACK', 'REFUSED', 'UNKNOWN', 'RETRY'];
// state: null (no state branch yet) -> fresh. Anything else must match exactly; a corrupt record is never replaced by {}.
export function validateState(state, nowMs) {
  if (state === null) return { ok: true, state: { version: VERSION, attempts: [], alerts: {}, log: [] }, initial: true };
  const bad = (why) => ({ ok: false, why: 'scanner guard state corrupt: ' + why });
  if (!isObj(state) || state.version !== VERSION || !Array.isArray(state.attempts) || !isObj(state.alerts) || !Array.isArray(state.log)) return bad('shape');
  for (const a of state.attempts) {
    if (!isObj(a) || typeof a.key !== 'string' || !['nightly', 'intraday'].includes(a.kind) || typeof a.scope !== 'string' || !ATTEMPT_OUTCOMES.includes(a.outcome)
      || !Number.isFinite(a.at) || a.at > nowMs + LIMITS.futureSlackMs || !(a.runId === null || Number.isSafeInteger(a.runId)) || !(a.http === null || Number.isInteger(a.http))) return bad('attempt ' + (a && a.key));
  }
  if (new Set(state.attempts.map(a => a.key)).size !== state.attempts.length) return bad('duplicate attempt key');
  for (const [k, v] of Object.entries(state.alerts))
    if (!isObj(v) || !ALERT_STATUS.includes(v.status) || !Number.isInteger(v.tries) || v.tries < 0 || typeof v.text !== 'string' || !Number.isFinite(v.at) || v.at > nowMs + LIMITS.futureSlackMs) return bad('alert ' + k);
  return { ok: true, state: structuredClone(state), initial: false };
}

// ---------- G2: reconciliation and quarantine ----------
// A guard-started run carries its key in its run-name ("Stock scanner guard <key>"), so it is matched exactly, never by time proximity.
export function reconcile(state, runs) {
  for (const a of state.attempts) {
    if (a.runId !== null || a.outcome === 'REFUSED') continue;
    const hit = runs.filter(r => r.title === 'Stock scanner guard ' + a.key);
    if (hit.length === 1) a.runId = hit[0].id;
  }
  return state;
}
// unresolved = execution not positively established and not definitely refused
export const unresolved = (a) => a.runId === null && a.outcome !== 'REFUSED';

// approval = { pilotDay: 'YYYY-MM-DD' } written only by a reviewed, owner-approved commit. It must be a reviewed open NYSE session.
export function approvalCurrent(approval, nowMs) {
  const d = approval && approval.pilotDay;
  if (typeof d !== 'string' || !DAY.test(d)) return { ok: false, why: 'no approved pilot day' };
  const s = marketSession(d); if (!s.known || s.closed) return { ok: false, why: 'approved pilot day is not a reviewed open session' };
  const end = utcMs(addDays(d, 1), LIMITS.nightlyStartCutoffUtcMin);
  if (nowMs < utcMs(d, SLOTS[0]) || nowMs >= end) return { ok: false, why: 'outside the approved pilot day', pilotDay: d };
  return { ok: true, pilotDay: d };
}

// Slot reconciliation for verification and for the guard itself (pure). For each of the 16 slots of `day`:
//   NATURAL   a main.yml run not started by the guard was created inside the slot window
//   ASSISTED  the guard's attempt for this slot matched its run by exact run-name (run created at any time)
//   UNKNOWN   the guard's attempt for this slot is unresolved (execution not established)
//   MISSED    the window has ended with no run and no attempt (scheduler gap; never a source defect, never a PASS)
//   OPEN      the window has not ended yet
// A run is "created inside the window" by its created_at; GitHub does not say which cron produced a late event, so a late natural event
// is counted in the window where it actually arrived, never backdated.
export function classifySlots(day, runs, state, nowMs) {
  return SLOTS.map(m => {
    const from = utcMs(day, m), to = from + LIMITS.slotWindowMin * 60000, key = 'intraday:' + day + ':' + hhmm(m);
    const a = state.attempts.find(x => x.key === key), natural = runs.filter(r => r.createdMs >= from && r.createdMs < to && !r.title.startsWith('Stock scanner guard '));
    let status = a && a.runId !== null ? 'ASSISTED' : a && unresolved(a) ? 'UNKNOWN' : natural.length ? 'NATURAL' : nowMs < to ? 'OPEN' : 'MISSED';
    return { slot: hhmm(m), key, from, to, status, naturalRuns: natural.map(r => r.id), attempt: a ? { outcome: a.outcome, runId: a.runId } : null };
  });
}

// input: { nowMs, approval:{pilotDay}, runs: {main: body}, signals, state (null = none) }
// output: { ok, why, state, dispatches:[{workflow, inputs, kind, key, scope}], alerts:[{key, text}] }
export function scannerGuardDecide(input) {
  const { nowMs } = input, why = [];
  if (!Number.isFinite(nowMs)) return { ok: false, why: ['clock unknown'], dispatches: [], alerts: [] };
  const st = validateState(input.state, nowMs);
  if (!st.ok) return { ok: false, why: [st.why], dispatches: [], alerts: [] };   // corrupt: no decision, no alert record can be kept
  const state = st.state, alerts = [], dispatches = [];
  const alert = (key, text) => { if (!state.alerts[key]) alerts.push({ key, text }); };
  const mainL = validateRuns(input.runs && input.runs.main, nowMs);
  if (!mainL.ok) return { ok: false, why: ['run list: ' + mainL.why], state, dispatches: [], alerts: [] };
  reconcile(state, mainL.runs);
  const L = latestCompletedSession(nowMs);
  if (L.unknown) { alert('calendar:' + L.day, 'SCANNER GUARD: the market calendar does not cover ' + L.day + '; it starts nothing until the calendar is reviewed. Send this to Claude.'); return { ok: false, why: ['calendar unknown'], state, dispatches, alerts }; }

  // unresolved attempts are reported once after a short grace; they stay quarantined
  for (const a of state.attempts) if (unresolved(a) && nowMs - a.at >= LIMITS.unresolvedAlertMin * 60000)
    alert('unresolved:' + a.key, 'SCANNER GUARD: a scanner start (' + a.key + ') has no matching run after ' + LIMITS.unresolvedAlertMin + ' minutes. It is not repeated automatically. Send this to Claude.');

  const appr = approvalCurrent(input.approval, nowMs);
  if (!appr.ok) why.push(appr.why);
  const used = appr.ok ? state.attempts.filter(a => (a.scope === appr.pilotDay) && a.outcome !== 'REFUSED').length : 0;
  const budgetLeft = appr.ok && used < LIMITS.maxDispatches;
  if (appr.ok && !budgetLeft) why.push('pilot dispatch cap reached');
  const mainActive = mainL.runs.some(r => ACTIVE.includes(r.status));
  const of = (kind, scope) => state.attempts.filter(a => a.kind === kind && a.scope === scope);

  // 1. NIGHTLY
  const sig = validateSignals(input.signals, nowMs, L.day);
  if (!sig.ok) { why.push('nightly: ' + sig.why); alert('signals:' + L.day, 'SCANNER GUARD: the saved scan evidence is unreadable (' + sig.why + '); it starts no nightly scan. Send this to Claude.'); }
  else if (sig.session === L.day) why.push('nightly: current for ' + L.day);
  else {
    const from = utcMs(L.day, LIMITS.nightlyFromUtcMin), cutoff = utcMs(addDays(L.day, 1), LIMITS.nightlyStartCutoffUtcMin), mine = of('nightly', L.day);
    if (nowMs < from) why.push('nightly: due for ' + L.day + ', waiting for the schedule until 22:15 UTC');
    else if (mine.some(unresolved)) why.push('nightly: QUARANTINED, unresolved attempt for ' + L.day);
    else if (nowMs >= cutoff) { why.push('nightly: start window for ' + L.day + ' closed'); alert('nightly-missed:' + L.day, 'NIGHTLY SCAN NOT DONE for the ' + L.day + ' session (saved scan: ' + sig.session + '). No automatic start after 01:00 UTC. The ACTIONS message for that night is missing; nothing was traded. Send this to Claude.'); }
    else if (mainActive) why.push('nightly: a scanner run is queued or running');
    else if (mine.filter(a => a.outcome !== 'REFUSED').length >= LIMITS.nightlyMaxAttempts) { why.push('nightly: attempt limit'); alert('nightly-limit:' + L.day, 'NIGHTLY SCAN NOT DONE for the ' + L.day + ' session after ' + LIMITS.nightlyMaxAttempts + ' guard starts. Send this to Claude.'); }
    else if (mine.length && nowMs - Math.max(...mine.map(a => a.at)) < LIMITS.nightlyGapMin * 60000) why.push('nightly: waiting after the previous guard start');
    else if (!appr.ok || !budgetLeft || L.day !== appr.pilotDay) why.push('nightly: due, but not dispatching (' + (!appr.ok ? appr.why : L.day !== appr.pilotDay ? 'not the pilot session' : 'cap') + ')');
    else { const key = 'nightly:' + L.day + ':' + (mine.length + 1); dispatches.push({ workflow: 'main.yml', inputs: { mode: 'daily', slot: key }, kind: 'nightly', key, scope: L.day }); }
  }

  // 2. INTRADAY: slots of the approved pilot day only, shared with the natural schedule
  const n = nyParts(nowMs), utcDay = new Date(nowMs).toISOString().slice(0, 10);
  if (!appr.ok) why.push('intraday: ' + appr.why);
  else {
    const day = appr.pilotDay, slots = classifySlots(day, mainL.runs, state, nowMs), dayAttempts = of('intraday', day);
    const cur = slots.find(x => nowMs >= x.from && nowMs < x.to);
    if (utcDay !== day || !cur) why.push('intraday: no open pilot slot now');
    else if (dayAttempts.some(unresolved)) why.push('intraday: QUARANTINED, unresolved attempt today');
    else if (cur.status !== 'OPEN') why.push('intraday: slot ' + cur.slot + ' ' + cur.status);
    else if (nowMs < cur.from + LIMITS.slotNaturalGraceMin * 60000) why.push('intraday: slot ' + cur.slot + ' left to the schedule for its first ' + LIMITS.slotNaturalGraceMin + ' min');
    else if (mainActive) why.push('intraday: a scanner run is queued or running');
    else if (dispatches.length) why.push('intraday: nightly start takes priority');
    else if (!budgetLeft) why.push('intraday: pilot cap');
    else dispatches.push({ workflow: 'main.yml', inputs: { mode: 'intraday', slot: cur.key }, kind: 'intraday', key: cur.key, scope: day });
  }
  return { ok: true, why, state, dispatches, alerts };
}

// ---------- attempt and alert records (each change is published remotely by the runner) ----------
export const outcomeOf = (http) => http >= 200 && http < 300 ? 'ACCEPTED' : http >= 400 && http < 500 ? 'REFUSED' : 'UNCERTAIN';
export function reserveAttempt(state, d, nowMs) {
  const entry = { key: d.key, kind: d.kind, scope: d.scope, at: nowMs, outcome: 'RESERVED', http: null, runId: null };
  state.attempts.push(entry); state.log = [...state.log, { at: nowMs, key: d.key, event: 'RESERVED' }].slice(-LIMITS.logMax); return entry;
}
export function finishAttempt(state, key, http, nowMs) {
  const a = state.attempts.find(x => x.key === key && x.outcome === 'RESERVED'); if (!a) return null;
  a.outcome = outcomeOf(http); a.http = Number.isInteger(http) ? http : null;
  state.log = [...state.log, { at: nowMs, key, event: a.outcome }].slice(-LIMITS.logMax); return a.outcome;
}
// Alert delivery: PENDING is published before the send. ACK needs HTTP 200 + ok:true + a positive integer message_id. A definite refusal
// (400/401/403/404) or 429 becomes RETRY (at most alertMaxAttempts sends in all); anything else is UNKNOWN and never resent.
export function reserveAlert(state, a, nowMs) {
  const prior = state.alerts[a.key];
  if (prior && !(prior.status === 'RETRY' && prior.tries < LIMITS.alertMaxAttempts)) return false;
  state.alerts[a.key] = { status: 'PENDING', tries: (prior ? prior.tries : 0) + 1, text: a.text.slice(0, 300), at: nowMs }; return true;
}
export function alertOutcome(http, body) {
  if (http === 200 && isObj(body) && body.ok === true && isObj(body.result) && Number.isSafeInteger(body.result.message_id) && body.result.message_id > 0) return 'ACK';
  if ([400, 401, 403, 404, 429].includes(http)) return 'RETRY';
  return 'UNKNOWN';
}
export function finishAlert(state, key, outcome, nowMs) {
  const a = state.alerts[key]; if (!a || a.status !== 'PENDING') return;
  a.status = outcome === 'RETRY' && a.tries >= LIMITS.alertMaxAttempts ? 'REFUSED' : outcome; a.at = nowMs;
}
export const pendingRetries = (state) => Object.entries(state.alerts).filter(([, v]) => v.status === 'RETRY' && v.tries < LIMITS.alertMaxAttempts).map(([key, v]) => ({ key, text: v.text }));

export function pruneState(state, nowMs) {
  const cut = nowMs - 14 * 864e5;
  return { ...state, attempts: state.attempts.filter(a => a.at >= cut || unresolved(a)),
    alerts: Object.fromEntries(Object.entries(state.alerts).filter(([, v]) => v.at >= cut || ['PENDING', 'UNKNOWN'].includes(v.status))), log: state.log.slice(-LIMITS.logMax) };
}
