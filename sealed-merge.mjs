#!/usr/bin/env node
// Git merge driver for *.sealed (R1, after Codex R1-C5). Encrypted files cannot be merged line by line by git, and the workflows'
// `pull --rebase -X theirs` would otherwise keep ONE side and silently lose the other run's appended records.
// Registered by .github/sealed-git.sh:  git config merge.sealed.driver "node sealed-merge.mjs %O %A %B %P"
// %O base, %A current (during a rebase: upstream), %B other (during a rebase: the commit being replayed), %P path. Result goes to %A.
//  - one side unchanged -> the other side (no decryption needed beyond verification);
//  - *.jsonl: 3-way LINE UNION (base + current + lines the other side appended), when both sides only appended;
//  - otherwise: decrypt, `git merge-file` on the plaintext in a private temp folder, re-encrypt. SEALED_MERGE_FAVOR=theirs|ours
//    keeps the workflow's existing hunk preference (-X theirs == favour %B); without it a real conflict is reported;
//  - binary payloads (.gz) changed on both sides, a missing key or unreadable input -> exit 1 (a conflict: the save step fails
//    loudly and retries; nothing is resolved by dropping data and nothing is written in plaintext).
// Plaintext only ever exists in a 0700 temp folder for the merge-file call, removed in `finally`. Output names no content.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { seal, unseal, sealedKey, logicalId, sealedCode } from './sealed-store.mjs';

export function unionLines(o, a, b) {
  const L = (s) => s.split('\n').filter((x, i, arr) => !(i === arr.length - 1 && x === ''));
  const O = L(o), A = L(a), B = L(b);
  const isPrefix = (p, q) => p.length <= q.length && p.every((x, i) => x === q[i]);
  if (!isPrefix(O, A) || !isPrefix(O, B)) return null;   // a side rewrote or removed history: not an append-only change
  const aNew = new Map(); for (const x of A.slice(O.length)) aNew.set(x, (aNew.get(x) || 0) + 1);   // a line both sides appended is kept once
  const add = []; for (const x of B.slice(O.length)) { const n = aNew.get(x) || 0; if (n > 0) aNew.set(x, n - 1); else add.push(x); }
  const out = [...A, ...add]; return out.length ? out.join('\n') + '\n' : '';
}

// OWNER STATE (Codex re-review: the owner-state race). data/options-shadow.json holds the owner's REAL option trades (`real`, written
// by the bot's commands) beside the paper lane (`open`, `done`, `labT`, `cc`, ... written by the nightly scan). It is merged by
// TOP-LEVEL KEY: a key changed on one side only takes that side; the same change on both sides is kept once; a key changed
// differently on both sides is a CONFLICT whatever SEALED_MERGE_FAVOR says (the save fails loudly and is retried; nothing is dropped).
export const KEYED_STATE = new Set(['data/options-shadow.json']);
export function mergeKeyed(o, a, b) {
  const O = o.length ? JSON.parse(o) : {}, A = JSON.parse(a), B = JSON.parse(b), J = (x) => JSON.stringify(x);
  for (const x of [O, A, B]) if (!x || typeof x !== 'object' || Array.isArray(x)) return { ok: false, why: 'not a JSON object' };
  const out = {}, keys = [...new Set([...Object.keys(A), ...Object.keys(B), ...Object.keys(O)])];
  for (const k of keys) {
    const ok = J(O[k]), ak = J(A[k]), bk = J(B[k]);
    const v = ak === bk ? A[k] : ak === ok ? B[k] : bk === ok ? A[k] : Symbol.for('conflict');
    if (v === Symbol.for('conflict')) return { ok: false, why: 'both sides changed "' + k + '"' };
    if (v !== undefined) out[k] = v;
  }
  return { ok: true, text: JSON.stringify(out) };
}

export function mergeSealed({ base, cur, other, id, key, favor = '' }) {
  const dec = (b) => (b.length ? unseal(b, key, id) : Buffer.alloc(0));
  const O = dec(base), A = dec(cur), B = dec(other);
  if (A.equals(B)) return { ok: true, out: cur };
  if (A.equals(O)) return { ok: true, out: other };
  if (B.equals(O)) return { ok: true, out: cur };
  if (/\.gz$/.test(id)) return { ok: false, why: 'binary changed on both sides' };
  if (KEYED_STATE.has(id)) { let r; try { r = mergeKeyed(O.toString('utf8'), A.toString('utf8'), B.toString('utf8')); } catch { r = { ok: false, why: 'not JSON' }; } return r.ok ? { ok: true, out: seal(Buffer.from(r.text, 'utf8'), key, id) } : r; }
  if (/\.jsonl$/.test(id)) { const u = unionLines(O.toString('utf8'), A.toString('utf8'), B.toString('utf8')); if (u !== null) return { ok: true, out: seal(Buffer.from(u, 'utf8'), key, id) }; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sealed-merge-')); fs.chmodSync(dir, 0o700);
  try {
    const f = (n, b) => { const p = path.join(dir, n); fs.writeFileSync(p, b, { mode: 0o600 }); return p; };
    const pa = f('a', A), po = f('o', O), pb = f('b', B), args = ['merge-file', '-q'];
    if (favor === 'theirs' || favor === 'ours') args.push('--' + favor);
    try { execFileSync('git', [...args, pa, po, pb], { stdio: 'ignore' }); } catch { return { ok: false, why: 'conflict' }; }
    return { ok: true, out: seal(fs.readFileSync(pa), key, id) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

if (import.meta.url === 'file://' + path.resolve(process.argv[1] || '')) {
  const [, , pO, pA, pB, pP] = process.argv, id = logicalId(pP || '');
  try {
    const r = mergeSealed({ base: fs.readFileSync(pO), cur: fs.readFileSync(pA), other: fs.readFileSync(pB), id, key: sealedKey(), favor: process.env.SEALED_MERGE_FAVOR || '' });
    if (!r.ok) { console.error('sealed merge: CONFLICT ' + id + ' (' + r.why + ')'); process.exit(1); }
    fs.writeFileSync(pA, r.out); console.error('sealed merge: merged ' + id);
  } catch (e) { console.error('sealed merge: ' + sealedCode(e) + ' ' + id); process.exit(1); }
}
