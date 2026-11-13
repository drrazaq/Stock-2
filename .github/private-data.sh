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
FILES=$(grep -vE '^\s*(#|$)' "$ROOT/.github/private-files.txt")
# two-pass scan private caches (data/private-*): present locally after a scan, or in the private repository after a pull
FILES="$FILES $(cd "$ROOT/data" 2>/dev/null && ls -1 private-* 2>/dev/null | tr '\n' ' ') $(cd "$DIR/data" 2>/dev/null && ls -1 private-* 2>/dev/null | tr '\n' ' ')"
say() { echo "private data: $*"; }
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
copy_in() { mkdir -p "$DIR/data" || return 1; local f bad=0
  for f in $FILES; do [ -f "$ROOT/data/$f" ] || continue; cp "$ROOT/data/$f" "$DIR/data/$f" || { say "Error: could not copy $f into the private clone"; bad=1; }; done
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
    for f in $FILES; do [ -f "$STG/$f" ] || continue; if mv -f "$STG/$f" "$ROOT/data/$f"; then done_list="$done_list $f"; else failed=1; break; fi; done
    if [ "$failed" = 1 ]; then rb=0
      for f in $done_list; do if [ -f "$BAK/$f" ]; then cp -p "$BAK/$f" "$ROOT/data/$f" || rb=1; else rm -f "$ROOT/data/$f" || rb=1; fi; done
      rm -rf "$STG" "$BAK"
      if [ "$rb" = 0 ]; then rm -f "$INCOMPLETE"; say "Error: an owner file could not be installed; every installed file was rolled back (nothing new is current)"; else say "Error: install failed AND rollback failed; owner files are marked incomplete and every pull refuses until a complete install"; fi
      exit 1; fi
    rm -rf "$BAK"
    for f in $FILES; do if [ -f "$DIR/data/$f" ]; then :   # installed above
      elif [ -f "$ROOT/data/$f" ]; then case "$f" in private-*) ;; *) mv -f "$ROOT/data/$f" "$ROOT/data/private-stale-$f" && say "optional $f is absent privately; the local copy was set aside (not used as current)";; esac; fi; done
    rm -rf "$STG"; rm -f "$INCOMPLETE"; say "pulled $k files" ;;
  push)
    date -u +%FT%TZ > "$PENDING" || { say "Error: cannot record the pending owner update"; exit 1; }   # first: any later failure keeps it
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
    m=0; for f in $FILES; do [ -f "$ROOT/data/$f" ] || continue; n=$((n+1))
      gitp cat-file -e "origin/$BR:data/$f" 2>/dev/null || { say "Error: private file $f not confirmed on the private repository"; bad=1; continue; }
      # content, not only existence: the stored bytes must be this job's bytes, except the hunk-merged owner files (save-data.sh rule)
      [ "$(gitp rev-parse "origin/$BR:data/$f" 2>/dev/null)" = "$(git hash-object "$ROOT/data/$f")" ] && continue
      case "$CONFLICT_MERGED" in *" $f "*) m=$((m+1)); say "$f was merged with a newer private copy (save-data.sh rule)";; *) say "Error: private file $f differs from this job's copy"; bad=1;; esac; done
    [ "$bad" = 0 ] || exit 1; rm -f "$PENDING"; say "private save verified: $n files ($m merged with a newer private copy)" ;;
  latest)   # latest FILE OUT: the private repository's newest copy of one declared owner file, written to OUT (never printed).
    # exit 0 written, 2 absent in the private repository, 1 unreadable (the nightly treats it as UNKNOWN). Reads only; no local fallback.
    F=${2:-}; OUT=${3:-}; case " $(echo $FILES) " in *" $F "*) ;; *) say "Error: $F is not a declared private file"; exit 1 ;; esac; [ -n "$OUT" ] || exit 1
    [ -d "$DIR/.git" ] || { git clone -q "$URL" "$DIR" 2>/dev/null || exit 1; }
    bound || { say "Error: the private clone is not bound to the declared private repository; nothing read"; exit 1; }
    gitp fetch -q origin 2>/dev/null || exit 1; BR=$(gitp rev-parse --abbrev-ref HEAD 2>/dev/null) || exit 1
    gitp cat-file -e "origin/$BR:data/$F" 2>/dev/null || exit 2
    ( umask 077; gitp show "origin/$BR:data/$F" > "$OUT.tmp" 2>/dev/null ) && mv -f "$OUT.tmp" "$OUT" || { rm -f "$OUT.tmp"; exit 1; } ;;
  *) echo "usage: private-data.sh check|mirror|pull|push|latest"; exit 2 ;;
esac
