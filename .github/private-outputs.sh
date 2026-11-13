#!/usr/bin/env bash
# private-outputs.sh: the ONE failure contract for workflow producers whose outputs are owner-derived (P0 Route A, Codex 6852749074,
# 6853070590, 6853118258, 6853280425).
#   admit                   the step right after a successful private pull (and its required-history check): records that this job was
#                           HYDRATED (the pull's marker and its immutable receipt exist) and that the producer is admitted to run.
#   save LABEL              after the producer SUCCEEDED: store every declared private file through the private route.
#                           private mode: exit 0 only on a verified private save, else exit 1 (the job fails visibly; the caller stops
#                           before any reset/clean so the unconfirmed bytes stay for retention).
#                           not private mode: owner-derived outputs are NOT published and NOT durable -> a ::warning:: annotation and a
#                           job-summary line say so explicitly (never a silent green), exit 0.
#   retain-failed LABEL F.. after the producer FAILED (or its save failed): only in a job that was hydrated AND admitted. Each listed
#                           output that differs from the IMMUTABLE hydration receipt (or is new) is moved to quarantine
#                           data/private-failed-pass-<stamp>__<name>, and ONLY the quarantine is stored (private-data.sh push-quarantine):
#                           no canonical private file is ever written from a failed run, so stale or unhydrated owner bytes can never
#                           replace the private store. Outcome always stated; always exit 1.
#   retain-copy LABEL SRC NAME  same admission; SRC (e.g. an unstored registry merge) is kept as quarantine __NAME; always exit 1.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd); MODE=${1:-}; LABEL=${2:-producer}; shift 2 2>/dev/null || true
T=${RUNNER_TEMP:-/tmp}; PULLED="$T/private-pulled-ok"; BL=${PRIVATE_BASELINE_DIR:-$T/private-baseline}; ADMITTED="$T/private-producer-admitted"
note() { echo "private outputs ($LABEL): $*"; [ -n "${GITHUB_STEP_SUMMARY:-}" ] && echo "- private outputs ($LABEL): $*" >> "$GITHUB_STEP_SUMMARY"; return 0; }
priv() { [ -e "$ROOT/.github/private-data-mode" ]; }
hydrated() { [ -e "$PULLED" ] && [ -f "$BL/RECEIPT" ]; }
admitted() { hydrated && [ -e "$ADMITTED" ]; }
stamp=$(date -u +%Y-%m-%dT%H-%M-%S-000Z)
store_quarantine() {   # $1 = count; record + quarantine-only push
  printf '{"v":2,"kind":"QUARANTINE: failed producer output; not current state; never replayed or re-sent; UNRESOLVED until a reviewed disposition record exists","label":"%s","at":"%s","files":%s}\n' "$LABEL" "$stamp" "$1" > "$ROOT/data/private-failed-pass-$stamp.json"
  if ! priv; then echo "::warning::$LABEL: failed producer output quarantined on this runner but NOT durable (not in private mode)"; note "NOT DURABLE: $1 quarantined, not in private mode"; exit 1; fi
  if bash "$ROOT/.github/private-data.sh" push-quarantine; then note "producer failed: $1 changed outputs stored privately as UNRESOLVED quarantine (not current state; no canonical file written)"; exit 1; fi
  note "NOT DURABLE: the quarantine could not be stored privately; it stays on this runner only"; exit 1; }
gate() { if priv; then admitted || { note "UNRETAINED: this job was not hydrated and admitted (failed pull, missing receipt, or the producer never started): nothing quarantined or pushed (no stale owner bytes)"; exit 1; }
  else note "NOT DURABLE / UNRETAINED: not in private mode"; fi; }
case "$MODE" in
  admit)
    priv || { note "not in private mode: nothing to admit"; exit 0; }
    hydrated || { note "Error: no successful hydration receipt in this job; the producer is NOT admitted"; exit 1; }
    date -u +%FT%TZ > "$ADMITTED" || exit 1; note "hydrated; producer admitted" ;;
  save)
    if ! priv; then echo "::warning::$LABEL: owner-derived outputs are NOT published and NOT durable (not in private mode)"; note "NOT DURABLE: not in private mode; owner-derived outputs were not published"; exit 0; fi
    admitted || { note "NOT DURABLE: this job was not hydrated and admitted; nothing pushed"; exit 1; }
    if bash "$ROOT/.github/private-data.sh" push; then note "stored privately (verified)"; exit 0; fi
    note "NOT DURABLE: the private save failed; outputs stay on this runner only"; exit 1 ;;
  retain-failed)
    gate; n=0
    for f in "$@"; do [ -f "$ROOT/data/$f" ] || continue
      if [ -f "$BL/data/$f" ] && cmp -s "$ROOT/data/$f" "$BL/data/$f"; then continue; fi   # unchanged since hydration
      mv -f "$ROOT/data/$f" "$ROOT/data/private-failed-pass-$stamp""__""${f//\//__}" && n=$((n+1)) || { note "Error: could not quarantine $f"; exit 1; }; done
    [ "$n" -gt 0 ] || { note "producer failed; it changed no owner-derived output since hydration"; exit 1; }
    store_quarantine "$n" ;;
  retain-copy)
    gate; SRC=${1:-}; NAME=${2:-}; [ -f "$SRC" ] && [ -n "$NAME" ] || { note "UNRETAINED: nothing to keep"; exit 1; }
    if [ -f "$BL/data/$NAME" ] && cmp -s "$SRC" "$BL/data/$NAME"; then note "unchanged since hydration; nothing to keep"; exit 1; fi
    cp "$SRC" "$ROOT/data/private-failed-pass-$stamp""__""$NAME" || { note "Error: could not quarantine $NAME"; exit 1; }
    store_quarantine 1 ;;
  *) echo "usage: private-outputs.sh admit | save LABEL | retain-failed LABEL FILE... | retain-copy LABEL SRC NAME"; exit 2 ;;
esac
