#!/usr/bin/env bash
# Connection between this PUBLIC repository and the owner's PRIVATE data repository (privacy migration, owner approved 28 Oct 2026).
# The file list is .github/private-files.txt (paths under data/ in both repositories).
#   check   one-shot test the owner runs first (private-data-check.yml): read, write, copy every private file, read it back and compare
#           checksums, report the token's expiry date. Writes CONNECTION-CHECK.md in the private repository; mirror waits for it.
#   mirror  STAGE 1 (now): after a save, copy the private files from this repository to the private one. Production still reads this
#           repository; a failure here changes nothing and is only logged.
#   pull    STAGE 2 (after the owner approves the switch): private copies replace data/<file>. Fails loudly (exit 1) if the private
#           repository cannot be read or has no positions file, so a job never runs on missing holdings.
#   push    STAGE 2: write changed private files back; conflicts follow .github/save-data.sh (positions and trades keep the newest copy).
# Credential: the secret PRIVATE_DATA_TOKEN (fine-grained, ONLY the private repository, Contents read/write). It is passed to git through
# environment config (never in a URL, a file or a log line); GitHub also masks it in logs. With no token every mode does nothing.
# Never prints file contents: only names, counts and checksums. Tests: test/private-data.test.mjs (local throw-away repositories).
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd)
MODE=${1:-}
REPO=${PRIVATE_DATA_REPO:-drrazaq/stock-2-private-data}
URL=${PRIVATE_DATA_URL:-https://github.com/$REPO.git}
DIR=${PRIVATE_DATA_DIR:-${RUNNER_TEMP:-/tmp}/private-data}
TOKEN=${PRIVATE_DATA_TOKEN:-}
# the IMMUTABLE hydration receipt (written by every successful pull): $RUNNER_TEMP/private-baseline on a runner, else next to the clone
BL=${PRIVATE_BASELINE_DIR:-${RUNNER_TEMP:+$RUNNER_TEMP/private-baseline}}; BL=${BL:-$DIR.baseline}
# INTENT baseline (Codex 6854953656): what this job last hydrated OR last submitted, per file. Write intent = ROOT differs from it. It
# starts as a copy of the hydration receipt and, after a verified save, records the SUBMITTED bytes (never the merged remote bytes), so an
# unchanged local copy is never new intent again; the hydration receipt itself stays immutable (failure retention compares against it).
INT="$BL-intent"
say() { echo "private data: $*"; }
# The declared private set (.github/private-files.txt): file names, plus EXACTLY three allowlisted directory entries written with one
# trailing slash (Codex 6853502834), plus the two-pass private caches data/private-*. A directory entry expands to the REGULAR files under
# data/<dir> on BOTH sides (this checkout and the private clone); a symlink anywhere in it, a non-regular entry, an unsafe path part or a
# breach of the admission bounds stops the operation (nothing is pruned or truncated). list_files runs at start AND again after the
# private clone is opened, so a fresh runner's pull installs every private-* file and every directory file from the private repository.
PRIVATE_DIRS_ALLOWED=" shadow/ ignition-runs/ shadow-outcomes/ "
DIR_MAX_FILES=${PRIVATE_DIR_MAX_FILES:-20000}; DIR_MAX_BYTES=${PRIVATE_DIR_MAX_BYTES:-536870912}   # per directory per side: 20,000 files, 512 MiB
SAFE_PART='^[A-Za-z0-9._-]+$'
expand_dir() {   # $1 side root (…/data), $2 dir name without slash -> prints relative paths; exit 1 on any violation
  local base="$1/$2" n=0 b=0 rel part
  [ -e "$base" ] || [ -L "$base" ] || return 0
  [ -L "$base" ] && { say "Error: data/$2 is a symlink; refusing (nothing copied)"; return 1; }
  [ -d "$base" ] || { say "Error: data/$2 is not a directory; refusing"; return 1; }
  [ -z "$(find -P "$base" ! -type f ! -type d -print -quit)" ] || { say "Error: data/$2 holds a symlink or special file; refusing (nothing copied)"; return 1; }
  while IFS= read -r rel; do [ -n "$rel" ] || continue
    IFS=/ read -ra PARTS <<< "$rel"; for part in "${PARTS[@]}"; do { [ -n "$part" ] && [ "$part" != . ] && [ "$part" != .. ] && [[ "$part" =~ $SAFE_PART ]]; } || { say "Error: unsafe path under data/$2; refusing"; return 1; }; done
    n=$((n+1)); b=$((b+$(stat -c %s "$base/$rel"))); echo "$2/$rel"
  done < <(cd "$base" && find -P . -type f | sed 's#^\./##' | LC_ALL=C sort)
  [ "$n" -le "$DIR_MAX_FILES" ] && [ "$b" -le "$DIR_MAX_BYTES" ] || { say "Error: ADMISSION: data/$2 holds $n files / $b bytes, over the bound ($DIR_MAX_FILES files / $DIR_MAX_BYTES bytes); stopping (nothing pruned or truncated)"; return 1; }
}
list_files() { local e d x; FILES=""; local dirs=""
  for e in $(grep -vE '^\s*(#|$)' "$ROOT/.github/private-files.txt"); do
    case "$e" in */) case "$PRIVATE_DIRS_ALLOWED" in *" $e "*) dirs="$dirs ${e%/}";; *) say "Error: directory entry $e is not one of the allowlisted private directories; refusing"; return 1;; esac;;
      *) FILES="$FILES $e";; esac; done
  FILES="$FILES $(cd "$ROOT/data" 2>/dev/null && ls -1 private-* 2>/dev/null | tr '\n' ' ') $(cd "$DIR/data" 2>/dev/null && ls -1 private-* 2>/dev/null | tr '\n' ' ')"
  for d in $dirs; do for x in "$ROOT/data" "$DIR/data"; do x=$(expand_dir "$x" "$d") || { [ -n "$x" ] && echo "$x" | grep '^private data:'; return 1; }; FILES="$FILES $(echo "$x" | tr '\n' ' ')"; done; done
  FILES=$(echo $FILES | tr ' ' '\n' | awk 'NF && !seen[$0]++' | tr '\n' ' '); }
