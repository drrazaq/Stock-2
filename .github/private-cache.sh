#!/usr/bin/env bash
# private-cache.sh: owner-derived research caches live ONLY in the private store, as canonical scalar files under data/ (Codex 6856174038,
# 6856207421, 6856231228, 6856457357). Never in the public Actions cache. The cache bytes and the code that reads/writes them are unchanged:
# a job installs the private copy into the cache path the module already uses, and stages it back before its private save.
#   install-file NAME DEST   data/NAME -> DEST. Exit 3 when data/NAME is absent (UNKNOWN: the caller must not start empty or refetch).
#   stage-file SRC NAME      SRC -> data/NAME (atomic).
#   install-dir NAME DIR     data/NAME (a .tar.gz archive) -> DIR, after checking EVERY entry (regular files and directories only; no
#                            absolute path, no '..', no link or special file) and the bounds. Exit 3 when absent.
#   stage-dir DIR NAME       DIR (regular files/dirs only) -> deterministic data/NAME archive (sorted, fixed mtime/owner, gzip -n), atomic.
# Admission (Codex 6856898125): install-* first REVOKES this job's receipt for NAME, sets aside any bytes already at the module path
# (unchanged, moved outside it, never exported, staged or deleted), installs, and writes the receipt (NAME -> the exact installed path) only
# after a fully successful install. stage-* refuses (exit 1, nothing staged) unless the receipt exists and names that same path, so an
# unadmitted, legacy, partial or over-bound tree can never be promoted to canonical private history. Receipts live in
# $PRIVATE_CACHE_ADMIT_DIR, else $RUNNER_TEMP/private-cache-admitted (job-local); with neither set the helper stops.
# Bounds (stop, never truncate or prune), this archive format's own bounds, separate from the private directory bounds and any run budget:
# compressed file/archive <= 95 MiB (under GitHub's 100 MiB blob ceiling); an archive holds at most 200,000 entries and 2 GiB uncompressed.
# They are limits, not a claim that today's caches fit: a cache over them stops at custody import or at staging.
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd); MODE=${1:-}; MAXC=${PRIVATE_CACHE_MAX_BYTES:-99614720}; MAXN=${PRIVATE_CACHE_MAX_ENTRIES:-200000}; MAXU=${PRIVATE_CACHE_MAX_UNCOMPRESSED:-2147483648}
say() { echo "private cache: $*"; }
ADM=${PRIVATE_CACHE_ADMIT_DIR:-${RUNNER_TEMP:+$RUNNER_TEMP/private-cache-admitted}}
[ -n "$ADM" ] || { say "Error: no job-local admission directory (RUNNER_TEMP or PRIVATE_CACHE_ADMIT_DIR); stopping"; exit 1; }
LEG="$ADM.legacy"
abspath() { realpath -m -- "$1"; }
revoke() { mkdir -p "$ADM" && rm -f -- "$ADM/$1" && [ ! -e "$ADM/$1" ] || { say "Error: cannot revoke the admission receipt for $1; stopping"; exit 1; }; }
admit() { printf '%s\n' "$(abspath "$2")" > "$ADM/$1.tmp.$$" && mv -f "$ADM/$1.tmp.$$" "$ADM/$1" || { rm -f "$ADM/$1.tmp.$$"; say "Error: cannot record admission for $1"; exit 1; }; }
admitted() { [ -f "$ADM/$1" ] && [ "$(cat "$ADM/$1")" = "$(abspath "$2")" ] || { say "Error: $1 was not admitted by a successful install to $2 in this job; nothing staged (an unadmitted, legacy or partial cache is never promoted)"; exit 1; }; }
setaside() { # $1 NAME, $2 module path: move whatever is there, unchanged, outside the module path
  if [ -e "$2" ] || [ -L "$2" ]; then if [ -d "$2" ] && [ ! -L "$2" ] && [ -z "$(ls -A "$2")" ]; then return 0; fi
    mkdir -p "$LEG" && local t="$LEG/$1.$(date -u +%Y%m%dT%H%M%SZ).$$" && mv -- "$2" "$t" || { say "Error: cannot set aside the bytes already at $2; stopping"; exit 1; }
    say "legacy bytes found at $2 were set aside unchanged at $t (not installed over, not exported, not staged)"; fi; }
