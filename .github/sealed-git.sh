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
# (rev14, Codex 6723732821 B2/B3) PER-RUN RECOVERY STATE, kept in a file under RUNNER_TEMP so it survives a new shell in the same job (the
# bot's final always() save step) and a lost push reply: LAST/REF/SLOT = the confirmed checkpoint this run holds; PEND_* = an attempted
# push not yet confirmed (written BEFORE the push). Only this run's own checkpoint names (save-recovery/<workflow>-<run>-<attempt>-...)
# and this role's slots are ever loaded; anything else in the file is ignored. Every use is re-validated on the remote by exact leases.
sealed_recovery_prefix() { printf 'save-recovery/%s-%s-%s-' "$(printf '%s' "${GITHUB_WORKFLOW:-local}" | tr -c 'A-Za-z0-9._-' '-')" "${GITHUB_RUN_ID:-$$}" "${GITHUB_RUN_ATTEMPT:-1}"; }
# keyed by run AND checkout: the loop and the final step of one job share both; separate checkouts (or tests) never share a file
sealed_recovery_statefile() { printf '%s/r1-recovery-%s%s.state' "${RUNNER_TEMP:-/tmp}" "$(sealed_recovery_prefix | tr '/' '_')" "$(git rev-parse --show-toplevel 2>/dev/null | cksum | cut -d' ' -f1)"; }
sealed_recovery_save_state() {
  local f tmp; f=$(sealed_recovery_statefile); tmp="$f.tmp.$$"
  printf 'LAST=%s\nREF=%s\nSLOT=%s\nPEND_REF=%s\nPEND_TIP=%s\nPEND_SLOT=%s\nPEND_OLD=%s\nPEND_OLDREF=%s\n' "${SEALED_RECOVERY_LAST:-}" "${SEALED_RECOVERY_REF:-}" "${SEALED_RECOVERY_SLOT:-}" \
    "${SEALED_PEND_REF:-}" "${SEALED_PEND_TIP:-}" "${SEALED_PEND_SLOT:-}" "${SEALED_PEND_OLD:-}" "${SEALED_PEND_OLDREF:-}" > "$tmp" && mv -f "$tmp" "$f"
}
sealed_recovery_load_state() {
  local f k v pre slots ok=1; f=$(sealed_recovery_statefile); [ -f "$f" ] || return 0
  pre=$(sealed_recovery_prefix); slots=" $(sealed_recovery_slots "$(sealed_recovery_role)") "
  local L= R= SL= PR= PT= PS= PO= POR=
  while IFS='=' read -r k v; do case "$k" in LAST) L=$v ;; REF) R=$v ;; SLOT) SL=$v ;; PEND_REF) PR=$v ;; PEND_TIP) PT=$v ;; PEND_SLOT) PS=$v ;; PEND_OLD) PO=$v ;; PEND_OLDREF) POR=$v ;; esac; done < "$f"
  for v in "$L" "$PT" "$PO"; do [ -z "$v" ] || [[ "$v" =~ ^[0-9a-f]{40}$ ]] || ok=0; done
  for v in "$R" "$PR" "$POR"; do [ -z "$v" ] || [[ "$v" == "$pre"* ]] || ok=0; done
  for v in "$SL" "$PS"; do [ -z "$v" ] || [[ "$slots" == *" $v "* ]] || ok=0; done
  [ "$ok" = 1 ] || { echo "Error: save recovery state file is not this run's (ignored): $f"; return 0; }
  SEALED_RECOVERY_LAST=$L; SEALED_RECOVERY_REF=$R; SEALED_RECOVERY_SLOT=$SL
  SEALED_PEND_REF=$PR; SEALED_PEND_TIP=$PT; SEALED_PEND_SLOT=$PS; SEALED_PEND_OLD=$PO; SEALED_PEND_OLDREF=$POR
}
sealed_pend_clear() { SEALED_PEND_REF=; SEALED_PEND_TIP=; SEALED_PEND_SLOT=; SEALED_PEND_OLD=; SEALED_PEND_OLDREF=; }
# Reconcile the pending attempt against the remote (read-only). 0 = settled (confirmed or clearly not applied); 1 = UNKNOWN (kept pending).
sealed_recovery_reconcile() {
  [ -n "${SEALED_PEND_REF:-}" ] || return 0
  local r s o=absent slot="r1-recovery-slot/$SEALED_PEND_SLOT"
  r=$(sealed_remote_ref "$SEALED_PEND_REF") && s=$(sealed_remote_ref "$slot") || { echo "Error: save recovery state UNKNOWN (the recovery branches could not be read back); no further attempt; the unpublished commit may exist only on this runner"; return 1; }
  if [ -n "${SEALED_PEND_OLDREF:-}" ]; then o=$(sealed_remote_ref "$SEALED_PEND_OLDREF") || { echo "Error: save recovery state UNKNOWN (the recovery branches could not be read back); no further attempt; the unpublished commit may exist only on this runner"; return 1; }; fi
  if [ "$r" = "$SEALED_PEND_TIP" ] && [ "$s" = "$SEALED_PEND_TIP" ] && [ "$o" = absent ]; then
    echo "save recovery: the unpublished commit is kept on branch $SEALED_PEND_REF (slot $SEALED_PEND_SLOT; confirmed after an unclear reply)"
    SEALED_RECOVERY_LAST=$SEALED_PEND_TIP; SEALED_RECOVERY_REF=$SEALED_PEND_REF; SEALED_RECOVERY_SLOT=$SEALED_PEND_SLOT; sealed_pend_clear; sealed_recovery_save_state; return 0
  fi
  if [ "$r" = absent ]; then
    if [ -n "${SEALED_PEND_OLDREF:-}" ]; then
      if [ "$s" = "$SEALED_PEND_OLD" ] && [ "$o" = "$SEALED_PEND_OLD" ]; then sealed_pend_clear; sealed_recovery_save_state; return 0; fi   # replacement not applied; earlier pair intact
      if [ "$s" = absent ] && [ "$o" = absent ]; then SEALED_RECOVERY_LAST=; SEALED_RECOVERY_REF=; SEALED_RECOVERY_SLOT=; sealed_pend_clear; sealed_recovery_save_state; return 0; fi   # recovery merged and released the pair
    elif [ "$s" != "$SEALED_PEND_TIP" ]; then sealed_pend_clear; sealed_recovery_save_state; return 0; fi   # claim not applied (slot free or held by another tip)
  fi
  echo "Error: save recovery state UNKNOWN ($SEALED_PEND_REF / slot $SEALED_PEND_SLOT in an unexpected state); no further attempt; the unpublished commit may exist only on this runner"; return 1
}
sealed_recovery_push() {
  [ -n "$(git rev-list origin/main..HEAD 2>/dev/null)" ] || return 0
  git rebase --abort 2>/dev/null || true
  local head; head=$(git rev-parse HEAD)
  sealed_recovery_load_state
  sealed_recovery_reconcile || return 1
  [ -n "${SEALED_RECOVERY_LAST:-}" ] && [ "$SEALED_RECOVERY_LAST" = "$head" ] && { echo "save recovery: this unpublished state is already kept on ${SEALED_RECOVERY_REF:-a recovery branch}"; return 0; }
  if ! sealed_push_guard; then echo "Error: save recovery refused by the sealed guard: the unpublished commit exists only on this runner"; return 1; fi
  local size max; max=$(sealed_recovery_max)
  if ! size=$(sealed_recovery_size) || [ -z "$size" ]; then echo "Error: save recovery size UNKNOWN: no recovery branch pushed; the unpublished commit exists only on this runner"; return 1; fi
  if [ "$size" -gt "$max" ]; then echo "Error: save recovery refused: the unpublished data is $size bytes (limit $max); the unpublished commit exists only on this runner"; return 1; fi
  local ref; ref="$(sealed_recovery_prefix)$(date -u +%Y%m%dT%H%M%S%NZ)-${head:0:12}"
  local s
  # (a) same-run advance of this run's own slot (HEAD descends from the checkpoint this run holds)
  if [ -n "${SEALED_RECOVERY_SLOT:-}" ] && [ -n "${SEALED_RECOVERY_LAST:-}" ] && git merge-base --is-ancestor "$SEALED_RECOVERY_LAST" "$head" 2>/dev/null; then
    SEALED_PEND_REF=$ref; SEALED_PEND_TIP=$head; SEALED_PEND_SLOT=$SEALED_RECOVERY_SLOT; SEALED_PEND_OLD=$SEALED_RECOVERY_LAST; SEALED_PEND_OLDREF=$SEALED_RECOVERY_REF; sealed_recovery_save_state
    if git push -q --atomic --force-with-lease="refs/heads/r1-recovery-slot/$SEALED_RECOVERY_SLOT:$SEALED_RECOVERY_LAST" --force-with-lease="refs/heads/$SEALED_RECOVERY_REF:$SEALED_RECOVERY_LAST" --force-with-lease="refs/heads/$ref:" origin "$head:refs/heads/$ref" "$head:refs/heads/r1-recovery-slot/$SEALED_RECOVERY_SLOT" ":refs/heads/$SEALED_RECOVERY_REF" 2>/dev/null; then
      echo "save recovery: the unpublished commit is kept on branch $ref (slot $SEALED_RECOVERY_SLOT, replacing this run's earlier $SEALED_RECOVERY_REF; merged into main by the bot's next recovery pass)"
      SEALED_RECOVERY_LAST=$head; SEALED_RECOVERY_REF=$ref; sealed_pend_clear; sealed_recovery_save_state; return 0
    fi
    sealed_recovery_reconcile || return 1
    [ "${SEALED_RECOVERY_LAST:-}" = "$head" ] && return 0
    if [ -n "${SEALED_RECOVERY_LAST:-}" ]; then echo "Error: save recovery could not advance slot $SEALED_RECOVERY_SLOT; the earlier state stays on $SEALED_RECOVERY_REF and the newer commit exists only on this runner"; return 1; fi
    # the recovery pass merged and released the earlier pair meanwhile: claim a slot as new (below)
  fi
  # (b) claim a free slot of this role: checkpoint and slot together, both leased as absent
  for s in $(sealed_recovery_slots "$(sealed_recovery_role)"); do
    SEALED_PEND_REF=$ref; SEALED_PEND_TIP=$head; SEALED_PEND_SLOT=$s; SEALED_PEND_OLD=; SEALED_PEND_OLDREF=; sealed_recovery_save_state
    if git push -q --atomic --force-with-lease="refs/heads/r1-recovery-slot/$s:" --force-with-lease="refs/heads/$ref:" origin "$head:refs/heads/$ref" "$head:refs/heads/r1-recovery-slot/$s" 2>/dev/null; then
      SEALED_RECOVERY_LAST=$head; SEALED_RECOVERY_REF=$ref; SEALED_RECOVERY_SLOT=$s; sealed_pend_clear; sealed_recovery_save_state
      echo "save recovery: the unpublished commit is kept on branch $ref (slot $s; merged into main by the bot's next recovery pass)"; return 0
    fi
    local o; o=$(sealed_remote_ref "r1-recovery-slot/$s") || o=
    sealed_recovery_reconcile || return 1
    [ "${SEALED_RECOVERY_LAST:-}" = "$head" ] && return 0
    if [ "$o" = absent ]; then echo "Error: save recovery push failed too: the unpublished commit exists only on this runner (slot $s was free; the push itself was refused)"; return 1; fi
    echo "save recovery: slot $s is occupied by an earlier unmerged save"
  done
  echo "Error: SAVE RECOVERY FULL: every recovery slot for this workflow holds an earlier unmerged save; nothing was evicted; the unpublished commit exists only on this runner"; return 1
}
#  6. sealed_recover  (R1 rev5, run by the bot) = sealed-recover.mjs: data-only provenance, per-file lineage/union/keyed rules (a stale
#     owner state or Telegram offset is never replayed), atomic push without force, compare-and-delete on the merged tip, and exit 2 =
#     UNKNOWN when the listing/fetch fails. Exit 1 = a checkpoint was kept (refused, raced or main moved); it is retried next pass.
sealed_recover() { node "$R1_ROOT/sealed-recover.mjs"; }