list_files || exit 1
if [ -z "$TOKEN" ] && [ -z "${PRIVATE_DATA_URL:-}" ]; then
  say "not connected (no PRIVATE_DATA_TOKEN secret), nothing done"; [ "$MODE" = check ] || [ "$MODE" = pull ] && exit 1; exit 0
fi
if [ -n "$TOKEN" ]; then   # git reads this header from the environment; nothing is written to disk
  export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0="http.https://github.com/.extraheader" GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$TOKEN" | base64 | tr -d '\n')"
fi
export GIT_TERMINAL_PROMPT=0 GIT_AUTHOR_NAME=scanner GIT_AUTHOR_EMAIL=scanner@users.noreply.github.com GIT_COMMITTER_NAME=scanner GIT_COMMITTER_EMAIL=scanner@users.noreply.github.com
set -o pipefail
gitp() { git -C "$DIR" -c user.name=scanner -c user.email=scanner@users.noreply.github.com -c commit.gpgsign=false "$@"; }
# exact private-origin binding on every READ path too (Codex 6852260667): an existing clone whose origin is not the declared private
# repository is never read, pulled or written; it is kept as it is (local and pending evidence retained); the origin is never printed.
bound() { [ "$(gitp remote get-url origin 2>/dev/null)" = "$URL" ]; }
open() {
  if [ -d "$DIR/.git" ] && ! bound; then say "Error: the private clone is not bound to the declared private repository; nothing read"; return 1; fi
  if [ -d "$DIR/.git" ]; then gitp pull -q --rebase -X theirs 2>/dev/null || { gitp rebase --abort 2>/dev/null; return 1; }
  else rm -rf "$DIR"; git clone -q "$URL" "$DIR" 2>/dev/null || return 1; fi
}
sum() { (cd "$1" && for f in $FILES; do [ -f "data/$f" ] && sha256sum "data/$f"; done) | sha256sum | cut -c1-16; }
# P0 Route A (Codex 6851680092): every copy is checked. A failed copy means the private save is NOT confirmed (no PRIVATE_SAVE_OK).
# the research registry is written ONLY by merge-library (this run's changes onto the newest private registry); a generic push never
# copies it, so a lab's unmerged run copy can never overwrite the newest registry (check still copies it: that is the custody seeding)
REGISTRY_ONLY_MERGED=" strategy-library.json "
# DELTA SAVE (Codex 6854188071 / 6854282762): on push, only a file that CHANGED on this runner since its hydration (differs from the
# receipt, or is new) is write intent. An unchanged local copy is never written back, so it can never revert a newer private value written
# meanwhile by another writer (a PENDING retry included); a genuine unsaved owner change is still saved. Without a receipt (no pull in this
# runner) every present file is copied, as before. COPIED lists the files this save claims; only those are verified.
# PARTIAL private run-log tail (Codex 6854715808): the private step shell (.github/private-shell.sh) logs every step OUTSIDE the checkout.
# At each private save, and with each quarantine, a BOUNDED tail is kept as a private file, labelled PARTIAL with its as-of time and the
# number of omitted lines. It is never complete evidence and never replaces the owner/quote/event files and their own contract.
RUNLOG_MAX_LINES=2000; RUNLOG_MAX_BYTES=524288
runlog_tail() {   # $1 destination path; returns 1 when there is no private step log in this job
  local L="${RUNNER_TEMP:-/tmp}/private-step-logs/job.log" total
  [ -f "$L" ] && [ ! -L "$L" ] || return 1
  total=$(wc -l < "$L")
  { printf 'PARTIAL private run log, as of %s: the last %s of %s lines, at most %s bytes (anything earlier is NOT retained here)\n' "$(date -u +%FT%TZ)" "$([ "$total" -lt "$RUNLOG_MAX_LINES" ] && echo "$total" || echo "$RUNLOG_MAX_LINES")" "$total" "$RUNLOG_MAX_BYTES"
    tail -n "$RUNLOG_MAX_LINES" "$L" | tail -c "$RUNLOG_MAX_BYTES"; } > "$1.tmp" && mv -f "$1.tmp" "$1"; }
