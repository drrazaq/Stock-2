#!/usr/bin/env node
// R1 writer-quiescence gate, capture v2 (rev6; review only; an offline decision over a saved capture; no request, no change).
// Codex (d02cdfea review): a creation-time window of 36 h is not a census: GitHub allows re-runs of a run up to 30 days after it was
// created and environment waits up to 30 days. Capture v2 therefore combines two complementary query families in ONE envelope:
//
// { "repository": "drrazaq/Stock-2", "captured_at": "<ISO>", "queries": [
//     { "kind": "status", "status": "<s>", "per_page": 100, "pages": [ { "page": 1, "total_count": N, "workflow_runs": [...] }, ... ] },
//     { "kind": "created", "workflow": "<.github/workflows/x.yml>" | "*", "from": "<ISO>", "to": "<ISO>", "per_page": 100, "pages": [...] } ] }
//
//  - STATUS queries (GET .../actions/runs?status=<s>): one complete query for EVERY documented non-completed status (queued, in_progress,
//    waiting, requested, pending, action_required), whatever the creation date. Any writer run in them -> FAIL.
//  - CREATED queries (GET .../actions/runs?created=<from>..<to>, or per workflow GET .../workflows/<id>/runs?created=...): the union of
//    their [from, to] ranges must cover [captured_at - 31 days, captured_at] for EVERY writer workflow (or "*" for all). Every writer
//    run in them must be "completed": this also catches a status GitHub may add later. A run created more than 31 days ago cannot be
//    re-run or waiting under the documented 30-day limits, so it cannot still publish.
//  - Every query is COMPLETE: pages exactly 1..ceil(N/per_page), one total_count, unique ids = N, and N <= 1000 (GitHub returns at most
//    1,000 results for filtered run listings: split the created range until each query is under the cap).
//  - Every run is from the expected repository; captured_at is fresh (<= 10 min old) and not in the future.
// Prints workflow names, run ids and reasons only.
import fs from 'node:fs';
import path from 'node:path';
export const WRITER_WORKFLOWS = ['.github/workflows/ignition.yml', '.github/workflows/movers.yml', '.github/workflows/options-survey.yml', '.github/workflows/Smart-money.yml',
  '.github/workflows/leaders-study.yml', '.github/workflows/main.yml', '.github/workflows/bot.yml', '.github/workflows/opportunity-radar.yml', '.github/workflows/scorecard-1023.yml',
  '.github/workflows/fastmover-intraday.yml', '.github/workflows/r1-migrate.yml'];
export const OPEN_STATUSES = ['queued', 'in_progress', 'waiting', 'requested', 'pending', 'action_required'];
const DAY = 864e5, API_CAP = 1000;

function complete(q, repo, why, label) {
  const per = q.per_page, pages = Array.isArray(q.pages) ? q.pages : [];
  if (!(per >= 1 && per <= 100)) { why.push(label + ': per_page missing or invalid'); return null; }
  const totals = new Set(pages.map((p) => p && p.total_count)), N = pages[0] && pages[0].total_count;
  if (!pages.length || totals.size !== 1 || !Number.isInteger(N)) { why.push(label + ': pages missing or disagree on total_count'); return null; }
  if (N > API_CAP) why.push(label + ': total_count ' + N + ' exceeds the 1,000-result API cap (split the range)');
  const want = Math.max(1, Math.ceil(N / per)), got = pages.map((p) => p.page).sort((a, b) => a - b);
  if (got.length !== want || got.some((p, i) => p !== i + 1)) why.push(label + ': pages ' + JSON.stringify(got) + ', expected 1..' + want);
  const runs = new Map();
  for (const p of pages) for (const r of (Array.isArray(p.workflow_runs) ? p.workflow_runs : [])) {
    if (!r || r.id === undefined || !r.path || !r.status) { why.push(label + ': a run without id/path/status'); continue; }
    if (!r.repository || r.repository.full_name !== repo) why.push(label + ': run ' + r.id + ' is not from ' + repo);
    runs.set(r.id, r);
  }
  if (runs.size !== N) why.push(label + ': unique run ids ' + runs.size + ' != total_count ' + N);
  return [...runs.values()];
}

