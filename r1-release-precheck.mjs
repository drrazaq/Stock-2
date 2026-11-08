#!/usr/bin/env node
// R1 release precheck (review only; offline, read-only). The candidate was built and reviewed on BASE; production main has moved on
// since (data commits). Before the code push, every file the candidate changes must be byte-identical on TARGET (current main) to
// BASE, so the reviewed diff applies with no unreviewed interaction. Any drift -> FAIL (rebase + re-review, never a blind merge).
//   node r1-release-precheck.mjs <base> <candidate> <target>
// Prints file names and blob ids only. Also refuses a target that already carries the migration manifest or any sealed T1 file.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
const git = (a) => execFileSync('git', a, { maxBuffer: 1 << 28 }).toString();
const blob = (ref, f) => { try { return execFileSync('git', ['rev-parse', ref + ':' + f], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };
export function precheck(base, cand, target) {
  const changed = git(['diff', '--name-only', base, cand]).split('\n').filter(Boolean), drift = [];
  for (const f of changed) if (blob(base, f) !== blob(target, f)) drift.push(f);
  const tgt = git(['ls-tree', '-r', '--name-only', target]).split('\n');
  const already = tgt.filter((f) => f === '.github/r1-migration-manifest.json' || /\.sealed$/.test(f));
  return { pass: !drift.length && !already.length, changed: changed.length, drift, already };
}
if (import.meta.url === 'file://' + path.resolve(process.argv[1] || '')) {
  const [b, c, t] = process.argv.slice(2);
  if (!b || !c || !t) { console.error('usage: r1-release-precheck.mjs <base> <candidate> <target>'); process.exit(2); }
  const r = precheck(b, c, t);
  for (const f of r.drift) console.log('DRIFT ' + f);
  for (const f of r.already) console.log('ALREADY SEALED ' + f);
  console.log('R1 release precheck: ' + (r.pass ? 'PASS' : 'FAIL') + ' (' + r.changed + ' candidate files; ' + r.drift.length + ' drifted on target; ' + r.already.length + ' sealed paths already on target)');
  process.exit(r.pass ? 0 : 1);
}
