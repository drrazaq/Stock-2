#!/usr/bin/env node
// R1 writer-quiescence gate (review only; offline decision over a saved listing). Codex re-review: disabling schedules is not enough,
// an already queued or running OLD writer can still push plaintext. Before the migration (and again before re-enabling), save the
// GitHub API listing of recent workflow runs (GET /repos/{owner}/{repo}/actions/runs?per_page=100, each status) to a file and run:
//   node r1-writer-gate.mjs runs.json [more.json ...]
// PASS only if every run of a T1 writer/saver workflow in the COMPLETE listing has status "completed". Prints workflow names and
// run ids only. It makes no request itself and changes nothing.
import fs from 'node:fs';
import path from 'node:path';
export const WRITER_WORKFLOWS = ['.github/workflows/ignition.yml', '.github/workflows/movers.yml', '.github/workflows/options-survey.yml', '.github/workflows/Smart-money.yml',
  '.github/workflows/leaders-study.yml', '.github/workflows/main.yml', '.github/workflows/bot.yml', '.github/workflows/opportunity-radar.yml', '.github/workflows/scorecard-1023.yml',
  '.github/workflows/fastmover-intraday.yml'];
// Codex rev3 #4: a listing must be COMPLETE (workflow_runs.length === total_count; paginate and pass every page) and a writer run passes
// only with status "completed" (any other or unknown status, e.g. action_required or a new GitHub status, FAILS closed).
export function gate(listings) {
  let incomplete = 0; const runs = [];
  for (const l of listings) {
    if (!l || !Array.isArray(l.workflow_runs) || !Number.isInteger(l.total_count)) throw new Error('not a complete workflow-runs listing (workflow_runs and total_count required)');
    if (l.workflow_runs.length !== l.total_count) incomplete++;
    runs.push(...l.workflow_runs);
  }
  const notDone = runs.filter((r) => WRITER_WORKFLOWS.includes(r.path) && r.status !== 'completed').map((r) => ({ id: r.id, path: r.path, status: r.status }));
  const unknown = runs.filter((r) => !r.path || !r.status).length;
  return { pass: !notDone.length && !unknown && !incomplete && runs.length > 0, active: notDone, unknown, incomplete, seen: runs.length };
}
if (import.meta.url === 'file://' + path.resolve(process.argv[1] || '')) {
  try {
    const r = gate(process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, 'utf8'))));
    for (const a of r.active) console.log('NOT COMPLETED ' + a.status + ' ' + a.path + ' run ' + a.id);
    console.log('R1 writer gate: ' + (r.pass ? 'PASS' : 'FAIL') + ' (' + r.seen + ' runs seen, ' + r.active.length + ' writer runs not completed, ' + r.unknown + ' unreadable, ' + r.incomplete + ' incomplete listings)');
    process.exit(r.pass ? 0 : 1);
  } catch (e) { console.error('R1 writer gate: FAIL (' + e.message + ')'); process.exit(1); }
}