export function gate(env, { repo = 'drrazaq/Stock-2', now = Date.now(), maxAgeMs = 10 * 60e3, windowDays = 31 } = {}) {
  const why = [], notDone = [];
  if (!env || typeof env !== 'object' || !Array.isArray(env.queries)) return { pass: false, why: ['not a capture v2 envelope (repository, captured_at, queries)'], notDone, seen: 0 };
  if (env.repository !== repo) why.push('repository is ' + env.repository + ', expected ' + repo);
  const cap = Date.parse(env.captured_at);
  if (!Number.isFinite(cap)) why.push('captured_at missing or invalid');
  else { if (cap > now + 60e3) why.push('captured_at is in the future'); if (now - cap > maxAgeMs) why.push('capture is stale (' + Math.round((now - cap) / 60e3) + ' min old)'); }
  const seen = new Set();
  // status family
  for (const s of OPEN_STATUSES) {
    const qs = env.queries.filter((q) => q && q.kind === 'status' && q.status === s);
    if (qs.length !== 1) { why.push('status query "' + s + '": expected exactly one, found ' + qs.length); continue; }
    for (const r of complete(qs[0], repo, why, 'status ' + s) || []) { seen.add(r.id); if (WRITER_WORKFLOWS.includes(r.path)) notDone.push({ id: r.id, path: r.path, status: r.status }); }
  }
  // created family: coverage per writer workflow (or "*")
  const created = env.queries.filter((q) => q && q.kind === 'created');
  const ranges = { '*': [] }; for (const w of WRITER_WORKFLOWS) ranges[w] = [];
  for (const q of created) {
    const f = Date.parse(q.from), t = Date.parse(q.to), label = 'created ' + (q.workflow || '?') + ' ' + q.from + '..' + q.to;
    if (!Number.isFinite(f) || !Number.isFinite(t) || f > t || !(q.workflow === '*' || WRITER_WORKFLOWS.includes(q.workflow))) { why.push(label + ': invalid range or workflow'); continue; }
    const runs = complete(q, repo, why, label); if (!runs) continue;
    ranges[q.workflow].push([f, t]);
    for (const r of runs) {
      seen.add(r.id);
      if (q.workflow !== '*' && r.path !== q.workflow) why.push(label + ': run ' + r.id + ' belongs to ' + r.path);
      if (WRITER_WORKFLOWS.includes(r.path) && r.status !== 'completed') notDone.push({ id: r.id, path: r.path, status: r.status });
    }
  }
  const covered = (rs) => { const need0 = cap - windowDays * DAY; let reach = need0; for (const [f, t] of rs.sort((a, b) => a[0] - b[0])) { if (f > reach + 1000) return false; reach = Math.max(reach, t); } return reach >= cap - 60e3; };
  if (Number.isFinite(cap)) for (const w of WRITER_WORKFLOWS) if (!covered([...ranges['*'], ...ranges[w]])) why.push('created ranges do not cover the last ' + windowDays + ' days for ' + w);
  const uniq = new Map(notDone.map((a) => [a.id, a]));
  for (const a of uniq.values()) why.push('writer run not completed: ' + a.path + ' run ' + a.id + ' (' + a.status + ')');
  return { pass: !why.length, why, notDone: [...uniq.values()], seen: seen.size };
}
if (import.meta.url === 'file://' + path.resolve(process.argv[1] || '')) {
  try {
    const r = gate(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
    for (const w of r.why) console.log('- ' + w);
    console.log('R1 writer gate: ' + (r.pass ? 'PASS' : 'FAIL') + ' (' + r.seen + ' unique runs in the capture, ' + r.notDone.length + ' writer runs not completed)');
    process.exit(r.pass ? 0 : 1);
  } catch (e) { console.error('R1 writer gate: FAIL (' + e.message + ')'); process.exit(1); }
}
