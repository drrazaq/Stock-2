#!/usr/bin/env node
// R1 MIGRATION (review only; runs ONLY at deployment, under its own owner approval, from .github/workflows/r1-migrate.yml).
// The one reviewed path by which legacy plaintext T1 files become sealed (readers never fall back to plaintext: Codex R1-C3).
//   node sealed-migrate.mjs --plan                 list the tracked T1 plaintext paths and their count (no key, no writes)
//   node sealed-migrate.mjs --apply <sha>          needs SEALED_SECRET and the APPROVED source commit (40 hex). HEAD must be that commit
//        and the checkout clean (no staged, unstaged or untracked change). For each T1 plaintext path of that commit: the bytes come from
//        the commit; seal (durable write + read-back), remove the plaintext, stage BOTH the addition and the deletion; write and stage
//        .github/r1-migration-manifest.json (every source path, size, sha256; the source id). The index is then verified to hold
//        exactly that set, sealed and decrypting to the same hashes, and no T1 plaintext. Zero files, a dirty tree, or a source that
//        already holds sealed files are refused. Any failure -> exit 1 before anything is committed.
//   node sealed-migrate.mjs --verify-tree <ref>    needs SEALED_SECRET. Reads the manifest from <ref>: no T1 plaintext, the exact manifest
//                                                  set present and decrypting to its hashes, and <ref>'s parent = the approved source.
//   node sealed-migrate.mjs --verify-structure <ref>  NO key: the same checks except decryption (for an independent verifier who
//                                                  must not hold the key): manifest, exact sealed set, no plaintext, parent = source.
//   node sealed-migrate.mjs --export-to <dir>      RECOVERY ONLY: decrypt every sealed T1 file into a NEW or EMPTY real directory OUTSIDE
//                                                  this repository (real paths checked, symlinks refused, nothing overwritten).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isT1, sealedKey, writeSealed, seal, unseal, logicalId, sealedPath, SEALED_EXT, readSealed } from './sealed-store.mjs';

const git = (args, opts = {}) => execFileSync('git', args, { maxBuffer: 1 << 30, ...opts });
const z = (b) => b.toString('utf8').split('\0').filter(Boolean);
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const fail = (m) => { console.error('R1 MIGRATION STOPPED: ' + m); process.exit(1); };

export const MANIFEST = '.github/r1-migration-manifest.json';
export function plan(cwd = process.cwd(), ref = 'HEAD') { return z(git(['ls-tree', '-r', '--name-only', '-z', ref], { cwd })).filter(isT1).sort(); }
const fail2 = (m) => { throw new Error(m); };

// Codex re-review blocker 4: the migration is bound to ONE approved source commit. HEAD must be that commit, the index and the working
// tree must equal it (no staged or unstaged change, no untracked T1/sealed file), the bytes come from the commit itself, and a manifest
// of every source path with its size and sha256 is written and committed with the result. The index is then verified to contain
// exactly that set, sealed and decrypting to the same hashes, and no T1 plaintext. Zero files is refused.
export function apply({ key = sealedKey(), cwd = process.cwd(), source } = {}) {
  if (!key) throw Object.assign(new Error('SEALED_KEY_MISSING'), { code: 'SEALED_KEY_MISSING' });
  if (!/^[0-9a-f]{40}$/.test(source || '')) fail2('an approved full source commit id is required (--source <40-hex>)');
  const head = git(['rev-parse', 'HEAD'], { cwd }).toString().trim();
  if (head !== source) fail2('HEAD ' + head.slice(0, 12) + ' is not the approved source ' + source.slice(0, 12));
  if (git(['status', '--porcelain', '--untracked-files=all'], { cwd }).toString().trim()) fail2('the checkout is not clean (staged, unstaged or untracked changes)');
  if (fs.existsSync(path.join(cwd, MANIFEST))) fail2('a migration manifest already exists in the source tree');
  const todo = plan(cwd, source), done = [];
  if (!todo.length) fail2('nothing to migrate: the approved source has no T1 plaintext file');
  if (z(git(['ls-tree', '-r', '--name-only', '-z', source], { cwd })).some((p) => p.endsWith(SEALED_EXT) && isT1(p.slice(0, -SEALED_EXT.length)))) fail2('the approved source already holds sealed T1 files: not a first migration');
  for (const rel of todo) {
    const p = path.join(cwd, rel), blob = git(['show', source + ':' + rel], { cwd });
    if (!fs.readFileSync(p).equals(blob)) fail2('working copy differs from the approved source: ' + rel);
    writeSealed(p, blob, key);   // durable + read-back, then removes the plaintext
    git(['add', '-A', '--', rel, rel + SEALED_EXT], { cwd });
    done.push({ rel, bytes: blob.length, sha256: sha(blob) });
  }
  fs.mkdirSync(path.dirname(path.join(cwd, MANIFEST)), { recursive: true });
  fs.writeFileSync(path.join(cwd, MANIFEST), JSON.stringify({ version: 1, source, count: done.length, files: done }, null, 1) + '\n');
  git(['add', '--', MANIFEST], { cwd });
  const r = checkSet((p) => git(['show', ':' + p], { cwd }), z(git(['ls-files', '-z'], { cwd })), { source, count: done.length, files: done }, key, true);
  if (r.problems.length) fail2('staged result failed verification: ' + r.problems.slice(0, 5).join('; '));
  return done;
}

