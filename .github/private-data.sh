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
open() {
  if [ -d "$DIR/.git" ]; then gitp pull -q --rebase -X theirs 2>/dev/null || { gitp rebase --abort 2>/dev/null; return 1; }
  else rm -rf "$DIR"; git clone -q "$URL" "$DIR" 2>/dev/null || return 1; fi
}
sum() { (cd "$1" && for f in $FILES; do [ -f "data/$f" ] && sha256sum "data/$f"; done) | sha256sum | cut -c1-16; }
copy_in() { mkdir -p "$DIR/data"; for f in $FILES; do [ -f "$ROOT/data/$f" ] && cp "$ROOT/data/$f" "$DIR/data/$f"; done; true; }
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
    copy_in; printf '# Connection check\n\nLast successful check from the public Stock-2 repository: %s\n' "$(date -u +%FT%RZ)" > "$DIR/CONNECTION-CHECK.md"
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
    copy_in; commit_push "mirror $(date -u +%FT%RZ)" && sum "$ROOT" > "$DIR/.mirrored"; exit 0 ;;
  pull)
    open || { say "Error: cannot read the private repository; stopping so nothing runs without your holdings"; exit 1; }
    [ -f "$DIR/data/my-positions.json" ] || { say "Error: the private repository has no data/my-positions.json; stopping"; exit 1; }
    k=0; for f in $FILES; do [ -f "$DIR/data/$f" ] && cp "$DIR/data/$f" "$ROOT/data/$f" && k=$((k+1)); done; say "pulled $k files" ;;
  push)
    [ -d "$DIR/.git" ] || { say "Error: push without pull"; exit 1; }
    copy_in; ( cd "$DIR" && SAVE_SLEEP=${SAVE_SLEEP:-5} bash "$ROOT/.github/save-data.sh" "bot $(date -u +%FT%RZ)" ) | sed 's/^/private data: /' ;;
  *) echo "usage: private-data.sh check|mirror|pull|push"; exit 2 ;;
esac
