#!/usr/bin/env node
// R1 MIGRATION (review only; runs ONLY at deployment, under its own owner approval, from .github/workflows/r1-migrate.yml).
// The one reviewed path by which legacy plaintext T1 files become sealed (readers never fall back to plaintext: Codex R1-C3).
//   node sealed-migrate.mjs --plan                 list the tracked T1 plaintext paths and their count (no key, no writes)
//   node sealed-migrate.mjs --apply                needs SEALED_SECRET. For each tracked T1 plaintext path:
//        1. the working copy must equal the committed blob (else stop: never seal unreviewed bytes);
//        2. seal it (durable write + read-back), remove the plaintext, stage BOTH the addition and the deletion (git add -A);
//        3. verify from the INDEX: the staged .sealed blob decrypts to exactly the original bytes (sha256), and no T1 plaintext
//           path is left in the index. Any failure -> exit 1 before anything is committed (the workflow commits only on success).
//      Idempotent: a path already sealed (and its plaintext gone) is skipped; plaintext + sealed both present -> verified, then the
//      plaintext is removed only if they match. An interrupted run leaves an uncommitted working tree; a fresh checkout restarts it.
//   node sealed-migrate.mjs --verify-tree <ref>    needs SEALED_SECRET. No T1 plaintext in <ref>, and every T1 .sealed blob in <ref>
//                                                  decrypts under its own path (deployment receipt; prints counts and hashes only).
//   node sealed-migrate.mjs --export-to <dir>      RECOVERY ONLY: decrypt every sealed T1 file into <dir>, which must be OUTSIDE this
//                                                  repository (refused otherwise), so recovery never re-publishes plaintext here.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isT1, sealedKey, writeSealed, unseal, logicalId, sealedPath, SEALED_EXT, readSealed } from './sealed-store.mjs';

const git = (args, opts = {}) => execFileSync('git', args, { maxBuffer: 1 << 30, ...opts });
const z = (b) => b.toString('utf8').split('\0').filter(Boolean);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fail = (m) => { console.error('R1 MIGRATION STOPPED: ' + m); process.exit(1); };

export function plan(cwd = process.cwd()) { return z(git(['ls-files', '-z'], { cwd })).filter(isT1).sort(); }

export function apply({ key = sealedKey(), cwd = process.cwd() } = {}) {
  if (!key) throw Object.assign(new Error('SEALED_KEY_MISSING'), { code: 'SEALED_KEY_MISSING' });
  const todo = plan(cwd), done = [];
  for (const rel of todo) {
    const p = path.join(cwd, rel), sp = sealedPath(p);
    const blob = git(['show', ':' + rel], { cwd });   // the staged (= committed) bytes
    if (fs.existsSync(p)) {
      const wt = fs.readFileSync(p);
      if (!wt.equals(blob)) throw new Error('working copy differs from the committed file: ' + rel);
      if (fs.existsSync(sp) && !unseal(fs.readFileSync(sp), key, logicalId(p)).equals(blob)) throw new Error('an existing sealed copy differs: ' + rel);
      writeSealed(p, blob, key);   // verifies read-back, then removes the plaintext
    } else if (!fs.existsSync(sp)) throw new Error('tracked file missing from the working tree and no sealed copy: ' + rel);
    git(['add', '-A', '--', rel, rel + SEALED_EXT], { cwd });
    done.push({ rel, bytes: blob.length, sha256: sha(blob) });
  }
  // verification from the index, not the working folder
  const left = z(git(['ls-files', '-z'], { cwd })).filter(isT1);
  if (left.length) throw new Error(left.length + ' T1 plaintext path(s) still staged, e.g. ' + left[0]);
  for (const d of done) {
    const got = unseal(git(['show', ':' + d.rel + SEALED_EXT], { cwd }), key, d.rel);
    if (sha(got) !== d.sha256) throw new Error('staged sealed copy does not decrypt to the original: ' + d.rel);
  }
  return done;
}

export function verifyTree(ref = 'HEAD', { key = sealedKey(), cwd = process.cwd() } = {}) {
  const all = z(git(['ls-tree', '-r', '--name-only', '-z', ref], { cwd }));
  const plain = all.filter(isT1), sealed = all.filter((p) => p.endsWith(SEALED_EXT) && isT1(p.slice(0, -SEALED_EXT.length)));
  const bad = []; let bytes = 0;
  for (const s of sealed) { try { bytes += unseal(git(['show', ref + ':' + s], { cwd }), key, s.slice(0, -SEALED_EXT.length)).length; } catch (e) { bad.push(s + ' ' + (e.code || 'ERROR')); } }
  return { ref, plaintextT1: plain, sealedT1: sealed.length, unreadable: bad, plaintextBytes: bytes };
}

export function exportTo(dir, { key = sealedKey(), cwd = process.cwd() } = {}) {
  const root = path.resolve(git(['rev-parse', '--show-toplevel'], { cwd }).toString().trim()), out = path.resolve(dir);
  if (out === root || out.startsWith(root + path.sep)) throw new Error('the export folder must be outside the repository');
  let n = 0;
  for (const s of z(git(['ls-files', '-z'], { cwd })).filter((p) => p.endsWith(SEALED_EXT) && isT1(p.slice(0, -SEALED_EXT.length)))) {
    const rel = s.slice(0, -SEALED_EXT.length), b = readSealed(path.join(cwd, rel), key);
    fs.mkdirSync(path.dirname(path.join(out, rel)), { recursive: true }); fs.writeFileSync(path.join(out, rel), b, { mode: 0o600 }); n++;
  }
  return n;
}

if (import.meta.url === 'file://' + path.resolve(process.argv[1] || '')) {
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === '--plan') { const p = plan(); console.log(p.join('\n')); console.log('R1 migration plan: ' + p.length + ' tracked T1 plaintext path(s)'); }
    else if (cmd === '--apply') { const d = apply(); console.log('R1 migration: ' + d.length + ' file(s) sealed and staged (plaintext deletions included); index verified. Manifest sha256 ' + sha(Buffer.from(JSON.stringify(d.map((x) => [x.rel, x.bytes, x.sha256]))))); }
    else if (cmd === '--verify-tree') { const r = verifyTree(arg || 'HEAD'); console.log('R1 verify ' + r.ref + ': plaintext T1 ' + r.plaintextT1.length + ', sealed T1 ' + r.sealedT1 + ', unreadable ' + r.unreadable.length); if (r.plaintextT1.length || r.unreadable.length) { console.error([...r.plaintextT1, ...r.unreadable].slice(0, 50).join('\n')); process.exit(1); } }
    else if (cmd === '--export-to') { console.log('R1 recovery export: ' + exportTo(arg) + ' file(s) written outside the repository'); }
    else fail('usage: --plan | --apply | --verify-tree <ref> | --export-to <dir outside the repository>');
  } catch (e) { fail((e.code ? e.code + ' ' : '') + e.message); }
}