RUNLOG_NAME="private-runlog-$(printf '%s-%s' "${GITHUB_WORKFLOW:-job}" "${GITHUB_JOB:-run}" | tr -c 'A-Za-z0-9._-' '-' | cut -c1-80).log"
COPIED=""
copy_in() { mkdir -p "$DIR/data" || return 1; local f bad=0; COPIED=""
  for f in $FILES; do [ -f "$ROOT/data/$f" ] || continue; [ "$MODE" = push ] && case "$REGISTRY_ONLY_MERGED" in *" $f "*) continue;; esac
    [ "$MODE" = push ] && [ -f "$INT/RECEIPT" ] && [ -f "$INT/data/$f" ] && cmp -s "$ROOT/data/$f" "$INT/data/$f" && continue
    COPIED="$COPIED $f"; { mkdir -p "$(dirname "$DIR/data/$f")" && cp "$ROOT/data/$f" "$DIR/data/$f"; } || { say "Error: could not copy $f into the private clone"; bad=1; }; done
  return $bad; }
# PENDING: an owner update made on this runner whose private save is not yet verified. It is created BEFORE anything else in push (so a
# failure before the copy, the commit or the push keeps it) and removed only by a verified save. While it exists, pull never overwrites
# the newer local owner files: it first retries the save, and if that fails it exits 3 (local state kept; owner commands stay paused).
PENDING="$DIR.pending"
# required private files: their absence stops a pull; every other declared file is optional, and a missing one is never left as a stale
# local copy presented as current (it is set aside as data/private-stale-<name>).
REQUIRED=" my-positions.json halal.json settings.json "
CONFLICT_MERGED=" my-positions.json my-trades.jsonl tg-state.json "   # save-data.sh OWNER_FILES: merged hunk by hunk, may differ locally
commit_push() {
  gitp add -A data CONNECTION-CHECK.md 2>/dev/null; gitp diff --cached --quiet && { say "no change"; return 0; }
  gitp commit -qm "$1" || return 1
  for i in 1 2 3 4 5; do if gitp pull -q --rebase -X theirs 2>/dev/null && gitp push -q 2>/dev/null; then say "saved ($1)"; return 0; fi
    gitp rebase --abort 2>/dev/null; sleep "${SAVE_SLEEP:-5}"; done
  say "Error: could not save to the private repository"; return 1
}
case "$MODE" in
  check)
    open || { say "Error: cannot READ the private repository $REPO (token missing, expired, or not given access to it)"; exit 1; }
    list_files || exit 1
    say "read OK"
    if [ -n "$TOKEN" ] && [ -z "${PRIVATE_DATA_URL:-}" ]; then   # the API check (expiry, private) needs github.com; local tests skip it
      H=$(curl -s -D - -o "$DIR.api" -H "Authorization: Bearer $TOKEN" "https://api.github.com/repos/$REPO" 2>/dev/null)
      EXP=$(printf '%s' "$H" | tr -d '\r' | grep -i '^github-authentication-token-expiration:' | cut -d' ' -f2-)
      say "token expires: ${EXP:-never or unknown}"
      grep -q '"private": *true' "$DIR.api" 2>/dev/null && say "repository is PRIVATE: OK" || { say "Error: the repository is not private (or not readable with this token)"; rm -f "$DIR.api"; exit 1; }
      rm -f "$DIR.api"
    fi
    copy_in || { say "Error: could not copy the private files"; exit 1; }; printf '# Connection check\n\nLast successful check from the public Stock-2 repository: %s\n' "$(date -u +%FT%RZ)" > "$DIR/CONNECTION-CHECK.md"
    commit_push "connection check + copy of the private files $(date -u +%FT%RZ)" || { say "Error: cannot WRITE to the private repository"; exit 1; }
    say "write OK"
    V="$DIR-verify"; rm -rf "$V"; git clone -q "$URL" "$V" 2>/dev/null || { say "Error: read-back failed"; exit 1; }
    n=0; same=0; for f in $FILES; do [ -f "$ROOT/data/$f" ] || continue; n=$((n+1)); cmp -s "$ROOT/data/$f" "$V/data/$f" && same=$((same+1)) || say "DIFFERENT after copy: $f"; done
    rm -rf "$V"; say "$same of $n private files copied and read back identical (checksum $(sum "$ROOT"))"
    [ "$same" = "$n" ] || exit 1; say "CHECK PASSED" ;;
  mirror)
    [ -f "$DIR/.mirrored" ] && [ "$(cat "$DIR/.mirrored")" = "$(sum "$ROOT")" ] && exit 0   # unchanged since the last copy: no network
    [ -n "$(find "$DIR.wait" -mmin -10 2>/dev/null)" ] && exit 0   # not ready 10 minutes ago: try again later, not every 30 s
    open || { say "mirror skipped: private repository not reachable"; touch "$DIR.wait"; exit 0; }
    list_files || exit 1
    [ -f "$DIR/CONNECTION-CHECK.md" ] || { say "mirror waits for the connection check (private-data-check.yml)"; touch "$DIR.wait"; exit 0; }
    rm -f "$DIR.wait"
    copy_in || { say "mirror skipped: a copy failed"; exit 0; }; commit_push "mirror $(date -u +%FT%RZ)" && sum "$ROOT" > "$DIR/.mirrored"; exit 0 ;;
  pull)
    if [ -e "$PENDING" ]; then   # an earlier owner update is not yet stored privately: never overwrite it with an older private copy
      say "an earlier owner update is not yet stored privately; retrying its save before any pull"
      bash "$0" push || { say "Error: earlier owner update still NOT stored privately; local owner files kept (newest), pull refused, owner commands paused"; exit 3; }
    fi
    [ -e "$DIR.install-incomplete" ] && say "an earlier install was incomplete; this pull must complete before any owner file is used"
    open || { say "Error: cannot read the private repository; stopping so nothing runs without your holdings"; exit 1; }
    list_files || exit 1   # the clone is now current: include its private-* caches and directory files
    for f in $REQUIRED; do [ -f "$DIR/data/$f" ] || { say "Error: the private repository has no data/$f; stopping"; exit 1; }; done
    # stage every file first (each copy checked), then install by rename: a failed copy installs NOTHING (no mixed old/new state)
    # staging is never under data/ (a leftover is never published); .git is the same filesystem, so mv is a rename
    if [ -d "$ROOT/.git" ]; then STG="$ROOT/.git/private-pull.$$"; else STG="$DIR.stage.$$"; fi; rm -rf "$STG"; mkdir -p "$STG" || { say "Error: cannot stage the pull"; exit 1; }
    k=0; for f in $FILES; do [ -f "$DIR/data/$f" ] || continue; mkdir -p "$(dirname "$STG/$f")" && cp "$DIR/data/$f" "$STG/$f" || { say "Error: could not copy $f from the private clone; nothing installed"; rm -rf "$STG"; exit 1; }; k=$((k+1)); done
    # install: back up every current file first, then rename; on any failure roll every installed file back. INCOMPLETE marks an install
    # whose rollback also failed: every later pull refuses until a complete install succeeds, so a partial set is never consumed as current.
    INCOMPLETE="$DIR.install-incomplete"; date -u +%FT%TZ > "$INCOMPLETE" || { say "Error: cannot record the install"; rm -rf "$STG"; exit 1; }
    BAK="$STG.bak"; rm -rf "$BAK"; mkdir -p "$BAK" || { say "Error: cannot back up the owner files"; rm -rf "$STG"; exit 1; }
    for f in $FILES; do [ -f "$STG/$f" ] && [ -f "$ROOT/data/$f" ] && { mkdir -p "$(dirname "$BAK/$f")" && cp -p "$ROOT/data/$f" "$BAK/$f" || { say "Error: cannot back up the owner files; nothing installed"; rm -rf "$STG" "$BAK"; rm -f "$INCOMPLETE"; exit 1; }; }; done
    done_list=""; failed=0
    for f in $FILES; do [ -f "$STG/$f" ] || continue; if mkdir -p "$(dirname "$ROOT/data/$f")" && mv -f "$STG/$f" "$ROOT/data/$f"; then done_list="$done_list $f"; else failed=1; break; fi; done
    if [ "$failed" = 1 ]; then rb=0
      for f in $done_list; do if [ -f "$BAK/$f" ]; then cp -p "$BAK/$f" "$ROOT/data/$f" || rb=1; else rm -f "$ROOT/data/$f" || rb=1; fi; done
      if [ "$rb" = 0 ]; then rm -rf "$STG" "$BAK"; rm -f "$INCOMPLETE"; say "Error: an owner file could not be installed; every installed file was rolled back (nothing new is current)"
      else printf 'backup=%s\nstaging=%s\n' "$BAK" "$STG" >> "$INCOMPLETE"   # recovery material is KEPT while unresolved (never deleted here)
        say "Error: install failed AND rollback failed; owner files are marked incomplete, the pre-install backup is kept, and every pull reports it until a complete install"; fi
      exit 1; fi
    rm -rf "$BAK"
    aside_failed=0
    for f in $FILES; do if [ -f "$DIR/data/$f" ]; then :   # installed above
      elif [ -f "$ROOT/data/$f" ]; then case "$f" in private-*) ;; *) if mv -f "$ROOT/data/$f" "$ROOT/data/private-stale-${f//\//__}"; then say "optional $f is absent privately; the local copy was set aside (not used as current)"
        else aside_failed=1; say "Error: optional $f is absent privately but its stale local copy could not be set aside"; fi;; esac; fi; done
    rm -rf "$STG"
    # a stale optional copy that stays at its current name must never be consumed: the install stays INCOMPLETE and the pull fails
    [ "$aside_failed" = 0 ] || { say "Error: pull incomplete (a stale optional owner file is still in place); stopping"; exit 1; }
    rm -f "$INCOMPLETE"
    # IMMUTABLE hydration receipt (Codex 6853280425): a read-only snapshot of every private file exactly as this pull installed it, plus the
    # bound origin's commit. Failure-path retention compares against THIS, never the mutable clone (which a later push's copy changes).
    # Without a complete receipt the pull fails, so no later step can treat this job as hydrated.
    if :; then
      { chmod -R u+w "$BL" 2>/dev/null; rm -rf "$BL"; } && mkdir -p "$BL/data" || { say "Error: cannot record the hydration receipt; stopping"; exit 1; }
      for f in $FILES $(cd "$ROOT/data" 2>/dev/null && ls -1 private-* 2>/dev/null); do [ -f "$ROOT/data/$f" ] || continue
        mkdir -p "$(dirname "$BL/data/$f")" && cp -p "$ROOT/data/$f" "$BL/data/$f" || { say "Error: cannot record the hydration receipt; stopping"; exit 1; }; done
      printf 'commit=%s
