#!/usr/bin/env node
// R1 writer-quiescence gate (review only; an offline decision over a saved CAPTURE; it makes no request and changes nothing).
// Codex: disabling schedules is not enough (a queued or running OLD writer can still push), and a listing must be proven complete.
// Capture contract (rev5), one JSON envelope file:
//   { "repository": "drrazaq/Stock-2", "captured_at": "<ISO>", "query": { "created_since": "<ISO>", "per_page": 100 },
//     "pages": [ { "page": 1, "total_count": N, "workflow_runs": [...] }, { "page": 2, ... }, ... ] }
// i.e. GET /repos/drrazaq/Stock-2/actions/runs?created=>=<created_since>&per_page=100&page=k for k = 1..ceil(N/100), saved verbatim.
// PASS only if ALL hold:
//   - repository is the expected one, and every run's repository.full_name is too;
//   - created_since is at least 36 h before captured_at (a run can wait queued up to 24 h and run up to 6 h);
//   - captured_at is fresh (default: at most 10 min before the decision) and not in the future;
//   - pages are exactly 1..ceil(N/per_page) with one consistent total_count N, and the UNIQUE run ids across pages number exactly N;
//   - every run of a T1 writer/saver workflow has status "completed" (any other or unknown status fails closed).
// Prints workflow names, run ids and reasons only.
import fs from 'node:fs';
import path from 'node:path';
export const WRITER_WORKFLOWS = ['.github/workflows/ignition.yml', '.github/workflows/movers.yml', '.github/workflows/options-survey.yml', '.github/workflows/Smart-money.yml',
  '.github/workflows/leaders-study.yml', '.github/workflows/main.yml', '.github/workflows/bot.yml', '.github/workflows/opportunity-radar.yml', '.github/workflows/scorecard-1023.yml',
  '.github/workflows/fastmover-intraday.yml', '.github/workflows/r1-migrate.yml'];
export function gate(env, { repo = 'drrazaq/Stock-2', now = Date.now(), maxAgeMs = 10 * 60e3 } = {}) {
  const why = [];
  if (!env || typeof env !== 'object' || !Array.isArray(env.pages)) return { pass: false, why: ['not a capture envelope (repository, captured_at, query, pages)'], notDone: [], seen: 0 };
  if (env.repository !== repo) why.push('repository is ' + env.repository + ', expected ' + repo);
  const cap = Date.parse(env.captured_at), since = Date.parse(env.query && env.query.created_since), per = (env.query && env.query.per_page) || 0;
  if (!Number.isFinite(cap)) why.push('captured_at missing or invalid');
  else { if (cap > now + 60e3) why.push('captured_at is in the future'); if (now - cap > maxAgeMs) why.push('capture is stale (' + Math.round((now - cap) / 60e3) + ' min old)'); }
  if (!Number.isFinite(since) || !(cap - since >= 36 * 3600e3)) why.push('created_since must be at least 36 h before captured_at');
  if (!(per >= 1 && per <= 100)) why.push('query.per_page missing or invalid');
  const totals = new Set(env.pages.map((p) => p && p.total_count)), N = env.pages[0] && env.pages[0].total_count;
  if (totals.size !== 1 || !Number.isInteger(N)) why.push('pages disagree on total_count or it is missing');
  else {
    const want = Math.max(1, Math.ceil(N / per)), got = env.pages.map((p) => p.page).sort((a, b) => a - b);
    if (got.length !== want || got.some((p, i) => p !== i + 1)) why.push('pages present ' + JSON.stringify(got) + ', expected 1..' + want);
  }
  const runs = new Map();
  for (const p of env.pages) for (const r of (p && Array.isArray(p.workflow_runs) ? p.workflow_runs : [])) {
    if (!r || r.id === undefined || !r.path || !r.status) { why.push('a run without id/path/status'); continue; }
    if (!r.repository || r.repository.full_name !== repo) why.push('run ' + r.id + ' is not from ' + repo);
    runs.set(r.id, r);
  }
  if (Number.isInteger(N) && runs.size !== N) why.push('unique run ids ' + runs.size + ' != total_count ' + N);
  const notDone = [...runs.values()].filter((r) => WRITER_WORKFLOWS.includes(r.path) && r.status !== 'completed').map((r) => ({ id: r.id, path: r.path, status: r.status }));
  for (const a of notDone) why.push('writer run not completed: ' + a.path + ' run ' + a.id + ' (' + a.status + ')');
  return { pass: !why.length, why, notDone, seen: runs.size };
}
if (import.meta.url === 'file://' + path.resolve(process.argv[1] || '')) {
  try {
    const r = gate(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
    for (const w of r.why) console.log('- ' + w);
    console.log('R1 writer gate: ' + (r.pass ? 'PASS' : 'FAIL') + ' (' + r.seen + ' unique runs in the capture, ' + r.notDone.length + ' writer runs not completed)');
    process.exit(r.pass ? 0 : 1);
  } catch (e) { console.error('R1 writer gate: FAIL (' + e.message + ')'); process.exit(1); }
}
