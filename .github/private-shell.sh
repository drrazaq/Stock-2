#!/usr/bin/env bash
# PRIVATE STEP SHELL (P0 Route A, Codex 6854715808). Every `run:` step of a workflow that hydrates private data, or reads the owner's files
# or the private registry, runs through this shell:
#   defaults.run.shell: bash .github/private-shell.sh plain {0}      (GitHub's default bash: bash -e {0})
#   shell:              bash .github/private-shell.sh pipefail {0}   (GitHub's `shell: bash`: bash --noprofile --norc -eo pipefail {0})
# The step script runs exactly as GitHub's own bash would (same flags, same exit status, same environment, GITHUB_OUTPUT/ENV/SUMMARY
# files work as before, except the PUBLIC step summary, which is redirected privately), but ALL of its stdout and stderr goes to a runner-local private log OUTSIDE the checkout (never under data/, so
# no reset/clean removes it and no public save can stage it; never run.log, so there is no recursion and no tee overwrite).
# The PUBLIC job log gets one generic line per step: "private step N: exit X". Nothing the step prints is passed through: no `::` workflow
# command, annotation, mask, group or helper-prefixed text, since any of them could carry private payload.
# Persistence: private-data.sh keeps a BOUNDED, explicitly PARTIAL tail (with its as-of time and the omitted line count) as a private
# file at every private save and with every quarantine. It is never complete evidence: owner, quote and event evidence stays in its own
# private files under the established save/quarantine contract.
set -u
MODE=${1:-}; SCRIPT=${2:-}
case "$MODE" in plain) FLAGS=(-e);; pipefail) FLAGS=(--noprofile --norc -eo pipefail);; *) echo "private step shell: bad mode; step not run"; exit 2;; esac
[ -f "$SCRIPT" ] || { echo "private step shell: no step script; step not run"; exit 2; }
D=${RUNNER_TEMP:-/tmp}/private-step-logs
( umask 077; mkdir -p "$D" ) && [ ! -L "$D" ] || { echo "private step shell: private log unavailable; step not run"; exit 1; }
N=$(( $(cat "$D/.n" 2>/dev/null || echo 0) + 1 )); echo "$N" > "$D/.n"
LOG="$D/job.log"
{ printf '=== step %s start %s ===\n' "$N" "$(date -u +%FT%TZ)"; } >> "$LOG" 2>/dev/null || { echo "private step shell: private log unavailable; step not run"; exit 1; }
# GITHUB_STEP_SUMMARY is a separate PUBLIC channel (Codex 6855462716): the step writes its summary to a private file instead, appended to the
# private log. GITHUB_OUTPUT and GITHUB_ENV (machine outputs needed for orchestration) are unchanged.
SUMMARY="$D/step-$N-summary.md"; ( umask 077; : > "$SUMMARY" ) || { echo "private step shell: private log unavailable; step not run"; exit 1; }
GITHUB_STEP_SUMMARY="$SUMMARY" bash "${FLAGS[@]}" "$SCRIPT" >> "$LOG" 2>&1 < /dev/null; rc=$?
[ -s "$SUMMARY" ] && { printf '=== step %s summary (private) ===\n' "$N"; cat "$SUMMARY"; } >> "$LOG" 2>/dev/null
printf '=== step %s exit %s %s ===\n' "$N" "$rc" "$(date -u +%FT%TZ)" >> "$LOG" 2>/dev/null
echo "private step $N: exit $rc (output kept privately)"
exit "$rc"
