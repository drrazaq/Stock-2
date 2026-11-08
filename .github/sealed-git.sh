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
#     a NEW, IMMUTABLE checkpoint ref save-recovery/<workflow>-<run>-<attempt>-<UTC stamp>-<short sha>, through the same push guard.
#     (rev13) BOUNDED by four fixed reservation slots, refs/heads/r1-recovery-slot/{bot,main,shared-0,shared-1} (Codex c4a4fc4f7 design,
#     independently reviewed): bot.yml may use only "bot", main.yml only "main", every other writer "shared-0" then "shared-1".
#     - Size guard: the unpublished objects (reachable from HEAD, not from origin/main; uncompressed) must be known and <= 32 MiB.
#     - Admission: the checkpoint AND its slot are created in ONE atomic push, both leased as absent. An occupied slot rejects the whole
#       push (no checkpoint leaks). The slot count, not a listing, is the cap: there is no UNKNOWN bypass.
#     - Same-run advance: when this run already holds a slot for an ancestor of HEAD, one atomic push creates the new checkpoint, moves the
#       slot (leased on the old tip) and deletes this run's own superseded checkpoint (leased on the old tip). The new tip contains every
#       old commit, so nothing is lost and capacity does not grow.
#     - A failed push is reconciled read-only (ls-remote). Created as intended -> success; clearly not created -> next allowed slot;
#       anything else, or a failed listing -> UNKNOWN: stop, never try another slot (no double admission).
#     - No slot free or the size limit exceeded -> nothing is pushed or evicted; the commit stays on this runner (loss risk L7).
SEALED_RECOVERY_MAX_BYTES=$((32 * 1024 * 1024))
sealed_recovery_role() { case "${GITHUB_WORKFLOW_REF:-}" in */.github/workflows/bot.yml@*) echo bot ;; */.github/workflows/main.yml@*) echo main ;; *) echo shared ;; esac; }
sealed_recovery_slots() { case "$1" in bot) echo bot ;; main) echo main ;; *) echo "shared-0 shared-1" ;; esac; }
sealed_recovery_max() { local m=$SEALED_RECOVERY_MAX_BYTES; case "${SEALED_RECOVERY_TEST_MAX:-}" in ''|*[!0-9]*) ;; *) [ "$SEALED_RECOVERY_TEST_MAX" -lt "$m" ] && m=$SEALED_RECOVERY_TEST_MAX ;; esac; echo "$m"; }   # tests may only LOWER it
sealed_recovery_size() { ( set -o pipefail; git rev-list --objects origin/main..HEAD | cut -d' ' -f1 | git cat-file --batch-check='%(objectsize)' | awk '$1 !~ /^[0-9]+$/ { bad = 1 } { s += $1 } END { if (bad) exit 1; print s + 0 }' ); }
# remote value of a ref: prints the sha, "absent", or fails (UNKNOWN)
sealed_remote_ref() { local out; out=$(git ls-remote origin "refs/heads/$1") || return 1; [ -n "$out" ] && echo "${out%%[[:space:]]*}" || echo absent; }
sealed_recovery_push() {
  [ -n "$(git rev-list origin/main..HEAD 2>/dev/null)" ] || return 0
  git rebase --abort 2>/dev/null || true
  local head; head=$(git rev-parse HEAD)
  [ "${SEALED_RECOVERY_LAST:-}" = "$head" ] && { echo "save recovery: this unpublished state is already kept on ${SEALED_RECOVERY_REF:-a recovery branch}"; return 0; }
  if ! sealed_push_guard; then echo "Error: save recovery refused by the sealed guard: the unpublished commit exists only on this runner"; return 1; fi
  local size max; max=$(sealed_recovery_max)
  if ! size=$(sealed_recovery_size) || [ -z "$size" ]; then echo "Error: save recovery size UNKNOWN: no recovery branch pushed; the unpublished commit exists only on this runner"; return 1; fi
  if [ "$size" -gt "$max" ]; then echo "Error: save recovery refused: the unpublished data is $size bytes (limit $max); the unpublished commit exists only on this runner"; return 1; fi
  local ref; ref="save-recovery/$(printf '%s' "${GITHUB_WORKFLOW:-local}" | tr -c 'A-Za-z0-9._-' '-')-${GITHUB_RUN_ID:-$$}-${GITHUB_RUN_ATTEMPT:-1}-$(date -u +%Y%m%dT%H%M%S%NZ)-${head:0:12}"
  local slot r s o
  # (a) same-run advance of this run's own slot
  if [ -n "${SEALED_RECOVERY_SLOT:-}" ] && [ -n "${SEALED_RECOVERY_LAST:-}" ] && git merge-base --is-ancestor "$SEALED_RECOVERY_LAST" "$head" 2>/dev/null; then
    slot="r1-recovery-slot/$SEALED_RECOVERY_SLOT"
    if git push -q --atomic --force-with-lease="refs/heads/$slot:$SEALED_RECOVERY_LAST" --force-with-lease="refs/heads/$SEALED_RECOVERY_REF:$SEALED_RECOVERY_LAST" --force-with-lease="refs/heads/$ref:" origin "$head:refs/heads/$ref" "$head:refs/heads/$slot" ":refs/heads/$SEALED_RECOVERY_REF" 2>/dev/null; then
      echo "save recovery: the unpublished commit is kept on branch $ref (slot $SEALED_RECOVERY_SLOT, replacing this run's earlier $SEALED_RECOVERY_REF; merged into main by the bot's next recovery pass)"
      SEALED_RECOVERY_LAST=$head; SEALED_RECOVERY_REF=$ref; return 0
    fi
    r=$(sealed_remote_ref "$ref") && s=$(sealed_remote_ref "$slot") && o=$(sealed_remote_ref "$SEALED_RECOVERY_REF") || { echo "Error: save recovery state UNKNOWN (the recovery branches could not be read back); no further attempt; the unpublished commit may exist only on this runner"; return 1; }
    if [ "$r" = "$head" ] && [ "$s" = "$head" ] && [ "$o" = absent ]; then echo "save recovery: the unpublished commit is kept on branch $ref (slot $SEALED_RECOVERY_SLOT; confirmed after an unclear reply)"; SEALED_RECOVERY_LAST=$head; SEALED_RECOVERY_REF=$ref; return 0; fi
    if [ "$r" = absent ] && [ "$s" = "$SEALED_RECOVERY_LAST" ] && [ "$o" = "$SEALED_RECOVERY_LAST" ]; then echo "Error: save recovery could not advance slot $SEALED_RECOVERY_SLOT; the earlier state stays on $SEALED_RECOVERY_REF and the newer commit exists only on this runner"; return 1; fi
    if [ "$r" != absent ] || [ "$s" != absent ] || [ "$o" != absent ]; then echo "Error: save recovery state UNKNOWN (slot $SEALED_RECOVERY_SLOT changed unexpectedly); no further attempt; the newer commit exists only on this runner"; return 1; fi
    # the recovery pass merged and released the earlier pair meanwhile: claim a slot as new (below)
    SEALED_RECOVERY_SLOT=; SEALED_RECOVERY_LAST=; SEALED_RECOVERY_REF=
  fi
  # (b) claim a free slot of this role: checkpoint and slot together, both leased as absent
  for s in $(sealed_recovery_slots "$(sealed_recovery_role)"); do
    slot="r1-recovery-slot/$s"
    if git push -q --atomic --force-with-lease="refs/heads/$slot:" --force-with-lease="refs/heads/$ref:" origin "$head:refs/heads/$ref" "$head:refs/heads/$slot" 2>/dev/null; then
      SEALED_RECOVERY_LAST=$head; SEALED_RECOVERY_REF=$ref; SEALED_RECOVERY_SLOT=$s
      echo "save recovery: the unpublished commit is kept on branch $ref (slot $s; merged into main by the bot's next recovery pass)"; return 0
    fi
    r=$(sealed_remote_ref "$ref") && o=$(sealed_remote_ref "$slot") || { echo "Error: save recovery state UNKNOWN (the recovery branches could not be read back); no further attempt; the unpublished commit may exist only on this runner"; return 1; }
    if [ "$r" = "$head" ] && [ "$o" = "$head" ]; then SEALED_RECOVERY_LAST=$head; SEALED_RECOVERY_REF=$ref; SEALED_RECOVERY_SLOT=$s; echo "save recovery: the unpublished commit is kept on branch $ref (slot $s; confirmed after an unclear reply)"; return 0; fi
    if [ "$r" != absent ]; then echo "Error: save recovery state UNKNOWN ($ref exists but slot $s does not hold it); no further attempt; the unpublished commit may exist only on this runner"; return 1; fi
    if [ "$o" = absent ]; then echo "Error: save recovery push failed too: the unpublished commit exists only on this runner (slot $s was free; the push itself was refused)"; return 1; fi
    echo "save recovery: slot $s is occupied by an earlier unmerged save"
  done
  echo "Error: SAVE RECOVERY FULL: every recovery slot for this workflow holds an earlier unmerged save; nothing was evicted; the unpublished commit exists only on this runner"; return 1
}
#  6. sealed_recover  (R1 rev5, run by the bot) = sealed-recover.mjs: data-only provenance, per-file lineage/union/keyed rules (a stale
#     owner state or Telegram offset is never replayed), atomic push without force, compare-and-delete on the merged tip, and exit 2 =
#     UNKNOWN when the listing/fetch fails. Exit 1 = a checkpoint was kept (refused, raced or main moved); it is retried next pass.
sealed_recover() { node "$R1_ROOT/sealed-recover.mjs"; }