// the complete-set check shared by apply (index) and verifyTree (a pushed commit)
function checkSet(show, all, man, key, exact) {
  const problems = [], plain = all.filter(isT1), sealed = new Set(all.filter((p) => p.endsWith(SEALED_EXT) && isT1(p.slice(0, -SEALED_EXT.length))).map((p) => p.slice(0, -SEALED_EXT.length)));
  if (!man || !Array.isArray(man.files) || !man.files.length || man.count !== man.files.length) problems.push('manifest missing, empty or inconsistent');
  for (const p of plain) problems.push('T1 plaintext present: ' + p);
  for (const f of (man && man.files) || []) {
    if (!sealed.has(f.rel)) { problems.push('sealed copy missing: ' + f.rel); continue; }
    if (key === 'STRUCTURE_ONLY') continue;   // keyless independent check: set, plaintext and parent only (contents not decrypted)
    try { const b = unseal(show(f.rel + SEALED_EXT), key, f.rel); if (b.length !== f.bytes || sha(b) !== f.sha256) problems.push('sealed copy differs from the source: ' + f.rel); }
    catch (e) { problems.push('unreadable: ' + f.rel + ' ' + (e.code || 'ERROR')); }
  }
  const listed = new Set(((man && man.files) || []).map((f) => f.rel)), extra = [...sealed].filter((r) => !listed.has(r));
  if (exact) for (const r of extra) problems.push('sealed file not in the manifest: ' + r);
  return { problems, plaintextT1: plain, sealedT1: sealed.size, extra };
}

// receipt for a pushed commit: the manifest is read from that commit; its parent must be the approved source (no rebase onto newer data)
export function verifyTree(ref = 'HEAD', { key = sealedKey(), cwd = process.cwd(), exact = true } = {}) {
  let man = null; try { man = JSON.parse(git(['show', ref + ':' + MANIFEST], { cwd }).toString()); } catch {}
  const r = checkSet((p) => git(['show', ref + ':' + p], { cwd }), z(git(['ls-tree', '-r', '--name-only', '-z', ref], { cwd })), man, key, exact);
  // Codex rev3 #3: the manifest is NOT trusted. The expected set and every size/hash are recomputed from the approved source commit
  // itself (its T1 plaintext paths and blobs), so deleting a sealed file together with its manifest entry cannot pass.
  if (man && /^[0-9a-f]{40}$/.test(man.source || '')) {
    let expected = null; try { expected = plan(cwd, man.source); } catch { r.problems.push('the approved source ' + man.source.slice(0, 12) + ' is not available to recompute the expected set'); }
    if (expected) {
      const listed = new Map((man.files || []).map((f) => [f.rel, f]));
      for (const rel of expected) {
        const f = listed.get(rel), b = git(['show', man.source + ':' + rel], { cwd });
        if (!f) r.problems.push('source file missing from the manifest: ' + rel);
        else if (f.bytes !== b.length || f.sha256 !== sha(b)) r.problems.push('manifest size/hash differs from the source file: ' + rel);
      }
      for (const rel of listed.keys()) if (!expected.includes(rel)) r.problems.push('manifest lists a file that is not T1 plaintext in the source: ' + rel);
      if (man.count !== expected.length) r.problems.push('manifest count ' + man.count + ' != source T1 plaintext count ' + expected.length);
    }
  } else if (man) r.problems.push('manifest has no valid source id');
  if (man && man.source) { let parent = ''; try { parent = git(['rev-parse', ref + '^'], { cwd }).toString().trim(); } catch {} if (parent !== man.source) r.problems.push('the migration commit\'s parent ' + parent.slice(0, 12) + ' is not the approved source ' + String(man.source).slice(0, 12)); }
  return { ref, ...r, manifestCount: man && man.count };
}

