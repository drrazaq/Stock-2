#!/usr/bin/env node
// R1 rev5 SAVE RECOVERY CONSUMER (review only). Replaces rev4's whole-commit `cherry-pick -X theirs` (Codex review of 292557c2: it
// rewound the Telegram offset 9->2, replaced newer positions with stale ones, published a stale code file, deleted a newer checkpoint
// unmerged and reported a failed fetch as success).
//
// For each save-recovery/* ref, oldest first, ATOMICALLY (all files or none):
//  1. PROVENANCE: every commit between the merge base with main and the ref tip may touch ONLY paths under data/ (data saves). Any
//     other path (code, workflows, settings outside data/, release manifests, unknown) -> REFUSED, ref kept, exit 1.
//  2. PER FILE, never a blind side:
//     - main still holds a version produced in this ref's own lineage (the base or any commit of the ref) -> take the ref tip's version
//       (it is the newer state of the same writer);
//     - append-only ledgers (*.jsonl, *.jsonl.sealed incl. daily segments) changed on both sides -> 3-way line union (both prefixes of
//       the base, else refused);
//     - the owner's options record (data/options-shadow.json.sealed) -> keyed merge (a clash on one key is refused);
//     - ANY OTHER file that main changed since (e.g. data/tg-state.json offset, data/my-positions.json, data/settings.json) -> the
//       whole recovery is REFUSED and kept: a stale owner state or offset can never overwrite a newer one.
//  3. the result is committed on top of main, the push guard checks it, it is pushed WITHOUT force (a moved main -> retried next pass);
//  4. the ref is deleted only by COMPARE-AND-DELETE on the exact tip that was merged (--force-with-lease=<ref>:<tip>); a ref that a
//     producer advanced meanwhile is kept and merged on the next pass. Producers create immutable refs (sealed_recovery_push).
// Exit: 0 = nothing pending or all merged; 1 = at least one ref kept (refused/conflict/raced); 2 = UNKNOWN (fetch/list failed).
// Output names refs, paths and reasons only, never content.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { sealedKey, seal, unseal, logicalId, SEALED_EXT } from './sealed-store.mjs';
import { unionLines, mergeKeyed, KEYED_STATE } from './sealed-merge.mjs';

const PREFIX = 'refs/remotes/origin/save-recovery/';
export const ALLOWED = (p) => /^data\/[^\0]+$/.test(p) && !/\.sealed\.tmp-/.test(p);
const isUnion = (p) => /\.jsonl(\.sealed)?$/.test(p);
const isKeyed = (p) => p.endsWith(SEALED_EXT) && KEYED_STATE.has(logicalId(p));

