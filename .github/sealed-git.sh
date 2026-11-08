#!/usr/bin/env bash
# R1 (review only): sourced by every workflow step that commits sealed provider-data files (*.sealed).
#  1. registers the merge driver for *.sealed (.gitattributes), so concurrent saves merge records instead of keeping one side;
#  2. sealed_stage PATH...  stages additions AND deletions (git add -A) for each path that exists or is tracked; staging only the new
#     .sealed name would leave the old plaintext in the commit (Codex R1-C2);
#  3. sealed_guard  refuses the commit when the STAGED change adds or modifies a T1 plaintext path or a temp file, or the driver is missing.
R1_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"   # the checked-out code that sourced this file
git config merge.sealed.name "R1 sealed provider data"
git config merge.sealed.driver "node '$R1_ROOT/sealed-merge.mjs' %O %A %B %P"
sealed_stage() { local p; for p in "$@"; do if [ -e "$p" ] || [ -n "$(git ls-files -- "$p")" ]; then git add -A -- "$p"; fi; done; }
sealed_guard() { node "$R1_ROOT/sealed-guard.mjs" --staged; }
#  4. sealed_push_guard  runs AFTER pull/rebase, immediately before `git push`, on the exact tree being published (see sealed-guard.mjs --push)
sealed_push_guard() { node "$R1_ROOT/sealed-guard.mjs" --push "${1:-origin/main}"; }
#  5. sealed_recovery_push  (R1 rev5) when a save could not reach main after its retries, the unpublished local commit(s) are pushed to
#     a NEW, IMMUTABLE checkpoint ref save-recovery/<workflow>-<run>-<attempt>-<UTC stamp>-<short sha> (never force-updated, never
#     reused: a consumer can never delete a checkpoint it has not seen). One checkpoint per distinct unpublished state per step.
#     Same content main would have received, through the same push guard.
sealed_recovery_push() {
  [ -n "$(git rev-list origin/main..HEAD 2>/dev/null)" ] || return 0
  git rebase --abort 2>/dev/null || true
  local head; head=$(git rev-parse HEAD)
  [ "${SEALED_RECOVERY_LAST:-}" = "$head" ] && { echo "save recovery: this unpublished state is already kept on ${SEALED_RECOVERY_REF:-a recovery branch}"; return 0; }
  local ref; ref="save-recovery/$(printf '%s' "${GITHUB_WORKFLOW:-local}" | tr -c 'A-Za-z0-9._-' '-')-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}-$(date -u +%Y%m%dT%H%M%S%NZ)-${head:0:12}"
  if ! sealed_push_guard; then echo "Error: save recovery refused by the sealed guard: the unpublished commit exists only on this runner"; return 1; fi
  if git push -q origin "HEAD:refs/heads/$ref"; then SEALED_RECOVERY_LAST=$head; SEALED_RECOVERY_REF=$ref; echo "save recovery: the unpublished commit is kept on branch $ref (merged into main by the bot's next recovery pass)"; return 0; fi
  echo "Error: save recovery push failed too: the unpublished commit exists only on this runner"; return 1
}
#  6. sealed_recover  (R1 rev5, run by the bot) = sealed-recover.mjs: data-only provenance, per-file lineage/union/keyed rules (a stale
#     owner state or Telegram offset is never replayed), atomic push without force, compare-and-delete on the merged tip, and exit 2 =
#     UNKNOWN when the listing/fetch fails. Exit 1 = a checkpoint was kept (refused, raced or main moved); it is retried next pass.
sealed_recover() { node "$R1_ROOT/sealed-recover.mjs"; }