// KEY CHECK (rev5; Codex: an owner statement is not a verified recovery exercise). makeKeyCheck seals a fresh random value with the
// production secret and returns only { sealed (base64), sha256 of the value }: neither reveals the value or the key. checkKey, run by the
// owner OUTSIDE GitHub with the backup copy in SEALED_SECRET, must reproduce the sha256: proof the backup is the key that seals the data.
const KEY_CHECK_ID = 'r1/key-check';
export function makeKeyCheck(key = sealedKey()) {
  if (!key) throw Object.assign(new Error('SEALED_KEY_MISSING'), { code: 'SEALED_KEY_MISSING' });
  const v = crypto.randomBytes(32);
  return { version: 1, purpose: 'R1 backup-key check (contains no data and no key)', sealed: seal(v, key, KEY_CHECK_ID).toString('base64'), sha256: sha(v) };
}
export function checkKey(vector, key = sealedKey()) {
  if (!key) throw Object.assign(new Error('SEALED_KEY_MISSING'), { code: 'SEALED_KEY_MISSING' });
  try { return sha(unseal(Buffer.from(String(vector.sealed), 'base64'), key, KEY_CHECK_ID)) === vector.sha256; } catch { return false; }
}

// BACKUP COMPARE (rev6; Codex: the proof must not depend on a speculative owner computer setup). In Actions, with the production
// secret in SEALED_SECRET and the owner's temporarily added off-GitHub copy in BACKUP_SECRET, compare the two DERIVED keys in constant
// time. Prints only PASS/FAIL; never the secrets, their lengths or hashes.
export function backupCompare(prod = process.env.SEALED_SECRET, backup = process.env.BACKUP_SECRET) {
  const a = sealedKey(prod), b = sealedKey(backup);
  if (!a) throw Object.assign(new Error('SEALED_KEY_MISSING'), { code: 'SEALED_KEY_MISSING' });
  if (!b) throw Object.assign(new Error('BACKUP_SECRET_MISSING'), { code: 'BACKUP_SECRET_MISSING' });
  return crypto.timingSafeEqual(a, b);
}

