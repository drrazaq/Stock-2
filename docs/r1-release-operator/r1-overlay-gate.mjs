#!/usr/bin/env node
// R1 operator overlay gate (O1 rev2; review only; an offline decision over the SAME saved capture v2; no request, no change).
// It does NOT replace the bound gate: `r1-writer-gate.mjs` from the exact unit C must PASS unchanged first (its 11 workflows = the 10 T1
// writers + r1-migrate.yml, the six open statuses, 31-day created coverage, completeness, repository and <= 10 min freshness).
// Then three stricter rules (Codex 6727767980 P1, 6727897764 P3):
//  S1  Status family: ANY run in the six open-status queries whose workflow is not a proven non-publisher -> FAIL. A proven
//      non-publisher has `permissions: contents: read` and no push command (5 on M0 6e72a8d0). Every other path, including
//      paths absent from the census or added later, counts as a possible main publisher (fail closed).
//  S2  Created family: any run in ANY created query (env.queries or env.overlayQueries) that is not "completed" and whose workflow is
//      not a proven non-publisher -> FAIL. This also catches a status GitHub may add later.
//  S3  The 4 O1 pause additions need the same 31-day created coverage as the bound writers. They go in env.overlayQueries (kind "created",
//      workflow = one of them, or "*"), which the bound gate never reads. Pages are complete, at most 1,000 per query, from the repo.
// This is a gate on visible GitHub runs only. It cannot certify that a non-paused publisher stays quiet afterwards; the quiet-main
// check (origin/main == M0 before the C push, == C before migrate) remains the guard for that.
//   node r1-overlay-gate.mjs <path to r1-writer-gate.mjs from C> <capture.json>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
export const NON_PUBLISHERS = ['.github/workflows/tests.yml', '.github/workflows/pages.yml', '.github/workflows/premarket.yml',
  '.github/workflows/private-data-check.yml', '.github/workflows/Tiprank.yml'];
export const O1_ADDED = ['.github/workflows/discover.yml', '.github/workflows/ml-lab.yml', '.github/workflows/options-lab.yml', '.github/workflows/squad26-lab.yml'];
const DAY = 864e5, CAP = 1000;
function complete(q, repo, why, label) {
  const per = q.per_page, pages = Array.isArray(q.pages) ? q.pages : [];
  if (!(per >= 1 && per <= 100)) { why.push(label + ': per_page missing or invalid'); return null; }
  const totals = new Set(pages.map((p) => p && p.total_count)), N = pages[0] && pages[0].total_count;
  if (!pages.length || totals.size !== 1 || !Number.isInteger(N)) { why.push(label + ': pages missing or disagree on total_count'); return null; }
  if (N > CAP) why.push(label + ': total_count ' + N + ' exceeds the 1,000-result API cap');
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
export function overlay(env, boundGate, opts = {}) {
  const repo = opts.repo || 'drrazaq/Stock-2', why = [];
  const bound = boundGate(env, opts);
  if (!bound.pass) for (const w of bound.why) why.push('bound gate: ' + w);
  if (!env || !Array.isArray(env.queries)) return { pass: false, why };
  const cap = Date.parse(env.captured_at), pub = (p) => !NON_PUBLISHERS.includes(p);
  for (const q of env.queries.filter((q) => q && q.kind === 'status'))
    for (const r of complete(q, repo, [], 'status') || []) if (pub(r.path)) why.push('S1 open run of a possible main publisher: ' + r.path + ' run ' + r.id + ' (' + r.status + ')');
  const extra = Array.isArray(env.overlayQueries) ? env.overlayQueries : [];
  const ranges = { '*': [] }; for (const w of O1_ADDED) ranges[w] = [];
  for (const q of env.queries.filter((q) => q && q.kind === 'created'))
    for (const r of complete(q, repo, [], 'created') || []) if (pub(r.path) && r.status !== 'completed') why.push('S2 not completed: ' + r.path + ' run ' + r.id + ' (' + r.status + ')');
  for (const q of extra) {
    const f = Date.parse(q && q.from), t = Date.parse(q && q.to), label = 'overlay created ' + (q && q.workflow) + ' ' + (q && q.from) + '..' + (q && q.to);
    if (!q || q.kind !== 'created' || !Number.isFinite(f) || !Number.isFinite(t) || f > t || !(q.workflow === '*' || O1_ADDED.includes(q.workflow))) { why.push(label + ': invalid overlay query'); continue; }
    const runs = complete(q, repo, why, label); if (!runs) continue;
    ranges[q.workflow].push([f, t]);
    for (const r of runs) {
      if (q.workflow !== '*' && r.path !== q.workflow) why.push(label + ': run ' + r.id + ' belongs to ' + r.path);
      if (pub(r.path) && r.status !== 'completed') why.push('S2 not completed: ' + r.path + ' run ' + r.id + ' (' + r.status + ')');
    }
  }
  const covered = (rs) => { let reach = cap - 31 * DAY; for (const [f, t] of rs.sort((a, b) => a[0] - b[0])) { if (f > reach + 1000) return false; reach = Math.max(reach, t); } return reach >= cap - 60e3; };
  if (Number.isFinite(cap)) for (const w of O1_ADDED) if (!covered([...ranges['*'], ...ranges[w]])) why.push('S3 overlay created ranges do not cover the last 31 days for ' + w);
  return { pass: !why.length, why: [...new Set(why)] };
}
if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  const [g, c] = process.argv.slice(2);
  if (!g || !c) { console.error('usage: r1-overlay-gate.mjs <r1-writer-gate.mjs from C> <capture.json>'); process.exit(2); }
  let r;
  try { const { gate } = await import(pathToFileURL(path.resolve(g)).href); r = overlay(JSON.parse(fs.readFileSync(c, 'utf8')), gate); }
  catch (e) { console.log('REFUSED ' + String(e && e.message || e).split('\n')[0]); console.log('R1 overlay gate: FAIL'); process.exit(1); }
  for (const w of r.why) console.log('PROBLEM ' + w);
  console.log('R1 overlay gate: ' + (r.pass ? 'PASS' : 'FAIL') + ' (' + r.why.length + ' problems)');
  process.exit(r.pass ? 0 : 1);
}
