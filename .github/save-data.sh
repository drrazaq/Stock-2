#!/usr/bin/env bash
# Save step of the scanner (main.yml): commit the data folder, rebase on the newest origin/main, push; 5 tries.
# FIX (review S-1, 22 Oct): the step used `git pull --rebase -X theirs`, so on a conflicting hunk the job's own hours-old copy of the
# owner's files won over what the bot saved meanwhile (a sold position came back, a new stop was lost). Now a conflict is resolved
# hunk by hunk: the owner's files (positions, trades, bot state) keep origin's copy; every other file keeps the job's copy, exactly
# as -X theirs did. Hunks that do not conflict are kept from both sides, as before.
# Usage: bash .github/save-data.sh "commit message"   (test/save-data.test.mjs drives it on throw-away repositories)
OWNER_FILES=" data/my-positions.json data/my-trades.jsonl data/tg-state.json "
# This branch's explicit frozen registry is metadata only. Missing/corrupt policy
# cannot silently revert to job-wins for a frozen firstRun/correctedRun artifact.
FROZEN_FILES=$(node - <<'NODE'
const fs=require('node:fs');
try {
 const m=JSON.parse(fs.readFileSync('docs/repository-ownership.json','utf8'));
 if(!Array.isArray(m.frozenRegistry)||!m.frozenRegistry.length)throw Error();
 const paths=m.frozenRegistry.map(x=>x?.path);
 if(paths.some(p=>typeof p!=='string'||!/^data\/[A-Za-z0-9_.-]+$/.test(p))||new Set(paths).size!==paths.length)throw Error();
 process.stdout.write(' '+paths.join(' ')+' ');
} catch {console.error('Error: frozen-research policy unavailable; refusing publication');process.exit(1);}
NODE
) || exit 1
T=$(mktemp -d) || exit 1
trap 'rm -rf "$T"' EXIT
has() { git cat-file -e ":$1:$2" 2>/dev/null; }
# one stopped rebase step: during a rebase stage 2 is origin (upstream), stage 3 is this job's commit
resolve_step() {
  local f side
  # Check every conflict before resolving any hunk. Retain both commits for
  # review rather than choosing either side of a registered frozen result.
  while IFS= read -r -d '' f; do
    case "$FROZEN_FILES" in *" $f "*) echo 'Error: frozen research conflict requires explicit reconciliation'; return 1 ;; esac
  done < <(git diff --name-only --diff-filter=U -z)
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
  # Authentication/network refusal is not a successfully completed rebase.
  in_rebase || return 1
  local n=0
  while in_rebase && [ $n -lt 20 ]; do
    n=$((n + 1)); resolve_step || return 1
    [ -z "$(git diff --name-only --diff-filter=U)" ] || return 1
    GIT_EDITOR=true git rebase --continue >/dev/null 2>&1 || { git diff --cached --quiet && GIT_EDITOR=true git rebase --skip >/dev/null 2>&1; } || true
  done
  ! in_rebase
}
git add data || { echo 'Error: could not stage the data folder'; exit 1; }
if ! git diff --cached --quiet; then
  git commit -q -m "${1:-scan $(date -u +%FT%RZ)}" || { echo 'Error: data commit failed; refusing an unverified push'; exit 1; }
fi
ok=0; for i in 1 2 3 4 5; do if pull && git push -q; then ok=1; break; fi; git rebase --abort 2>/dev/null || true; sleep "${SAVE_SLEEP:-10}"; done
[ "$ok" = 1 ] || { echo "Error: could not save the data folder to the repository"; exit 1; }
