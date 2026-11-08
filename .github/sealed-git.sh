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
#  5. sealed_recovery_push  (R1 rev4) when a save could not reach main after its retries, the unpublished local commit(s) are pushed to
#     a recovery branch save-recovery/<workflow>-<run>-<attempt> instead of dying with the runner. Same content main would have
#     received, through the same push guard. The bot merges these branches into main (sealed_recover) and deletes them.
sealed_recovery_push() {
  [ -n "$(git rev-list origin/main..HEAD 2>/dev/null)" ] || return 0
  git rebase --abort 2>/dev/null || true
  local ref; ref="save-recovery/$(printf '%s' "${GITHUB_WORKFLOW:-local}" | tr -c 'A-Za-z0-9._-' '-')-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}"
  if ! sealed_push_guard; then echo "Error: save recovery refused by the sealed guard: the unpublished commit exists only on this runner"; return 1; fi
  if git push -q origin "+HEAD:refs/heads/$ref"; then echo "save recovery: the unpublished commit is kept on branch $ref (merged into main by the bot's next recovery pass)"; return 0; fi
  echo "Error: save recovery push failed too: the unpublished commit exists only on this runner"; return 1
}
#  6. sealed_recover  (R1 rev4, run by the bot) replays every save-recovery/* branch onto main in a separate worktree with the sealed
#     merge driver (-X theirs, as the saves do; the owner's options record still refuses a real clash), checks the push guard, pushes,
#     then deletes the branch. A branch that cannot be merged is KEPT for the next pass (return 1), never dropped.
sealed_recover() {
  local r name commits t rc=0
  git fetch -q origin main '+refs/heads/save-recovery/*:refs/remotes/origin/save-recovery/*' 2>/dev/null || return 0
  for r in $(git for-each-ref --format='%(refname:short)' refs/remotes/origin/save-recovery/); do
    name=${r#origin/}; commits=$(git rev-list --reverse "origin/main..$r")
    if [ -z "$commits" ]; then git push -q origin --delete "$name" 2>/dev/null && git update-ref -d "refs/remotes/$r"; continue; fi
    t=$(mktemp -d); git worktree add -q --detach "$t" origin/main
    # shellcheck disable=SC2086
    if (cd "$t" && git cherry-pick -n -X theirs $commits >/dev/null 2>&1 && { git diff --cached --quiet || git commit -q -m "save recovery: $name"; } && sealed_push_guard && git push -q origin HEAD:main); then
      git push -q origin --delete "$name" 2>/dev/null; git update-ref -d "refs/remotes/$r"; echo "save recovery: $name merged into main"
    else echo "Error: save recovery $name not merged (conflict or refused); kept for the next pass"; rc=1; fi
    git worktree remove --force "$t" 2>/dev/null || rm -rf "$t"; git worktree prune
    git fetch -q origin main 2>/dev/null || true
  done
  return $rc
}
