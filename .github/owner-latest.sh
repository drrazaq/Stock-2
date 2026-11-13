#!/usr/bin/env bash
# owner-latest.sh FILE OUT (P0 Route A, Codex 6851558974): write the AUTHORITATIVE latest copy of one owner file (data/FILE) to OUT; never
# print it. Private mode (.github/private-data-mode): the owner's private repository, read fresh (private-data.sh latest). Otherwise this
# checkout's origin/main, fetched fresh. No local fallback is ever presented as the latest copy.
# Exit 0 = written, 2 = the file does not exist in the store, 1 = the store could not be read (the caller treats it as UNKNOWN).
set -u
ROOT=$(cd "$(dirname "$0")/.." && pwd); F=${1:-}; OUT=${2:-}
case "$F" in ''|*/*|.*) exit 1 ;; esac; [ -n "$OUT" ] || exit 1
if [ -e "$ROOT/.github/private-data-mode" ]; then exec bash "$ROOT/.github/private-data.sh" latest "$F" "$OUT"; fi
git -C "$ROOT" fetch -q origin main 2>/dev/null || exit 1
git -C "$ROOT" cat-file -e "origin/main:data/$F" 2>/dev/null || exit 2
umask 077; git -C "$ROOT" show "origin/main:data/$F" > "$OUT.tmp" 2>/dev/null && mv -f "$OUT.tmp" "$OUT" || { rm -f "$OUT.tmp"; exit 1; }
