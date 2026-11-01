#!/bin/bash
cd "$1"; export TMPDIR="$3"; mkdir -p "$TMPDIR"; n=0; f=0; fl=""; : > "$2.cases"
for t in test/*.test.mjs tests/*.test.mjs; do [ -f "$t" ] || continue; n=$((n+1)); if ! timeout 600 node --test "$t" > "$TMPDIR/out" 2>&1; then f=$((f+1)); fl="$fl $t"; fi; grep -hE '^# (pass|fail|skipped) ' "$TMPDIR/out" | tr '\n' ' ' >> "$2.cases"; echo >> "$2.cases"; done
echo "$1 files=$n failed=$f :$fl" > "$2"