NAMEOK='^[A-Za-z0-9._-]+$'
size() { stat -c %s "$1"; }
case "$MODE" in
  install-file) N=${2:-}; D=${3:-}; [[ "$N" =~ $NAMEOK ]] && [ -n "$D" ] || { say "usage"; exit 2; }
    revoke "$N"; F="$ROOT/data/$N"; [ -f "$F" ] && [ ! -L "$F" ] || { say "UNKNOWN: the private cache $N is unavailable (custody import required); not starting empty"; exit 3; }
    [ "$(size "$F")" -le "$MAXC" ] || { say "Error: $N exceeds the bound; stopping"; exit 1; }
    setaside "$N" "$D"; mkdir -p "$(dirname "$D")" && cp "$F" "$D.tmp.$$" && mv -f "$D.tmp.$$" "$D" || { rm -f "$D.tmp.$$"; say "Error: cannot install $N"; exit 1; }
    admit "$N" "$D" ;;
  stage-file) S=${2:-}; N=${3:-}; [[ "$N" =~ $NAMEOK ]] && [ -n "$S" ] || { say "usage"; exit 2; }
    admitted "$N" "$S"
    [ -f "$S" ] && [ ! -L "$S" ] || { say "no cache file to stage for $N (nothing written)"; exit 0; }
    [ "$(size "$S")" -le "$MAXC" ] || { say "Error: $N exceeds the bound; stopping (not truncated)"; exit 1; }
    cp "$S" "$ROOT/data/$N.tmp.$$" && mv -f "$ROOT/data/$N.tmp.$$" "$ROOT/data/$N" || { say "Error: cannot stage $N"; exit 1; } ;;
  install-dir) N=${2:-}; D=${3:-}; [[ "$N" =~ $NAMEOK ]] && [ -n "$D" ] || { say "usage"; exit 2; }
    revoke "$N"; F="$ROOT/data/$N"; [ -f "$F" ] && [ ! -L "$F" ] || { say "UNKNOWN: the private cache $N is unavailable (custody import required); not starting empty"; exit 3; }
    [ "$(size "$F")" -le "$MAXC" ] || { say "Error: $N exceeds the bound; stopping"; exit 1; }
    L=$(tar -tvzf "$F" 2>/dev/null) || { say "Error: $N is not a readable archive; stopping"; exit 1; }
    n=0; u=0
    while IFS= read -r line; do [ -n "$line" ] || continue; t=${line:0:1}; [ "$t" = - ] || [ "$t" = d ] || { say "Error: $N holds a link or special entry; stopping"; exit 1; }
      p=$(echo "$line" | awk '{ $1=$2=$3=$4=$5=""; sub(/^ +/, ""); print }'); case "$p" in /*|..|../*|*/../*|*/..) say "Error: unsafe path in $N; stopping"; exit 1;; esac
      sz=$(echo "$line" | awk '{print $3}'); n=$((n+1)); u=$((u+sz)); done <<< "$L"
    [ "$n" -le "$MAXN" ] && [ "$u" -le "$MAXU" ] || { say "Error: $N is over the bound ($n entries, $u bytes); stopping"; exit 1; }
    setaside "$N" "$D"; mkdir -p "$D" && tar -xzf "$F" -C "$D" --no-same-owner --no-same-permissions || { say "Error: cannot extract $N (no admission; the partial tree is never staged)"; exit 1; }
    admit "$N" "$D" ;;
  stage-dir) S=${2:-}; N=${3:-}; [[ "$N" =~ $NAMEOK ]] && [ -n "$S" ] || { say "usage"; exit 2; }
    admitted "$N" "$S"
    [ -d "$S" ] && [ ! -L "$S" ] || { say "no cache directory to stage for $N (nothing written)"; exit 0; }
    [ -z "$(find -P "$S" ! -type f ! -type d -print -quit)" ] || { say "Error: $S holds a link or special file; stopping"; exit 1; }
    n=$(find -P "$S" | wc -l); u=$(find -P "$S" -type f -printf '%s\n' | awk '{s+=$1} END {print s+0}')
    [ "$n" -le "$MAXN" ] && [ "$u" -le "$MAXU" ] || { say "Error: $S is over the bound ($n entries, $u bytes); stopping (not pruned)"; exit 1; }
    T="$ROOT/data/$N.tmp.$$"; ( set -o pipefail; cd "$S" && find . -mindepth 1 -print0 | LC_ALL=C sort -z | tar --null --no-recursion --mtime=@0 --owner=0 --group=0 --numeric-owner -cf - -T - | gzip -n > "$T" ) || { rm -f "$T"; say "Error: cannot archive $S"; exit 1; }   # pipefail: a failed tar is never accepted
    [ "$(size "$T")" -le "$MAXC" ] || { rm -f "$T"; say "Error: $N archive exceeds the bound; stopping (not truncated)"; exit 1; }
    mv -f "$T" "$ROOT/data/$N" || { say "Error: cannot stage $N"; exit 1; } ;;
  *) echo "usage: private-cache.sh install-file NAME DEST | stage-file SRC NAME | install-dir NAME DIR | stage-dir DIR NAME"; exit 2 ;;
esac
