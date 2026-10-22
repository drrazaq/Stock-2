#!/usr/bin/env bash
# Save step of the scanner (main.yml): commit the data folder, rebase on the newest origin/main, push; 5 tries.
# FIX (review S-1, 22 Oct): the step used `git pull --rebase -X theirs`, so on a conflicting hunk the job's own hours-old copy of the
# owner's files won over what the bot saved meanwhile (a sold position came back, a new stop was lost). Now a conflict is resolved
# hunk by hunk: the owner's files (positions, trades, bot state) keep origin's copy; every other file keeps the job's copy, exactly
# as -X theirs did. Hunks that do not conflict are kept from both sides, as before.
# Usage: bash .github/save-data.sh "commit message"   (test/save-data.test.mjs drives it on throw-away repositories)
OWNER_FILES=" data/my-positions.json data/my-trades.jsonl data/tg-state.json "
T=$(mktemp -d)
has() { git cat-file -e ":$1:$2" 2>/dev/null; }
# one stopped rebase step: during a rebase stage 2 is origin (upstream), stage 3 is this job's commit
resolve_step() {
  local f side
  git diff --name-only --diff-filter=U -z | while IFS= read -r -d '' f; do
    case "$OWNER_FILES" in *" $f "*) side=ours ;; *) side=theirs ;; esac
    if has 2 "$f" && has 3 "$f"; then
      git show ":2:$f" > "$T/o"; git show ":3:$f" > "$T/t"; if has 1 "$f"; then git show ":1:$f" > "$T/b"; else : > "$T/b"; fi
      git merge-file -q "--$side" "$T/o" "$T/b" "$T/t"; cp "$T/o" "$f"; git add -- "$f"
    elif { [ $side = ours ] && has 2 "$f"; } || { [ $side = theirs ] && has 3 "$f"; }; then
      git checkout "--$side" -- "$f"; git add -- "$f"
    else
      git rm -q -- "$f"
    fi
  done
}
in_rebase() { [ -d "$(git rev-parse --git-path rebase-merge)" ] || [ -d "$(git rev-parse --git-path rebase-apply)" ]; }
pull() {
  git pull -q --rebase && return 0
  local n=0
  while in_rebase && [ $n -lt 20 ]; do
    n=$((n + 1)); resolve_step
    [ -z "$(git diff --name-only --diff-filter=U)" ] || return 1
    GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || { git diff --cached --quiet && GIT_EDITOR=true git rebase --skip >/dev/null 2>&1; } || true
  done
  ! in_rebase
}
git add data
git diff --cached --quiet || git commit -q -m "${1:-scan $(date -u +%FT%RZ)}"
ok=0; for i in 1 2 3 4 5; do if pull && git push -q; then ok=1; break; fi; git rebase --abort 2>/dev/null || true; sleep "${SAVE_SLEEP:-10}"; done
rm -rf "$T"
[ "$ok" = 1 ] || { echo "Error: could not save the data folder to the repository"; exit 1; }