// Codex re-review blocker 1: the destination is checked by REAL path (symlinks resolved) against the repository's real path, every
// component is created and checked one at a time (a symlink anywhere below the export root is refused), and nothing is overwritten
// (files are opened with O_EXCL | O_NOFOLLOW). The export root itself must be a new or empty real directory outside the checkout.
export function exportTo(dir, { key = sealedKey(), cwd = process.cwd() } = {}) {
  if (!key) throw Object.assign(new Error('SEALED_KEY_MISSING'), { code: 'SEALED_KEY_MISSING' });
  const root = fs.realpathSync(git(['rev-parse', '--show-toplevel'], { cwd }).toString().trim());
  const inside = (p) => p === root || p.startsWith(root + path.sep) || root.startsWith(p + path.sep) || root === p;
  let probe = path.resolve(dir); const rest = [];
  while (!fs.existsSync(probe)) { rest.unshift(path.basename(probe)); probe = path.dirname(probe); }   // nearest existing ancestor
  const anchor = fs.realpathSync(probe), out = path.join(anchor, ...rest);
  if (inside(out)) throw new Error('the export folder must be outside the repository (real path checked)');
  const mkReal = (d) => { if (fs.existsSync(d)) { const st = fs.lstatSync(d); if (st.isSymbolicLink() || !st.isDirectory()) throw new Error('refusing a symlink or non-directory in the export path: ' + d); } else fs.mkdirSync(d, { mode: 0o700 }); };
  let cur = anchor; for (const c of rest) { cur = path.join(cur, c); mkReal(cur); }
  if (fs.readdirSync(out).length) throw new Error('the export folder must be new or empty');
  let n = 0;
  // Codex rev3 #2: export LOGICAL files. A segmented ledger (base + data/x.jsonl.d/DAY.jsonl segments) is exported ONCE, as the single
  // plaintext file data/x.jsonl that a pre-R1 reader expects (base followed by its segments); segment files are not exported separately.
  const logical = new Set();
  for (const s of z(git(['ls-files', '-z'], { cwd })).filter((p) => p.endsWith(SEALED_EXT) && isT1(p.slice(0, -SEALED_EXT.length)))) {
    const rel = s.slice(0, -SEALED_EXT.length), m = /^(.*\.jsonl)\.d\/\d{4}-\d{2}-\d{2}\.jsonl$/.exec(rel);
    logical.add(m ? m[1] : rel);
  }
  for (const rel of [...logical].sort()) {
    const b = readSealed(path.join(cwd, rel), key);
    if (b === null) continue;
    let d = out; for (const c of path.dirname(rel).split('/')) { d = path.join(d, c); mkReal(d); }
    if (fs.realpathSync(d) !== d || inside(fs.realpathSync(d))) throw new Error('export path escaped: ' + rel);
    const fd = fs.openSync(path.join(out, rel), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
    try { let off = 0; while (off < b.length) off += fs.writeSync(fd, b, off, b.length - off); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    n++;
  }
  return n;
}

if (import.meta.url === 'file://' + path.resolve(process.argv[1] || '')) {
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === '--plan') { const p = plan(); console.log(p.join('\n')); console.log('R1 migration plan: ' + p.length + ' tracked T1 plaintext path(s)'); }
    else if (cmd === '--apply') { const d = apply({ source: arg }); console.log('R1 migration: ' + d.length + ' file(s) sealed and staged with the manifest (plaintext deletions included); index verified against the approved source ' + arg.slice(0, 12)); }
    else if (cmd === '--verify-tree') { const r = verifyTree(arg || 'HEAD'); console.log('R1 verify ' + r.ref + ': manifest ' + r.manifestCount + ', sealed T1 ' + r.sealedT1 + ', plaintext T1 ' + r.plaintextT1.length + ', problems ' + r.problems.length); if (r.problems.length) { console.error(r.problems.slice(0, 50).join('\n')); process.exit(1); } }
    else if (cmd === '--verify-structure') { const r = verifyTree(arg || 'HEAD', { key: 'STRUCTURE_ONLY' }); console.log('R1 structure ' + r.ref + ' (no key; contents NOT decrypted): manifest ' + r.manifestCount + ', sealed T1 ' + r.sealedT1 + ', plaintext T1 ' + r.plaintextT1.length + ', problems ' + r.problems.length); if (r.problems.length) { console.error(r.problems.slice(0, 50).join('\n')); process.exit(1); } }
    else if (cmd === '--key-check-make') { console.log('R1 KEY CHECK VECTOR ' + JSON.stringify(makeKeyCheck())); }
    else if (cmd === '--key-check') { const ok = checkKey(JSON.parse(fs.readFileSync(arg, 'utf8'))); console.log('R1 key check: ' + (ok ? 'PASS (this secret is the one that seals the R1 data)' : 'FAIL (this secret does NOT match; do not rely on it as the backup)')); process.exit(ok ? 0 : 1); }
    else if (cmd === '--backup-compare') { const ok = backupCompare(); console.log('R1 backup compare: ' + (ok ? 'PASS (the off-GitHub copy equals the production secret)' : 'FAIL (the off-GitHub copy does NOT match; do not rely on it)')); process.exit(ok ? 0 : 1); }
    else if (cmd === '--export-to') { console.log('R1 recovery export: ' + exportTo(arg) + ' file(s) written outside the repository'); }
    else fail('usage: --plan | --apply <approved source commit> | --verify-tree <ref> | --export-to <new empty dir outside the repository>');
  } catch (e) { fail((e.code ? e.code + ' ' : '') + e.message); }
}