files=%s
at=%s
' "$(gitp rev-parse HEAD 2>/dev/null)" "$k" "$(date -u +%FT%TZ)" > "$BL/RECEIPT" && chmod -R a-w "$BL" || { say "Error: cannot record the hydration receipt; stopping"; exit 1; }
      { chmod -R u+w "$INT" 2>/dev/null; rm -rf "$INT"; cp -a "$BL" "$INT" && chmod -R u+w "$INT"; } || { say "Error: cannot record the hydration receipt; stopping"; exit 1; }; fi
    say "pulled $k files" ;;
  push-quarantine)   # push-quarantine: store ONLY new data/private-failed-pass-* files from this runner. Plumbing on a private temporary index
    # over the fetched private branch: no canonical file (owner files, outputs, registry) is ever copied, staged or changed, and the clone's
    # work tree is not touched. A rejected push re-fetches and retries. Verified by reading each quarantine blob back from the remote.
    [ -d "$DIR/.git" ] || { say "Error: quarantine without a pulled private clone; nothing stored"; exit 1; }
    bound || { say "Error: the private clone is not bound to the declared private repository; nothing stored"; exit 1; }
    Q=$(cd "$ROOT/data" 2>/dev/null && ls -1 | grep -E '^private-failed-pass-' ); [ -n "$Q" ] || { say "no quarantine to store"; exit 1; }
    runlog_tail "$ROOT/data/private-failed-pass-$(date -u +%Y-%m-%dT%H-%M-%S-000Z)__$RUNLOG_NAME" && Q=$(cd "$ROOT/data" && ls -1 | grep -E '^private-failed-pass-')   # with its PARTIAL run-log tail
    BR=$(gitp rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 1; IDX="$DIR.qindex.$$"
    for i in 1 2 3 4 5; do rm -f "$IDX"
      gitp fetch -q origin 2>/dev/null || { sleep "${SAVE_SLEEP:-5}"; continue; }
      TIP=$(gitp rev-parse "origin/$BR" 2>/dev/null) || exit 1; GIT_INDEX_FILE="$IDX" gitp read-tree "$TIP" || exit 1; add=0
      for f in $Q; do gitp cat-file -e "$TIP:data/$f" 2>/dev/null && continue   # already stored: a quarantine name is never overwritten
        h=$(git -C "$DIR" hash-object -w "$ROOT/data/$f") && GIT_INDEX_FILE="$IDX" gitp update-index --add --cacheinfo "100644,$h,data/$f" || { rm -f "$IDX"; exit 1; }; add=$((add+1)); done
      [ "$add" -gt 0 ] || { rm -f "$IDX"; say "quarantine already stored"; exit 0; }
      T=$(GIT_INDEX_FILE="$IDX" gitp write-tree) && C=$(gitp commit-tree "$T" -p "$TIP" -m "quarantine $(date -u +%FT%RZ)") || { rm -f "$IDX"; exit 1; }
      if gitp push -q origin "$C:refs/heads/$BR" 2>/dev/null; then rm -f "$IDX"; gitp fetch -q origin 2>/dev/null || exit 1; bad=0
        for f in $Q; do [ "$(gitp rev-parse "origin/$BR:data/$f" 2>/dev/null)" = "$(git hash-object "$ROOT/data/$f")" ] || { say "Error: quarantine $f not confirmed"; bad=1; }; done
        [ "$bad" = 0 ] && say "quarantine stored privately (verified; no canonical file changed)"; exit $bad; fi
      sleep "${SAVE_SLEEP:-5}"; done
    rm -f "$IDX"; say "Error: quarantine NOT stored privately after 5 tries; it stays on this runner only"; exit 1 ;;
  push)
    date -u +%FT%TZ > "$PENDING" || { say "Error: cannot record the pending owner update"; exit 1; }   # first: any later failure keeps it
    # Codex 6855462716: a save never runs without intent provenance once this runner was hydrated. A broken or lost intent record keeps
    # the update PENDING (owner commands pause at the next pull) until the explicit, evidence-preserving `recover-intent`.
    if [ -e "$INT.broken" ] || { [ -f "$BL/RECEIPT" ] && [ ! -f "$INT/RECEIPT" ]; }; then
      say "Error: private save refused: the intent record of this runner is unavailable (no save without provenance); your update is kept; run recover-intent"; exit 1; fi
    runlog_tail "$ROOT/data/$RUNLOG_NAME" && FILES="$FILES $RUNLOG_NAME"   # the PARTIAL run-log tail travels with this save
    [ -d "$DIR/.git" ] || { say "Error: push without pull"; exit 1; }
    bound || { say "Error: private save NOT confirmed (the private clone is not bound to the declared private repository); your update is kept"; exit 1; }
    copy_in || { say "Error: private save NOT confirmed (copy failed); your update is kept on this runner and will be retried"; exit 1; }
    # the shared save's own status decides first (a guard refusal, e.g. PRIVATE_SAVE_EXACT_ORIGIN_REQUIRED, or a failed push): no read-back
    # can relabel a refused save as verified (Codex 6851930599). Its output goes to the job's own log through this pipe; pipefail is set.
    if ! ( cd "$DIR" && SAVE_PRIVATE_REPO=1 SAVE_PRIVATE_EXPECTED_ORIGIN="$URL" SAVE_SLEEP=${SAVE_SLEEP:-5} bash "$ROOT/.github/save-data.sh" "bot $(date -u +%FT%RZ)" ) | sed 's/^/private data: /'; then
      say "Error: private save NOT confirmed (the shared save refused or failed); your update is kept on this runner and will be retried"; exit 1; fi
    # P0 Route A: success only when the save landed: the private repository's branch, read back from the remote, equals the commit this
    # save made, and EVERY declared private file present in this job is committed there (after the save-data.sh conflict rules, e.g. a
    # newer bot copy of the positions wins). The caller sets PRIVATE_SAVE_OK=1 only on this exit 0.
    gitp fetch -q origin 2>/dev/null || { say "Error: private save not verified (cannot read the private repository back)"; exit 1; }
    BR=$(gitp rev-parse --abbrev-ref HEAD 2>/dev/null); bad=0; n=0
    [ -z "$(gitp status --porcelain -- data 2>/dev/null)" ] || { say "Error: private save left uncommitted owner files"; bad=1; }
    [ "$(gitp rev-parse HEAD 2>/dev/null)" = "$(gitp rev-parse "origin/$BR" 2>/dev/null)" ] || { say "Error: private save not on the private repository"; bad=1; }
    m=0; for f in $COPIED; do [ -f "$ROOT/data/$f" ] || continue; case "$REGISTRY_ONLY_MERGED" in *" $f "*) continue;; esac; n=$((n+1))
      gitp cat-file -e "origin/$BR:data/$f" 2>/dev/null || { say "Error: private file $f not confirmed on the private repository"; bad=1; continue; }
      # content, not only existence: the stored bytes must be this job's bytes, except the hunk-merged owner files (save-data.sh rule)
      [ "$(gitp rev-parse "origin/$BR:data/$f" 2>/dev/null)" = "$(git hash-object "$ROOT/data/$f")" ] && continue
      case "$CONFLICT_MERGED" in *" $f "*) m=$((m+1)); say "$f was merged with a newer private copy (save-data.sh rule)";; *) say "Error: private file $f differs from this job's copy"; bad=1;; esac; done
    [ "$bad" = 0 ] || exit 1
    # the INTENT baseline records the bytes this save SUBMITTED (not the merged remote bytes): unchanged local copies are no new intent.
    # The hydration receipt is never modified. If the intent record cannot be written, the save is stored but provenance is not: the
    # intent baseline is marked BROKEN and the update stays PENDING, so no later save can treat stale local bytes as intent.
    if [ -f "$INT/RECEIPT" ]; then for f in $COPIED; do mkdir -p "$(dirname "$INT/data/$f")" && cp "$ROOT/data/$f" "$INT/data/$f" || {
      date -u +%FT%TZ > "$INT.broken" 2>/dev/null; say "Error: private save stored and verified, but its intent record could not be written: further saves are refused until recover-intent (your update stays pending)"; exit 1; }; done; fi
    rm -f "$PENDING"
    say "private save verified: $n changed files ($m merged with a newer private copy)" ;;
  recover-intent)   # explicit recovery (Codex 6855462716) after an unavailable intent record: NOTHING local becomes canonical. Every local
    # private file that differs from the private repository's newest copy (or is absent there) is kept as UNRESOLVED quarantine
    # data/private-failed-pass-<stamp>__intent-unknown__<name> and stored by push-quarantine; then the pending state and the broken
    # marker are cleared and a fresh pull installs the private repository's copies with new receipts. Review the quarantine by hand.
    [ -d "$DIR/.git" ] || { say "Error: no private clone to recover against"; exit 1; }
    bound || { say "Error: the private clone is not bound to the declared private repository; nothing recovered"; exit 1; }
    gitp fetch -q origin 2>/dev/null || { say "Error: cannot read the private repository; nothing recovered"; exit 1; }
    BR=$(gitp rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 1; stamp=$(date -u +%Y-%m-%dT%H-%M-%S-000Z); q=0
    for f in $FILES; do [ -f "$ROOT/data/$f" ] || continue; case "$f" in private-failed-pass-*) continue;; esac
      [ "$(gitp rev-parse "origin/$BR:data/$f" 2>/dev/null)" = "$(git hash-object "$ROOT/data/$f")" ] && continue
      cp "$ROOT/data/$f" "$ROOT/data/private-failed-pass-$stamp""__intent-unknown__${f//\//__}" || { say "Error: cannot keep $f as quarantine; nothing cleared"; exit 1; }; q=$((q+1)); done
    if [ "$q" -gt 0 ]; then bash "$0" push-quarantine || { say "Error: the quarantine could not be stored privately; nothing cleared"; exit 1; }; fi
    rm -f "$PENDING" "$INT.broken"; chmod -R u+w "$INT" 2>/dev/null; rm -rf "$INT"
    say "intent recovery: $q differing local files kept as UNRESOLVED quarantine (none written as current); pulling the private copies"
    exec bash "$0" pull ;;
  require)   # require FILE...: research writers' REQUIRED HISTORY admission (Codex 6852935516). In private mode, after a successful pull, a
    # missing private frozen record or registry is UNKNOWN, never a fresh empty first run: exit 1 so the producer does not run (and
    # cannot reset trial accounting or erase a failed verdict). Protective bot/holding paths never call this.
    [ -e "$ROOT/.github/private-data-mode" ] || { say "not in private mode: required history is the checkout's own"; exit 0; }
    shift; miss=0; for f in "$@"; do [ -f "$ROOT/data/$f" ] || { say "Error: required history data/$f is missing privately: UNKNOWN, this producer does not run (never a fresh first run)"; miss=1; }; done
    exit $miss ;;
  merge-library)   # merge-library BASE RUN: apply ONLY this run's registry changes (library-merge.mjs) onto the NEWEST private registry and
    # push; a rejected push re-fetches and re-merges (no last-writer-wins). Success = the private branch holds exactly the merged bytes.
    BASE=${2:-}; RUNF=${3:-}; [ -f "$BASE" ] && [ -f "$RUNF" ] || { say "Error: merge-library needs the base and run copies; nothing merged"; exit 1; }
    [ -d "$DIR/.git" ] || { say "Error: merge-library without a pulled private clone"; exit 1; }
    bound || { say "Error: the private clone is not bound to the declared private repository; nothing merged"; exit 1; }
    BR=$(gitp rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 1
    for i in 1 2 3 4 5; do
      gitp fetch -q origin 2>/dev/null && gitp reset -q --hard "origin/$BR" 2>/dev/null || { sleep "${SAVE_SLEEP:-5}"; continue; }
      [ -f "$DIR/data/strategy-library.json" ] || { say "Error: the private registry is missing: UNKNOWN; nothing merged (never a fresh registry)"; exit 1; }
      node "$ROOT/library-merge.mjs" "$BASE" "$RUNF" "$DIR/data/strategy-library.json" | sed 's/^/private data: /' || exit 1
      { runlog_tail "$DIR/data/$RUNLOG_NAME" && gitp add -- "data/$RUNLOG_NAME"; } 2>/dev/null   # the PARTIAL run-log tail travels with the registry merge
      gitp add -- data/strategy-library.json && { gitp diff --cached --quiet || gitp commit -qm "registry merge $(date -u +%FT%RZ)"; } || exit 1
      if gitp push -q origin "HEAD:$BR" 2>/dev/null; then
        gitp fetch -q origin 2>/dev/null && [ "$(gitp rev-parse HEAD)" = "$(gitp rev-parse "origin/$BR")" ] || { say "Error: registry merge not verified on the private repository"; exit 1; }
        cp "$DIR/data/strategy-library.json" "$ROOT/data/strategy-library.json" || { say "Error: merged registry stored privately but the local copy could not be refreshed"; exit 1; }
        say "registry merged and stored privately (verified)"; exit 0; fi
      sleep "${SAVE_SLEEP:-5}"; done
    say "Error: registry merge NOT stored privately after 5 tries; this run's registry edits stay on this runner only"; exit 1 ;;
  latest)   # latest FILE OUT: the private repository's newest copy of one declared owner file, written to OUT (never printed).
    # exit 0 written, 2 absent in the private repository, 1 unreadable (the nightly treats it as UNKNOWN). Reads only; no local fallback.
    F=${2:-}; OUT=${3:-}; case " $(echo $FILES) " in *" $F "*) ;; *) say "Error: $F is not a declared private file"; exit 1 ;; esac; [ -n "$OUT" ] || exit 1
    [ -d "$DIR/.git" ] || { git clone -q "$URL" "$DIR" 2>/dev/null || exit 1; }
    bound || { say "Error: the private clone is not bound to the declared private repository; nothing read"; exit 1; }
    gitp fetch -q origin 2>/dev/null || exit 1; BR=$(gitp rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 1
    gitp cat-file -e "origin/$BR:data/$F" 2>/dev/null || exit 2
    ( umask 077; gitp show "origin/$BR:data/$F" > "$OUT.tmp" 2>/dev/null ) && mv -f "$OUT.tmp" "$OUT" || { rm -f "$OUT.tmp"; exit 1; } ;;
  *) echo "usage: private-data.sh check|mirror|pull|push|push-quarantine|recover-intent|latest|require|merge-library"; exit 2 ;;
esac
