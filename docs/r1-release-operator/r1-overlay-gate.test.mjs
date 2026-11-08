// Synthetic captures only (no network). Run: R1_WRITER_GATE=<path to r1-writer-gate.mjs from C> node --test r1-overlay-gate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { overlay, O1_ADDED } from './r1-overlay-gate.mjs';
const { gate, WRITER_WORKFLOWS, OPEN_STATUSES } = await import(pathToFileURL(path.resolve(process.env.R1_WRITER_GATE)).href);
const REPO = 'drrazaq/Stock-2', NOW = Date.parse('2026-11-14T17:10:00Z'), CAP = new Date(NOW - 60e3).toISOString(), FROM = new Date(NOW - 32 * 864e5).toISOString();
let id = 1;
const run = (p, status = 'completed') => ({ id: id++, path: p, status, repository: { full_name: REPO } });
const q = (o, runs) => ({ ...o, per_page: 100, pages: [{ page: 1, total_count: runs.length, workflow_runs: runs }] });
function capture({ open = {}, created = {}, overlayWf = O1_ADDED, overlayRuns = {} } = {}) {
  return { repository: REPO, captured_at: CAP,
    queries: [...OPEN_STATUSES.map((s) => q({ kind: 'status', status: s }, (open[s] || []).map((p) => run(p, s)))),
      ...WRITER_WORKFLOWS.map((w) => q({ kind: 'created', workflow: w, from: FROM, to: CAP }, [run(w), ...(created[w] || []).map((st) => run(w, st))]))],
    overlayQueries: overlayWf.map((w) => q({ kind: 'created', workflow: w, from: FROM, to: CAP }, [run(w), ...(overlayRuns[w] || []).map((st) => run(w, st))])) };
}
const ov = (c) => overlay(c, gate, { now: NOW });
test('control: quiet capture passes the bound gate and the overlay', () => { const c = capture(); assert.equal(gate(c, { now: NOW }).pass, true); assert.deepEqual(ov(c).why, []); });
for (const w of [...O1_ADDED, '.github/workflows/squad26-watch.yml', '.github/workflows/research-lab.yml', '.github/workflows/feed-check.yml', '.github/workflows/brand-new.yml'])
  test('S1: an open run of ' + w + ' fails the overlay, though the bound gate alone passes', () => {
    const c = capture({ open: { in_progress: [w] } }); assert.equal(gate(c, { now: NOW }).pass, true); assert.equal(ov(c).pass, false); assert.match(ov(c).why.join('\n'), /S1 open run/); });
test('S1: an open tests.yml run (the CI on C) is allowed', () => assert.equal(ov(capture({ open: { in_progress: ['.github/workflows/tests.yml'] } })).pass, true));
test('S2: an unknown created status for an added workflow fails', () => { const c = capture({ overlayRuns: { '.github/workflows/ml-lab.yml': ['some_new_status'] } }); assert.equal(ov(c).pass, false); assert.match(ov(c).why.join('\n'), /S2 not completed: .*ml-lab/); });
test('S3: missing 31-day coverage for one added workflow fails', () => { const c = capture({ overlayWf: O1_ADDED.slice(1) }); assert.equal(ov(c).pass, false); assert.match(ov(c).why.join('\n'), /S3 .*discover/); });
test('bound-gate safeguards still apply: missing migration coverage fails', () => {
  const c = capture(); c.queries = c.queries.filter((x) => x.workflow !== '.github/workflows/r1-migrate.yml'); assert.equal(ov(c).pass, false); assert.match(ov(c).why.join('\n'), /bound gate: .*r1-migrate/); });
test('bound-gate safeguards still apply: an open writer run fails', () => assert.match(ov(capture({ open: { queued: ['.github/workflows/bot.yml'] } })).why.join('\n'), /bound gate: writer run not completed/));
test('incomplete overlay pages fail', () => { const c = capture(); c.overlayQueries[0].pages[0].total_count = 150; assert.equal(ov(c).pass, false); });
