#!/usr/bin/env bash
# private-outputs.sh: the ONE failure contract for workflow producers whose outputs are owner-derived (P0 Route A, Codex 6852749074).
#   save LABEL              after the producer SUCCEEDED: store every declared private file through the private route.
#                           private mode: exit 0 only on a verified private save, else exit 1 (the job fails visibly).
#                           not private mode: owner-derived outputs are NOT published and NOT durable -> a ::warning:: annotation and a
#                           job-summary line say so explicitly (never a silent green), exit 0.
#   retain-failed LABEL F.. after the producer FAILED: only if this job's private pull succeeded (marker written by the pull step; never
#                           after a failed pull, so stale/unhydrated owner files are never pushed). Each listed canonical output that the
#                           failed run changed (differs from the pulled private copy, or is new) is moved to quarantine
#                           data/private-failed-pass-<stamp>__<name> (never current state; the private canonical copy stays as it
#                           was), then the private route stores the quarantine. Outcome always stated; exit 1 when it is not durable.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd); MODE=${1:-}; LABEL=${2:-producer}; shift 2 2>/dev/null || true
DIR=${PRIVATE_DATA_DIR:-${RUNNER_TEMP:-/tmp}/private-data}; PULLED="${RUNNER_TEMP:-/tmp}/private-pulled-ok"
note() { echo "private outputs ($LABEL): $*"; [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "- private outputs ($LABEL): $*" >> "$GITHUB_STEP_SUMMARY"; return 0; }
case "$MODE" in
  save)
    if [ ! -e "$ROOT/.github/private-data-mode" ]; then echo "::warning::$LABEL: owner-derived outputs are NOT published and NOT durable (not in private mode)"; note "NOT DURABLE: not in private mode; owner-derived outputs were not published"; exit 0; fi
    [ -e "$PULLED" ] || { note "NOT DURABLE: the private pull did not succeed in this job; nothing pushed"; exit 1; }
    if bash "$ROOT/.github/private-data.sh" push; then note "stored privately (verified)"; exit 0; fi
    note "NOT DURABLE: the private save failed; outputs stay on this runner only"; exit 1 ;;
  retain-failed)
    [ -e "$PULLED" ] || { note "producer failed and the private pull had not succeeded: nothing retained or pushed (no stale owner files)"; exit 1; }
    stamp=$(date -u +%Y-%m-%dT%H-%M-%S-000Z); n=0
    for f in "$@"; do [ -f "$ROOT/data/$f" ] || continue
      if [ -f "$DIR/data/$f" ] && cmp -s "$ROOT/data/$f" "$DIR/data/$f"; then continue; fi   # unchanged by the failed run
      mv -f "$ROOT/data/$f" "$ROOT/data/private-failed-pass-$stamp""__""$f" && n=$((n+1)) || { note "Error: could not quarantine $f"; exit 1; }; done
    [ "$n" -gt 0 ] || { note "producer failed; it changed no owner-derived output"; exit 1; }
    printf '{"v":2,"kind":"QUARANTINE: failed producer output; not current state; never replayed or re-sent; UNRESOLVED until a reviewed disposition record exists","label":"%s","at":"%s","files":%s}\n' "$LABEL" "$stamp" "$n" > "$ROOT/data/private-failed-pass-$stamp.json"
    if [ ! -e "$ROOT/.github/private-data-mode" ]; then echo "::warning::$LABEL: failed producer output quarantined on this runner but NOT durable (not in private mode)"; note "NOT DURABLE: $n quarantined, not in private mode"; exit 1; fi
    if bash "$ROOT/.github/private-data.sh" push; then note "producer failed: $n changed outputs stored privately as UNRESOLVED quarantine (not current state)"; exit 1; fi
    note "NOT DURABLE: producer failed and the quarantine could not be stored privately"; exit 1 ;;
  *) echo "usage: private-outputs.sh save LABEL | retain-failed LABEL FILE..."; exit 2 ;;
esac
