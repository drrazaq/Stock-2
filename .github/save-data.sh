#!/usr/bin/env bash
# Save step of the scanner (main.yml): commit the data folder, rebase on the newest origin/main, push; 5 tries.
# FIX (review S-1, 22 Oct): the step used `git pull --rebase -X theirs`, so on a conflicting hunk the job's own hours-old copy of the
# owner's files won over what the bot saved meanwhile (a sold position came back, a new stop was lost). Now a conflict is resolved
# hunk by hunk: the owner's files (positions, trades, bot state) keep origin's copy; every other file keeps the job's copy, exactly
# as -X theirs did. Hunks that do not conflict are kept from both sides, as before.
# Usage: bash .github/save-data.sh "commit message"   (test/save-data.test.mjs drives it on throw-away repositories)
OWNER_FILES=" data/my-positions.json data/my-trades.jsonl data/tg-state.json "
T=$(mktemp -d)
ALERT_MERGER="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/merge-alert-state.mjs"
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
  git pull -q --rebase ${PRIVATE_GUARD:+--autostash} && return 0   # private mode: the unstaged private working copies are set aside and restored
  local n=0
  while in_rebase && [ $n -lt 20 ]; do
    n=$((n + 1)); resolve_step
    [ -z "$(git diff --name-only --diff-filter=U)" ] || return 1
    GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || { git diff --cached --quiet && GIT_EDITOR=true git rebase --skip >/dev/null 2>&1; } || true
  done
  ! in_rebase
}
git add data
# P0 Route A (development): once the private-data cutover has happened (.github/private-data-mode) OR ever happened
# (.github/private-data-sealed, never removed by a rollback), the PUBLIC save never stages the owner's private files listed in
# .github/private-files.txt, even though `private-data.sh pull` put current copies into data/. A rollback therefore stops using the
# private repository but can never republish plaintext. The private repository's own save (private-data.sh push) sets
# SAVE_PRIVATE_REPO=1 and keeps every file. A staged private path after the reset aborts the save instead of publishing it.
if [ "${SAVE_PRIVATE_REPO:-}" != 1 ] && { [ -e .github/private-data-mode ] || [ -e .github/private-data-sealed ]; }; then
  [ -f .github/private-files.txt ] || { echo "Error: private mode without .github/private-files.txt; refusing to save"; exit 1; }
  PRIVATE_GUARD=1
  PRIV=$(grep -vE '^\s*(#|$)' .github/private-files.txt | sed 's#^#data/#')
  for p in $PRIV; do git reset -q -- "$p" 2>/dev/null || true; done
  git reset -q -- 'data/private-*' 2>/dev/null || true   # two-pass scan private caches (scan-passes.mjs)
  for p in $PRIV; do if git diff --cached --name-only -- "$p" | grep -q .; then echo "Error: private file $p still staged; refusing to publish it"; exit 1; fi; done
  if git diff --cached --name-only -- 'data/private-*' | grep -q .; then echo "Error: a data/private-* file is still staged; refusing to publish it"; exit 1; fi
fi
git diff --cached --quiet || git commit -q -m "${1:-scan $(date -u +%FT%RZ)}"
merge_alerts() {
  node "$ALERT_MERGER" || return 1
  [ -f data/alert-state.json ] || return 0
  git add -- data/alert-state.json
  git diff --cached --quiet || git commit -q -m "preserve scanner alert evidence"
}
ok=0; for i in 1 2 3 4 5; do if pull && merge_alerts && git push -q; then ok=1; break; fi; git rebase --abort 2>/dev/null || true; sleep "${SAVE_SLEEP:-10}"; done
rm -rf "$T"
[ "$ok" = 1 ] || { echo "Error: could not save the data folder to the repository"; exit 1; }
