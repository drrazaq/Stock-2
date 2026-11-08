#!/usr/bin/env node
// R1 guard (review only). Reads the git INDEX / a TREE, never the working folder (a removed file can still be tracked: Codex R1-C2).
// Prints paths only, never content.
//   node sealed-guard.mjs --staged       (every workflow save, before `git commit`): refuses when the staged change ADDS or MODIFIES a
//                                         T1 provider-data path in plaintext, or a sealed temp file, or when the sealed merge driver is
//                                         not registered (without it `pull --rebase -X theirs` keeps one side of a sealed file).
//                                         Plaintext copies tracked from before the migration are not "new" publication and do not
//                                         block unrelated saves (the bot must keep saving its Telegram offset).
//   node sealed-guard.mjs --all          (migration and deployment verification): refuses when ANY T1 plaintext path is tracked.
//   node sealed-guard.mjs --tree <ref>   (verification of a pushed commit): the same over that commit's tree.
//   node sealed-guard.mjs --push [base]  (every push, AFTER pull/rebase, on the exact tree about to be published; Codex re-review
//                                         blocker 5): refuses when HEAD adds or changes a T1 plaintext path relative to what is already
//                                         public (base, default origin/main), or, once the migration manifest is in HEAD, when HEAD
//                                         holds ANY T1 plaintext path (an old writer's plaintext arriving through the rebase).
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { isT1 } from './sealed-store.mjs';

export const violations = (paths) => paths.filter((p) => isT1(p) || /\.sealed\.tmp-/.test(p));
const z = (b) => b.toString('utf8').split('\0').filter(Boolean);
export function paths(mode = '--staged', ref = 'HEAD', cwd = process.cwd()) {
  if (mode === '--push') return z(execFileSync('git', ['diff', '--name-only', '--diff-filter=ACMRT', '-z', ref, 'HEAD'], { cwd }));
  if (mode === '--tree') return z(execFileSync('git', ['ls-tree', '-r', '--name-only', '-z', ref], { cwd }));
  if (mode === '--all') return z(execFileSync('git', ['ls-files', '-z'], { cwd }));
  return z(execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z'], { cwd }));
}
// without the driver, `pull --rebase -X theirs` silently keeps ONE side of a sealed file (reproduced in test/sealed-git.test.mjs)
export const MIGRATION_MANIFEST = '.github/r1-migration-manifest.json';
export function migrated(cwd = process.cwd(), ref = 'HEAD') { try { execFileSync('git', ['cat-file', '-e', ref + ':' + MIGRATION_MANIFEST], { cwd, stdio: 'ignore' }); return true; } catch { return false; } }
export function pushViolations(base = 'origin/main', cwd = process.cwd()) {
  const bad = violations(paths('--push', base, cwd));
  if (migrated(cwd)) for (const p of violations(paths('--tree', 'HEAD', cwd))) if (!bad.includes(p)) bad.push(p);
  return bad;
}
export function driverRegistered(cwd = process.cwd()) { try { return /sealed-merge\.mjs/.test(execFileSync('git', ['config', '--get', 'merge.sealed.driver'], { cwd }).toString()); } catch { return false; } }
if (import.meta.url === 'file://' + path.resolve(process.argv[1] || '')) {
  const mode = ['--staged', '--all', '--tree', '--push'].includes(process.argv[2]) ? process.argv[2] : '--staged', ref = process.argv[3] || (process.argv[2] === '--push' ? 'origin/main' : 'HEAD');
  if ((mode === '--staged' || mode === '--push') && !driverRegistered()) { console.error('SEALED GUARD: the sealed merge driver is not registered (source .github/sealed-git.sh); refusing to commit'); process.exit(1); }
  const bad = mode === '--push' ? pushViolations(ref) : violations(paths(mode, ref));
  if (bad.length) { console.error('SEALED GUARD: ' + bad.length + ' T1 plaintext/temp path(s) would be published (' + mode + '):\n' + bad.slice(0, 50).join('\n')); process.exit(1); }
  console.log('sealed guard: OK (' + mode + (mode === '--tree' ? ' ' + ref : '') + ': no T1 plaintext)');
}
