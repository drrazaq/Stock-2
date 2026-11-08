#!/usr/bin/env node
// R1 release precheck (review only; offline, read-only). The candidate was built and reviewed on BASE; production main has moved on
// since (data commits). Before the code push, every file the candidate changes must be byte-identical on TARGET (current main) to
// BASE, so the reviewed diff applies with no unreviewed interaction. Any drift -> FAIL (rebase + re-review, never a blind merge).
//   node r1-release-precheck.mjs <base> <candidate> <target>
// Prints file names and blob ids only. Also refuses a target that already carries the migration manifest or any sealed T1 file.
//
// (rev8, combined unit) The candidate BRANCH also carries older copies of data files (it was cut from BASE). It must never be pushed
// or merged: that would replace newer data and the Telegram offset. The release commit C is built source-only instead:
//   node r1-release-precheck.mjs --build-unit <M0> <candidate> <binding.json>
//     Creates (does not push) commit C with parent M0 and tree = M0 + exactly the binding's files taken from the candidate. Refuses
//     when a candidate file does not match the binding's sha256/bytes, or the binding lists a path the candidate lacks. Prints C.
//   node r1-release-precheck.mjs --verify-unit <M0> <C> <binding.json>
//     PASS only if C's sole parent is M0, every binding file in C matches its sha256/bytes, and no other path differs from M0.
// Both are local Git object operations only (temporary index; the working tree, HEAD and refs are untouched).
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const git = (a, o = {}) => execFileSync('git', a, { maxBuffer: 1 << 28, ...o }).toString();
const blob = (ref, f) => { try { return execFileSync('git', ['rev-parse', ref + ':' + f], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return null; } };
export function precheck(base, cand, target) {
  const changed = git(['diff', '--name-only', base, cand]).split('\n').filter(Boolean), drift = [];
  for (const f of changed) if (blob(base, f) !== blob(target, f)) drift.push(f);
  const tgt = git(['ls-tree', '-r', '--name-only', target]).split('\n');
  const already = tgt.filter((f) => f === '.github/r1-migration-manifest.json' || /\.sealed$/.test(f));
  return { pass: !drift.length && !already.length, changed: changed.length, drift, already };
}
const bytesOf = (ref, f) => execFileSync('git', ['cat-file', 'blob', ref + ':' + f], { maxBuffer: 1 << 28 });
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const commitOf = (r) => git(['rev-parse', '--verify', r + '^{commit}']).trim();
function readBinding(file) {
  const b = JSON.parse(fs.readFileSync(file, 'utf8'));
  const files = b && b.files && typeof b.files === 'object' ? b.files : null;
  if (!files || !Object.keys(files).length) throw new Error('binding has no files');
  for (const [f, v] of Object.entries(files)) {
    if (!/^[0-9a-f]{64}$/.test(v && v.sha256 || '') || !Number.isInteger(v.bytes) || f.startsWith('/') || f.split('/').includes('..')) throw new Error('bad binding entry ' + f);
  }
  return files;
}
const mode = (ref, f) => { const l = git(['ls-tree', ref, '--', f]).trim(); return l ? l.split(/\s/)[0] : null; };
export function buildUnit(m0, cand, bindingFile) {
  const files = readBinding(bindingFile), M0 = commitOf(m0), C0 = commitOf(cand), bad = [];
  for (const [f, v] of Object.entries(files)) {
    if (!blob(C0, f)) { bad.push('missing in candidate: ' + f); continue; }
    const b = bytesOf(C0, f); if (sha(b) !== v.sha256 || b.length !== v.bytes) bad.push('candidate differs from binding: ' + f);
  }
  if (bad.length) return { ok: false, bad };
  const idx = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'r1unit-')), 'index'), env = { ...process.env, GIT_INDEX_FILE: idx };
  try {
    git(['read-tree', M0], { env });
    const info = Object.keys(files).map((f) => mode(C0, f) + ' ' + blob(C0, f) + '\t' + f).join('\n') + '\n';
    git(['update-index', '--index-info'], { env, input: info });
    const tree = git(['write-tree'], { env }).trim();
    const c = git(['commit-tree', tree, '-p', M0, '-m', 'R1 combined unit: source-only, parent M0 (built by r1-release-precheck --build-unit)']).trim();
    return { ok: true, commit: c, tree };
  } finally { fs.rmSync(path.dirname(idx), { recursive: true, force: true }); }
}
export function verifyUnit(m0, c, bindingFile) {
  const files = readBinding(bindingFile), M0 = commitOf(m0), C = commitOf(c), bad = [];
  const parents = git(['rev-list', '--parents', '-n', '1', C]).trim().split(' ').slice(1);
  if (parents.length !== 1 || parents[0] !== M0) bad.push('parent is not exactly M0');
  for (const [f, v] of Object.entries(files)) {
    if (!blob(C, f)) { bad.push('missing: ' + f); continue; }
    const b = bytesOf(C, f); if (sha(b) !== v.sha256 || b.length !== v.bytes) bad.push('hash: ' + f);
  }
  for (const f of git(['diff', '--name-only', '--no-renames', M0, C]).split('\n').filter(Boolean)) if (!(f in files)) bad.push('outside binding: ' + f);
  return { pass: !bad.length, bad, files: Object.keys(files).length };
}
if (import.meta.url === 'file://' + path.resolve(process.argv[1] || '')) {
  const a = process.argv.slice(2);
  if (a[0] === '--build-unit' || a[0] === '--verify-unit') {
    if (a.length !== 4) { console.error('usage: r1-release-precheck.mjs ' + a[0] + ' <M0> <candidate|C> <binding.json>'); process.exit(2); }
    if (a[0] === '--build-unit') {
      const r = buildUnit(a[1], a[2], a[3]);
      for (const x of r.bad || []) console.log('REFUSED ' + x);
      console.log(r.ok ? 'R1 unit built (NOT pushed): commit ' + r.commit + ' tree ' + r.tree : 'R1 unit build: REFUSED');
      process.exit(r.ok ? 0 : 1);
    }
    const r = verifyUnit(a[1], a[2], a[3]);
    for (const x of r.bad) console.log('PROBLEM ' + x);
    console.log('R1 unit verify: ' + (r.pass ? 'PASS' : 'FAIL') + ' (' + r.files + ' bound files; ' + r.bad.length + ' problems)');
    process.exit(r.pass ? 0 : 1);
  }
  const [b, c, t] = a;
  if (!b || !c || !t) { console.error('usage: r1-release-precheck.mjs <base> <candidate> <target>'); process.exit(2); }
  const r = precheck(b, c, t);
  for (const f of r.drift) console.log('DRIFT ' + f);
  for (const f of r.already) console.log('ALREADY SEALED ' + f);
  console.log('R1 release precheck: ' + (r.pass ? 'PASS' : 'FAIL') + ' (' + r.changed + ' candidate files; ' + r.drift.length + ' drifted on target; ' + r.already.length + ' sealed paths already on target)');
  process.exit(r.pass ? 0 : 1);
}