export function recoverAll({ cwd = process.cwd(), key = sealedKey(), guard = () => true, log = console.log } = {}) {
  const g = (args, opts = {}) => execFileSync('git', args, { cwd, maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  const gs = (args) => g(args).toString().trim();
  const ok = (args) => spawnSync('git', args, { cwd, stdio: 'ignore' }).status === 0;
  try { g(['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main', '+refs/heads/save-recovery/*:refs/remotes/origin/save-recovery/*', '--prune']); }
  catch { log('UNKNOWN: save-recovery listing/fetch failed; pending recovery state is not known (nothing assumed merged)'); return 2; }
  const refs = gs(['for-each-ref', '--sort=refname', '--format=%(refname)', PREFIX]).split('\n').filter(Boolean);
  let rc = 0;
  for (const full of refs) {
    const name = full.slice('refs/remotes/origin/'.length), tip = gs(['rev-parse', full]);
    const r = mergeOne({ g, gs, ok, cwd, key, guard, name, tip, log });
    if (r === 'merged' || r === 'empty') {
      if (ok(['push', '-q', '--force-with-lease=refs/heads/' + name + ':' + tip, 'origin', ':refs/heads/' + name])) log('save recovery: ' + name + (r === 'merged' ? ' merged into main' : ' already contained in main') + '; branch deleted at ' + tip.slice(0, 12));
      else { log('save recovery: ' + name + ' advanced or could not be deleted after merging ' + tip.slice(0, 12) + '; KEPT for the next pass'); rc = Math.max(rc, 1); }
    } else rc = Math.max(rc, 1);
    try { g(['fetch', '-q', 'origin', '+refs/heads/main:refs/remotes/origin/main']); } catch { log('UNKNOWN: main could not be re-read after ' + name); return 2; }
  }
  return rc;
}

function mergeOne({ g, gs, ok, cwd, key, guard, name, tip, log }) {
  const main = gs(['rev-parse', 'refs/remotes/origin/main']);
  if (ok(['merge-base', '--is-ancestor', tip, main])) return 'empty';
  const base = gs(['merge-base', main, tip]);
  const commits = gs(['rev-list', '--reverse', base + '..' + tip]).split('\n').filter(Boolean);
  // 1. provenance: data-only paths in EVERY commit
  for (const c of commits) {
    const bad = gs(['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', c]).split('\0').filter(Boolean).filter((p) => !ALLOWED(p));
    if (bad.length) { log('save recovery: ' + name + ' REFUSED (not a data-only save; e.g. ' + bad[0] + '); kept'); return 'refused'; }
  }
  const blob = (ref, p) => { try { return gs(['rev-parse', ref + ':' + p]); } catch { return null; } };
  const show = (b) => (b ? g(['cat-file', 'blob', b]) : Buffer.alloc(0));
  const paths = gs(['diff', '--name-only', '-z', base, tip]).split('\0').filter(Boolean);
  const out = new Map();   // path -> Buffer | null (delete)
  for (const p of paths) {
    const bTip = blob(tip, p), bMain = blob(main, p), bBase = blob(base, p);
    const lineage = new Set([bBase, ...commits.map((c) => blob(c, p))]);
    if (bMain === bTip) continue;
    if (lineage.has(bMain)) { out.set(p, bTip ? show(bTip) : null); continue; }   // main holds an older state of this same writer
    if (bTip === null || bMain === null) { log('save recovery: ' + name + ' REFUSED (' + p + ' deleted on one side and changed on the other); kept'); return 'refused'; }
    try {
      if (isKeyed(p) || (isUnion(p) && p.endsWith(SEALED_EXT))) {
        const id = logicalId(p), dec = (b) => (b ? unseal(show(b), key, id) : Buffer.alloc(0));
        const O = dec(bBase).toString('utf8'), A = dec(bMain).toString('utf8'), B = dec(bTip).toString('utf8');
        const m = isKeyed(p) ? mergeKeyed(O, A, B) : ((u) => (u === null ? { ok: false, why: 'not append-only' } : { ok: true, text: u }))(unionLines(O, A, B));
        if (!m.ok) { log('save recovery: ' + name + ' REFUSED (' + p + ': ' + m.why + '); kept'); return 'refused'; }
        out.set(p, seal(Buffer.from(m.text, 'utf8'), key, id)); continue;
      }
      if (isUnion(p)) {
        const u = unionLines(show(bBase).toString('utf8'), show(bMain).toString('utf8'), show(bTip).toString('utf8'));
        if (u === null) { log('save recovery: ' + name + ' REFUSED (' + p + ': not append-only); kept'); return 'refused'; }
        out.set(p, Buffer.from(u, 'utf8')); continue;
      }
    } catch (e) { log('save recovery: ' + name + ' REFUSED (' + p + ': ' + (e.code || 'unreadable') + '); kept'); return 'refused'; }
    log('save recovery: ' + name + ' REFUSED (' + p + ' changed on main since this save; a stale state is never replayed); kept');
    return 'refused';
  }
  if (!out.size) return 'empty';
  // 3. build on main in a private worktree, guard, push without force
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'save-recovery-'));
  try {
    g(['worktree', 'add', '-q', '--detach', wt, main]);
    const w = (args) => execFileSync('git', args, { cwd: wt, stdio: ['ignore', 'pipe', 'pipe'] });
    for (const [p, buf] of out) { const f = path.join(wt, p); if (buf === null) { fs.rmSync(f, { force: true }); continue; } fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); }
    w(['add', '-A', '--', ...out.keys()]);
    w(['commit', '-q', '-m', 'save recovery: ' + name + ' @ ' + tip.slice(0, 12)]);
    if (!guard(wt)) { log('save recovery: ' + name + ' REFUSED by the sealed push guard; kept'); return 'refused'; }
    if (spawnSync('git', ['push', '-q', 'origin', 'HEAD:refs/heads/main'], { cwd: wt, stdio: 'ignore' }).status !== 0) { log('save recovery: ' + name + ' not pushed (main moved or refused); kept for the next pass'); return 'retry'; }
    return 'merged';
  } finally { spawnSync('git', ['worktree', 'remove', '--force', wt], { cwd, stdio: 'ignore' }); fs.rmSync(wt, { recursive: true, force: true }); spawnSync('git', ['worktree', 'prune'], { cwd, stdio: 'ignore' }); }
}

if (import.meta.url === 'file://' + path.resolve(process.argv[1] || '')) {
  const guardScript = path.join(path.dirname(new URL(import.meta.url).pathname), 'sealed-guard.mjs');
  const guard = (wt) => spawnSync(process.execPath, [guardScript, '--push', 'origin/main'], { cwd: wt, stdio: 'inherit' }).status === 0;
  process.exit(recoverAll({ guard }));
}
